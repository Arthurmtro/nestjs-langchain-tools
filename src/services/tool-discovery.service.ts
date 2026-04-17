import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import {
  DiscoveryService,
  MetadataScanner,
  Reflector,
} from '@nestjs/core';
import type { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import { tool, type ToolInterface } from '@langchain/core/tools';
import { z } from 'zod';
import { TOOL_METADATA } from '../decorators/tool.decorator';
import {
  TOOL_AUTHORIZATION_METADATA,
  ToolAuthorizationMetadata,
} from '../decorators/authorize.decorator';
import type { ToolOptions } from '../interfaces/tool.interface';
import { ToolStreamService } from './tool-stream.service';
import { ToolTimeoutError, ToolTimeoutService } from './tool-timeout.service';
import {
  classValidatorToJsonSchema,
  jsonSchemaToZod,
  validateAndTransform,
  ToolInputValidationError,
} from '../schema';
import {
  TOOL_AUTHORIZER,
  ToolAuthorizer,
  ToolAuthorizationDecision,
} from '../authorization/tool-authorizer.interface';
import {
  drainGenerator,
  isAsyncGeneratorFunction,
} from '../tools/generator-tool.adapter';

export interface ToolDiscoveryOptions {
  /** Runtime context forwarded to the {@link ToolAuthorizer} (e.g. current request). */
  authorizationContext?: unknown;
}

type ToolMethod = (...args: readonly unknown[]) => unknown;
type ProviderInstance = Record<string, ToolMethod | unknown>;

interface AuthorizationCheck {
  allowed: boolean;
  reason?: string;
}

/**
 * Discovers methods decorated with `@AgentTool` on Nest-managed providers
 * and wraps them as LangChain tools. Handles class-validator DTO
 * validation, tool streaming, timeouts, and authorization.
 */
@Injectable()
export class ToolDiscoveryService {
  private readonly logger = new Logger(ToolDiscoveryService.name);

  constructor(
    private readonly discoveryService: DiscoveryService,
    private readonly metadataScanner: MetadataScanner,
    private readonly reflector: Reflector,
    @Optional() private readonly toolStreamService?: ToolStreamService,
    @Optional() private readonly toolTimeoutService?: ToolTimeoutService,
    @Optional()
    @Inject(TOOL_AUTHORIZER)
    private readonly authorizer?: ToolAuthorizer,
  ) {}

  discoverTools(options: ToolDiscoveryOptions = {}): ToolInterface[] {
    const providers = this.discoveryService.getProviders();
    const tools: ToolInterface[] = [];
    for (const wrapper of providers) {
      const instance = (wrapper as InstanceWrapper).instance;
      if (!instance) continue;
      tools.push(...this.discoverToolsForProvider(instance, options));
    }
    return tools;
  }

  discoverToolsForProvider(
    instance: unknown,
    options: ToolDiscoveryOptions = {},
  ): ToolInterface[] {
    const tools: ToolInterface[] = [];
    if (!instance || typeof instance !== 'object') return tools;
    const prototype = Object.getPrototypeOf(instance) as object | null;
    if (!prototype) return tools;

    const provider = instance as ProviderInstance;

    try {
      this.metadataScanner.scanFromPrototype(
        provider,
        prototype,
        (methodName: string) => {
          const method = provider[methodName];
          if (typeof method !== 'function') return;
          const metadata = this.reflector.get<ToolOptions | undefined>(
            TOOL_METADATA,
            method,
          );
          if (!metadata) return;

          const authMetadata = this.reflector.get<
            ToolAuthorizationMetadata | undefined
          >(TOOL_AUTHORIZATION_METADATA, method);

          try {
            const built = this.buildTool(
              provider,
              method as ToolMethod,
              metadata,
              authMetadata,
              options,
            );
            tools.push(built);
          } catch (err) {
            this.logger.error(
              `Error creating tool ${metadata.name}:`,
              (err as Error).stack,
            );
          }
        },
      );
    } catch (err) {
      this.logger.error(
        'Error scanning prototype for tools:',
        (err as Error).stack,
      );
    }
    return tools;
  }

  private buildTool(
    instance: ProviderInstance,
    method: ToolMethod,
    metadata: ToolOptions,
    authMetadata: ToolAuthorizationMetadata | undefined,
    options: ToolDiscoveryOptions,
  ): ToolInterface {
    const schema = this.resolveSchema(metadata);
    const isGenerator = isAsyncGeneratorFunction(method);

    const executor = async (input: unknown): Promise<string> => {
      const auth = await this.checkAuthorization(
        metadata.name,
        authMetadata,
        options,
      );
      if (!auth.allowed) {
        const reason = auth.reason ?? 'unauthorized';
        this.logger.warn(`Tool ${metadata.name} blocked: ${reason}`);
        return `Error: unauthorized to call ${metadata.name} (${reason})`;
      }

      let validatedInput: unknown = input;
      if (metadata.input) {
        try {
          validatedInput = await validateAndTransform(
            metadata.input,
            input,
          );
        } catch (err) {
          if (err instanceof ToolInputValidationError) {
            return `Error: invalid input for ${metadata.name}: ${err.message}`;
          }
          throw err;
        }
      }

      if (this.isStreamingEnabled(metadata)) {
        this.toolStreamService?.startToolExecution(
          metadata.name,
          this.toStreamPayload(validatedInput),
        );
      }

      try {
        const result = await this.executeWithLimits(
          metadata,
          () => this.invokeMethod(instance, method, validatedInput, isGenerator),
        );
        if (this.isStreamingEnabled(metadata)) {
          this.toolStreamService?.completeToolExecution(
            metadata.name,
            stringify(result),
          );
        }
        return stringify(result);
      } catch (err) {
        const error = err as Error;
        this.logger.error(
          `Error executing tool ${metadata.name}:`,
          error.stack,
        );
        if (this.isStreamingEnabled(metadata)) {
          this.toolStreamService?.errorToolExecution(metadata.name, error);
        }
        return `Error: ${error.message}`;
      }
    };

    // Cast the generically-parameterised DynamicStructuredTool return to the
    // project-wide ToolInterface surface. LangChain v1 + zod v4 produce a
    // narrowly-typed return; we intentionally widen here because callers
    // treat tools as a homogeneous array.
    const built = tool(executor, {
      name: metadata.name,
      description: metadata.description,
      schema,
    });
    return built as unknown as ToolInterface;
  }

  private async executeWithLimits(
    metadata: ToolOptions,
    run: () => Promise<unknown>,
  ): Promise<unknown> {
    const timeoutEnabled = this.toolTimeoutService?.isTimeoutEnabled() ?? false;
    if (!timeoutEnabled || !this.toolTimeoutService) return run();

    const timeoutConfig = this.toolTimeoutService.getToolTimeoutConfig(metadata);
    if (!timeoutConfig.enabled) return run();

    try {
      return await this.toolTimeoutService.executeWithTimeout(
        run,
        metadata.name,
        timeoutConfig.durationMs,
      );
    } catch (err) {
      if (err instanceof ToolTimeoutError) {
        return `Error: Tool execution timed out after ${timeoutConfig.durationMs}ms`;
      }
      throw err;
    }
  }

  private async invokeMethod(
    instance: ProviderInstance,
    method: ToolMethod,
    input: unknown,
    isGenerator: boolean,
  ): Promise<unknown> {
    const invoked = method.call(instance, input);
    if (isGenerator) {
      return drainGenerator(
        method.name,
        invoked as AsyncGenerator<unknown, unknown, unknown>,
      );
    }
    return invoked;
  }

  /**
   * Schema passed to LangChain's `tool()`. We derive a zod schema from
   * the class-validator DTO with **structural-only** shape (no
   * `minLength` / `min` / `max`). This gives the LLM field names and
   * types for tool-calling, while our class-validator layer — run inside
   * the executor — enforces every runtime constraint with rich error
   * messages.
   */
  private resolveSchema(metadata: ToolOptions): z.ZodTypeAny {
    if (metadata.input) {
      const json = classValidatorToJsonSchema(metadata.input, {
        includeConstraints: false,
      });
      return jsonSchemaToZod(json);
    }
    if (metadata.schema) return metadata.schema;
    return z.string();
  }

  private isStreamingEnabled(metadata: ToolOptions): boolean {
    return Boolean(
      metadata.streaming && this.toolStreamService?.isStreamingEnabled(),
    );
  }

  private toStreamPayload(input: unknown): Record<string, unknown> {
    if (input && typeof input === 'object' && !Array.isArray(input)) {
      return input as Record<string, unknown>;
    }
    return { value: input };
  }

  private async checkAuthorization(
    toolName: string,
    metadata: ToolAuthorizationMetadata | undefined,
    options: ToolDiscoveryOptions,
  ): Promise<AuthorizationCheck> {
    if (!metadata) return { allowed: true };
    if (!this.authorizer) {
      return {
        allowed: false,
        reason: `Tool "${toolName}" requires authorization, but no ToolAuthorizer is configured`,
      };
    }
    const decision: ToolAuthorizationDecision = await this.authorizer.authorize({
      toolName,
      metadata,
      runtime: options.authorizationContext,
    });
    if (typeof decision === 'boolean') return { allowed: decision };
    return decision;
  }
}

function stringify(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

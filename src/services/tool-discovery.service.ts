import { Injectable, Logger } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import { tool } from '@langchain/core/tools';
import { ToolInterface } from '@langchain/core/tools';
import { TOOL_METADATA } from '../decorators/tool.decorator';
import { ToolOptions } from '../interfaces/tool.interface';

/**
 * Service responsible for discovering and creating LangChain tools from decorated methods
 */
@Injectable()
export class ToolDiscoveryService {
  private readonly logger = new Logger(ToolDiscoveryService.name);

  constructor(
    private readonly discoveryService: DiscoveryService,
    private readonly metadataScanner: MetadataScanner,
    private readonly reflector: Reflector,
  ) {}

  /**
   * Discovers all tool methods across all providers
   * 
   * @returns Array of initialized LangChain tools
   */
  discoverTools(): ToolInterface[] {
    this.logger.log('Discovering all tools...');
    const providers = this.discoveryService.getProviders();
    const tools: ToolInterface[] = [];

    providers.forEach((wrapper: InstanceWrapper) => {
      const { instance } = wrapper;
      if (!instance) return;

      const providerTools = this.discoverToolsForProvider(instance);
      tools.push(...providerTools);
    });

    this.logger.log(`Discovered ${tools.length} tools total`);
    return tools;
  }

  /**
   * Discovers tool methods in a specific provider instance
   * 
   * @param instance - Provider instance to scan for tools
   * @returns Array of initialized LangChain tools
   */
  discoverToolsForProvider(instance: unknown): ToolInterface[] {
    const tools: ToolInterface[] = [];
    const prototype = Object.getPrototypeOf(instance);

    if (!prototype) {
      this.logger.warn(`No prototype found for instance: ${
        (instance as any)?.constructor?.name || 'unknown'
      }`);
      return tools;
    }

    try {
      this.metadataScanner.scanFromPrototype(
        instance,
        prototype,
        (methodName: string) => {
          const method = (instance as Record<string, Function>)[methodName];
          if (!method) return;

          const toolMetadata: ToolOptions | undefined = this.reflector.get(
            TOOL_METADATA,
            method,
          );

          if (toolMetadata) {
            try {
              this.logger.debug(`Creating tool: ${toolMetadata.name}`);
              const toolFn = tool(
                async (input: unknown) => {
                  try {
                    return await method.call(instance, input);
                  } catch (error) {
                    const err = error as Error;
                    this.logger.error(
                      `Error executing tool ${toolMetadata.name}:`, 
                      err.stack
                    );
                    return `Error: ${err.message}`;
                  }
                },
                {
                  name: toolMetadata.name,
                  description: toolMetadata.description,
                  schema: toolMetadata.schema,
                },
              );

              tools.push(toolFn);
              this.logger.debug(`Tool ${toolMetadata.name} created successfully`);
            } catch (error) {
              const err = error as Error;
              this.logger.error(
                `Error creating tool ${toolMetadata.name}:`, 
                err.stack
              );
            }
          }
        },
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Error scanning prototype for tools:`, err.stack);
    }

    return tools;
  }
}
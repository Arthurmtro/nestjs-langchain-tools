import { DynamicModule, Module, Provider } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import {
  ASYNC_OPTIONS_TYPE,
  ConfigurableModuleClass,
  MODULE_OPTIONS_TOKEN,
  OPTIONS_TYPE,
} from '../config/configurable-module';
import {
  LangChainToolsModuleOptions,
  validateModuleOptions,
} from '../config/module-options';
import {
  DEFAULT_LLM_FACTORY,
  LLM_FACTORY,
} from '../llm/llm-factory.provider';
import {
  DEFAULT_TOOL_AUTHORIZER,
  TOOL_AUTHORIZER,
} from '../authorization/tool-authorizer.provider';
import {
  InMemorySessionStore,
} from '../memory/in-memory-session-store';
import { SESSION_STORE } from '../memory/session-store.interface';
import {
  DEFAULT_VECTOR_STORE,
  VECTOR_STORE,
} from '../vector-stores/vector-store.provider';
import { AgentDiscoveryService } from '../services/agent-discovery.service';
import { MemoryService } from '../services/memory.service';
import { ToolDiscoveryService } from '../services/tool-discovery.service';
import { ToolStreamService } from '../services/tool-stream.service';
import { ToolTimeoutService } from '../services/tool-timeout.service';
import { VectorStoreService } from '../services/vector-store.service';
import { TokenUsageService } from '../observability/token-usage.service';
import { TokenUsageCallback } from '../observability/token-usage-callback';
import { createLangSmithTracer } from '../observability/langsmith-auto-wire';
import { LangChainHealthIndicator } from '../health/langchain-health.indicator';
import { GraphCoordinatorService } from '../graph/graph-coordinator.service';
import type { LlmFactory, LlmFactoryContext } from '../llm/llm-factory.interface';

/**
 * Backward-compatible alias for the options injection token.
 * New code should import {@link MODULE_OPTIONS_TOKEN}.
 */
export const LANGCHAIN_TOOLS_OPTIONS = MODULE_OPTIONS_TOKEN;

const coreServices: Provider[] = [
  ToolDiscoveryService,
  AgentDiscoveryService,
  GraphCoordinatorService,
  MemoryService,
  VectorStoreService,
  ToolStreamService,
  ToolTimeoutService,
  TokenUsageService,
  LangChainHealthIndicator,
];

/**
 * Returns an {@link LlmFactory} that:
 * 1. Delegates to the user-supplied factory (or the built-in defaults)
 * 2. Merges auto-wired observability callbacks (LangSmith tracer +
 *    TokenUsageCallback) into every resolved model
 *
 * The resulting factory is transparent — user factories don't need to know
 * or care about observability to get it.
 */
function buildLlmFactory(
  options: LangChainToolsModuleOptions,
  tokenUsage: TokenUsageService,
): LlmFactory {
  const userFactory = options.llmFactory ?? DEFAULT_LLM_FACTORY;
  return async (ctx: LlmFactoryContext) => {
    const tracer = await createLangSmithTracer();
    const agentTag = ctx.agentOptions?.name ?? ctx.purpose;
    const callbacks = [
      ...(ctx.callbacks ?? []),
      new TokenUsageCallback(tokenUsage, agentTag, ctx.modelName),
      ...(tracer ? [tracer] : []),
    ];
    return userFactory({ ...ctx, callbacks });
  };
}

const infrastructureProviders: Provider[] = [
  {
    provide: LLM_FACTORY,
    useFactory: (
      options: LangChainToolsModuleOptions,
      tokenUsage: TokenUsageService,
    ) => buildLlmFactory(options, tokenUsage),
    inject: [MODULE_OPTIONS_TOKEN, TokenUsageService],
  },
  {
    provide: TOOL_AUTHORIZER,
    useFactory: (options: LangChainToolsModuleOptions) =>
      options.toolAuthorizer ?? DEFAULT_TOOL_AUTHORIZER,
    inject: [MODULE_OPTIONS_TOKEN],
  },
  {
    provide: SESSION_STORE,
    useFactory: (options: LangChainToolsModuleOptions) =>
      options.sessionStore ??
      new InMemorySessionStore({
        maxMessages: options.maxMessagesPerSession,
        ttlMs: options.sessionTtlMs,
      }),
    inject: [MODULE_OPTIONS_TOKEN],
  },
  {
    provide: VECTOR_STORE,
    useFactory: (options: LangChainToolsModuleOptions) =>
      DEFAULT_VECTOR_STORE(options),
    inject: [MODULE_OPTIONS_TOKEN],
  },
];

/**
 * NestJS module for integrating LangChain agents, tools, RAG and streaming.
 *
 * Use `forRoot(options)` for synchronous configuration, `forRootAsync({...})`
 * to resolve options from a ConfigService, factory, or class. Options are
 * validated with class-validator at boot — misconfiguration fails fast with
 * a {@link ModuleOptionsValidationError}.
 *
 * @example
 * ```typescript
 * @Module({
 *   imports: [
 *     LangChainToolsModule.forRootAsync({
 *       imports: [ConfigModule],
 *       inject: [ConfigService],
 *       useFactory: (cfg: ConfigService) => ({
 *         coordinatorModel: cfg.getOrThrow('LLM_MODEL'),
 *         coordinatorProvider: ModelProvider.ANTHROPIC,
 *         coordinatorUseMemory: true,
 *       }),
 *     }),
 *   ],
 * })
 * export class AppModule {}
 * ```
 */
@Module({
  imports: [DiscoveryModule],
  providers: [...infrastructureProviders, ...coreServices],
  exports: [
    ...coreServices,
    LLM_FACTORY,
    TOOL_AUTHORIZER,
    SESSION_STORE,
    VECTOR_STORE,
  ],
})
export class LangChainToolsModule extends ConfigurableModuleClass {
  /**
   * Synchronous configuration. Options are validated immediately.
   */
  static forRoot(options: typeof OPTIONS_TYPE = {}): DynamicModule {
    const validated = validateModuleOptions(options);
    return super.forRoot(validated);
  }

  /**
   * Asynchronous configuration. Options are validated after the factory
   * resolves them — ideal for pulling config from ConfigService/Vault/etc.
   */
  static forRootAsync(options: typeof ASYNC_OPTIONS_TYPE): DynamicModule {
    const dynamicModule = super.forRootAsync(options);
    // Wrap the options provider so validation runs after async resolution.
    dynamicModule.providers = (dynamicModule.providers ?? []).map((provider) => {
      if (
        typeof provider === 'object' &&
        provider !== null &&
        'provide' in provider &&
        provider.provide === MODULE_OPTIONS_TOKEN &&
        'useFactory' in provider &&
        typeof provider.useFactory === 'function'
      ) {
        const originalFactory = provider.useFactory;
        return {
          ...provider,
          useFactory: async (...args: unknown[]) => {
            const resolved = await originalFactory(...args);
            return validateModuleOptions(resolved);
          },
        };
      }
      return provider;
    });
    return dynamicModule;
  }

  /**
   * Back-compat shim for the `forFeature()` API. Feature modules don't need
   * to re-declare options — the module is global by default.
   */
  static forFeature(): DynamicModule {
    return {
      module: LangChainToolsModule,
    };
  }
}

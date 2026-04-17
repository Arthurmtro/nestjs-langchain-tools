import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { BaseCallbackHandler } from '@langchain/core/callbacks/base';

/* Type-only imports: zero runtime cost, erased by the compiler. The actual
 * module code is loaded lazily via `requireExport()` below, so these
 * providers stay optional peer dependencies.
 */
import type { ChatOpenAI } from '@langchain/openai';
import type { ChatAnthropic } from '@langchain/anthropic';
import type { ChatMistralAI } from '@langchain/mistralai';
import type { ChatOllama } from '@langchain/ollama';

import {
  AgentOptions,
  AnthropicAgentOptions,
  CustomModelAgentOptions,
  GrokAgentOptions,
  LlamaAgentOptions,
  MistralAgentOptions,
  ModelProvider,
  OpenAIAgentOptions,
} from '../interfaces/agent.interface';
import type { LlmFactory, LlmFactoryContext } from './llm-factory.interface';

/** DI token for {@link LlmFactory}. */
export const LLM_FACTORY: unique symbol = Symbol('LANGCHAIN_LLM_FACTORY');

const DEFAULT_MODEL_NAMES: Record<ModelProvider, string | undefined> = {
  [ModelProvider.OPENAI]: 'gpt-4o',
  [ModelProvider.ANTHROPIC]: 'claude-3-7-sonnet-latest',
  [ModelProvider.MISTRAL]: 'mistral-large-latest',
  [ModelProvider.LLAMA]: 'llama3.1',
  [ModelProvider.GROK]: 'grok-4',
  [ModelProvider.CUSTOM]: undefined,
};

const XAI_DEFAULT_BASE_URL = 'https://api.x.ai/v1';

/** Callback handler surface we use — a narrower view of {@link BaseCallbackHandler}. */
export interface TokenCallback {
  handleLLMNewToken(token: string): void;
}

function buildTokenCallbacks(
  ctx: LlmFactoryContext,
): TokenCallback[] | undefined {
  if (!ctx.streaming || !ctx.onToken) return undefined;
  return [
    {
      handleLLMNewToken(token: string): void {
        ctx.onToken?.(token);
      },
    },
  ];
}

/**
 * Constructor shape for a provider SDK class. LangChain's ChatModel classes
 * all share this constructor contract — accepting a fields object and
 * producing a `BaseChatModel` subclass instance.
 */
type ChatModelCtor<TFields, TInstance extends BaseChatModel> = new (
  fields: TFields,
) => TInstance;

/**
 * Lazily loads a named export from an optional peer dependency. Throws a
 * descriptive error when the module is not installed, with the single
 * `as` cast of the entire file — every caller is fully typed afterwards.
 */
function requireExport<T>(
  moduleName: string,
  exportName: string,
  providerLabel: string,
): T {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(moduleName) as Record<string, unknown>;
    const value = mod[exportName];
    if (value === undefined) {
      throw new Error(`Export "${exportName}" not found in "${moduleName}"`);
    }
    return value as T;
  } catch (err) {
    throw new Error(
      `Provider "${providerLabel}" requires "${moduleName}" to be installed. ` +
        `Run: pnpm add ${moduleName}. Original error: ${(err as Error).message}`,
    );
  }
}

/* Typed SDK loaders. Each returns a fully-typed constructor — callers just
 * `new Loader(...)` and get an instance with the real SDK's interface.
 */
type OpenAICtor = ChatModelCtor<
  ConstructorParameters<typeof ChatOpenAI>[0],
  ChatOpenAI
>;
type AnthropicCtor = ChatModelCtor<
  ConstructorParameters<typeof ChatAnthropic>[0],
  ChatAnthropic
>;
type MistralCtor = ChatModelCtor<
  ConstructorParameters<typeof ChatMistralAI>[0],
  ChatMistralAI
>;
type OllamaCtor = ChatModelCtor<
  ConstructorParameters<typeof ChatOllama>[0],
  ChatOllama
>;

const loadOpenAI = (): OpenAICtor =>
  requireExport<OpenAICtor>('@langchain/openai', 'ChatOpenAI', 'OpenAI');
const loadAnthropic = (): AnthropicCtor =>
  requireExport<AnthropicCtor>('@langchain/anthropic', 'ChatAnthropic', 'Anthropic');
const loadMistral = (): MistralCtor =>
  requireExport<MistralCtor>('@langchain/mistralai', 'ChatMistralAI', 'Mistral');
const loadOllama = (): OllamaCtor =>
  requireExport<OllamaCtor>('@langchain/ollama', 'ChatOllama', 'Ollama');

/**
 * Default LLM factory. Maps provider + options to a concrete LangChain
 * chat model. Provider SDKs are loaded lazily — consumers only pay for
 * the providers they actually use.
 */
export const DEFAULT_LLM_FACTORY: LlmFactory = (
  ctx: LlmFactoryContext,
): BaseChatModel => {
  const provider = ctx.provider ?? ModelProvider.OPENAI;
  const modelName = ctx.modelName ?? DEFAULT_MODEL_NAMES[provider];
  const temperature = ctx.temperature ?? 0;
  const callbacks = buildTokenCallbacks(ctx);
  const providerOpts = ctx.providerOptions ?? {};
  const streaming = ctx.streaming ?? false;

  switch (provider) {
    case ModelProvider.OPENAI: {
      const options = (ctx.agentOptions ?? {}) as OpenAIAgentOptions;
      const apiUrl =
        (providerOpts.apiUrl as string | undefined) ?? options.apiUrl;
      const Ctor = loadOpenAI();
      return new Ctor({
        model: modelName,
        temperature,
        apiKey: (providerOpts.apiKey as string | undefined) ?? options.apiKey,
        configuration: apiUrl ? { baseURL: apiUrl } : undefined,
        streaming,
        callbacks: callbacks as BaseCallbackHandler[] | undefined,
      });
    }
    case ModelProvider.ANTHROPIC: {
      const options = (ctx.agentOptions ?? {}) as AnthropicAgentOptions;
      const Ctor = loadAnthropic();
      return new Ctor({
        model: modelName,
        temperature,
        apiKey:
          (providerOpts.apiKey as string | undefined) ?? options.apiKey,
        streaming,
        callbacks: callbacks as BaseCallbackHandler[] | undefined,
      });
    }
    case ModelProvider.MISTRAL: {
      const options = (ctx.agentOptions ?? {}) as MistralAgentOptions;
      const Ctor = loadMistral();
      return new Ctor({
        model: modelName,
        temperature,
        apiKey: (providerOpts.apiKey as string | undefined) ?? options.apiKey,
        streaming,
        callbacks: callbacks as BaseCallbackHandler[] | undefined,
      });
    }
    case ModelProvider.LLAMA: {
      const options = (ctx.agentOptions ?? {}) as LlamaAgentOptions;
      const contextSize =
        (providerOpts.contextSize as number | undefined) ?? options.contextSize;
      const Ctor = loadOllama();
      return new Ctor({
        model: options.modelPath ?? modelName ?? 'llama3.1',
        temperature,
        ...(contextSize ? { numCtx: contextSize } : {}),
        streaming,
        callbacks: callbacks as BaseCallbackHandler[] | undefined,
      });
    }
    case ModelProvider.GROK: {
      const options = (ctx.agentOptions ?? {}) as GrokAgentOptions;
      const apiKey =
        (providerOpts.apiKey as string | undefined) ??
        options.apiKey ??
        process.env.XAI_API_KEY ??
        process.env.GROK_API_KEY;
      const baseURL =
        (providerOpts.apiUrl as string | undefined) ??
        options.apiUrl ??
        XAI_DEFAULT_BASE_URL;
      const Ctor = loadOpenAI();
      return new Ctor({
        model: modelName,
        temperature,
        apiKey,
        configuration: { baseURL },
        streaming,
        callbacks: callbacks as BaseCallbackHandler[] | undefined,
      });
    }
    case ModelProvider.CUSTOM: {
      const options = (ctx.agentOptions ?? {}) as CustomModelAgentOptions;
      if (!options.modelProvider) {
        throw new Error(
          `Custom model provider not supplied for purpose=${ctx.purpose}`,
        );
      }
      return options.modelProvider;
    }
  }
};

/**
 * Resolves a chat model via a user-supplied factory, falling back to
 * {@link DEFAULT_LLM_FACTORY} when the custom factory returns nullish.
 *
 * When `ctx.callbacks` is populated (typically by the module's
 * observability auto-wiring), the handlers are merged onto the resolved
 * model so tracing and token-usage metrics apply to every invocation
 * without the user factory having to thread them through manually.
 */
export async function resolveLlm(
  factory: LlmFactory,
  ctx: LlmFactoryContext,
): Promise<BaseChatModel> {
  const maybe = await factory(ctx);
  const model = maybe ?? (await DEFAULT_LLM_FACTORY(ctx));
  if (!model) {
    throw new Error(
      `LLM factory did not return a model for provider=${ctx.provider}`,
    );
  }
  const extraCallbacks = ctx.callbacks;
  if (Array.isArray(extraCallbacks) && extraCallbacks.length > 0) {
    const existing = model.callbacks;
    model.callbacks = [
      ...(Array.isArray(existing) ? existing : []),
      ...(extraCallbacks as BaseCallbackHandler[]),
    ];
  }
  return model;
}

/**
 * Flat view of all provider-specific fields. Each field is optional —
 * providers that don't use it simply leave it undefined.
 */
interface CommonAgentFields {
  modelName?: string;
  apiKey?: string;
  apiUrl?: string;
  contextSize?: number;
  modelPath?: string;
}

/** Convenience helper: derives an {@link LlmFactoryContext} from an agent's options. */
export function contextForAgent(options: AgentOptions): LlmFactoryContext {
  const fields = options as CommonAgentFields;
  return {
    purpose: 'agent',
    agentOptions: options,
    provider: options.modelType ?? ModelProvider.OPENAI,
    modelName: fields.modelName,
    temperature: options.temperature,
    streaming: options.streaming,
    onToken: options.onToken,
    providerOptions: {
      apiKey: fields.apiKey,
      apiUrl: fields.apiUrl,
      contextSize: fields.contextSize,
    },
  };
}

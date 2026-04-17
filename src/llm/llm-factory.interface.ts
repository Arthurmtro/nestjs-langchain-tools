import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import type { AgentOptions, ModelProvider } from '../interfaces/agent.interface';

/**
 * Context passed to an {@link LlmFactory} when a model instance is required.
 */
export interface LlmFactoryContext {
  /** Purpose for which the model is requested */
  purpose: 'agent' | 'coordinator' | 'embedding' | 'custom';
  /** Full agent options when building an agent model */
  agentOptions?: AgentOptions;
  /** Requested provider (defaults to OpenAI) */
  provider: ModelProvider;
  /** Requested model name (provider-specific default applied when omitted) */
  modelName?: string;
  /** Temperature */
  temperature?: number;
  /** Whether streaming should be enabled */
  streaming?: boolean;
  /** Per-token callback (only used when streaming is enabled) */
  onToken?: (token: string) => void;
  /** Free-form provider options (apiKey, baseURL, contextSize, ...) */
  providerOptions?: Record<string, unknown>;
  /**
   * Callback handlers the module wants attached to every LLM call. Populated
   * by the observability auto-wiring (LangSmith tracer + TokenUsageCallback).
   * User factories don't need to look at this — {@link resolveLlm} merges
   * these onto the returned model automatically.
   */
  callbacks?: BaseCallbackHandler[];
}

/**
 * Creates a {@link BaseChatModel} for a given request.
 *
 * Implementations are free to delegate to the default factory, wrap models
 * with instrumentation, or return entirely custom providers (Bedrock, Groq,
 * Vertex, etc.). Returning `null` / `undefined` is treated as "not handled"
 * and the default factory takes over.
 */
export type LlmFactory = (
  ctx: LlmFactoryContext,
) => BaseChatModel | null | undefined | Promise<BaseChatModel | null | undefined>;

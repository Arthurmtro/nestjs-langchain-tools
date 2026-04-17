/**
 * NestJS LangChain Tools
 *
 * A NestJS module for LangChain agents, tools, RAG and streaming, with
 * class-validator-native tool schemas.
 */

// Decorators
export * from './decorators';

// Module
export * from './modules/langchain-tools.module';

// Config
export * from './config';

// Services
export * from './services/tool-discovery.service';
export * from './services/agent-discovery.service';
export * from './services/memory.service';
export * from './services/vector-store.service';
export * from './services/tool-stream.service';
export * from './services/tool-timeout.service';

// LLM factory
export * from './llm/llm-factory.interface';
export {
  LLM_FACTORY,
  DEFAULT_LLM_FACTORY,
  resolveLlm,
  contextForAgent,
} from './llm/llm-factory.provider';

// Authorization
export * from './authorization/tool-authorizer.interface';
export { DEFAULT_TOOL_AUTHORIZER } from './authorization/tool-authorizer.provider';

// Memory / session stores
export * from './memory/session-store.interface';
export { InMemorySessionStore } from './memory/in-memory-session-store';
export type { InMemorySessionStoreOptions } from './memory/in-memory-session-store';

// Vector stores
export * from './vector-stores/vector-store.interface';
export {
  VECTOR_STORE,
  DEFAULT_VECTOR_STORE,
} from './vector-stores/vector-store.provider';
export { InMemoryVectorStore } from './vector-stores/in-memory.vector-store';
export type { InMemoryVectorStoreOptions } from './vector-stores/in-memory.vector-store';
export {
  DeterministicHashEmbeddings,
  cosineSimilarity,
} from './vector-stores/embeddings';
export type { EmbeddingsLike } from './vector-stores/embeddings';

// Schema utilities (class-validator ↔ JSON Schema)
export * from './schema';

// Observability
export * from './observability';
export {
  langSmithEnabled,
  createLangSmithTracer,
} from './observability/langsmith-auto-wire';
export { DEFAULT_PRICING, computeCost } from './observability/pricing';
export type { ModelPricing, CostBreakdown } from './observability/pricing';

// Graph (LangGraph-first coordinator)
export {
  GraphCoordinatorService,
  mapStreamEvent,
  buildSupervisor,
  createDefaultCheckpointSaver,
  graphConfig,
} from './graph';
export type {
  GraphProcessOptions,
  CoordinatorStreamEvent,
  TokenEvent,
  ToolStartEvent,
  ToolEndEvent,
  ToolProgressEvent,
  AgentHandoffEvent,
  InterruptEvent,
  CompleteEvent,
  ErrorEvent,
  BuiltSupervisor,
  BuildSupervisorParams,
} from './graph';

// HTTP helpers
export {
  LangChainChatController,
  ChatRequestBody,
  ServerSentEvent,
} from './http';

// Resilience
export {
  withRetry,
  defaultRetryable,
  DEFAULT_RETRY_POLICY,
} from './resilience';
export type { RetryPolicy, RetryableCheck } from './resilience';

// Tool adapters
export {
  drainGenerator,
  isAsyncGeneratorFunction,
} from './tools/generator-tool.adapter';

// Interfaces / types
export * from './interfaces';

// Constants
export * from './constants';

// Utilities
export * from './utils';

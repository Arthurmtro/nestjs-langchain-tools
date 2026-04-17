import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { ToolInterface } from '@langchain/core/tools';

/**
 * Supported model providers
 */
export enum ModelProvider {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  MISTRAL = 'mistral',
  LLAMA = 'llama',
  GROK = 'grok',
  CUSTOM = 'custom',
}

/**
 * Supported agent types
 */
export enum AgentType {
  OPENAPI = 'openapi',
  JSON = 'json',
  REACT = 'react',
  STRUCTURED = 'structured',
  TOOL_CALLING = 'toolcalling',
  LANGGRAPH = 'langgraph',
  CUSTOM = 'custom',
}

/**
 * Options for retrieval augmentation 
 */
export interface RetrievalOptions {
  /** Whether to enable retrieval augmentation for this agent */
  enabled: boolean;
  
  /** Vector store collection/index to use for this agent */
  collectionName?: string;
  
  /** Number of documents to retrieve per query */
  topK?: number;
  
  /** Similarity threshold for retrieved documents */
  scoreThreshold?: number;
  
  /** Whether to include document metadata in prompt */
  includeMetadata?: boolean;
  
  /** Custom template for formatting retrieved documents */
  documentTemplate?: string;
  
  /** Whether to add retrieved content to chat memory */
  storeRetrievedContext?: boolean;
}

/**
 * Base configuration for all agent types
 */
export interface BaseAgentOptions {
  name: string;
  description: string;
  systemPrompt: string;
  modelType?: ModelProvider;
  agentType?: AgentType;
  temperature?: number;
  returnIntermediateSteps?: boolean;
  handleParsingErrors?: boolean | string;
  handleParsingErrorMessage?: string;
  useMemory?: boolean;
  streaming?: boolean;
  onToken?: (token: string) => void;
  retrieval?: RetrievalOptions;
}

/**
 * Configuration specific to OpenAI models
 */
export interface OpenAIAgentOptions extends BaseAgentOptions {
  modelType?: ModelProvider.OPENAI;
  modelName?: string;
  apiKey?: string;
  apiUrl?: string;
}

/**
 * Configuration specific to Anthropic models
 */
export interface AnthropicAgentOptions extends BaseAgentOptions {
  modelType: ModelProvider.ANTHROPIC;
  modelName?: string;
  apiKey?: string;
}

/**
 * Configuration specific to Llama/Ollama models
 */
export interface LlamaAgentOptions extends BaseAgentOptions {
  modelType: ModelProvider.LLAMA;
  modelPath: string;
  contextSize?: number;
}

/**
 * Configuration specific to Mistral models
 */
export interface MistralAgentOptions extends BaseAgentOptions {
  modelType: ModelProvider.MISTRAL;
  modelName?: string;
  apiKey?: string;
}

/**
 * Configuration specific to xAI Grok models.
 *
 * Grok exposes an OpenAI-compatible endpoint at `https://api.x.ai/v1` so
 * under the hood we drive `ChatOpenAI` with the xAI `baseURL`. Set
 * `XAI_API_KEY` in the environment or pass `apiKey` explicitly.
 */
export interface GrokAgentOptions extends BaseAgentOptions {
  modelType: ModelProvider.GROK;
  /** Model name (e.g. `"grok-4"`, `"grok-4-mini"`, `"grok-3"`). */
  modelName?: string;
  /** xAI API key (falls back to `XAI_API_KEY` / `GROK_API_KEY` env var). */
  apiKey?: string;
  /** Override the xAI base URL (defaults to `https://api.x.ai/v1`). */
  apiUrl?: string;
}

/**
 * Configuration for custom model providers
 */
export interface CustomModelAgentOptions extends BaseAgentOptions {
  modelType: ModelProvider.CUSTOM;
  modelProvider: BaseChatModel;
  customAgentGenerator?: (
    model: BaseChatModel, 
    tools: ToolInterface[], 
    prompt: unknown
  ) => Promise<unknown>;
}

/**
 * Union type of all possible agent configurations
 */
export type AgentOptions =
  | OpenAIAgentOptions
  | AnthropicAgentOptions
  | LlamaAgentOptions
  | MistralAgentOptions
  | GrokAgentOptions
  | CustomModelAgentOptions;

/**
 * Information about a discovered agent — tools it owns and the options it
 * was declared with. The graph coordinator combines these (and any extras)
 * into a single LangGraph `createReactAgent` call.
 */
export interface AgentInfo {
  name: string;
  description: string;
  options: AgentOptions;
  tools: ToolInterface[];
}
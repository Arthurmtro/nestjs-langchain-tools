import { AgentExecutor } from 'langchain/agents';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ToolInterface } from '@langchain/core/tools';

/**
 * Supported model providers
 */
export enum ModelProvider {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  MISTRAL = 'mistral',
  LLAMA = 'llama',
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
  | CustomModelAgentOptions;

/**
 * Information about an initialized agent
 */
export interface AgentInfo {
  name: string;
  description: string;
  executor: AgentExecutor;
}
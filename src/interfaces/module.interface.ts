import { ModelProvider } from './agent.interface';
import { VectorStoreOptions } from './vector-store.interface';

/**
 * Configuration options for the LangChainTools module
 */
export interface LangChainToolsModuleOptions {
  /** System prompt used by the coordinator agent */
  coordinatorPrompt?: string;
  
  /** The model to use for the coordinator */
  coordinatorModel?: string;
  
  /** The provider to use for the coordinator */
  coordinatorProvider?: ModelProvider;
  
  /** Whether to enable memory for the coordinator */
  coordinatorUseMemory?: boolean;
  
  /** Temperature setting for the coordinator agent */
  coordinatorTemperature?: number;
  
  /** Whether to enable streaming by default */
  enableStreaming?: boolean;
  
  /** Callback function when a new token is streamed */
  onToken?: (token: string) => void;
  
  /** Vector store configuration for RAG capabilities */
  vectorStore?: VectorStoreOptions;
  
  /** Embedding model to use for document vectorization */
  embeddingModel?: string;
}
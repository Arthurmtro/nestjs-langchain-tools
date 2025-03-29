import { ModelProvider } from './agent.interface';
import { Document } from '@langchain/core/documents';

/**
 * Supported vector store types
 */
export enum VectorStoreType {
  MEMORY = 'memory',
  PINECONE = 'pinecone',
  CHROMA = 'chroma',
  FAISS = 'faiss',
  QDRANT = 'qdrant',
  CUSTOM = 'custom',
}

/**
 * Base configuration for vector stores
 */
export interface BaseVectorStoreOptions {
  /** Type of vector store to use */
  type: VectorStoreType;
  
  /** Collection/index name for the vector store */
  collectionName?: string;
  
  /** Embedding model name (if not using the global setting) */
  embeddingModel?: string;
  
  /** Embedding model provider (defaults to OpenAI) */
  embeddingProvider?: ModelProvider;
}

/**
 * Configuration for in-memory vector store
 */
export interface MemoryVectorStoreOptions extends BaseVectorStoreOptions {
  type: VectorStoreType.MEMORY;
}

/**
 * Configuration for Pinecone vector store
 */
export interface PineconeVectorStoreOptions extends BaseVectorStoreOptions {
  type: VectorStoreType.PINECONE;
  /** Pinecone API key */
  apiKey: string;
  /** Pinecone environment */
  environment: string;
  /** Pinecone index name */
  indexName: string;
  /** Pinecone namespace (optional) */
  namespace?: string;
}

/**
 * Configuration for Chroma vector store
 */
export interface ChromaVectorStoreOptions extends BaseVectorStoreOptions {
  type: VectorStoreType.CHROMA;
  /** Chroma server URL */
  url: string;
  /** Collection name */
  collectionName: string;
}

/**
 * Configuration for FAISS vector store
 */
export interface FaissVectorStoreOptions extends BaseVectorStoreOptions {
  type: VectorStoreType.FAISS;
  /** Path to store or load FAISS index */
  path: string;
  /** Allow creation of a new index if not found */
  allowCreation?: boolean;
}

/**
 * Configuration for Qdrant vector store
 */
export interface QdrantVectorStoreOptions extends BaseVectorStoreOptions {
  type: VectorStoreType.QDRANT;
  /** Qdrant server URL */
  url: string;
  /** Qdrant API key (if needed) */
  apiKey?: string;
  /** Collection name */
  collectionName: string;
}

/**
 * Configuration for custom vector store implementation
 */
export interface CustomVectorStoreOptions extends BaseVectorStoreOptions {
  type: VectorStoreType.CUSTOM;
  /** Custom factory function to create vector store */
  factory: (embeddings: any) => Promise<any>;
}

/**
 * Union type for all vector store configurations
 */
export type VectorStoreOptions = 
  | MemoryVectorStoreOptions
  | PineconeVectorStoreOptions
  | ChromaVectorStoreOptions
  | FaissVectorStoreOptions
  | QdrantVectorStoreOptions
  | CustomVectorStoreOptions;

/**
 * Document search result with metadata
 */
export interface DocumentSearchResult {
  /** The document retrieved */
  document: Document;
  /** Similarity score (0 to 1) */
  score: number;
}

/**
 * Document with vector embedding
 */
export interface EmbeddedDocument extends Document {
  /** Vector embedding of the document content */
  embedding?: number[];
}

/**
 * Document ingestion options
 */
export interface DocumentIngestionOptions {
  /** Whether to split the document into chunks */
  splitDocument?: boolean;
  /** Maximum chunk size when splitting documents */
  chunkSize?: number;
  /** Chunk overlap when splitting documents */
  chunkOverlap?: number;
  /** Metadata to add to all documents */
  metadata?: Record<string, any>;
}

/**
 * Query options for retrieving documents
 */
export interface DocumentQueryOptions {
  /** Maximum number of documents to return */
  limit?: number;
  /** Similarity threshold (0 to 1) */
  minScore?: number;
  /** Metadata filter to apply */
  filter?: Record<string, any>;
}
import type { Document } from '@langchain/core/documents';
import type {
  DocumentIngestionOptions,
  DocumentQueryOptions,
  DocumentSearchResult,
} from '../interfaces/vector-store.interface';

/**
 * Pluggable vector store contract.
 *
 * The default adapter is an in-process cosine-similarity store. Consumers
 * can supply Pinecone / Qdrant / pgvector adapters by implementing this
 * interface and wiring it via `vectorStore` in module options or by
 * providing a factory on the `CustomVectorStoreOptions`.
 */
export interface VectorStoreAdapter {
  /** Adds raw strings or Documents to a collection. Returns the count ingested. */
  addDocuments(
    documents: Document[] | string[],
    collectionName?: string,
    options?: DocumentIngestionOptions,
  ): Promise<number>;

  /** Cosine-similarity search returning top-K documents with scores in [0,1]. */
  similaritySearch(
    query: string,
    collectionName?: string,
    options?: DocumentQueryOptions,
  ): Promise<DocumentSearchResult[]>;

  /** Deletes documents matching a metadata filter. Returns true on success. */
  deleteDocuments(
    filter: Record<string, unknown>,
    collectionName?: string,
  ): Promise<boolean>;

  /** Lists known collections. Optional for stores that don't support enumeration. */
  listCollections?(): Promise<string[]>;
}

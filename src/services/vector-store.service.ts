import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { Document } from '@langchain/core/documents';
import {
  DocumentIngestionOptions,
  DocumentQueryOptions,
  DocumentSearchResult,
} from '../interfaces/vector-store.interface';
import { InMemoryVectorStore } from '../vector-stores/in-memory.vector-store';
import { VECTOR_STORE } from '../vector-stores/vector-store.provider';
import type { VectorStoreAdapter } from '../vector-stores/vector-store.interface';

/**
 * Nest service delegating to the injected {@link VectorStoreAdapter}.
 *
 * Keeps the existing method surface (addDocuments / similaritySearch /
 * createRagContext) so callers don't have to know which backend is
 * configured. Swap adapters via `vectorStore` in module options.
 */
@Injectable()
export class VectorStoreService {
  private readonly logger = new Logger(VectorStoreService.name);
  private readonly adapter: VectorStoreAdapter;

  constructor(
    @Optional() @Inject(VECTOR_STORE) adapter?: VectorStoreAdapter,
  ) {
    this.adapter = adapter ?? new InMemoryVectorStore();
  }

  async addDocuments(
    documents: Document[] | string[],
    collectionName = 'default',
    options: DocumentIngestionOptions = {},
  ): Promise<number> {
    return this.adapter.addDocuments(documents, collectionName, options);
  }

  async similaritySearch(
    query: string,
    collectionName = 'default',
    options: DocumentQueryOptions = {},
  ): Promise<DocumentSearchResult[]> {
    return this.adapter.similaritySearch(query, collectionName, options);
  }

  async createRagContext(
    query: string,
    collectionName = 'default',
    options: DocumentQueryOptions = {},
  ): Promise<string> {
    const results = await this.similaritySearch(query, collectionName, options);
    if (results.length === 0) return '';
    return results
      .map(({ document }, i) => `[Document ${i + 1}] ${document.pageContent}`)
      .join('\n\n');
  }

  async deleteDocuments(
    filter: Record<string, unknown>,
    collectionName = 'default',
  ): Promise<boolean> {
    return this.adapter.deleteDocuments(filter, collectionName);
  }
}

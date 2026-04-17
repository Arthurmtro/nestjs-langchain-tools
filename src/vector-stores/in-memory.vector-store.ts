import { Document } from '@langchain/core/documents';
import type {
  DocumentIngestionOptions,
  DocumentQueryOptions,
  DocumentSearchResult,
} from '../interfaces/vector-store.interface';
import {
  DeterministicHashEmbeddings,
  EmbeddingsLike,
  cosineSimilarity,
} from './embeddings';
import type { VectorStoreAdapter } from './vector-store.interface';

interface StoredDocument {
  document: Document;
  embedding: number[];
}

export interface InMemoryVectorStoreOptions {
  embeddings?: EmbeddingsLike;
}

/**
 * In-process vector store using cosine similarity.
 *
 * Replaces the previous mock that scored documents by keyword overlap. The
 * default embeddings are deterministic (offline) — inject an `EmbeddingsLike`
 * to use OpenAI / Cohere / VoyageAI / local models.
 */
export class InMemoryVectorStore implements VectorStoreAdapter {
  private readonly collections = new Map<string, StoredDocument[]>();
  private readonly embeddings: EmbeddingsLike;

  constructor(options: InMemoryVectorStoreOptions = {}) {
    this.embeddings = options.embeddings ?? new DeterministicHashEmbeddings();
  }

  async addDocuments(
    documents: Document[] | string[],
    collectionName = 'default',
    options: DocumentIngestionOptions = {},
  ): Promise<number> {
    const docs: Document[] = documents.map((d) =>
      typeof d === 'string'
        ? new Document({ pageContent: d, metadata: options.metadata ?? {} })
        : new Document({
            pageContent: d.pageContent,
            metadata: { ...d.metadata, ...(options.metadata ?? {}) },
          }),
    );

    const chunked = options.splitDocument
      ? this.chunkDocuments(docs, options.chunkSize ?? 1000, options.chunkOverlap ?? 100)
      : docs;

    const embeddings = await this.embeddings.embedDocuments(
      chunked.map((d) => d.pageContent),
    );

    const collection = this.collections.get(collectionName) ?? [];
    chunked.forEach((document, i) => {
      collection.push({ document, embedding: embeddings[i] });
    });
    this.collections.set(collectionName, collection);
    return chunked.length;
  }

  async similaritySearch(
    query: string,
    collectionName = 'default',
    options: DocumentQueryOptions = {},
  ): Promise<DocumentSearchResult[]> {
    const collection = this.collections.get(collectionName);
    if (!collection || collection.length === 0) return [];
    const queryEmbedding = await this.embeddings.embedQuery(query);
    const limit = options.limit ?? 4;
    const minScore = options.minScore ?? 0;

    const scored = collection
      .filter(({ document }) => this.matchesFilter(document, options.filter))
      .map(({ document, embedding }) => ({
        document,
        score: cosineSimilarity(queryEmbedding, embedding),
      }));

    return scored
      .sort((a, b) => b.score - a.score)
      .filter((r) => r.score >= minScore)
      .slice(0, limit);
  }

  async deleteDocuments(
    filter: Record<string, unknown>,
    collectionName = 'default',
  ): Promise<boolean> {
    const collection = this.collections.get(collectionName);
    if (!collection) return false;
    const remaining = collection.filter(
      ({ document }) => !this.matchesFilter(document, filter),
    );
    this.collections.set(collectionName, remaining);
    return true;
  }

  async listCollections(): Promise<string[]> {
    return Array.from(this.collections.keys());
  }

  private matchesFilter(
    document: Document,
    filter: Record<string, unknown> | undefined,
  ): boolean {
    if (!filter) return true;
    const meta = document.metadata ?? {};
    return Object.entries(filter).every(([k, v]) => meta[k] === v);
  }

  private chunkDocuments(
    docs: Document[],
    chunkSize: number,
    overlap: number,
  ): Document[] {
    if (chunkSize <= 0) return docs;
    const chunks: Document[] = [];
    for (const doc of docs) {
      const text = doc.pageContent;
      if (text.length <= chunkSize) {
        chunks.push(doc);
        continue;
      }
      let start = 0;
      while (start < text.length) {
        const end = Math.min(start + chunkSize, text.length);
        chunks.push(
          new Document({
            pageContent: text.slice(start, end),
            metadata: { ...doc.metadata, chunk: chunks.length },
          }),
        );
        if (end === text.length) break;
        start = end - overlap;
      }
    }
    return chunks;
  }
}

import { Document } from '@langchain/core/documents';
import type {
  DocumentIngestionOptions,
  DocumentQueryOptions,
  DocumentSearchResult,
} from '../../interfaces/vector-store.interface';
import type { EmbeddingsLike } from '../../vector-stores/embeddings';
import type { VectorStoreAdapter } from '../../vector-stores/vector-store.interface';

export interface QdrantPoint {
  id: string | number;
  vector: number[];
  payload?: Record<string, unknown>;
}

/**
 * Minimal surface of the `@qdrant/js-client-rest` REST client used by this
 * adapter. Implement your own if you prefer a different SDK.
 */
export interface QdrantClientLike {
  getCollections(): Promise<{ collections: Array<{ name: string }> }>;
  createCollection(
    name: string,
    config: { vectors: { size: number; distance: 'Cosine' | 'Dot' | 'Euclid' } },
  ): Promise<unknown>;
  upsert(
    collection: string,
    params: { points: QdrantPoint[]; wait?: boolean },
  ): Promise<unknown>;
  search(
    collection: string,
    params: {
      vector: number[];
      limit: number;
      score_threshold?: number;
      filter?: unknown;
      with_payload?: boolean;
    },
  ): Promise<
    Array<{ id: string | number; score: number; payload?: Record<string, unknown> }>
  >;
  delete(
    collection: string,
    params: { points?: Array<string | number>; filter?: unknown; wait?: boolean },
  ): Promise<unknown>;
}

export interface QdrantVectorStoreOptions {
  client: QdrantClientLike;
  embeddings: EmbeddingsLike;
  /** Collection used when none is specified on a method call. */
  defaultCollection?: string;
  /** Vector dimension (needed to auto-create collections). */
  vectorSize: number;
  /** Distance metric for auto-created collections. */
  distance?: 'Cosine' | 'Dot' | 'Euclid';
}

/**
 * Qdrant adapter. Bring your own `@qdrant/js-client-rest` (or any client
 * implementing {@link QdrantClientLike}) and any `EmbeddingsLike`.
 *
 * ```ts
 * import { QdrantClient } from '@qdrant/js-client-rest';
 * import { OpenAIEmbeddings } from '@langchain/openai';
 * import { QdrantVectorStore } from 'nestjs-langchain-tools/qdrant';
 *
 * new QdrantVectorStore({
 *   client: new QdrantClient({ url: process.env.QDRANT_URL }),
 *   embeddings: new OpenAIEmbeddings({ modelName: 'text-embedding-3-small' }),
 *   vectorSize: 1536,
 * })
 * ```
 */
export class QdrantVectorStore implements VectorStoreAdapter {
  constructor(private readonly options: QdrantVectorStoreOptions) {}

  async addDocuments(
    documents: Document[] | string[],
    collectionName?: string,
    options: DocumentIngestionOptions = {},
  ): Promise<number> {
    const collection = collectionName ?? this.options.defaultCollection ?? 'default';
    await this.ensureCollection(collection);

    const docs: Document[] = documents.map((d) =>
      typeof d === 'string'
        ? new Document({ pageContent: d, metadata: options.metadata ?? {} })
        : new Document({
            pageContent: d.pageContent,
            metadata: { ...d.metadata, ...(options.metadata ?? {}) },
          }),
    );

    const vectors = await this.options.embeddings.embedDocuments(
      docs.map((d) => d.pageContent),
    );

    const points: QdrantPoint[] = docs.map((doc, i) => ({
      id: cryptoRandomId(),
      vector: vectors[i],
      payload: { content: doc.pageContent, ...(doc.metadata ?? {}) },
    }));

    await this.options.client.upsert(collection, { points, wait: true });
    return points.length;
  }

  async similaritySearch(
    query: string,
    collectionName?: string,
    options: DocumentQueryOptions = {},
  ): Promise<DocumentSearchResult[]> {
    const collection =
      collectionName ?? this.options.defaultCollection ?? 'default';
    const vector = await this.options.embeddings.embedQuery(query);
    const filter = options.filter ? { must: toQdrantFilter(options.filter) } : undefined;
    const results = await this.options.client.search(collection, {
      vector,
      limit: options.limit ?? 4,
      score_threshold: options.minScore,
      filter,
      with_payload: true,
    });
    return results.map((r) => ({
      document: new Document({
        pageContent: (r.payload?.content as string) ?? '',
        metadata: stripContent(r.payload ?? {}),
      }),
      score: r.score,
    }));
  }

  async deleteDocuments(
    filter: Record<string, unknown>,
    collectionName?: string,
  ): Promise<boolean> {
    const collection =
      collectionName ?? this.options.defaultCollection ?? 'default';
    await this.options.client.delete(collection, {
      filter: { must: toQdrantFilter(filter) },
      wait: true,
    });
    return true;
  }

  async listCollections(): Promise<string[]> {
    const res = await this.options.client.getCollections();
    return res.collections.map((c) => c.name);
  }

  private async ensureCollection(name: string): Promise<void> {
    const existing = await this.listCollections();
    if (existing.includes(name)) return;
    await this.options.client.createCollection(name, {
      vectors: {
        size: this.options.vectorSize,
        distance: this.options.distance ?? 'Cosine',
      },
    });
  }
}

function cryptoRandomId(): string {
  // Qdrant accepts string or unsigned int — we use string UUIDs for clarity.
  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 10) +
    Math.random().toString(36).slice(2, 10)
  );
}

function toQdrantFilter(
  filter: Record<string, unknown>,
): Array<{ key: string; match: { value: unknown } }> {
  return Object.entries(filter).map(([key, value]) => ({
    key,
    match: { value },
  }));
}

function stripContent(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const copy = { ...payload };
  delete copy.content;
  return copy;
}

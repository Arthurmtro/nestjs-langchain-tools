import { Document } from '@langchain/core/documents';
import type {
  DocumentIngestionOptions,
  DocumentQueryOptions,
  DocumentSearchResult,
} from '../../interfaces/vector-store.interface';
import type { EmbeddingsLike } from '../../vector-stores/embeddings';
import type { VectorStoreAdapter } from '../../vector-stores/vector-store.interface';

export interface PineconeVector {
  id: string;
  values: number[];
  metadata?: Record<string, unknown>;
}

/**
 * Subset of the Pinecone `Index` handle used by this adapter — matches
 * `@pinecone-database/pinecone` v2+.
 */
export interface PineconeIndexLike {
  upsert(vectors: PineconeVector[]): Promise<unknown>;
  query(params: {
    vector: number[];
    topK: number;
    includeMetadata?: boolean;
    includeValues?: boolean;
    filter?: Record<string, unknown>;
  }): Promise<{
    matches?: Array<{
      id: string;
      score?: number;
      metadata?: Record<string, unknown>;
    }>;
  }>;
  deleteMany?(filter: Record<string, unknown>): Promise<unknown>;
  namespace?(name: string): PineconeIndexLike;
}

export interface PineconeVectorStoreOptions {
  /** Pre-configured Pinecone index handle. */
  index: PineconeIndexLike;
  embeddings: EmbeddingsLike;
  /** Namespace used when none is specified (Pinecone namespaces replace collections). */
  defaultNamespace?: string;
}

/**
 * Pinecone adapter. Bring your own pre-configured index handle from
 * `@pinecone-database/pinecone`.
 *
 * ```ts
 * import { Pinecone } from '@pinecone-database/pinecone';
 * import { OpenAIEmbeddings } from '@langchain/openai';
 * import { PineconeVectorStore } from 'nestjs-langchain-tools/pinecone';
 *
 * const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
 * const index = pc.index('my-index');
 *
 * new PineconeVectorStore({
 *   index,
 *   embeddings: new OpenAIEmbeddings({ modelName: 'text-embedding-3-small' }),
 * });
 * ```
 */
export class PineconeVectorStore implements VectorStoreAdapter {
  constructor(private readonly options: PineconeVectorStoreOptions) {}

  async addDocuments(
    documents: Document[] | string[],
    collectionName?: string,
    options: DocumentIngestionOptions = {},
  ): Promise<number> {
    const namespace = this.resolveNamespace(collectionName);
    const docs = documents.map((d) =>
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

    const points: PineconeVector[] = docs.map((doc, i) => ({
      id: randomId(),
      values: vectors[i],
      metadata: { content: doc.pageContent, ...(doc.metadata ?? {}) },
    }));

    const target = this.withNamespace(namespace);
    await target.upsert(points);
    return points.length;
  }

  async similaritySearch(
    query: string,
    collectionName?: string,
    options: DocumentQueryOptions = {},
  ): Promise<DocumentSearchResult[]> {
    const namespace = this.resolveNamespace(collectionName);
    const vector = await this.options.embeddings.embedQuery(query);
    const target = this.withNamespace(namespace);

    const filter = options.filter
      ? toPineconeFilter(options.filter)
      : undefined;
    const res = await target.query({
      vector,
      topK: options.limit ?? 4,
      includeMetadata: true,
      filter,
    });

    const matches = res.matches ?? [];
    return matches
      .map((m) => ({
        document: new Document({
          pageContent: (m.metadata?.content as string) ?? '',
          metadata: stripContent(m.metadata ?? {}),
        }),
        score: m.score ?? 0,
      }))
      .filter((r) => (options.minScore ? r.score >= options.minScore : true));
  }

  async deleteDocuments(
    filter: Record<string, unknown>,
    collectionName?: string,
  ): Promise<boolean> {
    const namespace = this.resolveNamespace(collectionName);
    const target = this.withNamespace(namespace);
    if (!target.deleteMany) return false;
    await target.deleteMany(toPineconeFilter(filter));
    return true;
  }

  private resolveNamespace(collectionName?: string): string {
    return collectionName ?? this.options.defaultNamespace ?? '';
  }

  private withNamespace(namespace: string): PineconeIndexLike {
    if (namespace && this.options.index.namespace) {
      return this.options.index.namespace(namespace);
    }
    return this.options.index;
  }
}

function randomId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function toPineconeFilter(
  filter: Record<string, unknown>,
): Record<string, unknown> {
  const pineconeFilter: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(filter)) {
    pineconeFilter[key] = { $eq: value };
  }
  return pineconeFilter;
}

function stripContent(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const copy = { ...payload };
  delete copy.content;
  return copy;
}

import { Document } from '@langchain/core/documents';
import type {
  DocumentIngestionOptions,
  DocumentQueryOptions,
  DocumentSearchResult,
} from '../../interfaces/vector-store.interface';
import type { EmbeddingsLike } from '../../vector-stores/embeddings';
import type { VectorStoreAdapter } from '../../vector-stores/vector-store.interface';

/**
 * Mongo collection surface needed by the Atlas Vector Search adapter.
 * Any `mongodb` driver `Collection<T>` satisfies this shape.
 */
export interface MongoAtlasCollectionLike {
  insertMany(docs: Array<Record<string, unknown>>): Promise<unknown>;
  aggregate(pipeline: Array<Record<string, unknown>>): {
    toArray(): Promise<Array<Record<string, unknown>>>;
  };
  deleteMany(filter: Record<string, unknown>): Promise<unknown>;
}

export interface MongoAtlasVectorStoreOptions {
  collection: MongoAtlasCollectionLike;
  embeddings: EmbeddingsLike;
  /** Atlas Search index name — must be created in Atlas before use. */
  indexName: string;
  /** Field where the embedding is stored (default `"embedding"`). */
  embeddingField?: string;
  /** Field where the text content is stored (default `"content"`). */
  contentField?: string;
  /** Nested field containing metadata (default `"metadata"`). */
  metadataField?: string;
  /** Dimension of the embedding (for docs/audit — the index already knows). */
  vectorSize?: number;
}

/**
 * MongoDB Atlas Vector Search adapter. Requires Atlas (or a compatible
 * deployment) with a vector search index pre-created — the adapter does
 * not create the index because Atlas CLI / UI ownership is usually
 * preferred.
 *
 * Example Atlas Search index JSON:
 * ```json
 * {
 *   "name": "langchain_vector_index",
 *   "definition": {
 *     "mappings": {
 *       "dynamic": false,
 *       "fields": {
 *         "embedding": { "type": "knnVector", "dimensions": 1536, "similarity": "cosine" },
 *         "collection": { "type": "token" }
 *       }
 *     }
 *   }
 * }
 * ```
 *
 * ```ts
 * import { MongoClient } from 'mongodb';
 * import { OpenAIEmbeddings } from '@langchain/openai';
 * import { MongoAtlasVectorStore } from 'nestjs-langchain-tools/mongo';
 *
 * new MongoAtlasVectorStore({
 *   collection: client.db('app').collection('lc_documents'),
 *   embeddings: new OpenAIEmbeddings({ modelName: 'text-embedding-3-small' }),
 *   indexName: 'langchain_vector_index',
 *   vectorSize: 1536,
 * });
 * ```
 */
export class MongoAtlasVectorStore implements VectorStoreAdapter {
  private readonly embeddingField: string;
  private readonly contentField: string;
  private readonly metadataField: string;

  constructor(private readonly options: MongoAtlasVectorStoreOptions) {
    this.embeddingField = options.embeddingField ?? 'embedding';
    this.contentField = options.contentField ?? 'content';
    this.metadataField = options.metadataField ?? 'metadata';
  }

  async addDocuments(
    documents: Document[] | string[],
    collectionName = 'default',
    options: DocumentIngestionOptions = {},
  ): Promise<number> {
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
    const rows = docs.map((doc, i) => ({
      collection: collectionName,
      [this.contentField]: doc.pageContent,
      [this.metadataField]: doc.metadata ?? {},
      [this.embeddingField]: vectors[i],
    }));
    await this.options.collection.insertMany(rows);
    return rows.length;
  }

  async similaritySearch(
    query: string,
    collectionName = 'default',
    options: DocumentQueryOptions = {},
  ): Promise<DocumentSearchResult[]> {
    const vector = await this.options.embeddings.embedQuery(query);
    const limit = options.limit ?? 4;
    const numCandidates = Math.max(limit * 10, 100);
    const filter = buildAtlasFilter(collectionName, options.filter);

    const pipeline: Array<Record<string, unknown>> = [
      {
        $vectorSearch: {
          index: this.options.indexName,
          path: this.embeddingField,
          queryVector: vector,
          numCandidates,
          limit,
          ...(filter ? { filter } : {}),
        },
      },
      {
        $project: {
          _id: 0,
          [this.contentField]: 1,
          [this.metadataField]: 1,
          score: { $meta: 'vectorSearchScore' },
        },
      },
    ];

    const rows = await this.options.collection.aggregate(pipeline).toArray();
    return rows
      .map((row) => ({
        document: new Document({
          pageContent: (row[this.contentField] as string) ?? '',
          metadata:
            (row[this.metadataField] as Record<string, unknown>) ?? {},
        }),
        score: (row.score as number) ?? 0,
      }))
      .filter((r) => (options.minScore ? r.score >= options.minScore : true));
  }

  async deleteDocuments(
    filter: Record<string, unknown>,
    collectionName = 'default',
  ): Promise<boolean> {
    const mongoFilter: Record<string, unknown> = { collection: collectionName };
    for (const [key, value] of Object.entries(filter)) {
      mongoFilter[`${this.metadataField}.${key}`] = value;
    }
    await this.options.collection.deleteMany(mongoFilter);
    return true;
  }
}

function buildAtlasFilter(
  collectionName: string,
  filter?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!filter && !collectionName) return undefined;
  const conditions: Array<Record<string, unknown>> = [
    { collection: { $eq: collectionName } },
  ];
  if (filter) {
    for (const [key, value] of Object.entries(filter)) {
      conditions.push({ [`metadata.${key}`]: { $eq: value } });
    }
  }
  return conditions.length === 1 ? conditions[0] : { $and: conditions };
}

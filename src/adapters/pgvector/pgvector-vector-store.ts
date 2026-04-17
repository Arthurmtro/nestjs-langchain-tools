import { Document } from '@langchain/core/documents';
import type {
  DocumentIngestionOptions,
  DocumentQueryOptions,
  DocumentSearchResult,
} from '../../interfaces/vector-store.interface';
import type { EmbeddingsLike } from '../../vector-stores/embeddings';
import type { VectorStoreAdapter } from '../../vector-stores/vector-store.interface';

/**
 * Minimum surface we need from a Postgres client. `pg.Pool` / `pg.Client`
 * satisfy this directly.
 */
export interface PgClientLike {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: T[] }>;
}

export interface PgVectorStoreOptions {
  client: PgClientLike;
  embeddings: EmbeddingsLike;
  /** Table name (auto-created if `ensureTable: true`). */
  tableName?: string;
  /** Vector dimension. */
  vectorSize: number;
  /** Distance operator: `<->` (L2), `<=>` (cosine), `<#>` (inner product). */
  distanceOperator?: '<->' | '<=>' | '<#>';
  /** Create the table + index automatically on first use. */
  ensureTable?: boolean;
}

/**
 * pgvector adapter. Requires the `pgvector` extension on the Postgres
 * server. The table layout is:
 *
 * ```sql
 * CREATE TABLE IF NOT EXISTS <tableName> (
 *   id         BIGSERIAL PRIMARY KEY,
 *   collection TEXT NOT NULL,
 *   content    TEXT NOT NULL,
 *   metadata   JSONB NOT NULL DEFAULT '{}'::jsonb,
 *   embedding  VECTOR(<vectorSize>) NOT NULL
 * );
 * CREATE INDEX IF NOT EXISTS <tableName>_embedding_idx
 *   ON <tableName> USING hnsw (embedding vector_cosine_ops);
 * ```
 *
 * ```ts
 * import { Pool } from 'pg';
 * import { PgVectorStore } from 'nestjs-langchain-tools/pgvector';
 *
 * const pool = new Pool({ connectionString: process.env.DATABASE_URL });
 * const store = new PgVectorStore({ client: pool, embeddings, vectorSize: 1536, ensureTable: true });
 * ```
 */
export class PgVectorStore implements VectorStoreAdapter {
  private readonly table: string;
  private readonly op: string;
  private schemaReady = false;

  constructor(private readonly options: PgVectorStoreOptions) {
    this.table = options.tableName ?? 'langchain_documents';
    this.op = options.distanceOperator ?? '<=>';
  }

  async addDocuments(
    documents: Document[] | string[],
    collectionName = 'default',
    options: DocumentIngestionOptions = {},
  ): Promise<number> {
    await this.ensureSchema();
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

    for (let i = 0; i < docs.length; i++) {
      await this.options.client.query(
        `INSERT INTO ${this.table} (collection, content, metadata, embedding) VALUES ($1, $2, $3::jsonb, $4::vector)`,
        [
          collectionName,
          docs[i].pageContent,
          JSON.stringify(docs[i].metadata ?? {}),
          toPgVector(vectors[i]),
        ],
      );
    }
    return docs.length;
  }

  async similaritySearch(
    query: string,
    collectionName = 'default',
    options: DocumentQueryOptions = {},
  ): Promise<DocumentSearchResult[]> {
    await this.ensureSchema();
    const vector = await this.options.embeddings.embedQuery(query);
    const limit = options.limit ?? 4;

    const { whereSql, params } = buildFilter(
      options.filter,
      collectionName,
      toPgVector(vector),
    );

    const result = await this.options.client.query<{
      content: string;
      metadata: Record<string, unknown>;
      distance: string | number;
    }>(
      `SELECT content, metadata, embedding ${this.op} $1::vector AS distance
       FROM ${this.table}
       ${whereSql}
       ORDER BY embedding ${this.op} $1::vector
       LIMIT ${limit}`,
      params,
    );

    const rows = result.rows
      .map((row) => {
        const distance = Number(row.distance);
        const score = this.op === '<=>' ? 1 - distance : -distance;
        return {
          document: new Document({
            pageContent: row.content,
            metadata: row.metadata ?? {},
          }),
          score,
        };
      })
      .filter((r) => (options.minScore ? r.score >= options.minScore : true));

    return rows;
  }

  async deleteDocuments(
    filter: Record<string, unknown>,
    collectionName = 'default',
  ): Promise<boolean> {
    await this.ensureSchema();
    const entries = Object.entries(filter);
    const conditions: string[] = [`collection = $1`];
    const params: unknown[] = [collectionName];
    entries.forEach(([key, value], i) => {
      conditions.push(`metadata ->> $${i * 2 + 2} = $${i * 2 + 3}`);
      params.push(key, String(value));
    });
    await this.options.client.query(
      `DELETE FROM ${this.table} WHERE ${conditions.join(' AND ')}`,
      params,
    );
    return true;
  }

  async listCollections(): Promise<string[]> {
    await this.ensureSchema();
    const res = await this.options.client.query<{ collection: string }>(
      `SELECT DISTINCT collection FROM ${this.table}`,
    );
    return res.rows.map((r) => r.collection);
  }

  private async ensureSchema(): Promise<void> {
    if (this.schemaReady || !this.options.ensureTable) {
      this.schemaReady = true;
      return;
    }
    await this.options.client.query(`CREATE EXTENSION IF NOT EXISTS vector`);
    await this.options.client.query(`
      CREATE TABLE IF NOT EXISTS ${this.table} (
        id BIGSERIAL PRIMARY KEY,
        collection TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        embedding VECTOR(${this.options.vectorSize}) NOT NULL
      )
    `);
    await this.options.client.query(
      `CREATE INDEX IF NOT EXISTS ${this.table}_collection_idx ON ${this.table}(collection)`,
    );
    await this.options.client.query(
      `CREATE INDEX IF NOT EXISTS ${this.table}_embedding_idx ON ${this.table} USING hnsw (embedding vector_cosine_ops)`,
    );
    this.schemaReady = true;
  }
}

function toPgVector(vec: number[]): string {
  return `[${vec.join(',')}]`;
}

function buildFilter(
  filter: Record<string, unknown> | undefined,
  collection: string,
  _vectorParam: string,
): { whereSql: string; params: unknown[] } {
  const params: unknown[] = [];
  const conditions: string[] = [];

  // $1 is reserved for the query vector, already passed by the caller.
  params.push(collection);
  conditions.push(`collection = $${params.length + 1}`);

  if (filter) {
    for (const [key, value] of Object.entries(filter)) {
      params.push(key);
      const keyIdx = params.length + 1;
      params.push(String(value));
      const valIdx = params.length + 1;
      conditions.push(`metadata ->> $${keyIdx} = $${valIdx}`);
    }
  }

  // Re-number params so they are passed in the correct order (the vector
  // is $1 — the caller prepends it).
  return {
    whereSql: `WHERE ${conditions.join(' AND ')}`,
    params: [_vectorParam, ...params],
  };
}

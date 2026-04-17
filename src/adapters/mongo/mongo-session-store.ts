import {
  AIMessage,
  BaseMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from '@langchain/core/messages';
import type { SessionStore } from '../../memory/session-store.interface';

/**
 * Minimal surface of a MongoDB collection used by this adapter. `mongodb`
 * driver's `Collection<T>` satisfies this directly, as does Mongoose's
 * native collection handle.
 */
export interface MongoCollectionLike {
  insertOne(doc: Record<string, unknown>): Promise<unknown>;
  find(filter: Record<string, unknown>): {
    sort(spec: Record<string, 1 | -1>): {
      toArray(): Promise<Array<Record<string, unknown>>>;
    };
  };
  deleteMany(filter: Record<string, unknown>): Promise<unknown>;
  distinct(field: string): Promise<string[]>;
  createIndex?(
    spec: Record<string, 1 | -1>,
    options?: Record<string, unknown>,
  ): Promise<unknown>;
}

export interface MongoSessionStoreOptions {
  /** Mongo collection — you create the connection, we don't. */
  collection: MongoCollectionLike;
  /** TTL in seconds (uses a Mongo TTL index on `expiresAt` when > 0). */
  ttlSeconds?: number;
  /** Maximum messages per session (enforced at read time, trimmed at append). */
  maxMessages?: number;
  /** Create indexes on `sessionId` (+ TTL) automatically on first write. */
  ensureIndexes?: boolean;
}

interface SessionDocument extends Record<string, unknown> {
  sessionId: string;
  kind: 'human' | 'ai' | 'system' | 'tool';
  content: string;
  tool_call_id?: string;
  createdAt: Date;
  expiresAt?: Date;
}

/**
 * MongoDB-backed {@link SessionStore}. Each message is a document in the
 * provided collection; sessions are identified by `sessionId`. Bring your
 * own collection — we don't manage the connection.
 *
 * ```ts
 * import { MongoClient } from 'mongodb';
 * import { MongoSessionStore } from 'nestjs-langchain-tools/mongo';
 *
 * const client = await MongoClient.connect(process.env.MONGO_URL);
 * const collection = client.db('app').collection('langchain_sessions');
 *
 * LangChainToolsModule.forRoot({
 *   sessionStore: new MongoSessionStore({
 *     collection,
 *     ttlSeconds: 60 * 60 * 24 * 7,
 *     maxMessages: 200,
 *     ensureIndexes: true,
 *   }),
 * })
 * ```
 */
export class MongoSessionStore implements SessionStore {
  private indexesReady = false;

  constructor(private readonly options: MongoSessionStoreOptions) {}

  async getMessages(sessionId: string): Promise<BaseMessage[]> {
    await this.ensureIndexes();
    const raw = await this.options.collection
      .find({ sessionId })
      .sort({ createdAt: 1 })
      .toArray();
    const docs = raw.filter(isSessionDocument);
    const limited = this.options.maxMessages
      ? docs.slice(-this.options.maxMessages)
      : docs;
    return limited.map(deserialise);
  }

  async appendMessage(sessionId: string, message: BaseMessage): Promise<void> {
    await this.ensureIndexes();
    const now = new Date();
    const kind = toKind(message);
    const doc: SessionDocument = {
      sessionId,
      kind,
      content: serialiseContent(message),
      tool_call_id: kind === 'tool' ? readToolCallId(message) : undefined,
      createdAt: now,
      expiresAt: this.options.ttlSeconds
        ? new Date(now.getTime() + this.options.ttlSeconds * 1000)
        : undefined,
    };
    await this.options.collection.insertOne(doc);
  }

  async clear(sessionId: string): Promise<void> {
    await this.options.collection.deleteMany({ sessionId });
  }

  async listSessions(): Promise<string[]> {
    return this.options.collection.distinct('sessionId');
  }

  private async ensureIndexes(): Promise<void> {
    if (this.indexesReady || !this.options.ensureIndexes) {
      this.indexesReady = true;
      return;
    }
    if (!this.options.collection.createIndex) {
      this.indexesReady = true;
      return;
    }
    await this.options.collection.createIndex({ sessionId: 1, createdAt: 1 });
    if (this.options.ttlSeconds) {
      await this.options.collection.createIndex(
        { expiresAt: 1 },
        { expireAfterSeconds: 0 },
      );
    }
    this.indexesReady = true;
  }
}

function serialiseContent(message: BaseMessage): string {
  return typeof message.content === 'string'
    ? message.content
    : JSON.stringify(message.content);
}

function deserialise(doc: SessionDocument): BaseMessage {
  switch (doc.kind) {
    case 'human':
      return new HumanMessage(doc.content);
    case 'ai':
      return new AIMessage(doc.content);
    case 'system':
      return new SystemMessage(doc.content);
    case 'tool':
      return new ToolMessage({
        content: doc.content,
        tool_call_id: doc.tool_call_id ?? 'unknown',
      });
    default:
      return new HumanMessage(doc.content);
  }
}

function toKind(message: BaseMessage): SessionDocument['kind'] {
  const t = message._getType?.();
  if (t === 'human') return 'human';
  if (t === 'ai') return 'ai';
  if (t === 'system') return 'system';
  if (t === 'tool') return 'tool';
  return 'human';
}

function readToolCallId(message: BaseMessage): string | undefined {
  if (message instanceof ToolMessage) return message.tool_call_id;
  const raw = (message as { tool_call_id?: unknown }).tool_call_id;
  return typeof raw === 'string' ? raw : undefined;
}


function isSessionDocument(value: Record<string, unknown>): value is SessionDocument {
  const kind = value.kind;
  if (
    typeof value.sessionId !== 'string' ||
    (kind !== 'human' && kind !== 'ai' && kind !== 'system' && kind !== 'tool') ||
    typeof value.content !== 'string' ||
    !(value.createdAt instanceof Date)
  ) {
    return false;
  }
  return true;
}

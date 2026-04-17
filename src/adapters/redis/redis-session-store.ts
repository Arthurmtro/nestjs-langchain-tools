import {
  AIMessage,
  BaseMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from '@langchain/core/messages';
import type { SessionStore } from '../../memory/session-store.interface';

export interface RedisClientLike {
  rpush(key: string, value: string): Promise<number> | number;
  lrange(key: string, start: number, stop: number): Promise<string[]> | string[];
  del(key: string): Promise<number> | number;
  keys(pattern: string): Promise<string[]> | string[];
  expire?(key: string, seconds: number): Promise<number> | number;
  ltrim?(key: string, start: number, stop: number): Promise<string> | string;
}

export interface RedisSessionStoreOptions {
  /** An already-constructed Redis client (ioredis / node-redis). */
  client: RedisClientLike;
  /** Optional key prefix (defaults to `"langchain:session:"`). */
  keyPrefix?: string;
  /** TTL applied on every append (seconds). */
  ttlSeconds?: number;
  /** Maximum messages retained per session (oldest trimmed on overflow). */
  maxMessages?: number;
}

interface SerializedMessage {
  kind: 'human' | 'ai' | 'system' | 'tool';
  content: string;
  tool_call_id?: string;
}

/**
 * Redis-backed {@link SessionStore}. Each session is stored as a Redis list
 * of serialised messages under the configured key prefix. Works with any
 * client exposing `rpush`, `lrange`, `del`, `keys` (ioredis, node-redis v4
 * compat layer, upstash/redis). Bring your own client — this adapter does
 * not connect.
 *
 * ```ts
 * import Redis from 'ioredis';
 * import { RedisSessionStore } from 'nestjs-langchain-tools/redis';
 *
 * LangChainToolsModule.forRoot({
 *   sessionStore: new RedisSessionStore({
 *     client: new Redis(process.env.REDIS_URL),
 *     ttlSeconds: 60 * 60 * 24,
 *     maxMessages: 200,
 *   }),
 * })
 * ```
 */
export class RedisSessionStore implements SessionStore {
  private readonly prefix: string;

  constructor(private readonly options: RedisSessionStoreOptions) {
    this.prefix = options.keyPrefix ?? 'langchain:session:';
  }

  async getMessages(sessionId: string): Promise<BaseMessage[]> {
    const raw = await this.options.client.lrange(this.key(sessionId), 0, -1);
    return raw.map((line) => deserialise(line));
  }

  async appendMessage(sessionId: string, message: BaseMessage): Promise<void> {
    const key = this.key(sessionId);
    await this.options.client.rpush(key, serialise(message));
    if (this.options.maxMessages && this.options.client.ltrim) {
      await this.options.client.ltrim(key, -this.options.maxMessages, -1);
    }
    if (this.options.ttlSeconds && this.options.client.expire) {
      await this.options.client.expire(key, this.options.ttlSeconds);
    }
  }

  async clear(sessionId: string): Promise<void> {
    await this.options.client.del(this.key(sessionId));
  }

  async listSessions(): Promise<string[]> {
    const keys = await this.options.client.keys(`${this.prefix}*`);
    return keys.map((k) => k.slice(this.prefix.length));
  }

  private key(sessionId: string): string {
    return `${this.prefix}${sessionId}`;
  }
}

function serialise(message: BaseMessage): string {
  const content =
    typeof message.content === 'string'
      ? message.content
      : JSON.stringify(message.content);
  const kind: SerializedMessage['kind'] = toKind(message);
  const payload: SerializedMessage = {
    kind,
    content,
    tool_call_id: kind === 'tool' ? readToolCallId(message) : undefined,
  };
  return JSON.stringify(payload);
}

function readToolCallId(message: BaseMessage): string | undefined {
  if (message instanceof ToolMessage) return message.tool_call_id;
  const raw = (message as { tool_call_id?: unknown }).tool_call_id;
  return typeof raw === 'string' ? raw : undefined;
}

function deserialise(line: string): BaseMessage {
  const payload = JSON.parse(line) as SerializedMessage;
  switch (payload.kind) {
    case 'human':
      return new HumanMessage(payload.content);
    case 'ai':
      return new AIMessage(payload.content);
    case 'system':
      return new SystemMessage(payload.content);
    case 'tool':
      return new ToolMessage({
        content: payload.content,
        tool_call_id: payload.tool_call_id ?? 'unknown',
      });
    default:
      return new HumanMessage(payload.content);
  }
}

function toKind(message: BaseMessage): SerializedMessage['kind'] {
  const t = message._getType?.();
  if (t === 'human') return 'human';
  if (t === 'ai') return 'ai';
  if (t === 'system') return 'system';
  if (t === 'tool') return 'tool';
  return 'human';
}

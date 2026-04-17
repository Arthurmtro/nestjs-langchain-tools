export interface RedisLike {
  get(key: string): Promise<string | null> | string | null;
  set(key: string, value: string, ...args: unknown[]): Promise<string | null> | string | null;
  del(key: string): Promise<number> | number;
  keys(pattern: string): Promise<string[]> | string[];
  expire?(key: string, seconds: number): Promise<number> | number;
}

export interface RedisCheckpointSaverOptions {
  client: RedisLike;
  keyPrefix?: string;
  ttlSeconds?: number;
}

/**
 * Redis-backed LangGraph `BaseCheckpointSaver`. Stores serialised checkpoint
 * tuples keyed by `(thread_id, checkpoint_ns)`. Bring your own client
 * (ioredis / node-redis) — this adapter does not open connections.
 *
 * The actual class extends `BaseCheckpointSaver` from `@langchain/langgraph`;
 * we resolve that class at instantiation so projects that don't install
 * LangGraph pay nothing.
 *
 * ```ts
 * import Redis from 'ioredis';
 * import { createRedisCheckpointSaver } from 'nestjs-langchain-tools/redis';
 *
 * const saver = await createRedisCheckpointSaver({
 *   client: new Redis(process.env.REDIS_URL),
 *   ttlSeconds: 60 * 60 * 24 * 7,
 * });
 * ```
 */
export async function createRedisCheckpointSaver(
  options: RedisCheckpointSaverOptions,
): Promise<unknown> {
  let BaseCheckpointSaver: new () => Record<string, unknown>;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@langchain/langgraph') as {
      BaseCheckpointSaver: new () => Record<string, unknown>;
    };
    BaseCheckpointSaver = mod.BaseCheckpointSaver;
  } catch (err) {
    throw new Error(
      '@langchain/langgraph must be installed to use RedisCheckpointSaver',
    );
  }

  const prefix = options.keyPrefix ?? 'langchain:checkpoint:';

  class RedisCheckpointSaver extends BaseCheckpointSaver {
    async getTuple(config: {
      configurable?: { thread_id?: string; checkpoint_ns?: string };
    }): Promise<unknown> {
      const key = buildKey(prefix, config);
      const raw = await options.client.get(key);
      if (!raw) return undefined;
      return JSON.parse(raw);
    }

    async put(
      config: {
        configurable?: { thread_id?: string; checkpoint_ns?: string };
      },
      checkpoint: unknown,
      metadata: unknown,
    ): Promise<typeof config> {
      const key = buildKey(prefix, config);
      const payload = JSON.stringify({ checkpoint, metadata });
      await options.client.set(key, payload);
      if (options.ttlSeconds && options.client.expire) {
        await options.client.expire(key, options.ttlSeconds);
      }
      return config;
    }

    async putWrites(): Promise<void> {
      // Pending writes are not currently persisted by this adapter. Callers
      // that need cross-step durability should use the Postgres saver from
      // @langchain/langgraph-checkpoint-postgres.
    }

    async deleteThread(threadId: string): Promise<void> {
      const pattern = `${prefix}${threadId}:*`;
      const keys = await options.client.keys(pattern);
      for (const k of keys) {
        await options.client.del(k);
      }
    }

    async *list(): AsyncGenerator<unknown> {
      const keys = await options.client.keys(`${prefix}*`);
      for (const k of keys) {
        const raw = await options.client.get(k);
        if (raw) yield JSON.parse(raw);
      }
    }
  }

  return new RedisCheckpointSaver();
}

function buildKey(
  prefix: string,
  config: { configurable?: { thread_id?: string; checkpoint_ns?: string } },
): string {
  const threadId = config.configurable?.thread_id ?? 'default';
  const ns = config.configurable?.checkpoint_ns ?? '';
  return `${prefix}${threadId}:${ns}`;
}

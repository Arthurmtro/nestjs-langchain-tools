/**
 * Minimal surface of a MongoDB collection used by the checkpoint saver.
 */
export interface MongoCheckpointCollection {
  findOne(filter: Record<string, unknown>): Promise<Record<string, unknown> | null>;
  replaceOne(
    filter: Record<string, unknown>,
    doc: Record<string, unknown>,
    options?: { upsert?: boolean },
  ): Promise<unknown>;
  deleteMany(filter: Record<string, unknown>): Promise<unknown>;
  find(filter: Record<string, unknown>): {
    toArray(): Promise<Array<Record<string, unknown>>>;
  };
  createIndex?(spec: Record<string, 1 | -1>): Promise<unknown>;
}

export interface MongoCheckpointSaverOptions {
  collection: MongoCheckpointCollection;
  ensureIndexes?: boolean;
}

/**
 * Mongo-backed LangGraph `BaseCheckpointSaver`. Each checkpoint is stored
 * as a document keyed by `{ threadId, namespace }`.
 *
 * Requires `@langchain/langgraph` as a peer dep (resolved lazily). Bring
 * your own Mongo collection handle.
 *
 * ```ts
 * import { MongoClient } from 'mongodb';
 * import { createMongoCheckpointSaver } from 'nestjs-langchain-tools/mongo';
 *
 * const client = await MongoClient.connect(process.env.MONGO_URL);
 * const saver = await createMongoCheckpointSaver({
 *   collection: client.db('app').collection('lc_checkpoints'),
 *   ensureIndexes: true,
 * });
 * ```
 */
export async function createMongoCheckpointSaver(
  options: MongoCheckpointSaverOptions,
): Promise<unknown> {
  let BaseCheckpointSaver: new () => Record<string, unknown>;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@langchain/langgraph') as {
      BaseCheckpointSaver: new () => Record<string, unknown>;
    };
    BaseCheckpointSaver = mod.BaseCheckpointSaver;
  } catch {
    throw new Error(
      '@langchain/langgraph must be installed to use MongoCheckpointSaver',
    );
  }

  if (options.ensureIndexes && options.collection.createIndex) {
    await options.collection.createIndex({ threadId: 1, namespace: 1 });
  }

  class MongoCheckpointSaver extends BaseCheckpointSaver {
    async getTuple(config: {
      configurable?: { thread_id?: string; checkpoint_ns?: string };
    }): Promise<unknown> {
      const doc = await options.collection.findOne({
        threadId: config.configurable?.thread_id ?? 'default',
        namespace: config.configurable?.checkpoint_ns ?? '',
      });
      if (!doc) return undefined;
      return { checkpoint: doc.checkpoint, metadata: doc.metadata };
    }

    async put(
      config: {
        configurable?: { thread_id?: string; checkpoint_ns?: string };
      },
      checkpoint: unknown,
      metadata: unknown,
    ): Promise<typeof config> {
      const filter = {
        threadId: config.configurable?.thread_id ?? 'default',
        namespace: config.configurable?.checkpoint_ns ?? '',
      };
      await options.collection.replaceOne(
        filter,
        {
          ...filter,
          checkpoint,
          metadata,
          updatedAt: new Date(),
        },
        { upsert: true },
      );
      return config;
    }

    async putWrites(): Promise<void> {
      // Not persisted — see RedisCheckpointSaver for rationale.
    }

    async deleteThread(threadId: string): Promise<void> {
      await options.collection.deleteMany({ threadId });
    }

    async *list(): AsyncGenerator<unknown> {
      const docs = await options.collection.find({}).toArray();
      for (const doc of docs) {
        yield { checkpoint: doc.checkpoint, metadata: doc.metadata };
      }
    }
  }

  return new MongoCheckpointSaver();
}

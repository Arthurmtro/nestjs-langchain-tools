import { AIMessage, HumanMessage } from '@langchain/core/messages';
import {
  MongoCollectionLike,
  MongoSessionStore,
} from './mongo-session-store';

function makeCollection(): MongoCollectionLike & {
  docs: Array<Record<string, unknown>>;
  createIndex: jest.Mock;
} {
  const docs: Array<Record<string, unknown>> = [];
  return {
    docs,
    insertOne: jest.fn(async (doc) => {
      docs.push(doc);
      return { insertedId: docs.length };
    }),
    find: jest.fn((filter) => ({
      sort: jest.fn(() => ({
        toArray: jest.fn(async () =>
          docs.filter((d) =>
            Object.entries(filter).every(([k, v]) => d[k] === v),
          ),
        ),
      })),
    })),
    deleteMany: jest.fn(async (filter) => {
      for (let i = docs.length - 1; i >= 0; i--) {
        if (
          Object.entries(filter).every(([k, v]) => docs[i][k] === v)
        ) {
          docs.splice(i, 1);
        }
      }
      return {};
    }),
    distinct: jest.fn(async () => {
      return Array.from(new Set(docs.map((d) => d.sessionId as string)));
    }),
    createIndex: jest.fn(async () => ({})),
  };
}

describe('MongoSessionStore', () => {
  it('round-trips messages per session', async () => {
    const collection = makeCollection();
    const store = new MongoSessionStore({ collection });
    await store.appendMessage('s', new HumanMessage('hi'));
    await store.appendMessage('s', new AIMessage('hey'));
    const msgs = await store.getMessages('s');
    expect(msgs.map((m) => m.content)).toEqual(['hi', 'hey']);
  });

  it('ensures sessionId + ttl index when configured', async () => {
    const collection = makeCollection();
    const store = new MongoSessionStore({
      collection,
      ensureIndexes: true,
      ttlSeconds: 3600,
    });
    await store.appendMessage('s', new HumanMessage('x'));
    expect(collection.createIndex).toHaveBeenCalledWith(
      { sessionId: 1, createdAt: 1 },
    );
    expect(collection.createIndex).toHaveBeenCalledWith(
      { expiresAt: 1 },
      { expireAfterSeconds: 0 },
    );
  });

  it('truncates to maxMessages on read', async () => {
    const collection = makeCollection();
    const store = new MongoSessionStore({ collection, maxMessages: 2 });
    await store.appendMessage('s', new HumanMessage('1'));
    await store.appendMessage('s', new HumanMessage('2'));
    await store.appendMessage('s', new HumanMessage('3'));
    const msgs = await store.getMessages('s');
    expect(msgs.map((m) => m.content)).toEqual(['2', '3']);
  });

  it('clears a session', async () => {
    const collection = makeCollection();
    const store = new MongoSessionStore({ collection });
    await store.appendMessage('s', new HumanMessage('x'));
    await store.clear('s');
    expect(await store.getMessages('s')).toHaveLength(0);
  });
});

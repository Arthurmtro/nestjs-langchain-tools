import { Document } from '@langchain/core/documents';
import { QdrantClientLike, QdrantVectorStore } from './qdrant-vector-store';
import { DeterministicHashEmbeddings } from '../../vector-stores/embeddings';

function makeClient(): QdrantClientLike & {
  collections: Set<string>;
  points: Map<string, Array<{ id: string | number; vector: number[]; payload: Record<string, unknown> }>>;
} {
  const collections = new Set<string>();
  const points = new Map<string, Array<{ id: string | number; vector: number[]; payload: Record<string, unknown> }>>();
  return {
    collections,
    points,
    getCollections: jest.fn(async () => ({
      collections: Array.from(collections).map((name) => ({ name })),
    })),
    createCollection: jest.fn(async (name) => {
      collections.add(name);
      points.set(name, []);
      return {};
    }),
    upsert: jest.fn(async (collection, params) => {
      const list = points.get(collection) ?? [];
      list.push(...params.points.map((p) => ({ id: p.id, vector: p.vector, payload: p.payload ?? {} })));
      points.set(collection, list);
      return {};
    }),
    search: jest.fn(async (collection, params) => {
      const list = points.get(collection) ?? [];
      const scored = list.map((p) => {
        const dot = p.vector.reduce((s, v, i) => s + v * params.vector[i], 0);
        return { id: p.id, score: dot, payload: p.payload };
      });
      return scored
        .sort((a, b) => b.score - a.score)
        .slice(0, params.limit);
    }),
    delete: jest.fn(async () => ({})),
  };
}

describe('QdrantVectorStore', () => {
  it('auto-creates collections and round-trips search', async () => {
    const client = makeClient();
    const store = new QdrantVectorStore({
      client,
      embeddings: new DeterministicHashEmbeddings(32),
      vectorSize: 32,
    });
    await store.addDocuments(['the cat sat', 'databases and queries']);
    const results = await store.similaritySearch('cat', undefined, { limit: 2 });
    expect(client.createCollection).toHaveBeenCalledWith(
      'default',
      expect.objectContaining({ vectors: expect.objectContaining({ size: 32 }) }),
    );
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].document.pageContent).toMatch(/cat|database/);
  });

  it('applies payload filter', async () => {
    const client = makeClient();
    const store = new QdrantVectorStore({
      client,
      embeddings: new DeterministicHashEmbeddings(32),
      vectorSize: 32,
    });
    await store.addDocuments(
      [
        new Document({ pageContent: 'alpha', metadata: { tenant: 'a' } }),
        new Document({ pageContent: 'beta', metadata: { tenant: 'b' } }),
      ],
      'docs',
    );
    await store.similaritySearch('q', 'docs', { filter: { tenant: 'b' } });
    expect(client.search).toHaveBeenCalledWith(
      'docs',
      expect.objectContaining({
        filter: {
          must: [{ key: 'tenant', match: { value: 'b' } }],
        },
      }),
    );
  });

  it('lists collections', async () => {
    const client = makeClient();
    const store = new QdrantVectorStore({
      client,
      embeddings: new DeterministicHashEmbeddings(32),
      vectorSize: 32,
    });
    await store.addDocuments(['x'], 'coll-a');
    const list = await store.listCollections();
    expect(list).toContain('coll-a');
  });
});

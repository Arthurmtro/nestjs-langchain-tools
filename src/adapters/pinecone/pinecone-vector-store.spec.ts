import { PineconeVectorStore, PineconeIndexLike } from './pinecone-vector-store';
import { DeterministicHashEmbeddings } from '../../vector-stores/embeddings';

function makeIndex(): PineconeIndexLike & {
  vectors: Map<string, Array<{ id: string; values: number[]; metadata?: Record<string, unknown> }>>;
  lastQuery?: Parameters<PineconeIndexLike['query']>[0];
} {
  const vectors = new Map<string, Array<{ id: string; values: number[]; metadata?: Record<string, unknown> }>>();
  const index = {
    vectors,
    lastQuery: undefined as Parameters<PineconeIndexLike['query']>[0] | undefined,
    currentNamespace: '',
    upsert: jest.fn(async function (this: { currentNamespace: string }, points: Array<{ id: string; values: number[]; metadata?: Record<string, unknown> }>) {
      const list = vectors.get(this.currentNamespace) ?? [];
      list.push(...points);
      vectors.set(this.currentNamespace, list);
      return {};
    }),
    query: jest.fn(async function (this: { currentNamespace: string }, params: Parameters<PineconeIndexLike['query']>[0]) {
      index.lastQuery = params;
      const list = vectors.get(this.currentNamespace) ?? [];
      const scored = list.map((v) => ({
        id: v.id,
        score: v.values.reduce((s, x, i) => s + x * params.vector[i], 0),
        metadata: v.metadata,
      }));
      return {
        matches: scored.sort((a, b) => b.score - a.score).slice(0, params.topK),
      };
    }),
    deleteMany: jest.fn(async () => ({})),
    namespace: jest.fn(function (name: string) {
      return { ...index, currentNamespace: name };
    }),
  } as unknown as PineconeIndexLike & {
    vectors: typeof vectors;
    lastQuery?: Parameters<PineconeIndexLike['query']>[0];
  };
  return index;
}

describe('PineconeVectorStore', () => {
  it('upserts and retrieves documents from a namespace', async () => {
    const index = makeIndex();
    const store = new PineconeVectorStore({
      index,
      embeddings: new DeterministicHashEmbeddings(32),
      defaultNamespace: 'prod',
    });
    await store.addDocuments(['alpha beta', 'gamma delta']);
    const results = await store.similaritySearch('alpha');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].document.pageContent).toContain('alpha');
  });

  it('maps metadata filter to Pinecone $eq syntax', async () => {
    const index = makeIndex();
    const store = new PineconeVectorStore({
      index,
      embeddings: new DeterministicHashEmbeddings(32),
    });
    await store.addDocuments(['text'], 'ns');
    await store.similaritySearch('text', 'ns', { filter: { tenant: 'a' } });
    expect(index.query).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: { tenant: { $eq: 'a' } },
      }),
    );
  });
});

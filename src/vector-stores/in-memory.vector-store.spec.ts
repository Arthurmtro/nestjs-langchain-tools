import { Document } from '@langchain/core/documents';
import { InMemoryVectorStore } from './in-memory.vector-store';

describe('InMemoryVectorStore', () => {
  it('ingests and returns cosine-scored matches', async () => {
    const store = new InMemoryVectorStore();
    await store.addDocuments([
      'the cat sat on the mat',
      'databases and migrations',
      'feline pet behaviour',
    ]);
    const results = await store.similaritySearch('cats', 'default', { limit: 2 });
    expect(results).toHaveLength(2);
    // Feline-content documents should dominate over the database one.
    expect(results[0].document.pageContent).toMatch(/cat|feline/);
  });

  it('supports metadata filter on search', async () => {
    const store = new InMemoryVectorStore();
    await store.addDocuments(
      [
        new Document({
          pageContent: 'record alpha',
          metadata: { tenant: 'a' },
        }),
        new Document({
          pageContent: 'record beta',
          metadata: { tenant: 'b' },
        }),
      ],
      'docs',
    );
    const results = await store.similaritySearch('record', 'docs', {
      filter: { tenant: 'b' },
    });
    expect(results).toHaveLength(1);
    expect(results[0].document.metadata.tenant).toBe('b');
  });

  it('deletes documents by filter', async () => {
    const store = new InMemoryVectorStore();
    await store.addDocuments(
      [
        new Document({ pageContent: 'keep', metadata: { kind: 'k' } }),
        new Document({ pageContent: 'drop', metadata: { kind: 'd' } }),
      ],
      'c',
    );
    await store.deleteDocuments({ kind: 'd' }, 'c');
    const remaining = await store.similaritySearch('drop', 'c');
    expect(remaining.every((r) => r.document.metadata.kind !== 'd')).toBe(true);
  });

  it('chunks documents when splitDocument is enabled', async () => {
    const store = new InMemoryVectorStore();
    const count = await store.addDocuments(
      ['word '.repeat(500).trim()],
      'chunks',
      { splitDocument: true, chunkSize: 200, chunkOverlap: 20 },
    );
    expect(count).toBeGreaterThan(1);
  });
});

/**
 * Minimal embedding interface shared by every adapter.
 *
 * LangChain's `Embeddings` superclass works out of the box; custom adapters
 * only need the two methods below.
 */
export interface EmbeddingsLike {
  embedQuery(text: string): Promise<number[]>;
  embedDocuments(texts: string[]): Promise<number[][]>;
}

/**
 * Deterministic hashing-based embedding for tests and offline demos.
 * Not suitable for real retrieval quality, but produces stable vectors
 * so unit tests remain reproducible without hitting an embedding API.
 */
export class DeterministicHashEmbeddings implements EmbeddingsLike {
  constructor(private readonly dimensions = 64) {}

  async embedQuery(text: string): Promise<number[]> {
    return this.encode(text);
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    return texts.map((t) => this.encode(t));
  }

  private encode(text: string): number[] {
    const vec = new Array<number>(this.dimensions).fill(0);
    const tokens = text.toLowerCase().split(/\s+/).filter(Boolean);
    for (const token of tokens) {
      const h = hash32(token);
      vec[h % this.dimensions] += 1;
    }
    // L2 normalize
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
    return vec.map((v) => v / norm);
  }
}

function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  if (denom === 0) return 0;
  return dot / denom;
}

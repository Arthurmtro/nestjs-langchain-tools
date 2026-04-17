import {
  drainGenerator,
  isAsyncGeneratorFunction,
} from './generator-tool.adapter';

describe('isAsyncGeneratorFunction', () => {
  it('returns true for async generator functions', async () => {
    async function* gen() {
      yield 1;
    }
    expect(isAsyncGeneratorFunction(gen)).toBe(true);
  });

  it('returns false for regular async functions', async () => {
    const fn = async () => 1;
    expect(isAsyncGeneratorFunction(fn)).toBe(false);
  });

  it('returns false for sync functions', () => {
    const fn = () => 1;
    expect(isAsyncGeneratorFunction(fn)).toBe(false);
  });

  it('returns false for non-functions', () => {
    expect(isAsyncGeneratorFunction(null)).toBe(false);
    expect(isAsyncGeneratorFunction(42)).toBe(false);
  });
});

describe('drainGenerator', () => {
  it('iterates a generator and returns the final return value', async () => {
    async function* gen(): AsyncGenerator<
      { progress: number; message: string },
      string
    > {
      yield { progress: 10, message: 'start' };
      yield { progress: 50, message: 'halfway' };
      yield { progress: 90, message: 'almost' };
      return 'done';
    }
    const result = await drainGenerator('slow', gen());
    expect(result).toBe('done');
  });

  it('handles a generator that returns immediately', async () => {
    async function* gen(): AsyncGenerator<unknown, number> {
      return 42;
    }
    const result = await drainGenerator('instant', gen());
    expect(result).toBe(42);
  });
});

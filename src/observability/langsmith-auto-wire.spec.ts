import {
  createLangSmithTracer,
  langSmithEnabled,
} from './langsmith-auto-wire';

describe('langSmithEnabled', () => {
  it('is enabled when LANGSMITH_API_KEY is set', () => {
    expect(langSmithEnabled({ LANGSMITH_API_KEY: 'xxx' } as never)).toBe(true);
  });

  it('is enabled when LANGCHAIN_API_KEY is set', () => {
    expect(langSmithEnabled({ LANGCHAIN_API_KEY: 'xxx' } as never)).toBe(true);
  });

  it('is enabled when LANGCHAIN_TRACING_V2 is true', () => {
    expect(langSmithEnabled({ LANGCHAIN_TRACING_V2: 'true' } as never)).toBe(true);
  });

  it('is disabled when no relevant env is set', () => {
    expect(langSmithEnabled({} as never)).toBe(false);
    expect(
      langSmithEnabled({ LANGCHAIN_TRACING_V2: 'false' } as never),
    ).toBe(false);
  });
});

describe('createLangSmithTracer', () => {
  it('returns undefined when tracing is disabled', async () => {
    const out = await createLangSmithTracer({} as never);
    expect(out).toBeUndefined();
  });

  it('returns a tracer when env is present', async () => {
    const out = await createLangSmithTracer({
      LANGSMITH_API_KEY: 'fake-key',
      LANGSMITH_PROJECT: 'test-project',
    } as never);
    expect(out).toBeDefined();
    expect((out as { name?: string }).name).toBe('langchain_tracer');
  });
});

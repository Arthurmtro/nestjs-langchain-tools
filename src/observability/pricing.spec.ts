import { DEFAULT_PRICING, computeCost } from './pricing';

describe('computeCost', () => {
  it('computes USD cost for a known model', () => {
    const out = computeCost('gpt-4o', 1_000_000, 500_000);
    expect(out.model).toBe('gpt-4o');
    expect(out.promptUsd).toBeCloseTo(2.5);
    expect(out.completionUsd).toBeCloseTo(5);
    expect(out.totalUsd).toBeCloseTo(7.5);
  });

  it('returns zero cost for an unknown model', () => {
    const out = computeCost('unknown-future-model', 1_000_000, 500_000);
    expect(out.totalUsd).toBe(0);
  });

  it('handles haiku micro-pricing accurately', () => {
    const out = computeCost('claude-3-haiku-20240307', 100_000, 200_000);
    expect(out.totalUsd).toBeCloseTo(
      (100_000 / 1_000_000) * 0.25 + (200_000 / 1_000_000) * 1.25,
    );
  });

  it('accepts a custom pricing table', () => {
    const out = computeCost(
      'x',
      1_000_000,
      0,
      { x: { promptPerMillion: 42, completionPerMillion: 0 } },
    );
    expect(out.promptUsd).toBe(42);
  });

  it('exposes the default pricing for several flagship models', () => {
    expect(DEFAULT_PRICING['gpt-4o']).toBeDefined();
    expect(DEFAULT_PRICING['claude-3-7-sonnet-latest']).toBeDefined();
    expect(DEFAULT_PRICING['mistral-large-latest']).toBeDefined();
    expect(DEFAULT_PRICING['grok-4']).toBeDefined();
    expect(DEFAULT_PRICING['grok-4-mini']).toBeDefined();
  });

  it('prices Grok-4 at flagship tier', () => {
    const out = computeCost('grok-4', 1_000_000, 1_000_000);
    expect(out.totalUsd).toBeCloseTo(5 + 15);
  });
});

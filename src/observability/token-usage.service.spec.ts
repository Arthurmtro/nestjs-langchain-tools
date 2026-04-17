import { TokenUsageService } from './token-usage.service';

describe('TokenUsageService', () => {
  it('records entries and sums totals with cost breakdown', () => {
    const s = new TokenUsageService();
    s.record({ model: 'gpt-4o', promptTokens: 10, completionTokens: 5 });
    s.record({ model: 'gpt-4o', promptTokens: 2, completionTokens: 3 });
    const totals = s.totals();
    expect(totals.promptTokens).toBe(12);
    expect(totals.completionTokens).toBe(8);
    expect(totals.totalTokens).toBe(20);
    expect(totals.costUsd).toBeCloseTo((12 / 1_000_000) * 2.5 + (8 / 1_000_000) * 10);
  });

  it('notifies subscribers on record', () => {
    const s = new TokenUsageService();
    const spy = jest.fn();
    const unsub = s.subscribe(spy);
    s.record({ model: 'x', promptTokens: 1, completionTokens: 1 });
    expect(spy).toHaveBeenCalledTimes(1);
    unsub();
    s.record({ model: 'x', promptTokens: 1, completionTokens: 1 });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('swallows subscriber errors', () => {
    const s = new TokenUsageService();
    s.subscribe(() => {
      throw new Error('boom');
    });
    expect(() =>
      s.record({ model: 'x', promptTokens: 1, completionTokens: 1 }),
    ).not.toThrow();
  });

  it('segments totals by session', () => {
    const s = new TokenUsageService();
    s.record({ model: 'gpt-4o', promptTokens: 100, completionTokens: 50, sessionId: 'a' });
    s.record({ model: 'gpt-4o', promptTokens: 200, completionTokens: 100, sessionId: 'b' });
    expect(s.totals('a').totalTokens).toBe(150);
    expect(s.totals('b').totalTokens).toBe(300);
    expect(s.totals().totalTokens).toBe(450);
  });

  it('supports overriding the pricing table', () => {
    const s = new TokenUsageService();
    s.setPricing({ 'custom-model': { promptPerMillion: 100, completionPerMillion: 200 } });
    const entry = s.record({ model: 'custom-model', promptTokens: 1_000_000, completionTokens: 500_000 });
    expect(entry.costUsd).toBe(100 + 100);
  });
});

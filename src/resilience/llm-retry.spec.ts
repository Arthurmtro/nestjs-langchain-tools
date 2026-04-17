import { defaultRetryable, withRetry } from './llm-retry';

describe('defaultRetryable', () => {
  it('retries 429', () => {
    expect(defaultRetryable({ status: 429 })).toBe(true);
  });

  it('retries 5xx', () => {
    expect(defaultRetryable({ status: 500 })).toBe(true);
    expect(defaultRetryable({ status: 503 })).toBe(true);
  });

  it('does not retry 4xx other than 429', () => {
    expect(defaultRetryable({ status: 400 })).toBe(false);
    expect(defaultRetryable({ status: 404 })).toBe(false);
  });

  it('retries transient network errors', () => {
    expect(defaultRetryable(new Error('fetch failed'))).toBe(true);
    expect(defaultRetryable(new Error('ECONNRESET triggered'))).toBe(true);
  });

  it('does not retry unrelated errors', () => {
    expect(defaultRetryable(new Error('validation failed'))).toBe(false);
  });
});

describe('withRetry', () => {
  it('returns the result on first success', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    await expect(withRetry(fn)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on retryable error and eventually succeeds', async () => {
    let count = 0;
    const fn = jest.fn().mockImplementation(async () => {
      count += 1;
      if (count < 3) {
        const err = Object.assign(new Error('rate limit'), { status: 429 });
        throw err;
      }
      return 'finally';
    });
    await expect(
      withRetry(fn, {
        maxAttempts: 5,
        initialDelayMs: 1,
        maxDelayMs: 10,
        factor: 2,
      }),
    ).resolves.toBe('finally');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry non-retryable errors', async () => {
    const fn = jest
      .fn()
      .mockRejectedValue(Object.assign(new Error('bad'), { status: 400 }));
    await expect(
      withRetry(fn, {
        maxAttempts: 5,
        initialDelayMs: 1,
        maxDelayMs: 10,
        factor: 2,
      }),
    ).rejects.toThrow('bad');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('throws the last error after maxAttempts', async () => {
    const err = Object.assign(new Error('still throttled'), { status: 429 });
    const fn = jest.fn().mockRejectedValue(err);
    await expect(
      withRetry(fn, {
        maxAttempts: 3,
        initialDelayMs: 1,
        maxDelayMs: 5,
        factor: 2,
      }),
    ).rejects.toThrow('still throttled');
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

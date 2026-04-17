export interface RetryPolicy {
  /** Maximum number of attempts, including the first. */
  maxAttempts: number;
  /** Initial backoff in milliseconds. */
  initialDelayMs: number;
  /** Maximum backoff in milliseconds. */
  maxDelayMs: number;
  /** Backoff exponent (2 doubles each attempt). */
  factor: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 4,
  initialDelayMs: 500,
  maxDelayMs: 10_000,
  factor: 2,
};

export type RetryableCheck = (err: unknown) => boolean;

/** Default predicate: retry on rate-limit (429) and 5xx. */
export const defaultRetryable: RetryableCheck = (err) => {
  const maybeStatus =
    (err as { status?: number; statusCode?: number; response?: { status?: number } }) ?? {};
  const status =
    maybeStatus.status ?? maybeStatus.statusCode ?? maybeStatus.response?.status;
  if (status === 429) return true;
  if (typeof status === 'number' && status >= 500 && status < 600) return true;
  // Generic network hiccups:
  const msg = (err as Error)?.message ?? '';
  return /ECONNRESET|ETIMEDOUT|EAI_AGAIN|fetch failed/i.test(msg);
};

/**
 * Wraps an async function with exponential-backoff retries. The predicate
 * decides whether an error is retryable (non-retryable errors propagate
 * immediately). Jitter is applied to avoid thundering-herd retries.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
  isRetryable: RetryableCheck = defaultRetryable,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === policy.maxAttempts || !isRetryable(err)) {
        throw err;
      }
      const base = policy.initialDelayMs * Math.pow(policy.factor, attempt - 1);
      const capped = Math.min(base, policy.maxDelayMs);
      const jitter = Math.random() * capped * 0.25;
      await new Promise((resolve) => setTimeout(resolve, capped + jitter));
    }
  }
  throw lastError;
}

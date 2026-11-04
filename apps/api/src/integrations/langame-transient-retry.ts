/**
 * Langame occasionally answers one page of a long network-wide read with a
 * gateway error (seen 30.09.2026 on 46.langamepro.ru /guests/bonus_balance,
 * page ~N of 115). Import reads retry such a page instead of leaving the
 * whole day incomplete. Only idempotent provider reads use this; limits and
 * other 4xx answers are never retried.
 */
export const LANGAME_TRANSIENT_RETRY_DELAYS_MS: readonly number[] = [
  2_000, 5_000,
];

/**
 * Langame answers 429 Too Many Requests to a fast walk through a long list
 * (seen 3.11.2026 on ostrov.centralarena.langame.ru /guests/list, page 192
 * after ~50 s of paging). The limit passes with time, so the same page is read
 * again after longer pauses instead of cutting the list short every night.
 */
export const LANGAME_RATE_LIMIT_RETRY_DELAYS_MS: readonly number[] = [
  15_000, 30_000, 60_000, 120_000,
];

const TRANSIENT_ERROR =
  /\b50[234]\b|fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|socket hang up|UND_ERR/i;

export function isLangameTransientError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const cause = (error as { cause?: unknown }).cause;
  return (
    TRANSIENT_ERROR.test(error.message) ||
    (cause instanceof Error && TRANSIENT_ERROR.test(cause.message))
  );
}

const RATE_LIMIT_ERROR = /\b429\b|Too Many Requests/i;

export function isLangameRateLimitError(error: unknown) {
  return error instanceof Error && RATE_LIMIT_ERROR.test(error.message);
}

export async function withLangameTransientRetry<T>(
  read: () => Promise<T>,
  delaysMs: readonly number[] = LANGAME_TRANSIENT_RETRY_DELAYS_MS,
  rateLimitDelaysMs: readonly number[] = LANGAME_RATE_LIMIT_RETRY_DELAYS_MS,
): Promise<T> {
  let transient = 0;
  let limited = 0;
  for (;;) {
    try {
      return await read();
    } catch (error) {
      let delay: number | undefined;
      if (isLangameRateLimitError(error)) {
        delay = rateLimitDelaysMs[limited];
        limited += 1;
      } else if (isLangameTransientError(error)) {
        delay = delaysMs[transient];
        transient += 1;
      }
      if (delay === undefined) throw error;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

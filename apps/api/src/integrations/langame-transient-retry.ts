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

export async function withLangameTransientRetry<T>(
  read: () => Promise<T>,
  delaysMs: readonly number[] = LANGAME_TRANSIENT_RETRY_DELAYS_MS,
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await read();
    } catch (error) {
      if (attempt >= delaysMs.length || !isLangameTransientError(error)) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, delaysMs[attempt]));
    }
  }
}

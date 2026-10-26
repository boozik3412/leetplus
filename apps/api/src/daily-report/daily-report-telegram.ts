import { createHash, randomBytes } from 'node:crypto';

/**
 * The few Bot API calls of the team bot: token check, link updates and
 * messages. Every call takes the fetch implementation, so the worker can route
 * it through the Telegram proxy and tests can stub it.
 */

export const TELEGRAM_API_BASE = 'https://api.telegram.org';
const TOKEN_PATTERN = /^\d{5,15}:[A-Za-z0-9_-]{30,64}$/;
/** A link stays valid for a week; the owner can always issue a new one. */
export const LINK_CODE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type TelegramFetch = typeof fetch;

export type TelegramUpdate = {
  update_id: number;
  message?: {
    text?: string;
    chat?: { id: number; type?: string };
    from?: { first_name?: string; last_name?: string; username?: string };
  };
};

export class TelegramApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Telegram says the bot can no longer write to the chat. */
    readonly chatGone = false,
  ) {
    super(message);
  }
}

export function normalizeBotToken(value: unknown) {
  const token = typeof value === 'string' ? value.trim() : '';
  return TOKEN_PATTERN.test(token) ? token : null;
}

/** What the settings page shows instead of the token. */
export function tokenHint(token: string) {
  return `${token.split(':')[0]}:…${token.slice(-4)}`;
}

export function newLinkCode() {
  return randomBytes(18).toString('base64url');
}

export function hashLinkCode(code: string) {
  return createHash('sha256').update(code, 'utf8').digest('hex');
}

/** `/start <code>` from a deep link; null for any other text. */
export function linkCodeFromText(text: string | undefined) {
  const match = /^\/start(?:@\w+)?\s+([A-Za-z0-9_-]{16,64})\s*$/.exec(
    text ?? '',
  );
  return match ? match[1] : null;
}

async function call<T>(
  fetchImpl: TelegramFetch,
  token: string,
  method: string,
  body: Record<string, unknown>,
  timeoutMs = 20_000,
): Promise<T> {
  const response = await fetchImpl(
    `${TELEGRAM_API_BASE}/bot${token}/${method}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    },
  );
  const payload = (await response.json().catch(() => null)) as {
    ok?: boolean;
    result?: T;
    description?: string;
  } | null;
  if (!response.ok || !payload?.ok) {
    const description = payload?.description ?? `HTTP ${response.status}`;
    throw new TelegramApiError(
      `Telegram ${method}: ${description}`.slice(0, 300),
      response.status,
      response.status === 403 ||
        /chat not found|bot was blocked|user is deactivated/i.test(description),
    );
  }
  return payload.result as T;
}

export function getMe(fetchImpl: TelegramFetch, token: string) {
  return call<{ username?: string }>(fetchImpl, token, 'getMe', {});
}

export function getUpdates(
  fetchImpl: TelegramFetch,
  token: string,
  offset: number,
) {
  return call<TelegramUpdate[]>(fetchImpl, token, 'getUpdates', {
    offset,
    timeout: 0,
    allowed_updates: ['message'],
  });
}

export function sendMessage(
  fetchImpl: TelegramFetch,
  token: string,
  chatId: string,
  text: string,
  html = true,
) {
  return call<unknown>(fetchImpl, token, 'sendMessage', {
    chat_id: chatId,
    text,
    ...(html ? { parse_mode: 'HTML' } : {}),
    link_preview_options: { is_disabled: true },
  });
}

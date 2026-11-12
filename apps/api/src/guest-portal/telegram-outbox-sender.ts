import type {
  TelegramEdgeConfig,
  TelegramEdgeFetch,
  TelegramEdgeLogger,
} from './telegram-edge-adapter';
import {
  buildTelegramSendMessageBody,
  isTelegramSendMessageProjectionError,
} from './telegram-send-message-payload';

// Outbox sender of the bot poller: claims queued guest messages from the
// LeetPlus API (staff replies, later campaign messages), sends them through the
// poller's own Telegram egress and reports each outcome. Off unless the edge
// has its own outbox token; the API never talks to Telegram for this.

export type TelegramOutboxConfig = {
  enabled: boolean;
  token: string;
  basePath: string;
  intervalMs: number;
  batchSize: number;
  sendDelayMs: number;
};

export type TelegramOutboxClaimedMessage = {
  id: string;
  claimToken: string;
  chatId: string;
  text: string;
  replyMarkup: unknown;
};

export type TelegramOutboxOutcome = 'SENT' | 'RETRY' | 'FAILED' | 'BLOCKED';

export type TelegramOutboxReport = {
  id: string;
  claimToken: string;
  outcome: TelegramOutboxOutcome;
  telegramMessageId?: string | null;
  errorCode?: string | null;
  retryAfterSeconds?: number | null;
};

export type TelegramOutboxTickResult = {
  claimed: number;
  sent: number;
  retried: number;
  failed: number;
  blocked: number;
};

export type TelegramOutboxDeps = {
  leetPlusFetch?: TelegramEdgeFetch;
  telegramFetch?: TelegramEdgeFetch;
  logger?: TelegramEdgeLogger;
  shouldStop?: () => boolean;
  delay?: (ms: number) => Promise<void>;
};

const defaultBasePath = '/guests/communications/telegram-outbox';

export function loadTelegramOutboxConfig(
  env: Record<string, string | undefined>,
): TelegramOutboxConfig {
  const token = env.GUEST_GAME_TG_EDGE_OUTBOX_TOKEN?.trim() ?? '';
  return {
    enabled: token.length >= 32,
    token,
    basePath:
      env.GUEST_GAME_TG_EDGE_OUTBOX_PATH?.trim().replace(/\/$/, '') ||
      defaultBasePath,
    intervalMs: boundedInt(
      env.GUEST_GAME_TG_EDGE_OUTBOX_INTERVAL_MS,
      3000,
      1000,
      60_000,
    ),
    batchSize: boundedInt(env.GUEST_GAME_TG_EDGE_OUTBOX_BATCH, 20, 1, 50),
    // Telegram allows about 30 messages a second per bot; Tor is slower still.
    sendDelayMs: boundedInt(
      env.GUEST_GAME_TG_EDGE_OUTBOX_SEND_DELAY_MS,
      60,
      0,
      5000,
    ),
  };
}

export async function runTelegramOutboxTick(
  edgeConfig: TelegramEdgeConfig,
  outboxConfig: TelegramOutboxConfig,
  deps: TelegramOutboxDeps = {},
): Promise<TelegramOutboxTickResult> {
  const result: TelegramOutboxTickResult = {
    claimed: 0,
    sent: 0,
    retried: 0,
    failed: 0,
    blocked: 0,
  };
  if (!outboxConfig.enabled || edgeConfig.dryRun) {
    return result;
  }
  const leetPlusFetch = deps.leetPlusFetch ?? fetch;
  const telegramFetch = deps.telegramFetch ?? fetch;
  const logger = deps.logger ?? console;
  const wait = deps.delay ?? delay;

  const claim = await apiPost<{ messages?: unknown }>(
    leetPlusFetch,
    `${edgeConfig.leetPlusApiUrl}${outboxConfig.basePath}/claim`,
    outboxConfig.token,
    { limit: outboxConfig.batchSize },
    edgeConfig.requestTimeoutMs,
  );
  const messages = claimedMessages(claim.messages);
  result.claimed = messages.length;
  if (!messages.length) {
    return result;
  }

  const reports: TelegramOutboxReport[] = [];
  for (const [index, message] of messages.entries()) {
    if (deps.shouldStop?.()) {
      // Unsent claims return to the queue when their lease runs out.
      break;
    }
    if (index > 0 && outboxConfig.sendDelayMs > 0) {
      await wait(outboxConfig.sendDelayMs);
    }
    const report = await sendOutboxMessage(edgeConfig, telegramFetch, message);
    reports.push(report);
    if (report.outcome === 'SENT') result.sent += 1;
    if (report.outcome === 'RETRY') result.retried += 1;
    if (report.outcome === 'FAILED') result.failed += 1;
    if (report.outcome === 'BLOCKED') result.blocked += 1;
  }

  await apiPost(
    leetPlusFetch,
    `${edgeConfig.leetPlusApiUrl}${outboxConfig.basePath}/report`,
    outboxConfig.token,
    { results: reports },
    edgeConfig.requestTimeoutMs,
  );
  logger.log(
    `Telegram outbox claimed=${result.claimed} sent=${result.sent} retry=${result.retried} failed=${result.failed} blocked=${result.blocked}`,
  );
  return result;
}

export async function sendOutboxMessage(
  edgeConfig: TelegramEdgeConfig,
  telegramFetch: TelegramEdgeFetch,
  message: TelegramOutboxClaimedMessage,
): Promise<TelegramOutboxReport> {
  const base = { id: message.id, claimToken: message.claimToken };
  let body;
  try {
    body = buildTelegramSendMessageBody({
      chatId: message.chatId,
      text: message.text,
      replyMarkup: message.replyMarkup ?? undefined,
    });
  } catch (error) {
    if (isTelegramSendMessageProjectionError(error)) {
      return { ...base, outcome: 'FAILED', errorCode: 'UNSAFE_PAYLOAD' };
    }
    throw error;
  }

  let status: number;
  let payload: Record<string, unknown> | null;
  try {
    const response = await telegramFetch(
      `${edgeConfig.telegramApiBaseUrl}/bot${edgeConfig.botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(edgeConfig.requestTimeoutMs),
      },
    );
    status = response.status;
    payload = parseObject(await response.text());
  } catch {
    // Timeouts and Tor/proxy failures: the message may still be delivered
    // later, so it goes back to the queue.
    return { ...base, outcome: 'RETRY', errorCode: 'NETWORK' };
  }

  if (status === 200 && payload?.ok === true) {
    const result = payload.result as Record<string, unknown> | undefined;
    const messageId = result?.message_id;
    return {
      ...base,
      outcome: 'SENT',
      telegramMessageId:
        typeof messageId === 'number' || typeof messageId === 'string'
          ? String(messageId)
          : null,
    };
  }
  return { ...base, ...classifyTelegramFailure(status, payload) };
}

export function classifyTelegramFailure(
  status: number,
  payload: Record<string, unknown> | null,
): Pick<TelegramOutboxReport, 'outcome' | 'errorCode' | 'retryAfterSeconds'> {
  const code =
    typeof payload?.error_code === 'number' ? payload.error_code : status;
  const description =
    typeof payload?.description === 'string'
      ? payload.description.toLowerCase()
      : '';
  if (code === 429) {
    const parameters = payload?.parameters as
      | Record<string, unknown>
      | undefined;
    const retryAfter = parameters?.retry_after;
    return {
      outcome: 'RETRY',
      errorCode: 'TELEGRAM_429',
      retryAfterSeconds: typeof retryAfter === 'number' ? retryAfter : null,
    };
  }
  // The guest blocked the bot, deleted the account or never opened the chat.
  if (code === 403) {
    return { outcome: 'BLOCKED', errorCode: 'TELEGRAM_403' };
  }
  if (code === 400 && description.includes('chat not found')) {
    return { outcome: 'BLOCKED', errorCode: 'CHAT_NOT_FOUND' };
  }
  if (code >= 500 || code === 0) {
    return { outcome: 'RETRY', errorCode: `TELEGRAM_${code}` };
  }
  return { outcome: 'FAILED', errorCode: `TELEGRAM_${code}` };
}

async function apiPost<T>(
  fetchImpl: TelegramEdgeFetch,
  url: string,
  token: string,
  body: unknown,
  timeoutMs: number,
): Promise<T> {
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-telegram-outbox-token': token,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`LeetPlus outbox HTTP ${response.status}`);
  }
  return (parseObject(text) ?? {}) as T;
}

function claimedMessages(value: unknown): TelegramOutboxClaimedMessage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const row = item as Record<string, unknown> | null;
    if (
      !row ||
      typeof row.id !== 'string' ||
      typeof row.claimToken !== 'string' ||
      typeof row.chatId !== 'string' ||
      !/^-?\d{1,20}$/.test(row.chatId) ||
      typeof row.text !== 'string'
    ) {
      return [];
    }
    return [
      {
        id: row.id,
        claimToken: row.claimToken,
        chatId: row.chatId,
        text: row.text,
        replyMarkup: row.replyMarkup ?? null,
      },
    ];
  });
}

function parseObject(text: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function boundedInt(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
) {
  const parsed = Number(value);
  if (!value?.trim() || !Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

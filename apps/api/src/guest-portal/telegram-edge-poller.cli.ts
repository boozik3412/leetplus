import { mkdir, readFile, rename, writeFile } from 'fs/promises';
import { dirname } from 'path';

import { assertStandaloneProcessAllowed } from '../config/design-partner-runtime-policy';
import {
  handleTelegramEdgeWebhook,
  loadTelegramEdgeConfig,
  type TelegramEdgeConfig,
  type TelegramEdgeFetch,
  type TelegramEdgeLogger,
} from './telegram-edge-adapter';
import {
  createTelegramBotApiFetch,
  loadTelegramBotApiProxyUrl,
  maskTelegramBotApiProxyUrl,
} from './telegram-bot-api-fetch';

export type TelegramPollingConfig = {
  allowedUpdates: string[];
  deleteWebhookOnStart: boolean;
  dropPendingUpdatesOnDelete: boolean;
  heartbeatMaxAgeMs: number;
  heartbeatPath: string;
  limit: number;
  retryDelayMs: number;
  statePath: string;
  timeoutSeconds: number;
};

export type TelegramPollingErrorCategory =
  | 'CONNECT'
  | 'DNS'
  | 'FETCH'
  | 'HTTP'
  | 'SOCKS'
  | 'TIMEOUT'
  | 'TLS'
  | 'UNKNOWN';

export type TelegramPollingHeartbeat = {
  consecutiveFailures: number;
  errorCategory: TelegramPollingErrorCategory | null;
  errorCode: string | null;
  lastErrorAt: string | null;
  lastPollStartedAt: string;
  lastPollSucceededAt: string | null;
  offset: number | null;
  status: 'ERROR' | 'OK';
  updatedAt: string;
  version: 1;
};

export type TelegramPollingHealth = {
  ageMs: number | null;
  consecutiveFailures: number | null;
  healthy: boolean;
  reason: 'HEALTHY' | 'INVALID_HEARTBEAT' | 'NO_SUCCESS' | 'STALE';
};

export type TelegramUpdateItem = Record<string, unknown> & {
  update_id?: unknown;
};

type TelegramApiEnvelope<T> = {
  ok?: unknown;
  description?: unknown;
  result?: T;
};

export type TelegramEdgeWebhookResult = {
  dryRun?: unknown;
  replySent?: unknown;
  upstreamAction?: unknown;
  upstreamStatus?: unknown;
};

export type TelegramPollingDeps = {
  fetch?: TelegramEdgeFetch;
  leetPlusFetch?: TelegramEdgeFetch;
  handleUpdate?: (
    config: TelegramEdgeConfig,
    update: TelegramUpdateItem,
    deps: {
      fetch?: TelegramEdgeFetch;
      logger?: TelegramEdgeLogger;
      telegramFetch?: TelegramEdgeFetch;
    },
  ) => Promise<TelegramEdgeWebhookResult>;
  logger?: TelegramEdgeLogger;
  shouldStop?: () => boolean;
};

export type TelegramPollingTickResult = {
  handled: number;
  offset: number | null;
  received: number;
};

const defaultAllowedUpdates = ['message', 'edited_message', 'callback_query'];
const defaultPollingLimit = 100;
const defaultPollingRetryDelayMs = 5000;
const defaultPollingStatePath = '/app/data/telegram-poller-state.json';
const defaultPollingHeartbeatPath = '/app/data/telegram-poller-heartbeat.json';
const defaultPollingHeartbeatMaxAgeMs = 150_000;
const defaultPollingTimeoutSeconds = 50;

async function main() {
  assertStandaloneProcessAllowed(
    process.env,
    'GUEST_GAME_TG_EDGE_POLLER_ENABLED',
    {
      GUEST_GAME_TG_EDGE_DRY_RUN: 'true',
      GUEST_GAME_TG_EDGE_POLLING_DELETE_WEBHOOK_ON_START: 'false',
    },
    'GUEST_GAME_TG_EDGE_LEETPLUS_API_URL',
  );

  const edgeConfig = loadTelegramEdgeConfig(process.env);
  const pollingConfig = loadTelegramPollingConfig(process.env);
  const telegramFetchImpl = createTelegramBotApiFetch(process.env);
  const telegramProxyUrl = loadTelegramBotApiProxyUrl(process.env);
  const logger = console;
  let stopRequested = false;

  process.once('SIGINT', () => {
    stopRequested = true;
    logger.log('Telegram poller received SIGINT, stopping after current tick.');
  });
  process.once('SIGTERM', () => {
    stopRequested = true;
    logger.log(
      'Telegram poller received SIGTERM, stopping after current tick.',
    );
  });

  validatePollingConfig(edgeConfig, pollingConfig);

  if (pollingConfig.deleteWebhookOnStart) {
    await deleteTelegramWebhook(
      edgeConfig,
      pollingConfig,
      telegramFetchImpl,
      logger,
    );
  }

  let offset = await readPollingOffset(pollingConfig.statePath);
  let consecutiveFailures = 0;
  let lastPollSucceededAt: string | null = null;

  logger.log(
    `Telegram poller started timeout=${pollingConfig.timeoutSeconds}s limit=${pollingConfig.limit} offset=${offset ?? '-'}`,
  );
  if (telegramProxyUrl) {
    logger.log(
      `Telegram poller Bot API proxy=${maskTelegramBotApiProxyUrl(
        telegramProxyUrl,
      )}`,
    );
  }

  while (!stopRequested) {
    const lastPollStartedAt = new Date().toISOString();

    try {
      const tick = await runTelegramPollingTick(
        edgeConfig,
        pollingConfig,
        offset,
        {
          fetch: telegramFetchImpl,
          leetPlusFetch: fetch,
          logger,
          shouldStop: () => stopRequested,
        },
      );
      offset = tick.offset;
      consecutiveFailures = 0;
      lastPollSucceededAt = new Date().toISOString();
      await writePollingHeartbeat(pollingConfig.heartbeatPath, {
        consecutiveFailures,
        errorCategory: null,
        errorCode: null,
        lastErrorAt: null,
        lastPollStartedAt,
        lastPollSucceededAt,
        offset,
        status: 'OK',
        updatedAt: lastPollSucceededAt,
        version: 1,
      });
    } catch (error) {
      consecutiveFailures += 1;
      const failure = telegramPollingFailure(error);
      const lastErrorAt = new Date().toISOString();

      logger.error(
        `Telegram poller tick failed category=${failure.category} code=${
          failure.code ?? '-'
        }: ${safeErrorMessage(error)}`,
      );
      await writePollingHeartbeat(pollingConfig.heartbeatPath, {
        consecutiveFailures,
        errorCategory: failure.category,
        errorCode: failure.code,
        lastErrorAt,
        lastPollStartedAt,
        lastPollSucceededAt,
        offset,
        status: 'ERROR',
        updatedAt: lastErrorAt,
        version: 1,
      });
      await delay(pollingConfig.retryDelayMs);
    }
  }

  logger.log('Telegram poller stopped.');
}

export function loadTelegramPollingConfig(
  env: Record<string, string | undefined>,
): TelegramPollingConfig {
  return {
    allowedUpdates: parseCsv(
      env.GUEST_GAME_TG_EDGE_POLLING_ALLOWED_UPDATES,
      defaultAllowedUpdates,
    ),
    deleteWebhookOnStart: parseBoolean(
      env.GUEST_GAME_TG_EDGE_POLLING_DELETE_WEBHOOK_ON_START,
      true,
    ),
    dropPendingUpdatesOnDelete: parseBoolean(
      env.GUEST_GAME_TG_EDGE_POLLING_DROP_PENDING_UPDATES,
      false,
    ),
    heartbeatMaxAgeMs: parseBoundedInt(
      env.GUEST_GAME_TG_EDGE_POLLING_HEARTBEAT_MAX_AGE_MS,
      defaultPollingHeartbeatMaxAgeMs,
      60_000,
      900_000,
    ),
    heartbeatPath:
      env.GUEST_GAME_TG_EDGE_POLLING_HEARTBEAT_PATH?.trim() ||
      defaultPollingHeartbeatPath,
    limit: parseBoundedInt(
      env.GUEST_GAME_TG_EDGE_POLLING_LIMIT,
      defaultPollingLimit,
      1,
      100,
    ),
    retryDelayMs: parseBoundedInt(
      env.GUEST_GAME_TG_EDGE_POLLING_RETRY_DELAY_MS,
      defaultPollingRetryDelayMs,
      1000,
      120_000,
    ),
    statePath:
      env.GUEST_GAME_TG_EDGE_POLLING_STATE_PATH?.trim() ||
      defaultPollingStatePath,
    timeoutSeconds: parseBoundedInt(
      env.GUEST_GAME_TG_EDGE_POLLING_TIMEOUT_SECONDS,
      defaultPollingTimeoutSeconds,
      1,
      50,
    ),
  };
}

export function validatePollingConfig(
  edgeConfig: TelegramEdgeConfig,
  pollingConfig: TelegramPollingConfig,
) {
  if (!edgeConfig.botToken) {
    throw new Error('GUEST_GAME_TG_EDGE_BOT_TOKEN is required for polling.');
  }

  if (pollingConfig.allowedUpdates.length === 0) {
    throw new Error(
      'At least one Telegram polling allowed update is required.',
    );
  }
}

export async function runTelegramPollingTick(
  edgeConfig: TelegramEdgeConfig,
  pollingConfig: TelegramPollingConfig,
  offset: number | null,
  deps: TelegramPollingDeps = {},
): Promise<TelegramPollingTickResult> {
  const fetchImpl = deps.fetch ?? fetch;
  const leetPlusFetchImpl = deps.leetPlusFetch ?? fetchImpl;
  const logger = deps.logger ?? console;
  const handleUpdate: NonNullable<TelegramPollingDeps['handleUpdate']> =
    deps.handleUpdate ??
    (async (config, update, updateDeps) =>
      await handleTelegramEdgeWebhook(config, update, updateDeps));
  const updates = await getTelegramUpdates(
    edgeConfig,
    pollingConfig,
    offset,
    fetchImpl,
  );
  let nextOffset = offset;
  let handled = 0;

  if (updates.length > 0) {
    logger.log(
      `Telegram poller received updates count=${updates.length} offset=${offset ?? '-'}`,
    );
  }

  for (const update of updates) {
    if (deps.shouldStop?.()) {
      break;
    }

    const updateId = telegramUpdateId(update);
    if (updateId !== null && nextOffset !== null && updateId < nextOffset) {
      logger.warn(
        `Telegram poller skipped stale update=${updateId} currentOffset=${nextOffset}`,
      );
      continue;
    }

    const result = await handleUpdate(edgeConfig, update, {
      fetch: leetPlusFetchImpl,
      logger,
      telegramFetch: fetchImpl,
    });

    if (updateId !== null) {
      nextOffset = updateId + 1;
      await writePollingOffset(pollingConfig.statePath, nextOffset);
    }

    handled += 1;
    logger.log(
      `Telegram poller handled update=${updateId ?? '-'} action=${stringValue(
        result.upstreamAction,
      )} status=${stringValue(result.upstreamStatus)} replySent=${String(
        result.replySent === true,
      )} dryRun=${String(result.dryRun === true)}`,
    );
  }

  return {
    handled,
    offset: nextOffset,
    received: updates.length,
  };
}

export async function deleteTelegramWebhook(
  edgeConfig: TelegramEdgeConfig,
  pollingConfig: TelegramPollingConfig,
  fetchImpl: TelegramEdgeFetch,
  logger: TelegramEdgeLogger,
) {
  await telegramApiPost<boolean>(
    edgeConfig,
    'deleteWebhook',
    { drop_pending_updates: pollingConfig.dropPendingUpdatesOnDelete },
    fetchImpl,
    edgeConfig.requestTimeoutMs,
  );
  logger.log(
    `Telegram poller deleteWebhook dropPendingUpdates=${String(
      pollingConfig.dropPendingUpdatesOnDelete,
    )}`,
  );
}

export async function getTelegramUpdates(
  edgeConfig: TelegramEdgeConfig,
  pollingConfig: TelegramPollingConfig,
  offset: number | null,
  fetchImpl: TelegramEdgeFetch,
) {
  return telegramApiPost<TelegramUpdateItem[]>(
    edgeConfig,
    'getUpdates',
    {
      allowed_updates: pollingConfig.allowedUpdates,
      limit: pollingConfig.limit,
      offset: offset ?? undefined,
      timeout: pollingConfig.timeoutSeconds,
    },
    fetchImpl,
    Math.max(
      edgeConfig.requestTimeoutMs,
      (pollingConfig.timeoutSeconds + 5) * 1000,
    ),
  );
}

async function telegramApiPost<T>(
  edgeConfig: TelegramEdgeConfig,
  method: string,
  body: Record<string, unknown>,
  fetchImpl: TelegramEdgeFetch,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(
      `${edgeConfig.telegramApiBaseUrl}/bot${edgeConfig.botToken}/${method}`,
      {
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
        signal: controller.signal,
      },
    );
    const text = await response.text();
    const payload = parseJson<TelegramApiEnvelope<T>>(text);

    if (!response.ok) {
      throw new Error(
        `Telegram ${method} HTTP ${response.status}: ${bounded(text, 500)}`,
      );
    }

    if (payload.ok !== true) {
      throw new Error(
        typeof payload.description === 'string'
          ? payload.description
          : `Telegram ${method} returned ok=false.`,
      );
    }

    return payload.result as T;
  } finally {
    clearTimeout(timeout);
  }
}

export async function readPollingOffset(path: string) {
  try {
    const raw = await readFile(path, 'utf8');
    const parsed = JSON.parse(raw) as { offset?: unknown };

    return normalizedOffset(parsed.offset);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

export async function writePollingOffset(path: string, offset: number) {
  await writeJsonState(path, {
    offset,
    updatedAt: new Date().toISOString(),
  });
}

export async function readPollingHeartbeat(path: string) {
  try {
    const raw = await readFile(path, 'utf8');

    return normalizeTelegramPollingHeartbeat(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

export async function writePollingHeartbeat(
  path: string,
  heartbeat: TelegramPollingHeartbeat,
) {
  await writeJsonState(path, heartbeat);
}

export function evaluateTelegramPollingHealth(
  heartbeat: TelegramPollingHeartbeat | null,
  maxAgeMs: number,
  nowMs = Date.now(),
): TelegramPollingHealth {
  if (!heartbeat) {
    return {
      ageMs: null,
      consecutiveFailures: null,
      healthy: false,
      reason: 'INVALID_HEARTBEAT',
    };
  }

  if (!heartbeat.lastPollSucceededAt) {
    return {
      ageMs: null,
      consecutiveFailures: heartbeat.consecutiveFailures,
      healthy: false,
      reason: 'NO_SUCCESS',
    };
  }

  const succeededAtMs = Date.parse(heartbeat.lastPollSucceededAt);

  if (!Number.isFinite(succeededAtMs)) {
    return {
      ageMs: null,
      consecutiveFailures: heartbeat.consecutiveFailures,
      healthy: false,
      reason: 'INVALID_HEARTBEAT',
    };
  }

  const ageMs = Math.max(0, nowMs - succeededAtMs);

  return {
    ageMs,
    consecutiveFailures: heartbeat.consecutiveFailures,
    healthy: ageMs <= maxAgeMs,
    reason: ageMs <= maxAgeMs ? 'HEALTHY' : 'STALE',
  };
}

export function telegramPollingFailure(error: unknown): {
  category: TelegramPollingErrorCategory;
  code: string | null;
} {
  const chain = errorChain(error);
  const code =
    chain
      .map((item) => safeErrorCode(item))
      .find((value): value is string => value !== null) ?? null;
  const summary = chain
    .map((item) =>
      item instanceof Error
        ? `${item.name} ${item.message}`
        : typeof item === 'string'
          ? item
          : '',
    )
    .join(' ')
    .toUpperCase();

  if (
    summary.includes('ABORTERROR') ||
    summary.includes('TIMEOUT') ||
    code === 'ETIMEDOUT' ||
    code === 'UND_ERR_CONNECT_TIMEOUT' ||
    code === 'UND_ERR_HEADERS_TIMEOUT'
  ) {
    return { category: 'TIMEOUT', code };
  }
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || summary.includes('DNS')) {
    return { category: 'DNS', code };
  }
  if (summary.includes('SOCKS')) {
    return { category: 'SOCKS', code };
  }
  if (
    summary.includes('CERTIFICATE') ||
    summary.includes(' TLS ') ||
    code?.includes('CERT') ||
    code?.includes('TLS')
  ) {
    return { category: 'TLS', code };
  }
  if (/TELEGRAM \S+ HTTP \d{3}/.test(summary)) {
    return { category: 'HTTP', code };
  }
  if (
    code === 'ECONNREFUSED' ||
    code === 'ECONNRESET' ||
    code === 'EHOSTUNREACH' ||
    code === 'ENETUNREACH' ||
    code === 'UND_ERR_SOCKET'
  ) {
    return { category: 'CONNECT', code };
  }
  if (summary.includes('FETCH')) {
    return { category: 'FETCH', code };
  }

  return { category: 'UNKNOWN', code };
}

async function writeJsonState(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  const tmpPath = `${path}.${process.pid}.tmp`;

  await writeFile(tmpPath, `${JSON.stringify(value)}\n`, 'utf8');
  await rename(tmpPath, path);
}

function normalizeTelegramPollingHeartbeat(
  value: unknown,
): TelegramPollingHeartbeat | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const heartbeat = value as Partial<TelegramPollingHeartbeat>;
  const offset =
    heartbeat.offset === null ? null : normalizedOffset(heartbeat.offset);

  if (
    heartbeat.version !== 1 ||
    (heartbeat.status !== 'OK' && heartbeat.status !== 'ERROR') ||
    typeof heartbeat.consecutiveFailures !== 'number' ||
    !Number.isSafeInteger(heartbeat.consecutiveFailures) ||
    heartbeat.consecutiveFailures < 0 ||
    typeof heartbeat.lastPollStartedAt !== 'string' ||
    (heartbeat.lastPollSucceededAt !== null &&
      typeof heartbeat.lastPollSucceededAt !== 'string') ||
    typeof heartbeat.updatedAt !== 'string' ||
    (heartbeat.offset !== null && offset === null)
  ) {
    return null;
  }

  return {
    consecutiveFailures: heartbeat.consecutiveFailures,
    errorCategory: isTelegramPollingErrorCategory(heartbeat.errorCategory)
      ? heartbeat.errorCategory
      : null,
    errorCode:
      typeof heartbeat.errorCode === 'string' ? heartbeat.errorCode : null,
    lastErrorAt:
      typeof heartbeat.lastErrorAt === 'string' ? heartbeat.lastErrorAt : null,
    lastPollStartedAt: heartbeat.lastPollStartedAt,
    lastPollSucceededAt: heartbeat.lastPollSucceededAt,
    offset,
    status: heartbeat.status,
    updatedAt: heartbeat.updatedAt,
    version: 1,
  };
}

function telegramUpdateId(update: TelegramUpdateItem) {
  return normalizedOffset(update.update_id);
}

function normalizedOffset(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null;
  }

  return Math.trunc(value);
}

function parseCsv(value: string | undefined, fallback: string[]) {
  if (!value?.trim()) {
    return fallback;
  }

  const parsed = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return parsed.length > 0 ? parsed : fallback;
}

function parseBoundedInt(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
) {
  if (!value?.trim()) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (!value?.trim()) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();

  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return fallback;
}

function parseJson<T>(text: string): T {
  if (!text.trim()) {
    return {} as T;
  }

  return JSON.parse(text) as T;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : '-';
}

function errorChain(error: unknown) {
  const chain: unknown[] = [];
  let current = error;

  for (let depth = 0; depth < 5 && current !== null; depth += 1) {
    chain.push(current);
    current =
      typeof current === 'object' && current && 'cause' in current
        ? ((current as { cause?: unknown }).cause ?? null)
        : null;
  }

  return chain;
}

function safeErrorCode(error: unknown) {
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return null;
  }

  const code = (error as { code?: unknown }).code;

  return typeof code === 'string' && /^[A-Z0-9_]{1,80}$/.test(code)
    ? code
    : null;
}

function isTelegramPollingErrorCategory(
  value: unknown,
): value is TelegramPollingErrorCategory {
  return (
    typeof value === 'string' &&
    [
      'CONNECT',
      'DNS',
      'FETCH',
      'HTTP',
      'SOCKS',
      'TIMEOUT',
      'TLS',
      'UNKNOWN',
    ].includes(value)
  );
}

function safeErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return bounded(error.message, 500);
  }

  return bounded(String(error), 500);
}

function bounded(value: string, maxLength: number) {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(`Telegram poller failed: ${safeErrorMessage(error)}`);
    process.exitCode = 1;
  });
}

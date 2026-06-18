import { mkdir, readFile, rename, writeFile } from 'fs/promises';
import { dirname } from 'path';

import {
  handleTelegramEdgeWebhook,
  loadTelegramEdgeConfig,
  type TelegramEdgeConfig,
  type TelegramEdgeFetch,
  type TelegramEdgeLogger,
} from './telegram-edge-adapter';

export type TelegramPollingConfig = {
  allowedUpdates: string[];
  deleteWebhookOnStart: boolean;
  dropPendingUpdatesOnDelete: boolean;
  limit: number;
  retryDelayMs: number;
  statePath: string;
  timeoutSeconds: number;
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
  handleUpdate?: (
    config: TelegramEdgeConfig,
    update: TelegramUpdateItem,
    deps: { fetch?: TelegramEdgeFetch; logger?: TelegramEdgeLogger },
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
const defaultPollingTimeoutSeconds = 50;

async function main() {
  const edgeConfig = loadTelegramEdgeConfig(process.env);
  const pollingConfig = loadTelegramPollingConfig(process.env);
  const fetchImpl = fetch;
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
    await deleteTelegramWebhook(edgeConfig, pollingConfig, fetchImpl, logger);
  }

  let offset = await readPollingOffset(pollingConfig.statePath);

  logger.log(
    `Telegram poller started timeout=${pollingConfig.timeoutSeconds}s limit=${pollingConfig.limit} offset=${offset ?? '-'}`,
  );

  while (!stopRequested) {
    try {
      const tick = await runTelegramPollingTick(
        edgeConfig,
        pollingConfig,
        offset,
        {
          fetch: fetchImpl,
          logger,
          shouldStop: () => stopRequested,
        },
      );
      offset = tick.offset;
    } catch (error) {
      logger.error(`Telegram poller tick failed: ${safeErrorMessage(error)}`);
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
    const result = await handleUpdate(edgeConfig, update, {
      fetch: fetchImpl,
      logger,
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
  await mkdir(dirname(path), { recursive: true });
  const tmpPath = `${path}.${process.pid}.tmp`;

  await writeFile(
    tmpPath,
    `${JSON.stringify({ offset, updatedAt: new Date().toISOString() })}\n`,
    'utf8',
  );
  await rename(tmpPath, path);
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

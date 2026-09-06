import { readFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

import type {
  TelegramEdgeConfig,
  TelegramEdgeFetch,
} from './telegram-edge-adapter';
import {
  deleteTelegramWebhook,
  evaluateTelegramPollingHealth,
  getTelegramUpdates,
  loadTelegramPollingConfig,
  readPollingHeartbeat,
  readPollingOffset,
  runTelegramPollingTick,
  telegramPollingFailure,
  validatePollingConfig,
  writePollingHeartbeat,
  writePollingOffset,
  type TelegramPollingHeartbeat,
  type TelegramPollingConfig,
} from './telegram-edge-poller.cli';

describe('telegram edge poller', () => {
  const edgeConfig: TelegramEdgeConfig = {
    host: '127.0.0.1',
    port: 4010,
    leetPlusApiUrl: 'https://api.leetplus.test',
    leetPlusWebhookPath: '/guest-portal/telegram/webhook',
    webhookSecret: 'telegram-secret',
    botToken: 'bot-token',
    telegramApiBaseUrl: 'https://tg-proxy.test',
    dryRun: false,
    requestTimeoutMs: 15000,
    healthSecret: null,
    maxBodyBytes: 128 * 1024,
  };

  const pollingConfig: TelegramPollingConfig = {
    allowedUpdates: ['message', 'callback_query'],
    deleteWebhookOnStart: true,
    dropPendingUpdatesOnDelete: false,
    heartbeatMaxAgeMs: 150_000,
    heartbeatPath: join(
      tmpdir(),
      `leetplus-telegram-poller-heartbeat-${process.pid}.json`,
    ),
    limit: 100,
    retryDelayMs: 5000,
    statePath: join(tmpdir(), `leetplus-telegram-poller-${process.pid}.json`),
    timeoutSeconds: 50,
  };

  afterEach(async () => {
    await rm(pollingConfig.statePath, { force: true });
    await rm(pollingConfig.heartbeatPath, { force: true });
  });

  it('loads polling config with safe 1337 defaults', () => {
    const config = loadTelegramPollingConfig({});

    expect(config).toMatchObject({
      allowedUpdates: ['message', 'edited_message', 'callback_query'],
      deleteWebhookOnStart: true,
      dropPendingUpdatesOnDelete: false,
      heartbeatMaxAgeMs: 150_000,
      heartbeatPath: '/app/data/telegram-poller-heartbeat.json',
      limit: 100,
      retryDelayMs: 5000,
      statePath: '/app/data/telegram-poller-state.json',
      timeoutSeconds: 50,
    });
  });

  it('requires a bot token for polling', () => {
    expect(() =>
      validatePollingConfig({ ...edgeConfig, botToken: '' }, pollingConfig),
    ).toThrow('GUEST_GAME_TG_EDGE_BOT_TOKEN is required for polling.');
  });

  it('deletes webhook on startup without dropping pending updates by default', async () => {
    const fetchMock = jsonFetchMock(true);

    await deleteTelegramWebhook(
      edgeConfig,
      pollingConfig,
      fetchMock,
      silentLogger,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];

    expect(url).toBe('https://tg-proxy.test/botbot-token/deleteWebhook');
    expect(jsonBody(init)).toEqual({ drop_pending_updates: false });
  });

  it('calls getUpdates with offset, timeout, limit and allowed updates', async () => {
    const fetchMock = jsonFetchMock([{ update_id: 101 }]);
    const updates = await getTelegramUpdates(
      edgeConfig,
      pollingConfig,
      77,
      fetchMock,
    );
    const [url, init] = fetchMock.mock.calls[0] ?? [];

    expect(updates).toEqual([{ update_id: 101 }]);
    expect(url).toBe('https://tg-proxy.test/botbot-token/getUpdates');
    expect(jsonBody(init)).toEqual({
      allowed_updates: ['message', 'callback_query'],
      limit: 100,
      offset: 77,
      timeout: 50,
    });
  });

  it('handles updates through LeetPlus edge adapter and persists the next offset', async () => {
    const fetchMock = jsonFetchMock([
      { update_id: 10, message: { text: '/start lp_TEST' } },
      { update_id: 11, message: { contact: { phone_number: '+79990000000' } } },
    ]);
    const handleUpdate = jest.fn().mockResolvedValue({
      dryRun: false,
      replySent: true,
      upstreamAction: 'TELEGRAM_AUTH_CONTACT',
      upstreamStatus: 'CONFIRMED',
    });

    const result = await runTelegramPollingTick(edgeConfig, pollingConfig, 7, {
      fetch: fetchMock,
      handleUpdate,
      logger: silentLogger,
    });

    expect(result).toEqual({ handled: 2, offset: 12, received: 2 });
    expect(handleUpdate).toHaveBeenCalledTimes(2);
    expect(jsonBody(fetchMock.mock.calls[0]?.[1])).toMatchObject({
      offset: 7,
    });
    expect(JSON.parse(await readFile(pollingConfig.statePath, 'utf8'))).toEqual(
      expect.objectContaining({ offset: 12 }),
    );
  });

  it('skips stale and duplicate update ids before webhook handling', async () => {
    const fetchMock = jsonFetchMock([
      { update_id: 6, message: { text: 'stale-before-offset' } },
      { update_id: 7, message: { text: 'first-new' } },
      { update_id: 7, message: { text: 'duplicate-in-batch' } },
      { update_id: 8, message: { text: 'second-new' } },
    ]);
    const handleUpdate = jest.fn().mockResolvedValue({
      dryRun: false,
      replySent: false,
      upstreamAction: 'NOOP',
      upstreamStatus: 'OK',
    });

    const result = await runTelegramPollingTick(edgeConfig, pollingConfig, 7, {
      fetch: fetchMock,
      handleUpdate,
      logger: silentLogger,
    });

    expect(result).toEqual({ handled: 2, offset: 9, received: 4 });
    expect(handleUpdate).toHaveBeenCalledTimes(2);
    expect(handleUpdate).toHaveBeenNthCalledWith(
      1,
      edgeConfig,
      { update_id: 7, message: { text: 'first-new' } },
      expect.any(Object),
    );
    expect(handleUpdate).toHaveBeenNthCalledWith(
      2,
      edgeConfig,
      { update_id: 8, message: { text: 'second-new' } },
      expect.any(Object),
    );
    expect(JSON.parse(await readFile(pollingConfig.statePath, 'utf8'))).toEqual(
      expect.objectContaining({ offset: 9 }),
    );
  });

  it('reads and writes polling offset state', async () => {
    expect(await readPollingOffset(pollingConfig.statePath)).toBeNull();

    await writePollingOffset(pollingConfig.statePath, 123);

    expect(await readPollingOffset(pollingConfig.statePath)).toBe(123);
  });

  it('persists a sanitized heartbeat and evaluates freshness', async () => {
    const heartbeat: TelegramPollingHeartbeat = {
      consecutiveFailures: 0,
      errorCategory: null,
      errorCode: null,
      lastErrorAt: null,
      lastPollStartedAt: '2026-09-06T13:00:00.000Z',
      lastPollSucceededAt: '2026-09-06T13:00:50.000Z',
      offset: 225150231,
      status: 'OK',
      updatedAt: '2026-09-06T13:00:50.000Z',
      version: 1,
    };

    await writePollingHeartbeat(pollingConfig.heartbeatPath, heartbeat);

    const stored = await readPollingHeartbeat(pollingConfig.heartbeatPath);

    expect(stored).toEqual(heartbeat);
    expect(
      evaluateTelegramPollingHealth(
        stored,
        150_000,
        Date.parse('2026-09-06T13:02:00.000Z'),
      ),
    ).toEqual({
      ageMs: 70_000,
      consecutiveFailures: 0,
      healthy: true,
      reason: 'HEALTHY',
    });
  });

  it('fails health when the last successful poll is stale', () => {
    const heartbeat: TelegramPollingHeartbeat = {
      consecutiveFailures: 18,
      errorCategory: 'CONNECT',
      errorCode: 'ECONNRESET',
      lastErrorAt: '2026-09-06T13:04:00.000Z',
      lastPollStartedAt: '2026-09-06T13:04:00.000Z',
      lastPollSucceededAt: '2026-09-06T13:00:00.000Z',
      offset: 225150231,
      status: 'ERROR',
      updatedAt: '2026-09-06T13:04:00.000Z',
      version: 1,
    };

    expect(
      evaluateTelegramPollingHealth(
        heartbeat,
        150_000,
        Date.parse('2026-09-06T13:04:00.000Z'),
      ),
    ).toEqual({
      ageMs: 240_000,
      consecutiveFailures: 18,
      healthy: false,
      reason: 'STALE',
    });
  });

  it('classifies nested fetch failures without returning cause text', () => {
    const error = new TypeError('fetch failed', {
      cause: Object.assign(new Error('private upstream detail'), {
        code: 'ECONNRESET',
      }),
    });

    expect(telegramPollingFailure(error)).toEqual({
      category: 'CONNECT',
      code: 'ECONNRESET',
    });
  });
});

function jsonFetchMock(
  result: unknown,
): jest.MockedFunction<TelegramEdgeFetch> {
  return jest.fn<TelegramEdgeFetch>().mockResolvedValue(
    new Response(JSON.stringify({ ok: true, result }), {
      headers: { 'content-type': 'application/json' },
      status: 200,
    }),
  );
}

function jsonBody(init: RequestInit | undefined) {
  const body = init?.body;

  return JSON.parse(typeof body === 'string' ? body : '{}') as unknown;
}

const silentLogger = {
  error: jest.fn(),
  log: jest.fn(),
  warn: jest.fn(),
};

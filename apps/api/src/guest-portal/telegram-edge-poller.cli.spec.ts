import { readFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

import type {
  TelegramEdgeConfig,
  TelegramEdgeFetch,
} from './telegram-edge-adapter';
import {
  deleteTelegramWebhook,
  getTelegramUpdates,
  loadTelegramPollingConfig,
  readPollingOffset,
  runTelegramPollingTick,
  validatePollingConfig,
  writePollingOffset,
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
    limit: 100,
    retryDelayMs: 5000,
    statePath: join(tmpdir(), `leetplus-telegram-poller-${process.pid}.json`),
    timeoutSeconds: 50,
  };

  afterEach(async () => {
    await rm(pollingConfig.statePath, { force: true });
  });

  it('loads polling config with safe 1337 defaults', () => {
    const config = loadTelegramPollingConfig({});

    expect(config).toMatchObject({
      allowedUpdates: ['message', 'edited_message', 'callback_query'],
      deleteWebhookOnStart: true,
      dropPendingUpdatesOnDelete: false,
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

  it('reads and writes polling offset state', async () => {
    expect(await readPollingOffset(pollingConfig.statePath)).toBeNull();

    await writePollingOffset(pollingConfig.statePath, 123);

    expect(await readPollingOffset(pollingConfig.statePath)).toBe(123);
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

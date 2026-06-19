/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import {
  type BotConsumerDelivery,
  type BotConsumerFetch,
  loadBotConsumerConfig,
  runBotConsumerOnce,
} from './guest-game-delivery-bot-consumer';

const delivery: BotConsumerDelivery = {
  tenantId: 'tenant-1',
  tenantSlug: 'demo',
  deliveryId: 'delivery-1',
  rewardId: 'reward-1',
  channel: 'TELEGRAM',
  channelLabel: 'Telegram',
  recipient: {
    telegramChatId: '123456',
    maxIdentity: null,
    identityMasked: 'tg:***',
    recipientMasked: 'Guest One',
  },
  message: {
    title: 'Reward ready',
    body: 'Your reward is ready',
  },
  reward: {
    label: '100 bonus points',
    amount: 100,
    type: 'BONUS',
    code: 'LP-100',
    expiresAt: null,
  },
  store: { id: 'store-1', name: '1337' },
  preparedAt: '2026-06-10T10:00:00.000Z',
};

const maxDelivery: BotConsumerDelivery = {
  ...delivery,
  deliveryId: 'delivery-max-1',
  rewardId: 'reward-max-1',
  channel: 'MAX',
  channelLabel: 'MAX',
  recipient: {
    telegramChatId: null,
    maxIdentity: 'max:user-123',
    identityMasked: 'max:***',
    recipientMasked: 'Guest One',
  },
};

describe('guest game delivery bot consumer', () => {
  it('loads a safe dry-run config by default', () => {
    const config = loadBotConsumerConfig({
      API_URL: 'https://api.leetplus.ru/',
      SYNC_SERVICE_TOKEN: 'sync-token',
      GUEST_GAME_BOT_CONSUMER_TENANT_SLUG: 'demo',
    });

    expect(config).toMatchObject({
      apiUrl: 'https://api.leetplus.ru',
      syncToken: 'sync-token',
      tenantSlug: 'demo',
      channels: ['TELEGRAM'],
      limit: 10,
      dryRun: true,
    });
  });

  it('does not send or ack deliveries in dry-run mode', async () => {
    const fetchMock = fetchMockOf([
      jsonResponse({
        checked: 1,
        ready: 1,
        skipped: 0,
        items: [delivery],
        note: 'ready',
      }),
    ]);

    const result = await runBotConsumerOnce(
      {
        apiUrl: 'https://api.leetplus.ru',
        syncToken: 'sync-token',
        tenantId: null,
        tenantSlug: 'demo',
        channels: ['TELEGRAM'],
        limit: 10,
        dryRun: true,
        telegramToken: null,
        telegramApiBaseUrl: 'https://api.telegram.org',
        maxToken: null,
        maxEndpoint: null,
        requestTimeoutMs: 1000,
      },
      { fetch: fetchMock },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.leetplus.ru/guests/gamification/scheduled/deliveries/bot/pull',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-sync-service-token': 'sync-token',
        }),
      }),
    );
    expect(result).toMatchObject({
      dryRun: true,
      pulled: 1,
      sent: 0,
      failed: 0,
      skipped: 1,
      acked: 0,
      idempotentAcks: 0,
    });
  });

  it('sends Telegram delivery and writes SENT ack in real mode', async () => {
    const fetchMock = fetchMockOf([
      jsonResponse({
        checked: 1,
        ready: 1,
        skipped: 0,
        items: [delivery],
        note: 'ready',
      }),
      jsonResponse({
        ok: true,
        result: { message_id: 42 },
      }),
      jsonResponse({
        delivery: { id: 'delivery-1' },
        eventType: 'DELIVERY_BOT_CONSUMER_SENT',
        note: 'sent',
        idempotent: false,
      }),
    ]);

    const result = await runBotConsumerOnce(
      {
        apiUrl: 'https://api.leetplus.ru',
        syncToken: 'sync-token',
        tenantId: null,
        tenantSlug: 'demo',
        channels: ['TELEGRAM'],
        limit: 10,
        dryRun: false,
        telegramToken: 'telegram-token',
        telegramApiBaseUrl: 'https://api.telegram.org',
        maxToken: null,
        maxEndpoint: null,
        requestTimeoutMs: 1000,
      },
      { fetch: fetchMock },
    );

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://api.telegram.org/bottelegram-token/sendMessage',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"chat_id":"123456"'),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://api.leetplus.ru/guests/gamification/scheduled/deliveries/bot/ack',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"status":"SENT"'),
      }),
    );
    expect(result).toMatchObject({
      dryRun: false,
      pulled: 1,
      sent: 1,
      failed: 0,
      skipped: 0,
      acked: 1,
      idempotentAcks: 0,
    });
  });

  it('counts idempotent LeetPlus ack responses in real mode', async () => {
    const fetchMock = fetchMockOf([
      jsonResponse({
        checked: 1,
        ready: 1,
        skipped: 0,
        items: [delivery],
        note: 'ready',
      }),
      jsonResponse({
        ok: true,
        result: { message_id: 42 },
      }),
      jsonResponse({
        delivery: { id: 'delivery-1' },
        eventType: 'DELIVERY_BOT_CONSUMER_SENT',
        note: 'Duplicate bot consumer ack ignored.',
        idempotent: true,
      }),
    ]);

    const result = await runBotConsumerOnce(
      {
        apiUrl: 'https://api.leetplus.ru',
        syncToken: 'sync-token',
        tenantId: null,
        tenantSlug: 'demo',
        channels: ['TELEGRAM'],
        limit: 10,
        dryRun: false,
        telegramToken: 'telegram-token',
        telegramApiBaseUrl: 'https://api.telegram.org',
        maxToken: null,
        maxEndpoint: null,
        requestTimeoutMs: 1000,
      },
      { fetch: fetchMock },
    );

    expect(result).toMatchObject({
      dryRun: false,
      pulled: 1,
      sent: 1,
      failed: 0,
      skipped: 0,
      acked: 1,
      idempotentAcks: 1,
    });
  });

  it('requires a Telegram token before real sends', () => {
    expect(() =>
      loadBotConsumerConfig({
        API_URL: 'https://api.leetplus.ru',
        SYNC_SERVICE_TOKEN: 'sync-token',
        GUEST_GAME_BOT_CONSUMER_TENANT_SLUG: 'demo',
        GUEST_GAME_BOT_CONSUMER_DRY_RUN: 'false',
      }),
    ).toThrow('Telegram real send requires');
  });

  it('requires MAX endpoint and token before real sends', () => {
    expect(() =>
      loadBotConsumerConfig({
        API_URL: 'https://api.leetplus.ru',
        SYNC_SERVICE_TOKEN: 'sync-token',
        GUEST_GAME_BOT_CONSUMER_TENANT_SLUG: 'demo',
        GUEST_GAME_BOT_CONSUMER_CHANNELS: 'max',
        GUEST_GAME_BOT_CONSUMER_DRY_RUN: 'false',
      }),
    ).toThrow('MAX real send requires');
  });

  it('sends MAX delivery through a configured generic provider and writes SENT ack', async () => {
    const fetchMock = fetchMockOf([
      jsonResponse({
        checked: 1,
        ready: 1,
        skipped: 0,
        items: [maxDelivery],
        note: 'ready',
      }),
      jsonResponse({
        ok: true,
        result: { messageId: 'max-message-1' },
      }),
      jsonResponse({
        delivery: { id: 'delivery-max-1' },
        eventType: 'DELIVERY_BOT_CONSUMER_SENT',
        note: 'sent',
        idempotent: false,
      }),
    ]);

    const result = await runBotConsumerOnce(
      {
        apiUrl: 'https://api.leetplus.ru',
        syncToken: 'sync-token',
        tenantId: null,
        tenantSlug: 'demo',
        channels: ['MAX'],
        limit: 10,
        dryRun: false,
        telegramToken: null,
        telegramApiBaseUrl: 'https://api.telegram.org',
        maxToken: 'max-token',
        maxEndpoint: 'https://max-provider.example/send',
        requestTimeoutMs: 1000,
      },
      { fetch: fetchMock },
    );

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://max-provider.example/send',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer max-token',
        }),
        body: expect.stringContaining('"identity":"max:user-123"'),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://api.leetplus.ru/guests/gamification/scheduled/deliveries/bot/ack',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"providerMessageId":"max-message-1"'),
      }),
    );
    expect(result).toMatchObject({
      dryRun: false,
      pulled: 1,
      sent: 1,
      failed: 0,
      skipped: 0,
      acked: 1,
      idempotentAcks: 0,
      items: [
        expect.objectContaining({
          deliveryId: 'delivery-max-1',
          channel: 'MAX',
          status: 'SENT',
        }),
      ],
    });
  });
});

function fetchMockOf(responses: Response[]) {
  const fetchMock = jest.fn<
    ReturnType<BotConsumerFetch>,
    Parameters<BotConsumerFetch>
  >();

  for (const response of responses) {
    fetchMock.mockResolvedValueOnce(response);
  }

  return fetchMock;
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: jest.fn(() => Promise.resolve(JSON.stringify(body))),
  } as unknown as Response;
}

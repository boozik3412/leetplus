import type { TelegramEdgeConfig } from './telegram-edge-adapter';
import {
  classifyTelegramFailure,
  loadTelegramOutboxConfig,
  runTelegramOutboxTick,
} from './telegram-outbox-sender';

const edgeConfig: TelegramEdgeConfig = {
  host: '127.0.0.1',
  port: 4010,
  leetPlusApiUrl: 'http://api.test',
  leetPlusWebhookPath: '/guest-portal/telegram/webhook',
  webhookSecret: 'webhook-secret',
  botToken: '123:abc',
  telegramApiBaseUrl: 'https://telegram.test',
  dryRun: false,
  requestTimeoutMs: 5000,
  healthSecret: null,
  maxBodyBytes: 1024,
};
const token = 'o'.repeat(40);

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('telegram outbox sender', () => {
  it('stays off without its own token or in dry-run', async () => {
    const fetch = jest.fn();
    expect(loadTelegramOutboxConfig({}).enabled).toBe(false);
    expect(
      loadTelegramOutboxConfig({ GUEST_GAME_TG_EDGE_OUTBOX_TOKEN: 'short' })
        .enabled,
    ).toBe(false);

    const config = loadTelegramOutboxConfig({
      GUEST_GAME_TG_EDGE_OUTBOX_TOKEN: token,
    });
    await runTelegramOutboxTick({ ...edgeConfig, dryRun: true }, config, {
      leetPlusFetch: fetch,
      telegramFetch: fetch,
    });

    expect(config.enabled).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('claims, sends and reports every outcome', async () => {
    const config = loadTelegramOutboxConfig({
      GUEST_GAME_TG_EDGE_OUTBOX_TOKEN: token,
    });
    const leetPlusFetch = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, {
          messages: [
            { id: 'm1', claimToken: 't1', chatId: '101', text: 'Ответ 1' },
            { id: 'm2', claimToken: 't2', chatId: '102', text: 'Ответ 2' },
            { id: 'm3', claimToken: 't3', chatId: 'not-a-chat', text: 'x' },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { applied: 2, ignored: 0 }));
    const telegramFetch = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, { ok: true, result: { message_id: 55 } }),
      )
      .mockResolvedValueOnce(
        jsonResponse(403, {
          ok: false,
          error_code: 403,
          description: 'Forbidden: bot was blocked by the user',
        }),
      );

    const result = await runTelegramOutboxTick(edgeConfig, config, {
      leetPlusFetch,
      telegramFetch,
      logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
      delay: () => Promise.resolve(),
    });

    expect(result).toEqual({
      claimed: 2,
      sent: 1,
      retried: 0,
      failed: 0,
      blocked: 1,
    });
    const [claimUrl, claimInit] = leetPlusFetch.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(claimUrl).toBe(
      'http://api.test/guests/communications/telegram-outbox/claim',
    );
    expect(claimInit.headers).toMatchObject({
      'x-telegram-outbox-token': token,
    });
    const [sendUrl, sendInit] = telegramFetch.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(sendUrl).toBe('https://telegram.test/bot123:abc/sendMessage');
    expect(JSON.parse(sendInit.body as string)).toMatchObject({
      chat_id: '101',
      text: 'Ответ 1',
    });
    const report = JSON.parse(
      (leetPlusFetch.mock.calls[1] as [string, RequestInit])[1].body as string,
    ) as { results: unknown[] };
    expect(report.results).toEqual([
      { id: 'm1', claimToken: 't1', outcome: 'SENT', telegramMessageId: '55' },
      {
        id: 'm2',
        claimToken: 't2',
        outcome: 'BLOCKED',
        errorCode: 'TELEGRAM_403',
      },
    ]);
  });

  it('retries a network failure', async () => {
    const config = loadTelegramOutboxConfig({
      GUEST_GAME_TG_EDGE_OUTBOX_TOKEN: token,
    });
    const leetPlusFetch = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, {
          messages: [{ id: 'm1', claimToken: 't1', chatId: '1', text: 'x' }],
        }),
      )
      .mockResolvedValueOnce(jsonResponse(200, {}));
    const telegramFetch = jest.fn().mockRejectedValue(new Error('ECONNRESET'));

    const result = await runTelegramOutboxTick(edgeConfig, config, {
      leetPlusFetch,
      telegramFetch,
      logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
    });

    expect(result.retried).toBe(1);
  });

  it.each([
    [
      429,
      { error_code: 429, parameters: { retry_after: 7 } },
      'RETRY',
      'TELEGRAM_429',
      7,
    ],
    [
      400,
      { error_code: 400, description: 'Bad Request: chat not found' },
      'BLOCKED',
      'CHAT_NOT_FOUND',
      undefined,
    ],
    [
      400,
      { error_code: 400, description: 'Bad Request: message is too long' },
      'FAILED',
      'TELEGRAM_400',
      undefined,
    ],
    [502, null, 'RETRY', 'TELEGRAM_502', undefined],
  ])(
    'classifies HTTP %s',
    (status, payload, outcome, errorCode, retryAfter) => {
      const result = classifyTelegramFailure(status, payload);
      expect(result.outcome).toBe(outcome);
      expect(result.errorCode).toBe(errorCode);
      expect(result.retryAfterSeconds ?? undefined).toBe(retryAfter);
    },
  );
});

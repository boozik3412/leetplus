import {
  handleTelegramEdgeWebhook,
  loadTelegramEdgeConfig,
  type TelegramEdgeConfig,
  type TelegramEdgeFetch,
} from './telegram-edge-adapter';

describe('telegram edge adapter', () => {
  const baseConfig: TelegramEdgeConfig = {
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

  it('loads edge config from dedicated env and keeps dry-run enabled by default', () => {
    const config = loadTelegramEdgeConfig({
      GUEST_GAME_TG_EDGE_LEETPLUS_API_URL: 'https://api.leetplus.ru/',
      GUEST_GAME_TG_EDGE_WEBHOOK_SECRET: 'telegram-secret',
      GUEST_GAME_TG_EDGE_BOT_TOKEN: 'bot-token',
      GUEST_GAME_TG_EDGE_TELEGRAM_API_BASE_URL: 'https://tg-proxy.test/',
    });

    expect(config).toMatchObject({
      leetPlusApiUrl: 'https://api.leetplus.ru',
      webhookSecret: 'telegram-secret',
      botToken: 'bot-token',
      telegramApiBaseUrl: 'https://tg-proxy.test',
      dryRun: true,
    });
  });

  it('forwards Telegram webhook to LeetPlus and sends safe reply through proxy base URL', async () => {
    const fetchMock: jest.MockedFunction<TelegramEdgeFetch> = jest
      .fn<TelegramEdgeFetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'AWAITING_CONTACT',
            action: 'TELEGRAM_AUTH_START',
            reply: {
              provider: 'TELEGRAM',
              method: 'sendMessage',
              text: 'Поделитесь телефоном',
              replyMarkup: {
                keyboard: [
                  [{ text: 'Поделиться телефоном', request_contact: true }],
                ],
                resize_keyboard: true,
                one_time_keyboard: true,
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ ok: true, result: { message_id: 777 } }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
      );

    const result = await handleTelegramEdgeWebhook(
      baseConfig,
      {
        update_id: 1,
        message: {
          chat: { id: 123456 },
          text: '/start lp_ABC',
        },
      },
      { fetch: fetchMock, logger: silentLogger },
    );

    expect(result).toMatchObject({
      ok: true,
      replySent: true,
      dryRun: false,
      chatIdMasked: 'ch...56',
      telegramMessageId: '777',
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://api.leetplus.test/guest-portal/telegram/webhook',
      expect.any(Object),
    );
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      'x-telegram-bot-api-secret-token': 'telegram-secret',
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://tg-proxy.test/botbot-token/sendMessage',
      expect.objectContaining({
        body: JSON.stringify({
          chat_id: '123456',
          text: 'Поделитесь телефоном',
          disable_web_page_preview: true,
          reply_markup: {
            keyboard: [
              [{ text: 'Поделиться телефоном', request_contact: true }],
            ],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        }),
      }),
    );
  });

  it('handles callback_query updates and answers the Telegram callback', async () => {
    const fetchMock: jest.MockedFunction<TelegramEdgeFetch> = jest
      .fn<TelegramEdgeFetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'CONFIRMED',
            action: 'TELEGRAM_BOT_MENU',
            reply: {
              provider: 'TELEGRAM',
              method: 'sendMessage',
              text: 'РЎС‚Р°С‚СѓСЃ РёРіСЂРѕРєР°',
              replyMarkup: {
                inline_keyboard: [
                  [{ text: 'РџРѕРјРѕС‰СЊ', callback_data: '/help' }],
                ],
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, result: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ ok: true, result: { message_id: 778 } }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
      );

    const result = await handleTelegramEdgeWebhook(
      baseConfig,
      {
        update_id: 2,
        callback_query: {
          id: 'callback-1',
          from: { id: 123456 },
          message: {
            chat: { id: 123456 },
            text: 'РњРµРЅСЋ',
          },
          data: 'bot:menu',
        },
      },
      { fetch: fetchMock, logger: silentLogger },
    );

    expect(result).toMatchObject({
      ok: true,
      replySent: true,
      dryRun: false,
      chatIdMasked: 'ch...56',
      telegramMessageId: '778',
      callbackAnswered: true,
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://tg-proxy.test/botbot-token/answerCallbackQuery',
      expect.objectContaining({
        body: JSON.stringify({ callback_query_id: 'callback-1' }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://tg-proxy.test/botbot-token/sendMessage',
      expect.any(Object),
    );
    const sendMessageBody = fetchMock.mock.calls[2]?.[1]?.body;
    if (typeof sendMessageBody !== 'string') {
      throw new Error('Telegram sendMessage body should be a JSON string.');
    }
    expect(sendMessageBody).toContain('"chat_id":"123456"');
  });

  it('does not duplicate replies already sent by the LeetPlus API sender', async () => {
    const fetchMock: jest.MockedFunction<TelegramEdgeFetch> = jest
      .fn<TelegramEdgeFetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'CONFIRMED',
            action: 'TELEGRAM_BOT_MENU',
            replyDispatch: {
              provider: 'TELEGRAM',
              status: 'SENT',
              chatIdMasked: 'ch...56',
            },
            reply: {
              provider: 'TELEGRAM',
              method: 'sendMessage',
              text: 'Меню отправлено',
              replyMarkup: {
                inline_keyboard: [
                  [{ text: 'Профиль', callback_data: 'bot:profile' }],
                ],
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, result: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );

    const result = await handleTelegramEdgeWebhook(
      baseConfig,
      {
        update_id: 3,
        callback_query: {
          id: 'callback-2',
          from: { id: 123456 },
          message: { chat: { id: 123456 }, text: 'Меню' },
          data: 'bot:profile',
        },
      },
      { fetch: fetchMock, logger: silentLogger },
    );

    expect(result).toMatchObject({
      ok: true,
      replySent: false,
      replyAlreadySentByApi: true,
      callbackAnswered: true,
      dryRun: false,
      chatIdMasked: 'ch...56',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://tg-proxy.test/botbot-token/answerCallbackQuery',
      expect.objectContaining({
        body: JSON.stringify({ callback_query_id: 'callback-2' }),
      }),
    );
  });

  it('does not call Telegram in dry-run mode', async () => {
    const fetchMock: jest.MockedFunction<TelegramEdgeFetch> = jest
      .fn<TelegramEdgeFetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'CONFIRMED',
            action: 'TELEGRAM_AUTH_CONTACT',
            reply: {
              provider: 'TELEGRAM',
              method: 'sendMessage',
              text: 'Откройте Mini App',
              replyMarkup: {
                keyboard: [
                  [
                    {
                      text: 'Открыть Mini App',
                      web_app: { url: 'https://tg.leetplus.example/game/app' },
                    },
                  ],
                ],
                resize_keyboard: true,
                one_time_keyboard: true,
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );

    const result = await handleTelegramEdgeWebhook(
      { ...baseConfig, dryRun: true },
      { message: { chat: { id: '987654' } } },
      { fetch: fetchMock, logger: silentLogger },
    );

    expect(result).toMatchObject({
      ok: true,
      replySent: false,
      dryRun: true,
      chatIdMasked: 'ch...54',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

const silentLogger = {
  error: jest.fn(),
  log: jest.fn(),
  warn: jest.fn(),
};

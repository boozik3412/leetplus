import {
  loadTelegramBotApiProxyUrl,
  maskTelegramBotApiProxyUrl,
} from './telegram-bot-api-fetch';

describe('telegram bot api fetch', () => {
  it('loads the dedicated Telegram proxy URL and masks credentials', () => {
    const proxyUrl = loadTelegramBotApiProxyUrl({
      GUEST_GAME_TG_EDGE_TELEGRAM_PROXY_URL:
        ' http://user:secret@proxy.example:15689 ',
    });

    expect(proxyUrl).toBe('http://user:secret@proxy.example:15689');
    expect(maskTelegramBotApiProxyUrl(proxyUrl ?? '')).toBe(
      'http://proxy.example:15689',
    );
  });

  it('falls back to the shared Telegram Bot API proxy URL', () => {
    expect(
      loadTelegramBotApiProxyUrl({
        TELEGRAM_BOT_API_PROXY_URL: 'https://proxy.example',
      }),
    ).toBe('https://proxy.example');
  });

  it('rejects non-http proxy protocols', () => {
    expect(() =>
      loadTelegramBotApiProxyUrl({
        GUEST_GAME_TG_EDGE_TELEGRAM_PROXY_URL: 'socks5://proxy.example:1080',
      }),
    ).toThrow('must use http or https protocol');
  });
});

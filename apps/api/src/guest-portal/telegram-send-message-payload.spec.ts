import {
  buildTelegramSendMessageBody,
  TelegramSendMessageProjectionError,
} from './telegram-send-message-payload';

describe('telegram send message payload projection', () => {
  it('keeps only supported sendMessage fields for contact keyboards', () => {
    expect(
      buildTelegramSendMessageBody({
        chatId: '123456',
        text: 'Поделитесь телефоном',
        replyMarkup: {
          keyboard: [[{ text: 'Поделиться телефоном', request_contact: true }]],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      }),
    ).toEqual({
      chat_id: '123456',
      text: 'Поделитесь телефоном',
      disable_web_page_preview: true,
      reply_markup: {
        keyboard: [[{ text: 'Поделиться телефоном', request_contact: true }]],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    });
  });

  it('allows only safe inline URL, web_app, and callback button actions', () => {
    expect(
      buildTelegramSendMessageBody({
        chatId: '-1001234567890',
        text: 'Меню',
        replyMarkup: {
          inline_keyboard: [
            [
              {
                text: 'Сайт',
                url: 'https://leetplus.ru/game/clubs',
              },
            ],
            [
              {
                text: 'Mini App',
                web_app: {
                  url: 'https://tg.leetplus.ru/game/app',
                },
              },
            ],
            [{ text: 'Меню', callback_data: 'bot:menu' }],
          ],
        },
      }),
    ).toEqual({
      chat_id: '-1001234567890',
      text: 'Меню',
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Сайт', url: 'https://leetplus.ru/game/clubs' }],
          [
            {
              text: 'Mini App',
              web_app: { url: 'https://tg.leetplus.ru/game/app' },
            },
          ],
          [{ text: 'Меню', callback_data: 'bot:menu' }],
        ],
      },
    });
  });

  it('accepts remove_keyboard without forwarding unsupported fields', () => {
    expect(
      buildTelegramSendMessageBody({
        chatId: '123456',
        text: 'Клавиатура скрыта',
        replyMarkup: { remove_keyboard: true, selective: false },
      }),
    ).toMatchObject({
      chat_id: '123456',
      reply_markup: { remove_keyboard: true, selective: false },
    });
  });

  it('rejects unknown fields and unsafe protocols', () => {
    expect(() =>
      buildTelegramSendMessageBody({
        chatId: '123456',
        text: 'Меню',
        replyMarkup: {
          inline_keyboard: [
            [
              {
                text: 'Bad',
                url: 'javascript:alert(1)',
                leak: 'unexpected',
              },
            ],
          ],
        },
      }),
    ).toThrow(TelegramSendMessageProjectionError);
  });
});

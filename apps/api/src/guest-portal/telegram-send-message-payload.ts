export type TelegramSendMessageBody = {
  chat_id: string;
  text: string;
  disable_web_page_preview: true;
  reply_markup?: TelegramReplyMarkup;
};

type TelegramReplyMarkup =
  | TelegramKeyboardMarkup
  | TelegramInlineKeyboardMarkup
  | TelegramRemoveKeyboardMarkup;

type TelegramKeyboardMarkup = {
  keyboard: TelegramKeyboardButton[][];
  resize_keyboard?: boolean;
  one_time_keyboard?: boolean;
  is_persistent?: boolean;
  input_field_placeholder?: string;
  selective?: boolean;
};

type TelegramInlineKeyboardMarkup = {
  inline_keyboard: TelegramInlineKeyboardButton[][];
};

type TelegramRemoveKeyboardMarkup = {
  remove_keyboard: true;
  selective?: boolean;
};

type TelegramKeyboardButton = {
  text: string;
  request_contact?: true;
  web_app?: TelegramWebAppInfo;
};

type TelegramInlineKeyboardButton = {
  text: string;
  callback_data?: string;
  url?: string;
  web_app?: TelegramWebAppInfo;
};

type TelegramWebAppInfo = {
  url: string;
};

type JsonRecord = Record<string, unknown>;

const telegramChatIdPattern = /^-?\d{1,20}$/;
const maxSendMessageTextLength = 4096;
const maxReplyMarkupBytes = 8192;
const maxKeyboardRows = 30;
const maxButtonsPerRow = 8;
const maxButtonTextLength = 64;
const maxCallbackDataBytes = 64;
const maxUrlLength = 2048;
const maxInputPlaceholderLength = 64;

const keyboardMarkupFields = new Set([
  'keyboard',
  'resize_keyboard',
  'one_time_keyboard',
  'is_persistent',
  'input_field_placeholder',
  'selective',
]);
const inlineKeyboardMarkupFields = new Set(['inline_keyboard']);
const removeKeyboardMarkupFields = new Set(['remove_keyboard', 'selective']);
const keyboardButtonFields = new Set(['text', 'request_contact', 'web_app']);
const inlineKeyboardButtonFields = new Set([
  'text',
  'callback_data',
  'url',
  'web_app',
]);
const webAppInfoFields = new Set(['url']);

export class TelegramSendMessageProjectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TelegramSendMessageProjectionError';
  }
}

export function isTelegramSendMessageProjectionError(
  error: unknown,
): error is TelegramSendMessageProjectionError {
  return error instanceof TelegramSendMessageProjectionError;
}

export function buildTelegramSendMessageBody({
  chatId,
  text,
  replyMarkup,
}: {
  chatId: string;
  text: string;
  replyMarkup?: unknown;
}): TelegramSendMessageBody {
  const projectedChatId = projectChatId(chatId);
  const projectedText = projectText(text);
  const projectedReplyMarkup = projectReplyMarkup(replyMarkup);
  const body: TelegramSendMessageBody = {
    chat_id: projectedChatId,
    text: projectedText,
    disable_web_page_preview: true,
  };

  if (projectedReplyMarkup) {
    body.reply_markup = projectedReplyMarkup;
  }

  return body;
}

function projectChatId(chatId: string) {
  if (!telegramChatIdPattern.test(chatId)) {
    throw new TelegramSendMessageProjectionError(
      'Telegram sendMessage chat_id must be a numeric Telegram chat id.',
    );
  }

  return chatId;
}

function projectText(text: string) {
  if (!text.trim()) {
    throw new TelegramSendMessageProjectionError(
      'Telegram sendMessage text must not be empty.',
    );
  }

  if (Array.from(text).length > maxSendMessageTextLength) {
    throw new TelegramSendMessageProjectionError(
      'Telegram sendMessage text exceeds the Telegram 4096 character limit.',
    );
  }

  return text;
}

function projectReplyMarkup(replyMarkup: unknown): TelegramReplyMarkup | null {
  if (replyMarkup === undefined || replyMarkup === null) {
    return null;
  }

  const markup = plainRecord(replyMarkup, 'Telegram reply_markup');
  const hasKeyboard = hasOwn(markup, 'keyboard');
  const hasInlineKeyboard = hasOwn(markup, 'inline_keyboard');
  const hasRemoveKeyboard = hasOwn(markup, 'remove_keyboard');

  if (
    [hasKeyboard, hasInlineKeyboard, hasRemoveKeyboard].filter(Boolean)
      .length !== 1
  ) {
    throw new TelegramSendMessageProjectionError(
      'Telegram reply_markup must contain exactly one keyboard kind.',
    );
  }

  const projected = hasKeyboard
    ? projectKeyboardMarkup(markup)
    : hasInlineKeyboard
      ? projectInlineKeyboardMarkup(markup)
      : projectRemoveKeyboardMarkup(markup);

  assertReplyMarkupSize(projected);

  return projected;
}

function projectKeyboardMarkup(markup: JsonRecord): TelegramKeyboardMarkup {
  assertAllowedFields(markup, keyboardMarkupFields, 'Telegram keyboard markup');

  const keyboard = projectButtonRows(
    markup.keyboard,
    'keyboard',
    projectKeyboardButton,
  );
  const projected: TelegramKeyboardMarkup = { keyboard };
  const resizeKeyboard = optionalBoolean(markup, 'resize_keyboard');
  const oneTimeKeyboard = optionalBoolean(markup, 'one_time_keyboard');
  const isPersistent = optionalBoolean(markup, 'is_persistent');
  const selective = optionalBoolean(markup, 'selective');
  const inputFieldPlaceholder = optionalString(
    markup,
    'input_field_placeholder',
    maxInputPlaceholderLength,
  );

  if (resizeKeyboard !== undefined) {
    projected.resize_keyboard = resizeKeyboard;
  }

  if (oneTimeKeyboard !== undefined) {
    projected.one_time_keyboard = oneTimeKeyboard;
  }

  if (isPersistent !== undefined) {
    projected.is_persistent = isPersistent;
  }

  if (selective !== undefined) {
    projected.selective = selective;
  }

  if (inputFieldPlaceholder !== undefined) {
    projected.input_field_placeholder = inputFieldPlaceholder;
  }

  return projected;
}

function projectInlineKeyboardMarkup(
  markup: JsonRecord,
): TelegramInlineKeyboardMarkup {
  assertAllowedFields(
    markup,
    inlineKeyboardMarkupFields,
    'Telegram inline keyboard markup',
  );

  return {
    inline_keyboard: projectButtonRows(
      markup.inline_keyboard,
      'inline_keyboard',
      projectInlineKeyboardButton,
    ),
  };
}

function projectRemoveKeyboardMarkup(
  markup: JsonRecord,
): TelegramRemoveKeyboardMarkup {
  assertAllowedFields(
    markup,
    removeKeyboardMarkupFields,
    'Telegram remove keyboard markup',
  );

  if (markup.remove_keyboard !== true) {
    throw new TelegramSendMessageProjectionError(
      'Telegram remove_keyboard must be true.',
    );
  }

  const projected: TelegramRemoveKeyboardMarkup = { remove_keyboard: true };
  const selective = optionalBoolean(markup, 'selective');

  if (selective !== undefined) {
    projected.selective = selective;
  }

  return projected;
}

function projectButtonRows<TButton>(
  value: unknown,
  fieldName: string,
  projectButton: (value: unknown) => TButton,
) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TelegramSendMessageProjectionError(
      `Telegram ${fieldName} must be a non-empty array.`,
    );
  }

  if (value.length > maxKeyboardRows) {
    throw new TelegramSendMessageProjectionError(
      `Telegram ${fieldName} exceeds the row limit.`,
    );
  }

  return value.map((row) => {
    if (!Array.isArray(row) || row.length === 0) {
      throw new TelegramSendMessageProjectionError(
        `Telegram ${fieldName} rows must be non-empty arrays.`,
      );
    }

    if (row.length > maxButtonsPerRow) {
      throw new TelegramSendMessageProjectionError(
        `Telegram ${fieldName} row exceeds the button limit.`,
      );
    }

    return row.map(projectButton);
  });
}

function projectKeyboardButton(value: unknown): TelegramKeyboardButton {
  const button = plainRecord(value, 'Telegram keyboard button');

  assertAllowedFields(button, keyboardButtonFields, 'Telegram keyboard button');

  const projected: TelegramKeyboardButton = {
    text: projectButtonText(button.text),
  };
  const hasRequestContact = hasOwn(button, 'request_contact');
  const hasWebApp = hasOwn(button, 'web_app');

  if (hasRequestContact && hasWebApp) {
    throw new TelegramSendMessageProjectionError(
      'Telegram keyboard button must not mix request_contact and web_app.',
    );
  }

  if (hasRequestContact) {
    if (button.request_contact !== true) {
      throw new TelegramSendMessageProjectionError(
        'Telegram request_contact button must be true.',
      );
    }

    projected.request_contact = true;
  }

  if (hasWebApp) {
    projected.web_app = projectWebAppInfo(button.web_app);
  }

  return projected;
}

function projectInlineKeyboardButton(
  value: unknown,
): TelegramInlineKeyboardButton {
  const button = plainRecord(value, 'Telegram inline keyboard button');

  assertAllowedFields(
    button,
    inlineKeyboardButtonFields,
    'Telegram inline keyboard button',
  );

  const projected: TelegramInlineKeyboardButton = {
    text: projectButtonText(button.text),
  };
  const hasCallbackData = hasOwn(button, 'callback_data');
  const hasUrl = hasOwn(button, 'url');
  const hasWebApp = hasOwn(button, 'web_app');

  if ([hasCallbackData, hasUrl, hasWebApp].filter(Boolean).length !== 1) {
    throw new TelegramSendMessageProjectionError(
      'Telegram inline keyboard button must contain exactly one action.',
    );
  }

  if (hasCallbackData) {
    projected.callback_data = projectCallbackData(button.callback_data);
  }

  if (hasUrl) {
    projected.url = projectHttpsUrl(button.url, 'Telegram inline button URL');
  }

  if (hasWebApp) {
    projected.web_app = projectWebAppInfo(button.web_app);
  }

  return projected;
}

function projectButtonText(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TelegramSendMessageProjectionError(
      'Telegram button text must be a non-empty string.',
    );
  }

  if (Array.from(value).length > maxButtonTextLength) {
    throw new TelegramSendMessageProjectionError(
      'Telegram button text exceeds the limit.',
    );
  }

  return value;
}

function projectCallbackData(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TelegramSendMessageProjectionError(
      'Telegram callback_data must be a non-empty string.',
    );
  }

  if (Buffer.byteLength(value, 'utf8') > maxCallbackDataBytes) {
    throw new TelegramSendMessageProjectionError(
      'Telegram callback_data exceeds the Telegram 64 byte limit.',
    );
  }

  if (containsControlCharacter(value)) {
    throw new TelegramSendMessageProjectionError(
      'Telegram callback_data must not contain control characters.',
    );
  }

  return value;
}

function projectWebAppInfo(value: unknown): TelegramWebAppInfo {
  const webApp = plainRecord(value, 'Telegram web_app');

  assertAllowedFields(webApp, webAppInfoFields, 'Telegram web_app');

  return {
    url: projectHttpsUrl(webApp.url, 'Telegram web_app URL'),
  };
}

function projectHttpsUrl(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TelegramSendMessageProjectionError(`${label} must be a URL.`);
  }

  if (value.length > maxUrlLength) {
    throw new TelegramSendMessageProjectionError(`${label} is too long.`);
  }

  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new TelegramSendMessageProjectionError(
      `${label} must be a valid URL.`,
    );
  }

  if (url.protocol !== 'https:') {
    throw new TelegramSendMessageProjectionError(`${label} must use HTTPS.`);
  }

  return url.toString();
}

function optionalBoolean(source: JsonRecord, fieldName: string) {
  if (!hasOwn(source, fieldName)) {
    return undefined;
  }

  if (typeof source[fieldName] !== 'boolean') {
    throw new TelegramSendMessageProjectionError(
      `Telegram ${fieldName} must be boolean.`,
    );
  }

  return source[fieldName];
}

function optionalString(
  source: JsonRecord,
  fieldName: string,
  maxLength: number,
) {
  if (!hasOwn(source, fieldName)) {
    return undefined;
  }

  const value = source[fieldName];

  if (typeof value !== 'string' || !value.trim()) {
    throw new TelegramSendMessageProjectionError(
      `Telegram ${fieldName} must be a non-empty string.`,
    );
  }

  if (Array.from(value).length > maxLength) {
    throw new TelegramSendMessageProjectionError(
      `Telegram ${fieldName} exceeds the limit.`,
    );
  }

  return value;
}

function assertReplyMarkupSize(replyMarkup: TelegramReplyMarkup) {
  if (
    Buffer.byteLength(JSON.stringify(replyMarkup), 'utf8') > maxReplyMarkupBytes
  ) {
    throw new TelegramSendMessageProjectionError(
      'Telegram reply_markup exceeds the serialized size limit.',
    );
  }
}

function assertAllowedFields(
  value: JsonRecord,
  allowedFields: ReadonlySet<string>,
  label: string,
) {
  for (const field of Object.keys(value)) {
    if (!allowedFields.has(field)) {
      throw new TelegramSendMessageProjectionError(
        `${label} contains unsupported field "${field}".`,
      );
    }
  }
}

function plainRecord(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TelegramSendMessageProjectionError(
      `${label} must be a JSON object.`,
    );
  }

  const prototype = Object.getPrototypeOf(value) as unknown;

  if (prototype !== Object.prototype && prototype !== null) {
    throw new TelegramSendMessageProjectionError(
      `${label} must be a plain JSON object.`,
    );
  }

  return value as JsonRecord;
}

function hasOwn(value: JsonRecord, fieldName: string) {
  return Object.keys(value).includes(fieldName);
}

function containsControlCharacter(value: string) {
  for (const character of value) {
    const codePoint = character.codePointAt(0);

    if (codePoint !== undefined && (codePoint <= 31 || codePoint === 127)) {
      return true;
    }
  }

  return false;
}

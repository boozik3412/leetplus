import { createServer, type IncomingMessage, type ServerResponse } from 'http';

export type TelegramEdgeEnv = Record<string, string | undefined>;
export type TelegramEdgeFetch = typeof fetch;
export type TelegramEdgeLogger = Pick<Console, 'error' | 'log' | 'warn'>;

export type TelegramEdgeConfig = {
  host: string;
  port: number;
  leetPlusApiUrl: string;
  leetPlusWebhookPath: string;
  webhookSecret: string;
  botToken: string;
  telegramApiBaseUrl: string;
  dryRun: boolean;
  requestTimeoutMs: number;
  healthSecret: string | null;
  maxBodyBytes: number;
};

export type TelegramEdgeServerHandle = {
  close: () => Promise<void>;
  url: string;
};

type TelegramEdgeDeps = {
  fetch?: TelegramEdgeFetch;
  telegramFetch?: TelegramEdgeFetch;
  logger?: TelegramEdgeLogger;
};

type TelegramMessage = {
  chat?: { id?: unknown };
};

type TelegramUpdate = {
  update_id?: unknown;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  callback_query?: {
    id?: unknown;
    from?: { id?: unknown };
    message?: TelegramMessage;
  };
};

type LeetPlusWebhookResponse = {
  status?: unknown;
  action?: unknown;
  replyDispatch?: {
    status?: unknown;
  };
  reply?: {
    provider?: unknown;
    method?: unknown;
    text?: unknown;
    replyMarkup?: unknown;
  };
};

type TelegramSendMessageResponse = {
  ok?: unknown;
  description?: unknown;
  result?: {
    message_id?: unknown;
  };
};

type TelegramAnswerCallbackQueryResponse = {
  ok?: unknown;
  description?: unknown;
};

type JsonBody = Record<string, unknown>;

type HttpError = Error & {
  status?: number;
  body?: string;
};

const defaultPort = 4010;
const defaultRequestTimeoutMs = 15_000;
const defaultMaxBodyBytes = 128 * 1024;

export function loadTelegramEdgeConfig(
  env: TelegramEdgeEnv = process.env,
): TelegramEdgeConfig {
  const leetPlusApiUrl = normalizeBaseUrl(
    env.GUEST_GAME_TG_EDGE_LEETPLUS_API_URL ??
      env.GUEST_GAME_BOT_CONSUMER_API_URL ??
      env.API_URL ??
      'https://api.leetplus.ru',
  );
  const webhookSecret =
    trimmed(env.GUEST_GAME_TG_EDGE_WEBHOOK_SECRET) ??
    trimmed(env.GUEST_GAME_TELEGRAM_WEBHOOK_SECRET) ??
    trimmed(env.GUEST_GAME_TELEGRAM_LINK_SECRET) ??
    '';
  const botToken =
    trimmed(env.GUEST_GAME_TG_EDGE_BOT_TOKEN) ??
    trimmed(env.GUEST_GAME_TELEGRAM_WEBHOOK_REPLY_BOT_TOKEN) ??
    trimmed(env.GUEST_GAME_TELEGRAM_BOT_TOKEN) ??
    trimmed(env.TELEGRAM_BOT_TOKEN) ??
    '';

  const config: TelegramEdgeConfig = {
    host: env.GUEST_GAME_TG_EDGE_HOST?.trim() || '127.0.0.1',
    port: parseBoundedInt(env.GUEST_GAME_TG_EDGE_PORT, defaultPort, 1, 65_535),
    leetPlusApiUrl,
    leetPlusWebhookPath:
      env.GUEST_GAME_TG_EDGE_LEETPLUS_WEBHOOK_PATH?.trim() ||
      '/guest-portal/telegram/webhook',
    webhookSecret,
    botToken,
    telegramApiBaseUrl: normalizeBaseUrl(
      env.GUEST_GAME_TG_EDGE_TELEGRAM_API_BASE_URL ??
        env.TELEGRAM_API_BASE_URL ??
        'https://api.telegram.org',
    ),
    dryRun: parseBoolean(env.GUEST_GAME_TG_EDGE_DRY_RUN, true),
    requestTimeoutMs: parseBoundedInt(
      env.GUEST_GAME_TG_EDGE_REQUEST_TIMEOUT_MS,
      defaultRequestTimeoutMs,
      1000,
      120_000,
    ),
    healthSecret: trimmed(env.GUEST_GAME_TG_EDGE_HEALTH_SECRET),
    maxBodyBytes: parseBoundedInt(
      env.GUEST_GAME_TG_EDGE_MAX_BODY_BYTES,
      defaultMaxBodyBytes,
      1024,
      1024 * 1024,
    ),
  };

  validateTelegramEdgeConfig(config);

  return config;
}

export function validateTelegramEdgeConfig(config: TelegramEdgeConfig) {
  if (!config.leetPlusApiUrl) {
    throw new Error('GUEST_GAME_TG_EDGE_LEETPLUS_API_URL is required.');
  }

  if (!config.webhookSecret) {
    throw new Error('GUEST_GAME_TG_EDGE_WEBHOOK_SECRET is required.');
  }

  if (!config.dryRun && !config.botToken) {
    throw new Error('GUEST_GAME_TG_EDGE_BOT_TOKEN is required for live sends.');
  }
}

export async function handleTelegramEdgeWebhook(
  config: TelegramEdgeConfig,
  update: unknown,
  deps: TelegramEdgeDeps = {},
) {
  validateTelegramEdgeConfig(config);

  const fetchImpl = deps.fetch ?? fetch;
  const telegramFetchImpl = deps.telegramFetch ?? fetchImpl;
  const logger = deps.logger ?? console;
  const typedUpdate = telegramUpdate(update);
  const chatId = telegramChatId(typedUpdate);
  const callbackQueryId = telegramCallbackQueryId(typedUpdate);
  const chatIdMasked = maskChatId(chatId);
  const leetPlusResponse = await postJson<LeetPlusWebhookResponse>(
    `${config.leetPlusApiUrl}${config.leetPlusWebhookPath}`,
    update as JsonBody,
    fetchImpl,
    config.requestTimeoutMs,
    {
      'x-telegram-bot-api-secret-token': config.webhookSecret,
    },
  );
  const reply = leetPlusResponse.reply;
  const replyText = typeof reply?.text === 'string' ? reply.text : null;
  const shouldSend =
    reply?.provider === 'TELEGRAM' &&
    reply.method === 'sendMessage' &&
    replyText !== null;
  const alreadySentByApi = leetPlusResponse.replyDispatch?.status === 'SENT';

  if (!shouldSend) {
    const callbackAnswered = config.dryRun
      ? false
      : await answerTelegramCallbackQueryIfNeeded(
          config,
          telegramFetchImpl,
          logger,
          callbackQueryId,
        );

    logger.log(
      `Telegram edge webhook forwarded update action=${stringValue(
        leetPlusResponse.action,
      )} status=${stringValue(leetPlusResponse.status)} reply=none`,
    );

    return {
      ok: true,
      upstreamStatus: leetPlusResponse.status ?? null,
      upstreamAction: leetPlusResponse.action ?? null,
      replySent: false,
      dryRun: config.dryRun,
      callbackAnswered,
    };
  }

  if (alreadySentByApi) {
    const callbackAnswered = config.dryRun
      ? false
      : await answerTelegramCallbackQueryIfNeeded(
          config,
          telegramFetchImpl,
          logger,
          callbackQueryId,
        );

    logger.log(
      `Telegram edge skipped reply already sent by API action=${stringValue(
        leetPlusResponse.action,
      )} status=${stringValue(leetPlusResponse.status)} chat=${chatIdMasked}`,
    );

    return {
      ok: true,
      upstreamStatus: leetPlusResponse.status ?? null,
      upstreamAction: leetPlusResponse.action ?? null,
      replySent: false,
      replyAlreadySentByApi: true,
      dryRun: config.dryRun,
      chatIdMasked,
      callbackAnswered,
    };
  }

  if (!chatId) {
    logger.warn(
      `Telegram edge webhook got reply but no chat id action=${stringValue(
        leetPlusResponse.action,
      )}`,
    );

    return {
      ok: true,
      upstreamStatus: leetPlusResponse.status ?? null,
      upstreamAction: leetPlusResponse.action ?? null,
      replySent: false,
      dryRun: config.dryRun,
      note: 'No Telegram chat id in update.',
    };
  }

  if (config.dryRun) {
    logger.log(
      `Telegram edge dry-run action=${stringValue(
        leetPlusResponse.action,
      )} status=${stringValue(leetPlusResponse.status)} chat=${chatIdMasked}`,
    );

    return {
      ok: true,
      upstreamStatus: leetPlusResponse.status ?? null,
      upstreamAction: leetPlusResponse.action ?? null,
      replySent: false,
      dryRun: true,
      chatIdMasked,
    };
  }

  const callbackAnswered = await answerTelegramCallbackQueryIfNeeded(
    config,
    telegramFetchImpl,
    logger,
    callbackQueryId,
  );
  const telegramResult = await sendTelegramReply(
    config,
    telegramFetchImpl,
    chatId,
    replyText,
    reply.replyMarkup,
  );

  logger.log(
    `Telegram edge sent reply action=${stringValue(
      leetPlusResponse.action,
    )} status=${stringValue(
      leetPlusResponse.status,
    )} chat=${chatIdMasked} message=${telegramResult.messageId ?? '-'}`,
  );

  return {
    ok: true,
    upstreamStatus: leetPlusResponse.status ?? null,
    upstreamAction: leetPlusResponse.action ?? null,
    replySent: true,
    dryRun: false,
    chatIdMasked,
    telegramMessageId: telegramResult.messageId,
    callbackAnswered,
  };
}

export async function startTelegramEdgeServer(
  config: TelegramEdgeConfig,
  deps: TelegramEdgeDeps = {},
): Promise<TelegramEdgeServerHandle> {
  validateTelegramEdgeConfig(config);

  const logger = deps.logger ?? console;
  const server = createServer((request, response) => {
    void routeTelegramEdgeRequest(config, deps, request, response).catch(
      (error) => {
        const httpError = error as HttpError;
        const status =
          typeof httpError.status === 'number' ? httpError.status : 500;
        const message = safeErrorMessage(error);

        logger.error(
          `Telegram edge request failed status=${status}: ${message}`,
        );
        sendJson(response, status, {
          ok: false,
          error: status >= 500 ? 'telegram_edge_failed' : message,
        });
      },
    );
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, config.host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  logger.log(
    `Telegram edge adapter listening on ${config.host}:${config.port}`,
  );

  return {
    url: `http://${config.host}:${config.port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

async function routeTelegramEdgeRequest(
  config: TelegramEdgeConfig,
  deps: TelegramEdgeDeps,
  request: IncomingMessage,
  response: ServerResponse,
) {
  const method = request.method ?? 'GET';
  const url = new URL(request.url ?? '/', `http://${request.headers.host}`);

  if (method === 'GET' && url.pathname === '/health') {
    if (!healthAllowed(config, request, url)) {
      sendJson(response, 401, { ok: false, error: 'unauthorized' });
      return;
    }

    sendJson(response, 200, {
      ok: true,
      service: 'telegram-edge-adapter',
      dryRun: config.dryRun,
    });
    return;
  }

  if (method !== 'POST' || url.pathname !== '/tg/webhook') {
    sendJson(response, 404, { ok: false, error: 'not_found' });
    return;
  }

  const requestSecret = headerValue(
    request.headers['x-telegram-bot-api-secret-token'],
  );

  if (requestSecret !== config.webhookSecret) {
    sendJson(response, 401, { ok: false, error: 'invalid_webhook_secret' });
    return;
  }

  const body = await readJsonBody(request, config.maxBodyBytes);
  const result = await handleTelegramEdgeWebhook(config, body, deps);

  sendJson(response, 200, result);
}

async function sendTelegramReply(
  config: TelegramEdgeConfig,
  fetchImpl: TelegramEdgeFetch,
  chatId: string,
  text: string,
  replyMarkup: unknown,
): Promise<{ messageId: string | null }> {
  if (!config.botToken) {
    throw new Error('Telegram bot token is not configured.');
  }

  const body: JsonBody = {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
  };

  if (replyMarkup && typeof replyMarkup === 'object') {
    body.reply_markup = replyMarkup;
  }

  const response = await postJson<TelegramSendMessageResponse>(
    `${config.telegramApiBaseUrl}/bot${config.botToken}/sendMessage`,
    body,
    fetchImpl,
    config.requestTimeoutMs,
  );

  if (response.ok !== true) {
    throw new Error(
      typeof response.description === 'string'
        ? response.description
        : 'Telegram Bot API returned ok=false.',
    );
  }

  const rawMessageId = response.result?.message_id;

  return {
    messageId:
      typeof rawMessageId === 'string' || typeof rawMessageId === 'number'
        ? String(rawMessageId)
        : null,
  };
}

async function answerTelegramCallbackQueryIfNeeded(
  config: TelegramEdgeConfig,
  fetchImpl: TelegramEdgeFetch,
  logger: TelegramEdgeLogger,
  callbackQueryId: string | null,
) {
  if (!callbackQueryId) {
    return false;
  }

  try {
    const response = await postJson<TelegramAnswerCallbackQueryResponse>(
      `${config.telegramApiBaseUrl}/bot${config.botToken}/answerCallbackQuery`,
      { callback_query_id: callbackQueryId },
      fetchImpl,
      config.requestTimeoutMs,
    );

    if (response.ok !== true) {
      throw new Error(
        typeof response.description === 'string'
          ? response.description
          : 'Telegram Bot API returned ok=false.',
      );
    }

    return true;
  } catch (error) {
    logger.warn(
      `Telegram edge callback answer failed: ${safeErrorMessage(error)}`,
    );
    return false;
  }
}

async function postJson<T>(
  url: string,
  body: JsonBody,
  fetchImpl: TelegramEdgeFetch,
  timeoutMs: number,
  extraHeaders: Record<string, string> = {},
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...extraHeaders,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();

    if (!response.ok) {
      const error = new Error(
        `HTTP ${response.status}: ${bounded(text, 500)}`,
      ) as HttpError;

      error.status = response.status;
      error.body = text;
      throw error;
    }

    return parseJson<T>(text);
  } finally {
    clearTimeout(timeout);
  }
}

async function readJsonBody(request: IncomingMessage, maxBodyBytes: number) {
  let body = '';

  for await (const chunk of request as AsyncIterable<Buffer | string>) {
    body += typeof chunk === 'string' ? chunk : chunk.toString('utf8');

    if (Buffer.byteLength(body, 'utf8') > maxBodyBytes) {
      const error = new Error('Request body is too large.') as HttpError;

      error.status = 413;
      throw error;
    }
  }

  if (!body.trim()) {
    return {};
  }

  return JSON.parse(body) as unknown;
}

function telegramUpdate(value: unknown): TelegramUpdate {
  return value && typeof value === 'object' ? value : {};
}

function telegramChatId(update: TelegramUpdate) {
  return telegramIdValue(
    update.message?.chat?.id ??
      update.edited_message?.chat?.id ??
      update.callback_query?.message?.chat?.id ??
      update.callback_query?.from?.id,
  );
}

function telegramCallbackQueryId(update: TelegramUpdate) {
  return telegramIdValue(update.callback_query?.id);
}

function telegramIdValue(value: unknown) {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }

  return null;
}

function healthAllowed(
  config: TelegramEdgeConfig,
  request: IncomingMessage,
  url: URL,
) {
  if (!config.healthSecret) {
    return true;
  }

  const headerSecret = headerValue(request.headers['x-edge-health-secret']);
  const querySecret = url.searchParams.get('secret');

  return (
    headerSecret === config.healthSecret || querySecret === config.healthSecret
  );
}

function sendJson(response: ServerResponse, status: number, body: JsonBody) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(body));
}

function parseJson<T>(text: string): T {
  if (!text.trim()) {
    return {} as T;
  }

  return JSON.parse(text) as T;
}

function normalizeBaseUrl(value: string) {
  const normalized = value.trim();

  return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
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

function trimmed(value: string | undefined) {
  return value?.trim() ? value.trim() : null;
}

function headerValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : '-';
}

function maskChatId(value: string | null) {
  if (!value) {
    return null;
  }

  return value.length <= 4 ? 'ch...' : `ch...${value.slice(-2)}`;
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

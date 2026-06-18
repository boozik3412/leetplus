export type BotConsumerChannel = 'TELEGRAM' | 'MAX';

export type BotConsumerConfig = {
  apiUrl: string;
  syncToken: string;
  tenantId: string | null;
  tenantSlug: string | null;
  channels: BotConsumerChannel[];
  limit: number;
  dryRun: boolean;
  telegramToken: string | null;
  telegramApiBaseUrl: string;
  requestTimeoutMs: number;
};

export type BotConsumerEnv = Record<string, string | undefined>;

export type BotConsumerFetch = typeof fetch;

export type BotConsumerLogger = Pick<Console, 'error' | 'log' | 'warn'>;

export type BotConsumerRecipient = {
  telegramChatId: string | null;
  maxIdentity: string | null;
  identityMasked: string | null;
  recipientMasked: string | null;
};

export type BotConsumerDelivery = {
  tenantId: string;
  tenantSlug: string;
  deliveryId: string;
  rewardId: string;
  channel: BotConsumerChannel;
  channelLabel: string;
  recipient: BotConsumerRecipient;
  message: {
    title: string;
    body: string;
  };
  reward: {
    label: string;
    amount: number;
    type: string;
    code: string | null;
    expiresAt: string | null;
  };
  store: { id: string; name: string } | null;
  preparedAt: string;
};

export type BotConsumerPullResult = {
  checked: number;
  ready: number;
  skipped: number;
  items: BotConsumerDelivery[];
  note: string;
};

export type BotConsumerAckStatus = 'SENT' | 'FAILED' | 'BLOCKED';

export type BotConsumerRunItem = {
  deliveryId: string;
  rewardId: string;
  channel: BotConsumerChannel;
  status: BotConsumerAckStatus | 'DRY_RUN';
  note: string;
};

export type BotConsumerRunResult = {
  dryRun: boolean;
  pulled: number;
  processed: number;
  sent: number;
  failed: number;
  blocked: number;
  skipped: number;
  acked: number;
  idempotentAcks: number;
  items: BotConsumerRunItem[];
  note: string;
};

type BotConsumerDeps = {
  fetch?: BotConsumerFetch;
  logger?: BotConsumerLogger;
};

type JsonBody = Record<string, unknown>;

type BotConsumerAckResponse = {
  idempotent?: unknown;
};

type BotConsumerAckResult = {
  idempotent: boolean;
};

const defaultLimit = 10;
const defaultRequestTimeoutMs = 15_000;

export function loadBotConsumerConfig(
  env: BotConsumerEnv = process.env,
): BotConsumerConfig {
  const apiUrl = normalizeBaseUrl(
    env.GUEST_GAME_BOT_CONSUMER_API_URL ??
      env.API_URL ??
      'http://localhost:4000',
  );
  const syncToken =
    trimmed(env.GUEST_GAME_BOT_CONSUMER_SYNC_TOKEN) ??
    trimmed(env.SYNC_SERVICE_TOKEN) ??
    '';
  const tenantId = trimmed(env.GUEST_GAME_BOT_CONSUMER_TENANT_ID);
  const tenantSlug = trimmed(env.GUEST_GAME_BOT_CONSUMER_TENANT_SLUG);
  const channels = parseChannels(env.GUEST_GAME_BOT_CONSUMER_CHANNELS);
  const limit = parseBoundedInt(
    env.GUEST_GAME_BOT_CONSUMER_LIMIT,
    defaultLimit,
    1,
    50,
  );
  const dryRun = parseBoolean(env.GUEST_GAME_BOT_CONSUMER_DRY_RUN, true);
  const telegramToken =
    trimmed(env.GUEST_GAME_BOT_CONSUMER_TELEGRAM_BOT_TOKEN) ??
    trimmed(env.GUEST_GAME_TELEGRAM_BOT_TOKEN) ??
    trimmed(env.GUEST_PORTAL_TELEGRAM_BOT_TOKEN) ??
    trimmed(env.TELEGRAM_BOT_TOKEN);
  const telegramApiBaseUrl = normalizeBaseUrl(
    env.GUEST_GAME_BOT_CONSUMER_TELEGRAM_API_BASE_URL ??
      env.GUEST_GAME_TG_EDGE_TELEGRAM_API_BASE_URL ??
      env.TELEGRAM_API_BASE_URL ??
      'https://api.telegram.org',
  );
  const requestTimeoutMs = parseBoundedInt(
    env.GUEST_GAME_BOT_CONSUMER_REQUEST_TIMEOUT_MS,
    defaultRequestTimeoutMs,
    1000,
    120_000,
  );
  const config = {
    apiUrl,
    syncToken,
    tenantId,
    tenantSlug,
    channels,
    limit,
    dryRun,
    telegramToken,
    telegramApiBaseUrl,
    requestTimeoutMs,
  };

  validateBotConsumerConfig(config);

  return config;
}

export function validateBotConsumerConfig(config: BotConsumerConfig) {
  if (!config.syncToken) {
    throw new Error('SYNC_SERVICE_TOKEN is required for bot consumer.');
  }

  if (!config.tenantId && !config.tenantSlug) {
    throw new Error(
      'GUEST_GAME_BOT_CONSUMER_TENANT_ID or GUEST_GAME_BOT_CONSUMER_TENANT_SLUG is required.',
    );
  }

  if (!config.dryRun && config.channels.includes('TELEGRAM')) {
    if (!config.telegramToken) {
      throw new Error(
        'Telegram real send requires GUEST_GAME_BOT_CONSUMER_TELEGRAM_BOT_TOKEN or GUEST_GAME_TELEGRAM_BOT_TOKEN.',
      );
    }
  }

  if (!config.dryRun && config.channels.includes('MAX')) {
    throw new Error(
      'MAX real send is not enabled in the VDS bot consumer yet. Use TELEGRAM or keep dry-run=true.',
    );
  }
}

export async function runBotConsumerOnce(
  config: BotConsumerConfig,
  deps: BotConsumerDeps = {},
): Promise<BotConsumerRunResult> {
  validateBotConsumerConfig(config);

  const fetchImpl = deps.fetch ?? fetch;
  const pull = await pullBotDeliveries(config, fetchImpl);
  const items: BotConsumerRunItem[] = [];
  let sent = 0;
  let failed = 0;
  let blocked = 0;
  let skipped = 0;
  let acked = 0;
  let idempotentAcks = 0;

  for (const delivery of pull.items) {
    if (config.dryRun) {
      skipped += 1;
      items.push({
        deliveryId: delivery.deliveryId,
        rewardId: delivery.rewardId,
        channel: delivery.channel,
        status: 'DRY_RUN',
        note: 'Dry-run: delivery payload was pulled but no external message was sent and no ack was written.',
      });
      continue;
    }

    if (delivery.channel !== 'TELEGRAM') {
      const note = 'Only Telegram real send is supported by this consumer.';
      const ack = await ackBotDelivery(config, fetchImpl, delivery, {
        status: 'BLOCKED',
        note,
        errorCode: 'unsupported_channel',
      });
      blocked += 1;
      acked += 1;
      idempotentAcks += ack.idempotent ? 1 : 0;
      items.push({
        deliveryId: delivery.deliveryId,
        rewardId: delivery.rewardId,
        channel: delivery.channel,
        status: 'BLOCKED',
        note,
      });
      continue;
    }

    try {
      const telegramResult = await sendTelegramDelivery(
        config,
        fetchImpl,
        delivery,
      );
      const note = 'Telegram bot consumer sent reward delivery.';
      const ack = await ackBotDelivery(config, fetchImpl, delivery, {
        status: 'SENT',
        note,
        providerMessageId: telegramResult.messageId,
        providerStatus: 'telegram:ok',
      });
      sent += 1;
      acked += 1;
      idempotentAcks += ack.idempotent ? 1 : 0;
      items.push({
        deliveryId: delivery.deliveryId,
        rewardId: delivery.rewardId,
        channel: delivery.channel,
        status: 'SENT',
        note,
      });
    } catch (error) {
      const note = safeErrorMessage(error);
      const ack = await ackBotDelivery(config, fetchImpl, delivery, {
        status: 'FAILED',
        note,
        providerStatus: 'telegram:error',
        errorCode: 'telegram_send_failed',
      });
      failed += 1;
      acked += 1;
      idempotentAcks += ack.idempotent ? 1 : 0;
      items.push({
        deliveryId: delivery.deliveryId,
        rewardId: delivery.rewardId,
        channel: delivery.channel,
        status: 'FAILED',
        note,
      });
    }
  }

  deps.logger?.log(
    [
      'Guest game bot consumer',
      config.dryRun ? 'dry-run' : 'real-send',
      `pulled=${pull.ready}`,
      `sent=${sent}`,
      `failed=${failed}`,
      `blocked=${blocked}`,
      `skipped=${skipped}`,
      `acked=${acked}`,
      `idempotentAcks=${idempotentAcks}`,
    ].join(' '),
  );

  return {
    dryRun: config.dryRun,
    pulled: pull.ready,
    processed: pull.items.length,
    sent,
    failed,
    blocked,
    skipped,
    acked,
    idempotentAcks,
    items,
    note: config.dryRun
      ? 'Bot consumer dry-run completed without external sends or LeetPlus ack writes.'
      : 'Bot consumer processed ready deliveries and acked delivery results to LeetPlus.',
  };
}

async function pullBotDeliveries(
  config: BotConsumerConfig,
  fetchImpl: BotConsumerFetch,
): Promise<BotConsumerPullResult> {
  return postLeetPlusJson<BotConsumerPullResult>(
    config,
    '/guests/gamification/scheduled/deliveries/bot/pull',
    {
      tenantId: config.tenantId,
      tenantSlug: config.tenantSlug,
      channels: config.channels,
      limit: config.limit,
    },
    fetchImpl,
  );
}

async function ackBotDelivery(
  config: BotConsumerConfig,
  fetchImpl: BotConsumerFetch,
  delivery: BotConsumerDelivery,
  payload: {
    status: BotConsumerAckStatus;
    note: string;
    providerMessageId?: string | null;
    providerStatus?: string | null;
    errorCode?: string | null;
  },
): Promise<BotConsumerAckResult> {
  const response = await postLeetPlusJson<BotConsumerAckResponse>(
    config,
    '/guests/gamification/scheduled/deliveries/bot/ack',
    {
      tenantId: delivery.tenantId,
      tenantSlug: delivery.tenantSlug,
      deliveryId: delivery.deliveryId,
      status: payload.status,
      note: payload.note,
      providerMessageId: payload.providerMessageId ?? null,
      providerStatus: payload.providerStatus ?? null,
      errorCode: payload.errorCode ?? null,
    },
    fetchImpl,
  );

  return {
    idempotent: response.idempotent === true,
  };
}

async function sendTelegramDelivery(
  config: BotConsumerConfig,
  fetchImpl: BotConsumerFetch,
  delivery: BotConsumerDelivery,
): Promise<{ messageId: string | null }> {
  const chatId = delivery.recipient.telegramChatId;

  if (!chatId) {
    throw new Error('Telegram delivery has no confirmed chat id.');
  }

  if (!config.telegramToken) {
    throw new Error('Telegram bot token is not configured.');
  }

  const response = await postJson<TelegramSendMessageResponse>(
    `${config.telegramApiBaseUrl}/bot${config.telegramToken}/sendMessage`,
    {
      chat_id: chatId,
      text: formatTelegramText(delivery),
      disable_web_page_preview: true,
    },
    fetchImpl,
    config.requestTimeoutMs,
  );

  if (!response.ok) {
    throw new Error(
      response.description ?? 'Telegram Bot API returned ok=false.',
    );
  }

  return {
    messageId:
      response.result?.message_id === undefined
        ? null
        : String(response.result.message_id),
  };
}

async function postLeetPlusJson<T>(
  config: BotConsumerConfig,
  path: string,
  body: JsonBody,
  fetchImpl: BotConsumerFetch,
): Promise<T> {
  return postJson<T>(
    `${config.apiUrl}${path}`,
    body,
    fetchImpl,
    config.requestTimeoutMs,
    {
      'x-sync-service-token': config.syncToken,
    },
  );
}

async function postJson<T>(
  url: string,
  body: JsonBody,
  fetchImpl: BotConsumerFetch,
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
      throw new Error(`HTTP ${response.status}: ${bounded(text, 500)}`);
    }

    return parseJson<T>(text);
  } finally {
    clearTimeout(timeout);
  }
}

function formatTelegramText(delivery: BotConsumerDelivery) {
  const store = delivery.store ? `\nClub: ${delivery.store.name}` : '';
  const amount =
    delivery.reward.amount > 0
      ? `\nReward amount: ${delivery.reward.amount}`
      : '';
  const code = delivery.reward.code ? `\nCode: ${delivery.reward.code}` : '';
  const expires = delivery.reward.expiresAt
    ? `\nValid until: ${delivery.reward.expiresAt}`
    : '';

  return bounded(
    `${delivery.message.title}\n\n${delivery.message.body}${store}${amount}${code}${expires}`,
    4096,
  );
}

function parseJson<T>(text: string): T {
  if (!text.trim()) {
    return {} as T;
  }

  return JSON.parse(text) as T;
}

function normalizeBaseUrl(value: string) {
  const trimmedValue = value.trim();

  return trimmedValue.endsWith('/') ? trimmedValue.slice(0, -1) : trimmedValue;
}

function parseChannels(value: string | undefined): BotConsumerChannel[] {
  const raw = value?.trim() ? value.split(',') : ['TELEGRAM'];
  const channels = raw
    .map((item) => item.trim().toUpperCase())
    .filter(
      (item): item is BotConsumerChannel =>
        item === 'TELEGRAM' || item === 'MAX',
    );
  const unique = [...new Set(channels)];

  return unique.length ? unique : ['TELEGRAM'];
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

function safeErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return bounded(error.message, 500);
  }

  return bounded(String(error), 500);
}

function bounded(value: string, maxLength: number) {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

type TelegramSendMessageResponse = {
  ok: boolean;
  description?: string;
  result?: {
    message_id?: number | string;
  };
};

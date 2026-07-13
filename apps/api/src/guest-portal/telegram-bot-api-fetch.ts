import { ProxyAgent, fetch as undiciFetch } from 'undici';

export type TelegramBotApiFetch = typeof fetch;
export type TelegramBotApiProxyEnv = Record<string, string | undefined>;

const proxyEnvNames = [
  'GUEST_GAME_TG_EDGE_TELEGRAM_PROXY_URL',
  'GUEST_GAME_BOT_CONSUMER_TELEGRAM_PROXY_URL',
  'GUEST_GAME_TELEGRAM_BOT_API_PROXY_URL',
  'TELEGRAM_BOT_API_PROXY_URL',
] as const;

export function loadTelegramBotApiProxyUrl(
  env: TelegramBotApiProxyEnv = process.env,
) {
  const rawProxyUrl = proxyEnvNames
    .map((name) => trimmed(env[name]))
    .find((value): value is string => value !== null);

  if (!rawProxyUrl) {
    return null;
  }

  return validateTelegramBotApiProxyUrl(rawProxyUrl);
}

export function createTelegramBotApiFetch(
  env: TelegramBotApiProxyEnv = process.env,
): TelegramBotApiFetch {
  const proxyUrl = loadTelegramBotApiProxyUrl(env);

  if (!proxyUrl) {
    return fetch;
  }

  const dispatcher = new ProxyAgent(proxyUrl);

  return ((input, init) =>
    undiciFetch(
      input as Parameters<typeof undiciFetch>[0],
      {
        ...init,
        dispatcher,
      } as Parameters<typeof undiciFetch>[1],
    ) as unknown as ReturnType<TelegramBotApiFetch>) as TelegramBotApiFetch;
}

export function maskTelegramBotApiProxyUrl(proxyUrl: string) {
  try {
    const url = new URL(proxyUrl);
    const port = url.port ? `:${url.port}` : '';

    return `${url.protocol}//${url.hostname}${port}`;
  } catch {
    return '<configured>';
  }
}

function validateTelegramBotApiProxyUrl(value: string) {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error('Telegram Bot API proxy URL must be a valid http(s) URL.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(
      'Telegram Bot API proxy URL must use http or https protocol.',
    );
  }

  return value;
}

function trimmed(value: string | undefined) {
  return value?.trim() ? value.trim() : null;
}

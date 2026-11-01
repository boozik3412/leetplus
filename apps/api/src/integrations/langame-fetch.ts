import { ProxyAgent, fetch as undiciFetch } from 'undici';

export type LangameFetch = typeof fetch;

/**
 * The production egress firewall admits only exact, pre-listed hosts, while
 * every Langame club network lives on its own `*.langame.ru` server. When
 * LANGAME_PROXY_URL is set, Langame requests go through the dedicated CONNECT
 * proxy (deploy/simple/langame-proxy.mjs) that admits any `*.langame.ru` and
 * `*.langamepro.ru` host on port 443, so a new network connects without a
 * host firewall change.
 */
export function createLangameFetch(
  env: Record<string, string | undefined> = process.env,
): LangameFetch {
  const proxyUrl = loadLangameProxyUrl(env);

  if (!proxyUrl) {
    // Resolve the global at call time so test spies on fetch keep working.
    return (input: Parameters<LangameFetch>[0], init?: RequestInit) =>
      fetch(input, init);
  }

  const dispatcher = new ProxyAgent(proxyUrl);

  return ((input, init) =>
    undiciFetch(
      input as Parameters<typeof undiciFetch>[0],
      { ...init, dispatcher } as Parameters<typeof undiciFetch>[1],
    ) as unknown as ReturnType<LangameFetch>) as LangameFetch;
}

export function loadLangameProxyUrl(
  env: Record<string, string | undefined> = process.env,
) {
  const value = env.LANGAME_PROXY_URL?.trim();

  if (!value) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('LANGAME_PROXY_URL must be a valid http URL.');
  }

  if (url.protocol !== 'http:' || url.username || url.password) {
    throw new Error(
      'LANGAME_PROXY_URL must be a plain http:// proxy address without credentials.',
    );
  }

  return value;
}

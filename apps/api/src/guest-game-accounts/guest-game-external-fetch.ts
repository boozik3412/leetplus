import { ProxyAgent, fetch as undiciFetch } from 'undici';

export type GuestGameExternalFetch = typeof fetch;

/**
 * Steam and FACEIT requests of the guest game. The production egress fence
 * admits only pre-listed hosts; when GUEST_GAME_EXTERNAL_PROXY_URL is set the
 * requests go through the CONNECT proxy (deploy/simple/langame-proxy.mjs with
 * the game hosts added to LANGAME_PROXY_SUFFIXES). TLS stays end to end, so the
 * proxy never sees API keys. Without the variable requests go direct.
 */
export function createGuestGameExternalFetch(
  env: Record<string, string | undefined> = process.env,
): GuestGameExternalFetch {
  const proxyUrl = loadGuestGameExternalProxyUrl(env);

  if (!proxyUrl) {
    // Resolve the global at call time so test spies on fetch keep working.
    return (input: Parameters<GuestGameExternalFetch>[0], init?: RequestInit) =>
      fetch(input, init);
  }

  const dispatcher = new ProxyAgent(proxyUrl);

  return ((input, init) =>
    undiciFetch(
      input as Parameters<typeof undiciFetch>[0],
      { ...init, dispatcher } as Parameters<typeof undiciFetch>[1],
    ) as unknown as ReturnType<GuestGameExternalFetch>) as GuestGameExternalFetch;
}

export function loadGuestGameExternalProxyUrl(
  env: Record<string, string | undefined> = process.env,
) {
  const value = env.GUEST_GAME_EXTERNAL_PROXY_URL?.trim();

  if (!value) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('GUEST_GAME_EXTERNAL_PROXY_URL must be a valid http URL.');
  }

  if (url.protocol !== 'http:' || url.username || url.password) {
    throw new Error(
      'GUEST_GAME_EXTERNAL_PROXY_URL must be a plain http:// proxy address without credentials.',
    );
  }

  return value;
}

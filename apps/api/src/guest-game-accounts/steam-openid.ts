import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Steam sign-in (OpenID 2.0, stateless mode). Steam is the only OpenID
 * provider admitted here: the guest proves the account on steamcommunity.com
 * and we never accept a typed SteamID or nickname.
 *
 * Flow:
 * 1. `buildSteamOpenIdRedirect` sends the guest to Steam with a `return_to`
 *    that carries our signed state (tenant, profile, expiry).
 * 2. Steam redirects back to the web page with `openid.*` parameters.
 * 3. `parseSteamOpenIdAssertion` checks them against the exact `return_to`,
 *    and `verifySteamOpenIdAssertion` asks Steam (`check_authentication`)
 *    whether the signature is genuine.
 */

export const STEAM_OPENID_ENDPOINT = 'https://steamcommunity.com/openid/login';
const OPENID_NS = 'http://specs.openid.net/auth/2.0';
const IDENTIFIER_SELECT = 'http://specs.openid.net/auth/2.0/identifier_select';
const CLAIMED_ID_PATTERN =
  /^https:\/\/steamcommunity\.com\/openid\/id\/(7656119[0-9]{10})$/;
const STATE_VERSION = 'v1';
const STATE_PATTERN = /^v1\.[A-Za-z0-9_-]{16,512}\.[A-Za-z0-9_-]{43}$/;
export const STEAM_STATE_TTL_MS = 15 * 60 * 1000;
export const STEAM_OPENID_TIMEOUT_MS = 8_000;
const MAX_OPENID_FIELDS = 16;
const MAX_OPENID_VALUE_LENGTH = 2048;
/** SteamID64 of an individual account starts at 76561197960265728. */
const STEAM_ID64_BASE = 76561197960265728n;

export type SteamLinkState = {
  tenantId: string;
  profileId: string;
  expiresAt: number;
  nonce: string;
};

export class SteamOpenIdError extends Error {
  constructor(
    readonly code:
      | 'STATE_INVALID'
      | 'STATE_EXPIRED'
      | 'STATE_FOREIGN'
      | 'ASSERTION_INVALID'
      | 'RETURN_TO_MISMATCH'
      | 'NOT_VERIFIED'
      | 'PROVIDER_UNAVAILABLE',
    message: string,
  ) {
    super(message);
    this.name = 'SteamOpenIdError';
  }
}

function base64Url(value: Buffer | string) {
  return Buffer.from(value).toString('base64url');
}

function stateSignature(key: string, body: string) {
  return createHmac('sha256', `leetplus:guest-game:steam-link:${key}`)
    .update(`${STATE_VERSION}.${body}`)
    .digest('base64url');
}

export function signSteamLinkState(
  key: string,
  input: { tenantId: string; profileId: string; now: number },
) {
  const state: SteamLinkState = {
    tenantId: input.tenantId,
    profileId: input.profileId,
    expiresAt: input.now + STEAM_STATE_TTL_MS,
    nonce: randomBytes(12).toString('base64url'),
  };
  const body = base64Url(
    JSON.stringify([
      state.tenantId,
      state.profileId,
      state.expiresAt,
      state.nonce,
    ]),
  );

  return `${STATE_VERSION}.${body}.${stateSignature(key, body)}`;
}

export function verifySteamLinkState(
  key: string,
  token: unknown,
  expected: { tenantId: string; profileId: string; now: number },
): SteamLinkState {
  if (typeof token !== 'string' || !STATE_PATTERN.test(token)) {
    throw new SteamOpenIdError(
      'STATE_INVALID',
      'Ссылка входа через Steam повреждена.',
    );
  }

  const [, body, signature] = token.split('.');
  const actual = Buffer.from(signature);
  const wanted = Buffer.from(stateSignature(key, body));

  if (actual.length !== wanted.length || !timingSafeEqual(actual, wanted)) {
    throw new SteamOpenIdError(
      'STATE_INVALID',
      'Ссылка входа через Steam повреждена.',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    throw new SteamOpenIdError(
      'STATE_INVALID',
      'Ссылка входа через Steam повреждена.',
    );
  }

  if (
    !Array.isArray(parsed) ||
    parsed.length !== 4 ||
    typeof parsed[0] !== 'string' ||
    typeof parsed[1] !== 'string' ||
    typeof parsed[2] !== 'number' ||
    typeof parsed[3] !== 'string'
  ) {
    throw new SteamOpenIdError(
      'STATE_INVALID',
      'Ссылка входа через Steam повреждена.',
    );
  }

  const state: SteamLinkState = {
    tenantId: parsed[0],
    profileId: parsed[1],
    expiresAt: parsed[2],
    nonce: parsed[3],
  };

  if (
    state.tenantId !== expected.tenantId ||
    state.profileId !== expected.profileId
  ) {
    throw new SteamOpenIdError(
      'STATE_FOREIGN',
      'Вход через Steam начат в другом профиле. Начните привязку заново.',
    );
  }

  if (state.expiresAt < expected.now) {
    throw new SteamOpenIdError(
      'STATE_EXPIRED',
      'Время на вход через Steam вышло. Начните привязку заново.',
    );
  }

  return state;
}

export function steamReturnTo(webUrl: string, state: string) {
  const base = webUrl.replace(/\/+$/, '');

  return `${base}/game/accounts?lpState=${encodeURIComponent(state)}`;
}

export function steamRealm(webUrl: string) {
  return new URL(webUrl).origin;
}

export function buildSteamOpenIdRedirect(input: {
  returnTo: string;
  realm: string;
}) {
  const url = new URL(STEAM_OPENID_ENDPOINT);
  url.searchParams.set('openid.ns', OPENID_NS);
  url.searchParams.set('openid.mode', 'checkid_setup');
  url.searchParams.set('openid.return_to', input.returnTo);
  url.searchParams.set('openid.realm', input.realm);
  url.searchParams.set('openid.identity', IDENTIFIER_SELECT);
  url.searchParams.set('openid.claimed_id', IDENTIFIER_SELECT);

  return url.toString();
}

/**
 * Validates the shape of the `openid.*` parameters Steam returned and binds
 * them to the exact `return_to` we issued. Returns the parameters to send back
 * for `check_authentication` and the SteamID64.
 */
export function parseSteamOpenIdAssertion(
  raw: unknown,
  expectedReturnTo: string,
): { steamId64: string; params: Record<string, string> } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new SteamOpenIdError(
      'ASSERTION_INVALID',
      'Steam не подтвердил вход.',
    );
  }

  const entries = Object.entries(raw as Record<string, unknown>);

  if (entries.length === 0 || entries.length > MAX_OPENID_FIELDS) {
    throw new SteamOpenIdError(
      'ASSERTION_INVALID',
      'Steam не подтвердил вход.',
    );
  }

  const params: Record<string, string> = {};

  for (const [key, value] of entries) {
    if (
      !/^openid\.[a-z_]{2,32}$/.test(key) ||
      typeof value !== 'string' ||
      value.length > MAX_OPENID_VALUE_LENGTH
    ) {
      throw new SteamOpenIdError(
        'ASSERTION_INVALID',
        'Steam не подтвердил вход.',
      );
    }
    params[key] = value;
  }

  if (
    params['openid.ns'] !== OPENID_NS ||
    params['openid.mode'] !== 'id_res' ||
    params['openid.op_endpoint'] !== STEAM_OPENID_ENDPOINT ||
    !params['openid.sig'] ||
    !params['openid.signed'] ||
    !params['openid.assoc_handle'] ||
    !params['openid.response_nonce']
  ) {
    throw new SteamOpenIdError(
      'ASSERTION_INVALID',
      'Steam не подтвердил вход.',
    );
  }

  if (params['openid.return_to'] !== expectedReturnTo) {
    throw new SteamOpenIdError(
      'RETURN_TO_MISMATCH',
      'Ответ Steam относится к другой ссылке. Начните привязку заново.',
    );
  }

  const claimed = CLAIMED_ID_PATTERN.exec(params['openid.claimed_id'] ?? '');

  if (!claimed || params['openid.identity'] !== params['openid.claimed_id']) {
    throw new SteamOpenIdError(
      'ASSERTION_INVALID',
      'Steam не подтвердил вход.',
    );
  }

  // Every field that identifies the account must be covered by the signature.
  const signed = new Set(params['openid.signed'].split(','));
  for (const field of [
    'claimed_id',
    'identity',
    'return_to',
    'response_nonce',
    'op_endpoint',
  ]) {
    if (!signed.has(field)) {
      throw new SteamOpenIdError(
        'ASSERTION_INVALID',
        'Steam не подтвердил вход.',
      );
    }
  }

  const steamId64 = claimed[1];
  if (BigInt(steamId64) < STEAM_ID64_BASE) {
    throw new SteamOpenIdError(
      'ASSERTION_INVALID',
      'Steam не подтвердил вход.',
    );
  }

  return { steamId64, params };
}

export type SteamOpenIdFetch = (
  input: string,
  init: {
    method: 'POST';
    headers: Record<string, string>;
    body: string;
    signal: AbortSignal;
  },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

/** Asks Steam whether the signed assertion is genuine (stateless mode). */
export async function verifySteamOpenIdAssertion(
  params: Record<string, string>,
  fetchImpl: SteamOpenIdFetch,
  timeoutMs = STEAM_OPENID_TIMEOUT_MS,
) {
  const body = new URLSearchParams({
    ...params,
    'openid.mode': 'check_authentication',
  });
  let text: string;

  try {
    const response = await fetchImpl(STEAM_OPENID_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'text/plain',
      },
      body: body.toString(),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    text = (await response.text()).slice(0, 4096);
  } catch {
    throw new SteamOpenIdError(
      'PROVIDER_UNAVAILABLE',
      'Steam сейчас не отвечает. Попробуйте ещё раз через минуту.',
    );
  }

  const valid = text
    .split('\n')
    .map((line) => line.trim())
    .includes('is_valid:true');

  if (!valid) {
    throw new SteamOpenIdError('NOT_VERIFIED', 'Steam не подтвердил вход.');
  }
}

/** Dota 2 / OpenDota account id of a SteamID64. */
export function steamAccountId32(steamId64: string) {
  return (BigInt(steamId64) - STEAM_ID64_BASE).toString();
}

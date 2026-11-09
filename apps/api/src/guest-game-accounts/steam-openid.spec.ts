import {
  STEAM_OPENID_ENDPOINT,
  STEAM_STATE_TTL_MS,
  SteamOpenIdError,
  buildSteamOpenIdRedirect,
  parseSteamOpenIdAssertion,
  signSteamLinkState,
  steamAccountId32,
  steamRealm,
  steamReturnTo,
  verifySteamLinkState,
  verifySteamOpenIdAssertion,
  type SteamOpenIdFetch,
} from './steam-openid';

const KEY = 'test-guest-portal-secret';
const SCOPE = { tenantId: 'tenant-1', profileId: 'profile-1' };
const STEAM_ID = '76561198000000001';
const WEB = 'https://app.leetplus.ru/';

function assertion(returnTo: string, overrides: Record<string, string> = {}) {
  return {
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'id_res',
    'openid.op_endpoint': STEAM_OPENID_ENDPOINT,
    'openid.claimed_id': `https://steamcommunity.com/openid/id/${STEAM_ID}`,
    'openid.identity': `https://steamcommunity.com/openid/id/${STEAM_ID}`,
    'openid.return_to': returnTo,
    'openid.response_nonce': '2026-11-09T10:00:00ZabcDEF',
    'openid.assoc_handle': '1234567890',
    'openid.signed':
      'signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle',
    'openid.sig': 'c2lnbmF0dXJl',
    ...overrides,
  };
}

function code(run: () => unknown) {
  try {
    run();
  } catch (error) {
    return error instanceof SteamOpenIdError ? error.code : 'OTHER';
  }
  return null;
}

describe('Steam OpenID link', () => {
  it('signs a state bound to the exact tenant profile and expiry', () => {
    const now = Date.UTC(2026, 10, 9, 10);
    const state = signSteamLinkState(KEY, { ...SCOPE, now });

    expect(verifySteamLinkState(KEY, state, { ...SCOPE, now })).toMatchObject({
      ...SCOPE,
      expiresAt: now + STEAM_STATE_TTL_MS,
    });
    expect(
      code(() =>
        verifySteamLinkState(KEY, state, { ...SCOPE, profileId: 'other', now }),
      ),
    ).toBe('STATE_FOREIGN');
    expect(
      code(() =>
        verifySteamLinkState(KEY, state, {
          ...SCOPE,
          now: now + STEAM_STATE_TTL_MS + 1,
        }),
      ),
    ).toBe('STATE_EXPIRED');
    expect(
      code(() => verifySteamLinkState('other-key', state, { ...SCOPE, now })),
    ).toBe('STATE_INVALID');
    const [version, body, signature] = state.split('.');
    const tampered = `${version}.${body.slice(0, -2)}AA.${signature}`;
    expect(
      code(() => verifySteamLinkState(KEY, tampered, { ...SCOPE, now })),
    ).toBe('STATE_INVALID');
    expect(code(() => verifySteamLinkState(KEY, 42, { ...SCOPE, now }))).toBe(
      'STATE_INVALID',
    );
  });

  it('redirects to Steam with our return_to and realm', () => {
    const returnTo = steamReturnTo(WEB, 'v1.state');
    const redirect = new URL(
      buildSteamOpenIdRedirect({ returnTo, realm: steamRealm(WEB) }),
    );

    expect(`${redirect.origin}${redirect.pathname}`).toBe(
      STEAM_OPENID_ENDPOINT,
    );
    expect(redirect.searchParams.get('openid.mode')).toBe('checkid_setup');
    expect(redirect.searchParams.get('openid.return_to')).toBe(
      'https://app.leetplus.ru/game/accounts?lpState=v1.state',
    );
    expect(redirect.searchParams.get('openid.realm')).toBe(
      'https://app.leetplus.ru',
    );
  });

  it('accepts only a signed Steam assertion for the issued return_to', () => {
    const returnTo = steamReturnTo(WEB, 'v1.state');

    expect(parseSteamOpenIdAssertion(assertion(returnTo), returnTo)).toEqual({
      steamId64: STEAM_ID,
      params: assertion(returnTo),
    });
    expect(
      code(() =>
        parseSteamOpenIdAssertion(
          assertion(steamReturnTo(WEB, 'v1.other')),
          returnTo,
        ),
      ),
    ).toBe('RETURN_TO_MISMATCH');
    for (const overrides of [
      { 'openid.op_endpoint': 'https://evil.example/openid/login' },
      {
        'openid.claimed_id': 'https://evil.example/openid/id/76561198000000001',
      },
      {
        'openid.identity':
          'https://steamcommunity.com/openid/id/76561198000000002',
      },
      { 'openid.mode': 'cancel' },
      {
        'openid.signed': 'signed,op_endpoint,identity,return_to,response_nonce',
      },
      { 'openid.extra_field_name_x': 'x', 'openid.Bad': 'y' },
    ]) {
      expect(
        code(() =>
          parseSteamOpenIdAssertion(assertion(returnTo, overrides), returnTo),
        ),
      ).toBe('ASSERTION_INVALID');
    }
    expect(code(() => parseSteamOpenIdAssertion(null, returnTo))).toBe(
      'ASSERTION_INVALID',
    );
  });

  it('asks Steam to check the signature and requires is_valid:true', async () => {
    const params = assertion('https://app.leetplus.ru/game/accounts?lpState=x');
    const reply = (body: string) => ({
      ok: true,
      status: 200,
      text: () => Promise.resolve(body),
    });
    const fetchImpl = jest
      .fn<ReturnType<SteamOpenIdFetch>, Parameters<SteamOpenIdFetch>>()
      .mockResolvedValue(
        reply('ns:http://specs.openid.net/auth/2.0\nis_valid:true\n'),
      );

    await expect(
      verifySteamOpenIdAssertion(params, fetchImpl),
    ).resolves.toBeUndefined();
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(STEAM_OPENID_ENDPOINT);
    expect(new URLSearchParams(init.body).get('openid.mode')).toBe(
      'check_authentication',
    );
    expect(new URLSearchParams(init.body).get('openid.sig')).toBe(
      'c2lnbmF0dXJl',
    );

    fetchImpl.mockResolvedValueOnce(
      reply('ns:http://specs.openid.net/auth/2.0\nis_valid:false\n'),
    );
    await expect(
      verifySteamOpenIdAssertion(params, fetchImpl),
    ).rejects.toMatchObject({ code: 'NOT_VERIFIED' });

    fetchImpl.mockRejectedValueOnce(new Error('timeout'));
    await expect(
      verifySteamOpenIdAssertion(params, fetchImpl),
    ).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
  });

  it('derives the Dota account id from SteamID64', () => {
    expect(steamAccountId32('76561197960265729')).toBe('1');
  });
});

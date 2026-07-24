import {
  buildGuestGameOriginKey,
  buildGuestGamePhysicalProgressIdentity,
  buildGuestGamePlayTimeOriginKey,
  buildGuestGameRewardIdempotencyKey,
  canonicalGuestGameEventType,
  canonicalGuestGameProgressFamily,
  normalizeGuestGameExternalDomain,
  normalizeGuestGameSourceKind,
} from './guest-game-origin-key';

describe('guest game origin key', () => {
  it('builds the same key for LIVE and Ledger play-time aliases', () => {
    const live = buildGuestGameOriginKey({
      externalProvider: 'LANGAME',
      externalDomain: 'https://46.langamepro.ru/public_api',
      eventType: 'PLAY_HOUR',
      stableExternalId: 'session-42',
    });
    const ledger = buildGuestGameOriginKey({
      externalProvider: 'langame',
      externalDomain: '46.langamepro.ru',
      eventType: 'HOURLY_PLAY_TIME_ACCUMULATED',
      stableExternalId: 'session-42',
    });

    expect(live).toBe(ledger);
    expect(live).toMatch(/^ggo:v1:[a-f0-9]{64}$/);
  });

  it('uses the same origin for tariff-neutral exact play time', () => {
    const live = buildGuestGameOriginKey({
      externalProvider: 'LANGAME',
      externalDomain: '46.langamepro.ru',
      eventType: 'PLAY_HOUR',
      stableExternalId: 'session-neutral-42',
    });
    const neutralLedger = buildGuestGameOriginKey({
      externalProvider: 'LANGAME',
      externalDomain: '46.langamepro.ru',
      eventType: 'SESSION_PLAY_TIME_ACCUMULATED',
      stableExternalId: 'session-neutral-42',
    });

    expect(neutralLedger).toBe(live);
  });

  it('keeps different physical actions separate', () => {
    const base = {
      externalProvider: 'LANGAME',
      externalDomain: '46.langamepro.ru',
      eventType: 'PRODUCT_PURCHASE',
    };
    expect(
      buildGuestGameOriginKey({ ...base, stableExternalId: 'sale-1' }),
    ).not.toBe(
      buildGuestGameOriginKey({ ...base, stableExternalId: 'sale-2' }),
    );
  });

  it('builds the same key for LIVE and Ledger purchase aliases', () => {
    expect(
      buildGuestGameOriginKey({
        externalProvider: 'LANGAME',
        externalDomain: '46.langamepro.ru',
        eventType: 'PRODUCT_PURCHASE',
        stableExternalId: 'sale-42',
      }),
    ).toBe(
      buildGuestGameOriginKey({
        externalProvider: 'LANGAME',
        externalDomain: '46.langamepro.ru',
        eventType: 'PRODUCT_PURCHASED',
        stableExternalId: 'sale-42',
      }),
    );
  });

  it('normalizes balance top-up aliases around the stable operation id', () => {
    expect(
      buildGuestGameOriginKey({
        externalProvider: 'LANGAME',
        externalDomain: '46.langamepro.ru',
        eventType: 'BALANCE_TOP_UP',
        stableExternalId: 'operation-42',
      }),
    ).toBe(
      buildGuestGameOriginKey({
        externalProvider: 'LANGAME',
        externalDomain: '46.langamepro.ru',
        eventType: 'BALANCE_TOPUP',
        stableExternalId: 'operation-42',
      }),
    );
  });

  it('does not create a key without a stable domain identity', () => {
    expect(
      buildGuestGameOriginKey({
        externalProvider: 'LANGAME',
        eventType: 'PLAY_HOUR',
        stableExternalId: 'session-42',
      }),
    ).toBeNull();
  });

  it('creates a per-rule reward key without exposing source identifiers', () => {
    const key = buildGuestGameRewardIdempotencyKey({
      originKey: `ggo:v1:${'a'.repeat(64)}`,
      ruleKind: 'SEASON',
      ruleId: 'season-1',
      slot: 2,
    });
    expect(key).toMatch(/^ggr:v1:[a-f0-9]{64}$/);
    expect(key).not.toContain('season-1');
  });

  it('normalizes domains and event aliases', () => {
    expect(normalizeGuestGameExternalDomain('HTTPS://EXAMPLE.COM/a')).toBe(
      'example.com',
    );
    expect(canonicalGuestGameEventType('product_purchased')).toBe(
      'PRODUCT_PURCHASE',
    );
  });

  it.each([
    'PLAY_HOUR',
    'SESSION_STOP',
    'SESSION_ENDED',
    'SESSION_PLAY_TIME_ACCUMULATED',
    'HOURLY_PLAY_TIME_ACCUMULATED',
    'PACKAGE_OR_SUBSCRIPTION_PLAY_TIME_ACCUMULATED',
  ])('maps %s into the canonical PLAY_TIME family', (eventType) => {
    expect(canonicalGuestGameProgressFamily(eventType)).toBe('PLAY_TIME');
  });

  it('does not classify session start or unrelated actions as PLAY_TIME', () => {
    expect(canonicalGuestGameProgressFamily('SESSION_START')).toBeNull();
    expect(canonicalGuestGameProgressFamily('PRODUCT_PURCHASE')).toBeNull();
  });

  it('normalizes the live and ledger guest-session source aliases', () => {
    expect(normalizeGuestGameSourceKind(' GUEST_SESSION ')).toBe(
      'LANGAME_GUEST_SESSION',
    );
    expect(normalizeGuestGameSourceKind('langame_guest_session')).toBe(
      'LANGAME_GUEST_SESSION',
    );
    expect(normalizeGuestGameSourceKind('another_session_source')).toBe(
      'ANOTHER_SESSION_SOURCE',
    );
  });

  it('builds one physical identity across parser classifications and aliases', () => {
    const live = buildGuestGamePhysicalProgressIdentity({
      externalProvider: 'langame',
      externalDomain: 'https://46.langamepro.ru/public_api',
      sourceKind: 'GUEST_SESSION',
      sessionExternalId: 'session-42',
      eventType: 'PLAY_HOUR',
    });
    const reparsed = buildGuestGamePhysicalProgressIdentity({
      externalProvider: 'LANGAME',
      externalDomain: '46.langamepro.ru',
      sourceKind: 'LANGAME_GUEST_SESSION',
      sessionExternalId: 'session-42',
      eventType: 'PACKAGE_OR_SUBSCRIPTION_PLAY_TIME_ACCUMULATED',
    });

    expect(reparsed).toEqual(live);
    expect(live).toMatchObject({
      externalProvider: 'LANGAME',
      externalDomain: '46.langamepro.ru',
      sourceKind: 'LANGAME_GUEST_SESSION',
      sessionExternalId: 'session-42',
      family: 'PLAY_TIME',
      key: expect.stringMatching(/^ggp:v1:[a-f0-9]{64}$/),
    });
  });

  it.each([
    ['provider', { externalProvider: 'OTHER_PROVIDER' }],
    ['domain', { externalDomain: 'other.langamepro.ru' }],
    ['source kind', { sourceKind: 'OTHER_SESSION_SOURCE' }],
    ['session id', { sessionExternalId: 'session-43' }],
  ])('keeps a different %s physically distinct', (_, override) => {
    const base = {
      externalProvider: 'LANGAME',
      externalDomain: '46.langamepro.ru',
      sourceKind: 'LANGAME_GUEST_SESSION',
      sessionExternalId: 'session-42',
      eventType: 'PLAY_HOUR',
    };

    expect(
      buildGuestGamePhysicalProgressIdentity({
        ...base,
        ...override,
      })?.key,
    ).not.toBe(buildGuestGamePhysicalProgressIdentity(base)?.key);
  });

  it.each([
    ['provider', { externalProvider: null }],
    ['domain', { externalDomain: null }],
    ['source kind', { sourceKind: null }],
    ['session id', { sessionExternalId: null }],
    ['PLAY_TIME family', { eventType: 'SESSION_START' }],
  ])('does not claim a strong identity without %s', (_, override) => {
    expect(
      buildGuestGamePhysicalProgressIdentity({
        externalProvider: 'LANGAME',
        externalDomain: '46.langamepro.ru',
        sourceKind: 'LANGAME_GUEST_SESSION',
        sessionExternalId: 'session-42',
        eventType: 'PLAY_HOUR',
        ...override,
      }),
    ).toBeNull();
  });

  it('builds a source-aware v2 PLAY_TIME origin without changing v1', () => {
    const input = {
      externalProvider: 'LANGAME',
      externalDomain: '46.langamepro.ru',
      sourceKind: 'LANGAME_GUEST_SESSION',
      sessionExternalId: 'session-42',
      eventType: 'PLAY_HOUR',
    };

    expect(buildGuestGamePlayTimeOriginKey(input)).toMatch(
      /^ggo:v2:[a-f0-9]{64}$/,
    );
    expect(
      buildGuestGameOriginKey({
        externalProvider: input.externalProvider,
        externalDomain: input.externalDomain,
        eventType: input.eventType,
        stableExternalId: input.sessionExternalId,
      }),
    ).toMatch(/^ggo:v1:[a-f0-9]{64}$/);
  });

  it('does not build a v2 origin for a non-play-time action', () => {
    expect(
      buildGuestGamePlayTimeOriginKey({
        externalProvider: 'LANGAME',
        externalDomain: '46.langamepro.ru',
        sourceKind: 'LANGAME_GUEST_SESSION',
        sessionExternalId: 'session-42',
        eventType: 'SESSION_START',
      }),
    ).toBeNull();
  });
});

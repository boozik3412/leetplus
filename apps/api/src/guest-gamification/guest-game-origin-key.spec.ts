import {
  buildGuestGameOriginKey,
  buildGuestGameRewardIdempotencyKey,
  canonicalGuestGameEventType,
  normalizeGuestGameExternalDomain,
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
});

import {
  GUEST_GAME_DELIVERY_LEGACY_ACK_DENIAL_REASON,
  GUEST_GAME_DELIVERY_LEGACY_PREPARE_DENIAL_REASON,
  GUEST_GAME_DELIVERY_LEGACY_PROTOCOL_DENIAL_REASON,
  GUEST_GAME_DELIVERY_LEGACY_REVOKE_DENIAL_REASON,
  GUEST_GAME_DELIVERY_LEGACY_UNSUBSCRIBE_DENIAL_REASON,
  GUEST_GAME_DELIVERY_LEGACY_UPDATE_DENIAL_REASON,
  evaluateLegacyGuestGameDeliveryProtocolGate,
  isLegacyGuestGameProviderDeliveryChannel,
  type GuestGameLegacyDeliveryPath,
} from './guest-game-delivery-protocol-gate';

describe('legacy guest-game delivery protocol gate', () => {
  const previousRealSend = process.env.GUEST_GAME_DELIVERY_REAL_SEND_ENABLED;
  const previousMaxCanary =
    process.env.GUEST_GAME_MAX_DELIVERY_LIVE_CANARY_ENABLED;

  afterAll(() => {
    if (previousRealSend === undefined) {
      delete process.env.GUEST_GAME_DELIVERY_REAL_SEND_ENABLED;
    } else {
      process.env.GUEST_GAME_DELIVERY_REAL_SEND_ENABLED = previousRealSend;
    }

    if (previousMaxCanary === undefined) {
      delete process.env.GUEST_GAME_MAX_DELIVERY_LIVE_CANARY_ENABLED;
    } else {
      process.env.GUEST_GAME_MAX_DELIVERY_LIVE_CANARY_ENABLED =
        previousMaxCanary;
    }
  });

  it.each([
    [
      'LEGACY_DIRECT_PROVIDER',
      GUEST_GAME_DELIVERY_LEGACY_PROTOCOL_DENIAL_REASON,
      'forced to dry-run',
    ],
    [
      'LEGACY_BOT_PULL',
      GUEST_GAME_DELIVERY_LEGACY_PROTOCOL_DENIAL_REASON,
      'no sendable payload',
    ],
    [
      'LEGACY_PROVIDER_PREPARE',
      GUEST_GAME_DELIVERY_LEGACY_PREPARE_DENIAL_REASON,
      'were not created or refreshed',
    ],
    [
      'LEGACY_PROVIDER_UPDATE',
      GUEST_GAME_DELIVERY_LEGACY_UPDATE_DENIAL_REASON,
      'row was not changed',
    ],
    [
      'LEGACY_BOT_ACK',
      GUEST_GAME_DELIVERY_LEGACY_ACK_DENIAL_REASON,
      'stale provider acknowledgements',
    ],
    [
      'LEGACY_PROVIDER_REVOKE',
      GUEST_GAME_DELIVERY_LEGACY_REVOKE_DENIAL_REASON,
      'Reward and ledger cancellation continued',
    ],
    [
      'LEGACY_PROVIDER_UNSUBSCRIBE',
      GUEST_GAME_DELIVERY_LEGACY_UNSUBSCRIBE_DENIAL_REASON,
      'communication consent was updated',
    ],
  ] as const)('default-denies %s', (path, expectedReasonCode, expectedNote) => {
    const decision = evaluateLegacyGuestGameDeliveryProtocolGate(path);

    expect(decision).toMatchObject({
      allowed: false,
      path,
      reasonCode: expectedReasonCode,
      requiredProtocolVersion: 1,
      acceptedProtocolVersion: null,
      coordinatorReady: false,
    });
    expect(decision.note).toContain(expectedNote);
  });

  it('cannot be enabled by legacy real-send or canary flags', () => {
    process.env.GUEST_GAME_DELIVERY_REAL_SEND_ENABLED = 'true';
    process.env.GUEST_GAME_MAX_DELIVERY_LIVE_CANARY_ENABLED = 'true';

    const legacyPaths: GuestGameLegacyDeliveryPath[] = [
      'LEGACY_DIRECT_PROVIDER',
      'LEGACY_BOT_PULL',
      'LEGACY_PROVIDER_PREPARE',
      'LEGACY_PROVIDER_UPDATE',
      'LEGACY_BOT_ACK',
      'LEGACY_PROVIDER_REVOKE',
      'LEGACY_PROVIDER_UNSUBSCRIBE',
    ];

    for (const path of legacyPaths) {
      expect(evaluateLegacyGuestGameDeliveryProtocolGate(path).allowed).toBe(
        false,
      );
    }
  });

  it.each([
    ['TELEGRAM', true],
    ['MAX', true],
    ['CASHIER', false],
    ['MANUAL', false],
    [null, false],
    [undefined, false],
  ] as const)('classifies provider channel %s as %s', (channel, expected) => {
    expect(isLegacyGuestGameProviderDeliveryChannel(channel)).toBe(expected);
  });
});

import {
  guestGameRewardMaterializerAllowsTenant,
  guestGameRewardMaterializerClaimsAllowed,
  resolveGuestGameRewardMaterializerPolicy,
} from './guest-game-reward-materializer-policy';

function policy(values: Record<string, string> = {}) {
  return resolveGuestGameRewardMaterializerPolicy({
    get: jest.fn((key: string) => values[key]),
  });
}

describe('guest game reward materializer policy', () => {
  it('fails closed by default and without an explicit scope', () => {
    expect(policy()).toMatchObject({
      enabled: false,
      killSwitchEnabled: false,
      scopeConfigured: false,
      ready: false,
    });
    expect(
      policy({ GUEST_GAME_REWARD_MATERIALIZER_ENABLED: 'true' }),
    ).toMatchObject({ scopeConfigured: false, ready: false });
  });

  it('honors the global kill switch for every tenant', () => {
    const resolved = policy({
      GUEST_GAME_REWARD_MATERIALIZER_ENABLED: 'true',
      GUEST_GAME_REWARD_MATERIALIZER_KILL_SWITCH: 'true',
      GUEST_GAME_REWARD_MATERIALIZER_ALLOW_ALL_TENANTS: 'true',
    });

    expect(resolved.ready).toBe(false);
    expect(guestGameRewardMaterializerClaimsAllowed(resolved)).toBe(false);
    expect(
      guestGameRewardMaterializerAllowsTenant(resolved, {
        tenantId: 'tenant-1',
        tenantSlug: 'demo',
      }),
    ).toBe(false);
  });

  it('keeps inline claims enabled when only the background worker is off', () => {
    const resolved = policy();

    expect(resolved.ready).toBe(false);
    expect(guestGameRewardMaterializerClaimsAllowed(resolved)).toBe(true);
  });

  it('allows only the configured tenant id and slug', () => {
    const resolved = policy({
      GUEST_GAME_REWARD_MATERIALIZER_ENABLED: 'true',
      GUEST_GAME_REWARD_MATERIALIZER_TENANT_ID: 'tenant-1',
      GUEST_GAME_REWARD_MATERIALIZER_TENANT_SLUG: 'demo',
    });

    expect(
      guestGameRewardMaterializerAllowsTenant(resolved, {
        tenantId: 'tenant-1',
        tenantSlug: 'demo',
      }),
    ).toBe(true);
    expect(
      guestGameRewardMaterializerAllowsTenant(resolved, {
        tenantId: 'tenant-2',
        tenantSlug: 'demo',
      }),
    ).toBe(false);
    expect(
      guestGameRewardMaterializerAllowsTenant(resolved, {
        tenantId: 'tenant-1',
        tenantSlug: 'other',
      }),
    ).toBe(false);
  });

  it('requires explicit allow-all before accepting an unscoped tenant', () => {
    const resolved = policy({
      GUEST_GAME_REWARD_MATERIALIZER_ENABLED: 'true',
      GUEST_GAME_REWARD_MATERIALIZER_ALLOW_ALL_TENANTS: 'yes',
    });

    expect(resolved.ready).toBe(true);
    expect(
      guestGameRewardMaterializerAllowsTenant(resolved, {
        tenantId: 'tenant-2',
        tenantSlug: 'other',
      }),
    ).toBe(true);
  });
});

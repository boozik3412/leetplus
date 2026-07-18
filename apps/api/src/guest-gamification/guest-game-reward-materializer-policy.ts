import type { ConfigService } from '@nestjs/config';

export type GuestGameRewardMaterializerPolicy = {
  enabled: boolean;
  killSwitchEnabled: boolean;
  tenantId: string | null;
  tenantSlug: string | null;
  allowAllTenants: boolean;
  scopeConfigured: boolean;
  ready: boolean;
};

type GuestGameRewardMaterializerTenant = {
  tenantId: string;
  tenantSlug?: string | null;
};

export function resolveGuestGameRewardMaterializerPolicy(
  config: Pick<ConfigService, 'get'>,
): GuestGameRewardMaterializerPolicy {
  const enabled = optionalBoolean(
    config,
    'GUEST_GAME_REWARD_MATERIALIZER_ENABLED',
  );
  const killSwitchEnabled = optionalBoolean(
    config,
    'GUEST_GAME_REWARD_MATERIALIZER_KILL_SWITCH',
  );
  const tenantId = optionalString(
    config,
    'GUEST_GAME_REWARD_MATERIALIZER_TENANT_ID',
  );
  const tenantSlug = optionalString(
    config,
    'GUEST_GAME_REWARD_MATERIALIZER_TENANT_SLUG',
  );
  const allowAllTenants = optionalBoolean(
    config,
    'GUEST_GAME_REWARD_MATERIALIZER_ALLOW_ALL_TENANTS',
  );
  const scopeConfigured = Boolean(tenantId || tenantSlug || allowAllTenants);

  return {
    enabled,
    killSwitchEnabled,
    tenantId,
    tenantSlug,
    allowAllTenants,
    scopeConfigured,
    ready: enabled && !killSwitchEnabled && scopeConfigured,
  };
}

export function guestGameRewardMaterializerAllowsTenant(
  policy: GuestGameRewardMaterializerPolicy,
  tenant: GuestGameRewardMaterializerTenant,
) {
  if (!policy.ready) return false;
  if (policy.tenantId && policy.tenantId !== tenant.tenantId) return false;
  if (
    policy.tenantSlug &&
    policy.tenantSlug !== (tenant.tenantSlug?.trim() || null)
  ) {
    return false;
  }
  return Boolean(
    policy.allowAllTenants || policy.tenantId || policy.tenantSlug,
  );
}

export function guestGameRewardMaterializerClaimsAllowed(
  policy: GuestGameRewardMaterializerPolicy,
) {
  return !policy.killSwitchEnabled;
}

function optionalBoolean(config: Pick<ConfigService, 'get'>, key: string) {
  const value = config.get<string>(key)?.trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(value ?? '');
}

function optionalString(config: Pick<ConfigService, 'get'>, key: string) {
  return config.get<string>(key)?.trim() || null;
}

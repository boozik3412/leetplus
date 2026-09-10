export const PRODUCTION_NETWORK_PROFILE_KEY = 'PRODUCTION_NETWORK_PROFILE';
export const COMPOSE_RUNTIME_CONTRACT = 'LEETPLUS_COMPOSE_BLUE_GREEN_V1';

/** The host controller independently attests the namespace and published ports.
 * This setting selects a reviewed deployment contract; it is not proof that
 * an arbitrary container/host is safe to expose. The existing host default
 * remains loopback-only, including when the setting is missing.
 */
export function productionNetworkErrors(config: Record<string, unknown>) {
  const profile = config[PRODUCTION_NETWORK_PROFILE_KEY] ?? 'HOST_LOOPBACK';
  if (profile === 'HOST_LOOPBACK') {
    return config.API_BIND_HOST === '127.0.0.1'
      ? []
      : ['API_BIND_HOST must equal 127.0.0.1 in production'];
  }
  if (profile !== 'DOCKER_BRIDGE') {
    return [
      'PRODUCTION_NETWORK_PROFILE must be HOST_LOOPBACK or DOCKER_BRIDGE',
    ];
  }
  const errors: string[] = [];
  if (config.API_BIND_HOST !== '0.0.0.0') {
    errors.push('DOCKER_BRIDGE requires API_BIND_HOST=0.0.0.0');
  }
  if (config.COMPOSE_RUNTIME_CONTRACT !== COMPOSE_RUNTIME_CONTRACT) {
    errors.push('DOCKER_BRIDGE requires the exact Compose runtime contract');
  }
  if (config.API_RUNTIME_ROLE !== 'COMBINED') {
    errors.push(
      'DOCKER_BRIDGE currently admits only the explicit COMBINED role',
    );
  }
  if (config.DESIGN_PARTNER_ISOLATED_MODE === 'true') {
    errors.push('DOCKER_BRIDGE is not a design-partner runtime admission');
  }
  try {
    const url = new URL(String(config.DATABASE_URL ?? ''));
    const expected = new Map([
      ['schema', 'public'],
      ['connection_limit', '4'],
      ['pool_timeout', '5'],
      ['connect_timeout', '5'],
      ['sslmode', 'require'],
      ['sslcert', '/run/secrets/db-ca.pem'],
      ['sslaccept', 'strict'],
    ]);
    if (
      url.protocol !== 'postgresql:' ||
      url.username !== 'leetplus_runtime' ||
      url.hostname !== 'postgres' ||
      !['', '5432'].includes(url.port) ||
      url.pathname !== '/leetplus' ||
      !url.password ||
      url.hash ||
      [...url.searchParams.keys()].length !== expected.size ||
      [...expected].some(
        ([key, value]) =>
          url.searchParams.getAll(key).length !== 1 ||
          url.searchParams.get(key) !== value,
      )
    ) {
      errors.push(
        'DOCKER_BRIDGE requires the bounded non-owner Prisma database role and strict certificate verification',
      );
    }
  } catch {
    errors.push('DOCKER_BRIDGE requires a valid bounded PostgreSQL URL');
  }
  for (const key of [
    'ACCESS_SCOPE_ENFORCEMENT_MODE',
    'STAFF_ATTACHMENT_ACL_MODE',
  ]) {
    if (config[key] !== 'ENFORCED')
      errors.push(`${key} must equal ENFORCED in DOCKER_BRIDGE`);
  }
  for (const key of [
    'GUEST_GAME_BONUS_LEDGER_SCHEDULER_ENABLED',
    'LANGAME_DAILY_SYNC_SCHEDULER_ENABLED',
    'LANGAME_SCHEDULED_HTTP_ENABLED',
    'GUEST_ACTIVITY_LEDGER_SCHEDULER_ENABLED',
    'GUEST_GAME_PIPELINE_SCHEDULER_ENABLED',
    'GUEST_GAME_REWARD_MATERIALIZER_ENABLED',
    'GUEST_GAME_MONITORING_ENABLED',
  ]) {
    if (config[key] !== 'false')
      errors.push(`${key} must equal false in DOCKER_BRIDGE`);
  }
  return errors;
}

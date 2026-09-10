import { productionNetworkErrors } from './production-network-profile';

const docker = {
  PRODUCTION_NETWORK_PROFILE: 'DOCKER_BRIDGE',
  COMPOSE_RUNTIME_CONTRACT: 'LEETPLUS_COMPOSE_BLUE_GREEN_V1',
  API_BIND_HOST: '0.0.0.0',
  API_RUNTIME_ROLE: 'COMBINED',
  DATABASE_URL:
    'postgresql://leetplus_runtime:fixture-only@postgres:5432/leetplus?schema=public&connection_limit=4&pool_timeout=5&connect_timeout=5&sslmode=require&sslcert=/run/secrets/db-ca.pem&sslaccept=strict',
  ACCESS_SCOPE_ENFORCEMENT_MODE: 'ENFORCED',
  STAFF_ATTACHMENT_ACL_MODE: 'ENFORCED',
  GUEST_GAME_BONUS_LEDGER_SCHEDULER_ENABLED: 'false',
  LANGAME_DAILY_SYNC_SCHEDULER_ENABLED: 'false',
  LANGAME_SCHEDULED_HTTP_ENABLED: 'false',
  GUEST_ACTIVITY_LEDGER_SCHEDULER_ENABLED: 'false',
  GUEST_GAME_PIPELINE_SCHEDULER_ENABLED: 'false',
  GUEST_GAME_REWARD_MATERIALIZER_ENABLED: 'false',
  GUEST_GAME_MONITORING_ENABLED: 'false',
};

describe('production network profile', () => {
  it('preserves the host loopback default', () => {
    expect(productionNetworkErrors({ API_BIND_HOST: '127.0.0.1' })).toEqual([]);
    expect(productionNetworkErrors({ API_BIND_HOST: '0.0.0.0' })).toHaveLength(
      1,
    );
  });
  it('admits the explicitly bounded combined Docker profile', () => {
    expect(productionNetworkErrors(docker)).toEqual([]);
  });
  it.each(['', 'docker_bridge', 'DOCKER_BRIDGE ', 'HOST', 'UNKNOWN'])(
    'rejects an unknown or noncanonical profile %s',
    (profile) =>
      expect(
        productionNetworkErrors({
          ...docker,
          PRODUCTION_NETWORK_PROFILE: profile,
        }),
      ).not.toEqual([]),
  );
  it.each(['GUEST', 'CORPORATE', undefined])(
    'does not activate dormant split role %s',
    (role) => {
      expect(
        productionNetworkErrors({ ...docker, API_RUNTIME_ROLE: role }),
      ).not.toEqual([]);
    },
  );
  it('rejects an unbound namespace, weakened ACL, or background authority', () => {
    for (const [key, value] of [
      ['COMPOSE_RUNTIME_CONTRACT', 'other'],
      ['API_BIND_HOST', '::'],
      ['STAFF_ATTACHMENT_ACL_MODE', 'SHADOW'],
      ['ACCESS_SCOPE_ENFORCEMENT_MODE', 'LEGACY'],
      ['GUEST_GAME_REWARD_MATERIALIZER_ENABLED', 'true'],
      ['LANGAME_DAILY_SYNC_SCHEDULER_ENABLED', undefined],
      ['DESIGN_PARTNER_ISOLATED_MODE', 'true'],
    ]) {
      expect(
        productionNetworkErrors({ ...docker, [key as string]: value }),
      ).not.toEqual([]);
    }
  });
  it.each([
    ['leetplus_runtime:', 'postgres:'],
    ['@postgres:', '@another:'],
    ['connection_limit=4', 'connection_limit=40'],
    ['sslmode=require', 'sslmode=disable'],
    ['sslaccept=strict', 'sslaccept=accept_invalid_certs'],
    ['schema=public', 'schema=public&schema=private'],
  ])('rejects unsafe database transport %s', (from, to) => {
    expect(
      productionNetworkErrors({
        ...docker,
        DATABASE_URL: docker.DATABASE_URL.replace(from, to),
      }),
    ).not.toEqual([]);
  });
});

import { ConfigService } from '@nestjs/config';
import {
  PRODUCTION_SECRET_KEYS,
  resolveAccessScopeEnforcementMode,
  resolveSecuritySecret,
  validateEnvironment,
} from './environment-validation';

function validProductionEnvironment() {
  return {
    NODE_ENV: 'production',
    JWT_SECRET: `jwt_${'a'.repeat(44)}`,
    GUEST_PORTAL_JWT_SECRET: `guest_jwt_${'b'.repeat(44)}`,
    GUEST_GAME_REFERRAL_SECRET: `referral_${'d'.repeat(44)}`,
    APP_ENCRYPTION_KEY: `pii_${'e'.repeat(44)}`,
    INTEGRATION_ENCRYPTION_KEY: `integration_${'f'.repeat(44)}`,
    SYNC_SERVICE_TOKEN: `scheduler_${'g'.repeat(44)}`,
    RELEASE_SHA: 'a'.repeat(40),
    BUILD_TIME: '2026-07-26T15:00:00.000Z',
    EXPECTED_DATABASE_MIGRATION: '20260727090000_access_scope_expand',
    EXPECTED_DATABASE_MIGRATION_COUNT: '151',
    ACCESS_SCOPE_ENFORCEMENT_MODE: 'SHADOW',
  };
}

describe('validateEnvironment', () => {
  it('keeps local and test configuration optional', () => {
    const local = { NODE_ENV: 'test' };

    expect(validateEnvironment(local)).toBe(local);
  });

  it.each([
    ['APP_ENV', 'prod'],
    ['DEPLOY_ENV', 'live'],
    ['ENVIRONMENT', 'production'],
    ['VERCEL_ENV', 'production'],
  ])('fails closed for the %s production marker', (key, value) => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'development',
        [key]: value,
      }),
    ).toThrow('Invalid production environment');
  });

  it('accepts independent production secrets and trims their edges', () => {
    const environment = validProductionEnvironment();
    environment.JWT_SECRET = `  ${environment.JWT_SECRET}  `;

    const validated = validateEnvironment(environment);

    expect(validated.JWT_SECRET).toBe(environment.JWT_SECRET.trim());
  });

  it('reports every missing production secret without disclosing values', () => {
    expect(() => validateEnvironment({ NODE_ENV: 'production' })).toThrow(
      new RegExp(PRODUCTION_SECRET_KEYS.join('.*'), 's'),
    );
  });

  it('rejects short and placeholder production secrets', () => {
    const environment = validProductionEnvironment();
    environment.JWT_SECRET = 'short';
    environment.SYNC_SERVICE_TOKEN = 'change_me_for_cron';

    expect(() => validateEnvironment(environment)).toThrow(
      /JWT_SECRET must contain at least 32 characters/,
    );
    expect(() => validateEnvironment(environment)).toThrow(
      /SYNC_SERVICE_TOKEN must not contain a placeholder value/,
    );
  });

  it('rejects a secret reused across security boundaries', () => {
    const environment = validProductionEnvironment();
    environment.GUEST_PORTAL_JWT_SECRET = environment.JWT_SECRET;

    expect(() => validateEnvironment(environment)).toThrow(
      /JWT_SECRET, GUEST_PORTAL_JWT_SECRET must use independent values/,
    );
  });

  it('requires exact release identity and schema revision in production', () => {
    const environment = validProductionEnvironment();
    environment.RELEASE_SHA = 'short-sha';
    environment.BUILD_TIME = 'today';
    environment.EXPECTED_DATABASE_MIGRATION = 'latest';
    environment.EXPECTED_DATABASE_MIGRATION_COUNT = '0';

    expect(() => validateEnvironment(environment)).toThrow(
      /RELEASE_SHA must be the full 40-character Git SHA/,
    );
    expect(() => validateEnvironment(environment)).toThrow(
      /BUILD_TIME must be a UTC ISO-8601 timestamp/,
    );
    expect(() => validateEnvironment(environment)).toThrow(
      /EXPECTED_DATABASE_MIGRATION must name the release migration directory/,
    );
    expect(() => validateEnvironment(environment)).toThrow(
      /EXPECTED_DATABASE_MIGRATION_COUNT must be a positive integer/,
    );
  });

  it('requires an explicit access-scope rollout mode in production', () => {
    const missing = validProductionEnvironment();
    delete (missing as Partial<ReturnType<typeof validProductionEnvironment>>)
      .ACCESS_SCOPE_ENFORCEMENT_MODE;
    const invalid = {
      ...validProductionEnvironment(),
      ACCESS_SCOPE_ENFORCEMENT_MODE: 'legacy',
    };

    expect(() => validateEnvironment(missing)).toThrow(
      /ACCESS_SCOPE_ENFORCEMENT_MODE is required/,
    );
    expect(() => validateEnvironment(invalid)).toThrow(
      /ACCESS_SCOPE_ENFORCEMENT_MODE must be SHADOW or ENFORCED/,
    );
  });
});

describe('resolveAccessScopeEnforcementMode', () => {
  it('defaults to fail-closed enforcement outside a rollout override', () => {
    expect(resolveAccessScopeEnforcementMode(undefined)).toBe('ENFORCED');
    expect(resolveAccessScopeEnforcementMode(' enforced ')).toBe('ENFORCED');
    expect(resolveAccessScopeEnforcementMode('shadow')).toBe('SHADOW');
  });

  it('rejects unknown modes', () => {
    expect(() => resolveAccessScopeEnforcementMode('legacy')).toThrow(
      /must be SHADOW or ENFORCED/,
    );
  });
});

describe('resolveSecuritySecret', () => {
  it('creates a stable process-local fallback outside production', () => {
    const config = new ConfigService({ NODE_ENV: 'test' });

    const first = resolveSecuritySecret(config, 'JWT_SECRET');
    const second = resolveSecuritySecret(config, 'JWT_SECRET');

    expect(first).toHaveLength(43);
    expect(second).toBe(first);
  });

  it('never creates a production fallback', () => {
    const config = new ConfigService({ NODE_ENV: 'production' });

    expect(() => resolveSecuritySecret(config, 'JWT_SECRET')).toThrow(
      'JWT_SECRET is required in production',
    );
  });

  it('never creates a fallback for alternate production markers', () => {
    const config = new ConfigService({
      NODE_ENV: 'development',
      APP_ENV: 'production',
    });

    expect(() => resolveSecuritySecret(config, 'JWT_SECRET')).toThrow(
      'JWT_SECRET is required in production',
    );
  });
});

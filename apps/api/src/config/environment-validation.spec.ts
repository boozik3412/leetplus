import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  DESIGN_PARTNER_REQUIRED_RUNTIME_SETTINGS,
  FOUNDER_OPERATOR_BETA_ACTIVATION_DATABASE_ROLE,
  LANGAME_DISCREPANCY_LOG_ROOT_KEY,
  PRODUCTION_SECRET_KEYS,
  resolveAccessScopeEnforcementMode,
  resolveSecuritySecret,
  resolveStaffAttachmentAclMode,
  validateEnvironment,
} from './environment-validation';

const VALID_IDENTITY_MAIL_ENCRYPTION_KEY = Buffer.from(
  Array.from({ length: 32 }, (_, index) => index + 1),
).toString('base64url');

function validProductionEnvironment() {
  return {
    NODE_ENV: 'production',
    JWT_SECRET: `jwt_${'a'.repeat(44)}`,
    GUEST_PORTAL_JWT_SECRET: `guest_jwt_${'b'.repeat(44)}`,
    GUEST_GAME_REFERRAL_SECRET: `referral_${'d'.repeat(44)}`,
    APP_ENCRYPTION_KEY: `pii_${'e'.repeat(44)}`,
    INTEGRATION_ENCRYPTION_KEY: `integration_${'f'.repeat(44)}`,
    IDENTITY_EMAIL_FINGERPRINT_HMAC_KEY: `identity_${'h'.repeat(44)}`,
    IDENTITY_EMAIL_FINGERPRINT_HMAC_KEY_VERSION: 'v1',
    IDENTITY_MAIL_ENCRYPTION_KEY: VALID_IDENTITY_MAIL_ENCRYPTION_KEY,
    IDENTITY_MAIL_ENCRYPTION_KEY_VERSION: 'v1',
    IDENTITY_MAIL_AAD_ENVIRONMENT: 'production',
    SYNC_SERVICE_TOKEN: `scheduler_${'g'.repeat(44)}`,
    RELEASE_SHA: 'a'.repeat(40),
    BUILD_TIME: '2026-07-26T15:00:00.000Z',
    EXPECTED_DATABASE_MIGRATION: '20260727090000_access_scope_expand',
    EXPECTED_DATABASE_MIGRATION_COUNT: '151',
    LANGAME_DISCREPANCY_LOG_ROOT: '/var/lib/leetplus/langame-sync',
    ACCESS_SCOPE_ENFORCEMENT_MODE: 'SHADOW',
    STAFF_ATTACHMENT_ACL_MODE: 'SHADOW',
  };
}

function documentedDesignPartnerOverlay(): Record<string, string> {
  const source = readFileSync(
    resolve(
      __dirname,
      '../../../../docs/open-beta/design-partner-runtime.env.example',
    ),
    'utf8',
  );

  const entries: Array<[string, string]> = source
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#'))
    .map((line): [string, string] => {
      const separator = line.indexOf('=');
      return [line.slice(0, separator), line.slice(separator + 1)];
    })
    .filter(
      ([key]) =>
        key !== 'DESIGN_PARTNER_TENANT_SLUG' &&
        key !== 'DESIGN_PARTNER_TENANT_DOMAIN',
    );

  return Object.fromEntries(entries);
}

describe('validateEnvironment', () => {
  it('keeps local and test configuration optional', () => {
    const local = { NODE_ENV: 'test' };

    expect(validateEnvironment(local)).toBe(local);
  });

  it.each(['disabled', 'PREPARE', 'active'])(
    'normalizes an explicit founder-operator beta mode: %s',
    (mode) => {
      expect(
        validateEnvironment({
          NODE_ENV: 'test',
          FOUNDER_OPERATOR_BETA_MODE: mode,
        }),
      ).toMatchObject({
        FOUNDER_OPERATOR_BETA_MODE: mode.toUpperCase(),
      });
    },
  );

  it('rejects an unknown founder-operator beta mode in every environment', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'test',
        FOUNDER_OPERATOR_BETA_MODE: 'BYPASS',
      }),
    ).toThrow(
      /FOUNDER_OPERATOR_BETA_MODE must be DISABLED, PREPARE, or ACTIVE/,
    );
  });

  it('requires an exact dedicated database URL for production ACTIVE mode', () => {
    const missing = {
      ...validProductionEnvironment(),
      FOUNDER_OPERATOR_BETA_MODE: 'ACTIVE',
    };
    expect(() => validateEnvironment(missing)).toThrow(
      /FOUNDER_OPERATOR_BETA_ACTIVATION_DATABASE_URL must use the dedicated activation role/,
    );

    const password = 'r'.repeat(40);
    const databaseUrl =
      `postgresql://${FOUNDER_OPERATOR_BETA_ACTIVATION_DATABASE_ROLE}:${password}` +
      '@db.example.test:5432/leetplus?schema=public&connection_limit=2&pool_timeout=5&connect_timeout=5&sslmode=verify-full';
    const active = {
      ...missing,
      DATABASE_URL:
        'postgresql://leetplus_api:primary-password@db.example.test:5432/leetplus',
      FOUNDER_OPERATOR_BETA_ACTIVATION_DATABASE_URL: databaseUrl,
    };
    expect(validateEnvironment(active)).toMatchObject({
      FOUNDER_OPERATOR_BETA_MODE: 'ACTIVE',
      FOUNDER_OPERATOR_BETA_ACTIVATION_DATABASE_URL: databaseUrl,
    });
  });

  it('rejects primary-pool reuse and unsafe activation connection options', () => {
    const password = 'r'.repeat(40);
    const databaseUrl =
      `postgresql://${FOUNDER_OPERATOR_BETA_ACTIVATION_DATABASE_ROLE}:${password}` +
      '@db.example.test:5432/leetplus?schema=public&connection_limit=2&pool_timeout=5&connect_timeout=5';
    expect(() =>
      validateEnvironment({
        ...validProductionEnvironment(),
        FOUNDER_OPERATOR_BETA_MODE: 'ACTIVE',
        DATABASE_URL: databaseUrl,
        FOUNDER_OPERATOR_BETA_ACTIVATION_DATABASE_URL: databaseUrl,
      }),
    ).toThrow(
      /DATABASE_URL must not use the dedicated founder activation role/,
    );
    expect(() =>
      validateEnvironment({
        ...validProductionEnvironment(),
        FOUNDER_OPERATOR_BETA_MODE: 'ACTIVE',
        DATABASE_URL:
          'postgresql://leetplus_api:primary-password@db.example.test:5432/leetplus',
        FOUNDER_OPERATOR_BETA_ACTIVATION_DATABASE_URL: `${databaseUrl}&application_name=api`,
      }),
    ).toThrow(/exact bounded connection options/);
    expect(() =>
      validateEnvironment({
        ...validProductionEnvironment(),
        FOUNDER_OPERATOR_BETA_MODE: 'ACTIVE',
        DATABASE_URL:
          'postgresql://leetplus_api:primary-password@db.example.test:5432/leetplus',
        FOUNDER_OPERATOR_BETA_ACTIVATION_DATABASE_URL: databaseUrl,
      }),
    ).toThrow(/sslmode=verify-full/);
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

  it('requires the supported identity fingerprint key version', () => {
    const missing = validProductionEnvironment();
    delete (missing as Partial<ReturnType<typeof validProductionEnvironment>>)
      .IDENTITY_EMAIL_FINGERPRINT_HMAC_KEY_VERSION;
    const unsupported = {
      ...validProductionEnvironment(),
      IDENTITY_EMAIL_FINGERPRINT_HMAC_KEY_VERSION: 'v2',
    };

    expect(() => validateEnvironment(missing)).toThrow(
      /IDENTITY_EMAIL_FINGERPRINT_HMAC_KEY_VERSION must equal v1/,
    );
    expect(() => validateEnvironment(unsupported)).toThrow(
      /IDENTITY_EMAIL_FINGERPRINT_HMAC_KEY_VERSION must equal v1/,
    );
  });

  it('requires the exact identity-mail key, version, and AAD environment', () => {
    const missingVersion = validProductionEnvironment();
    delete (
      missingVersion as Partial<ReturnType<typeof validProductionEnvironment>>
    ).IDENTITY_MAIL_ENCRYPTION_KEY_VERSION;
    const unsupportedVersion = {
      ...validProductionEnvironment(),
      IDENTITY_MAIL_ENCRYPTION_KEY_VERSION: 'v2',
    };
    const missingEnvironment = validProductionEnvironment();
    delete (
      missingEnvironment as Partial<
        ReturnType<typeof validProductionEnvironment>
      >
    ).IDENTITY_MAIL_AAD_ENVIRONMENT;
    const nonCanonicalEnvironment = {
      ...validProductionEnvironment(),
      IDENTITY_MAIL_AAD_ENVIRONMENT: ' Production ',
    };

    expect(() => validateEnvironment(missingVersion)).toThrow(
      /IDENTITY_MAIL_ENCRYPTION_KEY_VERSION must equal v1/,
    );
    expect(() => validateEnvironment(unsupportedVersion)).toThrow(
      /IDENTITY_MAIL_ENCRYPTION_KEY_VERSION must equal v1/,
    );
    expect(() => validateEnvironment(missingEnvironment)).toThrow(
      /IDENTITY_MAIL_AAD_ENVIRONMENT must be an exact lowercase environment identifier/,
    );
    expect(() => validateEnvironment(nonCanonicalEnvironment)).toThrow(
      /IDENTITY_MAIL_AAD_ENVIRONMENT must be an exact lowercase environment identifier/,
    );
  });

  it.each([
    ['missing', undefined],
    ['short', 'short'],
    ['padded', `${VALID_IDENTITY_MAIL_ENCRYPTION_KEY}=`],
    ['wrong decoded length', Buffer.alloc(31, 7).toString('base64url')],
    ['degenerate', Buffer.alloc(32).toString('base64url')],
  ])('rejects a %s identity-mail encryption key', (_case, key) => {
    const environment = validProductionEnvironment();
    (
      environment as Partial<ReturnType<typeof validProductionEnvironment>>
    ).IDENTITY_MAIL_ENCRYPTION_KEY = key;

    expect(() => validateEnvironment(environment)).toThrow(
      key
        ? /IDENTITY_MAIL_ENCRYPTION_KEY must be an exact unpadded base64url encoding of a non-degenerate 32-byte key/
        : /IDENTITY_MAIL_ENCRYPTION_KEY is required/,
    );
  });

  it.each([
    'JWT_SECRET',
    'GUEST_PORTAL_JWT_SECRET',
    'GUEST_GAME_REFERRAL_SECRET',
    'APP_ENCRYPTION_KEY',
    'INTEGRATION_ENCRYPTION_KEY',
    'IDENTITY_EMAIL_FINGERPRINT_HMAC_KEY',
    'SYNC_SERVICE_TOKEN',
  ] as const)(
    'rejects identity-mail key reuse with %s without disclosing the key',
    (reusedBoundary) => {
      const environment = validProductionEnvironment();
      environment[reusedBoundary] = environment.IDENTITY_MAIL_ENCRYPTION_KEY;
      let message = '';

      try {
        validateEnvironment(environment);
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }

      expect(message).toMatch(/must use independent values/);
      expect(message).not.toContain(VALID_IDENTITY_MAIL_ENCRYPTION_KEY);
    },
  );

  it('does not trim or disclose a non-canonical identity-mail key', () => {
    const environment = validProductionEnvironment();
    environment.IDENTITY_MAIL_ENCRYPTION_KEY = ` ${VALID_IDENTITY_MAIL_ENCRYPTION_KEY} `;
    let message = '';

    try {
      validateEnvironment(environment);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toMatch(
      /IDENTITY_MAIL_ENCRYPTION_KEY must be an exact unpadded base64url encoding/,
    );
    expect(message).not.toContain(VALID_IDENTITY_MAIL_ENCRYPTION_KEY);
  });

  it('requires exact release identity and schema revision in production', () => {
    const environment = validProductionEnvironment();
    environment.RELEASE_SHA = 'short-sha';
    environment.BUILD_TIME = 'today';
    environment.EXPECTED_DATABASE_MIGRATION = 'latest';
    environment.EXPECTED_DATABASE_MIGRATION_COUNT = '0';

    expect(() => validateEnvironment(environment)).toThrow(
      /RELEASE_SHA must be the full lowercase 40-character Git SHA/,
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

  it('requires a stable absolute Langame discrepancy-log root in production', () => {
    const valid = validProductionEnvironment();
    expect(validateEnvironment(valid)[LANGAME_DISCREPANCY_LOG_ROOT_KEY]).toBe(
      '/var/lib/leetplus/langame-sync',
    );

    for (const value of [
      undefined,
      'logs/langame-sync',
      '/',
      '/var/lib/../tmp/langame-sync',
      ' /var/lib/leetplus/langame-sync',
      'C:\\leetplus\\langame-sync',
    ]) {
      expect(() =>
        validateEnvironment({
          ...validProductionEnvironment(),
          LANGAME_DISCREPANCY_LOG_ROOT: value,
        }),
      ).toThrow(
        /LANGAME_DISCREPANCY_LOG_ROOT must be a non-root absolute POSIX path/,
      );
    }
  });

  it('rejects uppercase release identity in production', () => {
    const environment = validProductionEnvironment();
    environment.RELEASE_SHA = 'A'.repeat(40);

    expect(() => validateEnvironment(environment)).toThrow(
      /RELEASE_SHA must be the full lowercase 40-character Git SHA/,
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

  it('requires an explicit staff attachment ACL rollout mode in production', () => {
    const missing = validProductionEnvironment();
    delete (missing as Partial<ReturnType<typeof validProductionEnvironment>>)
      .STAFF_ATTACHMENT_ACL_MODE;
    const invalid = {
      ...validProductionEnvironment(),
      STAFF_ATTACHMENT_ACL_MODE: 'optional',
    };

    expect(() => validateEnvironment(missing)).toThrow(
      /STAFF_ATTACHMENT_ACL_MODE is required/,
    );
    expect(() => validateEnvironment(invalid)).toThrow(
      /STAFF_ATTACHMENT_ACL_MODE must be LEGACY, SHADOW, or ENFORCED/,
    );
  });

  it('requires the complete fail-closed overlay in isolated design-partner mode', () => {
    const missingOverlay = {
      ...validProductionEnvironment(),
      DESIGN_PARTNER_ISOLATED_MODE: 'true',
    };
    const validOverlay = {
      ...validProductionEnvironment(),
      ...DESIGN_PARTNER_REQUIRED_RUNTIME_SETTINGS,
      DESIGN_PARTNER_TENANT_SLUG: 'partner-club',
      DESIGN_PARTNER_TENANT_DOMAIN: 'partner-club.leetplus.ru',
    };

    expect(() => validateEnvironment(missingOverlay)).toThrow(
      /LANGAME_SCHEDULED_HTTP_ENABLED must equal false/,
    );
    expect(validateEnvironment(validOverlay).DESIGN_PARTNER_ISOLATED_MODE).toBe(
      'true',
    );
  });

  it('keeps the documented isolated overlay identical to startup policy', () => {
    expect(documentedDesignPartnerOverlay()).toEqual(
      DESIGN_PARTNER_REQUIRED_RUNTIME_SETTINGS,
    );
  });

  it('rejects the provisioning manifest HMAC key in isolated runtime', () => {
    expect(() =>
      validateEnvironment({
        ...validProductionEnvironment(),
        ...DESIGN_PARTNER_REQUIRED_RUNTIME_SETTINGS,
        DESIGN_PARTNER_TENANT_SLUG: 'partner-club',
        DESIGN_PARTNER_TENANT_DOMAIN: 'partner-club.leetplus.ru',
        DESIGN_PARTNER_MANIFEST_HMAC_KEY: `provisioning_${'h'.repeat(40)}`,
      }),
    ).toThrow(
      /DESIGN_PARTNER_MANIFEST_HMAC_KEY must be absent from design-partner runtime/,
    );
  });

  it('binds isolated runtime to one exact tenant slug and domain', () => {
    const valid = {
      ...validProductionEnvironment(),
      ...DESIGN_PARTNER_REQUIRED_RUNTIME_SETTINGS,
      DESIGN_PARTNER_TENANT_SLUG: 'partner-club',
      DESIGN_PARTNER_TENANT_DOMAIN: 'partner-club.leetplus.ru',
    };

    expect(() =>
      validateEnvironment({
        ...valid,
        DESIGN_PARTNER_TENANT_DOMAIN: 'another-club.leetplus.ru',
      }),
    ).toThrow(/must equal <tenant-slug>\.leetplus\.ru/);
    expect(validateEnvironment(valid).DESIGN_PARTNER_TENANT_SLUG).toBe(
      'partner-club',
    );
  });

  it('cannot bypass production validation by using isolated mode in development', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'development',
        ...DESIGN_PARTNER_REQUIRED_RUNTIME_SETTINGS,
      }),
    ).toThrow(/JWT_SECRET is required/);
  });

  it('rejects an ambiguous design-partner mode value', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'development',
        DESIGN_PARTNER_ISOLATED_MODE: 'TRUE',
      }),
    ).toThrow(/must be exactly true or false/);
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

describe('resolveStaffAttachmentAclMode', () => {
  it('defaults to fail-closed enforcement outside a rollout override', () => {
    expect(resolveStaffAttachmentAclMode(undefined)).toBe('ENFORCED');
    expect(resolveStaffAttachmentAclMode(' enforced ')).toBe('ENFORCED');
    expect(resolveStaffAttachmentAclMode('legacy')).toBe('LEGACY');
    expect(resolveStaffAttachmentAclMode('shadow')).toBe('SHADOW');
  });

  it('rejects unknown modes', () => {
    expect(() => resolveStaffAttachmentAclMode('optional')).toThrow(
      /must be LEGACY, SHADOW, or ENFORCED/,
    );
  });
});

describe('resolveSecuritySecret', () => {
  it('cannot create or reuse a fallback for the identity-mail key', () => {
    const config = new ConfigService({
      NODE_ENV: 'test',
      APP_ENCRYPTION_KEY: VALID_IDENTITY_MAIL_ENCRYPTION_KEY,
    });

    expect(() =>
      resolveSecuritySecret(config, 'IDENTITY_MAIL_ENCRYPTION_KEY' as never, [
        'APP_ENCRYPTION_KEY',
      ]),
    ).toThrow(
      'IDENTITY_MAIL_ENCRYPTION_KEY cannot use a fallback secret resolver',
    );
  });

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

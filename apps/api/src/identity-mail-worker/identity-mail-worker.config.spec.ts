import { IDENTITY_MAIL_INDEPENDENT_SECRET_KEYS } from '../auth/identity-mail-independent-secret-keys';
import {
  createIdentityMailWorkerSecretOpener,
  runIdentityMailWorker,
} from './identity-mail-worker.cli';
import {
  IdentityMailWorkerConfigurationError,
  loadIdentityMailWorkerConfig,
} from './identity-mail-worker.config';
import type { IdentityMailWorkerEnvironment } from './identity-mail-worker.types';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const MAXIMUM_CANARY_TENANT_IDS = [
  TENANT_ID,
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
] as const;
const FIFTH_TENANT_ID = '55555555-5555-4555-8555-555555555555';
const ENCRYPTION_KEY = Buffer.from(
  Array.from({ length: 32 }, (_, index) => index + 1),
).toString('base64url');
const DATABASE_URL_OPTIONS =
  'schema=public&sslmode=require&sslaccept=strict&connect_timeout=5&socket_timeout=30';

function databaseUrlWithPassword(encodedPassword: string): string {
  return `postgresql://leetplus_identity_mail_worker:${encodedPassword}@db.example.test:5432/leetplus_beta?${DATABASE_URL_OPTIONS}`;
}

function enabledEnvironment(): IdentityMailWorkerEnvironment {
  return {
    IDENTITY_MAIL_WORKER_ENABLED: 'true',
    IDENTITY_MAIL_WORKER_REAL_SEND_ENABLED: 'true',
    IDENTITY_MAIL_WORKER_LIVE_CANARY_ENABLED: 'true',
    IDENTITY_MAIL_WORKER_DATABASE_URL:
      'postgresql://leetplus_identity_mail_worker:database-password@db.example.test:5432/leetplus_beta?schema=public&sslmode=require&sslaccept=strict&connect_timeout=5&socket_timeout=30',
    IDENTITY_MAIL_WORKER_EXPECTED_DATABASE: 'leetplus_beta',
    IDENTITY_MAIL_WORKER_EXPECTED_ROLE: 'leetplus_identity_mail_worker',
    IDENTITY_MAIL_WORKER_EXPECTED_MIGRATION:
      '20260804120000_guest_game_max_pending_rewards',
    IDENTITY_MAIL_WORKER_EXPECTED_MIGRATION_COUNT: '180',
    IDENTITY_MAIL_WORKER_RELEASE_SHA: 'a'.repeat(40),
    IDENTITY_MAIL_WORKER_CANARY_TENANT_IDS: TENANT_ID,
    IDENTITY_MAIL_PUBLIC_WEB_ORIGIN: 'https://leetplus.ru',
    IDENTITY_MAIL_ENCRYPTION_KEY: ENCRYPTION_KEY,
    IDENTITY_MAIL_ENCRYPTION_KEY_VERSION: 'v1',
    IDENTITY_MAIL_AAD_ENVIRONMENT: 'production',
    IDENTITY_MAIL_WORKER_POLL_INTERVAL_MS: '5000',
    IDENTITY_MAIL_WORKER_LEASE_MS: '120000',
    IDENTITY_MAIL_WORKER_BATCH_SIZE: '1',
    IDENTITY_MAIL_WORKER_MAX_ATTEMPTS: '5',
    IDENTITY_MAIL_WORKER_BASE_RETRY_MS: '60000',
    IDENTITY_MAIL_WORKER_MAX_RETRY_MS: '3600000',
    IDENTITY_MAIL_SMTP_HOST: 'smtp.example.test',
    IDENTITY_MAIL_SMTP_PORT: '587',
    IDENTITY_MAIL_SMTP_TLS_MODE: 'STARTTLS',
    IDENTITY_MAIL_SMTP_SERVERNAME: 'smtp.example.test',
    IDENTITY_MAIL_SMTP_USERNAME: 'smtp-user',
    IDENTITY_MAIL_SMTP_PASSWORD: 'smtp-password',
    IDENTITY_MAIL_SMTP_FROM: 'no-reply@leetplus.ru',
    IDENTITY_MAIL_SMTP_MESSAGE_ID_DOMAIN: 'mail.leetplus.ru',
    IDENTITY_MAIL_WORKER_HEALTH_HOST: '127.0.0.1',
    IDENTITY_MAIL_WORKER_HEALTH_PORT: '4301',
    IDENTITY_MAIL_SMTP_CONNECTION_TIMEOUT_MS: '10000',
    IDENTITY_MAIL_SMTP_GREETING_TIMEOUT_MS: '10000',
    IDENTITY_MAIL_SMTP_SOCKET_TIMEOUT_MS: '30000',
  };
}

describe('loadIdentityMailWorkerConfig', () => {
  it('is disabled by default without reading generic fallback variables', () => {
    expect(
      loadIdentityMailWorkerConfig({
        DATABASE_URL: 'postgresql://wrong:wrong@example.test/wrong',
        MAIL_HOST: 'insecure.example.test',
        WEB_URL: 'http://example.test',
      }),
    ).toEqual({
      enabled: false,
      realSendEnabled: false,
      liveCanaryEnabled: false,
    });
  });

  it('requires all three exact live-send switches', () => {
    const environment = enabledEnvironment();
    environment.IDENTITY_MAIL_WORKER_LIVE_CANARY_ENABLED = 'false';

    expectConfigurationReason(
      environment,
      'IDENTITY_MAIL_WORKER_LIVE_SEND_NOT_EXPLICITLY_ENABLED',
    );
  });

  it('loads one fully explicit strict configuration', () => {
    const config = loadIdentityMailWorkerConfig(enabledEnvironment());
    expect(config).toMatchObject({
      enabled: true,
      databaseTlsRequired: true,
      databaseConnectTimeoutSeconds: 5,
      databaseSocketTimeoutSeconds: 30,
      expectedDatabase: 'leetplus_beta',
      expectedRole: 'leetplus_identity_mail_worker',
      canaryTenantIds: [TENANT_ID],
      publicWebOrigin: 'https://leetplus.ru',
      smtp: {
        host: 'smtp.example.test',
        tlsMode: 'STARTTLS',
        servername: 'smtp.example.test',
      },
    });
    expect(Object.isFrozen(config)).toBe(true);
    if (!config.enabled) {
      throw new Error(
        'enabled fixture unexpectedly returned a disabled config',
      );
    }
    expect(Object.isFrozen(config.canaryTenantIds)).toBe(true);
    expect(Object.isFrozen(config.smtp)).toBe(true);
  });

  it('returns canary tenants in canonical order', () => {
    const config = loadIdentityMailWorkerConfig({
      ...enabledEnvironment(),
      IDENTITY_MAIL_WORKER_CANARY_TENANT_IDS: [
        MAXIMUM_CANARY_TENANT_IDS[3],
        MAXIMUM_CANARY_TENANT_IDS[1],
        MAXIMUM_CANARY_TENANT_IDS[0],
        MAXIMUM_CANARY_TENANT_IDS[2],
      ].join(','),
    });
    expect(config).toMatchObject({
      enabled: true,
      canaryTenantIds: MAXIMUM_CANARY_TENANT_IDS,
    });
  });

  it('accepts at most four exact unique canary tenants', () => {
    const config = loadIdentityMailWorkerConfig({
      ...enabledEnvironment(),
      IDENTITY_MAIL_WORKER_CANARY_TENANT_IDS:
        MAXIMUM_CANARY_TENANT_IDS.join(','),
    });
    expect(config).toMatchObject({
      enabled: true,
      canaryTenantIds: MAXIMUM_CANARY_TENANT_IDS,
    });
  });

  it('allows plaintext PostgreSQL only on exact numeric loopback hosts', () => {
    for (const databaseUrl of [
      'postgresql://leetplus_identity_mail_worker:database-password@127.0.0.1:5432/leetplus_beta?schema=public&connect_timeout=5&socket_timeout=30',
      'postgresql://leetplus_identity_mail_worker:database-password@[::1]:5432/leetplus_beta?schema=public&connect_timeout=5&socket_timeout=30',
    ]) {
      const config = loadIdentityMailWorkerConfig({
        ...enabledEnvironment(),
        IDENTITY_MAIL_WORKER_DATABASE_URL: databaseUrl,
      });
      expect(config).toMatchObject({
        enabled: true,
        databaseUrl,
        databaseTlsRequired: false,
        databaseConnectTimeoutSeconds: 5,
        databaseSocketTimeoutSeconds: 30,
      });
    }
  });

  it('allows a remote PostgreSQL endpoint only with the exact strict TLS query', () => {
    const databaseUrl =
      'postgresql://leetplus_identity_mail_worker:database-password@db.example.test:5432/leetplus_beta?schema=public&sslmode=require&sslaccept=strict&connect_timeout=5&socket_timeout=30';
    const config = loadIdentityMailWorkerConfig({
      ...enabledEnvironment(),
      IDENTITY_MAIL_WORKER_DATABASE_URL: databaseUrl,
    });
    expect(config).toMatchObject({
      enabled: true,
      databaseUrl,
      databaseTlsRequired: true,
      databaseConnectTimeoutSeconds: 5,
      databaseSocketTimeoutSeconds: 30,
    });
  });

  it.each([
    [
      'canonical mail key text reused by SMTP',
      {
        IDENTITY_MAIL_SMTP_PASSWORD: ENCRYPTION_KEY,
      },
    ],
    [
      'canonical mail key text reused by a percent-encoded DB password',
      {
        IDENTITY_MAIL_WORKER_DATABASE_URL: databaseUrlWithPassword(
          `%41${ENCRYPTION_KEY.slice(1)}`,
        ),
      },
    ],
    [
      'decoded mail key bytes reused by SMTP',
      (() => {
        const decodedKeyText = '0123456789abcdefghijklmnopqrstuv';
        return {
          IDENTITY_MAIL_ENCRYPTION_KEY:
            Buffer.from(decodedKeyText).toString('base64url'),
          IDENTITY_MAIL_SMTP_PASSWORD: decodedKeyText,
        };
      })(),
    ],
    [
      'percent-decoded DB password reused by SMTP',
      {
        IDENTITY_MAIL_WORKER_DATABASE_URL:
          databaseUrlWithPassword('smtp%2Dpassword'),
        IDENTITY_MAIL_SMTP_PASSWORD: 'smtp-password',
      },
    ],
  ])('rejects secret-domain collision: %s', (_case, override) => {
    expectConfigurationReason(
      { ...enabledEnvironment(), ...override },
      'IDENTITY_MAIL_WORKER_SECRET_DOMAIN_COLLISION',
    );
  });

  it.each(
    IDENTITY_MAIL_INDEPENDENT_SECRET_KEYS.flatMap(
      (independentSecretKey) =>
        [
          [independentSecretKey, 'mail', ENCRYPTION_KEY],
          [independentSecretKey, 'database', 'database-password'],
          [independentSecretKey, 'smtp', 'smtp-password'],
        ] as const,
    ),
  )(
    'rejects global secret collision for %s against %s credentials',
    (independentSecretKey, _credential, reusedValue) => {
      expectConfigurationReason(
        {
          ...enabledEnvironment(),
          [independentSecretKey]: reusedValue,
        },
        'IDENTITY_MAIL_WORKER_SECRET_DOMAIN_COLLISION',
      );
    },
  );

  it.each([
    ['base retry upper boundary', '3600000', '3600000'],
    ['max retry upper boundary', '3600000', '86400000'],
  ])('accepts the exact %s', (_case, baseRetryMs, maxRetryMs) => {
    const config = loadIdentityMailWorkerConfig({
      ...enabledEnvironment(),
      IDENTITY_MAIL_WORKER_BASE_RETRY_MS: baseRetryMs,
      IDENTITY_MAIL_WORKER_MAX_RETRY_MS: maxRetryMs,
    });
    expect(config).toMatchObject({
      enabled: true,
      baseRetryMs: Number(baseRetryMs),
      maxRetryMs: Number(maxRetryMs),
    });
  });

  it.each([
    [
      'base retry above one hour',
      { IDENTITY_MAIL_WORKER_BASE_RETRY_MS: '3600001' },
      'IDENTITY_MAIL_WORKER_BASE_RETRY_MS_INVALID',
    ],
    [
      'max retry above one day',
      { IDENTITY_MAIL_WORKER_MAX_RETRY_MS: '86400001' },
      'IDENTITY_MAIL_WORKER_MAX_RETRY_MS_INVALID',
    ],
    [
      'max retry below base retry',
      {
        IDENTITY_MAIL_WORKER_BASE_RETRY_MS: '3600000',
        IDENTITY_MAIL_WORKER_MAX_RETRY_MS: '3599999',
      },
      'IDENTITY_MAIL_WORKER_RETRY_WINDOW_INVALID',
    ],
  ])('rejects %s', (_case, override, reasonCode) => {
    expectConfigurationReason(
      { ...enabledEnvironment(), ...override },
      reasonCode,
    );
  });

  it('rejects a nine-second aggregate SMTP acknowledgement window', () => {
    expectConfigurationReason(
      {
        ...enabledEnvironment(),
        IDENTITY_MAIL_SMTP_CONNECTION_TIMEOUT_MS: '3000',
        IDENTITY_MAIL_SMTP_GREETING_TIMEOUT_MS: '3000',
        IDENTITY_MAIL_SMTP_SOCKET_TIMEOUT_MS: '3000',
      },
      'IDENTITY_MAIL_SMTP_ACKNOWLEDGE_WINDOW_INVALID',
    );
  });

  it('accepts a ten-second aggregate SMTP acknowledgement window', () => {
    const config = loadIdentityMailWorkerConfig({
      ...enabledEnvironment(),
      IDENTITY_MAIL_SMTP_CONNECTION_TIMEOUT_MS: '3000',
      IDENTITY_MAIL_SMTP_GREETING_TIMEOUT_MS: '3000',
      IDENTITY_MAIL_SMTP_SOCKET_TIMEOUT_MS: '4000',
    });
    expect(config).toMatchObject({
      enabled: true,
      smtp: {
        connectionTimeoutMs: 3_000,
        greetingTimeoutMs: 3_000,
        socketTimeoutMs: 4_000,
      },
    });
  });

  it.each([
    [
      'generic database identity',
      {
        IDENTITY_MAIL_WORKER_DATABASE_URL:
          'postgresql://another_role:password@db.example.test:5432/leetplus_beta?schema=public&sslmode=require&sslaccept=strict&connect_timeout=5&socket_timeout=30',
      },
      'IDENTITY_MAIL_WORKER_DATABASE_IDENTITY_MISMATCH',
    ],
    [
      'malformed database URL percent encoding',
      {
        IDENTITY_MAIL_WORKER_DATABASE_URL:
          'postgresql://leetplus_identity_mail_worker%ZZ:password@db.example.test:5432/leetplus_beta?schema=public&sslmode=require&sslaccept=strict&connect_timeout=5&socket_timeout=30',
      },
      'IDENTITY_MAIL_WORKER_DATABASE_URL_INVALID',
    ],
    [
      'database URL options',
      {
        IDENTITY_MAIL_WORKER_DATABASE_URL:
          'postgresql://leetplus_identity_mail_worker:password@db.example.test:5432/leetplus_beta?schema=public&sslmode=require&sslaccept=strict&connect_timeout=5&socket_timeout=30&options=-c%20search_path%3Devil',
      },
      'IDENTITY_MAIL_WORKER_DATABASE_URL_OPTIONS_INVALID',
    ],
    [
      'remote database without TLS',
      {
        IDENTITY_MAIL_WORKER_DATABASE_URL:
          'postgresql://leetplus_identity_mail_worker:password@db.example.test:5432/leetplus_beta?schema=public&connect_timeout=5&socket_timeout=30',
      },
      'IDENTITY_MAIL_WORKER_DATABASE_URL_OPTIONS_INVALID',
    ],
    [
      'non-canonical shorthand loopback',
      {
        IDENTITY_MAIL_WORKER_DATABASE_URL:
          'postgresql://leetplus_identity_mail_worker:password@127.1:5432/leetplus_beta?schema=public&connect_timeout=5&socket_timeout=30',
      },
      'IDENTITY_MAIL_WORKER_DATABASE_URL_OPTIONS_INVALID',
    ],
    [
      'remote database without strict certificate acceptance',
      {
        IDENTITY_MAIL_WORKER_DATABASE_URL:
          'postgresql://leetplus_identity_mail_worker:password@db.example.test:5432/leetplus_beta?schema=public&sslmode=require&connect_timeout=5&socket_timeout=30',
      },
      'IDENTITY_MAIL_WORKER_DATABASE_URL_OPTIONS_INVALID',
    ],
    [
      'unsupported verify-full TLS mode',
      {
        IDENTITY_MAIL_WORKER_DATABASE_URL:
          'postgresql://leetplus_identity_mail_worker:password@db.example.test:5432/leetplus_beta?schema=public&sslmode=verify-full&sslaccept=strict&connect_timeout=5&socket_timeout=30',
      },
      'IDENTITY_MAIL_WORKER_DATABASE_URL_OPTIONS_INVALID',
    ],
    [
      'permissive prefer TLS mode',
      {
        IDENTITY_MAIL_WORKER_DATABASE_URL:
          'postgresql://leetplus_identity_mail_worker:password@db.example.test:5432/leetplus_beta?schema=public&sslmode=prefer&sslaccept=strict&connect_timeout=5&socket_timeout=30',
      },
      'IDENTITY_MAIL_WORKER_DATABASE_URL_OPTIONS_INVALID',
    ],
    [
      'disabled remote TLS mode',
      {
        IDENTITY_MAIL_WORKER_DATABASE_URL:
          'postgresql://leetplus_identity_mail_worker:password@db.example.test:5432/leetplus_beta?schema=public&sslmode=disable&sslaccept=strict&connect_timeout=5&socket_timeout=30',
      },
      'IDENTITY_MAIL_WORKER_DATABASE_URL_OPTIONS_INVALID',
    ],
    [
      'permissive TLS certificate acceptance',
      {
        IDENTITY_MAIL_WORKER_DATABASE_URL:
          'postgresql://leetplus_identity_mail_worker:password@db.example.test:5432/leetplus_beta?schema=public&sslmode=require&sslaccept=accept_invalid_certs&connect_timeout=5&socket_timeout=30',
      },
      'IDENTITY_MAIL_WORKER_DATABASE_URL_OPTIONS_INVALID',
    ],
    [
      'non-canonical remote query order',
      {
        IDENTITY_MAIL_WORKER_DATABASE_URL:
          'postgresql://leetplus_identity_mail_worker:password@db.example.test:5432/leetplus_beta?sslmode=require&sslaccept=strict&schema=public&connect_timeout=5&socket_timeout=30',
      },
      'IDENTITY_MAIL_WORKER_DATABASE_URL_OPTIONS_INVALID',
    ],
    [
      'duplicate database option',
      {
        IDENTITY_MAIL_WORKER_DATABASE_URL:
          'postgresql://leetplus_identity_mail_worker:password@db.example.test:5432/leetplus_beta?schema=public&schema=public&sslmode=require&sslaccept=strict&connect_timeout=5&socket_timeout=30',
      },
      'IDENTITY_MAIL_WORKER_DATABASE_URL_OPTIONS_INVALID',
    ],
    [
      'duplicate database TLS mode',
      {
        IDENTITY_MAIL_WORKER_DATABASE_URL:
          'postgresql://leetplus_identity_mail_worker:password@db.example.test:5432/leetplus_beta?schema=public&sslmode=require&sslmode=require&sslaccept=strict&connect_timeout=5&socket_timeout=30',
      },
      'IDENTITY_MAIL_WORKER_DATABASE_URL_OPTIONS_INVALID',
    ],
    [
      'missing database connect timeout',
      {
        IDENTITY_MAIL_WORKER_DATABASE_URL:
          'postgresql://leetplus_identity_mail_worker:password@db.example.test:5432/leetplus_beta?schema=public&sslmode=require&sslaccept=strict&socket_timeout=30',
      },
      'IDENTITY_MAIL_WORKER_DATABASE_URL_OPTIONS_INVALID',
    ],
    [
      'wrong database connect timeout',
      {
        IDENTITY_MAIL_WORKER_DATABASE_URL:
          'postgresql://leetplus_identity_mail_worker:password@db.example.test:5432/leetplus_beta?schema=public&sslmode=require&sslaccept=strict&connect_timeout=6&socket_timeout=30',
      },
      'IDENTITY_MAIL_WORKER_DATABASE_URL_OPTIONS_INVALID',
    ],
    [
      'missing database socket timeout',
      {
        IDENTITY_MAIL_WORKER_DATABASE_URL:
          'postgresql://leetplus_identity_mail_worker:password@db.example.test:5432/leetplus_beta?schema=public&sslmode=require&sslaccept=strict&connect_timeout=5',
      },
      'IDENTITY_MAIL_WORKER_DATABASE_URL_OPTIONS_INVALID',
    ],
    [
      'wrong database socket timeout',
      {
        IDENTITY_MAIL_WORKER_DATABASE_URL:
          'postgresql://leetplus_identity_mail_worker:password@db.example.test:5432/leetplus_beta?schema=public&sslmode=require&sslaccept=strict&connect_timeout=5&socket_timeout=31',
      },
      'IDENTITY_MAIL_WORKER_DATABASE_URL_OPTIONS_INVALID',
    ],
    [
      'duplicate database timeout',
      {
        IDENTITY_MAIL_WORKER_DATABASE_URL:
          'postgresql://leetplus_identity_mail_worker:password@db.example.test:5432/leetplus_beta?schema=public&sslmode=require&sslaccept=strict&connect_timeout=5&connect_timeout=5&socket_timeout=30',
      },
      'IDENTITY_MAIL_WORKER_DATABASE_URL_OPTIONS_INVALID',
    ],
    [
      'remote TLS options on numeric loopback',
      {
        IDENTITY_MAIL_WORKER_DATABASE_URL:
          'postgresql://leetplus_identity_mail_worker:password@127.0.0.1:5432/leetplus_beta?schema=public&sslmode=require&sslaccept=strict&connect_timeout=5&socket_timeout=30',
      },
      'IDENTITY_MAIL_WORKER_DATABASE_URL_OPTIONS_INVALID',
    ],
    [
      'HTTP public origin',
      { IDENTITY_MAIL_PUBLIC_WEB_ORIGIN: 'http://leetplus.ru' },
      'IDENTITY_MAIL_PUBLIC_WEB_ORIGIN_INVALID',
    ],
    [
      'foreign HTTPS public origin',
      { IDENTITY_MAIL_PUBLIC_WEB_ORIGIN: 'https://attacker.example' },
      'IDENTITY_MAIL_PUBLIC_WEB_ORIGIN_INVALID',
    ],
    [
      'public origin trailing slash',
      { IDENTITY_MAIL_PUBLIC_WEB_ORIGIN: 'https://leetplus.ru/' },
      'IDENTITY_MAIL_PUBLIC_WEB_ORIGIN_INVALID',
    ],
    [
      'public origin port',
      { IDENTITY_MAIL_PUBLIC_WEB_ORIGIN: 'https://leetplus.ru:444' },
      'IDENTITY_MAIL_PUBLIC_WEB_ORIGIN_INVALID',
    ],
    [
      'public origin path',
      { IDENTITY_MAIL_PUBLIC_WEB_ORIGIN: 'https://leetplus.ru/register' },
      'IDENTITY_MAIL_PUBLIC_WEB_ORIGIN_INVALID',
    ],
    [
      'public origin query',
      { IDENTITY_MAIL_PUBLIC_WEB_ORIGIN: 'https://leetplus.ru?source=mail' },
      'IDENTITY_MAIL_PUBLIC_WEB_ORIGIN_INVALID',
    ],
    [
      'public origin fragment',
      { IDENTITY_MAIL_PUBLIC_WEB_ORIGIN: 'https://leetplus.ru#invite=wrong' },
      'IDENTITY_MAIL_PUBLIC_WEB_ORIGIN_INVALID',
    ],
    [
      'public origin credentials',
      { IDENTITY_MAIL_PUBLIC_WEB_ORIGIN: 'https://user:pass@leetplus.ru' },
      'IDENTITY_MAIL_PUBLIC_WEB_ORIGIN_INVALID',
    ],
    [
      'SMTP downgrade',
      { IDENTITY_MAIL_SMTP_TLS_MODE: 'OPTIONAL' },
      'IDENTITY_MAIL_SMTP_TLS_MODE_INVALID',
    ],
    [
      'loopback SMTP',
      { IDENTITY_MAIL_SMTP_HOST: 'smtp.localhost' },
      'IDENTITY_MAIL_SMTP_HOST_INVALID',
    ],
    [
      'uppercase SMTP FROM',
      { IDENTITY_MAIL_SMTP_FROM: 'No-Reply@leetplus.ru' },
      'IDENTITY_MAIL_SMTP_FROM_INVALID',
    ],
    [
      'leading-dot SMTP FROM',
      { IDENTITY_MAIL_SMTP_FROM: '.no-reply@leetplus.ru' },
      'IDENTITY_MAIL_SMTP_FROM_INVALID',
    ],
    [
      'consecutive-dot SMTP FROM',
      { IDENTITY_MAIL_SMTP_FROM: 'no..reply@leetplus.ru' },
      'IDENTITY_MAIL_SMTP_FROM_INVALID',
    ],
    [
      'duplicate canary',
      {
        IDENTITY_MAIL_WORKER_CANARY_TENANT_IDS: `${TENANT_ID},${TENANT_ID}`,
      },
      'IDENTITY_MAIL_WORKER_CANARY_TENANT_IDS_DUPLICATE',
    ],
    [
      'more than four canary tenants',
      {
        IDENTITY_MAIL_WORKER_CANARY_TENANT_IDS: [
          ...MAXIMUM_CANARY_TENANT_IDS,
          FIFTH_TENANT_ID,
        ].join(','),
      },
      'IDENTITY_MAIL_WORKER_CANARY_TENANT_IDS_INVALID',
    ],
  ])('rejects %s fail-closed', (_case, override, reasonCode) => {
    expectConfigurationReason(
      {
        ...enabledEnvironment(),
        ...override,
      },
      reasonCode,
    );
  });

  it('does not include configured secrets in errors', () => {
    const environment = enabledEnvironment();
    const secret = environment.IDENTITY_MAIL_SMTP_PASSWORD as string;
    environment.IDENTITY_MAIL_SMTP_TLS_MODE = 'invalid';

    try {
      loadIdentityMailWorkerConfig(environment);
      throw new Error('Expected configuration to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(IdentityMailWorkerConfigurationError);
      expect(String(error)).not.toContain(secret);
      expect((error as Error).stack).not.toContain(secret);
    }
  });

  it('does not identify or disclose colliding secret domains', () => {
    const sharedCredential = 'shared-database-smtp-credential';
    const environment = {
      ...enabledEnvironment(),
      IDENTITY_MAIL_WORKER_DATABASE_URL:
        databaseUrlWithPassword(sharedCredential),
      IDENTITY_MAIL_SMTP_PASSWORD: sharedCredential,
    };
    let serialized = '';

    try {
      loadIdentityMailWorkerConfig(environment);
      throw new Error('Expected configuration to fail');
    } catch (error) {
      serialized = `${String(error)}\n${
        error instanceof Error ? error.stack : ''
      }`;
    }

    expect(serialized).toContain(
      'IDENTITY_MAIL_WORKER_SECRET_DOMAIN_COLLISION',
    );
    expect(serialized).not.toContain(sharedCredential);
    expect(serialized).not.toContain(ENCRYPTION_KEY);
    for (const key of IDENTITY_MAIL_INDEPENDENT_SECRET_KEYS) {
      expect(serialized).not.toContain(key);
    }
  });

  it('isolates a supplied custom environment from global process.env fallback', () => {
    const previousGlobalSecret = process.env.APP_ENCRYPTION_KEY;
    process.env.APP_ENCRYPTION_KEY = ENCRYPTION_KEY;

    try {
      const customEnvironment = enabledEnvironment();
      const config = loadIdentityMailWorkerConfig(customEnvironment);
      if (!config.enabled) {
        throw new Error('Expected an enabled worker configuration');
      }

      expect(() =>
        createIdentityMailWorkerSecretOpener(config, customEnvironment),
      ).not.toThrow();
    } finally {
      if (previousGlobalSecret === undefined) {
        delete process.env.APP_ENCRYPTION_KEY;
      } else {
        process.env.APP_ENCRYPTION_KEY = previousGlobalSecret;
      }
    }
  });

  it.each(IDENTITY_MAIL_INDEPENDENT_SECRET_KEYS)(
    'rejects standalone startup before external resources when %s reuses the mail key',
    async (independentSecretKey) => {
      const environment = {
        ...enabledEnvironment(),
        [independentSecretKey]: ENCRYPTION_KEY,
      };
      const log = jest
        .spyOn(console, 'log')
        .mockImplementation(() => undefined);
      const warn = jest
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);
      const errorLog = jest
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      let rejection: unknown;
      let loggedCalls: unknown[][] = [];

      try {
        await runIdentityMailWorker(environment);
      } catch (error) {
        rejection = error;
      } finally {
        loggedCalls = [
          ...log.mock.calls,
          ...warn.mock.calls,
          ...errorLog.mock.calls,
        ];
        log.mockRestore();
        warn.mockRestore();
        errorLog.mockRestore();
      }

      expect(rejection).toBeDefined();
      const serialized = `${String(rejection)}\n${
        rejection instanceof Error ? rejection.stack : ''
      }`;
      expect(serialized).toContain(
        'IDENTITY_MAIL_WORKER_SECRET_DOMAIN_COLLISION',
      );
      expect(serialized).not.toContain(ENCRYPTION_KEY);
      expect(serialized).not.toContain(independentSecretKey);
      expect(loggedCalls).toEqual([]);
    },
  );
});

function expectConfigurationReason(
  environment: IdentityMailWorkerEnvironment,
  reasonCode: string,
): void {
  try {
    loadIdentityMailWorkerConfig(environment);
    throw new Error('Expected configuration to fail');
  } catch (error) {
    expect(error).toBeInstanceOf(IdentityMailWorkerConfigurationError);
    expect((error as IdentityMailWorkerConfigurationError).reasonCode).toBe(
      reasonCode,
    );
  }
}

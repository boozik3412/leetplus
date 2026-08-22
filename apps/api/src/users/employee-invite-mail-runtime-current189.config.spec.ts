import type { EmployeeInviteMailProviderCurrent189Config } from './employee-invite-mail-provider-current189';
import {
  EMPLOYEE_INVITE_MAIL_RUNTIME_CURRENT189_CANDIDATE,
  deriveEmployeeInviteMailProviderAuthorityDigestCurrent189,
  loadEmployeeInviteMailRuntimeCurrent189Config,
  type EmployeeInviteMailRuntimeCurrent189Environment,
} from './employee-invite-mail-runtime-current189.config';

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const EMPLOYEE_KEY = Buffer.from(
  Array.from({ length: 32 }, (_, index) => index + 1),
).toString('base64url');
const INITIAL_OWNER_KEY = Buffer.from(
  Array.from({ length: 32 }, (_, index) => index + 65),
).toString('base64url');

describe('loadEmployeeInviteMailRuntimeCurrent189Config', () => {
  it('is disabled by default and rejects partial activation', () => {
    expect(loadEmployeeInviteMailRuntimeCurrent189Config({})).toEqual({
      enabled: false,
      rehearsalEnabled: false,
      realProviderEnabled: false,
    });
    expect(() =>
      loadEmployeeInviteMailRuntimeCurrent189Config({
        IDENTITY_EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_ENABLED: 'false',
        IDENTITY_EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_REHEARSAL_ENABLED:
          'true',
      }),
    ).toThrow('EMPLOYEE_INVITE_MAIL_RUNTIME_DISABLED_FLAGS_CONFLICT');
  });

  it('parses and freezes the exact isolated CURRENT189 rehearsal contract', () => {
    const environment = enabledEnvironment();
    const config = loadEmployeeInviteMailRuntimeCurrent189Config(environment);

    expect(config.enabled).toBe(true);
    if (!config.enabled) throw new Error('enabled config expected');
    expect(config).toMatchObject({
      production: false,
      candidateStatus: 'NOT_DEPLOYABLE',
      expectedCandidate: EMPLOYEE_INVITE_MAIL_RUNTIME_CURRENT189_CANDIDATE,
      releaseSha: 'a'.repeat(40),
      expectedDatabase: 'leetplus_beta',
      expectedRole: 'leetplus_employee_mail_worker_current189',
      databaseTlsRequired: true,
      envelopeKeyBase64url: EMPLOYEE_KEY,
      envelopeKeyVersion: 'v1',
      aadEnvironment: 'isolated_test',
      pollIntervalMs: 25,
      maxCycles: 2,
      healthHost: '127.0.0.1',
      healthPort: 4201,
    });
    expect(config.providerAuthorityDigest).toMatch(/^[0-9a-f]{64}$/u);
    expect(config.worker).toMatchObject({
      enabled: true,
      realProviderEnabled: true,
      production: false,
      tenantIds: [TENANT_A],
      batchSize: 1,
      providerAuthorityDigest: config.providerAuthorityDigest,
      from: 'employee-noreply@example.com',
      messageIdDomain: 'employee-mail.example.com',
    });
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.worker)).toBe(true);
    expect(Object.isFrozen(config.smtp)).toBe(true);
    expect(JSON.stringify(config.providerAuthorityDigest)).not.toContain(
      'employee-smtp-secret',
    );
  });

  it('rejects production and every candidate-status widening', () => {
    expect(() =>
      loadEmployeeInviteMailRuntimeCurrent189Config({
        ...enabledEnvironment(),
        NODE_ENV: 'production',
      }),
    ).toThrow('EMPLOYEE_INVITE_MAIL_RUNTIME_PRODUCTION_FORBIDDEN');
    expect(() =>
      loadEmployeeInviteMailRuntimeCurrent189Config({
        ...enabledEnvironment(),
        IDENTITY_EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_CANDIDATE_STATUS:
          'DEPLOYABLE',
      }),
    ).toThrow('EMPLOYEE_INVITE_MAIL_RUNTIME_CANDIDATE_STATUS_INVALID');
  });

  it('binds provider authority to the separate SMTP and envelope domains', () => {
    const environment = enabledEnvironment();
    environment.IDENTITY_EMPLOYEE_INVITE_SMTP_PASSWORD =
      'changed-employee-smtp-secret';
    expect(() =>
      loadEmployeeInviteMailRuntimeCurrent189Config(environment),
    ).toThrow('EMPLOYEE_INVITE_MAIL_RUNTIME_PROVIDER_AUTHORITY_MISMATCH');
  });

  it.each([
    [
      'employee envelope reuses initial-owner key',
      'IDENTITY_MAIL_ENCRYPTION_KEY',
      EMPLOYEE_KEY,
    ],
    [
      'employee SMTP reuses initial-owner SMTP',
      'IDENTITY_MAIL_SMTP_PASSWORD',
      'employee-smtp-secret',
    ],
    [
      'employee DB and SMTP passwords match',
      'IDENTITY_EMPLOYEE_INVITE_SMTP_PASSWORD',
      'employee-db-secret',
    ],
    ['employee envelope reuses app secret', 'APP_ENCRYPTION_KEY', EMPLOYEE_KEY],
  ])('rejects secret-domain collision: %s', (_case, key, value) => {
    expect(() =>
      loadEmployeeInviteMailRuntimeCurrent189Config({
        ...enabledEnvironment(),
        [key]: value,
      }),
    ).toThrow('EMPLOYEE_INVITE_MAIL_RUNTIME_SECRET_DOMAIN_COLLISION');
  });

  it.each([
    [
      'duplicate tenant',
      'IDENTITY_EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_TENANT_IDS',
      `${TENANT_A},${TENANT_A}`,
      'EMPLOYEE_INVITE_MAIL_RUNTIME_TENANT_IDS_INVALID',
    ],
    [
      'unbounded cycles',
      'IDENTITY_EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_MAX_CYCLES',
      '101',
      'EMPLOYEE_INVITE_MAIL_RUNTIME_MAX_CYCLES_INVALID',
    ],
    [
      'short acknowledgement',
      'IDENTITY_EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_ACKNOWLEDGE_SECONDS',
      '6',
      'EMPLOYEE_INVITE_MAIL_RUNTIME_ACKNOWLEDGE_SECONDS_INVALID',
    ],
  ])('rejects %s', (_case, key, value, reasonCode) => {
    expect(() =>
      loadEmployeeInviteMailRuntimeCurrent189Config({
        ...enabledEnvironment(),
        [key]: value,
      }),
    ).toThrow(reasonCode);
  });

  it('rejects an unpinned database identity or TLS option set', () => {
    expect(() =>
      loadEmployeeInviteMailRuntimeCurrent189Config({
        ...enabledEnvironment(),
        IDENTITY_EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_DATABASE_URL:
          'postgresql://leetplus_employee_mail_worker_current189:employee-db-secret@db.example.com:5432/other?schema=public&sslmode=require&sslaccept=strict&connect_timeout=5&socket_timeout=30',
      }),
    ).toThrow('EMPLOYEE_INVITE_MAIL_RUNTIME_DATABASE_IDENTITY_MISMATCH');
    expect(() =>
      loadEmployeeInviteMailRuntimeCurrent189Config({
        ...enabledEnvironment(),
        IDENTITY_EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_DATABASE_URL:
          'postgresql://leetplus_employee_mail_worker_current189:employee-db-secret@db.example.com:5432/leetplus_beta?schema=public',
      }),
    ).toThrow('EMPLOYEE_INVITE_MAIL_RUNTIME_DATABASE_OPTIONS_INVALID');
  });

  it('allows only an exact raw loopback authority to omit database TLS', () => {
    const exactLoopback = enabledEnvironment();
    exactLoopback.IDENTITY_EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_DATABASE_URL =
      'postgresql://leetplus_employee_mail_worker_current189:employee-db-secret@127.0.0.1:5432/leetplus_beta?schema=public&connect_timeout=5&socket_timeout=30';
    exactLoopback.IDENTITY_EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_PROVIDER_AUTHORITY_DIGEST =
      providerAuthorityDigest(false);

    const config = loadEmployeeInviteMailRuntimeCurrent189Config(exactLoopback);
    expect(config.enabled).toBe(true);
    if (!config.enabled) throw new Error('enabled config expected');
    expect(config.databaseTlsRequired).toBe(false);

    expect(() =>
      loadEmployeeInviteMailRuntimeCurrent189Config({
        ...exactLoopback,
        IDENTITY_EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_DATABASE_URL:
          'postgresql://leetplus_employee_mail_worker_current189:employee-db-secret@[0:0:0:0:0:0:0:1]:5432/leetplus_beta?schema=public&connect_timeout=5&socket_timeout=30',
      }),
    ).toThrow('EMPLOYEE_INVITE_MAIL_RUNTIME_DATABASE_OPTIONS_INVALID');
  });

  it.each([
    [
      'short employee SMTP password',
      'IDENTITY_EMPLOYEE_INVITE_SMTP_PASSWORD',
      'short',
      'EMPLOYEE_INVITE_MAIL_RUNTIME_SMTP_PASSWORD_REQUIRED',
    ],
    [
      'oversized employee SMTP username',
      'IDENTITY_EMPLOYEE_INVITE_SMTP_USERNAME',
      'u'.repeat(513),
      'EMPLOYEE_INVITE_MAIL_RUNTIME_SMTP_USERNAME_REQUIRED',
    ],
  ])('rejects %s', (_case, key, value, reasonCode) => {
    expect(() =>
      loadEmployeeInviteMailRuntimeCurrent189Config({
        ...enabledEnvironment(),
        [key]: value,
      }),
    ).toThrow(reasonCode);
  });

  it('rejects a weak employee database password', () => {
    expect(() =>
      loadEmployeeInviteMailRuntimeCurrent189Config({
        ...enabledEnvironment(),
        IDENTITY_EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_DATABASE_URL:
          'postgresql://leetplus_employee_mail_worker_current189:short@db.example.com:5432/leetplus_beta?schema=public&sslmode=require&sslaccept=strict&connect_timeout=5&socket_timeout=30',
      }),
    ).toThrow('EMPLOYEE_INVITE_MAIL_RUNTIME_DATABASE_IDENTITY_MISMATCH');
  });
});

function enabledEnvironment(): EmployeeInviteMailRuntimeCurrent189Environment {
  const smtp = smtpConfig();
  const environment: EmployeeInviteMailRuntimeCurrent189Environment = {
    NODE_ENV: 'test',
    IDENTITY_EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_ENABLED: 'true',
    IDENTITY_EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_REHEARSAL_ENABLED: 'true',
    IDENTITY_EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_REAL_PROVIDER_ENABLED:
      'true',
    IDENTITY_EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_ENVIRONMENT:
      'isolated-test',
    IDENTITY_EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_CANDIDATE_STATUS:
      'NOT_DEPLOYABLE',
    IDENTITY_EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_EXPECTED_CANDIDATE:
      EMPLOYEE_INVITE_MAIL_RUNTIME_CURRENT189_CANDIDATE,
    IDENTITY_EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_RELEASE_SHA: 'a'.repeat(40),
    IDENTITY_EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_DATABASE_URL:
      'postgresql://leetplus_employee_mail_worker_current189:employee-db-secret@db.example.com:5432/leetplus_beta?schema=public&sslmode=require&sslaccept=strict&connect_timeout=5&socket_timeout=30',
    IDENTITY_EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_EXPECTED_DATABASE:
      'leetplus_beta',
    IDENTITY_EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_EXPECTED_ROLE:
      'leetplus_employee_mail_worker_current189',
    IDENTITY_EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_TENANT_IDS: TENANT_A,
    IDENTITY_EMPLOYEE_INVITE_ENCRYPTION_KEY: EMPLOYEE_KEY,
    IDENTITY_EMPLOYEE_INVITE_ENCRYPTION_KEY_VERSION: 'v1',
    IDENTITY_EMPLOYEE_INVITE_AAD_ENVIRONMENT: 'isolated_test',
    IDENTITY_EMPLOYEE_INVITE_PUBLIC_WEB_ORIGIN: 'https://leetplus.ru',
    IDENTITY_EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_BATCH_SIZE: '1',
    IDENTITY_EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_MAX_ATTEMPTS: '3',
    IDENTITY_EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_LEASE_SECONDS: '60',
    IDENTITY_EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_ACKNOWLEDGE_SECONDS: '30',
    IDENTITY_EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_BASE_RETRY_SECONDS: '15',
    IDENTITY_EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_MAX_RETRY_SECONDS: '300',
    IDENTITY_EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_POLL_INTERVAL_MS: '25',
    IDENTITY_EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_MAX_CYCLES: '2',
    IDENTITY_EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_HEALTH_HOST: '127.0.0.1',
    IDENTITY_EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_HEALTH_PORT: '4201',
    IDENTITY_EMPLOYEE_INVITE_SMTP_HOST: smtp.host,
    IDENTITY_EMPLOYEE_INVITE_SMTP_PORT: String(smtp.port),
    IDENTITY_EMPLOYEE_INVITE_SMTP_TLS_MODE: smtp.tlsMode,
    IDENTITY_EMPLOYEE_INVITE_SMTP_SERVERNAME: smtp.servername,
    IDENTITY_EMPLOYEE_INVITE_SMTP_USERNAME: smtp.username,
    IDENTITY_EMPLOYEE_INVITE_SMTP_PASSWORD: smtp.password,
    IDENTITY_EMPLOYEE_INVITE_SMTP_FROM: smtp.from,
    IDENTITY_EMPLOYEE_INVITE_SMTP_MESSAGE_ID_DOMAIN: smtp.messageIdDomain,
    IDENTITY_EMPLOYEE_INVITE_SMTP_CONNECTION_TIMEOUT_MS: String(
      smtp.connectionTimeoutMs,
    ),
    IDENTITY_EMPLOYEE_INVITE_SMTP_GREETING_TIMEOUT_MS: String(
      smtp.greetingTimeoutMs,
    ),
    IDENTITY_EMPLOYEE_INVITE_SMTP_SOCKET_TIMEOUT_MS: String(
      smtp.socketTimeoutMs,
    ),
    IDENTITY_MAIL_ENCRYPTION_KEY: INITIAL_OWNER_KEY,
    IDENTITY_MAIL_SMTP_PASSWORD: 'initial-owner-smtp-secret',
    APP_ENCRYPTION_KEY: 'independent-app-secret',
    JWT_SECRET: 'independent-jwt-secret',
  };
  environment.IDENTITY_EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_PROVIDER_AUTHORITY_DIGEST =
    providerAuthorityDigest(true);
  return environment;
}

function providerAuthorityDigest(databaseTlsRequired: boolean): string {
  return deriveEmployeeInviteMailProviderAuthorityDigestCurrent189({
    expectedCandidate: EMPLOYEE_INVITE_MAIL_RUNTIME_CURRENT189_CANDIDATE,
    releaseSha: 'a'.repeat(40),
    expectedDatabase: 'leetplus_beta',
    expectedRole: 'leetplus_employee_mail_worker_current189',
    databaseTlsRequired,
    envelopeKeyBase64url: EMPLOYEE_KEY,
    envelopeKeyVersion: 'v1',
    aadEnvironment: 'isolated_test',
    smtp: smtpConfig(),
  });
}

function smtpConfig(): EmployeeInviteMailProviderCurrent189Config {
  return {
    host: 'smtp.example.com',
    port: 587,
    tlsMode: 'STARTTLS',
    servername: 'smtp.example.com',
    username: 'employee-smtp-user',
    password: 'employee-smtp-secret',
    from: 'employee-noreply@example.com',
    messageIdDomain: 'employee-mail.example.com',
    connectionTimeoutMs: 1_000,
    greetingTimeoutMs: 1_000,
    socketTimeoutMs: 5_000,
  };
}

import { createHash, timingSafeEqual } from 'node:crypto';
import { IDENTITY_MAIL_INDEPENDENT_SECRET_KEYS } from '../auth/identity-mail-independent-secret-keys';
import { isCanonicalIdentityEmail } from '../utilities/canonical-identity-email';
import { snapshotEnabledIdentityMailWorkerConfig } from './identity-mail-worker-config-binding';
import type {
  EnabledIdentityMailWorkerConfig,
  IdentityMailWorkerConfig,
  IdentityMailWorkerEnvironment,
  IdentityMailWorkerSmtpConfig,
} from './identity-mail-worker.types';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SAFE_DATABASE_PATTERN = /^[a-z][a-z0-9_]{0,62}$/u;
const SAFE_ROLE_PATTERN = /^[a-z][a-z0-9_]{0,62}$/u;
const MIGRATION_PATTERN = /^\d{14}_[a-z0-9_]+$/u;
const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const BASE64URL_KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const AAD_ENVIRONMENT_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/u;
const DNS_NAME_PATTERN =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
const SYSTEM_DATABASES = new Set(['postgres', 'template0', 'template1']);
const PUBLIC_WEB_ORIGIN = 'https://leetplus.ru' as const;
const MAX_CANARY_TENANTS = 4;
const DATABASE_CONNECT_TIMEOUT_SECONDS = 5 as const;
const DATABASE_SOCKET_TIMEOUT_SECONDS = 30 as const;

export class IdentityMailWorkerConfigurationError extends Error {
  constructor(readonly reasonCode: string) {
    super(reasonCode);
    this.name = 'IdentityMailWorkerConfigurationError';
  }
}

export function loadIdentityMailWorkerConfig(
  environment: IdentityMailWorkerEnvironment = process.env,
): IdentityMailWorkerConfig {
  const enabled = exactBoolean(
    environment.IDENTITY_MAIL_WORKER_ENABLED,
    'IDENTITY_MAIL_WORKER_ENABLED_INVALID',
  );
  const realSendEnabled = exactBoolean(
    environment.IDENTITY_MAIL_WORKER_REAL_SEND_ENABLED,
    'IDENTITY_MAIL_WORKER_REAL_SEND_ENABLED_INVALID',
  );
  const liveCanaryEnabled = exactBoolean(
    environment.IDENTITY_MAIL_WORKER_LIVE_CANARY_ENABLED,
    'IDENTITY_MAIL_WORKER_LIVE_CANARY_ENABLED_INVALID',
  );

  if (!enabled) {
    if (realSendEnabled || liveCanaryEnabled) {
      fail('IDENTITY_MAIL_WORKER_DISABLED_FLAGS_CONFLICT');
    }
    return {
      enabled: false,
      realSendEnabled: false,
      liveCanaryEnabled: false,
    };
  }
  if (!realSendEnabled || !liveCanaryEnabled) {
    fail('IDENTITY_MAIL_WORKER_LIVE_SEND_NOT_EXPLICITLY_ENABLED');
  }

  const expectedDatabase = requiredSafeName(
    environment.IDENTITY_MAIL_WORKER_EXPECTED_DATABASE,
    SAFE_DATABASE_PATTERN,
    'IDENTITY_MAIL_WORKER_EXPECTED_DATABASE_INVALID',
  );
  if (SYSTEM_DATABASES.has(expectedDatabase)) {
    fail('IDENTITY_MAIL_WORKER_EXPECTED_DATABASE_INVALID');
  }
  const expectedRole = requiredSafeName(
    environment.IDENTITY_MAIL_WORKER_EXPECTED_ROLE,
    SAFE_ROLE_PATTERN,
    'IDENTITY_MAIL_WORKER_EXPECTED_ROLE_INVALID',
  );
  const {
    databaseUrl,
    databaseTlsRequired,
    databaseConnectTimeoutSeconds,
    databaseSocketTimeoutSeconds,
    databasePassword,
  } = databaseConnectionUrl(
    environment.IDENTITY_MAIL_WORKER_DATABASE_URL,
    expectedDatabase,
    expectedRole,
  );
  const canaryTenantIds = tenantAllowlist(
    environment.IDENTITY_MAIL_WORKER_CANARY_TENANT_IDS,
  );
  const encryptionKey = encryptionKeyValue(
    environment.IDENTITY_MAIL_ENCRYPTION_KEY,
  );
  const encryptionKeyVersion = exactValue(
    environment.IDENTITY_MAIL_ENCRYPTION_KEY_VERSION,
    'v1',
    'IDENTITY_MAIL_ENCRYPTION_KEY_VERSION_INVALID',
  );
  const aadEnvironment = requiredPattern(
    environment.IDENTITY_MAIL_AAD_ENVIRONMENT,
    AAD_ENVIRONMENT_PATTERN,
    'IDENTITY_MAIL_AAD_ENVIRONMENT_INVALID',
  );
  const expectedMigration = requiredPattern(
    environment.IDENTITY_MAIL_WORKER_EXPECTED_MIGRATION,
    MIGRATION_PATTERN,
    'IDENTITY_MAIL_WORKER_EXPECTED_MIGRATION_INVALID',
  );
  const expectedMigrationCount = boundedInteger(
    environment.IDENTITY_MAIL_WORKER_EXPECTED_MIGRATION_COUNT,
    1,
    100_000,
    'IDENTITY_MAIL_WORKER_EXPECTED_MIGRATION_COUNT_INVALID',
  );
  const releaseSha = requiredPattern(
    environment.IDENTITY_MAIL_WORKER_RELEASE_SHA,
    SHA_PATTERN,
    'IDENTITY_MAIL_WORKER_RELEASE_SHA_INVALID',
  );
  assertReleaseAlias(
    environment.EXPECTED_DATABASE_MIGRATION,
    expectedMigration,
    'IDENTITY_MAIL_WORKER_EXPECTED_MIGRATION_ALIAS_MISMATCH',
  );
  assertReleaseAlias(
    environment.EXPECTED_DATABASE_MIGRATION_COUNT,
    String(expectedMigrationCount),
    'IDENTITY_MAIL_WORKER_EXPECTED_MIGRATION_COUNT_ALIAS_MISMATCH',
  );
  assertReleaseAlias(
    environment.RELEASE_SHA,
    releaseSha,
    'IDENTITY_MAIL_WORKER_RELEASE_SHA_ALIAS_MISMATCH',
  );
  const smtp = smtpConfig(environment, releaseSha);
  const minimumAcknowledgeSeconds = Math.ceil(
    (smtp.connectionTimeoutMs + smtp.greetingTimeoutMs + smtp.socketTimeoutMs) /
      1000,
  );
  if (minimumAcknowledgeSeconds < 10 || minimumAcknowledgeSeconds > 900) {
    fail('IDENTITY_MAIL_SMTP_ACKNOWLEDGE_WINDOW_INVALID');
  }
  assertWorkerSecretDomainsDistinct(
    encryptionKey,
    databasePassword,
    smtp.password,
    environment,
  );

  const config: EnabledIdentityMailWorkerConfig = {
    enabled: true,
    realSendEnabled: true,
    liveCanaryEnabled: true,
    databaseUrl,
    databaseTlsRequired,
    databaseConnectTimeoutSeconds,
    databaseSocketTimeoutSeconds,
    expectedDatabase,
    expectedRole,
    expectedMigration,
    expectedMigrationCount,
    releaseSha,
    canaryTenantIds,
    publicWebOrigin: publicWebOrigin(
      environment.IDENTITY_MAIL_PUBLIC_WEB_ORIGIN,
    ),
    encryptionKey,
    encryptionKeyVersion,
    aadEnvironment,
    pollIntervalMs: boundedInteger(
      environment.IDENTITY_MAIL_WORKER_POLL_INTERVAL_MS,
      1_000,
      300_000,
      'IDENTITY_MAIL_WORKER_POLL_INTERVAL_MS_INVALID',
    ),
    leaseMs: boundedInteger(
      environment.IDENTITY_MAIL_WORKER_LEASE_MS,
      30_000,
      900_000,
      'IDENTITY_MAIL_WORKER_LEASE_MS_INVALID',
    ),
    batchSize: boundedInteger(
      environment.IDENTITY_MAIL_WORKER_BATCH_SIZE,
      1,
      20,
      'IDENTITY_MAIL_WORKER_BATCH_SIZE_INVALID',
    ),
    maxAttempts: boundedInteger(
      environment.IDENTITY_MAIL_WORKER_MAX_ATTEMPTS,
      1,
      20,
      'IDENTITY_MAIL_WORKER_MAX_ATTEMPTS_INVALID',
    ),
    baseRetryMs: boundedInteger(
      environment.IDENTITY_MAIL_WORKER_BASE_RETRY_MS,
      1_000,
      3_600_000,
      'IDENTITY_MAIL_WORKER_BASE_RETRY_MS_INVALID',
    ),
    maxRetryMs: boundedInteger(
      environment.IDENTITY_MAIL_WORKER_MAX_RETRY_MS,
      1_000,
      86_400_000,
      'IDENTITY_MAIL_WORKER_MAX_RETRY_MS_INVALID',
    ),
    healthHost: exactValue(
      environment.IDENTITY_MAIL_WORKER_HEALTH_HOST,
      '127.0.0.1',
      'IDENTITY_MAIL_WORKER_HEALTH_HOST_INVALID',
    ),
    healthPort: boundedInteger(
      environment.IDENTITY_MAIL_WORKER_HEALTH_PORT,
      1_024,
      65_535,
      'IDENTITY_MAIL_WORKER_HEALTH_PORT_INVALID',
    ),
    smtp,
  };
  if (config.maxRetryMs < config.baseRetryMs) {
    fail('IDENTITY_MAIL_WORKER_RETRY_WINDOW_INVALID');
  }
  return snapshotEnabledIdentityMailWorkerConfig(config);
}

function smtpConfig(
  environment: IdentityMailWorkerEnvironment,
  releaseSha: string,
): IdentityMailWorkerSmtpConfig {
  const tlsMode = exactOneOf(
    environment.IDENTITY_MAIL_SMTP_TLS_MODE,
    ['IMPLICIT_TLS', 'STARTTLS'] as const,
    'IDENTITY_MAIL_SMTP_TLS_MODE_INVALID',
  );
  const egressMode = exactOneOf(
    environment.IDENTITY_MAIL_SMTP_EGRESS_MODE,
    ['DIRECT', 'LOOPBACK_BROKER'] as const,
    'IDENTITY_MAIL_SMTP_EGRESS_MODE_INVALID',
  );
  const servername = dnsName(
    environment.IDENTITY_MAIL_SMTP_SERVERNAME,
    'IDENTITY_MAIL_SMTP_SERVERNAME_INVALID',
  );
  const configuredPort = boundedInteger(
    environment.IDENTITY_MAIL_SMTP_PORT,
    1,
    65_535,
    'IDENTITY_MAIL_SMTP_PORT_INVALID',
  );
  let host: string;
  let targetHost: string;
  let targetPort: number;
  if (egressMode === 'LOOPBACK_BROKER') {
    exactValue(
      environment.IDENTITY_MAIL_SMTP_EGRESS_ENABLED,
      'true',
      'IDENTITY_MAIL_SMTP_EGRESS_NOT_EXPLICITLY_ENABLED',
    );
    exactValue(
      environment.IDENTITY_MAIL_SMTP_EGRESS_RELEASE_SHA,
      releaseSha,
      'IDENTITY_MAIL_SMTP_EGRESS_RELEASE_SHA_MISMATCH',
    );
    host = exactValue(
      environment.IDENTITY_MAIL_SMTP_HOST,
      '127.0.0.1',
      'IDENTITY_MAIL_SMTP_BROKER_HOST_INVALID',
    );
    if (configuredPort < 1_024) {
      fail('IDENTITY_MAIL_SMTP_BROKER_PORT_INVALID');
    }
    targetHost = dnsName(
      environment.IDENTITY_MAIL_SMTP_EGRESS_TARGET_HOST,
      'IDENTITY_MAIL_SMTP_EGRESS_TARGET_HOST_INVALID',
    );
    targetPort = boundedInteger(
      environment.IDENTITY_MAIL_SMTP_EGRESS_TARGET_PORT,
      1,
      65_535,
      'IDENTITY_MAIL_SMTP_EGRESS_TARGET_PORT_INVALID',
    );
    if (targetHost !== servername) {
      fail('IDENTITY_MAIL_SMTP_EGRESS_TLS_IDENTITY_MISMATCH');
    }
  } else {
    host = dnsName(
      environment.IDENTITY_MAIL_SMTP_HOST,
      'IDENTITY_MAIL_SMTP_HOST_INVALID',
    );
    if (
      environment.IDENTITY_MAIL_SMTP_EGRESS_ENABLED !== undefined ||
      environment.IDENTITY_MAIL_SMTP_EGRESS_RELEASE_SHA !== undefined ||
      environment.IDENTITY_MAIL_SMTP_EGRESS_TARGET_HOST !== undefined ||
      environment.IDENTITY_MAIL_SMTP_EGRESS_TARGET_PORT !== undefined
    ) {
      fail('IDENTITY_MAIL_SMTP_DIRECT_EGRESS_OVERRIDE_FORBIDDEN');
    }
    if (host !== servername) {
      fail('IDENTITY_MAIL_SMTP_DIRECT_TLS_IDENTITY_MISMATCH');
    }
    targetHost = host;
    targetPort = configuredPort;
  }
  const canonicalProviderPort = tlsMode === 'IMPLICIT_TLS' ? 465 : 587;
  if (targetPort !== canonicalProviderPort) {
    fail('IDENTITY_MAIL_SMTP_PROVIDER_PORT_INVALID');
  }
  return {
    host,
    port: configuredPort,
    tlsMode,
    servername,
    username: required(
      environment.IDENTITY_MAIL_SMTP_USERNAME,
      'IDENTITY_MAIL_SMTP_USERNAME_REQUIRED',
    ),
    password: required(
      environment.IDENTITY_MAIL_SMTP_PASSWORD,
      'IDENTITY_MAIL_SMTP_PASSWORD_REQUIRED',
    ),
    from: canonicalMailbox(
      environment.IDENTITY_MAIL_SMTP_FROM,
      'IDENTITY_MAIL_SMTP_FROM_INVALID',
    ),
    messageIdDomain: dnsName(
      environment.IDENTITY_MAIL_SMTP_MESSAGE_ID_DOMAIN,
      'IDENTITY_MAIL_SMTP_MESSAGE_ID_DOMAIN_INVALID',
    ),
    connectionTimeoutMs: boundedInteger(
      environment.IDENTITY_MAIL_SMTP_CONNECTION_TIMEOUT_MS,
      1_000,
      120_000,
      'IDENTITY_MAIL_SMTP_CONNECTION_TIMEOUT_MS_INVALID',
    ),
    greetingTimeoutMs: boundedInteger(
      environment.IDENTITY_MAIL_SMTP_GREETING_TIMEOUT_MS,
      1_000,
      120_000,
      'IDENTITY_MAIL_SMTP_GREETING_TIMEOUT_MS_INVALID',
    ),
    socketTimeoutMs: boundedInteger(
      environment.IDENTITY_MAIL_SMTP_SOCKET_TIMEOUT_MS,
      1_000,
      300_000,
      'IDENTITY_MAIL_SMTP_SOCKET_TIMEOUT_MS_INVALID',
    ),
    egress: {
      mode: egressMode,
      targetHost,
      targetPort,
    },
  };
}

function databaseConnectionUrl(
  value: string | undefined,
  expectedDatabase: string,
  expectedRole: string,
): {
  databaseUrl: string;
  databaseTlsRequired: boolean;
  databaseConnectTimeoutSeconds: number;
  databaseSocketTimeoutSeconds: number;
  databasePassword: string;
} {
  const raw = required(value, 'IDENTITY_MAIL_WORKER_DATABASE_URL_REQUIRED');
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return fail('IDENTITY_MAIL_WORKER_DATABASE_URL_INVALID');
  }
  if (
    !['postgres:', 'postgresql:'].includes(parsed.protocol) ||
    !parsed.hostname ||
    !parsed.username ||
    !parsed.password ||
    parsed.hash
  ) {
    fail('IDENTITY_MAIL_WORKER_DATABASE_URL_INVALID');
  }
  let database: string;
  let role: string;
  let databasePassword: string;
  try {
    database = decodeURIComponent(parsed.pathname.replace(/^\/+/u, ''));
    role = decodeURIComponent(parsed.username);
    databasePassword = decodeURIComponent(parsed.password);
  } catch {
    return fail('IDENTITY_MAIL_WORKER_DATABASE_URL_INVALID');
  }
  if (
    database !== expectedDatabase ||
    role !== expectedRole ||
    databasePassword.length === 0
  ) {
    fail('IDENTITY_MAIL_WORKER_DATABASE_IDENTITY_MISMATCH');
  }
  const loopback = hasExactDatabaseLoopbackAuthority(raw, parsed);
  const expectedSearch = loopback
    ? `?schema=public&connect_timeout=${DATABASE_CONNECT_TIMEOUT_SECONDS}&socket_timeout=${DATABASE_SOCKET_TIMEOUT_SECONDS}`
    : `?schema=public&sslmode=require&sslaccept=strict&connect_timeout=${DATABASE_CONNECT_TIMEOUT_SECONDS}&socket_timeout=${DATABASE_SOCKET_TIMEOUT_SECONDS}`;
  if (parsed.search !== expectedSearch) {
    fail('IDENTITY_MAIL_WORKER_DATABASE_URL_OPTIONS_INVALID');
  }
  return {
    databaseUrl: raw,
    databaseTlsRequired: !loopback,
    databaseConnectTimeoutSeconds: DATABASE_CONNECT_TIMEOUT_SECONDS,
    databaseSocketTimeoutSeconds: DATABASE_SOCKET_TIMEOUT_SECONDS,
    databasePassword,
  };
}

function hasExactDatabaseLoopbackAuthority(raw: string, parsed: URL): boolean {
  if (parsed.hostname !== '127.0.0.1' && parsed.hostname !== '[::1]') {
    return false;
  }
  const authorityStart = raw.indexOf('//') + 2;
  const authorityEnd = raw.indexOf('/', authorityStart);
  if (authorityStart < 2 || authorityEnd < authorityStart) {
    return false;
  }
  const authority = raw.slice(authorityStart, authorityEnd);
  const rawEndpoint = authority.slice(authority.lastIndexOf('@') + 1);
  const canonicalEndpoint = `${parsed.hostname}${
    parsed.port ? `:${parsed.port}` : ''
  }`;
  return rawEndpoint === canonicalEndpoint;
}

function publicWebOrigin(value: string | undefined): string {
  const candidate = required(value, 'IDENTITY_MAIL_PUBLIC_WEB_ORIGIN_REQUIRED');
  return exactValue(
    candidate,
    PUBLIC_WEB_ORIGIN,
    'IDENTITY_MAIL_PUBLIC_WEB_ORIGIN_INVALID',
  );
}

function tenantAllowlist(value: string | undefined): readonly string[] {
  const raw = required(
    value,
    'IDENTITY_MAIL_WORKER_CANARY_TENANT_IDS_REQUIRED',
  );
  const values = raw.split(',');
  if (
    values.length === 0 ||
    values.length > MAX_CANARY_TENANTS ||
    values.some((entry) => entry !== entry.trim() || !UUID_PATTERN.test(entry))
  ) {
    fail('IDENTITY_MAIL_WORKER_CANARY_TENANT_IDS_INVALID');
  }
  const unique = new Set(values);
  if (unique.size !== values.length) {
    fail('IDENTITY_MAIL_WORKER_CANARY_TENANT_IDS_DUPLICATE');
  }
  return Object.freeze([...unique].sort());
}

function encryptionKeyValue(value: string | undefined): string {
  const key = required(value, 'IDENTITY_MAIL_ENCRYPTION_KEY_REQUIRED');
  if (!BASE64URL_KEY_PATTERN.test(key)) {
    fail('IDENTITY_MAIL_ENCRYPTION_KEY_INVALID');
  }
  const decoded = Buffer.from(key, 'base64url');
  const invalid =
    decoded.length !== 32 ||
    decoded.toString('base64url') !== key ||
    decoded.every((byte) => byte === decoded[0]);
  decoded.fill(0);
  if (invalid) {
    fail('IDENTITY_MAIL_ENCRYPTION_KEY_INVALID');
  }
  return key;
}

function assertWorkerSecretDomainsDistinct(
  encryptionKey: string,
  databasePassword: string,
  smtpPassword: string,
  environment: IdentityMailWorkerEnvironment,
): void {
  const workerDigests: Buffer[] = [];
  const globalDigests: Buffer[] = [];
  let collision = false;

  try {
    const mailKeyTextDigest = secretDigest(encryptionKey, 'utf8');
    workerDigests.push(mailKeyTextDigest);
    const mailKeyBytesDigest = secretDigest(encryptionKey, 'base64url');
    workerDigests.push(mailKeyBytesDigest);
    const databasePasswordDigest = secretDigest(databasePassword, 'utf8');
    workerDigests.push(databasePasswordDigest);
    const smtpPasswordDigest = secretDigest(smtpPassword, 'utf8');
    workerDigests.push(smtpPasswordDigest);
    for (const key of IDENTITY_MAIL_INDEPENDENT_SECRET_KEYS) {
      const value = environment[key];
      if (typeof value === 'string') {
        globalDigests.push(secretDigest(value.trim(), 'utf8'));
      }
    }

    collision =
      compareSecretDigests(mailKeyTextDigest, databasePasswordDigest) ||
      collision;
    collision =
      compareSecretDigests(mailKeyBytesDigest, databasePasswordDigest) ||
      collision;
    collision =
      compareSecretDigests(mailKeyTextDigest, smtpPasswordDigest) || collision;
    collision =
      compareSecretDigests(mailKeyBytesDigest, smtpPasswordDigest) || collision;
    collision =
      compareSecretDigests(databasePasswordDigest, smtpPasswordDigest) ||
      collision;

    for (const globalDigest of globalDigests) {
      for (const workerDigest of workerDigests) {
        collision =
          compareSecretDigests(globalDigest, workerDigest) || collision;
      }
    }
  } finally {
    for (const digest of [...workerDigests, ...globalDigests]) {
      digest.fill(0);
    }
  }

  if (collision) {
    fail('IDENTITY_MAIL_WORKER_SECRET_DOMAIN_COLLISION');
  }
}

function secretDigest(value: string, encoding: BufferEncoding): Buffer {
  const bytes = Buffer.from(value, encoding);
  try {
    return createHash('sha256').update(bytes).digest();
  } finally {
    bytes.fill(0);
  }
}

function compareSecretDigests(left: Buffer, right: Buffer): boolean {
  return timingSafeEqual(left, right);
}

function assertReleaseAlias(
  value: string | undefined,
  expected: string,
  reasonCode: string,
): void {
  if (value !== undefined && value !== expected) {
    fail(reasonCode);
  }
}

function exactBoolean(value: string | undefined, reasonCode: string): boolean {
  if (value === undefined || value === '') {
    return false;
  }
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  return fail(reasonCode);
}

function boundedInteger(
  value: string | undefined,
  minimum: number,
  maximum: number,
  reasonCode: string,
): number {
  if (!value || !/^(?:0|[1-9]\d*)$/u.test(value)) {
    return fail(reasonCode);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    return fail(reasonCode);
  }
  return parsed;
}

function required(value: string | undefined, reasonCode: string): string {
  if (!value || value !== value.trim()) {
    return fail(reasonCode);
  }
  return value;
}

function requiredPattern(
  value: string | undefined,
  pattern: RegExp,
  reasonCode: string,
): string {
  const candidate = required(value, reasonCode);
  return pattern.test(candidate) ? candidate : fail(reasonCode);
}

function requiredSafeName(
  value: string | undefined,
  pattern: RegExp,
  reasonCode: string,
): string {
  return requiredPattern(value, pattern, reasonCode);
}

function dnsName(value: string | undefined, reasonCode: string): string {
  const candidate = requiredPattern(value, DNS_NAME_PATTERN, reasonCode);
  if (
    candidate === 'localhost' ||
    candidate.endsWith('.localhost') ||
    candidate.endsWith('.local')
  ) {
    return fail(reasonCode);
  }
  return candidate;
}

function canonicalMailbox(
  value: string | undefined,
  reasonCode: string,
): string {
  const candidate = required(value, reasonCode);
  return isCanonicalIdentityEmail(candidate) ? candidate : fail(reasonCode);
}

function exactValue<T extends string>(
  value: string | undefined,
  expected: T,
  reasonCode: string,
): T {
  return value === expected ? expected : fail(reasonCode);
}

function exactOneOf<const T extends readonly string[]>(
  value: string | undefined,
  allowed: T,
  reasonCode: string,
): T[number] {
  return allowed.includes(value ?? '')
    ? (value as T[number])
    : fail(reasonCode);
}

function fail(reasonCode: string): never {
  throw new IdentityMailWorkerConfigurationError(reasonCode);
}

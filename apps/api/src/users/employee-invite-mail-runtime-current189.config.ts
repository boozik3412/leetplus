import { createHash, createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';
import { IDENTITY_MAIL_INDEPENDENT_SECRET_KEYS } from '../auth/identity-mail-independent-secret-keys';
import { isCanonicalIdentityEmail } from '../utilities/canonical-identity-email';
import type { EmployeeInviteMailProviderCurrent189Config } from './employee-invite-mail-provider-current189';
import type { EmployeeInviteMailWorkerCurrent189Config } from './employee-invite-mail-worker-current189.types';

export const EMPLOYEE_INVITE_MAIL_RUNTIME_CURRENT189_CANDIDATE =
  '20260805030000_identity_employee_invite_mail_boundary_current189' as const;
export const EMPLOYEE_INVITE_MAIL_RUNTIME_CURRENT189_STATUS =
  'NOT_DEPLOYABLE' as const;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SAFE_DATABASE_PATTERN = /^[a-z][a-z0-9_]{0,62}$/u;
const SAFE_ROLE_PATTERN = /^[a-z][a-z0-9_]{0,62}$/u;
const RELEASE_SHA_PATTERN = /^[0-9a-f]{40}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const BASE64URL_KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const LABEL_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/u;
const DNS_NAME_PATTERN =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
const PUBLIC_WEB_ORIGIN = 'https://leetplus.ru' as const;
const SYSTEM_DATABASES = new Set(['postgres', 'template0', 'template1']);
const MAX_TENANTS = 4;
const DATABASE_CONNECT_TIMEOUT_SECONDS = 5;
const DATABASE_SOCKET_TIMEOUT_SECONDS = 30;
const AUTHORITY_HKDF_SALT =
  'leetplus:employee-invite-mail-provider-authority:salt:current189:v1';
const AUTHORITY_HKDF_INFO =
  'leetplus:employee-invite-mail-provider-authority:hmac:current189:v1';

export type EmployeeInviteMailRuntimeCurrent189Environment = Record<
  string,
  string | undefined
>;

export type DisabledEmployeeInviteMailRuntimeCurrent189Config = Readonly<{
  enabled: false;
  rehearsalEnabled: false;
  realProviderEnabled: false;
}>;

export type EnabledEmployeeInviteMailRuntimeCurrent189Config = Readonly<{
  enabled: true;
  rehearsalEnabled: true;
  realProviderEnabled: true;
  production: false;
  candidateStatus: typeof EMPLOYEE_INVITE_MAIL_RUNTIME_CURRENT189_STATUS;
  expectedCandidate: typeof EMPLOYEE_INVITE_MAIL_RUNTIME_CURRENT189_CANDIDATE;
  releaseSha: string;
  databaseUrl: string;
  expectedDatabase: string;
  expectedRole: string;
  databaseTlsRequired: boolean;
  envelopeKeyBase64url: string;
  envelopeKeyVersion: 'v1';
  aadEnvironment: string;
  providerAuthorityDigest: string;
  smtp: EmployeeInviteMailProviderCurrent189Config;
  worker: EmployeeInviteMailWorkerCurrent189Config;
  pollIntervalMs: number;
  maxCycles: number;
  healthHost: '127.0.0.1';
  healthPort: number;
}>;

export type EmployeeInviteMailRuntimeCurrent189Config =
  | DisabledEmployeeInviteMailRuntimeCurrent189Config
  | EnabledEmployeeInviteMailRuntimeCurrent189Config;

export class EmployeeInviteMailRuntimeCurrent189ConfigurationError extends Error {
  constructor(readonly reasonCode: string) {
    super(reasonCode);
    this.name = 'EmployeeInviteMailRuntimeCurrent189ConfigurationError';
  }
}

export function loadEmployeeInviteMailRuntimeCurrent189Config(
  environment: EmployeeInviteMailRuntimeCurrent189Environment = process.env,
): EmployeeInviteMailRuntimeCurrent189Config {
  const enabled = exactBoolean(
    environment.IDENTITY_EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_ENABLED,
    'EMPLOYEE_INVITE_MAIL_RUNTIME_ENABLED_INVALID',
  );
  const rehearsalEnabled = exactBoolean(
    environment.IDENTITY_EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_REHEARSAL_ENABLED,
    'EMPLOYEE_INVITE_MAIL_RUNTIME_REHEARSAL_FLAG_INVALID',
  );
  const realProviderEnabled = exactBoolean(
    environment.IDENTITY_EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_REAL_PROVIDER_ENABLED,
    'EMPLOYEE_INVITE_MAIL_RUNTIME_PROVIDER_FLAG_INVALID',
  );
  if (!enabled) {
    if (rehearsalEnabled || realProviderEnabled) {
      fail('EMPLOYEE_INVITE_MAIL_RUNTIME_DISABLED_FLAGS_CONFLICT');
    }
    return Object.freeze({
      enabled: false,
      rehearsalEnabled: false,
      realProviderEnabled: false,
    });
  }
  if (
    environment.NODE_ENV === 'production' ||
    environment.IDENTITY_EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_ENVIRONMENT !==
      'isolated-test' ||
    !rehearsalEnabled ||
    !realProviderEnabled
  ) {
    fail('EMPLOYEE_INVITE_MAIL_RUNTIME_PRODUCTION_FORBIDDEN');
  }

  const candidateStatus = exactValue(
    environment.IDENTITY_EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_CANDIDATE_STATUS,
    EMPLOYEE_INVITE_MAIL_RUNTIME_CURRENT189_STATUS,
    'EMPLOYEE_INVITE_MAIL_RUNTIME_CANDIDATE_STATUS_INVALID',
  );
  const expectedCandidate = exactValue(
    environment.IDENTITY_EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_EXPECTED_CANDIDATE,
    EMPLOYEE_INVITE_MAIL_RUNTIME_CURRENT189_CANDIDATE,
    'EMPLOYEE_INVITE_MAIL_RUNTIME_CANDIDATE_INVALID',
  );
  const releaseSha = requiredPattern(
    environment.IDENTITY_EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_RELEASE_SHA,
    RELEASE_SHA_PATTERN,
    'EMPLOYEE_INVITE_MAIL_RUNTIME_RELEASE_SHA_INVALID',
  );
  const expectedDatabase = requiredPattern(
    environment.IDENTITY_EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_EXPECTED_DATABASE,
    SAFE_DATABASE_PATTERN,
    'EMPLOYEE_INVITE_MAIL_RUNTIME_DATABASE_INVALID',
  );
  if (SYSTEM_DATABASES.has(expectedDatabase)) {
    fail('EMPLOYEE_INVITE_MAIL_RUNTIME_DATABASE_INVALID');
  }
  const expectedRole = requiredPattern(
    environment.IDENTITY_EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_EXPECTED_ROLE,
    SAFE_ROLE_PATTERN,
    'EMPLOYEE_INVITE_MAIL_RUNTIME_ROLE_INVALID',
  );
  const database = databaseConnection(
    environment.IDENTITY_EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_DATABASE_URL,
    expectedDatabase,
    expectedRole,
  );
  const tenantIds = tenantAllowlist(
    environment.IDENTITY_EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_TENANT_IDS,
  );
  const envelopeKeyBase64url = encryptionKey(
    environment.IDENTITY_EMPLOYEE_INVITE_ENCRYPTION_KEY,
  );
  const envelopeKeyVersion = exactValue(
    environment.IDENTITY_EMPLOYEE_INVITE_ENCRYPTION_KEY_VERSION,
    'v1',
    'EMPLOYEE_INVITE_MAIL_RUNTIME_ENVELOPE_VERSION_INVALID',
  );
  const aadEnvironment = requiredPattern(
    environment.IDENTITY_EMPLOYEE_INVITE_AAD_ENVIRONMENT,
    LABEL_PATTERN,
    'EMPLOYEE_INVITE_MAIL_RUNTIME_AAD_ENVIRONMENT_INVALID',
  );
  const smtp = smtpConfig(environment);
  const expectedPolicy = Object.freeze({
    maxAttempts: boundedInteger(
      environment.IDENTITY_EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_MAX_ATTEMPTS,
      1,
      20,
      'EMPLOYEE_INVITE_MAIL_RUNTIME_MAX_ATTEMPTS_INVALID',
    ),
    leaseSeconds: boundedInteger(
      environment.IDENTITY_EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_LEASE_SECONDS,
      30,
      900,
      'EMPLOYEE_INVITE_MAIL_RUNTIME_LEASE_SECONDS_INVALID',
    ),
    acknowledgeSeconds: boundedInteger(
      environment.IDENTITY_EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_ACKNOWLEDGE_SECONDS,
      10,
      900,
      'EMPLOYEE_INVITE_MAIL_RUNTIME_ACKNOWLEDGE_SECONDS_INVALID',
    ),
    baseRetrySeconds: boundedInteger(
      environment.IDENTITY_EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_BASE_RETRY_SECONDS,
      1,
      3_600,
      'EMPLOYEE_INVITE_MAIL_RUNTIME_BASE_RETRY_INVALID',
    ),
    maxRetrySeconds: boundedInteger(
      environment.IDENTITY_EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_MAX_RETRY_SECONDS,
      1,
      86_400,
      'EMPLOYEE_INVITE_MAIL_RUNTIME_MAX_RETRY_INVALID',
    ),
  });
  const minimumAcknowledgeSeconds = Math.ceil(
    (smtp.connectionTimeoutMs + smtp.greetingTimeoutMs + smtp.socketTimeoutMs) /
      1000,
  );
  if (
    expectedPolicy.acknowledgeSeconds < minimumAcknowledgeSeconds ||
    expectedPolicy.leaseSeconds <= expectedPolicy.acknowledgeSeconds ||
    expectedPolicy.maxRetrySeconds < expectedPolicy.baseRetrySeconds
  ) {
    fail('EMPLOYEE_INVITE_MAIL_RUNTIME_POLICY_INVALID');
  }
  assertSecretsDistinct(
    envelopeKeyBase64url,
    database.password,
    smtp.password,
    environment,
  );
  const derivedProviderAuthorityDigest =
    deriveEmployeeInviteMailProviderAuthorityDigestCurrent189({
      expectedCandidate,
      releaseSha,
      expectedDatabase,
      expectedRole,
      databaseTlsRequired: database.tlsRequired,
      envelopeKeyBase64url,
      envelopeKeyVersion,
      aadEnvironment,
      smtp,
    });
  const configuredProviderAuthorityDigest = requiredPattern(
    environment.IDENTITY_EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_PROVIDER_AUTHORITY_DIGEST,
    SHA256_PATTERN,
    'EMPLOYEE_INVITE_MAIL_RUNTIME_PROVIDER_AUTHORITY_INVALID',
  );
  if (
    !constantTimeHexEqual(
      derivedProviderAuthorityDigest,
      configuredProviderAuthorityDigest,
    )
  ) {
    fail('EMPLOYEE_INVITE_MAIL_RUNTIME_PROVIDER_AUTHORITY_MISMATCH');
  }

  const worker: EmployeeInviteMailWorkerCurrent189Config = Object.freeze({
    enabled: true,
    realProviderEnabled: true,
    production: false,
    candidateStatus,
    publicWebOrigin: exactValue(
      environment.IDENTITY_EMPLOYEE_INVITE_PUBLIC_WEB_ORIGIN,
      PUBLIC_WEB_ORIGIN,
      'EMPLOYEE_INVITE_MAIL_RUNTIME_PUBLIC_ORIGIN_INVALID',
    ),
    aadEnvironment,
    keyVersion: envelopeKeyVersion,
    tenantIds,
    batchSize: boundedInteger(
      environment.IDENTITY_EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_BATCH_SIZE,
      1,
      20,
      'EMPLOYEE_INVITE_MAIL_RUNTIME_BATCH_SIZE_INVALID',
    ),
    providerAuthorityDigest: configuredProviderAuthorityDigest,
    from: smtp.from,
    messageIdDomain: smtp.messageIdDomain,
    expectedPolicy,
  });

  return Object.freeze({
    enabled: true,
    rehearsalEnabled: true,
    realProviderEnabled: true,
    production: false,
    candidateStatus,
    expectedCandidate,
    releaseSha,
    databaseUrl: database.url,
    expectedDatabase,
    expectedRole,
    databaseTlsRequired: database.tlsRequired,
    envelopeKeyBase64url,
    envelopeKeyVersion,
    aadEnvironment,
    providerAuthorityDigest: configuredProviderAuthorityDigest,
    smtp,
    worker,
    pollIntervalMs: boundedInteger(
      environment.IDENTITY_EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_POLL_INTERVAL_MS,
      10,
      300_000,
      'EMPLOYEE_INVITE_MAIL_RUNTIME_POLL_INTERVAL_INVALID',
    ),
    maxCycles: boundedInteger(
      environment.IDENTITY_EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_MAX_CYCLES,
      1,
      100,
      'EMPLOYEE_INVITE_MAIL_RUNTIME_MAX_CYCLES_INVALID',
    ),
    healthHost: exactValue(
      environment.IDENTITY_EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_HEALTH_HOST,
      '127.0.0.1',
      'EMPLOYEE_INVITE_MAIL_RUNTIME_HEALTH_HOST_INVALID',
    ),
    healthPort: boundedInteger(
      environment.IDENTITY_EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_HEALTH_PORT,
      1_024,
      65_535,
      'EMPLOYEE_INVITE_MAIL_RUNTIME_HEALTH_PORT_INVALID',
    ),
  });
}

export function deriveEmployeeInviteMailProviderAuthorityDigestCurrent189(input: {
  expectedCandidate: string;
  releaseSha: string;
  expectedDatabase: string;
  expectedRole: string;
  databaseTlsRequired: boolean;
  envelopeKeyBase64url: string;
  envelopeKeyVersion: string;
  aadEnvironment: string;
  smtp: EmployeeInviteMailProviderCurrent189Config;
}): string {
  const keyBytes = Buffer.from(input.envelopeKeyBase64url, 'base64url');
  let bindingKey: Buffer | undefined;
  try {
    if (
      keyBytes.length !== 32 ||
      keyBytes.toString('base64url') !== input.envelopeKeyBase64url
    ) {
      fail('EMPLOYEE_INVITE_MAIL_RUNTIME_ENVELOPE_KEY_INVALID');
    }
    bindingKey = Buffer.from(
      hkdfSync(
        'sha256',
        keyBytes,
        AUTHORITY_HKDF_SALT,
        AUTHORITY_HKDF_INFO,
        32,
      ),
    );
    const passwordBinding = createHmac('sha256', bindingKey)
      .update(input.smtp.password, 'utf8')
      .digest('hex');
    return digestJson({
      contract: 'IDENTITY_EMPLOYEE_INVITE_PROVIDER_AUTHORITY_CURRENT189_V1',
      expectedCandidate: input.expectedCandidate,
      releaseSha: input.releaseSha,
      expectedDatabase: input.expectedDatabase,
      expectedRole: input.expectedRole,
      databaseTlsRequired: input.databaseTlsRequired,
      envelopeKeyFingerprint: createHash('sha256')
        .update(keyBytes)
        .digest('hex'),
      envelopeKeyVersion: input.envelopeKeyVersion,
      aadEnvironment: input.aadEnvironment,
      smtp: {
        host: input.smtp.host,
        port: input.smtp.port,
        tlsMode: input.smtp.tlsMode,
        servername: input.smtp.servername,
        usernameDigest: digestText(input.smtp.username),
        passwordBinding,
        from: input.smtp.from,
        messageIdDomain: input.smtp.messageIdDomain,
        connectionTimeoutMs: input.smtp.connectionTimeoutMs,
        greetingTimeoutMs: input.smtp.greetingTimeoutMs,
        socketTimeoutMs: input.smtp.socketTimeoutMs,
      },
    });
  } finally {
    bindingKey?.fill(0);
    keyBytes.fill(0);
  }
}

function smtpConfig(
  environment: EmployeeInviteMailRuntimeCurrent189Environment,
): EmployeeInviteMailProviderCurrent189Config {
  return Object.freeze({
    host: dnsName(
      environment.IDENTITY_EMPLOYEE_INVITE_SMTP_HOST,
      'EMPLOYEE_INVITE_MAIL_RUNTIME_SMTP_HOST_INVALID',
    ),
    port: boundedInteger(
      environment.IDENTITY_EMPLOYEE_INVITE_SMTP_PORT,
      1,
      65_535,
      'EMPLOYEE_INVITE_MAIL_RUNTIME_SMTP_PORT_INVALID',
    ),
    tlsMode: exactOneOf(
      environment.IDENTITY_EMPLOYEE_INVITE_SMTP_TLS_MODE,
      ['IMPLICIT_TLS', 'STARTTLS'] as const,
      'EMPLOYEE_INVITE_MAIL_RUNTIME_SMTP_TLS_MODE_INVALID',
    ),
    servername: dnsName(
      environment.IDENTITY_EMPLOYEE_INVITE_SMTP_SERVERNAME,
      'EMPLOYEE_INVITE_MAIL_RUNTIME_SMTP_SERVERNAME_INVALID',
    ),
    username: boundedCredential(
      environment.IDENTITY_EMPLOYEE_INVITE_SMTP_USERNAME,
      1,
      512,
      'EMPLOYEE_INVITE_MAIL_RUNTIME_SMTP_USERNAME_REQUIRED',
    ),
    password: boundedCredential(
      environment.IDENTITY_EMPLOYEE_INVITE_SMTP_PASSWORD,
      16,
      512,
      'EMPLOYEE_INVITE_MAIL_RUNTIME_SMTP_PASSWORD_REQUIRED',
    ),
    from: canonicalMailbox(
      environment.IDENTITY_EMPLOYEE_INVITE_SMTP_FROM,
      'EMPLOYEE_INVITE_MAIL_RUNTIME_SMTP_FROM_INVALID',
    ),
    messageIdDomain: dnsName(
      environment.IDENTITY_EMPLOYEE_INVITE_SMTP_MESSAGE_ID_DOMAIN,
      'EMPLOYEE_INVITE_MAIL_RUNTIME_SMTP_MESSAGE_ID_DOMAIN_INVALID',
    ),
    connectionTimeoutMs: boundedInteger(
      environment.IDENTITY_EMPLOYEE_INVITE_SMTP_CONNECTION_TIMEOUT_MS,
      100,
      120_000,
      'EMPLOYEE_INVITE_MAIL_RUNTIME_SMTP_CONNECTION_TIMEOUT_INVALID',
    ),
    greetingTimeoutMs: boundedInteger(
      environment.IDENTITY_EMPLOYEE_INVITE_SMTP_GREETING_TIMEOUT_MS,
      100,
      120_000,
      'EMPLOYEE_INVITE_MAIL_RUNTIME_SMTP_GREETING_TIMEOUT_INVALID',
    ),
    socketTimeoutMs: boundedInteger(
      environment.IDENTITY_EMPLOYEE_INVITE_SMTP_SOCKET_TIMEOUT_MS,
      100,
      120_000,
      'EMPLOYEE_INVITE_MAIL_RUNTIME_SMTP_SOCKET_TIMEOUT_INVALID',
    ),
  });
}

function databaseConnection(
  value: string | undefined,
  expectedDatabase: string,
  expectedRole: string,
): { url: string; password: string; tlsRequired: boolean } {
  const raw = required(
    value,
    'EMPLOYEE_INVITE_MAIL_RUNTIME_DATABASE_URL_REQUIRED',
  );
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return fail('EMPLOYEE_INVITE_MAIL_RUNTIME_DATABASE_URL_INVALID');
  }
  if (
    !['postgres:', 'postgresql:'].includes(parsed.protocol) ||
    !parsed.hostname ||
    !parsed.username ||
    !parsed.password ||
    parsed.hash
  ) {
    fail('EMPLOYEE_INVITE_MAIL_RUNTIME_DATABASE_URL_INVALID');
  }
  let database: string;
  let role: string;
  let password: string;
  try {
    database = decodeURIComponent(parsed.pathname.replace(/^\/+/u, ''));
    role = decodeURIComponent(parsed.username);
    password = decodeURIComponent(parsed.password);
  } catch {
    return fail('EMPLOYEE_INVITE_MAIL_RUNTIME_DATABASE_URL_INVALID');
  }
  if (
    database !== expectedDatabase ||
    role !== expectedRole ||
    password.length < 16 ||
    password.length > 512 ||
    password !== password.trim()
  ) {
    fail('EMPLOYEE_INVITE_MAIL_RUNTIME_DATABASE_IDENTITY_MISMATCH');
  }
  const loopback = hasExactDatabaseLoopbackAuthority(raw, parsed);
  const expectedSearch = loopback
    ? `?schema=public&connect_timeout=${DATABASE_CONNECT_TIMEOUT_SECONDS}&socket_timeout=${DATABASE_SOCKET_TIMEOUT_SECONDS}`
    : `?schema=public&sslmode=require&sslaccept=strict&connect_timeout=${DATABASE_CONNECT_TIMEOUT_SECONDS}&socket_timeout=${DATABASE_SOCKET_TIMEOUT_SECONDS}`;
  if (parsed.search !== expectedSearch) {
    fail('EMPLOYEE_INVITE_MAIL_RUNTIME_DATABASE_OPTIONS_INVALID');
  }
  return { url: raw, password, tlsRequired: !loopback };
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

function tenantAllowlist(value: string | undefined): readonly string[] {
  const values = required(
    value,
    'EMPLOYEE_INVITE_MAIL_RUNTIME_TENANT_IDS_REQUIRED',
  ).split(',');
  if (
    values.length < 1 ||
    values.length > MAX_TENANTS ||
    values.some(
      (entry) => entry !== entry.trim() || !UUID_PATTERN.test(entry),
    ) ||
    new Set(values).size !== values.length
  ) {
    fail('EMPLOYEE_INVITE_MAIL_RUNTIME_TENANT_IDS_INVALID');
  }
  return Object.freeze([...values].sort());
}

function encryptionKey(value: string | undefined): string {
  const candidate = required(
    value,
    'EMPLOYEE_INVITE_MAIL_RUNTIME_ENVELOPE_KEY_REQUIRED',
  );
  if (!BASE64URL_KEY_PATTERN.test(candidate)) {
    fail('EMPLOYEE_INVITE_MAIL_RUNTIME_ENVELOPE_KEY_INVALID');
  }
  const decoded = Buffer.from(candidate, 'base64url');
  const invalid =
    decoded.length !== 32 ||
    decoded.toString('base64url') !== candidate ||
    decoded.every((byte) => byte === decoded[0]);
  decoded.fill(0);
  return invalid
    ? fail('EMPLOYEE_INVITE_MAIL_RUNTIME_ENVELOPE_KEY_INVALID')
    : candidate;
}

function assertSecretsDistinct(
  envelopeKey: string,
  databasePassword: string,
  smtpPassword: string,
  environment: EmployeeInviteMailRuntimeCurrent189Environment,
): void {
  const employeeSecrets = [
    secretDigest(envelopeKey, 'utf8'),
    secretDigest(envelopeKey, 'base64url'),
    secretDigest(databasePassword, 'utf8'),
    secretDigest(smtpPassword, 'utf8'),
  ];
  const comparisonSecrets: Buffer[] = [];
  try {
    for (const key of [
      ...IDENTITY_MAIL_INDEPENDENT_SECRET_KEYS,
      'IDENTITY_MAIL_ENCRYPTION_KEY',
      'IDENTITY_MAIL_SMTP_PASSWORD',
      'MAIL_PASS',
    ]) {
      if (key === 'IDENTITY_EMPLOYEE_INVITE_ENCRYPTION_KEY') {
        continue;
      }
      const value = environment[key];
      if (typeof value === 'string' && value.length > 0) {
        comparisonSecrets.push(secretDigest(value.trim(), 'utf8'));
        if (BASE64URL_KEY_PATTERN.test(value)) {
          comparisonSecrets.push(secretDigest(value, 'base64url'));
        }
      }
    }
    const initialDatabasePassword = passwordFromUrl(
      environment.IDENTITY_MAIL_WORKER_DATABASE_URL,
    );
    if (initialDatabasePassword) {
      comparisonSecrets.push(secretDigest(initialDatabasePassword, 'utf8'));
    }
    for (let left = 0; left < employeeSecrets.length; left += 1) {
      for (let right = left + 1; right < employeeSecrets.length; right += 1) {
        if (timingSafeEqual(employeeSecrets[left], employeeSecrets[right])) {
          fail('EMPLOYEE_INVITE_MAIL_RUNTIME_SECRET_DOMAIN_COLLISION');
        }
      }
      for (const other of comparisonSecrets) {
        if (timingSafeEqual(employeeSecrets[left], other)) {
          fail('EMPLOYEE_INVITE_MAIL_RUNTIME_SECRET_DOMAIN_COLLISION');
        }
      }
    }
  } finally {
    for (const secret of [...employeeSecrets, ...comparisonSecrets]) {
      secret.fill(0);
    }
  }
}

function passwordFromUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.password ? decodeURIComponent(parsed.password) : null;
  } catch {
    return null;
  }
}

function constantTimeHexEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, 'hex');
  const rightBytes = Buffer.from(right, 'hex');
  try {
    return (
      leftBytes.length === rightBytes.length &&
      timingSafeEqual(leftBytes, rightBytes)
    );
  } finally {
    leftBytes.fill(0);
    rightBytes.fill(0);
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

function digestText(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function digestJson(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function exactBoolean(value: string | undefined, reasonCode: string): boolean {
  if (value === undefined || value === '' || value === 'false') return false;
  if (value === 'true') return true;
  return fail(reasonCode);
}

function boundedInteger(
  value: string | undefined,
  minimum: number,
  maximum: number,
  reasonCode: string,
): number {
  if (!value || !/^(?:0|[1-9]\d*)$/u.test(value)) return fail(reasonCode);
  const result = Number(value);
  return Number.isSafeInteger(result) && result >= minimum && result <= maximum
    ? result
    : fail(reasonCode);
}

function required(value: string | undefined, reasonCode: string): string {
  return value && value === value.trim() ? value : fail(reasonCode);
}

function boundedCredential(
  value: string | undefined,
  minimum: number,
  maximum: number,
  reasonCode: string,
): string {
  const candidate = required(value, reasonCode);
  return candidate.length >= minimum && candidate.length <= maximum
    ? candidate
    : fail(reasonCode);
}

function requiredPattern(
  value: string | undefined,
  pattern: RegExp,
  reasonCode: string,
): string {
  const candidate = required(value, reasonCode);
  return pattern.test(candidate) ? candidate : fail(reasonCode);
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

function dnsName(value: string | undefined, reasonCode: string): string {
  const candidate = requiredPattern(value, DNS_NAME_PATTERN, reasonCode);
  return candidate === 'localhost' ||
    candidate.endsWith('.localhost') ||
    candidate.endsWith('.local')
    ? fail(reasonCode)
    : candidate;
}

function canonicalMailbox(
  value: string | undefined,
  reasonCode: string,
): string {
  const candidate = required(value, reasonCode);
  return isCanonicalIdentityEmail(candidate) ? candidate : fail(reasonCode);
}

function fail(reasonCode: string): never {
  throw new EmployeeInviteMailRuntimeCurrent189ConfigurationError(reasonCode);
}

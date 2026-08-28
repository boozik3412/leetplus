import type { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { posix } from 'node:path';
import {
  API_RUNTIME_ROLE_KEY,
  guestRuntimeEnvironmentErrors,
  resolveApiRuntimeRole,
} from './api-runtime-role';
import { dedicatedApiDatabaseEnvironmentErrors } from './api-runtime-database';

const MINIMUM_PRODUCTION_SECRET_LENGTH = 32;
const ENVIRONMENT_MARKER_KEYS = [
  'NODE_ENV',
  'APP_ENV',
  'DEPLOY_ENV',
  'ENVIRONMENT',
  'VERCEL_ENV',
] as const;
const PRODUCTION_ENVIRONMENT_MARKERS = new Set(['prod', 'production', 'live']);

export const PRODUCTION_SECRET_KEYS = [
  'JWT_SECRET',
  'GUEST_PORTAL_JWT_SECRET',
  'GUEST_GAME_REFERRAL_SECRET',
  'APP_ENCRYPTION_KEY',
  'INTEGRATION_ENCRYPTION_KEY',
  'IDENTITY_EMAIL_FINGERPRINT_HMAC_KEY',
  'IDENTITY_MAIL_ENCRYPTION_KEY',
  'SYNC_SERVICE_TOKEN',
] as const;

export type ProductionSecretKey = (typeof PRODUCTION_SECRET_KEYS)[number];
export const GUEST_RUNTIME_PRODUCTION_SECRET_KEYS = [
  'GUEST_PORTAL_JWT_SECRET',
  'GUEST_GAME_REFERRAL_SECRET',
  'APP_ENCRYPTION_KEY',
  'INTEGRATION_ENCRYPTION_KEY',
] as const satisfies readonly ProductionSecretKey[];
export const CORPORATE_RUNTIME_PRODUCTION_SECRET_KEYS = [
  'JWT_SECRET',
  'APP_ENCRYPTION_KEY',
  'INTEGRATION_ENCRYPTION_KEY',
  'IDENTITY_EMAIL_FINGERPRINT_HMAC_KEY',
  'IDENTITY_MAIL_ENCRYPTION_KEY',
  'SYNC_SERVICE_TOKEN',
] as const satisfies readonly ProductionSecretKey[];
const GUEST_RUNTIME_FORBIDDEN_SECRET_KEYS = [
  'JWT_SECRET',
  'IDENTITY_EMAIL_FINGERPRINT_HMAC_KEY',
  'IDENTITY_MAIL_ENCRYPTION_KEY',
  'SYNC_SERVICE_TOKEN',
] as const satisfies readonly ProductionSecretKey[];
const CORPORATE_RUNTIME_FORBIDDEN_SECRET_KEYS = [
  'GUEST_PORTAL_JWT_SECRET',
  'GUEST_GAME_REFERRAL_SECRET',
] as const satisfies readonly ProductionSecretKey[];
type FallbackProductionSecretKey = Exclude<
  ProductionSecretKey,
  'IDENTITY_MAIL_ENCRYPTION_KEY'
>;

export const IDENTITY_MAIL_ENCRYPTION_KEY_VERSION = 'v1' as const;
export const IDENTITY_MAIL_ENCRYPTION_KEY_BYTES = 32;
const IDENTITY_MAIL_ENCRYPTION_KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const IDENTITY_MAIL_AAD_ENVIRONMENT_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/u;

export const PRODUCTION_RELEASE_KEYS = [
  'RELEASE_SHA',
  'BUILD_TIME',
  'EXPECTED_DATABASE_MIGRATION',
  'EXPECTED_DATABASE_MIGRATION_COUNT',
] as const;

export const LANGAME_DISCREPANCY_LOG_ROOT_KEY =
  'LANGAME_DISCREPANCY_LOG_ROOT' as const;
export const API_BIND_HOST_KEY = 'API_BIND_HOST' as const;
export const PRODUCTION_API_BIND_HOST = '127.0.0.1' as const;

export function resolveProductionLangameDiscrepancyLogRoot(
  value: unknown,
): string | undefined {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value !== value.trim()
  ) {
    return undefined;
  }
  if (
    value.includes('\0') ||
    value.includes('\\') ||
    !posix.isAbsolute(value) ||
    value.split('/').some((segment) => segment === '.' || segment === '..')
  ) {
    return undefined;
  }

  const normalized = posix.normalize(value).replace(/\/$/u, '');
  if (!normalized || normalized === posix.parse(normalized).root) {
    return undefined;
  }

  return normalized;
}

export const ACCESS_SCOPE_ENFORCEMENT_MODES = ['SHADOW', 'ENFORCED'] as const;

export type AccessScopeEnforcementMode =
  (typeof ACCESS_SCOPE_ENFORCEMENT_MODES)[number];

export const STAFF_ATTACHMENT_ACL_MODES = [
  'LEGACY',
  'SHADOW',
  'ENFORCED',
] as const;

export type StaffAttachmentAclMode =
  (typeof STAFF_ATTACHMENT_ACL_MODES)[number];

export const FOUNDER_OPERATOR_BETA_MODES = [
  'DISABLED',
  'PREPARE',
  'ACTIVE',
] as const;

export type FounderOperatorBetaMode =
  (typeof FOUNDER_OPERATOR_BETA_MODES)[number];

export const FOUNDER_OPERATOR_BETA_ACTIVATION_DATABASE_ROLE =
  'leetplus_founder_beta_activation_runtime' as const;
const FOUNDER_OPERATOR_BETA_ACTIVATION_DATABASE_OPTIONS = Object.freeze({
  schema: 'public',
  connection_limit: '2',
  pool_timeout: '5',
  connect_timeout: '5',
});
const FOUNDER_OPERATOR_BETA_ACTIVATION_DATABASE_OPTION_KEYS = new Set([
  ...Object.keys(FOUNDER_OPERATOR_BETA_ACTIVATION_DATABASE_OPTIONS),
  'sslmode',
]);

export const DESIGN_PARTNER_REQUIRED_RUNTIME_SETTINGS = {
  DESIGN_PARTNER_ISOLATED_MODE: 'true',
  ACCESS_SCOPE_ENFORCEMENT_MODE: 'ENFORCED',
  STAFF_ATTACHMENT_ACL_MODE: 'ENFORCED',
  GUEST_GAME_PIPELINE_SCHEDULER_ENABLED: 'false',
  GUEST_GAME_BONUS_LEDGER_SCHEDULER_ENABLED: 'false',
  GUEST_GAME_RETENTION_SCHEDULER_ENABLED: 'false',
  LANGAME_DAILY_SYNC_SCHEDULER_ENABLED: 'false',
  GUEST_ACTIVITY_LEDGER_SCHEDULER_ENABLED: 'false',
  REPORT_DIGEST_SCHEDULER_ENABLED: 'false',
  STAFF_TASK_RULES_SCHEDULER_ENABLED: 'false',
  STAFF_TASK_RULES_SCHEDULED_HTTP_ENABLED: 'false',
  LANGAME_SCHEDULED_HTTP_ENABLED: 'false',
  GUEST_GAME_SCHEDULED_HTTP_ENABLED: 'false',
  REPORT_DIGEST_SCHEDULED_HTTP_ENABLED: 'false',
  GUEST_GAME_LEDGER_FALLBACK_MODE: 'OFF',
  GUEST_GAME_LOOT_BOX_RECOVERY_MODE: 'OFF',
  GUEST_GAME_PIPELINE_BACKFILL_MODE: 'OFF',
  GUEST_GAME_SUPPLEMENTAL_PIPELINE_MODE: 'OFF',
  GUEST_GAME_LEDGER_FALLBACK_KILL_SWITCH: 'true',
  GUEST_GAME_LOOT_BOX_RECOVERY_KILL_SWITCH: 'true',
  GUEST_GAME_PIPELINE_BACKFILL_KILL_SWITCH: 'true',
  GUEST_GAME_SUPPLEMENTAL_PIPELINE_KILL_SWITCH: 'true',
  GUEST_GAME_REWARD_MATERIALIZER_KILL_SWITCH: 'true',
  GUEST_GAME_BONUS_LEDGER_SCHEDULER_DRY_RUN: 'true',
  GUEST_GAME_BOT_CONSUMER_DRY_RUN: 'true',
  GUEST_GAME_TG_EDGE_DRY_RUN: 'true',
  GUEST_GAME_BOT_CONSUMER_ENABLED: 'false',
  GUEST_GAME_TG_EDGE_ADAPTER_ENABLED: 'false',
  GUEST_GAME_TG_EDGE_POLLER_ENABLED: 'false',
  GUEST_GAME_TG_EDGE_POLLING_DELETE_WEBHOOK_ON_START: 'false',
  LANGAME_BONUS_ACCRUAL_ENABLED: 'false',
  GUEST_GAME_STAFF_TEST_REWARD_ACCRUAL_ENABLED: 'false',
  GUEST_GAME_DELIVERY_REAL_SEND_ENABLED: 'false',
  GUEST_GAME_TELEGRAM_DELIVERY_ENABLED: 'false',
  GUEST_GAME_MAX_DELIVERY_ENABLED: 'false',
  GUEST_GAME_MAX_DELIVERY_LIVE_CANARY_ENABLED: 'false',
  GUEST_GAME_TELEGRAM_WEBHOOK_REPLY_ENABLED: 'false',
  GUEST_GAME_TELEGRAM_WEBHOOK_REPLY_TIMEOUT_MS: '15000',
  GUEST_PORTAL_USER_CALL_ENABLED: 'false',
  GUEST_PORTAL_INCOMING_CALL_LAST4_ENABLED: 'false',
  GUEST_PORTAL_DEV_OTP_ENABLED: 'false',
  GUEST_PORTAL_OTP_REAL_SEND_ENABLED: 'false',
  GUEST_PORTAL_OTP_SMS_ENABLED: 'false',
  GUEST_PORTAL_OTP_SMS_RU_TEST_MODE: 'true',
  GUEST_PORTAL_OTP_SMS_RU_LIVE_CANARY_ENABLED: 'false',
  GUEST_PORTAL_OTP_TELEGRAM_ENABLED: 'false',
  GUEST_PORTAL_OTP_MAX_ENABLED: 'false',
  GUEST_GAME_RETENTION_LIVE_ENABLED: 'false',
  GUEST_GAME_MONITORING_ENABLED: 'false',
} as const;

const PLACEHOLDER_SECRET_PATTERNS = [
  /^change[\s_-]*me(?:[\s_-].*)?$/i,
  /^replace[\s_-]*me(?:[\s_-].*)?$/i,
  /^(?:example|placeholder|password|secret)$/i,
  /^leetplus-dev-jwt-secret-change-before-production$/i,
  /^guest-game-referral-local-secret$/i,
  /^(?:local|dev|development|test)[\s_-]*secret(?:[\s_-].*)?$/i,
] as const;

const developmentSecrets = new Map<string, string>();

type EnvironmentValues = Record<string, unknown>;

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export function resolveAccessScopeEnforcementMode(
  value: unknown,
): AccessScopeEnforcementMode {
  const normalized = stringValue(value).toUpperCase();

  if (!normalized) {
    return 'ENFORCED';
  }

  if (normalized === 'SHADOW' || normalized === 'ENFORCED') {
    return normalized;
  }

  throw new Error('ACCESS_SCOPE_ENFORCEMENT_MODE must be SHADOW or ENFORCED');
}

export function resolveStaffAttachmentAclMode(
  value: unknown,
): StaffAttachmentAclMode {
  const normalized = stringValue(value).toUpperCase();

  if (!normalized) {
    return 'ENFORCED';
  }

  if (
    normalized === 'LEGACY' ||
    normalized === 'SHADOW' ||
    normalized === 'ENFORCED'
  ) {
    return normalized;
  }

  throw new Error(
    'STAFF_ATTACHMENT_ACL_MODE must be LEGACY, SHADOW, or ENFORCED',
  );
}

export function resolveFounderOperatorBetaMode(
  value: unknown,
): FounderOperatorBetaMode {
  const normalized = stringValue(value).toUpperCase();
  if (!normalized) return 'DISABLED';
  if (
    FOUNDER_OPERATOR_BETA_MODES.includes(normalized as FounderOperatorBetaMode)
  ) {
    return normalized as FounderOperatorBetaMode;
  }
  throw new Error(
    'FOUNDER_OPERATOR_BETA_MODE must be DISABLED, PREPARE, or ACTIVE',
  );
}

export function resolveFounderOperatorBetaActivationDatabaseUrl(
  value: unknown,
): string | undefined {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value !== value.trim()
  ) {
    return undefined;
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return undefined;
  }
  if (
    parsed.protocol !== 'postgresql:' ||
    parsed.username !== FOUNDER_OPERATOR_BETA_ACTIVATION_DATABASE_ROLE ||
    parsed.password.length < MINIMUM_PRODUCTION_SECRET_LENGTH ||
    parsed.hostname.length === 0 ||
    parsed.pathname.length <= 1 ||
    parsed.hash.length > 0
  ) {
    return undefined;
  }
  const seen = new Set<string>();
  for (const [key] of parsed.searchParams) {
    if (
      seen.has(key) ||
      !FOUNDER_OPERATOR_BETA_ACTIVATION_DATABASE_OPTION_KEYS.has(key)
    ) {
      return undefined;
    }
    seen.add(key);
  }
  for (const [key, expected] of Object.entries(
    FOUNDER_OPERATOR_BETA_ACTIVATION_DATABASE_OPTIONS,
  )) {
    if (parsed.searchParams.get(key) !== expected) return undefined;
  }
  const sslMode = parsed.searchParams.get('sslmode');
  if (sslMode && sslMode !== 'require' && sslMode !== 'verify-full') {
    return undefined;
  }
  return value;
}

function productionEnvironment(config: EnvironmentValues) {
  return ENVIRONMENT_MARKER_KEYS.some((key) =>
    PRODUCTION_ENVIRONMENT_MARKERS.has(stringValue(config[key]).toLowerCase()),
  );
}

function isPlaceholderSecret(value: string) {
  return PLACEHOLDER_SECRET_PATTERNS.some((pattern) => pattern.test(value));
}

export function decodeIdentityMailEncryptionKey(
  value: unknown,
): Buffer | undefined {
  if (
    typeof value !== 'string' ||
    !IDENTITY_MAIL_ENCRYPTION_KEY_PATTERN.test(value)
  ) {
    return undefined;
  }

  const decoded = Buffer.from(value, 'base64url');
  if (
    decoded.length !== IDENTITY_MAIL_ENCRYPTION_KEY_BYTES ||
    decoded.toString('base64url') !== value
  ) {
    return undefined;
  }

  const firstByte = decoded[0];
  if (decoded.every((byte) => byte === firstByte)) {
    return undefined;
  }

  return decoded;
}

export function resolveIdentityMailAadEnvironment(
  value: unknown,
): string | undefined {
  if (
    typeof value !== 'string' ||
    !IDENTITY_MAIL_AAD_ENVIRONMENT_PATTERN.test(value)
  ) {
    return undefined;
  }

  return value;
}

/**
 * Nest calls this before constructing application providers. Production must
 * never continue with a missing, shared, placeholder, or undersized secret.
 * Values are not included in errors so startup logs cannot disclose them.
 */
export function validateEnvironment(config: EnvironmentValues) {
  const isProduction = productionEnvironment(config);
  const apiRuntimeRole = resolveApiRuntimeRole(config[API_RUNTIME_ROLE_KEY]);
  const runtimeRoleWasConfigured = Boolean(
    stringValue(config[API_RUNTIME_ROLE_KEY]),
  );
  const runtimeErrors = guestRuntimeEnvironmentErrors(config, apiRuntimeRole);
  const isolatedMode = stringValue(config.DESIGN_PARTNER_ISOLATED_MODE);
  const founderOperatorBetaMode = resolveFounderOperatorBetaMode(
    config.FOUNDER_OPERATOR_BETA_MODE,
  );

  if (isolatedMode && isolatedMode !== 'true' && isolatedMode !== 'false') {
    throw new Error(
      'DESIGN_PARTNER_ISOLATED_MODE must be exactly true or false',
    );
  }

  if (runtimeErrors.length > 0 && !isProduction && isolatedMode !== 'true') {
    throw new Error(
      `Invalid API runtime environment:\n${runtimeErrors
        .map((error) => `- ${error}`)
        .join('\n')}`,
    );
  }

  if (!isProduction && isolatedMode !== 'true') {
    if (
      !stringValue(config.FOUNDER_OPERATOR_BETA_MODE) &&
      !runtimeRoleWasConfigured
    ) {
      return config;
    }
    return {
      ...config,
      [API_RUNTIME_ROLE_KEY]: apiRuntimeRole,
      FOUNDER_OPERATOR_BETA_MODE: founderOperatorBetaMode,
    };
  }

  const errors: string[] = [
    ...runtimeErrors,
    ...dedicatedApiDatabaseEnvironmentErrors(
      config.DATABASE_URL,
      apiRuntimeRole,
    ),
  ];
  const configuredSecrets = new Map<ProductionSecretKey, string>();
  const requiredSecretKeys = productionSecretKeysForRole(apiRuntimeRole);
  const forbiddenSecretKeys =
    productionForbiddenSecretKeysForRole(apiRuntimeRole);

  let founderOperatorBetaActivationDatabaseUrl: string | undefined;
  if (founderOperatorBetaMode === 'ACTIVE') {
    founderOperatorBetaActivationDatabaseUrl =
      resolveFounderOperatorBetaActivationDatabaseUrl(
        config.FOUNDER_OPERATOR_BETA_ACTIVATION_DATABASE_URL,
      );
    if (!founderOperatorBetaActivationDatabaseUrl) {
      errors.push(
        'FOUNDER_OPERATOR_BETA_ACTIVATION_DATABASE_URL must use the dedicated activation role and exact bounded connection options in ACTIVE mode',
      );
    } else {
      try {
        const activationUrl = new URL(founderOperatorBetaActivationDatabaseUrl);
        if (
          isProduction &&
          activationUrl.searchParams.get('sslmode') !== 'verify-full'
        ) {
          errors.push(
            'FOUNDER_OPERATOR_BETA_ACTIVATION_DATABASE_URL must use sslmode=verify-full in production ACTIVE mode',
          );
        }
        const primaryDatabaseUrl = stringValue(config.DATABASE_URL);
        if (
          primaryDatabaseUrl &&
          new URL(primaryDatabaseUrl).username ===
            FOUNDER_OPERATOR_BETA_ACTIVATION_DATABASE_ROLE
        ) {
          errors.push(
            'DATABASE_URL must not use the dedicated founder activation role',
          );
        }
      } catch {
        errors.push('DATABASE_URL must be a valid PostgreSQL URL');
      }
    }
  }

  for (const key of requiredSecretKeys) {
    const value = stringValue(config[key]);

    if (!value) {
      errors.push(`${key} is required`);
      continue;
    }

    configuredSecrets.set(key, value);

    if (value.length < MINIMUM_PRODUCTION_SECRET_LENGTH) {
      errors.push(
        `${key} must contain at least ${MINIMUM_PRODUCTION_SECRET_LENGTH} characters`,
      );
    }

    if (isPlaceholderSecret(value)) {
      errors.push(`${key} must not contain a placeholder value`);
    }
  }

  for (const key of forbiddenSecretKeys) {
    if (stringValue(config[key])) {
      errors.push(`${key} must be absent in ${apiRuntimeRole} API runtime`);
    }
  }

  const keysByValue = new Map<string, ProductionSecretKey[]>();
  for (const [key, value] of configuredSecrets) {
    const matchingKeys = keysByValue.get(value) ?? [];
    matchingKeys.push(key);
    keysByValue.set(value, matchingKeys);
  }

  for (const keys of keysByValue.values()) {
    if (keys.length > 1) {
      errors.push(`${keys.join(', ')} must use independent values`);
    }
  }
  const identityEmailFingerprintKey = configuredSecrets.get(
    'IDENTITY_EMAIL_FINGERPRINT_HMAC_KEY',
  );
  if (
    identityEmailFingerprintKey &&
    Buffer.byteLength(identityEmailFingerprintKey, 'utf8') > 4096
  ) {
    errors.push(
      'IDENTITY_EMAIL_FINGERPRINT_HMAC_KEY must not exceed 4096 bytes',
    );
  }
  const identityMailEncryptionKey = configuredSecrets.get(
    'IDENTITY_MAIL_ENCRYPTION_KEY',
  );
  if (
    identityMailEncryptionKey &&
    !decodeIdentityMailEncryptionKey(config.IDENTITY_MAIL_ENCRYPTION_KEY)
  ) {
    errors.push(
      'IDENTITY_MAIL_ENCRYPTION_KEY must be an exact unpadded base64url encoding of a non-degenerate 32-byte key',
    );
  }

  const releaseSha = stringValue(config.RELEASE_SHA);
  const buildTime = stringValue(config.BUILD_TIME);
  const expectedMigration = stringValue(config.EXPECTED_DATABASE_MIGRATION);
  const expectedMigrationCount = stringValue(
    config.EXPECTED_DATABASE_MIGRATION_COUNT,
  );
  const langameDiscrepancyLogRoot = resolveProductionLangameDiscrepancyLogRoot(
    config[LANGAME_DISCREPANCY_LOG_ROOT_KEY],
  );
  const apiBindHost = stringValue(config[API_BIND_HOST_KEY]);
  const identityEmailFingerprintKeyVersion = stringValue(
    config.IDENTITY_EMAIL_FINGERPRINT_HMAC_KEY_VERSION,
  );
  const identityMailEncryptionKeyVersion =
    typeof config.IDENTITY_MAIL_ENCRYPTION_KEY_VERSION === 'string'
      ? config.IDENTITY_MAIL_ENCRYPTION_KEY_VERSION
      : '';
  const identityMailAadEnvironment = resolveIdentityMailAadEnvironment(
    config.IDENTITY_MAIL_AAD_ENVIRONMENT,
  );
  const configuredAccessScopeMode = stringValue(
    config.ACCESS_SCOPE_ENFORCEMENT_MODE,
  );
  const configuredStaffAttachmentAclMode = stringValue(
    config.STAFF_ATTACHMENT_ACL_MODE,
  );
  let accessScopeEnforcementMode: AccessScopeEnforcementMode = 'ENFORCED';
  let staffAttachmentAclMode: StaffAttachmentAclMode = 'ENFORCED';

  if (!configuredAccessScopeMode) {
    errors.push('ACCESS_SCOPE_ENFORCEMENT_MODE is required');
  } else {
    try {
      accessScopeEnforcementMode = resolveAccessScopeEnforcementMode(
        configuredAccessScopeMode,
      );
    } catch {
      errors.push('ACCESS_SCOPE_ENFORCEMENT_MODE must be SHADOW or ENFORCED');
    }
  }

  if (!configuredStaffAttachmentAclMode) {
    errors.push('STAFF_ATTACHMENT_ACL_MODE is required');
  } else {
    try {
      staffAttachmentAclMode = resolveStaffAttachmentAclMode(
        configuredStaffAttachmentAclMode,
      );
    } catch {
      errors.push(
        'STAFF_ATTACHMENT_ACL_MODE must be LEGACY, SHADOW, or ENFORCED',
      );
    }
  }

  if (!/^[0-9a-f]{40}$/.test(releaseSha)) {
    errors.push('RELEASE_SHA must be the full lowercase 40-character Git SHA');
  }

  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(buildTime) ||
    Number.isNaN(Date.parse(buildTime))
  ) {
    errors.push('BUILD_TIME must be a UTC ISO-8601 timestamp');
  }

  if (!/^\d{14}_[a-z0-9_]+$/.test(expectedMigration)) {
    errors.push(
      'EXPECTED_DATABASE_MIGRATION must name the release migration directory',
    );
  }

  if (!/^[1-9]\d*$/.test(expectedMigrationCount)) {
    errors.push('EXPECTED_DATABASE_MIGRATION_COUNT must be a positive integer');
  }
  if (!langameDiscrepancyLogRoot) {
    errors.push(
      'LANGAME_DISCREPANCY_LOG_ROOT must be a non-root absolute POSIX path without traversal segments',
    );
  }
  if (apiBindHost !== PRODUCTION_API_BIND_HOST) {
    errors.push(
      `${API_BIND_HOST_KEY} must equal ${PRODUCTION_API_BIND_HOST} in production`,
    );
  }
  if (
    requiredSecretKeys.includes('IDENTITY_EMAIL_FINGERPRINT_HMAC_KEY') &&
    identityEmailFingerprintKeyVersion !== 'v1'
  ) {
    errors.push('IDENTITY_EMAIL_FINGERPRINT_HMAC_KEY_VERSION must equal v1');
  }
  if (
    requiredSecretKeys.includes('IDENTITY_MAIL_ENCRYPTION_KEY') &&
    identityMailEncryptionKeyVersion !== IDENTITY_MAIL_ENCRYPTION_KEY_VERSION
  ) {
    errors.push('IDENTITY_MAIL_ENCRYPTION_KEY_VERSION must equal v1');
  }
  if (
    requiredSecretKeys.includes('IDENTITY_MAIL_ENCRYPTION_KEY') &&
    !identityMailAadEnvironment
  ) {
    errors.push(
      'IDENTITY_MAIL_AAD_ENVIRONMENT must be an exact lowercase environment identifier',
    );
  }

  if (isolatedMode === 'true') {
    for (const [key, expected] of Object.entries(
      DESIGN_PARTNER_REQUIRED_RUNTIME_SETTINGS,
    )) {
      const actual = stringValue(config[key]);
      if (actual !== expected) {
        errors.push(`${key} must equal ${expected} in design-partner mode`);
      }
    }
    if (stringValue(config.DESIGN_PARTNER_MANIFEST_HMAC_KEY)) {
      errors.push(
        'DESIGN_PARTNER_MANIFEST_HMAC_KEY must be absent from design-partner runtime',
      );
    }
    const tenantSlug = stringValue(config.DESIGN_PARTNER_TENANT_SLUG);
    const tenantDomain = stringValue(config.DESIGN_PARTNER_TENANT_DOMAIN);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tenantSlug)) {
      errors.push(
        'DESIGN_PARTNER_TENANT_SLUG must be an exact lowercase slug in design-partner mode',
      );
    }
    if (tenantDomain !== `${tenantSlug}.leetplus.ru`) {
      errors.push(
        'DESIGN_PARTNER_TENANT_DOMAIN must equal <tenant-slug>.leetplus.ru in design-partner mode',
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Invalid production environment:\n${errors
        .map((error) => `- ${error}`)
        .join('\n')}`,
    );
  }

  return {
    ...config,
    [API_RUNTIME_ROLE_KEY]: apiRuntimeRole,
    ...Object.fromEntries(configuredSecrets),
    RELEASE_SHA: releaseSha,
    BUILD_TIME: buildTime,
    EXPECTED_DATABASE_MIGRATION: expectedMigration,
    EXPECTED_DATABASE_MIGRATION_COUNT: expectedMigrationCount,
    LANGAME_DISCREPANCY_LOG_ROOT: langameDiscrepancyLogRoot,
    API_BIND_HOST: apiBindHost,
    IDENTITY_EMAIL_FINGERPRINT_HMAC_KEY_VERSION:
      identityEmailFingerprintKeyVersion,
    IDENTITY_MAIL_ENCRYPTION_KEY_VERSION: identityMailEncryptionKeyVersion,
    IDENTITY_MAIL_AAD_ENVIRONMENT: identityMailAadEnvironment,
    ACCESS_SCOPE_ENFORCEMENT_MODE: accessScopeEnforcementMode,
    STAFF_ATTACHMENT_ACL_MODE: staffAttachmentAclMode,
    DESIGN_PARTNER_ISOLATED_MODE: isolatedMode || undefined,
    FOUNDER_OPERATOR_BETA_MODE: founderOperatorBetaMode,
    FOUNDER_OPERATOR_BETA_ACTIVATION_DATABASE_URL:
      founderOperatorBetaActivationDatabaseUrl,
  };
}

function productionSecretKeysForRole(
  role: ReturnType<typeof resolveApiRuntimeRole>,
): readonly ProductionSecretKey[] {
  if (role === 'GUEST') return GUEST_RUNTIME_PRODUCTION_SECRET_KEYS;
  if (role === 'CORPORATE') return CORPORATE_RUNTIME_PRODUCTION_SECRET_KEYS;
  return PRODUCTION_SECRET_KEYS;
}

function productionForbiddenSecretKeysForRole(
  role: ReturnType<typeof resolveApiRuntimeRole>,
): readonly ProductionSecretKey[] {
  if (role === 'GUEST') return GUEST_RUNTIME_FORBIDDEN_SECRET_KEYS;
  if (role === 'CORPORATE') return CORPORATE_RUNTIME_FORBIDDEN_SECRET_KEYS;
  return [];
}

export function isProductionConfig(configService: ConfigService) {
  return productionEnvironment(
    Object.fromEntries(
      ENVIRONMENT_MARKER_KEYS.map((key) => [
        key,
        configService.get<string>(key) ?? process.env[key],
      ]),
    ),
  );
}

/**
 * Local/test processes receive an unpredictable, process-local fallback.
 * Production never receives a fallback: the startup validator and this
 * resolver both fail closed.
 */
export function resolveSecuritySecret(
  configService: ConfigService,
  key: FallbackProductionSecretKey,
  nonProductionFallbackKeys: readonly FallbackProductionSecretKey[] = [],
) {
  if ((key as string) === 'IDENTITY_MAIL_ENCRYPTION_KEY') {
    throw new Error(
      'IDENTITY_MAIL_ENCRYPTION_KEY cannot use a fallback secret resolver',
    );
  }

  const configured = configService.get<string>(key)?.trim();
  if (configured) {
    return configured;
  }

  if (isProductionConfig(configService)) {
    throw new Error(`${key} is required in production`);
  }

  for (const fallbackKey of nonProductionFallbackKeys) {
    const fallback = configService.get<string>(fallbackKey)?.trim();
    if (fallback) {
      return fallback;
    }
  }

  const existing = developmentSecrets.get(key);
  if (existing) {
    return existing;
  }

  const generated = randomBytes(32).toString('base64url');
  developmentSecrets.set(key, generated);
  return generated;
}

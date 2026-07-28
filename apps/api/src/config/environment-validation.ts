import type { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';

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
  'SYNC_SERVICE_TOKEN',
] as const;

export type ProductionSecretKey = (typeof PRODUCTION_SECRET_KEYS)[number];

export const PRODUCTION_RELEASE_KEYS = [
  'RELEASE_SHA',
  'BUILD_TIME',
  'EXPECTED_DATABASE_MIGRATION',
  'EXPECTED_DATABASE_MIGRATION_COUNT',
] as const;

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

function productionEnvironment(config: EnvironmentValues) {
  return ENVIRONMENT_MARKER_KEYS.some((key) =>
    PRODUCTION_ENVIRONMENT_MARKERS.has(stringValue(config[key]).toLowerCase()),
  );
}

function isPlaceholderSecret(value: string) {
  return PLACEHOLDER_SECRET_PATTERNS.some((pattern) => pattern.test(value));
}

/**
 * Nest calls this before constructing application providers. Production must
 * never continue with a missing, shared, placeholder, or undersized secret.
 * Values are not included in errors so startup logs cannot disclose them.
 */
export function validateEnvironment(config: EnvironmentValues) {
  const isProduction = productionEnvironment(config);
  const isolatedMode = stringValue(config.DESIGN_PARTNER_ISOLATED_MODE);

  if (isolatedMode && isolatedMode !== 'true' && isolatedMode !== 'false') {
    throw new Error(
      'DESIGN_PARTNER_ISOLATED_MODE must be exactly true or false',
    );
  }

  if (!isProduction && isolatedMode !== 'true') {
    return config;
  }

  const errors: string[] = [];
  const configuredSecrets = new Map<ProductionSecretKey, string>();

  for (const key of PRODUCTION_SECRET_KEYS) {
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

  const releaseSha = stringValue(config.RELEASE_SHA);
  const buildTime = stringValue(config.BUILD_TIME);
  const expectedMigration = stringValue(config.EXPECTED_DATABASE_MIGRATION);
  const expectedMigrationCount = stringValue(
    config.EXPECTED_DATABASE_MIGRATION_COUNT,
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

  if (!/^[0-9a-f]{40}$/i.test(releaseSha)) {
    errors.push('RELEASE_SHA must be the full 40-character Git SHA');
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
    ...Object.fromEntries(configuredSecrets),
    RELEASE_SHA: releaseSha,
    BUILD_TIME: buildTime,
    EXPECTED_DATABASE_MIGRATION: expectedMigration,
    EXPECTED_DATABASE_MIGRATION_COUNT: expectedMigrationCount,
    ACCESS_SCOPE_ENFORCEMENT_MODE: accessScopeEnforcementMode,
    STAFF_ATTACHMENT_ACL_MODE: staffAttachmentAclMode,
    DESIGN_PARTNER_ISOLATED_MODE: isolatedMode || undefined,
  };
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
  key: ProductionSecretKey,
  nonProductionFallbackKeys: readonly ProductionSecretKey[] = [],
) {
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

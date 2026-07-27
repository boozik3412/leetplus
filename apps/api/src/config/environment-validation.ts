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
  if (!productionEnvironment(config)) {
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
  let accessScopeEnforcementMode: AccessScopeEnforcementMode = 'ENFORCED';

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

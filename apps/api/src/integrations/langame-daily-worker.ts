import type {
  DailySyncResult,
  LangameDailySyncService,
} from './langame-daily-sync.service';
import type { GuestActivityLedgerService } from '../guest-gamification/guest-activity-ledger.service';
import type { GuestGameDataRetentionService } from '../guest-gamification/guest-game-data-retention.service';

export type LangameDailyWorkerLogger = Pick<Console, 'error' | 'log' | 'warn'>;

export type LangameDailyWorkerConfig = Readonly<{
  tenantSlug: string;
  date: string | null;
  canary: boolean;
  activityRecoveryEnabled: boolean;
  activityRecoveryLimit: number;
  retentionEnabled: boolean;
  retentionLive: boolean;
}>;

type LangameDailyMaintenanceServices = {
  activityLedger: Pick<GuestActivityLedgerService, 'enqueueDueRecoverySyncs'>;
  retention: Pick<GuestGameDataRetentionService, 'runTenantMaintenance'>;
};

const workerEnabledKey = 'LANGAME_DAILY_WORKER_ENABLED';
const workerLiveKey = 'LANGAME_DAILY_WORKER_LIVE';
const apiSchedulerKey = 'LANGAME_DAILY_SYNC_SCHEDULER_ENABLED';
const scheduledHttpKey = 'LANGAME_SCHEDULED_HTTP_ENABLED';
const tenantSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const businessDatePattern = /^\d{4}-\d{2}-\d{2}$/;

/**
 * This process is intentionally the only unattended Langame daily-sync owner.
 * API slots and token-only scheduled HTTP must remain disabled even while the
 * dedicated worker is live: blue and green are both normally running.
 */
export function loadLangameDailyWorkerConfig(
  env: NodeJS.ProcessEnv = process.env,
): LangameDailyWorkerConfig {
  requireBoolean(env, workerEnabledKey, true);
  requireBoolean(env, workerLiveKey, true);
  requireBoolean(env, apiSchedulerKey, false);
  requireBoolean(env, scheduledHttpKey, false);

  const tenantSlug = env.LANGAME_DAILY_WORKER_TENANT_SLUG?.trim() ?? '';
  if (!tenantSlugPattern.test(tenantSlug)) {
    throw new Error(
      'LANGAME_DAILY_WORKER_TENANT_SLUG must be one exact lowercase slug',
    );
  }

  const canary = parseBoolean(
    env.LANGAME_DAILY_WORKER_CANARY,
    false,
    'LANGAME_DAILY_WORKER_CANARY',
  );
  const date = optional(env.LANGAME_DAILY_WORKER_DATE);
  if (date && !businessDatePattern.test(date)) {
    throw new Error('LANGAME_DAILY_WORKER_DATE must be YYYY-MM-DD');
  }
  if (date && !canary) {
    throw new Error('LANGAME_DAILY_WORKER_DATE is allowed only in canary mode');
  }

  const activityRecoveryEnabled = parseBoolean(
    env.LANGAME_DAILY_WORKER_ACTIVITY_RECOVERY_ENABLED,
    false,
    'LANGAME_DAILY_WORKER_ACTIVITY_RECOVERY_ENABLED',
  );
  const retentionEnabled = parseBoolean(
    env.LANGAME_DAILY_WORKER_RETENTION_ENABLED,
    false,
    'LANGAME_DAILY_WORKER_RETENTION_ENABLED',
  );
  const retentionLive = parseBoolean(
    env.LANGAME_DAILY_WORKER_RETENTION_LIVE,
    false,
    'LANGAME_DAILY_WORKER_RETENTION_LIVE',
  );
  if (
    canary &&
    (activityRecoveryEnabled || retentionEnabled || retentionLive)
  ) {
    throw new Error('Daily maintenance must stay disabled in canary mode');
  }
  if (retentionLive && !retentionEnabled) {
    throw new Error(
      'LANGAME_DAILY_WORKER_RETENTION_ENABLED=true is required for live retention',
    );
  }

  return {
    tenantSlug,
    date,
    canary,
    activityRecoveryEnabled,
    activityRecoveryLimit: boundedPositiveInt(
      env.LANGAME_DAILY_WORKER_ACTIVITY_RECOVERY_LIMIT,
      20,
      100,
      'LANGAME_DAILY_WORKER_ACTIVITY_RECOVERY_LIMIT',
    ),
    retentionEnabled,
    retentionLive,
  };
}

export async function runLangameDailyWorkerOnce(
  service: Pick<LangameDailySyncService, 'runDailySync'>,
  env: NodeJS.ProcessEnv = process.env,
  logger: LangameDailyWorkerLogger = console,
): Promise<DailySyncResult> {
  const config = loadLangameDailyWorkerConfig(env);
  const result = await service.runDailySync({
    tenantSlug: config.tenantSlug,
    ...(config.date ? { date: config.date } : {}),
  });
  const tenant = result.results[0];

  logger.log(
    [
      'Langame daily worker finished:',
      `date=${result.date}`,
      `tenant=${config.tenantSlug}`,
      `canary=${config.canary}`,
      `processed=${result.processedTenants}/${result.tenants}`,
      `skipped=${result.skippedTenants}`,
    ].join(' '),
  );

  if (
    result.tenants !== 1 ||
    result.processedTenants !== 1 ||
    result.skippedTenants !== 0 ||
    result.results.length !== 1 ||
    !tenant ||
    tenant.slug !== config.tenantSlug ||
    tenant.status !== 'PROCESSED'
  ) {
    throw new Error(
      `Worker tenant scope was not processed exactly once: tenants=${result.tenants}, processed=${result.processedTenants}, skipped=${result.skippedTenants}`,
    );
  }

  const failedScopes = tenant.scopes.filter(
    (scope) => scope.status === 'FAILED',
  );
  if (failedScopes.length > 0) {
    throw new Error(
      `Worker tick reported failed scopes: ${failedScopes.map((scope) => scope.scope).join(',')}`,
    );
  }

  return result;
}

/**
 * Runs maintenance only after the exact daily-sync tenant has passed all
 * admission and scope checks. Canary runs are deliberately read-only.
 */
export async function runLangameDailyMaintenanceOnce(
  result: DailySyncResult,
  services: LangameDailyMaintenanceServices,
  env: NodeJS.ProcessEnv = process.env,
  logger: LangameDailyWorkerLogger = console,
  now = new Date(),
) {
  const config = loadLangameDailyWorkerConfig(env);
  const tenant = result.results[0];
  if (
    result.tenants !== 1 ||
    result.processedTenants !== 1 ||
    result.results.length !== 1 ||
    !tenant ||
    tenant.slug !== config.tenantSlug ||
    tenant.status !== 'PROCESSED'
  ) {
    throw new Error(
      'Daily maintenance requires one successfully synced tenant',
    );
  }

  if (config.canary) {
    return {
      tenantId: tenant.tenantId,
      recovery: null,
      retention: null,
      skipped: true,
    };
  }

  const recovery = config.activityRecoveryEnabled
    ? await services.activityLedger.enqueueDueRecoverySyncs(
        config.activityRecoveryLimit,
        now,
        tenant.tenantId,
      )
    : null;
  const retention = config.retentionEnabled
    ? await services.retention.runTenantMaintenance({
        tenantId: tenant.tenantId,
        now,
        liveRequested: config.retentionLive,
      })
    : null;

  logger.log(
    [
      'Langame daily maintenance finished:',
      `recoveryScanned=${recovery?.scanned ?? 0}`,
      `recoveryQueued=${recovery?.queued ?? 0}`,
      `walletOpeningsRecovered=${retention?.recoveredOpenings ?? 0}`,
      `orphanClaimsExpired=${retention?.expiredOrphanClaims ?? 0}`,
      `walletItemsDeleted=${retention?.deletedWalletItems ?? 0}`,
      `retention=${retention?.retention.status ?? 'DISABLED'}`,
    ].join(' '),
  );

  return {
    tenantId: tenant.tenantId,
    recovery,
    retention,
    skipped: false,
  };
}

function optional(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function requireBoolean(
  env: NodeJS.ProcessEnv,
  key: string,
  expected: boolean,
) {
  const value = env[key]?.trim();
  if (!value) {
    throw new Error(`${key}=${String(expected)} is required`);
  }
  if (parseBoolean(value, expected, key) !== expected) {
    throw new Error(`${key}=${String(expected)} is required`);
  }
}

function parseBoolean(
  value: string | undefined,
  fallback: boolean,
  key: string,
) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  throw new Error(`${key} must be a boolean`);
}

function boundedPositiveInt(
  value: string | undefined,
  fallback: number,
  maximum: number,
  key: string,
) {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new Error(`${key} must be an integer between 1 and ${maximum}`);
  }
  return parsed;
}

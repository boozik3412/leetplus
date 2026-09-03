import type {
  DailySyncResult,
  LangameDailySyncService,
} from './langame-daily-sync.service';

export type LangameDailyWorkerLogger = Pick<Console, 'error' | 'log' | 'warn'>;

export type LangameDailyWorkerConfig = Readonly<{
  tenantSlug: string;
  date: string | null;
  canary: boolean;
}>;

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

  return { tenantSlug, date, canary };
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

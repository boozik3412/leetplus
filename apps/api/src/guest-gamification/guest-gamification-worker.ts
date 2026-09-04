import { TenantCustomerStage, TenantLifecycleStatus } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { GuestActivityLedgerService } from './guest-activity-ledger.service';
import type { GuestGamificationService } from './guest-gamification.service';
import type { GuestGameQualityMonitoringService } from './guest-game-quality-monitoring.service';

export type GuestGamificationWorkerLogger = Pick<
  Console,
  'error' | 'log' | 'warn'
>;

export type GuestGamificationWorkerConfig = Readonly<{
  tenantId: string | null;
  tenantSlug: string | null;
  canary: boolean;
  activityLimit: number;
  pipelineLimit: number;
  supplementalLimit: number;
  monitoringEnabled: boolean;
  monitoringIntervalMs: number;
}>;

type GuestGamificationWorkerServices = {
  prisma: Pick<PrismaService, 'tenant' | 'guestGameQualitySnapshot'>;
  activityLedger: Pick<GuestActivityLedgerService, 'processQueuedSyncJobs'>;
  gamification: Pick<
    GuestGamificationService,
    'runSnapshotPipelineScheduled' | 'runSupplementalPipelineScheduled'
  >;
  monitoring: Pick<GuestGameQualityMonitoringService, 'collectTenant'>;
};

const workerEnabledKey = 'GUEST_GAMIFICATION_WORKER_ENABLED';
const tenantSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * The active-slot systemd worker is the only unattended owner of this path.
 * Both long-lived API slots stay read/request-only for these schedulers.
 */
export function loadGuestGamificationWorkerConfig(
  env: NodeJS.ProcessEnv = process.env,
): GuestGamificationWorkerConfig {
  requireBoolean(env, workerEnabledKey, true);
  requireBoolean(env, 'GUEST_ACTIVITY_LEDGER_SCHEDULER_ENABLED', false);
  requireBoolean(env, 'GUEST_GAME_PIPELINE_SCHEDULER_ENABLED', false);
  requireBoolean(env, 'GUEST_GAME_MONITORING_ENABLED', false);

  if ((env.GUEST_GAME_SUPPLEMENTAL_PIPELINE_MODE ?? '').trim() !== 'OFF') {
    throw new Error('GUEST_GAME_SUPPLEMENTAL_PIPELINE_MODE=OFF is required');
  }

  const tenantId = optional(env.GUEST_BONUS_LEDGER_WORKER_TENANT_ID);
  const tenantSlug = optional(env.GUEST_BONUS_LEDGER_WORKER_TENANT_SLUG);
  if (Boolean(tenantId) === Boolean(tenantSlug)) {
    throw new Error('Exactly one worker tenant ID or tenant slug is required');
  }
  if (tenantId && !uuidPattern.test(tenantId)) {
    throw new Error('Worker tenant ID must be a UUID');
  }
  if (tenantSlug && !tenantSlugPattern.test(tenantSlug)) {
    throw new Error('Worker tenant slug must be a lowercase slug');
  }

  const canary = parseBoolean(
    env.GUEST_GAMIFICATION_WORKER_CANARY,
    true,
    'GUEST_GAMIFICATION_WORKER_CANARY',
  );
  const activityLimit = boundedPositiveInt(
    env.GUEST_GAMIFICATION_WORKER_ACTIVITY_LIMIT,
    1,
    10,
    'GUEST_GAMIFICATION_WORKER_ACTIVITY_LIMIT',
  );
  const pipelineLimit = boundedPositiveInt(
    env.GUEST_GAMIFICATION_WORKER_PIPELINE_LIMIT,
    canary ? 1 : 30,
    30,
    'GUEST_GAMIFICATION_WORKER_PIPELINE_LIMIT',
  );
  const supplementalLimit = boundedPositiveInt(
    env.GUEST_GAMIFICATION_WORKER_SUPPLEMENTAL_LIMIT,
    canary ? 1 : 30,
    100,
    'GUEST_GAMIFICATION_WORKER_SUPPLEMENTAL_LIMIT',
  );
  if (
    canary &&
    [activityLimit, pipelineLimit, supplementalLimit].some(
      (value) => value !== 1,
    )
  ) {
    throw new Error(
      'All gamification worker limits must equal 1 in canary mode',
    );
  }

  const supplementalMode = optional(
    env.GUEST_GAMIFICATION_WORKER_SUPPLEMENTAL_MODE,
  )?.toUpperCase();
  const expectedSupplementalMode = canary ? 'SHADOW' : 'LIVE';
  if (supplementalMode !== expectedSupplementalMode) {
    throw new Error(
      `GUEST_GAMIFICATION_WORKER_SUPPLEMENTAL_MODE=${expectedSupplementalMode} is required`,
    );
  }

  const monitoringEnabled = parseBoolean(
    env.GUEST_GAMIFICATION_WORKER_MONITORING_ENABLED,
    false,
    'GUEST_GAMIFICATION_WORKER_MONITORING_ENABLED',
  );
  if (canary && monitoringEnabled) {
    throw new Error(
      'Gamification monitoring must stay disabled in canary mode',
    );
  }

  return {
    tenantId,
    tenantSlug,
    canary,
    activityLimit,
    pipelineLimit,
    supplementalLimit,
    monitoringEnabled,
    monitoringIntervalMs: boundedPositiveInt(
      env.GUEST_GAMIFICATION_WORKER_MONITORING_INTERVAL_MS,
      5 * 60 * 1_000,
      60 * 60 * 1_000,
      'GUEST_GAMIFICATION_WORKER_MONITORING_INTERVAL_MS',
      60_000,
    ),
  };
}

export async function runGuestGamificationWorkerOnce(
  services: GuestGamificationWorkerServices,
  env: NodeJS.ProcessEnv = process.env,
  logger: GuestGamificationWorkerLogger = console,
  now = new Date(),
) {
  const config = loadGuestGamificationWorkerConfig(env);
  const tenants = await services.prisma.tenant.findMany({
    where: {
      ...(config.tenantId ? { id: config.tenantId } : {}),
      ...(config.tenantSlug ? { slug: config.tenantSlug } : {}),
    },
    select: {
      id: true,
      slug: true,
      status: true,
      customerStage: true,
    },
    take: 2,
  });
  const tenant = tenants[0];
  if (
    tenants.length !== 1 ||
    !tenant ||
    tenant.status !== TenantLifecycleStatus.ACTIVE ||
    tenant.customerStage !== TenantCustomerStage.INTERNAL
  ) {
    throw new Error(
      `Worker tenant scope is not one active INTERNAL tenant: matches=${tenants.length}`,
    );
  }

  const activity = await services.activityLedger.processQueuedSyncJobs(
    config.activityLimit,
    `gamification-worker-${process.pid}`,
    tenant.id,
  );
  if (activity.failed > 0) {
    throw new Error(
      `Activity queue reported terminal failures: failed=${activity.failed}`,
    );
  }
  if (activity.retried > 0) {
    logger.warn(
      `Guest activity queue scheduled retries: retried=${activity.retried}`,
    );
  }

  const pipeline = await services.gamification.runSnapshotPipelineScheduled({
    tenantId: tenant.id,
    dryRunOnly: config.canary,
    limit: config.pipelineLimit,
  });
  if (
    pipeline.checkedTenants !== 1 ||
    pipeline.processedTenants !== 1 ||
    pipeline.erroredTenants > 0 ||
    pipeline.erroredFacts > 0
  ) {
    throw new Error(
      `Snapshot pipeline failed exact tenant processing: checked=${pipeline.checkedTenants}, processed=${pipeline.processedTenants}, tenantsFailed=${pipeline.erroredTenants}, factsFailed=${pipeline.erroredFacts}`,
    );
  }

  const supplemental =
    await services.gamification.runSupplementalPipelineScheduled({
      tenantId: tenant.id,
      mode: config.canary ? 'SHADOW' : 'LIVE',
      factTypes: ['BALANCE_TOPUP'],
      limit: config.supplementalLimit,
    });
  if (
    supplemental.checkedTenants !== 1 ||
    supplemental.erroredTenants > 0 ||
    supplemental.failedFacts > 0
  ) {
    throw new Error(
      `Supplemental pipeline failed exact tenant processing: checked=${supplemental.checkedTenants}, tenantsFailed=${supplemental.erroredTenants}, factsFailed=${supplemental.failedFacts}`,
    );
  }

  let monitoring: { status: string } | null = null;
  if (config.monitoringEnabled) {
    const latest = await services.prisma.guestGameQualitySnapshot.findFirst({
      where: { tenantId: tenant.id },
      select: { measuredAt: true },
      orderBy: { measuredAt: 'desc' },
    });
    if (
      !latest ||
      now.getTime() - latest.measuredAt.getTime() >= config.monitoringIntervalMs
    ) {
      monitoring = await services.monitoring.collectTenant(tenant.id, now);
      if (monitoring.status !== 'SUCCESS') {
        throw new Error('Gamification quality monitoring did not succeed');
      }
    }
  }

  logger.log(
    [
      'Guest gamification worker finished:',
      `tenant=${tenant.slug}`,
      `canary=${config.canary}`,
      `activity=${activity.processed}`,
      `activitySuccess=${activity.success}`,
      `activityRetry=${activity.retried}`,
      `pipelineFacts=${pipeline.processedFacts}`,
      `pipelineRewards=${pipeline.queuedRewards}`,
      `supplementalFacts=${supplemental.processedFacts}`,
      `supplementalRewards=${supplemental.createdRewards}`,
      `monitoring=${monitoring ? 'COLLECTED' : 'SKIPPED'}`,
    ].join(' '),
  );

  return { tenantId: tenant.id, activity, pipeline, supplemental, monitoring };
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
  if (!value || parseBoolean(value, expected, key) !== expected) {
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
  minimum = 1,
) {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(
      `${key} must be an integer between ${minimum} and ${maximum}`,
    );
  }
  return parsed;
}

import { TenantCustomerStage, TenantLifecycleStatus } from '@prisma/client';
import {
  loadGuestGamificationWorkerConfig,
  runGuestGamificationWorkerOnce,
} from './guest-gamification-worker';

function baseEnv(): NodeJS.ProcessEnv {
  return {
    GUEST_GAMIFICATION_WORKER_ENABLED: 'true',
    GUEST_GAMIFICATION_WORKER_CANARY: 'true',
    GUEST_GAMIFICATION_WORKER_ACTIVITY_LIMIT: '1',
    GUEST_GAMIFICATION_WORKER_PIPELINE_LIMIT: '1',
    GUEST_GAMIFICATION_WORKER_SUPPLEMENTAL_MODE: 'SHADOW',
    GUEST_GAMIFICATION_WORKER_SUPPLEMENTAL_LIMIT: '1',
    GUEST_GAMIFICATION_WORKER_MONITORING_ENABLED: 'false',
    GUEST_ACTIVITY_LEDGER_SCHEDULER_ENABLED: 'false',
    GUEST_GAME_PIPELINE_SCHEDULER_ENABLED: 'false',
    GUEST_GAME_SUPPLEMENTAL_PIPELINE_MODE: 'OFF',
    GUEST_GAME_MONITORING_ENABLED: 'false',
    GUEST_BONUS_LEDGER_WORKER_TENANT_SLUG: 'demo',
  };
}

function services() {
  return {
    prisma: {
      tenant: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'tenant-1',
            slug: 'demo',
            status: TenantLifecycleStatus.ACTIVE,
            customerStage: TenantCustomerStage.INTERNAL,
          },
        ]),
      },
      guestGameQualitySnapshot: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    },
    activityLedger: {
      processQueuedSyncJobs: jest.fn().mockResolvedValue({
        processed: 1,
        success: 1,
        retried: 0,
        failed: 0,
        skipped: 0,
        rerun: 0,
        results: [],
      }),
    },
    gamification: {
      runSnapshotPipelineScheduled: jest.fn().mockResolvedValue({
        checkedTenants: 1,
        processedTenants: 1,
        skippedTenants: 0,
        erroredTenants: 0,
        erroredFacts: 0,
        processedFacts: 1,
        queuedRewards: 0,
      }),
      runSupplementalPipelineScheduled: jest.fn().mockResolvedValue({
        checkedTenants: 1,
        processedTenants: 1,
        skippedTenants: 0,
        erroredTenants: 0,
        failedFacts: 0,
        processedFacts: 1,
        createdRewards: 0,
      }),
    },
    monitoring: {
      collectTenant: jest.fn().mockResolvedValue({ status: 'SUCCESS' }),
    },
  };
}

describe('guest gamification singleton worker', () => {
  it('requires all competing API schedulers to remain disabled', () => {
    expect(() =>
      loadGuestGamificationWorkerConfig({
        ...baseEnv(),
        GUEST_GAME_PIPELINE_SCHEDULER_ENABLED: 'true',
      }),
    ).toThrow('GUEST_GAME_PIPELINE_SCHEDULER_ENABLED=false is required');
    expect(() =>
      loadGuestGamificationWorkerConfig({
        ...baseEnv(),
        GUEST_GAME_SUPPLEMENTAL_PIPELINE_MODE: 'LIVE',
      }),
    ).toThrow('GUEST_GAME_SUPPLEMENTAL_PIPELINE_MODE=OFF is required');
  });

  it('forces bounded read/shadow canary settings', () => {
    expect(() =>
      loadGuestGamificationWorkerConfig({
        ...baseEnv(),
        GUEST_GAMIFICATION_WORKER_PIPELINE_LIMIT: '2',
      }),
    ).toThrow('limits must equal 1');
    expect(() =>
      loadGuestGamificationWorkerConfig({
        ...baseEnv(),
        GUEST_GAMIFICATION_WORKER_SUPPLEMENTAL_MODE: 'LIVE',
      }),
    ).toThrow('SUPPLEMENTAL_MODE=SHADOW');
  });

  it('keeps activity recovery at one profile in stable mode', () => {
    expect(() =>
      loadGuestGamificationWorkerConfig({
        ...baseEnv(),
        GUEST_GAMIFICATION_WORKER_CANARY: 'false',
        GUEST_GAMIFICATION_WORKER_ACTIVITY_LIMIT: '3',
        GUEST_GAMIFICATION_WORKER_PIPELINE_LIMIT: '30',
        GUEST_GAMIFICATION_WORKER_SUPPLEMENTAL_MODE: 'LIVE',
        GUEST_GAMIFICATION_WORKER_SUPPLEMENTAL_LIMIT: '30',
      }),
    ).toThrow('GUEST_GAMIFICATION_WORKER_ACTIVITY_LIMIT=1');
  });

  it('processes one exact INTERNAL tenant without live canary rewards', async () => {
    const dependencies = services();
    const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };

    await runGuestGamificationWorkerOnce(
      dependencies as never,
      baseEnv(),
      logger,
      new Date('2026-09-04T12:00:00.000Z'),
    );

    expect(
      dependencies.activityLedger.processQueuedSyncJobs,
    ).toHaveBeenCalledWith(
      1,
      expect.stringMatching(/^gamification-worker-/),
      'tenant-1',
    );
    expect(
      dependencies.gamification.runSnapshotPipelineScheduled,
    ).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      dryRunOnly: true,
      limit: 1,
    });
    expect(
      dependencies.gamification.runSupplementalPipelineScheduled,
    ).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      mode: 'SHADOW',
      factTypes: ['BALANCE_TOPUP'],
      limit: 1,
    });
    expect(dependencies.monitoring.collectTenant).not.toHaveBeenCalled();
  });

  it('runs live pipelines and due monitoring from the same singleton', async () => {
    const dependencies = services();
    const env = {
      ...baseEnv(),
      GUEST_GAMIFICATION_WORKER_CANARY: 'false',
      GUEST_GAMIFICATION_WORKER_ACTIVITY_LIMIT: '1',
      GUEST_GAMIFICATION_WORKER_PIPELINE_LIMIT: '30',
      GUEST_GAMIFICATION_WORKER_SUPPLEMENTAL_MODE: 'LIVE',
      GUEST_GAMIFICATION_WORKER_SUPPLEMENTAL_LIMIT: '30',
      GUEST_GAMIFICATION_WORKER_MONITORING_ENABLED: 'true',
      GUEST_GAMIFICATION_WORKER_MONITORING_INTERVAL_MS: '300000',
    };
    const now = new Date('2026-09-04T12:00:00.000Z');

    await runGuestGamificationWorkerOnce(
      dependencies as never,
      env,
      console,
      now,
    );

    expect(
      dependencies.gamification.runSnapshotPipelineScheduled,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ dryRunOnly: false, limit: 30 }),
    );
    expect(
      dependencies.gamification.runSupplementalPipelineScheduled,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'LIVE', limit: 30 }),
    );
    expect(dependencies.monitoring.collectTenant).toHaveBeenCalledWith(
      'tenant-1',
      now,
    );
  });

  it('fails closed for an external tenant or pipeline error', async () => {
    const external = services();
    external.prisma.tenant.findMany.mockResolvedValueOnce([
      {
        id: 'tenant-1',
        slug: 'demo',
        status: TenantLifecycleStatus.ACTIVE,
        customerStage: TenantCustomerStage.PILOT,
      },
    ]);
    await expect(
      runGuestGamificationWorkerOnce(external as never, baseEnv()),
    ).rejects.toThrow('one active INTERNAL tenant');

    const failed = services();
    failed.gamification.runSnapshotPipelineScheduled.mockResolvedValueOnce({
      checkedTenants: 1,
      processedTenants: 0,
      skippedTenants: 0,
      erroredTenants: 1,
      erroredFacts: 1,
      processedFacts: 0,
      queuedRewards: 0,
      tenants: [
        {
          tenantId: 'tenant-1',
          status: 'ERRORED',
          reason: 'Too many database connections\nopened',
        },
      ],
    });
    await expect(
      runGuestGamificationWorkerOnce(failed as never, baseEnv()),
    ).rejects.toThrow(
      'Snapshot pipeline failed exact tenant processing: checked=1, processed=0, tenantsFailed=1, factsFailed=1 reason=Too many database connections opened',
    );
  });
});

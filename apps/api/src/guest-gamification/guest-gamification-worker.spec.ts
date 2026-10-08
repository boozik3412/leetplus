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
    GUEST_GAMIFICATION_WORKER_LEDGER_FALLBACK_MODE: 'SHADOW',
    GUEST_GAMIFICATION_WORKER_LEDGER_FALLBACK_LIMIT: '1',
    GUEST_GAMIFICATION_WORKER_SESSION_START_FALLBACK_MODE: 'OFF',
    GUEST_GAMIFICATION_WORKER_SESSION_START_FALLBACK_LIMIT: '1',
    GUEST_GAMIFICATION_WORKER_SESSION_START_FALLBACK_ALLOW_ALL_PROFILES:
      'false',
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
      enqueueDueRecoverySyncs: jest.fn().mockResolvedValue({
        scanned: 1,
        queued: 1,
        skipped: 0,
      }),
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
    ledgerFallback: {
      runScheduled: jest.fn().mockResolvedValue({
        mode: 'SHADOW',
        checkedTenants: 1,
        processedTenants: 1,
        skippedTenants: 0,
        erroredTenants: 0,
        checkedFacts: 1,
        deferredFacts: 0,
        liveHandledFacts: 0,
        shadowFacts: 1,
        fallbackFacts: 1,
        duplicateFacts: 0,
        failedFacts: 0,
        ownerConflictFacts: 0,
        createdEvents: 0,
        createdRewards: 0,
        tenants: [],
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
    expect(() =>
      loadGuestGamificationWorkerConfig({
        ...baseEnv(),
        GUEST_GAMIFICATION_WORKER_LEDGER_FALLBACK_MODE: 'LIVE',
        GUEST_GAMIFICATION_WORKER_LEDGER_FALLBACK_LIVE_NOT_BEFORE:
          '2026-09-05T00:00:00.000Z',
      }),
    ).toThrow('LEDGER_FALLBACK_MODE=LIVE is forbidden in canary mode');
  });

  it('requires a valid replay cutoff before stable LIVE ledger fallback', () => {
    const stable = {
      ...baseEnv(),
      GUEST_GAMIFICATION_WORKER_CANARY: 'false',
      GUEST_GAMIFICATION_WORKER_PIPELINE_LIMIT: '30',
      GUEST_GAMIFICATION_WORKER_LEDGER_FALLBACK_MODE: 'LIVE',
      GUEST_GAMIFICATION_WORKER_LEDGER_FALLBACK_LIMIT: '30',
      GUEST_GAMIFICATION_WORKER_SUPPLEMENTAL_MODE: 'LIVE',
      GUEST_GAMIFICATION_WORKER_SUPPLEMENTAL_LIMIT: '30',
    };

    expect(() => loadGuestGamificationWorkerConfig(stable)).toThrow(
      'LEDGER_FALLBACK_LIVE_NOT_BEFORE is required in LIVE mode',
    );
    expect(() =>
      loadGuestGamificationWorkerConfig({
        ...stable,
        GUEST_GAMIFICATION_WORKER_LEDGER_FALLBACK_LIVE_NOT_BEFORE: 'invalid',
      }),
    ).toThrow('LEDGER_FALLBACK_LIVE_NOT_BEFORE must be a valid ISO date');
  });

  it('fails closed unless session-start fallback has one explicit profile scope', () => {
    expect(() =>
      loadGuestGamificationWorkerConfig({
        ...baseEnv(),
        GUEST_GAMIFICATION_WORKER_SESSION_START_FALLBACK_MODE: 'SHADOW',
      }),
    ).toThrow(
      'Session-start fallback requires exactly one profile ID or allow-all-profiles=true',
    );
    expect(() =>
      loadGuestGamificationWorkerConfig({
        ...baseEnv(),
        GUEST_GAMIFICATION_WORKER_SESSION_START_FALLBACK_MODE: 'SHADOW',
        GUEST_GAMIFICATION_WORKER_SESSION_START_FALLBACK_PROFILE_ID:
          '25fc121f-c69a-4050-9bda-6def1424f45d',
        GUEST_GAMIFICATION_WORKER_SESSION_START_FALLBACK_ALLOW_ALL_PROFILES:
          'true',
      }),
    ).toThrow(
      'Session-start fallback requires exactly one profile ID or allow-all-profiles=true',
    );
    expect(() =>
      loadGuestGamificationWorkerConfig({
        ...baseEnv(),
        GUEST_GAMIFICATION_WORKER_SESSION_START_FALLBACK_MODE: 'LIVE',
        GUEST_GAMIFICATION_WORKER_SESSION_START_FALLBACK_PROFILE_ID:
          '25fc121f-c69a-4050-9bda-6def1424f45d',
      }),
    ).toThrow('SESSION_START_FALLBACK_MODE=LIVE is forbidden in canary mode');
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
      dependencies.activityLedger.enqueueDueRecoverySyncs,
    ).toHaveBeenCalledWith(1, new Date('2026-09-04T12:00:00.000Z'), 'tenant-1');
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
    expect(dependencies.ledgerFallback.runScheduled).toHaveBeenCalledWith({
      mode: 'SHADOW',
      tenantId: 'tenant-1',
      playTimeAllowAllProfiles: true,
      factTypes: [
        'SESSION_PLAY_TIME_ACCUMULATED',
        'HOURLY_PLAY_TIME_ACCUMULATED',
        'PACKAGE_OR_SUBSCRIPTION_PLAY_TIME_ACCUMULATED',
      ],
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

  it('runs session-start recovery as a separately scoped shadow pass', async () => {
    const dependencies = services();
    const profileId = '25fc121f-c69a-4050-9bda-6def1424f45d';

    await runGuestGamificationWorkerOnce(
      dependencies as never,
      {
        ...baseEnv(),
        GUEST_GAMIFICATION_WORKER_SESSION_START_FALLBACK_MODE: 'SHADOW',
        GUEST_GAMIFICATION_WORKER_SESSION_START_FALLBACK_PROFILE_ID: profileId,
      },
      console,
      new Date('2026-09-07T12:00:00.000Z'),
    );

    expect(dependencies.ledgerFallback.runScheduled).toHaveBeenCalledTimes(2);
    expect(dependencies.ledgerFallback.runScheduled).toHaveBeenNthCalledWith(
      2,
      {
        mode: 'SHADOW',
        tenantId: 'tenant-1',
        profileId,
        playTimeAllowAllProfiles: false,
        factTypes: [
          'SESSION_STARTED',
          'HOURLY_SESSION_STARTED',
          'PACKAGE_OR_SUBSCRIPTION_USED',
        ],
        limit: 1,
      },
    );
  });

  it('requires a cutoff for stable profile-scoped session-start LIVE', () => {
    const stable = {
      ...baseEnv(),
      GUEST_GAMIFICATION_WORKER_CANARY: 'false',
      GUEST_GAMIFICATION_WORKER_PIPELINE_LIMIT: '30',
      GUEST_GAMIFICATION_WORKER_SUPPLEMENTAL_MODE: 'LIVE',
      GUEST_GAMIFICATION_WORKER_SUPPLEMENTAL_LIMIT: '30',
      GUEST_GAMIFICATION_WORKER_SESSION_START_FALLBACK_MODE: 'LIVE',
      GUEST_GAMIFICATION_WORKER_SESSION_START_FALLBACK_PROFILE_ID:
        '25fc121f-c69a-4050-9bda-6def1424f45d',
    };

    expect(() => loadGuestGamificationWorkerConfig(stable)).toThrow(
      'SESSION_START_FALLBACK_LIVE_NOT_BEFORE is required in LIVE mode',
    );
    expect(
      loadGuestGamificationWorkerConfig({
        ...stable,
        GUEST_GAMIFICATION_WORKER_SESSION_START_FALLBACK_LIVE_NOT_BEFORE:
          '2026-09-07T00:00:00.000Z',
      }),
    ).toMatchObject({
      sessionStartFallbackMode: 'LIVE',
      sessionStartFallbackProfileId: '25fc121f-c69a-4050-9bda-6def1424f45d',
      sessionStartFallbackAllowAllProfiles: false,
      sessionStartFallbackLiveNotBefore: new Date('2026-09-07T00:00:00.000Z'),
    });
  });

  it('runs live pipelines and due monitoring from the same singleton', async () => {
    const dependencies = services();
    const env = {
      ...baseEnv(),
      GUEST_GAMIFICATION_WORKER_CANARY: 'false',
      GUEST_GAMIFICATION_WORKER_ACTIVITY_LIMIT: '1',
      GUEST_GAMIFICATION_WORKER_PIPELINE_LIMIT: '30',
      GUEST_GAMIFICATION_WORKER_LEDGER_FALLBACK_MODE: 'LIVE',
      GUEST_GAMIFICATION_WORKER_LEDGER_FALLBACK_LIMIT: '30',
      GUEST_GAMIFICATION_WORKER_LEDGER_FALLBACK_LIVE_NOT_BEFORE:
        '2026-09-05T00:00:00.000Z',
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
    expect(dependencies.ledgerFallback.runScheduled).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'LIVE',
        tenantId: 'tenant-1',
        playTimeAllowAllProfiles: true,
        liveNotBefore: '2026-09-05T00:00:00.000Z',
        limit: 30,
      }),
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

  it('sums up the leaderboard month in live mode only, without failing on a prize', async () => {
    const live = services();
    const settleTenant = jest.fn().mockResolvedValue({
      frozenBoards: 1,
      frozenRows: 4,
      prizesIssued: 2,
      manualPrizes: 1,
      prizesFailed: 1,
      failures: ['2026-10/rad/hours#1: bonus ledger is closed'],
    });
    const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const now = new Date('2026-11-01T08:00:00.000Z');

    const result = await runGuestGamificationWorkerOnce(
      { ...live, leaderboardSettlement: { settleTenant } } as never,
      {
        ...baseEnv(),
        GUEST_GAMIFICATION_WORKER_CANARY: 'false',
        GUEST_GAMIFICATION_WORKER_SUPPLEMENTAL_MODE: 'LIVE',
      },
      logger,
      now,
    );

    expect(settleTenant).toHaveBeenCalledWith('tenant-1', now);
    expect(result.leaderboard).toMatchObject({ prizesIssued: 2 });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Leaderboard prizes not issued'),
    );
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('leaderboardPrizes=2'),
    );

    const canarySettle = jest.fn();
    await runGuestGamificationWorkerOnce(
      {
        ...services(),
        leaderboardSettlement: { settleTenant: canarySettle },
      } as never,
      baseEnv(),
      logger,
      now,
    );
    expect(canarySettle).not.toHaveBeenCalled();
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
    // Upstream stages still stop the tick before the downstream passes.
    expect(failed.ledgerFallback.runScheduled).not.toHaveBeenCalled();
    expect(
      failed.gamification.runSupplementalPipelineScheduled,
    ).not.toHaveBeenCalled();
  });

  it('fails closed when exact-tenant ledger fallback reports a failed fact', async () => {
    const failed = services();
    failed.ledgerFallback.runScheduled.mockResolvedValueOnce({
      mode: 'SHADOW',
      checkedTenants: 1,
      processedTenants: 0,
      skippedTenants: 0,
      erroredTenants: 1,
      checkedFacts: 1,
      deferredFacts: 0,
      liveHandledFacts: 0,
      shadowFacts: 0,
      fallbackFacts: 0,
      duplicateFacts: 0,
      failedFacts: 1,
      ownerConflictFacts: 0,
      createdEvents: 0,
      createdRewards: 0,
      tenants: [],
    });

    await expect(
      runGuestGamificationWorkerOnce(failed as never, baseEnv()),
    ).rejects.toThrow(
      'Ledger fallback failed exact tenant processing: checked=1, tenantsFailed=1, factsFailed=1',
    );
  });

  function stableLiveEnv(): NodeJS.ProcessEnv {
    return {
      ...baseEnv(),
      GUEST_GAMIFICATION_WORKER_CANARY: 'false',
      GUEST_GAMIFICATION_WORKER_PIPELINE_LIMIT: '30',
      GUEST_GAMIFICATION_WORKER_LEDGER_FALLBACK_MODE: 'LIVE',
      GUEST_GAMIFICATION_WORKER_LEDGER_FALLBACK_LIMIT: '30',
      GUEST_GAMIFICATION_WORKER_LEDGER_FALLBACK_LIVE_NOT_BEFORE:
        '2026-09-05T00:00:00.000Z',
      GUEST_GAMIFICATION_WORKER_SUPPLEMENTAL_MODE: 'LIVE',
      GUEST_GAMIFICATION_WORKER_SUPPLEMENTAL_LIMIT: '30',
      GUEST_GAMIFICATION_WORKER_MONITORING_ENABLED: 'true',
    };
  }

  function liveFallbackResult(
    overrides: Partial<{
      failedFacts: number;
      ownerConflictFacts: number;
      liveHandledFacts: number;
    }> = {},
  ) {
    return {
      mode: 'LIVE',
      checkedTenants: 1,
      processedTenants: 1,
      skippedTenants: 0,
      erroredTenants: 0,
      checkedFacts: 2,
      deferredFacts: 0,
      liveHandledFacts: 0,
      shadowFacts: 0,
      fallbackFacts: 0,
      duplicateFacts: 0,
      failedFacts: 0,
      ownerConflictFacts: 0,
      createdEvents: 0,
      createdRewards: 0,
      tenants: [],
      ...overrides,
    };
  }

  it('still runs supplemental and monitoring after a ledger fallback failure and reports it at the end', async () => {
    const dependencies = services();
    const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    dependencies.ledgerFallback.runScheduled.mockResolvedValueOnce(
      liveFallbackResult({ failedFacts: 3 }),
    );

    await expect(
      runGuestGamificationWorkerOnce(
        dependencies as never,
        stableLiveEnv(),
        logger,
        new Date('2026-09-29T15:40:00.000Z'),
      ),
    ).rejects.toThrow(
      'Ledger fallback failed exact tenant processing: checked=1, tenantsFailed=0, factsFailed=3',
    );
    expect(
      dependencies.gamification.runSupplementalPipelineScheduled,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'LIVE', factTypes: ['BALANCE_TOPUP'] }),
    );
    expect(dependencies.monitoring.collectTenant).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining(
        'Guest gamification worker finished with failures:',
      ),
    );
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('supplementalFacts=1'),
    );
  });

  it('reports every failed independent pass of one tick', async () => {
    const dependencies = services();
    dependencies.ledgerFallback.runScheduled.mockRejectedValueOnce(
      new Error('database\nunavailable'),
    );
    dependencies.gamification.runSupplementalPipelineScheduled.mockResolvedValueOnce(
      {
        checkedTenants: 1,
        processedTenants: 0,
        skippedTenants: 0,
        erroredTenants: 1,
        failedFacts: 1,
        processedFacts: 0,
        createdRewards: 0,
      },
    );
    dependencies.monitoring.collectTenant.mockResolvedValueOnce({
      status: 'FAILED',
    });

    const error = await runGuestGamificationWorkerOnce(
      dependencies as never,
      stableLiveEnv(),
      { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(
      [
        'Ledger fallback threw: database unavailable',
        'Supplemental pipeline failed exact tenant processing: checked=1, tenantsFailed=1, factsFailed=1',
        'Gamification quality monitoring did not succeed',
      ].join('; '),
    );
  });

  it('finishes the tick when the only fallback outcome is a dead-lettered owner conflict', async () => {
    const dependencies = services();
    const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    dependencies.ledgerFallback.runScheduled.mockResolvedValueOnce(
      liveFallbackResult({ ownerConflictFacts: 3 }),
    );

    await expect(
      runGuestGamificationWorkerOnce(
        dependencies as never,
        stableLiveEnv(),
        logger,
      ),
    ).resolves.toMatchObject({
      ledgerFallback: { ownerConflictFacts: 3, failedFacts: 0 },
    });
    expect(logger.warn).toHaveBeenCalledWith(
      'Ledger fallback dead-lettered origins owned by another profile: count=3',
    );
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringMatching(
        /^Guest gamification worker finished: .*ledgerFallbackOwnerConflicts=3/,
      ),
    );
    expect(
      dependencies.gamification.runSupplementalPipelineScheduled,
    ).toHaveBeenCalledTimes(1);
  });
});

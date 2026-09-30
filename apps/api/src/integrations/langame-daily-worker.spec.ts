import type { DailySyncResult } from './langame-daily-sync.service';
import {
  loadLangameDailyWorkerConfig,
  runLangameDailyMaintenanceOnce,
  runLangameDailyWorkerOnce,
  runLangameExternalTenantsDailyOnce,
} from './langame-daily-worker';

function baseEnv(): NodeJS.ProcessEnv {
  return {
    LANGAME_DAILY_WORKER_ENABLED: 'true',
    LANGAME_DAILY_WORKER_LIVE: 'true',
    LANGAME_DAILY_WORKER_TENANT_SLUG: 'demo',
    LANGAME_DAILY_WORKER_CANARY: 'false',
    LANGAME_DAILY_WORKER_ACTIVITY_RECOVERY_ENABLED: 'true',
    LANGAME_DAILY_WORKER_ACTIVITY_RECOVERY_LIMIT: '20',
    LANGAME_DAILY_WORKER_RETENTION_ENABLED: 'true',
    LANGAME_DAILY_WORKER_RETENTION_LIVE: 'false',
    LANGAME_DAILY_SYNC_SCHEDULER_ENABLED: 'false',
    LANGAME_SCHEDULED_HTTP_ENABLED: 'false',
  };
}

function result(overrides: Partial<DailySyncResult> = {}): DailySyncResult {
  return {
    date: '2026-09-02',
    force: false,
    tenants: 1,
    processedTenants: 1,
    skippedTenants: 0,
    results: [
      {
        tenantId: 'tenant-1',
        slug: 'demo',
        date: '2026-09-02',
        status: 'PROCESSED',
        skipped: false,
        reasonCode: null,
        failedRequirement: null,
        scopes: [
          {
            scope: 'BUSINESS_FACTS',
            status: 'SUCCESS',
            skipped: false,
            errorMessage: null,
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe('Langame daily worker', () => {
  it('is fail-closed until its own live switch is explicitly enabled', () => {
    expect(() =>
      loadLangameDailyWorkerConfig({
        ...baseEnv(),
        LANGAME_DAILY_WORKER_LIVE: 'false',
      }),
    ).toThrow('LANGAME_DAILY_WORKER_LIVE=true is required');
  });

  it('requires API and scheduled HTTP owners to remain disabled', () => {
    expect(() =>
      loadLangameDailyWorkerConfig({
        ...baseEnv(),
        LANGAME_DAILY_SYNC_SCHEDULER_ENABLED: 'true',
      }),
    ).toThrow('LANGAME_DAILY_SYNC_SCHEDULER_ENABLED=false is required');
    expect(() =>
      loadLangameDailyWorkerConfig({
        ...baseEnv(),
        LANGAME_SCHEDULED_HTTP_ENABLED: 'true',
      }),
    ).toThrow('LANGAME_SCHEDULED_HTTP_ENABLED=false is required');
  });

  it('requires one exact tenant slug', () => {
    expect(() =>
      loadLangameDailyWorkerConfig({
        ...baseEnv(),
        LANGAME_DAILY_WORKER_TENANT_SLUG: 'Demo Tenant',
      }),
    ).toThrow('one exact lowercase slug');
  });

  it('allows an explicit business date only in canary mode', () => {
    expect(() =>
      loadLangameDailyWorkerConfig({
        ...baseEnv(),
        LANGAME_DAILY_WORKER_DATE: '2026-09-02',
      }),
    ).toThrow('allowed only in canary mode');

    expect(
      loadLangameDailyWorkerConfig({
        ...baseEnv(),
        LANGAME_DAILY_WORKER_CANARY: 'true',
        LANGAME_DAILY_WORKER_ACTIVITY_RECOVERY_ENABLED: 'false',
        LANGAME_DAILY_WORKER_RETENTION_ENABLED: 'false',
        LANGAME_DAILY_WORKER_DATE: '2026-09-02',
      }),
    ).toMatchObject({ tenantSlug: 'demo', date: '2026-09-02', canary: true });
  });

  it('keeps daily maintenance disabled for a dated canary', () => {
    expect(() =>
      loadLangameDailyWorkerConfig({
        ...baseEnv(),
        LANGAME_DAILY_WORKER_CANARY: 'true',
        LANGAME_DAILY_WORKER_DATE: '2026-09-02',
      }),
    ).toThrow('maintenance must stay disabled in canary mode');
  });

  it('runs exactly one tenant and writes aggregate-only output', async () => {
    const service = { runDailySync: jest.fn().mockResolvedValue(result()) };
    const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };

    await expect(
      runLangameDailyWorkerOnce(service, baseEnv(), logger),
    ).resolves.toMatchObject({ processedTenants: 1 });
    expect(service.runDailySync).toHaveBeenCalledWith({ tenantSlug: 'demo' });
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('processed=1/1'),
    );
    expect(logger.log.mock.calls.join(' ')).not.toContain('tenant-1');
  });

  it('fails the systemd tick when an exact tenant is skipped or a scope fails', async () => {
    const skipped = result({ processedTenants: 0, skippedTenants: 1 });
    skipped.results[0].status = 'SKIPPED';
    const failed = result();
    failed.results[0].scopes[0].status = 'FAILED';

    await expect(
      runLangameDailyWorkerOnce(
        { runDailySync: jest.fn().mockResolvedValue(skipped) },
        baseEnv(),
      ),
    ).rejects.toThrow('not processed exactly once');
    await expect(
      runLangameDailyWorkerOnce(
        { runDailySync: jest.fn().mockResolvedValue(failed) },
        baseEnv(),
      ),
    ).rejects.toThrow('failed scopes: BUSINESS_FACTS');
  });

  it('runs exact-tenant recovery and dry-run retention after stable sync', async () => {
    const services = {
      activityLedger: {
        enqueueDueRecoverySyncs: jest.fn().mockResolvedValue({
          scanned: 3,
          queued: 2,
          skipped: 1,
        }),
      },
      retention: {
        runTenantMaintenance: jest.fn().mockResolvedValue({
          recoveredOpenings: 1,
          expiredOrphanClaims: 0,
          deletedWalletItems: 2,
          retention: { status: 'DRY_RUN_COMPLETE' },
        }),
      },
    };
    const now = new Date('2026-09-04T12:00:00.000Z');

    await expect(
      runLangameDailyMaintenanceOnce(
        result(),
        services as never,
        baseEnv(),
        console,
        now,
      ),
    ).resolves.toMatchObject({ skipped: false });
    expect(
      services.activityLedger.enqueueDueRecoverySyncs,
    ).toHaveBeenCalledWith(20, now, 'tenant-1');
    expect(services.retention.runTenantMaintenance).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      now,
      liveRequested: false,
    });
  });

  it('does not mutate maintenance state during canary', async () => {
    const services = {
      activityLedger: { enqueueDueRecoverySyncs: jest.fn() },
      retention: { runTenantMaintenance: jest.fn() },
    };
    const env = {
      ...baseEnv(),
      LANGAME_DAILY_WORKER_CANARY: 'true',
      LANGAME_DAILY_WORKER_ACTIVITY_RECOVERY_ENABLED: 'false',
      LANGAME_DAILY_WORKER_RETENTION_ENABLED: 'false',
      LANGAME_DAILY_WORKER_DATE: '2026-09-02',
    };

    await expect(
      runLangameDailyMaintenanceOnce(result(), services as never, env),
    ).resolves.toMatchObject({ skipped: true });
    expect(
      services.activityLedger.enqueueDueRecoverySyncs,
    ).not.toHaveBeenCalled();
    expect(services.retention.runTenantMaintenance).not.toHaveBeenCalled();
  });

  describe('external networks', () => {
    function externalResult(
      slug: string,
      status: 'PROCESSED' | 'SKIPPED' = 'PROCESSED',
      scopeStatus: 'SUCCESS' | 'FAILED' = 'SUCCESS',
    ) {
      const value = result();
      value.results[0].slug = slug;
      value.results[0].status = status;
      value.results[0].scopes[0].status = scopeStatus;
      if (status === 'SKIPPED') {
        value.results[0].reasonCode = 'TRIAL_EXPIRED';
      }
      return value;
    }

    it('syncs every connected external network after the primary tenant', async () => {
      const service = {
        listExternalDailySyncTenantSlugs: jest
          .fn()
          .mockResolvedValue(['demo', 'set-1', 'set-2']),
        runDailySync: jest
          .fn()
          .mockImplementation(({ tenantSlug }: { tenantSlug: string }) =>
            Promise.resolve(externalResult(tenantSlug)),
          ),
      };
      const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };

      await expect(
        runLangameExternalTenantsDailyOnce(service, baseEnv(), logger),
      ).resolves.toEqual({
        processed: ['set-1', 'set-2'],
        skipped: [],
        failed: [],
      });
      // The primary tenant already ran with maintenance; never twice.
      expect(service.runDailySync.mock.calls).toEqual([
        [{ tenantSlug: 'set-1' }],
        [{ tenantSlug: 'set-2' }],
      ]);
    });

    it('keeps going after a failed network and reports it', async () => {
      const service = {
        listExternalDailySyncTenantSlugs: jest
          .fn()
          .mockResolvedValue(['set-1', 'set-2', 'set-3']),
        runDailySync: jest
          .fn()
          .mockRejectedValueOnce(new Error('Langame timeout'))
          .mockResolvedValueOnce(externalResult('set-2', 'PROCESSED', 'FAILED'))
          .mockResolvedValueOnce(externalResult('set-3', 'SKIPPED')),
      };
      const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };

      await expect(
        runLangameExternalTenantsDailyOnce(service, baseEnv(), logger),
      ).resolves.toEqual({
        processed: [],
        skipped: ['set-3'],
        failed: ['set-1', 'set-2(BUSINESS_FACTS)'],
      });
      expect(service.runDailySync).toHaveBeenCalledTimes(3);
      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('tenant=set-3 reason=TRIAL_EXPIRED'),
      );
    });

    it('stays off in canary mode and when switched off', async () => {
      const service = {
        listExternalDailySyncTenantSlugs: jest.fn(),
        runDailySync: jest.fn(),
      };
      const canary = {
        ...baseEnv(),
        LANGAME_DAILY_WORKER_CANARY: 'true',
        LANGAME_DAILY_WORKER_ACTIVITY_RECOVERY_ENABLED: 'false',
        LANGAME_DAILY_WORKER_RETENTION_ENABLED: 'false',
        LANGAME_DAILY_WORKER_DATE: '2026-09-02',
      };
      const off = {
        ...baseEnv(),
        LANGAME_DAILY_WORKER_EXTERNAL_TENANTS_ENABLED: 'false',
      };

      for (const env of [canary, off]) {
        await expect(
          runLangameExternalTenantsDailyOnce(service, env),
        ).resolves.toEqual({ processed: [], skipped: [], failed: [] });
      }
      expect(service.listExternalDailySyncTenantSlugs).not.toHaveBeenCalled();
      expect(service.runDailySync).not.toHaveBeenCalled();
    });
  });
});

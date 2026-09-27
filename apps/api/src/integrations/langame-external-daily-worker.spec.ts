import type {
  DailySyncInput,
  DailySyncResult,
} from './langame-daily-sync.service';
import {
  loadLangameExternalWorkerConfig,
  runLangameExternalWorkerOnce,
} from './langame-external-daily-worker';

const env = (): NodeJS.ProcessEnv => ({
  LANGAME_EXTERNAL_WORKER_ENABLED: 'true',
  LANGAME_EXTERNAL_WORKER_LIVE: 'true',
  LANGAME_EXTERNAL_WORKER_MODE: 'TIMER',
  LANGAME_EXTERNAL_WORKER_TENANT_ID: '8cc79086-ed43-44fa-83d3-20207ec48758',
  LANGAME_EXTERNAL_WORKER_TENANT_SLUG: 'set-1',
  LANGAME_EXTERNAL_WORKER_SOURCE_ID: '94a3842b-847e-4c4d-89b0-7cb8976a9f17',
  LANGAME_EXTERNAL_WORKER_STORE_ID: 'ecee16ef-f0cb-4307-b079-e2f0303c3a16',
  LANGAME_EXTERNAL_WORKER_DOMAIN: '1171.langame.ru',
  LANGAME_EXTERNAL_WORKER_CLUB_ID: '1',
  LANGAME_EXTERNAL_WORKER_EXECUTION_REVISION: '1',
  LANGAME_EXTERNAL_WORKER_PROFILE_REVISION: '1',
  LANGAME_EXTERNAL_WORKER_STORE_REVISION: '0',
  LANGAME_EXTERNAL_WORKER_RUN_ID: '528948b2-6840-4ad0-9854-7993fedbe8df',
  LANGAME_EXTERNAL_WORKER_BUSINESS_DATE: '2026-09-26',
  LANGAME_EXTERNAL_WORKER_CUSTOMER_STAGE: 'LIVE',
  LANGAME_DAILY_SYNC_SCHEDULER_ENABLED: 'false',
  LANGAME_SCHEDULED_HTTP_ENABLED: 'false',
  GUEST_GAME_BONUS_LEDGER_SCHEDULER_ENABLED: 'false',
});

function result(overrides: Partial<DailySyncResult> = {}): DailySyncResult {
  return {
    date: '2026-09-26',
    force: false,
    tenants: 1,
    processedTenants: 1,
    skippedTenants: 0,
    results: [
      {
        tenantId: env().LANGAME_EXTERNAL_WORKER_TENANT_ID!,
        slug: 'set-1',
        date: '2026-09-26',
        status: 'PROCESSED',
        skipped: false,
        reasonCode: null,
        failedRequirement: null,
        inventoryRequested: true,
        scopes: [
          {
            scope: 'BUSINESS_FACTS',
            status: 'SUCCESS',
            skipped: false,
            errorMessage: null,
          },
          {
            scope: 'GUEST_FOUNDATION',
            status: 'SUCCESS',
            skipped: false,
            errorMessage: null,
          },
          {
            scope: 'STAFF_SHIFTS',
            status: 'SUCCESS',
            skipped: false,
            errorMessage: null,
          },
          {
            scope: 'BUSINESS_SNAPSHOTS',
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

describe('external Langame pilot worker', () => {
  it('requires an exact separate secret profile and disables unrelated effects', () => {
    expect(loadLangameExternalWorkerConfig(env())).toMatchObject({
      mode: 'TIMER',
      date: null,
    });
    for (const invalid of [
      { LANGAME_EXTERNAL_WORKER_LIVE: 'false' },
      { LANGAME_EXTERNAL_WORKER_TENANT_SLUG: '*' },
      { LANGAME_EXTERNAL_WORKER_SOURCE_ID: 'other' },
      { LANGAME_EXTERNAL_WORKER_EXECUTION_REVISION: '0' },
      { LANGAME_EXTERNAL_WORKER_CUSTOMER_STAGE: 'INTERNAL' },
      { LANGAME_EXTERNAL_WORKER_CUSTOMER_STAGE: 'PILOT' },
      { LANGAME_EXTERNAL_WORKER_PROFILE_REVISION: '0' },
      { LANGAME_EXTERNAL_WORKER_STORE_REVISION: '-1' },
      { LANGAME_EXTERNAL_WORKER_RUN_ID: 'not-a-uuid' },
      { LANGAME_EXTERNAL_WORKER_BUSINESS_DATE: '2026-02-31' },
      { LANGAME_DAILY_SYNC_SCHEDULER_ENABLED: 'true' },
      { LANGAME_BONUS_ACCRUAL_ENABLED: 'true' },
      { LANGAME_DAILY_WORKER_RETENTION_ENABLED: 'true' },
      { LANGAME_EXTERNAL_WORKER_DATE: '2026-09-26' },
    ]) {
      expect(() =>
        loadLangameExternalWorkerConfig({ ...env(), ...invalid }),
      ).toThrow();
    }
    expect(
      loadLangameExternalWorkerConfig({
        ...env(),
        LANGAME_EXTERNAL_WORKER_MODE: 'CANARY',
        LANGAME_EXTERNAL_WORKER_DATE: '2026-09-26',
      }),
    ).toMatchObject({ mode: 'CANARY', date: '2026-09-26' });
    expect(() =>
      loadLangameExternalWorkerConfig({
        ...env(),
        LANGAME_EXTERNAL_WORKER_MODE: 'CANARY',
        LANGAME_EXTERNAL_WORKER_DATE: '2026-09-25',
      }),
    ).toThrow('business date');
  });

  it('runs exactly the granted tenant and reports aggregate-only output', async () => {
    const service = {
      runDailySync: jest
        .fn<Promise<DailySyncResult>, [DailySyncInput]>()
        .mockResolvedValue(result()),
    };
    const logger = { log: jest.fn() };
    await expect(
      runLangameExternalWorkerOnce(service, env(), logger),
    ).resolves.toMatchObject({ processedTenants: 1 });
    const call = service.runDailySync.mock.calls[0]?.[0] as {
      tenantSlug?: string;
      externalPilot?: { tenantSlug?: string; customerStage?: string };
    };
    expect(call.tenantSlug).toBe('set-1');
    expect(call.externalPilot).toMatchObject({
      tenantSlug: 'set-1',
      customerStage: 'LIVE',
    });
    expect(service.runDailySync).toHaveBeenCalledWith(
      expect.objectContaining({ externalBusinessDate: '2026-09-26' }),
    );
    expect(logger.log.mock.calls.join(' ')).not.toContain(
      env().LANGAME_EXTERNAL_WORKER_TENANT_ID,
    );
  });

  it('fails a skipped or incomplete tick after available sections have run', async () => {
    const skipped = result({ processedTenants: 0, skippedTenants: 1 });
    skipped.results[0].status = 'SKIPPED';
    await expect(
      runLangameExternalWorkerOnce(
        { runDailySync: jest.fn().mockResolvedValue(skipped) },
        env(),
      ),
    ).rejects.toThrow('not processed exactly once');
    const partial = result();
    partial.results[0].scopes[0].status = 'FAILED';
    await expect(
      runLangameExternalWorkerOnce(
        { runDailySync: jest.fn().mockResolvedValue(partial) },
        env(),
      ),
    ).rejects.toThrow('incomplete scopes');
  });

  it('finishes a provider PARTIAL tick without aborting or claiming full success', async () => {
    const partial = result();
    partial.results[0].scopes[0].status = 'FAILED';
    partial.results[0].scopes[0].partial = true;
    const logger = { log: jest.fn() };
    await expect(
      runLangameExternalWorkerOnce(
        { runDailySync: jest.fn().mockResolvedValue(partial) },
        env(),
        logger,
      ),
    ).resolves.toEqual(partial);
    expect(logger.log.mock.calls.join(' ')).toContain('decision=PARTIAL');
  });

  it('refuses a fabricated complete tick with a missing daily scope', async () => {
    const incomplete = result();
    incomplete.results[0].scopes.pop();
    await expect(
      runLangameExternalWorkerOnce(
        { runDailySync: jest.fn().mockResolvedValue(incomplete) },
        env(),
      ),
    ).rejects.toThrow('not processed exactly once');
  });
});

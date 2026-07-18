import { GuestGameLedgerFallbackSchedulerService } from './guest-game-ledger-fallback-scheduler.service';
import type { GuestGameLedgerFallbackRunResult } from './guest-game-ledger-fallback.service';

function runResult(
  overrides: Partial<GuestGameLedgerFallbackRunResult> = {},
): GuestGameLedgerFallbackRunResult {
  return {
    mode: 'SHADOW',
    checkedTenants: 1,
    processedTenants: 1,
    skippedTenants: 0,
    erroredTenants: 0,
    checkedFacts: 1,
    deferredFacts: 0,
    liveHandledFacts: 0,
    shadowFacts: 1,
    fallbackFacts: 0,
    duplicateFacts: 0,
    failedFacts: 0,
    createdEvents: 0,
    createdRewards: 0,
    tenants: [],
    ...overrides,
  };
}

function createScheduler(values: Record<string, string> = {}) {
  const config = {
    get: jest.fn((key: string) => values[key]),
  };
  const fallbackService = {
    runScheduled: jest.fn().mockResolvedValue(runResult()),
  };
  return {
    scheduler: new GuestGameLedgerFallbackSchedulerService(
      config as never,
      fallbackService as never,
    ),
    fallbackService,
  };
}

describe('GuestGameLedgerFallbackSchedulerService', () => {
  it('stays OFF by default', async () => {
    const { scheduler, fallbackService } = createScheduler();

    await expect(scheduler.runOnce()).resolves.toBeNull();
    expect(fallbackService.runScheduled).not.toHaveBeenCalled();
    expect(scheduler.getRuntimeStatus()).toMatchObject({
      mode: 'OFF',
      enabled: false,
      backgroundReady: false,
      running: false,
      killSwitchEnabled: false,
      scope: {
        tenantId: null,
        tenantSlug: null,
        profileId: null,
        allowAllTenants: false,
        configured: false,
      },
      lastResult: null,
      lastError: null,
    });
  });

  it('passes only the allowed fact types and scoped settings in SHADOW', async () => {
    const { scheduler, fallbackService } = createScheduler({
      GUEST_GAME_LEDGER_FALLBACK_MODE: 'SHADOW',
      GUEST_GAME_LEDGER_FALLBACK_FACT_TYPES:
        'PRODUCT_PURCHASED,BALANCE_TOPUP,HOURLY_PLAY_TIME_ACCUMULATED',
      GUEST_GAME_LEDGER_FALLBACK_BATCH_SIZE: '12',
      GUEST_GAME_LEDGER_FALLBACK_GRACE_MS: '45000',
      GUEST_GAME_LEDGER_FALLBACK_CLAIM_LEASE_MS: '90000',
      GUEST_GAME_LEDGER_FALLBACK_TENANT_SLUG: 'demo',
      GUEST_GAME_LEDGER_FALLBACK_PROFILE_ID: 'profile-1',
    });

    await expect(scheduler.runOnce()).resolves.toMatchObject({
      mode: 'SHADOW',
      shadowFacts: 1,
    });
    expect(fallbackService.runScheduled).toHaveBeenCalledWith({
      mode: 'SHADOW',
      factTypes: ['HOURLY_PLAY_TIME_ACCUMULATED', 'PRODUCT_PURCHASED'],
      limit: 12,
      graceMs: 45_000,
      claimLeaseMs: 90_000,
      tenantSlug: 'demo',
      profileId: 'profile-1',
    });
  });

  it('fails closed when SHADOW has no tenant scope', async () => {
    const { scheduler, fallbackService } = createScheduler({
      GUEST_GAME_LEDGER_FALLBACK_MODE: 'SHADOW',
    });

    await expect(scheduler.runOnce()).resolves.toBeNull();
    expect(fallbackService.runScheduled).not.toHaveBeenCalled();
  });

  it('defaults to play-time facts and requires an explicit purchase opt-in', async () => {
    const { scheduler, fallbackService } = createScheduler({
      GUEST_GAME_LEDGER_FALLBACK_MODE: 'SHADOW',
      GUEST_GAME_LEDGER_FALLBACK_TENANT_SLUG: 'demo',
    });

    await scheduler.runOnce();

    expect(fallbackService.runScheduled).toHaveBeenCalledWith(
      expect.objectContaining({
        factTypes: [
          'HOURLY_PLAY_TIME_ACCUMULATED',
          'PACKAGE_OR_SUBSCRIPTION_PLAY_TIME_ACCUMULATED',
        ],
      }),
    );
  });

  it('requires an explicit opt-in before processing all tenants', async () => {
    const { scheduler, fallbackService } = createScheduler({
      GUEST_GAME_LEDGER_FALLBACK_MODE: 'SHADOW',
      GUEST_GAME_LEDGER_FALLBACK_ALLOW_ALL_TENANTS: 'true',
    });

    await expect(scheduler.runOnce()).resolves.toMatchObject({
      mode: 'SHADOW',
    });
    expect(fallbackService.runScheduled).toHaveBeenCalledWith(
      expect.objectContaining({ allowAllTenants: true }),
    );
  });

  it('honors the emergency kill switch in LIVE mode', async () => {
    const { scheduler, fallbackService } = createScheduler({
      GUEST_GAME_LEDGER_FALLBACK_MODE: 'LIVE',
      GUEST_GAME_LEDGER_FALLBACK_KILL_SWITCH: 'true',
    });

    await expect(scheduler.runOnce()).resolves.toBeNull();
    expect(fallbackService.runScheduled).not.toHaveBeenCalled();
  });

  it('fails closed when no configured fact type is allowed', async () => {
    const { scheduler, fallbackService } = createScheduler({
      GUEST_GAME_LEDGER_FALLBACK_MODE: 'LIVE',
      GUEST_GAME_LEDGER_FALLBACK_FACT_TYPES: 'BALANCE_TOPUP,UNKNOWN',
    });

    await expect(scheduler.runOnce()).resolves.toBeNull();
    expect(fallbackService.runScheduled).not.toHaveBeenCalled();
  });

  it('does not overlap scheduler ticks', async () => {
    let release: ((value: GuestGameLedgerFallbackRunResult) => void) | null =
      null;
    const { scheduler, fallbackService } = createScheduler({
      GUEST_GAME_LEDGER_FALLBACK_MODE: 'SHADOW',
      GUEST_GAME_LEDGER_FALLBACK_TENANT_SLUG: 'demo',
    });
    fallbackService.runScheduled.mockImplementation(
      () =>
        new Promise<GuestGameLedgerFallbackRunResult>((resolve) => {
          release = resolve;
        }),
    );

    const first = scheduler.runOnce();
    expect(scheduler.getRuntimeStatus()).toMatchObject({
      mode: 'SHADOW',
      enabled: true,
      backgroundReady: true,
      running: true,
    });
    await expect(scheduler.runOnce()).resolves.toBeNull();
    expect(fallbackService.runScheduled).toHaveBeenCalledTimes(1);
    release?.(runResult());
    await expect(first).resolves.toMatchObject({ mode: 'SHADOW' });
    expect(scheduler.getRuntimeStatus()).toMatchObject({
      running: false,
      lastResult: { mode: 'SHADOW', shadowFacts: 1 },
      lastError: null,
    });
  });

  it('exposes a fail-closed scoped runtime status', () => {
    const { scheduler } = createScheduler({
      GUEST_GAME_LEDGER_FALLBACK_MODE: 'LIVE',
      GUEST_GAME_LEDGER_FALLBACK_KILL_SWITCH: 'true',
      GUEST_GAME_LEDGER_FALLBACK_TENANT_ID: 'tenant-1',
      GUEST_GAME_LEDGER_FALLBACK_BATCH_SIZE: '5',
    });

    expect(scheduler.getRuntimeStatus()).toMatchObject({
      mode: 'LIVE',
      enabled: true,
      backgroundReady: false,
      killSwitchEnabled: true,
      batchSize: 5,
      scope: {
        tenantId: 'tenant-1',
        tenantSlug: null,
        allowAllTenants: false,
        configured: true,
      },
    });
  });

  it('redacts other tenants from a tenant-scoped runtime status', async () => {
    const { scheduler, fallbackService } = createScheduler({
      GUEST_GAME_LEDGER_FALLBACK_MODE: 'SHADOW',
      GUEST_GAME_LEDGER_FALLBACK_ALLOW_ALL_TENANTS: 'true',
    });
    fallbackService.runScheduled.mockResolvedValue(
      runResult({
        tenants: [
          {
            tenantId: 'tenant-1',
            tenantSlug: 'demo',
            status: 'PROCESSED',
            reason: null,
            checkedFacts: 1,
            deferredFacts: 0,
            liveHandledFacts: 0,
            shadowFacts: 1,
            fallbackFacts: 0,
            duplicateFacts: 0,
            failedFacts: 0,
            createdEvents: 0,
            createdRewards: 0,
          },
          {
            tenantId: 'tenant-2',
            tenantSlug: 'private-tenant',
            status: 'PROCESSED',
            reason: null,
            checkedFacts: 99,
            deferredFacts: 0,
            liveHandledFacts: 0,
            shadowFacts: 99,
            fallbackFacts: 0,
            duplicateFacts: 0,
            failedFacts: 0,
            createdEvents: 0,
            createdRewards: 0,
          },
        ],
      }),
    );

    await scheduler.runOnce();

    const status = scheduler.getTenantRuntimeStatus('tenant-1', 'demo');
    expect(status.scope).toEqual({
      configured: true,
      targetsCurrentTenant: true,
      profileConfigured: false,
    });
    expect(status.lastResult).toMatchObject({
      status: 'PROCESSED',
      checkedFacts: 1,
    });
    expect(status.lastResult).not.toHaveProperty('tenantId');
    expect(status.lastResult).not.toHaveProperty('tenantSlug');
    expect(JSON.stringify(status)).not.toContain('private-tenant');
    expect(JSON.stringify(status)).not.toContain('tenant-2');
  });
});

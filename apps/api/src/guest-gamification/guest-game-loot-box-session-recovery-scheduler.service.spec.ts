import { GuestGameLootBoxSessionRecoverySchedulerService } from './guest-game-loot-box-session-recovery-scheduler.service';

function createScheduler(values: Record<string, string> = {}) {
  const config = {
    get: jest.fn((key: string) => values[key]),
  };
  const recovery = {
    runScheduled: jest.fn().mockResolvedValue({
      mode: values.GUEST_GAME_LOOT_BOX_RECOVERY_MODE ?? 'OFF',
      checkedTenants: 1,
      processedTenants: 1,
      skippedTenants: 0,
      erroredTenants: 0,
      checkedSessions: 1,
      unmatchedSessions: 0,
      ambiguousSessions: 0,
      correlatedSessions: 1,
      deferredSessions: 0,
      shadowSessions: 1,
      recoveredSessions: 0,
      duplicateSessions: 0,
      failedSessions: 0,
      matchedRules: 1,
      tenants: [],
    }),
  };
  return {
    scheduler: new GuestGameLootBoxSessionRecoverySchedulerService(
      config as never,
      recovery as never,
    ),
    recovery,
  };
}

describe('GuestGameLootBoxSessionRecoverySchedulerService', () => {
  const dedicatedLiveCanary = {
    GUEST_GAME_LOOT_BOX_RECOVERY_MODE: 'LIVE',
    GUEST_GAME_LOOT_BOX_RECOVERY_KILL_SWITCH: 'false',
    GUEST_GAME_LOOT_BOX_RECOVERY_TENANT_ID: 'tenant-1',
    GUEST_GAME_LOOT_BOX_RECOVERY_PROFILE_ID: 'profile-1',
    GUEST_GAME_LOOT_BOX_RECOVERY_LIVE_NOT_BEFORE: '2026-07-20T10:00:00.000Z',
    GUEST_GAME_ENTITLEMENT_READ_MODE: 'CANARY',
    GUEST_GAME_ENTITLEMENT_CANARY_TENANT_IDS: 'tenant-1',
    GUEST_GAME_ENTITLEMENT_CANARY_PROFILE_IDS: 'profile-1',
  };
  const overlappingLedgerFallback = {
    GUEST_GAME_LEDGER_FALLBACK_MODE: 'LIVE',
    GUEST_GAME_LEDGER_FALLBACK_KILL_SWITCH: 'false',
    GUEST_GAME_LEDGER_FALLBACK_TENANT_ID: 'tenant-1',
    GUEST_GAME_LEDGER_FALLBACK_PLAY_TIME_ALLOW_ALL_PROFILES: 'true',
    GUEST_GAME_LEDGER_FALLBACK_LIVE_NOT_BEFORE: '2026-07-24T10:00:00.000Z',
    GUEST_GAME_LEDGER_FALLBACK_FACT_TYPES:
      'SESSION_STARTED,SESSION_PLAY_TIME_ACCUMULATED',
  };

  it('is OFF by default', async () => {
    const { scheduler, recovery } = createScheduler();

    expect(await scheduler.runOnce()).toBeNull();
    expect(recovery.runScheduled).not.toHaveBeenCalled();
  });

  it('allows tenant-scoped SHADOW mode', async () => {
    const { scheduler, recovery } = createScheduler({
      GUEST_GAME_LOOT_BOX_RECOVERY_MODE: 'SHADOW',
      GUEST_GAME_LOOT_BOX_RECOVERY_KILL_SWITCH: 'false',
      GUEST_GAME_LOOT_BOX_RECOVERY_TENANT_ID: 'tenant-1',
    });

    await scheduler.runOnce();

    expect(recovery.runScheduled).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'SHADOW',
        tenantId: 'tenant-1',
        correlationWindowMs: 60_000,
        retryLimit: 30,
        maxAttempts: 5,
        lookbackMs: 86_400_000,
        overlapLimit: 30,
      }),
    );
  });

  it('keeps LIVE disabled without a profile and cutoff', async () => {
    const { scheduler, recovery } = createScheduler({
      GUEST_GAME_LOOT_BOX_RECOVERY_MODE: 'LIVE',
      GUEST_GAME_LOOT_BOX_RECOVERY_KILL_SWITCH: 'false',
      GUEST_GAME_LOOT_BOX_RECOVERY_TENANT_ID: 'tenant-1',
    });

    expect(await scheduler.runOnce()).toBeNull();
    expect(recovery.runScheduled).not.toHaveBeenCalled();
  });

  it('allows explicitly scoped LIVE canary mode', async () => {
    const { scheduler, recovery } = createScheduler(dedicatedLiveCanary);

    await scheduler.runOnce();

    expect(recovery.runScheduled).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'LIVE',
        tenantId: 'tenant-1',
        profileId: 'profile-1',
        liveNotBefore: '2026-07-20T10:00:00.000Z',
      }),
    );
  });

  it('fails closed when the generic LIVE fallback owns session starts in the same scope', async () => {
    const { scheduler, recovery } = createScheduler({
      ...dedicatedLiveCanary,
      ...overlappingLedgerFallback,
    });

    const status = scheduler.getRuntimeStatus();
    expect(status.mode).toBe('LIVE');
    expect(status.backgroundReady).toBe(false);
    expect(status.blockedByLedgerFallback).toBe(true);
    expect(status.disabledReason).toContain(
      'ledger fallback is LIVE for session-start facts',
    );
    expect(await scheduler.runOnce()).toBeNull();
    expect(recovery.runScheduled).not.toHaveBeenCalled();
  });

  it('logs a clear reason when the generic LIVE fallback blocks startup', () => {
    const { scheduler, recovery } = createScheduler({
      ...dedicatedLiveCanary,
      ...overlappingLedgerFallback,
    });
    const logger = Reflect.get(scheduler, 'logger') as {
      log: (message: string) => void;
    };
    const log = jest.spyOn(logger, 'log').mockImplementation();

    scheduler.onModuleInit();

    expect(log).toHaveBeenCalledWith(
      expect.stringContaining(
        'Generic guest game ledger fallback is LIVE for session-start facts in an overlapping scope.',
      ),
    );
    expect(recovery.runScheduled).not.toHaveBeenCalled();
  });

  it('preserves dedicated LIVE when the generic fallback is SHADOW or killed', async () => {
    for (const genericValues of [
      {
        ...overlappingLedgerFallback,
        GUEST_GAME_LEDGER_FALLBACK_MODE: 'SHADOW',
      },
      {
        ...overlappingLedgerFallback,
        GUEST_GAME_LEDGER_FALLBACK_KILL_SWITCH: 'true',
      },
    ]) {
      const { scheduler, recovery } = createScheduler({
        ...dedicatedLiveCanary,
        ...genericValues,
      });

      await scheduler.runOnce();

      expect(recovery.runScheduled).toHaveBeenCalledTimes(1);
      expect(scheduler.getRuntimeStatus().blockedByLedgerFallback).toBe(false);
    }
  });

  it('preserves dedicated SHADOW during generic LIVE comparison', async () => {
    const { scheduler, recovery } = createScheduler({
      ...dedicatedLiveCanary,
      ...overlappingLedgerFallback,
      GUEST_GAME_LOOT_BOX_RECOVERY_MODE: 'SHADOW',
    });

    await scheduler.runOnce();

    expect(recovery.runScheduled).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'SHADOW', tenantId: 'tenant-1' }),
    );
    expect(scheduler.getRuntimeStatus().blockedByLedgerFallback).toBe(false);
  });

  it('preserves dedicated LIVE for disjoint tenant and profile scopes', async () => {
    const disjointScopes = [
      {
        ...overlappingLedgerFallback,
        GUEST_GAME_LEDGER_FALLBACK_TENANT_ID: 'tenant-2',
      },
      {
        ...overlappingLedgerFallback,
        GUEST_GAME_LEDGER_FALLBACK_PLAY_TIME_ALLOW_ALL_PROFILES: 'false',
        GUEST_GAME_LEDGER_FALLBACK_PROFILE_ID: 'profile-2',
        GUEST_GAME_LEDGER_FALLBACK_SEASON_ID: 'season-1',
        GUEST_GAME_LEDGER_FALLBACK_BATTLE_PASS_STEP: '2',
      },
    ];

    for (const genericValues of disjointScopes) {
      const { scheduler, recovery } = createScheduler({
        ...dedicatedLiveCanary,
        ...genericValues,
      });

      await scheduler.runOnce();

      expect(recovery.runScheduled).toHaveBeenCalledTimes(1);
      expect(scheduler.getRuntimeStatus().blockedByLedgerFallback).toBe(false);
    }
  });

  it('preserves dedicated LIVE when generic LIVE has no session-start facts', async () => {
    const { scheduler, recovery } = createScheduler({
      ...dedicatedLiveCanary,
      ...overlappingLedgerFallback,
      GUEST_GAME_LEDGER_FALLBACK_FACT_TYPES:
        'SESSION_PLAY_TIME_ACCUMULATED,HOURLY_PLAY_TIME_ACCUMULATED',
    });

    await scheduler.runOnce();

    expect(recovery.runScheduled).toHaveBeenCalledTimes(1);
    expect(scheduler.getRuntimeStatus().blockedByLedgerFallback).toBe(false);
  });

  it('preserves dedicated LIVE when generic LIVE omits FACT_TYPES and therefore uses duration-only defaults', async () => {
    const { scheduler, recovery } = createScheduler({
      ...dedicatedLiveCanary,
      GUEST_GAME_LEDGER_FALLBACK_MODE: 'LIVE',
      GUEST_GAME_LEDGER_FALLBACK_KILL_SWITCH: 'false',
      GUEST_GAME_LEDGER_FALLBACK_TENANT_ID: 'tenant-1',
      GUEST_GAME_LEDGER_FALLBACK_PLAY_TIME_ALLOW_ALL_PROFILES: 'true',
      GUEST_GAME_LEDGER_FALLBACK_LIVE_NOT_BEFORE: '2026-07-24T10:00:00.000Z',
    });

    await scheduler.runOnce();

    expect(recovery.runScheduled).toHaveBeenCalledTimes(1);
    expect(scheduler.getRuntimeStatus().blockedByLedgerFallback).toBe(false);
  });

  it('keeps LIVE disabled while entitlement reads are OFF or SHADOW', async () => {
    const values = {
      GUEST_GAME_LOOT_BOX_RECOVERY_MODE: 'LIVE',
      GUEST_GAME_LOOT_BOX_RECOVERY_KILL_SWITCH: 'false',
      GUEST_GAME_LOOT_BOX_RECOVERY_TENANT_ID: 'tenant-1',
      GUEST_GAME_LOOT_BOX_RECOVERY_PROFILE_ID: 'profile-1',
      GUEST_GAME_LOOT_BOX_RECOVERY_LIVE_NOT_BEFORE: '2026-07-20T10:00:00.000Z',
      GUEST_GAME_ENTITLEMENT_READ_MODE: 'SHADOW',
    };
    const { scheduler, recovery } = createScheduler(values);

    expect(await scheduler.runOnce()).toBeNull();
    expect(recovery.runScheduled).not.toHaveBeenCalled();
  });

  it('keeps LIVE disabled when entitlement canary scopes do not match', async () => {
    const { scheduler, recovery } = createScheduler({
      GUEST_GAME_LOOT_BOX_RECOVERY_MODE: 'LIVE',
      GUEST_GAME_LOOT_BOX_RECOVERY_KILL_SWITCH: 'false',
      GUEST_GAME_LOOT_BOX_RECOVERY_TENANT_ID: 'tenant-1',
      GUEST_GAME_LOOT_BOX_RECOVERY_PROFILE_ID: 'profile-1',
      GUEST_GAME_LOOT_BOX_RECOVERY_LIVE_NOT_BEFORE: '2026-07-20T10:00:00.000Z',
      GUEST_GAME_ENTITLEMENT_READ_MODE: 'CANARY',
      GUEST_GAME_ENTITLEMENT_CANARY_TENANT_IDS: 'tenant-2',
      GUEST_GAME_ENTITLEMENT_CANARY_PROFILE_IDS: 'profile-1',
    });

    expect(await scheduler.runOnce()).toBeNull();
    expect(recovery.runScheduled).not.toHaveBeenCalled();
  });

  it('honors the kill switch', async () => {
    const { scheduler, recovery } = createScheduler({
      GUEST_GAME_LOOT_BOX_RECOVERY_MODE: 'SHADOW',
      GUEST_GAME_LOOT_BOX_RECOVERY_TENANT_ID: 'tenant-1',
      GUEST_GAME_LOOT_BOX_RECOVERY_KILL_SWITCH: 'true',
    });

    expect(await scheduler.runOnce()).toBeNull();
    expect(recovery.runScheduled).not.toHaveBeenCalled();
  });

  it.each([undefined, 'definitely-not-a-boolean'])(
    'fails closed when the kill switch is %s',
    async (killSwitch) => {
      const values: Record<string, string> = {
        GUEST_GAME_LOOT_BOX_RECOVERY_MODE: 'SHADOW',
        GUEST_GAME_LOOT_BOX_RECOVERY_TENANT_ID: 'tenant-1',
      };
      if (killSwitch !== undefined) {
        values.GUEST_GAME_LOOT_BOX_RECOVERY_KILL_SWITCH = killSwitch;
      }
      const { scheduler, recovery } = createScheduler(values);

      expect(await scheduler.runOnce()).toBeNull();
      expect(recovery.runScheduled).not.toHaveBeenCalled();
    },
  );

  it('runs only when the kill switch is explicitly false', async () => {
    const { scheduler, recovery } = createScheduler({
      GUEST_GAME_LOOT_BOX_RECOVERY_MODE: 'SHADOW',
      GUEST_GAME_LOOT_BOX_RECOVERY_KILL_SWITCH: 'false',
      GUEST_GAME_LOOT_BOX_RECOVERY_TENANT_ID: 'tenant-1',
    });

    await scheduler.runOnce();

    expect(recovery.runScheduled).toHaveBeenCalledTimes(1);
  });
});

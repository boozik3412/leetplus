import { TenantLifecycleStatus } from '@prisma/client';
import type { GuestGameEffectMaterializeResult } from './guest-gamification.service';
import { GuestGameRewardMaterializerSchedulerService } from './guest-game-reward-materializer-scheduler.service';

function materializeResult(
  overrides: Partial<GuestGameEffectMaterializeResult> = {},
): GuestGameEffectMaterializeResult {
  return {
    claimed: 0,
    applied: 0,
    recovered: 0,
    canceled: 0,
    failed: 0,
    deadLettered: 0,
    staleFinalizations: 0,
    rewardIds: [],
    ...overrides,
  };
}

function tenant(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 'tenant-1',
    slug: 'demo',
    status: TenantLifecycleStatus.ACTIVE,
    users: [
      {
        id: 'user-1',
        email: 'owner@example.com',
        fullName: null,
        role: 'OWNER',
        customRoleId: null,
        isPlatformAdmin: false,
      },
    ],
    ...overrides,
  };
}

function createScheduler(
  values: Record<string, string> = {},
  tenants: Record<string, unknown>[] = [tenant()],
) {
  const config = {
    get: jest.fn((key: string) => values[key]),
  };
  const prisma = {
    tenant: {
      findMany: jest.fn().mockResolvedValue(tenants),
    },
    guestGameRewardIntent: {
      groupBy: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    guestGameRewardEffect: {
      groupBy: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };
  const gamification = {
    materializeRewardIntents: jest.fn().mockResolvedValue(materializeResult()),
    materializeRewardEffects: jest.fn().mockResolvedValue(materializeResult()),
  };

  return {
    scheduler: new GuestGameRewardMaterializerSchedulerService(
      config as never,
      prisma as never,
      gamification as never,
    ),
    config,
    prisma,
    gamification,
  };
}

describe('GuestGameRewardMaterializerSchedulerService', () => {
  it('stays OFF by default', async () => {
    const { scheduler, prisma, gamification } = createScheduler();

    await expect(scheduler.runOnce()).resolves.toBeNull();
    expect(prisma.tenant.findMany).not.toHaveBeenCalled();
    expect(gamification.materializeRewardIntents).not.toHaveBeenCalled();
    expect(gamification.materializeRewardEffects).not.toHaveBeenCalled();
    const status = scheduler.getRuntimeStatus();
    expect(status).toMatchObject({
      enabled: false,
      backgroundReady: false,
      inlineClaimsAllowed: true,
      killSwitchEnabled: false,
      scope: {
        tenantId: null,
        tenantSlug: null,
        allowAllTenants: false,
        configured: false,
      },
      running: false,
      intervalMs: null,
      lastStartedAt: null,
      lastFinishedAt: null,
      lastOutcome: null,
      lastError: null,
      lastResult: null,
      lastSkipReason: 'background materializer is disabled',
    });
    expect(typeof status.lastSkippedAt).toBe('string');
  });

  it('fails closed when enabled without an explicit tenant scope', async () => {
    const { scheduler, prisma } = createScheduler({
      GUEST_GAME_REWARD_MATERIALIZER_ENABLED: 'true',
    });

    await expect(scheduler.runOnce()).resolves.toBeNull();
    expect(prisma.tenant.findMany).not.toHaveBeenCalled();
    expect(scheduler.getRuntimeStatus()).toMatchObject({
      enabled: true,
      backgroundReady: false,
      lastSkipReason: 'tenant scope is not configured',
    });
  });

  it('reports the configured background interval and scope after startup', () => {
    const { scheduler } = createScheduler({
      GUEST_GAME_REWARD_MATERIALIZER_ENABLED: 'true',
      GUEST_GAME_REWARD_MATERIALIZER_TENANT_SLUG: 'demo',
      GUEST_GAME_REWARD_MATERIALIZER_INTERVAL_MS: '12345',
    });
    jest.spyOn(scheduler, 'runOnce').mockResolvedValue(null);

    scheduler.onModuleInit();

    expect(scheduler.getRuntimeStatus()).toMatchObject({
      enabled: true,
      backgroundReady: true,
      killSwitchEnabled: false,
      scope: {
        tenantId: null,
        tenantSlug: 'demo',
        allowAllTenants: false,
        configured: true,
      },
      intervalMs: 12_345,
    });
    scheduler.onModuleDestroy();
    expect(scheduler.getRuntimeStatus().intervalMs).toBeNull();
  });

  it('materializes intents before effects for the scoped tenant', async () => {
    const { scheduler, prisma, gamification } = createScheduler({
      GUEST_GAME_REWARD_MATERIALIZER_ENABLED: 'true',
      GUEST_GAME_REWARD_MATERIALIZER_TENANT_SLUG: 'demo',
      GUEST_GAME_REWARD_MATERIALIZER_BATCH_SIZE: '12',
      GUEST_GAME_REWARD_MATERIALIZER_CLAIM_LEASE_MS: '90000',
      GUEST_GAME_REWARD_MATERIALIZER_MAX_ATTEMPTS: '7',
    });
    gamification.materializeRewardIntents.mockResolvedValue(
      materializeResult({ claimed: 2, applied: 1, rewardIds: ['reward-1'] }),
    );
    gamification.materializeRewardEffects.mockResolvedValue(
      materializeResult({
        claimed: 1,
        recovered: 1,
        rewardIds: ['reward-1'],
      }),
    );

    await expect(scheduler.runOnce()).resolves.toMatchObject({
      checkedTenants: 1,
      processedTenants: 1,
      erroredTenants: 0,
      intents: { claimed: 2, applied: 1, rewardIds: ['reward-1'] },
      effects: { claimed: 1, recovered: 1, rewardIds: ['reward-1'] },
    });
    expect(prisma.tenant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: 'demo' } }),
    );
    const expectedDto = {
      limit: 12,
      claimLeaseMs: 90_000,
      maxAttempts: 7,
    };
    expect(gamification.materializeRewardIntents).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1', tenantSlug: 'demo' }),
      expectedDto,
    );
    expect(gamification.materializeRewardEffects).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1', tenantSlug: 'demo' }),
      expectedDto,
    );
    expect(
      gamification.materializeRewardIntents.mock.invocationCallOrder[0],
    ).toBeLessThan(
      gamification.materializeRewardEffects.mock.invocationCallOrder[0] ?? 0,
    );
    expect(scheduler.getRuntimeStatus()).toMatchObject({
      running: false,
      lastOutcome: 'SUCCESS',
      lastError: null,
      lastResult: {
        checkedTenants: 1,
        processedTenants: 1,
        skippedTenants: 0,
        erroredTenants: 0,
        intents: { claimed: 2, applied: 1, rewardIds: ['reward-1'] },
        effects: { claimed: 1, recovered: 1, rewardIds: ['reward-1'] },
      },
    });
    expect(scheduler.getRuntimeStatus().lastStartedAt).toEqual(
      expect.any(String),
    );
    expect(scheduler.getRuntimeStatus().lastFinishedAt).toEqual(
      expect.any(String),
    );
  });

  it('requires an explicit opt-in before processing all tenants', async () => {
    const { scheduler, prisma } = createScheduler({
      GUEST_GAME_REWARD_MATERIALIZER_ENABLED: 'true',
      GUEST_GAME_REWARD_MATERIALIZER_ALLOW_ALL_TENANTS: 'true',
    });

    await expect(scheduler.runOnce()).resolves.toMatchObject({
      checkedTenants: 1,
      processedTenants: 1,
    });
    expect(prisma.tenant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );
  });

  it('honors the emergency kill switch', async () => {
    const { scheduler, prisma } = createScheduler({
      GUEST_GAME_REWARD_MATERIALIZER_ENABLED: 'true',
      GUEST_GAME_REWARD_MATERIALIZER_ALLOW_ALL_TENANTS: 'true',
      GUEST_GAME_REWARD_MATERIALIZER_KILL_SWITCH: 'true',
    });

    await expect(scheduler.runOnce()).resolves.toBeNull();
    expect(prisma.tenant.findMany).not.toHaveBeenCalled();
    expect(scheduler.getRuntimeStatus()).toMatchObject({
      enabled: true,
      backgroundReady: false,
      inlineClaimsAllowed: false,
      killSwitchEnabled: true,
      lastSkipReason: 'global kill switch is enabled',
    });
  });

  it('skips inactive tenants and tenants without an audit actor', async () => {
    const { scheduler, gamification } = createScheduler(
      {
        GUEST_GAME_REWARD_MATERIALIZER_ENABLED: 'true',
        GUEST_GAME_REWARD_MATERIALIZER_ALLOW_ALL_TENANTS: 'true',
      },
      [
        tenant({
          id: 'tenant-inactive',
          slug: 'inactive',
          status: TenantLifecycleStatus.SUSPENDED,
        }),
        tenant({ id: 'tenant-empty', slug: 'empty', users: [] }),
      ],
    );

    await expect(scheduler.runOnce()).resolves.toMatchObject({
      checkedTenants: 2,
      processedTenants: 0,
      skippedTenants: 2,
      tenants: [
        expect.objectContaining({
          tenantSlug: 'inactive',
          status: 'SKIPPED',
        }),
        expect.objectContaining({ tenantSlug: 'empty', status: 'SKIPPED' }),
      ],
    });
    expect(gamification.materializeRewardIntents).not.toHaveBeenCalled();
    expect(gamification.materializeRewardEffects).not.toHaveBeenCalled();
  });

  it('continues with effects when intent materialization fails', async () => {
    const { scheduler, gamification } = createScheduler({
      GUEST_GAME_REWARD_MATERIALIZER_ENABLED: 'true',
      GUEST_GAME_REWARD_MATERIALIZER_TENANT_ID: 'tenant-1',
    });
    gamification.materializeRewardIntents.mockRejectedValue(
      new Error('intent drain failed'),
    );
    gamification.materializeRewardEffects.mockResolvedValue(
      materializeResult({ claimed: 1, applied: 1 }),
    );

    await expect(scheduler.runOnce()).resolves.toMatchObject({
      checkedTenants: 1,
      processedTenants: 0,
      erroredTenants: 1,
      effects: { claimed: 1, applied: 1 },
      tenants: [
        expect.objectContaining({
          status: 'ERROR',
          reason: 'intents: intent drain failed',
        }),
      ],
    });
    expect(gamification.materializeRewardEffects).toHaveBeenCalledTimes(1);
    const status = scheduler.getRuntimeStatus();
    expect(status).toMatchObject({
      running: false,
      lastOutcome: 'ERROR',
      lastError: 'demo: intents: intent drain failed',
    });
    expect(status.lastResult?.checkedTenants).toBe(1);
    expect(status.lastResult?.erroredTenants).toBe(1);
  });

  it('reports a partial outcome when at least one tenant succeeds', async () => {
    const { scheduler, gamification } = createScheduler(
      {
        GUEST_GAME_REWARD_MATERIALIZER_ENABLED: 'true',
        GUEST_GAME_REWARD_MATERIALIZER_ALLOW_ALL_TENANTS: 'true',
      },
      [
        tenant({ id: 'tenant-error', slug: 'a-error' }),
        tenant({ id: 'tenant-ok', slug: 'b-ok' }),
      ],
    );
    gamification.materializeRewardIntents
      .mockRejectedValueOnce(new Error('claim failed'))
      .mockResolvedValueOnce(materializeResult({ claimed: 1, applied: 1 }));

    await expect(scheduler.runOnce()).resolves.toMatchObject({
      checkedTenants: 2,
      processedTenants: 1,
      erroredTenants: 1,
    });
    expect(scheduler.getRuntimeStatus()).toMatchObject({
      running: false,
      lastOutcome: 'PARTIAL',
      lastError: 'a-error: intents: claim failed',
      lastResult: {
        checkedTenants: 2,
        processedTenants: 1,
        skippedTenants: 0,
        erroredTenants: 1,
      },
    });
  });

  it('records a top-level scheduler failure in runtime status', async () => {
    const { scheduler, prisma } = createScheduler({
      GUEST_GAME_REWARD_MATERIALIZER_ENABLED: 'true',
      GUEST_GAME_REWARD_MATERIALIZER_ALLOW_ALL_TENANTS: 'true',
    });
    prisma.tenant.findMany.mockRejectedValueOnce(
      new Error('database unavailable'),
    );

    await expect(scheduler.runOnce()).resolves.toBeNull();
    const status = scheduler.getRuntimeStatus();
    expect(status).toMatchObject({
      running: false,
      lastOutcome: 'ERROR',
      lastError: 'database unavailable',
      lastResult: null,
    });
    expect(typeof status.lastStartedAt).toBe('string');
    expect(typeof status.lastFinishedAt).toBe('string');
  });

  it('does not overlap scheduler ticks', async () => {
    let release!: (value: GuestGameEffectMaterializeResult) => void;
    const { scheduler, gamification } = createScheduler({
      GUEST_GAME_REWARD_MATERIALIZER_ENABLED: 'true',
      GUEST_GAME_REWARD_MATERIALIZER_TENANT_SLUG: 'demo',
    });
    gamification.materializeRewardIntents.mockImplementation(
      () =>
        new Promise<GuestGameEffectMaterializeResult>((resolve) => {
          release = resolve;
        }),
    );

    const first = scheduler.runOnce();
    await Promise.resolve();
    expect(gamification.materializeRewardIntents).toHaveBeenCalledTimes(1);
    await expect(scheduler.runOnce()).resolves.toBeNull();
    const status = scheduler.getRuntimeStatus();
    expect(status).toMatchObject({
      running: true,
      lastSkipReason: 'previous materializer run is still running',
    });
    expect(typeof status.lastSkippedAt).toBe('string');
    release(materializeResult());
    await expect(first).resolves.toMatchObject({ processedTenants: 1 });
    expect(gamification.materializeRewardIntents).toHaveBeenCalledTimes(1);
    expect(gamification.materializeRewardEffects).toHaveBeenCalledTimes(1);
  });

  it('returns tenant-scoped intent and effect queue metrics', async () => {
    jest.useFakeTimers({ now: new Date('2026-07-18T12:00:00.000Z') });
    try {
      const { scheduler, prisma } = createScheduler({
        GUEST_GAME_REWARD_MATERIALIZER_MAX_ATTEMPTS: '9',
        GUEST_GAME_REWARD_MATERIALIZER_KILL_SWITCH: 'true',
      });
      prisma.guestGameRewardIntent.groupBy.mockResolvedValue([
        { status: 'PENDING', _count: { _all: 2 } },
        { status: 'PROCESSING', _count: { _all: 2 } },
        { status: 'APPLIED', _count: { _all: 5 } },
        { status: 'FAILED', _count: { _all: 1 } },
        { status: 'DEAD_LETTER', _count: { _all: 1 } },
      ]);
      prisma.guestGameRewardIntent.count
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(1);
      prisma.guestGameRewardIntent.findFirst.mockResolvedValue({
        createdAt: new Date('2026-07-18T11:58:00.000Z'),
      });
      prisma.guestGameRewardEffect.groupBy.mockResolvedValue([
        { status: 'PENDING', _count: { _all: 1 } },
        { status: 'PROCESSING', _count: { _all: 4 } },
        { status: 'APPLIED', _count: { _all: 7 } },
        { status: 'FAILED', _count: { _all: 2 } },
        { status: 'DEAD_LETTER', _count: { _all: 2 } },
        { status: 'CANCELED', _count: { _all: 1 } },
      ]);
      prisma.guestGameRewardEffect.count
        .mockResolvedValueOnce(4)
        .mockResolvedValueOnce(4)
        .mockResolvedValueOnce(2);
      prisma.guestGameRewardEffect.findFirst.mockResolvedValue({
        createdAt: new Date('2026-07-18T11:55:00.000Z'),
      });

      await expect(
        scheduler.getTenantQueueSnapshot({ tenantId: ' tenant-1 ' }),
      ).resolves.toEqual({
        tenantId: 'tenant-1',
        observedAt: '2026-07-18T12:00:00.000Z',
        maxAttempts: 9,
        intents: {
          total: 11,
          statusCounts: {
            PENDING: 2,
            PROCESSING: 2,
            APPLIED: 5,
            FAILED: 1,
            DEAD_LETTER: 1,
            CANCELED: 0,
          },
          ready: 3,
          processing: 2,
          expiredLeases: 1,
          deadLetters: 1,
          oldestReadyCreatedAt: '2026-07-18T11:58:00.000Z',
          oldestReadyAgeMs: 120_000,
        },
        effects: {
          total: 17,
          statusCounts: {
            PENDING: 1,
            PROCESSING: 4,
            APPLIED: 7,
            FAILED: 2,
            DEAD_LETTER: 2,
            CANCELED: 1,
          },
          ready: 4,
          processing: 4,
          expiredLeases: 2,
          deadLetters: 2,
          oldestReadyCreatedAt: '2026-07-18T11:55:00.000Z',
          oldestReadyAgeMs: 300_000,
        },
      });

      for (const delegate of [
        prisma.guestGameRewardIntent,
        prisma.guestGameRewardEffect,
      ]) {
        for (const method of [
          delegate.groupBy,
          delegate.count,
          delegate.findFirst,
        ]) {
          const calls = method.mock.calls as unknown as Array<[unknown]>;
          for (const [argument] of calls) {
            const query = argument as { where?: unknown };
            const where = query.where as { tenantId?: unknown } | undefined;
            expect(where?.tenantId).toBe('tenant-1');
          }
        }
        const firstCountCall = delegate.count.mock.calls[0] as unknown as [
          { where?: { tenantId?: unknown; attempts?: unknown } },
        ];
        expect(firstCountCall[0].where?.tenantId).toBe('tenant-1');
        expect(firstCountCall[0].where?.attempts).toEqual({ lt: 9 });
      }

      for (const method of [
        prisma.guestGameRewardIntent.groupBy,
        prisma.guestGameRewardIntent.count,
        prisma.guestGameRewardIntent.findFirst,
      ]) {
        const calls = method.mock.calls as unknown as Array<
          [{ where?: Record<string, unknown> }]
        >;
        for (const [argument] of calls) {
          expect(argument.where?.effectKind).toBe('REWARD');
        }
      }
      for (const method of [
        prisma.guestGameRewardEffect.groupBy,
        prisma.guestGameRewardEffect.count,
        prisma.guestGameRewardEffect.findFirst,
      ]) {
        const calls = method.mock.calls as unknown as Array<
          [{ where?: Record<string, unknown> }]
        >;
        for (const [argument] of calls) {
          expect(argument.where).not.toHaveProperty('effectKind');
        }
      }
    } finally {
      jest.useRealTimers();
    }
  });

  it('reports an empty queue and rejects an unscoped snapshot', async () => {
    const { scheduler, prisma } = createScheduler();

    await expect(
      scheduler.getTenantQueueSnapshot({ tenantId: 'tenant-empty' }),
    ).resolves.toMatchObject({
      tenantId: 'tenant-empty',
      intents: {
        total: 0,
        ready: 0,
        processing: 0,
        expiredLeases: 0,
        deadLetters: 0,
        oldestReadyCreatedAt: null,
        oldestReadyAgeMs: null,
      },
      effects: {
        total: 0,
        ready: 0,
        processing: 0,
        expiredLeases: 0,
        deadLetters: 0,
        oldestReadyCreatedAt: null,
        oldestReadyAgeMs: null,
      },
    });

    jest.clearAllMocks();
    await expect(
      scheduler.getTenantQueueSnapshot({ tenantId: '  ' }),
    ).rejects.toThrow('A tenant id is required');
    expect(prisma.guestGameRewardIntent.groupBy).not.toHaveBeenCalled();
    expect(prisma.guestGameRewardEffect.groupBy).not.toHaveBeenCalled();
  });
});

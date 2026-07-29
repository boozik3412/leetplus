/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */

import { ConfigService } from '@nestjs/config';
import {
  IntegrationProvider,
  Prisma,
  TenantLifecycleStatus,
  TenantModule,
  UserRole,
} from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  GuestBonusLedgerService,
  type GuestGameBonusLedgerDispatchResult,
} from './guest-bonus-ledger.service';

const user: AuthenticatedUser = {
  id: 'user-1',
  email: 'owner@example.com',
  fullName: 'Owner',
  role: UserRole.OWNER,
  isPlatformAdmin: false,
  tenantId: 'tenant-1',
  tenantSlug: 'demo',
  tenantStatus: TenantLifecycleStatus.ACTIVE,
};

function createPrismaMock() {
  return {
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
    guestBonusLedgerEntry: {
      groupBy: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      createMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    guestGameReward: {
      fields: {
        claimExpiresAt: 'claimExpiresAt-field-ref',
      },
      count: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    guestGameRewardWalletItem: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
    guestGameEvent: {
      create: jest.fn(),
    },
    guestGameDelivery: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    guestGameDeliveryEvent: {
      createMany: jest.fn(),
    },
    guest: {
      findFirst: jest.fn(),
    },
    guestGameProfile: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
    staffMember: {
      findMany: jest.fn(),
    },
    langameStaffUser: {
      findMany: jest.fn(),
    },
    store: {
      findFirst: jest.fn(),
    },
    tenant: {
      findMany: jest.fn(),
    },
  } as any;
}

function createService(configValues: Record<string, string | undefined> = {}) {
  const prisma = createPrismaMock();
  const configService = {
    get: jest.fn((key: string) => configValues[key]),
  } as unknown as ConfigService;
  const langameClient = {
    postEndpoint: jest.fn(),
    adjustGuestBalanceByPhone: jest.fn(),
  };
  const langameSettingsService = {
    resolveTenantAccess: jest.fn().mockResolvedValue({
      apiKey: 'request-token',
      sources: [
        {
          domain: 'club-1',
          baseUrl: 'https://46.langamepro.ru/public_api',
        },
      ],
    }),
  };
  const secretEncryptionService = {
    decrypt: jest.fn((value: string) => value),
  };
  const admittedDecision = {
    allowed: true,
    tenantId: user.tenantId,
    reasonCode: 'ALLOWED',
    failedRequirement: null,
    entitlementProfileRevision: 1,
    executionRevision: 3,
    customerStage: 'PILOT',
    internalEntitlementBypass: false,
  };
  const executionPermit = {
    tenantId: user.tenantId,
    executionRevision: 3,
    requirements: [
      { module: TenantModule.GAMIFICATION, action: 'OUTBOUND' },
      { module: TenantModule.INTEGRATIONS, action: 'OUTBOUND' },
    ],
  };
  const tenantExecutionAdmission = {
    evaluate: jest.fn().mockResolvedValue(admittedDecision),
    acquirePermit: jest.fn().mockResolvedValue({
      decision: admittedDecision,
      permit: executionPermit,
    }),
    evaluatePermit: jest.fn().mockResolvedValue(admittedDecision),
  };
  const service = new GuestBonusLedgerService(
    prisma,
    configService,
    langameClient as any,
    langameSettingsService as any,
    secretEncryptionService as any,
    tenantExecutionAdmission as any,
  );

  prisma.guestBonusLedgerEntry.groupBy.mockResolvedValue([]);
  prisma.guestBonusLedgerEntry.count.mockResolvedValue(1);
  prisma.$queryRaw.mockResolvedValue([]);
  prisma.guestBonusLedgerEntry.findFirst.mockResolvedValue(null);
  prisma.guestBonusLedgerEntry.createMany.mockResolvedValue({ count: 0 });
  prisma.guestBonusLedgerEntry.update.mockResolvedValue({});
  prisma.guestBonusLedgerEntry.updateMany.mockResolvedValue({ count: 1 });
  prisma.guestGameReward.count.mockResolvedValue(0);
  prisma.guestGameReward.findMany.mockResolvedValue([]);
  prisma.guestGameReward.findFirst.mockResolvedValue({
    id: 'reward-1',
    status: 'APPROVED',
    claimRequired: false,
    deliveryRequestedAt: null,
    claimExpiresAt: null,
    expiresAt: null,
  });
  prisma.guestGameReward.update.mockResolvedValue({});
  prisma.guestGameReward.updateMany.mockResolvedValue({ count: 0 });
  prisma.guestGameRewardWalletItem.findFirst.mockResolvedValue(null);
  prisma.guestGameRewardWalletItem.updateMany.mockResolvedValue({ count: 1 });
  prisma.guestGameEvent.create.mockResolvedValue({});
  prisma.guestGameDelivery.findMany.mockResolvedValue([]);
  prisma.guestGameDelivery.updateMany.mockResolvedValue({ count: 0 });
  prisma.guestGameDeliveryEvent.createMany.mockResolvedValue({ count: 0 });
  prisma.guest.findFirst.mockResolvedValue(null);
  prisma.guestGameProfile.findFirst.mockResolvedValue(null);
  prisma.guestGameProfile.updateMany.mockResolvedValue({ count: 0 });
  prisma.staffMember.findMany.mockResolvedValue([]);
  prisma.langameStaffUser.findMany.mockResolvedValue([]);
  prisma.store.findFirst.mockResolvedValue(null);
  prisma.tenant.findMany.mockResolvedValue([]);
  prisma.$transaction.mockImplementation((callback) => callback(prisma));

  return {
    prisma,
    configService,
    langameClient,
    langameSettingsService,
    secretEncryptionService,
    tenantExecutionAdmission,
    service,
  };
}

function ledgerEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ledger-1',
    tenantId: user.tenantId,
    guestId: 'guest-1',
    profileId: 'profile-1',
    rewardId: 'reward-1',
    storeId: null,
    externalProvider: IntegrationProvider.LANGAME,
    externalDomain: 'club-1',
    externalGuestId: 'lg-guest-1',
    idempotencyKey: 'guest-game-reward:reward-1:bonus:v1',
    entryType: 'EARN',
    source: 'GAMIFICATION_REWARD',
    status: 'PENDING',
    amount: new Prisma.Decimal(25),
    attempts: 0,
    claimGeneration: 1,
    lockedAt: new Date('2026-06-10T10:00:00.000Z'),
    executionRevision: 3,
    reason: 'Bonus reward',
    metadata: {},
    createdAt: new Date('2026-06-10T10:00:00.000Z'),
    ...overrides,
  };
}

function ledgerTransactionMock() {
  const tx = {
    $queryRaw: jest.fn(),
    guestBonusBalanceCurrent: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    guestBonusLedgerEntry: {
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    guestGameReward: {
      fields: {
        claimExpiresAt: 'claimExpiresAt-field-ref',
      },
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    guestGameRewardWalletItem: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
    guestGameProfile: {
      updateMany: jest.fn(),
    },
    guestGameEvent: {
      create: jest.fn(),
    },
  };
  tx.guestBonusLedgerEntry.updateMany.mockResolvedValue({ count: 1 });
  tx.guestGameRewardWalletItem.updateMany.mockResolvedValue({ count: 1 });
  return tx;
}

function dispatchResult(
  overrides: Partial<GuestGameBonusLedgerDispatchResult> = {},
): GuestGameBonusLedgerDispatchResult {
  return {
    mode: 'READY',
    dryRun: false,
    canary: false,
    ready: true,
    queued: null,
    checked: 0,
    confirmed: 0,
    failed: 0,
    skipped: 0,
    blocked: 0,
    items: [],
    status: {
      mode: 'READY',
      modeLabel: 'Готов к записи в Langame',
      ready: true,
      langamePath: '/master_api/guests/balance/phone',
      rewardTypes: ['BONUS'],
      pendingApprovedRewards: 0,
      pending: 0,
      processing: 0,
      confirmed: 0,
      failed: 0,
      canceled: 0,
      total: 0,
      note: 'ready',
    },
    note: 'processed',
    ...overrides,
  };
}

describe('GuestBonusLedgerService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.GUEST_GAME_DELIVERY_REAL_SEND_ENABLED;
    delete process.env.GUEST_GAME_DELIVERY_TELEGRAM_ENABLED;
    delete process.env.GUEST_GAME_DELIVERY_TELEGRAM_BOT_TOKEN;
    delete process.env.GUEST_GAME_MAX_DELIVERY_ENABLED;
    delete process.env.GUEST_GAME_MAX_DELIVERY_LIVE_CANARY_ENABLED;
    delete process.env.GUEST_GAME_MAX_BOT_TOKEN;
  });

  it('reports dry-run mode by default when Langame write config is absent', async () => {
    const { service, prisma } = createService();

    prisma.guestBonusLedgerEntry.groupBy.mockResolvedValue([
      { status: 'PENDING', _count: { _all: 2 } },
      { status: 'CONFIRMED', _count: { _all: 3 } },
    ]);
    prisma.guestGameReward.count.mockResolvedValue(4);

    const status = await service.getStatus(user);

    expect(status).toMatchObject({
      mode: 'DRY_RUN',
      ready: false,
      langamePath: '/master_api/guests/balance/phone',
      pendingApprovedRewards: 4,
      pending: 2,
      confirmed: 3,
      total: 5,
    });
  });

  it('previews pending entries in dry-run without claim, status changes, or Langame writes', async () => {
    const { service, prisma, langameClient, langameSettingsService } =
      createService();

    prisma.guestBonusLedgerEntry.findMany.mockResolvedValue([
      ledgerEntry(),
      ledgerEntry({
        id: 'ledger-2',
        rewardId: 'reward-2',
        amount: new Prisma.Decimal(30),
      }),
    ]);
    prisma.guestBonusLedgerEntry.groupBy.mockResolvedValue([
      { status: 'PENDING', _count: { _all: 2 } },
    ]);

    const result = await service.dispatch(user, {
      limit: 5,
      queueApprovedRewards: false,
      storeId: 'store-1337',
    });

    expect(result).toMatchObject({
      mode: 'DRY_RUN',
      dryRun: true,
      ready: false,
      queued: null,
      checked: 2,
      confirmed: 0,
      failed: 0,
      skipped: 2,
      blocked: 0,
    });
    expect(result.items).toEqual([
      expect.objectContaining({
        ledgerEntryId: 'ledger-1',
        rewardId: 'reward-1',
        status: 'DRY_RUN',
        amount: 25,
      }),
      expect.objectContaining({
        ledgerEntryId: 'ledger-2',
        rewardId: 'reward-2',
        status: 'DRY_RUN',
        amount: 30,
      }),
    ]);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.guestBonusLedgerEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: user.tenantId,
          storeId: 'store-1337',
        }),
        take: 5,
      }),
    );
    expect(prisma.guestBonusLedgerEntry.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: user.tenantId,
          storeId: 'store-1337',
        }),
      }),
    );
    expect(langameSettingsService.resolveTenantAccess).not.toHaveBeenCalled();
    expect(langameClient.postEndpoint).not.toHaveBeenCalled();
    expect(langameClient.adjustGuestBalanceByPhone).not.toHaveBeenCalled();
  });

  it('blocks dispatch in disabled mode without claiming ledger entries', async () => {
    const { service, prisma, langameClient, langameSettingsService } =
      createService();

    prisma.guestBonusLedgerEntry.groupBy.mockResolvedValue([
      { status: 'PENDING', _count: { _all: 2 } },
      { status: 'FAILED', _count: { _all: 1 } },
    ]);

    const result = await service.dispatch(user, {
      dryRun: false,
      queueApprovedRewards: false,
    });

    expect(result).toMatchObject({
      mode: 'DISABLED',
      dryRun: false,
      ready: false,
      checked: 0,
      confirmed: 0,
      failed: 0,
      skipped: 0,
      blocked: 3,
      items: [],
    });
    expect(prisma.guestBonusLedgerEntry.findMany).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(langameSettingsService.resolveTenantAccess).not.toHaveBeenCalled();
    expect(langameClient.postEndpoint).not.toHaveBeenCalled();
    expect(langameClient.adjustGuestBalanceByPhone).not.toHaveBeenCalled();
  });

  it('claims and processes ready entries only when Langame write config is enabled', async () => {
    const { service, prisma, langameSettingsService } = createService({
      LANGAME_BONUS_ACCRUAL_ENABLED: 'true',
    });
    const entry = ledgerEntry({ storeId: 'store-1337' });
    const access = {
      apiKey: 'secret',
      sources: [],
    };

    prisma.guestBonusLedgerEntry.groupBy.mockResolvedValue([
      { status: 'CONFIRMED', _count: { _all: 1 } },
    ]);
    langameSettingsService.resolveTenantAccess.mockResolvedValue(access);
    jest.spyOn(service as any, 'claimReadyEntries').mockResolvedValue([entry]);
    jest.spyOn(service as any, 'processClaimedEntry').mockResolvedValue({
      ledgerEntryId: 'ledger-1',
      rewardId: 'reward-1',
      status: 'CONFIRMED',
      amount: 25,
      externalDomain: 'club-1',
      externalGuestId: 'lg-guest-1',
      note: 'confirmed',
    });

    const result = await service.dispatch(user, {
      dryRun: false,
      queueApprovedRewards: false,
      limit: 1,
    });

    expect(result).toMatchObject({
      mode: 'READY',
      dryRun: false,
      ready: true,
      checked: 1,
      confirmed: 1,
      failed: 0,
      skipped: 0,
      blocked: 0,
    });
    expect(langameSettingsService.resolveTenantAccess).not.toHaveBeenCalled();
    expect((service as any).claimReadyEntries).toHaveBeenCalledWith(
      user.tenantId,
      expect.objectContaining({
        ready: true,
        path: '/master_api/guests/balance/phone',
        limit: 1,
      }),
    );
    expect((service as any).processClaimedEntry).toHaveBeenCalledWith(
      user.id,
      entry,
      expect.objectContaining({ path: '/master_api/guests/balance/phone' }),
    );
  });

  it('promotes only stale DISPATCHING rows to reconciliation before queue claim without a provider retry', async () => {
    const { service, prisma, langameClient, langameSettingsService } =
      createService({
        LANGAME_BONUS_ACCRUAL_ENABLED: 'true',
        LANGAME_BONUS_ACCRUAL_PATH: '/master_api/guests/balance/phone',
        LANGAME_BONUS_ACCRUAL_STALE_LOCK_MINUTES: '15',
      });
    const now = Date.now();
    const staleLockedAt = new Date(now - 30 * 60 * 1000);
    const staleUpdatedAt = new Date(now - 29 * 60 * 1000);
    const freshLockedAt = new Date(now - 2 * 60 * 1000);
    const freshUpdatedAt = new Date(now - 60 * 1000);
    const stale = {
      id: 'ledger-stale-dispatch',
      tenantId: user.tenantId,
      rewardId: 'reward-stale',
      status: 'DISPATCHING',
      attempts: 1,
      claimGeneration: 7,
      lockedAt: staleLockedAt,
      updatedAt: staleUpdatedAt,
      errorCode: null,
      errorMessage: null,
      metadata: { original: true },
    };
    const fresh = {
      ...stale,
      id: 'ledger-fresh-dispatch',
      rewardId: 'reward-fresh',
      lockedAt: freshLockedAt,
      updatedAt: freshUpdatedAt,
    };

    prisma.$queryRaw.mockResolvedValue([stale, fresh]);
    langameSettingsService.resolveTenantAccess.mockResolvedValue({
      apiKey: 'secret',
      sources: [],
    });
    jest.spyOn(service as any, 'claimReadyEntries').mockResolvedValue([]);

    await service.dispatch(user, {
      dryRun: false,
      queueApprovedRewards: false,
    });

    expect(prisma.guestBonusLedgerEntry.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.guestBonusLedgerEntry.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'ledger-stale-dispatch',
        tenantId: user.tenantId,
        status: 'DISPATCHING',
        attempts: 1,
        claimGeneration: 7,
        lockedAt: staleLockedAt,
        updatedAt: staleUpdatedAt,
      },
      data: expect.objectContaining({
        status: 'RECONCILIATION_REQUIRED',
        processedByUserId: user.id,
        lockedAt: null,
        nextAttemptAt: null,
        errorCode: 'STALE_DISPATCH_OUTCOME_UNKNOWN',
        metadata: expect.objectContaining({
          original: true,
          staleDispatchPromotion: expect.objectContaining({
            previousStatus: 'DISPATCHING',
            attempts: 1,
            claimGeneration: 7,
            staleThresholdMinutes: 15,
            reason: 'DISPATCH_CRASH_OR_HTTP_OUTCOME_UNKNOWN',
          }),
        }),
      }),
    });
    expect(
      prisma.guestBonusLedgerEntry.updateMany.mock.calls.some(
        ([args]) => args.where.id === 'ledger-fresh-dispatch',
      ),
    ).toBe(false);
    expect(prisma.guestGameRewardWalletItem.updateMany).not.toHaveBeenCalled();
    expect(langameClient.adjustGuestBalanceByPhone).not.toHaveBeenCalled();
    expect(langameClient.postEndpoint).not.toHaveBeenCalled();

    const query = prisma.$queryRaw.mock.calls[0][0] as {
      strings?: string[];
    };
    const sql = query.strings?.join('?') ?? '';
    expect(sql).toContain('ledger."status" = \'DISPATCHING\'');
    expect(sql).toContain('GREATEST(');
    expect(sql).toContain('FOR UPDATE SKIP LOCKED');
  });

  it('rejects a claim without a positive execution revision', async () => {
    const { service, prisma } = createService();

    await expect(
      (service as any).claimReadyEntries(user.tenantId, {
        mode: 'READY',
        dryRun: false,
        canary: false,
        ready: true,
        enabled: true,
        path: '/master_api/guests/balance/phone',
        rewardTypes: ['BONUS_BALANCE'],
        storeId: null,
        rewardId: null,
        limit: 1,
        maxAttempts: 5,
        retryMinutes: 1,
        staleLockMinutes: 15,
        executionRevision: null,
      }),
    ).rejects.toThrow(
      'Bonus ledger claim requires a current tenant execution revision',
    );
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('claims max-attempt guest portal domain failures for source recovery', async () => {
    const { service, prisma } = createService();

    prisma.$queryRaw.mockResolvedValue([]);

    await (service as any).claimReadyEntries(user.tenantId, {
      mode: 'READY',
      dryRun: false,
      canary: false,
      ready: true,
      enabled: true,
      path: '/master_api/guests/balance/phone',
      rewardTypes: ['BONUS_BALANCE'],
      storeId: null,
      rewardId: null,
      limit: 1,
      maxAttempts: 5,
      retryMinutes: 1,
      staleLockMinutes: 15,
      executionRevision: 3,
    });

    const query = prisma.$queryRaw.mock.calls[0][0] as {
      strings?: string[];
      values?: unknown[];
    };
    expect(query.strings).toBeDefined();
    const sql = query.strings?.join('?') ?? '';

    expect(sql).toContain('"attempts" >=');
    expect(sql).toContain('"claimGeneration" = "claimGeneration" + 1');
    expect(sql).toContain('"executionRevision" = ?');
    expect(sql).toContain('"claimGeneration",');
    expect(sql).toContain('"executionRevision",');
    expect(sql).toContain('"externalDomain" = ?');
    expect(sql).toContain('"errorMessage" ILIKE ?');
    expect(sql).toContain('FROM "GuestGameReward" AS reward');
    expect(sql).toContain('reward."status" = \'APPROVED\'');
    expect(sql).toContain('reward."claimRequired" = TRUE');
    expect(sql).toContain(
      'reward."deliveryRequestedAt" < reward."claimExpiresAt"',
    );
    expect(sql).toContain('FROM "GuestGameRewardWalletItem" AS wallet');
    expect(sql).toContain("wallet.\"status\" IN ('PROCESSING', 'FAILED')");
    expect(sql).toContain('retry_wallet."status" = \'PROCESSING\'');
    expect(sql).not.toContain('reward."claimExpiresAt" > NOW()');
    expect(query.values).toEqual(
      expect.arrayContaining([
        'leetplus-guest-portal',
        '%leetplus-guest-portal%',
        3,
      ]),
    );
  });

  it('moves only the exact claimed revision and attempt to DISPATCHING', async () => {
    const { service, prisma } = createService();
    const entry = ledgerEntry({
      rewardId: null,
      status: 'PROCESSING',
      attempts: 2,
    });

    await expect(
      (service as any).markEntryDispatching(user.id, entry, {
        phone: '+7 *** **-33',
        value: 25,
      }),
    ).resolves.toBe(true);

    expect(prisma.guestBonusLedgerEntry.updateMany).toHaveBeenCalledWith({
      where: {
        id: entry.id,
        tenantId: entry.tenantId,
        status: 'PROCESSING',
        attempts: entry.attempts,
        claimGeneration: entry.claimGeneration,
        lockedAt: entry.lockedAt,
        executionRevision: entry.executionRevision,
      },
      data: expect.objectContaining({
        status: 'DISPATCHING',
        processedByUserId: user.id,
      }),
    });
  });

  it('does not claim or call Langame when no outbound execution permit can be acquired', async () => {
    const {
      service,
      prisma,
      langameClient,
      langameSettingsService,
      tenantExecutionAdmission,
    } = createService({
      LANGAME_BONUS_ACCRUAL_ENABLED: 'true',
    });
    const deniedDecision = {
      allowed: false,
      tenantId: user.tenantId,
      reasonCode: 'ENTITLEMENT_OUTBOUND_DISABLED',
      failedRequirement: {
        module: TenantModule.INTEGRATIONS,
        action: 'OUTBOUND',
      },
      entitlementProfileRevision: 1,
      executionRevision: 4,
      customerStage: 'PILOT',
      internalEntitlementBypass: false,
    };
    tenantExecutionAdmission.acquirePermit.mockResolvedValueOnce({
      decision: deniedDecision,
      permit: null,
    });
    prisma.guestBonusLedgerEntry.groupBy.mockResolvedValue([
      { status: 'PENDING', _count: { _all: 2 } },
    ]);

    await expect(
      service.dispatch(user, {
        dryRun: false,
        queueApprovedRewards: false,
      }),
    ).resolves.toMatchObject({
      mode: 'READY',
      ready: true,
      checked: 0,
      blocked: 2,
      note: expect.stringContaining('ENTITLEMENT_OUTBOUND_DISABLED'),
    });

    expect(tenantExecutionAdmission.acquirePermit).toHaveBeenCalledWith(
      user.tenantId,
      [
        {
          module: TenantModule.GAMIFICATION,
          action: 'OUTBOUND',
        },
        {
          module: TenantModule.INTEGRATIONS,
          action: 'OUTBOUND',
        },
      ],
    );
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(langameSettingsService.resolveTenantAccess).not.toHaveBeenCalled();
    expect(langameClient.adjustGuestBalanceByPhone).not.toHaveBeenCalled();
  });

  it('does not auto-queue, claim, or call Langame when the admitted background stage is missing', async () => {
    const {
      service,
      prisma,
      langameClient,
      langameSettingsService,
      tenantExecutionAdmission,
    } = createService({
      LANGAME_BONUS_ACCRUAL_ENABLED: 'true',
    });
    tenantExecutionAdmission.acquirePermit.mockResolvedValueOnce({
      decision: {
        allowed: true,
        tenantId: user.tenantId,
        reasonCode: 'ALLOWED',
        failedRequirement: null,
        entitlementProfileRevision: 1,
        executionRevision: 4,
        customerStage: null,
        internalEntitlementBypass: false,
      },
      permit: {
        tenantId: user.tenantId,
        executionRevision: 4,
        requirements: [
          {
            module: TenantModule.GAMIFICATION,
            action: 'OUTBOUND',
          },
          {
            module: TenantModule.INTEGRATIONS,
            action: 'OUTBOUND',
          },
        ],
      },
    });
    prisma.guestBonusLedgerEntry.groupBy.mockResolvedValue([
      { status: 'PENDING', _count: { _all: 2 } },
    ]);
    const queueApprovedRewards = jest.spyOn(service, 'queueApprovedRewards');

    await expect(
      service.dispatch(user, {
        dryRun: false,
        queueApprovedRewards: true,
      }),
    ).resolves.toMatchObject({
      mode: 'READY',
      ready: true,
      checked: 0,
      blocked: 2,
      note: expect.stringContaining('BACKGROUND_EXECUTION_STAGE_REQUIRED'),
    });

    expect(queueApprovedRewards).not.toHaveBeenCalled();
    expect(prisma.guestBonusLedgerEntry.createMany).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(langameSettingsService.resolveTenantAccess).not.toHaveBeenCalled();
    expect(langameClient.adjustGuestBalanceByPhone).not.toHaveBeenCalled();
  });

  it('does not pass guest portal pseudo-user as ledger processor id', async () => {
    const { service, prisma, langameSettingsService } = createService({
      LANGAME_BONUS_ACCRUAL_ENABLED: 'true',
    });
    const guestPortalUser: AuthenticatedUser = {
      ...user,
      id: 'guest-portal:profile-1',
      email: 'guest-portal@leetplus.local',
    };
    const entry = ledgerEntry();
    const access = {
      apiKey: 'secret',
      sources: [],
    };

    prisma.guestBonusLedgerEntry.groupBy.mockResolvedValue([
      { status: 'PENDING', _count: { _all: 1 } },
    ]);
    langameSettingsService.resolveTenantAccess.mockResolvedValue(access);
    jest.spyOn(service as any, 'claimReadyEntries').mockResolvedValue([entry]);
    jest.spyOn(service as any, 'processClaimedEntry').mockResolvedValue({
      ledgerEntryId: 'ledger-1',
      rewardId: 'reward-1',
      status: 'CONFIRMED',
      amount: 25,
      externalDomain: 'club-1',
      externalGuestId: 'lg-guest-1',
      note: 'confirmed',
    });

    await service.dispatch(guestPortalUser, {
      dryRun: false,
      queueApprovedRewards: false,
      limit: 1,
    });

    expect((service as any).processClaimedEntry).toHaveBeenCalledWith(
      null,
      entry,
      expect.objectContaining({ path: '/master_api/guests/balance/phone' }),
    );
  });

  it('forces canary dispatch to one existing ledger entry without auto-queueing rewards', async () => {
    const { service, prisma, langameSettingsService } = createService({
      LANGAME_BONUS_ACCRUAL_ENABLED: 'true',
    });
    const entry = ledgerEntry();
    const access = {
      apiKey: 'secret',
      sources: [],
    };
    const queueApprovedRewards = jest.spyOn(service, 'queueApprovedRewards');

    prisma.guestBonusLedgerEntry.groupBy.mockResolvedValue([
      { status: 'PENDING', _count: { _all: 4 } },
    ]);
    langameSettingsService.resolveTenantAccess.mockResolvedValue(access);
    jest.spyOn(service as any, 'claimReadyEntries').mockResolvedValue([entry]);
    jest.spyOn(service as any, 'processClaimedEntry').mockResolvedValue({
      ledgerEntryId: 'ledger-1',
      rewardId: 'reward-1',
      status: 'CONFIRMED',
      amount: 25,
      externalDomain: 'club-1',
      externalGuestId: 'lg-guest-1',
      note: 'confirmed',
    });

    const result = await service.dispatch(user, {
      dryRun: false,
      canary: true,
      queueApprovedRewards: true,
      limit: 25,
      storeId: 'store-1337',
    });

    expect(result).toMatchObject({
      mode: 'READY',
      dryRun: false,
      canary: true,
      ready: true,
      queued: null,
      checked: 1,
      confirmed: 1,
    });
    expect(queueApprovedRewards).not.toHaveBeenCalled();
    expect((service as any).claimReadyEntries).toHaveBeenCalledWith(
      user.tenantId,
      expect.objectContaining({
        canary: true,
        limit: 1,
        storeId: 'store-1337',
      }),
    );
  });

  it('runs scheduled dispatch per active tenant with audit-safe actors and isolated failures', async () => {
    const { service, prisma } = createService({
      LANGAME_BONUS_ACCRUAL_ENABLED: 'true',
    });
    const dispatch = jest.spyOn(service, 'dispatch');

    prisma.tenant.findMany.mockResolvedValue([
      {
        id: 'tenant-active',
        slug: 'active',
        status: TenantLifecycleStatus.ACTIVE,
        users: [
          {
            id: 'manager-1',
            email: 'manager@example.com',
            fullName: 'Manager',
            role: UserRole.MANAGER,
            customRoleId: null,
            isPlatformAdmin: false,
          },
          {
            id: 'owner-1',
            email: 'owner@example.com',
            fullName: 'Owner',
            role: UserRole.OWNER,
            customRoleId: null,
            isPlatformAdmin: false,
          },
        ],
      },
      {
        id: 'tenant-suspended',
        slug: 'suspended',
        status: TenantLifecycleStatus.SUSPENDED,
        users: [
          {
            id: 'owner-2',
            email: 'owner2@example.com',
            fullName: 'Owner 2',
            role: UserRole.OWNER,
            customRoleId: null,
            isPlatformAdmin: false,
          },
        ],
      },
      {
        id: 'tenant-no-actor',
        slug: 'no-actor',
        status: TenantLifecycleStatus.ACTIVE,
        users: [],
      },
      {
        id: 'tenant-error',
        slug: 'error',
        status: TenantLifecycleStatus.ACTIVE,
        users: [
          {
            id: 'admin-1',
            email: 'admin@example.com',
            fullName: 'Admin',
            role: UserRole.ADMIN,
            customRoleId: null,
            isPlatformAdmin: false,
          },
        ],
      },
    ]);
    dispatch
      .mockResolvedValueOnce(
        dispatchResult({
          queued: {
            checkedRewards: 1,
            queued: 1,
            skipped: 0,
            rewardTypes: ['BONUS'],
            items: [],
            note: 'queued',
          },
          checked: 2,
          confirmed: 1,
          failed: 1,
        }),
      )
      .mockRejectedValueOnce(new Error('Langame timeout'));

    const result = await service.runScheduledDispatch({
      dryRun: false,
      queueApprovedRewards: false,
      tenantSlug: 'network',
      limit: 3,
    });

    expect(prisma.tenant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { slug: 'network' },
        orderBy: { slug: 'asc' },
        select: expect.objectContaining({
          users: expect.objectContaining({
            where: expect.objectContaining({
              isActive: true,
              role: { in: [UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER] },
            }),
          }),
        }),
      }),
    );
    expect(dispatch).toHaveBeenNthCalledWith(
      1,
      { id: 'owner-1', tenantId: 'tenant-active' },
      expect.objectContaining({
        dryRun: false,
        queueApprovedRewards: false,
        tenantSlug: 'network',
        limit: 3,
      }),
    );
    expect(dispatch).toHaveBeenNthCalledWith(
      2,
      { id: 'admin-1', tenantId: 'tenant-error' },
      expect.objectContaining({
        dryRun: false,
        tenantSlug: 'network',
      }),
    );
    expect(result).toMatchObject({
      mode: 'READY',
      dryRun: false,
      checkedTenants: 4,
      processedTenants: 1,
      skippedTenants: 2,
      erroredTenants: 1,
      queued: 1,
      checked: 2,
      confirmed: 1,
      failed: 1,
      skipped: 0,
      blocked: 0,
    });
    expect(result.tenants).toEqual([
      expect.objectContaining({
        tenantId: 'tenant-active',
        tenantSlug: 'active',
        status: 'PROCESSED',
        reason: null,
      }),
      expect.objectContaining({
        tenantId: 'tenant-suspended',
        tenantSlug: 'suspended',
        status: 'SKIPPED',
        reason: expect.stringContaining('not active'),
      }),
      expect.objectContaining({
        tenantId: 'tenant-no-actor',
        tenantSlug: 'no-actor',
        status: 'SKIPPED',
        reason: expect.stringContaining('No active owner'),
      }),
      expect.objectContaining({
        tenantId: 'tenant-error',
        tenantSlug: 'error',
        status: 'ERROR',
        reason: 'Langame timeout',
      }),
    ]);
  });

  it('skips a scheduled tenant denied by either outbound requirement and continues the batch', async () => {
    const { service, prisma, tenantExecutionAdmission } = createService({
      LANGAME_BONUS_ACCRUAL_ENABLED: 'true',
    });
    const dispatch = jest.spyOn(service, 'dispatch').mockResolvedValue(
      dispatchResult({
        checked: 1,
        confirmed: 1,
      }),
    );
    const owner = {
      id: 'owner-1',
      email: 'owner@example.com',
      fullName: 'Owner',
      role: UserRole.OWNER,
      customRoleId: null,
      isPlatformAdmin: false,
    };

    prisma.tenant.findMany.mockResolvedValue([
      {
        id: 'tenant-denied',
        slug: 'denied',
        status: TenantLifecycleStatus.ACTIVE,
        users: [owner],
      },
      {
        id: 'tenant-admitted',
        slug: 'admitted',
        status: TenantLifecycleStatus.ACTIVE,
        users: [{ ...owner, id: 'owner-2' }],
      },
    ]);
    tenantExecutionAdmission.evaluate.mockImplementation((tenantId: string) =>
      Promise.resolve(
        tenantId === 'tenant-denied'
          ? {
              allowed: false,
              tenantId,
              reasonCode: 'ENTITLEMENT_OUTBOUND_DISABLED',
              failedRequirement: {
                module: TenantModule.INTEGRATIONS,
                action: 'OUTBOUND',
              },
              entitlementProfileRevision: 1,
              customerStage: 'PILOT',
              internalEntitlementBypass: false,
            }
          : {
              allowed: true,
              tenantId,
              reasonCode: 'ALLOWED',
              failedRequirement: null,
              entitlementProfileRevision: 1,
              customerStage: 'PILOT',
              internalEntitlementBypass: false,
            },
      ),
    );

    const result = await service.runScheduledDispatch({
      dryRun: false,
      queueApprovedRewards: false,
    });

    expect(tenantExecutionAdmission.evaluate).toHaveBeenCalledTimes(2);
    expect(tenantExecutionAdmission.evaluate).toHaveBeenNthCalledWith(
      1,
      'tenant-denied',
      [
        {
          module: TenantModule.GAMIFICATION,
          action: 'OUTBOUND',
        },
        {
          module: TenantModule.INTEGRATIONS,
          action: 'OUTBOUND',
        },
      ],
    );
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(
      { id: 'owner-2', tenantId: 'tenant-admitted' },
      expect.objectContaining({ queueApprovedRewards: false }),
    );
    expect(result).toMatchObject({
      checkedTenants: 2,
      processedTenants: 1,
      skippedTenants: 1,
      erroredTenants: 0,
      checked: 1,
      confirmed: 1,
      tenants: [
        {
          tenantId: 'tenant-denied',
          tenantSlug: 'denied',
          status: 'SKIPPED',
          reason:
            'Tenant execution admission denied: ENTITLEMENT_OUTBOUND_DISABLED (INTEGRATIONS:OUTBOUND).',
          result: null,
        },
        expect.objectContaining({
          tenantId: 'tenant-admitted',
          status: 'PROCESSED',
        }),
      ],
    });
  });

  it('queues approved rewards for the Langame phone balance endpoint without storing raw phones', async () => {
    const {
      service,
      prisma,
      secretEncryptionService,
      tenantExecutionAdmission,
    } = createService();

    secretEncryptionService.decrypt.mockReturnValue('+7 (999) 111-22-33');
    prisma.guestGameReward.findMany.mockResolvedValue([
      {
        id: 'reward-1',
        profileId: 'profile-1',
        guestId: 'guest-1',
        storeId: 'store-1337',
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: 'club-1',
        guestExternalId: null,
        rewardType: 'BONUS',
        rewardAmount: new Prisma.Decimal(25),
        rewardLabel: '25 bonus points',
        rewardCode: 'LP-25',
        guest: {
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: 'club-1',
          externalGuestId: null,
          phoneEncrypted: 'encrypted-phone',
          phoneMasked: '+7 *** **-33',
        },
      },
    ]);
    prisma.guestBonusLedgerEntry.createMany.mockResolvedValue({ count: 1 });

    const result = await service.queueApprovedRewards(user, {
      limit: 1,
      storeId: 'store-1337',
      rewardId: 'reward-1',
    });

    expect(result).toMatchObject({
      checkedRewards: 1,
      queued: 1,
      skipped: 0,
    });
    expect(prisma.guestBonusLedgerEntry.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          rewardId: 'reward-1',
          storeId: 'store-1337',
          externalDomain: 'club-1',
          externalGuestId: null,
          status: 'PENDING',
          amount: expect.any(Prisma.Decimal),
          metadata: expect.objectContaining({
            langameBalanceType: 'bonus_balance',
            rewardType: 'BONUS',
            phoneMasked: '+7 *** **-33',
          }),
        }),
      ],
      skipDuplicates: true,
    });
    expect(prisma.guestGameReward.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: user.tenantId,
          storeId: 'store-1337',
          id: 'reward-1',
          AND: [
            {
              OR: [
                {
                  claimRequired: false,
                  OR: [
                    { expiresAt: null },
                    { expiresAt: { gt: expect.any(Date) } },
                  ],
                },
                {
                  claimRequired: true,
                  deliveryRequestedAt: {
                    not: null,
                    lt: 'claimExpiresAt-field-ref',
                  },
                  claimExpiresAt: { not: null },
                  walletItems: {
                    some: {
                      kind: 'REWARD',
                      status: { in: ['PROCESSING', 'FAILED'] },
                    },
                  },
                },
              ],
            },
          ],
        }),
        take: 1,
      }),
    );
    expect(
      JSON.stringify(prisma.guestBonusLedgerEntry.createMany.mock.calls[0][0]),
    ).not.toContain('79991112233');
    expect(tenantExecutionAdmission.evaluate).not.toHaveBeenCalled();
  });

  it('does not persist guest portal pseudo-user as ledger creator', async () => {
    const { service, prisma, secretEncryptionService } = createService();
    const guestPortalUser: AuthenticatedUser = {
      ...user,
      id: 'guest-portal:profile-1',
      email: 'guest-portal@leetplus.local',
    };

    secretEncryptionService.decrypt.mockReturnValue('+7 (999) 111-22-33');
    prisma.guestGameReward.findMany.mockResolvedValue([
      {
        id: 'reward-guest-portal-ledger',
        profileId: 'profile-1',
        guestId: 'guest-1',
        storeId: 'store-1337',
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: 'club-1',
        guestExternalId: null,
        rewardType: 'BONUS_BALANCE',
        rewardAmount: new Prisma.Decimal(50),
        rewardLabel: '50 bonuses',
        rewardCode: 'LP-50',
        guest: {
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: 'club-1',
          externalGuestId: null,
          phoneEncrypted: 'encrypted-phone',
          phoneMasked: '+7 *** **-33',
        },
        profile: null,
      },
    ]);
    prisma.guestBonusLedgerEntry.createMany.mockResolvedValue({ count: 1 });

    await service.queueApprovedRewards(guestPortalUser, {
      limit: 1,
      rewardId: 'reward-guest-portal-ledger',
    });

    expect(prisma.guestBonusLedgerEntry.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          rewardId: 'reward-guest-portal-ledger',
          createdByUserId: null,
        }),
      ],
      skipDuplicates: true,
    });
  });

  it('queues approved game rewards by encrypted profile phone when no shared guest is linked', async () => {
    const { service, prisma, secretEncryptionService } = createService();

    secretEncryptionService.decrypt.mockReturnValue('+7 (999) 222-33-44');
    prisma.guestGameReward.findMany.mockResolvedValue([
      {
        id: 'reward-profile-phone',
        profileId: 'profile-1',
        guestId: null,
        storeId: 'store-1337',
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: 'club-1',
        guestExternalId: null,
        rewardType: 'BONUS_BALANCE',
        rewardAmount: new Prisma.Decimal(50),
        rewardLabel: '50 bonuses',
        rewardCode: 'LP-50',
        guest: null,
        profile: {
          phoneEncrypted: 'profile-encrypted-phone',
          contactMasked: '***3344',
        },
      },
    ]);
    prisma.guestBonusLedgerEntry.createMany.mockResolvedValue({ count: 1 });

    const result = await service.queueApprovedRewards(user, {
      limit: 1,
      rewardId: 'reward-profile-phone',
    });

    expect(result).toMatchObject({
      checkedRewards: 1,
      queued: 1,
      skipped: 0,
    });
    expect(prisma.guestBonusLedgerEntry.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          guestId: null,
          profileId: 'profile-1',
          rewardId: 'reward-profile-phone',
          status: 'PENDING',
          metadata: expect.objectContaining({
            langameBalanceType: 'bonus_balance',
            phoneMasked: '***3344',
          }),
        }),
      ],
      skipDuplicates: true,
    });
    expect(
      JSON.stringify(prisma.guestBonusLedgerEntry.createMany.mock.calls[0][0]),
    ).not.toContain('79992223344');
  });

  it('cancels approved rewards for profiles already marked as staff tests when accrual is explicitly disabled', async () => {
    const { service, prisma, secretEncryptionService } = createService({
      GUEST_GAME_STAFF_TEST_REWARD_ACCRUAL_ENABLED: 'false',
    });

    secretEncryptionService.decrypt.mockReturnValue('+7 (999) 222-33-44');
    prisma.guestGameReward.findMany.mockResolvedValue([
      {
        id: 'reward-staff-test',
        profileId: 'profile-staff',
        guestId: null,
        storeId: 'store-1337',
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: 'club-1',
        guestExternalId: null,
        rewardType: 'BONUS_BALANCE',
        rewardAmount: new Prisma.Decimal(50),
        rewardLabel: '50 bonuses',
        rewardCode: 'LP-50',
        guest: null,
        profile: {
          phoneEncrypted: 'profile-encrypted-phone',
          contactMasked: '***3344',
          isStaffTest: true,
          staffTestReason: 'STAFF_PHONE_MATCH',
        },
      },
    ]);

    const result = await service.queueApprovedRewards(user, {
      limit: 1,
      rewardId: 'reward-staff-test',
    });

    expect(result).toMatchObject({
      checkedRewards: 1,
      queued: 0,
      skipped: 1,
      items: [
        expect.objectContaining({
          rewardId: 'reward-staff-test',
          status: 'SKIPPED',
          reason: expect.stringContaining('тест сотрудника'),
        }),
      ],
    });
    expect(prisma.guestBonusLedgerEntry.createMany).not.toHaveBeenCalled();
    expect(prisma.guestGameProfile.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'profile-staff', tenantId: user.tenantId },
        data: expect.objectContaining({
          isStaffTest: true,
          staffTestReason: 'STAFF_PHONE_MATCH',
        }),
      }),
    );
    expect(prisma.guestGameReward.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: user.tenantId,
          id: { in: ['reward-staff-test'] },
          status: 'APPROVED',
        }),
        data: { status: 'CANCELED' },
      }),
    );
  });

  it('queues approved staff test rewards by default', async () => {
    const { service, prisma, secretEncryptionService } = createService();

    secretEncryptionService.decrypt.mockReturnValue('+7 (999) 222-33-44');
    prisma.guestGameReward.findMany.mockResolvedValue([
      {
        id: 'reward-staff-test',
        profileId: 'profile-staff',
        guestId: null,
        storeId: 'store-1337',
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: 'club-1',
        guestExternalId: null,
        rewardType: 'BONUS_BALANCE',
        rewardAmount: new Prisma.Decimal(50),
        rewardLabel: '50 bonuses',
        rewardCode: 'LP-50',
        guest: null,
        profile: {
          phoneEncrypted: 'profile-encrypted-phone',
          contactMasked: '***3344',
          isStaffTest: true,
          staffTestReason: 'STAFF_PHONE_MATCH',
        },
      },
    ]);
    prisma.guestBonusLedgerEntry.createMany.mockResolvedValue({ count: 1 });

    const result = await service.queueApprovedRewards(user, {
      limit: 1,
      rewardId: 'reward-staff-test',
    });

    expect(result).toMatchObject({
      checkedRewards: 1,
      queued: 1,
      skipped: 0,
      items: [
        expect.objectContaining({
          rewardId: 'reward-staff-test',
          status: 'QUEUED',
          reason: expect.stringContaining('всех профилей'),
        }),
      ],
    });
    expect(prisma.guestGameProfile.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'profile-staff', tenantId: user.tenantId },
        data: expect.objectContaining({
          isStaffTest: true,
          staffTestReason: 'STAFF_PHONE_MATCH',
        }),
      }),
    );
    expect(prisma.guestBonusLedgerEntry.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          rewardId: 'reward-staff-test',
          status: 'PENDING',
          metadata: expect.objectContaining({
            staffTestReason: 'STAFF_PHONE_MATCH',
            staffTestAccrualOverride: true,
            staffTestRewardAccrualEnabled: true,
            staffTestRewardAccrualEnv:
              'GUEST_GAME_STAFF_TEST_REWARD_ACCRUAL_ENABLED',
          }),
        }),
      ],
      skipDuplicates: true,
    });
    expect(prisma.guestGameReward.updateMany).not.toHaveBeenCalled();
  });

  it('detects staff phones before canceling rewards when staff test accrual is explicitly disabled', async () => {
    const { service, prisma, secretEncryptionService } = createService({
      GUEST_GAME_STAFF_TEST_REWARD_ACCRUAL_ENABLED: 'false',
    });

    secretEncryptionService.decrypt.mockReturnValue('+7 (999) 222-33-44');
    prisma.staffMember.findMany.mockResolvedValue([{ phone: '79992223344' }]);
    prisma.guestGameReward.findMany.mockResolvedValue([
      {
        id: 'reward-staff-phone',
        profileId: 'profile-staff-phone',
        guestId: null,
        storeId: 'store-1337',
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: 'club-1',
        guestExternalId: null,
        rewardType: 'BONUS_BALANCE',
        rewardAmount: new Prisma.Decimal(50),
        rewardLabel: '50 bonuses',
        rewardCode: 'LP-50',
        guest: null,
        profile: {
          phoneEncrypted: 'profile-encrypted-phone',
          contactMasked: '***3344',
          isStaffTest: false,
          staffTestReason: null,
        },
      },
    ]);

    const result = await service.queueApprovedRewards(user, {
      limit: 1,
      rewardId: 'reward-staff-phone',
    });

    expect(result).toMatchObject({
      checkedRewards: 1,
      queued: 0,
      skipped: 1,
    });
    expect(prisma.guestBonusLedgerEntry.createMany).not.toHaveBeenCalled();
    expect(prisma.guestGameProfile.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'profile-staff-phone', tenantId: user.tenantId },
        data: expect.objectContaining({
          isStaffTest: true,
          staffTestReason: 'STAFF_PHONE_MATCH',
        }),
      }),
    );
    expect(prisma.guestGameReward.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ['reward-staff-phone'] },
          status: 'APPROVED',
        }),
        data: { status: 'CANCELED' },
      }),
    );
  });

  it('queues detected staff phone rewards by default', async () => {
    const { service, prisma, secretEncryptionService } = createService();

    secretEncryptionService.decrypt.mockReturnValue('+7 (999) 222-33-44');
    prisma.staffMember.findMany.mockResolvedValue([{ phone: '79992223344' }]);
    prisma.guestGameReward.findMany.mockResolvedValue([
      {
        id: 'reward-staff-phone',
        profileId: 'profile-staff-phone',
        guestId: null,
        storeId: 'store-1337',
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: 'club-1',
        guestExternalId: null,
        rewardType: 'BONUS_BALANCE',
        rewardAmount: new Prisma.Decimal(50),
        rewardLabel: '50 bonuses',
        rewardCode: 'LP-50',
        guest: null,
        profile: {
          phoneEncrypted: 'profile-encrypted-phone',
          contactMasked: '***3344',
          isStaffTest: false,
          staffTestReason: null,
        },
      },
    ]);
    prisma.guestBonusLedgerEntry.createMany.mockResolvedValue({ count: 1 });

    const result = await service.queueApprovedRewards(user, {
      limit: 1,
      rewardId: 'reward-staff-phone',
    });

    expect(result).toMatchObject({
      checkedRewards: 1,
      queued: 1,
      skipped: 0,
    });
    expect(prisma.guestGameProfile.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'profile-staff-phone', tenantId: user.tenantId },
        data: expect.objectContaining({
          isStaffTest: true,
          staffTestReason: 'STAFF_PHONE_MATCH',
        }),
      }),
    );
    expect(prisma.guestBonusLedgerEntry.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          rewardId: 'reward-staff-phone',
          status: 'PENDING',
          metadata: expect.objectContaining({
            staffTestReason: 'STAFF_PHONE_MATCH',
            staffTestAccrualOverride: true,
          }),
        }),
      ],
      skipDuplicates: true,
    });
    expect(prisma.guestGameReward.updateMany).not.toHaveBeenCalled();
  });

  it('queues guest portal profile rewards through the store Langame domain', async () => {
    const { service, prisma, secretEncryptionService } = createService();

    secretEncryptionService.decrypt.mockReturnValue('+7 (999) 222-33-44');
    prisma.guestGameReward.findMany.mockResolvedValue([
      {
        id: 'reward-guest-portal-domain',
        profileId: 'profile-1',
        guestId: null,
        storeId: 'store-1337',
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: 'leetplus-guest-portal',
        guestExternalId: null,
        rewardType: 'BONUS_BALANCE',
        rewardAmount: new Prisma.Decimal(50),
        rewardLabel: '50 bonuses',
        rewardCode: 'LP-50',
        guest: null,
        profile: {
          phoneEncrypted: 'profile-encrypted-phone',
          contactMasked: '***3344',
        },
        store: {
          externalDomain: '1337.langame.ru',
          integrationSource: {
            provider: IntegrationProvider.LANGAME,
            domain: '1337.langame.ru',
            isActive: true,
          },
        },
      },
    ]);
    prisma.guestBonusLedgerEntry.createMany.mockResolvedValue({ count: 1 });

    const result = await service.queueApprovedRewards(user, {
      limit: 1,
      rewardId: 'reward-guest-portal-domain',
    });

    expect(result.items).toEqual([
      expect.objectContaining({
        rewardId: 'reward-guest-portal-domain',
        status: 'QUEUED',
        externalDomain: '1337.langame.ru',
      }),
    ]);
    expect(prisma.guestBonusLedgerEntry.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          rewardId: 'reward-guest-portal-domain',
          storeId: 'store-1337',
          externalDomain: '1337.langame.ru',
          metadata: expect.objectContaining({
            langameBalanceType: 'bonus_balance',
            phoneMasked: '***3344',
          }),
        }),
      ],
      skipDuplicates: true,
    });
  });

  it('queues explicit money balance rewards with Langame balance type', async () => {
    const { service, prisma, secretEncryptionService } = createService();

    secretEncryptionService.decrypt.mockReturnValue('+7 (999) 111-22-33');
    prisma.guestGameReward.findMany.mockResolvedValue([
      {
        id: 'reward-balance-1',
        profileId: 'profile-1',
        guestId: 'guest-1',
        storeId: null,
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: 'club-1',
        guestExternalId: 'lg-guest-1',
        rewardType: 'BALANCE',
        rewardAmount: new Prisma.Decimal(100),
        rewardLabel: '100 rub to balance',
        rewardCode: 'LP-BALANCE',
        guest: {
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: 'club-1',
          externalGuestId: 'lg-guest-1',
          phoneEncrypted: 'encrypted-phone',
          phoneMasked: '+7 *** **-33',
        },
      },
    ]);
    prisma.guestBonusLedgerEntry.createMany.mockResolvedValue({ count: 1 });

    const result = await service.queueApprovedRewards(user, {
      rewardTypes: ['BALANCE'],
    });

    expect(result).toMatchObject({
      checkedRewards: 1,
      queued: 1,
      skipped: 0,
      rewardTypes: ['BALANCE'],
    });
    expect(prisma.guestGameReward.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            {
              rewardType: { equals: 'BALANCE', mode: 'insensitive' },
            },
          ],
        }),
      }),
    );
    expect(prisma.guestBonusLedgerEntry.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          rewardId: 'reward-balance-1',
          externalDomain: 'club-1',
          externalGuestId: 'lg-guest-1',
          amount: expect.any(Prisma.Decimal),
          metadata: expect.objectContaining({
            langameBalanceType: 'balance',
            rewardType: 'BALANCE',
            phoneMasked: '+7 *** **-33',
          }),
        }),
      ],
      skipDuplicates: true,
    });
  });

  it('dispatches claimed entries to Langame bonus_balance by decrypted phone and masks audit payloads', async () => {
    const { service, prisma, langameClient, secretEncryptionService } =
      createService();
    const entry = ledgerEntry({
      metadata: { rewardType: 'BONUS', langameBalanceType: 'bonus_balance' },
    });
    const access = {
      apiKey: 'request-token',
      sources: [
        {
          domain: 'club-1',
          baseUrl: 'https://46.langamepro.ru/public_api',
        },
      ],
    };

    prisma.guest.findFirst.mockResolvedValue({
      phoneEncrypted: 'encrypted-phone',
      phoneMasked: '+7 *** **-33',
    });
    secretEncryptionService.decrypt.mockReturnValue('+7 (999) 111-22-33');
    langameClient.adjustGuestBalanceByPhone.mockResolvedValue({
      status: true,
      phone: '79991112233',
    });
    jest.spyOn(service as any, 'confirmEntry').mockResolvedValue(null);

    const result = await (service as any).processClaimedEntry(
      user.id,
      entry,
      {
        mode: 'READY',
        dryRun: false,
        ready: true,
        enabled: true,
        path: '/master_api/guests/balance/phone',
        rewardTypes: ['BONUS'],
        limit: 50,
        maxAttempts: 5,
        retryMinutes: 1,
        staleLockMinutes: 15,
      },
      access,
    );

    expect(result).toMatchObject({
      ledgerEntryId: 'ledger-1',
      status: 'CONFIRMED',
    });
    expect(langameClient.adjustGuestBalanceByPhone).toHaveBeenCalledWith(
      'https://46.langamepro.ru/public_api',
      'request-token',
      {
        phone: '79991112233',
        type: 'bonus_balance',
        sum: 25,
        comment: expect.stringContaining('LeetPlus'),
      },
      '/master_api/guests/balance/phone',
    );
    expect((service as any).confirmEntry).toHaveBeenCalledWith(
      user.id,
      entry,
      expect.objectContaining({
        phone: '+7 *** **-33',
        type: 'bonus_balance',
        sum: 25,
      }),
      expect.objectContaining({
        status: true,
        phone: '***2233',
      }),
    );
  });

  it('resolves the active Langame source and credential after DISPATCHING instead of using a batch-cached access snapshot', async () => {
    const {
      service,
      prisma,
      langameClient,
      langameSettingsService,
      secretEncryptionService,
    } = createService();
    const entry = ledgerEntry({
      status: 'PROCESSING',
      attempts: 1,
      metadata: { rewardType: 'BONUS', langameBalanceType: 'bonus_balance' },
    });
    let dispatchMarked = false;

    prisma.guest.findFirst.mockResolvedValue({
      phoneEncrypted: 'encrypted-phone',
      phoneMasked: '+7 *** **-33',
    });
    secretEncryptionService.decrypt.mockReturnValue('+7 (999) 111-22-33');
    jest
      .spyOn(service as any, 'markEntryDispatching')
      .mockImplementation(() => {
        dispatchMarked = true;
        return Promise.resolve(true);
      });
    langameSettingsService.resolveTenantAccess.mockImplementation(() => {
      expect(dispatchMarked).toBe(true);
      return Promise.resolve({
        apiKey: 'rotated-request-token',
        sources: [
          {
            domain: 'club-1',
            baseUrl: 'https://rotated.langamepro.ru/public_api',
          },
        ],
      });
    });
    langameClient.adjustGuestBalanceByPhone.mockResolvedValue({
      status: true,
    });
    jest.spyOn(service as any, 'confirmEntry').mockResolvedValue(null);

    await expect(
      (service as any).processClaimedEntry(user.id, entry, {
        path: '/master_api/guests/balance/phone',
        maxAttempts: 3,
        retryMinutes: 1,
      }),
    ).resolves.toMatchObject({
      ledgerEntryId: entry.id,
      status: 'CONFIRMED',
    });

    expect(langameSettingsService.resolveTenantAccess).toHaveBeenCalledTimes(1);
    expect(langameSettingsService.resolveTenantAccess).toHaveBeenCalledWith(
      entry.tenantId,
    );
    expect(langameClient.adjustGuestBalanceByPhone).toHaveBeenCalledWith(
      'https://rotated.langamepro.ru/public_api',
      'rotated-request-token',
      expect.objectContaining({
        phone: '79991112233',
        type: 'bonus_balance',
        sum: 25,
      }),
      '/master_api/guests/balance/phone',
    );
  });

  it('does not call Langame when the active source is revoked after DISPATCHING', async () => {
    const {
      service,
      prisma,
      langameClient,
      langameSettingsService,
      secretEncryptionService,
    } = createService();
    const entry = ledgerEntry({
      status: 'PROCESSING',
      attempts: 1,
      metadata: { rewardType: 'BONUS', langameBalanceType: 'bonus_balance' },
    });

    prisma.guest.findFirst.mockResolvedValue({
      phoneEncrypted: 'encrypted-phone',
      phoneMasked: '+7 *** **-33',
    });
    secretEncryptionService.decrypt.mockReturnValue('+7 (999) 111-22-33');
    jest.spyOn(service as any, 'markEntryDispatching').mockResolvedValue(true);
    langameSettingsService.resolveTenantAccess.mockResolvedValue({
      apiKey: 'still-valid-token',
      sources: [
        {
          domain: 'another-club',
          baseUrl: 'https://another.langamepro.ru/public_api',
        },
      ],
    });

    await expect(
      (service as any).processClaimedEntry(user.id, entry, {
        path: '/master_api/guests/balance/phone',
        maxAttempts: 3,
        retryMinutes: 1,
      }),
    ).resolves.toMatchObject({
      ledgerEntryId: entry.id,
      status: 'RECONCILIATION_REQUIRED',
    });

    expect(langameSettingsService.resolveTenantAccess).toHaveBeenCalledWith(
      entry.tenantId,
    );
    expect(langameClient.adjustGuestBalanceByPhone).not.toHaveBeenCalled();
  });

  it('does not call Langame when reward eligibility is revoked after DISPATCHING', async () => {
    const {
      service,
      prisma,
      langameClient,
      langameSettingsService,
      secretEncryptionService,
      tenantExecutionAdmission,
    } = createService();
    const entry = ledgerEntry({
      status: 'PROCESSING',
      attempts: 1,
      metadata: { rewardType: 'BONUS', langameBalanceType: 'bonus_balance' },
    });
    const approvedReward = {
      id: entry.rewardId,
      status: 'APPROVED',
      claimRequired: false,
      deliveryRequestedAt: null,
      claimExpiresAt: null,
      expiresAt: null,
    };

    prisma.guest.findFirst.mockResolvedValue({
      phoneEncrypted: 'encrypted-phone',
      phoneMasked: '+7 *** **-33',
    });
    secretEncryptionService.decrypt.mockReturnValue('+7 (999) 111-22-33');
    prisma.guestGameReward.findFirst
      .mockResolvedValueOnce(approvedReward)
      .mockResolvedValueOnce(approvedReward)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        ...approvedReward,
        status: 'CANCELED',
      });

    await expect(
      (service as any).processClaimedEntry(user.id, entry, {
        path: '/master_api/guests/balance/phone',
        maxAttempts: 3,
        retryMinutes: 1,
      }),
    ).resolves.toMatchObject({
      ledgerEntryId: entry.id,
      status: 'CANCELED',
    });

    expect(prisma.guestBonusLedgerEntry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: entry.id,
          status: 'DISPATCHING',
          attempts: entry.attempts,
          claimGeneration: entry.claimGeneration,
          lockedAt: expect.any(Date),
          executionRevision: entry.executionRevision,
        }),
        data: expect.objectContaining({
          status: 'CANCELED',
          errorCode: 'REWARD_NOT_DELIVERABLE',
        }),
      }),
    );
    expect(tenantExecutionAdmission.evaluatePermit).not.toHaveBeenCalled();
    expect(langameSettingsService.resolveTenantAccess).not.toHaveBeenCalled();
    expect(langameClient.adjustGuestBalanceByPhone).not.toHaveBeenCalled();
  });

  it('does not call Langame when the normalized phone target changes after DISPATCHING', async () => {
    const {
      service,
      prisma,
      langameClient,
      langameSettingsService,
      secretEncryptionService,
      tenantExecutionAdmission,
    } = createService();
    const entry = ledgerEntry({
      status: 'PROCESSING',
      attempts: 2,
      claimGeneration: 5,
      metadata: { rewardType: 'BONUS', langameBalanceType: 'bonus_balance' },
    });

    prisma.guest.findFirst
      .mockResolvedValueOnce({
        phoneEncrypted: 'encrypted-old-phone',
        phoneMasked: '+7 *** **-33',
      })
      .mockResolvedValueOnce({
        phoneEncrypted: 'encrypted-new-phone',
        phoneMasked: '+7 *** **-44',
      });
    secretEncryptionService.decrypt.mockImplementation((value: string) =>
      value === 'encrypted-old-phone'
        ? '+7 (999) 111-22-33'
        : '+7 (999) 222-33-44',
    );

    await expect(
      (service as any).processClaimedEntry(user.id, entry, {
        path: '/master_api/guests/balance/phone',
        maxAttempts: 3,
        retryMinutes: 1,
      }),
    ).resolves.toMatchObject({
      ledgerEntryId: entry.id,
      status: 'BLOCKED',
      note: expect.stringContaining('Телефон получателя изменился'),
    });

    expect(prisma.guest.findFirst).toHaveBeenCalledTimes(2);
    expect(prisma.guestBonusLedgerEntry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: entry.id,
          tenantId: entry.tenantId,
          status: 'DISPATCHING',
          attempts: 2,
          claimGeneration: 5,
          lockedAt: expect.any(Date),
          executionRevision: entry.executionRevision,
        },
        data: expect.objectContaining({
          status: 'PENDING',
          attempts: { decrement: 1 },
          lockedAt: null,
          errorCode: 'LANGAME_TARGET_CHANGED',
          errorMessage:
            'Normalized Langame phone target changed after DISPATCHING.',
        }),
      }),
    );
    expect(tenantExecutionAdmission.evaluatePermit).not.toHaveBeenCalled();
    expect(langameSettingsService.resolveTenantAccess).not.toHaveBeenCalled();
    expect(langameClient.adjustGuestBalanceByPhone).not.toHaveBeenCalled();
  });

  it('does not call Langame when a profile becomes a blocked staff test after DISPATCHING', async () => {
    const {
      service,
      prisma,
      langameClient,
      langameSettingsService,
      secretEncryptionService,
      tenantExecutionAdmission,
    } = createService();
    const entry = ledgerEntry({
      status: 'PROCESSING',
      attempts: 1,
      metadata: { rewardType: 'BONUS', langameBalanceType: 'bonus_balance' },
    });

    prisma.guest.findFirst.mockResolvedValue({
      phoneEncrypted: 'encrypted-phone',
      phoneMasked: '+7 *** **-33',
    });
    prisma.guestGameProfile.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        isStaffTest: true,
        staffTestReason: 'STAFF_PHONE_MATCH',
      });
    secretEncryptionService.decrypt.mockReturnValue('+7 (999) 111-22-33');

    await expect(
      (service as any).processClaimedEntry(user.id, entry, {
        path: '/master_api/guests/balance/phone',
        maxAttempts: 3,
        retryMinutes: 1,
        staffTestRewardAccrualEnabled: false,
      }),
    ).resolves.toMatchObject({
      ledgerEntryId: entry.id,
      status: 'CANCELED',
    });

    expect(prisma.guestGameProfile.findFirst).toHaveBeenCalledTimes(2);
    expect(prisma.guestBonusLedgerEntry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: entry.id,
          status: 'DISPATCHING',
          attempts: entry.attempts,
          claimGeneration: entry.claimGeneration,
          lockedAt: expect.any(Date),
          executionRevision: entry.executionRevision,
        }),
        data: expect.objectContaining({
          status: 'CANCELED',
          errorCode: 'STAFF_TEST_PROFILE',
        }),
      }),
    );
    expect(tenantExecutionAdmission.evaluatePermit).not.toHaveBeenCalled();
    expect(langameSettingsService.resolveTenantAccess).not.toHaveBeenCalled();
    expect(langameClient.adjustGuestBalanceByPhone).not.toHaveBeenCalled();
  });

  it('does not call Langame when the DISPATCHING claim or tenant revision changes before provider invocation', async () => {
    const {
      service,
      prisma,
      langameClient,
      langameSettingsService,
      secretEncryptionService,
    } = createService();
    const entry = ledgerEntry({
      status: 'PROCESSING',
      attempts: 2,
      claimGeneration: 7,
      executionRevision: 11,
      metadata: { rewardType: 'BONUS', langameBalanceType: 'bonus_balance' },
    });

    prisma.guest.findFirst.mockResolvedValue({
      phoneEncrypted: 'encrypted-phone',
      phoneMasked: '+7 *** **-33',
    });
    secretEncryptionService.decrypt.mockReturnValue('+7 (999) 111-22-33');
    jest.spyOn(service as any, 'markEntryDispatching').mockResolvedValue(true);
    prisma.guestBonusLedgerEntry.count.mockResolvedValueOnce(0);

    await expect(
      (service as any).processClaimedEntry(user.id, entry, {
        path: '/master_api/guests/balance/phone',
        maxAttempts: 3,
        retryMinutes: 1,
      }),
    ).resolves.toMatchObject({
      ledgerEntryId: entry.id,
      status: 'BLOCKED',
      note: expect.stringContaining('устаревший worker'),
    });

    expect(langameSettingsService.resolveTenantAccess).toHaveBeenCalledWith(
      entry.tenantId,
    );
    expect(prisma.guestBonusLedgerEntry.count).toHaveBeenCalledWith({
      where: {
        id: entry.id,
        tenantId: entry.tenantId,
        status: 'DISPATCHING',
        attempts: 2,
        claimGeneration: 7,
        lockedAt: expect.any(Date),
        executionRevision: 11,
        tenant: {
          executionRevision: 11,
        },
      },
    });
    expect(langameClient.adjustGuestBalanceByPhone).not.toHaveBeenCalled();
  });

  it('rechecks both outbound requirements after DISPATCHING and returns the entry to the queue when denied', async () => {
    const {
      service,
      prisma,
      langameClient,
      secretEncryptionService,
      tenantExecutionAdmission,
    } = createService();
    const entry = ledgerEntry({
      status: 'PROCESSING',
      attempts: 1,
      metadata: { rewardType: 'BONUS', langameBalanceType: 'bonus_balance' },
    });
    const access = {
      apiKey: 'request-token',
      sources: [
        {
          domain: 'club-1',
          baseUrl: 'https://46.langamepro.ru/public_api',
        },
      ],
    };

    prisma.guest.findFirst.mockResolvedValue({
      phoneEncrypted: 'encrypted-phone',
      phoneMasked: '+7 *** **-33',
    });
    secretEncryptionService.decrypt.mockReturnValue('+7 (999) 111-22-33');
    jest.spyOn(service as any, 'markEntryDispatching').mockResolvedValue(true);
    const confirmEntry = jest
      .spyOn(service as any, 'confirmEntry')
      .mockResolvedValue(null);
    tenantExecutionAdmission.evaluatePermit.mockResolvedValue({
      allowed: false,
      tenantId: user.tenantId,
      reasonCode: 'TENANT_INACTIVE',
      failedRequirement: {
        module: TenantModule.GAMIFICATION,
        action: 'OUTBOUND',
      },
      entitlementProfileRevision: 1,
      executionRevision: 4,
      customerStage: 'PILOT',
      internalEntitlementBypass: false,
    });

    const result = await (service as any).processClaimedEntry(
      user.id,
      entry,
      {
        mode: 'READY',
        dryRun: false,
        ready: true,
        enabled: true,
        path: '/master_api/guests/balance/phone',
        rewardTypes: ['BONUS'],
        limit: 50,
        maxAttempts: 5,
        retryMinutes: 1,
        staleLockMinutes: 15,
      },
      access,
    );

    expect(tenantExecutionAdmission.evaluatePermit).toHaveBeenCalledWith({
      tenantId: user.tenantId,
      executionRevision: 3,
      requirements: [
        {
          module: TenantModule.GAMIFICATION,
          action: 'OUTBOUND',
        },
        {
          module: TenantModule.INTEGRATIONS,
          action: 'OUTBOUND',
        },
      ],
    });
    expect(result).toMatchObject({
      ledgerEntryId: entry.id,
      status: 'BLOCKED',
      note: 'Tenant execution admission denied: TENANT_INACTIVE (GAMIFICATION:OUTBOUND).',
    });
    expect(langameClient.adjustGuestBalanceByPhone).not.toHaveBeenCalled();
    expect(confirmEntry).not.toHaveBeenCalled();
    expect(prisma.guestBonusLedgerEntry.updateMany).toHaveBeenCalledWith({
      where: {
        id: entry.id,
        tenantId: entry.tenantId,
        status: 'DISPATCHING',
        attempts: entry.attempts,
        claimGeneration: entry.claimGeneration,
        lockedAt: expect.any(Date),
        executionRevision: entry.executionRevision,
      },
      data: {
        status: 'PENDING',
        processedByUserId: user.id,
        attempts: { decrement: 1 },
        lockedAt: null,
        processedAt: null,
        failedAt: null,
        nextAttemptAt: null,
        errorCode: 'TENANT_EXECUTION_NOT_ADMITTED',
        errorMessage:
          'Tenant execution admission denied: TENANT_INACTIVE (GAMIFICATION:OUTBOUND).',
      },
    });
  });

  it('rechecks the background registry after DISPATCHING and before Langame', async () => {
    const {
      service,
      prisma,
      langameClient,
      secretEncryptionService,
      tenantExecutionAdmission,
    } = createService();
    const entry = ledgerEntry({
      status: 'PROCESSING',
      attempts: 1,
      metadata: { rewardType: 'BONUS', langameBalanceType: 'bonus_balance' },
    });

    prisma.guest.findFirst.mockResolvedValue({
      phoneEncrypted: 'encrypted-phone',
      phoneMasked: '+7 *** **-33',
    });
    secretEncryptionService.decrypt.mockReturnValue('+7 (999) 111-22-33');
    jest.spyOn(service as any, 'markEntryDispatching').mockResolvedValue(true);
    tenantExecutionAdmission.evaluatePermit.mockResolvedValue({
      allowed: true,
      tenantId: user.tenantId,
      reasonCode: 'ALLOWED',
      failedRequirement: null,
      entitlementProfileRevision: 1,
      executionRevision: 3,
      customerStage: null,
      internalEntitlementBypass: false,
    });

    const result = await (service as any).processClaimedEntry(user.id, entry, {
      mode: 'READY',
      dryRun: false,
      ready: true,
      enabled: true,
      path: '/master_api/guests/balance/phone',
      rewardTypes: ['BONUS'],
      limit: 50,
      maxAttempts: 5,
      retryMinutes: 1,
      staleLockMinutes: 15,
    });

    expect(result).toMatchObject({
      ledgerEntryId: entry.id,
      status: 'BLOCKED',
      note: expect.stringContaining('BACKGROUND_EXECUTION_STAGE_REQUIRED'),
    });
    expect(langameClient.adjustGuestBalanceByPhone).not.toHaveBeenCalled();
    expect(prisma.guestBonusLedgerEntry.updateMany).toHaveBeenCalledWith({
      where: {
        id: entry.id,
        tenantId: entry.tenantId,
        status: 'DISPATCHING',
        attempts: entry.attempts,
        claimGeneration: entry.claimGeneration,
        lockedAt: expect.any(Date),
        executionRevision: entry.executionRevision,
      },
      data: {
        status: 'PENDING',
        processedByUserId: user.id,
        attempts: { decrement: 1 },
        lockedAt: null,
        processedAt: null,
        failedAt: null,
        nextAttemptAt: null,
        errorCode: 'BACKGROUND_EXECUTION_NOT_ADMITTED',
        errorMessage: expect.stringContaining(
          'BACKGROUND_EXECUTION_STAGE_REQUIRED',
        ),
      },
    });
  });

  it('returns an unclaimed wallet reward to PENDING and never calls Langame', async () => {
    const { service, prisma, langameClient, secretEncryptionService } =
      createService();
    const entry = ledgerEntry({ status: 'PROCESSING', attempts: 1 });
    const access = {
      apiKey: 'request-token',
      sources: [
        {
          domain: 'club-1',
          baseUrl: 'https://46.langamepro.ru/public_api',
        },
      ],
    };

    prisma.guest.findFirst.mockResolvedValue({
      phoneEncrypted: 'encrypted-phone',
      phoneMasked: '+7 *** **-33',
    });
    secretEncryptionService.decrypt.mockReturnValue('+7 (999) 111-22-33');
    prisma.guestGameReward.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        status: 'APPROVED',
        claimRequired: true,
        deliveryRequestedAt: null,
        claimExpiresAt: new Date('2099-06-10T10:00:00.000Z'),
      });

    const result = await (service as any).processClaimedEntry(
      user.id,
      entry,
      {
        path: '/master_api/guests/balance/phone',
        maxAttempts: 3,
        retryMinutes: 1,
      },
      access,
    );

    expect(result).toMatchObject({
      ledgerEntryId: 'ledger-1',
      rewardId: 'reward-1',
      status: 'BLOCKED',
      note: expect.stringContaining('ожидает подтвержденного получения'),
    });
    expect(langameClient.adjustGuestBalanceByPhone).not.toHaveBeenCalled();
    expect(prisma.guestBonusLedgerEntry.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'ledger-1',
        tenantId: user.tenantId,
        status: 'PROCESSING',
        attempts: entry.attempts,
        claimGeneration: entry.claimGeneration,
        lockedAt: entry.lockedAt,
        executionRevision: entry.executionRevision,
      },
      data: expect.objectContaining({
        status: 'PENDING',
        lockedAt: null,
        errorCode: 'WAITING_REWARD_CLAIM',
      }),
    });
  });

  it('cancels a reward that becomes canceled before the external Langame write', async () => {
    const { service, prisma, langameClient, secretEncryptionService } =
      createService();
    const entry = ledgerEntry({ status: 'PROCESSING', attempts: 1 });
    const access = {
      apiKey: 'request-token',
      sources: [
        {
          domain: 'club-1',
          baseUrl: 'https://46.langamepro.ru/public_api',
        },
      ],
    };

    prisma.guest.findFirst.mockResolvedValue({
      phoneEncrypted: 'encrypted-phone',
      phoneMasked: '+7 *** **-33',
    });
    secretEncryptionService.decrypt.mockReturnValue('+7 (999) 111-22-33');
    prisma.guestGameReward.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        status: 'CANCELED',
        claimRequired: true,
        deliveryRequestedAt: new Date('2026-06-10T09:00:00.000Z'),
        claimExpiresAt: new Date('2026-06-11T09:00:00.000Z'),
      });

    const result = await (service as any).processClaimedEntry(
      user.id,
      entry,
      {
        path: '/master_api/guests/balance/phone',
        maxAttempts: 3,
        retryMinutes: 1,
      },
      access,
    );

    expect(result).toMatchObject({
      status: 'CANCELED',
      note: expect.stringContaining('отменена, просрочена'),
    });
    expect(langameClient.adjustGuestBalanceByPhone).not.toHaveBeenCalled();
    expect(prisma.guestBonusLedgerEntry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'CANCELED',
          errorCode: 'REWARD_NOT_DELIVERABLE',
        }),
      }),
    );
  });

  it('finishes an accepted wallet claim after its original deadline', async () => {
    const { service, prisma, langameClient, secretEncryptionService } =
      createService();
    const entry = ledgerEntry({ status: 'PROCESSING', attempts: 1 });
    const acceptedAt = new Date('2026-06-10T09:00:00.000Z');
    const claimExpiresAt = new Date('2026-06-10T10:00:00.000Z');
    const access = {
      apiKey: 'request-token',
      sources: [
        {
          domain: 'club-1',
          baseUrl: 'https://46.langamepro.ru/public_api',
        },
      ],
    };

    prisma.guest.findFirst.mockResolvedValue({
      phoneEncrypted: 'encrypted-phone',
      phoneMasked: '+7 *** **-33',
    });
    secretEncryptionService.decrypt.mockReturnValue('+7 (999) 111-22-33');
    prisma.guestGameReward.findFirst.mockResolvedValue({
      id: 'reward-1',
      status: 'APPROVED',
      claimRequired: true,
      deliveryRequestedAt: acceptedAt,
      claimExpiresAt,
      expiresAt: new Date('2026-06-10T09:30:00.000Z'),
    });
    prisma.guestGameRewardWalletItem.findFirst.mockResolvedValue({
      id: 'wallet-1',
    });
    prisma.guestGameRewardWalletItem.updateMany.mockResolvedValue({ count: 1 });
    langameClient.adjustGuestBalanceByPhone.mockResolvedValue({ status: true });
    jest.spyOn(service as any, 'confirmEntry').mockResolvedValue(null);

    const result = await (service as any).processClaimedEntry(
      user.id,
      entry,
      {
        path: '/master_api/guests/balance/phone',
        maxAttempts: 3,
        retryMinutes: 1,
      },
      access,
    );

    expect(result.status).toBe('CONFIRMED');
    expect(prisma.guestGameRewardWalletItem.updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: user.tenantId,
        rewardId: 'reward-1',
        kind: 'REWARD',
        status: { in: ['PROCESSING', 'FAILED'] },
      },
      data: { status: 'PROCESSING' },
    });
    expect(langameClient.adjustGuestBalanceByPhone).toHaveBeenCalledTimes(1);
  });

  it('requires reconciliation and disables retry when the external Langame write outcome is unknown', async () => {
    const { service, prisma, langameClient, secretEncryptionService } =
      createService();
    const entry = ledgerEntry({ status: 'PROCESSING', attempts: 1 });
    const access = {
      apiKey: 'request-token',
      sources: [
        {
          domain: 'club-1',
          baseUrl: 'https://46.langamepro.ru/public_api',
        },
      ],
    };

    prisma.guest.findFirst.mockResolvedValue({
      phoneEncrypted: 'encrypted-phone',
      phoneMasked: '+7 *** **-33',
    });
    secretEncryptionService.decrypt.mockReturnValue('+7 (999) 111-22-33');
    prisma.guestGameReward.findFirst.mockResolvedValue({
      id: 'reward-1',
      status: 'APPROVED',
      claimRequired: true,
      deliveryRequestedAt: new Date('2026-06-10T09:00:00.000Z'),
      claimExpiresAt: new Date('2026-06-11T09:00:00.000Z'),
      expiresAt: null,
    });
    prisma.guestGameRewardWalletItem.findFirst.mockResolvedValue({
      id: 'wallet-1',
    });
    prisma.guestGameRewardWalletItem.updateMany.mockResolvedValue({ count: 1 });
    langameClient.adjustGuestBalanceByPhone.mockRejectedValue(
      new Error('Langame write failed'),
    );

    const result = await (service as any).processClaimedEntry(
      user.id,
      entry,
      {
        path: '/master_api/guests/balance/phone',
        maxAttempts: 3,
        retryMinutes: 1,
      },
      access,
    );

    expect(result.status).toBe('RECONCILIATION_REQUIRED');
    expect(prisma.guestBonusLedgerEntry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'ledger-1',
          status: 'DISPATCHING',
        }),
        data: expect.objectContaining({
          status: 'RECONCILIATION_REQUIRED',
          errorCode: 'LANGAME_WRITE_OUTCOME_UNKNOWN',
        }),
      }),
    );
    expect(langameClient.adjustGuestBalanceByPhone).toHaveBeenCalledTimes(1);
  });

  it('confirms a reconciled external write exactly once without another provider call', async () => {
    const { service, prisma, langameClient } = createService();
    const tx = ledgerTransactionMock();
    const entry = ledgerEntry({
      status: 'RECONCILIATION_REQUIRED',
      attempts: 1,
      errorCode: 'LANGAME_WRITE_OUTCOME_UNKNOWN',
      errorMessage: 'provider response was lost',
      langameRequest: { phone: '+7 *** **-33', value: 25 },
      langameResponse: null,
    });
    const acceptedAt = new Date('2026-06-10T09:00:00.000Z');
    const claimExpiresAt = new Date('2026-06-11T09:00:00.000Z');

    prisma.guestBonusLedgerEntry.findFirst.mockResolvedValue({
      rewardId: 'reward-1',
    });
    tx.guestBonusLedgerEntry.findFirst.mockResolvedValue(entry);
    tx.guestGameReward.findFirst
      .mockResolvedValueOnce({
        id: 'reward-1',
        status: 'APPROVED',
        claimRequired: true,
        deliveryRequestedAt: acceptedAt,
        claimExpiresAt,
        expiresAt: null,
      })
      .mockResolvedValueOnce({
        id: 'reward-1',
        status: 'APPROVED',
        tenantId: user.tenantId,
        profileId: 'profile-1',
        guestId: 'guest-1',
        lootBoxId: null,
        missionId: 'mission-1',
        seasonId: null,
        rewardLabel: '25 бонусов',
        rewardCode: 'BONUS_25',
        approvedByUserId: null,
        claimRequired: true,
      });
    tx.guestGameRewardWalletItem.findFirst.mockResolvedValue({
      id: 'wallet-1',
    });
    tx.guestBonusBalanceCurrent.findUnique.mockResolvedValue({
      id: 'balance-1',
      externalGuestId: 'lg-guest-1',
      bonusBalance: new Prisma.Decimal(100),
    });
    prisma.$transaction.mockImplementation((callback) => callback(tx as any));

    const result = await service.resolveReconciliation(user, 'ledger-1', {
      outcome: 'CONFIRMED',
      note: 'Баланс гостя сверён в Langame, начисление присутствует.',
      confirmation: true,
    });

    expect(result).toMatchObject({
      ledgerEntryId: 'ledger-1',
      status: 'CONFIRMED',
      outcome: 'CONFIRMED',
      operatorNote: 'Баланс гостя сверён в Langame, начисление присутствует.',
    });
    expect(langameClient.adjustGuestBalanceByPhone).not.toHaveBeenCalled();
    expect(langameClient.postEndpoint).not.toHaveBeenCalled();
    expect(tx.guestBonusLedgerEntry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'ledger-1',
          tenantId: user.tenantId,
          status: 'RECONCILIATION_REQUIRED',
          attempts: entry.attempts,
          claimGeneration: entry.claimGeneration,
          executionRevision: entry.executionRevision,
        },
        data: expect.objectContaining({
          status: 'CONFIRMED',
          processedByUserId: user.id,
          balanceBefore: new Prisma.Decimal(100),
          balanceAfter: new Prisma.Decimal(125),
          metadata: expect.objectContaining({
            reconciliationResolution: expect.objectContaining({
              outcome: 'CONFIRMED',
              confirmation: true,
              actorUserId: user.id,
              previousErrorCode: 'LANGAME_WRITE_OUTCOME_UNKNOWN',
            }),
          }),
        }),
      }),
    );
    expect(tx.guestGameReward.update).toHaveBeenCalledWith({
      where: { id: 'reward-1' },
      data: expect.objectContaining({
        status: 'PAID',
        approvedByUserId: user.id,
      }),
    });
    expect(tx.guestGameRewardWalletItem.updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: user.tenantId,
        rewardId: 'reward-1',
        kind: 'REWARD',
        status: 'PROCESSING',
      },
      data: expect.objectContaining({
        status: 'CLAIMED',
        claimedAt: expect.any(Date),
      }),
    });
    expect(tx.guestGameEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: 'REWARD_PAID',
          createdByUserId: user.id,
          externalId: 'bonus-ledger:ledger-1',
          payload: expect.objectContaining({
            reconciliationResolution: expect.objectContaining({
              outcome: 'CONFIRMED',
              note: 'Баланс гостя сверён в Langame, начисление присутствует.',
            }),
          }),
        }),
      }),
    );
  });

  it('marks an explicitly not-applied reconciliation retryable without calling the provider', async () => {
    const { service, prisma, langameClient } = createService();
    const tx = ledgerTransactionMock();
    const entry = ledgerEntry({
      status: 'RECONCILIATION_REQUIRED',
      attempts: 5,
      errorCode: 'LANGAME_WRITE_OUTCOME_UNKNOWN',
      errorMessage: 'provider response was lost',
      langameRequest: { phone: '+7 *** **-33', value: 25 },
      langameResponse: null,
    });

    prisma.guestBonusLedgerEntry.findFirst.mockResolvedValue({
      rewardId: 'reward-1',
    });
    tx.guestBonusLedgerEntry.findFirst.mockResolvedValue(entry);
    tx.guestGameReward.findFirst.mockResolvedValue({
      id: 'reward-1',
      status: 'APPROVED',
      claimRequired: true,
      deliveryRequestedAt: new Date('2026-06-10T09:00:00.000Z'),
      claimExpiresAt: new Date('2026-06-11T09:00:00.000Z'),
      expiresAt: null,
    });
    tx.guestGameRewardWalletItem.findFirst.mockResolvedValue({
      id: 'wallet-1',
    });
    prisma.$transaction.mockImplementation((callback) => callback(tx as any));

    const result = await service.resolveReconciliation(user, 'ledger-1', {
      outcome: 'NOT_APPLIED',
      note: 'По журналу Langame начисление отсутствует, повтор разрешён.',
      confirmation: 'true',
    });

    expect(result).toMatchObject({
      ledgerEntryId: 'ledger-1',
      status: 'FAILED',
      outcome: 'NOT_APPLIED',
    });
    expect(langameClient.adjustGuestBalanceByPhone).not.toHaveBeenCalled();
    expect(langameClient.postEndpoint).not.toHaveBeenCalled();
    expect(tx.guestBonusLedgerEntry.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'ledger-1',
        tenantId: user.tenantId,
        status: 'RECONCILIATION_REQUIRED',
        attempts: entry.attempts,
        claimGeneration: entry.claimGeneration,
        executionRevision: entry.executionRevision,
      },
      data: expect.objectContaining({
        status: 'FAILED',
        processedByUserId: user.id,
        attempts: 0,
        nextAttemptAt: expect.any(Date),
        errorCode: 'RECONCILIATION_NOT_APPLIED',
        errorMessage:
          'По журналу Langame начисление отсутствует, повтор разрешён.',
        metadata: expect.objectContaining({
          reconciliationResolution: expect.objectContaining({
            outcome: 'NOT_APPLIED',
            confirmation: true,
            actorUserId: user.id,
            previousAttempts: 5,
          }),
        }),
      }),
    });
    expect(tx.guestGameRewardWalletItem.updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: user.tenantId,
        rewardId: 'reward-1',
        kind: 'REWARD',
        status: 'PROCESSING',
      },
      data: { status: 'FAILED' },
    });
    expect(tx.guestGameReward.update).not.toHaveBeenCalled();
    expect(tx.guestGameEvent.create).not.toHaveBeenCalled();
  });

  it('requires both an operator note and explicit reconciliation confirmation', async () => {
    const { service, prisma, langameClient } = createService();

    await expect(
      service.resolveReconciliation(user, 'ledger-1', {
        outcome: 'CONFIRMED',
        note: ' ',
        confirmation: true,
      }),
    ).rejects.toThrow('обязателен комментарий');
    await expect(
      service.resolveReconciliation(user, 'ledger-1', {
        outcome: 'NOT_APPLIED',
        note: 'Проверено вручную.',
        confirmation: false,
      }),
    ).rejects.toThrow('явного подтверждения');

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(langameClient.adjustGuestBalanceByPhone).not.toHaveBeenCalled();
  });

  it('keeps NOT_APPLIED retry quarantined while the timed-out provider request may still finish', async () => {
    const { service, prisma, langameClient } = createService({
      LANGAME_BONUS_RECONCILIATION_QUARANTINE_MINUTES: '30',
    });
    const tx = ledgerTransactionMock();
    const entry = ledgerEntry({
      rewardId: null,
      status: 'RECONCILIATION_REQUIRED',
      attempts: 1,
      claimGeneration: 4,
      failedAt: new Date(),
      updatedAt: new Date(),
      errorCode: 'LANGAME_WRITE_OUTCOME_UNKNOWN',
      errorMessage: 'provider response was lost',
    });

    prisma.guestBonusLedgerEntry.findFirst.mockResolvedValue({
      rewardId: null,
    });
    tx.guestBonusLedgerEntry.findFirst.mockResolvedValue(entry);
    prisma.$transaction.mockImplementation((callback) => callback(tx as any));

    await expect(
      service.resolveReconciliation(user, entry.id, {
        outcome: 'NOT_APPLIED',
        note: 'Проверка начата слишком рано.',
        confirmation: true,
      }),
    ).rejects.toThrow('NOT_APPLIED retry remains quarantined until');

    expect(tx.guestBonusLedgerEntry.updateMany).not.toHaveBeenCalled();
    expect(langameClient.adjustGuestBalanceByPhone).not.toHaveBeenCalled();
  });

  it('uses a status CAS and rolls back a stale operator resolution', async () => {
    const { service, prisma, langameClient } = createService();
    const tx = ledgerTransactionMock();
    const entry = ledgerEntry({
      status: 'RECONCILIATION_REQUIRED',
      attempts: 1,
      errorCode: 'LANGAME_WRITE_OUTCOME_UNKNOWN',
      errorMessage: 'provider response was lost',
      langameRequest: {},
      langameResponse: null,
    });

    prisma.guestBonusLedgerEntry.findFirst.mockResolvedValue({
      rewardId: 'reward-1',
    });
    tx.guestBonusLedgerEntry.findFirst.mockResolvedValue(entry);
    tx.guestGameReward.findFirst.mockResolvedValue({
      id: 'reward-1',
      status: 'APPROVED',
      claimRequired: true,
      deliveryRequestedAt: new Date('2026-06-10T09:00:00.000Z'),
      claimExpiresAt: new Date('2026-06-11T09:00:00.000Z'),
      expiresAt: null,
    });
    tx.guestGameRewardWalletItem.findFirst.mockResolvedValue({
      id: 'wallet-1',
    });
    tx.guestBonusLedgerEntry.updateMany.mockResolvedValue({ count: 0 });
    prisma.$transaction.mockImplementation((callback) => callback(tx as any));

    await expect(
      service.resolveReconciliation(user, 'ledger-1', {
        outcome: 'NOT_APPLIED',
        note: 'Операторская сверка завершена.',
        confirmation: true,
      }),
    ).rejects.toThrow('уже была разрешена другим оператором');

    expect(tx.guestBonusLedgerEntry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'RECONCILIATION_REQUIRED',
        }),
      }),
    );
    expect(langameClient.adjustGuestBalanceByPhone).not.toHaveBeenCalled();
  });

  it('rejects an old provider response after NOT_APPLIED retry creates a new claim generation', async () => {
    const { service } = createService();
    const tx = ledgerTransactionMock();
    const oldWorkerEntry = ledgerEntry({
      rewardId: null,
      guestId: null,
      profileId: null,
      externalGuestId: null,
      status: 'DISPATCHING',
      attempts: 1,
      claimGeneration: 4,
      metadata: { langameBalanceType: 'balance' },
    });
    const currentGeneration = 5;

    tx.guestBonusLedgerEntry.updateMany.mockImplementation((args) => ({
      count:
        args.where.status === 'DISPATCHING' &&
        args.where.attempts === 1 &&
        args.where.claimGeneration === currentGeneration
          ? 1
          : 0,
    }));

    await expect(
      (service as any).confirmEntryInTransaction(
        tx,
        user.id,
        oldWorkerEntry,
        { phone: '+7 *** **-33', value: 25 },
        { status: true },
        'DISPATCHING',
      ),
    ).rejects.toThrow(
      'Ledger-запись потеряла право подтвердить внешнюю выдачу',
    );

    expect(tx.guestBonusLedgerEntry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'DISPATCHING',
          attempts: 1,
          claimGeneration: 4,
          executionRevision: oldWorkerEntry.executionRevision,
        }),
      }),
    );
  });

  it.each(['POST_THROW', 'CONFIRM_THROW'] as const)(
    'never sends a second provider write after %s',
    async (failureMode) => {
      const { service, prisma, langameClient, secretEncryptionService } =
        createService();
      const entry = ledgerEntry({ status: 'PROCESSING', attempts: 1 });
      const access = {
        apiKey: 'request-token',
        sources: [
          {
            domain: 'club-1',
            baseUrl: 'https://46.langamepro.ru/public_api',
          },
        ],
      };
      let ledgerStatus = 'PROCESSING';

      prisma.guest.findFirst.mockResolvedValue({
        phoneEncrypted: 'encrypted-phone',
        phoneMasked: '+7 *** **-33',
      });
      secretEncryptionService.decrypt.mockReturnValue('+7 (999) 111-22-33');
      prisma.guestGameReward.findFirst.mockResolvedValue({
        id: 'reward-1',
        status: 'APPROVED',
        claimRequired: true,
        deliveryRequestedAt: new Date('2026-06-10T09:00:00.000Z'),
        claimExpiresAt: new Date('2026-06-11T09:00:00.000Z'),
        expiresAt: null,
      });
      prisma.guestGameRewardWalletItem.findFirst.mockResolvedValue({
        id: 'wallet-1',
      });
      prisma.guestBonusLedgerEntry.updateMany.mockImplementation((args) => {
        if (
          args.where.status === 'PROCESSING' &&
          args.data.status === 'DISPATCHING' &&
          ledgerStatus === 'PROCESSING'
        ) {
          ledgerStatus = 'DISPATCHING';
          return { count: 1 };
        }
        if (
          args.where.status === 'DISPATCHING' &&
          args.data.status === 'RECONCILIATION_REQUIRED' &&
          ledgerStatus === 'DISPATCHING'
        ) {
          ledgerStatus = 'RECONCILIATION_REQUIRED';
          return { count: 1 };
        }
        return { count: 0 };
      });
      if (failureMode === 'POST_THROW') {
        langameClient.adjustGuestBalanceByPhone.mockRejectedValue(
          new Error('provider outcome unknown'),
        );
      } else {
        langameClient.adjustGuestBalanceByPhone.mockResolvedValue({
          status: true,
        });
        jest
          .spyOn(service as any, 'confirmEntry')
          .mockRejectedValue(new Error('confirmation commit failed'));
      }

      const config = {
        path: '/master_api/guests/balance/phone',
        maxAttempts: 3,
        retryMinutes: 1,
      };
      const first = await (service as any).processClaimedEntry(
        user.id,
        entry,
        config,
        access,
      );
      const second = await (service as any).processClaimedEntry(
        user.id,
        entry,
        config,
        access,
      );

      expect(first.status).toBe('RECONCILIATION_REQUIRED');
      expect(second.status).toBe('BLOCKED');
      expect(langameClient.adjustGuestBalanceByPhone).toHaveBeenCalledTimes(1);
    },
  );

  it('cancels claimed ledger entries for staff test profiles before Langame dispatch when accrual is explicitly disabled', async () => {
    const { service, prisma, langameClient, secretEncryptionService } =
      createService();
    const tx = ledgerTransactionMock();
    const entry = ledgerEntry({
      id: 'ledger-staff-test',
      profileId: 'profile-staff',
      rewardId: 'reward-staff',
      metadata: { rewardType: 'BONUS_BALANCE' },
    });
    const access = {
      apiKey: 'request-token',
      sources: [
        {
          domain: 'club-1',
          baseUrl: 'https://46.langamepro.ru/public_api',
        },
      ],
    };

    prisma.guest.findFirst.mockResolvedValue({
      phoneEncrypted: 'encrypted-phone',
      phoneMasked: '+7 *** **-33',
    });
    prisma.guestGameProfile.findFirst.mockResolvedValue({
      isStaffTest: true,
      staffTestReason: 'STAFF_PHONE_MATCH',
    });
    secretEncryptionService.decrypt.mockReturnValue('+7 (999) 111-22-33');
    prisma.$transaction.mockImplementation((callback) => callback(tx as any));

    const result = await (service as any).processClaimedEntry(
      user.id,
      entry,
      {
        ready: true,
        path: '/master_api/guests/balance/phone',
        maxAttempts: 3,
        staffTestRewardAccrualEnabled: false,
      },
      access,
    );

    expect(result).toMatchObject({
      ledgerEntryId: 'ledger-staff-test',
      rewardId: 'reward-staff',
      status: 'CANCELED',
      note: expect.stringContaining('тест сотрудника'),
    });
    expect(langameClient.adjustGuestBalanceByPhone).not.toHaveBeenCalled();
    expect(tx.guestBonusLedgerEntry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'ledger-staff-test',
          tenantId: user.tenantId,
          status: 'PROCESSING',
          attempts: entry.attempts,
          claimGeneration: entry.claimGeneration,
          lockedAt: entry.lockedAt,
          executionRevision: entry.executionRevision,
        },
        data: expect.objectContaining({
          status: 'CANCELED',
          errorCode: 'STAFF_TEST_PROFILE',
          metadata: expect.objectContaining({
            staffTestBlocked: true,
            staffTestReason: 'STAFF_PHONE_MATCH',
          }),
        }),
      }),
    );
    expect(tx.guestGameReward.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'reward-staff',
          tenantId: user.tenantId,
          status: { in: ['PENDING', 'APPROVED'] },
        }),
        data: { status: 'CANCELED' },
      }),
    );
    expect(tx.guestGameProfile.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'profile-staff', tenantId: user.tenantId },
        data: expect.objectContaining({
          isStaffTest: true,
          staffTestReason: 'STAFF_PHONE_MATCH',
        }),
      }),
    );
  });

  it('does not let a stale staff-test worker cancel a newer claim generation', async () => {
    const { service, prisma, langameClient, secretEncryptionService } =
      createService();
    const tx = ledgerTransactionMock();
    const entry = ledgerEntry({
      id: 'ledger-stale-staff-test',
      profileId: 'profile-staff',
      rewardId: 'reward-staff',
      attempts: 1,
    });
    const access = {
      apiKey: 'request-token',
      sources: [
        {
          domain: 'club-1',
          baseUrl: 'https://46.langamepro.ru/public_api',
        },
      ],
    };

    prisma.guest.findFirst.mockResolvedValue({
      phoneEncrypted: 'encrypted-phone',
      phoneMasked: '+7 *** **-33',
    });
    prisma.guestGameProfile.findFirst.mockResolvedValue({
      isStaffTest: true,
      staffTestReason: 'STAFF_PHONE_MATCH',
    });
    secretEncryptionService.decrypt.mockReturnValue('+7 (999) 111-22-33');
    tx.guestBonusLedgerEntry.updateMany.mockResolvedValueOnce({ count: 0 });
    prisma.$transaction.mockImplementation((callback) => callback(tx as any));

    const result = await (service as any).processClaimedEntry(
      user.id,
      entry,
      {
        ready: true,
        path: '/master_api/guests/balance/phone',
        maxAttempts: 3,
        staffTestRewardAccrualEnabled: false,
      },
      access,
    );

    expect(result).toMatchObject({
      ledgerEntryId: 'ledger-stale-staff-test',
      status: 'BLOCKED',
      note: expect.stringContaining('поздняя отмена'),
    });
    expect(langameClient.adjustGuestBalanceByPhone).not.toHaveBeenCalled();
    expect(tx.guestGameReward.updateMany).not.toHaveBeenCalled();
    expect(tx.guestGameProfile.updateMany).not.toHaveBeenCalled();
  });

  it('dispatches staff test ledger entries by default', async () => {
    const { service, prisma, langameClient, secretEncryptionService } =
      createService();
    const entry = ledgerEntry({
      id: 'ledger-staff-test',
      profileId: 'profile-staff',
      rewardId: 'reward-staff',
      metadata: { rewardType: 'BONUS_BALANCE' },
    });
    const access = {
      apiKey: 'request-token',
      sources: [
        {
          domain: 'club-1',
          baseUrl: 'https://46.langamepro.ru/public_api',
        },
      ],
    };

    prisma.guest.findFirst.mockResolvedValue({
      phoneEncrypted: 'encrypted-phone',
      phoneMasked: '+7 *** **-33',
    });
    prisma.guestGameProfile.findFirst.mockResolvedValue({
      isStaffTest: true,
      staffTestReason: 'STAFF_PHONE_MATCH',
    });
    secretEncryptionService.decrypt.mockReturnValue('+7 (999) 111-22-33');
    langameClient.adjustGuestBalanceByPhone.mockResolvedValue({
      status: true,
      phone: '79991112233',
    });
    jest.spyOn(service as any, 'confirmEntry').mockResolvedValue(null);

    const result = await (service as any).processClaimedEntry(
      user.id,
      entry,
      {
        ready: true,
        path: '/master_api/guests/balance/phone',
        maxAttempts: 3,
      },
      access,
    );

    expect(result).toMatchObject({
      ledgerEntryId: 'ledger-staff-test',
      rewardId: 'reward-staff',
      status: 'CONFIRMED',
    });
    expect(langameClient.adjustGuestBalanceByPhone).toHaveBeenCalledWith(
      'https://46.langamepro.ru/public_api',
      'request-token',
      expect.objectContaining({
        phone: '79991112233',
        type: 'bonus_balance',
        sum: 25,
      }),
      '/master_api/guests/balance/phone',
    );
    expect((service as any).confirmEntry).toHaveBeenCalledWith(
      user.id,
      entry,
      expect.objectContaining({
        phone: '+7 *** **-33',
        staffTestReason: 'STAFF_PHONE_MATCH',
        staffTestAccrualOverride: true,
        staffTestRewardAccrualEnabled: true,
        staffTestRewardAccrualEnv:
          'GUEST_GAME_STAFF_TEST_REWARD_ACCRUAL_ENABLED',
      }),
      expect.objectContaining({
        status: true,
        phone: '***2233',
      }),
    );
  });

  it('recovers guest portal ledger domains from the reward store before dispatching', async () => {
    const {
      service,
      prisma,
      langameClient,
      langameSettingsService,
      secretEncryptionService,
    } = createService();
    const entry = ledgerEntry({
      id: 'ledger-guest-portal-domain',
      guestId: null,
      externalDomain: 'leetplus-guest-portal',
      externalGuestId: null,
      storeId: 'store-1337',
      metadata: {
        rewardType: 'BONUS_BALANCE',
        langameBalanceType: 'bonus_balance',
      },
    });
    const access = {
      apiKey: 'request-token',
      sources: [
        {
          domain: '1337.langame.ru',
          baseUrl: 'https://1337.langame.ru/public_api',
        },
        {
          domain: '443.langame.ru',
          baseUrl: 'https://443.langame.ru/public_api',
        },
      ],
    };
    langameSettingsService.resolveTenantAccess.mockResolvedValue(access);

    prisma.store.findFirst.mockResolvedValue({
      externalDomain: '1337.langame.ru',
      integrationSource: {
        provider: IntegrationProvider.LANGAME,
        domain: '1337.langame.ru',
        isActive: true,
      },
    });
    prisma.guestGameProfile.findFirst.mockResolvedValue({
      phoneEncrypted: 'profile-encrypted-phone',
      contactMasked: '***3344',
    });
    secretEncryptionService.decrypt.mockReturnValue('+7 (999) 222-33-44');
    langameClient.adjustGuestBalanceByPhone.mockResolvedValue({
      status: true,
      phone: '79992223344',
    });
    jest.spyOn(service as any, 'confirmEntry').mockResolvedValue(null);

    const result = await (service as any).processClaimedEntry(
      user.id,
      entry,
      {
        mode: 'READY',
        dryRun: false,
        ready: true,
        enabled: true,
        path: '/master_api/guests/balance/phone',
        rewardTypes: ['BONUS_BALANCE'],
        limit: 50,
        maxAttempts: 5,
        retryMinutes: 1,
        staleLockMinutes: 15,
      },
      access,
    );

    expect(result).toMatchObject({
      ledgerEntryId: 'ledger-guest-portal-domain',
      status: 'CONFIRMED',
      externalDomain: '1337.langame.ru',
    });
    expect(prisma.store.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'store-1337',
        tenantId: user.tenantId,
      },
      select: {
        externalDomain: true,
        integrationSource: {
          select: {
            provider: true,
            domain: true,
            isActive: true,
          },
        },
      },
    });
    expect(langameClient.adjustGuestBalanceByPhone).toHaveBeenCalledWith(
      'https://1337.langame.ru/public_api',
      'request-token',
      {
        phone: '79992223344',
        type: 'bonus_balance',
        sum: 25,
        comment: expect.stringContaining('LeetPlus'),
      },
      '/master_api/guests/balance/phone',
    );
    expect((service as any).confirmEntry).toHaveBeenCalledWith(
      user.id,
      expect.objectContaining({
        id: 'ledger-guest-portal-domain',
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: '1337.langame.ru',
      }),
      expect.objectContaining({
        phone: '***3344',
        type: 'bonus_balance',
        sum: 25,
      }),
      expect.objectContaining({
        status: true,
        phone: '***3344',
      }),
    );
  });

  it('dispatches claimed money balance entries to Langame balance by phone', async () => {
    const { service, prisma, langameClient, secretEncryptionService } =
      createService();
    const entry = ledgerEntry({
      id: 'ledger-balance-1',
      rewardId: 'reward-balance-1',
      idempotencyKey: 'guest-game-reward:reward-balance-1:bonus:v1',
      amount: new Prisma.Decimal(100),
      metadata: { rewardType: 'BALANCE', langameBalanceType: 'balance' },
    });
    const access = {
      apiKey: 'request-token',
      sources: [
        {
          domain: 'club-1',
          baseUrl: 'https://46.langamepro.ru/public_api',
        },
      ],
    };

    prisma.guest.findFirst.mockResolvedValue({
      phoneEncrypted: 'encrypted-phone',
      phoneMasked: '+7 *** **-33',
    });
    secretEncryptionService.decrypt.mockReturnValue('+7 (999) 111-22-33');
    langameClient.adjustGuestBalanceByPhone.mockResolvedValue({
      status: true,
      phone: '79991112233',
    });
    jest.spyOn(service as any, 'confirmEntry').mockResolvedValue(null);

    const result = await (service as any).processClaimedEntry(
      user.id,
      entry,
      {
        mode: 'READY',
        dryRun: false,
        ready: true,
        enabled: true,
        path: '/master_api/guests/balance/phone',
        rewardTypes: ['BALANCE'],
        limit: 50,
        maxAttempts: 5,
        retryMinutes: 1,
        staleLockMinutes: 15,
      },
      access,
    );

    expect(result).toMatchObject({
      ledgerEntryId: 'ledger-balance-1',
      status: 'CONFIRMED',
      amount: 100,
    });
    expect(langameClient.adjustGuestBalanceByPhone).toHaveBeenCalledWith(
      'https://46.langamepro.ru/public_api',
      'request-token',
      {
        phone: '79991112233',
        type: 'balance',
        sum: 100,
        comment: expect.stringContaining('LeetPlus'),
      },
      '/master_api/guests/balance/phone',
    );
    expect((service as any).confirmEntry).toHaveBeenCalledWith(
      user.id,
      entry,
      expect.objectContaining({
        phone: '+7 *** **-33',
        type: 'balance',
        sum: 100,
      }),
      expect.objectContaining({
        status: true,
        phone: '***2233',
      }),
    );
  });

  it('recursively masks camelCase, snake_case, mobile and tel fields in provider responses', async () => {
    const { service, prisma, langameClient, secretEncryptionService } =
      createService();
    const entry = ledgerEntry({
      id: 'ledger-response-sanitizer',
      rewardId: 'reward-response-sanitizer',
      attempts: 1,
      metadata: { rewardType: 'BONUS', langameBalanceType: 'bonus_balance' },
    });
    const access = {
      apiKey: 'request-token',
      sources: [
        {
          domain: 'club-1',
          baseUrl: 'https://46.langamepro.ru/public_api',
        },
      ],
    };
    const providerResponse = {
      status: true,
      phoneNumber: '79991112233',
      phone_number: '78887776655',
      nested: [
        {
          mobile_phone: '+7 (900) 111-22-33',
          safe: 'keep-me',
        },
        {
          contactPhone: '79995554422',
          details: {
            tel: '79990001144',
            contact_number: '79992221100',
          },
        },
        {
          mobile: 7_999_333_2211,
          mobileApp: 'do-not-mask',
          hotel: 'also-do-not-mask',
        },
      ],
    };

    prisma.guest.findFirst.mockResolvedValue({
      phoneEncrypted: 'encrypted-phone',
      phoneMasked: '+7 *** **-33',
    });
    secretEncryptionService.decrypt.mockReturnValue('+7 (999) 111-22-33');
    langameClient.adjustGuestBalanceByPhone.mockResolvedValue(providerResponse);
    const confirmEntry = jest
      .spyOn(service as any, 'confirmEntry')
      .mockResolvedValue(null);

    await (service as any).processClaimedEntry(
      user.id,
      entry,
      {
        mode: 'READY',
        dryRun: false,
        ready: true,
        enabled: true,
        path: '/master_api/guests/balance/phone',
        rewardTypes: ['BONUS'],
        limit: 50,
        maxAttempts: 5,
        retryMinutes: 1,
        staleLockMinutes: 15,
      },
      access,
    );

    expect(confirmEntry).toHaveBeenCalledWith(
      user.id,
      entry,
      expect.objectContaining({
        phone: '+7 *** **-33',
      }),
      {
        status: true,
        phoneNumber: '***2233',
        phone_number: '***6655',
        nested: [
          {
            mobile_phone: '***2233',
            safe: 'keep-me',
          },
          {
            contactPhone: '***4422',
            details: {
              tel: '***1144',
              contact_number: '***1100',
            },
          },
          {
            mobile: '***2211',
            mobileApp: 'do-not-mask',
            hotel: 'also-do-not-mask',
          },
        ],
      },
    );
  });

  it.each([
    {
      ledgerId: 'ledger-negative-bonus-1',
      amount: -10,
      rewardType: 'BONUS',
      langameType: 'bonus_balance',
      expectedNote: 'Langame подтвердил списание бонусного баланса.',
    },
    {
      ledgerId: 'ledger-negative-money-1',
      amount: -50,
      rewardType: 'BALANCE',
      langameType: 'balance',
      expectedNote: 'Langame подтвердил списание денежного баланса.',
    },
  ])(
    'dispatches negative $langameType entries to Langame with signed sums and masked audit payloads',
    async ({ ledgerId, amount, rewardType, langameType, expectedNote }) => {
      const { service, prisma, langameClient, secretEncryptionService } =
        createService();
      const entry = ledgerEntry({
        id: ledgerId,
        rewardId: null,
        entryType: 'SPEND',
        idempotencyKey: `${ledgerId}:spend:v1`,
        amount: new Prisma.Decimal(amount),
        reason: 'Balance reversal',
        metadata: { rewardType, langameBalanceType: langameType },
      });
      const access = {
        apiKey: 'request-token',
        sources: [
          {
            domain: 'club-1',
            baseUrl: 'https://46.langamepro.ru/public_api',
          },
        ],
      };

      prisma.guest.findFirst.mockResolvedValue({
        phoneEncrypted: 'encrypted-phone',
        phoneMasked: '+7 *** **-33',
      });
      secretEncryptionService.decrypt.mockReturnValue('+7 (999) 111-22-33');
      langameClient.adjustGuestBalanceByPhone.mockResolvedValue({
        status: true,
        phone: '79991112233',
      });
      jest.spyOn(service as any, 'confirmEntry').mockResolvedValue(null);

      const result = await (service as any).processClaimedEntry(
        user.id,
        entry,
        {
          mode: 'READY',
          dryRun: false,
          ready: true,
          enabled: true,
          path: '/master_api/guests/balance/phone',
          rewardTypes: [rewardType],
          limit: 50,
          maxAttempts: 5,
          retryMinutes: 1,
          staleLockMinutes: 15,
        },
        access,
      );

      expect(result).toMatchObject({
        ledgerEntryId: ledgerId,
        status: 'CONFIRMED',
        amount,
        note: expectedNote,
      });
      expect(langameClient.adjustGuestBalanceByPhone).toHaveBeenCalledWith(
        'https://46.langamepro.ru/public_api',
        'request-token',
        {
          phone: '79991112233',
          type: langameType,
          sum: amount,
          comment: expect.stringContaining('LeetPlus'),
        },
        '/master_api/guests/balance/phone',
      );
      expect((service as any).confirmEntry).toHaveBeenCalledWith(
        user.id,
        entry,
        expect.objectContaining({
          phone: '+7 *** **-33',
          type: langameType,
          sum: amount,
        }),
        expect.objectContaining({
          status: true,
          phone: '***2233',
        }),
      );
    },
  );

  it('atomically marks the delivered reward PAID and its wallet item CLAIMED', async () => {
    const { service, prisma } = createService();
    const tx = ledgerTransactionMock();
    const entry = ledgerEntry({
      status: 'PROCESSING',
      attempts: 1,
      metadata: { rewardType: 'BONUS', langameBalanceType: 'bonus_balance' },
    });

    tx.guestBonusBalanceCurrent.findUnique.mockResolvedValue(null);
    tx.guestGameReward.findFirst.mockResolvedValue({
      id: 'reward-1',
      status: 'APPROVED',
      tenantId: user.tenantId,
      profileId: 'profile-1',
      guestId: 'guest-1',
      lootBoxId: null,
      missionId: 'mission-1',
      seasonId: null,
      rewardLabel: '25 bonuses',
      rewardCode: 'LP-25',
      approvedByUserId: null,
      claimRequired: false,
      deliveryRequestedAt: null,
      claimExpiresAt: null,
      expiresAt: null,
    });
    tx.guestGameRewardWalletItem.updateMany.mockResolvedValue({ count: 1 });
    prisma.$transaction.mockImplementation((callback) => callback(tx as any));

    await (service as any).confirmEntry(
      user.id,
      entry,
      { phone: '+7 *** **-33', type: 'bonus_balance', sum: 25 },
      { status: true },
    );

    expect(tx.guestBonusLedgerEntry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'ledger-1',
          tenantId: user.tenantId,
          status: 'DISPATCHING',
          attempts: entry.attempts,
          claimGeneration: entry.claimGeneration,
          executionRevision: entry.executionRevision,
        },
        data: expect.objectContaining({ status: 'CONFIRMED' }),
      }),
    );
    expect(tx.guestGameReward.update).toHaveBeenCalledWith({
      where: { id: 'reward-1' },
      data: {
        status: 'PAID',
        paidAt: expect.any(Date),
        approvedByUserId: user.id,
      },
    });
    expect(tx.guestGameRewardWalletItem.updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: user.tenantId,
        rewardId: 'reward-1',
        kind: 'REWARD',
        status: 'PROCESSING',
      },
      data: {
        status: 'CLAIMED',
        claimedAt: expect.any(Date),
      },
    });
    expect(tx.guestGameEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: 'REWARD_PAID',
          externalId: 'bonus-ledger:ledger-1',
        }),
      }),
    );
  });

  it('confirms negative bonus balance entries by reducing GuestBonusBalanceCurrent', async () => {
    const { service, prisma } = createService();
    const tx = ledgerTransactionMock();
    const entry = ledgerEntry({
      id: 'ledger-negative-bonus-1',
      rewardId: null,
      entryType: 'SPEND',
      idempotencyKey: 'ledger-negative-bonus-1:spend:v1',
      amount: new Prisma.Decimal(-10),
      metadata: { rewardType: 'BONUS', langameBalanceType: 'bonus_balance' },
    });

    tx.guestBonusBalanceCurrent.findUnique.mockResolvedValue({
      id: 'current-1',
      externalGuestId: 'lg-guest-1',
      bonusBalance: new Prisma.Decimal(25),
    });
    prisma.$transaction.mockImplementation((callback) => callback(tx as any));

    await (service as any).confirmEntry(
      user.id,
      entry,
      { phone: '+7 *** **-33', type: 'bonus_balance', sum: -10 },
      { status: true },
    );

    expect(tx.guestBonusBalanceCurrent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'current-1' },
      }),
    );
    const currentUpdate = tx.guestBonusBalanceCurrent.update.mock.calls[0][0];
    expect(currentUpdate.data.bonusBalance.toString()).toBe('15');
    expect(tx.guestBonusBalanceCurrent.create).not.toHaveBeenCalled();

    const ledgerUpdate = tx.guestBonusLedgerEntry.updateMany.mock.calls[0][0];
    expect(ledgerUpdate).toEqual(
      expect.objectContaining({
        where: {
          id: 'ledger-negative-bonus-1',
          tenantId: user.tenantId,
          status: 'DISPATCHING',
          attempts: entry.attempts,
          claimGeneration: entry.claimGeneration,
          executionRevision: entry.executionRevision,
        },
        data: expect.objectContaining({
          status: 'CONFIRMED',
          balanceBefore: expect.any(Prisma.Decimal),
          balanceAfter: expect.any(Prisma.Decimal),
        }),
      }),
    );
    expect(ledgerUpdate.data.balanceBefore.toString()).toBe('25');
    expect(ledgerUpdate.data.balanceAfter.toString()).toBe('15');
  });

  it('keeps money balance confirmations out of GuestBonusBalanceCurrent', async () => {
    const { service, prisma } = createService();
    const tx = ledgerTransactionMock();
    const entry = ledgerEntry({
      id: 'ledger-negative-money-1',
      rewardId: null,
      entryType: 'SPEND',
      idempotencyKey: 'ledger-negative-money-1:spend:v1',
      amount: new Prisma.Decimal(-50),
      metadata: { rewardType: 'BALANCE', langameBalanceType: 'balance' },
    });

    prisma.$transaction.mockImplementation((callback) => callback(tx as any));

    await (service as any).confirmEntry(
      user.id,
      entry,
      { phone: '+7 *** **-33', type: 'balance', sum: -50 },
      { status: true },
    );

    expect(tx.guestBonusBalanceCurrent.findUnique).not.toHaveBeenCalled();
    expect(tx.guestBonusBalanceCurrent.findFirst).not.toHaveBeenCalled();
    expect(tx.guestBonusBalanceCurrent.update).not.toHaveBeenCalled();
    expect(tx.guestBonusBalanceCurrent.create).not.toHaveBeenCalled();
    expect(tx.guestBonusLedgerEntry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'ledger-negative-money-1',
          tenantId: user.tenantId,
          status: 'DISPATCHING',
          attempts: entry.attempts,
          claimGeneration: entry.claimGeneration,
          executionRevision: entry.executionRevision,
        },
        data: expect.objectContaining({
          status: 'CONFIRMED',
          balanceBefore: null,
          balanceAfter: null,
        }),
      }),
    );
  });

  it('cancels reward and non-provider deliveries but protocol-blocks provider revoke mutations', async () => {
    process.env.GUEST_GAME_DELIVERY_REAL_SEND_ENABLED = 'true';
    process.env.GUEST_GAME_DELIVERY_TELEGRAM_ENABLED = 'true';
    process.env.GUEST_GAME_DELIVERY_TELEGRAM_BOT_TOKEN = 'telegram-token';
    process.env.GUEST_GAME_MAX_DELIVERY_ENABLED = 'true';
    process.env.GUEST_GAME_MAX_DELIVERY_LIVE_CANARY_ENABLED = 'true';
    process.env.GUEST_GAME_MAX_BOT_TOKEN = 'max-token';
    const { service, prisma } = createService();
    const entry = ledgerEntry({
      id: 'ledger-cancel-1',
      rewardId: 'reward-cancel-1',
      amount: new Prisma.Decimal(40),
      status: 'PENDING',
    });

    prisma.guestBonusLedgerEntry.findFirst.mockResolvedValue(entry);
    prisma.guestGameReward.findFirst.mockResolvedValueOnce(null);
    prisma.guestGameReward.updateMany.mockResolvedValue({ count: 1 });
    prisma.guestGameDelivery.findMany.mockResolvedValue([
      {
        id: 'delivery-cancel-1',
        rewardId: 'reward-cancel-1',
        status: 'READY',
        channel: 'TELEGRAM',
      },
      {
        id: 'delivery-cancel-2',
        rewardId: 'reward-cancel-1',
        status: 'FAILED',
        channel: 'MAX',
      },
      {
        id: 'delivery-cancel-3',
        rewardId: 'reward-cancel-1',
        status: 'READY',
        channel: 'CASHIER',
      },
      {
        id: 'delivery-cancel-4',
        rewardId: 'reward-cancel-1',
        status: 'BLOCKED',
        channel: 'MANUAL',
      },
    ]);
    prisma.guestGameDelivery.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.cancelEntry(user, 'ledger-cancel-1', {
      reason: 'Wrong guest match',
    });

    expect(prisma.guestBonusLedgerEntry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'ledger-cancel-1',
          tenantId: user.tenantId,
          status: 'PENDING',
        },
        data: expect.objectContaining({
          status: 'CANCELED',
          processedByUserId: user.id,
          lockedAt: null,
          nextAttemptAt: null,
          errorMessage: 'Wrong guest match',
        }),
      }),
    );
    expect(prisma.guestGameReward.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'reward-cancel-1',
        tenantId: user.tenantId,
        status: 'APPROVED',
      },
      data: { status: 'CANCELED' },
    });
    expect(prisma.guestGameDelivery.updateMany).toHaveBeenCalledTimes(2);
    expect(prisma.guestGameDelivery.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        tenantId: user.tenantId,
        id: 'delivery-cancel-3',
        status: { notIn: ['SENT', 'CANCELED'] },
      },
      data: expect.objectContaining({
        status: 'CANCELED',
        stateReasonCode: 'BONUS_LEDGER_CANCELED',
        canceledAt: expect.any(Date),
        note: expect.stringContaining('Wrong guest match'),
      }),
    });
    expect(prisma.guestGameDelivery.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        tenantId: user.tenantId,
        id: 'delivery-cancel-4',
        status: { notIn: ['SENT', 'CANCELED'] },
      },
      data: expect.objectContaining({
        status: 'CANCELED',
        stateReasonCode: 'BONUS_LEDGER_CANCELED',
        canceledAt: expect.any(Date),
        note: expect.stringContaining('Wrong guest match'),
      }),
    });
    expect(prisma.guestGameDeliveryEvent.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          tenantId: user.tenantId,
          deliveryId: 'delivery-cancel-3',
          rewardId: 'reward-cancel-1',
          actorUserId: user.id,
          eventType: 'DELIVERY_CANCELED_BY_LEDGER',
          fromStatus: 'READY',
          toStatus: 'CANCELED',
          channel: 'CASHIER',
          stateReasonCode: 'BONUS_LEDGER_CANCELED',
          note: expect.stringContaining('Wrong guest match'),
          payload: expect.objectContaining({
            ledgerEntryId: 'ledger-cancel-1',
            reason: 'Wrong guest match',
          }),
        }),
        expect.objectContaining({
          deliveryId: 'delivery-cancel-4',
          fromStatus: 'BLOCKED',
          channel: 'MANUAL',
          stateReasonCode: 'BONUS_LEDGER_CANCELED',
        }),
      ],
    });
    expect(
      prisma.guestGameDelivery.updateMany.mock.calls.map(
        ([input]) => input.where.id,
      ),
    ).toEqual(['delivery-cancel-3', 'delivery-cancel-4']);
    expect(result).toMatchObject({
      ledgerEntryId: 'ledger-cancel-1',
      rewardId: 'reward-cancel-1',
      status: 'CANCELED',
      amount: 40,
      protocolBlockedDeliveries: 2,
      note: expect.stringContaining('reward canceled: 1'),
    });
    expect(result.note).toContain('deliveries canceled: 2');
    expect(result.note).toContain('provider deliveries protocol-blocked: 2');
    expect(JSON.stringify(result)).not.toContain('telegram-token');
    expect(JSON.stringify(result)).not.toContain('max-token');
  });

  it('blocks cancellation while a ledger entry has a fresh processing lock', async () => {
    const { service, prisma } = createService({
      LANGAME_BONUS_ACCRUAL_STALE_LOCK_MINUTES: '15',
    });
    const entry = ledgerEntry({
      id: 'ledger-processing-1',
      rewardId: 'reward-processing-1',
      status: 'PROCESSING',
      lockedAt: new Date(Date.now() - 60 * 1000),
    });

    prisma.guestBonusLedgerEntry.findFirst.mockResolvedValue(entry);

    await expect(
      service.cancelEntry(user, 'ledger-processing-1', {
        reason: 'Operator retry',
      }),
    ).rejects.toThrow('обрабатывается');

    expect(prisma.guestBonusLedgerEntry.updateMany).not.toHaveBeenCalled();
    expect(prisma.guestGameReward.updateMany).not.toHaveBeenCalled();
    expect(prisma.guestGameDelivery.updateMany).not.toHaveBeenCalled();
    expect(prisma.guestGameDeliveryEvent.createMany).not.toHaveBeenCalled();
  });

  it('rechecks the ledger row under lock and cannot cancel a concurrent dispatch', async () => {
    const { service, prisma } = createService();
    const pending = ledgerEntry({
      id: 'ledger-race-1',
      rewardId: 'reward-race-1',
      status: 'PENDING',
    });
    const dispatching = {
      ...pending,
      status: 'DISPATCHING',
      lockedAt: new Date(),
    };
    prisma.guestBonusLedgerEntry.findFirst
      .mockResolvedValueOnce(pending)
      .mockResolvedValueOnce(dispatching);

    await expect(
      service.cancelEntry(user, 'ledger-race-1', {
        reason: 'Operator cancellation',
      }),
    ).rejects.toThrow('обрабатывается worker-ом');

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
    expect(prisma.guestBonusLedgerEntry.updateMany).not.toHaveBeenCalled();
    expect(prisma.guestGameReward.updateMany).not.toHaveBeenCalled();
    expect(prisma.guestGameDelivery.updateMany).not.toHaveBeenCalled();
  });

  it('does not overwrite an operator cancellation with a late pre-dispatch failure', async () => {
    const { service, prisma } = createService();
    const tx = ledgerTransactionMock();
    const lockedAt = new Date('2026-06-10T10:00:00.000Z');
    const entry = ledgerEntry({
      id: 'ledger-cancel-won',
      rewardId: 'reward-cancel-won',
      status: 'PROCESSING',
      attempts: 2,
      lockedAt,
    });

    // The operator cancellation committed first, so the PROCESSING generation
    // no longer exists when the delayed worker error tries to persist.
    tx.guestBonusLedgerEntry.updateMany.mockResolvedValue({ count: 0 });
    prisma.$transaction.mockImplementation((callback) => callback(tx as any));

    const transitioned = await (service as any).failEntry(
      user.id,
      entry,
      {
        maxAttempts: 5,
        retryMinutes: 1,
      },
      new Error('late phone resolution failure'),
    );

    expect(transitioned).toBe(false);
    expect(tx.guestBonusLedgerEntry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'ledger-cancel-won',
          tenantId: user.tenantId,
          status: 'PROCESSING',
          attempts: 2,
          claimGeneration: entry.claimGeneration,
          lockedAt,
          executionRevision: entry.executionRevision,
        },
        data: expect.objectContaining({
          status: 'FAILED',
          errorCode: 'LANGAME_WRITE_FAILED',
        }),
      }),
    );
    expect(tx.guestGameRewardWalletItem.updateMany).not.toHaveBeenCalled();
  });
});

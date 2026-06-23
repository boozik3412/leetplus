/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */

import { ConfigService } from '@nestjs/config';
import {
  IntegrationProvider,
  Prisma,
  TenantLifecycleStatus,
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
      findMany: jest.fn(),
      findFirst: jest.fn(),
      createMany: jest.fn(),
      update: jest.fn(),
    },
    guestGameReward: {
      count: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
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
    resolveTenantAccess: jest.fn(),
  };
  const secretEncryptionService = {
    decrypt: jest.fn((value: string) => value),
  };
  const service = new GuestBonusLedgerService(
    prisma,
    configService,
    langameClient as any,
    langameSettingsService as any,
    secretEncryptionService as any,
  );

  prisma.guestBonusLedgerEntry.groupBy.mockResolvedValue([]);
  prisma.guestBonusLedgerEntry.findFirst.mockResolvedValue(null);
  prisma.guestBonusLedgerEntry.createMany.mockResolvedValue({ count: 0 });
  prisma.guestBonusLedgerEntry.update.mockResolvedValue({});
  prisma.guestGameReward.count.mockResolvedValue(0);
  prisma.guestGameReward.findMany.mockResolvedValue([]);
  prisma.guestGameReward.updateMany.mockResolvedValue({ count: 0 });
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
    reason: 'Bonus reward',
    metadata: {},
    createdAt: new Date('2026-06-10T10:00:00.000Z'),
    ...overrides,
  };
}

function ledgerTransactionMock() {
  return {
    guestBonusBalanceCurrent: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    guestBonusLedgerEntry: {
      update: jest.fn(),
    },
    guestGameReward: {
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    guestGameProfile: {
      updateMany: jest.fn(),
    },
    guestGameEvent: {
      create: jest.fn(),
    },
  };
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
    expect(langameSettingsService.resolveTenantAccess).toHaveBeenCalledWith(
      user.tenantId,
    );
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
      access,
    );
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
    });

    const query = prisma.$queryRaw.mock.calls[0][0] as {
      strings?: string[];
      values?: unknown[];
    };
    expect(query.strings).toBeDefined();
    const sql = query.strings?.join('?') ?? '';

    expect(sql).toContain('"attempts" >=');
    expect(sql).toContain('"externalDomain" = ?');
    expect(sql).toContain('"errorMessage" ILIKE ?');
    expect(query.values).toEqual(
      expect.arrayContaining([
        'leetplus-guest-portal',
        '%leetplus-guest-portal%',
      ]),
    );
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
      access,
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

  it('queues approved rewards for the Langame phone balance endpoint without storing raw phones', async () => {
    const { service, prisma, secretEncryptionService } = createService();

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
        }),
        take: 1,
      }),
    );
    expect(
      JSON.stringify(prisma.guestBonusLedgerEntry.createMany.mock.calls[0][0]),
    ).not.toContain('79991112233');
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

  it('cancels approved rewards for profiles already marked as staff tests', async () => {
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

  it('detects staff phones before queueing rewards to Langame ledger', async () => {
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

  it('cancels claimed ledger entries for staff test profiles before Langame dispatch', async () => {
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
    expect(tx.guestBonusLedgerEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ledger-staff-test' },
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

  it('recovers guest portal ledger domains from the reward store before dispatching', async () => {
    const { service, prisma, langameClient, secretEncryptionService } =
      createService();
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

    const ledgerUpdate = tx.guestBonusLedgerEntry.update.mock.calls[0][0];
    expect(ledgerUpdate).toEqual(
      expect.objectContaining({
        where: { id: 'ledger-negative-bonus-1' },
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
    expect(tx.guestBonusLedgerEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ledger-negative-money-1' },
        data: expect.objectContaining({
          status: 'CONFIRMED',
          balanceBefore: null,
          balanceAfter: null,
        }),
      }),
    );
  });

  it('cancels the linked approved reward and pending deliveries when a ledger entry is canceled', async () => {
    const { service, prisma } = createService();
    const entry = ledgerEntry({
      id: 'ledger-cancel-1',
      rewardId: 'reward-cancel-1',
      amount: new Prisma.Decimal(40),
      status: 'PENDING',
    });

    prisma.guestBonusLedgerEntry.findFirst.mockResolvedValue(entry);
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
    ]);
    prisma.guestGameDelivery.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.cancelEntry(user, 'ledger-cancel-1', {
      reason: 'Wrong guest match',
    });

    expect(prisma.guestBonusLedgerEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ledger-cancel-1' },
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
    expect(prisma.guestGameDelivery.updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: user.tenantId,
        id: 'delivery-cancel-1',
        status: { notIn: ['SENT', 'CANCELED'] },
      },
      data: expect.objectContaining({
        status: 'CANCELED',
        canceledAt: expect.any(Date),
        note: expect.stringContaining('Wrong guest match'),
      }),
    });
    expect(prisma.guestGameDelivery.updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: user.tenantId,
        id: 'delivery-cancel-2',
        status: { notIn: ['SENT', 'CANCELED'] },
      },
      data: expect.objectContaining({
        status: 'CANCELED',
        canceledAt: expect.any(Date),
        note: expect.stringContaining('Wrong guest match'),
      }),
    });
    expect(prisma.guestGameDeliveryEvent.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          tenantId: user.tenantId,
          deliveryId: 'delivery-cancel-1',
          rewardId: 'reward-cancel-1',
          actorUserId: user.id,
          eventType: 'DELIVERY_CANCELED_BY_LEDGER',
          fromStatus: 'READY',
          toStatus: 'CANCELED',
          channel: 'TELEGRAM',
          note: expect.stringContaining('Wrong guest match'),
          payload: expect.objectContaining({
            ledgerEntryId: 'ledger-cancel-1',
            reason: 'Wrong guest match',
          }),
        }),
        expect.objectContaining({
          deliveryId: 'delivery-cancel-2',
          fromStatus: 'FAILED',
          channel: 'MAX',
        }),
      ],
    });
    expect(result).toMatchObject({
      ledgerEntryId: 'ledger-cancel-1',
      rewardId: 'reward-cancel-1',
      status: 'CANCELED',
      amount: 40,
      note: expect.stringContaining('reward canceled: 1'),
    });
    expect(result.note).toContain('deliveries canceled: 2');
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

    expect(prisma.guestBonusLedgerEntry.update).not.toHaveBeenCalled();
    expect(prisma.guestGameReward.updateMany).not.toHaveBeenCalled();
    expect(prisma.guestGameDelivery.updateMany).not.toHaveBeenCalled();
    expect(prisma.guestGameDeliveryEvent.createMany).not.toHaveBeenCalled();
  });
});

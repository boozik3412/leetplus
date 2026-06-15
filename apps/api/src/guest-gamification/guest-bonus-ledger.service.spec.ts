/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */

import { ConfigService } from '@nestjs/config';
import {
  IntegrationProvider,
  Prisma,
  TenantLifecycleStatus,
  UserRole,
} from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { GuestBonusLedgerService } from './guest-bonus-ledger.service';

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
    guestBonusLedgerEntry: {
      groupBy: jest.fn(),
      findMany: jest.fn(),
    },
    guestGameReward: {
      count: jest.fn(),
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
  };
  const langameSettingsService = {
    resolveTenantAccess: jest.fn(),
  };
  const service = new GuestBonusLedgerService(
    prisma,
    configService,
    langameClient as any,
    langameSettingsService as any,
  );

  prisma.guestBonusLedgerEntry.groupBy.mockResolvedValue([]);
  prisma.guestGameReward.count.mockResolvedValue(0);

  return {
    prisma,
    configService,
    langameClient,
    langameSettingsService,
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
      langamePath: null,
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
    expect(langameSettingsService.resolveTenantAccess).not.toHaveBeenCalled();
    expect(langameClient.postEndpoint).not.toHaveBeenCalled();
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
  });

  it('claims and processes ready entries only when Langame write config is enabled', async () => {
    const { service, prisma, langameSettingsService } = createService({
      LANGAME_BONUS_ACCRUAL_ENABLED: 'true',
      LANGAME_BONUS_ACCRUAL_PATH: '/api/bonuses/accrue',
    });
    const entry = ledgerEntry();
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
        path: '/api/bonuses/accrue',
        limit: 1,
      }),
    );
    expect((service as any).processClaimedEntry).toHaveBeenCalledWith(
      user.id,
      entry,
      expect.objectContaining({ path: '/api/bonuses/accrue' }),
      access,
    );
  });
});

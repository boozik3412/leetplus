import { BadRequestException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { PrismaService } from '../prisma/prisma.service';
import { GuestGamificationStatisticsService } from './guest-gamification-statistics.service';

const user = {
  id: 'user-1',
  email: 'owner@example.test',
  fullName: 'Owner',
  role: 'OWNER',
  isPlatformAdmin: false,
  tenantId: 'tenant-1',
  tenantSlug: 'tenant',
} as AuthenticatedUser;

describe('GuestGamificationStatisticsService', () => {
  it('returns one canonical dashboard contract without double-counting wallet and ledger rows', async () => {
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([
        {
          bucketStart: '2026-08-01',
          registrations: 3,
          activeUsers: 2,
        },
      ])
      .mockResolvedValueOnce([
        { bucketStart: '2026-08-01', deliveredRewards: 4 },
      ])
      .mockResolvedValueOnce([
        {
          bucketStart: '2026-08-01',
          confirmedBonusAmount: 250,
          confirmedBonusOperations: 2,
        },
      ])
      .mockResolvedValueOnce([{ current: 3, previous: 1 }])
      .mockResolvedValueOnce([{ current: 2, previous: 2 }])
      .mockResolvedValueOnce([
        {
          current: 4,
          previous: 2,
          qualified: 7,
          claimed: 5,
          delivered: 4,
          otherDelivered: 2,
        },
      ])
      .mockResolvedValueOnce([
        {
          current: 250,
          previous: 100,
          currentOperations: 2,
          previousOperations: 1,
        },
      ])
      .mockResolvedValueOnce([
        { type: 'BONUS_BALANCE', count: 2, amount: 250 },
        { type: 'MERCH', count: 2, amount: 0 },
      ])
      .mockResolvedValueOnce([
        { sourceKind: 'MISSION', count: 3 },
        { sourceKind: 'LOOT_BOX', count: 1 },
      ])
      .mockResolvedValueOnce([
        { latestDataAt: new Date('2026-08-02T10:00:00.000Z') },
      ]);
    const prisma = {
      store: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'store-1', name: 'Клуб 1', timeZone: 'Asia/Yekaterinburg' },
          ]),
      },
      $queryRaw: queryRaw,
    } as unknown as PrismaService;
    const service = new GuestGamificationStatisticsService(prisma);

    const result = await service.getStatistics(user, {
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-08-02T00:00:00.000Z',
      granularity: 'DAY',
    });

    expect(queryRaw).toHaveBeenCalledTimes(10);
    expect(result.summary.deliveredRewards).toEqual({
      current: 4,
      previous: 2,
      delta: 2,
      trendPercent: 100,
    });
    expect(result.summary.confirmedBonuses.current).toBe(250);
    expect(result.summary.confirmedBonuses.operations).toBe(2);
    expect(result.lifecycle).toEqual({
      qualified: 7,
      claimed: 5,
      delivered: 4,
    });
    expect(result.series[0]).toEqual({
      bucketStart: '2026-08-01',
      registrations: 3,
      activeUsers: 2,
      deliveredRewards: 4,
      confirmedBonusAmount: 250,
      confirmedBonusOperations: 2,
    });
    expect(result.meta.timeZone).toBe('Asia/Yekaterinburg');
  });

  it('rejects inverted and oversized ranges before querying statistics', async () => {
    const storeFindMany = jest.fn();
    const prisma = {
      store: { findMany: storeFindMany },
      $queryRaw: jest.fn(),
    } as unknown as PrismaService;
    const service = new GuestGamificationStatisticsService(prisma);

    await expect(
      service.getStatistics(user, {
        from: '2026-08-03T00:00:00.000Z',
        to: '2026-08-02T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.getStatistics(user, {
        from: '2023-01-01T00:00:00.000Z',
        to: '2026-08-02T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storeFindMany).not.toHaveBeenCalled();
  });

  it('rejects an unknown club instead of silently broadening the scope', async () => {
    const queryRaw = jest.fn();
    const prisma = {
      store: { findMany: jest.fn().mockResolvedValue([]) },
      $queryRaw: queryRaw,
    } as unknown as PrismaService;
    const service = new GuestGamificationStatisticsService(prisma);

    await expect(
      service.getStatistics(user, {
        from: '2026-08-01T00:00:00.000Z',
        to: '2026-08-02T00:00:00.000Z',
        storeIds: 'missing-store',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(queryRaw).not.toHaveBeenCalled();
  });
});

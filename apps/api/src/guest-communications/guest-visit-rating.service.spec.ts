import { BadRequestException } from '@nestjs/common';
import { GuestVisitRatingService } from './guest-visit-rating.service';

const NOW = new Date('2026-11-12T10:00:00.000Z');
const user = { id: 'user-a', tenantId: 'tenant-a' } as never;

function setup(mode: 'NETWORK' | 'STORES' = 'NETWORK') {
  const prisma = {
    guestVisitRatingSettings: {
      findUnique: jest.fn().mockResolvedValue({
        enabled: true,
        enabledAt: new Date('2026-11-10T10:00:00.000Z'),
        lastRunAt: null,
      }),
      upsert: jest.fn().mockResolvedValue({}),
    },
    $queryRaw: jest
      .fn()
      // Aggregate by club.
      .mockResolvedValueOnce([
        {
          storeId: 'store-a',
          storeName: 'Радищева',
          asked: 10,
          answered: 4,
          scoreSum: 18,
          low: 0,
          s1: 0,
          s2: 0,
          s3: 0,
          s4: 2,
          s5: 2,
        },
        {
          storeId: 'store-b',
          storeName: 'Ленина',
          asked: 5,
          answered: 2,
          scoreSum: 4,
          low: 2,
          s1: 1,
          s2: 0,
          s3: 1,
          s4: 0,
          s5: 0,
        },
      ])
      // Reachable guests.
      .mockResolvedValueOnce([{ count: 42 }]),
    guestVisitRating: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'r1',
          score: 1,
          answeredAt: new Date('2026-11-12T09:00:00.000Z'),
          visitEndedAt: new Date('2026-11-12T07:00:00.000Z'),
          storeId: 'store-b',
          guestId: 'guest-1',
          profile: { displayName: 'Ник' },
        },
      ]),
    },
    store: { findMany: jest.fn().mockResolvedValue([]) },
    guest: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: 'guest-1', fullNameMasked: 'Иван И.' }]),
    },
  };
  const scope = {
    resolve: jest.fn().mockResolvedValue({
      tenantId: 'tenant-a',
      mode,
      allowedStoreIds: mode === 'STORES' ? ['store-b'] : [],
    }),
  };
  return {
    prisma,
    scope,
    service: new GuestVisitRatingService(prisma as never, scope as never),
  };
}

describe('GuestVisitRatingService', () => {
  it('sums the network and puts the weakest club first', async () => {
    const { service } = setup();

    const report = await service.report(user, '30', NOW);

    expect(report.totals).toEqual({
      asked: 15,
      answered: 6,
      average: 3.67,
      low: 2,
      distribution: { '1': 1, '2': 0, '3': 1, '4': 2, '5': 2 },
    });
    expect(report.stores.map((row) => [row.storeName, row.average])).toEqual([
      ['Ленина', 2],
      ['Радищева', 4.5],
    ]);
    expect(report.reachableGuests).toBe(42);
    expect(report.recentLow).toEqual([
      {
        id: 'r1',
        score: 1,
        answeredAt: '2026-11-12T09:00:00.000Z',
        visitEndedAt: '2026-11-12T07:00:00.000Z',
        storeName: 'Ленина',
        guestId: 'guest-1',
        guestName: 'Иван И.',
      },
    ]);
    expect(report.settings).toMatchObject({
      enabled: true,
      sendHours: { from: 11, to: 22 },
    });
  });

  it('limits a club manager to own clubs', async () => {
    const { service, prisma } = setup('STORES');

    const report = await service.report(user, '7', NOW);

    expect(report.scope).toBe('STORES');
    expect(report.periodDays).toBe(7);
    expect(prisma.guestVisitRating.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-a',
          storeId: { in: ['store-b'] },
        }) as unknown,
      }),
    );
  });

  it('switches the question on with who and when', async () => {
    const { service, prisma } = setup();

    await service.saveSettings(user, { enabled: true }, NOW);

    expect(prisma.guestVisitRatingSettings.upsert).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-a' },
      create: {
        tenantId: 'tenant-a',
        enabled: true,
        enabledAt: NOW,
        enabledByUserId: 'user-a',
      },
      update: { enabled: true, enabledAt: NOW, enabledByUserId: 'user-a' },
    });
  });

  it('refuses a request without a yes or no', async () => {
    const { service } = setup();
    await expect(
      service.saveSettings(user, { enabled: 'yes' }, NOW),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

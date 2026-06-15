/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */

import { ConfigService } from '@nestjs/config';
import { IntegrationProvider, Prisma } from '@prisma/client';
import { GuestPortalService } from './guest-portal.service';

function createPrismaMock() {
  return {
    store: {
      findMany: jest.fn(),
    },
    guestGameMission: {
      findMany: jest.fn(),
    },
    guestGameLootBox: {
      findMany: jest.fn(),
    },
    guestGameSeason: {
      findMany: jest.fn(),
    },
  } as any;
}

function createService(configValues: Record<string, string | undefined> = {}) {
  const prisma = createPrismaMock();
  const configService = {
    get: jest.fn((key: string) => configValues[key]),
  } as unknown as ConfigService;
  const service = new GuestPortalService(
    prisma,
    configService,
    {} as any,
    {} as any,
    {} as any,
  );

  prisma.store.findMany.mockResolvedValue([]);
  prisma.guestGameMission.findMany.mockResolvedValue([]);
  prisma.guestGameLootBox.findMany.mockResolvedValue([]);
  prisma.guestGameSeason.findMany.mockResolvedValue([]);

  return { prisma, service };
}

describe('GuestPortalService', () => {
  describe('getGamificationClubDirectory', () => {
    it('returns only active gamification clubs and calculates distance when coordinates are provided', async () => {
      const { prisma, service } = createService({
        LANGAME_BONUS_ACCRUAL_ENABLED: 'true',
      });

      prisma.store.findMany.mockResolvedValue([
        {
          id: 'store-1',
          publicSlug: 'club-1337',
          name: '1337',
          city: 'Екатеринбург',
          address: 'ул. Ленина, 1',
          latitude: new Prisma.Decimal('56.838011'),
          longitude: new Prisma.Decimal('60.597465'),
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: '46',
          tenant: {
            id: 'tenant-1',
            name: 'Leet Clubs',
            slug: 'leet',
          },
        },
        {
          id: 'store-2',
          publicSlug: 'silent',
          name: 'Silent Club',
          city: 'Екатеринбург',
          address: 'ул. Малышева, 2',
          latitude: null,
          longitude: null,
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: '46',
          tenant: {
            id: 'tenant-2',
            name: 'No Games',
            slug: 'no-games',
          },
        },
      ]);
      prisma.guestGameMission.findMany.mockResolvedValue([
        {
          tenantId: 'tenant-1',
          storeIds: [],
          periodFrom: null,
          periodTo: null,
        },
      ]);
      prisma.guestGameLootBox.findMany.mockResolvedValue([
        {
          tenantId: 'tenant-1',
          storeIds: ['store-1'],
        },
      ]);
      prisma.guestGameSeason.findMany.mockResolvedValue([]);

      const directory = await service.getGamificationClubDirectory({
        lat: '56.838',
        lng: '60.597',
      });

      expect(directory.total).toBe(1);
      expect(directory.cities).toEqual(['Екатеринбург']);
      expect(directory.clubs[0]).toMatchObject({
        id: 'leet:club-1337',
        tenant: { slug: 'leet' },
        store: { id: 'store-1', name: '1337' },
        gamification: {
          activeMissions: 1,
          activeLootBoxes: 1,
          activeRules: 2,
          bonusWriteReady: true,
        },
      });
      expect(directory.clubs[0].location.coordinatesReady).toBe(true);
      expect(directory.clubs[0].location.distanceKm).toBeLessThan(1);
    });
  });
});

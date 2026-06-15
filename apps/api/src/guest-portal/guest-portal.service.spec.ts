/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */

import { ConfigService } from '@nestjs/config';
import { IntegrationProvider, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { GuestPortalService } from './guest-portal.service';

function createPrismaMock() {
  const prisma = {
    $transaction: jest.fn((callback) => callback(prisma)),
    tenant: {
      findFirst: jest.fn(),
    },
    guest: {
      findFirst: jest.fn(),
    },
    store: {
      findMany: jest.fn(),
    },
    guestPortalOtpChallenge: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    guestGameProfile: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
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

  return prisma;
}

function createService(configValues: Record<string, string | undefined> = {}) {
  const prisma = createPrismaMock();
  const configService = {
    get: jest.fn((key: string) => configValues[key]),
  } as unknown as ConfigService;
  const jwtService = {
    signAsync: jest.fn(),
  };
  const service = new GuestPortalService(
    prisma,
    configService,
    jwtService as any,
    {} as any,
    {} as any,
  );

  prisma.tenant.findFirst.mockResolvedValue(null);
  prisma.guest.findFirst.mockResolvedValue(null);
  prisma.store.findMany.mockResolvedValue([]);
  prisma.guestPortalOtpChallenge.findFirst.mockResolvedValue(null);
  prisma.guestPortalOtpChallenge.update.mockResolvedValue({});
  prisma.guestGameProfile.findFirst.mockResolvedValue(null);
  prisma.guestGameProfile.create.mockResolvedValue(null);
  prisma.guestGameProfile.update.mockResolvedValue(null);
  prisma.guestGameMission.findMany.mockResolvedValue([]);
  prisma.guestGameLootBox.findMany.mockResolvedValue([]);
  prisma.guestGameSeason.findMany.mockResolvedValue([]);

  return { jwtService, prisma, service };
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

  describe('verifyOtp', () => {
    it('creates a separate game profile for phone-only gamification registration', async () => {
      const { jwtService, prisma, service } = createService({
        APP_ENCRYPTION_KEY: 'test-secret',
      });
      const challengeId = 'challenge-1';
      const code = '123456';
      const codeHash = createHash('sha256')
        .update(`test-secret:${challengeId}:${code}`)
        .digest('hex');
      const buildPortalPayload = jest
        .spyOn(service as any, 'buildPortalPayload')
        .mockResolvedValue({
          profile: { id: 'profile-1' },
        });

      prisma.tenant.findFirst.mockResolvedValue({
        id: 'tenant-1',
        name: 'Leet Clubs',
        slug: 'leet',
        stores: [
          {
            id: 'store-1',
            publicSlug: 'club-1337',
            name: '1337',
            address: 'ул. Ленина, 1',
          },
        ],
      });
      prisma.guestPortalOtpChallenge.findFirst.mockResolvedValue({
        id: challengeId,
        tenantId: 'tenant-1',
        storeId: 'store-1',
        phoneHash: 'phone-hash-1',
        phoneMasked: '+7 *** ***-99-99',
        guestId: null,
        profileId: null,
        codeHash,
        status: 'PENDING',
        attempts: 0,
        expiresAt: new Date(Date.now() + 60_000),
      });
      prisma.guestGameProfile.create.mockResolvedValue({
        id: 'profile-1',
        guestId: null,
      });
      jwtService.signAsync.mockResolvedValue('guest-token');

      const result = await service.verifyOtp('leet', 'club-1337', {
        challengeId,
        code,
      });

      expect(prisma.guestGameProfile.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: 'tenant-1',
            displayName: 'Гость клуба',
            contactMasked: '+7 *** ***-99-99',
            phoneHash: 'phone-hash-1',
            status: 'ACTIVE',
          }),
        }),
      );
      expect(prisma.guestPortalOtpChallenge.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: challengeId },
          data: expect.objectContaining({
            status: 'VERIFIED',
            guestId: null,
            profileId: 'profile-1',
          }),
        }),
      );
      expect(jwtService.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          guestId: null,
          profileId: 'profile-1',
          phoneHash: 'phone-hash-1',
        }),
        expect.any(Object),
      );
      expect(buildPortalPayload).toHaveBeenCalledWith(
        expect.objectContaining({ profileId: 'profile-1' }),
      );
      expect(result.token).toBe('guest-token');
    });
  });
});

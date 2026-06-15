/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */

import { ConfigService } from '@nestjs/config';
import { IntegrationProvider, Prisma } from '@prisma/client';
import { createHash, createHmac } from 'node:crypto';
import { GuestPortalService } from './guest-portal.service';

function createPrismaMock() {
  const prisma = {
    $transaction: jest.fn((callback) => callback(prisma)),
    tenant: {
      findFirst: jest.fn(),
    },
    guest: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
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
    guestGameReward: {
      updateMany: jest.fn(),
    },
    guestGameDelivery: {
      updateMany: jest.fn(),
    },
    guestBonusLedgerEntry: {
      updateMany: jest.fn(),
    },
    guestGameEvent: {
      create: jest.fn(),
      createMany: jest.fn(),
      updateMany: jest.fn(),
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
    verifyAsync: jest.fn(),
  };
  const langameSettingsService = {
    searchGuestByPhoneForPortal: jest.fn(),
  };
  const service = new GuestPortalService(
    prisma,
    configService,
    jwtService as any,
    langameSettingsService as any,
    {} as any,
  );

  prisma.tenant.findFirst.mockResolvedValue(null);
  prisma.guest.findFirst.mockResolvedValue(null);
  prisma.guest.findMany.mockResolvedValue([]);
  prisma.store.findMany.mockResolvedValue([]);
  prisma.guestPortalOtpChallenge.findFirst.mockResolvedValue(null);
  prisma.guestPortalOtpChallenge.update.mockResolvedValue({});
  prisma.guestGameProfile.findFirst.mockResolvedValue(null);
  prisma.guestGameProfile.create.mockResolvedValue(null);
  prisma.guestGameProfile.update.mockResolvedValue(null);
  prisma.guestGameReward.updateMany.mockResolvedValue({ count: 0 });
  prisma.guestGameDelivery.updateMany.mockResolvedValue({ count: 0 });
  prisma.guestBonusLedgerEntry.updateMany.mockResolvedValue({ count: 0 });
  prisma.guestGameEvent.create.mockResolvedValue({});
  prisma.guestGameEvent.createMany.mockResolvedValue({ count: 0 });
  prisma.guestGameEvent.updateMany.mockResolvedValue({ count: 0 });
  prisma.guestGameMission.findMany.mockResolvedValue([]);
  prisma.guestGameLootBox.findMany.mockResolvedValue([]);
  prisma.guestGameSeason.findMany.mockResolvedValue([]);
  langameSettingsService.searchGuestByPhoneForPortal.mockResolvedValue({
    checkedAt: '2026-06-15T08:00:00.000Z',
    sources: [],
  });

  return { jwtService, langameSettingsService, prisma, service };
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
          gamificationEnabled: false,
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
          gamificationEnabled: true,
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

      expect(directory.total).toBe(2);
      expect(directory.cities).toEqual(['Екатеринбург']);
      expect(directory.clubs[0]).toMatchObject({
        id: 'leet:club-1337',
        tenant: { slug: 'leet' },
        store: { id: 'store-1', name: '1337' },
        gamification: {
          activeMissions: 1,
          activeLootBoxes: 1,
          activeRules: 2,
          gamificationEnabled: true,
          configuredByStore: false,
          bonusWriteReady: true,
        },
      });
      expect(directory.clubs[0].location.coordinatesReady).toBe(true);
      expect(directory.clubs[0].location.distanceKm).toBeLessThan(1);
      expect(directory.clubs[1]).toMatchObject({
        id: 'no-games:silent',
        gamification: {
          activeRules: 0,
          gamificationEnabled: true,
          configuredByStore: true,
        },
      });
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
      const consentAcceptedAt = new Date('2026-06-15T08:00:00.000Z');

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
        gameConsentAcceptedAt: consentAcceptedAt,
        gameConsentVersion: 'guest-game-v1-2026-06-15',
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
      expect(prisma.guestGameEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: 'tenant-1',
            profileId: 'profile-1',
            guestId: null,
            eventType: 'GAME_CONSENT_GRANTED',
            source: 'GUEST_PORTAL',
            externalId: `otp:${challengeId}:game-consent`,
            occurredAt: consentAcceptedAt,
            payload: expect.objectContaining({
              consentVersion: 'guest-game-v1-2026-06-15',
              storeId: 'store-1',
              phoneMasked: '+7 *** ***-99-99',
            }),
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

  describe('matchLangameGuest', () => {
    it('links a phone-only game profile to a synced Langame guest', async () => {
      const { jwtService, langameSettingsService, prisma, service } =
        createService({
          APP_ENCRYPTION_KEY: 'test-secret',
        });
      const phone = '+7 999 111-22-33';
      const phoneHash = createHmac('sha256', 'test-secret')
        .update('79991112233')
        .digest('hex');
      const portalPayload = {
        guestFound: true,
        profile: { id: 'profile-1' },
      };
      jest
        .spyOn(service as any, 'buildPortalPayload')
        .mockResolvedValue(portalPayload);

      jwtService.verifyAsync.mockResolvedValue({
        sub: 'challenge-1',
        purpose: 'guest_portal',
        tenantId: 'tenant-1',
        storeId: 'store-1',
        guestId: null,
        profileId: 'profile-1',
        phoneHash,
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
      langameSettingsService.searchGuestByPhoneForPortal.mockResolvedValue({
        checkedAt: '2026-06-15T08:00:00.000Z',
        sources: [
          {
            id: 'source-1',
            name: 'Langame 1337',
            domain: '1337.langame.ru',
            status: 'SUCCESS',
            resultsCount: 1,
            errorMessage: null,
            results: [
              {
                externalGuestId: '42',
                guestTypeId: '7',
                phoneMasked: '***2233',
                emailMasked: null,
                fullNameMasked: 'I. P.',
                bonusProgramNumberMasked: null,
                dateLastActivity: null,
                rawKeys: ['guest_id', 'phone'],
              },
            ],
          },
        ],
      });
      prisma.guest.findFirst.mockResolvedValue({
        id: 'guest-1',
        tenantId: 'tenant-1',
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: '1337.langame.ru',
        externalGuestId: '42',
        phoneHash,
        phoneMasked: '***2233',
        emailMasked: null,
        fullNameMasked: 'I. P.',
      });
      prisma.guest.findMany.mockResolvedValue([
        {
          id: 'guest-1',
          externalDomain: '1337.langame.ru',
          externalGuestId: '42',
        },
      ]);
      prisma.guestGameProfile.findFirst
        .mockResolvedValueOnce({
          id: 'profile-1',
          guestId: null,
          phoneHash,
          contactMasked: '***2233',
          displayName: 'Гость клуба',
        })
        .mockResolvedValueOnce({
          id: 'profile-1',
          guestId: null,
          phoneHash,
          contactMasked: '***2233',
          displayName: 'Гость клуба',
        })
        .mockResolvedValueOnce(null);
      prisma.guestGameProfile.update.mockResolvedValue({
        id: 'profile-1',
        guestId: 'guest-1',
      });

      const result = await service.matchLangameGuest('Bearer guest-token', {
        phone,
      });

      expect(result.status).toBe('MATCHED_LOCAL');
      expect(result.linkStatus).toBe('LINKED');
      expect(result.linkedGuestId).toBe('guest-1');
      expect(result.linkedProfileId).toBe('profile-1');
      expect(result.portal).toBe(portalPayload);
      expect(prisma.guestGameProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'profile-1' },
          data: expect.objectContaining({
            guestId: 'guest-1',
            phoneHash,
          }),
        }),
      );
      expect(prisma.guestGameReward.updateMany).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-1',
          profileId: 'profile-1',
          guestId: null,
        },
        data: { guestId: 'guest-1' },
      });
      expect(prisma.guestGameEvent.updateMany).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-1',
          profileId: 'profile-1',
          guestId: null,
        },
        data: { guestId: 'guest-1' },
      });
      expect(prisma.guestGameEvent.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [
            expect.objectContaining({
              tenantId: 'tenant-1',
              profileId: 'profile-1',
              guestId: 'guest-1',
              eventType: 'GAME_PROFILE_LINKED',
              source: 'GUEST_PORTAL_PROFILE_LINK',
              externalProvider: IntegrationProvider.LANGAME,
              externalDomain: '1337.langame.ru',
              externalId: 'game-profile-link:profile-1:guest-1',
              payload: expect.objectContaining({
                source: 'guest_portal_langame_match',
                phoneMasked: '***2233',
                externalGuestId: '42',
              }),
            }),
          ],
          skipDuplicates: true,
        }),
      );
    });
  });
});

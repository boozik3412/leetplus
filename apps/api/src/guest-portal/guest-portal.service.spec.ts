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
      findMany: jest.fn(),
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
  prisma.guestBonusLedgerEntry.findMany.mockResolvedValue([]);
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

function portalPayloadFixture() {
  return {
    tenant: { name: 'LeetPlus', slug: 'demo' },
    store: {
      id: 'store-1',
      publicSlug: 'club-1337',
      name: '1337',
      address: 'ул. Ленина, 1',
    },
    guestFound: true,
    crmLead: {
      found: false,
      displayName: null,
      contactMasked: null,
      source: null,
      eventName: null,
      crmStatus: null,
      nextContactAt: null,
      matchedGuestFound: false,
      matchedAt: null,
    },
    profile: {
      id: 'profile-1',
      displayName: 'Игрок 1337',
      contactMasked: '+7 *** **-11',
      xp: 620,
      level: 3,
      nextLevelXp: 900,
      levelProgressPercent: 68,
      frame: 'silver',
    },
    loyalty: {
      groupName: 'Silver',
      discountPercent: 5,
      currentHours: 42,
      nextGroupName: 'Gold',
      nextGroupHours: 80,
      progressPercent: 52,
      balance: 100,
      bonusBalance: 250,
      bonusBalanceSource: 'ledger_current',
      bonusBalanceSyncedAt: '2026-06-15T08:00:00.000Z',
      lastSyncedAt: '2026-06-15T08:00:00.000Z',
    },
    guestSnapshot: {
      source: {
        provider: 'LANGAME',
        domain: '1337.langame.ru',
        lastSyncedAt: '2026-06-15T08:00:00.000Z',
      },
      identity: {
        phoneMasked: '+7 *** **-11',
        emailMasked: null,
        fullNameMasked: 'И***',
        birthdayProvided: false,
        documentPresent: false,
        bonusProgramNumberMasked: null,
      },
      registration: {
        registeredAt: '2026-06-01T08:00:00.000Z',
        lastActivityAt: '2026-06-14T08:00:00.000Z',
        confirmed: true,
        mobileRegistration: true,
        simpleRegistration: false,
        temporary: false,
        virtual: false,
        disabled: false,
      },
      profileCompleteness: {
        percent: 60,
        completed: ['phone'],
        missing: ['birthday'],
      },
      participation: {
        accountState: 'LANGAME_SYNCED',
        accountStateLabel: 'Langame связан',
        guestTypeId: 'silver',
        genderLabel: null,
        registrationChannel: 'mobile',
        verificationLabel: 'подтвержден',
        loyaltyCardStatus: 'LINKED',
        readinessPercent: 80,
        readiness: [],
      },
      statusLabels: [],
    },
    gamification: {
      nextActions: [
        {
          id: 'reward-ready',
          kind: 'CLAIM_REWARD',
          title: 'Забрать бонус',
          description: 'Покажите код кассиру',
          priority: 'HIGH',
          statusLabel: 'готово',
          progressPercent: null,
          anchor: 'rewards',
        },
      ],
      lootBoxes: [],
      missions: [
        {
          id: 'mission-1',
          name: 'Сыграй 2 часа',
          missionType: 'PLAY_TIME',
          rewardLabel: '50 бонусов',
          xpReward: 80,
          progressCurrent: 1,
          progressTarget: 2,
          progressUnit: 'час',
          progressPercent: 50,
          questSteps: [
            {
              id: 'play-first-hour',
              title: 'Сыграть первый час',
              target: 1,
              progressCurrent: 1,
              completed: true,
              current: false,
            },
            {
              id: 'play-second-hour',
              title: 'Доиграть второй час',
              target: 1,
              progressCurrent: 0,
              completed: false,
              current: true,
            },
          ],
          periodTo: null,
          manualApprovalRequired: false,
        },
        {
          id: 'mission-2',
          name: 'Вернись в клуб',
          missionType: 'REPEAT_VISIT',
          rewardLabel: '100 бонусов',
          xpReward: 120,
          progressCurrent: 1,
          progressTarget: 1,
          progressUnit: 'визит',
          progressPercent: 100,
          questSteps: [],
          periodTo: '2026-06-30T20:59:59.000Z',
          manualApprovalRequired: false,
        },
      ],
      seasons: [
        {
          id: 'season-1',
          name: 'Летний сезон',
          seasonType: 'CLUB_SEASON',
          premiumEnabled: false,
          periodTo: '2026-08-31T20:59:59.000Z',
          currentLevel: 3,
          nextLevel: 4,
          currentLevelXp: 500,
          nextLevelXp: 900,
          xpToNextLevel: 280,
          progressPercent: 68,
          reachedLevels: 3,
          totalLevels: 10,
          readyRewards: 1,
          waitingApprovalRewards: 0,
          redeemedRewards: 2,
          nextRewardLabel: '50 бонусов',
          nextPremiumRewardLabel: null,
          levels: [],
        },
      ],
      rewardSummary: {
        total: 2,
        ready: 1,
        waitingApproval: 1,
        redeemed: 0,
        expired: 0,
        nextExpiresAt: '2026-06-20T20:59:59.000Z',
      },
      rewards: [
        {
          id: 'reward-1',
          status: 'APPROVED',
          walletState: 'READY',
          rewardType: 'BONUS',
          rewardAmount: 100,
          rewardLabel: '100 бонусов',
          sourceKind: 'MISSION',
          sourceLabel: 'Вернись в клуб',
          rewardCode: 'LP-123',
          claimPayload: 'LP-123',
          qualifiedAt: '2026-06-15T08:00:00.000Z',
          expiresAt: '2026-06-20T20:59:59.000Z',
        },
        {
          id: 'reward-2',
          status: 'PENDING',
          walletState: 'WAITING_APPROVAL',
          rewardType: 'BONUS',
          rewardAmount: 50,
          rewardLabel: '50 бонусов',
          sourceKind: 'LOOT_BOX',
          sourceLabel: 'Лутбокс',
          rewardCode: null,
          claimPayload: null,
          qualifiedAt: '2026-06-15T08:00:00.000Z',
          expiresAt: null,
        },
      ],
      bonusHistory: {
        summary: {
          total: 1,
          confirmedAmount: 100,
          pendingAmount: 0,
          failed: 0,
          latestAt: '2026-06-15T08:00:00.000Z',
        },
        items: [
          {
            id: 'ledger-1',
            status: 'CONFIRMED',
            statusLabel: 'начислено',
            amount: 100,
            balanceAfter: 250,
            title: '100 бонусов',
            sourceKind: 'MISSION',
            sourceLabel: 'Вернись в клуб',
            storeName: '1337',
            occurredAt: '2026-06-15T08:00:00.000Z',
            confirmedAt: '2026-06-15T08:01:00.000Z',
            processedAt: '2026-06-15T08:00:30.000Z',
          },
        ],
      },
    },
    activity: {
      summary: {
        sessionsCount: 4,
        playMinutes: 360,
        logsCount: 0,
        transactionsCount: 0,
        gameEventsCount: 3,
        lastActivityAt: '2026-06-15T08:00:00.000Z',
      },
      timeline: [
        {
          id: 'timeline-1',
          kind: 'GAME_EVENT',
          title: 'XP',
          description: null,
          occurredAt: '2026-06-15T08:00:00.000Z',
          storeName: '1337',
          amount: null,
          xpDelta: 80,
        },
      ],
      xpHistory: [],
    },
    communications: {
      phone: {
        masked: '+7 *** **-11',
        consentStatus: 'GRANTED',
        consentSource: 'guest_portal',
        consentAt: '2026-06-15T08:00:00.000Z',
        unsubscribedAt: null,
        otpVerified: true,
        otpDeliveryReady: true,
      },
      telegram: {
        connected: true,
        identityMasked: 'ch***34',
        readyForRewards: true,
        status: 'READY',
      },
      max: {
        connected: false,
        identityMasked: null,
        readyForRewards: false,
        status: 'NOT_CONNECTED',
      },
      history: [],
    },
  };
}

describe('GuestPortalService', () => {
  describe('getGameSummary', () => {
    it('returns compact game state from the existing guest session payload', async () => {
      const { service } = createService();
      const portal = portalPayloadFixture();
      const getSession = jest
        .spyOn(service, 'getSession')
        .mockResolvedValue(portal as any);

      const summary = await service.getGameSummary('Bearer guest-token');

      expect(getSession).toHaveBeenCalledWith('Bearer guest-token');
      expect(summary).toMatchObject({
        tenant: portal.tenant,
        store: portal.store,
        profile: portal.profile,
        account: {
          guestFound: true,
          state: 'LANGAME_SYNCED',
          stateLabel: 'Langame связан',
          readinessPercent: 80,
          langameLinked: true,
        },
        loyalty: {
          groupName: 'Silver',
          discountPercent: 5,
          bonusBalance: 250,
          bonusBalanceSource: 'ledger_current',
        },
        rewards: {
          summary: portal.gamification.rewardSummary,
          ready: [portal.gamification.rewards[0]],
          latestBonus: portal.gamification.bonusHistory.items[0],
        },
        missions: {
          total: 2,
          featured: [
            expect.objectContaining({ id: 'mission-2', progressPercent: 100 }),
            expect.objectContaining({
              id: 'mission-1',
              progressPercent: 50,
              progressUnit: 'час',
              manualApprovalRequired: false,
              questSteps: [
                expect.objectContaining({
                  id: 'play-first-hour',
                  completed: true,
                }),
                expect.objectContaining({
                  id: 'play-second-hour',
                  current: true,
                }),
              ],
            }),
          ],
        },
        battlePass: {
          active: expect.objectContaining({
            id: 'season-1',
            currentLevel: 3,
            nextLevel: 4,
          }),
        },
        activity: {
          sessionsCount: 4,
          playMinutes: 360,
          gameEventsCount: 3,
          lastActivityAt: '2026-06-15T08:00:00.000Z',
          recent: [
            expect.objectContaining({
              id: 'timeline-1',
              kind: 'GAME_EVENT',
              title: 'XP',
              occurredAt: '2026-06-15T08:00:00.000Z',
              storeName: '1337',
              xpDelta: 80,
            }),
          ],
        },
        communications: {
          phoneConsentStatus: 'GRANTED',
          telegram: {
            connected: true,
            readyForRewards: true,
            status: 'READY',
          },
        },
      });
      expect(summary.generatedAt).toEqual(expect.any(String));
      expect(summary).not.toHaveProperty('guestSnapshot');
      expect(summary.activity).not.toHaveProperty('timeline');
      expect(summary.activity).not.toHaveProperty('xpHistory');
    });
  });

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
      expect(directory.search).toMatchObject({
        locationReady: true,
        radiusKm: null,
        radiusApplied: false,
        totalBeforeRadius: 2,
        hiddenWithoutCoordinates: 0,
      });
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

      const nearbyDirectory = await service.getGamificationClubDirectory({
        lat: '56.838',
        lng: '60.597',
        radiusKm: '1',
      });

      expect(nearbyDirectory.total).toBe(1);
      expect(nearbyDirectory.search).toMatchObject({
        locationReady: true,
        radiusKm: 1,
        radiusApplied: true,
        totalBeforeRadius: 2,
        hiddenWithoutCoordinates: 1,
      });
      expect(nearbyDirectory.clubs).toHaveLength(1);
      expect(nearbyDirectory.clubs[0].id).toBe('leet:club-1337');
    });
  });

  describe('buildLoyalty', () => {
    it('prefers current bonus balance updated by ledger over historical snapshot', () => {
      const { service } = createService();

      const loyalty = (service as any).buildLoyalty(
        {
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: '1337.langame.ru',
          externalGuestTypeId: null,
          currentCountHours: null,
          lastSyncedAt: new Date('2026-06-15T07:00:00.000Z'),
        },
        [],
        null,
        {
          bonusBalance: new Prisma.Decimal(150),
          snapshotDate: new Date('2026-06-15T10:00:00.000Z'),
          source: 'LANGAME_LEDGER',
          lastSyncedAt: new Date('2026-06-15T10:01:00.000Z'),
          updatedAt: new Date('2026-06-15T10:01:00.000Z'),
        },
        {
          bonusBalance: new Prisma.Decimal(100),
          snapshotDate: new Date('2026-06-15T00:00:00.000Z'),
        },
        null,
      );

      expect(loyalty).toMatchObject({
        bonusBalance: 150,
        bonusBalanceSource: 'LANGAME_LEDGER',
        bonusBalanceSyncedAt: '2026-06-15T10:01:00.000Z',
        lastSyncedAt: '2026-06-15T10:01:00.000Z',
      });
    });

    it('falls back to the latest snapshot when current bonus balance is absent', () => {
      const { service } = createService();

      const loyalty = (service as any).buildLoyalty(
        null,
        [],
        null,
        null,
        {
          bonusBalance: new Prisma.Decimal(90),
          snapshotDate: new Date('2026-06-15T00:00:00.000Z'),
        },
        null,
      );

      expect(loyalty).toMatchObject({
        bonusBalance: 90,
        bonusBalanceSource: 'LANGAME_SNAPSHOT',
        bonusBalanceSyncedAt: '2026-06-15T00:00:00.000Z',
        lastSyncedAt: '2026-06-15T00:00:00.000Z',
      });
    });
  });

  describe('buildBonusHistory', () => {
    it('maps ledger rows to safe guest-facing bonus history', () => {
      const { service } = createService();

      const history = (service as any).buildBonusHistory([
        {
          id: 'ledger-confirmed',
          status: 'CONFIRMED',
          entryType: 'EARN',
          amount: new Prisma.Decimal(50),
          balanceAfter: new Prisma.Decimal(150),
          processedAt: new Date('2026-06-15T10:00:00.000Z'),
          confirmedAt: new Date('2026-06-15T10:01:00.000Z'),
          failedAt: null,
          canceledAt: null,
          createdAt: new Date('2026-06-15T09:58:00.000Z'),
          updatedAt: new Date('2026-06-15T10:01:00.000Z'),
          reward: {
            rewardLabel: '50 бонусов за квест',
            rewardType: 'BONUS_BALANCE',
            lootBoxId: null,
            missionId: 'mission-1',
            seasonId: null,
            lootBox: null,
            mission: { name: 'Квест клуба 1337' },
            season: null,
          },
          store: { name: '1337' },
        },
        {
          id: 'ledger-pending',
          status: 'PENDING',
          entryType: 'EARN',
          amount: new Prisma.Decimal(20),
          balanceAfter: null,
          processedAt: null,
          confirmedAt: null,
          failedAt: null,
          canceledAt: null,
          createdAt: new Date('2026-06-15T10:05:00.000Z'),
          updatedAt: new Date('2026-06-15T10:05:00.000Z'),
          reward: null,
          store: null,
        },
        {
          id: 'ledger-failed',
          status: 'FAILED',
          entryType: 'EARN',
          amount: new Prisma.Decimal(10),
          balanceAfter: null,
          processedAt: new Date('2026-06-15T10:02:00.000Z'),
          confirmedAt: null,
          failedAt: new Date('2026-06-15T10:03:00.000Z'),
          canceledAt: null,
          createdAt: new Date('2026-06-15T10:00:00.000Z'),
          updatedAt: new Date('2026-06-15T10:03:00.000Z'),
          reward: null,
          store: { name: '1337' },
        },
      ]);

      expect(history.summary).toEqual({
        total: 3,
        confirmedAmount: 50,
        pendingAmount: 20,
        failed: 1,
        latestAt: '2026-06-15T10:05:00.000Z',
      });
      expect(history.items[0]).toMatchObject({
        id: 'ledger-pending',
        status: 'PENDING',
        statusLabel: 'В очереди',
        title: 'Начисление бонусов',
      });
      expect(history.items[1]).toMatchObject({
        id: 'ledger-failed',
        status: 'FAILED',
        statusLabel: 'Проверяется',
      });
      expect(history.items[2]).toMatchObject({
        id: 'ledger-confirmed',
        status: 'CONFIRMED',
        statusLabel: 'Начислено',
        amount: 50,
        balanceAfter: 150,
        sourceKind: 'MISSION',
        sourceLabel: 'Квест клуба 1337',
        storeName: '1337',
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

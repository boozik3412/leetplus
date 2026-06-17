/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */

import { ConfigService } from '@nestjs/config';
import { IntegrationProvider, Prisma } from '@prisma/client';
import { createHash, createHmac } from 'node:crypto';
import { GuestPortalService } from './guest-portal.service';

function createPrismaMock() {
  const prisma = {
    $transaction: jest.fn((input) =>
      typeof input === 'function' ? input(prisma) : Promise.all(input),
    ),
    tenant: {
      findFirst: jest.fn(),
    },
    guest: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    guestCrmLead: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    store: {
      findMany: jest.fn(),
    },
    guestPortalOtpChallenge: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    guestGameProfile: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    guestGameTelegramLinkChallenge: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
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
      count: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
      findFirst: jest.fn(),
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
  prisma.guestCrmLead.findFirst.mockResolvedValue(null);
  prisma.guestCrmLead.update.mockResolvedValue({});
  prisma.store.findMany.mockResolvedValue([]);
  prisma.guestPortalOtpChallenge.findFirst.mockResolvedValue(null);
  prisma.guestPortalOtpChallenge.create.mockResolvedValue({});
  prisma.guestPortalOtpChallenge.update.mockResolvedValue({});
  prisma.guestPortalOtpChallenge.updateMany.mockResolvedValue({ count: 0 });
  prisma.guestGameProfile.findFirst.mockResolvedValue(null);
  prisma.guestGameProfile.findMany.mockResolvedValue([]);
  prisma.guestGameProfile.create.mockResolvedValue(null);
  prisma.guestGameProfile.update.mockResolvedValue(null);
  prisma.guestGameTelegramLinkChallenge.findFirst.mockResolvedValue(null);
  prisma.guestGameTelegramLinkChallenge.create.mockResolvedValue(null);
  prisma.guestGameTelegramLinkChallenge.update.mockResolvedValue(null);
  prisma.guestGameTelegramLinkChallenge.updateMany.mockResolvedValue({
    count: 0,
  });
  prisma.guestGameReward.updateMany.mockResolvedValue({ count: 0 });
  prisma.guestGameDelivery.updateMany.mockResolvedValue({ count: 0 });
  prisma.guestBonusLedgerEntry.findMany.mockResolvedValue([]);
  prisma.guestBonusLedgerEntry.updateMany.mockResolvedValue({ count: 0 });
  prisma.guestGameEvent.create.mockResolvedValue({});
  prisma.guestGameEvent.createMany.mockResolvedValue({ count: 0 });
  prisma.guestGameEvent.count.mockResolvedValue(0);
  prisma.guestGameEvent.findFirst.mockResolvedValue(null);
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

function buildTestReferralCode(
  tenantSlug: string,
  storeId: string,
  storePublicSlug: string | null,
  profileId: string,
  secret: string,
) {
  const source = [
    'guest-game-referral-v1',
    tenantSlug,
    storeId,
    storePublicSlug ?? '',
    profileId,
  ].join(':');
  const digest = createHmac('sha256', secret)
    .update(source)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

  return `lp_ref_${digest.slice(0, 22)}`;
}

function mockLeetTenant(prisma: any) {
  prisma.tenant.findFirst.mockResolvedValue({
    id: 'tenant-1',
    name: 'Leet Clubs',
    slug: 'leet',
    stores: [
      {
        id: 'store-1',
        publicSlug: 'club-1337',
        name: '1337',
        address: 'Lenina, 1',
      },
    ],
  });
}

function referralCodeFor1337(
  profileId = 'inviter-profile-1',
  secret = 'referral-secret',
) {
  return buildTestReferralCode(
    'leet',
    'store-1',
    'club-1337',
    profileId,
    secret,
  );
}

function expectReferralEventCreated(
  prisma: any,
  options: {
    channel: string;
    externalId: string;
    acceptedProfileId?: string;
    acceptedGuestId?: string | null;
    inviterProfileId?: string;
    inviterGuestId?: string | null;
    referralCode: string;
  },
) {
  const acceptedProfileId = options.acceptedProfileId ?? 'profile-1';
  const inviterProfileId = options.inviterProfileId ?? 'inviter-profile-1';
  const inviterGuestId = options.inviterGuestId ?? 'guest-inviter';

  expect(prisma.guestGameEvent.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        profileId: acceptedProfileId,
        guestId: options.acceptedGuestId ?? null,
        eventType: 'GAME_REFERRAL_ACCEPTED',
        source: 'GUEST_PORTAL_REFERRAL',
        externalId: options.externalId,
        payload: expect.objectContaining({
          channel: options.channel,
          storeId: 'store-1',
          storePublicSlug: 'club-1337',
          clubId: 'leet:club-1337',
          referralCodeMasked: expect.stringContaining('...'),
          inviterProfileId,
          inviterGuestId,
          valid: true,
          selfReferral: false,
          eligibleForReward: true,
        }),
      }),
    }),
  );

  const referralCalls = prisma.guestGameEvent.create.mock.calls.filter(
    ([call]: [any]) => call?.data?.eventType === 'GAME_REFERRAL_ACCEPTED',
  );

  expect(JSON.stringify(referralCalls)).not.toContain(options.referralCode);
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
      lootBoxes: [
        {
          id: 'loot-1',
          name: 'Стартовый лутбокс',
          triggerKind: 'SESSION_START',
          rewardLabel: '50 бонусов',
          rewardType: 'BONUS',
          manualApprovalRequired: false,
          note: null,
          openedCount: 1,
          readyRewards: 0,
          waitingApprovalRewards: 1,
          redeemedRewards: 0,
          latestReward: {
            id: 'reward-2',
            walletState: 'WAITING_APPROVAL',
            rewardLabel: '50 бонусов',
            rewardCode: null,
            claimPayload: null,
            qualifiedAt: '2026-06-15T08:00:00.000Z',
            expiresAt: null,
          },
        },
      ],
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
          rewardStatus: {
            state: 'IN_PROGRESS',
            label: 'Награда впереди',
            hint: 'Закройте шаги квеста, чтобы получить бонус.',
            rewardLabel: null,
            rewardAmount: null,
            rewardWalletState: null,
            ledgerStatus: null,
            balanceAfter: null,
            occurredAt: null,
          },
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
          rewardStatus: {
            state: 'CONFIRMED',
            label: 'Бонус начислен',
            hint: 'Langame подтвердил начисление. Баланс после: 250.',
            rewardLabel: '100 бонусов',
            rewardAmount: 100,
            rewardWalletState: null,
            ledgerStatus: 'CONFIRMED',
            balanceAfter: 250,
            occurredAt: '2026-06-15T08:01:00.000Z',
          },
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
          levels: [
            {
              level: 1,
              xp: 0,
              freeReward: '10 бонусов',
              premiumReward: null,
              reached: true,
              current: false,
              next: false,
            },
            {
              level: 2,
              xp: 300,
              freeReward: '20 бонусов',
              premiumReward: null,
              reached: true,
              current: false,
              next: false,
            },
            {
              level: 3,
              xp: 600,
              freeReward: '30 бонусов',
              premiumReward: null,
              reached: true,
              current: true,
              next: false,
            },
            {
              level: 4,
              xp: 900,
              freeReward: '50 бонусов',
              premiumReward: null,
              reached: false,
              current: false,
              next: true,
            },
            {
              level: 5,
              xp: 1200,
              freeReward: '70 бонусов',
              premiumReward: null,
              reached: false,
              current: false,
              next: false,
            },
            {
              level: 6,
              xp: 1500,
              freeReward: '100 бонусов',
              premiumReward: null,
              reached: false,
              current: false,
              next: false,
            },
            {
              level: 7,
              xp: 1800,
              freeReward: '150 бонусов',
              premiumReward: null,
              reached: false,
              current: false,
              next: false,
            },
          ],
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

function mockGameSummarySession(
  service: GuestPortalService,
  portal: ReturnType<typeof portalPayloadFixture>,
) {
  const tokenPayload = {
    sub: 'profile-1',
    purpose: 'guest_portal',
    tenantId: 'tenant-1',
    storeId: portal.store.id,
    guestId: 'guest-1',
    profileId: portal.profile.id,
    phoneHash: 'phone-hash',
  };
  const verifyGuestToken = jest
    .spyOn(service as any, 'verifyGuestToken')
    .mockResolvedValue(tokenPayload);
  const buildPortalPayload = jest
    .spyOn(service as any, 'buildPortalPayload')
    .mockResolvedValue(portal);

  return { buildPortalPayload, tokenPayload, verifyGuestToken };
}

describe('GuestPortalService', () => {
  describe('getGameSummary', () => {
    it('returns compact game state from the existing guest session payload', async () => {
      const { prisma, service } = createService({
        GUEST_GAME_REFERRAL_SECRET: 'referral-secret',
        WEB_URL: 'https://leetplus.ru',
      });
      const portal = portalPayloadFixture();
      const { buildPortalPayload, tokenPayload, verifyGuestToken } =
        mockGameSummarySession(service, portal);
      prisma.guestGameEvent.count
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(2);
      prisma.guestGameEvent.findFirst.mockResolvedValueOnce({
        occurredAt: new Date('2026-06-15T09:30:00.000Z'),
      });

      const summary = await service.getGameSummary('Bearer guest-token');

      expect(verifyGuestToken).toHaveBeenCalledWith('Bearer guest-token');
      expect(buildPortalPayload).toHaveBeenCalledWith(tokenPayload);
      expect(summary).toMatchObject({
        tenant: portal.tenant,
        store: portal.store,
        profile: portal.profile,
        referral: {
          status: 'READY',
          code: expect.stringMatching(/^lp_ref_[A-Za-z0-9_-]{22}$/),
          channelHint: expect.stringContaining('raw phone'),
          stats: {
            acceptedCount: 3,
            eligibleCount: 2,
            latestAcceptedAt: '2026-06-15T09:30:00.000Z',
          },
        },
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
          recent: [
            expect.objectContaining({
              id: 'reward-1',
              walletState: 'READY',
              rewardCode: 'LP-123',
            }),
            expect.objectContaining({
              id: 'reward-2',
              walletState: 'WAITING_APPROVAL',
              claimPayload: null,
            }),
          ],
          latestBonus: portal.gamification.bonusHistory.items[0],
          bonusHistory: {
            summary: portal.gamification.bonusHistory.summary,
            items: portal.gamification.bonusHistory.items,
          },
        },
        lootBoxes: {
          total: 1,
          featured: [
            expect.objectContaining({
              id: 'loot-1',
              latestReward: expect.objectContaining({
                id: 'reward-2',
                walletState: 'WAITING_APPROVAL',
              }),
            }),
          ],
        },
        missions: {
          total: 2,
          featured: [
            expect.objectContaining({
              id: 'mission-2',
              progressPercent: 100,
              rewardStatus: expect.objectContaining({
                state: 'CONFIRMED',
                ledgerStatus: 'CONFIRMED',
                rewardAmount: 100,
                balanceAfter: 250,
              }),
            }),
            expect.objectContaining({
              id: 'mission-1',
              progressPercent: 50,
              progressUnit: 'час',
              manualApprovalRequired: false,
              rewardStatus: expect.objectContaining({
                state: 'IN_PROGRESS',
              }),
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
          history: [
            expect.objectContaining({
              id: 'mission-2',
              rewardStatus: expect.objectContaining({
                state: 'CONFIRMED',
              }),
            }),
            expect.objectContaining({
              id: 'mission-1',
              rewardStatus: expect.objectContaining({
                state: 'IN_PROGRESS',
              }),
            }),
          ],
        },
        battlePass: {
          active: expect.objectContaining({
            id: 'season-1',
            currentLevel: 3,
            nextLevel: 4,
            levels: [
              expect.objectContaining({ level: 2, reached: true }),
              expect.objectContaining({ level: 3, current: true }),
              expect.objectContaining({ level: 4, next: true }),
              expect.objectContaining({ level: 5, reached: false }),
              expect.objectContaining({ level: 6, reached: false }),
            ],
          }),
        },
        progress: {
          summary: expect.objectContaining({
            xp: 620,
            level: 3,
            xpToNextLevel: 280,
            missionsTotal: 2,
            missionsCompleted: 1,
            missionsAlmostDone: 0,
            rewardsReady: 1,
            rewardsWaitingApproval: 1,
            confirmedBonusAmount: 100,
            pendingBonusAmount: 0,
          }),
          timeline: expect.arrayContaining([
            expect.objectContaining({
              id: 'activity:timeline-1',
              kind: 'ACTIVITY',
              status: 'DONE',
              xpDelta: 80,
            }),
            expect.objectContaining({
              id: 'reward:reward-1',
              kind: 'REWARD',
              status: 'READY',
              amount: 100,
            }),
            expect.objectContaining({
              id: 'bonus:ledger-1',
              kind: 'BONUS_LEDGER',
              status: 'DONE',
              amount: 100,
              storeName: '1337',
            }),
          ]),
        },
        journey: {
          summary: {
            completed: 6,
            total: 6,
            readyPercent: 100,
            nextStepId: null,
            nextStepLabel: null,
          },
          steps: [
            expect.objectContaining({
              id: 'PROFILE',
              status: 'DONE',
              anchor: 'profile',
            }),
            expect.objectContaining({
              id: 'LANGAME',
              status: 'DONE',
              anchor: 'langame-match',
            }),
            expect.objectContaining({
              id: 'CHECK_IN',
              status: 'DONE',
              anchor: 'progress',
            }),
            expect.objectContaining({
              id: 'MISSION',
              status: 'DONE',
              anchor: 'missions',
            }),
            expect.objectContaining({
              id: 'REWARD',
              status: 'DONE',
              anchor: 'rewards',
            }),
            expect.objectContaining({
              id: 'BONUS',
              status: 'DONE',
              anchor: 'rewards',
            }),
          ],
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
      expect(summary.referral.link).toContain('https://leetplus.ru/play?');
      expect(summary.referral.link).toContain('clubId=demo%3Aclub-1337');
      expect(summary.referral.link).toContain(
        `ref=${encodeURIComponent(summary.referral.code)}`,
      );
      expect(summary.referral.shareText).toContain(summary.referral.link);
      expect(summary.referral.link).not.toContain(portal.profile.id);
      expect(summary.referral.link).not.toContain(portal.profile.contactMasked);
      expect(prisma.guestGameEvent.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          tenantId: tokenPayload.tenantId,
          eventType: 'GAME_REFERRAL_ACCEPTED',
          source: 'GUEST_PORTAL_REFERRAL',
          AND: [
            expect.objectContaining({
              payload: {
                path: ['inviterProfileId'],
                equals: portal.profile.id,
              },
            }),
          ],
        }),
      });
      expect(prisma.guestGameEvent.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          tenantId: tokenPayload.tenantId,
          eventType: 'GAME_REFERRAL_ACCEPTED',
          source: 'GUEST_PORTAL_REFERRAL',
          AND: expect.arrayContaining([
            expect.objectContaining({
              payload: {
                path: ['eligibleForReward'],
                equals: true,
              },
            }),
          ]),
        }),
      });
      expect(summary.rewards.recent).toHaveLength(2);
      expect(summary.rewards.recent[0]).not.toHaveProperty('status');
      expect(summary.rewards.bonusHistory.items).toHaveLength(1);
      expect(summary.rewards.bonusHistory.items[0]).not.toHaveProperty(
        'langameRequest',
      );
      expect(summary.rewards.bonusHistory.items[0]).not.toHaveProperty(
        'langameResponse',
      );
      expect(summary.battlePass.active?.levels).toHaveLength(5);
      expect(summary.battlePass.active?.levels[0].level).toBe(2);
      expect(summary.battlePass.active?.levels[4].level).toBe(6);
      expect(summary).not.toHaveProperty('guestSnapshot');
      expect(summary.activity).not.toHaveProperty('timeline');
      expect(summary.activity).not.toHaveProperty('xpHistory');
    });

    it('limits bonus ledger history in compact game summary', async () => {
      const { service } = createService();
      const portal = portalPayloadFixture();
      const baseItem = portal.gamification.bonusHistory.items[0];
      portal.gamification.bonusHistory = {
        summary: {
          ...portal.gamification.bonusHistory.summary,
          total: 6,
        },
        items: Array.from({ length: 6 }, (_, index) => ({
          ...baseItem,
          id: `ledger-${index + 1}`,
          occurredAt: `2026-06-15T08:0${index}:00.000Z`,
        })),
      };
      mockGameSummarySession(service, portal);

      const summary = await service.getGameSummary('Bearer guest-token');

      expect(summary.rewards.bonusHistory.summary.total).toBe(6);
      expect(summary.rewards.bonusHistory.items).toHaveLength(5);
      expect(summary.rewards.bonusHistory.items.map((item) => item.id)).toEqual(
        ['ledger-1', 'ledger-2', 'ledger-3', 'ledger-4', 'ledger-5'],
      );
    });

    it('limits mission board in compact game summary', async () => {
      const { service } = createService();
      const portal = portalPayloadFixture();
      const baseMission = portal.gamification.missions[0];
      portal.gamification.missions = Array.from({ length: 7 }, (_, index) => ({
        ...baseMission,
        id: `mission-${index + 1}`,
        name: `Mission ${index + 1}`,
        progressCurrent: 12 - index,
        progressPercent: 100 - index * 8,
        questSteps: baseMission.questSteps.map((step) => ({
          ...step,
          id: `${step.id}-${index + 1}`,
        })),
      }));
      mockGameSummarySession(service, portal);

      const summary = await service.getGameSummary('Bearer guest-token');

      expect(summary.missions.total).toBe(7);
      expect(summary.missions.featured).toHaveLength(6);
      expect(summary.missions.featured.map((mission) => mission.id)).toEqual([
        'mission-1',
        'mission-2',
        'mission-3',
        'mission-4',
        'mission-5',
        'mission-6',
      ]);
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
      expect(directory.verification).toMatchObject({
        recommendedChannel: 'TELEGRAM_BOT',
        phoneRequired: true,
      });
      expect(
        directory.verification.options.map((option) => option.channel),
      ).toEqual([
        'TELEGRAM_BOT',
        'USER_CALL',
        'SMS_CODE',
        'INCOMING_CALL_LAST4',
      ]);
      expect(directory.verification.options[0]).toMatchObject({
        rank: 1,
        role: 'PRIMARY',
        status: 'PLANNED',
      });
      expect(directory.verification.options[2]).toMatchObject({
        rank: 3,
        role: 'RESERVE',
        status: 'READY',
      });
      expect(directory.verification.options[3]).toMatchObject({
        rank: 4,
        role: 'RESERVE',
        status: 'READY',
        requiredEnv: [],
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

  describe('telegram auth', () => {
    it('creates a pending Telegram auth challenge for public play registration', async () => {
      const { prisma, service } = createService({
        APP_ENCRYPTION_KEY: 'test-secret',
        GUEST_GAME_TELEGRAM_BOT_USERNAME: 'leetplus_bot',
        GUEST_GAME_TELEGRAM_LINK_SECRET: 'telegram-secret',
      });
      jest
        .spyOn(service as any, 'generateTelegramLinkCode')
        .mockReturnValue('LP-ABCD-EF1234');

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
      prisma.guestGameProfile.create.mockResolvedValue({
        id: 'pending-profile-1',
      });
      prisma.guestGameTelegramLinkChallenge.create.mockResolvedValue({
        id: 'telegram-auth-1',
      });

      const result = await service.startTelegramAuth('leet', 'club-1337', {
        gameConsentAccepted: true,
      });

      expect(prisma.guestGameProfile.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: 'tenant-1',
            displayName: 'Гость клуба',
            status: 'PENDING_TELEGRAM_AUTH',
          }),
        }),
      );
      expect(prisma.guestGameTelegramLinkChallenge.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: 'tenant-1',
            storeId: 'store-1',
            profileId: 'pending-profile-1',
            status: 'AUTH_PENDING',
          }),
        }),
      );
      expect(result).toMatchObject({
        challengeId: 'telegram-auth-1',
        botUsername: 'leetplus_bot',
        status: 'READY',
      });
      expect(result.botDeepLink).toContain('start=lp_ABCDEF1234');
    });

    it('accepts Telegram /start for auth and waits for contact share', async () => {
      const { prisma, service } = createService({
        APP_ENCRYPTION_KEY: 'test-secret',
        GUEST_GAME_TELEGRAM_LINK_SECRET: 'telegram-secret',
      });
      const codeHash = createHmac('sha256', 'test-secret')
        .update('telegram-link:ABCDEF1234')
        .digest('hex');

      prisma.guestGameTelegramLinkChallenge.findFirst.mockResolvedValue({
        id: 'telegram-auth-1',
        tenantId: 'tenant-1',
        storeId: 'store-1',
        profileId: 'pending-profile-1',
        codeHash,
        status: 'AUTH_PENDING',
        expiresAt: new Date(Date.now() + 60_000),
        profile: {
          id: 'pending-profile-1',
          status: 'PENDING_TELEGRAM_AUTH',
        },
      });

      const result = await service.handleTelegramWebhook('telegram-secret', {
        message: {
          text: `/start lp_ABCDEF1234`,
          chat: { id: 123456 },
          from: { id: 123456, username: 'player_one' },
        },
      });

      expect(prisma.guestGameProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'pending-profile-1' },
          data: expect.objectContaining({
            telegramIdentity: 'chat:123456',
            status: 'PENDING_TELEGRAM_AUTH',
          }),
        }),
      );
      expect(prisma.guestGameTelegramLinkChallenge.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'telegram-auth-1' },
          data: expect.objectContaining({
            status: 'AUTH_AWAITING_CONTACT',
            telegramUsername: '@player_one',
          }),
        }),
      );
      expect(result).toMatchObject({
        status: 'AWAITING_CONTACT',
        action: 'TELEGRAM_AUTH_START',
        profileId: 'pending-profile-1',
        reply: {
          provider: 'TELEGRAM',
          method: 'sendMessage',
          chatIdMasked: 'ch...56',
          replyMarkup: {
            keyboard: [
              [
                {
                  text: 'Поделиться телефоном',
                  request_contact: true,
                },
              ],
            ],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        },
      });
    });

    it('sends Telegram auth reply when webhook sender is enabled', async () => {
      const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({ ok: true, result: { message_id: 777 } }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
      );
      const { prisma, service } = createService({
        APP_ENCRYPTION_KEY: 'test-secret',
        GUEST_GAME_TELEGRAM_LINK_SECRET: 'telegram-secret',
        GUEST_GAME_TELEGRAM_WEBHOOK_REPLY_ENABLED: 'true',
        GUEST_GAME_TELEGRAM_BOT_TOKEN: 'telegram-token',
      });
      const codeHash = createHmac('sha256', 'test-secret')
        .update('telegram-link:ABCDEF1234')
        .digest('hex');

      prisma.guestGameTelegramLinkChallenge.findFirst.mockResolvedValue({
        id: 'telegram-auth-1',
        tenantId: 'tenant-1',
        storeId: 'store-1',
        profileId: 'pending-profile-1',
        codeHash,
        status: 'AUTH_PENDING',
        expiresAt: new Date(Date.now() + 60_000),
        profile: {
          id: 'pending-profile-1',
          status: 'PENDING_TELEGRAM_AUTH',
        },
      });

      try {
        const result = await service.handleTelegramWebhook('telegram-secret', {
          message: {
            text: `/start lp_ABCDEF1234`,
            chat: { id: 123456 },
            from: { id: 123456, username: 'player_one' },
          },
        });

        expect(result.replyDispatch).toMatchObject({
          provider: 'TELEGRAM',
          status: 'SENT',
          chatIdMasked: 'ch...56',
        });
        expect(fetchMock).toHaveBeenCalledWith(
          'https://api.telegram.org/bottelegram-token/sendMessage',
          expect.objectContaining({
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: expect.any(String),
          }),
        );

        const requestBody = JSON.parse(
          fetchMock.mock.calls[0][1]?.body as string,
        );

        expect(requestBody).toMatchObject({
          chat_id: '123456',
          disable_web_page_preview: true,
          reply_markup: {
            keyboard: [
              [
                {
                  text: 'Поделиться телефоном',
                  request_contact: true,
                },
              ],
            ],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        });
      } finally {
        fetchMock.mockRestore();
      }
    });

    it('confirms Telegram contact and issues a guest session token', async () => {
      const { jwtService, prisma, service } = createService({
        APP_ENCRYPTION_KEY: 'test-secret',
        GUEST_GAME_TELEGRAM_LINK_SECRET: 'telegram-secret',
      });
      const phoneHash = createHmac('sha256', 'test-secret')
        .update('79991112233')
        .digest('hex');
      jest.spyOn(service as any, 'buildPortalPayload').mockResolvedValue({
        profile: { id: 'profile-1' },
      });

      prisma.guestGameTelegramLinkChallenge.findFirst
        .mockResolvedValueOnce({
          id: 'telegram-auth-1',
          tenantId: 'tenant-1',
          storeId: 'store-1',
          profileId: 'pending-profile-1',
          status: 'AUTH_AWAITING_CONTACT',
          expiresAt: new Date(Date.now() + 60_000),
          profile: {
            id: 'pending-profile-1',
            status: 'PENDING_TELEGRAM_AUTH',
          },
        })
        .mockResolvedValueOnce({
          id: 'telegram-auth-1',
          tenantId: 'tenant-1',
          storeId: 'store-1',
          profileId: 'profile-1',
          guestId: null,
          phoneHash,
          status: 'AUTH_VERIFIED',
          expiresAt: new Date(Date.now() + 60_000),
          profile: {
            id: 'profile-1',
            guestId: null,
            phoneHash,
            telegramIdentity: 'chat:123456',
            contactMasked: '***2233',
          },
        });
      prisma.guestGameProfile.update.mockResolvedValue({
        id: 'profile-1',
        guestId: null,
      });
      jwtService.signAsync.mockResolvedValue('guest-token');
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

      const webhookResult = await service.handleTelegramWebhook(
        'telegram-secret',
        {
          message: {
            chat: { id: 123456 },
            from: { id: 123456 },
            contact: {
              phone_number: '+7 999 111-22-33',
              user_id: 123456,
            },
          },
        },
      );
      const status = await service.getTelegramAuthStatus('leet', 'club-1337', {
        challengeId: 'telegram-auth-1',
      });

      expect(prisma.guestGameProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'pending-profile-1' },
          data: expect.objectContaining({
            telegramIdentity: 'chat:123456',
            phoneHash,
            contactMasked: '***2233',
            phoneConsentStatus: 'GRANTED',
            phoneConsentSource: 'telegram_auth_contact_share',
            phoneConsentAt: expect.any(Date),
            unsubscribedAt: null,
            status: 'ACTIVE',
          }),
        }),
      );
      expect(prisma.guestGameTelegramLinkChallenge.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'telegram-auth-1' },
          data: expect.objectContaining({
            status: 'AUTH_VERIFIED',
            phoneHash,
            profileId: 'profile-1',
          }),
        }),
      );
      expect(prisma.guestGameEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: 'tenant-1',
            profileId: 'profile-1',
            eventType: 'GAME_CONSENT_GRANTED',
            source: 'GUEST_PORTAL',
            externalId: 'telegram-auth:telegram-auth-1:game-consent',
            payload: expect.objectContaining({
              phoneMasked: '***2233',
              telegramIdentityMasked: 'ch...56',
            }),
          }),
        }),
      );
      expect(webhookResult).toMatchObject({
        status: 'CONFIRMED',
        action: 'TELEGRAM_AUTH_CONTACT',
        profileId: 'profile-1',
        reply: {
          provider: 'TELEGRAM',
          method: 'sendMessage',
          chatIdMasked: 'ch...56',
          replyMarkup: {
            remove_keyboard: true,
          },
        },
      });
      expect(jwtService.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: 'telegram-auth:telegram-auth-1',
          guestId: null,
          profileId: 'profile-1',
          phoneHash,
        }),
        expect.any(Object),
      );
      expect(status).toMatchObject({
        status: 'CONFIRMED',
        token: 'guest-token',
        profileId: 'profile-1',
      });
    });

    it('records referral attribution when Telegram status issues the game session', async () => {
      const { jwtService, prisma, service } = createService({
        APP_ENCRYPTION_KEY: 'test-secret',
        GUEST_GAME_REFERRAL_SECRET: 'referral-secret',
      });
      const referralCode = referralCodeFor1337();
      mockLeetTenant(prisma);
      jest.spyOn(service as any, 'buildPortalPayload').mockResolvedValue({
        profile: { id: 'profile-1' },
      });

      prisma.guestGameTelegramLinkChallenge.findFirst.mockResolvedValue({
        id: 'telegram-auth-1',
        tenantId: 'tenant-1',
        storeId: 'store-1',
        profileId: 'profile-1',
        guestId: null,
        phoneHash: 'phone-hash-1',
        status: 'AUTH_VERIFIED',
        expiresAt: new Date(Date.now() + 60_000),
        profile: {
          id: 'profile-1',
          guestId: null,
          phoneHash: 'phone-hash-1',
          telegramIdentity: 'chat:123456',
          contactMasked: '***2233',
        },
      });
      prisma.guestGameProfile.findMany.mockResolvedValue([
        { id: 'inviter-profile-1', guestId: 'guest-inviter' },
      ]);
      jwtService.signAsync.mockResolvedValue('guest-token');

      const status = await service.getTelegramAuthStatus('leet', 'club-1337', {
        challengeId: 'telegram-auth-1',
        referralCode,
      });

      expect(status).toMatchObject({
        status: 'CONFIRMED',
        token: 'guest-token',
        profileId: 'profile-1',
      });
      expect(prisma.guestGameTelegramLinkChallenge.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'telegram-auth-1' },
          data: expect.objectContaining({
            status: 'AUTH_SESSION_ISSUED',
            profileId: 'profile-1',
          }),
        }),
      );
      expectReferralEventCreated(prisma, {
        channel: 'TELEGRAM_BOT',
        externalId: 'telegram-auth:telegram-auth-1:referral',
        referralCode,
      });
    });
  });

  describe('user call auth', () => {
    it('creates a pending call challenge for the phone fallback', async () => {
      const { prisma, service } = createService({
        APP_ENCRYPTION_KEY: 'test-secret',
        GUEST_PORTAL_USER_CALL_ENABLED: 'true',
        GUEST_PORTAL_USER_CALL_PHONE_NUMBER: '+7 343 000-00-00',
        GUEST_PORTAL_USER_CALL_SECRET: 'call-secret',
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
            address: 'Lenina, 1',
          },
        ],
      });

      const result = await service.startUserCallAuth('leet', 'club-1337', {
        phone: '+7 999 999-99-99',
        gameConsentAccepted: true,
      });

      expect(prisma.guestPortalOtpChallenge.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deliveryChannel: 'USER_CALL',
            status: 'PENDING',
          }),
          data: { status: 'EXPIRED' },
        }),
      );
      expect(prisma.guestPortalOtpChallenge.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: 'tenant-1',
            storeId: 'store-1',
            phoneMasked: '***9999',
            status: 'PENDING',
            deliveryChannel: 'USER_CALL',
            gameConsentVersion: 'guest-game-v1-2026-06-15',
          }),
        }),
      );
      expect(result).toMatchObject({
        phoneMasked: '***9999',
        callNumber: '+7 343 000-00-00',
        callHref: 'tel:+73430000000',
        status: 'PENDING',
      });
    });

    it('confirms a matching provider caller id without exposing raw phone', async () => {
      const { prisma, service } = createService({
        APP_ENCRYPTION_KEY: 'test-secret',
        GUEST_PORTAL_USER_CALL_SECRET: 'call-secret',
      });
      const phoneHash = createHmac('sha256', 'test-secret')
        .update('79999999999')
        .digest('hex');

      prisma.guestPortalOtpChallenge.findFirst.mockResolvedValue({
        id: 'call-auth-1',
        phoneHash,
        phoneMasked: '***9999',
        attempts: 0,
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 60_000),
      });

      const result = await service.confirmUserCallAuth('call-secret', {
        challengeId: 'call-auth-1',
        callerPhone: '+7 999 999-99-99',
      });

      expect(prisma.guestPortalOtpChallenge.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'call-auth-1' },
          data: expect.objectContaining({
            status: 'CALL_CONFIRMED',
            deliveredAt: expect.any(Date),
          }),
        }),
      );
      expect(result).toMatchObject({
        status: 'CONFIRMED',
        challengeId: 'call-auth-1',
        phoneMasked: '***9999',
      });
      expect(JSON.stringify(result)).not.toContain('79999999999');
    });

    it('issues a guest token after the confirmed call status is polled', async () => {
      const { jwtService, prisma, service } = createService({
        APP_ENCRYPTION_KEY: 'test-secret',
      });
      jest.spyOn(service as any, 'buildPortalPayload').mockResolvedValue({
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
            address: 'Lenina, 1',
          },
        ],
      });
      prisma.guestPortalOtpChallenge.findFirst.mockResolvedValue({
        id: 'call-auth-1',
        tenantId: 'tenant-1',
        storeId: 'store-1',
        guestId: null,
        profileId: null,
        phoneHash: 'phone-hash-1',
        phoneMasked: '***9999',
        status: 'CALL_CONFIRMED',
        expiresAt: new Date(Date.now() + 60_000),
        gameConsentAcceptedAt: new Date('2026-06-15T08:00:00.000Z'),
        gameConsentVersion: 'guest-game-v1-2026-06-15',
      });
      prisma.guestGameProfile.create.mockResolvedValue({
        id: 'profile-1',
        guestId: null,
      });
      jwtService.signAsync.mockResolvedValue('guest-token');

      const status = await service.getUserCallAuthStatus('leet', 'club-1337', {
        challengeId: 'call-auth-1',
      });

      expect(prisma.guestGameProfile.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: 'tenant-1',
            contactMasked: '***9999',
            phoneHash: 'phone-hash-1',
            status: 'ACTIVE',
          }),
        }),
      );
      expect(prisma.guestPortalOtpChallenge.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'call-auth-1' },
          data: expect.objectContaining({
            status: 'CALL_SESSION_ISSUED',
          }),
        }),
      );
      expect(jwtService.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: 'user-call:call-auth-1',
          guestId: null,
          profileId: 'profile-1',
          phoneHash: 'phone-hash-1',
        }),
        expect.any(Object),
      );
      expect(status).toMatchObject({
        status: 'CONFIRMED',
        token: 'guest-token',
        profileId: 'profile-1',
        phoneMasked: '***9999',
      });
    });

    it('records referral attribution when the user-call fallback issues the game session', async () => {
      const { jwtService, prisma, service } = createService({
        APP_ENCRYPTION_KEY: 'test-secret',
        GUEST_GAME_REFERRAL_SECRET: 'referral-secret',
      });
      const referralCode = referralCodeFor1337();
      mockLeetTenant(prisma);
      jest.spyOn(service as any, 'buildPortalPayload').mockResolvedValue({
        profile: { id: 'profile-1' },
      });

      prisma.guestPortalOtpChallenge.findFirst.mockResolvedValue({
        id: 'call-auth-1',
        tenantId: 'tenant-1',
        storeId: 'store-1',
        guestId: null,
        profileId: null,
        phoneHash: 'phone-hash-1',
        phoneMasked: '***9999',
        status: 'CALL_CONFIRMED',
        expiresAt: new Date(Date.now() + 60_000),
        gameConsentAcceptedAt: new Date('2026-06-15T08:00:00.000Z'),
        gameConsentVersion: 'guest-game-v1-2026-06-15',
      });
      prisma.guestGameProfile.create.mockResolvedValue({
        id: 'profile-1',
        guestId: null,
      });
      prisma.guestGameProfile.findMany.mockResolvedValue([
        { id: 'inviter-profile-1', guestId: 'guest-inviter' },
      ]);
      jwtService.signAsync.mockResolvedValue('guest-token');

      const status = await service.getUserCallAuthStatus('leet', 'club-1337', {
        challengeId: 'call-auth-1',
        referralCode,
      });

      expect(status).toMatchObject({
        status: 'CONFIRMED',
        token: 'guest-token',
        profileId: 'profile-1',
      });
      expectReferralEventCreated(prisma, {
        channel: 'USER_CALL',
        externalId: 'user-call:call-auth-1:referral',
        referralCode,
      });
    });
  });

  describe('incoming call last4 auth', () => {
    it('creates a pending incoming-call challenge in dev mode without exposing raw phone', async () => {
      const { prisma, service } = createService({
        APP_ENCRYPTION_KEY: 'test-secret',
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
            address: 'Lenina, 1',
          },
        ],
      });

      const result = await service.startIncomingCallLast4Auth(
        'leet',
        'club-1337',
        {
          phone: '+7 999 999-99-99',
          gameConsentAccepted: true,
        },
      );

      expect(prisma.guestPortalOtpChallenge.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deliveryChannel: 'INCOMING_CALL_LAST4',
            status: 'PENDING',
          }),
          data: { status: 'EXPIRED' },
        }),
      );
      expect(prisma.guestPortalOtpChallenge.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: 'tenant-1',
            storeId: 'store-1',
            phoneMasked: '***9999',
            status: 'PENDING',
            deliveryChannel: 'INCOMING_CALL_LAST4',
            gameConsentVersion: 'guest-game-v1-2026-06-15',
          }),
        }),
      );
      expect(result).toMatchObject({
        phoneMasked: '***9999',
        status: 'PENDING',
        delivery: {
          status: 'DEV_CODE',
          devCode: expect.stringMatching(/^\d{4}$/),
        },
      });
      expect(JSON.stringify(result)).not.toContain('79999999999');
    });

    it('returns BLOCKED for incoming-call last4 when communications are unsubscribed', async () => {
      const { prisma, service } = createService({
        APP_ENCRYPTION_KEY: 'test-secret',
        NODE_ENV: 'production',
        GUEST_PORTAL_INCOMING_CALL_LAST4_ENABLED: 'true',
        GUEST_PORTAL_INCOMING_CALL_LAST4_ENDPOINT: 'https://provider.test/call',
        GUEST_PORTAL_INCOMING_CALL_LAST4_TOKEN: 'provider-token',
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
            address: 'Lenina, 1',
          },
        ],
      });
      prisma.guest.findFirst.mockResolvedValue({
        id: 'guest-1',
        phoneConsentStatus: 'UNSUBSCRIBED',
        unsubscribedAt: new Date('2026-06-15T08:00:00.000Z'),
      });

      const result = await service.startIncomingCallLast4Auth(
        'leet',
        'club-1337',
        {
          phone: '+7 999 999-99-99',
          gameConsentAccepted: true,
        },
      );

      expect(prisma.guestPortalOtpChallenge.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            guestId: 'guest-1',
            phoneMasked: '***9999',
            status: 'DELIVERY_BLOCKED',
            deliveryChannel: 'INCOMING_CALL_LAST4',
            deliveredAt: null,
          }),
        }),
      );
      expect(result).toMatchObject({
        phoneMasked: '***9999',
        status: 'BLOCKED',
        delivery: {
          status: 'BLOCKED',
          message: expect.stringContaining('заблокирован'),
        },
      });
      expect(result.status).not.toBe('NOT_CONFIGURED');
      expect(JSON.stringify(result)).not.toContain('79999999999');
      expect(JSON.stringify(result)).not.toContain('provider-token');
    });

    it('verifies the last 4 digits and issues a guest token for a separate game profile', async () => {
      const { jwtService, prisma, service } = createService({
        APP_ENCRYPTION_KEY: 'test-secret',
      });
      const challengeId = 'incoming-call-1';
      const code = '4321';
      const codeHash = (service as any).hashOtpCode(challengeId, code);
      jest.spyOn(service as any, 'buildPortalPayload').mockResolvedValue({
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
            address: 'Lenina, 1',
          },
        ],
      });
      prisma.guestPortalOtpChallenge.findFirst.mockResolvedValue({
        id: challengeId,
        tenantId: 'tenant-1',
        storeId: 'store-1',
        guestId: null,
        profileId: null,
        phoneHash: 'phone-hash-1',
        phoneMasked: '***9999',
        codeHash,
        attempts: 0,
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 60_000),
        gameConsentAcceptedAt: new Date('2026-06-15T08:00:00.000Z'),
        gameConsentVersion: 'guest-game-v1-2026-06-15',
      });
      prisma.guestGameProfile.create.mockResolvedValue({
        id: 'profile-1',
        guestId: null,
      });
      jwtService.signAsync.mockResolvedValue('guest-token');

      const result = await service.verifyIncomingCallLast4Auth(
        'leet',
        'club-1337',
        {
          challengeId,
          code,
        },
      );

      expect(prisma.guestPortalOtpChallenge.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: challengeId,
            deliveryChannel: 'INCOMING_CALL_LAST4',
          }),
        }),
      );
      expect(prisma.guestGameProfile.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: 'tenant-1',
            contactMasked: '***9999',
            phoneHash: 'phone-hash-1',
            phoneConsentStatus: 'GRANTED',
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
          sub: 'incoming-call-last4:incoming-call-1',
          guestId: null,
          profileId: 'profile-1',
          phoneHash: 'phone-hash-1',
        }),
        expect.any(Object),
      );
      expect(result).toMatchObject({
        token: 'guest-token',
        match: {
          status: 'WAITING_FOR_SYNC',
          profileId: 'profile-1',
        },
      });
    });

    it('records referral attribution when incoming-call last4 verifies the game session', async () => {
      const { jwtService, prisma, service } = createService({
        APP_ENCRYPTION_KEY: 'test-secret',
        GUEST_GAME_REFERRAL_SECRET: 'referral-secret',
      });
      const challengeId = 'incoming-call-1';
      const code = '4321';
      const codeHash = (service as any).hashOtpCode(challengeId, code);
      const referralCode = referralCodeFor1337();
      mockLeetTenant(prisma);
      jest.spyOn(service as any, 'buildPortalPayload').mockResolvedValue({
        profile: { id: 'profile-1' },
      });

      prisma.guestPortalOtpChallenge.findFirst.mockResolvedValue({
        id: challengeId,
        tenantId: 'tenant-1',
        storeId: 'store-1',
        guestId: null,
        profileId: null,
        phoneHash: 'phone-hash-1',
        phoneMasked: '***9999',
        codeHash,
        attempts: 0,
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 60_000),
        gameConsentAcceptedAt: new Date('2026-06-15T08:00:00.000Z'),
        gameConsentVersion: 'guest-game-v1-2026-06-15',
      });
      prisma.guestGameProfile.create.mockResolvedValue({
        id: 'profile-1',
        guestId: null,
      });
      prisma.guestGameProfile.findMany.mockResolvedValue([
        { id: 'inviter-profile-1', guestId: 'guest-inviter' },
      ]);
      jwtService.signAsync.mockResolvedValue('guest-token');

      const result = await service.verifyIncomingCallLast4Auth(
        'leet',
        'club-1337',
        {
          challengeId,
          code,
          referralCode,
        },
      );

      expect(result).toMatchObject({
        token: 'guest-token',
        match: {
          status: 'WAITING_FOR_SYNC',
          profileId: 'profile-1',
        },
      });
      expectReferralEventCreated(prisma, {
        channel: 'INCOMING_CALL_LAST4',
        externalId: 'incoming-call-last4:incoming-call-1:referral',
        referralCode,
      });
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
        GUEST_GAME_REFERRAL_SECRET: 'referral-secret',
      });
      const referralSecret = (service as any).referralSecret() as string;
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
      const referralCode = buildTestReferralCode(
        'leet',
        'store-1',
        'club-1337',
        'inviter-profile-1',
        referralSecret,
      );

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
      prisma.guestGameProfile.findMany.mockResolvedValue([
        { id: 'inviter-profile-1', guestId: 'inviter-guest-1' },
        { id: 'profile-1', guestId: null },
      ]);
      jwtService.signAsync.mockResolvedValue('guest-token');

      const result = await service.verifyOtp('leet', 'club-1337', {
        challengeId,
        code,
        referralCode,
      });

      expect(prisma.guestGameProfile.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: 'tenant-1',
            displayName: 'Гость клуба',
            contactMasked: '+7 *** ***-99-99',
            phoneHash: 'phone-hash-1',
            phoneConsentStatus: 'GRANTED',
            phoneConsentSource: 'guest_portal_game_consent',
            phoneConsentAt: consentAcceptedAt,
            unsubscribedAt: null,
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
      expect(prisma.guestGameEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: 'tenant-1',
            profileId: 'profile-1',
            guestId: null,
            eventType: 'GAME_REFERRAL_ACCEPTED',
            source: 'GUEST_PORTAL_REFERRAL',
            externalId: `otp:${challengeId}:referral`,
            payload: expect.objectContaining({
              channel: 'OTP',
              storeId: 'store-1',
              clubId: 'leet:club-1337',
              referralCodeMasked: expect.stringContaining('...'),
              inviterProfileId: 'inviter-profile-1',
              inviterGuestId: 'inviter-guest-1',
              valid: true,
              selfReferral: false,
              eligibleForReward: true,
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

  describe('updateCommunicationPreferences', () => {
    it('stores communication consent on a profile-only game participant', async () => {
      const { jwtService, prisma, service } = createService();
      const portalPayload = {
        communications: {
          phone: { consentStatus: 'GRANTED' },
        },
      };
      jest
        .spyOn(service as any, 'buildPortalPayload')
        .mockResolvedValue(portalPayload);

      jwtService.verifyAsync.mockResolvedValue({
        sub: 'telegram-auth:1',
        purpose: 'guest_portal',
        tenantId: 'tenant-1',
        storeId: 'store-1',
        guestId: null,
        profileId: 'profile-1',
        phoneHash: 'phone-hash-1',
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
      prisma.guestGameProfile.findFirst.mockResolvedValue({
        id: 'profile-1',
        tenantId: 'tenant-1',
        guestId: null,
        leadId: null,
        phoneHash: 'phone-hash-1',
        phoneConsentStatus: 'UNKNOWN',
        phoneConsentSource: null,
        phoneConsentAt: null,
        unsubscribedAt: null,
      });

      const result = await service.updateCommunicationPreferences(
        'Bearer guest-token',
        { action: 'GRANT' },
      );

      expect(prisma.guestGameProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'profile-1' },
          data: expect.objectContaining({
            phoneConsentStatus: 'GRANTED',
            phoneConsentSource: 'guest_portal',
            phoneConsentAt: expect.any(Date),
            unsubscribedAt: null,
          }),
        }),
      );
      expect(prisma.guestGameEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: 'tenant-1',
            profileId: 'profile-1',
            guestId: null,
            eventType: 'GAME_COMMUNICATION_CONSENT_UPDATED',
            source: 'GUEST_PORTAL',
            payload: expect.objectContaining({
              action: 'GRANT',
              consentStatus: 'GRANTED',
              consentSource: 'guest_portal',
            }),
          }),
        }),
      );
      expect(result.portal).toBe(portalPayload);
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
      prisma.guestGameReward.updateMany.mockResolvedValue({ count: 2 });
      prisma.guestGameEvent.updateMany.mockResolvedValue({ count: 3 });
      prisma.guestGameDelivery.updateMany.mockResolvedValue({ count: 1 });
      prisma.guestBonusLedgerEntry.updateMany.mockResolvedValue({ count: 4 });

      const result = await service.matchLangameGuest('Bearer guest-token', {
        phone,
      });

      expect(result.status).toBe('MATCHED_LOCAL');
      expect(result.linkStatus).toBe('LINKED');
      expect(result.linkedGuestId).toBe('guest-1');
      expect(result.linkedProfileId).toBe('profile-1');
      expect(result.backfilled).toEqual({
        rewards: 2,
        events: 3,
        deliveries: 1,
        bonusLedgerEntries: 4,
      });
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
      expect(prisma.guestGameDelivery.updateMany).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-1',
          profileId: 'profile-1',
          guestId: null,
        },
        data: { guestId: 'guest-1' },
      });
      expect(prisma.guestBonusLedgerEntry.updateMany).toHaveBeenCalledWith({
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
                backfilled: {
                  rewards: 2,
                  events: 3,
                  deliveries: 1,
                  bonusLedgerEntries: 4,
                },
              }),
            }),
          ],
          skipDuplicates: true,
        }),
      );
    });

    it('backfills profile-only game records when the profile is already linked locally', async () => {
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
        sub: 'telegram-auth:1',
        purpose: 'guest_portal',
        tenantId: 'tenant-1',
        storeId: 'store-1',
        guestId: 'guest-1',
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
        sources: [],
      });
      const guest = {
        id: 'guest-1',
        tenantId: 'tenant-1',
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: '1337.langame.ru',
        externalGuestId: '42',
        phoneHash,
        phoneMasked: '***2233',
        emailMasked: null,
        fullNameMasked: 'I. P.',
        isDisabled: false,
      };
      const profile = {
        id: 'profile-1',
        tenantId: 'tenant-1',
        guestId: 'guest-1',
        phoneHash,
        contactMasked: '***2233',
        displayName: 'I. P.',
        status: 'ACTIVE',
      };
      prisma.guest.findFirst
        .mockResolvedValueOnce(guest)
        .mockResolvedValueOnce(guest);
      prisma.guestGameProfile.findFirst
        .mockResolvedValueOnce(profile)
        .mockResolvedValueOnce(profile)
        .mockResolvedValueOnce({ id: 'profile-1' });
      prisma.guestGameReward.updateMany.mockResolvedValue({ count: 1 });
      prisma.guestGameEvent.updateMany.mockResolvedValue({ count: 2 });
      prisma.guestGameDelivery.updateMany.mockResolvedValue({ count: 3 });
      prisma.guestBonusLedgerEntry.updateMany.mockResolvedValue({ count: 4 });

      const result = await service.matchLangameGuest('Bearer guest-token', {
        phone,
      });

      expect(result).toMatchObject({
        status: 'MATCHED_LOCAL',
        linkStatus: 'ALREADY_LINKED',
        linkedGuestId: 'guest-1',
        linkedProfileId: 'profile-1',
        backfilled: {
          rewards: 1,
          events: 2,
          deliveries: 3,
          bonusLedgerEntries: 4,
        },
        portal: portalPayload,
      });
      expect(prisma.guestGameReward.updateMany).toHaveBeenCalledWith({
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
              payload: expect.objectContaining({
                source: 'guest_portal_langame_match',
                backfilled: {
                  rewards: 1,
                  events: 2,
                  deliveries: 3,
                  bonusLedgerEntries: 4,
                },
              }),
            }),
          ],
          skipDuplicates: true,
        }),
      );
    });
  });
});

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
    $queryRaw: jest.fn(),
    tenant: {
      findFirst: jest.fn(),
    },
    guest: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    guestAudienceMember: {
      findMany: jest.fn(),
    },
    guestCrmLead: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    guestCrmEvent: {
      findMany: jest.fn(),
    },
    guestGroup: {
      findMany: jest.fn(),
    },
    integrationCredential: {
      findMany: jest.fn(),
    },
    integrationSource: {
      findMany: jest.fn(),
    },
    store: {
      findMany: jest.fn(),
    },
    guestPortalOtpChallenge: {
      findFirst: jest.fn(),
      count: jest.fn(),
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
      count: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    guestGameVisualDraft: {
      findFirst: jest.fn(),
    },
    guestGameDelivery: {
      updateMany: jest.fn(),
    },
    guestBonusLedgerEntry: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    guestBalanceSnapshot: {
      findFirst: jest.fn(),
      upsert: jest.fn(),
    },
    guestBonusBalanceSnapshot: {
      findFirst: jest.fn(),
      upsert: jest.fn(),
    },
    guestBonusBalanceCurrent: {
      findFirst: jest.fn(),
      upsert: jest.fn(),
    },
    guestGameEvent: {
      aggregate: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    guestSession: {
      aggregate: jest.fn(),
      findMany: jest.fn(),
    },
    guestLog: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    guestTransaction: {
      aggregate: jest.fn(),
      findMany: jest.fn(),
    },
    guestGameMission: {
      findMany: jest.fn(),
    },
    guestGameLootBox: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    guestGameSeason: {
      findMany: jest.fn(),
    },
    guestGamePromoCard: {
      findMany: jest.fn(),
    },
    staffMember: {
      findMany: jest.fn(),
    },
    langameStaffUser: {
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
    getGuestBalancesForPortal: jest.fn(),
  };
  const guestGamificationService = {
    checkIn: jest.fn(),
    createEvent: jest.fn(),
    dryRun: jest.fn(),
    processEvent: jest.fn(),
    processLiveSessionStart: jest.fn(),
  };
  const secretEncryptionService = {
    encrypt: jest.fn((value: string) => `encrypted:${value}`),
    decrypt: jest.fn(),
  };
  const service = new GuestPortalService(
    prisma,
    configService,
    jwtService as any,
    langameSettingsService as any,
    guestGamificationService as any,
    secretEncryptionService as any,
  );

  prisma.tenant.findFirst.mockResolvedValue(null);
  prisma.guest.findFirst.mockResolvedValue(null);
  prisma.guest.findMany.mockResolvedValue([]);
  prisma.guestAudienceMember.findMany.mockResolvedValue([]);
  prisma.guestCrmLead.findFirst.mockResolvedValue(null);
  prisma.guestCrmLead.update.mockResolvedValue({});
  prisma.guestCrmEvent.findMany.mockResolvedValue([]);
  prisma.guestGroup.findMany.mockResolvedValue([]);
  prisma.integrationCredential.findMany.mockResolvedValue([
    {
      id: 'langame-credential-1',
      tenantId: 'tenant-1',
      apiKeyEncrypted: 'encrypted-api-key',
    },
    {
      id: 'langame-credential-2',
      tenantId: 'tenant-2',
      apiKeyEncrypted: 'encrypted-api-key',
    },
  ]);
  prisma.integrationSource.findMany.mockResolvedValue([
    {
      id: 'source-1',
      tenantId: 'tenant-1',
      credentialId: 'langame-credential-1',
      domain: '46',
    },
    {
      id: 'source-1337',
      tenantId: 'tenant-1',
      credentialId: 'langame-credential-1',
      domain: '1337.langame.ru',
    },
    {
      id: 'source-2',
      tenantId: 'tenant-2',
      credentialId: 'langame-credential-2',
      domain: '46',
    },
  ]);
  prisma.store.findMany.mockResolvedValue([]);
  prisma.guestPortalOtpChallenge.findFirst.mockResolvedValue(null);
  prisma.guestPortalOtpChallenge.count.mockResolvedValue(0);
  prisma.guestPortalOtpChallenge.create.mockResolvedValue({});
  prisma.guestPortalOtpChallenge.update.mockResolvedValue({});
  prisma.guestPortalOtpChallenge.updateMany.mockResolvedValue({ count: 0 });
  prisma.guestGameProfile.findFirst.mockResolvedValue(null);
  prisma.guestGameProfile.findMany.mockResolvedValue([]);
  prisma.guestGameProfile.create.mockResolvedValue(null);
  prisma.guestGameProfile.update.mockResolvedValue(null);
  prisma.guestGameReward.count.mockResolvedValue(0);
  prisma.guestGameReward.findMany.mockResolvedValue([]);
  prisma.guestGameVisualDraft.findFirst.mockResolvedValue(null);
  prisma.guestGameLootBox.findFirst.mockResolvedValue(null);
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
  prisma.guestBalanceSnapshot.findFirst.mockResolvedValue(null);
  prisma.guestBalanceSnapshot.upsert.mockImplementation(({ create }: any) =>
    Promise.resolve({
      id: 'balance-snapshot-1',
      createdAt: new Date('2026-06-15T08:00:00.000Z'),
      updatedAt: new Date('2026-06-15T08:00:00.000Z'),
      ...create,
    }),
  );
  prisma.guestBonusBalanceSnapshot.findFirst.mockResolvedValue(null);
  prisma.guestBonusBalanceSnapshot.upsert.mockImplementation(
    ({ create }: any) =>
      Promise.resolve({
        id: 'bonus-balance-snapshot-1',
        createdAt: new Date('2026-06-15T08:00:00.000Z'),
        updatedAt: new Date('2026-06-15T08:00:00.000Z'),
        ...create,
      }),
  );
  prisma.guestBonusBalanceCurrent.findFirst.mockResolvedValue(null);
  prisma.guestBonusBalanceCurrent.upsert.mockImplementation(({ create }: any) =>
    Promise.resolve({
      id: 'bonus-balance-current-1',
      createdAt: new Date('2026-06-15T08:00:00.000Z'),
      updatedAt: new Date('2026-06-15T08:00:00.000Z'),
      ...create,
    }),
  );
  prisma.guestGameEvent.create.mockResolvedValue({});
  prisma.guestGameEvent.createMany.mockResolvedValue({ count: 0 });
  prisma.guestGameEvent.count.mockResolvedValue(0);
  prisma.guestGameEvent.aggregate.mockResolvedValue({
    _count: { id: 0 },
    _max: { occurredAt: null },
  });
  prisma.guestGameEvent.findFirst.mockResolvedValue(null);
  prisma.guestGameEvent.findMany.mockResolvedValue([]);
  prisma.guestGameEvent.updateMany.mockResolvedValue({ count: 0 });
  prisma.guestSession.aggregate.mockResolvedValue({
    _count: { id: 0 },
    _sum: { durationMinutes: 0 },
    _max: { startedAt: null },
  });
  prisma.guestSession.findMany.mockResolvedValue([]);
  prisma.guestLog.count.mockResolvedValue(0);
  prisma.guestLog.findMany.mockResolvedValue([]);
  prisma.guestTransaction.aggregate.mockResolvedValue({
    _count: { id: 0 },
    _max: { happenedAt: null },
  });
  prisma.guestTransaction.findMany.mockResolvedValue([]);
  prisma.guestGameMission.findMany.mockResolvedValue([]);
  prisma.guestGameLootBox.findMany.mockResolvedValue([]);
  prisma.guestGameSeason.findMany.mockResolvedValue([]);
  prisma.guestGamePromoCard.findMany.mockResolvedValue([]);
  prisma.staffMember.findMany.mockResolvedValue([]);
  prisma.langameStaffUser.findMany.mockResolvedValue([]);
  guestGamificationService.checkIn.mockResolvedValue({
    checkedIn: true,
    checkedAt: '2026-06-15T08:10:00.000Z',
    liveSession: {
      externalDomain: '1337.langame.ru',
      externalSessionId: 'session-1',
      externalUuid: null,
      startedAt: '2026-06-15T08:00:00.000Z',
      durationMinutes: 10,
      sessionType: 'COMMON',
      sessionPacket: false,
      store: { id: 'store-1', name: '1337' },
    },
    processResult: {
      event: {
        profile: { id: 'profile-1' },
      },
      summary: {
        appliedXpDelta: 50,
        createdRewards: 1,
        idempotent: false,
      },
    },
  });
  guestGamificationService.processLiveSessionStart.mockResolvedValue(null);
  langameSettingsService.searchGuestByPhoneForPortal.mockResolvedValue({
    checkedAt: '2026-06-15T08:00:00.000Z',
    sources: [],
  });
  langameSettingsService.getGuestBalancesForPortal.mockResolvedValue({
    checkedAt: '2026-06-15T08:00:00.000Z',
    externalGuestId: 'guest-ext-1',
    source: {
      id: 'source-1',
      name: '443.langame.ru',
      domain: '443.langame.ru',
      status: 'FAILED',
      errorMessage: null,
    },
    balance: null,
    bonusBalance: null,
    balanceFound: false,
    bonusBalanceFound: false,
  });

  return {
    guestGamificationService,
    jwtService,
    langameSettingsService,
    prisma,
    secretEncryptionService,
    service,
  };
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

function buildTelegramMiniAppInitData({
  token = 'telegram-token',
  userId = '123456',
  username = 'player_one',
  authDate = Math.floor(Date.now() / 1000),
  hashOverride,
}: {
  token?: string;
  userId?: string;
  username?: string | null;
  authDate?: number;
  hashOverride?: string;
} = {}) {
  const params = new URLSearchParams();

  params.set('query_id', 'mini-app-query-1');
  params.set(
    'user',
    JSON.stringify({
      id: Number(userId),
      first_name: 'Player',
      username,
      language_code: 'ru',
    }),
  );
  params.set('auth_date', String(authDate));

  const dataCheckString = [...params.entries()]
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = createHmac('sha256', secret)
    .update(dataCheckString)
    .digest('hex');

  params.set('hash', hashOverride ?? hash);

  return params.toString();
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
          openState: 'WAITING_EVENT',
          openable: false,
          openBlocker: 'Лутбокс откроется после события: старт игровой сессии.',
          weeklyOpenedCount: 1,
          weeklyLimit: 2,
          dailyOpenedCount: 1,
          dailyLimit: null,
          periodicLimitPeriod: null,
          periodicOpenedCount: 0,
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
      promoCards: [],
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
  const processLiveSessionStartForPayload = jest
    .spyOn(service as any, 'processLiveSessionStartForPayload')
    .mockResolvedValue(null);

  return {
    buildPortalPayload,
    processLiveSessionStartForPayload,
    tokenPayload,
    verifyGuestToken,
  };
}

function mockTelegramBotLinkedProfile(
  prisma: any,
  service: GuestPortalService,
  portal: ReturnType<typeof portalPayloadFixture> = portalPayloadFixture(),
) {
  prisma.guestGameProfile.findFirst.mockResolvedValue({
    id: 'profile-1',
    tenantId: 'tenant-1',
    guestId: 'guest-1',
    phoneHash: 'phone-hash',
    contactMasked: '+7 *** **-11',
    phoneConsentStatus: 'GRANTED',
    phoneConsentAt: new Date('2026-06-15T08:00:00.000Z'),
    xp: 1250,
    level: 3,
    status: 'ACTIVE',
    unsubscribedAt: null,
  });
  prisma.guestGameTelegramLinkChallenge.findFirst.mockResolvedValue({
    storeId: portal.store.id,
    store: {
      name: portal.store.name,
    },
  });
  const buildPortalPayload = jest
    .spyOn(service as any, 'buildPortalPayload')
    .mockResolvedValue(portal);

  return { buildPortalPayload, portal };
}

function telegramBotClubProfilesFixture() {
  return [
    {
      id: 'profile-1',
      tenantId: 'tenant-1',
      guestId: 'guest-1',
      phoneHash: 'phone-hash',
      contactMasked: '+7 *** **-11',
      unsubscribedAt: null,
      tenant: {
        id: 'tenant-1',
        name: 'LeetPlus',
        slug: 'demo',
      },
      telegramLinkChallenges: [
        {
          id: 'telegram-link-1',
          store: {
            id: 'store-1',
            publicSlug: 'club-1337',
            name: '1337 Радищева',
            city: 'Екатеринбург',
            address: 'Радищева, 25',
          },
        },
        {
          id: 'telegram-link-2',
          store: {
            id: 'store-2',
            publicSlug: 'club-arena',
            name: 'Arena',
            city: 'Челябинск',
            address: 'Мира, 7',
          },
        },
      ],
    },
  ];
}

function telegramBotTenantStoresFixture() {
  return [
    {
      id: 'store-1',
      tenantId: 'tenant-1',
      publicSlug: 'club-radischeva',
      name: '1337 Radischeva',
      city: 'Ekaterinburg',
      address: 'Radischeva, 12',
    },
    {
      id: 'store-2',
      tenantId: 'tenant-1',
      publicSlug: 'club-lenina',
      name: '1337 Lenina',
      city: 'Ekaterinburg',
      address: 'Lenina, 1',
    },
    {
      id: 'store-3',
      tenantId: 'tenant-1',
      publicSlug: 'club-izhevsk-center',
      name: '1337 Izhevsk Center',
      city: 'Izhevsk',
      address: 'Pushkinskaya, 1',
    },
    {
      id: 'store-4',
      tenantId: 'tenant-1',
      publicSlug: 'club-izhevsk-mall',
      name: '1337 Izhevsk Mall',
      city: 'Izhevsk',
      address: 'Sovetskaya, 2',
    },
  ];
}

function telegramBotLinkedStoresFixture() {
  return telegramBotClubProfilesFixture()[0].telegramLinkChallenges.map(
    (challenge) => ({
      ...challenge.store,
      tenantId: 'tenant-1',
    }),
  );
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
      expect(buildPortalPayload).toHaveBeenCalledWith(tokenPayload, {
        liveSessionStartResult: null,
      });
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

    it('processes a live session-start event before returning game summary', async () => {
      const { guestGamificationService, prisma, service } = createService({
        GUEST_GAME_REFERRAL_SECRET: 'referral-secret',
        WEB_URL: 'https://leetplus.ru',
      });
      const portal = portalPayloadFixture();
      const tokenPayload = {
        sub: 'profile-1',
        purpose: 'guest_portal',
        tenantId: 'tenant-1',
        storeId: portal.store.id,
        guestId: 'guest-1',
        profileId: portal.profile.id,
        phoneHash: 'phone-hash',
      };

      jest
        .spyOn(service as any, 'verifyGuestToken')
        .mockResolvedValue(tokenPayload);
      jest
        .spyOn(service as any, 'buildPortalPayload')
        .mockResolvedValue(portal);
      prisma.tenant.findFirst.mockResolvedValue({
        id: 'tenant-1',
        name: 'Leet Clubs',
        slug: 'leet',
        stores: [
          {
            id: portal.store.id,
            publicSlug: portal.store.publicSlug,
            name: portal.store.name,
            address: portal.store.address,
            externalDomain: '1337.langame.ru',
            externalClubId: 'club-1',
            integrationSourceId: 'source-1',
          },
        ],
      });
      prisma.guest.findFirst.mockResolvedValue({
        id: 'guest-1',
        tenantId: 'tenant-1',
        externalDomain: '1337.langame.ru',
        externalGuestId: 'lg-guest-1',
        isDisabled: false,
      });
      prisma.guestGameProfile.findFirst.mockResolvedValue({
        id: portal.profile.id,
        tenantId: 'tenant-1',
        guestId: 'guest-1',
        status: 'ACTIVE',
      });
      prisma.guestGameEvent.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      prisma.guestGameEvent.findFirst.mockResolvedValueOnce(null);

      await service.getGameSummary('Bearer guest-token');

      expect(
        guestGamificationService.processLiveSessionStart,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'guest-portal:profile-1',
          tenantId: 'tenant-1',
          tenantSlug: 'leet',
          tenantStatus: 'ACTIVE',
        }),
        expect.objectContaining({
          profileId: portal.profile.id,
          guestId: 'guest-1',
          storeId: portal.store.id,
          note: expect.stringContaining('активной Langame-сессии'),
        }),
      );
    });

    it('records app-open without granting lootbox rewards before returning game summary', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-21T10:00:00.000Z'));
      const { guestGamificationService, prisma, service } = createService({
        GUEST_GAME_REFERRAL_SECRET: 'referral-secret',
        WEB_URL: 'https://leetplus.ru',
      });
      const portal = portalPayloadFixture();
      const { tokenPayload } = mockGameSummarySession(service, portal);
      jest.spyOn(service as any, 'getTenantStoreByIds').mockResolvedValue({
        tenant: { id: 'tenant-1', name: 'Leet Clubs', slug: 'leet' },
        store: {
          id: portal.store.id,
          publicSlug: portal.store.publicSlug,
          name: portal.store.name,
          address: portal.store.address,
          externalDomain: null,
          integrationSourceId: null,
        },
      });
      jest.spyOn(service as any, 'findGuest').mockResolvedValue(null);
      jest.spyOn(service as any, 'findProfile').mockResolvedValue({
        id: portal.profile.id,
        guestId: null,
      });
      guestGamificationService.createEvent.mockResolvedValue({});
      prisma.guestGameEvent.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      prisma.guestGameEvent.findFirst.mockResolvedValueOnce(null);

      try {
        const result = await service.recordAppOpen('Bearer guest-token', {
          surface: 'telegram-mini-app',
        });

        expect(guestGamificationService.createEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            tenantId: tokenPayload.tenantId,
            tenantSlug: 'leet',
          }),
          expect.objectContaining({
            profileId: portal.profile.id,
            guestId: null,
            eventType: 'APP_OPEN',
            externalDomain: 'leetplus-guest-portal',
            externalId:
              'guest-game:GUEST_APP_OPEN:APP_OPEN:profile-1:store-1:2026-06-21',
            note: expect.stringContaining('Telegram Mini App'),
            payload: expect.objectContaining({
              sourceFactId: 'profile-1:store-1:2026-06-21',
              sourceFactKind: 'GUEST_APP_OPEN',
              storeId: portal.store.id,
            }),
          }),
        );
        expect(guestGamificationService.processEvent).not.toHaveBeenCalled();
        expect(result).toMatchObject({
          processed: true,
          idempotent: false,
          appliedXpDelta: 0,
          createdRewards: 0,
          queuedRewardAmount: 0,
          summary: {
            tenant: portal.tenant,
            store: portal.store,
            profile: portal.profile,
          },
        });
      } finally {
        jest.useRealTimers();
      }
    });

    it('does not open a session-start lootbox before the unlock event', async () => {
      const { guestGamificationService, prisma, service } = createService({
        GUEST_GAME_REFERRAL_SECRET: 'referral-secret',
        WEB_URL: 'https://leetplus.ru',
      });
      const portal = portalPayloadFixture();
      mockGameSummarySession(service, portal);
      jest.spyOn(service as any, 'getTenantStoreByIds').mockResolvedValue({
        tenant: { id: 'tenant-1', name: 'Leet Clubs', slug: 'leet' },
        store: {
          id: portal.store.id,
          publicSlug: portal.store.publicSlug,
          name: portal.store.name,
          address: portal.store.address,
          externalDomain: null,
          integrationSourceId: null,
        },
      });
      jest
        .spyOn(service as any, 'findGuest')
        .mockResolvedValue({ id: 'guest-1' });
      jest.spyOn(service as any, 'findProfile').mockResolvedValue({
        id: portal.profile.id,
        guestId: 'guest-1',
      });
      prisma.guestGameLootBox.findFirst.mockResolvedValue({
        id: 'loot-1',
        tenantId: 'tenant-1',
        name: 'Лутбокс тихих часов',
        status: 'ACTIVE',
        storeIds: [portal.store.id],
        triggerKind: 'SESSION_START',
      });

      await expect(
        service.openLootBox('Bearer guest-token', 'loot-1'),
      ).rejects.toThrow('старт игровой сессии');

      expect(guestGamificationService.dryRun).not.toHaveBeenCalled();
      expect(guestGamificationService.processEvent).not.toHaveBeenCalled();
    });

    it('does not reuse stale session-start events without a live session', async () => {
      const { guestGamificationService, prisma, service } = createService({
        GUEST_GAME_REFERRAL_SECRET: 'referral-secret',
        WEB_URL: 'https://leetplus.ru',
      });
      const portal = portalPayloadFixture();
      mockGameSummarySession(service, portal);
      jest.spyOn(service as any, 'getTenantStoreByIds').mockResolvedValue({
        tenant: { id: 'tenant-1', name: 'Leet Clubs', slug: 'leet' },
        store: {
          id: portal.store.id,
          publicSlug: portal.store.publicSlug,
          name: portal.store.name,
          address: portal.store.address,
          externalDomain: null,
          integrationSourceId: null,
        },
      });
      jest
        .spyOn(service as any, 'findGuest')
        .mockResolvedValue({ id: 'guest-1' });
      jest.spyOn(service as any, 'findProfile').mockResolvedValue({
        id: portal.profile.id,
        guestId: 'guest-1',
      });
      prisma.guestGameLootBox.findFirst.mockResolvedValue({
        id: 'loot-session',
        tenantId: 'tenant-1',
        name: 'Session lootbox',
        status: 'ACTIVE',
        storeIds: [portal.store.id],
        triggerKind: 'SESSION_START',
        limits: { perGuestPerWeek: 2 },
      });
      prisma.guestGameEvent.findMany.mockResolvedValue([
        {
          eventType: 'SESSION_START',
          occurredAt: new Date('2026-06-29T09:45:00.000Z'),
          payload: {
            sourceFactKind: 'GUEST_SESSION',
            store: { id: portal.store.id, name: portal.store.name },
            input: {
              sessionType: 'packet_hours',
              sessionPacket: true,
              sessionMinutes: 75,
            },
          },
        },
      ]);

      await expect(
        service.openLootBox('Bearer guest-token', 'loot-session'),
      ).rejects.toThrow();

      expect(guestGamificationService.dryRun).not.toHaveBeenCalled();
      expect(guestGamificationService.processEvent).not.toHaveBeenCalled();
    });

    it('opens a session-start lootbox from a saved unlock event after the live session ends', async () => {
      const { guestGamificationService, prisma, service } = createService({
        GUEST_GAME_REFERRAL_SECRET: 'referral-secret',
        WEB_URL: 'https://leetplus.ru',
      });
      const portal = portalPayloadFixture();
      const { tokenPayload } = mockGameSummarySession(service, portal);
      jest.spyOn(service as any, 'getTenantStoreByIds').mockResolvedValue({
        tenant: { id: 'tenant-1', name: 'Leet Clubs', slug: 'leet' },
        store: {
          id: portal.store.id,
          publicSlug: portal.store.publicSlug,
          name: portal.store.name,
          address: portal.store.address,
          externalDomain: null,
          integrationSourceId: null,
        },
      });
      jest
        .spyOn(service as any, 'findGuest')
        .mockResolvedValue({ id: 'guest-1' });
      jest.spyOn(service as any, 'findProfile').mockResolvedValue({
        id: portal.profile.id,
        guestId: 'guest-1',
      });
      prisma.guestGameLootBox.findFirst.mockResolvedValue({
        id: 'loot-packet',
        tenantId: 'tenant-1',
        name: 'Packet session lootbox',
        status: 'ACTIVE',
        storeIds: [portal.store.id],
        triggerKind: 'SESSION_START',
        sessionType: 'packet_hours',
        limits: { perGuestPerWeek: 2 },
        periodRules: {},
      });
      prisma.guestGameEvent.findMany.mockResolvedValue([
        {
          eventType: 'SESSION_START',
          occurredAt: new Date('2026-07-05T01:49:00.000Z'),
          payload: {
            sourceFactKind: 'GUEST_SESSION',
            store: { id: portal.store.id, name: portal.store.name },
            input: {
              sessionType: 'packet_hours',
              sessionPacket: true,
              sessionMinutes: 228,
            },
            rules: [
              {
                id: 'loot-packet',
                kind: 'LOOT_BOX',
                eligible: false,
                blockers: [
                  'Лутбокс разблокирован: награда создается только при открытии гостем.',
                ],
              },
            ],
          },
        },
      ]);
      prisma.guestGameReward.count.mockResolvedValue(0);
      prisma.guestGameEvent.count.mockResolvedValue(0);
      guestGamificationService.dryRun.mockResolvedValue({
        rules: [
          {
            kind: 'LOOT_BOX',
            id: 'loot-packet',
            eligible: true,
            blockers: [],
          },
        ],
      });
      guestGamificationService.processEvent.mockResolvedValue({
        summary: {
          idempotent: false,
          createdRewards: 1,
          queuedRewardAmount: 200,
        },
        rewards: [{ rewardLabel: '200 бонусов' }],
      });

      const result = await service.openLootBox(
        'Bearer guest-token',
        'loot-packet',
      );

      expect(guestGamificationService.dryRun).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: tokenPayload.tenantId,
          tenantSlug: 'leet',
        }),
        expect.objectContaining({
          profileId: portal.profile.id,
          guestId: 'guest-1',
          lootBoxId: 'loot-packet',
          storeId: portal.store.id,
          eventType: 'SESSION_START',
          sessionType: 'packet_hours',
          sessionPacket: true,
          sessionMinutes: 228,
          sourceFactKind: 'GUEST_LOOT_BOX_OPEN',
        }),
      );
      expect(guestGamificationService.processEvent).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          lootBoxId: 'loot-packet',
          eventType: 'SESSION_START',
          sourceFactKind: 'GUEST_LOOT_BOX_OPEN',
        }),
      );
      expect(result).toMatchObject({
        processed: true,
        idempotent: false,
        createdRewards: 1,
        queuedRewardAmount: 200,
      });
    });

    it('opens a session-start lootbox after the time window when the saved unlock happened inside it', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-07-06T10:30:00.000Z'));

      try {
        const { guestGamificationService, prisma, service } = createService({
          GUEST_GAME_REFERRAL_SECRET: 'referral-secret',
          WEB_URL: 'https://leetplus.ru',
        });
        const portal = portalPayloadFixture();
        const { processLiveSessionStartForPayload } = mockGameSummarySession(
          service,
          portal,
        );
        processLiveSessionStartForPayload.mockResolvedValue({
          event: {
            eventType: 'SESSION_START',
            occurredAt: '2026-07-06T10:30:00.000Z',
            payload: {
              sourceFactKind: 'GUEST_SESSION',
              store: { id: portal.store.id, name: portal.store.name },
              input: {
                sessionType: 'regular_session',
                sessionPacket: false,
                sessionMinutes: 90,
              },
              rules: [
                {
                  id: 'loot-morning',
                  kind: 'LOOT_BOX',
                  eligible: true,
                  blockers: [],
                },
              ],
            },
          },
        });
        jest.spyOn(service as any, 'getTenantStoreByIds').mockResolvedValue({
          tenant: { id: 'tenant-1', name: 'Leet Clubs', slug: 'leet' },
          store: {
            id: portal.store.id,
            publicSlug: portal.store.publicSlug,
            name: portal.store.name,
            address: portal.store.address,
            externalDomain: null,
            integrationSourceId: null,
            timeZone: 'Asia/Yekaterinburg',
          },
        });
        jest
          .spyOn(service as any, 'findGuest')
          .mockResolvedValue({ id: 'guest-1' });
        jest.spyOn(service as any, 'findProfile').mockResolvedValue({
          id: portal.profile.id,
          guestId: 'guest-1',
        });
        prisma.guestGameLootBox.findFirst.mockResolvedValue({
          id: 'loot-morning',
          tenantId: 'tenant-1',
          name: 'Morning lootbox',
          status: 'ACTIVE',
          storeIds: [portal.store.id],
          triggerKind: 'SESSION_START',
          limits: { perGuestPerWeek: 2, totalPerDay: 30 },
          periodRules: { hours: ['08:00-14:00'] },
        });
        prisma.guestGameEvent.findMany.mockResolvedValue([
          {
            eventType: 'SESSION_START',
            occurredAt: new Date('2026-07-06T05:30:00.000Z'),
            payload: {
              sourceFactKind: 'GUEST_SESSION',
              store: { id: portal.store.id, name: portal.store.name },
              input: {
                sessionType: 'regular_session',
                sessionPacket: false,
                sessionMinutes: 90,
              },
              rules: [
                {
                  id: 'loot-morning',
                  kind: 'LOOT_BOX',
                  eligible: true,
                  blockers: [],
                },
              ],
            },
          },
        ]);
        prisma.guestGameReward.count.mockResolvedValue(0);
        prisma.guestGameEvent.count.mockResolvedValue(0);
        guestGamificationService.dryRun.mockResolvedValue({
          rules: [
            {
              kind: 'LOOT_BOX',
              id: 'loot-morning',
              eligible: true,
              blockers: [],
            },
          ],
        });
        guestGamificationService.processEvent.mockResolvedValue({
          summary: {
            idempotent: false,
            createdRewards: 1,
            queuedRewardAmount: 100,
          },
          rewards: [{ rewardLabel: '100 bonuses' }],
        });

        await expect(
          service.openLootBox('Bearer guest-token', 'loot-morning'),
        ).resolves.toMatchObject({
          processed: true,
          createdRewards: 1,
        });

        expect(guestGamificationService.dryRun).toHaveBeenCalledWith(
          expect.any(Object),
          expect.objectContaining({
            lootBoxId: 'loot-morning',
            eventType: 'SESSION_START',
            occurredAt: '2026-07-06T05:30:00.000Z',
            sourceFactKind: 'GUEST_LOOT_BOX_OPEN',
          }),
        );
        expect(guestGamificationService.processEvent).toHaveBeenCalledWith(
          expect.any(Object),
          expect.objectContaining({
            lootBoxId: 'loot-morning',
            eventType: 'SESSION_START',
            occurredAt: '2026-07-06T05:30:00.000Z',
            sourceFactKind: 'GUEST_LOOT_BOX_OPEN',
          }),
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('does not unlock a packet-only session lootbox for a regular live session', async () => {
      const { guestGamificationService, prisma, service } = createService({
        GUEST_GAME_REFERRAL_SECRET: 'referral-secret',
        WEB_URL: 'https://leetplus.ru',
      });
      const portal = portalPayloadFixture();
      const { processLiveSessionStartForPayload } = mockGameSummarySession(
        service,
        portal,
      );
      jest.spyOn(service as any, 'getTenantStoreByIds').mockResolvedValue({
        tenant: { id: 'tenant-1', name: 'Leet Clubs', slug: 'leet' },
        store: {
          id: portal.store.id,
          publicSlug: portal.store.publicSlug,
          name: portal.store.name,
          address: portal.store.address,
          externalDomain: null,
          integrationSourceId: null,
        },
      });
      jest
        .spyOn(service as any, 'findGuest')
        .mockResolvedValue({ id: 'guest-1' });
      jest.spyOn(service as any, 'findProfile').mockResolvedValue({
        id: portal.profile.id,
        guestId: 'guest-1',
      });
      prisma.guestGameLootBox.findFirst.mockResolvedValue({
        id: 'loot-packet',
        tenantId: 'tenant-1',
        name: 'Packet lootbox',
        status: 'ACTIVE',
        storeIds: [portal.store.id],
        triggerKind: 'SESSION_START',
        sessionType: 'packet_hours',
        limits: { perGuestPerWeek: 2 },
        periodRules: {},
      });
      processLiveSessionStartForPayload.mockResolvedValue({
        processed: true,
        dryRun: {},
        event: {
          eventType: 'SESSION_START',
          occurredAt: '2026-06-29T09:45:00.000Z',
          payload: {
            sourceFactKind: 'GUEST_SESSION',
            store: { id: portal.store.id, name: portal.store.name },
            input: {
              sessionType: 'regular_session',
              sessionPacket: 0,
              sessionMinutes: 75,
            },
          },
        },
        rewards: [],
        summary: {
          idempotent: true,
          createdRewards: 0,
          queuedRewardAmount: 0,
        },
      } as any);

      await expect(
        service.openLootBox('Bearer guest-token', 'loot-packet'),
      ).rejects.toThrow();

      expect(guestGamificationService.dryRun).not.toHaveBeenCalled();
      expect(guestGamificationService.processEvent).not.toHaveBeenCalled();
    });

    it('does not unlock a session-start lootbox when live session tariff conditions do not match', async () => {
      const { guestGamificationService, prisma, service } = createService({
        GUEST_GAME_REFERRAL_SECRET: 'referral-secret',
        WEB_URL: 'https://leetplus.ru',
      });
      const portal = portalPayloadFixture();
      const { processLiveSessionStartForPayload } = mockGameSummarySession(
        service,
        portal,
      );
      jest.spyOn(service as any, 'getTenantStoreByIds').mockResolvedValue({
        tenant: { id: 'tenant-1', name: 'Leet Clubs', slug: 'leet' },
        store: {
          id: portal.store.id,
          publicSlug: portal.store.publicSlug,
          name: portal.store.name,
          address: portal.store.address,
          externalDomain: null,
          integrationSourceId: null,
        },
      });
      jest
        .spyOn(service as any, 'findGuest')
        .mockResolvedValue({ id: 'guest-1' });
      jest.spyOn(service as any, 'findProfile').mockResolvedValue({
        id: portal.profile.id,
        guestId: 'guest-1',
      });
      prisma.guestGameLootBox.findFirst.mockResolvedValue({
        id: 'loot-tariff',
        tenantId: 'tenant-1',
        name: 'Packet tariff lootbox',
        status: 'ACTIVE',
        storeIds: [portal.store.id],
        triggerKind: 'SESSION_START',
        sessionType: 'packet_hours',
        limits: { perGuestPerWeek: 2 },
        periodRules: {
          tariffGroupId: 'packet-group',
          tariffPeriodId: 'packet-period',
          tariffTypeId: 'packet-type',
        },
      });
      processLiveSessionStartForPayload.mockResolvedValue({
        processed: true,
        dryRun: {},
        event: {
          eventType: 'SESSION_START',
          occurredAt: '2026-06-29T09:45:00.000Z',
          payload: {
            sourceFactKind: 'GUEST_SESSION',
            store: { id: portal.store.id, name: portal.store.name },
            input: {
              sessionType: 'packet_hours',
              sessionPacket: true,
              sessionMinutes: 75,
              tariffGroupId: 'regular-group',
              tariffPeriodId: 'packet-period',
              tariffTypeId: 'packet-type',
            },
          },
        },
        rewards: [],
        summary: {
          idempotent: true,
          createdRewards: 0,
          queuedRewardAmount: 0,
        },
      } as any);

      await expect(
        service.openLootBox('Bearer guest-token', 'loot-tariff'),
      ).rejects.toThrow();

      expect(guestGamificationService.dryRun).not.toHaveBeenCalled();
      expect(guestGamificationService.processEvent).not.toHaveBeenCalled();
    });

    it('does not unlock a guest-log lootbox when the saved event is blocked by log filters', async () => {
      const { guestGamificationService, prisma, service } = createService({
        GUEST_GAME_REFERRAL_SECRET: 'referral-secret',
        WEB_URL: 'https://leetplus.ru',
      });
      const portal = portalPayloadFixture();
      mockGameSummarySession(service, portal);
      jest.spyOn(service as any, 'getTenantStoreByIds').mockResolvedValue({
        tenant: { id: 'tenant-1', name: 'Leet Clubs', slug: 'leet' },
        store: {
          id: portal.store.id,
          publicSlug: portal.store.publicSlug,
          name: portal.store.name,
          address: portal.store.address,
          externalDomain: null,
          integrationSourceId: null,
        },
      });
      jest
        .spyOn(service as any, 'findGuest')
        .mockResolvedValue({ id: 'guest-1' });
      jest.spyOn(service as any, 'findProfile').mockResolvedValue({
        id: portal.profile.id,
        guestId: 'guest-1',
      });
      prisma.guestGameLootBox.findFirst.mockResolvedValue({
        id: 'loot-log',
        tenantId: 'tenant-1',
        name: 'Guest log lootbox',
        status: 'ACTIVE',
        storeIds: [portal.store.id],
        triggerKind: 'GUEST_LOG',
        limits: { perGuestPerWeek: 2 },
        periodRules: {
          guestLogTypes: ['visit'],
          blockedGuestLogTypes: ['manual_cancel'],
        },
      });
      prisma.guestGameEvent.findMany.mockResolvedValue([
        {
          eventType: 'GUEST_LOG',
          occurredAt: new Date('2026-06-29T09:45:00.000Z'),
          payload: {
            sourceFactKind: 'GUEST_LOG',
            store: { id: portal.store.id, name: portal.store.name },
            input: {
              guestLogType: 'manual_cancel',
            },
          },
        },
      ]);

      await expect(
        service.openLootBox('Bearer guest-token', 'loot-log'),
      ).rejects.toThrow();

      expect(guestGamificationService.dryRun).not.toHaveBeenCalled();
      expect(guestGamificationService.processEvent).not.toHaveBeenCalled();
    });

    it('does not open an audience-scoped lootbox for a guest outside the audience', async () => {
      const { guestGamificationService, prisma, service } = createService({
        GUEST_GAME_REFERRAL_SECRET: 'referral-secret',
        WEB_URL: 'https://leetplus.ru',
      });
      const portal = portalPayloadFixture();
      mockGameSummarySession(service, portal);
      jest.spyOn(service as any, 'getTenantStoreByIds').mockResolvedValue({
        tenant: { id: 'tenant-1', name: 'Leet Clubs', slug: 'leet' },
        store: {
          id: portal.store.id,
          publicSlug: portal.store.publicSlug,
          name: portal.store.name,
          address: portal.store.address,
          externalDomain: 'club-1',
          integrationSourceId: null,
        },
      });
      jest.spyOn(service as any, 'findGuest').mockResolvedValue({
        id: 'guest-1',
        externalDomain: 'club-1',
        externalGuestId: 'lg-guest-1',
      });
      jest.spyOn(service as any, 'findProfile').mockResolvedValue({
        id: portal.profile.id,
        guestId: 'guest-1',
      });
      prisma.guestGameLootBox.findFirst.mockResolvedValue({
        id: 'loot-audience',
        tenantId: 'tenant-1',
        name: 'Audience lootbox',
        status: 'ACTIVE',
        storeIds: [portal.store.id],
        audienceId: 'audience-vip',
        triggerKind: 'APP_OPEN',
        limits: { perGuestPerWeek: 2 },
        periodRules: {},
      });
      prisma.guestAudienceMember.findMany.mockResolvedValue([
        { audienceId: 'audience-regular' },
      ]);

      await expect(
        service.openLootBox('Bearer guest-token', 'loot-audience'),
      ).rejects.toThrow('другой аудитории');

      expect(prisma.guestAudienceMember.findMany).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-1',
          OR: [
            { guestId: 'guest-1' },
            {
              externalDomain: 'club-1',
              externalGuestId: 'lg-guest-1',
            },
          ],
        },
        select: { audienceId: true },
      });
      expect(guestGamificationService.dryRun).not.toHaveBeenCalled();
      expect(guestGamificationService.processEvent).not.toHaveBeenCalled();
    });

    it('opens a session-start lootbox after the session unlock event', async () => {
      const { guestGamificationService, prisma, service } = createService({
        GUEST_GAME_REFERRAL_SECRET: 'referral-secret',
        WEB_URL: 'https://leetplus.ru',
      });
      const portal = portalPayloadFixture();
      const { processLiveSessionStartForPayload, tokenPayload } =
        mockGameSummarySession(service, portal);
      jest.spyOn(service as any, 'getTenantStoreByIds').mockResolvedValue({
        tenant: { id: 'tenant-1', name: 'Leet Clubs', slug: 'leet' },
        store: {
          id: portal.store.id,
          publicSlug: portal.store.publicSlug,
          name: portal.store.name,
          address: portal.store.address,
          externalDomain: null,
          integrationSourceId: null,
        },
      });
      jest
        .spyOn(service as any, 'findGuest')
        .mockResolvedValue({ id: 'guest-1' });
      jest.spyOn(service as any, 'findProfile').mockResolvedValue({
        id: portal.profile.id,
        guestId: 'guest-1',
      });
      prisma.guestGameLootBox.findFirst.mockResolvedValue({
        id: 'loot-session',
        tenantId: 'tenant-1',
        name: 'Лутбокс за старт сессии',
        status: 'ACTIVE',
        storeIds: [portal.store.id],
        triggerKind: 'SESSION_START',
        limits: { perGuestPerWeek: 2 },
      });
      prisma.guestGameEvent.findMany.mockResolvedValue([
        {
          eventType: 'SESSION_START',
          occurredAt: new Date('2026-06-29T09:45:00.000Z'),
          payload: {
            sourceFactKind: 'GUEST_SESSION',
            store: { id: portal.store.id, name: portal.store.name },
            input: {
              sessionType: 'regular_session',
              sessionPacket: false,
              sessionMinutes: 75,
            },
          },
        },
      ]);
      processLiveSessionStartForPayload.mockResolvedValue({
        processed: true,
        dryRun: {},
        event: {
          eventType: 'SESSION_START',
          occurredAt: '2026-06-29T09:45:00.000Z',
          payload: {
            sourceFactKind: 'GUEST_SESSION',
            store: { id: portal.store.id, name: portal.store.name },
            input: {
              sessionType: 'regular_session',
              sessionPacket: false,
              sessionMinutes: 75,
            },
          },
        },
        rewards: [],
        summary: {
          idempotent: true,
          createdRewards: 0,
          queuedRewardAmount: 0,
        },
      } as any);
      prisma.guestGameReward.count.mockResolvedValue(0);
      prisma.guestGameEvent.count.mockResolvedValue(0);
      guestGamificationService.dryRun.mockResolvedValue({
        rules: [
          {
            kind: 'LOOT_BOX',
            id: 'loot-session',
            eligible: true,
            blockers: [],
          },
        ],
      });
      guestGamificationService.processEvent.mockResolvedValue({
        summary: {
          idempotent: false,
          createdRewards: 1,
          queuedRewardAmount: 100,
        },
        rewards: [{ rewardLabel: '100 бонусов' }],
      });

      const result = await service.openLootBox(
        'Bearer guest-token',
        'loot-session',
      );

      expect(guestGamificationService.dryRun).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: tokenPayload.tenantId,
          tenantSlug: 'leet',
        }),
        expect.objectContaining({
          profileId: portal.profile.id,
          guestId: 'guest-1',
          lootBoxId: 'loot-session',
          storeId: portal.store.id,
          eventType: 'SESSION_START',
          sessionType: 'regular_session',
          sessionPacket: false,
          sessionMinutes: 75,
          sourceFactId: expect.stringMatching(
            /^profile-1:store-1:loot-session:\d{4}-\d{2}-\d{2}:1$/,
          ),
          sourceFactKind: 'GUEST_LOOT_BOX_OPEN',
        }),
      );
      expect(guestGamificationService.processEvent).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          lootBoxId: 'loot-session',
          eventType: 'SESSION_START',
          sourceFactId: expect.stringMatching(
            /^profile-1:store-1:loot-session:\d{4}-\d{2}-\d{2}:1$/,
          ),
          sourceFactKind: 'GUEST_LOOT_BOX_OPEN',
        }),
      );
      expect(result).toMatchObject({
        processed: true,
        idempotent: false,
        createdRewards: 1,
        queuedRewardAmount: 100,
        rewards: [{ rewardLabel: '100 бонусов' }],
      });
    });

    it('opens an app-open lootbox through dry-run and process-event', async () => {
      const { guestGamificationService, prisma, service } = createService({
        GUEST_GAME_REFERRAL_SECRET: 'referral-secret',
        WEB_URL: 'https://leetplus.ru',
      });
      const portal = portalPayloadFixture();
      const { tokenPayload } = mockGameSummarySession(service, portal);
      jest.spyOn(service as any, 'getTenantStoreByIds').mockResolvedValue({
        tenant: { id: 'tenant-1', name: 'Leet Clubs', slug: 'leet' },
        store: {
          id: portal.store.id,
          publicSlug: portal.store.publicSlug,
          name: portal.store.name,
          address: portal.store.address,
          externalDomain: null,
          integrationSourceId: null,
        },
      });
      jest
        .spyOn(service as any, 'findGuest')
        .mockResolvedValue({ id: 'guest-1' });
      jest.spyOn(service as any, 'findProfile').mockResolvedValue({
        id: portal.profile.id,
        guestId: 'guest-1',
      });
      prisma.guestGameLootBox.findFirst.mockResolvedValue({
        id: 'loot-app',
        tenantId: 'tenant-1',
        name: 'Daily app lootbox',
        status: 'ACTIVE',
        storeIds: [portal.store.id],
        triggerKind: 'APP_OPEN',
      });
      prisma.guestGameVisualDraft.findFirst.mockResolvedValueOnce({
        payload: { lootBoxes: [{ id: 'other-lootbox' }] },
      });
      prisma.guestGameReward.count.mockResolvedValue(0);
      prisma.guestGameEvent.count.mockResolvedValue(1);
      guestGamificationService.dryRun.mockResolvedValue({
        rules: [
          {
            kind: 'LOOT_BOX',
            id: 'loot-app',
            eligible: true,
            blockers: [],
          },
        ],
      });
      guestGamificationService.processEvent.mockResolvedValue({
        summary: {
          idempotent: false,
          createdRewards: 1,
          queuedRewardAmount: 50,
        },
        rewards: [{ rewardLabel: '50 bonuses' }],
      });

      const result = await service.openLootBox(
        'Bearer guest-token',
        'loot-app',
      );

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
      expect(guestGamificationService.dryRun).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: tokenPayload.tenantId,
          tenantSlug: 'leet',
        }),
        expect.objectContaining({
          profileId: portal.profile.id,
          guestId: 'guest-1',
          lootBoxId: 'loot-app',
          storeId: portal.store.id,
          eventType: 'APP_OPEN',
          sourceFactId: expect.stringMatching(
            /^profile-1:store-1:loot-app:\d{4}-\d{2}-\d{2}:2$/,
          ),
          sourceFactKind: 'GUEST_LOOT_BOX_OPEN',
        }),
      );
      expect(guestGamificationService.processEvent).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          lootBoxId: 'loot-app',
          eventType: 'APP_OPEN',
          sourceFactId: expect.stringMatching(
            /^profile-1:store-1:loot-app:\d{4}-\d{2}-\d{2}:2$/,
          ),
          sourceFactKind: 'GUEST_LOOT_BOX_OPEN',
        }),
      );
      expect(result).toMatchObject({
        processed: true,
        idempotent: false,
        createdRewards: 1,
        queuedRewardAmount: 50,
        rewards: [{ rewardLabel: '50 bonuses' }],
      });
    });

    it('does not process an app-open lootbox when the guest limit is reached', async () => {
      const { guestGamificationService, prisma, service } = createService({
        GUEST_GAME_REFERRAL_SECRET: 'referral-secret',
        WEB_URL: 'https://leetplus.ru',
      });
      const portal = portalPayloadFixture();
      mockGameSummarySession(service, portal);
      jest.spyOn(service as any, 'getTenantStoreByIds').mockResolvedValue({
        tenant: { id: 'tenant-1', name: 'Leet Clubs', slug: 'leet' },
        store: {
          id: portal.store.id,
          publicSlug: portal.store.publicSlug,
          name: portal.store.name,
          address: portal.store.address,
          externalDomain: null,
          integrationSourceId: null,
        },
      });
      jest
        .spyOn(service as any, 'findGuest')
        .mockResolvedValue({ id: 'guest-1' });
      jest.spyOn(service as any, 'findProfile').mockResolvedValue({
        id: portal.profile.id,
        guestId: 'guest-1',
      });
      prisma.guestGameLootBox.findFirst.mockResolvedValue({
        id: 'loot-app',
        tenantId: 'tenant-1',
        name: 'Daily app lootbox',
        status: 'ACTIVE',
        storeIds: [portal.store.id],
        triggerKind: 'APP_OPEN',
        limits: { perGuestPerWeek: 2 },
      });
      prisma.guestGameReward.findMany.mockResolvedValue([
        {
          id: 'reward-1',
          status: 'APPROVED',
          lootBoxId: 'loot-app',
          missionId: null,
          seasonId: null,
          rewardType: 'BONUS_BALANCE',
          rewardAmount: new Prisma.Decimal(50),
          rewardLabel: '50 бонусов',
          rewardCode: null,
          qualifiedAt: new Date(),
          expiresAt: null,
        },
        {
          id: 'reward-2',
          status: 'APPROVED',
          lootBoxId: 'loot-app',
          missionId: null,
          seasonId: null,
          rewardType: 'BONUS_BALANCE',
          rewardAmount: new Prisma.Decimal(50),
          rewardLabel: '50 бонусов',
          rewardCode: null,
          qualifiedAt: new Date(),
          expiresAt: null,
        },
      ]);

      await expect(
        service.openLootBox('Bearer guest-token', 'loot-app'),
      ).rejects.toThrow('Лимит на гостя за неделю исчерпан');

      expect(guestGamificationService.dryRun).not.toHaveBeenCalled();
      expect(guestGamificationService.processEvent).not.toHaveBeenCalled();
    });

    it('does not process a periodic daily lootbox more than once per guest per day', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-21T10:00:00.000Z'));
      const { guestGamificationService, prisma, service } = createService({
        GUEST_GAME_REFERRAL_SECRET: 'referral-secret',
        WEB_URL: 'https://leetplus.ru',
      });
      const portal = portalPayloadFixture();
      mockGameSummarySession(service, portal);
      jest.spyOn(service as any, 'getTenantStoreByIds').mockResolvedValue({
        tenant: { id: 'tenant-1', name: 'Leet Clubs', slug: 'leet' },
        store: {
          id: portal.store.id,
          publicSlug: portal.store.publicSlug,
          name: portal.store.name,
          address: portal.store.address,
          externalDomain: null,
          integrationSourceId: null,
        },
      });
      jest
        .spyOn(service as any, 'findGuest')
        .mockResolvedValue({ id: 'guest-1' });
      jest.spyOn(service as any, 'findProfile').mockResolvedValue({
        id: portal.profile.id,
        guestId: 'guest-1',
      });
      prisma.guestGameLootBox.findFirst.mockResolvedValue({
        id: 'loot-app',
        tenantId: 'tenant-1',
        name: 'Daily app lootbox',
        status: 'ACTIVE',
        storeIds: [portal.store.id],
        triggerKind: 'APP_OPEN',
        limits: { periodicLimit: 'DAILY' },
      });
      prisma.guestGameReward.findMany.mockResolvedValue([
        {
          id: 'reward-today',
          status: 'APPROVED',
          lootBoxId: 'loot-app',
          missionId: null,
          seasonId: null,
          rewardType: 'BONUS_BALANCE',
          rewardAmount: new Prisma.Decimal(50),
          rewardLabel: '50 бонусов',
          rewardCode: null,
          qualifiedAt: new Date('2026-06-21T08:00:00.000Z'),
          expiresAt: null,
        },
      ]);

      try {
        await expect(
          service.openLootBox('Bearer guest-token', 'loot-app'),
        ).rejects.toThrow('не чаще одного раза в сутки');
      } finally {
        jest.useRealTimers();
      }

      expect(guestGamificationService.dryRun).not.toHaveBeenCalled();
      expect(guestGamificationService.processEvent).not.toHaveBeenCalled();
    });

    it('uses actual opening time for daily periodic lootbox limits', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-22T10:00:00.000Z'));
      const { guestGamificationService, prisma, service } = createService({
        GUEST_GAME_REFERRAL_SECRET: 'referral-secret',
        WEB_URL: 'https://leetplus.ru',
      });
      const portal = portalPayloadFixture();
      mockGameSummarySession(service, portal);
      jest.spyOn(service as any, 'getTenantStoreByIds').mockResolvedValue({
        tenant: { id: 'tenant-1', name: 'Leet Clubs', slug: 'leet' },
        store: {
          id: portal.store.id,
          publicSlug: portal.store.publicSlug,
          name: portal.store.name,
          address: portal.store.address,
          externalDomain: null,
          integrationSourceId: null,
          timeZone: 'Asia/Yekaterinburg',
        },
      });
      jest
        .spyOn(service as any, 'findGuest')
        .mockResolvedValue({ id: 'guest-1' });
      jest.spyOn(service as any, 'findProfile').mockResolvedValue({
        id: portal.profile.id,
        guestId: 'guest-1',
      });
      prisma.guestGameLootBox.findFirst.mockResolvedValue({
        id: 'loot-daily-session',
        tenantId: 'tenant-1',
        name: 'Daily session lootbox',
        status: 'ACTIVE',
        storeIds: [portal.store.id],
        triggerKind: 'SESSION_START',
        sessionType: 'packet_hours',
        limits: { periodicLimit: 'DAILY' },
        periodRules: {},
      });
      prisma.guestGameEvent.findMany.mockResolvedValue([
        {
          eventType: 'SESSION_START',
          occurredAt: new Date('2026-06-21T08:00:00.000Z'),
          payload: {
            sourceFactKind: 'GUEST_SESSION',
            store: { id: portal.store.id, name: portal.store.name },
            input: {
              sessionType: 'packet_hours',
              sessionPacket: true,
              sessionMinutes: 180,
            },
            rules: [
              {
                id: 'loot-daily-session',
                kind: 'LOOT_BOX',
                eligible: false,
                blockers: [
                  'Лутбокс разблокирован: награда создается только при открытии гостем.',
                ],
              },
            ],
          },
        },
      ]);
      prisma.guestGameReward.findMany.mockResolvedValue([
        {
          id: 'reward-yesterday-1',
          status: 'APPROVED',
          lootBoxId: 'loot-daily-session',
          missionId: null,
          seasonId: null,
          rewardType: 'BONUS_BALANCE',
          rewardAmount: new Prisma.Decimal(50),
          rewardLabel: '50 бонусов',
          rewardCode: null,
          qualifiedAt: new Date('2026-06-21T08:00:00.000Z'),
          expiresAt: null,
        },
        {
          id: 'reward-yesterday-2',
          status: 'APPROVED',
          lootBoxId: 'loot-daily-session',
          missionId: null,
          seasonId: null,
          rewardType: 'BONUS_BALANCE',
          rewardAmount: new Prisma.Decimal(50),
          rewardLabel: '50 бонусов',
          rewardCode: null,
          qualifiedAt: new Date('2026-06-21T08:30:00.000Z'),
          expiresAt: null,
        },
      ]);
      prisma.guestGameReward.count.mockResolvedValue(0);
      prisma.guestGameEvent.count.mockResolvedValue(0);
      guestGamificationService.dryRun.mockResolvedValue({
        rules: [
          {
            kind: 'LOOT_BOX',
            id: 'loot-daily-session',
            eligible: true,
            blockers: [],
          },
        ],
      });
      guestGamificationService.processEvent.mockResolvedValue({
        summary: {
          idempotent: false,
          createdRewards: 1,
          queuedRewardAmount: 50,
        },
        rewards: [{ rewardLabel: '50 бонусов' }],
      });

      try {
        await service.openLootBox('Bearer guest-token', 'loot-daily-session');
      } finally {
        jest.useRealTimers();
      }

      expect(guestGamificationService.dryRun).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          lootBoxId: 'loot-daily-session',
          occurredAt: '2026-06-21T08:00:00.000Z',
          limitOccurredAt: '2026-06-22T10:00:00.000Z',
        }),
      );
      expect(guestGamificationService.processEvent).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          lootBoxId: 'loot-daily-session',
          limitOccurredAt: '2026-06-22T10:00:00.000Z',
        }),
      );
    });

    it('ignores lootbox openings made before the rule was restarted', async () => {
      const { guestGamificationService, prisma, service } = createService({
        GUEST_GAME_REFERRAL_SECRET: 'referral-secret',
        WEB_URL: 'https://leetplus.ru',
      });
      const portal = portalPayloadFixture();
      mockGameSummarySession(service, portal);
      jest.spyOn(service as any, 'getTenantStoreByIds').mockResolvedValue({
        tenant: { id: 'tenant-1', name: 'Leet Clubs', slug: 'leet' },
        store: {
          id: portal.store.id,
          publicSlug: portal.store.publicSlug,
          name: portal.store.name,
          address: portal.store.address,
          externalDomain: null,
          integrationSourceId: null,
        },
      });
      jest
        .spyOn(service as any, 'findGuest')
        .mockResolvedValue({ id: 'guest-1' });
      jest.spyOn(service as any, 'findProfile').mockResolvedValue({
        id: portal.profile.id,
        guestId: 'guest-1',
      });
      prisma.guestGameLootBox.findFirst.mockResolvedValue({
        id: 'loot-app',
        tenantId: 'tenant-1',
        name: 'Daily app lootbox',
        status: 'ACTIVE',
        storeIds: [portal.store.id],
        triggerKind: 'APP_OPEN',
        limits: {
          perGuestPerWeek: 2,
          restartedAt: '2026-06-22T00:00:00.000Z',
        },
      });
      prisma.guestGameReward.findMany.mockResolvedValue([
        {
          id: 'reward-1',
          status: 'APPROVED',
          lootBoxId: 'loot-app',
          missionId: null,
          seasonId: null,
          rewardType: 'BONUS_BALANCE',
          rewardAmount: new Prisma.Decimal(50),
          rewardLabel: '50 бонусов',
          rewardCode: null,
          qualifiedAt: new Date('2026-06-21T12:00:00.000Z'),
          expiresAt: null,
        },
        {
          id: 'reward-2',
          status: 'APPROVED',
          lootBoxId: 'loot-app',
          missionId: null,
          seasonId: null,
          rewardType: 'BONUS_BALANCE',
          rewardAmount: new Prisma.Decimal(50),
          rewardLabel: '50 бонусов',
          rewardCode: null,
          qualifiedAt: new Date('2026-06-21T13:00:00.000Z'),
          expiresAt: null,
        },
      ]);
      guestGamificationService.dryRun.mockResolvedValue({
        rules: [
          {
            kind: 'LOOT_BOX',
            id: 'loot-app',
            eligible: true,
            blockers: [],
          },
        ],
      });
      guestGamificationService.processEvent.mockResolvedValue({
        summary: {
          idempotent: false,
          createdRewards: 1,
          queuedRewardAmount: 50,
        },
        rewards: [{ rewardLabel: '50 бонусов' }],
      });

      const result = await service.openLootBox(
        'Bearer guest-token',
        'loot-app',
      );

      expect(guestGamificationService.processEvent).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          lootBoxId: 'loot-app',
          sourceFactId: expect.stringMatching(
            /^profile-1:store-1:loot-app:20260622000000:\d{4}-\d{2}-\d{2}:1$/,
          ),
        }),
      );
      expect(result).toMatchObject({
        processed: true,
        createdRewards: 1,
      });
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

    it('limits mission board in game summary for expanded quests', async () => {
      const { service } = createService();
      const portal = portalPayloadFixture();
      const baseMission = portal.gamification.missions[0];
      portal.gamification.missions = Array.from({ length: 11 }, (_, index) => ({
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

      expect(summary.missions.total).toBe(11);
      expect(summary.missions.featured).toHaveLength(10);
      expect(summary.missions.featured.map((mission) => mission.id)).toEqual([
        'mission-1',
        'mission-2',
        'mission-3',
        'mission-4',
        'mission-5',
        'mission-6',
        'mission-7',
        'mission-8',
        'mission-9',
        'mission-10',
      ]);
    });
  });

  describe('selectGameClub', () => {
    it('issues a scoped guest token for the selected game club without creating a common guest', async () => {
      const { jwtService, prisma, service } = createService({
        GUEST_GAME_REFERRAL_SECRET: 'referral-secret',
        WEB_URL: 'https://leetplus.ru',
      });
      const tokenPayload = {
        sub: 'guest-portal:profile-1',
        purpose: 'guest_portal',
        tenantId: 'tenant-1',
        storeId: 'store-1',
        guestId: null,
        profileId: 'profile-1',
        phoneHash: 'phone-hash-1',
        exp: 1781860000,
        iat: 1781850000,
        nbf: 1781850000,
      };
      const targetProfile = {
        id: 'profile-2',
        guestId: null,
        phoneHash: 'phone-hash-1',
        displayName: 'Игрок 1337',
        contactMasked: '+7 *** **-11',
        phoneConsentStatus: 'GRANTED',
        phoneConsentSource: 'guest_portal_game_consent',
        phoneConsentAt: new Date('2026-06-15T08:00:00.000Z'),
        unsubscribedAt: null,
      };
      const portal = {
        ...portalPayloadFixture(),
        tenant: { name: 'Leet Clubs', slug: 'leet' },
        store: {
          id: 'store-2',
          publicSlug: 'club-2',
          name: 'Club 2',
          address: 'ул. Мира, 2',
        },
        profile: {
          ...portalPayloadFixture().profile,
          id: targetProfile.id,
        },
      };

      jest
        .spyOn(service as any, 'verifyGuestToken')
        .mockResolvedValue(tokenPayload);
      jest.spyOn(service as any, 'getTenantStore').mockResolvedValue({
        tenant: { id: 'tenant-1', name: 'Leet Clubs', slug: 'leet' },
        store: {
          id: 'store-2',
          publicSlug: 'club-2',
          name: 'Club 2',
          address: 'ул. Мира, 2',
        },
      });
      jest
        .spyOn(service as any, 'ensureGamificationClubAvailable')
        .mockResolvedValue(undefined);
      jest
        .spyOn(service as any, 'findGuest')
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      jest
        .spyOn(service as any, 'findProfile')
        .mockResolvedValueOnce({
          ...targetProfile,
          id: 'profile-1',
        })
        .mockResolvedValueOnce(null);
      jest
        .spyOn(service as any, 'buildPortalPayload')
        .mockResolvedValue(portal);
      prisma.guestGameProfile.create.mockResolvedValue(targetProfile);
      jwtService.signAsync.mockResolvedValue('selected-club-token');

      const result = await service.selectGameClub('Bearer guest-token', {
        clubId: 'leet:club-2',
      });

      expect(prisma.guest.findFirst).not.toHaveBeenCalled();
      expect(prisma.guestGameProfile.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          guestId: undefined,
          phoneHash: 'phone-hash-1',
          status: 'ACTIVE',
        }),
      });
      expect(jwtService.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: 'game-club:profile-2:store-2',
          tenantId: 'tenant-1',
          storeId: 'store-2',
          guestId: null,
          profileId: 'profile-2',
          phoneHash: 'phone-hash-1',
        }),
        expect.any(Object),
      );
      expect(jwtService.signAsync.mock.calls[0][0]).not.toHaveProperty('exp');
      expect(jwtService.signAsync.mock.calls[0][0]).not.toHaveProperty('iat');
      expect(jwtService.signAsync.mock.calls[0][0]).not.toHaveProperty('nbf');
      expect(result).toMatchObject({
        token: 'selected-club-token',
        clubId: 'leet:club-2',
        portal,
        summary: {
          tenant: portal.tenant,
          store: portal.store,
          profile: portal.profile,
        },
      });
    });

    it('reactivates a profile already linked to the selected club guest', async () => {
      const { jwtService, prisma, service } = createService({
        GUEST_GAME_REFERRAL_SECRET: 'referral-secret',
        WEB_URL: 'https://leetplus.ru',
      });
      const tokenPayload = {
        sub: 'guest-portal:profile-1',
        purpose: 'guest_portal',
        tenantId: 'tenant-1',
        storeId: 'store-1',
        guestId: null,
        profileId: 'profile-1',
        phoneHash: 'phone-hash-1',
      };
      const targetGuest = {
        id: 'guest-2',
        externalGuestId: 'langame-2',
        fullNameMasked: 'Игрок 1337',
        phoneMasked: '+7 *** **-22',
        emailMasked: null,
      };
      const sourceProfile = {
        id: 'profile-1',
        guestId: null,
        phoneHash: 'phone-hash-1',
        displayName: 'Гость клуба',
        contactMasked: '+7 *** **-11',
        phoneConsentStatus: 'GRANTED',
        phoneConsentSource: 'guest_portal_game_consent',
        phoneConsentAt: new Date('2026-06-15T08:00:00.000Z'),
        unsubscribedAt: null,
      };
      const inactiveTargetProfile = {
        ...sourceProfile,
        id: 'profile-2',
        guestId: targetGuest.id,
        contactMasked: targetGuest.phoneMasked,
        status: 'INACTIVE',
      };
      const portal = {
        ...portalPayloadFixture(),
        tenant: { name: 'Leet Clubs', slug: 'leet' },
        store: {
          id: 'store-2',
          publicSlug: 'club-2',
          name: 'Club 2',
          address: 'ул. Мира, 2',
        },
        profile: {
          ...portalPayloadFixture().profile,
          id: inactiveTargetProfile.id,
        },
      };

      jest
        .spyOn(service as any, 'verifyGuestToken')
        .mockResolvedValue(tokenPayload);
      jest.spyOn(service as any, 'getTenantStore').mockResolvedValue({
        tenant: { id: 'tenant-1', name: 'Leet Clubs', slug: 'leet' },
        store: {
          id: 'store-2',
          publicSlug: 'club-2',
          name: 'Club 2',
          address: 'ул. Мира, 2',
        },
      });
      jest
        .spyOn(service as any, 'ensureGamificationClubAvailable')
        .mockResolvedValue(undefined);
      jest
        .spyOn(service as any, 'findGuest')
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(targetGuest);
      jest
        .spyOn(service as any, 'findProfile')
        .mockResolvedValueOnce(sourceProfile);
      jest
        .spyOn(service as any, 'buildPortalPayload')
        .mockResolvedValue(portal);
      prisma.guestGameProfile.findFirst.mockResolvedValueOnce(
        inactiveTargetProfile,
      );
      prisma.guestGameProfile.update.mockResolvedValue({
        ...inactiveTargetProfile,
        status: 'ACTIVE',
      });
      jwtService.signAsync.mockResolvedValue('selected-club-token');

      const result = await service.selectGameClub('Bearer guest-token', {
        clubId: 'leet:club-2',
      });

      expect(prisma.guestGameProfile.findFirst).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-1',
          guestId: targetGuest.id,
        },
        orderBy: { updatedAt: 'desc' },
      });
      expect(service['findProfile']).toHaveBeenCalledTimes(1);
      expect(prisma.guestGameProfile.create).not.toHaveBeenCalled();
      expect(prisma.guestGameProfile.update).toHaveBeenCalledWith({
        where: { id: inactiveTargetProfile.id },
        data: expect.objectContaining({
          guestId: targetGuest.id,
          phoneHash: 'phone-hash-1',
          status: 'ACTIVE',
        }),
      });
      expect(jwtService.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: 'game-club:profile-2:store-2',
          guestId: targetGuest.id,
          profileId: inactiveTargetProfile.id,
        }),
        expect.any(Object),
      );
      expect(result.clubId).toBe('leet:club-2');
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
          city: null,
          address: 'г. Ижевск, ул. Пушкинская, 217',
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
        coordinates: {
          total: 2,
          ready: 1,
          missing: 1,
          readyPercent: 50,
        },
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
      expect(directory.cities).toEqual(['Екатеринбург', 'Ижевск']);
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
        store: { city: 'Ижевск' },
        location: { city: 'Ижевск' },
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
        coordinates: {
          total: 2,
          ready: 1,
          missing: 1,
          readyPercent: 50,
        },
      });
      expect(nearbyDirectory.clubs).toHaveLength(1);
      expect(nearbyDirectory.clubs[0].id).toBe('leet:club-1337');
    });

    it('marks Telegram auth ready for the polling edge without API-side sender', async () => {
      const { prisma, service } = createService({
        GUEST_GAME_TELEGRAM_BOT_USERNAME: 'leetplusru_bot',
        GUEST_GAME_TELEGRAM_WEBHOOK_SECRET: 'telegram-secret',
        GUEST_GAME_TELEGRAM_WEBHOOK_REPLY_ENABLED: 'false',
        GUEST_GAME_TELEGRAM_MINI_APP_URL: 'https://tg.leetplus.ru/game/app',
        GUEST_GAME_TG_EDGE_SHARED_SECRET: 'edge-secret',
      });

      prisma.store.findMany.mockResolvedValue([
        {
          id: 'store-1',
          publicSlug: 'club-1337',
          name: '1337',
          city: 'Екатеринбург',
          address: 'ул. Ленина, 1',
          latitude: null,
          longitude: null,
          gamificationEnabled: true,
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: '46',
          tenant: {
            id: 'tenant-1',
            name: 'Leet Clubs',
            slug: 'leet',
          },
        },
      ]);
      prisma.guestGameMission.findMany.mockResolvedValue([]);
      prisma.guestGameLootBox.findMany.mockResolvedValue([]);
      prisma.guestGameSeason.findMany.mockResolvedValue([]);

      const directory = await service.getGamificationClubDirectory({});
      const telegramOption = directory.verification.options.find(
        (option) => option.channel === 'TELEGRAM_BOT',
      );

      expect(telegramOption).toMatchObject({
        rank: 1,
        role: 'PRIMARY',
        status: 'READY',
        statusLabel: 'готов',
        botUsername: 'leetplusru_bot',
        requiredEnv: [],
      });
      expect(telegramOption?.nextAction).toContain(
        'API-side sender не требуется',
      );
    });
  });

  describe('otp delivery', () => {
    it('sends production SMS OTP through SMS.ru without exposing api_id', async () => {
      const { prisma, service } = createService({
        APP_ENCRYPTION_KEY: 'test-secret',
        NODE_ENV: 'production',
        GUEST_PORTAL_OTP_REAL_SEND_ENABLED: 'true',
        GUEST_PORTAL_OTP_SMS_ENABLED: 'true',
        GUEST_PORTAL_OTP_SMS_RU_API_ID: 'smsru-api-id',
        GUEST_PORTAL_OTP_SMS_RU_TEST_MODE: 'true',
      });
      const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            status: 'OK',
            status_code: 100,
            sms: {
              '79999999999': {
                status: 'OK',
                status_code: 100,
                sms_id: 'sms-1',
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
      jest.spyOn(service as any, 'generateOtp').mockReturnValue('1234');

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

      const result = await service.startOtp('leet', 'club-1337', {
        phone: '+7 999 999-99-99',
        gameConsentAccepted: true,
      });

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('https://sms.ru/sms/send?'),
        { method: 'POST' },
      );
      const smsRuUrl = new URL(fetchMock.mock.calls[0][0] as string);
      expect(smsRuUrl.searchParams.get('api_id')).toBe('smsru-api-id');
      expect(smsRuUrl.searchParams.get('to')).toBe('79999999999');
      expect(smsRuUrl.searchParams.get('json')).toBe('1');
      expect(smsRuUrl.searchParams.get('ttl')).toBe('10');
      expect(smsRuUrl.searchParams.get('test')).toBe('1');
      expect(smsRuUrl.searchParams.get('msg')).toContain('1234');
      expect(prisma.guestPortalOtpChallenge.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: 'tenant-1',
            storeId: 'store-1',
            phoneMasked: '***9999',
            status: 'PENDING',
            deliveryChannel: 'SMS',
            deliveredAt: expect.any(Date),
          }),
        }),
      );
      expect(result.delivery).toMatchObject({
        channel: 'SMS',
        status: 'SENT',
        message: 'Код отправлен по SMS на ***9999.',
      });
      expect(JSON.stringify(result)).not.toContain('smsru-api-id');

      fetchMock.mockRestore();
    });

    it('blocks live SMS.ru OTP until controlled canary is enabled', async () => {
      const { prisma, service } = createService({
        APP_ENCRYPTION_KEY: 'test-secret',
        NODE_ENV: 'production',
        GUEST_PORTAL_OTP_REAL_SEND_ENABLED: 'true',
        GUEST_PORTAL_OTP_SMS_ENABLED: 'true',
        GUEST_PORTAL_OTP_SMS_RU_API_ID: 'smsru-api-id',
      });
      const fetchMock = jest.spyOn(globalThis, 'fetch');
      jest.spyOn(service as any, 'generateOtp').mockReturnValue('1234');

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

      const result = await service.startOtp('leet', 'club-1337', {
        phone: '+7 999 999-99-99',
        gameConsentAccepted: true,
      });

      expect(fetchMock).not.toHaveBeenCalled();
      expect(prisma.guestPortalOtpChallenge.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: 'tenant-1',
            storeId: 'store-1',
            phoneMasked: '***9999',
            status: 'DELIVERY_BLOCKED',
            deliveryChannel: 'SMS',
            deliveredAt: null,
          }),
        }),
      );
      expect(result.delivery).toMatchObject({
        channel: 'SMS',
        status: 'BLOCKED',
        requiredEnv: expect.arrayContaining([
          'GUEST_PORTAL_OTP_SMS_RU_TEST_MODE or GUEST_PORTAL_OTP_SMS_RU_LIVE_CANARY_ENABLED',
        ]),
      });
      expect(JSON.stringify(result)).not.toContain('smsru-api-id');

      fetchMock.mockRestore();
    });

    it('blocks SMS OTP when the phone rate limit is reached before provider call', async () => {
      const { prisma, service } = createService({
        APP_ENCRYPTION_KEY: 'test-secret',
        NODE_ENV: 'production',
        GUEST_PORTAL_OTP_REAL_SEND_ENABLED: 'true',
        GUEST_PORTAL_OTP_SMS_ENABLED: 'true',
        GUEST_PORTAL_OTP_SMS_RU_API_ID: 'smsru-api-id',
        GUEST_PORTAL_OTP_SMS_RU_LIVE_CANARY_ENABLED: 'true',
        GUEST_PORTAL_OTP_SMS_RATE_LIMIT_PHONE_WINDOW_MINUTES: '60',
        GUEST_PORTAL_OTP_SMS_RATE_LIMIT_PHONE_MAX: '2',
      });
      const fetchMock = jest.spyOn(globalThis, 'fetch');

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
      prisma.guestPortalOtpChallenge.count.mockResolvedValueOnce(2);

      const promise = service.startOtp('leet', 'club-1337', {
        phone: '+7 999 999-99-99',
        gameConsentAccepted: true,
      });

      await expect(promise).rejects.toThrow(
        'Слишком много попыток. Попробуйте позже.',
      );
      await expect(promise).rejects.toMatchObject({ status: 429 });

      expect(fetchMock).not.toHaveBeenCalled();
      expect(prisma.guestPortalOtpChallenge.create).not.toHaveBeenCalled();
      expect(prisma.guestPortalOtpChallenge.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 'tenant-1',
            phoneHash: expect.any(String),
            deliveryChannel: 'SMS',
            createdAt: { gte: expect.any(Date) },
          }),
        }),
      );

      fetchMock.mockRestore();
    });

    it('blocks SMS OTP when the store rate limit is reached before provider call', async () => {
      const { prisma, service } = createService({
        APP_ENCRYPTION_KEY: 'test-secret',
        NODE_ENV: 'production',
        GUEST_PORTAL_OTP_REAL_SEND_ENABLED: 'true',
        GUEST_PORTAL_OTP_SMS_ENABLED: 'true',
        GUEST_PORTAL_OTP_SMS_RU_API_ID: 'smsru-api-id',
        GUEST_PORTAL_OTP_SMS_RU_LIVE_CANARY_ENABLED: 'true',
        GUEST_PORTAL_OTP_SMS_RATE_LIMIT_STORE_WINDOW_MINUTES: '10',
        GUEST_PORTAL_OTP_SMS_RATE_LIMIT_STORE_MAX: '4',
      });
      const fetchMock = jest.spyOn(globalThis, 'fetch');

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
      prisma.guestPortalOtpChallenge.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(4);

      const promise = service.startOtp('leet', 'club-1337', {
        phone: '+7 999 999-99-99',
        gameConsentAccepted: true,
      });

      await expect(promise).rejects.toThrow(
        'Слишком много попыток. Попробуйте позже.',
      );
      await expect(promise).rejects.toMatchObject({ status: 429 });

      expect(fetchMock).not.toHaveBeenCalled();
      expect(prisma.guestPortalOtpChallenge.create).not.toHaveBeenCalled();
      expect(prisma.guestPortalOtpChallenge.count).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 'tenant-1',
            storeId: 'store-1',
            deliveryChannel: 'SMS',
            createdAt: { gte: expect.any(Date) },
          }),
        }),
      );

      fetchMock.mockRestore();
    });

    it('blocks SMS OTP when the tenant SMS budget is reached before provider call', async () => {
      const { prisma, service } = createService({
        APP_ENCRYPTION_KEY: 'test-secret',
        NODE_ENV: 'production',
        GUEST_PORTAL_OTP_REAL_SEND_ENABLED: 'true',
        GUEST_PORTAL_OTP_SMS_ENABLED: 'true',
        GUEST_PORTAL_OTP_SMS_RU_API_ID: 'smsru-api-id',
        GUEST_PORTAL_OTP_SMS_RU_LIVE_CANARY_ENABLED: 'true',
        GUEST_PORTAL_OTP_SMS_RATE_LIMIT_TENANT_WINDOW_MINUTES: '1440',
        GUEST_PORTAL_OTP_SMS_RATE_LIMIT_TENANT_MAX: '5',
      });
      const fetchMock = jest.spyOn(globalThis, 'fetch');

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
      prisma.guestPortalOtpChallenge.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(5);

      const promise = service.startOtp('leet', 'club-1337', {
        phone: '+7 999 999-99-99',
        gameConsentAccepted: true,
      });

      await expect(promise).rejects.toThrow(
        'Слишком много попыток. Попробуйте позже.',
      );
      await expect(promise).rejects.toMatchObject({ status: 429 });

      expect(fetchMock).not.toHaveBeenCalled();
      expect(prisma.guestPortalOtpChallenge.create).not.toHaveBeenCalled();
      expect(prisma.guestPortalOtpChallenge.count).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 'tenant-1',
            deliveryChannel: 'SMS',
            createdAt: { gte: expect.any(Date) },
          }),
        }),
      );

      fetchMock.mockRestore();
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
        expect(result.reply).toBeUndefined();
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
        GUEST_GAME_TELEGRAM_BOT_USERNAME: 'leetplusru_bot',
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
        message:
          'Telegram contact подтвердил телефон. Гостевой игровой профиль готов к выдаче browser session.',
        reply: {
          provider: 'TELEGRAM',
          method: 'sendMessage',
          chatIdMasked: 'ch...56',
          text: expect.stringContaining('Вернитесь на сайт LeetPlus'),
          replyMarkup: {
            inline_keyboard: [
              [
                {
                  text: 'Вернуться на сайт LeetPlus',
                  url: 'http://localhost:3000/game/clubs',
                },
              ],
              [
                {
                  text: 'Открыть Mini App',
                  web_app: {
                    url: 'http://localhost:3000/game/app',
                  },
                },
              ],
              [
                {
                  text: 'Продолжить в боте',
                  callback_data: 'bot:menu',
                },
              ],
            ],
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

    it('answers Telegram /start without auth payload with safe club-selection guidance', async () => {
      const { prisma, service } = createService({
        GUEST_GAME_TELEGRAM_LINK_SECRET: 'telegram-secret',
        GUEST_GAME_TELEGRAM_MINI_APP_URL: 'https://tg.leetplus.ru/game/app',
        WEB_URL: 'https://leetplus.ru',
      });

      const result = await service.handleTelegramWebhook('telegram-secret', {
        message: {
          text: '/start',
          chat: { id: 123456 },
          from: { id: 123456 },
        },
      });

      expect(prisma.guestGameProfile.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            telegramIdentity: 'chat:123456',
          }),
        }),
      );
      expect(result).toMatchObject({
        status: 'IGNORED',
        action: 'TELEGRAM_BOT_MENU',
        profileId: null,
        telegramIdentityMasked: 'ch...56',
        reply: {
          provider: 'TELEGRAM',
          method: 'sendMessage',
          text: expect.stringContaining('выберите клуб'),
          replyMarkup: {
            inline_keyboard: [
              [
                {
                  text: 'Профиль',
                  callback_data: 'bot:profile',
                },
                {
                  text: 'Квесты',
                  callback_data: 'bot:quests',
                },
              ],
              [
                {
                  text: 'Награды',
                  callback_data: 'bot:rewards',
                },
                {
                  text: 'Меню',
                  callback_data: 'bot:menu',
                },
              ],
              [
                {
                  text: 'Выбрать клуб',
                  callback_data: 'bot:clubs',
                },
              ],
              [
                {
                  text: 'Открыть Mini App',
                  web_app: {
                    url: 'https://tg.leetplus.ru/game/app',
                  },
                },
              ],
              [
                {
                  text: 'Вернуться на сайт LeetPlus',
                  url: 'https://leetplus.ru/game/clubs',
                },
              ],
              [
                {
                  text: 'Помощь',
                  callback_data: '/help',
                },
                {
                  text: 'Отписаться',
                  callback_data: '/stop',
                },
              ],
            ],
          },
        },
      });
      expect(result.reply?.text).toEqual(expect.not.stringContaining('chat:'));
      expect(result.reply?.text).toEqual(expect.not.stringContaining('123456'));
    });

    it('answers Telegram /help with the bot action menu', async () => {
      const { prisma, service } = createService({
        GUEST_GAME_TELEGRAM_LINK_SECRET: 'telegram-secret',
        GUEST_GAME_TELEGRAM_MINI_APP_URL: 'https://tg.leetplus.ru/game/app',
        WEB_URL: 'https://leetplus.ru',
      });

      const result = await service.handleTelegramWebhook('telegram-secret', {
        message: {
          text: '/help',
          chat: { id: 123456 },
          from: { id: 123456 },
        },
      });

      expect(prisma.guestGameProfile.findFirst).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        status: 'IGNORED',
        action: 'TELEGRAM_BOT_HELP',
        profileId: null,
        reply: {
          text: expect.stringContaining('Доступные действия'),
          replyMarkup: {
            inline_keyboard: expect.any(Array),
          },
        },
      });
      expect(result.reply?.text).toEqual(expect.not.stringContaining('chat:'));
    });

    it('answers Telegram /status callback with the bot menu', async () => {
      const { prisma, service } = createService({
        GUEST_GAME_TELEGRAM_LINK_SECRET: 'telegram-secret',
        GUEST_GAME_TELEGRAM_MINI_APP_URL: 'https://tg.leetplus.ru/game/app',
        WEB_URL: 'https://leetplus.ru',
      });

      const result = await service.handleTelegramWebhook('telegram-secret', {
        callback_query: {
          id: 'callback-1',
          from: { id: 123456 },
          message: {
            chat: { id: 123456 },
          },
          data: '/status',
        },
      });

      expect(prisma.guestGameProfile.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            telegramIdentity: 'chat:123456',
          }),
        }),
      );
      expect(result).toMatchObject({
        status: 'IGNORED',
        action: 'TELEGRAM_BOT_MENU',
        telegramIdentityMasked: 'ch...56',
        reply: {
          provider: 'TELEGRAM',
          method: 'sendMessage',
          replyMarkup: {
            inline_keyboard: expect.any(Array),
          },
        },
      });
    });

    it('falls back to Telegram menu for unrecognized callback buttons', async () => {
      const { prisma, service } = createService({
        GUEST_GAME_TELEGRAM_LINK_SECRET: 'telegram-secret',
        GUEST_GAME_TELEGRAM_MINI_APP_URL: 'https://tg.leetplus.ru/game/app',
        WEB_URL: 'https://leetplus.ru',
      });

      const result = await service.handleTelegramWebhook('telegram-secret', {
        callback_query: {
          id: 'callback-2',
          from: { id: 123456 },
          message: {
            chat: { id: 123456 },
          },
          data: 'continue-in-bot',
        },
      });

      expect(prisma.guestGameProfile.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            telegramIdentity: 'chat:123456',
          }),
        }),
      );
      expect(result).toMatchObject({
        status: 'IGNORED',
        action: 'TELEGRAM_BOT_MENU',
        telegramIdentityMasked: 'ch...56',
        reply: { method: 'sendMessage' },
      });
    });

    it('answers Continue in bot with safe linked profile state and actions', async () => {
      const { prisma, service } = createService({
        GUEST_GAME_TELEGRAM_LINK_SECRET: 'telegram-secret',
        GUEST_GAME_TELEGRAM_MINI_APP_URL: 'https://tg.leetplus.ru/game/app',
        WEB_URL: 'https://leetplus.ru',
      });

      const { buildPortalPayload } = mockTelegramBotLinkedProfile(
        prisma,
        service,
      );

      const result = await service.handleTelegramWebhook('telegram-secret', {
        message: {
          text: 'Продолжить в боте',
          chat: { id: 123456 },
          from: { id: 123456 },
        },
      });

      expect(result).toMatchObject({
        status: 'CONFIRMED',
        action: 'TELEGRAM_BOT_MENU',
        profileId: 'profile-1',
        telegramIdentityMasked: 'ch...56',
        reply: {
          text: expect.stringContaining('LeetPlus bot'),
          replyMarkup: {
            inline_keyboard: expect.any(Array),
          },
        },
      });
      expect(buildPortalPayload).toHaveBeenCalledWith(
        expect.objectContaining({
          guestId: 'guest-1',
          phoneHash: 'phone-hash',
          profileId: 'profile-1',
          storeId: 'store-1',
        }),
        { refreshLiveBalances: true },
      );
      expect(result.reply?.text).toEqual(
        expect.stringContaining('Клуб: 1337.'),
      );
      expect(result.reply?.text).toEqual(
        expect.stringContaining('Уровень: 3.'),
      );
      expect(result.reply?.text).toEqual(
        expect.stringContaining('Баланс: 100 ₽; бонусы: 250.'),
      );
      expect(result.reply?.text).toEqual(
        expect.stringContaining('Награды: готово 1'),
      );
      expect(result.reply?.text).toEqual(expect.not.stringContaining('chat:'));
      expect(result.reply?.text).toEqual(
        expect.not.stringContaining('profile-1'),
      );
      expect(result.reply?.text).toEqual(expect.not.stringContaining('LP-123'));
    });

    it('answers Telegram profile callback with safe profile details and Mini App deeplink', async () => {
      const { prisma, service } = createService({
        GUEST_GAME_TELEGRAM_LINK_SECRET: 'telegram-secret',
        GUEST_GAME_TELEGRAM_MINI_APP_URL: 'https://tg.leetplus.ru/game/app',
        WEB_URL: 'https://leetplus.ru',
      });
      mockTelegramBotLinkedProfile(prisma, service);

      const result = await service.handleTelegramWebhook('telegram-secret', {
        callback_query: {
          id: 'callback-profile',
          from: { id: 123456 },
          message: {
            chat: { id: 123456 },
          },
          data: 'bot:profile',
        },
      });
      const buttons = (result.reply?.replyMarkup as any).inline_keyboard.flat();

      expect(result).toMatchObject({
        status: 'CONFIRMED',
        action: 'TELEGRAM_BOT_PROFILE',
        profileId: 'profile-1',
        reply: {
          text: expect.stringContaining('Профиль LeetPlus'),
        },
      });
      expect(result.reply?.text).toEqual(
        expect.stringContaining('Телефон: +7 *** **-11.'),
      );
      expect(result.reply?.text).toEqual(
        expect.stringContaining('Согласие: подтверждено.'),
      );
      expect(result.reply?.text).toEqual(
        expect.stringContaining('Баланс: 100 ₽.'),
      );
      expect(result.reply?.text).toEqual(
        expect.stringContaining('Бонусные баллы: 250.'),
      );
      expect(
        buttons.find((button: any) => button.text === 'Открыть Mini App'),
      ).toMatchObject({
        web_app: {
          url: 'https://tg.leetplus.ru/game/app?tab=profile',
        },
      });
      expect(result.reply?.text).toEqual(expect.not.stringContaining('chat:'));
      expect(result.reply?.text).toEqual(expect.not.stringContaining('123456'));
      expect(result.reply?.text).toEqual(
        expect.not.stringContaining('profile-1'),
      );
    });

    it('answers Telegram quests callback with mission progress and no raw ids', async () => {
      const { prisma, service } = createService({
        GUEST_GAME_TELEGRAM_LINK_SECRET: 'telegram-secret',
        GUEST_GAME_TELEGRAM_MINI_APP_URL: 'https://tg.leetplus.ru/game/app',
        WEB_URL: 'https://leetplus.ru',
      });
      mockTelegramBotLinkedProfile(prisma, service);

      const result = await service.handleTelegramWebhook('telegram-secret', {
        callback_query: {
          id: 'callback-quests',
          from: { id: 123456 },
          message: {
            chat: { id: 123456 },
          },
          data: 'bot:quests',
        },
      });
      const buttons = (result.reply?.replyMarkup as any).inline_keyboard.flat();

      expect(result).toMatchObject({
        status: 'CONFIRMED',
        action: 'TELEGRAM_BOT_QUESTS',
        reply: {
          text: expect.stringContaining('Квесты LeetPlus'),
        },
      });
      expect(result.reply?.text).toEqual(
        expect.stringContaining('Сыграй 2 часа'),
      );
      expect(result.reply?.text).toEqual(expect.stringContaining('1/2 час'));
      expect(result.reply?.text).toEqual(expect.stringContaining('+80 XP'));
      expect(
        buttons.find((button: any) => button.text === 'Открыть Mini App'),
      ).toMatchObject({
        web_app: {
          url: 'https://tg.leetplus.ru/game/app?tab=quests',
        },
      });
      expect(result.reply?.text).toEqual(expect.not.stringContaining('chat:'));
      expect(result.reply?.text).toEqual(
        expect.not.stringContaining('mission-1'),
      );
      expect(result.reply?.text).toEqual(
        expect.not.stringContaining('play-first-hour'),
      );
    });

    it('answers Telegram rewards callback without reward code or claim payload', async () => {
      const { prisma, service } = createService({
        GUEST_GAME_TELEGRAM_LINK_SECRET: 'telegram-secret',
        GUEST_GAME_TELEGRAM_MINI_APP_URL: 'https://tg.leetplus.ru/game/app',
        WEB_URL: 'https://leetplus.ru',
      });
      mockTelegramBotLinkedProfile(prisma, service);

      const result = await service.handleTelegramWebhook('telegram-secret', {
        callback_query: {
          id: 'callback-rewards',
          from: { id: 123456 },
          message: {
            chat: { id: 123456 },
          },
          data: 'bot:rewards',
        },
      });
      const buttons = (result.reply?.replyMarkup as any).inline_keyboard.flat();

      expect(result).toMatchObject({
        status: 'CONFIRMED',
        action: 'TELEGRAM_BOT_REWARDS',
        reply: {
          text: expect.stringContaining('Награды LeetPlus'),
        },
      });
      expect(result.reply?.text).toEqual(expect.stringContaining('Готово: 1'));
      expect(result.reply?.text).toEqual(
        expect.stringContaining('100 бонусов: готово'),
      );
      expect(result.reply?.text).toEqual(
        expect.stringContaining('50 бонусов: на проверке'),
      );
      expect(
        buttons.find((button: any) => button.text === 'Открыть Mini App'),
      ).toMatchObject({
        web_app: {
          url: 'https://tg.leetplus.ru/game/app?tab=rewards',
        },
      });
      expect(result.reply?.text).toEqual(expect.not.stringContaining('LP-123'));
      expect(result.reply?.text).toEqual(
        expect.not.stringContaining('reward-1'),
      );
      expect(result.reply?.text).toEqual(
        expect.not.stringContaining('claimPayload'),
      );
    });

    it('answers Telegram check-in callback when the selected club supports it', async () => {
      const { guestGamificationService, prisma, service } = createService({
        GUEST_GAME_TELEGRAM_LINK_SECRET: 'telegram-secret',
        GUEST_GAME_TELEGRAM_MINI_APP_URL: 'https://tg.leetplus.ru/game/app',
        WEB_URL: 'https://leetplus.ru',
      });
      const portal = portalPayloadFixture();
      prisma.tenant.findFirst.mockResolvedValue({
        id: 'tenant-1',
        name: 'LeetPlus',
        slug: 'demo',
        stores: [
          {
            id: 'store-1',
            publicSlug: 'club-1337',
            name: '1337',
            address: 'ул. Ленина, 1',
            externalDomain: '1337.langame.ru',
            externalClubId: '1',
            integrationSourceId: null,
          },
        ],
      });
      prisma.guest.findFirst.mockResolvedValue({
        id: 'guest-1',
        tenantId: 'tenant-1',
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: '1337.langame.ru',
        externalGuestTypeId: null,
        externalGuestId: '42',
        phoneHash: 'phone-hash',
        phoneMasked: '+7 *** **-11',
        currentCountHours: null,
        lastSyncedAt: new Date('2026-06-15T08:00:00.000Z'),
        isDisabled: false,
      });
      portal.gamification.nextActions.unshift({
        id: 'check-in:mission-check-in',
        kind: 'CHECK_IN',
        title: 'Сделайте чекин в клубе',
        description: '50 XP за чекин.',
        priority: 'HIGH',
        statusLabel: 'доступно',
        progressPercent: 0,
        anchor: 'progress',
      });
      mockTelegramBotLinkedProfile(prisma, service, portal);

      const result = await service.handleTelegramWebhook('telegram-secret', {
        callback_query: {
          id: 'callback-check-in',
          from: { id: 123456 },
          message: {
            chat: { id: 123456 },
          },
          data: 'bot:checkin',
        },
      });
      const buttons = (result.reply?.replyMarkup as any).inline_keyboard.flat();

      expect(result).toMatchObject({
        status: 'CONFIRMED',
        action: 'TELEGRAM_BOT_CHECK_IN',
        reply: {
          text: expect.stringContaining('Чекин LeetPlus'),
        },
      });
      expect(result.reply?.text).toEqual(
        expect.stringContaining('Чекин подтвержден и учтен.'),
      );
      expect(result.reply?.text).toEqual(
        expect.stringContaining('XP начислено: +50.'),
      );
      expect(guestGamificationService.checkIn).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'telegram-bot:profile-1:store-1',
          tenantId: 'tenant-1',
          tenantSlug: 'demo',
        }),
        {
          guestId: 'guest-1',
          note: 'Чекин гостя из Telegram-бота.',
          storeId: 'store-1',
        },
      );
      expect(
        buttons.find((button: any) => button.text === 'Чекин'),
      ).toMatchObject({
        callback_data: 'bot:checkin',
      });
      expect(result.reply?.text).toEqual(expect.not.stringContaining('chat:'));
      expect(result.reply?.text).toEqual(
        expect.not.stringContaining('mission-check-in'),
      );
    });

    it('answers Telegram clubs callback with safe linked city choices', async () => {
      const { prisma, service } = createService({
        APP_ENCRYPTION_KEY: 'test-secret',
        GUEST_GAME_TELEGRAM_LINK_SECRET: 'telegram-secret',
        GUEST_GAME_TELEGRAM_MINI_APP_URL: 'https://tg.leetplus.ru/game/app',
        WEB_URL: 'https://leetplus.ru',
      });
      prisma.guestGameProfile.findMany.mockResolvedValue(
        telegramBotClubProfilesFixture(),
      );
      prisma.store.findMany.mockResolvedValue(telegramBotLinkedStoresFixture());

      const result = await service.handleTelegramWebhook('telegram-secret', {
        callback_query: {
          id: 'callback-clubs',
          from: { id: 123456 },
          message: {
            chat: { id: 123456 },
          },
          data: 'bot:clubs',
        },
      });
      const buttons = (result.reply?.replyMarkup as any).inline_keyboard.flat();
      const cityButtons = buttons.filter((button: any) =>
        String(button.callback_data ?? '').startsWith('bot:city:'),
      );

      expect(result).toMatchObject({
        status: 'CONFIRMED',
        action: 'TELEGRAM_BOT_CITIES',
        profileId: 'profile-1',
        telegramIdentityMasked: 'ch...56',
        reply: {
          text: expect.stringContaining('Выберите город'),
        },
      });
      expect(result.reply?.text).toEqual(
        expect.stringContaining('Екатеринбург'),
      );
      expect(result.reply?.text).toEqual(expect.stringContaining('Челябинск'));
      expect(cityButtons).toHaveLength(2);
      expect(cityButtons[0]).toMatchObject({
        text: 'Екатеринбург (1 клуб)',
        callback_data: expect.stringMatching(/^bot:city:[A-Za-z0-9_-]{12,32}$/),
      });
      expect(JSON.stringify(result.reply)).toEqual(
        expect.not.stringContaining('profile-1'),
      );
      expect(JSON.stringify(result.reply)).toEqual(
        expect.not.stringContaining('store-1'),
      );
      expect(JSON.stringify(result.reply)).toEqual(
        expect.not.stringContaining('telegram-link-1'),
      );
      expect(JSON.stringify(result.reply)).toEqual(
        expect.not.stringContaining('chat:'),
      );
      expect(JSON.stringify(result.reply)).toEqual(
        expect.not.stringContaining('123456'),
      );
    });

    it('shows all active tenant clubs for a linked Telegram profile', async () => {
      const { guestGamificationService, prisma, service } = createService({
        APP_ENCRYPTION_KEY: 'test-secret',
        GUEST_GAME_TELEGRAM_LINK_SECRET: 'telegram-secret',
        GUEST_GAME_TELEGRAM_MINI_APP_URL: 'https://tg.leetplus.ru/game/app',
        WEB_URL: 'https://leetplus.ru',
      });
      const portal = portalPayloadFixture();
      portal.store.id = 'store-3';
      portal.store.publicSlug = 'club-izhevsk-center';
      portal.store.name = '1337 Izhevsk Center';
      prisma.tenant.findFirst.mockResolvedValue({
        id: 'tenant-1',
        name: 'LeetPlus',
        slug: 'demo',
        stores: [
          {
            id: 'store-3',
            publicSlug: 'club-izhevsk-center',
            name: '1337 Izhevsk Center',
            address: 'Pushkinskaya, 1',
            externalDomain: '46.langamepro.ru',
            externalClubId: '1',
            integrationSourceId: null,
          },
        ],
      });
      prisma.guest.findFirst.mockResolvedValue({
        id: 'guest-1',
        tenantId: 'tenant-1',
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: '46.langamepro.ru',
        externalGuestTypeId: null,
        externalGuestId: '633280',
        phoneHash: 'phone-hash',
        phoneMasked: '+7 *** **-11',
        currentCountHours: null,
        lastSyncedAt: new Date('2026-06-15T08:00:00.000Z'),
        isDisabled: false,
      });
      guestGamificationService.checkIn.mockResolvedValue({
        checkedIn: true,
        checkedAt: '2026-06-15T08:10:00.000Z',
        liveSession: {
          externalDomain: '46.langamepro.ru',
          externalSessionId: 'session-izhevsk-1',
          externalUuid: null,
          startedAt: '2026-06-15T08:00:00.000Z',
          durationMinutes: 10,
          sessionType: 'COMMON',
          sessionPacket: false,
          store: { id: 'store-3', name: '1337 Izhevsk Center' },
        },
        processResult: {
          event: {
            profile: { id: 'profile-1' },
          },
          summary: {
            appliedXpDelta: 50,
            createdRewards: 1,
            idempotent: false,
          },
        },
      });
      portal.gamification.nextActions.unshift({
        id: 'check-in:mission-check-in',
        kind: 'CHECK_IN',
        title: 'Check in at Izhevsk Center',
        description: '50 XP for check-in.',
        priority: 'HIGH',
        statusLabel: 'available',
        progressPercent: 0,
        anchor: 'progress',
      });
      prisma.guestGameProfile.findFirst.mockResolvedValue({
        id: 'profile-1',
        tenantId: 'tenant-1',
        guestId: 'guest-1',
        phoneHash: 'phone-hash',
        contactMasked: '+7 *** **-11',
        phoneConsentStatus: 'GRANTED',
        phoneConsentAt: new Date('2026-06-15T08:00:00.000Z'),
        xp: 1250,
        level: 3,
        status: 'ACTIVE',
        unsubscribedAt: null,
      });
      prisma.guestGameProfile.findMany.mockResolvedValue(
        telegramBotClubProfilesFixture(),
      );
      prisma.store.findMany.mockResolvedValue(telegramBotTenantStoresFixture());
      const buildPortalPayload = jest
        .spyOn(service as any, 'buildPortalPayload')
        .mockResolvedValue(portal);

      const listResult = await service.handleTelegramWebhook(
        'telegram-secret',
        {
          callback_query: {
            id: 'callback-clubs',
            from: { id: 123456 },
            message: {
              chat: { id: 123456 },
            },
            data: 'bot:clubs',
          },
        },
      );
      const cityButtons = (listResult.reply?.replyMarkup as any).inline_keyboard
        .flat()
        .filter((button: any) =>
          String(button.callback_data ?? '').startsWith('bot:city:'),
        );

      expect(cityButtons).toHaveLength(2);
      expect(cityButtons.map((button: any) => button.text)).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/^Ekaterinburg \(2 /),
          expect.stringMatching(/^Izhevsk \(2 /),
        ]),
      );
      const izhevskCallbackData = cityButtons.find((button: any) =>
        String(button.text).startsWith('Izhevsk '),
      ).callback_data;

      const cityResult = await service.handleTelegramWebhook(
        'telegram-secret',
        {
          callback_query: {
            id: 'callback-city',
            from: { id: 123456 },
            message: {
              chat: { id: 123456 },
            },
            data: izhevskCallbackData,
          },
        },
      );
      const clubButtons = (cityResult.reply?.replyMarkup as any).inline_keyboard
        .flat()
        .filter((button: any) =>
          String(button.callback_data ?? '').startsWith('bot:club:'),
        );

      expect(cityResult).toMatchObject({
        status: 'CONFIRMED',
        action: 'TELEGRAM_BOT_CITY_CLUBS',
        profileId: 'profile-1',
      });
      expect(clubButtons.map((button: any) => button.text)).toEqual(
        expect.arrayContaining([
          '1337 Izhevsk Center, Pushkinskaya, 1',
          '1337 Izhevsk Mall, Sovetskaya, 2',
        ]),
      );
      const izhevskCenterCallbackData = clubButtons.find(
        (button: any) => button.text === '1337 Izhevsk Center, Pushkinskaya, 1',
      ).callback_data;

      const result = await service.handleTelegramWebhook('telegram-secret', {
        callback_query: {
          id: 'callback-club-select',
          from: { id: 123456 },
          message: {
            chat: { id: 123456 },
          },
          data: izhevskCenterCallbackData,
        },
      });

      expect(result).toMatchObject({
        status: 'CONFIRMED',
        action: 'TELEGRAM_BOT_CLUB_SELECTED',
        profileId: 'profile-1',
      });
      expect(
        prisma.guestGameTelegramLinkChallenge.update,
      ).not.toHaveBeenCalled();
      expect(buildPortalPayload).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: 'telegram-bot:profile-1:store-3',
          guestId: 'guest-1',
          phoneHash: 'phone-hash',
          profileId: 'profile-1',
          storeId: 'store-3',
          tenantId: 'tenant-1',
        }),
        { refreshLiveBalances: true },
      );
      const selectedButtons = (
        result.reply?.replyMarkup as any
      ).inline_keyboard.flat();
      const checkInCallbackData = selectedButtons.find(
        (button: any) => button.text === 'Чекин',
      ).callback_data;

      expect(checkInCallbackData).toMatch(/^bot:checkin:[A-Za-z0-9_-]{12,32}$/);

      const checkInResult = await service.handleTelegramWebhook(
        'telegram-secret',
        {
          callback_query: {
            id: 'callback-check-in-scoped',
            from: { id: 123456 },
            message: {
              chat: { id: 123456 },
            },
            data: checkInCallbackData,
          },
        },
      );

      expect(checkInResult).toMatchObject({
        status: 'CONFIRMED',
        action: 'TELEGRAM_BOT_CHECK_IN',
        profileId: 'profile-1',
      });
      expect(guestGamificationService.checkIn).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'telegram-bot:profile-1:store-3',
          tenantId: 'tenant-1',
        }),
        expect.objectContaining({
          guestId: 'guest-1',
          storeId: 'store-3',
        }),
      );
      expect(checkInResult.reply?.text).toEqual(
        expect.stringContaining('Чекин подтвержден и учтен.'),
      );
      expect(checkInResult.reply?.text).toEqual(
        expect.stringContaining('Клуб: 1337 Izhevsk Center.'),
      );
      expect(buildPortalPayload).toHaveBeenLastCalledWith(
        expect.objectContaining({
          sub: 'telegram-bot:profile-1:store-3',
          storeId: 'store-3',
          tenantId: 'tenant-1',
        }),
        { refreshLiveBalances: true },
      );
      expect(JSON.stringify(result.reply)).toEqual(
        expect.not.stringContaining('store-3'),
      );
      expect(JSON.stringify(result.reply)).toEqual(
        expect.not.stringContaining('profile-1'),
      );
    });

    it('selects a Telegram bot club callback and returns the scoped bot menu', async () => {
      const { prisma, service } = createService({
        APP_ENCRYPTION_KEY: 'test-secret',
        GUEST_GAME_TELEGRAM_LINK_SECRET: 'telegram-secret',
        GUEST_GAME_TELEGRAM_MINI_APP_URL: 'https://tg.leetplus.ru/game/app',
        WEB_URL: 'https://leetplus.ru',
      });
      const portal = portalPayloadFixture();
      portal.store.id = 'store-2';
      portal.store.publicSlug = 'club-arena';
      portal.store.name = 'Arena';
      prisma.guestGameProfile.findMany.mockResolvedValue(
        telegramBotClubProfilesFixture(),
      );
      prisma.store.findMany.mockResolvedValue(telegramBotLinkedStoresFixture());
      const buildPortalPayload = jest
        .spyOn(service as any, 'buildPortalPayload')
        .mockResolvedValue(portal);
      const listResult = await service.handleTelegramWebhook(
        'telegram-secret',
        {
          callback_query: {
            id: 'callback-clubs',
            from: { id: 123456 },
            message: {
              chat: { id: 123456 },
            },
            data: 'bot:clubs',
          },
        },
      );
      const cityButtons = (listResult.reply?.replyMarkup as any).inline_keyboard
        .flat()
        .filter((button: any) =>
          String(button.callback_data ?? '').startsWith('bot:city:'),
        );
      const chelyabinskCallbackData = cityButtons.find(
        (button: any) => button.text === 'Челябинск (1 клуб)',
      ).callback_data;

      const cityResult = await service.handleTelegramWebhook(
        'telegram-secret',
        {
          callback_query: {
            id: 'callback-city',
            from: { id: 123456 },
            message: {
              chat: { id: 123456 },
            },
            data: chelyabinskCallbackData,
          },
        },
      );
      const clubButtons = (cityResult.reply?.replyMarkup as any).inline_keyboard
        .flat()
        .filter((button: any) =>
          String(button.callback_data ?? '').startsWith('bot:club:'),
        );
      const arenaCallbackData = clubButtons.find(
        (button: any) => button.text === 'Arena, Мира, 7',
      ).callback_data;

      const result = await service.handleTelegramWebhook('telegram-secret', {
        callback_query: {
          id: 'callback-club-select',
          from: { id: 123456 },
          message: {
            chat: { id: 123456 },
          },
          data: arenaCallbackData,
        },
      });

      expect(cityResult).toMatchObject({
        status: 'CONFIRMED',
        action: 'TELEGRAM_BOT_CITY_CLUBS',
        profileId: 'profile-1',
        reply: {
          text: expect.stringContaining('Город: Челябинск.'),
        },
      });
      expect(clubButtons).toHaveLength(1);
      expect(prisma.guestGameProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'profile-1' },
          data: expect.objectContaining({
            lastActivityAt: expect.any(Date),
          }),
        }),
      );
      expect(prisma.guestGameTelegramLinkChallenge.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'telegram-link-2' },
          data: expect.objectContaining({
            updatedAt: expect.any(Date),
          }),
        }),
      );
      expect(buildPortalPayload).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: 'telegram-bot:profile-1:store-2',
          guestId: 'guest-1',
          phoneHash: 'phone-hash',
          profileId: 'profile-1',
          storeId: 'store-2',
          tenantId: 'tenant-1',
        }),
        { refreshLiveBalances: true },
      );
      expect(result).toMatchObject({
        status: 'CONFIRMED',
        action: 'TELEGRAM_BOT_CLUB_SELECTED',
        profileId: 'profile-1',
        reply: {
          text: expect.stringContaining('Клуб выбран: Arena.'),
          replyMarkup: {
            inline_keyboard: expect.any(Array),
          },
        },
      });
      expect(result.reply?.text).toEqual(
        expect.stringContaining('Клуб: Arena'),
      );
      expect(result.reply?.text).toEqual(
        expect.not.stringContaining('store-2'),
      );
      expect(result.reply?.text).toEqual(
        expect.not.stringContaining('telegram-link-2'),
      );
      expect(result.reply?.text).toEqual(
        expect.not.stringContaining('profile-1'),
      );
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

    it('does not duplicate referral attribution when Telegram status is polled again', async () => {
      const { jwtService, prisma, service } = createService({
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
        status: 'AUTH_SESSION_ISSUED',
        expiresAt: new Date(Date.now() + 60_000),
        profile: {
          id: 'profile-1',
          guestId: null,
          phoneHash: 'phone-hash-1',
          telegramIdentity: 'chat:123456',
          contactMasked: '***2233',
        },
      });
      prisma.guestGameEvent.findFirst.mockResolvedValue({
        id: 'existing-referral-event',
      });
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
      expect(prisma.guestGameEvent.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 'tenant-1',
            source: 'GUEST_PORTAL_REFERRAL',
            externalId: 'telegram-auth:telegram-auth-1:referral',
          }),
        }),
      );
      expect(
        prisma.guestGameEvent.create.mock.calls.filter(
          ([call]: [any]) => call?.data?.eventType === 'GAME_REFERRAL_ACCEPTED',
        ),
      ).toHaveLength(0);
      expect(
        JSON.stringify(prisma.guestGameEvent.findFirst.mock.calls),
      ).not.toContain(referralCode);
    });

    it('exchanges valid Telegram Mini App initData for a guest session', async () => {
      const { jwtService, prisma, service } = createService({
        GUEST_GAME_TELEGRAM_BOT_TOKEN: 'telegram-token',
      });
      const portalPayload = {
        profile: { id: 'profile-1' },
      };

      jest
        .spyOn(service as any, 'buildPortalPayload')
        .mockResolvedValue(portalPayload);
      prisma.guestGameProfile.findMany.mockResolvedValue([
        {
          id: 'profile-1',
          guestId: null,
          phoneHash: 'phone-hash-1',
          contactMasked: '***2233',
          tenant: {
            id: 'tenant-1',
            slug: 'leet',
            name: 'Leet Clubs',
          },
          telegramLinkChallenges: [
            {
              id: 'telegram-auth-1',
              store: {
                id: 'store-1',
                publicSlug: 'club-1337',
                name: '1337',
                address: 'Lenina, 1',
              },
            },
          ],
        },
      ]);
      jwtService.signAsync.mockResolvedValue('guest-token');

      const result = await service.exchangeTelegramMiniAppSession({
        initData: buildTelegramMiniAppInitData(),
      });

      expect(prisma.guestGameProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            telegramIdentity: 'chat:123456',
            status: 'ACTIVE',
            phoneHash: { not: null },
          }),
        }),
      );
      expect(jwtService.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: 'telegram-mini-app:profile-1',
          tenantId: 'tenant-1',
          storeId: 'store-1',
          guestId: null,
          profileId: 'profile-1',
          phoneHash: 'phone-hash-1',
        }),
        expect.any(Object),
      );
      expect(result).toMatchObject({
        status: 'CONFIRMED',
        token: 'guest-token',
        portal: portalPayload,
        profileId: 'profile-1',
        phoneMasked: '***2233',
        telegramIdentityMasked: 'ch...56',
      });
      expect(JSON.stringify(result)).not.toContain('chat:123456');
    });

    it('accepts Telegram Mini App edge assertion without a bot token on the main API', async () => {
      const { jwtService, prisma, service } = createService({
        GUEST_GAME_TG_EDGE_SHARED_SECRET: 'edge-secret',
      });

      jest.spyOn(service as any, 'buildPortalPayload').mockResolvedValue({
        profile: { id: 'profile-1' },
      });
      prisma.guestGameProfile.findMany.mockResolvedValue([
        {
          id: 'profile-1',
          guestId: null,
          phoneHash: 'phone-hash-1',
          contactMasked: '***2233',
          tenant: {
            id: 'tenant-1',
            slug: 'leet',
            name: 'Leet Clubs',
          },
          telegramLinkChallenges: [
            {
              id: 'telegram-auth-1',
              store: {
                id: 'store-1',
                publicSlug: 'club-1337',
                name: '1337',
                address: 'Lenina, 1',
              },
            },
          ],
        },
      ]);
      jwtService.signAsync.mockResolvedValue('guest-token');

      const result = await service.exchangeTelegramMiniAppSession({
        edgeSecret: 'edge-secret',
        telegramUserId: '123456',
        authDate: Math.floor(Date.now() / 1000),
      });

      expect(result).toMatchObject({
        status: 'CONFIRMED',
        token: 'guest-token',
        profileId: 'profile-1',
        telegramIdentityMasked: 'ch...56',
      });
      expect(jwtService.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: 'telegram-mini-app:profile-1',
          tenantId: 'tenant-1',
          storeId: 'store-1',
        }),
        expect.any(Object),
      );
    });

    it('rejects Telegram Mini App initData with an invalid hash before profile lookup', async () => {
      const { jwtService, prisma, service } = createService({
        GUEST_GAME_TELEGRAM_BOT_TOKEN: 'telegram-token',
      });

      const result = await service.exchangeTelegramMiniAppSession({
        initData: buildTelegramMiniAppInitData({
          hashOverride:
            'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        }),
      });

      expect(result).toMatchObject({
        status: 'FAILED',
        profileId: null,
        telegramIdentityMasked: null,
      });
      expect(prisma.guestGameProfile.findMany).not.toHaveBeenCalled();
      expect(jwtService.signAsync).not.toHaveBeenCalled();
    });

    it('expires old Telegram Mini App initData by auth_date', async () => {
      const { jwtService, prisma, service } = createService({
        GUEST_GAME_TELEGRAM_BOT_TOKEN: 'telegram-token',
        GUEST_GAME_TELEGRAM_MINI_APP_INIT_DATA_TTL_SECONDS: '60',
      });

      const result = await service.exchangeTelegramMiniAppSession({
        initData: buildTelegramMiniAppInitData({
          authDate: Math.floor(Date.now() / 1000) - 120,
        }),
      });

      expect(result).toMatchObject({
        status: 'EXPIRED',
        profileId: null,
      });
      expect(prisma.guestGameProfile.findMany).not.toHaveBeenCalled();
      expect(jwtService.signAsync).not.toHaveBeenCalled();
    });

    it('requires Telegram contact-share before Mini App can open a game profile', async () => {
      const { jwtService, prisma, service } = createService({
        GUEST_GAME_TELEGRAM_BOT_TOKEN: 'telegram-token',
      });

      prisma.guestGameProfile.findMany.mockResolvedValue([]);

      const result = await service.exchangeTelegramMiniAppSession({
        initData: buildTelegramMiniAppInitData(),
      });

      expect(result).toMatchObject({
        status: 'AUTH_REQUIRED',
        profileId: null,
        telegramIdentityMasked: 'ch...56',
      });
      expect(jwtService.signAsync).not.toHaveBeenCalled();
    });

    it('returns safe club choices when Telegram identity has multiple game scopes', async () => {
      const { jwtService, prisma, service } = createService({
        GUEST_GAME_TELEGRAM_BOT_TOKEN: 'telegram-token',
      });

      prisma.guestGameProfile.findMany.mockResolvedValue([
        {
          id: 'profile-1',
          guestId: null,
          phoneHash: 'phone-hash-1',
          contactMasked: '***2233',
          tenant: {
            id: 'tenant-1',
            slug: 'leet',
            name: 'Leet Clubs',
          },
          telegramLinkChallenges: [
            {
              id: 'telegram-auth-1',
              store: {
                id: 'store-1',
                publicSlug: 'club-1337',
                name: '1337',
                address: 'Lenina, 1',
              },
            },
            {
              id: 'telegram-auth-2',
              store: {
                id: 'store-2',
                publicSlug: 'club-arena',
                name: 'Arena',
                address: 'Mira, 2',
              },
            },
          ],
        },
      ]);
      jwtService.signAsync.mockResolvedValue('guest-token');
      jest.spyOn(service as any, 'buildPortalPayload').mockResolvedValue({
        profile: { id: 'profile-1' },
      });

      const selectionRequired = await service.exchangeTelegramMiniAppSession({
        initData: buildTelegramMiniAppInitData(),
      });

      expect(selectionRequired).toMatchObject({
        status: 'CLUB_SELECTION_REQUIRED',
        clubs: [
          {
            clubId: 'leet:club-1337',
            storeName: '1337',
            profileId: 'profile-1',
          },
          {
            clubId: 'leet:club-arena',
            storeName: 'Arena',
            profileId: 'profile-1',
          },
        ],
      });
      expect(jwtService.signAsync).not.toHaveBeenCalled();

      const confirmed = await service.exchangeTelegramMiniAppSession({
        initData: buildTelegramMiniAppInitData(),
        clubId: 'leet:club-arena',
      });

      expect(confirmed).toMatchObject({
        status: 'CONFIRMED',
        token: 'guest-token',
        profileId: 'profile-1',
      });
      expect(jwtService.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          storeId: 'store-2',
        }),
        expect.any(Object),
      );
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
        freeCall: false,
        status: 'PENDING',
      });
    });

    it('starts SMS.ru callcheck without exposing provider secrets', async () => {
      const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            status: 'OK',
            status_code: 100,
            check_id: 'smsru-check-1',
            call_phone: '73430000000',
            call_phone_pretty: '+7 343 000-00-00',
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
      );
      const { prisma, service } = createService({
        APP_ENCRYPTION_KEY: 'test-secret',
        GUEST_PORTAL_USER_CALL_ENABLED: 'true',
        GUEST_PORTAL_USER_CALL_PROVIDER: 'SMS_RU_CALLCHECK',
        GUEST_PORTAL_USER_CALL_SMS_RU_API_ID: 'smsru-api-id',
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

      try {
        const result = await service.startUserCallAuth('leet', 'club-1337', {
          phone: '+7 999 999-99-99',
          gameConsentAccepted: true,
        });

        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining('https://sms.ru/callcheck/add?'),
          expect.objectContaining({ method: 'GET' }),
        );
        const callcheckAddUrl = fetchMock.mock.calls[0][0] as string;
        expect(callcheckAddUrl).toContain('phone=79999999999');
        expect(prisma.guestPortalOtpChallenge.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              status: 'PENDING',
              deliveryChannel: 'USER_CALL',
              providerName: 'SMS_RU_CALLCHECK',
              providerChallengeId: 'smsru-check-1',
            }),
          }),
        );
        expect(result).toMatchObject({
          phoneMasked: '***9999',
          callNumber: '+7 343 000-00-00',
          callHref: 'tel:73430000000',
          freeCall: true,
          status: 'PENDING',
        });
        expect(result.message).toContain(
          'Звонок будет сброшен сразу после проверки',
        );
        expect(result.message).not.toContain('SMS.ru');
        expect(JSON.stringify(result)).not.toContain('smsru-api-id');
      } finally {
        fetchMock.mockRestore();
      }
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

    it('issues a guest token when SMS.ru callcheck is confirmed by polling', async () => {
      const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            status: 'OK',
            status_code: 100,
            check_status: 401,
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
      );
      const { jwtService, prisma, service } = createService({
        APP_ENCRYPTION_KEY: 'test-secret',
        GUEST_PORTAL_USER_CALL_ENABLED: 'true',
        GUEST_PORTAL_USER_CALL_PROVIDER: 'SMS_RU_CALLCHECK',
        GUEST_PORTAL_USER_CALL_SMS_RU_API_ID: 'smsru-api-id',
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
        status: 'PENDING',
        deliveryChannel: 'USER_CALL',
        providerName: 'SMS_RU_CALLCHECK',
        providerChallengeId: 'smsru-check-1',
        expiresAt: new Date(Date.now() + 60_000),
        gameConsentAcceptedAt: new Date('2026-06-15T08:00:00.000Z'),
        gameConsentVersion: 'guest-game-v1-2026-06-15',
      });
      prisma.guestPortalOtpChallenge.update.mockResolvedValueOnce({
        id: 'call-auth-1',
        tenantId: 'tenant-1',
        storeId: 'store-1',
        guestId: null,
        profileId: null,
        phoneHash: 'phone-hash-1',
        phoneMasked: '***9999',
        status: 'CALL_CONFIRMED',
        deliveryChannel: 'USER_CALL',
        providerName: 'SMS_RU_CALLCHECK',
        providerChallengeId: 'smsru-check-1',
        expiresAt: new Date(Date.now() + 60_000),
        gameConsentAcceptedAt: new Date('2026-06-15T08:00:00.000Z'),
        gameConsentVersion: 'guest-game-v1-2026-06-15',
      });
      prisma.guestGameProfile.create.mockResolvedValue({
        id: 'profile-1',
        guestId: null,
      });
      jwtService.signAsync.mockResolvedValue('guest-token');

      try {
        const status = await service.getUserCallAuthStatus(
          'leet',
          'club-1337',
          {
            challengeId: 'call-auth-1',
          },
        );

        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining('https://sms.ru/callcheck/status?'),
          expect.objectContaining({ method: 'GET' }),
        );
        const callcheckStatusUrl = fetchMock.mock.calls[0][0] as string;
        expect(callcheckStatusUrl).toContain('check_id=smsru-check-1');
        expect(prisma.guestPortalOtpChallenge.update).toHaveBeenNthCalledWith(
          1,
          expect.objectContaining({
            where: { id: 'call-auth-1' },
            data: expect.objectContaining({
              status: 'CALL_CONFIRMED',
              deliveredAt: expect.any(Date),
              verifiedAt: expect.any(Date),
            }),
          }),
        );
        expect(prisma.guestPortalOtpChallenge.update).toHaveBeenLastCalledWith(
          expect.objectContaining({
            where: { id: 'call-auth-1' },
            data: expect.objectContaining({
              status: 'CALL_SESSION_ISSUED',
            }),
          }),
        );
        expect(status).toMatchObject({
          status: 'CONFIRMED',
          token: 'guest-token',
          profileId: 'profile-1',
          phoneMasked: '***9999',
        });
        expect(JSON.stringify(status)).not.toContain('smsru-api-id');
      } finally {
        fetchMock.mockRestore();
      }
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

    it('does not duplicate referral attribution when user-call status is polled again', async () => {
      const { jwtService, prisma, service } = createService({
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
        profileId: 'profile-1',
        phoneHash: 'phone-hash-1',
        phoneMasked: '***9999',
        status: 'CALL_SESSION_ISSUED',
        expiresAt: new Date(Date.now() + 60_000),
      });
      prisma.guestGameEvent.findFirst.mockResolvedValue({
        id: 'existing-referral-event',
      });
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
      expect(prisma.guestGameEvent.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 'tenant-1',
            source: 'GUEST_PORTAL_REFERRAL',
            externalId: 'user-call:call-auth-1:referral',
          }),
        }),
      );
      expect(
        prisma.guestGameEvent.create.mock.calls.filter(
          ([call]: [any]) => call?.data?.eventType === 'GAME_REFERRAL_ACCEPTED',
        ),
      ).toHaveLength(0);
      expect(
        JSON.stringify(prisma.guestGameEvent.findFirst.mock.calls),
      ).not.toContain(referralCode);
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

  describe('refreshPortalLiveBalances', () => {
    it('stores scoped Langame balances and returns fresh rows for bot replies', async () => {
      const { langameSettingsService, prisma, service } = createService();

      langameSettingsService.getGuestBalancesForPortal.mockResolvedValue({
        checkedAt: '2026-06-15T08:05:30.000Z',
        externalGuestId: '42',
        source: {
          id: 'source-1',
          name: '443.langame.ru',
          domain: '443.langame.ru',
          status: 'SUCCESS',
          errorMessage: null,
        },
        balance: 1234.56,
        bonusBalance: 250,
        balanceFound: true,
        bonusBalanceFound: true,
      });

      const result = await (service as any).refreshPortalLiveBalances({
        tenantId: 'tenant-1',
        guestId: 'guest-1',
        sourceDomain: '443.langame.ru',
        externalClubId: '1337',
        externalGuestId: '42',
      });

      expect(
        langameSettingsService.getGuestBalancesForPortal,
      ).toHaveBeenCalledWith('tenant-1', '443.langame.ru', '42');
      expect(prisma.guestBalanceSnapshot.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenantId_externalProvider_externalDomain_externalGuestId_snapshotDate:
              {
                tenantId: 'tenant-1',
                externalProvider: IntegrationProvider.LANGAME,
                externalDomain: '443.langame.ru',
                externalGuestId: '42',
                snapshotDate: new Date('2026-06-15T08:05:00.000Z'),
              },
          },
          create: expect.objectContaining({
            guestId: 'guest-1',
            balance: expect.any(Prisma.Decimal),
          }),
        }),
      );
      expect(prisma.guestBonusBalanceCurrent.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            tenantId: 'tenant-1',
            guestId: null,
            externalDomain: '443.langame.ru',
            externalGuestId: '42',
            bonusBalance: expect.any(Prisma.Decimal),
            source: 'LANGAME_LIVE',
            lastSyncedAt: new Date('2026-06-15T08:05:30.000Z'),
          }),
        }),
      );
      expect(prisma.guestBonusBalanceSnapshot.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            tenantId: 'tenant-1',
            guestId: 'guest-1',
            externalDomain: '443.langame.ru',
            externalGuestId: '42',
            bonusBalance: expect.any(Prisma.Decimal),
          }),
        }),
      );
      expect(result?.balanceSnapshot?.balance.toFixed(2)).toBe('1234.56');
      expect(result?.bonusBalanceCurrent?.bonusBalance.toFixed(2)).toBe(
        '250.00',
      );
    });
  });

  describe('buildPortalPayload guest matching', () => {
    it('matches a scoped Langame guest by local RU phone hash variant', async () => {
      const {
        langameSettingsService,
        prisma,
        secretEncryptionService,
        service,
      } = createService({
        APP_ENCRYPTION_KEY: 'test-secret',
      });
      const phoneHashTelegram = createHmac('sha256', 'test-secret')
        .update('79225219799')
        .digest('hex');
      const phoneHashLocal = createHmac('sha256', 'test-secret')
        .update('9225219799')
        .digest('hex');

      secretEncryptionService.decrypt.mockReturnValue('79225219799');
      prisma.tenant.findFirst.mockResolvedValue({
        id: 'tenant-1',
        name: 'LeetPlus',
        slug: 'demo',
        stores: [
          {
            id: 'store-pushkinskaya',
            publicSlug: 'pushkinskaya',
            name: '1337-Pushkinskaya',
            address: 'Pushkinskaya, 217',
            externalDomain: '46.langamepro.ru',
            externalClubId: '1',
            integrationSourceId: null,
          },
        ],
      });
      prisma.guest.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'guest-pushkinskaya',
          tenantId: 'tenant-1',
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: '46.langamepro.ru',
          externalGuestTypeId: null,
          externalGuestId: '633280',
          phoneHash: phoneHashLocal,
          phoneMasked: '***9799',
          currentCountHours: null,
          lastSyncedAt: new Date('2026-06-24T23:51:58.104Z'),
          isDisabled: false,
        });
      prisma.guestGameProfile.findFirst.mockResolvedValue({
        id: 'profile-telegram',
        tenantId: 'tenant-1',
        guestId: null,
        leadId: null,
        displayName: null,
        contactMasked: '***9799',
        phoneHash: phoneHashTelegram,
        phoneEncrypted: 'encrypted-phone',
        phoneConsentStatus: 'GRANTED',
        phoneConsentSource: 'telegram',
        phoneConsentAt: new Date('2026-06-25T08:00:00.000Z'),
        telegramIdentity: 'chat:123456',
        maxIdentity: null,
        unsubscribedAt: null,
        xp: 0,
        level: 1,
        status: 'ACTIVE',
        isStaffTest: false,
        staffTestReason: null,
        staffTestMatchedAt: null,
        lastActivityAt: null,
      });
      langameSettingsService.getGuestBalancesForPortal.mockResolvedValue({
        checkedAt: '2026-06-25T09:00:30.000Z',
        externalGuestId: '633280',
        source: {
          id: 'source-46',
          name: '46.langamepro.ru',
          domain: '46.langamepro.ru',
          status: 'SUCCESS',
          errorMessage: null,
        },
        balance: 321.5,
        bonusBalance: 42,
        balanceFound: true,
        bonusBalanceFound: true,
      });

      const portal = await (service as any).buildPortalPayload(
        {
          sub: 'telegram-bot:profile-telegram:store-pushkinskaya',
          purpose: 'guest_portal',
          tenantId: 'tenant-1',
          storeId: 'store-pushkinskaya',
          guestId: null,
          profileId: 'profile-telegram',
          phoneHash: phoneHashTelegram,
        },
        { refreshLiveBalances: true },
      );

      expect(prisma.guest.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            externalDomain: '46.langamepro.ru',
            phoneHash: {
              in: expect.arrayContaining([phoneHashTelegram, phoneHashLocal]),
            },
          }),
        }),
      );
      expect(
        langameSettingsService.getGuestBalancesForPortal,
      ).toHaveBeenCalledWith('tenant-1', '46.langamepro.ru', '633280');
      expect(portal.guestFound).toBe(true);
      expect(portal.loyalty.balance).toBe(321.5);
      expect(portal.loyalty.bonusBalance).toBe(42);
    });

    it('marks an audience-scoped lootbox as unavailable in the portal summary when the guest is outside the audience', async () => {
      const { prisma, service } = createService();

      jest.spyOn(service as any, 'getTenantStoreByIds').mockResolvedValue({
        tenant: { id: 'tenant-1', name: 'LeetPlus', slug: 'demo' },
        store: {
          id: 'store-1',
          publicSlug: 'pushkinskaya',
          name: '1337-Pushkinskaya',
          address: 'Pushkinskaya, 217',
          timeZone: 'Asia/Yekaterinburg',
          externalDomain: 'club-1',
          externalClubId: '1',
          integrationSourceId: null,
        },
      });
      jest.spyOn(service as any, 'findGuest').mockResolvedValue({
        id: 'guest-1',
        tenantId: 'tenant-1',
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: 'club-1',
        externalGuestId: 'lg-guest-1',
        externalGuestTypeId: null,
        phoneMasked: '***0646',
        emailMasked: null,
        fullNameMasked: null,
        phoneEncrypted: null,
        currentCountHours: null,
        lastSyncedAt: null,
        isDisabled: false,
      });
      jest.spyOn(service as any, 'findProfile').mockResolvedValue({
        id: 'profile-1',
        tenantId: 'tenant-1',
        guestId: 'guest-1',
        leadId: null,
        displayName: 'Guest One',
        contactMasked: '***0646',
        phoneHash: 'phone-hash',
        phoneEncrypted: null,
        phoneConsentStatus: 'GRANTED',
        phoneConsentSource: 'telegram',
        phoneConsentAt: new Date('2026-06-25T08:00:00.000Z'),
        telegramIdentity: null,
        maxIdentity: null,
        unsubscribedAt: null,
        xp: 0,
        level: 1,
        status: 'ACTIVE',
        isStaffTest: false,
        staffTestReason: null,
        staffTestMatchedAt: null,
        lastActivityAt: null,
      });
      prisma.guestGameLootBox.findMany.mockResolvedValue([
        {
          id: 'loot-audience',
          tenantId: 'tenant-1',
          name: 'Audience lootbox',
          status: 'ACTIVE',
          rewardType: 'BONUS_BALANCE',
          rewardLabel: '50 bonus points',
          manualApprovalRequired: false,
          note: null,
          storeIds: ['store-1'],
          audienceId: 'audience-vip',
          triggerKind: 'APP_OPEN',
          sessionType: null,
          limits: {},
          periodRules: {},
          probabilityRules: {},
        },
      ]);
      prisma.guestAudienceMember.findMany.mockResolvedValue([
        { audienceId: 'audience-regular' },
      ]);

      const portal = await (service as any).buildPortalPayload({
        sub: 'profile-1',
        purpose: 'guest_portal',
        tenantId: 'tenant-1',
        storeId: 'store-1',
        guestId: 'guest-1',
        profileId: 'profile-1',
        phoneHash: 'phone-hash',
      });

      expect(portal.gamification.lootBoxes).toHaveLength(1);
      expect(portal.gamification.lootBoxes[0]).toMatchObject({
        id: 'loot-audience',
        openState: 'WAITING_EVENT',
        openable: false,
        openBlocker: 'Лутбокс доступен другой аудитории гостей.',
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

    it('runs a club-scoped Langame auto-match once and stores the result', async () => {
      const { jwtService, langameSettingsService, prisma, service } =
        createService({
          APP_ENCRYPTION_KEY: 'test-secret',
        });
      const phone = '+7 999 111-22-33';
      const phoneHash = createHmac('sha256', 'test-secret')
        .update('79991112233')
        .digest('hex');

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
            externalDomain: '1337.langame.ru',
            integrationSourceId: 'source-1',
          },
        ],
      });
      prisma.guest.findFirst.mockResolvedValue(null);
      prisma.guestGameProfile.findFirst.mockResolvedValue({
        id: 'profile-1',
        guestId: null,
        phoneHash,
        contactMasked: '***2233',
        displayName: 'Гость клуба',
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

      const result = await service.matchLangameGuest('Bearer guest-token', {
        phone,
      });

      expect(result.status).toBe('FOUND_IN_LANGAME');
      expect(result.linkStatus).toBe('WAITING_FOR_SYNC');
      expect(
        langameSettingsService.searchGuestByPhoneForPortal,
      ).toHaveBeenCalledWith('tenant-1', '79991112233', {
        sourceDomain: '1337.langame.ru',
        sourceId: 'source-1',
      });
      expect(prisma.guestGameEvent.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [
            expect.objectContaining({
              tenantId: 'tenant-1',
              profileId: 'profile-1',
              eventType: 'GAME_PROFILE_LANGAME_AUTO_MATCH',
              source: 'GUEST_PORTAL_LANGAME_AUTO_MATCH',
              externalDomain: '1337.langame.ru',
              externalId: 'game-profile-langame-auto-match:profile-1:store-1',
              payload: expect.objectContaining({
                matchStatus: 'FOUND_IN_LANGAME',
                localStatus: 'FOUND_IN_LANGAME',
                sourceDomain: '1337.langame.ru',
                sourceId: 'source-1',
                phoneMasked: '***2233',
              }),
            }),
          ],
          skipDuplicates: true,
        }),
      );
    });

    it('uses a cached club auto-match event without calling Langame again', async () => {
      const { jwtService, langameSettingsService, prisma, service } =
        createService({
          APP_ENCRYPTION_KEY: 'test-secret',
        });
      const phone = '+7 999 111-22-33';
      const phoneHash = createHmac('sha256', 'test-secret')
        .update('79991112233')
        .digest('hex');

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
            externalDomain: '1337.langame.ru',
            integrationSourceId: 'source-1',
          },
        ],
      });
      prisma.guest.findFirst.mockResolvedValue(null);
      prisma.guestGameProfile.findFirst.mockResolvedValue({
        id: 'profile-1',
        guestId: null,
        phoneHash,
        contactMasked: '***2233',
        displayName: 'Гость клуба',
      });
      prisma.guestGameEvent.findFirst.mockResolvedValue({
        id: 'event-1',
        profileId: 'profile-1',
        guestId: null,
        occurredAt: new Date('2026-06-15T08:00:00.000Z'),
        payload: {
          checkedAt: '2026-06-15T08:00:00.000Z',
          phoneMasked: '+7 999 ***-**-33',
          matchStatus: 'FOUND_IN_LANGAME',
          localStatus: 'FOUND_IN_LANGAME',
          linkStatus: 'WAITING_FOR_SYNC',
          localGuestId: null,
          linkedGuestId: null,
          linkedProfileId: 'profile-1',
          backfilled: {
            rewards: 0,
            events: 0,
            deliveries: 0,
            bonusLedgerEntries: 0,
          },
          sources: [],
        },
      });

      const result = await service.matchLangameGuest('Bearer guest-token', {
        phone,
      });

      expect(result.status).toBe('FOUND_IN_LANGAME');
      expect(result.linkStatus).toBe('WAITING_FOR_SYNC');
      expect(
        langameSettingsService.searchGuestByPhoneForPortal,
      ).not.toHaveBeenCalled();
      expect(prisma.guestGameEvent.createMany).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: [
            expect.objectContaining({
              eventType: 'GAME_PROFILE_LANGAME_AUTO_MATCH',
            }),
          ],
        }),
      );
    });
  });
});

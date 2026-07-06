/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/unbound-method */

import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  IntegrationProvider,
  Prisma,
  TenantLifecycleStatus,
  UserRole,
} from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { GuestBonusLedgerSchedulerRuntimeStatus } from './guest-bonus-ledger-scheduler.service';
import {
  GuestGamificationService,
  type GuestGameDryRunResult,
  type GuestGameEvent,
  type GuestGameLootBox,
  type GuestGameMission,
  type GuestGamePipelineRunResult,
  type GuestGamePilotFirstBonusReconciliation,
  type GuestGamePilotLedgerPreflight,
  type GuestGameProcessEventResult,
  type GuestGameProfile,
  type GuestGameReward,
  type GuestGameSnapshotFact,
} from './guest-gamification.service';

const now = new Date('2026-06-10T10:00:00.000Z');
const isoNow = now.toISOString();

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
    guestGameEvent: {
      count: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    guestGameReward: {
      count: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    guestGameDelivery: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    guestGameDeliveryEvent: {
      create: jest.fn(),
    },
    guestGameProfile: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
    },
    tenant: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    store: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    guestSession: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    guestLog: {
      findMany: jest.fn(),
    },
    guestTransaction: {
      findMany: jest.fn(),
    },
    guestOperationLog: {
      findMany: jest.fn(),
    },
    guestBalanceSnapshot: {
      findMany: jest.fn(),
    },
    guestBonusBalanceCurrent: {
      findMany: jest.fn(),
    },
    guestBonusBalanceSnapshot: {
      findMany: jest.fn(),
    },
    guest: {
      findMany: jest.fn(),
    },
    guestAudienceMember: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    guestGroup: {
      findMany: jest.fn(),
    },
    guestGameLootBox: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
    },
    guestGameMission: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
    },
    guestGameSeason: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
    },
    guestGamePromoCard: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    guestGameVisualDraft: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
    },
    salesFact: {
      findMany: jest.fn(),
    },
    guestBonusLedgerEntry: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    $queryRaw: jest.fn(),
  } as any;
}

function schedulerRuntimeStatus(
  overrides: Partial<GuestBonusLedgerSchedulerRuntimeStatus> = {},
): GuestBonusLedgerSchedulerRuntimeStatus {
  return {
    enabled: false,
    running: false,
    intervalMs: null,
    lastStartedAt: null,
    lastFinishedAt: null,
    lastOutcome: null,
    lastError: null,
    lastResult: null,
    lastSkippedAt: null,
    lastSkipReason: null,
    ...overrides,
  };
}

function createService(
  prisma = createPrismaMock(),
  schedulerStatus: GuestBonusLedgerSchedulerRuntimeStatus | null = null,
  staffTeamChatService: {
    createGamificationRewardApprovalNotification: jest.Mock;
  } | null = null,
) {
  const langameSettingsService = {
    resolveTenantAccess: jest.fn(),
  };
  const langameClient = {
    postEndpoint: jest.fn(),
    listGuestSessions: jest.fn(),
    searchGuests: jest.fn(),
  };
  const bonusLedgerSchedulerService = {
    getRuntimeStatus: jest.fn(() => schedulerStatus),
  };
  const bonusLedgerService = {
    queueApprovedRewards: jest.fn().mockResolvedValue({ queued: 0 }),
    dispatch: jest.fn().mockResolvedValue({ confirmed: 0 }),
  };
  const configService = {
    get: jest.fn(),
  };

  return {
    prisma,
    langameSettingsService,
    langameClient,
    configService,
    bonusLedgerSchedulerService,
    bonusLedgerService,
    service: new GuestGamificationService(
      prisma,
      langameSettingsService as any,
      langameClient as any,
      configService as any,
      bonusLedgerSchedulerService as any,
      bonusLedgerService as any,
      staffTeamChatService as any,
    ),
  };
}

function profileFixture(
  overrides: Partial<GuestGameProfile> = {},
): GuestGameProfile {
  return {
    id: 'profile-1',
    displayName: 'Guest One',
    contactMasked: '+7 *** **-11',
    phoneHash: 'phone-hash',
    phoneEncrypted: null,
    telegramIdentity: 'tg:123456',
    maxIdentity: null,
    isStaffTest: false,
    staffTestReason: null,
    staffTestMatchedAt: null,
    xp: 120,
    level: 2,
    status: 'ACTIVE',
    lastActivityAt: null,
    createdAt: isoNow,
    updatedAt: isoNow,
    guest: {
      id: 'guest-1',
      externalDomain: 'club-1',
      externalGuestId: 'lg-guest-1',
      displayName: 'Guest One',
      contact: '+7 *** **-11',
    },
    lead: null,
    communication: {
      phoneConsentStatus: 'GRANTED',
      phoneConsentSource: 'manual',
      phoneConsentAt: isoNow,
      unsubscribedAt: null,
      telegramReady: true,
      maxReady: false,
      botReady: true,
    },
    createdBy: null,
    ...overrides,
  };
}

function activeMission(
  overrides: Partial<GuestGameMission> = {},
): GuestGameMission {
  return {
    id: 'mission-1',
    name: 'Visit mission',
    status: 'ACTIVE',
    rewardType: 'BONUS',
    rewardAmount: 75,
    rewardLabel: '75 bonus points',
    storeIds: [],
    budgetAmount: null,
    manualApprovalRequired: false,
    note: null,
    createdAt: isoNow,
    updatedAt: isoNow,
    audience: null,
    createdBy: null,
    missionType: 'VISIT',
    triggerKind: 'SESSION_START',
    xpReward: 40,
    progressTarget: null,
    progressUnit: null,
    conditions: {},
    periodFrom: null,
    periodTo: null,
    perGuestLimit: null,
    totalRewardLimit: null,
    antiFraudRules: null,
    ...overrides,
  };
}

function activeLootBox(
  overrides: Partial<GuestGameLootBox> = {},
): GuestGameLootBox {
  return {
    id: 'loot-box-1',
    name: 'Prize lootbox',
    status: 'ACTIVE',
    rewardType: 'BONUS_BALANCE',
    rewardAmount: 50,
    rewardLabel: '50 бонусов',
    storeIds: [],
    budgetAmount: null,
    manualApprovalRequired: false,
    note: null,
    createdAt: isoNow,
    updatedAt: isoNow,
    audience: null,
    createdBy: null,
    triggerKind: 'SESSION_START',
    segment: null,
    sessionType: null,
    periodRules: {},
    limits: {},
    probabilityRules: {
      type: 'weighted',
      prizes: [
        {
          rewardType: 'BONUS_BALANCE',
          rewardAmount: 50,
          rewardLabel: '50 бонусов',
          weight: 85,
        },
        {
          rewardType: 'BONUS_BALANCE',
          rewardAmount: 200,
          rewardLabel: '200 бонусов',
          weight: 15,
        },
      ],
    },
    antiFraudRules: {},
    ...overrides,
  };
}

function visualEditorStore(overrides: Record<string, unknown> = {}) {
  return {
    id: 'store-1',
    name: '1337 Test',
    publicSlug: 'store-1',
    address: 'Test street',
    city: 'Екатеринбург',
    latitude: null,
    longitude: null,
    isActive: true,
    gamificationEnabled: true,
    externalDomain: 'club-1',
    externalClubId: 'club-1',
    ...overrides,
  };
}

function visualEditorPayload(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    battlePass: {
      id: null,
      enabled: true,
      title: 'Клубный сезон',
      status: 'ACTIVE',
      levelCount: 4,
      xpPerLevel: 250,
      mainPrize: 'Финальный приз',
      levelRewards: [{ level: 2, reward: 'Промокод' }],
    },
    lootBoxes: [],
    missions: [],
    promoCards: [],
    checkIn: {
      enabled: false,
      rewardMode: '',
      xp: null,
      bonusAmount: null,
      rewardLabel: null,
    },
    ...overrides,
  };
}

function visualLootBoxItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'loot-box-1',
    title: 'Prize lootbox',
    status: 'ACTIVE',
    triggerKind: 'SESSION_START',
    rewardType: 'BONUS_BALANCE',
    rewardAmount: 50,
    rewardLabel: '50 бонусов',
    prizes: [],
    condition: 'Старт сессии',
    limitPerGuest: 1,
    periodicLimitEnabled: false,
    periodicLimitPeriod: 'DAILY',
    timeWindowMode: 'ANY',
    weekdayMode: 'ANY',
    weekdays: [1, 2, 3, 4, 5, 6, 0],
    hourFrom: '10:00',
    hourTo: '16:00',
    ...overrides,
  };
}

function visualMissionItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mission-1',
    title: 'Visit mission',
    status: 'ACTIVE',
    missionType: 'VISIT',
    triggerKind: 'SESSION_START',
    xpReward: 40,
    rewardType: 'BONUS',
    rewardAmount: 75,
    rewardLabel: '75 bonus points',
    progressTarget: null,
    progressUnit: null,
    questSteps: [],
    ...overrides,
  };
}

function visualDraftRow(overrides: Record<string, unknown> = {}) {
  const store = visualEditorStore();

  return {
    id: 'draft-1',
    tenantId: user.tenantId,
    storeId: store.id,
    status: 'DRAFT',
    payload: visualEditorPayload(),
    note: null,
    publishedAt: null,
    createdAt: now,
    updatedAt: now,
    createdByUser: null,
    updatedByUser: null,
    publishedByUser: null,
    store,
    ...overrides,
  };
}

function dryRunResult(
  overrides: Partial<GuestGameDryRunResult> = {},
): GuestGameDryRunResult {
  const profile = profileFixture();
  const base: GuestGameDryRunResult = {
    dryRun: true,
    eventType: 'SESSION_START',
    occurredAt: isoNow,
    profile: {
      id: profile.id,
      displayName: profile.displayName,
      contactMasked: profile.contactMasked,
      xp: profile.xp,
      level: profile.level,
      status: profile.status,
    },
    guest: profile.guest,
    store: null,
    input: {
      sessionType: 'regular_session',
      sessionPacket: false,
      sessionMinutes: 90,
      spendAmount: 0,
      tariffGroupId: null,
      tariffPeriodId: null,
      tariffTypeId: null,
      guestLogType: null,
      productId: null,
      externalProductId: null,
      categoryId: null,
      productName: null,
      categoryName: null,
      supplierName: null,
      quantity: null,
    },
    summary: {
      checkedRules: 1,
      eligibleRules: 1,
      blockedRules: 0,
      estimatedRewardAmount: 50,
      projectedXpDelta: 30,
    },
    rules: [
      {
        id: 'mission-1',
        kind: 'MISSION',
        name: 'Visit mission',
        status: 'ACTIVE',
        eligible: true,
        rewardType: 'BONUS',
        rewardAmount: 50,
        rewardLabel: '50 bonus points',
        selectedRewardLabel: '50 bonus points',
        selectedReward: null,
        manualApprovalRequired: false,
        xpDelta: 30,
        budgetAmount: null,
        progress: null,
        reasons: [],
        blockers: [],
      },
    ],
    note: 'Dry-run only: rewards, events and Langame writes are not created.',
  };

  return {
    ...base,
    ...overrides,
    summary: {
      ...base.summary,
      ...overrides.summary,
    },
    input: {
      ...base.input,
      ...overrides.input,
    },
  };
}

function noRewardDryRunResult(
  overrides: Partial<GuestGameDryRunResult> = {},
): GuestGameDryRunResult {
  return dryRunResult({
    ...overrides,
    rules: overrides.rules ?? [],
    summary: {
      checkedRules: 0,
      eligibleRules: 0,
      blockedRules: 0,
      estimatedRewardAmount: 0,
      projectedXpDelta: 0,
      ...overrides.summary,
    },
  });
}

function eventResult(overrides: Partial<GuestGameEvent> = {}): GuestGameEvent {
  const profile = profileFixture();

  return {
    id: 'event-1',
    eventType: 'SESSION_START',
    source: 'API_IMPORT',
    externalProvider: IntegrationProvider.LANGAME,
    externalDomain: 'club-1',
    externalId: 'guest-game:GUEST_SESSION:SESSION_START:session-1',
    xpDelta: 30,
    occurredAt: isoNow,
    payload: null,
    note: null,
    createdAt: isoNow,
    profile: {
      id: profile.id,
      displayName: profile.displayName,
      contactMasked: profile.contactMasked,
      xp: profile.xp,
      level: profile.level,
    },
    guest: profile.guest,
    lootBox: null,
    mission: null,
    season: null,
    createdBy: null,
    ...overrides,
  };
}

function rewardResult(
  overrides: Partial<GuestGameReward> = {},
): GuestGameReward {
  const profile = profileFixture();

  return {
    id: 'reward-1',
    status: 'APPROVED',
    walletState: 'READY',
    source: 'API_IMPORT',
    externalProvider: IntegrationProvider.LANGAME,
    externalDomain: 'club-1',
    externalId: 'session-1',
    guestExternalId: 'lg-guest-1',
    rewardType: 'BONUS',
    rewardAmount: 50,
    rewardLabel: '50 bonus points',
    rewardRarity: null,
    rewardRarityLabel: null,
    rewardDropChance: null,
    rewardCode: 'LP-TEST',
    claimPayload: 'LEETPLUS_REWARD:reward-1:LP-TEST',
    qualifiedAt: isoNow,
    expiresAt: null,
    paidAt: null,
    note: null,
    evidence: null,
    createdAt: isoNow,
    updatedAt: isoNow,
    profile: {
      id: profile.id,
      displayName: profile.displayName,
      contactMasked: profile.contactMasked,
      xp: profile.xp,
      level: profile.level,
    },
    guest: profile.guest,
    lootBox: null,
    mission: null,
    season: null,
    store: null,
    createdBy: null,
    approvedBy: null,
    ...overrides,
  };
}

function pilotStoreFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'store-1337',
    name: '1337',
    publicSlug: '1337',
    address: 'Main street',
    city: 'Ekaterinburg',
    latitude: new Prisma.Decimal(56.838011),
    longitude: new Prisma.Decimal(60.597465),
    externalDomain: '1337.langame.ru',
    externalClubId: '1337',
    gamificationEnabled: true,
    isActive: true,
    ...overrides,
  };
}

function pilotLedgerPreflightFixture(
  overrides: Partial<GuestGamePilotLedgerPreflight> = {},
): GuestGamePilotLedgerPreflight {
  return {
    status: 'EMPTY',
    statusLabel: 'пусто',
    ready: false,
    scopedStoreId: 'store-1337',
    scopedStoreName: '1337',
    readyCount: 0,
    pendingCount: 0,
    retryReadyCount: 0,
    staleProcessingCount: 0,
    processingCount: 0,
    failedWaitingRetryCount: 0,
    previewItems: [],
    metric: '0 ready / 0 pending / 0 retry',
    note: 'No pilot ledger entry is ready.',
    nextAction: 'Queue one approved reward.',
    ...overrides,
  };
}

function pilotFirstBonusReconciliationFixture(
  overrides: Partial<GuestGamePilotFirstBonusReconciliation> = {},
): GuestGamePilotFirstBonusReconciliation {
  return {
    status: 'WAITING_LIVE',
    statusLabel: 'ждет live',
    ready: false,
    scopedStoreId: 'store-1337',
    scopedStoreName: '1337',
    ledgerEntry: null,
    metric: '0 confirmed bonus_balance',
    note: 'No confirmed pilot bonus balance entry yet.',
    nextAction: 'Run one pilot canary.',
    ...overrides,
  };
}

function pilotFirstBonusLedgerEntryFixture(
  overrides: Partial<
    NonNullable<GuestGamePilotFirstBonusReconciliation['ledgerEntry']>
  > = {},
): NonNullable<GuestGamePilotFirstBonusReconciliation['ledgerEntry']> {
  return {
    id: 'ledger-1',
    status: 'CONFIRMED',
    statusLabel: 'подтверждено',
    amount: 100,
    balanceAfter: 150,
    confirmedAt: '2026-06-10T10:00:00.000Z',
    guest: {
      id: 'guest-1',
      displayName: 'Guest One',
      contact: '+7 *** **-11',
    },
    store: { id: 'store-1337', name: '1337' },
    reconciliation: {
      state: 'WAITING_SYNC',
      stateLabel: 'ждет snapshot',
      latestSnapshotAt: null,
      latestSnapshotBalance: null,
      expectedBalance: 150,
      diff: null,
      note: 'Need a fresh snapshot.',
    },
    ...overrides,
  };
}

function integrationReadinessForPilot({
  otpReady = true,
  ledgerReady = false,
  telegramReady = false,
  userCallReady = false,
}: {
  otpReady?: boolean;
  ledgerReady?: boolean;
  telegramReady?: boolean;
  userCallReady?: boolean;
} = {}) {
  const items = [
    {
      key: 'OTP',
      title: 'OTP',
      status: otpReady ? 'READY' : 'BLOCKED',
      statusLabel: otpReady ? 'ready' : 'blocked',
      ready: otpReady,
      configured: otpReady,
      enabled: otpReady,
      requiredEnv: [],
      note: 'OTP readiness',
      nextAction: 'Configure OTP',
    },
    ...(telegramReady
      ? [
          {
            key: 'TELEGRAM_LINK',
            title: 'Telegram link',
            status: 'READY',
            statusLabel: 'ready',
            ready: true,
            configured: true,
            enabled: true,
            requiredEnv: [],
            note: 'Telegram link readiness',
            nextAction: 'Run Telegram QA',
          },
          {
            key: 'TELEGRAM_WEBHOOK',
            title: 'Telegram update consumer',
            status: 'READY',
            statusLabel: 'ready',
            ready: true,
            configured: true,
            enabled: true,
            requiredEnv: [],
            note: 'Telegram consumer readiness',
            nextAction: 'Run Telegram QA',
          },
        ]
      : []),
    ...(userCallReady
      ? [
          {
            key: 'USER_CALL_AUTH',
            title: 'User call auth',
            status: 'READY',
            statusLabel: 'ready',
            ready: true,
            configured: true,
            enabled: true,
            requiredEnv: [],
            note: 'User call readiness',
            nextAction: 'Run user-call QA',
          },
        ]
      : []),
    {
      key: 'LANGAME_WRITE_API',
      title: 'Langame write',
      status: ledgerReady ? 'READY' : 'BLOCKED',
      statusLabel: ledgerReady ? 'ready' : 'blocked',
      ready: ledgerReady,
      configured: ledgerReady,
      enabled: ledgerReady,
      requiredEnv: [],
      note: 'Langame write readiness',
      nextAction: 'Configure Langame write',
    },
    {
      key: 'BONUS_LEDGER_SCHEDULER',
      title: 'Bonus ledger scheduler',
      status: ledgerReady ? 'READY' : 'BLOCKED',
      statusLabel: ledgerReady ? 'ready' : 'blocked',
      ready: ledgerReady,
      configured: ledgerReady,
      enabled: ledgerReady,
      requiredEnv: [],
      note: 'Scheduler readiness',
      nextAction: 'Configure scheduler',
    },
  ];

  return {
    summary: {
      total: items.length,
      ready: items.filter((item) => item.status === 'READY').length,
      partial: items.filter((item) => item.status === 'PARTIAL').length,
      blocked: items.filter((item) => item.status === 'BLOCKED').length,
      manualOnly: items.filter((item) => item.status === 'MANUAL_ONLY').length,
    },
    items,
    note: 'Integration readiness',
  };
}

function pilotReadinessInput(overrides: Record<string, unknown> = {}) {
  return {
    tenantSlug: user.tenantSlug,
    stores: [pilotStoreFixture()],
    profiles: [profileFixture()],
    lootBoxes: [],
    missions: [activeMission()],
    seasons: [],
    rewards: [],
    events: [],
    integrationReadiness: integrationReadinessForPilot(),
    bonusLedgerAudit: {
      summary: {
        confirmed: 0,
        reconciliationPending: 0,
        reconciliationMismatch: 0,
      },
    },
    guestLogCatalog: {
      items: [
        {
          type: 'session_start',
          normalizedType: 'session_start',
          count: 12,
          latestAt: '2026-06-15T08:00:00.000Z',
          domains: [
            {
              domain: '1337.langame.ru',
              provider: 'LANGAME',
              count: 12,
              latestAt: '2026-06-15T08:00:00.000Z',
            },
          ],
          mapping: null,
        },
      ],
      mappings: [],
      summary: {
        types: 1,
        logs: 12,
        domains: 1,
        latestAt: '2026-06-15T08:00:00.000Z',
        lastSuccessfulSync: {
          businessDate: '2026-06-15',
          updatedAt: '2026-06-15T23:57:06.000Z',
          guestLogs: 12,
          sources: 3,
          failedSources: 0,
        },
      },
    },
    pilotLedgerPreflight: pilotLedgerPreflightFixture(),
    pilotFirstBonusReconciliation: pilotFirstBonusReconciliationFixture(),
    communicationQueue: {
      summary: {
        readyForCashier: 0,
      },
    },
    deliveryOutbox: {
      summary: {
        cashier: 0,
      },
    },
    ...overrides,
  };
}

function processResult(
  overrides: Partial<GuestGameProcessEventResult> = {},
): GuestGameProcessEventResult {
  const dryRun = dryRunResult();
  const rewards = [rewardResult()];

  return {
    processed: true,
    dryRun,
    event: eventResult(),
    rewards,
    summary: {
      profileCreated: false,
      appliedXpDelta: dryRun.summary.projectedXpDelta,
      createdRewards: rewards.length,
      queuedRewardAmount: 50,
      idempotencyKey: 'guest-game:GUEST_SESSION:SESSION_START:session-1',
      idempotent: false,
      langameWrite: false,
    },
    note: 'Processed in LeetPlus only.',
    ...overrides,
  };
}

function snapshotFact(
  id: string,
  overrides: Partial<GuestGameSnapshotFact> = {},
): GuestGameSnapshotFact {
  const profile = profileFixture();

  return {
    id,
    source: 'GUEST_SESSION',
    eventType: 'SESSION_START',
    occurredAt: isoNow,
    externalProvider: IntegrationProvider.LANGAME,
    externalDomain: 'club-1',
    externalId: id,
    guest: profile.guest,
    store: null,
    sessionType: 'regular_session',
    sessionPacket: false,
    sessionMinutes: 90,
    spendAmount: null,
    tariffGroupId: null,
    tariffPeriodId: null,
    tariffTypeId: null,
    guestLogType: null,
    label: id,
    details: null,
    ...overrides,
  };
}

function rewardRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'reward-1',
    tenantId: user.tenantId,
    profileId: 'profile-1',
    guestId: 'guest-1',
    lootBoxId: null,
    missionId: null,
    seasonId: null,
    storeId: null,
    createdByUserId: user.id,
    approvedByUserId: null,
    status: 'APPROVED',
    source: 'API_IMPORT',
    externalProvider: IntegrationProvider.LANGAME,
    externalDomain: 'club-1',
    externalId: 'session-1',
    guestExternalId: 'lg-guest-1',
    rewardType: 'BONUS',
    rewardAmount: new Prisma.Decimal(100),
    rewardLabel: '100 bonus points',
    rewardRarity: null,
    rewardRarityLabel: null,
    rewardDropChance: null,
    rewardCode: 'LP-100',
    qualifiedAt: now,
    expiresAt: null,
    paidAt: null,
    note: null,
    evidence: null,
    createdAt: now,
    updatedAt: now,
    profile: {
      id: 'profile-1',
      displayName: 'Guest One',
      contactMasked: '+7 *** **-11',
      xp: 120,
      level: 2,
    },
    guest: {
      id: 'guest-1',
      externalDomain: 'club-1',
      externalGuestId: 'lg-guest-1',
      fullNameMasked: 'Guest One',
      phoneMasked: '+7 *** **-11',
      emailMasked: null,
    },
    lootBox: null,
    mission: null,
    season: null,
    store: null,
    createdByUser: null,
    approvedByUser: null,
    ...overrides,
  };
}

function deliveryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'delivery-1',
    tenantId: user.tenantId,
    rewardId: 'reward-1',
    profileId: 'profile-1',
    guestId: 'guest-1',
    storeId: null,
    createdByUserId: user.id,
    channel: 'TELEGRAM',
    status: 'READY',
    readinessStatus: 'READY_FOR_BOT',
    recipientMasked: 'Guest One',
    channelIdentityMasked: 'tg:***',
    messageTitle: 'Reward ready',
    messageBody: 'Your reward is ready',
    blockers: [],
    metadata: {},
    preparedAt: now,
    sentAt: null,
    failedAt: null,
    canceledAt: null,
    note: null,
    createdAt: now,
    updatedAt: now,
    reward: rewardRow(),
    profile: {
      id: 'profile-1',
      displayName: 'Guest One',
      contactMasked: '+7 *** **-11',
      telegramIdentity: 'tg:123456',
      maxIdentity: null,
      xp: 120,
      level: 2,
    },
    guest: null,
    store: null,
    createdByUser: null,
    events: [],
    ...overrides,
  };
}

function scheduledTenantRow(overrides: Record<string, unknown> = {}) {
  return {
    id: user.tenantId,
    slug: user.tenantSlug,
    status: TenantLifecycleStatus.ACTIVE,
    users: [
      {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        customRoleId: null,
        isPlatformAdmin: user.isPlatformAdmin,
      },
    ],
    ...overrides,
  };
}

function bonusBalanceCurrentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'current-1',
    guestId: 'guest-1',
    externalProvider: IntegrationProvider.LANGAME,
    externalDomain: 'club-1',
    externalGuestId: 'lg-guest-1',
    bonusBalance: new Prisma.Decimal(150),
    snapshotDate: now,
    source: 'LANGAME_LEDGER',
    lastSyncedAt: now,
    updatedAt: now,
    guest: {
      id: 'guest-1',
      externalDomain: 'club-1',
      externalGuestId: 'lg-guest-1',
      fullNameMasked: 'Guest One',
      phoneMasked: '+7 *** **-11',
      emailMasked: null,
    },
    ...overrides,
  };
}

function bonusBalanceSnapshotRow(overrides: Record<string, unknown> = {}) {
  return {
    guestId: 'guest-1',
    externalProvider: IntegrationProvider.LANGAME,
    externalDomain: 'club-1',
    externalGuestId: 'lg-guest-1',
    snapshotDate: now,
    bonusBalance: new Prisma.Decimal(150),
    sourcePayloadHash: 'hash-1',
    ...overrides,
  };
}

describe('GuestGamificationService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.GUEST_GAME_DELIVERY_REAL_SEND_ENABLED;
    delete process.env.GUEST_GAME_DELIVERY_TELEGRAM_ENABLED;
    delete process.env.GUEST_GAME_DELIVERY_TELEGRAM_BOT_TOKEN;
    delete process.env.GUEST_GAME_MAX_DELIVERY_ENABLED;
    delete process.env.GUEST_GAME_MAX_DELIVERY_LIVE_CANARY_ENABLED;
    delete process.env.GUEST_GAME_MAX_DELIVERY_ENDPOINT;
    delete process.env.GUEST_GAME_MAX_BOT_TOKEN;
    delete process.env.MAX_BOT_TOKEN;
    delete process.env.SYNC_SERVICE_TOKEN;
    delete process.env.LANGAME_BONUS_ACCRUAL_ENABLED;
    delete process.env.GUEST_GAME_BONUS_LEDGER_SCHEDULER_ENABLED;
    delete process.env.GUEST_GAME_BONUS_LEDGER_SCHEDULER_DRY_RUN;
    delete process.env.GUEST_GAME_BONUS_LEDGER_SCHEDULER_INTERVAL_MS;
    delete process.env.GUEST_GAME_BONUS_LEDGER_SCHEDULER_LIMIT;
    delete process.env.GUEST_GAME_BONUS_LEDGER_SCHEDULER_TENANT_SLUG;
    delete process.env.GUEST_GAME_BONUS_LEDGER_SCHEDULER_REWARD_TYPES;
    delete process.env.GUEST_GAME_BOT_CONSUMER_SYNC_TOKEN;
    delete process.env.GUEST_GAME_BOT_CONSUMER_TENANT_ID;
    delete process.env.GUEST_GAME_BOT_CONSUMER_TENANT_SLUG;
    delete process.env.GUEST_GAME_BOT_CONSUMER_CHANNELS;
    delete process.env.GUEST_GAME_BOT_CONSUMER_LIMIT;
    delete process.env.GUEST_GAME_BOT_CONSUMER_DRY_RUN;
    delete process.env.GUEST_GAME_BOT_CONSUMER_TELEGRAM_BOT_TOKEN;
    delete process.env.GUEST_GAME_BOT_CONSUMER_MAX_DELIVERY_ENDPOINT;
    delete process.env.GUEST_GAME_BOT_CONSUMER_MAX_BOT_TOKEN;
    delete process.env.GUEST_GAME_TELEGRAM_LINK_SECRET;
    delete process.env.GUEST_GAME_TELEGRAM_WEBHOOK_SECRET;
    delete process.env.GUEST_GAME_TELEGRAM_BOT_USERNAME;
    delete process.env.GUEST_GAME_TELEGRAM_BOT_TOKEN;
    delete process.env.GUEST_GAME_TELEGRAM_MINI_APP_BOT_TOKEN;
    delete process.env.GUEST_GAME_TELEGRAM_MINI_APP_URL;
    delete process.env.GUEST_GAME_TG_EDGE_SHARED_SECRET;
    delete process.env.GUEST_GAME_TELEGRAM_WEBHOOK_REPLY_ENABLED;
    delete process.env.GUEST_GAME_TELEGRAM_WEBHOOK_REPLY_BOT_TOKEN;
    delete process.env.GUEST_PORTAL_USER_CALL_ENABLED;
    delete process.env.GUEST_PORTAL_USER_CALL_PROVIDER;
    delete process.env.GUEST_PORTAL_USER_CALL_PHONE_NUMBER;
    delete process.env.GUEST_PORTAL_USER_CALL_SECRET;
    delete process.env.GUEST_PORTAL_USER_CALL_SMS_RU_API_ID;
    delete process.env.GUEST_PORTAL_USER_CALL_SMS_RU_BASE_URL;
    delete process.env.GUEST_PORTAL_OTP_REAL_SEND_ENABLED;
    delete process.env.GUEST_PORTAL_OTP_SMS_ENABLED;
    delete process.env.GUEST_PORTAL_OTP_SMS_RU_API_ID;
    delete process.env.GUEST_PORTAL_OTP_SMS_RU_BASE_URL;
    delete process.env.GUEST_PORTAL_OTP_SMS_RU_TEST_MODE;
    delete process.env.GUEST_PORTAL_OTP_SMS_RU_LIVE_CANARY_ENABLED;
    delete process.env.GUEST_PORTAL_OTP_SMS_ENDPOINT;
    delete process.env.GUEST_PORTAL_OTP_SMS_TOKEN;
    delete process.env.GUEST_PORTAL_OTP_SMS_RATE_LIMIT_PHONE_WINDOW_MINUTES;
    delete process.env.GUEST_PORTAL_OTP_SMS_RATE_LIMIT_PHONE_MAX;
    delete process.env.GUEST_PORTAL_OTP_SMS_RATE_LIMIT_STORE_WINDOW_MINUTES;
    delete process.env.GUEST_PORTAL_OTP_SMS_RATE_LIMIT_STORE_MAX;
    delete process.env.GUEST_PORTAL_OTP_SMS_RATE_LIMIT_TENANT_WINDOW_MINUTES;
    delete process.env.GUEST_PORTAL_OTP_SMS_RATE_LIMIT_TENANT_MAX;
    delete process.env.GUEST_PORTAL_TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_BOT_TOKEN;
  });

  describe('getProfiles', () => {
    it('uses profile-level communication consent for game-only Telegram profiles', async () => {
      const { service, prisma } = createService();

      prisma.guestGameProfile.findMany.mockResolvedValue([
        {
          id: 'profile-telegram-only',
          tenantId: user.tenantId,
          guestId: null,
          leadId: null,
          createdByUserId: null,
          displayName: 'Telegram player',
          contactMasked: '+7 *** **-33',
          phoneHash: 'phone-hash-telegram',
          telegramIdentity: 'chat:123456',
          maxIdentity: null,
          phoneConsentStatus: 'GRANTED',
          phoneConsentSource: 'telegram_auth_contact_share',
          phoneConsentAt: now,
          unsubscribedAt: null,
          xp: 0,
          level: 1,
          status: 'ACTIVE',
          lastActivityAt: now,
          createdAt: now,
          updatedAt: now,
          guest: null,
          lead: null,
          createdByUser: null,
        },
      ]);

      const result = await service.getProfiles(user);

      expect(result[0]).toMatchObject({
        id: 'profile-telegram-only',
        guest: null,
        lead: null,
        telegramIdentity: 'chat:123456',
        communication: {
          phoneConsentStatus: 'GRANTED',
          phoneConsentSource: 'telegram_auth_contact_share',
          phoneConsentAt: isoNow,
          telegramReady: true,
          botReady: true,
        },
      });
    });
  });

  describe('reward approval chat', () => {
    it('sends pending rewards to the gamification staff chat with readable conditions', async () => {
      const prisma = createPrismaMock();
      const staffTeamChatService = {
        createGamificationRewardApprovalNotification: jest
          .fn()
          .mockResolvedValue({ id: 'chat-message-1' }),
      };
      const { service } = createService(prisma, null, staffTeamChatService);
      const pendingReward = rewardRow({
        id: 'reward-pending-chat',
        status: 'PENDING',
        rewardLabel: 'Промокод бара',
        rewardAmount: new Prisma.Decimal(0),
        storeId: 'store-1',
        note: 'Создано подтвержденным запуском события геймификации.',
        externalId:
          'guest-game:GUEST_APP_OPEN:APP_OPEN:162c32aa-1a34-4bc9-8e07-48696eea57d',
        evidence: {
          rawPhone: '79999999999',
          eventType: 'APP_OPEN',
          rule: {
            name: 'Тест',
            triggerKind: 'APP_OPEN',
            reasons: [
              'Правило активно',
              'Выбранный клуб входит в область правила',
              'Выдача требует подтверждения сотрудником',
            ],
          },
        },
        lootBoxId: 'loot-1',
        lootBox: {
          id: 'loot-1',
          name: 'Тест',
          status: 'ACTIVE',
          triggerKind: 'APP_OPEN',
          segment: 'quiet_hours',
          sessionType: null,
          periodRules: {
            source: 'business_controls',
            timeWindowMode: 'QUIET_HOURS',
            weekdayMode: 'WEEKDAYS',
            quietHoursEnabled: true,
            weekdaysOnly: true,
            weekdays: [1, 2, 3, 4, 5],
            hours: ['10:00-16:00'],
            guestLogTypes: ['visit', 'login'],
            blockedGuestLogTypes: ['manual_cancel'],
          },
          limits: {
            source: 'business_controls',
            perGuestPerWeek: 1,
            totalPerDay: 30,
          },
          manualApprovalRequired: true,
          note: null,
        },
        store: {
          id: 'store-1',
          name: '1337-Пушкинская',
        },
      });

      prisma.guestGameReward.create.mockResolvedValue(pendingReward);
      prisma.guestGameEvent.create.mockResolvedValue({});

      await service.createReward(user, {
        rewardType: 'PROMOCODE',
        rewardLabel: 'Промокод бара',
        status: 'PENDING',
      });

      expect(
        staffTeamChatService.createGamificationRewardApprovalNotification,
      ).toHaveBeenCalledWith(
        user.tenantId,
        expect.objectContaining({
          rewardId: 'reward-pending-chat',
          activityType: 'Лутбокс',
          activityName: 'Тест',
          conditions: expect.stringContaining(
            'Событие для появления: Открытие приложения',
          ),
          guestPhone: '+7 *** **-11',
          storeName: '1337-Пушкинская',
          actionHref:
            '/guests/gamification?tab=rewards&rewardId=reward-pending-chat',
        }),
      );
      const notification =
        staffTeamChatService.createGamificationRewardApprovalNotification.mock
          .calls[0][1];
      expect(notification.conditions).toContain('Аудитория: Тихие часы');
      expect(notification.conditions).toContain(
        'Когда показывать: Тихие часы (10:00-16:00)',
      );
      expect(notification.conditions).toContain('По каким дням: Будни');
      expect(notification.conditions).toContain(
        'События Langame: Визит, Вход в клуб',
      );
      expect(notification.conditions).toContain(
        'Не засчитывать: Ручная отмена',
      );
      expect(notification.conditions).toContain(
        'Лимит на гостя: 1 открытие в неделю',
      );
      expect(notification.conditions).toContain(
        'Общий дневной лимит: 30 открытий',
      );
      expect(notification.conditions).not.toContain('APP_OPEN');
      expect(notification.conditions).not.toContain('externalId');
      expect(notification.conditions).not.toContain('guest-game:');
      expect(
        JSON.stringify(
          staffTeamChatService.createGamificationRewardApprovalNotification.mock
            .calls[0][1],
        ),
      ).not.toContain('79999999999');
    });

    it('does not send approved rewards to the approval chat', async () => {
      const prisma = createPrismaMock();
      const staffTeamChatService = {
        createGamificationRewardApprovalNotification: jest.fn(),
      };
      const { service, bonusLedgerService } = createService(
        prisma,
        null,
        staffTeamChatService,
      );

      prisma.guestGameReward.create.mockResolvedValue(
        rewardRow({ id: 'reward-approved-chat', status: 'APPROVED' }),
      );
      prisma.guestGameEvent.create.mockResolvedValue({});

      await service.createReward(user, {
        rewardType: 'BONUS',
        rewardLabel: '50 бонусов',
        rewardAmount: 50,
        status: 'APPROVED',
      });

      expect(
        staffTeamChatService.createGamificationRewardApprovalNotification,
      ).not.toHaveBeenCalled();
      expect(bonusLedgerService.queueApprovedRewards).toHaveBeenCalledWith(
        user,
        {
          rewardId: 'reward-approved-chat',
          rewardTypes: ['BONUS'],
          limit: 1,
        },
      );
      expect(bonusLedgerService.dispatch).toHaveBeenCalledWith(user, {
        rewardId: 'reward-approved-chat',
        rewardTypes: ['BONUS'],
        limit: 1,
        queueApprovedRewards: false,
      });
    });

    it('does not write guest portal pseudo-user as approvedByUserId', async () => {
      const { service, prisma } = createService();
      const guestPortalUser: AuthenticatedUser = {
        ...user,
        id: 'guest-portal:profile-1',
        email: 'guest-portal@leetplus.local',
        fullName: 'Гостевой портал',
        role: UserRole.CLUB_MANAGER,
      };

      prisma.guestGameProfile.findFirst.mockResolvedValue({
        id: 'profile-1',
        tenantId: user.tenantId,
      });
      prisma.guestGameLootBox.findFirst.mockResolvedValue({
        id: 'loot-box-1',
        tenantId: user.tenantId,
      });
      prisma.store.findFirst.mockResolvedValue({
        id: 'store-1',
        tenantId: user.tenantId,
      });
      prisma.guestGameReward.create.mockResolvedValue(
        rewardRow({
          id: 'reward-guest-portal-approved',
          status: 'APPROVED',
          approvedByUserId: null,
          createdByUserId: null,
        }),
      );
      prisma.guestGameEvent.create.mockResolvedValue({});

      await service.createReward(guestPortalUser, {
        profileId: 'profile-1',
        lootBoxId: 'loot-box-1',
        storeId: 'store-1',
        rewardType: 'BONUS_BALANCE',
        rewardLabel: '50 бонусов',
        rewardAmount: 50,
        status: 'APPROVED',
      });

      expect(prisma.guestGameReward.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            approvedByUserId: null,
            createdByUserId: null,
          }),
        }),
      );
    });
  });

  describe('integration readiness', () => {
    it('marks SMS OTP ready through SMS.ru without exposing api_id', () => {
      process.env.GUEST_PORTAL_OTP_REAL_SEND_ENABLED = 'true';
      process.env.GUEST_PORTAL_OTP_SMS_ENABLED = 'true';
      process.env.GUEST_PORTAL_OTP_SMS_RU_API_ID = 'smsru-api-id';
      process.env.GUEST_PORTAL_OTP_SMS_RU_TEST_MODE = 'true';
      const { service } = createService();

      const readiness = (service as any).buildIntegrationReadiness([]);
      const otp = readiness.items.find(
        (item: { key: string }) => item.key === 'OTP',
      );
      const sms = readiness.items.find(
        (item: { key: string }) => item.key === 'OTP_SMS',
      );
      const smsText = JSON.stringify(sms);

      expect(otp).toMatchObject({
        status: 'READY',
        ready: true,
      });
      expect(sms).toMatchObject({
        status: 'READY',
        ready: true,
        configured: true,
        enabled: true,
        runbook: {
          label: 'Runbook fallback-входа',
          path: 'docs/deployment/guest-auth-fallbacks.md',
          href: 'https://github.com/boozik3412/leetplus/blob/main/docs/deployment/guest-auth-fallbacks.md',
        },
      });
      expect(sms.requiredEnv).toEqual(
        expect.arrayContaining([
          'GUEST_PORTAL_OTP_SMS_RU_API_ID or GUEST_PORTAL_USER_CALL_SMS_RU_API_ID',
        ]),
      );
      expect(sms.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            label: 'Provider',
            value: 'SMS.ru /sms/send',
          }),
          expect.objectContaining({
            label: 'SMS.ru api_id',
            value: 'настроен',
          }),
          expect.objectContaining({
            label: 'SMS.ru test-mode',
            value: 'test=1',
          }),
          expect.objectContaining({
            label: 'SMS.ru live canary',
            value: 'staged test-mode',
          }),
          expect.objectContaining({
            label: 'Лимит телефона',
            value: '3 за 60 мин',
          }),
          expect.objectContaining({
            label: 'Лимит клуба',
            value: '30 за 10 мин',
          }),
          expect.objectContaining({
            label: 'Лимит tenant',
            value: '300 за 1440 мин',
          }),
        ]),
      );
      expect(smsText).not.toContain('smsru-api-id');
    });

    it('keeps SMS OTP partial until SMS.ru live canary is enabled', () => {
      process.env.GUEST_PORTAL_OTP_REAL_SEND_ENABLED = 'true';
      process.env.GUEST_PORTAL_OTP_SMS_ENABLED = 'true';
      process.env.GUEST_PORTAL_OTP_SMS_RU_API_ID = 'smsru-api-id';
      const { service } = createService();

      const readiness = (service as any).buildIntegrationReadiness([]);
      const otp = readiness.items.find(
        (item: { key: string }) => item.key === 'OTP',
      );
      const sms = readiness.items.find(
        (item: { key: string }) => item.key === 'OTP_SMS',
      );
      const smsText = JSON.stringify(sms);

      expect(otp).toMatchObject({
        status: 'PARTIAL',
        ready: false,
      });
      expect(sms).toMatchObject({
        status: 'PARTIAL',
        ready: false,
        configured: true,
        enabled: true,
      });
      expect(sms.requiredEnv).toEqual(
        expect.arrayContaining([
          'GUEST_PORTAL_OTP_SMS_RU_TEST_MODE or GUEST_PORTAL_OTP_SMS_RU_LIVE_CANARY_ENABLED',
        ]),
      );
      expect(sms.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            label: 'SMS.ru live canary',
            value: 'нужен canary',
          }),
        ]),
      );
      expect(sms.note).toContain('controlled canary');
      expect(smsText).not.toContain('smsru-api-id');
    });

    it('marks SMS.ru live OTP ready only with the canary flag enabled', () => {
      process.env.GUEST_PORTAL_OTP_REAL_SEND_ENABLED = 'true';
      process.env.GUEST_PORTAL_OTP_SMS_ENABLED = 'true';
      process.env.GUEST_PORTAL_OTP_SMS_RU_API_ID = 'smsru-api-id';
      process.env.GUEST_PORTAL_OTP_SMS_RU_LIVE_CANARY_ENABLED = 'true';
      const { service } = createService();

      const readiness = (service as any).buildIntegrationReadiness([]);
      const sms = readiness.items.find(
        (item: { key: string }) => item.key === 'OTP_SMS',
      );
      const smsText = JSON.stringify(sms);

      expect(sms).toMatchObject({
        status: 'READY',
        ready: true,
        configured: true,
        enabled: true,
      });
      expect(sms.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            label: 'SMS.ru test-mode',
            value: 'выключен',
          }),
          expect.objectContaining({
            label: 'SMS.ru live canary',
            value: 'canary включен',
          }),
        ]),
      );
      expect(smsText).not.toContain('smsru-api-id');
    });

    it('keeps SMS OTP partial when rate-limit or budget guards are disabled', () => {
      process.env.GUEST_PORTAL_OTP_REAL_SEND_ENABLED = 'true';
      process.env.GUEST_PORTAL_OTP_SMS_ENABLED = 'true';
      process.env.GUEST_PORTAL_OTP_SMS_RU_API_ID = 'smsru-api-id';
      process.env.GUEST_PORTAL_OTP_SMS_RU_TEST_MODE = 'true';
      process.env.GUEST_PORTAL_OTP_SMS_RATE_LIMIT_TENANT_MAX = '0';
      const { service } = createService();

      const readiness = (service as any).buildIntegrationReadiness([]);
      const otp = readiness.items.find(
        (item: { key: string }) => item.key === 'OTP',
      );
      const sms = readiness.items.find(
        (item: { key: string }) => item.key === 'OTP_SMS',
      );
      const smsText = JSON.stringify(sms);

      expect(otp).toMatchObject({
        status: 'PARTIAL',
        ready: false,
      });
      expect(sms).toMatchObject({
        status: 'PARTIAL',
        ready: false,
        configured: true,
        enabled: true,
      });
      expect(sms.requiredEnv).toEqual(
        expect.arrayContaining([
          'GUEST_PORTAL_OTP_SMS_RATE_LIMIT_TENANT_WINDOW_MINUTES',
          'GUEST_PORTAL_OTP_SMS_RATE_LIMIT_TENANT_MAX',
        ]),
      );
      expect(sms.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            label: 'Лимит tenant',
            value: 'отключен',
          }),
        ]),
      );
      expect(sms.note).toContain('live-режим нельзя считать готовым');
      expect(smsText).not.toContain('smsru-api-id');
    });

    it('lets SMS OTP reuse the SMS.ru Callcheck api_id without exposing it', () => {
      process.env.GUEST_PORTAL_OTP_REAL_SEND_ENABLED = 'true';
      process.env.GUEST_PORTAL_OTP_SMS_ENABLED = 'true';
      process.env.GUEST_PORTAL_USER_CALL_SMS_RU_API_ID = 'callcheck-api-id';
      process.env.GUEST_PORTAL_OTP_SMS_RU_LIVE_CANARY_ENABLED = 'true';
      const { service } = createService();

      const readiness = (service as any).buildIntegrationReadiness([]);
      const sms = readiness.items.find(
        (item: { key: string }) => item.key === 'OTP_SMS',
      );
      const smsText = JSON.stringify(sms);

      expect(sms).toMatchObject({
        status: 'READY',
        ready: true,
        configured: true,
        enabled: true,
      });
      expect(sms.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            label: 'Provider',
            value: 'SMS.ru /sms/send',
          }),
        ]),
      );
      expect(smsText).not.toContain('callcheck-api-id');
    });

    it('shows user call auth as blocked until phone number and callback secret are configured', () => {
      const { service } = createService();

      const readiness = (service as any).buildIntegrationReadiness([]);
      const userCall = readiness.items.find(
        (item: { key: string }) => item.key === 'USER_CALL_AUTH',
      );

      expect(userCall).toMatchObject({
        status: 'BLOCKED',
        ready: false,
        configured: false,
        enabled: false,
        requiredEnv: [
          'GUEST_PORTAL_USER_CALL_ENABLED',
          'GUEST_PORTAL_USER_CALL_PHONE_NUMBER',
          'GUEST_PORTAL_USER_CALL_SECRET',
        ],
        runbook: {
          label: 'Runbook fallback-входа',
          path: 'docs/deployment/guest-auth-fallbacks.md',
          href: 'https://github.com/boozik3412/leetplus/blob/main/docs/deployment/guest-auth-fallbacks.md',
        },
      });
    });

    it('marks user call auth ready without exposing the phone number or callback secret', () => {
      process.env.GUEST_PORTAL_USER_CALL_ENABLED = 'true';
      process.env.GUEST_PORTAL_USER_CALL_PHONE_NUMBER = '+7 343 000-00-00';
      process.env.GUEST_PORTAL_USER_CALL_SECRET = 'call-secret';
      const { service } = createService();

      const readiness = (service as any).buildIntegrationReadiness([]);
      const userCall = readiness.items.find(
        (item: { key: string }) => item.key === 'USER_CALL_AUTH',
      );
      const userCallText = JSON.stringify(userCall);

      expect(userCall).toMatchObject({
        status: 'READY',
        ready: true,
        configured: true,
        enabled: true,
        requiredEnv: [],
        runbook: {
          label: 'Runbook fallback-входа',
          path: 'docs/deployment/guest-auth-fallbacks.md',
          href: 'https://github.com/boozik3412/leetplus/blob/main/docs/deployment/guest-auth-fallbacks.md',
        },
      });
      expect(userCall.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ label: 'Флаг', value: 'включен' }),
          expect.objectContaining({ label: 'Номер', value: 'настроен' }),
          expect.objectContaining({
            label: 'Callback secret',
            value: 'настроен',
          }),
        ]),
      );
      expect(userCallText).not.toContain('+7 343 000-00-00');
      expect(userCallText).not.toContain('call-secret');
    });

    it('marks SMS.ru user call auth ready without requiring manual callback env', () => {
      process.env.GUEST_PORTAL_USER_CALL_ENABLED = 'true';
      process.env.GUEST_PORTAL_USER_CALL_PROVIDER = 'SMS_RU_CALLCHECK';
      process.env.GUEST_PORTAL_USER_CALL_SMS_RU_API_ID = 'smsru-api-id';
      const { service } = createService();

      const readiness = (service as any).buildIntegrationReadiness([]);
      const userCall = readiness.items.find(
        (item: { key: string }) => item.key === 'USER_CALL_AUTH',
      );
      const userCallText = JSON.stringify(userCall);

      expect(userCall).toMatchObject({
        status: 'READY',
        ready: true,
        configured: true,
        enabled: true,
        requiredEnv: [],
      });
      expect(userCall.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ label: 'Флаг', value: 'включен' }),
          expect.objectContaining({
            label: 'Provider',
            value: 'SMS.ru Callcheck',
          }),
          expect.objectContaining({
            label: 'SMS.ru api_id',
            value: 'настроен',
          }),
        ]),
      );
      expect(userCallText).not.toContain('smsru-api-id');
      expect(userCallText).not.toContain('GUEST_PORTAL_USER_CALL_SECRET');
      expect(userCallText).not.toContain('GUEST_PORTAL_USER_CALL_PHONE_NUMBER');
    });

    it('marks incoming call last4 auth ready without exposing provider endpoint or token', () => {
      process.env.GUEST_PORTAL_INCOMING_CALL_LAST4_ENABLED = 'true';
      process.env.GUEST_PORTAL_INCOMING_CALL_LAST4_ENDPOINT =
        'https://provider.test/calls';
      process.env.GUEST_PORTAL_INCOMING_CALL_LAST4_TOKEN = 'provider-token';
      const { service } = createService();

      const readiness = (service as any).buildIntegrationReadiness([]);
      const incomingCall = readiness.items.find(
        (item: { key: string }) => item.key === 'INCOMING_CALL_LAST4_AUTH',
      );
      const incomingCallText = JSON.stringify(incomingCall);

      expect(incomingCall).toMatchObject({
        status: 'READY',
        ready: true,
        configured: true,
        enabled: true,
        requiredEnv: [],
        runbook: {
          label: 'Runbook fallback-входа',
          path: 'docs/deployment/guest-auth-fallbacks.md',
          href: 'https://github.com/boozik3412/leetplus/blob/main/docs/deployment/guest-auth-fallbacks.md',
        },
      });
      expect(incomingCall.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ label: 'Флаг', value: 'включен' }),
          expect.objectContaining({
            label: 'Provider endpoint',
            value: 'настроен',
          }),
          expect.objectContaining({
            label: 'Provider token',
            value: 'настроен',
          }),
        ]),
      );
      expect(incomingCallText).not.toContain('https://provider.test/calls');
      expect(incomingCallText).not.toContain('provider-token');
    });

    it('shows Telegram auth reply sender as adapter-only until API-side sending is enabled', () => {
      process.env.GUEST_GAME_TELEGRAM_WEBHOOK_SECRET = 'telegram-secret';
      const { service } = createService();

      const readiness = (service as any).buildIntegrationReadiness([]);
      const sender = readiness.items.find(
        (item: { key: string }) => item.key === 'TELEGRAM_AUTH_REPLY_SENDER',
      );
      const senderText = JSON.stringify(sender);

      expect(sender).toMatchObject({
        status: 'MANUAL_ONLY',
        ready: false,
        configured: false,
        enabled: false,
        requiredEnv: [
          'GUEST_GAME_TG_EDGE_SHARED_SECRET or GUEST_GAME_TELEGRAM_WEBHOOK_REPLY_ENABLED',
          'GUEST_GAME_TELEGRAM_WEBHOOK_REPLY_BOT_TOKEN or GUEST_GAME_TELEGRAM_BOT_TOKEN',
        ],
        runbook: {
          label: 'Runbook Telegram-входа',
          path: 'docs/deployment/telegram-auth.md',
          href: 'https://github.com/boozik3412/leetplus/blob/main/docs/deployment/telegram-auth.md',
        },
      });
      expect(senderText).not.toContain('telegram-secret');
    });

    it('marks Telegram auth reply sender ready through the polling edge contract', () => {
      process.env.GUEST_GAME_TELEGRAM_WEBHOOK_SECRET = 'telegram-secret';
      process.env.GUEST_GAME_TG_EDGE_SHARED_SECRET = 'edge-secret';
      const { service } = createService();

      const readiness = (service as any).buildIntegrationReadiness([]);
      const sender = readiness.items.find(
        (item: { key: string }) => item.key === 'TELEGRAM_AUTH_REPLY_SENDER',
      );
      const senderText = JSON.stringify(sender);

      expect(sender).toMatchObject({
        status: 'READY',
        statusLabel: 'edge sender ready',
        ready: true,
        configured: true,
        enabled: true,
        requiredEnv: [],
        runbook: {
          label: 'Runbook Telegram-входа',
          path: 'docs/deployment/telegram-auth.md',
          href: 'https://github.com/boozik3412/leetplus/blob/main/docs/deployment/telegram-auth.md',
        },
      });
      expect(sender.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ label: 'Update secret' }),
          expect.objectContaining({
            label: 'Sender',
            value: '1337 polling edge',
          }),
          expect.objectContaining({ label: 'Bot token', value: 'на edge' }),
        ]),
      );
      expect(senderText).not.toContain('telegram-secret');
      expect(senderText).not.toContain('edge-secret');
    });

    it('marks Telegram bot menu ready on the polling edge contract without raw diagnostics', () => {
      process.env.GUEST_GAME_TELEGRAM_WEBHOOK_SECRET = 'telegram-secret';
      const { service } = createService();

      const readiness = (service as any).buildIntegrationReadiness([]);
      const menu = readiness.items.find(
        (item: { key: string }) => item.key === 'TELEGRAM_BOT_MENU',
      );
      const menuText = JSON.stringify(menu);

      expect(menu).toMatchObject({
        status: 'READY',
        ready: true,
        configured: true,
        enabled: true,
        requiredEnv: ['GUEST_GAME_TELEGRAM_WEBHOOK_SECRET'],
        runbook: {
          label: 'Runbook Telegram-входа',
          path: 'docs/deployment/telegram-auth.md',
          href: 'https://github.com/boozik3412/leetplus/blob/main/docs/deployment/telegram-auth.md',
        },
      });
      expect(menu.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ label: 'Sections' }),
          expect.objectContaining({ label: 'Callback answer' }),
          expect.objectContaining({ label: 'Safe payload' }),
        ]),
      );
      expect(menuText).not.toContain('telegram-secret');
      expect(menuText).not.toContain('chat:');
    });

    it('marks Telegram auth reply sender ready without exposing token values', () => {
      process.env.GUEST_GAME_TELEGRAM_WEBHOOK_SECRET = 'telegram-secret';
      process.env.GUEST_GAME_TELEGRAM_WEBHOOK_REPLY_ENABLED = 'true';
      process.env.GUEST_GAME_TELEGRAM_WEBHOOK_REPLY_BOT_TOKEN =
        'telegram-token';
      const { service } = createService();

      const readiness = (service as any).buildIntegrationReadiness([]);
      const sender = readiness.items.find(
        (item: { key: string }) => item.key === 'TELEGRAM_AUTH_REPLY_SENDER',
      );
      const senderText = JSON.stringify(sender);

      expect(sender).toMatchObject({
        status: 'READY',
        ready: true,
        configured: true,
        enabled: true,
        requiredEnv: [],
        runbook: {
          label: 'Runbook Telegram-входа',
          path: 'docs/deployment/telegram-auth.md',
          href: 'https://github.com/boozik3412/leetplus/blob/main/docs/deployment/telegram-auth.md',
        },
      });
      expect(sender.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ label: 'Update secret' }),
          expect.objectContaining({ label: 'Sender' }),
          expect.objectContaining({ label: 'Bot token' }),
        ]),
      );
      expect(senderText).not.toContain('telegram-secret');
      expect(senderText).not.toContain('telegram-token');
    });

    it('marks Telegram Mini App ready without exposing bot token values', () => {
      process.env.GUEST_GAME_TELEGRAM_BOT_USERNAME = 'leetplus_bot';
      process.env.GUEST_GAME_TELEGRAM_MINI_APP_BOT_TOKEN = 'mini-app-token';
      process.env.GUEST_GAME_TELEGRAM_MINI_APP_URL =
        'https://leetplus.ru/game/app';
      const { service } = createService();

      const readiness = (service as any).buildIntegrationReadiness([]);
      const miniApp = readiness.items.find(
        (item: { key: string }) => item.key === 'TELEGRAM_MINI_APP',
      );
      const miniAppText = JSON.stringify(miniApp);

      expect(miniApp).toMatchObject({
        status: 'READY',
        ready: true,
        configured: true,
        enabled: true,
        requiredEnv: [],
        runbook: {
          label: 'Runbook Telegram-входа',
          path: 'docs/deployment/telegram-auth.md',
          href: 'https://github.com/boozik3412/leetplus/blob/main/docs/deployment/telegram-auth.md',
        },
      });
      expect(miniApp.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            label: 'Route',
            value: '/game/app?tab=quests|rewards|profile',
          }),
          expect.objectContaining({
            label: 'Bot username',
            value: 'настроен',
          }),
          expect.objectContaining({
            label: 'initData token',
            value: 'настроен',
          }),
        ]),
      );
      expect(miniAppText).not.toContain('mini-app-token');
    });

    it('marks Telegram Mini App ready with edge assertion instead of bot token on main API', () => {
      process.env.GUEST_GAME_TELEGRAM_BOT_USERNAME = 'leetplus_bot';
      process.env.GUEST_GAME_TELEGRAM_MINI_APP_URL =
        'https://tg.leetplus.example/game/app';
      process.env.GUEST_GAME_TG_EDGE_SHARED_SECRET = 'edge-secret';
      const { service } = createService();

      const readiness = (service as any).buildIntegrationReadiness([]);
      const miniApp = readiness.items.find(
        (item: { key: string }) => item.key === 'TELEGRAM_MINI_APP',
      );
      const miniAppText = JSON.stringify(miniApp);

      expect(miniApp).toMatchObject({
        status: 'READY',
        ready: true,
        configured: true,
        requiredEnv: [],
      });
      expect(miniApp.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            label: 'initData token',
            value: 'edge/shared',
          }),
          expect.objectContaining({
            label: 'Edge assertion',
            value: 'настроен',
          }),
        ]),
      );
      expect(miniAppText).not.toContain('edge-secret');
    });

    it('shows bonus ledger scheduler as blocked until service scheduling is configured', () => {
      const { service } = createService();

      const readiness = (service as any).buildIntegrationReadiness([]);
      const scheduler = readiness.items.find(
        (item: { key: string }) => item.key === 'BONUS_LEDGER_SCHEDULER',
      );

      expect(scheduler).toMatchObject({
        status: 'BLOCKED',
        ready: false,
        configured: false,
        enabled: false,
        runbook: {
          label: 'Runbook scheduler',
          path: 'docs/deployment/bonus-ledger-scheduler.md',
          href: 'https://github.com/boozik3412/leetplus/blob/main/docs/deployment/bonus-ledger-scheduler.md',
        },
      });
      expect(scheduler.requiredEnv).toContain('SYNC_SERVICE_TOKEN');
      expect(scheduler.requiredEnv).toContain('LANGAME_BONUS_ACCRUAL_ENABLED');
    });

    it('marks bonus ledger scheduler ready only when production scheduling and Langame write are enabled', () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      process.env.SYNC_SERVICE_TOKEN = 'sync-token';
      process.env.LANGAME_BONUS_ACCRUAL_ENABLED = 'true';
      process.env.GUEST_GAME_BONUS_LEDGER_SCHEDULER_INTERVAL_MS = '60000';
      process.env.GUEST_GAME_BONUS_LEDGER_SCHEDULER_LIMIT = '7';
      process.env.GUEST_GAME_BONUS_LEDGER_SCHEDULER_TENANT_SLUG = 'demo';
      process.env.GUEST_GAME_BONUS_LEDGER_SCHEDULER_REWARD_TYPES =
        'BONUS,CASHBACK';
      const { service } = createService();

      try {
        const readiness = (service as any).buildIntegrationReadiness([]);
        const scheduler = readiness.items.find(
          (item: { key: string }) => item.key === 'BONUS_LEDGER_SCHEDULER',
        );
        const schedulerText = JSON.stringify(scheduler);

        expect(scheduler).toMatchObject({
          status: 'READY',
          statusLabel: 'автоначисление',
          ready: true,
          configured: true,
          enabled: true,
          runbook: {
            path: 'docs/deployment/bonus-ledger-scheduler.md',
          },
        });
        expect(scheduler.note).toContain('60000');
        expect(scheduler.note).toContain('demo');
        expect(scheduler.note).toContain('BONUS,CASHBACK');
        expect(schedulerText).not.toContain('sync-token');
      } finally {
        if (originalNodeEnv === undefined) {
          delete process.env.NODE_ENV;
        } else {
          process.env.NODE_ENV = originalNodeEnv;
        }
      }
    });

    it('exposes bonus ledger scheduler runtime details without sensitive data', () => {
      process.env.SYNC_SERVICE_TOKEN = 'sync-token';
      process.env.LANGAME_BONUS_ACCRUAL_ENABLED = 'true';
      const { service } = createService(
        createPrismaMock(),
        schedulerRuntimeStatus({
          enabled: true,
          intervalMs: 60000,
          lastStartedAt: '2026-06-10T10:00:00.000Z',
          lastFinishedAt: '2026-06-10T10:00:03.000Z',
          lastOutcome: 'SUCCESS',
          lastResult: {
            mode: 'READY',
            dryRun: false,
            checkedTenants: 1,
            processedTenants: 1,
            skippedTenants: 0,
            erroredTenants: 0,
            queued: 2,
            checked: 3,
            confirmed: 2,
            failed: 0,
            skipped: 1,
            blocked: 0,
          },
          lastSkippedAt: '2026-06-10T10:00:01.000Z',
          lastSkipReason: 'previous dispatch is still running',
        }),
      );

      const readiness = (service as any).buildIntegrationReadiness([]);
      const scheduler = readiness.items.find(
        (item: { key: string }) => item.key === 'BONUS_LEDGER_SCHEDULER',
      );
      const detailsText = JSON.stringify(scheduler.details);

      expect(scheduler.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            label: 'Состояние',
            value: 'включен',
          }),
          expect.objectContaining({
            label: 'Последний запуск',
            value: 'успех · 2026-06-10T10:00:03.000Z',
          }),
          expect.objectContaining({
            label: 'Последний результат',
            value:
              'mode READY, dryRun off, tenants 1/1, queued 2, confirmed 2, failed 0, blocked 0, skipped 1',
          }),
          expect.objectContaining({
            label: 'Последний skip',
            value:
              '2026-06-10T10:00:01.000Z: previous dispatch is still running',
          }),
        ]),
      );
      expect(detailsText).not.toContain('sync-token');
    });

    it('keeps bonus ledger scheduler in safe mode when dry-run is forced', () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      process.env.SYNC_SERVICE_TOKEN = 'sync-token';
      process.env.LANGAME_BONUS_ACCRUAL_ENABLED = 'true';
      process.env.GUEST_GAME_BONUS_LEDGER_SCHEDULER_DRY_RUN = 'true';
      const { service } = createService();

      try {
        const readiness = (service as any).buildIntegrationReadiness([]);
        const scheduler = readiness.items.find(
          (item: { key: string }) => item.key === 'BONUS_LEDGER_SCHEDULER',
        );

        expect(scheduler).toMatchObject({
          status: 'MANUAL_ONLY',
          statusLabel: 'dry-run',
          ready: false,
          configured: true,
          enabled: true,
        });
        expect(scheduler.note).toContain('dry-run');
      } finally {
        if (originalNodeEnv === undefined) {
          delete process.env.NODE_ENV;
        } else {
          process.env.NODE_ENV = originalNodeEnv;
        }
      }
    });

    it('keeps MAX delivery readiness partial until the live canary flag is enabled', () => {
      process.env.GUEST_GAME_DELIVERY_REAL_SEND_ENABLED = 'true';
      process.env.GUEST_GAME_MAX_DELIVERY_ENABLED = 'true';
      process.env.GUEST_GAME_MAX_DELIVERY_ENDPOINT =
        'https://max-provider.example/send';
      process.env.GUEST_GAME_MAX_BOT_TOKEN = 'max-token';
      const { service } = createService();

      const readiness = (service as any).buildIntegrationReadiness([]);
      const maxDelivery = readiness.items.find(
        (item: { key: string }) => item.key === 'MAX_DELIVERY',
      );
      const maxDeliveryText = JSON.stringify(maxDelivery);

      expect(maxDelivery).toMatchObject({
        status: 'PARTIAL',
        statusLabel: 'нужен canary',
        ready: false,
        configured: true,
        enabled: true,
      });
      expect(maxDelivery.requiredEnv).toEqual(
        expect.arrayContaining(['GUEST_GAME_MAX_DELIVERY_LIVE_CANARY_ENABLED']),
      );
      expect(maxDelivery.note).toContain('live-send заблокирован');
      expect(maxDelivery.nextAction).toContain(
        'GUEST_GAME_MAX_DELIVERY_LIVE_CANARY_ENABLED',
      );
      expect(maxDeliveryText).not.toContain('max-token');
      expect(maxDeliveryText).not.toContain(
        'https://max-provider.example/send',
      );
    });

    it('shows MAX delivery canary as explicitly allowed without exposing provider secrets', () => {
      process.env.GUEST_GAME_DELIVERY_REAL_SEND_ENABLED = 'true';
      process.env.GUEST_GAME_MAX_DELIVERY_ENABLED = 'true';
      process.env.GUEST_GAME_MAX_DELIVERY_LIVE_CANARY_ENABLED = 'true';
      process.env.GUEST_GAME_MAX_DELIVERY_ENDPOINT =
        'https://max-provider.example/send';
      process.env.GUEST_GAME_MAX_BOT_TOKEN = 'max-token';
      const { service } = createService();

      const readiness = (service as any).buildIntegrationReadiness([]);
      const maxDelivery = readiness.items.find(
        (item: { key: string }) => item.key === 'MAX_DELIVERY',
      );
      const maxDeliveryText = JSON.stringify(maxDelivery);

      expect(maxDelivery).toMatchObject({
        status: 'MANUAL_ONLY',
        statusLabel: 'canary разрешен',
        ready: false,
        configured: true,
        enabled: true,
      });
      expect(maxDelivery.requiredEnv).toEqual(
        expect.arrayContaining(['GUEST_GAME_MAX_DELIVERY_LIVE_CANARY_ENABLED']),
      );
      expect(maxDelivery.note).toContain('live-canary');
      expect(maxDelivery.nextAction).toContain('MAX canary');
      expect(maxDeliveryText).not.toContain('max-token');
      expect(maxDeliveryText).not.toContain(
        'https://max-provider.example/send',
      );
    });
  });

  describe('pilot readiness runbook', () => {
    it('recommends dry-run when pilot prerequisites are ready but no event was processed yet', () => {
      const { service } = createService();

      const readiness = (service as any).buildPilotReadiness(
        pilotReadinessInput(),
      );

      expect(readiness.runbook).toMatchObject({
        stage: 'DRY_RUN',
        canRunDryRun: true,
        canRunCanary: false,
        canRunLive: false,
        canReconcile: false,
        blockers: [],
      });
      expect(readiness.runbook.nextAction).toContain('dry-run');
      expect(readiness.targetStore).toMatchObject({
        id: 'store-1337',
        playPath: '/play/game',
      });
      expect(readiness.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            key: 'PUBLIC_REGISTRATION',
            actionHref: '/game/auth?storeId=1337',
            actionLabel: 'Открыть вход',
          }),
          expect.objectContaining({
            key: 'PUBLIC_GAME_QA',
            status: 'READY',
            ready: true,
            metric: 'вход: SMS',
            actionHref: '/game/auth',
            actionLabel: 'Открыть /game/auth',
          }),
          expect.objectContaining({
            key: 'GUEST_LOGS',
            status: 'READY',
            metric: '12 логов / 1 типов',
            actionHref: '/api/guests/gamification/guest-log-catalog/export',
            actionLabel: 'Скачать CSV',
          }),
        ]),
      );
      expect(readiness.runbook.actions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            key: 'OPEN_DRY_RUN',
            enabled: true,
          }),
          expect.objectContaining({
            key: 'QUEUE_BONUS_LEDGER',
            enabled: false,
          }),
          expect.objectContaining({
            key: 'DISPATCH_BONUS_LEDGER',
            enabled: false,
          }),
        ]),
      );
    });

    it('keeps the public QA path ready through user-call auth even when OTP is not ready', () => {
      const { service } = createService();

      const readiness = (service as any).buildPilotReadiness(
        pilotReadinessInput({
          integrationReadiness: integrationReadinessForPilot({
            otpReady: false,
            userCallReady: true,
          }),
        }),
      );

      expect(readiness.runbook).toMatchObject({
        stage: 'DRY_RUN',
        canRunDryRun: true,
        blockers: [],
      });
      expect(readiness.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            key: 'OTP',
            status: 'BLOCKED',
            ready: false,
          }),
          expect.objectContaining({
            key: 'PUBLIC_GAME_QA',
            status: 'READY',
            ready: true,
            metric: 'вход: звонок',
            actionHref: '/game/auth',
          }),
        ]),
      );
    });

    it('blocks the pilot runbook when no public game auth channel is ready', () => {
      const { service } = createService();

      const readiness = (service as any).buildPilotReadiness(
        pilotReadinessInput({
          integrationReadiness: integrationReadinessForPilot({
            otpReady: false,
          }),
        }),
      );

      expect(readiness.runbook).toMatchObject({
        stage: 'BLOCKED',
        canRunDryRun: false,
        blockers: ['Публичный QA-путь'],
      });
      expect(readiness.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            key: 'PUBLIC_GAME_QA',
            status: 'BLOCKED',
            ready: false,
            metric: 'нет готового входа',
            actionHref: '/guests/gamification',
          }),
        ]),
      );
    });

    it('blocks pilot dry-run when the selected club has no coordinates for geosearch QA', () => {
      const { service } = createService();

      const readiness = (service as any).buildPilotReadiness(
        pilotReadinessInput({
          stores: [
            pilotStoreFixture({
              latitude: null,
              longitude: null,
            }),
          ],
        }),
      );

      expect(readiness.runbook).toMatchObject({
        stage: 'BLOCKED',
        canRunDryRun: false,
        blockers: ['Карта и поиск рядом'],
      });
      expect(readiness.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            key: 'GEOSEARCH',
            status: 'BLOCKED',
            ready: false,
            metric: 'координат нет',
            nextAction: expect.stringContaining('Заполнить координаты'),
            actionHref: '/stores',
            actionLabel: 'Заполнить координаты',
          }),
        ]),
      );
    });

    it('shows empty guests/logs as a pilot data warning without blocking dry-run when rules do not depend on it', () => {
      const { service } = createService();

      const readiness = (service as any).buildPilotReadiness(
        pilotReadinessInput({
          guestLogCatalog: {
            items: [],
            mappings: [],
            summary: {
              types: 0,
              logs: 0,
              domains: 0,
              latestAt: null,
              lastSuccessfulSync: null,
            },
          },
        }),
      );

      expect(readiness.runbook).toMatchObject({
        stage: 'DRY_RUN',
        canRunDryRun: true,
      });
      expect(readiness.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            key: 'GUEST_LOGS',
            status: 'MANUAL_ONLY',
            ready: false,
            metric: 'текущие правила без guests/logs',
            nextAction: expect.stringContaining('Можно запускать dry-run'),
            actionHref: '/sync?includeGuestLogs=1',
            actionLabel: 'Открыть /sync',
          }),
        ]),
      );
    });

    it('blocks dry-run when active pilot rules depend on guests/logs but the catalog is empty', () => {
      const { service } = createService();

      const readiness = (service as any).buildPilotReadiness(
        pilotReadinessInput({
          missions: [
            activeMission({
              conditions: {
                guestLogTypes: ['session_start'],
              },
            }),
          ],
          guestLogCatalog: {
            items: [],
            mappings: [],
            summary: {
              types: 0,
              logs: 0,
              domains: 0,
              latestAt: null,
              lastSuccessfulSync: null,
            },
          },
        }),
      );

      expect(readiness.runbook).toMatchObject({
        stage: 'BLOCKED',
        canRunDryRun: false,
        blockers: ['Факты guests/logs'],
      });
      expect(readiness.runbook.nextAction).toContain('/sync');
      expect(readiness.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            key: 'GUEST_LOGS',
            status: 'BLOCKED',
            ready: false,
            metric: '0 логов / 1 правил',
            nextAction: expect.stringContaining('/sync'),
            actionHref: '/sync?includeGuestLogs=1',
            actionLabel: 'Открыть /sync',
          }),
        ]),
      );
    });

    it('shows guests/logs as checked-empty when successful sync already returned zero rows', () => {
      const { service } = createService();

      const readiness = (service as any).buildPilotReadiness(
        pilotReadinessInput({
          guestLogCatalog: {
            items: [],
            mappings: [],
            summary: {
              types: 0,
              logs: 0,
              domains: 0,
              latestAt: null,
              lastSuccessfulSync: {
                businessDate: '2026-06-17',
                updatedAt: '2026-06-17T23:54:40.526Z',
                guestLogs: 0,
                sources: 3,
                failedSources: 0,
              },
            },
          },
        }),
      );

      expect(readiness.runbook).toMatchObject({
        stage: 'DRY_RUN',
        canRunDryRun: true,
      });
      expect(readiness.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            key: 'GUEST_LOGS',
            status: 'MANUAL_ONLY',
            statusLabel: 'проверено: 0',
            nextAction: expect.stringContaining(
              'почему endpoint возвращает 0 строк',
            ),
            actionHref: '/sync?includeGuestLogs=1',
            actionLabel: 'Открыть диагностику',
          }),
        ]),
      );
    });

    it('keeps checked-empty guests/logs rules as a diagnostic warning after foundation sync', () => {
      const { service } = createService();

      const readiness = (service as any).buildPilotReadiness(
        pilotReadinessInput({
          missions: [
            activeMission({
              conditions: {
                guestLogTypes: ['session_start'],
              },
            }),
          ],
          guestLogCatalog: {
            items: [],
            mappings: [],
            summary: {
              types: 0,
              logs: 0,
              domains: 0,
              latestAt: null,
              lastSuccessfulSync: {
                businessDate: '2026-06-17',
                updatedAt: '2026-06-17T23:54:40.526Z',
                guestLogs: 0,
                sources: 3,
                failedSources: 0,
              },
            },
          },
        }),
      );

      expect(readiness.runbook).toMatchObject({
        stage: 'DRY_RUN',
        canRunDryRun: true,
        blockers: [],
      });
      expect(readiness.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            key: 'GUEST_LOGS',
            status: 'PARTIAL',
            statusLabel: '0 после sync',
            note: expect.stringContaining('Диагностика guests/logs закрыта'),
            nextAction: expect.stringContaining('Хвост закрыт'),
            actionHref: '/guests/gamification?mode=advanced&tab=lootBoxes',
            actionLabel: 'Открыть конструктор',
          }),
        ]),
      );
    });

    it('recommends one live-write canary when a bonus reward, autonomous ledger, and one scoped ledger entry are ready', () => {
      const { service } = createService();

      const readiness = (service as any).buildPilotReadiness(
        pilotReadinessInput({
          events: [eventResult()],
          rewards: [rewardResult()],
          integrationReadiness: integrationReadinessForPilot({
            ledgerReady: true,
          }),
          pilotLedgerPreflight: pilotLedgerPreflightFixture({
            status: 'READY',
            statusLabel: '1 готова',
            ready: true,
            readyCount: 1,
            pendingCount: 1,
            metric: '1 ready / 1 pending / 0 retry',
          }),
        }),
      );

      expect(readiness.runbook).toMatchObject({
        stage: 'LIVE_WRITE',
        canRunDryRun: true,
        canRunCanary: true,
        canRunLive: true,
        canReconcile: false,
      });
      expect(readiness.runbook.ledgerPreflight).toMatchObject({
        ready: true,
        readyCount: 1,
        scopedStoreId: 'store-1337',
      });
      expect(readiness.runbook.nextAction).toContain('одной бонусной награде');
      expect(readiness.runbook.actions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            key: 'QUEUE_BONUS_LEDGER',
            enabled: false,
          }),
          expect.objectContaining({
            key: 'DRY_RUN_BONUS_LEDGER',
            enabled: true,
          }),
          expect.objectContaining({
            key: 'DISPATCH_BONUS_LEDGER',
            enabled: true,
            tone: 'PRIMARY',
          }),
          expect.objectContaining({
            key: 'RECONCILE_BALANCE',
            enabled: false,
          }),
        ]),
      );
      const safeguardsText = JSON.stringify(readiness.runbook.safeguards);
      expect(safeguardsText).not.toContain('+7');
      expect(safeguardsText).not.toContain('sync-token');
    });

    it('blocks live-write canary when more than one scoped ledger entry is ready', () => {
      const { service } = createService();

      const readiness = (service as any).buildPilotReadiness(
        pilotReadinessInput({
          events: [eventResult()],
          rewards: [rewardResult()],
          integrationReadiness: integrationReadinessForPilot({
            ledgerReady: true,
          }),
          pilotLedgerPreflight: pilotLedgerPreflightFixture({
            status: 'MULTIPLE',
            statusLabel: 'дубликаты',
            ready: false,
            readyCount: 2,
            pendingCount: 2,
            metric: '2 ready / 2 pending / 0 retry',
            note: 'More than one entry is ready.',
            nextAction: 'Оставить ровно одну запись.',
          }),
        }),
      );

      expect(readiness.runbook).toMatchObject({
        stage: 'CANARY',
        canRunCanary: true,
        canRunLive: false,
      });
      expect(readiness.runbook.ledgerPreflight).toMatchObject({
        status: 'MULTIPLE',
        ready: false,
        readyCount: 2,
      });
      expect(readiness.runbook.nextAction).toContain('лишние');
      expect(readiness.runbook.actions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            key: 'QUEUE_BONUS_LEDGER',
            enabled: false,
          }),
          expect.objectContaining({
            key: 'DRY_RUN_BONUS_LEDGER',
            enabled: false,
          }),
          expect.objectContaining({
            key: 'DISPATCH_BONUS_LEDGER',
            enabled: false,
            disabledReason: expect.stringContaining('больше одной'),
          }),
        ]),
      );
    });

    it('moves to reconciliation after Langame confirms the first ledger entry', () => {
      const { service } = createService();

      const readiness = (service as any).buildPilotReadiness(
        pilotReadinessInput({
          events: [eventResult()],
          rewards: [rewardResult()],
          integrationReadiness: integrationReadinessForPilot({
            ledgerReady: true,
          }),
          pilotFirstBonusReconciliation: pilotFirstBonusReconciliationFixture({
            status: 'WAITING_SYNC',
            statusLabel: 'ждет snapshot',
            ledgerEntry: pilotFirstBonusLedgerEntryFixture(),
            metric: '100 бонусов / snapshot нужен',
            nextAction: 'Дождаться guest foundation sync и snapshot.',
          }),
        }),
      );

      expect(readiness.runbook).toMatchObject({
        stage: 'RECONCILIATION',
        canRunLive: false,
        canReconcile: true,
      });
      expect(readiness.runbook.nextAction).toContain('snapshot');
      expect(readiness.runbook.actions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            key: 'DISPATCH_BONUS_LEDGER',
            enabled: false,
          }),
          expect.objectContaining({
            key: 'RECONCILE_BALANCE',
            enabled: true,
          }),
        ]),
      );
    });

    it('keeps pilot in live-write until the scoped first bonus_balance entry is confirmed', () => {
      const { service } = createService();

      const readiness = (service as any).buildPilotReadiness(
        pilotReadinessInput({
          events: [eventResult()],
          rewards: [rewardResult()],
          integrationReadiness: integrationReadinessForPilot({
            ledgerReady: true,
          }),
          pilotLedgerPreflight: pilotLedgerPreflightFixture({
            status: 'READY',
            statusLabel: '1 готова',
            ready: true,
            readyCount: 1,
            pendingCount: 1,
          }),
          bonusLedgerAudit: {
            summary: {
              confirmed: 5,
              reconciliationPending: 0,
              reconciliationMismatch: 0,
            },
          },
          pilotFirstBonusReconciliation: pilotFirstBonusReconciliationFixture(),
        }),
      );

      expect(readiness.runbook).toMatchObject({
        stage: 'LIVE_WRITE',
        canRunLive: true,
        canReconcile: false,
      });
      expect(readiness.runbook.firstBonusReconciliation).toMatchObject({
        status: 'WAITING_LIVE',
        ledgerEntry: null,
      });
      expect(readiness.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            key: 'BALANCE_RECONCILIATION',
            ready: false,
            metric: '0 confirmed bonus_balance',
          }),
        ]),
      );
    });

    it('marks pilot ready only when the scoped first bonus_balance entry matches a snapshot', () => {
      const { service } = createService();

      const readiness = (service as any).buildPilotReadiness(
        pilotReadinessInput({
          events: [eventResult()],
          rewards: [rewardResult()],
          integrationReadiness: integrationReadinessForPilot({
            ledgerReady: true,
          }),
          pilotFirstBonusReconciliation: pilotFirstBonusReconciliationFixture({
            status: 'MATCHED',
            statusLabel: 'сверено',
            ready: true,
            ledgerEntry: pilotFirstBonusLedgerEntryFixture({
              reconciliation: {
                state: 'MATCHED',
                stateLabel: 'сошлось',
                latestSnapshotAt: '2026-06-10T12:00:00.000Z',
                latestSnapshotBalance: 150,
                expectedBalance: 150,
                diff: 0,
                note: 'Snapshot matches.',
              },
            }),
            metric: '100 бонусов / snapshot совпал',
          }),
        }),
      );

      expect(readiness.runbook).toMatchObject({
        stage: 'READY',
        canRunLive: false,
        canReconcile: true,
      });
      expect(readiness.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            key: 'BALANCE_RECONCILIATION',
            status: 'READY',
            ready: true,
            metric: '100 бонусов / snapshot совпал',
          }),
        ]),
      );
    });
  });

  describe('pilot ledger preflight', () => {
    it('returns a safe claim-order preview without raw phone data', async () => {
      const { service, prisma } = createService();
      const createdAt = new Date('2026-06-10T09:00:00.000Z');
      const ledgerRow = {
        id: 'ledger-1',
        guestId: 'guest-1',
        profileId: 'profile-1',
        rewardId: 'reward-1',
        storeId: 'store-1337',
        status: 'PENDING',
        entryType: 'EARN',
        source: 'GAMIFICATION_REWARD',
        amount: new Prisma.Decimal(50),
        balanceBefore: null,
        balanceAfter: null,
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: '1337.langame.ru',
        externalGuestId: 'lg-guest-1',
        attempts: 0,
        nextAttemptAt: null,
        processedAt: null,
        confirmedAt: null,
        failedAt: null,
        canceledAt: null,
        errorCode: null,
        errorMessage: null,
        reason: 'Quest reward',
        metadata: {
          phoneMasked: '+7 *** **-99',
          rawPhone: '79999999999',
        },
        createdAt,
        updatedAt: createdAt,
        reward: {
          id: 'reward-1',
          status: 'APPROVED',
          rewardType: 'BONUS',
          rewardLabel: 'Первый квест',
          rewardCode: 'LP-1',
          qualifiedAt: createdAt,
          paidAt: null,
        },
        profile: {
          id: 'profile-1',
          displayName: 'Игрок 1337',
          contactMasked: '+7 *** **-99',
        },
        guest: {
          id: 'guest-1',
          externalDomain: '1337.langame.ru',
          externalGuestId: 'lg-guest-1',
          fullNameMasked: 'И***',
          phoneMasked: '+7 *** **-99',
          emailMasked: null,
        },
        store: { id: 'store-1337', name: '1337' },
        createdByUser: null,
        processedByUser: null,
      };

      prisma.guestBonusLedgerEntry.count
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      prisma.$queryRaw.mockResolvedValue([{ id: 'ledger-1' }]);
      prisma.guestBonusLedgerEntry.findMany.mockResolvedValue([ledgerRow]);

      const preflight = await (service as any).getPilotBonusLedgerPreflight(
        user,
        pilotStoreFixture(),
      );

      expect(preflight).toMatchObject({
        status: 'READY',
        ready: true,
        readyCount: 1,
        pendingCount: 1,
        previewItems: [
          expect.objectContaining({
            id: 'ledger-1',
            amount: 50,
            status: 'PENDING',
            guest: expect.objectContaining({
              displayName: 'Игрок 1337',
              contact: '+7 *** **-99',
            }),
            reward: expect.objectContaining({
              rewardType: 'BONUS',
              rewardLabel: 'Первый квест',
            }),
          }),
        ],
      });
      expect(JSON.stringify(preflight)).not.toContain('79999999999');
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    });
  });

  describe('pilot first bonus reconciliation', () => {
    it('ignores money balance entries and reconciles the first scoped bonus_balance entry', async () => {
      const { service, prisma } = createService();
      const confirmedAt = new Date('2026-06-10T10:00:00.000Z');
      const snapshotDate = new Date('2026-06-10T12:00:00.000Z');
      const baseLedgerRow = {
        id: 'ledger-balance',
        guestId: 'guest-1',
        profileId: 'profile-1',
        rewardId: 'reward-1',
        storeId: 'store-1337',
        status: 'CONFIRMED',
        entryType: 'EARN',
        source: 'GAMIFICATION_REWARD',
        amount: new Prisma.Decimal(100),
        balanceBefore: new Prisma.Decimal(50),
        balanceAfter: new Prisma.Decimal(150),
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: '1337.langame.ru',
        externalGuestId: 'lg-guest-1',
        attempts: 1,
        nextAttemptAt: null,
        processedAt: confirmedAt,
        confirmedAt,
        failedAt: null,
        canceledAt: null,
        errorCode: null,
        errorMessage: null,
        reason: 'Quest reward',
        metadata: {
          phoneMasked: '+7 *** **-99',
          rawPhone: '79999999999',
          rewardType: 'BALANCE',
          langameBalanceType: 'balance',
        },
        createdAt: confirmedAt,
        updatedAt: confirmedAt,
        reward: {
          id: 'reward-1',
          status: 'APPROVED',
          rewardType: 'BALANCE',
          rewardLabel: 'Денежный баланс',
          rewardCode: 'LP-MONEY',
          qualifiedAt: confirmedAt,
          paidAt: null,
        },
        profile: {
          id: 'profile-1',
          displayName: 'Игрок 1337',
          contactMasked: '+7 *** **-99',
        },
        guest: {
          id: 'guest-1',
          externalDomain: '1337.langame.ru',
          externalGuestId: 'lg-guest-1',
          fullNameMasked: 'И***',
          phoneMasked: '+7 *** **-99',
          emailMasked: null,
        },
        store: { id: 'store-1337', name: '1337' },
        createdByUser: null,
        processedByUser: null,
      };
      const bonusLedgerRow = {
        ...baseLedgerRow,
        id: 'ledger-bonus',
        rewardId: 'reward-2',
        metadata: {
          phoneMasked: '+7 *** **-99',
          rawPhone: '79999999999',
          rewardType: 'BONUS',
          langameBalanceType: 'bonus_balance',
        },
        reward: {
          ...baseLedgerRow.reward,
          id: 'reward-2',
          rewardType: 'BONUS',
          rewardLabel: 'Первый квест',
          rewardCode: 'LP-BONUS',
        },
      };

      prisma.guestBonusLedgerEntry.findMany.mockResolvedValue([
        baseLedgerRow,
        bonusLedgerRow,
      ]);
      prisma.guestBonusBalanceSnapshot.findMany.mockResolvedValue([
        bonusBalanceSnapshotRow({
          snapshotDate,
          bonusBalance: new Prisma.Decimal(150),
        }),
      ]);

      const reconciliation = await (
        service as any
      ).getPilotFirstBonusReconciliation(user, pilotStoreFixture());

      expect(reconciliation).toMatchObject({
        status: 'MATCHED',
        ready: true,
        scopedStoreId: 'store-1337',
        ledgerEntry: expect.objectContaining({
          id: 'ledger-bonus',
          amount: 100,
          reconciliation: expect.objectContaining({
            state: 'MATCHED',
            latestSnapshotBalance: 150,
          }),
        }),
      });
      expect(prisma.guestBonusLedgerEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: user.tenantId,
            storeId: 'store-1337',
            status: 'CONFIRMED',
          }),
        }),
      );
      expect(JSON.stringify(reconciliation)).not.toContain('79999999999');
    });
  });

  describe('visual editor draft', () => {
    it('builds a preview draft without mutating live gamification rules', async () => {
      const { service, prisma } = createService();
      const store = visualEditorStore();
      const draft = visualDraftRow({ store });

      prisma.store.findFirst.mockResolvedValue(store);
      prisma.guestGameVisualDraft.findFirst.mockResolvedValue(null);
      prisma.guestGameSeason.findMany.mockResolvedValue([]);
      prisma.guestGameLootBox.findMany.mockResolvedValue([]);
      prisma.guestGameMission.findMany.mockResolvedValue([]);
      prisma.guestGamePromoCard.findMany.mockResolvedValue([]);
      prisma.guestGameVisualDraft.create.mockResolvedValue(draft);

      const result = await service.getVisualEditorPreview(user, {
        storeId: store.id,
      });

      expect(result.draft.id).toBe(draft.id);
      expect(result.summary.store.id).toBe(store.id);
      expect(prisma.guestGameVisualDraft.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: user.tenantId,
            storeId: store.id,
          }),
        }),
      );
      expect(prisma.guestGameSeason.create).not.toHaveBeenCalled();
      expect(prisma.guestGameSeason.update).not.toHaveBeenCalled();
      expect(prisma.guestGameLootBox.create).not.toHaveBeenCalled();
      expect(prisma.guestGameMission.create).not.toHaveBeenCalled();
      expect(prisma.guestGamePromoCard.create).not.toHaveBeenCalled();
    });

    it('blocks publishing enabled check-in when no reward mode is selected', async () => {
      const { service, prisma } = createService();
      const store = visualEditorStore();
      const payload = visualEditorPayload({
        checkIn: {
          enabled: true,
          rewardMode: '',
          xp: null,
          bonusAmount: null,
          rewardLabel: null,
        },
      });

      prisma.guestGameVisualDraft.findFirst.mockResolvedValue(
        visualDraftRow({ store, payload }),
      );

      await expect(
        service.publishVisualEditorDraft(user, { id: 'draft-1' }),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.guestGameVisualDraft.update).not.toHaveBeenCalled();
      expect(prisma.guestGameSeason.create).not.toHaveBeenCalled();
      expect(prisma.guestGameLootBox.create).not.toHaveBeenCalled();
      expect(prisma.guestGameMission.create).not.toHaveBeenCalled();
      expect(prisma.guestGamePromoCard.create).not.toHaveBeenCalled();
    });

    it('reports event sync differences against the published visual editor', async () => {
      const { service, prisma } = createService();
      const store = visualEditorStore({
        id: 'store-rhodonite',
        name: '1337 Родонитовая',
      });
      const publishedPayload = visualEditorPayload({
        battlePass: {
          id: null,
          enabled: false,
          title: 'Клубный сезон',
          status: 'DRAFT',
          levelCount: 4,
          xpPerLevel: 250,
          mainPrize: null,
          levelRewards: [],
        },
        lootBoxes: [
          visualLootBoxItem({
            id: 'loot-old',
            title: 'Старый кейс',
          }),
        ],
        missions: [
          visualMissionItem({
            id: 'mission-old',
            title: 'Старая миссия',
          }),
        ],
      });

      prisma.store.findMany.mockResolvedValue([store]);
      jest.spyOn(service, 'getLootBoxes').mockResolvedValue([
        activeLootBox({
          id: 'loot-new',
          name: 'Новый кейс',
          storeIds: [store.id],
        }),
      ]);
      jest.spyOn(service, 'getMissions').mockResolvedValue([
        activeMission({
          id: 'mission-new',
          name: 'Новая миссия',
          storeIds: [store.id],
        }),
      ]);
      prisma.guestGameVisualDraft.findMany.mockResolvedValue([
        visualDraftRow({
          id: 'published-1',
          store,
          storeId: store.id,
          status: 'PUBLISHED',
          payload: publishedPayload,
          publishedAt: now,
        }),
      ]);

      const result = await service.getVisualEditorEventSyncStatus(user);

      expect(result).toMatchObject({
        dirty: true,
        stores: [
          {
            storeId: store.id,
            storeName: '1337 Родонитовая',
            addedLootBoxes: ['Новый кейс'],
            removedLootBoxes: ['Старый кейс'],
            addedMissions: ['Новая миссия'],
            removedMissions: ['Старая миссия'],
          },
        ],
      });
    });

    it('saves event sync into a visual draft without mutating rule rows', async () => {
      const { service, prisma } = createService();
      const store = visualEditorStore();
      const draft = visualDraftRow({
        store,
        storeId: store.id,
        payload: visualEditorPayload({
          battlePass: {
            id: null,
            enabled: false,
            title: 'Клубный сезон',
            status: 'DRAFT',
            levelCount: 4,
            xpPerLevel: 250,
            mainPrize: null,
            levelRewards: [],
          },
          lootBoxes: [visualLootBoxItem({ id: 'loot-old', title: 'Старый кейс' })],
          missions: [],
        }),
      });

      prisma.store.findMany.mockResolvedValue([store]);
      jest.spyOn(service, 'getLootBoxes').mockResolvedValue([
        activeLootBox({
          id: 'loot-new',
          name: 'Новый кейс',
          storeIds: [store.id],
        }),
      ]);
      jest.spyOn(service, 'getMissions').mockResolvedValue([]);
      prisma.guestGameVisualDraft.findMany
        .mockResolvedValueOnce([draft])
        .mockResolvedValueOnce([]);
      prisma.guestGameVisualDraft.update.mockImplementation(({ data }) =>
        Promise.resolve(
          visualDraftRow({
            store,
            storeId: store.id,
            status: data.status,
            payload: data.payload,
          }),
        ),
      );

      const result = await service.syncVisualEditorEvents(user, {
        storeIds: [store.id],
      });

      expect(prisma.guestGameVisualDraft.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: draft.id },
          data: expect.objectContaining({
            status: 'DRAFT',
            payload: expect.objectContaining({
              lootBoxes: [
                expect.objectContaining({
                  id: 'loot-new',
                  title: 'Новый кейс',
                }),
              ],
            }),
          }),
        }),
      );
      expect(result.published).toBe(false);
      expect(prisma.guestGameLootBox.create).not.toHaveBeenCalled();
      expect(prisma.guestGameLootBox.update).not.toHaveBeenCalled();
      expect(prisma.guestGameMission.create).not.toHaveBeenCalled();
      expect(prisma.guestGameMission.update).not.toHaveBeenCalled();
    });

    it('saves new visual loot boxes into the shared rule list and keeps their ids in the draft', async () => {
      const { service, prisma } = createService();
      const store = visualEditorStore();
      const payload = visualEditorPayload({
        battlePass: {
          id: null,
          enabled: false,
          title: 'Клубный сезон',
          status: 'DRAFT',
          levelCount: 4,
          xpPerLevel: 250,
          mainPrize: null,
          levelRewards: [],
        },
        lootBoxes: [
          {
            id: null,
            title: 'Черновой лутбокс',
            status: 'ACTIVE',
            triggerKind: 'SESSION_START',
            rewardType: 'BONUS_BALANCE',
            rewardAmount: 50,
            rewardLabel: '50 бонусов',
            prizes: [
              {
                id: 'bonus-50',
                rewardType: 'BONUS_BALANCE',
                rewardAmount: 50,
                rewardLabel: '50 бонусов',
                chancePercent: 100,
              },
            ],
            condition: 'Старт сессии',
            limitPerGuest: 1,
            periodicLimitEnabled: false,
            periodicLimitPeriod: 'DAILY',
            timeWindowMode: 'ANY',
            weekdayMode: 'ANY',
            weekdays: [1, 2, 3, 4, 5, 6, 0],
            hourFrom: '10:00',
            hourTo: '16:00',
          },
        ],
      });
      const createdLootBox = {
        ...activeLootBox({
          id: 'loot-created-from-visual',
          name: 'Черновой лутбокс',
          status: 'DRAFT',
          rewardAmount: 50,
          rewardLabel: '50 бонусов',
          storeIds: [store.id],
          periodRules: { source: 'visual_editor' },
          limits: { source: 'visual_editor', perGuest: 1 },
          probabilityRules: {
            type: 'single',
            source: 'visual_editor',
            totalChancePercent: 100,
            prizes: [
              {
                rewardType: 'BONUS_BALANCE',
                rewardAmount: 50,
                rewardLabel: '50 бонусов',
                weight: 100,
                chancePercent: 100,
              },
            ],
          },
        }),
        tenantId: user.tenantId,
        createdAt: now,
        updatedAt: now,
        createdByUser: null,
      };

      prisma.store.findFirst.mockResolvedValue(store);
      prisma.guestGameVisualDraft.findFirst.mockResolvedValue(
        visualDraftRow({ store, payload }),
      );
      prisma.guestGameLootBox.create.mockResolvedValue(createdLootBox);
      prisma.guestGameVisualDraft.update.mockImplementation(({ data }) =>
        Promise.resolve(visualDraftRow({ store, payload: data.payload })),
      );

      const result = await service.updateVisualEditorDraft(user, {
        id: 'draft-1',
        storeId: store.id,
        payload,
      });

      expect(prisma.guestGameLootBox.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Черновой лутбокс',
            status: 'DRAFT',
            storeIds: [store.id],
          }),
          include: expect.any(Object),
        }),
      );
      expect(prisma.guestGameVisualDraft.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            payload: expect.objectContaining({
              lootBoxes: [
                expect.objectContaining({
                  id: 'loot-created-from-visual',
                  title: 'Черновой лутбокс',
                  status: 'DRAFT',
                }),
              ],
            }),
          }),
        }),
      );
      expect(result.payload.lootBoxes[0]?.id).toBe('loot-created-from-visual');
    });

    it('publishes visual loot boxes with multiple weighted prizes', async () => {
      const { service, prisma } = createService();
      const store = visualEditorStore();
      const payload = visualEditorPayload({
        battlePass: {
          id: null,
          enabled: false,
          title: 'Клубный сезон',
          status: 'DRAFT',
          levelCount: 4,
          xpPerLevel: 250,
          mainPrize: null,
          levelRewards: [],
        },
        lootBoxes: [
          {
            id: null,
            title: 'Призовой контейнер',
            status: 'ACTIVE',
            triggerKind: 'SESSION_START',
            rewardType: 'BONUS_BALANCE',
            rewardAmount: 50,
            rewardLabel: 'Призовой контейнер',
            prizes: [
              {
                id: 'bonus-50',
                rewardType: 'BONUS_BALANCE',
                rewardAmount: 50,
                rewardLabel: '50 бонусов',
                chancePercent: 80,
              },
              {
                id: 'promo-1000',
                rewardType: 'PROMOCODE',
                rewardAmount: 1000,
                rewardLabel: 'Промокод на 1000',
                chancePercent: 20,
              },
            ],
            condition: 'Старт сессии',
            limitPerGuest: 1,
            periodicLimitEnabled: false,
            periodicLimitPeriod: 'DAILY',
            timeWindowMode: 'ANY',
            weekdayMode: 'ANY',
            weekdays: [1, 2, 3, 4, 5, 6, 0],
            hourFrom: '10:00',
            hourTo: '16:00',
          },
        ],
      });

      prisma.guestGameVisualDraft.findFirst.mockResolvedValue(
        visualDraftRow({ store, payload }),
      );
      prisma.guestGameLootBox.create.mockResolvedValue({
        ...activeLootBox({
          id: 'loot-published',
          name: 'Призовой контейнер',
          status: 'ACTIVE',
          rewardAmount: 50,
          rewardLabel: 'Призовой контейнер',
          storeIds: [store.id],
          probabilityRules: {
            type: 'weighted',
            source: 'visual_editor',
            totalChancePercent: 100,
            prizes: [
              {
                rewardType: 'BONUS_BALANCE',
                rewardAmount: 50,
                rewardLabel: '50 бонусов',
                weight: 80,
                chancePercent: 80,
              },
              {
                rewardType: 'PROMOCODE',
                rewardAmount: 1000,
                rewardLabel: 'Промокод на 1000',
                weight: 20,
                chancePercent: 20,
              },
            ],
          },
        }),
        tenantId: user.tenantId,
        createdAt: now,
        updatedAt: now,
        createdByUser: null,
      });
      prisma.guestGameMission.findMany.mockResolvedValue([]);
      prisma.guestGameVisualDraft.update.mockResolvedValue(
        visualDraftRow({ store, payload, status: 'PUBLISHED' }),
      );

      await service.publishVisualEditorDraft(user, { id: 'draft-1' });

      expect(prisma.guestGameLootBox.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Призовой контейнер',
            probabilityRules: expect.objectContaining({
              type: 'weighted',
              totalChancePercent: 100,
              prizes: [
                expect.objectContaining({
                  rewardType: 'BONUS_BALANCE',
                  rewardAmount: 50,
                  rewardLabel: '50 бонусов',
                  weight: 80,
                  chancePercent: 80,
                }),
                expect.objectContaining({
                  rewardType: 'PROMOCODE',
                  rewardAmount: 1000,
                  rewardLabel: 'Промокод на 1000',
                  weight: 20,
                  chancePercent: 20,
                }),
              ],
            }),
          }),
        }),
      );
    });
  });

  describe('restartLootBox', () => {
    it('resets lootbox limits from now and closes unfinished rewards', async () => {
      const { service, prisma } = createService();
      const existingLootBox = activeLootBox({
        id: 'loot-restart',
        limits: { perGuestPerWeek: 2 },
      });
      const row = {
        ...existingLootBox,
        tenantId: user.tenantId,
        createdAt: now,
        updatedAt: now,
        createdByUser: null,
      };

      prisma.guestGameLootBox.findFirst.mockResolvedValue(row);
      prisma.guestGameReward.updateMany.mockResolvedValue({ count: 2 });
      prisma.guestGameLootBox.update.mockImplementation(({ data }) =>
        Promise.resolve({
          ...row,
          limits: data.limits,
          updatedAt: now,
        }),
      );

      const result = await service.restartLootBox(user, 'loot-restart');

      expect(prisma.guestGameLootBox.findFirst).toHaveBeenCalledWith({
        where: { id: 'loot-restart', tenantId: user.tenantId },
      });
      expect(prisma.guestGameReward.updateMany).toHaveBeenCalledWith({
        where: {
          tenantId: user.tenantId,
          lootBoxId: 'loot-restart',
          status: { in: ['PENDING', 'APPROVED', 'EXPIRED'] },
        },
        data: expect.objectContaining({
          status: 'CANCELED',
        }),
      });
      expect(prisma.guestGameLootBox.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'loot-restart' },
          data: {
            limits: expect.objectContaining({
              perGuestPerWeek: 2,
              restartedAt: expect.any(String),
            }),
          },
        }),
      );
      expect(result.canceledRewards).toBe(2);
      expect(result.lootBox.limits).toMatchObject({
        perGuestPerWeek: 2,
        restartedAt: expect.any(String),
      });
    });
  });

  describe('delete rule templates', () => {
    it('deletes a lootbox template and reports detached records', async () => {
      const { service, prisma } = createService();

      prisma.guestGameLootBox.findFirst.mockResolvedValue({
        id: 'loot-delete',
        tenantId: user.tenantId,
      });
      prisma.guestGameEvent.count.mockResolvedValue(2);
      prisma.guestGameReward.count.mockResolvedValue(3);
      prisma.guestGameLootBox.delete.mockResolvedValue({});

      const result = await service.deleteLootBox(user, 'loot-delete');

      expect(prisma.guestGameLootBox.findFirst).toHaveBeenCalledWith({
        where: { id: 'loot-delete', tenantId: user.tenantId },
      });
      expect(prisma.guestGameEvent.count).toHaveBeenCalledWith({
        where: { tenantId: user.tenantId, lootBoxId: 'loot-delete' },
      });
      expect(prisma.guestGameReward.count).toHaveBeenCalledWith({
        where: { tenantId: user.tenantId, lootBoxId: 'loot-delete' },
      });
      expect(prisma.guestGameLootBox.delete).toHaveBeenCalledWith({
        where: { id: 'loot-delete' },
      });
      expect(result).toEqual({
        deleted: true,
        detachedEvents: 2,
        detachedRewards: 3,
        detachedVisualEditorItems: 0,
      });
    });

    it('asks confirmation before deleting an active advanced lootbox from clubs', async () => {
      const { service, prisma } = createService();
      const store = visualEditorStore({ name: '1337-Пушкинская' });

      prisma.guestGameLootBox.findFirst.mockResolvedValue({
        id: 'loot-delete',
        tenantId: user.tenantId,
        name: 'Лутбокс тест автомат',
        status: 'ACTIVE',
        storeIds: [store.id],
      });
      prisma.store.findMany.mockResolvedValue([store]);

      await expect(service.deleteLootBox(user, 'loot-delete')).rejects.toMatchObject(
        {
          response: expect.objectContaining({
            code: 'GAME_RULE_ACTIVE',
            storeNames: [expect.stringContaining('1337-Пушкинская')],
          }),
        },
      );
      expect(prisma.guestGameEvent.count).not.toHaveBeenCalled();
      expect(prisma.guestGameReward.count).not.toHaveBeenCalled();
      expect(prisma.guestGameLootBox.delete).not.toHaveBeenCalled();
    });

    it('deletes an active advanced lootbox after confirmation', async () => {
      const { service, prisma } = createService();
      const store = visualEditorStore({ name: '1337-Пушкинская' });

      prisma.guestGameLootBox.findFirst.mockResolvedValue({
        id: 'loot-delete',
        tenantId: user.tenantId,
        name: 'Лутбокс тест автомат',
        status: 'ACTIVE',
        storeIds: [store.id],
      });
      prisma.store.findMany.mockResolvedValue([store]);
      prisma.guestGameEvent.count.mockResolvedValue(2);
      prisma.guestGameReward.count.mockResolvedValue(3);
      prisma.guestGameLootBox.delete.mockResolvedValue({});

      const result = await service.deleteLootBox(user, 'loot-delete', {
        deleteActiveRule: true,
      });

      expect(prisma.guestGameLootBox.delete).toHaveBeenCalledWith({
        where: { id: 'loot-delete' },
      });
      expect(result).toEqual({
        deleted: true,
        detachedEvents: 2,
        detachedRewards: 3,
        detachedVisualEditorItems: 0,
      });
    });

    it('blocks lootbox deletion while it is published in a club visual editor', async () => {
      const { service, prisma } = createService();
      const store = visualEditorStore({ name: '1337-Пушкинская' });
      const payload = visualEditorPayload({
        battlePass: {
          id: null,
          enabled: false,
          title: 'Клубный сезон',
          status: 'DRAFT',
          levelCount: 4,
          xpPerLevel: 250,
          mainPrize: null,
          levelRewards: [],
        },
        lootBoxes: [
          {
            id: 'loot-delete',
            title: 'Лутбокс тест автомат',
            status: 'ACTIVE',
            triggerKind: 'SESSION_START',
            rewardType: 'BONUS_BALANCE',
            rewardAmount: 50,
            rewardLabel: '50 бонусов',
            prizes: [],
            condition: 'Старт сессии',
            limitPerGuest: 1,
            periodicLimitEnabled: false,
            periodicLimitPeriod: 'DAILY',
            timeWindowMode: 'ANY',
            weekdayMode: 'ANY',
            weekdays: [1, 2, 3, 4, 5, 6, 0],
            hourFrom: '10:00',
            hourTo: '16:00',
          },
        ],
      });

      prisma.guestGameLootBox.findFirst.mockResolvedValue({
        id: 'loot-delete',
        tenantId: user.tenantId,
        name: 'Лутбокс тест автомат',
      });
      prisma.guestGameVisualDraft.findMany.mockResolvedValue([
        {
          id: 'visual-draft-published',
          storeId: store.id,
          payload,
          publishedAt: now,
          updatedAt: now,
          store,
        },
      ]);

      await expect(service.deleteLootBox(user, 'loot-delete')).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.guestGameEvent.count).not.toHaveBeenCalled();
      expect(prisma.guestGameReward.count).not.toHaveBeenCalled();
      expect(prisma.guestGameLootBox.delete).not.toHaveBeenCalled();
    });

    it('detaches a published lootbox from visual editor before confirmed deletion', async () => {
      const { service, prisma } = createService();
      const store = visualEditorStore({ name: '1337-Пушкинская' });
      const payload = visualEditorPayload({
        battlePass: {
          id: null,
          enabled: false,
          title: 'Клубный сезон',
          status: 'DRAFT',
          levelCount: 4,
          xpPerLevel: 250,
          mainPrize: null,
          levelRewards: [],
        },
        lootBoxes: [
          {
            id: 'loot-delete',
            title: 'Лутбокс тест автомат',
            status: 'ACTIVE',
            triggerKind: 'SESSION_START',
            rewardType: 'BONUS_BALANCE',
            rewardAmount: 50,
            rewardLabel: '50 бонусов',
            prizes: [],
            condition: 'Старт сессии',
            limitPerGuest: 1,
            periodicLimitEnabled: false,
            periodicLimitPeriod: 'DAILY',
            timeWindowMode: 'ANY',
            weekdayMode: 'ANY',
            weekdays: [1, 2, 3, 4, 5, 6, 0],
            hourFrom: '10:00',
            hourTo: '16:00',
          },
        ],
      });

      prisma.guestGameLootBox.findFirst.mockResolvedValue({
        id: 'loot-delete',
        tenantId: user.tenantId,
        name: 'Лутбокс тест автомат',
      });
      prisma.guestGameVisualDraft.findMany.mockResolvedValue([
        {
          id: 'visual-draft-published',
          storeId: store.id,
          status: 'PUBLISHED',
          payload,
          publishedAt: now,
          updatedAt: now,
          store,
        },
      ]);
      prisma.guestGameEvent.count.mockResolvedValue(2);
      prisma.guestGameReward.count.mockResolvedValue(3);
      prisma.guestGameVisualDraft.update.mockResolvedValue({});
      prisma.guestGameLootBox.delete.mockResolvedValue({});

      const result = await service.deleteLootBox(user, 'loot-delete', {
        detachVisualEditor: true,
      });

      expect(prisma.guestGameVisualDraft.update).toHaveBeenCalledWith({
        where: { id: 'visual-draft-published' },
        data: expect.objectContaining({
          payload: expect.objectContaining({
            lootBoxes: [],
          }),
          updatedByUserId: user.id,
        }),
      });
      expect(prisma.guestGameLootBox.delete).toHaveBeenCalledWith({
        where: { id: 'loot-delete' },
      });
      expect(result).toEqual({
        deleted: true,
        detachedEvents: 2,
        detachedRewards: 3,
        detachedVisualEditorItems: 1,
      });
    });

    it('deletes a mission template and reports detached records', async () => {
      const { service, prisma } = createService();

      prisma.guestGameMission.findFirst.mockResolvedValue({
        id: 'mission-delete',
        tenantId: user.tenantId,
      });
      prisma.guestGameEvent.count.mockResolvedValue(1);
      prisma.guestGameReward.count.mockResolvedValue(4);
      prisma.guestGameMission.delete.mockResolvedValue({});

      const result = await service.deleteMission(user, 'mission-delete');

      expect(prisma.guestGameMission.findFirst).toHaveBeenCalledWith({
        where: { id: 'mission-delete', tenantId: user.tenantId },
      });
      expect(prisma.guestGameEvent.count).toHaveBeenCalledWith({
        where: { tenantId: user.tenantId, missionId: 'mission-delete' },
      });
      expect(prisma.guestGameReward.count).toHaveBeenCalledWith({
        where: { tenantId: user.tenantId, missionId: 'mission-delete' },
      });
      expect(prisma.guestGameMission.delete).toHaveBeenCalledWith({
        where: { id: 'mission-delete' },
      });
      expect(result).toEqual({
        deleted: true,
        detachedEvents: 1,
        detachedRewards: 4,
        detachedVisualEditorItems: 0,
      });
    });

    it('blocks mission deletion while it is published in a club visual editor', async () => {
      const { service, prisma } = createService();
      const store = visualEditorStore({ name: '1337-Пушкинская' });
      const payload = visualEditorPayload({
        battlePass: {
          id: null,
          enabled: false,
          title: 'Клубный сезон',
          status: 'DRAFT',
          levelCount: 4,
          xpPerLevel: 250,
          mainPrize: null,
          levelRewards: [],
        },
        missions: [
          {
            id: 'mission-delete',
            title: 'Чекин в клубе',
            status: 'ACTIVE',
            missionType: 'DAILY',
            triggerKind: 'CHECK_IN',
            rewardType: 'BONUS_BALANCE',
            rewardAmount: 50,
            rewardLabel: '50 бонусов',
            xpReward: 25,
            progressTarget: 1,
            progressUnit: 'check-in',
          },
        ],
      });

      prisma.guestGameMission.findFirst.mockResolvedValue({
        id: 'mission-delete',
        tenantId: user.tenantId,
        name: 'Чекин в клубе',
      });
      prisma.guestGameVisualDraft.findMany.mockResolvedValue([
        {
          id: 'visual-draft-published',
          storeId: store.id,
          payload,
          publishedAt: now,
          updatedAt: now,
          store,
        },
      ]);

      await expect(
        service.deleteMission(user, 'mission-delete'),
      ).rejects.toThrow(ConflictException);
      expect(prisma.guestGameEvent.count).not.toHaveBeenCalled();
      expect(prisma.guestGameReward.count).not.toHaveBeenCalled();
      expect(prisma.guestGameMission.delete).not.toHaveBeenCalled();
    });

    it('deletes a season template and reports detached records', async () => {
      const { service, prisma } = createService();

      prisma.guestGameSeason.findFirst.mockResolvedValue({
        id: 'season-delete',
        tenantId: user.tenantId,
      });
      prisma.guestGameEvent.count.mockResolvedValue(5);
      prisma.guestGameReward.count.mockResolvedValue(6);
      prisma.guestGameSeason.delete.mockResolvedValue({});

      const result = await service.deleteSeason(user, 'season-delete');

      expect(prisma.guestGameSeason.findFirst).toHaveBeenCalledWith({
        where: { id: 'season-delete', tenantId: user.tenantId },
      });
      expect(prisma.guestGameEvent.count).toHaveBeenCalledWith({
        where: { tenantId: user.tenantId, seasonId: 'season-delete' },
      });
      expect(prisma.guestGameReward.count).toHaveBeenCalledWith({
        where: { tenantId: user.tenantId, seasonId: 'season-delete' },
      });
      expect(prisma.guestGameSeason.delete).toHaveBeenCalledWith({
        where: { id: 'season-delete' },
      });
      expect(result).toEqual({
        deleted: true,
        detachedEvents: 5,
        detachedRewards: 6,
        detachedVisualEditorItems: 0,
      });
    });

    it('blocks Battle Pass deletion while it is published in a club visual editor', async () => {
      const { service, prisma } = createService();
      const store = visualEditorStore({ name: '1337-Пушкинская' });
      const payload = visualEditorPayload({
        battlePass: {
          id: 'season-delete',
          enabled: true,
          title: 'Клубный сезон',
          status: 'ACTIVE',
          levelCount: 4,
          xpPerLevel: 250,
          mainPrize: 'Финальный приз',
          levelRewards: [{ level: 2, reward: 'Промокод' }],
        },
      });

      prisma.guestGameSeason.findFirst.mockResolvedValue({
        id: 'season-delete',
        tenantId: user.tenantId,
        name: 'Клубный сезон',
      });
      prisma.guestGameVisualDraft.findMany.mockResolvedValue([
        {
          id: 'visual-draft-published',
          storeId: store.id,
          payload,
          publishedAt: now,
          updatedAt: now,
          store,
        },
      ]);

      await expect(service.deleteSeason(user, 'season-delete')).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.guestGameEvent.count).not.toHaveBeenCalled();
      expect(prisma.guestGameReward.count).not.toHaveBeenCalled();
      expect(prisma.guestGameSeason.delete).not.toHaveBeenCalled();
    });
  });

  describe('dryRun', () => {
    it('evaluates eligible rules without creating events, rewards, or Langame writes', async () => {
      const { service, prisma, langameClient } = createService();

      jest
        .spyOn(service as any, 'resolveDryRunProfile')
        .mockResolvedValue(profileFixture());
      jest.spyOn(service, 'getLootBoxes').mockResolvedValue([]);
      jest.spyOn(service, 'getMissions').mockResolvedValue([activeMission()]);
      jest.spyOn(service, 'getSeasons').mockResolvedValue([]);
      jest.spyOn(service as any, 'getDryRunRewards').mockResolvedValue([]);

      const result = await service.dryRun(user, {
        eventType: 'SESSION_START',
        occurredAt: isoNow,
        sessionType: 'regular_session',
        sessionMinutes: 90,
      });

      expect(result.dryRun).toBe(true);
      expect(result.summary).toMatchObject({
        checkedRules: 1,
        eligibleRules: 1,
        blockedRules: 0,
        estimatedRewardAmount: 75,
        projectedXpDelta: 40,
      });
      expect(result.rules[0]).toMatchObject({
        id: 'mission-1',
        kind: 'MISSION',
        eligible: true,
        rewardAmount: 75,
        xpDelta: 40,
      });
      expect(prisma.guestGameEvent.create).not.toHaveBeenCalled();
      expect(prisma.guestGameReward.create).not.toHaveBeenCalled();
      expect(langameClient.postEndpoint).not.toHaveBeenCalled();
    });

    it('checks mission weekday limits in the selected club timezone', async () => {
      const { service } = createService();

      jest
        .spyOn(service as any, 'resolveDryRunProfile')
        .mockResolvedValue(profileFixture());
      jest.spyOn(service as any, 'assertStore').mockResolvedValue({
        id: 'store-1',
        name: '1337 Pushkinskaya',
        timeZone: 'Asia/Yekaterinburg',
      });
      jest.spyOn(service, 'getLootBoxes').mockResolvedValue([]);
      jest.spyOn(service, 'getMissions').mockResolvedValue([
        activeMission({
          conditions: { weekdaysOnly: true },
        }),
      ]);
      jest.spyOn(service, 'getSeasons').mockResolvedValue([]);
      jest.spyOn(service as any, 'getDryRunRewards').mockResolvedValue([]);

      const result = await service.dryRun(user, {
        eventType: 'SESSION_START',
        storeId: 'store-1',
        occurredAt: '2026-06-12T20:30:00.000Z',
        sessionType: 'regular_session',
      });

      expect(result.summary).toMatchObject({
        checkedRules: 1,
        eligibleRules: 0,
        blockedRules: 1,
      });
      expect(result.rules[0]).toMatchObject({
        id: 'mission-1',
        kind: 'MISSION',
        eligible: false,
      });
    });

    it('allows mission weekend limits in the selected club timezone', async () => {
      const { service } = createService();

      jest
        .spyOn(service as any, 'resolveDryRunProfile')
        .mockResolvedValue(profileFixture());
      jest.spyOn(service as any, 'assertStore').mockResolvedValue({
        id: 'store-1',
        name: '1337 Pushkinskaya',
        timeZone: 'Asia/Yekaterinburg',
      });
      jest.spyOn(service, 'getLootBoxes').mockResolvedValue([]);
      jest.spyOn(service, 'getMissions').mockResolvedValue([
        activeMission({
          conditions: {
            weekdayMode: 'WEEKENDS',
            weekdays: [0, 6],
          },
        }),
      ]);
      jest.spyOn(service, 'getSeasons').mockResolvedValue([]);
      jest.spyOn(service as any, 'getDryRunRewards').mockResolvedValue([]);

      const result = await service.dryRun(user, {
        eventType: 'SESSION_START',
        storeId: 'store-1',
        occurredAt: '2026-06-12T20:30:00.000Z',
        sessionType: 'regular_session',
      });

      expect(result.summary).toMatchObject({
        checkedRules: 1,
        eligibleRules: 1,
        blockedRules: 0,
      });
      expect(result.rules[0]).toMatchObject({
        id: 'mission-1',
        kind: 'MISSION',
        eligible: true,
      });
    });

    it('selects a loot box prize by configured weighted probabilities', async () => {
      const { service } = createService();
      const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.9);

      jest
        .spyOn(service as any, 'resolveDryRunProfile')
        .mockResolvedValue(profileFixture());
      jest.spyOn(service, 'getLootBoxes').mockResolvedValue([activeLootBox()]);
      jest.spyOn(service, 'getMissions').mockResolvedValue([]);
      jest.spyOn(service, 'getSeasons').mockResolvedValue([]);
      jest.spyOn(service as any, 'getDryRunRewards').mockResolvedValue([]);

      try {
        const result = await service.dryRun(user, {
          eventType: 'SESSION_START',
          occurredAt: isoNow,
          sessionType: 'regular_session',
        });

        expect(result.summary).toMatchObject({
          checkedRules: 1,
          eligibleRules: 1,
          estimatedRewardAmount: 200,
        });
        expect(result.rules[0]).toMatchObject({
          id: 'loot-box-1',
          kind: 'LOOT_BOX',
          eligible: true,
          rewardType: 'BONUS_BALANCE',
          rewardAmount: 200,
          rewardLabel: '200 бонусов',
          selectedRewardLabel: '200 бонусов',
          selectedReward: {
            rewardType: 'BONUS_BALANCE',
            rewardAmount: 200,
            rewardLabel: '200 бонусов',
            chancePercent: 15,
            rewardRarity: 'rare',
            rewardRarityLabel: 'Редкая',
          },
        });
      } finally {
        randomSpy.mockRestore();
      }
    });

    it('blocks packet-only session lootboxes for regular sessions in dry-run', async () => {
      const { service } = createService();

      jest
        .spyOn(service as any, 'resolveDryRunProfile')
        .mockResolvedValue(profileFixture());
      jest.spyOn(service, 'getLootBoxes').mockResolvedValue([
        activeLootBox({
          sessionType: 'packet_hours',
        }),
      ]);
      jest.spyOn(service, 'getMissions').mockResolvedValue([]);
      jest.spyOn(service, 'getSeasons').mockResolvedValue([]);
      jest.spyOn(service as any, 'getDryRunRewards').mockResolvedValue([]);

      const result = await service.dryRun(user, {
        eventType: 'SESSION_START',
        occurredAt: isoNow,
        sessionType: 'common',
        sessionPacket: 0 as any,
      });

      expect(result.summary).toMatchObject({
        checkedRules: 1,
        eligibleRules: 0,
        blockedRules: 1,
      });
      expect(result.rules[0]).toMatchObject({
        id: 'loot-box-1',
        kind: 'LOOT_BOX',
        eligible: false,
      });
    });

    it('does not grant a session-start lootbox for a session that started before rule activation', async () => {
      const { service } = createService();

      jest
        .spyOn(service as any, 'resolveDryRunProfile')
        .mockResolvedValue(profileFixture());
      jest.spyOn(service, 'getLootBoxes').mockResolvedValue([
        activeLootBox({
          updatedAt: '2026-06-10T10:00:00.000Z',
          limits: {
            activatedAt: '2026-06-10T10:00:00.000Z',
          },
        }),
      ]);
      jest.spyOn(service, 'getMissions').mockResolvedValue([]);
      jest.spyOn(service, 'getSeasons').mockResolvedValue([]);
      jest.spyOn(service as any, 'getDryRunRewards').mockResolvedValue([]);

      const result = await service.dryRun(user, {
        eventType: 'SESSION_START',
        occurredAt: '2026-06-10T09:59:59.000Z',
        sessionType: 'regular_session',
      });

      expect(result.summary).toMatchObject({
        checkedRules: 1,
        eligibleRules: 0,
        blockedRules: 1,
      });
      expect(result.rules[0]).toMatchObject({
        id: 'loot-box-1',
        kind: 'LOOT_BOX',
        eligible: false,
        blockers: expect.arrayContaining([
          'Событие произошло раньше активации правила',
        ]),
      });
    });

    it('normalizes legacy loot box bonus prize aliases to BONUS_BALANCE', async () => {
      const { service } = createService();

      jest
        .spyOn(service as any, 'resolveDryRunProfile')
        .mockResolvedValue(profileFixture());
      jest.spyOn(service, 'getLootBoxes').mockResolvedValue([
        activeLootBox({
          rewardType: 'BONUS',
          probabilityRules: {
            type: 'weighted',
            prizes: [
              {
                rewardType: 'BONUS',
                rewardAmount: 50,
                rewardLabel: '50 бонусов',
                weight: 100,
              },
            ],
          },
        }),
      ]);
      jest.spyOn(service, 'getMissions').mockResolvedValue([]);
      jest.spyOn(service, 'getSeasons').mockResolvedValue([]);
      jest.spyOn(service as any, 'getDryRunRewards').mockResolvedValue([]);

      const result = await service.dryRun(user, {
        eventType: 'SESSION_START',
        occurredAt: isoNow,
        sessionType: 'regular_session',
      });

      expect(result.rules[0]).toMatchObject({
        id: 'loot-box-1',
        kind: 'LOOT_BOX',
        eligible: true,
        rewardType: 'BONUS_BALANCE',
        rewardAmount: 50,
        selectedReward: {
          rewardType: 'BONUS_BALANCE',
          rewardAmount: 50,
          rewardLabel: '50 бонусов',
          chancePercent: 100,
          rewardRarity: 'common',
          rewardRarityLabel: 'Обычная',
        },
      });
    });

    it('blocks a loot box when the selected audience does not include the guest', async () => {
      const { service, prisma } = createService();

      jest
        .spyOn(service as any, 'resolveDryRunProfile')
        .mockResolvedValue(profileFixture());
      jest.spyOn(service, 'getLootBoxes').mockResolvedValue([
        activeLootBox({
          audience: {
            id: 'audience-vip',
            name: 'VIP guests',
            description: null,
            guestsCount: 1,
          },
        }),
      ]);
      jest.spyOn(service, 'getMissions').mockResolvedValue([]);
      jest.spyOn(service, 'getSeasons').mockResolvedValue([]);
      jest.spyOn(service as any, 'getDryRunRewards').mockResolvedValue([]);
      prisma.guestAudienceMember.findMany.mockResolvedValue([
        { audienceId: 'audience-regular' },
      ]);

      const result = await service.dryRun(user, {
        eventType: 'SESSION_START',
        occurredAt: isoNow,
        sessionType: 'regular_session',
      });

      expect(result.summary).toMatchObject({
        checkedRules: 1,
        eligibleRules: 0,
        blockedRules: 1,
      });
      expect(result.rules[0]).toMatchObject({
        id: 'loot-box-1',
        kind: 'LOOT_BOX',
        eligible: false,
        blockers: expect.arrayContaining([
          expect.stringContaining('VIP guests'),
        ]),
      });
    });

    it('allows a loot box when the selected audience includes the guest', async () => {
      const { service, prisma } = createService();

      jest
        .spyOn(service as any, 'resolveDryRunProfile')
        .mockResolvedValue(profileFixture());
      jest.spyOn(service, 'getLootBoxes').mockResolvedValue([
        activeLootBox({
          audience: {
            id: 'audience-vip',
            name: 'VIP guests',
            description: null,
            guestsCount: 1,
          },
        }),
      ]);
      jest.spyOn(service, 'getMissions').mockResolvedValue([]);
      jest.spyOn(service, 'getSeasons').mockResolvedValue([]);
      jest.spyOn(service as any, 'getDryRunRewards').mockResolvedValue([]);
      prisma.guestAudienceMember.findMany.mockResolvedValue([
        { audienceId: 'audience-vip' },
      ]);

      const result = await service.dryRun(user, {
        eventType: 'SESSION_START',
        occurredAt: isoNow,
        sessionType: 'regular_session',
      });

      expect(prisma.guestAudienceMember.findMany).toHaveBeenCalledWith({
        where: {
          tenantId: user.tenantId,
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
      expect(result.summary).toMatchObject({
        checkedRules: 1,
        eligibleRules: 1,
        blockedRules: 0,
      });
      expect(result.rules[0]).toMatchObject({
        id: 'loot-box-1',
        kind: 'LOOT_BOX',
        eligible: true,
        reasons: expect.arrayContaining([
          expect.stringContaining('VIP guests'),
        ]),
      });
    });

    it('blocks a mission until the configured progress metric reaches its target', async () => {
      const { service } = createService();

      jest
        .spyOn(service as any, 'resolveDryRunProfile')
        .mockResolvedValue(profileFixture());
      jest.spyOn(service, 'getLootBoxes').mockResolvedValue([]);
      jest.spyOn(service, 'getMissions').mockResolvedValue([
        activeMission({
          triggerKind: 'CHECK_IN',
          progressTarget: 3,
          progressUnit: 'чекин',
          conditions: {
            windowDays: 7,
            metric: {
              aggregation: 'count',
              eventTypes: ['CHECK_IN'],
              windowDays: 7,
            },
          },
        }),
      ]);
      jest.spyOn(service, 'getSeasons').mockResolvedValue([]);
      jest.spyOn(service as any, 'getDryRunRewards').mockResolvedValue([]);
      jest.spyOn(service as any, 'getDryRunProgressEvents').mockResolvedValue([
        {
          eventType: 'CHECK_IN',
          occurredAt: new Date('2026-06-09T10:00:00.000Z'),
          storeId: null,
        },
      ]);

      const result = await service.dryRun(user, {
        eventType: 'CHECK_IN',
        occurredAt: isoNow,
      });

      expect(result.rules[0]).toMatchObject({
        eligible: false,
        progress: {
          applicable: true,
          current: 2,
          target: 3,
          completed: false,
        },
      });
      expect(result.summary).toMatchObject({
        eligibleRules: 0,
        blockedRules: 1,
      });
    });

    it('makes an aggregated mission eligible on the event that reaches target', async () => {
      const { service } = createService();

      jest
        .spyOn(service as any, 'resolveDryRunProfile')
        .mockResolvedValue(profileFixture());
      jest.spyOn(service, 'getLootBoxes').mockResolvedValue([]);
      jest.spyOn(service, 'getMissions').mockResolvedValue([
        activeMission({
          triggerKind: 'CHECK_IN',
          progressTarget: 3,
          progressUnit: 'чекин',
          conditions: {
            windowDays: 7,
            metric: {
              aggregation: 'count',
              eventTypes: ['CHECK_IN'],
              windowDays: 7,
            },
          },
        }),
      ]);
      jest.spyOn(service, 'getSeasons').mockResolvedValue([]);
      jest.spyOn(service as any, 'getDryRunRewards').mockResolvedValue([]);
      jest.spyOn(service as any, 'getDryRunProgressEvents').mockResolvedValue([
        {
          eventType: 'CHECK_IN',
          occurredAt: new Date('2026-06-08T10:00:00.000Z'),
          storeId: null,
        },
        {
          eventType: 'CHECK_IN',
          occurredAt: new Date('2026-06-09T10:00:00.000Z'),
          storeId: null,
        },
      ]);

      const result = await service.dryRun(user, {
        eventType: 'CHECK_IN',
        occurredAt: isoNow,
      });

      expect(result.rules[0]).toMatchObject({
        eligible: true,
        progress: {
          applicable: true,
          current: 3,
          target: 3,
          completed: true,
        },
      });
      expect(result.summary).toMatchObject({
        eligibleRules: 1,
        blockedRules: 0,
        estimatedRewardAmount: 75,
        projectedXpDelta: 40,
      });
    });
  });

  describe('checkIn', () => {
    function mockCheckInGuestAndSession(
      service: GuestGamificationService,
      store: { id: string; name: string; timeZone?: string | null } = {
        id: 'store-1',
        name: '1337 Родонитовая',
        timeZone: 'Asia/Yekaterinburg',
      },
    ) {
      jest.spyOn(service as any, 'getTenantGuest').mockResolvedValue({
        id: 'guest-1',
        externalDomain: 'club-1',
        externalGuestId: 'lg-guest-1',
      });
      jest.spyOn(service as any, 'assertStore').mockResolvedValue({
        id: store.id,
        name: store.name,
        externalDomain: 'club-1',
        externalClubId: 'club-external-1',
        integrationSourceId: 'source-1',
        timeZone: store.timeZone ?? null,
      });
      jest.spyOn(service as any, 'findActiveCheckInSession').mockResolvedValue({
        externalDomain: 'club-1',
        externalSessionId: 'session-1',
        externalGuestId: 'lg-guest-1',
        externalClubId: 'club-external-1',
        externalUuid: 'uuid-1',
        startedAt: new Date('2026-06-10T09:45:00.000Z'),
        durationMinutes: 15,
        sessionType: 'regular_session',
        sessionPacket: false,
        store,
        raw: {},
      });
    }

    it('blocks a second check-in in the same club during the local calendar day', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-10T10:00:00.000Z'));

      try {
        const { service, prisma } = createService();
        const processEventSpy = jest.spyOn(service, 'processEvent');

        mockCheckInGuestAndSession(service);
        prisma.guestGameEvent.findMany.mockResolvedValue([
          {
            occurredAt: new Date('2026-06-10T08:00:00.000Z'),
            payload: { store: { id: 'store-1' } },
          },
        ]);

        await expect(
          service.checkIn(user, {
            guestId: 'guest-1',
            storeId: 'store-1',
          }),
        ).rejects.toThrow(BadRequestException);

        expect(prisma.guestGameEvent.findMany).toHaveBeenCalledWith({
          where: {
            tenantId: user.tenantId,
            guestId: 'guest-1',
            eventType: 'CHECK_IN',
            occurredAt: {
              gte: new Date('2026-06-09T19:00:00.000Z'),
              lt: new Date('2026-06-10T19:00:00.000Z'),
            },
          },
          select: {
            occurredAt: true,
            payload: true,
          },
          orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
          take: 100,
        });
        expect(processEventSpy).not.toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });

    it('allows a check-in in another club on the same local calendar day', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-10T10:00:00.000Z'));

      try {
        const { service, prisma } = createService();
        const processResult = {
          processed: true,
          dryRun: noRewardDryRunResult(),
          event: eventResult({ eventType: 'CHECK_IN' }),
          rewards: [],
          summary: {
            profileCreated: false,
            appliedXpDelta: 0,
            createdRewards: 0,
            queuedRewardAmount: 0,
            idempotencyKey: 'check-in:club-1:session-1:lg-guest-1',
            idempotent: false,
            langameWrite: false,
          },
          note: 'created',
        } as GuestGameProcessEventResult;
        const processEventSpy = jest
          .spyOn(service, 'processEvent')
          .mockResolvedValue(processResult);

        mockCheckInGuestAndSession(service);
        prisma.guestGameEvent.findMany.mockResolvedValue([
          {
            occurredAt: new Date('2026-06-10T08:00:00.000Z'),
            payload: { store: { id: 'store-2' } },
          },
        ]);

        const result = await service.checkIn(user, {
          guestId: 'guest-1',
          storeId: 'store-1',
        });

        expect(result.checkedIn).toBe(true);
        expect(processEventSpy).toHaveBeenCalledWith(
          user,
          expect.objectContaining({
            guestId: 'guest-1',
            storeId: 'store-1',
            eventType: 'CHECK_IN',
            suppressLootBoxRewards: true,
          }),
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('uses the selected club id when Langame clubs share one domain', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-10T10:00:00.000Z'));

      try {
        const { service, prisma, langameSettingsService, langameClient } =
          createService();
        const processResult = {
          processed: true,
          dryRun: noRewardDryRunResult(),
          event: eventResult({ eventType: 'CHECK_IN' }),
          rewards: [],
          summary: {
            profileCreated: false,
            appliedXpDelta: 0,
            createdRewards: 0,
            queuedRewardAmount: 0,
            idempotencyKey: 'check-in:shared-domain:session-push:lg-guest-1',
            idempotent: false,
            langameWrite: false,
          },
          note: 'created',
        } as GuestGameProcessEventResult;
        const processEventSpy = jest
          .spyOn(service, 'processEvent')
          .mockResolvedValue(processResult);

        jest.spyOn(service as any, 'getTenantGuest').mockResolvedValue({
          id: 'guest-1',
          externalDomain: 'shared-domain',
          externalGuestId: 'lg-guest-1',
        });
        prisma.store.findFirst.mockResolvedValue({
          id: 'store-push',
          tenantId: user.tenantId,
          name: '1337-Пушкинская',
          externalDomain: 'shared-domain',
          externalClubId: 'push-club',
          integrationSourceId: 'source-shared',
          timeZone: 'Asia/Yekaterinburg',
        });
        prisma.guestGameEvent.findMany.mockResolvedValue([]);
        langameSettingsService.resolveTenantAccess.mockResolvedValue({
          apiKey: 'api-key',
          sources: [
            {
              id: 'source-shared',
              domain: 'shared-domain',
              baseUrl: 'https://langame.example',
            },
          ],
        });
        langameClient.listGuestSessions.mockResolvedValue([
          {
            id: 'session-holmogorova',
            guest_id: null,
            real_guest_id: 'lg-guest-1',
            list_clubs_id: 'holm-club',
            date_start: '2026-06-10 09:30:00',
            date_stop: null,
            packet: 0,
            UUID: 'uuid-holmogorova',
          },
          {
            id: 'session-push',
            guest_id: null,
            real_guest_id: 'lg-guest-1',
            list_clubs_id: 'push-club',
            date_start: '2026-06-10 09:45:00',
            date_stop: null,
            packet: 0,
            UUID: 'uuid-push',
          },
        ]);

        const result = await service.checkIn(user, {
          guestId: 'guest-1',
          storeId: 'store-push',
        });

        expect(result.liveSession.externalSessionId).toBe('session-push');
        expect(result.liveSession.store).toEqual({
          id: 'store-push',
          name: '1337-Пушкинская',
        });
        expect(processEventSpy).toHaveBeenCalledWith(
          user,
          expect.objectContaining({
            guestId: 'guest-1',
            storeId: 'store-push',
            eventType: 'CHECK_IN',
            sourceFactId: 'session-push',
            externalDomain: 'shared-domain',
          }),
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('accepts a selected-club session when Langame omits the session club id', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-10T10:00:00.000Z'));

      try {
        const { service, prisma, langameSettingsService, langameClient } =
          createService();
        const processResult = {
          processed: true,
          dryRun: noRewardDryRunResult(),
          event: eventResult({ eventType: 'CHECK_IN' }),
          rewards: [],
          summary: {
            profileCreated: false,
            appliedXpDelta: 0,
            createdRewards: 0,
            queuedRewardAmount: 0,
            idempotencyKey:
              'check-in:shared-domain:session-without-club:lg-guest-1',
            idempotent: false,
            langameWrite: false,
          },
          note: 'created',
        } as GuestGameProcessEventResult;
        const processEventSpy = jest
          .spyOn(service, 'processEvent')
          .mockResolvedValue(processResult);

        jest.spyOn(service as any, 'getTenantGuest').mockResolvedValue({
          id: 'guest-1',
          externalDomain: 'shared-domain',
          externalGuestId: 'lg-guest-1',
        });
        prisma.store.findFirst.mockResolvedValue({
          id: 'store-push',
          tenantId: user.tenantId,
          name: '1337-Пушкинская',
          externalDomain: 'shared-domain',
          externalClubId: 'push-club',
          integrationSourceId: 'source-shared',
          timeZone: 'Asia/Yekaterinburg',
        });
        prisma.guestGameEvent.findMany.mockResolvedValue([]);
        langameSettingsService.resolveTenantAccess.mockResolvedValue({
          apiKey: 'api-key',
          sources: [
            {
              id: 'source-shared',
              domain: 'shared-domain',
              baseUrl: 'https://langame.example',
            },
          ],
        });
        langameClient.listGuestSessions.mockResolvedValue([
          {
            id: 'session-without-club',
            guest_id: null,
            real_guest_id: 'lg-guest-1',
            list_clubs_id: null,
            date_start: '2026-06-10 09:45:00',
            date_stop: null,
            packet: 0,
            UUID: 'uuid-push',
          },
        ]);

        const result = await service.checkIn(user, {
          guestId: 'guest-1',
          storeId: 'store-push',
        });

        expect(result.liveSession.externalSessionId).toBe(
          'session-without-club',
        );
        expect(result.liveSession.store).toEqual({
          id: 'store-push',
          name: '1337-Пушкинская',
        });
        expect(processEventSpy).toHaveBeenCalledWith(
          user,
          expect.objectContaining({
            guestId: 'guest-1',
            storeId: 'store-push',
            eventType: 'CHECK_IN',
            sourceFactId: 'session-without-club',
            payload: {
              langameSessionResolution: {
                externalClubId: null,
                selectedStoreId: 'store-push',
                resolvedStoreId: 'store-push',
                storeResolvedBy: 'selected_store_fallback',
              },
            },
          }),
        );
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('processLiveSessionStart', () => {
    it('processes the open Langame session as SESSION_START with snapshot-compatible idempotency', async () => {
      const { service } = createService();
      const processResult = {
        processed: true,
        summary: {
          idempotencyKey: 'guest-game:GUEST_SESSION:SESSION_START:session-1',
        },
      } as GuestGameProcessEventResult;

      jest.spyOn(service as any, 'getTenantGuest').mockResolvedValue({
        id: 'guest-1',
        externalDomain: 'club-1',
        externalGuestId: 'lg-guest-1',
      });
      jest
        .spyOn(service as any, 'hasActiveSessionStartRules')
        .mockResolvedValue(true);
      jest.spyOn(service as any, 'assertStore').mockResolvedValue({
        id: 'store-1',
        externalDomain: 'club-1',
        externalClubId: 'club-external-1',
      });
      jest.spyOn(service as any, 'findActiveCheckInSession').mockResolvedValue({
        externalDomain: 'club-1',
        externalSessionId: 'session-1',
        externalGuestId: 'lg-guest-1',
        externalClubId: 'club-external-1',
        externalUuid: 'uuid-1',
        startedAt: new Date('2026-06-10T09:45:00.000Z'),
        durationMinutes: 15,
        sessionType: 'regular_session',
        sessionPacket: false,
        store: null,
        raw: {},
      });
      const processEventSpy = jest
        .spyOn(service, 'processEvent')
        .mockResolvedValue(processResult);

      const result = await service.processLiveSessionStart(user, {
        profileId: 'profile-1',
        guestId: 'guest-1',
        storeId: 'store-1',
      });

      expect(processEventSpy).toHaveBeenCalledWith(
        user,
        expect.objectContaining({
          profileId: 'profile-1',
          guestId: 'guest-1',
          storeId: 'store-1',
          eventType: 'SESSION_START',
          occurredAt: '2026-06-10T09:45:00.000Z',
          sourceFactKind: 'GUEST_SESSION',
          sourceFactId: 'session-1',
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: 'club-1',
          externalId: 'session-1',
          activeRulesOnly: true,
          suppressLootBoxRewards: true,
        }),
      );
      expect(result).toBe(processResult);
    });

    it('treats an already running session as packet when the guest has active package hours', async () => {
      const { service } = createService();

      jest.spyOn(service as any, 'getTenantGuest').mockResolvedValue({
        id: 'guest-1',
        externalDomain: 'club-1',
        externalGuestId: 'lg-guest-1',
        currentCountHours: '2.5',
      });
      jest
        .spyOn(service as any, 'hasActiveSessionStartRules')
        .mockResolvedValue(true);
      jest.spyOn(service as any, 'assertStore').mockResolvedValue({
        id: 'store-1',
        externalDomain: 'club-1',
        externalClubId: 'club-external-1',
      });
      jest.spyOn(service as any, 'findActiveCheckInSession').mockResolvedValue({
        externalDomain: 'club-1',
        externalSessionId: 'session-1',
        externalGuestId: 'lg-guest-1',
        externalClubId: 'club-external-1',
        externalUuid: 'uuid-1',
        startedAt: new Date('2026-06-10T09:45:00.000Z'),
        durationMinutes: 15,
        sessionType: 'regular_session',
        sessionPacket: false,
        store: null,
        raw: { packet: false },
      });
      const processEventSpy = jest
        .spyOn(service, 'processEvent')
        .mockResolvedValue({
          processed: true,
          summary: {
            idempotencyKey: 'guest-game:GUEST_SESSION:SESSION_START:session-1',
          },
        } as GuestGameProcessEventResult);

      await service.processLiveSessionStart(user, {
        profileId: 'profile-1',
        guestId: 'guest-1',
        storeId: 'store-1',
      });

      expect(processEventSpy).toHaveBeenCalledWith(
        user,
        expect.objectContaining({
          eventType: 'SESSION_START',
          sessionType: 'packet_hours',
          sessionPacket: true,
          sourceFactId: 'session-1',
        }),
      );
    });

    it('refreshes active package hours from Langame when they changed after the session started', async () => {
      const { service, langameSettingsService, langameClient } = createService();

      jest.spyOn(service as any, 'getTenantGuest').mockResolvedValue({
        id: 'guest-1',
        externalDomain: 'club-1',
        externalGuestId: 'lg-guest-1',
        currentCountHours: null,
      });
      jest
        .spyOn(service as any, 'hasActiveSessionStartRules')
        .mockResolvedValue(true);
      jest.spyOn(service as any, 'assertStore').mockResolvedValue({
        id: 'store-1',
        name: '1337-Пушкинская',
        externalDomain: 'club-1',
        externalClubId: 'club-external-1',
        integrationSourceId: 'source-1',
        timeZone: 'Asia/Yekaterinburg',
      });
      langameSettingsService.resolveTenantAccess.mockResolvedValue({
        apiKey: 'api-key',
        sources: [
          {
            id: 'source-1',
            domain: 'club-1',
            baseUrl: 'https://langame.example',
          },
        ],
      });
      langameClient.listGuestSessions.mockResolvedValue([
        {
          id: 'session-1',
          guest_id: 'lg-guest-1',
          list_clubs_id: 'club-external-1',
          date_start: '2026-06-10 09:45:00',
          date_stop: null,
          packet: 0,
        },
      ]);
      langameClient.searchGuests.mockResolvedValue({
        data: [
          {
            guest_id: 'lg-guest-1',
            current_count_hours: '5',
          },
        ],
      });
      const processEventSpy = jest
        .spyOn(service, 'processEvent')
        .mockResolvedValue({
          processed: true,
          summary: {
            idempotencyKey: 'guest-game:GUEST_SESSION:SESSION_START:session-1',
          },
        } as GuestGameProcessEventResult);

      await service.processLiveSessionStart(user, {
        profileId: 'profile-1',
        guestId: 'guest-1',
        storeId: 'store-1',
      });

      expect(langameClient.searchGuests).toHaveBeenCalledWith(
        'https://langame.example',
        'api-key',
        { guest_id: 'lg-guest-1' },
        expect.any(Object),
      );
      expect(processEventSpy).toHaveBeenCalledWith(
        user,
        expect.objectContaining({
          eventType: 'SESSION_START',
          sessionType: 'packet_hours',
          sessionPacket: true,
          sourceFactId: 'session-1',
        }),
      );
    });

    it('skips the Langame lookup when there are no active SESSION_START rules', async () => {
      const { service } = createService();

      jest.spyOn(service as any, 'getTenantGuest').mockResolvedValue({
        id: 'guest-1',
        externalDomain: 'club-1',
        externalGuestId: 'lg-guest-1',
      });
      jest
        .spyOn(service as any, 'hasActiveSessionStartRules')
        .mockResolvedValue(false);
      const findActiveSessionSpy = jest.spyOn(
        service as any,
        'findActiveCheckInSession',
      );

      const result = await service.processLiveSessionStart(user, {
        profileId: 'profile-1',
        guestId: 'guest-1',
        storeId: 'store-1',
      });

      expect(result).toBeNull();
      expect(findActiveSessionSpy).not.toHaveBeenCalled();
    });

    it('does not cache a missing live session so a fresh session can be picked up immediately', async () => {
      const { service } = createService();

      jest.spyOn(service as any, 'getTenantGuest').mockResolvedValue({
        id: 'guest-1',
        externalDomain: 'club-1',
        externalGuestId: 'lg-guest-1',
      });
      jest
        .spyOn(service as any, 'hasActiveSessionStartRules')
        .mockResolvedValue(true);
      jest.spyOn(service as any, 'assertStore').mockResolvedValue({
        id: 'store-1',
        externalDomain: 'club-1',
        externalClubId: 'club-external-1',
      });
      const findActiveSessionSpy = jest
        .spyOn(service as any, 'findActiveCheckInSession')
        .mockResolvedValue(null);

      await service.processLiveSessionStart(user, {
        profileId: 'profile-1',
        guestId: 'guest-1',
        storeId: 'store-1',
      });
      await service.processLiveSessionStart(user, {
        profileId: 'profile-1',
        guestId: 'guest-1',
        storeId: 'store-1',
      });

      expect(findActiveSessionSpy).toHaveBeenCalledTimes(2);
    });

    it('caches an already processed live session and returns the idempotent event', async () => {
      const { service } = createService();

      jest.spyOn(service as any, 'getTenantGuest').mockResolvedValue({
        id: 'guest-1',
        externalDomain: 'club-1',
        externalGuestId: 'lg-guest-1',
      });
      jest
        .spyOn(service as any, 'hasActiveSessionStartRules')
        .mockResolvedValue(true);
      jest.spyOn(service as any, 'assertStore').mockResolvedValue({
        id: 'store-1',
        externalDomain: 'club-1',
        externalClubId: 'club-external-1',
      });
      const findActiveSessionSpy = jest
        .spyOn(service as any, 'findActiveCheckInSession')
        .mockResolvedValue({
          externalDomain: 'club-1',
          externalSessionId: 'session-1',
          externalGuestId: 'lg-guest-1',
          externalClubId: 'club-external-1',
          externalUuid: 'uuid-1',
          startedAt: new Date('2026-06-10T09:45:00.000Z'),
          durationMinutes: 15,
          sessionType: 'packet_hours',
          sessionPacket: true,
          store: null,
          raw: {},
        });
      const processEventSpy = jest.spyOn(service, 'processEvent').mockResolvedValue({
        processed: true,
        dryRun: dryRunResult({
          input: {
            sessionType: 'packet_hours',
            sessionPacket: true,
            sessionMinutes: 15,
          },
        }),
        event: {
          eventType: 'SESSION_START',
          occurredAt: '2026-06-10T09:45:00.000Z',
          payload: {
            sourceFactKind: 'GUEST_SESSION',
            store: { id: 'store-1' },
            input: {
              sessionType: 'packet_hours',
              sessionPacket: true,
              sessionMinutes: 15,
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

      const first = await service.processLiveSessionStart(user, {
        profileId: 'profile-1',
        guestId: 'guest-1',
        storeId: 'store-1',
      });
      const second = await service.processLiveSessionStart(user, {
        profileId: 'profile-1',
        guestId: 'guest-1',
        storeId: 'store-1',
      });

      expect(findActiveSessionSpy).toHaveBeenCalledTimes(1);
      expect(processEventSpy).toHaveBeenCalledTimes(1);
      expect(first?.summary.idempotent).toBe(true);
      expect(second).toBe(first);
    });

    it('refreshes an idempotent live session payload when the same session becomes packet hours', async () => {
      const { service } = createService();

      jest.spyOn(service as any, 'getTenantGuest').mockResolvedValue({
        id: 'guest-1',
        externalDomain: 'club-1',
        externalGuestId: 'lg-guest-1',
      });
      jest
        .spyOn(service as any, 'hasActiveSessionStartRules')
        .mockResolvedValue(true);
      jest.spyOn(service as any, 'assertStore').mockResolvedValue({
        id: 'store-1',
        externalDomain: 'club-1',
        externalClubId: 'club-external-1',
      });
      const findActiveSessionSpy = jest
        .spyOn(service as any, 'findActiveCheckInSession')
        .mockResolvedValueOnce({
          externalDomain: 'club-1',
          externalSessionId: 'session-1',
          externalGuestId: 'lg-guest-1',
          externalClubId: 'club-external-1',
          externalUuid: 'uuid-1',
          startedAt: new Date('2026-06-10T09:45:00.000Z'),
          durationMinutes: 15,
          sessionType: 'regular_session',
          sessionPacket: false,
          store: null,
          raw: {},
        })
        .mockResolvedValueOnce({
          externalDomain: 'club-1',
          externalSessionId: 'session-1',
          externalGuestId: 'lg-guest-1',
          externalClubId: 'club-external-1',
          externalUuid: 'uuid-1',
          startedAt: new Date('2026-06-10T09:45:00.000Z'),
          durationMinutes: 15,
          sessionType: 'packet_hours',
          sessionPacket: true,
          store: null,
          raw: { packet: true },
        });
      const staleRegularEvent = eventResult({
        occurredAt: '2026-06-10T09:45:00.000Z',
        payload: {
          sourceFactKind: 'GUEST_SESSION',
          store: { id: 'store-1' },
          input: {
            sessionType: 'regular_session',
            sessionPacket: false,
            sessionMinutes: 15,
          },
        },
      });
      const processEventSpy = jest
        .spyOn(service, 'processEvent')
        .mockResolvedValueOnce({
          processed: true,
          dryRun: dryRunResult({
            input: {
              sessionType: 'regular_session',
              sessionPacket: false,
              sessionMinutes: 15,
            },
          }),
          event: staleRegularEvent,
          rewards: [],
          summary: {
            profileCreated: false,
            appliedXpDelta: 0,
            createdRewards: 0,
            queuedRewardAmount: 0,
            idempotencyKey: 'guest-game:GUEST_SESSION:SESSION_START:session-1',
            idempotent: false,
            langameWrite: false,
          },
          note: 'processed',
        })
        .mockResolvedValueOnce({
          processed: true,
          dryRun: dryRunResult({
            input: {
              sessionType: 'packet_hours',
              sessionPacket: true,
              sessionMinutes: 15,
            },
          }),
          event: staleRegularEvent,
          rewards: [],
          summary: {
            profileCreated: false,
            appliedXpDelta: 0,
            createdRewards: 0,
            queuedRewardAmount: 0,
            idempotencyKey: 'guest-game:GUEST_SESSION:SESSION_START:session-1',
            idempotent: true,
            langameWrite: false,
          },
          note: 'idempotent',
        });

      await service.processLiveSessionStart(user, {
        profileId: 'profile-1',
        guestId: 'guest-1',
        storeId: 'store-1',
      });
      const refreshed = await service.processLiveSessionStart(user, {
        profileId: 'profile-1',
        guestId: 'guest-1',
        storeId: 'store-1',
      });

      expect(findActiveSessionSpy).toHaveBeenCalledTimes(2);
      expect(processEventSpy).toHaveBeenCalledTimes(2);
      expect(refreshed?.event.payload).toMatchObject({
        input: {
          sessionType: 'packet_hours',
          sessionPacket: true,
          sessionMinutes: 15,
        },
      });
    });

    it('matches an open Langame session by real_guest_id', async () => {
      const { service, langameClient } = createService();

      langameClient.listGuestSessions.mockResolvedValue([
        {
          id: 'session-1',
          guest_id: null,
          real_guest_id: 'lg-guest-1',
          list_clubs_id: 'club-external-1',
          date_start: '2026-06-10 09:45:00',
          date_stop: null,
          packet: 1,
          UUID: 'uuid-1',
        },
      ]);

      const result = await (service as any).findCheckInSessionInSource({
        apiKey: 'api-key',
        source: {
          id: 'source-1',
          domain: 'club-1',
          baseUrl: 'https://langame.example',
        },
        externalGuestId: 'lg-guest-1',
        period: {
          dateFrom: '2026-06-10',
          dateTo: '2026-06-10',
        },
      });

      expect(result).toMatchObject({
        externalDomain: 'club-1',
        externalSessionId: 'session-1',
        externalGuestId: 'lg-guest-1',
        externalClubId: 'club-external-1',
        externalUuid: 'uuid-1',
        sessionType: 'packet_hours',
        sessionPacket: true,
      });
    });
  });

  describe('processEvent', () => {
    it('uses the generated idempotency key and keeps Langame writes disabled', async () => {
      const { service } = createService();
      const profile = profileFixture();

      jest.spyOn(service as any, 'ensureProcessProfile').mockResolvedValue({
        profile,
        profileCreated: false,
      });
      jest.spyOn(service, 'dryRun').mockResolvedValue(dryRunResult());
      jest
        .spyOn(service as any, 'createProcessEvent')
        .mockResolvedValue(eventResult());
      jest
        .spyOn(service as any, 'createProcessRewards')
        .mockResolvedValue([rewardResult()]);

      const result = await service.processEvent(user, {
        eventType: 'SESSION_START',
        sourceFactKind: 'GUEST_SESSION',
        sourceFactId: 'fact-1',
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: 'club-1',
        externalId: 'session-1',
      });

      expect(service.dryRun).toHaveBeenCalledWith(
        user,
        expect.objectContaining({
          profileId: profile.id,
          guestId: 'guest-1',
        }),
      );
      expect((service as any).createProcessEvent).toHaveBeenCalledWith(
        user,
        expect.objectContaining({
          externalId: 'guest-game:GUEST_SESSION:SESSION_START:session-1',
          xpDelta: 30,
          source: 'API_IMPORT',
        }),
      );
      expect(result.summary).toMatchObject({
        profileCreated: false,
        appliedXpDelta: 30,
        createdRewards: 1,
        queuedRewardAmount: 50,
        idempotencyKey: 'guest-game:GUEST_SESSION:SESSION_START:session-1',
        langameWrite: false,
      });
    });

    it('records session-start unlocks without queuing lootbox rewards when suppressed', async () => {
      const { service } = createService();
      const profile = profileFixture();
      const lootBoxDryRun = dryRunResult({
        summary: {
          checkedRules: 1,
          eligibleRules: 1,
          blockedRules: 0,
          estimatedRewardAmount: 100,
          projectedXpDelta: 0,
        },
        rules: [
          {
            ...dryRunResult().rules[0],
            id: 'loot-box-1',
            kind: 'LOOT_BOX',
            name: 'Session lootbox',
            rewardType: 'BONUS_BALANCE',
            rewardAmount: 100,
            rewardLabel: '100 bonuses',
            selectedRewardLabel: '100 bonuses',
            manualApprovalRequired: false,
            xpDelta: 0,
          },
        ],
      });
      const createRewardsSpy = jest.spyOn(
        service as any,
        'createProcessRewards',
      );

      jest.spyOn(service as any, 'ensureProcessProfile').mockResolvedValue({
        profile,
        profileCreated: false,
      });
      jest.spyOn(service, 'dryRun').mockResolvedValue(lootBoxDryRun);
      jest
        .spyOn(service as any, 'createProcessEvent')
        .mockResolvedValue(eventResult({ xpDelta: 0 }));

      const result = await service.processEvent(user, {
        profileId: profile.id,
        guestId: 'guest-1',
        eventType: 'SESSION_START',
        sourceFactKind: 'GUEST_SESSION',
        sourceFactId: 'session-1',
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: 'club-1',
        externalId: 'session-1',
        suppressLootBoxRewards: true,
      });

      expect(createRewardsSpy).toHaveBeenCalledWith(
        user,
        expect.objectContaining({
          suppressLootBoxRewards: true,
        }),
        expect.objectContaining({
          summary: expect.objectContaining({
            eligibleRules: 0,
            blockedRules: 1,
            estimatedRewardAmount: 0,
            projectedXpDelta: 0,
          }),
          rules: [
            expect.objectContaining({
              id: 'loot-box-1',
              kind: 'LOOT_BOX',
              eligible: false,
              blockers: expect.arrayContaining([
                'Лутбокс разблокирован: награда создается только при открытии гостем.',
              ]),
            }),
          ],
        }),
        profile.id,
        expect.objectContaining({
          externalId: 'guest-game:GUEST_SESSION:SESSION_START:session-1',
        }),
      );
      expect(result).toMatchObject({
        rewards: [],
        summary: {
          createdRewards: 0,
          queuedRewardAmount: 0,
          appliedXpDelta: 0,
        },
        dryRun: {
          summary: {
            eligibleRules: 0,
            blockedRules: 1,
            estimatedRewardAmount: 0,
          },
        },
      });
    });

    it('returns an idempotent result for an already processed external event without creating rewards', async () => {
      const { service, prisma } = createService();
      const profile = profileFixture();
      const createEventSpy = jest.spyOn(service as any, 'createProcessEvent');
      const createRewardsSpy = jest.spyOn(
        service as any,
        'createProcessRewards',
      );

      jest.spyOn(service as any, 'ensureProcessProfile').mockResolvedValue({
        profile,
        profileCreated: false,
      });
      jest.spyOn(service, 'dryRun').mockResolvedValue(noRewardDryRunResult());
      prisma.guestGameEvent.findFirst.mockResolvedValue({
        id: 'event-existing',
        eventType: 'SESSION_START',
        source: 'API_IMPORT',
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: 'club-1',
        externalId: 'guest-game:GUEST_SESSION:SESSION_START:session-1',
        xpDelta: 30,
        occurredAt: now,
        payload: null,
        note: null,
        createdAt: now,
        profile: {
          id: profile.id,
          displayName: profile.displayName,
          contactMasked: profile.contactMasked,
          xp: profile.xp,
          level: profile.level,
        },
        guest: {
          id: 'guest-1',
          externalDomain: 'club-1',
          externalGuestId: 'lg-guest-1',
          fullNameMasked: 'Guest One',
          phoneMasked: '+7 *** **-11',
        },
        lootBox: null,
        mission: null,
        season: null,
        createdByUser: null,
      });

      const result = await service.processEvent(user, {
        eventType: 'SESSION_START',
        sourceFactKind: 'GUEST_SESSION',
        sourceFactId: 'fact-1',
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: 'club-1',
        externalId: 'session-1',
      });

      expect(prisma.guestGameEvent.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: user.tenantId,
            externalProvider: IntegrationProvider.LANGAME,
            externalDomain: 'club-1',
            externalId: 'guest-game:GUEST_SESSION:SESSION_START:session-1',
          }),
        }),
      );
      expect(createEventSpy).not.toHaveBeenCalled();
      expect(createRewardsSpy).not.toHaveBeenCalled();
      expect(prisma.guestGameReward.create).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        processed: true,
        event: {
          id: 'event-existing',
          externalId: 'guest-game:GUEST_SESSION:SESSION_START:session-1',
        },
        rewards: [],
        summary: {
          appliedXpDelta: 0,
          createdRewards: 0,
          queuedRewardAmount: 0,
          idempotencyKey: 'guest-game:GUEST_SESSION:SESSION_START:session-1',
          idempotent: true,
          langameWrite: false,
        },
      });
    });

    it('repairs a loot box opening when the event exists but the reward is missing', async () => {
      const { service, prisma } = createService();
      const profile = profileFixture();
      const eventExternalId =
        'guest-game:GUEST_LOOT_BOX_OPEN:APP_OPEN:loot-open-1';
      const repairedReward = rewardResult({
        id: 'reward-loot-repaired',
        externalDomain: 'leetplus-game-app-open',
        externalId: `${eventExternalId}:reward:LOOT_BOX:loot-box-1`,
        rewardType: 'BONUS_BALANCE',
        rewardLabel: '50 bonuses',
        lootBox: {
          id: 'loot-box-1',
          name: 'Auto loot box',
          status: 'ACTIVE',
          triggerKind: 'APP_OPEN',
          segment: null,
          sessionType: null,
          periodRules: {},
          limits: { perGuestPerWeek: 2 },
          manualApprovalRequired: false,
          note: null,
        },
      });

      jest.spyOn(service as any, 'ensureProcessProfile').mockResolvedValue({
        profile,
        profileCreated: false,
      });
      jest.spyOn(service, 'dryRun').mockResolvedValue(
        dryRunResult({
          eventType: 'APP_OPEN',
          rules: [
            {
              ...dryRunResult().rules[0],
              id: 'loot-box-1',
              kind: 'LOOT_BOX',
              name: 'Auto loot box',
              rewardType: 'BONUS_BALANCE',
              rewardAmount: 50,
              rewardLabel: '50 bonuses',
              selectedRewardLabel: '50 bonuses',
              manualApprovalRequired: false,
            },
          ],
        }),
      );
      jest
        .spyOn(service as any, 'createProcessRewards')
        .mockResolvedValue([repairedReward]);
      prisma.guestGameEvent.findFirst.mockResolvedValue(
        eventResult({
          id: 'event-existing',
          eventType: 'APP_OPEN',
          externalDomain: 'leetplus-game-app-open',
          externalId: eventExternalId,
          occurredAt: now as unknown as string,
          createdAt: now as unknown as string,
          lootBox: { id: 'loot-box-1', name: 'Auto loot box' },
        }),
      );
      prisma.guestGameReward.findMany.mockResolvedValue([]);

      const result = await service.processEvent(user, {
        profileId: profile.id,
        guestId: 'guest-1',
        lootBoxId: 'loot-box-1',
        storeId: 'store-1',
        eventType: 'APP_OPEN',
        sourceFactKind: 'GUEST_LOOT_BOX_OPEN',
        sourceFactId: 'loot-open-1',
        externalDomain: 'leetplus-game-app-open',
      });

      expect((service as any).createProcessRewards).toHaveBeenCalledWith(
        user,
        expect.objectContaining({
          lootBoxId: 'loot-box-1',
          sourceFactId: 'loot-open-1',
        }),
        expect.objectContaining({ eventType: 'APP_OPEN' }),
        profile.id,
        expect.objectContaining({
          externalId: eventExternalId,
          externalDomain: 'leetplus-game-app-open',
        }),
      );
      expect(result).toMatchObject({
        processed: true,
        event: { id: 'event-existing' },
        rewards: [{ id: 'reward-loot-repaired' }],
        summary: {
          createdRewards: 1,
          queuedRewardAmount: 50,
          idempotent: true,
        },
      });
    });

    it('repairs a mission reward when the event exists but the reward is missing', async () => {
      const { service, prisma } = createService();
      const profile = profileFixture();
      const eventExternalId =
        'guest-game:GUEST_SESSION:SESSION_START:session-1';
      const repairedReward = rewardResult({
        id: 'reward-mission-repaired',
        externalId: `${eventExternalId}:reward:MISSION:mission-1`,
        rewardType: 'BONUS_BALANCE',
        rewardAmount: 50,
        rewardLabel: '50 bonus points',
        mission: {
          id: 'mission-1',
          name: 'Visit mission',
          status: 'ACTIVE',
          xpReward: 30,
        },
      });

      jest.spyOn(service as any, 'ensureProcessProfile').mockResolvedValue({
        profile,
        profileCreated: false,
      });
      jest.spyOn(service, 'dryRun').mockResolvedValue(
        dryRunResult({
          rules: [
            {
              ...dryRunResult().rules[0],
              id: 'mission-1',
              kind: 'MISSION',
              name: 'Visit mission',
              rewardType: 'BONUS_BALANCE',
              rewardAmount: 50,
              rewardLabel: '50 bonus points',
              selectedRewardLabel: '50 bonus points',
              manualApprovalRequired: false,
            },
          ],
        }),
      );
      jest
        .spyOn(service as any, 'createProcessRewards')
        .mockResolvedValue([repairedReward]);
      prisma.guestGameEvent.findFirst.mockResolvedValue(
        eventResult({
          id: 'event-existing',
          externalId: eventExternalId,
          occurredAt: now as unknown as string,
          createdAt: now as unknown as string,
        }),
      );
      prisma.guestGameReward.findMany.mockResolvedValue([]);

      const result = await service.processEvent(user, {
        profileId: profile.id,
        guestId: 'guest-1',
        eventType: 'SESSION_START',
        sourceFactKind: 'GUEST_SESSION',
        sourceFactId: 'fact-1',
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: 'club-1',
        externalId: 'session-1',
      });

      expect((service as any).createProcessRewards).toHaveBeenCalledWith(
        user,
        expect.objectContaining({
          sourceFactId: 'fact-1',
        }),
        expect.objectContaining({ eventType: 'SESSION_START' }),
        profile.id,
        expect.objectContaining({
          externalId: eventExternalId,
          externalDomain: 'club-1',
        }),
      );
      expect(result).toMatchObject({
        processed: true,
        event: { id: 'event-existing' },
        rewards: [{ id: 'reward-mission-repaired' }],
        summary: {
          createdRewards: 1,
          queuedRewardAmount: 50,
          idempotent: true,
        },
      });
    });

    it('treats a parallel unique event conflict as idempotent without creating duplicate rewards', async () => {
      const { service, prisma } = createService();
      const profile = profileFixture();
      const createRewardsSpy = jest.spyOn(
        service as any,
        'createProcessRewards',
      );

      jest.spyOn(service as any, 'ensureProcessProfile').mockResolvedValue({
        profile,
        profileCreated: false,
      });
      jest.spyOn(service, 'dryRun').mockResolvedValue(noRewardDryRunResult());
      jest
        .spyOn(service as any, 'createProcessEvent')
        .mockRejectedValue(new ConflictException('duplicate event'));
      prisma.guestGameEvent.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'event-existing',
          eventType: 'SESSION_START',
          source: 'API_IMPORT',
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: 'club-1',
          externalId: 'guest-game:GUEST_SESSION:SESSION_START:session-1',
          xpDelta: 30,
          occurredAt: now,
          payload: null,
          note: null,
          createdAt: now,
          profile: {
            id: profile.id,
            displayName: profile.displayName,
            contactMasked: profile.contactMasked,
            xp: profile.xp,
            level: profile.level,
          },
          guest: {
            id: 'guest-1',
            externalDomain: 'club-1',
            externalGuestId: 'lg-guest-1',
            fullNameMasked: 'Guest One',
            phoneMasked: '+7 *** **-11',
          },
          lootBox: null,
          mission: null,
          season: null,
          createdByUser: null,
        });

      const result = await service.processEvent(user, {
        eventType: 'SESSION_START',
        sourceFactKind: 'GUEST_SESSION',
        sourceFactId: 'fact-1',
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: 'club-1',
        externalId: 'session-1',
      });

      expect(createRewardsSpy).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        processed: true,
        event: {
          id: 'event-existing',
          externalId: 'guest-game:GUEST_SESSION:SESSION_START:session-1',
        },
        rewards: [],
        summary: {
          appliedXpDelta: 0,
          createdRewards: 0,
          queuedRewardAmount: 0,
          idempotencyKey: 'guest-game:GUEST_SESSION:SESSION_START:session-1',
          idempotent: true,
          langameWrite: false,
        },
      });
    });

    it('repairs a Battle Pass reward after a parallel unique event conflict', async () => {
      const { service, prisma } = createService();
      const profile = profileFixture();
      const eventExternalId =
        'guest-game:GUEST_SESSION:SESSION_START:session-1';
      const repairedReward = rewardResult({
        id: 'reward-season-repaired',
        externalId: `${eventExternalId}:reward:SEASON:season-1`,
        rewardType: 'BATTLE_PASS_REWARD',
        rewardAmount: 0,
        rewardLabel: 'Free drink',
        season: {
          id: 'season-1',
          name: 'Club season',
          status: 'ACTIVE',
        },
      });

      jest.spyOn(service as any, 'ensureProcessProfile').mockResolvedValue({
        profile,
        profileCreated: false,
      });
      jest.spyOn(service, 'dryRun').mockResolvedValue(
        dryRunResult({
          rules: [
            {
              ...dryRunResult().rules[0],
              id: 'season-1',
              kind: 'SEASON',
              name: 'Club season',
              rewardType: 'BATTLE_PASS_REWARD',
              rewardAmount: 0,
              rewardLabel: 'Free drink',
              selectedRewardLabel: 'Free drink',
              manualApprovalRequired: false,
            },
          ],
          summary: {
            checkedRules: 1,
            eligibleRules: 1,
            blockedRules: 0,
            estimatedRewardAmount: 0,
            projectedXpDelta: 30,
          },
        }),
      );
      jest
        .spyOn(service as any, 'createProcessEvent')
        .mockRejectedValue(new ConflictException('duplicate event'));
      jest
        .spyOn(service as any, 'createProcessRewards')
        .mockResolvedValue([repairedReward]);
      prisma.guestGameEvent.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(
          eventResult({
            id: 'event-existing',
            externalId: eventExternalId,
            occurredAt: now as unknown as string,
            createdAt: now as unknown as string,
          }),
        );
      prisma.guestGameReward.findMany.mockResolvedValue([]);

      const result = await service.processEvent(user, {
        profileId: profile.id,
        guestId: 'guest-1',
        eventType: 'SESSION_START',
        sourceFactKind: 'GUEST_SESSION',
        sourceFactId: 'fact-1',
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: 'club-1',
        externalId: 'session-1',
      });

      expect((service as any).createProcessRewards).toHaveBeenCalledWith(
        user,
        expect.objectContaining({
          sourceFactId: 'fact-1',
        }),
        expect.objectContaining({ eventType: 'SESSION_START' }),
        profile.id,
        expect.objectContaining({
          externalId: eventExternalId,
          externalDomain: 'club-1',
        }),
      );
      expect(result).toMatchObject({
        processed: true,
        event: { id: 'event-existing' },
        rewards: [{ id: 'reward-season-repaired' }],
        summary: {
          createdRewards: 1,
          queuedRewardAmount: 0,
          idempotent: true,
        },
      });
    });

    it('auto-approves rewards when the rule does not require manual approval', async () => {
      const { service } = createService();

      jest.spyOn(service as any, 'createReward').mockResolvedValue(
        rewardResult({
          status: 'APPROVED',
        }),
      );

      await (service as any).createProcessRewards(
        user,
        {
          eventType: 'SESSION_START',
          storeId: null,
        },
        dryRunResult(),
        'profile-1',
        {
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: 'club-1',
          externalId: 'session-1',
        },
      );

      expect((service as any).createReward).toHaveBeenCalledWith(
        user,
        expect.objectContaining({
          status: 'APPROVED',
          rewardType: 'BONUS',
          rewardAmount: 50,
        }),
      );
    });

    it('creates process rewards as canceled for staff test profiles when accrual is explicitly disabled', async () => {
      const { service, prisma, configService } = createService();

      configService.get.mockImplementation((key: string) =>
        key === 'GUEST_GAME_STAFF_TEST_REWARD_ACCRUAL_ENABLED'
          ? 'false'
          : undefined,
      );
      prisma.guestGameProfile.findFirst.mockResolvedValue({
        isStaffTest: true,
        staffTestReason: 'STAFF_PHONE_MATCH',
      });
      jest.spyOn(service as any, 'createReward').mockResolvedValue(
        rewardResult({
          status: 'CANCELED',
          walletState: 'CANCELED',
        }),
      );

      await (service as any).createProcessRewards(
        user,
        {
          eventType: 'SESSION_START',
          storeId: null,
        },
        dryRunResult(),
        'profile-1',
        {
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: 'club-1',
          externalId: 'session-1',
        },
      );

      expect((service as any).createReward).toHaveBeenCalledWith(
        user,
        expect.objectContaining({
          status: 'CANCELED',
          rewardType: 'BONUS',
          rewardAmount: 50,
          note: expect.stringContaining('тест сотрудника'),
          evidence: expect.objectContaining({
            staffTestBlocked: true,
            staffTestReason: 'STAFF_PHONE_MATCH',
          }),
        }),
      );
    });

    it('allows process rewards for staff test profiles by default', async () => {
      const { service, prisma } = createService();

      prisma.guestGameProfile.findFirst.mockResolvedValue({
        isStaffTest: true,
        staffTestReason: 'STAFF_PHONE_MATCH',
      });
      jest.spyOn(service as any, 'createReward').mockResolvedValue(
        rewardResult({
          status: 'APPROVED',
          walletState: 'PENDING',
        }),
      );

      await (service as any).createProcessRewards(
        user,
        {
          eventType: 'SESSION_START',
          storeId: null,
        },
        dryRunResult(),
        'profile-1',
        {
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: 'club-1',
          externalId: 'session-1',
        },
      );

      expect((service as any).createReward).toHaveBeenCalledWith(
        user,
        expect.objectContaining({
          status: 'APPROVED',
          rewardType: 'BONUS',
          rewardAmount: 50,
          note: expect.stringContaining('всех профилей'),
          evidence: expect.objectContaining({
            staffTestBlocked: false,
            staffTestReason: 'STAFF_PHONE_MATCH',
            staffTestAccrualOverride: true,
            staffTestRewardAccrualEnabled: true,
            staffTestRewardAccrualEnv:
              'GUEST_GAME_STAFF_TEST_REWARD_ACCRUAL_ENABLED',
          }),
        }),
      );
    });
  });

  describe('getSnapshotFacts', () => {
    it('exposes eligible referral registrations as profile-linked facts', async () => {
      const { service, prisma } = createService();

      prisma.guestSession.findMany.mockResolvedValue([]);
      prisma.guestLog.findMany.mockResolvedValue([]);
      prisma.guestTransaction.findMany.mockResolvedValue([]);
      prisma.guestOperationLog.findMany.mockResolvedValue([]);
      prisma.guestBalanceSnapshot.findMany.mockResolvedValue([]);
      prisma.guestBonusBalanceSnapshot.findMany.mockResolvedValue([]);
      prisma.guest.findMany.mockResolvedValue([]);
      prisma.guestGroup.findMany.mockResolvedValue([]);
      prisma.salesFact.findMany.mockResolvedValue([]);
      prisma.guestGameEvent.findMany.mockResolvedValue([
        {
          id: 'referral-event-1',
          externalProvider: null,
          externalDomain: null,
          externalId: 'otp:referral:1',
          occurredAt: now,
          payload: {
            channel: 'telegram',
            storeId: 'store-1337',
            clubId: 'demo:1337',
            referralCodeMasked: 'lp_ref_...abcd',
            inviterProfileId: 'inviter-profile-1',
            inviterGuestId: null,
            valid: true,
            selfReferral: false,
            eligibleForReward: true,
            acceptedAt: isoNow,
          },
        },
        {
          id: 'self-referral-event',
          externalProvider: null,
          externalDomain: null,
          externalId: 'otp:referral:self',
          occurredAt: now,
          payload: {
            storeId: 'store-1337',
            inviterProfileId: 'inviter-profile-1',
            valid: true,
            selfReferral: true,
            eligibleForReward: false,
          },
        },
      ]);
      prisma.guestGameProfile.findMany.mockResolvedValue([
        {
          id: 'inviter-profile-1',
          displayName: 'Inviter',
          contactMasked: '+7 *** **-55',
          guest: null,
        },
      ]);
      prisma.store.findMany.mockResolvedValue([
        { id: 'store-1337', name: '1337' },
      ]);

      const result = await service.getSnapshotFacts(user);

      expect(prisma.guestGameEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            eventType: 'GAME_REFERRAL_ACCEPTED',
            source: 'GUEST_PORTAL_REFERRAL',
          }),
        }),
      );
      expect(result.summary.referrals).toBe(1);
      expect(result.facts).toEqual([
        expect.objectContaining({
          id: 'referral:referral-event-1:inviter',
          source: 'GUEST_GAME_REFERRAL',
          eventType: 'REFERRAL_ACCEPTED',
          profileId: 'inviter-profile-1',
          guest: null,
          store: { id: 'store-1337', name: '1337' },
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: 'leetplus-referral',
          externalId: 'otp:referral:1',
        }),
      ]);
    });
  });

  describe('runSnapshotPipeline', () => {
    it('skips facts without guests, skips non-active eligible rules, and marks duplicates', async () => {
      const { service } = createService();
      const activeDryRun = dryRunResult();
      const draftDryRun = dryRunResult({
        rules: [
          {
            ...activeDryRun.rules[0],
            id: 'mission-draft',
            status: 'DRAFT',
            eligible: true,
          },
        ],
      });

      jest.spyOn(service, 'getSnapshotFacts').mockResolvedValue({
        facts: [
          snapshotFact('fact-without-guest', { guest: null }),
          snapshotFact('fact-draft'),
          snapshotFact('fact-processed'),
          snapshotFact('fact-duplicate'),
        ],
        summary: {
          sessions: 4,
          logs: 0,
          transactions: 0,
          operationLogs: 0,
          balances: 0,
          bonusBalances: 0,
          loyaltyGroups: 0,
          productExpenses: 0,
          referrals: 0,
          latestAt: isoNow,
        },
      });
      jest
        .spyOn(service, 'dryRun')
        .mockImplementation((_user, dto) =>
          Promise.resolve(
            dto.sourceFactId === 'fact-draft' ? draftDryRun : activeDryRun,
          ),
        );
      jest.spyOn(service, 'processEvent').mockImplementation((_user, dto) => {
        if (dto.sourceFactId === 'fact-duplicate') {
          return Promise.resolve(
            processResult({
              summary: {
                profileCreated: false,
                appliedXpDelta: 0,
                createdRewards: 0,
                queuedRewardAmount: 0,
                idempotencyKey:
                  'guest-game:GUEST_SESSION:SESSION_START:fact-duplicate',
                idempotent: true,
                langameWrite: false,
              },
            }),
          );
        }

        return Promise.resolve(processResult());
      });

      const result: GuestGamePipelineRunResult =
        await service.runSnapshotPipeline(user, { limit: 10 });

      expect(result).toMatchObject({
        dryRunOnly: false,
        langameWrite: false,
        availableFacts: 4,
        checkedFacts: 4,
        processedFacts: 1,
        skippedFacts: 2,
        duplicateFacts: 1,
        erroredFacts: 0,
        appliedXpDelta: 30,
        queuedRewards: 1,
        queuedRewardAmount: 50,
      });
      expect(result.facts.map((fact) => fact.status)).toEqual([
        'SKIPPED',
        'SKIPPED',
        'PROCESSED',
        'DUPLICATE',
      ]);
      expect(service.processEvent).toHaveBeenCalledTimes(2);
    });

    it('processes referral facts that are linked only to a game profile', async () => {
      const { service } = createService();
      const activeDryRun = dryRunResult({
        guest: null,
        profile: {
          id: 'inviter-profile-1',
          displayName: 'Inviter',
          contactMasked: '+7 *** **-55',
          xp: 20,
          level: 1,
          status: 'ACTIVE',
        },
      });

      jest.spyOn(service, 'getSnapshotFacts').mockResolvedValue({
        facts: [
          snapshotFact('referral-event-1', {
            source: 'GUEST_GAME_REFERRAL',
            eventType: 'REFERRAL_ACCEPTED',
            profileId: 'inviter-profile-1',
            guest: null,
            externalProvider: IntegrationProvider.LANGAME,
            externalDomain: 'leetplus-referral',
            externalId: 'referral-event-1',
            label: 'Реферал: Inviter',
          }),
        ],
        summary: {
          sessions: 0,
          logs: 0,
          transactions: 0,
          operationLogs: 0,
          balances: 0,
          bonusBalances: 0,
          loyaltyGroups: 0,
          productExpenses: 0,
          referrals: 1,
          latestAt: isoNow,
        },
      });
      jest.spyOn(service, 'dryRun').mockResolvedValue(activeDryRun);
      jest.spyOn(service, 'processEvent').mockResolvedValue(
        processResult({
          dryRun: activeDryRun,
          summary: {
            profileCreated: false,
            appliedXpDelta: activeDryRun.summary.projectedXpDelta,
            createdRewards: 1,
            queuedRewardAmount: 50,
            idempotencyKey:
              'guest-game:GUEST_GAME_REFERRAL:REFERRAL_ACCEPTED:referral-event-1',
            idempotent: false,
            langameWrite: false,
          },
        }),
      );

      const result = await service.runSnapshotPipeline(user, { limit: 10 });

      expect(result).toMatchObject({
        processedFacts: 1,
        skippedFacts: 0,
        duplicateFacts: 0,
        erroredFacts: 0,
      });
      expect(service.processEvent).toHaveBeenCalledWith(
        user,
        expect.objectContaining({
          profileId: 'inviter-profile-1',
          guestId: null,
          sourceFactKind: 'GUEST_GAME_REFERRAL',
          eventType: 'REFERRAL_ACCEPTED',
        }),
      );
    });
  });

  describe('updateReward', () => {
    it('queues and dispatches a manually approved mission bonus reward', async () => {
      const { service, prisma, bonusLedgerService } = createService();
      const mission = {
        id: 'mission-1',
        name: 'Visit mission',
        status: 'ACTIVE',
        xpReward: 30,
      };
      const pending = rewardRow({
        id: 'reward-mission-pending',
        status: 'PENDING',
        missionId: 'mission-1',
        mission,
        rewardType: 'BONUS_BALANCE',
        rewardAmount: new Prisma.Decimal(50),
        rewardLabel: '50 bonus points',
        rewardCode: null,
      });
      const approved = rewardRow({
        id: 'reward-mission-pending',
        status: 'APPROVED',
        approvedByUserId: user.id,
        missionId: 'mission-1',
        mission,
        rewardType: 'BONUS_BALANCE',
        rewardAmount: new Prisma.Decimal(50),
        rewardLabel: '50 bonus points',
        rewardCode: 'LP-50',
      });

      prisma.guestGameReward.findFirst.mockResolvedValue(pending);
      prisma.guestGameReward.update.mockResolvedValue(approved);
      jest.spyOn(service as any, 'createSystemEvent').mockResolvedValue(null);

      const result = await service.updateReward(
        user,
        'reward-mission-pending',
        {
          status: 'APPROVED',
        },
      );

      expect(prisma.guestGameReward.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'reward-mission-pending' },
          data: expect.objectContaining({
            status: 'APPROVED',
            approvedByUserId: user.id,
          }),
        }),
      );
      expect((service as any).createSystemEvent).toHaveBeenCalledWith(
        user,
        expect.objectContaining({
          eventType: 'REWARD_APPROVED',
          missionId: 'mission-1',
        }),
      );
      expect(bonusLedgerService.queueApprovedRewards).toHaveBeenCalledWith(
        user,
        {
          rewardId: 'reward-mission-pending',
          rewardTypes: ['BONUS_BALANCE'],
          limit: 1,
        },
      );
      expect(bonusLedgerService.dispatch).toHaveBeenCalledWith(user, {
        rewardId: 'reward-mission-pending',
        rewardTypes: ['BONUS_BALANCE'],
        limit: 1,
        queueApprovedRewards: false,
      });
      expect(result).toMatchObject({
        id: 'reward-mission-pending',
        status: 'APPROVED',
        rewardType: 'BONUS_BALANCE',
      });
    });
  });

  describe('redeemReward', () => {
    it('moves an approved reward to paid and writes an audit event', async () => {
      const { service, prisma } = createService();
      const approved = rewardRow();
      const paid = rewardRow({
        status: 'PAID',
        paidAt: now,
        approvedByUserId: user.id,
      });

      prisma.guestGameReward.findFirst.mockResolvedValue(approved);
      prisma.guestGameReward.update.mockResolvedValue(paid);
      jest.spyOn(service as any, 'createSystemEvent').mockResolvedValue(null);

      const result = await service.redeemReward(user, {
        rewardCode: 'LP-100',
        note: 'cashier approved',
      });

      expect(prisma.guestGameReward.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'reward-1' },
          data: expect.objectContaining({
            status: 'PAID',
            approvedByUserId: user.id,
          }),
        }),
      );
      expect((service as any).createSystemEvent).toHaveBeenCalledWith(
        user,
        expect.objectContaining({
          eventType: 'REWARD_PAID',
          profileId: 'profile-1',
          guestId: 'guest-1',
        }),
      );
      expect(result.status).toBe('PAID');
      expect(result.walletState).toBe('REDEEMED');
    });

    it('blocks pending rewards from being redeemed', async () => {
      const { service, prisma } = createService();

      prisma.guestGameReward.findFirst.mockResolvedValue(
        rewardRow({ status: 'PENDING' }),
      );

      await expect(
        service.redeemReward(user, { rewardCode: 'LP-100' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.guestGameReward.update).not.toHaveBeenCalled();
    });
  });

  describe('getBonusBalanceCurrentReconciliation', () => {
    it('keeps ledger-updated current balance waiting until a fresh Langame snapshot arrives', async () => {
      const { service, prisma } = createService();

      prisma.guestBonusBalanceCurrent.findMany.mockResolvedValue([
        bonusBalanceCurrentRow({
          bonusBalance: new Prisma.Decimal(150),
          source: 'LANGAME_LEDGER',
          snapshotDate: new Date('2026-06-10T10:00:00.000Z'),
        }),
      ]);
      prisma.guestBonusBalanceSnapshot.findMany.mockResolvedValue([
        bonusBalanceSnapshotRow({
          bonusBalance: new Prisma.Decimal(100),
          snapshotDate: new Date('2026-06-10T00:00:00.000Z'),
        }),
      ]);

      const result = await (
        service as any
      ).getBonusBalanceCurrentReconciliation(user);

      expect(result.summary).toMatchObject({
        totalCurrent: 1,
        waitingSync: 1,
        mismatched: 0,
        ledgerBacked: 1,
      });
      expect(result.items[0]).toMatchObject({
        state: 'WAITING_SYNC',
        latestSnapshotBalance: 100,
        currentBalance: 150,
        diff: -50,
      });
    });

    it('marks a fresh snapshot mismatch for manual verification', async () => {
      const { service, prisma } = createService();

      prisma.guestBonusBalanceCurrent.findMany.mockResolvedValue([
        bonusBalanceCurrentRow({
          bonusBalance: new Prisma.Decimal(150),
          snapshotDate: new Date('2026-06-10T10:00:00.000Z'),
        }),
      ]);
      prisma.guestBonusBalanceSnapshot.findMany.mockResolvedValue([
        bonusBalanceSnapshotRow({
          bonusBalance: new Prisma.Decimal(125),
          snapshotDate: new Date('2026-06-10T11:00:00.000Z'),
        }),
      ]);

      const result = await (
        service as any
      ).getBonusBalanceCurrentReconciliation(user);

      expect(result.summary).toMatchObject({
        totalCurrent: 1,
        waitingSync: 0,
        mismatched: 1,
        diffTotal: -25,
      });
      expect(result.items[0]).toMatchObject({
        state: 'MISMATCH',
        latestSnapshotBalance: 125,
        currentBalance: 150,
        diff: -25,
      });
    });
  });

  describe('prepareDeliveries', () => {
    it.each(['SENT', 'FAILED', 'CANCELED'] as const)(
      'does not overwrite terminal %s deliveries during outbox refresh',
      async (status) => {
        const { service, prisma } = createService();
        const sentDelivery = deliveryRow({
          status,
          sentAt: status === 'SENT' ? now : null,
          failedAt: status === 'FAILED' ? now : null,
          canceledAt: status === 'CANCELED' ? now : null,
        });
        jest
          .spyOn(service, 'getProfiles')
          .mockResolvedValue([profileFixture()]);
        jest.spyOn(service, 'getRewards').mockResolvedValue([rewardResult()]);
        jest
          .spyOn(service as any, 'createDeliveryEvent')
          .mockResolvedValue(null);
        prisma.guestGameDelivery.findFirst.mockResolvedValue(sentDelivery);

        const result = await service.prepareDeliveries(user, {
          includeBlocked: true,
        });

        expect(result).toMatchObject({
          created: 0,
          updated: 0,
          skipped: 1,
        });
        expect(result.deliveries[0]).toMatchObject({
          id: 'delivery-1',
          status,
        });
        expect(prisma.guestGameDelivery.update).not.toHaveBeenCalled();
        expect(prisma.guestGameDelivery.create).not.toHaveBeenCalled();
        expect((service as any).createDeliveryEvent).not.toHaveBeenCalled();
      },
    );

    it('refreshes blocked consent snapshots after profile-level Telegram consent appears', async () => {
      const { service, prisma } = createService();
      jest.spyOn(service, 'getProfiles').mockResolvedValue([profileFixture()]);
      jest.spyOn(service, 'getRewards').mockResolvedValue([rewardResult()]);
      jest.spyOn(service as any, 'createDeliveryEvent').mockResolvedValue(null);
      prisma.guestGameDelivery.findFirst.mockResolvedValue(
        deliveryRow({
          status: 'BLOCKED',
          readinessStatus: 'NEEDS_CONSENT',
        }),
      );
      prisma.guestGameDelivery.update.mockResolvedValue(
        deliveryRow({
          status: 'READY',
          readinessStatus: 'READY_FOR_BOT',
        }),
      );

      const result = await service.prepareDeliveries(user, {
        includeBlocked: true,
      });

      expect(result).toMatchObject({
        created: 0,
        updated: 1,
        skipped: 0,
      });
      expect(prisma.guestGameDelivery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'delivery-1' },
          data: expect.objectContaining({
            status: 'READY',
            readinessStatus: 'READY_FOR_BOT',
            channel: 'TELEGRAM',
          }),
        }),
      );
      expect((service as any).createDeliveryEvent).toHaveBeenCalledWith(
        user,
        'delivery-1',
        'reward-1',
        expect.objectContaining({
          eventType: 'DELIVERY_REFRESHED',
          fromStatus: 'BLOCKED',
          toStatus: 'READY',
          channel: 'TELEGRAM',
        }),
      );
    });
  });

  describe('updateDelivery', () => {
    it('returns failed ready delivery to READY and clears terminal timestamps', async () => {
      const { service, prisma } = createService();
      const failedAt = new Date('2026-06-10T09:00:00.000Z');
      const current = deliveryRow({
        status: 'FAILED',
        readinessStatus: 'READY_FOR_BOT',
        failedAt,
        note: 'telegram timeout',
      });
      prisma.guestGameDelivery.findFirst.mockResolvedValue(current);
      prisma.guestGameDelivery.update.mockResolvedValue(
        deliveryRow({
          status: 'READY',
          readinessStatus: 'READY_FOR_BOT',
          failedAt: null,
          canceledAt: null,
          note: 'retry after provider fix',
        }),
      );
      jest.spyOn(service as any, 'createDeliveryEvent').mockResolvedValue(null);

      const result = await service.updateDelivery(user, 'delivery-1', {
        status: 'READY',
        note: 'retry after provider fix',
      });

      expect(result).toMatchObject({
        id: 'delivery-1',
        status: 'READY',
        failedAt: null,
        canceledAt: null,
      });
      expect(prisma.guestGameDelivery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'delivery-1' },
          data: expect.objectContaining({
            status: 'READY',
            sentAt: null,
            failedAt: null,
            canceledAt: null,
            note: 'retry after provider fix',
          }),
        }),
      );
      expect((service as any).createDeliveryEvent).toHaveBeenCalledWith(
        user,
        'delivery-1',
        'reward-1',
        expect.objectContaining({
          eventType: 'DELIVERY_STATUS_UPDATED',
          fromStatus: 'FAILED',
          toStatus: 'READY',
          channel: 'TELEGRAM',
          note: 'retry after provider fix',
        }),
      );
    });

    it.each(['SENT', 'CANCELED'] as const)(
      'does not return terminal %s delivery to READY manually',
      async (status) => {
        const { service, prisma } = createService();
        prisma.guestGameDelivery.findFirst.mockResolvedValue(
          deliveryRow({
            status,
            sentAt: status === 'SENT' ? now : null,
            canceledAt: status === 'CANCELED' ? now : null,
          }),
        );

        await expect(
          service.updateDelivery(user, 'delivery-1', { status: 'READY' }),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(prisma.guestGameDelivery.update).not.toHaveBeenCalled();
      },
    );

    it('does not bypass readiness blockers when returning a delivery to READY', async () => {
      const { service, prisma } = createService();
      prisma.guestGameDelivery.findFirst.mockResolvedValue(
        deliveryRow({
          status: 'FAILED',
          readinessStatus: 'NEEDS_CONSENT',
          failedAt: now,
        }),
      );

      await expect(
        service.updateDelivery(user, 'delivery-1', { status: 'READY' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.guestGameDelivery.update).not.toHaveBeenCalled();
    });

    it('does not bypass readiness blockers when marking delivery as sent', async () => {
      const { service, prisma } = createService();
      prisma.guestGameDelivery.findFirst.mockResolvedValue(
        deliveryRow({
          status: 'FAILED',
          readinessStatus: 'NEEDS_CONSENT',
          failedAt: now,
        }),
      );

      await expect(
        service.updateDelivery(user, 'delivery-1', { status: 'SENT' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.guestGameDelivery.update).not.toHaveBeenCalled();
    });
  });

  describe('dispatchDeliveries', () => {
    it('records dispatcher dry-run events without sending or mutating deliveries', async () => {
      const { service, prisma } = createService();

      prisma.guestGameDelivery.findMany.mockResolvedValue([
        {
          id: 'delivery-1',
          rewardId: 'reward-1',
          profileId: 'profile-1',
          guestId: 'guest-1',
          storeId: null,
          channel: 'TELEGRAM',
          status: 'READY',
          readinessStatus: 'READY_FOR_BOT',
          recipientMasked: 'Guest One',
          channelIdentityMasked: 'tg:***',
          messageTitle: 'Reward ready',
          messageBody: 'Your reward is ready',
          blockers: [],
          metadata: {},
          preparedAt: now,
          sentAt: null,
          failedAt: null,
          canceledAt: null,
          note: null,
          createdAt: now,
          updatedAt: now,
          reward: rewardRow(),
          profile: {
            id: 'profile-1',
            displayName: 'Guest One',
            contactMasked: '+7 *** **-11',
            telegramIdentity: 'tg:123456',
            maxIdentity: null,
            xp: 120,
            level: 2,
          },
          guest: null,
          store: null,
          createdByUser: null,
          events: [],
        },
      ]);
      jest.spyOn(service as any, 'createDeliveryEvent').mockResolvedValue(null);
      jest.spyOn(service, 'getDeliveries').mockResolvedValue([]);

      const result = await service.dispatchDeliveries(user, { dryRun: true });

      expect(result).toMatchObject({
        dryRun: true,
        checked: 1,
        sent: 0,
        failed: 0,
        skipped: 1,
        blocked: 0,
      });
      expect(result.items[0]).toMatchObject({
        deliveryId: 'delivery-1',
        rewardId: 'reward-1',
        channel: 'TELEGRAM',
        status: 'DRY_RUN',
      });
      expect((service as any).createDeliveryEvent).toHaveBeenCalledWith(
        user,
        'delivery-1',
        'reward-1',
        expect.objectContaining({
          eventType: 'DELIVERY_DISPATCH_DRY_RUN',
          fromStatus: 'READY',
          toStatus: 'READY',
          channel: 'TELEGRAM',
        }),
      );
      expect(prisma.guestGameDelivery.update).not.toHaveBeenCalled();
    });

    it('blocks MAX delivery without an explicit live canary flag', async () => {
      process.env.GUEST_GAME_DELIVERY_REAL_SEND_ENABLED = 'true';
      process.env.GUEST_GAME_MAX_DELIVERY_ENABLED = 'true';
      process.env.GUEST_GAME_MAX_DELIVERY_ENDPOINT =
        'https://max-provider.example/send';
      process.env.GUEST_GAME_MAX_BOT_TOKEN = 'max-token';
      const { service, prisma } = createService();
      const fetchMock = jest
        .spyOn(globalThis, 'fetch')
        .mockRejectedValue(new Error('MAX canary guard should block fetch'));
      const maxRow = deliveryRow({
        channel: 'MAX',
        channelIdentityMasked: 'max:***',
        profile: {
          id: 'profile-1',
          displayName: 'Guest One',
          contactMasked: '+7 *** **-11',
          telegramIdentity: null,
          maxIdentity: 'max:user-123',
          xp: 120,
          level: 2,
        },
      });

      prisma.guestGameDelivery.findMany.mockResolvedValue([maxRow]);
      jest.spyOn(service as any, 'createDeliveryEvent').mockResolvedValue(null);
      jest.spyOn(service, 'getDeliveries').mockResolvedValue([]);

      const result = await service.dispatchDeliveries(user, {
        dryRun: false,
        channels: ['MAX'],
      });

      expect(fetchMock).not.toHaveBeenCalled();
      expect(prisma.guestGameDelivery.update).not.toHaveBeenCalled();
      expect((service as any).createDeliveryEvent).toHaveBeenCalledWith(
        user,
        'delivery-1',
        'reward-1',
        expect.objectContaining({
          eventType: 'DELIVERY_DISPATCH_BLOCKED',
          fromStatus: 'READY',
          toStatus: 'READY',
          channel: 'MAX',
          note: expect.stringContaining(
            'GUEST_GAME_MAX_DELIVERY_LIVE_CANARY_ENABLED',
          ),
        }),
      );
      expect(result).toMatchObject({
        dryRun: false,
        checked: 1,
        sent: 0,
        failed: 0,
        skipped: 0,
        blocked: 1,
      });
      expect(JSON.stringify(result)).not.toContain('max-token');
      expect(JSON.stringify(result)).not.toContain('max:user-123');

      fetchMock.mockRestore();
    });

    it('sends MAX delivery through generic provider when env and canary are explicitly enabled', async () => {
      process.env.GUEST_GAME_DELIVERY_REAL_SEND_ENABLED = 'true';
      process.env.GUEST_GAME_MAX_DELIVERY_ENABLED = 'true';
      process.env.GUEST_GAME_MAX_DELIVERY_LIVE_CANARY_ENABLED = 'true';
      process.env.GUEST_GAME_MAX_DELIVERY_ENDPOINT =
        'https://max-provider.example/send';
      process.env.GUEST_GAME_MAX_BOT_TOKEN = 'max-token';
      const { service, prisma } = createService();
      const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ ok: true, messageId: 'max-message-1' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
      const maxRow = deliveryRow({
        channel: 'MAX',
        channelIdentityMasked: 'max:***',
        profile: {
          id: 'profile-1',
          displayName: 'Guest One',
          contactMasked: '+7 *** **-11',
          telegramIdentity: null,
          maxIdentity: 'max:user-123',
          xp: 120,
          level: 2,
        },
      });

      prisma.guestGameDelivery.findMany.mockResolvedValue([maxRow]);
      prisma.guestGameDelivery.update.mockResolvedValue(
        deliveryRow({
          ...maxRow,
          status: 'SENT',
          sentAt: now,
        }),
      );
      jest.spyOn(service as any, 'createDeliveryEvent').mockResolvedValue(null);
      jest.spyOn(service, 'getDeliveries').mockResolvedValue([]);

      const result = await service.dispatchDeliveries(user, {
        dryRun: false,
        channels: ['MAX'],
      });

      expect(fetchMock).toHaveBeenCalledWith(
        'https://max-provider.example/send',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            authorization: 'Bearer max-token',
          }),
          body: expect.stringContaining('"identity":"max:user-123"'),
        }),
      );
      expect(prisma.guestGameDelivery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'delivery-1' },
          data: expect.objectContaining({
            status: 'SENT',
            sentAt: expect.any(Date),
          }),
        }),
      );
      expect((service as any).createDeliveryEvent).toHaveBeenCalledWith(
        user,
        'delivery-1',
        'reward-1',
        expect.objectContaining({
          eventType: 'DELIVERY_SENT_BY_PROVIDER',
          fromStatus: 'READY',
          toStatus: 'SENT',
          channel: 'MAX',
          payload: expect.objectContaining({
            provider: 'MAX',
            providerMessageId: 'max-message-1',
            providerStatus: 'max:ok',
          }),
        }),
      );
      expect(result).toMatchObject({
        dryRun: false,
        checked: 1,
        sent: 1,
        failed: 0,
        skipped: 0,
        blocked: 0,
      });
      expect(JSON.stringify(result)).not.toContain('max-token');
      expect(JSON.stringify(result)).not.toContain('max:user-123');

      fetchMock.mockRestore();
    });
  });

  describe('bot delivery consumer', () => {
    it('summarizes api-visible runner readiness and saved ack events without secrets', () => {
      process.env.GUEST_GAME_BOT_CONSUMER_SYNC_TOKEN = 'sync-token';
      process.env.GUEST_GAME_BOT_CONSUMER_TENANT_SLUG = user.tenantSlug;
      process.env.GUEST_GAME_BOT_CONSUMER_CHANNELS = 'telegram';
      process.env.GUEST_GAME_BOT_CONSUMER_DRY_RUN = 'false';
      process.env.GUEST_GAME_BOT_CONSUMER_TELEGRAM_BOT_TOKEN = 'telegram-token';
      const { service } = createService();
      const pending = deliveryRow();
      const sent = deliveryRow({
        id: 'delivery-sent',
        rewardId: 'reward-sent',
        reward: rewardRow({ id: 'reward-sent' }),
        status: 'SENT',
        sentAt: now,
        events: [
          {
            id: 'event-sent',
            eventType: 'DELIVERY_BOT_CONSUMER_SENT',
            fromStatus: 'READY',
            toStatus: 'SENT',
            channel: 'TELEGRAM',
            note: 'sent by bot',
            payload: {
              source: 'guest_game_bot_consumer',
              status: 'SENT',
              channel: 'TELEGRAM',
              providerMessageId: 'message-1',
            },
            createdAt: isoNow,
            actor: null,
          },
        ],
      });

      const outbox = (service as any).buildDeliveryOutbox([pending, sent]);

      expect(outbox.botConsumer).toMatchObject({
        mode: 'READY',
        dryRun: false,
        configured: true,
        limit: 10,
        canaryLimit: false,
        canaryRequired: false,
        channels: ['TELEGRAM'],
        requiredEnv: [],
        runbook: {
          label: 'Runbook VDS',
          path: 'docs/deployment/systemd/README.md',
          href: 'https://github.com/boozik3412/leetplus/tree/main/docs/deployment/systemd',
        },
        pendingReady: 1,
        pendingTelegram: 1,
        pendingMax: 0,
        sentAck: 1,
        failedAck: 0,
        blockedAck: 0,
        lastAckAt: isoNow,
        preview: [
          expect.objectContaining({
            deliveryId: 'delivery-1',
            rewardId: 'reward-1',
            channel: 'TELEGRAM',
            channelLabel: 'Telegram',
            recipientMasked: 'Guest One',
            channelIdentityMasked: 'tg:***',
            rewardLabel: '100 bonus points',
            rewardType: 'BONUS',
            rewardAmount: 100,
            storeName: null,
            profileLabel: 'Guest One',
            expiresAt: null,
          }),
        ],
      });
      expect(outbox.botConsumer.nextAction).toContain('ack');
      expect(JSON.stringify(outbox.botConsumer)).not.toContain(
        'telegram-token',
      );
      expect(JSON.stringify(outbox.botConsumer)).not.toContain('sync-token');
      expect(JSON.stringify(outbox.botConsumer)).not.toContain('tg:123456');
    });

    it('requires canary limit before the first real-send ack', () => {
      process.env.GUEST_GAME_BOT_CONSUMER_SYNC_TOKEN = 'sync-token';
      process.env.GUEST_GAME_BOT_CONSUMER_TENANT_SLUG = user.tenantSlug;
      process.env.GUEST_GAME_BOT_CONSUMER_CHANNELS = 'telegram';
      process.env.GUEST_GAME_BOT_CONSUMER_DRY_RUN = 'false';
      process.env.GUEST_GAME_BOT_CONSUMER_LIMIT = '10';
      process.env.GUEST_GAME_BOT_CONSUMER_TELEGRAM_BOT_TOKEN = 'telegram-token';
      const { service } = createService();
      const outbox = (service as any).buildDeliveryOutbox([deliveryRow()]);

      expect(outbox.botConsumer).toMatchObject({
        mode: 'BLOCKED',
        modeLabel: 'нужен canary LIMIT=1',
        dryRun: false,
        configured: false,
        limit: 10,
        canaryLimit: false,
        canaryRequired: true,
        channels: ['TELEGRAM'],
        requiredEnv: ['GUEST_GAME_BOT_CONSUMER_LIMIT=1'],
        pendingReady: 1,
        pendingTelegram: 1,
        pendingMax: 0,
        lastAckAt: null,
        preview: [
          expect.objectContaining({
            deliveryId: 'delivery-1',
            rewardId: 'reward-1',
            channel: 'TELEGRAM',
          }),
        ],
      });
      expect(outbox.botConsumer.nextAction).toContain(
        'GUEST_GAME_BOT_CONSUMER_LIMIT=1',
      );
      expect(JSON.stringify(outbox.botConsumer)).not.toContain(
        'telegram-token',
      );
      expect(JSON.stringify(outbox.botConsumer)).not.toContain('sync-token');
    });

    it('summarizes configured MAX bot-consumer provider without secrets', () => {
      process.env.GUEST_GAME_BOT_CONSUMER_SYNC_TOKEN = 'sync-token';
      process.env.GUEST_GAME_BOT_CONSUMER_TENANT_SLUG = user.tenantSlug;
      process.env.GUEST_GAME_BOT_CONSUMER_CHANNELS = 'max';
      process.env.GUEST_GAME_BOT_CONSUMER_DRY_RUN = 'false';
      process.env.GUEST_GAME_BOT_CONSUMER_LIMIT = '1';
      process.env.GUEST_GAME_BOT_CONSUMER_MAX_DELIVERY_ENDPOINT =
        'https://max-provider.example/send';
      process.env.GUEST_GAME_BOT_CONSUMER_MAX_BOT_TOKEN = 'max-token';
      const { service } = createService();
      const outbox = (service as any).buildDeliveryOutbox([
        deliveryRow({
          channel: 'MAX',
          channelIdentityMasked: 'max:***',
          profile: {
            id: 'profile-1',
            displayName: 'Guest One',
            contactMasked: '+7 *** **-11',
            telegramIdentity: null,
            maxIdentity: 'max:user-123',
            xp: 120,
            level: 2,
          },
        }),
      ]);

      expect(outbox.botConsumer).toMatchObject({
        mode: 'READY',
        dryRun: false,
        configured: true,
        limit: 1,
        canaryLimit: true,
        canaryRequired: false,
        channels: ['MAX'],
        requiredEnv: [],
        pendingReady: 1,
        pendingTelegram: 0,
        pendingMax: 1,
        preview: [
          expect.objectContaining({
            deliveryId: 'delivery-1',
            rewardId: 'reward-1',
            channel: 'MAX',
            channelLabel: 'MAX',
            channelIdentityMasked: 'max:***',
          }),
        ],
      });
      expect(JSON.stringify(outbox.botConsumer)).not.toContain('max-token');
      expect(JSON.stringify(outbox.botConsumer)).not.toContain(
        'max-provider.example',
      );
      expect(JSON.stringify(outbox.botConsumer)).not.toContain('max:user-123');
      expect(JSON.stringify(outbox.botConsumer)).not.toContain('sync-token');
    });

    it('omits empty tenant filters from scheduled gamification jobs', async () => {
      const { service, prisma } = createService();

      prisma.tenant.findMany.mockResolvedValue([]);

      await service.runSnapshotPipelineScheduled({});

      expect(prisma.tenant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {},
        }),
      );

      prisma.tenant.findMany.mockClear();

      await service.runDeliveryDispatchScheduled({});

      expect(prisma.tenant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {},
        }),
      );
    });

    it('pulls only ready bot deliveries with a confirmed bot identity', async () => {
      const { service, prisma } = createService();

      prisma.tenant.findFirst.mockResolvedValue(scheduledTenantRow());
      prisma.guestGameDelivery.findMany.mockResolvedValue([
        deliveryRow(),
        deliveryRow({
          id: 'delivery-without-chat',
          rewardId: 'reward-without-chat',
          reward: rewardRow({ id: 'reward-without-chat' }),
          profile: {
            id: 'profile-without-chat',
            displayName: 'Guest Two',
            contactMasked: '+7 *** **-22',
            telegramIdentity: null,
            maxIdentity: null,
            xp: 20,
            level: 1,
          },
        }),
      ]);

      const result = await service.pullBotDeliveries({
        tenantSlug: user.tenantSlug,
        channels: 'telegram',
      });

      expect(prisma.guestGameDelivery.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: user.tenantId,
            status: 'READY',
            readinessStatus: 'READY_FOR_BOT',
            channel: { in: ['TELEGRAM'] },
          }),
        }),
      );
      expect(prisma.tenant.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            slug: user.tenantSlug,
          },
        }),
      );
      expect(result).toMatchObject({
        checked: 2,
        ready: 1,
        skipped: 1,
      });
      expect(result.items[0]).toMatchObject({
        tenantId: user.tenantId,
        tenantSlug: user.tenantSlug,
        deliveryId: 'delivery-1',
        rewardId: 'reward-1',
        channel: 'TELEGRAM',
        recipient: {
          telegramChatId: '123456',
          maxIdentity: null,
          identityMasked: 'tg:***',
          recipientMasked: 'Guest One',
        },
        message: {
          title: 'Reward ready',
          body: 'Your reward is ready',
        },
        reward: {
          label: '100 bonus points',
          amount: 100,
          type: 'BONUS',
          code: 'LP-100',
          expiresAt: null,
        },
      });
    });

    it('acks bot delivery result and records a sanitized audit event', async () => {
      const { service, prisma } = createService();
      const current = deliveryRow();
      const sent = {
        ...current,
        status: 'SENT',
        sentAt: now,
        note: 'sent by bot',
      };

      prisma.tenant.findFirst.mockResolvedValue(scheduledTenantRow());
      prisma.guestGameDelivery.findFirst.mockResolvedValue(current);
      prisma.guestGameDelivery.update.mockResolvedValue(sent);

      const result = await service.ackBotDelivery({
        tenantSlug: user.tenantSlug,
        deliveryId: 'delivery-1',
        status: 'sent',
        note: 'sent by bot',
        providerMessageId: 'tg-message-1',
        providerStatus: 'ok',
        externalEventId: 'update-1',
      });

      expect(prisma.guestGameDelivery.update).toHaveBeenCalledWith({
        where: { id: 'delivery-1' },
        data: expect.objectContaining({
          status: 'SENT',
          note: 'sent by bot',
          sentAt: expect.any(Date),
          failedAt: null,
        }),
        include: expect.any(Object),
      });
      expect(prisma.guestGameDeliveryEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: user.tenantId,
          deliveryId: 'delivery-1',
          rewardId: 'reward-1',
          actorUserId: user.id,
          eventType: 'DELIVERY_BOT_CONSUMER_SENT',
          fromStatus: 'READY',
          toStatus: 'SENT',
          channel: 'TELEGRAM',
          note: 'sent by bot',
          payload: {
            source: 'guest_game_bot_consumer',
            status: 'SENT',
            channel: 'TELEGRAM',
            providerMessageId: 'tg-message-1',
            providerStatus: 'ok',
            errorCode: null,
            externalEventId: 'update-1',
          },
        }),
      });
      expect(result).toMatchObject({
        eventType: 'DELIVERY_BOT_CONSUMER_SENT',
        idempotent: false,
        delivery: {
          id: 'delivery-1',
          status: 'SENT',
          sentAt: isoNow,
        },
      });
    });

    it('treats repeated terminal bot ack as idempotent without duplicating events', async () => {
      const { service, prisma } = createService();
      const current = deliveryRow({
        status: 'SENT',
        sentAt: now,
        events: [
          {
            id: 'event-sent',
            eventType: 'DELIVERY_BOT_CONSUMER_SENT',
            fromStatus: 'READY',
            toStatus: 'SENT',
            channel: 'TELEGRAM',
            note: 'sent by bot',
            payload: {
              source: 'guest_game_bot_consumer',
              status: 'SENT',
              channel: 'TELEGRAM',
              providerMessageId: 'tg-message-1',
            },
            createdAt: now,
            actor: null,
          },
        ],
      });

      prisma.tenant.findFirst.mockResolvedValue(scheduledTenantRow());
      prisma.guestGameDelivery.findFirst.mockResolvedValue(current);

      const result = await service.ackBotDelivery({
        tenantSlug: user.tenantSlug,
        deliveryId: 'delivery-1',
        status: 'sent',
        note: 'same provider retry',
        providerMessageId: 'tg-message-1',
      });

      expect(prisma.guestGameDelivery.update).not.toHaveBeenCalled();
      expect(prisma.guestGameDeliveryEvent.create).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        eventType: 'DELIVERY_BOT_CONSUMER_SENT',
        idempotent: true,
        note: 'Duplicate bot consumer ack ignored.',
        delivery: {
          id: 'delivery-1',
          status: 'SENT',
          sentAt: isoNow,
        },
      });
    });

    it('blocks changing a terminal bot ack to a different status', async () => {
      const { service, prisma } = createService();

      prisma.tenant.findFirst.mockResolvedValue(scheduledTenantRow());
      prisma.guestGameDelivery.findFirst.mockResolvedValue(
        deliveryRow({
          status: 'FAILED',
          failedAt: now,
          note: 'provider failed',
        }),
      );

      await expect(
        service.ackBotDelivery({
          tenantSlug: user.tenantSlug,
          deliveryId: 'delivery-1',
          status: 'sent',
          note: 'late success',
        }),
      ).rejects.toThrow('Terminal bot delivery ack can only be repeated');

      expect(prisma.guestGameDelivery.update).not.toHaveBeenCalled();
      expect(prisma.guestGameDeliveryEvent.create).not.toHaveBeenCalled();
    });
  });
});

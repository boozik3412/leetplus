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
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    guestGameReward: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
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
    },
    guestSession: {
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
    guestGroup: {
      findMany: jest.fn(),
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
) {
  const langameSettingsService = {
    resolveTenantAccess: jest.fn(),
  };
  const langameClient = {
    postEndpoint: jest.fn(),
  };
  const bonusLedgerSchedulerService = {
    getRuntimeStatus: jest.fn(() => schedulerStatus),
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
    service: new GuestGamificationService(
      prisma,
      langameSettingsService as any,
      langameClient as any,
      configService as any,
      bonusLedgerSchedulerService as any,
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
    telegramIdentity: 'tg:123456',
    maxIdentity: null,
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
        manualApprovalRequired: false,
        xpDelta: 30,
        budgetAmount: null,
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
}: {
  otpReady?: boolean;
  ledgerReady?: boolean;
} = {}) {
  return {
    summary: {
      total: 3,
      ready: [otpReady, ledgerReady, ledgerReady].filter(Boolean).length,
      partial: 0,
      blocked: [otpReady, ledgerReady, ledgerReady].filter((value) => !value)
        .length,
      manualOnly: 0,
    },
    items: [
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
    ],
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
    delete process.env.GUEST_GAME_BOT_CONSUMER_DRY_RUN;
    delete process.env.GUEST_GAME_BOT_CONSUMER_TELEGRAM_BOT_TOKEN;
    delete process.env.GUEST_GAME_TELEGRAM_LINK_SECRET;
    delete process.env.GUEST_GAME_TELEGRAM_WEBHOOK_SECRET;
    delete process.env.GUEST_GAME_TELEGRAM_BOT_TOKEN;
    delete process.env.GUEST_GAME_TELEGRAM_WEBHOOK_REPLY_ENABLED;
    delete process.env.GUEST_GAME_TELEGRAM_WEBHOOK_REPLY_BOT_TOKEN;
    delete process.env.GUEST_PORTAL_USER_CALL_ENABLED;
    delete process.env.GUEST_PORTAL_USER_CALL_PROVIDER;
    delete process.env.GUEST_PORTAL_USER_CALL_PHONE_NUMBER;
    delete process.env.GUEST_PORTAL_USER_CALL_SECRET;
    delete process.env.GUEST_PORTAL_USER_CALL_SMS_RU_API_ID;
    delete process.env.GUEST_PORTAL_USER_CALL_SMS_RU_BASE_URL;
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

  describe('integration readiness', () => {
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
          'GUEST_GAME_TELEGRAM_WEBHOOK_REPLY_ENABLED',
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
          expect.objectContaining({ label: 'Webhook' }),
          expect.objectContaining({ label: 'Sender' }),
          expect.objectContaining({ label: 'Bot token' }),
        ]),
      );
      expect(senderText).not.toContain('telegram-secret');
      expect(senderText).not.toContain('telegram-token');
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
        playPath: '/play?storeId=store-1337',
      });
      expect(readiness.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            key: 'PUBLIC_REGISTRATION',
            actionHref: '/play?storeId=store-1337',
            actionLabel: 'Открыть /play',
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
            actionHref: '/sync',
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
            actionHref: '/sync',
            actionLabel: 'Открыть /sync',
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
          guestId: null,
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
      jest.spyOn(service, 'dryRun').mockResolvedValue(dryRunResult());
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
      });
      expect(outbox.botConsumer.nextAction).toContain('ack');
      expect(JSON.stringify(outbox.botConsumer)).not.toContain(
        'telegram-token',
      );
      expect(JSON.stringify(outbox.botConsumer)).not.toContain('sync-token');
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

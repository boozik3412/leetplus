/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/unbound-method */

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import {
  IntegrationProvider,
  Prisma,
  TenantLifecycleStatus,
  UserRole,
} from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { GuestBonusLedgerSchedulerRuntimeStatus } from './guest-bonus-ledger-scheduler.service';
import { EXACT_CANONICAL_OWNER_QUARANTINED_CODE } from './guest-game-exact-owner-reconciler';
import {
  buildGuestGameOriginKey,
  buildGuestGamePhysicalProgressIdentity,
} from './guest-game-origin-key';
import {
  canonicalGuestGameJsonFingerprint,
  GuestGamificationService,
  guestGameExactReconciliationDeliveryState,
  guestGameExactXpTopUpPlan,
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
  type GuestGameXpRuleAttribution,
} from './guest-gamification.service';

describe('exact reconciliation invariants', () => {
  const xpAttribution = (
    ruleId: string,
    requestedDelta: number,
    source: GuestGameXpRuleAttribution['source'],
  ): GuestGameXpRuleAttribution => ({
    ruleKey: `MISSION:${ruleId}:`,
    ruleKind: 'MISSION',
    ruleId,
    battlePassStep: null,
    requestedDelta,
    appliedDelta: requestedDelta,
    source,
  });

  it('fingerprints an immutable plan independently of object key order', () => {
    const left = {
      slotKey: 'free',
      rule: {
        id: 'season-1',
        reward: { amount: 100, type: 'BONUS' },
      },
    };
    const reordered = {
      rule: {
        reward: { type: 'BONUS', amount: 100 },
        id: 'season-1',
      },
      slotKey: 'free',
    };
    const mutated = {
      ...reordered,
      rule: {
        ...reordered.rule,
        reward: { ...reordered.rule.reward, amount: 101 },
      },
    };

    expect(canonicalGuestGameJsonFingerprint(left)).toBe(
      canonicalGuestGameJsonFingerprint(reordered),
    );
    expect(canonicalGuestGameJsonFingerprint(left)).not.toBe(
      canonicalGuestGameJsonFingerprint(mutated),
    );
  });

  it('reports a dead-lettered exact intent as terminal, not waiting', () => {
    expect(guestGameExactReconciliationDeliveryState(0, 1)).toEqual({
      complete: false,
      waitingForDelivery: false,
    });
  });

  it('does not subtract unrelated LIVE XP from an exact rule top-up', () => {
    const live = xpAttribution('mission-live', 10, 'LIVE');
    const exact = xpAttribution('mission-exact', 30, 'EXACT');

    expect(guestGameExactXpTopUpPlan([live], [exact])).toEqual({
      existingRequestedTotal: 10,
      existingAppliedTotal: 10,
      expectedScopedTotal: 30,
      requestedTopUp: 30,
      missingAttributions: [exact],
      mergedAttributions: [exact, live],
    });
  });

  it('does not repost XP already attributed to the same exact rule', () => {
    const live = xpAttribution('mission-exact', 30, 'LIVE');
    const exact = xpAttribution('mission-exact', 30, 'EXACT');

    expect(guestGameExactXpTopUpPlan([live], [exact])).toEqual({
      existingRequestedTotal: 30,
      existingAppliedTotal: 30,
      expectedScopedTotal: 30,
      requestedTopUp: 0,
      missingAttributions: [],
      mergedAttributions: [live],
    });
  });

  it('fails closed when the same rule has incompatible XP attribution', () => {
    expect(() =>
      guestGameExactXpTopUpPlan(
        [xpAttribution('mission-exact', 10, 'LIVE')],
        [xpAttribution('mission-exact', 30, 'EXACT')],
      ),
    ).toThrow(ConflictException);
  });
});

const now = new Date('2026-06-10T10:00:00.000Z');
const isoNow = now.toISOString();
const sessionOriginKey = buildGuestGameOriginKey({
  externalProvider: IntegrationProvider.LANGAME,
  externalDomain: 'club-1',
  eventType: 'SESSION_START',
  stableExternalId: 'session-1',
});

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
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    guestGameRuleDecision: {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    guestGameAuditEvent: {
      create: jest.fn().mockResolvedValue({}),
    },
    guestGameEntitlement: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue({}),
    },
    guestGameXpPosting: {
      create: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    guestGameRewardIntent: {
      upsert: jest.fn().mockImplementation(({ create }) =>
        Promise.resolve({
          id: 'reward-intent-1',
          ...create,
        }),
      ),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockImplementation(({ where }) =>
        Promise.resolve({
          count: where?.attempts?.gte ? 0 : 1,
        }),
      ),
    },
    guestGameRewardEffect: {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockImplementation(({ where }) =>
        Promise.resolve({
          count: where?.attempts?.gte ? 0 : 1,
        }),
      ),
    },
    guestActivityFact: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    guestGameSupplementalFactReceipt: {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    guestGameReward: {
      count: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    guestGameCompletionNotification: {
      upsert: jest.fn().mockResolvedValue({}),
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
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    guestAudienceMember: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    guestGroup: {
      findMany: jest.fn(),
    },
    langameClubProductConfiguration: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    langameProductGroup: {
      findMany: jest.fn().mockResolvedValue([]),
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
      findFirstOrThrow: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    guestGameSeason: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findFirstOrThrow: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
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
    $transaction: jest.fn(function (
      this: Record<string, unknown>,
      operation:
        | Promise<unknown>[]
        | ((tx: Record<string, unknown>) => Promise<unknown>),
    ) {
      return typeof operation === 'function'
        ? operation(this)
        : Promise.all(operation);
    }),
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
  mediaService: {
    createAsset: jest.Mock;
  } | null = null,
) {
  const langameSettingsService = {
    resolveTenantAccess: jest.fn(),
  };
  const langameClient = {
    postEndpoint: jest.fn(),
    listGuestSessions: jest.fn(),
    listTariffTypeGroups: jest
      .fn()
      .mockResolvedValue([{ id: 1, type: 'packet' }]),
    searchGuests: jest.fn(),
    listTransactions: jest.fn().mockResolvedValue([]),
    listGuestLogs: jest.fn().mockResolvedValue([]),
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
  const guestIdentityResolver = {
    findActiveGuestForProfileDomain: jest.fn().mockResolvedValue(null),
    listActiveGuestIds: jest.fn().mockResolvedValue([]),
  };

  return {
    prisma,
    langameSettingsService,
    langameClient,
    configService,
    bonusLedgerSchedulerService,
    bonusLedgerService,
    guestIdentityResolver,
    service: new GuestGamificationService(
      prisma,
      langameSettingsService as any,
      langameClient as any,
      configService as any,
      bonusLedgerSchedulerService as any,
      bonusLedgerService as any,
      guestIdentityResolver as any,
      staffTeamChatService as any,
      mediaService as any,
    ),
  };
}

describe('promo banner media migration', () => {
  it('moves a legacy inline image into the media store before returning cards', async () => {
    const prisma = createPrismaMock();
    const mediaService = {
      createAsset: jest.fn().mockResolvedValue({ id: 'asset-1' }),
    };
    const metadata = {
      imageUrl: `data:image/jpeg;base64,${Buffer.from([
        0xff, 0xd8, 0xff, 0xd9,
      ]).toString('base64')}`,
      imageStorage: 'inline_jpeg',
    };
    const row = {
      id: 'promo-1',
      tenantId: user.tenantId,
      createdByUserId: user.id,
      title: 'Banner',
      label: null,
      description: null,
      tag: null,
      status: 'ACTIVE',
      targetAnchor: null,
      priority: 1,
      storeIds: [],
      periodFrom: null,
      periodTo: null,
      metadata,
      createdAt: now,
      updatedAt: now,
      createdByUser: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
      },
    };
    prisma.guestGamePromoCard.findMany.mockResolvedValue([row]);
    prisma.guestGamePromoCard.update.mockResolvedValue(row);
    const { service } = createService(prisma, null, null, mediaService);

    const cards = await service.getPromoCards(user);

    expect(mediaService.createAsset).toHaveBeenCalledWith(
      user,
      expect.objectContaining({
        originalname: 'promo-banner-promo-1.jpg',
        mimetype: 'image/jpeg',
      }),
    );
    expect(prisma.guestGamePromoCard.update).toHaveBeenCalledWith({
      where: { id: 'promo-1' },
      data: {
        metadata: {
          imageUrl: '/api/guest-game/media/asset-1',
          imageStorage: 'media_asset',
        },
      },
    });
    expect(cards[0]?.metadata).toEqual({
      imageUrl: '/api/guest-game/media/asset-1',
      imageStorage: 'media_asset',
    });
  });
});

describe('exact XP reconciliation persistence', () => {
  it('bootstraps a strictly matching legacy v2 LIVE posting, then adds exact XP once', async () => {
    const { service, prisma } = createService();
    const profile = profileFixture();
    const eventId = 'event-exact-xp-top-up';
    const sourceFactId = 'fact-exact-xp-top-up';
    const originKey = 'origin-exact-xp-top-up';
    const sessionExternalId = 'session-exact-xp-top-up';
    const physicalIdentity = buildGuestGamePhysicalProgressIdentity({
      externalProvider: IntegrationProvider.LANGAME,
      externalDomain: 'club-1',
      sourceKind: 'GUEST_SESSION',
      sessionExternalId,
      eventType: 'HOURLY_PLAY_TIME_ACCUMULATED',
    });
    expect(physicalIdentity).not.toBeNull();

    const scope = {
      sourceFactId,
      sourceFactUpdatedAt: now,
      physicalSessionKey: physicalIdentity!.key,
      rules: [
        {
          ruleKind: 'MISSION' as const,
          ruleId: 'mission-exact-xp',
          battlePassStep: null,
          ruleUpdatedAt: now,
        },
      ],
    };
    const exactPlan = {
      schemaVersion: 1,
      eventId,
      originKey,
      profileId: profile.id,
      physicalSessionKey: physicalIdentity!.key,
      sourceFactId,
      sourceFactUpdatedAt: isoNow,
      createdAt: isoNow,
      occurredAt: isoNow,
      eventType: 'PLAY_HOUR',
      ruleVersions: [
        {
          ruleKind: 'MISSION',
          ruleId: 'mission-exact-xp',
          battlePassStep: null,
          ruleUpdatedAt: isoNow,
        },
      ],
      rules: [
        {
          id: 'mission-exact-xp',
          kind: 'MISSION',
          name: 'Exact XP mission',
          eligible: true,
          xpDelta: 30,
        },
      ],
      rewardIntents: [],
      expectedXpDelta: 30,
    };
    const liveAttribution = {
      ruleKey: 'MISSION:mission-unrelated-live:',
      ruleKind: 'MISSION',
      ruleId: 'mission-unrelated-live',
      battlePassStep: null,
      requestedDelta: 10,
      appliedDelta: 10,
      source: 'LIVE',
    } as const;
    const exactAttribution = {
      ruleKey: 'MISSION:mission-exact-xp:',
      ruleKind: 'MISSION',
      ruleId: 'mission-exact-xp',
      battlePassStep: null,
      requestedDelta: 30,
      appliedDelta: 30,
      source: 'EXACT',
    } as const;
    const xpIntent = (
      id: string,
      attribution: typeof liveAttribution | typeof exactAttribution,
    ) => ({
      id,
      tenantId: user.tenantId,
      eventId,
      profileId: profile.id,
      originKey,
      ruleType: attribution.ruleKind,
      ruleId: attribution.ruleId,
      effectKind: 'XP_POSTING',
      slotKey: `xp:${attribution.ruleKey}`,
      idempotencyKey: `guest-game-xp-rule:${eventId}:${attribution.ruleKey}`,
      claimKey: null,
      status: 'APPLIED',
      plan: {
        schemaVersion: 1,
        effectKind: 'XP_POSTING',
        qualifiedAt: isoNow,
        slotKey: `xp:${attribution.ruleKey}`,
        claimKey: null,
        ...attribution,
        sourceFactId: attribution.source === 'EXACT' ? sourceFactId : null,
        physicalSessionKey:
          attribution.source === 'EXACT' ? physicalIdentity!.key : null,
      },
    });
    let persistedXpIntents = [] as ReturnType<typeof xpIntent>[];
    prisma.guestGameRewardIntent.findMany.mockImplementation(
      ({ where }: any) => {
        if (where?.effectKind === 'XP_POSTING') {
          return Promise.resolve(persistedXpIntents);
        }
        if (where?.effectKind === 'REWARD') {
          return Promise.resolve([]);
        }
        return Promise.resolve([]);
      },
    );
    const liveV2Payload = {
      processSchemaVersion: 2,
      rules: [
        {
          id: liveAttribution.ruleId,
          kind: liveAttribution.ruleKind,
          name: 'Unrelated LIVE XP mission',
          eligible: true,
          xpDelta: liveAttribution.requestedDelta,
        },
      ],
      exactReconciliationPlan: exactPlan,
    };
    const lockedEvent = {
      id: eventId,
      profileId: profile.id,
      guestId: 'guest-1',
      lootBoxId: null,
      missionId: null,
      seasonId: null,
      eventType: 'PLAY_HOUR',
      externalProvider: IntegrationProvider.LANGAME,
      externalDomain: 'club-1',
      originKey,
      occurredAt: now,
      xpDelta: 10,
      payload: liveV2Payload,
    };
    const lockedFact = {
      id: sourceFactId,
      updatedAt: now,
      profileId: profile.id,
      guestId: 'guest-1',
      externalProvider: IntegrationProvider.LANGAME,
      externalDomain: 'club-1',
      sourceKind: 'GUEST_SESSION',
      sessionExternalId,
      factType: 'HOURLY_PLAY_TIME_ACCUMULATED',
      confidence: 'EXACT',
      lifecycleStatus: 'ACTIVE',
      supersededAt: null,
    };
    const lockedReceipt = {
      id: 'receipt-exact-xp-top-up',
      factId: sourceFactId,
      eventId,
      eventType: 'PLAY_HOUR',
      externalProvider: IntegrationProvider.LANGAME,
      externalDomain: 'club-1',
      policy: 'EXACT_OPERATOR_CANONICALIZATION',
      status: 'PROCESSED',
      claimedSource: 'EXACT_CANONICALIZATION',
    };
    const installLockedRows = (
      eventXpDelta: number,
      payload = liveV2Payload,
    ) => {
      prisma.$queryRaw.mockReset();
      prisma.$queryRaw
        .mockResolvedValueOnce([
          { ...lockedEvent, xpDelta: eventXpDelta, payload },
        ])
        .mockResolvedValueOnce([lockedFact])
        .mockResolvedValueOnce([
          { ...lockedEvent, xpDelta: eventXpDelta, payload },
        ])
        .mockResolvedValueOnce([lockedFact])
        .mockResolvedValueOnce([lockedFact])
        .mockResolvedValueOnce([lockedReceipt]);
    };
    const invoke = () =>
      (service as any).persistExactReconciliationEffects(
        user,
        dryRunResult({
          eventType: 'PLAY_HOUR',
          occurredAt: isoNow,
          rules: [],
          summary: {
            checkedRules: 0,
            eligibleRules: 0,
            blockedRules: 0,
            estimatedRewardAmount: 0,
            projectedXpDelta: 0,
          },
        }),
        eventId,
        profile.id,
        'guest-1',
        originKey,
        scope,
        'EXACT_PLAY_TIME',
      ) as Promise<{ appliedXpDelta: number }>;

    prisma.guestGameXpPosting.findUnique.mockResolvedValue({
      id: 'posting-exact-xp-top-up',
      tenantId: user.tenantId,
      profileId: profile.id,
      eventId,
      idempotencyKey: `guest-game-xp:${eventId}`,
      requestedDelta: 10,
      appliedDelta: 10,
      balanceBefore: 100,
      balanceAfter: 110,
      evidence: { eventType: 'PLAY_HOUR' },
    });
    prisma.guestGameProfile.update
      .mockResolvedValueOnce({ xp: 160 })
      .mockResolvedValueOnce({ xp: 160 });

    installLockedRows(10, {
      ...liveV2Payload,
      rules: [
        {
          ...liveV2Payload.rules[0],
          xpDelta: liveAttribution.requestedDelta - 1,
        },
      ],
    });
    await expect(invoke()).rejects.toThrow(
      'Legacy canonical XP does not match the immutable EXACT or LIVE rule snapshot.',
    );
    expect(
      prisma.guestGameRewardIntent.upsert.mock.calls
        .map(([call]) => call)
        .filter((call: any) => call.create.effectKind === 'XP_POSTING'),
    ).toHaveLength(0);
    prisma.guestGameRewardIntent.upsert.mockClear();

    installLockedRows(10);
    const first = await invoke();

    expect(first.appliedXpDelta).toBe(30);
    expect(prisma.guestGameProfile.update).toHaveBeenNthCalledWith(1, {
      where: { id: profile.id },
      data: {
        xp: { increment: 30 },
        lastActivityAt: expect.any(Date),
      },
      select: { xp: true },
    });
    expect(prisma.guestGameEvent.update).toHaveBeenCalledWith({
      where: { id: eventId },
      data: { xpDelta: 40 },
    });
    expect(prisma.guestGameXpPosting.update).toHaveBeenCalledWith({
      where: { eventId },
      data: expect.objectContaining({
        requestedDelta: 40,
        appliedDelta: 40,
        balanceBefore: 100,
        balanceAfter: 140,
        evidence: expect.objectContaining({
          exactReconciliationTopUp: expect.objectContaining({
            requestedDelta: 30,
            appliedDelta: 30,
            balanceBefore: 130,
            balanceAfter: 160,
          }),
        }),
      }),
    });
    expect(
      prisma.guestGameRewardIntent.upsert.mock.calls
        .map(([call]) => call)
        .filter((call: any) => call.create.effectKind === 'XP_POSTING'),
    ).toEqual([
      expect.objectContaining({
        create: expect.objectContaining({
          eventId,
          profileId: profile.id,
          ruleId: liveAttribution.ruleId,
          effectKind: 'XP_POSTING',
          status: 'APPLIED',
          plan: expect.objectContaining({
            source: 'LIVE',
            requestedDelta: 10,
            sourceFactId: null,
            physicalSessionKey: null,
          }),
        }),
      }),
      expect.objectContaining({
        create: expect.objectContaining({
          eventId,
          profileId: profile.id,
          ruleId: exactAttribution.ruleId,
          effectKind: 'XP_POSTING',
          status: 'APPLIED',
          plan: expect.objectContaining({
            source: 'EXACT',
            requestedDelta: 30,
            sourceFactId,
            physicalSessionKey: physicalIdentity!.key,
          }),
        }),
      }),
    ]);

    persistedXpIntents = [
      xpIntent('xp-intent-live', liveAttribution),
      xpIntent('xp-intent-exact', exactAttribution),
    ];
    installLockedRows(40);
    prisma.guestGameXpPosting.findUnique.mockResolvedValue({
      id: 'posting-exact-xp-top-up',
      tenantId: user.tenantId,
      profileId: profile.id,
      eventId,
      idempotencyKey: `guest-game-xp:${eventId}`,
      requestedDelta: 40,
      appliedDelta: 40,
      balanceBefore: 100,
      balanceAfter: 140,
      evidence: { exactCanonicalReconciliation: true },
    });
    prisma.guestGameProfile.update.mockClear();
    prisma.guestGameEvent.update.mockClear();
    prisma.guestGameXpPosting.update.mockClear();
    prisma.guestGameRewardIntent.upsert.mockClear();

    const retry = await invoke();

    expect(retry.appliedXpDelta).toBe(0);
    expect(prisma.guestGameProfile.update).not.toHaveBeenCalled();
    expect(prisma.guestGameEvent.update).not.toHaveBeenCalled();
    expect(prisma.guestGameXpPosting.update).not.toHaveBeenCalled();
    expect(prisma.guestGameRewardIntent.upsert).not.toHaveBeenCalled();
  });

  it('restores an EXACT per-rule receipt from a legacy immutable plan without reposting XP', async () => {
    const { service, prisma } = createService();
    const profile = profileFixture();
    const eventId = 'event-exact-xp-same-rule';
    const sourceFactId = 'fact-exact-xp-same-rule';
    const originKey = 'origin-exact-xp-same-rule';
    const sessionExternalId = 'session-exact-xp-same-rule';
    const ruleId = 'mission-shared-live-exact';
    const ruleKey = `MISSION:${ruleId}:`;
    const physicalIdentity = buildGuestGamePhysicalProgressIdentity({
      externalProvider: IntegrationProvider.LANGAME,
      externalDomain: 'club-1',
      sourceKind: 'GUEST_SESSION',
      sessionExternalId,
      eventType: 'HOURLY_PLAY_TIME_ACCUMULATED',
    });
    expect(physicalIdentity).not.toBeNull();

    const exactPlan = {
      schemaVersion: 1,
      eventId,
      originKey,
      profileId: profile.id,
      physicalSessionKey: physicalIdentity!.key,
      sourceFactId,
      sourceFactUpdatedAt: isoNow,
      createdAt: isoNow,
      occurredAt: isoNow,
      eventType: 'PLAY_HOUR',
      ruleVersions: [
        {
          ruleKind: 'MISSION',
          ruleId,
          battlePassStep: null,
          ruleUpdatedAt: isoNow,
        },
      ],
      rules: [
        {
          id: ruleId,
          kind: 'MISSION',
          name: 'Shared LIVE and EXACT XP mission',
          eligible: true,
          xpDelta: 30,
        },
      ],
      rewardIntents: [],
      expectedXpDelta: 30,
    };
    const payload = {
      processSchemaVersion: 2,
      exactReconciliationPlan: exactPlan,
    };
    const exactReceipt = {
      id: 'xp-intent-shared-live-exact',
      tenantId: user.tenantId,
      eventId,
      profileId: profile.id,
      originKey,
      ruleType: 'MISSION',
      ruleId,
      effectKind: 'XP_POSTING',
      slotKey: `xp:${ruleKey}`,
      idempotencyKey: `guest-game-xp-rule:${eventId}:${ruleKey}`,
      claimKey: null,
      status: 'APPLIED',
      plan: {
        schemaVersion: 1,
        effectKind: 'XP_POSTING',
        qualifiedAt: isoNow,
        slotKey: `xp:${ruleKey}`,
        claimKey: null,
        ruleKey,
        ruleKind: 'MISSION',
        ruleId,
        battlePassStep: null,
        requestedDelta: 30,
        appliedDelta: 30,
        source: 'EXACT',
        sourceFactId,
        physicalSessionKey: physicalIdentity!.key,
      },
    };
    let persistedXpIntents: Array<typeof exactReceipt> = [];
    prisma.guestGameRewardIntent.findMany.mockImplementation(
      ({ where }: any) => {
        if (where?.effectKind === 'XP_POSTING') {
          return Promise.resolve(persistedXpIntents);
        }
        return Promise.resolve([]);
      },
    );
    prisma.guestGameXpPosting.findUnique.mockResolvedValue({
      id: 'posting-exact-xp-same-rule',
      tenantId: user.tenantId,
      profileId: profile.id,
      eventId,
      idempotencyKey: `guest-game-xp:${eventId}`,
      requestedDelta: 30,
      appliedDelta: 30,
      balanceBefore: 100,
      balanceAfter: 130,
      evidence: { eventType: 'PLAY_HOUR' },
    });

    const lockedEvent = {
      id: eventId,
      profileId: profile.id,
      guestId: 'guest-1',
      lootBoxId: null,
      missionId: null,
      seasonId: null,
      eventType: 'PLAY_HOUR',
      externalProvider: IntegrationProvider.LANGAME,
      externalDomain: 'club-1',
      originKey,
      occurredAt: now,
      xpDelta: 30,
      payload,
    };
    const lockedFact = {
      id: sourceFactId,
      updatedAt: now,
      profileId: profile.id,
      guestId: 'guest-1',
      externalProvider: IntegrationProvider.LANGAME,
      externalDomain: 'club-1',
      sourceKind: 'GUEST_SESSION',
      sessionExternalId,
      factType: 'HOURLY_PLAY_TIME_ACCUMULATED',
      confidence: 'EXACT',
      lifecycleStatus: 'ACTIVE',
      supersededAt: null,
    };
    const lockedReceipt = {
      id: 'receipt-exact-xp-same-rule',
      factId: sourceFactId,
      eventId,
      eventType: 'PLAY_HOUR',
      externalProvider: IntegrationProvider.LANGAME,
      externalDomain: 'club-1',
      policy: 'EXACT_OPERATOR_CANONICALIZATION',
      status: 'PROCESSED',
      claimedSource: 'EXACT_CANONICALIZATION',
    };
    const installLockedRows = () => {
      prisma.$queryRaw.mockReset();
      prisma.$queryRaw
        .mockResolvedValueOnce([lockedEvent])
        .mockResolvedValueOnce([lockedFact])
        .mockResolvedValueOnce([lockedEvent])
        .mockResolvedValueOnce([lockedFact])
        .mockResolvedValueOnce([lockedFact])
        .mockResolvedValueOnce([lockedReceipt]);
    };
    const invoke = () =>
      (service as any).persistExactReconciliationEffects(
        user,
        dryRunResult({
          eventType: 'PLAY_HOUR',
          occurredAt: isoNow,
          rules: [],
          summary: {
            checkedRules: 0,
            eligibleRules: 0,
            blockedRules: 0,
            estimatedRewardAmount: 0,
            projectedXpDelta: 0,
          },
        }),
        eventId,
        profile.id,
        'guest-1',
        originKey,
        {
          sourceFactId,
          sourceFactUpdatedAt: now,
          physicalSessionKey: physicalIdentity!.key,
          rules: [
            {
              ruleKind: 'MISSION',
              ruleId,
              battlePassStep: null,
              ruleUpdatedAt: now,
            },
          ],
        },
        'EXACT_PLAY_TIME',
      ) as Promise<{ appliedXpDelta: number }>;

    installLockedRows();
    const first = await invoke();

    expect(first.appliedXpDelta).toBe(0);
    expect(prisma.guestGameRewardIntent.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.guestGameRewardIntent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          eventId,
          profileId: profile.id,
          ruleId,
          effectKind: 'XP_POSTING',
          status: 'APPLIED',
          plan: expect.objectContaining({
            ruleKey,
            source: 'EXACT',
            requestedDelta: 30,
            sourceFactId,
            physicalSessionKey: physicalIdentity!.key,
          }),
        }),
      }),
    );
    expect(prisma.guestGameProfile.update).not.toHaveBeenCalled();
    expect(prisma.guestGameEvent.update).not.toHaveBeenCalled();
    expect(prisma.guestGameXpPosting.update).not.toHaveBeenCalled();
    expect(prisma.guestGameXpPosting.create).not.toHaveBeenCalled();

    persistedXpIntents = [exactReceipt];
    prisma.guestGameRewardIntent.upsert.mockClear();
    installLockedRows();

    const retry = await invoke();

    expect(retry.appliedXpDelta).toBe(0);
    expect(prisma.guestGameRewardIntent.upsert).not.toHaveBeenCalled();
    expect(prisma.guestGameProfile.update).not.toHaveBeenCalled();
    expect(prisma.guestGameEvent.update).not.toHaveBeenCalled();
    expect(prisma.guestGameXpPosting.update).not.toHaveBeenCalled();
    expect(prisma.guestGameXpPosting.create).not.toHaveBeenCalled();
  });

  it('suppresses an EXACT cross-event reward claim while topping up only independent XP rules, including on retry', async () => {
    const { service, prisma } = createService();
    const profile = profileFixture();
    const eventId = 'event-exact-cross-event-claim';
    const sourceFactId = 'fact-exact-cross-event-claim';
    const originKey = 'origin-exact-cross-event-claim';
    const sessionExternalId = 'session-exact-cross-event-claim';
    const physicalIdentity = buildGuestGamePhysicalProgressIdentity({
      externalProvider: IntegrationProvider.LANGAME,
      externalDomain: 'club-1',
      sourceKind: 'GUEST_SESSION',
      sessionExternalId,
      eventType: 'HOURLY_PLAY_TIME_ACCUMULATED',
    });
    expect(physicalIdentity).not.toBeNull();

    const claimedRule = {
      ...dryRunResult().rules[0],
      id: 'season-cross-event-claim',
      kind: 'SEASON' as const,
      name: 'Current season diagnostics',
      rewardType: 'BATTLE_PASS_REWARD',
      rewardAmount: 0,
      rewardLabel: 'Step 2 reward',
      selectedRewardLabel: 'Step 2 reward',
      xpDelta: 30,
      battlePassLevel: 2,
      battlePassStep: 2,
      battlePassStepTitle: 'Hour session',
    };
    const xpOnlyRule = {
      ...dryRunResult().rules[0],
      id: 'mission-exact-independent-xp',
      name: 'Independent XP',
      rewardType: null,
      rewardAmount: null,
      rewardLabel: null,
      selectedRewardLabel: null,
      xpDelta: 20,
    };
    const claimKey = 'season:season-cross-event-claim:profile:profile-1:step:2';
    const rewardPlan = {
      schemaVersion: 1,
      qualifiedAt: isoNow,
      slotKey: '2:BATTLE_PASS_REWARD',
      claimKey,
      rule: claimedRule,
    };
    const exactPlan = {
      schemaVersion: 1,
      eventId,
      originKey,
      profileId: profile.id,
      physicalSessionKey: physicalIdentity!.key,
      sourceFactId,
      sourceFactUpdatedAt: isoNow,
      createdAt: isoNow,
      occurredAt: isoNow,
      eventType: 'PLAY_HOUR',
      ruleVersions: [
        {
          ruleKind: 'SEASON',
          ruleId: claimedRule.id,
          battlePassStep: 2,
          ruleUpdatedAt: isoNow,
        },
        {
          ruleKind: 'MISSION',
          ruleId: xpOnlyRule.id,
          battlePassStep: null,
          ruleUpdatedAt: isoNow,
        },
      ],
      rules: [claimedRule, xpOnlyRule],
      rewardIntents: [rewardPlan],
      expectedXpDelta: 50,
    };
    const payload = {
      processSchemaVersion: 2,
      rules: [claimedRule, xpOnlyRule],
      exactReconciliationPlan: exactPlan,
    };
    let eventXpDelta = 0;
    let profileXp = 100;
    let posting: Record<string, any> | null = null;
    const persistedXpIntents: Array<Record<string, any>> = [];
    const lockedFact = {
      id: sourceFactId,
      updatedAt: now,
      profileId: profile.id,
      guestId: 'guest-1',
      externalProvider: IntegrationProvider.LANGAME,
      externalDomain: 'club-1',
      sourceKind: 'GUEST_SESSION',
      sessionExternalId,
      factType: 'HOURLY_PLAY_TIME_ACCUMULATED',
      confidence: 'EXACT',
      lifecycleStatus: 'ACTIVE',
      supersededAt: null,
    };
    const lockedReceipt = {
      id: 'receipt-exact-cross-event-claim',
      factId: sourceFactId,
      eventId,
      eventType: 'PLAY_HOUR',
      externalProvider: IntegrationProvider.LANGAME,
      externalDomain: 'club-1',
      policy: 'EXACT_OPERATOR_CANONICALIZATION',
      status: 'PROCESSED',
      claimedSource: 'EXACT_CANONICALIZATION',
    };
    const lockedEvent = () => ({
      id: eventId,
      profileId: profile.id,
      guestId: 'guest-1',
      lootBoxId: null,
      missionId: null,
      seasonId: null,
      eventType: 'PLAY_HOUR',
      externalProvider: IntegrationProvider.LANGAME,
      externalDomain: 'club-1',
      originKey,
      occurredAt: now,
      xpDelta: eventXpDelta,
      payload,
    });
    const installLockedRows = () => {
      prisma.$queryRaw.mockReset();
      prisma.$queryRaw
        .mockResolvedValueOnce([lockedEvent()])
        .mockResolvedValueOnce([lockedFact])
        .mockResolvedValueOnce([lockedEvent()])
        .mockResolvedValueOnce([lockedFact])
        .mockResolvedValueOnce([lockedFact])
        .mockResolvedValueOnce([lockedReceipt]);
    };

    prisma.guestGameXpPosting.findUnique.mockImplementation(() =>
      Promise.resolve(posting),
    );
    prisma.guestGameRewardIntent.findMany.mockImplementation(({ where }: any) =>
      Promise.resolve(
        where?.effectKind === 'XP_POSTING' ? persistedXpIntents : [],
      ),
    );
    prisma.guestGameRewardIntent.upsert.mockImplementation(({ create }) => {
      if (create.effectKind === 'REWARD') {
        return Promise.resolve({
          id: 'intent-owned-by-previous-event',
          ...create,
          eventId: 'event-previous-claim-owner',
          originKey: 'origin-previous-claim-owner',
          idempotencyKey: 'previous-claim-idempotency',
          plan: {
            ...create.plan,
            qualifiedAt: '2026-06-09T10:00:00.000Z',
            rule: {
              ...create.plan.rule,
              name: 'Previous season diagnostics',
              reasons: ['previous evaluator reason'],
            },
          },
        });
      }
      const existing = persistedXpIntents.find(
        (row) => row.idempotencyKey === create.idempotencyKey,
      );
      if (existing) return Promise.resolve(existing);
      const row = {
        id: `intent-${persistedXpIntents.length + 1}`,
        ...create,
      };
      persistedXpIntents.push(row);
      return Promise.resolve(row);
    });
    prisma.guestGameProfile.update.mockImplementation(({ data }) => {
      if (data.xp?.increment) profileXp += data.xp.increment;
      if (typeof data.xp === 'number') profileXp = data.xp;
      return Promise.resolve({ xp: profileXp });
    });
    prisma.guestGameEvent.update.mockImplementation(({ data }) => {
      if (typeof data.xpDelta === 'number') eventXpDelta = data.xpDelta;
      return Promise.resolve(lockedEvent());
    });
    prisma.guestGameXpPosting.create.mockImplementation(({ data }) => {
      posting = { id: 'posting-exact-cross-event-claim', ...data };
      return Promise.resolve(posting);
    });

    const invoke = () =>
      (service as any).persistExactReconciliationEffects(
        user,
        dryRunResult({
          eventType: 'PLAY_HOUR',
          occurredAt: isoNow,
          rules: [],
          summary: {
            checkedRules: 0,
            eligibleRules: 0,
            blockedRules: 0,
            estimatedRewardAmount: 0,
            projectedXpDelta: 0,
          },
        }),
        eventId,
        profile.id,
        'guest-1',
        originKey,
        {
          sourceFactId,
          sourceFactUpdatedAt: now,
          physicalSessionKey: physicalIdentity!.key,
          rules: [
            {
              ruleKind: 'SEASON',
              ruleId: claimedRule.id,
              battlePassStep: 2,
              ruleUpdatedAt: now,
            },
            {
              ruleKind: 'MISSION',
              ruleId: xpOnlyRule.id,
              battlePassStep: null,
              ruleUpdatedAt: now,
            },
          ],
        },
        'EXACT_PLAY_TIME',
      ) as Promise<{ appliedXpDelta: number; intentIds: string[] }>;

    installLockedRows();
    const first = await invoke();

    expect(first).toMatchObject({ appliedXpDelta: 20, intentIds: [] });
    expect(profileXp).toBe(120);
    expect(eventXpDelta).toBe(20);
    expect(posting).toMatchObject({
      requestedDelta: 20,
      appliedDelta: 20,
      balanceBefore: 100,
      balanceAfter: 120,
    });
    expect(
      persistedXpIntents.map((intent) => ({
        effectKind: intent.effectKind,
        ruleId: intent.ruleId,
        requestedDelta: intent.plan.requestedDelta,
      })),
    ).toEqual([
      {
        effectKind: 'XP_POSTING',
        ruleId: xpOnlyRule.id,
        requestedDelta: 20,
      },
    ]);
    expect(
      persistedXpIntents.some((intent) => intent.ruleId === claimedRule.id),
    ).toBe(false);

    const profileUpdatesAfterFirst =
      prisma.guestGameProfile.update.mock.calls.length;
    const eventUpdatesAfterFirst =
      prisma.guestGameEvent.update.mock.calls.length;
    const postingCreatesAfterFirst =
      prisma.guestGameXpPosting.create.mock.calls.length;
    installLockedRows();

    const retry = await invoke();

    expect(retry).toMatchObject({ appliedXpDelta: 0, intentIds: [] });
    expect(prisma.guestGameProfile.update).toHaveBeenCalledTimes(
      profileUpdatesAfterFirst,
    );
    expect(prisma.guestGameEvent.update).toHaveBeenCalledTimes(
      eventUpdatesAfterFirst,
    );
    expect(prisma.guestGameXpPosting.create).toHaveBeenCalledTimes(
      postingCreatesAfterFirst,
    );
    expect(profileXp).toBe(120);
  });
});

function enablePrimarySnapshotBackfill(
  fixture: ReturnType<typeof createService>,
  overrides: Record<string, string | undefined> = {},
) {
  const values: Record<string, string | undefined> = {
    GUEST_GAME_PIPELINE_BACKFILL_MODE: 'LIVE',
    GUEST_GAME_PIPELINE_BACKFILL_KILL_SWITCH: 'false',
    GUEST_GAME_PIPELINE_BACKFILL_TENANT_ID: user.tenantId,
    GUEST_GAME_PIPELINE_BACKFILL_PROFILE_ID: 'profile-1',
    GUEST_GAME_PIPELINE_BACKFILL_LIVE_NOT_BEFORE: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
  fixture.configService.get.mockImplementation((key: string) => values[key]);
  fixture.prisma.guestGameProfile.findFirst.mockResolvedValue({
    guestId: 'guest-1',
  });
}

function installAtomicLootBoxEntitlementStore(
  prisma: ReturnType<typeof createPrismaMock>,
  input: {
    ruleId: string;
    limits: Record<string, unknown>;
    rewards?: Array<Record<string, unknown>>;
  },
) {
  const entitlements: Array<Record<string, any>> = [];
  const rewards = input.rewards ?? [];
  let sequence = 0;
  let tail: Promise<unknown> = Promise.resolve();

  prisma.guestGameLootBox.findFirst.mockImplementation(({ where }) =>
    where?.id === input.ruleId && where?.status === 'ACTIVE'
      ? Promise.resolve({ id: input.ruleId, limits: input.limits })
      : Promise.resolve(null),
  );
  prisma.guestGameReward.findMany.mockImplementation(() =>
    Promise.resolve(rewards),
  );
  prisma.guestGameEntitlement.findFirst.mockImplementation(({ where }) =>
    Promise.resolve(
      entitlements.find(
        (row) =>
          row.tenantId === where?.tenantId &&
          row.idempotencyKey === where?.idempotencyKey,
      ) ?? null,
    ),
  );
  prisma.guestGameEntitlement.findMany.mockImplementation(({ where }) =>
    Promise.resolve(
      entitlements.filter(
        (row) =>
          row.tenantId === where?.tenantId &&
          row.ruleId === where?.ruleId &&
          ['AVAILABLE', 'CONSUMED'].includes(row.status),
      ),
    ),
  );
  prisma.guestGameEntitlement.upsert.mockImplementation(({ where, create }) => {
    const key = where.tenantId_idempotencyKey;
    const existing = entitlements.find(
      (row) =>
        row.tenantId === key.tenantId &&
        row.idempotencyKey === key.idempotencyKey,
    );
    if (existing) return Promise.resolve(existing);
    const row = { id: `entitlement-${++sequence}`, ...create };
    entitlements.push(row);
    return Promise.resolve(row);
  });
  prisma.$transaction.mockImplementation((operation) => {
    if (typeof operation !== 'function') return Promise.all(operation);
    const current = tail.then(() => operation(prisma));
    tail = current.catch(() => undefined);
    return current;
  });

  return entitlements;
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
    definitionVersion: 1,
    evaluationPolicy: 'LIVE_PRIMARY',
    ...overrides,
  };
}

function missionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mission-1',
    tenantId: user.tenantId,
    audienceId: null,
    createdByUserId: user.id,
    name: 'Indefinite mission',
    status: 'DRAFT',
    missionType: 'APP_OPEN',
    triggerKind: 'APP_OPEN',
    rewardType: 'NONE',
    rewardAmount: null,
    rewardLabel: null,
    xpReward: 0,
    progressTarget: 1,
    progressUnit: 'вход',
    conditions: {
      schemaVersion: 2,
      taskType: 'APP_OPEN',
      indefinite: true,
      visibility: 'VISIBLE',
      metric: { eventTypes: ['APP_OPEN'], aggregation: 'exists', target: 1 },
      reward: { type: 'NONE', xpEnabled: false },
    },
    storeIds: ['store-1'],
    periodFrom: null,
    periodTo: null,
    budgetAmount: null,
    perGuestLimit: null,
    totalRewardLimit: null,
    antiFraudRules: null,
    manualApprovalRequired: false,
    definitionVersion: 2,
    evaluationPolicy: 'LIVE_PRIMARY',
    note: null,
    createdAt: now,
    updatedAt: now,
    audience: null,
    createdByUser: null,
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
    usageKind: 'STANDALONE',
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

function seasonRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'season-1',
    tenantId: user.tenantId,
    audienceId: null,
    createdByUserId: user.id,
    name: 'Club season',
    status: 'ACTIVE',
    seasonType: 'CLUB_SEASON',
    periodFrom: null,
    periodTo: null,
    xpRules: {},
    levels: [],
    freeRewards: [],
    premiumRewards: [],
    premiumEnabled: false,
    premiumUpgradeMode: null,
    storeIds: ['store-1'],
    budgetAmount: null,
    manualApprovalRequired: true,
    note: null,
    createdAt: now,
    updatedAt: now,
    audience: null,
    createdByUser: null,
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
        triggerKind: 'SESSION_START',
        evaluationPolicy: 'LIVE_PRIMARY',
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

function battlePassDryRun(step = 2): GuestGameDryRunResult {
  return dryRunResult({
    eventType: 'PLAY_HOUR',
    rules: [
      {
        ...dryRunResult().rules[0],
        id: 'season-1',
        kind: 'SEASON',
        name: 'Club season',
        triggerKind: 'PLAY_HOUR',
        evaluationPolicy: 'LIVE_WITH_LEDGER_FALLBACK',
        rewardType: 'BATTLE_PASS_REWARD',
        rewardAmount: 0,
        rewardLabel: `Step ${step} reward`,
        selectedRewardLabel: `Step ${step} reward`,
        xpDelta: 0,
        battlePassLevel: step,
        battlePassStep: step,
        battlePassStepTitle: `Step ${step}`,
      },
    ],
    summary: {
      checkedRules: 1,
      eligibleRules: 1,
      blockedRules: 0,
      estimatedRewardAmount: 0,
      projectedXpDelta: 0,
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

function snapshotFactsResult(facts: GuestGameSnapshotFact[] = []) {
  return {
    facts,
    summary: {
      sessions: facts.filter((fact) => fact.source === 'GUEST_SESSION').length,
      logs: 0,
      transactions: 0,
      operationLogs: 0,
      balances: 0,
      bonusBalances: 0,
      loyaltyGroups: 0,
      productExpenses: facts.filter((fact) => fact.source === 'PRODUCT_EXPENSE')
        .length,
      referrals: 0,
      latestAt: facts[0]?.occurredAt ?? null,
    },
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
    it('persists a guest acknowledgement notification with a mission reward', async () => {
      const { service, prisma } = createService();
      const missionReward = rewardRow({
        id: 'reward-mission-completion',
        missionId: 'mission-1',
        seasonId: null,
        profileId: 'profile-1',
        status: 'APPROVED',
      });
      jest.spyOn(service as any, 'buildRewardData').mockResolvedValue({
        tenantId: user.tenantId,
        profileId: 'profile-1',
        missionId: 'mission-1',
        seasonId: null,
        status: 'APPROVED',
        rewardType: 'BONUS',
        rewardLabel: '100 bonus points',
        rewardAmount: 100,
      });
      jest
        .spyOn(service as any, 'reconcileCreatedRewardSideEffects')
        .mockResolvedValue(undefined);
      prisma.guestGameReward.create.mockResolvedValue(missionReward);
      prisma.guestGameEvent.create.mockResolvedValue({ id: 'event-1' });

      await service.createReward(user, {
        profileId: 'profile-1',
        missionId: 'mission-1',
        rewardType: 'BONUS',
        rewardLabel: '100 bonus points',
        rewardAmount: 100,
        status: 'APPROVED',
      });

      expect(
        prisma.guestGameCompletionNotification.upsert,
      ).toHaveBeenCalledWith({
        where: {
          tenantId_rewardId: {
            tenantId: user.tenantId,
            rewardId: 'reward-mission-completion',
          },
        },
        create: {
          tenantId: user.tenantId,
          profileId: 'profile-1',
          rewardId: 'reward-mission-completion',
          kind: 'MISSION',
        },
        update: {},
      });
    });

    it('persists a guest acknowledgement notification with a Battle Pass reward', async () => {
      const { service, prisma } = createService();
      const seasonReward = rewardRow({
        id: 'reward-battle-pass-completion',
        missionId: null,
        seasonId: 'season-1',
        profileId: 'profile-1',
        status: 'APPROVED',
      });
      jest.spyOn(service as any, 'buildRewardData').mockResolvedValue({
        tenantId: user.tenantId,
        profileId: 'profile-1',
        missionId: null,
        seasonId: 'season-1',
        status: 'APPROVED',
        rewardType: 'BONUS',
        rewardLabel: 'Награда первого уровня',
        rewardAmount: 50,
      });
      jest
        .spyOn(service as any, 'reconcileCreatedRewardSideEffects')
        .mockResolvedValue(undefined);
      prisma.guestGameReward.create.mockResolvedValue(seasonReward);
      prisma.guestGameEvent.create.mockResolvedValue({ id: 'event-1' });

      await service.createReward(user, {
        profileId: 'profile-1',
        seasonId: 'season-1',
        rewardType: 'BONUS',
        rewardLabel: 'Награда первого уровня',
        rewardAmount: 50,
        status: 'APPROVED',
      });

      expect(
        prisma.guestGameCompletionNotification.upsert,
      ).toHaveBeenCalledWith({
        where: {
          tenantId_rewardId: {
            tenantId: user.tenantId,
            rewardId: 'reward-battle-pass-completion',
          },
        },
        create: {
          tenantId: user.tenantId,
          profileId: 'profile-1',
          rewardId: 'reward-battle-pass-completion',
          kind: 'BATTLE_PASS',
        },
        update: {},
      });
    });

    it('rolls back reward qualification when the transactional event write fails', async () => {
      const prisma = createPrismaMock();
      const staffTeamChatService = {
        createGamificationRewardApprovalNotification: jest.fn(),
      };
      const { service, bonusLedgerService } = createService(
        prisma,
        null,
        staffTeamChatService,
      );
      const pendingReward = rewardRow({
        id: 'reward-transaction-failure',
        status: 'PENDING',
      });
      const eventFailure = new Error('reward event write failed');
      const transactionClient = {
        guestGameReward: {
          create: jest.fn().mockResolvedValue(pendingReward),
        },
        guestGameEvent: {
          create: jest.fn().mockRejectedValue(eventFailure),
        },
      };
      const notifySpy = jest
        .spyOn(service as any, 'notifyRewardApprovalRequired')
        .mockResolvedValue(undefined);
      const reconcileSpy = jest
        .spyOn(service as any, 'reconcileCreatedRewardSideEffects')
        .mockResolvedValue(undefined);

      jest.spyOn(service as any, 'buildRewardData').mockResolvedValue({
        tenantId: user.tenantId,
        status: 'PENDING',
        rewardType: 'PROMOCODE',
        rewardLabel: 'Promo reward',
        rewardAmount: 0,
      });
      prisma.$transaction.mockImplementationOnce((operation) =>
        operation(transactionClient),
      );

      await expect(
        service.createReward(user, {
          rewardType: 'PROMOCODE',
          rewardLabel: 'Promo reward',
          status: 'PENDING',
        }),
      ).rejects.toBe(eventFailure);

      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function));
      expect(transactionClient.guestGameReward.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            rewardType: 'PROMOCODE',
            rewardLabel: 'Promo reward',
          }),
        }),
      );
      expect(transactionClient.guestGameEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventType: 'REWARD_QUALIFIED',
          source: 'SYSTEM',
          note: pendingReward.rewardLabel,
        }),
      });
      expect(prisma.guestGameReward.create).not.toHaveBeenCalled();
      expect(prisma.guestGameEvent.create).not.toHaveBeenCalled();
      expect(notifySpy).not.toHaveBeenCalled();
      expect(reconcileSpy).not.toHaveBeenCalled();
      expect(
        staffTeamChatService.createGamificationRewardApprovalNotification,
      ).not.toHaveBeenCalled();
      expect(bonusLedgerService.queueApprovedRewards).not.toHaveBeenCalled();
      expect(bonusLedgerService.dispatch).not.toHaveBeenCalled();
    });

    it('rolls back reward qualification when the durable effect outbox write fails', async () => {
      const prisma = createPrismaMock();
      const staffTeamChatService = {
        createGamificationRewardApprovalNotification: jest.fn(),
      };
      const { service, bonusLedgerService } = createService(
        prisma,
        null,
        staffTeamChatService,
      );
      const pendingReward = rewardRow({
        id: 'reward-effect-transaction-failure',
        status: 'PENDING',
      });
      const effectFailure = new Error('reward effect outbox write failed');
      const transactionClient = {
        guestGameReward: {
          create: jest.fn().mockResolvedValue(pendingReward),
        },
        guestGameEvent: {
          create: jest.fn().mockResolvedValue({ id: 'reward-event-1' }),
        },
        guestGameRewardEffect: {
          createMany: jest.fn().mockRejectedValue(effectFailure),
        },
      };
      const reconcileSpy = jest
        .spyOn(service as any, 'reconcileCreatedRewardSideEffects')
        .mockResolvedValue(undefined);

      jest.spyOn(service as any, 'buildRewardData').mockResolvedValue({
        tenantId: user.tenantId,
        status: 'PENDING',
        rewardType: 'PROMOCODE',
        rewardLabel: 'Promo reward',
        rewardAmount: 0,
      });
      prisma.$transaction.mockImplementationOnce((operation) =>
        operation(transactionClient),
      );

      await expect(
        service.createReward(user, {
          rewardType: 'PROMOCODE',
          rewardLabel: 'Promo reward',
          status: 'PENDING',
        }),
      ).rejects.toBe(effectFailure);

      expect(transactionClient.guestGameEvent.create).toHaveBeenCalledTimes(1);
      expect(
        transactionClient.guestGameRewardEffect.createMany,
      ).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            tenantId: user.tenantId,
            rewardId: pendingReward.id,
            effectKind: 'STAFF_APPROVAL_NOTIFICATION',
          }),
        ],
        skipDuplicates: true,
      });
      expect(reconcileSpy).not.toHaveBeenCalled();
      expect(
        staffTeamChatService.createGamificationRewardApprovalNotification,
      ).not.toHaveBeenCalled();
      expect(bonusLedgerService.queueApprovedRewards).not.toHaveBeenCalled();
      expect(bonusLedgerService.dispatch).not.toHaveBeenCalled();
    });

    it('materializes the durable pending reward notification with readable conditions', async () => {
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

      expect(prisma.guestGameRewardEffect.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            rewardId: pendingReward.id,
            effectKind: 'STAFF_APPROVAL_NOTIFICATION',
            status: 'PENDING',
          }),
        ],
        skipDuplicates: true,
      });
      prisma.$queryRaw.mockResolvedValue([
        {
          id: 'effect-pending-chat',
          rewardId: pendingReward.id,
          effectKind: 'STAFF_APPROVAL_NOTIFICATION',
          payload: {},
          attempts: 1,
          leaseVersion: 1,
        },
      ]);
      prisma.guestGameReward.findFirst.mockResolvedValue(pendingReward);

      await service.materializeRewardEffects(user, {
        rewardId: pendingReward.id,
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
          actionHref: '/gamification?tab=rewards&rewardId=reward-pending-chat',
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

    it('materializes an approved reward into the ledger queue without provider dispatch', async () => {
      const prisma = createPrismaMock();
      const staffTeamChatService = {
        createGamificationRewardApprovalNotification: jest.fn(),
      };
      const { service, bonusLedgerService } = createService(
        prisma,
        null,
        staffTeamChatService,
      );

      const approvedReward = rewardRow({
        id: 'reward-approved-chat',
        status: 'APPROVED',
        rewardType: 'BONUS',
      });
      prisma.guestGameReward.create.mockResolvedValue(approvedReward);
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
      expect(prisma.guestGameRewardEffect.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            rewardId: approvedReward.id,
            effectKind: 'BONUS_LEDGER_QUEUE',
            status: 'PENDING',
          }),
        ],
        skipDuplicates: true,
      });
      prisma.$queryRaw.mockResolvedValue([
        {
          id: 'effect-approved-chat',
          rewardId: approvedReward.id,
          effectKind: 'BONUS_LEDGER_QUEUE',
          payload: {},
          attempts: 1,
          leaseVersion: 1,
        },
      ]);
      prisma.guestGameReward.findFirst.mockResolvedValue(approvedReward);

      await service.materializeRewardEffects(user, {
        rewardId: approvedReward.id,
      });

      expect(bonusLedgerService.queueApprovedRewards).toHaveBeenCalledWith(
        user,
        {
          rewardId: 'reward-approved-chat',
          rewardTypes: ['BONUS'],
          limit: 1,
        },
      );
      expect(bonusLedgerService.dispatch).not.toHaveBeenCalled();
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

  describe('materializeRewardEffects', () => {
    it('reports effects moved to dead letter after an exhausted lease', async () => {
      const { service, prisma } = createService();
      prisma.guestGameRewardEffect.updateMany.mockResolvedValueOnce({
        count: 2,
      });
      prisma.$queryRaw.mockResolvedValue([]);

      await expect(
        service.materializeRewardEffects(user, { maxAttempts: 5 }),
      ).resolves.toMatchObject({
        claimed: 0,
        deadLettered: 2,
      });
    });

    it('reports reward intents moved to dead letter after an exhausted lease', async () => {
      const { service, prisma } = createService();
      prisma.guestGameRewardIntent.updateMany.mockResolvedValueOnce({
        count: 2,
      });
      prisma.guestGameRewardIntent.findMany.mockResolvedValue([]);

      await expect(
        service.materializeRewardIntents(user, { maxAttempts: 5 }),
      ).resolves.toMatchObject({
        claimed: 0,
        deadLettered: 2,
      });
      expect(prisma.guestGameRewardIntent.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: user.tenantId,
            status: 'PROCESSING',
            attempts: { gte: 5 },
          }),
          data: expect.objectContaining({
            status: 'DEAD_LETTER',
            claimExpiresAt: null,
            nextAttemptAt: null,
          }),
        }),
      );
    });

    it('stops inline reward-intent reconciliation at the global kill switch', async () => {
      const { service, prisma, configService } = createService();
      configService.get.mockImplementation((key: string) =>
        key === 'GUEST_GAME_REWARD_MATERIALIZER_KILL_SWITCH'
          ? 'true'
          : undefined,
      );

      await expect(
        (service as any).materializeProcessRewardIntents(
          user,
          {},
          {},
          { id: 'event-1' },
          'profile-1',
          null,
          'origin-1',
        ),
      ).resolves.toBeNull();
      expect(prisma.guestGameRewardIntent.updateMany).not.toHaveBeenCalled();
      expect(prisma.guestGameRewardIntent.findMany).not.toHaveBeenCalled();
    });

    it('scopes both SQL and fallback reward-intent claims to the selected intent ids', async () => {
      const { service, prisma } = createService();
      prisma.$queryRaw.mockResolvedValue(undefined);
      prisma.guestGameRewardIntent.findMany.mockResolvedValue([]);

      await expect(
        (service as any).claimRewardIntents(
          user.tenantId,
          'event-1',
          30,
          120_000,
          5,
          ['intent-selected'],
        ),
      ).resolves.toEqual([]);

      const sql = prisma.$queryRaw.mock.calls[0][0] as Prisma.Sql;
      expect(sql.values).toContain('intent-selected');
      expect(sql.values).not.toContain('intent-neighbor');
      expect(prisma.guestGameRewardIntent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: user.tenantId,
            eventId: 'event-1',
            id: { in: ['intent-selected'] },
          }),
        }),
      );
    });

    it('does not claim intents or effects while the global kill switch is enabled', async () => {
      const { service, prisma, configService, bonusLedgerService } =
        createService();
      configService.get.mockImplementation((key: string) =>
        key === 'GUEST_GAME_REWARD_MATERIALIZER_KILL_SWITCH'
          ? 'true'
          : undefined,
      );

      await expect(
        service.materializeRewardEffects(user, { limit: 10 }),
      ).resolves.toEqual({
        claimed: 0,
        applied: 0,
        recovered: 0,
        canceled: 0,
        failed: 0,
        deadLettered: 0,
        staleFinalizations: 0,
        rewardIds: [],
      });
      await expect(
        service.materializeRewardIntents(user, { limit: 10 }),
      ).resolves.toEqual({
        claimed: 0,
        applied: 0,
        recovered: 0,
        canceled: 0,
        failed: 0,
        deadLettered: 0,
        staleFinalizations: 0,
        rewardIds: [],
      });
      expect(prisma.guestGameRewardEffect.updateMany).not.toHaveBeenCalled();
      expect(prisma.guestGameRewardIntent.findMany).not.toHaveBeenCalled();
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
      expect(bonusLedgerService.queueApprovedRewards).not.toHaveBeenCalled();
    });

    it('claims effects exclusively through the compare-and-swap fallback', async () => {
      const prisma = createPrismaMock();
      const staffTeamChatService = {
        createGamificationRewardApprovalNotification: jest
          .fn()
          .mockResolvedValue({ id: 'notification-1' }),
      };
      const { service } = createService(prisma, null, staffTeamChatService);
      const candidates = [
        {
          id: 'effect-winner',
          rewardId: 'reward-pending',
          effectKind: 'STAFF_APPROVAL_NOTIFICATION',
          payload: {},
          attempts: 0,
          leaseVersion: 0,
          status: 'PENDING',
          nextAttemptAt: null,
          claimExpiresAt: null,
          createdAt: now,
        },
        {
          id: 'effect-lost-race',
          rewardId: 'reward-other',
          effectKind: 'STAFF_APPROVAL_NOTIFICATION',
          payload: {},
          attempts: 0,
          leaseVersion: 4,
          status: 'FAILED',
          nextAttemptAt: null,
          claimExpiresAt: null,
          createdAt: now,
        },
      ];

      prisma.$queryRaw.mockResolvedValue(undefined);
      prisma.guestGameRewardEffect.findMany.mockResolvedValue(candidates);
      prisma.guestGameRewardEffect.updateMany
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 1 });
      prisma.guestGameReward.findFirst.mockResolvedValue(
        rewardRow({ id: 'reward-pending', status: 'PENDING' }),
      );

      const result = await service.materializeRewardEffects(user, { limit: 2 });

      expect(prisma.guestGameRewardEffect.updateMany).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'effect-winner',
            status: 'PENDING',
            leaseVersion: 0,
          }),
          data: expect.objectContaining({
            status: 'PROCESSING',
            attempts: { increment: 1 },
            leaseVersion: { increment: 1 },
          }),
        }),
      );
      expect(prisma.guestGameRewardEffect.updateMany).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'effect-lost-race',
            status: 'FAILED',
            leaseVersion: 4,
          }),
        }),
      );
      expect(
        staffTeamChatService.createGamificationRewardApprovalNotification,
      ).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        claimed: 1,
        applied: 1,
        recovered: 0,
        canceled: 0,
        failed: 0,
        deadLettered: 0,
        staleFinalizations: 0,
        rewardIds: ['reward-pending'],
      });
    });

    it('retries a failed staff approval notification and records recovery', async () => {
      const prisma = createPrismaMock();
      const staffTeamChatService = {
        createGamificationRewardApprovalNotification: jest
          .fn()
          .mockRejectedValueOnce(new Error('chat unavailable'))
          .mockResolvedValueOnce({ id: 'notification-retry' }),
      };
      const { service, bonusLedgerService } = createService(
        prisma,
        null,
        staffTeamChatService,
      );
      const pendingReward = rewardRow({
        id: 'reward-notification-retry',
        status: 'PENDING',
      });

      prisma.$queryRaw
        .mockResolvedValueOnce([
          {
            id: 'effect-notification',
            rewardId: pendingReward.id,
            effectKind: 'STAFF_APPROVAL_NOTIFICATION',
            payload: {},
            attempts: 1,
            leaseVersion: 1,
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 'effect-notification',
            rewardId: pendingReward.id,
            effectKind: 'STAFF_APPROVAL_NOTIFICATION',
            payload: {},
            attempts: 2,
            leaseVersion: 2,
          },
        ]);
      prisma.guestGameReward.findFirst.mockResolvedValue(pendingReward);

      const failed = await service.materializeRewardEffects(user, {
        rewardId: pendingReward.id,
      });
      const recovered = await service.materializeRewardEffects(user, {
        rewardId: pendingReward.id,
      });

      expect(failed).toMatchObject({ failed: 1, applied: 0, recovered: 0 });
      expect(recovered).toMatchObject({
        failed: 0,
        applied: 1,
        recovered: 1,
        rewardIds: [pendingReward.id],
      });
      expect(
        staffTeamChatService.createGamificationRewardApprovalNotification,
      ).toHaveBeenCalledTimes(2);
      expect(prisma.guestGameRewardEffect.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'effect-notification',
            status: 'PROCESSING',
            leaseVersion: 1,
          }),
          data: expect.objectContaining({
            status: 'FAILED',
            nextAttemptAt: expect.any(Date),
            lastError: 'chat unavailable',
          }),
        }),
      );
      expect(bonusLedgerService.queueApprovedRewards).not.toHaveBeenCalled();
      expect(bonusLedgerService.dispatch).not.toHaveBeenCalled();
    });

    it('retries a failed lootbox entitlement with the same durable reward', async () => {
      const { service, prisma, bonusLedgerService } = createService();
      const entitlementReward = rewardRow({
        id: 'reward-entitlement-retry',
        status: 'APPROVED',
        missionId: 'mission-entitlement',
        rewardType: 'LOOT_BOX_ENTITLEMENT',
        rewardAmount: new Prisma.Decimal(0),
        mission: {
          id: 'mission-entitlement',
          name: 'Lootbox mission',
          status: 'ACTIVE',
          missionType: 'VISIT',
          triggerKind: 'SESSION_START',
          xpReward: 0,
          progressUnit: 'VISIT',
          conditions: { reward: { lootBoxId: 'loot-box-template' } },
        },
      });
      const claim = (attempts: number, leaseVersion: number) => ({
        id: 'effect-entitlement',
        rewardId: entitlementReward.id,
        effectKind: 'LOOT_BOX_ENTITLEMENT',
        payload: {},
        attempts,
        leaseVersion,
      });

      prisma.$queryRaw
        .mockResolvedValueOnce([claim(1, 1)])
        .mockResolvedValueOnce([claim(2, 2)]);
      prisma.guestGameReward.findFirst.mockResolvedValue(entitlementReward);
      prisma.guestGameLootBox.findFirst.mockResolvedValue({
        id: 'loot-box-template',
        name: 'Reward lootbox',
      });
      prisma.guestGameEntitlement.upsert
        .mockRejectedValueOnce(new Error('entitlement storage unavailable'))
        .mockResolvedValueOnce({ id: 'entitlement-1' });

      const failed = await service.materializeRewardEffects(user, {
        rewardId: entitlementReward.id,
      });
      const recovered = await service.materializeRewardEffects(user, {
        rewardId: entitlementReward.id,
      });

      expect(failed).toMatchObject({ failed: 1, applied: 0 });
      expect(recovered).toMatchObject({
        applied: 1,
        recovered: 1,
        rewardIds: [entitlementReward.id],
      });
      expect(prisma.guestGameEntitlement.upsert).toHaveBeenCalledTimes(2);
      expect(prisma.guestGameEntitlement.upsert.mock.calls[1][0].where).toEqual(
        prisma.guestGameEntitlement.upsert.mock.calls[0][0].where,
      );
      expect(bonusLedgerService.queueApprovedRewards).not.toHaveBeenCalled();
      expect(bonusLedgerService.dispatch).not.toHaveBeenCalled();
    });

    it('retries a failed ledger queue without dispatching to the provider', async () => {
      const { service, prisma, bonusLedgerService, langameClient } =
        createService();
      const bonusReward = rewardRow({
        id: 'reward-ledger-retry',
        status: 'APPROVED',
        rewardType: 'BONUS_BALANCE',
        rewardAmount: new Prisma.Decimal(50),
      });
      const claim = (attempts: number, leaseVersion: number) => ({
        id: 'effect-ledger',
        rewardId: bonusReward.id,
        effectKind: 'BONUS_LEDGER_QUEUE',
        payload: {},
        attempts,
        leaseVersion,
      });

      prisma.$queryRaw
        .mockResolvedValueOnce([claim(1, 1)])
        .mockResolvedValueOnce([claim(2, 2)]);
      prisma.guestGameReward.findFirst.mockResolvedValue(bonusReward);
      bonusLedgerService.queueApprovedRewards
        .mockRejectedValueOnce(new Error('ledger unavailable'))
        .mockResolvedValueOnce({ queued: 1 });

      const failed = await service.materializeRewardEffects(user, {
        rewardId: bonusReward.id,
      });
      const recovered = await service.materializeRewardEffects(user, {
        rewardId: bonusReward.id,
      });

      expect(failed).toMatchObject({ failed: 1, applied: 0 });
      expect(recovered).toMatchObject({
        applied: 1,
        recovered: 1,
        rewardIds: [bonusReward.id],
      });
      expect(bonusLedgerService.queueApprovedRewards).toHaveBeenCalledTimes(2);
      expect(bonusLedgerService.queueApprovedRewards).toHaveBeenLastCalledWith(
        user,
        {
          rewardId: bonusReward.id,
          rewardTypes: ['BONUS_BALANCE'],
          limit: 1,
        },
      );
      expect(bonusLedgerService.dispatch).not.toHaveBeenCalled();
      expect(langameClient.postEndpoint).not.toHaveBeenCalled();
      expect(langameClient.listTransactions).not.toHaveBeenCalled();
    });

    it('does not finalize an effect after losing its lease fence', async () => {
      const prisma = createPrismaMock();
      const staffTeamChatService = {
        createGamificationRewardApprovalNotification: jest
          .fn()
          .mockResolvedValue({ id: 'notification-stale' }),
      };
      const { service } = createService(prisma, null, staffTeamChatService);

      prisma.$queryRaw.mockResolvedValue([
        {
          id: 'effect-stale',
          rewardId: 'reward-stale',
          effectKind: 'STAFF_APPROVAL_NOTIFICATION',
          payload: {},
          attempts: 1,
          leaseVersion: 7,
        },
      ]);
      prisma.guestGameReward.findFirst.mockResolvedValue(
        rewardRow({ id: 'reward-stale', status: 'PENDING' }),
      );
      prisma.guestGameRewardEffect.updateMany
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 });

      const result = await service.materializeRewardEffects(user, {
        rewardId: 'reward-stale',
      });

      expect(
        staffTeamChatService.createGamificationRewardApprovalNotification,
      ).toHaveBeenCalledTimes(1);
      expect(prisma.guestGameRewardEffect.updateMany).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'effect-stale',
            status: 'PROCESSING',
            leaseVersion: 7,
          }),
          data: expect.objectContaining({ status: 'APPLIED' }),
        }),
      );
      expect(result).toMatchObject({
        claimed: 1,
        applied: 0,
        staleFinalizations: 1,
        rewardIds: [],
      });
    });

    it('cancels a claimed effect when the reward status no longer applies', async () => {
      const prisma = createPrismaMock();
      const staffTeamChatService = {
        createGamificationRewardApprovalNotification: jest.fn(),
      };
      const { service, bonusLedgerService } = createService(
        prisma,
        null,
        staffTeamChatService,
      );

      prisma.$queryRaw.mockResolvedValue([
        {
          id: 'effect-canceled',
          rewardId: 'reward-canceled',
          effectKind: 'BONUS_LEDGER_QUEUE',
          payload: {},
          attempts: 1,
          leaseVersion: 3,
        },
      ]);
      prisma.guestGameReward.findFirst.mockResolvedValue(
        rewardRow({
          id: 'reward-canceled',
          status: 'CANCELED',
          rewardType: 'BONUS_BALANCE',
        }),
      );
      prisma.guestGameRewardEffect.updateMany
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 1 });

      const result = await service.materializeRewardEffects(user, {
        rewardId: 'reward-canceled',
      });

      expect(prisma.guestGameRewardEffect.updateMany).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'effect-canceled',
            status: 'PROCESSING',
            leaseVersion: 3,
          }),
          data: expect.objectContaining({
            status: 'CANCELED',
            result: { reason: 'reward_status_changed' },
          }),
        }),
      );
      expect(bonusLedgerService.queueApprovedRewards).not.toHaveBeenCalled();
      expect(bonusLedgerService.dispatch).not.toHaveBeenCalled();
      expect(prisma.guestGameEntitlement.upsert).not.toHaveBeenCalled();
      expect(
        staffTeamChatService.createGamificationRewardApprovalNotification,
      ).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        claimed: 1,
        applied: 0,
        canceled: 1,
        staleFinalizations: 0,
        rewardIds: [],
      });
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
            actionHref: '/gamification',
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
            actionHref: '/gamification?mode=advanced&tab=lootBoxes',
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

    it('publishes appearance without replacing existing Battle Pass step logic', async () => {
      const { service, prisma } = createService();
      const store = visualEditorStore();
      const payload = visualEditorPayload({
        battlePass: {
          id: 'season-1',
          enabled: true,
          title: 'Updated visual title',
          status: 'ACTIVE',
          levelCount: 1,
          xpPerLevel: 999,
          mainPrize: 'Visual prize',
          levelRewards: [],
        },
      });
      const levels = [
        {
          id: 'play-step',
          level: 2,
          sequence: 1,
          title: 'Operational title',
          activationRules: {
            schemaVersion: 2,
            taskType: 'PLAY_TIME',
            triggerKind: 'PLAY_HOUR',
            evaluationPolicy: 'LIVE_WITH_LEDGER_FALLBACK',
            metric: { aggregation: 'duration', target: 60 },
          },
          freeRewardDetails: { type: 'LOOT_BOX', id: 'loot-1' },
        },
      ];
      const existingSeason = seasonRow({ levels });
      let seasonUpdateData: Record<string, unknown> | null = null;
      prisma.guestGameVisualDraft.findFirst.mockResolvedValue(
        visualDraftRow({ store, payload }),
      );
      prisma.guestGameMission.findMany.mockResolvedValue([]);
      prisma.guestGameSeason.findFirst.mockResolvedValue(existingSeason);
      prisma.guestGameSeason.updateMany.mockImplementation(
        ({ data }: { data: Record<string, unknown> }) => {
          seasonUpdateData = data;
          return Promise.resolve({ count: 1 });
        },
      );
      prisma.guestGameSeason.findFirstOrThrow.mockImplementation(() =>
        Promise.resolve(
          seasonRow({
            ...existingSeason,
            ...seasonUpdateData,
            levels,
          }),
        ),
      );
      prisma.guestGameVisualDraft.update.mockImplementation(({ data }) =>
        Promise.resolve(
          visualDraftRow({
            store,
            status: data.status,
            payload: data.payload,
          }),
        ),
      );

      await service.publishVisualEditorDraft(user, { id: 'draft-1' });

      expect(seasonUpdateData).toMatchObject({
        name: 'Updated visual title',
        levels,
      });
      expect(prisma.guestGameSeason.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 'season-1',
            tenantId: user.tenantId,
            updatedAt: existingSeason.updatedAt,
          },
        }),
      );
      expect(prisma.guestGameSeason.update).not.toHaveBeenCalled();
    });

    it('aborts visual publication when the Battle Pass changes concurrently', async () => {
      const { service, prisma } = createService();
      const store = visualEditorStore();
      const payload = visualEditorPayload({
        battlePass: {
          id: 'season-1',
          enabled: true,
          title: 'Visual title',
          status: 'ACTIVE',
          levelCount: 1,
          xpPerLevel: 100,
          mainPrize: null,
          levelRewards: [],
        },
      });
      prisma.guestGameVisualDraft.findFirst.mockResolvedValue(
        visualDraftRow({ store, payload }),
      );
      prisma.guestGameSeason.findFirst.mockResolvedValue(
        seasonRow({ levels: [{ level: 1 }] }),
      );
      prisma.guestGameSeason.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(
        service.publishVisualEditorDraft(user, { id: 'draft-1' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.guestGameSeason.findFirstOrThrow).not.toHaveBeenCalled();
      expect(prisma.guestGameVisualDraft.update).not.toHaveBeenCalled();
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
          lootBoxes: [
            visualLootBoxItem({ id: 'loot-old', title: 'Старый кейс' }),
          ],
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

    it('preserves operational activation metadata when publishing an existing visual lootbox', async () => {
      const { service, prisma } = createService();
      const store = visualEditorStore();
      const payload = visualEditorPayload({
        battlePass: {
          id: null,
          enabled: false,
          title: 'Club season',
          status: 'DRAFT',
          levelCount: 4,
          xpPerLevel: 250,
          mainPrize: null,
          levelRewards: [],
        },
        lootBoxes: [
          {
            id: 'loot-existing',
            title: 'Existing case',
            status: 'ACTIVE',
            triggerKind: 'SESSION_START',
            rewardType: 'BONUS_BALANCE',
            rewardAmount: 50,
            rewardLabel: '50 bonuses',
            prizes: [],
            condition: 'Start a session',
            limitPerGuest: 2,
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
      const existing = {
        ...activeLootBox({
          id: 'loot-existing',
          name: 'Existing case',
          status: 'ACTIVE',
          storeIds: [store.id],
          limits: {
            source: 'advanced_editor',
            activatedAt: '2026-07-18T10:00:00.000Z',
            restartedAt: '2026-07-19T10:00:00.000Z',
            evaluationPolicy: 'LIVE_PRIMARY',
            totalPerDay: 5,
            perGuestPerWeek: 1,
          },
        }),
        tenantId: user.tenantId,
        createdAt: now,
        updatedAt: now,
        createdByUser: null,
      };

      prisma.guestGameVisualDraft.findFirst.mockResolvedValue(
        visualDraftRow({ store, payload }),
      );
      prisma.guestGameLootBox.findFirst.mockResolvedValue(existing);
      prisma.guestGameLootBox.update.mockImplementation(({ data }) =>
        Promise.resolve({ ...existing, ...data, updatedAt: now }),
      );
      prisma.guestGameMission.findMany.mockResolvedValue([]);
      prisma.guestGameVisualDraft.update.mockResolvedValue(
        visualDraftRow({ store, payload, status: 'PUBLISHED' }),
      );

      await service.publishVisualEditorDraft(user, { id: 'draft-1' });

      expect(prisma.guestGameLootBox.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'loot-existing' },
          data: expect.objectContaining({
            limits: expect.objectContaining({
              source: 'visual_editor',
              activatedAt: '2026-07-18T10:00:00.000Z',
              restartedAt: '2026-07-19T10:00:00.000Z',
              evaluationPolicy: 'LIVE_PRIMARY',
              totalPerDay: 5,
              perGuest: 2,
              perGuestPerWeek: 2,
            }),
          }),
        }),
      );
    });
  });

  describe('active mission wizard migration', () => {
    it('converts a scheduled legacy play-time mission without changing its activation point', async () => {
      const { service, prisma } = createService();
      const legacy = missionRow({
        id: 'legacy-play-time',
        status: 'ACTIVE',
        missionType: 'PLAY_TIME',
        triggerKind: 'PLAY_HOUR',
        rewardType: 'BONUS',
        rewardAmount: new Prisma.Decimal(60),
        xpReward: 30,
        progressTarget: 600,
        progressUnit: 'минуты',
        definitionVersion: 1,
        evaluationPolicy: 'LIVE_PRIMARY',
        periodFrom: new Date('2026-07-17T20:00:00.000Z'),
        periodTo: null,
        conditions: {
          activatedAt: '2026-07-17T20:00:00.000Z',
          visibility: 'VISIBLE',
          sessionType: 'PACKAGE_OR_SUBSCRIPTION',
          metric: {
            eventTypes: ['PLAY_HOUR', 'SESSION_STOP'],
            aggregation: 'duration',
            target: 600,
            unit: 'минуты',
            minSessionMinutes: 60,
          },
        },
      });
      const migrated = missionRow({
        ...legacy,
        definitionVersion: 2,
        missionType: 'PLAY_TIME',
        triggerKind: 'PLAY_HOUR',
        rewardType: 'BONUS_BALANCE',
      });
      prisma.guestGameMission.findMany.mockResolvedValue([legacy]);
      prisma.store.findMany.mockResolvedValue([
        { id: 'store-1', externalDomain: 'domain-1' },
      ]);
      prisma.guestGameMission.update.mockResolvedValue(migrated);

      const result = await service.migrateActiveMissionsToWizard(user);

      expect(result.migrated).toHaveLength(1);
      expect(prisma.guestGameMission.update).toHaveBeenCalledTimes(1);
      const update = prisma.guestGameMission.update.mock.calls[0][0];
      expect(update.data).toMatchObject({
        definitionVersion: 2,
        evaluationPolicy: 'LIVE_WITH_LEDGER_FALLBACK',
        missionType: 'PLAY_TIME',
        triggerKind: 'PLAY_HOUR',
        rewardType: 'BONUS_BALANCE',
        progressTarget: 600,
      });
      expect(update.data.conditions).toMatchObject({
        schemaVersion: 2,
        source: 'mission_wizard',
        taskType: 'PLAY_TIME',
        activatedAt: '2026-07-17T20:00:00.000Z',
        sessionType: 'PACKAGE_OR_SUBSCRIPTION',
        metric: {
          eventTypes: ['PLAY_HOUR', 'SESSION_STOP'],
          aggregation: 'duration',
          target: 600,
          minSessionMinutes: 60,
        },
      });
      expect(update.data).not.toHaveProperty('periodFrom');
      expect(update.data).not.toHaveProperty('periodTo');
    });

    it('does not update any active rule if one legacy condition is unsupported', async () => {
      const { service, prisma } = createService();
      prisma.guestGameMission.findMany.mockResolvedValue([
        missionRow({
          id: 'legacy-visit',
          status: 'ACTIVE',
          missionType: 'VISIT',
          triggerKind: 'SESSION_START',
          definitionVersion: 1,
          conditions: {},
        }),
      ]);
      prisma.store.findMany.mockResolvedValue([
        { id: 'store-1', externalDomain: 'domain-1' },
      ]);

      await expect(
        service.migrateActiveMissionsToWizard(user),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.guestGameMission.update).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('uses the saved balance-topup fact instead of a legacy display type', async () => {
      const { service, prisma } = createService();
      const legacy = missionRow({
        id: 'legacy-topup',
        status: 'ACTIVE',
        missionType: 'PACKAGE_OR_SUBSCRIPTION',
        triggerKind: 'SESSION_START',
        definitionVersion: 1,
        progressTarget: 10,
        progressUnit: 'topups',
        conditions: {
          metric: {
            eventTypes: ['BALANCE_TOPUP'],
            aggregation: 'count',
            target: 10,
          },
        },
      });
      prisma.guestGameMission.findMany.mockResolvedValue([legacy]);
      prisma.store.findMany.mockResolvedValue([
        { id: 'store-1', externalDomain: 'domain-1' },
      ]);
      prisma.guestGameMission.update.mockResolvedValue(
        missionRow({ ...legacy, definitionVersion: 2 }),
      );

      await service.migrateActiveMissionsToWizard(user);

      expect(prisma.guestGameMission.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            missionType: 'BALANCE_TOPUP',
            evaluationPolicy: 'LEDGER_SUPPLEMENTAL',
            conditions: expect.objectContaining({
              domainScoped: true,
              externalDomains: ['domain-1'],
              metric: expect.objectContaining({
                eventTypes: ['BALANCE_TOPUP'],
                topupMode: 'COUNT',
                count: 10,
              }),
            }),
          }),
        }),
      );
    });
  });

  describe('mission wizard activation', () => {
    it('projects the nested top-up definition over stale display columns', async () => {
      const { service, prisma } = createService();
      prisma.guestGameMission.findMany.mockResolvedValue([
        missionRow({
          missionType: 'PACKAGE_OR_SUBSCRIPTION',
          triggerKind: 'SESSION_START',
          progressTarget: 10,
          conditions: {
            schemaVersion: 2,
            taskType: 'BALANCE_TOPUP',
            sessionType: 'PACKAGE_OR_SUBSCRIPTION',
            metric: {
              eventTypes: ['BALANCE_TOPUP'],
              topupMode: 'SINGLE',
              amountComparison: 'AT_LEAST',
              amount: 10,
              minSpendAmount: 500,
              target: 10,
            },
          },
        }),
      ]);

      const [mission] = await service.getMissions(user);

      expect(mission).toMatchObject({
        missionType: 'BALANCE_TOPUP',
        triggerKind: 'BALANCE_TOPUP',
        progressTarget: 1,
        conditions: {
          taskType: 'BALANCE_TOPUP',
          sessionType: 'ANY',
          metric: {
            target: 1,
            minSpendAmount: 500,
          },
        },
      });
    });

    it('loads a v2 mission into the wizard without changing its active state', async () => {
      const { service, prisma } = createService();
      const active = missionRow({ status: 'ACTIVE' });
      prisma.guestGameMission.findFirst.mockResolvedValue(active);
      prisma.guestGameMission.findFirstOrThrow.mockResolvedValue(active);

      const result = await service.getMissionWizard(user, 'mission-1');

      expect(result.mission.status).toBe('ACTIVE');
      expect(result.definition.taskType).toBe('APP_OPEN');
      expect(result.readiness.ready).toBe(true);
      expect(prisma.guestGameMission.update).not.toHaveBeenCalled();
    });

    it('starts an indefinite mission at the server activation time', async () => {
      const { service, prisma } = createService();
      const draft = missionRow();
      prisma.guestGameMission.findFirst.mockResolvedValue(draft);
      prisma.guestGameMission.findFirstOrThrow.mockResolvedValue(draft);
      prisma.store.findFirst.mockResolvedValue(visualEditorStore());
      prisma.guestGameMission.update.mockImplementation(
        ({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve(
            missionRow({
              ...data,
              updatedAt: new Date(),
            }),
          ),
      );

      const result = await service.activateMissionWizard(user, 'mission-1');
      const activationData =
        prisma.guestGameMission.update.mock.calls[0][0].data;

      expect(activationData.status).toBe('ACTIVE');
      expect(activationData.missionType).toBe('APP_OPEN');
      expect(activationData.triggerKind).toBe('APP_OPEN');
      expect(activationData.progressTarget).toBe(1);
      expect(activationData.periodFrom).toBeInstanceOf(Date);
      expect(activationData.periodTo).toBeNull();
      expect(activationData.conditions).toMatchObject({
        indefinite: true,
        activatedAt: activationData.periodFrom.toISOString(),
      });
      expect(result.readiness.ready).toBe(true);
      expect(result.mission.periodFrom).toBe(
        activationData.periodFrom.toISOString(),
      );
      expect(result.mission.periodTo).toBeNull();
    });
  });

  describe('mission ledger fallback policy', () => {
    it('allows an administrator flow to opt a v2 play-time draft into fallback', async () => {
      const { service, prisma } = createService();
      const draft = missionRow({
        missionType: 'PLAY_TIME',
        conditions: {
          schemaVersion: 2,
          taskType: 'PLAY_TIME',
          metric: { eventTypes: ['PLAY_HOUR', 'SESSION_STOP'], target: 60 },
        },
      });
      prisma.guestGameMission.findFirst.mockResolvedValue(draft);
      prisma.guestGameMission.findFirstOrThrow.mockResolvedValue(
        missionRow({
          ...draft,
          evaluationPolicy: 'LIVE_WITH_LEDGER_FALLBACK',
        }),
      );

      const result = await service.updateMissionEvaluationPolicy(
        user,
        'mission-1',
        { evaluationPolicy: 'live_with_ledger_fallback' },
      );

      expect(result.evaluationPolicy).toBe('LIVE_WITH_LEDGER_FALLBACK');
      expect(prisma.guestGameMission.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'mission-1',
            tenantId: user.tenantId,
            status: 'DRAFT',
            definitionVersion: 2,
          }),
          data: { evaluationPolicy: 'LIVE_WITH_LEDGER_FALLBACK' },
        }),
      );
    });

    it('refuses to change the source policy of an active mission', async () => {
      const { service, prisma } = createService();
      prisma.guestGameMission.findFirst.mockResolvedValue(
        missionRow({
          status: 'ACTIVE',
          missionType: 'PLAY_TIME',
          conditions: { schemaVersion: 2, taskType: 'PLAY_TIME' },
        }),
      );

      await expect(
        service.updateMissionEvaluationPolicy(user, 'mission-1', {
          evaluationPolicy: 'LIVE_WITH_LEDGER_FALLBACK',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.guestGameMission.updateMany).not.toHaveBeenCalled();
    });

    it('refuses ledger fallback for non play-time missions', async () => {
      const { service, prisma } = createService();
      prisma.guestGameMission.findFirst.mockResolvedValue(
        missionRow({
          missionType: 'PRODUCT_PURCHASE',
          conditions: {
            schemaVersion: 2,
            taskType: 'PRODUCT_PURCHASE',
          },
        }),
      );

      await expect(
        service.updateMissionEvaluationPolicy(user, 'mission-1', {
          evaluationPolicy: 'LIVE_WITH_LEDGER_FALLBACK',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.guestGameMission.updateMany).not.toHaveBeenCalled();
    });

    it('rejects non-admin roles even if their capability can edit missions', async () => {
      const { service, prisma } = createService();
      const marketer = { ...user, role: UserRole.MARKETER };

      await expect(
        service.updateMissionEvaluationPolicy(marketer, 'mission-1', {
          evaluationPolicy: 'LIVE_WITH_LEDGER_FALLBACK',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.guestGameMission.findFirst).not.toHaveBeenCalled();
      expect(prisma.guestGameMission.updateMany).not.toHaveBeenCalled();
    });

    it('does not allow a play-time draft to opt out of the shared fallback', async () => {
      const { service, prisma } = createService();
      const draft = missionRow({
        missionType: 'PLAY_TIME',
        evaluationPolicy: 'LIVE_WITH_LEDGER_FALLBACK',
        conditions: { schemaVersion: 2, taskType: 'PLAY_TIME' },
      });
      prisma.guestGameMission.findFirst.mockResolvedValue(draft);

      await expect(
        service.updateMissionEvaluationPolicy(user, 'mission-1', {
          evaluationPolicy: 'LIVE_PRIMARY',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.guestGameMission.updateMany).not.toHaveBeenCalled();
    });

    it('fails closed when the draft changes during a policy update', async () => {
      const { service, prisma } = createService();
      const draft = missionRow({
        missionType: 'PLAY_TIME',
        conditions: { schemaVersion: 2, taskType: 'PLAY_TIME' },
      });
      prisma.guestGameMission.findFirst.mockResolvedValue(draft);
      prisma.guestGameMission.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(
        service.updateMissionEvaluationPolicy(user, 'mission-1', {
          evaluationPolicy: 'LIVE_WITH_LEDGER_FALLBACK',
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(prisma.guestGameMission.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'mission-1',
            missionType: 'PLAY_TIME',
            updatedAt: draft.updatedAt,
          }),
        }),
      );
      expect(prisma.guestGameMission.findFirstOrThrow).not.toHaveBeenCalled();
    });

    it('keeps the explicit fallback policy when the play-time draft autosaves', async () => {
      const { service, prisma } = createService();
      const draft = missionRow({
        missionType: 'PLAY_TIME',
        triggerKind: 'PLAY_HOUR',
        evaluationPolicy: 'LIVE_WITH_LEDGER_FALLBACK',
        conditions: {
          schemaVersion: 2,
          taskType: 'PLAY_TIME',
          sessionType: 'HOURLY',
          metric: {
            eventTypes: ['PLAY_HOUR', 'SESSION_STOP'],
            aggregation: 'duration',
            target: 60,
          },
        },
      });
      prisma.guestGameMission.findFirst.mockResolvedValue(draft);
      prisma.store.findMany.mockResolvedValue([
        { id: 'store-1', externalDomain: 'domain-1' },
      ]);
      prisma.guestGameMission.update.mockResolvedValue(draft);

      await service.saveMissionWizard(
        user,
        {
          name: 'Play-time fallback canary',
          taskType: 'PLAY_TIME',
          visibility: 'HIDDEN',
          storeIds: ['store-1'],
          indefinite: true,
          conditions: {
            sessionType: 'HOURLY',
            metric: {
              aggregation: 'duration',
              target: 60,
              unit: 'minutes',
            },
          },
          reward: { type: 'NONE', xpEnabled: false },
        },
        'mission-1',
      );

      expect(prisma.guestGameMission.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'DRAFT',
            definitionVersion: 2,
          }),
        }),
      );
      expect(
        prisma.guestGameMission.update.mock.calls[0][0].data,
      ).toHaveProperty('evaluationPolicy', 'LIVE_WITH_LEDGER_FALLBACK');
    });
  });

  describe('Battle Pass step ledger fallback policy', () => {
    const playTimeRules = {
      schemaVersion: 2,
      source: 'battle_pass_step',
      taskType: 'PLAY_TIME',
      triggerKind: 'PLAY_HOUR',
      evaluationPolicy: 'LIVE_PRIMARY',
      metric: {
        aggregation: 'duration',
        target: 60,
        unit: 'minutes',
      },
    };

    it('updates an active v2 play-time step and preserves every other JSON field', async () => {
      const { service, prisma } = createService();
      const levels = [
        {
          id: 'welcome-step',
          level: 1,
          sequence: 1,
          title: 'Welcome',
          activationRules: {
            schemaVersion: 2,
            taskType: 'APP_OPEN',
            triggerKind: 'APP_OPEN',
            evaluationPolicy: 'LIVE_PRIMARY',
          },
          freeRewardDetails: { type: 'NONE', untouched: true },
        },
        {
          id: 'play-step',
          level: 7,
          sequence: 2,
          title: 'Play one hour',
          description: 'Keep this text',
          activationRules: {
            ...playTimeRules,
            nestedEvidence: { keep: ['all', 'values'] },
          },
          premiumRewardDetails: { type: 'LOOT_BOX', id: 'loot-1' },
        },
      ];
      const season = seasonRow({ levels });
      let updatedLevels: unknown = null;
      prisma.guestGameSeason.findFirst.mockResolvedValue(season);
      prisma.guestGameSeason.updateMany.mockImplementation(
        ({ data }: { data: { levels: unknown } }) => {
          updatedLevels = data.levels;
          return Promise.resolve({ count: 1 });
        },
      );
      prisma.guestGameSeason.findFirstOrThrow.mockImplementation(() =>
        Promise.resolve(
          seasonRow({
            ...season,
            levels: updatedLevels,
            updatedAt: new Date('2026-06-10T10:00:01.000Z'),
          }),
        ),
      );

      const result = await service.updateBattlePassStepEvaluationPolicy(
        user,
        'season-1',
        '2',
        {
          evaluationPolicy: 'live_with_ledger_fallback',
          expectedUpdatedAt: isoNow,
        },
      );

      expect(result.status).toBe('ACTIVE');
      expect(updatedLevels).toEqual([
        levels[0],
        {
          ...levels[1],
          activationRules: {
            ...levels[1].activationRules,
            evaluationPolicy: 'LIVE_WITH_LEDGER_FALLBACK',
          },
        },
      ]);
      expect(prisma.guestGameSeason.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'season-1',
          tenantId: user.tenantId,
          status: { in: ['ACTIVE', 'DRAFT'] },
          updatedAt: now,
        },
        data: { levels: updatedLevels },
      });
    });

    it('uses the evaluator canonical sequence when raw levels are unsorted', async () => {
      const { service, prisma } = createService();
      const season = seasonRow({
        status: 'DRAFT',
        levels: [
          {
            level: 10,
            sequence: 1,
            title: 'Later raw step',
            activationRules: {
              schemaVersion: 2,
              taskType: 'APP_OPEN',
              triggerKind: 'APP_OPEN',
              evaluationPolicy: 'LIVE_PRIMARY',
            },
          },
          {
            level: 3,
            sequence: 2,
            title: 'First canonical step',
            activationRules: playTimeRules,
          },
        ],
      });
      prisma.guestGameSeason.findFirst.mockResolvedValue(season);
      prisma.guestGameSeason.findFirstOrThrow.mockResolvedValue(
        seasonRow({
          ...season,
          levels: [
            {
              level: 10,
              sequence: 1,
              title: 'Later raw step',
              activationRules: {
                schemaVersion: 2,
                taskType: 'APP_OPEN',
                triggerKind: 'APP_OPEN',
                evaluationPolicy: 'LIVE_PRIMARY',
              },
            },
            {
              level: 3,
              sequence: 2,
              title: 'First canonical step',
              activationRules: {
                ...playTimeRules,
                evaluationPolicy: 'LIVE_WITH_LEDGER_FALLBACK',
              },
            },
          ],
        }),
      );

      await service.updateBattlePassStepEvaluationPolicy(
        user,
        'season-1',
        '1',
        {
          evaluationPolicy: 'LIVE_WITH_LEDGER_FALLBACK',
          expectedUpdatedAt: isoNow,
        },
      );

      expect(prisma.guestGameSeason.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            levels: [
              expect.objectContaining({
                title: 'Later raw step',
                activationRules: expect.objectContaining({
                  evaluationPolicy: 'LIVE_PRIMARY',
                }),
              }),
              expect.objectContaining({
                title: 'First canonical step',
                id: expect.stringMatching(/^bp-step-[a-f0-9]{16}$/),
                activationRules: expect.objectContaining({
                  evaluationPolicy: 'LIVE_WITH_LEDGER_FALLBACK',
                }),
              }),
            ],
          },
        }),
      );
    });

    it('canonicalizes a legacy play-time step to the shared fallback', async () => {
      const { service, prisma } = createService();
      const legacySeason = seasonRow({
        levels: [
          {
            sequence: 1,
            activationRules: { ...playTimeRules, schemaVersion: 1 },
          },
        ],
      });
      prisma.guestGameSeason.findFirst.mockResolvedValue(legacySeason);
      prisma.guestGameSeason.findFirstOrThrow.mockResolvedValue(
        seasonRow({
          ...legacySeason,
          levels: [
            {
              sequence: 1,
              activationRules: {
                ...playTimeRules,
                schemaVersion: 1,
                evaluationPolicy: 'LIVE_WITH_LEDGER_FALLBACK',
              },
            },
          ],
        }),
      );

      await expect(
        service.updateBattlePassStepEvaluationPolicy(user, 'season-1', '1', {
          evaluationPolicy: 'LIVE_WITH_LEDGER_FALLBACK',
          expectedUpdatedAt: isoNow,
        }),
      ).resolves.toMatchObject({
        levels: [
          expect.objectContaining({
            activationRules: expect.objectContaining({
              evaluationPolicy: 'LIVE_WITH_LEDGER_FALLBACK',
            }),
          }),
        ],
      });
      expect(prisma.guestGameSeason.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            levels: [
              expect.objectContaining({
                activationRules: expect.objectContaining({
                  evaluationPolicy: 'LIVE_WITH_LEDGER_FALLBACK',
                }),
              }),
            ],
          },
        }),
      );
    });

    it('rejects a non play-time step', async () => {
      const { service, prisma } = createService();
      prisma.guestGameSeason.findFirst.mockResolvedValue(
        seasonRow({
          levels: [
            {
              sequence: 1,
              activationRules: {
                ...playTimeRules,
                taskType: 'CHECK_IN',
              },
            },
          ],
        }),
      );

      await expect(
        service.updateBattlePassStepEvaluationPolicy(user, 'season-1', '1', {
          evaluationPolicy: 'LIVE_WITH_LEDGER_FALLBACK',
          expectedUpdatedAt: isoNow,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.guestGameSeason.updateMany).not.toHaveBeenCalled();
    });

    it('rejects an unsupported policy without changing the season', async () => {
      const { service, prisma } = createService();
      prisma.guestGameSeason.findFirst.mockResolvedValue(
        seasonRow({
          levels: [{ sequence: 1, activationRules: playTimeRules }],
        }),
      );

      await expect(
        service.updateBattlePassStepEvaluationPolicy(user, 'season-1', '1', {
          evaluationPolicy: 'LEDGER_SUPPLEMENTAL',
          expectedUpdatedAt: isoNow,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.guestGameSeason.updateMany).not.toHaveBeenCalled();
    });

    it('rejects roles outside owner, admin and manager', async () => {
      const { service, prisma } = createService();
      const marketer = { ...user, role: UserRole.MARKETER };

      await expect(
        service.updateBattlePassStepEvaluationPolicy(
          marketer,
          'season-1',
          '1',
          {
            evaluationPolicy: 'LIVE_WITH_LEDGER_FALLBACK',
            expectedUpdatedAt: isoNow,
          },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.guestGameSeason.findFirst).not.toHaveBeenCalled();
      expect(prisma.guestGameSeason.updateMany).not.toHaveBeenCalled();
    });

    it('rejects a non-operational season status', async () => {
      const { service, prisma } = createService();
      prisma.guestGameSeason.findFirst.mockResolvedValue(
        seasonRow({
          status: 'PAUSED',
          levels: [{ sequence: 1, activationRules: playTimeRules }],
        }),
      );

      await expect(
        service.updateBattlePassStepEvaluationPolicy(user, 'season-1', '1', {
          evaluationPolicy: 'LIVE_WITH_LEDGER_FALLBACK',
          expectedUpdatedAt: isoNow,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.guestGameSeason.updateMany).not.toHaveBeenCalled();
    });

    it('fails closed when expectedUpdatedAt is stale', async () => {
      const { service, prisma } = createService();
      prisma.guestGameSeason.findFirst.mockResolvedValue(
        seasonRow({
          levels: [{ sequence: 1, activationRules: playTimeRules }],
        }),
      );
      prisma.guestGameSeason.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(
        service.updateBattlePassStepEvaluationPolicy(user, 'season-1', '1', {
          evaluationPolicy: 'LIVE_WITH_LEDGER_FALLBACK',
          expectedUpdatedAt: '2026-06-10T09:59:59.000Z',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.guestGameSeason.findFirstOrThrow).not.toHaveBeenCalled();
    });

    it('canonicalizes every v2 PLAY_TIME step to ledger fallback during a normal season save', async () => {
      const { service, prisma } = createService();
      const current = seasonRow({
        status: 'DRAFT',
        levels: [
          {
            id: 'stable-play-step',
            level: 2,
            sequence: 1,
            activationRules: {
              ...playTimeRules,
              evaluationPolicy: 'LIVE_WITH_LEDGER_FALLBACK',
            },
          },
          {
            id: 'must-not-inherit-by-level',
            level: 3,
            sequence: 2,
            activationRules: {
              ...playTimeRules,
              evaluationPolicy: 'LIVE_WITH_LEDGER_FALLBACK',
            },
          },
        ],
      });
      let updatedLevels: unknown = null;
      prisma.guestGameSeason.findFirst.mockResolvedValue(current);
      prisma.store.findMany.mockResolvedValue([
        { id: 'store-1', externalDomain: 'domain-1' },
      ]);
      prisma.guestGameSeason.updateMany.mockImplementation(
        ({ data }: { data: { levels: unknown } }) => {
          updatedLevels = data.levels;
          return Promise.resolve({ count: 1 });
        },
      );
      prisma.guestGameSeason.findFirstOrThrow.mockImplementation(() =>
        Promise.resolve(seasonRow({ ...current, levels: updatedLevels })),
      );

      await service.updateSeason(user, 'season-1', {
        levels: [
          {
            id: 'stable-play-step',
            level: 2,
            sequence: 1,
            activationRules: {
              ...playTimeRules,
              evaluationPolicy: 'LIVE_PRIMARY',
              metric: { ...playTimeRules.metric, target: 120 },
            },
          },
          {
            level: 3,
            sequence: 2,
            activationRules: {
              ...playTimeRules,
              evaluationPolicy: 'LIVE_WITH_LEDGER_FALLBACK',
            },
          },
        ],
      });

      expect(updatedLevels).toEqual([
        expect.objectContaining({
          id: 'stable-play-step',
          activationRules: expect.objectContaining({
            evaluationPolicy: 'LIVE_WITH_LEDGER_FALLBACK',
            metric: expect.objectContaining({ target: 120 }),
          }),
        }),
        expect.objectContaining({
          activationRules: expect.objectContaining({
            evaluationPolicy: 'LIVE_WITH_LEDGER_FALLBACK',
          }),
        }),
      ]);
      expect(prisma.guestGameSeason.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 'season-1',
            tenantId: user.tenantId,
            updatedAt: current.updatedAt,
          },
        }),
      );
    });

    it('fails closed on ambiguous persisted level identity during a season save', async () => {
      const { service, prisma } = createService();
      prisma.guestGameSeason.findFirst.mockResolvedValue(
        seasonRow({
          status: 'DRAFT',
          levels: [
            { level: 2, activationRules: playTimeRules },
            { level: 2, activationRules: playTimeRules },
          ],
        }),
      );
      prisma.store.findMany.mockResolvedValue([
        { id: 'store-1', externalDomain: 'domain-1' },
      ]);

      await expect(
        service.updateSeason(user, 'season-1', {
          levels: [{ level: 2, activationRules: playTimeRules }],
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.guestGameSeason.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('Battle Pass activation', () => {
    it('detaches the previous active season only from overlapping clubs', async () => {
      const { service, prisma } = createService();
      const active = seasonRow({ id: 'season-new', storeIds: ['store-1'] });

      prisma.guestGameSeason.create.mockResolvedValue(active);
      prisma.store.findMany.mockResolvedValue([
        visualEditorStore({ id: 'store-1' }),
        visualEditorStore({ id: 'store-2', name: 'Second club' }),
      ]);
      prisma.guestGameSeason.findMany.mockResolvedValue([
        {
          id: 'season-global',
          storeIds: [],
          periodFrom: null,
          periodTo: null,
        },
        {
          id: 'season-other-club',
          storeIds: ['store-2'],
          periodFrom: null,
          periodTo: null,
        },
      ]);
      prisma.guestGameSeason.update.mockResolvedValue({});

      await service.createSeason(user, {
        name: 'New season',
        status: 'ACTIVE',
        storeIds: ['store-1'],
      });

      expect(prisma.guestGameSeason.update).toHaveBeenCalledTimes(1);
      expect(prisma.guestGameSeason.update).toHaveBeenCalledWith({
        where: { id: 'season-global' },
        data: { storeIds: ['store-2'] },
      });
    });

    it('keeps the current season when the replacement starts in the future', async () => {
      const { service, prisma } = createService();
      const future = new Date(Date.now() + 60 * 60 * 1000);

      prisma.guestGameSeason.create.mockResolvedValue(
        seasonRow({
          id: 'season-future',
          periodFrom: future,
        }),
      );

      await service.createSeason(user, {
        name: 'Future season',
        status: 'ACTIVE',
        storeIds: ['store-1'],
        periodFrom: future.toISOString(),
      });

      expect(prisma.store.findMany).not.toHaveBeenCalled();
      expect(prisma.guestGameSeason.findMany).not.toHaveBeenCalled();
      expect(prisma.guestGameSeason.update).not.toHaveBeenCalled();
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

      await expect(
        service.deleteLootBox(user, 'loot-delete'),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'GAME_RULE_ACTIVE',
          storeNames: [expect.stringContaining('1337-Пушкинская')],
        }),
      });
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

  describe('createEvent', () => {
    it('persists the event, atomic XP increment and XP posting in one callback transaction', async () => {
      const { service, prisma } = createService();
      const createdRow = {
        id: 'event-xp-1',
        eventType: 'SESSION_START',
        source: 'API_IMPORT',
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: 'club-1',
        externalId: 'session-xp-1',
        originKey: 'origin-xp-1',
        xpDelta: 30,
        occurredAt: now,
        payload: null,
        note: null,
        createdAt: now,
        profile: {
          id: 'profile-1',
          displayName: 'Guest One',
          contactMasked: '+7 *** **-11',
          xp: 150,
          level: 1,
        },
        guest: null,
        lootBox: null,
        mission: null,
        season: null,
        createdByUser: null,
      };

      jest.spyOn(service as any, 'buildEventData').mockResolvedValue({
        tenantId: user.tenantId,
        profileId: 'profile-1',
        eventType: 'SESSION_START',
        source: 'API_IMPORT',
        originKey: 'origin-xp-1',
        xpDelta: 30,
        occurredAt: now,
      });
      prisma.guestGameEvent.create.mockResolvedValue(createdRow);
      prisma.guestGameEvent.findUnique.mockResolvedValue(createdRow);
      prisma.guestGameProfile.update
        .mockResolvedValueOnce({ xp: 150 })
        .mockResolvedValueOnce({});

      const result = await service.createEvent(
        user,
        {
          profileId: 'profile-1',
          eventType: 'SESSION_START',
          source: 'API_IMPORT',
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: 'club-1',
          externalId: 'session-xp-1',
          xpDelta: 30,
          occurredAt: isoNow,
        },
        { originKey: 'origin-xp-1' },
      );

      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: 'Serializable',
      });
      expect(prisma.guestGameEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            profileId: 'profile-1',
            xpDelta: 30,
          }),
        }),
      );
      expect(prisma.guestGameProfile.update).toHaveBeenNthCalledWith(1, {
        where: { id: 'profile-1' },
        data: {
          xp: { increment: 30 },
          lastActivityAt: expect.any(Date),
        },
        select: { xp: true },
      });
      expect(prisma.guestGameProfile.update).toHaveBeenNthCalledWith(2, {
        where: { id: 'profile-1' },
        data: {
          xp: 150,
          level: 1,
          lastActivityAt: expect.any(Date),
        },
      });
      expect(prisma.guestGameXpPosting.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: user.tenantId,
          profileId: 'profile-1',
          eventId: 'event-xp-1',
          idempotencyKey: 'guest-game-xp:event-xp-1',
          requestedDelta: 30,
          appliedDelta: 30,
          balanceBefore: 120,
          balanceAfter: 150,
        }),
      });
      expect(result).toMatchObject({
        id: 'event-xp-1',
        originKey: 'origin-xp-1',
        xpDelta: 30,
      });
    });

    it('fails the atomic event transaction when the XP posting write fails', async () => {
      const { service, prisma } = createService();
      const createdRow = {
        id: 'event-xp-posting-failure',
        eventType: 'SESSION_START',
        source: 'API_IMPORT',
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: 'club-1',
        externalId: 'session-xp-posting-failure',
        originKey: 'origin-xp-posting-failure',
        xpDelta: 30,
        occurredAt: now,
        payload: null,
        note: null,
        createdAt: now,
        profile: null,
        guest: null,
        lootBox: null,
        mission: null,
        season: null,
        createdByUser: null,
      };
      const postingFailure = new Error('XP posting write failed');

      jest.spyOn(service as any, 'buildEventData').mockResolvedValue({
        tenantId: user.tenantId,
        profileId: 'profile-1',
        eventType: 'SESSION_START',
        source: 'API_IMPORT',
        originKey: 'origin-xp-posting-failure',
        xpDelta: 30,
        occurredAt: now,
      });
      prisma.guestGameEvent.create.mockResolvedValue(createdRow);
      prisma.guestGameProfile.update
        .mockResolvedValueOnce({ xp: 150 })
        .mockResolvedValueOnce({});
      prisma.guestGameXpPosting.create.mockRejectedValue(postingFailure);

      await expect(
        service.createEvent(
          user,
          {
            profileId: 'profile-1',
            eventType: 'SESSION_START',
            source: 'API_IMPORT',
            externalProvider: IntegrationProvider.LANGAME,
            externalDomain: 'club-1',
            externalId: 'session-xp-posting-failure',
            xpDelta: 30,
            occurredAt: isoNow,
          },
          { originKey: 'origin-xp-posting-failure' },
        ),
      ).rejects.toBe(postingFailure);

      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: 'Serializable',
      });
      expect(prisma.guestGameEvent.create).toHaveBeenCalledTimes(1);
      expect(prisma.guestGameXpPosting.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventId: createdRow.id,
          idempotencyKey: `guest-game-xp:${createdRow.id}`,
        }),
      });
      expect(prisma.guestGameEvent.findUnique).not.toHaveBeenCalled();
    });

    it('suppresses a cross-event Battle Pass claim with changed diagnostics without rolling back other reward or XP-only rules', async () => {
      const { service, prisma } = createService();
      const missionRule = dryRunResult().rules[0];
      const seasonRule = {
        ...missionRule,
        id: 'season-1',
        kind: 'SEASON' as const,
        name: 'Club season',
        rewardType: 'BATTLE_PASS_REWARD',
        rewardAmount: 0,
        rewardLabel: 'Step 2 reward',
        selectedRewardLabel: 'Step 2 reward',
        battlePassLevel: 2,
        battlePassStep: 2,
        battlePassStepTitle: 'Hour session',
        periodicLimitPeriod: null,
      };
      const xpOnlyRule = {
        ...missionRule,
        id: 'mission-xp-only',
        name: 'XP only mission',
        rewardType: null,
        rewardAmount: null,
        rewardLabel: null,
        selectedRewardLabel: null,
        xpDelta: 20,
        periodicLimitPeriod: null,
      };
      const rewardIntents = [
        {
          schemaVersion: 1,
          qualifiedAt: isoNow,
          slotKey: '2:BATTLE_PASS_REWARD',
          claimKey: 'season:season-1:profile:profile-1:step:2',
          rule: seasonRule,
        },
        {
          schemaVersion: 1,
          qualifiedAt: isoNow,
          slotKey: 'BONUS',
          claimKey: null,
          rule: {
            ...missionRule,
            periodicLimitPeriod: null,
          },
        },
      ];
      const payload = {
        processSchemaVersion: 2,
        rules: [seasonRule, missionRule, xpOnlyRule],
        rewardIntents,
      };
      const createdRow = {
        ...eventResult({
          id: 'event-claim-race',
          externalId: 'session-claim-race',
          xpDelta: 0,
          payload,
        }),
        occurredAt: now,
        createdAt: now,
      };
      const finalRow = {
        ...createdRow,
        xpDelta: 50,
      };

      jest.spyOn(service as any, 'buildEventData').mockResolvedValue({
        tenantId: user.tenantId,
        profileId: 'profile-1',
        eventType: 'SESSION_START',
        source: 'API_IMPORT',
        originKey: 'origin-claim-race',
        xpDelta: 80,
        occurredAt: now,
        payload,
      });
      prisma.guestGameEvent.create.mockResolvedValue(createdRow);
      prisma.guestGameEvent.findUnique.mockResolvedValue(finalRow);
      prisma.guestGameRewardIntent.upsert.mockImplementation(({ create }) => {
        if (
          create.effectKind === 'REWARD' &&
          create.claimKey === 'season:season-1:profile:profile-1:step:2'
        ) {
          return Promise.resolve({
            id: 'intent-existing-step',
            ...create,
            eventId: 'event-existing-step',
            originKey: 'origin-existing-step',
            idempotencyKey: 'intent-existing-step-idempotency',
            plan: {
              ...create.plan,
              qualifiedAt: '2026-06-09T10:00:00.000Z',
              rule: {
                ...create.plan.rule,
                name: 'Previous season diagnostics',
                reasons: ['previous evaluator reason'],
              },
            },
          });
        }
        return Promise.resolve({
          id: `intent-${create.effectKind}-${create.ruleId}`,
          ...create,
        });
      });
      prisma.guestGameProfile.update
        .mockResolvedValueOnce({ xp: 150 })
        .mockResolvedValueOnce({});

      const result = await service.createEvent(
        user,
        {
          profileId: 'profile-1',
          eventType: 'SESSION_START',
          source: 'API_IMPORT',
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: 'club-1',
          externalId: 'session-claim-race',
          xpDelta: 80,
          occurredAt: isoNow,
          payload,
        },
        { originKey: 'origin-claim-race' },
      );

      expect(prisma.guestGameEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ xpDelta: 0 }),
        }),
      );
      expect(prisma.guestGameRewardIntent.upsert).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: {
            tenantId_claimKey: {
              tenantId: user.tenantId,
              claimKey: 'season:season-1:profile:profile-1:step:2',
            },
          },
          create: expect.objectContaining({
            eventId: 'event-claim-race',
            claimKey: 'season:season-1:profile:profile-1:step:2',
          }),
          update: {},
        }),
      );
      expect(prisma.guestGameRewardIntent.upsert).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: {
            tenantId_idempotencyKey: {
              tenantId: user.tenantId,
              idempotencyKey: expect.any(String),
            },
          },
          create: expect.objectContaining({
            eventId: 'event-claim-race',
            claimKey: null,
          }),
          update: {},
        }),
      );
      expect(prisma.guestGameEvent.update).toHaveBeenCalledWith({
        where: { id: 'event-claim-race' },
        data: { xpDelta: 50 },
      });
      expect(prisma.guestGameProfile.update).toHaveBeenNthCalledWith(1, {
        where: { id: 'profile-1' },
        data: {
          xp: { increment: 50 },
          lastActivityAt: expect.any(Date),
        },
        select: { xp: true },
      });
      expect(prisma.guestGameXpPosting.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventId: 'event-claim-race',
          requestedDelta: 50,
          appliedDelta: 50,
        }),
      });
      expect(
        prisma.guestGameRewardIntent.upsert.mock.calls
          .map(([call]) => call.create)
          .filter((create) => create.effectKind === 'XP_POSTING')
          .map((create) => create.ruleId),
      ).toEqual([missionRule.id, xpOnlyRule.id]);
      expect(result).toMatchObject({
        id: 'event-claim-race',
        xpDelta: 50,
      });
    });

    it('atomically reserves one limited mission qualification, reward and XP posting across concurrent events', async () => {
      const { service, prisma } = createService();
      const missionRule = {
        ...dryRunResult().rules[0],
        missionPerGuestLimit: 1,
        missionTotalRewardLimit: 1,
        budgetAmount: 50,
        periodicLimitPeriod: null,
        missionDenySameDayRepeat: false,
      };
      const rewardIntent = {
        schemaVersion: 1,
        qualifiedAt: isoNow,
        slotKey: 'BONUS',
        claimKey: null,
        rule: missionRule,
      };
      const payload = {
        processSchemaVersion: 2,
        source: 'guest_gamification_process_event',
        store: {
          id: 'store-1',
          name: 'Club',
          timeZone: 'Asia/Yekaterinburg',
        },
        input: dryRunResult().input,
        rules: [missionRule],
        rewardIntents: [rewardIntent],
      };
      const events: Array<Record<string, any>> = [];
      const intents: Array<Record<string, any>> = [];
      const postings: Array<Record<string, any>> = [];
      let eventSequence = 0;
      let intentSequence = 0;
      let profileXp = 120;
      let transactionTail: Promise<unknown> = Promise.resolve();

      jest
        .spyOn(service as any, 'buildEventData')
        .mockImplementation((_user, dto, identity) =>
          Promise.resolve({
            tenantId: user.tenantId,
            profileId: dto.profileId,
            guestId: dto.guestId,
            eventType: dto.eventType,
            source: dto.source,
            externalProvider: dto.externalProvider,
            externalDomain: dto.externalDomain,
            externalId: dto.externalId,
            originKey: identity.originKey,
            xpDelta: dto.xpDelta,
            occurredAt: new Date(dto.occurredAt),
            payload: dto.payload,
            note: null,
          }),
        );
      prisma.guestGameMission.findMany.mockResolvedValue([
        {
          id: missionRule.id,
          status: 'ACTIVE',
          conditions: { reward: {} },
          antiFraudRules: null,
          perGuestLimit: 1,
          totalRewardLimit: 1,
          budgetAmount: new Prisma.Decimal(50),
          rewardAmount: new Prisma.Decimal(50),
        },
      ]);
      prisma.guestGameRewardIntent.findMany.mockImplementation(() =>
        Promise.resolve(intents),
      );
      prisma.guestGameReward.findMany.mockResolvedValue([]);
      prisma.guestGameEntitlement.findMany.mockResolvedValue([]);
      prisma.guestGameEvent.create.mockImplementation(({ data }) => {
        const row = {
          id: `event-atomic-mission-${++eventSequence}`,
          ...data,
          createdAt: now,
          profile: {
            id: 'profile-1',
            displayName: 'Guest One',
            contactMasked: '+7 *** **-11',
            xp: profileXp,
            level: 1,
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
        };
        events.push(row);
        return Promise.resolve(row);
      });
      prisma.guestGameEvent.update.mockImplementation(({ where, data }) => {
        const row = events.find((item) => item.id === where.id)!;
        Object.assign(row, data);
        return Promise.resolve(row);
      });
      prisma.guestGameEvent.findUnique.mockImplementation(({ where }) =>
        Promise.resolve(events.find((item) => item.id === where.id) ?? null),
      );
      prisma.guestGameRewardIntent.upsert.mockImplementation(
        ({ where, create }) => {
          const idempotencyKey = where.tenantId_idempotencyKey?.idempotencyKey;
          const existing = intents.find(
            (item) => item.idempotencyKey === idempotencyKey,
          );
          if (existing) return Promise.resolve(existing);
          const row = { id: `intent-${++intentSequence}`, ...create };
          intents.push(row);
          return Promise.resolve(row);
        },
      );
      prisma.guestGameProfile.update.mockImplementation(({ data }) => {
        if (data.xp?.increment) profileXp += data.xp.increment;
        else if (typeof data.xp === 'number') profileXp = data.xp;
        return Promise.resolve({ xp: profileXp });
      });
      prisma.guestGameXpPosting.create.mockImplementation(({ data }) => {
        postings.push(data);
        return Promise.resolve(data);
      });
      prisma.$queryRaw.mockResolvedValue([]);
      prisma.$transaction.mockImplementation((operation) => {
        if (typeof operation !== 'function') return Promise.all(operation);
        const current = transactionTail.then(() => operation(prisma));
        transactionTail = current.catch(() => undefined);
        return current;
      });

      const results = await Promise.all(
        ['one', 'two'].map((suffix) =>
          service.createEvent(
            user,
            {
              profileId: 'profile-1',
              guestId: 'guest-1',
              eventType: 'SESSION_START',
              source: 'API_IMPORT',
              externalProvider: IntegrationProvider.LANGAME,
              externalDomain: 'club-1',
              externalId: `session-atomic-${suffix}`,
              xpDelta: 30,
              occurredAt: isoNow,
              payload,
            } as any,
            { originKey: `origin-atomic-${suffix}` },
          ),
        ),
      );

      expect(
        intents.filter((intent) => intent.effectKind === 'QUALIFICATION'),
      ).toHaveLength(1);
      expect(
        intents.filter((intent) => intent.effectKind === 'REWARD'),
      ).toHaveLength(1);
      expect(postings).toHaveLength(1);
      expect(events.map((event) => event.xpDelta).sort()).toEqual([0, 30]);
      expect(results.map((event) => event.xpDelta).sort()).toEqual([0, 30]);
      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: 'Serializable',
      });
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

    it('does not self-unlock reward-template lootboxes on generic events but still evaluates BOTH', async () => {
      const { service } = createService();

      jest
        .spyOn(service as any, 'resolveDryRunProfile')
        .mockResolvedValue(profileFixture());
      jest.spyOn(service, 'getLootBoxes').mockResolvedValue([
        activeLootBox({
          id: 'reward-template',
          usageKind: 'REWARD_TEMPLATE',
        }),
        activeLootBox({ id: 'both', usageKind: 'BOTH' }),
      ]);
      jest.spyOn(service, 'getMissions').mockResolvedValue([]);
      jest.spyOn(service, 'getSeasons').mockResolvedValue([]);
      jest.spyOn(service as any, 'getDryRunRewards').mockResolvedValue([]);

      const result = await service.dryRun(user, {
        eventType: 'SESSION_START',
        occurredAt: isoNow,
        sessionType: 'regular_session',
      });

      expect(result.rules).toEqual([
        expect.objectContaining({
          id: 'both',
          kind: 'LOOT_BOX',
          eligible: true,
        }),
      ]);
      expect(result.summary).toMatchObject({
        checkedRules: 1,
        eligibleRules: 1,
      });
    });

    it('maps canonical recovery session classes to legacy lootbox session types', async () => {
      const { service } = createService();

      jest
        .spyOn(service as any, 'resolveDryRunProfile')
        .mockResolvedValue(profileFixture());
      jest.spyOn(service, 'getLootBoxes').mockResolvedValue([
        activeLootBox({ id: 'hourly', sessionType: 'regular_session' }),
        activeLootBox({
          id: 'package',
          sessionType: 'packet_hours',
        }),
      ]);
      jest.spyOn(service, 'getMissions').mockResolvedValue([]);
      jest.spyOn(service, 'getSeasons').mockResolvedValue([]);
      jest.spyOn(service as any, 'getDryRunRewards').mockResolvedValue([]);

      const packageResult = await service.dryRun(user, {
        eventType: 'SESSION_START',
        occurredAt: isoNow,
        sessionType: 'PACKAGE_OR_SUBSCRIPTION',
        sessionPacket: true,
      });
      const hourlyResult = await service.dryRun(user, {
        eventType: 'SESSION_START',
        occurredAt: isoNow,
        sessionType: 'HOURLY',
        sessionPacket: false,
      });

      expect(packageResult.rules).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'package', eligible: true }),
          expect.objectContaining({ id: 'hourly', eligible: false }),
        ]),
      );
      expect(hourlyResult.rules).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'hourly', eligible: true }),
          expect.objectContaining({ id: 'package', eligible: false }),
        ]),
      );
    });

    it('allows an explicit manual open to evaluate a reward-template lootbox', async () => {
      const { service } = createService();

      jest
        .spyOn(service as any, 'resolveDryRunProfile')
        .mockResolvedValue(profileFixture());
      jest.spyOn(service, 'getLootBoxes').mockResolvedValue([
        activeLootBox({
          id: 'reward-template',
          usageKind: 'REWARD_TEMPLATE',
        }),
      ]);
      jest.spyOn(service, 'getMissions').mockResolvedValue([]);
      jest.spyOn(service, 'getSeasons').mockResolvedValue([]);
      jest.spyOn(service as any, 'getDryRunRewards').mockResolvedValue([]);

      const result = await service.dryRun(user, {
        lootBoxId: 'reward-template',
        eventType: 'SESSION_START',
        occurredAt: isoNow,
        sessionType: 'regular_session',
      });

      expect(result.rules).toEqual([
        expect.objectContaining({
          id: 'reward-template',
          kind: 'LOOT_BOX',
          eligible: true,
        }),
      ]);
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

    it('enforces a lootbox WEEKENDS mode without materialized weekdays', async () => {
      const { service } = createService();

      jest
        .spyOn(service as any, 'resolveDryRunProfile')
        .mockResolvedValue(profileFixture());
      jest.spyOn(service as any, 'assertStore').mockResolvedValue({
        id: 'store-1',
        name: '1337 Pushkinskaya',
        timeZone: 'Asia/Yekaterinburg',
      });
      jest.spyOn(service, 'getLootBoxes').mockResolvedValue([
        activeLootBox({
          storeIds: ['store-1'],
          periodRules: { weekdayMode: 'WEEKENDS' },
        }),
      ]);
      jest.spyOn(service, 'getMissions').mockResolvedValue([]);
      jest.spyOn(service, 'getSeasons').mockResolvedValue([]);
      jest.spyOn(service as any, 'getDryRunRewards').mockResolvedValue([]);

      const friday = await service.dryRun(user, {
        eventType: 'SESSION_START',
        storeId: 'store-1',
        occurredAt: '2026-06-12T10:00:00.000Z',
        sessionType: 'regular_session',
      });
      const saturday = await service.dryRun(user, {
        eventType: 'SESSION_START',
        storeId: 'store-1',
        occurredAt: '2026-06-13T10:00:00.000Z',
        sessionType: 'regular_session',
      });

      expect(friday.summary).toMatchObject({
        eligibleRules: 0,
        blockedRules: 1,
      });
      expect(saturday.summary).toMatchObject({
        eligibleRules: 1,
        blockedRules: 0,
      });
    });

    it('enforces nested mission period rules without materialized weekdays', async () => {
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
          definitionVersion: 2,
          progressTarget: 1,
          storeIds: ['store-1'],
          conditions: {
            metric: {
              aggregation: 'exists',
              eventTypes: ['SESSION_START'],
              weekdayMode: 'WEEKDAYS',
              target: 1,
            },
          },
        }),
      ]);
      jest.spyOn(service, 'getSeasons').mockResolvedValue([]);
      jest.spyOn(service as any, 'getDryRunRewards').mockResolvedValue([]);

      const result = await service.dryRun(user, {
        eventType: 'SESSION_START',
        storeId: 'store-1',
        occurredAt: '2026-06-13T10:00:00.000Z',
        sessionType: 'regular_session',
      });

      expect(result.summary).toMatchObject({
        eligibleRules: 0,
        blockedRules: 1,
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

    it('counts an outstanding entitlement toward a periodic lootbox limit', async () => {
      const { service, prisma } = createService();

      jest
        .spyOn(service as any, 'resolveDryRunProfile')
        .mockResolvedValue(profileFixture());
      jest.spyOn(service, 'getLootBoxes').mockResolvedValue([
        activeLootBox({
          limits: { periodicLimit: 'DAILY' },
        }),
      ]);
      jest.spyOn(service, 'getMissions').mockResolvedValue([]);
      jest.spyOn(service, 'getSeasons').mockResolvedValue([]);
      jest.spyOn(service as any, 'getDryRunRewards').mockResolvedValue([]);
      prisma.guestGameEntitlement.findMany.mockResolvedValue([
        {
          ruleId: 'loot-box-1',
          status: 'AVAILABLE',
          rewardId: null,
          profileId: 'profile-1',
          guestId: 'guest-1',
          qualifiedAt: new Date('2026-06-10T08:00:00.000Z'),
          evidence: null,
        },
      ]);

      const result = await service.dryRun(user, {
        eventType: 'SESSION_START',
        occurredAt: isoNow,
        sessionType: 'regular_session',
      });

      expect(result.rules[0]).toMatchObject({
        id: 'loot-box-1',
        eligible: false,
        periodicLimitPeriod: 'DAILY',
        blockers: expect.arrayContaining([
          expect.stringContaining('календарный день клуба'),
        ]),
      });
    });

    it('counts a consumed entitlement once when its reward is also present', async () => {
      const { service, prisma } = createService();
      const linkedReward = rewardResult({
        id: 'reward-from-entitlement',
        qualifiedAt: '2026-06-09T10:00:00.000Z',
        lootBox: {
          id: 'loot-box-1',
          name: 'Prize lootbox',
          status: 'ACTIVE',
        },
      });

      jest
        .spyOn(service as any, 'resolveDryRunProfile')
        .mockResolvedValue(profileFixture());
      jest.spyOn(service, 'getLootBoxes').mockResolvedValue([
        activeLootBox({
          limits: { perGuestPerWeek: 1 },
        }),
      ]);
      jest.spyOn(service, 'getMissions').mockResolvedValue([]);
      jest.spyOn(service, 'getSeasons').mockResolvedValue([]);
      jest
        .spyOn(service as any, 'getDryRunRewards')
        .mockResolvedValue([linkedReward]);
      prisma.guestGameEntitlement.findMany.mockResolvedValue([
        {
          ruleId: 'loot-box-1',
          status: 'CONSUMED',
          rewardId: linkedReward.id,
          profileId: 'profile-1',
          guestId: 'guest-1',
          qualifiedAt: new Date(linkedReward.qualifiedAt),
          evidence: null,
        },
      ]);

      const result = await service.dryRun(user, {
        eventType: 'SESSION_START',
        occurredAt: isoNow,
        sessionType: 'regular_session',
      });

      expect(result.rules[0]).toMatchObject({
        id: 'loot-box-1',
        eligible: false,
        blockers: expect.arrayContaining([expect.stringContaining('1/1')]),
      });
      expect(result.rules[0].blockers.join(' ')).not.toContain('2/1');
    });

    it('counts an outstanding entitlement toward the per-guest weekly limit', async () => {
      const { service, prisma } = createService();

      jest
        .spyOn(service as any, 'resolveDryRunProfile')
        .mockResolvedValue(profileFixture());
      jest.spyOn(service, 'getLootBoxes').mockResolvedValue([
        activeLootBox({
          limits: { perGuestPerWeek: 1 },
        }),
      ]);
      jest.spyOn(service, 'getMissions').mockResolvedValue([]);
      jest.spyOn(service, 'getSeasons').mockResolvedValue([]);
      jest.spyOn(service as any, 'getDryRunRewards').mockResolvedValue([]);
      prisma.guestGameEntitlement.findMany.mockResolvedValue([
        {
          ruleId: 'loot-box-1',
          status: 'AVAILABLE',
          rewardId: null,
          profileId: 'profile-1',
          guestId: 'guest-1',
          qualifiedAt: new Date('2026-06-09T10:00:00.000Z'),
          evidence: null,
        },
      ]);

      const result = await service.dryRun(user, {
        eventType: 'SESSION_START',
        occurredAt: isoNow,
        sessionType: 'regular_session',
      });

      expect(result.rules[0]).toMatchObject({
        id: 'loot-box-1',
        eligible: false,
        blockers: expect.arrayContaining([expect.stringContaining('1/1')]),
      });
    });

    it('does not reapply daily issuance limits while manually opening an existing entitlement', async () => {
      const { service, prisma } = createService();

      jest
        .spyOn(service as any, 'resolveDryRunProfile')
        .mockResolvedValue(profileFixture());
      jest.spyOn(service, 'getLootBoxes').mockResolvedValue([
        activeLootBox({
          limits: { periodicLimit: 'DAILY' },
        }),
      ]);
      jest.spyOn(service, 'getMissions').mockResolvedValue([]);
      jest.spyOn(service, 'getSeasons').mockResolvedValue([]);
      jest.spyOn(service as any, 'getDryRunRewards').mockResolvedValue([]);
      prisma.guestGameEntitlement.findMany.mockResolvedValue([
        {
          ruleId: 'loot-box-1',
          status: 'AVAILABLE',
          rewardId: null,
          profileId: 'profile-1',
          guestId: 'guest-1',
          qualifiedAt: new Date('2026-06-10T08:00:00.000Z'),
          evidence: null,
        },
      ]);

      const result = await service.dryRun(user, {
        eventType: 'SESSION_START',
        occurredAt: isoNow,
        sourceFactKind: 'GUEST_LOOT_BOX_OPEN',
        sourceFactId: 'loot-box:loot-box-1:daily:profile-1:2026-06-10',
        sessionType: 'regular_session',
      });

      expect(result.rules[0]).toMatchObject({
        id: 'loot-box-1',
        eligible: true,
        blockers: [],
        reasons: expect.arrayContaining([
          expect.stringContaining('не применяются повторно'),
        ]),
      });
    });

    it('counts entitlements toward the global daily lootbox limit', async () => {
      const { service, prisma } = createService();

      jest
        .spyOn(service as any, 'resolveDryRunProfile')
        .mockResolvedValue(profileFixture());
      jest.spyOn(service, 'getLootBoxes').mockResolvedValue([
        activeLootBox({
          limits: { totalPerDay: 2 },
        }),
      ]);
      jest.spyOn(service, 'getMissions').mockResolvedValue([]);
      jest.spyOn(service, 'getSeasons').mockResolvedValue([]);
      jest.spyOn(service as any, 'getDryRunRewards').mockResolvedValue([]);
      prisma.guestGameEntitlement.findMany.mockResolvedValue([
        {
          ruleId: 'loot-box-1',
          status: 'AVAILABLE',
          rewardId: null,
          profileId: 'profile-1',
          guestId: 'guest-1',
          qualifiedAt: new Date('2026-06-10T08:00:00.000Z'),
          evidence: null,
        },
        {
          ruleId: 'loot-box-1',
          status: 'CONSUMED',
          rewardId: null,
          profileId: 'profile-2',
          guestId: 'guest-2',
          qualifiedAt: new Date('2026-06-10T09:00:00.000Z'),
          evidence: null,
        },
      ]);

      const result = await service.dryRun(user, {
        eventType: 'SESSION_START',
        occurredAt: isoNow,
        sessionType: 'regular_session',
      });

      expect(result.rules[0]).toMatchObject({
        id: 'loot-box-1',
        eligible: false,
        blockers: expect.arrayContaining([expect.stringContaining('2/2')]),
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

    function mockDomainScopedDryRunRules(
      service: GuestGamificationService,
      mission: GuestGameMission,
      season: ReturnType<typeof seasonRow>,
    ) {
      jest
        .spyOn(service as any, 'resolveDryRunProfile')
        .mockResolvedValue(profileFixture());
      jest.spyOn(service, 'getLootBoxes').mockResolvedValue([]);
      jest.spyOn(service, 'getMissions').mockResolvedValue([mission]);
      jest.spyOn(service, 'getSeasons').mockResolvedValue([season as never]);
      jest.spyOn(service as any, 'getDryRunRewards').mockResolvedValue([]);
      jest
        .spyOn(service as any, 'getDryRunProgressEvents')
        .mockResolvedValue([]);
    }

    function mockSingleSeasonDryRun(
      service: GuestGamificationService,
      season: ReturnType<typeof seasonRow>,
      progressEvents: Array<Record<string, unknown>> = [],
    ) {
      jest
        .spyOn(service as any, 'resolveDryRunProfile')
        .mockResolvedValue(profileFixture());
      jest.spyOn(service, 'getLootBoxes').mockResolvedValue([]);
      jest.spyOn(service, 'getMissions').mockResolvedValue([]);
      jest.spyOn(service, 'getSeasons').mockResolvedValue([season as never]);
      jest.spyOn(service as any, 'getDryRunRewards').mockResolvedValue([]);
      jest
        .spyOn(service as any, 'getDryRunProgressEvents')
        .mockResolvedValue(progressEvents);
    }

    function domainScopedV2Rules() {
      const metric = {
        aggregation: 'duration',
        eventTypes: ['PLAY_HOUR'],
        target: 60,
        unit: 'минут',
      };
      return {
        mission: activeMission({
          storeIds: ['store-1'],
          triggerKind: 'PLAY_HOUR',
          definitionVersion: 2,
          progressTarget: 60,
          progressUnit: 'минут',
          conditions: {
            schemaVersion: 2,
            taskType: 'PLAY_TIME',
            metric,
          },
        }),
        season: seasonRow({
          createdAt: new Date('2026-06-01T00:00:00.000Z'),
          periodFrom: new Date('2026-06-01T00:00:00.000Z'),
          storeIds: ['store-1'],
          levels: [
            {
              level: 1,
              title: 'Сыграть час',
              freeReward: '100 бонусов',
              activationRules: {
                schemaVersion: 2,
                taskType: 'PLAY_TIME',
                triggerKind: 'PLAY_HOUR',
                evaluationPolicy: 'LIVE_WITH_LEDGER_FALLBACK',
                sessionType: 'ANY',
                metric,
              },
            },
          ],
        }),
      };
    }

    function domainRoutingOptions(timeZone: string | null) {
      return {
        ruleExternalDomains: new Map<string, readonly string[]>([
          ['mission-1', ['shared-domain']],
          ['season-1', ['shared-domain']],
        ]),
        ruleDomainTimeZones: new Map([
          ['mission-1', new Map([['shared-domain', timeZone]])],
          ['season-1', new Map([['shared-domain', timeZone]])],
        ]),
      };
    }

    it('evaluates domain-routed mission and Battle Pass rules in the same domain', async () => {
      const { service } = createService();
      const { mission, season } = domainScopedV2Rules();
      mockDomainScopedDryRunRules(service, mission, season);

      const result = await service.dryRun(
        user,
        {
          eventType: 'PLAY_HOUR',
          occurredAt: isoNow,
          externalDomain: 'shared-domain',
          sessionMinutes: 60,
        },
        domainRoutingOptions('Asia/Yekaterinburg'),
      );

      expect(result.rules).toEqual([
        expect.objectContaining({ kind: 'MISSION', eligible: true }),
        expect.objectContaining({ kind: 'SEASON', eligible: true }),
      ]);
    });

    it('blocks domain-routed mission and Battle Pass rules across domains', async () => {
      const { service } = createService();
      const { mission, season } = domainScopedV2Rules();
      mockDomainScopedDryRunRules(service, mission, season);

      const result = await service.dryRun(
        user,
        {
          eventType: 'PLAY_HOUR',
          occurredAt: isoNow,
          externalDomain: 'other-domain',
          sessionMinutes: 60,
        },
        domainRoutingOptions('Asia/Yekaterinburg'),
      );

      expect(result.rules).toEqual([
        expect.objectContaining({
          kind: 'MISSION',
          eligible: false,
          progress: null,
          blockers: expect.arrayContaining([
            'Домен факта Langame не входит в область выбранных клубов правила',
          ]),
        }),
        expect.objectContaining({
          kind: 'SEASON',
          eligible: false,
          progress: null,
          blockers: expect.arrayContaining([
            'Домен факта Langame не входит в область выбранных клубов правила',
          ]),
        }),
      ]);
    });

    it('keeps the exact store authoritative for mission and Battle Pass rules', async () => {
      const { service } = createService();
      const { mission, season } = domainScopedV2Rules();
      mockDomainScopedDryRunRules(service, mission, season);
      jest.spyOn(service as any, 'assertStore').mockResolvedValue({
        id: 'store-2',
        name: 'Other club',
        externalDomain: 'shared-domain',
        timeZone: 'Asia/Yekaterinburg',
      });

      const result = await service.dryRun(
        user,
        {
          eventType: 'PLAY_HOUR',
          storeId: 'store-2',
          occurredAt: isoNow,
          externalDomain: 'shared-domain',
          sessionMinutes: 60,
        },
        domainRoutingOptions('Asia/Yekaterinburg'),
      );

      expect(result.rules).toEqual([
        expect.objectContaining({ kind: 'MISSION', eligible: false }),
        expect.objectContaining({ kind: 'SEASON', eligible: false }),
      ]);
      result.rules.forEach((rule) =>
        expect(rule.blockers).toContain(
          'Выбранный клуб не входит в область правила',
        ),
      );
    });

    it('blocks legacy mission and Battle Pass rules before legacy activation branching', async () => {
      const { service } = createService();
      const mission = activeMission({ storeIds: ['store-1'] });
      const season = seasonRow({
        storeIds: ['store-1'],
        levels: [
          {
            level: 1,
            title: 'Legacy step',
            freeReward: '100 бонусов',
            activationRules: {
              triggerKind: 'SESSION_START',
              sessionType: 'regular_session',
            },
          },
        ],
      });
      mockDomainScopedDryRunRules(service, mission, season);

      const result = await service.dryRun(
        user,
        {
          eventType: 'SESSION_START',
          occurredAt: isoNow,
          externalDomain: 'other-domain',
          sessionType: 'regular_session',
        },
        domainRoutingOptions('Asia/Yekaterinburg'),
      );

      expect(result.rules).toEqual([
        expect.objectContaining({ kind: 'MISSION', eligible: false }),
        expect.objectContaining({ kind: 'SEASON', eligible: false }),
      ]);
      result.rules.forEach((rule) =>
        expect(rule.blockers).toContain(
          'Домен факта Langame не входит в область выбранных клубов правила',
        ),
      );
    });

    it('fails closed when selected clubs have ambiguous domain timezones', async () => {
      const { service } = createService();
      const { mission, season } = domainScopedV2Rules();
      mockDomainScopedDryRunRules(service, mission, season);

      const result = await service.dryRun(
        user,
        {
          eventType: 'PLAY_HOUR',
          occurredAt: isoNow,
          externalDomain: 'shared-domain',
          sessionMinutes: 60,
        },
        domainRoutingOptions(null),
      );

      expect(result.rules).toEqual([
        expect.objectContaining({
          kind: 'MISSION',
          eligible: false,
          progress: null,
        }),
        expect.objectContaining({
          kind: 'SEASON',
          eligible: false,
          progress: null,
        }),
      ]);
      result.rules.forEach((rule) =>
        expect(rule.blockers).toContain(
          'Часовой пояс для доменного факта не определён однозначно по выбранным клубам правила',
        ),
      );
    });

    it('evaluates a parameterless Battle Pass app-open step with the v2 contract', async () => {
      const { service } = createService();

      jest
        .spyOn(service as any, 'resolveDryRunProfile')
        .mockResolvedValue(profileFixture());
      jest.spyOn(service, 'getLootBoxes').mockResolvedValue([]);
      jest.spyOn(service, 'getMissions').mockResolvedValue([]);
      jest.spyOn(service, 'getSeasons').mockResolvedValue([
        seasonRow({
          createdAt: new Date('2026-06-01T00:00:00.000Z'),
          periodFrom: new Date('2026-06-01T00:00:00.000Z'),
          storeIds: [],
          levels: [
            {
              level: 1,
              title: 'Открыть игровой модуль',
              freeReward: '100 бонусов',
              activationRules: {
                schemaVersion: 2,
                taskType: 'APP_OPEN',
                triggerKind: 'APP_OPEN',
                evaluationPolicy: 'LIVE_PRIMARY',
                sessionType: 'ANY',
                metric: {
                  aggregation: 'exists',
                  eventTypes: ['APP_OPEN'],
                  target: 1,
                  unit: 'открытие',
                },
              },
            },
          ],
        }),
      ]);
      jest.spyOn(service as any, 'getDryRunRewards').mockResolvedValue([]);
      jest
        .spyOn(service as any, 'getDryRunProgressEvents')
        .mockResolvedValue([]);

      const result = await service.dryRun(user, {
        eventType: 'APP_OPEN',
        occurredAt: isoNow,
      });

      expect(result.rules[0]).toMatchObject({
        kind: 'SEASON',
        eligible: true,
        battlePassStep: 1,
        progress: {
          applicable: true,
          current: 1,
          target: 1,
          completed: true,
        },
      });
    });

    it('evaluates a parameterless app-open mission created by the wizard', async () => {
      const { service } = createService();

      jest
        .spyOn(service as any, 'resolveDryRunProfile')
        .mockResolvedValue(profileFixture());
      jest.spyOn(service, 'getLootBoxes').mockResolvedValue([]);
      jest.spyOn(service, 'getMissions').mockResolvedValue([
        activeMission({
          name: 'Вход в игровой модуль',
          missionType: 'APP_OPEN',
          triggerKind: 'APP_OPEN',
          progressTarget: 1,
          progressUnit: 'вход',
          definitionVersion: 2,
          conditions: {
            schemaVersion: 2,
            source: 'mission_wizard',
            taskType: 'APP_OPEN',
            visibility: 'VISIBLE',
            sessionType: 'ANY',
            metric: {
              aggregation: 'exists',
              eventTypes: ['APP_OPEN'],
              target: 1,
              unit: 'открытие',
            },
          },
        }),
      ]);
      jest.spyOn(service, 'getSeasons').mockResolvedValue([]);
      jest.spyOn(service as any, 'getDryRunRewards').mockResolvedValue([]);
      jest
        .spyOn(service as any, 'getDryRunProgressEvents')
        .mockResolvedValue([]);

      const result = await service.dryRun(user, {
        eventType: 'APP_OPEN',
        occurredAt: isoNow,
      });

      expect(result.rules[0]).toMatchObject({
        id: 'mission-1',
        kind: 'MISSION',
        eligible: true,
        progress: {
          applicable: true,
          current: 1,
          target: 1,
          completed: true,
        },
      });
    });

    it('evaluates a Battle Pass play-time step with the mission wizard v2 contract', async () => {
      const { service } = createService();

      jest
        .spyOn(service as any, 'resolveDryRunProfile')
        .mockResolvedValue(profileFixture());
      jest.spyOn(service, 'getLootBoxes').mockResolvedValue([]);
      jest.spyOn(service, 'getMissions').mockResolvedValue([]);
      jest.spyOn(service, 'getSeasons').mockResolvedValue([
        seasonRow({
          createdAt: new Date('2026-06-01T00:00:00.000Z'),
          periodFrom: new Date('2026-06-01T00:00:00.000Z'),
          premiumEnabled: true,
          manualApprovalRequired: false,
          storeIds: [],
          levels: [
            {
              level: 1,
              title: 'Сыграть час',
              freeReward: '100 бонусов',
              freeRewardDetails: {
                type: 'BONUS_BALANCE',
                amount: 100,
                label: '100 бонусов',
                delivery: 'AUTO',
              },
              activationRules: {
                schemaVersion: 2,
                taskType: 'PLAY_TIME',
                triggerKind: 'PLAY_HOUR',
                evaluationPolicy: 'LIVE_PRIMARY',
                sessionType: 'ANY',
                metric: {
                  aggregation: 'duration',
                  eventTypes: ['PLAY_HOUR', 'SESSION_STOP'],
                  target: 60,
                  unit: 'минута',
                },
              },
            },
          ],
        }),
      ]);
      jest.spyOn(service as any, 'getDryRunRewards').mockResolvedValue([]);
      jest.spyOn(service as any, 'getDryRunProgressEvents').mockResolvedValue([
        {
          eventType: 'SESSION_STOP',
          occurredAt: new Date('2026-06-09T10:00:00.000Z'),
          storeId: null,
          sessionMinutes: 40,
        },
      ]);

      const result = await service.dryRun(user, {
        eventType: 'PLAY_HOUR',
        occurredAt: isoNow,
        sessionMinutes: 20,
      });

      expect(result.rules[0]).toMatchObject({
        kind: 'SEASON',
        eligible: true,
        rewardType: 'BONUS_BALANCE',
        rewardAmount: 100,
        rewardLabel: '100 бонусов',
        selectedRewardLabel: '100 бонусов',
        manualApprovalRequired: false,
        battlePassStep: 1,
        progress: {
          applicable: true,
          current: 60,
          target: 60,
          completed: true,
        },
      });
      expect(result.summary.estimatedRewardAmount).toBe(100);
    });

    it('blocks a Battle Pass bonus reward with a non-positive amount', async () => {
      const { service } = createService();
      mockSingleSeasonDryRun(
        service,
        seasonRow({
          manualApprovalRequired: false,
          storeIds: [],
          levels: [
            {
              level: 1,
              title: 'Сыграть час',
              freeReward: 'Некорректная бонусная награда',
              freeRewardDetails: {
                type: 'BONUS_BALANCE',
                amount: 0,
                delivery: 'AUTO',
              },
              activationRules: {
                schemaVersion: 2,
                taskType: 'PLAY_TIME',
                triggerKind: 'PLAY_HOUR',
                evaluationPolicy: 'LIVE_WITH_LEDGER_FALLBACK',
                sessionType: 'ANY',
                metric: {
                  aggregation: 'duration',
                  eventTypes: ['PLAY_HOUR'],
                  target: 60,
                  unit: 'минут',
                },
              },
            },
          ],
        }),
      );

      const result = await service.dryRun(user, {
        eventType: 'PLAY_HOUR',
        occurredAt: isoNow,
        sessionMinutes: 60,
      });

      expect(result.rules[0]).toMatchObject({
        kind: 'SEASON',
        eligible: false,
        rewardType: null,
        rewardAmount: 0,
        selectedRewardLabel: null,
        blockers: expect.arrayContaining([
          expect.stringContaining('сумму больше нуля'),
        ]),
      });
      expect(result.summary).toMatchObject({
        eligibleRules: 0,
        estimatedRewardAmount: 0,
      });
    });

    it.each([
      ['REWARD_TEMPLATE', 'AUTO', false],
      ['BOTH', 'AUTO', false],
      ['REWARD_TEMPLATE', 'ADMIN', true],
    ] as const)(
      'qualifies a FREE Battle Pass lootbox backed by an active %s template with %s delivery',
      async (usageKind, delivery, manualApprovalRequired) => {
        const { service } = createService();
        const rewardLootBox = activeLootBox({
          id: 'battle-pass-lootbox',
          name: 'Сезонный контейнер',
          usageKind,
        });
        jest
          .spyOn(service as any, 'resolveDryRunProfile')
          .mockResolvedValue(profileFixture());
        jest.spyOn(service, 'getLootBoxes').mockResolvedValue([rewardLootBox]);
        jest.spyOn(service, 'getMissions').mockResolvedValue([]);
        jest.spyOn(service, 'getSeasons').mockResolvedValue([
          seasonRow({
            manualApprovalRequired: false,
            storeIds: [],
            levels: [
              {
                level: 1,
                title: 'Открыть сезонный контейнер',
                freeReward: 'Сезонный контейнер',
                freeRewardDetails: {
                  type: 'LOOT_BOX',
                  label: 'Сезонный контейнер',
                  delivery,
                  lootBox: {
                    id: rewardLootBox.id,
                    name: rewardLootBox.name,
                  },
                },
                activationRules: {
                  schemaVersion: 2,
                  taskType: 'APP_OPEN',
                  triggerKind: 'APP_OPEN',
                  evaluationPolicy: 'LIVE_PRIMARY',
                  metric: {
                    aggregation: 'exists',
                    eventTypes: ['APP_OPEN'],
                    target: 1,
                  },
                },
              },
            ],
          }) as never,
        ]);
        jest.spyOn(service as any, 'getDryRunRewards').mockResolvedValue([]);
        jest
          .spyOn(service as any, 'getDryRunProgressEvents')
          .mockResolvedValue([]);

        const result = await service.dryRun(user, {
          eventType: 'APP_OPEN',
          occurredAt: isoNow,
        });
        const seasonRule = result.rules.find((rule) => rule.kind === 'SEASON');

        expect(seasonRule).toMatchObject({
          eligible: true,
          rewardType: 'LOOT_BOX_ENTITLEMENT',
          rewardAmount: 0,
          rewardLabel: 'Сезонный контейнер',
          selectedRewardLabel: 'Сезонный контейнер',
          battlePassRewardTrack: 'FREE',
          rewardLootBoxId: 'battle-pass-lootbox',
          manualApprovalRequired,
        });
      },
    );

    it('fails closed for a PREMIUM-only Battle Pass lootbox without profile premium eligibility', async () => {
      const { service } = createService();
      const rewardLootBox = activeLootBox({
        id: 'premium-lootbox',
        usageKind: 'REWARD_TEMPLATE',
      });
      jest
        .spyOn(service as any, 'resolveDryRunProfile')
        .mockResolvedValue(profileFixture());
      jest.spyOn(service, 'getLootBoxes').mockResolvedValue([rewardLootBox]);
      jest.spyOn(service, 'getMissions').mockResolvedValue([]);
      jest.spyOn(service, 'getSeasons').mockResolvedValue([
        seasonRow({
          premiumEnabled: true,
          manualApprovalRequired: false,
          storeIds: [],
          levels: [
            {
              level: 1,
              title: 'Premium контейнер',
              premiumReward: 'Premium контейнер',
              premiumRewardDetails: {
                type: 'LOOT_BOX',
                label: 'Premium контейнер',
                delivery: 'AUTO',
                lootBox: { id: rewardLootBox.id },
              },
              activationRules: {
                schemaVersion: 2,
                taskType: 'APP_OPEN',
                triggerKind: 'APP_OPEN',
                evaluationPolicy: 'LIVE_PRIMARY',
                metric: {
                  aggregation: 'exists',
                  eventTypes: ['APP_OPEN'],
                  target: 1,
                },
              },
            },
          ],
        }) as never,
      ]);
      jest.spyOn(service as any, 'getDryRunRewards').mockResolvedValue([]);
      jest
        .spyOn(service as any, 'getDryRunProgressEvents')
        .mockResolvedValue([]);

      const result = await service.dryRun(user, {
        eventType: 'APP_OPEN',
        occurredAt: isoNow,
      });
      const seasonRule = result.rules.find((rule) => rule.kind === 'SEASON');

      expect(seasonRule).toMatchObject({
        eligible: false,
        rewardType: null,
        selectedRewardLabel: null,
        battlePassRewardTrack: null,
        rewardLootBoxId: null,
        blockers: expect.arrayContaining([
          expect.stringContaining('источник premium-статуса'),
        ]),
      });
    });

    it('awards only the FREE Battle Pass lootbox when a premium reward is also configured', async () => {
      const { service } = createService();
      const freeLootBox = activeLootBox({
        id: 'free-lootbox',
        name: 'Бесплатный контейнер',
        usageKind: 'REWARD_TEMPLATE',
      });
      jest
        .spyOn(service as any, 'resolveDryRunProfile')
        .mockResolvedValue(profileFixture());
      jest.spyOn(service, 'getLootBoxes').mockResolvedValue([freeLootBox]);
      jest.spyOn(service, 'getMissions').mockResolvedValue([]);
      jest.spyOn(service, 'getSeasons').mockResolvedValue([
        seasonRow({
          premiumEnabled: true,
          manualApprovalRequired: false,
          storeIds: [],
          levels: [
            {
              level: 1,
              title: 'Два контейнера',
              freeReward: 'Бесплатный контейнер',
              premiumReward: 'Premium контейнер',
              freeRewardDetails: {
                type: 'LOOT_BOX',
                label: 'Бесплатный контейнер',
                delivery: 'AUTO',
                lootBox: { id: freeLootBox.id },
              },
              premiumRewardDetails: {
                type: 'LOOT_BOX',
                label: 'Premium контейнер',
                delivery: 'AUTO',
                lootBox: { id: 'premium-lootbox' },
              },
              activationRules: {
                schemaVersion: 2,
                taskType: 'APP_OPEN',
                triggerKind: 'APP_OPEN',
                evaluationPolicy: 'LIVE_PRIMARY',
                metric: {
                  aggregation: 'exists',
                  eventTypes: ['APP_OPEN'],
                  target: 1,
                },
              },
            },
          ],
        }) as never,
      ]);
      jest.spyOn(service as any, 'getDryRunRewards').mockResolvedValue([]);
      jest
        .spyOn(service as any, 'getDryRunProgressEvents')
        .mockResolvedValue([]);

      const result = await service.dryRun(user, {
        eventType: 'APP_OPEN',
        occurredAt: isoNow,
      });
      const seasonRule = result.rules.find((rule) => rule.kind === 'SEASON');

      expect(seasonRule).toMatchObject({
        eligible: true,
        rewardType: 'LOOT_BOX_ENTITLEMENT',
        battlePassRewardTrack: 'FREE',
        rewardLootBoxId: 'free-lootbox',
        reasons: expect.arrayContaining([
          expect.stringContaining('Premium-награда'),
          expect.stringContaining('не оценивалась'),
        ]),
      });
    });

    it('blocks a Battle Pass reward that points to a STANDALONE lootbox', async () => {
      const { service } = createService();
      const standaloneLootBox = activeLootBox({
        id: 'standalone-lootbox',
        usageKind: 'STANDALONE',
      });
      jest
        .spyOn(service as any, 'resolveDryRunProfile')
        .mockResolvedValue(profileFixture());
      jest
        .spyOn(service, 'getLootBoxes')
        .mockResolvedValue([standaloneLootBox]);
      jest.spyOn(service, 'getMissions').mockResolvedValue([]);
      jest.spyOn(service, 'getSeasons').mockResolvedValue([
        seasonRow({
          manualApprovalRequired: false,
          storeIds: [],
          levels: [
            {
              level: 1,
              title: 'Недопустимый контейнер',
              freeReward: 'Недопустимый контейнер',
              freeRewardDetails: {
                type: 'LOOT_BOX',
                delivery: 'AUTO',
                lootBox: { id: standaloneLootBox.id },
              },
              activationRules: {
                schemaVersion: 2,
                taskType: 'APP_OPEN',
                triggerKind: 'APP_OPEN',
                evaluationPolicy: 'LIVE_PRIMARY',
                metric: {
                  aggregation: 'exists',
                  eventTypes: ['APP_OPEN'],
                  target: 1,
                },
              },
            },
          ],
        }) as never,
      ]);
      jest.spyOn(service as any, 'getDryRunRewards').mockResolvedValue([]);
      jest
        .spyOn(service as any, 'getDryRunProgressEvents')
        .mockResolvedValue([]);

      const result = await service.dryRun(user, {
        eventType: 'APP_OPEN',
        occurredAt: isoNow,
      });
      const seasonRule = result.rules.find((rule) => rule.kind === 'SEASON');

      expect(seasonRule).toMatchObject({
        eligible: false,
        rewardType: null,
        selectedRewardLabel: null,
        blockers: expect.arrayContaining([
          expect.stringContaining('STANDALONE'),
        ]),
      });
    });

    it('uses the step delivery and real amount for Battle Pass budget checks', async () => {
      const { service } = createService();
      mockSingleSeasonDryRun(
        service,
        seasonRow({
          budgetAmount: 50,
          manualApprovalRequired: false,
          storeIds: [],
          levels: [
            {
              level: 1,
              title: 'Сыграть час',
              freeReward: '100 бонусов',
              freeRewardDetails: {
                type: 'BONUS_BALANCE',
                amount: 100,
                label: '100 бонусов',
                delivery: 'ADMIN',
              },
              activationRules: {
                schemaVersion: 2,
                taskType: 'PLAY_TIME',
                triggerKind: 'PLAY_HOUR',
                evaluationPolicy: 'LIVE_WITH_LEDGER_FALLBACK',
                sessionType: 'ANY',
                metric: {
                  aggregation: 'duration',
                  eventTypes: ['PLAY_HOUR'],
                  target: 60,
                  unit: 'минут',
                },
              },
            },
          ],
        }),
      );

      const result = await service.dryRun(user, {
        eventType: 'PLAY_HOUR',
        occurredAt: isoNow,
        sessionMinutes: 60,
      });

      expect(result.rules[0]).toMatchObject({
        kind: 'SEASON',
        eligible: false,
        manualApprovalRequired: true,
        rewardType: 'BONUS_BALANCE',
        rewardAmount: 100,
        selectedRewardLabel: null,
      });
      expect(result.rules[0]?.blockers).toEqual(
        expect.arrayContaining([expect.stringContaining('бюджет')]),
      );
    });

    it('evaluates all selected Battle Pass products across separate purchases', async () => {
      const { service } = createService();

      jest
        .spyOn(service as any, 'resolveDryRunProfile')
        .mockResolvedValue(profileFixture());
      jest.spyOn(service, 'getLootBoxes').mockResolvedValue([]);
      jest.spyOn(service, 'getMissions').mockResolvedValue([]);
      jest.spyOn(service, 'getSeasons').mockResolvedValue([
        seasonRow({
          createdAt: new Date('2026-06-01T00:00:00.000Z'),
          periodFrom: new Date('2026-06-01T00:00:00.000Z'),
          storeIds: [],
          levels: [
            {
              level: 1,
              title: 'Купить набор',
              freeReward: '100 бонусов',
              activationRules: {
                schemaVersion: 2,
                taskType: 'PRODUCT_PURCHASE',
                triggerKind: 'PRODUCT_PURCHASE',
                evaluationPolicy: 'LIVE_PRIMARY',
                purchaseSource: 'PRODUCT',
                metric: {
                  aggregation: 'count',
                  eventTypes: ['PRODUCT_PURCHASE', 'BAR_PURCHASE'],
                  productMatch: 'ALL',
                  productIds: ['product-1', 'product-2'],
                  amountMode: 'NONE',
                  target: 2,
                },
              },
            },
          ],
        }),
      ]);
      jest.spyOn(service as any, 'getDryRunRewards').mockResolvedValue([]);
      jest.spyOn(service as any, 'getDryRunProgressEvents').mockResolvedValue([
        {
          eventType: 'PRODUCT_PURCHASE',
          occurredAt: new Date('2026-06-09T10:00:00.000Z'),
          storeId: null,
          productId: 'product-1',
        },
      ]);

      const result = await service.dryRun(user, {
        eventType: 'PRODUCT_PURCHASE',
        occurredAt: isoNow,
        productId: 'product-2',
      });

      expect(result.rules[0]).toMatchObject({
        kind: 'SEASON',
        eligible: true,
        progress: {
          current: 2,
          target: 2,
          completed: true,
        },
      });
    });

    it('evaluates a domain-scoped Battle Pass balance total through the supplemental contract', async () => {
      const { service } = createService();

      jest
        .spyOn(service as any, 'resolveDryRunProfile')
        .mockResolvedValue(profileFixture());
      jest.spyOn(service, 'getLootBoxes').mockResolvedValue([]);
      jest.spyOn(service, 'getMissions').mockResolvedValue([]);
      jest.spyOn(service, 'getSeasons').mockResolvedValue([
        seasonRow({
          createdAt: new Date('2026-06-01T00:00:00.000Z'),
          periodFrom: new Date('2026-06-01T00:00:00.000Z'),
          storeIds: [],
          levels: [
            {
              level: 1,
              title: 'Пополнить баланс',
              freeReward: '100 бонусов',
              activationRules: {
                schemaVersion: 2,
                taskType: 'BALANCE_TOPUP',
                triggerKind: 'BALANCE_TOPUP',
                evaluationPolicy: 'LEDGER_SUPPLEMENTAL',
                domainScoped: true,
                externalDomains: ['club-1'],
                metric: {
                  aggregation: 'sum',
                  eventTypes: ['BALANCE_TOPUP'],
                  topupMode: 'PERIOD_TOTAL',
                  amountComparison: 'AT_LEAST',
                  target: 1000,
                },
              },
            },
          ],
        }),
      ]);
      jest.spyOn(service as any, 'getDryRunRewards').mockResolvedValue([]);
      jest.spyOn(service as any, 'getDryRunProgressEvents').mockResolvedValue([
        {
          eventType: 'BALANCE_TOPUP',
          occurredAt: new Date('2026-06-09T10:00:00.000Z'),
          storeId: null,
          externalDomain: 'club-1',
          spendAmount: 600,
        },
      ]);

      const result = await service.dryRun(user, {
        eventType: 'BALANCE_TOPUP',
        occurredAt: isoNow,
        externalDomain: 'club-1',
        spendAmount: 400,
      });

      expect(result.rules[0]).toMatchObject({
        kind: 'SEASON',
        eligible: true,
        progress: {
          current: 1000,
          target: 1000,
          completed: true,
        },
        reasons: expect.arrayContaining([
          'Пополнение проверяется в пределах домена Langame',
        ]),
      });
    });

    it('evaluates a Battle Pass check-in streak with the mission wizard v2 contract', async () => {
      const { service } = createService();

      jest
        .spyOn(service as any, 'resolveDryRunProfile')
        .mockResolvedValue(profileFixture());
      jest.spyOn(service, 'getLootBoxes').mockResolvedValue([]);
      jest.spyOn(service, 'getMissions').mockResolvedValue([]);
      jest.spyOn(service, 'getSeasons').mockResolvedValue([
        seasonRow({
          createdAt: new Date('2026-06-01T00:00:00.000Z'),
          periodFrom: new Date('2026-06-01T00:00:00.000Z'),
          storeIds: [],
          levels: [
            {
              level: 1,
              title: 'Три дня подряд',
              freeReward: '100 бонусов',
              activationRules: {
                schemaVersion: 2,
                taskType: 'CHECK_IN',
                triggerKind: 'CHECK_IN',
                evaluationPolicy: 'LIVE_PRIMARY',
                windowDays: 7,
                metric: {
                  aggregation: 'streak',
                  eventTypes: ['CHECK_IN'],
                  checkInMode: 'STREAK',
                  target: 3,
                  windowDays: 7,
                },
              },
            },
          ],
        }),
      ]);
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
        kind: 'SEASON',
        eligible: true,
        progress: {
          current: 3,
          target: 3,
          completed: true,
        },
      });
    });

    it('keeps evaluating legacy Battle Pass activation rules', async () => {
      const { service } = createService();

      jest
        .spyOn(service as any, 'resolveDryRunProfile')
        .mockResolvedValue(profileFixture());
      jest.spyOn(service, 'getLootBoxes').mockResolvedValue([]);
      jest.spyOn(service, 'getMissions').mockResolvedValue([]);
      jest.spyOn(service, 'getSeasons').mockResolvedValue([
        seasonRow({
          storeIds: [],
          levels: [
            {
              level: 1,
              title: 'Старый шаг',
              freeReward: '100 бонусов',
              activationRules: {
                triggerKind: 'SESSION_START',
                sessionType: 'regular_session',
              },
            },
          ],
        }),
      ]);
      jest.spyOn(service as any, 'getDryRunRewards').mockResolvedValue([]);

      const result = await service.dryRun(user, {
        eventType: 'SESSION_START',
        occurredAt: isoNow,
        sessionType: 'regular_session',
      });

      expect(result.rules[0]).toMatchObject({
        kind: 'SEASON',
        eligible: true,
        battlePassStep: 1,
        progress: null,
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
            externalDomain: 'club-1',
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
            externalDomain: 'club-1',
            occurredAt: {
              gte: new Date('2026-06-09T19:00:00.000Z'),
              lt: new Date('2026-06-10T19:00:00.000Z'),
            },
          },
          select: {
            occurredAt: true,
            externalDomain: true,
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

    it('allows a check-in when there is no same-domain check-in today', async () => {
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
        prisma.guestGameEvent.findMany.mockResolvedValue([]);

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

    it('blocks a second check-in in another club on the same Langame domain', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-10T10:00:00.000Z'));

      try {
        const { service, prisma } = createService();
        const processEventSpy = jest.spyOn(service, 'processEvent');

        mockCheckInGuestAndSession(service);
        prisma.guestGameEvent.findMany.mockResolvedValue([
          {
            occurredAt: new Date('2026-06-10T08:00:00.000Z'),
            externalDomain: 'club-1',
            payload: { store: { id: 'store-2' } },
          },
        ]);

        await expect(
          service.checkIn(user, {
            guestId: 'guest-1',
            storeId: 'store-1',
          }),
        ).rejects.toThrow(BadRequestException);

        expect(processEventSpy).not.toHaveBeenCalled();
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
            idempotencyKey:
              'check-in:shared-domain:session-holmogorova:lg-guest-1',
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
            date_start: '2026-06-10 09:45:00',
            date_stop: null,
            packet: 0,
            UUID: 'uuid-holmogorova',
          },
        ]);

        const result = await service.checkIn(user, {
          guestId: 'guest-1',
          storeId: 'store-push',
        });

        expect(result.liveSession.externalSessionId).toBe(
          'session-holmogorova',
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
            sourceFactId: 'session-holmogorova',
            externalDomain: 'shared-domain',
            payload: expect.objectContaining({
              langameSessionResolution: expect.objectContaining({
                externalClubId: 'holm-club',
                selectedStoreId: 'store-push',
                resolvedStoreId: 'store-push',
                storeResolvedBy: 'selected_store_domain_fallback',
              }),
            }),
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
                externalClubId: 'push-club',
                selectedStoreId: 'store-push',
                resolvedStoreId: 'store-push',
                storeResolvedBy: 'langame_session',
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
    it('checks only standalone-capable lootboxes while preserving mission session-start detection', async () => {
      const { service, prisma } = createService();

      prisma.guestGameLootBox.findMany.mockResolvedValue([]);
      prisma.guestGameMission.findMany.mockResolvedValue([
        {
          triggerKind: 'SESSION_START',
          missionType: 'CUSTOM',
          conditions: {},
        },
      ]);
      prisma.guestGameSeason.findMany.mockResolvedValue([]);

      await expect(
        (service as any).hasActiveSessionStartRules(user),
      ).resolves.toBe(true);
      expect(prisma.guestGameLootBox.findMany).toHaveBeenCalledWith({
        where: {
          tenantId: user.tenantId,
          status: 'ACTIVE',
          usageKind: { in: ['STANDALONE', 'BOTH'] },
        },
        select: { triggerKind: true },
      });
      expect(prisma.guestGameMission.findMany).toHaveBeenCalledWith({
        where: { tenantId: user.tenantId, status: 'ACTIVE' },
        select: {
          triggerKind: true,
          missionType: true,
          conditions: true,
        },
      });
      expect(prisma.guestGameSeason.findMany).toHaveBeenCalledWith({
        where: { tenantId: user.tenantId, status: 'ACTIVE' },
        select: { xpRules: true, levels: true },
      });
    });

    it.each([
      {
        triggerKind: 'APP_OPEN',
        missionType: 'CUSTOM',
        conditions: { taskType: 'SESSION_START' },
      },
      {
        triggerKind: 'APP_OPEN',
        missionType: 'SESSION_START',
        conditions: {},
      },
      {
        triggerKind: 'APP_OPEN',
        missionType: 'CUSTOM',
        conditions: { eventTypes: 'SESSION_START' },
      },
      {
        triggerKind: 'APP_OPEN',
        missionType: 'CUSTOM',
        conditions: { metric: { eventType: 'SESSION_START' } },
      },
    ])(
      'detects legacy and v2 mission SESSION_START shapes',
      async (mission) => {
        const { service, prisma } = createService();

        prisma.guestGameLootBox.findMany.mockResolvedValue([]);
        prisma.guestGameMission.findMany.mockResolvedValue([mission]);
        prisma.guestGameSeason.findMany.mockResolvedValue([]);

        await expect(
          (service as any).hasActiveSessionStartRules(user),
        ).resolves.toBe(true);
      },
    );

    it('lets an explicit non-start mission event marker override stale SESSION_START fields', async () => {
      const { service, prisma } = createService();

      prisma.guestGameLootBox.findMany.mockResolvedValue([]);
      prisma.guestGameMission.findMany.mockResolvedValue([
        {
          triggerKind: 'SESSION_START',
          missionType: 'SESSION_START',
          conditions: {
            taskType: 'SESSION_START',
            eventType: 'APP_OPEN',
          },
        },
      ]);
      prisma.guestGameSeason.findMany.mockResolvedValue([]);

      await expect(
        (service as any).hasActiveSessionStartRules(user),
      ).resolves.toBe(false);
    });

    it('detects SESSION_START activation rules in active Battle Pass levels', async () => {
      const { service, prisma } = createService();

      prisma.guestGameLootBox.findMany.mockResolvedValue([]);
      prisma.guestGameMission.findMany.mockResolvedValue([]);
      prisma.guestGameSeason.findMany.mockResolvedValue([
        {
          xpRules: {},
          levels: [
            {
              level: 1,
              activationRules: {
                schemaVersion: 2,
                taskType: 'PLAY_TIME',
                triggerKind: 'SESSION_START',
              },
            },
          ],
        },
      ]);

      await expect(
        (service as any).hasActiveSessionStartRules(user),
      ).resolves.toBe(true);
    });

    it.each([
      {
        eventTypes: ['SESSION_START'],
      },
      {
        eventTypes: 'SESSION_START',
      },
      {
        eventType: 'SESSION_START',
      },
      {
        metric: { eventTypes: ['SESSION_START'] },
      },
      {
        metric: { eventTypes: 'SESSION_START' },
      },
      {
        metric: { eventType: 'SESSION_START' },
      },
      {
        schemaVersion: 2,
        taskType: 'SESSION_START',
      },
    ])(
      'detects scalar and array Battle Pass SESSION_START event markers',
      async (activationRules) => {
        const { service, prisma } = createService();

        prisma.guestGameLootBox.findMany.mockResolvedValue([]);
        prisma.guestGameMission.findMany.mockResolvedValue([]);
        prisma.guestGameSeason.findMany.mockResolvedValue([
          {
            xpRules: {},
            levels: [{ level: 1, activationRules }],
          },
        ]);

        await expect(
          (service as any).hasActiveSessionStartRules(user),
        ).resolves.toBe(true);
      },
    );

    it.each([
      {
        schemaVersion: 2,
        taskType: 'APP_OPEN',
        triggerKind: 'APP_OPEN',
      },
      {
        schemaVersion: 2,
        triggerKind: 'SESSION_START',
        metric: { eventTypes: 'APP_OPEN' },
      },
    ])(
      'does not false-positive an unrelated or non-executable Battle Pass shape',
      async (activationRules) => {
        const { service, prisma } = createService();

        prisma.guestGameLootBox.findMany.mockResolvedValue([]);
        prisma.guestGameMission.findMany.mockResolvedValue([]);
        prisma.guestGameSeason.findMany.mockResolvedValue([
          {
            xpRules: {},
            levels: [{ level: 1, activationRules }],
          },
        ]);

        await expect(
          (service as any).hasActiveSessionStartRules(user),
        ).resolves.toBe(false);
      },
    );

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

    it('keeps an already running live regular session regular when only local guest balance looks packeted', async () => {
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
          sessionType: 'regular_session',
          sessionPacket: false,
          sourceFactId: 'session-1',
        }),
      );
    });

    it('refreshes active package hours from Langame when they changed after the session started', async () => {
      const { service, langameSettingsService, langameClient } =
        createService();

      jest.spyOn(service as any, 'getTenantGuest').mockResolvedValue({
        id: 'guest-1',
        externalDomain: 'club-1',
        externalGuestId: 'lg-guest-1',
        currentCountHours: 600,
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

    it('keeps tariff group 1 basic hourly even when the guest has remaining hours', async () => {
      const { service, langameSettingsService, langameClient } =
        createService();

      jest.spyOn(service as any, 'getTenantGuest').mockResolvedValue({
        id: 'guest-1',
        externalDomain: 'club-1',
        externalGuestId: 'lg-guest-1',
        currentCountHours: 600,
      });
      jest
        .spyOn(service as any, 'hasActiveSessionStartRules')
        .mockResolvedValue(true);
      jest.spyOn(service as any, 'assertStore').mockResolvedValue({
        id: 'store-1',
        name: '1337-Pushkinskaya',
        externalDomain: 'club-1',
        externalClubId: 'club-external-1',
        integrationSourceId: 'source-1',
        timeZone: 'Europe/Samara',
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
      langameClient.listTariffTypeGroups.mockResolvedValue([
        { id: 1, type: 'basic', name: 'Hourly' },
      ]);
      langameClient.listGuestSessions.mockResolvedValue([
        {
          id: 'session-532296',
          guest_id: 'lg-guest-1',
          list_clubs_id: 'club-external-1',
          date_start: '2026-07-13 14:23:00',
          date_stop: null,
          packet: 1,
        },
      ]);
      const processEventSpy = jest
        .spyOn(service, 'processEvent')
        .mockResolvedValue({
          processed: true,
          summary: {
            idempotencyKey:
              'guest-game:GUEST_SESSION:SESSION_START:session-532296',
          },
        } as GuestGameProcessEventResult);

      await service.processLiveSessionStart(user, {
        profileId: 'profile-1',
        guestId: 'guest-1',
        storeId: 'store-1',
      });

      expect(langameClient.searchGuests).not.toHaveBeenCalled();
      expect(langameClient.listTransactions).not.toHaveBeenCalled();
      expect(langameClient.listGuestLogs).not.toHaveBeenCalled();
      expect(processEventSpy).toHaveBeenCalledWith(
        user,
        expect.objectContaining({
          eventType: 'SESSION_START',
          sessionType: 'regular_session',
          sessionPacket: false,
          sourceFactId: 'session-532296',
        }),
      );
    });

    it('uses the explicit Langame packet flag even when the remaining package balance is zero', async () => {
      const { service, langameSettingsService, langameClient } =
        createService();

      jest.spyOn(service as any, 'getTenantGuest').mockResolvedValue({
        id: 'guest-1',
        externalDomain: 'club-1',
        externalGuestId: 'lg-guest-1',
        currentCountHours: 600,
      });
      jest
        .spyOn(service as any, 'hasActiveSessionStartRules')
        .mockResolvedValue(true);
      jest.spyOn(service as any, 'assertStore').mockResolvedValue({
        id: 'store-1',
        name: '1337-Rodonitovaya',
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
          id: 'session-hourly',
          guest_id: 'lg-guest-1',
          list_clubs_id: 'club-external-1',
          date_start: '2026-07-07 14:32:00',
          date_stop: null,
          packet: 1,
        },
      ]);
      langameClient.searchGuests.mockResolvedValue({
        data: [
          {
            guest_id: 'lg-guest-1',
            current_count_hours: '0',
          },
        ],
      });
      langameClient.listTransactions.mockResolvedValue([]);
      langameClient.listGuestLogs.mockResolvedValue([
        {
          guest_id: 'lg-guest-1',
          club_id: 'club-external-1',
          date: '2026-07-06 17:00:49',
          type: 'Покупка абонемент ADMIN 10 ЧАСОВ, 0 ₽ + 500 бонусы',
        },
      ]);
      const processEventSpy = jest
        .spyOn(service, 'processEvent')
        .mockResolvedValue({
          processed: true,
          summary: {
            idempotencyKey:
              'guest-game:GUEST_SESSION:SESSION_START:session-hourly',
          },
        } as GuestGameProcessEventResult);

      await service.processLiveSessionStart(user, {
        profileId: 'profile-1',
        guestId: 'guest-1',
        storeId: 'store-1',
      });

      expect(langameClient.searchGuests).not.toHaveBeenCalled();
      expect(langameClient.listTransactions).not.toHaveBeenCalled();
      expect(langameClient.listGuestLogs).not.toHaveBeenCalled();
      expect(processEventSpy).toHaveBeenCalledWith(
        user,
        expect.objectContaining({
          eventType: 'SESSION_START',
          sessionType: 'packet_hours',
          sessionPacket: true,
          sourceFactId: 'session-hourly',
        }),
      );
    });

    it('refreshes cached open sessions from Langame balance when an existing abonnement is active', async () => {
      const { service, prisma, langameSettingsService, langameClient } =
        createService();

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
      langameClient.listGuestSessions.mockResolvedValue([]);
      prisma.guestSession.findFirst.mockResolvedValue({
        externalDomain: 'club-1',
        externalSessionId: 'session-1',
        externalGuestId: 'lg-guest-1',
        externalClubId: 'club-external-1',
        externalUuid: 'uuid-1',
        startedAt: new Date('2026-07-07T07:10:00.000Z'),
        durationMinutes: 40,
        packet: false,
        store: {
          id: 'store-1',
          name: '1337-Пушкинская',
          timeZone: 'Asia/Yekaterinburg',
        },
      });
      langameClient.searchGuests.mockResolvedValue({
        data: [
          {
            guest_id: 'lg-guest-1',
            current_count_hours: '4.25',
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

    it('treats the live session as packet when Langame transactions show a package-hours activation', async () => {
      const { service, langameSettingsService, langameClient } =
        createService();

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
        name: '1337-РџСѓС€РєРёРЅСЃРєР°СЏ',
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
            current_count_hours: '0',
          },
        ],
      });
      langameClient.listTransactions.mockResolvedValue([
        {
          id: 'tx-1',
          guest_id: 'lg-guest-1',
          session_id: 'session-1',
          list_clubs_id: 'club-external-1',
          date: '2026-06-10 09:50:00',
          type: 'packet',
          comment: null,
          sum: 500,
        },
      ]);
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

      expect(langameClient.listTransactions).toHaveBeenCalledWith(
        'https://langame.example',
        'api-key',
        expect.objectContaining({
          page: 1,
          pageLimit: 200,
        }),
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

    it('treats the live session as packet when Langame transactions show an abonnement activation', async () => {
      const { service, langameSettingsService, langameClient } =
        createService();

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
          date_start: '2026-07-06 12:53:00',
          date_stop: null,
          packet: 0,
        },
      ]);
      langameClient.searchGuests.mockResolvedValue({
        data: [
          {
            guest_id: 'lg-guest-1',
            current_count_hours: '0',
          },
        ],
      });
      langameClient.listTransactions.mockResolvedValue([
        {
          id: 'tx-1',
          guest_id: 'lg-guest-1',
          session_id: 'session-1',
          list_clubs_id: 'club-external-1',
          date: '2026-07-06 17:00:00',
          type: 'bonus',
          comment: 'Покупка абонемент ADMIN 10 ЧАСОВ, 0 руб + 500 бонусы',
          sum: 0,
        },
      ]);
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

    it('treats the live session as packet when Langame guest logs show an active abonnement', async () => {
      const { service, langameSettingsService, langameClient } =
        createService();

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
          date_start: '2026-07-07 11:43:00',
          date_stop: null,
          packet: 0,
        },
      ]);
      langameClient.searchGuests.mockResolvedValue({
        data: [],
      });
      langameClient.listTransactions.mockResolvedValue([
        {
          id: 'tx-1',
          guest_id: 'lg-guest-1',
          club_id: 'club-external-1',
          date: '2026-07-06 17:00:49',
          type: null,
          comment: null,
          sum: 0,
        },
      ]);
      langameClient.listGuestLogs.mockResolvedValue([
        {
          guest_id: 'lg-guest-1',
          club_id: 'club-external-1',
          date: '2026-07-07 11:45:00',
          type: 'Покупка абонемент ADMIN 10 ЧАСОВ, 0 ₽ + 500 бонусы',
        },
      ]);
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

      expect(langameClient.listGuestLogs).toHaveBeenCalledWith(
        'https://langame.example',
        'api-key',
        expect.objectContaining({
          page: 1,
          pageLimit: 200,
          guestId: 'lg-guest-1',
        }),
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

    it('does not classify a new hourly session as packet from an old subscription guest log', async () => {
      const { service, langameSettingsService, langameClient } =
        createService();

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
        name: '1337-Rodonitovaya',
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
          id: 'session-hourly',
          guest_id: 'lg-guest-1',
          list_clubs_id: 'club-external-1',
          date_start: '2026-07-07 14:53:00',
          date_stop: null,
          packet: 0,
        },
      ]);
      langameClient.searchGuests.mockResolvedValue({
        data: [],
      });
      langameClient.listTransactions.mockResolvedValue([]);
      langameClient.listGuestLogs.mockResolvedValue([
        {
          guest_id: 'lg-guest-1',
          club_id: 'club-external-1',
          date: '2026-07-06 17:00:49',
          type: 'success_subscription_buy_log',
        },
      ]);
      const processEventSpy = jest
        .spyOn(service, 'processEvent')
        .mockResolvedValue({
          processed: true,
          summary: {
            idempotencyKey:
              'guest-game:GUEST_SESSION:SESSION_START:session-hourly',
          },
        } as GuestGameProcessEventResult);

      await service.processLiveSessionStart(user, {
        profileId: 'profile-1',
        guestId: 'guest-1',
        storeId: 'store-1',
      });

      expect(langameClient.listGuestLogs).toHaveBeenCalled();
      expect(processEventSpy).toHaveBeenCalledWith(
        user,
        expect.objectContaining({
          eventType: 'SESSION_START',
          sessionType: 'regular_session',
          sessionPacket: false,
          sourceFactId: 'session-hourly',
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
      const processEventSpy = jest
        .spyOn(service, 'processEvent')
        .mockResolvedValue({
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

    it('creates a scoped correction when the same live session becomes packet hours', async () => {
      const { service, prisma } = createService();

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
      const correctionResult = processResult({
        dryRun: dryRunResult({
          input: {
            sessionType: 'packet_hours',
            sessionPacket: true,
            sessionMinutes: 15,
          },
        }),
        event: eventResult({
          externalId:
            'guest-game:GUEST_SESSION:SESSION_START:session-1:classification:package-v1',
          payload: {
            sourceFactId: 'session-1',
            input: {
              sessionType: 'packet_hours',
              sessionPacket: true,
              sessionMinutes: 15,
            },
          },
        }),
      });
      const correctionSpy = jest
        .spyOn(service as any, 'processSessionPackageClassificationCorrection')
        .mockResolvedValue(correctionResult);

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
      expect(prisma.guestGameEvent.update).not.toHaveBeenCalled();
      expect(correctionSpy).toHaveBeenCalledWith(
        user,
        expect.objectContaining({
          sourceFactId: 'session-1',
          externalId: 'session-1',
          sessionType: 'packet_hours',
          sessionPacket: true,
        }),
      );
      expect(refreshed?.event.payload).toMatchObject({
        sourceFactId: 'session-1',
        input: {
          sessionType: 'packet_hours',
          sessionPacket: true,
          sessionMinutes: 15,
        },
      });
    });

    it('scopes a late package marker to newly eligible rules without counting a second session', async () => {
      const { service } = createService();
      const baseRule = dryRunResult().rules[0];
      const packageRules = [
        {
          ...baseRule,
          id: 'mission-any',
          name: 'Any session count',
          eligible: true,
          xpDelta: 10,
        },
        {
          ...baseRule,
          id: 'mission-hourly',
          name: 'Hourly only',
          eligible: false,
          xpDelta: 0,
        },
        {
          ...baseRule,
          id: 'mission-package',
          name: 'Package only',
          eligible: true,
          xpDelta: 20,
        },
        {
          ...baseRule,
          id: 'loot-box-package',
          kind: 'LOOT_BOX' as const,
          name: 'Package case',
          eligible: true,
          xpDelta: 0,
        },
        {
          ...baseRule,
          id: 'season-package',
          kind: 'SEASON' as const,
          name: 'Package battle pass step',
          eligible: true,
          xpDelta: 0,
          battlePassStep: 2,
          battlePassRewardTrack: 'FREE' as const,
        },
      ];
      const regularRules = packageRules.map((rule) => ({
        ...rule,
        eligible: rule.id === 'mission-any' || rule.id === 'mission-hourly',
      }));
      const packageDryRun = dryRunResult({
        input: {
          sessionType: 'packet_hours',
          sessionPacket: true,
        },
        rules: packageRules,
      });
      const regularDryRun = dryRunResult({
        input: {
          sessionType: 'regular_session',
          sessionPacket: false,
        },
        rules: regularRules,
      });
      jest
        .spyOn(service, 'dryRun')
        .mockImplementation((_user, dto) =>
          Promise.resolve(
            dto.sessionPacket === true ? packageDryRun : regularDryRun,
          ),
        );
      const processEventSpy = jest
        .spyOn(service, 'processEvent')
        .mockResolvedValue(processResult({ dryRun: packageDryRun }));

      await (service as any).processSessionPackageClassificationCorrection(
        user,
        {
          profileId: 'profile-1',
          guestId: 'guest-1',
          storeId: 'store-1',
          eventType: 'SESSION_START',
          occurredAt: '2026-06-10T09:45:00.000Z',
          sessionType: 'packet_hours',
          sessionPacket: true,
          sessionMinutes: 15,
          sourceFactKind: 'GUEST_SESSION',
          sourceFactId: 'session:db-session-1:start',
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: 'club-1',
          externalId: 'session-1',
        },
      );

      expect(processEventSpy).toHaveBeenCalledTimes(1);
      const [, correctionDto, options] = processEventSpy.mock.calls[0];
      expect(correctionDto).toMatchObject({
        sourceFactId: 'session:db-session-1:start',
        externalId: 'session-1:classification:package-v1',
        sessionType: 'packet_hours',
        sessionPacket: true,
      });
      expect(Array.from(options?.allowedRuleIds ?? [])).toEqual([
        'mission-package',
        'loot-box-package',
        'season-package',
      ]);
      expect(options?.allowedBattlePassSteps?.get('season-package')).toBe(2);
      expect(options).toMatchObject({
        evaluationMode: 'LIVE',
        evaluatorVersion: 'live-session-package-correction-v1',
        materializeRewards: true,
        suppressLedgerShadow: false,
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
    it('resolves a profile by any active identity link when the legacy guest differs', async () => {
      const { service, prisma } = createService();
      prisma.guestGameProfile.findFirst.mockResolvedValue(null);

      await (service as any).resolveDryRunProfile(user, {
        guestId: 'guest-linked-domain',
      });

      expect(prisma.guestGameProfile.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenantId: user.tenantId,
            OR: [
              { guestId: 'guest-linked-domain' },
              {
                identityLinks: {
                  some: {
                    tenantId: user.tenantId,
                    guestId: 'guest-linked-domain',
                    status: 'ACTIVE',
                  },
                },
              },
            ],
          },
        }),
      );
    });

    it('atomically replaces a deterministic recovery decision run on retry', async () => {
      const { service, prisma } = createService();

      await service.recordRuleDecisions(user, dryRunResult(), {
        evaluationRunId: 'loot-box-session-recovery:receipt-1:shadow',
        evaluationMode: 'SHADOW_LOOT_BOX_RECOVERY',
        replaceExistingRun: true,
        suppressLedgerShadow: true,
      });

      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Array));
      expect(prisma.guestGameRuleDecision.deleteMany).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-1',
          evaluationRunId: 'loot-box-session-recovery:receipt-1:shadow',
          evaluationMode: 'SHADOW_LOOT_BOX_RECOVERY',
        },
      });
      expect(prisma.guestGameRuleDecision.createMany).toHaveBeenCalledTimes(1);
    });

    it('persists paired live and ledger shadow decisions without changing rewards', async () => {
      const { service, prisma, configService } = createService();
      configService.get.mockImplementation((key: string) =>
        key === 'GUEST_GAME_LEDGER_EVALUATOR_MODE' ? 'SHADOW' : undefined,
      );
      prisma.guestGameMission.findMany.mockResolvedValue([
        {
          id: 'mission-1',
          name: 'Visit mission',
          triggerKind: 'SESSION_START',
          conditions: {},
          storeIds: [],
          periodFrom: null,
          periodTo: null,
          createdAt: new Date('2026-06-01T00:00:00.000Z'),
        },
      ]);
      prisma.guestActivityFact.findMany.mockResolvedValue([
        {
          id: 'ledger-fact-1',
          factType: 'SESSION_STARTED',
          confidence: 'EXACT',
          happenedAt: now,
          createdAt: now,
          storeId: null,
          tariffName: null,
          tariffType: null,
          store: null,
        },
      ]);

      await service.recordRuleDecisions(user, dryRunResult(), {
        eventId: 'event-1',
        traceId: 'trace-1',
      });

      expect(prisma.guestGameRuleDecision.createMany).toHaveBeenCalledTimes(2);
      const liveDecision =
        prisma.guestGameRuleDecision.createMany.mock.calls[0][0].data[0];
      const shadowDecision =
        prisma.guestGameRuleDecision.createMany.mock.calls[1][0].data[0];

      expect(liveDecision).toMatchObject({
        evaluationMode: 'LIVE',
        evaluatorVersion: 'legacy-v1',
        status: 'MATCHED',
      });
      expect(shadowDecision).toMatchObject({
        evaluationRunId: liveDecision.evaluationRunId,
        evaluationMode: 'SHADOW',
        evaluatorVersion: 'ledger-v2',
        status: 'MATCHED',
        traceId: 'trace-1',
      });
      expect(shadowDecision.evidence).toEqual(
        expect.objectContaining({
          facts: [expect.objectContaining({ id: 'ledger-fact-1' })],
        }),
      );
      expect(prisma.guestGameReward.create).not.toHaveBeenCalled();
    });

    it('uses the active domain identity when loading ledger shadow facts', async () => {
      const { service, prisma, configService, guestIdentityResolver } =
        createService();
      configService.get.mockImplementation((key: string) =>
        key === 'GUEST_GAME_LEDGER_EVALUATOR_MODE' ? 'SHADOW' : undefined,
      );
      guestIdentityResolver.findActiveGuestForProfileDomain.mockResolvedValue({
        id: 'guest-domain-2',
      });
      prisma.guestGameMission.findMany.mockResolvedValue([
        {
          id: 'mission-1',
          name: 'Visit mission',
          triggerKind: 'SESSION_START',
          conditions: {},
          storeIds: ['store-2'],
          periodFrom: null,
          periodTo: null,
          createdAt: new Date('2026-06-01T00:00:00.000Z'),
        },
      ]);
      prisma.store.findMany.mockResolvedValue([
        {
          id: 'store-2',
          externalDomain: 'club-2',
          timeZone: 'Asia/Yekaterinburg',
        },
      ]);

      await service.recordRuleDecisions(
        user,
        dryRunResult({
          store: {
            id: 'store-2',
            name: 'Club 2',
            timeZone: 'Asia/Yekaterinburg',
            externalDomain: 'club-2',
          },
        }),
        { eventId: 'event-domain-2' },
      );

      expect(
        guestIdentityResolver.findActiveGuestForProfileDomain,
      ).toHaveBeenCalledWith({
        tenantId: user.tenantId,
        profileId: 'profile-1',
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: 'club-2',
      });
      expect(prisma.guestActivityFact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { profileId: 'profile-1' },
              { guestId: { in: ['guest-domain-2'] } },
            ],
          }),
        }),
      );
    });

    it('passes a stable external id to ledger parity when the batch fact id is synthetic', async () => {
      const { service, prisma, configService } = createService();
      configService.get.mockImplementation((key: string) =>
        key === 'GUEST_GAME_LEDGER_EVALUATOR_MODE' ? 'SHADOW' : undefined,
      );
      prisma.guestGameMission.findMany.mockResolvedValue([
        {
          id: 'mission-1',
          name: 'Play for 60 minutes',
          triggerKind: 'PLAY_HOUR',
          conditions: {
            sessionType: 'regular_session',
            metric: { aggregation: 'duration', target: 60 },
          },
          progressTarget: 60,
          progressUnit: 'minute',
          storeIds: [],
          periodFrom: null,
          periodTo: null,
          createdAt: new Date('2026-06-01T00:00:00.000Z'),
        },
      ]);
      prisma.guestActivityFact.findMany.mockResolvedValue([
        {
          id: 'ledger-play-time-fact',
          factType: 'HOURLY_PLAY_TIME_ACCUMULATED',
          confidence: 'EXACT',
          happenedAt: now,
          createdAt: now,
          storeId: null,
          externalDomain: 'club-1',
          sourceExternalId: 'langame-session-strong-1',
          sessionExternalId: 'langame-session-strong-1',
          tariffName: null,
          tariffType: null,
          amount: null,
          durationMinutes: 75,
          evidence: null,
          store: null,
        },
      ]);
      const baseRule = dryRunResult().rules[0];

      await service.recordRuleDecisions(
        user,
        dryRunResult({
          eventType: 'PLAY_HOUR',
          rules: [
            {
              ...baseRule,
              name: 'Play for 60 minutes',
              triggerKind: 'PLAY_HOUR',
            },
          ],
        }),
        {
          eventId: 'event-play-time-1',
          sourceFactId: 'session:database-row-1:play-time',
          sourceExternalId: 'langame-session-strong-1',
          sourceFactKind: 'GUEST_SESSION',
        },
      );

      const shadowDecision =
        prisma.guestGameRuleDecision.createMany.mock.calls[1][0].data[0];
      expect(shadowDecision).toMatchObject({
        evaluationMode: 'SHADOW',
        evaluatorVersion: 'ledger-v2',
        status: 'MATCHED',
      });
      expect(shadowDecision.evidence).toEqual(
        expect.objectContaining({
          facts: [expect.objectContaining({ id: 'ledger-play-time-fact' })],
        }),
      );
    });

    it('resolves a domain-scoped topup timezone from selected rule stores for ledger parity', async () => {
      const { service, prisma, configService } = createService();
      configService.get.mockImplementation((key: string) =>
        key === 'GUEST_GAME_LEDGER_EVALUATOR_MODE' ? 'SHADOW' : undefined,
      );
      prisma.guestGameMission.findMany.mockResolvedValue([
        {
          id: 'mission-domain-topup',
          name: 'Morning topup',
          triggerKind: 'BALANCE_TOPUP',
          conditions: {
            hours: ['14:00-16:00'],
            weekdays: [3],
            metric: { aggregation: 'count', target: 1 },
          },
          progressTarget: 1,
          progressUnit: 'topup',
          storeIds: ['store-1'],
          periodFrom: null,
          periodTo: null,
          createdAt: new Date('2026-06-01T00:00:00.000Z'),
        },
      ]);
      prisma.store.findMany.mockResolvedValue([
        {
          id: 'store-1',
          externalDomain: 'club-1',
          timeZone: 'Asia/Yekaterinburg',
        },
      ]);
      prisma.guestActivityFact.findMany.mockResolvedValue([
        {
          id: 'ledger-domain-topup',
          factType: 'BALANCE_TOPUP',
          confidence: 'EXACT',
          happenedAt: now,
          createdAt: now,
          storeId: null,
          externalDomain: 'club-1',
          sourceExternalId: 'balance-operation-1',
          sessionExternalId: null,
          tariffName: null,
          tariffType: null,
          amount: new Prisma.Decimal(500),
          durationMinutes: null,
          evidence: null,
          store: null,
        },
      ]);
      const baseRule = dryRunResult().rules[0];

      await service.recordRuleDecisions(
        user,
        dryRunResult({
          eventType: 'BALANCE_TOPUP',
          rules: [
            {
              ...baseRule,
              id: 'mission-domain-topup',
              name: 'Morning topup',
              triggerKind: 'BALANCE_TOPUP',
            },
          ],
        }),
        {
          eventId: 'event-domain-topup',
          sourceFactId: 'balance:synthetic-1',
          sourceExternalId: 'balance-operation-1',
          sourceFactKind: 'BALANCE_LIST',
        },
      );

      expect(prisma.store.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: { id: true, externalDomain: true, timeZone: true },
        }),
      );
      const shadowDecision =
        prisma.guestGameRuleDecision.createMany.mock.calls[1][0].data[0];
      expect(shadowDecision).toMatchObject({
        evaluationMode: 'SHADOW',
        evaluatorVersion: 'ledger-v2',
        status: 'MATCHED',
      });
    });

    it('does not let a ledger fact from a completed Battle Pass step satisfy the next step', async () => {
      const { service, prisma, configService } = createService();
      configService.get.mockImplementation((key: string) =>
        key === 'GUEST_GAME_LEDGER_EVALUATOR_MODE' ? 'SHADOW' : undefined,
      );
      const previousStepFactAt = new Date('2026-06-10T09:00:00.000Z');
      const nextStepActivatedAt = new Date('2026-06-10T09:30:00.000Z');
      const playTimeRules = {
        schemaVersion: 2,
        taskType: 'PLAY_TIME',
        triggerKind: 'PLAY_TIME',
        sessionType: 'HOURLY',
        metric: {
          aggregation: 'duration',
          target: 60,
          unit: 'minutes',
        },
      };
      prisma.guestGameSeason.findMany.mockResolvedValue([
        {
          id: 'season-1',
          name: 'Test season',
          createdAt: new Date('2026-06-01T00:00:00.000Z'),
          periodFrom: null,
          periodTo: null,
          storeIds: [],
          xpRules: {},
          levels: [
            { level: 1, title: 'Step one', activationRules: playTimeRules },
            { level: 2, title: 'Step two', activationRules: playTimeRules },
          ],
        },
      ]);
      prisma.guestGameReward.findMany.mockResolvedValue([
        {
          seasonId: 'season-1',
          profileId: 'profile-1',
          guestId: 'guest-1',
          status: 'APPROVED',
          qualifiedAt: nextStepActivatedAt,
          expiresAt: null,
        },
      ]);
      prisma.guestActivityFact.findMany.mockResolvedValue([
        {
          id: 'previous-step-play-time',
          factType: 'HOURLY_PLAY_TIME_ACCUMULATED',
          confidence: 'EXACT',
          happenedAt: previousStepFactAt,
          createdAt: previousStepFactAt,
          storeId: null,
          externalDomain: 'club-1',
          tariffName: null,
          tariffType: null,
          amount: null,
          durationMinutes: 120,
          evidence: null,
          store: null,
        },
      ]);
      const baseRule = dryRunResult().rules[0];

      await service.recordRuleDecisions(
        user,
        dryRunResult({
          rules: [
            {
              ...baseRule,
              id: 'season-1',
              kind: 'SEASON',
              name: 'Test season',
              triggerKind: 'BATTLE_PASS',
              eligible: false,
              rewardType: null,
              rewardAmount: 0,
              rewardLabel: null,
              selectedRewardLabel: null,
              xpDelta: 0,
              battlePassLevel: 2,
              battlePassStep: 2,
              battlePassStepTitle: 'Step two',
              reasons: [],
              blockers: ['step progress is incomplete'],
            },
          ],
          summary: {
            checkedRules: 1,
            eligibleRules: 0,
            blockedRules: 1,
            estimatedRewardAmount: 0,
            projectedXpDelta: 0,
          },
        }),
        { eventId: 'event-step-2' },
      );

      expect(prisma.guestActivityFact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            happenedAt: {
              gte: nextStepActivatedAt,
              lte: now,
            },
          }),
        }),
      );
      const shadowDecision =
        prisma.guestGameRuleDecision.createMany.mock.calls[1][0].data[0];
      expect(shadowDecision).toMatchObject({
        ruleType: 'BATTLE_PASS',
        ruleId: 'season-1',
        evaluationMode: 'SHADOW',
        status: 'BLOCKED',
      });
    });

    it('does not move the ledger boundary past accumulated facts when the current event reward already exists', async () => {
      const { service, prisma, configService } = createService();
      configService.get.mockImplementation((key: string) =>
        key === 'GUEST_GAME_LEDGER_EVALUATOR_MODE' ? 'SHADOW' : undefined,
      );
      const stepActivatedAt = new Date('2026-06-10T09:00:00.000Z');
      const firstHalfAt = new Date('2026-06-10T09:15:00.000Z');
      const currentEventAt = now;
      const playTimeRules = {
        schemaVersion: 2,
        taskType: 'PLAY_TIME',
        triggerKind: 'PLAY_TIME',
        sessionType: 'HOURLY',
        metric: {
          aggregation: 'duration',
          target: 60,
          unit: 'minutes',
        },
      };
      prisma.guestGameSeason.findMany.mockResolvedValue([
        {
          id: 'season-1',
          name: 'Test season',
          createdAt: new Date('2026-06-01T00:00:00.000Z'),
          periodFrom: null,
          periodTo: null,
          storeIds: [],
          xpRules: {},
          levels: [
            { level: 1, title: 'Step one', activationRules: playTimeRules },
            { level: 2, title: 'Step two', activationRules: playTimeRules },
          ],
        },
      ]);
      prisma.guestGameReward.findMany.mockResolvedValue([
        {
          id: 'reward-step-1',
          seasonId: 'season-1',
          profileId: 'profile-1',
          guestId: 'guest-1',
          status: 'APPROVED',
          qualifiedAt: stepActivatedAt,
          expiresAt: null,
        },
        {
          id: 'reward-step-2-current-event',
          seasonId: 'season-1',
          profileId: 'profile-1',
          guestId: 'guest-1',
          status: 'APPROVED',
          qualifiedAt: currentEventAt,
          expiresAt: null,
        },
      ]);
      prisma.guestActivityFact.findMany.mockResolvedValue([
        {
          id: 'play-time-first-half',
          factType: 'HOURLY_PLAY_TIME_ACCUMULATED',
          confidence: 'EXACT',
          happenedAt: firstHalfAt,
          createdAt: firstHalfAt,
          storeId: null,
          externalDomain: 'club-1',
          tariffName: null,
          tariffType: null,
          amount: null,
          durationMinutes: 30,
          evidence: null,
          store: null,
        },
        {
          id: 'play-time-current-event-half',
          factType: 'HOURLY_PLAY_TIME_ACCUMULATED',
          confidence: 'EXACT',
          happenedAt: currentEventAt,
          createdAt: currentEventAt,
          storeId: null,
          externalDomain: 'club-1',
          tariffName: null,
          tariffType: null,
          amount: null,
          durationMinutes: 30,
          evidence: null,
          store: null,
        },
      ]);
      const baseRule = dryRunResult().rules[0];

      await service.recordRuleDecisions(
        user,
        dryRunResult({
          eventType: 'PLAY_HOUR',
          occurredAt: currentEventAt.toISOString(),
          rules: [
            {
              ...baseRule,
              id: 'season-1',
              kind: 'SEASON',
              name: 'Test season',
              triggerKind: 'PLAY_TIME',
              eligible: true,
              rewardType: 'BONUS',
              rewardAmount: 100,
              rewardLabel: 'Step two reward',
              selectedRewardLabel: 'Step two reward',
              xpDelta: 0,
              battlePassLevel: 2,
              battlePassStep: 2,
              battlePassStepTitle: 'Step two',
              reasons: ['step progress is complete'],
              blockers: [],
            },
          ],
        }),
        {
          eventId: 'event-step-2',
          sourceFactId: 'play-time-current-event-half',
          excludeSeasonRewardIds: ['reward-step-2-current-event'],
        },
      );

      expect(prisma.guestGameReward.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { notIn: ['reward-step-2-current-event'] },
          }),
        }),
      );
      expect(prisma.guestActivityFact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            happenedAt: {
              gte: stepActivatedAt,
              lte: currentEventAt,
            },
          }),
        }),
      );
      const shadowDecision =
        prisma.guestGameRuleDecision.createMany.mock.calls[1][0].data[0];
      expect(shadowDecision).toMatchObject({
        ruleType: 'BATTLE_PASS',
        ruleId: 'season-1',
        evaluationMode: 'SHADOW',
        status: 'MATCHED',
      });
      expect(shadowDecision.evidence).toEqual(
        expect.objectContaining({
          progress: expect.objectContaining({ current: 60, target: 60 }),
        }),
      );
    });

    it('pairs a blocked live open attempt with shadow without granting entitlement', async () => {
      const { service, prisma, configService } = createService();
      configService.get.mockImplementation((key: string) =>
        key === 'GUEST_GAME_LEDGER_EVALUATOR_MODE' ? 'SHADOW' : undefined,
      );
      prisma.guestGameMission.findMany.mockResolvedValue([
        {
          id: 'mission-1',
          name: 'Visit mission',
          triggerKind: 'SESSION_START',
          conditions: {},
          storeIds: [],
          periodFrom: null,
          periodTo: null,
          createdAt: new Date('2026-06-01T00:00:00.000Z'),
        },
      ]);
      prisma.guestActivityFact.findMany.mockResolvedValue([]);
      const blockedRun = dryRunResult({
        rules: dryRunResult().rules.map((rule) => ({
          ...rule,
          eligible: false,
          reasons: [],
          blockers: ['session_type'],
        })),
      });

      await service.recordRuleDecisions(user, blockedRun, {
        traceId: 'open-trace-1',
        evaluationMode: 'LIVE_OPEN_ATTEMPT',
        sourceFactKind: 'GUEST_LOOT_BOX_OPEN',
      });

      expect(prisma.guestGameRuleDecision.createMany).toHaveBeenCalledTimes(2);
      const liveDecision =
        prisma.guestGameRuleDecision.createMany.mock.calls[0][0].data[0];
      const shadowDecision =
        prisma.guestGameRuleDecision.createMany.mock.calls[1][0].data[0];
      expect(liveDecision).toMatchObject({
        evaluationMode: 'LIVE_OPEN_ATTEMPT',
        status: 'BLOCKED',
      });
      expect(shadowDecision).toMatchObject({
        evaluationRunId: liveDecision.evaluationRunId,
        evaluationMode: 'SHADOW',
      });
      expect(prisma.guestGameEntitlement.upsert).not.toHaveBeenCalled();
      expect(prisma.guestGameReward.create).not.toHaveBeenCalled();
    });

    it('upserts one available entitlement for the same matched lootbox event', async () => {
      const { service, prisma } = createService();
      const baseRule = dryRunResult().rules[0];
      prisma.guestGameLootBox.findFirst.mockResolvedValue({
        id: 'loot-box-1',
        limits: {},
      });
      const lootBoxRun = dryRunResult({
        rules: [
          {
            ...baseRule,
            id: 'loot-box-1',
            kind: 'LOOT_BOX',
            name: 'Morning case',
            xpDelta: 0,
          },
        ],
      });

      await service.recordRuleDecisions(user, lootBoxRun, {
        eventId: 'event-1',
        traceId: 'trace-1',
      });
      await service.recordRuleDecisions(user, lootBoxRun, {
        eventId: 'event-1',
        traceId: 'trace-2',
      });

      expect(prisma.guestGameEntitlement.upsert).toHaveBeenCalledTimes(2);
      const first = prisma.guestGameEntitlement.upsert.mock.calls[0][0];
      const second = prisma.guestGameEntitlement.upsert.mock.calls[1][0];
      expect(first).toMatchObject({
        where: {
          tenantId_idempotencyKey: {
            tenantId: user.tenantId,
            idempotencyKey: 'loot-box:loot-box-1:event-1',
          },
        },
        create: {
          profileId: 'profile-1',
          guestId: 'guest-1',
          eventId: 'event-1',
          ruleType: 'LOOT_BOX',
          ruleId: 'loot-box-1',
          status: 'AVAILABLE',
          qualifiedAt: now,
        },
      });
      expect(second.where).toEqual(first.where);
      expect(second.update).not.toHaveProperty('status');
      expect(second.update).not.toHaveProperty('consumedAt');
    });

    it('atomically reserves one global daily entitlement for concurrent distinct events', async () => {
      const { service, prisma } = createService();
      const baseRule = dryRunResult().rules[0];
      const rule = {
        ...baseRule,
        id: 'loot-box-atomic-day',
        kind: 'LOOT_BOX' as const,
        name: 'Atomic daily case',
        xpDelta: 0,
      };
      const stored = installAtomicLootBoxEntitlementStore(prisma, {
        ruleId: rule.id,
        limits: { totalPerDay: 1 },
      });

      const [first, second] = await Promise.all([
        service.recordRuleDecisions(user, dryRunResult({ rules: [rule] }), {
          eventId: 'event-atomic-day-1',
        }),
        service.recordRuleDecisions(
          user,
          dryRunResult({
            profile: {
              ...dryRunResult().profile!,
              id: 'profile-2',
            },
            guest: {
              ...dryRunResult().guest!,
              id: 'guest-2',
            },
            rules: [rule],
          }),
          { eventId: 'event-atomic-day-2' },
        ),
      ]);

      expect(stored.filter((row) => row.status === 'AVAILABLE')).toHaveLength(
        1,
      );
      expect(stored.filter((row) => row.status === 'CANCELED')).toHaveLength(1);
      expect(
        [...first.lootBoxEntitlements, ...second.lootBoxEntitlements].map(
          (outcome) => outcome.status,
        ),
      ).toEqual(expect.arrayContaining(['PERSISTED', 'LIMIT_EXHAUSTED']));
      expect(stored.find((row) => row.status === 'CANCELED')?.evidence).toEqual(
        expect.objectContaining({
          issuanceOutcome: 'LIMIT_EXHAUSTED',
          atomicLimitGuard: expect.objectContaining({
            codes: ['TOTAL_DAILY_LIMIT_EXHAUSTED'],
          }),
        }),
      );
      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: 'Serializable',
      });
    });

    it('atomically enforces the rolling per-guest weekly limit', async () => {
      const { service, prisma } = createService();
      const baseRule = dryRunResult().rules[0];
      const rule = {
        ...baseRule,
        id: 'loot-box-atomic-week',
        kind: 'LOOT_BOX' as const,
        name: 'Atomic weekly case',
        xpDelta: 0,
      };
      const stored = installAtomicLootBoxEntitlementStore(prisma, {
        ruleId: rule.id,
        limits: { perGuestPerWeek: 1 },
      });

      const results = await Promise.all([
        service.recordRuleDecisions(user, dryRunResult({ rules: [rule] }), {
          eventId: 'event-atomic-week-1',
        }),
        service.recordRuleDecisions(user, dryRunResult({ rules: [rule] }), {
          eventId: 'event-atomic-week-2',
        }),
      ]);

      expect(stored.filter((row) => row.status === 'AVAILABLE')).toHaveLength(
        1,
      );
      expect(stored.filter((row) => row.status === 'CANCELED')).toHaveLength(1);
      expect(results.flatMap((result) => result.lootBoxEntitlements)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ status: 'PERSISTED' }),
          expect.objectContaining({
            status: 'LIMIT_EXHAUSTED',
            limitCodes: ['PER_GUEST_WEEKLY_LIMIT_EXHAUSTED'],
          }),
        ]),
      );
    });

    it('treats concurrent writes for the same source as one idempotent entitlement', async () => {
      const { service, prisma } = createService();
      const baseRule = dryRunResult().rules[0];
      const rule = {
        ...baseRule,
        id: 'loot-box-atomic-idempotent',
        kind: 'LOOT_BOX' as const,
        name: 'Atomic idempotent case',
        xpDelta: 0,
      };
      const stored = installAtomicLootBoxEntitlementStore(prisma, {
        ruleId: rule.id,
        limits: { totalPerDay: 1, perGuestPerWeek: 1 },
      });

      const results = await Promise.all([
        service.recordRuleDecisions(user, dryRunResult({ rules: [rule] }), {
          eventId: 'event-atomic-same',
        }),
        service.recordRuleDecisions(user, dryRunResult({ rules: [rule] }), {
          eventId: 'event-atomic-same',
        }),
      ]);

      expect(stored).toHaveLength(1);
      expect(stored[0]).toMatchObject({ status: 'AVAILABLE' });
      expect(
        results
          .flatMap((result) => result.lootBoxEntitlements)
          .map((outcome) => outcome.status),
      ).toEqual(expect.arrayContaining(['PERSISTED', 'IDEMPOTENT']));
    });

    it('creates a mission reward lootbox entitlement without creating a prize', async () => {
      const { service, prisma } = createService();
      const missionRun = dryRunResult({
        rules: [
          {
            ...dryRunResult().rules[0],
            id: 'mission-lootbox',
            kind: 'MISSION',
            rewardType: 'LOOT_BOX_ENTITLEMENT',
            rewardAmount: 0,
            rewardLabel: 'Ежедневный шанс',
            manualApprovalRequired: false,
          },
        ],
      });
      prisma.guestGameMission.findMany.mockResolvedValue([
        {
          id: 'mission-lootbox',
          conditions: { reward: { lootBoxId: 'reward-lootbox' } },
        },
      ]);
      prisma.guestGameLootBox.findMany.mockResolvedValue([
        { id: 'reward-lootbox', name: 'Ежедневный шанс' },
      ]);

      await service.recordRuleDecisions(user, missionRun, {
        eventId: 'mission-event-1',
        evaluationMode: 'LIVE',
      });

      expect(prisma.guestGameReward.create).not.toHaveBeenCalled();
      expect(prisma.guestGameLootBox.findMany).toHaveBeenCalledWith({
        where: {
          tenantId: user.tenantId,
          id: { in: ['reward-lootbox'] },
          status: 'ACTIVE',
          usageKind: { in: ['REWARD_TEMPLATE', 'BOTH'] },
        },
        select: { id: true, name: true },
      });
      expect(prisma.guestGameEntitlement.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenantId_idempotencyKey: {
              tenantId: user.tenantId,
              idempotencyKey:
                'mission-loot-box:mission-lootbox:mission-event-1',
            },
          },
          create: expect.objectContaining({
            ruleId: 'reward-lootbox',
            status: 'AVAILABLE',
            evidence: expect.objectContaining({
              missionId: 'mission-lootbox',
            }),
          }),
        }),
      );
    });

    it('does not grant a mission lootbox entitlement from a diagnostic live evaluation without a canonical event', async () => {
      const { service, prisma } = createService();
      const missionRun = dryRunResult({
        rules: [
          {
            ...dryRunResult().rules[0],
            id: 'mission-lootbox-open-attempt',
            kind: 'MISSION',
            rewardType: 'LOOT_BOX_ENTITLEMENT',
            rewardAmount: 0,
            manualApprovalRequired: false,
          },
        ],
      });

      await service.recordRuleDecisions(user, missionRun, {
        evaluationMode: 'LIVE_OPEN_ATTEMPT',
        sourceFactKind: 'GUEST_LOOT_BOX_OPEN',
      });

      expect(prisma.guestGameMission.findMany).not.toHaveBeenCalled();
      expect(prisma.guestGameEntitlement.upsert).not.toHaveBeenCalled();
    });

    it('waits for administrator approval before creating a mission lootbox entitlement', async () => {
      const { service, prisma } = createService();
      const missionRun = dryRunResult({
        rules: [
          {
            ...dryRunResult().rules[0],
            id: 'mission-lootbox-manual',
            kind: 'MISSION',
            rewardType: 'LOOT_BOX_ENTITLEMENT',
            rewardAmount: 0,
            manualApprovalRequired: true,
          },
        ],
      });

      await service.recordRuleDecisions(user, missionRun, {
        eventId: 'mission-event-manual',
        evaluationMode: 'LIVE',
      });

      expect(prisma.guestGameEntitlement.upsert).not.toHaveBeenCalled();

      prisma.guestGameLootBox.findFirst.mockResolvedValue({
        id: 'reward-lootbox',
        name: 'Ежедневный шанс',
      });
      await (service as any).createApprovedRewardLootBoxEntitlement(user, {
        id: 'pending-reward-1',
        tenantId: user.tenantId,
        profileId: 'profile-1',
        guestId: 'guest-1',
        storeId: 'store-1',
        rewardType: 'LOOT_BOX_ENTITLEMENT',
        qualifiedAt: now,
        mission: {
          id: 'mission-lootbox-manual',
          conditions: { reward: { lootBoxId: 'reward-lootbox' } },
        },
      });

      expect(prisma.guestGameEntitlement.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenantId_idempotencyKey: {
              tenantId: user.tenantId,
              idempotencyKey: 'mission-loot-box-approval:pending-reward-1',
            },
          },
          create: expect.objectContaining({
            rewardId: 'pending-reward-1',
            status: 'AVAILABLE',
          }),
          update: {},
        }),
      );
    });

    it.each(['CONSUMED', 'CANCELED'])(
      'never reopens a terminal %s approved-reward entitlement on retry',
      async (terminalStatus) => {
        const { service, prisma } = createService();
        prisma.guestGameLootBox.findFirst.mockResolvedValue({
          id: 'reward-lootbox',
          name: 'Terminal reward lootbox',
        });
        prisma.guestGameEntitlement.upsert.mockResolvedValue({
          id: 'terminal-entitlement',
          status: terminalStatus,
        });
        const reward = rewardRow({
          id: `terminal-reward-${terminalStatus.toLowerCase()}`,
          rewardType: 'LOOT_BOX_ENTITLEMENT',
          missionId: 'mission-lootbox-manual',
          mission: {
            id: 'mission-lootbox-manual',
            name: 'Mission',
            conditions: { reward: { lootBoxId: 'reward-lootbox' } },
          },
        });

        await (service as any).createApprovedRewardLootBoxEntitlement(
          user,
          reward,
        );
        await (service as any).createApprovedRewardLootBoxEntitlement(
          user,
          reward,
        );

        expect(prisma.guestGameEntitlement.upsert).toHaveBeenCalledTimes(2);
        for (const [call] of prisma.guestGameEntitlement.upsert.mock.calls) {
          expect(call).toEqual(
            expect.objectContaining({
              create: expect.objectContaining({ status: 'AVAILABLE' }),
              update: {},
            }),
          );
          expect(call.update).not.toEqual(
            expect.objectContaining({ status: 'AVAILABLE' }),
          );
        }
      },
    );

    it('uses one atomic local-day identity for automatic mission lootbox rewards', async () => {
      const { service, prisma } = createService();
      const missionRule = {
        ...dryRunResult().rules[0],
        id: 'mission-daily-lootbox',
        kind: 'MISSION' as const,
        rewardType: 'LOOT_BOX_ENTITLEMENT',
        rewardAmount: 0,
        manualApprovalRequired: false,
      };
      prisma.guestGameMission.findMany.mockResolvedValue([
        {
          id: missionRule.id,
          conditions: { reward: { lootBoxId: 'reward-lootbox' } },
          antiFraudRules: { denySameDayRepeat: true },
        },
      ]);
      prisma.guestGameLootBox.findMany.mockResolvedValue([
        { id: 'reward-lootbox', name: 'Daily reward lootbox' },
      ]);
      const run = dryRunResult({
        occurredAt: '2026-06-10T18:55:00.000Z',
        store: {
          id: 'store-1',
          name: 'Club',
          timeZone: 'Asia/Yekaterinburg',
        },
        rules: [missionRule],
      });

      await Promise.all([
        service.recordRuleDecisions(user, run, {
          eventId: 'mission-daily-event-1',
          evaluationMode: 'LIVE',
        }),
        service.recordRuleDecisions(user, run, {
          eventId: 'mission-daily-event-2',
          evaluationMode: 'LIVE',
        }),
      ]);

      expect(prisma.guestGameEntitlement.upsert).toHaveBeenCalledTimes(2);
      const calls = prisma.guestGameEntitlement.upsert.mock.calls.map(
        ([call]) => call,
      );
      expect(
        calls.map((call) => call.where.tenantId_idempotencyKey.idempotencyKey),
      ).toEqual([
        'mission-loot-box:mission-daily-lootbox:daily:profile-1:2026-06-10',
        'mission-loot-box:mission-daily-lootbox:daily:profile-1:2026-06-10',
      ]);
      for (const call of calls) {
        expect(call).toEqual(
          expect.objectContaining({
            create: expect.objectContaining({
              evidence: expect.objectContaining({
                denySameDayRepeat: true,
                entitlementDateKey: '2026-06-10',
              }),
            }),
            update: {},
          }),
        );
      }
    });

    it('materializes exactly one reusable FREE Battle Pass entitlement without selecting a prize', async () => {
      const { service, prisma, bonusLedgerService } = createService();
      const randomSpy = jest.spyOn(Math, 'random');
      prisma.guestGameLootBox.findFirst.mockResolvedValue({
        id: 'battle-pass-lootbox',
        name: 'Сезонный контейнер',
      });
      const seasonReward = rewardRow({
        id: 'battle-pass-reward-1',
        rewardType: 'LOOT_BOX_ENTITLEMENT',
        rewardAmount: new Prisma.Decimal(0),
        rewardLabel: 'Сезонный контейнер',
        seasonId: 'season-1',
        season: {
          id: 'season-1',
          name: 'Тестовый сезон',
        },
        evidence: {
          source: 'guest_gamification_process_event',
          rule: {
            kind: 'SEASON',
            id: 'season-1',
            battlePassLevel: 2,
            battlePassStep: 2,
            battlePassRewardTrack: 'FREE',
            rewardLootBoxId: 'battle-pass-lootbox',
          },
        },
      });

      await (service as any).createApprovedRewardLootBoxEntitlement(
        user,
        seasonReward,
      );
      await (service as any).createApprovedRewardLootBoxEntitlement(
        user,
        seasonReward,
      );

      expect(prisma.guestGameLootBox.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'battle-pass-lootbox',
          tenantId: user.tenantId,
          status: 'ACTIVE',
          usageKind: { in: ['REWARD_TEMPLATE', 'BOTH'] },
        },
        select: { id: true, name: true },
      });
      expect(prisma.guestGameEntitlement.upsert).toHaveBeenCalledTimes(2);
      expect(prisma.guestGameEntitlement.upsert).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: {
            tenantId_idempotencyKey: {
              tenantId: user.tenantId,
              idempotencyKey:
                'battle-pass-loot-box-approval:battle-pass-reward-1',
            },
          },
          create: expect.objectContaining({
            rewardId: 'battle-pass-reward-1',
            ruleId: 'battle-pass-lootbox',
            sourceEventType: 'BATTLE_PASS_REWARD_APPROVED',
            status: 'AVAILABLE',
            evidence: expect.objectContaining({
              source: 'battle_pass_reward_auto',
              seasonId: 'season-1',
              battlePassStep: 2,
              battlePassRewardTrack: 'FREE',
            }),
          }),
        }),
      );
      expect(prisma.guestGameReward.create).not.toHaveBeenCalled();
      expect(bonusLedgerService.queueApprovedRewards).not.toHaveBeenCalled();
      expect(randomSpy).not.toHaveBeenCalled();
    });

    it('records administrator approval when materializing a Battle Pass lootbox entitlement', async () => {
      const { service, prisma } = createService();
      prisma.guestGameLootBox.findFirst.mockResolvedValue({
        id: 'battle-pass-lootbox',
        name: 'Сезонный контейнер',
      });

      await (service as any).createApprovedRewardLootBoxEntitlement(
        user,
        rewardRow({
          id: 'battle-pass-reward-manual',
          rewardType: 'LOOT_BOX_ENTITLEMENT',
          seasonId: 'season-1',
          season: { id: 'season-1', name: 'Тестовый сезон' },
          approvedByUser: { id: 'approver-1' },
          evidence: {
            rule: {
              kind: 'SEASON',
              id: 'season-1',
              battlePassLevel: 3,
              battlePassStep: 3,
              battlePassRewardTrack: 'FREE',
              rewardLootBoxId: 'battle-pass-lootbox',
            },
          },
        }),
      );

      expect(prisma.guestGameEntitlement.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            evidence: expect.objectContaining({
              source: 'battle_pass_reward_admin_approval',
              approvedByUserId: 'approver-1',
              battlePassStep: 3,
            }),
          }),
        }),
      );
    });

    it('scopes daily lootbox entitlement issuance without expiring the unlocked right', async () => {
      const { service, prisma } = createService();
      const baseRule = dryRunResult().rules[0];
      prisma.guestGameLootBox.findFirst.mockResolvedValue({
        id: 'loot-box-daily',
        limits: { periodicLimit: 'DAILY' },
      });
      const dailyRule = {
        ...baseRule,
        id: 'loot-box-daily',
        kind: 'LOOT_BOX' as const,
        name: 'Daily case',
        xpDelta: 0,
        periodicLimitPeriod: 'DAILY' as const,
      };
      const lateEveningRun = dryRunResult({
        occurredAt: '2026-06-10T18:55:00.000Z',
        store: {
          id: 'store-1',
          name: 'Club',
          timeZone: 'Asia/Yekaterinburg',
        },
        rules: [dailyRule],
      });

      await service.recordRuleDecisions(user, lateEveningRun, {
        eventId: 'event-before-midnight',
        evaluationMode: 'LIVE_LOOT_BOX_RECOVERY',
        evaluatorVersion: 'ledger-v2',
      });
      await service.recordRuleDecisions(user, lateEveningRun, {
        eventId: 'event-before-midnight-repeat',
      });

      const first = prisma.guestGameEntitlement.upsert.mock.calls[0][0];
      const repeated = prisma.guestGameEntitlement.upsert.mock.calls[1][0];
      expect(first).toMatchObject({
        where: {
          tenantId_idempotencyKey: {
            tenantId: user.tenantId,
            idempotencyKey:
              'loot-box:loot-box-daily:daily:profile-1:2026-06-10',
          },
        },
        create: {
          qualifiedAt: new Date('2026-06-10T18:55:00.000Z'),
          validUntil: null,
          evidence: expect.objectContaining({
            evaluationMode: 'LIVE_LOOT_BOX_RECOVERY',
            evaluatorVersion: 'ledger-v2',
            entitlementPeriod: expect.objectContaining({
              kind: 'DAILY',
              key: '2026-06-10',
              periodEndsAt: '2026-06-10T19:00:00.000Z',
            }),
          }),
        },
      });
      expect(repeated.where).toEqual(first.where);

      await service.recordRuleDecisions(
        user,
        dryRunResult({
          occurredAt: '2026-06-10T19:01:00.000Z',
          store: lateEveningRun.store,
          rules: [dailyRule],
        }),
        { eventId: 'event-after-midnight' },
      );

      expect(prisma.guestGameEntitlement.upsert.mock.calls[2][0]).toMatchObject(
        {
          where: {
            tenantId_idempotencyKey: {
              tenantId: user.tenantId,
              idempotencyKey:
                'loot-box:loot-box-daily:daily:profile-1:2026-06-11',
            },
          },
          create: {
            validUntil: null,
            evidence: expect.objectContaining({
              entitlementPeriod: expect.objectContaining({
                key: '2026-06-11',
                periodEndsAt: '2026-06-11T19:00:00.000Z',
              }),
            }),
          },
        },
      );
    });

    it('does not create a new entitlement from the lootbox opening event', async () => {
      const { service, prisma } = createService();
      const baseRule = dryRunResult().rules[0];

      await service.recordRuleDecisions(
        user,
        dryRunResult({
          rules: [
            {
              ...baseRule,
              id: 'loot-box-1',
              kind: 'LOOT_BOX',
              xpDelta: 0,
            },
          ],
        }),
        {
          eventId: 'open-event-1',
          sourceFactId: 'open-fact-1',
          sourceFactKind: 'GUEST_LOOT_BOX_OPEN',
        },
      );

      expect(prisma.guestGameEntitlement.upsert).not.toHaveBeenCalled();
    });

    it('reuses the canonical event and materializes only the selected replay intent', async () => {
      const { service, prisma } = createService();
      const profile = profileFixture();
      const stepRun = battlePassDryRun();
      const replayScope = {
        ruleKind: 'SEASON' as const,
        ruleId: 'season-1',
        battlePassStep: 2,
        stepId: 'step-2',
        sourceFactId: 'fact-270',
        sourceFactUpdatedAt: now,
        seasonUpdatedAt: now,
        confirmationHash: 'confirmation-hash',
      };
      const canonicalEvent = eventResult({
        id: 'event-existing',
        eventType: 'PLAY_HOUR',
        xpDelta: 0,
        occurredAt: now as unknown as string,
        createdAt: now as unknown as string,
      });

      jest.spyOn(service as any, 'ensureProcessProfile').mockResolvedValue({
        profile,
        profileCreated: false,
      });
      jest.spyOn(service, 'dryRun').mockResolvedValue(stepRun);
      prisma.guestGameEvent.findFirst.mockResolvedValue(canonicalEvent);
      const persistIntent = jest
        .spyOn(service as any, 'persistReplayRewardIntent')
        .mockResolvedValue(['intent-selected']);
      const materialize = jest
        .spyOn(service as any, 'materializeProcessRewardIntents')
        .mockResolvedValue(null);
      const createEvent = jest.spyOn(service as any, 'createProcessEvent');
      const dto = {
        profileId: profile.id,
        guestId: 'guest-1',
        eventType: 'PLAY_HOUR',
        sourceFactKind: 'GUEST_SESSION',
        sourceFactId: 'fact-270',
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: 'club-1',
        externalId: 'session-270',
      };
      const ruleExternalDomains = new Map<string, readonly string[]>([
        ['season-1', ['club-1']],
      ]);
      const ruleDomainTimeZones = new Map([
        ['season-1', new Map([['club-1', 'Asia/Yekaterinburg']])],
      ]);

      await service.processEvent(user, dto, {
        originKey: 'origin-replay',
        evaluationMode: 'LIVE_LEDGER_FALLBACK',
        ruleExternalDomains,
        ruleDomainTimeZones,
        replayRewardScope: replayScope,
      });

      expect(createEvent).not.toHaveBeenCalled();
      expect(service.dryRun).toHaveBeenCalledWith(
        user,
        expect.objectContaining({
          profileId: profile.id,
          guestId: 'guest-1',
        }),
        {
          ruleExternalDomains,
          ruleDomainTimeZones,
          rewardScope: {
            seasonId: 'season-1',
            profileId: profile.id,
            guestId: 'guest-1',
          },
        },
      );
      expect(persistIntent).toHaveBeenCalledWith(
        user,
        stepRun,
        'event-existing',
        profile.id,
        'origin-replay',
        replayScope,
      );
      expect(materialize).toHaveBeenCalledWith(
        user,
        dto,
        stepRun,
        canonicalEvent,
        profile.id,
        expect.objectContaining({
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: 'club-1',
        }),
        'origin-replay',
        { intentIds: ['intent-selected'] },
      );
    });

    it('reloads a pristine exact canonical event after its owner is atomically rebound', async () => {
      const { service, prisma, guestIdentityResolver } = createService();
      const profile = profileFixture();
      const stepRun = battlePassDryRun();
      const previousEvent = eventResult({
        id: 'event-exact-owner',
        eventType: 'PLAY_HOUR',
        xpDelta: 0,
        occurredAt: now as unknown as string,
        createdAt: now as unknown as string,
        profile: {
          ...eventResult().profile,
          id: 'profile-stale',
        },
        guest: {
          ...profile.guest!,
          id: 'guest-stale',
        },
      });
      const reboundEvent = eventResult({
        id: 'event-exact-owner',
        eventType: 'PLAY_HOUR',
        xpDelta: 0,
        occurredAt: now as unknown as string,
        createdAt: now as unknown as string,
      });
      const exactScope = {
        sourceFactId: 'fact-exact-owner',
        sourceFactUpdatedAt: now,
        physicalSessionKey: 'physical-session-1',
        rules: [
          {
            ruleKind: 'SEASON' as const,
            ruleId: 'season-1',
            battlePassStep: 2,
            ruleUpdatedAt: now,
          },
        ],
      };

      jest.spyOn(service as any, 'ensureProcessProfile').mockResolvedValue({
        profile,
        profileCreated: false,
      });
      guestIdentityResolver.findActiveGuestForProfileDomain.mockResolvedValue({
        id: 'guest-1',
      });
      jest.spyOn(service, 'dryRun').mockResolvedValue(stepRun);
      prisma.guestGameEvent.findFirst
        .mockResolvedValueOnce(previousEvent)
        .mockResolvedValueOnce(reboundEvent);
      const persistExact = jest
        .spyOn(service as any, 'persistExactReconciliationEffects')
        .mockResolvedValue({
          dryRun: stepRun,
          intentIds: [],
          appliedXpDelta: 0,
          physicalSessionKey: exactScope.physicalSessionKey,
          sourceFactId: exactScope.sourceFactId,
          ownerReconciliation: {
            status: 'REBOUND',
            previousProfileId: 'profile-stale',
            previousGuestId: 'guest-stale',
          },
        });
      jest.spyOn(service, 'recordRuleDecisions').mockResolvedValue({
        decisionsPersisted: true,
        lootBoxEntitlements: [],
      });
      jest
        .spyOn(service as any, 'getMissingMatchedLootBoxEntitlementRuleIds')
        .mockResolvedValue([]);
      jest
        .spyOn(
          service as any,
          'getMissingMatchedMissionRewardEntitlementRuleIds',
        )
        .mockResolvedValue([]);

      const result = await service.processEvent(
        user,
        {
          profileId: profile.id,
          guestId: 'guest-1',
          eventType: 'PLAY_HOUR',
          sourceFactKind: 'GUEST_SESSION',
          sourceFactId: exactScope.sourceFactId,
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: 'club-1',
          externalId: 'session-exact-owner',
        },
        {
          evaluationMode: 'LIVE_LEDGER_FALLBACK',
          materializeRewards: false,
          originKey: 'origin-exact-owner',
          exactReconciliationScope: exactScope,
          suppressLedgerShadow: true,
        },
      );

      expect(persistExact).toHaveBeenCalledWith(
        user,
        stepRun,
        previousEvent.id,
        profile.id,
        'guest-1',
        'origin-exact-owner',
        exactScope,
        'EXACT_PLAY_TIME',
      );
      expect(prisma.guestGameEvent.findFirst).toHaveBeenCalledTimes(2);
      expect(result.event).toMatchObject({
        id: 'event-exact-owner',
        profile: { id: profile.id },
        guest: { id: 'guest-1' },
      });
      expect(result.summary.exactReconciliation).toMatchObject({
        complete: true,
        waitingForDelivery: false,
        deadLetterIntentCount: 0,
      });
    });

    it('surfaces a durable exact owner quarantine before any material effect runs', async () => {
      const { service, prisma, guestIdentityResolver } = createService();
      const profile = profileFixture();
      const stepRun = battlePassDryRun();
      const previousEvent = eventResult({
        id: 'event-exact-quarantined',
        eventType: 'PLAY_HOUR',
        xpDelta: 0,
        occurredAt: now as unknown as string,
        createdAt: now as unknown as string,
        profile: {
          ...eventResult().profile,
          id: 'profile-stale',
        },
        guest: {
          ...profile.guest!,
          id: 'guest-stale',
        },
      });
      const exactScope = {
        sourceFactId: 'fact-exact-quarantined',
        sourceFactUpdatedAt: now,
        physicalSessionKey: 'physical-session-quarantined',
        rules: [
          {
            ruleKind: 'MISSION' as const,
            ruleId: 'mission-1',
            battlePassStep: null,
            ruleUpdatedAt: now,
          },
        ],
      };

      jest.spyOn(service as any, 'ensureProcessProfile').mockResolvedValue({
        profile,
        profileCreated: false,
      });
      guestIdentityResolver.findActiveGuestForProfileDomain.mockResolvedValue({
        id: 'guest-1',
      });
      jest.spyOn(service, 'dryRun').mockResolvedValue(stepRun);
      prisma.guestGameEvent.findFirst.mockResolvedValueOnce(previousEvent);
      jest
        .spyOn(service as any, 'persistExactReconciliationEffects')
        .mockResolvedValue({
          dryRun: stepRun,
          intentIds: [],
          appliedXpDelta: 0,
          physicalSessionKey: exactScope.physicalSessionKey,
          sourceFactId: exactScope.sourceFactId,
          ownerReconciliation: {
            status: 'QUARANTINED',
            quarantineOriginKey: 'owner-quarantine-origin',
            reasonCode: 'MATERIAL_EFFECTS_EXIST',
          },
        });
      const materialize = jest.spyOn(
        service as any,
        'materializeProcessRewardIntents',
      );
      const recordDecisions = jest.spyOn(service, 'recordRuleDecisions');

      const error = await service
        .processEvent(
          user,
          {
            profileId: profile.id,
            guestId: 'guest-1',
            eventType: 'PLAY_HOUR',
            sourceFactKind: 'GUEST_SESSION',
            sourceFactId: exactScope.sourceFactId,
            externalProvider: IntegrationProvider.LANGAME,
            externalDomain: 'club-1',
            externalId: 'session-exact-quarantined',
          },
          {
            evaluationMode: 'LIVE_LEDGER_FALLBACK',
            originKey: 'origin-exact-quarantined',
            exactReconciliationScope: exactScope,
            suppressLedgerShadow: true,
          },
        )
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: EXACT_CANONICAL_OWNER_QUARANTINED_CODE,
      });
      expect(materialize).not.toHaveBeenCalled();
      expect(recordDecisions).not.toHaveBeenCalled();
      expect(prisma.guestGameEvent.findFirst).toHaveBeenCalledTimes(1);
    });

    it('skips rewards and decisions for exact canonicalization of an existing event', async () => {
      const { service, prisma } = createService();
      const profile = profileFixture();
      const canonicalEvent = eventResult({
        id: 'event-exact-existing',
        eventType: 'PLAY_HOUR',
        xpDelta: 0,
        occurredAt: now as unknown as string,
        createdAt: now as unknown as string,
      });
      jest.spyOn(service as any, 'ensureProcessProfile').mockResolvedValue({
        profile,
        profileCreated: false,
      });
      jest.spyOn(service, 'dryRun').mockResolvedValue(
        dryRunResult({
          eventType: 'PLAY_HOUR',
          summary: {
            checkedRules: 0,
            eligibleRules: 0,
            blockedRules: 0,
            estimatedRewardAmount: 0,
            projectedXpDelta: 0,
          },
        }),
      );
      prisma.guestGameEvent.findFirst.mockResolvedValue(canonicalEvent);
      const findRewards = jest.spyOn(
        service as any,
        'findProcessRewardsByReference',
      );
      const materialize = jest.spyOn(
        service as any,
        'materializeProcessRewardIntents',
      );
      const recordDecisions = jest.spyOn(service, 'recordRuleDecisions');

      const result = await service.processEvent(
        user,
        {
          profileId: profile.id,
          eventType: 'PLAY_HOUR',
          sourceFactKind: 'GUEST_SESSION',
          sourceFactId: 'fact-exact-existing',
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: 'club-1',
          externalId: 'session-exact-existing',
        },
        {
          allowedRuleIds: [],
          materializeRewards: false,
          originKey: 'origin-exact-existing',
          suppressLedgerShadow: true,
        },
      );

      expect(result).toMatchObject({
        rewards: [],
        summary: {
          appliedXpDelta: 0,
          createdRewards: 0,
          idempotent: true,
        },
      });
      expect(findRewards).not.toHaveBeenCalled();
      expect(materialize).not.toHaveBeenCalled();
      expect(recordDecisions).not.toHaveBeenCalled();
    });

    it('skips rewards and decisions for an exact canonicalization conflict recovery', async () => {
      const { service, prisma } = createService();
      const profile = profileFixture();
      const duplicateEvent = eventResult({
        id: 'event-exact-conflict',
        eventType: 'PLAY_HOUR',
        xpDelta: 0,
        occurredAt: now as unknown as string,
        createdAt: now as unknown as string,
      });
      jest.spyOn(service as any, 'ensureProcessProfile').mockResolvedValue({
        profile,
        profileCreated: false,
      });
      jest.spyOn(service, 'dryRun').mockResolvedValue(
        dryRunResult({
          eventType: 'PLAY_HOUR',
          summary: {
            checkedRules: 0,
            eligibleRules: 0,
            blockedRules: 0,
            estimatedRewardAmount: 0,
            projectedXpDelta: 0,
          },
        }),
      );
      prisma.guestGameEvent.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(duplicateEvent);
      jest
        .spyOn(service as any, 'createProcessEvent')
        .mockRejectedValue(new ConflictException('duplicate'));
      const findRewards = jest.spyOn(
        service as any,
        'findProcessRewardsByReference',
      );
      const materialize = jest.spyOn(
        service as any,
        'materializeProcessRewardIntents',
      );
      const recordDecisions = jest.spyOn(service, 'recordRuleDecisions');

      const result = await service.processEvent(
        user,
        {
          profileId: profile.id,
          eventType: 'PLAY_HOUR',
          sourceFactKind: 'GUEST_SESSION',
          sourceFactId: 'fact-exact-conflict',
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: 'club-1',
          externalId: 'session-exact-conflict',
        },
        {
          allowedRuleIds: [],
          materializeRewards: false,
          originKey: 'origin-exact-conflict',
          suppressLedgerShadow: true,
        },
      );

      expect(result).toMatchObject({
        event: { id: 'event-exact-conflict' },
        rewards: [],
        summary: {
          appliedXpDelta: 0,
          createdRewards: 0,
          idempotent: true,
        },
      });
      expect(findRewards).not.toHaveBeenCalled();
      expect(materialize).not.toHaveBeenCalled();
      expect(recordDecisions).not.toHaveBeenCalled();
    });

    it('skips rewards and decisions when exact canonicalization creates a new event', async () => {
      const { service, prisma } = createService();
      const profile = profileFixture();
      const createdEvent = eventResult({
        id: 'event-exact-new',
        eventType: 'PLAY_HOUR',
        xpDelta: 0,
        occurredAt: now as unknown as string,
        createdAt: now as unknown as string,
      });
      jest.spyOn(service as any, 'ensureProcessProfile').mockResolvedValue({
        profile,
        profileCreated: false,
      });
      jest.spyOn(service, 'dryRun').mockResolvedValue(
        dryRunResult({
          eventType: 'PLAY_HOUR',
          summary: {
            checkedRules: 1,
            eligibleRules: 1,
            blockedRules: 0,
            estimatedRewardAmount: 50,
            projectedXpDelta: 30,
          },
        }),
      );
      prisma.guestGameEvent.findFirst.mockResolvedValue(null);
      const createProcessEvent = jest
        .spyOn(service as any, 'createProcessEvent')
        .mockResolvedValue(createdEvent);
      const findRewards = jest.spyOn(
        service as any,
        'findProcessRewardsByReference',
      );
      const materialize = jest.spyOn(
        service as any,
        'materializeProcessRewardIntents',
      );
      const recordDecisions = jest.spyOn(service, 'recordRuleDecisions');

      const result = await service.processEvent(
        user,
        {
          profileId: profile.id,
          eventType: 'PLAY_HOUR',
          sourceFactKind: 'GUEST_SESSION',
          sourceFactId: 'fact-exact-new',
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: 'club-1',
          externalId: 'session-exact-new',
        },
        {
          allowedRuleIds: [],
          materializeRewards: false,
          originKey: 'origin-exact-new',
          suppressLedgerShadow: true,
        },
      );

      expect(result).toMatchObject({
        event: { id: 'event-exact-new' },
        rewards: [],
        summary: {
          appliedXpDelta: 0,
          createdRewards: 0,
          idempotent: false,
        },
      });
      expect(findRewards).not.toHaveBeenCalled();
      expect(materialize).not.toHaveBeenCalled();
      expect(recordDecisions).not.toHaveBeenCalled();
      expect(prisma.guestGameRewardIntent.upsert).not.toHaveBeenCalled();
      expect(createProcessEvent).toHaveBeenCalledWith(
        user,
        expect.objectContaining({ xpDelta: 0 }),
        'origin-exact-new',
      );
      const exactCreateInput = createProcessEvent.mock.calls[0]?.[1] as {
        payload?: Record<string, unknown>;
      };
      expect(exactCreateInput.payload).not.toHaveProperty('rules');
      expect(exactCreateInput.payload).not.toHaveProperty('rewardIntents');
    });

    it('fails closed without writing when replay has no canonical event', async () => {
      const { service, prisma } = createService();
      const profile = profileFixture();
      const stepRun = battlePassDryRun();

      jest.spyOn(service as any, 'ensureProcessProfile').mockResolvedValue({
        profile,
        profileCreated: false,
      });
      jest.spyOn(service, 'dryRun').mockResolvedValue(stepRun);
      prisma.guestGameEvent.findFirst.mockResolvedValue(null);
      const createEvent = jest.spyOn(service as any, 'createProcessEvent');

      await expect(
        service.processEvent(
          user,
          {
            profileId: profile.id,
            guestId: 'guest-1',
            eventType: 'PLAY_HOUR',
            sourceFactKind: 'GUEST_SESSION',
            sourceFactId: 'fact-270',
            externalProvider: IntegrationProvider.LANGAME,
            externalDomain: 'club-1',
            externalId: 'session-270',
          },
          {
            originKey: 'origin-replay',
            evaluationMode: 'LIVE_LEDGER_FALLBACK',
            replayRewardScope: {
              ruleKind: 'SEASON',
              ruleId: 'season-1',
              battlePassStep: 2,
              stepId: 'step-2',
              sourceFactId: 'fact-270',
              sourceFactUpdatedAt: now,
              seasonUpdatedAt: now,
              confirmationHash: 'confirmation-hash',
            },
          },
        ),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(createEvent).not.toHaveBeenCalled();
      expect(prisma.guestGameRewardIntent.upsert).not.toHaveBeenCalled();
    });

    it('persists the replay intent and sanitized audit through the same transaction client', async () => {
      const { service, prisma } = createService();
      const transactionClient = {
        $queryRaw: jest
          .fn()
          .mockResolvedValueOnce([{ id: 'fact-270', updatedAt: now }])
          .mockResolvedValueOnce([{ id: 'season-1', updatedAt: now }]),
        guestGameRewardIntent: {
          upsert: jest.fn().mockImplementation(({ create }) =>
            Promise.resolve({
              id: 'intent-selected',
              ...create,
            }),
          ),
        },
        guestGameAuditEvent: {
          create: jest.fn().mockResolvedValue({ id: 'audit-replay-1' }),
        },
      };
      let transactionCommitted = false;
      prisma.$transaction.mockImplementationOnce(async (operation) => {
        const result = await operation(transactionClient);
        transactionCommitted = true;
        return result;
      });

      const result = await (service as any).persistReplayRewardIntent(
        user,
        battlePassDryRun(),
        'event-existing',
        'profile-1',
        'origin-replay',
        {
          ruleKind: 'SEASON',
          ruleId: 'season-1',
          battlePassStep: 2,
          stepId: 'step-2',
          sourceFactId: 'fact-270',
          sourceFactUpdatedAt: now,
          seasonUpdatedAt: now,
          confirmationHash: 'confirmation-hash',
        },
      );

      expect(result).toEqual(['intent-selected']);
      expect(transactionCommitted).toBe(true);
      expect(transactionClient.guestGameRewardIntent.upsert).toHaveBeenCalled();
      expect(transactionClient.guestGameAuditEvent.create).toHaveBeenCalledWith(
        {
          data: {
            tenantId: user.tenantId,
            profileId: 'profile-1',
            guestId: 'guest-1',
            storeId: null,
            entityType: 'GUEST_GAME_REWARD_INTENT',
            entityId: 'intent-selected',
            action: 'RULE_REPLAY',
            status: 'INTENT_PERSISTED',
            reasonCode: 'BATTLE_PASS_STEP_REPLAY',
            reasonText:
              'Точечный replay шага Battle Pass подтверждён оператором.',
            payload: {
              actorUserId: user.id,
              sourceFactId: 'fact-270',
              ruleKind: 'SEASON',
              ruleId: 'season-1',
              battlePassStep: 2,
              stepId: 'step-2',
              confirmationHash: 'confirmation-hash',
              eventId: 'event-existing',
              intentIds: ['intent-selected'],
            },
          },
        },
      );
      expect(
        transactionClient.guestGameRewardIntent.upsert.mock
          .invocationCallOrder[0],
      ).toBeLessThan(
        transactionClient.guestGameAuditEvent.create.mock
          .invocationCallOrder[0],
      );
      expect(prisma.guestGameAuditEvent.create).not.toHaveBeenCalled();
    });

    it('fails closed before replay writes when a locked source version changed', async () => {
      const { service, prisma } = createService();
      const transactionClient = {
        $queryRaw: jest
          .fn()
          .mockResolvedValueOnce([
            { id: 'fact-270', updatedAt: new Date(now.getTime() + 1) },
          ])
          .mockResolvedValueOnce([{ id: 'season-1', updatedAt: now }]),
        guestGameRewardIntent: {
          upsert: jest.fn(),
        },
        guestGameAuditEvent: {
          create: jest.fn(),
        },
      };
      prisma.$transaction.mockImplementationOnce((operation) =>
        operation(transactionClient),
      );

      await expect(
        (service as any).persistReplayRewardIntent(
          user,
          battlePassDryRun(),
          'event-existing',
          'profile-1',
          'origin-replay',
          {
            ruleKind: 'SEASON',
            ruleId: 'season-1',
            battlePassStep: 2,
            stepId: 'step-2',
            sourceFactId: 'fact-270',
            sourceFactUpdatedAt: now,
            seasonUpdatedAt: now,
            confirmationHash: 'confirmation-hash',
          },
        ),
      ).rejects.toThrow('Факт или сезон изменились после preview');

      expect(
        transactionClient.guestGameRewardIntent.upsert,
      ).not.toHaveBeenCalled();
      expect(
        transactionClient.guestGameAuditEvent.create,
      ).not.toHaveBeenCalled();
    });

    it('fails closed before materialization when the atomic replay audit write fails', async () => {
      const { service, prisma } = createService();
      const profile = profileFixture();
      const canonicalEvent = eventResult({
        id: 'event-existing',
        eventType: 'PLAY_HOUR',
        xpDelta: 0,
        occurredAt: now as unknown as string,
        createdAt: now as unknown as string,
      });
      const transactionClient = {
        $queryRaw: jest
          .fn()
          .mockResolvedValueOnce([{ id: 'fact-270', updatedAt: now }])
          .mockResolvedValueOnce([{ id: 'season-1', updatedAt: now }]),
        guestGameRewardIntent: {
          upsert: jest.fn().mockImplementation(({ create }) =>
            Promise.resolve({
              id: 'intent-selected',
              ...create,
            }),
          ),
        },
        guestGameAuditEvent: {
          create: jest.fn().mockRejectedValue(new Error('audit unavailable')),
        },
      };
      let transactionCommitted = false;
      prisma.$transaction.mockImplementationOnce(async (operation) => {
        const result = await operation(transactionClient);
        transactionCommitted = true;
        return result;
      });
      jest.spyOn(service as any, 'ensureProcessProfile').mockResolvedValue({
        profile,
        profileCreated: false,
      });
      jest.spyOn(service, 'dryRun').mockResolvedValue(battlePassDryRun());
      prisma.guestGameEvent.findFirst.mockResolvedValue(canonicalEvent);
      const materialize = jest.spyOn(
        service as any,
        'materializeProcessRewardIntents',
      );
      const recordDecisions = jest.spyOn(service, 'recordRuleDecisions');

      await expect(
        service.processEvent(
          user,
          {
            profileId: profile.id,
            guestId: 'guest-1',
            eventType: 'PLAY_HOUR',
            sourceFactKind: 'GUEST_SESSION',
            sourceFactId: 'fact-270',
            externalProvider: IntegrationProvider.LANGAME,
            externalDomain: 'club-1',
            externalId: 'session-270',
          },
          {
            originKey: 'origin-replay',
            evaluationMode: 'LIVE_LEDGER_FALLBACK',
            replayRewardScope: {
              ruleKind: 'SEASON',
              ruleId: 'season-1',
              battlePassStep: 2,
              stepId: 'step-2',
              sourceFactId: 'fact-270',
              sourceFactUpdatedAt: now,
              seasonUpdatedAt: now,
              confirmationHash: 'confirmation-hash',
            },
          },
        ),
      ).rejects.toThrow('audit unavailable');

      expect(transactionClient.guestGameRewardIntent.upsert).toHaveBeenCalled();
      expect(transactionClient.guestGameAuditEvent.create).toHaveBeenCalled();
      expect(transactionCommitted).toBe(false);
      expect(materialize).not.toHaveBeenCalled();
      expect(recordDecisions).not.toHaveBeenCalled();
    });

    it('uses the Battle Pass step slot in reward external ids', async () => {
      const { service } = createService();
      const createReward = jest
        .spyOn(service as any, 'createReward')
        .mockResolvedValueOnce(rewardResult({ id: 'reward-step-2' }))
        .mockResolvedValueOnce(rewardResult({ id: 'reward-step-3' }));
      const eventExternalId = 'guest-game:GUEST_SESSION:PLAY_HOUR:session-270';
      const eventReference = {
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: 'club-1',
        externalId: eventExternalId,
      };

      for (const step of [2, 3]) {
        await (service as any).createProcessRewards(
          user,
          {
            eventType: 'PLAY_HOUR',
            sourceFactKind: 'GUEST_SESSION',
            sourceFactId: 'fact-270',
          },
          battlePassDryRun(step),
          'profile-1',
          eventReference,
          'origin-replay',
        );
      }

      expect(createReward.mock.calls.map((call) => call[1].externalId)).toEqual(
        [
          `${eventExternalId}:reward:SEASON:season-1:2:BATTLE_PASS_REWARD`,
          `${eventExternalId}:reward:SEASON:season-1:3:BATTLE_PASS_REWARD`,
        ],
      );
    });

    it('fails closed when the scoped Battle Pass step changes before materialization', async () => {
      const { service, prisma } = createService();
      const profile = profileFixture();
      const nextStepDryRun = battlePassDryRun(3);

      jest.spyOn(service as any, 'ensureProcessProfile').mockResolvedValue({
        profile,
        profileCreated: false,
      });
      jest.spyOn(service, 'dryRun').mockResolvedValue(nextStepDryRun);
      prisma.guestGameEvent.findFirst.mockResolvedValue(null);
      const createProcessEvent = jest
        .spyOn(service as any, 'createProcessEvent')
        .mockResolvedValue(eventResult({ eventType: 'PLAY_HOUR', xpDelta: 0 }));
      const materialize = jest
        .spyOn(service as any, 'materializeProcessRewardIntents')
        .mockImplementation(
          (
            _user: unknown,
            _dto: unknown,
            scopedDryRun: GuestGameDryRunResult,
          ) => Promise.resolve({ dryRun: scopedDryRun, rewards: [] }),
        );

      const result = await service.processEvent(
        user,
        {
          profileId: profile.id,
          guestId: 'guest-1',
          eventType: 'PLAY_HOUR',
          sourceFactKind: 'GUEST_SESSION',
          sourceFactId: 'fact-step-race',
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: 'club-1',
          externalId: 'session-step-race',
        },
        {
          evaluationMode: 'LIVE_LEDGER_FALLBACK',
          allowedRuleIds: ['season-1'],
          allowedBattlePassSteps: new Map([['season-1', 2]]),
          originKey: 'origin-step-race',
          suppressLedgerShadow: true,
        },
      );

      expect(materialize).toHaveBeenCalledWith(
        user,
        expect.any(Object),
        expect.objectContaining({ rules: [] }),
        expect.any(Object),
        profile.id,
        expect.any(Object),
        'origin-step-race',
      );
      expect(createProcessEvent).toHaveBeenCalledWith(
        user,
        expect.objectContaining({ xpDelta: 0 }),
        'origin-step-race',
      );
      expect(result).toMatchObject({
        dryRun: { rules: [] },
        rewards: [],
        summary: { createdRewards: 0, appliedXpDelta: 0 },
      });
    });

    it('uses the generated idempotency key and keeps Langame writes disabled', async () => {
      const { service, prisma } = createService();
      const profile = profileFixture();
      const recordDecisionsSpy = jest.spyOn(service, 'recordRuleDecisions');

      jest.spyOn(service as any, 'ensureProcessProfile').mockResolvedValue({
        profile,
        profileCreated: false,
      });
      jest.spyOn(service, 'dryRun').mockResolvedValue(dryRunResult());
      jest
        .spyOn(service as any, 'createProcessEvent')
        .mockResolvedValue(eventResult());
      jest
        .spyOn(service as any, 'materializeProcessRewardIntents')
        .mockResolvedValue({
          dryRun: dryRunResult(),
          rewards: [rewardResult()],
        });

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
        undefined,
      );
      expect((service as any).createProcessEvent).toHaveBeenCalledWith(
        user,
        expect.objectContaining({
          externalId: 'guest-game:GUEST_SESSION:SESSION_START:session-1',
          xpDelta: 30,
          source: 'API_IMPORT',
        }),
        sessionOriginKey,
      );
      expect(result.summary).toMatchObject({
        profileCreated: false,
        appliedXpDelta: 30,
        createdRewards: 1,
        queuedRewardAmount: 50,
        idempotencyKey: sessionOriginKey,
        langameWrite: false,
      });
      expect(recordDecisionsSpy).toHaveBeenCalledWith(
        user,
        expect.any(Object),
        expect.objectContaining({
          eventId: 'event-1',
          excludeSeasonRewardIds: ['reward-1'],
        }),
      );
      expect(prisma.guestGameRuleDecision.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            tenantId: user.tenantId,
            profileId: profile.id,
            guestId: 'guest-1',
            eventId: 'event-1',
            ruleType: 'MISSION',
            ruleId: 'mission-1',
            triggerKind: 'SESSION_START',
            sourceEventType: 'SESSION_START',
            sourceFactId: 'fact-1',
            sourceFactKind: 'GUEST_SESSION',
            status: 'MATCHED',
          }),
        ],
      });
    });

    it('routes primary, supplemental and fallback rules into disjoint execution lanes', async () => {
      const { service } = createService();
      const profile = profileFixture();
      const baseRule = dryRunResult().rules[0];
      const routedRun = dryRunResult({
        rules: [
          {
            ...baseRule,
            id: 'mission-primary',
            evaluationPolicy: 'LIVE_PRIMARY',
          },
          {
            ...baseRule,
            id: 'mission-fallback',
            evaluationPolicy: 'LIVE_WITH_LEDGER_FALLBACK',
          },
          {
            ...baseRule,
            id: 'mission-supplemental',
            evaluationPolicy: 'LEDGER_SUPPLEMENTAL',
          },
        ],
      });

      jest.spyOn(service as any, 'ensureProcessProfile').mockResolvedValue({
        profile,
        profileCreated: false,
      });
      jest.spyOn(service, 'dryRun').mockResolvedValue(routedRun);
      jest
        .spyOn(service as any, 'createProcessEvent')
        .mockResolvedValue(eventResult());
      const createProcessEvent = jest.spyOn(
        service as any,
        'createProcessEvent',
      );

      const dto = {
        eventType: 'SESSION_START',
        sourceFactKind: 'GUEST_SESSION',
        sourceFactId: 'fact-router',
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: 'club-1',
      };
      await service.processEvent(user, { ...dto, externalId: 'live-1' });
      await service.processEvent(
        user,
        { ...dto, externalId: 'supplemental-1' },
        { evaluationMode: 'LIVE_SUPPLEMENTAL' },
      );
      await service.processEvent(
        user,
        { ...dto, externalId: 'fallback-1' },
        { evaluationMode: 'LIVE_LEDGER_FALLBACK' },
      );

      expect(
        createProcessEvent.mock.calls.map((call) =>
          call[1].payload.rewardIntents.map(
            (intent: { rule: { id: string } }) => intent.rule.id,
          ),
        ),
      ).toEqual([
        ['mission-primary', 'mission-fallback'],
        ['mission-supplemental'],
        ['mission-fallback'],
      ]);
    });

    it('records session-start unlocks without queuing lootbox rewards when suppressed', async () => {
      const { prisma, service } = createService();
      const profile = profileFixture();
      prisma.guestGameLootBox.findFirst.mockResolvedValue({
        id: 'loot-box-1',
        limits: {},
      });
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

      expect(createRewardsSpy).not.toHaveBeenCalled();
      expect((service as any).createProcessEvent).toHaveBeenCalledWith(
        user,
        expect.objectContaining({
          payload: expect.objectContaining({
            rewardIntents: [],
            summary: expect.objectContaining({
              eligibleRules: 1,
              blockedRules: 0,
              estimatedRewardAmount: 100,
              projectedXpDelta: 0,
            }),
            rules: [
              expect.objectContaining({
                id: 'loot-box-1',
                kind: 'LOOT_BOX',
                eligible: true,
                blockers: [],
                reasons: expect.arrayContaining([
                  'Условие лутбокса выполнено: создано только право на ручное открытие.',
                ]),
              }),
            ],
          }),
        }),
        sessionOriginKey,
      );
      expect(prisma.guestGameEntitlement.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            eventId: 'event-1',
            profileId: profile.id,
            ruleId: 'loot-box-1',
            ruleType: 'LOOT_BOX',
            status: 'AVAILABLE',
            validUntil: null,
          }),
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
            eligibleRules: 1,
            blockedRules: 0,
            estimatedRewardAmount: 100,
          },
          rules: [
            expect.objectContaining({
              id: 'loot-box-1',
              eligible: true,
              rewardMaterializationSuppressed: true,
            }),
          ],
        },
      });
    });

    it('recovers a daily entitlement once using the immutable canonical event period', async () => {
      const { prisma, service } = createService();
      const profile = profileFixture();
      prisma.guestGameLootBox.findFirst.mockResolvedValue({
        id: 'loot-box-1',
        limits: { periodicLimit: 'DAILY' },
      });
      const canonicalOccurredAt = new Date('2026-06-10T18:55:00.000Z');
      const lootBoxDryRun = dryRunResult({
        occurredAt: '2026-06-10T19:05:00.000Z',
        store: {
          id: 'store-1',
          name: 'Club',
          timeZone: 'Asia/Yekaterinburg',
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
            periodicLimitPeriod: 'DAILY',
          },
        ],
      });
      const existingEvent = {
        ...eventResult({
          id: 'event-existing',
          payload: {
            processSchemaVersion: 2,
            source: 'guest_gamification_process_event',
            store: lootBoxDryRun.store,
            input: lootBoxDryRun.input,
            rules: lootBoxDryRun.rules,
          },
        }),
        profileId: profile.id,
        guestId: 'guest-1',
        occurredAt: canonicalOccurredAt,
        createdAt: now,
      } as any;
      const createEventSpy = jest.spyOn(service as any, 'createProcessEvent');
      const createRewardsSpy = jest.spyOn(
        service as any,
        'createProcessRewards',
      );

      jest.spyOn(service as any, 'ensureProcessProfile').mockResolvedValue({
        profile,
        profileCreated: false,
      });
      jest.spyOn(service, 'dryRun').mockResolvedValue(lootBoxDryRun);
      prisma.guestGameEvent.findFirst.mockResolvedValue(existingEvent);
      prisma.guestGameEntitlement.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ ruleId: 'loot-box-1' }]);

      const dto = {
        profileId: profile.id,
        guestId: 'guest-1',
        eventType: 'SESSION_START',
        sourceFactKind: 'GUEST_SESSION',
        sourceFactId: 'session-1',
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: 'club-1',
        externalId: 'session-1',
        suppressLootBoxRewards: true,
      } as const;
      const result = await service.processEvent(user, dto);
      const repeated = await service.processEvent(user, dto);

      expect(createEventSpy).not.toHaveBeenCalled();
      expect(createRewardsSpy).not.toHaveBeenCalled();
      expect(prisma.guestGameRuleDecision.createMany).toHaveBeenCalledTimes(1);
      expect(
        prisma.guestGameRuleDecision.createMany.mock.calls[0][0].data[0],
      ).toMatchObject({
        eventId: existingEvent.id,
        evaluationRunId: `loot-box-entitlement-recovery:${existingEvent.id}`,
        evaluationMode: 'LIVE_LOOT_BOX_RECOVERY',
        input: expect.objectContaining({
          occurredAt: canonicalOccurredAt.toISOString(),
        }),
      });
      expect(prisma.guestGameEntitlement.upsert).toHaveBeenCalledTimes(1);
      expect(prisma.guestGameEntitlement.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenantId_idempotencyKey: {
              tenantId: user.tenantId,
              idempotencyKey: 'loot-box:loot-box-1:daily:profile-1:2026-06-10',
            },
          },
          create: expect.objectContaining({
            eventId: existingEvent.id,
            profileId: profile.id,
            ruleId: 'loot-box-1',
            status: 'AVAILABLE',
            qualifiedAt: canonicalOccurredAt,
            evidence: expect.objectContaining({
              evaluationMode: 'LIVE_LOOT_BOX_RECOVERY',
              entitlementPeriod: expect.objectContaining({
                key: '2026-06-10',
                periodEndsAt: '2026-06-10T19:00:00.000Z',
              }),
            }),
          }),
        }),
      );
      expect(result).toMatchObject({
        rewards: [],
        summary: {
          idempotent: true,
          createdRewards: 0,
          queuedRewardAmount: 0,
        },
        dryRun: {
          rules: [
            expect.objectContaining({
              id: 'loot-box-1',
              eligible: true,
              rewardMaterializationSuppressed: true,
            }),
          ],
        },
      });
      expect(repeated.summary).toMatchObject({
        idempotent: true,
        createdRewards: 0,
      });
    });

    it('fails closed when an existing event has no immutable matched lootbox evidence', async () => {
      const { prisma, service } = createService();
      const profile = profileFixture();
      const retryDryRun = dryRunResult({
        occurredAt: '2026-06-11T08:00:00.000Z',
        rules: [
          {
            ...dryRunResult().rules[0],
            id: 'loot-box-changed',
            kind: 'LOOT_BOX',
            eligible: true,
            periodicLimitPeriod: 'DAILY',
          },
        ],
      });

      jest.spyOn(service as any, 'ensureProcessProfile').mockResolvedValue({
        profile,
        profileCreated: false,
      });
      jest.spyOn(service, 'dryRun').mockResolvedValue(retryDryRun);
      prisma.guestGameEvent.findFirst.mockResolvedValue({
        ...eventResult({
          id: 'event-without-rule-snapshot',
          payload: {
            processSchemaVersion: 2,
            source: 'guest_gamification_process_event',
            store: retryDryRun.store,
            input: retryDryRun.input,
          },
        }),
        occurredAt: new Date('2026-06-10T08:00:00.000Z'),
        createdAt: now,
      });

      const result = await service.processEvent(user, {
        profileId: profile.id,
        guestId: 'guest-1',
        eventType: 'SESSION_START',
        sourceFactKind: 'GUEST_SESSION',
        sourceFactId: 'session-changed',
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: 'club-1',
        externalId: 'session-changed',
        suppressLootBoxRewards: true,
      });

      expect(prisma.guestGameEntitlement.findMany).not.toHaveBeenCalled();
      expect(prisma.guestGameEntitlement.upsert).not.toHaveBeenCalled();
      expect(prisma.guestGameRuleDecision.createMany).not.toHaveBeenCalled();
      expect(result.summary).toMatchObject({
        idempotent: true,
        createdRewards: 0,
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
            originKey: sessionOriginKey,
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
          idempotencyKey: sessionOriginKey,
          idempotent: true,
          langameWrite: false,
        },
      });
    });

    it('falls back to the legacy external reference for pre-origin events and rewards', async () => {
      const { service, prisma } = createService();
      const profile = profileFixture();
      const legacyExternalId =
        'guest-game:GUEST_SESSION:SESSION_START:session-1';

      jest.spyOn(service as any, 'ensureProcessProfile').mockResolvedValue({
        profile,
        profileCreated: false,
      });
      jest.spyOn(service, 'dryRun').mockResolvedValue(noRewardDryRunResult());
      prisma.guestGameEvent.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'event-legacy',
          eventType: 'SESSION_START',
          source: 'API_IMPORT',
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: 'club-1',
          externalId: legacyExternalId,
          originKey: null,
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
          guest: null,
          lootBox: null,
          mission: null,
          season: null,
          createdByUser: null,
        });
      prisma.guestGameReward.findMany.mockResolvedValue([]);

      const result = await service.processEvent(user, {
        eventType: 'SESSION_START',
        sourceFactKind: 'GUEST_SESSION',
        sourceFactId: 'fact-1',
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: 'club-1',
        externalId: 'session-1',
      });

      expect(prisma.guestGameEvent.findFirst).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: { tenantId: user.tenantId, originKey: sessionOriginKey },
        }),
      );
      expect(prisma.guestGameEvent.findFirst).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: user.tenantId,
            externalProvider: IntegrationProvider.LANGAME,
            externalDomain: 'club-1',
            externalId: legacyExternalId,
          }),
        }),
      );
      expect(prisma.guestGameReward.findMany).toHaveBeenCalledTimes(2);
      expect(result).toMatchObject({
        event: { id: 'event-legacy' },
        summary: {
          idempotencyKey: sessionOriginKey,
          idempotent: true,
          createdRewards: 0,
        },
      });
    });

    it('recovers a loot box reward from the persisted immutable intent instead of rerolling it', async () => {
      const { service, prisma } = createService();
      const profile = profileFixture();
      const eventExternalId =
        'guest-game:GUEST_LOOT_BOX_OPEN:APP_OPEN:loot-open-1';
      const repairedReward = rewardResult({
        id: 'reward-loot-repaired',
        externalDomain: 'leetplus-game-app-open',
        externalId: `${eventExternalId}:reward:LOOT_BOX:loot-box-1`,
        rewardType: 'BONUS_BALANCE',
        rewardLabel: 'Stored rare prize',
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
              rewardAmount: 500,
              rewardLabel: 'Fresh rerolled prize',
              selectedRewardLabel: 'Fresh rerolled prize',
              selectedReward: {
                rewardType: 'BONUS_BALANCE',
                rewardAmount: 500,
                rewardLabel: 'Fresh rerolled prize',
                weight: 1,
                chancePercent: 1,
                rewardRarity: 'legendary',
                rewardRarityLabel: 'Legendary',
              },
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
      prisma.guestGameRewardIntent.findMany.mockResolvedValue([
        {
          id: 'intent-loot-1',
          createdAt: now,
          plan: {
            schemaVersion: 1,
            qualifiedAt: isoNow,
            slotKey: 'BONUS_BALANCE',
            claimKey: null,
            rule: {
              id: 'loot-box-1',
              kind: 'LOOT_BOX',
              name: 'Auto loot box',
              status: 'ACTIVE',
              triggerKind: 'APP_OPEN',
              evaluationPolicy: 'LIVE_PRIMARY',
              manualApprovalRequired: false,
              eligible: true,
              rewardType: 'BONUS_BALANCE',
              rewardAmount: 50,
              rewardLabel: 'Stored rare prize',
              selectedRewardLabel: 'Stored rare prize',
              selectedReward: {
                rewardType: 'BONUS_BALANCE',
                rewardAmount: 50,
                rewardLabel: 'Stored rare prize',
                weight: 10,
                chancePercent: 10,
                rewardRarity: 'rare',
                rewardRarityLabel: 'Rare',
              },
              xpDelta: 0,
              budgetAmount: null,
              battlePassLevel: null,
              battlePassStep: null,
              battlePassStepTitle: null,
              periodicLimitPeriod: null,
              reasons: ['matched when the event was accepted'],
              blockers: [],
            },
          },
        },
      ]);

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
        expect.objectContaining({
          eventType: 'APP_OPEN',
          rules: [
            expect.objectContaining({
              id: 'loot-box-1',
              rewardLabel: 'Stored rare prize',
              selectedReward: expect.objectContaining({
                rewardAmount: 50,
                rewardLabel: 'Stored rare prize',
                rewardRarity: 'rare',
              }),
            }),
          ],
        }),
        profile.id,
        expect.objectContaining({
          externalId: eventExternalId,
          externalDomain: 'leetplus-game-app-open',
        }),
        null,
        expect.any(Map),
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

    it('does not reevaluate a legacy event without a persisted reward intent', async () => {
      const { service, prisma } = createService();
      const profile = profileFixture();
      const eventExternalId =
        'guest-game:GUEST_SESSION:SESSION_START:session-1';
      const createRewardsSpy = jest.spyOn(
        service as any,
        'createProcessRewards',
      );
      const recordDecisionsSpy = jest.spyOn(service, 'recordRuleDecisions');

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
      prisma.guestGameEvent.findFirst.mockResolvedValue(
        eventResult({
          id: 'event-existing',
          externalId: eventExternalId,
          occurredAt: now as unknown as string,
          createdAt: now as unknown as string,
        }),
      );
      prisma.guestGameReward.findMany.mockResolvedValue([]);
      prisma.guestGameRewardIntent.findMany.mockResolvedValue([]);

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

      expect(createRewardsSpy).not.toHaveBeenCalled();
      expect(recordDecisionsSpy).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        processed: true,
        event: { id: 'event-existing' },
        rewards: [],
        summary: {
          createdRewards: 0,
          queuedRewardAmount: 0,
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
          idempotencyKey: sessionOriginKey,
          idempotent: true,
          langameWrite: false,
        },
      });
    });

    it('recovers the original Battle Pass step from its persisted intent after a parallel conflict', async () => {
      const { service, prisma } = createService();
      const profile = profileFixture();
      const eventExternalId =
        'guest-game:GUEST_SESSION:SESSION_START:session-1';
      const repairedReward = rewardResult({
        id: 'reward-season-repaired',
        externalId: `${eventExternalId}:reward:SEASON:season-1`,
        rewardType: 'BATTLE_PASS_REWARD',
        rewardAmount: 0,
        rewardLabel: 'Original step reward',
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
              rewardLabel: 'Next step reward',
              selectedRewardLabel: 'Next step reward',
              manualApprovalRequired: false,
              battlePassLevel: 3,
              battlePassStep: 3,
              battlePassStepTitle: 'Next step',
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
      prisma.guestGameRewardIntent.findMany.mockResolvedValue([
        {
          id: 'intent-season-step-2',
          createdAt: now,
          plan: {
            schemaVersion: 1,
            qualifiedAt: isoNow,
            slotKey: '2:BATTLE_PASS_REWARD',
            claimKey: 'season:season-1:profile:profile-1:step:2',
            rule: {
              id: 'season-1',
              kind: 'SEASON',
              name: 'Club season',
              status: 'ACTIVE',
              triggerKind: 'SESSION_START',
              evaluationPolicy: 'LIVE_PRIMARY',
              manualApprovalRequired: false,
              eligible: true,
              rewardType: 'BATTLE_PASS_REWARD',
              rewardAmount: 0,
              rewardLabel: 'Original step reward',
              selectedRewardLabel: 'Original step reward',
              selectedReward: null,
              xpDelta: 30,
              budgetAmount: null,
              battlePassLevel: 2,
              battlePassStep: 2,
              battlePassStepTitle: 'Hour session',
              periodicLimitPeriod: null,
              reasons: ['step 2 matched when the event was accepted'],
              blockers: [],
            },
          },
        },
      ]);

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
        expect.objectContaining({
          eventType: 'SESSION_START',
          rules: [
            expect.objectContaining({
              id: 'season-1',
              battlePassLevel: 2,
              battlePassStep: 2,
              battlePassStepTitle: 'Hour session',
              rewardLabel: 'Original step reward',
            }),
          ],
        }),
        profile.id,
        expect.objectContaining({
          externalId: eventExternalId,
          externalDomain: 'club-1',
        }),
        sessionOriginKey,
        expect.any(Map),
      );
      expect(result).toMatchObject({
        processed: true,
        event: { id: 'event-existing' },
        rewards: [
          {
            id: 'reward-season-repaired',
            rewardLabel: 'Original step reward',
          },
        ],
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
        expect.any(Object),
      );
    });

    it('records guest lootbox openings at the actual open time for periodic limits', async () => {
      const { service } = createService();
      const unlockedAt = '2026-06-09T08:00:00.000Z';
      const openedAt = '2026-06-10T10:15:00.000Z';
      const baseRule = dryRunResult().rules[0];

      jest.spyOn(service as any, 'createReward').mockResolvedValue(
        rewardResult({
          status: 'APPROVED',
          qualifiedAt: openedAt,
        }),
      );

      await (service as any).createProcessRewards(
        user,
        {
          eventType: 'SESSION_START',
          storeId: 'store-1',
          sourceFactKind: 'GUEST_LOOT_BOX_OPEN',
          limitOccurredAt: openedAt,
        },
        dryRunResult({
          eventType: 'SESSION_START',
          occurredAt: unlockedAt,
          rules: [
            {
              ...baseRule,
              id: 'loot-box-1',
              kind: 'LOOT_BOX',
              name: 'Daily lootbox',
              rewardType: 'BONUS',
              rewardAmount: 50,
              rewardLabel: '50 bonus points',
              selectedRewardLabel: '50 bonus points',
            },
          ],
        }),
        'profile-1',
        {
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: 'club-1',
          externalId: 'loot-open-1',
        },
      );

      expect((service as any).createReward).toHaveBeenCalledWith(
        user,
        expect.objectContaining({
          lootBoxId: 'loot-box-1',
          qualifiedAt: openedAt,
          evidence: expect.objectContaining({
            occurredAt: unlockedAt,
            limitOccurredAt: openedAt,
            qualifiedAt: openedAt,
          }),
        }),
        expect.any(Object),
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
        expect.any(Object),
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
        expect.any(Object),
      );
    });

    it('reconciles the existing reward after a unique conflict without creating another reward', async () => {
      const { service, prisma } = createService();
      const baseRule = dryRunResult().rules[0];
      const existingReward = rewardRow({
        id: 'reward-existing-conflict',
        missionId: 'mission-1',
        status: 'APPROVED',
        rewardType: 'LOOT_BOX_ENTITLEMENT',
        rewardAmount: new Prisma.Decimal(0),
        rewardLabel: 'Reward lootbox',
        mission: {
          id: 'mission-1',
          name: 'Visit mission',
          status: 'ACTIVE',
          missionType: 'VISIT',
          triggerKind: 'SESSION_START',
          xpReward: 30,
          progressUnit: 'VISIT',
        },
      });
      const uniqueError = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        {
          code: 'P2002',
          clientVersion: 'test',
          meta: { target: ['tenantId', 'idempotencyKey'] },
        },
      );
      const createRewardSpy = jest
        .spyOn(service as any, 'createReward')
        .mockRejectedValue(uniqueError);
      const sideEffectReconciliationSpy = jest
        .spyOn(service as any, 'reconcileCreatedRewardSideEffectsById')
        .mockResolvedValue(undefined);

      prisma.guestGameProfile.findFirst.mockResolvedValue(null);
      prisma.guestGameReward.findFirst.mockResolvedValue(existingReward);

      const result = await (service as any).createProcessRewards(
        user,
        {
          eventType: 'SESSION_START',
          storeId: null,
          sourceFactKind: 'GUEST_SESSION',
          sourceFactId: 'session-1',
        },
        dryRunResult({
          rules: [
            {
              ...baseRule,
              rewardType: 'LOOT_BOX_ENTITLEMENT',
              rewardAmount: 0,
              rewardLabel: 'Reward lootbox',
              selectedRewardLabel: 'Reward lootbox',
              manualApprovalRequired: true,
            },
          ],
        }),
        'profile-1',
        {
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: 'club-1',
          externalId: 'session-1',
        },
        sessionOriginKey,
      );

      expect(createRewardSpy).toHaveBeenCalledTimes(1);
      expect(prisma.guestGameReward.create).not.toHaveBeenCalled();
      expect(prisma.guestGameReward.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenantId: user.tenantId,
            idempotencyKey: expect.any(String),
          },
        }),
      );
      expect(sideEffectReconciliationSpy).toHaveBeenCalledWith(
        user,
        existingReward.id,
      );
      expect(result).toEqual([
        expect.objectContaining({
          id: 'reward-existing-conflict',
          rewardType: 'LOOT_BOX_ENTITLEMENT',
        }),
      ]);
    });

    it('uses the persisted intent idempotency key when retrying an originless event', async () => {
      const { service, prisma } = createService();
      const intentIdempotencyKey =
        'guest-game-intent:event-1:MISSION:mission-1:BONUS';
      const existingReward = rewardRow({
        id: 'reward-originless-existing',
        missionId: 'mission-1',
        idempotencyKey: intentIdempotencyKey,
        originKey: null,
      });
      const uniqueError = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        {
          code: 'P2002',
          clientVersion: 'test',
          meta: { target: ['tenantId', 'idempotencyKey'] },
        },
      );
      const createRewardSpy = jest
        .spyOn(service as any, 'createReward')
        .mockRejectedValue(uniqueError);
      const sideEffectReconciliationSpy = jest
        .spyOn(service as any, 'reconcileCreatedRewardSideEffectsById')
        .mockResolvedValue(undefined);

      prisma.guestGameProfile.findFirst.mockResolvedValue(null);
      prisma.guestGameReward.findFirst.mockResolvedValue(existingReward);

      const result = await (service as any).createProcessRewards(
        user,
        {
          eventType: 'SESSION_START',
          storeId: null,
          sourceFactKind: 'GUEST_SESSION',
          sourceFactId: 'originless-session-1',
        },
        dryRunResult(),
        'profile-1',
        null,
        null,
        new Map([['MISSION:mission-1:BONUS', intentIdempotencyKey]]),
      );

      expect(createRewardSpy).toHaveBeenCalledWith(user, expect.any(Object), {
        originKey: null,
        idempotencyKey: intentIdempotencyKey,
      });
      expect(prisma.guestGameReward.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenantId: user.tenantId,
            idempotencyKey: intentIdempotencyKey,
          },
        }),
      );
      expect(sideEffectReconciliationSpy).toHaveBeenCalledWith(
        user,
        existingReward.id,
      );
      expect(result).toEqual([
        expect.objectContaining({ id: 'reward-originless-existing' }),
      ]);
    });
  });

  describe('getSnapshotFacts', () => {
    it('prioritizes sessions updated by the latest Langame synchronization', async () => {
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
      prisma.guestGameEvent.findMany.mockResolvedValue([]);

      await service.getSnapshotFacts(user);

      expect(prisma.guestSession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        }),
      );
    });

    it('does not expose mutable play-time facts before a session is stopped', async () => {
      const { service, prisma } = createService();

      prisma.guestSession.findMany.mockResolvedValue([
        {
          id: 'active-session-60',
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: 'club-1',
          externalSessionId: 'active-session-60',
          externalGuestId: 'guest-external-1',
          startedAt: now,
          stoppedAt: null,
          durationMinutes: 60,
          normalStop: null,
          packet: false,
          guest: {
            id: 'guest-1',
            externalDomain: 'club-1',
            externalGuestId: 'guest-external-1',
            fullNameMasked: 'Guest',
            phoneMasked: '***0646',
            emailMasked: null,
          },
          store: { id: 'store-1', name: 'Club 1' },
        },
      ]);
      prisma.guestLog.findMany.mockResolvedValue([]);
      prisma.guestTransaction.findMany.mockResolvedValue([]);
      prisma.guestOperationLog.findMany.mockResolvedValue([]);
      prisma.guestBalanceSnapshot.findMany.mockResolvedValue([]);
      prisma.guestBonusBalanceSnapshot.findMany.mockResolvedValue([]);
      prisma.guest.findMany.mockResolvedValue([]);
      prisma.guestGroup.findMany.mockResolvedValue([]);
      prisma.salesFact.findMany.mockResolvedValue([]);
      prisma.guestGameEvent.findMany.mockResolvedValue([]);

      const result = await service.getSnapshotFacts(user);

      expect(result.facts.map((fact) => fact.eventType)).toEqual([
        'SESSION_START',
      ]);
    });

    it('waits briefly for a late package marker before canonicalizing session start', async () => {
      const { service, prisma } = createService();
      const recentStart = new Date();
      const session = {
        id: 'late-package-session',
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: 'club-1',
        externalSessionId: 'late-package-session',
        externalGuestId: 'guest-external-1',
        startedAt: recentStart,
        stoppedAt: null,
        durationMinutes: null,
        normalStop: null,
        packet: false,
        guest: {
          id: 'guest-1',
          externalDomain: 'club-1',
          externalGuestId: 'guest-external-1',
          fullNameMasked: 'Guest',
          phoneMasked: '***0646',
          emailMasked: null,
        },
        store: { id: 'store-1', name: 'Club 1' },
      };

      prisma.guestSession.findMany.mockResolvedValue([session]);
      prisma.guestLog.findMany.mockResolvedValue([]);
      prisma.guestTransaction.findMany.mockResolvedValue([]);
      prisma.guestOperationLog.findMany.mockResolvedValue([]);
      prisma.guestBalanceSnapshot.findMany.mockResolvedValue([]);
      prisma.guestBonusBalanceSnapshot.findMany.mockResolvedValue([]);
      prisma.guest.findMany.mockResolvedValue([]);
      prisma.guestGroup.findMany.mockResolvedValue([]);
      prisma.salesFact.findMany.mockResolvedValue([]);
      prisma.guestGameEvent.findMany.mockResolvedValue([]);

      const beforeMarker = await service.getSnapshotFacts(user);
      prisma.guestSession.findMany.mockResolvedValue([
        { ...session, packet: true },
      ]);
      const afterMarker = await service.getSnapshotFacts(user);

      expect(beforeMarker.facts).toEqual([]);
      expect(afterMarker.facts).toEqual([
        expect.objectContaining({
          eventType: 'SESSION_START',
          sessionPacket: true,
          sessionType: 'packet_hours',
        }),
      ]);
    });

    it('exposes final play time after a 30-minute session is stopped', async () => {
      const { service, prisma } = createService();
      const stoppedAt = new Date(now.getTime() + 30 * 60_000);

      prisma.guestSession.findMany.mockResolvedValue([
        {
          id: 'completed-session-30',
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: 'club-1',
          externalSessionId: 'completed-session-30',
          externalGuestId: 'guest-external-1',
          startedAt: now,
          stoppedAt,
          durationMinutes: 30,
          normalStop: true,
          packet: false,
          guest: {
            id: 'guest-1',
            externalDomain: 'club-1',
            externalGuestId: 'guest-external-1',
            fullNameMasked: 'Guest',
            phoneMasked: '***0646',
            emailMasked: null,
          },
          store: { id: 'store-1', name: 'Club 1' },
        },
      ]);
      prisma.guestLog.findMany.mockResolvedValue([]);
      prisma.guestTransaction.findMany.mockResolvedValue([]);
      prisma.guestOperationLog.findMany.mockResolvedValue([]);
      prisma.guestBalanceSnapshot.findMany.mockResolvedValue([]);
      prisma.guestBonusBalanceSnapshot.findMany.mockResolvedValue([]);
      prisma.guest.findMany.mockResolvedValue([]);
      prisma.guestGroup.findMany.mockResolvedValue([]);
      prisma.salesFact.findMany.mockResolvedValue([]);
      prisma.guestGameEvent.findMany.mockResolvedValue([]);

      const result = await service.getSnapshotFacts(user);

      expect(result.facts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'session:completed-session-30:play',
            eventType: 'PLAY_HOUR',
            sessionMinutes: 30,
          }),
        ]),
      );
    });

    it.each([
      ['59 minutes 30 seconds', 59 * 60_000 + 30_000, 60, 59],
      ['30 seconds', 30_000, 1, 0],
    ])(
      'emits terminal play time for %s from the floored raw interval',
      async (_label, elapsedMs, synchronizedMinutes, expectedMinutes) => {
        const { service, prisma } = createService();

        prisma.guestSession.findMany.mockResolvedValue([
          {
            id: 'completed-session-boundary',
            externalProvider: IntegrationProvider.LANGAME,
            externalDomain: 'club-1',
            externalSessionId: 'completed-session-boundary',
            externalGuestId: 'guest-external-1',
            startedAt: now,
            stoppedAt: new Date(now.getTime() + elapsedMs),
            durationMinutes: synchronizedMinutes,
            normalStop: true,
            packet: false,
            guest: {
              id: 'guest-1',
              externalDomain: 'club-1',
              externalGuestId: 'guest-external-1',
              fullNameMasked: 'Guest',
              phoneMasked: '***0646',
              emailMasked: null,
            },
            store: { id: 'store-1', name: 'Club 1' },
          },
        ]);
        prisma.guestLog.findMany.mockResolvedValue([]);
        prisma.guestTransaction.findMany.mockResolvedValue([]);
        prisma.guestOperationLog.findMany.mockResolvedValue([]);
        prisma.guestBalanceSnapshot.findMany.mockResolvedValue([]);
        prisma.guestBonusBalanceSnapshot.findMany.mockResolvedValue([]);
        prisma.guest.findMany.mockResolvedValue([]);
        prisma.guestGroup.findMany.mockResolvedValue([]);
        prisma.salesFact.findMany.mockResolvedValue([]);
        prisma.guestGameEvent.findMany.mockResolvedValue([]);

        const result = await service.getSnapshotFacts(user);

        expect(result.facts).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: 'session:completed-session-boundary:play',
              eventType: 'PLAY_HOUR',
              sessionMinutes: expectedMinutes,
            }),
          ]),
        );
      },
    );

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
    it('scopes profile backfill to the legacy guest and every active identity link', async () => {
      const fixture = createService();
      const { service, prisma, guestIdentityResolver } = fixture;
      enablePrimarySnapshotBackfill(fixture);
      guestIdentityResolver.listActiveGuestIds.mockResolvedValue([
        'guest-domain-2',
        'guest-domain-3',
      ]);
      prisma.$queryRaw.mockResolvedValue([]);

      const policy = await (service as any).snapshotPipelineBackfillPolicy(
        user,
      );
      await (service as any).loadPendingSessionSnapshotFacts(
        user,
        10,
        new Date('2026-06-01T00:00:00.000Z'),
        policy.profileGuestIds,
      );

      expect(policy).toMatchObject({
        enabled: true,
        profileId: 'profile-1',
        profileGuestIds: ['guest-1', 'guest-domain-2', 'guest-domain-3'],
      });
      expect(guestIdentityResolver.listActiveGuestIds).toHaveBeenCalledWith(
        user.tenantId,
        'profile-1',
      );
      const query = prisma.$queryRaw.mock.calls[0][0];
      expect(query.values).toEqual(
        expect.arrayContaining(['guest-1', 'guest-domain-2', 'guest-domain-3']),
      );
    });

    it('does not execute historical anti-join queries when backfill mode is OFF by default', async () => {
      const { service, prisma } = createService();
      jest
        .spyOn(service, 'getSnapshotFacts')
        .mockResolvedValue(snapshotFactsResult());

      await service.runSnapshotPipeline(user, { limit: 10 });

      expect(prisma.$queryRaw).not.toHaveBeenCalled();
      expect(prisma.guestGameProfile.findFirst).not.toHaveBeenCalled();
    });

    it.each([undefined, 'definitely'])(
      'fails closed without an explicitly false backfill kill switch (%s)',
      async (killSwitch) => {
        const fixture = createService();
        const { service, prisma } = fixture;
        enablePrimarySnapshotBackfill(fixture, {
          GUEST_GAME_PIPELINE_BACKFILL_KILL_SWITCH: killSwitch,
        });
        jest
          .spyOn(service, 'getSnapshotFacts')
          .mockResolvedValue(snapshotFactsResult());

        await service.runSnapshotPipeline(user, { limit: 10 });

        expect(prisma.$queryRaw).not.toHaveBeenCalled();
        expect(prisma.guestGameProfile.findFirst).not.toHaveBeenCalled();
      },
    );

    it.each([
      ['missing exact profile', undefined, 'false'],
      ['invalid UTC cutoff', 'profile-1', 'false'],
    ])(
      'fails closed in LIVE with %s',
      async (_label, profileId, allowTenantWide) => {
        const fixture = createService();
        const { service, prisma } = fixture;
        enablePrimarySnapshotBackfill(fixture, {
          GUEST_GAME_PIPELINE_BACKFILL_PROFILE_ID: profileId,
          GUEST_GAME_PIPELINE_BACKFILL_ALLOW_TENANT_WIDE: allowTenantWide,
          GUEST_GAME_PIPELINE_BACKFILL_LIVE_NOT_BEFORE: profileId
            ? '2026-07-20 10:00:00'
            : '2026-07-20T10:00:00.000Z',
        });
        jest
          .spyOn(service, 'getSnapshotFacts')
          .mockResolvedValue(snapshotFactsResult());

        await service.runSnapshotPipeline(user, { limit: 10 });

        expect(prisma.$queryRaw).not.toHaveBeenCalled();
      },
    );

    it('allows an explicitly tenant-wide LIVE backfill only inside the exact tenant and cutoff', async () => {
      const fixture = createService();
      const { service, prisma } = fixture;
      enablePrimarySnapshotBackfill(fixture, {
        GUEST_GAME_PIPELINE_BACKFILL_PROFILE_ID: undefined,
        GUEST_GAME_PIPELINE_BACKFILL_ALLOW_TENANT_WIDE: 'true',
      });
      jest
        .spyOn(service, 'getSnapshotFacts')
        .mockResolvedValue(snapshotFactsResult());
      prisma.$queryRaw.mockResolvedValue([]);

      await service.runSnapshotPipeline(user, {
        source: 'GUEST_SESSION',
        limit: 10,
      });

      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
      expect(prisma.guestGameProfile.findFirst).not.toHaveBeenCalled();
    });

    it('does not run a scoped backfill for another tenant', async () => {
      const fixture = createService();
      const { service, prisma } = fixture;
      enablePrimarySnapshotBackfill(fixture, {
        GUEST_GAME_PIPELINE_BACKFILL_TENANT_ID: 'tenant-other',
      });
      jest
        .spyOn(service, 'getSnapshotFacts')
        .mockResolvedValue(snapshotFactsResult());

      await service.runSnapshotPipeline(user, { limit: 10 });

      expect(prisma.$queryRaw).not.toHaveBeenCalled();
      expect(prisma.guestGameProfile.findFirst).not.toHaveBeenCalled();
    });

    it('evaluates historical facts in SHADOW without creating canonical effects', async () => {
      const fixture = createService();
      const { service } = fixture;
      enablePrimarySnapshotBackfill(fixture, {
        GUEST_GAME_PIPELINE_BACKFILL_MODE: 'SHADOW',
        GUEST_GAME_PIPELINE_BACKFILL_PROFILE_ID: undefined,
        GUEST_GAME_PIPELINE_BACKFILL_LIVE_NOT_BEFORE: undefined,
      });
      const historicalFact = snapshotFact('historical-shadow-fact');
      jest
        .spyOn(service, 'getSnapshotFacts')
        .mockResolvedValue(snapshotFactsResult());
      jest
        .spyOn(service as any, 'loadPendingPrimarySnapshotFacts')
        .mockResolvedValue([historicalFact]);
      jest.spyOn(service, 'dryRun').mockResolvedValue(dryRunResult());
      const decisionSpy = jest
        .spyOn(service, 'recordRuleDecisions')
        .mockResolvedValue({
          lootBoxEntitlements: [],
          decisionsPersisted: true,
        });
      const processSpy = jest.spyOn(service, 'processEvent');

      const result = await service.runSnapshotPipeline(user, { limit: 10 });

      expect(result).toMatchObject({
        checkedFacts: 1,
        processedFacts: 0,
        queuedRewards: 0,
        appliedXpDelta: 0,
      });
      expect(result.facts).toEqual([
        expect.objectContaining({
          factId: historicalFact.id,
          status: 'DRY_RUN',
          process: null,
        }),
      ]);
      expect(processSpy).not.toHaveBeenCalled();
      expect(decisionSpy).toHaveBeenCalledWith(
        user,
        expect.any(Object),
        expect.objectContaining({
          evaluationMode: 'SHADOW',
          evaluatorVersion: 'primary-snapshot-backfill-shadow-v1',
          suppressLedgerShadow: true,
        }),
      );
    });

    it('keeps an ordinary latest fact live when SHADOW also discovers it', async () => {
      const fixture = createService();
      const { service } = fixture;
      enablePrimarySnapshotBackfill(fixture, {
        GUEST_GAME_PIPELINE_BACKFILL_MODE: 'SHADOW',
        GUEST_GAME_PIPELINE_BACKFILL_PROFILE_ID: undefined,
        GUEST_GAME_PIPELINE_BACKFILL_LIVE_NOT_BEFORE: undefined,
      });
      const currentFact = snapshotFact('current-and-shadow-fact');
      jest
        .spyOn(service, 'getSnapshotFacts')
        .mockResolvedValue(snapshotFactsResult([currentFact]));
      jest
        .spyOn(service as any, 'loadPendingPrimarySnapshotFacts')
        .mockResolvedValue([currentFact]);
      jest.spyOn(service, 'dryRun').mockResolvedValue(dryRunResult());
      const processSpy = jest
        .spyOn(service, 'processEvent')
        .mockResolvedValue(processResult());

      const result = await service.runSnapshotPipeline(user, { limit: 10 });

      expect(result.processedFacts).toBe(1);
      expect(processSpy).toHaveBeenCalledTimes(1);
    });

    it('stores matching intermediate progress facts without issuing a reward', async () => {
      const { service } = createService();
      const progressDryRun = dryRunResult({
        summary: {
          checkedRules: 1,
          eligibleRules: 0,
          blockedRules: 1,
          estimatedRewardAmount: 0,
          projectedXpDelta: 0,
        },
        rules: [
          {
            ...dryRunResult().rules[0],
            eligible: false,
            xpDelta: 0,
            rewardAmount: null,
            progress: {
              applicable: true,
              aggregation: 'duration',
              current: 40,
              target: 60,
              percent: 66.67,
              completed: false,
              matchedEvents: 1,
              unit: 'минуты',
              windowDays: 7,
            },
            blockers: ['Прогресс задания: 40/60 минут'],
          },
        ],
      });

      jest.spyOn(service, 'getSnapshotFacts').mockResolvedValue({
        facts: [
          snapshotFact('fact-play-progress', {
            eventType: 'PLAY_HOUR',
            sessionMinutes: 40,
          }),
        ],
        summary: {
          sessions: 1,
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
      jest.spyOn(service, 'dryRun').mockResolvedValue(progressDryRun);
      jest.spyOn(service, 'processEvent').mockResolvedValue(
        processResult({
          dryRun: progressDryRun,
          summary: {
            profileCreated: false,
            appliedXpDelta: 0,
            createdRewards: 0,
            queuedRewardAmount: 0,
            idempotencyKey: 'guest-game:GUEST_SESSION:PLAY_HOUR:progress',
            idempotent: false,
            langameWrite: false,
          },
        }),
      );

      const result = await service.runSnapshotPipeline(user, { limit: 10 });

      expect(result).toMatchObject({
        processedFacts: 1,
        queuedRewards: 0,
        appliedXpDelta: 0,
      });
      expect(service.processEvent).toHaveBeenCalledWith(
        user,
        expect.objectContaining({
          sourceFactId: 'fact-play-progress',
          eventType: 'PLAY_HOUR',
          activeRulesOnly: true,
        }),
      );
    });

    it('keeps a package correction beside the ordinary snapshot of the same session', async () => {
      const fixture = createService();
      const { service } = fixture;
      enablePrimarySnapshotBackfill(fixture);
      const ordinaryFact = snapshotFact('session:db-session-1:start', {
        externalId: 'external-session-1',
        sessionType: 'packet_hours',
        sessionPacket: true,
      });
      const correctionFact = snapshotFact('session:db-session-1:start', {
        externalId: 'external-session-1:classification:package-v1',
        sessionType: 'packet_hours',
        sessionPacket: true,
        sessionClassificationCorrection: 'PACKAGE_V1',
      });

      jest.spyOn(service, 'getSnapshotFacts').mockResolvedValue({
        facts: [ordinaryFact],
        summary: {
          sessions: 1,
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
        .spyOn(service as any, 'loadPendingPrimarySnapshotFacts')
        .mockResolvedValue([correctionFact]);
      const correctionSpy = jest
        .spyOn(service as any, 'processSessionPackageClassificationCorrection')
        .mockResolvedValue(processResult());
      jest.spyOn(service, 'dryRun').mockResolvedValue(dryRunResult());
      const processEventSpy = jest
        .spyOn(service, 'processEvent')
        .mockResolvedValue(
          processResult({
            summary: {
              profileCreated: false,
              appliedXpDelta: 0,
              createdRewards: 0,
              queuedRewardAmount: 0,
              idempotencyKey:
                'guest-game:GUEST_SESSION:SESSION_START:external-session-1',
              idempotent: true,
              langameWrite: false,
            },
          }),
        );

      const result = await service.runSnapshotPipeline(user, { limit: 10 });

      expect(result.availableFacts).toBe(2);
      expect(correctionSpy).toHaveBeenCalledTimes(1);
      expect(correctionSpy).toHaveBeenCalledWith(
        user,
        expect.objectContaining({
          sourceFactId: 'session:db-session-1:start',
          externalId: 'external-session-1:classification:package-v1',
        }),
      );
      expect(processEventSpy).toHaveBeenCalledTimes(1);
      expect(processEventSpy).toHaveBeenCalledWith(
        user,
        expect.objectContaining({ externalId: 'external-session-1' }),
      );
    });

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
          snapshotFact('fact-draft', { source: 'GUEST_LOG' }),
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
      expect(service.processEvent).toHaveBeenCalledWith(
        user,
        expect.objectContaining({
          activeRulesOnly: true,
          suppressLootBoxRewards: true,
        }),
      );
    });

    it('processes active rules when a matching draft rule exists', async () => {
      const { service } = createService();
      const activeDryRun = dryRunResult();
      const mixedDryRun = dryRunResult({
        rules: [
          activeDryRun.rules[0],
          {
            ...activeDryRun.rules[0],
            id: 'mission-draft',
            status: 'DRAFT',
          },
        ],
      });

      jest.spyOn(service, 'getSnapshotFacts').mockResolvedValue({
        facts: [snapshotFact('fact-active-and-draft')],
        summary: {
          sessions: 1,
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
      jest.spyOn(service, 'dryRun').mockResolvedValue(mixedDryRun);
      jest.spyOn(service, 'processEvent').mockResolvedValue(processResult());

      const result = await service.runSnapshotPipeline(user, { limit: 10 });

      expect(result.processedFacts).toBe(1);
      expect(service.processEvent).toHaveBeenCalledWith(
        user,
        expect.objectContaining({
          sourceFactId: 'fact-active-and-draft',
          activeRulesOnly: true,
          suppressLootBoxRewards: true,
        }),
      );
    });

    it('persists a terminal primary fact when only a draft rule matches', async () => {
      const { service } = createService();
      const draftDryRun = dryRunResult({
        rules: [
          {
            ...dryRunResult().rules[0],
            id: 'mission-draft',
            status: 'DRAFT',
            eligible: true,
          },
        ],
      });

      jest.spyOn(service, 'getSnapshotFacts').mockResolvedValue({
        facts: [snapshotFact('terminal-session-with-draft')],
        summary: {
          sessions: 1,
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
      jest.spyOn(service, 'dryRun').mockResolvedValue(draftDryRun);
      jest.spyOn(service, 'processEvent').mockResolvedValue(
        processResult({
          dryRun: { ...draftDryRun, rules: [] },
          rewards: [],
          summary: {
            profileCreated: false,
            appliedXpDelta: 0,
            createdRewards: 0,
            queuedRewardAmount: 0,
            idempotencyKey:
              'guest-game:GUEST_SESSION:SESSION_START:terminal-session-with-draft',
            idempotent: false,
            langameWrite: false,
          },
        }),
      );

      const result = await service.runSnapshotPipeline(user, { limit: 1 });

      expect(result).toMatchObject({ processedFacts: 1, skippedFacts: 0 });
      expect(service.processEvent).toHaveBeenCalledWith(
        user,
        expect.objectContaining({
          sourceFactId: 'terminal-session-with-draft',
          activeRulesOnly: true,
        }),
      );
    });

    it('prioritizes an unprocessed fact ahead of processed rows before applying the batch limit', async () => {
      const { service, prisma } = createService();
      const activeDryRun = dryRunResult();

      jest.spyOn(service, 'getSnapshotFacts').mockResolvedValue({
        facts: [
          snapshotFact('fact-already-processed'),
          snapshotFact('fact-pending'),
        ],
        summary: {
          sessions: 2,
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
      prisma.guestGameEvent.findMany.mockResolvedValue([
        {
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: 'club-1',
          externalId:
            'guest-game:GUEST_SESSION:SESSION_START:fact-already-processed',
        },
      ]);
      jest.spyOn(service, 'dryRun').mockResolvedValue(activeDryRun);
      jest.spyOn(service, 'processEvent').mockResolvedValue(processResult());

      const result = await service.runSnapshotPipeline(user, { limit: 1 });

      expect(result).toMatchObject({
        availableFacts: 2,
        checkedFacts: 1,
        processedFacts: 1,
      });
      expect(service.dryRun).toHaveBeenCalledWith(
        user,
        expect.objectContaining({ sourceFactId: 'fact-pending' }),
      );
      expect(service.processEvent).toHaveBeenCalledWith(
        user,
        expect.objectContaining({ sourceFactId: 'fact-pending' }),
      );
    });

    it('loads a pending session below a burst of more than 30 recent snapshot facts', async () => {
      const fixture = createService();
      const { service, prisma } = fixture;
      enablePrimarySnapshotBackfill(fixture);
      const recentFacts = Array.from({ length: 31 }, (_, index) =>
        snapshotFact(`recent-session-${index}`),
      );

      jest.spyOn(service, 'getSnapshotFacts').mockResolvedValue({
        facts: recentFacts,
        summary: {
          sessions: 31,
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
      prisma.$queryRaw.mockResolvedValue([{ id: 'older-session-32' }]);
      prisma.guestSession.findMany.mockResolvedValue([
        {
          id: 'older-session-32',
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: 'club-1',
          externalSessionId: 'older-session-32',
          externalGuestId: 'guest-external-1',
          startedAt: now,
          stoppedAt: null,
          durationMinutes: null,
          normalStop: null,
          packet: false,
          guest: {
            id: 'guest-1',
            externalDomain: 'club-1',
            externalGuestId: 'guest-external-1',
            fullNameMasked: 'Guest',
            phoneMasked: '***0646',
            emailMasked: null,
          },
          store: { id: 'store-1', name: 'Club 1' },
        },
      ]);
      prisma.guestGameEvent.findMany.mockResolvedValue(
        recentFacts.map((fact) => ({
          externalProvider: fact.externalProvider,
          externalDomain: fact.externalDomain,
          externalId: `guest-game:GUEST_SESSION:SESSION_START:${fact.externalId}`,
        })),
      );
      jest.spyOn(service, 'dryRun').mockResolvedValue(dryRunResult());
      jest.spyOn(service, 'processEvent').mockResolvedValue(processResult());

      const result = await service.runSnapshotPipeline(user, {
        source: 'GUEST_SESSION',
        limit: 1,
      });

      expect(result).toMatchObject({ checkedFacts: 1, processedFacts: 1 });
      expect(service.processEvent).toHaveBeenCalledWith(
        user,
        expect.objectContaining({
          sourceFactId: 'session:older-session-32:start',
        }),
      );
      const query = prisma.$queryRaw.mock.calls[0]?.[0] as {
        values: unknown[];
      };
      const cutoff = query.values.find(
        (value): value is Date => value instanceof Date,
      );
      expect(cutoff).toBeDefined();
      expect(Date.now() - (cutoff?.getTime() ?? 0)).toBeGreaterThanOrEqual(
        30 * 24 * 60 * 60 * 1000,
      );
      expect(Date.now() - (cutoff?.getTime() ?? 0)).toBeLessThan(
        30 * 24 * 60 * 60 * 1000 + 5_000,
      );
    });

    it('loads only the missing terminal fact when session start is already canonical', async () => {
      const { service, prisma } = createService();
      prisma.$queryRaw.mockResolvedValue([
        {
          id: 'completed-session-1',
          needsSessionStart: false,
          needsPlayHour: true,
          needsPackageCorrection: false,
        },
      ]);
      prisma.guestSession.findMany.mockResolvedValue([
        {
          id: 'completed-session-1',
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: 'club-1',
          externalSessionId: 'external-session-1',
          externalGuestId: 'guest-external-1',
          startedAt: now,
          stoppedAt: new Date(now.getTime() + 60 * 60_000),
          durationMinutes: 60,
          normalStop: true,
          packet: false,
          guest: {
            id: 'guest-1',
            externalDomain: 'club-1',
            externalGuestId: 'guest-external-1',
            fullNameMasked: 'Guest',
            phoneMasked: '***0646',
            emailMasked: null,
          },
          store: { id: 'store-1', name: 'Club 1' },
        },
      ]);

      const facts = await (service as any).loadPendingSessionSnapshotFacts(
        user,
        10,
        new Date(now.getTime() - 24 * 60 * 60_000),
      );

      expect(facts).toEqual([
        expect.objectContaining({
          id: 'session:completed-session-1:play',
          eventType: 'PLAY_HOUR',
          sessionMinutes: 60,
        }),
      ]);
    });

    it('loads a versioned package correction with the original session fact identity', async () => {
      const { service, prisma } = createService();
      prisma.$queryRaw.mockResolvedValue([
        {
          id: 'package-session-1',
          needsSessionStart: false,
          needsPlayHour: false,
          needsPackageCorrection: true,
        },
      ]);
      prisma.guestSession.findMany.mockResolvedValue([
        {
          id: 'package-session-1',
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: 'club-1',
          externalSessionId: 'external-package-session-1',
          externalGuestId: 'guest-external-1',
          startedAt: now,
          stoppedAt: null,
          durationMinutes: 15,
          normalStop: null,
          packet: true,
          guest: {
            id: 'guest-1',
            externalDomain: 'club-1',
            externalGuestId: 'guest-external-1',
            fullNameMasked: 'Guest',
            phoneMasked: '***0646',
            emailMasked: null,
          },
          store: { id: 'store-1', name: 'Club 1' },
        },
      ]);

      const facts = await (service as any).loadPendingSessionSnapshotFacts(
        user,
        10,
        new Date(now.getTime() - 24 * 60 * 60_000),
      );

      expect(facts).toEqual([
        expect.objectContaining({
          id: 'session:package-session-1:start',
          externalId: 'external-package-session-1:classification:package-v1',
          eventType: 'SESSION_START',
          sessionType: 'packet_hours',
          sessionPacket: true,
          sessionClassificationCorrection: 'PACKAGE_V1',
        }),
      ]);
    });

    it.each([
      ['minimum', '1', 24 * 60 * 60 * 1000],
      ['maximum', String(365 * 24 * 60 * 60 * 1000), 90 * 24 * 60 * 60 * 1000],
    ])(
      'clamps the primary snapshot backfill cutoff to the %s bound',
      async (_label, configured, expectedLookbackMs) => {
        const fixture = createService();
        const { service, prisma } = fixture;

        enablePrimarySnapshotBackfill(fixture, {
          GUEST_GAME_PIPELINE_BACKFILL_LOOKBACK_MS: configured,
        });
        jest.spyOn(service, 'getSnapshotFacts').mockResolvedValue({
          facts: [],
          summary: {
            sessions: 0,
            logs: 0,
            transactions: 0,
            operationLogs: 0,
            balances: 0,
            bonusBalances: 0,
            loyaltyGroups: 0,
            productExpenses: 0,
            referrals: 0,
            latestAt: null,
          },
        });
        prisma.$queryRaw.mockResolvedValue([]);

        await service.runSnapshotPipeline(user, {
          source: 'GUEST_SESSION',
          limit: 1,
        });

        const query = prisma.$queryRaw.mock.calls[0]?.[0] as {
          values: unknown[];
        };
        const cutoff = query.values.find(
          (value): value is Date => value instanceof Date,
        );
        const actualLookbackMs = Date.now() - (cutoff?.getTime() ?? 0);

        expect(cutoff).toBeDefined();
        expect(actualLookbackMs).toBeGreaterThanOrEqual(expectedLookbackMs);
        expect(actualLookbackMs).toBeLessThan(expectedLookbackMs + 5_000);
      },
    );

    it('loads a pending purchase below a burst of more than 30 recent snapshot facts', async () => {
      const fixture = createService();
      const { service, prisma } = fixture;
      enablePrimarySnapshotBackfill(fixture);
      const recentFacts = Array.from({ length: 31 }, (_, index) =>
        snapshotFact(`recent-purchase-${index}`, {
          source: 'PRODUCT_EXPENSE',
          eventType: 'PRODUCT_PURCHASE',
          sessionType: null,
          sessionPacket: null,
          sessionMinutes: null,
          spendAmount: 100,
        }),
      );

      jest.spyOn(service, 'getSnapshotFacts').mockResolvedValue({
        facts: recentFacts,
        summary: {
          sessions: 0,
          logs: 0,
          transactions: 0,
          operationLogs: 0,
          balances: 0,
          bonusBalances: 0,
          loyaltyGroups: 0,
          productExpenses: 31,
          referrals: 0,
          latestAt: isoNow,
        },
      });
      prisma.$queryRaw.mockResolvedValue([{ id: 'older-sale-32' }]);
      prisma.salesFact.findMany.mockResolvedValue([
        {
          id: 'older-sale-32',
          productId: 'product-1',
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: 'club-1',
          externalSaleId: 'older-sale-32',
          externalProductId: 'external-product-1',
          externalGuestId: 'guest-external-1',
          saleDate: now,
          quantity: 1,
          revenue: 100,
          cost: 50,
          productNameAtSale: 'Product',
          storeNameAtSale: 'Club 1',
          guest: {
            id: 'guest-1',
            externalDomain: 'club-1',
            externalGuestId: 'guest-external-1',
            fullNameMasked: 'Guest',
            phoneMasked: '***0646',
            emailMasked: null,
          },
          store: { id: 'store-1', name: 'Club 1' },
          product: {
            id: 'product-1',
            article: 'P-1',
            name: 'Product',
            category: null,
            supplier: null,
          },
        },
      ]);
      prisma.langameClubProductConfiguration.findMany.mockResolvedValue([]);
      prisma.guestGameEvent.findMany.mockResolvedValue(
        recentFacts.map((fact) => ({
          externalProvider: fact.externalProvider,
          externalDomain: fact.externalDomain,
          externalId: `guest-game:PRODUCT_EXPENSE:PRODUCT_PURCHASE:${fact.externalId}`,
        })),
      );
      jest.spyOn(service, 'dryRun').mockResolvedValue(dryRunResult());
      jest.spyOn(service, 'processEvent').mockResolvedValue(processResult());

      const result = await service.runSnapshotPipeline(user, {
        source: 'PRODUCT_EXPENSE',
        limit: 1,
      });

      expect(result).toMatchObject({ checkedFacts: 1, processedFacts: 1 });
      expect(service.processEvent).toHaveBeenCalledWith(
        user,
        expect.objectContaining({
          sourceFactId: 'product-expense:older-sale-32',
        }),
      );
    });

    it('keeps unbound diagnostic facts behind actionable guest facts', async () => {
      const { service, prisma } = createService();
      const activeDryRun = dryRunResult();

      jest.spyOn(service, 'getSnapshotFacts').mockResolvedValue({
        facts: [
          snapshotFact('fact-unbound-1', { guest: null }),
          snapshotFact('fact-unbound-2', { guest: null }),
          snapshotFact('fact-actionable'),
        ],
        summary: {
          sessions: 3,
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
      prisma.guestGameEvent.findMany.mockResolvedValue([]);
      jest.spyOn(service, 'dryRun').mockResolvedValue(activeDryRun);
      jest.spyOn(service, 'processEvent').mockResolvedValue(processResult());

      const result = await service.runSnapshotPipeline(user, { limit: 1 });

      expect(result).toMatchObject({
        availableFacts: 3,
        checkedFacts: 1,
        processedFacts: 1,
      });
      expect(service.processEvent).toHaveBeenCalledWith(
        user,
        expect.objectContaining({ sourceFactId: 'fact-actionable' }),
      );
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
    it('persists a manually approved mission bonus event and durable ledger effect', async () => {
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
      expect(prisma.guestGameEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventType: 'REWARD_APPROVED',
          missionId: 'mission-1',
        }),
      });
      expect(prisma.guestGameRewardEffect.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            rewardId: 'reward-mission-pending',
            effectKind: 'BONUS_LEDGER_QUEUE',
            status: 'PENDING',
          }),
        ],
        skipDuplicates: true,
      });
      expect(bonusLedgerService.queueApprovedRewards).not.toHaveBeenCalled();
      expect(bonusLedgerService.dispatch).not.toHaveBeenCalled();
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

describe('GuestGamificationService standalone PLAY_HOUR boundary', () => {
  it('keeps the standalone case blocked at 59 minutes and unlocks it at 60', async () => {
    const { service } = createService();
    jest
      .spyOn(service as any, 'resolveDryRunProfile')
      .mockResolvedValue(profileFixture());
    jest.spyOn(service, 'getLootBoxes').mockResolvedValue([
      activeLootBox({
        triggerKind: 'PLAY_HOUR',
        periodRules: {},
      }),
    ]);
    jest.spyOn(service, 'getMissions').mockResolvedValue([]);
    jest.spyOn(service, 'getSeasons').mockResolvedValue([]);
    jest.spyOn(service as any, 'getDryRunRewards').mockResolvedValue([]);

    const at59 = await service.dryRun(user, {
      eventType: 'PLAY_HOUR',
      occurredAt: isoNow,
      sessionType: 'regular_session',
      sessionMinutes: 59,
    });
    const at60 = await service.dryRun(user, {
      eventType: 'PLAY_HOUR',
      occurredAt: isoNow,
      sessionType: 'regular_session',
      sessionMinutes: 60,
    });

    expect(at59.rules[0]).toMatchObject({
      eligible: false,
      blockers: expect.arrayContaining([expect.stringContaining('59/60')]),
    });
    expect(at60.rules[0]).toMatchObject({ eligible: true, blockers: [] });
  });

  it('still lets a 30-minute PLAY_TIME mission use the shared duration observation', async () => {
    const { service } = createService();
    jest
      .spyOn(service as any, 'resolveDryRunProfile')
      .mockResolvedValue(profileFixture());
    jest.spyOn(service, 'getLootBoxes').mockResolvedValue([]);
    jest.spyOn(service, 'getMissions').mockResolvedValue([
      activeMission({
        definitionVersion: 2,
        missionType: 'PLAY_TIME',
        triggerKind: 'PLAY_HOUR',
        rewardType: 'NONE',
        rewardAmount: null,
        rewardLabel: null,
        xpReward: 0,
        progressTarget: 30,
        progressUnit: 'минут',
        conditions: {
          schemaVersion: 2,
          taskType: 'PLAY_TIME',
          activatedAt: isoNow,
          metric: {
            aggregation: 'duration',
            eventTypes: ['PLAY_HOUR', 'SESSION_STOP'],
            target: 30,
            unit: 'минут',
          },
        },
      }),
    ]);
    jest.spyOn(service, 'getSeasons').mockResolvedValue([]);
    jest.spyOn(service as any, 'getDryRunRewards').mockResolvedValue([]);

    const result = await service.dryRun(user, {
      eventType: 'PLAY_HOUR',
      occurredAt: isoNow,
      sessionType: 'regular_session',
      sessionMinutes: 30,
      sourceFactId: 'session:30-minute:play',
    });

    expect(result.rules[0]).toMatchObject({
      kind: 'MISSION',
      eligible: true,
      progress: expect.objectContaining({ current: 30, target: 30 }),
    });
  });
});

describe('GuestGamificationService supplemental pipeline', () => {
  const supplementalMission = {
    id: 'mission-topup-1',
    createdAt: new Date('2026-07-14T00:00:00.000Z'),
    periodFrom: new Date('2026-07-14T00:00:00.000Z'),
    periodTo: new Date('2026-08-14T00:00:00.000Z'),
    conditions: {
      activatedAt: '2026-07-14T00:00:00.000Z',
      externalDomains: ['46.langamepro.ru'],
    },
    storeIds: [],
  };
  const supplementalFact = {
    id: 'fact-version-2',
    tenantId: user.tenantId,
    guestId: 'guest-1',
    profileId: 'profile-1',
    storeId: null,
    externalProvider: IntegrationProvider.LANGAME,
    externalDomain: '46.langamepro.ru',
    externalGuestId: 'guest-external-1',
    externalClubId: null,
    sourceKind: 'BALANCE_LIST',
    sourceHash: 'stable-balance-operation-hash',
    sourceExternalId: 'balance-operation-42',
    factType: 'BALANCE_TOPUP',
    happenedAt: new Date('2026-07-15T10:00:00.000Z'),
    sourceLocalDate: '2026-07-15',
    sessionExternalId: null,
    tariffName: null,
    tariffType: null,
    amount: new Prisma.Decimal(500),
    bonusAmount: null,
    durationMinutes: null,
    confidence: 'EXACT',
    evidence: null,
    parserVersion: 'balance-v2',
    normalizationRunId: 'run-1',
    lifecycleStatus: 'ACTIVE',
    validFrom: new Date('2026-07-15T10:00:00.000Z'),
    supersededAt: null,
    createdAt: new Date('2026-07-15T10:00:00.000Z'),
    updatedAt: new Date('2026-07-15T10:00:00.000Z'),
    rawRecordId: 'raw-1',
  };

  it('evaluates a selected-club domain top-up and fails closed for another domain', async () => {
    const { service, prisma } = createService();
    prisma.guest.findFirst.mockResolvedValue({
      id: 'guest-1',
      name: 'Guest',
      phone: '***0000',
      externalDomain: '46.langamepro.ru',
      externalClubId: null,
    });
    const mission = activeMission({
      id: supplementalMission.id,
      name: 'Domain top-up',
      definitionVersion: 2,
      missionType: 'BALANCE_TOPUP',
      triggerKind: 'BALANCE_TOPUP',
      evaluationPolicy: 'LEDGER_SUPPLEMENTAL',
      storeIds: ['store-topup'],
      rewardType: 'NONE',
      rewardAmount: null,
      rewardLabel: null,
      xpReward: 0,
      progressTarget: 1,
      progressUnit: 'пополнение',
      conditions: {
        schemaVersion: 2,
        taskType: 'BALANCE_TOPUP',
        activatedAt: '2026-07-14T00:00:00.000Z',
        externalDomains: ['46.langamepro.ru'],
        domainScoped: true,
        metric: {
          aggregation: 'count',
          eventTypes: ['BALANCE_TOPUP'],
          target: 1,
        },
      },
    });
    const ruleDomainTimeZones = new Map([
      [
        mission.id,
        new Map<string, string | null>([
          ['46.langamepro.ru', 'Asia/Yekaterinburg'],
        ]),
      ],
    ]);
    const ruleExternalDomains = new Map<string, readonly string[]>([
      [mission.id, ['46.langamepro.ru']],
    ]);
    jest
      .spyOn(service as any, 'resolveDryRunProfile')
      .mockResolvedValue(profileFixture());
    jest.spyOn(service, 'getLootBoxes').mockResolvedValue([]);
    jest.spyOn(service, 'getMissions').mockResolvedValue([mission]);
    jest.spyOn(service, 'getSeasons').mockResolvedValue([]);
    jest.spyOn(service as any, 'getDryRunRewards').mockResolvedValue([]);

    const matching = await service.dryRun(
      user,
      {
        profileId: 'profile-1',
        guestId: 'guest-1',
        eventType: 'BALANCE_TOPUP',
        occurredAt: supplementalFact.happenedAt.toISOString(),
        spendAmount: 500,
        sourceFactId: supplementalFact.id,
        externalDomain: '46.langamepro.ru',
      },
      { ruleDomainTimeZones, ruleExternalDomains },
    );
    const otherDomain = await service.dryRun(
      user,
      {
        profileId: 'profile-1',
        guestId: 'guest-1',
        eventType: 'BALANCE_TOPUP',
        occurredAt: supplementalFact.happenedAt.toISOString(),
        spendAmount: 500,
        sourceFactId: 'fact-other-domain',
        externalDomain: 'other.langamepro.ru',
      },
      { ruleDomainTimeZones, ruleExternalDomains },
    );

    expect(matching.rules[0]).toMatchObject({
      id: mission.id,
      eligible: true,
      progress: expect.objectContaining({ current: 1, completed: true }),
    });
    expect(otherDomain.rules[0]).toMatchObject({
      id: mission.id,
      eligible: false,
      blockers: expect.arrayContaining([
        expect.stringContaining('Домен факта Langame не входит'),
      ]),
    });
  });

  it('routes selected-club domain and timezone maps into LIVE supplemental processing', async () => {
    const { service, prisma } = createService();
    const selectedMission = {
      ...supplementalMission,
      storeIds: ['store-topup'],
    };
    prisma.tenant.findMany.mockResolvedValue([scheduledTenantRow()]);
    prisma.guestGameMission.findMany.mockResolvedValue([selectedMission]);
    prisma.store.findMany.mockResolvedValue([
      {
        id: 'store-topup',
        externalDomain: '46.langamepro.ru',
        timeZone: 'Asia/Yekaterinburg',
      },
      {
        id: 'store-other',
        externalDomain: 'other.langamepro.ru',
        timeZone: 'Europe/Moscow',
      },
    ]);
    prisma.guestActivityFact.findMany.mockResolvedValue([supplementalFact]);
    const process = jest
      .spyOn(service, 'processEvent')
      .mockResolvedValue(processResult());

    await service.runSupplementalPipelineScheduled({
      mode: 'LIVE',
      factTypes: ['BALANCE_TOPUP'],
      limit: 1,
    });

    const options = process.mock.calls[0]?.[2];
    expect(options?.ruleExternalDomains?.get(selectedMission.id)).toEqual([
      '46.langamepro.ru',
    ]);
    expect(
      options?.ruleDomainTimeZones
        ?.get(selectedMission.id)
        ?.get('46.langamepro.ru'),
    ).toBe('Asia/Yekaterinburg');
    expect(
      options?.ruleDomainTimeZones
        ?.get(selectedMission.id)
        ?.has('other.langamepro.ru'),
    ).toBe(false);
  });

  it('records SHADOW decisions without creating an event or reward', async () => {
    const { service, prisma } = createService();
    prisma.tenant.findMany.mockResolvedValue([scheduledTenantRow()]);
    prisma.guestGameMission.findMany.mockResolvedValue([supplementalMission]);
    prisma.guestActivityFact.findMany.mockResolvedValue([supplementalFact]);
    const shadowDryRun = dryRunResult({
      eventType: 'BALANCE_TOPUP',
      occurredAt: supplementalFact.happenedAt.toISOString(),
      rules: [
        {
          ...dryRunResult().rules[0],
          id: supplementalMission.id,
          triggerKind: 'BALANCE_TOPUP',
          evaluationPolicy: 'LEDGER_SUPPLEMENTAL',
        },
      ],
    });
    jest.spyOn(service, 'dryRun').mockResolvedValue(shadowDryRun);
    const decisions = jest
      .spyOn(service, 'recordRuleDecisions')
      .mockResolvedValue();
    const process = jest.spyOn(service, 'processEvent');

    const result = await service.runSupplementalPipelineScheduled({
      mode: 'SHADOW',
      factTypes: ['BALANCE_TOPUP'],
      limit: 10,
    });

    expect(result).toMatchObject({
      shadowFacts: 1,
      processedFacts: 0,
      createdEvents: 0,
      createdRewards: 0,
    });
    expect(process).not.toHaveBeenCalled();
    expect(decisions).toHaveBeenCalledWith(
      expect.objectContaining(user),
      expect.objectContaining({
        rules: [expect.objectContaining({ id: supplementalMission.id })],
      }),
      expect.objectContaining({
        evaluationMode: 'SHADOW_SUPPLEMENTAL',
        evaluatorVersion: 'ledger-supplemental-v1',
      }),
    );
  });

  it('uses a stable operation origin for LIVE idempotency and isolates allowed rules', async () => {
    const { service, prisma } = createService();
    prisma.tenant.findMany.mockResolvedValue([scheduledTenantRow()]);
    prisma.guestGameMission.findMany.mockResolvedValue([supplementalMission]);
    prisma.guestActivityFact.findMany.mockResolvedValue([supplementalFact]);
    const processed = processResult({
      summary: {
        ...processResult().summary,
        createdRewards: 1,
        idempotent: false,
      },
    });
    const process = jest
      .spyOn(service, 'processEvent')
      .mockResolvedValue(processed);

    const result = await service.runSupplementalPipelineScheduled({
      mode: 'LIVE',
      factTypes: ['BALANCE_TOPUP'],
      limit: 10,
    });

    expect(result).toMatchObject({
      processedFacts: 1,
      createdEvents: 1,
      createdRewards: 1,
    });
    expect(process).toHaveBeenCalledWith(
      expect.objectContaining(user),
      expect.objectContaining({
        externalId: supplementalFact.sourceHash,
        sourceFactId: supplementalFact.id,
        sourceFactKind: 'SUPPLEMENTAL_BALANCE_TOPUP',
      }),
      expect.objectContaining({
        allowedRuleIds: [supplementalMission.id],
        evaluationMode: 'LIVE_SUPPLEMENTAL',
        originKey: expect.stringMatching(/^ggo:v1:[a-f0-9]{64}$/),
      }),
    );
  });

  it('promotes a SHADOWED receipt to LIVE instead of treating it as a terminal duplicate', async () => {
    const { service, prisma } = createService();
    prisma.tenant.findMany.mockResolvedValue([scheduledTenantRow()]);
    prisma.guestGameMission.findMany.mockResolvedValue([supplementalMission]);
    prisma.guestActivityFact.findMany.mockResolvedValue([supplementalFact]);
    prisma.guestGameSupplementalFactReceipt.findMany.mockResolvedValue([
      {
        factType: supplementalFact.factType,
        externalDomain: supplementalFact.externalDomain,
        sourceHash: supplementalFact.sourceHash,
        status: 'SHADOWED',
        attempts: 1,
      },
    ]);
    const process = jest
      .spyOn(service, 'processEvent')
      .mockResolvedValue(processResult());

    const result = await service.runSupplementalPipelineScheduled({
      mode: 'LIVE',
      factTypes: ['BALANCE_TOPUP'],
      limit: 1,
    });

    expect(result).toMatchObject({
      checkedFacts: 1,
      duplicateFacts: 0,
      processedFacts: 1,
    });
    expect(
      prisma.guestGameSupplementalFactReceipt.updateMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            {
              status: { in: ['PENDING', 'FAILED', 'SHADOWED'] },
            },
          ]),
        }),
      }),
    );
    expect(process).toHaveBeenCalledTimes(1);
  });

  it('pages past terminal receipts so they cannot starve a fresh fact at the batch limit', async () => {
    const { service, prisma } = createService();
    const processedFacts = Array.from({ length: 50 }, (_, index) => ({
      ...supplementalFact,
      id: `processed-fact-${index}`,
      sourceHash: `processed-source-hash-${index}`,
      happenedAt: new Date(
        supplementalFact.happenedAt.getTime() + index * 60_000,
      ),
    }));
    const freshFact = {
      ...supplementalFact,
      id: 'fresh-fact-after-terminal-page',
      sourceHash: 'fresh-source-hash-after-terminal-page',
      happenedAt: new Date(supplementalFact.happenedAt.getTime() + 51 * 60_000),
    };
    prisma.tenant.findMany.mockResolvedValue([scheduledTenantRow()]);
    prisma.guestGameMission.findMany.mockResolvedValue([supplementalMission]);
    prisma.guestActivityFact.findMany
      .mockResolvedValueOnce(processedFacts)
      .mockResolvedValueOnce([freshFact]);
    prisma.guestGameSupplementalFactReceipt.findMany
      .mockResolvedValueOnce(
        processedFacts.map((fact) => ({
          factType: fact.factType,
          externalDomain: fact.externalDomain,
          sourceHash: fact.sourceHash,
          status: 'PROCESSED',
          attempts: 1,
        })),
      )
      .mockResolvedValueOnce([]);
    const process = jest
      .spyOn(service, 'processEvent')
      .mockResolvedValue(processResult());

    const result = await service.runSupplementalPipelineScheduled({
      mode: 'LIVE',
      factTypes: ['BALANCE_TOPUP'],
      limit: 1,
    });

    expect(result).toMatchObject({
      checkedFacts: 1,
      duplicateFacts: 50,
      processedFacts: 1,
    });
    expect(prisma.guestActivityFact.findMany).toHaveBeenCalledTimes(2);
    expect(prisma.guestActivityFact.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        cursor: { id: 'processed-fact-49' },
        skip: 1,
      }),
    );
    expect(process).toHaveBeenCalledWith(
      expect.objectContaining(user),
      expect.objectContaining({
        sourceFactId: freshFact.id,
        externalId: freshFact.sourceHash,
      }),
      expect.any(Object),
    );
  });

  it('continues within a fetched page when a candidate loses the receipt claim race', async () => {
    const { service, prisma } = createService();
    const racedFact = {
      ...supplementalFact,
      id: 'fact-claimed-by-another-worker',
      sourceHash: 'source-hash-claimed-by-another-worker',
    };
    const freshFact = {
      ...supplementalFact,
      id: 'fact-claimed-by-this-worker',
      sourceHash: 'source-hash-claimed-by-this-worker',
      happenedAt: new Date(supplementalFact.happenedAt.getTime() + 60_000),
    };
    prisma.tenant.findMany.mockResolvedValue([scheduledTenantRow()]);
    prisma.guestGameMission.findMany.mockResolvedValue([supplementalMission]);
    prisma.guestActivityFact.findMany.mockResolvedValue([racedFact, freshFact]);
    prisma.guestGameSupplementalFactReceipt.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });
    const process = jest
      .spyOn(service, 'processEvent')
      .mockResolvedValue(processResult());

    const result = await service.runSupplementalPipelineScheduled({
      mode: 'LIVE',
      factTypes: ['BALANCE_TOPUP'],
      limit: 1,
    });

    expect(result).toMatchObject({
      checkedFacts: 1,
      duplicateFacts: 1,
      processedFacts: 1,
    });
    expect(process).toHaveBeenCalledTimes(1);
    expect(process).toHaveBeenCalledWith(
      expect.objectContaining(user),
      expect.objectContaining({ sourceFactId: freshFact.id }),
      expect.any(Object),
    );
  });

  it('does not process a receipt already claimed by another worker', async () => {
    const { service, prisma } = createService();
    prisma.tenant.findMany.mockResolvedValue([scheduledTenantRow()]);
    prisma.guestGameMission.findMany.mockResolvedValue([supplementalMission]);
    prisma.guestActivityFact.findMany.mockResolvedValue([supplementalFact]);
    prisma.guestGameSupplementalFactReceipt.updateMany.mockResolvedValue({
      count: 0,
    });
    const process = jest.spyOn(service, 'processEvent');

    const result = await service.runSupplementalPipelineScheduled({
      mode: 'LIVE',
      factTypes: ['BALANCE_TOPUP'],
      limit: 10,
    });

    expect(result).toMatchObject({
      duplicateFacts: 1,
      processedFacts: 0,
      createdEvents: 0,
      createdRewards: 0,
    });
    expect(process).not.toHaveBeenCalled();
  });

  it('reclaims a stale PROCESSING receipt within the bounded retry budget', async () => {
    const { service, prisma } = createService();
    prisma.tenant.findMany.mockResolvedValue([scheduledTenantRow()]);
    prisma.guestGameMission.findMany.mockResolvedValue([supplementalMission]);
    prisma.guestActivityFact.findMany.mockResolvedValue([supplementalFact]);
    prisma.guestGameSupplementalFactReceipt.findMany.mockResolvedValue([
      {
        factType: supplementalFact.factType,
        externalDomain: supplementalFact.externalDomain,
        sourceHash: supplementalFact.sourceHash,
        status: 'PROCESSING',
        attempts: 1,
        updatedAt: new Date(Date.now() - 10 * 60 * 1000),
      },
    ]);
    const process = jest
      .spyOn(service, 'processEvent')
      .mockResolvedValue(processResult());

    const result = await service.runSupplementalPipelineScheduled({
      mode: 'LIVE',
      factTypes: ['BALANCE_TOPUP'],
      limit: 1,
    });

    expect(result).toMatchObject({ processedFacts: 1, duplicateFacts: 0 });
    expect(process).toHaveBeenCalledTimes(1);
    expect(
      prisma.guestGameSupplementalFactReceipt.updateMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({
              status: 'PROCESSING',
              updatedAt: expect.any(Object),
            }),
          ]),
        }),
      }),
    );
  });

  it('does not steal a fresh PROCESSING receipt from another worker', async () => {
    const { service, prisma } = createService();
    prisma.tenant.findMany.mockResolvedValue([scheduledTenantRow()]);
    prisma.guestGameMission.findMany.mockResolvedValue([supplementalMission]);
    prisma.guestActivityFact.findMany.mockResolvedValue([supplementalFact]);
    prisma.guestGameSupplementalFactReceipt.findMany.mockResolvedValue([
      {
        factType: supplementalFact.factType,
        externalDomain: supplementalFact.externalDomain,
        sourceHash: supplementalFact.sourceHash,
        status: 'PROCESSING',
        attempts: 1,
        updatedAt: new Date(),
      },
    ]);
    const process = jest.spyOn(service, 'processEvent');

    const result = await service.runSupplementalPipelineScheduled({
      mode: 'LIVE',
      factTypes: ['BALANCE_TOPUP'],
      limit: 1,
    });

    expect(result).toMatchObject({ processedFacts: 0, duplicateFacts: 1 });
    expect(process).not.toHaveBeenCalled();
  });

  it('fences a stale supplemental worker from finalizing a reclaimed receipt', async () => {
    const { service, prisma } = createService();
    prisma.tenant.findMany.mockResolvedValue([scheduledTenantRow()]);
    prisma.guestGameMission.findMany.mockResolvedValue([supplementalMission]);
    prisma.guestActivityFact.findMany.mockResolvedValue([supplementalFact]);
    prisma.guestGameSupplementalFactReceipt.findMany.mockResolvedValue([
      {
        factType: supplementalFact.factType,
        externalDomain: supplementalFact.externalDomain,
        sourceHash: supplementalFact.sourceHash,
        status: 'PROCESSING',
        attempts: 1,
        updatedAt: new Date(Date.now() - 10 * 60 * 1000),
      },
    ]);
    // Claim version 1 -> 2 succeeds. Before this worker finalizes, another
    // worker has reclaimed version 2 -> 3, so the version-2 finalization is
    // rejected by the database predicate.
    prisma.guestGameSupplementalFactReceipt.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    jest.spyOn(service, 'processEvent').mockResolvedValue(processResult());

    const result = await service.runSupplementalPipelineScheduled({
      mode: 'LIVE',
      factTypes: ['BALANCE_TOPUP'],
      limit: 1,
    });

    expect(result).toMatchObject({
      checkedFacts: 1,
      processedFacts: 0,
      duplicateFacts: 1,
      createdEvents: 0,
      createdRewards: 0,
    });
    expect(
      prisma.guestGameSupplementalFactReceipt.updateMany,
    ).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({ attempts: 1 }),
        data: expect.objectContaining({
          status: 'PROCESSING',
          attempts: { increment: 1 },
        }),
      }),
    );
    expect(
      prisma.guestGameSupplementalFactReceipt.updateMany,
    ).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'PROCESSING',
          attempts: 2,
        }),
        data: expect.objectContaining({ status: 'PROCESSED' }),
      }),
    );
  });

  it('dead-letters a stale receipt after the bounded retry budget is exhausted', async () => {
    const { service, prisma } = createService();
    prisma.tenant.findMany.mockResolvedValue([scheduledTenantRow()]);
    prisma.guestGameMission.findMany.mockResolvedValue([supplementalMission]);
    prisma.guestActivityFact.findMany.mockResolvedValue([supplementalFact]);
    prisma.guestGameSupplementalFactReceipt.findMany.mockResolvedValue([
      {
        factType: supplementalFact.factType,
        externalDomain: supplementalFact.externalDomain,
        sourceHash: supplementalFact.sourceHash,
        status: 'PROCESSING',
        attempts: 3,
        updatedAt: new Date(Date.now() - 10 * 60 * 1000),
      },
    ]);
    const process = jest.spyOn(service, 'processEvent');

    const result = await service.runSupplementalPipelineScheduled({
      mode: 'LIVE',
      factTypes: ['BALANCE_TOPUP'],
      limit: 1,
    });

    expect(result).toMatchObject({ processedFacts: 0, duplicateFacts: 1 });
    expect(
      prisma.guestGameSupplementalFactReceipt.updateMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'DEAD_LETTER' }),
      }),
    );
    expect(process).not.toHaveBeenCalled();
  });
});

import { IntegrationProvider, TenantLifecycleStatus } from '@prisma/client';
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  GuestGameLootBoxSessionRecoveryService,
  correlatePackageSessionFact,
  correlatePackageSessionFacts,
  routeLootBoxSessionRecoveryDryRun,
  type SessionCorrelationFact,
} from './guest-game-loot-box-session-recovery.service';

const now = new Date('2026-07-20T12:00:00.000Z');
const sessionAt = new Date('2026-07-20T11:58:00.000Z');

type ActivityFactFindManyQuery = {
  where: {
    id?: { in: string[] };
    factType: string | { in: string[] };
    AND?: unknown;
    createdAt?: { gte: Date };
  };
  orderBy?: Array<{ createdAt?: 'asc' | 'desc'; id?: 'asc' | 'desc' }>;
  cursor?: { id: string };
  skip?: number;
  take?: number;
};

type OriginReceiptUpsertQuery = {
  create: {
    factId: string;
    eventType?: string;
    policy?: string;
    status?: string;
    attempts?: number;
  };
};

type PrismaSqlQuery = {
  strings: readonly string[];
  values: readonly unknown[];
};

function tenant() {
  return {
    id: 'tenant-1',
    slug: 'tenant-one',
    status: TenantLifecycleStatus.ACTIVE,
    users: [
      {
        id: 'user-1',
        email: 'operator@example.test',
        fullName: 'Operator',
        role: 'OWNER',
        customRoleId: null,
        isPlatformAdmin: false,
      },
    ],
  };
}

function fact(
  overrides: Partial<SessionCorrelationFact> = {},
): SessionCorrelationFact {
  return {
    id: 'session-fact-1',
    tenantId: 'tenant-1',
    profileId: 'profile-1',
    guestId: 'guest-1',
    storeId: 'store-1',
    externalProvider: IntegrationProvider.LANGAME,
    externalDomain: '46.langamepro.ru',
    externalGuestId: 'external-guest-1',
    sourceHash: 'session-source-hash',
    sourceExternalId: 'session-42',
    sessionExternalId: 'session-42',
    factType: 'SESSION_STARTED',
    happenedAt: sessionAt,
    confidence: 'EXACT',
    lifecycleStatus: 'ACTIVE',
    supersededAt: null,
    createdAt: sessionAt,
    ...overrides,
  };
}

function marker(overrides: Partial<SessionCorrelationFact> = {}) {
  return fact({
    id: 'package-marker-1',
    sourceHash: 'package-marker-hash',
    sourceExternalId: 'guest-log-42',
    sessionExternalId: null,
    factType: 'PACKAGE_OR_SUBSCRIPTION_USED',
    happenedAt: new Date(sessionAt.getTime() + 30_000),
    confidence: 'INFERRED',
    ...overrides,
  });
}

function hourlyMarker(overrides: Partial<SessionCorrelationFact> = {}) {
  return fact({
    id: 'hourly-marker-1',
    sourceHash: 'hourly-marker-hash',
    sourceExternalId: 'session-42',
    sessionExternalId: 'session-42',
    factType: 'HOURLY_SESSION_STARTED',
    happenedAt: new Date(sessionAt.getTime() + 15_000),
    confidence: 'EXACT',
    ...overrides,
  });
}

function lootBoxRule(
  overrides: Partial<{
    id: string;
    createdAt: Date;
    triggerKind: string;
    sessionType: string | null;
    storeIds: string[];
    limits: Record<string, unknown>;
  }> = {},
) {
  return {
    id: 'loot-box-1',
    createdAt: new Date('2026-07-20T10:00:00.000Z'),
    triggerKind: 'SESSION_START',
    sessionType: 'PACKAGE_OR_SUBSCRIPTION',
    storeIds: ['store-1'],
    limits: { activatedAt: '2026-07-20T10:00:00.000Z' },
    ...overrides,
  };
}

function dryRun() {
  return {
    dryRun: true as const,
    eventType: 'SESSION_START',
    occurredAt: sessionAt.toISOString(),
    profile: {
      id: 'profile-1',
      displayName: 'Guest',
      contactMasked: '***0000',
      xp: 0,
      level: 1,
      status: 'ACTIVE',
    },
    guest: { id: 'guest-1' },
    store: {
      id: 'store-1',
      name: 'Club',
      timeZone: 'Asia/Yekaterinburg',
    },
    input: {
      sessionType: 'PACKAGE_OR_SUBSCRIPTION',
      sessionPacket: true,
      sessionMinutes: 0,
      spendAmount: 0,
      tariffGroupId: null,
      tariffPeriodId: null,
      tariffTypeId: null,
      guestLogType: null,
      productId: null,
      externalProductId: null,
      externalCategoryKey: null,
      externalCategoryId: null,
      categoryId: null,
      productName: null,
      categoryName: null,
      supplierName: null,
      quantity: null,
    },
    summary: {
      checkedRules: 3,
      eligibleRules: 3,
      blockedRules: 0,
      estimatedRewardAmount: 100,
      projectedXpDelta: 50,
    },
    rules: [
      {
        id: 'loot-box-1',
        kind: 'LOOT_BOX' as const,
        name: 'Weekend',
        status: 'ACTIVE',
        triggerKind: 'SESSION_START',
        evaluationPolicy: 'LIVE_PRIMARY',
        manualApprovalRequired: false,
        eligible: true,
        rewardType: 'LOOT_BOX',
        rewardAmount: 0,
        rewardLabel: null,
        selectedRewardLabel: null,
        selectedReward: null,
        xpDelta: 0,
        budgetAmount: null,
        progress: null,
        periodicLimitPeriod: null,
        reasons: ['matched'],
        blockers: [],
      },
      {
        id: 'mission-1',
        kind: 'MISSION' as const,
        name: 'Mission',
        status: 'ACTIVE',
        triggerKind: 'SESSION_START',
        evaluationPolicy: 'LIVE_PRIMARY',
        manualApprovalRequired: false,
        eligible: true,
        rewardType: 'BONUS',
        rewardAmount: 100,
        rewardLabel: null,
        selectedRewardLabel: null,
        selectedReward: null,
        xpDelta: 50,
        budgetAmount: null,
        progress: null,
        reasons: [],
        blockers: [],
      },
      {
        id: 'loot-box-other',
        kind: 'LOOT_BOX' as const,
        name: 'Purchase case',
        status: 'ACTIVE',
        triggerKind: 'PRODUCT_PURCHASE',
        evaluationPolicy: 'LIVE_PRIMARY',
        manualApprovalRequired: false,
        eligible: true,
        rewardType: 'LOOT_BOX',
        rewardAmount: 0,
        rewardLabel: null,
        selectedRewardLabel: null,
        selectedReward: null,
        xpDelta: 0,
        budgetAmount: null,
        progress: null,
        reasons: [],
        blockers: [],
      },
    ],
    note: 'dry-run',
  };
}

function createService(options?: {
  anchorFacts?: SessionCorrelationFact[];
  markerFacts?: SessionCorrelationFact[];
  ruleSessionType?: string | null;
  lootBoxRules?: Array<{
    id: string;
    createdAt: Date;
    triggerKind: string;
    sessionType: string | null;
    storeIds: string[];
    limits: Record<string, unknown>;
  }>;
  stores?: Array<{
    id: string;
    externalDomain: string;
    timeZone: string | null;
  }>;
  receiptStatus?: string;
  terminalFactIds?: ReadonlySet<string>;
  graceUntil?: Date;
  claimCount?: number;
  entitlementRuleIds?: string[];
  entitlements?: Array<{
    ruleId: string;
    status: 'AVAILABLE' | 'CONSUMED' | 'CANCELED';
    evidence?: Record<string, unknown> | null;
  }>;
  retryReceipts?: Array<{
    id: string;
    factId: string;
    profileId?: string;
    eventType: string;
    status: string;
    attempts: number;
    graceUntil?: Date;
    claimExpiresAt?: Date | null;
  }>;
  watermark?: { factId: string; ledgerFirstSeenAt: Date } | null;
  recordError?: Error;
  decisionResult?: {
    lootBoxEntitlements: Array<{
      ruleId: string;
      status: string;
    }>;
  };
}) {
  const anchors = options?.anchorFacts ?? [fact()];
  const markers = options?.markerFacts ?? [
    marker({
      sourceExternalId: 'session-42',
      sessionExternalId: 'session-42',
      confidence: 'EXACT',
    }),
  ];
  const prisma = {
    $queryRaw: jest.fn().mockImplementation((query: PrismaSqlQuery) => {
      const receipts = options?.retryReceipts ?? [];
      const knownProfileIds = receipts.flatMap((receipt) =>
        receipt.profileId ? [receipt.profileId] : [],
      );
      const scopedProfileId = knownProfileIds.find((candidate) =>
        query.values.includes(candidate),
      );
      const retryLimit = [...query.values]
        .reverse()
        .find(
          (value): value is number =>
            typeof value === 'number' && Number.isInteger(value),
        );
      return receipts
        .filter(
          (receipt) =>
            !receipt.profileId ||
            !scopedProfileId ||
            receipt.profileId === scopedProfileId,
        )
        .slice(0, retryLimit ?? receipts.length)
        .map((receipt) => ({
          ...receipt,
          policy: 'LOOT_BOX_SESSION_RECOVERY',
          claimedSource: null,
          graceUntil: receipt.graceUntil ?? new Date(now.getTime() - 1_000),
          claimExpiresAt: receipt.claimExpiresAt ?? null,
        }));
    }),
    tenant: { findMany: jest.fn().mockResolvedValue([tenant()]) },
    guestGameLootBox: {
      findMany: jest.fn().mockResolvedValue(
        options?.lootBoxRules ?? [
          {
            id: 'loot-box-1',
            createdAt: new Date('2026-07-20T10:00:00.000Z'),
            triggerKind: 'SESSION_START',
            sessionType:
              options && 'ruleSessionType' in options
                ? options.ruleSessionType
                : 'PACKAGE_OR_SUBSCRIPTION',
            storeIds: ['store-1'],
            limits: { activatedAt: '2026-07-20T10:00:00.000Z' },
          },
        ],
      ),
    },
    store: {
      findMany: jest.fn().mockResolvedValue(
        options?.stores ?? [
          {
            id: 'store-1',
            externalDomain: '46.langamepro.ru',
            timeZone: 'Asia/Yekaterinburg',
          },
        ],
      ),
    },
    guestActivityFact: {
      findMany: jest
        .fn()
        .mockImplementation((query: ActivityFactFindManyQuery) => {
          if (query.where.factType === 'SESSION_STARTED') {
            if (query.where.id?.in) {
              return anchors.filter((anchor) =>
                query.where.id?.in.includes(anchor.id),
              );
            }
            const direction = query.orderBy?.[0]?.createdAt ?? 'asc';
            const candidates = anchors
              .filter(
                (anchor) =>
                  !query.where.createdAt?.gte ||
                  anchor.createdAt >= query.where.createdAt.gte,
              )
              .filter((anchor) => {
                const watermark = options?.watermark;
                if (!query.where.AND || !watermark) return true;
                return (
                  anchor.createdAt > watermark.ledgerFirstSeenAt ||
                  (anchor.createdAt.getTime() ===
                    watermark.ledgerFirstSeenAt.getTime() &&
                    anchor.id > watermark.factId)
                );
              })
              .sort((left, right) => {
                const comparison =
                  left.createdAt.getTime() - right.createdAt.getTime() ||
                  left.id.localeCompare(right.id);
                return direction === 'desc' ? -comparison : comparison;
              });
            return candidates.slice(0, query.take ?? candidates.length);
          }
          return markers;
        }),
    },
    guestGameOriginReceipt: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(options?.watermark ?? null),
      upsert: jest
        .fn()
        .mockImplementation((query: OriginReceiptUpsertQuery) => {
          const retryReceipt = options?.retryReceipts?.find(
            (receipt) =>
              receipt.factId === query.create.factId &&
              receipt.eventType === query.create.eventType,
          );
          return {
            id: retryReceipt?.id ?? `receipt-${query.create.factId}`,
            factId: query.create.factId,
            status:
              retryReceipt?.status ??
              (options?.terminalFactIds?.has(query.create.factId)
                ? 'SHADOWED'
                : (options?.receiptStatus ??
                  query.create.status ??
                  'WAITING_LIVE')),
            policy: query.create.policy ?? 'LOOT_BOX_SESSION_RECOVERY',
            claimedSource: null,
            attempts: retryReceipt?.attempts ?? query.create.attempts ?? 0,
            graceUntil:
              retryReceipt?.graceUntil ??
              options?.graceUntil ??
              new Date(now.getTime() - 1_000),
            claimExpiresAt: retryReceipt?.claimExpiresAt ?? null,
          };
        }),
      updateMany: jest
        .fn()
        .mockResolvedValue({ count: options?.claimCount ?? 1 }),
    },
    guestGameEntitlement: {
      findMany: jest.fn().mockResolvedValue(
        options?.entitlements ??
          (options?.entitlementRuleIds ?? ['loot-box-1']).map((ruleId) => ({
            ruleId,
            status: 'AVAILABLE',
            evidence: null,
          })),
      ),
    },
  };
  const gamification = {
    dryRun: jest.fn().mockResolvedValue(dryRun()),
    recordRuleDecisions: options?.recordError
      ? jest.fn().mockRejectedValue(options.recordError)
      : jest
          .fn()
          .mockResolvedValue(
            options?.decisionResult ?? { lootBoxEntitlements: [] },
          ),
  };
  return {
    service: new GuestGameLootBoxSessionRecoveryService(
      prisma as never,
      gamification as never,
    ),
    prisma,
    gamification,
  };
}

describe('package session correlation', () => {
  it('accepts one guarded inferred marker in the same profile, guest, store and domain', () => {
    const correlation = correlatePackageSessionFact(fact(), [marker()]);

    expect(correlation).toEqual(
      expect.objectContaining({
        status: 'MATCHED',
        candidateIds: ['package-marker-1'],
        deltaMs: 30_000,
      }),
    );
  });

  it.each([
    ['profile', { profileId: 'profile-2' }],
    ['guest', { guestId: 'guest-2' }],
    ['store', { storeId: 'store-2' }],
    ['domain', { externalDomain: 'other.langamepro.ru' }],
    ['external guest', { externalGuestId: 'external-guest-2' }],
    ['unsupported confidence', { confidence: 'LOW' }],
    ['lifecycle', { lifecycleStatus: 'SUPERSEDED' }],
    ['time window', { happenedAt: new Date(sessionAt.getTime() + 60_001) }],
  ])('fails closed when %s differs', (_label, overrides) => {
    expect(
      correlatePackageSessionFact(fact(), [marker(overrides)], 60_000).status,
    ).toBe('UNMATCHED');
  });

  it('fails closed when more than one marker matches', () => {
    const correlation = correlatePackageSessionFact(fact(), [
      marker(),
      marker({ id: 'package-marker-2', sourceHash: 'second-hash' }),
    ]);

    expect(correlation.status).toBe('AMBIGUOUS');
    expect(correlation.candidateIds).toEqual([
      'package-marker-1',
      'package-marker-2',
    ]);
  });

  it('accepts an EXACT structured marker and prefers exact identity over proximity', () => {
    const exactMarker = marker({
      id: 'structured-marker',
      sourceHash: 'structured-hash',
      sourceExternalId: 'structured-source',
      sessionExternalId: 'session-42',
      happenedAt: new Date(sessionAt.getTime() + 50_000),
      confidence: 'EXACT',
    });
    const inferredCloserMarker = marker({
      id: 'inferred-closer',
      happenedAt: new Date(sessionAt.getTime() + 5_000),
    });

    const correlation = correlatePackageSessionFact(fact(), [
      inferredCloserMarker,
      exactMarker,
    ]);

    expect(correlation).toEqual(
      expect.objectContaining({
        status: 'MATCHED',
        marker: expect.objectContaining({ id: 'structured-marker' }),
        candidateIds: ['structured-marker'],
      }),
    );
  });

  it('rejects an exact proximity-only marker when LIVE requires stable session identity', () => {
    const proximityOnlyMarker = marker({
      confidence: 'EXACT',
      sourceExternalId: 'unrelated-log-entry',
      sessionExternalId: null,
    });

    expect(
      correlatePackageSessionFact(fact(), [proximityOnlyMarker], 60_000, true)
        .status,
    ).toBe('UNMATCHED');
  });

  it('never assigns one inferred marker to two close session anchors', () => {
    const secondAnchor = fact({
      id: 'session-fact-2',
      sourceHash: 'session-source-hash-2',
      sourceExternalId: 'session-43',
      sessionExternalId: 'session-43',
      happenedAt: new Date(sessionAt.getTime() + 20_000),
    });
    const sharedMarker = marker({
      happenedAt: new Date(sessionAt.getTime() + 10_000),
    });

    const correlations = correlatePackageSessionFacts(
      [fact(), secondAnchor],
      [sharedMarker],
    );

    expect(correlations.get('session-fact-1')?.status).toBe('AMBIGUOUS');
    expect(correlations.get('session-fact-2')?.status).toBe('AMBIGUOUS');
    expect(
      [...correlations.values()].filter(
        (correlation) => correlation.marker?.id === sharedMarker.id,
      ),
    ).toHaveLength(0);
  });
});

describe('GuestGameLootBoxSessionRecoveryService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('records only a shadow decision in SHADOW mode', async () => {
    const { service, gamification, prisma } = createService({
      markerFacts: [marker()],
    });

    const result = await service.runScheduled({
      mode: 'SHADOW',
      tenantId: 'tenant-1',
      profileId: 'profile-1',
      limit: 1,
      graceMs: 0,
    });

    expect(result).toEqual(
      expect.objectContaining({
        correlatedSessions: 1,
        shadowSessions: 1,
        recoveredSessions: 0,
        matchedRules: 1,
      }),
    );
    expect(gamification.recordRuleDecisions).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        rules: [expect.objectContaining({ id: 'loot-box-1' })],
      }),
      expect.objectContaining({
        evaluationMode: 'SHADOW_LOOT_BOX_RECOVERY',
        sourceFactId: 'session-fact-1',
        sourceFactKind: 'LEDGER_SESSION_PACKAGE_OR_SUBSCRIPTION_CORRELATION',
      }),
    );
    expect(prisma.guestGameOriginReceipt.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'SHADOWED' }),
      }),
    );
  });

  it('claims a SHADOW receipt before evaluating so concurrent replicas cannot duplicate decisions', async () => {
    const { service, gamification } = createService({ claimCount: 0 });

    const result = await service.runScheduled({
      mode: 'SHADOW',
      tenantId: 'tenant-1',
      profileId: 'profile-1',
      limit: 1,
      graceMs: 0,
    });

    expect(result.duplicateSessions).toBe(1);
    expect(gamification.dryRun).not.toHaveBeenCalled();
    expect(gamification.recordRuleDecisions).not.toHaveBeenCalled();
  });

  it('evaluates ANY-session loot boxes from the exact anchor alone', async () => {
    const { service, gamification } = createService({
      ruleSessionType: 'ANY',
      markerFacts: [],
    });

    const result = await service.runScheduled({
      mode: 'SHADOW',
      tenantId: 'tenant-1',
      profileId: 'profile-1',
      limit: 1,
      graceMs: 0,
    });

    expect(result).toEqual(
      expect.objectContaining({
        correlatedSessions: 1,
        unmatchedSessions: 0,
        shadowSessions: 1,
        matchedRules: 1,
      }),
    );
    expect(gamification.dryRun).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        eventType: 'SESSION_START',
        sessionType: null,
        sessionPacket: null,
      }),
      expect.any(Object),
    );
    expect(gamification.recordRuleDecisions).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      expect.objectContaining({
        sourceFactKind: 'LEDGER_SESSION_ANY_CORRELATION',
        evidence: expect.objectContaining({
          correlationStatus: 'MATCHED',
          markerFactId: null,
          sessionClass: 'ANY',
        }),
      }),
    );
  });

  it('recovers an HOURLY SESSION_START only from an exact hourly marker correlated to the anchor', async () => {
    const { service, gamification } = createService({
      ruleSessionType: 'HOURLY',
      markerFacts: [hourlyMarker()],
    });

    const result = await service.runScheduled({
      mode: 'SHADOW',
      tenantId: 'tenant-1',
      profileId: 'profile-1',
      limit: 1,
      graceMs: 0,
    });

    expect(result).toEqual(
      expect.objectContaining({
        correlatedSessions: 1,
        unmatchedSessions: 0,
        shadowSessions: 1,
        matchedRules: 1,
      }),
    );
    expect(gamification.dryRun).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        eventType: 'SESSION_START',
        sessionType: 'HOURLY',
        sessionPacket: false,
      }),
      expect.any(Object),
    );
    expect(gamification.recordRuleDecisions).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      expect.objectContaining({
        sourceFactKind: 'LEDGER_SESSION_HOURLY_CORRELATION',
        evidence: expect.objectContaining({
          correlationStatus: 'MATCHED',
          anchorFactId: 'session-fact-1',
          markerFactId: 'hourly-marker-1',
          markerFactType: 'HOURLY_SESSION_STARTED',
          sessionClass: 'HOURLY',
        }),
      }),
    );
  });

  it('does not recover an HOURLY SESSION_START from a package marker', async () => {
    const { service, gamification } = createService({
      ruleSessionType: 'HOURLY',
      markerFacts: [marker()],
    });

    const result = await service.runScheduled({
      mode: 'SHADOW',
      tenantId: 'tenant-1',
      profileId: 'profile-1',
      limit: 1,
      graceMs: 0,
    });

    expect(result).toEqual(
      expect.objectContaining({
        correlatedSessions: 0,
        unmatchedSessions: 1,
        shadowSessions: 0,
        matchedRules: 0,
      }),
    );
    expect(gamification.dryRun).not.toHaveBeenCalled();
    expect(gamification.recordRuleDecisions).not.toHaveBeenCalled();
  });

  it('creates a LIVE entitlement observation without processEvent or rewards', async () => {
    const { service, gamification, prisma } = createService();

    const result = await service.runScheduled({
      mode: 'LIVE',
      tenantId: 'tenant-1',
      profileId: 'profile-1',
      liveNotBefore: '2026-07-20T10:00:00.000Z',
      limit: 1,
      graceMs: 0,
    });

    expect(result.recoveredSessions).toBe(1);
    expect(result.matchedRules).toBe(1);
    expect(gamification.recordRuleDecisions).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        eventType: 'SESSION_START',
        input: expect.objectContaining({
          sessionType: 'PACKAGE_OR_SUBSCRIPTION',
          sessionPacket: true,
        }),
      }),
      expect.objectContaining({
        evaluationMode: 'LIVE_LOOT_BOX_RECOVERY',
        evaluatorVersion: 'loot-box-session-recovery-v1',
        evidence: expect.objectContaining({
          correlationStatus: 'MATCHED',
          anchorFactId: 'session-fact-1',
          markerFactId: 'package-marker-1',
          sessionClass: 'PACKAGE_OR_SUBSCRIPTION',
          entitlementOnly: true,
        }),
      }),
    );
    expect(prisma.guestGameOriginReceipt.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PROCESSED' }),
      }),
    );
    expect(gamification).not.toHaveProperty('processEvent');
  });

  it('refuses an inferred package classification in LIVE mode', async () => {
    const { service, gamification } = createService({
      markerFacts: [marker()],
    });

    const result = await service.runScheduled({
      mode: 'LIVE',
      tenantId: 'tenant-1',
      profileId: 'profile-1',
      liveNotBefore: '2026-07-20T10:00:00.000Z',
      limit: 1,
      graceMs: 0,
    });

    expect(result).toEqual(
      expect.objectContaining({
        correlatedSessions: 0,
        unmatchedSessions: 1,
        recoveredSessions: 0,
        matchedRules: 0,
      }),
    );
    expect(gamification.dryRun).not.toHaveBeenCalled();
    expect(gamification.recordRuleDecisions).not.toHaveBeenCalled();
  });

  it('keeps an exact proximity-only marker on the correlation wait path in LIVE mode', async () => {
    const { service, gamification, prisma } = createService({
      markerFacts: [
        marker({
          confidence: 'EXACT',
          sourceExternalId: 'unrelated-log-entry',
          sessionExternalId: null,
        }),
      ],
    });

    const result = await service.runScheduled({
      mode: 'LIVE',
      tenantId: 'tenant-1',
      profileId: 'profile-1',
      liveNotBefore: '2026-07-20T10:00:00.000Z',
      limit: 1,
      graceMs: 0,
    });

    expect(result).toEqual(
      expect.objectContaining({
        unmatchedSessions: 1,
        recoveredSessions: 0,
      }),
    );
    expect(gamification.dryRun).not.toHaveBeenCalled();
    expect(prisma.guestGameOriginReceipt.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          factId: 'session-fact-1',
          eventType: 'SESSION_PACKAGE_OR_SUBSCRIPTION_CORRELATION',
          status: 'WAITING_CORRELATION',
        }),
      }),
    );
  });

  it('fails closed when exact hourly and package markers classify the same session', async () => {
    const { service, gamification, prisma } = createService({
      markerFacts: [
        marker({
          confidence: 'EXACT',
          sourceExternalId: 'session-42',
          sessionExternalId: 'session-42',
        }),
        hourlyMarker(),
      ],
    });

    const result = await service.runScheduled({
      mode: 'LIVE',
      tenantId: 'tenant-1',
      profileId: 'profile-1',
      liveNotBefore: '2026-07-20T10:00:00.000Z',
      limit: 1,
      graceMs: 0,
    });

    expect(result.ambiguousSessions).toBe(1);
    expect(result.recoveredSessions).toBe(0);
    expect(gamification.dryRun).not.toHaveBeenCalled();
    const recoveryUpserts = prisma.guestGameOriginReceipt.upsert.mock
      .calls as unknown as Array<[OriginReceiptUpsertQuery]>;
    expect(
      recoveryUpserts.filter(
        ([query]) => query.create.status === 'WAITING_CORRELATION',
      ),
    ).toHaveLength(1);
  });

  it('accepts a domain-only anchor only when the rule covers every club in the domain', async () => {
    const stores = [
      {
        id: 'store-1',
        externalDomain: '46.langamepro.ru',
        timeZone: 'Asia/Yekaterinburg',
      },
      {
        id: 'store-2',
        externalDomain: '46.langamepro.ru',
        timeZone: 'Asia/Yekaterinburg',
      },
    ];
    const { service, gamification } = createService({
      anchorFacts: [fact({ storeId: null })],
      markerFacts: [
        marker({
          storeId: null,
          confidence: 'EXACT',
          sourceExternalId: 'session-42',
          sessionExternalId: 'session-42',
        }),
      ],
      lootBoxRules: [lootBoxRule({ storeIds: ['store-1', 'store-2'] })],
      stores,
    });

    const result = await service.runScheduled({
      mode: 'SHADOW',
      tenantId: 'tenant-1',
      profileId: 'profile-1',
      limit: 1,
      graceMs: 0,
    });

    expect(result.shadowSessions).toBe(1);
    expect(gamification.dryRun).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ storeId: null }),
      expect.any(Object),
    );
  });

  it.each([
    [
      'only a subset of clubs is selected',
      ['store-1'],
      [
        {
          id: 'store-1',
          externalDomain: '46.langamepro.ru',
          timeZone: 'Asia/Yekaterinburg',
        },
        {
          id: 'store-2',
          externalDomain: '46.langamepro.ru',
          timeZone: 'Asia/Yekaterinburg',
        },
      ],
    ],
    [
      'the domain timezone is ambiguous',
      ['store-1', 'store-2'],
      [
        {
          id: 'store-1',
          externalDomain: '46.langamepro.ru',
          timeZone: 'Asia/Yekaterinburg',
        },
        {
          id: 'store-2',
          externalDomain: '46.langamepro.ru',
          timeZone: 'Europe/Moscow',
        },
      ],
    ],
  ])(
    'fails closed for a domain-only anchor when %s',
    async (_label, storeIds, stores) => {
      const { service, gamification } = createService({
        anchorFacts: [fact({ storeId: null })],
        markerFacts: [
          marker({
            storeId: null,
            confidence: 'EXACT',
            sourceExternalId: 'session-42',
            sessionExternalId: 'session-42',
          }),
        ],
        lootBoxRules: [lootBoxRule({ storeIds })],
        stores,
      });

      const result = await service.runScheduled({
        mode: 'SHADOW',
        tenantId: 'tenant-1',
        profileId: 'profile-1',
        limit: 1,
        graceMs: 0,
      });

      expect(result.recoveredSessions).toBe(0);
      expect(result.shadowSessions).toBe(0);
      expect(gamification.dryRun).not.toHaveBeenCalled();
    },
  );

  it('marks LIVE recovery failed when entitlement persistence is not confirmed', async () => {
    const { service, prisma } = createService({ entitlementRuleIds: [] });

    const result = await service.runScheduled({
      mode: 'LIVE',
      tenantId: 'tenant-1',
      profileId: 'profile-1',
      liveNotBefore: '2026-07-20T10:00:00.000Z',
      limit: 1,
      graceMs: 0,
    });

    expect(result.failedSessions).toBe(1);
    expect(result.recoveredSessions).toBe(0);
    expect(prisma.guestGameOriginReceipt.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          lastError: expect.stringContaining(
            'entitlement persistence was not confirmed',
          ),
        }),
      }),
    );
  });

  it.each(['LIMIT_EXHAUSTED', 'RULE_INACTIVE'])(
    'treats %s as a legitimate terminal entitlement outcome',
    async (status) => {
      const { service, prisma } = createService({
        entitlementRuleIds: [],
        decisionResult: {
          lootBoxEntitlements: [{ ruleId: 'loot-box-1', status }],
        },
      });

      const result = await service.runScheduled({
        mode: 'LIVE',
        tenantId: 'tenant-1',
        profileId: 'profile-1',
        liveNotBefore: '2026-07-20T10:00:00.000Z',
        limit: 1,
        graceMs: 0,
      });

      expect(result.recoveredSessions).toBe(1);
      expect(result.failedSessions).toBe(0);
      expect(prisma.guestGameOriginReceipt.updateMany).toHaveBeenLastCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'PROCESSED' }),
        }),
      );
    },
  );

  it('treats a durable canceled limit entitlement as terminal on retry', async () => {
    const { service, prisma } = createService({
      decisionResult: {
        lootBoxEntitlements: [{ ruleId: 'loot-box-1', status: 'IDEMPOTENT' }],
      },
      entitlements: [
        {
          ruleId: 'loot-box-1',
          status: 'CANCELED',
          evidence: { issuanceOutcome: 'LIMIT_EXHAUSTED' },
        },
      ],
    });

    const result = await service.runScheduled({
      mode: 'LIVE',
      tenantId: 'tenant-1',
      profileId: 'profile-1',
      liveNotBefore: '2026-07-20T10:00:00.000Z',
      limit: 1,
      graceMs: 0,
    });

    expect(result.recoveredSessions).toBe(1);
    expect(result.failedSessions).toBe(0);
    expect(prisma.guestGameOriginReceipt.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PROCESSED' }),
      }),
    );
  });

  it('keeps PERSISTENCE_FAILED on the bounded retry path', async () => {
    const { service, prisma } = createService({
      entitlementRuleIds: [],
      decisionResult: {
        lootBoxEntitlements: [
          { ruleId: 'loot-box-1', status: 'PERSISTENCE_FAILED' },
        ],
      },
    });

    const result = await service.runScheduled({
      mode: 'LIVE',
      tenantId: 'tenant-1',
      profileId: 'profile-1',
      liveNotBefore: '2026-07-20T10:00:00.000Z',
      limit: 1,
      graceMs: 0,
    });

    expect(result.failedSessions).toBe(1);
    expect(result.recoveredSessions).toBe(0);
    expect(prisma.guestGameOriginReceipt.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED' }),
      }),
    );
  });

  it('defers LIVE processing during the grace window', async () => {
    const { service, gamification } = createService({
      graceUntil: new Date(now.getTime() + 30_000),
    });

    const result = await service.runScheduled({
      mode: 'LIVE',
      tenantId: 'tenant-1',
      profileId: 'profile-1',
      liveNotBefore: '2026-07-20T10:00:00.000Z',
      limit: 1,
    });

    expect(result.deferredSessions).toBe(1);
    expect(gamification.dryRun).not.toHaveBeenCalled();
    expect(gamification.recordRuleDecisions).not.toHaveBeenCalled();
  });

  it('does not evaluate ambiguous correlations', async () => {
    const { service, gamification } = createService({
      markerFacts: [
        marker(),
        marker({ id: 'package-marker-2', sourceHash: 'second-hash' }),
      ],
    });

    const result = await service.runScheduled({
      mode: 'SHADOW',
      tenantId: 'tenant-1',
      profileId: 'profile-1',
      limit: 1,
    });

    expect(result.ambiguousSessions).toBe(1);
    expect(gamification.dryRun).not.toHaveBeenCalled();
    expect(gamification.recordRuleDecisions).not.toHaveBeenCalled();
  });

  it('keeps discovery bounded while an old terminal page cannot hide a new fact', async () => {
    const anchors = [
      fact({
        id: 'session-fact-old',
        sourceExternalId: 'session-old',
        sessionExternalId: 'session-old',
        createdAt: new Date('2026-07-20T11:57:00.000Z'),
      }),
      fact({
        id: 'session-fact-new',
        sourceExternalId: 'session-new',
        sessionExternalId: 'session-new',
        createdAt: new Date('2026-07-20T11:59:00.000Z'),
      }),
    ];
    const { service, gamification, prisma } = createService({
      anchorFacts: anchors,
      markerFacts: [],
      ruleSessionType: 'ANY',
      terminalFactIds: new Set(['session-fact-old']),
    });

    const result = await service.runScheduled({
      mode: 'SHADOW',
      tenantId: 'tenant-1',
      profileId: 'profile-1',
      limit: 1,
      graceMs: 0,
    });

    expect(result).toEqual(
      expect.objectContaining({
        checkedSessions: 2,
        duplicateSessions: 1,
        shadowSessions: 1,
      }),
    );
    expect(gamification.recordRuleDecisions).toHaveBeenCalledTimes(1);
    expect(gamification.recordRuleDecisions).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      expect.objectContaining({ sourceFactId: 'session-fact-new' }),
    );
    const anchorQueries = (
      prisma.guestActivityFact.findMany.mock.calls as unknown as Array<
        [ActivityFactFindManyQuery]
      >
    )
      .map(([query]) => query)
      .filter((query) => query.where.factType === 'SESSION_STARTED');
    expect(anchorQueries).toHaveLength(2);
    expect(anchorQueries.every((query) => (query.take ?? 0) <= 1)).toBe(true);
    expect(prisma.guestGameOriginReceipt.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          policy: 'LOOT_BOX_SESSION_RECOVERY_WATERMARK',
          factId: 'session-fact-old',
        }),
      }),
    );
  });

  it('resumes strict discovery from the persisted createdAt and id watermark after restart', async () => {
    const oldFact = fact({
      id: 'session-fact-old',
      sourceExternalId: 'session-old',
      sessionExternalId: 'session-old',
      createdAt: new Date('2026-07-20T11:57:00.000Z'),
    });
    const newFact = fact({
      id: 'session-fact-new',
      sourceExternalId: 'session-new',
      sessionExternalId: 'session-new',
      createdAt: new Date('2026-07-20T11:59:00.000Z'),
    });
    const { service, gamification, prisma } = createService({
      anchorFacts: [oldFact, newFact],
      markerFacts: [],
      ruleSessionType: 'ANY',
      watermark: {
        factId: oldFact.id,
        ledgerFirstSeenAt: oldFact.createdAt,
      },
    });

    const result = await service.runScheduled({
      mode: 'SHADOW',
      tenantId: 'tenant-1',
      profileId: 'profile-1',
      limit: 1,
      overlapLimit: 1,
      graceMs: 0,
    });

    expect(result.shadowSessions).toBe(1);
    expect(gamification.recordRuleDecisions).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      expect.objectContaining({ sourceFactId: 'session-fact-new' }),
    );
    expect(prisma.guestGameOriginReceipt.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId_originKey: {
            tenantId: 'tenant-1',
            originKey:
              'guest-game:loot-box-session-recovery:watermark:v1:shadow:profile-1',
          },
        },
      }),
    );
  });

  it('re-correlates a recent anchor when its typed marker arrives after the watermark advanced', async () => {
    const anchor = fact({
      createdAt: new Date('2026-07-20T11:57:00.000Z'),
    });
    const { service, gamification } = createService({
      anchorFacts: [anchor],
      markerFacts: [marker()],
      watermark: {
        factId: anchor.id,
        ledgerFirstSeenAt: anchor.createdAt,
      },
    });

    const result = await service.runScheduled({
      mode: 'SHADOW',
      tenantId: 'tenant-1',
      profileId: 'profile-1',
      limit: 1,
      overlapLimit: 1,
      lookbackMs: 60 * 60_000,
      graceMs: 0,
    });

    expect(result.shadowSessions).toBe(1);
    expect(gamification.recordRuleDecisions).toHaveBeenCalledTimes(1);
  });

  it('persists an unmatched typed-session pair before advancing the discovery watermark', async () => {
    const { service, prisma } = createService({ markerFacts: [] });

    await service.runScheduled({
      mode: 'SHADOW',
      tenantId: 'tenant-1',
      profileId: 'profile-1',
      limit: 1,
      graceMs: 0,
    });

    const upserts = (
      prisma.guestGameOriginReceipt.upsert.mock.calls as unknown as Array<
        [OriginReceiptUpsertQuery]
      >
    ).map(([query]) => query);
    const waitingIndex = upserts.findIndex(
      (query) => query.create.status === 'WAITING_CORRELATION',
    );
    const watermarkIndex = upserts.findIndex(
      (query) => query.create.policy === 'LOOT_BOX_SESSION_RECOVERY_WATERMARK',
    );
    expect(waitingIndex).toBeGreaterThanOrEqual(0);
    expect(watermarkIndex).toBeGreaterThan(waitingIndex);
  });

  it('keeps an unresolved correlation waiting past the processing attempt budget', async () => {
    const anchor = fact();
    const { service, gamification, prisma } = createService({
      anchorFacts: [anchor],
      markerFacts: [],
      retryReceipts: [
        {
          id: 'receipt-waiting-marker',
          factId: anchor.id,
          eventType: 'SESSION_PACKAGE_OR_SUBSCRIPTION_CORRELATION',
          status: 'WAITING_CORRELATION',
          attempts: 99,
        },
      ],
      watermark: {
        factId: anchor.id,
        ledgerFirstSeenAt: anchor.createdAt,
      },
    });

    const result = await service.runScheduled({
      mode: 'LIVE',
      tenantId: 'tenant-1',
      profileId: 'profile-1',
      liveNotBefore: '2026-07-20T10:00:00.000Z',
      maxAttempts: 5,
      overlapLimit: 1,
      graceMs: 0,
    });

    expect(result.deadLetterSessions).toBe(0);
    expect(result.failedSessions).toBe(0);
    expect(gamification.dryRun).not.toHaveBeenCalled();
    expect(prisma.guestGameOriginReceipt.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'receipt-waiting-marker',
          status: 'WAITING_CORRELATION',
          attempts: 99,
        }),
        data: expect.objectContaining({
          status: 'WAITING_CORRELATION',
          attempts: 0,
        }),
      }),
    );
  });

  it('dead-letters an unresolved correlation only after its lookback expires', async () => {
    const expiredAnchor = fact({
      happenedAt: new Date('2026-07-20T10:30:00.000Z'),
      createdAt: new Date('2026-07-20T10:30:00.000Z'),
    });
    const { service, gamification, prisma } = createService({
      anchorFacts: [expiredAnchor],
      markerFacts: [],
      retryReceipts: [
        {
          id: 'receipt-expired-marker',
          factId: expiredAnchor.id,
          eventType: 'SESSION_PACKAGE_OR_SUBSCRIPTION_CORRELATION',
          status: 'WAITING_CORRELATION',
          attempts: 0,
        },
      ],
      watermark: {
        factId: expiredAnchor.id,
        ledgerFirstSeenAt: expiredAnchor.createdAt,
      },
    });

    const result = await service.runScheduled({
      mode: 'LIVE',
      tenantId: 'tenant-1',
      profileId: 'profile-1',
      liveNotBefore: '2026-07-20T10:00:00.000Z',
      lookbackMs: 60 * 60_000,
      overlapLimit: 1,
      graceMs: 0,
    });

    expect(result.deadLetterSessions).toBe(1);
    expect(result.failedSessions).toBe(1);
    expect(gamification.dryRun).not.toHaveBeenCalled();
    expect(prisma.guestGameOriginReceipt.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'receipt-expired-marker',
          status: 'WAITING_CORRELATION',
        }),
        data: expect.objectContaining({
          status: 'DEAD_LETTER',
          attempts: 0,
        }),
      }),
    );
  });

  it('recovers a waiting correlation when the exact marker arrives after the watermark', async () => {
    const anchor = fact();
    const { service, gamification, prisma } = createService({
      anchorFacts: [anchor],
      retryReceipts: [
        {
          id: 'receipt-late-marker',
          factId: anchor.id,
          eventType: 'SESSION_PACKAGE_OR_SUBSCRIPTION_CORRELATION',
          status: 'WAITING_CORRELATION',
          attempts: 99,
        },
      ],
      watermark: {
        factId: anchor.id,
        ledgerFirstSeenAt: anchor.createdAt,
      },
    });

    const result = await service.runScheduled({
      mode: 'LIVE',
      tenantId: 'tenant-1',
      profileId: 'profile-1',
      liveNotBefore: '2026-07-20T10:00:00.000Z',
      overlapLimit: 1,
      graceMs: 0,
    });

    expect(result.recoveredSessions).toBe(1);
    expect(prisma.guestGameOriginReceipt.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'receipt-late-marker',
          attempts: { equals: 99 },
        }),
        data: expect.objectContaining({
          status: 'PROCESSING',
          attempts: 1,
        }),
      }),
    );
    expect(gamification.recordRuleDecisions).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      expect.objectContaining({
        evaluationRunId: 'loot-box-session-recovery:receipt-late-marker:live',
      }),
    );
  });

  it('applies profile scope before the retry LIMIT so other profiles cannot starve the canary', async () => {
    const anchor = fact();
    const foreignReceipts = Array.from({ length: 30 }, (_, index) => ({
      id: `foreign-receipt-${index}`,
      factId: `foreign-fact-${index}`,
      profileId: 'profile-2',
      eventType: 'SESSION_PACKAGE_OR_SUBSCRIPTION_CORRELATION',
      status: 'FAILED',
      attempts: 1,
    }));
    const { service, gamification, prisma } = createService({
      anchorFacts: [anchor],
      retryReceipts: [
        ...foreignReceipts,
        {
          id: 'receipt-profile-1',
          factId: anchor.id,
          profileId: 'profile-1',
          eventType: 'SESSION_PACKAGE_OR_SUBSCRIPTION_CORRELATION',
          status: 'FAILED',
          attempts: 1,
        },
      ],
      watermark: {
        factId: anchor.id,
        ledgerFirstSeenAt: anchor.createdAt,
      },
    });

    const result = await service.runScheduled({
      mode: 'LIVE',
      tenantId: 'tenant-1',
      profileId: 'profile-1',
      liveNotBefore: '2026-07-20T10:00:00.000Z',
      retryLimit: 1,
      overlapLimit: 1,
      graceMs: 0,
    });

    expect(result.recoveredSessions).toBe(1);
    expect(gamification.recordRuleDecisions).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      expect.objectContaining({
        evaluationRunId: 'loot-box-session-recovery:receipt-profile-1:live',
      }),
    );
    const [retryQuery] = prisma.$queryRaw.mock.calls[0] as [PrismaSqlQuery];
    const retrySql = retryQuery.strings.join(' ');
    expect(retrySql).toContain('FROM "GuestActivityFact" AS fact');
    expect(retrySql).toContain('fact."profileId" =');
    expect(retrySql.indexOf('fact."profileId" =')).toBeLessThan(
      retrySql.indexOf('LIMIT'),
    );
    expect(retryQuery.values).toContain('profile-1');
  });

  it('retries a failed LIVE receipt through the separate bounded retry queue', async () => {
    const anchor = fact();
    const { service, gamification, prisma } = createService({
      anchorFacts: [anchor],
      retryReceipts: [
        {
          id: 'receipt-retry',
          factId: anchor.id,
          eventType: 'SESSION_PACKAGE_OR_SUBSCRIPTION_CORRELATION',
          status: 'FAILED',
          attempts: 1,
        },
      ],
      watermark: {
        factId: anchor.id,
        ledgerFirstSeenAt: anchor.createdAt,
      },
    });

    const result = await service.runScheduled({
      mode: 'LIVE',
      tenantId: 'tenant-1',
      profileId: 'profile-1',
      liveNotBefore: '2026-07-20T10:00:00.000Z',
      retryLimit: 1,
      overlapLimit: 1,
      graceMs: 0,
    });

    expect(result.recoveredSessions).toBe(1);
    expect(gamification.recordRuleDecisions).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      expect.objectContaining({
        evaluationRunId: 'loot-box-session-recovery:receipt-retry:live',
        replaceExistingRun: true,
      }),
    );
    expect(prisma.guestGameOriginReceipt.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'receipt-retry',
          attempts: { equals: 1, lt: 5 },
        }),
      }),
    );
  });

  it('dead-letters a retry receipt that exhausted max attempts', async () => {
    const anchor = fact();
    const { service, gamification, prisma } = createService({
      anchorFacts: [anchor],
      retryReceipts: [
        {
          id: 'receipt-dead',
          factId: anchor.id,
          eventType: 'SESSION_PACKAGE_OR_SUBSCRIPTION_CORRELATION',
          status: 'FAILED',
          attempts: 5,
        },
      ],
      watermark: {
        factId: anchor.id,
        ledgerFirstSeenAt: anchor.createdAt,
      },
    });

    const result = await service.runScheduled({
      mode: 'LIVE',
      tenantId: 'tenant-1',
      profileId: 'profile-1',
      liveNotBefore: '2026-07-20T10:00:00.000Z',
      maxAttempts: 5,
      overlapLimit: 1,
    });

    expect(result.deadLetterSessions).toBe(1);
    expect(gamification.recordRuleDecisions).not.toHaveBeenCalled();
    expect(prisma.guestGameOriginReceipt.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'DEAD_LETTER' }),
      }),
    );
  });

  it('uses one deterministic replaceable decision run during a partial retry', async () => {
    const anchor = fact();
    const { service, gamification } = createService({
      anchorFacts: [anchor],
      retryReceipts: [
        {
          id: 'receipt-partial',
          factId: anchor.id,
          eventType: 'SESSION_PACKAGE_OR_SUBSCRIPTION_CORRELATION',
          status: 'FAILED',
          attempts: 2,
        },
      ],
      watermark: {
        factId: anchor.id,
        ledgerFirstSeenAt: anchor.createdAt,
      },
    });

    await service.runScheduled({
      mode: 'LIVE',
      tenantId: 'tenant-1',
      profileId: 'profile-1',
      liveNotBefore: '2026-07-20T10:00:00.000Z',
      overlapLimit: 1,
      graceMs: 0,
    });

    expect(gamification.recordRuleDecisions).toHaveBeenCalledTimes(1);
    expect(gamification.recordRuleDecisions).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      expect.objectContaining({
        evaluationRunId: 'loot-box-session-recovery:receipt-partial:live',
        replaceExistingRun: true,
      }),
    );
  });

  it('keeps LIVE disabled without an explicit tenant, profile and cutoff', async () => {
    const { service, prisma } = createService();

    const result = await service.runScheduled({ mode: 'LIVE' });

    expect(result.checkedTenants).toBe(0);
    expect(prisma.tenant.findMany).not.toHaveBeenCalled();
  });
});

describe('routeLootBoxSessionRecoveryDryRun', () => {
  it('removes missions and unrelated loot boxes from the recovery decision', () => {
    const routed = routeLootBoxSessionRecoveryDryRun(
      dryRun() as never,
      new Set(['loot-box-1']),
    );

    expect(routed.rules.map((rule) => rule.id)).toEqual(['loot-box-1']);
    expect(routed.summary).toEqual(
      expect.objectContaining({
        checkedRules: 1,
        eligibleRules: 1,
        projectedXpDelta: 0,
      }),
    );
  });
});

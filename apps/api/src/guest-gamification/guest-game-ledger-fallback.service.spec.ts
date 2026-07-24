import { IntegrationProvider, TenantLifecycleStatus } from '@prisma/client';
import { ConflictException } from '@nestjs/common';
import * as exactOwnerReconciler from './guest-game-exact-owner-reconciler';
import { GuestGameLedgerFallbackService } from './guest-game-ledger-fallback.service';

const now = new Date('2026-07-18T12:00:00.000Z');
const liveCanaryScope = {
  tenantId: 'tenant-1',
  profileId: 'profile-1',
  seasonId: 'season-1',
  battlePassStep: 2,
  liveNotBefore: '2026-07-18T11:55:00.000Z',
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

function fact(validFrom: Date) {
  return {
    id: 'fact-1',
    tenantId: 'tenant-1',
    profileId: 'profile-1',
    guestId: 'guest-1',
    storeId: 'store-1',
    externalProvider: IntegrationProvider.LANGAME,
    externalDomain: '46.langamepro.ru',
    sourceKind: 'LANGAME_GUEST_LOG',
    sourceHash: 'ledger-parser-version-specific-hash',
    sourceExternalId: 'session-42',
    sessionExternalId: 'session-42',
    factType: 'HOURLY_PLAY_TIME_ACCUMULATED',
    lifecycleStatus: 'ACTIVE',
    confidence: 'EXACT',
    supersededAt: null,
    validFrom,
    updatedAt: validFrom,
    happenedAt: validFrom,
    durationMinutes: 60,
    amount: null,
    evidence: {},
  };
}

function sessionStartFact(
  validFrom: Date,
  factType:
    | 'SESSION_STARTED'
    | 'HOURLY_SESSION_STARTED'
    | 'PACKAGE_OR_SUBSCRIPTION_USED' = 'SESSION_STARTED',
) {
  return {
    ...fact(validFrom),
    id: `fact-${factType.toLowerCase()}`,
    sourceExternalId: `parser-row-${factType.toLowerCase()}`,
    factType,
    durationMinutes: null,
  };
}

function processedExactReceipt(
  id: string,
  factId: string,
  eventId: string,
  updatedAt: Date,
) {
  return {
    id,
    originKey: `exact-origin-${id}`,
    factId,
    eventId,
    eventType: 'PLAY_HOUR',
    policy: 'EXACT_OPERATOR_CANONICALIZATION',
    status: 'PROCESSED',
    claimedSource: 'EXACT_CANONICALIZATION',
    externalProvider: IntegrationProvider.LANGAME,
    externalDomain: '46.langamepro.ru',
    ledgerFirstSeenAt: updatedAt,
    graceUntil: updatedAt,
    attempts: 1,
    claimExpiresAt: null,
    processedAt: updatedAt,
    lastError: null,
    updatedAt,
  };
}

function exactReconciliationMarker(
  id: string,
  factId: string,
  eventId: string,
  status: 'WAITING_LIVE' | 'QUARANTINED' = 'WAITING_LIVE',
) {
  return {
    id,
    factId,
    eventId,
    policy: 'EXACT_CANONICAL_RULE_RECONCILIATION',
    status,
    claimedSource:
      status === 'QUARANTINED' ? 'LEDGER_FALLBACK_EXACT_RECONCILIATION' : null,
    ledgerFirstSeenAt: now,
    graceUntil: now,
    attempts: 0,
    claimExpiresAt: null,
    processedAt: null,
    lastError: null,
  };
}

function dryRun() {
  return {
    dryRun: true,
    eventType: 'PLAY_HOUR',
    occurredAt: now.toISOString(),
    profile: null,
    guest: null,
    store: null,
    input: {},
    summary: {
      checkedRules: 1,
      eligibleRules: 1,
      blockedRules: 0,
      estimatedRewardAmount: 50,
      projectedXpDelta: 10,
    },
    rules: [
      {
        id: 'mission-1',
        kind: 'MISSION',
        name: 'One hour',
        status: 'ACTIVE',
        triggerKind: 'PLAY_HOUR',
        evaluationPolicy: 'LIVE_WITH_LEDGER_FALLBACK',
        manualApprovalRequired: false,
        eligible: true,
        rewardType: 'BONUS',
        rewardAmount: 50,
        rewardLabel: '50 bonuses',
        selectedRewardLabel: null,
        selectedReward: null,
        xpDelta: 10,
        budgetAmount: null,
        progress: null,
        reasons: [],
        blockers: [],
      },
      {
        id: 'loot-box-1',
        kind: 'LOOT_BOX',
        name: 'One-hour entitlement',
        status: 'ACTIVE',
        triggerKind: 'PLAY_HOUR',
        evaluationPolicy: 'LIVE_WITH_LEDGER_FALLBACK',
        manualApprovalRequired: false,
        rewardMaterializationSuppressed: true,
        eligible: true,
        rewardType: 'LOOT_BOX',
        rewardAmount: null,
        rewardLabel: 'Club container',
        selectedRewardLabel: 'Club container',
        selectedReward: null,
        xpDelta: 0,
        budgetAmount: null,
        progress: null,
        reasons: [],
        blockers: [],
      },
      {
        id: 'season-1',
        kind: 'SEASON',
        name: 'Safe Battle Pass step',
        status: 'ACTIVE',
        triggerKind: 'PLAY_HOUR',
        evaluationPolicy: 'LIVE_WITH_LEDGER_FALLBACK',
        battlePassStep: 2,
        manualApprovalRequired: false,
        eligible: true,
        rewardType: 'BONUS_BALANCE',
        rewardAmount: 50,
        rewardLabel: '50 bonuses',
        selectedRewardLabel: null,
        selectedReward: null,
        xpDelta: 0,
        budgetAmount: null,
        progress: null,
        reasons: [],
        blockers: [],
      },
    ],
    note: '',
  };
}

function sessionStartDryRun() {
  const base = dryRun();
  const rules = [
    {
      ...base.rules[1],
      id: 'loot-box-start',
      name: 'Session-start entitlement',
      triggerKind: 'SESSION_START',
    },
    {
      ...base.rules[2],
      id: 'season-1',
      name: 'Session-start Battle Pass step',
      triggerKind: 'SESSION_START',
      battlePassStep: 2,
    },
  ];
  return {
    ...base,
    eventType: 'SESSION_START',
    rules,
    summary: {
      ...base.summary,
      checkedRules: rules.length,
      eligibleRules: rules.length,
    },
  };
}

function domainAwareDryRun(
  dto: { storeId?: string | null; externalDomain?: string | null },
  options: {
    ruleExternalDomains?: ReadonlyMap<string, readonly string[]>;
  },
  rules: Array<{ id: string; storeIds: string[] }>,
) {
  const matchedRules = rules.filter((rule) =>
    dto.storeId
      ? rule.storeIds.includes(dto.storeId)
      : Boolean(
          dto.externalDomain &&
          options.ruleExternalDomains
            ?.get(rule.id)
            ?.includes(dto.externalDomain),
        ),
  );
  const base = dryRun();
  const routedRules = matchedRules.map((rule, index) => ({
    ...base.rules[0],
    id: rule.id,
    name: `Rule ${index + 1}`,
  }));

  return {
    ...base,
    rules: routedRules,
    summary: {
      ...base.summary,
      checkedRules: routedRules.length,
      eligibleRules: routedRules.length,
      blockedRules: 0,
    },
  };
}

function createService(options?: {
  validFrom?: Date;
  liveEventId?: string | null;
  receiptGraceUntil?: Date;
}) {
  const validFrom = options?.validFrom ?? new Date(now.getTime() - 60_000);
  const prisma = {
    tenant: {
      findMany: jest.fn().mockResolvedValue([tenant()]),
    },
    guestGameMission: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'mission-1',
          createdAt: new Date('2026-07-01T00:00:00.000Z'),
          updatedAt: new Date('2026-07-17T00:00:00.000Z'),
          definitionVersion: 2,
          missionType: 'PLAY_TIME',
          evaluationPolicy: 'LIVE_PRIMARY',
          conditions: {
            schemaVersion: 2,
            taskType: 'PLAY_TIME',
          },
          periodFrom: null,
          storeIds: ['store-1'],
        },
      ]),
    },
    guestGameLootBox: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'loot-box-1',
          createdAt: new Date('2026-07-01T00:00:00.000Z'),
          updatedAt: new Date('2026-07-17T00:00:00.000Z'),
          triggerKind: 'PLAY_HOUR',
          periodRules: { evaluationPolicy: 'LIVE_PRIMARY' },
          limits: {},
          storeIds: ['store-1'],
        },
      ]),
    },
    guestGameSeason: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'season-1',
          createdAt: new Date('2026-07-01T00:00:00.000Z'),
          updatedAt: new Date('2026-07-17T00:00:00.000Z'),
          periodFrom: null,
          storeIds: ['store-1'],
          levels: [
            {
              sequence: 1,
              activationRules: { evaluationPolicy: 'LIVE_PRIMARY' },
            },
            {
              sequence: 2,
              activationRules: {
                schemaVersion: 2,
                taskType: 'PLAY_TIME',
                evaluationPolicy: 'LIVE_PRIMARY',
              },
            },
          ],
        },
      ]),
    },
    store: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'store-1',
          externalDomain: '46.langamepro.ru',
          timeZone: 'Asia/Yekaterinburg',
        },
      ]),
    },
    guestActivityFact: {
      findMany: jest.fn().mockResolvedValue([fact(validFrom)]),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    guestGameOriginReceipt: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue({
        id: 'receipt-1',
        status: 'WAITING_LIVE',
        ledgerFirstSeenAt: new Date(now.getTime() - 60_000),
        graceUntil:
          options?.receiptGraceUntil ?? new Date(now.getTime() - 1_000),
        attempts: 0,
        claimExpiresAt: null,
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    guestGameEvent: {
      findFirst: jest.fn().mockResolvedValue(
        options?.liveEventId
          ? {
              id: options.liveEventId,
            }
          : null,
      ),
    },
  };
  const gamification = {
    dryRun: jest.fn().mockResolvedValue(dryRun()),
    recordRuleDecisions: jest.fn().mockResolvedValue(undefined),
    processEvent: jest.fn().mockResolvedValue({
      event: { id: 'event-fallback-1' },
      summary: { idempotent: false, createdRewards: 1 },
    }),
  };
  return {
    service: new GuestGameLedgerFallbackService(
      prisma as never,
      gamification as never,
    ),
    prisma,
    gamification,
  };
}

function configureSessionStartRules(harness: ReturnType<typeof createService>) {
  harness.prisma.guestGameLootBox.findMany.mockResolvedValue([
    {
      id: 'loot-box-start',
      createdAt: new Date('2026-07-01T00:00:00.000Z'),
      updatedAt: new Date('2026-07-17T00:00:00.000Z'),
      triggerKind: 'SESSION_START',
      periodRules: { evaluationPolicy: 'LIVE_PRIMARY' },
      limits: {},
      storeIds: ['store-1'],
    },
  ]);
  harness.prisma.guestGameSeason.findMany.mockResolvedValue([
    {
      id: 'season-1',
      createdAt: new Date('2026-07-01T00:00:00.000Z'),
      updatedAt: new Date('2026-07-17T00:00:00.000Z'),
      periodFrom: null,
      storeIds: ['store-1'],
      levels: [
        {
          sequence: 2,
          activationRules: {
            schemaVersion: 2,
            taskType: 'SESSION_START',
            evaluationPolicy: 'LIVE_PRIMARY',
          },
        },
      ],
    },
  ]);
  harness.gamification.dryRun.mockResolvedValue(sessionStartDryRun());
}

describe('GuestGameLedgerFallbackService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('keeps the fallback completely passive in OFF mode', async () => {
    const { service, prisma, gamification } = createService();

    await expect(service.runScheduled({ mode: 'OFF' })).resolves.toMatchObject({
      mode: 'OFF',
      processedTenants: 0,
      skippedTenants: 1,
      checkedFacts: 0,
      createdEvents: 0,
      createdRewards: 0,
    });
    expect(prisma.guestGameMission.findMany).not.toHaveBeenCalled();
    expect(prisma.guestActivityFact.findMany).not.toHaveBeenCalled();
    expect(gamification.dryRun).not.toHaveBeenCalled();
    expect(gamification.processEvent).not.toHaveBeenCalled();
  });

  it('fails closed when an enabled run has no tenant scope', async () => {
    const { service, prisma, gamification } = createService();

    await expect(
      service.runScheduled({ mode: 'SHADOW' }),
    ).resolves.toMatchObject({
      mode: 'SHADOW',
      checkedTenants: 0,
      processedTenants: 0,
      checkedFacts: 0,
      createdEvents: 0,
      createdRewards: 0,
    });
    expect(prisma.tenant.findMany).not.toHaveBeenCalled();
    expect(gamification.recordRuleDecisions).not.toHaveBeenCalled();
    expect(gamification.processEvent).not.toHaveBeenCalled();
  });

  it.each([
    ['profile', { profileId: null }],
    ['season', { seasonId: null }],
    ['Battle Pass step', { battlePassStep: null }],
    ['LIVE cutoff', { liveNotBefore: null }],
  ])(
    'fails closed when LIVE has no exact %s scope',
    async (_label, missing) => {
      const { service, prisma, gamification } = createService();

      await expect(
        service.runScheduled({
          mode: 'LIVE',
          ...liveCanaryScope,
          ...missing,
        }),
      ).resolves.toMatchObject({
        mode: 'LIVE',
        checkedTenants: 0,
        processedTenants: 0,
        checkedFacts: 0,
        createdEvents: 0,
        createdRewards: 0,
      });
      expect(prisma.tenant.findMany).not.toHaveBeenCalled();
      expect(gamification.dryRun).not.toHaveBeenCalled();
      expect(gamification.processEvent).not.toHaveBeenCalled();
    },
  );

  it('fails closed when LIVE is configured for all tenants', async () => {
    const { service, prisma, gamification } = createService();

    await expect(
      service.runScheduled({
        mode: 'LIVE',
        ...liveCanaryScope,
        allowAllTenants: true,
      }),
    ).resolves.toMatchObject({
      checkedTenants: 0,
      checkedFacts: 0,
      createdEvents: 0,
      createdRewards: 0,
    });
    expect(prisma.tenant.findMany).not.toHaveBeenCalled();
    expect(gamification.processEvent).not.toHaveBeenCalled();
  });

  it('records SHADOW evidence without creating an event or reward', async () => {
    const { service, prisma, gamification } = createService();

    await expect(
      service.runScheduled({
        mode: 'SHADOW',
        graceMs: 15_000,
        tenantId: 'tenant-1',
      }),
    ).resolves.toMatchObject({
      shadowFacts: 1,
      fallbackFacts: 0,
      createdEvents: 0,
      createdRewards: 0,
    });
    expect(gamification.recordRuleDecisions).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        rules: expect.arrayContaining([
          expect.objectContaining({
            evaluationPolicy: 'LIVE_WITH_LEDGER_FALLBACK',
          }),
        ]),
      }),
      expect.any(Object),
    );
    const decisionCalls = gamification.recordRuleDecisions.mock
      .calls as unknown as Array<[unknown, unknown, Record<string, unknown>]>;
    expect(decisionCalls[0]?.[2]).toMatchObject({
      evaluationMode: 'SHADOW_LEDGER_FALLBACK',
      suppressLedgerShadow: true,
    });
    expect(decisionCalls[0]?.[2].originKey).toMatch(/^ggo:v2:[a-f0-9]{64}$/);
    expect(prisma.guestGameOriginReceipt.updateMany).toHaveBeenCalledWith({
      where: { id: 'receipt-1', status: 'WAITING_LIVE' },
      data: { status: 'SHADOWED', processedAt: now },
    });
    expect(gamification.processEvent).not.toHaveBeenCalled();
  });

  it('limits a canary run to the configured exact profile', async () => {
    const { service, prisma } = createService();

    await service.runScheduled({
      mode: 'SHADOW',
      tenantId: 'tenant-1',
      profileId: 'profile-1',
    });

    expect(prisma.guestActivityFact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          profileId: 'profile-1',
        }),
      }),
    );
  });

  it('routes a store-less fact to a rule selected in the same Langame domain', async () => {
    const { service, prisma, gamification } = createService();
    prisma.guestActivityFact.findMany.mockResolvedValueOnce([
      { ...fact(new Date(now.getTime() - 60_000)), storeId: null },
    ]);
    gamification.dryRun.mockImplementationOnce(
      (_user: unknown, dto: never, options: never) =>
        domainAwareDryRun(dto, options, [
          { id: 'mission-1', storeIds: ['store-1'] },
        ]),
    );

    await expect(
      service.runScheduled({
        mode: 'SHADOW',
        tenantId: 'tenant-1',
      }),
    ).resolves.toMatchObject({ shadowFacts: 1 });

    expect(gamification.dryRun).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        storeId: null,
        externalDomain: '46.langamepro.ru',
      }),
      expect.objectContaining({
        ruleExternalDomains: expect.any(Map),
      }),
    );
  });

  it('rejects a store-less fact from another Langame domain', async () => {
    const { service, prisma, gamification } = createService();
    prisma.guestActivityFact.findMany.mockResolvedValueOnce([
      {
        ...fact(new Date(now.getTime() - 60_000)),
        storeId: null,
        externalDomain: 'other.langamepro.ru',
      },
    ]);
    gamification.dryRun.mockImplementationOnce(
      (_user: unknown, dto: never, options: never) =>
        domainAwareDryRun(dto, options, [
          { id: 'mission-1', storeIds: ['store-1'] },
        ]),
    );

    await expect(
      service.runScheduled({ mode: 'SHADOW', tenantId: 'tenant-1' }),
    ).resolves.toMatchObject({ shadowFacts: 0, checkedFacts: 0 });
    expect(prisma.guestGameOriginReceipt.upsert).not.toHaveBeenCalled();
  });

  it('routes independently to multiple rules whose selected clubs share a domain', async () => {
    const { service, prisma, gamification } = createService();
    prisma.guestGameMission.findMany.mockResolvedValueOnce([
      {
        id: 'mission-1',
        createdAt: new Date('2026-07-01T00:00:00.000Z'),
        definitionVersion: 2,
        missionType: 'PLAY_TIME',
        evaluationPolicy: 'LIVE_PRIMARY',
        conditions: { schemaVersion: 2, taskType: 'PLAY_TIME' },
        periodFrom: null,
        storeIds: ['store-1'],
      },
      {
        id: 'mission-2',
        createdAt: new Date('2026-07-01T00:00:00.000Z'),
        definitionVersion: 2,
        missionType: 'PLAY_TIME',
        evaluationPolicy: 'LIVE_PRIMARY',
        conditions: { schemaVersion: 2, taskType: 'PLAY_TIME' },
        periodFrom: null,
        storeIds: ['store-2'],
      },
    ]);
    prisma.store.findMany.mockResolvedValueOnce([
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
    ]);
    prisma.guestActivityFact.findMany.mockResolvedValueOnce([
      { ...fact(new Date(now.getTime() - 60_000)), storeId: null },
    ]);
    gamification.dryRun.mockImplementationOnce(
      (_user: unknown, dto: never, options: never) =>
        domainAwareDryRun(dto, options, [
          { id: 'mission-1', storeIds: ['store-1'] },
          { id: 'mission-2', storeIds: ['store-2'] },
        ]),
    );

    await expect(
      service.runScheduled({ mode: 'SHADOW', tenantId: 'tenant-1' }),
    ).resolves.toMatchObject({ shadowFacts: 1 });
    expect(gamification.recordRuleDecisions).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        rules: [
          expect.objectContaining({ id: 'mission-1' }),
          expect.objectContaining({ id: 'mission-2' }),
        ],
      }),
      expect.any(Object),
    );
  });

  it('does not route a fact that has neither an exact store nor a domain', async () => {
    const { service, prisma, gamification } = createService();
    prisma.guestActivityFact.findMany.mockResolvedValueOnce([
      {
        ...fact(new Date(now.getTime() - 60_000)),
        storeId: null,
        externalDomain: null,
      },
    ]);

    await expect(
      service.runScheduled({ mode: 'SHADOW', tenantId: 'tenant-1' }),
    ).resolves.toMatchObject({ shadowFacts: 0, checkedFacts: 0 });
    expect(gamification.dryRun).not.toHaveBeenCalled();
  });

  it('keeps an exact store authoritative even when another store shares its domain', async () => {
    const { service, prisma, gamification } = createService();
    prisma.guestGameMission.findMany.mockResolvedValueOnce([
      {
        id: 'mission-2',
        createdAt: new Date('2026-07-01T00:00:00.000Z'),
        conditions: {},
        periodFrom: null,
        storeIds: ['store-2'],
      },
    ]);
    prisma.store.findMany.mockResolvedValueOnce([
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
    ]);
    gamification.dryRun.mockImplementationOnce(
      (_user: unknown, dto: never, options: never) =>
        domainAwareDryRun(dto, options, [
          { id: 'mission-2', storeIds: ['store-2'] },
        ]),
    );

    await expect(
      service.runScheduled({ mode: 'SHADOW', tenantId: 'tenant-1' }),
    ).resolves.toMatchObject({ shadowFacts: 0, checkedFacts: 0 });
    expect(prisma.guestGameOriginReceipt.upsert).not.toHaveBeenCalled();
  });

  it('uses the stable session id when Langame omits a generic source id', async () => {
    const { service, prisma, gamification } = createService();
    prisma.guestActivityFact.findMany.mockResolvedValueOnce([
      {
        ...fact(new Date(now.getTime() - 60_000)),
        sourceExternalId: null,
        sessionExternalId: 'session-without-row-id',
      },
    ]);

    await expect(
      service.runScheduled({
        mode: 'SHADOW',
        graceMs: 15_000,
        tenantId: 'tenant-1',
      }),
    ).resolves.toMatchObject({
      shadowFacts: 1,
      createdEvents: 0,
      createdRewards: 0,
    });

    expect(gamification.dryRun).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        eventType: 'PLAY_HOUR',
        externalId: 'session-without-row-id',
      }),
      expect.objectContaining({
        ruleExternalDomains: expect.any(Map),
      }),
    );
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const query = prisma.guestActivityFact.findMany.mock.calls[0]?.[0] as
      | { where?: unknown }
      | undefined;
    expect(JSON.stringify(query?.where)).toContain(
      '"sessionExternalId":{"not":null}',
    );
    expect(JSON.stringify(query?.where)).toContain(
      '"durationMinutes":{"gt":0}',
    );
    expect(gamification.processEvent).not.toHaveBeenCalled();
  });

  it('prefers the stable session id over a parser-version row id', async () => {
    const { service, prisma, gamification } = createService();
    prisma.guestActivityFact.findMany.mockResolvedValueOnce([
      {
        ...fact(new Date(now.getTime() - 60_000)),
        sourceExternalId: 'parser-row-v7',
        sessionExternalId: 'stable-session-42',
      },
    ]);

    await expect(
      service.runScheduled({
        mode: 'SHADOW',
        tenantId: 'tenant-1',
      }),
    ).resolves.toMatchObject({ shadowFacts: 1 });

    expect(gamification.dryRun).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        externalId: 'stable-session-42',
      }),
      expect.any(Object),
    );
  });

  it.each([
    ['hourly', 'HOURLY_PLAY_TIME_ACCUMULATED', 'HOURLY', false],
    [
      'package or subscription',
      'PACKAGE_OR_SUBSCRIPTION_PLAY_TIME_ACCUMULATED',
      'PACKAGE_OR_SUBSCRIPTION',
      true,
    ],
  ])(
    'maps an exact %s fact to the canonical PLAY_HOUR DTO',
    async (_label, factType, sessionType, sessionPacket) => {
      const { service, prisma, gamification } = createService();
      prisma.guestActivityFact.findMany.mockResolvedValueOnce([
        {
          ...fact(new Date(now.getTime() - 60_000)),
          factType,
          durationMinutes: 75,
        },
      ]);

      await expect(
        service.runScheduled({
          mode: 'SHADOW',
          tenantId: 'tenant-1',
        }),
      ).resolves.toMatchObject({ shadowFacts: 1 });

      expect(gamification.dryRun).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          eventType: 'PLAY_HOUR',
          sessionMinutes: 75,
          sessionType,
          sessionPacket,
          sourceFactKind: 'GUEST_SESSION',
          suppressLootBoxRewards: true,
        }),
        expect.any(Object),
      );
    },
  );

  it.each([
    ['any', 'SESSION_STARTED', null, false],
    ['hourly', 'HOURLY_SESSION_STARTED', 'HOURLY', false],
    [
      'package or subscription',
      'PACKAGE_OR_SUBSCRIPTION_USED',
      'PACKAGE_OR_SUBSCRIPTION',
      true,
    ],
  ] as const)(
    'maps an exact %s start fact to the canonical SESSION_START DTO',
    async (_label, factType, sessionType, sessionPacket) => {
      const harness = createService();
      configureSessionStartRules(harness);
      const startFact = sessionStartFact(
        new Date(now.getTime() - 60_000),
        factType,
      );
      harness.prisma.guestActivityFact.findMany.mockResolvedValue([startFact]);

      const mappedResult = await harness.service.runScheduled({
        mode: 'SHADOW',
        tenantId: 'tenant-1',
        factTypes: [factType],
      });
      expect(mappedResult).toMatchObject({
        checkedFacts: 1,
        shadowFacts: 1,
        createdEvents: 0,
        createdRewards: 0,
      });

      expect(harness.gamification.dryRun).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          eventType: 'SESSION_START',
          externalId: 'session-42',
          sessionType,
          sessionPacket,
          sourceFactKind: 'GUEST_SESSION',
          suppressLootBoxRewards: true,
        }),
        expect.any(Object),
      );
    },
  );

  it('selects a legacy SESSION_START mission from its denormalized trigger', async () => {
    const harness = createService();
    const startFact = sessionStartFact(
      new Date(now.getTime() - 60_000),
      'SESSION_STARTED',
    );
    harness.prisma.guestActivityFact.findMany.mockResolvedValue([startFact]);
    harness.prisma.guestGameMission.findMany.mockResolvedValue([
      {
        id: 'legacy-start-mission',
        createdAt: new Date('2026-07-01T00:00:00.000Z'),
        updatedAt: new Date('2026-07-17T00:00:00.000Z'),
        definitionVersion: 1,
        missionType: 'CUSTOM',
        triggerKind: 'SESSION_START',
        evaluationPolicy: 'LIVE_PRIMARY',
        conditions: {},
        periodFrom: null,
        storeIds: ['store-1'],
      },
    ]);
    harness.prisma.guestGameLootBox.findMany.mockResolvedValue([]);
    harness.prisma.guestGameSeason.findMany.mockResolvedValue([]);
    const base = sessionStartDryRun();
    const missionRule = {
      ...base.rules[0],
      id: 'legacy-start-mission',
      kind: 'MISSION',
      name: 'Legacy session-start mission',
    };
    harness.gamification.dryRun.mockResolvedValue({
      ...base,
      rules: [missionRule],
      summary: {
        ...base.summary,
        checkedRules: 1,
        eligibleRules: 1,
      },
    });

    await expect(
      harness.service.runScheduled({
        mode: 'SHADOW',
        tenantId: 'tenant-1',
        factTypes: ['SESSION_STARTED'],
      }),
    ).resolves.toMatchObject({
      checkedFacts: 1,
      shadowFacts: 1,
    });

    expect(harness.prisma.guestGameMission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ triggerKind: true }),
      }),
    );
    expect(harness.gamification.dryRun).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        eventType: 'SESSION_START',
        sessionType: null,
      }),
      expect.any(Object),
    );
  });

  it('prefers the typed start marker over its neutral anchor so ANY and typed rules share one event', async () => {
    const harness = createService();
    configureSessionStartRules(harness);
    const neutral = sessionStartFact(
      new Date(now.getTime() - 60_000),
      'SESSION_STARTED',
    );
    const hourly = sessionStartFact(
      new Date(now.getTime() - 60_000),
      'HOURLY_SESSION_STARTED',
    );
    harness.prisma.guestActivityFact.findMany.mockResolvedValue([
      neutral,
      hourly,
    ]);
    const startResult = sessionStartDryRun();
    startResult.rules = [
      { ...startResult.rules[0], id: 'loot-box-start', name: 'Any start' },
      { ...startResult.rules[1], id: 'season-1', name: 'Hourly start' },
    ];
    harness.gamification.dryRun.mockResolvedValue(startResult);

    await expect(
      harness.service.runScheduled({
        mode: 'SHADOW',
        tenantId: 'tenant-1',
        factTypes: ['SESSION_STARTED', 'HOURLY_SESSION_STARTED'],
      }),
    ).resolves.toMatchObject({
      checkedFacts: 1,
      shadowFacts: 1,
    });

    expect(harness.gamification.dryRun).toHaveBeenCalledTimes(1);
    expect(harness.gamification.dryRun).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        eventType: 'SESSION_START',
        sessionType: 'HOURLY',
        externalId: 'session-42',
      }),
      expect.any(Object),
    );
    expect(harness.gamification.recordRuleDecisions).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        rules: [
          expect.objectContaining({ id: 'loot-box-start', name: 'Any start' }),
          expect.objectContaining({ id: 'season-1', name: 'Hourly start' }),
        ],
      }),
      expect.any(Object),
    );
  });

  it('fails closed when one session has contradictory typed start markers', async () => {
    const harness = createService();
    configureSessionStartRules(harness);
    const neutral = sessionStartFact(
      new Date(now.getTime() - 60_000),
      'SESSION_STARTED',
    );
    const hourly = sessionStartFact(
      new Date(now.getTime() - 60_000),
      'HOURLY_SESSION_STARTED',
    );
    const packet = sessionStartFact(
      new Date(now.getTime() - 60_000),
      'PACKAGE_OR_SUBSCRIPTION_USED',
    );
    harness.prisma.guestActivityFact.findMany.mockResolvedValue([
      neutral,
      hourly,
      packet,
    ]);

    await expect(
      harness.service.runScheduled({
        mode: 'SHADOW',
        tenantId: 'tenant-1',
        factTypes: [
          'SESSION_STARTED',
          'HOURLY_SESSION_STARTED',
          'PACKAGE_OR_SUBSCRIPTION_USED',
        ],
      }),
    ).resolves.toMatchObject({
      shadowFacts: 0,
      failedFacts: 1,
      createdEvents: 0,
      createdRewards: 0,
    });

    expect(harness.gamification.dryRun).not.toHaveBeenCalled();
    expect(harness.prisma.guestGameOriginReceipt.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          eventType: 'SESSION_START',
          status: 'FAILED',
          lastError:
            'Conflicting exact session-start classifications for one session.',
        }),
      }),
    );
  });

  it('detects contradictory typed start markers even when rollout requests only one start type', async () => {
    const harness = createService();
    configureSessionStartRules(harness);
    const hourly = sessionStartFact(
      new Date(now.getTime() - 60_000),
      'HOURLY_SESSION_STARTED',
    );
    const packet = sessionStartFact(
      new Date(now.getTime() - 60_000),
      'PACKAGE_OR_SUBSCRIPTION_USED',
    );
    const startFacts = [hourly, packet];
    harness.prisma.guestActivityFact.findMany.mockImplementation(
      (input: {
        where?: {
          factType?: { in?: string[] };
        };
      }) => {
        const selectedFactTypes = input.where?.factType?.in;
        return Promise.resolve(
          selectedFactTypes
            ? startFacts.filter((item) =>
                selectedFactTypes.includes(item.factType),
              )
            : startFacts,
        );
      },
    );

    await expect(
      harness.service.runScheduled({
        mode: 'SHADOW',
        tenantId: 'tenant-1',
        factTypes: ['HOURLY_SESSION_STARTED'],
      }),
    ).resolves.toMatchObject({
      shadowFacts: 0,
      failedFacts: 1,
      createdEvents: 0,
      createdRewards: 0,
    });

    expect(harness.gamification.dryRun).not.toHaveBeenCalled();
    expect(harness.prisma.guestGameOriginReceipt.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          eventType: 'SESSION_START',
          status: 'FAILED',
          lastError:
            'Conflicting exact session-start classifications for one session.',
        }),
      }),
    );
  });

  it('keeps identical session ids isolated across physical sources and owners', async () => {
    const harness = createService();
    configureSessionStartRules(harness);
    const firstStart = sessionStartFact(
      new Date(now.getTime() - 60_000),
      'HOURLY_SESSION_STARTED',
    );
    const secondStart = {
      ...sessionStartFact(
        new Date(now.getTime() - 30_000),
        'HOURLY_SESSION_STARTED',
      ),
      id: 'fact-hourly-second-owner',
      profileId: 'profile-2',
      guestId: 'guest-2',
      sourceKind: 'LANGAME_SESSION_LEDGER',
      sourceExternalId: 'parser-row-hourly-second-owner',
    };
    const startFacts = [firstStart, secondStart];
    harness.prisma.guestActivityFact.findMany.mockImplementation(
      (input: {
        where?: {
          factType?: { in?: string[] };
        };
      }) => {
        const selectedFactTypes = input.where?.factType?.in;
        return Promise.resolve(
          selectedFactTypes
            ? startFacts.filter((item) =>
                selectedFactTypes.includes(item.factType),
              )
            : startFacts,
        );
      },
    );

    await expect(
      harness.service.runScheduled({
        mode: 'SHADOW',
        tenantId: 'tenant-1',
        factTypes: ['HOURLY_SESSION_STARTED'],
      }),
    ).resolves.toMatchObject({
      checkedFacts: 2,
      shadowFacts: 2,
      failedFacts: 0,
      createdEvents: 0,
      createdRewards: 0,
    });

    expect(harness.gamification.dryRun).toHaveBeenCalledTimes(2);
    expect(
      harness.gamification.dryRun.mock.calls.map(([, dto]) => dto.profileId),
    ).toEqual(expect.arrayContaining(['profile-1', 'profile-2']));
    const startReceiptOriginKeys =
      harness.prisma.guestGameOriginReceipt.upsert.mock.calls
        .map(([input]) => input)
        .filter((input) => input.create?.eventType === 'SESSION_START')
        .map((input) => input.where?.tenantId_originKey?.originKey);
    expect(startReceiptOriginKeys).toHaveLength(2);
    expect(new Set(startReceiptOriginKeys).size).toBe(2);
  });

  it('routes neutral exact play time as PLAY_HOUR with no tariff so an ANY condition can match', async () => {
    const { service, prisma, gamification } = createService();
    const neutralFact = {
      ...fact(new Date(now.getTime() - 60_000)),
      id: 'neutral-fact',
      factType: 'SESSION_PLAY_TIME_ACCUMULATED',
      durationMinutes: 75,
    };
    prisma.guestActivityFact.findMany
      .mockResolvedValueOnce([neutralFact])
      .mockResolvedValueOnce([neutralFact]);
    gamification.dryRun.mockImplementationOnce(
      (_user: unknown, dto: { sessionType?: string | null }) => {
        const result = dryRun();
        result.rules =
          dto.sessionType == null
            ? [
                {
                  ...result.rules[0],
                  name: 'Any session type',
                },
              ]
            : [];
        return Promise.resolve(result);
      },
    );

    await expect(
      service.runScheduled({
        mode: 'SHADOW',
        tenantId: 'tenant-1',
      }),
    ).resolves.toMatchObject({
      checkedFacts: 1,
      shadowFacts: 1,
      createdEvents: 0,
      createdRewards: 0,
    });

    expect(gamification.dryRun).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        eventType: 'PLAY_HOUR',
        sessionMinutes: 75,
        sessionType: null,
        sessionPacket: false,
        sourceFactKind: 'GUEST_SESSION',
      }),
      expect.any(Object),
    );
    expect(gamification.recordRuleDecisions).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        rules: [
          expect.objectContaining({
            id: 'mission-1',
            name: 'Any session type',
          }),
        ],
      }),
      expect.any(Object),
    );
  });

  it('reopens a fallback-owned origin after neutral play time is reclassified as HOURLY and reuses the canonical event', async () => {
    const { service, prisma, gamification } = createService();
    const neutralFact = {
      ...fact(new Date(now.getTime() - 60_000)),
      id: 'neutral-fact',
      factType: 'SESSION_PLAY_TIME_ACCUMULATED',
    };
    const hourlyFact = {
      ...neutralFact,
      id: 'hourly-fact',
      factType: 'HOURLY_PLAY_TIME_ACCUMULATED',
    };
    prisma.guestActivityFact.findMany
      .mockResolvedValueOnce([neutralFact])
      .mockResolvedValueOnce([neutralFact])
      .mockResolvedValueOnce([hourlyFact])
      .mockResolvedValueOnce([hourlyFact])
      .mockResolvedValueOnce([hourlyFact])
      .mockResolvedValueOnce([hourlyFact]);

    const waitingNeutralReceipt = {
      id: 'receipt-reclassified-session',
      factId: neutralFact.id,
      policy: 'LIVE_WITH_LEDGER_FALLBACK',
      status: 'WAITING_LIVE',
      claimedSource: null,
      ledgerFirstSeenAt: new Date(now.getTime() - 60_000),
      graceUntil: new Date(now.getTime() - 1_000),
      attempts: 0,
      claimExpiresAt: null,
      eventId: null,
    };
    prisma.guestGameOriginReceipt.upsert
      .mockResolvedValueOnce(waitingNeutralReceipt)
      .mockResolvedValueOnce({
        ...waitingNeutralReceipt,
        status: 'PROCESSED',
        claimedSource: 'LEDGER_FALLBACK',
        attempts: 1,
        eventId: 'canonical-event',
      })
      .mockResolvedValueOnce({
        ...waitingNeutralReceipt,
        factId: hourlyFact.id,
        ledgerFirstSeenAt: new Date(),
        graceUntil: new Date(now.getTime() - 1),
      });
    gamification.processEvent
      .mockResolvedValueOnce({
        event: { id: 'canonical-event' },
        summary: { idempotent: false, createdRewards: 1 },
      })
      .mockResolvedValueOnce({
        event: { id: 'canonical-event' },
        summary: { idempotent: true, createdRewards: 0 },
      });

    const scope = {
      mode: 'LIVE' as const,
      ...liveCanaryScope,
      graceMs: 15_000,
    };
    await expect(service.runScheduled(scope)).resolves.toMatchObject({
      fallbackFacts: 1,
      createdEvents: 1,
      createdRewards: 1,
    });
    await expect(service.runScheduled(scope)).resolves.toMatchObject({
      deferredFacts: 1,
      fallbackFacts: 0,
      duplicateFacts: 0,
      createdEvents: 0,
      createdRewards: 0,
    });

    const repointCall =
      prisma.guestGameOriginReceipt.updateMany.mock.calls.find(
        ([input]) => input.data.factId === hourlyFact.id,
      )?.[0];
    expect(repointCall).toMatchObject({
      where: {
        id: waitingNeutralReceipt.id,
        factId: neutralFact.id,
        policy: 'LIVE_WITH_LEDGER_FALLBACK',
        claimedSource: { not: 'EXACT_CANONICALIZATION' },
      },
      data: {
        factId: hourlyFact.id,
        status: 'WAITING_LIVE',
        claimedSource: null,
        attempts: 0,
      },
    });

    jest.advanceTimersByTime(15_001);
    await expect(service.runScheduled(scope)).resolves.toMatchObject({
      fallbackFacts: 1,
      duplicateFacts: 0,
      createdEvents: 0,
      createdRewards: 0,
    });

    expect(gamification.processEvent).toHaveBeenCalledTimes(2);
    const processCalls = gamification.processEvent.mock
      .calls as unknown as Array<
      [
        unknown,
        { externalId: string; sessionType: string | null },
        { originKey: string },
      ]
    >;
    expect(processCalls[0]?.[1]).toMatchObject({
      externalId: 'session-42',
      sessionType: null,
    });
    expect(processCalls[1]?.[1]).toMatchObject({
      externalId: 'session-42',
      sessionType: 'HOURLY',
    });
    expect(processCalls[1]?.[2].originKey).toBe(processCalls[0]?.[2].originKey);
  });

  it('fails closed when one session has simultaneous conflicting exact play-time classifications', async () => {
    const { service, prisma, gamification } = createService();
    const hourlyFact = {
      ...fact(new Date(now.getTime() - 60_000)),
      id: 'hourly-fact',
      factType: 'HOURLY_PLAY_TIME_ACCUMULATED',
    };
    const packageFact = {
      ...hourlyFact,
      id: 'package-fact',
      factType: 'PACKAGE_OR_SUBSCRIPTION_PLAY_TIME_ACCUMULATED',
      validFrom: new Date(now.getTime() - 30_000),
      happenedAt: new Date(now.getTime() - 30_000),
    };
    prisma.guestActivityFact.findMany
      .mockResolvedValueOnce([hourlyFact, packageFact])
      .mockResolvedValueOnce([hourlyFact, packageFact]);

    await expect(
      service.runScheduled({
        mode: 'SHADOW',
        tenantId: 'tenant-1',
      }),
    ).resolves.toMatchObject({
      checkedFacts: 0,
      failedFacts: 2,
      shadowFacts: 0,
      fallbackFacts: 0,
      createdEvents: 0,
      createdRewards: 0,
    });

    expect(gamification.dryRun).not.toHaveBeenCalled();
    expect(gamification.recordRuleDecisions).not.toHaveBeenCalled();
    expect(gamification.processEvent).not.toHaveBeenCalled();
    expect(prisma.guestGameOriginReceipt.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.guestGameOriginReceipt.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          factId: packageFact.id,
          eventType: 'PLAY_HOUR',
          policy: 'LIVE_WITH_LEDGER_FALLBACK',
          status: 'FAILED',
          lastError:
            'Conflicting exact play-time classifications for one session.',
        }),
        update: {},
      }),
    );
  });

  it('does not substitute a session id for a purchase sale id', async () => {
    const { service, prisma, gamification } = createService();
    prisma.guestActivityFact.findMany.mockResolvedValueOnce([
      {
        ...fact(new Date(now.getTime() - 60_000)),
        factType: 'PRODUCT_PURCHASED',
        sourceExternalId: null,
        sessionExternalId: 'checkout-session-is-not-a-sale-id',
        amount: 250,
      },
    ]);

    await expect(
      service.runScheduled({
        mode: 'SHADOW',
        factTypes: ['PRODUCT_PURCHASED'],
        tenantId: 'tenant-1',
      }),
    ).resolves.toMatchObject({
      checkedFacts: 0,
      shadowFacts: 0,
      createdEvents: 0,
      createdRewards: 0,
    });
    expect(gamification.dryRun).not.toHaveBeenCalled();
    expect(gamification.recordRuleDecisions).not.toHaveBeenCalled();
    expect(gamification.processEvent).not.toHaveBeenCalled();
  });

  it('does not duplicate a completed SHADOW decision on replay', async () => {
    const { service, prisma, gamification } = createService();
    prisma.guestGameOriginReceipt.upsert.mockResolvedValueOnce({
      id: 'receipt-1',
      status: 'SHADOWED',
    });

    await expect(
      service.runScheduled({
        mode: 'SHADOW',
        graceMs: 15_000,
        tenantId: 'tenant-1',
      }),
    ).resolves.toMatchObject({
      shadowFacts: 0,
      duplicateFacts: 1,
      createdEvents: 0,
      createdRewards: 0,
    });
    expect(gamification.recordRuleDecisions).not.toHaveBeenCalled();
    expect(prisma.guestGameOriginReceipt.updateMany).not.toHaveBeenCalled();
    expect(gamification.processEvent).not.toHaveBeenCalled();
  });

  it('defaults runScheduled without factTypes to duration facts only', async () => {
    const { service, prisma } = createService();

    await service.runScheduled({
      mode: 'SHADOW',
      tenantId: 'tenant-1',
    });

    expect(
      prisma.guestActivityFact.findMany.mock.calls[0]?.[0].where.factType.in,
    ).toEqual([
      'SESSION_PLAY_TIME_ACCUMULATED',
      'HOURLY_PLAY_TIME_ACCUMULATED',
      'PACKAGE_OR_SUBSCRIPTION_PLAY_TIME_ACCUMULATED',
    ]);
  });

  it('applies the LIVE cutoff and excludes invalid canonical session facts', async () => {
    const { service, prisma } = createService();

    await service.runScheduled({
      mode: 'LIVE',
      ...liveCanaryScope,
      factTypes: [
        'SESSION_STARTED',
        'HOURLY_SESSION_STARTED',
        'PACKAGE_OR_SUBSCRIPTION_USED',
        'SESSION_PLAY_TIME_ACCUMULATED',
        'HOURLY_PLAY_TIME_ACCUMULATED',
        'PACKAGE_OR_SUBSCRIPTION_PLAY_TIME_ACCUMULATED',
      ],
    });

    expect(prisma.guestActivityFact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          profileId: 'profile-1',
          lifecycleStatus: 'ACTIVE',
          confidence: 'EXACT',
          supersededAt: null,
          factType: {
            in: [
              'SESSION_STARTED',
              'HOURLY_SESSION_STARTED',
              'PACKAGE_OR_SUBSCRIPTION_USED',
              'SESSION_PLAY_TIME_ACCUMULATED',
              'HOURLY_PLAY_TIME_ACCUMULATED',
              'PACKAGE_OR_SUBSCRIPTION_PLAY_TIME_ACCUMULATED',
            ],
          },
          happenedAt: {
            gte: new Date('2026-07-18T11:55:00.000Z'),
          },
          AND: expect.arrayContaining([
            expect.objectContaining({
              OR: expect.arrayContaining([
                expect.objectContaining({
                  durationMinutes: { gt: 0 },
                }),
              ]),
            }),
          ]),
        }),
      }),
    );
  });

  it('routes LIVE fallback missions across profiles while keeping Battle Pass on the exact canary profile', async () => {
    const { service, prisma, gamification } = createService();
    prisma.guestActivityFact.findMany.mockResolvedValueOnce([
      {
        ...fact(new Date(now.getTime() - 60_000)),
        profileId: 'profile-2',
      },
    ]);

    await expect(
      service.runScheduled({
        mode: 'LIVE',
        ...liveCanaryScope,
        missionsAllowAllProfiles: true,
        graceMs: 15_000,
      }),
    ).resolves.toMatchObject({
      fallbackFacts: 1,
      createdEvents: 1,
      createdRewards: 1,
    });

    expect(prisma.guestActivityFact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          profileId: undefined,
        }),
      }),
    );
    expect(gamification.processEvent).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        profileId: 'profile-2',
        eventType: 'PLAY_HOUR',
      }),
      expect.objectContaining({
        allowedRuleIds: new Set(['mission-1']),
        allowedBattlePassSteps: new Map(),
      }),
    );
  });

  it('keeps the configured Battle Pass canary alongside LIVE fallback missions for the canary profile', async () => {
    const { service, gamification } = createService();

    await service.runScheduled({
      mode: 'LIVE',
      ...liveCanaryScope,
      missionsAllowAllProfiles: true,
      graceMs: 15_000,
    });

    expect(gamification.processEvent).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      expect.objectContaining({
        allowedRuleIds: new Set(['mission-1', 'season-1']),
        allowedBattlePassSteps: new Map([['season-1', 2]]),
      }),
    );
  });

  it('routes stale-primary v2 missions, Battle Pass steps and PLAY_HOUR lootboxes for every tenant profile', async () => {
    const { service, prisma, gamification } = createService();
    prisma.guestActivityFact.findMany.mockResolvedValueOnce([
      {
        ...fact(new Date(now.getTime() - 60_000)),
        profileId: 'profile-2',
        guestId: 'guest-2',
      },
    ]);

    await expect(
      service.runScheduled({
        mode: 'LIVE',
        tenantId: liveCanaryScope.tenantId,
        liveNotBefore: liveCanaryScope.liveNotBefore,
        playTimeAllowAllProfiles: true,
        graceMs: 15_000,
      }),
    ).resolves.toMatchObject({
      fallbackFacts: 1,
      createdEvents: 1,
      createdRewards: 1,
    });

    expect(prisma.guestActivityFact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          profileId: undefined,
        }),
      }),
    );
    expect(gamification.processEvent).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        profileId: 'profile-2',
        eventType: 'PLAY_HOUR',
      }),
      expect.objectContaining({
        allowedRuleIds: new Set(['mission-1', 'loot-box-1', 'season-1']),
        allowedBattlePassSteps: new Map([['season-1', 2]]),
      }),
    );
  });

  it('does not route a lootbox with an empty trigger as a PLAY_HOUR fallback rule', async () => {
    const { service, prisma, gamification } = createService();
    prisma.guestGameLootBox.findMany.mockResolvedValueOnce([
      {
        id: 'loot-box-1',
        createdAt: new Date('2026-07-01T00:00:00.000Z'),
        triggerKind: '',
        periodRules: { evaluationPolicy: 'LIVE_PRIMARY' },
        limits: {},
        storeIds: ['store-1'],
      },
    ]);
    gamification.dryRun.mockResolvedValueOnce({
      ...dryRun(),
      rules: dryRun().rules.map((rule) =>
        rule.kind === 'LOOT_BOX'
          ? {
              ...rule,
              triggerKind: '',
              evaluationPolicy: 'LIVE_PRIMARY',
            }
          : rule,
      ),
    });

    await service.runScheduled({
      mode: 'LIVE',
      tenantId: liveCanaryScope.tenantId,
      liveNotBefore: liveCanaryScope.liveNotBefore,
      playTimeAllowAllProfiles: true,
      graceMs: 15_000,
    });

    expect(gamification.processEvent).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      expect.objectContaining({
        allowedRuleIds: new Set(['mission-1', 'season-1']),
        allowedBattlePassSteps: new Map([['season-1', 2]]),
      }),
    );
  });

  it('processes a tenant-wide mission, Battle Pass step and lootbox only once across retries', async () => {
    const { service, prisma, gamification } = createService();
    const waitingReceipt = {
      id: 'receipt-tenant-wide',
      factId: 'fact-1',
      policy: 'LIVE_WITH_LEDGER_FALLBACK',
      status: 'WAITING_LIVE',
      claimedSource: null,
      ledgerFirstSeenAt: new Date(now.getTime() - 60_000),
      graceUntil: new Date(now.getTime() - 1_000),
      attempts: 0,
      claimExpiresAt: null,
    };
    prisma.guestGameOriginReceipt.upsert
      .mockResolvedValueOnce(waitingReceipt)
      .mockResolvedValueOnce({
        id: 'receipt-watermark',
        factId: 'fact-1',
        status: 'PROCESSED',
      })
      .mockResolvedValueOnce({
        ...waitingReceipt,
        status: 'PROCESSED',
        claimedSource: 'LEDGER_FALLBACK',
        attempts: 1,
      })
      .mockResolvedValueOnce({
        id: 'receipt-watermark',
        factId: 'fact-1',
        status: 'PROCESSED',
      });

    const scope = {
      mode: 'LIVE' as const,
      tenantId: liveCanaryScope.tenantId,
      liveNotBefore: liveCanaryScope.liveNotBefore,
      playTimeAllowAllProfiles: true,
      graceMs: 15_000,
    };
    await expect(service.runScheduled(scope)).resolves.toMatchObject({
      fallbackFacts: 1,
      createdEvents: 1,
      createdRewards: 1,
    });
    await expect(service.runScheduled(scope)).resolves.toMatchObject({
      fallbackFacts: 0,
      duplicateFacts: 1,
      createdEvents: 0,
      createdRewards: 0,
    });

    expect(gamification.processEvent).toHaveBeenCalledTimes(1);
    expect(gamification.processEvent).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        eventType: 'PLAY_HOUR',
        activeRulesOnly: true,
        suppressLootBoxRewards: true,
      }),
      expect.objectContaining({
        evaluationMode: 'LIVE_LEDGER_FALLBACK',
        suppressLedgerShadow: true,
        allowedRuleIds: new Set(['mission-1', 'loot-box-1', 'season-1']),
        allowedBattlePassSteps: new Map([['season-1', 2]]),
      }),
    );
  });

  it('routes one canonical session start to Battle Pass and lootbox exactly once across retries', async () => {
    const harness = createService();
    configureSessionStartRules(harness);
    const hourly = sessionStartFact(
      new Date(now.getTime() - 60_000),
      'HOURLY_SESSION_STARTED',
    );
    harness.prisma.guestActivityFact.findMany.mockResolvedValue([hourly]);
    const waitingReceipt = {
      id: 'receipt-session-start',
      factId: hourly.id,
      eventId: null,
      eventType: 'SESSION_START',
      policy: 'LIVE_WITH_LEDGER_FALLBACK',
      status: 'WAITING_LIVE',
      claimedSource: null,
      ledgerFirstSeenAt: new Date(now.getTime() - 60_000),
      graceUntil: new Date(now.getTime() - 1_000),
      attempts: 0,
      claimExpiresAt: null,
    };
    harness.prisma.guestGameOriginReceipt.upsert
      .mockResolvedValueOnce(waitingReceipt)
      .mockResolvedValueOnce({
        id: 'receipt-watermark',
        factId: hourly.id,
        status: 'PROCESSED',
      })
      .mockResolvedValueOnce({
        ...waitingReceipt,
        status: 'PROCESSED',
        claimedSource: 'LEDGER_FALLBACK',
        attempts: 1,
      })
      .mockResolvedValueOnce({
        id: 'receipt-watermark',
        factId: hourly.id,
        status: 'PROCESSED',
      });

    const scope = {
      mode: 'LIVE' as const,
      tenantId: liveCanaryScope.tenantId,
      liveNotBefore: liveCanaryScope.liveNotBefore,
      playTimeAllowAllProfiles: true,
      factTypes: ['HOURLY_SESSION_STARTED'],
      graceMs: 15_000,
    };
    await expect(harness.service.runScheduled(scope)).resolves.toMatchObject({
      fallbackFacts: 1,
      createdEvents: 1,
      createdRewards: 1,
    });
    await expect(harness.service.runScheduled(scope)).resolves.toMatchObject({
      fallbackFacts: 0,
      duplicateFacts: 1,
      createdEvents: 0,
      createdRewards: 0,
    });

    expect(harness.gamification.processEvent).toHaveBeenCalledTimes(1);
    expect(harness.gamification.processEvent).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        eventType: 'SESSION_START',
        sessionType: 'HOURLY',
        activeRulesOnly: true,
        suppressLootBoxRewards: true,
      }),
      expect.objectContaining({
        evaluationMode: 'LIVE_LEDGER_FALLBACK',
        suppressLedgerShadow: true,
        allowedRuleIds: new Set(['loot-box-start', 'season-1']),
        allowedBattlePassSteps: new Map([['season-1', 2]]),
      }),
    );
  });

  it('upgrades an unclaimed generic start receipt when a delayed typed marker arrives', async () => {
    const harness = createService({
      receiptGraceUntil: new Date(now.getTime() + 60_000),
    });
    configureSessionStartRules(harness);
    const neutral = sessionStartFact(
      new Date(now.getTime() - 60_000),
      'SESSION_STARTED',
    );
    const hourly = sessionStartFact(
      new Date(now.getTime() - 30_000),
      'HOURLY_SESSION_STARTED',
    );
    hourly.happenedAt = neutral.happenedAt;
    harness.prisma.guestActivityFact.findMany
      .mockResolvedValueOnce([neutral])
      .mockResolvedValueOnce([neutral])
      .mockResolvedValueOnce([neutral, hourly])
      .mockResolvedValueOnce([neutral, hourly]);
    const waitingReceipt = {
      id: 'receipt-delayed-start',
      factId: neutral.id,
      eventId: null,
      eventType: 'SESSION_START',
      policy: 'LIVE_WITH_LEDGER_FALLBACK',
      status: 'WAITING_LIVE',
      claimedSource: null,
      ledgerFirstSeenAt: now,
      graceUntil: new Date(now.getTime() + 60_000),
      attempts: 0,
      claimExpiresAt: null,
    };
    harness.prisma.guestGameOriginReceipt.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(waitingReceipt);
    harness.prisma.guestGameOriginReceipt.upsert.mockResolvedValue(
      waitingReceipt,
    );

    const scope = {
      mode: 'LIVE' as const,
      tenantId: liveCanaryScope.tenantId,
      liveNotBefore: liveCanaryScope.liveNotBefore,
      playTimeAllowAllProfiles: true,
      factTypes: ['SESSION_STARTED', 'HOURLY_SESSION_STARTED'],
      graceMs: 15_000,
    };
    await expect(harness.service.runScheduled(scope)).resolves.toMatchObject({
      deferredFacts: 1,
      fallbackFacts: 0,
    });
    await expect(harness.service.runScheduled(scope)).resolves.toMatchObject({
      deferredFacts: 1,
      fallbackFacts: 0,
    });

    expect(harness.gamification.dryRun).toHaveBeenLastCalledWith(
      expect.any(Object),
      expect.objectContaining({
        eventType: 'SESSION_START',
        sessionType: 'HOURLY',
      }),
      expect.any(Object),
    );
    expect(
      harness.prisma.guestGameOriginReceipt.updateMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: waitingReceipt.id,
          factId: neutral.id,
          claimedSource: null,
          eventId: null,
          status: { in: ['WAITING_LIVE', 'FAILED', 'SHADOWED'] },
        }),
        data: expect.objectContaining({
          factId: hourly.id,
          status: 'WAITING_LIVE',
          claimedSource: null,
          attempts: 0,
        }),
      }),
    );
    expect(harness.gamification.processEvent).not.toHaveBeenCalled();
  });

  it('reconciles a processed generic start when its delayed typed marker arrives', async () => {
    const harness = createService({
      liveEventId: 'event-session-start',
    });
    configureSessionStartRules(harness);
    const neutral = sessionStartFact(
      new Date(now.getTime() - 60_000),
      'SESSION_STARTED',
    );
    const hourly = sessionStartFact(
      new Date(now.getTime() - 30_000),
      'HOURLY_SESSION_STARTED',
    );
    hourly.happenedAt = neutral.happenedAt;
    harness.prisma.guestActivityFact.findMany
      .mockResolvedValueOnce([hourly])
      .mockResolvedValueOnce([neutral, hourly]);
    harness.prisma.guestActivityFact.findUnique.mockResolvedValueOnce({
      factType: neutral.factType,
      profileId: neutral.profileId,
      guestId: neutral.guestId,
      externalProvider: neutral.externalProvider,
      externalDomain: neutral.externalDomain,
      sourceKind: neutral.sourceKind,
      sessionExternalId: neutral.sessionExternalId,
      happenedAt: neutral.happenedAt,
    });
    harness.prisma.guestGameEvent.findFirst.mockResolvedValueOnce({
      id: 'event-session-start',
      eventType: 'SESSION_START',
      payload: {
        processSchemaVersion: 2,
        source: 'guest_gamification_process_event',
        sourceFactId: neutral.id,
        externalProvider: neutral.externalProvider,
        externalDomain: neutral.externalDomain,
        sourceKind: neutral.sourceKind,
        sessionExternalId: neutral.sessionExternalId,
        input: { sessionType: null },
        rules: sessionStartDryRun().rules,
      },
    });
    const processedReceipt = {
      id: 'receipt-processed-generic-start',
      originKey: 'generic-session-start-origin',
      factId: neutral.id,
      eventId: 'event-session-start',
      eventType: 'SESSION_START',
      policy: 'LIVE_WITH_LEDGER_FALLBACK',
      status: 'LIVE_PROCESSED',
      claimedSource: 'LIVE',
      ledgerFirstSeenAt: new Date(now.getTime() - 60_000),
      graceUntil: new Date(now.getTime() - 45_000),
      attempts: 1,
      claimExpiresAt: null,
      processedAt: new Date(now.getTime() - 45_000),
      lastError: null,
    };
    harness.prisma.guestGameOriginReceipt.findFirst.mockResolvedValue(
      processedReceipt,
    );
    harness.gamification.processEvent.mockResolvedValueOnce({
      event: { id: 'event-session-start' },
      summary: {
        idempotent: true,
        createdRewards: 1,
        exactReconciliation: {
          complete: true,
          waitingForDelivery: false,
          deadLetterIntentCount: 0,
          persistedIntentCount: 1,
          appliedXpDelta: 0,
          decisionsPersisted: true,
        },
      },
    });

    await expect(
      harness.service.runScheduled({
        mode: 'LIVE',
        tenantId: liveCanaryScope.tenantId,
        liveNotBefore: liveCanaryScope.liveNotBefore,
        playTimeAllowAllProfiles: true,
        factTypes: ['SESSION_STARTED', 'HOURLY_SESSION_STARTED'],
        graceMs: 15_000,
      }),
    ).resolves.toMatchObject({
      liveHandledFacts: 1,
      deferredFacts: 0,
      createdRewards: 1,
    });

    expect(
      harness.prisma.guestGameOriginReceipt.updateMany,
    ).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          id: processedReceipt.id,
          factId: neutral.id,
          policy: 'LIVE_WITH_LEDGER_FALLBACK',
          status: 'LIVE_PROCESSED',
          claimedSource: 'LIVE',
          eventId: 'event-session-start',
        },
        data: expect.objectContaining({
          factId: hourly.id,
          status: 'WAITING_LIVE',
          claimedSource: null,
          graceUntil: now,
          processedAt: null,
        }),
      }),
    );
    expect(harness.gamification.processEvent).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        eventType: 'SESSION_START',
        sessionType: 'HOURLY',
        activeRulesOnly: true,
      }),
      expect.objectContaining({
        evaluationMode: 'LIVE_LEDGER_FALLBACK',
        allowedRuleIds: new Set(['loot-box-start', 'season-1']),
        allowedBattlePassSteps: new Map([['season-1', 2]]),
        sessionStartReclassificationScope: expect.objectContaining({
          sourceFactId: hourly.id,
          rules: expect.arrayContaining([
            expect.objectContaining({
              ruleKind: 'LOOT_BOX',
              ruleId: 'loot-box-start',
            }),
            expect.objectContaining({
              ruleKind: 'SEASON',
              ruleId: 'season-1',
              battlePassStep: 2,
            }),
          ]),
        }),
      }),
    );
  });

  it('never selects purchase facts in LIVE canary mode', async () => {
    const { service, prisma, gamification } = createService();
    prisma.guestActivityFact.findMany.mockResolvedValueOnce([]);

    await expect(
      service.runScheduled({
        mode: 'LIVE',
        ...liveCanaryScope,
        factTypes: ['PRODUCT_PURCHASED'],
      }),
    ).resolves.toMatchObject({
      checkedFacts: 0,
      fallbackFacts: 0,
      createdEvents: 0,
      createdRewards: 0,
    });

    expect(prisma.guestActivityFact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ factType: { in: [] } }),
      }),
    );
    expect(gamification.dryRun).not.toHaveBeenCalled();
    expect(gamification.processEvent).not.toHaveBeenCalled();
  });

  it.each([
    ['a mission', { kind: 'MISSION' }],
    ['another season', { id: 'season-2' }],
    ['another step', { battlePassStep: 3 }],
    ['a non-bonus reward', { rewardType: 'LOOT_BOX' }],
    ['a zero bonus', { rewardAmount: 0 }],
    ['an XP side effect', { xpDelta: 10 }],
    ['manual approval', { manualApprovalRequired: true }],
  ])(
    'rejects %s from the LIVE Battle Pass reward gate',
    async (_label, patch) => {
      const { service, prisma, gamification } = createService();
      const unsafeDryRun = dryRun();
      unsafeDryRun.rules = [
        {
          ...unsafeDryRun.rules[1],
          ...patch,
        },
      ];
      gamification.dryRun.mockResolvedValueOnce(unsafeDryRun);

      await expect(
        service.runScheduled({
          mode: 'LIVE',
          ...liveCanaryScope,
        }),
      ).resolves.toMatchObject({
        checkedFacts: 0,
        fallbackFacts: 0,
        createdEvents: 0,
        createdRewards: 0,
      });
      expect(prisma.guestGameOriginReceipt.upsert).not.toHaveBeenCalled();
      expect(gamification.processEvent).not.toHaveBeenCalled();
    },
  );

  it('waits for LIVE while the grace period is still open', async () => {
    const { service, prisma, gamification } = createService({
      receiptGraceUntil: new Date(now.getTime() + 10_000),
    });

    await expect(
      service.runScheduled({
        mode: 'LIVE',
        ...liveCanaryScope,
        graceMs: 15_000,
        tenantId: 'tenant-1',
      }),
    ).resolves.toMatchObject({
      checkedFacts: 1,
      deferredFacts: 1,
      liveHandledFacts: 0,
      fallbackFacts: 0,
    });
    expect(prisma.guestGameEvent.findFirst).not.toHaveBeenCalled();
    expect(prisma.guestGameOriginReceipt.updateMany).not.toHaveBeenCalled();
    expect(gamification.processEvent).not.toHaveBeenCalled();
    const upsertCalls = prisma.guestGameOriginReceipt.upsert.mock
      .calls as unknown as Array<
      [{ create: Record<string, unknown>; update: Record<string, unknown> }]
    >;
    expect(upsertCalls[0]?.[0].create).toMatchObject({
      ledgerFirstSeenAt: now,
      graceUntil: new Date(now.getTime() + 15_000),
    });
    expect(upsertCalls[0]?.[0].update).toEqual({});
  });

  it('accepts an existing LIVE event as the authoritative receipt', async () => {
    const { service, prisma, gamification } = createService({
      liveEventId: 'event-live-1',
    });
    gamification.processEvent.mockResolvedValueOnce({
      event: { id: 'event-live-1' },
      summary: { idempotent: true, createdRewards: 0 },
    });

    await expect(
      service.runScheduled({
        mode: 'LIVE',
        ...liveCanaryScope,
        graceMs: 15_000,
        tenantId: 'tenant-1',
      }),
    ).resolves.toMatchObject({
      liveHandledFacts: 1,
      fallbackFacts: 0,
      createdEvents: 0,
      createdRewards: 0,
    });
    expect(prisma.guestGameOriginReceipt.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'receipt-1',
          status: 'PROCESSING',
          claimedSource: 'LIVE_RECONCILIATION',
          attempts: 1,
        }),
        data: expect.objectContaining({
          status: 'LIVE_PROCESSED',
          claimedSource: 'LIVE',
          eventId: 'event-live-1',
        }),
      }),
    );
    expect(gamification.processEvent).toHaveBeenCalledTimes(1);
    expect(prisma.guestGameEvent.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        OR: [
          {
            originKey: {
              in: [
                expect.stringMatching(
                  /^ggo:v2:[a-f0-9]{64}$/,
                ) as unknown as string,
                expect.stringMatching(
                  /^ggo:v1:[a-f0-9]{64}$/,
                ) as unknown as string,
              ],
            },
          },
          {
            externalProvider: IntegrationProvider.LANGAME,
            externalDomain: '46.langamepro.ru',
            externalId: 'guest-game:GUEST_SESSION:PLAY_HOUR:session-42',
          },
        ],
      },
      select: { id: true, eventType: true, payload: true },
    });
  });

  it('reconciles an existing event even after fallback retries are exhausted', async () => {
    const { service, prisma, gamification } = createService({
      liveEventId: 'event-live-1',
    });
    prisma.guestGameOriginReceipt.upsert.mockResolvedValueOnce({
      id: 'receipt-1',
      status: 'FAILED',
      ledgerFirstSeenAt: new Date(now.getTime() - 60_000),
      graceUntil: new Date(now.getTime() - 1_000),
      attempts: 3,
      claimExpiresAt: null,
    });

    await expect(
      service.runScheduled({
        mode: 'LIVE',
        ...liveCanaryScope,
        graceMs: 15_000,
        tenantId: 'tenant-1',
      }),
    ).resolves.toMatchObject({
      liveHandledFacts: 1,
      duplicateFacts: 0,
      fallbackFacts: 0,
    });
    expect(gamification.processEvent).toHaveBeenCalledTimes(1);
  });

  it('does not process when another worker wins the atomic claim race', async () => {
    const { service, prisma, gamification } = createService();
    prisma.guestGameOriginReceipt.updateMany.mockResolvedValueOnce({
      count: 0,
    });

    await expect(
      service.runScheduled({
        mode: 'LIVE',
        ...liveCanaryScope,
        graceMs: 15_000,
        tenantId: 'tenant-1',
      }),
    ).resolves.toMatchObject({
      duplicateFacts: 1,
      fallbackFacts: 0,
      createdEvents: 0,
      createdRewards: 0,
    });
    expect(prisma.guestGameOriginReceipt.updateMany).toHaveBeenCalled();
    const updateCalls = prisma.guestGameOriginReceipt.updateMany.mock
      .calls as unknown as Array<
      [
        {
          where: Record<string, unknown>;
          data: Record<string, unknown>;
        },
      ]
    >;
    const claim = updateCalls[0]?.[0];
    expect(claim?.where).toMatchObject({
      id: 'receipt-1',
      attempts: { equals: 0, lt: 3 },
    });
    expect(claim?.where.OR).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: { in: ['WAITING_LIVE', 'FAILED', 'SHADOWED'] },
        }),
        expect.objectContaining({ status: 'PROCESSING' }),
      ]),
    );
    expect(JSON.stringify(claim?.where)).toContain('EXACT_CANONICALIZATION');
    expect(claim?.data).toMatchObject({
      status: 'PROCESSING',
      claimedSource: 'LEDGER_FALLBACK',
      attempts: { increment: 1 },
      claimExpiresAt: new Date(now.getTime() + 120_000),
    });
    expect(gamification.processEvent).not.toHaveBeenCalled();
  });

  it('creates through the existing pipeline once and rejects a replay claim', async () => {
    const { service, prisma, gamification } = createService();
    prisma.guestGameOriginReceipt.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    await expect(
      service.runScheduled({
        mode: 'LIVE',
        ...liveCanaryScope,
        graceMs: 15_000,
        tenantId: 'tenant-1',
      }),
    ).resolves.toMatchObject({
      fallbackFacts: 1,
      duplicateFacts: 0,
      createdEvents: 1,
      createdRewards: 1,
    });
    await expect(
      service.runScheduled({
        mode: 'LIVE',
        ...liveCanaryScope,
        graceMs: 15_000,
        tenantId: 'tenant-1',
      }),
    ).resolves.toMatchObject({
      fallbackFacts: 0,
      duplicateFacts: 1,
      createdEvents: 0,
      createdRewards: 0,
    });
    expect(gamification.processEvent).toHaveBeenCalledTimes(1);
    expect(gamification.processEvent).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        eventType: 'PLAY_HOUR',
        activeRulesOnly: true,
        sourceFactKind: 'GUEST_SESSION',
        externalId: 'session-42',
      }),
      expect.any(Object),
    );
    const processCalls = gamification.processEvent.mock
      .calls as unknown as Array<[unknown, unknown, Record<string, unknown>]>;
    expect(processCalls[0]?.[2]).toMatchObject({
      evaluationMode: 'LIVE_LEDGER_FALLBACK',
      suppressLedgerShadow: true,
    });
    expect(processCalls[0]?.[2].allowedRuleIds).toEqual(new Set(['season-1']));
    expect(processCalls[0]?.[2].allowedBattlePassSteps).toEqual(
      new Map([['season-1', 2]]),
    );
    expect(processCalls[0]?.[2].originKey).toMatch(/^ggo:v2:[a-f0-9]{64}$/);
    const receiptUpdates = prisma.guestGameOriginReceipt.updateMany.mock
      .calls as unknown as Array<
      [{ where: Record<string, unknown>; data: Record<string, unknown> }]
    >;
    expect(receiptUpdates[1]?.[0].where).toMatchObject({
      id: 'receipt-1',
      status: 'PROCESSING',
      attempts: 1,
    });
  });

  it('does not let an expired worker finalize a reclaimed receipt', async () => {
    const { service, prisma, gamification } = createService();
    prisma.guestGameOriginReceipt.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    await expect(
      service.runScheduled({
        mode: 'LIVE',
        ...liveCanaryScope,
        graceMs: 15_000,
        tenantId: 'tenant-1',
      }),
    ).resolves.toMatchObject({
      fallbackFacts: 0,
      duplicateFacts: 1,
      createdEvents: 0,
      createdRewards: 0,
    });
    expect(gamification.processEvent).toHaveBeenCalledTimes(1);
  });

  it('isolates a dry-run failure and continues with the next fact', async () => {
    const { service, prisma, gamification } = createService();
    const brokenFact = {
      ...fact(new Date(now.getTime() - 120_000)),
      id: 'broken-fact',
      sourceExternalId: 'broken-session',
    };
    const healthyFact = {
      ...fact(new Date(now.getTime() - 60_000)),
      id: 'healthy-fact',
      sourceExternalId: 'healthy-session',
    };
    prisma.guestActivityFact.findMany.mockResolvedValueOnce([
      brokenFact,
      healthyFact,
    ]);
    gamification.dryRun
      .mockRejectedValueOnce(new Error('malformed fact'))
      .mockResolvedValueOnce(dryRun());

    await expect(
      service.runScheduled({
        mode: 'LIVE',
        ...liveCanaryScope,
        limit: 1,
        graceMs: 15_000,
        tenantId: 'tenant-1',
      }),
    ).resolves.toMatchObject({
      processedTenants: 1,
      erroredTenants: 0,
      checkedFacts: 1,
      failedFacts: 1,
      fallbackFacts: 1,
      createdEvents: 1,
      createdRewards: 1,
    });
    expect(gamification.dryRun).toHaveBeenCalledTimes(2);
    expect(gamification.processEvent).toHaveBeenCalledTimes(1);
    expect(prisma.guestGameOriginReceipt.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.guestGameOriginReceipt.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          factId: 'broken-fact',
          status: 'FAILED',
          policy: 'LIVE_WITH_LEDGER_FALLBACK',
        }),
      }),
    );
  });

  it('isolates a LIVE reconciliation failure and continues with the next fact', async () => {
    const { service, prisma, gamification } = createService();
    const brokenFact = {
      ...fact(new Date(now.getTime() - 120_000)),
      id: 'broken-live-fact',
      sourceExternalId: 'broken-live-session',
    };
    const healthyFact = {
      ...fact(new Date(now.getTime() - 60_000)),
      id: 'healthy-fallback-fact',
      sourceExternalId: 'healthy-fallback-session',
    };
    prisma.guestActivityFact.findMany.mockResolvedValueOnce([
      brokenFact,
      healthyFact,
    ]);
    prisma.guestGameOriginReceipt.upsert.mockImplementation((args: unknown) => {
      const input = args as { create: { factId: string } };
      return Promise.resolve({
        id: `receipt-${input.create.factId}`,
        status: 'WAITING_LIVE',
        ledgerFirstSeenAt: new Date(now.getTime() - 60_000),
        graceUntil: new Date(now.getTime() - 1_000),
        attempts: 0,
        claimExpiresAt: null,
      });
    });
    prisma.guestGameEvent.findFirst
      .mockResolvedValueOnce({ id: 'event-live-broken' })
      .mockResolvedValueOnce(null);
    gamification.processEvent
      .mockRejectedValueOnce(new Error('LIVE reconciliation failed'))
      .mockResolvedValueOnce({
        event: { id: 'event-fallback-healthy' },
        summary: { idempotent: false, createdRewards: 1 },
      });

    await expect(
      service.runScheduled({
        mode: 'LIVE',
        ...liveCanaryScope,
        limit: 1,
        graceMs: 15_000,
        tenantId: 'tenant-1',
      }),
    ).resolves.toMatchObject({
      processedTenants: 1,
      erroredTenants: 0,
      checkedFacts: 1,
      failedFacts: 1,
      liveHandledFacts: 0,
      fallbackFacts: 1,
      createdEvents: 1,
      createdRewards: 1,
    });
    expect(gamification.processEvent).toHaveBeenCalledTimes(2);
    const receiptUpdates = prisma.guestGameOriginReceipt.updateMany.mock
      .calls as unknown as Array<
      [{ where: Record<string, unknown>; data: Record<string, unknown> }]
    >;
    expect(
      receiptUpdates.some((call) => call[0].data.status === 'LIVE_PROCESSED'),
    ).toBe(false);
  });

  it('dead-letters exhausted receipts without starving a later fact', async () => {
    const { service, prisma, gamification } = createService();
    const exhaustedFacts = Array.from({ length: 100 }, (_, index) => ({
      ...fact(new Date(now.getTime() - 180_000 + index)),
      id: `exhausted-fact-${index}`,
      sourceExternalId: `exhausted-session-${index}`,
    }));
    const healthyFact = {
      ...fact(new Date(now.getTime() - 60_000)),
      id: 'healthy-fact',
      sourceExternalId: 'healthy-session',
    };
    prisma.guestActivityFact.findMany
      .mockResolvedValueOnce(exhaustedFacts)
      .mockResolvedValueOnce([healthyFact]);
    prisma.guestGameOriginReceipt.upsert.mockImplementation((args: unknown) => {
      const input = args as { create: { factId: string } };
      const exhausted = input.create.factId.startsWith('exhausted-fact-');
      return Promise.resolve({
        id: `receipt-${input.create.factId}`,
        status: exhausted ? 'FAILED' : 'WAITING_LIVE',
        ledgerFirstSeenAt: new Date(now.getTime() - 60_000),
        graceUntil: new Date(now.getTime() - 1_000),
        attempts: exhausted ? 3 : 0,
        claimExpiresAt: null,
      });
    });

    await expect(
      service.runScheduled({
        mode: 'LIVE',
        ...liveCanaryScope,
        limit: 1,
        graceMs: 15_000,
        tenantId: 'tenant-1',
      }),
    ).resolves.toMatchObject({
      checkedFacts: 1,
      failedFacts: 100,
      duplicateFacts: 0,
      fallbackFacts: 1,
      createdEvents: 1,
      createdRewards: 1,
    });
    expect(prisma.guestActivityFact.findMany).toHaveBeenCalledTimes(4);
    expect(gamification.processEvent).toHaveBeenCalledTimes(1);
    const deadLetter = prisma.guestGameOriginReceipt.updateMany.mock.calls.find(
      ([input]) => input.where.id === 'receipt-exhausted-fact-0',
    )?.[0];
    expect(deadLetter).toMatchObject({
      where: {
        id: 'receipt-exhausted-fact-0',
        attempts: { equals: 3, gte: 3 },
        policy: { not: 'EXACT_OPERATOR_CANONICALIZATION' },
      },
      data: {
        status: 'DEAD_LETTER',
        claimExpiresAt: null,
        processedAt: now,
        lastError: 'Ledger fallback exhausted the maximum number of attempts.',
      },
    });
    expect(JSON.stringify(deadLetter?.where)).toContain(
      'EXACT_CANONICALIZATION',
    );
  });

  it('treats a DEAD_LETTER receipt as terminal on replay', async () => {
    const { service, prisma, gamification } = createService();
    prisma.guestGameOriginReceipt.upsert.mockResolvedValueOnce({
      id: 'receipt-1',
      status: 'DEAD_LETTER',
      ledgerFirstSeenAt: new Date(now.getTime() - 60_000),
      graceUntil: new Date(now.getTime() - 1_000),
      attempts: 3,
      claimExpiresAt: null,
    });

    await expect(
      service.runScheduled({
        mode: 'LIVE',
        ...liveCanaryScope,
        graceMs: 15_000,
        tenantId: 'tenant-1',
      }),
    ).resolves.toMatchObject({
      checkedFacts: 0,
      failedFacts: 0,
      duplicateFacts: 1,
      fallbackFacts: 0,
    });
    expect(prisma.guestGameEvent.findFirst).not.toHaveBeenCalled();
    expect(prisma.guestGameOriginReceipt.updateMany).not.toHaveBeenCalled();
    expect(gamification.processEvent).not.toHaveBeenCalled();
  });

  it('reconciles a processed exact canonical event once without taking over its receipt', async () => {
    const { service, prisma, gamification } = createService({
      liveEventId: 'event-exact-1',
    });
    const exactReceipt = {
      id: 'receipt-exact',
      originKey: 'exact-origin',
      factId: 'fact-1',
      eventId: 'event-exact-1',
      eventType: 'PLAY_HOUR',
      policy: 'EXACT_OPERATOR_CANONICALIZATION',
      status: 'PROCESSED',
      claimedSource: 'EXACT_CANONICALIZATION',
      externalProvider: IntegrationProvider.LANGAME,
      externalDomain: '46.langamepro.ru',
      ledgerFirstSeenAt: new Date(now.getTime() - 60_000),
      graceUntil: new Date(now.getTime() - 1_000),
      attempts: 1,
      claimExpiresAt: null,
      processedAt: new Date(now.getTime() - 30_000),
      lastError: null,
      updatedAt: new Date(now.getTime() - 30_000),
    };
    const waitingMarker = {
      id: 'receipt-exact-reconciliation',
      factId: 'fact-1',
      eventId: 'event-exact-1',
      policy: 'EXACT_CANONICAL_RULE_RECONCILIATION',
      status: 'WAITING_LIVE',
      claimedSource: null,
      ledgerFirstSeenAt: now,
      graceUntil: now,
      attempts: 0,
      claimExpiresAt: null,
    };
    prisma.guestGameOriginReceipt.upsert
      .mockResolvedValueOnce(exactReceipt)
      .mockResolvedValueOnce(waitingMarker)
      .mockResolvedValueOnce(exactReceipt)
      .mockResolvedValueOnce({
        ...waitingMarker,
        status: 'PROCESSED',
        claimedSource: 'LEDGER_FALLBACK_EXACT_RECONCILIATION',
        attempts: 1,
      });
    gamification.processEvent.mockResolvedValueOnce({
      event: { id: 'event-exact-1' },
      summary: {
        idempotent: true,
        createdRewards: 1,
        exactReconciliation: {
          complete: true,
          persistedIntentCount: 1,
          appliedXpDelta: 0,
          decisionsPersisted: true,
        },
      },
    });

    const scope = {
      mode: 'LIVE' as const,
      ...liveCanaryScope,
      graceMs: 15_000,
    };
    await expect(service.runScheduled(scope)).resolves.toMatchObject({
      checkedFacts: 1,
      liveHandledFacts: 1,
      fallbackFacts: 0,
      duplicateFacts: 0,
      createdEvents: 0,
      createdRewards: 1,
    });
    await expect(service.runScheduled(scope)).resolves.toMatchObject({
      checkedFacts: 1,
      liveHandledFacts: 0,
      fallbackFacts: 0,
      duplicateFacts: 1,
      createdEvents: 0,
      createdRewards: 0,
    });

    expect(gamification.processEvent).toHaveBeenCalledTimes(1);
    expect(gamification.processEvent).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        eventType: 'PLAY_HOUR',
        activeRulesOnly: true,
      }),
      expect.objectContaining({
        originKey: expect.any(String),
        allowedRuleIds: new Set(['season-1']),
        allowedBattlePassSteps: new Map([['season-1', 2]]),
      }),
    );
    const receiptMutations =
      prisma.guestGameOriginReceipt.updateMany.mock.calls.map(
        ([input]) => input,
      );
    expect(receiptMutations).toHaveLength(2);
    expect(receiptMutations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'receipt-exact-reconciliation',
            factId: 'fact-1',
            policy: 'EXACT_CANONICAL_RULE_RECONCILIATION',
          }),
          data: expect.objectContaining({
            status: 'PROCESSING',
            claimedSource: 'LEDGER_FALLBACK_EXACT_RECONCILIATION',
          }),
        }),
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'receipt-exact-reconciliation',
            factId: 'fact-1',
            claimedSource: 'LEDGER_FALLBACK_EXACT_RECONCILIATION',
          }),
          data: expect.objectContaining({
            status: 'PROCESSED',
            eventId: 'event-exact-1',
          }),
        }),
      ]),
    );
    expect(
      receiptMutations.some(
        (mutation) => mutation.where.id === 'receipt-exact',
      ),
    ).toBe(false);
    expect(prisma.guestGameOriginReceipt.upsert.mock.calls[1][0]).toMatchObject(
      {
        create: {
          factId: 'fact-1',
          eventId: 'event-exact-1',
          policy: 'EXACT_CANONICAL_RULE_RECONCILIATION',
        },
        update: {},
      },
    );
  });

  it('adopts an existing v2 exact receipt without creating a second canonical receipt', async () => {
    const { service, prisma, gamification } = createService({
      liveEventId: 'event-exact-v2',
    });
    const exactReceipt = {
      id: 'receipt-exact-v2',
      originKey: '',
      factId: 'fact-1',
      eventId: 'event-exact-v2',
      policy: 'EXACT_OPERATOR_CANONICALIZATION',
      status: 'PROCESSED',
      claimedSource: 'EXACT_CANONICALIZATION',
      ledgerFirstSeenAt: new Date(now.getTime() - 60_000),
      graceUntil: new Date(now.getTime() - 1_000),
      attempts: 1,
      claimExpiresAt: null,
    };
    prisma.guestGameOriginReceipt.findFirst.mockImplementationOnce((input) =>
      Promise.resolve({
        ...exactReceipt,
        originKey: input.where.originKey,
      }),
    );
    prisma.guestGameOriginReceipt.upsert.mockResolvedValueOnce({
      id: 'receipt-exact-v2-reconciliation',
      factId: 'fact-1',
      eventId: 'event-exact-v2',
      policy: 'EXACT_CANONICAL_RULE_RECONCILIATION',
      status: 'WAITING_LIVE',
      claimedSource: null,
      ledgerFirstSeenAt: now,
      graceUntil: now,
      attempts: 0,
      claimExpiresAt: null,
    });
    gamification.processEvent.mockResolvedValueOnce({
      event: { id: 'event-exact-v2' },
      summary: {
        idempotent: true,
        createdRewards: 1,
        exactReconciliation: {
          complete: true,
          persistedIntentCount: 1,
          appliedXpDelta: 0,
          decisionsPersisted: true,
        },
      },
    });

    await expect(
      service.runScheduled({
        mode: 'LIVE',
        ...liveCanaryScope,
        graceMs: 15_000,
      }),
    ).resolves.toMatchObject({
      checkedFacts: 1,
      liveHandledFacts: 1,
      createdEvents: 0,
      createdRewards: 1,
    });

    expect(prisma.guestGameOriginReceipt.findFirst).toHaveBeenCalledTimes(1);
    expect(
      prisma.guestGameOriginReceipt.findFirst.mock.calls[0][0].where.originKey,
    ).toMatch(/^ggo:v2:[a-f0-9]{64}$/);
    expect(gamification.processEvent).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      expect.objectContaining({
        originKey: expect.stringMatching(/^ggo:v2:[a-f0-9]{64}$/),
      }),
    );
    expect(
      prisma.guestGameOriginReceipt.upsert.mock.calls
        .map(([input]) => input.create?.policy)
        .filter(
          (policy) =>
            policy === 'EXACT_OPERATOR_CANONICALIZATION' ||
            policy === 'LIVE_WITH_LEDGER_FALLBACK',
        ),
    ).toEqual([]);
  });

  it('adopts a pre-existing v1 exact receipt when no v2 receipt exists', async () => {
    const { service, prisma, gamification } = createService({
      liveEventId: 'event-exact-v1',
    });
    prisma.guestGameOriginReceipt.findFirst
      .mockResolvedValueOnce(null)
      .mockImplementationOnce((input) =>
        Promise.resolve({
          id: 'receipt-exact-v1',
          originKey: input.where.originKey,
          factId: 'fact-1',
          eventId: 'event-exact-v1',
          policy: 'EXACT_OPERATOR_CANONICALIZATION',
          status: 'PROCESSED',
          claimedSource: 'EXACT_CANONICALIZATION',
          ledgerFirstSeenAt: new Date(now.getTime() - 60_000),
          graceUntil: new Date(now.getTime() - 1_000),
          attempts: 1,
          claimExpiresAt: null,
        }),
      );
    prisma.guestGameOriginReceipt.upsert.mockResolvedValueOnce({
      id: 'receipt-exact-v1-reconciliation',
      factId: 'fact-1',
      eventId: 'event-exact-v1',
      policy: 'EXACT_CANONICAL_RULE_RECONCILIATION',
      status: 'WAITING_LIVE',
      claimedSource: null,
      ledgerFirstSeenAt: now,
      graceUntil: now,
      attempts: 0,
      claimExpiresAt: null,
    });
    gamification.processEvent.mockResolvedValueOnce({
      event: { id: 'event-exact-v1' },
      summary: {
        idempotent: true,
        createdRewards: 1,
        exactReconciliation: {
          complete: true,
          persistedIntentCount: 1,
          appliedXpDelta: 0,
          decisionsPersisted: true,
        },
      },
    });

    await expect(
      service.runScheduled({
        mode: 'LIVE',
        ...liveCanaryScope,
        graceMs: 15_000,
      }),
    ).resolves.toMatchObject({
      checkedFacts: 1,
      liveHandledFacts: 1,
      createdEvents: 0,
      createdRewards: 1,
    });

    expect(prisma.guestGameOriginReceipt.findFirst).toHaveBeenCalledTimes(2);
    expect(
      prisma.guestGameOriginReceipt.findFirst.mock.calls.map(
        ([input]) => input.where.originKey,
      ),
    ).toEqual([
      expect.stringMatching(/^ggo:v2:[a-f0-9]{64}$/),
      expect.stringMatching(/^ggo:v1:[a-f0-9]{64}$/),
    ]);
    expect(gamification.processEvent).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      expect.objectContaining({
        originKey: expect.stringMatching(/^ggo:v1:[a-f0-9]{64}$/),
      }),
    );
    expect(
      prisma.guestGameOriginReceipt.upsert.mock.calls
        .map(([input]) => input.create?.policy)
        .filter(
          (policy) =>
            policy === 'EXACT_OPERATOR_CANONICALIZATION' ||
            policy === 'LIVE_WITH_LEDGER_FALLBACK',
        ),
    ).toEqual([]);
  });

  it('discovers a processed exact receipt beyond the normal fact watermark and persists its own cursor', async () => {
    const { service, prisma, gamification } = createService({
      liveEventId: 'event-exact-1',
    });
    const exactReceipt = {
      id: 'receipt-exact',
      originKey: 'exact-origin',
      factId: 'fact-1',
      eventId: 'event-exact-1',
      eventType: 'PLAY_HOUR',
      policy: 'EXACT_OPERATOR_CANONICALIZATION',
      status: 'PROCESSED',
      claimedSource: 'EXACT_CANONICALIZATION',
      externalProvider: IntegrationProvider.LANGAME,
      externalDomain: '46.langamepro.ru',
      ledgerFirstSeenAt: new Date(now.getTime() - 60_000),
      graceUntil: new Date(now.getTime() - 1_000),
      attempts: 1,
      claimExpiresAt: null,
      processedAt: new Date(now.getTime() - 30_000),
      lastError: null,
      updatedAt: new Date(now.getTime() - 30_000),
    };
    prisma.guestGameOriginReceipt.findUnique
      .mockResolvedValueOnce({
        factId: 'fact-after-exact',
        ledgerFirstSeenAt: new Date(now.getTime() + 60_000),
      })
      .mockResolvedValueOnce(null);
    prisma.guestGameOriginReceipt.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([exactReceipt]);
    prisma.guestGameOriginReceipt.upsert
      .mockResolvedValueOnce({
        id: 'receipt-exact-reconciliation',
        factId: 'fact-1',
        eventId: 'event-exact-1',
        policy: 'EXACT_CANONICAL_RULE_RECONCILIATION',
        status: 'WAITING_LIVE',
        claimedSource: null,
        ledgerFirstSeenAt: now,
        graceUntil: now,
        attempts: 0,
        claimExpiresAt: null,
      })
      .mockResolvedValueOnce({
        id: 'receipt-exact-watermark',
        factId: 'receipt-exact',
        policy: 'SYSTEM_WATERMARK',
        status: 'PROCESSED',
      });
    gamification.processEvent.mockResolvedValueOnce({
      event: { id: 'event-exact-1' },
      summary: {
        idempotent: true,
        createdRewards: 1,
        exactReconciliation: {
          complete: true,
          persistedIntentCount: 1,
          appliedXpDelta: 0,
          decisionsPersisted: true,
        },
      },
    });

    await expect(
      service.runScheduled({
        mode: 'LIVE',
        tenantId: liveCanaryScope.tenantId,
        liveNotBefore: liveCanaryScope.liveNotBefore,
        playTimeAllowAllProfiles: true,
        limit: 1,
        graceMs: 15_000,
      }),
    ).resolves.toMatchObject({
      checkedFacts: 1,
      liveHandledFacts: 1,
      createdEvents: 0,
      createdRewards: 1,
    });

    expect(
      prisma.guestGameOriginReceipt.findMany.mock.calls[1][0],
    ).toMatchObject({
      where: {
        policy: 'EXACT_OPERATOR_CANONICALIZATION',
        status: 'PROCESSED',
        eventId: { not: null },
      },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take: 1,
    });
    expect(
      prisma.guestGameOriginReceipt.upsert.mock.calls
        .map(([input]) => input)
        .find(
          (input) =>
            input.create?.policy === 'SYSTEM_WATERMARK' &&
            input.create?.factId === 'receipt-exact',
        ),
    ).toMatchObject({
      create: {
        factId: 'receipt-exact',
        eventType: 'SYSTEM_WATERMARK',
        policy: 'SYSTEM_WATERMARK',
      },
      update: {},
    });
  });

  it('continues after a failed exact reconciliation and advances the exact cursor through the next processed receipt', async () => {
    const { service, prisma, gamification } = createService();
    const firstFact = {
      ...fact(new Date(now.getTime() - 120_000)),
      id: 'fact-exact-1',
      sourceExternalId: 'session-exact-1',
      sessionExternalId: 'session-exact-1',
    };
    const secondFact = {
      ...fact(new Date(now.getTime() - 60_000)),
      id: 'fact-exact-2',
      sourceExternalId: 'session-exact-2',
      sessionExternalId: 'session-exact-2',
    };
    const firstExactReceipt = {
      id: 'receipt-exact-1',
      originKey: 'exact-origin-1',
      factId: firstFact.id,
      eventId: 'event-exact-1',
      eventType: 'PLAY_HOUR',
      policy: 'EXACT_OPERATOR_CANONICALIZATION',
      status: 'PROCESSED',
      claimedSource: 'EXACT_CANONICALIZATION',
      externalProvider: IntegrationProvider.LANGAME,
      externalDomain: '46.langamepro.ru',
      updatedAt: new Date(now.getTime() - 30_000),
      ledgerFirstSeenAt: new Date(now.getTime() - 120_000),
      graceUntil: new Date(now.getTime() - 120_000),
      attempts: 1,
      claimExpiresAt: null,
    };
    const secondExactReceipt = {
      ...firstExactReceipt,
      id: 'receipt-exact-2',
      originKey: 'exact-origin-2',
      factId: secondFact.id,
      eventId: 'event-exact-2',
      updatedAt: new Date(now.getTime() - 15_000),
    };
    const firstMarker = {
      id: 'receipt-exact-reconciliation-1',
      factId: firstFact.id,
      eventId: firstExactReceipt.eventId,
      policy: 'EXACT_CANONICAL_RULE_RECONCILIATION',
      status: 'WAITING_LIVE',
      claimedSource: null,
      ledgerFirstSeenAt: now,
      graceUntil: now,
      attempts: 0,
      claimExpiresAt: null,
    };
    const secondMarker = {
      ...firstMarker,
      id: 'receipt-exact-reconciliation-2',
      factId: secondFact.id,
      eventId: secondExactReceipt.eventId,
    };

    prisma.guestGameOriginReceipt.findUnique
      .mockResolvedValueOnce({
        factId: 'fact-after-exact',
        ledgerFirstSeenAt: new Date(now.getTime() + 60_000),
      })
      .mockResolvedValueOnce(null);
    prisma.guestGameOriginReceipt.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([firstExactReceipt, secondExactReceipt]);
    prisma.guestActivityFact.findMany.mockImplementation((input) => {
      if (input.where?.id?.in) {
        return Promise.resolve([firstFact, secondFact]);
      }
      return Promise.resolve([]);
    });
    prisma.guestGameOriginReceipt.upsert
      .mockResolvedValueOnce(firstMarker)
      .mockResolvedValueOnce(secondMarker)
      .mockResolvedValueOnce({
        id: 'receipt-exact-watermark',
        factId: secondExactReceipt.id,
        policy: 'SYSTEM_WATERMARK',
        status: 'PROCESSED',
      });
    prisma.guestGameEvent.findFirst.mockImplementation((input) =>
      Promise.resolve({ id: input.where.id }),
    );
    gamification.processEvent
      .mockRejectedValueOnce(
        new ConflictException({
          code: 'EXACT_CANONICAL_OWNER_QUARANTINED',
          message:
            'Exact canonical event ownership is quarantined because it cannot be transferred safely.',
        }),
      )
      .mockResolvedValueOnce({
        event: { id: secondExactReceipt.eventId },
        summary: {
          idempotent: true,
          createdRewards: 1,
          exactReconciliation: {
            complete: true,
            persistedIntentCount: 1,
            appliedXpDelta: 0,
            decisionsPersisted: true,
          },
        },
      });

    await expect(
      service.runScheduled({
        mode: 'LIVE',
        tenantId: liveCanaryScope.tenantId,
        liveNotBefore: liveCanaryScope.liveNotBefore,
        playTimeAllowAllProfiles: true,
        limit: 2,
        graceMs: 15_000,
      }),
    ).resolves.toMatchObject({
      checkedFacts: 2,
      failedFacts: 1,
      liveHandledFacts: 1,
      createdRewards: 1,
    });

    expect(gamification.processEvent).toHaveBeenCalledTimes(2);
    const receiptMutations =
      prisma.guestGameOriginReceipt.updateMany.mock.calls.map(
        ([input]) => input,
      );
    expect(receiptMutations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          where: expect.objectContaining({
            id: firstMarker.id,
            factId: firstFact.id,
            status: 'PROCESSING',
          }),
          data: expect.objectContaining({
            status: 'DEAD_LETTER',
          }),
        }),
        expect.objectContaining({
          where: expect.objectContaining({
            id: secondMarker.id,
            factId: secondFact.id,
            status: 'PROCESSING',
          }),
          data: expect.objectContaining({
            status: 'PROCESSED',
            eventId: secondExactReceipt.eventId,
          }),
        }),
      ]),
    );
    expect(
      prisma.guestGameOriginReceipt.upsert.mock.calls
        .map(([input]) => input)
        .find(
          (input) =>
            input.create?.policy === 'SYSTEM_WATERMARK' &&
            input.create?.factId === secondExactReceipt.id,
        ),
    ).toMatchObject({
      create: {
        factId: secondExactReceipt.id,
        eventType: 'SYSTEM_WATERMARK',
        policy: 'SYSTEM_WATERMARK',
      },
      update: {},
    });
  });

  it.each(['missing', 'ambiguous'] as const)(
    'quarantines a %s exact source and advances through the next exact receipt',
    async (scenario) => {
      const { service, prisma, gamification } = createService();
      const staleFirstFact = {
        ...fact(new Date(now.getTime() - 180_000)),
        id: 'fact-exact-stale',
        sourceExternalId: 'session-ambiguous',
        sessionExternalId: 'session-ambiguous',
        lifecycleStatus: 'SUPERSEDED',
        supersededAt: new Date(now.getTime() - 120_000),
      };
      const replacementA = {
        ...staleFirstFact,
        id: 'fact-exact-replacement-a',
        lifecycleStatus: 'ACTIVE',
        supersededAt: null,
      };
      const replacementB = {
        ...replacementA,
        id: 'fact-exact-replacement-b',
      };
      const secondFact = {
        ...fact(new Date(now.getTime() - 60_000)),
        id: 'fact-exact-next',
        sourceExternalId: 'session-exact-next',
        sessionExternalId: 'session-exact-next',
      };
      const firstFactId =
        scenario === 'missing' ? 'fact-exact-missing' : staleFirstFact.id;
      const firstReceipt = processedExactReceipt(
        'receipt-exact-first',
        firstFactId,
        'event-exact-first',
        new Date(now.getTime() - 30_000),
      );
      const secondReceipt = processedExactReceipt(
        'receipt-exact-next',
        secondFact.id,
        'event-exact-next',
        new Date(now.getTime() - 15_000),
      );
      const quarantineMarker = exactReconciliationMarker(
        'marker-exact-first',
        firstFactId,
        firstReceipt.eventId,
        'QUARANTINED',
      );
      const secondMarker = exactReconciliationMarker(
        'marker-exact-next',
        secondFact.id,
        secondReceipt.eventId,
      );

      prisma.guestGameOriginReceipt.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([firstReceipt, secondReceipt]);
      prisma.guestActivityFact.findMany.mockImplementation((input) => {
        const ids = input.where?.id?.in as string[] | undefined;
        if (ids?.includes(firstFactId)) {
          return Promise.resolve(
            scenario === 'missing'
              ? [secondFact]
              : [staleFirstFact, secondFact],
          );
        }
        if (ids?.includes(secondFact.id)) {
          return Promise.resolve([secondFact]);
        }
        const sessions = input.where?.sessionExternalId?.in as
          | string[]
          | undefined;
        if (sessions?.includes('session-ambiguous')) {
          return Promise.resolve([replacementA, replacementB]);
        }
        if (sessions?.includes(secondFact.sessionExternalId)) {
          return Promise.resolve([secondFact]);
        }
        return Promise.resolve([]);
      });
      prisma.guestGameOriginReceipt.upsert
        .mockResolvedValueOnce(quarantineMarker)
        .mockResolvedValueOnce(secondMarker)
        .mockResolvedValueOnce({
          id: 'receipt-exact-watermark',
          factId: secondReceipt.id,
          policy: 'SYSTEM_WATERMARK',
          status: 'PROCESSED',
        });
      prisma.guestGameEvent.findFirst.mockImplementation((input) =>
        Promise.resolve({ id: input.where.id }),
      );
      gamification.processEvent.mockResolvedValueOnce({
        event: { id: secondReceipt.eventId },
        summary: {
          idempotent: true,
          createdRewards: 1,
          exactReconciliation: {
            complete: true,
            persistedIntentCount: 1,
            appliedXpDelta: 0,
            decisionsPersisted: true,
          },
        },
      });

      await expect(
        service.runScheduled({
          mode: 'LIVE',
          tenantId: liveCanaryScope.tenantId,
          liveNotBefore: liveCanaryScope.liveNotBefore,
          playTimeAllowAllProfiles: true,
          limit: 2,
          graceMs: 15_000,
        }),
      ).resolves.toMatchObject({
        checkedFacts: 1,
        failedFacts: 0,
        liveHandledFacts: 1,
        createdRewards: 1,
      });

      expect(gamification.processEvent).toHaveBeenCalledTimes(1);
      expect(
        JSON.stringify(prisma.guestGameOriginReceipt.findMany.mock.calls[0][0]),
      ).not.toContain('QUARANTINED');
      expect(
        prisma.guestGameOriginReceipt.upsert.mock.calls
          .map(([input]) => input)
          .find(
            (input) =>
              input.create?.policy === 'EXACT_CANONICAL_RULE_RECONCILIATION' &&
              input.create?.eventId === firstReceipt.eventId,
          ),
      ).toMatchObject({
        create: {
          status: 'QUARANTINED',
          eventId: firstReceipt.eventId,
        },
      });
      expect(
        prisma.guestGameOriginReceipt.upsert.mock.calls
          .map(([input]) => input)
          .find(
            (input) =>
              input.create?.policy === 'SYSTEM_WATERMARK' &&
              input.create?.factId === secondReceipt.id,
          ),
      ).toBeDefined();
    },
  );

  it('quarantines a malformed active exact replacement without starving the next exact receipt', async () => {
    const { service, prisma, gamification } = createService();
    const staleFact = {
      ...fact(new Date(now.getTime() - 180_000)),
      id: 'fact-exact-malformed-stale',
      sourceExternalId: 'session-exact-malformed',
      sessionExternalId: 'session-exact-malformed',
      lifecycleStatus: 'SUPERSEDED',
      supersededAt: new Date(now.getTime() - 120_000),
    };
    const malformedReplacement = {
      ...staleFact,
      id: 'fact-exact-malformed-replacement',
      lifecycleStatus: 'ACTIVE',
      supersededAt: null,
      happenedAt: null,
      durationMinutes: null,
    };
    const nextFact = {
      ...fact(new Date(now.getTime() - 60_000)),
      id: 'fact-exact-after-malformed',
      sourceExternalId: 'session-exact-after-malformed',
      sessionExternalId: 'session-exact-after-malformed',
    };
    const malformedReceipt = processedExactReceipt(
      'receipt-exact-malformed',
      staleFact.id,
      'event-exact-malformed',
      new Date(now.getTime() - 30_000),
    );
    const nextReceipt = processedExactReceipt(
      'receipt-exact-after-malformed',
      nextFact.id,
      'event-exact-after-malformed',
      new Date(now.getTime() - 15_000),
    );
    const quarantineMarker = exactReconciliationMarker(
      'marker-exact-malformed',
      staleFact.id,
      malformedReceipt.eventId,
      'QUARANTINED',
    );
    const nextMarker = exactReconciliationMarker(
      'marker-exact-after-malformed',
      nextFact.id,
      nextReceipt.eventId,
    );

    prisma.guestGameOriginReceipt.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([malformedReceipt, nextReceipt]);
    prisma.guestActivityFact.findMany.mockImplementation((input) => {
      const ids = input.where?.id?.in as string[] | undefined;
      if (ids?.includes(staleFact.id)) {
        return Promise.resolve([staleFact, nextFact]);
      }
      if (ids?.includes(nextFact.id)) {
        return Promise.resolve([nextFact]);
      }
      const sessions = input.where?.sessionExternalId?.in as
        | string[]
        | undefined;
      if (sessions?.includes(staleFact.sessionExternalId)) {
        return Promise.resolve([malformedReplacement]);
      }
      return Promise.resolve([]);
    });
    prisma.guestGameOriginReceipt.upsert
      .mockResolvedValueOnce(quarantineMarker)
      .mockResolvedValueOnce(nextMarker)
      .mockResolvedValueOnce({
        id: 'receipt-exact-watermark',
        factId: nextReceipt.id,
        policy: 'SYSTEM_WATERMARK',
        status: 'PROCESSED',
      });
    prisma.guestGameEvent.findFirst.mockImplementation((input) =>
      Promise.resolve({ id: input.where.id }),
    );
    gamification.processEvent.mockResolvedValueOnce({
      event: { id: nextReceipt.eventId },
      summary: {
        idempotent: true,
        createdRewards: 1,
        exactReconciliation: {
          complete: true,
          persistedIntentCount: 1,
          appliedXpDelta: 0,
          decisionsPersisted: true,
        },
      },
    });

    await expect(
      service.runScheduled({
        mode: 'LIVE',
        tenantId: liveCanaryScope.tenantId,
        liveNotBefore: liveCanaryScope.liveNotBefore,
        playTimeAllowAllProfiles: true,
        limit: 2,
        graceMs: 15_000,
      }),
    ).resolves.toMatchObject({
      checkedFacts: 1,
      failedFacts: 0,
      liveHandledFacts: 1,
      createdRewards: 1,
    });

    expect(gamification.processEvent).toHaveBeenCalledTimes(1);
    expect(
      prisma.guestGameOriginReceipt.upsert.mock.calls
        .map(([input]) => input)
        .find(
          (input) =>
            input.create?.policy === 'EXACT_CANONICAL_RULE_RECONCILIATION' &&
            input.create?.eventId === malformedReceipt.eventId,
        ),
    ).toMatchObject({
      create: {
        status: 'QUARANTINED',
        eventId: malformedReceipt.eventId,
        lastError:
          'Exact reconciliation source has no positive duration or occurrence time.',
      },
    });
    expect(
      prisma.guestGameOriginReceipt.upsert.mock.calls
        .map(([input]) => input)
        .find(
          (input) =>
            input.create?.policy === 'SYSTEM_WATERMARK' &&
            input.create?.factId === nextReceipt.id,
        ),
    ).toBeDefined();
  });

  it('quarantines conflicting exact classifications without starving the next exact receipt', async () => {
    const { service, prisma, gamification } = createService();
    const conflictingFact = {
      ...fact(new Date(now.getTime() - 120_000)),
      id: 'fact-exact-conflict',
      sourceExternalId: 'session-exact-conflict',
      sessionExternalId: 'session-exact-conflict',
    };
    const conflictingSibling = {
      ...conflictingFact,
      id: 'fact-exact-conflict-sibling',
      factType: 'PACKAGE_OR_SUBSCRIPTION_PLAY_TIME_ACCUMULATED',
    };
    const nextFact = {
      ...fact(new Date(now.getTime() - 60_000)),
      id: 'fact-exact-after-conflict',
      sourceExternalId: 'session-exact-after-conflict',
      sessionExternalId: 'session-exact-after-conflict',
    };
    const conflictReceipt = processedExactReceipt(
      'receipt-exact-conflict',
      conflictingFact.id,
      'event-exact-conflict',
      new Date(now.getTime() - 30_000),
    );
    const nextReceipt = processedExactReceipt(
      'receipt-exact-after-conflict',
      nextFact.id,
      'event-exact-after-conflict',
      new Date(now.getTime() - 15_000),
    );
    const quarantineMarker = exactReconciliationMarker(
      'marker-exact-conflict',
      conflictingFact.id,
      conflictReceipt.eventId,
      'QUARANTINED',
    );
    const nextMarker = exactReconciliationMarker(
      'marker-exact-after-conflict',
      nextFact.id,
      nextReceipt.eventId,
    );

    prisma.guestGameOriginReceipt.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([conflictReceipt, nextReceipt]);
    prisma.guestGameOriginReceipt.findFirst.mockResolvedValue(conflictReceipt);
    prisma.guestActivityFact.findMany.mockImplementation((input) => {
      const ids = input.where?.id?.in as string[] | undefined;
      if (ids?.includes(conflictingFact.id)) {
        return Promise.resolve([conflictingFact, nextFact]);
      }
      if (ids?.includes(nextFact.id)) {
        return Promise.resolve([conflictingFact, nextFact]);
      }
      const sessions = input.where?.sessionExternalId?.in as
        | string[]
        | undefined;
      if (sessions?.includes(conflictingFact.sessionExternalId)) {
        return Promise.resolve([conflictingFact, conflictingSibling, nextFact]);
      }
      return Promise.resolve([]);
    });
    prisma.guestGameOriginReceipt.upsert
      .mockResolvedValueOnce(quarantineMarker)
      .mockResolvedValueOnce(nextMarker)
      .mockResolvedValueOnce({
        id: 'receipt-exact-watermark',
        factId: nextReceipt.id,
        policy: 'SYSTEM_WATERMARK',
        status: 'PROCESSED',
      });
    prisma.guestGameEvent.findFirst.mockImplementation((input) =>
      Promise.resolve({ id: input.where.id }),
    );
    gamification.processEvent.mockResolvedValueOnce({
      event: { id: nextReceipt.eventId },
      summary: {
        idempotent: true,
        createdRewards: 1,
        exactReconciliation: {
          complete: true,
          persistedIntentCount: 1,
          appliedXpDelta: 0,
          decisionsPersisted: true,
        },
      },
    });

    await expect(
      service.runScheduled({
        mode: 'LIVE',
        tenantId: liveCanaryScope.tenantId,
        liveNotBefore: liveCanaryScope.liveNotBefore,
        playTimeAllowAllProfiles: true,
        limit: 2,
        graceMs: 15_000,
      }),
    ).resolves.toMatchObject({
      checkedFacts: 1,
      failedFacts: 1,
      liveHandledFacts: 1,
      createdRewards: 1,
    });
    expect(gamification.processEvent).toHaveBeenCalledTimes(1);
    expect(
      prisma.guestGameOriginReceipt.upsert.mock.calls
        .map(([input]) => input)
        .find(
          (input) =>
            input.create?.policy === 'SYSTEM_WATERMARK' &&
            input.create?.factId === nextReceipt.id,
        ),
    ).toBeDefined();
  });

  it('persists an exact retry marker when dry-run fails and advances through the next receipt', async () => {
    const { service, prisma, gamification } = createService();
    const failedFact = {
      ...fact(new Date(now.getTime() - 120_000)),
      id: 'fact-exact-dry-run-failed',
      sourceExternalId: 'session-exact-dry-run-failed',
      sessionExternalId: 'session-exact-dry-run-failed',
    };
    const nextFact = {
      ...fact(new Date(now.getTime() - 60_000)),
      id: 'fact-exact-after-dry-run',
      sourceExternalId: 'session-exact-after-dry-run',
      sessionExternalId: 'session-exact-after-dry-run',
    };
    const failedReceipt = processedExactReceipt(
      'receipt-exact-dry-run-failed',
      failedFact.id,
      'event-exact-dry-run-failed',
      new Date(now.getTime() - 30_000),
    );
    const nextReceipt = processedExactReceipt(
      'receipt-exact-after-dry-run',
      nextFact.id,
      'event-exact-after-dry-run',
      new Date(now.getTime() - 15_000),
    );
    const retryMarker = {
      ...exactReconciliationMarker(
        'marker-exact-dry-run-failed',
        failedFact.id,
        failedReceipt.eventId,
      ),
      status: 'FAILED',
      lastError: 'dry-run failed',
    };
    const nextMarker = exactReconciliationMarker(
      'marker-exact-after-dry-run',
      nextFact.id,
      nextReceipt.eventId,
    );

    prisma.guestGameOriginReceipt.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([failedReceipt, nextReceipt]);
    prisma.guestActivityFact.findMany.mockImplementation((input) => {
      const ids = input.where?.id?.in as string[] | undefined;
      if (ids?.length) return Promise.resolve([failedFact, nextFact]);
      const sessions = input.where?.sessionExternalId?.in as
        | string[]
        | undefined;
      if (sessions?.length) return Promise.resolve([failedFact, nextFact]);
      return Promise.resolve([]);
    });
    prisma.guestGameOriginReceipt.upsert
      .mockResolvedValueOnce(retryMarker)
      .mockResolvedValueOnce(nextMarker)
      .mockResolvedValueOnce({
        id: 'receipt-exact-watermark',
        factId: nextReceipt.id,
        policy: 'SYSTEM_WATERMARK',
        status: 'PROCESSED',
      });
    prisma.guestGameEvent.findFirst.mockImplementation((input) =>
      Promise.resolve({ id: input.where.id }),
    );
    gamification.dryRun
      .mockRejectedValueOnce(new Error('dry-run failed'))
      .mockResolvedValueOnce(dryRun());
    gamification.processEvent.mockResolvedValueOnce({
      event: { id: nextReceipt.eventId },
      summary: {
        idempotent: true,
        createdRewards: 1,
        exactReconciliation: {
          complete: true,
          persistedIntentCount: 1,
          appliedXpDelta: 0,
          decisionsPersisted: true,
        },
      },
    });

    await expect(
      service.runScheduled({
        mode: 'LIVE',
        tenantId: liveCanaryScope.tenantId,
        liveNotBefore: liveCanaryScope.liveNotBefore,
        playTimeAllowAllProfiles: true,
        limit: 2,
        graceMs: 15_000,
      }),
    ).resolves.toMatchObject({
      checkedFacts: 1,
      failedFacts: 1,
      liveHandledFacts: 1,
      createdRewards: 1,
    });
    expect(prisma.guestGameOriginReceipt.upsert.mock.calls[0][0]).toMatchObject(
      {
        create: {
          eventId: failedReceipt.eventId,
          policy: 'EXACT_CANONICAL_RULE_RECONCILIATION',
          status: 'FAILED',
        },
      },
    );
    expect(
      prisma.guestGameOriginReceipt.upsert.mock.calls
        .map(([input]) => input)
        .find(
          (input) =>
            input.create?.policy === 'SYSTEM_WATERMARK' &&
            input.create?.factId === nextReceipt.id,
        ),
    ).toBeDefined();
  });

  it('advances the exact cursor when durable effects are waiting for delivery', async () => {
    const { service, prisma, gamification } = createService();
    const exactFact = {
      ...fact(new Date(now.getTime() - 60_000)),
      id: 'fact-exact-waiting-delivery',
      sourceExternalId: 'session-exact-waiting-delivery',
      sessionExternalId: 'session-exact-waiting-delivery',
    };
    const exactReceipt = processedExactReceipt(
      'receipt-exact-waiting-delivery',
      exactFact.id,
      'event-exact-waiting-delivery',
      new Date(now.getTime() - 15_000),
    );
    const marker = exactReconciliationMarker(
      'marker-exact-waiting-delivery',
      exactFact.id,
      exactReceipt.eventId,
    );
    prisma.guestGameOriginReceipt.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([exactReceipt]);
    prisma.guestActivityFact.findMany.mockImplementation((input) => {
      if (input.where?.id?.in || input.where?.sessionExternalId?.in) {
        return Promise.resolve([exactFact]);
      }
      return Promise.resolve([]);
    });
    prisma.guestGameOriginReceipt.upsert
      .mockResolvedValueOnce(marker)
      .mockResolvedValueOnce({
        id: 'receipt-exact-watermark',
        factId: exactReceipt.id,
        policy: 'SYSTEM_WATERMARK',
        status: 'PROCESSED',
      });
    prisma.guestGameEvent.findFirst.mockResolvedValue({
      id: exactReceipt.eventId,
    });
    gamification.processEvent.mockResolvedValueOnce({
      event: { id: exactReceipt.eventId },
      summary: {
        idempotent: true,
        createdRewards: 0,
        exactReconciliation: {
          complete: false,
          waitingForDelivery: true,
          persistedIntentCount: 1,
          appliedXpDelta: 0,
          decisionsPersisted: true,
        },
      },
    });

    await expect(
      service.runScheduled({
        mode: 'LIVE',
        tenantId: liveCanaryScope.tenantId,
        liveNotBefore: liveCanaryScope.liveNotBefore,
        playTimeAllowAllProfiles: true,
        limit: 1,
        graceMs: 15_000,
      }),
    ).resolves.toMatchObject({
      checkedFacts: 1,
      duplicateFacts: 1,
      failedFacts: 0,
    });
    expect(
      prisma.guestGameOriginReceipt.updateMany.mock.calls
        .map(([input]) => input)
        .find((input) => input.data?.status === 'WAITING_LIVE'),
    ).toMatchObject({
      where: {
        id: marker.id,
        factId: exactFact.id,
        status: 'PROCESSING',
      },
    });
    expect(
      prisma.guestGameOriginReceipt.upsert.mock.calls
        .map(([input]) => input)
        .find(
          (input) =>
            input.create?.policy === 'SYSTEM_WATERMARK' &&
            input.create?.factId === exactReceipt.id,
        ),
    ).toBeDefined();
  });

  it('treats a processed reconciliation marker bound to an old parser fact as durable only when the current owner matches', async () => {
    const { service, prisma, gamification } = createService();
    const reconcileOwner = jest.spyOn(
      exactOwnerReconciler,
      'reconcileExactCanonicalEventOwner',
    );
    const exactFact = {
      ...fact(new Date(now.getTime() - 60_000)),
      id: 'fact-exact-reparsed',
      sourceExternalId: 'session-exact-reparsed',
      sessionExternalId: 'session-exact-reparsed',
    };
    const exactReceipt = processedExactReceipt(
      'receipt-exact-reparsed',
      exactFact.id,
      'event-exact-reparsed',
      new Date(now.getTime() - 15_000),
    );
    const marker = {
      ...exactReconciliationMarker(
        'marker-exact-reparsed',
        'fact-old-parser-version',
        exactReceipt.eventId,
      ),
      status: 'PROCESSED',
      attempts: 1,
      processedAt: new Date(now.getTime() - 30_000),
    };
    prisma.guestGameOriginReceipt.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([exactReceipt]);
    prisma.guestActivityFact.findMany.mockImplementation((input) => {
      if (input.where?.id?.in || input.where?.sessionExternalId?.in) {
        return Promise.resolve([exactFact]);
      }
      return Promise.resolve([]);
    });
    prisma.guestGameOriginReceipt.upsert
      .mockResolvedValueOnce(marker)
      .mockResolvedValueOnce({
        id: 'receipt-exact-watermark',
        factId: exactReceipt.id,
        policy: 'SYSTEM_WATERMARK',
        status: 'PROCESSED',
      });
    prisma.guestGameEvent.findFirst.mockResolvedValueOnce({
      profileId: exactFact.profileId,
      guestId: exactFact.guestId,
    });

    await expect(
      service.runScheduled({
        mode: 'LIVE',
        tenantId: liveCanaryScope.tenantId,
        liveNotBefore: liveCanaryScope.liveNotBefore,
        playTimeAllowAllProfiles: true,
        limit: 1,
        graceMs: 15_000,
      }),
    ).resolves.toMatchObject({
      checkedFacts: 1,
      duplicateFacts: 1,
      failedFacts: 0,
    });
    expect(gamification.processEvent).not.toHaveBeenCalled();
    expect(reconcileOwner).not.toHaveBeenCalled();
    expect(
      prisma.guestGameOriginReceipt.upsert.mock.calls
        .map(([input]) => input)
        .find(
          (input) =>
            input.create?.policy === 'SYSTEM_WATERMARK' &&
            input.create?.factId === exactReceipt.id,
        ),
    ).toBeDefined();
  });

  it('durably quarantines a terminal exact marker when a replacement changes owner after effects', async () => {
    const { service, prisma, gamification } = createService();
    const exactFact = {
      ...fact(new Date(now.getTime() - 60_000)),
      id: 'fact-exact-reparsed-owner-change',
      profileId: 'profile-current-owner',
      guestId: 'guest-current-owner',
      sourceExternalId: 'session-exact-reparsed-owner-change',
      sessionExternalId: 'session-exact-reparsed-owner-change',
    };
    const exactReceipt = processedExactReceipt(
      'receipt-exact-reparsed-owner-change',
      exactFact.id,
      'event-exact-reparsed-owner-change',
      new Date(now.getTime() - 15_000),
    );
    const marker = {
      ...exactReconciliationMarker(
        'marker-exact-reparsed-owner-change',
        'fact-old-owner',
        exactReceipt.eventId,
      ),
      status: 'PROCESSED',
      attempts: 1,
      processedAt: new Date(now.getTime() - 30_000),
    };
    const reconcileOwner = jest
      .spyOn(exactOwnerReconciler, 'reconcileExactCanonicalEventOwner')
      .mockResolvedValueOnce({
        status: 'QUARANTINED',
        quarantineOriginKey: 'owner-quarantine-origin',
        reasonCode: 'MATERIAL_EFFECTS_EXIST',
      });
    prisma.guestGameOriginReceipt.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([exactReceipt]);
    prisma.guestActivityFact.findMany.mockImplementation((input) => {
      if (input.where?.id?.in || input.where?.sessionExternalId?.in) {
        return Promise.resolve([exactFact]);
      }
      return Promise.resolve([]);
    });
    prisma.guestGameOriginReceipt.upsert
      .mockResolvedValueOnce(marker)
      .mockResolvedValueOnce({
        id: 'receipt-exact-watermark',
        factId: exactReceipt.id,
        policy: 'SYSTEM_WATERMARK',
        status: 'PROCESSED',
      });
    prisma.guestGameEvent.findFirst.mockResolvedValueOnce({
      profileId: 'profile-old-owner',
      guestId: 'guest-old-owner',
    });

    await expect(
      service.runScheduled({
        mode: 'LIVE',
        tenantId: liveCanaryScope.tenantId,
        liveNotBefore: liveCanaryScope.liveNotBefore,
        playTimeAllowAllProfiles: true,
        limit: 1,
        graceMs: 15_000,
      }),
    ).resolves.toMatchObject({
      checkedFacts: 1,
      duplicateFacts: 0,
      failedFacts: 1,
    });
    expect(gamification.processEvent).not.toHaveBeenCalled();
    expect(reconcileOwner).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        tenantId: liveCanaryScope.tenantId,
        eventId: exactReceipt.eventId,
        expectedEventType: 'PLAY_HOUR',
        targetProfileId: exactFact.profileId,
        targetGuestId: exactFact.guestId,
        sourceFactId: exactFact.id,
        sourceFactUpdatedAt: exactFact.updatedAt,
      }),
    );
    expect(
      prisma.guestGameOriginReceipt.upsert.mock.calls
        .map(([input]) => input)
        .find(
          (input) =>
            input.create?.policy === 'SYSTEM_WATERMARK' &&
            input.create?.factId === exactReceipt.id,
        ),
    ).toBeDefined();
  });

  it('keeps the exact cursor behind an active reconciliation lease bound to an old parser fact', async () => {
    const { service, prisma, gamification } = createService();
    const exactFact = {
      ...fact(new Date(now.getTime() - 60_000)),
      id: 'fact-exact-reparsed-active-lease',
      sourceExternalId: 'session-exact-reparsed-active-lease',
      sessionExternalId: 'session-exact-reparsed-active-lease',
    };
    const exactReceipt = processedExactReceipt(
      'receipt-exact-reparsed-active-lease',
      exactFact.id,
      'event-exact-reparsed-active-lease',
      new Date(now.getTime() - 15_000),
    );
    const marker = {
      ...exactReconciliationMarker(
        'marker-exact-reparsed-active-lease',
        'fact-old-parser-version',
        exactReceipt.eventId,
      ),
      status: 'PROCESSING',
      claimedSource: 'LEDGER_FALLBACK_EXACT_RECONCILIATION',
      attempts: 1,
      claimExpiresAt: new Date(now.getTime() + 60_000),
    };
    prisma.guestGameOriginReceipt.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([exactReceipt]);
    prisma.guestActivityFact.findMany.mockImplementation((input) => {
      if (input.where?.id?.in || input.where?.sessionExternalId?.in) {
        return Promise.resolve([exactFact]);
      }
      return Promise.resolve([]);
    });
    prisma.guestGameOriginReceipt.upsert.mockResolvedValueOnce(marker);
    prisma.guestGameOriginReceipt.updateMany.mockResolvedValueOnce({
      count: 0,
    });

    await expect(
      service.runScheduled({
        mode: 'LIVE',
        tenantId: liveCanaryScope.tenantId,
        liveNotBefore: liveCanaryScope.liveNotBefore,
        playTimeAllowAllProfiles: true,
        limit: 1,
        graceMs: 15_000,
      }),
    ).resolves.toMatchObject({
      checkedFacts: 1,
      duplicateFacts: 1,
      failedFacts: 0,
    });
    expect(gamification.processEvent).not.toHaveBeenCalled();
    expect(
      prisma.guestGameOriginReceipt.upsert.mock.calls
        .map(([input]) => input)
        .find(
          (input) =>
            input.create?.policy === 'SYSTEM_WATERMARK' &&
            input.create?.factId === exactReceipt.id,
        ),
    ).toBeUndefined();
    const rebind = prisma.guestGameOriginReceipt.updateMany.mock.calls[0][0];
    expect(rebind.where).toMatchObject({
      id: marker.id,
      factId: 'fact-old-parser-version',
      OR: expect.arrayContaining([
        expect.objectContaining({
          status: 'PROCESSING',
        }),
      ]),
    });
    expect(JSON.stringify(rebind.where)).toContain('claimExpiresAt');
  });

  it('does not treat a foreign active reconciliation lease as a durable dry-run retry marker', async () => {
    const { service, prisma, gamification } = createService();
    const exactFact = {
      ...fact(new Date(now.getTime() - 60_000)),
      id: 'fact-exact-reparsed-dry-run',
      sourceExternalId: 'session-exact-reparsed-dry-run',
      sessionExternalId: 'session-exact-reparsed-dry-run',
    };
    const exactReceipt = processedExactReceipt(
      'receipt-exact-reparsed-dry-run',
      exactFact.id,
      'event-exact-reparsed-dry-run',
      new Date(now.getTime() - 15_000),
    );
    const marker = {
      ...exactReconciliationMarker(
        'marker-exact-reparsed-dry-run',
        'fact-old-parser-version',
        exactReceipt.eventId,
      ),
      status: 'PROCESSING',
      claimedSource: 'LEDGER_FALLBACK_EXACT_RECONCILIATION',
      attempts: 1,
      claimExpiresAt: new Date(now.getTime() + 60_000),
    };
    prisma.guestGameOriginReceipt.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([exactReceipt]);
    prisma.guestActivityFact.findMany.mockImplementation((input) => {
      if (input.where?.id?.in || input.where?.sessionExternalId?.in) {
        return Promise.resolve([exactFact]);
      }
      return Promise.resolve([]);
    });
    prisma.guestGameOriginReceipt.upsert.mockResolvedValueOnce(marker);
    prisma.guestGameOriginReceipt.updateMany.mockResolvedValueOnce({
      count: 0,
    });
    gamification.dryRun.mockRejectedValueOnce(new Error('dry-run failed'));

    await expect(
      service.runScheduled({
        mode: 'LIVE',
        tenantId: liveCanaryScope.tenantId,
        liveNotBefore: liveCanaryScope.liveNotBefore,
        playTimeAllowAllProfiles: true,
        limit: 1,
        graceMs: 15_000,
      }),
    ).resolves.toMatchObject({
      checkedFacts: 0,
      failedFacts: 1,
    });
    expect(gamification.processEvent).not.toHaveBeenCalled();
    expect(
      prisma.guestGameOriginReceipt.upsert.mock.calls
        .map(([input]) => input)
        .find(
          (input) =>
            input.create?.policy === 'SYSTEM_WATERMARK' &&
            input.create?.factId === exactReceipt.id,
        ),
    ).toBeUndefined();
    expect(prisma.guestGameOriginReceipt.upsert.mock.calls[0][0]).toMatchObject(
      {
        create: {
          factId: exactFact.id,
          eventId: exactReceipt.eventId,
          policy: 'EXACT_CANONICAL_RULE_RECONCILIATION',
          status: 'FAILED',
        },
      },
    );
    expect(
      prisma.guestGameOriginReceipt.updateMany.mock.calls[0][0],
    ).toMatchObject({
      where: {
        id: marker.id,
        factId: 'fact-old-parser-version',
      },
      data: {
        factId: exactFact.id,
        status: 'FAILED',
      },
    });
  });

  it('rebinds an expired reconciliation lease to the active parser fact and reconciles it', async () => {
    const { service, prisma, gamification } = createService();
    const exactFact = {
      ...fact(new Date(now.getTime() - 60_000)),
      id: 'fact-exact-reparsed-expired-lease',
      sourceExternalId: 'session-exact-reparsed-expired-lease',
      sessionExternalId: 'session-exact-reparsed-expired-lease',
    };
    const exactReceipt = processedExactReceipt(
      'receipt-exact-reparsed-expired-lease',
      exactFact.id,
      'event-exact-reparsed-expired-lease',
      new Date(now.getTime() - 15_000),
    );
    const marker = {
      ...exactReconciliationMarker(
        'marker-exact-reparsed-expired-lease',
        'fact-old-parser-version',
        exactReceipt.eventId,
      ),
      status: 'PROCESSING',
      claimedSource: 'LEDGER_FALLBACK_EXACT_RECONCILIATION',
      attempts: 1,
      claimExpiresAt: new Date(now.getTime() - 60_000),
    };
    prisma.guestGameOriginReceipt.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([exactReceipt]);
    prisma.guestActivityFact.findMany.mockImplementation((input) => {
      if (input.where?.id?.in || input.where?.sessionExternalId?.in) {
        return Promise.resolve([exactFact]);
      }
      return Promise.resolve([]);
    });
    prisma.guestGameOriginReceipt.upsert
      .mockResolvedValueOnce(marker)
      .mockResolvedValueOnce({
        id: 'receipt-exact-watermark',
        factId: exactReceipt.id,
        policy: 'SYSTEM_WATERMARK',
        status: 'PROCESSED',
      });
    prisma.guestGameEvent.findFirst.mockResolvedValue({
      id: exactReceipt.eventId,
    });
    gamification.processEvent.mockResolvedValueOnce({
      event: { id: exactReceipt.eventId },
      summary: {
        idempotent: true,
        createdRewards: 1,
        exactReconciliation: {
          complete: true,
          persistedIntentCount: 1,
          appliedXpDelta: 0,
          decisionsPersisted: true,
        },
      },
    });

    await expect(
      service.runScheduled({
        mode: 'LIVE',
        tenantId: liveCanaryScope.tenantId,
        liveNotBefore: liveCanaryScope.liveNotBefore,
        playTimeAllowAllProfiles: true,
        limit: 1,
        graceMs: 15_000,
      }),
    ).resolves.toMatchObject({
      checkedFacts: 1,
      liveHandledFacts: 1,
      duplicateFacts: 0,
      failedFacts: 0,
      createdRewards: 1,
    });
    expect(gamification.processEvent).toHaveBeenCalledTimes(1);
    const mutations = prisma.guestGameOriginReceipt.updateMany.mock.calls.map(
      ([input]) => input,
    );
    expect(mutations[0]).toMatchObject({
      where: {
        id: marker.id,
        factId: 'fact-old-parser-version',
      },
      data: {
        factId: exactFact.id,
      },
    });
    expect(mutations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          where: expect.objectContaining({
            id: marker.id,
            factId: exactFact.id,
          }),
          data: expect.objectContaining({
            status: 'PROCESSING',
          }),
        }),
        expect.objectContaining({
          where: expect.objectContaining({
            id: marker.id,
            factId: exactFact.id,
            status: 'PROCESSING',
          }),
          data: expect.objectContaining({
            status: 'PROCESSED',
          }),
        }),
      ]),
    );
    expect(
      prisma.guestGameOriginReceipt.upsert.mock.calls
        .map(([input]) => input)
        .find(
          (input) =>
            input.create?.policy === 'SYSTEM_WATERMARK' &&
            input.create?.factId === exactReceipt.id,
        ),
    ).toBeDefined();
  });

  it.each([
    ['active', new Date(now.getTime() + 60_000)],
    ['expired', new Date(now.getTime() - 60_000)],
  ])(
    'never dead-letters or reclaims an %s exact canonicalization lease',
    async (_label, claimExpiresAt) => {
      const { service, prisma, gamification } = createService();
      prisma.guestGameOriginReceipt.upsert.mockResolvedValueOnce({
        id: 'receipt-exact',
        factId: 'fact-1',
        policy: 'EXACT_OPERATOR_CANONICALIZATION',
        status: 'PROCESSING',
        claimedSource: 'EXACT_CANONICALIZATION',
        ledgerFirstSeenAt: new Date(now.getTime() - 60_000),
        graceUntil: new Date(now.getTime() - 1_000),
        attempts: 3,
        claimExpiresAt,
      });

      await expect(
        service.runScheduled({
          mode: 'LIVE',
          ...liveCanaryScope,
          graceMs: 15_000,
          tenantId: 'tenant-1',
        }),
      ).resolves.toMatchObject({
        duplicateFacts: 1,
        failedFacts: 0,
        fallbackFacts: 0,
      });
      expect(prisma.guestGameOriginReceipt.updateMany).not.toHaveBeenCalled();
      expect(prisma.guestGameEvent.findFirst).not.toHaveBeenCalled();
      expect(gamification.processEvent).not.toHaveBeenCalled();
    },
  );

  it.each(['WAITING_LIVE', 'FAILED'])(
    'does not repoint or claim an operator-owned exact receipt in %s status',
    async (status) => {
      const { service, prisma, gamification } = createService();
      prisma.guestGameOriginReceipt.upsert.mockResolvedValueOnce({
        id: 'receipt-exact',
        factId: 'fact-1',
        eventId: null,
        policy: 'EXACT_OPERATOR_CANONICALIZATION',
        status,
        claimedSource: null,
        ledgerFirstSeenAt: new Date(now.getTime() - 60_000),
        graceUntil: new Date(now.getTime() - 1_000),
        attempts: status === 'FAILED' ? 1 : 0,
        claimExpiresAt: null,
      });

      await expect(
        service.runScheduled({
          mode: 'LIVE',
          ...liveCanaryScope,
          graceMs: 15_000,
          tenantId: 'tenant-1',
        }),
      ).resolves.toMatchObject({
        duplicateFacts: 1,
        fallbackFacts: 0,
      });
      expect(
        prisma.guestGameOriginReceipt.upsert.mock.calls[0][0].update,
      ).toEqual({});
      expect(prisma.guestGameOriginReceipt.updateMany).not.toHaveBeenCalled();
      expect(gamification.processEvent).not.toHaveBeenCalled();
    },
  );

  it('claims an existing LIVE event before reconciliation and loses safely to exact canonicalization', async () => {
    const { service, prisma, gamification } = createService({
      liveEventId: 'event-live-1',
    });
    prisma.guestGameOriginReceipt.updateMany.mockResolvedValueOnce({
      count: 0,
    });

    await expect(
      service.runScheduled({
        mode: 'LIVE',
        ...liveCanaryScope,
        graceMs: 15_000,
        tenantId: 'tenant-1',
      }),
    ).resolves.toMatchObject({
      duplicateFacts: 1,
      liveHandledFacts: 0,
      createdRewards: 0,
    });
    const claim = prisma.guestGameOriginReceipt.updateMany.mock.calls[0][0];
    expect(claim).toMatchObject({
      where: {
        id: 'receipt-1',
        attempts: 0,
        policy: { not: 'EXACT_OPERATOR_CANONICALIZATION' },
        OR: expect.arrayContaining([
          expect.objectContaining({ status: 'PROCESSING' }),
        ]),
      },
      data: expect.objectContaining({
        status: 'PROCESSING',
        claimedSource: 'LIVE_RECONCILIATION',
        attempts: { increment: 1 },
      }),
    });
    expect(JSON.stringify(claim.where)).toContain('EXACT_CANONICALIZATION');
    expect(gamification.processEvent).not.toHaveBeenCalled();
  });

  it('paginates past terminal receipts instead of starving a new fact', async () => {
    const { service, prisma, gamification } = createService();
    const oldFacts = Array.from({ length: 100 }, (_, index) => ({
      ...fact(new Date(now.getTime() - 120_000 + index)),
      id: `old-fact-${index}`,
      sourceExternalId: `old-session-${index}`,
    }));
    const freshFact = {
      ...fact(new Date(now.getTime() - 60_000)),
      id: 'fresh-fact',
      sourceExternalId: 'fresh-session',
    };
    prisma.guestActivityFact.findMany
      .mockResolvedValueOnce(oldFacts)
      .mockResolvedValueOnce([freshFact]);
    prisma.guestGameOriginReceipt.upsert.mockImplementation((args: unknown) => {
      const input = args as { create: { factId: string } };
      const terminal = input.create.factId.startsWith('old-fact-');
      return Promise.resolve({
        id: `receipt-${input.create.factId}`,
        status: terminal ? 'PROCESSED' : 'WAITING_LIVE',
        ledgerFirstSeenAt: new Date(now.getTime() - 60_000),
        graceUntil: new Date(now.getTime() - 1_000),
        attempts: terminal ? 1 : 0,
        claimExpiresAt: null,
      });
    });

    await expect(
      service.runScheduled({
        mode: 'LIVE',
        ...liveCanaryScope,
        limit: 1,
        graceMs: 15_000,
        tenantId: 'tenant-1',
      }),
    ).resolves.toMatchObject({
      checkedFacts: 1,
      duplicateFacts: 100,
      fallbackFacts: 1,
      createdEvents: 1,
      createdRewards: 1,
    });
    expect(prisma.guestActivityFact.findMany).toHaveBeenCalledTimes(4);
    expect(gamification.processEvent).toHaveBeenCalledTimes(1);
  });
});

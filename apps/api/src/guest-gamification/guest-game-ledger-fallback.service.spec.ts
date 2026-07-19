import { IntegrationProvider, TenantLifecycleStatus } from '@prisma/client';
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
    sourceHash: 'ledger-parser-version-specific-hash',
    sourceExternalId: 'session-42',
    sessionExternalId: 'session-42',
    factType: 'HOURLY_PLAY_TIME_ACCUMULATED',
    lifecycleStatus: 'ACTIVE',
    confidence: 'EXACT',
    validFrom,
    happenedAt: validFrom,
    durationMinutes: 60,
    amount: null,
    evidence: {},
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
          conditions: {},
          periodFrom: null,
          storeIds: ['store-1'],
        },
      ]),
    },
    guestGameSeason: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'season-1',
          createdAt: new Date('2026-07-01T00:00:00.000Z'),
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
                evaluationPolicy: 'LIVE_WITH_LEDGER_FALLBACK',
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
    },
    guestGameOriginReceipt: {
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

describe('GuestGameLedgerFallbackService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
  });

  afterEach(() => {
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
    expect(decisionCalls[0]?.[2].originKey).toMatch(/^ggo:v1:[a-f0-9]{64}$/);
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
        conditions: {},
        periodFrom: null,
        storeIds: ['store-1'],
      },
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

  it('applies the LIVE cutoff, exact profile and positive-duration query guards', async () => {
    const { service, prisma } = createService();

    await service.runScheduled({
      mode: 'LIVE',
      ...liveCanaryScope,
    });

    expect(prisma.guestActivityFact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          profileId: 'profile-1',
          factType: {
            in: [
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
            originKey: expect.stringMatching(
              /^ggo:v1:[a-f0-9]{64}$/,
            ) as unknown as string,
          },
          {
            externalProvider: IntegrationProvider.LANGAME,
            externalDomain: '46.langamepro.ru',
            externalId: 'guest-game:GUEST_SESSION:PLAY_HOUR:session-42',
          },
        ],
      },
      select: { id: true },
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
    expect(processCalls[0]?.[2].originKey).toMatch(/^ggo:v1:[a-f0-9]{64}$/);
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
    expect(prisma.guestGameOriginReceipt.upsert).toHaveBeenCalledTimes(1);
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
    expect(prisma.guestActivityFact.findMany).toHaveBeenCalledTimes(2);
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

  it('does not repoint or claim an operator-owned exact receipt before its lease starts', async () => {
    const { service, prisma, gamification } = createService();
    prisma.guestGameOriginReceipt.upsert.mockResolvedValueOnce({
      id: 'receipt-exact',
      factId: 'fact-1',
      policy: 'EXACT_OPERATOR_CANONICALIZATION',
      status: 'WAITING_LIVE',
      claimedSource: null,
      ledgerFirstSeenAt: new Date(now.getTime() - 60_000),
      graceUntil: new Date(now.getTime() - 1_000),
      attempts: 0,
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
  });

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
    expect(prisma.guestActivityFact.findMany).toHaveBeenCalledTimes(2);
    expect(gamification.processEvent).toHaveBeenCalledTimes(1);
  });
});

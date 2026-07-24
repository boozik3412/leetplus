import { ConflictException } from '@nestjs/common';
import { IntegrationProvider } from '@prisma/client';
import {
  buildGuestGameOriginKey,
  buildGuestGamePlayTimeOriginKey,
} from './guest-game-origin-key';
import { GuestGameRuleReplayService } from './guest-game-rule-replay.service';

const factUpdatedAt = new Date('2026-07-18T12:00:00.000Z');
const seasonUpdatedAt = new Date('2026-07-18T12:05:00.000Z');

type ReplayDryRunDto = {
  externalDomain: string;
};

type ReplayDryRunOptions = {
  ruleExternalDomains: Map<string, string[]>;
  ruleDomainTimeZones: Map<string, Map<string, string | null>>;
};

type ReplayDryRun = typeof dryRun;

const matchesObject = (value: Record<string, unknown>): unknown =>
  expect.objectContaining(value) as unknown;

const matchesArray = (value: unknown[]): unknown =>
  expect.arrayContaining(value) as unknown;

function fact() {
  return {
    id: 'fact-270',
    tenantId: 'tenant-1',
    profileId: 'profile-0646',
    guestId: 'guest-0646',
    storeId: 'store-1',
    factType: 'PACKAGE_OR_SUBSCRIPTION_PLAY_TIME_ACCUMULATED',
    lifecycleStatus: 'ACTIVE',
    supersededAt: null,
    confidence: 'EXACT',
    happenedAt: new Date('2026-07-17T14:24:00.000Z'),
    durationMinutes: 270,
    externalProvider: IntegrationProvider.LANGAME,
    externalDomain: '46.langamepro.ru',
    externalGuestId: 'lg-guest-0646',
    sourceKind: 'GUEST_SESSION',
    sourceHash: 'source-hash-270',
    sourceExternalId: 'session-270',
    sessionExternalId: 'session-270',
    updatedAt: factUpdatedAt,
  };
}

function season() {
  return {
    id: 'season-1',
    tenantId: 'tenant-1',
    name: 'Test season',
    status: 'ACTIVE',
    storeIds: ['store-1'],
    updatedAt: seasonUpdatedAt,
    levels: [
      {
        id: 'step-1',
        level: 1,
        title: 'Open app',
        activationRules: {
          schemaVersion: 2,
          taskType: 'APP_OPEN',
          evaluationPolicy: 'LIVE_PRIMARY',
        },
      },
      {
        id: 'step-2',
        level: 2,
        title: 'Play for one hour',
        activationRules: {
          schemaVersion: 2,
          taskType: 'PLAY_TIME',
          evaluationPolicy: 'LIVE_WITH_LEDGER_FALLBACK',
        },
      },
      {
        id: 'step-3',
        level: 3,
        title: 'Next challenge',
        activationRules: {
          schemaVersion: 2,
          taskType: 'PLAY_TIME',
          evaluationPolicy: 'LIVE_WITH_LEDGER_FALLBACK',
        },
      },
    ],
  };
}

function rule(eligible = true, step = 2) {
  return {
    id: 'season-1',
    kind: 'SEASON',
    name: 'Test season',
    status: 'ACTIVE',
    triggerKind: 'PLAY_HOUR',
    evaluationPolicy: 'LIVE_WITH_LEDGER_FALLBACK',
    manualApprovalRequired: false,
    eligible,
    rewardType: 'BATTLE_PASS_REWARD',
    rewardAmount: 50,
    rewardLabel: `${step * 25} bonuses`,
    selectedRewardLabel: `${step * 25} bonuses`,
    selectedReward: null,
    xpDelta: 0,
    budgetAmount: null,
    battlePassLevel: step,
    battlePassStep: step,
    battlePassStepTitle:
      step === 2 ? 'Play for one hour' : `Battle Pass step ${step}`,
    periodicLimitPeriod: null,
    progress: { current: eligible ? 270 : 30, target: 60 },
    reasons: eligible ? ['270/60 minutes'] : [],
    blockers: eligible ? [] : ['30/60 minutes'],
  };
}

function dryRun(eligible = true, step = 2) {
  return {
    dryRun: true,
    eventType: 'PLAY_HOUR',
    occurredAt: '2026-07-17T14:24:00.000Z',
    profile: { id: 'profile-0646' },
    guest: { id: 'guest-0646' },
    store: { id: 'store-1', name: 'Club', timeZone: 'Asia/Yekaterinburg' },
    input: {
      sessionType: 'PACKAGE_OR_SUBSCRIPTION',
      sessionPacket: true,
      sessionMinutes: 270,
    },
    summary: {
      checkedRules: 1,
      eligibleRules: eligible ? 1 : 0,
      blockedRules: eligible ? 0 : 1,
      estimatedRewardAmount: eligible ? 50 : 0,
      projectedXpDelta: 0,
    },
    rules: [rule(eligible, step)],
    note: '',
  };
}

function existingIntent(status = 'APPLIED') {
  return {
    id: 'intent-1',
    eventId: 'event-1',
    profileId: 'profile-0646',
    rewardId: status === 'APPLIED' ? 'reward-1' : null,
    originKey:
      'guest-game-origin:LANGAME:46.langamepro.ru:PLAY_HOUR:session-270',
    ruleType: 'SEASON',
    ruleId: 'season-1',
    effectKind: 'REWARD',
    slotKey: '2:BATTLE_PASS_REWARD',
    claimKey: 'season:season-1:profile:profile-0646:step:2',
    status,
    plan: {
      schemaVersion: 1,
      qualifiedAt: '2026-07-17T14:24:00.000Z',
      slotKey: '2:BATTLE_PASS_REWARD',
      claimKey: 'season:season-1:profile:profile-0646:step:2',
      rule: {
        ...rule(true, 2),
        kind: 'SEASON',
        id: 'season-1',
        battlePassStep: 2,
        progress: undefined,
      },
    },
    event: { profileId: 'profile-0646', eventType: 'PLAY_HOUR' },
    reward:
      status === 'APPLIED'
        ? {
            tenantId: 'tenant-1',
            profileId: 'profile-0646',
            seasonId: 'season-1',
            rewardType: 'BATTLE_PASS_REWARD',
            rewardAmount: 50,
            rewardLabel: '50 bonuses',
          }
        : null,
  };
}

function createService(
  options: {
    eligible?: boolean;
    event?: boolean;
    intent?: ReturnType<typeof existingIntent> | null;
    receiptEventId?: string | null;
    receiptStatus?: string;
  } = {},
) {
  const intent = options.intent ?? null;
  const eventId = options.event === false ? null : 'event-1';
  const prisma = {
    guestActivityFact: { findFirst: jest.fn().mockResolvedValue(fact()) },
    guestGameSeason: { findFirst: jest.fn().mockResolvedValue(season()) },
    store: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'store-1',
          externalDomain: '46.langamepro.ru',
          timeZone: 'Asia/Yekaterinburg',
        },
      ]),
    },
    guestGameOriginReceipt: {
      findUnique: jest.fn().mockResolvedValue({
        factId: 'fact-270',
        eventId:
          options.receiptEventId === undefined
            ? eventId
            : options.receiptEventId,
        eventType: 'PLAY_HOUR',
        status: options.receiptStatus ?? 'PROCESSED',
      }),
    },
    guestGameEvent: {
      findFirst: jest.fn().mockResolvedValue(
        options.event === false
          ? null
          : {
              id: 'event-1',
              profileId: 'profile-0646',
              eventType: 'PLAY_HOUR',
            },
      ),
    },
    guestGameRewardIntent: {
      findUnique: jest.fn().mockResolvedValue(intent),
    },
  };
  const dryRunMock = jest.fn<
    Promise<ReturnType<ReplayDryRun>>,
    [unknown, ReplayDryRunDto, ReplayDryRunOptions]
  >();
  dryRunMock.mockResolvedValue(dryRun(options.eligible ?? true));
  const gamification = {
    dryRun: dryRunMock,
    processEvent: jest.fn().mockResolvedValue({
      event: { id: 'event-1' },
      rewards: [{ id: 'reward-1' }],
      summary: { createdRewards: 1, idempotent: true },
    }),
  };
  return {
    service: new GuestGameRuleReplayService(
      prisma as never,
      gamification as never,
    ),
    prisma,
    gamification,
  };
}

const canonicalOriginKey = buildGuestGamePlayTimeOriginKey({
  externalProvider: IntegrationProvider.LANGAME,
  externalDomain: '46.langamepro.ru',
  sourceKind: 'GUEST_SESSION',
  sessionExternalId: 'session-270',
  eventType: 'PLAY_HOUR',
}) as string;
const legacyCanonicalOriginKey = buildGuestGameOriginKey({
  externalProvider: IntegrationProvider.LANGAME,
  externalDomain: '46.langamepro.ru',
  eventType: 'PLAY_HOUR',
  stableExternalId: 'session-270',
}) as string;
const canonicalExternalId = 'guest-game:GUEST_SESSION:PLAY_HOUR:session-270';

function canonicalEvent(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'event-canonical',
    profileId: 'profile-0646',
    guestId: 'guest-0646',
    eventType: 'PLAY_HOUR',
    externalProvider: IntegrationProvider.LANGAME,
    externalDomain: '46.langamepro.ru',
    externalId: canonicalExternalId,
    originKey: canonicalOriginKey,
    xpDelta: 0,
    occurredAt: new Date('2026-07-17T14:24:00.000Z'),
    payload: {
      sourceFactId: 'fact-270',
      sourceFactKind: 'GUEST_SESSION',
      store: { id: 'store-1', name: 'Club' },
      input: {
        sessionMinutes: 270,
        sessionType: 'PACKAGE_OR_SUBSCRIPTION',
        sessionPacket: true,
      },
    },
    ...overrides,
  };
}

function canonicalReceipt(
  status = 'SHADOWED',
  overrides: Partial<Record<string, unknown>> = {},
) {
  return {
    id: 'receipt-canonical',
    factId: 'fact-270',
    eventId: status === 'PROCESSED' ? 'event-canonical' : null,
    eventType: 'PLAY_HOUR',
    externalProvider: IntegrationProvider.LANGAME,
    externalDomain: '46.langamepro.ru',
    status,
    claimedSource: null,
    attempts: 0,
    claimExpiresAt: null,
    updatedAt: new Date('2026-07-18T12:10:00.000Z'),
    ...overrides,
  };
}

function createCanonicalizationService(
  options: {
    receipt?: ReturnType<typeof canonicalReceipt> | null;
    event?: ReturnType<typeof canonicalEvent> | null;
    processIdempotent?: boolean;
    claimCount?: number;
  } = {},
) {
  const initialReceipt = options.receipt ?? null;
  const initialEvent = options.event ?? null;
  const createdReceipt = canonicalReceipt('WAITING_LIVE');
  const persistedEvent = initialEvent ?? canonicalEvent();
  const transactionReceiptUpdate = jest.fn().mockResolvedValue({ count: 1 });
  const transactionAuditCreate = jest
    .fn()
    .mockResolvedValue({ id: 'audit-canonical' });
  const transactionClient = {
    guestGameOriginReceipt: { updateMany: transactionReceiptUpdate },
    guestGameAuditEvent: { create: transactionAuditCreate },
  };
  const prisma = {
    guestActivityFact: { findFirst: jest.fn().mockResolvedValue(fact()) },
    guestGameProfile: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'profile-0646',
        guestId: 'guest-0646',
        guest: {
          id: 'guest-0646',
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: '46.langamepro.ru',
          externalGuestId: 'lg-guest-0646',
        },
      }),
    },
    guestGameOriginReceipt: {
      findUnique: jest.fn().mockResolvedValue(initialReceipt),
      create: jest.fn().mockResolvedValue(createdReceipt),
      updateMany: jest
        .fn()
        .mockResolvedValue({ count: options.claimCount ?? 1 }),
    },
    guestGameEvent: {
      findMany: jest.fn().mockResolvedValue(initialEvent ? [initialEvent] : []),
      findFirst: jest.fn().mockResolvedValue(persistedEvent),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    guestGameRewardIntent: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    guestGameReward: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    guestGameRewardEffect: {
      count: jest.fn().mockResolvedValue(0),
    },
    guestGameEntitlement: {
      count: jest.fn().mockResolvedValue(0),
    },
    guestGameXpPosting: {
      count: jest.fn().mockResolvedValue(0),
    },
    guestGameRuleDecision: {
      count: jest.fn().mockResolvedValue(0),
    },
    $transaction: jest
      .fn()
      .mockImplementation(
        (operation: (client: typeof transactionClient) => Promise<unknown>) =>
          operation(transactionClient),
      ),
  };
  const gamification = {
    processEvent: jest.fn().mockResolvedValue({
      event: { id: persistedEvent.id },
      rewards: [],
      summary: {
        appliedXpDelta: 0,
        createdRewards: 0,
        idempotent: options.processIdempotent ?? false,
      },
    }),
  };
  return {
    service: new GuestGameRuleReplayService(
      prisma as never,
      gamification as never,
    ),
    prisma,
    gamification,
    createdReceipt,
    transactionReceiptUpdate,
    transactionAuditCreate,
  };
}

const user = {
  id: 'user-1',
  tenantId: 'tenant-1',
  tenantSlug: 'tenant-one',
  role: 'OWNER',
  isPlatformAdmin: false,
} as never;

const target = {
  factId: 'fact-270',
  profileId: 'profile-0646',
  seasonId: 'season-1',
  stepId: 'step-2',
  stepSequence: 2,
};

describe('GuestGameRuleReplayService', () => {
  it('previews a selected eligible BP step without writes', async () => {
    const { service, gamification } = createService();

    const result = await service.previewBattlePass(user, target);

    expect(result).toMatchObject({
      mode: 'PREVIEW',
      outcome: 'READY',
      fact: { id: 'fact-270', durationMinutes: 270 },
      target: { stepId: 'step-2', stepSequence: 2 },
      source: { eventId: 'event-1', originReceiptStatus: 'PROCESSED' },
      decision: {
        eligible: true,
        rewardType: 'BATTLE_PASS_REWARD',
        rewardAmount: 50,
        rewardLabel: '50 bonuses',
        selectedRewardLabel: '50 bonuses',
        manualApprovalRequired: false,
        xpDelta: 0,
      },
    });
    expect(result.confirmationHash).toHaveLength(64);
    expect(gamification.processEvent).not.toHaveBeenCalled();
  });

  it('replays a neutral play-time fact with a null session type only for an ANY step', async () => {
    const { service, prisma, gamification } = createService();
    const replaySeason = season();
    prisma.guestActivityFact.findFirst.mockResolvedValue({
      ...fact(),
      factType: 'SESSION_PLAY_TIME_ACCUMULATED',
    });
    prisma.guestGameSeason.findFirst.mockResolvedValue({
      ...replaySeason,
      levels: replaySeason.levels.map((level) =>
        level.id === 'step-2'
          ? {
              ...level,
              activationRules: {
                ...level.activationRules,
                sessionType: 'ANY',
              },
            }
          : level,
      ),
    });

    await expect(
      service.previewBattlePass(user, target),
    ).resolves.toMatchObject({
      outcome: 'READY',
      fact: { factType: 'SESSION_PLAY_TIME_ACCUMULATED' },
    });
    expect(gamification.dryRun).toHaveBeenCalledWith(
      user,
      expect.objectContaining({
        eventType: 'PLAY_HOUR',
        sessionType: null,
        sessionPacket: false,
        sourceFactId: 'fact-270',
      }),
      expect.any(Object),
    );
  });

  it('keeps BP replay identity stable when sourceExternalId changes', async () => {
    const first = createService();
    const reparsed = createService();
    first.prisma.guestActivityFact.findFirst.mockResolvedValue({
      ...fact(),
      sourceExternalId: 'parser-row-v1',
      sessionExternalId: 'session-270',
      sourceKind: 'LANGAME_GUEST_SESSION',
    });
    reparsed.prisma.guestActivityFact.findFirst.mockResolvedValue({
      ...fact(),
      sourceExternalId: 'parser-row-v2',
      sessionExternalId: 'session-270',
      sourceKind: 'LANGAME_GUEST_SESSION',
    });

    const [firstPreview, reparsedPreview] = await Promise.all([
      first.service.previewBattlePass(user, target),
      reparsed.service.previewBattlePass(user, target),
    ]);

    expect(reparsedPreview.source.originKey).toBe(
      firstPreview.source.originKey,
    );
    expect(reparsedPreview.source.originKey).toMatch(/^ggo:v2:/);
    expect(reparsedPreview.source.eventId).toBe(firstPreview.source.eventId);
    expect(reparsedPreview.source.originReceiptStatus).toBe(
      firstPreview.source.originReceiptStatus,
    );
    expect(reparsed.gamification.dryRun).toHaveBeenCalledWith(
      user,
      expect.objectContaining({
        externalId: 'session-270',
        sourceKind: 'LANGAME_GUEST_SESSION',
        sessionExternalId: 'session-270',
        payload: expect.objectContaining({
          sourceKind: 'LANGAME_GUEST_SESSION',
          sessionExternalId: 'session-270',
        }),
      }),
      expect.any(Object),
    );
  });

  it('keeps equal session ids from distinct source kinds separate', async () => {
    const langameSession = createService();
    const importedSession = createService();
    langameSession.prisma.guestActivityFact.findFirst.mockResolvedValue({
      ...fact(),
      sourceKind: 'LANGAME_GUEST_SESSION',
    });
    importedSession.prisma.guestActivityFact.findFirst.mockResolvedValue({
      ...fact(),
      sourceKind: 'IMPORTED_GUEST_SESSION',
    });

    const [langamePreview, importedPreview] = await Promise.all([
      langameSession.service.previewBattlePass(user, target),
      importedSession.service.previewBattlePass(user, target),
    ]);

    expect(importedPreview.source.originKey).not.toBe(
      langamePreview.source.originKey,
    );
    expect(importedPreview.source.originKey).toMatch(/^ggo:v2:/);
    expect(langamePreview.source.originKey).toMatch(/^ggo:v2:/);
  });

  it.each(['HOURLY', 'PACKAGE_OR_SUBSCRIPTION'])(
    'rejects a neutral play-time fact for a %s step before evaluation',
    async (sessionType) => {
      const { service, prisma, gamification } = createService();
      const replaySeason = season();
      prisma.guestActivityFact.findFirst.mockResolvedValue({
        ...fact(),
        factType: 'SESSION_PLAY_TIME_ACCUMULATED',
      });
      prisma.guestGameSeason.findFirst.mockResolvedValue({
        ...replaySeason,
        levels: replaySeason.levels.map((level) =>
          level.id === 'step-2'
            ? {
                ...level,
                activationRules: {
                  ...level.activationRules,
                  sessionType,
                },
              }
            : level,
        ),
      });

      await expect(service.previewBattlePass(user, target)).rejects.toThrow(
        'Neutral play-time facts can be replayed only for a PLAY_TIME step with sessionType=ANY.',
      );
      expect(gamification.dryRun).not.toHaveBeenCalled();
    },
  );

  it('routes a storeless replay fact through the selected season domain and timezone', async () => {
    const { service, prisma, gamification } = createService();
    prisma.guestActivityFact.findFirst.mockResolvedValue({
      ...fact(),
      storeId: null,
    });
    prisma.store.findMany.mockResolvedValue([
      {
        id: 'store-1',
        externalDomain: '46.langamepro.ru',
        timeZone: 'Asia/Yekaterinburg',
      },
      {
        id: 'store-unselected',
        externalDomain: 'other.langamepro.ru',
        timeZone: 'Europe/Moscow',
      },
    ]);

    await expect(
      service.previewBattlePass(user, target),
    ).resolves.toMatchObject({ outcome: 'READY' });

    const options = gamification.dryRun.mock.calls[0][2];
    expect(options.ruleExternalDomains.get('season-1')).toEqual([
      '46.langamepro.ru',
    ]);
    expect(
      options.ruleDomainTimeZones.get('season-1').get('46.langamepro.ru'),
    ).toBe('Asia/Yekaterinburg');
    expect(prisma.store.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        id: { in: ['store-1'] },
        isActive: true,
      },
      select: { id: true, externalDomain: true, timeZone: true },
    });
  });

  it('blocks a storeless replay fact from another domain', async () => {
    const { service, prisma, gamification } = createService();
    prisma.guestActivityFact.findFirst.mockResolvedValue({
      ...fact(),
      storeId: null,
      externalDomain: 'other.langamepro.ru',
    });
    gamification.dryRun.mockImplementation((_user, dto, options) =>
      Promise.resolve(
        dryRun(
          (options.ruleExternalDomains.get('season-1') ?? []).includes(
            dto.externalDomain,
          ),
        ),
      ),
    );

    await expect(
      service.previewBattlePass(user, target),
    ).resolves.toMatchObject({
      outcome: 'BLOCKED',
      decision: { eligible: false },
    });
  });

  it('fails closed when selected clubs on the replay domain have ambiguous timezones', async () => {
    const { service, prisma, gamification } = createService();
    prisma.guestActivityFact.findFirst.mockResolvedValue({
      ...fact(),
      storeId: null,
    });
    prisma.guestGameSeason.findFirst.mockResolvedValue({
      ...season(),
      storeIds: ['store-1', 'store-2'],
    });
    prisma.store.findMany.mockResolvedValue([
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
    ]);
    gamification.dryRun.mockImplementation((_user, _dto, options) =>
      Promise.resolve(
        dryRun(
          Boolean(
            options.ruleDomainTimeZones
              .get('season-1')
              ?.get('46.langamepro.ru'),
          ),
        ),
      ),
    );

    await expect(
      service.previewBattlePass(user, target),
    ).resolves.toMatchObject({
      outcome: 'BLOCKED',
      decision: { eligible: false },
    });
    const options = gamification.dryRun.mock.calls[0][2];
    expect(
      options.ruleDomainTimeZones.get('season-1').get('46.langamepro.ru'),
    ).toBeNull();
  });

  it('binds the replay confirmation hash to the selected season routing', async () => {
    const { service, prisma } = createService();
    const first = await service.previewBattlePass(user, target);
    prisma.store.findMany.mockResolvedValue([
      {
        id: 'store-1',
        externalDomain: '46.langamepro.ru',
        timeZone: 'Europe/Moscow',
      },
    ]);

    const second = await service.previewBattlePass(user, target);

    expect(second.confirmationHash).not.toBe(first.confirmationHash);
  });

  it('binds the replay confirmation hash to the concrete reward plan', async () => {
    const { service, gamification } = createService();
    const first = await service.previewBattlePass(user, target);
    gamification.dryRun.mockResolvedValue({
      ...dryRun(),
      rules: [{ ...rule(), rewardAmount: 100 }],
    });

    const second = await service.previewBattlePass(user, target);

    expect(second.confirmationHash).not.toBe(first.confirmationHash);
  });

  it('keeps the canonical sequence when surrounding legacy steps have no stable id', async () => {
    const { service, prisma } = createService();
    const currentSeason = season();
    prisma.guestGameSeason.findFirst.mockResolvedValue({
      ...currentSeason,
      levels: currentSeason.levels.map((item, index) =>
        index === 1 ? item : { ...item, id: undefined },
      ),
    });

    await expect(
      service.previewBattlePass(user, target),
    ).resolves.toMatchObject({
      outcome: 'READY',
      target: { stepId: 'step-2', stepSequence: 2 },
    });
  });

  it('marks preview unsupported when the canonical event is absent', async () => {
    const { service } = createService({ event: false });

    await expect(
      service.previewBattlePass(user, target),
    ).resolves.toMatchObject({
      outcome: 'UNSUPPORTED',
      source: { eventId: null },
    });
  });

  it('fails closed when receipt and canonical event point to different events', async () => {
    const { service } = createService({ receiptEventId: 'event-other' });

    await expect(service.previewBattlePass(user, target)).rejects.toThrow(
      'Origin receipt и каноническое событие расходятся',
    );
  });

  it('fails closed for a dead-lettered rule-scoped intent', async () => {
    const { service } = createService({
      intent: existingIntent('DEAD_LETTER'),
    });

    await expect(service.previewBattlePass(user, target)).rejects.toThrow(
      'неподдерживаемый статус',
    );
  });

  it('blocks apply when the evaluator no longer matches', async () => {
    const { service, gamification } = createService({ eligible: false });
    const preview = await service.previewBattlePass(user, target);

    await expect(
      service.applyBattlePass(user, {
        ...target,
        expectedFactUpdatedAt: preview.expectedFactUpdatedAt,
        expectedSeasonUpdatedAt: preview.expectedSeasonUpdatedAt,
        confirmationHash: preview.confirmationHash,
        confirmation: 'APPLY_RULE_REPLAY',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(gamification.processEvent).not.toHaveBeenCalled();
  });

  it('applies only the selected season step using the existing event', async () => {
    const { service, prisma, gamification } = createService();
    prisma.guestActivityFact.findFirst.mockResolvedValue({
      ...fact(),
      storeId: null,
    });
    prisma.store.findMany.mockResolvedValue([
      {
        id: 'store-1',
        externalDomain: '46.langamepro.ru',
        timeZone: 'Asia/Yekaterinburg',
      },
      {
        id: 'store-unselected',
        externalDomain: 'other.langamepro.ru',
        timeZone: 'Europe/Moscow',
      },
    ]);
    const preview = await service.previewBattlePass(user, target);
    prisma.guestGameRewardIntent.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existingIntent());

    const result = await service.applyBattlePass(user, {
      ...target,
      expectedFactUpdatedAt: preview.expectedFactUpdatedAt,
      expectedSeasonUpdatedAt: preview.expectedSeasonUpdatedAt,
      confirmationHash: preview.confirmationHash,
      confirmation: 'APPLY_RULE_REPLAY',
    });

    expect(result).toMatchObject({
      mode: 'APPLY',
      outcome: 'APPLIED',
      createdRewards: 1,
      rewardIds: ['reward-1'],
      intent: { id: 'intent-1', status: 'APPLIED' },
    });
    expect(gamification.processEvent).toHaveBeenCalledTimes(1);
    const processCall = gamification.processEvent.mock.calls[0] as unknown as [
      unknown,
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(processCall[0]).toBe(user);
    expect(processCall[1]).toMatchObject({
      sourceFactId: 'fact-270',
      activeRulesOnly: true,
    });
    expect(processCall[2]).toMatchObject({
      allowedRuleIds: ['season-1'],
      evaluationMode: 'LIVE_LEDGER_FALLBACK',
      evaluatorVersion: 'ledger-rule-replay-v1',
      replayRewardScope: {
        ruleId: 'season-1',
        battlePassStep: 2,
        stepId: 'step-2',
      },
    });
    const replayOptions = processCall[2] as {
      ruleExternalDomains: Map<string, string[]>;
      ruleDomainTimeZones: Map<string, Map<string, string | null>>;
    };
    const applyDryRunOptions = gamification.dryRun.mock.calls[1][2];
    expect(replayOptions.ruleExternalDomains).toBe(
      applyDryRunOptions.ruleExternalDomains,
    );
    expect(replayOptions.ruleDomainTimeZones).toBe(
      applyDryRunOptions.ruleDomainTimeZones,
    );
    expect(replayOptions.ruleExternalDomains.get('season-1')).toEqual([
      '46.langamepro.ru',
    ]);
    expect(
      replayOptions.ruleDomainTimeZones
        .get('season-1')
        ?.get('46.langamepro.ru'),
    ).toBe('Asia/Yekaterinburg');
  });

  it('returns an idempotent result for an existing compatible intent', async () => {
    const { service, gamification } = createService({
      intent: existingIntent(),
    });

    const result = await service.applyBattlePass(user, {
      ...target,
      expectedFactUpdatedAt: factUpdatedAt.toISOString(),
      expectedSeasonUpdatedAt: seasonUpdatedAt.toISOString(),
    });

    expect(result).toMatchObject({
      outcome: 'IDEMPOTENT',
      createdRewards: 0,
      rewardIds: ['reward-1'],
    });
    expect(gamification.processEvent).not.toHaveBeenCalled();
  });

  it('fails closed when an existing intent points to a different reward plan', async () => {
    const incompatible = existingIntent();
    incompatible.reward!.rewardAmount = 0;
    const { service } = createService({ intent: incompatible });

    await expect(service.previewBattlePass(user, target)).rejects.toThrow(
      'несовместимым планом награды',
    );
  });

  it('filters by REWARD and rejects a non-reward intent returned for the claim key', async () => {
    const incompatible = {
      ...existingIntent(),
      effectKind: 'XP_POSTING',
    };
    const { service, prisma, gamification } = createService({
      intent: incompatible,
    });

    await expect(service.previewBattlePass(user, target)).rejects.toThrow(
      ConflictException,
    );
    expect(prisma.guestGameRewardIntent.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId_claimKey: {
            tenantId: user.tenantId,
            claimKey: 'season:season-1:profile:profile-0646:step:2',
          },
          effectKind: 'REWARD',
        },
        select: expect.objectContaining({ effectKind: true }),
      }),
    );
    expect(gamification.processEvent).not.toHaveBeenCalled();
  });

  it('returns idempotent after the applied reward advances the current BP step', async () => {
    const { service, gamification } = createService({
      intent: existingIntent(),
    });
    gamification.dryRun.mockResolvedValue(dryRun(true, 3));

    const result = await service.applyBattlePass(user, {
      ...target,
      expectedFactUpdatedAt: factUpdatedAt.toISOString(),
      expectedSeasonUpdatedAt: seasonUpdatedAt.toISOString(),
    });

    expect(result).toMatchObject({
      outcome: 'IDEMPOTENT',
      target: { stepId: 'step-2', stepSequence: 2 },
      decision: {
        eligible: true,
        rewardType: 'BATTLE_PASS_REWARD',
        selectedRewardLabel: '50 bonuses',
      },
      intent: { id: 'intent-1', status: 'APPLIED' },
      rewardIds: ['reward-1'],
    });
    expect(gamification.processEvent).not.toHaveBeenCalled();
  });

  it('does not report success when apply did not leave a durable intent', async () => {
    const { service, prisma, gamification } = createService();
    const preview = await service.previewBattlePass(user, target);
    prisma.guestGameRewardIntent.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    await expect(
      service.applyBattlePass(user, {
        ...target,
        expectedFactUpdatedAt: preview.expectedFactUpdatedAt,
        expectedSeasonUpdatedAt: preview.expectedSeasonUpdatedAt,
        confirmationHash: preview.confirmationHash,
        confirmation: 'APPLY_RULE_REPLAY',
      }),
    ).rejects.toThrow('Rule-scoped intent не найден после apply');
    expect(gamification.processEvent).toHaveBeenCalledTimes(1);
  });
});

describe('GuestGameRuleReplayService exact play-time canonicalization', () => {
  const exactTarget = {
    factId: 'fact-270',
    profileId: 'profile-0646',
  };

  it('previews an exact fact without creating a receipt or event', async () => {
    const { service, prisma, gamification } = createCanonicalizationService();

    const result = await service.previewExactPlayTimeCanonicalization(
      user,
      exactTarget,
    );

    expect(result).toMatchObject({
      mode: 'PREVIEW',
      outcome: 'READY',
      fact: {
        id: 'fact-270',
        profileId: 'profile-0646',
        durationMinutes: 270,
        confidence: 'EXACT',
      },
      canonical: {
        eventType: 'PLAY_HOUR',
        originKey: canonicalOriginKey,
        eventId: null,
        eventValidated: false,
      },
      safety: {
        xpDelta: 0,
        allowedRuleIds: [],
        materializeRewards: false,
      },
    });
    expect(result.confirmationHash).toHaveLength(64);
    expect(prisma.guestGameOriginReceipt.create).not.toHaveBeenCalled();
    expect(prisma.guestGameOriginReceipt.updateMany).not.toHaveBeenCalled();
    expect(gamification.processEvent).not.toHaveBeenCalled();
  });

  it('keeps exact canonical origin stable across parser source ids', async () => {
    const first = createCanonicalizationService({
      receipt: canonicalReceipt('PROCESSED'),
      event: canonicalEvent(),
    });
    const reparsed = createCanonicalizationService({
      receipt: canonicalReceipt('PROCESSED'),
      event: canonicalEvent(),
    });
    first.prisma.guestActivityFact.findFirst.mockResolvedValue({
      ...fact(),
      sourceExternalId: 'parser-row-v1',
      sessionExternalId: 'session-270',
      sourceKind: 'LANGAME_GUEST_SESSION',
    });
    reparsed.prisma.guestActivityFact.findFirst.mockResolvedValue({
      ...fact(),
      sourceExternalId: 'parser-row-v2',
      sessionExternalId: 'session-270',
      sourceKind: 'LANGAME_GUEST_SESSION',
    });

    const [firstPreview, reparsedPreview] = await Promise.all([
      first.service.previewExactPlayTimeCanonicalization(user, exactTarget),
      reparsed.service.previewExactPlayTimeCanonicalization(user, exactTarget),
    ]);

    expect(reparsedPreview.canonical.originKey).toBe(
      firstPreview.canonical.originKey,
    );
    expect(reparsedPreview.canonical.originKey).toMatch(/^ggo:v2:/);
    expect(reparsedPreview.canonical.stableExternalId).toBe('session-270');
    expect(reparsedPreview.canonical.eventId).toBe(
      firstPreview.canonical.eventId,
    );
    expect(reparsedPreview.receipt.id).toBe(firstPreview.receipt.id);
  });

  it('reuses a validated legacy v1 exact event and receipt', async () => {
    const legacyReceipt = canonicalReceipt('PROCESSED');
    const legacyEvent = canonicalEvent({
      originKey: legacyCanonicalOriginKey,
    });
    const { service, prisma } = createCanonicalizationService({
      receipt: legacyReceipt,
      event: legacyEvent,
    });
    prisma.guestGameOriginReceipt.findUnique.mockImplementation(
      ({ where }: { where: { tenantId_originKey: { originKey: string } } }) =>
        Promise.resolve(
          where.tenantId_originKey.originKey === legacyCanonicalOriginKey
            ? legacyReceipt
            : null,
        ),
    );

    await expect(
      service.previewExactPlayTimeCanonicalization(user, exactTarget),
    ).resolves.toMatchObject({
      outcome: 'IDEMPOTENT',
      canonical: {
        originKey: legacyCanonicalOriginKey,
        eventId: 'event-canonical',
        eventValidated: true,
      },
      receipt: {
        id: 'receipt-canonical',
        status: 'PROCESSED',
      },
    });
  });

  it('canonicalizes a neutral exact fact without inventing a session type', async () => {
    const { service, prisma, gamification } = createCanonicalizationService();
    prisma.guestActivityFact.findFirst.mockResolvedValue({
      ...fact(),
      factType: 'SESSION_PLAY_TIME_ACCUMULATED',
    });
    prisma.guestGameEvent.findFirst.mockResolvedValue(
      canonicalEvent({
        payload: {
          sourceFactId: 'fact-270',
          sourceFactKind: 'GUEST_SESSION',
          store: { id: 'store-1', name: 'Club' },
          input: {
            sessionMinutes: 270,
            sessionType: null,
            sessionPacket: false,
          },
        },
      }),
    );
    const preview = await service.previewExactPlayTimeCanonicalization(
      user,
      exactTarget,
    );

    await expect(
      service.applyExactPlayTimeCanonicalization(user, {
        ...exactTarget,
        expectedFactUpdatedAt: preview.expectedFactUpdatedAt,
        confirmationHash: preview.confirmationHash,
        confirmation: 'APPLY_EXACT_CANONICALIZATION',
      }),
    ).resolves.toMatchObject({
      outcome: 'APPLIED',
      fact: { factType: 'SESSION_PLAY_TIME_ACCUMULATED' },
    });
    expect(gamification.processEvent).toHaveBeenCalledWith(
      user,
      expect.objectContaining({
        eventType: 'PLAY_HOUR',
        sessionType: null,
        sessionPacket: false,
        sourceFactId: 'fact-270',
      }),
      expect.any(Object),
    );
  });

  it('creates and finalizes only the canonical event with an atomic safe audit', async () => {
    const {
      service,
      prisma,
      gamification,
      transactionReceiptUpdate,
      transactionAuditCreate,
    } = createCanonicalizationService();
    const preview = await service.previewExactPlayTimeCanonicalization(
      user,
      exactTarget,
    );

    const result = await service.applyExactPlayTimeCanonicalization(user, {
      ...exactTarget,
      expectedFactUpdatedAt: preview.expectedFactUpdatedAt,
      confirmationHash: preview.confirmationHash,
      confirmation: 'APPLY_EXACT_CANONICALIZATION',
    });

    expect(result).toMatchObject({
      mode: 'APPLY',
      outcome: 'APPLIED',
      canonical: { eventId: 'event-canonical', eventValidated: true },
      receipt: { status: 'PROCESSED', attempts: 1 },
    });
    expect(prisma.guestGameOriginReceipt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: matchesObject({
          factId: 'fact-270',
          status: 'WAITING_LIVE',
          originKey: canonicalOriginKey,
        }),
      }),
    );
    expect(prisma.guestGameOriginReceipt.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: matchesObject({
          id: 'receipt-canonical',
          factId: 'fact-270',
          OR: matchesArray([
            matchesObject({
              status: {
                in: matchesArray(['SHADOWED', 'WAITING_LIVE', 'FAILED']),
              },
            }),
          ]),
        }),
        data: matchesObject({
          status: 'PROCESSING',
          claimedSource: 'EXACT_CANONICALIZATION',
          attempts: { increment: 1 },
        }),
      }),
    );
    expect(gamification.processEvent).toHaveBeenCalledWith(
      user,
      expect.objectContaining({
        profileId: 'profile-0646',
        eventType: 'PLAY_HOUR',
        sourceFactId: 'fact-270',
        sessionMinutes: 270,
      }),
      {
        allowedRuleIds: [],
        evaluationMode: 'LIVE_LEDGER_FALLBACK',
        evaluatorVersion: 'exact-canonicalization-v1',
        materializeRewards: false,
        originKey: canonicalOriginKey,
        suppressLedgerShadow: true,
      },
    );
    expect(transactionReceiptUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: matchesObject({
          status: 'PROCESSING',
          attempts: 1,
          claimedSource: 'EXACT_CANONICALIZATION',
        }),
        data: matchesObject({
          status: 'PROCESSED',
          eventId: 'event-canonical',
        }),
      }),
    );
    expect(transactionAuditCreate).toHaveBeenCalledWith({
      data: matchesObject({
        action: 'EXACT_FACT_CANONICALIZED',
        profileId: 'profile-0646',
        payload: matchesObject({
          actorUserId: 'user-1',
          sourceFactId: 'fact-270',
          eventId: 'event-canonical',
          durationMinutes: 270,
        }),
      }),
    });
    const [auditCall] = transactionAuditCreate.mock.calls as unknown as [
      [{ data: { payload: Record<string, unknown> } }],
    ];
    const auditPayload = auditCall[0].data.payload;
    expect(auditPayload).not.toHaveProperty('evidence');
    expect(JSON.stringify(auditPayload)).not.toContain('phone');
    expect(JSON.stringify(auditPayload)).not.toContain('payload');
  });

  it('recovers a crash-created event and finalizes the receipt idempotently', async () => {
    const receipt = canonicalReceipt('FAILED', { attempts: 1 });
    const event = canonicalEvent();
    const { service, gamification } = createCanonicalizationService({
      receipt,
      event,
      processIdempotent: true,
    });
    const preview = await service.previewExactPlayTimeCanonicalization(
      user,
      exactTarget,
    );

    const result = await service.applyExactPlayTimeCanonicalization(user, {
      ...exactTarget,
      expectedFactUpdatedAt: preview.expectedFactUpdatedAt,
      confirmationHash: preview.confirmationHash,
      confirmation: 'APPLY_EXACT_CANONICALIZATION',
    });

    expect(result).toMatchObject({
      outcome: 'IDEMPOTENT',
      canonical: { eventId: 'event-canonical', eventValidated: true },
      receipt: { status: 'PROCESSED', attempts: 2 },
    });
    expect(gamification.processEvent).toHaveBeenCalledTimes(1);
  });

  it('does not reprocess a terminal receipt for the same validated fact', async () => {
    const { service, gamification } = createCanonicalizationService({
      receipt: canonicalReceipt('PROCESSED'),
      event: canonicalEvent(),
    });
    const preview = await service.previewExactPlayTimeCanonicalization(
      user,
      exactTarget,
    );

    expect(preview.outcome).toBe('IDEMPOTENT');
    const result = await service.applyExactPlayTimeCanonicalization(user, {
      ...exactTarget,
      expectedFactUpdatedAt: preview.expectedFactUpdatedAt,
      confirmationHash: preview.confirmationHash,
      confirmation: 'APPLY_EXACT_CANONICALIZATION',
    });
    expect(result.outcome).toBe('IDEMPOTENT');
    expect(gamification.processEvent).not.toHaveBeenCalled();
  });

  it('never repoints a receipt already bound to another fact', async () => {
    const { service, prisma, gamification } = createCanonicalizationService({
      receipt: canonicalReceipt('PROCESSED', { factId: 'fact-other' }),
      event: canonicalEvent(),
    });

    await expect(
      service.previewExactPlayTimeCanonicalization(user, exactTarget),
    ).rejects.toThrow('already bound to a different fact');
    expect(prisma.guestGameOriginReceipt.updateMany).not.toHaveBeenCalled();
    expect(gamification.processEvent).not.toHaveBeenCalled();
  });

  it('fails closed when the canonical event does not match the fact time', async () => {
    const { service, gamification } = createCanonicalizationService({
      receipt: canonicalReceipt('SHADOWED'),
      event: canonicalEvent({
        occurredAt: new Date('2026-07-17T14:25:00.000Z'),
      }),
    });

    await expect(
      service.previewExactPlayTimeCanonicalization(user, exactTarget),
    ).rejects.toThrow('does not exactly match');
    expect(gamification.processEvent).not.toHaveBeenCalled();
  });

  it('does not process when another worker wins the receipt claim', async () => {
    const { service, gamification } = createCanonicalizationService({
      receipt: canonicalReceipt('SHADOWED'),
      claimCount: 0,
    });
    const preview = await service.previewExactPlayTimeCanonicalization(
      user,
      exactTarget,
    );

    await expect(
      service.applyExactPlayTimeCanonicalization(user, {
        ...exactTarget,
        expectedFactUpdatedAt: preview.expectedFactUpdatedAt,
        confirmationHash: preview.confirmationHash,
        confirmation: 'APPLY_EXACT_CANONICALIZATION',
      }),
    ).rejects.toThrow('claim was lost');
    expect(gamification.processEvent).not.toHaveBeenCalled();
  });

  it('fails the claimed receipt when the exact fact changes before processEvent', async () => {
    const { service, prisma, gamification } = createCanonicalizationService();
    const preview = await service.previewExactPlayTimeCanonicalization(
      user,
      exactTarget,
    );
    prisma.guestActivityFact.findFirst
      .mockResolvedValueOnce(fact())
      .mockResolvedValueOnce(null);

    await expect(
      service.applyExactPlayTimeCanonicalization(user, {
        ...exactTarget,
        expectedFactUpdatedAt: preview.expectedFactUpdatedAt,
        confirmationHash: preview.confirmationHash,
        confirmation: 'APPLY_EXACT_CANONICALIZATION',
      }),
    ).rejects.toThrow('changed after receipt claim');

    expect(gamification.processEvent).not.toHaveBeenCalled();
    expect(prisma.guestActivityFact.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: matchesObject({
          id: 'fact-270',
          tenantId: 'tenant-1',
          profileId: 'profile-0646',
          guestId: 'guest-0646',
          lifecycleStatus: 'ACTIVE',
          confidence: 'EXACT',
          supersededAt: null,
          updatedAt: factUpdatedAt,
          sourceHash: 'source-hash-270',
        }),
      }),
    );
    expect(prisma.guestGameOriginReceipt.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: matchesObject({
          status: 'PROCESSING',
          claimedSource: 'EXACT_CANONICALIZATION',
          attempts: 1,
        }),
        data: matchesObject({
          status: 'FAILED',
          lastError: 'EXACT_CANONICALIZATION_FACT_CHANGED_AFTER_CLAIM',
        }),
      }),
    );
  });

  it('rejects an existing event whose payload contains materialized rules', async () => {
    const event = canonicalEvent({
      payload: {
        ...canonicalEvent().payload,
        rules: [{ id: 'mission-polluted' }],
      },
    });
    const { service, prisma, gamification } = createCanonicalizationService({
      receipt: canonicalReceipt('SHADOWED'),
      event,
    });

    await expect(
      service.previewExactPlayTimeCanonicalization(user, exactTarget),
    ).rejects.toThrow('payload already contains');
    expect(prisma.guestGameRewardIntent.findMany).not.toHaveBeenCalled();
    expect(gamification.processEvent).not.toHaveBeenCalled();
  });

  it('rejects an existing event with persisted reward side effects', async () => {
    const { service, prisma, gamification } = createCanonicalizationService({
      receipt: canonicalReceipt('SHADOWED'),
      event: canonicalEvent(),
    });
    prisma.guestGameRewardIntent.findMany.mockResolvedValue([
      { id: 'intent-polluted', rewardId: 'reward-polluted' },
    ]);
    prisma.guestGameReward.findMany.mockResolvedValue([
      { id: 'reward-polluted' },
    ]);
    prisma.guestGameRewardEffect.count.mockResolvedValue(1);
    prisma.guestGameEntitlement.count.mockResolvedValue(1);

    await expect(
      service.previewExactPlayTimeCanonicalization(user, exactTarget),
    ).rejects.toThrow('already has persisted');
    expect(gamification.processEvent).not.toHaveBeenCalled();
  });

  it('requires the fact guest and external identity to match the profile', async () => {
    const { service, prisma, gamification } = createCanonicalizationService();
    prisma.guestGameProfile.findFirst.mockResolvedValue({
      id: 'profile-0646',
      guestId: 'guest-other',
      guest: {
        id: 'guest-other',
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: '46.langamepro.ru',
        externalGuestId: 'lg-guest-other',
      },
    });

    await expect(
      service.previewExactPlayTimeCanonicalization(user, exactTarget),
    ).rejects.toThrow('guestId does not exactly match');
    expect(gamification.processEvent).not.toHaveBeenCalled();
  });

  it('fails closed when fact and profile both have no guest binding', async () => {
    const { service, prisma, gamification } = createCanonicalizationService();
    prisma.guestActivityFact.findFirst.mockResolvedValue({
      ...fact(),
      guestId: null,
    });
    prisma.guestGameProfile.findFirst.mockResolvedValue({
      id: 'profile-0646',
      guestId: null,
      guest: null,
    });

    await expect(
      service.previewExactPlayTimeCanonicalization(user, exactTarget),
    ).rejects.toThrow('requires a non-null fact and profile guest binding');
    expect(gamification.processEvent).not.toHaveBeenCalled();
  });

  it.each([
    ['event guest', { guestId: 'guest-other' }],
    [
      'payload store',
      {
        payload: {
          ...canonicalEvent().payload,
          store: { id: 'store-other' },
        },
      },
    ],
  ])('rejects a canonical event with mismatched %s', async (_label, patch) => {
    const { service, gamification } = createCanonicalizationService({
      receipt: canonicalReceipt('SHADOWED'),
      event: canonicalEvent(patch),
    });

    await expect(
      service.previewExactPlayTimeCanonicalization(user, exactTarget),
    ).rejects.toThrow('does not exactly match');
    expect(gamification.processEvent).not.toHaveBeenCalled();
  });

  it('binds guest, store, provider and session fields into the confirmation hash', async () => {
    const base = createCanonicalizationService();
    const changed = createCanonicalizationService();
    changed.prisma.guestActivityFact.findFirst.mockResolvedValue({
      ...fact(),
      storeId: 'store-2',
    });
    const [basePreview, changedPreview] = await Promise.all([
      base.service.previewExactPlayTimeCanonicalization(user, exactTarget),
      changed.service.previewExactPlayTimeCanonicalization(user, exactTarget),
    ]);

    expect(changedPreview.confirmationHash).not.toBe(
      basePreview.confirmationHash,
    );
  });
});

describe('GuestGameRuleReplayService loot-box entitlement maintenance', () => {
  const exactRows = [
    {
      entitlementId: 'entitlement-open-1',
      rewardId: 'reward-open-1',
      ruleId: 'loot-box-1',
      profileId: 'profile-0646',
      guestId: 'guest-0646',
      storeId: 'store-1',
      rewardQualifiedAt: new Date('2026-07-10T10:05:00.000Z'),
    },
  ];

  function maintenanceService(queryRows: unknown[]) {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue(queryRows),
    };
    return {
      service: new GuestGameRuleReplayService(prisma as never, {} as never),
      prisma,
    };
  }

  it('previews only safe IDs for exact legacy open reconciliation', async () => {
    const { service, prisma } = maintenanceService(exactRows);

    const result = await service.previewLootBoxEntitlementReconciliation(
      user,
      {},
    );

    expect(result).toMatchObject({
      mode: 'PREVIEW',
      outcome: 'READY',
      count: 1,
      updatedCount: 0,
      candidateIds: [
        {
          entitlementId: 'entitlement-open-1',
          rewardId: 'reward-open-1',
          ruleId: 'loot-box-1',
        },
      ],
    });
    expect(result.digest).toHaveLength(64);
    expect(result).not.toHaveProperty('profileId');
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('rechecks and atomically binds an exact legacy open', async () => {
    const previewService = maintenanceService(exactRows);
    const preview =
      await previewService.service.previewLootBoxEntitlementReconciliation(
        user,
        {},
      );
    const auditCreate = jest.fn().mockResolvedValue({ id: 'audit-1' });
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(exactRows),
      $executeRaw: jest.fn().mockResolvedValue(1),
      guestGameAuditEvent: { create: auditCreate },
    };
    const prisma = {
      $transaction: jest
        .fn()
        .mockImplementation(
          (operation: (client: typeof tx) => Promise<unknown>) => operation(tx),
        ),
    };
    const service = new GuestGameRuleReplayService(
      prisma as never,
      {} as never,
    );

    const result = await service.applyLootBoxEntitlementReconciliation(user, {
      expectedCount: preview.count,
      expectedDigest: preview.digest,
      confirmation: 'APPLY_LOOT_BOX_ENTITLEMENT_RECONCILIATION',
    });

    expect(result).toMatchObject({
      mode: 'APPLY',
      outcome: 'APPLIED',
      count: 1,
      updatedCount: 1,
    });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(auditCreate.mock.calls)).toContain(
      'LOOT_BOX_ENTITLEMENT_RECONCILED',
    );
    expect(JSON.stringify(auditCreate.mock.calls)).toContain(
      'entitlement-open-1',
    );
    expect(JSON.stringify(auditCreate.mock.calls)).toContain('profile-0646');
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
  });

  it('fails closed when the exact reconciliation set drifts after preview', async () => {
    const previewService = maintenanceService(exactRows);
    const preview =
      await previewService.service.previewLootBoxEntitlementReconciliation(
        user,
        {},
      );
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]),
      $executeRaw: jest.fn(),
      guestGameAuditEvent: { create: jest.fn() },
    };
    const service = new GuestGameRuleReplayService(
      {
        $transaction: jest
          .fn()
          .mockImplementation(
            (operation: (client: typeof tx) => Promise<unknown>) =>
              operation(tx),
          ),
      } as never,
      {} as never,
    );

    await expect(
      service.applyLootBoxEntitlementReconciliation(user, {
        expectedCount: preview.count,
        expectedDigest: preview.digest,
        confirmation: 'APPLY_LOOT_BOX_ENTITLEMENT_RECONCILIATION',
      }),
    ).rejects.toThrow(ConflictException);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('treats an empty exact reconciliation preview as an idempotent apply', async () => {
    const previewService = maintenanceService([]);
    const preview =
      await previewService.service.previewLootBoxEntitlementReconciliation(
        user,
        {},
      );
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]),
      $executeRaw: jest.fn(),
      guestGameAuditEvent: { create: jest.fn() },
    };
    const service = new GuestGameRuleReplayService(
      {
        $transaction: jest
          .fn()
          .mockImplementation(
            (operation: (client: typeof tx) => Promise<unknown>) =>
              operation(tx),
          ),
      } as never,
      {} as never,
    );

    await expect(
      service.applyLootBoxEntitlementReconciliation(user, {
        expectedCount: 0,
        expectedDigest: preview.digest,
        confirmation: 'APPLY_LOOT_BOX_ENTITLEMENT_RECONCILIATION',
      }),
    ).resolves.toMatchObject({
      outcome: 'IDEMPOTENT',
      count: 0,
      updatedCount: 0,
    });
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(tx.guestGameAuditEvent.create).not.toHaveBeenCalled();
  });

  it('uses a stable greedy rolling-seven-day sequence and never cancels consumed rows', async () => {
    const day = (offset: number) =>
      new Date(Date.parse('2026-07-01T00:00:00.000Z') + offset * 86_400_000);
    const rows = [
      {
        entitlementId: 'entitlement-1',
        ruleId: 'comeback',
        profileId: 'profile-0646',
        guestId: 'guest-0646',
        storeId: 'store-1',
        status: 'AVAILABLE',
        qualifiedAt: day(0),
      },
      {
        entitlementId: 'entitlement-2',
        ruleId: 'comeback',
        profileId: 'profile-0646',
        guestId: 'guest-0646',
        storeId: 'store-1',
        status: 'AVAILABLE',
        qualifiedAt: day(6),
      },
      {
        entitlementId: 'entitlement-3',
        ruleId: 'comeback',
        profileId: 'profile-0646',
        guestId: 'guest-0646',
        storeId: 'store-1',
        status: 'AVAILABLE',
        qualifiedAt: day(7),
      },
      {
        entitlementId: 'entitlement-4',
        ruleId: 'comeback',
        profileId: 'profile-0646',
        guestId: 'guest-0646',
        storeId: 'store-1',
        status: 'CONSUMED',
        qualifiedAt: day(8),
      },
      {
        entitlementId: 'entitlement-5',
        ruleId: 'comeback',
        profileId: 'profile-0646',
        guestId: 'guest-0646',
        storeId: 'store-1',
        status: 'AVAILABLE',
        qualifiedAt: day(14),
      },
      {
        entitlementId: 'entitlement-6',
        ruleId: 'comeback',
        profileId: 'profile-0646',
        guestId: 'guest-0646',
        storeId: 'store-1',
        status: 'AVAILABLE',
        qualifiedAt: day(15),
      },
    ];
    const { service } = maintenanceService(rows);

    const result = await service.previewLootBoxEntitlementOverLimitRepair(
      user,
      {},
    );

    expect(result.candidateIds).toEqual([
      {
        entitlementId: 'entitlement-2',
        ruleId: 'comeback',
        preservedEntitlementId: 'entitlement-1',
      },
      {
        entitlementId: 'entitlement-5',
        ruleId: 'comeback',
        preservedEntitlementId: 'entitlement-4',
      },
    ]);
    expect(result.candidateIds).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entitlementId: 'entitlement-4' }),
      ]),
    );
  });

  it('excludes reward-template lootboxes from over-limit repair candidates', async () => {
    const { service, prisma } = maintenanceService([]);

    await service.previewLootBoxEntitlementOverLimitRepair(user, {});

    const [queryCall] = prisma.$queryRaw.mock.calls as unknown as [
      [{ strings?: readonly string[] }],
    ];
    const query = queryCall[0];
    expect(query.strings?.join('')).toContain(
      `l."usageKind" IN ('STANDALONE', 'BOTH')`,
    );
  });

  it('cancels only the previewed AVAILABLE rolling-window excess set', async () => {
    const rows = [
      {
        entitlementId: 'entitlement-preserved',
        ruleId: 'comeback',
        profileId: 'profile-0646',
        guestId: 'guest-0646',
        storeId: 'store-1',
        status: 'AVAILABLE',
        qualifiedAt: new Date('2026-07-01T00:00:00.000Z'),
      },
      {
        entitlementId: 'entitlement-excess',
        ruleId: 'comeback',
        profileId: 'profile-0646',
        guestId: 'guest-0646',
        storeId: 'store-1',
        status: 'AVAILABLE',
        qualifiedAt: new Date('2026-07-02T00:00:00.000Z'),
      },
    ];
    const previewService = maintenanceService(rows);
    const preview =
      await previewService.service.previewLootBoxEntitlementOverLimitRepair(
        user,
        {},
      );
    const auditCreateMany = jest.fn().mockResolvedValue({ count: 1 });
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(rows)
        .mockResolvedValueOnce([{ id: 'entitlement-excess' }]),
      guestGameAuditEvent: { createMany: auditCreateMany },
    };
    const service = new GuestGameRuleReplayService(
      {
        $transaction: jest
          .fn()
          .mockImplementation(
            (operation: (client: typeof tx) => Promise<unknown>) =>
              operation(tx),
          ),
      } as never,
      {} as never,
    );

    const result = await service.applyLootBoxEntitlementOverLimitRepair(user, {
      expectedCount: preview.count,
      expectedDigest: preview.digest,
      confirmation: 'APPLY_LOOT_BOX_ENTITLEMENT_OVER_LIMIT_REPAIR',
    });

    expect(result).toMatchObject({
      mode: 'APPLY',
      outcome: 'APPLIED',
      count: 1,
      updatedCount: 1,
      candidateIds: [
        {
          entitlementId: 'entitlement-excess',
          preservedEntitlementId: 'entitlement-preserved',
        },
      ],
    });
    expect(auditCreateMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          action: 'LOOT_BOX_ENTITLEMENT_OVER_LIMIT_CANCELED',
          entityId: 'entitlement-excess',
          profileId: 'profile-0646',
        }),
      ],
    });
  });

  it('is idempotent after the rolling-window repair reaches zero candidates', async () => {
    const previewService = maintenanceService([]);
    const preview =
      await previewService.service.previewLootBoxEntitlementOverLimitRepair(
        user,
        {},
      );
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]),
      guestGameAuditEvent: { createMany: jest.fn() },
    };
    const service = new GuestGameRuleReplayService(
      {
        $transaction: jest
          .fn()
          .mockImplementation(
            (operation: (client: typeof tx) => Promise<unknown>) =>
              operation(tx),
          ),
      } as never,
      {} as never,
    );

    await expect(
      service.applyLootBoxEntitlementOverLimitRepair(user, {
        expectedCount: 0,
        expectedDigest: preview.digest,
        confirmation: 'APPLY_LOOT_BOX_ENTITLEMENT_OVER_LIMIT_REPAIR',
      }),
    ).resolves.toMatchObject({
      outcome: 'IDEMPOTENT',
      count: 0,
      updatedCount: 0,
    });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(3);
    expect(tx.guestGameAuditEvent.createMany).not.toHaveBeenCalled();
  });
});

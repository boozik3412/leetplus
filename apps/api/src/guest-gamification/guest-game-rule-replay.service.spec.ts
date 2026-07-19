import { ConflictException } from '@nestjs/common';
import { IntegrationProvider } from '@prisma/client';
import { buildGuestGameOriginKey } from './guest-game-origin-key';
import { GuestGameRuleReplayService } from './guest-game-rule-replay.service';

const factUpdatedAt = new Date('2026-07-18T12:00:00.000Z');
const seasonUpdatedAt = new Date('2026-07-18T12:05:00.000Z');

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
  const gamification = {
    dryRun: jest.fn().mockResolvedValue(dryRun(options.eligible ?? true)),
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

const canonicalOriginKey = buildGuestGameOriginKey({
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
    $transaction: jest.fn().mockImplementation(async (operation) =>
      operation({
        guestGameOriginReceipt: { updateMany: transactionReceiptUpdate },
        guestGameAuditEvent: { create: transactionAuditCreate },
      }),
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
    gamification.dryRun.mockImplementation(async (_user, dto, options) =>
      dryRun(
        options.ruleExternalDomains
          .get('season-1')
          .includes(dto.externalDomain),
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
    gamification.dryRun.mockImplementation(async (_user, _dto, options) =>
      dryRun(
        Boolean(
          options.ruleDomainTimeZones.get('season-1').get('46.langamepro.ru'),
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
        data: expect.objectContaining({
          factId: 'fact-270',
          status: 'WAITING_LIVE',
          originKey: canonicalOriginKey,
        }),
      }),
    );
    expect(prisma.guestGameOriginReceipt.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'receipt-canonical',
          factId: 'fact-270',
          OR: expect.arrayContaining([
            expect.objectContaining({
              status: {
                in: expect.arrayContaining([
                  'SHADOWED',
                  'WAITING_LIVE',
                  'FAILED',
                ]),
              },
            }),
          ]),
        }),
        data: expect.objectContaining({
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
        where: expect.objectContaining({
          status: 'PROCESSING',
          attempts: 1,
          claimedSource: 'EXACT_CANONICALIZATION',
        }),
        data: expect.objectContaining({
          status: 'PROCESSED',
          eventId: 'event-canonical',
        }),
      }),
    );
    expect(transactionAuditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'EXACT_FACT_CANONICALIZED',
        profileId: 'profile-0646',
        payload: expect.objectContaining({
          actorUserId: 'user-1',
          sourceFactId: 'fact-270',
          eventId: 'event-canonical',
          durationMinutes: 270,
        }),
      }),
    });
    const auditPayload = transactionAuditCreate.mock.calls[0][0].data.payload;
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
        where: expect.objectContaining({
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
        where: expect.objectContaining({
          status: 'PROCESSING',
          claimedSource: 'EXACT_CANONICALIZATION',
          attempts: 1,
        }),
        data: expect.objectContaining({
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

import { ConflictException } from '@nestjs/common';
import { IntegrationProvider } from '@prisma/client';
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
      decision: { eligible: true, xpDelta: 0 },
    });
    expect(result.confirmationHash).toHaveLength(64);
    expect(gamification.processEvent).not.toHaveBeenCalled();
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

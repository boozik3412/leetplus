import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { IntegrationProvider, Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { buildGuestGameOriginKey } from './guest-game-origin-key';
import {
  GuestGamificationService,
  type GuestGameDryRunRule,
  type GuestGameProcessEventDto,
} from './guest-gamification.service';

const replayFactTypes = new Set([
  'HOURLY_PLAY_TIME_ACCUMULATED',
  'PACKAGE_OR_SUBSCRIPTION_PLAY_TIME_ACCUMULATED',
]);
const replayReceiptStatuses = new Set(['PROCESSED', 'LIVE_PROCESSED']);
const replayIntentStatuses = new Set([
  'PENDING',
  'PROCESSING',
  'FAILED',
  'APPLIED',
]);

export type GuestGameBattlePassReplayPreviewDto = {
  factId?: string | null;
  profileId?: string | null;
  seasonId?: string | null;
  stepId?: string | null;
  stepSequence?: number | string | null;
};

export type GuestGameBattlePassReplayApplyDto =
  GuestGameBattlePassReplayPreviewDto & {
    expectedFactUpdatedAt?: string | null;
    expectedSeasonUpdatedAt?: string | null;
    confirmationHash?: string | null;
    confirmation?: string | null;
  };

export type GuestGameBattlePassReplayResult = {
  mode: 'PREVIEW' | 'APPLY';
  outcome:
    | 'READY'
    | 'BLOCKED'
    | 'UNSUPPORTED'
    | 'QUEUED'
    | 'APPLIED'
    | 'IDEMPOTENT';
  confirmationHash: string;
  expectedFactUpdatedAt: string;
  expectedSeasonUpdatedAt: string;
  fact: {
    id: string;
    factType: string;
    happenedAt: string;
    durationMinutes: number;
    confidence: string;
  };
  target: {
    seasonId: string;
    seasonName: string;
    stepId: string;
    stepSequence: number;
    stepTitle: string | null;
    slotKey: string;
    profileId: string;
  };
  source: {
    originKey: string;
    eventId: string | null;
    originReceiptStatus: string | null;
  };
  decision: {
    eligible: boolean;
    status: 'MATCHED' | 'BLOCKED';
    rewardType: string | null;
    selectedRewardLabel: string | null;
    xpDelta: number;
    reasons: string[];
    blockers: string[];
    progress: unknown;
  };
  intent: {
    id: string;
    status: string;
    eventId: string;
    rewardId: string | null;
  } | null;
  createdRewards: number;
  rewardIds: string[];
  note: string;
};

type PreparedReplay = {
  tenantId: string;
  fact: {
    id: string;
    profileId: string;
    guestId: string | null;
    storeId: string | null;
    factType: string;
    happenedAt: Date;
    durationMinutes: number;
    confidence: string;
    externalProvider: string;
    externalDomain: string;
    stableExternalId: string;
    updatedAt: Date;
  };
  season: {
    id: string;
    name: string;
    updatedAt: Date;
  };
  step: {
    id: string;
    sequence: number;
    title: string | null;
  };
  rule: GuestGameDryRunRule;
  processDto: GuestGameProcessEventDto;
  originKey: string;
  eventId: string | null;
  originReceiptStatus: string | null;
  slotKey: string;
  claimKey: string;
  confirmationHash: string;
  existingIntent: {
    id: string;
    eventId: string;
    profileId: string | null;
    rewardId: string | null;
    originKey: string | null;
    ruleType: string;
    ruleId: string;
    slotKey: string;
    claimKey: string | null;
    status: string;
    plan: Prisma.JsonValue;
    event: {
      profileId: string | null;
      eventType: string;
    };
    reward: {
      tenantId: string;
      profileId: string | null;
      seasonId: string | null;
    } | null;
  } | null;
};

@Injectable()
export class GuestGameRuleReplayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gamification: GuestGamificationService,
  ) {}

  async previewBattlePass(
    user: AuthenticatedUser,
    dto: GuestGameBattlePassReplayPreviewDto,
  ): Promise<GuestGameBattlePassReplayResult> {
    const prepared = await this.prepare(user, dto);
    if (prepared.existingIntent) this.assertExistingIntent(prepared);
    return this.result(
      prepared,
      'PREVIEW',
      prepared.existingIntent
        ? 'IDEMPOTENT'
        : !prepared.eventId
          ? 'UNSUPPORTED'
          : prepared.rule.eligible
            ? 'READY'
            : 'BLOCKED',
      0,
      prepared.existingIntent?.rewardId
        ? [prepared.existingIntent.rewardId]
        : [],
      prepared.existingIntent
        ? 'Для этого шага уже существует идемпотентный план награды; повторный apply не создаст дубль.'
        : !prepared.eventId
          ? 'Каноническое событие исходного факта не найдено; сначала его должен создать обычный fallback pipeline.'
          : prepared.rule.eligible
            ? 'Dry-run подтверждён. Перед apply повторно сверяются версии факта и сезона.'
            : 'Условие выбранного шага не выполнено; apply заблокирован.',
    );
  }

  async applyBattlePass(
    user: AuthenticatedUser,
    dto: GuestGameBattlePassReplayApplyDto,
  ): Promise<GuestGameBattlePassReplayResult> {
    const prepared = await this.prepare(user, dto);
    this.assertExpectedVersion(
      dto.expectedFactUpdatedAt,
      prepared.fact.updatedAt,
      'факта игрового журнала',
    );
    this.assertExpectedVersion(
      dto.expectedSeasonUpdatedAt,
      prepared.season.updatedAt,
      'сезона Battle Pass',
    );

    if (prepared.existingIntent) {
      this.assertExistingIntent(prepared);
      return this.result(
        prepared,
        'APPLY',
        'IDEMPOTENT',
        0,
        prepared.existingIntent.rewardId
          ? [prepared.existingIntent.rewardId]
          : [],
        'Replay уже был зафиксирован этим rule-scoped intent; повторная награда не создавалась.',
      );
    }

    if (normalizedString(dto.confirmation) !== 'APPLY_RULE_REPLAY') {
      throw new BadRequestException(
        'Для apply передайте confirmation=APPLY_RULE_REPLAY.',
      );
    }

    if (normalizedString(dto.confirmationHash) !== prepared.confirmationHash) {
      throw new ConflictException(
        'Результат dry-run изменился. Выполните preview ещё раз и подтвердите новый confirmationHash.',
      );
    }
    if (!prepared.eventId) {
      throw new ConflictException(
        'Каноническое событие исходного факта не найдено. Replay не создаёт второе физическое событие.',
      );
    }
    if (!prepared.rule.eligible) {
      throw new ConflictException(
        `Условие шага больше не выполнено: ${prepared.rule.blockers.join('; ')}`,
      );
    }
    if (prepared.rule.xpDelta !== 0) {
      throw new ConflictException(
        'BP-only replay не начисляет отдельный XP: для выбранного шага xpDelta должен быть равен нулю.',
      );
    }
    if (!prepared.rule.selectedRewardLabel) {
      throw new ConflictException(
        'Для выбранного шага не определена награда Battle Pass.',
      );
    }

    const processed = await this.gamification.processEvent(
      user,
      { ...prepared.processDto, activeRulesOnly: true },
      {
        allowedRuleIds: [prepared.season.id],
        evaluationMode: 'LIVE_LEDGER_FALLBACK',
        evaluatorVersion: 'ledger-rule-replay-v1',
        originKey: prepared.originKey,
        suppressLedgerShadow: true,
        replayRewardScope: {
          ruleKind: 'SEASON',
          ruleId: prepared.season.id,
          battlePassStep: prepared.step.sequence,
          stepId: prepared.step.id,
          sourceFactId: prepared.fact.id,
          sourceFactUpdatedAt: prepared.fact.updatedAt,
          seasonUpdatedAt: prepared.season.updatedAt,
          confirmationHash: prepared.confirmationHash,
        },
      },
    );
    if (processed.event.id !== prepared.eventId) {
      throw new ConflictException(
        'Apply использовал не то каноническое событие, которое было подтверждено preview.',
      );
    }
    const intent = await this.findIntent(user.tenantId, prepared.claimKey);
    if (!intent) {
      throw new ConflictException(
        'Rule-scoped intent не найден после apply; replay остановлен без предположения об успешной выдаче.',
      );
    }
    const finalized = { ...prepared, existingIntent: intent };
    this.assertExistingIntent(finalized);
    const rewardIds = intent?.rewardId ? [intent.rewardId] : [];

    return this.result(
      finalized,
      'APPLY',
      intent?.status === 'APPLIED' ? 'APPLIED' : 'QUEUED',
      processed.summary.createdRewards,
      [...new Set(rewardIds)],
      intent?.status === 'APPLIED'
        ? 'Rule-scoped intent применён через штатный reward/bonus-ledger pipeline.'
        : 'Rule-scoped intent создан; штатный materializer завершит выдачу идемпотентно.',
    );
  }

  private async prepare(
    user: AuthenticatedUser,
    dto: GuestGameBattlePassReplayPreviewDto,
  ): Promise<PreparedReplay> {
    const factId = requiredId(dto.factId, 'factId');
    const profileId = requiredId(dto.profileId, 'profileId');
    const seasonId = requiredId(dto.seasonId, 'seasonId');
    const stepId = requiredId(dto.stepId, 'stepId');
    const stepSequence = positiveInteger(dto.stepSequence, 'stepSequence');
    const [factRow, seasonRow] = await Promise.all([
      this.prisma.guestActivityFact.findFirst({
        where: { id: factId, tenantId: user.tenantId },
      }),
      this.prisma.guestGameSeason.findFirst({
        where: { id: seasonId, tenantId: user.tenantId },
      }),
    ]);
    if (!factRow)
      throw new NotFoundException('Факт игрового журнала не найден.');
    if (!seasonRow) throw new NotFoundException('Сезон Battle Pass не найден.');
    if (
      factRow.lifecycleStatus !== 'ACTIVE' ||
      factRow.supersededAt ||
      factRow.confidence !== 'EXACT'
    ) {
      throw new ConflictException(
        'Replay разрешён только для ACTIVE, EXACT и не superseded факта.',
      );
    }
    if (!replayFactTypes.has(factRow.factType)) {
      throw new BadRequestException(
        'Первый безопасный replay поддерживает только факты игрового времени.',
      );
    }
    if (!factRow.profileId || !factRow.happenedAt || !factRow.durationMinutes) {
      throw new ConflictException(
        'Факт не содержит profileId, happenedAt или durationMinutes.',
      );
    }
    if (factRow.profileId !== profileId) {
      throw new NotFoundException(
        'Факт не принадлежит указанному игровому профилю.',
      );
    }
    if (seasonRow.status !== 'ACTIVE') {
      throw new ConflictException(
        'Replay разрешён только для ACTIVE Battle Pass.',
      );
    }

    const stableExternalId =
      normalizedString(factRow.sourceExternalId) ??
      normalizedString(factRow.sessionExternalId);
    if (!stableExternalId) {
      throw new ConflictException(
        'У факта нет стабильного source/session external id.',
      );
    }
    const steps = canonicalSteps(seasonRow.levels);
    const step = steps.find((item) => item.id === stepId);
    if (!step) {
      throw new NotFoundException('Стабильный stepId не найден в Battle Pass.');
    }
    if (step.sequence !== stepSequence) {
      throw new ConflictException(
        'stepId и canonical stepSequence больше не соответствуют друг другу.',
      );
    }
    const activationRules = jsonRecord(step.raw.activationRules);
    if (
      numberValue(activationRules.schemaVersion, 1) !== 2 ||
      normalizedString(activationRules.taskType)?.toUpperCase() !==
        'PLAY_TIME' ||
      normalizedString(activationRules.evaluationPolicy)?.toUpperCase() !==
        'LIVE_WITH_LEDGER_FALLBACK'
    ) {
      throw new ConflictException(
        'Replay разрешён только для v2 PLAY_TIME шага с LIVE_WITH_LEDGER_FALLBACK.',
      );
    }

    const processDto: GuestGameProcessEventDto = {
      profileId: factRow.profileId,
      guestId: factRow.guestId,
      storeId: factRow.storeId,
      eventType: 'PLAY_HOUR',
      occurredAt: factRow.happenedAt.toISOString(),
      sessionMinutes: factRow.durationMinutes,
      sessionType:
        factRow.factType === 'HOURLY_PLAY_TIME_ACCUMULATED'
          ? 'HOURLY'
          : 'PACKAGE_OR_SUBSCRIPTION',
      sessionPacket:
        factRow.factType === 'PACKAGE_OR_SUBSCRIPTION_PLAY_TIME_ACCUMULATED',
      sourceFactId: factRow.id,
      sourceFactKind: 'GUEST_SESSION',
      externalProvider: factRow.externalProvider,
      externalDomain: factRow.externalDomain,
      externalId: stableExternalId,
      suppressLootBoxRewards: true,
      payload: {
        replay: true,
        factType: factRow.factType,
        confidence: factRow.confidence,
      },
    };
    const originKey = buildGuestGameOriginKey({
      externalProvider: factRow.externalProvider,
      externalDomain: factRow.externalDomain,
      eventType: 'PLAY_HOUR',
      stableExternalId,
    });
    if (!originKey) {
      throw new ConflictException('Не удалось вычислить originKey факта.');
    }

    const claimKey = `season:${seasonRow.id}:profile:${factRow.profileId}:step:${step.sequence}`;
    const [dryRun, originReceipt, event, existingIntent] = await Promise.all([
      this.gamification.dryRun(user, processDto, {
        rewardScope: {
          seasonId: seasonRow.id,
          profileId: factRow.profileId,
          guestId: factRow.guestId,
        },
      }),
      this.prisma.guestGameOriginReceipt.findUnique({
        where: {
          tenantId_originKey: { tenantId: user.tenantId, originKey },
        },
        select: {
          factId: true,
          eventId: true,
          eventType: true,
          status: true,
        },
      }),
      this.findCanonicalEvent(
        user.tenantId,
        originKey,
        processDto,
        factRow.externalProvider,
      ),
      this.findIntent(user.tenantId, claimKey),
    ]);
    const matchingRules = dryRun.rules.filter(
      (rule) =>
        rule.kind === 'SEASON' &&
        rule.id === seasonRow.id &&
        rule.battlePassStep === step.sequence,
    );
    const rule = existingIntent
      ? replayRuleFromIntent(existingIntent.plan)
      : matchingRules.length === 1
        ? matchingRules[0]
        : null;
    if (!rule) {
      throw new ConflictException(
        'Выбранный шаг не является текущим единственным шагом Battle Pass для гостя.',
      );
    }
    const slotKey = `${step.sequence}:${rule.rewardType ?? 'reward'}`;
    if (
      !originReceipt ||
      originReceipt.factId !== factRow.id ||
      originReceipt.eventType !== 'PLAY_HOUR' ||
      !replayReceiptStatuses.has(originReceipt.status)
    ) {
      throw new ConflictException(
        'Для факта нет согласованного terminal origin receipt, пригодного для rule-scoped replay.',
      );
    }
    if (
      event &&
      (!originReceipt.eventId || event.id !== originReceipt.eventId)
    ) {
      throw new ConflictException(
        'Origin receipt и каноническое событие расходятся; replay остановлен без записи.',
      );
    }
    if (
      event &&
      (event.profileId !== factRow.profileId || event.eventType !== 'PLAY_HOUR')
    ) {
      throw new ConflictException(
        'Каноническое событие связано с другим профилем или типом события.',
      );
    }
    const eventId = event?.id ?? null;
    const preparedForHash = {
      factId: factRow.id,
      factUpdatedAt: factRow.updatedAt.toISOString(),
      factType: factRow.factType,
      happenedAt: factRow.happenedAt.toISOString(),
      durationMinutes: factRow.durationMinutes,
      profileId: factRow.profileId,
      originKey,
      eventId,
      seasonId: seasonRow.id,
      seasonUpdatedAt: seasonRow.updatedAt.toISOString(),
      stepId: step.id,
      stepSequence: step.sequence,
      slotKey,
      eligible: rule.eligible,
      rewardType: rule.rewardType,
      selectedRewardLabel: rule.selectedRewardLabel,
      xpDelta: rule.xpDelta,
      reasons: rule.reasons,
      blockers: rule.blockers,
      progress: rule.progress,
    };

    return {
      tenantId: user.tenantId,
      fact: {
        id: factRow.id,
        profileId: factRow.profileId,
        guestId: factRow.guestId,
        storeId: factRow.storeId,
        factType: factRow.factType,
        happenedAt: factRow.happenedAt,
        durationMinutes: factRow.durationMinutes,
        confidence: factRow.confidence,
        externalProvider: factRow.externalProvider,
        externalDomain: factRow.externalDomain,
        stableExternalId,
        updatedAt: factRow.updatedAt,
      },
      season: {
        id: seasonRow.id,
        name: seasonRow.name,
        updatedAt: seasonRow.updatedAt,
      },
      step: { id: step.id, sequence: step.sequence, title: step.title },
      rule,
      processDto,
      originKey,
      eventId,
      originReceiptStatus: originReceipt?.status ?? null,
      slotKey,
      claimKey,
      confirmationHash: sha256(preparedForHash),
      existingIntent,
    };
  }

  private async findCanonicalEvent(
    tenantId: string,
    originKey: string,
    dto: GuestGameProcessEventDto,
    externalProvider: IntegrationProvider,
  ) {
    const originEvent = await this.prisma.guestGameEvent.findFirst({
      where: { tenantId, originKey },
      select: { id: true, profileId: true, eventType: true },
    });
    if (originEvent) return originEvent;

    const externalId = [
      'guest-game',
      normalizedString(dto.sourceFactKind) ?? 'snapshot',
      'PLAY_HOUR',
      normalizedString(dto.externalId),
    ].join(':');
    return this.prisma.guestGameEvent.findFirst({
      where: {
        tenantId,
        externalProvider,
        externalDomain: normalizedString(dto.externalDomain),
        externalId,
      },
      select: { id: true, profileId: true, eventType: true },
    });
  }

  private assertExistingIntent(prepared: PreparedReplay) {
    const intent = prepared.existingIntent;
    if (!intent) return;
    if (!replayIntentStatuses.has(intent.status)) {
      throw new ConflictException(
        'Существующий rule-scoped intent имеет неподдерживаемый статус и требует отдельного guarded requeue.',
      );
    }
    const plan = jsonRecord(intent.plan);
    const rule = jsonRecord(plan.rule);
    const rewardType = normalizedString(rule.rewardType);
    const expectedSlotKey = `${prepared.step.sequence}:${rewardType ?? 'reward'}`;
    if (
      numberValue(plan.schemaVersion, -1) !== 1 ||
      normalizedString(rule.kind) !== 'SEASON' ||
      normalizedString(rule.id) !== prepared.season.id ||
      numberValue(rule.battlePassStep, -1) !== prepared.step.sequence ||
      rule.eligible !== true ||
      numberValue(rule.xpDelta, -1) !== 0 ||
      !normalizedString(rule.selectedRewardLabel) ||
      normalizedString(plan.slotKey) !== expectedSlotKey ||
      prepared.slotKey !== expectedSlotKey ||
      intent.profileId !== prepared.fact.profileId ||
      intent.ruleType !== 'SEASON' ||
      intent.ruleId !== prepared.season.id ||
      intent.slotKey !== prepared.slotKey ||
      intent.claimKey !== prepared.claimKey ||
      intent.event.profileId !== prepared.fact.profileId ||
      intent.event.eventType !== 'PLAY_HOUR' ||
      (intent.rewardId &&
        (!intent.reward ||
          intent.reward.tenantId !== prepared.tenantId ||
          intent.reward.profileId !== prepared.fact.profileId ||
          intent.reward.seasonId !== prepared.season.id))
    ) {
      throw new ConflictException(
        'Существующий claimKey связан с несовместимым планом награды.',
      );
    }
  }

  private findIntent(tenantId: string, claimKey: string) {
    return this.prisma.guestGameRewardIntent.findUnique({
      where: { tenantId_claimKey: { tenantId, claimKey } },
      select: {
        id: true,
        eventId: true,
        profileId: true,
        rewardId: true,
        originKey: true,
        ruleType: true,
        ruleId: true,
        slotKey: true,
        claimKey: true,
        status: true,
        plan: true,
        event: { select: { profileId: true, eventType: true } },
        reward: {
          select: { tenantId: true, profileId: true, seasonId: true },
        },
      },
    });
  }

  private assertExpectedVersion(value: unknown, actual: Date, label: string) {
    const expected = dateValue(value);
    if (!expected) {
      throw new BadRequestException(
        `Для apply укажите expectedUpdatedAt ${label}.`,
      );
    }
    if (expected.getTime() !== actual.getTime()) {
      throw new ConflictException(
        `Версия ${label} изменилась после preview. Выполните dry-run заново.`,
      );
    }
  }

  private result(
    prepared: PreparedReplay,
    mode: GuestGameBattlePassReplayResult['mode'],
    outcome: GuestGameBattlePassReplayResult['outcome'],
    createdRewards: number,
    rewardIds: string[],
    note: string,
  ): GuestGameBattlePassReplayResult {
    return {
      mode,
      outcome,
      confirmationHash: prepared.confirmationHash,
      expectedFactUpdatedAt: prepared.fact.updatedAt.toISOString(),
      expectedSeasonUpdatedAt: prepared.season.updatedAt.toISOString(),
      fact: {
        id: prepared.fact.id,
        factType: prepared.fact.factType,
        happenedAt: prepared.fact.happenedAt.toISOString(),
        durationMinutes: prepared.fact.durationMinutes,
        confidence: prepared.fact.confidence,
      },
      target: {
        seasonId: prepared.season.id,
        seasonName: prepared.season.name,
        stepId: prepared.step.id,
        stepSequence: prepared.step.sequence,
        stepTitle: prepared.step.title,
        slotKey: prepared.slotKey,
        profileId: prepared.fact.profileId,
      },
      source: {
        originKey: prepared.originKey,
        eventId: prepared.eventId,
        originReceiptStatus: prepared.originReceiptStatus,
      },
      decision: {
        eligible: prepared.rule.eligible,
        status: prepared.rule.eligible ? 'MATCHED' : 'BLOCKED',
        rewardType: prepared.rule.rewardType,
        selectedRewardLabel: prepared.rule.selectedRewardLabel,
        xpDelta: prepared.rule.xpDelta,
        reasons: prepared.rule.reasons,
        blockers: prepared.rule.blockers,
        progress: prepared.rule.progress,
      },
      intent: prepared.existingIntent
        ? {
            id: prepared.existingIntent.id,
            status: prepared.existingIntent.status,
            eventId: prepared.existingIntent.eventId,
            rewardId: prepared.existingIntent.rewardId,
          }
        : null,
      createdRewards,
      rewardIds,
      note,
    };
  }
}

function canonicalSteps(value: Prisma.JsonValue) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, originalIndex) => {
      const raw = jsonRecord(item);
      const level = numberValue(raw.level, originalIndex + 1);
      const id = normalizedString(raw.id);
      if (level <= 0 || !id) return null;
      return {
        id,
        level,
        originalIndex,
        title: normalizedString(raw.title),
        raw,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((left, right) => left.level - right.level)
    .map((item, index) => ({ ...item, sequence: index + 1 }));
}

function replayRuleFromIntent(
  value: Prisma.JsonValue,
): GuestGameDryRunRule | null {
  const plan = jsonRecord(value);
  const rule = jsonRecord(plan.rule);
  if (
    numberValue(plan.schemaVersion, -1) !== 1 ||
    normalizedString(rule.kind) !== 'SEASON'
  ) {
    return null;
  }

  return {
    id: normalizedString(rule.id) ?? '',
    kind: 'SEASON',
    name: normalizedString(rule.name) ?? '',
    status: normalizedString(rule.status) ?? 'ACTIVE',
    triggerKind: normalizedString(rule.triggerKind),
    evaluationPolicy:
      normalizedString(rule.evaluationPolicy) ?? 'LIVE_WITH_LEDGER_FALLBACK',
    manualApprovalRequired: rule.manualApprovalRequired === true,
    eligible: rule.eligible === true,
    rewardType: normalizedString(rule.rewardType),
    rewardAmount: nullableNumber(rule.rewardAmount),
    rewardLabel: normalizedString(rule.rewardLabel),
    selectedRewardLabel: normalizedString(rule.selectedRewardLabel),
    selectedReward: null,
    xpDelta: numberValue(rule.xpDelta, 0),
    budgetAmount: nullableNumber(rule.budgetAmount),
    progress: null,
    battlePassLevel: nullableNumber(rule.battlePassLevel),
    battlePassStep: nullableNumber(rule.battlePassStep),
    battlePassStepTitle: normalizedString(rule.battlePassStepTitle),
    periodicLimitPeriod: null,
    reasons: stringArray(rule.reasons),
    blockers: stringArray(rule.blockers),
  };
}

function requiredId(value: unknown, field: string) {
  const id = normalizedString(value);
  if (!id) throw new BadRequestException(`Укажите ${field}.`);
  return id;
}

function positiveInteger(value: unknown, field: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new BadRequestException(`Укажите положительный ${field}.`);
  }
  return parsed;
}

function normalizedString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value
        .map((item) => normalizedString(item))
        .filter((item): item is string => Boolean(item))
    : [];
}

function dateValue(value: unknown) {
  const raw = normalizedString(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function sha256(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

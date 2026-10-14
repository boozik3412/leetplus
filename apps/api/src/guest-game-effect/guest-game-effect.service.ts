import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  GUEST_TRANSACTION_ANOMALY_RUB,
  GUEST_TRANSACTION_SPEND_SQL,
} from '../common/guest-transaction-money';
import {
  networkTimeZone,
  safeTimeZone,
} from '../guest-leaderboard/guest-leaderboard-core';
import { PrismaService } from '../prisma/prisma.service';
import {
  GAME_EFFECT_HOLDOUT_MAX_PERCENT,
  GAME_EFFECT_METRICS,
  GAME_EFFECT_MIN_WINDOW_DAYS,
  GAME_EFFECT_WINDOW_DAYS,
  buildGameEffectDataset,
  dayNumberToIso,
  gameEffectVerdict,
  isInGameHoldout,
  localDayNumber,
  measureCohortEffect,
  measureGuestEffect,
  measureHoldoutEffect,
  type GameEffectCohortResult,
  type GameEffectDataset,
  type GameEffectGuestResult,
  type GameEffectHoldoutResult,
  type GameEffectMetric,
  type GameEffectMetricResult,
  type GameEffectParticipant,
  type GameEffectValues,
  type GameEffectVerdict,
} from './guest-game-effect-core';

const DATASET_TTL_MS = 10 * 60 * 1000;
const MAX_CACHED_TENANTS = 8;
const MAX_LOOKBACK_DAYS = 400;
const MAX_SESSION_MINUTES = 24 * 60;
const CANCELED_REWARD_STATUSES = ['CANCELED', 'CANCELLED', 'VOID', 'REJECTED'];
const MONEY_REWARD_TYPES = new Set([
  'BONUS',
  'BONUS_POINTS',
  'BONUS_BALANCE',
  'LOYALTY_BONUS',
  'BALANCE',
  'MONEY_BALANCE',
  'CASH_BALANCE',
]);
const NON_PRIZE_REWARD_TYPES = new Set([
  'LOOT_BOX_ENTITLEMENT',
  'XP',
  'BATTLE_PASS_COMPLETION_MARKER',
]);

export type GuestGameEffectScenarioKind = 'MISSION' | 'LOOT_BOX' | 'SEASON';

export type GuestGameEffectMetricView = {
  before: number;
  after: number;
  comparisonBefore: number;
  comparisonAfter: number;
  effect: number;
  ciLow: number | null;
  ciHigh: number | null;
  total: number;
  significant: boolean;
};

export type GuestGameEffectCost = {
  bonusRub: number;
  prizes: number;
  bonusPerGuest: number | null;
};

export type GuestGameEffectCohortView = {
  windowDays: number;
  participants: number;
  measured: number;
  immature: number;
  unmatched: number;
  noHistory: number;
  comparisonGuests: number;
  metrics: Record<GameEffectMetric, GuestGameEffectMetricView>;
  cost: GuestGameEffectCost;
  /** Extra guest money per bonus rouble handed out, null without bonuses. */
  moneyPerBonusRub: number | null;
  verdict: GameEffectVerdict;
};

export type GuestGameEffectHoldoutView = {
  percent: number;
  startedAt: string | null;
  result: {
    windowDays: number;
    treatment: number;
    holdout: number;
    measuredTreatment: number;
    measuredHoldout: number;
    metrics: Record<GameEffectMetric, GuestGameEffectMetricView>;
    verdict: GameEffectVerdict;
  } | null;
  pendingReason: 'NOT_STARTED' | 'TOO_EARLY' | null;
};

export type GuestGameEffectScenarioView = {
  kind: GuestGameEffectScenarioKind;
  id: string;
  name: string;
  status: string;
  usageKind: string | null;
  storeIds: string[];
  holdout: GuestGameEffectHoldoutView | null;
  cohort: GuestGameEffectCohortView;
};

export type GuestGameEffectReport = {
  generatedAt: string;
  dataAsOf: string;
  timeZone: string;
  windowDays: number;
  lastCompleteDay: string;
  storeId: string | null;
  stores: Array<{ id: string; name: string }>;
  dataQuality: {
    transactionsDated: number;
    transactionsUndated: number;
    transactionsAnomalous: number;
    playersWithoutGuest: number;
    playersWithoutHomeStore: number;
  };
  game: GuestGameEffectCohortView & {
    byStore: Array<{
      storeId: string;
      storeName: string;
      cohort: GuestGameEffectCohortView;
    }>;
  };
  scenarios: GuestGameEffectScenarioView[];
};

export type GuestGameGuestEffect = {
  windowDays: number;
  lastCompleteDay: string;
  activation:
    | (Omit<
        Extract<GameEffectGuestResult, { status: 'MEASURED' }>,
        'exposureDay'
      > & { exposureDate: string })
    | {
        status: 'TOO_EARLY' | 'NO_COMPARISON';
        windowDays: number;
        daysElapsed: number;
        exposureDate: string;
      }
    | null;
  cost: { bonusRub: number; prizes: number };
  scenarios: Array<{
    kind: GuestGameEffectScenarioKind;
    id: string;
    name: string;
    firstDate: string;
    bonusRub: number;
    prizes: number;
    inHoldout: boolean | null;
  }>;
};

type Player = {
  profileId: string;
  activationDay: number | null;
  isStaffTest: boolean;
};

type Scenario = {
  kind: GuestGameEffectScenarioKind;
  id: string;
  name: string;
  status: string;
  usageKind: string | null;
  storeIds: string[];
  holdoutPercent: number;
  holdoutStartDay: number | null;
  holdoutStartedAt: Date | null;
};

type RewardCost = {
  day: number;
  scenarioKey: string | null;
  bonusRub: number;
  prize: boolean;
};

type EffectData = {
  loadedAt: Date;
  timeZone: string;
  lastCompleteDay: number;
  stores: Array<{ id: string; name: string }>;
  dataset: GameEffectDataset;
  players: Map<string, Player>;
  staffGuestIds: Set<string>;
  scenarios: Scenario[];
  participation: Map<string, Map<string, number>>;
  costs: Map<string, RewardCost[]>;
  dataQuality: GuestGameEffectReport['dataQuality'];
};

function scenarioKey(kind: GuestGameEffectScenarioKind, id: string) {
  return `${kind}:${id}`;
}

function jsonStringArray(value: Prisma.JsonValue | null | undefined) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function roundValues(values: GameEffectValues): GameEffectValues {
  const result = { ...values };
  GAME_EFFECT_METRICS.forEach((metric) => {
    result[metric] = round(values[metric]);
  });
  return result;
}

function metricView(result: GameEffectMetricResult): GuestGameEffectMetricView {
  return {
    before: round(result.participantsBefore),
    after: round(result.participantsAfter),
    comparisonBefore: round(result.comparisonBefore),
    comparisonAfter: round(result.comparisonAfter),
    effect: round(result.effectPerGuest),
    ciLow: result.ciLow === null ? null : round(result.ciLow),
    ciHigh: result.ciHigh === null ? null : round(result.ciHigh),
    total: round(result.total),
    significant: result.significant,
  };
}

function metricViews(
  metrics: Record<GameEffectMetric, GameEffectMetricResult>,
): Record<GameEffectMetric, GuestGameEffectMetricView> {
  return Object.fromEntries(
    GAME_EFFECT_METRICS.map((metric) => [metric, metricView(metrics[metric])]),
  ) as Record<GameEffectMetric, GuestGameEffectMetricView>;
}

/**
 * Effect of the game on guests (difference in differences against guests who
 * were in the club on the same day) and of every scenario, plus randomised
 * holdout results. Read-only; one dataset per tenant is cached for 10 minutes.
 */
@Injectable()
export class GuestGameEffectService {
  private readonly logger = new Logger(GuestGameEffectService.name);
  private readonly cache = new Map<
    string,
    { at: number; promise: Promise<EffectData> }
  >();

  constructor(private readonly prisma: PrismaService) {}

  async getReport(
    tenantId: string,
    query: { storeId?: string | null } = {},
  ): Promise<GuestGameEffectReport> {
    const data = await this.data(tenantId);
    const storeId =
      query.storeId && data.stores.some((store) => store.id === query.storeId)
        ? query.storeId
        : null;
    const game = this.gameCohort(data, storeId);
    const byStore = storeId
      ? []
      : data.stores.map((store) => ({
          storeId: store.id,
          storeName: store.name,
          cohort: this.gameCohort(data, store.id),
        }));

    return {
      generatedAt: new Date().toISOString(),
      dataAsOf: data.loadedAt.toISOString(),
      timeZone: data.timeZone,
      windowDays: GAME_EFFECT_WINDOW_DAYS,
      lastCompleteDay: dayNumberToIso(data.lastCompleteDay),
      storeId,
      stores: data.stores,
      dataQuality: data.dataQuality,
      game: { ...game, byStore },
      scenarios: data.scenarios
        .map((scenario) => this.scenarioView(data, scenario, storeId))
        .sort(
          (left, right) =>
            right.cohort.participants - left.cohort.participants ||
            left.name.localeCompare(right.name, 'ru'),
        ),
    };
  }

  async getGuestEffect(
    tenantId: string,
    guestId: string,
  ): Promise<GuestGameGuestEffect> {
    const data = await this.data(tenantId);
    const player = data.players.get(guestId);
    const costs = data.costs.get(guestId) ?? [];
    const activationDay = player?.activationDay ?? null;
    let activation: GuestGameGuestEffect['activation'] = null;

    if (player && activationDay !== null && !player.isStaffTest) {
      const result = measureGuestEffect({
        dataset: data.dataset,
        participant: { guestId, exposureDay: activationDay },
        isComparisonEligible: this.gameComparisonEligibility(data, null),
        lastCompleteDay: data.lastCompleteDay,
      });
      activation =
        result.status === 'MEASURED'
          ? {
              status: 'MEASURED',
              windowDays: result.windowDays,
              complete: result.complete,
              comparisonGuests: result.comparisonGuests,
              before: roundValues(result.before),
              after: roundValues(result.after),
              expectedBefore: roundValues(result.expectedBefore),
              expectedAfter: roundValues(result.expectedAfter),
              effect: roundValues(result.effect),
              exposureDate: dayNumberToIso(activationDay),
            }
          : {
              status: result.status,
              windowDays: result.windowDays,
              daysElapsed: result.daysElapsed,
              exposureDate: dayNumberToIso(activationDay),
            };
    }

    const scenarios: GuestGameGuestEffect['scenarios'] = [];
    data.scenarios.forEach((scenario) => {
      const key = scenarioKey(scenario.kind, scenario.id);
      const firstDay = data.participation.get(key)?.get(guestId);
      const assigned =
        player && scenario.holdoutPercent > 0
          ? isInGameHoldout({
              scenarioId: scenario.id,
              profileId: player.profileId,
              percent: scenario.holdoutPercent,
            })
          : null;
      if (firstDay === undefined && !assigned) return;
      const own = costs.filter((cost) => cost.scenarioKey === key);
      scenarios.push({
        kind: scenario.kind,
        id: scenario.id,
        name: scenario.name,
        firstDate: firstDay === undefined ? '' : dayNumberToIso(firstDay),
        bonusRub: round(own.reduce((sum, cost) => sum + cost.bonusRub, 0)),
        prizes: own.filter((cost) => cost.prize).length,
        inHoldout: assigned,
      });
    });
    scenarios.sort((left, right) =>
      (left.firstDate || '9').localeCompare(right.firstDate || '9'),
    );

    return {
      windowDays: GAME_EFFECT_WINDOW_DAYS,
      lastCompleteDay: dayNumberToIso(data.lastCompleteDay),
      activation,
      cost: {
        bonusRub: round(costs.reduce((sum, cost) => sum + cost.bonusRub, 0)),
        prizes: costs.filter((cost) => cost.prize).length,
      },
      scenarios,
    };
  }

  /**
   * Sets the control-group share of a mission or a standalone case. Any change
   * restarts the split date, because results of different splits cannot be
   * pooled; 0 turns the holdout off.
   */
  async setHoldout(
    tenantId: string,
    input: { kind?: unknown; id?: unknown; percent?: unknown },
  ): Promise<{
    kind: 'MISSION' | 'LOOT_BOX';
    id: string;
    holdoutPercent: number;
    holdoutStartedAt: string | null;
  }> {
    const kind =
      input.kind === 'MISSION' || input.kind === 'LOOT_BOX' ? input.kind : null;
    const id = typeof input.id === 'string' ? input.id.trim() : '';
    const percent =
      typeof input.percent === 'number' ? input.percent : Number(input.percent);
    if (!kind || !id) {
      throw new BadRequestException('Укажите задание или кейс.');
    }
    if (
      !Number.isInteger(percent) ||
      percent < 0 ||
      percent > GAME_EFFECT_HOLDOUT_MAX_PERCENT
    ) {
      throw new BadRequestException(
        `Контрольная группа — целое число от 0 до ${GAME_EFFECT_HOLDOUT_MAX_PERCENT} %.`,
      );
    }

    const current =
      kind === 'MISSION'
        ? await this.prisma.guestGameMission.findFirst({
            where: { id, tenantId },
            select: { holdoutPercent: true, holdoutStartedAt: true },
          })
        : await this.prisma.guestGameLootBox.findFirst({
            where: { id, tenantId },
            select: {
              holdoutPercent: true,
              holdoutStartedAt: true,
              usageKind: true,
            },
          });
    if (!current) {
      throw new NotFoundException(
        kind === 'MISSION' ? 'Задание не найдено' : 'Кейс не найден',
      );
    }
    if (
      'usageKind' in current &&
      current.usageKind !== 'STANDALONE' &&
      percent > 0
    ) {
      throw new BadRequestException(
        'Контрольная группа доступна только для самостоятельных кейсов: кейс-награду выдаёт задание.',
      );
    }
    if (current.holdoutPercent === percent) {
      return {
        kind,
        id,
        holdoutPercent: percent,
        holdoutStartedAt: current.holdoutStartedAt?.toISOString() ?? null,
      };
    }

    const data = {
      holdoutPercent: percent,
      holdoutStartedAt: percent > 0 ? new Date() : null,
    };
    const updated =
      kind === 'MISSION'
        ? await this.prisma.guestGameMission.updateMany({
            where: { id, tenantId },
            data,
          })
        : await this.prisma.guestGameLootBox.updateMany({
            where: { id, tenantId },
            data,
          });
    if (!updated.count) {
      throw new NotFoundException(
        kind === 'MISSION' ? 'Задание не найдено' : 'Кейс не найден',
      );
    }
    this.cache.delete(tenantId);
    return {
      kind,
      id,
      holdoutPercent: percent,
      holdoutStartedAt: data.holdoutStartedAt?.toISOString() ?? null,
    };
  }

  /** Activated players against guests who were not in the game yet. */
  private gameCohort(
    data: EffectData,
    storeId: string | null,
  ): GuestGameEffectCohortView {
    const participants: GameEffectParticipant[] = [];
    data.players.forEach((player, guestId) => {
      if (player.isStaffTest || player.activationDay === null) return;
      if (storeId && this.homeStore(data, guestId) !== storeId) return;
      participants.push({ guestId, exposureDay: player.activationDay });
    });
    const result = measureCohortEffect({
      dataset: data.dataset,
      participants,
      isComparisonEligible: this.gameComparisonEligibility(data, storeId),
      lastCompleteDay: data.lastCompleteDay,
    });
    return this.cohortView(data, result, participants, null);
  }

  private gameComparisonEligibility(data: EffectData, storeId: string | null) {
    return (guestId: string, anchorDay: number) => {
      if (data.staffGuestIds.has(guestId)) return false;
      if (storeId && this.homeStore(data, guestId) !== storeId) return false;
      const player = data.players.get(guestId);
      const activationDay = player?.activationDay ?? null;
      return (
        activationDay === null ||
        activationDay > anchorDay + GAME_EFFECT_WINDOW_DAYS
      );
    };
  }

  private scenarioView(
    data: EffectData,
    scenario: Scenario,
    storeId: string | null,
  ): GuestGameEffectScenarioView {
    const key = scenarioKey(scenario.kind, scenario.id);
    const participation =
      data.participation.get(key) ?? new Map<string, number>();
    const scopeStores = new Set(scenario.storeIds);
    const inScope = (guestId: string) => {
      const home = this.homeStore(data, guestId);
      if (storeId && home !== storeId) return false;
      return !scopeStores.size || (home !== null && scopeStores.has(home));
    };
    const participants: GameEffectParticipant[] = [];
    participation.forEach((day, guestId) => {
      if (data.staffGuestIds.has(guestId)) return;
      if (storeId && this.homeStore(data, guestId) !== storeId) return;
      participants.push({ guestId, exposureDay: day });
    });
    const result = measureCohortEffect({
      dataset: data.dataset,
      participants,
      isComparisonEligible: (guestId, anchorDay) => {
        if (data.staffGuestIds.has(guestId)) return false;
        const player = data.players.get(guestId);
        if (
          !player ||
          player.activationDay === null ||
          player.activationDay >= anchorDay
        ) {
          return false;
        }
        const own = participation.get(guestId);
        if (own !== undefined && own <= anchorDay + GAME_EFFECT_WINDOW_DAYS) {
          return false;
        }
        return inScope(guestId);
      },
      lastCompleteDay: data.lastCompleteDay,
    });

    return {
      kind: scenario.kind,
      id: scenario.id,
      name: scenario.name,
      status: scenario.status,
      usageKind: scenario.usageKind,
      storeIds: scenario.storeIds,
      holdout:
        scenario.kind === 'SEASON'
          ? null
          : this.holdoutView(data, scenario, inScope),
      cohort: this.cohortView(data, result, participants, key),
    };
  }

  private holdoutView(
    data: EffectData,
    scenario: Scenario,
    inScope: (guestId: string) => boolean,
  ): GuestGameEffectHoldoutView | null {
    if (!scenario.holdoutPercent) return null;
    const base = {
      percent: scenario.holdoutPercent,
      startedAt: scenario.holdoutStartedAt?.toISOString() ?? null,
    };
    if (scenario.holdoutStartDay === null) {
      return { ...base, result: null, pendingReason: 'NOT_STARTED' };
    }
    if (
      data.lastCompleteDay - scenario.holdoutStartDay + 1 <
      GAME_EFFECT_MIN_WINDOW_DAYS
    ) {
      return { ...base, result: null, pendingReason: 'TOO_EARLY' };
    }
    const members: Array<{
      guestId: string;
      startDay: number;
      holdout: boolean;
    }> = [];
    data.players.forEach((player, guestId) => {
      if (player.isStaffTest || player.activationDay === null) return;
      if (player.activationDay > data.lastCompleteDay) return;
      if (!inScope(guestId)) return;
      members.push({
        guestId,
        startDay: Math.max(scenario.holdoutStartDay!, player.activationDay),
        holdout: isInGameHoldout({
          scenarioId: scenario.id,
          profileId: player.profileId,
          percent: scenario.holdoutPercent,
        }),
      });
    });
    const result: GameEffectHoldoutResult = measureHoldoutEffect({
      dataset: data.dataset,
      members,
      lastCompleteDay: data.lastCompleteDay,
    });
    return {
      ...base,
      pendingReason: null,
      result: {
        windowDays: result.windowDays,
        treatment: result.treatment,
        holdout: result.holdout,
        measuredTreatment: result.measuredTreatment,
        measuredHoldout: result.measuredHoldout,
        metrics: metricViews(result.metrics),
        verdict: gameEffectVerdict(
          Math.min(result.measuredTreatment, result.measuredHoldout),
          result.metrics,
        ),
      },
    };
  }

  private cohortView(
    data: EffectData,
    result: GameEffectCohortResult,
    participants: readonly GameEffectParticipant[],
    onlyScenarioKey: string | null,
  ): GuestGameEffectCohortView {
    const exposure = new Map(
      participants.map((participant) => [
        participant.guestId,
        participant.exposureDay,
      ]),
    );
    let bonusRub = 0;
    let prizes = 0;
    result.measuredGuestIds.forEach((guestId) => {
      const day = exposure.get(guestId)!;
      (data.costs.get(guestId) ?? []).forEach((cost) => {
        if (onlyScenarioKey && cost.scenarioKey !== onlyScenarioKey) return;
        if (cost.day < day || cost.day > day + result.windowDays) return;
        bonusRub += cost.bonusRub;
        if (cost.prize) prizes += 1;
      });
    });
    const money = result.metrics.money;

    return {
      windowDays: result.windowDays,
      participants: result.participants,
      measured: result.measured,
      immature: result.immature,
      unmatched: result.unmatched,
      noHistory: result.noHistory,
      comparisonGuests: result.comparisonGuests,
      metrics: metricViews(result.metrics),
      cost: {
        bonusRub: round(bonusRub),
        prizes,
        bonusPerGuest: result.measured
          ? round(bonusRub / result.measured)
          : null,
      },
      moneyPerBonusRub:
        bonusRub > 0 && result.measured ? round(money.total / bonusRub) : null,
      verdict: gameEffectVerdict(result.measured, result.metrics),
    };
  }

  private homeStore(data: EffectData, guestId: string) {
    return data.dataset.timelines.get(guestId)?.homeStoreId ?? null;
  }

  private data(tenantId: string): Promise<EffectData> {
    const now = Date.now();
    const cached = this.cache.get(tenantId);
    if (cached && now - cached.at < DATASET_TTL_MS) return cached.promise;

    const promise = this.load(tenantId).catch((error: unknown) => {
      this.cache.delete(tenantId);
      throw error;
    });
    this.cache.set(tenantId, { at: now, promise });
    if (this.cache.size > MAX_CACHED_TENANTS) {
      const oldest = [...this.cache.entries()].sort(
        (left, right) => left[1].at - right[1].at,
      )[0];
      if (oldest) this.cache.delete(oldest[0]);
    }
    return promise;
  }

  private async load(tenantId: string): Promise<EffectData> {
    const startedAt = Date.now();
    const loadedAt = new Date();
    const [stores, profiles, missions, lootBoxes, seasons, rewards] =
      await Promise.all([
        this.prisma.store.findMany({
          where: { tenantId, isActive: true },
          select: { id: true, name: true, timeZone: true },
          orderBy: { name: 'asc' },
        }),
        this.prisma.guestGameProfile.findMany({
          where: { tenantId },
          select: {
            id: true,
            guestId: true,
            gameActivatedAt: true,
            isStaffTest: true,
          },
        }),
        this.prisma.guestGameMission.findMany({
          where: { tenantId },
          select: {
            id: true,
            name: true,
            status: true,
            storeIds: true,
            holdoutPercent: true,
            holdoutStartedAt: true,
          },
        }),
        this.prisma.guestGameLootBox.findMany({
          where: { tenantId },
          select: {
            id: true,
            name: true,
            status: true,
            usageKind: true,
            storeIds: true,
            holdoutPercent: true,
            holdoutStartedAt: true,
          },
        }),
        this.prisma.guestGameSeason.findMany({
          where: { tenantId },
          select: { id: true, name: true, status: true, storeIds: true },
        }),
        this.prisma.guestGameReward.findMany({
          where: { tenantId, status: { notIn: CANCELED_REWARD_STATUSES } },
          select: {
            guestId: true,
            profileId: true,
            missionId: true,
            lootBoxId: true,
            seasonId: true,
            status: true,
            rewardType: true,
            rewardAmount: true,
            qualifiedAt: true,
            paidAt: true,
          },
        }),
      ]);

    const timeZone = networkTimeZone(stores);
    const zone = safeTimeZone(timeZone);
    const todayDay = localDayNumber(loadedAt, zone);
    const lastCompleteDay = todayDay - 1;
    const guestByProfile = new Map<string, string>();
    const players = new Map<string, Player>();
    const staffGuestIds = new Set<string>();
    let playersWithoutGuest = 0;
    let earliestExposure = todayDay;

    profiles.forEach((profile) => {
      if (!profile.guestId) {
        if (profile.gameActivatedAt && !profile.isStaffTest) {
          playersWithoutGuest += 1;
        }
        return;
      }
      guestByProfile.set(profile.id, profile.guestId);
      if (profile.isStaffTest) staffGuestIds.add(profile.guestId);
      const activationDay = profile.gameActivatedAt
        ? localDayNumber(profile.gameActivatedAt, zone)
        : null;
      if (activationDay !== null) {
        earliestExposure = Math.min(earliestExposure, activationDay);
      }
      players.set(profile.guestId, {
        profileId: profile.id,
        activationDay,
        isStaffTest: profile.isStaffTest,
      });
    });

    const scenarios: Scenario[] = [
      ...missions.map((row) => ({
        kind: 'MISSION' as const,
        id: row.id,
        name: row.name,
        status: row.status,
        usageKind: null,
        storeIds: jsonStringArray(row.storeIds),
        holdoutPercent: row.holdoutPercent,
        holdoutStartedAt: row.holdoutStartedAt,
        holdoutStartDay: row.holdoutStartedAt
          ? localDayNumber(row.holdoutStartedAt, zone)
          : null,
      })),
      ...lootBoxes.map((row) => ({
        kind: 'LOOT_BOX' as const,
        id: row.id,
        name: row.name,
        status: row.status,
        usageKind: row.usageKind,
        storeIds: jsonStringArray(row.storeIds),
        holdoutPercent: row.usageKind === 'STANDALONE' ? row.holdoutPercent : 0,
        holdoutStartedAt:
          row.usageKind === 'STANDALONE' ? row.holdoutStartedAt : null,
        holdoutStartDay:
          row.usageKind === 'STANDALONE' && row.holdoutStartedAt
            ? localDayNumber(row.holdoutStartedAt, zone)
            : null,
      })),
      ...seasons.map((row) => ({
        kind: 'SEASON' as const,
        id: row.id,
        name: row.name,
        status: row.status,
        usageKind: null,
        storeIds: jsonStringArray(row.storeIds),
        holdoutPercent: 0,
        holdoutStartedAt: null,
        holdoutStartDay: null,
      })),
    ];

    const participation = new Map<string, Map<string, number>>();
    const costs = new Map<string, RewardCost[]>();
    rewards.forEach((reward) => {
      const guestId =
        reward.guestId ??
        (reward.profileId ? guestByProfile.get(reward.profileId) : undefined);
      if (!guestId) return;
      const key = reward.missionId
        ? scenarioKey('MISSION', reward.missionId)
        : reward.lootBoxId
          ? scenarioKey('LOOT_BOX', reward.lootBoxId)
          : reward.seasonId
            ? scenarioKey('SEASON', reward.seasonId)
            : null;
      if (key) {
        const day = localDayNumber(reward.qualifiedAt, zone);
        earliestExposure = Math.min(earliestExposure, day);
        let byGuest = participation.get(key);
        if (!byGuest) {
          byGuest = new Map();
          participation.set(key, byGuest);
        }
        const first = byGuest.get(guestId);
        if (first === undefined || day < first) byGuest.set(guestId, day);
      }
      if (reward.status !== 'PAID') return;
      const paidDay = localDayNumber(reward.paidAt ?? reward.qualifiedAt, zone);
      const amount = Number(reward.rewardAmount);
      const cost: RewardCost = {
        day: paidDay,
        scenarioKey: key,
        bonusRub:
          MONEY_REWARD_TYPES.has(reward.rewardType) && Number.isFinite(amount)
            ? amount
            : 0,
        prize:
          !MONEY_REWARD_TYPES.has(reward.rewardType) &&
          !NON_PRIZE_REWARD_TYPES.has(reward.rewardType),
      };
      if (!cost.bonusRub && !cost.prize) return;
      const list = costs.get(guestId);
      if (list) list.push(cost);
      else costs.set(guestId, [cost]);
    });

    const fromDay = Math.max(
      earliestExposure - GAME_EFFECT_WINDOW_DAYS - 4,
      todayDay - MAX_LOOKBACK_DAYS,
    );
    // One day of slack on the UTC side; local days are cut again below.
    const from = new Date((fromDay - 1) * 86_400_000);
    const [rows, quality] = await Promise.all([
      this.loadDailyRows(tenantId, zone, from),
      this.loadTransactionQuality(tenantId),
    ]);
    const dataset = buildGameEffectDataset(
      rows.filter((row) => row.day >= fromDay && row.day <= lastCompleteDay),
    );
    let playersWithoutHomeStore = 0;
    players.forEach((player, guestId) => {
      if (player.isStaffTest || player.activationDay === null) return;
      if (!dataset.timelines.get(guestId)?.homeStoreId) {
        playersWithoutHomeStore += 1;
      }
    });

    this.logger.log(
      `game effect dataset tenant=${tenantId} rows=${rows.length} guests=${dataset.timelines.size} ms=${Date.now() - startedAt}`,
    );

    return {
      loadedAt,
      timeZone: zone,
      lastCompleteDay,
      stores: stores.map((store) => ({ id: store.id, name: store.name })),
      dataset,
      players,
      staffGuestIds,
      scenarios,
      participation,
      costs,
      dataQuality: {
        ...quality,
        playersWithoutGuest,
        playersWithoutHomeStore,
      },
    };
  }

  private async loadDailyRows(tenantId: string, zone: string, from: Date) {
    const fromUtc = Prisma.sql`(${from.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;
    const localDay = (column: Prisma.Sql) =>
      Prisma.sql`(((${column}) AT TIME ZONE 'UTC') AT TIME ZONE ${zone})::date`;
    const rows = await this.prisma.$queryRaw<
      Array<{
        guestId: string;
        day: string;
        storeId: string | null;
        sessions: number;
        playMinutes: number;
        balanceSpend: number;
        barRevenue: number;
      }>
    >(Prisma.sql`
      SELECT u."guestId" AS "guestId",
             u.day::text AS day,
             u."storeId" AS "storeId",
             SUM(u.sessions)::int AS sessions,
             SUM(u.minutes)::float8 AS "playMinutes",
             SUM(u.spend)::float8 AS "balanceSpend",
             SUM(u.bar)::float8 AS "barRevenue"
      FROM (
        SELECT s."guestId", ${localDay(Prisma.sql`s."startedAt"`)} AS day,
               s."storeId",
               COUNT(*) AS sessions,
               SUM(LEAST(GREATEST(COALESCE(
                 s."durationMinutes"::float8,
                 EXTRACT(EPOCH FROM (s."stoppedAt" - s."startedAt")) / 60,
                 0
               ), 0), ${MAX_SESSION_MINUTES})) AS minutes,
               0::float8 AS spend,
               0::float8 AS bar
        FROM "GuestSession" s
        WHERE s."tenantId" = ${tenantId}
          AND s."guestId" IS NOT NULL
          AND s."startedAt" >= ${fromUtc}
        GROUP BY 1, 2, 3
        UNION ALL
        SELECT t."guestId", ${localDay(Prisma.sql`t."happenedAt"`)},
               t."storeId", 0, 0,
               SUM(${Prisma.raw(GUEST_TRANSACTION_SPEND_SQL)})::float8, 0
        FROM "GuestTransaction" t
        WHERE t."tenantId" = ${tenantId}
          AND t."guestId" IS NOT NULL
          AND t."happenedAt" >= ${fromUtc}
          AND ${Prisma.raw(GUEST_TRANSACTION_SPEND_SQL)} > 0
        GROUP BY 1, 2, 3
        UNION ALL
        SELECT f."guestId", ${localDay(Prisma.sql`f."saleDate"`)},
               f."storeId", 0, 0, 0, SUM(f.revenue)::float8
        FROM "SalesFact" f
        WHERE f."tenantId" = ${tenantId}
          AND f."guestId" IS NOT NULL
          AND f."isCanceled" = false
          AND f."saleDate" >= ${fromUtc}
        GROUP BY 1, 2, 3
      ) u
      GROUP BY 1, 2, 3
    `);

    return rows.map((row) => ({
      guestId: row.guestId,
      day: Math.floor(Date.parse(`${row.day}T00:00:00Z`) / 86_400_000),
      storeId: row.storeId,
      sessions: Number(row.sessions) || 0,
      playMinutes: Number(row.playMinutes) || 0,
      balanceSpend: Number(row.balanceSpend) || 0,
      barRevenue: Number(row.barRevenue) || 0,
    }));
  }

  private async loadTransactionQuality(tenantId: string) {
    const [row] = await this.prisma.$queryRaw<
      Array<{ dated: number; undated: number; anomalous: number }>
    >(Prisma.sql`
      SELECT COUNT(*) FILTER (WHERE t."happenedAt" IS NOT NULL)::int AS dated,
             COUNT(*) FILTER (WHERE t."happenedAt" IS NULL)::int AS undated,
             COUNT(*) FILTER (
               WHERE ABS(t.amount) > ${GUEST_TRANSACTION_ANOMALY_RUB}
             )::int AS anomalous
      FROM "GuestTransaction" t
      WHERE t."tenantId" = ${tenantId}
    `);
    return {
      transactionsDated: Number(row?.dated) || 0,
      transactionsUndated: Number(row?.undated) || 0,
      transactionsAnomalous: Number(row?.anomalous) || 0,
    };
  }
}

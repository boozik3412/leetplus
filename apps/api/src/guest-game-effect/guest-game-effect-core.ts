/**
 * Pure calculations for the effect of the game on guests.
 *
 * Method (see docs/agent-context/guest-game-effect.md):
 * - Every participant has an exposure day `d` (game activation, first reward
 *   of a scenario). "Before" is the `L` days before `d`, "after" is the `L`
 *   days after `d`; the exposure day itself belongs to neither window.
 * - The comparison group are guests who were in the club on the same day `d`,
 *   were not exposed up to the end of the window and had the same number of
 *   visit days before (bucketed). Their average change is the change the
 *   participant would have had without the game.
 * - Effect per guest = own change − expected change (difference in
 *   differences). The confidence interval is the normal approximation of the
 *   mean of per-guest effects.
 * - Holdout scenarios compare randomly assigned groups instead (intent to
 *   treat), which is the only causal estimate here.
 *
 * Everything works on local calendar days of the network time zone, encoded as
 * integer day numbers (days since 1970-01-01).
 */

export const GAME_EFFECT_WINDOW_DAYS = 28;
export const GAME_EFFECT_MIN_WINDOW_DAYS = 7;
export const GAME_EFFECT_MIN_COMPARISON = 3;
export const GAME_EFFECT_NEIGHBOUR_DAYS = 3;
export const GAME_EFFECT_MIN_CI_SAMPLE = 10;
export const GAME_EFFECT_HOLDOUT_MAX_PERCENT = 50;

export const GAME_EFFECT_METRICS = [
  'visitDays',
  'sessions',
  'playMinutes',
  'balanceSpend',
  'barRevenue',
  'money',
] as const;
export type GameEffectMetric = (typeof GAME_EFFECT_METRICS)[number];
export type GameEffectValues = Record<GameEffectMetric, number>;

export type GameEffectDailyRow = {
  guestId: string;
  day: number;
  storeId: string | null;
  sessions: number;
  playMinutes: number;
  balanceSpend: number;
  barRevenue: number;
};

export type GuestTimeline = {
  days: number[];
  /** prefix[metric][i] = sum over days[0..i-1] */
  prefix: Record<GameEffectMetric, number[]>;
  homeStoreId: string | null;
};

export type GameEffectDataset = {
  timelines: Map<string, GuestTimeline>;
  visitorsByDay: Map<number, string[]>;
};

export type GameEffectParticipant = {
  guestId: string;
  exposureDay: number;
};

export type GameEffectMetricResult = {
  participantsBefore: number;
  participantsAfter: number;
  comparisonBefore: number;
  comparisonAfter: number;
  effectPerGuest: number;
  ciLow: number | null;
  ciHigh: number | null;
  total: number;
  significant: boolean;
};

export type GameEffectCohortResult = {
  windowDays: number;
  participants: number;
  measured: number;
  immature: number;
  unmatched: number;
  noHistory: number;
  comparisonGuests: number;
  metrics: Record<GameEffectMetric, GameEffectMetricResult>;
  measuredGuestIds: string[];
};

export type GameEffectGuestResult =
  | {
      status: 'MEASURED';
      windowDays: number;
      complete: boolean;
      exposureDay: number;
      comparisonGuests: number;
      before: GameEffectValues;
      after: GameEffectValues;
      expectedBefore: GameEffectValues;
      expectedAfter: GameEffectValues;
      effect: GameEffectValues;
    }
  | {
      status: 'TOO_EARLY' | 'NO_COMPARISON';
      windowDays: number;
      exposureDay: number;
      daysElapsed: number;
    };

export type GameEffectHoldoutMember = {
  guestId: string;
  startDay: number;
  holdout: boolean;
};

export type GameEffectHoldoutResult = {
  windowDays: number;
  treatment: number;
  holdout: number;
  measuredTreatment: number;
  measuredHoldout: number;
  metrics: Record<GameEffectMetric, GameEffectMetricResult>;
};

export function emptyValues(): GameEffectValues {
  return {
    visitDays: 0,
    sessions: 0,
    playMinutes: 0,
    balanceSpend: 0,
    barRevenue: 0,
    money: 0,
  };
}

export function dayNumberFromIso(value: string): number {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

export function dayNumberToIso(day: number): string {
  return new Date(day * 86_400_000).toISOString().slice(0, 10);
}

/** Local calendar day of an instant in a time zone. */
export function localDayNumber(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
  return dayNumberFromIso(parts);
}

/** Pre-window visit days, bucketed so that comparison guests are alike. */
export function visitBucket(visitDays: number): number {
  if (visitDays <= 0) return 0;
  if (visitDays === 1) return 1;
  if (visitDays <= 3) return 2;
  if (visitDays <= 7) return 3;
  if (visitDays <= 14) return 4;
  return 5;
}

export function buildGameEffectDataset(
  rows: readonly GameEffectDailyRow[],
): GameEffectDataset {
  const byGuest = new Map<
    string,
    {
      days: Map<number, GameEffectValues>;
      stores: Map<string, number>;
    }
  >();

  for (const row of rows) {
    let entry = byGuest.get(row.guestId);
    if (!entry) {
      entry = { days: new Map(), stores: new Map() };
      byGuest.set(row.guestId, entry);
    }
    let values = entry.days.get(row.day);
    if (!values) {
      values = emptyValues();
      entry.days.set(row.day, values);
    }
    values.sessions += row.sessions;
    values.playMinutes += row.playMinutes;
    values.balanceSpend += row.balanceSpend;
    values.barRevenue += row.barRevenue;
    if (row.storeId) {
      entry.stores.set(row.storeId, (entry.stores.get(row.storeId) ?? 0) + 1);
    }
  }

  const timelines = new Map<string, GuestTimeline>();
  const visitorsByDay = new Map<number, string[]>();

  byGuest.forEach((entry, guestId) => {
    const days = [...entry.days.keys()].sort((a, b) => a - b);
    const prefix = Object.fromEntries(
      GAME_EFFECT_METRICS.map((metric) => [metric, [0]]),
    ) as Record<GameEffectMetric, number[]>;

    days.forEach((day, index) => {
      const values = entry.days.get(day)!;
      values.visitDays = values.sessions > 0 ? 1 : 0;
      // Deposit spend and bar sales never overlap (see guest-transaction-money).
      values.money = values.balanceSpend + values.barRevenue;
      GAME_EFFECT_METRICS.forEach((metric) => {
        prefix[metric].push(prefix[metric][index] + values[metric]);
      });
      if (values.sessions > 0) {
        const visitors = visitorsByDay.get(day);
        if (visitors) visitors.push(guestId);
        else visitorsByDay.set(day, [guestId]);
      }
    });

    let homeStoreId: string | null = null;
    let homeCount = 0;
    [...entry.stores.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .forEach(([storeId, count]) => {
        if (count > homeCount) {
          homeStoreId = storeId;
          homeCount = count;
        }
      });

    timelines.set(guestId, { days, prefix, homeStoreId });
  });

  return { timelines, visitorsByDay };
}

function lowerBound(values: readonly number[], target: number) {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (values[middle] < target) low = middle + 1;
    else high = middle;
  }
  return low;
}

/** Sums of a guest's activity on days [fromDay, toDay]. */
export function windowValues(
  timeline: GuestTimeline | undefined,
  fromDay: number,
  toDay: number,
): GameEffectValues {
  const result = emptyValues();
  if (!timeline || toDay < fromDay) return result;
  const start = lowerBound(timeline.days, fromDay);
  const end = lowerBound(timeline.days, toDay + 1);
  GAME_EFFECT_METRICS.forEach((metric) => {
    result[metric] =
      timeline.prefix[metric][end] - timeline.prefix[metric][start];
  });
  return result;
}

type ComparisonStratum = {
  count: number;
  before: GameEffectValues;
  after: GameEffectValues;
  guestIds: string[];
};

function addValues(target: GameEffectValues, source: GameEffectValues) {
  GAME_EFFECT_METRICS.forEach((metric) => {
    target[metric] += source[metric];
  });
}

function scaleValues(values: GameEffectValues, divisor: number) {
  const result = emptyValues();
  if (divisor <= 0) return result;
  GAME_EFFECT_METRICS.forEach((metric) => {
    result[metric] = values[metric] / divisor;
  });
  return result;
}

/**
 * Builds the comparison lookup. A comparison guest is measured around their
 * own visit day, so widening to neighbouring days keeps "was in the club on
 * the anchor day" true for everyone.
 */
function comparisonLookup(input: {
  dataset: GameEffectDataset;
  windowDays: number;
  isEligible: (guestId: string, anchorDay: number) => boolean;
}) {
  const strata = new Map<string, ComparisonStratum>();

  const stratumFor = (day: number, bucket: number) => {
    const key = `${day}|${bucket}`;
    const cached = strata.get(key);
    if (cached) return cached;

    // Build every bucket of this day at once.
    const byBucket = new Map<number, ComparisonStratum>();
    for (const guestId of input.dataset.visitorsByDay.get(day) ?? []) {
      if (!input.isEligible(guestId, day)) continue;
      const timeline = input.dataset.timelines.get(guestId);
      const before = windowValues(timeline, day - input.windowDays, day - 1);
      const after = windowValues(timeline, day + 1, day + input.windowDays);
      const guestBucket = visitBucket(before.visitDays);
      let stratum = byBucket.get(guestBucket);
      if (!stratum) {
        stratum = {
          count: 0,
          before: emptyValues(),
          after: emptyValues(),
          guestIds: [],
        };
        byBucket.set(guestBucket, stratum);
      }
      stratum.count += 1;
      stratum.guestIds.push(guestId);
      addValues(stratum.before, before);
      addValues(stratum.after, after);
    }
    for (let candidate = 0; candidate <= 5; candidate += 1) {
      strata.set(
        `${day}|${candidate}`,
        byBucket.get(candidate) ?? {
          count: 0,
          before: emptyValues(),
          after: emptyValues(),
          guestIds: [],
        },
      );
    }
    return strata.get(key)!;
  };

  return (day: number, bucket: number) => {
    const merged: ComparisonStratum = {
      count: 0,
      before: emptyValues(),
      after: emptyValues(),
      guestIds: [],
    };
    for (let offset = 0; offset <= GAME_EFFECT_NEIGHBOUR_DAYS; offset += 1) {
      const days = offset === 0 ? [day] : [day - offset, day + offset];
      for (const candidateDay of days) {
        const stratum = stratumFor(candidateDay, bucket);
        if (!stratum.count) continue;
        merged.count += stratum.count;
        addValues(merged.before, stratum.before);
        addValues(merged.after, stratum.after);
        merged.guestIds.push(...stratum.guestIds);
      }
      if (merged.count >= GAME_EFFECT_MIN_COMPARISON) break;
    }

    if (merged.count < GAME_EFFECT_MIN_COMPARISON) return null;
    return {
      count: merged.count,
      guestIds: merged.guestIds,
      before: scaleValues(merged.before, merged.count),
      after: scaleValues(merged.after, merged.count),
    };
  };
}

function summarize(
  effects: number[],
  sums: {
    participantsBefore: number;
    participantsAfter: number;
    comparisonBefore: number;
    comparisonAfter: number;
  },
): GameEffectMetricResult {
  const n = effects.length;
  if (!n) {
    return {
      participantsBefore: 0,
      participantsAfter: 0,
      comparisonBefore: 0,
      comparisonAfter: 0,
      effectPerGuest: 0,
      ciLow: null,
      ciHigh: null,
      total: 0,
      significant: false,
    };
  }
  const mean = effects.reduce((sum, value) => sum + value, 0) / n;
  let ciLow: number | null = null;
  let ciHigh: number | null = null;
  if (n >= GAME_EFFECT_MIN_CI_SAMPLE) {
    const variance =
      effects.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1);
    const margin = 1.96 * Math.sqrt(variance / n);
    ciLow = mean - margin;
    ciHigh = mean + margin;
  }
  return {
    participantsBefore: sums.participantsBefore / n,
    participantsAfter: sums.participantsAfter / n,
    comparisonBefore: sums.comparisonBefore / n,
    comparisonAfter: sums.comparisonAfter / n,
    effectPerGuest: mean,
    ciLow,
    ciHigh,
    total: mean * n,
    significant: ciLow !== null && ciHigh !== null && (ciLow > 0 || ciHigh < 0),
  };
}

/**
 * Difference-in-differences effect of an exposure on a cohort, measured only
 * on participants whose whole window has passed.
 */
export function measureCohortEffect(input: {
  dataset: GameEffectDataset;
  participants: readonly GameEffectParticipant[];
  isComparisonEligible: (guestId: string, anchorDay: number) => boolean;
  lastCompleteDay: number;
  windowDays?: number;
}): GameEffectCohortResult {
  const windowDays = input.windowDays ?? GAME_EFFECT_WINDOW_DAYS;
  const lookup = comparisonLookup({
    dataset: input.dataset,
    windowDays,
    isEligible: input.isComparisonEligible,
  });
  const effects = Object.fromEntries(
    GAME_EFFECT_METRICS.map((metric) => [metric, [] as number[]]),
  ) as Record<GameEffectMetric, number[]>;
  const sums = Object.fromEntries(
    GAME_EFFECT_METRICS.map((metric) => [
      metric,
      {
        participantsBefore: 0,
        participantsAfter: 0,
        comparisonBefore: 0,
        comparisonAfter: 0,
      },
    ]),
  ) as Record<
    GameEffectMetric,
    {
      participantsBefore: number;
      participantsAfter: number;
      comparisonBefore: number;
      comparisonAfter: number;
    }
  >;
  const comparisonGuestIds = new Set<string>();
  const measuredGuestIds: string[] = [];
  let immature = 0;
  let unmatched = 0;
  let noHistory = 0;

  for (const participant of input.participants) {
    const day = participant.exposureDay;
    if (day + windowDays > input.lastCompleteDay) {
      immature += 1;
      continue;
    }
    const timeline = input.dataset.timelines.get(participant.guestId);
    if (!timeline) {
      noHistory += 1;
      continue;
    }
    const before = windowValues(timeline, day - windowDays, day - 1);
    const after = windowValues(timeline, day + 1, day + windowDays);
    const comparison = lookup(day, visitBucket(before.visitDays));
    if (!comparison) {
      unmatched += 1;
      continue;
    }
    comparison.guestIds.forEach((id) => comparisonGuestIds.add(id));
    measuredGuestIds.push(participant.guestId);
    GAME_EFFECT_METRICS.forEach((metric) => {
      effects[metric].push(
        after[metric] -
          before[metric] -
          (comparison.after[metric] - comparison.before[metric]),
      );
      sums[metric].participantsBefore += before[metric];
      sums[metric].participantsAfter += after[metric];
      sums[metric].comparisonBefore += comparison.before[metric];
      sums[metric].comparisonAfter += comparison.after[metric];
    });
  }

  return {
    windowDays,
    participants: input.participants.length,
    measured: measuredGuestIds.length,
    immature,
    unmatched,
    noHistory,
    comparisonGuests: comparisonGuestIds.size,
    metrics: Object.fromEntries(
      GAME_EFFECT_METRICS.map((metric) => [
        metric,
        summarize(effects[metric], sums[metric]),
      ]),
    ) as Record<GameEffectMetric, GameEffectMetricResult>,
    measuredGuestIds,
  };
}

/**
 * Effect for one guest. While the full window has not passed yet the window
 * shrinks to the days that did pass (both for the guest and the comparison).
 */
export function measureGuestEffect(input: {
  dataset: GameEffectDataset;
  participant: GameEffectParticipant;
  isComparisonEligible: (guestId: string, anchorDay: number) => boolean;
  lastCompleteDay: number;
}): GameEffectGuestResult {
  const day = input.participant.exposureDay;
  const daysElapsed = Math.max(0, input.lastCompleteDay - day);
  const windowDays = Math.min(GAME_EFFECT_WINDOW_DAYS, daysElapsed);
  if (windowDays < GAME_EFFECT_MIN_WINDOW_DAYS) {
    return { status: 'TOO_EARLY', windowDays, exposureDay: day, daysElapsed };
  }
  const lookup = comparisonLookup({
    dataset: input.dataset,
    windowDays,
    isEligible: input.isComparisonEligible,
  });
  const timeline = input.dataset.timelines.get(input.participant.guestId);
  const before = windowValues(timeline, day - windowDays, day - 1);
  const after = windowValues(timeline, day + 1, day + windowDays);
  const comparison = lookup(day, visitBucket(before.visitDays));
  if (!comparison) {
    return {
      status: 'NO_COMPARISON',
      windowDays,
      exposureDay: day,
      daysElapsed,
    };
  }
  const effect = emptyValues();
  GAME_EFFECT_METRICS.forEach((metric) => {
    effect[metric] =
      after[metric] -
      before[metric] -
      (comparison.after[metric] - comparison.before[metric]);
  });
  return {
    status: 'MEASURED',
    windowDays,
    complete: windowDays === GAME_EFFECT_WINDOW_DAYS,
    exposureDay: day,
    comparisonGuests: comparison.count,
    before,
    after,
    expectedBefore: comparison.before,
    expectedAfter: comparison.after,
    effect,
  };
}

/**
 * Randomised holdout: assigned (treatment) vs held-out guests, change from the
 * `L` days before their start to the `L` days from their start.
 */
export function measureHoldoutEffect(input: {
  dataset: GameEffectDataset;
  members: readonly GameEffectHoldoutMember[];
  lastCompleteDay: number;
}): GameEffectHoldoutResult {
  const changes = {
    treatment: Object.fromEntries(
      GAME_EFFECT_METRICS.map((metric) => [metric, [] as number[]]),
    ) as Record<GameEffectMetric, number[]>,
    holdout: Object.fromEntries(
      GAME_EFFECT_METRICS.map((metric) => [metric, [] as number[]]),
    ) as Record<GameEffectMetric, number[]>,
  };
  const levels = {
    treatment: { before: emptyValues(), after: emptyValues() },
    holdout: { before: emptyValues(), after: emptyValues() },
  };
  const starts = input.members.map((member) => member.startDay);
  const earliest = starts.length ? Math.min(...starts) : input.lastCompleteDay;
  const windowDays = Math.min(
    GAME_EFFECT_WINDOW_DAYS,
    Math.max(0, input.lastCompleteDay - earliest + 1),
  );
  let treatment = 0;
  let holdout = 0;

  for (const member of input.members) {
    if (member.holdout) holdout += 1;
    else treatment += 1;
    if (member.startDay + windowDays - 1 > input.lastCompleteDay) continue;
    const timeline = input.dataset.timelines.get(member.guestId);
    const before = windowValues(
      timeline,
      member.startDay - windowDays,
      member.startDay - 1,
    );
    const after = windowValues(
      timeline,
      member.startDay,
      member.startDay + windowDays - 1,
    );
    const group = member.holdout ? 'holdout' : 'treatment';
    GAME_EFFECT_METRICS.forEach((metric) => {
      changes[group][metric].push(after[metric] - before[metric]);
    });
    addValues(levels[group].before, before);
    addValues(levels[group].after, after);
  }

  const measuredTreatment = changes.treatment.visitDays.length;
  const measuredHoldout = changes.holdout.visitDays.length;
  const metrics = Object.fromEntries(
    GAME_EFFECT_METRICS.map((metric) => {
      const t = changes.treatment[metric];
      const h = changes.holdout[metric];
      if (!t.length || !h.length) {
        return [metric, summarize([], emptySums())];
      }
      const meanT = mean(t);
      const meanH = mean(h);
      const effectPerGuest = meanT - meanH;
      let ciLow: number | null = null;
      let ciHigh: number | null = null;
      if (
        t.length >= GAME_EFFECT_MIN_CI_SAMPLE &&
        h.length >= GAME_EFFECT_MIN_CI_SAMPLE
      ) {
        const margin =
          1.96 *
          Math.sqrt(
            sampleVariance(t) / t.length + sampleVariance(h) / h.length,
          );
        ciLow = effectPerGuest - margin;
        ciHigh = effectPerGuest + margin;
      }
      return [
        metric,
        {
          participantsBefore: levels.treatment.before[metric] / t.length,
          participantsAfter: levels.treatment.after[metric] / t.length,
          comparisonBefore: levels.holdout.before[metric] / h.length,
          comparisonAfter: levels.holdout.after[metric] / h.length,
          effectPerGuest,
          ciLow,
          ciHigh,
          total: effectPerGuest * t.length,
          significant:
            ciLow !== null && ciHigh !== null && (ciLow > 0 || ciHigh < 0),
        } satisfies GameEffectMetricResult,
      ];
    }),
  ) as Record<GameEffectMetric, GameEffectMetricResult>;

  return {
    windowDays,
    treatment,
    holdout,
    measuredTreatment,
    measuredHoldout,
    metrics,
  };
}

function emptySums() {
  return {
    participantsBefore: 0,
    participantsAfter: 0,
    comparisonBefore: 0,
    comparisonAfter: 0,
  };
}

function mean(values: readonly number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sampleVariance(values: readonly number[]) {
  if (values.length < 2) return 0;
  const average = mean(values);
  return (
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) /
    (values.length - 1)
  );
}

/**
 * Deterministic holdout assignment: the same profile always lands in the same
 * group of a scenario, and raising the percent only adds guests to holdout.
 */
export function isInGameHoldout(input: {
  scenarioId: string;
  profileId: string;
  percent: number | null | undefined;
}): boolean {
  const percent = Math.min(
    GAME_EFFECT_HOLDOUT_MAX_PERCENT,
    Math.max(0, Math.floor(input.percent ?? 0)),
  );
  if (!percent) return false;
  return (
    holdoutBucket(`${input.scenarioId}:${input.profileId}`) < percent * 100
  );
}

/** FNV-1a 32-bit → 0..9999. Stable across processes and releases. */
export function holdoutBucket(key: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % 10_000;
}

export type GameEffectVerdict =
  | 'POSITIVE'
  | 'VISITS_ONLY'
  | 'NEGATIVE'
  | 'NO_EFFECT'
  | 'NOT_ENOUGH_DATA';

/**
 * Money decides. Without a conclusive money result, more visits count as a
 * positive effect only if the money estimate is not below zero; otherwise
 * guests come more often but do not spend more (VISITS_ONLY). "No effect"
 * means the interval covers zero, not "proven zero".
 */
export function gameEffectVerdict(
  measured: number,
  metrics: Record<GameEffectMetric, GameEffectMetricResult>,
): GameEffectVerdict {
  if (measured < GAME_EFFECT_MIN_CI_SAMPLE) return 'NOT_ENOUGH_DATA';
  const sign = (metric: GameEffectMetric) => {
    const result = metrics[metric];
    if (!result.significant) return 0;
    return result.effectPerGuest > 0 ? 1 : -1;
  };
  const money = sign('money');
  if (money !== 0) return money > 0 ? 'POSITIVE' : 'NEGATIVE';
  const visits = sign('visitDays');
  if (visits < 0) return 'NEGATIVE';
  if (visits > 0) {
    return metrics.money.effectPerGuest >= 0 ? 'POSITIVE' : 'VISITS_ONLY';
  }
  return 'NO_EFFECT';
}

export const GAME_EFFECT_COST_KINDS = [
  'LOOT_BOX',
  'MISSION',
  'SEASON',
  'OTHER',
] as const;
export type GameEffectCostKind = (typeof GAME_EFFECT_COST_KINDS)[number];

export type GameEffectCostItem = {
  day: number;
  kind: GameEffectCostKind;
  /** Profile (or guest) that got the reward; counts players per month. */
  holderKey: string;
  bonusRub: number;
  prize: boolean;
};

export type GameEffectMonthlyCost = {
  month: string;
  bonusRub: Record<GameEffectCostKind, number>;
  totalBonusRub: number;
  prizes: number;
  /** Players who got a paid bonus or prize that month. */
  players: number;
};

/** `YYYY-MM` of a day number. */
export function monthOfDay(day: number): string {
  return dayNumberToIso(day).slice(0, 7);
}

/** `YYYY-MM` shifted by whole months. */
export function addMonths(month: string, count: number): string {
  const [year, value] = month.split('-').map(Number);
  return new Date(Date.UTC(year, value - 1 + count, 1))
    .toISOString()
    .slice(0, 7);
}

/**
 * Paid bonuses and prizes per calendar month and mechanic: what the game
 * costs over time, outside any measurement window. Months without rewards
 * between the first and the last one are kept at zero.
 */
export function summarizeMonthlyCosts(
  items: readonly GameEffectCostItem[],
): GameEffectMonthlyCost[] {
  const byMonth = new Map<
    string,
    { row: GameEffectMonthlyCost; holders: Set<string> }
  >();
  const ensure = (month: string) => {
    let entry = byMonth.get(month);
    if (!entry) {
      entry = {
        row: {
          month,
          bonusRub: { LOOT_BOX: 0, MISSION: 0, SEASON: 0, OTHER: 0 },
          totalBonusRub: 0,
          prizes: 0,
          players: 0,
        },
        holders: new Set(),
      };
      byMonth.set(month, entry);
    }
    return entry;
  };
  items.forEach((item) => {
    if (!item.bonusRub && !item.prize) return;
    const entry = ensure(monthOfDay(item.day));
    entry.row.bonusRub[item.kind] += item.bonusRub;
    entry.row.totalBonusRub += item.bonusRub;
    if (item.prize) entry.row.prizes += 1;
    entry.holders.add(item.holderKey);
  });
  const months = [...byMonth.keys()].sort();
  if (months.length > 1) {
    for (
      let month = months[0];
      month < months[months.length - 1];
      month = addMonths(month, 1)
    ) {
      ensure(month);
    }
  }
  return [...byMonth.values()]
    .map(({ row, holders }) => ({ ...row, players: holders.size }))
    .sort((left, right) => left.month.localeCompare(right.month));
}

export type GameEffectReturnGroup = 'PLAYER' | 'FUTURE_PLAYER' | 'NEVER';

export type GameEffectMonthlyReturn = {
  month: string;
  group: GameEffectReturnGroup;
  /** Guests with a visit that month. */
  guests: number;
  /** Of them, guests with a visit the next month. */
  returned: number;
  /** The next month is still running, so the share will still grow. */
  partial: boolean;
};

/**
 * Share of a month's guests who come back the next month, for players
 * (activated by the end of the month), future players (activate later than
 * the next month) and guests who never played. Future players show how loyal
 * players were before the game: a gap between them and the rest is
 * self-selection, not an effect. A guest who activates in the next month is
 * left out of that month, because activation itself often means a visit.
 */
export function measureMonthlyReturn(input: {
  visits: ReadonlyArray<{ guestId: string; month: string }>;
  activationMonth: ReadonlyMap<string, string>;
  excluded: ReadonlySet<string>;
  currentMonth: string;
}): GameEffectMonthlyReturn[] {
  const monthsByGuest = new Map<string, Set<string>>();
  input.visits.forEach(({ guestId, month }) => {
    if (input.excluded.has(guestId)) return;
    let months = monthsByGuest.get(guestId);
    if (!months) {
      months = new Set();
      monthsByGuest.set(guestId, months);
    }
    months.add(month);
  });

  const rows = new Map<string, GameEffectMonthlyReturn>();
  monthsByGuest.forEach((months, guestId) => {
    const activation = input.activationMonth.get(guestId);
    months.forEach((month) => {
      if (month >= input.currentMonth) return;
      const next = addMonths(month, 1);
      let group: GameEffectReturnGroup;
      if (activation === undefined) group = 'NEVER';
      else if (activation <= month) group = 'PLAYER';
      else if (activation > next) group = 'FUTURE_PLAYER';
      else return;
      const key = `${month}:${group}`;
      let row = rows.get(key);
      if (!row) {
        row = {
          month,
          group,
          guests: 0,
          returned: 0,
          partial: next === input.currentMonth,
        };
        rows.set(key, row);
      }
      row.guests += 1;
      if (months.has(next)) row.returned += 1;
    });
  });

  const order: Record<GameEffectReturnGroup, number> = {
    PLAYER: 0,
    FUTURE_PLAYER: 1,
    NEVER: 2,
  };
  return [...rows.values()].sort(
    (left, right) =>
      left.month.localeCompare(right.month) ||
      order[left.group] - order[right.group],
  );
}

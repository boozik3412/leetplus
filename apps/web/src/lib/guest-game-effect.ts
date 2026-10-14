/**
 * Mirror of the API game-effect report (apps/api/src/guest-game-effect) and
 * its presentation: Russian labels, verdict tones and number formatting.
 * Pure functions only, so they run in client components and node tests.
 */

export const GAME_EFFECT_METRICS = [
  "visitDays",
  "sessions",
  "playMinutes",
  "balanceSpend",
  "barRevenue",
  "money",
] as const;
export type GameEffectMetric = (typeof GAME_EFFECT_METRICS)[number];
export type GameEffectValues = Record<GameEffectMetric, number>;

export type GameEffectVerdict =
  | "POSITIVE"
  | "VISITS_ONLY"
  | "NEGATIVE"
  | "NO_EFFECT"
  | "NOT_ENOUGH_DATA";

export type GameEffectMetricView = {
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

export type GameEffectCohortView = {
  windowDays: number;
  participants: number;
  measured: number;
  immature: number;
  unmatched: number;
  noHistory: number;
  comparisonGuests: number;
  metrics: Record<GameEffectMetric, GameEffectMetricView>;
  cost: { bonusRub: number; prizes: number; bonusPerGuest: number | null };
  moneyPerBonusRub: number | null;
  verdict: GameEffectVerdict;
};

export type GameEffectHoldoutView = {
  percent: number;
  startedAt: string | null;
  result: {
    windowDays: number;
    treatment: number;
    holdout: number;
    measuredTreatment: number;
    measuredHoldout: number;
    metrics: Record<GameEffectMetric, GameEffectMetricView>;
    verdict: GameEffectVerdict;
  } | null;
  pendingReason: "NOT_STARTED" | "TOO_EARLY" | null;
};

export type GameEffectScenarioKind = "MISSION" | "LOOT_BOX" | "SEASON";

export type GameEffectScenarioView = {
  kind: GameEffectScenarioKind;
  id: string;
  name: string;
  status: string;
  usageKind: string | null;
  storeIds: string[];
  holdout: GameEffectHoldoutView | null;
  cohort: GameEffectCohortView;
};

export type GameEffectReport = {
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
  game: GameEffectCohortView & {
    byStore: Array<{
      storeId: string;
      storeName: string;
      cohort: GameEffectCohortView;
    }>;
  };
  scenarios: GameEffectScenarioView[];
};

export type GuestGameEffectActivation =
  | {
      status: "MEASURED";
      windowDays: number;
      complete: boolean;
      comparisonGuests: number;
      before: GameEffectValues;
      after: GameEffectValues;
      expectedBefore: GameEffectValues;
      expectedAfter: GameEffectValues;
      effect: GameEffectValues;
      exposureDate: string;
    }
  | {
      status: "TOO_EARLY" | "NO_COMPARISON";
      windowDays: number;
      daysElapsed: number;
      exposureDate: string;
    };

export type GuestGameEffectResponse =
  | {
      available: true;
      windowDays: number;
      lastCompleteDay: string;
      activation: GuestGameEffectActivation | null;
      cost: { bonusRub: number; prizes: number };
      scenarios: Array<{
        kind: GameEffectScenarioKind;
        id: string;
        name: string;
        firstDate: string;
        bonusRub: number;
        prizes: number;
        inHoldout: boolean | null;
      }>;
    }
  | { available: false; reason: "NO_CAPABILITY" | "NOT_CONFIGURED" };

export const GAME_EFFECT_METRIC_LABELS: Record<GameEffectMetric, string> = {
  visitDays: "Дни визитов",
  sessions: "Сессии",
  playMinutes: "Часы игры",
  balanceSpend: "Списания с депозита",
  barRevenue: "Бар",
  money: "Деньги гостя",
};

export const GAME_EFFECT_SCENARIO_KIND_LABELS: Record<
  GameEffectScenarioKind,
  string
> = {
  MISSION: "Задание",
  LOOT_BOX: "Кейс",
  SEASON: "Battle Pass",
};

export const GAME_EFFECT_VERDICT_LABELS: Record<GameEffectVerdict, string> = {
  POSITIVE: "Есть эффект",
  VISITS_ONLY: "Чаще ходят, не больше тратят",
  NEGATIVE: "Отрицательный",
  NO_EFFECT: "В пределах случайности",
  NOT_ENOUGH_DATA: "Мало данных",
};

export type GameEffectTone = "good" | "bad" | "neutral" | "muted";

export function gameEffectVerdictTone(
  verdict: GameEffectVerdict,
): GameEffectTone {
  if (verdict === "POSITIVE") return "good";
  if (verdict === "VISITS_ONLY") return "muted";
  if (verdict === "NEGATIVE") return "bad";
  if (verdict === "NO_EFFECT") return "neutral";
  return "muted";
}

export function gameEffectVerdictHint(verdict: GameEffectVerdict) {
  switch (verdict) {
    case "POSITIVE":
      return "Участники стали ходить чаще или тратить больше, чем похожие гости, и разница больше случайных колебаний.";
    case "VISITS_ONLY":
      return "Участники ходят чаще похожих гостей, но денег приносят не больше — часто бонусы заменяют оплату с депозита.";
    case "NEGATIVE":
      return "Участники стали тратить меньше похожих гостей. Проверьте, не заменяют ли бонусы оплату деньгами.";
    case "NO_EFFECT":
      return "Разница с похожими гостями есть, но она в пределах случайных колебаний — вывод делать рано.";
    case "NOT_ENOUGH_DATA":
    default:
      return "Измерено меньше 10 гостей с полным окном — вывод делать рано.";
  }
}

const integerFormat = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 0,
});
const decimalFormat = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 1,
});

/** A metric value in its unit: hours for play time, roubles for money. */
export function formatGameEffectValue(
  metric: GameEffectMetric,
  value: number,
): string {
  if (metric === "playMinutes") return `${decimalFormat.format(value / 60)} ч`;
  if (metric === "visitDays" || metric === "sessions") {
    return decimalFormat.format(value);
  }
  return `${integerFormat.format(value)} ₽`;
}

/** Signed effect, e.g. "+1,5" or "−320 ₽". */
export function formatGameEffectDelta(
  metric: GameEffectMetric,
  value: number,
): string {
  const rounded =
    metric === "visitDays" || metric === "sessions" || metric === "playMinutes"
      ? Math.round((metric === "playMinutes" ? value / 60 : value) * 10) / 10
      : Math.round(value);
  if (rounded === 0) return formatGameEffectValue(metric, 0);
  const sign = rounded > 0 ? "+" : "−";
  return `${sign}${formatGameEffectValue(metric, Math.abs(value))}`;
}

export function formatGameEffectInterval(
  metric: GameEffectMetric,
  view: Pick<GameEffectMetricView, "ciLow" | "ciHigh">,
): string | null {
  if (view.ciLow === null || view.ciHigh === null) return null;
  return `от ${formatGameEffectDelta(metric, view.ciLow)} до ${formatGameEffectDelta(metric, view.ciHigh)}`;
}

export function gameEffectMetricTone(view: GameEffectMetricView): GameEffectTone {
  if (!view.significant) return "neutral";
  return view.effect > 0 ? "good" : "bad";
}

export function gameEffectHoldoutStatus(holdout: GameEffectHoldoutView | null) {
  if (!holdout) return "Контрольной группы нет";
  const since = holdout.startedAt
    ? ` с ${new Date(holdout.startedAt).toLocaleDateString("ru-RU")}`
    : "";
  const base = `Контрольная группа ${holdout.percent}%${since}`;
  if (holdout.pendingReason === "NOT_STARTED") return `${base}: ещё не начата`;
  if (holdout.pendingReason === "TOO_EARLY") {
    return `${base}: результат через 7 дней после старта`;
  }
  return base;
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n;]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text;
}

/** CSV of the report rows: the game as a whole, then every scenario. */
export function gameEffectReportCsv(report: GameEffectReport): string {
  const header = [
    "Сценарий",
    "Тип",
    "Участники",
    "Измерено",
    "Окно ещё идёт",
    "Без пары",
    "Гостей в сравнении",
    ...GAME_EFFECT_METRICS.flatMap((metric) => [
      `${GAME_EFFECT_METRIC_LABELS[metric]}: до`,
      `${GAME_EFFECT_METRIC_LABELS[metric]}: после`,
      `${GAME_EFFECT_METRIC_LABELS[metric]}: сравнение до`,
      `${GAME_EFFECT_METRIC_LABELS[metric]}: сравнение после`,
      `${GAME_EFFECT_METRIC_LABELS[metric]}: эффект на гостя`,
      `${GAME_EFFECT_METRIC_LABELS[metric]}: интервал от`,
      `${GAME_EFFECT_METRIC_LABELS[metric]}: интервал до`,
    ]),
    "Деньги: эффект всего",
    "Бонусы выдано, ₽",
    "Призы",
    "Деньги на 1 ₽ бонусов",
    "Вывод",
    "Контрольная группа",
  ];
  const rows = [
    {
      name: "Игра в целом",
      kind: "Активация",
      cohort: report.game as GameEffectCohortView,
      holdout: null as GameEffectHoldoutView | null,
    },
    ...report.scenarios.map((scenario) => ({
      name: scenario.name,
      kind: GAME_EFFECT_SCENARIO_KIND_LABELS[scenario.kind],
      cohort: scenario.cohort,
      holdout: scenario.holdout,
    })),
  ].map(({ name, kind, cohort, holdout }) => [
    name,
    kind,
    cohort.participants,
    cohort.measured,
    cohort.immature,
    cohort.unmatched,
    cohort.comparisonGuests,
    ...GAME_EFFECT_METRICS.flatMap((metric) => {
      const view = cohort.metrics[metric];
      return [
        view.before,
        view.after,
        view.comparisonBefore,
        view.comparisonAfter,
        view.effect,
        view.ciLow ?? "",
        view.ciHigh ?? "",
      ];
    }),
    cohort.metrics.money.total,
    cohort.cost.bonusRub,
    cohort.cost.prizes,
    cohort.moneyPerBonusRub ?? "",
    GAME_EFFECT_VERDICT_LABELS[cohort.verdict],
    holdout ? gameEffectHoldoutStatus(holdout) : "",
  ]);

  return [
    "﻿" + header.map(csvCell).join(","),
    ...rows.map((row) => row.map(csvCell).join(",")),
  ].join("\n");
}

import type { ExecutiveMetric, ExecutiveSummary } from "./dashboard-executive";

/** A missing/partial period or disabled comparison is not evidence of decline. */
export function hasConfirmedDecline(
  metric: ExecutiveMetric | undefined,
): boolean {
  return (
    metric?.state === "AVAILABLE" &&
    metric.value !== null &&
    Number.isFinite(metric.value) &&
    typeof metric.comparison?.previousValue === "number" &&
    Number.isFinite(metric.comparison.previousValue) &&
    typeof metric.comparison.absoluteDelta === "number" &&
    Number.isFinite(metric.comparison.absoluteDelta) &&
    metric.comparison.absoluteDelta < 0
  );
}

export function priorityCount(
  value: number,
  unit: "TASKS" | "CHECKLISTS" | "EMPLOYEES",
) {
  const forms = {
    TASKS: ["задача", "задачи", "задач"],
    CHECKLISTS: ["чек-лист", "чек-листа", "чек-листов"],
    EMPLOYEES: ["сотрудник", "сотрудника", "сотрудников"],
  }[unit];
  const plural = new Intl.PluralRules("ru-RU").select(value);
  return `${new Intl.NumberFormat("ru-RU").format(value)} ${forms[plural === "one" ? 0 : plural === "few" ? 1 : 2]}`;
}

/** Direction comes from the API-computed number, never from a formatted string. */
export function deltaDirection(
  metric: ExecutiveMetric | undefined | null,
): "up" | "down" | "flat" | null {
  const delta = metric?.comparison?.absoluteDelta;
  if (typeof delta !== "number" || !Number.isFinite(delta)) return null;
  return delta > 0 ? "up" : delta < 0 ? "down" : "flat";
}

// Club decline thresholds approved by the owner on 30.09.2026.
export const CLUB_DROP_TODAY_PERCENT = -20;
export const CLUB_DROP_URGENT_PERCENT = -50;
/** Shorter periods compare adjacent days (Tuesday to Monday) and are noise. */
export const CLUB_DROP_MIN_PERIOD_DAYS = 7;

export type PriorityLevel = "URGENT" | "TODAY" | "DATA";

export type ClubDropSignal = {
  storeId: string;
  storeName: string;
  level: Exclude<PriorityLevel, "DATA">;
  value: number;
  previousValue: number;
  absoluteDelta: number;
  percentDelta: number;
  perDay: number;
};

function inclusiveDays(from: string, to: string) {
  const start = Date.parse(`${from}T00:00:00.000Z`);
  const end = Date.parse(`${to}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return Math.round((end - start) / 86_400_000) + 1;
}

/**
 * Confirmed product-revenue decline per club. Only AVAILABLE clubs with an
 * API comparison qualify, so partial or unconfirmed clubs never raise it.
 */
export function clubDropSignals(summary: ExecutiveSummary): ClubDropSignal[] {
  const days = inclusiveDays(
    summary.scope.period.from,
    summary.scope.period.to,
  );
  if (!summary.scope.comparison || days < CLUB_DROP_MIN_PERIOD_DAYS) return [];
  return summary.clubs
    .flatMap((club): ClubDropSignal[] => {
      const metric = club.metrics.productRevenue;
      const percentDelta = metric?.comparison?.percentDelta;
      if (
        !hasConfirmedDecline(metric) ||
        typeof percentDelta !== "number" ||
        !Number.isFinite(percentDelta) ||
        percentDelta > CLUB_DROP_TODAY_PERCENT
      )
        return [];
      const absoluteDelta = metric.comparison!.absoluteDelta!;
      return [
        {
          storeId: club.storeId,
          storeName: club.storeName,
          level:
            percentDelta <= CLUB_DROP_URGENT_PERCENT ? "URGENT" : "TODAY",
          value: metric.value!,
          previousValue: metric.comparison!.previousValue!,
          absoluteDelta,
          percentDelta,
          perDay: absoluteDelta / days,
        },
      ];
    })
    .toSorted((left, right) => left.absoluteDelta - right.absoluteDelta);
}

export type NetworkContributions = {
  previousValue: number;
  value: number;
  absoluteDelta: number;
  clubs: Array<{ storeId: string; storeName: string; delta: number }>;
  notComparable: Array<{ storeId: string; storeName: string }>;
  /** Network delta not explained by comparable clubs; never spread over them. */
  unexplained: number;
};

/** Splits the network product-revenue change into per-club contributions. */
export function networkContributions(
  summary: ExecutiveSummary,
): NetworkContributions | null {
  const network = summary.metrics.productRevenue;
  const comparison = network?.comparison;
  if (
    !network ||
    network.value === null ||
    typeof comparison?.previousValue !== "number" ||
    typeof comparison.absoluteDelta !== "number" ||
    summary.clubs.length < 2
  )
    return null;
  const clubs: NetworkContributions["clubs"] = [];
  const notComparable: NetworkContributions["notComparable"] = [];
  for (const club of summary.clubs) {
    const delta = club.metrics.productRevenue?.comparison?.absoluteDelta;
    if (typeof delta === "number" && Number.isFinite(delta))
      clubs.push({ storeId: club.storeId, storeName: club.storeName, delta });
    else notComparable.push({ storeId: club.storeId, storeName: club.storeName });
  }
  const explained = clubs.reduce((sum, club) => sum + club.delta, 0);
  const unexplained = Math.round(comparison.absoluteDelta - explained);
  return {
    previousValue: comparison.previousValue,
    value: network.value,
    absoluteDelta: comparison.absoluteDelta,
    // Losses first (largest first), then gains (largest first).
    clubs: clubs.toSorted((left, right) =>
      left.delta < 0 || right.delta < 0
        ? left.delta - right.delta
        : right.delta - left.delta,
    ),
    notComparable,
    unexplained: Math.abs(unexplained) >= 1 ? unexplained : 0,
  };
}

/**
 * Product sales need a data-quality priority only when this selection really
 * lacks confirmed store-days or the source failed. Unconfirmed services are a
 * standing model limit shown next to the KPI, not a daily task.
 */
export function salesCoverageGap(
  metric: ExecutiveMetric | undefined,
):
  | { kind: "UNCONFIRMED_DAYS"; covered: number; total: number }
  | { kind: "SOURCE"; state: ExecutiveMetric["state"]; reason: string | null }
  | null {
  if (!metric) return null;
  if (metric.state === "MISSING" || metric.state === "FAILED" || metric.state === "STALE")
    return { kind: "SOURCE", state: metric.state, reason: metric.reason };
  const coverage = metric.coverage;
  if (
    coverage &&
    coverage.total !== null &&
    coverage.covered < coverage.total
  )
    return {
      kind: "UNCONFIRMED_DAYS",
      covered: coverage.covered,
      total: coverage.total,
    };
  return null;
}

export const priorityKinds = [
  "TASKS_OVERDUE",
  "CHECKLISTS_OVERDUE",
  "CLUB_DROP",
  "OUT_OF_STOCK",
  "CHECKLISTS_REVIEW",
  "VISITS_DECLINE",
  "AVERAGE_CHECK_DECLINE",
  "REVENUE_PER_VISIT_DECLINE",
  "LOW_STOCK",
  "TRAINING_INCOMPLETE",
  "REGULATIONS_UNACKNOWLEDGED",
  "SALES_COVERAGE",
] as const;
export type PriorityKind = (typeof priorityKinds)[number];

const levelOrder: Record<PriorityLevel, number> = { URGENT: 0, TODAY: 1, DATA: 2 };

/**
 * Order is by level, then a fixed kind order. Amounts are compared only
 * inside one kind: revenue, profit estimates and stock value are not
 * interchangeable, so money never ranks one kind above another.
 */
export function sortPriorities<
  T extends { kind: PriorityKind; level: PriorityLevel; amount?: number | null },
>(items: readonly T[]): T[] {
  return items.toSorted(
    (left, right) =>
      levelOrder[left.level] - levelOrder[right.level] ||
      priorityKinds.indexOf(left.kind) - priorityKinds.indexOf(right.kind) ||
      (right.amount ?? 0) - (left.amount ?? 0),
  );
}

export function priorityLevelCounts(
  items: ReadonlyArray<{ level: PriorityLevel }>,
) {
  return {
    urgent: items.filter((item) => item.level === "URGENT").length,
    today: items.filter((item) => item.level === "TODAY").length,
    data: items.filter((item) => item.level === "DATA").length,
  };
}

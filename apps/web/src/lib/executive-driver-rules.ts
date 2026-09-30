// Decision rules over the revenue drivers of the executive summary. No
// runtime imports so the node:test contract suite can load it directly.
import type {
  ExecutiveDriverFactor,
  ExecutiveDriverRow,
  ExecutiveDrivers,
  ExecutiveSummary,
} from "./dashboard-executive";

/** A club converts visits into bar purchases this much worse than the best club. */
export const CONVERSION_GAP_RATIO = 0.75;
/** Clubs with fewer visits in the period are not compared on conversion. */
export const CONVERSION_GAP_MIN_VISITS = 100;
/** Average bar purchase fell at least this much (percent). */
export const CHECK_DROP_PERCENT = -10;
/** A loss factor is the lever when it costs at least this share of last period's bar. */
export const LEVER_LOSS_SHARE = 0.05;

export type DriverLever = {
  factor: ExecutiveDriverFactor;
  amount: number;
  kind: "LOSS" | "GAIN";
};

/**
 * The factor to work on: the largest loss when it matters, otherwise the
 * factor that drove the growth. Null without a comparable split.
 */
export function mainLever(row: ExecutiveDriverRow): DriverLever | null {
  const contributions = row.contributions;
  const previous = row.previous?.barRevenue;
  if (!contributions?.length || !previous) return null;
  const loss = contributions.reduce(
    (worst, item) => (item.amount < worst.amount ? item : worst),
    contributions[0],
  );
  if (loss.amount < 0 && -loss.amount >= previous * LEVER_LOSS_SHARE)
    return { factor: loss.factor, amount: loss.amount, kind: "LOSS" };
  const total = contributions.reduce((sum, item) => sum + item.amount, 0);
  if (total <= 0) return null;
  const gain = contributions.reduce(
    (best, item) => (item.amount > best.amount ? item : best),
    contributions[0],
  );
  return gain.amount > 0
    ? { factor: gain.factor, amount: gain.amount, kind: "GAIN" }
    : null;
}

export type ConversionGap = {
  storeId: string;
  storeName: string;
  value: number;
  best: number;
  bestStoreName: string;
  /** Bar revenue the club would add at the best club's conversion, same period. */
  potential: number;
};

/** Clubs that turn visits into bar purchases far below the best club of the selection. */
export function conversionGaps(
  drivers: ExecutiveDrivers | undefined,
): ConversionGap[] {
  const clubs = (drivers?.rows ?? []).filter(
    (row) =>
      row.scope === "CLUB" &&
      row.storeId !== null &&
      row.current.purchasesPerVisit !== null &&
      row.current.visits !== null &&
      row.current.visits >= CONVERSION_GAP_MIN_VISITS &&
      row.current.averagePurchase !== null,
  );
  if (clubs.length < 2) return [];
  const best = clubs.reduce((top, row) =>
    row.current.purchasesPerVisit! > top.current.purchasesPerVisit! ? row : top,
  );
  const bestValue = best.current.purchasesPerVisit!;
  return clubs
    .filter(
      (row) =>
        row !== best &&
        row.current.purchasesPerVisit! <= bestValue * CONVERSION_GAP_RATIO,
    )
    .map((row) => ({
      storeId: row.storeId!,
      storeName: row.storeName,
      value: row.current.purchasesPerVisit!,
      best: bestValue,
      bestStoreName: best.storeName,
      potential: Math.round(
        ((bestValue - row.current.purchasesPerVisit!) / 100) *
          row.current.visits! *
          row.current.averagePurchase!,
      ),
    }))
    .toSorted((left, right) => right.potential - left.potential);
}

export type CheckDrop = {
  storeId: string | null;
  storeName: string;
  current: number;
  previous: number;
  percent: number;
  /** Roubles of the bar change explained by the check, when split. */
  amount: number | null;
};

/** Network or clubs whose average bar purchase fell at least CHECK_DROP_PERCENT. */
export function checkDrops(
  drivers: ExecutiveDrivers | undefined,
  excludeStoreIds: ReadonlySet<string> = new Set(),
): CheckDrop[] {
  return (drivers?.rows ?? [])
    .filter(
      (row) =>
        (row.scope === "CLUB" || row.scope === "NETWORK") &&
        !(row.storeId && excludeStoreIds.has(row.storeId)),
    )
    .flatMap((row): CheckDrop[] => {
      const current = row.current.averagePurchase;
      const previous = row.previous?.averagePurchase;
      if (current === null || !previous) return [];
      const percent = ((current - previous) / previous) * 100;
      if (percent > CHECK_DROP_PERCENT) return [];
      return [
        {
          storeId: row.storeId,
          storeName: row.storeName,
          current,
          previous,
          percent,
          amount:
            row.contributions?.find((item) => item.factor === "CHECK")
              ?.amount ?? null,
        },
      ];
    });
}

function nextDay(date: string) {
  const day = new Date(`${date}T00:00:00.000Z`);
  day.setUTCDate(day.getUTCDate() + 1);
  return day.toISOString().slice(0, 10);
}

/**
 * Calendar day of a timestamp in the club's time zone: sales, visits and the
 * daily source coverage all use the club's day.
 */
export function clubLocalDay(iso: string, timeZone?: string | null) {
  if (timeZone) {
    try {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(new Date(iso));
      const part = (type: string) =>
        parts.find((item) => item.type === type)?.value;
      return `${part("year")}-${part("month")}-${part("day")}`;
    } catch {
      // Unknown zone: fall back to the UTC day below.
    }
  }
  return iso.slice(0, 10);
}

/** Last club-local day with a confirmed bar sale in the selection. */
export function salesConfirmedThrough(summary: ExecutiveSummary) {
  const days = summary.clubs.flatMap((club) => {
    const factAsOf = club.metrics.productRevenue?.factAsOf;
    return factAsOf
      ? [clubLocalDay(factAsOf, summary.scope.storeTimeZones?.[club.storeId])]
      : [];
  });
  if (days.length > 0) return days.sort()[days.length - 1];
  return summary.metrics.productRevenue?.factAsOf?.slice(0, 10) ?? null;
}

/**
 * Clubs without bar sales since a day inside the period although they sold
 * before: closed or not delivering data. Their decline is not a sales signal.
 */
export function silentClubs(
  summary: ExecutiveSummary,
): Array<{ storeId: string; storeName: string; since: string }> {
  const { from, to } = summary.scope.period;
  return summary.clubs.flatMap((club) => {
    const metric = club.metrics.productRevenue;
    if (!metric || metric.state === "MISSING" || metric.state === "FAILED")
      return [];
    const lastSale = metric.factAsOf
      ? clubLocalDay(
          metric.factAsOf,
          summary.scope.storeTimeZones?.[club.storeId],
        )
      : null;
    const soldBefore =
      (metric.comparison?.previousValue ?? 0) > 0 || (metric.value ?? 0) > 0;
    if (!soldBefore) return [];
    if (lastSale === null)
      return (metric.comparison?.previousValue ?? 0) > 0
        ? [{ storeId: club.storeId, storeName: club.storeName, since: from }]
        : [];
    return lastSale < to
      ? [
          {
            storeId: club.storeId,
            storeName: club.storeName,
            since: nextDay(lastSale),
          },
        ]
      : [];
  });
}

export const leverLabels: Record<ExecutiveDriverFactor, string> = {
  VISITS: "трафик",
  CONVERSION: "конверсия",
  PURCHASES: "покупки",
  CHECK: "чек",
};

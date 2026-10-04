/**
 * Revenue drivers for the executive summary: bar sales split into traffic,
 * conversion and average purchase, plus guest and capacity context.
 *
 * Owner decisions of 30.09.2026: a bar purchase without a Langame receipt id
 * is the sales to one guest within one minute; clubs work around the clock, so
 * capacity is PCs × 24 h. Capacity uses the current PC count and is an estimate.
 */

export type ExecutiveDriverFactors = {
  /** Revenue of identified purchases; the product of the factors below. */
  barRevenue: number | null;
  /** All confirmed bar revenue, including sales that are not in a purchase. */
  totalBarRevenue: number | null;
  purchases: number | null;
  averagePurchase: number | null;
  visits: number | null;
  purchasesPerVisit: number | null;
  guests: number | null;
  visitsPerGuest: number | null;
  playedHours: number | null;
  capacityHours: number | null;
  /** Percent of PC hours played; an estimate from the current PC count. */
  loadEstimate: number | null;
};

export type ExecutiveDriverFactor =
  | 'VISITS'
  | 'CONVERSION'
  | 'PURCHASES'
  | 'CHECK';

export type ExecutiveDriverContribution = {
  factor: ExecutiveDriverFactor;
  /** Roubles of the bar revenue change explained by this factor. */
  amount: number;
};

export type ExecutiveDriverRow = {
  /** Computers of the row's clubs; null when any club has no known count. */
  computerCount?: number | null;
  /** DOMAIN: clubs sharing one Langame domain, all selected (sessions are not split by club). */
  scope: 'NETWORK' | 'DOMAIN' | 'CLUB';
  storeId: string | null;
  storeName: string;
  storeIds: string[];
  current: ExecutiveDriverFactors;
  previous: ExecutiveDriverFactors | null;
  contributions: ExecutiveDriverContribution[] | null;
  notes: string[];
};

export type ExecutiveDrivers = {
  definitions: {
    purchase: string;
    visits: string;
    load: string;
  };
  rows: ExecutiveDriverRow[];
  /** Network factors per day, aligned with the comparison day by index; omitted for long periods. */
  days: Array<{
    date: string;
    current: ExecutiveDriverFactors;
    previous: ExecutiveDriverFactors | null;
  }>;
};

/** Daily driver series are computed for periods up to this length. */
export const EXECUTIVE_DRIVER_DAYS_LIMIT = 62;

function round(value: number, digits = 0) {
  const scale = 10 ** digits;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function positive(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value > 0;
}

export function driverFactors(input: {
  barRevenue: number | null;
  totalBarRevenue: number | null;
  purchases: number | null;
  visits: number | null;
  guests: number | null;
  playedHours: number | null;
  capacityHours: number | null;
}): ExecutiveDriverFactors {
  const { barRevenue, purchases, visits, guests, playedHours, capacityHours } =
    input;
  return {
    barRevenue: barRevenue === null ? null : round(barRevenue),
    totalBarRevenue:
      input.totalBarRevenue === null ? null : round(input.totalBarRevenue),
    purchases,
    averagePurchase:
      barRevenue !== null && positive(purchases)
        ? round(barRevenue / purchases)
        : null,
    visits,
    purchasesPerVisit:
      purchases !== null && positive(visits)
        ? round((purchases / visits) * 100, 1)
        : null,
    guests,
    visitsPerGuest:
      visits !== null && positive(guests) ? round(visits / guests, 2) : null,
    playedHours: playedHours === null ? null : round(playedHours),
    capacityHours,
    loadEstimate:
      playedHours !== null && positive(capacityHours)
        ? round((playedHours / capacityHours) * 100, 1)
        : null,
  };
}

/**
 * Logarithmic mean Divisia split of the revenue change: contributions sum to
 * the change exactly and do not depend on the factor order. Uses visits ×
 * purchases per visit × average purchase when visits exist in both periods,
 * otherwise purchases × average purchase. Returns null when a factor is not
 * positive in either period, rather than inventing a split.
 */
export function decomposeBarRevenue(
  current: ExecutiveDriverFactors,
  previous: ExecutiveDriverFactors,
): ExecutiveDriverContribution[] | null {
  const r1 = current.barRevenue;
  const r0 = previous.barRevenue;
  if (!positive(r1) || !positive(r0)) return null;
  if (!positive(current.purchases) || !positive(previous.purchases))
    return null;
  const withVisits = positive(current.visits) && positive(previous.visits);
  const factors: Array<[ExecutiveDriverFactor, number, number]> = withVisits
    ? [
        ['VISITS', current.visits!, previous.visits!],
        [
          'CONVERSION',
          current.purchases / current.visits!,
          previous.purchases / previous.visits!,
        ],
        ['CHECK', r1 / current.purchases, r0 / previous.purchases],
      ]
    : [
        ['PURCHASES', current.purchases, previous.purchases],
        ['CHECK', r1 / current.purchases, r0 / previous.purchases],
      ];
  const weight = r1 === r0 ? r1 : (r1 - r0) / (Math.log(r1) - Math.log(r0));
  const contributions = factors.map(([factor, now, before]) => ({
    factor,
    amount: round(weight * Math.log(now / before)),
  }));
  // Keep the rounded parts summing to the rounded change.
  const residual =
    round(r1 - r0) -
    contributions.reduce((sum, contribution) => sum + contribution.amount, 0);
  const largest = contributions.reduce((best, item) =>
    Math.abs(item.amount) > Math.abs(best.amount) ? item : best,
  );
  largest.amount = round(largest.amount + residual);
  return contributions;
}

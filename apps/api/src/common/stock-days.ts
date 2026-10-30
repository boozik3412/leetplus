/**
 * Daily stock availability from inventory snapshots.
 *
 * Langame drops a SKU from the club's stock list when it runs out, so on a
 * day the club has a full snapshot a missing SKU snapshot means zero. A day
 * without a full snapshot for the club (sync gap, sync still running) repeats
 * the last known stock. A day counts as in stock when the stock was positive
 * or the SKU sold that day; a day before anything is known about the SKU's
 * stock counts as in stock too, so missing history never inflates demand.
 */

/** A club day is fully observed when it has this share of the previous one. */
const OBSERVED_DAY_SHARE = 0.8;

/** Fully observed days from snapshot counts per day (YYYY-MM-DD). */
export function observedDays(counts: ReadonlyMap<string, number>) {
  const result = new Set<string>();
  let previous: number | null = null;
  [...counts.keys()].sort().forEach((day) => {
    const count = counts.get(day)!;
    if (previous === null || count >= previous * OBSERVED_DAY_SHARE) {
      result.add(day);
      previous = count;
    }
  });
  return result;
}

/** Fully observed snapshot days of each club. */
export function observedDaysByStore(
  snapshots: Iterable<{ storeId: string; day: string }>,
) {
  const counts = new Map<string, Map<string, number>>();
  for (const snapshot of snapshots) {
    const storeDays = counts.get(snapshot.storeId) ?? new Map<string, number>();
    storeDays.set(snapshot.day, (storeDays.get(snapshot.day) ?? 0) + 1);
    counts.set(snapshot.storeId, storeDays);
  }
  return new Map(
    [...counts].map(([storeId, storeDays]) => [
      storeId,
      observedDays(storeDays),
    ]),
  );
}

/** Days of `days` on which the SKU was on stock or sold. */
export function countDaysInStock(input: {
  /** Calendar days, ascending, YYYY-MM-DD. */
  days: readonly string[];
  /** Fully observed snapshot days of the club. */
  storeDays: ReadonlySet<string>;
  /** Last known stock before the first day, if any. */
  before: number | null;
  /** The SKU's stock by snapshot day. */
  snapshots: ReadonlyMap<string, number>;
  /** Quantity sold on each of `days`. */
  sales: readonly number[];
}) {
  let carried = input.before;
  let daysInStock = 0;
  input.days.forEach((day, index) => {
    const snapshot = input.snapshots.get(day);
    if (snapshot !== undefined) {
      carried = snapshot;
    } else if (input.storeDays.has(day)) {
      carried = 0;
    }
    if (carried === null || carried > 0 || (input.sales[index] ?? 0) > 0) {
      daysInStock += 1;
    }
  });
  return daysInStock;
}

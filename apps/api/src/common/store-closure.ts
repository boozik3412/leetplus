/**
 * Owner-declared club closures, as club-local calendar days.
 *
 * A closure covers the days [closedFrom, reopenedOn): `closedFrom` is the first
 * closed day, `reopenedOn` the first day the club is open again, `null` while
 * the club is still closed. Days are `YYYY-MM-DD` strings, so plain string
 * comparison orders them.
 */
export type ClosurePeriod = {
  closedFrom: string;
  reopenedOn: string | null;
};

/** A club closure that touches the selected or the comparison period. */
export type ExecutiveClosure = {
  storeId: string;
  storeName: string;
  /** First closed day; may lie before the period. */
  closedFrom: string;
  /** First open day again, null while the club is closed. */
  reopenedOn: string | null;
  reason: string | null;
  /** Closed days inside the selected period. */
  closedDays: number;
  /** Closed days inside the comparison period (0 without comparison). */
  previousClosedDays: number;
  /** Days of the selected period. */
  periodDays: number;
};

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The ISO day of a database DATE value (midnight UTC). */
export function closureDay(value: Date) {
  return value.toISOString().slice(0, 10);
}

/** A real calendar day in `YYYY-MM-DD` form, else null. */
export function parseClosureDay(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = DAY_PATTERN.exec(value.trim());
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return date.getUTCFullYear() === Number(year) &&
    date.getUTCMonth() === Number(month) - 1 &&
    date.getUTCDate() === Number(day)
    ? `${year}-${month}-${day}`
    : null;
}

function dayNumber(day: string) {
  return Math.round(Date.parse(`${day}T00:00:00.000Z`) / DAY_MS);
}

export function addClosureDays(day: string, days: number) {
  return new Date(Date.parse(`${day}T00:00:00.000Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/** Two closures share at least one day. */
export function closuresOverlap(left: ClosurePeriod, right: ClosurePeriod) {
  return (
    (right.reopenedOn === null || left.closedFrom < right.reopenedOn) &&
    (left.reopenedOn === null || right.closedFrom < left.reopenedOn)
  );
}

/** Closed days of one club inside the inclusive range `from`..`to`. */
export function closedDaysInRange(
  closures: readonly ClosurePeriod[],
  from: string,
  to: string,
) {
  const end = dayNumber(to) + 1;
  const start = dayNumber(from);
  let closed = 0;
  for (const closure of closures) {
    const first = Math.max(start, dayNumber(closure.closedFrom));
    const last = Math.min(
      end,
      closure.reopenedOn === null ? end : dayNumber(closure.reopenedOn),
    );
    if (last > first) closed += last - first;
  }
  return closed;
}

/** Days of the inclusive range `from`..`to`. */
export function rangeDays(from: string, to: string) {
  return Math.max(0, dayNumber(to) - dayNumber(from) + 1);
}

/** Whether the club is closed on `day`. */
export function isClosedOn(closures: readonly ClosurePeriod[], day: string) {
  return closedDaysInRange(closures, day, day) > 0;
}

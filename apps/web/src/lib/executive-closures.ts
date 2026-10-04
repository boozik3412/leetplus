// Owner-declared club closures on the executive summary. No runtime imports so
// the node:test contract suite can load it directly.
import type { ExecutiveClosure, ExecutiveSummary } from "./dashboard-executive";

const DAY_MS = 86_400_000;

function dayNumber(day: string) {
  return Math.round(Date.parse(`${day}T00:00:00.000Z`) / DAY_MS);
}

export function addDays(day: string, days: number) {
  return new Date(Date.parse(`${day}T00:00:00.000Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/** Days of the inclusive range, 0 when it is empty or malformed. */
export function dayCount(from: string, to: string) {
  const count = dayNumber(to) - dayNumber(from) + 1;
  return Number.isFinite(count) ? Math.max(0, count) : 0;
}

function closuresOf(summary: ExecutiveSummary, storeId: string) {
  return (summary.closures ?? []).filter(
    (closure) => closure.storeId === storeId,
  );
}

/** The day belongs to the closure: [closedFrom, reopenedOn). */
export function closureCoversDay(
  closure: Pick<ExecutiveClosure, "closedFrom" | "reopenedOn">,
  day: string,
) {
  return (
    closure.closedFrom <= day &&
    (closure.reopenedOn === null || day < closure.reopenedOn)
  );
}

/** The declared closure of a club that covers the given day, if any. */
export function closureOnDay(
  summary: ExecutiveSummary,
  storeId: string,
  day: string,
): ExecutiveClosure | null {
  return (
    closuresOf(summary, storeId).find((closure) =>
      closureCoversDay(closure, day),
    ) ?? null
  );
}

/** Closed days of one club inside the inclusive range `from`..`to`. */
export function closedDaysIn(
  summary: ExecutiveSummary,
  storeId: string,
  from: string,
  to: string,
) {
  const start = dayNumber(from);
  const end = dayNumber(to) + 1;
  let closed = 0;
  for (const closure of closuresOf(summary, storeId)) {
    const first = Math.max(start, dayNumber(closure.closedFrom));
    const last = Math.min(
      end,
      closure.reopenedOn === null ? end : dayNumber(closure.reopenedOn),
    );
    if (last > first) closed += last - first;
  }
  return closed;
}

/** Clubs closed for at least one day of the selected period. */
export function closedClubIds(summary: ExecutiveSummary): Set<string> {
  return new Set(
    (summary.closures ?? [])
      .filter((closure) => closure.closedDays > 0)
      .map((closure) => closure.storeId),
  );
}

/** The latest closure of a club that touches the selected period, if any. */
export function clubClosure(
  summary: ExecutiveSummary,
  storeId: string,
): ExecutiveClosure | null {
  return (
    closuresOf(summary, storeId)
      .filter((closure) => closure.closedDays > 0)
      .toSorted((left, right) =>
        right.closedFrom.localeCompare(left.closedFrom),
      )[0] ?? null
  );
}

/** Every day of `from`..`to` is a declared closure day of the club. */
export function closedThroughout(
  summary: ExecutiveSummary,
  storeId: string,
  from: string,
  to: string,
) {
  const days = dayCount(from, to);
  return days > 0 && closedDaysIn(summary, storeId, from, to) >= days;
}

/** Link to the club's reopening form, prefilled with the first open day. */
export function reopenClubHref(storeId: string, reopenedOn: string) {
  const params = new URLSearchParams({ reopenClub: storeId, reopenedOn });
  return `/stores?${params}#club-${storeId}`;
}

/** Link to the club's closure form, prefilled with the first closed day. */
export function closeClubHref(storeId: string, closedFrom: string) {
  const params = new URLSearchParams({ closeClub: storeId, closedFrom });
  return `/stores?${params}#club-${storeId}`;
}

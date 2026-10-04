// Club closures on the «Клубы» page. No runtime imports beyond the pure
// executive helpers, so the node:test contract suite can load it directly.
import { addDays } from "./executive-closures.ts";
import { formatDay } from "./executive-format.ts";

export type StoreClosure = {
  id: string;
  storeId: string;
  /** First closed club-local day, YYYY-MM-DD. */
  closedFrom: string;
  /** First open day again; null while the club is closed. */
  reopenedOn: string | null;
  reason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ClosureStatus =
  | { kind: "OPEN" }
  | { kind: "CLOSED"; closure: StoreClosure }
  | { kind: "PLANNED"; closure: StoreClosure };

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

/** A YYYY-MM-DD query value that names a real day, else null. */
export function validDay(value: string | null | undefined) {
  if (!value || !DAY_PATTERN.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
    ? value
    : null;
}

/** Today's calendar day in the club's time zone (UTC when it is unknown). */
export function clubToday(
  timeZone: string | null | undefined,
  now = new Date(),
) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/** Closures of one club, newest first. */
export function closuresOfStore(
  closures: readonly StoreClosure[],
  storeId: string,
) {
  return closures
    .filter((closure) => closure.storeId === storeId)
    .toSorted((left, right) => right.closedFrom.localeCompare(left.closedFrom));
}

/** Whether the club is closed today, has a closure ahead, or is open. */
export function closureStatus(
  closures: readonly StoreClosure[],
  today: string,
): ClosureStatus {
  const current = closures.find(
    (closure) =>
      closure.closedFrom <= today &&
      (closure.reopenedOn === null || today < closure.reopenedOn),
  );
  if (current) return { kind: "CLOSED", closure: current };
  const planned = closures
    .filter((closure) => closure.closedFrom > today)
    .toSorted((left, right) => left.closedFrom.localeCompare(right.closedFrom))[0];
  return planned ? { kind: "PLANNED", closure: planned } : { kind: "OPEN" };
}

/** «29.09 – по сей день» / «25.09 – 27.09»: the last closed day, not the reopening. */
export function closurePeriodText(closure: StoreClosure) {
  return closure.reopenedOn
    ? `${formatDay(closure.closedFrom)} – ${formatDay(addDays(closure.reopenedOn, -1))}`
    : `${formatDay(closure.closedFrom)} – по сей день`;
}

/** One line for the club card: «Закрыт с 29.09», «Закрыт с 29.09, откроется 05.10», … */
export function closureHeadline(status: ClosureStatus) {
  if (status.kind === "OPEN") return "Клуб работает";
  const { closure } = status;
  const from = formatDay(closure.closedFrom);
  const until = closure.reopenedOn
    ? `, откроется ${formatDay(closure.reopenedOn)}`
    : "";
  return status.kind === "CLOSED"
    ? `Закрыт с ${from}${until}`
    : `Закрытие запланировано с ${from}${until}`;
}

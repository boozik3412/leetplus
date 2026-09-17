import type {
  ExecutiveAppliedScope,
  ExecutiveQuery,
  ExecutiveSummary,
} from "./dashboard-executive";

export type ExecutiveHistory = {
  scope: ExecutiveAppliedScope;
  data: ExecutiveSummary | null;
};

function shiftDay(date: string, offset: number) {
  const shifted = new Date(`${date}T00:00:00.000Z`);
  shifted.setUTCDate(shifted.getUTCDate() + offset);
  return shifted.toISOString().slice(0, 10);
}

export function executiveScopeMatches(
  expected: ExecutiveAppliedScope,
  actual: ExecutiveAppliedScope,
) {
  const ids = (scope: ExecutiveAppliedScope) =>
    [...scope.storeIds].toSorted().join("\u0000");
  const zones = (scope: ExecutiveAppliedScope) =>
    JSON.stringify(Object.entries(scope.storeTimeZones).toSorted());
  return (
    expected.period.from === actual.period.from &&
    expected.period.to === actual.period.to &&
    expected.period.timezone === actual.period.timezone &&
    expected.asOf === actual.asOf &&
    ids(expected) === ids(actual) &&
    zones(expected) === zones(actual) &&
    (expected.comparison === null
      ? actual.comparison === null
      : expected.comparison.from === actual.comparison?.from &&
        expected.comparison.to === actual.comparison?.to)
  );
}

export async function loadExecutiveHistory(
  period: string | undefined,
  summary: ExecutiveSummary,
  fetchSummary: (query: ExecutiveQuery) => Promise<ExecutiveSummary>,
): Promise<ExecutiveHistory | undefined> {
  if (period !== "full-day") return undefined;

  // Use accepted business-date labels, never the browser clock or last fact date.
  const to = summary.scope.period.to;
  const scope: ExecutiveAppliedScope = {
    ...summary.scope,
    period: { ...summary.scope.period, from: shiftDay(to, -20), to },
    comparison: summary.scope.comparison
      ? { from: shiftDay(to, -41), to: shiftDay(to, -21) }
      : null,
  };
  try {
    const data = await fetchSummary({
      period: "custom",
      dateFrom: scope.period.from,
      dateTo: scope.period.to,
      storeIds: scope.storeIds,
      asOf: scope.asOf,
      comparison: scope.comparison !== null,
    });
    const completeAxis =
      data.days.length === 21 &&
      data.days.every((day, index) => day.date === shiftDay(to, index - 20));
    return {
      scope,
      data:
        executiveScopeMatches(scope, data.scope) && completeAxis ? data : null,
    };
  } catch {
    // The daily result remains usable; do not pretend its one point is history.
    return { scope, data: null };
  }
}

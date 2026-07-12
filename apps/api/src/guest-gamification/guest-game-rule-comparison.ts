export type GuestGameComparisonVerdict =
  | 'MATCH'
  | 'MISMATCH'
  | 'NOT_EVALUATED'
  | 'INSUFFICIENT_SOURCE_DATA'
  | 'STALE_SOURCE'
  | 'ERROR';

export type GuestGameComparisonSourceFreshness = 'FRESH' | 'STALE' | 'MISSING';

export type GuestGameComparableDecision = {
  status: string;
  reasons?: unknown;
  blockers?: unknown;
};

export function compareGuestGameRuleDecisionPair(options: {
  live: GuestGameComparableDecision | null;
  shadow: GuestGameComparableDecision | null;
  sourceFreshness: GuestGameComparisonSourceFreshness;
}) {
  const { live, shadow, sourceFreshness } = options;

  if (!live) {
    return {
      verdict: 'NOT_EVALUATED' as const,
      differingConditions: [] as string[],
    };
  }

  if (!shadow) {
    return {
      verdict:
        sourceFreshness === 'STALE'
          ? ('STALE_SOURCE' as const)
          : sourceFreshness === 'MISSING'
            ? ('INSUFFICIENT_SOURCE_DATA' as const)
            : ('NOT_EVALUATED' as const),
      differingConditions: [] as string[],
    };
  }

  if (live.status === 'ERROR' || shadow.status === 'ERROR') {
    return {
      verdict: 'ERROR' as const,
      differingConditions: decisionSignalDifference(live, shadow),
    };
  }

  if (shadow.status === 'INSUFFICIENT_DATA' || shadow.status === 'NO_MATCH') {
    return {
      verdict: 'INSUFFICIENT_SOURCE_DATA' as const,
      differingConditions: decisionSignalDifference(live, shadow),
    };
  }

  const liveOutcome = normalizeOutcome(live.status);
  const shadowOutcome = normalizeOutcome(shadow.status);

  return {
    verdict:
      liveOutcome === shadowOutcome
        ? ('MATCH' as const)
        : ('MISMATCH' as const),
    differingConditions: decisionSignalDifference(live, shadow),
  };
}

function normalizeOutcome(status: string) {
  if (status === 'MATCHED') {
    return 'MATCHED';
  }
  if (status === 'BLOCKED' || status === 'NO_MATCH') {
    return 'BLOCKED';
  }
  return status;
}

function decisionSignalDifference(
  live: GuestGameComparableDecision,
  shadow: GuestGameComparableDecision,
) {
  const liveSignals = decisionSignals(live);
  const shadowSignals = decisionSignals(shadow);

  return [...new Set([...liveSignals, ...shadowSignals])].filter(
    (signal) =>
      !liveSignals.includes(signal) || !shadowSignals.includes(signal),
  );
}

function decisionSignals(decision: GuestGameComparableDecision) {
  return [...stringArray(decision.blockers), ...stringArray(decision.reasons)]
    .map((value) => value.trim())
    .filter(Boolean)
    .sort();
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

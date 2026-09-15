export type ExecutiveRevenueKind = 'SERVICE' | 'PRODUCT' | 'TOPUP' | 'UNKNOWN';

export type ExecutiveRevenueComponent = {
  kind: ExecutiveRevenueKind;
  value: number | null;
  state: 'AVAILABLE' | 'PARTIAL' | 'MISSING' | 'STALE' | 'FAILED';
};

export function aggregateExecutiveRevenue(
  components: readonly ExecutiveRevenueComponent[],
): { value: number | null; state: ExecutiveRevenueComponent['state'] } {
  const revenueComponents = components.filter(
    (component) => component.kind === 'SERVICE' || component.kind === 'PRODUCT',
  );
  const confirmed = revenueComponents.filter(
    (component) =>
      (component.state === 'AVAILABLE' || component.state === 'PARTIAL') &&
      component.value !== null,
  );
  const hasMissing = revenueComponents.some(
    (component) =>
      component.state === 'MISSING' || component.state === 'FAILED',
  );

  if (confirmed.length === 0) {
    return {
      value: null,
      state: revenueComponents.some((component) => component.state === 'FAILED')
        ? 'FAILED'
        : 'MISSING',
    };
  }

  return {
    value: round(
      confirmed.reduce((total, component) => total + component.value!, 0),
    ),
    state:
      hasMissing || confirmed.some((component) => component.state === 'PARTIAL')
        ? 'PARTIAL'
        : 'AVAILABLE',
  };
}

export function compareExecutiveValues(
  value: number | null,
  previousValue: number | null,
): { absoluteDelta: number | null; percentDelta: number | null } {
  if (value === null || previousValue === null) {
    return { absoluteDelta: null, percentDelta: null };
  }

  return {
    absoluteDelta: round(value - previousValue),
    percentDelta:
      previousValue === 0
        ? null
        : round(((value - previousValue) / Math.abs(previousValue)) * 100),
  };
}

function round(value: number) {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

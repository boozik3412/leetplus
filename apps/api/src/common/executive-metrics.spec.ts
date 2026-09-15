import {
  aggregateExecutiveRevenue,
  compareExecutiveValues,
} from './executive-metrics';

describe('executive metric calculations', () => {
  it('aggregates compatible confirmed service and product revenue without topups', () => {
    const revenue = aggregateExecutiveRevenue([
      { kind: 'SERVICE', value: 8000, state: 'AVAILABLE' },
      { kind: 'PRODUCT', value: 2000, state: 'AVAILABLE' },
      { kind: 'SERVICE', value: 18000, state: 'AVAILABLE' },
      { kind: 'PRODUCT', value: 12000, state: 'AVAILABLE' },
      { kind: 'TOPUP', value: 3000, state: 'AVAILABLE' },
      { kind: 'UNKNOWN', value: -900, state: 'AVAILABLE' },
    ]);

    expect(revenue).toEqual({ value: 40000, state: 'AVAILABLE' });
    expect(compareExecutiveValues(40000, 0)).toEqual({
      absoluteDelta: 40000,
      percentDelta: null,
    });
  });
});

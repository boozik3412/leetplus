import { decomposeBarRevenue, driverFactors } from './executive-drivers';

const factors = (
  barRevenue: number | null,
  purchases: number | null,
  visits: number | null,
  extra: Partial<Parameters<typeof driverFactors>[0]> = {},
) =>
  driverFactors({
    barRevenue,
    totalBarRevenue: barRevenue,
    purchases,
    visits,
    guests: null,
    playedHours: null,
    capacityHours: null,
    ...extra,
  });

describe('executive revenue drivers', () => {
  it('derives purchase, conversion, frequency and load estimate', () => {
    const result = factors(75_220, 268, 979, {
      guests: 256,
      playedHours: 1_998,
      capacityHours: 46 * 24 * 7,
    });

    expect(result).toMatchObject({
      averagePurchase: 281,
      purchasesPerVisit: 27.4,
      visitsPerGuest: 3.82,
      playedHours: 1_998,
      loadEstimate: 25.9,
    });
  });

  it('splits the change into traffic, conversion and check that sum exactly', () => {
    // 1337 Радищева, 16–22.09 → 23–29.09.
    const contributions = decomposeBarRevenue(
      factors(75_220, 268, 979),
      factors(61_467, 227, 839),
    );

    expect(contributions?.map((item) => item.factor)).toEqual([
      'VISITS',
      'CONVERSION',
      'CHECK',
    ]);
    const [traffic, conversion, check] = contributions!.map(
      (item) => item.amount,
    );
    expect(traffic + conversion + check).toBe(75_220 - 61_467);
    expect(traffic).toBeGreaterThan(10_000);
    expect(conversion).toBeGreaterThan(0);
    expect(check).toBeGreaterThan(2_000);
  });

  it('falls back to purchases × check without comparable visits', () => {
    // 1337-Пушкинская: sessions of the shared domain are not bound to it.
    const contributions = decomposeBarRevenue(
      factors(77_561, 275, null),
      factors(72_467, 231, null),
    );

    expect(contributions?.map((item) => item.factor)).toEqual([
      'PURCHASES',
      'CHECK',
    ]);
    const [purchases, check] = contributions!.map((item) => item.amount);
    expect(purchases).toBeGreaterThan(0);
    expect(check).toBeLessThan(0);
    expect(purchases + check).toBe(77_561 - 72_467);
  });

  it('does not invent a split for missing or zero periods', () => {
    expect(
      decomposeBarRevenue(factors(0, 0, 10), factors(100, 2, 10)),
    ).toBeNull();
    expect(
      decomposeBarRevenue(factors(100, 2, 10), factors(null, null, 10)),
    ).toBeNull();
    expect(factors(null, null, null)).toMatchObject({
      averagePurchase: null,
      purchasesPerVisit: null,
      loadEstimate: null,
    });
  });

  it('keeps an unchanged revenue split well-defined', () => {
    const contributions = decomposeBarRevenue(
      factors(1_000, 10, 100),
      factors(1_000, 5, 50),
    );

    expect(contributions!.reduce((sum, item) => sum + item.amount, 0)).toBe(0);
    expect(
      contributions!.find((item) => item.factor === 'CONVERSION')?.amount,
    ).toBe(0);
  });
});

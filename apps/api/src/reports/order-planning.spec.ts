import {
  buildOrderPlanningRows,
  roundToMultiplicity,
  type OrderPlanningInput,
} from './order-planning';

const days = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'];
const now = new Date('2026-10-05T06:00:00.000Z');

function product(
  id: string,
  overrides: Partial<OrderPlanningInput['products'][number]> = {},
) {
  return {
    id,
    article: `A-${id}`,
    name: `Товар ${id}`,
    canonicalProductId: null,
    canonicalName: null,
    categoryName: 'Напитки',
    supplierName: 'Поставщик',
    orderMultiplicity: null,
    purchasePrice: 50,
    ...overrides,
  };
}

function snapshot(
  productId: string,
  day: string,
  quantity: number,
  storeId = 'store-1',
) {
  return {
    storeId,
    productId,
    day,
    quantity,
    observedAt: new Date(`${day}T05:00:00.000Z`),
  };
}

function sale(productId: string, day: string, quantity: number) {
  return {
    storeId: 'store-1',
    productId,
    day,
    quantity,
    revenue: quantity * 100,
  };
}

function input(overrides: Partial<OrderPlanningInput>): OrderPlanningInput {
  return {
    now,
    days,
    coverDays: 7,
    stores: [{ id: 'store-1', name: 'Клуб 1' }],
    products: [
      product('p1'),
      product('p2'),
      ...fillerIds.map((id) => product(id)),
    ],
    sales: [],
    snapshots: [],
    ...overrides,
  };
}

// Other SKUs of the club keep every day fully observed.
const fillerIds = Array.from({ length: 10 }, (_, index) => `f${index}`);
const filler = [...days, '2026-10-05'].flatMap((day) =>
  fillerIds.map((id) => snapshot(id, day, 0)),
);

describe('buildOrderPlanningRows', () => {
  it('averages demand over in-stock days and orders up to the cover', () => {
    const rows = buildOrderPlanningRows(
      input({
        snapshots: [
          ...filler,
          snapshot('p1', '2026-10-01', 6),
          snapshot('p1', '2026-10-02', 2),
          // Out of stock on 03 and 04: the SKU drops out of the stock list.
          snapshot('p1', '2026-10-05', 1),
        ],
        sales: [sale('p1', '2026-10-01', 4), sale('p1', '2026-10-02', 2)],
      }),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      productId: 'p1',
      dailySales: [4, 2, 0, 0],
      soldQuantity: 6,
      daysInStock: 2,
      daysOutOfStock: 2,
      averageDailySales: 3,
      stockQuantity: 1,
      stockDaysLeft: 0.3,
      need: 20,
      recommendedOrder: 20,
      orderAmount: 1000,
      status: 'CRITICAL',
      lowData: true,
    });
  });

  it('skips SKUs that had no stock in the window and none now', () => {
    const rows = buildOrderPlanningRows(
      input({
        snapshots: [
          ...filler,
          snapshot('p1', '2026-10-01', 0),
          snapshot('p2', '2026-09-20', 5),
        ],
      }),
    );

    expect(rows).toEqual([]);
  });

  it('carries stock over days without a club snapshot and reports no sales', () => {
    const rows = buildOrderPlanningRows(
      input({
        snapshots: [snapshot('p1', '2026-09-28', 3)],
      }),
    );

    expect(rows[0]).toMatchObject({
      daysInStock: 4,
      averageDailySales: 0,
      stockQuantity: 3,
      need: 0,
      recommendedOrder: 0,
      status: 'NO_SALES',
      stockStale: true,
    });
  });

  it('treats a partial club day as a sync gap, not as zero stock', () => {
    const others = Array.from({ length: 10 }, (_, index) => `o${index}`);
    const rows = buildOrderPlanningRows(
      input({
        products: [product('p1'), ...others.map((id) => product(id))],
        snapshots: [
          ...days.flatMap((day) => [
            snapshot('p1', day, 10),
            ...others.map((id) => snapshot(id, day, 0)),
          ]),
          // Today's sync has written only two SKUs so far.
          ...others.slice(0, 2).map((id) => snapshot(id, '2026-10-05', 0)),
        ],
        sales: days.map((day) => sale('p1', day, 1)),
      }),
    );

    expect(rows[0]).toMatchObject({
      productId: 'p1',
      stockQuantity: 10,
      status: 'OK',
    });
  });

  it('marks sold SKUs without any stock record as unknown stock', () => {
    const rows = buildOrderPlanningRows(
      input({
        snapshots: filler,
        sales: [sale('p2', '2026-10-03', 2)],
      }),
    );

    expect(rows[0]).toMatchObject({
      productId: 'p2',
      stockQuantity: null,
      recommendedOrder: 0,
      status: 'NO_STOCK_DATA',
    });
  });

  it('leaves excluded SKUs out', () => {
    const rows = buildOrderPlanningRows(
      input({
        snapshots: [...filler, snapshot('p1', '2026-10-05', 4)],
        excludedProductIds: new Set(['p1']),
      }),
    );

    expect(rows).toEqual([]);
  });

  it('prefers the club purchase price and keeps the canonical group', () => {
    const rows = buildOrderPlanningRows(
      input({
        products: [
          product('p1', {
            canonicalProductId: 'c1',
            canonicalName: 'Кола 0,5',
            orderMultiplicity: 12,
          }),
          ...fillerIds.map((id) => product(id)),
        ],
        snapshots: [
          ...filler,
          ...days.map((day) => snapshot('p1', day, 10)),
          snapshot('p1', '2026-10-05', 10),
        ],
        sales: days.map((day) => sale('p1', day, 2)),
        clubPurchasePrices: new Map([['store-1:p1', 40]]),
      }),
    );

    expect(rows[0]).toMatchObject({
      groupKey: 'c1',
      groupName: 'Кола 0,5',
      averageDailySales: 2,
      need: 4,
      recommendedOrder: 12,
      unitCost: 40,
      orderAmount: 480,
      status: 'ORDER',
    });
  });
});

describe('roundToMultiplicity', () => {
  it('rounds up to whole units and to the supplier multiplicity', () => {
    expect(roundToMultiplicity(0, 6)).toBe(0);
    expect(roundToMultiplicity(3.0000000004, null)).toBe(3);
    expect(roundToMultiplicity(3.2, 1)).toBe(4);
    expect(roundToMultiplicity(7, 6)).toBe(12);
  });
});

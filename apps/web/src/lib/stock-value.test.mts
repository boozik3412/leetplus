import assert from "node:assert/strict";
import test from "node:test";

import type { OrderPlanningRow } from "./reports.ts";
import {
  buildStockValueRows,
  groupStockValueRows,
  matchesStockValueView,
  stockValueTotals,
} from "./stock-value.ts";

const DAYS = ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04"];

function planningRow(overrides: Partial<OrderPlanningRow>): OrderPlanningRow {
  return {
    storeId: "store-a",
    storeName: "Club A",
    productId: "cola",
    article: "001",
    name: "Cola",
    groupKey: "cola",
    groupName: "Cola",
    categoryName: "Напитки",
    supplierName: "Supplier",
    orderMultiplicity: null,
    unitCost: 50,
    dailySales: [0, 0, 0, 0],
    soldQuantity: 0,
    soldLast7Days: 0,
    revenue: 0,
    daysInStock: 4,
    daysOutOfStock: 0,
    averageDailySales: 0,
    stockQuantity: 10,
    stockObservedAt: "2026-11-05T00:00:00.000Z",
    stockStale: false,
    stockDaysLeft: null,
    need: 0,
    recommendedOrder: 0,
    orderAmount: null,
    lowData: false,
    status: "NO_SALES",
    ...overrides,
  };
}

test("values stock, finds the last sale and the stock that will not sell in time", () => {
  const [row] = buildStockValueRows(
    [
      planningRow({
        dailySales: [2, 1, 0, 0],
        soldQuantity: 3,
        revenue: 300,
        averageDailySales: 0.75,
        stockQuantity: 40,
        stockDaysLeft: 53.3,
        status: "EXCESS",
      }),
    ],
    DAYS,
    30,
  );

  assert.equal(row.stockValue, 2000);
  assert.equal(row.lastSaleDay, "2026-11-02");
  assert.equal(row.daysWithoutSales, 2);
  // 40 on stock, 0.75 × 30 = 22.5 will sell, 17.5 is excess.
  assert.equal(row.excessQuantity, 17.5);
  assert.equal(row.excessValue, 875);
  assert.equal(row.lostProfitPerDay, null);
});

test("treats a SKU without sales in the window as fully excess and frozen", () => {
  const rows = buildStockValueRows([planningRow({})], DAYS, 30);

  assert.equal(rows[0].daysWithoutSales, null);
  assert.equal(rows[0].excessQuantity, 10);
  assert.ok(matchesStockValueView(rows[0], "frozen", 21));
  assert.ok(matchesStockValueView(rows[0], "excess", 21));
  assert.equal(stockValueTotals(rows, 21).frozenValue, 500);
});

test("counts lost profit only for selling SKUs that are out of stock", () => {
  const rows = buildStockValueRows(
    [
      planningRow({
        productId: "chips",
        dailySales: [2, 2, 0, 0],
        soldQuantity: 4,
        revenue: 400,
        averageDailySales: 2,
        daysInStock: 2,
        daysOutOfStock: 2,
        stockQuantity: 0,
        status: "OUT_OF_STOCK",
      }),
      // Out of stock and not selling: not money, left out.
      planningRow({ productId: "gum", stockQuantity: 0 }),
      // Unknown stock: left out.
      planningRow({ productId: "water", stockQuantity: null }),
    ],
    DAYS,
    30,
  );

  assert.equal(rows.length, 1);
  // Price 100, cost 50: 2 a day × 50 profit = 100 a day, 2 days out of stock.
  assert.equal(rows[0].lostProfitPerDay, 100);
  assert.equal(rows[0].lostProfit, 200);
  assert.ok(matchesStockValueView(rows[0], "lost-profit", 21));
  assert.ok(!matchesStockValueView(rows[0], "all", 21));
});

test("keeps an unknown purchase price visible instead of counting it as zero", () => {
  const rows = buildStockValueRows(
    [
      planningRow({ unitCost: null }),
      planningRow({
        productId: "water",
        storeId: "store-b",
        storeName: "Club B",
      }),
    ],
    DAYS,
    30,
  );
  const totals = stockValueTotals(rows, 21);

  assert.equal(rows[0].stockValue, null);
  assert.equal(totals.stockValue, 500);
  assert.equal(totals.unpriced, 1);
  assert.equal(totals.inStock, 2);
  assert.deepEqual(
    groupStockValueRows(rows, "store").map((group) => [
      group.label,
      group.stockValue,
      group.unpriced,
    ]),
    [
      ["Club A", 0, 1],
      ["Club B", 500, 0],
    ],
  );
});

test("frozen view respects the chosen number of days without sales", () => {
  const [row] = buildStockValueRows(
    [
      planningRow({
        dailySales: [1, 0, 0, 0],
        soldQuantity: 1,
        revenue: 100,
        averageDailySales: 0.25,
      }),
    ],
    DAYS,
    30,
  );

  assert.equal(row.daysWithoutSales, 3);
  assert.ok(matchesStockValueView(row, "frozen", 3));
  assert.ok(!matchesStockValueView(row, "frozen", 7));
});

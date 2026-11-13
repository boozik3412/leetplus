import assert from "node:assert/strict";
import test from "node:test";

import type { SkuPerformanceRow } from "./reports.ts";
import {
  abcParetoPoints,
  abcRevenueGroupTotals,
  buildAbcMatrix,
  buildAbcRatingRows,
  defaultAbcCell,
  isAbcCellKey,
} from "./abc-rating.ts";

function skuRow(overrides: Partial<SkuPerformanceRow>): SkuPerformanceRow {
  return {
    productId: "cola",
    article: "001",
    name: "Cola",
    isCanonical: false,
    canonicalProductName: null,
    categoryName: "Напитки",
    supplierName: null,
    facing: 1,
    soldQuantity: 10,
    revenue: 1000,
    cost: 500,
    unitCost: 50,
    grossProfit: 500,
    marginPercent: 50,
    markupPercent: 100,
    revenueSharePercent: 10,
    profitSharePercent: 10,
    salesPerFacing: 10,
    profitPerFacing: 500,
    abcRevenueGroup: "A",
    abcProfitGroup: "A",
    ...overrides,
  };
}

test("ranks by revenue, keeps a running share and rounds the margin", () => {
  const rows = buildAbcRatingRows([
    skuRow({
      productId: "chips",
      name: "Chips",
      revenue: 300,
      grossProfit: 100,
    }),
    skuRow({
      productId: "bun",
      name: " Bun ",
      revenue: 700,
      grossProfit: 408.24,
      categoryName: null,
    }),
  ]);

  assert.deepEqual(
    rows.map((row) => [row.rank, row.name, row.cumulativeRevenuePercent]),
    [
      [1, "Bun", 70],
      [2, "Chips", 100],
    ],
  );
  // 408.24 / 700 = 58.32…%, shown with one decimal.
  assert.equal(rows[0].marginPercent, 58.3);
  assert.equal(rows[0].categoryName, "Без категории");
});

test("flags sold products without a purchase price", () => {
  const [rental, cola] = buildAbcRatingRows([
    skuRow({
      productId: "rental",
      name: "Rental",
      revenue: 2000,
      cost: 0,
      grossProfit: 2000,
    }),
    skuRow({}),
  ]);

  assert.equal(rental.costMissing, true);
  assert.equal(rental.marginPercent, 100);
  assert.equal(cola.costMissing, false);
});

test("builds the nine revenue × profit cells and opens the biggest mismatch", () => {
  const rows = buildAbcRatingRows([
    skuRow({
      productId: "a",
      revenue: 900,
      abcRevenueGroup: "A",
      abcProfitGroup: "A",
    }),
    skuRow({
      productId: "b",
      revenue: 300,
      abcRevenueGroup: "A",
      abcProfitGroup: "C",
    }),
    skuRow({
      productId: "c",
      revenue: 200,
      abcRevenueGroup: "B",
      abcProfitGroup: "A",
    }),
    skuRow({
      productId: "d",
      revenue: 50,
      abcRevenueGroup: "C",
      abcProfitGroup: "C",
    }),
  ]);
  const cells = buildAbcMatrix(rows);

  assert.equal(cells.length, 9);
  assert.deepEqual(
    cells.slice(0, 3).map((cell) => [cell.key, cell.count]),
    [
      ["AA", 1],
      ["BA", 1],
      ["CA", 0],
    ],
  );
  assert.equal(cells.find((cell) => cell.key === "AC")?.revenue, 300);
  assert.equal(defaultAbcCell(cells), "AC");
  assert.equal(
    defaultAbcCell(buildAbcMatrix(rows.filter((row) => row.cell === "AA"))),
    "AA",
  );
});

test("sums revenue groups and draws the Pareto curve from 0 to 100", () => {
  const rows = buildAbcRatingRows([
    skuRow({ productId: "a", revenue: 800, grossProfit: 400 }),
    skuRow({
      productId: "b",
      revenue: 150,
      grossProfit: 50,
      abcRevenueGroup: "B",
    }),
    skuRow({
      productId: "c",
      revenue: 50,
      grossProfit: 50,
      abcRevenueGroup: "C",
    }),
  ]);

  assert.deepEqual(
    abcRevenueGroupTotals(rows).map((group) => [
      group.group,
      group.count,
      group.revenueSharePercent,
      group.profitSharePercent,
    ]),
    [
      ["A", 1, 80, 80],
      ["B", 1, 15, 10],
      ["C", 1, 5, 10],
    ],
  );
  assert.deepEqual(abcParetoPoints(rows), [
    { x: 0, y: 0 },
    { x: 33.3, y: 80 },
    { x: 66.7, y: 95 },
    { x: 100, y: 100 },
  ]);
  assert.equal(abcParetoPoints(rows, 2).at(-1)?.x, 100);
});

test("accepts only real cell keys from the address", () => {
  assert.ok(isAbcCellKey("AC"));
  assert.ok(!isAbcCellKey("AD"));
  assert.ok(!isAbcCellKey("A"));
  assert.ok(!isAbcCellKey(undefined));
});

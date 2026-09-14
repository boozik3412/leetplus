import assert from "node:assert/strict";
import test from "node:test";

import { buildAssortmentRiskSummary } from "./assortment-risk.ts";
import type { ProductWithoutSales } from "./reports.ts";

const knownNoSalesRow: ProductWithoutSales = {
  productId: "product-a",
  storeId: "store-a",
  storeName: "Клуб A",
  article: "A-1",
  name: "Напиток",
  isCanonical: false,
  canonicalProductName: null,
  stockQuantity: 2,
  frozenStockUnitValue: 50,
  frozenStockValuation: "CLUB_PURCHASE_PRICE",
  frozenStockAmount: 100,
  lastSaleDate: null,
  daysWithoutSales: 21,
  categoryName: null,
  supplierName: null,
};

test("does not turn an omitted stale risk row set into confirmed zero", () => {
  const summary = buildAssortmentRiskSummary({
    oosRows: [],
    noSalesRows: [],
    oosState: "STALE",
    noSalesState: "MISSING",
  });

  assert.equal(summary.oosProfitAtRisk, null);
  assert.equal(summary.frozenStockAmount, null);
  assert.equal(summary.totalRiskAmount, null);
  assert.equal(summary.state, "PARTIAL");
});

test("keeps a known empty set at zero and retains known frozen value", () => {
  const summary = buildAssortmentRiskSummary({
    oosRows: [],
    noSalesRows: [knownNoSalesRow],
    oosState: "AVAILABLE",
    noSalesState: "PARTIAL",
  });

  assert.equal(summary.oosProfitAtRisk, 0);
  assert.equal(summary.frozenStockAmount, 100);
  assert.equal(summary.totalRiskAmount, null);
  assert.equal(summary.state, "PARTIAL");
});

test("keeps two confirmed empty row sets at zero", () => {
  const summary = buildAssortmentRiskSummary({
    oosRows: [],
    noSalesRows: [],
    oosState: "AVAILABLE",
    noSalesState: "AVAILABLE",
  });

  assert.equal(summary.totalRiskAmount, 0);
  assert.equal(summary.state, "AVAILABLE");
});

test("does not invent frozen value when its price is missing", () => {
  const summary = buildAssortmentRiskSummary({
    oosRows: [],
    noSalesRows: [
      {
        ...knownNoSalesRow,
        frozenStockUnitValue: null,
        frozenStockAmount: null,
      },
    ],
    oosState: "AVAILABLE",
    noSalesState: "PARTIAL",
  });

  assert.equal(summary.frozenStockAmount, null);
  assert.equal(summary.totalRiskAmount, null);
  assert.equal(summary.state, "PARTIAL");
});

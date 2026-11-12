import assert from "node:assert/strict";
import test from "node:test";

import { buildMoneyLossReport } from "./money-loss-report.ts";
import type {
  AssortmentMatrixRow,
  OutOfStockRiskProduct,
  ProductWithoutSales,
  ReportRecommendation,
} from "./reports.ts";

function oos(
  name: string,
  grossProfitAtRiskForPeriod: number | null,
): OutOfStockRiskProduct {
  return {
    productId: `p-${name}`,
    storeId: "s1",
    storeName: "Клуб 1",
    article: name,
    name,
    isCanonical: false,
    canonicalProductName: null,
    categoryName: null,
    supplierId: null,
    supplierName: null,
    stockQuantity: 1,
    averageDailySales: 2,
    revenueAtRiskPerDay: null,
    grossProfitAtRiskPerDay: null,
    grossProfitAtRiskForPeriod,
    stockDays: 0.5,
  };
}

function frozen(name: string, amount: number | null): ProductWithoutSales {
  return {
    productId: `p-${name}`,
    storeId: "s1",
    storeName: "Клуб 1",
    article: name,
    name,
    isCanonical: false,
    canonicalProductName: null,
    stockQuantity: 3,
    frozenStockUnitValue: amount === null ? null : amount / 3,
    frozenStockValuation: amount === null ? "UNKNOWN" : "PURCHASE_PRICE",
    frozenStockAmount: amount,
    lastSaleDate: null,
    daysWithoutSales: 30,
    categoryName: null,
    supplierName: null,
  };
}

function cell(
  productId: string,
  storeId: string,
  patch: Partial<AssortmentMatrixRow>,
): AssortmentMatrixRow {
  return {
    id: `${storeId}:${productId}`,
    productId,
    canonicalProductId: null,
    storeId,
    storeName: storeId,
    article: productId,
    name: productId,
    categoryId: null,
    categoryName: null,
    supplierId: null,
    supplierName: null,
    assortmentRole: "CORE",
    isMandatory: true,
    existsInStore: true,
    isSold: true,
    inStock: true,
    noSales: false,
    needsReplenishment: false,
    status: "SOLD",
    stockQuantity: 5,
    soldQuantity: 10,
    revenue: 1000,
    grossProfit: 400,
    averageDailySales: 1,
    stockDays: 5,
    qualityPoints: 1,
    qualityMaxPoints: 1,
    ...patch,
  };
}

function recommendation(
  id: string,
  effectAmount: number,
  status: ReportRecommendation["status"] = "NEW",
): ReportRecommendation {
  return {
    id,
    kind: "REPLENISH_STOCK",
    severity: "HIGH",
    role: "BUYER",
    status,
    statusNote: null,
    statusChangedAt: null,
    effectType: "PROFIT_PROTECTION",
    effectLabel: "Прибыль",
    effectAmount,
    effectUnit: "RUB",
    effectDescription: "",
    title: id,
    description: "",
    action: "",
    productId: "p",
    storeId: null,
    storeName: null,
    article: "a",
    productName: "p",
    metricLabel: "",
    metricValue: "",
  };
}

test("counts what can be valued instead of blanking the whole figure", () => {
  const report = buildMoneyLossReport({
    outOfStockRows: [oos("cola", 500), oos("chips", null)],
    noSalesRows: [frozen("gum", 300), frozen("old", null)],
    writeOffAmount: 120,
    recommendations: [],
    matrixRows: [cell("cola", "s1", {})],
  });

  const deficit = report.parts.find((part) => part.key === "deficit");
  assert.equal(deficit?.amount, 500);
  assert.equal(deficit?.unvaluedCount, 1);
  assert.equal(report.totalLoss, 620);
  assert.deepEqual(report.frozen, {
    amount: 300,
    skuCount: 2,
    unvaluedCount: 1,
  });
  const gap = report.gaps.find((item) => item.key === "missingCost");
  assert.match(gap?.text ?? "", /У 2 товаров нет входящей цены/);
});

test("values a missing mandatory product by its median profit in other clubs", () => {
  const report = buildMoneyLossReport({
    outOfStockRows: [],
    noSalesRows: [],
    writeOffAmount: 0,
    recommendations: [],
    matrixRows: [
      cell("cola", "s1", { grossProfit: 300 }),
      cell("cola", "s2", { grossProfit: 500 }),
      cell("cola", "s3", { grossProfit: 900 }),
      cell("cola", "s4", {
        status: "MISSING",
        existsInStore: false,
        isSold: false,
        grossProfit: 0,
      }),
      // optional products never count as a loss
      cell("tea", "s4", {
        isMandatory: false,
        status: "MISSING",
        existsInStore: false,
        isSold: false,
      }),
      // mandatory but sold nowhere: known, not valued
      cell("new", "s1", {
        status: "MISSING",
        existsInStore: false,
        isSold: false,
        grossProfit: 0,
      }),
    ],
  });

  const missing = report.parts.find((part) => part.key === "missingMandatory");
  assert.equal(missing?.amount, 500);
  assert.equal(missing?.valuedCount, 1);
  assert.equal(missing?.unvaluedCount, 1);
  assert.equal(report.parts[0].key, "missingMandatory");
});

test("lists data gaps in plain words", () => {
  const report = buildMoneyLossReport({
    outOfStockRows: [],
    noSalesRows: [],
    writeOffAmount: null,
    recommendations: [],
    matrixRows: [cell("cola", "s1", { isMandatory: false })],
    marginCoverage: {
      state: "PARTIAL",
      coveredRevenue: 625,
      totalRevenue: 1000,
    },
    healthStates: ["AVAILABLE", "STALE"],
  });

  assert.deepEqual(
    report.gaps.map((gap) => gap.key),
    ["notReady", "partialMargin", "noMandatory", "noWriteOffs"],
  );
  assert.match(report.gaps[1].text, /62% выручки/);
  const writeOffs = report.parts.find((part) => part.key === "writeOffs");
  assert.equal(writeOffs?.unavailable, true);
  assert.equal(report.totalLoss, 0);
});

test("top actions skip closed ones and sort by effect", () => {
  const report = buildMoneyLossReport({
    outOfStockRows: [],
    noSalesRows: [],
    writeOffAmount: 0,
    recommendations: [
      recommendation("a", 100),
      recommendation("b", 900, "DONE"),
      recommendation("c", 400),
      recommendation("d", 0),
      recommendation("e", 50),
      recommendation("f", 70),
      recommendation("g", 60),
      recommendation("h", 55),
    ],
    matrixRows: [],
  });

  assert.deepEqual(
    report.actions.map((item) => item.id),
    ["c", "a", "f", "g", "h"],
  );
  assert.equal(report.actionsEffect, 685);
});

import assert from "node:assert/strict";
import test from "node:test";
import { buildAssortmentReportHref } from "./assortment-report-query.ts";

const scope = {
  from: "2026-09-01",
  to: "2026-09-13",
  asOf: "2026-09-14T12:34:56.789Z",
  storeIds: ["club-a", "club-b"],
  categoryIds: ["drinks", "snacks"],
  noSalesDays: 21 as const,
};

test("opens the no-movement view of the order report for a no-sales drilldown", () => {
  const href = buildAssortmentReportHref(scope, "no-sales");
  const params = new URL(href, "https://leet.plus").searchParams;

  assert.equal(new URL(href, "https://leet.plus").pathname, "/products/order");
  assert.equal(params.get("view"), "no-movement");
  assert.deepEqual(params.getAll("storeIds"), ["club-a", "club-b"]);
  assert.deepEqual(params.getAll("categoryIds"), ["drinks", "snacks"]);
  assert.equal(params.get("noSalesDays"), "21");
});

test("maps OOS, low-stock, excess, and write-offs to matching scoped subsets", () => {
  const oos = new URL(
    buildAssortmentReportHref(scope, "out-of-stock"),
    "https://leet.plus",
  );
  const excess = new URL(
    buildAssortmentReportHref(scope, "excess"),
    "https://leet.plus",
  );
  const lowStock = new URL(
    buildAssortmentReportHref(scope, "low-stock"),
    "https://leet.plus",
  );
  const writeOffs = new URL(
    buildAssortmentReportHref(scope, "write-offs"),
    "https://leet.plus",
  );

  assert.equal(oos.pathname, "/products/order");
  assert.equal(oos.searchParams.get("view"), "out-of-stock");
  assert.deepEqual(oos.searchParams.getAll("storeIds"), ["club-a", "club-b"]);
  assert.equal(lowStock.pathname, "/products/order");
  assert.equal(lowStock.searchParams.get("view"), "running-out");
  assert.equal(excess.pathname, "/products/stock-value");
  assert.equal(excess.searchParams.get("view"), "excess");
  assert.deepEqual(excess.searchParams.getAll("categoryIds"), [
    "drinks",
    "snacks",
  ]);
  assert.equal(writeOffs.pathname, "/products/movement/table");
  assert.deepEqual(writeOffs.searchParams.getAll("storeIds"), [
    "club-a",
    "club-b",
  ]);
  assert.deepEqual(writeOffs.searchParams.getAll("categoryIds"), [
    "drinks",
    "snacks",
  ]);
  assert.equal(writeOffs.searchParams.get("asOf"), scope.asOf);
});

test("keeps a multi-club historical scope for the dashboard route", () => {
  const url = new URL(
    buildAssortmentReportHref(scope, "dashboard"),
    "https://leet.plus",
  );

  assert.equal(url.pathname, "/assortment/dashboard");
  assert.deepEqual(url.searchParams.getAll("storeIds"), ["club-a", "club-b"]);
  assert.deepEqual(url.searchParams.getAll("categoryIds"), [
    "drinks",
    "snacks",
  ]);
  assert.equal(url.searchParams.get("from"), "2026-09-01");
  assert.equal(url.searchParams.get("to"), "2026-09-13");
  assert.equal(url.searchParams.get("asOf"), "2026-09-14T12:34:56.789Z");
});

test("opens «Деньги в остатке» for money-at-risk and turnover drilldowns", () => {
  const risk = new URL(
    buildAssortmentReportHref(scope, "assortment-risk"),
    "https://leet.plus",
  );
  const turnover = new URL(
    buildAssortmentReportHref(scope, "turnover"),
    "https://leet.plus",
  );

  assert.equal(risk.pathname, "/products/stock-value");
  assert.equal(risk.searchParams.get("view"), "frozen");
  assert.equal(risk.searchParams.get("noSalesDays"), "21");
  assert.deepEqual(risk.searchParams.getAll("storeIds"), ["club-a", "club-b"]);
  assert.equal(turnover.pathname, "/products/stock-value");
  assert.equal(turnover.searchParams.get("view"), "all");
  assert.equal(turnover.searchParams.get("noSalesDays"), null);
});

test("opens the running-out view with the club scope for the combined OOS card", () => {
  const oos = new URL(
    buildAssortmentReportHref(scope, "oos-risk"),
    "https://leet.plus",
  );

  assert.equal(oos.pathname, "/products/order");
  assert.equal(oos.searchParams.get("view"), "running-out");
  assert.deepEqual(oos.searchParams.getAll("storeIds"), ["club-a", "club-b"]);
  assert.deepEqual(oos.searchParams.getAll("categoryIds"), [
    "drinks",
    "snacks",
  ]);
});

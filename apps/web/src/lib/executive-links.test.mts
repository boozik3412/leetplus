import assert from "node:assert/strict";
import test from "node:test";
import {
  clubDetailHref,
  driverDetailHref,
  taskDraftHref,
} from "./executive-links.ts";

const summary = {
  scope: {
    period: { from: "2026-09-23", to: "2026-09-29" },
    comparison: { from: "2026-09-16", to: "2026-09-22" },
    asOf: "2026-09-30T10:00:00.000Z",
    storeIds: ["pu", "ra", "ro"],
  },
};

function query(href: string) {
  return new URL(href, "https://leetplus.test").searchParams;
}

test("a factor tile opens the revenue tree of the same selection", () => {
  const params = query(driverDetailHref(summary as never, "conversion"));
  assert.equal(params.get("metric"), "drivers");
  assert.equal(params.get("focus"), "conversion");
  assert.equal(params.get("dateFrom"), "2026-09-23");
  assert.equal(params.get("comparison"), "true");
  assert.deepEqual(params.getAll("storeIds"), ["pu", "ra", "ro"]);
  assert.deepEqual(params.getAll("returnStoreIds"), []);
});

test("a club drill-down returns to the whole selection", () => {
  const params = query(driverDetailHref(summary as never, "check", ["ra"]));
  assert.deepEqual(params.getAll("storeIds"), ["ra"]);
  assert.deepEqual(params.getAll("returnStoreIds"), ["pu", "ra", "ro"]);
  assert.deepEqual(
    query(clubDetailHref(summary as never, "productRevenue", ["ro"])).getAll(
      "returnStoreIds",
    ),
    ["pu", "ra", "ro"],
  );
});

test("«Поставить задачу» opens the filled task form", () => {
  const href = taskDraftHref({
    title: "Поднять покупки в баре · 1337 Родонитовая",
    description: "17,4% визитов с покупкой против 24,9%",
    storeId: "ro",
    priority: "HIGH",
  });
  assert.ok(href.startsWith("/staff/tasks?"));
  assert.ok(href.endsWith("#new-task"));
  const params = query(href);
  assert.equal(params.get("draftTitle"), "Поднять покупки в баре · 1337 Родонитовая");
  assert.equal(params.get("draftStoreId"), "ro");
  assert.equal(params.get("draftPriority"), "HIGH");
  assert.equal(params.get("draftType"), "ONE_TIME");
  assert.equal(
    query(
      taskDraftHref({
        title: "Пополнить позиции без остатка",
        description: "",
        storeId: null,
        priority: "URGENT",
      }),
    ).has("draftStoreId"),
    false,
  );
});

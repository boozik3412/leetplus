import assert from "node:assert/strict";
import test from "node:test";
import type {
  MarketingPromoBundleLaunch,
  MarketingPromoBundleUsage,
} from "./marketing.ts";
import {
  checkPromoBundlePrice,
  promoBundleCardState,
  promoBundleLaunchSummary,
  promoBundleOfferLine,
  returnWithPromoBundle,
  safeReturnPath,
  suggestedGuestPrice,
} from "./promo-bundle-wizard.ts";

function launch(
  id: string,
  patch: Partial<MarketingPromoBundleLaunch> = {},
): MarketingPromoBundleLaunch {
  return {
    id,
    status: "ACTIVE",
    audience: null,
    storeIds: [],
    periodFrom: null,
    periodTo: null,
    maxUses: 30,
    note: null,
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
    promoBundle: {
      id: "b1",
      name: "Комбо",
      status: "ACTIVE",
      bundleType: "game_product",
      mechanicConfig: {},
      note: null,
    },
    createdBy: null,
    ...patch,
  };
}

function usage(
  quantity: number,
  amount: number,
  status: "CONFIRMED" | "CANCELED" = "CONFIRMED",
): MarketingPromoBundleUsage {
  return {
    id: `u${quantity}${amount}${status}`,
    status,
    source: "MANUAL",
    externalProvider: null,
    externalDomain: null,
    externalId: null,
    guestExternalId: null,
    receiptExternalId: null,
    usedAt: "2026-11-05T00:00:00Z",
    quantity,
    amount,
    costAmount: null,
    grossProfit: null,
    note: null,
    createdAt: "2026-11-05T00:00:00Z",
    updatedAt: "2026-11-05T00:00:00Z",
    promoBundle: {
      id: "b1",
      name: "Комбо",
      status: "ACTIVE",
      bundleType: "game_product",
    },
    launch: null,
    store: null,
    createdBy: null,
  };
}

const now = new Date("2026-11-13T12:00:00Z");

test("guest price: percent off the sum, rounded down to tens", () => {
  assert.equal(suggestedGuestPrice("game_product", 670, 180, 20), 680);
  assert.equal(suggestedGuestPrice("product_product", 299, 99, 15), 330);
});

test("guest price: a bonus part is the gift, the guest pays the first part", () => {
  assert.equal(suggestedGuestPrice("balance_bonus", 1000, 100, 0), 1000);
  assert.equal(suggestedGuestPrice("game_bonus", 400, 120, 25), 400);
});

test("price check blocks a zero, higher-than-usual or loss-making price", () => {
  assert.equal(
    checkPromoBundlePrice({ basePrice: 0, guestPrice: 100, costPerUse: 0 })
      .tone,
    "blocked",
  );
  assert.equal(
    checkPromoBundlePrice({ basePrice: 850, guestPrice: 0, costPerUse: 0 })
      .tone,
    "blocked",
  );
  assert.equal(
    checkPromoBundlePrice({ basePrice: 850, guestPrice: 900, costPerUse: 0 })
      .tone,
    "blocked",
  );
  assert.equal(
    checkPromoBundlePrice({ basePrice: 850, guestPrice: 100, costPerUse: 200 })
      .tone,
    "blocked",
  );
});

test("price check warns without cost or with a huge discount, else ready", () => {
  assert.equal(
    checkPromoBundlePrice({ basePrice: 850, guestPrice: 650, costPerUse: 0 })
      .tone,
    "warning",
  );
  assert.equal(
    checkPromoBundlePrice({ basePrice: 1000, guestPrice: 500, costPerUse: 100 })
      .tone,
    "warning",
  );
  const ready = checkPromoBundlePrice({
    basePrice: 850,
    guestPrice: 650,
    costPerUse: 95,
  });
  assert.equal(ready.tone, "ready");
  assert.equal(ready.discount, 200);
  assert.equal(ready.marginPerUse, 555);
});

test("offer line joins the filled parts", () => {
  assert.equal(
    promoBundleOfferLine("2 часа игры", " энергетик "),
    "2 часа игры + энергетик",
  );
  assert.equal(promoBundleOfferLine("", ""), "состав не задан");
});

test("card state: no launches means not launched", () => {
  const state = promoBundleCardState({
    bundleId: "b1",
    bundleStatus: "ACTIVE",
    launches: [],
    usages: [],
    now,
  });
  assert.equal(state.status, "not_launched");
});

test("card state: a launch runs through its last calendar day", () => {
  const state = promoBundleCardState({
    bundleId: "b1",
    bundleStatus: "ACTIVE",
    launches: [
      launch("l1", {
        periodFrom: "2026-11-01T00:00:00Z",
        periodTo: "2026-11-13T00:00:00Z",
      }),
    ],
    usages: [usage(2, 1300), usage(1, 650, "CANCELED")],
    now,
  });
  assert.equal(state.status, "running");
  assert.equal(state.used, 2);
  assert.equal(state.revenue, 1300);
});

test("card state: future, finished, stopped and archived launches", () => {
  const base = {
    bundleId: "b1",
    bundleStatus: "ACTIVE" as const,
    usages: [],
    now,
  };
  assert.equal(
    promoBundleCardState({
      ...base,
      launches: [launch("l1", { periodFrom: "2026-11-20T00:00:00Z" })],
    }).status,
    "scheduled",
  );
  assert.equal(
    promoBundleCardState({
      ...base,
      launches: [launch("l1", { periodTo: "2026-11-10T00:00:00Z" })],
    }).status,
    "finished",
  );
  assert.equal(
    promoBundleCardState({
      ...base,
      launches: [launch("l1", { status: "FINISHED" })],
    }).status,
    "finished",
  );
  assert.equal(
    promoBundleCardState({
      ...base,
      bundleStatus: "ARCHIVED",
      launches: [launch("l1")],
    }).status,
    "archived",
  );
});

test("launch summary names the group, clubs and end date", () => {
  assert.deepEqual(
    promoBundleLaunchSummary(
      {
        audience: {
          id: "a",
          name: "Гости в риске",
          description: null,
          guestsCount: 214,
        },
        storeIds: ["s1", "s2"],
        periodTo: "2026-11-30T00:00:00Z",
      },
      3,
    ),
    ["Гости в риске", "2 клуба", "до 30 ноября"],
  );
  assert.deepEqual(
    promoBundleLaunchSummary(
      { audience: null, storeIds: [], periodTo: null },
      3,
    ),
    ["Все гости", "все клубы", "без даты окончания"],
  );
});

test("top-up bundles are judged by the bonus share, not a margin", () => {
  const check = checkPromoBundlePrice({
    basePrice: 1100,
    guestPrice: 1000,
    costPerUse: 100,
    kind: "balance_bonus",
  });
  assert.equal(check.tone, "ready");
  assert.match(check.detail, /10% от пополнения/);
  assert.equal(
    checkPromoBundlePrice({
      basePrice: 1300,
      guestPrice: 1000,
      costPerUse: 300,
      kind: "balance_bonus",
    }).tone,
    "warning",
  );
});

test("return path after the wizard stays on this site", () => {
  assert.equal(
    safeReturnPath("/marketing/new?audience=a1"),
    "/marketing/new?audience=a1",
  );
  assert.equal(safeReturnPath("//evil.example/x"), null);
  assert.equal(safeReturnPath("https://evil.example"), null);
  assert.equal(safeReturnPath("/\\evil.example"), null);
  assert.equal(safeReturnPath(null), null);
  assert.equal(
    returnWithPromoBundle("/marketing/new?audience=a1", "b 1"),
    "/marketing/new?audience=a1&promoBundle=b%201",
  );
  assert.equal(
    returnWithPromoBundle("/marketing/new#mechanic", "b1"),
    "/marketing/new?promoBundle=b1#mechanic",
  );
});

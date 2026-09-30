import assert from "node:assert/strict";
import test from "node:test";
import {
  checkDrops,
  conversionGaps,
  mainLever,
  salesConfirmedThrough,
  silentClubs,
} from "./executive-driver-rules.ts";

const factors = (
  barRevenue: number | null,
  purchases: number | null,
  visits: number | null,
) => ({
  barRevenue,
  totalBarRevenue: barRevenue,
  purchases,
  averagePurchase:
    barRevenue !== null && purchases ? Math.round(barRevenue / purchases) : null,
  visits,
  purchasesPerVisit:
    purchases !== null && visits
      ? Math.round((purchases / visits) * 1000) / 10
      : null,
  guests: null,
  visitsPerGuest: null,
  playedHours: null,
  capacityHours: null,
  loadEstimate: null,
});
const row = (
  storeId: string | null,
  current: ReturnType<typeof factors>,
  previous: ReturnType<typeof factors> | null,
  contributions: Array<{ factor: string; amount: number }> | null = null,
) => ({
  scope: storeId ? "CLUB" : "NETWORK",
  storeId,
  storeName: storeId ?? "Сеть",
  storeIds: storeId ? [storeId] : [],
  current,
  previous,
  contributions,
  notes: [],
});

// Real week 23–29.09 vs 16–22.09 of network 1337.
const radishcheva = row("ra", factors(75_220, 268, 979), factors(61_467, 227, 839), [
  { factor: "VISITS", amount: 10_511 },
  { factor: "CONVERSION", amount: 798 },
  { factor: "CHECK", amount: 2_444 },
]);
const rodonitovaya = row("ro", factors(61_069, 213, 1_212), factors(49_359, 186, 1_216), [
  { factor: "VISITS", amount: -181 },
  { factor: "CONVERSION", amount: 7_637 },
  { factor: "CHECK", amount: 4_254 },
]);
const pushkinskaya = row("pu", factors(77_561, 275, null), factors(72_467, 231, null), [
  { factor: "PURCHASES", amount: 13_074 },
  { factor: "CHECK", amount: -7_980 },
]);

test("the lever is the costly loss, otherwise the growth driver", () => {
  assert.deepEqual(mainLever(pushkinskaya as never), {
    factor: "CHECK",
    amount: -7_980,
    kind: "LOSS",
  });
  assert.deepEqual(mainLever(radishcheva as never), {
    factor: "VISITS",
    amount: 10_511,
    kind: "GAIN",
  });
  // A 181 ₽ traffic dip on 49 359 ₽ is not the lever.
  assert.equal(mainLever(rodonitovaya as never)?.factor, "CONVERSION");
  assert.equal(mainLever(row("x", factors(1, 1, 1), null) as never), null);
});

test("conversion gap compares clubs with enough visits and prices the reserve", () => {
  const gaps = conversionGaps({
    rows: [radishcheva, rodonitovaya, pushkinskaya, row("tiny", factors(10, 1, 20), null)],
  } as never);
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].storeId, "ro");
  assert.equal(gaps[0].bestStoreName, "ra");
  assert.equal(gaps[0].value, 17.6);
  assert.equal(gaps[0].best, 27.4);
  // (27.4% − 17.6%) × 1 212 visits × 287 ₽ ≈ 34 thousand.
  assert.ok(gaps[0].potential > 33_000 && gaps[0].potential < 35_000);
  assert.deepEqual(conversionGaps({ rows: [radishcheva] } as never), []);
  assert.deepEqual(conversionGaps(undefined), []);
});

test("check drop fires from 10% and skips excluded clubs", () => {
  const drops = checkDrops({
    rows: [radishcheva, rodonitovaya, pushkinskaya],
  } as never);
  assert.deepEqual(
    drops.map((drop) => [drop.storeId, Math.round(drop.percent), drop.amount]),
    [["pu", -10, -7_980]],
  );
  assert.deepEqual(
    checkDrops({ rows: [pushkinskaya] } as never, new Set(["pu"])),
    [],
  );
});

test("a club without sales since a day of the period is silent, not a sales drop", () => {
  const club = (storeId: string, factAsOf: string | null, value: number, previous: number) => ({
    storeId,
    storeName: storeId,
    metrics: {
      productRevenue: {
        state: "AVAILABLE",
        value,
        factAsOf,
        comparison: { previousValue: previous },
      },
    },
  });
  const summary = {
    scope: { period: { from: "2026-09-23", to: "2026-09-29" } },
    clubs: [
      club("kh", "2026-09-28T12:05:00.000Z", 22_860, 69_910),
      club("ra", "2026-09-29T23:10:00.000Z", 75_220, 61_467),
      club("new", null, 0, 0),
      club("gone", null, 0, 5_000),
    ],
  };
  assert.deepEqual(silentClubs(summary as never), [
    { storeId: "kh", storeName: "kh", since: "2026-09-29" },
    { storeId: "gone", storeName: "gone", since: "2026-09-23" },
  ]);

  // 20:30 UTC on 28.09 is 00:30 on 29.09 in Samara: the club sold on 29.09.
  const samara = {
    scope: {
      period: { from: "2026-09-23", to: "2026-09-29" },
      storeTimeZones: { kh: "Europe/Samara", ra: "Asia/Yekaterinburg" },
    },
    clubs: [
      club("kh", "2026-09-28T20:30:00.000Z", 22_860, 69_910),
      club("ra", "2026-09-29T18:40:00.000Z", 75_220, 61_467),
    ],
    metrics: { productRevenue: { factAsOf: "2026-09-29T18:40:00.000Z" } },
  };
  assert.deepEqual(silentClubs(samara as never), []);
  assert.equal(salesConfirmedThrough(samara as never), "2026-09-29");
  assert.equal(
    salesConfirmedThrough({
      ...samara,
      clubs: [club("ra", "2026-09-29T19:10:00.000Z", 1, 1)],
    } as never),
    "2026-09-30",
  );
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  formatGameEffectDelta,
  formatGameEffectInterval,
  formatGameEffectValue,
  gameEffectHoldoutStatus,
  gameEffectReportCsv,
  gameEffectVerdictTone,
  type GameEffectCohortView,
  type GameEffectMetricView,
  type GameEffectReport,
} from "./guest-game-effect.ts";

const nbsp = / /gu;

function metric(effect: number, overrides: Partial<GameEffectMetricView> = {}) {
  return {
    before: 1,
    after: 2,
    comparisonBefore: 1,
    comparisonAfter: 1,
    effect,
    ciLow: null,
    ciHigh: null,
    total: effect * 10,
    significant: false,
    ...overrides,
  };
}

function cohort(): GameEffectCohortView {
  return {
    windowDays: 28,
    participants: 12,
    measured: 10,
    immature: 2,
    unmatched: 0,
    noHistory: 0,
    comparisonGuests: 40,
    metrics: {
      visitDays: metric(1.5),
      sessions: metric(2),
      playMinutes: metric(90),
      balanceSpend: metric(400),
      barRevenue: metric(-20),
      money: metric(380, { ciLow: 100, ciHigh: 660, significant: true }),
    },
    cost: { bonusRub: 1500, prizes: 1, bonusPerGuest: 150 },
    moneyPerBonusRub: 2.53,
    verdict: "POSITIVE",
  };
}

test("formats values in their units and signed deltas", () => {
  assert.equal(formatGameEffectValue("playMinutes", 90).replace(nbsp, " "), "1,5 ч");
  assert.equal(formatGameEffectValue("money", 1234).replace(nbsp, " "), "1 234 ₽");
  assert.equal(formatGameEffectDelta("visitDays", 1.46), "+1,5");
  assert.equal(formatGameEffectDelta("money", -320).replace(nbsp, " "), "−320 ₽");
  assert.equal(formatGameEffectDelta("money", 0.2).replace(nbsp, " "), "0 ₽");
  assert.equal(formatGameEffectDelta("playMinutes", 30), "+0,5 ч");
  assert.equal(
    formatGameEffectInterval("money", { ciLow: -10, ciHigh: 50 })?.replace(nbsp, " "),
    "от −10 ₽ до +50 ₽",
  );
  assert.equal(formatGameEffectInterval("money", { ciLow: null, ciHigh: 1 }), null);
});

test("names verdict tones and holdout states", () => {
  assert.equal(gameEffectVerdictTone("POSITIVE"), "good");
  assert.equal(gameEffectVerdictTone("NEGATIVE"), "bad");
  assert.equal(gameEffectVerdictTone("NOT_ENOUGH_DATA"), "muted");
  assert.equal(gameEffectHoldoutStatus(null), "Контрольной группы нет");
  assert.equal(
    gameEffectHoldoutStatus({
      percent: 10,
      startedAt: null,
      result: null,
      pendingReason: "TOO_EARLY",
    }),
    "Контрольная группа 10%: результат через 7 дней после старта",
  );
});

test("exports the game and every scenario as CSV", () => {
  const report: GameEffectReport = {
    generatedAt: "2026-10-14T09:00:00Z",
    dataAsOf: "2026-10-14T09:00:00Z",
    timeZone: "Asia/Yekaterinburg",
    windowDays: 28,
    lastCompleteDay: "2026-10-13",
    storeId: null,
    stores: [],
    dataQuality: {
      transactionsDated: 1,
      transactionsUndated: 0,
      transactionsAnomalous: 0,
      playersWithoutGuest: 0,
      playersWithoutHomeStore: 0,
    },
    game: { ...cohort(), byStore: [] },
    scenarios: [
      {
        kind: "MISSION",
        id: "m1",
        name: 'Задание "7 ДНЕЙ", бонус',
        status: "ACTIVE",
        usageKind: null,
        storeIds: [],
        holdout: null,
        cohort: cohort(),
      },
    ],
  };
  const csv = gameEffectReportCsv(report);
  const lines = csv.split("\n");
  assert.equal(lines.length, 3);
  assert.ok(lines[0].startsWith("﻿Сценарий,Тип,Участники"));
  assert.ok(lines[1].startsWith("Игра в целом,Активация,12,10,2,0,40"));
  assert.ok(lines[2].startsWith('"Задание ""7 ДНЕЙ"", бонус",Задание'));
  assert.ok(lines[2].includes("Есть эффект"));
});

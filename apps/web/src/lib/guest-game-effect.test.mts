import assert from "node:assert/strict";
import test from "node:test";
import {
  formatGameEffectMonth,
  formatGameEffectShare,
  gameEffectReturnSeries,
  gameEffectReturnShare,
  formatGameEffectDelta,
  formatGameEffectInterval,
  formatGameEffectValue,
  gameEffectHoldoutStatus,
  gameEffectReportCsv,
  gameEffectVerdictTone,
  gameEffectCohortRange,
  gameEffectPeriodFromSearch,
  gameEffectPeriodPresetId,
  gameEffectPeriodPresets,
  gameEffectPeriodSummary,
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
    measuredFrom: "2026-09-01",
    measuredTo: "2026-09-14",
  };
}

function report(overrides: Partial<GameEffectReport> = {}): GameEffectReport {
  return {
    generatedAt: "2026-10-14T09:00:00Z",
    dataAsOf: "2026-10-14T09:00:00Z",
    timeZone: "Asia/Yekaterinburg",
    windowDays: 28,
    lastCompleteDay: "2026-10-13",
    storeId: null,
    period: { from: null, to: null, measurableTo: "2026-09-15" },
    stores: [],
    dataQuality: {
      transactionsDated: 1,
      transactionsUndated: 0,
      transactionsAnomalous: 0,
      playersWithoutGuest: 0,
      playersWithoutHomeStore: 0,
    },
    game: { ...cohort(), byStore: [] },
    scenarios: [],
    costByMonth: [],
    returnByMonth: [],
    ...overrides,
  };
}

test("formats values in their units and signed deltas", () => {
  assert.equal(
    formatGameEffectValue("playMinutes", 90).replace(nbsp, " "),
    "1,5 ч",
  );
  assert.equal(
    formatGameEffectValue("money", 1234).replace(nbsp, " "),
    "1 234 ₽",
  );
  assert.equal(formatGameEffectDelta("visitDays", 1.46), "+1,5");
  assert.equal(
    formatGameEffectDelta("money", -320).replace(nbsp, " "),
    "−320 ₽",
  );
  assert.equal(formatGameEffectDelta("money", 0.2).replace(nbsp, " "), "0 ₽");
  assert.equal(formatGameEffectDelta("playMinutes", 30), "+0,5 ч");
  assert.equal(
    formatGameEffectInterval("money", { ciLow: -10, ciHigh: 50 })?.replace(
      nbsp,
      " ",
    ),
    "от −10 ₽ до +50 ₽",
  );
  assert.equal(
    formatGameEffectInterval("money", { ciLow: null, ciHigh: 1 }),
    null,
  );
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
  const csv = gameEffectReportCsv(
    report({
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
    }),
  );
  const lines = csv.split("\n");
  assert.equal(lines.length, 3);
  assert.ok(lines[0].startsWith("﻿Сценарий,Тип,Участники"));
  assert.ok(
    lines[1].startsWith(
      "Игра в целом,Активация,12,10,2,0,40,01.09.2026,14.09.2026",
    ),
  );
  assert.ok(lines[2].startsWith('"Задание ""7 ДНЕЙ"", бонус",Задание'));
  assert.ok(lines[2].includes("Есть эффект"));
});

test("monthly return series puts every group of a month on one point", () => {
  const rows = [
    {
      month: "2026-09",
      group: "PLAYER",
      guests: 12,
      returned: 9,
      partial: true,
    },
    {
      month: "2026-08",
      group: "NEVER",
      guests: 10,
      returned: 4,
      partial: false,
    },
    {
      month: "2026-08",
      group: "FUTURE_PLAYER",
      guests: 10,
      returned: 8,
      partial: false,
    },
    // Under 10 guests: no point.
    { month: "2026-09", group: "NEVER", guests: 9, returned: 9, partial: true },
  ] as const;
  const series = gameEffectReturnSeries(rows);
  assert.deepEqual(
    series.map((point) => [
      point.label,
      point.PLAYER,
      point.FUTURE_PLAYER,
      point.NEVER,
      point.partial,
    ]),
    [
      ["авг 26", null, 0.8, 0.4, false],
      ["сен 26", 0.75, null, null, true],
    ],
  );
  assert.equal(gameEffectReturnShare(rows, "NEVER"), 0.4);
  assert.equal(gameEffectReturnShare(rows, "PLAYER"), null);
  assert.equal(
    gameEffectReturnShare(rows, "PLAYER", { includePartial: true }),
    0.75,
  );
  assert.equal(formatGameEffectShare(0.754), "75%");
  assert.equal(formatGameEffectMonth("2026-01"), "янв 26");
});

test("period presets: all time and the last months, newest first", () => {
  const presets = gameEffectPeriodPresets("2026-11-12", 3);
  assert.deepEqual(
    presets.map(({ id, label, from, to }) => [id, label, from, to]),
    [
      ["all", "За всё время", null, null],
      ["2026-11", "Ноябрь 2026", "2026-11-01", "2026-11-30"],
      ["2026-10", "Октябрь 2026", "2026-10-01", "2026-10-31"],
      ["2026-09", "Сентябрь 2026", "2026-09-01", "2026-09-30"],
    ],
  );
  assert.equal(
    gameEffectPeriodPresetId(presets, { from: "2026-10-01", to: "2026-10-31" }),
    "2026-10",
  );
  assert.equal(
    gameEffectPeriodPresetId(presets, { from: null, to: null }),
    "all",
  );
  assert.equal(
    gameEffectPeriodPresetId(presets, { from: "2026-10-02", to: "2026-10-31" }),
    "custom",
  );
  // February of a leap year ends on the 29th.
  assert.equal(gameEffectPeriodPresets("2028-02-10", 1)[1].to, "2028-02-29");
});

test("period from the URL drops broken or reversed dates", () => {
  assert.deepEqual(
    gameEffectPeriodFromSearch(
      "?tab=effect&periodFrom=2026-10-01&periodTo=2026-10-31",
    ),
    { from: "2026-10-01", to: "2026-10-31" },
  );
  assert.deepEqual(gameEffectPeriodFromSearch("?periodFrom=01.10.2026"), {
    from: null,
    to: null,
  });
  assert.deepEqual(
    gameEffectPeriodFromSearch("?periodFrom=2026-10-31&periodTo=2026-10-01"),
    { from: null, to: null },
  );
});

test("period summary says whose starts are measured and what is not yet", () => {
  assert.equal(
    gameEffectPeriodSummary(report()),
    "Все игроки с начала игры. Измерены старты с 01.09.2026 по 14.09.2026: у каждого 28 дней до старта против 28 дней после. Старт после 15.09.2026 пока не измерить: 28 дней после него ещё не прошли. Данные по 13.10.2026.",
  );
  assert.equal(
    gameEffectPeriodSummary(
      report({
        period: {
          from: "2026-09-01",
          to: "2026-09-10",
          measurableTo: "2026-09-15",
        },
      }),
    ),
    "Игроки, которые начали с 01.09.2026 по 10.09.2026. Измерены старты с 01.09.2026 по 14.09.2026: у каждого 28 дней до старта против 28 дней после. Данные по 13.10.2026.",
  );
  const empty = report({
    period: {
      from: "2026-10-01",
      to: "2026-10-31",
      measurableTo: "2026-09-15",
    },
    game: { ...cohort(), measuredFrom: null, measuredTo: null, byStore: [] },
  });
  assert.ok(
    gameEffectPeriodSummary(empty).includes(
      "Измеренных игроков в этом периоде нет.",
    ),
  );
  assert.equal(
    gameEffectCohortRange(cohort()),
    "старт с 01.09.2026 по 14.09.2026",
  );
  assert.equal(
    gameEffectCohortRange({
      ...cohort(),
      measuredFrom: null,
      measuredTo: null,
    }),
    "",
  );
});

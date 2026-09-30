import assert from "node:assert/strict";
import test from "node:test";
import {
  clubDropSignals,
  deltaDirection,
  hasConfirmedDecline,
  networkContributions,
  priorityCount,
  priorityLevelCounts,
  salesCoverageGap,
  sortPriorities,
} from "./executive-priority-rules.ts";
import {
  formatSigned,
  formatWeekdayDay,
  isWeekend,
  periodDays,
} from "./executive-format.ts";
import {
  staffPriorityHref,
  staffPriorityTarget,
} from "./staff-priorities-types.ts";

test("decline needs two confirmed periods; known zero can decline and old API absence cannot", () => {
  const metric = {
    state: "AVAILABLE",
    value: 0,
    comparison: { previousValue: 100, absoluteDelta: -100 },
  };
  assert.equal(hasConfirmedDecline(metric as never), true);
  for (const state of ["PARTIAL", "MISSING", "STALE", "FAILED"])
    assert.equal(hasConfirmedDecline({ ...metric, state } as never), false);
  assert.equal(hasConfirmedDecline(undefined), false);
  assert.equal(
    hasConfirmedDecline({ ...metric, comparison: null } as never),
    false,
  );
  assert.equal(
    hasConfirmedDecline({
      ...metric,
      comparison: { previousValue: null, absoluteDelta: -1 },
    } as never),
    false,
  );
  assert.equal(
    hasConfirmedDecline({
      ...metric,
      comparison: { previousValue: 100, absoluteDelta: 0 },
    } as never),
    false,
  );
});
test("details retain all clubs and use exact existing task/run/user selectors", () => {
  const url = new URL(
    staffPriorityHref(["a", "b"], "TRAINING_INCOMPLETE"),
    "http://localhost",
  );
  assert.deepEqual(url.searchParams.getAll("storeIds"), ["a", "b"]);
  assert.equal(url.searchParams.has("dateFrom"), false);
  assert.equal(
    staffPriorityTarget({ target: { type: "TASK", id: "a&b" } } as never),
    "/staff/tasks?taskId=a%26b",
  );
  assert.equal(
    staffPriorityTarget({ target: { type: "CHECKLIST", id: "run" } } as never),
    "/staff/checklists?runId=run",
  );
  assert.equal(
    staffPriorityTarget({
      target: { type: "TRAINING_PROFILE", userId: "user" },
    } as never),
    "/staff/training-profiles?userId=user",
  );
  assert.equal(staffPriorityTarget({ target: null } as never), null);
});
test("counts are readable in Russian", () => {
  assert.equal(priorityCount(1, "TASKS"), "1 задача");
  assert.equal(priorityCount(2, "CHECKLISTS"), "2 чек-листа");
  assert.equal(priorityCount(5, "EMPLOYEES"), "5 сотрудников");
});

const scope = (from: string, to: string, comparison = true) => ({
  period: { from, to, timezone: "PER_STORE" },
  storeIds: ["a", "b", "c"],
  storeTimeZones: {},
  comparison: comparison ? { from: "2026-09-16", to: "2026-09-22" } : null,
  asOf: "2026-09-30T05:00:00.000Z",
});
const product = (
  value: number | null,
  previousValue: number | null,
  state = "AVAILABLE",
) => ({
  state,
  value,
  reason: null,
  coverage: { covered: 7, total: 7, percent: 100, basis: "STORE_DAYS" },
  comparison:
    value === null || previousValue === null
      ? null
      : {
          previousValue,
          absoluteDelta: value - previousValue,
          percentDelta:
            previousValue === 0
              ? null
              : ((value - previousValue) / previousValue) * 100,
          pointsDelta: null,
        },
});
const summaryOf = (
  clubs: Array<[string, ReturnType<typeof product>]>,
  period = scope("2026-09-23", "2026-09-29"),
  network = product(236_710, 253_203),
) =>
  ({
    scope: period,
    metrics: { productRevenue: network },
    clubs: clubs.map(([storeId, productRevenue]) => ({
      storeId,
      storeName: `Club ${storeId}`,
      metrics: { productRevenue },
    })),
    days: [],
  }) as never;

test("club drop: confirmed weekly declines from 20% (today) and 50% (urgent), biggest loss first", () => {
  const signals = clubDropSignals(
    summaryOf([
      ["kh", product(22_860, 69_910)],
      ["pu", product(77_561, 72_467)],
      ["rd", product(7_000, 10_000)],
      ["ok", product(9_000, 10_000)],
    ]),
  );
  assert.deepEqual(
    signals.map((signal) => [signal.storeId, signal.level]),
    [
      ["kh", "URGENT"],
      ["rd", "TODAY"],
    ],
  );
  assert.equal(signals[0].absoluteDelta, -47_050);
  assert.equal(Math.round(signals[0].perDay), -6_721);
});

test("club drop: no signal for daily periods, disabled comparison or unconfirmed clubs", () => {
  const collapsed: Array<[string, ReturnType<typeof product>]> = [
    ["kh", product(0, 360)],
  ];
  assert.deepEqual(
    clubDropSignals(summaryOf(collapsed, scope("2026-09-29", "2026-09-29"))),
    [],
  );
  assert.deepEqual(
    clubDropSignals(
      summaryOf(collapsed, scope("2026-09-23", "2026-09-29", false)),
    ),
    [],
  );
  for (const state of ["PARTIAL", "MISSING", "STALE", "FAILED"])
    assert.deepEqual(
      clubDropSignals(summaryOf([["kh", product(1_000, 69_910, state)]])),
      [],
    );
});

test("contributions explain the network change by club and never spread the remainder", () => {
  const result = networkContributions(
    summaryOf([
      ["kh", product(22_860, 69_910)],
      ["pu", product(77_561, 72_467)],
      ["x", product(null, null, "MISSING")],
    ]),
  );
  assert.ok(result);
  assert.deepEqual(
    result.clubs.map((club) => [club.storeId, club.delta]),
    [
      ["kh", -47_050],
      ["pu", 5_094],
    ],
  );
  assert.deepEqual(
    result.notComparable.map((club) => club.storeId),
    ["x"],
  );
  assert.equal(result.unexplained, -16_493 + 47_050 - 5_094);
  assert.deepEqual(
    networkContributions(
      summaryOf([
        ["pu", product(77_561, 72_467)],
        ["kh", product(22_860, 69_910)],
        ["ra", product(75_220, 61_467)],
      ]),
    )?.clubs.map((club) => club.storeId),
    ["kh", "ra", "pu"],
  );
  assert.equal(
    networkContributions(
      summaryOf(
        [
          ["kh", product(1, 2)],
          ["pu", product(1, 2)],
        ],
        undefined,
        product(236_710, null),
      ),
    ),
    null,
  );
});

test("sales coverage priority ignores the structural services gap but reports real gaps", () => {
  assert.equal(salesCoverageGap(product(1, 1) as never), null);
  assert.equal(salesCoverageGap(undefined), null);
  assert.deepEqual(
    salesCoverageGap({
      ...product(1, 1),
      state: "PARTIAL",
      coverage: { covered: 27, total: 28, percent: 96, basis: "STORE_DAYS" },
    } as never),
    { kind: "UNCONFIRMED_DAYS", covered: 27, total: 28 },
  );
  assert.equal(
    salesCoverageGap({ ...product(null, null), state: "FAILED" } as never)
      ?.kind,
    "SOURCE",
  );
});

test("priorities sort by level, then fixed kind order; amounts only inside a kind", () => {
  const sorted = sortPriorities([
    { kind: "SALES_COVERAGE", level: "DATA" },
    { kind: "REGULATIONS_UNACKNOWLEDGED", level: "TODAY" },
    { kind: "CLUB_DROP", level: "TODAY", amount: 3_000 },
    { kind: "OUT_OF_STOCK", level: "URGENT", amount: 1_000_000 },
    { kind: "CLUB_DROP", level: "URGENT", amount: 47_050 },
    { kind: "CLUB_DROP", level: "TODAY", amount: 9_000 },
    { kind: "TASKS_OVERDUE", level: "URGENT" },
  ] as const);
  assert.deepEqual(
    sorted.map((item) => `${item.level}:${item.kind}:${"amount" in item ? item.amount : ""}`),
    [
      "URGENT:TASKS_OVERDUE:",
      "URGENT:CLUB_DROP:47050",
      "URGENT:OUT_OF_STOCK:1000000",
      "TODAY:CLUB_DROP:9000",
      "TODAY:CLUB_DROP:3000",
      "TODAY:REGULATIONS_UNACKNOWLEDGED:",
      "DATA:SALES_COVERAGE:",
    ],
  );
  assert.deepEqual(priorityLevelCounts(sorted), { urgent: 3, today: 3, data: 1 });
});

test("direction follows the number and formatting uses a real minus", () => {
  assert.equal(deltaDirection(product(1, 2) as never), "down");
  assert.equal(deltaDirection(product(2, 1) as never), "up");
  assert.equal(deltaDirection(product(null, null) as never), null);
  assert.equal(formatSigned(-67.3, 1, "%"), "−67,3%");
  assert.equal(formatSigned(5094), "+5 094");
  assert.equal(formatWeekdayDay("2026-09-29"), "вт 29");
  assert.equal(isWeekend("2026-09-26"), true);
  assert.equal(periodDays("2026-09-23", "2026-09-29"), 7);
});

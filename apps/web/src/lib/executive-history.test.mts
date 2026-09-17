import assert from "node:assert/strict";
import test from "node:test";
import { loadExecutiveHistory } from "./executive-history.ts";
import type {
  ExecutiveMetrics,
  ExecutiveSummary,
} from "./dashboard-executive.ts";

function fixture(to = "2026-09-16"): ExecutiveSummary {
  return {
    scope: {
      period: { from: to, to, timezone: "PER_STORE" },
      storeIds: ["B", "A"],
      storeTimeZones: { A: "Asia/Yekaterinburg", B: "Europe/Samara" },
      comparison: { from: "2026-09-15", to: "2026-09-15" },
      asOf: "2026-09-17T08:00:00.000Z",
    },
    metrics: {
      productRevenue: { value: 1200, state: "AVAILABLE" },
    } as ExecutiveMetrics,
    clubs: [],
    days: [{ date: to, metrics: {} as ExecutiveMetrics }],
  };
}

function historyResponse(summary: ExecutiveSummary, from: string, to: string) {
  const result = structuredClone(summary);
  result.scope.period = { ...summary.scope.period, from, to };
  result.scope.comparison = summary.scope.comparison
    ? { from: "2026-08-06", to: "2026-08-26" }
    : null;
  result.days = Array.from({ length: 21 }, (_, index) => {
    const date = new Date(`${from}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + index);
    return {
      date: date.toISOString().slice(0, 10),
      metrics: {} as ExecutiveMetrics,
    };
  });
  return result;
}

test("daily cards stay daily while history queries21 days with the exact accepted scope", async () => {
  const summary = fixture();
  const before = structuredClone(summary);
  const result = await loadExecutiveHistory(
    "full-day",
    summary,
    async (query) => {
      assert.deepEqual(query, {
        period: "custom",
        dateFrom: "2026-08-27",
        dateTo: "2026-09-16",
        storeIds: ["B", "A"],
        asOf: summary.scope.asOf,
        comparison: true,
      });
      return historyResponse(summary, query.dateFrom!, query.dateTo!);
    },
  );
  assert.deepEqual(summary, before);
  assert.equal(summary.days.length, 1);
  assert.equal(summary.metrics.productRevenue.value, 1200);
  assert.equal(result?.data?.days.length, 21);
  assert.equal(result?.scope.period.to, "2026-09-16");
  assert.deepEqual(result?.scope.comparison, {
    from: "2026-08-06",
    to: "2026-08-26",
  });
});

test("the rolling week and other selected ranges do not fetch daily history", async () => {
  for (const period of [
    "full-week",
    "week",
    "custom",
    "month",
    "day",
    undefined,
  ]) {
    const result = await loadExecutiveHistory(period, fixture(), async () => {
      assert.fail("unnecessary history request");
    });
    assert.equal(result, undefined);
  }
});

test("history keeps comparison disabled and preserves unknown days and confirmed zero", async () => {
  const summary = fixture();
  summary.scope.comparison = null;
  const result = await loadExecutiveHistory(
    "full-day",
    summary,
    async (query) => {
      assert.equal(query.comparison, false);
      const data = historyResponse(summary, query.dateFrom!, query.dateTo!);
      data.days[0].metrics.productRevenue = {
        value: null,
        state: "MISSING",
      } as never;
      data.days[1].metrics.productRevenue = {
        value: 0,
        state: "AVAILABLE",
      } as never;
      return data;
    },
  );
  assert.equal(result?.scope.comparison, null);
  assert.equal(result?.data?.days[0].metrics.productRevenue.value, null);
  assert.equal(result?.data?.days[1].metrics.productRevenue.value, 0);
});

for (const [to, expectedFrom] of [
  ["2027-01-03", "2026-12-14"],
  ["2028-03-01", "2028-02-10"],
]) {
  test(`history crosses calendar boundaries ending ${to}`, async () => {
    const summary = fixture(to);
    summary.scope.comparison = null;
    const result = await loadExecutiveHistory(
      "full-day",
      summary,
      async (query) => {
        assert.equal(query.dateFrom, expectedFrom);
        return historyResponse(summary, query.dateFrom!, query.dateTo!);
      },
    );
    assert.equal(result?.data?.days.length, 21);
    assert.equal(result?.scope.period.to, to);
  });
}

const mismatches: Array<[string, (data: ExecutiveSummary) => void]> = [
  [
    "clubs",
    (data) => {
      data.scope.storeIds = ["foreign"];
    },
  ],
  [
    "cutoff",
    (data) => {
      data.scope.asOf = "2026-09-17T09:00:00.000Z";
    },
  ],
  [
    "dates",
    (data) => {
      data.scope.period.from = "2026-09-16";
    },
  ],
  [
    "timezones",
    (data) => {
      data.scope.storeTimeZones.A = "UTC";
    },
  ],
  [
    "comparison",
    (data) => {
      data.scope.comparison = null;
    },
  ],
  [
    "truncated axis",
    (data) => {
      data.days.pop();
    },
  ],
  [
    "duplicate day",
    (data) => {
      data.days[1].date = data.days[0].date;
    },
  ],
  [
    "wrong ordering",
    (data) => {
      data.days.reverse();
    },
  ],
];
for (const [name, mutate] of mismatches) {
  test(`rejects mismatched ${name} without replacing history with one daily point`, async () => {
    const summary = fixture();
    const result = await loadExecutiveHistory(
      "full-day",
      summary,
      async (query) => {
        const data = historyResponse(summary, query.dateFrom!, query.dateTo!);
        mutate(data);
        return data;
      },
    );
    assert.equal(result?.data, null);
    assert.equal(result?.scope.period.from, "2026-08-27");
    assert.equal(summary.metrics.productRevenue.value, 1200);
  });
}

test("failed history leaves the daily summary and requested history range intact", async () => {
  const summary = fixture();
  const result = await loadExecutiveHistory("full-day", summary, async () => {
    throw new Error("unavailable");
  });
  assert.equal(result?.data, null);
  assert.equal(result?.scope.period.to, "2026-09-16");
  assert.equal(summary.days.length, 1);
});

import assert from "node:assert/strict";
import test from "node:test";
import { executiveVerdict } from "./executive-verdict.ts";

const product = (
  value: number | null,
  previousValue: number | null,
  state = "AVAILABLE",
) => ({
  state,
  value,
  reason: null,
  factAsOf: "2026-09-29T20:00:00.000Z",
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

const network = (
  contributions: Array<{ factor: string; amount: number }> | null,
  previousBar = 100_000,
) => ({
  scope: "NETWORK",
  storeId: null,
  storeName: "Сеть",
  storeIds: [],
  current: { barRevenue: 110_000 },
  previous: { barRevenue: previousBar },
  contributions,
  notes: [],
});

const summaryOf = ({
  headline = product(236_710, 253_203),
  clubs = [] as Array<[string, ReturnType<typeof product>]>,
  comparison = true,
  contributions = null as Array<{ factor: string; amount: number }> | null,
} = {}) =>
  ({
    scope: {
      period: { from: "2026-09-23", to: "2026-09-29", timezone: "PER_STORE" },
      storeIds: clubs.map(([id]) => id),
      storeTimeZones: {},
      comparison: comparison ? { from: "2026-09-16", to: "2026-09-22" } : null,
      asOf: "2026-09-30T05:00:00.000Z",
    },
    metrics: { productRevenue: headline },
    clubs: clubs.map(([storeId, productRevenue]) => ({
      storeId,
      storeName: `Клуб ${storeId}`,
      metrics: { productRevenue },
    })),
    drivers: contributions
      ? { rows: [network(contributions)], days: [] }
      : undefined,
    closures: [],
    days: [],
  }) as never;

test("growth names the comparison period and the factor behind it", () => {
  const verdict = executiveVerdict(
    summaryOf({
      headline: product(104_979, 100_879),
      contributions: [
        { factor: "VISITS", amount: 3_000 },
        { factor: "CONVERSION", amount: 600 },
        { factor: "CHECK", amount: 500 },
      ],
    }),
    "productRevenue",
  );
  assert.equal(verdict.tone, "up");
  assert.equal(
    verdict.text,
    "Выручка бара на 4,1% выше, чем 16.09–22.09. Главный вклад: больше визитов.",
  );
});

test("a decline names the costly factor and the club that fell most", () => {
  const verdict = executiveVerdict(
    summaryOf({
      headline: product(88_000, 100_000),
      clubs: [
        ["a", product(22_860, 69_910)],
        ["b", product(7_000, 10_000)],
        ["c", product(58_140, 20_090)],
      ],
      contributions: [
        { factor: "VISITS", amount: 1_000 },
        { factor: "CHECK", amount: -13_000 },
      ],
    }),
    "productRevenue",
  );
  assert.equal(verdict.tone, "down");
  assert.equal(
    verdict.text,
    "Выручка бара на 12% ниже, чем 16.09–22.09. Главная причина: средний чек упал. Сильнее всего просел Клуб a: на 67%.",
  );
});

test("small changes read as flat; partial data says so", () => {
  assert.deepEqual(
    executiveVerdict(
      summaryOf({ headline: product(100_500, 100_000) }),
      "productRevenue",
    ),
    { tone: "flat", text: "Выручка бара на уровне 16.09–22.09." },
  );
  assert.equal(
    executiveVerdict(
      summaryOf({ headline: product(120_000, 100_000, "PARTIAL") }),
      "productRevenue",
    ).text,
    "Выручка бара по подтверждённым дням на 20% выше, чем 16.09–22.09.",
  );
});

test("no confirmed sales or no comparison never invents a direction", () => {
  assert.deepEqual(
    executiveVerdict(
      summaryOf({ headline: product(null, null, "MISSING") }),
      "productRevenue",
    ),
    {
      tone: "unknown",
      text: "Продажи за этот период ещё не подтверждены, вывод появится после загрузки данных из Langame.",
    },
  );
  const noComparison = executiveVerdict(
    summaryOf({
      headline: product(100_000, null),
      comparison: false,
      contributions: [{ factor: "VISITS", amount: 5_000 }],
    }),
    "productRevenue",
  );
  assert.equal(noComparison.tone, "unknown");
  assert.equal(
    noComparison.text,
    "Выручка бара без сравнения: сравнение с прошлым периодом выключено.",
  );
  assert.equal(
    executiveVerdict(
      summaryOf({ headline: product(100_000, 0) }),
      "productRevenue",
    ).text,
    "Выручка бара не с чем сравнить: за 16.09–22.09 нет подтверждённых продаж.",
  );
});

test("total revenue is named when services are confirmed", () => {
  const summary = summaryOf() as unknown as {
    metrics: Record<string, unknown>;
  };
  summary.metrics.revenue = product(300_000, 250_000);
  assert.match(
    executiveVerdict(summary as never, "revenue").text,
    /^Выручка на 20% выше/u,
  );
});

test("a club without sales is named as such, not as the biggest decline", () => {
  const silent = {
    ...product(22_860, 69_910),
    factAsOf: "2026-09-25T10:00:00.000Z",
  };
  const verdict = executiveVerdict(
    summaryOf({
      headline: product(88_000, 100_000),
      clubs: [
        ["a", silent],
        ["b", product(7_000, 10_000)],
      ],
    }),
    "productRevenue",
  );
  assert.equal(
    verdict.text,
    "Выручка бара на 12% ниже, чем 16.09–22.09. Сильнее всего просел Клуб b: на 30%.",
  );
  const onlySilent = executiveVerdict(
    summaryOf({ headline: product(88_000, 100_000), clubs: [["a", silent]] }),
    "productRevenue",
  );
  assert.equal(
    onlySilent.text,
    "Выручка бара на 12% ниже, чем 16.09–22.09. Клуб a без продаж с 26.09.",
  );
});

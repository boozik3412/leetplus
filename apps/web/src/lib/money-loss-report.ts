// «Где теряем деньги»: one loss figure for the period, its parts, the actions
// worth the most and what data is missing for a full count. Pure: the page
// fetches the reports and passes them in, the node:test suite loads it directly.

import type {
  AssortmentMatrixRow,
  OutOfStockRiskProduct,
  ProductWithoutSales,
  ReportRecommendation,
} from "./reports.ts";

export type DataState =
  | "AVAILABLE"
  | "PARTIAL"
  | "STALE"
  | "MISSING"
  | "FAILED"
  | "UNKNOWN";

export type MoneyLossInput = {
  outOfStockRows: OutOfStockRiskProduct[];
  noSalesRows: ProductWithoutSales[];
  writeOffAmount: number | null;
  recommendations: ReportRecommendation[];
  matrixRows: AssortmentMatrixRow[];
  marginCoverage?: {
    state: "READY" | "PARTIAL" | "UNKNOWN";
    coveredRevenue: number;
    totalRevenue: number;
  };
  healthStates?: Array<DataState | undefined>;
};

export type LossPartKey = "deficit" | "writeOffs" | "missingMandatory";

export type LossPart = {
  key: LossPartKey;
  label: string;
  /** Sum over the items we could value; 0 when nothing could be valued. */
  amount: number;
  /** Items behind the figure that have a value. */
  valuedCount: number;
  /** Items we know about but could not value (no price, no peer club). */
  unvaluedCount: number;
  /** The figure is an estimate rather than a booked amount. */
  estimate: boolean;
  /** No source data at all for this part (e.g. write-offs not loaded). */
  unavailable: boolean;
  hint: string;
  href: string;
};

export type DataGap = {
  key:
    | "missingCost"
    | "partialMargin"
    | "noMandatory"
    | "noWriteOffs"
    | "notReady";
  text: string;
  actionLabel: string;
  href: string;
};

export type MoneyLossReport = {
  totalLoss: number;
  parts: LossPart[];
  /** Money tied up in stock without sales: released, not lost, so shown apart. */
  frozen: { amount: number; skuCount: number; unvaluedCount: number };
  actions: ReportRecommendation[];
  actionsEffect: number;
  gaps: DataGap[];
};

const PRODUCTS_TABLE = "/products/table";

function isActive(recommendation: ReportRecommendation) {
  return (
    recommendation.status !== "DONE" &&
    recommendation.status !== "HIDDEN" &&
    recommendation.status !== "REJECTED"
  );
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function isMandatoryCell(row: AssortmentMatrixRow) {
  return row.isMandatory && row.assortmentRole !== "EXCLUDED";
}

/**
 * A mandatory product missing in a club is valued at the median gross profit
 * the same product earned in the clubs where it sold during the period.
 */
function missingMandatoryLoss(rows: AssortmentMatrixRow[]) {
  const peerProfit = new Map<string, number[]>();

  rows.forEach((row) => {
    if (row.isSold && row.grossProfit > 0) {
      const list = peerProfit.get(row.productId) ?? [];
      list.push(row.grossProfit);
      peerProfit.set(row.productId, list);
    }
  });

  let amount = 0;
  let valuedCount = 0;
  let unvaluedCount = 0;

  rows.forEach((row) => {
    if (!isMandatoryCell(row) || row.status !== "MISSING") return;
    const peers = peerProfit.get(row.productId);

    if (peers && peers.length > 0) {
      amount += median(peers);
      valuedCount += 1;
    } else {
      unvaluedCount += 1;
    }
  });

  return { amount, valuedCount, unvaluedCount };
}

export function buildMoneyLossReport(input: MoneyLossInput): MoneyLossReport {
  const deficitValued = input.outOfStockRows.filter(
    (row) => row.grossProfitAtRiskForPeriod !== null,
  );
  const deficit: LossPart = {
    key: "deficit",
    label: "Дефицит",
    amount: deficitValued.reduce(
      (total, row) => total + (row.grossProfitAtRiskForPeriod ?? 0),
      0,
    ),
    valuedCount: deficitValued.length,
    unvaluedCount: input.outOfStockRows.length - deficitValued.length,
    estimate: true,
    unavailable: false,
    hint: "Прибыль, которую не получим: ходовой товар кончается или уже кончился.",
    href: "/products/order",
  };

  const writeOffs: LossPart = {
    key: "writeOffs",
    label: "Списания",
    amount: input.writeOffAmount ?? 0,
    valuedCount: 0,
    unvaluedCount: 0,
    estimate: false,
    unavailable: input.writeOffAmount === null,
    hint: "Товар, списанный за период: просрочка, бой, порча.",
    href: "/products/movement",
  };

  const missing = missingMandatoryLoss(input.matrixRows);
  const missingMandatory: LossPart = {
    key: "missingMandatory",
    label: "Нет обязательных товаров",
    amount: missing.amount,
    valuedCount: missing.valuedCount,
    unvaluedCount: missing.unvaluedCount,
    estimate: true,
    unavailable: false,
    hint: "Обязательный товар не заведён в клубе. Оценка по тому, сколько он приносит в других клубах.",
    href: "/reports/assortment-matrix/table",
  };

  const parts = [deficit, writeOffs, missingMandatory].sort(
    (a, b) => b.amount - a.amount,
  );

  const frozenValued = input.noSalesRows.filter(
    (row) => row.frozenStockAmount !== null,
  );
  const frozen = {
    amount: frozenValued.reduce(
      (total, row) => total + (row.frozenStockAmount ?? 0),
      0,
    ),
    skuCount: input.noSalesRows.length,
    unvaluedCount: input.noSalesRows.length - frozenValued.length,
  };

  const actions = input.recommendations
    .filter(isActive)
    .filter((item) => item.effectAmount > 0)
    .sort((a, b) => b.effectAmount - a.effectAmount)
    .slice(0, 5);

  return {
    totalLoss: parts.reduce((total, part) => total + part.amount, 0),
    parts,
    frozen,
    actions,
    actionsEffect: actions.reduce(
      (total, item) => total + item.effectAmount,
      0,
    ),
    gaps: buildDataGaps(input, deficit, frozen.unvaluedCount),
  };
}

function plural(count: number, one: string, few: string, many: string) {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function buildDataGaps(
  input: MoneyLossInput,
  deficit: LossPart,
  frozenUnvalued: number,
): DataGap[] {
  const gaps: DataGap[] = [];
  const unpriced = deficit.unvaluedCount + frozenUnvalued;

  if (
    input.healthStates?.some(
      (state) =>
        state === "STALE" ||
        state === "MISSING" ||
        state === "FAILED" ||
        state === "UNKNOWN",
    )
  ) {
    gaps.push({
      key: "notReady",
      text: "Данные из Langame за период ещё не догрузились, поэтому цифры могут быть меньше реальных.",
      actionLabel: "Проверить подключение",
      href: "/connections",
    });
  }

  if (unpriced > 0) {
    gaps.push({
      key: "missingCost",
      text: `У ${unpriced} ${plural(unpriced, "товара", "товаров", "товаров")} нет входящей цены, их потери не посчитаны.`,
      actionLabel: "Заполнить входящие цены",
      href: PRODUCTS_TABLE,
    });
  }

  const coverage = input.marginCoverage;

  if (
    coverage &&
    coverage.state !== "READY" &&
    coverage.totalRevenue > 0 &&
    coverage.coveredRevenue < coverage.totalRevenue
  ) {
    const percent = Math.floor(
      (coverage.coveredRevenue / coverage.totalRevenue) * 100,
    );
    gaps.push({
      key: "partialMargin",
      text: `Себестоимость известна только для ${percent}% выручки, прибыль и дефицит посчитаны по этой части.`,
      actionLabel: "Заполнить входящие цены",
      href: PRODUCTS_TABLE,
    });
  }

  if (!input.matrixRows.some(isMandatoryCell)) {
    gaps.push({
      key: "noMandatory",
      text: "Не отмечены обязательные товары, поэтому не видно, чего не хватает в клубах.",
      actionLabel: "Отметить обязательные",
      href: PRODUCTS_TABLE,
    });
  }

  if (input.writeOffAmount === null) {
    gaps.push({
      key: "noWriteOffs",
      text: "Списания за период не загружены, в итог они не вошли.",
      actionLabel: "Проверить подключение",
      href: "/connections",
    });
  }

  return gaps;
}

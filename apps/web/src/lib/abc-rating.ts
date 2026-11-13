import type { AbcGroup, SkuPerformanceRow } from "./reports";

/**
 * «Рейтинг SKU и ABC»: rows, the revenue × profit matrix and the Pareto curve
 * of the screen. Groups come from the API (cumulative share before the row:
 * under 80% → A, under 95% → B, else C); this module only arranges them.
 */

export const ABC_GROUPS: readonly AbcGroup[] = ["A", "B", "C"];

export const ABC_RATING_VIEWS = ["matrix", "table"] as const;
export type AbcRatingView = (typeof ABC_RATING_VIEWS)[number];

export function isAbcRatingView(
  value: string | undefined,
): value is AbcRatingView {
  return ABC_RATING_VIEWS.includes(value as AbcRatingView);
}

/** Revenue group first, profit group second: "AC" = A by revenue, C by profit. */
export type AbcCellKey = `${AbcGroup}${AbcGroup}`;

export function isAbcCellKey(value: string | undefined): value is AbcCellKey {
  return (
    typeof value === "string" &&
    value.length === 2 &&
    ABC_GROUPS.includes(value[0] as AbcGroup) &&
    ABC_GROUPS.includes(value[1] as AbcGroup)
  );
}

export type AbcRatingRow = {
  key: string;
  rank: number;
  article: string;
  name: string;
  categoryName: string;
  supplierName: string | null;
  soldQuantity: number;
  revenue: number;
  grossProfit: number;
  marginPercent: number;
  revenueSharePercent: number;
  profitSharePercent: number;
  /** Revenue share of this row and every row above it. */
  cumulativeRevenuePercent: number;
  salesPerFacing: number;
  abcRevenueGroup: AbcGroup;
  abcProfitGroup: AbcGroup;
  cell: AbcCellKey;
  /** Sold, but the purchase price is unknown: profit equals revenue. */
  costMissing: boolean;
};

export const NO_CATEGORY = "Без категории";

/** Rows ranked by revenue, with the running share and rounded margin. */
export function buildAbcRatingRows(
  rows: readonly SkuPerformanceRow[],
): AbcRatingRow[] {
  const ranked = [...rows].sort(
    (a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name, "ru"),
  );
  const total = ranked.reduce((sum, row) => sum + Math.max(0, row.revenue), 0);
  let cumulative = 0;
  return ranked.map((row, index) => {
    cumulative += Math.max(0, row.revenue);
    return {
      key: `${row.productId}:${index}`,
      rank: index + 1,
      article: row.article,
      name: row.name.trim(),
      categoryName: row.categoryName ?? NO_CATEGORY,
      supplierName: row.supplierName,
      soldQuantity: row.soldQuantity,
      revenue: row.revenue,
      grossProfit: row.grossProfit,
      marginPercent: round1(
        row.revenue > 0 ? (row.grossProfit / row.revenue) * 100 : 0,
      ),
      revenueSharePercent: round1(row.revenueSharePercent),
      profitSharePercent: round1(row.profitSharePercent),
      cumulativeRevenuePercent:
        total > 0 ? round1((cumulative / total) * 100) : 0,
      salesPerFacing: row.salesPerFacing,
      abcRevenueGroup: row.abcRevenueGroup,
      abcProfitGroup: row.abcProfitGroup,
      cell: `${row.abcRevenueGroup}${row.abcProfitGroup}`,
      costMissing: row.revenue > 0 && row.cost <= 0,
    };
  });
}

export type AbcCellTone = "core" | "middle" | "tail" | "mismatch" | "plain";

export const ABC_CELL_TEXT: Record<
  AbcCellKey,
  { title: string; advice: string; tone: AbcCellTone }
> = {
  AA: {
    title: "Ядро ассортимента",
    advice:
      "Дают и выручку, и прибыль. Не допускать отсутствия, заказывать с запасом, следить за ценой.",
    tone: "core",
  },
  AB: {
    title: "Продаются хорошо, маржа ниже",
    advice:
      "Оборот большой, но зарабатываем меньше, чем могли бы. Проверить закупочную цену и наценку.",
    tone: "mismatch",
  },
  AC: {
    title: "Много выручки, мало прибыли",
    advice:
      "Оборот есть, а денег почти нет. Первое место, где стоит пересмотреть цену или поставщика.",
    tone: "mismatch",
  },
  BA: {
    title: "Выгодные, продаются средне",
    advice:
      "Зарабатываем на них хорошо. Стоит продвигать: выкладка у кассы, комбо, советы администраторов.",
    tone: "mismatch",
  },
  BB: {
    title: "Середина",
    advice: "Держим в ассортименте, отдельного внимания не требуют.",
    tone: "middle",
  },
  BC: {
    title: "Средние продажи, низкая маржа",
    advice:
      "Поднять цену или найти закупку дешевле; если не выходит, заменить товар.",
    tone: "mismatch",
  },
  CA: {
    title: "Продаются редко, но выгодно",
    advice: "Можно попробовать продвинуть.",
    tone: "mismatch",
  },
  CB: {
    title: "Мало продаж, нормальная маржа",
    advice: "Держать понемногу, не заказывать впрок.",
    tone: "plain",
  },
  CC: {
    title: "Хвост",
    advice:
      "Почти не приносят денег. Кандидаты на вывод или замену: не заказывать впрок, распродать остаток.",
    tone: "tail",
  },
};

export type AbcCell = {
  key: AbcCellKey;
  revenueGroup: AbcGroup;
  profitGroup: AbcGroup;
  count: number;
  revenue: number;
  grossProfit: number;
};

/** Nine cells, profit A row first, revenue A column first. */
export function buildAbcMatrix(rows: readonly AbcRatingRow[]): AbcCell[] {
  return ABC_GROUPS.flatMap((profitGroup) =>
    ABC_GROUPS.map((revenueGroup) => {
      const key: AbcCellKey = `${revenueGroup}${profitGroup}`;
      const cellRows = rows.filter((row) => row.cell === key);
      return {
        key,
        revenueGroup,
        profitGroup,
        count: cellRows.length,
        revenue: round2(sum(cellRows, (row) => row.revenue)),
        grossProfit: round2(sum(cellRows, (row) => row.grossProfit)),
      };
    }),
  );
}

/**
 * The cell to open first: the mismatch with the most revenue, where there is
 * something to do; the core when revenue and profit agree everywhere.
 */
export function defaultAbcCell(cells: readonly AbcCell[]): AbcCellKey {
  const mismatch = cells
    .filter(
      (cell) => cell.count > 0 && ABC_CELL_TEXT[cell.key].tone === "mismatch",
    )
    .sort((a, b) => b.revenue - a.revenue)[0];
  return mismatch?.key ?? "AA";
}

export type AbcGroupTotals = {
  group: AbcGroup;
  count: number;
  revenue: number;
  grossProfit: number;
  countSharePercent: number;
  revenueSharePercent: number;
  profitSharePercent: number;
};

/** Totals of the revenue groups. */
export function abcRevenueGroupTotals(
  rows: readonly AbcRatingRow[],
): AbcGroupTotals[] {
  const revenue = sum(rows, (row) => row.revenue);
  const profit = sum(rows, (row) => row.grossProfit);
  return ABC_GROUPS.map((group) => {
    const groupRows = rows.filter((row) => row.abcRevenueGroup === group);
    const groupRevenue = sum(groupRows, (row) => row.revenue);
    const groupProfit = sum(groupRows, (row) => row.grossProfit);
    return {
      group,
      count: groupRows.length,
      revenue: round2(groupRevenue),
      grossProfit: round2(groupProfit),
      countSharePercent: share(groupRows.length, rows.length),
      revenueSharePercent: share(groupRevenue, revenue),
      profitSharePercent: share(groupProfit, profit),
    };
  });
}

/**
 * Pareto curve: share of products (x) against the running revenue share (y),
 * both 0–100, thinned to at most `maxPoints` points for drawing.
 */
export function abcParetoPoints(
  rows: readonly AbcRatingRow[],
  maxPoints = 120,
): { x: number; y: number }[] {
  if (rows.length === 0) return [];
  const step = Math.max(1, Math.ceil(rows.length / maxPoints));
  const points = [{ x: 0, y: 0 }];
  rows.forEach((row, index) => {
    if ((index + 1) % step === 0 || index === rows.length - 1) {
      points.push({
        x: round1(((index + 1) / rows.length) * 100),
        y: row.cumulativeRevenuePercent,
      });
    }
  });
  return points;
}

function sum<T>(rows: readonly T[], pick: (row: T) => number) {
  return rows.reduce((total, row) => total + pick(row), 0);
}

function share(part: number, whole: number) {
  return whole > 0 ? round1((part / whole) * 100) : 0;
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

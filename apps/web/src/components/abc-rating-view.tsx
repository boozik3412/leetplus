"use client";

import { useEffect, useMemo, useState } from "react";

import {
  ABC_CELL_TEXT,
  ABC_GROUPS,
  abcParetoPoints,
  abcRevenueGroupTotals,
  buildAbcMatrix,
  buildAbcRatingRows,
  defaultAbcCell,
  type AbcCell,
  type AbcCellKey,
  type AbcCellTone,
  type AbcRatingRow,
  type AbcRatingView,
} from "@/lib/abc-rating";
import type { AbcGroup, SkuPerformanceReport } from "@/lib/reports";
import {
  Cell,
  HeaderCell,
  MultiSelect,
  SummaryTile,
  type SortDirection,
  type TableColumn,
} from "@/components/report-table-kit";
import {
  csvNumber,
  downloadCsv,
  formatInt,
  formatMoney,
  formatQuantity,
  unique,
} from "@/lib/report-table-format";

const PAGE_SIZE = 200;
const CELL_LIST_SIZE = 15;
const EXPLAINER_KEY = "abc-rating-explainer";

type ColumnKey =
  | "rank"
  | "name"
  | "abcRevenueGroup"
  | "abcProfitGroup"
  | "soldQuantity"
  | "revenue"
  | "grossProfit"
  | "marginPercent"
  | "revenueSharePercent"
  | "cumulativeRevenuePercent"
  | "salesPerFacing";

const COLUMNS: TableColumn<ColumnKey>[] = [
  { key: "rank", label: "Место", align: "right" },
  { key: "name", label: "Товар" },
  {
    key: "abcRevenueGroup",
    label: "ABC выручка",
    hint: "A — товары, дающие первые 80% выручки, B — следующие 15%, C — остальное.",
  },
  {
    key: "abcProfitGroup",
    label: "ABC прибыль",
    hint: "То же разбиение по валовой прибыли.",
  },
  { key: "soldQuantity", label: "Продано, шт.", align: "right" },
  { key: "revenue", label: "Выручка", align: "right" },
  { key: "grossProfit", label: "Прибыль", align: "right" },
  {
    key: "marginPercent",
    label: "Маржа",
    align: "right",
    hint: "Прибыль ÷ выручка.",
  },
  { key: "revenueSharePercent", label: "Доля выручки", align: "right" },
  {
    key: "cumulativeRevenuePercent",
    label: "Накопленно",
    align: "right",
    hint: "Доля выручки этого товара и всех товаров выше. Граница A — 80%, B — 95%.",
  },
  {
    key: "salesPerFacing",
    label: "Продажи на фейс",
    align: "right",
    hint: "Продано штук на одно место на полке.",
  },
];

const GROUP_BADGE: Record<AbcGroup, string> = {
  A: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  B: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  C: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

const GROUP_FILL: Record<AbcGroup, string> = {
  A: "fill-emerald-100 dark:fill-emerald-950/70",
  B: "fill-amber-100 dark:fill-amber-950/60",
  C: "fill-zinc-100 dark:fill-zinc-900",
};

const CELL_TONE: Record<AbcCellTone, string> = {
  core: "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40",
  middle:
    "border-amber-200 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/25",
  tail: "border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900",
  mismatch:
    "border-orange-400 bg-white dark:border-orange-500/70 dark:bg-zinc-950",
  plain: "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950",
};

export function AbcRatingView({
  report,
  initialView,
  initialCell,
}: {
  report: SkuPerformanceReport;
  initialView: AbcRatingView;
  initialCell: AbcCellKey | null;
}) {
  const rows = useMemo(() => buildAbcRatingRows(report.rows), [report.rows]);
  const cells = useMemo(() => buildAbcMatrix(rows), [rows]);
  const groups = useMemo(() => abcRevenueGroupTotals(rows), [rows]);
  const totalRevenue = rows.reduce((sum, row) => sum + row.revenue, 0);
  const totalProfit = rows.reduce((sum, row) => sum + row.grossProfit, 0);
  const costMissing = rows.filter((row) => row.costMissing).length;

  const [view, setView] = useState<AbcRatingView>(initialView);
  const [cell, setCell] = useState<AbcCellKey>(
    initialCell ?? defaultAbcCell(cells),
  );
  const [cellFilter, setCellFilter] = useState<AbcCellKey | null>(
    initialView === "table" ? initialCell : null,
  );

  function updateAddress(next: {
    view: AbcRatingView;
    cell: AbcCellKey | null;
  }) {
    const params = new URLSearchParams(window.location.search);
    if (next.view === "table") params.set("view", "table");
    else params.delete("view");
    if (next.cell) params.set("cell", next.cell);
    else params.delete("cell");
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}`,
    );
  }

  function showView(next: AbcRatingView) {
    setView(next);
    if (next === "matrix") setCellFilter(null);
    updateAddress({ view: next, cell: next === "matrix" ? cell : null });
  }

  function selectCell(next: AbcCellKey) {
    setCell(next);
    updateAddress({ view: "matrix", cell: next });
  }

  function openCellInTable(next: AbcCellKey) {
    setCellFilter(next);
    setView("table");
    updateAddress({ view: "table", cell: next });
  }

  const groupA = groups[0];

  return (
    <div>
      <Explainer rows={rows} groupA={groupA} />

      <section
        aria-label="Итоги"
        className="grid grid-cols-2 gap-3 px-4 pb-4 lg:grid-cols-5"
      >
        <SummaryTile
          label="Выручка"
          value={formatMoney(totalRevenue)}
          hint="без отменённых продаж"
        />
        <SummaryTile
          label="Валовая прибыль"
          value={formatMoney(totalProfit)}
          hint={`маржа ${formatPercent(totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0)}`}
        />
        <SummaryTile
          label="Товаров с продажами"
          value={formatInt(rows.length)}
        />
        <SummaryTile
          label="Группа A"
          value={`${formatInt(groupA.count)} тов.`}
          hint={`${formatPercent(groupA.countSharePercent)} ассортимента дают ${formatPercent(groupA.revenueSharePercent)} выручки`}
        />
        {costMissing > 0 ? (
          <SummaryTile
            label="Без закупочной цены"
            value={`${formatInt(costMissing)} тов.`}
            hint="прибыль = выручка, маржа 100%"
            tone="orange"
          />
        ) : (
          <SummaryTile
            label="Хвост C"
            value={`${formatInt(groups[2].count)} тов.`}
            hint={`${formatPercent(groups[2].revenueSharePercent)} выручки`}
          />
        )}
      </section>

      <div className="flex flex-col gap-2 px-4 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          role="radiogroup"
          aria-label="Вид отчёта"
          className="inline-flex w-fit rounded-lg border border-zinc-300 p-0.5 dark:border-zinc-700"
        >
          {(
            [
              ["matrix", "Наглядно"],
              ["table", "Таблица"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={view === value}
              onClick={() => showView(value)}
              className={[
                "cursor-pointer rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
                view === value
                  ? "bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950"
                  : "text-zinc-600 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-white",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-sm text-zinc-500">
          {view === "matrix"
            ? "Что приносит деньги и что с этим делать"
            : "Все цифры по товарам, сортировка по любой колонке"}
        </p>
      </div>

      {view === "matrix" ? (
        <Matrix
          rows={rows}
          cells={cells}
          selected={cell}
          onSelect={selectCell}
          onOpenTable={openCellInTable}
        />
      ) : (
        <RatingTable
          rows={rows}
          report={report}
          cellFilter={cellFilter}
          onClearCell={() => {
            setCellFilter(null);
            updateAddress({ view: "table", cell: null });
          }}
        />
      )}
    </div>
  );
}

function Explainer({
  rows,
  groupA,
}: {
  rows: AbcRatingRow[];
  groupA: ReturnType<typeof abcRevenueGroupTotals>[number];
}) {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    // A remembered choice can only be read after hydration.
    const timeoutId = window.setTimeout(() => {
      try {
        if (window.localStorage.getItem(EXPLAINER_KEY) === "closed") {
          setOpen(false);
        }
      } catch {
        // Storage may be blocked; the explainer then stays open.
      }
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  return (
    <details
      open={open}
      onToggle={(event) => {
        const next = event.currentTarget.open;
        setOpen(next);
        try {
          window.localStorage.setItem(EXPLAINER_KEY, next ? "open" : "closed");
        } catch {
          // Not remembered when storage is blocked.
        }
      }}
      className="mx-4 mb-4 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300"
    >
      <summary className="cursor-pointer font-semibold text-zinc-950 dark:text-zinc-100">
        Как читать этот отчёт
      </summary>
      <div className="mt-3 grid gap-5 lg:grid-cols-3">
        <div className="space-y-2">
          <h2 className="font-semibold text-zinc-950 dark:text-zinc-100">
            Зачем он нужен
          </h2>
          <p>
            Показывает, какие товары приносят клубу основные деньги, а какие
            только занимают полку, холодильник и деньги в остатке. Обычно
            небольшая часть товаров даёт почти всю выручку.
          </p>
          <p>
            Отчёт помогает решить, что держать всегда, что продвигать, а что
            можно убрать из закупки.
          </p>
        </div>
        <div className="space-y-2">
          <h2 className="font-semibold text-zinc-950 dark:text-zinc-100">
            Как товары делятся на A, B и C
          </h2>
          <p>
            Товары выстраиваются по выручке за период, от самого продаваемого, и
            их выручка складывается сверху вниз. Товары, которые вместе дают
            первые 80% выручки, это <GroupBadge group="A" />, следующие 15% это{" "}
            <GroupBadge group="B" />, последние 5% это <GroupBadge group="C" />.
          </p>
          <p>
            Так же отдельно считается группа по валовой прибыли: выручка минус
            закупочная цена проданного. Отменённые продажи не учитываются, дни
            считаются по дням клуба.
          </p>
        </div>
        <div className="space-y-2">
          <h2 className="font-semibold text-zinc-950 dark:text-zinc-100">
            Что с этим делать
          </h2>
          <ul className="space-y-1.5">
            <li>
              <GroupBadge group="A" /> никогда не должно кончаться. Проверяйте
              их первыми в «Заказе товаров».
            </li>
            <li>
              <GroupBadge group="B" /> держим в ассортименте, выгодные
              продвигаем до A.
            </li>
            <li>
              <GroupBadge group="C" /> кандидаты на вывод или замену: не
              заказывать впрок, распродать остаток.
            </li>
            <li>
              Если группы по выручке и по прибыли расходятся, у товара проблема
              с ценой или закупкой. Такие клетки матрицы обведены оранжевым.
            </li>
          </ul>
        </div>
      </div>
      {rows.length > 0 ? (
        <figure className="mt-4 border-t border-zinc-200 pt-3 dark:border-zinc-800">
          <figcaption className="font-medium text-zinc-950 dark:text-zinc-100">
            На ваших данных: {formatInt(groupA.count)} тов. (
            {formatPercent(groupA.countSharePercent)} ассортимента) дают{" "}
            {formatPercent(groupA.revenueSharePercent)} выручки
          </figcaption>
          <ParetoChart rows={rows} />
        </figure>
      ) : null}
    </details>
  );
}

function ParetoChart({ rows }: { rows: AbcRatingRow[] }) {
  const points = abcParetoPoints(rows);
  const width = 720;
  const height = 170;
  const left = 40;
  const right = 12;
  const top = 12;
  const bottom = 26;
  const innerWidth = width - left - right;
  const innerHeight = height - top - bottom;
  const x = (value: number) => left + (value / 100) * innerWidth;
  const y = (value: number) => top + (1 - value / 100) * innerHeight;
  const counts = ABC_GROUPS.map(
    (group) => rows.filter((row) => row.abcRevenueGroup === group).length,
  );
  const edges = [0, counts[0], counts[0] + counts[1], rows.length].map(
    (count) => (count / rows.length) * 100,
  );
  const path = points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"}${x(point.x).toFixed(1)} ${y(point.y).toFixed(1)}`,
    )
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Накопленная доля выручки по товарам от самых продаваемых"
      className="mt-2 h-auto w-full max-w-3xl text-zinc-500"
    >
      {ABC_GROUPS.map((group, index) => (
        <g key={group}>
          <rect
            x={x(edges[index])}
            y={top}
            width={Math.max(0, x(edges[index + 1]) - x(edges[index]))}
            height={innerHeight}
            className={GROUP_FILL[group]}
          />
          {edges[index + 1] - edges[index] > 6 ? (
            <text
              x={(x(edges[index]) + x(edges[index + 1])) / 2}
              y={top + innerHeight - 8}
              textAnchor="middle"
              className="fill-zinc-700 text-[12px] font-semibold dark:fill-zinc-200"
            >
              {group} · {formatInt(counts[index])}
            </text>
          ) : null}
        </g>
      ))}
      {[0, 50, 80, 100].map((value) => (
        <g key={value}>
          <line
            x1={left}
            x2={width - right}
            y1={y(value)}
            y2={y(value)}
            className="stroke-zinc-300 dark:stroke-zinc-700"
            strokeDasharray={value === 80 ? "4 4" : undefined}
          />
          <text
            x={left - 6}
            y={y(value) + 4}
            textAnchor="end"
            className="fill-current text-[11px]"
          >
            {value}%
          </text>
        </g>
      ))}
      <path
        d={path}
        fill="none"
        strokeWidth={2}
        className="stroke-zinc-900 dark:stroke-zinc-100"
      />
      <text
        x={left + innerWidth / 2}
        y={height - 6}
        textAnchor="middle"
        className="fill-current text-[11px]"
      >
        доля товаров, от самых продаваемых → накопленная доля выручки
      </text>
    </svg>
  );
}

function Matrix({
  rows,
  cells,
  selected,
  onSelect,
  onOpenTable,
}: {
  rows: AbcRatingRow[];
  cells: AbcCell[];
  selected: AbcCellKey;
  onSelect: (key: AbcCellKey) => void;
  onOpenTable: (key: AbcCellKey) => void;
}) {
  const selectedRows = rows.filter((row) => row.cell === selected);
  const text = ABC_CELL_TEXT[selected];

  return (
    <section
      aria-label="Матрица выручка × прибыль"
      className="mx-4 mb-6 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
    >
      <div className="flex flex-col gap-1 lg:flex-row lg:items-baseline lg:justify-between">
        <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-100">
          Выручка и прибыль вместе
        </h2>
        <p className="max-w-2xl text-sm text-zinc-600 dark:text-zinc-300">
          Столбец — группа товара по выручке, строка — по прибыли. Нажмите на
          клетку, чтобы увидеть товары и что с ними делать.
        </p>
      </div>
      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-start">
        <div className="grid grid-cols-[auto_repeat(3,minmax(0,1fr))] gap-1.5 sm:gap-2">
          <span />
          {ABC_GROUPS.map((group) => (
            <span
              key={group}
              className="flex items-center justify-center gap-1.5 text-xs text-zinc-500"
            >
              <span className="hidden sm:inline">Выручка</span>
              <GroupBadge group={group} />
            </span>
          ))}
          {ABC_GROUPS.map((profitGroup) => (
            <MatrixRow
              key={profitGroup}
              profitGroup={profitGroup}
              cells={cells.filter((item) => item.profitGroup === profitGroup)}
              selected={selected}
              onSelect={onSelect}
            />
          ))}
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <GroupBadge group={selected[0] as AbcGroup} />
            <GroupBadge group={selected[1] as AbcGroup} />
            <h3 className="font-semibold text-zinc-950 dark:text-zinc-100">
              {text.title} · {formatInt(selectedRows.length)} тов.
            </h3>
          </div>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            {text.advice}
          </p>
          {selectedRows.length > 0 ? (
            <ul className="mt-3 border-t border-zinc-200 dark:border-zinc-800">
              {selectedRows.slice(0, CELL_LIST_SIZE).map((row) => (
                <li
                  key={row.key}
                  className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-3 border-b border-zinc-100 py-2 text-sm dark:border-zinc-800/60"
                >
                  <span className="min-w-0">
                    <span className="break-words text-zinc-950 dark:text-zinc-100">
                      {row.name}
                    </span>
                    {row.costMissing ? <CostMissingMark /> : null}
                    <span className="block text-xs text-zinc-500">
                      {row.categoryName} · {formatQuantity(row.soldQuantity)}{" "}
                      шт.
                    </span>
                  </span>
                  <span className="text-right tabular-nums">
                    {formatMoney(row.revenue)}
                    <span className="block text-xs text-zinc-500">выручка</span>
                  </span>
                  <span className="text-right tabular-nums">
                    {formatPercent(row.marginPercent)}
                    <span className="block text-xs text-zinc-500">маржа</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {selectedRows.length > 0 ? (
            <button
              type="button"
              onClick={() => onOpenTable(selected)}
              className="mt-3 cursor-pointer rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
            >
              {selectedRows.length > CELL_LIST_SIZE
                ? `Все ${formatInt(selectedRows.length)} тов. в таблице`
                : "Открыть в таблице"}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function MatrixRow({
  profitGroup,
  cells,
  selected,
  onSelect,
}: {
  profitGroup: AbcGroup;
  cells: AbcCell[];
  selected: AbcCellKey;
  onSelect: (key: AbcCellKey) => void;
}) {
  return (
    <>
      <span className="flex items-center justify-end gap-1.5 pr-1 text-xs text-zinc-500">
        <span className="hidden sm:inline">Прибыль</span>
        <GroupBadge group={profitGroup} />
      </span>
      {cells.map((item) => {
        const text = ABC_CELL_TEXT[item.key];
        const active = item.key === selected;
        return (
          <button
            key={item.key}
            type="button"
            aria-pressed={active}
            disabled={item.count === 0}
            onClick={() => onSelect(item.key)}
            className={[
              "flex min-h-24 min-w-0 cursor-pointer flex-col items-start gap-0.5 rounded-xl border p-2 text-left transition-shadow disabled:cursor-default disabled:opacity-50 sm:p-3",
              CELL_TONE[text.tone],
              active
                ? "ring-2 ring-zinc-900 ring-offset-1 ring-offset-white dark:ring-zinc-100 dark:ring-offset-zinc-950"
                : "hover:shadow-sm",
            ].join(" ")}
          >
            <span className="text-xl font-semibold tabular-nums text-zinc-950 sm:text-2xl dark:text-zinc-100">
              {formatInt(item.count)}
            </span>
            <span className="text-[11px] font-medium leading-tight text-zinc-800 sm:text-xs dark:text-zinc-200">
              {text.title}
            </span>
            <span className="text-[11px] tabular-nums text-zinc-500 sm:text-xs">
              {item.count > 0 ? formatMoney(item.revenue) : "нет товаров"}
            </span>
          </button>
        );
      })}
    </>
  );
}

function RatingTable({
  rows,
  report,
  cellFilter,
  onClearCell,
}: {
  rows: AbcRatingRow[];
  report: SkuPerformanceReport;
  cellFilter: AbcCellKey | null;
  onClearCell: () => void;
}) {
  const [query, setQuery] = useState("");
  const [revenueGroups, setRevenueGroups] = useState<AbcGroup[]>([]);
  const [profitGroups, setProfitGroups] = useState<AbcGroup[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [suppliers, setSuppliers] = useState<string[]>([]);
  const [onlyCostMissing, setOnlyCostMissing] = useState(false);
  const [sortKey, setSortKey] = useState<ColumnKey>("rank");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [visible, setVisible] = useState(PAGE_SIZE);

  const categoryOptions = useMemo(
    () => unique(rows.map((row) => row.categoryName)),
    [rows],
  );
  const supplierOptions = useMemo(
    () =>
      unique(
        rows.flatMap((row) => (row.supplierName ? [row.supplierName] : [])),
      ),
    [rows],
  );
  const costMissingCount = rows.filter((row) => row.costMissing).length;

  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    return rows.filter(
      (row) =>
        (!cellFilter || row.cell === cellFilter) &&
        (revenueGroups.length === 0 ||
          revenueGroups.includes(row.abcRevenueGroup)) &&
        (profitGroups.length === 0 ||
          profitGroups.includes(row.abcProfitGroup)) &&
        (categories.length === 0 || categories.includes(row.categoryName)) &&
        (suppliers.length === 0 ||
          (row.supplierName !== null &&
            suppliers.includes(row.supplierName))) &&
        (!onlyCostMissing || row.costMissing) &&
        (!search ||
          row.name.toLowerCase().includes(search) ||
          row.article.toLowerCase().includes(search)),
    );
  }, [
    rows,
    cellFilter,
    revenueGroups,
    profitGroups,
    categories,
    suppliers,
    onlyCostMissing,
    query,
  ]);

  const sorted = useMemo(() => {
    const direction = sortDirection === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const left = a[sortKey];
      const right = b[sortKey];
      const result =
        typeof left === "string" && typeof right === "string"
          ? left.localeCompare(right, "ru")
          : Number(left) - Number(right);
      return result * direction || a.rank - b.rank;
    });
  }, [filtered, sortKey, sortDirection]);

  const shown = sorted.slice(0, visible);
  const hasFilters =
    query !== "" ||
    revenueGroups.length > 0 ||
    profitGroups.length > 0 ||
    categories.length > 0 ||
    suppliers.length > 0 ||
    onlyCostMissing;

  function toggleSort(key: ColumnKey) {
    setVisible(PAGE_SIZE);
    if (key === sortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection(
      key === "rank" || key === "name" || key.startsWith("abc")
        ? "asc"
        : "desc",
    );
  }

  function resetFilters() {
    setQuery("");
    setRevenueGroups([]);
    setProfitGroups([]);
    setCategories([]);
    setSuppliers([]);
    setOnlyCostMissing(false);
    setVisible(PAGE_SIZE);
  }

  function exportCsv() {
    downloadCsv(`abc-rating-${report.from}-${report.to}.csv`, [
      [
        "Место",
        "Артикул",
        "Товар",
        "Категория",
        "Поставщик",
        "ABC выручка",
        "ABC прибыль",
        "Продано, шт.",
        "Выручка, ₽",
        "Прибыль, ₽",
        "Маржа, %",
        "Доля выручки, %",
        "Накопленно, %",
        "Продажи на фейс",
        "Нет закупочной цены",
      ],
      ...sorted.map((row) => [
        String(row.rank),
        row.article,
        row.name,
        row.categoryName,
        row.supplierName ?? "",
        row.abcRevenueGroup,
        row.abcProfitGroup,
        csvNumber(row.soldQuantity),
        csvNumber(row.revenue),
        csvNumber(row.grossProfit),
        csvNumber(row.marginPercent),
        csvNumber(row.revenueSharePercent),
        csvNumber(row.cumulativeRevenuePercent),
        csvNumber(row.salesPerFacing),
        row.costMissing ? "да" : "",
      ]),
    ]);
  }

  return (
    <div>
      <div className="space-y-3 border-y border-zinc-200 bg-white px-4 py-4 dark:border-zinc-800/45 dark:bg-zinc-950">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.4fr)_repeat(2,minmax(0,1fr))] xl:items-end">
          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Поиск
            </span>
            <input
              type="search"
              value={query}
              onChange={(event) => {
                setVisible(PAGE_SIZE);
                setQuery(event.target.value);
              }}
              placeholder="Название или артикул"
              className="mt-2 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-100"
            />
          </label>
          <MultiSelect
            label="Категория"
            options={categoryOptions}
            selected={categories}
            onChange={(value) => {
              setVisible(PAGE_SIZE);
              setCategories(value);
            }}
          />
          {supplierOptions.length > 0 ? (
            <MultiSelect
              label="Поставщик"
              options={supplierOptions}
              selected={suppliers}
              onChange={(value) => {
                setVisible(PAGE_SIZE);
                setSuppliers(value);
              }}
            />
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <GroupChips
            label="ABC выручка"
            selected={revenueGroups}
            onChange={(value) => {
              setVisible(PAGE_SIZE);
              setRevenueGroups(value);
            }}
          />
          <GroupChips
            label="ABC прибыль"
            selected={profitGroups}
            onChange={(value) => {
              setVisible(PAGE_SIZE);
              setProfitGroups(value);
            }}
          />
          {costMissingCount > 0 ? (
            <button
              type="button"
              aria-pressed={onlyCostMissing}
              onClick={() => {
                setVisible(PAGE_SIZE);
                setOnlyCostMissing((current) => !current);
              }}
              className={chipClass(onlyCostMissing)}
            >
              Без закупочной цены ({formatInt(costMissingCount)})
            </button>
          ) : null}
          {cellFilter ? (
            <button
              type="button"
              onClick={onClearCell}
              aria-label={`Убрать фильтр клетки ${ABC_CELL_TEXT[cellFilter].title}`}
              className={chipClass(true)}
            >
              {cellFilter[0]}·{cellFilter[1]} {ABC_CELL_TEXT[cellFilter].title}{" "}
              ✕
            </button>
          ) : null}
          {hasFilters ? (
            <button
              type="button"
              onClick={resetFilters}
              className="cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              Сбросить
            </button>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-zinc-500">
            Показано {formatInt(shown.length)} из {formatInt(sorted.length)}
          </span>
          <button
            type="button"
            onClick={exportCsv}
            className="cursor-pointer rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
          >
            Скачать CSV (Excel)
          </button>
        </div>
      </div>

      <div className="max-h-[75vh] overflow-auto bg-white dark:bg-zinc-950">
        <table className="w-full min-w-[1180px] border-separate border-spacing-0 text-left text-xs">
          <thead className="sticky top-0 z-20 bg-zinc-100 uppercase text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
            <tr>
              {COLUMNS.map((column) => (
                <HeaderCell
                  key={column.key}
                  column={column}
                  sortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={toggleSort}
                  sticky={column.key === "name"}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr
                key={row.key}
                className="group hover:bg-zinc-50 dark:hover:bg-zinc-900/60"
              >
                <Cell right muted>
                  {row.rank}
                </Cell>
                <td className="sticky left-0 z-10 min-w-[240px] max-w-[340px] whitespace-normal border-b border-zinc-100 bg-white px-3 py-2 group-hover:bg-zinc-50 dark:border-zinc-800/45 dark:bg-zinc-950 dark:group-hover:bg-zinc-900">
                  <div className="font-medium text-zinc-950 dark:text-zinc-100">
                    {row.name}
                    {row.costMissing ? <CostMissingMark /> : null}
                  </div>
                  <div className="text-[11px] text-zinc-500">
                    {row.categoryName} · {row.article}
                    {row.supplierName ? ` · ${row.supplierName}` : ""}
                  </div>
                </td>
                <Cell>
                  <GroupBadge group={row.abcRevenueGroup} />
                </Cell>
                <Cell>
                  <GroupBadge group={row.abcProfitGroup} />
                </Cell>
                <Cell right>{formatQuantity(row.soldQuantity)}</Cell>
                <Cell right strong>
                  {formatMoney(row.revenue)}
                </Cell>
                <Cell right>{formatMoney(row.grossProfit)}</Cell>
                <Cell right>{formatPercent(row.marginPercent)}</Cell>
                <Cell right>{formatPercent(row.revenueSharePercent)}</Cell>
                <Cell right muted>
                  {formatPercent(row.cumulativeRevenuePercent)}
                </Cell>
                <Cell right>{formatQuantity(row.salesPerFacing)}</Cell>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-zinc-500">
            {rows.length === 0
              ? "За период нет продаж."
              : "Под фильтры ничего не подходит."}
          </p>
        ) : null}
      </div>
      {sorted.length > shown.length ? (
        <div className="flex justify-center bg-white py-4 dark:bg-zinc-950">
          <button
            type="button"
            onClick={() => setVisible((current) => current + PAGE_SIZE)}
            className="cursor-pointer rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
          >
            Показать ещё{" "}
            {formatInt(Math.min(PAGE_SIZE, sorted.length - shown.length))}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function GroupChips({
  label,
  selected,
  onChange,
}: {
  label: string;
  selected: AbcGroup[];
  onChange: (value: AbcGroup[]) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-sm">
      <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </span>
      {ABC_GROUPS.map((group) => {
        const active = selected.includes(group);
        return (
          <button
            key={group}
            type="button"
            aria-pressed={active}
            aria-label={`${label}: ${group}`}
            onClick={() =>
              onChange(
                active
                  ? selected.filter((item) => item !== group)
                  : [...selected, group],
              )
            }
            className={chipClass(active)}
          >
            {group}
          </button>
        );
      })}
    </div>
  );
}

function GroupBadge({ group }: { group: AbcGroup }) {
  return (
    <span
      className={`inline-flex h-5 min-w-5 items-center justify-center rounded px-1 text-xs font-bold ${GROUP_BADGE[group]}`}
    >
      {group}
    </span>
  );
}

function CostMissingMark() {
  return (
    <span
      title="Закупочная цена неизвестна: прибыль равна выручке"
      className="ml-1.5 inline-block whitespace-nowrap rounded border border-orange-300 bg-orange-50 px-1 text-[10px] font-semibold text-orange-800 dark:border-orange-800 dark:bg-orange-950/50 dark:text-orange-300"
    >
      нет закупки
    </span>
  );
}

function chipClass(active: boolean) {
  return [
    "min-h-8 cursor-pointer rounded-full border px-3 py-1 text-sm font-medium transition-colors",
    active
      ? "border-zinc-950 bg-zinc-950 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950"
      : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800",
  ].join(" ");
}

function formatPercent(value: number) {
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(value)}%`;
}

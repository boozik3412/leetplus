"use client";

import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";

import type { OrderPlanningReport } from "@/lib/reports";
import {
  csvNumber,
  downloadCsv,
  formatInt,
  formatMoney,
  formatNullable,
  formatQuantity,
  shortDate,
  unique,
} from "@/lib/report-table-format";
import {
  DEFAULT_EXCESS_HORIZON_DAYS,
  EXCESS_HORIZON_OPTIONS,
  NO_CATEGORY,
  NO_SALES_DAY_OPTIONS,
  NO_SUPPLIER,
  STOCK_VALUE_VIEWS,
  buildStockValueRows,
  groupStockValueRows,
  matchesStockValueView,
  stockValueTotals,
  type StockValueBreakdown,
  type StockValueGroupRow,
  type StockValueRow,
  type StockValueView,
} from "@/lib/stock-value";
import {
  Cell,
  HeaderCell,
  MultiSelect,
  SummaryTile,
  type SortDirection,
  type TableColumn,
} from "./report-table-kit";

type RowKey =
  | "name"
  | "storeName"
  | "categoryName"
  | "supplierName"
  | "stockQuantity"
  | "unitCost"
  | "stockValue"
  | "soldQuantity"
  | "averageDailySales"
  | "stockDaysLeft"
  | "lastSaleDay"
  | "daysWithoutSales"
  | "excessQuantity"
  | "excessValue"
  | "daysOutOfStock"
  | "lostProfitPerDay"
  | "lostProfit";

type GroupKey =
  | "label"
  | "positions"
  | "stockQuantity"
  | "stockValue"
  | "share"
  | "excessValue"
  | "lostProfitPerDay"
  | "unpriced";

type ViewPreset = {
  label: string;
  description: (input: { noSalesDays: number; horizonDays: number }) => string;
  sortKey: RowKey;
  groupSortKey: GroupKey;
};

const VIEW_PRESETS: Record<StockValueView, ViewPreset> = {
  frozen: {
    label: "Без продаж",
    description: ({ noSalesDays }) =>
      `Товар лежит на остатке и не продавался ${noSalesDays} дн. или дольше. Сверху то, где заморожено больше всего денег: такой товар стоит перестать заказывать, перевезти в клуб, где он продаётся, или распродать.`,
    sortKey: "stockValue",
    groupSortKey: "stockValue",
  },
  excess: {
    label: "Лишний запас",
    description: ({ horizonDays }) =>
      `Часть остатка, которая не продастся за ${horizonDays} дн. при нынешних продажах. Товар без продаж здесь целиком. Сверху то, где лишних денег больше всего.`,
    sortKey: "excessValue",
    groupSortKey: "excessValue",
  },
  "lost-profit": {
    label: "Нет в наличии: теряем прибыль",
    description: () =>
      "Товар продаётся, а остатка нет. «Теряем в день» — продаж в день × (средняя цена продажи − закупочная цена). Сверху самые большие потери.",
    sortKey: "lostProfitPerDay",
    groupSortKey: "lostProfitPerDay",
  },
  all: {
    label: "Всё в остатке",
    description: () =>
      "Все товары, которые сейчас лежат на остатке. Сверху самые дорогие остатки.",
    sortKey: "stockValue",
    groupSortKey: "stockValue",
  },
};

const BREAKDOWNS: Array<[StockValueBreakdown, string]> = [
  ["product", "Товары"],
  ["store", "Клубы"],
  ["category", "Категории"],
  ["supplier", "Поставщики"],
];

const TEXT_KEYS = new Set<string>([
  "name",
  "storeName",
  "categoryName",
  "supplierName",
  "label",
]);

const PAGE_SIZE = 200;

export function StockValueTable({
  report,
  initialView,
  initialFilters,
}: {
  report: OrderPlanningReport;
  initialView: StockValueView;
  /** Clubs and categories by name, from an old report link. */
  initialFilters?: {
    stores: string[];
    categories: string[];
    noSalesDays: number | null;
  };
}) {
  const pathname = usePathname();
  const noSalesOptions = NO_SALES_DAY_OPTIONS.filter(
    (days) => days <= report.windowDays,
  );
  const requestedNoSalesDays = initialFilters?.noSalesDays ?? null;
  const [view, setView] = useState<StockValueView>(initialView);
  const [noSalesDays, setNoSalesDays] = useState(
    requestedNoSalesDays !== null &&
      noSalesOptions.includes(requestedNoSalesDays)
      ? requestedNoSalesDays
      : (noSalesOptions.filter((days) => days <= 21).at(-1) ??
          noSalesOptions[0]),
  );
  const [horizonDays, setHorizonDays] = useState(DEFAULT_EXCESS_HORIZON_DAYS);
  const [breakdown, setBreakdown] = useState<StockValueBreakdown>("product");
  const [search, setSearch] = useState("");
  const [stores, setStores] = useState<string[]>(initialFilters?.stores ?? []);
  const [categories, setCategories] = useState<string[]>(
    initialFilters?.categories ?? [],
  );
  const [suppliers, setSuppliers] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<RowKey>(
    VIEW_PRESETS[initialView].sortKey,
  );
  const [groupSortKey, setGroupSortKey] = useState<GroupKey>(
    VIEW_PRESETS[initialView].groupSortKey,
  );
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [visible, setVisible] = useState(PAGE_SIZE);

  function updateAddress(next: {
    view?: StockValueView;
    noSalesDays?: number;
  }) {
    // Keep the setup in the address so the link opens the same screen.
    const params = new URLSearchParams(window.location.search);
    if (next.view) params.set("view", next.view);
    if (next.noSalesDays) params.set("noSalesDays", String(next.noSalesDays));
    window.history.replaceState(null, "", `${pathname}?${params.toString()}`);
  }

  function applyView(next: StockValueView) {
    setView(next);
    setSortKey(VIEW_PRESETS[next].sortKey);
    setGroupSortKey(VIEW_PRESETS[next].groupSortKey);
    setSortDirection("desc");
    setVisible(PAGE_SIZE);
    updateAddress({ view: next });
  }

  const allRows = useMemo(
    () => buildStockValueRows(report.rows, report.days, horizonDays),
    [horizonDays, report.days, report.rows],
  );

  const options = useMemo(
    () => ({
      stores: unique(allRows.map((row) => row.storeName)),
      categories: unique(allRows.map((row) => row.categoryName ?? NO_CATEGORY)),
      suppliers: unique(allRows.map((row) => row.supplierName ?? NO_SUPPLIER)),
    }),
    [allRows],
  );

  // Club, category, supplier and search narrow the rows for the totals and
  // the table; the view then picks the rows of the table.
  const scopedRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return allRows.filter(
      (row) =>
        (stores.length === 0 || stores.includes(row.storeName)) &&
        (categories.length === 0 ||
          categories.includes(row.categoryName ?? NO_CATEGORY)) &&
        (suppliers.length === 0 ||
          suppliers.includes(row.supplierName ?? NO_SUPPLIER)) &&
        (!needle ||
          row.name.toLowerCase().includes(needle) ||
          row.article.toLowerCase().includes(needle)),
    );
  }, [allRows, categories, search, stores, suppliers]);

  const totals = useMemo(
    () => stockValueTotals(scopedRows, noSalesDays),
    [noSalesDays, scopedRows],
  );

  const viewRows = useMemo(
    () =>
      scopedRows.filter((row) => matchesStockValueView(row, view, noSalesDays)),
    [noSalesDays, scopedRows, view],
  );

  const rows = useMemo(
    () =>
      [...viewRows].sort((a, b) => {
        const result = compareValues(
          rowSortValue(a, sortKey),
          rowSortValue(b, sortKey),
        );
        return sortDirection === "asc" ? result : -result;
      }),
    [sortDirection, sortKey, viewRows],
  );

  const viewStockValue = useMemo(
    () => viewRows.reduce((total, row) => total + (row.stockValue ?? 0), 0),
    [viewRows],
  );

  const groups = useMemo(() => {
    if (breakdown === "product") return [];
    return groupStockValueRows(viewRows, breakdown).sort((a, b) => {
      const result = compareValues(
        groupSortValue(a, groupSortKey, viewStockValue),
        groupSortValue(b, groupSortKey, viewStockValue),
      );
      return sortDirection === "asc" ? result : -result;
    });
  }, [breakdown, groupSortKey, sortDirection, viewRows, viewStockValue]);

  const lostView = view === "lost-profit";
  const rowColumns: Array<TableColumn<RowKey>> = [
    { key: "name", label: "Товар" },
    { key: "storeName", label: "Клуб" },
    { key: "categoryName", label: "Категория" },
    { key: "supplierName", label: "Поставщик" },
    {
      key: "stockQuantity",
      label: "Остаток",
      align: "right",
      hint: "Последний остаток из Langame.",
    },
    {
      key: "unitCost",
      label: "Закупка, ₽",
      align: "right",
      hint: "Закупочная цена клуба из Langame, а если её нет — цена товара. Пусто — цена неизвестна.",
    },
    ...(lostView
      ? []
      : [
          {
            key: "stockValue" as const,
            label: "Деньги в остатке",
            align: "right" as const,
            hint: "Остаток × закупочная цена.",
          },
        ]),
    {
      key: "soldQuantity",
      label: "Продано",
      align: "right",
      hint: `Продано штук за ${report.windowDays} дн.`,
    },
    {
      key: "averageDailySales",
      label: "Продаж в день",
      align: "right",
      hint: "Продано ÷ дней в наличии, как в «Заказе товаров».",
    },
    ...(lostView
      ? []
      : [
          {
            key: "stockDaysLeft" as const,
            label: "Хватит, дн.",
            align: "right" as const,
            hint: "Остаток ÷ продаж в день. Пусто — товар не продаётся.",
          },
        ]),
    {
      key: "lastSaleDay",
      label: "Последняя продажа",
      hint: `День клуба с последней продажей за ${report.windowDays} дн.`,
    },
    {
      key: "daysWithoutSales",
      label: "Без продаж, дн.",
      align: "right",
      hint: "Полных дней после последней продажи.",
    },
    ...(lostView
      ? [
          {
            key: "daysOutOfStock" as const,
            label: "Без остатка, дн.",
            align: "right" as const,
            hint: `Дней из ${report.windowDays}, когда товара не было на остатке.`,
          },
          {
            key: "lostProfitPerDay" as const,
            label: "Теряем в день",
            align: "right" as const,
            hint: "Продаж в день × (средняя цена продажи − закупочная цена).",
          },
          {
            key: "lostProfit" as const,
            label: "Потеряно за период",
            align: "right" as const,
            hint: "Теряем в день × дней без остатка.",
          },
        ]
      : [
          {
            key: "excessQuantity" as const,
            label: "Лишний запас, шт",
            align: "right" as const,
            hint: `Остаток − продаж в день × ${horizonDays} дн.`,
          },
          {
            key: "excessValue" as const,
            label: "Лишний запас, ₽",
            align: "right" as const,
            hint: "Лишний запас × закупочная цена.",
          },
        ]),
  ];

  const groupLabel =
    breakdown === "store"
      ? "Клуб"
      : breakdown === "category"
        ? "Категория"
        : "Поставщик";
  const groupColumns: Array<TableColumn<GroupKey>> = [
    { key: "label", label: groupLabel },
    { key: "positions", label: "Позиций", align: "right" },
    ...(lostView
      ? [
          {
            key: "lostProfitPerDay" as const,
            label: "Теряем в день",
            align: "right" as const,
          },
        ]
      : [
          {
            key: "stockQuantity" as const,
            label: "Остаток, шт",
            align: "right" as const,
          },
          {
            key: "stockValue" as const,
            label: "Деньги в остатке",
            align: "right" as const,
          },
          {
            key: "share" as const,
            label: "Доля, %",
            align: "right" as const,
            hint: "Доля денег в остатке среди строк этого вида.",
          },
          {
            key: "excessValue" as const,
            label: "Лишний запас, ₽",
            align: "right" as const,
          },
        ]),
    {
      key: "unpriced",
      label: "Без цены",
      align: "right",
      hint: "Позиции на остатке без закупочной цены: в суммы не входят.",
    },
  ];

  function toggleRowSort(key: RowKey) {
    if (key === sortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection(TEXT_KEYS.has(key) ? "asc" : "desc");
  }

  function toggleGroupSort(key: GroupKey) {
    if (key === groupSortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setGroupSortKey(key);
    setSortDirection(TEXT_KEYS.has(key) ? "asc" : "desc");
  }

  /** Opens the products of one club, category or supplier. */
  function drillDown(label: string) {
    if (breakdown === "store") setStores([label]);
    if (breakdown === "category") setCategories([label]);
    if (breakdown === "supplier") setSuppliers([label]);
    setBreakdown("product");
    setVisible(PAGE_SIZE);
  }

  function resetFilters() {
    setSearch("");
    setStores([]);
    setCategories([]);
    setSuppliers([]);
    setVisible(PAGE_SIZE);
  }

  function exportCsv() {
    if (breakdown !== "product") {
      downloadCsv(`dengi-v-ostatke-${breakdown}-${report.to}.csv`, [
        groupColumns.map((column) => column.label),
        ...groups.map((group) =>
          groupColumns.map((column) =>
            csvValue(groupSortValue(group, column.key, viewStockValue)),
          ),
        ),
      ]);
      return;
    }
    downloadCsv(`dengi-v-ostatke-${report.to}.csv`, [
      ["Артикул", ...rowColumns.map((column) => column.label)],
      ...rows.map((row) => [
        row.article,
        ...rowColumns.map((column) => csvCell(row, column.key)),
      ]),
    ]);
  }

  const hasFilters =
    search.trim() !== "" ||
    stores.length > 0 ||
    categories.length > 0 ||
    suppliers.length > 0;
  const visibleRows = rows.slice(0, visible);
  const shownCount = breakdown === "product" ? rows.length : groups.length;

  return (
    <div>
      <section
        aria-label="Настроить отчёт"
        className="mx-4 mb-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
      >
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Показать
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {STOCK_VALUE_VIEWS.map((key) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={view === key}
                  onClick={() => applyView(key)}
                  className={[
                    "cursor-pointer rounded-xl border px-3 py-2 text-sm font-semibold transition-colors",
                    view === key
                      ? "border-emerald-700 bg-emerald-700 text-white dark:border-emerald-400 dark:bg-emerald-400 dark:text-zinc-950"
                      : "border-zinc-300 bg-white text-zinc-800 hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800",
                  ].join(" ")}
                >
                  {VIEW_PRESETS[key].label}
                </button>
              ))}
            </div>
            <p className="mt-3 max-w-3xl text-sm text-zinc-600 dark:text-zinc-300">
              {VIEW_PRESETS[view].description({ noSalesDays, horizonDays })}
            </p>
            {view === "frozen" ? (
              <ChipRow
                label="Без продаж за"
                options={noSalesOptions}
                value={noSalesDays}
                onChange={(days) => {
                  setVisible(PAGE_SIZE);
                  setNoSalesDays(days);
                  updateAddress({ noSalesDays: days });
                }}
              />
            ) : null}
            {view === "excess" ? (
              <ChipRow
                label="Запас на"
                options={EXCESS_HORIZON_OPTIONS}
                value={horizonDays}
                onChange={(days) => {
                  setVisible(PAGE_SIZE);
                  setHorizonDays(days);
                }}
              />
            ) : null}
          </div>
          <form className="flex shrink-0 flex-wrap items-end gap-3">
            <input type="hidden" name="view" value={view} />
            <input type="hidden" name="noSalesDays" value={noSalesDays} />
            <label className="block text-xs font-medium uppercase text-zinc-500">
              Период продаж
              <select
                name="days"
                defaultValue={String(report.windowDays)}
                className="mt-2 block w-32 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-medium normal-case text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              >
                {report.windowOptions.map((days) => (
                  <option key={days} value={days}>
                    {days} дн.
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="cursor-pointer rounded-xl bg-zinc-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950"
            >
              Пересчитать
            </button>
          </form>
        </div>
      </section>

      <section
        aria-label="Итоги"
        className="grid grid-cols-2 gap-3 px-4 pb-4 lg:grid-cols-5"
      >
        <SummaryTile
          label="Деньги в остатке"
          value={formatMoney(totals.stockValue)}
          hint={`${formatInt(totals.inStock)} поз. по закупочным ценам`}
        />
        <SummaryTile
          label={`Без продаж ${noSalesDays} дн.`}
          value={formatMoney(totals.frozenValue)}
          hint={percentOf(totals.frozenValue, totals.stockValue)}
        />
        <SummaryTile
          label={`Лишний запас на ${horizonDays}+ дн.`}
          value={formatMoney(totals.excessValue)}
          hint={percentOf(totals.excessValue, totals.stockValue)}
        />
        <SummaryTile
          label="Теряем прибыли в день"
          value={formatMoney(totals.lostProfitPerDay)}
          hint="Из-за товаров, которых нет в наличии"
          tone={totals.lostProfitPerDay > 0 ? "red" : undefined}
        />
        <SummaryTile
          label="Без закупочной цены"
          value={`${formatInt(totals.unpriced)} поз.`}
          hint="Не входят в суммы"
          tone={totals.unpriced > 0 ? "orange" : undefined}
        />
      </section>

      <div className="space-y-3 border-y border-zinc-200 bg-white px-4 py-4 dark:border-zinc-800/45 dark:bg-zinc-950">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))_auto] xl:items-end">
          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Поиск
            </span>
            <input
              type="search"
              value={search}
              onChange={(event) => {
                setVisible(PAGE_SIZE);
                setSearch(event.target.value);
              }}
              placeholder="Название или артикул"
              className="mt-2 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-100"
            />
          </label>
          <MultiSelect
            label="Клуб"
            options={options.stores}
            selected={stores}
            onChange={(value) => {
              setVisible(PAGE_SIZE);
              setStores(value);
            }}
          />
          <MultiSelect
            label="Категория"
            options={options.categories}
            selected={categories}
            onChange={(value) => {
              setVisible(PAGE_SIZE);
              setCategories(value);
            }}
          />
          <MultiSelect
            label="Поставщик"
            options={options.suppliers}
            selected={suppliers}
            onChange={(value) => {
              setVisible(PAGE_SIZE);
              setSuppliers(value);
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            {hasFilters ? (
              <button
                type="button"
                onClick={resetFilters}
                className="cursor-pointer rounded-md px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
              >
                Сбросить
              </button>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div
            role="radiogroup"
            aria-label="Разрез"
            className="inline-flex w-fit flex-wrap rounded-lg border border-zinc-300 p-0.5 dark:border-zinc-700"
          >
            {BREAKDOWNS.map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={breakdown === value}
                onClick={() => {
                  setVisible(PAGE_SIZE);
                  setBreakdown(value);
                }}
                className={[
                  "cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  breakdown === value
                    ? "bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950"
                    : "text-zinc-600 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-white",
                ].join(" ")}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-zinc-500">
              {breakdown === "product"
                ? `Показано ${formatInt(rows.length)} из ${formatInt(scopedRows.length)}`
                : `${formatInt(shownCount)} строк, ${formatInt(viewRows.length)} поз.`}
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
      </div>

      <div className="max-h-[75vh] overflow-auto bg-white dark:bg-zinc-950">
        {breakdown === "product" ? (
          <table className="w-full min-w-[1200px] border-separate border-spacing-0 text-left text-xs">
            <thead className="sticky top-0 z-20 bg-zinc-100 uppercase text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
              <tr>
                {rowColumns.map((column) => (
                  <HeaderCell
                    key={column.key}
                    column={column}
                    sortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={toggleRowSort}
                    sticky={column.key === "name"}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr
                  key={row.key}
                  className="group hover:bg-zinc-50 dark:hover:bg-zinc-900/60"
                >
                  {rowColumns.map((column) =>
                    column.key === "name" ? (
                      <td
                        key={column.key}
                        className="sticky left-0 z-10 min-w-[220px] max-w-[320px] whitespace-normal border-b border-zinc-100 bg-white px-3 py-2 group-hover:bg-zinc-50 dark:border-zinc-800/45 dark:bg-zinc-950 dark:group-hover:bg-zinc-900"
                      >
                        <div className="font-medium text-zinc-950 dark:text-zinc-100">
                          {row.name}
                        </div>
                        <div className="text-[11px] text-zinc-500">
                          {row.article}
                        </div>
                      </td>
                    ) : (
                      <Cell
                        key={column.key}
                        right={column.align === "right"}
                        strong={
                          column.key === "stockValue" ||
                          column.key === "excessValue" ||
                          column.key === "lostProfitPerDay"
                        }
                        muted={
                          column.key === "categoryName" ||
                          column.key === "supplierName"
                        }
                      >
                        {displayCell(row, column.key, report.windowDays)}
                      </Cell>
                    ),
                  )}
                </tr>
              ))}
              {rows.length === 0 ? (
                <EmptyRow
                  colSpan={rowColumns.length}
                  text={emptyText(view, allRows.length, noSalesDays)}
                />
              ) : null}
            </tbody>
          </table>
        ) : (
          <table className="w-full min-w-[720px] border-separate border-spacing-0 text-left text-xs">
            <thead className="sticky top-0 z-20 bg-zinc-100 uppercase text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
              <tr>
                {groupColumns.map((column) => (
                  <HeaderCell
                    key={column.key}
                    column={column}
                    sortKey={groupSortKey}
                    sortDirection={sortDirection}
                    onSort={toggleGroupSort}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <tr
                  key={group.key}
                  className="hover:bg-zinc-50 dark:hover:bg-zinc-900/60"
                >
                  {groupColumns.map((column) =>
                    column.key === "label" ? (
                      <td
                        key={column.key}
                        className="border-b border-zinc-100 px-3 py-2 dark:border-zinc-800/45"
                      >
                        <button
                          type="button"
                          onClick={() => drillDown(group.label)}
                          title="Показать товары"
                          className="cursor-pointer text-left text-sm font-medium text-emerald-800 underline-offset-2 hover:underline dark:text-emerald-300"
                        >
                          {group.label}
                        </button>
                      </td>
                    ) : (
                      <Cell
                        key={column.key}
                        right
                        strong={
                          column.key === "stockValue" ||
                          column.key === "lostProfitPerDay"
                        }
                      >
                        {displayGroupCell(group, column.key, viewStockValue)}
                      </Cell>
                    ),
                  )}
                </tr>
              ))}
              {groups.length === 0 ? (
                <EmptyRow
                  colSpan={groupColumns.length}
                  text={emptyText(view, allRows.length, noSalesDays)}
                />
              ) : null}
            </tbody>
          </table>
        )}
      </div>
      {breakdown === "product" && rows.length > visible ? (
        <div className="flex justify-center bg-white py-4 dark:bg-zinc-950">
          <button
            type="button"
            onClick={() => setVisible((current) => current + PAGE_SIZE)}
            className="cursor-pointer rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
          >
            Показать ещё {formatInt(Math.min(PAGE_SIZE, rows.length - visible))}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ChipRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: number[];
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
      <span className="text-zinc-500">{label}</span>
      {options.map((days) => (
        <button
          key={days}
          type="button"
          aria-pressed={value === days}
          onClick={() => onChange(days)}
          className={[
            "cursor-pointer rounded-full border px-3 py-1 text-xs font-semibold",
            value === days
              ? "border-zinc-950 bg-zinc-950 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950"
              : "border-zinc-300 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900",
          ].join(" ")}
        >
          {days} дн.
        </button>
      ))}
    </div>
  );
}

function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="px-4 py-10 text-center text-sm text-zinc-500"
      >
        {text}
      </td>
    </tr>
  );
}

function emptyText(
  view: StockValueView,
  totalRows: number,
  noSalesDays: number,
) {
  if (totalRows === 0) return "Нет товаров на остатке.";
  switch (view) {
    case "frozen":
      return `Нет товаров на остатке без продаж ${noSalesDays} дн. под эти фильтры.`;
    case "excess":
      return "Лишнего запаса под эти фильтры нет.";
    case "lost-profit":
      return "Все продающиеся товары под эти фильтры есть в наличии.";
    case "all":
      return "Под фильтры ничего не попало.";
  }
}

function rowSortValue(row: StockValueRow, key: RowKey) {
  switch (key) {
    case "categoryName":
      return row.categoryName ?? NO_CATEGORY;
    case "supplierName":
      return row.supplierName ?? NO_SUPPLIER;
    // No sale in the whole window is the longest wait.
    case "daysWithoutSales":
      return row.daysWithoutSales ?? Number.MAX_SAFE_INTEGER;
    default:
      return row[key];
  }
}

function groupSortValue(
  group: StockValueGroupRow,
  key: GroupKey,
  total: number,
): number | string {
  if (key === "share") {
    return total > 0 ? Math.round((group.stockValue / total) * 1000) / 10 : 0;
  }
  return group[key];
}

// Unknown values sort lowest, so a descending sort puts them last.
function compareValues(a: number | string | null, b: number | string | null) {
  if (a === b) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  if (typeof a === "string" || typeof b === "string") {
    return String(a).localeCompare(String(b), "ru");
  }
  return a - b;
}

function displayCell(row: StockValueRow, key: RowKey, windowDays: number) {
  switch (key) {
    case "storeName":
      return row.storeName;
    case "categoryName":
      return row.categoryName ?? NO_CATEGORY;
    case "supplierName":
      return row.supplierName ?? NO_SUPPLIER;
    case "stockQuantity":
      return (
        <span
          title={
            row.stockStale
              ? "Остаток давно не обновлялся — проверьте синхронизацию."
              : undefined
          }
          className={row.stockStale ? "text-amber-700 dark:text-amber-300" : ""}
        >
          {formatQuantity(row.stockQuantity)}
          {row.stockStale ? " *" : ""}
        </span>
      );
    case "unitCost":
    case "stockValue":
    case "excessValue":
    case "lostProfitPerDay":
    case "lostProfit":
      return row[key] === null ? "—" : formatMoney(row[key]);
    case "lastSaleDay":
      return row.lastSaleDay
        ? fullDate(row.lastSaleDay)
        : `нет за ${windowDays} дн.`;
    case "daysWithoutSales":
      return row.daysWithoutSales === null
        ? `${windowDays}+`
        : formatInt(row.daysWithoutSales);
    case "stockDaysLeft":
      return formatNullable(row.stockDaysLeft);
    case "daysOutOfStock":
      return formatInt(row.daysOutOfStock);
    // Slow SKUs sell a fraction a day; one decimal would show them as 0.
    case "averageDailySales":
      return new Intl.NumberFormat("ru-RU", {
        maximumFractionDigits: 2,
      }).format(row.averageDailySales);
    default:
      return formatQuantity(row[key as "soldQuantity"]);
  }
}

function displayGroupCell(
  group: StockValueGroupRow,
  key: GroupKey,
  total: number,
) {
  switch (key) {
    case "stockValue":
    case "excessValue":
    case "lostProfitPerDay":
      return formatMoney(group[key]);
    case "share":
      return `${formatQuantity(Number(groupSortValue(group, key, total)))}%`;
    case "stockQuantity":
      return formatQuantity(group.stockQuantity);
    case "positions":
    case "unpriced":
      return formatInt(group[key]);
    default:
      return group.label;
  }
}

function csvCell(row: StockValueRow, key: RowKey) {
  switch (key) {
    case "name":
    case "storeName":
      return row[key];
    case "categoryName":
      return row.categoryName ?? NO_CATEGORY;
    case "supplierName":
      return row.supplierName ?? NO_SUPPLIER;
    case "lastSaleDay":
      return row.lastSaleDay ?? "";
    default: {
      const value = row[key];
      return value === null ? "" : csvNumber(value);
    }
  }
}

function csvValue(value: number | string) {
  return typeof value === "string" ? value : csvNumber(value);
}

function percentOf(value: number, total: number) {
  return total > 0
    ? `${formatQuantity(Math.round((value / total) * 1000) / 10)}% от остатка`
    : "Нет оценённого остатка";
}

function fullDate(value: string) {
  return `${shortDate(value)}.${value.slice(0, 4)}`;
}

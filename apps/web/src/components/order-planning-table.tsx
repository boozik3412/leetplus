"use client";

import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";

import type {
  OrderPlanningReport,
  OrderPlanningRow,
  OrderPlanningStatus,
} from "@/lib/reports";
import {
  ORDER_PLANNING_VIEWS,
  type OrderPlanningView,
} from "@/lib/order-planning-views";

type Grouping = "store" | "network";
type SortDirection = "asc" | "desc";

type ViewRow = {
  key: string;
  name: string;
  article: string;
  storeName: string;
  clubs: number;
  categoryName: string;
  supplierName: string;
  dailySales: number[];
  soldQuantity: number;
  soldLast7Days: number;
  revenue: number;
  daysInStock: number;
  averageDailySales: number;
  forecast: number;
  stockQuantity: number | null;
  stockValue: number | null;
  stockStale: boolean;
  stockDaysLeft: number | null;
  need: number;
  recommendedOrder: number;
  orderMultiplicity: number | null;
  orderAmount: number | null;
  orderAmountPartial: boolean;
  lowData: boolean;
  status: OrderPlanningStatus;
  clubRows: OrderPlanningRow[];
};

type ColumnKey =
  | "status"
  | "name"
  | "storeName"
  | "categoryName"
  | "supplierName"
  | "soldQuantity"
  | "soldLast7Days"
  | "daysInStock"
  | "averageDailySales"
  | "forecast"
  | "stockQuantity"
  | "stockDaysLeft"
  | "need"
  | "recommendedOrder"
  | "orderAmount"
  | "stockValue";

type Column = {
  key: ColumnKey;
  label: string;
  align?: "right";
  hint?: string;
};

const NO_CATEGORY = "Без категории";
const NO_SUPPLIER = "Без поставщика";
const PAGE_SIZE = 200;

const STATUS_ORDER: OrderPlanningStatus[] = [
  "OUT_OF_STOCK",
  "CRITICAL",
  "ORDER",
  "OK",
  "EXCESS",
  "NO_STOCK_DATA",
  "NO_SALES",
];

const STATUS_META: Record<
  OrderPlanningStatus,
  { label: string; className: string }
> = {
  OUT_OF_STOCK: {
    label: "Нет в наличии",
    className: "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-200",
  },
  CRITICAL: {
    label: "Кончится ≤ 3 дн.",
    className:
      "bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-200",
  },
  ORDER: {
    label: "Заказать",
    className:
      "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200",
  },
  OK: {
    label: "Хватает",
    className:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200",
  },
  EXCESS: {
    label: "Избыток",
    className: "bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-200",
  },
  NO_STOCK_DATA: {
    label: "Нет данных об остатке",
    className: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  },
  NO_SALES: {
    label: "Без продаж",
    className: "bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400",
  },
};

const NEEDS_ORDER = new Set<OrderPlanningStatus>([
  "OUT_OF_STOCK",
  "CRITICAL",
  "ORDER",
]);

type AmountMode = "order" | "stock";

type ViewPreset = {
  label: string;
  description: string;
  statuses: OrderPlanningStatus[];
  sortKey: ColumnKey;
  sortDirection: SortDirection;
  showDaily: boolean;
  amountMode: AmountMode;
  noMovement?: boolean;
};

/**
 * One-click setups that turn the report into the narrower reports it
 * replaces: each sets status filters, sorting and the visible columns.
 */
const VIEW_PRESETS: Record<OrderPlanningView, ViewPreset> = {
  order: {
    label: "Заказ",
    description:
      "Что заказать: нет в наличии, кончится за 3 дня и не хватит на выбранный запас. Сначала самое срочное.",
    statuses: ["OUT_OF_STOCK", "CRITICAL", "ORDER"],
    sortKey: "status",
    sortDirection: "asc",
    showDaily: false,
    amountMode: "order",
  },
  "out-of-stock": {
    label: "Нет в наличии",
    description:
      "Товар продаётся, а остатка нет. Сверху то, что продаётся быстрее всего: там больше всего упущенных продаж.",
    statuses: ["OUT_OF_STOCK"],
    sortKey: "averageDailySales",
    sortDirection: "desc",
    showDaily: false,
    amountMode: "order",
  },
  "running-out": {
    label: "Кончится за 3 дня",
    description:
      "Остатка хватит на 3 дня или меньше, включая уже закончившиеся. Сверху то, что кончится раньше.",
    statuses: ["OUT_OF_STOCK", "CRITICAL"],
    sortKey: "stockDaysLeft",
    sortDirection: "asc",
    showDaily: false,
    amountMode: "order",
  },
  "no-movement": {
    label: "Без движения",
    description:
      "Товар лежит на остатке, но не продавался выбранное число дней. Сверху то, где заморожено больше всего денег.",
    statuses: [],
    sortKey: "stockValue",
    sortDirection: "desc",
    showDaily: false,
    amountMode: "stock",
    noMovement: true,
  },
  forecast: {
    label: "Прогноз продаж",
    description:
      "Сколько продастся за выбранный запас по средним продажам в дни наличия. Продажи по дням открыты, сверху самые продаваемые.",
    statuses: [],
    sortKey: "forecast",
    sortDirection: "desc",
    showDaily: true,
    amountMode: "order",
  },
  movement: {
    label: "Движение товаров",
    description:
      "Продажи каждого товара по дням за период и текущий остаток. Сверху самые продаваемые.",
    statuses: [],
    sortKey: "soldQuantity",
    sortDirection: "desc",
    showDaily: true,
    amountMode: "order",
  },
  excess: {
    label: "Избыток",
    description:
      "Остатка больше, чем нужно на три срока запаса. Сверху то, чего хватит дольше всего.",
    statuses: ["EXCESS"],
    sortKey: "stockDaysLeft",
    sortDirection: "desc",
    showDaily: false,
    amountMode: "stock",
  },
  all: {
    label: "Все товары",
    description: "Все товары, которые были на остатке за период, без фильтров.",
    statuses: [],
    sortKey: "status",
    sortDirection: "asc",
    showDaily: false,
    amountMode: "order",
  },
};

const NO_MOVEMENT_DAYS = [7, 14, 21, 30, 45, 60];

export function OrderPlanningTable({
  report,
  initialView,
}: {
  report: OrderPlanningReport;
  initialView: OrderPlanningView;
}) {
  const pathname = usePathname();
  const initial = VIEW_PRESETS[initialView];
  const [view, setView] = useState<OrderPlanningView | null>(initialView);
  const [grouping, setGrouping] = useState<Grouping>("store");
  const [search, setSearch] = useState("");
  const [stores, setStores] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [suppliers, setSuppliers] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<OrderPlanningStatus[]>(
    initial.statuses,
  );
  const [showDaily, setShowDaily] = useState(initial.showDaily);
  const [sortKey, setSortKey] = useState<ColumnKey>(initial.sortKey);
  const [sortDirection, setSortDirection] = useState<SortDirection>(
    initial.sortDirection,
  );
  const [amountMode, setAmountMode] = useState<AmountMode>(initial.amountMode);
  const [noMovementDays, setNoMovementDays] = useState<number | null>(
    initial.noMovement ? 7 : null,
  );
  const [visible, setVisible] = useState(PAGE_SIZE);
  const noMovementOptions = NO_MOVEMENT_DAYS.filter(
    (days) => days <= report.windowDays,
  );

  function applyView(next: OrderPlanningView) {
    const preset = VIEW_PRESETS[next];
    setView(next);
    setStatuses(preset.statuses);
    setSortKey(preset.sortKey);
    setSortDirection(preset.sortDirection);
    setShowDaily(preset.showDaily);
    setAmountMode(preset.amountMode);
    setNoMovementDays(preset.noMovement ? (noMovementDays ?? 7) : null);
    setVisible(PAGE_SIZE);
    // Keep the chosen view in the address so the link opens the same setup.
    const params = new URLSearchParams(window.location.search);
    params.set("view", next);
    window.history.replaceState(null, "", `${pathname}?${params.toString()}`);
  }

  const options = useMemo(
    () => ({
      stores: unique(report.rows.map((row) => row.storeName)),
      categories: unique(
        report.rows.map((row) => row.categoryName ?? NO_CATEGORY),
      ),
      suppliers: unique(
        report.rows.map((row) => row.supplierName ?? NO_SUPPLIER),
      ),
    }),
    [report.rows],
  );

  // Club, category, supplier and search narrow the source rows; status is
  // applied after grouping so the chips count what the table shows.
  const scopedRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return report.rows.filter(
      (row) =>
        (stores.length === 0 || stores.includes(row.storeName)) &&
        (categories.length === 0 ||
          categories.includes(row.categoryName ?? NO_CATEGORY)) &&
        (suppliers.length === 0 ||
          suppliers.includes(row.supplierName ?? NO_SUPPLIER)) &&
        (!needle ||
          row.name.toLowerCase().includes(needle) ||
          row.groupName.toLowerCase().includes(needle) ||
          row.article.toLowerCase().includes(needle)),
    );
  }, [categories, report.rows, search, stores, suppliers]);

  const groupedRows = useMemo(
    () =>
      grouping === "store"
        ? scopedRows.map((row) => storeViewRow(row, report.coverDays))
        : networkViewRows(scopedRows, report.coverDays),
    [grouping, report.coverDays, scopedRows],
  );

  const statusCounts = useMemo(() => {
    const counts = new Map<OrderPlanningStatus, number>();
    groupedRows.forEach((row) =>
      counts.set(row.status, (counts.get(row.status) ?? 0) + 1),
    );
    return counts;
  }, [groupedRows]);

  const rows = useMemo(() => {
    const filtered = groupedRows.filter(
      (row) =>
        (statuses.length === 0 || statuses.includes(row.status)) &&
        (noMovementDays === null ||
          ((row.stockQuantity ?? 0) > 0 &&
            sumLast(row.dailySales, noMovementDays) === 0)),
    );
    return filtered.sort((a, b) => {
      const result = compareRows(a, b, sortKey);
      return sortDirection === "asc" ? result : -result;
    });
  }, [groupedRows, noMovementDays, sortDirection, sortKey, statuses]);

  const totals = useMemo(() => {
    const toOrder = rows.filter((row) => row.recommendedOrder > 0);
    return {
      skuToOrder: toOrder.length,
      units: toOrder.reduce((sum, row) => sum + row.recommendedOrder, 0),
      amount: toOrder.reduce((sum, row) => sum + (row.orderAmount ?? 0), 0),
      amountUnknown: toOrder.filter(
        (row) => row.orderAmount === null || row.orderAmountPartial,
      ).length,
      stockValue: rows.reduce((sum, row) => sum + (row.stockValue ?? 0), 0),
      outOfStock: rows.filter((row) => row.status === "OUT_OF_STOCK").length,
      critical: rows.filter((row) => row.status === "CRITICAL").length,
    };
  }, [rows]);

  const columns: Column[] = [
    { key: "status", label: "Статус" },
    { key: "name", label: "Товар" },
    grouping === "store"
      ? { key: "storeName", label: "Клуб" }
      : { key: "storeName", label: "Клубы", align: "right" },
    { key: "categoryName", label: "Категория" },
    { key: "supplierName", label: "Поставщик" },
    {
      key: "soldQuantity",
      label: "Продано",
      align: "right",
      hint: `Продано штук за ${report.windowDays} дн.`,
    },
    {
      key: "soldLast7Days",
      label: "За 7 дн.",
      align: "right",
      hint: "Продано за последние 7 дней окна — видно, растут продажи или падают.",
    },
    {
      key: "daysInStock",
      label: "Дней в наличии",
      align: "right",
      hint: "Сколько дней окна товар был на остатке или продавался.",
    },
    {
      key: "averageDailySales",
      label: "Продаж в день",
      align: "right",
      hint: "Продано ÷ дней в наличии. Дни без остатка не занижают спрос.",
    },
    {
      key: "forecast",
      label: `Прогноз на ${report.coverDays} дн.`,
      align: "right",
      hint: `Сколько продастся за ${report.coverDays} дн.: продаж в день × ${report.coverDays}.`,
    },
    {
      key: "stockQuantity",
      label: "Остаток",
      align: "right",
      hint: "Последний остаток из Langame.",
    },
    {
      key: "stockDaysLeft",
      label: "Хватит, дн.",
      align: "right",
      hint: "Остаток ÷ продаж в день.",
    },
    {
      key: "need",
      label: "Потребность",
      align: "right",
      hint: `Продаж в день × ${report.coverDays} дн. запаса − остаток.`,
    },
    {
      key: "recommendedOrder",
      label: "Заказать",
      align: "right",
      hint: "Потребность, округлённая вверх до целых штук и кратности поставщика.",
    },
    amountMode === "stock"
      ? {
          key: "stockValue",
          label: "Деньги в остатке",
          align: "right",
          hint: "Остаток × закупочная цена клуба (или товара). Пусто — цена неизвестна.",
        }
      : {
          key: "orderAmount",
          label: "Сумма заказа",
          align: "right",
          hint: "Заказать × закупочная цена клуба (или товара). Пусто — цена неизвестна.",
        },
  ];

  function toggleSort(key: ColumnKey) {
    setView(null);
    if (key === sortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection(
      key === "status" ||
        key === "name" ||
        key === "storeName" ||
        key === "categoryName" ||
        key === "supplierName" ||
        key === "stockDaysLeft"
        ? "asc"
        : "desc",
    );
  }

  function toggleStatus(status: OrderPlanningStatus) {
    setView(null);
    setNoMovementDays(null);
    setVisible(PAGE_SIZE);
    setStatuses((current) =>
      current.includes(status)
        ? current.filter((item) => item !== status)
        : [...current, status],
    );
  }

  function resetFilters() {
    setSearch("");
    setStores([]);
    setCategories([]);
    setSuppliers([]);
    setStatuses([]);
    setNoMovementDays(null);
    setView(null);
    setVisible(PAGE_SIZE);
  }

  function exportCsv() {
    const header = [
      "Статус",
      "Товар",
      "Артикул",
      grouping === "store" ? "Клуб" : "Клубов",
      "Категория",
      "Поставщик",
      ...(showDaily ? report.days.map(shortDate) : []),
      "Продано",
      "За 7 дн.",
      "Дней в наличии",
      "Продаж в день",
      `Прогноз на ${report.coverDays} дн.`,
      "Остаток",
      "Хватит, дн.",
      "Потребность",
      "Заказать",
      "Кратность",
      "Сумма заказа",
      "Деньги в остатке",
    ];
    const lines = rows.map((row) => [
      STATUS_META[row.status].label,
      row.name,
      row.article,
      grouping === "store" ? row.storeName : String(row.clubs),
      row.categoryName,
      row.supplierName,
      ...(showDaily ? row.dailySales.map(csvNumber) : []),
      csvNumber(row.soldQuantity),
      csvNumber(row.soldLast7Days),
      String(row.daysInStock),
      csvNumber(row.averageDailySales),
      csvNumber(row.forecast),
      row.stockQuantity === null ? "" : csvNumber(row.stockQuantity),
      row.stockDaysLeft === null ? "" : csvNumber(row.stockDaysLeft),
      csvNumber(row.need),
      String(row.recommendedOrder),
      row.orderMultiplicity ? String(row.orderMultiplicity) : "",
      row.orderAmount === null ? "" : csvNumber(row.orderAmount),
      row.stockValue === null ? "" : csvNumber(row.stockValue),
    ]);
    const content = [header, ...lines]
      .map((line) => line.map(escapeCsv).join(";"))
      .join("\r\n");
    const blob = new Blob([`﻿${content}`], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `zakaz-tovarov-${report.to}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const hasFilters =
    search.trim() !== "" ||
    stores.length > 0 ||
    categories.length > 0 ||
    suppliers.length > 0 ||
    statuses.length > 0 ||
    noMovementDays !== null;
  const visibleRows = rows.slice(0, visible);
  const onlyToOrder =
    statuses.length === NEEDS_ORDER.size &&
    statuses.every((status) => NEEDS_ORDER.has(status));
  const activePreset = view ? VIEW_PRESETS[view] : null;

  return (
    <div>
      <section
        aria-label="Настроить отчёт"
        className="mx-4 mb-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
      >
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Настроить отчёт на
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {ORDER_PLANNING_VIEWS.map((key) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={view === key}
                  onClick={() => applyView(key)}
                  className={[
                    "rounded-xl border px-3 py-2 text-sm font-semibold transition-colors",
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
              {activePreset
                ? activePreset.description
                : "Своя настройка: фильтры и сортировка изменены вручную."}
            </p>
            {noMovementDays !== null ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-zinc-500">Без продаж за</span>
                {noMovementOptions.map((days) => (
                  <button
                    key={days}
                    type="button"
                    aria-pressed={noMovementDays === days}
                    onClick={() => {
                      setVisible(PAGE_SIZE);
                      setNoMovementDays(days);
                    }}
                    className={[
                      "rounded-full border px-3 py-1 text-xs font-semibold",
                      noMovementDays === days
                        ? "border-zinc-950 bg-zinc-950 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950"
                        : "border-zinc-300 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900",
                    ].join(" ")}
                  >
                    {days} дн.
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <form className="flex shrink-0 flex-wrap items-end gap-3">
            {view ? <input type="hidden" name="view" value={view} /> : null}
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
            <label className="block text-xs font-medium uppercase text-zinc-500">
              Запас на
              <select
                name="coverDays"
                defaultValue={String(report.coverDays)}
                className="mt-2 block w-32 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-medium normal-case text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              >
                {report.coverOptions.map((days) => (
                  <option key={days} value={days}>
                    {days} дн.
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="rounded-xl bg-zinc-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950"
            >
              Пересчитать
            </button>
          </form>
        </div>
      </section>

      <section
        aria-label="Итоги заказа"
        className="grid grid-cols-2 gap-3 px-4 pb-4 lg:grid-cols-5"
      >
        <SummaryTile
          label="Позиций к заказу"
          value={formatInt(totals.skuToOrder)}
        />
        <SummaryTile label="Штук к заказу" value={formatInt(totals.units)} />
        {amountMode === "stock" ? (
          <SummaryTile
            label="Деньги в остатке"
            value={formatMoney(totals.stockValue)}
            hint="По закупочным ценам"
          />
        ) : (
          <SummaryTile
            label="Сумма заказа"
            value={formatMoney(totals.amount)}
            hint={
              totals.amountUnknown > 0
                ? `Без цены: ${formatInt(totals.amountUnknown)} поз.`
                : "По закупочным ценам"
            }
          />
        )}
        <SummaryTile
          label="Нет в наличии"
          value={formatInt(totals.outOfStock)}
          tone="red"
        />
        <SummaryTile
          label="Кончится за 3 дня"
          value={formatInt(totals.critical)}
          tone="orange"
        />
      </section>

      <div className="space-y-3 border-y border-zinc-200 bg-white px-4 py-4 dark:border-zinc-800/45 dark:bg-zinc-950">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
            Статус
          </span>
          {STATUS_ORDER.map((status) => {
            const count = statusCounts.get(status) ?? 0;
            const active = statuses.includes(status);
            if (count === 0 && !active) return null;
            return (
              <button
                key={status}
                type="button"
                aria-pressed={active}
                onClick={() => toggleStatus(status)}
                className={[
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  active
                    ? "border-zinc-950 bg-zinc-950 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950"
                    : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800",
                ].join(" ")}
              >
                {STATUS_META[status].label}{" "}
                <span className="tabular-nums opacity-70">{count}</span>
              </button>
            );
          })}
          <button
            type="button"
            aria-pressed={onlyToOrder}
            onClick={() => {
              setView(null);
              setNoMovementDays(null);
              setVisible(PAGE_SIZE);
              setStatuses(onlyToOrder ? [] : [...NEEDS_ORDER]);
            }}
            className={[
              "rounded-full border border-dashed px-3 py-1 text-xs font-semibold transition-colors",
              onlyToOrder
                ? "border-emerald-600 bg-emerald-50 text-emerald-800 dark:border-emerald-400 dark:bg-emerald-950/50 dark:text-emerald-200"
                : "border-zinc-400 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-900",
            ].join(" ")}
          >
            Только то, что заказать
          </button>
        </div>

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
                className="rounded-md px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
              >
                Сбросить
              </button>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <div
              role="radiogroup"
              aria-label="Группировка"
              className="inline-flex rounded-lg border border-zinc-300 p-0.5 dark:border-zinc-700"
            >
              {(
                [
                  ["store", "По клубам"],
                  ["network", "По сети"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={grouping === value}
                  onClick={() => {
                    setVisible(PAGE_SIZE);
                    setGrouping(value);
                  }}
                  className={[
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    grouping === value
                      ? "bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950"
                      : "text-zinc-600 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-white",
                  ].join(" ")}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 text-zinc-700 dark:text-zinc-200">
              <input
                type="checkbox"
                checked={showDaily}
                onChange={(event) => {
                  setView(null);
                  setShowDaily(event.target.checked);
                }}
                className="h-4 w-4 accent-emerald-600"
              />
              Продажи по дням
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-zinc-500">
              Показано {formatInt(rows.length)} из{" "}
              {formatInt(groupedRows.length)}
            </span>
            <button
              type="button"
              onClick={exportCsv}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
            >
              Скачать CSV (Excel)
            </button>
          </div>
        </div>
      </div>

      <div className="max-h-[75vh] overflow-auto bg-white dark:bg-zinc-950">
        <table className="w-full min-w-[1200px] border-separate border-spacing-0 text-left text-xs">
          <thead className="sticky top-0 z-20 bg-zinc-100 uppercase text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
            <tr>
              {columns.slice(0, 5).map((column) => (
                <HeaderCell
                  key={column.key}
                  column={column}
                  sortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={toggleSort}
                  sticky={column.key === "name"}
                />
              ))}
              {showDaily ? (
                report.days.map((day) => (
                  <th
                    key={day}
                    className="whitespace-nowrap border-b border-zinc-200 px-2 py-2 text-right font-medium dark:border-zinc-800"
                  >
                    {shortDate(day)}
                  </th>
                ))
              ) : (
                <th className="whitespace-nowrap border-b border-zinc-200 px-3 py-2 font-medium dark:border-zinc-800">
                  Продажи по дням
                </th>
              )}
              {columns.slice(5).map((column) => (
                <HeaderCell
                  key={column.key}
                  column={column}
                  sortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={toggleSort}
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
                <Cell>
                  <span
                    className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_META[row.status].className}`}
                  >
                    {STATUS_META[row.status].label}
                  </span>
                  {grouping === "network" && row.clubs > 1 ? (
                    <div className="mt-0.5 text-[11px] text-zinc-500">
                      {
                        row.clubRows.filter(
                          (club) => club.status === row.status,
                        ).length
                      }{" "}
                      из {row.clubs} клубов
                    </div>
                  ) : null}
                </Cell>
                <td className="sticky left-0 z-10 min-w-[220px] max-w-[320px] whitespace-normal border-b border-zinc-100 bg-white px-3 py-2 group-hover:bg-zinc-50 dark:border-zinc-800/45 dark:bg-zinc-950 dark:group-hover:bg-zinc-900">
                  <div className="font-medium text-zinc-950 dark:text-zinc-100">
                    {row.name}
                  </div>
                  <div className="text-[11px] text-zinc-500">
                    {row.article}
                    {row.lowData ? (
                      <span
                        className="ml-2 text-amber-700 dark:text-amber-300"
                        title="Товар был в наличии меньше 7 дней — прогноз приблизительный."
                      >
                        мало данных
                      </span>
                    ) : null}
                  </div>
                </td>
                <Cell>
                  {grouping === "store" ? (
                    row.storeName
                  ) : (
                    <span
                      className="block text-right tabular-nums"
                      title={row.clubRows
                        .map(
                          (club) =>
                            `${club.storeName}: остаток ${formatNullable(club.stockQuantity)}, заказать ${club.recommendedOrder}`,
                        )
                        .join("\n")}
                    >
                      {row.clubs}
                    </span>
                  )}
                </Cell>
                <Cell muted>{row.categoryName}</Cell>
                <Cell muted>{row.supplierName}</Cell>
                {showDaily ? (
                  row.dailySales.map((quantity, index) => (
                    <Cell key={report.days[index]} right muted={quantity === 0}>
                      {formatQuantity(quantity)}
                    </Cell>
                  ))
                ) : (
                  <Cell>
                    <Sparkline values={row.dailySales} days={report.days} />
                  </Cell>
                )}
                <Cell right strong>
                  {formatQuantity(row.soldQuantity)}
                </Cell>
                <Cell right>{formatQuantity(row.soldLast7Days)}</Cell>
                <Cell right>
                  {row.daysInStock}
                  <span className="text-zinc-400"> / {report.windowDays}</span>
                </Cell>
                <Cell right>{formatQuantity(row.averageDailySales)}</Cell>
                <Cell right>{formatQuantity(row.forecast)}</Cell>
                <Cell right strong>
                  <span
                    title={
                      row.stockStale
                        ? "Остаток давно не обновлялся — проверьте синхронизацию."
                        : undefined
                    }
                    className={
                      row.stockStale ? "text-amber-700 dark:text-amber-300" : ""
                    }
                  >
                    {formatNullable(row.stockQuantity)}
                    {row.stockStale ? " *" : ""}
                  </span>
                </Cell>
                <Cell right>{formatNullable(row.stockDaysLeft)}</Cell>
                <Cell right>{formatQuantity(row.need)}</Cell>
                <Cell right>
                  <span
                    className={
                      row.recommendedOrder > 0
                        ? "text-sm font-semibold text-zinc-950 dark:text-white"
                        : "text-zinc-400"
                    }
                    title={
                      row.orderMultiplicity && row.orderMultiplicity > 1
                        ? `Кратность поставщика: ${row.orderMultiplicity}`
                        : undefined
                    }
                  >
                    {row.recommendedOrder}
                  </span>
                </Cell>
                {amountMode === "stock" ? (
                  <Cell right>
                    {row.stockValue === null
                      ? "—"
                      : formatMoney(row.stockValue)}
                  </Cell>
                ) : (
                  <Cell right>
                    {row.orderAmount === null
                      ? "—"
                      : formatMoney(row.orderAmount)}
                    {row.orderAmountPartial ? " *" : ""}
                  </Cell>
                )}
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={
                    columns.length + (showDaily ? report.days.length : 1)
                  }
                  className="px-4 py-10 text-center text-sm text-zinc-500"
                >
                  {report.rows.length === 0
                    ? "За период нет товаров, которые были на остатке."
                    : "Под фильтры ничего не попало."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {rows.length > visible ? (
        <div className="flex justify-center bg-white py-4 dark:bg-zinc-950">
          <button
            type="button"
            onClick={() => setVisible((current) => current + PAGE_SIZE)}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
          >
            Показать ещё {formatInt(Math.min(PAGE_SIZE, rows.length - visible))}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function storeViewRow(row: OrderPlanningRow, coverDays: number): ViewRow {
  return {
    key: `${row.storeId}:${row.productId}`,
    name: row.name,
    article: row.article,
    storeName: row.storeName,
    clubs: 1,
    categoryName: row.categoryName ?? NO_CATEGORY,
    supplierName: row.supplierName ?? NO_SUPPLIER,
    dailySales: row.dailySales,
    soldQuantity: row.soldQuantity,
    soldLast7Days: row.soldLast7Days,
    revenue: row.revenue,
    daysInStock: row.daysInStock,
    averageDailySales: row.averageDailySales,
    forecast: round(row.averageDailySales * coverDays),
    stockQuantity: row.stockQuantity,
    stockValue: stockValueOf(row),
    stockStale: row.stockStale,
    stockDaysLeft: row.stockDaysLeft,
    need: row.need,
    recommendedOrder: row.recommendedOrder,
    orderMultiplicity: row.orderMultiplicity,
    orderAmount: row.orderAmount,
    orderAmountPartial: false,
    lowData: row.lowData,
    status: row.status,
    clubRows: [row],
  };
}

/**
 * One row per product across clubs (canonical product when merged). Each club
 * keeps its own need, so the network order is the sum of club orders and the
 * status is the most urgent club status.
 */
function networkViewRows(
  rows: OrderPlanningRow[],
  coverDays: number,
): ViewRow[] {
  const groups = new Map<string, OrderPlanningRow[]>();
  rows.forEach((row) => {
    const group = groups.get(row.groupKey) ?? [];
    group.push(row);
    groups.set(row.groupKey, group);
  });

  return [...groups.entries()].map(([key, clubRows]) => {
    const first = clubRows[0];
    const sum = (pick: (row: OrderPlanningRow) => number) =>
      clubRows.reduce((total, row) => total + pick(row), 0);
    const knownStock = clubRows.filter((row) => row.stockQuantity !== null);
    const stockQuantity =
      knownStock.length === 0
        ? null
        : knownStock.reduce(
            (total, row) => total + (row.stockQuantity ?? 0),
            0,
          );
    const averageDailySales = sum((row) => row.averageDailySales);
    const ordered = clubRows.filter((row) => row.recommendedOrder > 0);
    const pricedOrders = ordered.filter((row) => row.orderAmount !== null);
    const stockValues = clubRows
      .map(stockValueOf)
      .filter((value): value is number => value !== null);

    return {
      key,
      name: first.groupName,
      article: clubRows.length > 1 ? `${clubRows.length} SKU` : first.article,
      storeName: clubRows.map((row) => row.storeName).join(", "),
      clubs: new Set(clubRows.map((row) => row.storeId)).size,
      categoryName: first.categoryName ?? NO_CATEGORY,
      supplierName: first.supplierName ?? NO_SUPPLIER,
      dailySales: first.dailySales.map((_, index) =>
        round(sum((row) => row.dailySales[index] ?? 0)),
      ),
      soldQuantity: round(sum((row) => row.soldQuantity)),
      soldLast7Days: round(sum((row) => row.soldLast7Days)),
      revenue: round(sum((row) => row.revenue)),
      daysInStock: Math.max(...clubRows.map((row) => row.daysInStock)),
      averageDailySales: round(averageDailySales),
      forecast: round(averageDailySales * coverDays),
      stockQuantity: stockQuantity === null ? null : round(stockQuantity),
      stockValue:
        stockValues.length === 0
          ? null
          : round(stockValues.reduce((total, value) => total + value, 0)),
      stockStale: clubRows.some((row) => row.stockStale),
      stockDaysLeft:
        stockQuantity !== null && averageDailySales > 0
          ? round(Math.max(0, stockQuantity) / averageDailySales)
          : null,
      need: round(sum((row) => row.need)),
      recommendedOrder: sum((row) => row.recommendedOrder),
      orderMultiplicity: first.orderMultiplicity,
      orderAmount:
        ordered.length === 0
          ? 0
          : pricedOrders.length === 0
            ? null
            : round(
                pricedOrders.reduce((t, row) => t + (row.orderAmount ?? 0), 0),
              ),
      orderAmountPartial:
        pricedOrders.length > 0 && pricedOrders.length < ordered.length,
      lowData: clubRows.every((row) => row.lowData),
      status: clubRows
        .map((row) => row.status)
        .sort((a, b) => STATUS_ORDER.indexOf(a) - STATUS_ORDER.indexOf(b))[0],
      clubRows,
    };
  });
}

function stockValueOf(row: OrderPlanningRow) {
  return row.unitCost === null || row.stockQuantity === null
    ? null
    : round(Math.max(0, row.stockQuantity) * row.unitCost);
}

function sumLast(values: number[], days: number) {
  return values.slice(-days).reduce((total, value) => total + value, 0);
}

function compareRows(a: ViewRow, b: ViewRow, key: ColumnKey) {
  switch (key) {
    case "status":
      return (
        STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) ||
        b.recommendedOrder - a.recommendedOrder ||
        a.name.localeCompare(b.name, "ru")
      );
    case "name":
    case "categoryName":
    case "supplierName":
      return a[key].localeCompare(b[key], "ru");
    case "storeName":
      return a.clubs - b.clubs || a.storeName.localeCompare(b.storeName, "ru");
    default:
      return compareNullable(a[key], b[key]);
  }
}

// Unknown values sort after known ones in both directions of a numeric sort
// would be ideal, but a stable "unknown = lowest" keeps the toggle predictable.
function compareNullable(a: number | null, b: number | null) {
  if (a === b) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  return a - b;
}

function HeaderCell({
  column,
  sortKey,
  sortDirection,
  onSort,
  sticky = false,
}: {
  column: Column;
  sortKey: ColumnKey;
  sortDirection: SortDirection;
  onSort: (key: ColumnKey) => void;
  sticky?: boolean;
}) {
  const active = sortKey === column.key;
  return (
    <th
      scope="col"
      aria-sort={
        active ? (sortDirection === "asc" ? "ascending" : "descending") : "none"
      }
      className={[
        "whitespace-nowrap border-b border-zinc-200 px-3 py-2 font-medium dark:border-zinc-800",
        column.align === "right" ? "text-right" : "",
        sticky ? "sticky left-0 z-30 bg-zinc-100 dark:bg-zinc-900" : "",
      ].join(" ")}
    >
      <button
        type="button"
        onClick={() => onSort(column.key)}
        title={column.hint}
        className={[
          "inline-flex items-center gap-1 uppercase hover:text-zinc-900 dark:hover:text-zinc-100",
          column.hint
            ? "cursor-help underline decoration-dotted underline-offset-2"
            : "",
        ].join(" ")}
      >
        {column.label}
        <span
          className={
            active
              ? "text-zinc-900 dark:text-zinc-100"
              : "text-zinc-300 dark:text-zinc-700"
          }
        >
          {active ? (sortDirection === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </button>
    </th>
  );
}

function Cell({
  children,
  right = false,
  strong = false,
  muted = false,
}: {
  children: React.ReactNode;
  right?: boolean;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <td
      className={[
        "whitespace-nowrap border-b border-zinc-100 px-3 py-2 dark:border-zinc-800/45",
        right ? "text-right tabular-nums" : "",
        strong ? "font-semibold text-zinc-950 dark:text-zinc-100" : "",
        muted ? "text-zinc-500 dark:text-zinc-400" : "",
      ].join(" ")}
    >
      {children}
    </td>
  );
}

function Sparkline({ values, days }: { values: number[]; days: string[] }) {
  const max = Math.max(...values, 0);
  const width = Math.max(values.length * 4, 40);
  return (
    <svg
      width={width}
      height={20}
      viewBox={`0 0 ${width} 20`}
      role="img"
      aria-label={`Продажи по дням, максимум ${formatQuantity(max)} в день`}
      className="text-emerald-600 dark:text-emerald-400"
    >
      <title>
        {values
          .map(
            (value, index) =>
              `${shortDate(days[index])}: ${formatQuantity(value)}`,
          )
          .join("\n")}
      </title>
      {values.map((value, index) => {
        const height =
          max > 0 ? Math.max((value / max) * 18, value > 0 ? 2 : 0) : 0;
        return (
          <rect
            key={index}
            x={index * 4}
            y={20 - height}
            width={3}
            height={height || 1}
            rx={0.5}
            className={
              height ? "fill-current" : "fill-zinc-200 dark:fill-zinc-800"
            }
          />
        );
      })}
    </svg>
  );
}

function SummaryTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "red" | "orange";
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-xs font-medium text-zinc-500">{label}</p>
      <p
        className={[
          "mt-1 text-2xl font-semibold tabular-nums",
          tone === "red"
            ? "text-red-700 dark:text-red-300"
            : tone === "orange"
              ? "text-orange-700 dark:text-orange-300"
              : "text-zinc-950 dark:text-zinc-100",
        ].join(" ")}
      >
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-xs text-zinc-500">{hint}</p> : null}
    </div>
  );
}

function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (value: string[]) => void;
}) {
  return (
    <div className="block">
      <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </span>
      <details className="group relative mt-2">
        <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-100 dark:hover:bg-zinc-900 [&::-webkit-details-marker]:hidden">
          <span className="truncate">
            {selected.length === 0
              ? "Все"
              : selected.length === 1
                ? selected[0]
                : `${selected.length} выбрано`}
          </span>
          <span className="text-zinc-400 transition-transform group-open:rotate-180">
            ▾
          </span>
        </summary>
        <div className="absolute z-40 mt-2 w-full min-w-64 rounded-xl border border-zinc-200 bg-white p-2 shadow-xl shadow-zinc-900/10 dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-black/30">
          <button
            type="button"
            onClick={() => onChange([])}
            className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            Все
          </button>
          <div className="mt-1 max-h-64 overflow-y-auto pr-1">
            {options.map((option) => (
              <label
                key={option}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-900"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(option)}
                  onChange={() =>
                    onChange(
                      selected.includes(option)
                        ? selected.filter((item) => item !== option)
                        : [...selected, option],
                    )
                  }
                  className="h-4 w-4 accent-emerald-500"
                />
                <span className="truncate">{option}</span>
              </label>
            ))}
          </div>
        </div>
      </details>
    </div>
  );
}

function unique(values: string[]) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, "ru"));
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(
    value,
  );
}

function formatNullable(value: number | null) {
  return value === null ? "—" : formatQuantity(value);
}

function formatInt(value: number) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(
    value,
  );
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(value);
}

function csvNumber(value: number) {
  return String(value).replace(".", ",");
}

function escapeCsv(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function shortDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}.${match[2]}` : value;
}

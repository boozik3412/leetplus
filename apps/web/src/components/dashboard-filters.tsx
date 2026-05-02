"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Store } from "@/lib/stores";

type DashboardPeriod =
  | "day"
  | "week"
  | "month"
  | "quarter"
  | "year"
  | "custom";
type DashboardSkuGrouping = "club" | "network";
type OpenPanel = "period" | "clubs" | null;

const periodLabels: Record<DashboardPeriod, string> = {
  month: "Текущий месяц",
  quarter: "Текущий квартал",
  year: "Текущий год",
  week: "Текущая неделя",
  day: "Текущие сутки",
  custom: "Произвольный период",
};

export function DashboardFilters({
  period,
  dateFrom,
  dateTo,
  skuGrouping,
  stores,
  selectedStoreIds,
}: {
  period: string;
  dateFrom: string;
  dateTo: string;
  skuGrouping: DashboardSkuGrouping;
  stores: Store[];
  selectedStoreIds: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const rootRef = useRef<HTMLElement | null>(null);
  const [openPanel, setOpenPanel] = useState<OpenPanel>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<DashboardPeriod>(
    isPeriod(period) ? period : "month",
  );
  const [customFrom, setCustomFrom] = useState(dateFrom);
  const [customTo, setCustomTo] = useState(dateTo);
  const [selectedStores, setSelectedStores] = useState(selectedStoreIds);
  const selectedGrouping = skuGrouping;
  const selectedStoresLabel =
    selectedStores.length === 0
      ? "Вся сеть"
      : stores
          .filter((store) => selectedStores.includes(store.id))
          .map((store) => store.name)
          .join(", ");

  useEffect(() => {
    if (!openPanel) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        rootRef.current?.contains(event.target)
      ) {
        return;
      }

      setOpenPanel(null);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenPanel(null);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openPanel]);

  function toggleStore(storeId: string) {
    const nextStores = selectedStores.includes(storeId)
      ? selectedStores.filter((id) => id !== storeId)
      : [...selectedStores, storeId];

    setSelectedStores(nextStores);
    applyFilters({ storeIds: nextStores }, { closePanel: false });
  }

  function applyFilters(
    overrides: Partial<{
      period: DashboardPeriod;
      skuGrouping: DashboardSkuGrouping;
      storeIds: string[];
      dateFrom: string;
      dateTo: string;
    }> = {},
    options: { closePanel?: boolean } = {},
  ) {
    const params = new URLSearchParams();
    const nextPeriod = overrides.period ?? selectedPeriod;
    const nextGrouping = overrides.skuGrouping ?? selectedGrouping;
    const nextStores = overrides.storeIds ?? selectedStores;
    const nextDateFrom = overrides.dateFrom ?? customFrom;
    const nextDateTo = overrides.dateTo ?? customTo;
    const closePanel = options.closePanel ?? true;

    params.set("period", nextPeriod);
    params.set("skuGrouping", nextGrouping);

    if (nextPeriod === "custom") {
      params.set("dateFrom", nextDateFrom);
      params.set("dateTo", nextDateTo);
    }

    nextStores.forEach((storeId) => {
      params.append("storeIds", storeId);
    });

    router.push(`${pathname}?${params.toString()}`);

    if (closePanel) {
      setOpenPanel(null);
    }
  }

  function selectPeriod(value: DashboardPeriod) {
    setSelectedPeriod(value);
    applyFilters({ period: value }, { closePanel: value !== "custom" });
  }

  return (
    <section
      ref={rootRef}
      className="relative z-30 inline-flex max-w-full"
    >
      <div className="flex flex-wrap items-center gap-2">
        <FilterButton
          label="Период"
          value={periodLabels[selectedPeriod]}
          isOpen={openPanel === "period"}
          onClick={() => setOpenPanel(openPanel === "period" ? null : "period")}
        />
        <FilterButton
          label="Клубы"
          value={selectedStoresLabel}
          isOpen={openPanel === "clubs"}
          onClick={() => setOpenPanel(openPanel === "clubs" ? null : "clubs")}
        />
      </div>

      {openPanel === "period" ? (
        <DropdownPanel className="left-0 top-full w-[min(520px,calc(100vw-3rem))]">
          <div className="grid gap-2">
            {(Object.keys(periodLabels) as DashboardPeriod[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => selectPeriod(value)}
                className={[
                  "rounded-xl border px-3 py-2 text-left text-sm",
                  selectedPeriod === value
                    ? "border-zinc-950 bg-zinc-950 text-white dark:border-emerald-400 dark:bg-emerald-400 dark:text-zinc-950"
                    : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900",
                ].join(" ")}
              >
                {periodLabels[value]}
              </button>
            ))}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">
                С даты
              </span>
              <input
                type="date"
                value={customFrom}
                onChange={(event) => {
                  const nextDate = event.target.value;

                  setSelectedPeriod("custom");
                  setCustomFrom(nextDate);
                  applyFilters(
                    { period: "custom", dateFrom: nextDate },
                    { closePanel: false },
                  );
                }}
                className="mt-2 block w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
            <label className="text-sm">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">
                По дату
              </span>
              <input
                type="date"
                value={customTo}
                onChange={(event) => {
                  const nextDate = event.target.value;

                  setSelectedPeriod("custom");
                  setCustomTo(nextDate);
                  applyFilters(
                    { period: "custom", dateTo: nextDate },
                    { closePanel: false },
                  );
                }}
                className="mt-2 block w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
          </div>
        </DropdownPanel>
      ) : null}

      {openPanel === "clubs" ? (
        <DropdownPanel className="left-0 top-full w-[min(620px,calc(100vw-3rem))]">
          <div className="grid gap-2 sm:grid-cols-2">
            {stores.map((store) => (
              <button
                key={store.id}
                type="button"
                onClick={() => toggleStore(store.id)}
                className={[
                  "flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm",
                  selectedStores.includes(store.id)
                    ? "border-zinc-950 bg-zinc-950 text-white dark:border-emerald-400 dark:bg-emerald-400 dark:text-zinc-950"
                    : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900",
                ].join(" ")}
              >
                <span
                  className={[
                    "h-3 w-3 rounded border",
                    selectedStores.includes(store.id)
                      ? "border-white bg-white dark:border-zinc-950 dark:bg-zinc-950"
                      : "border-zinc-400",
                  ].join(" ")}
                />
                <span>{store.name}</span>
              </button>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-zinc-100 pt-3 dark:border-zinc-800">
            <p className="text-xs text-zinc-500">
              Выбрано: {selectedStores.length || "вся сеть"}
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setSelectedStores([]);
                  applyFilters({ storeIds: [] }, { closePanel: false });
                }}
                className="text-sm font-medium text-zinc-900 underline underline-offset-4 dark:text-zinc-100"
              >
                Очистить
              </button>
            </div>
          </div>
        </DropdownPanel>
      ) : null}

    </section>
  );
}

function FilterButton({
  label,
  value,
  isOpen,
  onClick,
}: {
  label: string;
  value: string;
  isOpen: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={`${label}: ${value}`}
      onClick={onClick}
      className={[
        "inline-flex items-center justify-between gap-2 rounded-full border px-3 py-2 text-left text-sm transition-colors",
        isOpen
          ? "border-zinc-950 bg-zinc-950 text-white dark:border-emerald-400 dark:bg-emerald-400 dark:text-zinc-950"
          : "border-zinc-200 bg-zinc-50/80 text-zinc-950 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-50 dark:hover:bg-zinc-900",
      ].join(" ")}
    >
      <span className="min-w-0">
        <span className="inline-block max-w-[190px] truncate align-bottom font-semibold">
          {value}
        </span>
      </span>
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        fill="none"
        className={[
          "h-4 w-4 shrink-0 self-center opacity-60 transition-transform",
          isOpen ? "rotate-180" : "",
        ].join(" ")}
      >
        <path
          d="M5.75 8.25 10 12.5l4.25-4.25"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

function DropdownPanel({
  children,
  className,
}: {
  children: React.ReactNode;
  className: string;
}) {
  return (
    <div
      className={[
        "absolute z-40 mt-2 rounded-3xl border border-zinc-200 bg-white p-4 shadow-2xl shadow-zinc-950/10 dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-black/40",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

function isPeriod(value: string): value is DashboardPeriod {
  return (
    value === "month" ||
    value === "quarter" ||
    value === "year" ||
    value === "week" ||
    value === "day" ||
    value === "custom"
  );
}

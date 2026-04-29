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
type OpenPanel = "period" | "clubs" | "grouping" | null;

const periodLabels: Record<DashboardPeriod, string> = {
  month: "Текущий месяц",
  quarter: "Текущий квартал",
  year: "Текущий год",
  week: "Текущая неделя",
  day: "Текущие сутки",
  custom: "Произвольный период",
};

const groupingLabels: Record<DashboardSkuGrouping, string> = {
  club: "Отдельно по клубам",
  network: "По всей сети",
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
  const [selectedGrouping, setSelectedGrouping] =
    useState<DashboardSkuGrouping>(skuGrouping);
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
    setSelectedStores((current) =>
      current.includes(storeId)
        ? current.filter((id) => id !== storeId)
        : [...current, storeId],
    );
  }

  function applyFilters(
    overrides: Partial<{
      period: DashboardPeriod;
      skuGrouping: DashboardSkuGrouping;
    }> = {},
  ) {
    const params = new URLSearchParams();
    const nextPeriod = overrides.period ?? selectedPeriod;
    const nextGrouping = overrides.skuGrouping ?? selectedGrouping;

    params.set("period", nextPeriod);
    params.set("skuGrouping", nextGrouping);

    if (nextPeriod === "custom") {
      params.set("dateFrom", customFrom);
      params.set("dateTo", customTo);
    }

    selectedStores.forEach((storeId) => {
      params.append("storeIds", storeId);
    });

    router.push(`${pathname}?${params.toString()}`);
    setOpenPanel(null);
  }

  return (
    <section
      ref={rootRef}
      className="relative z-10 mt-6 rounded-3xl border border-zinc-200 bg-white/85 p-4 shadow-sm backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80"
    >
      <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-center">
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
        <FilterButton
          label="Группировка ТОП SKU"
          value={groupingLabels[selectedGrouping]}
          isOpen={openPanel === "grouping"}
          onClick={() =>
            setOpenPanel(openPanel === "grouping" ? null : "grouping")
          }
        />
        <button
          type="button"
          onClick={() => applyFilters()}
          className="h-full rounded-2xl bg-zinc-950 px-5 py-3 text-sm font-semibold text-white hover:bg-zinc-800 dark:bg-emerald-400 dark:text-zinc-950 dark:hover:bg-emerald-300"
        >
          Применить
        </button>
      </div>

      {openPanel === "period" ? (
        <DropdownPanel className="left-4 top-[calc(100%-0.5rem)] w-[min(520px,calc(100vw-3rem))]">
          <div className="grid gap-2">
            {(Object.keys(periodLabels) as DashboardPeriod[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setSelectedPeriod(value)}
                onDoubleClick={() => {
                  setSelectedPeriod(value);
                  applyFilters({ period: value });
                }}
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
                  setSelectedPeriod("custom");
                  setCustomFrom(event.target.value);
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
                  setSelectedPeriod("custom");
                  setCustomTo(event.target.value);
                }}
                className="mt-2 block w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
          </div>
          <div className="mt-4 flex justify-end border-t border-zinc-100 pt-3 dark:border-zinc-800">
            <button
              type="button"
              onClick={() => applyFilters()}
              className="rounded-xl bg-zinc-950 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 dark:bg-emerald-400 dark:text-zinc-950 dark:hover:bg-emerald-300"
            >
              Применить
            </button>
          </div>
        </DropdownPanel>
      ) : null}

      {openPanel === "clubs" ? (
        <DropdownPanel className="left-4 top-[calc(100%-0.5rem)] w-[min(620px,calc(100vw-3rem))] lg:left-[calc(33.33%+0.25rem)]">
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
                onClick={() => setSelectedStores([])}
                className="text-sm font-medium text-zinc-900 underline underline-offset-4 dark:text-zinc-100"
              >
                Очистить
              </button>
              <button
                type="button"
                onClick={() => applyFilters()}
                className="rounded-xl bg-zinc-950 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 dark:bg-emerald-400 dark:text-zinc-950 dark:hover:bg-emerald-300"
              >
                Применить
              </button>
            </div>
          </div>
        </DropdownPanel>
      ) : null}

      {openPanel === "grouping" ? (
        <DropdownPanel className="right-4 top-[calc(100%-0.5rem)] w-[min(520px,calc(100vw-3rem))]">
          <div className="grid gap-2">
            {(["club", "network"] as DashboardSkuGrouping[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setSelectedGrouping(value)}
                onDoubleClick={() => {
                  setSelectedGrouping(value);
                  applyFilters({ skuGrouping: value });
                }}
                className={[
                  "rounded-xl border px-3 py-2 text-left text-sm",
                  selectedGrouping === value
                    ? "border-zinc-950 bg-zinc-950 text-white dark:border-emerald-400 dark:bg-emerald-400 dark:text-zinc-950"
                    : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900",
                ].join(" ")}
              >
                <span className="font-medium">{groupingLabels[value]}</span>
                <span className="mt-1 block text-xs opacity-70">
                  {value === "club"
                    ? "Товары считаются отдельно по каждому клубу."
                    : "Одинаковые названия или артикулы суммируются по сети."}
                </span>
              </button>
            ))}
          </div>
          <div className="mt-4 flex justify-end border-t border-zinc-100 pt-3 dark:border-zinc-800">
            <button
              type="button"
              onClick={() => applyFilters()}
              className="rounded-xl bg-zinc-950 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 dark:bg-emerald-400 dark:text-zinc-950 dark:hover:bg-emerald-300"
            >
              Применить
            </button>
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
      onClick={onClick}
      className={[
        "flex min-h-16 items-center justify-between gap-4 rounded-2xl border px-4 py-3 text-left transition-colors",
        isOpen
          ? "border-zinc-950 bg-zinc-950 text-white dark:border-emerald-400 dark:bg-emerald-400 dark:text-zinc-950"
          : "border-zinc-200 bg-zinc-50 text-zinc-950 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-50 dark:hover:bg-zinc-900",
      ].join(" ")}
    >
      <span>
        <span className="block text-xs font-medium uppercase tracking-wide opacity-60">
          {label}
        </span>
        <span className="mt-1 line-clamp-1 block text-sm font-semibold">
          {value}
        </span>
      </span>
      <span className="text-lg leading-none opacity-60">⌄</span>
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
        "absolute z-20 mt-4 rounded-3xl border border-zinc-200 bg-white p-4 shadow-2xl shadow-zinc-950/10 dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-black/40",
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

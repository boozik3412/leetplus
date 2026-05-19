"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type {
  GuestFilterOptions,
  GuestListFilters,
  GuestSegment,
} from "@/lib/guests";

type GuestPeriod =
  | "day"
  | "full-day"
  | "week"
  | "full-week"
  | "month"
  | "full-month"
  | "quarter"
  | "full-quarter"
  | "year"
  | "full-year"
  | "custom";

type OpenPanel = "period" | null;

const periodLabels: Record<GuestPeriod, string> = {
  day: "Текущие сутки",
  "full-day": "Полные сутки",
  week: "Текущая неделя",
  "full-week": "Полная неделя",
  month: "Текущий месяц",
  "full-month": "Полный месяц",
  quarter: "Текущий квартал",
  "full-quarter": "Полный квартал",
  year: "Текущий год",
  "full-year": "Полный год",
  custom: "Произвольный период",
};

const periodOptionGroups: { current: GuestPeriod; full: GuestPeriod }[] = [
  { current: "day", full: "full-day" },
  { current: "week", full: "full-week" },
  { current: "month", full: "full-month" },
  { current: "quarter", full: "full-quarter" },
  { current: "year", full: "full-year" },
];

const segmentLabels: Record<GuestSegment | "top", string> = {
  top: "TOP по деньгам",
  active: "Активные",
  new: "Новые",
  repeat: "Повторные",
  risk: "В риске",
  lost: "Потерянные",
  quiet: "Тихие",
};

export function GuestDashboardFilters({
  filters,
  options,
  period,
  periodFrom,
  periodTo,
}: {
  filters: GuestListFilters;
  options: GuestFilterOptions;
  period?: string;
  periodFrom: string;
  periodTo: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const rootRef = useRef<HTMLElement | null>(null);
  const [openPanel, setOpenPanel] = useState<OpenPanel>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<GuestPeriod>(
    isGuestPeriod(period) ? period : "custom",
  );
  const [customFrom, setCustomFrom] = useState(filters.dateFrom ?? periodFrom);
  const [customTo, setCustomTo] = useState(filters.dateTo ?? periodTo);
  const selectedPeriodLabel =
    selectedPeriod === "custom"
      ? formatCustomPeriodLabel(customFrom, customTo)
      : periodLabels[selectedPeriod];

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

  function applyFilters(
    overrides: Partial<{
      period: GuestPeriod;
      dateFrom: string;
      dateTo: string;
      storeId: string;
      guestGroupId: string;
      segment: GuestListFilters["segment"];
      search: string;
      pageSize: string;
    }> = {},
    options?: { closePanel?: boolean },
  ) {
    const params = new URLSearchParams();
    const nextPeriod = overrides.period ?? selectedPeriod;
    const nextDateFrom = overrides.dateFrom ?? customFrom;
    const nextDateTo = overrides.dateTo ?? customTo;
    const nextStoreId = overrides.storeId ?? filters.storeId ?? "";
    const nextGroupId = overrides.guestGroupId ?? filters.guestGroupId ?? "";
    const nextSegment = overrides.segment ?? filters.segment ?? "top";
    const nextSearch = overrides.search ?? filters.search ?? "";
    const nextPageSize = overrides.pageSize ?? filters.pageSize ?? "50";

    params.set("dateFrom", nextDateFrom);
    params.set("dateTo", nextDateTo);
    params.set("period", nextPeriod);
    params.set("segment", nextSegment);
    params.set("pageSize", nextPageSize);

    if (nextStoreId) {
      params.set("storeId", nextStoreId);
    }

    if (nextGroupId) {
      params.set("guestGroupId", nextGroupId);
    }

    if (nextSearch.trim()) {
      params.set("search", nextSearch.trim());
    }

    if (filters.crmStatus) {
      params.set("crmStatus", filters.crmStatus);
    }

    if (filters.sort) {
      params.set("sort", filters.sort);
    }

    if (filters.direction) {
      params.set("direction", filters.direction);
    }

    router.push(`${pathname}?${params.toString()}`);

    if (options?.closePanel ?? true) {
      setOpenPanel(null);
    }
  }

  function selectPeriod(value: GuestPeriod) {
    const range = rangeForPeriod(value);

    setSelectedPeriod(value);

    if (range) {
      setCustomFrom(range.from);
      setCustomTo(range.to);
      applyFilters(
        { period: value, dateFrom: range.from, dateTo: range.to },
        { closePanel: true },
      );
      return;
    }

    applyFilters({ period: value }, { closePanel: false });
  }

  return (
    <section
      ref={rootRef}
      className="relative z-30 mt-6 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
    >
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);

          applyFilters({
            storeId: String(formData.get("storeId") ?? ""),
            guestGroupId: String(formData.get("guestGroupId") ?? ""),
            segment: String(
              formData.get("segment") ?? "top",
            ) as GuestListFilters["segment"],
            search: String(formData.get("search") ?? ""),
            pageSize: String(formData.get("pageSize") ?? "50"),
          });
        }}
      >
        <div className="relative">
          <FilterButton
            label="Период"
            value={selectedPeriodLabel}
            isOpen={openPanel === "period"}
            onClick={() =>
              setOpenPanel(openPanel === "period" ? null : "period")
            }
          />
          {openPanel === "period" ? (
            <DropdownPanel>
              <div className="grid gap-2">
                {periodOptionGroups.map((group) => (
                  <div
                    key={group.current}
                    className="grid gap-2 sm:grid-cols-2"
                  >
                    <PeriodOptionButton
                      value={group.current}
                      selectedPeriod={selectedPeriod}
                      onSelect={selectPeriod}
                    />
                    <PeriodOptionButton
                      value={group.full}
                      selectedPeriod={selectedPeriod}
                      onSelect={selectPeriod}
                    />
                  </div>
                ))}
                <PeriodOptionButton
                  value="custom"
                  selectedPeriod={selectedPeriod}
                  onSelect={selectPeriod}
                />
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
                        {
                          period: "custom",
                          dateFrom: nextDate,
                          dateTo: customTo,
                        },
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
                        {
                          period: "custom",
                          dateFrom: customFrom,
                          dateTo: nextDate,
                        },
                        { closePanel: false },
                      );
                    }}
                    className="mt-2 block w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  />
                </label>
              </div>
            </DropdownPanel>
          ) : null}
        </div>

        <SelectField
          label="Клуб"
          name="storeId"
          defaultValue={filters.storeId ?? ""}
          onChange={(value) => applyFilters({ storeId: value })}
        >
          <option value="">Вся сеть</option>
          {options.stores.map((store) => (
            <option key={store.id} value={store.id}>
              {store.name}
            </option>
          ))}
        </SelectField>

        <SelectField
          label="Группа"
          name="guestGroupId"
          defaultValue={filters.guestGroupId ?? ""}
          onChange={(value) => applyFilters({ guestGroupId: value })}
        >
          <option value="">Все группы</option>
          {options.groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name} ({group.externalDomain ?? "источник"})
            </option>
          ))}
        </SelectField>

        <SelectField
          label="Сегмент"
          name="segment"
          defaultValue={filters.segment ?? "top"}
          onChange={(value) =>
            applyFilters({ segment: value as GuestListFilters["segment"] })
          }
        >
          {(
            ["top", "active", "new", "repeat", "risk", "lost", "quiet"] as const
          ).map((segment) => (
            <option key={segment} value={segment}>
              {segmentLabels[segment]}
            </option>
          ))}
        </SelectField>

        <label className="grid min-w-[180px] flex-1 gap-1 text-sm md:max-w-xs">
          <span className="text-xs font-medium uppercase text-zinc-500">
            Поиск
          </span>
          <input
            type="search"
            name="search"
            defaultValue={filters.search ?? ""}
            placeholder="ID, телефон, email"
            className="h-10 w-full min-w-0 rounded-full border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
        </label>
        <input type="hidden" name="pageSize" value={filters.pageSize ?? "50"} />
        <button className="h-10 rounded-full bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-zinc-800 dark:bg-emerald-400 dark:text-zinc-950 dark:hover:bg-emerald-300">
          Применить
        </button>
      </form>
    </section>
  );
}

function SelectField({
  label,
  name,
  defaultValue,
  onChange,
  children,
}: {
  label: string;
  name: string;
  defaultValue: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="grid min-w-[170px] flex-1 gap-1 text-sm md:max-w-xs">
      <span className="text-xs font-medium uppercase text-zinc-500">
        {label}
      </span>
      <select
        name={name}
        defaultValue={defaultValue}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full min-w-0 rounded-full border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
      >
        {children}
      </select>
    </label>
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
        "inline-flex h-10 max-w-full items-center justify-between gap-2 rounded-full border px-3 text-left text-sm transition-colors",
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
      <span
        aria-hidden="true"
        className={[
          "shrink-0 text-sm opacity-60 transition-transform",
          isOpen ? "rotate-180" : "",
        ].join(" ")}
      >
        ˅
      </span>
    </button>
  );
}

function DropdownPanel({ children }: { children: ReactNode }) {
  return (
    <div className="absolute left-0 top-full z-40 mt-2 w-[min(760px,calc(100vw-3rem))] rounded-3xl border border-zinc-200 bg-white p-4 shadow-2xl shadow-zinc-950/10 dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-black/40">
      {children}
    </div>
  );
}

function PeriodOptionButton({
  value,
  selectedPeriod,
  onSelect,
}: {
  value: GuestPeriod;
  selectedPeriod: GuestPeriod;
  onSelect: (value: GuestPeriod) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={[
        "rounded-xl border px-3 py-2 text-left text-sm",
        selectedPeriod === value
          ? "border-zinc-950 bg-zinc-950 text-white dark:border-emerald-400 dark:bg-emerald-400 dark:text-zinc-950"
          : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900",
      ].join(" ")}
    >
      {periodLabels[value]}
    </button>
  );
}

function rangeForPeriod(period: GuestPeriod) {
  if (period === "custom") {
    return null;
  }

  const today = startOfUtcDay(new Date());
  const yesterday = addUtcDays(today, -1);

  if (period === "day") {
    return toRange(today, today);
  }

  if (period === "full-day") {
    return toRange(yesterday, yesterday);
  }

  if (period === "week") {
    return toRange(startOfWeek(today), today);
  }

  if (period === "full-week") {
    const end = addUtcDays(startOfWeek(today), -1);
    return toRange(startOfWeek(end), end);
  }

  if (period === "month") {
    return toRange(startOfMonth(today), today);
  }

  if (period === "full-month") {
    const end = addUtcDays(startOfMonth(today), -1);
    return toRange(startOfMonth(end), end);
  }

  if (period === "quarter") {
    return toRange(startOfQuarter(today), today);
  }

  if (period === "full-quarter") {
    const end = addUtcDays(startOfQuarter(today), -1);
    return toRange(startOfQuarter(end), end);
  }

  if (period === "year") {
    return toRange(
      new Date(Date.UTC(today.getUTCFullYear(), 0, 1)),
      today,
    );
  }

  const end = new Date(Date.UTC(today.getUTCFullYear() - 1, 11, 31));
  return toRange(new Date(Date.UTC(end.getUTCFullYear(), 0, 1)), end);
}

function startOfUtcDay(value: Date) {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

function addUtcDays(value: Date, days: number) {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function startOfWeek(value: Date) {
  const day = value.getUTCDay() || 7;
  return addUtcDays(value, 1 - day);
}

function startOfMonth(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
}

function startOfQuarter(value: Date) {
  const quarterMonth = Math.floor(value.getUTCMonth() / 3) * 3;
  return new Date(Date.UTC(value.getUTCFullYear(), quarterMonth, 1));
}

function toRange(from: Date, to: Date) {
  return {
    from: toIsoDate(from),
    to: toIsoDate(to),
  };
}

function toIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function formatCustomPeriodLabel(from: string, to: string) {
  const fromLabel = formatDateInputLabel(from);
  const toLabel = formatDateInputLabel(to);

  if (!fromLabel || !toLabel) {
    return periodLabels.custom;
  }

  return fromLabel === toLabel ? fromLabel : `${fromLabel}-${toLabel}`;
}

function formatDateInputLabel(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  return `${match[3]}.${match[2]}.${match[1]}`;
}

function isGuestPeriod(value: string | undefined): value is GuestPeriod {
  return (
    value === "day" ||
    value === "full-day" ||
    value === "week" ||
    value === "full-week" ||
    value === "month" ||
    value === "full-month" ||
    value === "quarter" ||
    value === "full-quarter" ||
    value === "year" ||
    value === "full-year" ||
    value === "custom"
  );
}

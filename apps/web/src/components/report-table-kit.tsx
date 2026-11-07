import type { ReactNode } from "react";

/**
 * Table parts shared by the report screens built like «Заказ товаров»:
 * sortable header, cells, summary tiles and the multi-select filter.
 */

export type SortDirection = "asc" | "desc";

export type TableColumn<K extends string> = {
  key: K;
  label: string;
  align?: "right";
  hint?: string;
};

export function HeaderCell<K extends string>({
  column,
  sortKey,
  sortDirection,
  onSort,
  sticky = false,
}: {
  column: TableColumn<K>;
  sortKey: K;
  sortDirection: SortDirection;
  onSort: (key: K) => void;
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

export function Cell({
  children,
  right = false,
  strong = false,
  muted = false,
}: {
  children: ReactNode;
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

export function SummaryTile({
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

export function MultiSelect({
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

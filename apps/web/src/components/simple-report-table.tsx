"use client";

import { useMemo, useState, type ReactNode } from "react";

export type SimpleReportRow = Record<string, string | number | null>;

export type SimpleReportColumn = {
  key: string;
  label: string;
  align?: "left" | "right";
};

export type SimpleReportFilter = {
  key: string;
  label: string;
  type: "text" | "select" | "multi-select";
};

export type SimpleReportServerExport = {
  label: string;
  href: string;
  tableStateParams?: {
    filters?: Record<string, string>;
    sortKey?: string;
    sortDirection?: string;
  };
};

type SortDirection = "asc" | "desc";
type FilterValue = string | string[];

export function SimpleReportTable({
  rows,
  columns,
  filters = [],
  title,
  extraActions,
  serverExports = [],
}: {
  rows: SimpleReportRow[];
  columns: SimpleReportColumn[];
  filters?: SimpleReportFilter[];
  title: string;
  extraActions?: ReactNode;
  serverExports?: SimpleReportServerExport[];
}) {
  const [filterValues, setFilterValues] = useState<Record<string, FilterValue>>({});
  const [sortKey, setSortKey] = useState(columns[0]?.key ?? "");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const filteredRows = useMemo(() => {
    return rows.filter((row) =>
      filters.every((filter) => {
        const value = filterValues[filter.key];
        const rowValue = String(row[filter.key] ?? "");

        if (Array.isArray(value)) {
          return value.length === 0 || value.includes(rowValue);
        }

        if (!value || value === "all") {
          return true;
        }

        if (filter.type === "select") {
          return rowValue === value;
        }

        return rowValue.toLowerCase().includes(value.toLowerCase());
      }),
    );
  }, [filterValues, filters, rows]);
  const sortedRows = useMemo(() => {
    return [...filteredRows].sort((a, b) => {
      const result = compareValues(a[sortKey], b[sortKey]);
      return sortDirection === "asc" ? result : -result;
    });
  }, [filteredRows, sortDirection, sortKey]);

  function toggleSort(nextKey: string) {
    if (nextKey === sortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextKey);
    setSortDirection("asc");
  }

  function toggleMultiFilter(filterKey: string, value: string) {
    setFilterValues((current) => {
      const currentValues = selectedFilterValues(current[filterKey]);
      const nextValues = currentValues.includes(value)
        ? currentValues.filter((item) => item !== value)
        : [...currentValues, value];

      return {
        ...current,
        [filterKey]: nextValues,
      };
    });
  }

  function clearMultiFilter(filterKey: string) {
    setFilterValues((current) => ({
      ...current,
      [filterKey]: [],
    }));
  }

  function exportRows(format: "excel" | "1c" | "pdf") {
    if (format === "excel") {
      downloadFile(
        `${slug(title)}-${dateStamp()}.xls`,
        tableHtml(title, columns, sortedRows),
        "application/vnd.ms-excel;charset=utf-8",
      );
      return;
    }

    if (format === "1c") {
      downloadFile(
        `${slug(title)}-1c-${dateStamp()}.csv`,
        `\uFEFF${toCsv(columns, sortedRows)}`,
        "text/csv;charset=utf-8",
      );
      return;
    }

    openPrintWindow(title, columns, sortedRows);
  }

  return (
    <div>
      <div className="flex flex-col gap-3 border-b border-zinc-200 bg-white px-4 py-4 dark:border-zinc-800/45 dark:bg-zinc-950 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {filters.map((filter) => {
            const options = uniqueValues(rows, filter.key);
            const selectedValues = selectedFilterValues(filterValues[filter.key]);

            return (
              <div key={filter.key} className="block">
                <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  {filter.label}
                </span>
                {filter.type === "select" ? (
                  <select
                    value={String(filterValues[filter.key] ?? "all")}
                    onChange={(event) =>
                      setFilterValues((current) => ({
                        ...current,
                        [filter.key]: event.target.value,
                      }))
                    }
                    className="mt-2 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-100"
                  >
                    <option value="all">Все</option>
                    {options.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                ) : filter.type === "multi-select" ? (
                  <details className="group relative mt-2">
                    <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-100 dark:hover:bg-zinc-900 [&::-webkit-details-marker]:hidden">
                      <span className="truncate">
                        {multiSelectLabel(selectedValues)}
                      </span>
                      <span className="text-zinc-400 transition-transform group-open:rotate-180">
                        v
                      </span>
                    </summary>
                    <div className="absolute z-40 mt-2 w-full min-w-64 rounded-xl border border-zinc-200 bg-white p-2 shadow-xl shadow-zinc-900/10 dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-black/30">
                      <button
                        type="button"
                        onClick={() => clearMultiFilter(filter.key)}
                        className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
                      >
                        Все
                      </button>
                      <div className="mt-1 max-h-64 overflow-y-auto pr-1">
                        {options.map((value) => (
                          <label
                            key={value}
                            className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-900"
                          >
                            <input
                              type="checkbox"
                              checked={selectedValues.includes(value)}
                              onChange={() => toggleMultiFilter(filter.key, value)}
                              className="h-4 w-4 accent-emerald-500"
                            />
                            <span className="truncate">{value}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </details>
                ) : (
                  <input
                    value={String(filterValues[filter.key] ?? "")}
                    onChange={(event) =>
                      setFilterValues((current) => ({
                        ...current,
                        [filter.key]: event.target.value,
                      }))
                    }
                    className="mt-2 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-100"
                    placeholder="Фильтр"
                  />
                )}
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-zinc-500">
            Показано {sortedRows.length} из {rows.length}
          </span>
          <button
            type="button"
            onClick={() => exportRows("excel")}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
          >
            Excel
          </button>
          <button
            type="button"
            onClick={() => exportRows("1c")}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
          >
            1C
          </button>
          <button
            type="button"
            onClick={() => exportRows("pdf")}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
          >
            PDF
          </button>
          {serverExports.map((action) => (
            <a
              key={`${action.label}:${action.href}`}
              href={tableStateHref(
                action,
                filterValues,
                sortKey,
                sortDirection,
              )}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
            >
              {action.label}
            </a>
          ))}
          {extraActions}
        </div>
      </div>

      <div className="overflow-x-auto bg-white dark:bg-zinc-950">
        <table className="w-full min-w-[980px] text-left text-xs">
          <thead className="bg-zinc-100 uppercase text-zinc-500 dark:bg-zinc-900/70 dark:text-zinc-500">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={[
                    "px-3 py-2 font-medium",
                    column.align === "right" ? "text-right" : "",
                  ].join(" ")}
                >
                  <button
                    type="button"
                    onClick={() => toggleSort(column.key)}
                    className="inline-flex items-center gap-1 uppercase hover:text-zinc-900 dark:hover:text-zinc-100"
                  >
                    {column.label}
                    <span className={sortKey === column.key ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-300 dark:text-zinc-700"}>
                      {sortKey === column.key
                        ? sortDirection === "asc"
                          ? "↑"
                          : "↓"
                        : "↕"}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/45">
            {sortedRows.map((row, index) => (
              <tr key={index}>
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={[
                      "px-3 py-2",
                      column.align === "right" ? "text-right tabular-nums" : "",
                    ].join(" ")}
                  >
                    {formatCellValue(row[column.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function uniqueValues(rows: SimpleReportRow[], key: string) {
  return [...new Set(rows.map((row) => String(row[key] ?? "")).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b, "ru"),
  );
}

function selectedFilterValues(value: FilterValue | undefined) {
  return Array.isArray(value) ? value : [];
}

function tableStateHref(
  action: SimpleReportServerExport,
  filterValues: Record<string, FilterValue>,
  sortKey: string,
  sortDirection: SortDirection,
) {
  const url = new URL(action.href, "https://leetplus.local");
  const stateParams = action.tableStateParams;

  if (!stateParams) {
    return `${url.pathname}${url.search}${url.hash}`;
  }

  Object.entries(stateParams.filters ?? {}).forEach(([filterKey, paramName]) => {
    url.searchParams.delete(paramName);
    const value = filterValues[filterKey];

    if (Array.isArray(value)) {
      value
        .filter((item) => item.trim())
        .forEach((item) => url.searchParams.append(paramName, item));
      return;
    }

    if (value && value !== "all") {
      url.searchParams.set(paramName, value.trim());
    }
  });

  if (stateParams.sortKey && sortKey) {
    url.searchParams.set(stateParams.sortKey, sortKey);
  }

  if (stateParams.sortDirection) {
    url.searchParams.set(stateParams.sortDirection, sortDirection);
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

function multiSelectLabel(values: string[]) {
  if (values.length === 0) {
    return "Все";
  }

  if (values.length === 1) {
    return values[0];
  }

  return `${values.length} выбрано`;
}

function compareValues(a: string | number | null, b: string | number | null) {
  if (typeof a === "number" && typeof b === "number") {
    return a - b;
  }

  return String(a ?? "").localeCompare(String(b ?? ""), "ru");
}

function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function toCsv(columns: SimpleReportColumn[], rows: SimpleReportRow[]) {
  return [
    columns.map((column) => escapeCsv(column.label)).join(";"),
    ...rows.map((row) =>
      columns.map((column) => escapeCsv(formatCellValue(row[column.key]))).join(";"),
    ),
  ].join("\r\n");
}

function tableHtml(
  title: string,
  columns: SimpleReportColumn[],
  rows: SimpleReportRow[],
) {
  return `<!doctype html><html><head><meta charset="utf-8" /></head><body><h1>${escapeHtml(title)}</h1><table border="1"><thead><tr>${columns
    .map((column) => `<th>${escapeHtml(column.label)}</th>`)
    .join("")}</tr></thead><tbody>${rows
    .map(
      (row) =>
        `<tr>${columns
          .map((column) => `<td>${escapeHtml(formatCellValue(row[column.key]))}</td>`)
          .join("")}</tr>`,
    )
    .join("")}</tbody></table></body></html>`;
}

function openPrintWindow(
  title: string,
  columns: SimpleReportColumn[],
  rows: SimpleReportRow[],
) {
  const printWindow = window.open("", "_blank", "noopener,noreferrer");

  if (!printWindow) {
    return;
  }

  printWindow.document.write(tableHtml(title, columns, rows));
  printWindow.document.close();
  printWindow.print();
}

function escapeCsv(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function dateStamp() {
  return new Date().toISOString().slice(0, 10);
}

function formatCellValue(value: string | number | null) {
  if (value === null || value === "") {
    return "—";
  }

  if (typeof value === "string") {
    return formatDateLikeValue(value) ?? value;
  }

  return String(value);
}

function formatDateLikeValue(value: string) {
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (dateOnlyMatch) {
    return `${dateOnlyMatch[3]}.${dateOnlyMatch[2]}.${dateOnlyMatch[1]}`;
  }

  const dateTimeMatch = /^(\d{4})-(\d{2})-(\d{2})T/.exec(value);

  if (dateTimeMatch) {
    return `${dateTimeMatch[3]}.${dateTimeMatch[2]}.${dateTimeMatch[1]}`;
  }

  return null;
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-zа-я0-9]+/gi, "-").replace(/^-|-$/g, "");
}

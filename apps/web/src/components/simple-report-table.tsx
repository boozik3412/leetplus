"use client";

import { useMemo, useState } from "react";

export type SimpleReportRow = Record<string, string | number | null>;

export type SimpleReportColumn = {
  key: string;
  label: string;
  align?: "left" | "right";
};

export type SimpleReportFilter = {
  key: string;
  label: string;
  type: "text" | "select";
};

type SortDirection = "asc" | "desc";

export function SimpleReportTable({
  rows,
  columns,
  filters = [],
  title,
}: {
  rows: SimpleReportRow[];
  columns: SimpleReportColumn[];
  filters?: SimpleReportFilter[];
  title: string;
}) {
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [sortKey, setSortKey] = useState(columns[0]?.key ?? "");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const filteredRows = useMemo(() => {
    return rows.filter((row) =>
      filters.every((filter) => {
        const value = filterValues[filter.key];

        if (!value || value === "all") {
          return true;
        }

        return String(row[filter.key] ?? "")
          .toLowerCase()
          .includes(value.toLowerCase());
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
      <div className="flex flex-col gap-3 border-b border-zinc-200 bg-white px-4 py-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid gap-3 sm:grid-cols-3">
          {filters.map((filter) => (
            <label key={filter.key} className="block">
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                {filter.label}
              </span>
              {filter.type === "select" ? (
                <select
                  value={filterValues[filter.key] ?? "all"}
                  onChange={(event) =>
                    setFilterValues((current) => ({
                      ...current,
                      [filter.key]: event.target.value,
                    }))
                  }
                  className="mt-2 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                >
                  <option value="all">Все</option>
                  {uniqueValues(rows, filter.key).map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={filterValues[filter.key] ?? ""}
                  onChange={(event) =>
                    setFilterValues((current) => ({
                      ...current,
                      [filter.key]: event.target.value,
                    }))
                  }
                  className="mt-2 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                  placeholder="Фильтр"
                />
              )}
            </label>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-zinc-500">
            Показано {sortedRows.length} из {rows.length}
          </span>
          <button
            type="button"
            onClick={() => exportRows("excel")}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-50"
          >
            Excel
          </button>
          <button
            type="button"
            onClick={() => exportRows("1c")}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-50"
          >
            1C
          </button>
          <button
            type="button"
            onClick={() => exportRows("pdf")}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-50"
          >
            PDF
          </button>
        </div>
      </div>

      <div className="overflow-x-auto bg-white">
        <table className="w-full min-w-[980px] text-left text-xs">
          <thead className="bg-zinc-100 uppercase text-zinc-500">
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
                    className="inline-flex items-center gap-1 uppercase hover:text-zinc-900"
                  >
                    {column.label}
                    <span className={sortKey === column.key ? "text-zinc-900" : "text-zinc-300"}>
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
          <tbody className="divide-y divide-zinc-100">
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
                    {String(row[column.key] ?? "—")}
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
      columns.map((column) => escapeCsv(String(row[column.key] ?? ""))).join(";"),
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
          .map((column) => `<td>${escapeHtml(String(row[column.key] ?? ""))}</td>`)
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

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-zа-я0-9]+/gi, "-").replace(/^-|-$/g, "");
}

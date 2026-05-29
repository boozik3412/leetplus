"use client";

import { useMemo, useState } from "react";
import type {
  RecommendationRole,
  RecommendationStatus,
  ReportRecommendation,
} from "@/lib/reports";

const STATUS_OPTIONS: RecommendationStatus[] = [
  "NEW",
  "IN_PROGRESS",
  "DONE",
  "REJECTED",
  "HIDDEN",
  "REAPPEARED",
];

const STATUS_LABELS: Record<RecommendationStatus, string> = {
  NEW: "Новая",
  IN_PROGRESS: "В работе",
  DONE: "Выполнена",
  REJECTED: "Отклонена",
  HIDDEN: "Скрыта",
  REAPPEARED: "Появилась повторно",
};

const STATUS_CLASSES: Record<RecommendationStatus, string> = {
  NEW: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-200",
  IN_PROGRESS:
    "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-200",
  DONE: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200",
  REJECTED: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-200",
  HIDDEN: "border-zinc-500/30 bg-zinc-500/10 text-zinc-700 dark:text-zinc-200",
  REAPPEARED:
    "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-200",
};

const ROLE_LABELS: Record<RecommendationRole, string> = {
  COMMERCIAL_DIRECTOR: "Коммерческий директор",
  BUYER: "Закупщик",
  CLUB_MANAGER: "Управляющий клуба",
};

const SEVERITY_LABELS: Record<ReportRecommendation["severity"], string> = {
  HIGH: "Высокий",
  MEDIUM: "Средний",
  LOW: "Низкий",
};

const KIND_LABELS: Record<ReportRecommendation["kind"], string> = {
  REPLENISH_STOCK: "Пополнение",
  NO_SALES: "Без продаж",
  LOW_MARGIN: "Низкая маржа",
};

export function RecommendationsWorkflowTable({
  initialRows,
}: {
  initialRows: ReportRecommendation[];
}) {
  const [rows, setRows] = useState(initialRows);
  const [statusFilter, setStatusFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return rows.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) {
        return false;
      }

      if (roleFilter !== "all" && row.role !== roleFilter) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return [
        row.article,
        row.productName,
        row.storeName ?? "",
        row.title,
        row.description,
        row.action,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [query, roleFilter, rows, statusFilter]);

  async function updateStatus(
    row: ReportRecommendation,
    status: RecommendationStatus,
  ) {
    setError(null);
    setPendingKey(row.id);

    try {
      const response = await fetch(
        `/api/reports/recommendations/${encodeURIComponent(row.id)}/state`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status, role: row.role }),
        },
      );

      if (!response.ok) {
        throw new Error("Не удалось сохранить статус");
      }

      const state = (await response.json()) as {
        status: RecommendationStatus;
        role: RecommendationRole;
        note: string | null;
        statusChangedAt: string;
      };

      setRows((current) =>
        current.map((item) =>
          item.id === row.id
            ? {
                ...item,
                status: state.status,
                role: state.role,
                statusNote: state.note,
                statusChangedAt: state.statusChangedAt,
              }
            : item,
        ),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Статус не сохранен");
    } finally {
      setPendingKey(null);
    }
  }

  return (
    <section className="px-4 pb-8">
      <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800/60 dark:bg-zinc-950">
        <div className="flex flex-col gap-3 border-b border-zinc-200 px-4 py-4 dark:border-zinc-800/60 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="text-xs font-medium uppercase text-zinc-500">
                Статус
              </span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="mt-2 block h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-100"
              >
                <option value="all">Все</option>
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium uppercase text-zinc-500">
                Ответственный
              </span>
              <select
                value={roleFilter}
                onChange={(event) => setRoleFilter(event.target.value)}
                className="mt-2 block h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-100"
              >
                <option value="all">Все</option>
                {Object.entries(ROLE_LABELS).map(([role, label]) => (
                  <option key={role} value={role}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium uppercase text-zinc-500">
                Поиск
              </span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="mt-2 block h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-100"
                placeholder="Артикул, товар, клуб"
              />
            </label>
          </div>
          <div className="text-sm text-zinc-500">
            Показано {filteredRows.length} из {rows.length}
          </div>
        </div>

        {error ? (
          <div className="border-b border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm font-medium text-rose-700 dark:text-rose-200">
            {error}
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] text-left text-sm">
            <thead className="bg-zinc-100 text-xs uppercase text-zinc-500 dark:bg-zinc-900/70">
              <tr>
                <th className="px-4 py-3 font-medium">Статус</th>
                <th className="px-4 py-3 font-medium">Ответственный</th>
                <th className="px-4 py-3 font-medium">Эффект</th>
                <th className="px-4 py-3 font-medium">Риск</th>
                <th className="px-4 py-3 font-medium">Товар</th>
                <th className="px-4 py-3 font-medium">Рекомендация</th>
                <th className="px-4 py-3 font-medium">Метрика</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
              {filteredRows.map((row) => (
                <tr
                  key={row.id}
                  className="align-top transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
                >
                  <td className="px-4 py-3">
                    <select
                      value={row.status}
                      disabled={pendingKey === row.id}
                      onChange={(event) =>
                        void updateStatus(
                          row,
                          event.target.value as RecommendationStatus,
                        )
                      }
                      className={[
                        "h-9 w-44 rounded-md border px-2 text-xs font-semibold transition-colors",
                        STATUS_CLASSES[row.status],
                      ].join(" ")}
                    >
                      {STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>
                          {STATUS_LABELS[status]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded-md border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-700 dark:border-zinc-800 dark:text-zinc-200">
                      {ROLE_LABELS[row.role]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold tabular-nums text-zinc-950 dark:text-zinc-100">
                      {formatMoney(row.effectAmount)}
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {row.effectLabel}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium">
                      {SEVERITY_LABELS[row.severity]}
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {KIND_LABELS[row.kind]}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-zinc-950 dark:text-zinc-100">
                      {row.productName}
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {row.article}
                      {row.storeName ? ` · ${row.storeName}` : ""}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-zinc-950 dark:text-zinc-100">
                      {row.title}
                    </div>
                    <p className="mt-1 max-w-xl leading-6 text-zinc-600 dark:text-zinc-300">
                      {row.description}
                    </p>
                    <p className="mt-2 max-w-xl font-medium text-zinc-800 dark:text-zinc-200">
                      {row.action}
                    </p>
                    <p className="mt-2 max-w-xl text-xs text-zinc-500">
                      {row.effectDescription}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-xs text-zinc-500">{row.metricLabel}</div>
                    <div className="mt-1 text-lg font-semibold tabular-nums text-zinc-950 dark:text-zinc-100">
                      {row.metricValue}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 0,
    style: "currency",
    currency: "RUB",
  }).format(value);
}

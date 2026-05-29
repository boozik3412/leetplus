"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { StaffTaskStatus } from "@/lib/staff-tasks";

const nextStatus: Partial<Record<StaffTaskStatus, StaffTaskStatus>> = {
  OPEN: "IN_PROGRESS",
  IN_PROGRESS: "ON_REVIEW",
  ON_REVIEW: "DONE",
};

const nextStatusLabels: Partial<Record<StaffTaskStatus, string>> = {
  OPEN: "В работу",
  IN_PROGRESS: "На проверку",
  ON_REVIEW: "Готово",
};

type StaffTaskStatusActionsProps = {
  taskId: string;
  status: StaffTaskStatus;
};

export function StaffTaskStatusActions({
  taskId,
  status,
}: StaffTaskStatusActionsProps) {
  const router = useRouter();
  const [pendingStatus, setPendingStatus] = useState<StaffTaskStatus | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  async function updateStatus(next: StaffTaskStatus) {
    setPendingStatus(next);
    setError(null);

    try {
      const response = await fetch(`/api/staff/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(data?.message ?? "Не удалось обновить статус");
      }

      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ошибка запроса");
    } finally {
      setPendingStatus(null);
    }
  }

  const primaryNext = nextStatus[status];
  const isTerminal = status === "DONE" || status === "CANCELED";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {primaryNext ? (
          <button
            type="button"
            disabled={pendingStatus !== null}
            onClick={() => updateStatus(primaryNext)}
            className="inline-flex h-9 items-center justify-center rounded-md bg-emerald-500 px-3 text-xs font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pendingStatus === primaryNext
              ? "Обновляем..."
              : nextStatusLabels[status]}
          </button>
        ) : null}

        {!isTerminal ? (
          <button
            type="button"
            disabled={pendingStatus !== null}
            onClick={() => updateStatus("CANCELED")}
            className="inline-flex h-9 items-center justify-center rounded-md border border-zinc-300 px-3 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            Отменить
          </button>
        ) : null}
      </div>

      {error ? <p className="text-xs text-red-600 dark:text-red-300">{error}</p> : null}
    </div>
  );
}

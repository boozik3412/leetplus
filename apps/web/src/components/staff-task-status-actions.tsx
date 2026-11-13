"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AuthUser } from "@/lib/auth";
import {
  canCancelStaffTask,
  canDeleteStaffTask,
  staffTaskDeleteRequest,
  staffTaskMoves,
  staffTaskStatusRequest,
  type StaffTaskMove,
} from "@/lib/staff-task-moves";
import type { StaffTaskStatus, StaffTaskUser } from "@/lib/staff-tasks";

type StaffTaskStatusActionsProps = {
  taskId: string;
  status: StaffTaskStatus;
  assignedToUser: StaffTaskUser | null;
  candidateUserIds?: string[];
  currentUser: Pick<AuthUser, "id" | "role" | "isPlatformAdmin">;
};

export function StaffTaskStatusActions({
  taskId,
  status,
  assignedToUser,
  candidateUserIds = [],
  currentUser,
}: StaffTaskStatusActionsProps) {
  const router = useRouter();
  const [pendingStatus, setPendingStatus] = useState<StaffTaskStatus | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function updateStatus(next: StaffTaskStatus) {
    setPendingStatus(next);
    setError(null);

    try {
      const request = staffTaskStatusRequest(taskId, next);
      const response = await fetch(request.url, {
        method: request.method,
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

  async function deleteTask() {
    setDeleting(true);
    setError(null);

    try {
      const request = staffTaskDeleteRequest(taskId);
      const response = await fetch(request.url, { method: request.method });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(data?.message ?? "Не удалось удалить задачу");
      }

      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ошибка запроса");
      setDeleting(false);
    }
  }

  const actions = staffTaskMoves(
    {
      status,
      assignedToUserId: assignedToUser?.id ?? null,
      candidateUserIds,
    },
    currentUser,
  );
  const isTerminal = status === "DONE" || status === "CANCELED";
  const canCancel = canCancelStaffTask(currentUser);
  const canDelete = canDeleteStaffTask(currentUser);
  const busy = pendingStatus !== null || deleting;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <button
            key={action.status}
            type="button"
            disabled={busy}
            onClick={() => updateStatus(action.status)}
            className={buttonClass(action.variant)}
          >
            {pendingStatus === action.status ? "Обновляем..." : action.label}
          </button>
        ))}

        {!isTerminal && canCancel ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => updateStatus("CANCELED")}
            className="inline-flex h-9 items-center justify-center rounded-md border border-zinc-300 px-3 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            Отменить
          </button>
        ) : null}

        {canDelete && !confirmDelete ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirmDelete(true)}
            className="inline-flex h-9 items-center justify-center rounded-md border border-red-200 px-3 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-500/40 dark:text-red-300 dark:hover:bg-red-500/10"
          >
            Удалить
          </button>
        ) : null}
      </div>

      {canDelete && confirmDelete ? (
        <div
          role="group"
          aria-label="Подтверждение удаления"
          className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200"
        >
          <p>Удалить задачу навсегда? Комментарии и история тоже удалятся.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void deleteTask()}
              className="inline-flex h-9 items-center justify-center rounded-md bg-red-600 px-3 text-xs font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {deleting ? "Удаляем..." : "Да, удалить"}
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={() => setConfirmDelete(false)}
              className="inline-flex h-9 items-center justify-center rounded-md border border-zinc-300 px-3 text-xs font-semibold text-zinc-700 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              Не удалять
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="text-xs text-red-600 dark:text-red-300">{error}</p>
      ) : null}
    </div>
  );
}

function buttonClass(variant: StaffTaskMove["variant"]) {
  if (variant === "secondary") {
    return "inline-flex h-9 items-center justify-center rounded-md border border-zinc-300 px-3 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900";
  }

  return "inline-flex h-9 items-center justify-center rounded-md bg-emerald-500 px-3 text-xs font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60";
}

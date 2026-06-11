"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AuthUser } from "@/lib/auth";
import type { StaffTaskStatus, StaffTaskUser } from "@/lib/staff-tasks";

const reviewerRoles = new Set<AuthUser["role"]>([
  "OWNER",
  "ADMIN",
  "MANAGER",
  "CLUB_MANAGER",
  "STANDARDS_MANAGER",
]);
const statusManagerRoles = new Set<AuthUser["role"]>([
  ...reviewerRoles,
  "SENIOR_ADMINISTRATOR",
  "CLUB_ADMINISTRATOR",
]);

type StaffTaskStatusAction = {
  status: StaffTaskStatus;
  label: string;
  variant: "primary" | "secondary";
};

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

  async function updateStatus(next: StaffTaskStatus) {
    setPendingStatus(next);
    setError(null);

    try {
      const endpoint =
        next === "CANCELED"
          ? `/api/staff/tasks/${taskId}`
          : `/api/staff/tasks/${taskId}/comments`;
      const response = await fetch(endpoint, {
        method: next === "CANCELED" ? "PATCH" : "POST",
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

  const actions = getStatusActions(
    status,
    assignedToUser,
    candidateUserIds,
    currentUser,
  );
  const isTerminal = status === "DONE" || status === "CANCELED";
  const canCancel = canCancelTask(currentUser);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <button
            key={action.status}
            type="button"
            disabled={pendingStatus !== null}
            onClick={() => updateStatus(action.status)}
            className={buttonClass(action.variant)}
          >
            {pendingStatus === action.status ? "Обновляем..." : action.label}
          </button>
        ))}

        {!isTerminal && canCancel ? (
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

      {error ? (
        <p className="text-xs text-red-600 dark:text-red-300">{error}</p>
      ) : null}
    </div>
  );
}

function getStatusActions(
  status: StaffTaskStatus,
  assignedToUser: StaffTaskUser | null,
  candidateUserIds: string[],
  currentUser: Pick<AuthUser, "id" | "role" | "isPlatformAdmin">,
) {
  const actions: StaffTaskStatusAction[] = [];
  const canMove = canMoveTask(assignedToUser, candidateUserIds, currentUser);

  if (status === "OPEN" && canMove) {
    actions.push({
      status: "IN_PROGRESS",
      label: "В работу",
      variant: "primary",
    });
  }

  if (status === "IN_PROGRESS" && canMove) {
    actions.push({
      status: "ON_REVIEW",
      label: "На проверку",
      variant: "primary",
    });
  }

  if (status === "ON_REVIEW") {
    if (canReturnTask(assignedToUser, candidateUserIds, currentUser)) {
      actions.push({
        status: "IN_PROGRESS",
        label: "Вернуть в работу",
        variant: "secondary",
      });
    }

    if (canApproveTask(assignedToUser, candidateUserIds, currentUser)) {
      actions.push({
        status: "DONE",
        label: "Готово",
        variant: "primary",
      });
    }
  }

  return actions;
}

function canApproveTask(
  assignedToUser: StaffTaskUser | null,
  candidateUserIds: string[],
  currentUser: Pick<AuthUser, "id" | "role" | "isPlatformAdmin">,
) {
  return (
    assignedToUser?.id !== currentUser.id &&
    !candidateUserIds.includes(currentUser.id) &&
    (currentUser.isPlatformAdmin || reviewerRoles.has(currentUser.role))
  );
}

function canReturnTask(
  assignedToUser: StaffTaskUser | null,
  candidateUserIds: string[],
  currentUser: Pick<AuthUser, "id" | "role" | "isPlatformAdmin">,
) {
  return canMoveTask(assignedToUser, candidateUserIds, currentUser);
}

function canMoveTask(
  assignedToUser: StaffTaskUser | null,
  candidateUserIds: string[],
  currentUser: Pick<AuthUser, "id" | "role" | "isPlatformAdmin">,
) {
  return (
    assignedToUser?.id === currentUser.id ||
    candidateUserIds.includes(currentUser.id) ||
    currentUser.isPlatformAdmin ||
    reviewerRoles.has(currentUser.role)
  );
}

function canCancelTask(
  currentUser: Pick<AuthUser, "role" | "isPlatformAdmin">,
) {
  return currentUser.isPlatformAdmin || statusManagerRoles.has(currentUser.role);
}

function buttonClass(variant: StaffTaskStatusAction["variant"]) {
  if (variant === "secondary") {
    return "inline-flex h-9 items-center justify-center rounded-md border border-zinc-300 px-3 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900";
  }

  return "inline-flex h-9 items-center justify-center rounded-md bg-emerald-500 px-3 text-xs font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60";
}

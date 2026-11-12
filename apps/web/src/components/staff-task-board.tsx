"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { Board } from "@/components/board";
import { SidePanel } from "@/components/side-panel";
import { StaffTaskHistory } from "@/components/staff-task-history";
import { StaffTaskStatusActions } from "@/components/staff-task-status-actions";
import type { BoardColumn } from "@/lib/board";
import {
  formatStaffTaskDate,
  formatStaffTaskDue,
  isKnowledgeBaseApprovalTask,
  staffTaskAssigneeLabel,
  staffTaskObserverLabels,
  staffTaskPriorityLabels,
  staffTaskStatusLabels,
  staffTaskTypeLabels,
} from "@/lib/staff-task-display";
import {
  staffTaskCandidateUserIds,
  staffTaskMoveRefusal,
  staffTaskStatusRequest,
  type StaffTaskActor,
} from "@/lib/staff-task-moves";
import type {
  StaffTask,
  StaffTaskStatus,
  StaffTaskUser,
} from "@/lib/staff-tasks";

type Props = {
  tasks: StaffTask[];
  users: StaffTaskUser[];
  currentUser: StaffTaskActor;
  /** `?taskId=` from a link (notification, history): opens that task. */
  focusTaskId?: string | null;
};

const columns: BoardColumn<StaffTaskStatus>[] = [
  { key: "OPEN", label: "Новые", tone: "neutral" },
  { key: "IN_PROGRESS", label: "В работе", tone: "progress" },
  { key: "ON_REVIEW", label: "На проверке", tone: "progress" },
  { key: "DONE", label: "Готово", tone: "success" },
  { key: "CANCELED", label: "Отменены", tone: "muted" },
];

const subscribe = () => () => {};

/** A drag that is saved but not yet back from the server. */
type Moved = { status: StaffTaskStatus; baseUpdatedAt: string };

function isClosed(status: StaffTaskStatus) {
  return status === "DONE" || status === "CANCELED";
}

async function readError(response: Response) {
  const body = (await response.json().catch(() => null)) as {
    message?: string | string[];
  } | null;
  const message = Array.isArray(body?.message)
    ? body.message.join(", ")
    : body?.message;

  return message || "Не удалось сохранить. Попробуйте ещё раз.";
}

export function StaffTaskBoard({
  tasks,
  users,
  currentUser,
  focusTaskId = null,
}: Props) {
  const router = useRouter();
  const [moved, setMoved] = useState<ReadonlyMap<string, Moved>>(
    () => new Map(),
  );
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());
  const [openId, setOpenId] = useState<string | null>(focusTaskId);
  const [notice, setNotice] = useState<string | null>(null);
  // Server render in UTC, then the viewer's own time zone (no hydration gap).
  const isClient = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const timeZone = isClient ? undefined : "UTC";

  // The override lasts until the server sends a newer version of the task.
  const shown = tasks.map((task) => {
    const move = moved.get(task.id);

    return move && move.baseUpdatedAt === task.updatedAt
      ? { ...task, status: move.status }
      : task;
  });
  const openTask = shown.find((task) => task.id === openId) ?? null;

  function forget(id: string) {
    setMoved((current) => {
      const next = new Map(current);
      next.delete(id);
      return next;
    });
  }

  async function move(task: StaffTask, to: StaffTaskStatus) {
    const refusal = staffTaskMoveRefusal(
      {
        status: task.status,
        assignedToUserId: task.assignedToUser?.id ?? null,
        candidateUserIds: staffTaskCandidateUserIds(task.labels),
      },
      to,
      currentUser,
    );

    if (refusal) {
      setNotice(`«${task.title}»: ${refusal}`);
      return;
    }

    setNotice(null);
    setMoved((current) =>
      new Map(current).set(task.id, {
        status: to,
        baseUpdatedAt: task.updatedAt,
      }),
    );
    setPending((current) => new Set(current).add(task.id));

    try {
      const request = staffTaskStatusRequest(task.id, to);
      const response = await fetch(request.url, {
        method: request.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: to }),
      });

      if (!response.ok) throw new Error(await readError(response));

      router.refresh();
    } catch (caught) {
      forget(task.id);
      setNotice(
        `«${task.title}»: ${
          caught instanceof Error ? caught.message : "не удалось сохранить"
        }`,
      );
    } finally {
      setPending((current) => {
        const next = new Set(current);
        next.delete(task.id);
        return next;
      });
    }
  }

  return (
    <>
      {notice ? (
        <p
          role="alert"
          className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100"
        >
          {notice}
        </p>
      ) : null}

      <Board
        ariaLabel="Задачи персонала по статусам"
        columns={columns}
        items={shown}
        idOf={(task) => task.id}
        columnOf={(task) => task.status}
        onOpen={(task) => setOpenId(task.id)}
        onMove={(task, to) => void move(task, to)}
        pendingIds={pending}
        emptyText={(column) =>
          column.key === "OPEN" ? "Новых задач нет" : "Здесь пока пусто"
        }
        renderCard={(task) => {
          const due = formatStaffTaskDue(task.dueAt, timeZone);
          const overdue = task.isOverdue && !isClosed(task.status);
          const assignee = staffTaskAssigneeLabel(task, users);

          return (
            <>
              <span className="block font-semibold leading-5 text-zinc-950 [overflow-wrap:anywhere] dark:text-white">
                {task.priority === "URGENT" || task.priority === "HIGH" ? (
                  <span
                    className={`mr-1.5 inline-block rounded px-1.5 py-0.5 align-[1px] text-[11px] font-bold ${
                      task.priority === "URGENT"
                        ? "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-200"
                        : "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200"
                    }`}
                  >
                    {staffTaskPriorityLabels[task.priority]}
                  </span>
                ) : null}
                {task.title}
              </span>
              <span className="mt-1 block text-zinc-600 [overflow-wrap:anywhere] dark:text-zinc-300">
                {assignee ?? "без ответственного"}
              </span>
              <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                <span>{task.store?.name ?? "Вся сеть"}</span>
                {due ? (
                  <span
                    className={
                      overdue
                        ? "rounded-full bg-red-50 px-2 py-0.5 font-semibold text-red-700 dark:bg-red-500/15 dark:text-red-200"
                        : undefined
                    }
                  >
                    {overdue ? `просрочена · ${due}` : `до ${due}`}
                  </span>
                ) : null}
              </span>
            </>
          );
        }}
      />

      <SidePanel
        open={openTask !== null}
        onClose={() => setOpenId(null)}
        eyebrow={
          openTask
            ? `${staffTaskStatusLabels[openTask.status]} · ${staffTaskTypeLabels[openTask.type]}`
            : undefined
        }
        title={openTask?.title ?? ""}
        footer={
          <button
            type="button"
            onClick={() => setOpenId(null)}
            className="cursor-pointer rounded-md border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            Закрыть
          </button>
        }
      >
        {openTask ? (
          <div className="space-y-5 text-sm">
            {openTask.isOverdue && !isClosed(openTask.status) ? (
              <p className="rounded-md bg-red-50 px-3 py-2 font-semibold text-red-700 dark:bg-red-500/15 dark:text-red-200">
                Просрочена
              </p>
            ) : null}
            {isKnowledgeBaseApprovalTask(openTask) ? (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">
                Материал базы знаний вернули на доработку.
              </p>
            ) : null}

            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
              <dt className="text-zinc-500 dark:text-zinc-400">Кто</dt>
              <dd className="min-w-0 font-medium [overflow-wrap:anywhere]">
                {staffTaskAssigneeLabel(openTask, users) ?? "не назначен"}
              </dd>
              <dt className="text-zinc-500 dark:text-zinc-400">Срок</dt>
              <dd>{formatStaffTaskDate(openTask.dueAt, timeZone)}</dd>
              <dt className="text-zinc-500 dark:text-zinc-400">Клуб</dt>
              <dd>{openTask.store?.name ?? "Вся сеть"}</dd>
              <dt className="text-zinc-500 dark:text-zinc-400">Важность</dt>
              <dd>{staffTaskPriorityLabels[openTask.priority]}</dd>
              {openTask.observers.length > 0 ? (
                <>
                  <dt className="text-zinc-500 dark:text-zinc-400">
                    Наблюдатели
                  </dt>
                  <dd className="min-w-0 [overflow-wrap:anywhere]">
                    {staffTaskObserverLabels(openTask)}
                  </dd>
                </>
              ) : null}
              <dt className="text-zinc-500 dark:text-zinc-400">Создана</dt>
              <dd>
                {formatStaffTaskDate(openTask.createdAt, timeZone)}
                {openTask.createdByUser
                  ? `, ${openTask.createdByUser.fullName ?? openTask.createdByUser.email}`
                  : ""}
              </dd>
            </dl>

            {openTask.description ? (
              <p className="whitespace-pre-line rounded-lg bg-zinc-50 p-3 leading-6 text-zinc-700 [overflow-wrap:anywhere] dark:bg-zinc-900 dark:text-zinc-200">
                {openTask.description}
              </p>
            ) : null}

            <StaffTaskStatusActions
              key={`${openTask.id}:${openTask.updatedAt}`}
              taskId={openTask.id}
              status={openTask.status}
              assignedToUser={openTask.assignedToUser}
              candidateUserIds={staffTaskCandidateUserIds(openTask.labels)}
              currentUser={currentUser}
            />

            <StaffTaskHistory
              key={`history:${openTask.id}`}
              task={openTask}
              currentUser={currentUser}
              defaultOpen
            />
          </div>
        ) : null}
      </SidePanel>
    </>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Board } from "@/components/board";
import { SidePanel } from "@/components/side-panel";
import { moveToColumn, type BoardColumn } from "@/lib/board";
import type {
  GuestCrmTask,
  GuestCrmTaskStatus,
  GuestCrmUser,
} from "@/lib/guests";

type Props = {
  tasks: GuestCrmTask[];
  users: GuestCrmUser[];
  canManage: boolean;
};

const columns: BoardColumn<GuestCrmTaskStatus>[] = [
  { key: "OPEN", label: "Новые", tone: "neutral" },
  { key: "IN_PROGRESS", label: "В работе", tone: "progress" },
  { key: "DONE", label: "Готово", tone: "success" },
  { key: "CANCELED", label: "Отменены", tone: "muted" },
];

const statusLabel: Record<GuestCrmTaskStatus, string> = {
  OPEN: "Новая",
  IN_PROGRESS: "В работе",
  DONE: "Готово",
  CANCELED: "Отменена",
};

function formatDue(value: string | null) {
  if (!value) return null;

  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function isOverdue(task: GuestCrmTask, now: number) {
  return (
    task.dueAt !== null &&
    (task.status === "OPEN" || task.status === "IN_PROGRESS") &&
    new Date(task.dueAt).getTime() < now
  );
}

function target(task: GuestCrmTask) {
  if (task.audience) return { kind: "Группа", name: task.audience.name };
  if (task.lead) return { kind: "CRM-гость", name: task.lead.displayName };
  if (task.guest) return { kind: "Гость", name: task.guest.displayName };
  return { kind: "Цель", name: "не указана" };
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

export function CrmTaskBoard({ tasks, users, canManage }: Props) {
  const router = useRouter();
  // Saved versions of tasks changed here; the server list catches up on refresh.
  const [saved, setSaved] = useState<ReadonlyMap<string, GuestCrmTask>>(
    () => new Map(),
  );
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  const shown = useMemo(
    () => tasks.map((task) => saved.get(task.id) ?? task),
    [tasks, saved],
  );
  const openTask = shown.find((task) => task.id === openId) ?? null;

  async function update(
    task: GuestCrmTask,
    patch: { status?: GuestCrmTaskStatus; assignedToUserId?: string | null },
  ) {
    const optimistic =
      patch.status !== undefined
        ? moveToColumn(
            [task],
            task.id,
            patch.status,
            (item) => item.id,
            (item) => item.status,
            (item, status) => ({ ...item, status }),
          )[0]
        : task;

    setError(null);
    setSaved((current) => new Map(current).set(task.id, optimistic));
    setPending((current) => new Set(current).add(task.id));

    try {
      const response = await fetch(
        `/api/guests/crm/tasks/${encodeURIComponent(task.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        },
      );

      if (!response.ok) throw new Error(await readError(response));

      const next = (await response.json()) as GuestCrmTask;
      setSaved((current) => new Map(current).set(task.id, next));
      router.refresh();
    } catch (caught) {
      setSaved((current) => new Map(current).set(task.id, task));
      setError(
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

  const openPending = openTask ? pending.has(openTask.id) : false;
  const openTarget = openTask ? target(openTask) : null;

  return (
    <>
      {error ? (
        <p
          role="alert"
          className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200"
        >
          {error}
        </p>
      ) : null}
      {canManage ? (
        <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">
          Перетащите карточку в другую колонку или откройте её, чтобы сменить
          статус и ответственного.
        </p>
      ) : null}

      <Board
        ariaLabel="Задачи CRM по статусам"
        columns={columns}
        items={shown}
        idOf={(task) => task.id}
        columnOf={(task) => task.status}
        onOpen={(task) => setOpenId(task.id)}
        onMove={
          canManage
            ? (task, status) => void update(task, { status })
            : undefined
        }
        pendingIds={pending}
        emptyText={(column) =>
          column.key === "OPEN" ? "Новых задач нет" : "Здесь пока пусто"
        }
        renderCard={(task) => {
          const due = formatDue(task.dueAt);
          const overdue = isOverdue(task, now);
          const { kind, name } = target(task);

          return (
            <>
              <span className="block font-semibold leading-5 text-zinc-950 [overflow-wrap:anywhere] dark:text-white">
                {task.title}
              </span>
              <span className="mt-1 block text-zinc-600 [overflow-wrap:anywhere] dark:text-zinc-300">
                {kind}: {name}
              </span>
              <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                <span>
                  {task.assignedToUser?.displayName ?? "без ответственного"}
                </span>
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
        eyebrow="Задача CRM"
        title={openTask?.title ?? ""}
        footer={
          <button
            type="button"
            onClick={() => setOpenId(null)}
            className="cursor-pointer rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            Закрыть
          </button>
        }
      >
        {openTask && openTarget ? (
          <div className="space-y-5 text-sm">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
              <dt className="text-zinc-500 dark:text-zinc-400">
                {openTarget.kind}
              </dt>
              <dd className="min-w-0 font-medium [overflow-wrap:anywhere]">
                {openTask.guest ? (
                  <Link
                    href={`/guests/${encodeURIComponent(openTask.guest.id)}`}
                    className="text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-300"
                  >
                    {openTarget.name}
                  </Link>
                ) : (
                  openTarget.name
                )}
              </dd>
              <dt className="text-zinc-500 dark:text-zinc-400">Срок</dt>
              <dd>
                {formatDue(openTask.dueAt) ?? "без срока"}
                {isOverdue(openTask, now) ? (
                  <span className="ml-2 font-semibold text-red-700 dark:text-red-300">
                    просрочена
                  </span>
                ) : null}
              </dd>
              <dt className="text-zinc-500 dark:text-zinc-400">Создана</dt>
              <dd>{formatDue(openTask.createdAt)}</dd>
            </dl>

            {openTask.description ? (
              <p className="whitespace-pre-line rounded-lg bg-zinc-50 p-3 leading-6 text-zinc-700 [overflow-wrap:anywhere] dark:bg-zinc-900 dark:text-zinc-200">
                {openTask.description}
              </p>
            ) : null}

            <fieldset
              disabled={!canManage || openPending}
              className="space-y-2"
            >
              <legend className="font-semibold text-zinc-800 dark:text-zinc-100">
                Статус
              </legend>
              <div className="grid grid-cols-2 gap-2">
                {columns.map((column) => {
                  const active = openTask.status === column.key;

                  return (
                    <button
                      key={column.key}
                      type="button"
                      aria-pressed={active}
                      onClick={() =>
                        active
                          ? undefined
                          : void update(openTask, { status: column.key })
                      }
                      className={`cursor-pointer rounded-lg border px-3 py-2 text-left font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-60 ${
                        active
                          ? "border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200"
                          : "border-zinc-300 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
                      }`}
                    >
                      {statusLabel[column.key]}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div className="space-y-1.5">
              <label
                htmlFor="crm-task-assignee"
                className="font-semibold text-zinc-800 dark:text-zinc-100"
              >
                Ответственный
              </label>
              <select
                id="crm-task-assignee"
                value={openTask.assignedToUser?.id ?? ""}
                disabled={!canManage || openPending}
                onChange={(event) =>
                  void update(openTask, {
                    assignedToUserId: event.target.value || null,
                  })
                }
                className="w-full cursor-pointer rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm outline-none focus-visible:border-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500/40 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900"
              >
                <option value="">Не назначен</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.displayName}
                  </option>
                ))}
              </select>
            </div>

            {openPending ? (
              <p
                aria-live="polite"
                className="text-zinc-500 dark:text-zinc-400"
              >
                Сохраняем…
              </p>
            ) : null}
            {!canManage ? (
              <p className="text-zinc-500 dark:text-zinc-400">
                Менять задачи может сотрудник с правом «Коммуникации: действия».
              </p>
            ) : null}
          </div>
        ) : null}
      </SidePanel>
    </>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import type {
  StaffTaskPriority,
  StaffTaskStore,
  StaffTaskType,
  StaffTaskUser,
  StaffTaskUserRole,
} from "@/lib/staff-tasks";
import { roleLabels } from "@/lib/roles";

const taskTypes: Array<{ value: StaffTaskType; label: string }> = [
  { value: "ONE_TIME", label: "Разовая" },
  { value: "SHIFT", label: "На смену" },
  { value: "RECURRING", label: "Повторяемая" },
  { value: "LONG_TERM", label: "Долгосрочная" },
  { value: "PERSONAL", label: "Личная" },
  { value: "CLUB", label: "Для клуба" },
  { value: "ROLE", label: "Для роли" },
];

const priorities: Array<{ value: StaffTaskPriority; label: string }> = [
  { value: "LOW", label: "Низкий" },
  { value: "NORMAL", label: "Обычный" },
  { value: "HIGH", label: "Высокий" },
  { value: "URGENT", label: "Срочно" },
];

const confirmationCreatorRoles = new Set<StaffTaskUserRole>([
  "CLUB_ADMINISTRATOR",
  "TRAINEE",
]);
const staffAssigneeRoles = new Set<StaffTaskUserRole>([
  "CLUB_ADMINISTRATOR",
  "TRAINEE",
]);
const confirmationRoles = new Set<StaffTaskUserRole>([
  "SENIOR_ADMINISTRATOR",
  "CLUB_MANAGER",
  "STANDARDS_MANAGER",
]);

type StaffTaskCreateFormProps = {
  users: StaffTaskUser[];
  stores: StaffTaskStore[];
  currentUser: Pick<StaffTaskUser, "id" | "role">;
};

export function StaffTaskCreateForm({
  users,
  stores,
  currentUser,
}: StaffTaskCreateFormProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needsConfirmation = confirmationCreatorRoles.has(currentUser.role);
  const needsStaffAssignee =
    needsConfirmation || currentUser.role === "SENIOR_ADMINISTRATOR";
  const assigneeUsers = useMemo(
    () =>
      needsStaffAssignee
        ? users.filter(
            (user) =>
              staffAssigneeRoles.has(user.role) &&
              (!needsConfirmation || user.id !== currentUser.id),
          )
        : users,
    [currentUser.id, needsConfirmation, needsStaffAssignee, users],
  );
  const observerUsers = useMemo(
    () =>
      needsConfirmation
        ? users.filter((user) => confirmationRoles.has(user.role))
        : users,
    [needsConfirmation, users],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") ?? "").trim();

    if (!title) {
      setError("Укажите название задачи.");
      return;
    }

    const dueAt = String(form.get("dueAt") ?? "").trim();
    const assignedToUserId = String(form.get("assignedToUserId") ?? "").trim();
    const observerUserIds = form
      .getAll("observerUserIds")
      .map((value) => String(value).trim())
      .filter(Boolean);

    if (
      needsStaffAssignee &&
      (!assignedToUserId ||
        !assigneeUsers.some((user) => user.id === assignedToUserId))
    ) {
      setError("Выберите ответственного администратора или стажера.");
      return;
    }

    if (needsConfirmation) {
      const hasOnlyAllowedConfirmationUsers = observerUserIds.every((id) =>
        observerUsers.some((user) => user.id === id),
      );

      if (observerUserIds.length === 0) {
        setError(
          "Выберите подтверждающего: старшего администратора, управляющего клубом или менеджера по стандартам.",
        );
        return;
      }

      if (!hasOnlyAllowedConfirmationUsers) {
        setError(
          "Подтверждающими могут быть только старший администратор, управляющий клубом или менеджер по стандартам.",
        );
        return;
      }
    }

    setIsPending(true);
    setError(null);

    const payload = {
      title,
      description: String(form.get("description") ?? "").trim() || null,
      type: form.get("type"),
      priority: form.get("priority"),
      dueAt: dueAt ? new Date(dueAt).toISOString() : null,
      storeId: String(form.get("storeId") ?? "").trim() || null,
      assignedToUserId: assignedToUserId || null,
      observerUserIds,
    };

    try {
      const response = await fetch("/api/staff/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(data?.message ?? "Не удалось создать задачу");
      }

      event.currentTarget.reset();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ошибка запроса");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
            Быстрое создание
          </p>
          <h2 className="mt-1 text-lg font-semibold">Новая задача персоналу</h2>
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex h-10 items-center justify-center rounded-md bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Сохраняем..." : "Создать задачу"}
        </button>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1.4fr_1fr_1fr]">
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-zinc-500">
            Что сделать
          </span>
          <input
            name="title"
            required
            placeholder="Например: проверить кассу вечерней смены"
            className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950"
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-zinc-500">
            Ответственный
          </span>
          <select
            name="assignedToUserId"
            required={needsStaffAssignee}
            className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950"
          >
            <option value="">
              {needsStaffAssignee
                ? "Выберите администратора или стажера"
                : "Не назначен"}
            </option>
            {assigneeUsers.map((user) => (
              <option key={user.id} value={user.id}>
                {user.fullName ?? user.email} ({roleLabels[user.role] ?? user.role})
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-zinc-500">
            Дедлайн
          </span>
          <input
            name="dueAt"
            type="datetime-local"
            className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950"
          />
        </label>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1fr_1fr]">
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-zinc-500">
            Клуб
          </span>
          <select
            name="storeId"
            className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950"
          >
            <option value="">Вся сеть</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-zinc-500">
            Тип
          </span>
          <select
            name="type"
            defaultValue="SHIFT"
            className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950"
          >
            {taskTypes.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-zinc-500">
            Приоритет
          </span>
          <select
            name="priority"
            defaultValue="NORMAL"
            className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950"
          >
            {priorities.map((priority) => (
              <option key={priority.value} value={priority.value}>
                {priority.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {observerUsers.length > 0 || needsConfirmation ? (
        <fieldset className="mt-3 rounded-lg border border-dashed border-zinc-200 p-3 dark:border-zinc-800">
          <legend className="px-1 text-xs font-bold uppercase text-zinc-500">
            {needsConfirmation ? "Подтверждение задачи" : "Наблюдатели"}
          </legend>
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="mt-1 text-xs leading-5 text-zinc-500">
                {needsConfirmation
                  ? "Постановку задачи должен подтвердить старший администратор, управляющий клубом или менеджер по стандартам."
                  : "Получают задачу в свой список наблюдения, но не становятся ответственными."}
              </p>
            </div>
            <span className="text-xs font-semibold text-zinc-500">
              {needsConfirmation
                ? "Обязательно выбрать"
                : "Можно выбрать несколько"}
            </span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {observerUsers.map((user) => (
              <label
                key={user.id}
                className="flex min-h-10 items-center gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm transition hover:border-emerald-300 hover:bg-emerald-50 dark:border-zinc-800 dark:hover:border-emerald-500/70 dark:hover:bg-emerald-500/10"
              >
                <input
                  name="observerUserIds"
                  type="checkbox"
                  value={user.id}
                  className="h-4 w-4 rounded border-zinc-300 text-emerald-500 focus:ring-emerald-500"
                />
                <span className="min-w-0">
                  <span className="block truncate">
                    {user.fullName ?? user.email}
                  </span>
                  <span className="block truncate text-[11px] text-zinc-500">
                    {roleLabels[user.role] ?? user.role}
                  </span>
                </span>
              </label>
            ))}
            {observerUsers.length === 0 ? (
              <p className="rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-500 dark:border-zinc-800">
                Нет доступных подтверждающих с нужной ролью.
              </p>
            ) : null}
          </div>
        </fieldset>
      ) : null}

      <label className="mt-3 block space-y-1">
        <span className="text-xs font-bold uppercase text-zinc-500">
          Комментарий
        </span>
        <textarea
          name="description"
          rows={3}
          placeholder="Что нужно проверить, какой результат приложить, на что обратить внимание."
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950"
        />
      </label>

      {error ? (
        <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </p>
      ) : null}
    </form>
  );
}

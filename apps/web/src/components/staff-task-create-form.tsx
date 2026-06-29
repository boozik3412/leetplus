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

type AssignmentMode = "ANY_OF" | "INDIVIDUAL";

type StaffTaskCreateFormProps = {
  users: StaffTaskUser[];
  stores: StaffTaskStore[];
  currentUser: Pick<StaffTaskUser, "id" | "role" | "stores">;
};

export function StaffTaskCreateForm({
  users,
  stores,
  currentUser,
}: StaffTaskCreateFormProps) {
  const router = useRouter();
  const needsConfirmation = confirmationCreatorRoles.has(currentUser.role);
  const needsStaffAssignee =
    needsConfirmation || currentUser.role === "SENIOR_ADMINISTRATOR";
  const isSeniorAdministrator = currentUser.role === "SENIOR_ADMINISTRATOR";
  const currentUserStoreIds = useMemo(
    () => userStoreIds(currentUser),
    [currentUser],
  );
  const currentUserStoreIdSet = useMemo(
    () => new Set(currentUserStoreIds),
    [currentUserStoreIds],
  );
  const [isExpanded, setIsExpanded] = useState(() => !needsConfirmation);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [assignmentMode, setAssignmentMode] =
    useState<AssignmentMode>("INDIVIDUAL");

  const assigneeUsers = useMemo(
    () =>
      (needsStaffAssignee
        ? users.filter(
            (user) =>
              staffAssigneeRoles.has(user.role) &&
              (!needsConfirmation || user.id !== currentUser.id) &&
              (!isSeniorAdministrator ||
                userStoreIds(user).some((storeId) =>
                  currentUserStoreIdSet.has(storeId),
                )),
          )
        : users
      ).sort((left, right) => userLabel(left).localeCompare(userLabel(right))),
    [
      currentUser.id,
      currentUserStoreIdSet,
      isSeniorAdministrator,
      needsConfirmation,
      needsStaffAssignee,
      users,
    ],
  );
  const observerUsers = useMemo(
    () =>
      (needsConfirmation
        ? users.filter((user) => confirmationRoles.has(user.role))
        : users
      ).sort((left, right) => userLabel(left).localeCompare(userLabel(right))),
    [needsConfirmation, users],
  );
  const activeStores = useMemo(
    () =>
      stores
        .filter((store) => store.isActive)
        .sort((left, right) => left.name.localeCompare(right.name)),
    [stores],
  );
  const visibleStores = useMemo(
    () =>
      isSeniorAdministrator
        ? activeStores.filter((store) => currentUserStoreIdSet.has(store.id))
        : activeStores,
    [activeStores, currentUserStoreIdSet, isSeniorAdministrator],
  );
  const seniorStoreId = useMemo(
    () =>
      activeStores.find((store) => currentUserStoreIdSet.has(store.id))?.id ??
      currentUserStoreIds[0] ??
      "",
    [activeStores, currentUserStoreIdSet, currentUserStoreIds],
  );
  const taskStoreId = isSeniorAdministrator ? seniorStoreId : selectedStoreId;
  const usersWithoutStore = useMemo(
    () =>
      isSeniorAdministrator
        ? []
        : assigneeUsers.filter((user) => userStoreIds(user).length === 0),
    [assigneeUsers, isSeniorAdministrator],
  );
  const selectedCount = selectedAssigneeIds.size;
  const allAssigneesSelected =
    assigneeUsers.length > 0 &&
    assigneeUsers.every((user) => selectedAssigneeIds.has(user.id));

  function setMany(ids: string[], checked: boolean) {
    setSelectedAssigneeIds((current) => {
      const next = new Set(current);
      ids.forEach((id) => {
        if (checked) {
          next.add(id);
        } else {
          next.delete(id);
        }
      });
      return next;
    });
  }

  function toggleStore(store: StaffTaskStore, checked: boolean) {
    const ids = assigneeUsers
      .filter((user) => userStoreIds(user).includes(store.id))
      .map((user) => user.id);

    setMany(ids, checked);

    if (checked && !isSeniorAdministrator && !selectedStoreId) {
      setSelectedStoreId(store.id);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") ?? "").trim();
    const assigneeIds = Array.from(selectedAssigneeIds);

    if (!title) {
      setError("Укажите название задачи.");
      return;
    }

    if (needsStaffAssignee && assigneeIds.length === 0) {
      setError("Выберите хотя бы одного администратора или стажера.");
      return;
    }

    if (
      needsStaffAssignee &&
      !assigneeIds.every((id) => assigneeUsers.some((user) => user.id === id))
    ) {
      setError("Среди ответственных есть сотрудник, которому нельзя назначить задачу.");
      return;
    }

    const observerUserIds = form
      .getAll("observerUserIds")
      .map((value) => String(value).trim())
      .filter(Boolean);

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

    if (isSeniorAdministrator && !seniorStoreId) {
      setError("У старшего администратора не указан клуб. Назначить задачу можно только внутри своего клуба.");
      return;
    }

    const dueAt = String(form.get("dueAt") ?? "").trim();
    setIsPending(true);
    setError(null);

    const payload = {
      title,
      description: String(form.get("description") ?? "").trim() || null,
      type: form.get("type"),
      priority: form.get("priority"),
      dueAt: dueAt ? new Date(dueAt).toISOString() : null,
      storeId: taskStoreId || null,
      assignedToUserId:
        assigneeIds.length === 1 && assignmentMode !== "ANY_OF"
          ? assigneeIds[0]
          : null,
      assignedToUserIds: assigneeIds,
      assignmentMode: assigneeIds.length > 0 ? assignmentMode : "SINGLE",
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
      setSelectedAssigneeIds(new Set());
      setSelectedStoreId(isSeniorAdministrator ? seniorStoreId : "");
      setAssignmentMode("INDIVIDUAL");
      setIsExpanded(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ошибка запроса");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
            Быстрое создание
          </p>
          <h2 className="mt-1 text-lg font-semibold">Новая задача персоналу</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Можно выбрать весь клуб, группу сотрудников или точечных ответственных.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          {isExpanded ? (
            <button
              type="button"
              onClick={() => setIsExpanded(false)}
              className="inline-flex h-10 items-center justify-center rounded-md border border-zinc-200 px-4 text-sm font-semibold text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-200 dark:hover:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Свернуть
            </button>
          ) : null}
          {isExpanded ? (
            <button
              type="submit"
              form="staff-task-create-form"
              disabled={isPending}
              className="inline-flex h-10 items-center justify-center rounded-md bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? "Сохраняем..." : "Создать задачу"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIsExpanded(true)}
              className="inline-flex h-10 items-center justify-center rounded-md bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400"
            >
              Создать задачу
            </button>
          )}
        </div>
      </div>

      <form
        id="staff-task-create-form"
        onSubmit={submit}
        hidden={!isExpanded}
        noValidate
      >
        <div
          className={`mt-4 grid gap-3 ${
            isSeniorAdministrator
              ? "lg:grid-cols-[1.4fr_1fr]"
              : "lg:grid-cols-[1.4fr_1fr_1fr]"
          }`}
        >
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

          {!isSeniorAdministrator ? (
            <label className="space-y-1">
              <span className="text-xs font-bold uppercase text-zinc-500">
                Клуб задачи
              </span>
              <select
                name="storeId"
                value={selectedStoreId}
                onChange={(event) => setSelectedStoreId(event.target.value)}
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
          ) : null}

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

        <fieldset className="mt-3 rounded-lg border border-dashed border-zinc-200 p-3 dark:border-zinc-800">
          <legend className="px-1 text-xs font-bold uppercase text-zinc-500">
            Ответственные
          </legend>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm font-semibold">
                Выбрано: {selectedCount}
              </p>
              <p className="mt-1 text-xs leading-5 text-zinc-500">
                Отметьте клуб целиком или отдельных сотрудников. Для администраторов доступны только администраторы и стажеры.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className={assignmentModeClass(assignmentMode === "ANY_OF")}>
                <input
                  type="radio"
                  name="assignmentMode"
                  value="ANY_OF"
                  checked={assignmentMode === "ANY_OF"}
                  onChange={() => setAssignmentMode("ANY_OF")}
                  className="sr-only"
                />
                <span>Одна общая</span>
                <span className="text-[11px] font-normal text-zinc-500">
                  Выполнит любой из выбранных
                </span>
              </label>
              <label
                className={assignmentModeClass(assignmentMode === "INDIVIDUAL")}
              >
                <input
                  type="radio"
                  name="assignmentMode"
                  value="INDIVIDUAL"
                  checked={assignmentMode === "INDIVIDUAL"}
                  onChange={() => setAssignmentMode("INDIVIDUAL")}
                  className="sr-only"
                />
                <span>Каждому отдельно</span>
                <span className="text-[11px] font-normal text-zinc-500">
                  Будет создана задача на каждого
                </span>
              </label>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <CheckPill
              label={isSeniorAdministrator ? "Весь персонал клуба" : "Весь персонал"}
              count={assigneeUsers.length}
              checked={allAssigneesSelected}
              disabled={assigneeUsers.length === 0}
              onChange={(checked) =>
                setMany(
                  assigneeUsers.map((user) => user.id),
                  checked,
                )
              }
            />
            {visibleStores.map((store) => {
              const storeUsers = assigneeUsers.filter((user) =>
                userStoreIds(user).includes(store.id),
              );
              const checked =
                storeUsers.length > 0 &&
                storeUsers.every((user) => selectedAssigneeIds.has(user.id));

              return (
                <CheckPill
                  key={store.id}
                  label={store.name}
                  count={storeUsers.length}
                  checked={checked}
                  disabled={storeUsers.length === 0}
                  onChange={(nextChecked) => toggleStore(store, nextChecked)}
                />
              );
            })}
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {visibleStores.map((store) => {
              const storeUsers = assigneeUsers.filter((user) =>
                userStoreIds(user).includes(store.id),
              );

              if (storeUsers.length === 0) {
                return null;
              }

              return (
                <AssigneeGroup
                  key={store.id}
                  title={store.name}
                  users={storeUsers}
                  selectedAssigneeIds={selectedAssigneeIds}
                  onToggle={(id, checked) => setMany([id], checked)}
                />
              );
            })}
            {usersWithoutStore.length > 0 ? (
              <AssigneeGroup
                title="Вся сеть / без клуба"
                users={usersWithoutStore}
                selectedAssigneeIds={selectedAssigneeIds}
                onToggle={(id, checked) => setMany([id], checked)}
              />
            ) : null}
            {assigneeUsers.length === 0 ? (
              <p className="rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-500 dark:border-zinc-800">
                Нет доступных сотрудников для назначения.
              </p>
            ) : null}
          </div>
        </fieldset>

        <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1fr]">
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
              <p className="mt-1 text-xs leading-5 text-zinc-500">
                {needsConfirmation
                  ? "Постановку задачи должен подтвердить старший администратор, управляющий клубом или менеджер по стандартам."
                  : "Получают задачу в список наблюдения, но не становятся ответственными."}
              </p>
              <span className="text-xs font-semibold text-zinc-500">
                {needsConfirmation
                  ? "Обязательно выбрать"
                  : "Можно выбрать несколько"}
              </span>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {observerUsers.map((user) => (
                <UserCheckbox
                  key={user.id}
                  user={user}
                  name="observerUserIds"
                  checked={undefined}
                />
              ))}
              {observerUsers.length === 0 ? (
                <p className="rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-500 dark:border-zinc-800">
                  Нет доступных подтверждающих с нужной ролью.
                </p>
              ) : null}
            </div>
          </fieldset>
        ) : null}

        {error ? (
          <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
            {error}
          </p>
        ) : null}
      </form>
    </section>
  );
}

function AssigneeGroup({
  title,
  users,
  selectedAssigneeIds,
  onToggle,
}: {
  title: string;
  users: StaffTaskUser[];
  selectedAssigneeIds: Set<string>;
  onToggle: (id: string, checked: boolean) => void;
}) {
  return (
    <div className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">{title}</p>
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
          {users.length}
        </span>
      </div>
      <div className="mt-2 grid gap-2">
        {users.map((user) => (
          <UserCheckbox
            key={user.id}
            user={user}
            name="assigneeUserIds"
            checked={selectedAssigneeIds.has(user.id)}
            onChange={(checked) => onToggle(user.id, checked)}
          />
        ))}
      </div>
    </div>
  );
}

function UserCheckbox({
  user,
  name,
  checked,
  onChange,
}: {
  user: StaffTaskUser;
  name: string;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
}) {
  const controlled = checked !== undefined;

  return (
    <label className="flex min-h-10 items-center gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm transition hover:border-emerald-300 hover:bg-emerald-50 dark:border-zinc-800 dark:hover:border-emerald-500/70 dark:hover:bg-emerald-500/10">
      <input
        name={name}
        type="checkbox"
        value={user.id}
        {...(controlled ? { checked } : {})}
        onChange={(event) => onChange?.(event.target.checked)}
        className="h-4 w-4 rounded border-zinc-300 text-emerald-500 focus:ring-emerald-500"
      />
      <span className="min-w-0">
        <span className="block truncate">{userLabel(user)}</span>
        <span className="block truncate text-[11px] text-zinc-500">
          {roleLabels[user.role] ?? user.role}
        </span>
      </span>
    </label>
  );
}

function CheckPill({
  label,
  count,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  count: number;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={[
        "inline-flex min-h-9 items-center gap-2 rounded-full border px-3 text-xs font-semibold transition",
        checked
          ? "border-emerald-400 bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200"
          : "border-zinc-200 text-zinc-600 hover:border-emerald-300 dark:border-zinc-800 dark:text-zinc-300 dark:hover:border-emerald-500/70",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
      ].join(" ")}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-zinc-300 text-emerald-500 focus:ring-emerald-500"
      />
      <span>{label}</span>
      <span className="rounded-full bg-zinc-950/5 px-1.5 py-0.5 text-[11px] dark:bg-white/10">
        {count}
      </span>
    </label>
  );
}

function assignmentModeClass(active: boolean) {
  return [
    "flex cursor-pointer flex-col rounded-md border px-3 py-2 text-sm font-semibold transition",
    active
      ? "border-emerald-400 bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200"
      : "border-zinc-200 text-zinc-700 hover:border-emerald-300 dark:border-zinc-800 dark:text-zinc-200 dark:hover:border-emerald-500/70",
  ].join(" ");
}

function userLabel(user: StaffTaskUser) {
  return user.fullName ?? user.email;
}

function userStoreIds(user: Pick<StaffTaskUser, "stores">) {
  return user.stores?.map((store) => store.id) ?? [];
}

"use client";

import { Plus } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { MoreFields } from "@/components/more-fields";
import { SidePanel } from "@/components/side-panel";
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
  { value: "LOW", label: "Низкая" },
  { value: "NORMAL", label: "Обычная" },
  { value: "HIGH", label: "Высокая" },
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

/** A task prepared elsewhere (a signal of the network summary). */
export type StaffTaskDraft = {
  title: string;
  description: string;
  storeId: string | null;
  priority: StaffTaskPriority;
  type: StaffTaskType;
};

type StaffTaskCreateFormProps = {
  users: StaffTaskUser[];
  stores: StaffTaskStore[];
  currentUser: Pick<StaffTaskUser, "id" | "role" | "stores">;
  draft?: StaffTaskDraft | null;
};

/**
 * «+ Задача» and the side panel with the new-task form. Three fields are always
 * visible (что сделать, кто, срок); club, comment, type, priority and
 * observers are folded under «Дополнительно».
 */
export function StaffTaskCreateForm({
  users,
  stores,
  currentUser,
  draft = null,
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
  // A draft from the network summary opens the panel right away.
  const [isOpen, setIsOpen] = useState(() => draft !== null);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedStoreId, setSelectedStoreId] = useState(() =>
    draft?.storeId && stores.some((store) => store.id === draft.storeId)
      ? draft.storeId
      : "",
  );
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
      ).sort((left, right) => userLabel(left).localeCompare(userLabel(right), "ru")),
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
      ).sort((left, right) => userLabel(left).localeCompare(userLabel(right), "ru")),
    [needsConfirmation, users],
  );
  const activeStores = useMemo(
    () =>
      stores
        .filter((store) => store.isActive)
        .sort((left, right) => left.name.localeCompare(right.name, "ru")),
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
  // People of one club are picked → the task belongs to that club, even when
  // «Клуб» under «Дополнительно» was left as «Вся сеть» (the API only lets a
  // network-wide task go to people without a club).
  const inferredStore = useMemo(() => {
    const picked = assigneeUsers.filter((user) =>
      selectedAssigneeIds.has(user.id),
    );
    let common: string[] | null = null;

    for (const user of picked) {
      const ids = userStoreIds(user);
      if (ids.length === 0) continue;
      common = common === null ? ids : common.filter((id) => ids.includes(id));
    }

    if (common === null) return { id: "", conflict: false };

    const store = activeStores.find((item) => common.includes(item.id));
    return { id: store?.id ?? "", conflict: !store };
  }, [activeStores, assigneeUsers, selectedAssigneeIds]);
  const taskStoreId = isSeniorAdministrator
    ? seniorStoreId
    : selectedStoreId || inferredStore.id;
  const taskStoreName = stores.find((store) => store.id === taskStoreId)?.name;
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
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
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

    if (!isSeniorAdministrator && !selectedStoreId && inferredStore.conflict) {
      setError(
        "Выбраны сотрудники разных клубов. Поставьте задачу отдельно для каждого клуба или выберите клуб в «Дополнительно».",
      );
      return;
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

      formElement.reset();
      setSelectedAssigneeIds(new Set());
      setSelectedStoreId(isSeniorAdministrator ? seniorStoreId : "");
      setAssignmentMode("INDIVIDUAL");
      setIsOpen(false);
      // The draft lives in the URL: drop it so the form does not reopen with it.
      if (draft) router.replace("/staff/tasks");
      else router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ошибка запроса");
    } finally {
      setIsPending(false);
    }
  }

  const inputClass =
    "h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950";
  const labelClass = "text-sm font-semibold text-zinc-800 dark:text-zinc-100";

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-md bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
      >
        <Plus size={16} weight="bold" aria-hidden />
        Задача
      </button>

      <SidePanel
        open={isOpen}
        onClose={() => setIsOpen(false)}
        eyebrow={draft ? "По сигналу сводки сети" : "Задачи персонала"}
        title="Новая задача"
        footer={
          <>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="cursor-pointer rounded-md border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              Отмена
            </button>
            <button
              type="submit"
              form="staff-task-create-form"
              disabled={isPending}
              className="cursor-pointer rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? "Сохраняем…" : "Создать задачу"}
            </button>
          </>
        }
      >
        <form
          id="staff-task-create-form"
          onSubmit={submit}
          noValidate
          className="space-y-5"
        >
          <label className="block space-y-1.5">
            <span className={labelClass}>Что сделать</span>
            <input
              name="title"
              required
              defaultValue={draft?.title}
              placeholder="Например: проверить кассу вечерней смены"
              className={inputClass}
            />
          </label>

          <fieldset className="space-y-2">
            <legend className={labelClass}>Кто</legend>
            <p className="text-xs leading-5 text-zinc-500">
              {needsStaffAssignee
                ? "Отметьте клуб целиком или отдельных администраторов и стажёров."
                : "Отметьте клуб целиком или отдельных сотрудников. Можно оставить пустым."}
            </p>
            <div className="flex flex-wrap gap-2">
              <CheckPill
                label={
                  isSeniorAdministrator ? "Весь персонал клуба" : "Весь персонал"
                }
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

            <div className="max-h-64 space-y-3 overflow-y-auto rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
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
                  title="Без клуба"
                  users={usersWithoutStore}
                  selectedAssigneeIds={selectedAssigneeIds}
                  onToggle={(id, checked) => setMany([id], checked)}
                />
              ) : null}
              {assigneeUsers.length === 0 ? (
                <p className="px-1 py-2 text-sm text-zinc-500">
                  Нет сотрудников, которым можно поставить задачу.
                </p>
              ) : null}
            </div>
            <p className="text-xs font-semibold text-zinc-500" aria-live="polite">
              Выбрано: {selectedCount}
              {selectedCount > 0 && !isSeniorAdministrator
                ? ` · ${taskStoreName ?? "вся сеть"}`
                : ""}
            </p>

            {selectedCount > 1 ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <label
                  className={assignmentModeClass(
                    assignmentMode === "INDIVIDUAL",
                  )}
                >
                  <input
                    type="radio"
                    name="assignmentMode"
                    value="INDIVIDUAL"
                    checked={assignmentMode === "INDIVIDUAL"}
                    onChange={() => setAssignmentMode("INDIVIDUAL")}
                    className="sr-only"
                  />
                  <span>Каждому своя</span>
                  <span className="text-[11px] font-normal text-zinc-500">
                    Задача появится у каждого
                  </span>
                </label>
                <label
                  className={assignmentModeClass(assignmentMode === "ANY_OF")}
                >
                  <input
                    type="radio"
                    name="assignmentMode"
                    value="ANY_OF"
                    checked={assignmentMode === "ANY_OF"}
                    onChange={() => setAssignmentMode("ANY_OF")}
                    className="sr-only"
                  />
                  <span>Одна на всех</span>
                  <span className="text-[11px] font-normal text-zinc-500">
                    Сделает любой из выбранных
                  </span>
                </label>
              </div>
            ) : null}
          </fieldset>

          <label className="block space-y-1.5">
            <span className={labelClass}>Срок</span>
            <input name="dueAt" type="datetime-local" className={inputClass} />
          </label>

          {needsConfirmation ? (
            <fieldset className="space-y-2">
              <legend className={labelClass}>Кто подтвердит</legend>
              <p className="text-xs leading-5 text-zinc-500">
                Старший администратор, управляющий клубом или менеджер по
                стандартам.
              </p>
              <ObserverList users={observerUsers} />
            </fieldset>
          ) : null}

          <MoreFields defaultOpen={Boolean(draft?.description)}>
            {!isSeniorAdministrator ? (
              <label className="block space-y-1.5">
                <span className={labelClass}>Клуб</span>
                <select
                  name="storeId"
                  value={selectedStoreId}
                  onChange={(event) => setSelectedStoreId(event.target.value)}
                  className={inputClass}
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

            <label className="block space-y-1.5">
              <span className={labelClass}>Комментарий</span>
              <textarea
                name="description"
                rows={draft ? 4 : 3}
                defaultValue={draft?.description}
                placeholder="Что проверить, что приложить в ответ."
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1.5">
                <span className={labelClass}>Тип</span>
                <select
                  name="type"
                  defaultValue={draft?.type ?? "SHIFT"}
                  className={inputClass}
                >
                  {taskTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-1.5">
                <span className={labelClass}>Важность</span>
                <select
                  name="priority"
                  defaultValue={draft?.priority ?? "NORMAL"}
                  className={inputClass}
                >
                  {priorities.map((priority) => (
                    <option key={priority.value} value={priority.value}>
                      {priority.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {!needsConfirmation && observerUsers.length > 0 ? (
              <fieldset className="space-y-2">
                <legend className={labelClass}>Наблюдатели</legend>
                <p className="text-xs leading-5 text-zinc-500">
                  Видят задачу у себя, но не отвечают за неё.
                </p>
                <ObserverList users={observerUsers} />
              </fieldset>
            ) : null}
          </MoreFields>

          {error ? (
            <p
              role="alert"
              className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200"
            >
              {error}
            </p>
          ) : null}
        </form>
      </SidePanel>
    </>
  );
}

function ObserverList({ users }: { users: StaffTaskUser[] }) {
  if (users.length === 0) {
    return (
      <p className="rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-500 dark:border-zinc-800">
        Нет сотрудников с нужной ролью.
      </p>
    );
  }

  return (
    <div className="grid max-h-48 gap-2 overflow-y-auto">
      {users.map((user) => (
        <UserCheckbox
          key={user.id}
          user={user}
          name="observerUserIds"
          checked={undefined}
        />
      ))}
    </div>
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
    <div>
      <p className="px-1 text-xs font-semibold text-zinc-500">
        {title} · {users.length}
      </p>
      <div className="mt-1.5 grid gap-1.5">
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

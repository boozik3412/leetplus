"use client";

import { useMemo, useState } from "react";
import type { AuthUser } from "@/lib/auth";
import type { Capability } from "@/lib/permissions";
import {
  getAssignableRoles,
  getRoleLabel,
  roleDescriptions,
  type UserRole,
} from "@/lib/roles";
import type {
  UserAccount,
  UserAccessRole,
  UserAccountsResponse,
  UserAccountStore,
} from "@/lib/users";

type FormState = {
  email: string;
  fullName: string;
  role: UserRole;
  customRoleId: string | null;
  isActive: boolean;
  password: string;
  scope: "NETWORK" | "STORES";
  storeIds: string[];
};

function createEmptyForm(defaultRole: UserRole): FormState {
  return {
    email: "",
    fullName: "",
    role: defaultRole,
    customRoleId: null,
    isActive: true,
    password: "",
    scope: "NETWORK",
    storeIds: [],
  };
}

function formFromAccount(account: UserAccount): FormState {
  return {
    email: account.email,
    fullName: account.fullName ?? "",
    role: account.role,
    customRoleId: account.customRoleId,
    isActive: account.isActive,
    password: "",
    scope: account.scope,
    storeIds: account.stores.map((store) => store.id),
  };
}

type AccessRoleFormState = {
  name: string;
  description: string;
  permissions: Capability[];
};

function createEmptyRoleForm(): AccessRoleFormState {
  return {
    name: "",
    description: "",
    permissions: ["view_dashboard"],
  };
}

function roleFormFromCustomRole(role: UserAccessRole): AccessRoleFormState {
  return {
    name: role.name,
    description: role.description ?? "",
    permissions: role.permissions,
  };
}

function accountRoleLabel(account: UserAccount) {
  return account.customRole?.name ?? getRoleLabel(account.role);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function scopeLabel(account: Pick<UserAccount, "scope" | "stores">) {
  if (account.scope === "NETWORK" || account.stores.length === 0) {
    return "Вся сеть";
  }

  return account.stores.map((store) => store.name).join(", ");
}

async function readResponseError(response: Response) {
  try {
    const data = (await response.json()) as { message?: string | string[] };
    if (Array.isArray(data.message)) {
      return data.message.join(", ");
    }

    return data.message ?? "Не удалось сохранить учетную запись";
  } catch {
    return "Не удалось сохранить учетную запись";
  }
}

export function UserAccountsPanel({
  currentUser,
  initialData,
}: {
  currentUser: AuthUser;
  initialData: UserAccountsResponse;
}) {
  const assignableRoles = getAssignableRoles(currentUser.role);
  const defaultRole = assignableRoles.includes("CLUB_ADMINISTRATOR")
    ? "CLUB_ADMINISTRATOR"
    : assignableRoles[0] ?? currentUser.role;
  const [users, setUsers] = useState(initialData.users);
  const [customRoles, setCustomRoles] = useState(initialData.customRoles);
  const [form, setForm] = useState<FormState>(() => createEmptyForm(defaultRole));
  const [roleForm, setRoleForm] = useState<AccessRoleFormState>(
    createEmptyRoleForm,
  );
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<{
    type: "idle" | "success" | "error";
    message: string;
  }>({ type: "idle", message: "" });
  const [roleStatus, setRoleStatus] = useState<{
    type: "idle" | "success" | "error";
    message: string;
  }>({ type: "idle", message: "" });
  const [isSaving, setIsSaving] = useState(false);
  const [isRoleSaving, setIsRoleSaving] = useState(false);

  const selectedUser = selectedId
    ? users.find((account) => account.id === selectedId) ?? null
    : null;
  const roleOptions = initialData.roleOptions.filter((option) =>
    assignableRoles.includes(option.role),
  );
  const selectedRoleOption = initialData.roleOptions.find(
    (option) => option.role === form.role,
  );
  const selectedCustomRole = form.customRoleId
    ? customRoles.find((role) => role.id === form.customRoleId) ?? null
    : null;
  const roleAssignmentValue = form.customRoleId
    ? `custom:${form.customRoleId}`
    : `system:${form.role}`;

  if (
    selectedRoleOption &&
    !roleOptions.some((option) => option.role === selectedRoleOption.role)
  ) {
    roleOptions.unshift(selectedRoleOption);
  }

  const canSaveSelected =
    !selectedUser ||
    currentUser.role === "OWNER" ||
    (selectedUser.role !== "OWNER" && selectedUser.role !== "ADMIN");
  const filteredUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return users;
    }

    return users.filter((account) => {
      const haystack = [
        account.email,
        account.fullName,
        accountRoleLabel(account),
        scopeLabel(account),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [query, users]);

  function startCreate() {
    setSelectedId(null);
    setForm(createEmptyForm(defaultRole));
    setStatus({ type: "idle", message: "" });
  }

  function startEdit(account: UserAccount) {
    setSelectedId(account.id);
    setForm(formFromAccount(account));
    setStatus({ type: "idle", message: "" });
  }

  function updateStoreSelection(storeId: string, checked: boolean) {
    setForm((current) => ({
      ...current,
      storeIds: checked
        ? [...current.storeIds, storeId]
        : current.storeIds.filter((id) => id !== storeId),
    }));
  }

  function updateRoleAssignment(value: string) {
    if (value.startsWith("custom:")) {
      const customRoleId = value.replace("custom:", "");
      setForm((current) => ({
        ...current,
        role: "CLUB_ADMINISTRATOR",
        customRoleId,
      }));
      return;
    }

    setForm((current) => ({
      ...current,
      role: value.replace("system:", "") as UserRole,
      customRoleId: null,
    }));
  }

  function startCreateRole() {
    setSelectedRoleId(null);
    setRoleForm(createEmptyRoleForm());
    setRoleStatus({ type: "idle", message: "" });
  }

  function startEditRole(role: UserAccessRole) {
    setSelectedRoleId(role.id);
    setRoleForm(roleFormFromCustomRole(role));
    setRoleStatus({ type: "idle", message: "" });
  }

  function updateRolePermission(permission: Capability, checked: boolean) {
    setRoleForm((current) => ({
      ...current,
      permissions: checked
        ? Array.from(new Set([...current.permissions, permission]))
        : current.permissions.filter((item) => item !== permission),
    }));
  }

  async function saveAccessRole(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsRoleSaving(true);
    setRoleStatus({ type: "idle", message: "" });

    const endpoint = selectedRoleId
      ? `/api/users/roles/${selectedRoleId}`
      : "/api/users/roles";
    const response = await fetch(endpoint, {
      method: selectedRoleId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(roleForm),
    });

    if (!response.ok) {
      setRoleStatus({
        type: "error",
        message: await readResponseError(response),
      });
      setIsRoleSaving(false);
      return;
    }

    const saved = (await response.json()) as UserAccessRole;
    setCustomRoles((current) => {
      const exists = current.some((role) => role.id === saved.id);

      if (!exists) {
        return [...current, saved].sort((a, b) =>
          a.name.localeCompare(b.name, "ru"),
        );
      }

      return current
        .map((role) => (role.id === saved.id ? saved : role))
        .sort((a, b) => a.name.localeCompare(b.name, "ru"));
    });
    setUsers((current) =>
      current.map((account) =>
        account.customRoleId === saved.id
          ? {
              ...account,
              customRole: saved,
              permissions: saved.permissions,
            }
          : account,
      ),
    );
    setSelectedRoleId(saved.id);
    setRoleForm(roleFormFromCustomRole(saved));
    setRoleStatus({
      type: "success",
      message: selectedRoleId ? "Роль обновлена" : "Роль создана",
    });
    setIsRoleSaving(false);
  }

  async function saveAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setStatus({ type: "idle", message: "" });

    const payload = {
      email: form.email,
      fullName: form.fullName,
      role: form.role,
      customRoleId: form.customRoleId,
      isActive: form.isActive,
      ...(form.password.trim() ? { password: form.password.trim() } : {}),
      storeIds: form.scope === "STORES" ? form.storeIds : [],
    };
    const endpoint = selectedUser ? `/api/users/${selectedUser.id}` : "/api/users";
    const response = await fetch(endpoint, {
      method: selectedUser ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      setStatus({ type: "error", message: await readResponseError(response) });
      setIsSaving(false);
      return;
    }

    const saved = (await response.json()) as UserAccount;
    setUsers((current) => {
      const exists = current.some((account) => account.id === saved.id);

      if (!exists) {
        return [saved, ...current];
      }

      return current.map((account) =>
        account.id === saved.id ? saved : account,
      );
    });
    setSelectedId(saved.id);
    setForm(formFromAccount(saved));
    setStatus({
      type: "success",
      message: selectedUser
        ? "Учетная запись обновлена"
        : "Учетная запись создана",
    });
    setIsSaving(false);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(28rem,1.05fr)]">
      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
              Команда
            </p>
            <h2 className="mt-1 text-xl font-semibold">Учетные записи</h2>
          </div>
          <button
            type="button"
            onClick={startCreate}
            className="inline-flex h-10 items-center justify-center rounded-md bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
          >
            Новый пользователь
          </button>
        </div>

        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Поиск по имени, email, роли или клубу"
          className="mt-4 h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950"
        />

        <div className="mt-4 space-y-2">
          {filteredUsers.map((account) => (
            <button
              key={account.id}
              type="button"
              onClick={() => startEdit(account)}
              className={[
                "w-full rounded-lg border p-3 text-left transition hover:-translate-y-0.5 hover:border-emerald-500/70 hover:bg-emerald-500/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50",
                selectedId === account.id
                  ? "border-emerald-500 bg-emerald-500/10"
                  : "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/60",
              ].join(" ")}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {account.fullName || account.email}
                  </p>
                  <p className="mt-1 truncate text-xs text-zinc-500">
                    {account.email}
                  </p>
                </div>
                <span
                  className={[
                    "rounded-full px-2.5 py-1 text-xs font-semibold",
                    account.isActive
                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-200"
                      : "bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
                  ].join(" ")}
                >
                  {account.isActive ? "Активен" : "Отключен"}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-500">
                <span className="rounded-full bg-zinc-200/70 px-2 py-1 dark:bg-zinc-800">
                  {accountRoleLabel(account)}
                </span>
                <span className="rounded-full bg-zinc-200/70 px-2 py-1 dark:bg-zinc-800">
                  {scopeLabel(account)}
                </span>
              </div>
            </button>
          ))}

          {filteredUsers.length === 0 ? (
            <div className="rounded-lg border border-dashed border-zinc-300 p-5 text-sm text-zinc-500 dark:border-zinc-800">
              Пользователей по текущему поиску нет.
            </div>
          ) : null}
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div>
          <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
            {selectedUser ? "Редактирование" : "Выдача доступа"}
          </p>
          <h2 className="mt-1 text-xl font-semibold">
            {selectedUser
              ? selectedUser.fullName || selectedUser.email
              : "Новая учетная запись"}
          </h2>
          <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            Роль определяет доступ к разделам LeetPlus. Клубы задают рабочий
            контур сотрудника и будут использоваться для дальнейшего
            ограничения операционных данных.
          </p>
        </div>

        <form onSubmit={saveAccount} className="mt-5 space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs font-bold uppercase text-zinc-500">
                Email
              </span>
              <input
                required
                type="email"
                value={form.email}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    email: event.target.value,
                  }))
                }
                className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>

            <label className="space-y-1">
              <span className="text-xs font-bold uppercase text-zinc-500">
                Имя
              </span>
              <input
                value={form.fullName}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    fullName: event.target.value,
                  }))
                }
                placeholder="ФИО или рабочее имя"
                className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
          </div>

          <label className="block space-y-1">
            <span className="text-xs font-bold uppercase text-zinc-500">
              Роль
            </span>
            <select
              value={roleAssignmentValue}
              disabled={selectedUser?.id === currentUser.id || !canSaveSelected}
              onChange={(event) => updateRoleAssignment(event.target.value)}
              className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950"
            >
              <optgroup label="Системные роли">
                {roleOptions.map((option) => (
                  <option key={option.role} value={`system:${option.role}`}>
                    {option.label}
                  </option>
                ))}
              </optgroup>
              {customRoles.length > 0 ? (
                <optgroup label="Роли клуба">
                  {customRoles.map((role) => (
                    <option key={role.id} value={`custom:${role.id}`}>
                      {role.name}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </select>
            <span className="block text-xs leading-5 text-zinc-500">
              {selectedCustomRole
                ? selectedCustomRole.description ||
                  `${selectedCustomRole.permissions.length} доступов в роли`
                : selectedRoleOption
                  ? roleDescriptions[form.role]
                  : "Выберите системную роль или роль клуба."}
            </span>
          </label>

          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase text-zinc-500">
                  Доступ по клубам
                </p>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  Для сетевых ролей можно оставить доступ ко всей сети.
                </p>
              </div>
              <div className="inline-flex rounded-md border border-zinc-300 bg-white p-1 text-sm dark:border-zinc-700 dark:bg-zinc-950">
                {(["NETWORK", "STORES"] as const).map((scope) => (
                  <button
                    key={scope}
                    type="button"
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        scope,
                      }))
                    }
                    className={[
                      "rounded px-3 py-1.5 font-semibold transition",
                      form.scope === scope
                        ? "bg-zinc-950 text-white dark:bg-emerald-400 dark:text-zinc-950"
                        : "text-zinc-500 hover:text-zinc-950 dark:hover:text-zinc-100",
                    ].join(" ")}
                  >
                    {scope === "NETWORK" ? "Вся сеть" : "Клубы"}
                  </button>
                ))}
              </div>
            </div>

            {form.scope === "STORES" ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {initialData.stores.map((store) => (
                  <StoreCheckbox
                    key={store.id}
                    store={store}
                    checked={form.storeIds.includes(store.id)}
                    onChange={updateStoreSelection}
                  />
                ))}
                {initialData.stores.length === 0 ? (
                  <p className="text-sm text-zinc-500">
                    Клубов пока нет. Сохраните пользователя с доступом ко всей
                    сети или добавьте клубы в настройках ассортимента.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <label className="space-y-1">
              <span className="text-xs font-bold uppercase text-zinc-500">
                {selectedUser ? "Новый пароль" : "Пароль"}
              </span>
              <input
                required={!selectedUser}
                type="password"
                value={form.password}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    password: event.target.value,
                  }))
                }
                placeholder={
                  selectedUser ? "Оставьте пустым, если не менять" : "От 8 символов"
                }
                className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950"
              />
              <span className="block text-xs leading-5 text-zinc-500">
                Пароль передается сотруднику вручную. Автоотправку письма
                подключим отдельным SMTP-слоем.
              </span>
            </label>

            <label className="flex h-11 items-center gap-2 rounded-md border border-zinc-300 px-3 text-sm font-semibold dark:border-zinc-700">
              <input
                type="checkbox"
                checked={form.isActive}
                disabled={selectedUser?.id === currentUser.id || !canSaveSelected}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    isActive: event.target.checked,
                  }))
                }
                className="h-4 w-4 rounded border-zinc-300 text-emerald-500 focus:ring-emerald-500"
              />
              Активен
            </label>
          </div>

          {status.type !== "idle" ? (
            <div
              className={[
                "rounded-md border px-3 py-2 text-sm",
                status.type === "success"
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200"
                  : "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-200",
              ].join(" ")}
            >
              {status.message}
            </div>
          ) : null}

          {!canSaveSelected ? (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-200">
              Только владелец может менять учетные записи владельца и
              системных администраторов.
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={
                isSaving ||
                (roleOptions.length === 0 && customRoles.length === 0) ||
                !canSaveSelected
              }
              className="inline-flex h-11 items-center justify-center rounded-md bg-zinc-950 px-5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-emerald-400 dark:text-zinc-950 dark:hover:bg-emerald-300"
            >
              {isSaving
                ? "Сохраняем..."
                : selectedUser
                ? "Сохранить изменения"
                : "Создать учетную запись"}
            </button>
            {selectedUser ? (
              <button
                type="button"
                onClick={startCreate}
                className="inline-flex h-11 items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
              >
                Создать другую
              </button>
            ) : null}
          </div>

          {selectedUser ? (
            <p className="text-xs text-zinc-500">
              Обновлено {formatDate(selectedUser.updatedAt)}
            </p>
          ) : null}
        </form>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950 lg:col-span-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
              Роли клуба
            </p>
            <h2 className="mt-1 text-xl font-semibold">
              Настройка доступов
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Создайте роль под структуру клуба и отметьте только те разделы,
              которые сотрудник должен видеть или редактировать.
            </p>
          </div>
          <button
            type="button"
            onClick={startCreateRole}
            className="inline-flex h-10 items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            Новая роль
          </button>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(16rem,0.8fr)_minmax(0,1.2fr)]">
          <div className="space-y-2">
            {customRoles.map((role) => (
              <button
                key={role.id}
                type="button"
                onClick={() => startEditRole(role)}
                className={[
                  "w-full rounded-lg border p-3 text-left transition hover:-translate-y-0.5 hover:border-emerald-500/70 hover:bg-emerald-500/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50",
                  selectedRoleId === role.id
                    ? "border-emerald-500 bg-emerald-500/10"
                    : "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/60",
                ].join(" ")}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{role.name}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {role.permissions.length} доступов
                    </p>
                  </div>
                  <span className="rounded-full bg-zinc-200/70 px-2 py-1 text-xs font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                    Роль клуба
                  </span>
                </div>
                {role.description ? (
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-zinc-500">
                    {role.description}
                  </p>
                ) : null}
              </button>
            ))}

            {customRoles.length === 0 ? (
              <div className="rounded-lg border border-dashed border-zinc-300 p-5 text-sm text-zinc-500 dark:border-zinc-800">
                Кастомных ролей пока нет. Создайте первую роль и назначьте ее
                пользователю выше.
              </div>
            ) : null}
          </div>

          <form
            onSubmit={saveAccessRole}
            className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs font-bold uppercase text-zinc-500">
                  Название роли
                </span>
                <input
                  required
                  value={roleForm.name}
                  onChange={(event) =>
                    setRoleForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="Например: Управляющий сменой"
                  className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950"
                />
              </label>

              <label className="space-y-1">
                <span className="text-xs font-bold uppercase text-zinc-500">
                  Описание
                </span>
                <input
                  value={roleForm.description}
                  onChange={(event) =>
                    setRoleForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  placeholder="Коротко: зона ответственности"
                  className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950"
                />
              </label>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {initialData.capabilityOptions.map((capability) => (
                <label
                  key={capability.key}
                  className={[
                    "flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition hover:border-emerald-500/70 hover:bg-emerald-500/5",
                    roleForm.permissions.includes(capability.key)
                      ? "border-emerald-500 bg-emerald-500/10"
                      : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950",
                  ].join(" ")}
                >
                  <input
                    type="checkbox"
                    checked={roleForm.permissions.includes(capability.key)}
                    onChange={(event) =>
                      updateRolePermission(
                        capability.key,
                        event.target.checked,
                      )
                    }
                    className="mt-1 h-4 w-4 rounded border-zinc-300 text-emerald-500 focus:ring-emerald-500"
                  />
                  <span>
                    <span className="block font-semibold">
                      {capability.label}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-zinc-500">
                      {capability.description}
                    </span>
                  </span>
                </label>
              ))}
            </div>

            {roleStatus.type !== "idle" ? (
              <div
                className={[
                  "mt-4 rounded-md border px-3 py-2 text-sm",
                  roleStatus.type === "success"
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200"
                    : "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-200",
                ].join(" ")}
              >
                {roleStatus.message}
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={isRoleSaving}
                className="inline-flex h-11 items-center justify-center rounded-md bg-zinc-950 px-5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-emerald-400 dark:text-zinc-950 dark:hover:bg-emerald-300"
              >
                {isRoleSaving
                  ? "Сохраняем..."
                  : selectedRoleId
                    ? "Сохранить роль"
                    : "Создать роль"}
              </button>
              {selectedRoleId ? (
                <button
                  type="button"
                  onClick={startCreateRole}
                  className="inline-flex h-11 items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
                >
                  Сбросить форму
                </button>
              ) : null}
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}

function StoreCheckbox({
  store,
  checked,
  onChange,
}: {
  store: UserAccountStore;
  checked: boolean;
  onChange: (storeId: string, checked: boolean) => void;
}) {
  return (
    <label
      className={[
        "flex cursor-pointer items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm transition hover:border-emerald-500/70 hover:bg-emerald-500/5",
        checked
          ? "border-emerald-500 bg-emerald-500/10"
          : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950",
      ].join(" ")}
    >
      <span>
        <span className="font-semibold">{store.name}</span>
        {!store.isActive ? (
          <span className="ml-2 text-xs text-zinc-500">неактивен</span>
        ) : null}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(store.id, event.target.checked)}
        className="h-4 w-4 rounded border-zinc-300 text-emerald-500 focus:ring-emerald-500"
      />
    </label>
  );
}

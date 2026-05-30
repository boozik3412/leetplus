"use client";

import { useMemo, useState } from "react";
import type { AuthUser } from "@/lib/auth";
import {
  getAssignableRoles,
  getRoleLabel,
  roleDescriptions,
  type UserRole,
} from "@/lib/roles";
import type {
  UserAccount,
  UserAccountsResponse,
  UserAccountStore,
} from "@/lib/users";

type FormState = {
  email: string;
  fullName: string;
  role: UserRole;
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
    isActive: account.isActive,
    password: "",
    scope: account.scope,
    storeIds: account.stores.map((store) => store.id),
  };
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
  const [form, setForm] = useState<FormState>(() => createEmptyForm(defaultRole));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<{
    type: "idle" | "success" | "error";
    message: string;
  }>({ type: "idle", message: "" });
  const [isSaving, setIsSaving] = useState(false);

  const selectedUser = selectedId
    ? users.find((account) => account.id === selectedId) ?? null
    : null;
  const roleOptions = initialData.roleOptions.filter((option) =>
    assignableRoles.includes(option.role),
  );
  const selectedRoleOption = initialData.roleOptions.find(
    (option) => option.role === form.role,
  );

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
        getRoleLabel(account.role),
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

  async function saveAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setStatus({ type: "idle", message: "" });

    const payload = {
      email: form.email,
      fullName: form.fullName,
      role: form.role,
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
                  {getRoleLabel(account.role)}
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
              value={form.role}
              disabled={selectedUser?.id === currentUser.id || !canSaveSelected}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  role: event.target.value as UserRole,
                }))
              }
              className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950"
            >
              {roleOptions.map((option) => (
                <option key={option.role} value={option.role}>
                  {option.label}
                </option>
              ))}
            </select>
            <span className="block text-xs leading-5 text-zinc-500">
              {roleDescriptions[form.role]}
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
              disabled={isSaving || roleOptions.length === 0 || !canSaveSelected}
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

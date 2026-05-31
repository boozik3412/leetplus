"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  type StaffDirectoryMember,
  type StaffDirectoryReport,
  type StaffMemberEmploymentType,
  type StaffMemberStatus,
} from "@/lib/staff-directory";
import { getRoleLabel, roleOrder, type UserRole } from "@/lib/roles";

const statusLabels: Record<StaffMemberStatus, string> = {
  ACTIVE: "Активен",
  ONBOARDING: "Адаптация",
  SUSPENDED: "Приостановлен",
  DISMISSED: "Уволен",
};

const employmentTypeLabels: Record<StaffMemberEmploymentType, string> = {
  FULL_TIME: "Полная занятость",
  PART_TIME: "Частичная занятость",
  SHIFT: "Сменный график",
  TRAINEE: "Стажер",
  CONTRACTOR: "Подрядчик",
};

type DraftMember = {
  id: string | null;
  displayName: string;
  role: UserRole;
  status: StaffMemberStatus;
  position: string;
  employmentType: StaffMemberEmploymentType | "";
  email: string;
  phone: string;
  hiredAt: string;
  dismissedAt: string;
  storeId: string;
  userId: string;
  externalDomain: string;
  externalUserId: string;
  note: string;
};

function emptyDraft(): DraftMember {
  return {
    id: null,
    displayName: "",
    role: "CLUB_ADMINISTRATOR",
    status: "ACTIVE",
    position: "",
    employmentType: "",
    email: "",
    phone: "",
    hiredAt: "",
    dismissedAt: "",
    storeId: "",
    userId: "",
    externalDomain: "",
    externalUserId: "",
    note: "",
  };
}

function draftFromMember(member: StaffDirectoryMember): DraftMember {
  return {
    id: member.id,
    displayName: member.displayName,
    role: member.role,
    status: member.status,
    position: member.position ?? "",
    employmentType: member.employmentType ?? "",
    email: member.email ?? "",
    phone: member.phone ?? "",
    hiredAt: member.hiredAt ? member.hiredAt.slice(0, 10) : "",
    dismissedAt: member.dismissedAt ? member.dismissedAt.slice(0, 10) : "",
    storeId: member.store?.id ?? "",
    userId: member.user?.id ?? "",
    externalDomain: member.externalDomain ?? "",
    externalUserId: member.externalUserId ?? "",
    note: member.note ?? "",
  };
}

function formatDate(value: string | null) {
  if (!value) {
    return "не указано";
  }

  return new Intl.DateTimeFormat("ru-RU").format(new Date(value));
}

export function StaffDirectoryWorkspace({
  report,
}: {
  report: StaffDirectoryReport;
}) {
  const [members, setMembers] = useState(report.rows);
  const [draft, setDraft] = useState<DraftMember>(() =>
    report.rows[0] ? draftFromMember(report.rows[0]) : emptyDraft(),
  );
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const selectedMember = useMemo(
    () => members.find((member) => member.id === draft.id) ?? null,
    [draft.id, members],
  );
  const unmappedLegacy = report.legacyMappings.filter(
    (mapping) => !mapping.mappedStaffMemberId,
  );

  function updateDraft(patch: Partial<DraftMember>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function applyUserAccount(userId: string) {
    const account = report.users.find((user) => user.id === userId);

    updateDraft({
      userId,
      displayName:
        draft.displayName || account?.fullName || account?.email || "",
      email: draft.email || account?.email || "",
      role: account?.role ?? draft.role,
    });
  }

  async function saveMember() {
    setPending(true);
    setMessage(null);

    try {
      const payload = {
        displayName: draft.displayName,
        role: draft.role,
        status: draft.status,
        position: draft.position || null,
        employmentType: draft.employmentType || null,
        email: draft.email || null,
        phone: draft.phone || null,
        hiredAt: draft.hiredAt || null,
        dismissedAt: draft.dismissedAt || null,
        storeId: draft.storeId || null,
        userId: draft.userId || null,
        externalDomain: draft.externalDomain || null,
        externalUserId: draft.externalUserId || null,
        note: draft.note || null,
      };
      const response = await fetch(
        draft.id
          ? `/api/staff/directory/${encodeURIComponent(draft.id)}`
          : "/api/staff/directory",
        {
          method: draft.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const error = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(error?.message ?? "Не удалось сохранить сотрудника");
      }

      const saved = (await response.json()) as StaffDirectoryMember;
      setMembers((current) => {
        const existing = current.some((member) => member.id === saved.id);

        return existing
          ? current.map((member) => (member.id === saved.id ? saved : member))
          : [saved, ...current];
      });
      setDraft(draftFromMember(saved));
      setMessage("Карточка сотрудника сохранена.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Не удалось сохранить сотрудника",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
              Команда
            </p>
            <h2 className="mt-1 text-xl font-semibold">Карточки сотрудников</h2>
          </div>
          {report.canManageDirectory ? (
            <button
              type="button"
              onClick={() => setDraft(emptyDraft())}
              className="rounded-md bg-emerald-500 px-3 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400"
            >
              Новый сотрудник
            </button>
          ) : null}
        </div>

        {members.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-zinc-300 p-6 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
            В справочнике пока нет сотрудников. Создайте первую карточку или
            привяжите существующую учетную запись.
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {members.map((member) => (
              <button
                key={member.id}
                type="button"
                onClick={() => setDraft(draftFromMember(member))}
                className={[
                  "w-full rounded-lg border p-4 text-left transition hover:border-emerald-400 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20",
                  draft.id === member.id
                    ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30"
                    : "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/40",
                ].join(" ")}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{member.displayName}</p>
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                      {getRoleLabel(member.role)} ·{" "}
                      {member.store?.name ?? "вся сеть"}
                    </p>
                  </div>
                  <span className="rounded-full bg-zinc-200 px-2.5 py-1 text-xs font-bold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                    {statusLabels[member.status]}
                  </span>
                </div>
                <div className="mt-3 grid gap-2 text-xs text-zinc-500 sm:grid-cols-3 dark:text-zinc-400">
                  <span>
                    Аккаунт:{" "}
                    {member.user
                      ? member.user.fullName ?? member.user.email
                      : "не привязан"}
                  </span>
                  <span>
                    Langame:{" "}
                    {member.externalUserId
                      ? `${member.externalDomain ?? "домен"} / ${member.externalUserId}`
                      : "не привязан"}
                  </span>
                  <span>Обновлено: {formatDate(member.updatedAt)}</span>
                </div>
              </button>
            ))}
          </div>
        )}

        {unmappedLegacy.length > 0 ? (
          <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/20">
            <p className="text-xs font-bold uppercase text-amber-700 dark:text-amber-300">
              Старые связки staff-control
            </p>
            <p className="mt-2 text-sm text-amber-800 dark:text-amber-200">
              Есть Langame user_id, которые пока живут только в старой
              staff-control привязке. Их можно перенести в новую карточку
              сотрудника.
            </p>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {unmappedLegacy.slice(0, 6).map((mapping) => (
                <button
                  key={mapping.id}
                  type="button"
                  onClick={() =>
                    updateDraft({
                      externalDomain: mapping.externalDomain,
                      externalUserId: mapping.externalUserId,
                      displayName:
                        draft.displayName ||
                        mapping.guestName ||
                        `user_id ${mapping.externalUserId}`,
                    })
                  }
                  className="rounded-md border border-amber-200 bg-white px-3 py-2 text-left text-sm transition hover:border-amber-400 dark:border-amber-900/60 dark:bg-zinc-950"
                >
                  <span className="font-semibold">
                    user_id {mapping.externalUserId}
                  </span>
                  <span className="block text-xs text-zinc-500">
                    {mapping.externalDomain} · {mapping.guestName ?? "без имени"}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <aside className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
          Карточка
        </p>
        <h2 className="mt-1 text-xl font-semibold">
          {selectedMember ? "Редактирование" : "Новый сотрудник"}
        </h2>
        <div className="mt-4 space-y-3">
          <Field label="ФИО или рабочее имя">
            <input
              value={draft.displayName}
              onChange={(event) =>
                updateDraft({ displayName: event.target.value })
              }
              disabled={!report.canManageDirectory}
              className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            />
          </Field>
          <Field label="Учетная запись LeetPlus">
            <select
              value={draft.userId}
              onChange={(event) => applyUserAccount(event.target.value)}
              disabled={!report.canManageDirectory}
              className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            >
              <option value="">Не привязана</option>
              {report.users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.fullName ?? user.email} · {getRoleLabel(user.role)}
                  {user.isActive ? "" : " · неактивен"}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <Field label="Роль">
              <select
                value={draft.role}
                onChange={(event) =>
                  updateDraft({ role: event.target.value as UserRole })
                }
                disabled={!report.canManageDirectory}
                className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                {roleOrder.map((role) => (
                  <option key={role} value={role}>
                    {getRoleLabel(role)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Статус">
              <select
                value={draft.status}
                onChange={(event) =>
                  updateDraft({
                    status: event.target.value as StaffMemberStatus,
                  })
                }
                disabled={!report.canManageDirectory}
                className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                {Object.entries(statusLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Клуб">
            <select
              value={draft.storeId}
              onChange={(event) => updateDraft({ storeId: event.target.value })}
              disabled={!report.canManageDirectory}
              className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            >
              <option value="">Вся сеть</option>
              {report.stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <Field label="Должность">
              <input
                value={draft.position}
                onChange={(event) =>
                  updateDraft({ position: event.target.value })
                }
                disabled={!report.canManageDirectory}
                className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              />
            </Field>
            <Field label="Тип занятости">
              <select
                value={draft.employmentType}
                onChange={(event) =>
                  updateDraft({
                    employmentType: event.target.value as
                      | StaffMemberEmploymentType
                      | "",
                  })
                }
                disabled={!report.canManageDirectory}
                className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                <option value="">Не указано</option>
                {Object.entries(employmentTypeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <Field label="Email">
              <input
                value={draft.email}
                onChange={(event) => updateDraft({ email: event.target.value })}
                disabled={!report.canManageDirectory}
                className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              />
            </Field>
            <Field label="Телефон">
              <input
                value={draft.phone}
                onChange={(event) => updateDraft({ phone: event.target.value })}
                disabled={!report.canManageDirectory}
                className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Принят">
              <input
                type="date"
                value={draft.hiredAt}
                onChange={(event) =>
                  updateDraft({ hiredAt: event.target.value })
                }
                disabled={!report.canManageDirectory}
                className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              />
            </Field>
            <Field label="Уволен">
              <input
                type="date"
                value={draft.dismissedAt}
                onChange={(event) =>
                  updateDraft({ dismissedAt: event.target.value })
                }
                disabled={!report.canManageDirectory}
                className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              />
            </Field>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
            <p className="text-xs font-bold uppercase text-zinc-500">
              Langame
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <Field label="Домен">
                <input
                  value={draft.externalDomain}
                  onChange={(event) =>
                    updateDraft({ externalDomain: event.target.value })
                  }
                  placeholder="46.langamepro.ru"
                  disabled={!report.canManageDirectory}
                  className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                />
              </Field>
              <Field label="working_shifts.user_id">
                <input
                  value={draft.externalUserId}
                  onChange={(event) =>
                    updateDraft({ externalUserId: event.target.value })
                  }
                  disabled={!report.canManageDirectory}
                  className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                />
              </Field>
            </div>
          </div>
          <Field label="Заметка">
            <textarea
              value={draft.note}
              onChange={(event) => updateDraft({ note: event.target.value })}
              disabled={!report.canManageDirectory}
              rows={3}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            />
          </Field>
          {message ? (
            <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-300">
              {message}
            </p>
          ) : null}
          {report.canManageDirectory ? (
            <button
              type="button"
              onClick={saveMember}
              disabled={pending || !draft.displayName.trim()}
              className="w-full rounded-md bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? "Сохраняем..." : "Сохранить сотрудника"}
            </button>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-bold uppercase text-zinc-500">{label}</span>
      {children}
    </label>
  );
}

"use client";

import type {
  GuestGameProfileStatus,
  GuestGameProfile,
} from "@/lib/guest-gamification";
import type { ProfileForm, EventForm, StatusPillTone } from "../shared/types";
import type { GuestDashboardRow, GuestCrmLead } from "@/lib/guests";
import { manualXpEventOption, manualXpPayloadText } from "../shared/helpers";
import {
  Panel,
  Field,
  OptionHelp,
  SectionTitle,
  EmptyState,
  StatusPill,
  MiniMetric,
} from "../shared/ui";
import {
  fieldClass,
  primaryButtonClass,
  smallButtonClass,
  manualXpEventOptions,
} from "../shared/constants";
import Link from "next/link";

export const profileStatusLabels: Record<GuestGameProfileStatus, string> = {
  ACTIVE: "активен",
  PAUSED: "пауза",
  ARCHIVED: "архив",
};

export const profileStatusOptions: GuestGameProfileStatus[] = [
  "ACTIVE",
  "PAUSED",
  "ARCHIVED",
];

export function ProfilesTab({
  form,
  setForm,
  guests,
  leads,
  profiles,
  query,
  setQuery,
  eventForm,
  setEventForm,
  editingProfileId,
  onSaveProfile,
  onEditProfile,
  onResetProfile,
  onSaveEvent,
  onProfileStatus,
  saving,
  canManage,
  canViewTechnicalPayload,
}: {
  form: ProfileForm;
  setForm: (form: ProfileForm) => void;
  guests: GuestDashboardRow[];
  leads: GuestCrmLead[];
  profiles: GuestGameProfile[];
  query: string;
  setQuery: (value: string) => void;
  eventForm: EventForm;
  setEventForm: (form: EventForm) => void;
  editingProfileId: string | null;
  onSaveProfile: () => Promise<void>;
  onEditProfile: (profile: GuestGameProfile) => void;
  onResetProfile: () => void;
  onSaveEvent: () => Promise<void>;
  onProfileStatus: (
    profile: GuestGameProfile,
    status: GuestGameProfileStatus,
  ) => Promise<void>;
  saving: string | null;
  canManage: boolean;
  canViewTechnicalPayload: boolean;
}) {
  const selectedManualEvent = manualXpEventOption(eventForm.eventType);

  return (
    <div
      className={
        canManage
          ? "grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]"
          : "grid gap-5"
      }
    >
      {canManage ? (
        <section className="space-y-4">
          <Panel
            title={
              editingProfileId
                ? "Редактирование игрового профиля"
                : "Новый игровой профиль"
            }
          >
            <div className="space-y-3">
              <Field label="Гость из Langame">
                <select
                  className={fieldClass}
                  value={form.guestId}
                  onChange={(event) =>
                    setForm({ ...form, guestId: event.target.value })
                  }
                >
                  <option value="">Не выбран</option>
                  {guests.map((guest) => (
                    <option key={guest.id} value={guest.id}>
                      {guest.displayName} · {guest.contact}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="CRM-лид">
                <select
                  className={fieldClass}
                  value={form.leadId}
                  onChange={(event) =>
                    setForm({ ...form, leadId: event.target.value })
                  }
                >
                  <option value="">Не выбран</option>
                  {leads.map((lead) => (
                    <option key={lead.id} value={lead.id}>
                      {lead.displayName} · {lead.phone}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Имя на витрине">
                  <input
                    className={fieldClass}
                    value={form.displayName}
                    onChange={(event) =>
                      setForm({ ...form, displayName: event.target.value })
                    }
                  />
                </Field>
                <Field label="Контакт">
                  <input
                    className={fieldClass}
                    value={form.contactMasked}
                    onChange={(event) =>
                      setForm({ ...form, contactMasked: event.target.value })
                    }
                  />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Telegram ID">
                  <input
                    className={fieldClass}
                    value={form.telegramIdentity}
                    onChange={(event) =>
                      setForm({ ...form, telegramIdentity: event.target.value })
                    }
                  />
                </Field>
                <Field label="MAX ID">
                  <input
                    className={fieldClass}
                    value={form.maxIdentity}
                    onChange={(event) =>
                      setForm({ ...form, maxIdentity: event.target.value })
                    }
                  />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="XP">
                  <input
                    className={fieldClass}
                    type="number"
                    value={form.xp}
                    onChange={(event) =>
                      setForm({ ...form, xp: event.target.value })
                    }
                  />
                </Field>
                <Field label="Уровень">
                  <input
                    className={fieldClass}
                    type="number"
                    value={form.level}
                    onChange={(event) =>
                      setForm({ ...form, level: event.target.value })
                    }
                  />
                </Field>
                <Field label="Статус">
                  <select
                    className={fieldClass}
                    value={form.status}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        status: event.target.value as GuestGameProfileStatus,
                      })
                    }
                  >
                    {profileStatusOptions.map((status) => (
                      <option key={status} value={status}>
                        {profileStatusLabels[status]}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <button
                type="button"
                className={primaryButtonClass}
                disabled={saving === "profile"}
                onClick={onSaveProfile}
              >
                {editingProfileId ? "Изменить профиль" : "Создать профиль"}
              </button>
              {editingProfileId ? (
                <button
                  type="button"
                  className={smallButtonClass}
                  onClick={onResetProfile}
                >
                  Сбросить выбор
                </button>
              ) : null}
            </div>
          </Panel>

          <Panel title="Ручное XP-событие">
            <div className="space-y-3">
              <Field label="Профиль">
                <select
                  className={fieldClass}
                  value={eventForm.profileId}
                  onChange={(event) =>
                    setEventForm({
                      ...eventForm,
                      profileId: event.target.value,
                    })
                  }
                >
                  <option value="">Не выбран</option>
                  {profiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.displayName} · L{profile.level} · {profile.xp} XP
                    </option>
                  ))}
                </select>
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Событие">
                  <select
                    className={fieldClass}
                    value={eventForm.eventType}
                    onChange={(event) => {
                      const option = manualXpEventOption(event.target.value);

                      setEventForm({
                        ...eventForm,
                        eventType: option.value,
                        xpDelta: option.defaultXpDelta,
                        payloadText: manualXpPayloadText(option.value),
                      });
                    }}
                  >
                    {manualXpEventOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <OptionHelp>{selectedManualEvent.description}</OptionHelp>
                </Field>
                <Field label="Изменение XP">
                  <input
                    className={fieldClass}
                    type="number"
                    value={eventForm.xpDelta}
                    onChange={(event) =>
                      setEventForm({
                        ...eventForm,
                        xpDelta: event.target.value,
                      })
                    }
                  />
                  <OptionHelp>
                    Можно указать положительное или отрицательное значение.
                  </OptionHelp>
                </Field>
              </div>
              <Field label="Комментарий">
                <input
                  className={fieldClass}
                  value={eventForm.note}
                  onChange={(event) =>
                    setEventForm({ ...eventForm, note: event.target.value })
                  }
                />
              </Field>
              {canViewTechnicalPayload ? (
                <Field label="Технический payload JSON">
                  <textarea
                    className={`${fieldClass} min-h-28 font-mono text-xs`}
                    value={eventForm.payloadText}
                    onChange={(event) =>
                      setEventForm({
                        ...eventForm,
                        payloadText: event.target.value,
                      })
                    }
                  />
                  <OptionHelp>
                    Видно только платформенным администраторам. Для сотрудников
                    клубов payload формируется автоматически.
                  </OptionHelp>
                </Field>
              ) : null}
              <button
                type="button"
                className={primaryButtonClass}
                disabled={saving === "event"}
                onClick={onSaveEvent}
              >
                Записать событие
              </button>
            </div>
          </Panel>
        </section>
      ) : null}

      <section className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SectionTitle title="Игровые профили" />
          <input
            className={`${fieldClass} sm:max-w-xs`}
            placeholder="Поиск"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {profiles.length ? (
            profiles.map((profile) => (
              <ProfileCard
                key={profile.id}
                profile={profile}
                onEdit={onEditProfile}
                onStatus={onProfileStatus}
                saving={saving}
                canManage={canManage}
              />
            ))
          ) : (
            <EmptyState text="Профили не найдены" />
          )}
        </div>
      </section>
    </div>
  );
}

export function ProfileCard({
  profile,
  onEdit,
  onStatus,
  saving,
  canManage,
}: {
  profile: GuestGameProfile;
  onEdit: (profile: GuestGameProfile) => void;
  onStatus: (
    profile: GuestGameProfile,
    status: GuestGameProfileStatus,
  ) => Promise<void>;
  saving: string | null;
  canManage: boolean;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-zinc-950 dark:text-white">
            {profile.displayName}
          </h3>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {profile.contactMasked ??
              profile.guest?.externalGuestId ??
              "контакт не задан"}
          </p>
          {profile.guest ? (
            <Link
              href={`/guests/${profile.guest.id}`}
              className="mt-1 inline-flex text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-300"
            >
              Карточка гостя в CRM
            </Link>
          ) : (
            <span className="mt-1 inline-flex text-xs text-zinc-400">
              Гость Langame не привязан
            </span>
          )}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {profile.isStaffTest ? (
            <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
              Тест сотрудника
            </span>
          ) : null}
          <StatusPill
            label={profileStatusLabels[profile.status]}
            tone={profileStatusPillTone(profile.status)}
          />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
        <MiniMetric label="XP" value={profile.xp} />
        <MiniMetric label="Уровень" value={profile.level} />
        <MiniMetric
          label="Канал"
          value={
            profile.telegramIdentity ? "TG" : profile.maxIdentity ? "MAX" : "-"
          }
        />
      </div>
      {canManage ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className={smallButtonClass}
            onClick={() => onEdit(profile)}
          >
            Редактировать
          </button>
          {profileStatusOptions.map((status) => (
            <button
              key={status}
              type="button"
              className={smallButtonClass}
              disabled={
                saving === `profile-${profile.id}` || profile.status === status
              }
              onClick={() => onStatus(profile, status)}
            >
              {profileStatusLabels[status]}
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-xs font-medium text-zinc-500 dark:text-zinc-400">
          Только просмотр профиля: изменение XP и статуса недоступно.
        </p>
      )}
    </div>
  );
}

export function profileStatusPillTone(status: GuestGameProfileStatus): StatusPillTone {
  switch (status) {
    case "ACTIVE":
      return "success";
    case "PAUSED":
      return "warning";
    case "ARCHIVED":
      return "neutral";
  }
}

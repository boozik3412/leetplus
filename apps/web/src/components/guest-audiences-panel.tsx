"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type {
  GuestAudience,
  GuestCrmContactEvent,
  GuestCrmLead,
  GuestCrmTask,
  GuestCrmUser,
  GuestListFilters,
} from "@/lib/guests";

type GuestAudiencesPanelProps = {
  currentFilters: GuestListFilters;
  totalRows: number;
  audiences: GuestAudience[];
  crmLeads: GuestCrmLead[];
  crmTasks: GuestCrmTask[];
  crmUsers: GuestCrmUser[];
  crmContactEvents: GuestCrmContactEvent[];
};

export function GuestAudiencesPanel({
  currentFilters,
  totalRows,
  audiences,
  crmLeads,
  crmTasks,
  crmUsers,
  crmContactEvents,
}: GuestAudiencesPanelProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [leadForm, setLeadForm] = useState({
    fullName: "",
    phone: "",
    source: "",
    eventName: "",
    crmNote: "",
    nextAction: "",
    nextContactAt: "",
    phoneConsentGranted: false,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingLead, setIsSavingLead] = useState(false);
  const [isSavingContactEvent, setIsSavingContactEvent] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [taskAudienceId, setTaskAudienceId] = useState<string | null>(null);
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);
  const [assigningTaskId, setAssigningTaskId] = useState<string | null>(null);
  const [updatingLeadId, setUpdatingLeadId] = useState<string | null>(null);
  const [contactForm, setContactForm] = useState({
    leadId: "",
    channel: "Звонок",
    result: "",
    note: "",
    contactedAt: "",
  });
  const [campaignForm, setCampaignForm] = useState({
    target: "",
    channel: "Звонок",
    title: "",
    dueAt: "",
    assignedToUserId: "",
    note: "",
  });
  const [isSavingCampaign, setIsSavingCampaign] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveAudience() {
    const trimmedName = name.trim();

    if (!trimmedName) {
      setError("Введите название аудитории");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/guests/audiences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          filters: sanitizeFilters(currentFilters),
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        setError(payload?.message ?? "Не удалось сохранить аудиторию");
        return;
      }

      setName("");
      router.refresh();
    } catch {
      setError("Не удалось сохранить аудиторию");
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteAudience(id: string) {
    setDeletingId(id);
    setError(null);

    try {
      const response = await fetch(`/api/guests/audiences/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        setError(payload?.message ?? "Не удалось удалить аудиторию");
        return;
      }

      router.refresh();
    } catch {
      setError("Не удалось удалить аудиторию");
    } finally {
      setDeletingId(null);
    }
  }

  async function createAudienceTask(audience: GuestAudience) {
    setTaskAudienceId(audience.id);
    setError(null);

    try {
      const response = await fetch(`/api/guests/audiences/${audience.id}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `Связаться с аудиторией: ${audience.name}`,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        setError(payload?.message ?? "Не удалось создать CRM-задачу");
        return;
      }

      router.refresh();
    } catch {
      setError("Не удалось создать CRM-задачу");
    } finally {
      setTaskAudienceId(null);
    }
  }

  async function saveLead() {
    if (!leadForm.phone.trim()) {
      setError("Введите телефон ручного CRM-гостя");
      return;
    }

    setIsSavingLead(true);
    setError(null);

    try {
      const response = await fetch("/api/guests/crm/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...leadForm,
          phoneConsentStatus: leadForm.phoneConsentGranted
            ? "GRANTED"
            : "UNKNOWN",
          phoneConsentSource: leadForm.source,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        setError(payload?.message ?? "Не удалось добавить CRM-гостя");
        return;
      }

      setLeadForm({
        fullName: "",
        phone: "",
        source: "",
        eventName: "",
        crmNote: "",
        nextAction: "",
        nextContactAt: "",
        phoneConsentGranted: false,
      });
      router.refresh();
    } catch {
      setError("Не удалось добавить CRM-гостя");
    } finally {
      setIsSavingLead(false);
    }
  }

  async function updateTaskStatus(taskId: string, status: GuestCrmTask["status"]) {
    setUpdatingTaskId(taskId);
    setError(null);

    try {
      const response = await fetch(`/api/guests/crm/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        setError(payload?.message ?? "Не удалось обновить CRM-задачу");
        return;
      }

      router.refresh();
    } catch {
      setError("Не удалось обновить CRM-задачу");
    } finally {
      setUpdatingTaskId(null);
    }
  }

  async function updateTaskAssignee(
    taskId: string,
    assignedToUserId: string,
  ) {
    setAssigningTaskId(taskId);
    setError(null);

    try {
      const response = await fetch(`/api/guests/crm/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignedToUserId: assignedToUserId || null }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        setError(payload?.message ?? "Не удалось назначить ответственного");
        return;
      }

      router.refresh();
    } catch {
      setError("Не удалось назначить ответственного");
    } finally {
      setAssigningTaskId(null);
    }
  }

  async function updateLeadConsent(
    leadId: string,
    status: GuestCrmLead["phoneConsentStatus"],
  ) {
    setUpdatingLeadId(leadId);
    setError(null);

    try {
      const response = await fetch(`/api/guests/crm/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneConsentStatus: status }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        setError(payload?.message ?? "Не удалось обновить согласие");
        return;
      }

      router.refresh();
    } catch {
      setError("Не удалось обновить согласие");
    } finally {
      setUpdatingLeadId(null);
    }
  }

  async function saveContactEvent() {
    if (!contactForm.leadId) {
      setError("Выберите CRM-гостя для записи контакта");
      return;
    }

    setIsSavingContactEvent(true);
    setError(null);

    try {
      const response = await fetch("/api/guests/crm/contact-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(contactForm),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        setError(payload?.message ?? "Не удалось записать контакт");
        return;
      }

      setContactForm({
        leadId: "",
        channel: "Звонок",
        result: "",
        note: "",
        contactedAt: "",
      });
      router.refresh();
    } catch {
      setError("Не удалось записать контакт");
    } finally {
      setIsSavingContactEvent(false);
    }
  }

  async function saveCampaignTask() {
    if (!campaignForm.target) {
      setError("Выберите аудиторию или CRM-гостя для кампании");
      return;
    }

    const [targetType, targetId] = campaignForm.target.split(":");
    const selectedAudience = audiences.find(
      (audience) => audience.id === targetId,
    );
    const selectedLead = crmLeads.find((lead) => lead.id === targetId);
    const targetName =
      selectedAudience?.name ?? selectedLead?.displayName ?? "CRM";
    const title =
      campaignForm.title.trim() ||
      `Кампания: ${campaignForm.channel} - ${targetName}`;
    const descriptionParts = [
      `Канал: ${campaignForm.channel}`,
      selectedAudience
        ? `Аудитория: ${selectedAudience.name}. Гостей: ${formatNumber(
            selectedAudience.guestsCount,
          )}.`
        : null,
      selectedLead ? `CRM-гость: ${selectedLead.displayName}` : null,
      campaignForm.note.trim() || null,
    ].filter(Boolean);

    setIsSavingCampaign(true);
    setError(null);

    try {
      const response = await fetch("/api/guests/crm/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audienceId: targetType === "audience" ? targetId : null,
          leadId: targetType === "lead" ? targetId : null,
          title,
          description: descriptionParts.join("\n"),
          dueAt: campaignForm.dueAt || null,
          assignedToUserId: campaignForm.assignedToUserId || null,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        setError(payload?.message ?? "Не удалось создать план кампании");
        return;
      }

      setCampaignForm({
        target: "",
        channel: "Звонок",
        title: "",
        dueAt: "",
        assignedToUserId: "",
        note: "",
      });
      router.refresh();
    } catch {
      setError("Не удалось создать план кампании");
    } finally {
      setIsSavingCampaign(false);
    }
  }

  return (
    <section
      id="audiences"
      className="mt-5 scroll-mt-5 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase text-emerald-700 dark:text-emerald-300">
            Аудитории
          </p>
          <h2 className="mt-1 text-lg font-semibold">
            Сохраненные выборки гостей
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Текущий фильтр содержит {formatNumber(totalRows)} гостей. Снимок
            сохранит состав аудитории для будущих CRM-действий.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-[minmax(12rem,1fr)_auto] lg:w-[34rem]">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={80}
            placeholder="Например: реактивация VIP"
            className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
          <button
            type="button"
            onClick={saveAudience}
            disabled={isSaving}
            className="h-10 rounded-md bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? "Сохраняю..." : "Сохранить аудиторию"}
          </button>
        </div>
      </div>

      {error ? (
        <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </p>
      ) : null}

      {audiences.length > 0 ? (
        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {audiences.map((audience) => (
            <article
              key={audience.id}
              className="flex min-w-0 flex-col gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50"
            >
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold">
                    {audience.name}
                  </h3>
                  <p className="mt-1 text-xs text-zinc-500">
                    {filterSummary(audience.filters)}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                  {formatNumber(audience.guestsCount)}
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Link
                  href={reportHref(audience.filters)}
                  className="inline-flex h-9 items-center justify-center rounded-md bg-zinc-950 px-3 text-xs font-semibold text-white hover:bg-zinc-800 dark:bg-emerald-400 dark:text-zinc-950 dark:hover:bg-emerald-300"
                >
                  Открыть
                </Link>
                <button
                  type="button"
                  onClick={() => deleteAudience(audience.id)}
                  disabled={deletingId === audience.id}
                  className="inline-flex h-9 items-center justify-center rounded-md border border-zinc-300 px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  {deletingId === audience.id ? "Удаляю..." : "Удалить"}
                </button>
                <button
                  type="button"
                  onClick={() => createAudienceTask(audience)}
                  disabled={taskAudienceId === audience.id}
                  className="inline-flex h-9 items-center justify-center rounded-md border border-emerald-300 px-3 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-800 dark:text-emerald-200 dark:hover:bg-emerald-950/50 sm:col-span-2"
                >
                  {taskAudienceId === audience.id
                    ? "Создаю задачу..."
                    : "Создать CRM-задачу"}
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-md border border-dashed border-zinc-300 px-3 py-3 text-sm text-zinc-500 dark:border-zinc-800">
          Сохраненных аудиторий пока нет.
        </p>
      )}

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,0.8fr)]">
        <section className="rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
          <div className="flex flex-col gap-1">
            <p className="text-xs font-semibold uppercase text-emerald-700 dark:text-emerald-300">
              Ручной CRM-гость
            </p>
            <h3 className="text-base font-semibold">
              Контакт без регистрации в Langame
            </h3>
            <p className="text-sm text-zinc-500">
              После следующей синхронизации контакт будет привязан к гостю,
              если Langame вернет тот же номер телефона.
            </p>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <input
              value={leadForm.fullName}
              onChange={(event) =>
                setLeadForm((current) => ({
                  ...current,
                  fullName: event.target.value,
                }))
              }
              placeholder="ФИО"
              className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            />
            <input
              value={leadForm.phone}
              onChange={(event) =>
                setLeadForm((current) => ({
                  ...current,
                  phone: event.target.value,
                }))
              }
              placeholder="Телефон"
              className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            />
            <input
              value={leadForm.eventName}
              onChange={(event) =>
                setLeadForm((current) => ({
                  ...current,
                  eventName: event.target.value,
                }))
              }
              placeholder="Мероприятие или бронь"
              className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            />
            <input
              value={leadForm.source}
              onChange={(event) =>
                setLeadForm((current) => ({
                  ...current,
                  source: event.target.value,
                }))
              }
              placeholder="Источник контакта"
              className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            />
            <input
              value={leadForm.nextAction}
              onChange={(event) =>
                setLeadForm((current) => ({
                  ...current,
                  nextAction: event.target.value,
                }))
              }
              placeholder="Следующее действие"
              className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            />
            <input
              type="date"
              value={leadForm.nextContactAt}
              onChange={(event) =>
                setLeadForm((current) => ({
                  ...current,
                  nextContactAt: event.target.value,
                }))
              }
              className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            />
            <textarea
              value={leadForm.crmNote}
              onChange={(event) =>
                setLeadForm((current) => ({
                  ...current,
                  crmNote: event.target.value,
                }))
              }
              placeholder="Заметка"
              rows={3}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950 md:col-span-2"
            />
            <label className="flex items-start gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 md:col-span-2">
              <input
                type="checkbox"
                checked={leadForm.phoneConsentGranted}
                onChange={(event) =>
                  setLeadForm((current) => ({
                    ...current,
                    phoneConsentGranted: event.target.checked,
                  }))
                }
                className="mt-1 h-4 w-4 rounded border-zinc-300 text-emerald-500"
              />
              <span>
                Гость дал согласие на связь по указанному телефону или в
                мессенджере
              </span>
            </label>
            <button
              type="button"
              onClick={saveLead}
              disabled={isSavingLead}
              className="h-10 rounded-md bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60 md:col-span-2"
            >
              {isSavingLead ? "Добавляю..." : "Добавить в CRM"}
            </button>
          </div>
        </section>

        <section className="rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase text-zinc-500">
                CRM
              </p>
              <h3 className="text-base font-semibold">Ближайшие действия</h3>
            </div>
            <span className="rounded-full bg-zinc-200 px-2 py-1 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
              {formatNumber(
                crmTasks.length + crmLeads.length + crmContactEvents.length,
              )}
            </span>
          </div>
          <div
            id="campaigns"
            className="mt-3 scroll-mt-5 rounded-md border border-emerald-200 bg-white p-3 dark:border-emerald-900/60 dark:bg-zinc-950"
          >
            <p className="text-xs font-semibold uppercase text-emerald-700 dark:text-emerald-300">
              Кампания
            </p>
            <h3 className="mt-1 text-sm font-semibold">
              План контакта с аудиторией или CRM-гостем
            </h3>
            <p className="mt-1 text-xs text-zinc-500">
              Создает задачу с каналом, сроком и ответственным. Отправка сообщений
              пока остается ручной.
            </p>
            <div className="mt-3 grid gap-2">
              <select
                value={campaignForm.target}
                onChange={(event) =>
                  setCampaignForm((current) => ({
                    ...current,
                    target: event.target.value,
                  }))
                }
                className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
              >
                <option value="">Выберите аудиторию или CRM-гостя</option>
                {audiences.map((audience) => (
                  <option key={audience.id} value={`audience:${audience.id}`}>
                    Аудитория: {audience.name}
                  </option>
                ))}
                {crmLeads.map((lead) => (
                  <option key={lead.id} value={`lead:${lead.id}`}>
                    CRM-гость: {lead.displayName}
                  </option>
                ))}
              </select>
              <div className="grid gap-2 sm:grid-cols-2">
                <select
                  value={campaignForm.channel}
                  onChange={(event) =>
                    setCampaignForm((current) => ({
                      ...current,
                      channel: event.target.value,
                    }))
                  }
                  className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
                >
                  <option value="Звонок">Звонок</option>
                  <option value="Мессенджер">Мессенджер</option>
                  <option value="Email">Email</option>
                  <option value="Встреча">Встреча</option>
                  <option value="Другое">Другое</option>
                </select>
                <input
                  type="date"
                  value={campaignForm.dueAt}
                  onChange={(event) =>
                    setCampaignForm((current) => ({
                      ...current,
                      dueAt: event.target.value,
                    }))
                  }
                  className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
                />
              </div>
              <select
                value={campaignForm.assignedToUserId}
                onChange={(event) =>
                  setCampaignForm((current) => ({
                    ...current,
                    assignedToUserId: event.target.value,
                  }))
                }
                className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
              >
                <option value="">Ответственный не назначен</option>
                {crmUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.displayName}
                  </option>
                ))}
              </select>
              <input
                value={campaignForm.title}
                onChange={(event) =>
                  setCampaignForm((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                placeholder="Название задачи"
                className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-xs dark:border-zinc-700 dark:bg-zinc-950"
              />
              <textarea
                value={campaignForm.note}
                onChange={(event) =>
                  setCampaignForm((current) => ({
                    ...current,
                    note: event.target.value,
                  }))
                }
                placeholder="Скрипт, оффер или заметка для контакта"
                rows={2}
                className="rounded-md border border-zinc-300 bg-white px-2 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-950"
              />
              <button
                type="button"
                onClick={saveCampaignTask}
                disabled={isSavingCampaign}
                className="h-9 rounded-md bg-emerald-500 px-3 text-xs font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingCampaign ? "Создаю..." : "Создать план кампании"}
              </button>
            </div>
          </div>
          <div className="mt-3 rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-xs font-semibold uppercase text-zinc-500">
              История контактов
            </p>
            <div className="mt-2 grid gap-2">
              <select
                value={contactForm.leadId}
                onChange={(event) =>
                  setContactForm((current) => ({
                    ...current,
                    leadId: event.target.value,
                  }))
                }
                className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
              >
                <option value="">Выберите CRM-гостя</option>
                {crmLeads.map((lead) => (
                  <option key={lead.id} value={lead.id}>
                    {lead.displayName} · {lead.phone}
                  </option>
                ))}
              </select>
              <div className="grid gap-2 sm:grid-cols-2">
                <select
                  value={contactForm.channel}
                  onChange={(event) =>
                    setContactForm((current) => ({
                      ...current,
                      channel: event.target.value,
                    }))
                  }
                  className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
                >
                  <option value="Звонок">Звонок</option>
                  <option value="Мессенджер">Мессенджер</option>
                  <option value="Email">Email</option>
                  <option value="Встреча">Встреча</option>
                  <option value="Другое">Другое</option>
                </select>
                <input
                  type="date"
                  value={contactForm.contactedAt}
                  onChange={(event) =>
                    setContactForm((current) => ({
                      ...current,
                      contactedAt: event.target.value,
                    }))
                  }
                  className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
                />
              </div>
              <input
                value={contactForm.result}
                onChange={(event) =>
                  setContactForm((current) => ({
                    ...current,
                    result: event.target.value,
                  }))
                }
                placeholder="Итог: договорились, не дозвонились, отказ"
                className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-xs dark:border-zinc-700 dark:bg-zinc-950"
              />
              <textarea
                value={contactForm.note}
                onChange={(event) =>
                  setContactForm((current) => ({
                    ...current,
                    note: event.target.value,
                  }))
                }
                placeholder="Короткая заметка по контакту"
                rows={2}
                className="rounded-md border border-zinc-300 bg-white px-2 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-950"
              />
              <button
                type="button"
                onClick={saveContactEvent}
                disabled={isSavingContactEvent || crmLeads.length === 0}
                className="h-9 rounded-md bg-emerald-500 px-3 text-xs font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingContactEvent ? "Записываю..." : "Записать контакт"}
              </button>
            </div>
          </div>
          <div className="mt-3 space-y-2">
            {crmContactEvents.slice(0, 4).map((event) => (
              <article
                key={event.id}
                className="rounded-md border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {event.lead?.displayName ??
                        event.guest?.displayName ??
                        event.audience?.name ??
                        "CRM-контакт"}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {event.channel} · {formatDate(event.contactedAt)}
                    </p>
                  </div>
                  {event.result ? (
                    <span className="shrink-0 rounded-full bg-zinc-200 px-2 py-1 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                      {event.result}
                    </span>
                  ) : null}
                </div>
                {event.note ? (
                  <p className="mt-2 text-xs text-zinc-500">{event.note}</p>
                ) : null}
              </article>
            ))}
            {crmLeads.slice(0, 4).map((lead) => (
              <article
                key={lead.id}
                className="rounded-md border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">{lead.displayName}</p>
                    <p className="text-xs text-zinc-500">{lead.phone}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${
                      lead.matchedGuestId
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                        : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200"
                    }`}
                  >
                    {lead.matchedGuestId ? "связан" : "ожидает"}
                  </span>
                </div>
                <p className="mt-2 text-xs text-zinc-500">
                  {lead.eventName || lead.source || "ручной контакт"}
                  {lead.nextAction ? ` · ${lead.nextAction}` : ""}
                </p>
                <p className="mt-1 text-xs font-semibold text-zinc-500">
                  {consentLabel(lead.phoneConsentStatus)}
                </p>
                <select
                  value={lead.phoneConsentStatus}
                  onChange={(event) =>
                    updateLeadConsent(
                      lead.id,
                      event.target.value as GuestCrmLead["phoneConsentStatus"],
                    )
                  }
                  disabled={updatingLeadId === lead.id}
                  className="mt-2 h-9 w-full rounded-md border border-zinc-300 bg-white px-2 text-xs font-semibold text-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
                >
                  <option value="UNKNOWN">Согласие не указано</option>
                  <option value="GRANTED">Согласие есть</option>
                  <option value="DENIED">Согласия нет</option>
                  <option value="UNSUBSCRIBED">Отписался</option>
                </select>
                {lead.matchedGuestId ? (
                  <Link
                    href={`/guests/${lead.matchedGuestId}`}
                    className="mt-2 inline-flex text-xs font-semibold text-emerald-700 underline-offset-4 hover:underline dark:text-emerald-300"
                  >
                    Открыть гостя
                  </Link>
                ) : null}
              </article>
            ))}
            {crmTasks.slice(0, 4).map((task) => (
              <article
                key={task.id}
                className="rounded-md border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
              >
                <p className="font-semibold">{task.title}</p>
                <p className="mt-1 text-xs text-zinc-500">
                  {task.audience?.name ?? task.lead?.displayName ?? "CRM"}
                  {task.dueAt ? ` · до ${formatDate(task.dueAt)}` : ""}
                </p>
                <select
                  value={task.assignedToUser?.id ?? ""}
                  onChange={(event) =>
                    updateTaskAssignee(task.id, event.target.value)
                  }
                  disabled={assigningTaskId === task.id}
                  className="mt-2 h-9 w-full rounded-md border border-zinc-300 bg-white px-2 text-xs font-semibold text-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
                >
                  <option value="">Ответственный не назначен</option>
                  {crmUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.displayName}
                    </option>
                  ))}
                </select>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span
                    className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${taskStatusClass(task.status)}`}
                  >
                    {taskStatusLabel(task.status)}
                  </span>
                  <div className="flex flex-wrap justify-end gap-2">
                    {task.status !== "IN_PROGRESS" && task.status !== "DONE" ? (
                      <button
                        type="button"
                        onClick={() => updateTaskStatus(task.id, "IN_PROGRESS")}
                        disabled={updatingTaskId === task.id}
                        className="rounded-md border border-zinc-300 px-2.5 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      >
                        В работу
                      </button>
                    ) : null}
                    {task.status !== "DONE" ? (
                      <button
                        type="button"
                        onClick={() => updateTaskStatus(task.id, "DONE")}
                        disabled={updatingTaskId === task.id}
                        className="rounded-md bg-emerald-500 px-2.5 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Закрыть
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => updateTaskStatus(task.id, "OPEN")}
                        disabled={updatingTaskId === task.id}
                        className="rounded-md border border-zinc-300 px-2.5 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      >
                        Вернуть
                      </button>
                    )}
                    {task.status !== "CANCELED" && task.status !== "DONE" ? (
                      <button
                        type="button"
                        onClick={() => updateTaskStatus(task.id, "CANCELED")}
                        disabled={updatingTaskId === task.id}
                        className="rounded-md border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900/70 dark:text-red-200 dark:hover:bg-red-950/40"
                      >
                        Отменить
                      </button>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
            {crmLeads.length === 0 && crmTasks.length === 0 ? (
              <p className="rounded-md border border-dashed border-zinc-300 px-3 py-3 text-sm text-zinc-500 dark:border-zinc-800">
                CRM-действий пока нет.
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </section>
  );
}

function sanitizeFilters(filters: GuestListFilters): Omit<GuestListFilters, "page"> {
  const cleaned = { ...filters };
  delete cleaned.page;

  return cleaned;
}

function reportHref(filters: Omit<GuestListFilters, "page">) {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value) {
      params.set(key, value);
    }
  });
  params.set("page", "1");

  return `/guests/report?${params.toString()}`;
}

function filterSummary(filters: Omit<GuestListFilters, "page">) {
  const parts = [
    filters.dateFrom && filters.dateTo
      ? `${filters.dateFrom} - ${filters.dateTo}`
      : null,
    filters.segment ? `сегмент: ${filters.segment}` : null,
    filters.crmStatus ? `CRM: ${filters.crmStatus}` : null,
    filters.search ? `поиск: ${filters.search}` : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" · ") : "Базовая выборка";
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function consentLabel(status: string) {
  if (status === "GRANTED") {
    return "согласие на связь есть";
  }

  if (status === "DENIED") {
    return "согласия на связь нет";
  }

  if (status === "UNSUBSCRIBED") {
    return "отписался от связи";
  }

  return "согласие на связь не указано";
}

function taskStatusLabel(status: string) {
  if (status === "IN_PROGRESS") {
    return "в работе";
  }

  if (status === "DONE") {
    return "готово";
  }

  if (status === "CANCELED") {
    return "отменено";
  }

  return "новая";
}

function taskStatusClass(status: string) {
  if (status === "IN_PROGRESS") {
    return "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200";
  }

  if (status === "DONE") {
    return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200";
  }

  if (status === "CANCELED") {
    return "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300";
  }

  return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200";
}

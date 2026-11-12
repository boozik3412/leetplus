"use client";

import { Phone, Plus } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Board } from "@/components/board";
import { SidePanel } from "@/components/side-panel";
import {
  CONTACT_CHANNELS,
  formatRuPhone,
  LEAD_STAGE_COLUMNS,
  LEAD_STAGE_LABELS,
  newLeadPayload,
  sortLeadsForBoard,
  validateNewLead,
  type NewLeadErrors,
  type NewLeadForm,
} from "@/lib/crm-leads";
import type {
  GuestCrmContactEvent,
  GuestCrmLead,
  GuestCrmLeadStage,
  GuestCrmUser,
} from "@/lib/guests";

type Props = {
  leads: GuestCrmLead[];
  users: GuestCrmUser[];
  /** manage_guest_crm: create leads, move them, change fields. */
  canManage: boolean;
  /** manage_communications: add calls and notes to the feed. */
  canLogContacts: boolean;
};

type LeadPatch = Partial<{
  stage: GuestCrmLeadStage;
  assignedToUserId: string | null;
  visitAt: string | null;
  eventName: string | null;
}>;

const fieldClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-950 outline-none transition focus-visible:border-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500/40 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white";
const labelClass = "text-sm font-semibold text-zinc-800 dark:text-zinc-100";
const primaryButton =
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:focus-visible:ring-offset-zinc-950";
const secondaryButton =
  "inline-flex cursor-pointer items-center justify-center rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900";

const emptyForm: NewLeadForm = {
  fullName: "",
  phone: "",
  eventName: "",
  visitDate: "",
  assignedToUserId: "",
};

function formatDay(value: string | null) {
  if (!value) return null;

  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    timeZone: "Europe/Moscow",
  }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Moscow",
  }).format(new Date(value));
}

/** yyyy-mm-dd for <input type="date">, in Moscow time. */
function toDateInput(value: string | null) {
  if (!value) return "";

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
  }).format(new Date(value));
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

export function CrmLeadBoard({
  leads,
  users,
  canManage,
  canLogContacts,
}: Props) {
  const router = useRouter();
  const [saved, setSaved] = useState<ReadonlyMap<string, GuestCrmLead>>(
    () => new Map(),
  );
  const [created, setCreated] = useState<GuestCrmLead[]>([]);
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shown = useMemo(() => {
    const known = new Set(leads.map((lead) => lead.id));
    const all = [
      ...created.filter((lead) => !known.has(lead.id)),
      ...leads,
    ].map((lead) => saved.get(lead.id) ?? lead);

    return sortLeadsForBoard(all);
  }, [leads, created, saved]);
  const openLead = shown.find((lead) => lead.id === openId) ?? null;

  async function update(lead: GuestCrmLead, patch: LeadPatch) {
    setError(null);
    setSaved((current) =>
      new Map(current).set(lead.id, {
        ...lead,
        ...(patch.stage ? { stage: patch.stage } : {}),
      }),
    );
    setPending((current) => new Set(current).add(lead.id));

    try {
      const response = await fetch(
        `/api/guests/crm/leads/${encodeURIComponent(lead.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        },
      );

      if (!response.ok) throw new Error(await readError(response));

      const next = (await response.json()) as GuestCrmLead;
      setSaved((current) => new Map(current).set(lead.id, next));
      router.refresh();
    } catch (caught) {
      setSaved((current) => new Map(current).set(lead.id, lead));
      setError(
        `${lead.displayName}: ${
          caught instanceof Error ? caught.message : "не удалось сохранить"
        }`,
      );
    } finally {
      setPending((current) => {
        const next = new Set(current);
        next.delete(lead.id);
        return next;
      });
    }
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Брони, дни рождения, турниры и корпоративы до того, как гость пришёл в
          клуб.
          {canManage ? " Перетащите карточку, чтобы сменить этап." : ""}
        </p>
        {canManage ? (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className={primaryButton}
          >
            <Plus size={16} weight="bold" aria-hidden />
            Заявка
          </button>
        ) : null}
      </div>

      {error ? (
        <p
          role="alert"
          className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200"
        >
          {error}
        </p>
      ) : null}

      <Board
        ariaLabel="Заявки по этапам"
        columns={LEAD_STAGE_COLUMNS}
        items={shown}
        idOf={(lead) => lead.id}
        columnOf={(lead) => lead.stage}
        onOpen={(lead) => setOpenId(lead.id)}
        onMove={
          canManage ? (lead, stage) => void update(lead, { stage }) : undefined
        }
        pendingIds={pending}
        emptyText={(column) =>
          column.key === "NEW"
            ? canManage
              ? "Новых заявок нет. Добавьте первую кнопкой «Заявка»."
              : "Новых заявок нет"
            : "Здесь пока пусто"
        }
        renderCard={(lead) => (
          <>
            <span className="block font-semibold leading-5 text-zinc-950 [overflow-wrap:anywhere] dark:text-white">
              {lead.displayName}
            </span>
            {lead.eventName ? (
              <span className="mt-1 block text-zinc-700 [overflow-wrap:anywhere] dark:text-zinc-200">
                {lead.eventName}
              </span>
            ) : null}
            <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
              {lead.visitAt ? (
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {formatDay(lead.visitAt)}
                </span>
              ) : null}
              <span>
                {lead.assignedToUser?.displayName ?? "без ответственного"}
              </span>
            </span>
          </>
        )}
      />

      <NewLeadPanel
        open={creating}
        users={users}
        onClose={() => setCreating(false)}
        onCreated={(lead) => {
          setCreated((current) => [lead, ...current]);
          setCreating(false);
          router.refresh();
        }}
      />

      <SidePanel
        open={openLead !== null}
        onClose={() => setOpenId(null)}
        eyebrow="Заявка"
        title={openLead?.displayName ?? ""}
        footer={
          <button
            type="button"
            onClick={() => setOpenId(null)}
            className={secondaryButton}
          >
            Закрыть
          </button>
        }
      >
        {openLead ? (
          <LeadDetails
            key={openLead.id}
            lead={openLead}
            users={users}
            canManage={canManage}
            canLogContacts={canLogContacts}
            pending={pending.has(openLead.id)}
            onUpdate={(patch) => void update(openLead, patch)}
          />
        ) : null}
      </SidePanel>
    </>
  );
}

function NewLeadPanel({
  open,
  users,
  onClose,
  onCreated,
}: {
  open: boolean;
  users: GuestCrmUser[];
  onClose: () => void;
  onCreated: (lead: GuestCrmLead) => void;
}) {
  const [form, setForm] = useState<NewLeadForm>(emptyForm);
  const [errors, setErrors] = useState<NewLeadErrors>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setForm(emptyForm);
    setErrors({});
    setError(null);
    onClose();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateNewLead(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/guests/crm/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newLeadPayload(form)),
      });

      if (!response.ok) throw new Error(await readError(response));

      const lead = (await response.json()) as GuestCrmLead;
      setForm(emptyForm);
      setErrors({});
      onCreated(lead);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Не удалось сохранить.",
      );
    } finally {
      setSaving(false);
    }
  }

  function field<K extends keyof NewLeadForm>(key: K, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <SidePanel
      open={open}
      onClose={close}
      eyebrow="Новая заявка"
      title="Кто и что хочет"
      footer={
        <>
          <button type="button" onClick={close} className={secondaryButton}>
            Отмена
          </button>
          <button
            type="submit"
            form="new-lead-form"
            disabled={saving}
            className={primaryButton}
          >
            {saving ? "Сохраняем…" : "Добавить заявку"}
          </button>
        </>
      }
    >
      <form
        id="new-lead-form"
        onSubmit={submit}
        noValidate
        className="space-y-4"
      >
        <TextField
          id="lead-name"
          label="Имя"
          value={form.fullName}
          error={errors.fullName}
          autoComplete="name"
          onChange={(value) => field("fullName", value)}
        />
        <TextField
          id="lead-phone"
          label="Телефон"
          type="tel"
          value={form.phone}
          error={errors.phone}
          placeholder="+7 900 000-00-00"
          autoComplete="tel"
          onChange={(value) => field("phone", value)}
        />
        <TextField
          id="lead-event"
          label="Что хочет"
          value={form.eventName}
          error={errors.eventName}
          placeholder="Бронь на 5 мест, день рождения"
          onChange={(value) => field("eventName", value)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="lead-date" className={labelClass}>
              Дата
            </label>
            <input
              id="lead-date"
              type="date"
              value={form.visitDate}
              onChange={(event) => field("visitDate", event.target.value)}
              className={fieldClass}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="lead-assignee" className={labelClass}>
              Ответственный
            </label>
            <select
              id="lead-assignee"
              value={form.assignedToUserId}
              onChange={(event) =>
                field("assignedToUserId", event.target.value)
              }
              className={`${fieldClass} cursor-pointer`}
            >
              <option value="">Не назначен</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.displayName}
                </option>
              ))}
            </select>
          </div>
        </div>
        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200"
          >
            {error}
          </p>
        ) : null}
      </form>
    </SidePanel>
  );
}

function TextField({
  id,
  label,
  value,
  error,
  onChange,
  type = "text",
  placeholder,
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
  type?: "text" | "tel";
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`${fieldClass} ${error ? "border-red-400 dark:border-red-500/60" : ""}`}
      />
      {error ? (
        <p
          id={`${id}-error`}
          className="text-sm text-red-700 dark:text-red-300"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

function LeadDetails({
  lead,
  users,
  canManage,
  canLogContacts,
  pending,
  onUpdate,
}: {
  lead: GuestCrmLead;
  users: GuestCrmUser[];
  canManage: boolean;
  canLogContacts: boolean;
  pending: boolean;
  onUpdate: (patch: LeadPatch) => void;
}) {
  const [eventName, setEventName] = useState(lead.eventName ?? "");
  const [events, setEvents] = useState<GuestCrmContactEvent[] | null>(null);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [channel, setChannel] = useState<string>(CONTACT_CHANNELS[0]);
  const [note, setNote] = useState("");
  const [logging, setLogging] = useState(false);
  const telHref = lead.phone.replace(/[^\d+]/gu, "");
  const phoneIsVisible = /\d{6,}/u.test(telHref);

  useEffect(() => {
    let active = true;

    fetch(
      `/api/guests/crm/contact-events?leadId=${encodeURIComponent(lead.id)}`,
      { cache: "no-store" },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error(await readError(response));
        return (await response.json()) as GuestCrmContactEvent[];
      })
      .then((rows) => {
        if (active) setEvents(rows);
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setEvents([]);
        setFeedError(
          caught instanceof Error ? caught.message : "Не удалось загрузить",
        );
      });

    return () => {
      active = false;
    };
  }, [lead.id]);

  async function logContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!note.trim()) return;
    setLogging(true);
    setFeedError(null);

    try {
      const response = await fetch("/api/guests/crm/contact-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: lead.id, channel, note: note.trim() }),
      });

      if (!response.ok) throw new Error(await readError(response));

      const created = (await response.json()) as GuestCrmContactEvent;
      setEvents((current) => [created, ...(current ?? [])]);
      setNote("");
    } catch (caught) {
      setFeedError(
        caught instanceof Error ? caught.message : "Не удалось сохранить",
      );
    } finally {
      setLogging(false);
    }
  }

  return (
    <div className="space-y-6 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        {phoneIsVisible ? (
          <a
            href={`tel:${telHref}`}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 px-3 py-2 font-semibold text-zinc-800 transition hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-900"
          >
            <Phone size={16} aria-hidden />
            {formatRuPhone(lead.phone)}
          </a>
        ) : (
          <span className="text-zinc-600 dark:text-zinc-300">{lead.phone}</span>
        )}
        {lead.matchedGuestId ? (
          <Link
            href={`/guests/${encodeURIComponent(lead.matchedGuestId)}`}
            className="font-semibold text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-300"
          >
            Карточка гостя
          </Link>
        ) : null}
      </div>

      <fieldset disabled={!canManage || pending} className="space-y-2">
        <legend className={labelClass}>Этап</legend>
        <div className="flex flex-wrap gap-2">
          {LEAD_STAGE_COLUMNS.map((column) => {
            const active = lead.stage === column.key;

            return (
              <button
                key={column.key}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  active ? undefined : onUpdate({ stage: column.key })
                }
                className={`cursor-pointer rounded-lg border px-3 py-1.5 font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-60 ${
                  active
                    ? "border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200"
                    : "border-zinc-300 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
                }`}
              >
                {LEAD_STAGE_LABELS[column.key]}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset disabled={!canManage || pending} className="space-y-4">
        <legend className="sr-only">Заявка</legend>
        <div className="space-y-1.5">
          <label htmlFor="lead-edit-event" className={labelClass}>
            Что хочет
          </label>
          <input
            id="lead-edit-event"
            value={eventName}
            onChange={(event) => setEventName(event.target.value)}
            onBlur={() => {
              if (eventName.trim() !== (lead.eventName ?? "")) {
                onUpdate({ eventName: eventName.trim() || null });
              }
            }}
            className={fieldClass}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="lead-edit-date" className={labelClass}>
              Дата
            </label>
            <input
              id="lead-edit-date"
              type="date"
              value={toDateInput(lead.visitAt)}
              onChange={(event) =>
                onUpdate({ visitAt: event.target.value || null })
              }
              className={fieldClass}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="lead-edit-assignee" className={labelClass}>
              Ответственный
            </label>
            <select
              id="lead-edit-assignee"
              value={lead.assignedToUser?.id ?? ""}
              onChange={(event) =>
                onUpdate({ assignedToUserId: event.target.value || null })
              }
              className={`${fieldClass} cursor-pointer`}
            >
              <option value="">Не назначен</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.displayName}
                </option>
              ))}
            </select>
          </div>
        </div>
      </fieldset>
      {pending ? (
        <p aria-live="polite" className="text-zinc-500 dark:text-zinc-400">
          Сохраняем…
        </p>
      ) : null}

      <section aria-labelledby="lead-feed-title" className="space-y-3">
        <h3 id="lead-feed-title" className={labelClass}>
          Звонки и заметки
        </h3>
        {canLogContacts ? (
          <form onSubmit={logContact} className="space-y-2">
            <div className="flex gap-2">
              <label htmlFor="lead-contact-channel" className="sr-only">
                Как связались
              </label>
              <div className="w-36 shrink-0">
                <select
                  id="lead-contact-channel"
                  value={channel}
                  onChange={(event) => setChannel(event.target.value)}
                  className={`${fieldClass} cursor-pointer`}
                >
                  {CONTACT_CHANNELS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
              <label htmlFor="lead-contact-note" className="sr-only">
                Что сказал гость
              </label>
              <input
                id="lead-contact-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Что сказал гость"
                maxLength={2000}
                className={`${fieldClass} min-w-0 flex-1`}
              />
            </div>
            <button
              type="submit"
              disabled={logging || !note.trim()}
              className={secondaryButton}
            >
              {logging ? "Сохраняем…" : "Добавить в ленту"}
            </button>
          </form>
        ) : null}
        {feedError ? (
          <p role="alert" className="text-red-700 dark:text-red-300">
            {feedError}
          </p>
        ) : null}
        {events === null ? (
          <p className="text-zinc-500 dark:text-zinc-400">Загружаем ленту…</p>
        ) : events.length > 0 ? (
          <ol className="space-y-3 border-l border-zinc-200 pl-4 dark:border-zinc-800">
            {events.map((event) => (
              <li key={event.id}>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {formatDateTime(event.contactedAt)} · {event.channel}
                  {event.createdBy ? ` · ${event.createdBy}` : ""}
                </p>
                {event.note || event.result ? (
                  <p className="mt-0.5 whitespace-pre-line text-zinc-800 [overflow-wrap:anywhere] dark:text-zinc-100">
                    {event.note ?? event.result}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-zinc-500 dark:text-zinc-400">
            Пока ни одного контакта. Запишите первый звонок, чтобы коллеги
            видели, о чём договорились.
          </p>
        )}
      </section>
    </div>
  );
}

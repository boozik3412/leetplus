"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import type { GuestAudience, GuestCrmUser } from "@/lib/guests";
import type {
  MarketingCampaign,
  MarketingCampaignGoal,
  MarketingCampaignStatus,
} from "@/lib/marketing";
import type { Store } from "@/lib/stores";

type CampaignFormState = {
  goal: MarketingCampaignGoal;
  name: string;
  audienceId: string;
  storeId: string;
  ownerUserId: string;
  channel: string;
  mechanic: string;
  periodFrom: string;
  periodTo: string;
  dueAt: string;
  budget: string;
  note: string;
};

const goalOptions: Array<{ value: MarketingCampaignGoal; label: string }> = [
  { value: "RETURN_GUESTS", label: "Вернуть гостей" },
  { value: "REPEAT_VISIT", label: "Повторный визит" },
  { value: "WEAK_HOURS", label: "Заполнить тихие часы" },
  { value: "BAR_GROWTH", label: "Вырастить бар" },
  { value: "EVENT_PROMO", label: "Событие или бронь" },
  { value: "PROMO_BUNDLE", label: "Промо-набор" },
];

const statusOptions: Array<{ value: MarketingCampaignStatus; label: string }> = [
  { value: "DRAFT", label: "Черновик" },
  { value: "PLANNED", label: "Запланирована" },
  { value: "RUNNING", label: "В работе" },
  { value: "FINISHED", label: "Завершена" },
  { value: "CANCELED", label: "Отменена" },
];

const channelOptions = [
  "CRM-задача",
  "Звонок",
  "Мессенджер",
  "Объявление в клубе",
  "Соцсети",
  "Будущая рассылка",
];

const mechanicOptions = [
  "Персональное предложение",
  "Промо-набор",
  "Событие",
  "Турнир",
  "Купон",
  "Миссия",
  "Реферальная механика",
];

const emptyForm: CampaignFormState = {
  goal: "RETURN_GUESTS",
  name: "",
  audienceId: "",
  storeId: "",
  ownerUserId: "",
  channel: "CRM-задача",
  mechanic: "Персональное предложение",
  periodFrom: "",
  periodTo: "",
  dueAt: "",
  budget: "",
  note: "",
};

export function MarketingCampaignsPanel({
  campaigns,
  audiences,
  users,
  stores,
}: {
  campaigns: MarketingCampaign[];
  audiences: GuestAudience[];
  users: GuestCrmUser[];
  stores: Store[];
}) {
  const [rows, setRows] = useState(campaigns);
  const [form, setForm] = useState<CampaignFormState>(emptyForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingTaskCampaignId, setPendingTaskCampaignId] = useState<
    string | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  const summary = useMemo(
    () => ({
      total: rows.length,
      active: rows.filter(
        (row) => row.status === "PLANNED" || row.status === "RUNNING",
      ).length,
      drafts: rows.filter((row) => row.status === "DRAFT").length,
    }),
    [rows],
  );

  async function createCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const response = await fetch("/api/marketing/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cleanPayload(form)),
    });

    if (!response.ok) {
      setError(await readError(response));
      setIsSubmitting(false);
      return;
    }

    const campaign = (await response.json()) as MarketingCampaign;
    setRows((current) => [campaign, ...current]);
    setForm(emptyForm);
    setIsSubmitting(false);
  }

  async function updateStatus(
    campaign: MarketingCampaign,
    status: MarketingCampaignStatus,
  ) {
    const previousRows = rows;
    setRows((current) =>
      current.map((row) => (row.id === campaign.id ? { ...row, status } : row)),
    );
    setError(null);

    const response = await fetch(`/api/marketing/campaigns/${campaign.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });

    if (!response.ok) {
      setRows(previousRows);
      setError(await readError(response));
      return;
    }

    const updated = (await response.json()) as MarketingCampaign;
    setRows((current) =>
      current.map((row) => (row.id === updated.id ? updated : row)),
    );
  }

  async function createCrmTask(campaign: MarketingCampaign) {
    setPendingTaskCampaignId(campaign.id);
    setError(null);

    const response = await fetch(
      `/api/marketing/campaigns/${campaign.id}/crm-task`,
      { method: "POST" },
    );

    if (!response.ok) {
      setError(await readError(response));
      setPendingTaskCampaignId(null);
      return;
    }

    const updated = (await response.json()) as MarketingCampaign;
    setRows((current) =>
      current.map((row) => (row.id === updated.id ? updated : row)),
    );
    setPendingTaskCampaignId(null);
  }

  return (
    <section className="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="grid gap-4 border-b border-zinc-200 p-6 dark:border-zinc-800 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-emerald-500">
            Кампании
          </p>
          <h2 className="mt-2 text-2xl font-bold text-zinc-950 dark:text-white">
            Черновики и ручной запуск
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            Сохраните цель, группу, канал, ответственного и срок. Это пока
            управленческий план без автоматических бонусов и рассылок в Langame.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <MetricPill label="Всего" value={summary.total} />
          <MetricPill label="Активные" value={summary.active} />
          <MetricPill label="Черновики" value={summary.drafts} />
        </div>
      </div>

      <form
        onSubmit={createCampaign}
        className="grid gap-4 border-b border-zinc-200 p-4 dark:border-zinc-800 lg:grid-cols-12"
      >
        <Field label="Цель" className="lg:col-span-3">
          <select
            value={form.goal}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                goal: event.target.value as MarketingCampaignGoal,
              }))
            }
            className={fieldClassName}
          >
            {goalOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Название" className="lg:col-span-4">
          <input
            value={form.name}
            onChange={(event) =>
              setForm((current) => ({ ...current, name: event.target.value }))
            }
            placeholder="Например: Вернуть гостей в риске на выходные"
            className={fieldClassName}
          />
        </Field>

        <Field label="Группа" className="lg:col-span-3">
          <select
            value={form.audienceId}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                audienceId: event.target.value,
              }))
            }
            className={fieldClassName}
          >
            <option value="">Без группы</option>
            {audiences.map((audience) => (
              <option key={audience.id} value={audience.id}>
                {audience.name} · {audience.guestsCount} гостей
              </option>
            ))}
          </select>
        </Field>

        <Field label="Клуб" className="lg:col-span-2">
          <select
            value={form.storeId}
            onChange={(event) =>
              setForm((current) => ({ ...current, storeId: event.target.value }))
            }
            className={fieldClassName}
          >
            <option value="">Вся сеть</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Канал" className="lg:col-span-3">
          <select
            value={form.channel}
            onChange={(event) =>
              setForm((current) => ({ ...current, channel: event.target.value }))
            }
            className={fieldClassName}
          >
            {channelOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Механика" className="lg:col-span-3">
          <select
            value={form.mechanic}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                mechanic: event.target.value,
              }))
            }
            className={fieldClassName}
          >
            {mechanicOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Ответственный" className="lg:col-span-3">
          <select
            value={form.ownerUserId}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                ownerUserId: event.target.value,
              }))
            }
            className={fieldClassName}
          >
            <option value="">Не назначен</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.displayName}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Дедлайн" className="lg:col-span-3">
          <input
            type="date"
            value={form.dueAt}
            onChange={(event) =>
              setForm((current) => ({ ...current, dueAt: event.target.value }))
            }
            className={fieldClassName}
          />
        </Field>

        <Field label="Период с" className="lg:col-span-2">
          <input
            type="date"
            value={form.periodFrom}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                periodFrom: event.target.value,
              }))
            }
            className={fieldClassName}
          />
        </Field>

        <Field label="Период по" className="lg:col-span-2">
          <input
            type="date"
            value={form.periodTo}
            onChange={(event) =>
              setForm((current) => ({ ...current, periodTo: event.target.value }))
            }
            className={fieldClassName}
          />
        </Field>

        <Field label="Бюджет, руб" className="lg:col-span-2">
          <input
            inputMode="decimal"
            value={form.budget}
            onChange={(event) =>
              setForm((current) => ({ ...current, budget: event.target.value }))
            }
            placeholder="0"
            className={fieldClassName}
          />
        </Field>

        <Field label="Заметка" className="lg:col-span-4">
          <input
            value={form.note}
            onChange={(event) =>
              setForm((current) => ({ ...current, note: event.target.value }))
            }
            placeholder="Что предложить и как проверить результат"
            className={fieldClassName}
          />
        </Field>

        <div className="flex items-end lg:col-span-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className="min-h-11 w-full rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Сохраняем..." : "Создать"}
          </button>
        </div>

        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200 lg:col-span-12">
            {error}
          </p>
        ) : null}
      </form>

      <div className="grid gap-3 p-4 lg:grid-cols-2">
        {rows.length > 0 ? (
          rows.map((campaign) => (
            <article
              key={campaign.id}
              className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    {goalLabel(campaign.goal)}
                  </p>
                  <h3 className="mt-1 text-lg font-semibold text-zinc-950 dark:text-white">
                    {campaign.name}
                  </h3>
                </div>
                <select
                  value={campaign.status}
                  onChange={(event) =>
                    updateStatus(
                      campaign,
                      event.target.value as MarketingCampaignStatus,
                    )
                  }
                  className="min-h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                >
                  {statusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <Info label="Группа" value={campaign.audience?.name ?? "не выбрана"} />
                <Info label="Клуб" value={storeLabel(campaign.storeIds, stores)} />
                <Info label="Ответственный" value={campaign.owner?.displayName ?? "не назначен"} />
                <Info label="Канал" value={campaign.channel ?? "не выбран"} />
                <Info label="Механика" value={campaign.mechanic ?? "не выбрана"} />
                <Info label="Срок" value={formatDate(campaign.dueAt)} />
                <Info label="Бюджет" value={formatRubles(campaign.budget)} />
                <Info
                  label="CRM-задача"
                  value={campaign.crmTask ? "создана" : "не создана"}
                />
              </dl>

              <ConsentCoverage coverage={campaign.consentCoverage} />

              {campaign.note ? (
                <p className="mt-4 rounded-lg border border-zinc-200 bg-white p-3 text-sm leading-6 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
                  {campaign.note}
                </p>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2">
                {campaign.crmTask ? (
                  <Link
                    href="/guests/crm/tasks"
                    className="inline-flex min-h-10 items-center justify-center rounded-xl border border-emerald-500/40 px-4 text-sm font-semibold text-emerald-500 transition hover:bg-emerald-500/10"
                  >
                    Открыть CRM-задачи
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => createCrmTask(campaign)}
                    disabled={pendingTaskCampaignId === campaign.id}
                    className="inline-flex min-h-10 items-center justify-center rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {pendingTaskCampaignId === campaign.id
                      ? "Создаем..."
                      : "Создать CRM-задачу"}
                  </button>
                )}
              </div>
            </article>
          ))
        ) : (
          <div className="rounded-lg border border-dashed border-zinc-300 p-6 text-sm leading-6 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300 lg:col-span-2">
            Кампаний пока нет. Создайте первый черновик из цели, группы и канала,
            чтобы команда понимала, что запускать и как потом контролировать эффект.
          </div>
        )}
      </div>
    </section>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={["block space-y-1", className].filter(Boolean).join(" ")}>
      <span className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </span>
      {children}
    </label>
  );
}

function MetricPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-2xl font-bold text-zinc-950 dark:text-white">{value}</p>
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
      <dt className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </dt>
      <dd className="mt-1 font-semibold text-zinc-950 dark:text-white">{value}</dd>
    </div>
  );
}

function ConsentCoverage({
  coverage,
}: {
  coverage: MarketingCampaign["consentCoverage"];
}) {
  const targetTotal = coverage?.targetTotal ?? 0;
  const contactable = coverage?.contactable ?? 0;
  const excluded = coverage?.excluded ?? 0;
  const phoneDenied = coverage?.phoneDenied ?? 0;
  const phoneUnsubscribed = coverage?.phoneUnsubscribed ?? 0;
  const phoneUnknown = coverage?.phoneUnknown ?? 0;
  const requiresPhoneConsent = coverage?.requiresPhoneConsent ?? true;
  const percent =
    targetTotal > 0 ? Math.round((contactable / targetTotal) * 100) : 0;

  return (
    <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Согласия и исключения
        </p>
        <p className="text-sm font-semibold text-zinc-950 dark:text-white">
          {targetTotal > 0
            ? `${contactable} из ${targetTotal}`
            : "группа не выбрана"}
        </p>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div
          className="h-full rounded-full bg-emerald-500"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
        {requiresPhoneConsent
          ? `Для телефонного контакта доступно ${contactable}, исключено ${excluded}: отказов ${phoneDenied}, отписок ${phoneUnsubscribed}, неизвестных ${phoneUnknown}.`
          : "Для выбранного канала телефонное согласие не требуется, но статусы сохранены для контроля."}
      </p>
    </div>
  );
}

function cleanPayload(form: CampaignFormState) {
  return {
    ...form,
    audienceId: form.audienceId || null,
    storeIds: form.storeId ? [form.storeId] : [],
    ownerUserId: form.ownerUserId || null,
    periodFrom: form.periodFrom || null,
    periodTo: form.periodTo || null,
    dueAt: form.dueAt || null,
    budget: form.budget || null,
    name: form.name || null,
    note: form.note || null,
  };
}

async function readError(response: Response) {
  try {
    const data = (await response.json()) as { message?: string };
    return data.message ?? "Не удалось сохранить кампанию";
  } catch {
    return "Не удалось сохранить кампанию";
  }
}

function goalLabel(goal: MarketingCampaignGoal) {
  return goalOptions.find((option) => option.value === goal)?.label ?? goal;
}

function formatDate(value: string | null) {
  if (!value) {
    return "не задан";
  }

  return new Intl.DateTimeFormat("ru-RU").format(new Date(value));
}

function formatRubles(value: number | null) {
  if (value === null) {
    return "не задан";
  }

  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(
    value,
  )} руб`;
}

function storeLabel(storeIds: string[], stores: Store[]) {
  if (storeIds.length === 0) {
    return "Вся сеть";
  }

  const names = storeIds
    .map((id) => stores.find((store) => store.id === id)?.name)
    .filter((name): name is string => Boolean(name));

  return names.length > 0 ? names.join(", ") : `${storeIds.length} клуб`;
}

const fieldClassName =
  "min-h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-950 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white";

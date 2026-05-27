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

type PromoMechanicTemplate = {
  id: string;
  title: string;
  goal: MarketingCampaignGoal;
  mechanic: string;
  channel: string;
  name: string;
  budget: string;
  description: string;
  tradeoff: string;
  note: string;
};

type PromoBundleDraft = {
  gamePrice: string;
  barPrice: string;
  servicePrice: string;
  discount: string;
  cost: string;
  expectedUses: string;
  minSpend: string;
  validityDays: string;
  onePerGuest: boolean;
  requiresApproval: boolean;
  noStacking: boolean;
};

type PromoBundleEconomics = {
  basePrice: number;
  promoPrice: number;
  expectedUses: number;
  revenue: number;
  cost: number;
  margin: number;
  marginPercent: number | null;
  discountBudget: number;
};

type PromoBundleVerdict = {
  tone: "ready" | "warning" | "blocked";
  title: string;
  description: string;
  checks: string[];
};

type CampaignStatusFilter = "ALL" | "ACTIVE" | MarketingCampaignStatus;

type CampaignReadinessItem = {
  label: string;
  done: boolean;
  issue: string;
};

type CampaignReadiness = {
  done: number;
  total: number;
  percent: number;
  tone: "ready" | "warning" | "blocked";
  firstIssue: string | null;
  items: CampaignReadinessItem[];
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

const campaignStatusFilters: Array<{
  value: CampaignStatusFilter;
  label: string;
}> = [
  { value: "ALL", label: "Все" },
  { value: "ACTIVE", label: "Активные" },
  { value: "DRAFT", label: "Черновики" },
  { value: "PLANNED", label: "План" },
  { value: "RUNNING", label: "В работе" },
  { value: "FINISHED", label: "Завершены" },
  { value: "CANCELED", label: "Отменены" },
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

const promoMechanicTemplates: PromoMechanicTemplate[] = [
  {
    id: "second-visit",
    title: "Второй визит",
    goal: "REPEAT_VISIT",
    mechanic: "Персональное предложение",
    channel: "CRM-задача",
    name: "Вернуть новых гостей на второй визит",
    budget: "0",
    description: "Для новых гостей, которые еще не сформировали привычку.",
    tradeoff:
      "Поднимает retention, но важно не давать скидку тем, кто и так вернется.",
    note:
      "Цель: второй визит. Оффер мягкий: персональный повод вернуться, без автоматического бонуса. Ограничения: один контакт на гостя, фиксировать исход и дату визита.",
  },
  {
    id: "weak-hours",
    title: "Тихие часы",
    goal: "WEAK_HOURS",
    mechanic: "Купон",
    channel: "Объявление в клубе",
    name: "Оффер на тихие часы",
    budget: "0",
    description: "Для времени, где есть свободная емкость ПК и зала.",
    tradeoff:
      "Может дать загрузку, но не должен каннибализировать пиковые часы.",
    note:
      "Цель: заполнить тихие часы. Правило: действует только в оговоренный период и клубы. Контроль: не применять в пиковые часы, фиксировать использования в CRM.",
  },
  {
    id: "bar-combo",
    title: "Бар-комбо",
    goal: "BAR_GROWTH",
    mechanic: "Промо-набор",
    channel: "CRM-задача",
    name: "Промо-набор для роста бара",
    budget: "0",
    description: "Для гостей с низкой долей бара и командных визитов.",
    tradeoff:
      "Важно проверить маржу: набор должен растить чек, а не раздавать скидку.",
    note:
      "Цель: рост бара. Предложить комбо: игровое время + бар/кальян/сервис. Ограничения: один набор на гостя, ручное подтверждение администратором, отслеживать бар и общую выручку.",
  },
  {
    id: "event",
    title: "Мероприятие",
    goal: "EVENT_PROMO",
    mechanic: "Событие",
    channel: "Мессенджер",
    name: "Привлечь гостей на мероприятие",
    budget: "0",
    description: "Для турниров, дней рождения, брони клуба и командных событий.",
    tradeoff:
      "Нужна ясная вместимость, ответственный и фиксация броней.",
    note:
      "Цель: мероприятие или бронь. Проверить дату, клуб, вместимость и канал. Контроль: каждый ответ гостя фиксировать в CRM, брони и отказы отдельно.",
  },
  {
    id: "birthday-booking",
    title: "День рождения / бронь",
    goal: "EVENT_PROMO",
    mechanic: "Персональное предложение",
    channel: "Звонок",
    name: "Лид на день рождения или бронь клуба",
    budget: "0",
    description: "Для ручных заявок, когда гостя еще нет в Langame или нужна бронь.",
    tradeoff:
      "Высокий чек, но нужна быстрая фиксация лида, ответственный и следующий контакт.",
    note:
      "Цель: день рождения, мероприятие или бронь клуба. Зафиксировать контакт, желаемую дату, клуб, количество гостей и следующий шаг. После регистрации в Langame сопоставить по телефону.",
  },
  {
    id: "tournament",
    title: "Турнир",
    goal: "WEAK_HOURS",
    mechanic: "Турнир",
    channel: "Соцсети",
    name: "Турнир для загрузки клуба",
    budget: "0",
    description: "Для слабых дней, клубов или часов с низкой загрузкой.",
    tradeoff:
      "Дает инфоповод и трафик, но требует лимита мест, правил участия и контроля бара.",
    note:
      "Цель: турнир и загрузка слабого периода. Указать клуб, дату, лимит мест, правила участия и ответственного. Контроль: регистрации, явка, игровая выручка, бар и повторные визиты.",
  },
  {
    id: "referral",
    title: "Приведи друга",
    goal: "REPEAT_VISIT",
    mechanic: "Реферальная механика",
    channel: "CRM-задача",
    name: "Реферальная механика для повторного визита",
    budget: "0",
    description: "Для активных гостей, которые могут привести нового игрока.",
    tradeoff:
      "Может привести новых гостей, но нужна ручная проверка, чтобы не раздать выгоду самому себе.",
    note:
      "Цель: повторный визит и новый гость через рекомендацию. Правило: выгода только после фактического визита приглашенного гостя. Контроль: телефон приглашенного, дата визита, клуб и ответственный.",
  },
  {
    id: "vip-top",
    title: "VIP / TOP гости",
    goal: "BAR_GROWTH",
    mechanic: "Персональное предложение",
    channel: "Мессенджер",
    name: "Персональный оффер для TOP гостей",
    budget: "0",
    description: "Для гостей с высоким оборотом, командных визитов и потенциала бара.",
    tradeoff:
      "Нужно не снижать маржу без причины: оффер должен развивать чек, бар или бронирование.",
    note:
      "Цель: развить TOP гостя. Предложить персональный повод: бронь, бар-комбо, турнир или командный визит. Контроль: контакт, ответ, визит, общий чек и бар.",
  },
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

const emptyBundleDraft: PromoBundleDraft = {
  gamePrice: "500",
  barPrice: "350",
  servicePrice: "0",
  discount: "150",
  cost: "220",
  expectedUses: "30",
  minSpend: "0",
  validityDays: "7",
  onePerGuest: true,
  requiresApproval: true,
  noStacking: true,
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
  const [selectedTemplateId, setSelectedTemplateId] = useState(
    promoMechanicTemplates[0]?.id ?? "",
  );
  const [bundleDraft, setBundleDraft] =
    useState<PromoBundleDraft>(emptyBundleDraft);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingTaskCampaignId, setPendingTaskCampaignId] = useState<
    string | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] =
    useState<CampaignStatusFilter>("ACTIVE");
  const selectedTemplate =
    promoMechanicTemplates.find((template) => template.id === selectedTemplateId) ??
    promoMechanicTemplates[0];
  const bundleEconomics = useMemo(
    () => buildPromoBundleEconomics(bundleDraft),
    [bundleDraft],
  );
  const bundleVerdict = useMemo(
    () => buildPromoBundleVerdict(bundleDraft, bundleEconomics),
    [bundleDraft, bundleEconomics],
  );

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
  const campaignCounts = useMemo(
    () =>
      Object.fromEntries(
        campaignStatusFilters.map((filter) => [
          filter.value,
          rows.filter((row) => campaignMatchesFilter(row, filter.value)).length,
        ]),
      ) as Record<CampaignStatusFilter, number>,
    [rows],
  );
  const visibleRows = useMemo(
    () => rows.filter((row) => campaignMatchesFilter(row, statusFilter)),
    [rows, statusFilter],
  );
  const selectedAudience =
    audiences.find((audience) => audience.id === form.audienceId) ?? null;

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

  function applyTemplate(template: PromoMechanicTemplate) {
    setForm((current) => ({
      ...current,
      goal: template.goal,
      name: template.name,
      channel: template.channel,
      mechanic: template.mechanic,
      budget: template.budget,
      note: template.note,
    }));
  }

  function applyBundleDraft() {
    const note = buildPromoBundleNote(bundleDraft, bundleEconomics);

    setForm((current) => ({
      ...current,
      goal: "PROMO_BUNDLE",
      name: "Промо-набор: игра + бар",
      channel: "CRM-задача",
      mechanic: "Промо-набор",
      budget: String(Math.round(bundleEconomics.discountBudget)),
      note,
    }));
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
    <section
      id="campaigns"
      className="mt-6 scroll-mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
    >
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

      <PromoMechanicsBuilder
        selectedTemplate={selectedTemplate}
        selectedTemplateId={selectedTemplateId}
        bundleDraft={bundleDraft}
        bundleEconomics={bundleEconomics}
        bundleVerdict={bundleVerdict}
        onSelectTemplate={setSelectedTemplateId}
        onApplyTemplate={applyTemplate}
        onBundleDraftChange={setBundleDraft}
        onApplyBundle={applyBundleDraft}
      />

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

        <CampaignGroupRoute
          selectedAudience={selectedAudience}
          audiencesCount={audiences.length}
        />

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

      <section className="border-t border-zinc-200 dark:border-zinc-800">
        <div className="grid gap-4 border-b border-zinc-200 p-4 dark:border-zinc-800 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-emerald-500">
              Рабочий список
            </p>
            <h3 className="mt-2 text-xl font-semibold text-zinc-950 dark:text-white">
              Кампании по статусам
            </h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
              На общем экране показываем только контрольные поля и следующий
              шаг. План, контакты, эффект и экспорт открываются в карточке
              кампании.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {campaignStatusFilters.map((filter) => {
              const isActive = statusFilter === filter.value;

              return (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => setStatusFilter(filter.value)}
                  className={[
                    "inline-flex min-h-10 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition",
                    isActive
                      ? "border-emerald-500 bg-emerald-500 text-zinc-950"
                      : "border-zinc-200 bg-white text-zinc-700 hover:border-emerald-400 hover:bg-emerald-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:border-emerald-500/70 dark:hover:bg-emerald-500/10",
                  ].join(" ")}
                >
                  <span>{filter.label}</span>
                  <span
                    className={[
                      "rounded-full px-2 py-0.5 text-xs",
                      isActive
                        ? "bg-zinc-950/10"
                        : "bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400",
                    ].join(" ")}
                  >
                    {campaignCounts[filter.value]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {rows.length === 0 ? (
            <div className="p-6 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
              Кампаний пока нет. Создайте первый черновик из цели, группы и
              канала, чтобы команда понимала, что запускать и как потом
              контролировать эффект.
            </div>
          ) : visibleRows.length > 0 ? (
            visibleRows.map((campaign) => {
              const readiness = buildCampaignReadiness(campaign);

              return (
                <article
                  key={campaign.id}
                  className="grid gap-4 p-4 transition hover:bg-zinc-50 dark:hover:bg-zinc-900/40 xl:grid-cols-[minmax(0,1fr)_320px]"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={campaignStatusClass(campaign.status)}>
                        {statusLabel(campaign.status)}
                      </span>
                      <span className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        {goalLabel(campaign.goal)}
                      </span>
                    </div>
                    <h4 className="mt-2 text-lg font-semibold text-zinc-950 dark:text-white">
                      {campaign.name}
                    </h4>
                    <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                      {campaignNextAction(campaign)}
                    </p>
                    <CampaignReadinessBar readiness={readiness} />
                    <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
                      <CompactInfo
                        label="Группа"
                        value={campaign.audience?.name ?? "не выбрана"}
                      />
                      <CompactInfo
                        label="Клуб"
                        value={storeLabel(campaign.storeIds, stores)}
                      />
                      <CompactInfo
                        label="Ответственный"
                        value={campaign.owner?.displayName ?? "не назначен"}
                      />
                      <CompactInfo
                        label="Дедлайн"
                        value={formatDate(campaign.dueAt)}
                      />
                      <CompactInfo
                        label="Канал"
                        value={campaign.channel ?? "не выбран"}
                      />
                      <CompactInfo
                        label="Механика"
                        value={campaign.mechanic ?? "не выбрана"}
                      />
                      <CompactInfo
                        label="Бюджет"
                        value={formatRubles(campaign.budget)}
                      />
                      <CompactInfo
                        label="Контакт"
                        value={contactCoverageLabel(campaign)}
                      />
                    </dl>
                  </div>

                  <div className="flex min-w-0 flex-col gap-2 xl:items-stretch">
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
                    <Link
                      href={`/marketing/campaigns/${campaign.id}`}
                      className="inline-flex min-h-10 items-center justify-center rounded-xl border border-zinc-200 px-4 text-sm font-semibold text-zinc-700 transition hover:border-emerald-400 hover:bg-emerald-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:border-emerald-500/70 dark:hover:bg-emerald-500/10"
                    >
                      Открыть кампанию
                    </Link>
                    {campaign.crmTask ? (
                      <Link
                        href="/guests/crm/tasks"
                        className="inline-flex min-h-10 items-center justify-center rounded-xl border border-emerald-500/40 px-4 text-sm font-semibold text-emerald-500 transition hover:bg-emerald-500/10"
                      >
                        Открыть CRM-задачу
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
              );
            })
          ) : (
            <div className="p-6 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
              В выбранном статусе кампаний нет. Можно переключить фильтр или
              создать новый черновик выше.
            </div>
          )}
        </div>
      </section>
    </section>
  );
}

function PromoMechanicsBuilder({
  selectedTemplate,
  selectedTemplateId,
  bundleDraft,
  bundleEconomics,
  bundleVerdict,
  onSelectTemplate,
  onApplyTemplate,
  onBundleDraftChange,
  onApplyBundle,
}: {
  selectedTemplate: PromoMechanicTemplate;
  selectedTemplateId: string;
  bundleDraft: PromoBundleDraft;
  bundleEconomics: PromoBundleEconomics;
  bundleVerdict: PromoBundleVerdict;
  onSelectTemplate: (id: string) => void;
  onApplyTemplate: (template: PromoMechanicTemplate) => void;
  onBundleDraftChange: (draft: PromoBundleDraft) => void;
  onApplyBundle: () => void;
}) {
  const bundleNotePreview = buildPromoBundleNote(bundleDraft, bundleEconomics);

  return (
    <section className="border-b border-zinc-200 p-4 dark:border-zinc-800">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(360px,1.05fr)]">
        <div
          id="mechanics"
          className="scroll-mt-6 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-500">
                Механики
              </p>
              <h3 className="mt-2 text-xl font-semibold text-zinc-950 dark:text-white">
                Быстрый сценарий
              </h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                Выберите тип промо, чтобы форма кампании заполнилась понятной
                целью, каналом, механикой и управленческой заметкой.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onApplyTemplate(selectedTemplate)}
              className="inline-flex min-h-10 items-center justify-center rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400"
            >
              Применить
            </button>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {promoMechanicTemplates.map((template) => {
              const isActive = template.id === selectedTemplateId;

              return (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => onSelectTemplate(template.id)}
                  className={`min-h-24 rounded-lg border p-3 text-left transition ${
                    isActive
                      ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10"
                      : "border-zinc-200 bg-white hover:border-emerald-400 dark:border-zinc-800 dark:bg-zinc-950"
                  }`}
                >
                  <span className="text-sm font-semibold text-zinc-950 dark:text-white">
                    {template.title}
                  </span>
                  <span className="mt-2 block text-xs leading-5 text-zinc-600 dark:text-zinc-400">
                    {template.description}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-sm font-semibold text-zinc-950 dark:text-white">
              {selectedTemplate.title}: {selectedTemplate.mechanic}
            </p>
            <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
              {selectedTemplate.tradeoff}
            </p>
          </div>
        </div>

        <div
          id="bundle"
          className="scroll-mt-6 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-500">
                Промо-набор
              </p>
              <h3 className="mt-2 text-xl font-semibold text-zinc-950 dark:text-white">
                Игра + бар + сервис
              </h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                Черновой расчет нужен не для бухгалтерии, а чтобы до запуска
                увидеть цену, скидку, маржу и бюджет механики.
              </p>
            </div>
            <button
              type="button"
              onClick={onApplyBundle}
              className="inline-flex min-h-10 items-center justify-center rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400"
            >
              Собрать кампанию
            </button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <NumericDraftField
              label="Игра, руб"
              value={bundleDraft.gamePrice}
              onChange={(value) =>
                onBundleDraftChange({ ...bundleDraft, gamePrice: value })
              }
            />
            <NumericDraftField
              label="Бар, руб"
              value={bundleDraft.barPrice}
              onChange={(value) =>
                onBundleDraftChange({ ...bundleDraft, barPrice: value })
              }
            />
            <NumericDraftField
              label="Сервис, руб"
              value={bundleDraft.servicePrice}
              onChange={(value) =>
                onBundleDraftChange({ ...bundleDraft, servicePrice: value })
              }
            />
            <NumericDraftField
              label="Скидка, руб"
              value={bundleDraft.discount}
              onChange={(value) =>
                onBundleDraftChange({ ...bundleDraft, discount: value })
              }
            />
            <NumericDraftField
              label="Себестоимость, руб"
              value={bundleDraft.cost}
              onChange={(value) =>
                onBundleDraftChange({ ...bundleDraft, cost: value })
              }
            />
            <NumericDraftField
              label="Лимит, шт"
              value={bundleDraft.expectedUses}
              onChange={(value) =>
                onBundleDraftChange({ ...bundleDraft, expectedUses: value })
              }
            />
            <NumericDraftField
              label="Мин. чек, руб"
              value={bundleDraft.minSpend}
              onChange={(value) =>
                onBundleDraftChange({ ...bundleDraft, minSpend: value })
              }
            />
            <NumericDraftField
              label="Срок, дней"
              value={bundleDraft.validityDays}
              onChange={(value) =>
                onBundleDraftChange({ ...bundleDraft, validityDays: value })
              }
            />
          </div>

          <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Лимиты и антифрод
            </p>
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              <ToggleDraftField
                label="Один на гостя"
                checked={bundleDraft.onePerGuest}
                onChange={(checked) =>
                  onBundleDraftChange({
                    ...bundleDraft,
                    onePerGuest: checked,
                  })
                }
              />
              <ToggleDraftField
                label="Ручное подтверждение"
                checked={bundleDraft.requiresApproval}
                onChange={(checked) =>
                  onBundleDraftChange({
                    ...bundleDraft,
                    requiresApproval: checked,
                  })
                }
              />
              <ToggleDraftField
                label="Не суммировать скидки"
                checked={bundleDraft.noStacking}
                onChange={(checked) =>
                  onBundleDraftChange({
                    ...bundleDraft,
                    noStacking: checked,
                  })
                }
              />
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-4">
            <PromoMetric
              label="Цена"
              value={formatRubles(bundleEconomics.promoPrice)}
            />
            <PromoMetric
              label="Выручка"
              value={formatRubles(bundleEconomics.revenue)}
            />
            <PromoMetric
              label="Маржа"
              value={
                bundleEconomics.marginPercent === null
                  ? "нет данных"
                  : `${formatPercent(bundleEconomics.marginPercent)}`
              }
            />
            <PromoMetric
              label="Бюджет"
              value={formatRubles(bundleEconomics.discountBudget)}
            />
            <PromoMetric
              label="Мин. чек"
              value={formatRubles(parseMoney(bundleDraft.minSpend))}
            />
            <PromoMetric
              label="Срок"
              value={`${formatNumber(Math.round(parseMoney(bundleDraft.validityDays)))} дн.`}
            />
          </div>

          <PromoBundleVerdictCard
            verdict={bundleVerdict}
            notePreview={bundleNotePreview}
          />
        </div>
      </div>
    </section>
  );
}

function NumericDraftField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </span>
      <input
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={fieldClassName}
      />
    </label>
  );
}

function ToggleDraftField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm font-semibold text-zinc-700 transition hover:border-emerald-400/70 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-emerald-500"
      />
    </label>
  );
}

function PromoMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold text-zinc-950 dark:text-white">
        {value}
      </p>
    </div>
  );
}

function PromoBundleVerdictCard({
  verdict,
  notePreview,
}: {
  verdict: PromoBundleVerdict;
  notePreview: string;
}) {
  const toneClass =
    verdict.tone === "ready"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : verdict.tone === "blocked"
        ? "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300"
        : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";

  return (
    <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Коммерческая проверка
          </p>
          <h4 className="mt-1 text-base font-semibold text-zinc-950 dark:text-white">
            {verdict.title}
          </h4>
          <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            {verdict.description}
          </p>
        </div>
        <span
          className={[
            "rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wide",
            toneClass,
          ].join(" ")}
        >
          {verdict.tone === "ready"
            ? "можно запускать"
            : verdict.tone === "blocked"
              ? "нужно исправить"
              : "проверить"}
        </span>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {verdict.checks.map((check) => (
          <div
            key={check}
            className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm leading-5 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
          >
            {check}
          </div>
        ))}
      </div>
      <details className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
        <summary className="cursor-pointer text-sm font-semibold text-zinc-950 dark:text-white">
          Что попадет в заметку кампании
        </summary>
        <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
          {notePreview}
        </p>
      </details>
    </div>
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

function CampaignGroupRoute({
  selectedAudience,
  audiencesCount,
}: {
  selectedAudience: GuestAudience | null;
  audiencesCount: number;
}) {
  return (
    <div className="grid gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/60 lg:col-span-12 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-wide text-emerald-500">
          Группа для кампании
        </p>
        <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
          {selectedAudience
            ? `Выбрана группа "${selectedAudience.name}" на ${formatNumber(
                selectedAudience.guestsCount,
              )} гостей. Контакты, согласия и эффект будут считаться по ней.`
            : audiencesCount > 0
              ? "Выберите сохраненную группу выше или создайте новую из фильтров гостей, чтобы кампания считала охват и согласия."
              : "Сохраненных групп пока нет. Сначала соберите группу из фильтров гостей, затем вернитесь к запуску кампании."}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link
          href="/guests/report#audiences"
          className="inline-flex min-h-10 items-center justify-center rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400"
        >
          Создать из фильтров
        </Link>
        <Link
          href="/guests/crm"
          className="inline-flex min-h-10 items-center justify-center rounded-xl border border-zinc-200 px-4 text-sm font-semibold text-zinc-700 transition hover:border-emerald-400 hover:bg-white dark:border-zinc-700 dark:text-zinc-200 dark:hover:border-emerald-500/70 dark:hover:bg-zinc-950"
        >
          Открыть CRM-группы
        </Link>
      </div>
    </div>
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

function CampaignReadinessBar({ readiness }: { readiness: CampaignReadiness }) {
  const barClass =
    readiness.tone === "ready"
      ? "bg-emerald-500"
      : readiness.tone === "blocked"
        ? "bg-red-400"
        : "bg-amber-400";

  return (
    <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Готовность: {readiness.done}/{readiness.total}
        </p>
        <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
          {readiness.firstIssue
            ? `Следующий шаг: ${readiness.firstIssue}`
            : "можно запускать и контролировать"}
        </p>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div
          className={["h-full rounded-full", barClass].join(" ")}
          style={{ width: `${readiness.percent}%` }}
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {readiness.items.map((item) => (
          <span
            key={item.label}
            className={[
              "rounded-full border px-2.5 py-1 text-xs font-semibold",
              item.done
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : "border-zinc-300 bg-white text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400",
            ].join(" ")}
          >
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function CompactInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
      <dt className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </dt>
      <dd className="mt-1 truncate font-semibold text-zinc-950 dark:text-white">
        {value}
      </dd>
    </div>
  );
}

function buildPromoBundleEconomics(
  draft: PromoBundleDraft,
): PromoBundleEconomics {
  const basePrice =
    parseMoney(draft.gamePrice) +
    parseMoney(draft.barPrice) +
    parseMoney(draft.servicePrice);
  const discount = parseMoney(draft.discount);
  const promoPrice = Math.max(0, basePrice - discount);
  const expectedUses = Math.max(0, Math.round(parseMoney(draft.expectedUses)));
  const revenue = promoPrice * expectedUses;
  const cost = parseMoney(draft.cost) * expectedUses;
  const margin = revenue - cost;
  const marginPercent = revenue > 0 ? (margin / revenue) * 100 : null;
  const discountBudget = discount * expectedUses;

  return {
    basePrice,
    promoPrice,
    expectedUses,
    revenue,
    cost,
    margin,
    marginPercent,
    discountBudget,
  };
}

function buildPromoBundleVerdict(
  draft: PromoBundleDraft,
  economics: PromoBundleEconomics,
): PromoBundleVerdict {
  const discount = parseMoney(draft.discount);
  const costPerUse = parseMoney(draft.cost);
  const minSpend = parseMoney(draft.minSpend);
  const validityDays = Math.round(parseMoney(draft.validityDays));
  const discountShare =
    economics.basePrice > 0 ? (discount / economics.basePrice) * 100 : 0;

  if (economics.basePrice <= 0 || economics.promoPrice <= 0) {
    return {
      tone: "blocked",
      title: "Набор пока нельзя запускать",
      description:
        "Заполните состав и цену набора, чтобы кампания не ушла в CRM с нулевой ценой.",
      checks: [
        "Добавьте стоимость игры, бара или сервиса.",
        "Промо-цена должна быть больше 0 руб.",
        "После правки нажмите «Собрать кампанию».",
      ],
    };
  }

  if (economics.expectedUses <= 0) {
    return {
      tone: "blocked",
      title: "Нужен лимит использований",
      description:
        "Без лимита нельзя оценить бюджет скидки и контролировать расход механики.",
      checks: [
        "Укажите лимит в штуках.",
        "Оставьте «один на гостя», если акция персональная.",
        "Для дорогих наборов включите ручное подтверждение.",
      ],
    };
  }

  if (economics.margin < 0) {
    return {
      tone: "blocked",
      title: "Риск убыточной акции",
      description:
        "Оценочная маржа отрицательная. Перед запуском нужно поднять цену, снизить скидку или пересмотреть состав.",
      checks: [
        `Маржа: ${formatRubles(economics.margin)}.`,
        `Скидочный бюджет: ${formatRubles(economics.discountBudget)}.`,
        "Запускать только после ручного согласования.",
      ],
    };
  }

  const checks = [
    `Оценочная выручка: ${formatRubles(economics.revenue)} при лимите ${formatNumber(
      economics.expectedUses,
    )} шт.`,
    costPerUse > 0
      ? `Маржа: ${formatRubles(economics.margin)}${
          economics.marginPercent === null
            ? ""
            : ` (${formatPercent(economics.marginPercent)})`
        }.`
      : "Себестоимость не задана: маржа выглядит завышенной.",
    minSpend > 0
      ? `Минимальный чек: ${formatRubles(minSpend)}.`
      : "Минимальный чек не задан: проверьте, не размоет ли акция средний чек.",
    validityDays > 0
      ? `Срок действия: ${formatNumber(validityDays)} дн.`
      : "Срок действия не задан: ограничьте период вручную.",
  ];

  if (costPerUse <= 0 || minSpend <= 0 || discountShare > 35) {
    return {
      tone: "warning",
      title: "Можно запускать после проверки условий",
      description:
        "Экономика не блокирует кампанию, но перед задачей в CRM нужно проверить себестоимость, минимальный чек и размер скидки.",
      checks,
    };
  }

  return {
    tone: "ready",
    title: "Набор готов к кампании",
    description:
      "Цена, лимит, срок, маржа и антифрод выглядят достаточно понятно для ручного запуска через CRM-задачу.",
    checks,
  };
}

function buildPromoBundleNote(
  draft: PromoBundleDraft,
  economics: PromoBundleEconomics,
) {
  return [
    "Цель: промо-набор для роста бара и среднего чека.",
    `Состав: игра ${formatRubles(parseMoney(draft.gamePrice))}, бар ${formatRubles(
      parseMoney(draft.barPrice),
    )}, сервис ${formatRubles(parseMoney(draft.servicePrice))}.`,
    `Цена набора: ${formatRubles(economics.promoPrice)} вместо ${formatRubles(
      economics.basePrice,
    )}. Скидка: ${formatRubles(parseMoney(draft.discount))}.`,
    `Лимит: ${formatNumber(economics.expectedUses)} использований. Оценка выручки: ${formatRubles(
      economics.revenue,
    )}; маржа: ${formatRubles(economics.margin)}${
      economics.marginPercent === null
        ? ""
        : ` (${formatPercent(economics.marginPercent)})`
    }.`,
    `Минимальный чек: ${formatRubles(
      parseMoney(draft.minSpend),
    )}. Срок действия: ${formatNumber(
      Math.round(parseMoney(draft.validityDays)),
    )} дней.`,
    `Ограничения: ${
      draft.onePerGuest ? "один набор на гостя" : "повторное использование разрешено"
    }, только выбранные клубы и период, ${
      draft.requiresApproval
        ? "ручное подтверждение администратором обязательно"
        : "без обязательного ручного подтверждения"
    }.`,
    `Антифрод: ${
      draft.noStacking
        ? "не суммировать с другими скидками"
        : "допускается суммирование только по ручному решению"
    }, фиксировать контакт и факт использования в CRM.`,
  ].join(" ");
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

function campaignMatchesFilter(
  campaign: MarketingCampaign,
  filter: CampaignStatusFilter,
) {
  if (filter === "ALL") {
    return true;
  }

  if (filter === "ACTIVE") {
    return campaign.status === "PLANNED" || campaign.status === "RUNNING";
  }

  return campaign.status === filter;
}

function goalLabel(goal: MarketingCampaignGoal) {
  return goalOptions.find((option) => option.value === goal)?.label ?? goal;
}

function statusLabel(status: MarketingCampaignStatus) {
  return statusOptions.find((option) => option.value === status)?.label ?? status;
}

function campaignStatusClass(status: MarketingCampaignStatus) {
  const base =
    "inline-flex rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide";

  if (status === "RUNNING") {
    return `${base} bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300`;
  }

  if (status === "PLANNED") {
    return `${base} bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300`;
  }

  if (status === "DRAFT") {
    return `${base} bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300`;
  }

  if (status === "FINISHED") {
    return `${base} bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300`;
  }

  return `${base} bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300`;
}

function campaignNextAction(campaign: MarketingCampaign) {
  if (!campaign.audience) {
    return "Сначала выберите группу гостей, иначе кампания не сможет посчитать охват и согласия.";
  }

  if (!campaign.owner) {
    return "Назначьте ответственного, чтобы контакт и контроль не зависли без владельца.";
  }

  if (!campaign.crmTask && campaign.status !== "FINISHED") {
    return "Создайте CRM-задачу, чтобы кампания превратилась из плана в действие.";
  }

  if (campaign.status === "DRAFT") {
    return "Проверьте механику, сроки и согласия, затем переведите кампанию в план.";
  }

  if (campaign.status === "PLANNED") {
    return "Кампания готова к запуску: проверьте канал, дедлайн и переведите в работу.";
  }

  if (campaign.status === "RUNNING") {
    return "Контролируйте контакты и фиксируйте результат, чтобы потом увидеть эффект.";
  }

  if (campaign.status === "FINISHED") {
    return "Откройте карточку кампании и проверьте эффект по визитам, выручке и бару.";
  }

  return "Кампания отменена. При необходимости верните ее в черновик или создайте новый сценарий.";
}

function buildCampaignReadiness(campaign: MarketingCampaign): CampaignReadiness {
  const coverage = campaign.consentCoverage;
  const hasGroup = Boolean(campaign.audience && coverage.targetTotal > 0);
  const hasChannel = Boolean(campaign.channel);
  const hasMechanic = Boolean(campaign.mechanic);
  const hasOwnerAndDue = Boolean(campaign.owner && campaign.dueAt);
  const hasContactAccess =
    hasGroup &&
    (!coverage.requiresPhoneConsent ||
      (coverage.contactable > 0 && coverage.targetTotal > 0));
  const items: CampaignReadinessItem[] = [
    {
      label: "Группа",
      done: hasGroup,
      issue: "выберите группу",
    },
    {
      label: "Канал",
      done: hasChannel,
      issue: "выберите канал",
    },
    {
      label: "Механика",
      done: hasMechanic,
      issue: "добавьте механику",
    },
    {
      label: "Контакт",
      done: hasContactAccess,
      issue:
        coverage.requiresPhoneConsent && coverage.exclusionReason
          ? `проверьте согласия: ${coverage.exclusionReason}`
          : "проверьте доступность контакта",
    },
    {
      label: "Ответственный",
      done: hasOwnerAndDue,
      issue: "назначьте ответственного и срок",
    },
    {
      label: "CRM-задача",
      done: Boolean(campaign.crmTask),
      issue: "создайте CRM-задачу",
    },
  ];
  const done = items.filter((item) => item.done).length;
  const firstIssue = items.find((item) => !item.done)?.issue ?? null;

  return {
    done,
    total: items.length,
    percent: Math.round((done / items.length) * 100),
    tone: !hasGroup || !hasContactAccess ? "blocked" : done === items.length ? "ready" : "warning",
    firstIssue,
    items,
  };
}

function contactCoverageLabel(campaign: MarketingCampaign) {
  const coverage = campaign.consentCoverage;
  const targetTotal = coverage?.targetTotal ?? 0;

  if (targetTotal <= 0) {
    return "нет группы";
  }

  if (!coverage.requiresPhoneConsent) {
    return `${targetTotal} гостей, без рассылки`;
  }

  if (coverage.excluded > 0) {
    return `${coverage.contactable} из ${targetTotal}, исключено ${coverage.excluded}`;
  }

  return `${coverage.contactable} из ${targetTotal}`;
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

function formatPercent(value: number) {
  return `${new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 1,
  }).format(value)}%`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 0,
  }).format(value);
}

function parseMoney(value: string) {
  const normalized = value.replace(",", ".").replace(/[^\d.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
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

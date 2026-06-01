import Link from "next/link";
import { notFound } from "next/navigation";
import { MarketingCampaignCrmTaskButton } from "@/components/marketing-campaign-crm-task-button";
import { MarketingCampaignContactForm } from "@/components/marketing-campaign-contact-form";
import { MarketingCampaignWorkspace } from "@/components/marketing-campaign-workspace";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { requireCurrentUser } from "@/lib/auth";
import {
  getGuestCrmContactEvents,
  getGuestCrmTasks,
  type GuestCrmContactEvent,
  type GuestCrmTask,
  type GuestCrmTaskStatus,
} from "@/lib/guests";
import {
  getMarketingCampaign,
  getMarketingCampaignEffect,
  type MarketingCampaign,
  type MarketingCampaignAudienceBreakdownRow,
  type MarketingCampaignEconomics,
  type MarketingCampaignEconomicsPaybackStatus,
  type MarketingCampaignExecutionBreakdownRow,
  type MarketingCampaignEffect,
  type MarketingCampaignEffectPeriod,
  type MarketingCampaignGoal,
  type MarketingCampaignRevenueAttribution,
  type MarketingCampaignStatus,
} from "@/lib/marketing";

type PageParams = Promise<{ id: string }>;
type PageSearchParams = Promise<Record<string, string | string[] | undefined>>;
type CampaignScenarioTab = "plan" | "launch" | "contacts" | "effect" | "export";

const campaignScenarioTabs: Array<{
  id: CampaignScenarioTab;
  label: string;
  description: string;
}> = [
  {
    id: "plan",
    label: "План",
    description: "цель, группа, согласия",
  },
  {
    id: "launch",
    label: "Запуск",
    description: "статус, чек-лист, инструкция",
  },
  {
    id: "contacts",
    label: "Контакты",
    description: "CRM-задача и журнал",
  },
  {
    id: "effect",
    label: "Эффект",
    description: "воронка, деньги, клубы",
  },
  {
    id: "export",
    label: "Экспорт",
    description: "CSV и XLSX",
  },
];

const goalLabels: Record<MarketingCampaignGoal, string> = {
  RETURN_GUESTS: "Вернуть гостей",
  REPEAT_VISIT: "Повторный визит",
  WEAK_HOURS: "Тихие часы",
  BAR_GROWTH: "Рост бара",
  EVENT_PROMO: "Событие или бронь",
  PROMO_BUNDLE: "Промо-набор",
};

const statusLabels: Record<MarketingCampaignStatus, string> = {
  DRAFT: "Черновик",
  PLANNED: "Запланирована",
  RUNNING: "В работе",
  FINISHED: "Завершена",
  CANCELED: "Отменена",
};

const taskStatusLabels: Record<GuestCrmTaskStatus, string> = {
  OPEN: "Новая",
  IN_PROGRESS: "В работе",
  DONE: "Готово",
  CANCELED: "Отменена",
};

async function safeList<T>(promise: Promise<T[]>): Promise<T[]> {
  try {
    return await promise;
  } catch {
    return [];
  }
}

export default async function MarketingCampaignPage({
  params,
  searchParams,
}: {
  params: PageParams;
  searchParams: PageSearchParams;
}) {
  await requireCurrentUser();
  const { id } = await params;
  const activeTab = resolveCampaignScenarioTab((await searchParams).tab);

  const [campaignResult, effectResult, tasksResult, contactEventsResult] =
    await Promise.allSettled([
      getMarketingCampaign(id),
      getMarketingCampaignEffect(id),
      safeList(getGuestCrmTasks()),
      safeList(getGuestCrmContactEvents()),
    ]);

  if (campaignResult.status === "rejected") {
    notFound();
  }

  const campaign = campaignResult.value;
  const effect = effectResult.status === "fulfilled" ? effectResult.value : null;
  const crmTasks = tasksResult.status === "fulfilled" ? tasksResult.value : [];
  const events =
    contactEventsResult.status === "fulfilled" ? contactEventsResult.value : [];
  const linkedTask = campaign.crmTask
    ? crmTasks.find((task) => task.id === campaign.crmTask?.id) ?? null
    : null;
  const campaignEvents = events
    .filter(
      (event) =>
        event.marketingCampaign?.id === campaign.id ||
        event.audience?.id === campaign.audience?.id,
    )
    .sort(
      (left, right) =>
        new Date(right.contactedAt).getTime() -
        new Date(left.contactedAt).getTime(),
    );

  return (
    <main className="px-4 py-6 text-zinc-950 dark:text-zinc-100 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-7xl">
        <ReportBreadcrumbs
          current={campaign.name}
          items={[
            { href: "/dashboard", label: "Дашборд" },
            { href: "/marketing", label: "Маркетинг" },
          ]}
        />

        <header className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <p className="text-sm font-semibold uppercase text-emerald-600 dark:text-emerald-300">
              Маркетинг
            </p>
            <h1 className="mt-2 max-w-4xl text-3xl font-semibold tracking-normal md:text-4xl">
              {campaign.name}
            </h1>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Карточка кампании соединяет цель, группу гостей, согласия,
              связанную CRM-задачу и историю контактов. Автоматических бонусов в
              Langame здесь нет: запуск пока контролируется через ручные задачи.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/marketing"
              className="inline-flex min-h-10 items-center justify-center rounded-md border border-zinc-300 px-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              Все кампании
            </Link>
            <Link
              href="/guests/crm/tasks"
              className="inline-flex min-h-10 items-center justify-center rounded-md bg-emerald-500 px-3 text-sm font-semibold text-zinc-950 hover:bg-emerald-400"
            >
              CRM-задачи
            </Link>
          </div>
        </header>

        <CampaignExecutiveSummary
          campaign={campaign}
          effect={effect}
          contactEvents={campaignEvents}
        />

        <CampaignScenarioTabs campaignId={campaign.id} activeTab={activeTab} />

        {activeTab === "plan" ? (
          <section
            id="plan"
            className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]"
          >
            <CampaignPlan campaign={campaign} />
            <ConsentCard campaign={campaign} />
          </section>
        ) : null}

        {activeTab === "launch" ? (
          <MarketingCampaignWorkspace campaign={campaign} effect={effect} />
        ) : null}

        {activeTab === "contacts" ? (
          <section
            id="contacts"
            className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]"
          >
            <CrmTaskCard campaign={campaign} linkedTask={linkedTask} />
            <ContactHistoryCard events={campaignEvents} campaign={campaign} />
          </section>
        ) : null}

        {activeTab === "effect" ? (
          <EffectAnalytics
            campaign={campaign}
            effect={effect}
            fallbackEvents={campaignEvents}
          />
        ) : null}

        {activeTab === "export" ? (
          <CampaignExportPanel campaign={campaign} />
        ) : null}
      </div>
    </main>
  );
}

function resolveCampaignScenarioTab(
  value: string | string[] | undefined,
): CampaignScenarioTab {
  const tab = Array.isArray(value) ? value[0] : value;
  return campaignScenarioTabs.some((item) => item.id === tab)
    ? (tab as CampaignScenarioTab)
    : "plan";
}

function CampaignScenarioTabs({
  campaignId,
  activeTab,
}: {
  campaignId: string;
  activeTab: CampaignScenarioTab;
}) {
  return (
    <nav
      aria-label="Сценарии кампании"
      className="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
    >
      <div className="border-b border-zinc-200 p-4 dark:border-zinc-800">
        <p className="text-xs font-bold uppercase tracking-wide text-emerald-500">
          Сценарии работы
        </p>
        <h2 className="mt-2 text-xl font-semibold">Откройте нужный шаг</h2>
        <p className="mt-1 max-w-4xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          Карточка кампании не показывает все данные сразу: сначала итог, затем
          один рабочий сценарий, который нужен сейчас.
        </p>
      </div>
      <div className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-5">
        {campaignScenarioTabs.map((tab) => {
          const isActive = tab.id === activeTab;

          return (
            <Link
              key={tab.id}
              href={`/marketing/campaigns/${encodeURIComponent(
                campaignId,
              )}?tab=${tab.id}#${tab.id}`}
              className={`rounded-lg border p-3 transition ${
                isActive
                  ? "border-emerald-500 bg-emerald-50 text-zinc-950 dark:bg-emerald-500/10 dark:text-white"
                  : "border-zinc-200 text-zinc-700 hover:border-emerald-400 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
              }`}
            >
              <span className="block text-sm font-semibold">{tab.label}</span>
              <span className="mt-1 block text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                {tab.description}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function CampaignExportPanel({ campaign }: { campaign: MarketingCampaign }) {
  const campaignId = encodeURIComponent(campaign.id);

  return (
    <section
      id="export"
      className="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
    >
      <div className="border-b border-zinc-200 p-5 dark:border-zinc-800">
        <p className="text-xs font-bold uppercase tracking-wide text-emerald-500">
          Экспорт
        </p>
        <h2 className="mt-2 text-2xl font-semibold">Выгрузка кампании</h2>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          Файл собирает план, воронку, before/after эффект, разбивку по клубам,
          исполнение по ответственным и каналам, а также результаты контактов.
          Онлайн и нераспределенные факты остаются отдельными строками, если их
          нельзя надежно привязать к клубу.
        </p>
      </div>
      <div className="grid gap-3 p-5 sm:grid-cols-2">
        <a
          href={`/api/marketing/campaigns/${campaignId}/export?format=csv`}
          className="rounded-lg border border-zinc-200 p-4 transition hover:border-emerald-400 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
        >
          <span className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            CSV
          </span>
          <span className="mt-2 block text-xl font-semibold">
            Скачать для таблиц
          </span>
          <span className="mt-2 block text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            Удобно для проверки строк, загрузки в BI и быстрой сверки.
          </span>
        </a>
        <a
          href={`/api/marketing/campaigns/${campaignId}/export?format=xlsx`}
          className="rounded-lg border border-zinc-200 p-4 transition hover:border-emerald-400 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
        >
          <span className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            XLSX
          </span>
          <span className="mt-2 block text-xl font-semibold">
            Скачать для Excel
          </span>
          <span className="mt-2 block text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            Готовая книга с теми же проверенными колонками, что и CSV.
          </span>
        </a>
      </div>
    </section>
  );
}

function CampaignExecutiveSummary({
  campaign,
  effect,
  contactEvents,
}: {
  campaign: MarketingCampaign;
  effect: MarketingCampaignEffect | null;
  contactEvents: GuestCrmContactEvent[];
}) {
  const summary = buildCampaignDecision(campaign, effect, contactEvents);
  const metrics = buildCampaignSummaryMetrics(campaign, effect, contactEvents);

  return (
    <section className="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.42fr)]">
        <div className="p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-emerald-500">
            Итог кампании
          </p>
          <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="max-w-4xl text-2xl font-semibold">
                {summary.title}
              </h2>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                {summary.description}
              </p>
            </div>
            <span className={summaryBadgeClass(summary.tone)}>
              {summary.badge}
            </span>
          </div>
        </div>

        <div className="border-t border-zinc-200 bg-zinc-50 p-5 dark:border-zinc-800 dark:bg-zinc-900/60 lg:border-l lg:border-t-0">
          <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Следующий шаг
          </p>
          <p className="mt-2 text-sm leading-6 text-zinc-700 dark:text-zinc-200">
            {summary.nextStep}
          </p>
          <a
            href={summary.href}
            className="mt-4 inline-flex min-h-10 w-full items-center justify-center rounded-md bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 sm:w-auto"
          >
            {summary.action}
          </a>
        </div>
      </div>

      <div className="grid gap-px border-t border-zinc-200 bg-zinc-200 dark:border-zinc-800 dark:bg-zinc-800 sm:grid-cols-2 xl:grid-cols-6">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="min-h-32 bg-white p-4 dark:bg-zinc-950"
          >
            <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              {metric.label}
            </p>
            <p className="mt-2 text-2xl font-semibold">{metric.value}</p>
            <p className="mt-2 text-sm leading-5 text-zinc-600 dark:text-zinc-400">
              {metric.hint}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function CampaignPlan({ campaign }: { campaign: MarketingCampaign }) {
  const details = [
    { label: "Цель", value: goalLabels[campaign.goal] },
    { label: "Статус", value: statusLabels[campaign.status] },
    { label: "Группа", value: campaign.audience?.name ?? "не выбрана" },
    { label: "Канал", value: campaign.channel ?? "не выбран" },
    { label: "Механика", value: campaign.mechanic ?? "не выбрана" },
    { label: "Сценарий", value: campaignMechanicConfigLabel(campaign) },
    { label: "Ответственный", value: campaign.owner?.displayName ?? "не назначен" },
    { label: "Период", value: periodLabel(campaign.periodFrom, campaign.periodTo) },
    { label: "Срок", value: formatDate(campaign.dueAt) },
    { label: "Бюджет", value: formatRubles(campaign.budget) },
    {
      label: "Клубы",
      value:
        campaign.storeIds.length > 0
          ? `${campaign.storeIds.length} клуб.`
          : "вся сеть",
    },
  ];

  return (
    <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="border-b border-zinc-200 p-5 dark:border-zinc-800">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-500">
              План запуска
            </p>
            <h2 className="mt-2 text-2xl font-semibold">Что запускаем</h2>
          </div>
          <span className={campaignStatusClass(campaign.status)}>
            {statusLabels[campaign.status]}
          </span>
        </div>
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-2">
        {details.map((item) => (
          <div
            key={item.label}
            className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/60"
          >
            <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              {item.label}
            </p>
            <p className="mt-1 min-h-6 text-sm font-semibold text-zinc-950 dark:text-white">
              {item.value}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function campaignMechanicConfigLabel(campaign: MarketingCampaign) {
  const config = campaign.mechanicConfig;

  if (!config) {
    return "текстовая заметка";
  }

  if (config.kind === "promo_bundle") {
    return "структурный промо-набор";
  }

  if (config.kind === "template" && typeof config.title === "string") {
    return config.title;
  }

  return "структурная механика";
}

function ConsentCard({ campaign }: { campaign: MarketingCampaign }) {
  const coverage = campaign.consentCoverage;
  const targetTotal = coverage.targetTotal;
  const contactable = coverage.contactable;
  const percent =
    targetTotal > 0 ? Math.round((contactable / targetTotal) * 100) : 0;
  const modeLabel = coverage.requiresPhoneConsent
    ? "Требуется согласие"
    : "Без телефонного ограничения";
  const availableLabel = coverage.requiresPhoneConsent
    ? `доступно из ${formatNumber(targetTotal)} гостей`
    : `доступна вся группа: ${formatNumber(targetTotal)} гостей`;

  return (
    <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="border-b border-zinc-200 p-5 dark:border-zinc-800">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-500">
              Согласия
            </p>
            <h2 className="mt-2 text-2xl font-semibold">
              Кого можно контактировать
            </h2>
            <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Проверка зависит от выбранного канала: звонок, сообщение и
              CRM-контакт требуют разрешения, а объявление в клубе или
              публичный пост не используют персональную рассылку.
            </p>
          </div>
          <span
            className={
              coverage.requiresPhoneConsent
                ? "rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-700 dark:border-amber-500/50 dark:bg-amber-500/10 dark:text-amber-200"
                : "rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-emerald-700 dark:border-emerald-500/50 dark:bg-emerald-500/10 dark:text-emerald-200"
            }
          >
            {modeLabel}
          </span>
        </div>
      </div>
      <div className="p-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
          <div>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-4xl font-semibold text-emerald-500">
                  {formatNumber(contactable)}
                </p>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  {availableLabel}
                </p>
              </div>
              <p className="text-2xl font-semibold">{percent}%</p>
            </div>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
              <div
                className="h-full rounded-full bg-emerald-500"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
            <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Правило канала
            </p>
            <p className="mt-2 text-sm font-semibold text-zinc-950 dark:text-white">
              {coverage.channelLabel}
            </p>
            <p className="mt-1 text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              {coverage.requiredConsent}
            </p>
            <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
              {coverage.contactRule}
            </p>
            {coverage.exclusionReason ? (
              <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-800 dark:border-amber-500/50 dark:bg-amber-500/10 dark:text-amber-100">
                Исключаем: {coverage.exclusionReason}.
              </p>
            ) : null}
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <SmallMetric label="Разрешено" value={coverage.phoneGranted} />
          <SmallMetric label="Отказ" value={coverage.phoneDenied} />
          <SmallMetric label="Отписка" value={coverage.phoneUnsubscribed} />
          <SmallMetric label="Неизвестно" value={coverage.phoneUnknown} />
          <SmallMetric label="Исключено" value={coverage.excluded} />
        </div>
      </div>
    </section>
  );
}

function CrmTaskCard({
  campaign,
  linkedTask,
}: {
  campaign: MarketingCampaign;
  linkedTask: GuestCrmTask | null;
}) {
  const task = linkedTask ?? campaign.crmTask;
  const taskStatus = linkedTask?.status ?? normalizeTaskStatus(campaign.crmTask?.status);

  return (
    <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="border-b border-zinc-200 p-5 dark:border-zinc-800">
        <p className="text-xs font-bold uppercase tracking-wide text-emerald-500">
          Исполнение
        </p>
        <h2 className="mt-2 text-2xl font-semibold">Связанная CRM-задача</h2>
      </div>
      <div className="p-5">
        {task ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">
                  {task.title ?? campaign.crmTask?.title}
                </h3>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  Ответственный:{" "}
                  {linkedTask?.assignedToUser?.displayName ??
                    campaign.owner?.displayName ??
                  "не назначен"}
                </p>
              </div>
              <span className={taskStatusClass(taskStatus)}>
                {taskStatus ? taskStatusLabels[taskStatus] : campaign.crmTask?.status}
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <SmallTextMetric label="Срок" value={formatDate(task.dueAt)} />
              <SmallTextMetric
                label="Цель"
                value={
                  linkedTask?.audience?.name ??
                  linkedTask?.lead?.displayName ??
                  linkedTask?.guest?.displayName ??
                  campaign.audience?.name ??
                  "не указана"
                }
              />
            </div>
            {linkedTask?.description ? (
              <p className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm leading-6 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-300">
                {linkedTask.description}
              </p>
            ) : null}
            <Link
              href="/guests/crm/tasks"
              className="inline-flex min-h-10 items-center justify-center rounded-md bg-emerald-500 px-3 text-sm font-semibold text-zinc-950 hover:bg-emerald-400"
            >
              Открыть CRM-задачи
            </Link>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-zinc-300 p-5 text-sm leading-6 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">
            <p>
              CRM-задача еще не создана. Создайте ее здесь, чтобы связать
              кампанию с планом контакта, ответственным и сроком.
            </p>
            <MarketingCampaignCrmTaskButton
              campaignId={campaign.id}
              className="mt-4 inline-flex min-h-10 items-center justify-center rounded-md bg-emerald-500 px-3 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:cursor-wait disabled:opacity-70"
            />
          </div>
        )}
      </div>
    </section>
  );
}

function ContactHistoryCard({
  events,
  campaign,
}: {
  events: GuestCrmContactEvent[];
  campaign: MarketingCampaign;
}) {
  const latest = events.slice(0, 6);

  return (
    <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="border-b border-zinc-200 p-5 dark:border-zinc-800">
        <p className="text-xs font-bold uppercase tracking-wide text-emerald-500">
          Контакты
        </p>
        <h2 className="mt-2 text-2xl font-semibold">История контактов</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          Показываем контакты, сохраненные прямо в кампанию, и более старые
          контакты по группе{" "}
          <span className="font-semibold text-zinc-950 dark:text-white">
            {campaign.audience?.name ?? "без группы"}
          </span>
          .
        </p>
      </div>
      <MarketingCampaignContactForm
        campaignId={campaign.id}
        audienceName={campaign.audience?.name ?? null}
      />
      <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
        {latest.length > 0 ? (
          latest.map((event) => (
            <div key={event.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">
                    {event.guest?.displayName ??
                      event.lead?.displayName ??
                      event.audience?.name ??
                      "Контакт"}
                  </p>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                    {event.channel}
                    {event.result ? ` · ${event.result}` : ""}
                  </p>
                </div>
                <p className="text-sm text-zinc-500">
                  {formatDateTime(event.contactedAt)}
                </p>
              </div>
              {event.note ? (
                <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                  {event.note}
                </p>
              ) : null}
            </div>
          ))
        ) : (
          <div className="p-5 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            По этой группе пока нет сохраненных контактов. После выполнения
            CRM-задач здесь появится журнал результатов.
          </div>
        )}
      </div>
    </section>
  );
}

function EffectAnalytics({
  campaign,
  effect,
  fallbackEvents,
}: {
  campaign: MarketingCampaign;
  effect: MarketingCampaignEffect | null;
  fallbackEvents: GuestCrmContactEvent[];
}) {
  if (!effect) {
    return (
      <section
        id="effect"
        className="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
      >
        <div className="border-b border-zinc-200 p-5 dark:border-zinc-800">
          <p className="text-xs font-bold uppercase tracking-wide text-emerald-500">
            Эффект
          </p>
          <h2 className="mt-2 text-2xl font-semibold">
            Замер эффекта временно недоступен
          </h2>
          <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            Кампания видит {formatNumber(fallbackEvents.length)} контактов по
            группе, но backend-расчет before/after пока не вернул данные.
          </p>
        </div>
      </section>
    );
  }

  const revenueAttribution = campaignRevenueAttribution(effect);
  const economics = campaignEconomics(effect, campaign);
  const effectCards = [
    {
      label: "Контакты",
      value: `${formatNumber(effect.after.contacts)} шт`,
      delta: effect.delta.contacts,
      text: `${formatNumber(effect.after.directContacts)} прямо привязано к кампании`,
    },
    {
      label: "Посетили",
      value: `${formatNumber(effect.after.activeGuests)} гостей`,
      delta: effect.delta.activeGuests,
      text: `${formatNumber(effect.after.sessionsCount)} сессий в окне после`,
    },
    {
      label: "Выручка",
      value: formatRubles(revenueAttribution.after.attributedRevenue),
      delta: revenueAttribution.delta.attributedRevenue,
      text: `по клубам ${formatRubles(
        revenueAttribution.after.storeScopedRevenue,
      )}, онлайн-пополнения вне эффекта`,
    },
    {
      label: "Игровые часы",
      value: `${formatNumber(effect.after.playHours)} ч`,
      delta: effect.delta.playHours,
      text: `${formatNumber(effect.after.barSalesCount)} покупок бара`,
    },
  ];

  return (
    <section
      id="effect"
      className="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
    >
      <div className="border-b border-zinc-200 p-5 dark:border-zinc-800">
        <p className="text-xs font-bold uppercase tracking-wide text-emerald-500">
          Эффект
        </p>
        <h2 className="mt-2 text-2xl font-semibold">
          Before/after по целевой группе
        </h2>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          Сравниваем одинаковые окна до и после запуска для гостей из группы.
          Для кампании{" "}
          <span className="font-semibold text-zinc-950 dark:text-white">
            {campaign.name}
          </span>{" "}
          окно после: {formatDate(effect.after.from)} -{" "}
          {formatDate(effect.after.to)}.
        </p>
      </div>

      <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        {effectCards.map((card) => (
          <div
            key={card.label}
            className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60"
          >
            <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              {card.label}
            </p>
            <p className="mt-2 min-h-8 text-2xl font-semibold">{card.value}</p>
            <p className={deltaClassName(card.delta)}>
              {formatDelta(card.delta)}
            </p>
            <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
              {card.text}
            </p>
          </div>
        ))}
      </div>

      <CampaignRevenueAttributionCard attribution={revenueAttribution} />
      <CampaignEconomicsCard economics={economics} />
      <CampaignFunnelCard campaign={campaign} effect={effect} />
      <CampaignAudienceBreakdownCard effect={effect} />
      <CampaignStoreBreakdownCard
        effect={effect}
        attribution={revenueAttribution}
      />
      <CampaignExecutionBreakdownCard effect={effect} />

      <div className="grid gap-3 border-t border-zinc-200 p-4 dark:border-zinc-800 lg:grid-cols-2">
        <EffectPeriodTable title="До кампании" period={effect.before} />
        <EffectPeriodTable title="После кампании" period={effect.after} />
      </div>

      <div className="border-t border-zinc-200 p-4 text-sm leading-6 text-zinc-600 dark:border-zinc-800 dark:text-zinc-300">
        <p className="font-semibold text-zinc-950 dark:text-white">
          Качество атрибуции
        </p>
        <p className="mt-1">
          Целевая группа: {formatNumber(effect.targetTotal)} гостей, связано с
          Langame ID: {formatNumber(effect.linkedTargetGuests)}, без связи:{" "}
          {formatNumber(effect.unlinkedTargetMembers)}.
        </p>
        <ul className="mt-2 list-inside list-disc space-y-1">
          {effect.dataQuality.limitations.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function CampaignRevenueAttributionCard({
  attribution,
}: {
  attribution: MarketingCampaignRevenueAttribution;
}) {
  const rows = [
    {
      label: "В эффекте кампании",
      value: attribution.after.attributedRevenue,
      delta: attribution.delta.attributedRevenue,
      text: "целевые гости, игровые списания и бар",
    },
    {
      label: "По клубам",
      value: attribution.after.storeScopedRevenue,
      delta: attribution.delta.storeScopedRevenue,
      text: "факты с понятным клубом",
    },
    {
      label: "Факты без клуба",
      value: attribution.after.unallocatedFactRevenue,
      delta: attribution.delta.unallocatedFactRevenue,
      text: "учтены в эффекте, но не в клубной строке",
    },
    {
      label: "Онлайн-пополнения",
      value: attribution.after.excludedOnlineTopupRevenue,
      delta: attribution.delta.excludedOnlineTopupRevenue,
      text: "показаны отдельно, не засчитываются кампании",
    },
  ];

  return (
    <div className="border-t border-zinc-200 p-4 dark:border-zinc-800">
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-500">
              Атрибуция выручки
            </p>
            <h3 className="mt-2 text-xl font-semibold">
              Что попадает в эффект кампании
            </h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Выручка кампании считается только по фактам целевых гостей.
              Онлайн-пополнения без клуба и связанного гостя вынесены отдельно,
              чтобы не смешивать сетевую кассу с эффектом конкретной кампании.
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {rows.map((row) => (
            <div
              key={row.label}
              className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                {row.label}
              </p>
              <p className="mt-2 text-xl font-semibold">
                {formatRubles(row.value)}
              </p>
              <p className={deltaClassName(row.delta)}>
                {formatSignedRubles(row.delta)}
              </p>
              <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                {row.text}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CampaignEconomicsCard({
  economics,
}: {
  economics: MarketingCampaignEconomics;
}) {
  const primaryRows = [
    {
      label: "Бюджет",
      value: formatRubles(economics.budget),
      hint: "из карточки кампании",
    },
    {
      label: "Прирост выручки",
      value: formatSignedRubles(economics.attributedRevenueDelta),
      hint: "атрибутированная дельта после/до",
    },
    {
      label: "ROI",
      value: formatSignedPercent(economics.roiPercent),
      hint:
        economics.revenuePerBudgetRub === null
          ? "нужен бюджет"
          : `${formatNumber(economics.revenuePerBudgetRub)} руб на 1 руб бюджета`,
    },
    {
      label: "Стоимость визита",
      value: formatRubles(economics.costPerVisit),
      hint: "бюджет / гости с визитом",
    },
  ];
  const detailRows = [
    ["Стоимость гостя в группе", formatRubles(economics.costPerTargetGuest)],
    ["Стоимость контакта", formatRubles(economics.costPerContact)],
    ["Стоимость результата", formatRubles(economics.costPerRespondedContact)],
    [
      "Прирост визитов",
      formatSignedNumber(economics.incrementalActiveGuests, "гостей"),
    ],
    [
      "Повторные гости",
      formatSignedNumber(economics.incrementalRepeatGuests, "гостей"),
    ],
    ["Прирост бара", formatSignedRubles(economics.incrementalBarRevenue)],
  ];

  return (
    <div className="border-t border-zinc-200 p-4 dark:border-zinc-800">
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-500">
              Экономика кампании
            </p>
            <h3 className="mt-2 text-xl font-semibold">
              Окупаемость и стоимость результата
            </h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Считаем бюджет против атрибутированного прироста выручки, а также
              стоимость контакта, результата и гостя, который пришел после
              запуска.
            </p>
          </div>
          <span className={campaignPaybackClass(economics.paybackStatus)}>
            {economics.paybackLabel}
          </span>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {primaryRows.map((row) => (
            <div
              key={row.label}
              className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                {row.label}
              </p>
              <p className="mt-2 text-xl font-semibold">{row.value}</p>
              <p className="mt-1 text-sm leading-5 text-zinc-600 dark:text-zinc-300">
                {row.hint}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.56fr)]">
          <dl className="grid gap-2 sm:grid-cols-2">
            {detailRows.map(([label, value]) => (
              <div
                key={label}
                className="flex items-center justify-between gap-3 rounded-md bg-white px-3 py-2 text-sm dark:bg-zinc-950"
              >
                <dt className="text-zinc-500 dark:text-zinc-400">{label}</dt>
                <dd className="font-semibold text-zinc-950 dark:text-white">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
          <div className="rounded-lg border border-zinc-200 bg-white p-3 text-sm leading-6 dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Решение
            </p>
            <p className="mt-2 text-zinc-700 dark:text-zinc-200">
              {economics.recommendation}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function CampaignAudienceBreakdownCard({
  effect,
}: {
  effect: MarketingCampaignEffect;
}) {
  const rows = effect.audienceBreakdown ?? [];
  const visibleRows = rows.slice(0, 5);
  const hiddenCount = Math.max(0, rows.length - visibleRows.length);
  const maxRevenue = Math.max(
    0,
    ...visibleRows.map((row) => row.metrics.totalRevenue),
  );

  return (
    <div className="border-t border-zinc-200 p-4 dark:border-zinc-800">
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-500">
              Источники группы
            </p>
            <h3 className="mt-2 text-xl font-semibold">
              Какая выборка дала эффект
            </h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Разделяем результат по сохраненной группе и правилу отбора: размер
              выборки, связь с Langame ID, контакты, визиты и выручка в окне
              после запуска.
            </p>
          </div>
          <p className="rounded-full border border-zinc-200 px-3 py-1 text-sm font-semibold text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            {formatNumber(rows.length)} источников
          </p>
        </div>

        {visibleRows.length > 0 ? (
          <div className="mt-4 space-y-3">
            {visibleRows.map((row) => (
              <CampaignAudienceBreakdownRowView
                key={row.key}
                row={row}
                maxRevenue={maxRevenue}
              />
            ))}
          </div>
        ) : (
          <p className="mt-4 rounded-lg border border-dashed border-zinc-300 p-4 text-sm leading-6 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">
            Для этой кампании пока нет сохраненной группы или связанных гостей,
            поэтому разрез по источнику появится после привязки выборки.
          </p>
        )}

        {hiddenCount > 0 ? (
          <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
            Еще {formatNumber(hiddenCount)} источников скрыто для компактности.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function CampaignAudienceBreakdownRowView({
  row,
  maxRevenue,
}: {
  row: MarketingCampaignAudienceBreakdownRow;
  maxRevenue: number;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.72fr)] lg:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-semibold">{row.label}</p>
              <p className="mt-1 text-sm leading-5 text-zinc-500 dark:text-zinc-400">
                {row.ruleLabel ?? row.hint ?? "Правило отбора не описано"}
              </p>
            </div>
            <p className="text-right text-lg font-semibold">
              {formatRubles(row.metrics.totalRevenue)}
            </p>
          </div>

          <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
            <div
              className="h-full rounded-full bg-emerald-500"
              style={{
                width: `${barWidth(
                  percentOf(row.metrics.totalRevenue, maxRevenue),
                )}%`,
              }}
            />
          </div>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            {formatNumber(row.linkedTargetGuests)} из{" "}
            {formatNumber(row.targetTotal)} гостей связаны с Langame ID
            {row.unlinkedTargetMembers > 0
              ? `, без связки ${formatNumber(row.unlinkedTargetMembers)}`
              : ""}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm">
          <AudienceBreakdownMetric
            label="Контакты"
            value={`${formatNumber(row.metrics.contacts)} шт`}
          />
          <AudienceBreakdownMetric
            label="Посетили"
            value={`${formatNumber(row.metrics.activeGuests)} гостей`}
          />
          <AudienceBreakdownMetric
            label="Повторные"
            value={`${formatNumber(row.metrics.repeatGuests)} гостей`}
          />
          <AudienceBreakdownMetric
            label="Бар"
            value={formatRubles(row.metrics.barRevenue)}
          />
        </div>
      </div>
    </div>
  );
}

function AudienceBreakdownMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md bg-zinc-50 p-2 dark:bg-zinc-900">
      <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}

function CampaignStoreBreakdownCard({
  effect,
  attribution,
}: {
  effect: MarketingCampaignEffect;
  attribution: MarketingCampaignRevenueAttribution;
}) {
  const rows = effect.storeBreakdown.slice(0, 6);
  const maxRevenue = Math.max(
    0,
    ...rows.map((row) => row.after.totalRevenue),
  );
  const hiddenCount = Math.max(0, effect.storeBreakdown.length - rows.length);

  return (
    <div className="border-t border-zinc-200 p-4 dark:border-zinc-800">
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-500">
              По клубам
            </p>
            <h3 className="mt-2 text-xl font-semibold">
              Где кампания дала эффект
            </h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Сравниваем клубы по фактам целевой группы в окне после запуска:
              выручка, бар, визиты и игровые часы. Нераспределенные факты
              вынесены отдельно, онлайн-пополнения без клуба в эти строки не
              попадают.
            </p>
          </div>
          <div className="text-right">
            <p className="rounded-full border border-zinc-200 px-3 py-1 text-sm font-semibold text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              {formatNumber(effect.storeBreakdown.length)} строк
            </p>
            <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              по клубам {formatRubles(attribution.after.storeScopedRevenue)}
            </p>
          </div>
        </div>

        {rows.length > 0 ? (
          <div className="mt-4 space-y-3">
            {rows.map((row) => (
              <div
                key={row.storeId ?? "unallocated"}
                className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950"
              >
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.7fr)] lg:items-center">
                  <div>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-semibold">{row.storeName}</p>
                      <p className="text-lg font-semibold">
                        {formatRubles(row.after.totalRevenue)}
                      </p>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{
                          width: `${barWidth(
                            percentOf(row.after.totalRevenue, maxRevenue),
                          )}%`,
                        }}
                      />
                    </div>
                    <p className={deltaClassName(row.delta.totalRevenue)}>
                      {formatSignedRubles(row.delta.totalRevenue)} к окну до
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <StoreBreakdownMetric
                      label="Гости"
                      value={`${formatNumber(row.after.activeGuests)} гостей`}
                    />
                    <StoreBreakdownMetric
                      label="Часы"
                      value={`${formatNumber(row.after.playHours)} ч`}
                    />
                    <StoreBreakdownMetric
                      label="Бар"
                      value={formatRubles(row.after.barRevenue)}
                    />
                    <StoreBreakdownMetric
                      label="Повторные"
                      value={`${formatNumber(row.after.repeatGuests)} гостей`}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 rounded-lg border border-dashed border-zinc-300 p-4 text-sm leading-6 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">
            По клубам пока нет фактов целевой группы в выбранном окне кампании.
            После контактов и визитов здесь появится сравнение клубов.
          </p>
        )}

        {hiddenCount > 0 ? (
          <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
            Показаны первые 6 строк по выручке. Еще {formatNumber(hiddenCount)}{" "}
            строк можно будет вынести в полный отчет.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function CampaignExecutionBreakdownCard({
  effect,
}: {
  effect: MarketingCampaignEffect;
}) {
  const execution = effect.executionBreakdown ?? {
    byResponsible: [],
    byChannel: [],
  };
  const hasRows =
    execution.byResponsible.length > 0 || execution.byChannel.length > 0;

  return (
    <div className="border-t border-zinc-200 p-4 dark:border-zinc-800">
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-500">
              Исполнение
            </p>
            <h3 className="mt-2 text-xl font-semibold">
              Кто и через какие каналы принес результат
            </h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Контакты сгруппированы по ответственному и каналу. Визиты и деньги
              показываем только там, где контакт связан с гостем или CRM-лидом,
              который уже сопоставлен с гостем Langame.
            </p>
          </div>
          <p className="rounded-full border border-zinc-200 px-3 py-1 text-sm font-semibold text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            {formatNumber(
              execution.byResponsible.length + execution.byChannel.length,
            )}{" "}
            срезов
          </p>
        </div>

        {hasRows ? (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <ExecutionBreakdownList
              title="По ответственным"
              rows={execution.byResponsible}
            />
            <ExecutionBreakdownList title="По каналам" rows={execution.byChannel} />
          </div>
        ) : (
          <p className="mt-4 rounded-lg border border-dashed border-zinc-300 p-4 text-sm leading-6 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">
            По кампании пока нет контактов в выбранном окне эффекта. Когда
            менеджеры начнут фиксировать касания, здесь появится сравнение по
            ответственным и каналам.
          </p>
        )}
      </div>
    </div>
  );
}

function ExecutionBreakdownList({
  title,
  rows,
}: {
  title: string;
  rows: MarketingCampaignExecutionBreakdownRow[];
}) {
  const visibleRows = rows.slice(0, 5);
  const hiddenCount = Math.max(0, rows.length - visibleRows.length);
  const maxContacts = Math.max(
    0,
    ...visibleRows.map((row) => row.metrics.contacts),
  );

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center justify-between gap-3">
        <h4 className="font-semibold">{title}</h4>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {formatNumber(rows.length)} строк
        </p>
      </div>

      {visibleRows.length > 0 ? (
        <div className="mt-3 space-y-3">
          {visibleRows.map((row) => (
            <div
              key={row.key}
              className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{row.label}</p>
                  {row.hint ? (
                    <p className="mt-1 truncate text-sm text-zinc-500 dark:text-zinc-400">
                      {row.hint}
                    </p>
                  ) : null}
                </div>
                <p className="text-right text-lg font-semibold">
                  {formatNumber(row.metrics.contacts)} контактов
                </p>
              </div>

              <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{
                    width: `${barWidth(
                      percentOf(row.metrics.contacts, maxContacts),
                    )}%`,
                  }}
                />
              </div>

              <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-zinc-500 dark:text-zinc-400">Результат</p>
                  <p className="font-semibold">
                    {formatNumber(row.metrics.respondedContacts)} с результатом
                  </p>
                </div>
                <div>
                  <p className="text-zinc-500 dark:text-zinc-400">Связано</p>
                  <p className="font-semibold">
                    {formatNumber(row.metrics.linkedGuests)} гостей
                  </p>
                </div>
                <div>
                  <p className="text-zinc-500 dark:text-zinc-400">Визиты</p>
                  <p className="font-semibold">
                    {formatNumber(row.metrics.activeGuests)} гостей,{" "}
                    {formatNumber(row.metrics.sessionsCount)} сессий
                  </p>
                </div>
                <div>
                  <p className="text-zinc-500 dark:text-zinc-400">Деньги</p>
                  <p className="font-semibold">
                    {formatRubles(row.metrics.totalRevenue)}, бар{" "}
                    {formatRubles(row.metrics.barRevenue)}
                  </p>
                </div>
              </div>

              {row.metrics.linkedGuests === 0 ? (
                <p className="mt-2 text-sm text-amber-600 dark:text-amber-300">
                  Визиты и деньги не атрибутированы: контакт пока не связан с
                  конкретным гостем.
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 rounded-lg border border-dashed border-zinc-300 p-3 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          Данных для этого среза пока нет.
        </p>
      )}

      {hiddenCount > 0 ? (
        <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
          Еще {formatNumber(hiddenCount)} строк скрыто для компактности.
        </p>
      ) : null}
    </div>
  );
}

function CampaignFunnelCard({
  campaign,
  effect,
}: {
  campaign: MarketingCampaign;
  effect: MarketingCampaignEffect;
}) {
  const funnel = effect.funnel;
  const taskStatus = normalizeTaskStatus(funnel.crmTask?.status);
  const taskLabel = funnel.crmTask
    ? `${taskStatus ? taskStatusLabels[taskStatus] : funnel.crmTask.status}, срок ${formatDate(
        funnel.crmTask.dueAt,
      )}`
    : "CRM-задача не создана";
  const responsible =
    funnel.responsibleUser?.displayName ??
    campaign.owner?.displayName ??
    "не назначен";
  const steps = [
    {
      label: "Группа",
      value: `${formatNumber(funnel.targetTotal)} гостей`,
      rate: 100,
      hint: `${formatNumber(funnel.linkedTargetGuests)} связаны с Langame ID`,
    },
    {
      label: "План контакта",
      value: `${formatNumber(funnel.contactableGuests)} гостей`,
      rate: percentOf(funnel.contactableGuests, funnel.targetTotal),
      hint: `${formatNumber(funnel.excludedGuests)} исключено по согласиям`,
    },
    {
      label: "Контакты",
      value: `${formatNumber(funnel.completedContacts)} шт`,
      rate: funnel.contactCompletionRate,
      hint: `${formatNumber(funnel.directCompletedContacts)} прямо в кампанию`,
    },
    {
      label: "С результатом",
      value: `${formatNumber(funnel.respondedContacts)} шт`,
      rate: funnel.responseRate,
      hint: "есть зафиксированный результат контакта",
    },
    {
      label: "Посетили",
      value: `${formatNumber(funnel.visitedGuests)} гостей`,
      rate: funnel.visitRate,
      hint: `${formatNumber(effect.after.sessionsCount)} сессий после запуска`,
    },
    {
      label: "Повторные",
      value: `${formatNumber(funnel.repeatGuests)} гостей`,
      rate: funnel.repeatRate,
      hint: `${formatRubles(funnel.revenue)}, бар ${formatRubles(
        funnel.barRevenue,
      )}`,
    },
  ];

  return (
    <div className="border-t border-zinc-200 p-4 dark:border-zinc-800">
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-start">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-500">
              Воронка
            </p>
            <h3 className="mt-2 text-xl font-semibold">
              От группы до повторного визита
            </h3>
            <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Смотрим, сколько гостей можно было контактировать, сколько
              контактов реально выполнено и дошло ли это до визитов, выручки и
              бара.
            </p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Ответственный
            </p>
            <p className="mt-1 font-semibold">{responsible}</p>
            <p className="mt-2 text-zinc-500 dark:text-zinc-400">{taskLabel}</p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {steps.map((step) => (
            <div
              key={step.label}
              className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    {step.label}
                  </p>
                  <p className="mt-1 text-lg font-semibold">{step.value}</p>
                </div>
                <p className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">
                  {formatPercent(step.rate)}
                </p>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{ width: `${barWidth(step.rate)}%` }}
                />
              </div>
              <p className="mt-2 min-h-10 text-sm leading-5 text-zinc-600 dark:text-zinc-300">
                {step.hint}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StoreBreakdownMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md bg-zinc-50 p-2 dark:bg-zinc-900">
      <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}

function campaignRevenueAttribution(
  effect: MarketingCampaignEffect,
): MarketingCampaignRevenueAttribution {
  if (effect.revenueAttribution) {
    return effect.revenueAttribution;
  }

  const before = fallbackRevenueAttributionPeriod(
    effect.before,
    effect.storeBreakdown,
    "before",
  );
  const after = fallbackRevenueAttributionPeriod(
    effect.after,
    effect.storeBreakdown,
    "after",
  );

  return {
    before,
    after,
    delta: {
      attributedRevenue: roundCurrency(
        after.attributedRevenue - before.attributedRevenue,
      ),
      storeScopedRevenue: roundCurrency(
        after.storeScopedRevenue - before.storeScopedRevenue,
      ),
      unallocatedFactRevenue: roundCurrency(
        after.unallocatedFactRevenue - before.unallocatedFactRevenue,
      ),
      excludedOnlineTopupRevenue: 0,
    },
  };
}

function campaignEconomics(
  effect: MarketingCampaignEffect,
  campaign: MarketingCampaign,
): MarketingCampaignEconomics {
  if (effect.economics) {
    return effect.economics;
  }

  const attribution = campaignRevenueAttribution(effect);
  const budget = campaign.budget !== null && campaign.budget > 0 ? campaign.budget : null;
  const attributedRevenueDelta = roundCurrency(
    attribution.delta.attributedRevenue,
  );
  const revenuePerBudgetRub =
    budget !== null ? roundCurrency(attributedRevenueDelta / budget) : null;
  const roiPercent =
    budget !== null
      ? Math.round(((attributedRevenueDelta - budget) / budget) * 1000) / 10
      : null;
  const { paybackStatus, paybackLabel } = campaignPaybackStatus(
    budget,
    attributedRevenueDelta,
  );
  const completedContacts = effect.funnel.completedContacts;
  const respondedContacts = effect.funnel.respondedContacts;
  const visitedGuests = effect.funnel.visitedGuests;

  return {
    budget,
    attributedRevenueAfter: roundCurrency(attribution.after.attributedRevenue),
    attributedRevenueDelta,
    incrementalRevenue: roundCurrency(effect.delta.totalRevenue),
    incrementalBarRevenue: roundCurrency(effect.delta.barRevenue),
    incrementalActiveGuests: roundCurrency(effect.delta.activeGuests),
    incrementalRepeatGuests: roundCurrency(effect.delta.repeatGuests),
    costPerTargetGuest: campaignCostPerResult(budget, effect.targetTotal),
    costPerContact: campaignCostPerResult(budget, completedContacts),
    costPerRespondedContact: campaignCostPerResult(budget, respondedContacts),
    costPerVisit: campaignCostPerResult(budget, visitedGuests),
    revenuePerBudgetRub,
    roiPercent,
    paybackStatus,
    paybackLabel,
    recommendation: campaignEconomicsRecommendation({
      budget,
      attributedRevenueDelta,
      completedContacts,
      visitedGuests,
      roiPercent,
      paybackStatus,
    }),
  };
}

function campaignCostPerResult(budget: number | null, denominator: number) {
  if (budget === null || denominator <= 0) {
    return null;
  }

  return roundCurrency(budget / denominator);
}

function campaignPaybackStatus(
  budget: number | null,
  attributedRevenueDelta: number,
): {
  paybackStatus: MarketingCampaignEconomicsPaybackStatus;
  paybackLabel: string;
} {
  if (budget === null) {
    return { paybackStatus: "NO_BUDGET", paybackLabel: "бюджет не задан" };
  }

  if (attributedRevenueDelta < 0) {
    return { paybackStatus: "LOSS", paybackLabel: "отрицательная дельта" };
  }

  if (attributedRevenueDelta === 0) {
    return {
      paybackStatus: "NO_REVENUE",
      paybackLabel: "нет денежного эффекта",
    };
  }

  if (attributedRevenueDelta >= budget) {
    return { paybackStatus: "PAID_OFF", paybackLabel: "окупилась" };
  }

  return { paybackStatus: "PARTIAL", paybackLabel: "частичная окупаемость" };
}

function campaignEconomicsRecommendation({
  budget,
  attributedRevenueDelta,
  completedContacts,
  visitedGuests,
  roiPercent,
  paybackStatus,
}: {
  budget: number | null;
  attributedRevenueDelta: number;
  completedContacts: number;
  visitedGuests: number;
  roiPercent: number | null;
  paybackStatus: MarketingCampaignEconomicsPaybackStatus;
}) {
  if (budget === null) {
    return "Укажите бюджет кампании, чтобы LeetPlus посчитал стоимость контакта, визита и ROI.";
  }

  if (completedContacts === 0) {
    return "Сначала доведите кампанию до контактов: без исполнения стоимость результата не считается.";
  }

  if (visitedGuests === 0) {
    return "Контакты уже есть, но визитов нет: проверьте оффер, скрипт и качество выбранной группы.";
  }

  if (paybackStatus === "PAID_OFF") {
    return `Кампания окупилась: зафиксируйте механику и повторите ее на похожей группе. ROI ${formatSignedPercent(
      roiPercent,
    )}.`;
  }

  if (paybackStatus === "PARTIAL") {
    return `Денежный эффект есть, но бюджет еще не окупился: дожмите контакты или сузьте группу. Учтено ${formatRubles(
      attributedRevenueDelta,
    )} прироста.`;
  }

  return "Окупаемость не подтверждена: разберите атрибуцию, сегмент и механику до повторного запуска.";
}

function fallbackRevenueAttributionPeriod(
  period: MarketingCampaignEffectPeriod,
  storeBreakdown: MarketingCampaignEffect["storeBreakdown"],
  key: "before" | "after",
) {
  const storeScopedRevenue = storeBreakdown.reduce((sum, row) => {
    if (!row.storeId) {
      return sum;
    }

    return sum + row[key].totalRevenue;
  }, 0);

  return {
    attributedRevenue: period.totalRevenue,
    storeScopedRevenue: roundCurrency(storeScopedRevenue),
    unallocatedFactRevenue: roundCurrency(
      Math.max(0, period.totalRevenue - storeScopedRevenue),
    ),
    excludedOnlineTopupRevenue: 0,
  };
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function EffectPeriodTable({
  title,
  period,
}: {
  title: string;
  period: MarketingCampaignEffectPeriod;
}) {
  const rows = [
    ["Контакты", `${formatNumber(period.contacts)} шт`],
    ["Посетили", `${formatNumber(period.activeGuests)} гостей`],
    ["Повторные", `${formatNumber(period.repeatGuests)} гостей`],
    ["Сессии", `${formatNumber(period.sessionsCount)} шт`],
    ["Часы", `${formatNumber(period.playHours)} ч`],
    ["Выручка", formatRubles(period.totalRevenue)],
    ["Бар", formatRubles(period.barRevenue)],
  ];

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">{title}</h3>
        <p className="text-sm text-zinc-500">
          {formatDate(period.from)} - {formatDate(period.to)}
        </p>
      </div>
      <dl className="mt-3 grid gap-2 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3 text-sm">
            <dt className="text-zinc-500 dark:text-zinc-400">{label}</dt>
            <dd className="font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function SmallMetric({ label, value }: { label: string; value: number }) {
  return <SmallTextMetric label={label} value={`${formatNumber(value)} гостей`} />;
}

function SmallTextMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
      <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function formatSignedNumber(value: number, unit: string) {
  if (value === 0) {
    return `0 ${unit}`;
  }

  const sign = value > 0 ? "+" : "";
  return `${sign}${formatNumber(value)} ${unit}`;
}

function formatRubles(value: number | null) {
  if (value === null) {
    return "не задан";
  }

  return `${formatNumber(Math.round(value))} руб`;
}

function formatSignedRubles(value: number) {
  if (value === 0) {
    return "0 руб";
  }

  const sign = value > 0 ? "+" : "";

  return `${sign}${formatNumber(Math.round(value))} руб`;
}

function formatDelta(value: number) {
  if (value === 0) {
    return "без изменений";
  }

  const sign = value > 0 ? "+" : "";
  return `${sign}${formatNumber(value)} к окну до`;
}

function percentOf(value: number, total: number) {
  if (total <= 0) {
    return null;
  }

  return Math.round((value / total) * 1000) / 10;
}

function formatPercent(value: number | null) {
  if (value === null) {
    return "нет базы";
  }

  return `${formatNumber(value)}%`;
}

function formatSignedPercent(value: number | null) {
  if (value === null) {
    return "нет базы";
  }

  const sign = value > 0 ? "+" : "";
  return `${sign}${formatNumber(value)}%`;
}

function barWidth(value: number | null) {
  if (value === null) {
    return 0;
  }

  return Math.max(0, Math.min(100, value));
}

function deltaClassName(value: number) {
  const base = "mt-1 text-sm font-semibold";

  if (value > 0) {
    return `${base} text-emerald-600 dark:text-emerald-300`;
  }

  if (value < 0) {
    return `${base} text-red-600 dark:text-red-300`;
  }

  return `${base} text-zinc-500 dark:text-zinc-400`;
}

function campaignPaybackClass(status: MarketingCampaignEconomicsPaybackStatus) {
  const base =
    "inline-flex rounded-full px-3 py-1 text-sm font-semibold uppercase";

  if (status === "PAID_OFF") {
    return `${base} bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200`;
  }

  if (status === "PARTIAL") {
    return `${base} bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-200`;
  }

  if (status === "LOSS" || status === "NO_REVENUE") {
    return `${base} bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200`;
  }

  return `${base} bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300`;
}

function formatDate(value: string | null) {
  if (!value) {
    return "не задана";
  }

  return new Intl.DateTimeFormat("ru-RU").format(new Date(value));
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "нет даты";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function periodLabel(from: string | null, to: string | null) {
  if (!from && !to) {
    return "не задан";
  }

  return `${formatDate(from)} - ${formatDate(to)}`;
}

function campaignStatusClass(status: MarketingCampaignStatus) {
  const base =
    "inline-flex rounded-full px-3 py-1 text-sm font-semibold uppercase";

  if (status === "RUNNING") {
    return `${base} bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200`;
  }

  if (status === "PLANNED") {
    return `${base} bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-200`;
  }

  if (status === "FINISHED") {
    return `${base} bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300`;
  }

  if (status === "CANCELED") {
    return `${base} bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-200`;
  }

  return `${base} bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200`;
}

function taskStatusClass(status: string | undefined | null) {
  const base =
    "inline-flex rounded-full px-3 py-1 text-sm font-semibold uppercase";

  if (status === "DONE") {
    return `${base} bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200`;
  }

  if (status === "IN_PROGRESS") {
    return `${base} bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-200`;
  }

  if (status === "CANCELED") {
    return `${base} bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300`;
  }

  return `${base} bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200`;
}

function normalizeTaskStatus(
  status: string | undefined | null,
): GuestCrmTaskStatus | null {
  if (
    status === "OPEN" ||
    status === "IN_PROGRESS" ||
    status === "DONE" ||
    status === "CANCELED"
  ) {
    return status;
  }

  return null;
}

type CampaignDecisionTone = "good" | "warning" | "danger" | "neutral";

type CampaignDecision = {
  tone: CampaignDecisionTone;
  badge: string;
  title: string;
  description: string;
  nextStep: string;
  action: string;
  href: string;
};

function buildCampaignDecision(
  campaign: MarketingCampaign,
  effect: MarketingCampaignEffect | null,
  contactEvents: GuestCrmContactEvent[],
): CampaignDecision {
  const coverage = campaign.consentCoverage;
  const funnel = effect?.funnel;
  const completedContacts = funnel?.completedContacts ?? contactEvents.length;
  const respondedContacts =
    funnel?.respondedContacts ??
    contactEvents.filter((event) => Boolean(event.result)).length;
  const visitedGuests = funnel?.visitedGuests ?? effect?.after.activeGuests ?? 0;
  const revenue = funnel?.revenue ?? effect?.after.totalRevenue ?? 0;
  const barRevenue = funnel?.barRevenue ?? effect?.after.barRevenue ?? 0;
  const contactCompletionRate =
    funnel?.contactCompletionRate ??
    percentOf(completedContacts, coverage.contactable);
  const visitRate =
    funnel?.visitRate ?? percentOf(visitedGuests, coverage.targetTotal);
  const barShare = revenue > 0 ? (barRevenue / revenue) * 100 : null;

  if (campaign.status === "CANCELED") {
    return {
      tone: "neutral" as const,
      badge: "остановлена",
      title: "Кампания остановлена",
      description:
        "Факты контактов и эффект сохранены, но новые действия по кампании сейчас не выполняются.",
      nextStep:
        "Если цель снова актуальна, верните кампанию в работу и продолжите фиксировать контакты.",
      action: "Открыть запуск",
      href: "?tab=launch#launch",
    };
  }

  if (!campaign.audience || coverage.targetTotal === 0) {
    return {
      tone: "warning" as const,
      badge: "нужна группа",
      title: "Сначала нужна группа гостей",
      description:
        "Без группы невозможно оценить охват, согласия, контактный план и эффект кампании.",
      nextStep:
        "Выберите сохраненную группу или создайте ее из отчета по гостям, затем вернитесь к запуску.",
      action: "Выбрать группу",
      href: "/guests/report#audiences",
    };
  }

  if (coverage.requiresPhoneConsent && coverage.contactable === 0) {
    return {
      tone: "danger" as const,
      badge: "нет контактов",
      title: "Контактировать группу нельзя",
      description:
        "В выбранной группе нет гостей с разрешенным контактом по текущему каналу. Массовый ручной запуск приведет к риску по согласиям.",
      nextStep:
        "Проверьте согласия, канал или соберите другую группу для кампании.",
      action: "Открыть CRM",
      href: "/guests/crm",
    };
  }

  if (!campaign.crmTask && campaign.status !== "DRAFT") {
    return {
      tone: "warning" as const,
      badge: "нет задачи",
      title: "Запуск не закреплен за исполнением",
      description:
        "Кампания уже вышла из черновика, но связанной CRM-задачи нет. Есть риск, что ответственный не увидит, что нужно делать.",
      nextStep:
        "Создайте CRM-задачу или назначьте ответственного и срок в рабочем запуске кампании.",
      action: "Открыть запуск",
      href: "?tab=launch#launch",
    };
  }

  if (completedContacts === 0) {
    return {
      tone: campaign.status === "DRAFT" ? "neutral" : "warning",
      badge: campaign.status === "DRAFT" ? "план" : "ждет исполнения",
      title:
        campaign.status === "DRAFT"
          ? "Кампания пока в подготовке"
          : "Контакты еще не начались",
      description: `Доступно для контакта ${formatNumber(
        coverage.contactable,
      )} из ${formatNumber(
        coverage.targetTotal,
      )} гостей. Эффект появится после первых зафиксированных контактов.`,
      nextStep:
        "Проверьте инструкцию исполнения, назначьте ответственного и начните фиксировать результаты контактов.",
      action: "Открыть запуск",
      href: "?tab=launch#launch",
    };
  }

  if (visitedGuests === 0) {
    return {
      tone: "warning" as const,
      badge: "нет визитов",
      title: "Контакты есть, но гости не пришли",
      description: `${formatNumber(
        completedContacts,
      )} контактов выполнено, результат зафиксирован у ${formatNumber(
        respondedContacts,
      )}. Визитов после запуска пока нет.`,
      nextStep:
        "Проверьте оффер, скрипт контакта и качество группы. Если ответов мало, сначала дожмите исполнение.",
      action: "Разобрать контакты",
      href: "?tab=contacts#contacts",
    };
  }

  if (revenue <= 0) {
    return {
      tone: "warning" as const,
      badge: "есть визиты",
      title: "Гости пришли, но выручка не проявилась",
      description: `${formatNumber(
        visitedGuests,
      )} гостей посетили клуб после контакта. Денежный эффект пока не связан с кампанией.`,
      nextStep:
        "Проверьте, есть ли у гостей сессии, барные покупки или списания баланса в окне эффекта.",
      action: "Открыть эффект",
      href: "?tab=effect#effect",
    };
  }

  if (barShare !== null && barShare < 15) {
    return {
      tone: "good" as const,
      badge: "есть эффект",
      title: "Кампания привела гостей и выручку",
      description: `${formatRubles(revenue)} выручки и ${formatNumber(
        visitedGuests,
      )} гостей после запуска. Доля бара низкая: ${formatPercent(barShare)}.`,
      nextStep:
        "Для следующей итерации добавьте барный оффер или промо-набор к этой же группе.",
      action: "Смотреть эффект",
      href: "?tab=effect#effect",
    };
  }

  return {
    tone: "good" as const,
    badge: "работает",
    title: "Кампания дает измеримый эффект",
    description: `${formatRubles(revenue)} выручки, ${formatNumber(
      visitedGuests,
    )} гостей и ${formatNumber(
      completedContacts,
    )} контактов. Конверсия в визит: ${formatPercent(visitRate)}.`,
    nextStep:
      contactCompletionRate !== null && contactCompletionRate < 70
        ? "Дожмите исполнение по оставшейся части группы и сравните прирост."
        : "Зафиксируйте выводы и повторите механику на похожей группе.",
    action: "Смотреть эффект",
    href: "?tab=effect#effect",
  };
}

function buildCampaignSummaryMetrics(
  campaign: MarketingCampaign,
  effect: MarketingCampaignEffect | null,
  contactEvents: GuestCrmContactEvent[],
) {
  const coverage = campaign.consentCoverage;
  const funnel = effect?.funnel;
  const completedContacts = funnel?.completedContacts ?? contactEvents.length;
  const respondedContacts =
    funnel?.respondedContacts ??
    contactEvents.filter((event) => Boolean(event.result)).length;
  const visitedGuests = funnel?.visitedGuests ?? effect?.after.activeGuests ?? 0;
  const revenue = funnel?.revenue ?? effect?.after.totalRevenue ?? 0;
  const barRevenue = funnel?.barRevenue ?? effect?.after.barRevenue ?? 0;
  const contactCompletionRate =
    funnel?.contactCompletionRate ??
    percentOf(completedContacts, coverage.contactable);
  const visitRate =
    funnel?.visitRate ?? percentOf(visitedGuests, coverage.targetTotal);

  return [
    {
      label: "Группа",
      value: `${formatNumber(coverage.targetTotal)} гостей`,
      hint: campaign.audience?.name ?? "группа пока не выбрана",
    },
    {
      label: "Можно контактировать",
      value: `${formatNumber(coverage.contactable)} гостей`,
      hint: coverage.requiresPhoneConsent
        ? `${formatNumber(coverage.excluded)} исключены по согласиям`
        : "канал не требует телефонного согласия",
    },
    {
      label: "Контакты",
      value: `${formatNumber(completedContacts)} шт`,
      hint: `выполнено ${formatPercent(contactCompletionRate)} плана`,
    },
    {
      label: "Результат",
      value: `${formatNumber(respondedContacts)} шт`,
      hint: "есть зафиксированный исход контакта",
    },
    {
      label: "Визиты",
      value: `${formatNumber(visitedGuests)} гостей`,
      hint: `конверсия в визит ${formatPercent(visitRate)}`,
    },
    {
      label: "Деньги",
      value: formatRubles(revenue),
      hint: `бар ${formatRubles(barRevenue)}`,
    },
  ];
}

function summaryBadgeClass(tone: CampaignDecisionTone) {
  const base =
    "inline-flex rounded-full px-3 py-1 text-sm font-semibold uppercase";

  if (tone === "good") {
    return `${base} bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200`;
  }

  if (tone === "warning") {
    return `${base} bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200`;
  }

  if (tone === "danger") {
    return `${base} bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-200`;
  }

  return `${base} bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300`;
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { MarketingCampaignContactForm } from "@/components/marketing-campaign-contact-form";
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
  type MarketingCampaignExecutionBreakdownRow,
  type MarketingCampaignEffect,
  type MarketingCampaignEffectPeriod,
  type MarketingCampaignGoal,
  type MarketingCampaignStatus,
} from "@/lib/marketing";

type PageParams = Promise<{ id: string }>;

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
}: {
  params: PageParams;
}) {
  await requireCurrentUser();
  const { id } = await params;

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
            <a
              href={`/api/marketing/campaigns/${encodeURIComponent(
                campaign.id,
              )}/export`}
              className="inline-flex min-h-10 items-center justify-center rounded-md border border-zinc-300 px-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              Скачать CSV
            </a>
            <Link
              href="/guests/crm/tasks"
              className="inline-flex min-h-10 items-center justify-center rounded-md bg-emerald-500 px-3 text-sm font-semibold text-zinc-950 hover:bg-emerald-400"
            >
              CRM-задачи
            </Link>
          </div>
        </header>

        <section className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <CampaignPlan campaign={campaign} />
          <ConsentCard campaign={campaign} />
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <CrmTaskCard campaign={campaign} linkedTask={linkedTask} />
          <ContactHistoryCard events={campaignEvents} campaign={campaign} />
        </section>

        <EffectAnalytics
          campaign={campaign}
          effect={effect}
          fallbackEvents={campaignEvents}
        />
      </div>
    </main>
  );
}

function CampaignPlan({ campaign }: { campaign: MarketingCampaign }) {
  const details = [
    { label: "Цель", value: goalLabels[campaign.goal] },
    { label: "Статус", value: statusLabels[campaign.status] },
    { label: "Группа", value: campaign.audience?.name ?? "не выбрана" },
    { label: "Канал", value: campaign.channel ?? "не выбран" },
    { label: "Механика", value: campaign.mechanic ?? "не выбрана" },
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
      {campaign.note ? (
        <div className="border-t border-zinc-200 p-4 dark:border-zinc-800">
          <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Заметка
          </p>
          <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            {campaign.note}
          </p>
        </div>
      ) : null}
    </section>
  );
}

function ConsentCard({ campaign }: { campaign: MarketingCampaign }) {
  const coverage = campaign.consentCoverage;
  const targetTotal = coverage.targetTotal;
  const contactable = coverage.contactable;
  const percent =
    targetTotal > 0 ? Math.round((contactable / targetTotal) * 100) : 0;

  return (
    <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="border-b border-zinc-200 p-5 dark:border-zinc-800">
        <p className="text-xs font-bold uppercase tracking-wide text-emerald-500">
          Согласия
        </p>
        <h2 className="mt-2 text-2xl font-semibold">Кого можно контактировать</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          Перед запуском важно видеть, сколько гостей из группы доступны по
          выбранному каналу и сколько нужно исключить из ручного контакта.
        </p>
      </div>
      <div className="p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-4xl font-semibold text-emerald-500">
              {formatNumber(contactable)}
            </p>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              доступно из {formatNumber(targetTotal)} гостей
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
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
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
            CRM-задача еще не создана. Создайте ее из списка кампаний, чтобы
            закрепить ответственного, срок и рабочее описание для контакта.
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
      <section className="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
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
      value: formatRubles(effect.after.totalRevenue),
      delta: effect.delta.totalRevenue,
      text: `списания ${formatRubles(effect.after.balanceRevenue)}, бар ${formatRubles(
        effect.after.barRevenue,
      )}`,
    },
    {
      label: "Игровые часы",
      value: `${formatNumber(effect.after.playHours)} ч`,
      delta: effect.delta.playHours,
      text: `${formatNumber(effect.after.barSalesCount)} покупок бара`,
    },
  ];

  return (
    <section className="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
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

      <CampaignFunnelCard campaign={campaign} effect={effect} />
      <CampaignStoreBreakdownCard effect={effect} />
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

function CampaignStoreBreakdownCard({
  effect,
}: {
  effect: MarketingCampaignEffect;
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
              вынесены отдельно.
            </p>
          </div>
          <p className="rounded-full border border-zinc-200 px-3 py-1 text-sm font-semibold text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            {formatNumber(effect.storeBreakdown.length)} строк
          </p>
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

import Link from "next/link";
import { MarketingCampaignsPanel } from "@/components/marketing-campaigns-panel";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { requireCurrentUser } from "@/lib/auth";
import {
  getGuestAudiences,
  getGuestCrmLeads,
  getGuestCrmTasks,
  getGuestCrmUsers,
  type GuestAudience,
  type GuestCrmLead,
  type GuestCrmTask,
} from "@/lib/guests";
import {
  getMarketingCampaigns,
  getMarketingPromoBundles,
  getMarketingPromoBundleLaunches,
  type MarketingCampaign,
  type MarketingPromoBundle,
} from "@/lib/marketing";
import { getStores } from "@/lib/stores";

type GoalCard = {
  title: string;
  description: string;
  metric: string;
  href: string;
  action: string;
};

type MarketingWorkspaceLink = {
  title: string;
  description: string;
  href: string;
};

type MarketingAiSuggestion = {
  title: string;
  goalLabel: string;
  audienceLabel: string;
  mechanic: string;
  channel: string;
  messageDraft: string;
  reason: string;
  href: string;
  action: string;
  confidence: string;
};

const campaignGoalLabels: Record<MarketingCampaign["goal"], string> = {
  RETURN_GUESTS: "Вернуть гостей",
  REPEAT_VISIT: "Повторный визит",
  WEAK_HOURS: "Тихие часы",
  BAR_GROWTH: "Рост бара",
  EVENT_PROMO: "Событие или бронь",
  PROMO_BUNDLE: "Промо-набор",
};

const campaignGoalPriority: MarketingCampaign["goal"][] = [
  "RETURN_GUESTS",
  "REPEAT_VISIT",
  "WEAK_HOURS",
  "BAR_GROWTH",
  "PROMO_BUNDLE",
  "EVENT_PROMO",
];

const goalCards: GoalCard[] = [
  {
    title: "Вернуть гостей",
    description: "Начать с гостей в риске и потерянных: выбрать группу и назначить контакт.",
    metric: "Реактивация",
    href: "/guests/report?segment=risk&page=1&pageSize=50",
    action: "Выбрать группу",
  },
  {
    title: "Повторный визит",
    description: "Найти новых гостей без второго визита и подготовить мягкий повод вернуться.",
    metric: "Удержание",
    href: "/guests/report?segment=new&page=1&pageSize=50",
    action: "Найти гостей",
  },
  {
    title: "Тихие часы",
    description: "Использовать слабую загрузку для турниров, офферов и событий по клубам.",
    metric: "Загрузка",
    href: "/guests/report?segment=quiet&page=1&pageSize=50",
    action: "Собрать группу",
  },
  {
    title: "Рост бара",
    description: "Собрать предложение для гостей с низким баром или промо-набором.",
    metric: "Бар",
    href: "/guests/report#audiences",
    action: "Открыть группы",
  },
  {
    title: "Событие или бронь",
    description: "Завести ручной лид, поставить ответственного и контролировать следующий контакт.",
    metric: "Лиды",
    href: "/guests/crm",
    action: "Открыть CRM",
  },
  {
    title: "Промо-набор",
    description: "Собрать или поправить оффер без кампании: игра + бар + сервис.",
    metric: "Оффер",
    href: "/marketing/promo-bundles",
    action: "Собрать оффер",
  },
];

const routeSteps = [
  ["1", "Цель", "Что хотим изменить: визиты, бар, загрузку, повторные покупки."],
  ["2", "Группа", "Сохраненная группа, сегмент гостей или ручные CRM-лиды."],
  ["3", "Механика", "Оффер, событие, звонок, промо-набор, миссия или персональное предложение."],
  ["4", "Канал", "CRM-задача, звонок, сообщение, объявление в клубе или будущая рассылка."],
  ["5", "Контроль", "Ответственный, срок, статус контакта и история результата."],
  ["6", "Эффект", "Возврат, визиты, выручка, бар, загрузка и повторный визит."],
] as const;

const workspaceLinks: MarketingWorkspaceLink[] = [
  {
    title: "Цели",
    description: "Начать с бизнес-задачи: вернуть гостей, поднять бар или загрузить тихие часы.",
    href: "/marketing#goals",
  },
  {
    title: "Механики",
    description: "Выбрать готовый сценарий промо и заполнить кампанию без пустого конструктора.",
    href: "/marketing#mechanics",
  },
  {
    title: "Промо-наборы",
    description: "Создать каталожный оффер, открыть существующий набор и сохранить правки.",
    href: "/marketing/promo-bundles",
  },
  {
    title: "Кампании",
    description: "Сохранить черновик, назначить ответственного, создать CRM-задачу и открыть эффект.",
    href: "/marketing#campaigns",
  },
];

async function safeList<T>(promise: Promise<T[]>): Promise<T[]> {
  try {
    return await promise;
  } catch {
    return [];
  }
}

function isActiveTask(task: GuestCrmTask) {
  return task.status !== "DONE" && task.status !== "CANCELED";
}

function formatCount(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function findAudience(
  groups: GuestAudience[],
  keywords: string[],
): GuestAudience | null {
  const normalizedKeywords = keywords.map((keyword) => keyword.toLowerCase());

  return (
    groups.find((group) => {
      const searchable = `${group.name} ${group.description ?? ""}`.toLowerCase();

      return normalizedKeywords.some((keyword) => searchable.includes(keyword));
    }) ??
    [...groups].sort((a, b) => b.guestsCount - a.guestsCount)[0] ??
    null
  );
}

function buildMarketingAiSuggestions({
  groups,
  leads,
  tasks,
  campaigns,
  promoBundles,
}: {
  groups: GuestAudience[];
  leads: GuestCrmLead[];
  tasks: GuestCrmTask[];
  campaigns: MarketingCampaign[];
  promoBundles: MarketingPromoBundle[];
}): MarketingAiSuggestion[] {
  const now = new Date();
  const activeTasks = tasks.filter(isActiveTask);
  const overdueTasks = activeTasks.filter(
    (task) => task.dueAt && new Date(task.dueAt) < now,
  );
  const consentLeads = leads.filter(
    (lead) => lead.phoneConsentStatus === "GRANTED",
  );
  const activeBundles = promoBundles.filter((bundle) => bundle.status === "ACTIVE");
  const campaignCounts = new Map<MarketingCampaign["goal"], number>();

  campaigns.forEach((campaign) => {
    campaignCounts.set(
      campaign.goal,
      (campaignCounts.get(campaign.goal) ?? 0) + 1,
    );
  });

  const leastCoveredGoal =
    campaignGoalPriority.find((goal) => !campaignCounts.has(goal)) ??
    [...campaignGoalPriority].sort(
      (a, b) => (campaignCounts.get(a) ?? 0) - (campaignCounts.get(b) ?? 0),
    )[0];
  const topAudience = findAudience(groups, []);
  const riskAudience = findAudience(groups, ["риск", "потер", "vip", "top"]);
  const newGuestAudience = findAudience(groups, ["нов", "втор", "повтор"]);
  const quietHoursAudience = findAudience(groups, ["тих", "час", "загруз"]);
  const barAudience = findAudience(groups, ["бар", "комбо", "напит", "низкий бар"]);
  const hasHistory = campaigns.length >= 3;
  const historyReason = hasHistory
    ? `В истории уже ${formatCount(campaigns.length)} кампаний, поэтому подсказки учитывают покрытие целей и текущие рабочие хвосты.`
    : `Истории кампаний пока ${formatCount(campaigns.length)}, поэтому подсказки опираются на готовые группы, CRM-задачи и каталог офферов.`;
  const suggestions: MarketingAiSuggestion[] = [];

  if (overdueTasks.length > 0) {
    const overdueAudienceName =
      overdueTasks.find((task) => task.audience)?.audience?.name ??
      riskAudience?.name ??
      "гости с просроченным контактом";

    suggestions.push({
      title: "Закрыть просроченные контакты",
      goalLabel: campaignGoalLabels.RETURN_GUESTS,
      audienceLabel: overdueAudienceName,
      mechanic: "Персональный звонок или CRM-задача с коротким поводом вернуться",
      channel: "CRM-задача администратору или управляющему",
      messageDraft:
        "Здравствуйте! Давно не виделись в клубе. Хотим предложить удобное время для визита и персональный повод вернуться на этой неделе.",
      reason: `${formatCount(overdueTasks.length)} активных задач уже просрочены: сначала стоит вернуть контроль контактов, иначе эффект кампаний будет теряться.`,
      href: "/guests/crm/tasks?status=all&sort=dueAt&direction=asc",
      action: "Разобрать задачи",
      confidence: "Высокий приоритет",
    });
  }

  if (activeBundles.length > 0) {
    const bundle = activeBundles[0];

    suggestions.push({
      title: "Продвинуть готовый промо-набор",
      goalLabel: campaignGoalLabels.PROMO_BUNDLE,
      audienceLabel: barAudience?.name ?? quietHoursAudience?.name ?? "группа с потенциалом бара",
      mechanic: `Оффер из каталога: ${bundle.name}`,
      channel: "Объявление в клубе плюс CRM-задача на личное предложение",
      messageDraft: `Для вас подготовили набор "${bundle.name}". Можно использовать на ближайшем визите, пока действует лимит предложения.`,
      reason:
        "В каталоге уже есть активный набор, значит маркетинг может запускать готовый оффер без новой сборки экономики.",
      href: "/marketing/promo-bundles",
      action: "Открыть наборы",
      confidence: "Готово к запуску",
    });
  }

  if (topAudience) {
    const goal = leastCoveredGoal ?? "RETURN_GUESTS";
    const audience =
      goal === "REPEAT_VISIT"
        ? newGuestAudience ?? topAudience
        : goal === "WEAK_HOURS"
          ? quietHoursAudience ?? topAudience
          : goal === "BAR_GROWTH" || goal === "PROMO_BUNDLE"
            ? barAudience ?? topAudience
            : riskAudience ?? topAudience;

    suggestions.push({
      title: hasHistory ? "Закрыть пробел в целях" : "Запустить первую управляемую кампанию",
      goalLabel: campaignGoalLabels[goal],
      audienceLabel: `${audience.name} (${formatCount(audience.guestsCount)} гостей)`,
      mechanic:
        goal === "WEAK_HOURS"
          ? "Тихие часы: пакет времени, турнир или бонус за визит вне пика"
          : goal === "BAR_GROWTH"
            ? "Барное комбо или персональная рекомендация напитка к сессии"
            : goal === "PROMO_BUNDLE"
              ? "Сохраненный промо-набор с лимитом и ручной проверкой использования"
              : "CRM-контакт с фиксированным результатом и контрольной датой",
      channel:
        goal === "EVENT_PROMO" ? "CRM-лид, звонок и объявление в клубе" : "CRM-задача и разговор в клубе",
      messageDraft:
        goal === "WEAK_HOURS"
          ? "В эти часы в клубе спокойнее, а играть выгоднее. Подготовили для вас специальный повод прийти именно в удобное окно."
          : goal === "BAR_GROWTH"
            ? "К вашей игровой сессии можно добавить готовое комбо бара. Администратор подскажет вариант на месте."
            : "Хотим предложить персональный повод для следующего визита. Ответьте администратору, если удобно подобрать время.",
      reason: historyReason,
      href: "/marketing#campaigns",
      action: "Создать кампанию",
      confidence: hasHistory ? "На основе истории" : "Стартовая гипотеза",
    });
  }

  if (consentLeads.length > 0) {
    suggestions.push({
      title: "Обработать лиды с согласием",
      goalLabel: campaignGoalLabels.EVENT_PROMO,
      audienceLabel: `${formatCount(consentLeads.length)} CRM-лидов с согласием`,
      mechanic: "Ручной follow-up по событию, броням или заявкам",
      channel: "Звонок или сообщение по разрешенному каналу",
      messageDraft:
        "Здравствуйте! Вы оставляли интерес к событию или визиту. Подскажем свободное время и закрепим бронь, если вам удобно.",
      reason:
        "Есть лиды, которых можно обрабатывать без догадок по согласию: это быстрый сценарий с понятным результатом контакта.",
      href: "/guests/crm",
      action: "Открыть лиды",
      confidence: "Согласие подтверждено",
    });
  }

  if (suggestions.length === 0) {
    suggestions.push({
      title: "Собрать базу для подсказок",
      goalLabel: campaignGoalLabels.RETURN_GUESTS,
      audienceLabel: "сначала сохраните группу гостей",
      mechanic: "Минимальная CRM-кампания с ответственным и результатом контакта",
      channel: "CRM-задача",
      messageDraft:
        "Подготовьте первую группу гостей и зафиксируйте результаты контактов, чтобы LeetPlus начал предлагать более точные сценарии.",
      reason:
        "Нет сохраненных групп, лидов или активных офферов. Для подсказок нужна хотя бы одна рабочая аудитория.",
      href: "/guests/report#audiences",
      action: "Создать группу",
      confidence: "Нужны данные",
    });
  }

  return suggestions.slice(0, 4);
}

export default async function MarketingPage() {
  await requireCurrentUser();

  const [
    groups,
    leads,
    tasks,
    users,
    campaigns,
    promoBundles,
    promoBundleLaunches,
    stores,
  ] =
    await Promise.all([
      safeList(getGuestAudiences()),
      safeList(getGuestCrmLeads()),
      safeList(getGuestCrmTasks()),
      safeList(getGuestCrmUsers()),
      safeList(getMarketingCampaigns()),
      safeList(getMarketingPromoBundles()),
      safeList(getMarketingPromoBundleLaunches()),
      safeList(getStores()),
    ]);

  const now = new Date();
  const activeTasks = tasks.filter(isActiveTask);
  const overdueTasks = activeTasks.filter(
    (task) => task.dueAt && new Date(task.dueAt) < now,
  );
  const consentLeads = leads.filter(
    (lead) => lead.phoneConsentStatus === "GRANTED",
  );

  const readinessCards = [
    {
      label: "Группы гостей",
      value: `${groups.length}`,
      text: "сохраненных групп для запуска CRM или промо-сценария",
      href: "/guests/report#audiences",
    },
    {
      label: "CRM-лиды",
      value: `${leads.length}`,
      text: `${consentLeads.length} с подтвержденным согласием на контакт`,
      href: "/guests/crm",
    },
    {
      label: "Задачи контакта",
      value: `${activeTasks.length}`,
      text:
        overdueTasks.length > 0
          ? `${overdueTasks.length} просрочено, нужен контроль исполнения`
          : "просроченных задач сейчас нет",
      href: "/guests/crm/tasks",
    },
  ];
  const marketingAiSuggestions = buildMarketingAiSuggestions({
    groups,
    leads,
    tasks,
    campaigns,
    promoBundles,
  });

  return (
    <main className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <ReportBreadcrumbs
          current="Маркетинг"
          items={[{ href: "/dashboard", label: "Дашборд" }]}
        />

        <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)] lg:p-8">
            <div className="space-y-4">
              <p className="text-sm font-bold uppercase tracking-wide text-emerald-500">
                Маркетинг
              </p>
              <div className="space-y-3">
                <h1 className="max-w-3xl text-3xl font-bold tracking-normal text-zinc-950 dark:text-white md:text-4xl">
                  Кампании от цели к группе гостей
                </h1>
                <p className="max-w-3xl text-base leading-7 text-zinc-600 dark:text-zinc-300">
                  Здесь начинается маршрут промо: выбрать бизнес-цель, взять группу
                  гостей или CRM-лиды, назначить ручное действие и потом измерить
                  эффект. Автоматическое начисление бонусов в Langame пока не
                  включаем без подтвержденного write API.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/guests/report#audiences"
                  className="inline-flex min-h-11 items-center justify-center rounded-full bg-emerald-500 px-5 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400"
                >
                  Выбрать группу
                </Link>
                <Link
                  href="/guests/crm/tasks"
                  className="inline-flex min-h-11 items-center justify-center rounded-full border border-zinc-200 px-5 text-sm font-semibold text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-200 dark:hover:border-zinc-700 dark:hover:bg-zinc-900"
                >
                  Открыть CRM-задачи
                </Link>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              {readinessCards.map((card) => (
                <Link
                  key={card.label}
                  href={card.href}
                  className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 transition hover:border-emerald-400/70 hover:bg-emerald-50 dark:border-zinc-800 dark:bg-zinc-900/70 dark:hover:border-emerald-500/60 dark:hover:bg-emerald-500/10"
                >
                  <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    {card.label}
                  </p>
                  <p className="mt-2 text-3xl font-bold text-zinc-950 dark:text-white">
                    {card.value}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                    {card.text}
                  </p>
                </Link>
              ))}
            </div>
          </div>

          <div className="border-t border-zinc-200 bg-zinc-50/70 p-6 dark:border-zinc-800 dark:bg-zinc-900/30">
            <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
              {routeSteps.map(([number, title, text]) => (
                <div
                  key={title}
                  className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/15 text-xs font-bold text-emerald-600 dark:text-emerald-300">
                    {number}
                  </span>
                  <p className="mt-3 font-semibold text-zinc-950 dark:text-white">
                    {title}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                    {text}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <div className="border-b border-zinc-200 p-6 dark:border-zinc-800">
            <p className="text-sm font-bold uppercase tracking-wide text-emerald-500">
              Что уже можно сделать
            </p>
            <h2 className="mt-2 text-2xl font-bold text-zinc-950 dark:text-white">
              Маршрут маркетолога
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
              Функции не спрятаны в одной форме: пользователь проходит путь от
              цели к механике, набору, кампании и контролю эффекта.
            </p>
          </div>
          <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
            {workspaceLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 transition hover:border-emerald-400/70 hover:bg-emerald-50 dark:border-zinc-800 dark:bg-zinc-900/60 dark:hover:border-emerald-500/70 dark:hover:bg-emerald-500/10"
              >
                <h3 className="text-base font-semibold text-zinc-950 dark:text-white">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                  {item.description}
                </p>
              </Link>
            ))}
          </div>
        </section>

        <section
          id="ai-suggestions"
          className="mt-6 scroll-mt-6 rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
        >
          <div className="border-b border-zinc-200 p-6 dark:border-zinc-800">
            <p className="text-sm font-bold uppercase tracking-wide text-emerald-500">
              AI-подсказки v1
            </p>
            <h2 className="mt-2 text-2xl font-bold text-zinc-950 dark:text-white">
              Что запускать дальше
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
              Локальные подсказки собирают историю кампаний, готовые группы,
              CRM-лиды, задачи контакта и промо-наборы. Ничего не отправляется
              гостям автоматически: это черновики цели, аудитории, механики и
              текста для ручного запуска.
            </p>
          </div>
          <div className="grid gap-4 p-4 xl:grid-cols-2">
            {marketingAiSuggestions.map((suggestion) => (
              <article
                key={`${suggestion.title}-${suggestion.audienceLabel}`}
                className="rounded-lg border border-zinc-200 bg-zinc-50 p-5 dark:border-zinc-800 dark:bg-zinc-900/60"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      {suggestion.confidence}
                    </p>
                    <h3 className="mt-1 text-lg font-semibold text-zinc-950 dark:text-white">
                      {suggestion.title}
                    </h3>
                  </div>
                  <Link
                    href={suggestion.href}
                    className="rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:border-emerald-400 hover:bg-emerald-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:border-emerald-500 dark:hover:bg-emerald-500/10"
                  >
                    {suggestion.action}
                  </Link>
                </div>
                <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-bold uppercase tracking-wide text-zinc-500">
                      Цель
                    </dt>
                    <dd className="mt-1 text-sm font-semibold text-zinc-950 dark:text-white">
                      {suggestion.goalLabel}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-bold uppercase tracking-wide text-zinc-500">
                      Группа
                    </dt>
                    <dd className="mt-1 text-sm font-semibold text-zinc-950 dark:text-white">
                      {suggestion.audienceLabel}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-bold uppercase tracking-wide text-zinc-500">
                      Механика
                    </dt>
                    <dd className="mt-1 text-sm text-zinc-700 dark:text-zinc-200">
                      {suggestion.mechanic}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-bold uppercase tracking-wide text-zinc-500">
                      Канал
                    </dt>
                    <dd className="mt-1 text-sm text-zinc-700 dark:text-zinc-200">
                      {suggestion.channel}
                    </dd>
                  </div>
                </dl>
                <p className="mt-4 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm leading-6 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
                  {suggestion.messageDraft}
                </p>
                <p className="mt-3 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
                  {suggestion.reason}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section
          id="goals"
          className="mt-6 scroll-mt-6 rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
        >
          <div className="border-b border-zinc-200 p-6 dark:border-zinc-800">
            <p className="text-sm font-bold uppercase tracking-wide text-emerald-500">
              Цели кампании
            </p>
            <h2 className="mt-2 text-2xl font-bold text-zinc-950 dark:text-white">
              Сначала выберите, что нужно бизнесу
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
              На этом этапе не показываем пустой конструктор. Маркетинг начинается с
              задачи: кого вернуть, что продать, какую загрузку поднять и через какой
              ручной сценарий это проконтролировать.
            </p>
          </div>
          <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {goalCards.map((goal) => (
              <Link
                key={goal.title}
                href={goal.href}
                className="group flex min-h-52 flex-col justify-between rounded-lg border border-zinc-200 bg-zinc-50 p-5 transition hover:border-emerald-400/70 hover:bg-emerald-50 dark:border-zinc-800 dark:bg-zinc-900/60 dark:hover:border-emerald-500/70 dark:hover:bg-emerald-500/10"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-lg font-semibold text-zinc-950 dark:text-white">
                      {goal.title}
                    </h3>
                    <span className="shrink-0 rounded-full border border-zinc-200 px-3 py-1 text-xs font-semibold text-zinc-500 dark:border-zinc-700 dark:text-zinc-300">
                      {goal.metric}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                    {goal.description}
                  </p>
                </div>
                <span className="mt-5 text-sm font-semibold text-emerald-600 transition group-hover:text-emerald-500 dark:text-emerald-300">
                  {goal.action}
                </span>
              </Link>
            ))}
          </div>
        </section>

        <MarketingCampaignsPanel
          campaigns={campaigns}
          audiences={groups}
          users={users}
          promoBundles={promoBundles}
          promoBundleLaunches={promoBundleLaunches}
          stores={stores}
        />
      </div>
    </main>
  );
}

import Link from "next/link";
import { MarketingCampaignsPanel } from "@/components/marketing-campaigns-panel";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { requirePageAccess } from "@/lib/auth";
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
      const searchable =
        `${group.name} ${group.description ?? ""}`.toLowerCase();

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
  const activeBundles = promoBundles.filter(
    (bundle) => bundle.status === "ACTIVE",
  );
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
  const barAudience = findAudience(groups, [
    "бар",
    "комбо",
    "напит",
    "низкий бар",
  ]);
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
      mechanic:
        "Персональный звонок или CRM-задача с коротким поводом вернуться",
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
      audienceLabel:
        barAudience?.name ??
        quietHoursAudience?.name ??
        "группа с потенциалом бара",
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
        ? (newGuestAudience ?? topAudience)
        : goal === "WEAK_HOURS"
          ? (quietHoursAudience ?? topAudience)
          : goal === "BAR_GROWTH" || goal === "PROMO_BUNDLE"
            ? (barAudience ?? topAudience)
            : (riskAudience ?? topAudience);

    suggestions.push({
      title: hasHistory
        ? "Закрыть пробел в целях"
        : "Запустить первую управляемую кампанию",
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
        goal === "EVENT_PROMO"
          ? "CRM-лид, звонок и объявление в клубе"
          : "CRM-задача и разговор в клубе",
      messageDraft:
        goal === "WEAK_HOURS"
          ? "В эти часы в клубе спокойнее, а играть выгоднее. Подготовили для вас специальный повод прийти именно в удобное окно."
          : goal === "BAR_GROWTH"
            ? "К вашей игровой сессии можно добавить готовое комбо бара. Администратор подскажет вариант на месте."
            : "Хотим предложить персональный повод для следующего визита. Ответьте администратору, если удобно подобрать время.",
      reason: historyReason,
      href: "/marketing/new",
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
      mechanic:
        "Минимальная CRM-кампания с ответственным и результатом контакта",
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
  await requirePageAccess("/marketing");

  const [
    groups,
    leads,
    tasks,
    users,
    campaigns,
    promoBundles,
    promoBundleLaunches,
    stores,
  ] = await Promise.all([
    safeList(getGuestAudiences()),
    safeList(getGuestCrmLeads()),
    safeList(getGuestCrmTasks()),
    safeList(getGuestCrmUsers()),
    safeList(getMarketingCampaigns()),
    safeList(getMarketingPromoBundles()),
    safeList(getMarketingPromoBundleLaunches()),
    safeList(getStores()),
  ]);

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
          current="Кампании"
          items={[{ href: "/dashboard", label: "Сводка" }]}
        />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
              Маркетинг
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-white">
              Кампании
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
              Как вернуть группу гостей: выбрали группу и предложение, написали
              в Telegram или поручили админам позвонить, а через 14 дней видно,
              сколько гостей вернулось. Сообщение в Telegram уходит только
              после вашего подтверждения в карточке кампании.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Link
              href="/marketing/visit-ratings"
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-zinc-300 px-4 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              Оценки визитов
            </Link>
            <Link
              href="/marketing/promo-bundles"
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-zinc-300 px-4 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              Промо-наборы
            </Link>
            <Link
              href="/marketing/new"
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-emerald-600 px-5 text-sm font-semibold text-white transition hover:bg-emerald-700"
            >
              Новая кампания
            </Link>
          </div>
        </div>

        <MarketingCampaignsPanel
          view="list"
          campaigns={campaigns}
          audiences={groups}
          users={users}
          promoBundles={promoBundles}
          promoBundleLaunches={promoBundleLaunches}
          stores={stores}
        />

        <details
          id="ai-suggestions"
          className="mt-6 scroll-mt-6 rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
        >
          <summary className="cursor-pointer px-6 py-4 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
            Подсказки: что запустить дальше ({marketingAiSuggestions.length})
          </summary>
          <p className="px-6 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            Подсказки собраны из истории кампаний, групп гостей, CRM-задач и
            промо-наборов. Это черновики идей для ручного запуска.
          </p>
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
        </details>
      </div>
    </main>
  );
}

import Link from "next/link";
import { MarketingCampaignsPanel } from "@/components/marketing-campaigns-panel";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { requireCurrentUser } from "@/lib/auth";
import {
  getGuestAudiences,
  getGuestCrmLeads,
  getGuestCrmTasks,
  getGuestCrmUsers,
  type GuestCrmTask,
} from "@/lib/guests";
import {
  getMarketingCampaigns,
  getMarketingPromoBundles,
  getMarketingPromoBundleLaunches,
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
    description: "Собрать и запустить оффер без кампании: игра + бар + сервис.",
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
    description: "Создать каталожный оффер и запустить его для сети или выбранных клубов.",
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

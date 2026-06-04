import Link from "next/link";
import { redirect } from "next/navigation";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { requireCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

type HubCard = {
  href: string;
  eyebrow: string;
  title: string;
  description: string;
  accent: string;
};

const staffCards: HubCard[] = [
  {
    href: "/staff/team-chat",
    eyebrow: "Внутри команды",
    title: "Командный чат",
    description:
      "Клубные каналы, объявления, инциденты, закрепленные сообщения и быстрые задачи из обсуждений.",
    accent: "Смены, клубы, поддержка",
  },
  {
    href: "/staff/notifications",
    eyebrow: "Операционные сигналы",
    title: "Уведомления",
    description:
      "Просрочки, критичные чек-листы, срочные инциденты и сигналы, которые требуют реакции управляющего.",
    accent: "Важное без шума",
  },
];

const guestCards: HubCard[] = [
  {
    href: "/guests/crm/tasks",
    eyebrow: "Контакт с гостем",
    title: "CRM-задачи",
    description:
      "Ручные контакты по гостям, follow-up, результаты связи и рабочий контур для возврата аудитории.",
    accent: "Гость -> контакт -> эффект",
  },
];

const nextSteps = [
  "Telegram/MAX-боты для внешней связи с гостями после настройки согласий.",
  "Шаблоны объявлений и регламенты реакции для клубных каналов.",
  "Тонкая матрица каналов: какие роли видят объявления, поддержку, клубные и CRM-коммуникации.",
];

export default async function CommunicationsPage() {
  const user = await requireCurrentUser();
  const canViewCommunications = can(user, "view_communications");
  const canViewGuests = can(user, "view_guests");
  const cards = [
    ...(canViewCommunications ? staffCards : []),
    ...(canViewGuests ? guestCards : []),
  ];
  const primaryAction = canViewCommunications
    ? { href: "/staff/team-chat", label: "Перейти в чат" }
    : { href: "/guests/crm/tasks", label: "Открыть CRM-задачи" };

  if (cards.length === 0) {
    redirect("/dashboard");
  }

  return (
    <main className="px-4 py-6 text-zinc-950 dark:text-zinc-100 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-7xl">
        <ReportBreadcrumbs
          current="Коммуникации"
          items={[{ href: "/dashboard", label: "Дашборд" }]}
        />

        <header className="grid gap-5 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950 lg:grid-cols-[1fr_22rem]">
          <div>
            <p className="text-sm font-semibold uppercase text-emerald-700 dark:text-emerald-300">
              Коммуникации
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Рабочие сообщения сети
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Единый вход в оперативный обмен информацией: внутренний чат,
              критичные уведомления и CRM-контакты, которые связывают сигнал с
              ответственным действием.
            </p>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/10">
            <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-200">
              Принцип раздела
            </p>
            <p className="mt-2 text-sm leading-6 text-emerald-900 dark:text-emerald-100">
              Сначала видно, где нужна реакция. Потом открывается конкретный
              канал, задача или сигнал с ответственным и сроком.
            </p>
          </div>
        </header>

        <section className="mt-6 grid gap-4 lg:grid-cols-3">
          {cards.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="group rounded-lg border border-zinc-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-emerald-400 hover:shadow-lg hover:shadow-emerald-950/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-emerald-500/70"
            >
              <p className="text-xs font-bold uppercase text-zinc-500">
                {card.eyebrow}
              </p>
              <div className="mt-3 flex items-start justify-between gap-3">
                <h2 className="text-xl font-semibold">{card.title}</h2>
                <span
                  aria-hidden="true"
                  className="rounded-full border border-zinc-200 px-2 py-1 text-xs text-zinc-500 transition group-hover:border-emerald-400 group-hover:text-emerald-700 dark:border-zinc-800 dark:group-hover:border-emerald-500 dark:group-hover:text-emerald-200"
                >
                  Открыть
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                {card.description}
              </p>
              <p className="mt-4 text-xs font-semibold uppercase text-emerald-700 dark:text-emerald-300">
                {card.accent}
              </p>
            </Link>
          ))}
        </section>

        <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase text-zinc-500">
                Следующий слой
              </p>
              <h2 className="mt-2 text-xl font-semibold">
                Внешние каналы и правила реакции
              </h2>
            </div>
            <Link
              href={primaryAction.href}
              className="inline-flex h-10 items-center justify-center rounded-md bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400"
            >
              {primaryAction.label}
            </Link>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            {nextSteps.map((step) => (
              <div
                key={step}
                className="rounded-lg border border-dashed border-zinc-300 p-4 text-sm leading-6 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
              >
                {step}
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

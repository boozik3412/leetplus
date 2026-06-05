import Link from "next/link";
import { redirect } from "next/navigation";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { requireCurrentUser } from "@/lib/auth";
import { isShiftWorkspaceRole, staffShiftWorkspaceHref } from "@/lib/landing";
import { can } from "@/lib/permissions";
import { canManageUserAccess } from "@/lib/roles";

type StaffArea = {
  href: string;
  eyebrow: string;
  title: string;
  description: string;
  links: Array<{ href: string; label: string }>;
};

const staffAreas: StaffArea[] = [
  {
    href: "/staff/operations-dashboard",
    eyebrow: "Операции",
    title: "Операционная дисциплина",
    description:
      "Сводка по задачам, сменам, чек-листам, возвратам, кассе и повторяющимся проблемам.",
    links: [
      { href: "/staff/tasks", label: "Задачи" },
      { href: "/staff/task-templates", label: "Шаблоны задач" },
      { href: "/staff/task-rules", label: "Регулярные задачи" },
    ],
  },
  {
    href: "/staff/shift-regulations",
    eyebrow: "Стандарты",
    title: "Регламенты и чек-листы",
    description:
      "Конструкторы сменных стандартов, шаблонов чек-листов и контроль выполнения в клубах.",
    links: [
      { href: "/staff/checklist-templates", label: "Шаблоны чек-листов" },
      { href: "/staff/checklists", label: "Выполнение" },
      { href: "/staff/checklists/report", label: "Отчет" },
      { href: "/staff/knowledge-base", label: "База знаний" },
    ],
  },
  {
    href: "/staff/training-courses",
    eyebrow: "Обучение",
    title: "Обучение и аттестации",
    description:
      "Маршруты адаптации, курсы, тесты, аттестации и готовность сотрудников к сменам.",
    links: [
      { href: "/staff/onboarding", label: "Онбординг" },
      { href: "/staff/assessments", label: "Аттестации" },
      { href: "/staff/training-profiles", label: "Профили обучения" },
      { href: "/staff/readiness-report", label: "Готовность" },
    ],
  },
  {
    href: "/staff/administrator-ratings",
    eyebrow: "Контроль и мотивация",
    title: "Рейтинг, штрафы и зарплата",
    description:
      "Сводная оценка администраторов, предупреждения, штрафы, схемы оплаты и расчет выплат.",
    links: [
      { href: "/staff/discipline", label: "Предупреждения и штрафы" },
      { href: "/staff/salary", label: "Зарплата" },
      { href: "/guests/staff-control", label: "Контроль смен" },
      { href: "/guests/staff-control/operators", label: "Администраторы" },
    ],
  },
  {
    href: "/staff/directory",
    eyebrow: "Команда",
    title: "Сотрудники и учетные записи",
    description:
      "Единая карточка сотрудника, связь с учетной записью LeetPlus и Langame user_id.",
    links: [{ href: "/staff/ai-assistant", label: "AI-помощник" }],
  },
];

export default async function StaffHubPage() {
  const user = await requireCurrentUser();

  if (isShiftWorkspaceRole(user.role)) {
    redirect(staffShiftWorkspaceHref);
  }

  if (!can(user, "view_staff")) {
    redirect("/dashboard");
  }

  const areas = staffAreas.map((area) =>
    area.href === "/staff/directory" && canManageUserAccess(user.role)
      ? {
          ...area,
          links: [
            { href: "/users", label: "Пользователи и роли" },
            ...area.links,
          ],
        }
      : area,
  );

  return (
    <main className="px-4 py-6 text-zinc-950 dark:text-zinc-100 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-7xl">
        <ReportBreadcrumbs
          current="Персонал"
          items={[{ href: "/dashboard", label: "Дашборд" }]}
        />

        <header className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-sm font-semibold uppercase text-emerald-700 dark:text-emerald-300">
            Персонал
          </p>
          <div className="mt-2 grid gap-4 lg:grid-cols-[1fr_24rem] lg:items-end">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">
                Управление сотрудниками от сигнала к действию
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                Раздел собран как карта рабочих сценариев: сначала общая
                операционная картина, затем стандарты, обучение, контроль и
                мотивация конкретных сотрудников.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Link
                href="/staff/operations-dashboard"
                className="rounded-lg border border-zinc-200 px-4 py-3 text-sm font-semibold transition hover:border-emerald-400 hover:text-emerald-700 dark:border-zinc-800 dark:hover:border-emerald-500 dark:hover:text-emerald-200"
              >
                Открыть дисциплину
              </Link>
              <Link
                href="/staff/directory"
                className="rounded-lg bg-emerald-500 px-4 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400"
              >
                Сотрудники
              </Link>
            </div>
          </div>
        </header>

        <section className="mt-6 grid gap-4 lg:grid-cols-2">
          {areas.map((area) => (
            <article
              key={area.href}
              className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <p className="text-xs font-bold uppercase text-zinc-500">
                {area.eyebrow}
              </p>
              <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-xl font-semibold">{area.title}</h2>
                  <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                    {area.description}
                  </p>
                </div>
                <Link
                  href={area.href}
                  className="rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold transition hover:border-emerald-400 hover:text-emerald-700 dark:border-zinc-800 dark:hover:border-emerald-500 dark:hover:text-emerald-200"
                >
                  Открыть
                </Link>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {area.links.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-600 transition hover:bg-emerald-100 hover:text-emerald-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-emerald-500/15 dark:hover:text-emerald-200"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </article>
          ))}
        </section>

        <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p className="text-xs font-bold uppercase text-zinc-500">
                Коммуникации вынесены отдельно
              </p>
              <h2 className="mt-2 text-xl font-semibold">
                Чат и уведомления теперь не перегружают персональный блок
              </h2>
              <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                Оперативный обмен информацией доступен в разделе
                «Коммуникации», а здесь остается управление людьми,
                стандартами, обучением и качеством работы.
              </p>
            </div>
            <Link
              href="/communications"
              className="inline-flex h-10 items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-semibold transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Открыть коммуникации
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}

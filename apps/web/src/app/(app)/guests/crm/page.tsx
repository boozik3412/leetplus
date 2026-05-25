import Link from "next/link";
import { GuestAudiencesPanel } from "@/components/guest-audiences-panel";
import { requireCurrentUser } from "@/lib/auth";
import {
  getGuestAudiences,
  getGuestCrmContactEvents,
  getGuestCrmLeads,
  getGuestCrmTasks,
  getGuestCrmUsers,
  getGuests,
  type GuestListFilters,
} from "@/lib/guests";

export default async function GuestCrmPage() {
  await requireCurrentUser();

  const baseFilters: GuestListFilters = {
    segment: "top",
    page: "1",
    pageSize: "1",
    sort: "revenue",
    direction: "desc",
  };

  const [guestList, audiences, crmLeads, crmTasks, crmUsers, crmContactEvents] =
    await Promise.all([
      getGuests(baseFilters),
      getGuestAudiences(),
      getGuestCrmLeads(),
      getGuestCrmTasks(),
      getGuestCrmUsers(),
      getGuestCrmContactEvents(),
    ]);

  const currentFilters: GuestListFilters = {
    ...baseFilters,
    dateFrom: guestList.periodFrom,
    dateTo: guestList.periodTo,
  };

  return (
    <main className="px-4 py-6 text-zinc-950 dark:text-zinc-100 md:px-6 md:py-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold uppercase text-emerald-700 dark:text-emerald-300">
              Гости
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              CRM гостей
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">
              Рабочее место для ручных контактов, групп, задач, согласий и
              истории коммуникаций. Здесь можно вести заявки на мероприятия и
              брони до регистрации гостя в Langame.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/guests/crm/tasks"
              className="inline-flex h-10 items-center justify-center rounded-md border border-zinc-300 px-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              Задачи CRM
            </Link>
            <Link
              href="/guests/report#audiences"
              className="inline-flex h-10 items-center justify-center rounded-md border border-zinc-300 px-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              В полном отчете
            </Link>
            <Link
              href="/guests"
              className="inline-flex h-10 items-center justify-center rounded-md bg-zinc-950 px-3 text-sm font-semibold text-white hover:bg-zinc-800 dark:bg-emerald-400 dark:text-zinc-950 dark:hover:bg-emerald-300"
            >
              Дашборд гостей
            </Link>
          </div>
        </div>

        <section className="mt-6 grid gap-3 md:grid-cols-4">
          <CrmMetric title="Группы" value={audiences.length} />
          <CrmMetric title="CRM-гости" value={crmLeads.length} />
          <CrmMetric title="Задачи" value={crmTasks.length} />
          <CrmMetric title="Контакты" value={crmContactEvents.length} />
        </section>

        <GuestAudiencesPanel
          currentFilters={currentFilters}
          totalRows={guestList.totalRows}
          audiences={audiences}
          crmLeads={crmLeads}
          crmTasks={crmTasks}
          crmUsers={crmUsers}
          crmContactEvents={crmContactEvents}
        />
      </div>
    </main>
  );
}

function CrmMetric({ title, value }: { title: string; value: number }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-xs font-semibold uppercase text-zinc-500">{title}</p>
      <p className="mt-2 text-2xl font-semibold">
        {new Intl.NumberFormat("ru-RU").format(value)}
      </p>
    </div>
  );
}

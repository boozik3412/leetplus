import Link from "next/link";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { StaffNotificationsWorkspace } from "@/components/staff-notifications-workspace";
import { requireCurrentUser } from "@/lib/auth";
import {
  getStaffNotificationsReport,
  type StaffNotificationsFilters,
} from "@/lib/staff-notifications";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function searchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function resolveFilters(
  params: Awaited<SearchParams>,
): StaffNotificationsFilters {
  return {
    status: searchParam(params.status)?.trim() as
      | StaffNotificationsFilters["status"]
      | undefined,
    severity: searchParam(params.severity)?.trim() as
      | StaffNotificationsFilters["severity"]
      | undefined,
    sourceType: searchParam(params.sourceType)?.trim() as
      | StaffNotificationsFilters["sourceType"]
      | undefined,
    storeId: searchParam(params.storeId)?.trim(),
    search: searchParam(params.search)?.trim(),
    pageSize: searchParam(params.pageSize) ?? "100",
  };
}

export default async function StaffNotificationsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireCurrentUser();
  const params = await searchParams;
  const report = await getStaffNotificationsReport(resolveFilters(params));

  return (
    <main className="px-4 py-6 text-zinc-950 dark:text-zinc-100 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-7xl">
        <ReportBreadcrumbs
          current="Уведомления"
          items={[
            { href: "/dashboard", label: "Дашборд" },
            { href: "/staff/tasks", label: "Персонал" },
          ]}
        />

        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase text-emerald-700 dark:text-emerald-300">
              Персонал
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Уведомления и критические сигналы
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Единый рабочий список для просроченных важных задач, проблемных
              чек-листов, регулярных правил и срочных инцидентов командного
              чата.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/staff/operations-dashboard"
              className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-semibold transition hover:border-emerald-400 hover:text-emerald-700 dark:border-zinc-800 dark:hover:border-emerald-500 dark:hover:text-emerald-200"
            >
              Операционная дисциплина
            </Link>
            <Link
              href="/staff/team-chat"
              className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-semibold transition hover:border-emerald-400 hover:text-emerald-700 dark:border-zinc-800 dark:hover:border-emerald-500 dark:hover:text-emerald-200"
            >
              Командный чат
            </Link>
          </div>
        </div>

        <div className="mt-6">
          <StaffNotificationsWorkspace report={report} />
        </div>
      </div>
    </main>
  );
}

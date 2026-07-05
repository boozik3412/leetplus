import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { StaffSalaryWorkspaceView } from "@/components/staff-salary-workspace";
import { requireCurrentUser } from "@/lib/auth";
import {
  getStaffSalaryWorkspace,
  type StaffSalaryFilters,
} from "@/lib/staff-salary";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function searchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function searchParams(value: string | string[] | undefined) {
  return Array.isArray(value) ? value : value ? [value] : undefined;
}

function resolveFilters(params: Awaited<SearchParams>): StaffSalaryFilters {
  return {
    dateFrom: searchParam(params.dateFrom),
    dateTo: searchParam(params.dateTo),
    storeId: searchParam(params.storeId),
    storeIds: searchParams(params.storeIds),
    userId: searchParam(params.userId),
    userIds: searchParams(params.userIds),
    schemeId: searchParam(params.schemeId),
    search: searchParam(params.search)?.trim(),
    calculate: searchParam(params.calculate),
    periodMode: searchParam(params.periodMode) as StaffSalaryFilters["periodMode"],
    month: searchParam(params.month),
    roleScope: searchParam(params.roleScope) as StaffSalaryFilters["roleScope"],
  };
}

export default async function StaffSalaryPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireCurrentUser();
  const params = await searchParams;
  const workspace = await getStaffSalaryWorkspace(resolveFilters(params));

  return (
    <main className="px-4 py-6 text-zinc-950 dark:text-zinc-100 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-7xl">
        <ReportBreadcrumbs
          current="Расчет зарплаты"
          items={[
            { href: "/dashboard", label: "Дашборд" },
            { href: "/staff/tasks", label: "Персонал" },
          ]}
        />

        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase text-emerald-700 dark:text-emerald-300">
              Персонал
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Расчет зарплаты
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Настраивайте правила оклада, ставок, премий и удержаний, а затем
              смотрите расчет по администраторам за выбранный период.
            </p>
          </div>
        </header>


        <StaffSalaryWorkspaceView workspace={workspace} />
      </div>
    </main>
  );
}

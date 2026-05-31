import Link from "next/link";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { StaffDirectoryWorkspace } from "@/components/staff-directory-workspace";
import { requireCurrentUser } from "@/lib/auth";
import {
  getStaffDirectoryReport,
  type StaffDirectoryFilters,
  type StaffMemberStatus,
} from "@/lib/staff-directory";
import { getRoleLabel, roleOrder, type UserRole } from "@/lib/roles";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

const statusLabels: Record<StaffMemberStatus | "all", string> = {
  all: "Все статусы",
  ACTIVE: "Активные",
  ONBOARDING: "Адаптация",
  SUSPENDED: "Приостановлены",
  DISMISSED: "Уволены",
};

function searchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isStatus(value: string | undefined): value is StaffMemberStatus | "all" {
  return (
    value === "all" ||
    value === "ACTIVE" ||
    value === "ONBOARDING" ||
    value === "SUSPENDED" ||
    value === "DISMISSED"
  );
}

function isRole(value: string | undefined): value is UserRole | "all" {
  return value === "all" || roleOrder.includes(value as UserRole);
}

function resolveFilters(params: Awaited<SearchParams>): StaffDirectoryFilters {
  const status = searchParam(params.status);
  const role = searchParam(params.role);

  return {
    status: isStatus(status) ? status : "ACTIVE",
    role: isRole(role) ? role : "all",
    storeId: searchParam(params.storeId),
    search: searchParam(params.search)?.trim(),
  };
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

export default async function StaffDirectoryPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireCurrentUser();
  const params = await searchParams;
  const filters = resolveFilters(params);
  const report = await getStaffDirectoryReport(filters);
  const summaryCards = [
    { label: "Сотрудники", value: report.summary.total },
    { label: "Активные", value: report.summary.active },
    { label: "Учетные записи", value: report.summary.linkedAccounts },
    { label: "Langame user_id", value: report.summary.linkedLangameUsers },
  ];

  return (
    <main className="px-4 py-6 text-zinc-950 dark:text-zinc-100 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-7xl">
        <ReportBreadcrumbs
          current="Сотрудники"
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
              Справочник сотрудников
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Единая карточка сотрудника для задач, чек-листов, обучения,
              рейтинга администраторов и будущей связки со сменами Langame.
            </p>
          </div>
          <Link
            href="/users"
            className="inline-flex h-10 items-center justify-center rounded-md border border-zinc-300 px-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            Учетные записи
          </Link>
        </header>

        <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {summaryCards.map((card) => (
            <div
              key={card.label}
              className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <p className="text-xs font-bold uppercase text-zinc-500">
                {card.label}
              </p>
              <p className="mt-2 text-2xl font-semibold">
                {formatNumber(card.value)}
              </p>
            </div>
          ))}
        </section>

        <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <form className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_1.4fr_auto]">
            <label className="space-y-1">
              <span className="text-xs font-bold uppercase text-zinc-500">
                Статус
              </span>
              <select
                name="status"
                defaultValue={report.filters.status}
                className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                {Object.entries(statusLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-bold uppercase text-zinc-500">
                Роль
              </span>
              <select
                name="role"
                defaultValue={report.filters.role}
                className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                <option value="all">Все роли</option>
                {roleOrder.map((role) => (
                  <option key={role} value={role}>
                    {getRoleLabel(role)}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-bold uppercase text-zinc-500">
                Клуб
              </span>
              <select
                name="storeId"
                defaultValue={report.filters.storeId ?? ""}
                className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                <option value="">Вся сеть</option>
                {report.stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-bold uppercase text-zinc-500">
                Поиск
              </span>
              <input
                name="search"
                defaultValue={report.filters.search ?? ""}
                placeholder="ФИО, email, телефон, Langame user_id"
                className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
            <button
              type="submit"
              className="self-end rounded-md bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400"
            >
              Применить
            </button>
          </form>
        </section>

        <StaffDirectoryWorkspace report={report} />
      </div>
    </main>
  );
}

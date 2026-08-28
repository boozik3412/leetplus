import { redirect } from "next/navigation";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { StaffSupportTicketsWorkspace } from "@/components/staff-support-tickets-workspace";
import { requireCurrentUser } from "@/lib/auth";
import { getStaffSupportTickets } from "@/lib/staff-support-tickets";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function searchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function PlatformSupportTicketsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  if (
    process.env.GUEST_SUPPORT_SCHEMA_BRIDGE_MODE?.trim().toUpperCase() ===
    "ALLOW_CURRENT_187"
  ) {
    redirect("/administration");
  }
  const user = await requireCurrentUser();
  if (!user.isPlatformAdmin) {
    return (
      <main className="px-4 py-6 text-zinc-950 dark:text-zinc-100">
        <div className="mx-auto max-w-3xl rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h1 className="text-2xl font-semibold">Нет доступа</h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Общая очередь доступна только администраторам платформы LeetPlus.
          </p>
        </div>
      </main>
    );
  }

  const params = await searchParams;
  const report = await getStaffSupportTickets(
    {
      tenantId: searchParam(params.tenantId),
      status: searchParam(params.status),
      topic: searchParam(params.topic),
      assignedToUserId: searchParam(params.assignedToUserId),
      search: searchParam(params.search),
      pageSize: searchParam(params.pageSize),
    },
    { platform: true },
  );

  return (
    <main className="px-4 py-6 text-zinc-950 dark:text-zinc-100 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-7xl">
        <ReportBreadcrumbs
          current="Тикеты поддержки"
          items={[
            { href: "/dashboard", label: "Дашборд" },
            { href: "/administration", label: "Администрирование" },
          ]}
        />
        <header className="mb-6 mt-4">
          <p className="text-sm font-bold uppercase text-cyan-700 dark:text-cyan-300">
            Поддержка платформы
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Общая очередь обращений
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            Инциденты всех сетей с фильтрацией по tenant, теме, статусу и
            ответственному специалисту.
          </p>
        </header>
        <StaffSupportTicketsWorkspace
          report={report}
          canManage
          apiBasePath="/api/admin/support-tickets"
        />
      </div>
    </main>
  );
}

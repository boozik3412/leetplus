import { redirect } from "next/navigation";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { StaffSupportTicketsWorkspace } from "@/components/staff-support-tickets-workspace";
import { requireNetworkScopedUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getStaffSupportTickets } from "@/lib/staff-support-tickets";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function searchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SupportTicketsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  if (
    process.env.GUEST_SUPPORT_SCHEMA_BRIDGE_MODE?.trim().toUpperCase() ===
    "ALLOW_CURRENT_187"
  ) {
    redirect("/dashboard");
  }
  const user = await requireNetworkScopedUser({ storesFallback: "/dashboard" });
  if (!can(user, "view_support_tickets")) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const report = await getStaffSupportTickets({
    status: searchParam(params.status),
    topic: searchParam(params.topic),
    assignedToUserId: searchParam(params.assignedToUserId),
    search: searchParam(params.search),
    pageSize: searchParam(params.pageSize),
  });

  return (
    <main className="px-4 py-6 text-zinc-950 dark:text-zinc-100 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-7xl">
        <ReportBreadcrumbs
          current="Техническая поддержка"
          items={[{ href: "/dashboard", label: "Дашборд" }]}
        />
        <header className="mb-6 mt-4">
          <p className="text-sm font-bold uppercase text-emerald-700 dark:text-emerald-300">
            Поддержка игрового модуля
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Обращения гостей
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            Единая очередь сообщений о проблемах. Здесь можно назначить
            ответственного, изменить статус и оставить внутренний комментарий.
          </p>
        </header>
        <StaffSupportTicketsWorkspace
          report={report}
          canManage={can(user, "manage_support_tickets")}
          apiBasePath="/api/support/bug-reports"
        />
      </div>
    </main>
  );
}

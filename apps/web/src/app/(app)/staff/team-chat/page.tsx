import Link from "next/link";
import { redirect } from "next/navigation";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { StaffTeamChatWorkspace } from "@/components/staff-team-chat-workspace";
import { requireCurrentUser } from "@/lib/auth";
import { isCommunicationChatOnlyRole } from "@/lib/landing";
import { can } from "@/lib/permissions";
import {
  getStaffTeamChatReport,
  type StaffTeamChatFilters,
} from "@/lib/staff-team-chat";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function searchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function resolveFilters(params: Awaited<SearchParams>): StaffTeamChatFilters {
  return {
    channelId: searchParam(params.channelId),
    search: searchParam(params.search)?.trim(),
    pinned: searchParam(params.pinned),
    pageSize: searchParam(params.pageSize) ?? "80",
  };
}

export default async function StaffTeamChatPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await requireCurrentUser();

  if (!can(user, "view_communications")) {
    redirect("/dashboard");
  }
  const canViewStaff = can(user, "view_staff");
  const canOpenCommunicationsHub = !isCommunicationChatOnlyRole(user.role);

  const params = await searchParams;
  const requestedChannelId = searchParam(params.channelId) ?? null;
  const report = await getStaffTeamChatReport(resolveFilters(params));

  return (
    <main className="px-4 py-6 text-zinc-950 dark:text-zinc-100 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-7xl">
        <ReportBreadcrumbs
          current="Командный чат"
          items={[
            { href: "/dashboard", label: "Дашборд" },
            ...(canOpenCommunicationsHub
              ? [{ href: "/communications", label: "Коммуникации" }]
              : []),
          ]}
        />

        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase text-emerald-700 dark:text-emerald-300">
              Коммуникации
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Командный чат
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Операционная лента для смен, клубов и управляющих: объявления,
              инциденты, короткие сменные комментарии и контроль прочтения.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canOpenCommunicationsHub ? (
              <Link
                href="/communications"
                className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-semibold transition hover:border-emerald-400 hover:text-emerald-700 dark:border-zinc-800 dark:hover:border-emerald-500 dark:hover:text-emerald-200"
              >
                Обзор коммуникаций
              </Link>
            ) : null}
            {canViewStaff ? (
              <Link
                href="/staff/checklists"
                className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-semibold transition hover:border-emerald-400 hover:text-emerald-700 dark:border-zinc-800 dark:hover:border-emerald-500 dark:hover:text-emerald-200"
              >
                Чеклисты
              </Link>
            ) : null}
          </div>
        </div>

        <div className="mt-6">
          <StaffTeamChatWorkspace
            report={report}
            requestedChannelId={requestedChannelId}
          />
        </div>
      </div>
    </main>
  );
}

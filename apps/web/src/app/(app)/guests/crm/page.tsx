import { CrmLeadBoard } from "@/components/crm-lead-board";
import { CrmTabs } from "@/components/crm-tabs";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { requirePageAccess } from "@/lib/auth";
import { getGuestCrmLeads, getGuestCrmUsers } from "@/lib/guests";
import { can } from "@/lib/permissions";

export default async function GuestCrmPage() {
  const user = await requirePageAccess("/guests/crm");
  const [leads, users] = await Promise.all([
    getGuestCrmLeads(),
    // Staff without access to communications still see the board.
    getGuestCrmUsers().catch(() => []),
  ]);

  return (
    <main className="px-4 py-6 text-zinc-950 dark:text-zinc-100 md:px-6 md:py-8">
      <div className="mx-auto max-w-7xl">
        <ReportBreadcrumbs
          current="CRM и задачи"
          items={[
            { href: "/dashboard", label: "Дашборд" },
            { href: "/guests", label: "Гости" },
          ]}
        />
        <h1 className="text-3xl font-semibold tracking-tight">CRM и задачи</h1>

        <CrmTabs current="leads" />

        <section className="mt-5">
          <CrmLeadBoard
            leads={leads}
            users={users}
            canManage={can(user, "manage_guest_crm")}
            canLogContacts={can(user, "manage_communications")}
          />
        </section>
      </div>
    </main>
  );
}

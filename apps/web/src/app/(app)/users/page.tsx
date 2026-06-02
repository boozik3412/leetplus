import { redirect } from "next/navigation";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { UserAccountsPanel } from "@/components/user-accounts-panel";
import { requireCurrentUser } from "@/lib/auth";
import { canManageUserAccess } from "@/lib/roles";
import { getUserAccounts } from "@/lib/users";

export default async function UsersPage() {
  const user = await requireCurrentUser();

  if (!canManageUserAccess(user.role)) {
    redirect("/dashboard");
  }

  const data = await getUserAccounts();

  return (
    <main className="px-4 py-6 text-zinc-950 dark:text-zinc-100 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-7xl">
        <ReportBreadcrumbs
          current="Пользователи и роли"
          items={[{ href: "/dashboard", label: "Дашборд" }]}
        />

        <header className="mb-6">
          <p className="text-sm font-semibold uppercase text-emerald-700 dark:text-emerald-300">
            Управление
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Пользователи и роли
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            Выдавайте доступ сотрудникам сети: управляющим, маркетологам,
            закупщикам, старшим администраторам и администраторам клубов.
          </p>
        </header>

        <UserAccountsPanel currentUser={user} initialData={data} />
      </div>
    </main>
  );
}

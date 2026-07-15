import { redirect } from "next/navigation";
import { GamificationLogPanel } from "@/components/gamification-log-panel";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { requireCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

export default async function GamificationLogPage() {
  const user = await requireCurrentUser();

  if (!can(user, "view_guest_gamification")) {
    redirect("/dashboard");
  }

  return (
    <main className="px-4 py-6 text-zinc-950 dark:text-zinc-100 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-7xl">
        <ReportBreadcrumbs
          current="Игровой журнал"
          items={[
            { href: "/dashboard", label: "Дашборд" },
            { href: "/gamification", label: "Геймификация" },
          ]}
        />

        <header className="mb-6">
          <p className="text-sm font-semibold uppercase text-emerald-700 dark:text-emerald-300">
            Геймификация
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Игровой журнал
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            Диагностика действий гостя в игровом модуле, логов Langame и
            сравнения текущей боевой проверки с новым слоем Игрового журнала.
          </p>
        </header>

        <GamificationLogPanel />
      </div>
    </main>
  );
}

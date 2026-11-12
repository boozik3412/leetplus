import { ManualRewardsPanel } from "@/components/manual-rewards-panel";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { requirePageAccess } from "@/lib/auth";
import {
  getMarketingPromoScenarioRewards,
  getMarketingPromoScenarios,
} from "@/lib/marketing";
import { can } from "@/lib/permissions";

async function safeList<T>(promise: Promise<T[]>): Promise<T[]> {
  try {
    return await promise;
  } catch {
    return [];
  }
}

export default async function ManualRewardsPage() {
  const user = await requirePageAccess("/marketing/missions");

  const [missions, rewards] = await Promise.all([
    safeList(getMarketingPromoScenarios()),
    safeList(getMarketingPromoScenarioRewards()),
  ]);

  return (
    <main className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <ReportBreadcrumbs
          current="Ручные награды"
          items={[
            { href: "/dashboard", label: "Дашборд" },
            { href: "/marketing", label: "Маркетинг" },
          ]}
        />

        <ManualRewardsPanel
          missions={missions}
          rewards={rewards}
          canCreateGameMissions={can(user, "manage_guest_game_rules")}
        />
      </div>
    </main>
  );
}

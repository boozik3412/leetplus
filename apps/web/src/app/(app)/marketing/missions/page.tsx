import { MarketingMissionsPanel } from "@/components/marketing-missions-panel";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { requireCurrentUser } from "@/lib/auth";
import { getGuestAudiences } from "@/lib/guests";
import {
  getMarketingMissionRewards,
  getMarketingMissions,
} from "@/lib/marketing";
import { getStores } from "@/lib/stores";

async function safeList<T>(promise: Promise<T[]>): Promise<T[]> {
  try {
    return await promise;
  } catch {
    return [];
  }
}

export default async function MarketingMissionsPage() {
  await requireCurrentUser();

  const [missions, rewards, audiences, stores] = await Promise.all([
    safeList(getMarketingMissions()),
    safeList(getMarketingMissionRewards()),
    safeList(getGuestAudiences()),
    safeList(getStores()),
  ]);

  return (
    <main className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <ReportBreadcrumbs
          current="Промо-сценарии"
          items={[
            { href: "/dashboard", label: "Дашборд" },
            { href: "/marketing", label: "Маркетинг" },
          ]}
        />

        <MarketingMissionsPanel
          missions={missions}
          rewards={rewards}
          audiences={audiences}
          stores={stores}
        />
      </div>
    </main>
  );
}

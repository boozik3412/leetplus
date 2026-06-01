import { GuestGamificationPanel } from "@/components/guest-gamification-panel";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { requireCurrentUser } from "@/lib/auth";
import {
  getGuestAudiences,
  getGuestCrmLeads,
  getGuests,
  type GuestCrmLead,
  type GuestDashboardRow,
} from "@/lib/guests";
import {
  getGuestGamificationWorkspace,
  type GuestGamificationWorkspace,
} from "@/lib/guest-gamification";
import { getStores, type Store } from "@/lib/stores";

async function safeValue<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise;
  } catch {
    return fallback;
  }
}

async function safeNullable<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch {
    return null;
  }
}

const emptyWorkspace: GuestGamificationWorkspace = {
  summary: {
    profilesCount: 0,
    totalXp: 0,
    averageLevel: 0,
    activeLootBoxes: 0,
    activeMissions: 0,
    activeSeasons: 0,
    pendingRewards: 0,
    approvedRewards: 0,
    paidRewards: 0,
    expiredRewards: 0,
    plannedBudget: 0,
    pendingRewardAmount: 0,
    paidRewardAmount: 0,
  },
  profiles: [],
  lootBoxes: [],
  missions: [],
  seasons: [],
  rewards: [],
  events: [],
};

export default async function GuestGamificationPage() {
  await requireCurrentUser();

  const [workspace, audiences, stores, guestsResponse, leads] =
    await Promise.all([
      safeValue(getGuestGamificationWorkspace(), emptyWorkspace),
      safeValue(getGuestAudiences(), []),
      safeValue<Store[]>(getStores(), []),
      safeNullable(getGuests({ pageSize: "80", sort: "lastActivity" })),
      safeValue<GuestCrmLead[]>(getGuestCrmLeads(), []),
    ]);

  const guests: GuestDashboardRow[] = guestsResponse?.rows ?? [];

  return (
    <main className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <ReportBreadcrumbs
          current="Геймификация"
          items={[
            { href: "/dashboard", label: "Дашборд" },
            { href: "/guests", label: "Гости" },
          ]}
        />

        <GuestGamificationPanel
          initialWorkspace={workspace}
          audiences={audiences}
          stores={stores}
          guests={guests}
          leads={leads}
        />
      </div>
    </main>
  );
}

import { MarketingCampaignsPanel } from "@/components/marketing-campaigns-panel";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { requirePageAccess } from "@/lib/auth";
import { getGuestAudiences, getGuestCrmUsers } from "@/lib/guests";
import {
  getMarketingCampaigns,
  getMarketingPromoBundleLaunches,
  getMarketingPromoBundles,
} from "@/lib/marketing";
import { getStores } from "@/lib/stores";

// «Новая кампания» (UX plan 2.4): the six-step campaign wizard. It saves
// through the same campaign request the old one-screen form used.

async function safeList<T>(promise: Promise<T[]>): Promise<T[]> {
  try {
    return await promise;
  } catch {
    return [];
  }
}

export default async function NewMarketingCampaignPage() {
  await requirePageAccess("/marketing/new");

  const [groups, users, campaigns, promoBundles, promoBundleLaunches, stores] =
    await Promise.all([
      safeList(getGuestAudiences()),
      safeList(getGuestCrmUsers()),
      safeList(getMarketingCampaigns()),
      safeList(getMarketingPromoBundles()),
      safeList(getMarketingPromoBundleLaunches()),
      safeList(getStores()),
    ]);

  return (
    <main className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <ReportBreadcrumbs
          current="Новая кампания"
          items={[{ href: "/marketing", label: "Кампании" }]}
        />
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-white">
          Новая кампания
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
          Шесть коротких шагов: цель, группа гостей, механика, канал, кто
          отвечает и как поймём результат. Кампания сохранится черновиком.
        </p>
        <MarketingCampaignsPanel
          view="new"
          campaigns={campaigns}
          audiences={groups}
          users={users}
          promoBundles={promoBundles}
          promoBundleLaunches={promoBundleLaunches}
          stores={stores}
        />
      </div>
    </main>
  );
}

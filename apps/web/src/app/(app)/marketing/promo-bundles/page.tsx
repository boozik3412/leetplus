import { MarketingPromoBundlesWorkspace } from "@/components/marketing-campaigns-panel";
import { BusinessSnapshotGate } from "@/components/business-snapshot-gate";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { requireCurrentUser } from "@/lib/auth";
import { safeGetBusinessSnapshot } from "@/lib/business-snapshots";
import {
  getMarketingPromoBundleLaunches,
  getMarketingPromoBundleReconciliation,
  getMarketingPromoBundles,
  getMarketingPromoBundleUsages,
  getMarketingTariffConditions,
  type MarketingTariffConditions,
} from "@/lib/marketing";
import { getProducts } from "@/lib/products";
import { getStores } from "@/lib/stores";

async function safeList<T>(promise: Promise<T[]>): Promise<T[]> {
  try {
    return await promise;
  } catch {
    return [];
  }
}

async function safeValue<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise;
  } catch {
    return fallback;
  }
}

const emptyMarketingTariffConditions: MarketingTariffConditions = {
  groups: [],
  periods: [],
  types: [],
  summary: { groups: 0, periods: 0, types: 0, latestAt: null },
};

export default async function MarketingPromoBundlesPage() {
  await requireCurrentUser();

  const [
    promoBundles,
    products,
    promoBundleLaunches,
    promoBundleUsages,
    promoBundleReconciliation,
    tariffConditions,
    stores,
    tariffSnapshot,
  ] = await Promise.all([
    safeList(getMarketingPromoBundles()),
    safeList(getProducts()),
    safeList(getMarketingPromoBundleLaunches()),
    safeList(getMarketingPromoBundleUsages()),
    safeList(getMarketingPromoBundleReconciliation()),
    safeValue(getMarketingTariffConditions(), emptyMarketingTariffConditions),
    safeList(getStores()),
    safeGetBusinessSnapshot("TARIFFS"),
  ]);

  return (
    <main className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <ReportBreadcrumbs
          current="Промо-наборы"
          items={[
            { href: "/dashboard", label: "Дашборд" },
            { href: "/marketing", label: "Маркетинг" },
          ]}
        />

        <BusinessSnapshotGate snapshot={tariffSnapshot} type="TARIFFS" />

        <MarketingPromoBundlesWorkspace
          promoBundles={promoBundles}
          productOptions={products}
          promoBundleLaunches={promoBundleLaunches}
          promoBundleUsages={promoBundleUsages}
          promoBundleReconciliation={promoBundleReconciliation}
          tariffConditions={tariffConditions}
          stores={stores}
        />
      </div>
    </main>
  );
}

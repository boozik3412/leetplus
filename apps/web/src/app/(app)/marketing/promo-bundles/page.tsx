import { MarketingPromoBundlesWorkspace } from "@/components/marketing-campaigns-panel";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { requireCurrentUser } from "@/lib/auth";
import {
  getMarketingPromoBundleLaunches,
  getMarketingPromoBundleReconciliation,
  getMarketingPromoBundles,
  getMarketingPromoBundleUsages,
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

export default async function MarketingPromoBundlesPage() {
  await requireCurrentUser();

  const [
    promoBundles,
    products,
    promoBundleLaunches,
    promoBundleUsages,
    promoBundleReconciliation,
    stores,
  ] = await Promise.all([
    safeList(getMarketingPromoBundles()),
    safeList(getProducts()),
    safeList(getMarketingPromoBundleLaunches()),
    safeList(getMarketingPromoBundleUsages()),
    safeList(getMarketingPromoBundleReconciliation()),
    safeList(getStores()),
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

        <MarketingPromoBundlesWorkspace
          promoBundles={promoBundles}
          productOptions={products}
          promoBundleLaunches={promoBundleLaunches}
          promoBundleUsages={promoBundleUsages}
          promoBundleReconciliation={promoBundleReconciliation}
          stores={stores}
        />
      </div>
    </main>
  );
}

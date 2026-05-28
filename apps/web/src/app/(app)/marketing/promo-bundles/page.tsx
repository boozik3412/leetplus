import { MarketingPromoBundlesWorkspace } from "@/components/marketing-campaigns-panel";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { requireCurrentUser } from "@/lib/auth";
import { getMarketingPromoBundles } from "@/lib/marketing";

async function safeList<T>(promise: Promise<T[]>): Promise<T[]> {
  try {
    return await promise;
  } catch {
    return [];
  }
}

export default async function MarketingPromoBundlesPage() {
  await requireCurrentUser();

  const promoBundles = await safeList(getMarketingPromoBundles());

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

        <MarketingPromoBundlesWorkspace promoBundles={promoBundles} />
      </div>
    </main>
  );
}

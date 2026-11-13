import { BusinessSnapshotGate } from "@/components/business-snapshot-gate";
import {
  PromoBundlesWorkspace,
  type PromoBundlesView,
} from "@/components/promo-bundles-workspace";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { requirePageAccess } from "@/lib/auth";
import { safeGetBusinessSnapshot } from "@/lib/business-snapshots";
import { getGuestAudiences } from "@/lib/guests";
import {
  getMarketingPromoBundleLaunches,
  getMarketingPromoBundleReconciliation,
  getMarketingPromoBundles,
  getMarketingPromoBundleUsages,
  getMarketingTariffConditions,
  type MarketingTariffConditions,
} from "@/lib/marketing";
import { getProducts } from "@/lib/products";
import {
  promoBundleWizardSteps,
  type PromoBundleWizardStep,
} from "@/lib/promo-bundle-wizard";
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

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstParam(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.trim() || null;
}

export default async function MarketingPromoBundlesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requirePageAccess("/marketing/promo-bundles");

  const params = await searchParams;
  const editId = firstParam(params.edit);
  const requestedStep = firstParam(params.step);
  const initialStep = promoBundleWizardSteps.some(
    (step) => step.id === requestedStep,
  )
    ? (requestedStep as PromoBundleWizardStep)
    : null;
  const view: PromoBundlesView =
    editId || firstParam(params.view) === "new"
      ? "wizard"
      : firstParam(params.tab) === "usage"
        ? "usage"
        : "list";

  const [
    promoBundles,
    products,
    promoBundleLaunches,
    promoBundleUsages,
    promoBundleReconciliation,
    tariffConditions,
    stores,
    audiences,
    tariffSnapshot,
  ] = await Promise.all([
    safeList(getMarketingPromoBundles()),
    safeList(getProducts()),
    safeList(getMarketingPromoBundleLaunches()),
    safeList(getMarketingPromoBundleUsages()),
    view === "usage"
      ? safeList(getMarketingPromoBundleReconciliation())
      : Promise.resolve([]),
    safeValue(getMarketingTariffConditions(), emptyMarketingTariffConditions),
    safeList(getStores()),
    view === "wizard" ? safeList(getGuestAudiences()) : Promise.resolve([]),
    view === "usage"
      ? safeGetBusinessSnapshot("TARIFFS")
      : Promise.resolve(null),
  ]);
  const editedBundle = editId
    ? (promoBundles.find((bundle) => bundle.id === editId) ?? null)
    : null;

  return (
    <main className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <ReportBreadcrumbs
          current={
            view === "wizard"
              ? editedBundle
                ? editedBundle.name
                : "Новый промо-набор"
              : "Промо-наборы"
          }
          items={[
            { href: "/dashboard", label: "Дашборд" },
            { href: "/marketing", label: "Маркетинг" },
            ...(view === "wizard"
              ? [{ href: "/marketing/promo-bundles", label: "Промо-наборы" }]
              : []),
          ]}
        />

        {view === "usage" && tariffSnapshot ? (
          <BusinessSnapshotGate snapshot={tariffSnapshot} type="TARIFFS" />
        ) : null}

        <div className="mt-6">
          <PromoBundlesWorkspace
            view={view}
            editId={editedBundle?.id ?? null}
            usageBundleId={firstParam(params.bundle)}
            initialStep={initialStep}
            promoBundles={promoBundles}
            promoBundleLaunches={promoBundleLaunches}
            promoBundleUsages={promoBundleUsages}
            promoBundleReconciliation={promoBundleReconciliation}
            products={products}
            tariffConditions={tariffConditions}
            stores={stores}
            audiences={audiences}
          />
        </div>
      </div>
    </main>
  );
}

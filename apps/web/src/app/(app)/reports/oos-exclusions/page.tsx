import { OosExclusionsManager } from "@/components/oos-exclusions-manager";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { requireCurrentUser } from "@/lib/auth";
import { getProducts } from "@/lib/products";
import { getOosExclusions } from "@/lib/reports";

export default async function OosExclusionsPage() {
  await requireCurrentUser();
  const [exclusions, products] = await Promise.all([
    getOosExclusions(),
    getProducts(),
  ]);

  return (
    <main className="px-6 py-8 text-zinc-950">
      <div className="mx-auto max-w-6xl">
        <ReportBreadcrumbs
          current="Исключения OOS"
          items={[
            { href: "/dashboard", label: "Дашборд" },
            { href: "/assortment/dashboard", label: "Ассортимент" },
            { href: "/reports", label: "Отчёты" },
          ]}
        />
        <div>
          <p className="text-sm font-medium text-emerald-700">Отчёты</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Исключения OOS
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-zinc-600">
            Управление товарами и услугами, которые не должны попадать в
            рекомендации по out-of-stock и потребности.
          </p>
        </div>

        <OosExclusionsManager exclusions={exclusions} products={products} />
      </div>
    </main>
  );
}

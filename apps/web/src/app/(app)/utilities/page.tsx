import { ProductParsingUtility } from "@/components/product-parsing-utility";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { requirePageAccess } from "@/lib/auth";
import { getProductParsingOverview } from "@/lib/product-parsing";

export default async function UtilitiesPage() {
  await requirePageAccess("/utilities");
  const overview = await getProductParsingOverview();

  return (
    <main className="px-6 py-8 text-zinc-950 dark:text-zinc-100">
      <div className="mx-auto max-w-7xl">
        <ReportBreadcrumbs
          current="Дубли товаров"
          items={[
            { href: "/dashboard", label: "Дашборд" },
            { href: "/products", label: "Товары" },
          ]}
        />
        <div>
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
            Товары
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Дубли товаров
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            Один и тот же товар в разных клубах часто называется по-разному.
            Здесь его можно объединить в один товар сети. Продажи, цены и
            остатки в клубах не меняются.
          </p>
        </div>

        <ProductParsingUtility initialOverview={overview} />
      </div>
    </main>
  );
}

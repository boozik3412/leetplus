import { ProductParsingUtility } from "@/components/product-parsing-utility";
import { requireCurrentUser } from "@/lib/auth";
import { getProductParsingOverview } from "@/lib/product-parsing";

export default async function UtilitiesPage() {
  await requireCurrentUser();
  const overview = await getProductParsingOverview();

  return (
    <main className="px-6 py-8 text-zinc-950 dark:text-zinc-100">
      <div className="mx-auto max-w-7xl">
        <div>
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
            Операционные инструменты
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Утилиты
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            Инструменты для приведения данных сети к единому виду без изменения
            фактических продаж, цен, поставщиков и остатков по клубам.
          </p>
        </div>

        <ProductParsingUtility initialOverview={overview} />
      </div>
    </main>
  );
}

import { ManualProductParsing } from "@/components/manual-product-parsing";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { requireCurrentUser } from "@/lib/auth";
import { getManualProductParsing } from "@/lib/product-parsing";

export default async function ManualProductParsingPage() {
  await requireCurrentUser();
  const overview = await getManualProductParsing();

  return (
    <main className="px-6 py-8 text-zinc-950 dark:text-zinc-100">
      <div className="mx-auto max-w-7xl">
        <ReportBreadcrumbs
          current="Ручной парсинг товаров"
          items={[
            { href: "/dashboard", label: "Дашборд" },
            { href: "/administration", label: "Администрирование" },
            { href: "/utilities", label: "Утилиты" },
          ]}
        />
        <div>
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
            Утилиты / Парсинг
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Ручной парсинг товаров
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            Ручной режим нужен для сложных случаев: можно создать сетевой SKU,
            добавить в него товары из разных клубов или поправить состав уже
            спарсенной группы.
          </p>
        </div>

        <ManualProductParsing initialOverview={overview} />
      </div>
    </main>
  );
}

import Link from "next/link";

import { ProductCreateForm } from "@/components/product-actions";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { requireCurrentUser } from "@/lib/auth";
import { getCategories, getSuppliers } from "@/lib/catalog";
import { can } from "@/lib/permissions";
import { getProductCatalogSummary } from "@/lib/products";

export default async function ProductsPage() {
  const [user, summary, categories, suppliers] = await Promise.all([
    requireCurrentUser(),
    getProductCatalogSummary(),
    getCategories(),
    getSuppliers(),
  ]);
  const canEditProducts = can(user, "edit_products");

  return (
    <main className="px-6 py-8 text-zinc-950">
      <div className="mx-auto max-w-7xl">
        <ReportBreadcrumbs
          current="Товары"
          items={[
            { href: "/dashboard", label: "Дашборд" },
            { href: "/assortment/dashboard", label: "Ассортимент" },
          ]}
        />

        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-zinc-500">LeetPlus</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">
              Товары
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-zinc-600">
              Короткий рабочий хаб: переходите к нужному сценарию, не ожидая
              загрузки всей истории ассортимента и остатков.
            </p>
          </div>
          <Link
            href="/products/table"
            className="inline-flex w-fit items-center rounded-xl bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800"
          >
            Открыть каталог SKU
          </Link>
        </div>

        <section
          aria-label="Сводка ассортимента"
          className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          <SummaryCard label="Всего SKU" value={summary.totalSku} />
          <SummaryCard
            label="Активные SKU"
            value={summary.operationalActiveSku}
            hint="Остаток сейчас или продажи за последние 14 дней."
          />
          <SummaryCard label="С категорией" value={summary.categorizedSku} />
          <SummaryCard label="С поставщиком" value={summary.suppliedSku} />
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <HubLink
            href="/products/table"
            title="Каталог SKU"
            description="Поиск, фильтры, сортировка и редактирование товаров с постраничной загрузкой."
            action="Открыть каталог"
          />
          <HubLink
            href="/products/movement/table"
            title="Движение товаров"
            description="Продажи и остатки по SKU за период — без смешения с каталогом."
            action="Открыть движение"
          />
          <HubLink
            href="/reports/oos/table"
            title="Нет в наличии"
            description="Оперативный список дефицита и рисков по ассортименту."
            action="Открыть дефицит"
          />
          <HubLink
            href="/reports/assortment-matrix/table"
            title="Матрица ассортимента"
            description="Настройка ролей и обязательности SKU для клубов."
            action="Открыть матрицу"
          />
          <HubLink
            href="/reports"
            title="Отчёты и экспорт"
            description="Экспортные сценарии и аналитика вынесены в самостоятельный раздел."
            action="Перейти к отчётам"
          />
          <HubLink
            href="/utilities/product-parsing/manual"
            title="Поступления"
            description="Ручная обработка товарных документов и поступлений."
            action="Открыть поступления"
          />
        </section>

        {canEditProducts ? (
          <details className="mt-6 rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-zinc-800">
              Добавить товар
            </summary>
            <div className="border-t border-zinc-200 p-5">
              <ProductCreateForm
                categories={categories}
                suppliers={suppliers}
              />
            </div>
          </details>
        ) : null}
      </div>
    </main>
  );
}

function SummaryCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-zinc-500">{label}</p>
      {hint ? <p className="mt-1 text-xs text-zinc-500">{hint}</p> : null}
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function HubLink({
  href,
  title,
  description,
  action,
}: {
  href: string;
  title: string;
  description: string;
  action: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:ring-offset-2"
    >
      <h2 className="text-base font-semibold text-zinc-950">{title}</h2>
      <p className="mt-2 text-sm leading-5 text-zinc-600">{description}</p>
      <p className="mt-4 text-sm font-semibold text-zinc-700 group-hover:text-zinc-950">
        {action} →
      </p>
    </Link>
  );
}

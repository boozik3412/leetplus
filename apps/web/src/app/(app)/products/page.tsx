import { ProductCreateForm } from "@/components/product-actions";
import { ProductsTable } from "@/components/products-table";
import { requireCurrentUser } from "@/lib/auth";
import { getCategories, getSuppliers } from "@/lib/catalog";
import { can } from "@/lib/permissions";
import { getProducts } from "@/lib/products";
import { getSalesDetailReport, type SalesDetailRow } from "@/lib/reports";
import { getStores } from "@/lib/stores";

type ProductsPageProps = {
  searchParams?: Promise<{
    movementStoreId?: string;
    movementCategory?: string;
  }>;
};

export default async function ProductsPage({
  searchParams,
}: ProductsPageProps) {
  const params = await searchParams;
  const movementRange = lastFullDaysRange(7);
  const [user, products, categories, suppliers, stores, salesMovementReport] =
    await Promise.all([
      requireCurrentUser(),
      getProducts(),
      getCategories(),
      getSuppliers(),
      getStores(),
      getSalesDetailReport(movementRange),
    ]);
  const canEditProducts = can(user, "edit_products");
  const operationalActiveProducts = products.filter(
    (product) => product.isOperationalActive,
  );
  const movementRows = buildMovementRows(
    salesMovementReport.rows,
    movementRange.from,
    movementRange.to,
    {
      storeId: params?.movementStoreId ?? "",
      categoryName: params?.movementCategory ?? "",
    },
  );

  return (
    <main className="px-6 py-8 text-zinc-950">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <p className="text-sm font-medium text-zinc-500">LeetPlus</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Товары</h1>
        </div>

        {canEditProducts ? (
          <div className="mb-6">
            <ProductCreateForm categories={categories} suppliers={suppliers} />
          </div>
        ) : null}

        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-zinc-500">Всего SKU</p>
            <p className="mt-2 text-2xl font-semibold">{products.length}</p>
          </div>

          <div
            title="Товары с остатками либо с продажами за последние 14 дней"
            className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"
          >
            <p className="text-sm text-zinc-500">Активные SKU</p>
            <p className="mt-1 text-xs text-zinc-500">
              Остаток сейчас или продажи за последние 14 дней.
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {operationalActiveProducts.length}
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-zinc-500">Категории</p>
            <p className="mt-2 text-2xl font-semibold">
              {
                new Set(
                  products
                    .map((product) => product.category?.name)
                    .filter(Boolean),
                ).size
              }
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-zinc-500">Поставщики</p>
            <p className="mt-2 text-2xl font-semibold">
              {
                new Set(
                  products
                    .map((product) => product.supplier?.name)
                    .filter(Boolean),
                ).size
              }
            </p>
          </div>
        </div>

        <ProductMovementSection
          from={movementRange.from}
          to={movementRange.to}
          rows={movementRows}
          stores={stores}
          categories={categories}
          selectedStoreId={params?.movementStoreId ?? ""}
          selectedCategoryName={params?.movementCategory ?? ""}
        />

        <details className="mt-6 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 border-b border-zinc-200 px-5 py-4 transition-colors hover:bg-zinc-50 [&::-webkit-details-marker]:hidden">
            <span>
              <span className="block text-base font-semibold">Ассортимент</span>
              <span className="mt-1 block text-sm text-zinc-500">
                Таблица SKU с фильтрами, экспортом и полным отчетом.
              </span>
            </span>
            <span className="text-sm font-semibold text-zinc-500">
              Развернуть
            </span>
          </summary>

          <div>
            <ProductsTable
              products={products}
              categories={categories}
              suppliers={suppliers}
              stores={stores}
              canEditProducts={canEditProducts}
            />
          </div>
        </details>
      </div>
    </main>
  );
}

type MovementRow = {
  key: string;
  label: string;
  meta: string;
  totalQuantity: number;
  totalRevenue: number;
  dailyQuantity: Record<string, number>;
};

function lastFullDaysRange(days: number) {
  const now = new Date();
  const toDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1),
  );
  const fromDate = new Date(toDate);
  fromDate.setUTCDate(fromDate.getUTCDate() - (days - 1));

  return {
    from: fromDate.toISOString().slice(0, 10),
    to: toDate.toISOString().slice(0, 10),
  };
}

function buildMovementRows(
  rows: SalesDetailRow[],
  from: string,
  to: string,
  filters: { storeId?: string; categoryName?: string } = {},
) {
  const dates = dateRange(from, to);
  const filteredRows = rows.filter((row) => {
    if (filters.storeId && row.storeId !== filters.storeId) {
      return false;
    }

    if (
      filters.categoryName &&
      (row.categoryName ?? "Без категории") !== filters.categoryName
    ) {
      return false;
    }

    return true;
  });

  return {
    dates,
    products: aggregateMovementRows(filteredRows, dates).slice(0, 20),
  };
}

function aggregateMovementRows(rows: SalesDetailRow[], dates: string[]) {
  const result = new Map<string, MovementRow>();

  rows.forEach((row) => {
    const categoryName = row.categoryName ?? "Без категории";
    const key = `${row.storeId}:${row.productId}`;
    const date = row.saleDate.slice(0, 10);
    const current =
      result.get(key) ??
      ({
        key,
        label: row.productNameAtSale ?? row.productName,
        meta: `${row.storeName} · ${categoryName}`,
        totalQuantity: 0,
        totalRevenue: 0,
        dailyQuantity: Object.fromEntries(dates.map((day) => [day, 0])),
      } satisfies MovementRow);

    current.totalQuantity += row.quantity;
    current.totalRevenue += row.revenue;
    current.dailyQuantity[date] =
      (current.dailyQuantity[date] ?? 0) + row.quantity;
    result.set(key, current);
  });

  return [...result.values()].sort(
    (a, b) =>
      b.totalRevenue - a.totalRevenue ||
      b.totalQuantity - a.totalQuantity ||
      a.label.localeCompare(b.label, "ru"),
  );
}

function dateRange(from: string, to: string) {
  const dates: string[] = [];
  const current = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);

  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return dates;
}

function ProductMovementSection({
  from,
  to,
  rows,
  stores,
  categories,
  selectedStoreId,
  selectedCategoryName,
}: {
  from: string;
  to: string;
  rows: ReturnType<typeof buildMovementRows>;
  stores: Awaited<ReturnType<typeof getStores>>;
  categories: Awaited<ReturnType<typeof getCategories>>;
  selectedStoreId: string;
  selectedCategoryName: string;
}) {
  const fullReportParams = new URLSearchParams();

  if (selectedStoreId) {
    fullReportParams.set("storeId", selectedStoreId);
  }

  if (selectedCategoryName) {
    fullReportParams.set("category", selectedCategoryName);
  }

  const fullReportHref = `/products/movement/table${
    fullReportParams.size > 0 ? `?${fullReportParams.toString()}` : ""
  }`;

  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-200 px-5 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-base font-semibold">Движение товара</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Продажи за последние 7 полных дней, {formatDateLabel(from)} -{" "}
              {formatDateLabel(to)}, по SKU с фильтрами по клубу и категории.
            </p>
          </div>
          <a
            href={fullReportHref}
            className="inline-flex w-fit items-center rounded-xl border border-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
          >
            Открыть полный отчет
          </a>
        </div>
        <form className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
          <label className="block text-xs font-medium uppercase text-zinc-500">
            Клуб
            <select
              name="movementStoreId"
              defaultValue={selectedStoreId}
              className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-950"
            >
              <option value="">Все клубы</option>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium uppercase text-zinc-500">
            Категория
            <select
              name="movementCategory"
              defaultValue={selectedCategoryName}
              className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-950"
            >
              <option value="">Все категории</option>
              <option value="Без категории">Без категории</option>
              {categories.map((category) => (
                <option key={category.id} value={category.name}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="rounded-xl bg-zinc-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
          >
            Применить
          </button>
        </form>
      </div>
      <MovementTable rows={rows.products} dates={rows.dates} />
    </section>
  );
}

function MovementTable({
  rows,
  dates,
}: {
  rows: MovementRow[];
  dates: string[];
}) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[920px]">
        <table className="w-full text-left text-sm">
          <thead className="uppercase text-zinc-400">
            <tr className="border-b border-zinc-200 bg-zinc-50">
              <th className="px-5 py-3 font-medium">Наименование</th>
              <th className="px-5 py-3 font-medium">Клуб / категория</th>
              {dates.map((date) => (
                <th key={date} className="px-3 py-3 text-right font-medium">
                  {formatShortDate(date)}
                </th>
              ))}
              <th className="px-5 py-3 text-right font-medium">Итого</th>
              <th className="px-5 py-3 text-right font-medium">Выручка</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.map((row) => (
              <tr key={row.key}>
                <td className="max-w-[280px] px-5 py-3 font-medium text-zinc-950">
                  {row.label}
                </td>
                <td className="px-5 py-3 text-zinc-500">{row.meta}</td>
                {dates.map((date) => (
                  <td key={date} className="px-3 py-3 text-right tabular-nums">
                    {formatQuantity(row.dailyQuantity[date] ?? 0)}
                  </td>
                ))}
                <td className="px-5 py-3 text-right font-semibold tabular-nums">
                  {formatQuantity(row.totalQuantity)}
                </td>
                <td className="px-5 py-3 text-right font-semibold tabular-nums">
                  {formatCurrency(row.totalRevenue)}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td
                  className="px-5 py-8 text-center text-zinc-500"
                  colSpan={dates.length + 4}
                >
                  Продаж за период нет.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 1,
  }).format(value);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 0,
    style: "currency",
    currency: "RUB",
  }).format(value);
}

function formatDateLabel(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return value;
  }

  return `${match[3]}.${match[2]}.${match[1]}`;
}

function formatShortDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return value;
  }

  return `${match[3]}.${match[2]}`;
}

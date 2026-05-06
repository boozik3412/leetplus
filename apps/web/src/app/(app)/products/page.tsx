import { ProductCreateForm } from "@/components/product-actions";
import { ProductsTable } from "@/components/products-table";
import { requireCurrentUser } from "@/lib/auth";
import { getCategories, getSuppliers } from "@/lib/catalog";
import { can } from "@/lib/permissions";
import { getProducts } from "@/lib/products";
import { getSalesDetailReport, type SalesDetailRow } from "@/lib/reports";
import { getStores } from "@/lib/stores";

export default async function ProductsPage() {
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

function buildMovementRows(rows: SalesDetailRow[], from: string, to: string) {
  const dates = dateRange(from, to);

  return {
    dates,
    products: aggregateMovementRows(
      rows,
      (row) => row.productId,
      (row) => row.productNameAtSale ?? row.productName,
      (row) => `${row.storeName} · ${row.categoryName ?? "Без категории"}`,
      dates,
    ).slice(0, 10),
    categories: aggregateMovementRows(
      rows,
      (row) => row.categoryName ?? "Без категории",
      (row) => row.categoryName ?? "Без категории",
      () => "Все клубы",
      dates,
    ).slice(0, 8),
    stores: aggregateMovementRows(
      rows,
      (row) => row.storeId,
      (row) => row.storeName,
      () => "Все категории",
      dates,
    ).slice(0, 8),
  };
}

function aggregateMovementRows(
  rows: SalesDetailRow[],
  keyGetter: (row: SalesDetailRow) => string,
  labelGetter: (row: SalesDetailRow) => string,
  metaGetter: (row: SalesDetailRow) => string,
  dates: string[],
) {
  const result = new Map<string, MovementRow>();

  rows.forEach((row) => {
    const key = keyGetter(row);
    const date = row.saleDate.slice(0, 10);
    const current =
      result.get(key) ??
      ({
        key,
        label: labelGetter(row),
        meta: metaGetter(row),
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
}: {
  from: string;
  to: string;
  rows: ReturnType<typeof buildMovementRows>;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-200 px-5 py-4">
        <h2 className="text-base font-semibold">Движение товара</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Продажи за последние 7 полных дней, {formatDateLabel(from)} -{" "}
          {formatDateLabel(to)}, по товарам, категориям и клубам.
        </p>
      </div>
      <div className="grid gap-px bg-zinc-200 lg:grid-cols-3">
        <MovementTable title="Товары" rows={rows.products} dates={rows.dates} />
        <MovementTable
          title="Категории"
          rows={rows.categories}
          dates={rows.dates}
        />
        <MovementTable title="Клубы" rows={rows.stores} dates={rows.dates} />
      </div>
    </section>
  );
}

function MovementTable({
  title,
  rows,
  dates,
}: {
  title: string;
  rows: MovementRow[];
  dates: string[];
}) {
  return (
    <div className="min-w-0 bg-white p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-xs">
          <thead className="uppercase text-zinc-400">
            <tr>
              <th className="py-2 pr-3 font-medium">Наименование</th>
              {dates.map((date) => (
                <th key={date} className="px-2 py-2 text-right font-medium">
                  {formatShortDate(date)}
                </th>
              ))}
              <th className="py-2 pl-2 text-right font-medium">Итого</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.map((row) => (
              <tr key={row.key}>
                <td className="max-w-[180px] py-2 pr-3">
                  <p className="truncate font-medium text-zinc-950">
                    {row.label}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-zinc-500">
                    {row.meta}
                  </p>
                </td>
                {dates.map((date) => (
                  <td key={date} className="px-2 py-2 text-right tabular-nums">
                    {formatQuantity(row.dailyQuantity[date] ?? 0)}
                  </td>
                ))}
                <td className="py-2 pl-2 text-right font-semibold tabular-nums">
                  {formatQuantity(row.totalQuantity)}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td
                  className="py-6 text-center text-zinc-500"
                  colSpan={dates.length + 2}
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

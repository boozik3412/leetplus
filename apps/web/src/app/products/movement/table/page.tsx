import Link from "next/link";

import { ReportEmailInlineForm } from "@/components/report-email-inline-form";
import { requireCurrentUser } from "@/lib/auth";
import { getCategories } from "@/lib/catalog";
import {
  getReplenishmentReport,
  getSalesDetailReport,
  type ReplenishmentRow,
  type SalesDetailRow,
} from "@/lib/reports";
import { getStores } from "@/lib/stores";

type MovementTablePageProps = {
  searchParams?: Promise<{
    storeId?: string;
    category?: string;
    days?: string;
  }>;
};

type MovementRow = {
  key: string;
  label: string;
  storeName: string;
  categoryName: string;
  totalQuantity: number;
  stockQuantity: number;
  totalRevenue: number;
  dailyQuantity: Record<string, number>;
};

export default async function ProductMovementTablePage({
  searchParams,
}: MovementTablePageProps) {
  const params = await searchParams;
  const days = resolvePeriodDays(params?.days);
  const range = lastFullDaysRange(days);
  const [user, report, replenishmentReport, stores, categories] =
    await Promise.all([
      requireCurrentUser(),
      getSalesDetailReport(range),
      getReplenishmentReport(range),
      getStores(),
      getCategories(),
    ]);
  const rows = buildMovementRows(report.rows, range.from, range.to, {
    storeId: params?.storeId ?? "",
    categoryName: params?.category ?? "",
    stockRows: replenishmentReport.rows,
  });
  const exportParams = buildExportParams({
    from: range.from,
    to: range.to,
    storeId: params?.storeId ?? "",
    category: params?.category ?? "",
  });

  return (
    <main className="min-h-screen bg-[var(--background)] text-zinc-950">
      <div className="px-4 py-4">
        <nav aria-label="Навигация" className="mb-3 text-sm text-zinc-500">
          <ol className="flex flex-wrap items-center gap-2">
            <li>
              <Link
                href="/dashboard"
                className="font-medium text-zinc-600 transition hover:text-zinc-950"
              >
                Дашборд
              </Link>
            </li>
            <li aria-hidden="true" className="text-zinc-300">
              /
            </li>
            <li>
              <Link
                href="/products"
                className="font-medium text-zinc-600 transition hover:text-zinc-950"
              >
                Товары
              </Link>
            </li>
            <li aria-hidden="true" className="text-zinc-300">
              /
            </li>
            <li className="font-medium text-zinc-950" aria-current="page">
              Движение товара
            </li>
          </ol>
        </nav>

        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-emerald-700">Полный отчет</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">
              Движение товара
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-zinc-600">
              Продажи за последние {days} полных дней,{" "}
              {formatDateLabel(range.from)} - {formatDateLabel(range.to)}, в
              разрезе SKU, клубов и категорий.
            </p>
          </div>
          <Link
            href="/products"
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
          >
            Вернуться к товарам
          </Link>
        </div>
      </div>

      <form className="grid gap-3 border-y border-zinc-200 bg-white px-4 py-4 md:grid-cols-[minmax(0,260px)_minmax(0,260px)_220px_auto] md:items-end">
        <label className="block text-xs font-medium uppercase text-zinc-500">
          Клуб
          <select
            name="storeId"
            defaultValue={params?.storeId ?? ""}
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
            name="category"
            defaultValue={params?.category ?? ""}
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
        <label className="block text-xs font-medium uppercase text-zinc-500">
          Период
          <select
            name="days"
            defaultValue={String(days)}
            className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-950"
          >
            <option value="7">7 дней</option>
            <option value="14">14 дней</option>
            <option value="21">21 день</option>
          </select>
        </label>
        <button
          type="submit"
          className="rounded-xl bg-zinc-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
        >
          Применить
        </button>
      </form>

      <div className="flex flex-col gap-3 border-b border-zinc-200 bg-white px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          <a
            href={`/api/reports/export?${exportParams("xlsx")}`}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Excel
          </a>
          <a
            href={`/api/reports/export?${exportParams("csv")}`}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            1C
          </a>
        </div>
        <ReportEmailInlineForm
          defaultEmail={user.email}
          from={range.from}
          to={range.to}
          storeId={params?.storeId ?? null}
          report="product-movement"
          extraPayload={{ category: params?.category ?? "" }}
          buttonLabel="Отправить"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1080px] text-left text-sm">
          <thead className="bg-zinc-100 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-4 py-3 font-medium">Товар</th>
              <th className="px-4 py-3 font-medium">Клуб</th>
              <th className="px-4 py-3 font-medium">Категория</th>
              {rows.dates.map((date) => (
                <th key={date} className="px-3 py-3 text-right font-medium">
                  {formatShortDate(date)}
                </th>
              ))}
              <th className="px-4 py-3 text-right font-medium">Итого</th>
              <th className="px-4 py-3 text-right font-medium">
                Остаток сегодня
              </th>
              <th className="px-4 py-3 text-right font-medium">Выручка</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.products.map((row) => (
              <tr key={row.key}>
                <td className="max-w-[320px] px-4 py-3 font-medium text-zinc-950">
                  {row.label}
                </td>
                <td className="px-4 py-3 text-zinc-700">{row.storeName}</td>
                <td className="px-4 py-3 text-zinc-700">{row.categoryName}</td>
                {rows.dates.map((date) => (
                  <td key={date} className="px-3 py-3 text-right tabular-nums">
                    {formatQuantity(row.dailyQuantity[date] ?? 0)}
                  </td>
                ))}
                <td className="px-4 py-3 text-right font-semibold tabular-nums">
                  {formatQuantity(row.totalQuantity)}
                </td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums">
                  {formatQuantity(row.stockQuantity)}
                </td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums">
                  {formatCurrency(row.totalRevenue)}
                </td>
              </tr>
            ))}
            {rows.products.length === 0 ? (
              <tr>
                <td
                  className="px-4 py-8 text-center text-zinc-500"
                  colSpan={rows.dates.length + 6}
                >
                  Продаж за период нет.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </main>
  );
}

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
  filters: {
    storeId?: string;
    categoryName?: string;
    stockRows: ReplenishmentRow[];
  },
) {
  const dates = dateRange(from, to);
  const stockByStoreProduct = new Map(
    filters.stockRows.map((row) => [
      `${row.storeId}:${row.productId}`,
      row.stockQuantity,
    ]),
  );
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
    products: aggregateMovementRows(filteredRows, dates, stockByStoreProduct),
  };
}

function aggregateMovementRows(
  rows: SalesDetailRow[],
  dates: string[],
  stockByStoreProduct: Map<string, number>,
) {
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
        storeName: row.storeName,
        categoryName,
        totalQuantity: 0,
        stockQuantity: stockByStoreProduct.get(key) ?? 0,
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

function resolvePeriodDays(value?: string) {
  const days = Number(value);

  return days === 14 || days === 21 ? days : 7;
}

function buildExportParams({
  from,
  to,
  storeId,
  category,
}: {
  from: string;
  to: string;
  storeId: string;
  category: string;
}) {
  return (format: "csv" | "xlsx") => {
    const params = new URLSearchParams({
      report: "product-movement",
      format,
      from,
      to,
    });

    if (storeId) {
      params.set("storeId", storeId);
    }

    if (category) {
      params.set("category", category);
    }

    return params.toString();
  };
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

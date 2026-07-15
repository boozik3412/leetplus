import Link from "next/link";

import { CategoryTriageTable } from "@/components/category-triage-table";
import { requireCurrentUser } from "@/lib/auth";
import { getCategories } from "@/lib/catalog";
import { can } from "@/lib/permissions";
import { getProductCatalog } from "@/lib/products";

type CategoryTriagePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CategoryTriagePage({
  searchParams,
}: CategoryTriagePageProps) {
  const params = await searchParams;
  const name = firstParam(params.name)?.trim() ?? "";
  const page = firstParam(params.page);
  const query = {
    page,
    pageSize: "50",
    name,
    categoryStatus: "unassigned" as const,
    sort: "name" as const,
    direction: "asc" as const,
  };
  const [user, catalog, categories] = await Promise.all([
    requireCurrentUser(),
    getProductCatalog(query),
    getCategories(),
  ]);

  return (
    <main className="min-h-screen bg-[var(--background)] px-4 py-5 text-zinc-950">
      <div className="mx-auto max-w-7xl">
        <nav aria-label="Навигация" className="mb-4 text-sm text-zinc-500">
          <ol className="flex flex-wrap items-center gap-2">
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
              Разбор категорий
            </li>
          </ol>
        </nav>

        <div className="flex flex-col gap-4 border-b border-zinc-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-emerald-700">
              Справочник LeetPlus
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">
              Разбор товаров без категории
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
              Langame не передаёт категории товаров. Здесь категория назначается
              в LeetPlus и остаётся под контролем вашей сети.
            </p>
          </div>
          <Link
            href="/categories"
            className="inline-flex w-fit rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
          >
            Настроить справочник категорий
          </Link>
        </div>

        <form
          action="/categories/triage"
          className="mt-5 flex max-w-xl flex-col gap-2 sm:flex-row"
        >
          <label htmlFor="name" className="sr-only">
            Поиск товара
          </label>
          <input
            id="name"
            name="name"
            defaultValue={name}
            placeholder="Найти товар без категории"
            className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
          />
          <button
            type="submit"
            className="rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800"
          >
            Найти
          </button>
        </form>

        <div className="mt-5 flex items-baseline justify-between gap-3">
          <p className="text-sm text-zinc-600">
            Без категории:{" "}
            <span className="font-semibold text-zinc-950">{catalog.total}</span>{" "}
            SKU
          </p>
          <p className="text-xs text-zinc-500">
            Страница {catalog.page} из {catalog.totalPages}
          </p>
        </div>

        <CategoryTriageTable
          catalog={catalog}
          categories={categories}
          canEditProducts={can(user, "edit_products")}
        />

        {catalog.totalPages > 1 ? (
          <nav
            aria-label="Страницы очереди"
            className="mt-5 flex items-center justify-between gap-3"
          >
            <PaginationLink
              href={pageHref(name, Math.max(1, catalog.page - 1))}
              disabled={catalog.page === 1}
            >
              Назад
            </PaginationLink>
            <PaginationLink
              href={pageHref(
                name,
                Math.min(catalog.totalPages, catalog.page + 1),
              )}
              disabled={catalog.page === catalog.totalPages}
            >
              Вперёд
            </PaginationLink>
          </nav>
        ) : null}
      </div>
    </main>
  );
}

function PaginationLink({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-400">
        {children}
      </span>
    );
  }

  return (
    <Link
      href={href}
      className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
    >
      {children}
    </Link>
  );
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function pageHref(name: string, page: number) {
  const params = new URLSearchParams({ page: String(page) });

  if (name) {
    params.set("name", name);
  }

  return `/categories/triage?${params.toString()}`;
}

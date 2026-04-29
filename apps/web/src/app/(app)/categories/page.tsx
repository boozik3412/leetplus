import {
  CatalogCreateForm,
  CatalogDeleteButton,
  CatalogRenameForm,
} from "@/components/catalog-actions";
import { getCategories } from "@/lib/catalog";
import { requireCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

export default async function CategoriesPage() {
  const user = await requireCurrentUser();
  const categories = await getCategories();
  const canEditCatalog = can(user, "edit_catalog");

  return (
    <main className="px-6 py-8 text-zinc-950">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Категории</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Справочник категорий для организации {user.tenantSlug}.leetplus.ru.
          </p>
        </div>

        {canEditCatalog ? <CatalogCreateForm kind="categories" /> : null}

        <div className="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
          <div className="border-b border-zinc-200 px-5 py-4">
            <h2 className="text-base font-semibold">Список категорий</h2>
          </div>
          <div className="divide-y divide-zinc-100">
            {categories.map((category) => (
              <div
                key={category.id}
                className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  {canEditCatalog ? (
                    <CatalogRenameForm
                      id={category.id}
                      name={category.name}
                      kind="categories"
                    />
                  ) : (
                    <p className="font-medium text-zinc-950">
                      {category.name}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-zinc-500">
                    SKU в категории: {category._count.products}
                  </p>
                </div>
                {canEditCatalog ? (
                  <CatalogDeleteButton id={category.id} kind="categories" />
                ) : null}
              </div>
            ))}

            {categories.length === 0 ? (
              <p className="px-5 py-6 text-sm text-zinc-500">
                Категорий пока нет.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}

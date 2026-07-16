import { LeetplusCategoryDirectory } from "@/components/leetplus-category-directory";
import { LangameCategoryImport } from "@/components/langame-category-import";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { getCategories, getLangameCategoryCatalog } from "@/lib/catalog";
import { requireCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

export default async function CategoriesPage() {
  const user = await requireCurrentUser();
  const [categories, langameCatalog] = await Promise.all([
    getCategories(),
    getLangameCategoryCatalog(),
  ]);
  const canEditCatalog = can(user, "edit_catalog");
  const canEditProducts = can(user, "edit_products");

  return (
    <main className="px-6 py-8 text-zinc-950">
      <div className="mx-auto max-w-5xl">
        <ReportBreadcrumbs
          current="Категории"
          items={[
            { href: "/dashboard", label: "Дашборд" },
            { href: "/assortment/dashboard", label: "Ассортимент" },
          ]}
        />
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Категории</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Справочник категорий для организации {user.tenantSlug}.leetplus.ru.
          </p>
        </div>

        <LeetplusCategoryDirectory
          categories={categories}
          canEditCatalog={canEditCatalog}
        />

        <LangameCategoryImport
          categories={categories}
          overview={langameCatalog}
          canEditCatalog={canEditCatalog}
          canEditProducts={canEditProducts}
        />
      </div>
    </main>
  );
}

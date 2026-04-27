import { ProductCsvImport } from "@/components/product-csv-import";
import { requireCurrentUser } from "@/lib/auth";

export default async function ImportPage() {
  const user = await requireCurrentUser();

  return (
    <main className="px-6 py-8 text-zinc-950">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Импорт</h1>
          <p className="mt-1 max-w-3xl text-sm text-zinc-600">
            Ручная загрузка CSV для организации {user.tenantSlug}.leetplus.ru.
            На этом шаге импортируем товары и проверяем ошибки до записи в БД.
          </p>
        </div>

        <ProductCsvImport />
      </div>
    </main>
  );
}

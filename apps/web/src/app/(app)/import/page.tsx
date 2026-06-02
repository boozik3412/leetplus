import { FactCsvImport } from "@/components/fact-csv-import";
import { ProductCsvImport } from "@/components/product-csv-import";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { requireCurrentUser } from "@/lib/auth";
import { getImportJobs, type ImportJob } from "@/lib/imports";
import { can } from "@/lib/permissions";

export default async function ImportPage() {
  const user = await requireCurrentUser();
  const canImport = can(user, "import_data");
  const importJobs = canImport ? await getImportJobs() : [];

  return (
    <main className="px-6 py-8 text-zinc-950 dark:text-zinc-100">
      <div className="mx-auto max-w-7xl">
        <ReportBreadcrumbs
          current="Импорт"
          items={[
            { href: "/dashboard", label: "Дашборд" },
            { href: "/administration", label: "Администрирование" },
          ]}
        />
        <div className="mb-8">
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
            CSV pipeline
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Импорт</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            Ручная загрузка CSV для организации {user.tenantSlug}.leetplus.ru:
            товары, остатки, продажи, списания и возвраты с проверкой ошибок до
            записи в БД.
          </p>
        </div>

        {canImport ? (
          <div className="space-y-6">
            <ProductCsvImport />
            <FactCsvImport kind="inventory" />
            <FactCsvImport kind="sales" />
            <FactCsvImport kind="movements" />
          </div>
        ) : (
          <p className="rounded-3xl border border-zinc-200 bg-white p-5 text-sm text-zinc-600 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
            У вашей роли нет доступа к загрузке CSV. Журнал импортов доступен
            только для просмотра.
          </p>
        )}

        <section className="mt-6 overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
            <h2 className="text-base font-semibold">Журнал импортов</h2>
          </div>

          {importJobs.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-left text-sm">
                <thead className="bg-zinc-100 text-xs uppercase text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                  <tr>
                    <th className="px-5 py-3 font-medium">Дата</th>
                    <th className="px-5 py-3 font-medium">Тип</th>
                    <th className="px-5 py-3 font-medium">Файл</th>
                    <th className="px-5 py-3 font-medium">Статус</th>
                    <th className="px-5 py-3 text-right font-medium">Строк</th>
                    <th className="px-5 py-3 text-right font-medium">Импорт</th>
                    <th className="px-5 py-3 text-right font-medium">Ошибок</th>
                    <th className="px-5 py-3 font-medium">Пользователь</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {importJobs.map((job) => (
                    <ImportJobRow key={job.id} job={job} />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-5 py-6 text-sm text-zinc-500">
              Импортов пока не было.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}

function ImportJobRow({ job }: { job: ImportJob }) {
  const isCompleted = job.status === "COMPLETED";

  return (
    <tr>
      <td className="whitespace-nowrap px-5 py-4 text-zinc-700 dark:text-zinc-300">
        {formatDate(job.createdAt)}
      </td>
      <td className="px-5 py-4 text-zinc-700 dark:text-zinc-300">{formatImportType(job.type)}</td>
      <td className="px-5 py-4 font-medium text-zinc-950 dark:text-zinc-50">
        {job.sourceFileName ?? "CSV без имени"}
      </td>
      <td className="px-5 py-4">
        <span
          className={[
            "rounded-full px-2.5 py-1 text-xs font-medium",
            isCompleted
              ? "bg-emerald-50 text-emerald-700"
              : "bg-red-50 text-red-700",
          ].join(" ")}
        >
          {isCompleted ? "Успешно" : "Ошибка"}
        </span>
      </td>
      <td className="px-5 py-4 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
        {job.totalRows}
      </td>
      <td className="px-5 py-4 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
        {job.importedRows}
      </td>
      <td className="px-5 py-4 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
        {job.errorsCount}
      </td>
      <td className="px-5 py-4 text-zinc-700 dark:text-zinc-300">
        {job.user?.fullName ?? job.user?.email ?? "—"}
      </td>
    </tr>
  );
}

function formatImportType(type: string) {
  const labels: Record<string, string> = {
    PRODUCT_CSV: "Товары",
    INVENTORY_CSV: "Остатки",
    SALES_CSV: "Продажи",
    STOCK_MOVEMENT_CSV: "Списания/возвраты",
  };

  return labels[type] ?? type;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

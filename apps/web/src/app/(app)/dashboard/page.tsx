import { getDashboardSummary } from "@/lib/dashboard-summary";

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatFacing(value: number) {
  return value.toFixed(1);
}

export default async function DashboardPage() {
  const summary = await getDashboardSummary();

  const cards: { label: string; value: string }[] = [
    { label: "Всего SKU", value: String(summary.totalSku) },
    { label: "Активные SKU", value: String(summary.activeSku) },
    { label: "Категорий", value: String(summary.categoriesCount) },
    { label: "Поставщиков", value: String(summary.suppliersCount) },
    { label: "Средняя маржинальность", value: formatPercent(summary.averageMarginPercent) },
    { label: "Средний фейсинг", value: formatFacing(summary.averageFacing) },
  ];

  return (
    <main className="px-6 py-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Дашборд</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Сводка по организации ({summary.tenantSlug}).
          </p>
        </div>

        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <li
              key={card.label}
              className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-950/40"
            >
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {card.label}
              </p>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                {card.value}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}

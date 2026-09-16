import type { DashboardExecutiveProductRevenue } from "@/lib/dashboard-executive";
import { presentExecutiveProductRevenueMetric } from "@/lib/metric-presentation";

export function MetricProductRevenueCard({
  projection,
}: {
  projection: DashboardExecutiveProductRevenue | null;
  requestError?: string | null;
}) {
  if (!projection) {
    return (
      <section
        aria-labelledby="product-revenue-title"
        className="mt-6 rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] p-5 shadow-sm"
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Деньги
        </p>
        <h2
          id="product-revenue-title"
          className="mt-1 text-xl font-semibold text-[var(--foreground)]"
        >
          Товарная выручка
        </h2>
        <p
          role="alert"
          className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm leading-6 text-red-800 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-200"
        >
          Не удалось загрузить товарную выручку. Обновите страницу и повторите
          попытку.
        </p>
      </section>
    );
  }

  const { metric, rows, scope } = projection;
  const presentation = presentExecutiveProductRevenueMetric(metric);
  const dates = new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
  const scopeLabel =
    scope.storeIds.length === 0
      ? "Нет активных клубов"
      : `${scope.storeIds.length} ${declineClubs(scope.storeIds.length)}`;

  return (
    <section
      aria-labelledby="product-revenue-title"
      className="mt-6 rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] p-5 shadow-sm"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Деньги
          </p>
          <h2
            id="product-revenue-title"
            className="mt-1 text-xl font-semibold text-[var(--foreground)]"
          >
            {metric.label}
          </h2>
          <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            {scopeLabel} ·{" "}
            {dates.format(new Date(`${scope.period.from}T00:00:00.000Z`))} —{" "}
            {dates.format(new Date(`${scope.period.to}T00:00:00.000Z`))}
            {scope.period.timezone === "PER_STORE"
              ? " · продажи показаны по учетным датам источника"
              : null}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 border-t border-[var(--border-soft)] pt-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div>
          <p className="text-3xl font-semibold tracking-tight tabular-nums text-[var(--foreground)]">
            {presentation.value}
          </p>
          <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            {metric.definition}
          </p>
          {presentation.message ? (
            <p
              className={[
                "mt-3 rounded-lg border px-3 py-2 text-sm leading-6",
                presentation.status === "danger"
                  ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-200"
                  : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-100",
              ].join(" ")}
            >
              {presentation.message}
            </p>
          ) : null}
          {presentation.coverage ? (
            <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
              {presentation.coverage}
            </p>
          ) : null}
          {presentation.sourceDate ? (
            <p className="mt-1 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
              {presentation.sourceDate}
            </p>
          ) : null}
        </div>

        <details className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface-muted)] p-4">
          <summary className="cursor-pointer text-sm font-semibold text-[var(--foreground)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600">
            Как складывается показатель
          </summary>
          {rows.length > 0 ? (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-zinc-500 dark:text-zinc-400">
                  <tr>
                    <th className="pb-2 pr-4 font-medium">Клуб</th>
                    <th className="pb-2 pr-4 text-right font-medium">
                      Выручка
                    </th>
                    <th className="pb-2 text-right font-medium">Операции</th>
                  </tr>
                </thead>
                <tbody className="text-[var(--foreground)]">
                  {rows.map((row) => {
                    const rowPresentation =
                      presentExecutiveProductRevenueMetric(row.metric);
                    const rowExplanation = [
                      rowPresentation.message,
                      rowPresentation.coverage,
                      rowPresentation.sourceDate,
                    ]
                      .filter(Boolean)
                      .join(" ");

                    return (
                      <tr
                        key={row.storeId}
                        className="border-t border-[var(--border-soft)]"
                      >
                        <td className="py-2 pr-4">
                          <p>{row.storeName}</p>
                          {rowExplanation ? (
                            <p className="mt-1 text-xs leading-5 text-zinc-600 dark:text-zinc-300">
                              {rowExplanation}
                            </p>
                          ) : null}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums">
                          {row.revenue === null
                            ? "—"
                            : formatRubles(row.revenue)}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {row.saleOperationCount ?? "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
              Детализация появится после подтверждённого покрытия продаж для
              выбранной выборки.
            </p>
          )}
        </details>
      </div>
    </section>
  );
}

function formatRubles(value: number) {
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(value)} ₽`;
}

function declineClubs(value: number) {
  const lastTwo = value % 100;
  const last = value % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return "клубов";
  if (last === 1) return "клуб";
  if (last >= 2 && last <= 4) return "клуба";
  return "клубов";
}

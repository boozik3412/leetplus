import { requireCurrentUser } from "@/lib/auth";
import { getAdminOverview } from "@/lib/admin-overview";

function formatDate(value: string | null) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

export default async function PlatformAdministrationPage() {
  const user = await requireCurrentUser();

  if (!user.isPlatformAdmin) {
    return (
      <main className="px-4 py-6 text-zinc-950 dark:text-zinc-100">
        <div className="mx-auto max-w-3xl rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h1 className="text-2xl font-semibold">Нет доступа</h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Раздел администрирования платформы доступен только пользователю с
            правами администратора LeetPlus.
          </p>
        </div>
      </main>
    );
  }

  const overview = await getAdminOverview();
  const cards = [
    { label: "Сетей", value: overview.totals.tenants },
    { label: "Пользователей", value: overview.totals.users },
    { label: "Клубов", value: overview.totals.stores },
    { label: "Товаров", value: overview.totals.products },
    { label: "Продаж", value: overview.totals.salesFacts },
    { label: "Источников Langame", value: overview.totals.integrationSources },
  ];

  return (
    <main className="px-4 py-6 text-zinc-950 dark:text-zinc-100">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6">
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
            LeetPlus control plane
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Администрирование
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            Служебный контур администратора платформы: сети tenant, источники
            Langame и последние синхронизации по всем клиентским контурам.
          </p>
        </div>

        <section
          id="overview"
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6"
        >
          {cards.map((card) => (
            <div
              key={card.label}
              className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
            >
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {card.label}
              </p>
              <p className="mt-2 text-2xl font-semibold tabular-nums">
                {formatNumber(card.value)}
              </p>
            </div>
          ))}
        </section>

        <section
          id="tenants"
          className="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
        >
          <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
            <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
              Сети
            </p>
            <h2 className="mt-1 text-base font-semibold">Сети tenant</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="bg-zinc-100 text-xs uppercase text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                <tr>
                  <th className="px-5 py-3 font-medium">Сеть</th>
                  <th className="px-5 py-3 text-right font-medium">Users</th>
                  <th className="px-5 py-3 text-right font-medium">Stores</th>
                  <th className="px-5 py-3 text-right font-medium">Products</th>
                  <th className="px-5 py-3 text-right font-medium">Sales</th>
                  <th className="px-5 py-3 font-medium">Langame источники</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {overview.tenants.map((tenant) => (
                  <tr key={tenant.id}>
                    <td className="px-5 py-4">
                      <p className="font-medium text-zinc-950 dark:text-zinc-50">
                        {tenant.name}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {tenant.slug}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-right tabular-nums">
                      {formatNumber(tenant.usersCount)}
                    </td>
                    <td className="px-5 py-4 text-right tabular-nums">
                      {formatNumber(tenant.storesCount)}
                    </td>
                    <td className="px-5 py-4 text-right tabular-nums">
                      {formatNumber(tenant.productsCount)}
                    </td>
                    <td className="px-5 py-4 text-right tabular-nums">
                      {formatNumber(tenant.salesFactsCount)}
                    </td>
                    <td className="px-5 py-4 text-zinc-700 dark:text-zinc-300">
                      {tenant.langameSources.length > 0
                        ? tenant.langameSources
                            .map(
                              (source) =>
                                `${source.domain} (${source.isActive ? "on" : "off"}, ${formatDate(source.lastSyncedAt)})`,
                            )
                            .join("; ")
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section
          id="sync-jobs"
          className="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
        >
          <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
            <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
              Синхронизации
            </p>
            <h2 className="mt-1 text-base font-semibold">Последние sync jobs</h2>
          </div>
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {overview.recentSyncJobs.map((job) => (
              <div key={job.id} className="px-5 py-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-zinc-950 dark:text-zinc-50">
                      {job.domain}
                    </p>
                    <p className="mt-1 text-zinc-500 dark:text-zinc-400">
                      {job.mode} / {job.trigger} / {formatDate(job.startedAt)}
                    </p>
                  </div>
                  <span
                    className={[
                      "rounded-full px-2.5 py-1 text-xs font-medium",
                      job.status === "SUCCESS"
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200"
                        : "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-200",
                    ].join(" ")}
                  >
                    {job.status}
                  </span>
                </div>
                <p className="mt-2 text-zinc-600 dark:text-zinc-400">
                  Клубов: {formatNumber(job.storesCount)}, товаров:{" "}
                  {formatNumber(job.productsCount)}, остатков:{" "}
                  {formatNumber(job.inventoryCount)}, продаж:{" "}
                  {formatNumber(job.salesCount)}, расхождений:{" "}
                  {formatNumber(job.discrepancyCount)}
                </p>
                {job.errorMessage ? (
                  <p className="mt-2 text-red-700 dark:text-red-300">
                    {job.errorMessage}
                  </p>
                ) : null}
              </div>
            ))}
            {overview.recentSyncJobs.length === 0 ? (
              <p className="px-5 py-6 text-sm text-zinc-500">
                Синхронизаций пока не было.
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}

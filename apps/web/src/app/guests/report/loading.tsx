const metricSkeletons = ["Гости", "CRM", "Группы", "Активность"];
const tableRows = Array.from({ length: 8 }, (_, index) => index);

export default function GuestReportLoading() {
  return (
    <main className="min-h-screen bg-zinc-50 px-5 py-5 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="mx-auto max-w-[1760px]">
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <span className="h-4 w-20 rounded-full bg-zinc-200 dark:bg-zinc-800" />
          <span>/</span>
          <span className="h-4 w-14 rounded-full bg-zinc-200 dark:bg-zinc-800" />
          <span>/</span>
          <span className="h-4 w-32 rounded-full bg-zinc-200 dark:bg-zinc-800" />
        </div>

        <header className="mt-4 flex flex-col gap-4 border-b border-zinc-200 pb-5 dark:border-zinc-800 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase text-emerald-700 dark:text-emerald-300">
              Гости
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Готовим отчет по гостям
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-zinc-500">
              Загружаем выбранный сегмент, CRM-данные, группы и фильтры.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <LoadingPill width="w-16" />
            <LoadingPill width="w-24" />
            <LoadingPill width="w-36" dark />
          </div>
        </header>

        <section className="mt-5 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-6">
            {["С даты", "По дату", "Клуб", "Группа", "Сегмент", "Поиск"].map(
              (label) => (
                <div key={label}>
                  <p className="text-xs font-semibold uppercase text-zinc-500">
                    {label}
                  </p>
                  <div className="mt-1 h-10 rounded-md bg-zinc-100 dark:bg-zinc-900" />
                </div>
              ),
            )}
          </div>
        </section>

        <section className="mt-5 grid gap-4 lg:grid-cols-4">
          {metricSkeletons.map((label) => (
            <div
              key={label}
              className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
            >
              <p className="text-xs font-semibold uppercase text-zinc-500">
                {label}
              </p>
              <div className="mt-4 h-8 w-24 rounded-full bg-zinc-100 dark:bg-zinc-900" />
              <div className="mt-5 h-3 w-full rounded-full bg-zinc-100 dark:bg-zinc-900" />
            </div>
          ))}
        </section>

        <section className="mt-5 rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="border-b border-zinc-200 px-4 py-4 dark:border-zinc-800">
            <p className="text-xs font-semibold uppercase text-emerald-700 dark:text-emerald-300">
              Список гостей
            </p>
            <div className="mt-2 h-6 w-56 rounded-full bg-zinc-100 dark:bg-zinc-900" />
          </div>
          <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {tableRows.map((row) => (
              <div
                key={row}
                className="grid gap-4 px-4 py-4 sm:grid-cols-[1.5fr_1fr_1fr_1fr]"
              >
                <div>
                  <div className="h-4 w-48 rounded-full bg-zinc-100 dark:bg-zinc-900" />
                  <div className="mt-2 h-3 w-28 rounded-full bg-zinc-100 dark:bg-zinc-900" />
                </div>
                <div className="h-4 w-24 rounded-full bg-zinc-100 dark:bg-zinc-900" />
                <div className="h-4 w-20 rounded-full bg-zinc-100 dark:bg-zinc-900" />
                <div className="h-4 w-32 rounded-full bg-zinc-100 dark:bg-zinc-900" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function LoadingPill({
  width,
  dark = false,
}: {
  width: string;
  dark?: boolean;
}) {
  return (
    <span
      className={`h-10 rounded-md ${
        dark
          ? "bg-zinc-950 dark:bg-emerald-400"
          : "border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
      } ${width}`}
    />
  );
}

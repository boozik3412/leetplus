export function ReportLoadingScreen() {
  return (
    <main className="min-h-screen bg-[var(--background)] px-6 py-8 text-zinc-950 dark:text-zinc-100">
      <div className="mx-auto flex min-h-[50vh] max-w-7xl items-center justify-center">
        <div className="rounded-3xl border border-zinc-200 bg-white px-8 py-7 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-500" />
          <p className="mt-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Готовим отчет
          </p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Собираем данные и строим таблицу.
          </p>
        </div>
      </div>
    </main>
  );
}

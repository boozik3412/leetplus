export default function AppLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--background)] px-6 text-zinc-950 dark:text-zinc-100">
      <section className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white px-6 py-6 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-500 dark:border-emerald-950 dark:border-t-emerald-400" />
        <p className="mt-4 text-base font-semibold">Загружаем LeetPlus</p>
        <p className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
          Проверяем сессию и подготавливаем рабочий экран.
        </p>
      </section>
    </main>
  );
}

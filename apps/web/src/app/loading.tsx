export default function RootLoading() {
  return (
    <main
      className="flex min-h-dvh items-center justify-center bg-[var(--background)] px-6 text-zinc-950 dark:text-zinc-100"
      aria-busy="true"
    >
      <div className="flex max-w-sm items-center gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600 motion-reduce:animate-none dark:border-emerald-950 dark:border-t-emerald-400" />
        <span className="text-sm font-semibold">Загружаем LeetPlus</span>
      </div>
    </main>
  );
}

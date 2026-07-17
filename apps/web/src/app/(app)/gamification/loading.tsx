function LoadingBlock({ className }: { className: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-xl bg-zinc-200/80 dark:bg-zinc-800/80 ${className}`}
    />
  );
}

export default function GamificationLoading() {
  return (
    <main className="px-4 py-6 sm:px-6 lg:px-8" aria-busy="true">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="space-y-3">
          <LoadingBlock className="h-4 w-40" />
          <LoadingBlock className="h-9 w-96 max-w-full" />
          <LoadingBlock className="h-5 w-full max-w-3xl" />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <LoadingBlock className="h-32" />
          <LoadingBlock className="h-32" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <LoadingBlock className="h-28" />
          <LoadingBlock className="h-28" />
          <LoadingBlock className="h-28" />
          <LoadingBlock className="h-28" />
        </div>
        <LoadingBlock className="h-12 w-full" />
        <div className="grid gap-4 lg:grid-cols-2">
          <LoadingBlock className="h-72" />
          <LoadingBlock className="h-72" />
        </div>
        <span className="sr-only">Загружаем геймификацию</span>
      </div>
    </main>
  );
}

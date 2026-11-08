import Link from "next/link";

export default function AppNotFound() {
  return (
    <main className="px-4 py-6 text-zinc-950 dark:text-zinc-100">
      <div className="mx-auto max-w-3xl rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-2xl font-semibold">Страница недоступна</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Такой страницы нет, запись удалена или раздел открыт только при
          доступе ко всей сети.
        </p>
        <Link
          href="/dashboard"
          className="mt-5 inline-flex min-h-10 items-center justify-center rounded-xl bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70 dark:bg-emerald-400 dark:text-zinc-950 dark:hover:bg-emerald-300"
        >
          На главную
        </Link>
      </div>
    </main>
  );
}

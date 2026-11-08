"use client";

import Link from "next/link";
import { useEffect } from "react";

export type RouteErrorProps = {
  error: Error & { digest?: string };
  unstable_retry: () => void;
};

const actionClassName =
  "inline-flex min-h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70";

/**
 * Shared fallback for the corporate route segments. A failed server render
 * (API 401/403, timeout, upstream outage) lands here instead of the bare
 * Next.js error page. The server error text is never shown: production only
 * forwards a digest, which support can match against server logs.
 */
export function RouteErrorScreen({ error, unstable_retry }: RouteErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="px-4 py-6 text-zinc-950 dark:text-zinc-100">
      <div
        role="alert"
        className="mx-auto max-w-3xl rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
      >
        <h1 className="text-2xl font-semibold">Не удалось открыть страницу</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Данные не загрузились. Обычно это значит, что сервер не ответил
          вовремя, закончилась сессия или у вашей роли нет доступа к этому
          разделу. Попробуйте ещё раз; если не поможет, вернитесь на главную
          или войдите заново.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => unstable_retry()}
            className={`${actionClassName} bg-zinc-950 text-white hover:bg-zinc-800 dark:bg-emerald-400 dark:text-zinc-950 dark:hover:bg-emerald-300`}
          >
            Повторить
          </button>
          <Link
            href="/dashboard"
            className={`${actionClassName} border border-zinc-200 text-zinc-800 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-900`}
          >
            На главную
          </Link>
          <Link
            href="/login"
            className={`${actionClassName} text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100`}
          >
            Войти заново
          </Link>
        </div>
        {error.digest ? (
          <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
            Код для поддержки:{" "}
            <span className="select-all font-mono">{error.digest}</span>
          </p>
        ) : null}
      </div>
    </main>
  );
}

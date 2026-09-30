"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

type Phase = "normal" | "slow" | "stalled";

/**
 * Wraps a screen skeleton. Says what is going on, and says it plainly when
 * the wait is long: after 6 s «дольше обычного», after 45 s an error with a
 * retry. Both notices float over the skeleton, so nothing shifts.
 */
export function LoadingRegion({
  label,
  children,
  slowAfterMs = 6_000,
  stalledAfterMs = 45_000,
}: {
  label: string;
  children: ReactNode;
  slowAfterMs?: number;
  stalledAfterMs?: number;
}) {
  const [phase, setPhase] = useState<Phase>("normal");
  useEffect(() => {
    const slow = setTimeout(() => setPhase("slow"), slowAfterMs);
    const stalled = setTimeout(() => setPhase("stalled"), stalledAfterMs);
    return () => {
      clearTimeout(slow);
      clearTimeout(stalled);
    };
  }, [slowAfterMs, stalledAfterMs]);
  return (
    <div aria-busy="true">
      <span role="status" className="sr-only">
        {phase === "stalled"
          ? "Не удалось загрузить экран."
          : phase === "slow"
            ? `${label} Это дольше обычного.`
            : label}
      </span>
      {phase === "normal" ? null : (
        <div className="pointer-events-none sticky top-3 z-30 h-0">
          <div className="pointer-events-auto mx-auto w-fit max-w-[min(92vw,34rem)]">
            {phase === "slow" ? <SlowNotice /> : <StalledNotice />}
          </div>
        </div>
      )}
      {children}
    </div>
  );
}

function SlowNotice() {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-[color-mix(in_srgb,var(--lp-warn)_35%,transparent)] bg-[var(--surface)] px-4 py-3 text-sm leading-5 text-[var(--foreground)] shadow-lg">
      <span
        aria-hidden="true"
        className="lp-spinner mt-0.5"
        style={{
          borderColor: "color-mix(in srgb, var(--lp-warn) 30%, transparent)",
          borderTopColor: "var(--lp-warn)",
        }}
      />
      <span>
        Считаем дольше обычного: период или выборка большие. Ответ ещё придёт.{" "}
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-[var(--lp-accent-bright)]"
        >
          Обновить
        </button>
      </span>
    </div>
  );
}

function StalledNotice() {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-[color-mix(in_srgb,var(--lp-danger)_40%,transparent)] bg-[var(--surface)] px-4 py-3 text-sm leading-5 text-[var(--foreground)] shadow-lg">
      <span
        aria-hidden="true"
        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--lp-danger)_16%,transparent)] text-[var(--lp-danger)]"
      >
        !
      </span>
      <span className="flex flex-col gap-2">
        <span>
          <strong className="font-semibold">Не удалось загрузить экран.</strong>{" "}
          Остальные разделы доступны. Обновите страницу или измените фильтры:
          запрос не запускает синхронизацию.
        </span>
        <span className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="min-h-9 rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
          >
            Повторить
          </button>
          <Link
            href="/dashboard"
            className="font-semibold text-[var(--accent-strong)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-[var(--lp-accent-bright)]"
          >
            К сводке сети
          </Link>
        </span>
      </span>
    </div>
  );
}

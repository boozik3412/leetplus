"use client";

import { useEffect, useState, type ReactNode } from "react";

type Phase = "normal" | "slow" | "long";

/**
 * Wraps a screen skeleton. Says what is going on, and says it plainly when
 * the wait is long: after 6 s «дольше обычного», after 45 s «всё ещё
 * считаем». A timer cannot know that a request failed, so the wait never
 * turns into an error: a real failure is shown by the route's error.tsx.
 * Both notices float over the skeleton, so nothing shifts.
 */
export function LoadingRegion({
  label,
  children,
  slowAfterMs = 6_000,
  longAfterMs = 45_000,
}: {
  label: string;
  children: ReactNode;
  slowAfterMs?: number;
  longAfterMs?: number;
}) {
  const [phase, setPhase] = useState<Phase>("normal");
  useEffect(() => {
    const slow = setTimeout(() => setPhase("slow"), slowAfterMs);
    const long = setTimeout(() => setPhase("long"), longAfterMs);
    return () => {
      clearTimeout(slow);
      clearTimeout(long);
    };
  }, [slowAfterMs, longAfterMs]);
  return (
    <div aria-busy="true">
      <span role="status" className="sr-only">
        {phase === "long"
          ? `${label} Всё ещё считаем, экран откроется сам.`
          : phase === "slow"
            ? `${label} Это дольше обычного.`
            : label}
      </span>
      {phase === "normal" ? null : (
        <div className="pointer-events-none sticky top-3 z-30 h-0">
          <div className="pointer-events-auto mx-auto w-fit max-w-[min(92vw,34rem)]">
            <WaitNotice long={phase === "long"} />
          </div>
        </div>
      )}
      {children}
    </div>
  );
}

function WaitNotice({ long }: { long: boolean }) {
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
        {long
          ? "Всё ещё считаем: выборка большая. Экран откроется сам, как только ответ придёт."
          : "Считаем дольше обычного: период или выборка большие. Ответ ещё придёт."}{" "}
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

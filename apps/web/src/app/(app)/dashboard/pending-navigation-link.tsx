"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

type PendingNavigationLinkProps = {
  href: string;
  className?: string;
  children: ReactNode;
  pendingLabel?: string;
  mode?: "overlay" | "inline";
};

export function PendingNavigationLink({
  href,
  className,
  children,
  pendingLabel = "Открываем...",
  mode = "overlay",
}: PendingNavigationLinkProps) {
  const [isPending, setIsPending] = useState(false);

  return (
    <Link
      href={href}
      aria-busy={isPending}
      data-pending={isPending ? "true" : "false"}
      onClick={(event) => {
        if (
          event.defaultPrevented ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          event.button !== 0
        ) {
          return;
        }

        setIsPending(true);
      }}
      className={className}
    >
      {children}
      {isPending && mode === "overlay" ? (
        <span
          aria-live="polite"
          className="pointer-events-none absolute inset-0 z-10 flex items-end justify-center rounded-[inherit] bg-white/72 p-4 backdrop-blur-[1px] dark:bg-zinc-950/72"
        >
          <span className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-zinc-950 px-3 py-2 text-center text-xs font-semibold text-white shadow-lg dark:bg-white dark:text-zinc-950">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/35 border-t-white dark:border-zinc-950/25 dark:border-t-zinc-950" />
            {pendingLabel}
          </span>
        </span>
      ) : null}
      {isPending && mode === "inline" ? (
        <span
          aria-label={pendingLabel}
          aria-live="polite"
          className="pointer-events-none absolute right-3 top-1/2 h-3 w-3 -translate-y-1/2 animate-spin rounded-full border-2 border-zinc-400/35 border-t-zinc-950 dark:border-zinc-500/35 dark:border-t-white"
        />
      ) : null}
    </Link>
  );
}

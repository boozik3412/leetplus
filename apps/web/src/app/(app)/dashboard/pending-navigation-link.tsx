"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

type PendingNavigationLinkProps = {
  href: string;
  className?: string;
  children: ReactNode;
  pendingLabel?: string;
};

export function PendingNavigationLink({
  href,
  className,
  children,
  pendingLabel = "Открываем...",
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
      {isPending ? (
        <span
          aria-live="polite"
          className="absolute inset-x-4 bottom-4 rounded-full bg-zinc-950 px-3 py-2 text-center text-xs font-semibold text-white shadow-lg dark:bg-white dark:text-zinc-950"
        >
          {pendingLabel}
        </span>
      ) : null}
    </Link>
  );
}

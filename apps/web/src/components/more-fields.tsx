import { CaretRight } from "@phosphor-icons/react/dist/ssr";
import type { ReactNode } from "react";

/**
 * Folds rarely used fields of a form under «Дополнительно», so a form shows
 * only the 3–5 fields people fill every time.
 */
export function MoreFields({
  children,
  label = "Дополнительно",
  defaultOpen = false,
}: {
  children: ReactNode;
  label?: string;
  defaultOpen?: boolean;
}) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-lg border border-zinc-200 dark:border-zinc-800"
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-zinc-200 dark:hover:bg-zinc-900 [&::-webkit-details-marker]:hidden">
        <CaretRight
          size={14}
          weight="bold"
          aria-hidden
          className="transition-transform group-open:rotate-90 motion-reduce:transition-none"
        />
        {label}
      </summary>
      <div className="space-y-4 border-t border-zinc-200 px-3 py-4 dark:border-zinc-800">
        {children}
      </div>
    </details>
  );
}

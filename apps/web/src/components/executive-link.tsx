"use client";

import Link from "next/link";
import { useState, type ComponentProps } from "react";
import { startNavigationFeedback } from "@/components/navigation-feedback";

/**
 * A summary link that answers the tap at once. The next page is computed on
 * the server for 1–3 s; without feedback a tap on a phone looks ignored, and
 * the global progress bar does not see clicks that the router handles.
 */
export function ExecutiveLink({
  className,
  onClick,
  prefetch = false,
  ...props
}: ComponentProps<typeof Link>) {
  const [pending, setPending] = useState(false);
  return (
    <Link
      {...props}
      prefetch={prefetch}
      aria-busy={pending || undefined}
      className={`${className ?? ""} aria-busy:cursor-progress aria-busy:animate-pulse`}
      onClick={(event) => {
        onClick?.(event);
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        )
          return;
        setPending(true);
        startNavigationFeedback();
      }}
    />
  );
}

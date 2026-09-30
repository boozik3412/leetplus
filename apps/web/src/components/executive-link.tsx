"use client";

import Link from "next/link";
import { useState, type ComponentProps } from "react";

/**
 * A summary link that answers the tap at once: the tapped card pulses while
 * the next page is computed on the server (1–3 s). The route bar and its label
 * come from NavigationFeedback, which sees every link click.
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
      }}
    />
  );
}

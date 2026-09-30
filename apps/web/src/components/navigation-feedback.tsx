"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_NAVIGATION_LABEL,
  navigationLabel,
} from "@/lib/navigation-labels";

const navigationStartEvent = "leetplus:navigation-start";
const navigationSlowMs = 6_000;
const navigationTimeoutMs = 45_000;

/**
 * Start the route bar by hand (a router.push that is not a link click).
 * `veil` also dims the regions marked data-lp-veil-target, for a filter
 * change on the same page: the old numbers stay, marked as being refreshed.
 */
export function startNavigationFeedback(
  label?: string,
  options: { veil?: boolean } = {},
) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(navigationStartEvent, {
        detail: { label, veil: options.veil === true },
      }),
    );
  }
}

/**
 * The label for a click that opens another page, else null. Runs in the
 * capture phase: by the bubble phase Next's Link has already called
 * preventDefault and taken the click over, and the bar would never start.
 */
function clickedNavigationLabel(event: MouseEvent) {
  if (
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return null;
  }

  const target = event.target;

  if (!(target instanceof Element)) {
    return null;
  }

  const anchor = target.closest("a[href]");

  if (
    !(anchor instanceof HTMLAnchorElement) ||
    anchor.target === "_blank" ||
    anchor.hasAttribute("download") ||
    anchor.dataset.navFeedback === "off"
  ) {
    return null;
  }

  const destination = new URL(anchor.href, window.location.href);
  const current = new URL(window.location.href);

  if (
    destination.origin !== current.origin ||
    (destination.pathname === current.pathname &&
      destination.search === current.search)
  ) {
    return null;
  }

  return (
    anchor.dataset.navLabel ??
    navigationLabel(destination.pathname, destination.search)
  );
}

export function NavigationFeedback() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, setIsPending] = useState(false);
  const [isSlow, setIsSlow] = useState(false);
  const [hasVeil, setHasVeil] = useState(false);
  const [label, setLabel] = useState(DEFAULT_NAVIGATION_LABEL);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slowRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const routeKey = `${pathname}?${searchParams.toString()}`;

  useEffect(() => {
    function finish() {
      setIsPending(false);
      setIsSlow(false);
      setHasVeil(false);

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      if (slowRef.current) {
        clearTimeout(slowRef.current);
        slowRef.current = null;
      }
    }

    finish();
  }, [routeKey]);

  useEffect(() => {
    function start(nextLabel?: string, veil = false) {
      setLabel(nextLabel || DEFAULT_NAVIGATION_LABEL);
      setIsPending(true);
      setIsSlow(false);
      setHasVeil(veil);

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      if (slowRef.current) {
        clearTimeout(slowRef.current);
      }

      slowRef.current = setTimeout(() => {
        setIsSlow(true);
        slowRef.current = null;
      }, navigationSlowMs);
      timeoutRef.current = setTimeout(() => {
        setIsPending(false);
        setIsSlow(false);
        setHasVeil(false);
        timeoutRef.current = null;
      }, navigationTimeoutMs);
    }

    function handleClick(event: MouseEvent) {
      const nextLabel = clickedNavigationLabel(event);

      if (nextLabel) {
        start(nextLabel);
      }
    }

    function handleStart(event: Event) {
      const detail = (event as CustomEvent<{ label?: string; veil?: boolean }>)
        .detail;
      start(detail?.label, detail?.veil === true);
    }

    document.addEventListener("click", handleClick, true);
    window.addEventListener(navigationStartEvent, handleStart);

    return () => {
      document.removeEventListener("click", handleClick, true);
      window.removeEventListener(navigationStartEvent, handleStart);

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      if (slowRef.current) {
        clearTimeout(slowRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;

    if (isPending && hasVeil) {
      root.dataset.lpVeil = "on";
    } else {
      delete root.dataset.lpVeil;
    }

    return () => {
      delete root.dataset.lpVeil;
    };
  }, [isPending, hasVeil]);

  if (!isPending) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={isSlow ? `${label} Дольше обычного.` : label}
      className="pointer-events-none fixed inset-x-0 top-0 z-[100]"
    >
      <div className="lp-bar">
        <b />
      </div>
      <div className="absolute right-3 top-3 inline-flex max-w-[calc(100vw-1.5rem)] items-center gap-2.5 rounded-full border border-[var(--border-soft)] bg-[var(--surface)] py-2 pl-2.5 pr-3.5 text-[13px] font-semibold text-[var(--foreground)] shadow-lg">
        <span aria-hidden="true" className="lp-spinner" />
        <span className="flex min-w-0 flex-col leading-4">
          <span className="truncate">{label}</span>
          {isSlow ? (
            <span className="text-[11px] font-normal text-zinc-500 dark:text-zinc-400">
              Считаем дольше обычного
            </span>
          ) : null}
        </span>
      </div>
    </div>
  );
}

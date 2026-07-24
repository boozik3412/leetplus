"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const navigationStartEvent = "leetplus:navigation-start";
const navigationTimeoutMs = 45_000;

export function startNavigationFeedback() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(navigationStartEvent));
  }
}

function isInternalNavigation(event: MouseEvent) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return false;
  }

  const target = event.target;

  if (!(target instanceof Element)) {
    return false;
  }

  const anchor = target.closest("a[href]");

  if (
    !(anchor instanceof HTMLAnchorElement) ||
    anchor.target === "_blank" ||
    anchor.hasAttribute("download")
  ) {
    return false;
  }

  const destination = new URL(anchor.href, window.location.href);
  const current = new URL(window.location.href);

  if (destination.origin !== current.origin) {
    return false;
  }

  return (
    destination.pathname !== current.pathname ||
    destination.search !== current.search
  );
}

export function NavigationFeedback() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, setIsPending] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const routeKey = `${pathname}?${searchParams.toString()}`;

  useEffect(() => {
    function finish() {
      setIsPending(false);

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    }

    finish();
  }, [routeKey]);

  useEffect(() => {
    function start() {
      setIsPending(true);

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        setIsPending(false);
        timeoutRef.current = null;
      }, navigationTimeoutMs);
    }

    function handleClick(event: MouseEvent) {
      if (isInternalNavigation(event)) {
        start();
      }
    }

    document.addEventListener("click", handleClick);
    window.addEventListener(navigationStartEvent, start);

    return () => {
      document.removeEventListener("click", handleClick);
      window.removeEventListener(navigationStartEvent, start);

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  if (!isPending) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Загружаем раздел"
      className="pointer-events-none fixed inset-x-0 top-0 z-[100]"
    >
      <div className="h-1 overflow-hidden bg-emerald-100/90 dark:bg-emerald-950/90">
        <div className="h-full w-1/2 animate-[navigation-progress_1.1s_ease-in-out_infinite] bg-emerald-500 motion-reduce:w-full motion-reduce:animate-none" />
      </div>
      <div className="absolute right-3 top-3 inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white/95 px-3 py-2 text-xs font-semibold text-zinc-700 shadow-lg backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/95 dark:text-zinc-200">
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600 motion-reduce:animate-none dark:border-emerald-950 dark:border-t-emerald-400" />
        Загружаем раздел
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme, type ThemeMode } from "@/components/theme-provider";

const themeOptions: { value: ThemeMode; label: string }[] = [
  { value: "light", label: "Светлая" },
  { value: "dark", label: "Тёмная" },
  { value: "system", label: "Системная" },
];

export function ThemeSwitcher({
  variant = "default",
}: {
  variant?: "default" | "compact";
}) {
  const { theme, setTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const isCompact = variant === "compact";
  const activeLabel =
    themeOptions.find((option) => option.value === theme)?.label ?? "Тема";

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        rootRef.current?.contains(event.target)
      ) {
        return;
      }

      setIsOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        title={`Тема: ${activeLabel}`}
        aria-label={`Тема: ${activeLabel}`}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
        className={[
          "inline-flex items-center justify-center border border-zinc-200 bg-white/80 text-zinc-600 shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70 dark:border-zinc-800 dark:bg-zinc-950/70 dark:text-zinc-300 dark:hover:border-zinc-700 dark:hover:bg-zinc-900 dark:hover:text-zinc-50",
          isCompact ? "h-8 w-8 rounded-xl" : "h-9 w-9 rounded-2xl",
        ].join(" ")}
      >
        <ThemeIcon mode={theme} />
      </button>

      {isOpen ? (
        <div className="absolute right-0 top-[calc(100%+0.5rem)] z-30 w-44 overflow-hidden rounded-2xl border border-zinc-200 bg-white p-1 shadow-xl shadow-zinc-950/10 dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-black/40">
          {themeOptions.map((option) => {
            const isActive = theme === option.value;

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  setTheme(option.value);
                  setIsOpen(false);
                }}
                className={[
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors",
                  isActive
                    ? "bg-zinc-950 text-white dark:bg-emerald-400 dark:text-zinc-950"
                    : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900 dark:hover:text-zinc-50",
                ].join(" ")}
              >
                <span className="inline-flex h-5 w-5 items-center justify-center">
                  <ThemeIcon mode={option.value} />
                </span>
                <span className="flex-1">{option.label}</span>
                {isActive ? (
                  <span aria-hidden="true" className="text-xs font-semibold">
                    ✓
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function ThemeIcon({ mode }: { mode: ThemeMode }) {
  if (mode === "light") {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2" />
        <path d="M12 20v2" />
        <path d="m4.93 4.93 1.41 1.41" />
        <path d="m17.66 17.66 1.41 1.41" />
        <path d="M2 12h2" />
        <path d="M20 12h2" />
        <path d="m6.34 17.66-1.41 1.41" />
        <path d="m19.07 4.93-1.41 1.41" />
      </svg>
    );
  }

  if (mode === "dark") {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      >
        <path d="M20.99 12.57A8 8 0 1 1 11.43 3a6.5 6.5 0 0 0 9.56 9.57Z" />
      </svg>
    );
  }

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    >
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8" />
      <path d="M12 16v4" />
    </svg>
  );
}

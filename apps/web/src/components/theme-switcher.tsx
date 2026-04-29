"use client";

import { useTheme, type ThemeMode } from "@/components/theme-provider";

const themeOptions: { value: ThemeMode; label: string }[] = [
  { value: "light", label: "Светлая" },
  { value: "dark", label: "Тёмная" },
  { value: "system", label: "Системная" },
];

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="rounded-xl border border-zinc-200 bg-white/80 p-1 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70">
      <div className="grid grid-cols-3 gap-1">
        {themeOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setTheme(option.value)}
            className={[
              "rounded-lg px-2 py-1.5 text-[11px] font-medium transition-colors",
              theme === option.value
                ? "bg-zinc-950 text-white dark:bg-emerald-400 dark:text-zinc-950"
                : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
            ].join(" ")}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

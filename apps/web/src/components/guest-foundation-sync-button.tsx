"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function GuestFoundationSyncButton({
  dateFrom,
  dateTo,
}: {
  dateFrom: string;
  dateTo: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<
    "idle" | "starting" | "started" | "error"
  >("idle");

  async function syncGuests() {
    setStatus("starting");

    try {
      const response = await fetch(
        "/api/integrations/langame/guests/foundation/sync/start",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dateFrom, dateTo }),
        },
      );

      if (!response.ok) {
        setStatus("error");
        return;
      }

      setStatus("started");
      window.setTimeout(() => router.refresh(), 3000);
    } catch {
      setStatus("error");
    }
  }

  const label =
    status === "starting"
      ? "Запуск..."
      : status === "started"
        ? "Синхронизация запущена"
        : "Обновить гостей";

  return (
    <div className="flex flex-col items-start gap-2 lg:items-end">
      <button
        type="button"
        onClick={syncGuests}
        disabled={status === "starting"}
        className="inline-flex h-10 items-center rounded-full border border-emerald-200 bg-emerald-50 px-4 text-sm font-semibold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100 disabled:cursor-wait disabled:opacity-70 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300"
      >
        {label}
      </button>
      {status === "error" ? (
        <p className="text-xs text-red-600 dark:text-red-300">
          Не удалось запустить синхронизацию.
        </p>
      ) : (
        <p className="text-xs text-zinc-500">
          {status === "started"
            ? "Можно продолжать работу: данные обновятся после фоновой синхронизации."
            : "Запустит фоновую синхронизацию гостей из LAngame."}
        </p>
      )}
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const quickSyncTitle =
  'Быстрая синхронизация за последние сутки, для более длительной синхронизации перейдите в "Настройки"';

export function DashboardQuickSyncButton() {
  const router = useRouter();
  const [isSyncing, setIsSyncing] = useState(false);
  const [status, setStatus] = useState<"success" | "error" | null>(null);

  async function quickSync() {
    setIsSyncing(true);
    setStatus(null);

    try {
      const today = getDateInputValue(0);
      const yesterday = getDateInputValue(-1);
      const response = await fetch("/api/integrations/langame/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode: "QUICK",
          dateFrom: yesterday,
          dateTo: today,
        }),
      });

      if (!response.ok) {
        setStatus("error");
        return;
      }

      setStatus("success");
      router.refresh();
    } catch {
      setStatus("error");
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <span className="relative inline-flex items-center gap-2">
      <button
        type="button"
        onClick={quickSync}
        disabled={isSyncing}
        title={quickSyncTitle}
        aria-label={quickSyncTitle}
        className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100 disabled:cursor-wait disabled:opacity-70 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:border-emerald-800"
      >
        {isSyncing ? "Обновление..." : "Обновить"}
      </button>
      {status ? (
        <span
          className={[
            "text-xs font-medium",
            status === "success"
              ? "text-emerald-700 dark:text-emerald-300"
              : "text-red-700 dark:text-red-300",
          ].join(" ")}
        >
          {status === "success" ? "готово" : "ошибка"}
        </span>
      ) : null}
    </span>
  );
}

function getDateInputValue(offsetDays: number) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

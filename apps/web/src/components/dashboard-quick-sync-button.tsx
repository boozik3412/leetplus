"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const quickSyncTitle =
  'Обновить товары, продажи и гостей с даты последней синхронизации. Для ручного периода перейдите в "Настройки"';

export function DashboardQuickSyncButton() {
  const router = useRouter();
  const [isSyncing, setIsSyncing] = useState(false);

  async function quickSync() {
    setIsSyncing(true);

    try {
      const [assortmentResponse, guestsResponse] = await Promise.all([
        fetch("/api/integrations/langame/sync", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            mode: "QUICK",
            catchUp: true,
          }),
        }),
        fetch("/api/integrations/langame/guests/foundation/sync/start", {
          method: "POST",
        }),
      ]);

      if (!assortmentResponse.ok && !guestsResponse.ok) {
        return;
      }

      if (guestsResponse.ok) {
        window.setTimeout(() => router.refresh(), 4000);
      } else {
        router.refresh();
      }
    } catch {
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
        className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold leading-5 text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100 disabled:cursor-wait disabled:opacity-70 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:border-emerald-800"
      >
        {isSyncing ? "Обновление..." : "Обновить данные"}
      </button>
    </span>
  );
}

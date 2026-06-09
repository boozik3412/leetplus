"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const guestSyncPollIntervalMs = 4000;
const guestSyncPollAttempts = 75;

const quickSyncTitle =
  "Обновить данные Langame только за сегодняшний день. Закрытые прошлые сутки загружаются автоматически в фоне.";

type GuestSyncStatus = {
  status: "IDLE" | "RUNNING" | "SUCCESS" | "FAILED";
  running: boolean;
};

export function DashboardQuickSyncButton() {
  const router = useRouter();
  const [isSyncing, setIsSyncing] = useState(false);

  async function quickSync() {
    setIsSyncing(true);
    const today = todayDateInput();

    try {
      const assortmentResponse = await fetch("/api/integrations/langame/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode: "QUICK",
          dateFrom: today,
          dateTo: today,
        }),
      });
      const guestsResponse = await fetch(
        "/api/integrations/langame/guests/foundation/sync/start",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            dateFrom: today,
            dateTo: today,
            includeGuestLogs: true,
            includeOperationLog: true,
            includeCashTransactions: true,
            includeWorkingShifts: true,
          }),
        },
      );

      if (!assortmentResponse.ok && !guestsResponse.ok) {
        return;
      }

      if (guestsResponse.ok) {
        await waitForGuestSyncCompletion();
      }

      await fetch("/api/integrations/langame/business-snapshots/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "ALL",
          dateFrom: today,
          dateTo: today,
        }),
      });

      router.refresh();
    } catch {
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <span className="relative inline-flex w-full items-center gap-2 lg:w-auto">
      <button
        type="button"
        onClick={quickSync}
        disabled={isSyncing}
        title={quickSyncTitle}
        aria-label={quickSyncTitle}
        className="inline-flex w-full items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold leading-5 text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100 disabled:cursor-wait disabled:opacity-70 lg:w-auto dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:border-emerald-800"
      >
        {isSyncing ? "Обновление сегодня..." : "Обновить сегодня"}
      </button>
    </span>
  );
}

async function waitForGuestSyncCompletion() {
  await sleep(guestSyncPollIntervalMs);

  for (let attempt = 0; attempt < guestSyncPollAttempts; attempt += 1) {
    const syncStatus = await fetchGuestSyncStatus();

    if (syncStatus && !syncStatus.running) {
      return syncStatus;
    }

    await sleep(guestSyncPollIntervalMs);
  }

  return null;
}

async function fetchGuestSyncStatus() {
  const response = await fetch(
    "/api/integrations/langame/guests/foundation/sync/status",
    { cache: "no-store" },
  );

  if (!response.ok) {
    return null;
  }

  return response.json() as Promise<GuestSyncStatus>;
}

function todayDateInput() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

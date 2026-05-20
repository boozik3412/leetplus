"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type SyncButtonStatus =
  | "idle"
  | "starting"
  | "running"
  | "success"
  | "error";

type GuestSyncStatus = {
  status: "IDLE" | "RUNNING" | "SUCCESS" | "FAILED";
  running: boolean;
  latestRun: {
    domain: string;
    status: string;
    startedAt: string;
    finishedAt: string | null;
    dateFrom: string | null;
    dateTo: string | null;
    guestsCount: number;
    sessionsCount: number;
    transactionsCount: number;
    productSalesLinked: number;
    errorMessage: string | null;
  } | null;
};

export function GuestFoundationSyncButton({
  dateFrom,
  dateTo,
}: {
  dateFrom: string;
  dateTo: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<SyncButtonStatus>("idle");
  const [latestRun, setLatestRun] = useState<GuestSyncStatus["latestRun"]>(null);

  useEffect(() => {
    let ignore = false;

    async function loadStatus() {
      const syncStatus = await fetchSyncStatus();
      if (ignore || !syncStatus) {
        return;
      }

      setLatestRun(syncStatus.latestRun);
      setStatus(syncStatus.running ? "running" : "idle");
    }

    void loadStatus();

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (status !== "running") {
      return;
    }

    let ignore = false;
    const interval = window.setInterval(async () => {
      const syncStatus = await fetchSyncStatus();
      if (ignore || !syncStatus) {
        return;
      }

      setLatestRun(syncStatus.latestRun);

      if (!syncStatus.running) {
        setStatus(syncStatus.status === "FAILED" ? "error" : "success");
        router.refresh();
      }
    }, 4000);

    return () => {
      ignore = true;
      window.clearInterval(interval);
    };
  }, [router, status]);

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

      const syncStatus = await fetchSyncStatus();
      setLatestRun(syncStatus?.latestRun ?? null);
      setStatus("running");
    } catch {
      setStatus("error");
    }
  }

  const label =
    status === "starting"
      ? "Запуск..."
      : status === "running"
        ? "Синхронизация идет..."
        : status === "success"
          ? "Синхронизация завершена"
          : status === "error"
            ? "Ошибка синхронизации"
        : "Обновить гостей";
  const helperText =
    status === "running"
      ? latestRun
        ? `Последний запуск: ${formatDateTime(latestRun.startedAt)}. Обновим страницу после завершения.`
        : "Проверяем статус фоновой синхронизации."
      : status === "success"
        ? latestRun
          ? `Готово: ${formatDateTime(latestRun.finishedAt ?? latestRun.startedAt)}. Гостей: ${formatNumber(latestRun.guestsCount)}, сессий: ${formatNumber(latestRun.sessionsCount)}, транзакций: ${formatNumber(latestRun.transactionsCount)}.`
          : "Синхронизация завершена."
        : status === "error"
          ? latestRun?.errorMessage ?? "Не удалось запустить или завершить синхронизацию."
          : latestRun
            ? `Последняя синхронизация: ${formatDateTime(latestRun.finishedAt ?? latestRun.startedAt)} (${latestRun.status}).`
            : "Запустит фоновую синхронизацию гостей из LAngame.";

  return (
    <div className="flex flex-col items-start gap-2 lg:items-end">
      <button
        type="button"
        onClick={syncGuests}
        disabled={status === "starting" || status === "running"}
        className="inline-flex h-10 items-center rounded-full border border-emerald-200 bg-emerald-50 px-4 text-sm font-semibold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100 disabled:cursor-wait disabled:opacity-70 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300"
      >
        {label}
      </button>
      {status === "error" ? (
        <p className="text-xs text-red-600 dark:text-red-300">
          {helperText}
        </p>
      ) : (
        <p className="max-w-xs text-xs text-zinc-500 lg:text-right">{helperText}</p>
      )}
    </div>
  );
}

async function fetchSyncStatus() {
  const response = await fetch(
    "/api/integrations/langame/guests/foundation/sync/status",
    { cache: "no-store" },
  );

  if (!response.ok) {
    return null;
  }

  return response.json() as Promise<GuestSyncStatus>;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

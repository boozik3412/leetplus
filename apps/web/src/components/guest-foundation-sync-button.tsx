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
  nextRun: {
    dateFrom: string;
    dateTo: string;
    basedOnFinishedAt: string | null;
  };
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
  compact = false,
  disabled = false,
}: {
  compact?: boolean;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<SyncButtonStatus>("idle");
  const [latestRun, setLatestRun] = useState<GuestSyncStatus["latestRun"]>(null);
  const [nextRun, setNextRun] = useState<GuestSyncStatus["nextRun"] | null>(
    null,
  );

  useEffect(() => {
    let ignore = false;

    async function loadStatus() {
      const syncStatus = await fetchSyncStatus();
      if (ignore || !syncStatus) {
        return;
      }

      setLatestRun(syncStatus.latestRun);
      setNextRun(syncStatus.nextRun);
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
      setNextRun(syncStatus.nextRun);

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
        },
      );

      if (!response.ok) {
        setStatus("error");
        return;
      }

      const syncStatus = await fetchSyncStatus();
      setLatestRun(syncStatus?.latestRun ?? null);
      setNextRun(syncStatus?.nextRun ?? null);
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
            ? `Последняя синхронизация: ${formatDateTime(latestRun.finishedAt ?? latestRun.startedAt)} (${formatSyncStatus(latestRun.status)}). Следующий запуск: ${nextRun ? `${formatDateLabel(nextRun.dateFrom)} - ${formatDateLabel(nextRun.dateTo)}` : "период уточняется"}.`
            : nextRun
              ? `Следующий запуск: ${formatDateLabel(nextRun.dateFrom)} - ${formatDateLabel(nextRun.dateTo)}.`
              : "Запустит фоновую синхронизацию гостей из Langame.";

  return (
    <div
      className={[
        "flex flex-col items-start gap-2",
        compact ? "" : "lg:items-end",
      ].join(" ")}
    >
      <button
        type="button"
        onClick={syncGuests}
        disabled={disabled || status === "starting" || status === "running"}
        className="inline-flex h-10 items-center rounded-full border border-emerald-200 bg-emerald-50 px-4 text-sm font-semibold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100 disabled:cursor-wait disabled:opacity-70 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300"
      >
        {label}
      </button>
      {!compact && status === "error" ? (
        <p className="text-xs text-red-600 dark:text-red-300">
          {helperText}
        </p>
      ) : !compact ? (
        <p className="max-w-xs text-xs text-zinc-500 lg:text-right">{helperText}</p>
      ) : null}
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

function formatSyncStatus(value: string) {
  if (value === "SUCCESS") {
    return "успешно";
  }

  if (value === "FAILED") {
    return "ошибка";
  }

  if (value === "RUNNING") {
    return "выполняется";
  }

  return value;
}

function formatDateLabel(value: string) {
  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    return value;
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

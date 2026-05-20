"use client";

import { useState } from "react";
import type { LangameSettings } from "@/lib/langame-settings";

type SyncPeriod = "today" | "last7" | "last30" | "custom";

type SyncResult = {
  sources: number;
  failedSources: number;
  stores: number;
  products: number;
  inventorySnapshots: number;
  salesFacts: number;
  clubRevenueFacts: number;
  discrepancies: number;
};

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

type CombinedSyncResult = {
  assortment: SyncResult | null;
  guests: GuestSyncStatus | null;
};

const guestSyncPollIntervalMs = 4000;
const guestSyncPollAttempts = 75;

const syncPeriodOptions: { value: SyncPeriod; label: string; caption: string }[] = [
  {
    value: "today",
    label: "Сегодня",
    caption: "Текущие сутки",
  },
  {
    value: "last7",
    label: "7 дней",
    caption: "Оперативная сверка",
  },
  {
    value: "last30",
    label: "30 дней",
    caption: "Контроль месяца",
  },
  {
    value: "custom",
    label: "Произвольно",
    caption: "Задать даты вручную",
  },
];

function getErrorMessage(data: unknown) {
  if (
    data &&
    typeof data === "object" &&
    "message" in data &&
    typeof data.message === "string"
  ) {
    return data.message;
  }

  return "Не удалось выполнить запрос";
}

export function LangameSyncPanel({
  initialSettings,
}: {
  initialSettings: LangameSettings;
}) {
  const today = getTodayInputValue();
  const [settings, setSettings] = useState(initialSettings);
  const [syncPeriod, setSyncPeriod] = useState<SyncPeriod>("last7");
  const [syncDateFrom, setSyncDateFrom] = useState(shiftDateInput(today, -6));
  const [syncDateTo, setSyncDateTo] = useState(today);
  const [syncResult, setSyncResult] = useState<CombinedSyncResult | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  function selectSyncPeriod(period: SyncPeriod) {
    setSyncPeriod(period);

    if (period === "today") {
      setSyncDateFrom(today);
      setSyncDateTo(today);
    } else if (period === "last7") {
      setSyncDateFrom(shiftDateInput(today, -6));
      setSyncDateTo(today);
    } else if (period === "last30") {
      setSyncDateFrom(shiftDateInput(today, -29));
      setSyncDateTo(today);
    }
  }

  async function syncAllLangameData() {
    setError(null);
    setSuccess(null);
    setSyncResult(null);
    setIsSyncing(true);

    try {
      const [assortmentResponse, guestStartResponse] = await Promise.all([
        fetch("/api/integrations/langame/sync", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            dateFrom: syncDateFrom,
            dateTo: syncDateTo,
            mode: "BACKFILL",
          }),
        }),
        fetch("/api/integrations/langame/guests/foundation/sync/start", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            dateFrom: syncDateFrom,
            dateTo: syncDateTo,
          }),
        }),
      ]);
      const assortmentData = (await assortmentResponse.json()) as unknown;
      const guestStartData = (await guestStartResponse.json()) as unknown;

      if (!assortmentResponse.ok) {
        setError(getErrorMessage(assortmentData));
        return;
      }

      if (!guestStartResponse.ok) {
        setError(getErrorMessage(guestStartData));
        return;
      }

      const guests = await waitForGuestSyncCompletion();
      const result = {
        assortment: assortmentData as SyncResult,
        guests,
      };
      setSyncResult(result);

      if (guests?.status === "FAILED") {
        setError(guests.latestRun?.errorMessage ?? "Гостевая синхронизация завершилась с ошибкой.");
      } else {
        setSuccess("Общая синхронизация LAngame завершена.");
      }

      await refreshSettings();
    } catch {
      setError("API недоступен");
    } finally {
      setIsSyncing(false);
    }
  }

  async function refreshSettings() {
    const response = await fetch("/api/integrations/langame/settings");

    if (response.ok) {
      setSettings((await response.json()) as LangameSettings);
    }
  }

  return (
    <section className="mt-6 space-y-6">
      <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
              Общая синхронизация
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              Все данные LAngame за выбранный период
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Одна кнопка обновляет клубы, товары, остатки, продажи, общую
              выручку, гостей, сессии, пополнения баланса, покупки бара и
              служебные логи.
            </p>
          </div>

          <button
            type="button"
            onClick={syncAllLangameData}
            disabled={
              !settings.hasApiKey ||
              !syncDateFrom ||
              !syncDateTo ||
              isSyncing
            }
            className="rounded-full bg-zinc-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400 dark:bg-emerald-400 dark:text-zinc-950 dark:hover:bg-emerald-300"
          >
            {isSyncing ? "Синхронизация..." : "Запустить общую синхронизацию"}
          </button>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {syncPeriodOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => selectSyncPeriod(option.value)}
                className={[
                  "rounded-lg border px-4 py-3 text-left transition",
                  syncPeriod === option.value
                    ? "border-zinc-950 bg-zinc-950 text-white dark:border-emerald-400 dark:bg-emerald-400 dark:text-zinc-950"
                    : "border-zinc-200 bg-zinc-50 text-zinc-900 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-zinc-700",
                ].join(" ")}
              >
                <span className="block text-sm font-semibold">{option.label}</span>
                <span className="mt-1 block text-xs opacity-70">
                  {option.caption}
                </span>
              </button>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Дата начала
              </span>
              <input
                type="date"
                value={syncDateFrom}
                onChange={(event) => {
                  setSyncPeriod("custom");
                  setSyncDateFrom(event.target.value);
                }}
                className="mt-2 block w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Дата окончания
              </span>
              <input
                type="date"
                value={syncDateTo}
                onChange={(event) => {
                  setSyncPeriod("custom");
                  setSyncDateTo(event.target.value);
                }}
                className="mt-2 block w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
          </div>
        </div>

        {isSyncing ? (
          <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
            <div className="flex items-center gap-3">
              <span className="h-3 w-3 animate-pulse rounded-full bg-amber-500" />
              <div>
                <p className="font-medium">Синхронизация выполняется</p>
                <p className="mt-1">
                  Период: {formatDateLabel(syncDateFrom)} -{" "}
                  {formatDateLabel(syncDateTo)}. Дождитесь результата на этой
                  странице.
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {syncResult ? <SyncResultSummary result={syncResult} /> : null}

        {error ? (
          <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        {success ? (
          <p className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {success}
          </p>
        ) : null}
      </div>

      <SyncHistory jobs={settings.syncJobs} />
    </section>
  );
}

function SyncResultSummary({ result }: { result: CombinedSyncResult }) {
  const guestRun = result.guests?.latestRun ?? null;

  return (
    <div className="mt-5 rounded-lg border border-zinc-100 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
      <h3 className="text-sm font-semibold">Результат синхронизации</h3>
      {result.assortment ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          <Metric label="Источников" value={result.assortment.sources} />
          <Metric label="Ошибок" value={result.assortment.failedSources} />
          <Metric label="Клубов" value={result.assortment.stores} />
          <Metric label="Товаров" value={result.assortment.products} />
          <Metric label="Остатков" value={result.assortment.inventorySnapshots} />
          <Metric label="Продаж" value={result.assortment.salesFacts} />
          <Metric label="Выручка клубов" value={result.assortment.clubRevenueFacts} />
          <Metric label="Расхождений" value={result.assortment.discrepancies} />
        </div>
      ) : null}
      {guestRun ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Гостей" value={guestRun.guestsCount} />
          <Metric label="Сессий" value={guestRun.sessionsCount} />
          <Metric label="Транзакций" value={guestRun.transactionsCount} />
          <Metric label="Покупок бара" value={guestRun.productSalesLinked} />
        </div>
      ) : null}
    </div>
  );
}

function SyncHistory({ jobs }: { jobs: LangameSettings["syncJobs"] }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
        <h2 className="text-base font-semibold">История синхронизаций</h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Последние запуски товарной части LAngame и файлы расхождений.
        </p>
      </div>

      {jobs.length > 0 ? (
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {jobs.map((job) => (
            <div key={job.id} className="px-5 py-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-zinc-950 dark:text-zinc-50">
                    {job.domain}
                  </p>
                  <p className="mt-1 text-zinc-500 dark:text-zinc-400">
                    {formatDateTime(job.startedAt)}
                  </p>
                </div>
                <span
                  className={[
                    "rounded-full px-2.5 py-1 text-xs font-medium",
                    job.status === "SUCCESS"
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-red-50 text-red-700",
                  ].join(" ")}
                >
                  {job.status === "SUCCESS" ? "Успешно" : "Ошибка"}
                </span>
              </div>
              <p className="mt-2 text-zinc-600 dark:text-zinc-400">
                {job.errorMessage ??
                  `Клубов: ${job.storesCount}, товаров: ${job.productsCount}, остатков: ${job.inventoryCount}, продаж: ${job.salesCount}, расхождений: ${job.discrepancyCount}`}
              </p>
              {job.hasDiscrepancyLog ? (
                <a
                  href={`/api/integrations/langame/sync-jobs/${job.id}/discrepancy-log`}
                  className="mt-2 inline-flex text-sm font-medium text-zinc-900 underline underline-offset-4 dark:text-zinc-100"
                >
                  Скачать файл расхождений
                </a>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="px-5 py-6 text-sm text-zinc-500">
          Синхронизаций пока не было.
        </p>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
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

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function getTodayInputValue() {
  const now = new Date();

  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

function shiftDateInput(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}

function formatDateLabel(value: string) {
  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    return value;
  }

  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

"use client";

import { useEffect, useState } from "react";
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
    diagnostics: {
      endpointErrors: Record<string, string>;
      pcTypesInClubs: FieldDiagnostics;
      pcTypeLinks: FieldDiagnostics;
    };
  } | null;
};

type FieldDiagnostics = {
  total: number;
  fieldCounts: Record<string, number>;
  candidateFields: Record<string, number>;
};

type SyncStepStatus = "idle" | "running" | "success" | "error";

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
  const [latestGuestStatus, setLatestGuestStatus] =
    useState<GuestSyncStatus | null>(null);
  const [assortmentStatus, setAssortmentStatus] =
    useState<SyncStepStatus>("idle");
  const [guestStatus, setGuestStatus] = useState<SyncStepStatus>("idle");
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    let ignore = false;

    async function loadGuestStatus() {
      const status = await fetchGuestSyncStatus();

      if (!ignore) {
        setLatestGuestStatus(status);
      }
    }

    void loadGuestStatus();

    return () => {
      ignore = true;
    };
  }, []);

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
    setAssortmentStatus("running");
    setGuestStatus("running");
    setIsSyncing(true);

    try {
      const [assortmentResult, guestResult] = await Promise.allSettled([
        syncAssortmentData(syncDateFrom, syncDateTo),
        syncGuestFoundation(syncDateFrom, syncDateTo),
      ]);
      const assortment =
        assortmentResult.status === "fulfilled" ? assortmentResult.value : null;
      const guests =
        guestResult.status === "fulfilled" ? guestResult.value : null;
      const result = {
        assortment,
        guests,
      };
      setSyncResult(result);
      setLatestGuestStatus(guests);

      if (!assortment) {
        setAssortmentStatus("error");
      } else {
        setAssortmentStatus(
          assortment.failedSources > 0 ? "error" : "success",
        );
      }

      if (guests?.status === "FAILED" || !guests) {
        setGuestStatus("error");
      } else {
        setGuestStatus("success");
      }

      if (!assortment || !guests) {
        const failure = [assortmentResult, guestResult].find(
          (item) => item.status === "rejected",
        );
        setError(
          failure?.status === "rejected" && failure.reason instanceof Error
            ? failure.reason.message
            : "Синхронизация завершилась не полностью. Проверьте детали ниже.",
        );
      } else if (guests.status === "FAILED") {
        setError(
          guests.latestRun?.errorMessage ??
            "Гостевая синхронизация завершилась с ошибкой.",
        );
      } else {
        setSuccess("Общая синхронизация Langame завершена.");
      }

      await refreshSettings();
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "API недоступен");
      setAssortmentStatus("error");
      setGuestStatus("error");
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
              Все данные Langame за выбранный период
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
          <SyncProgress
            assortmentStatus={assortmentStatus}
            guestStatus={guestStatus}
            periodFrom={syncDateFrom}
            periodTo={syncDateTo}
          />
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

      <LatestGuestDiagnostics status={latestGuestStatus} />
      <SyncHistory jobs={settings.syncJobs} />
    </section>
  );
}

function SyncProgress({
  assortmentStatus,
  guestStatus,
  periodFrom,
  periodTo,
}: {
  assortmentStatus: SyncStepStatus;
  guestStatus: SyncStepStatus;
  periodFrom: string;
  periodTo: string;
}) {
  return (
    <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
      <p className="font-medium">Синхронизация выполняется</p>
      <p className="mt-1">
        Период: {formatDateLabel(periodFrom)} - {formatDateLabel(periodTo)}.
        Дождитесь результата на этой странице.
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <SyncStepCard
          title="Ассортимент"
          description="Клубы, товары, остатки, продажи и выручка клубов."
          status={assortmentStatus}
        />
        <SyncStepCard
          title="Гости"
          description="Гости, сессии, транзакции, покупки бара, смены и ПК."
          status={guestStatus}
        />
      </div>
    </div>
  );
}

function SyncStepCard({
  title,
  description,
  status,
}: {
  title: string;
  description: string;
  status: SyncStepStatus;
}) {
  return (
    <div className="rounded-md border border-amber-200/80 bg-white/70 p-3 dark:border-amber-900/70 dark:bg-zinc-950/40">
      <div className="flex items-center justify-between gap-3">
        <p className="font-medium">{title}</p>
        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-amber-800 dark:bg-zinc-900 dark:text-amber-200">
          {syncStepLabel(status)}
        </span>
      </div>
      <p className="mt-1 text-xs opacity-80">{description}</p>
    </div>
  );
}

function SyncResultSummary({ result }: { result: CombinedSyncResult }) {
  const guestRun = result.guests?.latestRun ?? null;
  const guestDiagnostics = guestRun?.diagnostics ?? null;

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
      {guestDiagnostics ? (
        <PcDiagnostics diagnostics={guestDiagnostics} className="mt-4" />
      ) : null}
    </div>
  );
}

function LatestGuestDiagnostics({
  status,
}: {
  status: GuestSyncStatus | null;
}) {
  const latestRun = status?.latestRun;

  if (!latestRun) {
    return null;
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">
            Диагностика гостевой синхронизации
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Последний запуск: {latestRun.domain}, {formatDateTime(latestRun.startedAt)}.
          </p>
        </div>
        <span
          className={[
            "rounded-full px-2.5 py-1 text-xs font-medium",
            latestRun.status === "SUCCESS"
              ? "bg-emerald-50 text-emerald-700"
              : latestRun.status === "FAILED"
                ? "bg-red-50 text-red-700"
                : "bg-amber-50 text-amber-700",
          ].join(" ")}
        >
          {syncStatusLabel(latestRun.status)}
        </span>
      </div>
      <PcDiagnostics diagnostics={latestRun.diagnostics} className="mt-4" />
    </div>
  );
}

function PcDiagnostics({
  diagnostics,
  className = "",
}: {
  diagnostics: NonNullable<GuestSyncStatus["latestRun"]>["diagnostics"];
  className?: string;
}) {
  const endpointErrors = Object.entries(diagnostics.endpointErrors);
  const pcTypeFields = Object.keys(diagnostics.pcTypesInClubs.fieldCounts);
  const pcLinkFields = Object.keys(diagnostics.pcTypeLinks.fieldCounts);

  return (
    <div className={["grid gap-3 md:grid-cols-3", className].join(" ")}>
      <DiagnosticCard
        title="Типы ПК в клубах"
        value={diagnostics.pcTypesInClubs.total}
        details={pcTypeFields.length > 0 ? pcTypeFields.slice(0, 6).join(", ") : "полей нет"}
      />
      <DiagnosticCard
        title="Связи ПК с типами"
        value={diagnostics.pcTypeLinks.total}
        details={pcLinkFields.length > 0 ? pcLinkFields.slice(0, 6).join(", ") : "полей нет"}
      />
      <DiagnosticCard
        title="Ошибки endpoints"
        value={endpointErrors.length}
        details={
          endpointErrors.length > 0
            ? endpointErrors.map(([key]) => key).slice(0, 3).join(", ")
            : "ошибок нет"
        }
        tone={endpointErrors.length > 0 ? "danger" : "neutral"}
      />
    </div>
  );
}

function DiagnosticCard({
  title,
  value,
  details,
  tone = "neutral",
}: {
  title: string;
  value: number;
  details: string;
  tone?: "neutral" | "danger";
}) {
  return (
    <div
      className={[
        "rounded-md border bg-white px-3 py-2 dark:bg-zinc-950",
        tone === "danger"
          ? "border-red-200 dark:border-red-900/70"
          : "border-zinc-200 dark:border-zinc-800",
      ].join(" ")}
    >
      <p className="text-xs text-zinc-500">{title}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 truncate text-xs text-zinc-500" title={details}>
        {details}
      </p>
    </div>
  );
}

function SyncHistory({ jobs }: { jobs: LangameSettings["syncJobs"] }) {
  const latestJobs = getLatestSyncJobsByDomain(jobs);

  return (
    <div className="rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
        <h2 className="text-base font-semibold">История синхронизаций</h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Последние запуски товарной части Langame и файлы расхождений.
        </p>
      </div>

      {latestJobs.length > 0 ? (
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {latestJobs.map((job) => (
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
          {jobs.length > latestJobs.length ? (
            <p className="px-5 py-3 text-xs text-zinc-500 dark:text-zinc-400">
              Показан последний запуск по каждому источнику. Повторные ошибки
              по тем же доменам скрыты, чтобы история не дублировалась.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="px-5 py-6 text-sm text-zinc-500">
          Синхронизаций пока не было.
        </p>
      )}
    </div>
  );
}

function getLatestSyncJobsByDomain(jobs: LangameSettings["syncJobs"]) {
  const byDomain = new Map<string, LangameSettings["syncJobs"][number]>();

  jobs.forEach((job) => {
    if (!byDomain.has(job.domain)) {
      byDomain.set(job.domain, job);
    }
  });

  return Array.from(byDomain.values());
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

async function syncAssortmentData(dateFrom: string, dateTo: string) {
  const response = await fetch("/api/integrations/langame/sync", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      dateFrom,
      dateTo,
      mode: "BACKFILL",
    }),
  });
  const data = (await response.json()) as unknown;

  if (!response.ok) {
    throw new Error(getErrorMessage(data));
  }

  return data as SyncResult;
}

async function syncGuestFoundation(dateFrom: string, dateTo: string) {
  const response = await fetch(
    "/api/integrations/langame/guests/foundation/sync/start",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dateFrom,
        dateTo,
      }),
    },
  );
  const data = (await response.json()) as unknown;

  if (!response.ok) {
    throw new Error(getErrorMessage(data));
  }

  return waitForGuestSyncCompletion();
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

function syncStepLabel(value: SyncStepStatus) {
  if (value === "running") {
    return "идет";
  }

  if (value === "success") {
    return "готово";
  }

  if (value === "error") {
    return "ошибка";
  }

  return "ожидает";
}

function syncStatusLabel(value: string) {
  if (value === "SUCCESS") {
    return "Успешно";
  }

  if (value === "FAILED") {
    return "Ошибка";
  }

  if (value === "RUNNING") {
    return "Выполняется";
  }

  return value;
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

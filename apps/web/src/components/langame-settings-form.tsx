"use client";

import { useState } from "react";
import { GuestFoundationSyncButton } from "@/components/guest-foundation-sync-button";
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
  sourceResults: {
    domain: string;
    status: "SUCCESS" | "FAILED";
    stores: number;
    products: number;
    inventorySnapshots: number;
    salesFacts: number;
    clubRevenueFacts: number;
    discrepancies: number;
    discrepancyLogPath: string | null;
    errorMessage: string | null;
  }[];
};

const syncPeriodOptions: { value: SyncPeriod; label: string; caption: string }[] = [
  {
    value: "today",
    label: "Сегодня",
    caption: "Только текущие сутки",
  },
  {
    value: "last7",
    label: "7 дней",
    caption: "Оперативная проверка",
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

export function LangameSettingsForm({
  initialSettings,
}: {
  initialSettings: LangameSettings;
}) {
  const today = getTodayInputValue();
  const [tenantName, setTenantName] = useState(initialSettings.tenantName);
  const [apiKey, setApiKey] = useState("");
  const [domains, setDomains] = useState(initialSettings.domains.join("\n"));
  const [settings, setSettings] = useState(initialSettings);
  const [syncPeriod, setSyncPeriod] = useState<SyncPeriod>("last7");
  const [syncDateFrom, setSyncDateFrom] = useState(shiftDateInput(today, -6));
  const [syncDateTo, setSyncDateTo] = useState(today);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [domainsError, setDomainsError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
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

  async function saveSettings() {
    setError(null);
    setSuccess(null);
    setSyncResult(null);
    setDomainsError(null);

    const parsedDomains = parseDomainInput(domains);

    if (!parsedDomains.ok) {
      setDomainsError(parsedDomains.message);
      setError(parsedDomains.message);
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch("/api/integrations/langame/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tenantName: tenantName.trim(),
          apiKey: apiKey.trim() || undefined,
          domains: parsedDomains.domains,
        }),
      });
      const data = (await response.json()) as unknown;

      if (!response.ok) {
        setError(getErrorMessage(data));
        return;
      }

      setSettings(data as LangameSettings);
      setApiKey("");
      setSuccess("Настройки LAngame сохранены.");
    } catch {
      setError("API недоступен");
    } finally {
      setIsSaving(false);
    }
  }

  async function syncLangame() {
    setError(null);
    setSuccess(null);
    setSyncResult(null);
    setIsSyncing(true);

    try {
      const response = await fetch("/api/integrations/langame/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dateFrom: syncDateFrom,
          dateTo: syncDateTo,
          mode: "BACKFILL",
        }),
      });
      const data = (await response.json()) as unknown;

      if (!response.ok) {
        setError(getErrorMessage(data));
        return;
      }

      setSyncResult(data as SyncResult);
      setSuccess("Синхронизация LAngame завершена.");
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
      <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
              Синхронизация LAngame
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              Загрузка данных за выбранный период
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Управление вынесено отдельно: при большой сети синхронизация может
              занимать заметное время, поэтому запуск и прогресс всегда доступны
              сверху.
            </p>
          </div>

          <button
            type="button"
            onClick={syncLangame}
            disabled={
              !settings.hasApiKey ||
              !syncDateFrom ||
              !syncDateTo ||
              isSaving ||
              isSyncing
            }
            className="rounded-2xl bg-zinc-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400 dark:bg-emerald-400 dark:text-zinc-950 dark:hover:bg-emerald-300"
          >
            {isSyncing ? "Синхронизация..." : "Запустить синхронизацию"}
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
                  "rounded-2xl border px-4 py-3 text-left transition",
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
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
            <div className="flex items-center gap-3">
              <span className="h-3 w-3 animate-pulse rounded-full bg-amber-500" />
              <div>
                <p className="font-medium">Синхронизация выполняется</p>
                <p className="mt-1">
                  Период: {formatDateLabel(syncDateFrom)} —{" "}
                  {formatDateLabel(syncDateTo)}. После завершения появится
                  результат по каждому источнику.
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {syncResult ? (
          <div className="mt-5 rounded-2xl border border-zinc-100 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <h3 className="text-sm font-semibold">Результат синхронизации</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {formatDateLabel(syncDateFrom)} — {formatDateLabel(syncDateTo)}
              </p>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
              <Metric label="Источников" value={syncResult.sources} />
              <Metric label="Ошибок" value={syncResult.failedSources} />
              <Metric label="Клубов" value={syncResult.stores} />
              <Metric label="Товаров" value={syncResult.products} />
              <Metric label="Остатков" value={syncResult.inventorySnapshots} />
              <Metric label="Продаж" value={syncResult.salesFacts} />
              <Metric label="Выручка клубов" value={syncResult.clubRevenueFacts} />
              <Metric label="Расхождений" value={syncResult.discrepancies} />
            </div>
          </div>
        ) : null}

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

      <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
              Гости
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              Инкрементальная синхронизация клиентской базы
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Запуск загружает гостей, сессии, пополнения баланса, покупки бара и
              служебные логи за период от последней успешной синхронизации до
              текущего дня. При первом запуске берутся последние 90 дней.
            </p>
          </div>

          <GuestFoundationSyncButton disabled={!settings.hasApiKey || isSaving} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
      <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-base font-semibold">LAngame API</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          Ключ сохраняется в зашифрованном виде и применяется только внутри
          текущей организации. Назад в интерфейс ключ не выводится.
        </p>

        <label className="mt-5 block">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Название сети
          </span>
          <input
            type="text"
            value={tenantName}
            onChange={(event) => setTenantName(event.target.value)}
            className="mt-2 block w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>

        <label className="mt-5 block">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">API-ключ</span>
          <input
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={
              settings.hasApiKey
                ? "Ключ уже сохранён. Введите новый только для замены."
                : "Вставьте X-API-KEY"
            }
            className="mt-2 block w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>

        <label className="mt-5 block">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Домены клубов
          </span>
          <textarea
            value={domains}
            onChange={(event) => {
              setDomains(event.target.value);
              setDomainsError(null);
            }}
            placeholder={
              "Например: 1337.langame.ru, 443.langame.ru\nили каждый домен с новой строки"
            }
            aria-invalid={Boolean(domainsError)}
            rows={5}
            className={[
              "mt-2 block w-full rounded-xl border bg-white px-3 py-2 text-sm dark:bg-zinc-900",
              domainsError
                ? "border-red-400 text-red-900 outline outline-2 outline-red-100 dark:border-red-500 dark:text-red-100 dark:outline-red-950"
                : "border-zinc-300 dark:border-zinc-700",
            ].join(" ")}
          />
          {domainsError ? (
            <p className="mt-2 text-sm text-red-600 dark:text-red-300">
              {domainsError}
            </p>
          ) : (
            <p className="mt-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
              Формат: домены через запятую с пробелом или каждый домен с новой строки.
              Без протокола и пути.
            </p>
          )}
        </label>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={saveSettings}
            disabled={isSaving || isSyncing}
            className="rounded-xl bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400 dark:bg-emerald-400 dark:text-zinc-950 dark:hover:bg-emerald-300"
          >
            {isSaving ? "Сохранение..." : "Сохранить"}
          </button>
        </div>
      </div>

      <div className="rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <h2 className="text-base font-semibold">Подключённые источники</h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Эти домены будут использоваться только для данных текущего tenant.
          </p>
        </div>

        {settings.sources.length > 0 ? (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {settings.sources.map((source) => (
              <div key={source.id} className="px-5 py-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-zinc-950 dark:text-zinc-50">{source.domain}</p>
                    <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                      {source.baseUrl}
                    </p>
                  </div>
                  <span
                    className={[
                      "rounded-full px-2.5 py-1 text-xs font-medium",
                      source.isActive
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-zinc-100 text-zinc-600",
                    ].join(" ")}
                  >
                    {source.isActive ? "Активен" : "Отключён"}
                  </span>
                </div>
                <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                  Последняя синхронизация:{" "}
                  {source.lastSyncedAt
                    ? new Intl.DateTimeFormat("ru-RU", {
                        dateStyle: "short",
                        timeStyle: "short",
                      }).format(new Date(source.lastSyncedAt))
                    : "ещё не было"}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="px-5 py-6 text-sm text-zinc-500">
            Источники LAngame ещё не настроены.
          </p>
        )}

        {settings.syncJobs.length > 0 ? (
          <div className="border-t border-zinc-200 p-5 dark:border-zinc-800">
            <h3 className="text-sm font-semibold">История синхронизаций</h3>
            <div className="mt-3 divide-y divide-zinc-100 rounded-2xl border border-zinc-100 dark:divide-zinc-800 dark:border-zinc-800">
              {settings.syncJobs.map((job) => (
                <div key={job.id} className="px-3 py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-zinc-950 dark:text-zinc-50">{job.domain}</p>
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
                      className="mt-2 inline-flex text-sm font-medium text-zinc-900 underline underline-offset-4"
                    >
                      Скачать файл расхождений
                    </a>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
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

type DomainParseResult =
  | { ok: true; domains: string[] }
  | { ok: false; message: string };

function parseDomainInput(value: string): DomainParseResult {
  const trimmed = value.trim();

  if (!trimmed) {
    return {
      ok: false,
      message: "Укажите хотя бы один домен клуба.",
    };
  }

  if (/,(\S)/.test(trimmed)) {
    return {
      ok: false,
      message:
        "Домены через запятую нужно разделять запятой и пробелом: 1337.langame.ru, 443.langame.ru.",
    };
  }

  const domains = [
    ...new Set(
      trimmed
        .split(/\r?\n|, /)
        .map((domain) => domain.trim())
        .filter(Boolean)
        .map((domain) => domain.replace(/^https?:\/\//i, ""))
        .map((domain) => domain.replace(/\/.*$/, "").toLowerCase()),
    ),
  ];
  const invalidDomain = domains.find(
    (domain) =>
      !/^(?!-)(?:[a-z0-9-]{1,63}\.)+[a-z]{2,63}$/i.test(domain) ||
      domain.includes(".."),
  );

  if (invalidDomain) {
    return {
      ok: false,
      message: `Проверьте домен "${invalidDomain}": нужен формат 1337.langame.ru без https:// и без пути.`,
    };
  }

  return { ok: true, domains };
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

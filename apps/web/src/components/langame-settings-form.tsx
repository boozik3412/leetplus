"use client";

import { useState } from "react";
import type { LangameSettings } from "@/lib/langame-settings";

type SyncResult = {
  sources: number;
  failedSources: number;
  stores: number;
  products: number;
  inventorySnapshots: number;
  salesFacts: number;
  discrepancies: number;
  sourceResults: {
    domain: string;
    status: "SUCCESS" | "FAILED";
    stores: number;
    products: number;
    inventorySnapshots: number;
    salesFacts: number;
    discrepancies: number;
    discrepancyLogPath: string | null;
    errorMessage: string | null;
  }[];
};

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
  const [apiKey, setApiKey] = useState("");
  const [domains, setDomains] = useState(initialSettings.domains.join("\n"));
  const [settings, setSettings] = useState(initialSettings);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  async function saveSettings() {
    setError(null);
    setSuccess(null);
    setSyncResult(null);
    setIsSaving(true);

    try {
      const response = await fetch("/api/integrations/langame/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          apiKey: apiKey.trim() || undefined,
          domains: domains
            .split(/\r?\n/)
            .map((domain) => domain.trim())
            .filter(Boolean),
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
        body: JSON.stringify({}),
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
    <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
      <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold">LAngame API</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          Ключ сохраняется в зашифрованном виде и применяется только внутри
          текущей организации. Назад в интерфейс ключ не выводится.
        </p>

        <label className="mt-5 block">
          <span className="text-sm font-medium text-zinc-700">API-ключ</span>
          <input
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={
              settings.hasApiKey
                ? "Ключ уже сохранён. Введите новый только для замены."
                : "Вставьте X-API-KEY"
            }
            className="mt-2 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
          />
        </label>

        <label className="mt-5 block">
          <span className="text-sm font-medium text-zinc-700">
            Домены клубов
          </span>
          <textarea
            value={domains}
            onChange={(event) => setDomains(event.target.value)}
            rows={5}
            className="mt-2 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
          />
        </label>

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

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={saveSettings}
            disabled={isSaving || isSyncing}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
          >
            {isSaving ? "Сохранение..." : "Сохранить"}
          </button>
          <button
            type="button"
            onClick={syncLangame}
            disabled={!settings.hasApiKey || isSaving || isSyncing}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:text-zinc-400"
          >
            {isSyncing ? "Синхронизация..." : "Синхронизировать"}
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-200 px-5 py-4">
          <h2 className="text-base font-semibold">Подключённые источники</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Эти домены будут использоваться только для данных текущего tenant.
          </p>
        </div>

        {settings.sources.length > 0 ? (
          <div className="divide-y divide-zinc-100">
            {settings.sources.map((source) => (
              <div key={source.id} className="px-5 py-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-zinc-950">{source.domain}</p>
                    <p className="mt-1 text-sm text-zinc-500">
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
                <p className="mt-2 text-sm text-zinc-500">
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

        {syncResult ? (
          <div className="border-t border-zinc-200 p-5">
            <h3 className="text-sm font-semibold">Результат синхронизации</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Metric label="Источников" value={syncResult.sources} />
              <Metric label="Ошибок" value={syncResult.failedSources} />
              <Metric label="Клубов" value={syncResult.stores} />
              <Metric label="Товаров" value={syncResult.products} />
              <Metric label="Остатков" value={syncResult.inventorySnapshots} />
              <Metric label="Продаж" value={syncResult.salesFacts} />
              <Metric label="Расхождений" value={syncResult.discrepancies} />
            </div>
            <div className="mt-4 divide-y divide-zinc-100 rounded-md border border-zinc-100">
              {syncResult.sourceResults.map((result) => (
                <div
                  key={result.domain}
                  className="grid gap-2 px-3 py-3 text-sm lg:grid-cols-[180px_90px_1fr]"
                >
                  <span className="font-medium text-zinc-950">
                    {result.domain}
                  </span>
                  <span
                    className={
                      result.status === "SUCCESS"
                        ? "text-emerald-700"
                        : "text-red-700"
                    }
                  >
                    {result.status === "SUCCESS" ? "Успешно" : "Ошибка"}
                  </span>
                  <span className="text-zinc-600">
                    {result.errorMessage ??
                      `Клубов: ${result.stores}, товаров: ${result.products}, остатков: ${result.inventorySnapshots}, продаж: ${result.salesFacts}, расхождений: ${result.discrepancies}`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {settings.syncJobs.length > 0 ? (
          <div className="border-t border-zinc-200 p-5">
            <h3 className="text-sm font-semibold">История синхронизаций</h3>
            <div className="mt-3 divide-y divide-zinc-100 rounded-md border border-zinc-100">
              {settings.syncJobs.map((job) => (
                <div key={job.id} className="px-3 py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-zinc-950">{job.domain}</p>
                      <p className="mt-1 text-zinc-500">
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
                  <p className="mt-2 text-zinc-600">
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

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

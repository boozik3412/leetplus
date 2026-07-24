"use client";

import { useState } from "react";
import type { LangameSettings } from "@/lib/langame-settings";

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
  const [tenantName, setTenantName] = useState(initialSettings.tenantName);
  const [apiKey, setApiKey] = useState("");
  const [domains, setDomains] = useState(initialSettings.domains.join("\n"));
  const [settings, setSettings] = useState(initialSettings);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [domainsError, setDomainsError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function saveSettings() {
    setError(null);
    setSuccess(null);
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
      setSuccess("Настройки Langame сохранены.");
    } catch {
      setError("API недоступен");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
      <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-base font-semibold">Langame API</h2>
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
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            API-ключ
          </span>
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
              Формат: домены через запятую с пробелом или каждый домен с новой
              строки. Без протокола и пути.
            </p>
          )}
        </label>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={saveSettings}
            disabled={isSaving}
            className="rounded-xl bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400 dark:bg-emerald-400 dark:text-zinc-950 dark:hover:bg-emerald-300"
          >
            {isSaving ? "Сохранение..." : "Сохранить"}
          </button>
        </div>

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

      <div className="rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <h2 className="text-base font-semibold">Подключённые источники</h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Эти домены используются только для данных текущего tenant.
          </p>
        </div>

        {settings.sources.length > 0 ? (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {settings.sources.map((source) => (
              <div key={source.id} className="px-5 py-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-zinc-950 dark:text-zinc-50">
                      {source.domain}
                    </p>
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
                        timeZone: "UTC",
                      }).format(new Date(source.lastSyncedAt))
                    : "ещё не было"}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="px-5 py-6 text-sm text-zinc-500">
            Источники Langame ещё не настроены.
          </p>
        )}
      </div>
    </section>
  );
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

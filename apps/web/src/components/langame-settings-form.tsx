"use client";

import { useState } from "react";
import type {
  LangameOnboardingClub,
  LangameSettings,
  LangameSettingsPreview,
} from "@/lib/langame-settings";

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
  const [preview, setPreview] = useState<LangameSettingsPreview | null>(null);
  const [selectedClubs, setSelectedClubs] = useState<
    Record<string, string | null>
  >({});

  const isSafeExternal = settings.connectionMode === "SAFE_EXTERNAL";

  function resetPreview() {
    setPreview(null);
    setSelectedClubs({});
  }

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
      if (isSafeExternal && !preview) {
        const previewResponse = await fetch(
          "/api/integrations/langame/settings/preview",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              tenantName: tenantName.trim(),
              apiKey: apiKey.trim() || undefined,
              domains: parsedDomains.domains,
            }),
          },
        );
        const previewData = (await previewResponse.json()) as unknown;

        if (!previewResponse.ok) {
          setError(getErrorMessage(previewData));
          return;
        }

        const checked = previewData as LangameSettingsPreview;
        if (checked.status !== "READY") {
          setError(getPreviewError(checked));
          return;
        }

        if (checked.diagnostics.some(({ requiresSelection }) => requiresSelection)) {
          setPreview(checked);
          setSelectedClubs(singleClubSelections(checked));
          setSuccess(
            "Связь проверена. Выберите клубы, которые относятся к вашей сети.",
          );
          return;
        }

        await commitSettings(parsedDomains.domains, automaticBindings(checked));
        return;
      }

      if (isSafeExternal && preview) {
        const bindings = selectedBindings(preview, selectedClubs);
        const missingDomain = preview.diagnostics.find(
          (diagnostic) =>
            !bindings.some((binding) => binding.domain === diagnostic.domain),
        );
        if (missingDomain) {
          setError(`Выберите хотя бы один клуб для домена ${missingDomain.domain}.`);
          return;
        }
        await commitSettings(parsedDomains.domains, bindings);
        return;
      }

      await commitSettings(parsedDomains.domains);
    } catch {
      setError("API недоступен");
    } finally {
      setIsSaving(false);
    }
  }

  async function commitSettings(
    parsedDomains: string[],
    clubBindings?: LangameClubBinding[],
  ) {
      const response = await fetch("/api/integrations/langame/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tenantName: tenantName.trim(),
          apiKey: apiKey.trim() || undefined,
          domains: parsedDomains,
          clubBindings,
        }),
      });
      const data = (await response.json()) as unknown;

      if (!response.ok) {
        setError(getErrorMessage(data));
        return;
      }

      setSettings(data as LangameSettings);
      setApiKey("");
      resetPreview();

      if (isSafeExternal) {
        const syncResponse = await fetch("/api/integrations/langame/sync", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ mode: "BACKFILL", trigger: "MANUAL" }),
        });
        const syncData = (await syncResponse.json()) as {
          failedSources?: number;
          message?: string;
        };
        if (!syncResponse.ok || (syncData.failedSources ?? 0) > 0) {
          setSuccess("Langame подключён и сохранён.");
          setError(
            syncData.message ||
              "Первичная загрузка данных не завершилась. Её можно повторить на странице синхронизации.",
          );
          return;
        }
      }

      setSuccess(
        isSafeExternal
          ? "Langame подключён. Первичные данные загружены."
          : "Настройки Langame сохранены.",
      );
  }

  return (
    <section
      id="langame"
      className="mt-6 grid scroll-mt-6 gap-6 lg:grid-cols-[minmax(0,420px)_1fr]"
    >
      <div
        id="network-profile"
        className="scroll-mt-6 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
      >
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
            onChange={(event) => {
              setApiKey(event.target.value);
              resetPreview();
            }}
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
              resetPreview();
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

        {preview ? (
          <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
            <h3 className="text-sm font-semibold text-emerald-950 dark:text-emerald-100">
              Выберите клубы вашей сети
            </h3>
            <p className="mt-1 text-xs leading-5 text-emerald-800 dark:text-emerald-200">
              Данные других клубов, доступных по этому API-ключу, загружаться не
              будут.
            </p>
            <div className="mt-3 space-y-4">
              {preview.diagnostics.map((diagnostic) => (
                <fieldset key={diagnostic.domain}>
                  <legend className="text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-300">
                    {diagnostic.domain}
                  </legend>
                  <div className="mt-2 space-y-2">
                    {diagnostic.clubs.map((club) => {
                      const selectionKey = clubSelectionKey(
                        diagnostic.domain,
                        club.externalClubId,
                      );
                      const isSelected = selectionKey in selectedClubs;
                      const selectedStoreId = selectedClubs[selectionKey] ?? "";
                      return (
                        <div
                          key={selectionKey}
                          className="rounded-lg border border-emerald-200 bg-white p-3 dark:border-emerald-900 dark:bg-zinc-950"
                        >
                          <label className="flex cursor-pointer items-start gap-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(event) => {
                                setSelectedClubs((current) => {
                                  const next = { ...current };
                                  if (event.target.checked) {
                                    next[selectionKey] = null;
                                  } else {
                                    delete next[selectionKey];
                                  }
                                  return next;
                                });
                              }}
                              className="mt-1 h-4 w-4 accent-emerald-600"
                            />
                            <span>
                              <span className="block text-sm font-medium text-zinc-950 dark:text-zinc-50">
                                {club.name}
                              </span>
                              <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                                {club.address || `ID клуба: ${club.externalClubId}`}
                              </span>
                            </span>
                          </label>
                          {isSelected && availableStores(settings, diagnostic.domain, club).length > 0 ? (
                            <label className="mt-3 block pl-7">
                              <span className="text-xs text-zinc-600 dark:text-zinc-300">
                                Связать с клубом LeetPlus
                              </span>
                              <select
                                value={selectedStoreId}
                                onChange={(event) =>
                                  setSelectedClubs((current) => ({
                                    ...current,
                                    [selectionKey]: event.target.value || null,
                                  }))
                                }
                                className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                              >
                                <option value="">Создать новый клуб</option>
                                {availableStores(settings, diagnostic.domain, club).map(
                                  (store) => (
                                    <option key={store.id} value={store.id}>
                                      {store.name}
                                    </option>
                                  ),
                                )}
                              </select>
                            </label>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </fieldset>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={saveSettings}
            disabled={isSaving}
            className="rounded-xl bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400 dark:bg-emerald-400 dark:text-zinc-950 dark:hover:bg-emerald-300"
          >
            {isSaving
              ? preview
                ? "Подключение..."
                : "Проверка..."
              : preview
                ? "Подключить выбранные клубы"
                : isSafeExternal
                  ? "Проверить и подключить"
                  : "Сохранить"}
          </button>
          {preview ? (
            <button
              type="button"
              onClick={resetPreview}
              disabled={isSaving}
              className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              Изменить данные
            </button>
          ) : null}
        </div>

        {error ? (
          <p aria-live="polite" className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        {success ? (
          <p aria-live="polite" className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
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

type LangameClubBinding = {
  domain: string;
  externalClubId: string;
  storeId: string | null;
};

function clubSelectionKey(domain: string, externalClubId: string) {
  return `${domain}\u0000${externalClubId}`;
}

function automaticBindings(
  preview: LangameSettingsPreview,
): LangameClubBinding[] {
  return preview.diagnostics.flatMap((diagnostic) =>
    diagnostic.clubs.length === 1
      ? [
          {
            domain: diagnostic.domain,
            externalClubId: diagnostic.clubs[0]!.externalClubId,
            storeId: null,
          },
        ]
      : [],
  );
}

function singleClubSelections(preview: LangameSettingsPreview) {
  return Object.fromEntries(
    automaticBindings(preview).map((binding) => [
      clubSelectionKey(binding.domain, binding.externalClubId),
      null,
    ]),
  );
}

function selectedBindings(
  preview: LangameSettingsPreview,
  selections: Record<string, string | null>,
): LangameClubBinding[] {
  return preview.diagnostics.flatMap((diagnostic) =>
    diagnostic.clubs.flatMap((club) => {
      const key = clubSelectionKey(diagnostic.domain, club.externalClubId);
      if (!(key in selections)) {
        return [];
      }
      return [
        {
          domain: diagnostic.domain,
          externalClubId: club.externalClubId,
          storeId: selections[key] ?? null,
        },
      ];
    }),
  );
}

function getPreviewError(preview: LangameSettingsPreview) {
  const failed = preview.diagnostics.find(
    (diagnostic) => diagnostic.status === "FAILED",
  );
  if (failed?.reasonCode === "LANGAME_NO_ACTIVE_CLUBS") {
    return `На домене ${failed.domain} не найдено активных клубов.`;
  }
  if (failed?.reasonCode === "LANGAME_CLUB_LIST_INVALID") {
    return `Домен ${failed.domain} вернул некорректный список клубов.`;
  }
  return failed
    ? `Не удалось подключиться к ${failed.domain}. Проверьте API-ключ и домен.`
    : "Не удалось проверить подключение Langame.";
}

function availableStores(
  settings: LangameSettings,
  domain: string,
  club: LangameOnboardingClub,
) {
  return settings.stores.filter(
    (store) =>
      (!store.externalDomain && !store.externalClubId) ||
      (store.externalDomain === domain &&
        store.externalClubId === club.externalClubId),
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

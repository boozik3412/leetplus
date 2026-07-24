"use client";

import { useEffect, useState } from "react";
import { BrandingSettingsForm } from "@/components/branding-settings-form";
import { LangameSettingsForm } from "@/components/langame-settings-form";
import type { BrandingSettings } from "@/lib/branding-settings";
import type { LangameSettings } from "@/lib/langame-settings";

const SETTINGS_TIMEOUT_MS = 15_000;

type SettingsWorkspaceState = {
  brandingSettings: BrandingSettings | null;
  langameSettings: LangameSettings | null;
  brandingError: string | null;
  langameError: string | null;
  isLoading: boolean;
};

const initialState: SettingsWorkspaceState = {
  brandingSettings: null,
  langameSettings: null,
  brandingError: null,
  langameError: null,
  isLoading: true,
};

export function SettingsWorkspace() {
  const [state, setState] = useState(initialState);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      controller.abort();
    }, SETTINGS_TIMEOUT_MS);

    async function loadSettings() {
      const [langameResult, brandingResult] = await Promise.allSettled([
        loadJson<LangameSettings>(
          "/api/integrations/langame/settings",
          controller.signal,
        ),
        loadJson<BrandingSettings>("/api/settings/branding", controller.signal),
      ]);

      if (!mounted) {
        return;
      }

      setState({
        langameSettings:
          langameResult.status === "fulfilled" ? langameResult.value : null,
        brandingSettings:
          brandingResult.status === "fulfilled" ? brandingResult.value : null,
        langameError:
          langameResult.status === "rejected"
            ? getLoadErrorMessage(langameResult.reason)
            : null,
        brandingError:
          brandingResult.status === "rejected"
            ? getLoadErrorMessage(brandingResult.reason)
            : null,
        isLoading: false,
      });
    }

    void loadSettings().finally(() => {
      window.clearTimeout(timeout);
    });

    return () => {
      mounted = false;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, []);

  if (state.isLoading) {
    return (
      <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center gap-3 text-sm text-zinc-600 dark:text-zinc-400">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-500 dark:border-emerald-950 dark:border-t-emerald-400" />
          <span>Загружаем настройки...</span>
        </div>
      </section>
    );
  }

  const hasLoadError = Boolean(state.langameError) || Boolean(state.brandingError);

  return (
    <>
      {hasLoadError ? (
        <section className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
          Часть настроек не загрузилась за отведенное время. Проверьте API/БД
          и обновите страницу.
        </section>
      ) : null}

      {state.brandingSettings ? (
        <BrandingSettingsForm initialSettings={state.brandingSettings} />
      ) : (
        <SettingsSectionError
          message={state.brandingError}
          title="Брендинг не загрузился"
        />
      )}

      {state.langameSettings ? (
        <LangameSettingsForm initialSettings={state.langameSettings} />
      ) : (
        <SettingsSectionError
          message={state.langameError}
          title="Langame не загрузился"
        />
      )}
    </>
  );
}

async function loadJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  return response.json() as Promise<T>;
}

async function readApiError(response: Response) {
  try {
    const data = (await response.json()) as {
      message?: string | string[];
      error?: string;
    };

    if (Array.isArray(data.message)) {
      return data.message.join(", ");
    }

    return data.message ?? data.error ?? "Ошибка запроса";
  } catch {
    return "Ошибка запроса";
  }
}

function getLoadErrorMessage(error: unknown) {
  if (error instanceof Error && error.name === "AbortError") {
    return `API не ответил за ${Math.round(SETTINGS_TIMEOUT_MS / 1000)} секунд`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Неизвестная ошибка загрузки настроек";
}

function SettingsSectionError({
  message,
  title,
}: {
  message: string | null;
  title: string;
}) {
  return (
    <section className="mt-6 rounded-lg border border-rose-200 bg-white p-5 shadow-sm dark:border-rose-900/70 dark:bg-zinc-950">
      <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">
        {title}
      </p>
      <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
        {message ?? "Повторите загрузку страницы."}
      </p>
    </section>
  );
}

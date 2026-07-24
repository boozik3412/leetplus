"use client";

import { useEffect, useState } from "react";
import { BrandingSettingsForm } from "@/components/branding-settings-form";
import { LangameSettingsForm } from "@/components/langame-settings-form";
import type { BrandingSettings } from "@/lib/branding-settings";
import type { LangameSettings } from "@/lib/langame-settings";

const SETTINGS_TIMEOUT_MS = 15_000;

type SectionState<T> = {
  data: T | null;
  error: string | null;
  isLoading: boolean;
};

function getInitialSectionState<T>(): SectionState<T> {
  return {
    data: null,
    error: null,
    isLoading: true,
  };
}

export function SettingsWorkspace() {
  const [branding, setBranding] = useState<SectionState<BrandingSettings>>(
    getInitialSectionState,
  );
  const [langame, setLangame] = useState<SectionState<LangameSettings>>(
    getInitialSectionState,
  );

  useEffect(() => {
    let mounted = true;

    loadSection<BrandingSettings>("/api/settings/branding", (next) => {
      if (mounted) {
        setBranding(next);
      }
    });
    loadSection<LangameSettings>("/api/integrations/langame/settings", (next) => {
      if (mounted) {
        setLangame(next);
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  const hasLoadError = Boolean(langame.error) || Boolean(branding.error);

  return (
    <>
      {hasLoadError ? (
        <section className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
          Часть настроек не загрузилась за отведенное время. Проверьте API/БД
          и обновите страницу.
        </section>
      ) : null}

      {branding.isLoading ? (
        <SettingsSectionLoading title="Загружаем брендинг..." />
      ) : branding.data ? (
        <BrandingSettingsForm initialSettings={branding.data} />
      ) : (
        <SettingsSectionError
          message={branding.error}
          title="Брендинг не загрузился"
        />
      )}

      {langame.isLoading ? (
        <SettingsSectionLoading title="Загружаем Langame..." />
      ) : langame.data ? (
        <LangameSettingsForm initialSettings={langame.data} />
      ) : (
        <SettingsSectionError
          message={langame.error}
          title="Langame не загрузился"
        />
      )}
    </>
  );
}

function loadSection<T>(
  url: string,
  setSection: (next: SectionState<T>) => void,
) {
  let settled = false;
  const slowTimeout = window.setTimeout(() => {
    if (settled) {
      return;
    }

    setSection({
      data: null,
      error: getSlowApiMessage(),
      isLoading: false,
    });
  }, SETTINGS_TIMEOUT_MS);

  void loadJson<T>(url)
    .then((data) => {
      settled = true;
      setSection({
        data,
        error: null,
        isLoading: false,
      });
    })
    .catch((error: unknown) => {
      settled = true;
      setSection({
        data: null,
        error: getLoadErrorMessage(error),
        isLoading: false,
      });
    })
    .finally(() => {
      window.clearTimeout(slowTimeout);
    });
}

async function loadJson<T>(url: string): Promise<T> {
  const response = await fetch(withCacheBuster(url), {
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
    },
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(readApiError(text));
  }

  return JSON.parse(text) as T;
}

function withCacheBuster(url: string) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}_=${Date.now()}`;
}

function readApiError(text: string) {
  try {
    const data = JSON.parse(text) as {
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
  if (error instanceof SyntaxError) {
    return "API вернул некорректный JSON";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Неизвестная ошибка загрузки настроек";
}

function getSlowApiMessage() {
  return `API отвечает дольше ${Math.round(SETTINGS_TIMEOUT_MS / 1000)} секунд`;
}

function SettingsSectionLoading({ title }: { title: string }) {
  return (
    <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center gap-3 text-sm text-zinc-600 dark:text-zinc-400">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-500 dark:border-emerald-950 dark:border-t-emerald-400" />
        <span>{title}</span>
      </div>
    </section>
  );
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

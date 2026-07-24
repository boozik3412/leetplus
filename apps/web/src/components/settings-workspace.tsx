"use client";

import { useEffect, useState } from "react";
import { BrandingSettingsForm } from "@/components/branding-settings-form";
import { LangameSettingsForm } from "@/components/langame-settings-form";
import type { BrandingSettings } from "@/lib/branding-settings";
import type { LangameSettings } from "@/lib/langame-settings";

const SETTINGS_WORKSPACE_ENDPOINT = "/api/settings/workspace";
const SETTINGS_WORKSPACE_TIMEOUT_MS = 15_000;

type SettingsWorkspacePayload = {
  brandingSettings: BrandingSettings | null;
  langameSettings: LangameSettings | null;
  brandingError: string | null;
  langameError: string | null;
};

type SettingsWorkspaceState = SettingsWorkspacePayload & {
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
    let cancelled = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      controller.abort();
    }, SETTINGS_WORKSPACE_TIMEOUT_MS);

    queueMicrotask(() => {
      void fetchSettingsPayload(controller.signal)
        .then((payload) => {
          if (cancelled) {
            return;
          }

          setState({
            ...payload,
            isLoading: false,
          });
        })
        .catch((error) => {
          if (cancelled) {
            return;
          }

          const message =
            error instanceof Error
              ? error.message
              : "Не удалось загрузить настройки";

          setState({
            ...initialState,
            brandingError: message,
            langameError: message,
            isLoading: false,
          });
        })
        .finally(() => {
          window.clearTimeout(timeout);
        });
    });

    return () => {
      cancelled = true;
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

async function fetchSettingsPayload(signal: AbortSignal) {
  let response: Response;

  try {
    response = await fetch(SETTINGS_WORKSPACE_ENDPOINT, {
      headers: {
        Accept: "application/json",
      },
      signal,
    });
  } catch (error) {
    if (signal.aborted) {
      throw new Error("Настройки не загрузились за 15 секунд");
    }

    throw error;
  }

  const payload = (await response.json()) as unknown;

  if (!response.ok) {
    throw new Error(getSettingsPayloadError(payload));
  }

  return payload as SettingsWorkspacePayload;
}

function getSettingsPayloadError(payload: unknown) {
  if (
    payload &&
    typeof payload === "object" &&
    "message" in payload &&
    typeof payload.message === "string"
  ) {
    return payload.message;
  }

  return "Не удалось загрузить настройки";
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

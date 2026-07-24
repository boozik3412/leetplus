"use client";

import { BrandingSettingsForm } from "@/components/branding-settings-form";
import { LangameSettingsForm } from "@/components/langame-settings-form";
import type { BrandingSettings } from "@/lib/branding-settings";
import type { LangameSettings } from "@/lib/langame-settings";

type SettingsWorkspaceProps = {
  brandingSettings: BrandingSettings | null;
  langameSettings: LangameSettings | null;
  brandingError: string | null;
  langameError: string | null;
};

export function SettingsWorkspace({
  brandingSettings,
  langameSettings,
  brandingError,
  langameError,
}: SettingsWorkspaceProps) {
  const hasLoadError = Boolean(langameError) || Boolean(brandingError);

  return (
    <>
      {hasLoadError ? (
        <section className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
          Часть настроек не загрузилась за отведенное время. Проверьте API/БД
          и обновите страницу.
        </section>
      ) : null}

      {brandingSettings ? (
        <BrandingSettingsForm initialSettings={brandingSettings} />
      ) : (
        <SettingsSectionError
          message={brandingError}
          title="Брендинг не загрузился"
        />
      )}

      {langameSettings ? (
        <LangameSettingsForm initialSettings={langameSettings} />
      ) : (
        <SettingsSectionError
          message={langameError}
          title="Langame не загрузился"
        />
      )}
    </>
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

import { BrandingSettingsForm } from "@/components/branding-settings-form";
import { LangameSettingsForm } from "@/components/langame-settings-form";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { requireCurrentUser } from "@/lib/auth";
import { getBrandingSettings } from "@/lib/branding-settings";
import { getLangameSettings } from "@/lib/langame-settings";
import { can } from "@/lib/permissions";

export default async function SettingsPage() {
  const user = await requireCurrentUser();

  if (!can(user, "manage_integrations")) {
    return (
      <main className="px-6 py-8 text-zinc-950 dark:text-zinc-100">
        <div className="mx-auto max-w-3xl rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <ReportBreadcrumbs
            current="Настройки Langame"
            items={[
              { href: "/dashboard", label: "Дашборд" },
              { href: "/administration", label: "Администрирование" },
            ]}
          />
          <h1 className="text-2xl font-semibold">Нет доступа</h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Управление интеграциями доступно только владельцам и
            администраторам сети.
          </p>
        </div>
      </main>
    );
  }

  const [langameSettingsResult, brandingSettingsResult] = await Promise.all([
    loadSettingsSection(getLangameSettings),
    loadSettingsSection(getBrandingSettings),
  ]);
  const hasLoadError =
    Boolean(langameSettingsResult.error) || Boolean(brandingSettingsResult.error);

  return (
    <main className="px-6 py-8 text-zinc-950 dark:text-zinc-100">
      <div className="mx-auto max-w-7xl">
        <ReportBreadcrumbs
          current="Настройки Langame"
          items={[
            { href: "/dashboard", label: "Дашборд" },
            { href: "/administration", label: "Администрирование" },
          ]}
        />
        <div>
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
            Управление сетью
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Настройки
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            Подключение Langame API для текущей организации: ключ, домены
            клубов и список источников. Запуск обновления данных вынесен в
            отдельный раздел «Синхронизация».
          </p>
        </div>

        {hasLoadError ? (
          <section className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
            Часть настроек не загрузилась за отведенное время. Проверьте API/БД
            и обновите страницу.
          </section>
        ) : null}

        {brandingSettingsResult.data ? (
          <BrandingSettingsForm initialSettings={brandingSettingsResult.data} />
        ) : (
          <SettingsSectionError
            message={brandingSettingsResult.error}
            title="Брендинг не загрузился"
          />
        )}
        {langameSettingsResult.data ? (
          <LangameSettingsForm initialSettings={langameSettingsResult.data} />
        ) : (
          <SettingsSectionError
            message={langameSettingsResult.error}
            title="Langame не загрузился"
          />
        )}
      </div>
    </main>
  );
}

async function loadSettingsSection<T>(loader: () => Promise<T>) {
  try {
    return {
      data: await loader(),
      error: null,
    };
  } catch (error) {
    return {
      data: null,
      error:
        error instanceof Error
          ? error.message
          : "Неизвестная ошибка загрузки настроек",
    };
  }
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

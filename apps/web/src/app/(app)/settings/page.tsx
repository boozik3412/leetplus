import { Suspense } from "react";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { SettingsWorkspace } from "@/components/settings-workspace";
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

        <Suspense fallback={<SettingsWorkspaceLoading />}>
          <SettingsWorkspaceData />
        </Suspense>
      </div>
    </main>
  );
}

async function SettingsWorkspaceData() {
  const [langameResult, brandingResult] = await Promise.allSettled([
    getLangameSettings(),
    getBrandingSettings(),
  ]);

  return (
    <SettingsWorkspace
      brandingSettings={
        brandingResult.status === "fulfilled" ? brandingResult.value : null
      }
      langameSettings={
        langameResult.status === "fulfilled" ? langameResult.value : null
      }
      brandingError={
        brandingResult.status === "rejected"
          ? getSettingsErrorMessage(brandingResult.reason)
          : null
      }
      langameError={
        langameResult.status === "rejected"
          ? getSettingsErrorMessage(langameResult.reason)
          : null
      }
    />
  );
}

function SettingsWorkspaceLoading() {
  return (
    <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center gap-3 text-sm text-zinc-600 dark:text-zinc-400">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-500 dark:border-emerald-950 dark:border-t-emerald-400" />
        <span>Загружаем настройки...</span>
      </div>
    </section>
  );
}

function getSettingsErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Неизвестная ошибка загрузки настроек";
}

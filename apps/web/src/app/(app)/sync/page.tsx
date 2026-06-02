import { LangameSyncPanel } from "@/components/langame-sync-panel";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { requireCurrentUser } from "@/lib/auth";
import { getLangameSettings } from "@/lib/langame-settings";
import { can } from "@/lib/permissions";

export default async function SyncPage() {
  const user = await requireCurrentUser();

  if (!can(user, "run_sync")) {
    return (
      <main className="px-6 py-8 text-zinc-950 dark:text-zinc-100">
        <div className="mx-auto max-w-3xl rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <ReportBreadcrumbs
            current="Синхронизация"
            items={[
              { href: "/dashboard", label: "Дашборд" },
              { href: "/administration", label: "Администрирование" },
            ]}
          />
          <h1 className="text-2xl font-semibold">Нет доступа</h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Синхронизация доступна только пользователям с правом запуска
            обновления данных.
          </p>
        </div>
      </main>
    );
  }

  const langameSettings = await getLangameSettings();

  return (
    <main className="px-6 py-8 text-zinc-950 dark:text-zinc-100">
      <div className="mx-auto max-w-7xl">
        <ReportBreadcrumbs
          current="Синхронизация"
          items={[
            { href: "/dashboard", label: "Дашборд" },
            { href: "/administration", label: "Администрирование" },
          ]}
        />
        <div>
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
            Управление данными
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Синхронизация
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            Единый запуск обновляет ассортимент, продажи, выручку клубов и
            модуль гостей. Настройка API-ключа и доменов вынесена в раздел
            настроек.
          </p>
        </div>

        <LangameSyncPanel initialSettings={langameSettings} />
      </div>
    </main>
  );
}

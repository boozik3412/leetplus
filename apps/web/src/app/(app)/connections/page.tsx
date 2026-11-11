import Link from "next/link";
import { DashboardQuickSyncButton } from "@/components/dashboard-quick-sync-button";
import { LocalDateTime } from "@/components/local-date-time";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { requirePageAccess } from "@/lib/auth";
import {
  langameClubConnections,
  langameConnectionStateLabels,
  langameConnectionVerdict,
  type LangameClubConnectionState,
} from "@/lib/langame-connections";
import { getLangameSettings } from "@/lib/langame-settings";
import { can } from "@/lib/permissions";

// «Подключения» (UX plan, step 2.2): the owner's view of the Langame
// connection. The full import console stays at /sync for support.

const stateClass: Record<LangameClubConnectionState, string> = {
  OK: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200",
  PARTIAL:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200",
  WAITING:
    "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300",
  FAILED:
    "border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200",
  NOT_CONNECTED:
    "border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200",
};

const verdictClass = {
  good: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100",
  warning:
    "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100",
  danger:
    "border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-100",
};

export default async function ConnectionsPage() {
  const user = await requirePageAccess("/connections");
  const settings = await getLangameSettings();
  const clubs = langameClubConnections(settings);
  const verdict = langameConnectionVerdict(settings.hasApiKey, clubs);
  const canEditSettings = can(user, "manage_integrations");

  return (
    <main className="px-4 py-6 text-zinc-950 dark:text-zinc-100 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-5xl">
        <ReportBreadcrumbs
          current="Подключения"
          items={[{ href: "/dashboard", label: "Сводка" }]}
        />
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
          Настройки
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Подключения
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          Откуда LeetPlus берёт данные клубов. Прошедшие дни загружаются
          автоматически каждую ночь, кнопка «Обновить данные» подтянет
          сегодняшний день сразу.
        </p>

        <section className="mt-6 rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex flex-col gap-4 border-b border-zinc-200 p-5 dark:border-zinc-800 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold">Langame</h2>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Продажи, остатки, выручка, сессии и гости.
                {settings.hasApiKey
                  ? " Ключ доступа задан."
                  : " Ключ доступа не задан."}
              </p>
              <p
                className={`mt-3 rounded-lg border px-3 py-2 text-sm font-medium ${verdictClass[verdict.tone]}`}
              >
                {verdict.text}
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row md:flex-col md:items-stretch">
              {settings.hasApiKey && clubs.length > 0 ? (
                <DashboardQuickSyncButton
                  label="Обновить данные"
                  busyLabel="Обновляем…"
                />
              ) : null}
              {canEditSettings ? (
                <Link
                  href="/settings"
                  className="inline-flex items-center justify-center rounded-full border border-zinc-300 px-3 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
                >
                  Ключ и адреса клубов
                </Link>
              ) : null}
            </div>
          </div>

          {clubs.length > 0 ? (
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {clubs.map((club) => (
                <li
                  key={club.storeId}
                  className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-semibold">{club.storeName}</p>
                    <p className="mt-0.5 truncate text-sm text-zinc-500 dark:text-zinc-400">
                      {club.domain ?? "адрес в Langame не задан"}
                    </p>
                    {club.note ? (
                      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                        {club.note}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-col gap-1 sm:items-end">
                    <span
                      className={`w-fit rounded-full border px-2.5 py-1 text-xs font-semibold ${stateClass[club.state]}`}
                    >
                      {langameConnectionStateLabels[club.state]}
                    </span>
                    <span className="text-sm text-zinc-500 dark:text-zinc-400">
                      Последняя загрузка:{" "}
                      <LocalDateTime value={club.lastLoadedAt} empty="ещё не было" />
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-6 text-sm text-zinc-500 dark:text-zinc-400">
              Клубы появятся здесь после того, как в «Настройках» будут
              заданы ключ доступа и адреса клубов в Langame.
            </p>
          )}
        </section>

        <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
          Подробный журнал загрузок и ручная загрузка за период для
          поддержки:{" "}
          <Link
            href="/sync"
            className="font-semibold text-zinc-700 underline underline-offset-2 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-white"
          >
            журнал загрузок
          </Link>
          .
        </p>
      </div>
    </main>
  );
}

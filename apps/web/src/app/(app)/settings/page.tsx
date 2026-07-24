import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { SettingsWorkspace } from "@/components/settings-workspace";
import { requireCurrentUser } from "@/lib/auth";
import { getBrandingSettings } from "@/lib/branding-settings";
import {
  getLangameSettings,
  type LangameSettings,
} from "@/lib/langame-settings";
import { can } from "@/lib/permissions";

const SETTINGS_DATA_TIMEOUT_MS = 15_000;

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

  const settingsData = await loadSettingsWorkspaceData();

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

        <SettingsDataScript data={settingsData} />
        <SettingsWorkspace />
      </div>
    </main>
  );
}

async function loadSettingsWorkspaceData() {
  const startedAt = Date.now();
  console.warn("[settings] data load start");

  const [langameResult, brandingResult] = await Promise.allSettled([
    withSettingsDataTimeout(
      "langame",
      getLangameSettings().then(sanitizeLangameSettingsForSettingsPage),
      startedAt,
    ),
    withSettingsDataTimeout("branding", getBrandingSettings(), startedAt),
  ]);

  console.warn("[settings] data load settled", {
    brandingStatus: brandingResult.status,
    elapsedMs: Date.now() - startedAt,
    langameStatus: langameResult.status,
  });

  return {
    brandingSettings:
      brandingResult.status === "fulfilled" ? brandingResult.value : null,
    langameSettings:
      langameResult.status === "fulfilled" ? langameResult.value : null,
    brandingError:
      brandingResult.status === "rejected"
        ? getSettingsErrorMessage(brandingResult.reason)
        : null,
    langameError:
      langameResult.status === "rejected"
        ? getSettingsErrorMessage(langameResult.reason)
        : null,
  };
}

async function withSettingsDataTimeout<T>(
  label: string,
  promise: Promise<T>,
  startedAt: number,
) {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise.then((value) => {
        console.warn(`[settings] ${label} loaded`, {
          elapsedMs: Date.now() - startedAt,
        });
        return value;
      }),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(
            new Error(
              `${label} settings timed out after ${Math.round(
                SETTINGS_DATA_TIMEOUT_MS / 1000,
              )}s`,
            ),
          );
        }, SETTINGS_DATA_TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    console.warn(`[settings] ${label} failed`, {
      elapsedMs: Date.now() - startedAt,
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function getSettingsErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Неизвестная ошибка загрузки настроек";
}

function sanitizeLangameSettingsForSettingsPage(
  settings: LangameSettings,
): LangameSettings {
  return {
    tenantName: settings.tenantName,
    hasApiKey: settings.hasApiKey,
    domains: settings.domains,
    sources: settings.sources,
    syncJobs: [],
    latestSuccessfulSyncJob: null,
    endpointProfiles: [],
    endpointSnapshotCandidates: [],
    endpointSnapshots: [],
  };
}

function SettingsDataScript({
  data,
}: {
  data: Awaited<ReturnType<typeof loadSettingsWorkspaceData>>;
}) {
  return (
    <script
      id="leetplus-settings-data"
      type="application/json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}

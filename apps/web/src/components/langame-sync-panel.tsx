"use client";

import { useEffect, useState } from "react";
import type { LangameSettings } from "@/lib/langame-settings";

type SyncPeriod = "today" | "last7" | "last30" | "custom";

type SyncResult = {
  sources: number;
  failedSources: number;
  stores: number;
  products: number;
  inventorySnapshots: number;
  salesFacts: number;
  clubRevenueFacts: number;
  discrepancies: number;
};

type GuestSyncStatus = {
  status: "IDLE" | "RUNNING" | "SUCCESS" | "FAILED";
  running: boolean;
  latestRun: GuestSyncRun | null;
  recentRuns: GuestSyncRun[];
};

type GuestSyncRun = {
  domain: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  guestsCount: number;
  sessionsCount: number;
  transactionsCount: number;
  productSalesLinked: number;
  errorMessage: string | null;
  diagnostics: {
    endpointErrors: Record<string, string>;
    guestLogs: GuestLogDiagnostics;
    pcTypesInClubs: FieldDiagnostics;
    pcTypeLinks: FieldDiagnostics;
  };
};

type GuestLogDiagnostics = {
  total: number;
  withoutGuestId: number;
  invalidDates: number;
  typeCounts: Record<string, number>;
};

type FieldDiagnostics = {
  total: number;
  fieldCounts: Record<string, number>;
  candidateFields: Record<string, number>;
};

type SyncStepStatus = "idle" | "running" | "success" | "error";

type CombinedSyncResult = {
  assortment: SyncResult | null;
  guests: GuestSyncStatus | null;
};

type LangameSyncJob = LangameSettings["syncJobs"][number];

type SourceSyncHealth = {
  id: string;
  domain: string;
  name: string;
  status: "SUCCESS" | "FAILED" | "IDLE";
  lastSyncedAt: string | null;
  errorMessage: string | null;
  latestJob: LangameSyncJob | null;
};

type EndpointUsageStatus =
  | "IN_USE"
  | "PLANNED"
  | "NEEDS_PARAMETERS"
  | "WRITE_DECISION";

type EndpointGroup =
  | "dashboard"
  | "guests"
  | "assortment"
  | "marketing"
  | "staff"
  | "service";

type EndpointMethod = "GET" | "POST";

type RouteDiagnosticsStatus = "idle" | "loading" | "success" | "error";

type RouteDiagnosticsSource = {
  domain: string;
  status: "SUCCESS" | "FAILED";
  routesCount: number;
  routes: {
    method: string | null;
    path: string | null;
  }[];
  errorMessage: string | null;
};

type RouteDiagnosticsResult = {
  checkedAt: string;
  sources: RouteDiagnosticsSource[];
};

type EndpointMapItem = {
  method: EndpointMethod;
  path: string;
  group: EndpointGroup;
  title: string;
  description: string;
  usageStatus: EndpointUsageStatus;
  freshnessSource: "assortment" | "guests" | "routes" | "planned" | "write";
};

const guestSyncPollIntervalMs = 4000;
const guestSyncPollAttempts = 75;

const endpointGroupOrder: EndpointGroup[] = [
  "dashboard",
  "guests",
  "assortment",
  "marketing",
  "staff",
  "service",
];

const endpointGroupLabels: Record<EndpointGroup, string> = {
  dashboard: "Сводный дашборд и выручка",
  guests: "Гости, CRM и геймификация",
  assortment: "Ассортимент и склад",
  marketing: "Маркетинг и тарифы",
  staff: "Персонал и операции",
  service: "Сервисные данные",
};

const endpointStatusLabels: Record<EndpointUsageStatus, string> = {
  IN_USE: "используется",
  PLANNED: "запланирован",
  NEEDS_PARAMETERS: "нужны параметры",
  WRITE_DECISION: "write-решение",
};

const langameEndpointMap: EndpointMapItem[] = [
  {
    method: "GET",
    path: "/public_api/all_operations_log/list",
    group: "dashboard",
    title: "Операции и игровые списания",
    description: "База для общей выручки, онлайн-пополнений и сетевой сверки.",
    usageStatus: "IN_USE",
    freshnessSource: "guests",
  },
  {
    method: "GET",
    path: "/public_api/transactions/list",
    group: "dashboard",
    title: "Транзакции гостей",
    description: "Пополнения, движения баланса и гостевой слой отчетности.",
    usageStatus: "IN_USE",
    freshnessSource: "guests",
  },
  {
    method: "GET",
    path: "/public_api/balances/list",
    group: "dashboard",
    title: "Состояние балансов",
    description: "Планируемый источник для сверки денег на балансах гостей.",
    usageStatus: "PLANNED",
    freshnessSource: "planned",
  },
  {
    method: "GET",
    path: "/public_api/log_cash_transaction/list",
    group: "dashboard",
    title: "Кассовые операции",
    description: "Операционный контроль смен и денежной дисциплины.",
    usageStatus: "IN_USE",
    freshnessSource: "guests",
  },
  {
    method: "GET",
    path: "/public_api/working_shifts/list",
    group: "dashboard",
    title: "Рабочие смены",
    description: "Связь выручки, администраторов и сменных итогов.",
    usageStatus: "IN_USE",
    freshnessSource: "guests",
  },
  {
    method: "GET",
    path: "/public_api/guests/list",
    group: "guests",
    title: "Справочник гостей",
    description: "Основной read-only источник для CRM и сегментов гостей.",
    usageStatus: "IN_USE",
    freshnessSource: "guests",
  },
  {
    method: "GET",
    path: "/public_api/guests/{guest_id}",
    group: "guests",
    title: "Карточка гостя",
    description: "План для точечного обновления профиля, телефона и статусов.",
    usageStatus: "PLANNED",
    freshnessSource: "planned",
  },
  {
    method: "GET",
    path: "/public_api/guests/balance",
    group: "guests",
    title: "Баланс гостя",
    description: "Деньги на балансе для CRM, рисков и будущего гостевого логина.",
    usageStatus: "IN_USE",
    freshnessSource: "guests",
  },
  {
    method: "GET",
    path: "/public_api/guests/bonus_balance",
    group: "guests",
    title: "Бонусный баланс",
    description: "Бонусы, промо-эффект и будущие награды миссий.",
    usageStatus: "IN_USE",
    freshnessSource: "guests",
  },
  {
    method: "GET",
    path: "/public_api/guests/groups",
    group: "guests",
    title: "Группы гостей",
    description: "Сегменты CRM, механики маркетинга и правила лутбоксов.",
    usageStatus: "IN_USE",
    freshnessSource: "guests",
  },
  {
    method: "GET",
    path: "/public_api/guests/logs",
    group: "guests",
    title: "Логи гостей",
    description: "Нужна проверка типов событий для миссий, квестов и anti-fraud.",
    usageStatus: "NEEDS_PARAMETERS",
    freshnessSource: "guests",
  },
  {
    method: "GET",
    path: "/public_api/guests/sessions",
    group: "guests",
    title: "Игровые сессии",
    description: "Основа для активности, стартов сессий и будущих лутбоксов.",
    usageStatus: "IN_USE",
    freshnessSource: "guests",
  },
  {
    method: "POST",
    path: "/public_api/guests/search",
    group: "guests",
    title: "Точечный поиск гостя",
    description: "План для ручного поиска, связки телефона и messenger-профиля.",
    usageStatus: "PLANNED",
    freshnessSource: "planned",
  },
  {
    method: "GET",
    path: "/public_api/clubs/list",
    group: "assortment",
    title: "Клубы сети",
    description: "Справочник клубов для всех отчетов, ролей и фильтров.",
    usageStatus: "IN_USE",
    freshnessSource: "assortment",
  },
  {
    method: "GET",
    path: "/public_api/products/list",
    group: "assortment",
    title: "Товары Langame",
    description: "Справочник позиций бара и товарных отчетов.",
    usageStatus: "IN_USE",
    freshnessSource: "assortment",
  },
  {
    method: "GET",
    path: "/public_api/goods/list",
    group: "assortment",
    title: "Номенклатура",
    description: "Связь товарных карточек, себестоимости и ассортимента.",
    usageStatus: "IN_USE",
    freshnessSource: "assortment",
  },
  {
    method: "GET",
    path: "/public_api/products/expense",
    group: "assortment",
    title: "Списания и продажи",
    description: "Факты бара, списаний и расхода товаров по клубам.",
    usageStatus: "IN_USE",
    freshnessSource: "assortment",
  },
  {
    method: "GET",
    path: "/public_api/products/arrival",
    group: "assortment",
    title: "Приходы товаров",
    description: "Следующий источник для поставок, новинок и движения склада.",
    usageStatus: "PLANNED",
    freshnessSource: "planned",
  },
  {
    method: "GET",
    path: "/public_api/global/types_of_pc_in_clubs/list",
    group: "assortment",
    title: "Типы ПК в клубах",
    description: "Карта компьютерных мест для загрузки и тарифных условий.",
    usageStatus: "IN_USE",
    freshnessSource: "guests",
  },
  {
    method: "GET",
    path: "/public_api/global/linking_pc_by_type/list",
    group: "assortment",
    title: "Привязка ПК к типам",
    description: "Связь машин, типов ПК и игровой загрузки по клубам.",
    usageStatus: "IN_USE",
    freshnessSource: "guests",
  },
  {
    method: "GET",
    path: "/public_api/tariffs/by_days/list",
    group: "marketing",
    title: "Тарифы по дням",
    description: "План для условий миссий, промо-наборов и battle pass.",
    usageStatus: "PLANNED",
    freshnessSource: "planned",
  },
  {
    method: "GET",
    path: "/public_api/tariffs/groups/list",
    group: "marketing",
    title: "Группы тарифов",
    description: "Справочник тарифных сегментов для маркетинговых механик.",
    usageStatus: "PLANNED",
    freshnessSource: "planned",
  },
  {
    method: "GET",
    path: "/public_api/tariffs/time_period/list",
    group: "marketing",
    title: "Периоды тарифов",
    description: "Тихие часы, будни, вечерние окна и условия офферов.",
    usageStatus: "PLANNED",
    freshnessSource: "planned",
  },
  {
    method: "GET",
    path: "/public_api/tariffs/types_groups/list",
    group: "marketing",
    title: "Типы тарифных групп",
    description: "Нормализация тарифных правил для конструктора маркетинга.",
    usageStatus: "PLANNED",
    freshnessSource: "planned",
  },
  {
    method: "GET",
    path: "/public_api/users/list",
    group: "staff",
    title: "Операторы Langame",
    description: "План для сверки администраторов, смен и действий.",
    usageStatus: "PLANNED",
    freshnessSource: "planned",
  },
  {
    method: "POST",
    path: "/public_api/pc/manage",
    group: "staff",
    title: "Управление ПК",
    description: "Только будущий write-контур с ролями, audit trail и dry-run.",
    usageStatus: "WRITE_DECISION",
    freshnessSource: "write",
  },
  {
    method: "GET",
    path: "/public_api/config/list",
    group: "service",
    title: "Конфигурация Langame",
    description: "Планируемая сверка настроек источника и доступных модулей.",
    usageStatus: "PLANNED",
    freshnessSource: "planned",
  },
  {
    method: "GET",
    path: "/public_api/puf/profiles/list",
    group: "service",
    title: "PUF-профили",
    description: "План для будущей связки оборудования и профилей клубов.",
    usageStatus: "PLANNED",
    freshnessSource: "planned",
  },
  {
    method: "GET",
    path: "/public_api/routes",
    group: "service",
    title: "Карта маршрутов",
    description: "Диагностика доступности Langame endpoints без раскрытия API key.",
    usageStatus: "IN_USE",
    freshnessSource: "routes",
  },
  {
    method: "GET",
    path: "/public_api/ver/get_adminconsole",
    group: "service",
    title: "Версия Admin Console",
    description: "План для диагностики окружения Langame.",
    usageStatus: "PLANNED",
    freshnessSource: "planned",
  },
  {
    method: "GET",
    path: "/public_api/ver/get_po",
    group: "service",
    title: "Версия ПО",
    description: "План для проверки совместимости источников.",
    usageStatus: "PLANNED",
    freshnessSource: "planned",
  },
  {
    method: "GET",
    path: "/public_api/ver/get_terminal",
    group: "service",
    title: "Версия терминала",
    description: "План для диагностики платежных и терминальных сценариев.",
    usageStatus: "PLANNED",
    freshnessSource: "planned",
  },
];

const syncPeriodOptions: { value: SyncPeriod; label: string; caption: string }[] = [
  {
    value: "today",
    label: "Сегодня",
    caption: "Текущие сутки",
  },
  {
    value: "last7",
    label: "7 дней",
    caption: "Оперативная сверка",
  },
  {
    value: "last30",
    label: "30 дней",
    caption: "Контроль месяца",
  },
  {
    value: "custom",
    label: "Произвольно",
    caption: "Задать даты вручную",
  },
];

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

export function LangameSyncPanel({
  initialSettings,
}: {
  initialSettings: LangameSettings;
}) {
  const today = getTodayInputValue();
  const [settings, setSettings] = useState(initialSettings);
  const [syncPeriod, setSyncPeriod] = useState<SyncPeriod>("last7");
  const [syncDateFrom, setSyncDateFrom] = useState(shiftDateInput(today, -6));
  const [syncDateTo, setSyncDateTo] = useState(today);
  const [includeGuestLogs, setIncludeGuestLogs] = useState(false);
  const [syncResult, setSyncResult] = useState<CombinedSyncResult | null>(null);
  const [latestGuestStatus, setLatestGuestStatus] =
    useState<GuestSyncStatus | null>(null);
  const [assortmentStatus, setAssortmentStatus] =
    useState<SyncStepStatus>("idle");
  const [guestStatus, setGuestStatus] = useState<SyncStepStatus>("idle");
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [routeDiagnostics, setRouteDiagnostics] =
    useState<RouteDiagnosticsResult | null>(null);
  const [routeDiagnosticsStatus, setRouteDiagnosticsStatus] =
    useState<RouteDiagnosticsStatus>("idle");
  const [routeDiagnosticsError, setRouteDiagnosticsError] =
    useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    async function loadGuestStatus() {
      const status = await fetchGuestSyncStatus();

      if (!ignore) {
        setLatestGuestStatus(status);
      }
    }

    void loadGuestStatus();

    return () => {
      ignore = true;
    };
  }, []);

  function selectSyncPeriod(period: SyncPeriod) {
    setSyncPeriod(period);

    if (period === "today") {
      setSyncDateFrom(today);
      setSyncDateTo(today);
    } else if (period === "last7") {
      setSyncDateFrom(shiftDateInput(today, -6));
      setSyncDateTo(today);
    } else if (period === "last30") {
      setSyncDateFrom(shiftDateInput(today, -29));
      setSyncDateTo(today);
    }
  }

  async function syncAllLangameData() {
    setError(null);
    setSuccess(null);
    setSyncResult(null);
    setAssortmentStatus("running");
    setGuestStatus("running");
    setIsSyncing(true);

    try {
      const [assortmentResult, guestResult] = await Promise.allSettled([
        syncAssortmentData(syncDateFrom, syncDateTo),
        syncGuestFoundation(syncDateFrom, syncDateTo, includeGuestLogs),
      ]);
      const assortment =
        assortmentResult.status === "fulfilled" ? assortmentResult.value : null;
      const guests =
        guestResult.status === "fulfilled" ? guestResult.value : null;
      const result = {
        assortment,
        guests,
      };
      setSyncResult(result);
      setLatestGuestStatus(guests);

      if (!assortment) {
        setAssortmentStatus("error");
      } else {
        setAssortmentStatus(
          assortment.failedSources > 0 ? "error" : "success",
        );
      }

      if (guests?.status === "FAILED" || !guests) {
        setGuestStatus("error");
      } else {
        setGuestStatus("success");
      }

      if (!assortment || !guests) {
        const failure = [assortmentResult, guestResult].find(
          (item) => item.status === "rejected",
        );
        setError(
          failure?.status === "rejected" && failure.reason instanceof Error
            ? failure.reason.message
            : "Синхронизация завершилась не полностью. Проверьте детали ниже.",
        );
      } else if (guests.status === "FAILED") {
        setError(
          guests.latestRun?.errorMessage ??
            "Гостевая синхронизация завершилась с ошибкой.",
        );
      } else {
        setSuccess("Общая синхронизация Langame завершена.");
      }

      await refreshSettings();
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "API недоступен");
      setAssortmentStatus("error");
      setGuestStatus("error");
    } finally {
      setIsSyncing(false);
    }
  }

  async function refreshSettings() {
    const response = await fetch("/api/integrations/langame/settings");

    if (response.ok) {
      setSettings((await response.json()) as LangameSettings);
    }
  }

  async function checkRouteDiagnostics() {
    setRouteDiagnosticsStatus("loading");
    setRouteDiagnosticsError(null);

    try {
      const response = await fetch(
        "/api/integrations/langame/routes-diagnostics",
        {
          cache: "no-store",
        },
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(getErrorMessage(data));
      }

      setRouteDiagnostics(data as RouteDiagnosticsResult);
      setRouteDiagnosticsStatus("success");
    } catch (routeError) {
      setRouteDiagnosticsStatus("error");
      setRouteDiagnosticsError(
        routeError instanceof Error
          ? routeError.message
          : "Не удалось проверить карту маршрутов Langame",
      );
    }
  }

  return (
    <section className="mt-6 space-y-6">
      <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
              Общая синхронизация
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              Все данные Langame за выбранный период
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Одна кнопка обновляет клубы, товары, остатки, продажи, общую
              выручку, гостей, сессии, пополнения баланса, покупки бара и
              служебные логи.
            </p>
          </div>

          <button
            type="button"
            onClick={syncAllLangameData}
            disabled={
              !settings.hasApiKey ||
              !syncDateFrom ||
              !syncDateTo ||
              isSyncing
            }
            className="rounded-full bg-zinc-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400 dark:bg-emerald-400 dark:text-zinc-950 dark:hover:bg-emerald-300"
          >
            {isSyncing ? "Синхронизация..." : "Запустить общую синхронизацию"}
          </button>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {syncPeriodOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => selectSyncPeriod(option.value)}
                className={[
                  "rounded-lg border px-4 py-3 text-left transition",
                  syncPeriod === option.value
                    ? "border-zinc-950 bg-zinc-950 text-white dark:border-emerald-400 dark:bg-emerald-400 dark:text-zinc-950"
                    : "border-zinc-200 bg-zinc-50 text-zinc-900 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-zinc-700",
                ].join(" ")}
              >
                <span className="block text-sm font-semibold">{option.label}</span>
                <span className="mt-1 block text-xs opacity-70">
                  {option.caption}
                </span>
              </button>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Дата начала
              </span>
              <input
                type="date"
                value={syncDateFrom}
                onChange={(event) => {
                  setSyncPeriod("custom");
                  setSyncDateFrom(event.target.value);
                }}
                className="mt-2 block w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Дата окончания
              </span>
              <input
                type="date"
                value={syncDateTo}
                onChange={(event) => {
                  setSyncPeriod("custom");
                  setSyncDateTo(event.target.value);
                }}
                className="mt-2 block w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
          </div>
        </div>

        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm transition hover:border-zinc-300 hover:bg-white dark:border-zinc-800 dark:bg-zinc-900/60 dark:hover:border-zinc-700 dark:hover:bg-zinc-900">
          <input
            type="checkbox"
            checked={includeGuestLogs}
            onChange={(event) => setIncludeGuestLogs(event.target.checked)}
            className="mt-1 h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500 dark:border-zinc-700"
          />
          <span>
            <span className="block font-semibold text-zinc-950 dark:text-zinc-50">
              Проверить `guests/logs` для геймификации
            </span>
            <span className="mt-1 block leading-5 text-zinc-600 dark:text-zinc-400">
              Опционально загрузит типы событий гостя за выбранный период для
              миссий, лутбоксов, battle pass и anti-fraud. Обычная
              синхронизация остается легче, если флаг выключен.
            </span>
          </span>
        </label>

        {isSyncing ? (
          <SyncProgress
            assortmentStatus={assortmentStatus}
            guestStatus={guestStatus}
            periodFrom={syncDateFrom}
            periodTo={syncDateTo}
          />
        ) : null}

        {syncResult ? <SyncResultSummary result={syncResult} /> : null}

        {error ? (
          <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        {success ? (
          <p className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {success}
          </p>
        ) : null}
      </div>

      <SyncHealthSummary
        latestGuestStatus={latestGuestStatus}
        settings={settings}
      />
      <EndpointMapPanel
        diagnostics={routeDiagnostics}
        diagnosticsError={routeDiagnosticsError}
        diagnosticsStatus={routeDiagnosticsStatus}
        latestGuestStatus={latestGuestStatus}
        onCheckDiagnostics={checkRouteDiagnostics}
        settings={settings}
      />
      <LatestGuestDiagnostics status={latestGuestStatus} />
      <div className="grid gap-6 xl:grid-cols-2">
        <SyncHistory jobs={settings.syncJobs} />
        <GuestSyncHistory status={latestGuestStatus} />
      </div>
    </section>
  );
}

function SyncProgress({
  assortmentStatus,
  guestStatus,
  periodFrom,
  periodTo,
}: {
  assortmentStatus: SyncStepStatus;
  guestStatus: SyncStepStatus;
  periodFrom: string;
  periodTo: string;
}) {
  return (
    <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
      <p className="font-medium">Синхронизация выполняется</p>
      <p className="mt-1">
        Период: {formatDateLabel(periodFrom)} - {formatDateLabel(periodTo)}.
        Дождитесь результата на этой странице.
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <SyncStepCard
          title="Ассортимент"
          description="Клубы, товары, остатки, продажи и выручка клубов."
          status={assortmentStatus}
        />
        <SyncStepCard
          title="Гости"
          description="Гости, сессии, транзакции, покупки бара, смены и ПК."
          status={guestStatus}
        />
      </div>
    </div>
  );
}

function SyncStepCard({
  title,
  description,
  status,
}: {
  title: string;
  description: string;
  status: SyncStepStatus;
}) {
  return (
    <div className="rounded-md border border-amber-200/80 bg-white/70 p-3 dark:border-amber-900/70 dark:bg-zinc-950/40">
      <div className="flex items-center justify-between gap-3">
        <p className="font-medium">{title}</p>
        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-amber-800 dark:bg-zinc-900 dark:text-amber-200">
          {syncStepLabel(status)}
        </span>
      </div>
      <p className="mt-1 text-xs opacity-80">{description}</p>
    </div>
  );
}

function SyncResultSummary({ result }: { result: CombinedSyncResult }) {
  const guestRun = result.guests?.latestRun ?? null;
  const guestDiagnostics = guestRun?.diagnostics ?? null;

  return (
    <div className="mt-5 rounded-lg border border-zinc-100 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
      <h3 className="text-sm font-semibold">Результат синхронизации</h3>
      {result.assortment ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          <Metric label="Источников" value={result.assortment.sources} />
          <Metric label="Ошибок" value={result.assortment.failedSources} />
          <Metric label="Клубов" value={result.assortment.stores} />
          <Metric label="Товаров" value={result.assortment.products} />
          <Metric label="Остатков" value={result.assortment.inventorySnapshots} />
          <Metric label="Продаж" value={result.assortment.salesFacts} />
          <Metric label="Выручка клубов" value={result.assortment.clubRevenueFacts} />
          <Metric label="Расхождений" value={result.assortment.discrepancies} />
        </div>
      ) : null}
      {guestRun ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Гостей" value={guestRun.guestsCount} />
          <Metric label="Сессий" value={guestRun.sessionsCount} />
          <Metric label="Транзакций" value={guestRun.transactionsCount} />
          <Metric label="Покупок бара" value={guestRun.productSalesLinked} />
        </div>
      ) : null}
      {guestDiagnostics ? (
        <PcDiagnostics diagnostics={guestDiagnostics} className="mt-4" />
      ) : null}
    </div>
  );
}

function SyncHealthSummary({
  settings,
  latestGuestStatus,
}: {
  settings: LangameSettings;
  latestGuestStatus: GuestSyncStatus | null;
}) {
  const sourceRows = getSourceSyncHealth(settings);
  const activeSourcesCount = settings.sources.filter(
    (source) => source.isActive,
  ).length;
  const failedSources = sourceRows.filter((source) => source.status === "FAILED");
  const sourcesWithoutSuccess = sourceRows.filter(
    (source) => !source.lastSyncedAt && source.status !== "FAILED",
  );
  const latestSuccess = settings.latestSuccessfulSyncJob;
  const latestSuccessTime = latestSuccess ? getSyncJobTime(latestSuccess) : null;
  const guestRun = latestGuestStatus?.latestRun ?? null;
  const guestStatus = guestRun?.status ?? latestGuestStatus?.status ?? "IDLE";
  const guestEndpointErrors = Object.entries(
    guestRun?.diagnostics.endpointErrors ?? {},
  );

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
            Статус данных
          </p>
          <h2 className="mt-1 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
            Состояние синхронизации
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-zinc-500 dark:text-zinc-400">
            Последний успешный запуск, активные источники и видимые ошибки
            собраны в одном месте.
          </p>
        </div>
        <span className={statusBadgeClass(guestStatus)}>
          Гости: {syncStatusLabel(guestStatus)}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SyncHealthMetric
          detail="активных Langame-доменов"
          label="Источники"
          value={`${activeSourcesCount}/${settings.sources.length}`}
        />
        <SyncHealthMetric
          detail={latestSuccess?.domain ?? "успешных запусков пока нет"}
          label="Последний успех"
          value={latestSuccessTime ? formatDateTime(latestSuccessTime) : "не было"}
        />
        <SyncHealthMetric
          detail={
            failedSources.length > 0
              ? failedSources.map((source) => source.domain).join(", ")
              : "критичных ошибок нет"
          }
          label="Ошибки источников"
          tone={failedSources.length > 0 ? "danger" : "neutral"}
          value={failedSources.length}
        />
        <SyncHealthMetric
          detail={
            guestRun
              ? `${formatDateTime(guestRun.startedAt)}, endpoint-ошибок: ${guestEndpointErrors.length}`
              : "гостевых запусков пока нет"
          }
          label="Гостевой слой"
          tone={statusTone(guestStatus)}
          value={syncStatusLabel(guestStatus)}
        />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                Источники Langame
              </h3>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Последний запуск по каждому активному домену и последняя
                успешная дата данных.
              </p>
            </div>
            {sourcesWithoutSuccess.length > 0 ? (
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
                без успеха: {sourcesWithoutSuccess.length}
              </span>
            ) : null}
          </div>

          {sourceRows.length > 0 ? (
            <div className="mt-3 space-y-2">
              {sourceRows.map((source) => (
                <div
                  key={source.id}
                  className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-zinc-950 dark:text-zinc-50">
                        {source.name && source.name !== source.domain
                          ? `${source.name} · ${source.domain}`
                          : source.domain}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        {source.lastSyncedAt
                          ? `Данные источника: ${formatDateTime(source.lastSyncedAt)}`
                          : "успешной синхронизации источника пока нет"}
                      </p>
                    </div>
                    <span className={statusBadgeClass(source.status)}>
                      {sourceStatusLabel(source.status)}
                    </span>
                  </div>
                  {source.errorMessage ? (
                    <p className="mt-2 break-words text-xs text-red-700 dark:text-red-300">
                      {compactEndpointError(source.errorMessage)}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 rounded-md border border-zinc-200 bg-white px-3 py-3 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
              Активные Langame-источники пока не настроены.
            </p>
          )}
        </div>

        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                Гостевая синхронизация
              </h3>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Последний foundation-запуск и ошибки дополнительных endpoints.
              </p>
            </div>
            <span className={statusBadgeClass(guestStatus)}>
              {syncStatusLabel(guestStatus)}
            </span>
          </div>

          {guestRun ? (
            <div className="mt-3 space-y-3 text-sm">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                <div className="rounded-md border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
                  <p className="text-xs text-zinc-500">Последний запуск</p>
                  <p className="mt-1 font-medium text-zinc-950 dark:text-zinc-50">
                    {formatDateTime(guestRun.startedAt)}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">{guestRun.domain}</p>
                </div>
                <div className="rounded-md border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
                  <p className="text-xs text-zinc-500">Endpoint-ошибки</p>
                  <p
                    className={[
                      "mt-1 font-medium",
                      guestEndpointErrors.length > 0
                        ? "text-red-700 dark:text-red-300"
                        : "text-zinc-950 dark:text-zinc-50",
                    ].join(" ")}
                  >
                    {guestEndpointErrors.length}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {guestEndpointErrors.length > 0
                      ? guestEndpointErrors
                          .map(([endpoint]) => endpoint)
                          .slice(0, 2)
                          .join(", ")
                      : "ошибок нет"}
                  </p>
                </div>
              </div>
              {guestRun.errorMessage ? (
                <p className="break-words rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-200">
                  {compactEndpointError(guestRun.errorMessage)}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="mt-3 rounded-md border border-zinc-200 bg-white px-3 py-3 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
              Гостевых запусков пока не было.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function EndpointMapPanel({
  settings,
  latestGuestStatus,
  diagnostics,
  diagnosticsStatus,
  diagnosticsError,
  onCheckDiagnostics,
}: {
  settings: LangameSettings;
  latestGuestStatus: GuestSyncStatus | null;
  diagnostics: RouteDiagnosticsResult | null;
  diagnosticsStatus: RouteDiagnosticsStatus;
  diagnosticsError: string | null;
  onCheckDiagnostics: () => void;
}) {
  const availableRouteKeys = getAvailableRouteKeys(diagnostics);
  const endpointsByGroup = endpointGroupOrder.map((group) => ({
    group,
    endpoints: langameEndpointMap.filter((endpoint) => endpoint.group === group),
  }));
  const inUseCount = langameEndpointMap.filter(
    (endpoint) => endpoint.usageStatus === "IN_USE",
  ).length;
  const plannedCount = langameEndpointMap.filter(
    (endpoint) =>
      endpoint.usageStatus === "PLANNED" ||
      endpoint.usageStatus === "NEEDS_PARAMETERS",
  ).length;
  const writeCount = langameEndpointMap.filter(
    (endpoint) => endpoint.usageStatus === "WRITE_DECISION",
  ).length;
  const availableCount = diagnostics
    ? langameEndpointMap.filter((endpoint) =>
        availableRouteKeys.has(routeKey(endpoint.method, endpoint.path)),
      ).length
    : null;
  const latestAssortmentJob = settings.latestSuccessfulSyncJob;
  const latestGuestRun = latestGuestStatus?.latestRun ?? null;
  const successfulDiagnosticSources =
    diagnostics?.sources.filter((source) => source.status === "SUCCESS") ?? [];
  const failedDiagnosticSources =
    diagnostics?.sources.filter((source) => source.status === "FAILED") ?? [];

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
            Карта Langame API
          </p>
          <h2 className="mt-1 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
            Endpoints, свежесть данных и статус включения
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-500 dark:text-zinc-400">
            Раздел показывает, какие маршруты уже используются в LeetPlus, какие
            запланированы для CRM, маркетинга, ассортимента и персонала, а какие
            требуют отдельного write-решения.
          </p>
        </div>
        <button
          type="button"
          onClick={onCheckDiagnostics}
          disabled={diagnosticsStatus === "loading" || !settings.hasApiKey}
          className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-900 transition hover:border-zinc-950 hover:bg-zinc-950 hover:text-white disabled:cursor-not-allowed disabled:border-zinc-200 disabled:text-zinc-400 dark:border-zinc-700 dark:text-zinc-100 dark:hover:border-emerald-400 dark:hover:bg-emerald-400 dark:hover:text-zinc-950 dark:disabled:border-zinc-800 dark:disabled:text-zinc-500"
        >
          {diagnosticsStatus === "loading"
            ? "Проверяем маршруты..."
            : "Проверить доступность маршрутов"}
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SyncHealthMetric
          detail="из подтвержденной карты Langame API"
          label="Endpoints"
          value={langameEndpointMap.length}
        />
        <SyncHealthMetric
          detail="уже входят в текущий sync-контур"
          label="Используются"
          value={inUseCount}
        />
        <SyncHealthMetric
          detail="следующие источники для развития модулей"
          label="В плане"
          value={plannedCount}
        />
        <SyncHealthMetric
          detail="требует ролей, аудита и отдельного включения"
          label="Write"
          tone="warning"
          value={writeCount}
        />
        <SyncHealthMetric
          detail={
            diagnostics
              ? `успешных источников: ${successfulDiagnosticSources.length}`
              : "нажмите проверку маршрутов"
          }
          label="Доступно"
          value={availableCount === null ? "не проверено" : availableCount}
        />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <EndpointFreshnessCard
          detail={
            latestAssortmentJob
              ? latestAssortmentJob.domain
              : "успешного запуска пока нет"
          }
          label="Ассортимент"
          value={
            latestAssortmentJob
              ? formatDateTime(getSyncJobTime(latestAssortmentJob))
              : "не обновлялся"
          }
        />
        <EndpointFreshnessCard
          detail={
            latestGuestRun
              ? `${latestGuestRun.domain}, ${syncStatusLabel(latestGuestRun.status)}`
              : "гостевого запуска пока нет"
          }
          label="Гости и операции"
          value={
            latestGuestRun
              ? formatDateTime(latestGuestRun.finishedAt ?? latestGuestRun.startedAt)
              : "не обновлялись"
          }
        />
        <EndpointFreshnessCard
          detail={
            diagnostics
              ? `источников: ${diagnostics.sources.length}, ошибок: ${failedDiagnosticSources.length}`
              : "проверка выполняется вручную"
          }
          label="Маршруты"
          tone={failedDiagnosticSources.length > 0 ? "warning" : "neutral"}
          value={diagnostics ? formatDateTime(diagnostics.checkedAt) : "не проверялись"}
        />
      </div>

      {diagnosticsError ? (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-200">
          {diagnosticsError}
        </p>
      ) : null}

      <div className="mt-4 space-y-4">
        {endpointsByGroup.map(({ group, endpoints }) => (
          <div
            key={group}
            className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/50"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                {endpointGroupLabels[group]}
              </h3>
              <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
                {endpoints.length} endpoints
              </span>
            </div>

            <div className="mt-3 grid gap-2 xl:grid-cols-2">
              {endpoints.map((endpoint) => {
                const availability = getEndpointAvailability(
                  endpoint,
                  availableRouteKeys,
                  diagnostics,
                );

                return (
                  <div
                    key={`${endpoint.method}-${endpoint.path}`}
                    className="rounded-md border border-zinc-200 bg-white px-3 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={[
                              "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                              endpoint.method === "GET"
                                ? "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-200"
                                : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200",
                            ].join(" ")}
                          >
                            {endpoint.method}
                          </span>
                          <p className="font-medium text-zinc-950 dark:text-zinc-50">
                            {endpoint.title}
                          </p>
                        </div>
                        <p className="mt-1 break-all font-mono text-xs text-zinc-500 dark:text-zinc-400">
                          {endpoint.path}
                        </p>
                      </div>
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <span className={endpointStatusBadgeClass(endpoint.usageStatus)}>
                          {endpointStatusLabels[endpoint.usageStatus]}
                        </span>
                        <span className={availabilityBadgeClass(availability)}>
                          {availabilityLabel(availability)}
                        </span>
                      </div>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                      {endpoint.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LatestGuestDiagnostics({
  status,
}: {
  status: GuestSyncStatus | null;
}) {
  const latestRun = status?.latestRun;

  if (!latestRun) {
    return null;
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">
            Диагностика гостевой синхронизации
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Последний запуск: {latestRun.domain}, {formatDateTime(latestRun.startedAt)}.
          </p>
        </div>
        <span
          className={[
            "rounded-full px-2.5 py-1 text-xs font-medium",
            latestRun.status === "SUCCESS"
              ? "bg-emerald-50 text-emerald-700"
              : latestRun.status === "FAILED"
                ? "bg-red-50 text-red-700"
                : "bg-amber-50 text-amber-700",
          ].join(" ")}
        >
          {syncStatusLabel(latestRun.status)}
        </span>
      </div>
      <PcDiagnostics diagnostics={latestRun.diagnostics} className="mt-4" />
    </div>
  );
}

function PcDiagnostics({
  diagnostics,
  className = "",
}: {
  diagnostics: NonNullable<GuestSyncStatus["latestRun"]>["diagnostics"];
  className?: string;
}) {
  const endpointErrors = Object.entries(diagnostics.endpointErrors);
  const pcTypeFields = Object.keys(diagnostics.pcTypesInClubs.fieldCounts);
  const pcLinkFields = Object.keys(diagnostics.pcTypeLinks.fieldCounts);
  const guestLogTypes = formatTypeCounts(diagnostics.guestLogs.typeCounts);

  return (
    <div className={className}>
      <div className="grid gap-3 md:grid-cols-4">
        <DiagnosticCard
          title="Типы ПК в клубах"
          value={diagnostics.pcTypesInClubs.total}
          details={
            pcTypeFields.length > 0
              ? pcTypeFields.slice(0, 6).join(", ")
              : "полей нет"
          }
        />
        <DiagnosticCard
          title="Связи ПК с типами"
          value={diagnostics.pcTypeLinks.total}
          details={
            pcLinkFields.length > 0
              ? pcLinkFields.slice(0, 6).join(", ")
              : "полей нет"
          }
        />
        <DiagnosticCard
          title="Логи гостей"
          value={diagnostics.guestLogs.total}
          details={
            guestLogTypes.length > 0
              ? guestLogTypes
              : "выключены или событий нет"
          }
          tone={
            diagnostics.guestLogs.invalidDates > 0 ||
            diagnostics.guestLogs.withoutGuestId > 0
              ? "danger"
              : "neutral"
          }
        />
        <DiagnosticCard
          title="Ошибки endpoints"
          value={endpointErrors.length}
          details={
            endpointErrors.length > 0
              ? endpointErrors.map(([key]) => key).slice(0, 3).join(", ")
              : "ошибок нет"
          }
          tone={endpointErrors.length > 0 ? "danger" : "neutral"}
        />
      </div>
      {endpointErrors.length > 0 ? (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-3 text-xs text-red-800 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-100">
          <p className="font-semibold">Детали endpoint-ошибок</p>
          <div className="mt-2 space-y-2">
            {endpointErrors.slice(0, 5).map(([endpoint, message]) => (
              <div
                key={endpoint}
                className="grid gap-1 sm:grid-cols-[11rem_minmax(0,1fr)]"
              >
                <span className="font-semibold text-red-900 dark:text-red-50">
                  {endpoint}
                </span>
                <span className="break-words text-red-800/90 dark:text-red-100/80">
                  {compactEndpointError(message)}
                </span>
              </div>
            ))}
          </div>
          {endpointErrors.length > 5 ? (
            <p className="mt-2 text-red-800/80 dark:text-red-100/70">
              Показаны первые 5 ошибок из {endpointErrors.length}.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function formatTypeCounts(typeCounts: Record<string, number>) {
  return Object.entries(typeCounts)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([type, count]) => `${type}: ${count}`)
    .join(", ");
}

function compactEndpointError(message: string) {
  return message.length > 360 ? `${message.slice(0, 360)}...` : message;
}

function DiagnosticCard({
  title,
  value,
  details,
  tone = "neutral",
}: {
  title: string;
  value: number;
  details: string;
  tone?: "neutral" | "danger";
}) {
  return (
    <div
      className={[
        "rounded-md border bg-white px-3 py-2 dark:bg-zinc-950",
        tone === "danger"
          ? "border-red-200 dark:border-red-900/70"
          : "border-zinc-200 dark:border-zinc-800",
      ].join(" ")}
    >
      <p className="text-xs text-zinc-500">{title}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 truncate text-xs text-zinc-500" title={details}>
        {details}
      </p>
    </div>
  );
}

function SyncHistory({ jobs }: { jobs: LangameSettings["syncJobs"] }) {
  const latestJobs = getLatestSyncJobsByDomain(jobs);

  return (
    <div className="rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
        <h2 className="text-base font-semibold">История синхронизаций</h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Последние запуски товарной части Langame и файлы расхождений.
        </p>
      </div>

      {latestJobs.length > 0 ? (
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {latestJobs.map((job) => (
            <div key={job.id} className="px-5 py-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-zinc-950 dark:text-zinc-50">
                    {job.domain}
                  </p>
                  <p className="mt-1 text-zinc-500 dark:text-zinc-400">
                    {formatDateTime(job.startedAt)}
                  </p>
                </div>
                <span
                  className={[
                    "rounded-full px-2.5 py-1 text-xs font-medium",
                    job.status === "SUCCESS"
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-red-50 text-red-700",
                  ].join(" ")}
                >
                  {job.status === "SUCCESS" ? "Успешно" : "Ошибка"}
                </span>
              </div>
              <p className="mt-2 text-zinc-600 dark:text-zinc-400">
                {job.errorMessage ??
                  `Клубов: ${job.storesCount}, товаров: ${job.productsCount}, остатков: ${job.inventoryCount}, продаж: ${job.salesCount}, расхождений: ${job.discrepancyCount}`}
              </p>
              {job.hasDiscrepancyLog ? (
                <a
                  href={`/api/integrations/langame/sync-jobs/${job.id}/discrepancy-log`}
                  className="mt-2 inline-flex text-sm font-medium text-zinc-900 underline underline-offset-4 dark:text-zinc-100"
                >
                  Скачать файл расхождений
                </a>
              ) : null}
            </div>
          ))}
          {jobs.length > latestJobs.length ? (
            <p className="px-5 py-3 text-xs text-zinc-500 dark:text-zinc-400">
              Показан последний запуск по каждому источнику. Повторные ошибки
              по тем же доменам скрыты, чтобы история не дублировалась.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="px-5 py-6 text-sm text-zinc-500">
          Синхронизаций пока не было.
        </p>
      )}
    </div>
  );
}

function GuestSyncHistory({ status }: { status: GuestSyncStatus | null }) {
  const runs = status?.recentRuns ?? [];

  return (
    <div className="rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
        <h2 className="text-base font-semibold">
          История гостевой синхронизации
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Последние foundation-runs по источникам: гости, сессии, транзакции и
          ошибки endpoints.
        </p>
      </div>

      {runs.length > 0 ? (
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {runs.map((run) => {
            const endpointErrorCount = Object.keys(
              run.diagnostics.endpointErrors,
            ).length;

            return (
              <div
                key={`${run.domain}-${run.startedAt}`}
                className="px-5 py-4 text-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-zinc-950 dark:text-zinc-50">
                      {run.domain}
                    </p>
                    <p className="mt-1 text-zinc-500 dark:text-zinc-400">
                      {formatDateTime(run.startedAt)}
                      {run.dateFrom && run.dateTo
                        ? ` · период ${formatDateLabel(run.dateFrom)} - ${formatDateLabel(run.dateTo)}`
                        : ""}
                    </p>
                  </div>
                  <span className={statusBadgeClass(run.status)}>
                    {syncStatusLabel(run.status)}
                  </span>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <CompactRunMetric label="Гостей" value={run.guestsCount} />
                  <CompactRunMetric label="Сессий" value={run.sessionsCount} />
                  <CompactRunMetric
                    label="Транзакций"
                    value={run.transactionsCount}
                  />
                  <CompactRunMetric
                    label="Ошибок endpoints"
                    tone={endpointErrorCount > 0 ? "danger" : "neutral"}
                    value={endpointErrorCount}
                  />
                </div>

                {run.errorMessage ? (
                  <p className="mt-3 break-words rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-200">
                    {compactEndpointError(run.errorMessage)}
                  </p>
                ) : endpointErrorCount > 0 ? (
                  <p className="mt-3 truncate text-xs text-amber-700 dark:text-amber-300">
                    Endpoint-ошибки:{" "}
                    {Object.keys(run.diagnostics.endpointErrors)
                      .slice(0, 3)
                      .join(", ")}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="px-5 py-6 text-sm text-zinc-500">
          История гостевой синхронизации пока не загружена.
        </p>
      )}
    </div>
  );
}

type EndpointAvailability = "available" | "missing" | "unchecked";

function EndpointFreshnessCard({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "neutral" | "warning";
}) {
  return (
    <div
      className={[
        "rounded-md border bg-zinc-50 px-3 py-3 text-sm dark:bg-zinc-900/50",
        tone === "warning"
          ? "border-amber-200 dark:border-amber-900/70"
          : "border-zinc-200 dark:border-zinc-800",
      ].join(" ")}
    >
      <p className="text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <p className="mt-1 font-semibold text-zinc-950 dark:text-zinc-50">
        {value}
      </p>
      <p className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400" title={detail}>
        {detail}
      </p>
    </div>
  );
}

function getAvailableRouteKeys(diagnostics: RouteDiagnosticsResult | null) {
  const keys = new Set<string>();

  diagnostics?.sources.forEach((source) => {
    if (source.status !== "SUCCESS") {
      return;
    }

    source.routes.forEach((route) => {
      const method = route.method?.toUpperCase();

      if ((method !== "GET" && method !== "POST") || !route.path) {
        return;
      }

      keys.add(routeKey(method, route.path));
    });
  });

  return keys;
}

function getEndpointAvailability(
  endpoint: EndpointMapItem,
  availableRouteKeys: Set<string>,
  diagnostics: RouteDiagnosticsResult | null,
): EndpointAvailability {
  if (!diagnostics) {
    return "unchecked";
  }

  return availableRouteKeys.has(routeKey(endpoint.method, endpoint.path))
    ? "available"
    : "missing";
}

function routeKey(method: EndpointMethod, path: string) {
  return `${method}:${normalizeRoutePath(path)}`;
}

function normalizeRoutePath(path: string) {
  const normalized = path
    .trim()
    .replace(/^https?:\/\/[^/]+/i, "")
    .replace(/^\/public_api/i, "")
    .replace(/\{([^}:]+):[^}]+\}/g, "{$1}");

  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function endpointStatusBadgeClass(status: EndpointUsageStatus) {
  const base = "rounded-full px-2 py-0.5 text-[11px] font-medium";

  if (status === "IN_USE") {
    return `${base} bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200`;
  }

  if (status === "NEEDS_PARAMETERS") {
    return `${base} bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200`;
  }

  if (status === "WRITE_DECISION") {
    return `${base} bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-200`;
  }

  return `${base} bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300`;
}

function availabilityBadgeClass(availability: EndpointAvailability) {
  const base = "rounded-full px-2 py-0.5 text-[11px] font-medium";

  if (availability === "available") {
    return `${base} bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200`;
  }

  if (availability === "missing") {
    return `${base} bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-200`;
  }

  return `${base} bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300`;
}

function availabilityLabel(availability: EndpointAvailability) {
  if (availability === "available") {
    return "доступен";
  }

  if (availability === "missing") {
    return "не найден";
  }

  return "не проверен";
}

function getLatestSyncJobsByDomain(jobs: LangameSettings["syncJobs"]) {
  const byDomain = new Map<string, LangameSettings["syncJobs"][number]>();

  jobs.forEach((job) => {
    if (!byDomain.has(job.domain)) {
      byDomain.set(job.domain, job);
    }
  });

  return Array.from(byDomain.values());
}

function getSourceSyncHealth(settings: LangameSettings): SourceSyncHealth[] {
  const latestJobsByDomain = new Map(
    getLatestSyncJobsByDomain(settings.syncJobs).map((job) => [job.domain, job]),
  );

  return settings.sources
    .filter((source) => source.isActive)
    .map((source) => {
      const latestJob = latestJobsByDomain.get(source.domain) ?? null;
      const status = latestJob?.status ?? (source.lastSyncedAt ? "SUCCESS" : "IDLE");

      return {
        id: source.id,
        domain: source.domain,
        name: source.name,
        status,
        lastSyncedAt: source.lastSyncedAt,
        errorMessage:
          latestJob?.status === "FAILED" ? latestJob.errorMessage : null,
        latestJob,
      };
    });
}

function getSyncJobTime(job: LangameSyncJob) {
  return job.finishedAt ?? job.startedAt;
}

function sourceStatusLabel(value: SourceSyncHealth["status"]) {
  if (value === "IDLE") {
    return "Нет запуска";
  }

  return syncStatusLabel(value);
}

function statusTone(value: string): "neutral" | "danger" | "warning" {
  if (value === "FAILED") {
    return "danger";
  }

  if (value === "RUNNING" || value === "IDLE") {
    return "warning";
  }

  return "neutral";
}

function statusBadgeClass(value: string) {
  const base = "rounded-full px-2.5 py-1 text-xs font-medium";

  if (value === "SUCCESS") {
    return `${base} bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200`;
  }

  if (value === "FAILED") {
    return `${base} bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-200`;
  }

  if (value === "RUNNING") {
    return `${base} bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200`;
  }

  return `${base} bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300`;
}

function SyncHealthMetric({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  detail: string;
  tone?: "neutral" | "danger" | "warning";
}) {
  return (
    <div
      className={[
        "rounded-md border bg-zinc-50 px-3 py-2 dark:bg-zinc-900/50",
        tone === "danger"
          ? "border-red-200 dark:border-red-900/70"
          : tone === "warning"
            ? "border-amber-200 dark:border-amber-900/70"
            : "border-zinc-200 dark:border-zinc-800",
      ].join(" ")}
    >
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-zinc-950 dark:text-zinc-50">
        {value}
      </p>
      <p className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400" title={detail}>
        {detail}
      </p>
    </div>
  );
}

function CompactRunMetric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "danger";
}) {
  return (
    <div
      className={[
        "rounded-md border bg-zinc-50 px-3 py-2 dark:bg-zinc-900/50",
        tone === "danger"
          ? "border-red-200 dark:border-red-900/70"
          : "border-zinc-200 dark:border-zinc-800",
      ].join(" ")}
    >
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
      <p
        className={[
          "mt-1 font-semibold tabular-nums",
          tone === "danger"
            ? "text-red-700 dark:text-red-300"
            : "text-zinc-950 dark:text-zinc-50",
        ].join(" ")}
      >
        {value}
      </p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

async function waitForGuestSyncCompletion() {
  await sleep(guestSyncPollIntervalMs);

  for (let attempt = 0; attempt < guestSyncPollAttempts; attempt += 1) {
    const syncStatus = await fetchGuestSyncStatus();

    if (syncStatus && !syncStatus.running) {
      return syncStatus;
    }

    await sleep(guestSyncPollIntervalMs);
  }

  return null;
}

async function syncAssortmentData(dateFrom: string, dateTo: string) {
  const response = await fetch("/api/integrations/langame/sync", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      dateFrom,
      dateTo,
      mode: "BACKFILL",
    }),
  });
  const data = (await response.json()) as unknown;

  if (!response.ok) {
    throw new Error(getErrorMessage(data));
  }

  return data as SyncResult;
}

async function syncGuestFoundation(
  dateFrom: string,
  dateTo: string,
  includeGuestLogs: boolean,
) {
  const response = await fetch(
    "/api/integrations/langame/guests/foundation/sync/start",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dateFrom,
        dateTo,
        includeGuestLogs,
      }),
    },
  );
  const data = (await response.json()) as unknown;

  if (!response.ok) {
    throw new Error(getErrorMessage(data));
  }

  return waitForGuestSyncCompletion();
}

async function fetchGuestSyncStatus() {
  const response = await fetch(
    "/api/integrations/langame/guests/foundation/sync/status",
    { cache: "no-store" },
  );

  if (!response.ok) {
    return null;
  }

  return response.json() as Promise<GuestSyncStatus>;
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function syncStepLabel(value: SyncStepStatus) {
  if (value === "running") {
    return "идет";
  }

  if (value === "success") {
    return "готово";
  }

  if (value === "error") {
    return "ошибка";
  }

  return "ожидает";
}

function syncStatusLabel(value: string) {
  if (value === "SUCCESS") {
    return "Успешно";
  }

  if (value === "FAILED") {
    return "Ошибка";
  }

  if (value === "RUNNING") {
    return "Выполняется";
  }

  return value;
}

function getTodayInputValue() {
  const now = new Date();

  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

function shiftDateInput(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}

function formatDateLabel(value: string) {
  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    return value;
  }

  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

import Link from "next/link";
import type { DashboardRevenueSnapshot } from "@/lib/dashboard-summary";

type RevenueSnapshotGateProps = {
  snapshot: DashboardRevenueSnapshot;
  periodFrom: string;
  periodTo: string;
  selectedStoreIds?: readonly string[];
  compact?: boolean;
};

const statusConfig: Record<
  DashboardRevenueSnapshot["status"],
  {
    label: string;
    title: string;
    description: string;
    className: string;
  }
> = {
  FRESH: {
    label: "Свежий",
    title: "Данные выручки готовы для выбранного периода",
    description:
      "Страница использует подготовленный REVENUE snapshot без скрытой синхронизации.",
    className:
      "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-100",
  },
  STALE: {
    label: "Устарел",
    title: "Для выбранного периода нет точного свежего снимка",
    description:
      "Показатели считаются из сохраненных фактов, но перед финальной сверкой лучше создать typed snapshot.",
    className:
      "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-100",
  },
  MISSING: {
    label: "Нет snapshot",
    title: "REVENUE snapshot еще не создан",
    description:
      "Страница не запускает обновление сама. Создайте снимок на странице синхронизации, когда данные за период загружены.",
    className:
      "border-red-200 bg-red-50 text-red-800 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-100",
  },
  FAILED: {
    label: "Ошибка",
    title: "Последний REVENUE snapshot завершился ошибкой",
    description:
      "Откройте синхронизацию, проверьте журнал typed snapshots и повторите создание снимка.",
    className:
      "border-red-200 bg-red-50 text-red-800 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-100",
  },
};

const sourceLabels: Record<string, string> = {
  salesFacts: "продажи",
  guestOperationLogs: "операции",
  guestTransactions: "транзакции",
  guestWorkingShifts: "смены",
};

function formatDate(value: string | null) {
  if (!value) {
    return "нет данных";
  }

  const date = new Date(value.includes("T") ? value : `${value}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "нет данных";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Yekaterinburg",
  }).format(date);
}

function formatSnapshotPeriod(snapshot: DashboardRevenueSnapshot) {
  if (!snapshot.periodFrom || !snapshot.periodTo) {
    return "период снимка не найден";
  }

  return `${formatDate(snapshot.periodFrom)} - ${formatDate(snapshot.periodTo)}`;
}

function sourceCountEntries(snapshot: DashboardRevenueSnapshot) {
  return Object.entries(snapshot.sourceCounts)
    .filter(([, value]) => value > 0)
    .slice(0, 4);
}

export function RevenueSnapshotGate({
  snapshot,
  periodFrom,
  periodTo,
  selectedStoreIds = [],
  compact = false,
}: RevenueSnapshotGateProps) {
  const config = statusConfig[snapshot.status];
  const sources = sourceCountEntries(snapshot);
  const hasStoreFilter = selectedStoreIds.length > 0;

  return (
    <section
      className={[
        "rounded-lg border p-4 shadow-sm",
        config.className,
        compact ? "mt-4" : "mt-6",
      ].join(" ")}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-white/70 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-current dark:bg-white/10">
              REVENUE snapshot
            </span>
            <span className="rounded-full bg-white/70 px-2.5 py-1 text-xs font-semibold text-current dark:bg-white/10">
              {config.label}
            </span>
          </div>
          <h2 className="mt-3 text-base font-semibold text-current">
            {config.title}
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 opacity-85">
            {config.description}
          </p>
          {hasStoreFilter ? (
            <p className="mt-2 max-w-3xl text-xs leading-5 opacity-75">
              Выбран фильтр клубов: snapshot показывает свежесть общего
              денежного слоя за период, а суммы страницы считаются по
              сохраненным фактам выбранных клубов.
            </p>
          ) : null}
        </div>
        <Link
          href="/sync"
          className="inline-flex shrink-0 items-center justify-center rounded-lg border border-current/20 bg-white/70 px-4 py-2 text-sm font-semibold transition hover:bg-white dark:bg-white/10 dark:hover:bg-white/15"
        >
          Открыть синхронизацию
        </Link>
      </div>

      <div className="mt-4 grid gap-3 text-xs sm:grid-cols-3">
        <div>
          <p className="font-semibold opacity-65">Период страницы</p>
          <p className="mt-1 font-medium">
            {formatDate(periodFrom)} - {formatDate(periodTo)}
          </p>
        </div>
        <div>
          <p className="font-semibold opacity-65">Период snapshot</p>
          <p className="mt-1 font-medium">{formatSnapshotPeriod(snapshot)}</p>
        </div>
        <div>
          <p className="font-semibold opacity-65">Создан</p>
          <p className="mt-1 font-medium">
            {formatDateTime(snapshot.generatedAt)}
          </p>
        </div>
      </div>

      {sources.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {sources.map(([key, value]) => (
            <span
              key={key}
              className="rounded-full bg-white/60 px-2.5 py-1 font-semibold dark:bg-white/10"
            >
              {sourceLabels[key] ?? key}: {value}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

import Link from "next/link";
import type {
  BusinessSnapshotStatus,
  BusinessSnapshotType,
  BusinessSnapshotTypeStatus,
} from "@/lib/business-snapshots";

type BusinessSnapshotGateProps = {
  snapshot: BusinessSnapshotTypeStatus | null;
  type: BusinessSnapshotType;
  compact?: boolean;
  compactPeriodLabel?: string;
  compactPeriodBadge?: string;
};

const statusConfig: Record<
  BusinessSnapshotStatus,
  {
    label: string;
    title: string;
    className: string;
  }
> = {
  FRESH: {
    label: "Свежий",
    title: "Typed snapshot готов",
    className:
      "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/70 dark:bg-emerald-950/25 dark:text-emerald-100",
  },
  STALE: {
    label: "Устарел",
    title: "Typed snapshot пора обновить",
    className:
      "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/25 dark:text-amber-100",
  },
  EMPTY: {
    label: "Нет snapshot",
    title: "Typed snapshot еще не создан",
    className:
      "border-red-200 bg-red-50 text-red-800 dark:border-red-900/70 dark:bg-red-950/25 dark:text-red-100",
  },
  FAILED: {
    label: "Ошибка",
    title: "Последний snapshot завершился ошибкой",
    className:
      "border-red-200 bg-red-50 text-red-800 dark:border-red-900/70 dark:bg-red-950/25 dark:text-red-100",
  },
};

const typeLabels: Record<BusinessSnapshotType, string> = {
  REVENUE: "Выручка",
  GUESTS: "Гости и CRM",
  TARIFFS: "Тарифы и промо",
  ASSORTMENT_ARRIVALS: "Ассортимент",
  STAFF_SHIFTS_CASH: "Смены и касса",
};

const sourceLabels: Record<string, string> = {
  guests: "гости",
  guestGroups: "группы",
  sessions: "сессии",
  logs: "логи",
  transactions: "транзакции",
  balances: "балансы",
  bonusBalances: "бонусы",
  inventorySnapshots: "остатки",
  stockMovements: "движения",
  products: "товары",
  stores: "клубы",
  workingShifts: "смены",
  operationLogs: "операции",
  staffMembers: "сотрудники",
  staffMappings: "привязки",
};

function formatDate(value: string | null | undefined) {
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
    timeZone: "UTC",
  }).format(date);
}

function formatAge(ageHours: number | null | undefined) {
  if (ageHours === null || ageHours === undefined) {
    return "нет данных";
  }

  if (ageHours < 1) {
    return "меньше 1 часа";
  }

  return `${new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 1,
  }).format(ageHours)} ч`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function sourceEntries(snapshot: BusinessSnapshotTypeStatus | null) {
  if (!snapshot) {
    return [];
  }

  return Object.entries(snapshot.sourceCounts)
    .filter(([, value]) => value > 0)
    .slice(0, 5);
}

export function BusinessSnapshotGate({
  snapshot,
  type,
  compact = false,
  compactPeriodLabel,
  compactPeriodBadge,
}: BusinessSnapshotGateProps) {
  const status = snapshot?.status ?? "EMPTY";
  const config = statusConfig[status];
  const latest = snapshot?.latestSuccessfulRun ?? null;
  const latestRunError = snapshot?.latestRun?.errorMessage ?? null;
  const sources = sourceEntries(snapshot);
  const periodLabel = `${formatDate(latest?.periodFrom)} - ${formatDate(
    latest?.periodTo,
  )}`;

  if (compact) {
    return (
      <section
        className={[
          "mt-6 rounded-lg border px-4 py-2.5 shadow-sm",
          config.className,
        ].join(" ")}
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="flex items-center gap-2 font-semibold">
              <span className="h-2.5 w-2.5 rounded-full bg-current" />
              {typeLabels[type]}
            </span>
            <span className="rounded-full bg-white/70 px-2 py-0.5 text-xs font-semibold dark:bg-white/10">
              {config.label}
            </span>
            <span className="text-xs font-medium opacity-80">
              Snapshot: {periodLabel}
            </span>
            {compactPeriodLabel ? (
              <span className="text-xs font-medium opacity-80">
                Staff-control: {compactPeriodLabel}
              </span>
            ) : null}
            {compactPeriodBadge ? (
              <span className="rounded-full bg-white/70 px-2 py-0.5 text-xs font-semibold dark:bg-white/10">
                {compactPeriodBadge}
              </span>
            ) : null}
          </div>
          <Link
            href="/sync"
            className="inline-flex h-8 shrink-0 items-center justify-center rounded-md border border-current/20 bg-white/70 px-3 text-xs font-semibold transition hover:bg-white dark:bg-white/10 dark:hover:bg-white/15"
          >
            Синхронизация
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section
      className={["mt-6 rounded-lg border p-4 shadow-sm", config.className].join(
        " ",
      )}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-white/70 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide dark:bg-white/10">
              {typeLabels[type]}
            </span>
            <span className="rounded-full bg-white/70 px-2.5 py-1 text-xs font-semibold dark:bg-white/10">
              {config.label}
            </span>
          </div>
          <h2 className="mt-3 text-base font-semibold">
            {snapshot ? config.title : "Статус typed snapshot не получен"}
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 opacity-85">
            {snapshot
              ? snapshot.nextAction
              : "Страница работает по сохраненным данным, но не смогла показать freshness-gate. Проверьте `/sync` перед финальной сверкой."}
          </p>
          {latestRunError ? (
            <p className="mt-2 max-w-3xl text-xs leading-5 opacity-80">
              Ошибка последнего запуска: {latestRunError}
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

      <div className="mt-4 grid gap-3 text-xs sm:grid-cols-4">
        <div>
          <p className="font-semibold opacity-65">Период snapshot</p>
          <p className="mt-1 font-medium">
            {formatDate(latest?.periodFrom)} - {formatDate(latest?.periodTo)}
          </p>
        </div>
        <div>
          <p className="font-semibold opacity-65">Возраст</p>
          <p className="mt-1 font-medium">{formatAge(snapshot?.ageHours)}</p>
        </div>
        <div>
          <p className="font-semibold opacity-65">Строки</p>
          <p className="mt-1 font-medium">
            {formatNumber(snapshot?.rowCount ?? 0)}
          </p>
        </div>
        <div>
          <p className="font-semibold opacity-65">Устаревает через</p>
          <p className="mt-1 font-medium">
            {formatNumber(snapshot?.staleAfterHours ?? 24)} ч
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
              {sourceLabels[key] ?? key}: {formatNumber(value)}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

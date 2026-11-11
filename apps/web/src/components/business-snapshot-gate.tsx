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

// What the page's numbers are about, as part of a sentence: «Данные по гостям…».
const typeSubject: Record<BusinessSnapshotType, string> = {
  REVENUE: "по выручке",
  GUESTS: "по гостям",
  TARIFFS: "по тарифам и промо",
  ASSORTMENT_ARRIVALS: "по ассортименту",
  STAFF_SHIFTS_CASH: "по сменам и кассе",
};

const sourceLabels: Record<string, string> = {
  guests: "гости",
  guestGroups: "группы",
  sessions: "сессии",
  logs: "события",
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

// Only a real failure is red. «Not calculated yet» is a neutral fact, not an alarm.
const dotClass: Record<BusinessSnapshotStatus | "UNKNOWN", string> = {
  FRESH: "bg-emerald-500",
  STALE: "bg-amber-500",
  EMPTY: "bg-zinc-400 dark:bg-zinc-500",
  FAILED: "bg-red-500",
  UNKNOWN: "bg-zinc-400 dark:bg-zinc-500",
};

function formatDate(value: string | null | undefined) {
  if (!value) {
    return null;
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

export function formatSnapshotAge(ageHours: number | null | undefined) {
  if (ageHours === null || ageHours === undefined) {
    return null;
  }

  if (ageHours < 1) {
    return "меньше часа назад";
  }

  if (ageHours < 48) {
    return `${Math.round(ageHours)} ч назад`;
  }

  return `${Math.round(ageHours / 24)} дн назад`;
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

/** One sentence: what the data is, how old it is, and what to do about it. */
export function snapshotVerdict(
  snapshot: BusinessSnapshotTypeStatus | null,
  type: BusinessSnapshotType,
) {
  const subject = typeSubject[type];

  if (!snapshot) {
    return `Не удалось проверить, насколько свежие данные ${subject}. Цифры ниже посчитаны по сохранённым данным.`;
  }

  const dataDate = formatDate(snapshot.latestSuccessfulRun?.periodTo);
  const age = formatSnapshotAge(snapshot.ageHours);
  const asOf = dataDate
    ? `Данные ${subject} на ${dataDate}`
    : `Данные ${subject}`;
  const updated = age ? `, обновлены ${age}` : "";

  switch (snapshot.status) {
    case "FRESH":
      return `${asOf}${updated}.`;
    case "STALE":
      return `${asOf}${updated}. Пора обновить перед сверкой.`;
    case "FAILED":
      return `Не удалось подготовить данные ${subject}. Цифры ниже посчитаны по уже сохранённым данным.`;
    case "EMPTY":
    default:
      return `Расчёт ${subject} за период ещё не готов. Цифры ниже посчитаны по уже сохранённым данным.`;
  }
}

export function BusinessSnapshotGate({
  snapshot,
  type,
  compact = false,
  compactPeriodLabel,
  compactPeriodBadge,
}: BusinessSnapshotGateProps) {
  const status = snapshot?.status ?? "UNKNOWN";
  const latest = snapshot?.latestSuccessfulRun ?? null;
  const latestRunError = snapshot?.latestRun?.errorMessage ?? null;
  const sources = sourceEntries(snapshot);
  const periodFrom = formatDate(latest?.periodFrom);
  const periodTo = formatDate(latest?.periodTo);
  const failed = status === "FAILED";
  const needsAction = status === "STALE" || failed;

  return (
    <section
      className={[
        compact ? "mt-4" : "mt-6",
        "rounded-lg border px-4 py-2.5 text-sm",
        failed
          ? "border-red-200 bg-red-50 text-red-900 dark:border-red-900/70 dark:bg-red-950/25 dark:text-red-100"
          : "border-zinc-200 bg-white text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300",
      ].join(" ")}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <span className="flex min-w-0 items-center gap-2">
            <span
              aria-hidden="true"
              className={`h-2 w-2 shrink-0 rounded-full ${dotClass[status]}`}
            />
            <span>{snapshotVerdict(snapshot, type)}</span>
          </span>
          {compactPeriodLabel ? (
            <span className="text-zinc-500 dark:text-zinc-400">
              Контроль смен: {compactPeriodLabel}
            </span>
          ) : null}
          {compactPeriodBadge ? (
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
              {compactPeriodBadge}
            </span>
          ) : null}
        </div>
        <Link
          href="/connections"
          className={[
            "inline-flex h-8 shrink-0 cursor-pointer items-center justify-center rounded-md border px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500",
            needsAction
              ? "border-current/30 bg-white/70 hover:bg-white dark:bg-white/10 dark:hover:bg-white/15"
              : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900",
          ].join(" ")}
        >
          {needsAction ? "Обновить данные" : "Синхронизация"}
        </Link>
      </div>

      {snapshot ? (
        <details className="group mt-1">
          <summary className="w-fit cursor-pointer text-xs font-medium text-zinc-500 hover:text-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-zinc-400 dark:hover:text-zinc-200">
            Подробнее
          </summary>
          <dl className="mt-2 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-[auto_1fr]">
            <dt className="text-zinc-500 dark:text-zinc-400">Период расчёта</dt>
            <dd>
              {periodFrom && periodTo
                ? `${periodFrom} – ${periodTo}`
                : "ещё не считался"}
            </dd>
            <dt className="text-zinc-500 dark:text-zinc-400">
              Строк в расчёте
            </dt>
            <dd className="tabular-nums">{formatNumber(snapshot.rowCount)}</dd>
            <dt className="text-zinc-500 dark:text-zinc-400">
              Считается свежим
            </dt>
            <dd className="tabular-nums">
              {formatNumber(snapshot.staleAfterHours)} ч после обновления
            </dd>
            {sources.length > 0 ? (
              <>
                <dt className="text-zinc-500 dark:text-zinc-400">Источники</dt>
                <dd>
                  {sources
                    .map(
                      ([key, value]) =>
                        `${sourceLabels[key] ?? key}: ${formatNumber(value)}`,
                    )
                    .join(", ")}
                </dd>
              </>
            ) : null}
            {latestRunError ? (
              <>
                <dt className="text-zinc-500 dark:text-zinc-400">
                  Последняя ошибка
                </dt>
                <dd className="[overflow-wrap:anywhere]">{latestRunError}</dd>
              </>
            ) : null}
          </dl>
        </details>
      ) : null}
    </section>
  );
}

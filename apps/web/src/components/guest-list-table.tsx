import Link from "next/link";
import type {
  GuestDashboardRow,
  GuestListFilters,
  GuestListResponse,
  GuestListSort,
} from "@/lib/guests";
import {
  activeFilterChips,
  churnRiskLabels,
  churnTone,
  crmStatusLabels,
  crmStatusTone,
  formatDate,
  formatNumber,
  formatRubles,
  gameEngagementLabels,
  gameEngagementTone,
  guestsExportHref,
  guestsHref,
  guestsReportHref,
  recommendedActionTone,
  rfmSegmentLabels,
  rfmTone,
  segmentLabels,
  segmentTone,
  sortLabels,
} from "@/lib/guest-insights";
import {
  InsightBadge,
  InsightCard,
  PillLink,
} from "@/components/guest-insight-ui";

const sortChips: GuestListSort[] = [
  "revenue",
  "ltv",
  "churnRisk",
  "rfm",
  "bonusLoad",
  "sessions",
  "lastActivity",
  "registered",
  "level",
  "pendingRewards",
];

export function GuestListTable({
  filters,
  guestList,
  gameAvailable,
}: {
  filters: GuestListFilters;
  guestList: GuestListResponse;
  gameAvailable: boolean;
}) {
  const chips = activeFilterChips(filters);

  return (
    <InsightCard className="mt-6 overflow-hidden">
      <div
        id="guest-list"
        className="flex scroll-mt-6 flex-col gap-3 border-b border-zinc-100 px-5 py-4 dark:border-zinc-800 lg:flex-row lg:items-start lg:justify-between"
      >
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Список гостей
          </p>
          <h2 className="mt-0.5 text-base font-semibold">
            {formatNumber(guestList.totalRows)} гостей · страница{" "}
            {formatNumber(guestList.page)} из {formatNumber(guestList.totalPages)}
          </h2>
          {chips.length > 0 ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {chips.map((chip) => (
                <Link
                  key={chip.key}
                  href={guestsHref({ ...filters, [chip.key]: undefined, page: "1" })}
                  title="Убрать фильтр"
                  className="inline-flex items-center gap-1 rounded-full border border-zinc-300 bg-zinc-50 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                >
                  {chip.label}
                  <span aria-hidden="true">×</span>
                </Link>
              ))}
              <Link
                href={guestsHref({
                  dateFrom: filters.dateFrom,
                  dateTo: filters.dateTo,
                  storeId: filters.storeId,
                  guestGroupId: filters.guestGroupId,
                })}
                className="text-xs font-semibold text-zinc-500 underline underline-offset-2"
              >
                Сбросить
              </Link>
            </div>
          ) : null}
        </div>
        <div className="flex flex-col gap-2 lg:items-end">
          <div className="flex flex-wrap gap-1.5 text-xs font-medium">
            {sortChips
              .filter(
                (sort) =>
                  gameAvailable || (sort !== "level" && sort !== "pendingRewards"),
              )
              .map((sort) => (
                <SortLink key={sort} filters={filters} sort={sort} />
              ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <PillLink href={guestsReportHref(filters)} external>
              Полный отчёт
            </PillLink>
            <PillLink href={guestsExportHref(filters)} external tone="accent">
              CSV
            </PillLink>
          </div>
        </div>
      </div>
      {guestList.rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
            <thead className="bg-zinc-50 text-[11px] uppercase tracking-[0.08em] text-zinc-500 dark:bg-zinc-900/60">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Гость</th>
                <th className="px-4 py-3 text-left font-semibold">Сегмент · RFM</th>
                <th className="px-4 py-3 text-left font-semibold">Риск оттока</th>
                <th className="px-4 py-3 text-right font-semibold">Деньги · LTV</th>
                <th className="px-4 py-3 text-right font-semibold">Бонусы</th>
                {gameAvailable ? (
                  <th className="px-4 py-3 text-left font-semibold">Игра</th>
                ) : null}
                <th className="px-4 py-3 text-left font-semibold">CRM · действие</th>
                <th className="px-4 py-3 text-left font-semibold">Активность</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {guestList.rows.map((row) => (
                <GuestRow key={row.id} row={row} gameAvailable={gameAvailable} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-5 py-6 text-sm text-zinc-500">
          По текущему фильтру гостей не найдено.
        </p>
      )}
      <div className="flex items-center justify-between gap-3 border-t border-zinc-100 px-5 py-4 text-sm dark:border-zinc-800">
        <PaginationLink
          filters={filters}
          page={guestList.page - 1}
          disabled={guestList.page <= 1}
        >
          Назад
        </PaginationLink>
        <span className="text-zinc-500">
          {formatNumber(guestList.page)} / {formatNumber(guestList.totalPages)}
        </span>
        <PaginationLink
          filters={filters}
          page={guestList.page + 1}
          disabled={guestList.page >= guestList.totalPages}
        >
          Вперёд
        </PaginationLink>
      </div>
    </InsightCard>
  );
}

function GuestRow({
  row,
  gameAvailable,
}: {
  row: GuestDashboardRow;
  gameAvailable: boolean;
}) {
  const game = row.gameProfile;

  return (
    <tr className="align-top hover:bg-zinc-50/80 dark:hover:bg-zinc-900/50">
      <td className="px-4 py-3">
        <Link
          href={`/guests/${row.id}`}
          className="font-medium text-zinc-950 hover:text-emerald-700 dark:text-zinc-50 dark:hover:text-emerald-300"
        >
          {row.displayName}
        </Link>
        <p className="mt-1 text-xs text-zinc-500">
          {row.contact} · {row.guestGroupName ?? row.externalDomain ?? "источник"}
        </p>
        {row.primaryStoreName ? (
          <p className="text-xs text-zinc-500">{row.primaryStoreName}</p>
        ) : null}
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          <InsightBadge tone={segmentTone(row.segment)}>
            {segmentLabels[row.segment]}
          </InsightBadge>
          <InsightBadge
            tone={rfmTone(row.rfm.segment)}
            title={`R${row.rfm.recencyScore} F${row.rfm.frequencyScore} M${row.rfm.monetaryScore}`}
          >
            {rfmSegmentLabels[row.rfm.segment]} · {row.rfm.totalScore}/15
          </InsightBadge>
        </div>
      </td>
      <td className="px-4 py-3">
        <InsightBadge tone={churnTone(row.churnRisk.level)} title={row.churnRisk.reason}>
          {churnRiskLabels[row.churnRisk.level]} · {row.churnRisk.score}
        </InsightBadge>
        <p className="mt-1 text-xs text-zinc-500">
          {row.churnRisk.daysSinceActivity === null
            ? "нет активности"
            : `${formatNumber(row.churnRisk.daysSinceActivity)} дн. без визита`}
          {row.churnRisk.valueAtRisk > 0
            ? ` · ${formatRubles(row.churnRisk.valueAtRisk)}`
            : ""}
        </p>
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
        {formatRubles(row.transactionAmount + row.barRevenue)}
        <p className="text-xs text-zinc-500">
          бар {formatRubles(row.barRevenue)}
        </p>
        <p className="text-xs text-zinc-500">
          LTV {formatRubles(row.ltv.totalRevenue)}
        </p>
        <p className="text-xs text-zinc-500">
          {formatNumber(row.sessionsCount)} сесс. · {formatNumber(row.playHours, 1)} ч
        </p>
      </td>
      <td className="px-4 py-3 text-right tabular-nums">
        {row.bonusLoad.currentBalance > 0 ? (
          <>
            {formatRubles(row.bonusLoad.currentBalance)}
            <p
              className={[
                "text-xs",
                row.bonusLoad.status === "RISK"
                  ? "text-rose-600 dark:text-rose-300"
                  : row.bonusLoad.status === "WATCH"
                    ? "text-amber-600 dark:text-amber-300"
                    : "text-zinc-500",
              ].join(" ")}
            >
              {row.bonusLoad.status === "RISK"
                ? "без активности"
                : row.bonusLoad.status === "WATCH"
                  ? "наблюдать"
                  : "активный остаток"}
            </p>
          </>
        ) : (
          <span className="text-xs text-zinc-400">нет</span>
        )}
      </td>
      {gameAvailable ? (
        <td className="px-4 py-3">
          {game ? (
            <>
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-sm font-medium tabular-nums">
                  ур. {game.level}
                </span>
                <InsightBadge tone={gameEngagementTone(game.engagement)}>
                  {gameEngagementLabels[game.engagement]}
                </InsightBadge>
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                {formatNumber(game.xp)} XP
                {game.pendingRewards > 0
                  ? ` · к получению: ${formatNumber(game.pendingRewards)}`
                  : ""}
                {game.rewardsExpiringSoon > 0 ? " · сгорает" : ""}
              </p>
            </>
          ) : (
            <span className="text-xs text-zinc-400">не в игре</span>
          )}
        </td>
      ) : null}
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {row.crmStatus !== "NONE" ? (
            <InsightBadge tone={crmStatusTone(row.crmStatus)}>
              {crmStatusLabels[row.crmStatus]}
            </InsightBadge>
          ) : null}
          <InsightBadge
            tone={recommendedActionTone(row.recommendedAction.key)}
            title={row.recommendedAction.reason}
          >
            {row.recommendedAction.label}
          </InsightBadge>
        </div>
        {row.nextContactAt ? (
          <p className="mt-1 text-xs text-zinc-500">
            контакт {formatDate(row.nextContactAt)}
          </p>
        ) : null}
      </td>
      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
        {formatDate(row.lastActivityAt)}
        <p className="text-xs text-zinc-500">
          рег. {formatDate(row.insertedAt)}
        </p>
      </td>
    </tr>
  );
}

function SortLink({
  filters,
  sort,
}: {
  filters: GuestListFilters;
  sort: GuestListSort;
}) {
  const currentSort = filters.sort ?? "revenue";
  const currentDirection = filters.direction ?? "desc";
  const isActive = currentSort === sort;
  const nextDirection = isActive && currentDirection === "desc" ? "asc" : "desc";

  return (
    <Link
      href={guestsHref({ ...filters, sort, direction: nextDirection, page: "1" })}
      className={[
        "rounded-full border px-2.5 py-1 transition-colors",
        isActive
          ? "border-zinc-950 bg-zinc-950 text-white dark:border-emerald-300 dark:bg-emerald-300 dark:text-zinc-950"
          : "border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900",
      ].join(" ")}
    >
      {sortLabels[sort]}
      {isActive ? (currentDirection === "desc" ? " ↓" : " ↑") : ""}
    </Link>
  );
}

function PaginationLink({
  filters,
  page,
  disabled,
  children,
}: {
  filters: GuestListFilters;
  page: number;
  disabled: boolean;
  children: string;
}) {
  if (disabled) {
    return (
      <span className="rounded-md border border-zinc-200 px-3 py-2 text-zinc-400 dark:border-zinc-800">
        {children}
      </span>
    );
  }

  return (
    <Link
      href={`${guestsHref({ ...filters, page: String(page) })}#guest-list`}
      className="rounded-md border border-zinc-300 px-3 py-2 font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
    >
      {children}
    </Link>
  );
}

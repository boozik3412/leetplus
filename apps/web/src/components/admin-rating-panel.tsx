import Link from "next/link";
import type { ReactNode } from "react";
import { getRoleLabel } from "@/lib/roles";
import {
  ADMIN_RATING_RULE_POINTS,
  adminRatingChips,
  signedPercent,
  signedPoints,
  type AdminRatingAverageCheck,
  type AdminRatingRiskLevel,
  type AdminRatingView,
} from "@/lib/staff-admin-rating";

const riskLabels: Record<AdminRatingRiskLevel, string> = {
  LOW: "Норма",
  MEDIUM: "Внимание",
  HIGH: "Риск",
};

function scoreClass(level: AdminRatingRiskLevel) {
  if (level === "HIGH") {
    return "border-red-200 bg-red-50 text-red-700 dark:border-red-900/70 dark:bg-red-500/10 dark:text-red-200";
  }

  if (level === "MEDIUM") {
    return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-500/10 dark:text-amber-200";
  }

  return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-500/10 dark:text-emerald-200";
}

function formatRubles(value: number) {
  return `${new Intl.NumberFormat("ru-RU").format(Math.round(value))} ₽`;
}

export function AdminRatingPanel({
  rows,
  title = "Рейтинг администраторов",
  description = "Сильные сверху. Откройте строку, чтобы увидеть, из чего сложился балл.",
  emptyText = "Администраторов по выбранным фильтрам нет.",
  renderExtra,
}: {
  rows: AdminRatingView[];
  title?: string;
  description?: string;
  emptyText?: string;
  /** Extra facts for one administrator, shown under the breakdown. */
  renderExtra?: (row: AdminRatingView) => ReactNode;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start">
      <section
        aria-labelledby="admin-rating-title"
        className="min-w-0 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="admin-rating-title" className="text-lg font-semibold">
              {title}
            </h2>
            <p className="mt-1 text-sm text-zinc-500">{description}</p>
          </div>
          <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold uppercase text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
            дисциплина + чек
          </span>
        </div>
        <ol className="mt-4 space-y-3">
          {rows.length > 0 ? (
            rows.map((row, index) => (
              <AdminRatingRow
                key={row.id}
                row={row}
                rank={index + 1}
                extra={renderExtra?.(row)}
              />
            ))
          ) : (
            <li className="rounded-lg border border-dashed border-zinc-300 p-5 text-sm text-zinc-500 dark:border-zinc-700">
              {emptyText}
            </li>
          )}
        </ol>
      </section>
      <AdminRatingRules />
    </div>
  );
}

function AdminRatingRow({
  row,
  rank,
  extra,
}: {
  row: AdminRatingView;
  rank: number;
  extra?: ReactNode;
}) {
  const name = row.user.fullName ?? row.user.email;
  const stores =
    row.user.stores.length > 0
      ? row.user.stores.map((store) => store.name).join(", ")
      : "вся сеть";
  const subtitle = [
    getRoleLabel(row.user.role),
    stores,
    row.shiftsTotal > 0 ? `${row.shiftsTotal} смен в Langame` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const chips = adminRatingChips(row);

  return (
    <li>
      <details className="group rounded-lg border border-zinc-200 transition open:border-emerald-300 dark:border-zinc-800 dark:open:border-emerald-700/70">
        <summary className="grid cursor-pointer list-none grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-emerald-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 dark:hover:bg-emerald-500/10 [&::-webkit-details-marker]:hidden">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-xs font-bold text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
            {rank}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold" title={name}>
              {name}
            </span>
            <span className="block truncate text-xs text-zinc-500" title={subtitle}>
              {subtitle}
            </span>
            <span className="mt-1 flex flex-wrap gap-1.5">
              {chips.map((chip) => (
                <span
                  key={chip.label}
                  className={[
                    "whitespace-nowrap rounded-full border px-2 py-px text-xs tabular-nums",
                    chip.tone === "minus"
                      ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/70 dark:bg-red-500/10 dark:text-red-200"
                      : chip.tone === "plus"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-500/10 dark:text-emerald-200"
                        : "border-zinc-200 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400",
                  ].join(" ")}
                >
                  {chip.label}
                </span>
              ))}
            </span>
          </span>
          <span
            className={[
              "inline-flex h-8 min-w-16 items-center justify-center rounded-full border px-3 text-sm font-bold tabular-nums",
              scoreClass(row.riskLevel),
            ].join(" ")}
            title={riskLabels[row.riskLevel]}
          >
            {row.score}
            <span className="sr-only"> баллов, {riskLabels[row.riskLevel]}</span>
          </span>
        </summary>
        <div className="border-t border-dashed border-zinc-200 px-3 pb-3 pt-2 dark:border-zinc-800">
          <AdminRatingBreakdown row={row} />
          {extra}
        </div>
      </details>
    </li>
  );
}

function AdminRatingBreakdown({ row }: { row: AdminRatingView }) {
  return (
    <div>
      <h3 className="text-sm font-semibold">Из чего сложился балл</h3>
      <div className="mt-1 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <tbody>
            <tr className="border-b border-zinc-200 dark:border-zinc-800">
              <td className="py-1.5 pr-3">Старт периода</td>
              <td className="py-1.5 text-right font-bold tabular-nums">100</td>
            </tr>
            {row.items.map((item, index) => (
              <tr
                key={`${item.kind}-${index}`}
                className="border-b border-zinc-200 align-top dark:border-zinc-800"
              >
                <td className="py-1.5 pr-3">
                  {item.href ? (
                    <Link
                      href={item.href}
                      className="font-medium text-emerald-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 dark:text-emerald-300"
                    >
                      {item.title}
                    </Link>
                  ) : (
                    <span className="font-medium">{item.title}</span>
                  )}
                  {item.detail ? (
                    <span className="block text-xs text-zinc-500">
                      {item.detail}
                    </span>
                  ) : null}
                </td>
                <td
                  className={[
                    "whitespace-nowrap py-1.5 text-right font-bold tabular-nums",
                    item.points < 0
                      ? "text-red-700 dark:text-red-300"
                      : "text-emerald-700 dark:text-emerald-300",
                  ].join(" ")}
                >
                  {signedPoints(item.points)}
                </td>
              </tr>
            ))}
            <tr>
              <td className="pt-2 pr-3 font-semibold">Рейтинг</td>
              <td className="pt-2 text-right text-base font-bold tabular-nums">
                {row.score}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      {row.linkedToLangame ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <AverageCheckBox check={row.averageCheck.day} />
          <AverageCheckBox check={row.averageCheck.night} />
        </div>
      ) : (
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/70 dark:bg-amber-500/10 dark:text-amber-200">
          Средний чек не учитывается: карточка сотрудника не связана с
          администратором Langame.{" "}
          <Link
            href="/staff/directory"
            className="font-semibold underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            Связать в «Сотрудниках»
          </Link>
        </p>
      )}
    </div>
  );
}

function AverageCheckBox({ check }: { check: AdminRatingAverageCheck }) {
  const label = check.shiftKind === "DAY" ? "Днём" : "Ночью";

  if (check.shifts === 0 || check.average === null) {
    return (
      <div className="rounded-md border border-zinc-200 bg-zinc-50 p-2.5 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/60">
        {label}: смен за период нет
      </div>
    );
  }

  const note =
    check.clubAverage === null || check.deltaPercent === null
      ? "нет данных по клубу для сравнения"
      : check.shifts < ADMIN_RATING_RULE_POINTS.averageCheckMinShifts
        ? `${signedPercent(check.deltaPercent)} к клубу · одна смена, не влияет`
        : `${signedPercent(check.deltaPercent)} к клубу → ${signedPoints(check.points)}`;

  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-2.5 dark:border-zinc-800 dark:bg-zinc-900/60">
      <p className="text-xs text-zinc-500">
        {label} · {check.shifts} смен
      </p>
      <p className="mt-0.5 tabular-nums">
        <span className="text-lg font-semibold">
          {formatRubles(check.average)}
        </span>
        {check.clubAverage !== null ? (
          <span className="text-xs text-zinc-500">
            {" "}
            клуб {formatRubles(check.clubAverage)}
          </span>
        ) : null}
      </p>
      <p className="text-xs text-zinc-500 tabular-nums">{note}</p>
    </div>
  );
}

function AdminRatingRules() {
  const rules = ADMIN_RATING_RULE_POINTS;

  return (
    <aside
      aria-labelledby="admin-rating-rules-title"
      className="min-w-0 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
    >
      <h2 id="admin-rating-rules-title" className="text-lg font-semibold">
        Как считается
      </h2>
      <p className="mt-1 text-sm text-zinc-500">
        Старт 100 баллов, итог от 0 до 100.
      </p>
      <ol className="mt-3 list-decimal space-y-3 pl-5 text-sm">
        <li>
          <span className="font-semibold">
            Эскалированный чек-лист −{rules.escalatedChecklist}
          </span>
          <span className="block text-zinc-500">
            За каждый чек-лист, который проверяющий передал руководителю. Минус
            остаётся, даже если чек-лист потом приняли.
          </span>
        </li>
        <li>
          <span className="font-semibold">
            Штраф −{rules.fine}, предупреждение −{rules.warning}
          </span>
          <span className="block text-zinc-500">
            Действующие записи из «Мотивации персонала» за период. Сумма штрафа
            на балл не влияет, отменённые записи не считаются.
          </span>
        </li>
        <li>
          <span className="font-semibold">Средний чек ±</span>
          <span className="block text-zinc-500">
            Средний чек администратора по его сменам в Langame сравнивается со
            средним чеком клуба в такие же смены: дневные с дневными, ночные с
            ночными. За каждые полные {rules.averageCheckStepPercent}% разницы
            ±1 балл, не больше ±{rules.averageCheckMaxPoints} днём и ±
            {rules.averageCheckMaxPoints} ночью. Нужно хотя бы{" "}
            {rules.averageCheckMinShifts} смены одного вида.
          </span>
        </li>
        <li>
          <span className="font-semibold">
            Просроченная задача −{rules.overdueTask}
          </span>
          <span className="block text-zinc-500">
            За каждую задачу со сроком в периоде, которую не закрыли вовремя:
            сделана позже срока или всё ещё открыта.
          </span>
        </li>
      </ol>
      <p className="mt-4 border-t border-zinc-200 pt-3 text-xs text-zinc-500 dark:border-zinc-800">
        Дневная смена началась в Langame с 8:00 до 19:59 по времени клуба,
        остальные ночные. Смены берутся по связке сотрудника с Langame. При
        равных баллах выше тот, у кого лучше средний чек.
      </p>
    </aside>
  );
}

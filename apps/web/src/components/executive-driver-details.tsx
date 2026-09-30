import Link from "next/link";
import type {
  ExecutiveDriverFactors,
  ExecutiveDriverRow,
  ExecutiveSummary,
} from "@/lib/dashboard-executive";
import {
  driverDetailHref,
  driverFocuses,
  type DriverFocus,
} from "@/lib/executive-links";
import {
  formatClubs,
  formatDay,
  formatMoney,
  formatNumber,
  formatRange,
  formatSigned,
  formatWeekdayDay,
  isWeekend,
} from "@/lib/executive-format";

type Column = {
  focus: DriverFocus;
  label: string;
  value: (factors: ExecutiveDriverFactors) => number | null;
  format: (value: number) => string;
  /** Percent values change in points, others in percent. */
  points?: boolean;
};

const columns: Column[] = [
  {
    focus: "visits",
    label: "Визиты",
    value: (factors) => factors.visits,
    format: (value) => formatNumber(value),
  },
  {
    focus: "purchases",
    label: "Покупок в баре",
    value: (factors) => factors.purchases,
    format: (value) => formatNumber(value),
  },
  {
    focus: "conversion",
    label: "Покупок на визит",
    value: (factors) => factors.purchasesPerVisit,
    format: (value) => `${formatNumber(value, 1)}%`,
    points: true,
  },
  {
    focus: "check",
    label: "Средний чек",
    value: (factors) => factors.averagePurchase,
    format: (value) => formatMoney(value),
  },
  {
    focus: "bar",
    label: "Бар по покупкам",
    value: (factors) => factors.barRevenue,
    format: (value) => formatMoney(value),
  },
  {
    focus: "load",
    label: "Загрузка",
    value: (factors) => factors.loadEstimate,
    format: (value) => `${formatNumber(value, 1)}%`,
    points: true,
  },
];

const focusTitle: Record<DriverFocus, string> = {
  visits: "Визиты — трафик",
  conversion: "Покупок на визит — конверсия бара",
  purchases: "Покупки в баре",
  check: "Средний чек бара",
  bar: "Бар по покупкам",
  load: "Загрузка клубов — оценка",
};

const focusHint: Record<DriverFocus, string> = {
  visits:
    "Сколько игровых сессий начали гости. Больше визитов — больше поводов продать бар.",
  conversion:
    "Доля визитов, в которых гость что-то купил в баре. Растёт, когда администратор предлагает напиток или снек при посадке и продлении, а ходовые позиции есть в наличии.",
  purchases:
    "Число покупок: продажи одному гостю в одну минуту считаются одной покупкой.",
  check:
    "Сколько гость тратит за одну покупку. Растёт от допродаж, наборов и наличия дорогих ходовых позиций.",
  bar: "Выручка бара с гостем — та, что вошла в разложение на множители.",
  load: "Сыгранные часы / (текущее число ПК × 24 ч × дни). Ориентир — около 30% за месяц.",
};

function column(focus: DriverFocus) {
  return columns.find((item) => item.focus === focus)!;
}

function change(
  item: Column,
  current: ExecutiveDriverFactors,
  previous: ExecutiveDriverFactors | null | undefined,
) {
  const now = item.value(current);
  const before = previous ? item.value(previous) : null;
  if (now === null || before === null) return null;
  const delta = item.points ? now - before : before === 0 ? null : ((now - before) / before) * 100;
  if (delta === null) return null;
  return {
    text: item.points
      ? `${formatSigned(delta, 1)} п.п.`
      : formatSigned(delta, 1, "%"),
    tone:
      Math.abs(delta) < 1e-9
        ? "text-zinc-500 dark:text-zinc-400"
        : delta > 0
          ? "text-emerald-700 dark:text-emerald-300"
          : "text-red-700 dark:text-red-300",
    before: item.format(before),
  };
}

function Cells({
  focus,
  current,
  previous,
}: {
  focus: DriverFocus;
  current: ExecutiveDriverFactors;
  previous: ExecutiveDriverFactors | null | undefined;
}) {
  return (
    <>
      {columns.map((item) => {
        const value = item.value(current);
        const delta = item.focus === focus ? change(item, current, previous) : null;
        return (
          <td
            key={item.focus}
            className={`py-2.5 pl-3 text-right tabular-nums ${item.focus === focus ? "bg-emerald-500/5 font-semibold" : "text-zinc-600 dark:text-zinc-300"}`}
          >
            <span className="block">{value === null ? "—" : item.format(value)}</span>
            {delta ? (
              <span className={`block text-[11px] font-normal ${delta.tone}`}>
                {delta.text}
              </span>
            ) : null}
          </td>
        );
      })}
    </>
  );
}

function Head({ focus, first }: { focus: DriverFocus; first: string }) {
  return (
    <thead className="text-xs text-zinc-500 dark:text-zinc-400">
      <tr>
        <th className="pb-2 pr-3">{first}</th>
        {columns.map((item) => (
          <th
            key={item.focus}
            className={`pb-2 pl-3 text-right ${item.focus === focus ? "text-emerald-700 dark:text-emerald-300" : ""}`}
          >
            {item.label}
          </th>
        ))}
      </tr>
    </thead>
  );
}

function rowLabel(row: ExecutiveDriverRow) {
  return row.scope === "NETWORK"
    ? "Вся выборка"
    : row.scope === "DOMAIN"
      ? `${row.storeName} (общий домен)`
      : row.storeName;
}

/** Revenue-tree drill-down: every factor by club and by day, one in focus. */
export function ExecutiveDriverDetails({
  summary,
  focus,
}: {
  summary: ExecutiveSummary;
  focus: DriverFocus;
}) {
  const drivers = summary.drivers;
  if (!drivers)
    return (
      <p className="mt-5 text-sm text-zinc-600 dark:text-zinc-300">
        Дерево выручки для этой выборки не рассчитано.
      </p>
    );
  const clubs = drivers.rows.filter((row) => row.scope === "CLUB");
  const scopeRow =
    clubs.length === 1
      ? clubs[0]
      : drivers.rows.find((row) => row.scope === "NETWORK");
  const rows = drivers.rows.filter(
    (row) => row.scope !== "NETWORK" || clubs.length > 1,
  );
  const focused = column(focus);
  const headline = scopeRow ? focused.value(scopeRow.current) : null;
  const headlineChange = scopeRow
    ? change(focused, scopeRow.current, scopeRow.previous)
    : null;
  const against = summary.scope.comparison
    ? formatRange(summary.scope.comparison.from, summary.scope.comparison.to)
    : null;
  const notes = [
    ...new Set(drivers.rows.flatMap((row) => row.notes)),
  ];
  return (
    <>
      <header className="mt-5 rounded-2xl border border-[var(--border-soft)] bg-[var(--surface)] p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300">
          Дерево выручки · {scopeRow && clubs.length === 1 ? scopeRow.storeName : "выборка"}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          {focusTitle[focus]}
        </h1>
        <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
          {formatRange(summary.scope.period.from, summary.scope.period.to)}
          {against ? ` · к ${against}` : " · без сравнения"} ·{" "}
          {formatClubs(summary.scope.storeIds.length)}
        </p>
        <p className="mt-4 flex flex-wrap items-baseline gap-x-3 text-4xl font-semibold tracking-tight tabular-nums">
          {headline === null ? "—" : focused.format(headline)}
          {headlineChange ? (
            <span className={`text-base font-semibold ${headlineChange.tone}`}>
              {headlineChange.text} · было {headlineChange.before}
            </span>
          ) : null}
        </p>
        <p className="mt-3 rounded-xl bg-[var(--surface-muted)] px-3 py-2 text-sm leading-6 text-zinc-700 dark:text-zinc-200">
          {focusHint[focus]}
        </p>
        <nav
          aria-label="Показатель"
          className="mt-4 flex flex-wrap gap-2 text-sm"
        >
          {driverFocuses.map((item) => (
            <Link
              key={item}
              href={driverDetailHref(summary, item)}
              prefetch={false}
              aria-current={item === focus ? "page" : undefined}
              className={`rounded-full px-3 py-1.5 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${item === focus ? "bg-emerald-600 text-white" : "bg-[var(--surface-muted)] text-zinc-700 hover:bg-zinc-200 dark:text-zinc-200 dark:hover:bg-zinc-800"}`}
            >
              {column(item).label}
            </Link>
          ))}
        </nav>
      </header>

      {rows.length ? (
        <section className="mt-5 rounded-2xl border border-[var(--border-soft)] bg-[var(--surface)] p-5 shadow-sm">
          <h2 className="text-lg font-semibold">По клубам</h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Нажмите на клуб — откроется его разбивка по дням.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <Head focus={focus} first="Клуб" />
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={`${row.scope}:${row.storeIds.join("+")}`}
                    className="border-t border-[var(--border-soft)]"
                  >
                    <td className="py-2.5 pr-3 font-medium">
                      {row.scope === "CLUB" && row.storeId && clubs.length > 1 ? (
                        <Link
                          href={driverDetailHref(summary, focus, [row.storeId])}
                          prefetch={false}
                          className="text-emerald-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-emerald-300"
                        >
                          {rowLabel(row)} →
                        </Link>
                      ) : (
                        rowLabel(row)
                      )}
                    </td>
                    <Cells
                      focus={focus}
                      current={row.current}
                      previous={row.previous}
                    />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {drivers.days.length ? (
        <section className="mt-5 rounded-2xl border border-[var(--border-soft)] bg-[var(--surface)] p-5 shadow-sm">
          <h2 className="text-lg font-semibold">
            По дням{clubs.length === 1 ? ` · ${clubs[0].storeName}` : " · вся выборка"}
          </h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Изменение — к соответствующему дню прошлого периода. Дни — по местному
            времени клуба.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <Head focus={focus} first="День" />
              <tbody>
                {drivers.days.map((day) => (
                  <tr
                    key={day.date}
                    className="border-t border-[var(--border-soft)]"
                  >
                    <td
                      className={`py-2.5 pr-3 font-medium ${isWeekend(day.date) ? "text-amber-700 dark:text-amber-300" : ""}`}
                    >
                      {formatWeekdayDay(day.date)}{" "}
                      <span className="text-xs font-normal text-zinc-500 dark:text-zinc-400">
                        {formatDay(day.date)}
                      </span>
                    </td>
                    <Cells
                      focus={focus}
                      current={day.current}
                      previous={day.previous}
                    />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="mt-5 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
        {notes.map((note) => (
          <p key={note}>{note}</p>
        ))}
        <p className="mt-2">{drivers.definitions.purchase}</p>
        <p>{drivers.definitions.visits}</p>
        <p>{drivers.definitions.load}</p>
      </section>
    </>
  );
}

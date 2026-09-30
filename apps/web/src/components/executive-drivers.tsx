"use client";

import Link from "next/link";
import type {
  ExecutiveDriverFactor,
  ExecutiveDriverFactors,
  ExecutiveDriverRow,
  ExecutiveSummary,
} from "@/lib/dashboard-executive";
import {
  conversionGaps,
  leverLabels,
  mainLever,
  silentClubs,
} from "@/lib/executive-driver-rules";
import {
  formatDay,
  formatMoney,
  formatNumber,
  formatRange,
  formatSigned,
  periodDays,
} from "@/lib/executive-format";
import { clubDetailHref } from "@/lib/executive-links";

type Tone = "up" | "down" | "flat";

const factorTitle: Record<ExecutiveDriverFactor, string> = {
  VISITS: "Трафик",
  CONVERSION: "Конверсия",
  PURCHASES: "Покупки",
  CHECK: "Чек",
};
const factorCaption: Record<ExecutiveDriverFactor, string> = {
  VISITS: "Визиты",
  CONVERSION: "Покупок на визит",
  PURCHASES: "Покупок в баре",
  CHECK: "Средний чек бара",
};
const factorColor: Record<ExecutiveDriverFactor, string> = {
  VISITS: "bg-sky-500 dark:bg-sky-400",
  PURCHASES: "bg-sky-500 dark:bg-sky-400",
  CONVERSION: "bg-amber-500 dark:bg-amber-400",
  CHECK: "bg-violet-500 dark:bg-violet-400",
};
const factorText: Record<ExecutiveDriverFactor, string> = {
  VISITS: "text-sky-700 dark:text-sky-300",
  PURCHASES: "text-sky-700 dark:text-sky-300",
  CONVERSION: "text-amber-700 dark:text-amber-300",
  CHECK: "text-violet-700 dark:text-violet-300",
};
const toneText: Record<Tone, string> = {
  up: "text-emerald-700 dark:text-emerald-300",
  down: "text-red-700 dark:text-red-300",
  flat: "text-zinc-500 dark:text-zinc-400",
};
const lossExplanation: Record<ExecutiveDriverFactor, string> = {
  VISITS: "гостей стало меньше",
  CONVERSION: "гости стали реже покупать в баре",
  PURCHASES: "покупок в баре стало меньше",
  CHECK: "покупки стали мельче",
};

function tone(delta: number | null): Tone {
  if (delta === null || Math.abs(delta) < 1e-9) return "flat";
  return delta > 0 ? "up" : "down";
}

function arrow(value: Tone) {
  return value === "up" ? "▲ " : value === "down" ? "▼ " : "";
}

function thousands(value: number) {
  return Math.abs(value) >= 1000
    ? `${formatSigned(value / 1000, 1)} тыс.`
    : `${formatSigned(value)} ₽`;
}

function factorValue(factor: ExecutiveDriverFactor, row: ExecutiveDriverFactors) {
  switch (factor) {
    case "VISITS":
      return row.visits;
    case "CONVERSION":
      return row.purchasesPerVisit;
    case "PURCHASES":
      return row.purchases;
    case "CHECK":
      return row.averagePurchase;
  }
}

function formatFactor(factor: ExecutiveDriverFactor, value: number | null) {
  if (value === null) return "—";
  if (factor === "CONVERSION") return `${formatNumber(value, 1)}%`;
  if (factor === "CHECK") return formatMoney(value);
  return formatNumber(value);
}

/** «▲ +0,4% · было 4 209» — points for conversion, percent otherwise. */
function factorChange(
  factor: ExecutiveDriverFactor,
  current: number | null,
  previous: number | null | undefined,
) {
  if (current === null || previous === null || previous === undefined)
    return null;
  if (factor === "CONVERSION") {
    const points = current - previous;
    return {
      tone: tone(points),
      text: `${formatSigned(points, 1)} п.п.`,
      before: `было ${formatFactor(factor, previous)}`,
    };
  }
  if (previous === 0) return null;
  const percent = ((current - previous) / previous) * 100;
  return {
    tone: tone(percent),
    text: `${formatSigned(percent, 1, "%")}`,
    before: `было ${formatFactor(factor, previous)}`,
  };
}

function factorsOf(row: ExecutiveDriverRow): ExecutiveDriverFactor[] {
  const split = row.contributions?.map((item) => item.factor);
  if (split?.length) return split;
  return row.current.visits !== null
    ? ["VISITS", "CONVERSION", "CHECK"]
    : ["PURCHASES", "CHECK"];
}

export function DriverDataStrip({ summary }: { summary: ExecutiveSummary }) {
  const coverage = summary.metrics.productRevenue?.coverage;
  const complete =
    coverage && coverage.total !== null && coverage.covered === coverage.total;
  const unbound = (summary.drivers?.rows ?? []).filter(
    (row) => row.scope === "CLUB" && row.current.visits === null,
  );
  const silent = silentClubs(summary);
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] px-4 py-2.5 text-xs text-zinc-600 dark:text-zinc-300">
      {coverage && coverage.total !== null ? (
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden="true"
            className={`h-2 w-2 rounded-full ${complete ? "bg-emerald-500" : "bg-amber-500"}`}
          />
          Продажи: {coverage.covered} из {coverage.total} клубо-дней
        </span>
      ) : null}
      {silent.length ? (
        <span className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-amber-500" />
          Без продаж:{" "}
          {silent
            .map((club) => `${club.storeName} с ${formatDay(club.since)}`)
            .join(", ")}
        </span>
      ) : null}
      {unbound.length ? (
        <span className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-zinc-400" />
          Визиты не разнесены по клубам:{" "}
          {unbound.map((row) => row.storeName).join(", ")}
        </span>
      ) : null}
      {summary.drivers ? (
        <span className="text-zinc-500 dark:text-zinc-400 lg:ml-auto">
          Покупка — продажи одному гостю в одну минуту
        </span>
      ) : null}
    </div>
  );
}

function ContributionRows({ row }: { row: ExecutiveDriverRow }) {
  const items = row.contributions ?? [];
  const max = Math.max(1, ...items.map((item) => Math.abs(item.amount)));
  return (
    <ul className="grid gap-2.5" aria-label="Вклад множителей в изменение, ₽">
      {items.map((item) => {
        const width = `${Math.max(2, (Math.abs(item.amount) / max) * 100)}%`;
        const negative = item.amount < 0;
        return (
          <li
            key={item.factor}
            className="grid grid-cols-[7.5rem_minmax(0,1fr)_minmax(0,1fr)_6.5rem] items-center gap-3 text-sm"
          >
            <span className="text-zinc-700 dark:text-zinc-200">
              {factorTitle[item.factor]}
            </span>
            <span className="flex h-3.5 justify-end">
              {negative ? (
                <span
                  className="h-3.5 rounded-l-full bg-red-500/85 dark:bg-red-400/85"
                  style={{ width }}
                />
              ) : null}
            </span>
            <span className="flex h-3.5 border-l border-zinc-300 dark:border-zinc-700">
              {!negative ? (
                <span
                  className="h-3.5 rounded-r-full bg-emerald-500/85 dark:bg-emerald-400/85"
                  style={{ width }}
                />
              ) : null}
            </span>
            <span
              className={`text-right font-semibold tabular-nums ${negative ? toneText.down : item.amount > 0 ? toneText.up : toneText.flat}`}
            >
              {formatSigned(item.amount)} ₽
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function DriverTree({ summary }: { summary: ExecutiveSummary }) {
  const network = summary.drivers?.rows.find((row) => row.scope === "NETWORK");
  if (!network) return null;
  const lever = mainLever(network);
  const factors = factorsOf(network);
  const against = summary.scope.comparison
    ? formatRange(summary.scope.comparison.from, summary.scope.comparison.to)
    : null;
  const silent = silentClubs(summary);
  const resultChange = factorChangeMoney(
    network.current.barRevenue,
    network.previous?.barRevenue,
  );
  return (
    <section
      aria-labelledby="driver-tree-title"
      className="flex flex-col gap-5 rounded-2xl border border-[var(--border-soft)] bg-[var(--surface)] p-5 shadow-sm sm:p-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2
            id="driver-tree-title"
            className="text-lg font-semibold text-[var(--foreground)]"
          >
            Дерево выручки
          </h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            Почему изменился бар:{" "}
            {factors.map((factor) => factorTitle[factor].toLowerCase()).join(" × ")}
          </p>
        </div>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          Сеть{against ? ` · к ${against}` : ""}
        </span>
      </div>
      <div className="grid gap-2 md:grid-cols-[repeat(var(--tiles),minmax(0,1fr))_auto_minmax(0,1.15fr)] md:items-stretch" style={{ ["--tiles" as string]: String(factors.length) }}>
        {factors.map((factor) => {
          const change = factorChange(
            factor,
            factorValue(factor, network.current),
            network.previous ? factorValue(factor, network.previous) : null,
          );
          const isLever = lever?.kind === "LOSS" && lever.factor === factor;
          return (
            <div
              key={factor}
              className={`flex flex-col gap-1.5 rounded-2xl p-4 ${isLever ? "border-2 border-red-500 bg-red-500/5 dark:border-red-400" : "border border-[var(--border-soft)]"}`}
            >
              <span
                className={`text-[11px] font-semibold uppercase tracking-[0.08em] ${isLever ? toneText.down : factorText[factor]}`}
              >
                {factorTitle[factor]}
                {isLever ? " · главный рычаг" : ""}
              </span>
              <span className="text-sm text-zinc-600 dark:text-zinc-300">
                {factorCaption[factor]}
              </span>
              <span className="text-2xl font-bold tabular-nums text-[var(--foreground)]">
                {formatFactor(factor, factorValue(factor, network.current))}
              </span>
              {change ? (
                <span className={`text-xs tabular-nums ${toneText[change.tone]}`}>
                  {arrow(change.tone)}
                  {change.text} · {change.before}
                </span>
              ) : (
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  без сравнения
                </span>
              )}
            </div>
          );
        })}
        <div
          aria-hidden="true"
          className="hidden items-center justify-center text-2xl text-zinc-400 md:flex"
        >
          =
        </div>
        <div className="flex flex-col gap-1.5 rounded-2xl bg-[var(--surface-muted)] p-4">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
            Результат
          </span>
          <span className="text-sm text-zinc-600 dark:text-zinc-300">
            Бар по покупкам
          </span>
          <span className="text-2xl font-bold tabular-nums text-[var(--foreground)]">
            {network.current.barRevenue === null
              ? "—"
              : formatMoney(network.current.barRevenue)}
          </span>
          {resultChange ? (
            <span className={`text-xs tabular-nums ${toneText[resultChange.tone]}`}>
              {arrow(resultChange.tone)}
              {resultChange.text}
            </span>
          ) : null}
        </div>
      </div>
      {network.contributions?.length ? (
        <div className="flex flex-col gap-3">
          <span className="text-sm text-zinc-600 dark:text-zinc-300">
            Вклад каждого множителя в изменение, ₽
          </span>
          <ContributionRows row={network} />
          {lever ? (
            <p
              className={`rounded-xl px-4 py-3 text-sm leading-6 ${lever.kind === "LOSS" ? "bg-red-500/10 text-red-900 dark:text-red-100" : "bg-emerald-500/10 text-emerald-900 dark:text-emerald-100"}`}
            >
              {lever.kind === "LOSS"
                ? `Главный рычаг — ${leverLabels[lever.factor]}: ${lossExplanation[lever.factor]} (${formatSigned(lever.amount)} ₽).`
                : `Рост за счёт множителя «${leverLabels[lever.factor]}» (${formatSigned(lever.amount)} ₽).`}
              {silent.length && lever.kind === "LOSS"
                ? ` Часть падения — клубы без продаж: ${silent.map((club) => club.storeName).join(", ")}.`
                : ""}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {summary.scope.comparison
            ? "Нет сопоставимого прошлого периода для разложения."
            : "Сравнение выключено — вклад множителей не считается."}
        </p>
      )}
      {network.notes.length ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {network.notes.join(" ")}
        </p>
      ) : null}
    </section>
  );
}

function factorChangeMoney(
  current: number | null,
  previous: number | null | undefined,
) {
  if (current === null || !previous) return null;
  const delta = current - previous;
  return {
    tone: tone(delta),
    text: `${formatSigned((delta / previous) * 100, 1, "%")} · ${formatSigned(delta)} ₽`,
  };
}

function ClubCard({
  summary,
  row,
  silentSince,
  gap,
}: {
  summary: ExecutiveSummary;
  row: ExecutiveDriverRow;
  silentSince: string | null;
  gap: ReturnType<typeof conversionGaps>[number] | undefined;
}) {
  const club = summary.clubs.find((item) => item.storeId === row.storeId);
  const revenue = club?.metrics.productRevenue;
  const change = factorChangeMoney(
    revenue?.value ?? null,
    revenue?.comparison?.previousValue,
  );
  const lever = mainLever(row);
  const days = periodDays(summary.scope.period.from, summary.scope.period.to);
  const pcs =
    row.current.capacityHours && days
      ? Math.round(row.current.capacityHours / (24 * days))
      : null;
  const contributions = row.contributions ?? [];
  const totalShare = contributions.reduce(
    (sum, item) => sum + Math.abs(item.amount),
    0,
  );
  const lines: Array<[string, string, ReturnType<typeof factorChange>]> =
    row.current.visits !== null
      ? (["VISITS", "CONVERSION", "CHECK"] as const).map((factor) => [
          factorCaption[factor],
          formatFactor(factor, factorValue(factor, row.current)),
          factorChange(
            factor,
            factorValue(factor, row.current),
            row.previous ? factorValue(factor, row.previous) : null,
          ),
        ])
      : [
          ["Визиты", "не привязаны", null],
          ...(["PURCHASES", "CHECK"] as const).map(
            (factor): [string, string, ReturnType<typeof factorChange>] => [
              factorCaption[factor],
              formatFactor(factor, factorValue(factor, row.current)),
              factorChange(
                factor,
                factorValue(factor, row.current),
                row.previous ? factorValue(factor, row.previous) : null,
              ),
            ],
          ),
        ];
  const badge = silentSince
    ? {
        className: "bg-[var(--surface-muted)] text-zinc-600 dark:text-zinc-300",
        text: `Нет продаж с ${formatDay(silentSince)} — клуб закрыт или данные не приходят`,
      }
    : gap
      ? {
          className: "bg-amber-500/10 text-amber-900 dark:text-amber-100",
          text: `Резерв — конверсия: ${formatNumber(gap.value, 1)}% против ${formatNumber(gap.best, 1)}% у лучшего клуба`,
        }
      : lever?.kind === "LOSS"
        ? {
            className: "bg-red-500/10 text-red-900 dark:text-red-100",
            text: `Рычаг — ${leverLabels[lever.factor]}: ${lossExplanation[lever.factor]}`,
          }
        : lever?.kind === "GAIN"
          ? {
              className: "bg-emerald-500/10 text-emerald-900 dark:text-emerald-100",
              text: `Рост за счёт множителя «${leverLabels[lever.factor]}»`,
            }
          : null;
  return (
    <Link
      href={clubDetailHref(summary, "productRevenue", [row.storeId ?? ""])}
      prefetch={false}
      className={`flex min-w-0 flex-col gap-3.5 rounded-2xl p-4 transition hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${silentSince ? "border border-dashed border-zinc-300 bg-[var(--surface)] opacity-90 dark:border-zinc-700" : "border border-[var(--border-soft)] bg-[var(--surface)] shadow-sm"}`}
    >
      <span className="flex items-baseline justify-between gap-2">
        <strong className="truncate text-sm text-[var(--foreground)]">
          {row.storeName}
        </strong>
        {pcs ? (
          <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
            {pcs} ПК
          </span>
        ) : null}
      </span>
      <span className="flex flex-wrap items-baseline gap-x-2.5">
        <span className="text-2xl font-bold tabular-nums text-[var(--foreground)]">
          {revenue?.value === null || revenue?.value === undefined
            ? "—"
            : formatMoney(revenue.value)}
        </span>
        {change ? (
          <span
            className={`text-sm font-semibold tabular-nums ${silentSince ? toneText.flat : toneText[change.tone]}`}
          >
            {arrow(change.tone)}
            {change.text.split(" · ")[0]}
          </span>
        ) : null}
      </span>
      <span className="grid gap-1.5 text-sm">
        {lines.map(([label, value, delta]) => (
          <span key={label} className="flex justify-between gap-2">
            <span className="text-zinc-500 dark:text-zinc-400">{label}</span>
            <span className="tabular-nums text-[var(--foreground)]">
              {value}{" "}
              {delta ? (
                <span className={toneText[delta.tone]}>{delta.text}</span>
              ) : null}
            </span>
          </span>
        ))}
      </span>
      {contributions.length && totalShare > 0 && !silentSince ? (
        <span className="grid gap-1.5">
          <span
            aria-hidden="true"
            className="flex h-2.5 overflow-hidden rounded-full bg-[var(--surface-muted)]"
          >
            {contributions.map((item) => (
              <span
                key={item.factor}
                className={
                  item.amount < 0
                    ? "bg-red-500 dark:bg-red-400"
                    : factorColor[item.factor]
                }
                style={{ width: `${(Math.abs(item.amount) / totalShare) * 100}%` }}
              />
            ))}
          </span>
          <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
            {contributions
              .filter((item) => Math.abs(item.amount) / totalShare >= 0.08)
              .map((item) => (
                <span key={item.factor}>
                  <span
                    aria-hidden="true"
                    className={
                      item.amount < 0
                        ? "text-red-600 dark:text-red-400"
                        : factorText[item.factor]
                    }
                  >
                    ■{" "}
                  </span>
                  {leverLabels[item.factor]} {thousands(item.amount)}
                </span>
              ))}
          </span>
        </span>
      ) : null}
      {badge ? (
        <span
          className={`mt-auto rounded-xl px-3 py-2 text-xs leading-5 ${badge.className}`}
        >
          {badge.text}
        </span>
      ) : null}
    </Link>
  );
}

export function ClubLeverCards({ summary }: { summary: ExecutiveSummary }) {
  const rows = (summary.drivers?.rows ?? []).filter(
    (row) => row.scope === "CLUB",
  );
  if (!rows.length) return null;
  const silent = new Map(
    silentClubs(summary).map((club) => [club.storeId, club.since]),
  );
  const gaps = new Map(
    conversionGaps(summary.drivers).map((gap) => [gap.storeId, gap]),
  );
  const rank = (row: ExecutiveDriverRow) => {
    if (row.storeId && silent.has(row.storeId)) return 3;
    const lever = mainLever(row);
    if ((row.storeId && gaps.has(row.storeId)) || lever?.kind === "LOSS")
      return 0;
    return lever?.kind === "GAIN" ? 1 : 2;
  };
  const ordered = rows.toSorted(
    (left, right) =>
      rank(left) - rank(right) ||
      (right.current.barRevenue ?? 0) - (left.current.barRevenue ?? 0),
  );
  return (
    <section aria-labelledby="club-levers-title" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2
          id="club-levers-title"
          className="text-lg font-semibold text-[var(--foreground)]"
        >
          Клубы · главный рычаг
        </h2>
        <span className="text-sm text-zinc-600 dark:text-zinc-300">
          Сначала те, где есть что исправить
        </span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {ordered.map((row) => (
          <ClubCard
            key={row.storeId ?? row.storeName}
            summary={summary}
            row={row}
            silentSince={row.storeId ? (silent.get(row.storeId) ?? null) : null}
            gap={row.storeId ? gaps.get(row.storeId) : undefined}
          />
        ))}
      </div>
    </section>
  );
}

function Ring({ value, good }: { value: number; good: boolean }) {
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const filled = Math.min(100, Math.max(0, value)) / 100;
  return (
    <svg width="88" height="88" viewBox="0 0 96 96" aria-hidden="true">
      <circle
        cx="48"
        cy="48"
        r={radius}
        fill="none"
        strokeWidth="10"
        className="stroke-[var(--surface-muted)]"
      />
      <circle
        cx="48"
        cy="48"
        r={radius}
        fill="none"
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={`${(filled * circumference).toFixed(1)} ${circumference.toFixed(1)}`}
        transform="rotate(-90 48 48)"
        className={good ? "stroke-emerald-500 dark:stroke-emerald-400" : "stroke-amber-500 dark:stroke-amber-400"}
      />
      <text
        x="48"
        y="54"
        textAnchor="middle"
        className="fill-[var(--foreground)] text-[18px] font-bold"
      >
        {`${formatNumber(value, 0)}%`}
      </text>
    </svg>
  );
}

/** Industry reference: an average club month is around 30% (see docs). */
const LOAD_REFERENCE = 30;

export function LoadPanel({ summary }: { summary: ExecutiveSummary }) {
  const drivers = summary.drivers;
  if (!drivers) return null;
  const network = drivers.rows.find((row) => row.scope === "NETWORK");
  const rings = drivers.rows.filter(
    (row) =>
      (row.scope === "CLUB" || row.scope === "DOMAIN") &&
      row.current.loadEstimate !== null,
  );
  const stat = (
    label: string,
    current: number | null | undefined,
    previous: number | null | undefined,
    digits = 0,
  ) => {
    const change =
      current !== null &&
      current !== undefined &&
      previous !== null &&
      previous !== undefined &&
      previous !== 0
        ? ((current - previous) / previous) * 100
        : null;
    return (
      <span className="flex justify-between gap-2">
        <span className="text-zinc-500 dark:text-zinc-400">{label}</span>
        <span className="tabular-nums text-[var(--foreground)]">
          {current === null || current === undefined
            ? "—"
            : formatNumber(current, digits)}{" "}
          {change !== null ? (
            <span className={toneText[tone(change)]}>
              {formatSigned(change, 1, "%")}
            </span>
          ) : null}
        </span>
      </span>
    );
  };
  return (
    <section
      aria-labelledby="load-title"
      className="flex flex-col gap-4 rounded-2xl border border-[var(--border-soft)] bg-[var(--surface)] p-5 shadow-sm"
    >
      <div>
        <h2 id="load-title" className="text-lg font-semibold text-[var(--foreground)]">
          Гости и загрузка
        </h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          {drivers.definitions.load}
        </p>
      </div>
      {rings.length ? (
        <ul className="grid grid-cols-3 gap-2">
          {rings.map((row) => {
            const previous = row.previous?.loadEstimate ?? null;
            const change = previous === null ? null : row.current.loadEstimate! - previous;
            return (
              <li
                key={row.storeIds.join("+")}
                className="flex flex-col items-center gap-1 text-center"
              >
                <Ring
                  value={row.current.loadEstimate!}
                  good={row.current.loadEstimate! >= LOAD_REFERENCE}
                />
                <span
                  className="line-clamp-2 text-xs text-[var(--foreground)]"
                  title={row.storeName}
                >
                  {row.storeName}
                </span>
                {change !== null ? (
                  <span className={`text-[11px] ${toneText[tone(change)]}`}>
                    {arrow(tone(change))}было {formatNumber(previous!, 0)}%
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Нет клубов с привязанными визитами — загрузку не оценить.
        </p>
      )}
      <div className="grid gap-2 border-t border-[var(--border-soft)] pt-3 text-sm">
        {stat("Уникальные гости", network?.current.guests, network?.previous?.guests)}
        {stat(
          "Визитов на гостя",
          network?.current.visitsPerGuest,
          network?.previous?.visitsPerGuest,
          1,
        )}
        {stat(
          "Сыграно часов",
          network?.current.playedHours,
          network?.previous?.playedHours,
        )}
      </div>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Ориентир: средняя загрузка клуба около {LOAD_REFERENCE}% за месяц.
      </p>
    </section>
  );
}

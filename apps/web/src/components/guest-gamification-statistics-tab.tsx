"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type {
  GuestGamificationStatistics,
  GuestGamificationStatisticsComparison,
} from "@/lib/guest-gamification";
import type { Store } from "@/lib/stores";

type PeriodPreset = "day" | "week" | "month" | "custom";

type Props = {
  stores: Store[];
};

const periodOptions: Array<{ value: PeriodPreset; label: string }> = [
  { value: "day", label: "Сегодня" },
  { value: "week", label: "7 дней" },
  { value: "month", label: "30 дней" },
  { value: "custom", label: "Свой период" },
];

const rewardTypeOptions = [
  { value: "", label: "Все типы наград" },
  {
    value: "BONUS,BONUS_POINTS,BONUS_BALANCE,LOYALTY_BONUS",
    label: "Бонусы на баланс",
  },
  { value: "BALANCE,MONEY_BALANCE,CASH_BALANCE", label: "Деньги на баланс" },
  { value: "LOOT_BOX_ENTITLEMENT", label: "Кейсы" },
  { value: "PROMOCODE", label: "Промокоды" },
  { value: "FREE_HOURS", label: "Игровое время" },
  { value: "MERCH,PHYSICAL_PRIZE", label: "Физические призы" },
  { value: "XP", label: "Опыт" },
];

const sourceOptions = [
  { value: "", label: "Все активности" },
  { value: "MISSION", label: "Задания" },
  { value: "LOOT_BOX", label: "Лутбоксы" },
  { value: "BATTLE_PASS", label: "Battle Pass" },
  { value: "CHECK_IN", label: "Чекин" },
  { value: "OTHER", label: "Другие" },
];

export function GuestGamificationStatisticsTab({ stores }: Props) {
  const [preset, setPreset] = useState<PeriodPreset>("month");
  const [customFrom, setCustomFrom] = useState(() => dateInputDaysAgo(29));
  const [customTo, setCustomTo] = useState(() => dateInputDaysAgo(0));
  const [storeId, setStoreId] = useState("");
  const [rewardTypes, setRewardTypes] = useState("");
  const [sourceKinds, setSourceKinds] = useState("");
  const [anchorNow, setAnchorNow] = useState(() => new Date());
  const [reloadToken, setReloadToken] = useState(0);
  const [data, setData] = useState<GuestGamificationStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(
    () => statisticsRange(preset, anchorNow, customFrom, customTo),
    [anchorNow, customFrom, customTo, preset],
  );

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      granularity: range.granularity,
    });
    if (storeId) params.set("storeIds", storeId);
    if (rewardTypes) params.set("rewardTypes", rewardTypes);
    if (sourceKinds) params.set("sourceKinds", sourceKinds);

    async function loadStatistics() {
      await Promise.resolve();
      if (controller.signal.aborted) return;
      setLoading(true);
      setError(null);

      await fetch(`/api/guests/gamification/statistics?${params}`, {
        cache: "no-store",
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) {
            const payload = (await response.json().catch(() => null)) as {
              message?: string;
            } | null;
            throw new Error(
              payload?.message ?? "Не удалось загрузить статистику.",
            );
          }
          return response.json() as Promise<GuestGamificationStatistics>;
        })
        .then((payload) => setData(payload))
        .catch((loadError: unknown) => {
          if (controller.signal.aborted) return;
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Не удалось загрузить статистику.",
          );
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }

    void loadStatistics();

    return () => controller.abort();
  }, [range, reloadToken, rewardTypes, sourceKinds, storeId]);

  function refresh() {
    setAnchorNow(new Date());
    setReloadToken((value) => value + 1);
  }

  return (
    <section className="mt-6 space-y-5" aria-labelledby="statistics-title">
      <header className="overflow-hidden rounded-3xl border border-zinc-200 bg-zinc-950 text-white shadow-sm dark:border-zinc-800">
        <div className="relative px-5 py-6 sm:px-7 sm:py-7">
          <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-emerald-400/15 blur-3xl" />
          <div className="pointer-events-none absolute bottom-0 left-1/3 h-32 w-56 rounded-full bg-cyan-300/10 blur-3xl" />
          <div className="relative flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">
                Пульс геймификации
              </p>
              <h2
                id="statistics-title"
                className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl"
              >
                Статистика
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-300">
                Регистрации, активность и фактически выданные награды в одном
                измеримом контуре. Все показатели исключают тестовые профили.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-300">
              <FreshnessBadge data={data} loading={loading} />
              <button
                type="button"
                onClick={refresh}
                disabled={loading}
                className="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 font-semibold text-white transition hover:bg-white/10 disabled:cursor-wait disabled:opacity-60"
              >
                {loading ? "Обновляем…" : "Обновить"}
              </button>
            </div>
          </div>
        </div>
      </header>

      <StatisticsFilters
        preset={preset}
        setPreset={setPreset}
        customFrom={customFrom}
        setCustomFrom={setCustomFrom}
        customTo={customTo}
        setCustomTo={setCustomTo}
        storeId={storeId}
        setStoreId={setStoreId}
        rewardTypes={rewardTypes}
        setRewardTypes={setRewardTypes}
        sourceKinds={sourceKinds}
        setSourceKinds={setSourceKinds}
        stores={stores}
      />

      {error ? (
        <div
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800 dark:border-red-950 dark:bg-red-950/30 dark:text-red-200"
        >
          <p className="font-semibold">Статистика временно недоступна</p>
          <p className="mt-1">{error}</p>
          <button
            type="button"
            onClick={refresh}
            className="mt-3 font-semibold underline underline-offset-4"
          >
            Повторить загрузку
          </button>
        </div>
      ) : null}

      {loading && !data ? <StatisticsSkeleton /> : null}

      {data ? (
        <div
          className={
            loading ? "opacity-70 transition-opacity" : "transition-opacity"
          }
          aria-busy={loading}
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              eyebrow="Новые профили"
              title="Регистрации"
              value={formatNumber(data.summary.registrations.current)}
              comparison={data.summary.registrations}
              accent="emerald"
            />
            <KpiCard
              eyebrow="Уникальные гости"
              title="Активные пользователи"
              value={formatNumber(data.summary.activeUsers.current)}
              comparison={data.summary.activeUsers}
              accent="cyan"
            />
            <KpiCard
              eyebrow="Финальный статус"
              title="Выданные награды"
              value={formatNumber(data.summary.deliveredRewards.current)}
              comparison={data.summary.deliveredRewards}
              accent="violet"
              detail={`${formatNumber(data.summary.otherDeliveredRewards)} — не бонусы`}
            />
            <KpiCard
              eyebrow="Подтверждено в ledger"
              title="Бонусы"
              value={`${formatNumber(data.summary.confirmedBonuses.current)} Б`}
              comparison={data.summary.confirmedBonuses}
              accent="amber"
              detail={`${formatNumber(data.summary.confirmedBonuses.operations)} операций`}
            />
          </div>

          {data.meta.scopeNote ? (
            <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200">
              {data.meta.scopeNote}
            </p>
          ) : null}

          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.75fr)]">
            <DashboardCard
              title="Регистрации и активность"
              subtitle="Динамика по выбранному периоду"
              action={<ChartLegend />}
            >
              <ActivityHistogram data={data} />
            </DashboardCard>

            <DashboardCard
              title="Структура наград"
              subtitle="Только фактически выданные"
            >
              <RewardTypeBreakdown data={data} />
            </DashboardCard>
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <DashboardCard
              title="Путь награды"
              subtitle="Квалификация → получение → выдача"
            >
              <RewardLifecycle data={data} />
            </DashboardCard>
            <DashboardCard
              title="Источники результата"
              subtitle="Какие механики выдали награды"
            >
              <SourceBreakdown data={data} />
            </DashboardCard>
          </div>

          <div className="mt-5">
            <DashboardCard
              title="Выдача по периодам"
              subtitle="Награды и подтвержденные бонусные операции"
              action={<RewardChartLegend />}
            >
              <RewardIssuanceHistogram data={data} />
            </DashboardCard>
          </div>

          <MetricDefinitions data={data} />
        </div>
      ) : null}
    </section>
  );
}

function StatisticsFilters({
  preset,
  setPreset,
  customFrom,
  setCustomFrom,
  customTo,
  setCustomTo,
  storeId,
  setStoreId,
  rewardTypes,
  setRewardTypes,
  sourceKinds,
  setSourceKinds,
  stores,
}: {
  preset: PeriodPreset;
  setPreset: (value: PeriodPreset) => void;
  customFrom: string;
  setCustomFrom: (value: string) => void;
  customTo: string;
  setCustomTo: (value: string) => void;
  storeId: string;
  setStoreId: (value: string) => void;
  rewardTypes: string;
  setRewardTypes: (value: string) => void;
  sourceKinds: string;
  setSourceKinds: (value: string) => void;
  stores: Store[];
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-4">
        <fieldset>
          <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Период
          </legend>
          <div className="flex flex-wrap gap-2">
            {periodOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={preset === option.value}
                onClick={() => setPreset(option.value)}
                className={[
                  "rounded-xl border px-4 py-2 text-sm font-semibold transition",
                  preset === option.value
                    ? "border-zinc-950 bg-zinc-950 text-white dark:border-emerald-400 dark:bg-emerald-400 dark:text-zinc-950"
                    : "border-zinc-200 text-zinc-700 hover:border-zinc-400 dark:border-zinc-800 dark:text-zinc-300 dark:hover:border-zinc-600",
                ].join(" ")}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {preset === "custom" ? (
            <>
              <FilterField label="С даты">
                <input
                  type="date"
                  value={customFrom}
                  max={customTo}
                  onChange={(event) => setCustomFrom(event.target.value)}
                  className={inputClassName}
                />
              </FilterField>
              <FilterField label="По дату">
                <input
                  type="date"
                  value={customTo}
                  min={customFrom}
                  onChange={(event) => setCustomTo(event.target.value)}
                  className={inputClassName}
                />
              </FilterField>
            </>
          ) : null}
          <FilterField label="Клуб">
            <select
              value={storeId}
              onChange={(event) => setStoreId(event.target.value)}
              className={inputClassName}
            >
              <option value="">Вся сеть</option>
              {stores
                .filter((store) => store.isActive)
                .map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
            </select>
          </FilterField>
          <FilterField label="Тип награды">
            <select
              value={rewardTypes}
              onChange={(event) => setRewardTypes(event.target.value)}
              className={inputClassName}
            >
              {rewardTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Источник">
            <select
              value={sourceKinds}
              onChange={(event) => setSourceKinds(event.target.value)}
              className={inputClassName}
            >
              {sourceOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </FilterField>
        </div>
      </div>
    </div>
  );
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
      {label}
      <span className="mt-1.5 block normal-case tracking-normal">
        {children}
      </span>
    </label>
  );
}

function KpiCard({
  eyebrow,
  title,
  value,
  comparison,
  accent,
  detail,
}: {
  eyebrow: string;
  title: string;
  value: string;
  comparison: GuestGamificationStatisticsComparison;
  accent: "emerald" | "cyan" | "violet" | "amber";
  detail?: string;
}) {
  const accentClass = {
    emerald: "bg-emerald-400",
    cyan: "bg-cyan-400",
    violet: "bg-violet-400",
    amber: "bg-amber-400",
  }[accent];
  return (
    <article className="relative overflow-hidden rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <span className={`absolute inset-x-0 top-0 h-1 ${accentClass}`} />
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
        {eyebrow}
      </p>
      <h3 className="mt-1 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
        {title}
      </h3>
      <p className="mt-5 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-white">
        {value}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <Trend comparison={comparison} />
        <span className="text-zinc-500 dark:text-zinc-400">
          к предыдущему периоду
        </span>
      </div>
      {detail ? (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          {detail}
        </p>
      ) : null}
    </article>
  );
}

function Trend({
  comparison,
}: {
  comparison: GuestGamificationStatisticsComparison;
}) {
  if (comparison.trendPercent === null) {
    return (
      <span className="font-semibold text-zinc-500 dark:text-zinc-400">
        Без базы сравнения
      </span>
    );
  }
  const positive = comparison.trendPercent >= 0;
  return (
    <span
      className={
        positive
          ? "font-semibold text-emerald-700 dark:text-emerald-300"
          : "font-semibold text-red-700 dark:text-red-300"
      }
    >
      {positive ? "↑" : "↓"} {Math.abs(comparison.trendPercent)}%
    </span>
  );
}

function DashboardCard({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-zinc-950 dark:text-white">
            {title}
          </h3>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {subtitle}
          </p>
        </div>
        {action}
      </header>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function ActivityHistogram({ data }: { data: GuestGamificationStatistics }) {
  const width = 920;
  const height = 300;
  const left = 42;
  const right = 18;
  const top = 18;
  const bottom = 48;
  const plotHeight = height - top - bottom;
  const plotWidth = width - left - right;
  const maximum = Math.max(
    1,
    ...data.series.flatMap((point) => [point.registrations, point.activeUsers]),
  );
  const slot = plotWidth / Math.max(1, data.series.length);
  const barWidth = Math.max(2.5, Math.min(18, slot * 0.3));
  const labelEvery = Math.max(1, Math.ceil(data.series.length / 6));

  return (
    <div className="overflow-x-auto pb-1">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-labelledby="activity-chart-title activity-chart-desc"
        className="min-w-[680px] w-full"
      >
        <title id="activity-chart-title">
          Регистрации и активные пользователи
        </title>
        <desc id="activity-chart-desc">
          Групповая гистограмма по {data.series.length} периодам.
        </desc>
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = top + plotHeight * (1 - ratio);
          return (
            <g key={ratio}>
              <line
                x1={left}
                x2={width - right}
                y1={y}
                y2={y}
                className="stroke-zinc-200 dark:stroke-zinc-800"
                strokeDasharray={ratio === 0 ? undefined : "4 5"}
              />
              <text
                x={left - 8}
                y={y + 4}
                textAnchor="end"
                className="fill-zinc-400 text-[10px]"
              >
                {Math.round(maximum * ratio)}
              </text>
            </g>
          );
        })}
        {data.series.map((point, index) => {
          const center = left + slot * index + slot / 2;
          const registrationHeight =
            (point.registrations / maximum) * plotHeight;
          const activeHeight = (point.activeUsers / maximum) * plotHeight;
          const showLabel =
            index % labelEvery === 0 || index === data.series.length - 1;
          return (
            <g key={point.bucketStart}>
              <rect
                x={center - barWidth - 1.5}
                y={top + plotHeight - registrationHeight}
                width={barWidth}
                height={registrationHeight}
                rx="3"
                className="fill-emerald-400"
              >
                <title>
                  {bucketLabel(point.bucketStart, data.meta.granularity)}:
                  регистраций {point.registrations}
                </title>
              </rect>
              <rect
                x={center + 1.5}
                y={top + plotHeight - activeHeight}
                width={barWidth}
                height={activeHeight}
                rx="3"
                className="fill-cyan-400"
              >
                <title>
                  {bucketLabel(point.bucketStart, data.meta.granularity)}:
                  активных {point.activeUsers}
                </title>
              </rect>
              {showLabel ? (
                <text
                  x={center}
                  y={height - 18}
                  textAnchor="middle"
                  className="fill-zinc-500 text-[10px] dark:fill-zinc-400"
                >
                  {bucketShortLabel(point.bucketStart, data.meta.granularity)}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function ChartLegend() {
  return (
    <div className="flex flex-wrap gap-3 text-xs text-zinc-600 dark:text-zinc-300">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-sm bg-emerald-400" />
        Регистрации
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-sm bg-cyan-400" />
        Активные
      </span>
    </div>
  );
}

function RewardIssuanceHistogram({
  data,
}: {
  data: GuestGamificationStatistics;
}) {
  const width = 920;
  const height = 250;
  const left = 42;
  const right = 18;
  const top = 18;
  const bottom = 44;
  const plotHeight = height - top - bottom;
  const plotWidth = width - left - right;
  const maximum = Math.max(
    1,
    ...data.series.flatMap((point) => [
      point.deliveredRewards,
      point.confirmedBonusOperations,
    ]),
  );
  const slot = plotWidth / Math.max(1, data.series.length);
  const barWidth = Math.max(2.5, Math.min(18, slot * 0.3));
  const labelEvery = Math.max(1, Math.ceil(data.series.length / 6));

  return (
    <div className="overflow-x-auto pb-1">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-labelledby="reward-chart-title reward-chart-desc"
        className="min-w-[680px] w-full"
      >
        <title id="reward-chart-title">
          Выданные награды и бонусные операции
        </title>
        <desc id="reward-chart-desc">
          Групповая гистограмма фактической выдачи по выбранному периоду.
        </desc>
        {[0, 0.5, 1].map((ratio) => {
          const y = top + plotHeight * (1 - ratio);
          return (
            <g key={ratio}>
              <line
                x1={left}
                x2={width - right}
                y1={y}
                y2={y}
                className="stroke-zinc-200 dark:stroke-zinc-800"
                strokeDasharray={ratio === 0 ? undefined : "4 5"}
              />
              <text
                x={left - 8}
                y={y + 4}
                textAnchor="end"
                className="fill-zinc-400 text-[10px]"
              >
                {Math.round(maximum * ratio)}
              </text>
            </g>
          );
        })}
        {data.series.map((point, index) => {
          const center = left + slot * index + slot / 2;
          const rewardHeight = (point.deliveredRewards / maximum) * plotHeight;
          const bonusHeight =
            (point.confirmedBonusOperations / maximum) * plotHeight;
          const showLabel =
            index % labelEvery === 0 || index === data.series.length - 1;
          return (
            <g key={point.bucketStart}>
              <rect
                x={center - barWidth - 1.5}
                y={top + plotHeight - rewardHeight}
                width={barWidth}
                height={rewardHeight}
                rx="3"
                className="fill-violet-400"
              >
                <title>
                  {bucketLabel(point.bucketStart, data.meta.granularity)}:
                  выдано наград {point.deliveredRewards}
                </title>
              </rect>
              <rect
                x={center + 1.5}
                y={top + plotHeight - bonusHeight}
                width={barWidth}
                height={bonusHeight}
                rx="3"
                className="fill-amber-400"
              >
                <title>
                  {bucketLabel(point.bucketStart, data.meta.granularity)}:
                  бонусных операций {point.confirmedBonusOperations}, сумма{" "}
                  {formatNumber(point.confirmedBonusAmount)} Б
                </title>
              </rect>
              {showLabel ? (
                <text
                  x={center}
                  y={height - 15}
                  textAnchor="middle"
                  className="fill-zinc-500 text-[10px] dark:fill-zinc-400"
                >
                  {bucketShortLabel(point.bucketStart, data.meta.granularity)}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function RewardChartLegend() {
  return (
    <div className="flex flex-wrap gap-3 text-xs text-zinc-600 dark:text-zinc-300">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-sm bg-violet-400" />
        Все награды
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-sm bg-amber-400" />
        Бонусные операции
      </span>
    </div>
  );
}

function RewardTypeBreakdown({ data }: { data: GuestGamificationStatistics }) {
  const total = data.rewardTypes.reduce((sum, item) => sum + item.count, 0);
  if (!total)
    return <EmptyState>В выбранном периоде нет выданных наград.</EmptyState>;
  return (
    <div className="space-y-4">
      {data.rewardTypes.slice(0, 7).map((item, index) => {
        const percent = Math.round((item.count / total) * 100);
        return (
          <div key={item.type}>
            <div className="flex items-end justify-between gap-3 text-sm">
              <div className="min-w-0">
                <p className="truncate font-semibold text-zinc-800 dark:text-zinc-200">
                  {item.label}
                </p>
                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  {formatNumber(item.count)} наград
                </p>
              </div>
              <span className="font-semibold text-zinc-950 dark:text-white">
                {percent}%
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-900">
              <div
                className={
                  index % 2 === 0
                    ? "h-full rounded-full bg-emerald-400"
                    : "h-full rounded-full bg-cyan-400"
                }
                style={{ width: `${Math.max(2, percent)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RewardLifecycle({ data }: { data: GuestGamificationStatistics }) {
  const steps = [
    {
      label: "Выполнено условие",
      value: data.lifecycle.qualified,
      color: "bg-cyan-400/15 border-cyan-400/30",
    },
    {
      label: "Награда забрана",
      value: data.lifecycle.claimed,
      color: "bg-emerald-400/15 border-emerald-400/30",
    },
    {
      label: "Фактически выдано",
      value: data.lifecycle.delivered,
      color: "bg-amber-400/15 border-amber-400/30",
    },
  ];
  const maximum = Math.max(1, ...steps.map((step) => step.value));
  return (
    <div className="space-y-3">
      {steps.map((step, index) => {
        const width = Math.max(44, (step.value / maximum) * 100);
        const previous = index > 0 ? steps[index - 1].value : null;
        const conversion =
          previous && previous > 0
            ? Math.round((step.value / previous) * 100)
            : null;
        return (
          <div key={step.label}>
            <div
              className={`rounded-xl border px-4 py-3 ${step.color}`}
              style={{ width: `${width}%` }}
            >
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                {step.label}
              </p>
              <p className="mt-1 text-2xl font-semibold text-zinc-950 dark:text-white">
                {formatNumber(step.value)}
              </p>
            </div>
            {conversion !== null ? (
              <p className="mt-1 pl-3 text-xs text-zinc-500 dark:text-zinc-400">
                Конверсия шага: {conversion}%
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function SourceBreakdown({ data }: { data: GuestGamificationStatistics }) {
  const maximum = Math.max(1, ...data.sources.map((source) => source.count));
  if (!data.sources.length)
    return <EmptyState>Нет источников выдачи за выбранный период.</EmptyState>;
  return (
    <div className="space-y-3">
      {data.sources.map((source) => (
        <div
          key={source.sourceKind}
          className="grid grid-cols-[minmax(100px,0.55fr)_minmax(120px,1fr)_auto] items-center gap-3"
        >
          <span className="truncate text-sm font-semibold text-zinc-700 dark:text-zinc-200">
            {source.label}
          </span>
          <span className="h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-900">
            <span
              className="block h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400"
              style={{
                width: `${Math.max(3, (source.count / maximum) * 100)}%`,
              }}
            />
          </span>
          <span className="text-sm font-semibold tabular-nums text-zinc-950 dark:text-white">
            {formatNumber(source.count)}
          </span>
        </div>
      ))}
    </div>
  );
}

function MetricDefinitions({ data }: { data: GuestGamificationStatistics }) {
  return (
    <details className="mt-5 rounded-2xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/40">
      <summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
        Как считаются показатели
      </summary>
      <div className="grid gap-3 border-t border-zinc-200 px-5 py-4 dark:border-zinc-800 sm:grid-cols-2">
        {data.definitions.map((definition) => (
          <div key={definition.key}>
            <p className="text-sm font-semibold text-zinc-900 dark:text-white">
              {definition.label}
            </p>
            <p className="mt-1 text-xs leading-5 text-zinc-600 dark:text-zinc-400">
              {definition.description}
            </p>
          </div>
        ))}
      </div>
    </details>
  );
}

function FreshnessBadge({
  data,
  loading,
}: {
  data: GuestGamificationStatistics | null;
  loading: boolean;
}) {
  const label =
    loading && !data
      ? "Синхронизация данных"
      : data?.meta.latestDataAt
        ? `Данные до ${formatDateTime(data.meta.latestDataAt)}`
        : "Нет свежих фактов";
  return (
    <span className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2.5">
      <span
        className={
          loading
            ? "h-2 w-2 animate-pulse rounded-full bg-amber-300"
            : "h-2 w-2 rounded-full bg-emerald-300"
        }
      />
      {label}
    </span>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
      {children}
    </div>
  );
}

function StatisticsSkeleton() {
  return (
    <div className="space-y-5" aria-label="Загружаем статистику">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div
            key={item}
            className="h-44 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-900"
          />
        ))}
      </div>
      <div className="h-96 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-900" />
    </div>
  );
}

function statisticsRange(
  preset: PeriodPreset,
  now: Date,
  customFrom: string,
  customTo: string,
) {
  if (preset === "custom") {
    const from = localDateStart(customFrom) ?? startOfLocalDay(now);
    const toStart = localDateStart(customTo) ?? startOfLocalDay(now);
    const to = new Date(toStart.getTime() + 86_400_000);
    const duration = Math.max(0, to.getTime() - from.getTime());
    return {
      from,
      to: to > from ? to : new Date(from.getTime() + 86_400_000),
      granularity:
        duration > 240 * 86_400_000
          ? "MONTH"
          : duration > 45 * 86_400_000
            ? "WEEK"
            : "DAY",
    } as const;
  }
  const to = now;
  const days = preset === "day" ? 1 : preset === "week" ? 7 : 30;
  const from = startOfLocalDay(
    new Date(now.getTime() - (days - 1) * 86_400_000),
  );
  return { from, to, granularity: "DAY" as const };
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function localDateStart(value: string) {
  const parts = value.split("-").map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part)))
    return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function dateInputDaysAgo(days: number) {
  const date = new Date(Date.now() - days * 86_400_000);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function bucketLabel(
  value: string,
  granularity: GuestGamificationStatistics["meta"]["granularity"],
) {
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat(
    "ru-RU",
    granularity === "MONTH"
      ? { month: "long", year: "numeric" }
      : { day: "numeric", month: "long", year: "numeric" },
  ).format(date);
}

function bucketShortLabel(
  value: string,
  granularity: GuestGamificationStatistics["meta"]["granularity"],
) {
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat(
    "ru-RU",
    granularity === "MONTH"
      ? { month: "short" }
      : { day: "2-digit", month: "short" },
  )
    .format(date)
    .replace(".", "");
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(
    value,
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

const inputClassName =
  "h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white";

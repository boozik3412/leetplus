"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  GAME_EFFECT_METRICS,
  GAME_EFFECT_METRIC_LABELS,
  GAME_EFFECT_SCENARIO_KIND_LABELS,
  GAME_EFFECT_VERDICT_LABELS,
  formatGameEffectDelta,
  formatGameEffectInterval,
  formatGameEffectValue,
  gameEffectHoldoutStatus,
  gameEffectMetricTone,
  gameEffectReportCsv,
  gameEffectVerdictHint,
  gameEffectVerdictTone,
  type GameEffectCohortView,
  type GameEffectMetric,
  type GameEffectReport,
  type GameEffectScenarioView,
  type GameEffectTone,
  type GameEffectVerdict,
} from "@/lib/guest-game-effect";

type Props = {
  canManage: boolean;
};

const HOLDOUT_OPTIONS = [0, 5, 10, 20, 30, 50];

const toneClasses: Record<GameEffectTone, string> = {
  good: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  bad: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  neutral: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200",
  muted: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
};

const deltaClasses: Record<GameEffectTone, string> = {
  good: "text-emerald-700 dark:text-emerald-300",
  bad: "text-red-700 dark:text-red-300",
  neutral: "text-zinc-900 dark:text-zinc-100",
  muted: "text-zinc-500 dark:text-zinc-400",
};

export function GuestGamificationEffectTab({ canManage }: Props) {
  const [storeId, setStoreId] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const [data, setData] = useState<GameEffectReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (storeId) params.set("storeId", storeId);

    async function load() {
      await Promise.resolve();
      if (controller.signal.aborted) return;
      setLoading(true);
      setError(null);
      await fetch(`/api/guests/gamification/effect?${params}`, {
        cache: "no-store",
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) {
            const payload = (await response.json().catch(() => null)) as {
              message?: string;
            } | null;
            throw new Error(payload?.message ?? "Не удалось посчитать эффект.");
          }
          return response.json() as Promise<GameEffectReport>;
        })
        .then((payload) => setData(payload))
        .catch((loadError: unknown) => {
          if (controller.signal.aborted) return;
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Не удалось посчитать эффект.",
          );
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }

    void load();
    return () => controller.abort();
  }, [storeId, reloadToken]);

  function downloadCsv() {
    if (!data) return;
    const blob = new Blob([gameEffectReportCsv(data)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `effect-${data.lastCompleteDay}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section
      className="mt-6 min-w-0 space-y-5"
      aria-labelledby="effect-title"
    >
      <header className="overflow-hidden rounded-3xl border border-zinc-200 bg-zinc-950 text-white shadow-sm dark:border-zinc-800">
        <div className="relative px-5 py-6 sm:px-7 sm:py-7">
          <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-cyan-400/15 blur-3xl" />
          <div className="relative flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">
                Что изменила игра
              </p>
              <h2
                id="effect-title"
                className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl"
              >
                Эффект
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-300">
                Как изменились визиты, часы и деньги игроков за{" "}
                {data?.windowDays ?? 28} дней после старта по сравнению с
                похожими гостями, которые были в клубе в тот же день, но не
                играли. Всё сверх их изменения — эффект игры.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-300">
              <label className="flex items-center gap-2">
                <span className="sr-only">Клуб</span>
                <select
                  value={storeId}
                  onChange={(event) => setStoreId(event.target.value)}
                  className="rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 font-semibold text-white"
                >
                  <option value="" className="text-zinc-900">
                    Вся сеть
                  </option>
                  {(data?.stores ?? []).map((store) => (
                    <option
                      key={store.id}
                      value={store.id}
                      className="text-zinc-900"
                    >
                      {store.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={downloadCsv}
                disabled={!data}
                className="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 font-semibold text-white transition hover:bg-white/10 disabled:opacity-50"
              >
                CSV
              </button>
              <button
                type="button"
                onClick={() => setReloadToken((value) => value + 1)}
                disabled={loading}
                className="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 font-semibold text-white transition hover:bg-white/10 disabled:cursor-wait disabled:opacity-60"
              >
                {loading ? "Считаем…" : "Обновить"}
              </button>
            </div>
          </div>
        </div>
      </header>

      {error ? (
        <div
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800 dark:border-red-950 dark:bg-red-950/30 dark:text-red-200"
        >
          <p className="font-semibold">Эффект временно недоступен</p>
          <p className="mt-1">{error}</p>
        </div>
      ) : null}

      {loading && !data ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-hidden>
          {[0, 1, 2, 3].map((index) => (
            <div
              key={index}
              className="h-32 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-900"
            />
          ))}
        </div>
      ) : null}

      {data ? (
        <div
          className={loading ? "space-y-5 opacity-70" : "space-y-5"}
          aria-busy={loading}
        >
          <DataQualityNotes report={data} />
          <GameSection report={data} />
          {!data.storeId && data.game.byStore.length > 1 ? (
            <StoreSection report={data} />
          ) : null}
          <ScenarioSection
            report={data}
            canManage={canManage}
            onChanged={() => setReloadToken((value) => value + 1)}
          />
          <MethodNote report={data} />
        </div>
      ) : null}
    </section>
  );
}

function Card({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base font-bold text-zinc-950 dark:text-white">
            {title}
          </h3>
          {subtitle ? (
            <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              {subtitle}
            </p>
          ) : null}
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function VerdictBadge({ verdict }: { verdict: GameEffectVerdict }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${toneClasses[gameEffectVerdictTone(verdict)]}`}
      title={gameEffectVerdictHint(verdict)}
    >
      {GAME_EFFECT_VERDICT_LABELS[verdict]}
    </span>
  );
}

function Delta({
  cohort,
  metric,
}: {
  cohort: GameEffectCohortView;
  metric: GameEffectMetric;
}) {
  const view = cohort.metrics[metric];
  if (!cohort.measured) {
    return <span className="text-zinc-400">—</span>;
  }
  return (
    <span
      className={`font-semibold tabular-nums ${deltaClasses[gameEffectMetricTone(view)]}`}
      title={formatGameEffectInterval(metric, view) ?? "Мало гостей для интервала"}
    >
      {formatGameEffectDelta(metric, view.effect)}
    </span>
  );
}

function coverageText(cohort: GameEffectCohortView) {
  const parts = [`измерено ${cohort.measured} из ${cohort.participants}`];
  if (cohort.immature) parts.push(`окно ещё идёт у ${cohort.immature}`);
  if (cohort.unmatched) parts.push(`без пары для сравнения ${cohort.unmatched}`);
  if (cohort.noHistory) parts.push(`без визитов в данных ${cohort.noHistory}`);
  return parts.join(" · ");
}

function GameSection({ report }: { report: GameEffectReport }) {
  const cohort = report.game;
  const kpis: Array<{ metric: GameEffectMetric; title: string }> = [
    { metric: "visitDays", title: "Дни визитов" },
    { metric: "playMinutes", title: "Часы игры" },
    { metric: "money", title: "Деньги гостя" },
  ];
  return (
    <Card
      title="Игра в целом: игроки против похожих гостей без игры"
      subtitle={`${coverageText(cohort)}. В сравнении ${cohort.comparisonGuests} гостей без игры, которые были в клубе в те же дни и ходили так же часто до старта.`}
      action={<VerdictBadge verdict={cohort.verdict} />}
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map(({ metric, title }) => {
          const view = cohort.metrics[metric];
          return (
            <div
              key={metric}
              className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/50"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                {title} · на игрока
              </p>
              <p className="mt-2 text-2xl">
                <Delta cohort={cohort} metric={metric} />
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                {formatGameEffectInterval(metric, view) ??
                  "интервал появится от 10 гостей"}
              </p>
              {metric === "money" && cohort.measured ? (
                <p className="mt-1 text-xs text-zinc-500">
                  всего {formatGameEffectDelta("money", view.total)}
                </p>
              ) : null}
            </div>
          );
        })}
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Стоимость · бонусы
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
            {formatGameEffectValue("money", cohort.cost.bonusRub)}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            {cohort.moneyPerBonusRub === null
              ? "бонусов в окне не было"
              : `${cohort.moneyPerBonusRub.toLocaleString("ru-RU")} ₽ денег на 1 ₽ бонусов`}
            {cohort.cost.prizes ? ` · призов ${cohort.cost.prizes}` : ""}
          </p>
        </div>
      </div>
      <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
        {gameEffectVerdictHint(cohort.verdict)}
      </p>
      <BeforeAfterTable cohort={cohort} />
    </Card>
  );
}

function BeforeAfterTable({ cohort }: { cohort: GameEffectCohortView }) {
  if (!cohort.measured) return null;
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-zinc-500">
          <tr>
            <th className="py-2 pr-3 font-semibold">
              За {cohort.windowDays} дней, в среднем на гостя
            </th>
            <th className="px-3 py-2 font-semibold">Игроки до</th>
            <th className="px-3 py-2 font-semibold">Игроки после</th>
            <th className="px-3 py-2 font-semibold">Похожие до</th>
            <th className="px-3 py-2 font-semibold">Похожие после</th>
            <th className="px-3 py-2 font-semibold">Эффект</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {GAME_EFFECT_METRICS.map((metric) => {
            const view = cohort.metrics[metric];
            return (
              <tr key={metric}>
                <td className="py-2 pr-3 font-medium">
                  {GAME_EFFECT_METRIC_LABELS[metric]}
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {formatGameEffectValue(metric, view.before)}
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {formatGameEffectValue(metric, view.after)}
                </td>
                <td className="px-3 py-2 tabular-nums text-zinc-500">
                  {formatGameEffectValue(metric, view.comparisonBefore)}
                </td>
                <td className="px-3 py-2 tabular-nums text-zinc-500">
                  {formatGameEffectValue(metric, view.comparisonAfter)}
                </td>
                <td className="px-3 py-2">
                  <Delta cohort={cohort} metric={metric} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StoreSection({ report }: { report: GameEffectReport }) {
  return (
    <Card
      title="По клубам"
      subtitle="Клуб гостя — где у него больше всего дней с визитами, списаниями или покупками. Игроков и похожих гостей сравниваем внутри одного клуба."
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="py-2 pr-3 font-semibold">Клуб</th>
              <th className="px-3 py-2 font-semibold">Измерено</th>
              <th className="px-3 py-2 font-semibold">Дни визитов</th>
              <th className="px-3 py-2 font-semibold">Часы</th>
              <th className="px-3 py-2 font-semibold">Деньги</th>
              <th className="px-3 py-2 font-semibold">Бонусы</th>
              <th className="px-3 py-2 font-semibold">Вывод</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {report.game.byStore.map(({ storeId, storeName, cohort }) => (
              <tr key={storeId}>
                <td className="py-2 pr-3 font-medium">{storeName}</td>
                <td className="px-3 py-2 tabular-nums">
                  {cohort.measured} / {cohort.participants}
                </td>
                <td className="px-3 py-2">
                  <Delta cohort={cohort} metric="visitDays" />
                </td>
                <td className="px-3 py-2">
                  <Delta cohort={cohort} metric="playMinutes" />
                </td>
                <td className="px-3 py-2">
                  <Delta cohort={cohort} metric="money" />
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {formatGameEffectValue("money", cohort.cost.bonusRub)}
                </td>
                <td className="px-3 py-2">
                  <VerdictBadge verdict={cohort.verdict} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ScenarioSection({
  report,
  canManage,
  onChanged,
}: {
  report: GameEffectReport;
  canManage: boolean;
  onChanged: () => void;
}) {
  return (
    <Card
      title="Сценарии: участники против игроков, которые не участвовали"
      subtitle="Участник — получил хотя бы одну награду сценария. Сравнение — активные игроки, которые были в клубе в тот же день, но в сценарии не участвовали. Это честнее, чем «вернулся ли гость», но участники всё равно сами выбирают участвовать; точный ответ даёт только контрольная группа."
    >
      {report.scenarios.length ? (
        <div className="space-y-3">
          {report.scenarios.map((scenario) => (
            <ScenarioRow
              key={`${scenario.kind}:${scenario.id}`}
              scenario={scenario}
              canManage={canManage}
              onChanged={onChanged}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-zinc-500">Сценариев пока нет.</p>
      )}
    </Card>
  );
}

function ScenarioRow({
  scenario,
  canManage,
  onChanged,
}: {
  scenario: GameEffectScenarioView;
  canManage: boolean;
  onChanged: () => void;
}) {
  const cohort = scenario.cohort;
  const holdoutAllowed =
    scenario.kind === "MISSION" ||
    (scenario.kind === "LOOT_BOX" && scenario.usageKind === "STANDALONE");
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-cyan-100 px-2 py-1 text-[11px] font-bold uppercase text-cyan-800 dark:bg-cyan-950 dark:text-cyan-200">
              {GAME_EFFECT_SCENARIO_KIND_LABELS[scenario.kind]}
            </span>
            <VerdictBadge verdict={cohort.verdict} />
          </div>
          <h4 className="mt-2 truncate text-sm font-bold text-zinc-950 dark:text-white">
            {scenario.name}
          </h4>
          <p className="mt-1 text-xs leading-5 text-zinc-500">
            {coverageText(cohort)}
          </p>
        </div>
        <div className="grid min-w-0 grid-cols-2 gap-3 text-xs sm:grid-cols-4 lg:min-w-[520px]">
          <Mini label="визиты / гость">
            <Delta cohort={cohort} metric="visitDays" />
          </Mini>
          <Mini label="деньги / гость">
            <Delta cohort={cohort} metric="money" />
          </Mini>
          <Mini label="бонусы выдано">
            {formatGameEffectValue("money", cohort.cost.bonusRub)}
          </Mini>
          <Mini label="₽ на 1 ₽ бонусов">
            {cohort.moneyPerBonusRub === null
              ? "—"
              : cohort.moneyPerBonusRub.toLocaleString("ru-RU")}
          </Mini>
        </div>
      </div>
      {holdoutAllowed ? (
        <HoldoutBlock
          scenario={scenario}
          canManage={canManage}
          onChanged={onChanged}
        />
      ) : null}
    </div>
  );
}

function Mini({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-lg bg-white px-3 py-2 dark:bg-zinc-950">
      <p className="text-[11px] uppercase tracking-wide text-zinc-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold tabular-nums">{children}</p>
    </div>
  );
}

function HoldoutBlock({
  scenario,
  canManage,
  onChanged,
}: {
  scenario: GameEffectScenarioView;
  canManage: boolean;
  onChanged: () => void;
}) {
  const current = scenario.holdout?.percent ?? 0;
  const [percent, setPercent] = useState(current);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const result = scenario.holdout?.result ?? null;

  async function save() {
    if (
      percent !== current &&
      current > 0 &&
      !window.confirm(
        "Смена процента начинает разбивку заново: прошлые результаты контрольной группы не сложатся с новыми. Продолжить?",
      )
    ) {
      return;
    }
    setSaving(true);
    setMessage(null);
    await fetch("/api/guests/gamification/effect/holdout", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: scenario.kind, id: scenario.id, percent }),
    })
      .then(async (response) => {
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as {
            message?: string;
          } | null;
          throw new Error(payload?.message ?? "Не удалось сохранить.");
        }
        setMessage(
          percent
            ? `Сохранено: ${percent}% игроков не увидят сценарий.`
            : "Контрольная группа выключена.",
        );
        onChanged();
      })
      .catch((saveError: unknown) =>
        setMessage(
          saveError instanceof Error
            ? saveError.message
            : "Не удалось сохранить.",
        ),
      )
      .finally(() => setSaving(false));
  }

  return (
    <div className="mt-3 flex flex-col gap-3 border-t border-zinc-200 pt-3 text-xs dark:border-zinc-800 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <p className="font-semibold text-zinc-800 dark:text-zinc-200">
          {gameEffectHoldoutStatus(scenario.holdout)}
        </p>
        {result ? (
          <p className="mt-1 leading-5 text-zinc-600 dark:text-zinc-400">
            Видят сценарий {result.measuredTreatment}, контрольная группа{" "}
            {result.measuredHoldout} (окно {result.windowDays} дн.): визиты{" "}
            {formatGameEffectDelta(
              "visitDays",
              result.metrics.visitDays.effect,
            )}
            , деньги{" "}
            {formatGameEffectDelta("money", result.metrics.money.effect)} на
            гостя — <strong>{GAME_EFFECT_VERDICT_LABELS[result.verdict]}</strong>
            .
          </p>
        ) : (
          <p className="mt-1 leading-5 text-zinc-500">
            Часть игроков случайно не видит сценарий. Сравнение с ними — точный
            ответ, что сценарий даёт клубу.
          </p>
        )}
      </div>
      {canManage ? (
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2">
            <span className="text-zinc-500">Контрольная группа</span>
            <select
              value={percent}
              onChange={(event) => setPercent(Number(event.target.value))}
              className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-950"
            >
              {HOLDOUT_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option ? `${option}%` : "нет"}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={saving || percent === current}
            onClick={() => void save()}
            className="rounded-lg bg-zinc-900 px-3 py-1.5 font-semibold text-white disabled:opacity-40 dark:bg-white dark:text-zinc-900"
          >
            {saving ? "Сохраняем…" : "Сохранить"}
          </button>
          {message ? (
            <span role="status" className="text-zinc-500">
              {message}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function DataQualityNotes({ report }: { report: GameEffectReport }) {
  const notes: string[] = [];
  const quality = report.dataQuality;
  if (quality.transactionsUndated > 0) {
    notes.push(
      `${quality.transactionsUndated.toLocaleString("ru-RU")} транзакций Langame без даты: списания с депозита в эффекте занижены.`,
    );
  }
  if (quality.transactionsAnomalous > 0) {
    notes.push(
      `${quality.transactionsAnomalous} операций больше 20 000 ₽ не учитываются — это тестовые записи или корректировки.`,
    );
  }
  if (quality.playersWithoutGuest > 0) {
    notes.push(
      `${quality.playersWithoutGuest} игроков не привязаны к гостю Langame и не измеряются.`,
    );
  }
  if (!notes.length) return null;
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200">
      {notes.map((note) => (
        <p key={note}>{note}</p>
      ))}
    </div>
  );
}

function MethodNote({ report }: { report: GameEffectReport }) {
  return (
    <details className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm leading-6 text-zinc-600 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
      <summary className="cursor-pointer font-semibold text-zinc-900 dark:text-zinc-100">
        Как считается эффект
      </summary>
      <ul className="mt-3 list-disc space-y-1 pl-5">
        <li>
          День старта — активация игры гостем или первая награда сценария.
          Сравниваем {report.windowDays} дней до и {report.windowDays} дней
          после; сам день старта не учитывается.
        </li>
        <li>
          Похожие гости — были в клубе в тот же день (или ±3 дня) и за{" "}
          {report.windowDays} дней до ходили столько же раз (0, 1, 2–3, 4–7,
          8–14, 15+). Их среднее изменение — то, что было бы с игроком без
          игры.
        </li>
        <li>
          Эффект на гостя = изменение игрока − изменение похожих. Интервал —
          95%: если он целиком выше нуля, эффект не случаен.
        </li>
        <li>
          Деньги гостя = списания с депозита Langame + бар. Если бонусы
          заменяют оплату деньгами, это уже видно как меньшие списания.
          Бонусы показаны по номиналу.
        </li>
        <li>
          Считаем только гостей, у которых окно уже закончилось (данные по{" "}
          {new Date(report.lastCompleteDay).toLocaleDateString("ru-RU")},
          часовой пояс {report.timeZone}). Тестовые профили сотрудников
          исключены.
        </li>
        <li>
          Контрольная группа — случайная часть игроков, которой сценарий не
          показывается. Только она даёт причинный ответ; остальные оценки —
          лучшее приближение без неё.
        </li>
      </ul>
    </details>
  );
}

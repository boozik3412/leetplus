"use client";

import { useEffect, useState } from "react";
import {
  EmptyNote,
  InsightBadge,
  InsightCard,
  InsightCardHeader,
  KpiTile,
  PillLink,
} from "@/components/guest-insight-ui";
import {
  GAME_EFFECT_METRIC_LABELS,
  GAME_EFFECT_SCENARIO_KIND_LABELS,
  formatGameEffectDelta,
  formatGameEffectValue,
  type GameEffectMetric,
  type GuestGameEffectResponse,
} from "@/lib/guest-game-effect";

const TABLE_METRICS: GameEffectMetric[] = [
  "visitDays",
  "sessions",
  "playMinutes",
  "balanceSpend",
  "barRevenue",
  "money",
];

function dateLabel(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("ru-RU");
}

/**
 * «Эффект игры» on the guest card: the guest's own change after game
 * activation against guests who were in the club the same day without the
 * game. Loaded separately because the tenant dataset can take seconds.
 */
export function GuestGameEffectPanel({ guestId }: { guestId: string }) {
  const [data, setData] = useState<GuestGameEffectResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/guests/${encodeURIComponent(guestId)}/game-effect`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Не удалось посчитать эффект игры.");
        return response.json() as Promise<GuestGameEffectResponse>;
      })
      .then(setData)
      .catch((loadError: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Не удалось посчитать эффект игры.",
        );
      });
    return () => controller.abort();
  }, [guestId]);

  if (data && !data.available) return null;

  return (
    <InsightCard>
      <InsightCardHeader
        eyebrow="Геймификация"
        title="Эффект игры для гостя"
        description="Изменение визитов, часов и денег гостя после активации игры за вычетом изменения похожих гостей без игры, бывших в клубе в тот же день."
        aside={<PillLink href="/gamification?tab=effect">Эффект по сети</PillLink>}
      />
      <div className="p-5">
        {error ? <EmptyNote>{error}</EmptyNote> : null}
        {!data && !error ? (
          <div className="h-24 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-900" />
        ) : null}
        {data?.available ? <EffectBody data={data} /> : null}
      </div>
    </InsightCard>
  );
}

function EffectBody({
  data,
}: {
  data: Extract<GuestGameEffectResponse, { available: true }>;
}) {
  const activation = data.activation;
  if (!activation) {
    return (
      <EmptyNote>
        Гость не активировал игру — эффекта пока нет.
      </EmptyNote>
    );
  }
  if (activation.status !== "MEASURED") {
    return (
      <EmptyNote>
        {activation.status === "TOO_EARLY"
          ? `Игра активирована ${dateLabel(activation.exposureDate)}: прошло ${activation.daysElapsed} дн., эффект появится через неделю после старта.`
          : `Игра активирована ${dateLabel(activation.exposureDate)}, но в те дни в клубе не было похожих гостей без игры — сравнить не с кем.`}
      </EmptyNote>
    );
  }

  const tile = (metric: GameEffectMetric, label: string) => {
    const value = activation.effect[metric];
    return (
      <KpiTile
        label={label}
        value={formatGameEffectDelta(metric, value)}
        tone={value > 0 ? "good" : value < 0 ? "warning" : "neutral"}
        caption={`было ${formatGameEffectValue(metric, activation.before[metric])} → стало ${formatGameEffectValue(metric, activation.after[metric])}`}
      />
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
        <span>
          Игра с {dateLabel(activation.exposureDate)} · окно{" "}
          {activation.windowDays} дн.
        </span>
        {!activation.complete ? (
          <InsightBadge tone="warning">окно ещё идёт</InsightBadge>
        ) : null}
        <span>· сравнение: {activation.comparisonGuests} похожих гостей</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {tile("visitDays", "Дни визитов")}
        {tile("playMinutes", "Часы игры")}
        {tile("money", "Деньги гостя")}
        <KpiTile
          label="Выдано игрой"
          value={formatGameEffectValue("money", data.cost.bonusRub)}
          caption={
            data.cost.prizes
              ? `бонусы по номиналу · призов ${data.cost.prizes}`
              : "бонусы по номиналу"
          }
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="py-2 pr-3 font-semibold">
                За {activation.windowDays} дн.
              </th>
              <th className="px-3 py-2 font-semibold">Гость до</th>
              <th className="px-3 py-2 font-semibold">Гость после</th>
              <th className="px-3 py-2 font-semibold">Похожие до</th>
              <th className="px-3 py-2 font-semibold">Похожие после</th>
              <th className="px-3 py-2 font-semibold">Эффект</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {TABLE_METRICS.map((metric) => (
              <tr key={metric}>
                <td className="py-2 pr-3 font-medium">
                  {GAME_EFFECT_METRIC_LABELS[metric]}
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {formatGameEffectValue(metric, activation.before[metric])}
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {formatGameEffectValue(metric, activation.after[metric])}
                </td>
                <td className="px-3 py-2 tabular-nums text-zinc-500">
                  {formatGameEffectValue(
                    metric,
                    activation.expectedBefore[metric],
                  )}
                </td>
                <td className="px-3 py-2 tabular-nums text-zinc-500">
                  {formatGameEffectValue(
                    metric,
                    activation.expectedAfter[metric],
                  )}
                </td>
                <td className="px-3 py-2 font-semibold tabular-nums">
                  {formatGameEffectDelta(metric, activation.effect[metric])}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.scenarios.length ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Сценарии гостя
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {data.scenarios.map((scenario) => (
              <li key={`${scenario.kind}:${scenario.id}`}>
                <InsightBadge
                  tone={scenario.inHoldout ? "warning" : "neutral"}
                  title={
                    scenario.inHoldout
                      ? "Гость в контрольной группе: сценарий ему не показывается"
                      : undefined
                  }
                >
                  {GAME_EFFECT_SCENARIO_KIND_LABELS[scenario.kind]} «
                  {scenario.name}»
                  {scenario.firstDate
                    ? ` · с ${dateLabel(scenario.firstDate)}`
                    : ""}
                  {scenario.bonusRub
                    ? ` · ${formatGameEffectValue("money", scenario.bonusRub)}`
                    : ""}
                  {scenario.inHoldout ? " · контрольная группа" : ""}
                </InsightBadge>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="text-xs leading-5 text-zinc-500">
        Один гость — это не статистика: его неделя может быть случайно удачной
        или неудачной. Надёжный вывод — во вкладке «Эффект» по всем игрокам.
      </p>
    </div>
  );
}

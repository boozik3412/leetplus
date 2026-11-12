"use client";

import { useState } from "react";
import type {
  MarketingCampaignTelegramAutomation,
  MarketingCampaignTelegramTrigger,
} from "@/lib/marketing";

export const triggerDays: Record<
  MarketingCampaignTelegramTrigger,
  { default: number; min: number; max: number }
> = {
  LAPSED: { default: 21, min: 7, max: 180 },
  NO_SECOND_VISIT: { default: 7, min: 2, max: 60 },
  REWARD_EXPIRING: { default: 3, min: 1, max: 14 },
};

export const triggerOptions: Array<{
  id: MarketingCampaignTelegramTrigger;
  label: string;
  hint: string;
  daysLabel: string;
}> = [
  {
    id: "LAPSED",
    label: "Давно не был в клубе",
    hint: "Гость не приходил столько дней. Сообщение уходит один раз после его последнего визита; вернулся и снова пропал — придёт снова.",
    daysLabel: "Не был в клубе, дней",
  },
  {
    id: "NO_SECOND_VISIT",
    label: "Пришёл один раз и не вернулся",
    hint: "Новый гость был только в один день. Сообщение уходит один раз.",
    daysLabel: "Прошло после первого визита, дней",
  },
  {
    id: "REWARD_EXPIRING",
    label: "Награда скоро сгорит",
    hint: "В игре у гостя есть незабранная награда. К тексту добавится её название и до какого числа её забрать.",
    daysLabel: "Сгорает в ближайшие, дней",
  },
];

const statusLabels: Record<string, string> = {
  DRAFT: "черновик",
  PLANNED: "запланирована",
  RUNNING: "идёт",
  FINISHED: "завершена",
  CANCELED: "отменена",
};

function formatNumber(value: number) {
  return value.toLocaleString("ru-RU");
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type Props = {
  automation: MarketingCampaignTelegramAutomation | null;
  campaignStatus: string;
  promo: boolean;
  frequencyDays: number;
  hasText: boolean;
  dirty: boolean;
  pending: boolean;
  disabled: boolean;
  onToggle: (enabled: boolean) => void;
};

export function MarketingCampaignTelegramAutomationCard({
  automation,
  campaignStatus,
  promo,
  frequencyDays,
  hasText,
  dirty,
  pending,
  disabled,
  onToggle,
}: Props) {
  const [confirming, setConfirming] = useState(false);

  if (!automation) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h3 className="text-sm font-semibold">Автосценарий</h3>
        <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          Выберите правило слева, напишите текст и нажмите «Сохранить и
          посчитать». Здесь появится, сколько гостей подходит под правило
          сейчас, и кнопка включения.
        </p>
      </div>
    );
  }

  const { reach } = automation;
  const finished =
    campaignStatus === "FINISHED" || campaignStatus === "CANCELED";
  const rows: Array<{ label: string; value: number; hint?: string }> = [
    {
      label: "Подходят под правило сейчас",
      value: reach.matching,
      hint: "Только гости с Telegram-ботом; сотрудники и «не связываться» не входят.",
    },
    { label: "Отписались от сообщений", value: reach.unsubscribed },
    ...(promo
      ? [{ label: "Не согласились на акции", value: reach.noPromoConsent }]
      : []),
    ...(automation.trigger !== "REWARD_EXPIRING"
      ? [
          {
            label: `Получали рассылку за ${frequencyDays} дня`,
            value: reach.recentlyMessaged,
            hint: "Получат позже, когда пройдёт три дня.",
          },
        ]
      : []),
    { label: "Уже получили по этому правилу", value: reach.alreadySent },
  ];

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Автосценарий</h3>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
            automation.enabled
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"
              : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
          }`}
        >
          {automation.enabled ? "Включён" : "Выключен"}
        </span>
      </div>

      {automation.enabled && !automation.campaignRunning ? (
        <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          Кампания сейчас {statusLabels[campaignStatus] ?? campaignStatus} или
          вне своих дат, поэтому сообщения не уходят.
        </p>
      ) : null}

      {dirty ? (
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Числа пересчитаются после сохранения.
        </p>
      ) : null}
      <dl className="mt-3 grid gap-2 text-sm">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-start justify-between gap-3"
          >
            <dt className="min-w-0 text-zinc-600 dark:text-zinc-400">
              {row.label}
              {row.hint ? (
                <span className="block text-xs text-zinc-500">{row.hint}</span>
              ) : null}
            </dt>
            <dd className="font-semibold tabular-nums">
              {formatNumber(row.value)}
            </dd>
          </div>
        ))}
        <div className="flex items-center justify-between gap-3 border-t border-zinc-200 pt-2 dark:border-zinc-800">
          <dt className="font-semibold">Получат при ближайшем запуске</dt>
          <dd className="text-lg font-semibold text-emerald-700 tabular-nums dark:text-emerald-300">
            {formatNumber(reach.willReceive)}
          </dd>
        </div>
      </dl>

      {automation.enabled ? (
        <button
          type="button"
          onClick={() => onToggle(false)}
          disabled={disabled}
          className="mt-4 inline-flex min-h-10 w-full cursor-pointer items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-semibold hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          {pending ? "Выключаем..." : "Выключить автосценарий"}
        </button>
      ) : confirming ? (
        <div className="mt-4 rounded-md border border-emerald-500 p-3">
          <p className="text-sm font-semibold">
            Включить? Сейчас сообщение получат {formatNumber(reach.willReceive)}{" "}
            гостей, дальше — каждый новый гость, который подойдёт под правило,
            пока кампания идёт.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setConfirming(false);
                onToggle(true);
              }}
              disabled={disabled}
              className="inline-flex min-h-10 cursor-pointer items-center justify-center rounded-md bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 disabled:cursor-wait disabled:opacity-70"
            >
              Да, включить
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={disabled}
              className="inline-flex min-h-10 cursor-pointer items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-semibold hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Отмена
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={disabled || dirty || !hasText || finished}
          className="mt-4 inline-flex min-h-10 w-full cursor-pointer items-center justify-center rounded-md bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Включаем..." : "Включить автосценарий"}
        </button>
      )}
      {!automation.enabled && finished ? (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          Кампания завершена: включить автосценарий в ней нельзя.
        </p>
      ) : !automation.enabled && (dirty || !hasText) ? (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          Сначала сохраните текст и правило.
        </p>
      ) : null}

      <p className="mt-3 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
        Сообщения ставятся в очередь с {automation.sendHours.from}:00 до{" "}
        {automation.sendHours.to}:00 по времени клуба, раз в полчаса, не больше
        300 за раз. Черновик или запланированная кампания при включении начинает
        идти.
      </p>
      {automation.enabled && automation.enabledAt ? (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          Включён {formatDate(automation.enabledAt)}
          {automation.lastRunAt
            ? `; последняя проверка ${formatDate(automation.lastRunAt)}, поставлено ${formatNumber(automation.lastQueued ?? 0)}`
            : "; первая проверка в ближайшие полчаса"}
          .
        </p>
      ) : null}
    </div>
  );
}

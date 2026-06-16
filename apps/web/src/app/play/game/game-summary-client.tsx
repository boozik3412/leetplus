"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { GuestPortalGameSummary } from "@/lib/guest-portal";

type LoadState = "loading" | "ready" | "empty" | "error";

export function GameSummaryClient() {
  const [summary, setSummary] = useState<GuestPortalGameSummary | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    async function loadSummary() {
      try {
        const response = await fetch("/api/guest-portal/session/game-summary", {
          cache: "no-store",
        });

        if (!isActive) {
          return;
        }

        if (response.status === 401) {
          setLoadState("empty");
          setMessage("Сначала подтвердите телефон и выберите клуб.");
          return;
        }

        if (!response.ok) {
          throw new Error(await readResponseMessage(response));
        }

        setSummary((await response.json()) as GuestPortalGameSummary);
        setLoadState("ready");
      } catch (error) {
        if (!isActive) {
          return;
        }

        setLoadState("error");
        setMessage(
          error instanceof Error
            ? error.message
            : "Не удалось загрузить игровой экран.",
        );
      }
    }

    void loadSummary();

    return () => {
      isActive = false;
    };
  }, []);

  if (loadState === "loading") {
    return <GameShell body={<LoadingView />} />;
  }

  if (loadState === "empty" || !summary) {
    return (
      <GameShell
        body={
          <EmptySessionView
            title="Игровой профиль еще не открыт"
            message={message ?? "Подтвердите телефон, чтобы увидеть квесты."}
          />
        }
      />
    );
  }

  if (loadState === "error") {
    return (
      <GameShell
        body={
          <EmptySessionView
            title="Не удалось открыть игру"
            message={message ?? "Попробуйте обновить страницу чуть позже."}
          />
        }
      />
    );
  }

  return <GameShell body={<ReadyGameView summary={summary} />} />;
}

function GameShell({ body }: { body: ReactNode }) {
  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
          <Link href="/play" className="text-sm font-bold tracking-tight">
            LeetPlus Play
          </Link>
          <Link
            href="/play"
            className="rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:border-emerald-300 hover:text-white"
          >
            Выбрать клуб
          </Link>
        </header>
        {body}
      </div>
    </main>
  );
}

function LoadingView() {
  return (
    <div className="grid flex-1 place-items-center py-16">
      <div className="w-full max-w-sm rounded-lg border border-white/10 bg-white/5 p-5">
        <div className="h-3 w-24 rounded bg-white/10" />
        <div className="mt-4 h-8 w-48 rounded bg-white/10" />
        <div className="mt-6 space-y-2">
          <div className="h-3 rounded bg-white/10" />
          <div className="h-3 w-4/5 rounded bg-white/10" />
        </div>
      </div>
    </div>
  );
}

function EmptySessionView({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <section className="grid flex-1 place-items-center py-16">
      <div className="w-full max-w-xl rounded-lg border border-white/10 bg-white/[0.06] p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
          Игровой вход
        </p>
        <h1 className="mt-2 text-2xl font-black tracking-tight">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-300">{message}</p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Link
            href="/play"
            className="rounded-lg bg-emerald-300 px-4 py-3 text-center text-sm font-black text-zinc-950 transition hover:bg-emerald-200"
          >
            Зарегистрироваться
          </Link>
          <Link
            href="/"
            className="rounded-lg border border-white/15 px-4 py-3 text-center text-sm font-semibold text-zinc-200 transition hover:border-white/30 hover:text-white"
          >
            На главную
          </Link>
        </div>
      </div>
    </section>
  );
}

function ReadyGameView({ summary }: { summary: GuestPortalGameSummary }) {
  const guestPortalHref = useMemo(
    () =>
      `/guest/${encodeURIComponent(summary.tenant.slug)}/${encodeURIComponent(
        summary.store.publicSlug ?? summary.store.id,
      )}`,
    [summary.store.id, summary.store.publicSlug, summary.tenant.slug],
  );
  const activeReward = summary.rewards.ready[0] ?? null;
  const primaryAction = summary.nextActions[0] ?? null;

  return (
    <div className="py-5">
      <section className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
        <div className="rounded-lg border border-white/10 bg-white/[0.06] p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
                {summary.store.name}
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
                {summary.profile.displayName}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-300">
                Уровень {summary.profile.level} · {summary.profile.xp} XP ·{" "}
                {summary.account.stateLabel}
              </p>
            </div>
            <div className="w-full sm:w-44">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>До уровня</span>
                <span>{summary.profile.levelProgressPercent}%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-emerald-300"
                  style={{
                    width: `${clampPercent(summary.profile.levelProgressPercent)}%`,
                  }}
                />
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <Metric
              label="Бонусы"
              value={formatNumber(summary.loyalty.bonusBalance ?? 0)}
              note={summary.loyalty.bonusBalanceSource ?? "нет данных"}
            />
            <Metric
              label="Готово наград"
              value={formatNumber(summary.rewards.summary.ready)}
              note={`всего ${formatNumber(summary.rewards.summary.total)}`}
            />
            <Metric
              label="Игровое время"
              value={formatMinutes(summary.activity.playMinutes)}
              note={`${formatNumber(summary.activity.sessionsCount)} визитов`}
            />
          </div>
        </div>

        <div className="rounded-lg border border-emerald-300/30 bg-emerald-300 p-5 text-zinc-950">
          <p className="text-xs font-black uppercase tracking-wide">
            Следующий шаг
          </p>
          <h2 className="mt-2 text-xl font-black">
            {primaryAction?.title ?? "Продолжайте играть"}
          </h2>
          <p className="mt-2 text-sm leading-6 text-zinc-800">
            {primaryAction?.description ??
              "Как только появится новая награда или квест, он будет здесь."}
          </p>
          <Link
            href={guestPortalHref}
            className="mt-5 inline-flex rounded-lg bg-zinc-950 px-4 py-3 text-sm font-black text-white transition hover:bg-zinc-800"
          >
            Открыть кабинет
          </Link>
        </div>
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <ReadyRewardPanel reward={activeReward} />
        <MissionsPanel missions={summary.missions.featured} />
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <BattlePassPanel battlePass={summary.battlePass.active} />
        <ChannelsPanel summary={summary} />
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-zinc-950/50 p-3">
      <p className="text-xs text-zinc-400">{label}</p>
      <p className="mt-1 text-2xl font-black">{value}</p>
      <p className="mt-1 text-xs text-zinc-500">{note}</p>
    </div>
  );
}

function ReadyRewardPanel({
  reward,
}: {
  reward: GuestPortalGameSummary["rewards"]["ready"][number] | null;
}) {
  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.06] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
            Кошелек
          </p>
          <h2 className="mt-1 text-xl font-black">Готовая награда</h2>
        </div>
        {reward ? (
          <span className="rounded-full bg-emerald-300 px-2 py-1 text-xs font-black text-zinc-950">
            READY
          </span>
        ) : null}
      </div>

      {reward ? (
        <div className="mt-5">
          <p className="text-lg font-black">{reward.rewardLabel}</p>
          <p className="mt-2 text-sm text-zinc-300">
            {reward.sourceLabel ?? reward.sourceKind} ·{" "}
            {formatNumber(reward.rewardAmount)}
          </p>
          <div className="mt-4 rounded-lg border border-white/10 bg-zinc-950/60 p-4">
            <p className="text-xs text-zinc-400">Код для кассы</p>
            <p className="mt-1 break-all text-2xl font-black tracking-wider">
              {reward.rewardCode ?? reward.claimPayload ?? "покажите кабинет"}
            </p>
          </div>
          {reward.expiresAt ? (
            <p className="mt-3 text-xs text-zinc-400">
              Действует до {formatDate(reward.expiresAt)}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-5 text-sm leading-6 text-zinc-300">
          Готовых наград пока нет. Выполните миссию или дождитесь события в
          клубе.
        </p>
      )}
    </section>
  );
}

function MissionsPanel({
  missions,
}: {
  missions: GuestPortalGameSummary["missions"]["featured"];
}) {
  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.06] p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
        Миссии
      </p>
      <h2 className="mt-1 text-xl font-black">Ближайшие квесты</h2>
      <div className="mt-5 space-y-3">
        {missions.length ? (
          missions.map((mission) => (
            <article
              key={mission.id}
              className="rounded-lg border border-white/10 bg-zinc-950/45 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-black">
                    {mission.name}
                  </h3>
                  <p className="mt-1 text-xs text-zinc-400">
                    {mission.rewardLabel ?? `${mission.xpReward} XP`}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-black text-emerald-300">
                  {mission.progressPercent}%
                </span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-emerald-300"
                  style={{ width: `${clampPercent(mission.progressPercent)}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-zinc-400">
                {formatNumber(mission.progressCurrent)}
                {mission.progressTarget !== null
                  ? ` / ${formatNumber(mission.progressTarget)}`
                  : ""}{" "}
                выполнено
              </p>
            </article>
          ))
        ) : (
          <p className="text-sm leading-6 text-zinc-300">
            Активных миссий пока нет. Клуб может включить их в Guest Game Hub.
          </p>
        )}
      </div>
    </section>
  );
}

function BattlePassPanel({
  battlePass,
}: {
  battlePass: GuestPortalGameSummary["battlePass"]["active"];
}) {
  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.06] p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
        Battle Pass
      </p>
      {battlePass ? (
        <>
          <div className="mt-1 flex items-start justify-between gap-3">
            <h2 className="text-xl font-black">{battlePass.name}</h2>
            <span className="rounded-full bg-white/10 px-2 py-1 text-xs font-bold">
              {battlePass.progressPercent}%
            </span>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-emerald-300"
              style={{ width: `${clampPercent(battlePass.progressPercent)}%` }}
            />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Metric
              label="Уровень"
              value={formatNumber(battlePass.currentLevel)}
              note={
                battlePass.nextLevel
                  ? `следующий ${battlePass.nextLevel}`
                  : "максимум"
              }
            />
            <Metric
              label="До уровня"
              value={
                battlePass.xpToNextLevel !== null
                  ? `${formatNumber(battlePass.xpToNextLevel)} XP`
                  : "0 XP"
              }
              note={battlePass.nextRewardLabel ?? "награда не задана"}
            />
            <Metric
              label="Наград"
              value={formatNumber(battlePass.readyRewards)}
              note={`${formatNumber(
                battlePass.waitingApprovalRewards,
              )} ждут`}
            />
          </div>
        </>
      ) : (
        <p className="mt-4 text-sm leading-6 text-zinc-300">
          Сезон пока не запущен. Когда клуб включит Battle Pass, прогресс
          появится здесь.
        </p>
      )}
    </section>
  );
}

function ChannelsPanel({ summary }: { summary: GuestPortalGameSummary }) {
  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.06] p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
        Каналы
      </p>
      <h2 className="mt-1 text-xl font-black">Готовность связи</h2>
      <div className="mt-5 space-y-3">
        <ChannelRow
          label="Телефон"
          status={summary.communications.phoneConsentStatus}
          ready={summary.communications.phoneConsentStatus === "GRANTED"}
        />
        <ChannelRow
          label="Telegram"
          status={summary.communications.telegram.status}
          ready={summary.communications.telegram.readyForRewards}
        />
        <ChannelRow
          label="MAX"
          status={summary.communications.max.status}
          ready={summary.communications.max.readyForRewards}
        />
      </div>
    </section>
  );
}

function ChannelRow({
  label,
  status,
  ready,
}: {
  label: string;
  status: string;
  ready: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-zinc-950/45 px-3 py-3">
      <div>
        <p className="text-sm font-bold">{label}</p>
        <p className="text-xs text-zinc-400">{status}</p>
      </div>
      <span
        className={[
          "rounded-full px-2 py-1 text-xs font-black",
          ready
            ? "bg-emerald-300 text-zinc-950"
            : "bg-white/10 text-zinc-300",
        ].join(" ")}
      >
        {ready ? "готов" : "нужно связать"}
      </span>
    </div>
  );
}

async function readResponseMessage(response: Response) {
  try {
    const payload = (await response.json()) as { message?: unknown };
    return typeof payload.message === "string"
      ? payload.message
      : "Не удалось загрузить игровой экран.";
  } catch {
    return "Не удалось загрузить игровой экран.";
  }
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(100, Math.max(0, value));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatMinutes(value: number) {
  if (value < 60) {
    return `${formatNumber(value)} мин`;
  }

  return `${new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 1,
  }).format(value / 60)} ч`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

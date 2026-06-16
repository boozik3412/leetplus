"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type {
  GuestPortalCheckInResponse,
  GuestPortalGameSummary,
} from "@/lib/guest-portal";

type LoadState = "loading" | "ready" | "empty" | "error";
type SubmitState = "idle" | "submitting";
type GameNextAction = GuestPortalGameSummary["nextActions"][number];
type GameRewardWalletState =
  GuestPortalGameSummary["rewards"]["recent"][number]["walletState"];
type GameBonusHistoryItem =
  GuestPortalGameSummary["rewards"]["bonusHistory"]["items"][number];
type GameMission = GuestPortalGameSummary["missions"]["featured"][number];
type MissionBoardFilter = "AVAILABLE" | "ALMOST_DONE" | "REWARD_PENDING" | "ALL";

class EmptySessionError extends Error {}

export function GameSummaryClient() {
  const [summary, setSummary] = useState<GuestPortalGameSummary | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [checkInState, setCheckInState] = useState<SubmitState>("idle");
  const [checkInMessage, setCheckInMessage] = useState<string | null>(null);

  const refreshSummary = useCallback(async () => {
    const nextSummary = await requestGameSummary();
    setSummary(nextSummary);
    setLoadState("ready");
    setMessage(null);
  }, []);

  useEffect(() => {
    let isActive = true;

    async function loadInitialSummary() {
      try {
        const nextSummary = await requestGameSummary();

        if (!isActive) {
          return;
        }

        setSummary(nextSummary);
        setLoadState("ready");
        setMessage(null);
      } catch (error) {
        if (!isActive) {
          return;
        }

        if (error instanceof EmptySessionError) {
          setSummary(null);
          setLoadState("empty");
          setMessage(error.message);
          return;
        }

        setLoadState("error");
        setMessage(getErrorMessage(error, "Не удалось загрузить игровой экран."));
      }
    }

    void loadInitialSummary();

    return () => {
      isActive = false;
    };
  }, []);

  async function checkIn() {
    setCheckInState("submitting");
    setCheckInMessage(null);

    try {
      const response = await fetch("/api/guest-portal/session/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          note: "Чекин гостя из игрового экрана LeetPlus Play.",
        }),
      });

      if (!response.ok) {
        throw new Error(
          await readResponseMessage(response, "Не удалось выполнить чекин."),
        );
      }

      const data = (await response.json()) as GuestPortalCheckInResponse;
      const xpDelta = data.checkIn.processResult.summary.appliedXpDelta;
      const rewards = data.checkIn.processResult.summary.createdRewards;
      const rewardText = rewards
        ? ` Наград в очереди: ${formatNumber(rewards)}.`
        : "";

      setCheckInMessage(
        `Чекин подтвержден: ${formatDate(data.checkIn.checkedAt)}. XP: ${formatNumber(
          xpDelta,
        )}.${rewardText}`,
      );
      await refreshSummary();
    } catch (error) {
      setCheckInMessage(
        getErrorMessage(error, "Не удалось выполнить чекин."),
      );
    } finally {
      setCheckInState("idle");
    }
  }

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

  return (
    <GameShell
      body={
        <ReadyGameView
          summary={summary}
          onCheckIn={checkIn}
          isCheckingIn={checkInState === "submitting"}
          checkInMessage={checkInMessage}
        />
      }
    />
  );
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

function ReadyGameView({
  summary,
  onCheckIn,
  isCheckingIn,
  checkInMessage,
}: {
  summary: GuestPortalGameSummary;
  onCheckIn: () => void;
  isCheckingIn: boolean;
  checkInMessage: string | null;
}) {
  const guestPortalHref = useMemo(
    () =>
      `/guest/${encodeURIComponent(summary.tenant.slug)}/${encodeURIComponent(
        summary.store.publicSlug ?? summary.store.id,
      )}`,
    [summary.store.id, summary.store.publicSlug, summary.tenant.slug],
  );
  const primaryAction = summary.nextActions[0] ?? null;
  const primaryActionHref = primaryAction
    ? gameActionHref(primaryAction, guestPortalHref)
    : null;

  return (
    <div className="py-5">
      <section id="profile" className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
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
          <div className="mt-5 grid gap-2">
            {primaryActionHref ? (
              <Link
                href={primaryActionHref}
                className="rounded-lg border border-zinc-950/25 bg-white/45 px-4 py-3 text-center text-sm font-black text-zinc-950 transition hover:border-zinc-950/50 hover:bg-white/70"
              >
                {gameActionButtonLabel(primaryAction)}
              </Link>
            ) : null}
            <button
              type="button"
              onClick={onCheckIn}
              disabled={isCheckingIn}
              className="rounded-lg bg-zinc-950 px-4 py-3 text-sm font-black text-white transition hover:bg-zinc-800 disabled:cursor-wait disabled:opacity-70"
            >
              {isCheckingIn ? "Проверяем..." : "Чекин в клубе"}
            </button>
            <Link
              href={guestPortalHref}
              className="rounded-lg border border-zinc-950/25 px-4 py-3 text-center text-sm font-black text-zinc-950 transition hover:border-zinc-950/50"
            >
              Открыть кабинет
            </Link>
          </div>
          {checkInMessage ? (
            <p className="mt-3 text-xs font-semibold leading-5 text-zinc-800">
              {checkInMessage}
            </p>
          ) : (
            <p className="mt-3 text-xs leading-5 text-zinc-800">
              Чекин ищет активную сессию Langame и сразу пересчитывает прогресс.
            </p>
          )}
        </div>
      </section>

      <div className="mt-4">
        <NextActionsPanel
          actions={summary.nextActions}
          guestPortalHref={guestPortalHref}
        />
      </div>

      <section className="mt-4 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <RewardResultPanel summary={summary} />
        <MissionsPanel missions={summary.missions.featured} />
      </section>

      <section className="mt-4">
        <LootBoxesPanel lootBoxes={summary.lootBoxes.featured} />
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <BattlePassPanel battlePass={summary.battlePass.active} />
        <ChannelsPanel summary={summary} guestPortalHref={guestPortalHref} />
      </section>

      <section className="mt-4">
        <ActivityPanel activity={summary.activity} />
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

function NextActionsPanel({
  actions,
  guestPortalHref,
}: {
  actions: GuestPortalGameSummary["nextActions"];
  guestPortalHref: string;
}) {
  if (actions.length === 0) {
    return (
      <section className="rounded-lg border border-white/10 bg-white/[0.06] p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
          План игры
        </p>
        <h2 className="mt-1 text-xl font-black">Свободная игра</h2>
        <p className="mt-3 text-sm leading-6 text-zinc-300">
          Как только появятся награды, квесты или новый сезонный шаг, они
          появятся здесь.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.06] p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
            План игры
          </p>
          <h2 className="mt-1 text-xl font-black">Что сделать дальше</h2>
        </div>
        <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-zinc-300">
          {formatNumber(actions.length)} шага
        </span>
      </div>
      <div className="mt-5 grid gap-3 lg:grid-cols-3">
        {actions.map((action) => {
          const href = gameActionHref(action, guestPortalHref);

          return (
            <article
              key={action.id}
              className="rounded-lg border border-white/10 bg-zinc-950/45 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    {action.statusLabel}
                  </p>
                  <h3 className="mt-1 truncate text-sm font-black text-white">
                    {action.title}
                  </h3>
                </div>
                <span
                  className={[
                    "shrink-0 rounded-full px-2 py-1 text-xs font-black",
                    actionPriorityClass(action.priority),
                  ].join(" ")}
                >
                  {actionPriorityLabel(action.priority)}
                </span>
              </div>
              <p className="mt-3 text-sm leading-5 text-zinc-300">
                {action.description}
              </p>
              {action.progressPercent !== null ? (
                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs text-zinc-500">
                    <span>прогресс</span>
                    <span>{Math.round(action.progressPercent)}%</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-emerald-300"
                      style={{ width: `${clampPercent(action.progressPercent)}%` }}
                    />
                  </div>
                </div>
              ) : null}
              <Link
                href={href}
                className="mt-4 flex min-h-10 items-center justify-center rounded-lg border border-emerald-300/35 px-3 text-sm font-black text-emerald-100 transition hover:border-emerald-300 hover:bg-emerald-300/10"
              >
                {gameActionButtonLabel(action)}
              </Link>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function RewardResultPanel({ summary }: { summary: GuestPortalGameSummary }) {
  const reward = summary.rewards.ready[0] ?? null;
  const recentRewards = summary.rewards.recent;
  const latestBonus = summary.rewards.latestBonus;
  const bonusHistory = summary.rewards.bonusHistory;
  const bonusBalance = summary.loyalty.bonusBalance;
  const hasRewardResult = Boolean(
    reward || latestBonus || recentRewards.length || bonusHistory.items.length,
  );

  return (
    <section
      id="rewards"
      className="rounded-lg border border-white/10 bg-white/[0.06] p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
            Кошелек
          </p>
          <h2 className="mt-1 text-xl font-black">Результат квеста</h2>
        </div>
        {latestBonus ? (
          <span
            className={[
              "rounded-full px-2 py-1 text-xs font-black",
              latestBonus.status === "CONFIRMED"
                ? "bg-emerald-300 text-zinc-950"
                : "bg-white/10 text-zinc-200",
            ].join(" ")}
          >
            {latestBonus.statusLabel}
          </span>
        ) : reward ? (
          <span className="rounded-full bg-emerald-300 px-2 py-1 text-xs font-black text-zinc-950">
            READY
          </span>
        ) : null}
      </div>

      {hasRewardResult ? (
        <div className="mt-5 space-y-4">
          {latestBonus ? (
            <div className="rounded-lg border border-emerald-300/25 bg-emerald-300/[0.08] p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-200">
                Последний бонус
              </p>
              <div className="mt-2 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-lg font-black text-white">
                    {latestBonus.title}
                  </p>
                  <p className="mt-1 text-sm text-zinc-300">
                    {latestBonus.sourceLabel ?? latestBonus.sourceKind}
                    {latestBonus.storeName
                      ? ` · ${latestBonus.storeName}`
                      : ""}
                  </p>
                </div>
                <span
                  className={[
                    "shrink-0 text-xl font-black",
                    latestBonus.amount >= 0
                      ? "text-emerald-300"
                      : "text-rose-300",
                  ].join(" ")}
                >
                  {formatSignedNumber(latestBonus.amount)}
                </span>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <div className="rounded-lg border border-white/10 bg-zinc-950/50 p-3">
                  <p className="text-xs text-zinc-400">Статус</p>
                  <p className="mt-1 text-sm font-black">
                    {latestBonus.statusLabel}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {formatDate(latestBonus.confirmedAt ?? latestBonus.occurredAt)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-zinc-950/50 p-3">
                  <p className="text-xs text-zinc-400">Баланс после</p>
                  <p className="mt-1 text-sm font-black">
                    {latestBonus.balanceAfter !== null
                      ? formatNumber(latestBonus.balanceAfter)
                      : bonusBalance !== null
                        ? formatNumber(bonusBalance)
                        : "обновляется"}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {bonusBalance !== null
                      ? "текущий бонусный баланс"
                      : "ждем подтверждения Langame"}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {reward ? (
            <div>
              <p className="text-lg font-black">{reward.rewardLabel}</p>
              <p className="mt-2 text-sm text-zinc-300">
                {reward.sourceLabel ?? reward.sourceKind} ·{" "}
                {formatNumber(reward.rewardAmount)}
              </p>
              <div className="mt-4 rounded-lg border border-white/10 bg-zinc-950/60 p-4">
                <p className="text-xs text-zinc-400">Код для кассы</p>
                <p className="mt-1 break-all text-2xl font-black tracking-wider">
                  {reward.rewardCode ??
                    reward.claimPayload ??
                    "покажите кабинет"}
                </p>
              </div>
              {reward.expiresAt ? (
                <p className="mt-3 text-xs text-zinc-400">
                  Действует до {formatDate(reward.expiresAt)}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="mt-4 rounded-lg border border-white/10 bg-zinc-950/60 p-4">
            <p className="text-xs text-zinc-400">Бонусный баланс</p>
            <p className="mt-1 text-2xl font-black">
              {bonusBalance !== null ? formatNumber(bonusBalance) : "нет данных"}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              {summary.loyalty.bonusBalanceSource ?? "ожидаем первый snapshot"}
            </p>
          </div>

          {bonusHistory.items.length ? (
            <BonusHistoryPanel history={bonusHistory} />
          ) : null}

          {recentRewards.length ? (
            <div className="rounded-lg border border-white/10 bg-zinc-950/45 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Кошелек наград
                  </p>
                  <h3 className="mt-1 text-sm font-black text-white">
                    Последние награды
                  </h3>
                </div>
                <span className="rounded-full bg-white/10 px-2 py-1 text-xs font-black text-zinc-200">
                  {formatNumber(recentRewards.length)}
                </span>
              </div>
              <div className="mt-3 space-y-2">
                {recentRewards.map((item) => {
                  const readyCode =
                    item.walletState === "READY"
                      ? item.rewardCode ?? item.claimPayload
                      : null;

                  return (
                    <div
                      key={item.id}
                      className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-white">
                            {item.rewardLabel}
                          </p>
                          <p className="mt-1 text-xs text-zinc-500">
                            {item.sourceLabel ?? rewardSourceKindLabel(item.sourceKind)}
                            {" · "}
                            {formatDate(item.qualifiedAt)}
                          </p>
                        </div>
                        <span
                          className={[
                            "shrink-0 rounded-full px-2 py-1 text-xs font-black",
                            walletStateBadgeClass(item.walletState),
                          ].join(" ")}
                        >
                          {walletStateLabel(item.walletState)}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-col gap-1 text-xs text-zinc-400 sm:flex-row sm:items-center sm:justify-between">
                        <span>{formatNumber(item.rewardAmount)} · {item.rewardType}</span>
                        {readyCode ? (
                          <span className="font-black text-emerald-200">
                            код: {readyCode}
                          </span>
                        ) : item.expiresAt ? (
                          <span>до {formatDate(item.expiresAt)}</span>
                        ) : (
                          <span>{walletStateHint(item.walletState)}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
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

function BonusHistoryPanel({
  history,
}: {
  history: GuestPortalGameSummary["rewards"]["bonusHistory"];
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-zinc-950/45 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Langame ledger
          </p>
          <h3 className="mt-1 text-sm font-black text-white">
            История начислений
          </h3>
        </div>
        <span className="rounded-full bg-white/10 px-2 py-1 text-xs font-black text-zinc-200">
          {formatNumber(history.items.length)}
        </span>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <BonusHistoryMetric
          label="Начислено"
          value={formatSignedNumber(history.summary.confirmedAmount)}
        />
        <BonusHistoryMetric
          label="В очереди"
          value={formatSignedNumber(history.summary.pendingAmount)}
        />
        <BonusHistoryMetric
          label="Проверки"
          value={formatNumber(history.summary.failed)}
        />
      </div>
      <div className="mt-4 space-y-2">
        {history.items.map((item) => (
          <div
            key={item.id}
            className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-white">
                  {item.title}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {item.sourceLabel ?? rewardSourceKindLabel(item.sourceKind)}
                  {item.storeName ? ` · ${item.storeName}` : ""}
                </p>
              </div>
              <span
                className={[
                  "shrink-0 rounded-full px-2 py-1 text-xs font-black",
                  bonusStatusBadgeClass(item.status),
                ].join(" ")}
              >
                {item.statusLabel}
              </span>
            </div>
            <div className="mt-3 flex flex-col gap-1 text-xs text-zinc-400 sm:flex-row sm:items-center sm:justify-between">
              <span
                className={
                  item.amount >= 0 ? "text-emerald-200" : "text-rose-200"
                }
              >
                {formatSignedNumber(item.amount)}
              </span>
              <span>
                {bonusHistoryDate(item)}
                {item.balanceAfter !== null
                  ? ` · баланс ${formatNumber(item.balanceAfter)}`
                  : ""}
              </span>
            </div>
            {item.status !== "CONFIRMED" ? (
              <p className="mt-2 text-xs leading-5 text-zinc-500">
                {bonusStatusHint(item.status)}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function BonusHistoryMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-zinc-950/50 p-3">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-sm font-black text-white">{value}</p>
    </div>
  );
}

function LootBoxesPanel({
  lootBoxes,
}: {
  lootBoxes: GuestPortalGameSummary["lootBoxes"]["featured"];
}) {
  const [openedLootBoxId, setOpenedLootBoxId] = useState<string | null>(null);

  return (
    <section
      id="lootBoxes"
      className="rounded-lg border border-white/10 bg-white/[0.06] p-5"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
            Лутбоксы
          </p>
          <h2 className="mt-1 text-xl font-black">Открыть приз</h2>
        </div>
        <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-zinc-300">
          {formatNumber(lootBoxes.length)} активных
        </span>
      </div>

      {lootBoxes.length ? (
        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          {lootBoxes.map((lootBox) => {
            const latestReward = lootBox.latestReward;
            const isOpened = openedLootBoxId === lootBox.id;

            return (
              <article
                key={lootBox.id}
                className={[
                  "rounded-lg border p-4 transition",
                  latestReward
                    ? "border-emerald-300/30 bg-emerald-300/[0.07]"
                    : "border-white/10 bg-zinc-950/45",
                ].join(" ")}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-black">
                      {lootBox.name}
                    </h3>
                    <p className="mt-1 text-xs text-zinc-400">
                      {lootBox.rewardLabel ??
                        "Награда определяется правилами клуба"}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-white/10 px-2 py-1 text-xs font-black text-zinc-200">
                    {lootBox.triggerKind}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  <MiniMetric
                    label="Сработал"
                    value={formatNumber(lootBox.openedCount)}
                  />
                  <MiniMetric
                    label="К выдаче"
                    value={formatNumber(lootBox.readyRewards)}
                  />
                  <MiniMetric
                    label="Получено"
                    value={formatNumber(lootBox.redeemedRewards)}
                  />
                </div>

                {latestReward ? (
                  <div className="mt-4 rounded-lg border border-emerald-300/25 bg-zinc-950/50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-200">
                          Последний результат
                        </p>
                        <p className="mt-1 text-xs text-zinc-500">
                          {formatDate(latestReward.qualifiedAt)}
                        </p>
                      </div>
                      <span className="rounded-full bg-white/10 px-2 py-1 text-xs font-black text-zinc-200">
                        {walletStateLabel(latestReward.walletState)}
                      </span>
                    </div>

                    {isOpened ? (
                      <div className="mt-3 rounded-lg border border-emerald-200/25 bg-emerald-300/[0.08] p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-200">
                          Выпала награда
                        </p>
                        <p className="mt-1 text-lg font-black text-white">
                          {latestReward.rewardLabel}
                        </p>
                        <p className="mt-2 text-xs leading-5 text-zinc-300">
                          {walletStateHint(latestReward.walletState)}
                          {latestReward.expiresAt
                            ? ` До ${formatDate(latestReward.expiresAt)}.`
                            : ""}
                        </p>
                        {latestReward.rewardCode &&
                        latestReward.walletState === "READY" ? (
                          <p className="mt-3 rounded-lg border border-dashed border-emerald-200/50 px-3 py-2 text-sm font-black text-emerald-50">
                            Код кассиру: {latestReward.rewardCode}
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setOpenedLootBoxId(lootBox.id)}
                        className="mt-3 w-full rounded-lg bg-emerald-300 px-3 py-2 text-sm font-black text-zinc-950 transition hover:bg-emerald-200"
                        aria-expanded={false}
                      >
                        Открыть лутбокс
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="mt-4 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs leading-5 text-zinc-400">
                    Лутбокс откроется после подходящего события в клубе:
                    сессии, квеста или правила Guest Game Hub.
                  </p>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <p className="mt-5 text-sm leading-6 text-zinc-300">
          Лутбоксы появятся после настройки правил старта сессии или клубных
          событий.
        </p>
      )}
    </section>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-zinc-950/45 p-2">
      <p className="text-[11px] text-zinc-500">{label}</p>
      <p className="mt-1 text-sm font-black text-white">{value}</p>
    </div>
  );
}

function MissionsPanel({
  missions,
}: {
  missions: GuestPortalGameSummary["missions"]["featured"];
}) {
  const [activeFilter, setActiveFilter] =
    useState<MissionBoardFilter>("AVAILABLE");
  const filterOptions = useMemo(
    () => buildMissionFilterOptions(missions),
    [missions],
  );
  const visibleMissions = useMemo(
    () =>
      missions.filter((mission) => missionMatchesFilter(mission, activeFilter)),
    [activeFilter, missions],
  );

  return (
    <section
      id="missions"
      className="rounded-lg border border-white/10 bg-white/[0.06] p-5"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
        Миссии
      </p>
      <div className="mt-1 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-black">Ближайшие квесты</h2>
          <p className="mt-1 text-xs leading-5 text-zinc-400">
            Выберите цель: новый квест, почти готовый прогресс или награду.
          </p>
        </div>
        {missions.length ? (
          <span className="shrink-0 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-zinc-200">
            {visibleMissions.length} из {missions.length}
          </span>
        ) : null}
      </div>
      {missions.length ? (
        <MissionFilterTabs
          activeFilter={activeFilter}
          options={filterOptions}
          onChange={setActiveFilter}
        />
      ) : null}
      <div className="mt-5 space-y-3">
        {missions.length ? (
          visibleMissions.length ? (
            visibleMissions.map((mission) => {
              const activeStep =
                mission.questSteps.find((step) => step.current) ??
                mission.questSteps.find((step) => !step.completed) ??
                null;
              const progressTarget = mission.progressTarget ?? 1;
              const progressUnit = mission.progressUnit
                ? ` ${mission.progressUnit}`
                : "";
              const progressLabel =
                mission.progressPercent >= 100
                  ? `Выполнено: ${formatNumber(
                      mission.progressCurrent,
                    )}/${formatNumber(progressTarget)}${progressUnit}`
                  : `Прогресс: ${formatNumber(
                      mission.progressCurrent,
                    )}/${formatNumber(progressTarget)}${progressUnit}`;

              return (
                <article
                  key={mission.id}
                  className={missionCardClass(mission)}
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
                    <div className="shrink-0 text-right">
                      <span className="block text-sm font-black text-emerald-300">
                        {Math.round(mission.progressPercent)}%
                      </span>
                      <span className={missionStatusBadgeClass(mission)}>
                        {missionStateLabel(mission)}
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-emerald-300"
                      style={{
                        width: `${clampPercent(mission.progressPercent)}%`,
                      }}
                    />
                  </div>
                  <div className="mt-3 flex flex-col gap-2 text-xs text-zinc-400 sm:flex-row sm:items-center sm:justify-between">
                    <span>{progressLabel}</span>
                    <span className="font-bold text-zinc-200">
                      +{formatNumber(mission.xpReward)} XP
                    </span>
                  </div>

                  {activeStep ? (
                    <div className="mt-4 rounded-lg border border-emerald-300/25 bg-emerald-300/[0.08] p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-200">
                        Текущий шаг
                      </p>
                      <p className="mt-1 text-sm font-black text-white">
                        {activeStep.title}
                      </p>
                      <p className="mt-1 text-xs text-emerald-100/80">
                        {formatMissionStepProgress(activeStep)}
                      </p>
                    </div>
                  ) : null}

                  {mission.questSteps.length ? (
                    <div className="mt-3 grid gap-2">
                      {mission.questSteps.map((step, index) => (
                        <div
                          key={step.id}
                          className={[
                            "flex min-h-12 items-center gap-3 rounded-lg border px-3 py-2",
                            step.completed
                              ? "border-emerald-300/30 bg-emerald-300/[0.07]"
                              : step.current
                                ? "border-emerald-300/25 bg-white/[0.06]"
                                : "border-white/10 bg-white/[0.03]",
                          ].join(" ")}
                        >
                          <span
                            className={[
                              "grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-black",
                              step.completed
                                ? "bg-emerald-300 text-zinc-950"
                                : step.current
                                  ? "bg-white text-zinc-950"
                                  : "bg-white/10 text-zinc-300",
                            ].join(" ")}
                          >
                            {index + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-white">
                              {step.title}
                            </p>
                            <p className="text-xs text-zinc-500">
                              {formatMissionStepProgress(step)}
                            </p>
                          </div>
                          <span className="shrink-0 text-xs font-black text-zinc-300">
                            {missionStepStateLabel(step)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="mt-3 flex flex-col gap-1 text-xs text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
                    <span>{missionRewardNote(mission)}</span>
                    {mission.periodTo ? (
                      <span>до {formatDate(mission.periodTo)}</span>
                    ) : null}
                  </div>
                </article>
              );
            })
          ) : (
            <p className="rounded-lg border border-white/10 bg-zinc-950/45 p-4 text-sm leading-6 text-zinc-300">
              В этой вкладке квестов пока нет. Откройте другую группу или
              дождитесь нового события клуба.
            </p>
          )
        ) : (
          <p className="text-sm leading-6 text-zinc-300">
            Активных миссий пока нет. Клуб может включить их в Guest Game Hub.
          </p>
        )}
      </div>
    </section>
  );
}

function MissionFilterTabs({
  activeFilter,
  options,
  onChange,
}: {
  activeFilter: MissionBoardFilter;
  options: Array<{ key: MissionBoardFilter; label: string; count: number }>;
  onChange: (filter: MissionBoardFilter) => void;
}) {
  return (
    <div
      aria-label="Фильтр квестов"
      className="mt-4 grid grid-cols-2 gap-2 rounded-lg border border-white/10 bg-zinc-950/35 p-1 sm:grid-cols-4"
      role="tablist"
    >
      {options.map((option) => {
        const active = option.key === activeFilter;

        return (
          <button
            key={option.key}
            aria-selected={active}
            className={[
              "min-h-11 rounded-md px-3 py-2 text-left text-xs font-bold transition",
              active
                ? "bg-emerald-300 text-zinc-950"
                : "bg-transparent text-zinc-300 hover:bg-white/10 hover:text-white",
            ].join(" ")}
            onClick={() => onChange(option.key)}
            role="tab"
            type="button"
          >
            <span className="block truncate">{option.label}</span>
            <span className="mt-1 block text-[11px] opacity-75">
              {option.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function buildMissionFilterOptions(missions: GameMission[]) {
  return [
    {
      key: "AVAILABLE" as const,
      label: "Доступные",
      count: missions.filter((mission) =>
        missionMatchesFilter(mission, "AVAILABLE"),
      ).length,
    },
    {
      key: "ALMOST_DONE" as const,
      label: "Почти готовы",
      count: missions.filter((mission) =>
        missionMatchesFilter(mission, "ALMOST_DONE"),
      ).length,
    },
    {
      key: "REWARD_PENDING" as const,
      label: "Награда",
      count: missions.filter((mission) =>
        missionMatchesFilter(mission, "REWARD_PENDING"),
      ).length,
    },
    {
      key: "ALL" as const,
      label: "Все",
      count: missions.length,
    },
  ];
}

function missionMatchesFilter(
  mission: GameMission,
  filter: MissionBoardFilter,
) {
  switch (filter) {
    case "AVAILABLE":
      return mission.progressPercent < 100;
    case "ALMOST_DONE":
      return mission.progressPercent >= 70 && mission.progressPercent < 100;
    case "REWARD_PENDING":
      return mission.progressPercent >= 100;
    case "ALL":
      return true;
    default:
      return false;
  }
}

function missionCardClass(mission: GameMission) {
  return [
    "rounded-lg border p-4",
    mission.progressPercent >= 100
      ? "border-emerald-300/30 bg-emerald-300/[0.07]"
      : mission.progressPercent >= 70
        ? "border-amber-300/25 bg-amber-300/[0.06]"
        : "border-white/10 bg-zinc-950/45",
  ].join(" ");
}

function missionStatusBadgeClass(mission: GameMission) {
  return [
    "mt-1 block rounded-full px-2 py-1 text-xs font-bold",
    mission.progressPercent >= 100
      ? "bg-emerald-300 text-zinc-950"
      : mission.progressPercent >= 70
        ? "bg-amber-300/20 text-amber-100"
        : "bg-white/10 text-zinc-200",
  ].join(" ");
}

function missionStateLabel(mission: GameMission) {
  if (mission.progressPercent >= 100) {
    return mission.manualApprovalRequired
      ? "ждет подтверждения"
      : "квест выполнен";
  }

  return "в процессе";
}

function missionRewardNote(mission: GameMission) {
  if (mission.manualApprovalRequired) {
    return "Награда появится после подтверждения команды.";
  }

  return "Бонус начисляется автоматически после выполнения.";
}

function missionStepStateLabel(
  step: GameMission["questSteps"][number],
) {
  if (step.completed) {
    return "готово";
  }

  return step.current ? "сейчас" : "далее";
}

function formatMissionStepProgress(
  step: GameMission["questSteps"][number],
) {
  return `${formatNumber(step.progressCurrent)} / ${formatNumber(step.target)}`;
}

function BattlePassPanel({
  battlePass,
}: {
  battlePass: GuestPortalGameSummary["battlePass"]["active"];
}) {
  return (
    <section
      id="battlePass"
      className="rounded-lg border border-white/10 bg-white/[0.06] p-5"
    >
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
          {battlePass.levels.length ? (
            <div className="mt-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-black text-white">
                  Дорожка уровней
                </h3>
                <span className="rounded-full bg-white/10 px-2 py-1 text-xs font-bold text-zinc-300">
                  {formatNumber(battlePass.levels.length)} рядом
                </span>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {battlePass.levels.map((level) => {
                  const rewardText =
                    level.freeReward ??
                    level.premiumReward ??
                    `${formatNumber(level.xp)} XP`;

                  return (
                    <div
                      key={level.level}
                      className={[
                        "rounded-lg border px-3 py-3",
                        level.current
                          ? "border-emerald-300/40 bg-emerald-300/[0.09]"
                          : level.reached
                            ? "border-white/10 bg-white/[0.06]"
                            : level.next
                              ? "border-amber-300/35 bg-amber-300/[0.08]"
                              : "border-white/10 bg-zinc-950/45",
                      ].join(" ")}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                            Уровень {formatNumber(level.level)}
                          </p>
                          <p className="mt-1 text-sm font-black text-white">
                            {rewardText}
                          </p>
                        </div>
                        <span
                          className={[
                            "shrink-0 rounded-full px-2 py-1 text-xs font-black",
                            level.current
                              ? "bg-emerald-300 text-zinc-950"
                              : level.reached
                                ? "bg-white/10 text-zinc-200"
                                : level.next
                                  ? "bg-amber-300 text-zinc-950"
                                  : "bg-white/10 text-zinc-400",
                          ].join(" ")}
                        >
                          {battlePassLevelLabel(level)}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-col gap-1 text-xs text-zinc-500">
                        <span>{formatNumber(level.xp)} XP</span>
                        {level.freeReward && level.premiumReward ? (
                          <span>premium: {level.premiumReward}</span>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
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

function battlePassLevelLabel(
  level: NonNullable<
    GuestPortalGameSummary["battlePass"]["active"]
  >["levels"][number],
) {
  if (level.current) {
    return "сейчас";
  }

  if (level.reached) {
    return "пройден";
  }

  return level.next ? "далее" : "закрыт";
}

function ActivityPanel({
  activity,
}: {
  activity: GuestPortalGameSummary["activity"];
}) {
  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.06] p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
            Активность
          </p>
          <h2 className="mt-1 text-xl font-black">Почему изменился прогресс</h2>
        </div>
        {activity.lastActivityAt ? (
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-zinc-300">
            обновлено {formatDate(activity.lastActivityAt)}
          </span>
        ) : null}
      </div>

      {activity.recent.length ? (
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {activity.recent.map((item) => (
            <article
              key={item.id}
              className="rounded-lg border border-white/10 bg-zinc-950/45 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    {activityKindLabel(item.kind)}
                  </p>
                  <h3 className="mt-1 truncate text-sm font-black text-white">
                    {item.title}
                  </h3>
                </div>
                {item.xpDelta !== null ? (
                  <span
                    className={[
                      "shrink-0 rounded-full px-2 py-1 text-xs font-black",
                      item.xpDelta >= 0
                        ? "bg-emerald-300 text-zinc-950"
                        : "bg-rose-300 text-zinc-950",
                    ].join(" ")}
                  >
                    {formatSignedNumber(item.xpDelta)} XP
                  </span>
                ) : null}
              </div>
              {item.description ? (
                <p className="mt-2 text-sm leading-5 text-zinc-300">
                  {item.description}
                </p>
              ) : null}
              <div className="mt-3 flex flex-col gap-1 text-xs text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
                <span>{formatDate(item.occurredAt)}</span>
                {item.storeName ? <span>{item.storeName}</span> : null}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-5 text-sm leading-6 text-zinc-300">
          История появится после первого чекина, XP-события или операции в
          клубе.
        </p>
      )}
    </section>
  );
}

function activityKindLabel(
  kind: GuestPortalGameSummary["activity"]["recent"][number]["kind"],
) {
  const labels = {
    SESSION: "сессия",
    LOG: "событие",
    TRANSACTION: "баланс",
    GAME_EVENT: "XP",
  } satisfies Record<
    GuestPortalGameSummary["activity"]["recent"][number]["kind"],
    string
  >;

  return labels[kind];
}

function rewardSourceKindLabel(
  kind: GuestPortalGameSummary["rewards"]["recent"][number]["sourceKind"],
) {
  const labels = {
    LOOT_BOX: "лутбокс",
    MISSION: "квест",
    BATTLE_PASS: "Battle Pass",
    MANUAL: "ручная награда",
  } satisfies Record<
    GuestPortalGameSummary["rewards"]["recent"][number]["sourceKind"],
    string
  >;

  return labels[kind];
}

function bonusStatusBadgeClass(status: GameBonusHistoryItem["status"]) {
  const classes = {
    PENDING: "bg-amber-300 text-zinc-950",
    PROCESSING: "bg-sky-300 text-zinc-950",
    CONFIRMED: "bg-emerald-300 text-zinc-950",
    FAILED: "bg-rose-300/20 text-rose-100",
    CANCELED: "bg-white/10 text-zinc-400",
    UNKNOWN: "bg-white/10 text-zinc-300",
  } satisfies Record<GameBonusHistoryItem["status"], string>;

  return classes[status];
}

function bonusStatusHint(status: GameBonusHistoryItem["status"]) {
  const hints = {
    PENDING: "Начисление уже поставлено в очередь и уйдет в Langame автоматически.",
    PROCESSING: "Начисление сейчас отправляется в Langame.",
    CONFIRMED: "Бонус подтвержден Langame и учтен в игровом балансе.",
    FAILED: "Начисление не потеряно: LeetPlus проверит его повторно или покажет в админке.",
    CANCELED: "Начисление отменено до подтверждения в Langame.",
    UNKNOWN: "Статус проверяется, начисление остается в журнале LeetPlus.",
  } satisfies Record<GameBonusHistoryItem["status"], string>;

  return hints[status];
}

function bonusHistoryDate(item: GameBonusHistoryItem) {
  return formatDate(item.confirmedAt ?? item.processedAt ?? item.occurredAt);
}

function actionPriorityLabel(priority: GameNextAction["priority"]) {
  const labels = {
    HIGH: "важно",
    MEDIUM: "скоро",
    LOW: "потом",
  } satisfies Record<GameNextAction["priority"], string>;

  return labels[priority];
}

function actionPriorityClass(priority: GameNextAction["priority"]) {
  const classes = {
    HIGH: "bg-emerald-300 text-zinc-950",
    MEDIUM: "bg-amber-300 text-zinc-950",
    LOW: "bg-white/10 text-zinc-300",
  } satisfies Record<GameNextAction["priority"], string>;

  return classes[priority];
}

function walletStateLabel(state: GameRewardWalletState) {
  const labels = {
    WAITING_APPROVAL: "Ждет проверки",
    READY: "Можно забрать",
    REDEEMED: "Выдано",
    CANCELED: "Отменено",
    EXPIRED: "Сгорело",
  } satisfies Record<GameRewardWalletState, string>;

  return labels[state];
}

function walletStateBadgeClass(state: GameRewardWalletState) {
  const classes = {
    WAITING_APPROVAL: "bg-amber-300 text-zinc-950",
    READY: "bg-emerald-300 text-zinc-950",
    REDEEMED: "bg-white/10 text-zinc-200",
    CANCELED: "bg-rose-300/20 text-rose-100",
    EXPIRED: "bg-white/10 text-zinc-400",
  } satisfies Record<GameRewardWalletState, string>;

  return classes[state];
}

function walletStateHint(state: GameRewardWalletState) {
  const hints = {
    WAITING_APPROVAL: "Сотрудник клуба проверит результат и подготовит выдачу.",
    READY: "Покажите код кассиру в клубе, чтобы получить награду.",
    REDEEMED: "Награда уже выдана и отмечена в LeetPlus.",
    CANCELED: "Награда отменена сотрудником клуба.",
    EXPIRED: "Срок действия награды закончился.",
  } satisfies Record<GameRewardWalletState, string>;

  return hints[state];
}

function ChannelsPanel({
  summary,
  guestPortalHref,
}: {
  summary: GuestPortalGameSummary;
  guestPortalHref: string;
}) {
  const communicationsHref = `${guestPortalHref}#communications`;
  const hasRewardChannel =
    summary.communications.telegram.readyForRewards ||
    summary.communications.max.readyForRewards;

  return (
    <section
      id="communications"
      className="rounded-lg border border-white/10 bg-white/[0.06] p-5"
    >
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
      <div className="mt-4 rounded-lg border border-white/10 bg-zinc-950/45 p-3">
        <p className="text-sm font-bold text-white">
          {hasRewardChannel
            ? "Игровые уведомления готовы к выдаче наград."
            : "Награды можно забрать по коду кассиру, а уведомления включаются в кабинете."}
        </p>
        <Link
          href={communicationsHref}
          className="mt-3 flex min-h-10 items-center justify-center rounded-lg border border-emerald-300/35 px-3 text-sm font-black text-emerald-100 transition hover:border-emerald-300"
        >
          Открыть каналы
        </Link>
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

function gameActionHref(action: GameNextAction, guestPortalHref: string) {
  if (action.kind === "MATCH_LANGAME") {
    return `${guestPortalHref}#langame-match`;
  }

  return `#${action.anchor}`;
}

function gameActionButtonLabel(action: GameNextAction) {
  const labels = {
    CLAIM_REWARD: "Забрать награду",
    OPEN_LOOT_BOX: "Открыть приз",
    FINISH_MISSION: "Открыть квест",
    BATTLE_PASS: "Открыть сезон",
    MATCH_LANGAME: "Связать Langame",
  } satisfies Record<GameNextAction["kind"], string>;

  return labels[action.kind];
}

async function requestGameSummary() {
  const response = await fetch("/api/guest-portal/session/game-summary", {
    cache: "no-store",
  });

  if (response.status === 401) {
    throw new EmptySessionError("Сначала подтвердите телефон и выберите клуб.");
  }

  if (!response.ok) {
    throw new Error(
      await readResponseMessage(response, "Не удалось загрузить игровой экран."),
    );
  }

  return (await response.json()) as GuestPortalGameSummary;
}

async function readResponseMessage(
  response: Response,
  fallback = "Не удалось загрузить игровой экран.",
) {
  try {
    const payload = (await response.json()) as { message?: unknown };
    return typeof payload.message === "string" ? payload.message : fallback;
  } catch {
    return fallback;
  }
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
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

function formatSignedNumber(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 0,
    signDisplay: "always",
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

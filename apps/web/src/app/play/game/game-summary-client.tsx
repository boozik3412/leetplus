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
          <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
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

      <section className="mt-4 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <RewardResultPanel summary={summary} />
        <MissionsPanel missions={summary.missions.featured} />
      </section>

      <section className="mt-4">
        <LootBoxesPanel lootBoxes={summary.lootBoxes.featured} />
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <BattlePassPanel battlePass={summary.battlePass.active} />
        <ChannelsPanel summary={summary} />
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

function RewardResultPanel({ summary }: { summary: GuestPortalGameSummary }) {
  const reward = summary.rewards.ready[0] ?? null;
  const latestBonus = summary.rewards.latestBonus;
  const bonusBalance = summary.loyalty.bonusBalance;
  const hasRewardResult = Boolean(reward || latestBonus);

  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.06] p-5">
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

function LootBoxesPanel({
  lootBoxes,
}: {
  lootBoxes: GuestPortalGameSummary["lootBoxes"]["featured"];
}) {
  const [openedLootBoxId, setOpenedLootBoxId] = useState<string | null>(null);

  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.06] p-5">
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
  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.06] p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
        Миссии
      </p>
      <h2 className="mt-1 text-xl font-black">Ближайшие квесты</h2>
      <div className="mt-5 space-y-3">
        {missions.length ? (
          missions.map((mission) => {
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
                  <div className="shrink-0 text-right">
                    <span className="block text-sm font-black text-emerald-300">
                      {Math.round(mission.progressPercent)}%
                    </span>
                    <span className="mt-1 block rounded-full bg-white/10 px-2 py-1 text-xs font-bold text-zinc-200">
                      +{formatNumber(mission.xpReward)} XP
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
                  <span>{missionStateLabel(mission)}</span>
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
                          "flex items-center gap-3 rounded-lg border px-3 py-2",
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
          <p className="text-sm leading-6 text-zinc-300">
            Активных миссий пока нет. Клуб может включить их в Guest Game Hub.
          </p>
        )}
      </div>
    </section>
  );
}

function missionStateLabel(
  mission: GuestPortalGameSummary["missions"]["featured"][number],
) {
  if (mission.progressPercent >= 100) {
    return mission.manualApprovalRequired
      ? "ждет подтверждения"
      : "квест выполнен";
  }

  return "в процессе";
}

function missionRewardNote(
  mission: GuestPortalGameSummary["missions"]["featured"][number],
) {
  if (mission.manualApprovalRequired) {
    return "Награда появится после подтверждения команды.";
  }

  return "Бонус начисляется автоматически после выполнения.";
}

function missionStepStateLabel(
  step: GuestPortalGameSummary["missions"]["featured"][number]["questSteps"][number],
) {
  if (step.completed) {
    return "готово";
  }

  return step.current ? "сейчас" : "далее";
}

function formatMissionStepProgress(
  step: GuestPortalGameSummary["missions"]["featured"][number]["questSteps"][number],
) {
  return `${formatNumber(step.progressCurrent)} / ${formatNumber(step.target)}`;
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

function walletStateLabel(
  state: GuestPortalGameSummary["rewards"]["ready"][number]["walletState"],
) {
  const labels = {
    WAITING_APPROVAL: "Ждет проверки",
    READY: "Можно забрать",
    REDEEMED: "Выдано",
    CANCELED: "Отменено",
    EXPIRED: "Сгорело",
  } satisfies Record<
    GuestPortalGameSummary["rewards"]["ready"][number]["walletState"],
    string
  >;

  return labels[state];
}

function walletStateHint(
  state: GuestPortalGameSummary["rewards"]["ready"][number]["walletState"],
) {
  const hints = {
    WAITING_APPROVAL: "Сотрудник клуба проверит результат и подготовит выдачу.",
    READY: "Покажите код кассиру в клубе, чтобы получить награду.",
    REDEEMED: "Награда уже выдана и отмечена в LeetPlus.",
    CANCELED: "Награда отменена сотрудником клуба.",
    EXPIRED: "Срок действия награды закончился.",
  } satisfies Record<
    GuestPortalGameSummary["rewards"]["ready"][number]["walletState"],
    string
  >;

  return hints[state];
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

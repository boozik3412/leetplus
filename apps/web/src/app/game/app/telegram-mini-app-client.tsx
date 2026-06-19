"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type {
  GuestPortalGameSummary,
  GuestPortalTelegramMiniAppClub,
  GuestPortalTelegramMiniAppSessionResponse,
} from "@/lib/guest-portal";

type LoadState =
  | "loading"
  | "ready"
  | "auth-required"
  | "club-selection"
  | "error";
type SubmitState = "idle" | "submitting";
type MiniAppTab = "home" | "quests" | "rewards" | "profile";
type TelegramWebApp = {
  initData?: string;
  ready?: () => void;
  expand?: () => void;
  HapticFeedback?: {
    impactOccurred?: (style: "light" | "medium" | "heavy") => void;
  };
};

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}

class EmptySessionError extends Error {}

export function TelegramMiniAppClient() {
  const [summary, setSummary] = useState<GuestPortalGameSummary | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [clubs, setClubs] = useState<GuestPortalTelegramMiniAppClub[]>([]);
  const [selectedTab, setSelectedTab] = useState<MiniAppTab>("home");
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [toast, setToast] = useState<string | null>(null);
  const initDataRef = useRef<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback((nextMessage: string) => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }

    setToast(nextMessage);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2400);
  }, []);

  const openSummary = useCallback(
    async (nextSummary?: GuestPortalGameSummary | null) => {
      const resolvedSummary = nextSummary ?? (await requestGameSummary());
      setSummary(resolvedSummary);
      setClubs([]);
      setMessage(null);
      setLoadState("ready");
    },
    [],
  );

  const handleSessionResponse = useCallback(
    async (data: GuestPortalTelegramMiniAppSessionResponse) => {
      if (data.status === "CONFIRMED") {
        await openSummary(data.summary ?? null);
        return;
      }

      if (data.status === "CLUB_SELECTION_REQUIRED") {
        setClubs(data.clubs ?? []);
        setMessage(data.message);
        setSummary(null);
        setLoadState("club-selection");
        return;
      }

      setSummary(null);
      setMessage(data.message);
      setLoadState(data.status === "AUTH_REQUIRED" ? "auth-required" : "error");
    },
    [openSummary],
  );

  const loadMiniApp = useCallback(async () => {
    const telegramWebApp = getTelegramWebApp();

    telegramWebApp?.ready?.();
    telegramWebApp?.expand?.();

    const initData = readTelegramInitData();
    initDataRef.current = initData;

    try {
      if (initData) {
        const data = await requestMiniAppSession({ initData });
        await handleSessionResponse(data);
        return;
      }

      await openSummary();
    } catch (error) {
      if (error instanceof EmptySessionError) {
        setLoadState("auth-required");
        setMessage(
          "Откройте Mini App из Telegram или войдите через игровой модуль.",
        );
        return;
      }

      setLoadState("error");
      setMessage(getErrorMessage(error, "Не удалось открыть Mini App."));
    }
  }, [handleSessionResponse, openSummary]);

  useEffect(() => {
    let isActive = true;

    async function load() {
      if (!isActive) {
        return;
      }

      await loadMiniApp();
    }

    void load();

    return () => {
      isActive = false;

      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, [loadMiniApp]);

  async function selectClub(clubId: string) {
    const initData = initDataRef.current;

    if (!initData) {
      setLoadState("auth-required");
      setMessage("Telegram initData не найден. Откройте Mini App из бота.");
      return;
    }

    setSubmitState("submitting");

    try {
      const data = await requestMiniAppSession({ initData, clubId });
      await handleSessionResponse(data);
      if (data.status === "CONFIRMED") {
        setSelectedTab("home");
        window.setTimeout(() => {
          document
            .getElementById("home")
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 80);
      }
    } catch (error) {
      setLoadState("error");
      setMessage(getErrorMessage(error, "Не удалось выбрать клуб."));
    } finally {
      setSubmitState("idle");
    }
  }

  const onSelectTab = useCallback(
    (tab: MiniAppTab) => {
      setSelectedTab(tab);
      getTelegramWebApp()?.HapticFeedback?.impactOccurred?.("light");
      document
        .getElementById(tab)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [],
  );

  return (
    <main className="min-h-dvh overflow-x-hidden bg-black text-[#edf7f8] [color-scheme:dark]">
      <div className="relative isolate min-h-dvh bg-[radial-gradient(circle_at_88%_8%,rgba(131,228,236,0.11),transparent_28%),radial-gradient(circle_at_10%_52%,rgba(208,170,108,0.04),transparent_28%),#000] before:fixed before:inset-0 before:-z-10 before:bg-[linear-gradient(rgba(160,223,225,0.032)_1px,transparent_1px),linear-gradient(90deg,rgba(160,223,225,0.026)_1px,transparent_1px)] before:bg-[length:72px_72px] before:opacity-[0.62] before:[mask-image:linear-gradient(180deg,#000,#000_76%,transparent)]">
        <div className="mx-auto min-h-dvh w-full max-w-[430px] bg-black/30 sm:border-x sm:border-[#c4e0e114]">
          {loadState === "ready" && summary ? (
            <ReadyMiniApp
              selectedTab={selectedTab}
              showToast={showToast}
              summary={summary}
              onSelectTab={onSelectTab}
            />
          ) : (
            <StateShell>
              {loadState === "loading" ? (
                <LoadingView />
              ) : loadState === "club-selection" ? (
                <ClubSelectionView
                  clubs={clubs}
                  isSubmitting={submitState === "submitting"}
                  message={message}
                  onSelectClub={selectClub}
                />
              ) : (
                <AuthRequiredView
                  title={
                    loadState === "error"
                      ? "Mini App не открылся"
                      : "Нужен игровой вход"
                  }
                  message={
                    message ??
                    "Подтвердите телефон в Telegram-боте LeetPlus, чтобы открыть клубную карту."
                  }
                />
              )}
            </StateShell>
          )}
        </div>
        <Toast message={toast} />
      </div>
    </main>
  );
}

function ReadyMiniApp({
  selectedTab,
  showToast,
  summary,
  onSelectTab,
}: {
  selectedTab: MiniAppTab;
  showToast: (message: string) => void;
  summary: GuestPortalGameSummary;
  onSelectTab: (tab: MiniAppTab) => void;
}) {
  return (
    <>
      <TopBar summary={summary} showToast={showToast} />
      <div className="grid gap-3 px-3 pb-[calc(92px+env(safe-area-inset-bottom,0px))] pt-2">
        <HeroPanel summary={summary} />
        <EventsRail summary={summary} showToast={showToast} />
        <QuestPanel summary={summary} showToast={showToast} />
        <BattlePassPanel summary={summary} showToast={showToast} />
        <RewardsPanel summary={summary} showToast={showToast} />
        <ProfilePanel summary={summary} showToast={showToast} />
      </div>
      <BottomNav selectedTab={selectedTab} onSelectTab={onSelectTab} />
    </>
  );
}

function StateShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center px-4 py-[calc(32px+env(safe-area-inset-top,0px))]">
      {children}
    </div>
  );
}

function LoadingView() {
  return (
    <div className="w-full rounded-lg border border-[#c4e0e529] bg-[#080e12ef] p-5 shadow-[0_28px_84px_rgba(0,0,0,0.5)]">
      <div className="h-3 w-28 rounded bg-[#c4e0e51a]" />
      <div className="mt-5 h-10 w-56 rounded bg-[#c4e0e514]" />
      <div className="mt-6 grid gap-2">
        <div className="h-12 rounded-lg bg-[#c4e0e50f]" />
        <div className="h-12 rounded-lg bg-[#c4e0e50b]" />
        <div className="h-12 rounded-lg bg-[#c4e0e508]" />
      </div>
    </div>
  );
}

function AuthRequiredView({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <section className="w-full rounded-lg border border-[#c4e0e529] bg-[#080e12ef] p-5 shadow-[0_28px_84px_rgba(0,0,0,0.5)]">
      <div className="text-[9px] font-black uppercase tracking-[0.13em] text-[#71878a]">
        Игровой модуль
      </div>
      <h1 className="mt-3 text-3xl font-black leading-none text-[#edf7f8]">
        {title}
      </h1>
      <p className="mt-3 text-sm leading-6 text-[#c2d0d1]">{message}</p>
      <div className="mt-5 grid gap-2">
        <Link
          className="grid min-h-12 place-items-center rounded-lg bg-[#83e4ec] px-4 text-sm font-black text-[#041012] transition hover:bg-[#a5f3f8]"
          href="/game/auth"
        >
          Открыть игровой вход
        </Link>
        <Link
          className="grid min-h-12 place-items-center rounded-lg border border-[#c4e0e529] px-4 text-sm font-bold text-[#83e4ec] transition hover:border-[#83e4ec]"
          href="/play"
        >
          Перейти на /play
        </Link>
      </div>
    </section>
  );
}

function ClubSelectionView({
  clubs,
  isSubmitting,
  message,
  onSelectClub,
}: {
  clubs: GuestPortalTelegramMiniAppClub[];
  isSubmitting: boolean;
  message: string | null;
  onSelectClub: (clubId: string) => void;
}) {
  return (
    <section className="w-full rounded-lg border border-[#c4e0e529] bg-[#080e12ef] p-5 shadow-[0_28px_84px_rgba(0,0,0,0.5)]">
      <div className="text-[9px] font-black uppercase tracking-[0.13em] text-[#71878a]">
        Выбор клуба
      </div>
      <h1 className="mt-3 text-3xl font-black leading-none text-[#edf7f8]">
        Куда открыть карту
      </h1>
      <p className="mt-3 text-sm leading-6 text-[#c2d0d1]">
        {message ?? "Выберите клуб для игровой сессии Mini App."}
      </p>
      <div className="mt-5 grid gap-2">
        {clubs.map((club) => (
          <button
            className="grid min-h-16 grid-cols-[1fr_auto] items-center gap-3 rounded-lg border border-[#c4e0e524] bg-[#02080b8a] p-3 text-left transition hover:border-[#83e4ec94] disabled:cursor-wait disabled:opacity-60"
            disabled={isSubmitting}
            key={`${club.profileId}:${club.storeId}`}
            type="button"
            onClick={() => onSelectClub(club.clubId)}
          >
            <span className="min-w-0">
              <strong className="block truncate text-sm text-[#edf7f8]">
                {club.storeName}
              </strong>
              <span className="mt-1 block truncate text-xs text-[#a8b9ba]">
                {club.storeAddress ?? club.tenantName}
              </span>
            </span>
            <ChevronIcon />
          </button>
        ))}
      </div>
    </section>
  );
}

function TopBar({
  summary,
  showToast,
}: {
  summary: GuestPortalGameSummary;
  showToast: (message: string) => void;
}) {
  return (
    <header className="sticky top-0 z-20 grid min-h-[calc(62px+env(safe-area-inset-top,0px))] grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-2.5 bg-[linear-gradient(180deg,rgba(0,0,0,0.96),rgba(0,0,0,0.82),transparent)] px-3 pb-2.5 pt-[calc(10px+env(safe-area-inset-top,0px))] backdrop-blur-xl">
      <button
        aria-label="Открыть меню"
        className="grid size-10 place-items-center rounded-lg border border-[#c4e0e52e] bg-[#c4e0e509] text-[#edf7f8]"
        title="Меню"
        type="button"
        onClick={() => showToast("Меню Mini App готовится к следующим экранам.")}
      >
        <MenuIcon />
      </button>
      <div className="flex min-w-0 items-center gap-2">
        <span className="relative size-[30px] shrink-0 rounded-full border border-[#c4e0e557] before:absolute before:inset-[7px] before:rotate-45 before:border before:border-[#83e4ec61] after:absolute after:inset-[13px] after:rotate-45 after:border after:border-[#d0aa6c]" />
        <span className="min-w-0">
          <strong className="block truncate text-[11px] font-black uppercase leading-none tracking-[0.09em] text-[#edf7f8]">
            {summary.store.name} Community
          </strong>
          <span className="mt-1 block truncate text-[9px] font-black uppercase tracking-[0.08em] text-[#83e4ec]">
            {summary.store.name} / {summary.tenant.name}
          </span>
        </span>
      </div>
      <button
        className="inline-flex min-h-[34px] items-center gap-2 rounded-lg border border-[#c4e0e52e] bg-[#070c10b8] px-2.5 text-[11px] font-black text-[#edf7f8] before:size-[7px] before:rounded-full before:bg-[#83e4ec] before:shadow-[0_0_14px_rgba(131,228,236,0.62)]"
        type="button"
        onClick={() => showToast(`Профиль игрока: уровень ${summary.profile.level}.`)}
      >
        {summary.profile.level}
      </button>
    </header>
  );
}

function HeroPanel({ summary }: { summary: GuestPortalGameSummary }) {
  return (
    <section
      className="relative overflow-hidden rounded-lg border border-[#c4e0e529] bg-[linear-gradient(135deg,rgba(255,255,255,0.045),transparent_28%),rgba(8,14,18,0.94)] p-4 shadow-[0_28px_84px_rgba(0,0,0,0.5)] before:absolute before:left-[-1px] before:top-[-1px] before:size-[42px] before:rounded-tl-lg before:border-l before:border-t before:border-[#83e4ec]"
      id="home"
    >
      <div className="inline-flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.13em] text-[#71878a] before:h-px before:w-8 before:bg-[linear-gradient(90deg,#83e4ec,transparent)]">
        Игровой модуль
      </div>
      <h1 className="mt-3.5 text-[33px] font-black leading-[0.96] text-[#edf7f8]">
        Клубная карта игрока
      </h1>
      <p className="mt-2.5 text-sm leading-6 text-[#c2d0d1]">
        Сессия активна: квесты, награды, лутбоксы и прогресс сезона в
        мобильном формате.
      </p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <StatusCell label="уровень" value={summary.profile.level} />
        <StatusCell
          label="ранг"
          value={`${summary.progress.summary.levelProgressPercent}%`}
        />
        <StatusCell label="награды" value={summary.rewards.summary.ready} />
      </div>
    </section>
  );
}

function StatusCell({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0 rounded-[7px] border border-[#c4e0e521] bg-[#0006097a] px-2 py-2.5">
      <strong className="block text-base font-black leading-none text-[#83e4ec]">
        {value}
      </strong>
      <span className="mt-1.5 block text-[8px] font-black uppercase tracking-[0.1em] text-[#71878a]">
        {label}
      </span>
    </div>
  );
}

function EventsRail({
  summary,
  showToast,
}: {
  summary: GuestPortalGameSummary;
  showToast: (message: string) => void;
}) {
  const events = useMemo(() => buildEvents(summary), [summary]);

  return (
    <section aria-label="Баннеры клуба" className="grid gap-2.5">
      <SectionHead count={`${events.length} активны`} title="События" />
      <div className="-mx-0.5 flex snap-x snap-proximity gap-2.5 overflow-x-auto px-0.5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {events.map((event, index) => (
          <button
            className={[
              "relative min-h-[120px] w-[78%] shrink-0 snap-start overflow-hidden rounded-lg border border-[#c4e0e529] p-4 text-left",
              "after:absolute after:inset-0 after:bg-[linear-gradient(135deg,transparent_0_38%,rgba(131,228,236,0.13)_38%_39%,transparent_39%),radial-gradient(circle_at_78%_16%,rgba(131,228,236,0.14),transparent_28%)]",
              index === 0
                ? "bg-[linear-gradient(180deg,rgba(208,170,108,0.18),transparent_46%),rgba(7,12,16,0.86)]"
                : "bg-[linear-gradient(180deg,rgba(131,228,236,0.12),transparent_42%),rgba(5,11,14,0.84)]",
            ].join(" ")}
            key={event.title}
            type="button"
            onClick={() => showToast(event.toast)}
          >
            <span className="relative z-10 flex min-h-[88px] flex-col justify-between">
              <span>
                <small className="text-[9px] font-black uppercase tracking-[0.12em] text-[#71878a]">
                  {event.label}
                </small>
                <strong className="mt-2.5 block text-[23px] font-black leading-none text-[#edf7f8]">
                  {event.title}
                </strong>
              </span>
              <em className="w-fit rounded-[7px] border border-[#c4e0e524] px-2.5 py-1.5 text-[9px] font-black not-italic uppercase tracking-[0.12em] text-[#83e4ec]">
                {event.action}
              </em>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function QuestPanel({
  summary,
  showToast,
}: {
  summary: GuestPortalGameSummary;
  showToast: (message: string) => void;
}) {
  const quests = summary.missions.featured.slice(0, 3);

  return (
    <Panel className="p-3" id="quests">
      <SectionHead
        count={`${summary.progress.summary.missionsCompleted} / ${Math.max(
          summary.missions.total,
          quests.length,
        )}`}
        title="Квесты"
      />
      <div className="mt-2 grid gap-[7px]">
        {quests.length ? (
          quests.map((quest) => (
            <QuestRow
              key={quest.id}
              progress={quest.progressPercent}
              rewardLabel={quest.rewardLabel}
              subtitle={`${formatNumber(quest.progressCurrent)} из ${formatNumber(
                quest.progressTarget,
              )} ${quest.progressUnit ?? ""}`.trim()}
              title={quest.name}
              onClick={() => showToast(`Квест: ${quest.name}.`)}
            />
          ))
        ) : (
          <EmptyRow
            icon={<CheckIcon />}
            title="Квесты готовятся"
            subtitle="Клуб еще не опубликовал активные задания"
          />
        )}
      </div>
    </Panel>
  );
}

function QuestRow({
  progress,
  rewardLabel,
  subtitle,
  title,
  onClick,
}: {
  progress: number;
  rewardLabel: string | null;
  subtitle: string;
  title: string;
  onClick: () => void;
}) {
  const state =
    progress >= 100 ? "done" : progress > 0 ? "live" : "next";
  const stateClasses =
    state === "done"
      ? "border-[#94d6b86b] bg-[#1730284d]"
      : state === "live"
        ? "border-[#83e4ec94] bg-[linear-gradient(90deg,rgba(131,228,236,0.1),transparent),rgba(8,18,22,0.84)]"
        : "border-[#c4e0e524] bg-[#02080b8a]";

  return (
    <button
      className={`grid min-h-12 w-full grid-cols-[30px_minmax(0,1fr)_auto] items-center gap-2 rounded-[7px] border p-[7px] text-left ${stateClasses}`}
      type="button"
      onClick={onClick}
    >
      <span className="grid size-[30px] place-items-center rounded-[7px] border border-[#83e4ec42] bg-[#c4e0e50b] text-[#83e4ec]">
        {state === "done" ? <CheckIcon /> : <QuestIcon />}
      </span>
      <span className="min-w-0">
        <strong className="block truncate text-[13px] font-black leading-none text-[#edf7f8]">
          {title}
        </strong>
        <span className="mt-1 block truncate text-[10px] text-[#a8b9ba]">
          {rewardLabel ?? subtitle}
        </span>
      </span>
      <span className="text-[9px] font-black uppercase tracking-[0.1em] text-[#83e4ec]">
        {state}
      </span>
    </button>
  );
}

function BattlePassPanel({
  summary,
  showToast,
}: {
  summary: GuestPortalGameSummary;
  showToast: (message: string) => void;
}) {
  const battlePass = summary.battlePass.active;
  const steps = battlePass?.levels ?? [];

  return (
    <Panel className="py-3 pl-3" id="battle-pass">
      <div className="pr-3">
        <SectionHead
          count={battlePass ? `${battlePass.progressPercent}%` : "0%"}
          title="Батлпасс"
        />
      </div>
      <div className="mt-3 flex snap-x snap-proximity gap-2.5 overflow-x-auto pb-1 pr-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {steps.length ? (
          steps.map((step) => (
            <button
              className={[
                "relative min-h-[126px] w-[124px] shrink-0 snap-start rounded-[7px] border p-3 text-left",
                step.current
                  ? "border-[#83e4ec9e] bg-[linear-gradient(180deg,rgba(131,228,236,0.12),transparent),rgba(8,18,22,0.82)]"
                  : step.reached
                    ? "border-[#94d6b870] bg-[#17302852]"
                    : "border-[#c4e0e524] bg-[#02080b8f]",
              ].join(" ")}
              key={step.level}
              type="button"
              onClick={() => showToast(`Уровень батлпасса ${step.level}.`)}
            >
              <strong className="block text-sm font-black leading-5 text-[#edf7f8]">
                Уровень {step.level}
              </strong>
              <span className="mt-2 block text-[10px] leading-4 text-[#a8b9ba]">
                {step.freeReward ?? step.premiumReward ?? `${step.xp} XP`}
              </span>
              <small className="absolute bottom-3 left-3 text-[9px] font-black uppercase tracking-[0.11em] text-[#83e4ec]">
                {step.current ? "сейчас" : step.reached ? "готово" : "next"}
              </small>
            </button>
          ))
        ) : (
          <button
            className="grid min-h-[126px] w-[140px] shrink-0 place-items-center rounded-[7px] border border-[#d0aa6c61] bg-[linear-gradient(135deg,rgba(208,170,108,0.18),rgba(131,228,236,0.08)),rgba(7,13,16,0.92)] p-3 text-center"
            type="button"
            onClick={() => showToast("Сезон батлпасса еще не опубликован.")}
          >
            <span className="grid size-[92px] place-items-center bg-[#d0aa6c2e] [clip-path:polygon(50%_0%,62%_30%,96%_21%,76%_50%,96%_79%,62%_70%,50%_100%,38%_70%,4%_79%,24%_50%,4%_21%,38%_30%)]">
              <strong className="max-w-[68px] text-xs leading-none">
                Главная награда
              </strong>
            </span>
          </button>
        )}
      </div>
    </Panel>
  );
}

function RewardsPanel({
  summary,
  showToast,
}: {
  summary: GuestPortalGameSummary;
  showToast: (message: string) => void;
}) {
  const rewardItems = [
    ...summary.rewards.ready.slice(0, 2).map((reward) => ({
      id: reward.id,
      title: reward.rewardLabel ?? reward.rewardType,
      subtitle:
        reward.rewardAmount !== null
          ? `${formatNumber(reward.rewardAmount)} бонусов`
          : reward.sourceLabel ?? "Готова к выдаче",
      active: true,
    })),
    ...summary.lootBoxes.featured.slice(0, 2).map((lootBox) => ({
      id: lootBox.id,
      title: lootBox.name,
      subtitle: lootBox.rewardLabel ?? "Лутбокс клуба",
      active: lootBox.readyRewards > 0,
    })),
  ].slice(0, 3);

  return (
    <Panel className="p-3" id="rewards">
      <SectionHead
        count={summary.rewards.summary.ready > 0 ? "ready" : "wallet"}
        title="Награды"
      />
      <div className="mt-3 grid gap-2.5">
        {rewardItems.length ? (
          rewardItems.map((item) => (
            <button
              className={[
                "grid min-h-[78px] w-full grid-cols-[minmax(0,1fr)_58px] items-center gap-3 rounded-[7px] border p-3 text-left",
                item.active
                  ? "border-[#83e4ec9e] bg-[linear-gradient(90deg,rgba(131,228,236,0.11),transparent),rgba(8,18,22,0.86)]"
                  : "border-[#c4e0e524] bg-[#02080b8a]",
              ].join(" ")}
              key={item.id}
              type="button"
              onClick={() => showToast(`Награда: ${item.title}.`)}
            >
              <span className="min-w-0">
                <strong className="block text-sm font-black leading-4 text-[#edf7f8]">
                  {item.title}
                </strong>
                <span className="mt-1.5 block text-[11px] leading-4 text-[#a8b9ba]">
                  {item.subtitle}
                </span>
              </span>
              <span className="block h-[42px] w-14 rounded-[7px] border border-[#83e4ec52] bg-[linear-gradient(90deg,transparent_0_45%,rgba(131,228,236,0.22)_45%_55%,transparent_55%),linear-gradient(180deg,rgba(196,224,225,0.1),rgba(196,224,225,0.02))]" />
            </button>
          ))
        ) : (
          <EmptyRow
            icon={<RewardIcon />}
            title="Награды впереди"
            subtitle="Выполните квест, чтобы открыть первый дроп"
          />
        )}
      </div>
    </Panel>
  );
}

function ProfilePanel({
  summary,
  showToast,
}: {
  summary: GuestPortalGameSummary;
  showToast: (message: string) => void;
}) {
  const [promoCode, setPromoCode] = useState("");

  return (
    <Panel className="grid gap-3.5 p-3" id="profile">
      <SectionHead title="Профиль" count={summary.loyalty.groupName ?? "Gold"} />
      <ProgressLine
        label="Уровень"
        value={summary.profile.level}
        percent={summary.progress.summary.levelProgressPercent}
      />
      <ProgressLine
        isRank
        label="Ранг"
        value={`${summary.account.readinessPercent}%`}
        percent={summary.account.readinessPercent}
      />
      <form
        className="grid grid-cols-[minmax(0,1fr)_48px] gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          showToast(
            promoCode.trim()
              ? "Промокод принят в Mini App."
              : "Введите промокод для активации.",
          );
        }}
      >
        <input
          className="h-12 min-w-0 rounded-[7px] border border-[#c4e0e529] bg-[#000609ad] px-3 text-[13px] text-[#edf7f8] outline-none transition placeholder:text-[#71878a] focus:border-[#83e4ec94] focus:shadow-[0_0_0_3px_rgba(131,228,236,0.08)]"
          autoComplete="off"
          placeholder="Промокод"
          type="text"
          value={promoCode}
          onChange={(event) => setPromoCode(event.target.value)}
        />
        <button
          aria-label="Активировать промокод"
          className="grid place-items-center rounded-[7px] bg-[linear-gradient(90deg,rgba(131,228,236,0.96),rgba(84,191,198,0.82))] text-[#041012]"
          type="submit"
        >
          <ArrowIcon />
        </button>
      </form>
      <MiniBonusHistory history={summary.rewards.bonusHistory} />
    </Panel>
  );
}

function MiniBonusHistory({
  history,
}: {
  history: GuestPortalGameSummary["rewards"]["bonusHistory"];
}) {
  const items = history.items.slice(0, 3);

  return (
    <div className="rounded-[7px] border border-[#c4e0e529] bg-[#00060975] p-3">
      <div className="flex items-start justify-between gap-3">
        <span>
          <strong className="block text-[10px] font-black uppercase tracking-[0.12em] text-[#83e4ec]">
            История наград
          </strong>
          <small className="mt-1 block text-[10px] leading-4 text-[#71878a]">
            {history.summary.total
              ? `${formatNumber(history.summary.total)} операций`
              : "пока пусто"}
          </small>
        </span>
        <span className="text-right">
          <strong className="block text-sm font-black leading-none text-[#edf7f8]">
            +{formatNumber(history.summary.confirmedAmount)}
          </strong>
          <small className="mt-1 block text-[9px] uppercase tracking-[0.1em] text-[#a8b9ba]">
            подтверждено
          </small>
        </span>
      </div>

      <div className="mt-3 grid gap-2">
        {items.length ? (
          items.map((item) => (
            <div
              className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-[7px] border border-[#c4e0e51f] bg-[#02080b8a] p-2.5"
              key={item.id}
            >
              <span className="min-w-0">
                <strong className="block truncate text-[12px] font-black leading-4 text-[#edf7f8]">
                  {item.title}
                </strong>
                <small className="mt-1 block truncate text-[10px] leading-4 text-[#a8b9ba]">
                  {[item.sourceLabel, item.storeName, bonusHistoryDate(item)]
                    .filter(Boolean)
                    .join(" · ")}
                </small>
              </span>
              <span className="text-right">
                <strong
                  className={[
                    "block text-[13px] font-black leading-4",
                    item.status === "FAILED" || item.status === "CANCELED"
                      ? "text-[#d0aa6c]"
                      : "text-[#83e4ec]",
                  ].join(" ")}
                >
                  {item.amount > 0 ? "+" : ""}
                  {formatNumber(item.amount)}
                </strong>
                <small className="mt-1 block whitespace-nowrap text-[9px] uppercase tracking-[0.08em] text-[#71878a]">
                  {item.statusLabel}
                </small>
              </span>
              {item.balanceAfter !== null ? (
                <span className="col-span-2 text-[10px] leading-4 text-[#71878a]">
                  Баланс после: {formatNumber(item.balanceAfter)}
                </span>
              ) : null}
            </div>
          ))
        ) : (
          <EmptyRow
            icon={<RewardIcon />}
            title="Начислений еще нет"
            subtitle="Первый бонус появится после квеста"
          />
        )}
      </div>
    </div>
  );
}

function ProgressLine({
  isRank,
  label,
  percent,
  value,
}: {
  isRank?: boolean;
  label: string;
  percent: number;
  value: ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[9px] font-black uppercase tracking-[0.13em] text-[#71878a]">
          {label}
        </span>
        <strong className="text-xl font-black leading-none text-[#edf7f8]">
          {value}
        </strong>
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full border border-[#c4e0e529] bg-[#000609b8]">
        <span
          className={[
            "block h-full rounded-full",
            isRank
              ? "bg-[linear-gradient(90deg,#d0aa6c,rgba(208,170,108,0.5))]"
              : "bg-[linear-gradient(90deg,#83e4ec,#54bfc6)]",
          ].join(" ")}
          style={{ width: `${clampPercent(percent)}%` }}
        />
      </div>
    </div>
  );
}

function BottomNav({
  selectedTab,
  onSelectTab,
}: {
  selectedTab: MiniAppTab;
  onSelectTab: (tab: MiniAppTab) => void;
}) {
  const items = [
    { id: "home" as const, label: "Главная", icon: <HomeIcon /> },
    { id: "quests" as const, label: "Квесты", icon: <CheckIcon /> },
    { id: "rewards" as const, label: "Награды", icon: <RewardIcon /> },
    { id: "profile" as const, label: "Профиль", icon: <ProfileIcon /> },
  ];

  return (
    <nav
      aria-label="Навигация"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-2.5 pb-[calc(8px+env(safe-area-inset-bottom,0px))]"
    >
      <div className="pointer-events-auto grid w-full max-w-[406px] grid-cols-4 gap-1 rounded-[10px] border border-[#c4e0e529] bg-[#04080aeb] p-[5px] shadow-[0_-18px_58px_rgba(0,0,0,0.48)] backdrop-blur-xl">
        {items.map((item) => (
          <button
            className={[
              "grid min-h-[42px] min-w-0 place-items-center gap-1 rounded-[7px] text-[8.5px] font-black uppercase tracking-[0.04em] transition",
              selectedTab === item.id
                ? "bg-[#83e4ec1a] text-[#83e4ec]"
                : "bg-transparent text-[#71878a]",
            ].join(" ")}
            key={item.id}
            type="button"
            onClick={() => onSelectTab(item.id)}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

function Panel({
  children,
  className = "",
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section
      className={`relative overflow-hidden rounded-lg border border-[#c4e0e529] bg-[linear-gradient(135deg,rgba(255,255,255,0.045),transparent_28%),rgba(8,14,18,0.94)] shadow-[0_28px_84px_rgba(0,0,0,0.5)] before:absolute before:left-[-1px] before:top-[-1px] before:size-[42px] before:rounded-tl-lg before:border-l before:border-t before:border-[#83e4ec] ${className}`}
      id={id}
    >
      {children}
    </section>
  );
}

function SectionHead({ count, title }: { count?: string; title: string }) {
  return (
    <div className="flex items-end justify-between gap-3 px-0.5">
      <h2 className="text-[22px] font-black leading-none text-[#edf7f8]">
        {title}
      </h2>
      {count ? (
        <span className="whitespace-nowrap text-[10px] font-black uppercase tracking-[0.12em] text-[#83e4ec]">
          {count}
        </span>
      ) : null}
    </div>
  );
}

function EmptyRow({
  icon,
  subtitle,
  title,
}: {
  icon: ReactNode;
  subtitle: string;
  title: string;
}) {
  return (
    <div className="grid min-h-12 grid-cols-[30px_minmax(0,1fr)] items-center gap-2 rounded-[7px] border border-[#c4e0e524] bg-[#02080b8a] p-[7px]">
      <span className="grid size-[30px] place-items-center rounded-[7px] border border-[#83e4ec42] bg-[#c4e0e50b] text-[#83e4ec]">
        {icon}
      </span>
      <span className="min-w-0">
        <strong className="block truncate text-[13px] font-black leading-none text-[#edf7f8]">
          {title}
        </strong>
        <span className="mt-1 block truncate text-[10px] text-[#a8b9ba]">
          {subtitle}
        </span>
      </span>
    </div>
  );
}

function Toast({ message }: { message: string | null }) {
  return (
    <div
      aria-live="polite"
      className={[
        "fixed inset-x-3 bottom-[calc(78px+env(safe-area-inset-bottom,0px))] z-40 mx-auto max-w-[406px] rounded-[7px] border border-[#83e4ec47] bg-[#070d10f0] px-3.5 py-3 text-[13px] leading-5 text-[#d7e5e6] shadow-[0_28px_84px_rgba(0,0,0,0.5)] backdrop-blur-xl transition",
        message
          ? "translate-y-0 opacity-100"
          : "pointer-events-none translate-y-3 opacity-0",
      ].join(" ")}
      role="status"
    >
      {message}
    </div>
  );
}

function buildEvents(summary: GuestPortalGameSummary) {
  const promoCards = summary.promoCards.featured.slice(0, 3).map((card) => ({
    label: card.label ?? "Событие",
    title: card.title,
    action:
      card.tag ??
      (card.periodTo ? `до ${formatDate(card.periodTo)}` : "активно"),
    toast: card.description ?? card.title,
  }));

  if (promoCards.length) {
    return promoCards;
  }

  const nextActions = summary.nextActions.slice(0, 3).map((action) => ({
    label: "План игры",
    title: action.title,
    action: action.statusLabel ?? "открыть",
    toast: action.description ?? action.title,
  }));

  if (nextActions.length) {
    return nextActions;
  }

  return [
    {
      label: "Акция / реклама",
      title: "Ночной рейд",
      action: "до 30 июня",
      toast: "Открыт баннер акции: ночной рейд.",
    },
    {
      label: "Событие",
      title: "Клубный турнир",
      action: "регистрация",
      toast: "Открыт клубный турнир.",
    },
    {
      label: "Событие",
      title: "Партнерский дроп",
      action: "получить",
      toast: "Открыт партнерский дроп.",
    },
  ];
}

async function requestMiniAppSession({
  clubId,
  initData,
}: {
  clubId?: string;
  initData: string;
}) {
  const response = await fetch("/api/guest-portal/telegram-mini-app/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initData, clubId }),
  });

  if (!response.ok) {
    throw new Error(
      await readResponseMessage(response, "Не удалось проверить Telegram."),
    );
  }

  return (await response.json()) as GuestPortalTelegramMiniAppSessionResponse;
}

async function requestGameSummary() {
  const response = await fetch("/api/guest-portal/session/game-summary", {
    cache: "no-store",
  });

  if (response.status === 401) {
    throw new EmptySessionError("Гостевая сессия не найдена.");
  }

  if (!response.ok) {
    throw new Error(
      await readResponseMessage(response, "Не удалось загрузить игру."),
    );
  }

  return (await response.json()) as GuestPortalGameSummary;
}

async function readResponseMessage(response: Response, fallback: string) {
  try {
    const data = (await response.json()) as { message?: unknown };

    return typeof data.message === "string" && data.message.trim()
      ? data.message
      : fallback;
  } catch {
    return fallback;
  }
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
  }).format(new Date(value));
}

function readTelegramInitData() {
  const fromTelegram = getTelegramWebApp()?.initData?.trim();

  if (fromTelegram) {
    return fromTelegram;
  }

  const params = new URLSearchParams(window.location.search);

  return (
    params.get("tgWebAppData")?.trim() ||
    params.get("initData")?.trim() ||
    null
  );
}

function getTelegramWebApp() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.Telegram?.WebApp ?? null;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function formatNumber(value: number | null | undefined) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 0,
  }).format(value ?? 0);
}

function bonusHistoryDate(
  item: GuestPortalGameSummary["rewards"]["bonusHistory"]["items"][number],
) {
  const value = item.confirmedAt ?? item.processedAt ?? item.occurredAt;

  if (!value) {
    return null;
  }

  try {
    return new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      month: "short",
    }).format(new Date(value));
  } catch {
    return null;
  }
}

function MenuIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-[19px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-[17px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <path d="M3 11 12 4l9 7" />
      <path d="M5 10v10h14V10" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-[17px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <path d="M9 11 12 14 22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
}

function QuestIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-[17px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="10" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function RewardIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-[17px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <path d="M12 3 4.5 7.4v8.8L12 21l7.5-4.8V7.4L12 3Z" />
      <path d="M9 12.2 11.2 14 15.4 9.6" />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-[17px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-[19px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-[18px] text-[#83e4ec]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

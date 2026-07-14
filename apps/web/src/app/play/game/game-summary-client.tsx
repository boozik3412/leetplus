"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
  RefObject,
} from "react";
import type {
  GuestPortalCheckInResponse,
  GuestPortalGameSummary,
  GuestPortalLootBoxRarity,
} from "@/lib/guest-portal";
import {
  isHttpExternalActionUrl,
  isInternalHref,
  normalizeExternalActionUrl,
} from "@/lib/external-links";
import { lootboxSkinForRarity } from "@/lib/lootbox-assets";

type LoadState = "loading" | "ready" | "empty" | "error";
type GameNextAction = GuestPortalGameSummary["nextActions"][number];
type GameRewardWalletState =
  GuestPortalGameSummary["rewards"]["recent"][number]["walletState"];
type GameRewardHistoryItem =
  GuestPortalGameSummary["rewards"]["recent"][number];
type GameBonusHistoryItem =
  GuestPortalGameSummary["rewards"]["bonusHistory"]["items"][number];
type GameMission = GuestPortalGameSummary["missions"]["featured"][number];
type GameMissionHistoryItem = GuestPortalGameSummary["missions"]["history"][number];
type GameProgressTimelineItem =
  GuestPortalGameSummary["progress"]["timeline"][number];
type GameJourneyStep = GuestPortalGameSummary["journey"]["steps"][number];
type MissionBoardFilter = "AVAILABLE" | "ALMOST_DONE" | "REWARD_PENDING" | "ALL";
type HomeBanner = {
  id: string;
  label: string;
  title: string;
  description: string;
  tag: string;
  featured?: boolean;
  href: string;
  imageUrl?: string | null;
};
type HomeLootCard = {
  id: string;
  title: string;
  description: string;
  triggerKind: string;
  sessionType: string | null;
  schedule: GuestPortalGameSummary["lootBoxes"]["featured"][number]["schedule"];
  status: string;
  active: boolean;
  openable: boolean;
  openState: GuestPortalGameSummary["lootBoxes"]["featured"][number]["openState"];
  openBlocker: string | null;
  rewardLabel: string | null;
  caseRarity: GuestPortalLootBoxRarity;
  caseRarityLabel: string;
  rewardRarity?: GuestPortalLootBoxRarity | null;
  rewardRarityLabel?: string | null;
  rewardDropChance?: number | null;
  weeklyOpenedCount: number;
  weeklyLimit: number | null;
  dailyOpenedCount: number;
  dailyLimit: number | null;
  periodicLimitPeriod: "DAILY" | "WEEKLY" | "MONTHLY" | null;
  periodicOpenedCount: number;
};
type LootboxOverlayPhase =
  | "ready"
  | "charging"
  | "rolling"
  | "opening"
  | "open"
  | "collected";
type GuestPortalLootBoxOpenResponse = {
  processed: true;
  idempotent: boolean;
  createdRewards: number;
  queuedRewardAmount: number;
  rewards: Array<{
    rewardLabel?: string | null;
    rewardRarity?: GuestPortalLootBoxRarity | null;
    rewardRarityLabel?: string | null;
    rewardDropChance?: number | null;
  }>;
  summary: GuestPortalGameSummary;
  message: string;
};
type LootboxOpenReward = GuestPortalLootBoxOpenResponse["rewards"][number];
type LootboxRouletteReward = {
  id: string;
  reward: string;
  caption: string;
  rarity: GuestPortalLootBoxRarity | null;
  rarityLabel: string | null;
  dropChance: number | null;
  isWinner?: boolean;
};
type LootboxRouletteState = {
  runId: number;
  lootBoxId: string;
  items: LootboxRouletteReward[];
  winningIndex: number;
  durationMs: number;
  reward: string;
  caption: string;
  rarity: GuestPortalLootBoxRarity | null;
  rarityLabel: string | null;
  dropChance: number | null;
  message: string;
  skipped: boolean;
};
type GuestPortalProfileUpdateResponse = {
  summary: GuestPortalGameSummary;
  message: string;
};

function debugGuestGame(stage: string, payload: Record<string, unknown> = {}) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const logger = globalThis.console;
    logger.info(`[guest-game-debug:${stage}]`, payload);
  } catch {
    // Diagnostics must never affect the guest flow.
  }
}

function debugHomeLootCard(card: HomeLootCard | null | undefined) {
  if (!card) {
    return null;
  }

  return {
    id: card.id,
    title: card.title,
    triggerKind: card.triggerKind,
    sessionType: card.sessionType,
    schedule: card.schedule,
    status: card.status,
    openable: card.openable,
    openState: card.openState,
    openBlocker: card.openBlocker,
    weeklyOpenedCount: card.weeklyOpenedCount,
    weeklyLimit: card.weeklyLimit,
    dailyOpenedCount: card.dailyOpenedCount,
    dailyLimit: card.dailyLimit,
    periodicLimitPeriod: card.periodicLimitPeriod,
    periodicOpenedCount: card.periodicOpenedCount,
  };
}

function debugSummarySnapshot(summary: GuestPortalGameSummary) {
  return {
    generatedAt: summary.generatedAt,
    tenant: summary.tenant.slug,
    storeId: summary.store.id,
    storeName: summary.store.name,
    profileId: summary.profile.id,
    contactMasked: summary.profile.contactMasked,
    lootBoxesTotal: summary.lootBoxes.total,
    featuredLootBoxes: summary.lootBoxes.featured.map((lootBox) => ({
      id: lootBox.id,
      name: lootBox.name,
      triggerKind: lootBox.triggerKind,
      sessionType: lootBox.sessionType,
      schedule: lootBox.schedule,
      openable: lootBox.openable,
      openState: lootBox.openState,
      openBlocker: lootBox.openBlocker,
      openedCount: lootBox.openedCount,
      readyRewards: lootBox.readyRewards,
      weeklyOpenedCount: lootBox.weeklyOpenedCount,
      weeklyLimit: lootBox.weeklyLimit,
      dailyOpenedCount: lootBox.dailyOpenedCount,
      dailyLimit: lootBox.dailyLimit,
      periodicLimitPeriod: lootBox.periodicLimitPeriod,
      periodicOpenedCount: lootBox.periodicOpenedCount,
    })),
  };
}

type BannerTitleStyle = CSSProperties &
  Partial<
    Record<
      | "--banner-title-size"
      | "--banner-title-line-height"
      | "--banner-title-compact-size"
      | "--banner-title-compact-line-height",
      string
    >
  >;
type HomeBattleQuest = {
  id: string;
  sourceKind: "journey" | "mission" | "fallback";
  sourceId: string;
  title: string;
  description: string;
  state: "complete" | "current" | "locked";
  label: string;
  step: string;
  status: string;
  condition: string;
  reward: string;
  preview: string;
  progress?: {
    current: number;
    total: number;
    label: string;
    percent: number;
  };
  periodTo?: string | null;
  x: string;
  y: string;
};
type BattlePassDetailProgress = NonNullable<HomeBattleQuest["progress"]>;
type HomeBattlePassSeason = NonNullable<
  GuestPortalGameSummary["battlePass"]["active"]
>;
type HomeBattlePassLevel = HomeBattlePassSeason["levels"][number];
type BattlePassRewardType =
  | "xp"
  | "coins"
  | "discount"
  | "lootbox"
  | "avatar"
  | "boost"
  | "rank";
type BattlePassRewardStatus = "locked" | "current" | "ready" | "claimed";
type BattlePassRewardCard = {
  id: string;
  level: number;
  title: string;
  subtitle: string;
  condition?: string | null;
  description?: string | null;
  plannedReward?: string | null;
  type: BattlePassRewardType;
  rarity: GuestPortalLootBoxRarity;
  status: BattlePassRewardStatus;
  image?: string;
  rewardValue?: string;
  xpThreshold?: number;
  previousXpThreshold?: number;
  quest?: HomeBattleQuest;
};
type BattlePassEventName =
  | "reward_click"
  | "reward_claim"
  | "help_click"
  | "track_scroll"
  | "level_focus";
type QuestStatus = "done" | "live" | "next";
type RewardHistorySource = "lootbox" | "battlepass" | "quest" | "promo";
type RewardHistorySourceFilter = RewardHistorySource | "all";
type RewardHistoryRarityFilter = GuestPortalLootBoxRarity | "all";
type RewardHistoryGroup = "source" | "rarity" | "date";
const LOOTBOX_RARITY_LABELS: Record<GuestPortalLootBoxRarity, string> = {
  common: "Обычная",
  rare: "Редкая",
  epic: "Эпическая",
  legendary: "Легендарная",
};
const LOOTBOX_CASE_RARITY_LABELS: Record<GuestPortalLootBoxRarity, string> = {
  common: "Обычный",
  rare: "Редкий",
  epic: "Эпический",
  legendary: "Легендарный",
};
const LEVEL_XP_STEP = 500;
const REWARD_HISTORY_SOURCE_ORDER: RewardHistorySource[] = [
  "lootbox",
  "battlepass",
  "quest",
  "promo",
];
const REWARD_HISTORY_SOURCE_LABELS: Record<RewardHistorySource, string> = {
  lootbox: "Лутбоксы",
  battlepass: "Баттлпасс",
  quest: "Квесты",
  promo: "Промокоды",
};
const REWARD_HISTORY_RARITY_ORDER: GuestPortalLootBoxRarity[] = [
  "common",
  "rare",
  "epic",
  "legendary",
];
const REWARD_HISTORY_RARITY_LABELS: Record<GuestPortalLootBoxRarity, string> = {
  common: "Обычные",
  rare: "Редкие",
  epic: "Эпические",
  legendary: "Легендарные",
};
const REWARD_HISTORY_GROUP_TITLES: Record<RewardHistoryGroup, string> = {
  source: "Группировка по блокам",
  rarity: "Группировка по редкости",
  date: "Хронология наград",
};
const REWARD_HISTORY_SOURCE_TONES: Record<RewardHistorySource, string> = {
  lootbox: "131 228 236",
  battlepass: "208 170 108",
  quest: "148 214 184",
  promo: "158 181 183",
};
const LOOTBOX_ROULETTE_MS: Record<GuestPortalLootBoxRarity, number> = {
  common: 5200,
  rare: 5400,
  epic: 5600,
  legendary: 5800,
};
const LOOTBOX_CHARGE_MIN_MS = 760;
const LOOTBOX_CASE_OPEN_MS = 1320;
const LOOTBOX_ROULETTE_FALLBACK_REWARDS: ReadonlyArray<
  Omit<LootboxRouletteReward, "id">
> = [
  {
    reward: "50 бонусов",
    caption: "basic reward",
    rarity: "common",
    rarityLabel: LOOTBOX_RARITY_LABELS.common,
    dropChance: 85,
  },
  {
    reward: "100 бонусов",
    caption: "club reward",
    rarity: "rare",
    rarityLabel: LOOTBOX_RARITY_LABELS.rare,
    dropChance: 8,
  },
  {
    reward: "200 бонусов",
    caption: "epic reward",
    rarity: "epic",
    rarityLabel: LOOTBOX_RARITY_LABELS.epic,
    dropChance: 4,
  },
  {
    reward: "Промокод",
    caption: "legend reward",
    rarity: "legendary",
    rarityLabel: LOOTBOX_RARITY_LABELS.legendary,
    dropChance: 1,
  },
];
type PlayerQuest = {
  id: string;
  title: string;
  description: string;
  status: QuestStatus;
  label: string;
  progress?: {
    current: number;
    total: number;
    label: string;
    percent: number;
  };
  reward?: {
    type: "xp" | "lootbox" | "rank" | "promo";
    value: string | number;
  };
};
type QuestCompletionDialog = {
  id: string;
  title: string;
  rewardLabel: string;
  statusLabel: string;
  receivedAt: string;
};
type BattlePassLevelCompletionDialog = {
  seasonId: string;
  seasonName: string;
  completedLevel: number;
  completedTitle: string;
  rewardLabel: string;
  nextLevel: number | null;
  nextTitle: string | null;
  nextCondition: string | null;
};
type CheckInCompletionDialog = {
  id: string;
  alreadyCounted: boolean;
  error: boolean;
  rewardLabel: string | null;
  receivedAt: string;
  note: string | null;
};
type CompletionDialogQueueItem =
  | {
      key: string;
      kind: "CHECK_IN";
      occurredAt: string;
      completion: CheckInCompletionDialog;
    }
  | {
      key: string;
      kind: "QUEST";
      occurredAt: string;
      completion: QuestCompletionDialog;
    }
  | {
      key: string;
      kind: "BATTLE_PASS";
      occurredAt: string;
      completion: BattlePassLevelCompletionDialog;
    };
type UnavailableLootboxMessage = string | null;
type QuestBoardStyle = CSSProperties &
  Partial<
    Record<
      | "--quest-board-left"
      | "--quest-board-top"
      | "--quest-board-right"
      | "--quest-board-bottom",
      string
    >
  >;

class EmptySessionError extends Error {}

export function GameSummaryClient() {
  const [summary, setSummary] = useState<GuestPortalGameSummary | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    async function loadInitialSummary() {
      try {
        const nextSummary = await recordGameAppOpen("WEB");

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

  useEffect(() => {
    if (loadState !== "ready") {
      return;
    }

    let isActive = true;
    let refreshRunning = false;

    async function refreshVisibleSummary() {
      if (
        !isActive ||
        refreshRunning ||
        document.visibilityState === "hidden"
      ) {
        return;
      }

      refreshRunning = true;

      try {
        const nextSummary = await loadGameSummary();

        if (isActive) {
          setSummary(nextSummary);
        }
      } catch {
        // Keep the last usable screen; manual refresh still reports errors.
      } finally {
        refreshRunning = false;
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void refreshVisibleSummary();
      }
    }

    const intervalId = window.setInterval(
      () => void refreshVisibleSummary(),
      120_000,
    );

    window.addEventListener("focus", refreshVisibleSummary);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isActive = false;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshVisibleSummary);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [loadState]);

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
        <ReadyGameView summary={summary} onSummaryChange={setSummary} />
      }
    />
  );
}

export function GameRewardsClient() {
  const [summary, setSummary] = useState<GuestPortalGameSummary | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    async function loadRewardsSummary() {
      try {
        const nextSummary = await recordGameAppOpen("WEB");

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
        setMessage(
          getErrorMessage(error, "Не удалось загрузить журнал наград."),
        );
      }
    }

    void loadRewardsSummary();

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
            title="Журнал наград пока недоступен"
            message={message ?? "Подтвердите телефон, чтобы увидеть историю наград."}
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
            title="Не удалось открыть журнал"
            message={message ?? "Попробуйте обновить страницу чуть позже."}
          />
        }
      />
    );
  }

  return (
    <GameShell
      body={
        <div className="lp-club-home lp-reward-standalone-page">
          <div className="lp-reward-standalone-shell">
            <RewardJournalPanel summary={summary} standalone />
          </div>
        </div>
      }
    />
  );
}

function GameShell({ body }: { body: ReactNode }) {
  return (
    <main className="lp-club-home-page">
      {body}
      <style>{clubHomeCss}</style>
    </main>
  );
}

function LoadingView() {
  return (
    <div className="lp-club-home-static">
      <div className="lp-club-static-card" aria-busy="true">
        <div className="lp-club-skeleton lp-club-skeleton-short" />
        <div className="lp-club-skeleton lp-club-skeleton-title" />
        <div className="lp-club-skeleton" />
        <div className="lp-club-skeleton lp-club-skeleton-mid" />
        <div className="lp-club-static-grid">
          <div className="lp-club-skeleton" />
          <div className="lp-club-skeleton" />
          <div className="lp-club-skeleton" />
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
    <section className="lp-club-home-static">
      <div className="lp-club-static-card">
        <p className="lp-club-small-label">
          Игровой вход
        </p>
        <h1 className="lp-club-static-title">{title}</h1>
        <p className="lp-club-static-copy">{message}</p>
        <div className="lp-club-static-actions">
          <Link
            href="/play"
            className="lp-club-primary-link"
          >
            Зарегистрироваться
          </Link>
          <Link
            href="/"
            className="lp-club-ghost-link"
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
  onSummaryChange,
}: {
  summary: GuestPortalGameSummary;
  onSummaryChange: (summary: GuestPortalGameSummary) => void;
}) {
  const router = useRouter();
  const primaryAction =
    summary.nextActions.find((action) => !isGuestInternalNextAction(action)) ??
    null;
  const primaryActionHref = primaryAction ? gameActionHref(primaryAction) : null;
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [selectedLootId, setSelectedLootId] = useState<string | null>(null);
  const [lootboxOverlayCard, setLootboxOverlayCard] =
    useState<HomeLootCard | null>(null);
  const [lootboxOverlayPhase, setLootboxOverlayPhase] =
    useState<LootboxOverlayPhase>("ready");
  const [lootboxRoulette, setLootboxRoulette] =
    useState<LootboxRouletteState | null>(null);
  const [lootboxOverlayError, setLootboxOverlayError] = useState<string | null>(
    null,
  );
  const lootboxRewardRef = useRef<HTMLButtonElement | null>(null);
  const lootboxOpenRunRef = useRef(0);
  const latestSummaryRef = useRef(summary);
  const seenCompletionDialogKeysRef = useRef(new Set<string>());
  const shellRef = useRef<HTMLDivElement | null>(null);
  const lootBoxesRef = useRef<HTMLElement | null>(null);
  const battlePassRef = useRef<HTMLElement | null>(null);
  const [promoCode, setPromoCode] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [checkInPending, setCheckInPending] = useState(false);
  const [summaryRefreshPending, setSummaryRefreshPending] = useState(false);
  const [unavailableLootboxCard, setUnavailableLootboxCard] =
    useState<HomeLootCard | null>(null);
  const [unavailableLootboxMessage, setUnavailableLootboxMessage] =
    useState<UnavailableLootboxMessage>(null);
  const [nicknamePending, setNicknamePending] = useState(false);
  const [questsExpanded, setQuestsExpanded] = useState(false);
  const [selectedQuestId, setSelectedQuestId] = useState<string | null>(null);
  const [questBoardStyle, setQuestBoardStyle] = useState<QuestBoardStyle>({});
  const [completionDialogQueue, setCompletionDialogQueue] = useState<
    CompletionDialogQueueItem[]
  >([]);
  const homeBanners = buildHomeBanners(
    summary,
    primaryAction,
    primaryActionHref,
  );
  const lootCards = buildHomeLootCards(summary, selectedLootId);
  const battleQuests = buildHomeBattleQuests(summary);
  const playerQuests = useMemo(() => buildPlayerQuests(summary), [summary]);
  const checkInAction =
    summary.nextActions.find((action) => action.kind === "CHECK_IN") ?? null;
  const checkInSummary = summary.checkIn ?? null;
  const checkInAvailable = isCheckInAvailable(summary);
  const completedQuestCount = playerQuests.filter(
    (quest) => quest.status === "done",
  ).length;
  const questTotalCount = playerQuests.length;
  const battlePassProgress = clampPercent(
    summary.battlePass.active?.progressPercent ?? summary.journey.summary.readyPercent,
  );
  const mainRewardLabel =
    summary.battlePass.active?.nextRewardLabel ??
    summary.rewards.ready[0]?.rewardLabel ??
    summary.rewards.latestBonus?.title ??
    "Главная награда";
  const brandLogoUrl = summary.store.gameLogoUrl ?? summary.tenant.gameLogoUrl;
  const brandLogoTitle = summary.store.gameLogoUrl
    ? summary.store.name
    : summary.tenant.name;
  const activeCompletionDialog = completionDialogQueue[0] ?? null;

  const syncQuestBoardBounds = useCallback(() => {
    const shell = shellRef.current;
    const lootBoxes = lootBoxesRef.current;
    const battlePass = battlePassRef.current;

    if (!shell || !lootBoxes || !battlePass) {
      return;
    }

    const shellRect = shell.getBoundingClientRect();
    const lootRect = lootBoxes.getBoundingClientRect();
    const battleRect = battlePass.getBoundingClientRect();
    const left = Math.min(lootRect.left, battleRect.left) - shellRect.left;
    const top = lootRect.top - shellRect.top;
    const right =
      shellRect.right - Math.max(lootRect.right, battleRect.right);
    const bottom = shellRect.bottom - battleRect.bottom;

    setQuestBoardStyle({
      "--quest-board-left": `${Math.max(0, Math.round(left))}px`,
      "--quest-board-top": `${Math.max(0, Math.round(top))}px`,
      "--quest-board-right": `${Math.max(0, Math.round(right))}px`,
      "--quest-board-bottom": `${Math.max(0, Math.round(bottom))}px`,
    });
  }, [setQuestBoardStyle]);

  useEffect(() => {
    latestSummaryRef.current = summary;
  }, [summary]);

  useEffect(() => {
    if (!toastMessage) {
      return;
    }

    const timerId = window.setTimeout(() => setToastMessage(null), 2200);

    return () => window.clearTimeout(timerId);
  }, [toastMessage]);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [menuOpen]);

  useEffect(() => {
    if (lootboxOverlayPhase !== "open") {
      return;
    }

    lootboxRewardRef.current?.focus();
  }, [lootboxOverlayPhase]);

  useEffect(() => {
    if (!lootboxOverlayCard) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        lootboxOpenRunRef.current += 1;
        setLootboxOverlayCard(null);
        setLootboxOverlayPhase("ready");
        setLootboxRoulette(null);
        setLootboxOverlayError(null);
        emitLootboxEvent("overlay-close");
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lootboxOverlayCard]);

  useEffect(() => {
    if (!unavailableLootboxCard) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setUnavailableLootboxCard(null);
        setUnavailableLootboxMessage(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [unavailableLootboxCard]);

  useEffect(() => {
    if (!questsExpanded) {
      return;
    }

    syncQuestBoardBounds();

    function handleResize() {
      syncQuestBoardBounds();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setQuestsExpanded(false);
      }
    }

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(handleResize);

    [shellRef.current, lootBoxesRef.current, battlePassRef.current].forEach(
      (item) => {
        if (item) {
          resizeObserver?.observe(item);
        }
      },
    );

    window.addEventListener("resize", handleResize);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [questsExpanded, syncQuestBoardBounds]);

  function showToast(message: string) {
    setToastMessage(message);
  }

  function enqueueCompletionDialogs(items: CompletionDialogQueueItem[]) {
    const newItems = items.filter(
      (item) => !seenCompletionDialogKeysRef.current.has(item.key),
    );

    newItems.forEach((item) => {
      seenCompletionDialogKeysRef.current.add(item.key);
    });

    if (newItems.length > 0) {
      setCompletionDialogQueue((currentQueue) => [
        ...currentQueue,
        ...newItems,
      ]);
    }
  }

  function applySummaryWithCompletionDialogs(
    nextSummary: GuestPortalGameSummary,
    additionalCompletions: CompletionDialogQueueItem[] = [],
  ) {
    const previousSummary = latestSummaryRef.current;
    const completions = sortCompletionDialogs([
      ...additionalCompletions,
      ...findNewCompletionDialogs(previousSummary, nextSummary),
    ]);

    latestSummaryRef.current = nextSummary;
    onSummaryChange(nextSummary);

    enqueueCompletionDialogs(completions);
  }

  function closeActiveCompletionDialog() {
    setCompletionDialogQueue((currentQueue) => currentQueue.slice(1));
  }

  async function refreshGameSummary({
    pendingMessage = "Обновляем лутбоксы.",
    successMessage = "Лутбоксы обновлены.",
    silent = false,
  }: {
    pendingMessage?: string;
    successMessage?: string | null;
    silent?: boolean;
  } = {}) {
    if (summaryRefreshPending) {
      if (!silent) {
        showToast("Проверка уже идет.");
      }
      return null;
    }

    setSummaryRefreshPending(true);
    if (!silent) {
      showToast(pendingMessage);
    }
    debugGuestGame("summary-refresh-start", {
      pendingMessage,
      successMessage,
      silent,
      currentSummary: debugSummarySnapshot(summary),
      currentCards: lootCards.map(debugHomeLootCard),
    });

    try {
      const nextSummary = await loadGameSummary();

      applySummaryWithCompletionDialogs(nextSummary);
      debugGuestGame("summary-refresh-success", {
        nextSummary: debugSummarySnapshot(nextSummary),
      });

      if (successMessage && !silent) {
        showToast(successMessage);
      }

      return nextSummary;
    } catch (error) {
      const message = getErrorMessage(error, "Не удалось обновить лутбоксы.");
      debugGuestGame("summary-refresh-error", {
        message,
        error,
      });
      if (!silent) {
        showToast(message);
      }
      return null;
    } finally {
      setSummaryRefreshPending(false);
    }
  }

  function toggleQuestsExpanded() {
    const nextExpanded = !questsExpanded;

    if (nextExpanded) {
      syncQuestBoardBounds();
    }

    setQuestsExpanded(nextExpanded);
    showToast(nextExpanded ? "Открыт экран квестов." : "Квесты свернуты.");
  }

  function closeQuestBoard() {
    setQuestsExpanded(false);
    showToast("Квесты свернуты.");
  }

  function handleQuestClick(quest: PlayerQuest) {
    setSelectedQuestId(quest.id);
    showToast(`${quest.title}: ${quest.description}`);
  }

  function focusPlayerProfile() {
    setMenuOpen(false);
    document.querySelector(".lp-club-profile-panel")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  async function handleCheckIn() {
    if (checkInPending) {
      return;
    }

    setCheckInPending(true);
    showToast("Проверяем чекин в Langame.");

    try {
      const result = await checkInGameSession();
      const nextSummary = await loadGameSummary();
      const xpDelta = result.checkIn.processResult.summary.appliedXpDelta;
      const createdRewards = result.checkIn.processResult.summary.createdRewards;
      const details = [
        xpDelta > 0 ? `${formatNumber(xpDelta)} XP` : null,
        createdRewards > 0 ? `${formatNumber(createdRewards)} наград` : null,
      ].filter(Boolean);

      const checkInCompletion = buildCheckInCompletionDialog(result);
      applySummaryWithCompletionDialogs(
        nextSummary,
        checkInCompletion ? [checkInCompletion] : [],
      );
      showToast(
        details.length
          ? `Чекин засчитан: ${details.join(", ")}.`
          : "Чекин засчитан.",
      );
    } catch (error) {
      const message = getErrorMessage(error, "Не удалось сделать чекин.");

      if (isAlreadyCountedCheckInMessage(message)) {
        enqueueCompletionDialogs([
          buildAlreadyCountedCheckInDialog(
            checkInSummary,
            message,
            latestSummaryRef.current.generatedAt,
          ),
        ]);
      } else {
        enqueueCompletionDialogs([
          buildCheckInErrorDialog(message, latestSummaryRef.current.generatedAt),
        ]);
      }
    } finally {
      setCheckInPending(false);
    }
  }

  async function handleLogout() {
    setMenuOpen(false);

    try {
      await logoutGameSession();
    } catch {
      // Even if the local session endpoint is unavailable, send the guest to auth.
    }

    router.push("/game/auth");
    router.refresh();
  }

  function showLootboxOverlay(card: HomeLootCard) {
    lootboxOpenRunRef.current += 1;
    setUnavailableLootboxCard(null);
    setUnavailableLootboxMessage(null);
    setLootboxOverlayCard(card);
    setLootboxOverlayPhase("ready");
    setLootboxRoulette(null);
    setLootboxOverlayError(null);
    emitLootboxEvent("overlay-open", { lootBoxId: card.id });
    debugGuestGame("lootbox-overlay-open", {
      card: debugHomeLootCard(card),
    });
    showToast("Контейнер готов к открытию.");
  }

  function openLootboxOverlay(card: HomeLootCard) {
    setSelectedLootId(card.id);
    debugGuestGame("lootbox-card-click", {
      card: debugHomeLootCard(card),
      summary: debugSummarySnapshot(summary),
    });

    if (card.openable) {
      showLootboxOverlay(card);
      return;
    }

    setUnavailableLootboxCard(card);
    setUnavailableLootboxMessage(null);
  }

  function closeUnavailableLootboxModal() {
    setUnavailableLootboxCard(null);
    setUnavailableLootboxMessage(null);
  }

  async function refreshUnavailableLootboxConditions() {
    if (!unavailableLootboxCard) {
      return;
    }

    debugGuestGame("lootbox-unavailable-refresh-start", {
      card: debugHomeLootCard(unavailableLootboxCard),
    });
    setUnavailableLootboxMessage(null);

    const nextSummary = await refreshGameSummary({
      pendingMessage: "Проверяем условия открытия.",
      successMessage: null,
      silent: true,
    });

    if (!nextSummary) {
      debugGuestGame("lootbox-unavailable-refresh-error", {
        card: debugHomeLootCard(unavailableLootboxCard),
      });
      setUnavailableLootboxMessage(
        "Не удалось проверить условия. Попробуйте еще раз.",
      );
      return;
    }

    const updatedCard = buildHomeLootCards(
      nextSummary,
      unavailableLootboxCard.id,
    ).find((item) => item.id === unavailableLootboxCard.id);

    if (updatedCard?.openable) {
      debugGuestGame("lootbox-unavailable-refresh-openable", {
        card: debugHomeLootCard(updatedCard),
      });
      showLootboxOverlay(updatedCard);
      return;
    }

    debugGuestGame("lootbox-unavailable-refresh-blocked", {
      previousCard: debugHomeLootCard(unavailableLootboxCard),
      updatedCard: debugHomeLootCard(updatedCard ?? unavailableLootboxCard),
      message: lootBoxUnavailableCheckMessage(
        updatedCard ?? unavailableLootboxCard,
      ),
    });
    setUnavailableLootboxCard(updatedCard ?? unavailableLootboxCard);
    setUnavailableLootboxMessage(
      lootBoxUnavailableCheckMessage(updatedCard ?? unavailableLootboxCard),
    );
  }

  async function beginLootboxOpening() {
    if (!lootboxOverlayCard || lootboxOverlayPhase !== "ready") {
      return;
    }

    let currentCard = lootboxOverlayCard;
    const runId = lootboxOpenRunRef.current + 1;

    lootboxOpenRunRef.current = runId;
    setLootboxRoulette(null);
    setLootboxOverlayError(null);
    setLootboxOverlayPhase("charging");
    emitLootboxEvent("charge-start", { lootBoxId: currentCard.id });
    debugGuestGame("lootbox-open-start", {
      runId,
      card: debugHomeLootCard(currentCard),
      summary: debugSummarySnapshot(summary),
    });
    showToast("Проверяем условия открытия.");

    try {
      const nextSummary = await refreshGameSummary({
        pendingMessage: "Проверяем условия открытия.",
        successMessage: null,
        silent: true,
      });

      if (lootboxOpenRunRef.current !== runId) {
        return;
      }

      if (!nextSummary) {
        const message =
          "Не удалось проверить условия открытия. Попробуйте еще раз.";

        setLootboxOverlayPhase("ready");
        setLootboxOverlayError(message);
        debugGuestGame("lootbox-open-preflight-error", {
          runId,
          card: debugHomeLootCard(currentCard),
        });
        showToast(message);
        return;
      }

      const refreshedCard = buildHomeLootCards(
        nextSummary,
        currentCard.id,
      ).find((item) => item.id === currentCard.id);

      if (!refreshedCard) {
        const message =
          "Лутбокс больше не найден в игровом модуле.";

        setLootboxOverlayPhase("ready");
        setLootboxOverlayError(message);
        debugGuestGame("lootbox-open-preflight-missing", {
          runId,
          card: debugHomeLootCard(currentCard),
          nextSummary: debugSummarySnapshot(nextSummary),
        });
        showToast(message);
        return;
      }

      currentCard = refreshedCard;
      setLootboxOverlayCard(refreshedCard);

      if (!refreshedCard.openable) {
        const message =
          lootboxCardBlockedTooltip(refreshedCard) ??
          refreshedCard.openBlocker ??
          lootBoxUnavailableCheckMessage(refreshedCard);

        setLootboxOverlayPhase("ready");
        setLootboxOverlayError(message);
        debugGuestGame("lootbox-open-preflight-blocked", {
          runId,
          card: debugHomeLootCard(refreshedCard),
          message,
          nextSummary: debugSummarySnapshot(nextSummary),
        });
        showToast(message);
        return;
      }

      showToast("Контейнер активируется.");

      const [result] = await Promise.all([
        openGameLootBox(currentCard.id),
        wait(LOOTBOX_CHARGE_MIN_MS),
      ]);

      if (lootboxOpenRunRef.current !== runId) {
        return;
      }

      const updatedLootBox = result.summary.lootBoxes.featured.find(
        (item) => item.id === currentCard.id,
      );
      const openedReward = result.rewards[0] ?? null;
      const rewardLabel =
        openedReward?.rewardLabel ??
        updatedLootBox?.latestReward?.rewardLabel ??
        updatedLootBox?.rewardLabel ??
        currentCard.rewardLabel ??
        currentCard.description;
      const rewardRarity =
        normalizeLootboxRarity(openedReward?.rewardRarity) ??
        normalizeLootboxRarity(updatedLootBox?.latestReward?.rewardRarity) ??
        normalizeLootboxRarity(currentCard.rewardRarity) ??
        null;
      const rewardRarityLabel =
        openedReward?.rewardRarityLabel ??
        updatedLootBox?.latestReward?.rewardRarityLabel ??
        currentCard.rewardRarityLabel ??
        (rewardRarity ? LOOTBOX_RARITY_LABELS[rewardRarity] : null);
      const rewardDropChance =
        openedReward?.rewardDropChance ??
        updatedLootBox?.latestReward?.rewardDropChance ??
        currentCard.rewardDropChance ??
        null;
      const nextCard = {
        ...currentCard,
        description: rewardLabel,
        rewardLabel,
        rewardRarity,
        rewardRarityLabel,
        rewardDropChance,
      };
      const roulette = buildLootboxRouletteState({
        currentCard,
        nextCard,
        previousSummary: summary,
        result,
        runId,
      });

      applySummaryWithCompletionDialogs(result.summary);
      setLootboxOverlayCard(nextCard);
      setLootboxRoulette(roulette);
      setLootboxOverlayPhase("rolling");
      debugGuestGame("lootbox-open-success", {
        runId,
        card: debugHomeLootCard(nextCard),
        rewards: result.rewards,
        resultSummary: debugSummarySnapshot(result.summary),
      });
      showToast("Маячок выбирает награду.");
    } catch (error) {
      if (lootboxOpenRunRef.current !== runId) {
        return;
      }

      const message = getErrorMessage(
        error,
        "Лутбокс сейчас недоступен.",
      );
      setLootboxRoulette(null);
      setLootboxOverlayPhase("ready");
      setLootboxOverlayError(message);
      debugGuestGame("lootbox-open-error", {
        runId,
        card: debugHomeLootCard(currentCard),
        message,
        error,
      });
      showToast(message);
    }
  }

  async function refreshLootboxOverlayConditions() {
    if (!lootboxOverlayCard) {
      return;
    }

    const currentCard = lootboxOverlayCard;
    setLootboxOverlayError(null);
    debugGuestGame("lootbox-overlay-refresh-start", {
      card: debugHomeLootCard(currentCard),
    });

    const nextSummary = await refreshGameSummary({
      pendingMessage: "Проверяем условия открытия.",
      successMessage: null,
      silent: true,
    });

    if (!nextSummary) {
      setLootboxOverlayError(
        "Не удалось проверить условия. Попробуйте еще раз.",
      );
      debugGuestGame("lootbox-overlay-refresh-error", {
        card: debugHomeLootCard(currentCard),
      });
      return;
    }

    const updatedCard = buildHomeLootCards(nextSummary, currentCard.id).find(
      (item) => item.id === currentCard.id,
    );

    if (!updatedCard) {
      setLootboxOverlayError("Лутбокс больше не найден в игровом модуле.");
      debugGuestGame("lootbox-overlay-refresh-missing", {
        card: debugHomeLootCard(currentCard),
        nextSummary: debugSummarySnapshot(nextSummary),
      });
      return;
    }

    setLootboxOverlayCard(updatedCard);
    debugGuestGame("lootbox-overlay-refresh-result", {
      previousCard: debugHomeLootCard(currentCard),
      updatedCard: debugHomeLootCard(updatedCard),
      nextSummary: debugSummarySnapshot(nextSummary),
    });

    if (!updatedCard.openable) {
      setLootboxOverlayError(
        lootboxCardBlockedTooltip(updatedCard) ??
          updatedCard.openBlocker ??
          lootBoxUnavailableCheckMessage(updatedCard),
      );
      return;
    }

    showToast("Условия обновлены. Контейнер можно открыть.");
  }

  function finishLootboxRoulette(skipped: boolean) {
    if (!lootboxRoulette || lootboxOverlayPhase !== "rolling") {
      return;
    }

    const roulette = lootboxRoulette;
    const eventDetail = lootboxRouletteEventDetail(roulette, skipped);

    setLootboxRoulette({ ...roulette, skipped });
    revealLootboxRarity({
      lootBoxId: roulette.lootBoxId,
      rewardLabel: roulette.reward,
      rewardRarity: roulette.rarity,
      rewardRarityLabel: roulette.rarityLabel,
      rewardDropChance: roulette.dropChance,
      caption: roulette.caption,
      winningIndex: roulette.winningIndex,
      skipped,
    });
    setLootboxOverlayPhase("opening");
    emitLootboxEvent("open-start", eventDetail);

    window.setTimeout(() => {
      if (lootboxOpenRunRef.current !== roulette.runId) {
        return;
      }

      setLootboxOverlayPhase("open");
      emitLootboxEvent("reward-ready", eventDetail);
      showToast(roulette.message);
    }, LOOTBOX_CASE_OPEN_MS);
  }

  function closeLootboxOverlay() {
    lootboxOpenRunRef.current += 1;
    setLootboxOverlayCard(null);
    setLootboxOverlayPhase("ready");
    setLootboxRoulette(null);
    setLootboxOverlayError(null);
    emitLootboxEvent("overlay-close");
  }

  function collectLootboxReward() {
    if (!lootboxOverlayCard || lootboxOverlayPhase !== "open") {
      return;
    }

    const roulette = lootboxRoulette;

    setLootboxOverlayPhase("collected");
    emitLootboxEvent(
      "reward-collected",
      roulette
        ? lootboxRouletteEventDetail(roulette, roulette.skipped)
        : { lootBoxId: lootboxOverlayCard.id, reward: lootboxOverlayCard.description },
    );
    showToast(`Награда отмечена: ${lootboxOverlayCard.description}.`);
  }

  function handlePromoSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    showToast(
      promoCode.trim()
        ? "Промокод принят в проверку."
        : "Введите промокод для активации.",
    );
  }

  async function handleNicknameSubmit(displayName: string) {
    const nextDisplayName = normalizeNickname(displayName);

    if (
      nicknamePending ||
      nextDisplayName === normalizeNickname(summary.profile.displayName)
    ) {
      return;
    }

    setNicknamePending(true);
    showToast("Сохраняем никнейм.");

    try {
      const nextSummary = await updateGameProfileNickname(nextDisplayName);

      onSummaryChange(nextSummary);
      showToast("Никнейм обновлен.");
    } catch (error) {
      showToast(getErrorMessage(error, "Не удалось сохранить никнейм."));
      throw error;
    } finally {
      setNicknamePending(false);
    }
  }

  return (
    <div className="lp-club-home">
      <header className="lp-club-topbar">
        <div className="lp-club-menu">
          <button
            type="button"
            className="lp-club-menu-button"
            aria-label="Открыть меню"
            aria-expanded={menuOpen}
            aria-controls="gameModuleMenu"
            onClick={() => setMenuOpen((value) => !value)}
          >
            <MenuIcon />
          </button>

          <nav
            id="gameModuleMenu"
            className={[
              "lp-club-menu-panel",
              menuOpen ? "is-open" : "",
            ].join(" ")}
            aria-label="Меню игрового модуля"
            hidden={!menuOpen}
          >
            <button type="button" onClick={focusPlayerProfile}>
              <ProfileIcon />
              <span>Профиль</span>
            </button>
            <Link href="/game/clubs" onClick={() => setMenuOpen(false)}>
              <ClubIcon />
              <span>Сменить клуб</span>
            </Link>
            <button type="button" onClick={handleLogout}>
              <ExitIcon />
              <span>Выйти</span>
            </button>
          </nav>
        </div>

        <div className="lp-club-network">
          <Link href="/start" className="lp-club-brand" aria-label="LeetPlus">
            <BrandMark logoUrl={brandLogoUrl} title={brandLogoTitle} />
            <span>{summary.tenant.name}</span>
          </Link>
          <Link href="/game/clubs" className="lp-club-switch">
            <ClubIcon />
            <span>{summary.store.name}</span>
          </Link>
        </div>

        <div
          className="lp-club-session-state"
          title="Телефон подтвержден, клуб выбран"
        >
          Профиль активен
        </div>
      </header>

      <div
        ref={shellRef}
        className={[
          "lp-club-shell",
          questsExpanded ? "is-quests-expanded" : "",
        ].join(" ")}
      >
        <div className="lp-club-main-flow">
          <section className="lp-club-stage" aria-label="Главный блок клуба">
            <HomeBannerGrid
              banners={homeBanners}
              onToast={showToast}
            />
          </section>

          <HomeLootBoxes
            sectionRef={lootBoxesRef}
            cards={lootCards}
            refreshPending={summaryRefreshPending}
            onRefresh={() => void refreshGameSummary()}
            onSelect={openLootboxOverlay}
          />

          <HomeBattlePass
            sectionRef={battlePassRef}
            summary={summary}
            battlePass={summary.battlePass.active}
            quests={battleQuests}
            progress={battlePassProgress}
            rewardLabel={mainRewardLabel}
            seasonName={summary.battlePass.active?.name ?? "Сезон клуба"}
          />
        </div>

        <PlayerProfilePanel
          summary={summary}
          profileLogoUrl={brandLogoUrl}
          profileLogoTitle={brandLogoTitle}
          completedQuestCount={completedQuestCount}
          questTotalCount={questTotalCount}
          quests={playerQuests}
          checkInAction={checkInAction}
          checkInSummary={checkInSummary}
          checkInAvailable={checkInAvailable}
          checkInPending={checkInPending}
          questsExpanded={questsExpanded}
          selectedQuestId={selectedQuestId}
          promoCode={promoCode}
          nicknamePending={nicknamePending}
          onPromoCodeChange={setPromoCode}
          onPromoSubmit={handlePromoSubmit}
          onNicknameSubmit={handleNicknameSubmit}
          onCheckIn={handleCheckIn}
          onQuestClick={handleQuestClick}
          onQuestsToggle={toggleQuestsExpanded}
        />

        <QuestBoard
          quests={playerQuests}
          expanded={questsExpanded}
          selectedQuestId={selectedQuestId}
          style={questBoardStyle}
          onClose={closeQuestBoard}
          onQuestClick={handleQuestClick}
        />
      </div>

      <div
        className={[
          "lp-club-toast",
          toastMessage ? "is-visible" : "",
        ].join(" ")}
        role="status"
        aria-live="polite"
      >
        {toastMessage}
      </div>

      {lootboxOverlayCard ? (
        <LootboxOpeningOverlay
          card={lootboxOverlayCard}
          phase={lootboxOverlayPhase}
          roulette={lootboxRoulette}
          errorMessage={lootboxOverlayError}
          checkingConditions={summaryRefreshPending}
          rewardRef={lootboxRewardRef}
          onOpen={beginLootboxOpening}
          onClose={closeLootboxOverlay}
          onCollect={collectLootboxReward}
          onRefreshConditions={refreshLootboxOverlayConditions}
          onRouletteFinish={finishLootboxRoulette}
        />
      ) : null}

      {unavailableLootboxCard ? (
        <LootboxUnavailableModal
          card={unavailableLootboxCard}
          checking={summaryRefreshPending}
          message={unavailableLootboxMessage}
          onClose={closeUnavailableLootboxModal}
          onRefresh={refreshUnavailableLootboxConditions}
        />
      ) : null}

      {activeCompletionDialog?.kind === "BATTLE_PASS" ? (
        <BattlePassLevelCompletionModal
          completion={activeCompletionDialog.completion}
          onClose={closeActiveCompletionDialog}
        />
      ) : null}

      {activeCompletionDialog?.kind === "CHECK_IN" ? (
        <CheckInCompletionModal
          completion={activeCompletionDialog.completion}
          onClose={closeActiveCompletionDialog}
        />
      ) : null}

      {activeCompletionDialog?.kind === "QUEST" ? (
        <QuestCompletionModal
          completion={activeCompletionDialog.completion}
          onClose={closeActiveCompletionDialog}
        />
      ) : null}
    </div>
  );
}

function LootboxUnavailableModal({
  card,
  checking,
  message,
  onClose,
  onRefresh,
}: {
  card: HomeLootCard;
  checking: boolean;
  message: UnavailableLootboxMessage;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const requirements = lootBoxGuestRequirementLines(card);

  return (
    <div
      id="lootboxUnavailable"
      className="lp-quest-complete-overlay lp-lootbox-unavailable-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lootboxUnavailableTitle"
    >
      <div className="lp-quest-complete-dialog lp-lootbox-unavailable-dialog">
        <button
          type="button"
          className="lp-quest-complete-close"
          aria-label="Закрыть окно"
          onClick={onClose}
        >
          ×
        </button>
        <span className="lp-quest-complete-kicker lp-lootbox-unavailable-kicker">
          Кейс недоступен
        </span>
        <h3 id="lootboxUnavailableTitle">{card.title}</h3>
        <p className="lp-lootbox-unavailable-lead">
          Пока условия открытия не выполнены.
        </p>

        <div className="lp-lootbox-unavailable-block">
          <span>Что нужно сделать</span>
          <ul>
            {requirements.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        {card.openBlocker ? (
          <div className="lp-lootbox-unavailable-note">
            <span>Сейчас</span>
            <strong>{card.openBlocker}</strong>
          </div>
        ) : null}

        {message ? (
          <p className="lp-lootbox-unavailable-status" role="status">
            {message}
          </p>
        ) : null}

        <div className="lp-lootbox-unavailable-actions">
          <button
            type="button"
            className="lp-lootbox-unavailable-secondary"
            onClick={onClose}
          >
            Понятно
          </button>
          <button
            type="button"
            className="lp-lootbox-unavailable-primary"
            onClick={onRefresh}
            disabled={checking}
          >
            {checking ? "Проверяем..." : "Проверить условия"}
          </button>
        </div>
      </div>
    </div>
  );
}

function QuestCompletionModal({
  completion,
  onClose,
}: {
  completion: QuestCompletionDialog;
  onClose: () => void;
}) {
  return (
    <div
      className="lp-quest-complete-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="questCompleteTitle"
    >
      <div className="lp-quest-complete-dialog">
        <button
          type="button"
          className="lp-quest-complete-close"
          aria-label="Закрыть поздравление"
          onClick={onClose}
        >
          ×
        </button>
        <span className="lp-quest-complete-kicker">Квест выполнен</span>
        <h3 id="questCompleteTitle">{completion.title}</h3>
        <div className="lp-quest-complete-reward">
          <span>Награда</span>
          <strong>{completion.rewardLabel}</strong>
        </div>
        <div className="lp-quest-complete-meta">
          <span>{completion.statusLabel}</span>
          <span>{formatDate(completion.receivedAt)}</span>
        </div>
        <button
          type="button"
          className="lp-quest-complete-action"
          onClick={onClose}
        >
          Отлично
        </button>
      </div>
    </div>
  );
}

function HomeBannerGrid({
  banners,
  onToast,
}: {
  banners: HomeBanner[];
  onToast: (message: string) => void;
}) {
  return (
    <div className="lp-club-banner-grid" aria-label="Баннеры клуба">
      {banners.map((banner) => {
        const titleStyle = bannerTitleStyle(banner.title);
        const className = [
          "lp-club-banner",
          banner.featured ? "is-featured" : "",
          banner.imageUrl ? "has-image" : "",
        ].join(" ");
        const isHttpExternal = isHttpExternalActionUrl(banner.href);
        const opensInNewTab =
          isHttpExternal ||
          banner.href === "/game/rewards" ||
          banner.href === "/play/game/rewards";
        const content = (
          <>
            {banner.imageUrl ? (
              <span className="lp-club-banner-media" aria-hidden="true">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt="" src={banner.imageUrl} />
              </span>
            ) : null}
            <span className="lp-club-banner-content">
              <span>
                <span className="lp-club-banner-kicker">{banner.label}</span>
                <span className="lp-club-banner-title">{banner.title}</span>
                <span className="lp-club-banner-copy">{banner.description}</span>
              </span>
              <span className="lp-club-banner-tag">{banner.tag}</span>
            </span>
          </>
        );

        if (isInternalHref(banner.href)) {
          return (
            <Link
              key={banner.id}
              href={banner.href}
              target={opensInNewTab ? "_blank" : undefined}
              rel={opensInNewTab ? "noreferrer" : undefined}
              className={className}
              style={titleStyle}
              onClick={() => onToast(`Открыт раздел: ${banner.title}.`)}
            >
              {content}
            </Link>
          );
        }

        return (
          <a
            key={banner.id}
            href={banner.href}
            target={isHttpExternal ? "_blank" : undefined}
            rel={isHttpExternal ? "noreferrer" : undefined}
            className={className}
            style={titleStyle}
            onClick={() => onToast(`Открыт раздел: ${banner.title}.`)}
          >
            {content}
          </a>
        );
      })}
    </div>
  );
}

function HomeLootBoxes({
  sectionRef,
  cards,
  refreshPending,
  onRefresh,
  onSelect,
}: {
  sectionRef?: RefObject<HTMLElement | null>;
  cards: HomeLootCard[];
  refreshPending: boolean;
  onRefresh: () => void;
  onSelect: (card: HomeLootCard) => void;
}) {
  return (
    <section
      id="lootBoxes"
      ref={sectionRef}
      className="lp-club-panel lp-club-lootboxes"
      aria-label="Лутбоксы"
    >
      <div className="lp-club-section-head">
        <span>
          <h2>Лутбоксы</h2>
          <p>
            Быстрые награды за активность в клубе и прохождение цепочки заданий.
          </p>
        </span>
        <button
          type="button"
          className="lp-club-icon-badge lp-club-refresh-button"
          onClick={onRefresh}
          disabled={refreshPending}
          aria-label={refreshPending ? "Обновляем лутбоксы" : "Обновить лутбоксы"}
        >
          <RefreshIcon />
        </button>
      </div>

      <div className="lp-club-loot-grid">
        {cards.length ? (
          cards.map((card, index) => {
            const blockedReason = lootboxCardBlockedTooltip(card);

            return (
          <button
            key={card.id}
            type="button"
            className={[
              "lootbox-entry",
              "lp-lootbox-entry",
              card.active ? "is-active" : "",
              !card.openable ? "is-disabled" : "",
            ].join(" ")}
            aria-haspopup="dialog"
            aria-controls={card.openable ? "lootboxOverlay" : "lootboxUnavailable"}
            onClick={() => onSelect(card)}
          >
            <span className="lp-lootbox-entry-top">
              <span>
                <span className="lp-lootbox-entry-label">
                  {index === 0 ? "Лутбокс дня" : "Клубный контейнер"}
                </span>
                <strong>{card.title}</strong>
              </span>
              <span className="lp-lootbox-entry-state-wrap">
                <span className="lp-lootbox-entry-state">{card.status}</span>
                {blockedReason ? (
                  <span className="lp-lootbox-blocker-chip">
                    почему?
                  </span>
                ) : null}
              </span>
            </span>
            <span className="lp-lootbox-entry-art" aria-hidden="true">
              <Image
                src={lootboxSkinForRarity(card.caseRarity)}
                alt=""
                width={1024}
                height={1024}
                sizes="230px"
                draggable={false}
              />
            </span>
            <span className="lp-lootbox-entry-bottom">
              <span>{lootboxCardHint(card)}</span>
              <span className="lp-lootbox-mini-lock" aria-hidden="true">
                <LockIcon />
              </span>
            </span>
          </button>
            );
          })
        ) : (
          <p className="lp-club-loot-empty">
            Клуб пока не опубликовал активные лутбоксы.
          </p>
        )}
      </div>
    </section>
  );
}

function LootboxOpeningOverlay({
  card,
  phase,
  roulette,
  errorMessage,
  checkingConditions,
  rewardRef,
  onOpen,
  onClose,
  onCollect,
  onRefreshConditions,
  onRouletteFinish,
}: {
  card: HomeLootCard;
  phase: LootboxOverlayPhase;
  roulette: LootboxRouletteState | null;
  errorMessage: string | null;
  checkingConditions: boolean;
  rewardRef: RefObject<HTMLButtonElement | null>;
  onOpen: () => void;
  onClose: () => void;
  onCollect: () => void;
  onRefreshConditions: () => void;
  onRouletteFinish: (skipped: boolean) => void;
}) {
  const rouletteTrackRef = useRef<HTMLDivElement | null>(null);
  const rouletteAnimationRef = useRef<Animation | null>(null);
  const completeRouletteRef = useRef<((skipped: boolean) => void) | null>(null);
  const onRouletteFinishRef = useRef(onRouletteFinish);
  const isReady = phase === "ready";
  const isCharging = phase === "charging";
  const isRolling = phase === "rolling";
  const isOpening = phase === "opening";
  const isOpen = phase === "open";
  const isCollected = phase === "collected";
  const rewardRarity =
    normalizeLootboxRarity(roulette?.rarity ?? card.rewardRarity) ?? "common";
  const rewardRarityLabel =
    roulette?.rarityLabel ?? card.rewardRarityLabel ?? LOOTBOX_RARITY_LABELS[rewardRarity];
  const caseRarity = normalizeLootboxRarity(card.caseRarity) ?? "common";
  const rarityRevealed = isOpening || isOpen || isCollected;
  const visibleLootboxSkin = lootboxSkinForRarity(caseRarity);
  const rouletteVisible =
    Boolean(roulette) && (isRolling || isOpening || isOpen || isCollected);
  const rouletteResultLabel = !roulette
    ? "selection pending"
    : isRolling
      ? "selection in progress"
      : `${roulette.reward} / ${rewardRarityLabel}`;
  const statusLabel = isCollected
    ? "Награда сохранена"
    : isOpen
      ? "Контейнер открыт"
      : isOpening
        ? `Редкость: ${rewardRarityLabel}`
        : isRolling
          ? "Идет рулетка наград"
          : isCharging
          ? "Контейнер активируется"
          : "Нажмите на контейнер, чтобы открыть";
  const primaryActionLabel = isCollected
    ? "Готово"
    : isOpen
      ? "Забрать результат"
      : isOpening || isCharging || isRolling
        ? "Открывается"
        : errorMessage
          ? "Попробовать еще раз"
        : "Открыть контейнер";
  const handlePrimaryAction = isCollected
    ? onClose
    : isOpen
      ? onCollect
      : isReady
        ? onOpen
        : undefined;

  useEffect(() => {
    onRouletteFinishRef.current = onRouletteFinish;
  }, [onRouletteFinish]);

  useEffect(() => {
    const track = rouletteTrackRef.current;

    if (!isRolling || !roulette || !track) {
      completeRouletteRef.current = null;
      return;
    }

    const rouletteTrack = track;
    let animationFrameId = 0;
    let finishTimerId = 0;
    let settled = false;
    const startX = 96;

    function clearRouletteAnimation() {
      if (!rouletteAnimationRef.current) {
        return;
      }

      rouletteAnimationRef.current.onfinish = null;
      rouletteAnimationRef.current.oncancel = null;
      rouletteAnimationRef.current.cancel();
      rouletteAnimationRef.current = null;
    }

    rouletteTrack.style.transform = `translate3d(${startX}px, 0, 0)`;

    animationFrameId = window.requestAnimationFrame(() => {
      const winningCard =
        rouletteTrack.querySelector<HTMLElement>('[data-winning="true"]');

      if (!winningCard) {
        onRouletteFinishRef.current(false);
        return;
      }

      const selectedWinningCard = winningCard;
      const cardCenter =
        selectedWinningCard.offsetLeft + selectedWinningCard.offsetWidth / 2;
      const endX = -cardCenter;
      const baseDetail = lootboxRouletteEventDetail(roulette, false);

      function completeRoulette(skipped = false) {
        if (settled) {
          return;
        }

        settled = true;
        clearRouletteAnimation();
        completeRouletteRef.current = null;
        rouletteTrack.style.transform = `translate3d(${endX}px, 0, 0)`;
        selectedWinningCard.classList.add("is-winning");

        const finishDetail = {
          ...baseDetail,
          skipped,
        };

        if (skipped) {
          emitLootboxEvent("roulette-skip", finishDetail);
        }

        emitLootboxEvent("roulette-finish", finishDetail);
        finishTimerId = window.setTimeout(
          () => onRouletteFinishRef.current(skipped),
          skipped ? 60 : 540,
        );
      }

      completeRouletteRef.current = completeRoulette;
      emitLootboxEvent("roulette-start", {
        lootBoxId: roulette.lootBoxId,
        durationMs: roulette.durationMs,
        possibleRewards: roulette.items.length,
      });

      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      const duration = reduceMotion ? 1 : roulette.durationMs;

      rouletteAnimationRef.current = track.animate(
        [
          { transform: `translate3d(${startX}px, 0, 0)` },
          { transform: `translate3d(${endX + 760}px, 0, 0)`, offset: 0.54 },
          { transform: `translate3d(${endX + 320}px, 0, 0)`, offset: 0.76 },
          { transform: `translate3d(${endX + 118}px, 0, 0)`, offset: 0.89 },
          { transform: `translate3d(${endX + 34}px, 0, 0)`, offset: 0.97 },
          { transform: `translate3d(${endX}px, 0, 0)` },
        ],
        {
          duration,
          easing: "cubic-bezier(0.12, 0.02, 0.14, 1)",
          fill: "forwards",
        },
      );

      rouletteAnimationRef.current.onfinish = () => completeRoulette(false);
      rouletteAnimationRef.current.oncancel = () => {
        if (settled) {
          return;
        }

        completeRouletteRef.current = null;
        rouletteAnimationRef.current = null;
      };
    });

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.clearTimeout(finishTimerId);

      if (!settled) {
        clearRouletteAnimation();
      }

      completeRouletteRef.current = null;
    };
  }, [isRolling, roulette]);

  function handleMachineKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!isReady || (event.key !== "Enter" && event.key !== " ")) {
      return;
    }

    event.preventDefault();
    onOpen();
  }

  function handleSkipRoulette(event: ReactMouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    completeRouletteRef.current?.(true);
  }

  return (
    <div
      id="lootboxOverlay"
      className={[
        "lp-lootbox-overlay",
        `rarity-${rewardRarity}`,
        rarityRevealed ? "rarity-revealed" : "rarity-hidden",
      ].join(" ")}
      role="dialog"
      aria-modal="true"
      aria-labelledby="lootboxOverlayTitle"
    >
      <div className="lp-lootbox-dialog">
        <button
          type="button"
          className="lp-lootbox-close"
          aria-label="Закрыть окно лутбокса"
          onClick={onClose}
        >
          ×
        </button>

        <div className="lp-lootbox-dialog-head">
          <span className="lp-lootbox-kicker">Открытие лутбокса</span>
          <h3 id="lootboxOverlayTitle">{card.title}</h3>
          <p>{statusLabel}</p>
        </div>

        {errorMessage ? (
          <div className="lp-lootbox-open-error" role="alert">
            <span>Почему не открывается</span>
            <strong>{errorMessage}</strong>
            <button
              type="button"
              onClick={onRefreshConditions}
              disabled={checkingConditions}
            >
              {checkingConditions ? "Проверяем..." : "Проверить условия"}
            </button>
          </div>
        ) : null}

        {rouletteVisible && roulette ? (
          <div
            className={[
              "lp-lootbox-roulette",
              isRolling ? "is-visible" : "",
              !isRolling ? "is-finished" : "",
            ].join(" ")}
            aria-hidden={isCollected}
          >
            <div className="lp-lootbox-roulette-window">
              <div ref={rouletteTrackRef} className="lp-lootbox-roulette-track">
                {roulette.items.map((item, index) => {
                  const isWinner = Boolean(item.isWinner);
                  const canCollect = isWinner && isOpen;
                  const itemRarity =
                    rarityRevealed && item.rarity ? item.rarity : "hidden";
                  const itemCaption = isWinner
                    ? isCollected
                      ? "Получено"
                      : canCollect
                        ? "Забрать"
                        : rarityRevealed
                          ? item.caption
                          : "locked"
                    : rarityRevealed
                      ? item.caption
                      : "locked";

                  return (
                    <button
                      key={`${item.id}-${index}`}
                      type="button"
                      ref={isWinner ? rewardRef : undefined}
                      className={[
                        "lp-lootbox-roulette-card",
                        isWinner && !isRolling ? "is-winning" : "",
                        canCollect ? "can-collect" : "",
                        isWinner && isCollected ? "is-collected" : "",
                      ].join(" ")}
                      data-rarity={itemRarity}
                      data-winning={isWinner ? "true" : undefined}
                      disabled={!canCollect}
                      tabIndex={canCollect ? 0 : -1}
                      aria-label={
                        canCollect ? `Забрать награду ${item.reward}` : undefined
                      }
                      onClick={(event) => {
                        event.stopPropagation();

                        if (canCollect) {
                          onCollect();
                        }
                      }}
                    >
                      <strong>{item.reward}</strong>
                      <i aria-hidden="true" />
                      <span>{itemCaption}</span>
                    </button>
                  );
                })}
              </div>
              <span className="lp-lootbox-roulette-marker" aria-hidden="true" />
            </div>
            <div className="lp-lootbox-roulette-caption">
              <span>possible rewards</span>
              <strong>{rouletteResultLabel}</strong>
              <button
                type="button"
                className="lp-lootbox-roulette-skip"
                hidden={!isRolling}
                onClick={handleSkipRoulette}
              >
                Пропустить
              </button>
            </div>
          </div>
        ) : null}

        <div
          className={[
            "lp-lootbox-machine",
            isReady ? "is-ready" : "",
            isCharging ? "is-charging" : "",
            isRolling ? "is-rolling" : "",
            isOpening ? "is-opening" : "",
            isOpen || isCollected ? "is-open" : "",
            isCollected ? "is-collected" : "",
          ].join(" ")}
          role={isReady ? "button" : undefined}
          tabIndex={isReady ? 0 : undefined}
          aria-label={isReady ? "Открыть лутбокс" : undefined}
          onClick={isReady ? onOpen : undefined}
          onKeyDown={handleMachineKeyDown}
        >
          <span className="lp-lootbox-energy-field" aria-hidden="true" />
          <span className="lp-lootbox-shock-ring" aria-hidden="true" />
          <span className="lp-lootbox-energy-slit" aria-hidden="true" />
          <span className="lp-lootbox-beam" />
          <Image
            className="lp-lootbox-case-image"
            src={visibleLootboxSkin}
            alt=""
            width={1024}
            height={1024}
            sizes="(max-width: 768px) 88vw, 500px"
            aria-hidden="true"
            draggable={false}
          />
          <span className="lp-lootbox-lock-open" aria-hidden="true">
            <LockIcon />
          </span>
          {Array.from({ length: 9 }, (_, index) => (
            <span
              key={index}
              className="lp-lootbox-particle"
              style={{ "--particle-index": index } as CSSProperties}
            />
          ))}
        </div>

        <div className="lp-lootbox-dialog-actions">
          <button type="button" className="lp-club-ghost-link" onClick={onClose}>
            Закрыть
          </button>
          <button
            type="button"
            className="lp-club-primary-link"
            disabled={isOpening || isCharging || isRolling || checkingConditions}
            onClick={handlePrimaryAction}
          >
            {primaryActionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function HomeBattlePass({
  sectionRef,
  summary,
  battlePass,
  quests,
  progress,
  rewardLabel,
  seasonName,
}: {
  sectionRef?: RefObject<HTMLElement | null>;
  summary: GuestPortalGameSummary;
  battlePass: GuestPortalGameSummary["battlePass"]["active"];
  quests: HomeBattleQuest[];
  progress: number;
  rewardLabel: string;
  seasonName: string;
}) {
  const rewards = useMemo(
    () => buildBattlePassRewardCards(battlePass, quests),
    [battlePass, quests],
  );
  const initialRewardId =
    rewards.find((reward) => reward.status === "ready")?.id ??
    rewards.find((reward) => reward.status === "current")?.id ??
    rewards[0]?.id ??
    null;
  const [activeRewardId, setActiveRewardId] = useState<string | null>(null);
  const [detailRewardId, setDetailRewardId] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [seasonRewardsOpen, setSeasonRewardsOpen] = useState(false);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const lastScrollEventRef = useRef(0);
  const selectedRewardId =
    activeRewardId && rewards.some((reward) => reward.id === activeRewardId)
      ? activeRewardId
      : initialRewardId;

  const activeReward =
    rewards.find((reward) => reward.id === selectedRewardId) ??
    rewards.find((reward) => reward.status === "ready") ??
    rewards.find((reward) => reward.status === "current") ??
    rewards[0] ??
    null;
  const currentReward =
    rewards.find((reward) => reward.status === "current") ??
    rewards.find((reward) => reward.status === "ready") ??
    activeReward;
  const detailReward =
    detailRewardId
      ? rewards.find((reward) => reward.id === detailRewardId) ?? null
      : null;
  const totalLevels = Math.max(rewards.length, battlePass?.levels.length ?? 0, 1);
  const currentLevel = Math.min(
    totalLevels,
    Math.max(0, battlePass?.currentLevel ?? currentReward?.level ?? activeReward?.level ?? 0),
  );
  const levelLineScale =
    totalLevels > 1 ? clampPercent(((currentLevel - 1) / (totalLevels - 1)) * 100) / 100 : 1;
  const progressCountLabel = `${formatNumber(currentLevel)} / ${formatNumber(totalLevels)}`;
  const progressQuestLabel = currentReward?.quest
    ? `Сейчас: ${currentReward.quest.title}`
    : currentReward
      ? `Сейчас: ${currentReward.title}`
      : null;
  const mainReward = rewards[rewards.length - 1] ?? activeReward;
  const mainRewardLevel = mainReward?.level ?? totalLevels;
  const mainRewardLabel =
    mainReward?.type === "lootbox"
      ? mainReward.title
      : rewardLabel || mainReward?.title || "Сезонный контейнер";
  const trackGapExpression = Array.from(
    { length: Math.max(rewards.length - 1, 0) },
    () => "var(--battlepass-card-gap)",
  ).join(" - ");
  const railEdgeOffset =
    rewards.length > 1 && trackGapExpression
      ? `calc((100% - ${trackGapExpression}) / ${rewards.length * 2})`
      : "50%";
  const trackGridStyle = {
    gridTemplateColumns: `repeat(${rewards.length}, minmax(var(--battlepass-card-width), 1fr))`,
  } as CSSProperties;
  const railStyle = {
    ...trackGridStyle,
    "--battlepass-line-scale": String(levelLineScale),
    "--battlepass-rail-edge": railEdgeOffset,
  } as CSSProperties & Record<"--battlepass-line-scale" | "--battlepass-rail-edge", string>;

  useEffect(() => {
    if (!detailReward && !helpOpen && !seasonRewardsOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setDetailRewardId(null);
        setHelpOpen(false);
        setSeasonRewardsOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [detailReward, helpOpen, seasonRewardsOpen]);

  const handleHelpClick = () => {
    emitBattlePassEvent("help_click", {
      seasonId: battlePass?.id ?? null,
      seasonName,
    });
    setHelpOpen(true);
  };

  const handleTrackScroll = () => {
    const track = trackRef.current;
    const now = Date.now();

    if (!track || now - lastScrollEventRef.current < 260) {
      return;
    }

    lastScrollEventRef.current = now;
    emitBattlePassEvent("track_scroll", {
      seasonId: battlePass?.id ?? null,
      scrollLeft: Math.round(track.scrollLeft),
      scrollWidth: track.scrollWidth,
      clientWidth: track.clientWidth,
    });
  };

  const focusReward = (reward: BattlePassRewardCard) => {
    setActiveRewardId(reward.id);
    emitBattlePassEvent("level_focus", battlePassRewardEventDetail(reward, battlePass));
  };

  const clickReward = (
    reward: BattlePassRewardCard,
    element: HTMLElement,
  ) => {
    focusReward(reward);
    element.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
    emitBattlePassEvent("reward_click", battlePassRewardEventDetail(reward, battlePass));

    if (reward.status === "ready") {
      emitBattlePassEvent("reward_claim", battlePassRewardEventDetail(reward, battlePass));
    }

    setDetailRewardId(reward.id);
  };

  return (
    <section
      id="battlePass"
      ref={sectionRef}
      className="lp-club-panel lp-club-battlepass"
      aria-label="Баттлпасс"
    >
      <div className="lp-club-battlepass-head">
        <span className="lp-club-battlepass-title">
          <h2>Баттлпасс клуба</h2>
          <p>Премиальная сезонная карта наград для гостей клуба.</p>
        </span>
        <button
          type="button"
          className="lp-club-battlepass-help"
          onClick={handleHelpClick}
        >
          <span aria-hidden="true">?</span>
          Как работает
        </button>
      </div>

      <div className="lp-club-battlepass-top">
        <button
          type="button"
          className="lp-club-battlepass-season lp-club-battlepass-season-button"
          aria-haspopup="dialog"
          onClick={() => setSeasonRewardsOpen(true)}
        >
          <span className="lp-club-battlepass-emblem">
            <picture>
              <source
                srcSet="/assets/brand/leetplus-logo-white.svg?v=battlepass-track"
                media="(prefers-color-scheme: dark)"
              />
              <img
                src="/assets/brand/leetplus-logo-white.svg?v=battlepass-track"
                alt="LeetPlus"
              />
            </picture>
          </span>
          <span className="lp-club-battlepass-season-copy">
            <strong>{seasonName}</strong>
            <span>
              <b>{formatNumber(progress)}%</b>
              {battlePassSeasonTimeLabel(battlePass?.periodTo)}
            </span>
            <small>Все награды сезона</small>
          </span>
        </button>

        <div className="lp-club-battlepass-main-reward">
          <span className="lp-club-battlepass-main-copy">
            <small>Главная награда</small>
            <strong>Сезонный контейнер</strong>
            <span>{mainRewardLabel}</span>
            <em>Открывается на шаге {formatNumber(mainRewardLevel)}</em>
          </span>
          <span className="lp-club-battlepass-main-case">
            <Image
              src={lootboxSkinForRarity(mainReward?.rarity ?? "legendary")}
              alt=""
              width={280}
              height={190}
              sizes="(max-width: 560px) 48vw, 220px"
            />
          </span>
        </div>
      </div>

      <div className="lp-club-battlepass-track" aria-label="Очередь наград Battle Pass">
        <div
          ref={trackRef}
          className="lp-club-battlepass-track-scroll"
          onScroll={handleTrackScroll}
        >
          <div className="lp-club-battlepass-track-inner">
            <div className="lp-club-battlepass-level-rail" style={railStyle}>
              {rewards.map((reward) => (
                <button
                  key={`level-${reward.id}`}
                  type="button"
                  className={[
                    "lp-club-battlepass-level",
                    reward.status === "claimed" ? "is-done" : "",
                    reward.id === activeReward?.id ? "is-active" : "",
                  ].join(" ")}
                  aria-label={`Шаг ${formatNumber(reward.level)}`}
                  onClick={() => focusReward(reward)}
                  onFocus={() => focusReward(reward)}
                >
                  {formatNumber(reward.level)}
                </button>
              ))}
            </div>

            <div className="lp-club-battlepass-reward-grid" style={trackGridStyle}>
              {rewards.map((reward) => {
                const isActive = reward.id === activeReward?.id;

                return (
                  <button
                    key={reward.id}
                    type="button"
                    className={[
                      "lp-club-battlepass-reward",
                      reward.type === "lootbox" ? "is-case" : "",
                      isActive ? "is-active" : "",
                      reward.status === "locked" ? "is-locked" : "",
                      reward.status === "ready" ? "is-ready" : "",
                      reward.status === "claimed" ? "is-claimed" : "",
                    ].join(" ")}
                    data-rank={reward.rarity}
                    data-status={battlePassRewardStatusLabel(reward.status)}
                    data-reward-id={reward.id}
                    onClick={(event) => clickReward(reward, event.currentTarget)}
                    onFocus={() => focusReward(reward)}
                  >
                    <span className="lp-club-battlepass-reward-media">
                      <BattlePassRewardMedia reward={reward} />
                    </span>
                    <span className="lp-club-battlepass-reward-copy">
                      <strong>{reward.title}</strong>
                      <small>{reward.subtitle}</small>
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="lp-club-battlepass-progress">
              <span className="lp-club-battlepass-meter">
                <i style={{ width: `${clampPercent(progress)}%` }} />
              </span>
              <span className="lp-club-battlepass-progress-copy">
                <strong>{progressCountLabel}</strong>
                {progressQuestLabel ? <small>{progressQuestLabel}</small> : null}
              </span>
            </div>
          </div>
        </div>
      </div>

      {detailReward ? (
        <BattlePassQuestModal
          reward={detailReward}
          summary={summary}
          onClose={() => setDetailRewardId(null)}
        />
      ) : null}

      {helpOpen ? (
        <BattlePassHelpModal
          battlePass={battlePass}
          seasonName={seasonName}
          progress={progress}
          totalLevels={totalLevels}
          currentLevel={currentLevel}
          currentReward={currentReward}
          mainRewardLabel={mainRewardLabel}
          mainRewardLevel={mainRewardLevel}
          onClose={() => setHelpOpen(false)}
        />
      ) : null}

      {seasonRewardsOpen ? (
        <BattlePassSeasonRewardsModal
          seasonName={seasonName}
          overview={battlePass?.rewardOverview ?? null}
          onClose={() => setSeasonRewardsOpen(false)}
        />
      ) : null}
    </section>
  );
}

function CheckInCompletionModal({
  completion,
  onClose,
}: {
  completion: CheckInCompletionDialog;
  onClose: () => void;
}) {
  const titleId = completion.error
    ? "checkInErrorTitle"
    : completion.alreadyCounted
    ? "checkInAlreadyCountedTitle"
    : "checkInCompleteTitle";
  const rewardCaption = completion.error
    ? "Причина"
    : completion.alreadyCounted
    ? completion.rewardLabel
      ? "Ранее получено"
      : "Результат"
    : completion.rewardLabel
      ? "Вы получили"
      : "Результат";
  const rewardValue =
    (completion.error ? completion.note : completion.rewardLabel) ??
    (completion.error
      ? "Проверьте условия чек-ина и попробуйте еще раз."
      : completion.alreadyCounted
      ? "Повторная награда не начисляется"
      : "Чекин засчитан");

  return (
    <div
      className="lp-quest-complete-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) {
          onClose();
        }
      }}
    >
      <div
        className={`lp-quest-complete-dialog${completion.error ? " is-error" : ""}`}
      >
        <button
          type="button"
          className="lp-quest-complete-close"
          aria-label="Закрыть сообщение о чек-ине"
          onClick={onClose}
        >
          ×
        </button>
        <span className="lp-quest-complete-kicker">
          {completion.error
            ? "Чекин недоступен"
            : completion.alreadyCounted
              ? "Чекин уже засчитан"
              : "Чекин успешен"}
        </span>
        <h3 id={titleId}>
          {completion.error
            ? "Не удалось сделать чекин"
            : completion.alreadyCounted
              ? "Сегодня уже отмечались"
              : "Поздравляем!"}
        </h3>
        <div className="lp-quest-complete-reward">
          <span>{rewardCaption}</span>
          <strong>{rewardValue}</strong>
        </div>
        <div className="lp-quest-complete-meta">
          <span>
            {completion.error
              ? "Проверка чек-ина"
              : completion.alreadyCounted
              ? "Последний засчитанный чекин"
              : "Присутствие в клубе засчитано"}
          </span>
          <span>{formatDate(completion.receivedAt)}</span>
        </div>
        {completion.note && !completion.error ? (
          <p className="lp-checkin-complete-note">{completion.note}</p>
        ) : null}
        <button
          type="button"
          className="lp-quest-complete-action"
          onClick={onClose}
        >
          {completion.error
            ? "Понятно"
            : completion.alreadyCounted
              ? "Понятно"
              : "Отлично"}
        </button>
      </div>
    </div>
  );
}

function BattlePassSeasonRewardsModal({
  seasonName,
  overview,
  onClose,
}: {
  seasonName: string;
  overview: NonNullable<
    GuestPortalGameSummary["battlePass"]["active"]
  >["rewardOverview"] | null;
  onClose: () => void;
}) {
  const hasRewards = Boolean(
    overview &&
      (overview.ranges.length ||
        overview.guaranteed.length ||
        overview.possible.length),
  );
  const hasSeasonTotalRows = Boolean(
    overview && (overview.ranges.length || overview.guaranteed.length),
  );

  return (
    <div
      className="lp-quest-complete-overlay lp-battlepass-detail-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="battlePassSeasonRewardsTitle"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) {
          onClose();
        }
      }}
    >
      <div className="lp-quest-complete-dialog lp-battlepass-detail-dialog lp-battlepass-season-rewards-dialog">
        <button
          type="button"
          className="lp-quest-complete-close"
          aria-label="Закрыть награды сезона"
          onClick={onClose}
        >
          ×
        </button>

        <span className="lp-quest-complete-kicker">Награды сезона</span>
        <h3 id="battlePassSeasonRewardsTitle">Что можно заработать</h3>
        <p className="lp-battlepass-season-rewards-lead">
          Полный путь в сезоне {seasonName} открывает все награды ниже.
          Итог зависит от содержимого сезонных лутбоксов.
        </p>

        {hasRewards ? (
          <div className="lp-battlepass-season-rewards-content">
            {hasSeasonTotalRows ? (
              <div className="lp-battlepass-season-reward-group">
                <div className="lp-battlepass-season-range-header">
                  <span className="lp-battlepass-season-reward-heading">
                    Итог за сезон
                  </span>
                  <span>Гарантированно</span>
                  <span>Максимум</span>
                </div>
                <div className="lp-battlepass-season-range-list">
                  {overview?.ranges.map((reward) => (
                    <div
                      key={reward.type}
                      className="lp-battlepass-season-range-row"
                    >
                      <strong>{reward.label}</strong>
                      <b>{formatSeasonRewardValue(reward.min, reward.unit)}</b>
                      <i aria-hidden="true">
                        {reward.min === reward.max ? "" : "→"}
                      </i>
                      <b
                        className={
                          reward.min === reward.max ? "is-empty" : undefined
                        }
                      >
                        {reward.min === reward.max
                          ? "—"
                          : formatSeasonRewardValue(reward.max, reward.unit)}
                      </b>
                    </div>
                  ))}
                  {overview?.guaranteed.map((reward) => (
                    <div
                      key={`guaranteed:${reward.type}:${reward.label}`}
                      className="lp-battlepass-season-range-row is-guaranteed"
                    >
                      <strong>{reward.label}</strong>
                      <b>{formatGuaranteedSeasonRewardValue(reward.quantity)}</b>
                      <i aria-hidden="true" />
                      <b className="is-empty">—</b>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {overview?.possible.length ? (
              <div className="lp-battlepass-season-reward-group">
                <span className="lp-battlepass-season-reward-heading">
                  Возможные призы из лутбоксов
                </span>
                <div className="lp-battlepass-season-possible-list">
                  {overview.possible.map((reward) => (
                    <div key={reward.type}>
                      <strong>{reward.label}</strong>
                      <span>{reward.items.join(" · ")}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="lp-battlepass-season-rewards-empty">
            Состав наград этого сезона пока уточняется.
          </p>
        )}

        {overview?.unresolved.length ? (
          <p className="lp-battlepass-season-rewards-note">
            Некоторые сезонные контейнеры еще не раскрывают состав призов.
            Диапазон обновится автоматически после их настройки.
          </p>
        ) : null}

        <button
          type="button"
          className="lp-quest-complete-action"
          onClick={onClose}
        >
          Понятно
        </button>
      </div>
    </div>
  );
}

function formatSeasonRewardValue(value: number, unit: string) {
  return `${formatNumber(value)} ${unit}`.trim();
}

function formatGuaranteedSeasonRewardValue(quantity: number) {
  return quantity > 1
    ? `Гарантировано ×${formatNumber(quantity)}`
    : "Гарантировано";
}

function BattlePassLevelCompletionModal({
  completion,
  onClose,
}: {
  completion: BattlePassLevelCompletionDialog;
  onClose: () => void;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const hasNextLevel = completion.nextLevel !== null;

  return (
    <div
      className="lp-quest-complete-overlay lp-battlepass-detail-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="battlePassLevelCompleteTitle"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) {
          onClose();
        }
      }}
    >
      <div className="lp-quest-complete-dialog lp-battlepass-detail-dialog lp-battlepass-level-complete-dialog">
        <button
          type="button"
          className="lp-quest-complete-close"
          aria-label="Закрыть поздравление"
          onClick={onClose}
        >
          ×
        </button>

        <span className="lp-quest-complete-kicker">Уровень пройден</span>
        <span className="lp-battlepass-level-complete-mark" aria-hidden="true">
          {formatNumber(completion.completedLevel)}
        </span>
        <h3 id="battlePassLevelCompleteTitle">Поздравляем!</h3>
        <p className="lp-battlepass-level-complete-lead">
          Вы прошли уровень {formatNumber(completion.completedLevel)} баттлпасса
          {completion.completedTitle
            ? ` — «${completion.completedTitle}»`
            : ""}
          .
        </p>

        <div className="lp-battlepass-detail-lines">
          <div className="lp-battlepass-detail-line is-reward">
            <span>Награда уровня</span>
            <strong>{completion.rewardLabel}</strong>
          </div>

          {hasNextLevel ? (
            <div className="lp-battlepass-detail-line is-current">
              <span>Следующий уровень</span>
              <strong>
                {formatNumber(completion.nextLevel ?? 0)}. {completion.nextTitle}
              </strong>
              <p>
                Для прохождения следующего уровня вам необходимо: {completion.nextCondition}
              </p>
            </div>
          ) : (
            <div className="lp-battlepass-detail-line is-current">
              <span>Сезон завершен</span>
              <strong>Вы прошли весь баттлпасс «{completion.seasonName}».</strong>
              <p>Все доступные уровни этого сезона выполнены.</p>
            </div>
          )}
        </div>

        <button
          type="button"
          className="lp-quest-complete-action"
          onClick={onClose}
        >
          {hasNextLevel ? "К следующему уровню" : "Отлично"}
        </button>
      </div>
    </div>
  );
}

function BattlePassHelpModal({
  battlePass,
  seasonName,
  progress,
  totalLevels,
  currentLevel,
  currentReward,
  mainRewardLabel,
  mainRewardLevel,
  onClose,
}: {
  battlePass: GuestPortalGameSummary["battlePass"]["active"];
  seasonName: string;
  progress: number;
  totalLevels: number;
  currentLevel: number;
  currentReward: BattlePassRewardCard | null;
  mainRewardLabel: string;
  mainRewardLevel: number;
  onClose: () => void;
}) {
  const nextRewardLabel =
    battlePass?.nextRewardLabel ??
    currentReward?.plannedReward ??
    currentReward?.rewardValue ??
    currentReward?.title ??
    mainRewardLabel;

  return (
    <div
      className="lp-quest-complete-overlay lp-battlepass-detail-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="battlePassHelpTitle"
    >
      <div className="lp-quest-complete-dialog lp-battlepass-detail-dialog lp-battlepass-help-dialog">
        <button
          type="button"
          className="lp-quest-complete-close"
          aria-label="Закрыть пояснение Battle Pass"
          onClick={onClose}
        >
          ×
        </button>
        <span className="lp-quest-complete-kicker">Как работает</span>
        <h3 id="battlePassHelpTitle">Баттлпасс клуба</h3>
        <p className="lp-battlepass-detail-season">
          {seasonName} · шаг {formatNumber(currentLevel)} из {formatNumber(totalLevels)}
        </p>

        <div className="lp-battlepass-detail-progress">
          <div>
            <span>Прогресс сезона</span>
            <strong>{formatNumber(progress)}%</strong>
          </div>
          <span className="lp-battlepass-detail-meter">
            <i style={{ width: `${clampPercent(progress)}%` }} />
          </span>
        </div>

        <div className="lp-battlepass-detail-block">
          <span>Что это</span>
          <p>
            Баттлпасс собирает цепочку клубных заданий и наград. Выполняйте
            текущую задачу, чтобы продвигаться по этапам сезона.
          </p>
        </div>

        <div className="lp-battlepass-detail-block">
          <span>Как проходить шаги</span>
          <ul className="lp-battlepass-help-list">
            <li>Смотрите карточку с пометкой “Сейчас”.</li>
            <li>Нажмите на этап, чтобы увидеть подробное условие и награду.</li>
            <li>Когда условие выполнено, прогресс сезона перейдет к следующему этапу.</li>
          </ul>
        </div>

        <div className="lp-battlepass-detail-block is-current">
          <span>Награды</span>
          <p>
            Следующая награда: {nextRewardLabel}. Главная награда сезона:
            {" "}
            {mainRewardLabel}, открывается на шаге {formatNumber(mainRewardLevel)}.
          </p>
        </div>

        {!battlePass ? (
          <p className="lp-battlepass-help-note">
            Сезон пока не запущен. Когда клуб опубликует Battle Pass, здесь
            появятся этапы, условия и награды.
          </p>
        ) : null}

        <button type="button" className="lp-quest-complete-action" onClick={onClose}>
          Понятно
        </button>
      </div>
    </div>
  );
}

function BattlePassQuestModal({
  reward,
  summary,
  onClose,
}: {
  reward: BattlePassRewardCard;
  summary: GuestPortalGameSummary;
  onClose: () => void;
}) {
  const quest = reward.quest ?? null;
  const mission = findBattlePassQuestMission(summary, reward);
  const actualReward = findBattlePassQuestReward(summary, reward);
  const lootBoxDrop = findBattlePassQuestLootBoxDrop(
    summary,
    reward,
    actualReward,
    mission,
  );
  const activeStep =
    mission?.questSteps.find((step) => step.current) ??
    mission?.questSteps.find((step) => !step.completed) ??
    null;
  const statusLabel = quest?.status ?? battlePassRewardStatusLabel(reward.status);
  const condition = stripBattlePassDetailPrefix(
    quest?.condition ?? reward.condition ?? reward.description ?? reward.subtitle,
    "Условие",
  );
  const plannedReward = stripBattlePassDetailPrefix(
    quest?.reward ?? reward.plannedReward ?? reward.title,
    "Награда",
  );
  const fallbackRewardStatus = mission?.rewardStatus ?? null;
  const fallbackRewardLabel =
    fallbackRewardStatus?.rewardLabel ??
    (fallbackRewardStatus?.rewardAmount !== null &&
    fallbackRewardStatus?.rewardAmount !== undefined
      ? `${formatNumber(fallbackRewardStatus.rewardAmount)} бонусов`
      : null);
  const receivedAt =
    actualReward?.qualifiedAt ??
    lootBoxDrop?.qualifiedAt ??
    fallbackRewardStatus?.occurredAt ??
    null;
  const progress = battlePassDetailProgress(
    summary,
    reward,
    condition,
    quest,
    mission,
    activeStep,
  );

  return (
    <div
      className="lp-quest-complete-overlay lp-battlepass-detail-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="battlePassQuestTitle"
    >
      <div className="lp-quest-complete-dialog lp-battlepass-detail-dialog">
        <button
          type="button"
          className="lp-quest-complete-close"
          aria-label="Закрыть подробности задания"
          onClick={onClose}
        >
          ×
        </button>
        <span className="lp-quest-complete-kicker">{statusLabel}</span>
        <h3 id="battlePassQuestTitle">
          {quest?.title ?? `Этап ${formatNumber(reward.level)}`}
        </h3>

        <div className="lp-battlepass-detail-progress">
          <div>
            <span>Прогресс</span>
            <strong>{progress.label}</strong>
          </div>
          <span className="lp-battlepass-detail-meter">
            <i style={{ width: `${clampPercent(progress.percent)}%` }} />
          </span>
        </div>

        <div className="lp-battlepass-detail-lines">
          <div className="lp-battlepass-detail-line">
            <span>Задача</span>
            <p>{condition}</p>
          </div>

          {activeStep ? (
            <div className="lp-battlepass-detail-line is-current">
              <span>Текущий шаг</span>
              <strong>{activeStep.title}</strong>
              <p>{formatMissionStepProgress(activeStep)}</p>
            </div>
          ) : null}

          <div className="lp-battlepass-detail-line is-reward">
            <span>Награда</span>
            <strong>{plannedReward}</strong>
          </div>
        </div>

        {actualReward ? (
          <BattlePassReceivedRewardCard
            reward={actualReward}
            title={
              actualReward.sourceKind === "LOOT_BOX"
                ? "Содержимое кейса"
                : "Полученная награда"
            }
          />
        ) : fallbackRewardLabel ? (
          <div className="lp-battlepass-received-card">
            <span>Полученная награда</span>
            <strong>{fallbackRewardLabel}</strong>
            <p>{fallbackRewardStatus?.label}</p>
            {receivedAt ? <small>{formatDate(receivedAt)}</small> : null}
          </div>
        ) : reward.status === "claimed" ? (
          <div className="lp-battlepass-received-card">
            <span>Полученная награда</span>
            <p>Награда уже засчитана, но детальный результат не найден в текущем кошельке.</p>
          </div>
        ) : null}

        {lootBoxDrop && lootBoxDrop.id !== actualReward?.id ? (
          <BattlePassReceivedRewardCard
            reward={lootBoxDrop}
            title="Содержимое кейса"
          />
        ) : null}

        {receivedAt ? (
          <div className="lp-quest-complete-meta">
            <span>Получено</span>
            <span>{formatDate(receivedAt)}</span>
          </div>
        ) : null}

        <button
          type="button"
          className="lp-quest-complete-action"
          onClick={onClose}
        >
          Понятно
        </button>
      </div>
    </div>
  );
}

function BattlePassReceivedRewardCard({
  reward,
  title,
}: {
  reward: GameRewardHistoryItem;
  title: string;
}) {
  const rarityLabel = lootboxRewardRarityLabel(reward);
  const readyCode =
    reward.walletState === "READY" ? reward.rewardCode ?? reward.claimPayload : null;

  return (
    <div className="lp-battlepass-received-card">
      <span>{title}</span>
      <strong>{reward.rewardLabel}</strong>
      <p>
        {rewardHistoryValue(reward)} · {walletStateLabel(reward.walletState)}
      </p>
      {rarityLabel ? <small>{rarityLabel}</small> : null}
      {reward.rewardDropChance !== null ? (
        <small>Шанс выпадения: {formatRewardChance(reward.rewardDropChance)}</small>
      ) : null}
      {readyCode ? <em>Код кассиру: {readyCode}</em> : null}
      <small>{walletStateHint(reward.walletState)}</small>
    </div>
  );
}

function findBattlePassQuestMission(
  summary: GuestPortalGameSummary,
  reward: BattlePassRewardCard,
): GameMission | GameMissionHistoryItem | null {
  const quest = reward.quest;

  if (quest?.sourceKind !== "mission") {
    return null;
  }

  return (
    [...summary.missions.featured, ...summary.missions.history].find(
      (mission) => mission.id === quest.sourceId,
    ) ?? null
  );
}

function battlePassDetailProgress(
  summary: GuestPortalGameSummary,
  reward: BattlePassRewardCard,
  condition: string,
  quest: HomeBattleQuest | null,
  mission: GameMission | GameMissionHistoryItem | null,
  activeStep: GameMission["questSteps"][number] | null,
): BattlePassDetailProgress {
  if (quest?.progress) {
    return quest.progress;
  }

  if (activeStep) {
    const total = Math.max(1, activeStep.target);
    const current = activeStep.completed
      ? total
      : Math.min(total, Math.max(0, activeStep.progressCurrent));

    return {
      current,
      total,
      label: `${formatNumber(current)} / ${formatNumber(total)}`,
      percent: clampPercent((current / total) * 100),
    };
  }

  if (mission) {
    const lastStep = mission.questSteps[mission.questSteps.length - 1] ?? null;
    const total = Math.max(1, mission.progressTarget ?? lastStep?.target ?? 1);
    const current = Math.min(total, Math.max(0, mission.progressCurrent));

    return {
      current,
      total,
      label: playerQuestProgressLabel(current, total, mission.progressUnit),
      percent: clampPercent(mission.progressPercent),
    };
  }

  const done = reward.status === "claimed" || reward.status === "ready";

  return {
    current: done ? 1 : 0,
    total: 1,
    label: done ? "Выполнено" : "Ожидает выполнения",
    percent: done ? 100 : 0,
  };
}

function findBattlePassQuestReward(
  summary: GuestPortalGameSummary,
  reward: BattlePassRewardCard,
): GameRewardHistoryItem | null {
  const quest = reward.quest;

  if (!quest) {
    return findLatestRewardBySource(summary.rewards.recent, "BATTLE_PASS", reward.id);
  }

  if (quest.sourceKind !== "mission") {
    return null;
  }

  const candidates = summary.rewards.recent
    .filter((item) => item.sourceKind === "MISSION")
    .sort(compareRewardsByQualifiedAtDesc);
  const titleKey = normalizeRewardLookupText(quest.title);

  return (
    candidates.find((item) => item.sourceId === quest.sourceId) ??
    candidates.find((item) => {
      const sourceKey = normalizeRewardLookupText(item.sourceLabel);

      return Boolean(sourceKey && titleKey && sourceKey.includes(titleKey));
    }) ??
    candidates.find((item) => {
      const sourceKey = normalizeRewardLookupText(item.sourceLabel);

      return Boolean(sourceKey && titleKey && titleKey.includes(sourceKey));
    }) ??
    null
  );
}

function findLatestRewardBySource(
  rewards: GameRewardHistoryItem[],
  sourceKind: GameRewardHistoryItem["sourceKind"],
  sourceId: string,
) {
  return (
    rewards
      .filter((item) => item.sourceKind === sourceKind && item.sourceId === sourceId)
      .sort(compareRewardsByQualifiedAtDesc)[0] ?? null
  );
}

function findBattlePassQuestLootBoxDrop(
  summary: GuestPortalGameSummary,
  reward: BattlePassRewardCard,
  actualReward: GameRewardHistoryItem | null,
  mission: GameMission | GameMissionHistoryItem | null,
): GameRewardHistoryItem | null {
  if (actualReward?.sourceKind === "LOOT_BOX") {
    return actualReward;
  }

  if (!battlePassRewardLooksLikeLootBox(reward, actualReward)) {
    return null;
  }

  const candidates = summary.rewards.recent
    .filter((item) => item.sourceKind === "LOOT_BOX")
    .sort(compareRewardsByQualifiedAtDesc);

  if (!candidates.length) {
    return null;
  }

  const lookupKeys = [
    reward.title,
    reward.rewardValue,
    reward.quest?.reward,
    actualReward?.rewardLabel,
    actualReward?.sourceLabel,
  ]
    .map(normalizeRewardLookupText)
    .filter(Boolean);
  const directMatch = candidates.find((item) => {
    const sourceKey = normalizeRewardLookupText(item.sourceLabel);

    if (!sourceKey) {
      return false;
    }

    return lookupKeys.some(
      (key) => key.includes(sourceKey) || sourceKey.includes(key),
    );
  });

  if (directMatch) {
    return directMatch;
  }

  const completedAt = Date.parse(
    actualReward?.qualifiedAt ?? mission?.rewardStatus.occurredAt ?? "",
  );

  if (!Number.isFinite(completedAt)) {
    return null;
  }

  return (
    candidates.find(
      (item) => Date.parse(item.qualifiedAt) >= completedAt - 60_000,
    ) ?? null
  );
}

function compareRewardsByQualifiedAtDesc(
  left: GameRewardHistoryItem,
  right: GameRewardHistoryItem,
) {
  return Date.parse(right.qualifiedAt) - Date.parse(left.qualifiedAt);
}

function battlePassRewardLooksLikeLootBox(
  reward: BattlePassRewardCard,
  actualReward: GameRewardHistoryItem | null,
) {
  return [reward.type, reward.title, reward.rewardValue, reward.quest?.reward, actualReward?.rewardLabel]
    .filter(Boolean)
    .some((value) => /lootbox|case|кейс|лутбокс|контейнер/i.test(String(value)));
}

function normalizeRewardLookupText(value: string | null | undefined) {
  return (value ?? "")
    .toLocaleLowerCase("ru-RU")
    .replace(/[^a-zа-яё0-9]+/gi, " ")
    .trim();
}

function stripBattlePassDetailPrefix(value: string, prefix: string) {
  return value
    .replace(new RegExp(`^${prefix}:\\s*`, "i"), "")
    .replace(/\s+/g, " ")
    .trim();
}

function battlePassTokenDensity(label: string) {
  const length = Array.from(label.trim()).length;

  if (length > 18) {
    return "long";
  }

  if (length > 9) {
    return "medium";
  }

  return "short";
}

function BattlePassRewardMedia({ reward }: { reward: BattlePassRewardCard }) {
  if (reward.type === "lootbox") {
    return (
      <Image
        src={reward.image ?? lootboxSkinForRarity(reward.rarity)}
        alt=""
        width={180}
        height={130}
        sizes="132px"
      />
    );
  }

  const tokenLabel = reward.rewardValue ?? battlePassRewardTypeLabel(reward.type);
  const tokenDensity = battlePassTokenDensity(tokenLabel);

  return (
    <span
      className="lp-club-battlepass-token"
      data-density={tokenDensity}
      data-type={reward.type}
    >
      <span>{tokenLabel}</span>
    </span>
  );
}

function buildBattlePassRewardCards(
  battlePass: GuestPortalGameSummary["battlePass"]["active"],
  quests: HomeBattleQuest[],
): BattlePassRewardCard[] {
  if (!battlePass?.levels.length) {
    return quests.map((quest, index) =>
      battlePassRewardFromQuest(quest, index, quests.length),
    );
  }

  return battlePass.levels.map((level) =>
    battlePassRewardFromLevel(level, battlePass),
  );
}

function battlePassRewardFromLevel(
  level: HomeBattlePassLevel,
  battlePass: HomeBattlePassSeason,
): BattlePassRewardCard {
  const orderedLevels = [...battlePass.levels].sort(
    (left, right) => left.level - right.level,
  );
  const levelIndex = orderedLevels.findIndex((item) => item.level === level.level);
  const previousLevel = levelIndex > 0 ? orderedLevels[levelIndex - 1] : null;
  const rewardLabel =
    level.freeReward ??
    level.premiumReward ??
    level.title ??
    `Battle Pass шаг ${formatNumber(level.level)}`;
  const title = level.title ?? rewardLabel;
  const rarity = inferBattlePassRewardRarity(rewardLabel);
  const type = inferBattlePassRewardType(rewardLabel);

  return {
    id: `${battlePass.id}:${level.level}`,
    level: level.level,
    title: battlePassRewardTitle(title, type),
    subtitle: level.condition ?? level.description ?? battlePassRewardSubtitle(level, type),
    condition: level.condition,
    description: level.description,
    plannedReward: rewardLabel,
    type,
    rarity,
    status: battlePassRewardStatus(level),
    image: type === "lootbox" ? lootboxSkinForRarity(rarity) : undefined,
    rewardValue: battlePassRewardValue(rewardLabel, type, level.level),
    xpThreshold: 0,
    previousXpThreshold: previousLevel ? 0 : 0,
  };
}

function battlePassRewardFromQuest(
  quest: HomeBattleQuest,
  index: number,
  total: number,
): BattlePassRewardCard {
  const rawTitle = quest.reward.replace(/^Награда:\s*/i, "") || quest.title;
  const type = inferBattlePassRewardType(rawTitle);
  const rarity = inferBattlePassRewardRarity(rawTitle);
  const status =
    quest.state === "complete"
      ? "claimed"
      : quest.state === "current"
        ? "current"
        : "locked";

  return {
    id: `fallback:${quest.id}`,
    level: index + 1,
    title: battlePassRewardTitle(rawTitle, type),
    subtitle: index + 1 === total ? "Финальная награда" : quest.title,
    type,
    rarity,
    status,
    image: type === "lootbox" ? lootboxSkinForRarity(rarity) : undefined,
    rewardValue: battlePassRewardValue(rawTitle, type, index + 1),
    quest,
  };
}

function battlePassRewardStatus(level: HomeBattlePassLevel): BattlePassRewardStatus {
  if (level.reached) {
    return "claimed";
  }

  if (level.current) {
    return "current";
  }

  return "locked";
}

function battlePassRewardEventDetail(
  reward: BattlePassRewardCard,
  battlePass: GuestPortalGameSummary["battlePass"]["active"],
) {
  return {
    seasonId: battlePass?.id ?? null,
    seasonName: battlePass?.name ?? null,
    rewardId: reward.id,
    level: reward.level,
    title: reward.title,
    subtitle: reward.subtitle,
    type: reward.type,
    rarity: reward.rarity,
    status: reward.status,
    rewardValue: reward.rewardValue ?? null,
  };
}

function emitBattlePassEvent(
  name: BattlePassEventName,
  detail: Record<string, unknown> = {},
) {
  window.dispatchEvent(
    new CustomEvent(`battlepass_${name}`, {
      detail,
    }),
  );
}

function battlePassRewardTitle(value: string, type: BattlePassRewardType) {
  const cleanValue = value.trim();

  if (type === "lootbox" && !/контейнер|кейс|лутбокс/i.test(cleanValue)) {
    return "Сезонный контейнер";
  }

  return cleanValue || battlePassRewardTypeLabel(type);
}

function battlePassRewardSubtitle(
  level: HomeBattlePassLevel,
  type: BattlePassRewardType,
) {
  const typeLabel = battlePassRewardTypeLabel(type);

  if (level.freeReward && level.premiumReward) {
    return `${typeLabel} · premium: ${level.premiumReward}`;
  }

  return level.condition ?? level.description ?? typeLabel;
}

function battlePassRewardValue(
  value: string,
  type: BattlePassRewardType,
  fallback: number,
) {
  if (type === "xp") {
    const match = value.match(/\d[\d\s.,]*/);
    return match ? `${match[0].trim()} XP` : `${formatNumber(fallback)} XP`;
  }

  if (type === "coins") {
    const match = value.match(/\d[\d\s.,]*(?:\s?₽|\s?руб|\s?бонус)/i);
    return match ? match[0].trim() : value;
  }

  if (type === "discount") {
    const match = value.match(/\d[\d\s.,]*%/);
    return match ? match[0].trim() : "Промо";
  }

  if (type === "boost") {
    return "Boost";
  }

  if (type === "avatar") {
    return "Avatar";
  }

  if (type === "rank") {
    return "Rank";
  }

  return undefined;
}

function inferBattlePassRewardType(value: string): BattlePassRewardType {
  const normalized = value.toLocaleLowerCase("ru-RU");

  if (/лутбокс|кейс|контейнер|lootbox|case/.test(normalized)) {
    return "lootbox";
  }

  if (/xp|хр|опыт/.test(normalized)) {
    return "xp";
  }

  if (/скид|discount|промокод|promo/.test(normalized)) {
    return "discount";
  }

  if (/аватар|avatar/.test(normalized)) {
    return "avatar";
  }

  if (/буст|boost|множител|ускор/.test(normalized)) {
    return "boost";
  }

  if (/ранг|rank|лига/.test(normalized)) {
    return "rank";
  }

  return "coins";
}

function inferBattlePassRewardRarity(value: string): GuestPortalLootBoxRarity {
  const normalized = value.toLocaleLowerCase("ru-RU");

  if (/legendary|легендар/.test(normalized)) {
    return "legendary";
  }

  if (/epic|эпич/.test(normalized)) {
    return "epic";
  }

  if (/rare|редк/.test(normalized)) {
    return "rare";
  }

  return "common";
}

function battlePassRewardStatusLabel(status: BattlePassRewardStatus) {
  if (status === "ready") {
    return "Забрать";
  }

  if (status === "current") {
    return "Сейчас";
  }

  if (status === "claimed") {
    return "Получено";
  }

  return "Закрыто";
}

function battlePassRewardTypeLabel(type: BattlePassRewardType) {
  const labels = {
    xp: "XP",
    coins: "Бонусы",
    discount: "Промо",
    lootbox: "Кейс",
    avatar: "Аватар",
    boost: "Буст",
    rank: "Ранг",
  } satisfies Record<BattlePassRewardType, string>;

  return labels[type];
}

function battlePassSeasonTimeLabel(value: string | null | undefined) {
  if (!value) {
    return " · сезон активен";
  }

  const diff = new Date(value).getTime() - Date.now();

  if (!Number.isFinite(diff)) {
    return " · сезон активен";
  }

  if (diff <= 0) {
    return " · сезон завершен";
  }

  const totalHours = Math.ceil(diff / 3_600_000);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;

  if (days > 0) {
    return ` · до конца ${formatNumber(days)} дн. ${formatNumber(hours)} ч`;
  }

  return ` · до конца ${formatNumber(totalHours)} ч`;
}
function PlayerProfilePanel({
  summary,
  profileLogoUrl,
  profileLogoTitle,
  completedQuestCount,
  questTotalCount,
  quests,
  checkInAction,
  checkInSummary,
  checkInAvailable,
  checkInPending,
  questsExpanded,
  selectedQuestId,
  promoCode,
  nicknamePending,
  onPromoCodeChange,
  onPromoSubmit,
  onNicknameSubmit,
  onCheckIn,
  onQuestClick,
  onQuestsToggle,
}: {
  summary: GuestPortalGameSummary;
  profileLogoUrl: string | null;
  profileLogoTitle: string;
  completedQuestCount: number;
  questTotalCount: number;
  quests: PlayerQuest[];
  checkInAction: GameNextAction | null;
  checkInSummary: GuestPortalGameSummary["checkIn"] | null;
  checkInAvailable: boolean;
  checkInPending: boolean;
  questsExpanded: boolean;
  selectedQuestId: string | null;
  promoCode: string;
  nicknamePending: boolean;
  onPromoCodeChange: (value: string) => void;
  onPromoSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onNicknameSubmit: (displayName: string) => Promise<void>;
  onCheckIn: () => void;
  onQuestClick: (quest: PlayerQuest) => void;
  onQuestsToggle: () => void;
}) {
  const compactQuests = quests.slice(0, 5);
  const checkInDescription =
    checkInAction?.description ??
    checkInSummary?.description ??
    "Зафиксируйте присутствие в выбранном клубе.";
  const [nicknameEditing, setNicknameEditing] = useState(false);
  const [nicknameDraft, setNicknameDraft] = useState(summary.profile.displayName);
  const nicknameInputRef = useRef<HTMLInputElement | null>(null);
  const levelProgress = buildPlayerLevelProgress(summary.profile);
  const phoneMasked = formatPlayerPhoneMasked(summary.profile.contactMasked);

  useEffect(() => {
    if (!nicknameEditing) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      nicknameInputRef.current?.focus();
      nicknameInputRef.current?.select();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [nicknameEditing]);

  function startNicknameEdit() {
    setNicknameDraft(summary.profile.displayName);
    setNicknameEditing(true);
  }

  async function commitNickname() {
    const nextNickname = normalizeNickname(nicknameDraft);

    if (!nextNickname) {
      setNicknameDraft(summary.profile.displayName);
      setNicknameEditing(false);
      return;
    }

    if (nextNickname === normalizeNickname(summary.profile.displayName)) {
      setNicknameEditing(false);
      return;
    }

    try {
      await onNicknameSubmit(nextNickname);
      setNicknameEditing(false);
    } catch {
      nicknameInputRef.current?.focus();
    }
  }

  function cancelNicknameEdit() {
    setNicknameDraft(summary.profile.displayName);
    setNicknameEditing(false);
  }

  function handleNicknameKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void commitNickname();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      cancelNicknameEdit();
    }
  }

  return (
    <aside id="profile" className="lp-club-profile-panel" aria-label="Профиль игрока">
      <div className="lp-club-profile-logo">
        <div
          className={["lp-club-avatar", profileLogoUrl ? "is-custom-logo" : ""].join(" ")}
          title={profileLogoUrl ? profileLogoTitle : undefined}
          aria-hidden="true"
        >
          {profileLogoUrl ? <img src={profileLogoUrl} alt="" /> : <ProfileIcon />}
        </div>
        <div className="lp-club-profile-copy">
          {nicknameEditing ? (
            <label className="lp-club-nickname-editor">
              <input
                ref={nicknameInputRef}
                type="text"
                aria-label="Никнейм"
                autoComplete="nickname"
                maxLength={32}
                disabled={nicknamePending}
                value={nicknameDraft}
                onBlur={() => void commitNickname()}
                onChange={(event) => setNicknameDraft(event.target.value)}
                onKeyDown={handleNicknameKeyDown}
              />
              {phoneMasked ? (
                <span className="lp-club-profile-contact">{phoneMasked}</span>
              ) : null}
            </label>
          ) : (
            <button
              type="button"
              className="lp-club-nickname-button"
              aria-label={`Изменить никнейм ${summary.profile.displayName}`}
              title="Изменить никнейм"
              onClick={startNicknameEdit}
            >
              <strong className="lp-club-nickname-title">
                <span>{summary.profile.displayName}</span>
                <PencilIcon />
              </strong>
              {phoneMasked ? (
                <span className="lp-club-profile-contact">{phoneMasked}</span>
              ) : null}
            </button>
          )}
        </div>
      </div>

      <div className="lp-club-profile-section">
        <div className="lp-club-profile-row">
          <span className="lp-club-small-label">Уровень</span>
          <strong>{formatNumber(summary.profile.level)}</strong>
        </div>
        <div className="lp-club-progress" aria-label="Прогресс уровня">
          <span
            style={
              {
                "--value": `${levelProgress.percent}%`,
              } as CSSProperties
            }
          />
        </div>
        <div className="lp-club-level-meta">
          <span>
            {formatNumber(levelProgress.current)} /{" "}
            {formatNumber(levelProgress.required)} XP
          </span>
          <span>
            до следующего {formatNumber(levelProgress.remaining)} XP
          </span>
        </div>
      </div>

      {checkInAvailable ? (
        <section className="lp-club-checkin-card" aria-label="Чекин в клубе">
          <span className="lp-club-small-label">Чекин</span>
          <strong>
            {checkInAction?.title ?? checkInSummary?.title ?? "Чекин в клубе"}
          </strong>
          <p>{checkInDescription}</p>
          <button type="button" disabled={checkInPending} onClick={onCheckIn}>
            {checkInPending ? "Проверяем" : "Сделать чекин"}
          </button>
        </section>
      ) : null}

      <form className="lp-club-promo" onSubmit={onPromoSubmit}>
        <label className="lp-club-small-label" htmlFor="promoCode">
          Промокод
        </label>
        <input
          id="promoCode"
          type="text"
          placeholder="Введите код"
          autoComplete="off"
          value={promoCode}
          onChange={(event) => onPromoCodeChange(event.target.value)}
        />
        <button type="submit">Активировать</button>
        <Link
          className="lp-club-side-link"
          href="/game/rewards"
          target="_blank"
          rel="noreferrer"
        >
          История наград
        </Link>
      </form>

      <section
        className="lp-club-quest-widget quest-widget"
        aria-label="Задания игрока"
      >
        <div className="lp-club-quest-widget-head">
          <span>
            <span className="lp-club-small-label">Задания</span>
            <strong>Быстрые задачи</strong>
          </span>
          <span className="lp-club-quest-widget-actions">
            <span className="lp-club-quest-count">
              {formatNumber(completedQuestCount)} / {formatNumber(questTotalCount)}
            </span>
            <button
              id="questToggle"
              type="button"
              className="lp-club-quest-open-button quest-open-button"
              aria-expanded={questsExpanded}
              aria-controls="questBoard"
              onClick={onQuestsToggle}
            >
              {questsExpanded ? "Свернуть" : "Открыть все"}
            </button>
          </span>
        </div>

        <div className="lp-club-side-quest-list">
          {compactQuests.length ? (
            compactQuests.map((quest) => {
              const isExpanded = selectedQuestId === quest.id;

              return (
                <button
                  key={quest.id}
                  type="button"
                  className={[
                    "lp-club-side-quest",
                    quest.status === "done" ? "is-done" : "",
                    quest.status === "live" ? "is-current" : "",
                    isExpanded ? "is-selected is-expanded" : "",
                  ].join(" ")}
                  aria-expanded={isExpanded}
                  aria-controls={`side-quest-details-${quest.id}`}
                  onClick={() => onQuestClick(quest)}
                >
                  <span className="lp-club-side-quest-icon" aria-hidden="true">
                    {quest.status === "done" ? <CheckIcon /> : <QuestIcon />}
                  </span>
                  <span className="lp-club-side-quest-copy">
                    <strong>{quest.title}</strong>
                    <span>{quest.progress?.label ?? quest.description}</span>
                    {quest.progress ? (
                      <span
                        className="lp-club-side-quest-progress"
                        aria-hidden="true"
                      >
                        <i
                          style={
                            {
                              "--value": `${quest.progress.percent}%`,
                            } as CSSProperties
                          }
                        />
                      </span>
                    ) : null}
                  </span>
                  <span className="lp-club-side-quest-state">{quest.label}</span>
                  {isExpanded ? (
                    <span
                      id={`side-quest-details-${quest.id}`}
                      className="lp-club-side-quest-details"
                    >
                      <span>{quest.description}</span>
                      {quest.progress ? (
                        <span className="lp-club-side-quest-detail-progress">
                          <span
                            className="lp-club-side-quest-progress"
                            aria-hidden="true"
                          >
                            <i
                              style={
                                {
                                  "--value": `${quest.progress.percent}%`,
                                } as CSSProperties
                              }
                            />
                          </span>
                          <span>{quest.progress.label}</span>
                        </span>
                      ) : null}
                      {quest.reward ? (
                        <span>Награда: {quest.reward.value}</span>
                      ) : null}
                    </span>
                  ) : null}
                </button>
              );
            })
          ) : (
            <p className="lp-club-quest-empty">
              Пока нет доступных заданий.
            </p>
          )}
        </div>
      </section>
    </aside>
  );
}

function QuestBoard({
  quests,
  expanded,
  selectedQuestId,
  style,
  onClose,
  onQuestClick,
}: {
  quests: PlayerQuest[];
  expanded: boolean;
  selectedQuestId: string | null;
  style: QuestBoardStyle;
  onClose: () => void;
  onQuestClick: (quest: PlayerQuest) => void;
}) {
  const groups = buildQuestGroups(quests);

  return (
    <section
      id="questBoard"
      className={[
        "lp-club-quest-board quest-board",
        expanded ? "is-open" : "",
      ].join(" ")}
      aria-label="Все квесты игрока"
      aria-hidden={!expanded}
      style={style}
    >
      <div className="lp-club-quest-board-head">
        <div>
          <span className="lp-club-small-label">Квесты</span>
          <h2>Экран задач</h2>
          <p>
            {formatNumber(quests.length)} задач клуба, сгруппированных по состоянию.
          </p>
        </div>
        <button
          id="questBoardClose"
          type="button"
          className="lp-club-quest-board-close quest-board-close"
          disabled={!expanded}
          onClick={onClose}
        >
          Свернуть
        </button>
      </div>

      <div className="lp-club-quest-board-list">
        {groups.map((group) => (
          <section
            key={group.id}
            className="lp-club-quest-group"
            aria-label={group.ariaLabel}
          >
            <div className="lp-club-quest-group-head">
              <strong>{group.title}</strong>
              <span>{formatNumber(group.items.length)}</span>
            </div>

            {group.items.length ? (
              group.items.map((quest) => (
                <button
                  key={quest.id}
                  type="button"
                  className={[
                    "lp-club-quest-full-card",
                    quest.status === "done" ? "is-done" : "",
                    quest.status === "live" ? "is-current" : "",
                    selectedQuestId === quest.id ? "is-selected" : "",
                  ].join(" ")}
                  disabled={!expanded}
                  onClick={() => onQuestClick(quest)}
                >
                  <span className="lp-club-quest-full-icon" aria-hidden="true">
                    {quest.status === "done" ? <CheckIcon /> : <QuestIcon />}
                  </span>
                  <span className="lp-club-quest-full-main">
                    <strong>{quest.title}</strong>
                    <span>{quest.description}</span>
                    {quest.progress ? (
                      <span className="lp-club-quest-progress">
                        <span
                          className="lp-club-quest-progress-bar"
                          aria-hidden="true"
                        >
                          <i
                            style={
                              {
                                "--value": `${quest.progress.percent}%`,
                              } as CSSProperties
                            }
                          />
                        </span>
                        <span>{quest.progress.label}</span>
                      </span>
                    ) : null}
                  </span>
                  <span className="lp-club-quest-full-state">{quest.label}</span>
                </button>
              ))
            ) : (
              <div className="lp-club-quest-group-empty">Пока пусто</div>
            )}
          </section>
        ))}
      </div>
    </section>
  );
}

function bannerTitleStyle(title: string): BannerTitleStyle {
  const size = bannerTitleSize(title);
  const compactSize = bannerCompactTitleSize(size);

  return {
    "--banner-title-size": `${size}px`,
    "--banner-title-line-height": size <= 18 ? "1.08" : "1.05",
    "--banner-title-compact-size": `${compactSize}px`,
    "--banner-title-compact-line-height": compactSize <= 18 ? "1.09" : "1.06",
  };
}

function bannerCompactTitleSize(size: number) {
  return Math.max(15, Math.round(size * 0.84));
}

function bannerTitleSize(title: string) {
  const letterCount = Array.from(title).filter((char) =>
    /[\p{L}\p{N}]/u.test(char),
  ).length;

  if (letterCount >= 30) {
    return 16;
  }

  if (letterCount >= 24) {
    return 17;
  }

  if (letterCount >= 20) {
    return 19;
  }

  if (letterCount >= 16) {
    return 21;
  }

  return 24;
}

function normalizeNickname(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function buildHomeBanners(
  summary: GuestPortalGameSummary,
  primaryAction: GameNextAction | null,
  primaryActionHref: string | null,
): HomeBanner[] {
  const featuredMissions =
    summary.missions.featured.filter(isPlayerQuestMission);
  const featuredMission = featuredMissions[0] ?? null;
  const secondMission = featuredMissions[1] ?? null;
  const fallbackBanners: HomeBanner[] = [
    {
      id: "primary",
      label: primaryAction ? "Акция / квест" : "Акция / реклама",
      title: primaryAction?.title ?? "Ночной рейд",
      description:
        primaryAction?.description ??
        "Бонусные часы и XP за вечернюю активность в выбранном клубе.",
      tag: primaryAction ? gameActionButtonLabel(primaryAction) : "до 30 июня",
      featured: true,
      href: primaryActionHref ?? "#missions",
    },
    {
      id: "tournament",
      label: "Событие",
      title: featuredMission?.name ?? "Клубный турнир",
      description:
        featuredMission?.rewardLabel ??
        "Соберите стак и получите очки ранга за участие.",
      tag: featuredMission ? `${formatNumber(featuredMission.xpReward)} XP` : "регистрация",
      href: "#missions",
    },
    {
      id: "drop",
      label: "Событие",
      title: secondMission?.name ?? "Партнерский дроп",
      description:
        secondMission?.rewardLabel ??
        summary.referral.channelHint ??
        "Лимитированные предметы и бонусы для гостей клуба.",
      tag: secondMission ? "квест" : "получить",
      href: "/game/rewards",
    },
    {
      id: "battlepass",
      label: "Сезон",
      title: summary.battlePass.active?.name ?? "Баттлпасс клуба",
      description:
        summary.battlePass.active?.nextRewardLabel ??
        summary.referral.channelHint ??
        "Проходите задания сезона и забирайте клубные награды.",
      tag: summary.battlePass.active ? "сезон" : "активно",
      href: "#battlePass",
    },
  ];
  const promoBanners = summary.promoCards.featured
    .slice(0, 4)
    .map((card, index): HomeBanner => {
      const actionUrl = normalizeExternalActionUrl(card.actionUrl);

      return {
        id: `promo-${card.id}`,
        label: card.label ?? (index === 0 ? "Акция" : "Событие"),
        title: card.title,
        description:
          card.description ??
          fallbackBanners[index]?.description ??
          "Клубное событие для участников игрового модуля.",
        tag:
          card.tag ??
          (card.periodTo ? `до ${formatDate(card.periodTo)}` : "активно"),
        featured: index === 0,
        href:
          actionUrl ??
          (card.targetAnchor
            ? `#${card.targetAnchor}`
            : (fallbackBanners[index]?.href ?? "#missions")),
        imageUrl: card.imageUrl,
      };
    });

  return [...promoBanners, ...fallbackBanners].slice(0, 4);
}

function buildHomeLootCards(
  summary: GuestPortalGameSummary,
  selectedLootId: string | null,
): HomeLootCard[] {
  const realCards = summary.lootBoxes.featured.slice(0, 3).map((lootBox) => ({
    id: lootBox.id,
    title: lootBox.name,
    description:
      lootBox.latestReward?.rewardLabel ??
      lootBox.rewardLabel ??
      "Лутбокс с наградой за активность в клубе.",
    triggerKind: lootBox.triggerKind,
    sessionType: lootBox.sessionType,
    schedule: lootBox.schedule,
    status: lootboxCardStatus(lootBox),
    active: false,
    openable: lootBox.openable,
    openState: lootBox.openState,
    openBlocker: lootBox.openBlocker,
    rewardLabel: lootBox.rewardLabel,
    caseRarity: normalizeLootboxRarity(lootBox.caseRarity) ?? "common",
    caseRarityLabel:
      lootBox.caseRarityLabel ?? LOOTBOX_CASE_RARITY_LABELS[lootBox.caseRarity],
    rewardRarity: lootBox.latestReward?.rewardRarity ?? null,
    rewardRarityLabel: lootBox.latestReward?.rewardRarityLabel ?? null,
    rewardDropChance: lootBox.latestReward?.rewardDropChance ?? null,
    weeklyOpenedCount: lootBox.weeklyOpenedCount,
    weeklyLimit: lootBox.weeklyLimit,
    dailyOpenedCount: lootBox.dailyOpenedCount,
    dailyLimit: lootBox.dailyLimit,
    periodicLimitPeriod: lootBox.periodicLimitPeriod,
    periodicOpenedCount: lootBox.periodicOpenedCount,
  }));
  const activeId = selectedLootId ?? realCards[0]?.id ?? null;

  return realCards.map((card) => ({
    ...card,
    active: card.id === activeId,
  }));
}

function lootboxCardStatus(
  lootBox: GuestPortalGameSummary["lootBoxes"]["featured"][number],
) {
  if (!lootBox.openable && lootBox.openState === "LIMIT_REACHED") {
    return "лимит";
  }

  if (!lootBox.openable) {
    return "ждет событие";
  }

  if (lootBox.readyRewards > 0) {
    return "доступен";
  }

  if (lootBox.openedCount > 0) {
    return `открыт ${formatNumber(lootBox.openedCount)}`;
  }

  return "доступен";
}

function lootboxCardBlockedTooltip(card: HomeLootCard) {
  if (card.openable) {
    return null;
  }

  const blocker =
    card.openBlocker?.trim() ||
    (card.openState === "LIMIT_REACHED"
      ? "достигнут лимит открытия"
      : lootboxCardHint(card));
  const requirements = lootBoxGuestRequirementLines(card);
  const diagnostics = [
    `openState=${card.openState}`,
    `trigger=${normalizeGameRuleTrigger(card.triggerKind)}`,
    card.sessionType
      ? `sessionType=${normalizeGameRuleSessionType(card.sessionType)}`
      : null,
  ].filter(Boolean);

  return [
    `Кейс нельзя открыть: ${blocker}.`,
    requirements.length
      ? `Что должно быть выполнено: ${requirements.join(" ")}`
      : null,
    `Диагностика: ${diagnostics.join(", ")}.`,
  ]
    .filter(Boolean)
    .join(" ");
}

function lootboxCardHint(card: HomeLootCard) {
  if (!card.openable && card.openBlocker) {
    return card.openBlocker;
  }

  if (card.openable && card.weeklyLimit) {
    return `Осталось ${formatNumber(Math.max(0, card.weeklyLimit - card.weeklyOpenedCount))} из ${formatNumber(card.weeklyLimit)} на неделю`;
  }

  if (card.openable && card.periodicLimitPeriod) {
    const period =
      card.periodicLimitPeriod === "DAILY"
        ? "день"
        : card.periodicLimitPeriod === "WEEKLY"
          ? "неделю"
          : "месяц";

    return `Доступен один раз в ${period}`;
  }

  if (card.status === "доступен" || card.status === "сегодня") {
    return "Контейнер готов к открытию";
  }

  if (card.status === "ожидает" || card.status === "ждет событие") {
    return lootBoxUnlockHint(card.triggerKind, card.sessionType, card.schedule);
  }

  return "Нажмите, чтобы посмотреть контейнер";
}

function lootBoxUnlockHint(
  triggerKind: string,
  sessionType: string | null,
  schedule?: HomeLootCard["schedule"] | null,
) {
  return `Откроется ${[
    gameRuleUnlockCondition(triggerKind, sessionType),
    lootBoxScheduleHint(schedule),
  ]
    .filter(Boolean)
    .join(" ")}`;
}

function lootBoxGuestRequirementLines(card: HomeLootCard) {
  const lines = [guestActionRequirementLabel(card.triggerKind, card.sessionType)];
  const scheduleRequirement = lootBoxScheduleRequirement(card.schedule);

  if (scheduleRequirement) {
    lines.push(scheduleRequirement);
  }

  if (card.periodicLimitPeriod && card.status === "лимит") {
    lines.push(lootBoxPeriodicWaitRequirement(card.periodicLimitPeriod));
  } else if (card.weeklyLimit != null && card.status === "лимит") {
    lines.push("Дождитесь новой недели, чтобы снова открыть этот кейс.");
  } else if (card.dailyLimit != null && card.status === "лимит") {
    lines.push("Дождитесь завтра, чтобы снова попробовать открыть этот кейс.");
  }

  return Array.from(new Set(lines));
}

function lootBoxScheduleHint(
  schedule?: HomeLootCard["schedule"] | null,
): string | null {
  if (!schedule) {
    return null;
  }

  const dayHint = lootBoxScheduleDayHint(schedule);
  const timeHint = lootBoxScheduleTimeHint(schedule);

  return [dayHint, timeHint].filter(Boolean).join(" ") || null;
}

function lootBoxScheduleRequirement(
  schedule?: HomeLootCard["schedule"] | null,
): string | null {
  const hint = lootBoxScheduleHint(schedule);

  return hint ? `Открытие доступно только ${hint}.` : null;
}

function lootBoxScheduleDayHint(
  schedule: HomeLootCard["schedule"],
): string | null {
  if (schedule.weekdayMode === "WEEKDAYS") {
    return "в будние дни";
  }

  if (schedule.weekdayMode === "WEEKENDS") {
    return "в выходные";
  }

  if (schedule.weekdayMode !== "CUSTOM") {
    return null;
  }

  const weekdays = normalizeScheduleWeekdays(schedule.weekdays);

  if (sameScheduleWeekdays(weekdays, [1, 2, 3, 4, 5])) {
    return "в будние дни";
  }

  if (sameScheduleWeekdays(weekdays, [6, 0])) {
    return "в выходные";
  }

  if (!weekdays.length) {
    return null;
  }

  return `по ${joinRussianList(
    weekdays.map((weekday) => SCHEDULE_WEEKDAY_DATIVE[weekday]),
  )}`;
}

function lootBoxScheduleTimeHint(
  schedule: HomeLootCard["schedule"],
): string | null {
  if (schedule.timeWindowMode === "ANY") {
    return null;
  }

  const windows = schedule.hours
    .map(formatScheduleTimeWindow)
    .filter((item): item is string => Boolean(item));

  if (!windows.length) {
    return null;
  }

  return windows.length === 1
    ? windows[0]
    : `в интервалы ${joinRussianList(windows)}`;
}

function formatScheduleTimeWindow(value: string) {
  const [from, to] = value
    .split("-")
    .map((part) => part.trim())
    .filter(Boolean);

  if (from && to) {
    return `с ${from} до ${to}`;
  }

  return value.trim() || null;
}

const SCHEDULE_WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const SCHEDULE_WEEKDAY_DATIVE: Record<number, string> = {
  1: "понедельникам",
  2: "вторникам",
  3: "средам",
  4: "четвергам",
  5: "пятницам",
  6: "субботам",
  0: "воскресеньям",
};

function normalizeScheduleWeekdays(value: number[]) {
  return SCHEDULE_WEEKDAY_ORDER.filter((weekday) => value.includes(weekday));
}

function sameScheduleWeekdays(left: number[], right: number[]) {
  const rightNormalized = normalizeScheduleWeekdays(right);

  return (
    left.length === rightNormalized.length &&
    left.every((weekday, index) => weekday === rightNormalized[index])
  );
}

function joinRussianList(value: string[]) {
  const items = value.filter(Boolean);

  if (items.length <= 1) {
    return items[0] ?? "";
  }

  return `${items.slice(0, -1).join(", ")} и ${items.at(-1)}`;
}

function guestActionRequirementLabel(
  triggerKind: string,
  sessionType: string | null,
) {
  const normalized = normalizeGameRuleTrigger(triggerKind);
  const normalizedSessionType = normalizeGameRuleSessionType(sessionType);

  if (normalized === "SESSION_START") {
    if (normalizedSessionType === "packet_hours") {
      return "Начните игровую сессию с пакетом или абонементом.";
    }

    if (normalizedSessionType === "regular_session") {
      return "Начните игровую сессию с почасовой оплатой.";
    }

    return "Начните игровую сессию в клубе.";
  }

  switch (normalized) {
    case "APP_OPEN":
      return "Откройте игровой модуль.";
    case "CHECK_IN":
      return "Сделайте чекин в игровом модуле, находясь в клубе.";
    case "VISIT":
      return "Придите в клуб, чтобы система зафиксировала визит.";
    case "PLAY_HOUR":
      return "Поиграйте нужное время в клубе.";
    case "BAR_PURCHASE":
      return "Сделайте покупку в баре клуба.";
    case "PRODUCT_PURCHASE":
      return "Сделайте покупку в клубе.";
    case "BALANCE_TOPUP":
      return "Пополните баланс в клубе.";
    case "GUEST_LOG":
      return "Выполните нужное действие в клубе.";
    case "REFERRAL_ACCEPTED":
      return "Пригласите друга, чтобы он стал гостем клуба.";
    case "REPEAT_VISIT":
      return "Вернитесь в клуб еще раз.";
    case "MISSION_COMPLETED":
      return "Выполните нужное задание.";
    default:
      return `Выполните условие: ${gameRuleEventLabel(triggerKind)}.`;
  }
}

function lootBoxPeriodicWaitRequirement(
  period: NonNullable<HomeLootCard["periodicLimitPeriod"]>,
) {
  if (period === "DAILY") {
    return "Дождитесь завтра, чтобы снова открыть этот кейс.";
  }

  if (period === "MONTHLY") {
    return "Дождитесь следующего месяца, чтобы снова открыть этот кейс.";
  }

  return "Дождитесь следующей недели, чтобы снова открыть этот кейс.";
}

function lootBoxUnavailableCheckMessage(card: HomeLootCard) {
  if (
    normalizeGameRuleTrigger(card.triggerKind) === "SESSION_START" &&
    normalizeGameRuleSessionType(card.sessionType) === "packet_hours"
  ) {
    return "Пакет или абонемент пока не найден. Если вы только что купили пакет или абонемент, подождите несколько секунд и нажмите проверку еще раз.";
  }

  return "Условия пока не выполнены. Если вы уже сделали нужное действие, подождите несколько секунд и проверьте еще раз.";
}

function gameRuleUnlockCondition(
  triggerKind: string,
  sessionType: string | null,
) {
  const normalized = normalizeGameRuleTrigger(triggerKind);
  const sessionRequirement =
    normalized === "SESSION_START"
      ? gameRuleSessionRequirement(sessionType)
      : null;

  if (normalized === "SESSION_START") {
    return `при старте сессии${sessionRequirement ? ` ${sessionRequirement}` : ""}`;
  }

  if (normalized === "APP_OPEN") {
    return "при открытии игрового модуля";
  }

  if (normalized === "CHECK_IN") {
    return "после чекина в клубе";
  }

  return `после события: ${gameRuleEventLabel(triggerKind)}`;
}

function gameRuleConditionLabel(
  triggerKind: string,
  sessionType: string | null,
) {
  const normalized = normalizeGameRuleTrigger(triggerKind);
  const sessionRequirement =
    normalized === "SESSION_START"
      ? gameRuleSessionRequirement(sessionType)
      : null;

  if (normalized === "SESSION_START") {
    return `старт сессии${sessionRequirement ? ` ${sessionRequirement}` : ""}`;
  }

  return gameRuleEventLabel(triggerKind);
}

function gameRuleBadgeLabel(triggerKind: string, sessionType: string | null) {
  const normalized = normalizeGameRuleTrigger(triggerKind);

  if (normalized !== "SESSION_START") {
    return gameRuleEventLabel(triggerKind);
  }

  const sessionLabel = gameRuleSessionShortLabel(sessionType);

  return sessionLabel ? `старт сессии · ${sessionLabel}` : "старт сессии";
}

function gameRuleEventLabel(triggerKind: string) {
  switch (normalizeGameRuleTrigger(triggerKind)) {
    case "APP_OPEN":
      return "открытие игрового модуля";
    case "SESSION_START":
      return "старт сессии";
    case "CHECK_IN":
      return "чекин в клубе";
    case "VISIT":
      return "визит в клуб";
    case "PLAY_HOUR":
      return "час игры";
    case "BAR_PURCHASE":
      return "покупка в баре";
    case "PRODUCT_PURCHASE":
      return "покупка товара";
    case "BALANCE_TOPUP":
      return "пополнение баланса";
    case "GUEST_LOG":
      return "событие Langame";
    case "REFERRAL_ACCEPTED":
      return "приглашенный друг";
    case "REPEAT_VISIT":
      return "повторный визит";
    case "MISSION_COMPLETED":
      return "выполненное задание";
    default:
      return triggerKind;
  }
}

function gameRuleSessionRequirement(value: string | null) {
  const normalized = normalizeGameRuleSessionType(value);

  if (normalized === "packet_hours") {
    return "с пакетом или абонементом";
  }

  if (normalized === "regular_session") {
    return "с почасовым тарифом";
  }

  return null;
}

function gameRuleSessionShortLabel(value: string | null) {
  const normalized = normalizeGameRuleSessionType(value);

  if (normalized === "packet_hours") {
    return "пакет или абонемент";
  }

  if (normalized === "regular_session") {
    return "почасовой тариф";
  }

  return null;
}

function normalizeGameRuleTrigger(value: string) {
  return value.trim().toUpperCase();
}

function normalizeGameRuleSessionType(value: string | null) {
  const normalized = (value ?? "").trim().toLowerCase();

  if (
    [
      "packet_hours",
      "packet",
      "package",
      "package_hours",
      "subscription",
      "membership",
      "abonement",
      "abonnement",
      "абонемент",
    ].includes(normalized)
  ) {
    return "packet_hours";
  }

  if (
    ["regular_session", "regular", "common", "default"].includes(normalized)
  ) {
    return "regular_session";
  }

  return normalized;
}

function buildPlayerQuests(summary: GuestPortalGameSummary): PlayerQuest[] {
  return summary.missions.featured
    .filter(isPlayerQuestMission)
    .map((mission) => {
      const status = playerQuestStatus(mission);
      const progress = playerQuestProgress(mission);
      const reward = playerQuestReward(mission);

      return {
        id: mission.id,
        title: mission.name,
        description: playerQuestDescription(mission, reward),
        status,
        label: playerQuestStatusLabel(status),
        progress,
        reward,
      };
    });
}

function buildCheckInCompletionDialog(
  result: GuestPortalCheckInResponse,
): CompletionDialogQueueItem | null {
  const processResult = result.checkIn.processResult;
  const alreadyCounted = processResult.summary.idempotent;

  const rewardLabels = processResult.rewards
    .map((reward) => reward.rewardLabel.trim())
    .filter(Boolean);

  if (processResult.summary.appliedXpDelta > 0) {
    rewardLabels.push(
      `${formatNumber(processResult.summary.appliedXpDelta)} XP`,
    );
  }

  const uniqueRewardLabels = [...new Set(rewardLabels)];
  const occurredAt =
    processResult.event.occurredAt || result.checkIn.checkedAt;

  return {
    key: alreadyCounted
      ? `check-in-repeat:${processResult.event.id}:${result.checkIn.checkedAt}`
      : `check-in:${processResult.event.id}`,
    kind: "CHECK_IN",
    occurredAt,
    completion: {
      id: processResult.event.id,
      alreadyCounted,
      rewardLabel:
        uniqueRewardLabels.length > 0
          ? uniqueRewardLabels.join(" + ")
          : null,
      receivedAt: occurredAt,
      error: false,
      note: null,
    },
  };
}

function buildAlreadyCountedCheckInDialog(
  checkInSummary: GuestPortalGameSummary["checkIn"] | null,
  message: string,
  generatedAt: string,
): CompletionDialogQueueItem {
  const now = new Date().toISOString();
  const rewardLabel = checkInRewardLabel(checkInSummary);

  return {
    key: `check-in-repeat-blocked:${now}`,
    kind: "CHECK_IN",
    occurredAt: generatedAt || now,
    completion: {
      id: "check-in-repeat-blocked",
      alreadyCounted: true,
      error: false,
      rewardLabel,
      receivedAt: generatedAt || now,
      note: message,
    },
  };
}

function buildCheckInErrorDialog(
  message: string,
  generatedAt: string,
): CompletionDialogQueueItem {
  const now = new Date().toISOString();

  return {
    key: `check-in-error:${now}`,
    kind: "CHECK_IN",
    occurredAt: generatedAt || now,
    completion: {
      id: "check-in-error",
      alreadyCounted: false,
      error: true,
      rewardLabel: null,
      receivedAt: generatedAt || now,
      note: message,
    },
  };
}

function checkInRewardLabel(
  checkInSummary: GuestPortalGameSummary["checkIn"] | null,
) {
  const configuredReward = checkInSummary?.rewardLabel?.trim();

  if (configuredReward) {
    return configuredReward;
  }

  const xpReward = checkInSummary?.xpReward ?? 0;

  return xpReward > 0 ? `${formatNumber(xpReward)} XP` : null;
}

function isAlreadyCountedCheckInMessage(message: string) {
  const normalizedMessage = message.toLocaleLowerCase("ru-RU");

  return (
    normalizedMessage.includes("чекин") &&
    normalizedMessage.includes("уже был сделан сегодня")
  );
}

function findNewCompletionDialogs(
  previousSummary: GuestPortalGameSummary,
  nextSummary: GuestPortalGameSummary,
): CompletionDialogQueueItem[] {
  const questCompletions = findNewQuestCompletions(
    previousSummary,
    nextSummary,
  ).map(
    (completion): CompletionDialogQueueItem => ({
      key: `quest:${completion.id}:${completion.receivedAt}`,
      kind: "QUEST",
      occurredAt: completion.receivedAt,
      completion,
    }),
  );
  const battlePassCompletions = findNewBattlePassLevelCompletions(
    previousSummary,
    nextSummary,
  ).map(
    (completion): CompletionDialogQueueItem => ({
      key: `battle-pass:${completion.seasonId}:${completion.completedLevel}`,
      kind: "BATTLE_PASS",
      occurredAt: nextSummary.generatedAt,
      completion,
    }),
  );

  return sortCompletionDialogs([
    ...questCompletions,
    ...battlePassCompletions,
  ]);
}

function sortCompletionDialogs(items: CompletionDialogQueueItem[]) {
  return [...items].sort((left, right) => {
    const timeDifference =
      completionDialogTimestamp(left.occurredAt) -
      completionDialogTimestamp(right.occurredAt);

    if (timeDifference !== 0) {
      return timeDifference;
    }

    if (left.kind !== right.kind) {
      const kindOrder: Record<CompletionDialogQueueItem["kind"], number> = {
        CHECK_IN: 0,
        QUEST: 1,
        BATTLE_PASS: 2,
      };

      return kindOrder[left.kind] - kindOrder[right.kind];
    }

    if (left.kind === "BATTLE_PASS" && right.kind === "BATTLE_PASS") {
      return left.completion.completedLevel - right.completion.completedLevel;
    }

    return left.key.localeCompare(right.key);
  });
}

function completionDialogTimestamp(value: string) {
  const timestamp = Date.parse(value);

  return Number.isNaN(timestamp) ? Number.MAX_SAFE_INTEGER : timestamp;
}

function findNewQuestCompletions(
  previousSummary: GuestPortalGameSummary,
  nextSummary: GuestPortalGameSummary,
): QuestCompletionDialog[] {
  const previousMissions = new Map(
    [...previousSummary.missions.featured, ...previousSummary.missions.history].map(
      (mission) => [mission.id, mission],
    ),
  );
  const seen = new Set<string>();
  const nextMissions = [
    ...nextSummary.missions.featured,
    ...nextSummary.missions.history,
  ];
  const completions: QuestCompletionDialog[] = [];

  for (const mission of nextMissions) {
    if (seen.has(mission.id)) {
      continue;
    }

    seen.add(mission.id);

    const previousMission = previousMissions.get(mission.id);
    if (
      !isMissionCompletedForDialog(mission) ||
      (previousMission && isMissionCompletedForDialog(previousMission))
    ) {
      continue;
    }

    completions.push({
      id: mission.id,
      title: mission.name,
      rewardLabel: missionCompletionRewardLabel(mission),
      statusLabel: mission.rewardStatus.label,
      receivedAt: mission.rewardStatus.occurredAt ?? nextSummary.generatedAt,
    });
  }

  return completions;
}

function findNewBattlePassLevelCompletions(
  previousSummary: GuestPortalGameSummary,
  nextSummary: GuestPortalGameSummary,
): BattlePassLevelCompletionDialog[] {
  const previousSeason = previousSummary.battlePass.active;
  const nextSeason = nextSummary.battlePass.active;

  if (!previousSeason || !nextSeason || previousSeason.id !== nextSeason.id) {
    return [];
  }

  const previouslyReachedLevels = new Set(
    previousSeason.levels
      .filter((level) => level.reached)
      .map((level) => level.level),
  );
  const orderedLevels = [...nextSeason.levels].sort(
    (left, right) => left.level - right.level,
  );
  const completedLevels = orderedLevels.filter(
    (level) => level.reached && !previouslyReachedLevels.has(level.level),
  );

  return completedLevels.map((completedLevel) => {
    const nextLevel =
      orderedLevels.find((level) => level.level > completedLevel.level) ?? null;

    return {
      seasonId: nextSeason.id,
      seasonName: nextSeason.name,
      completedLevel: completedLevel.level,
      completedTitle: completedLevel.title?.trim() ?? "",
      rewardLabel:
        completedLevel.freeReward?.trim() ||
        completedLevel.premiumReward?.trim() ||
        completedLevel.title?.trim() ||
        "Награда уровня",
      nextLevel: nextLevel?.level ?? null,
      nextTitle: nextLevel
        ? nextLevel.title?.trim() || `Уровень ${nextLevel.level}`
        : null,
      nextCondition: nextLevel
        ? stripBattlePassDetailPrefix(
            nextLevel.condition?.trim() ||
              nextLevel.description?.trim() ||
              "продолжить участие в активностях клуба",
            "Условие",
          )
        : null,
    };
  });
}

function isMissionCompletedForDialog(mission: GameMission | GameMissionHistoryItem) {
  return (
    mission.progressPercent >= 100 ||
    mission.rewardStatus.state === "COMPLETED" ||
    mission.rewardStatus.state === "WAITING_APPROVAL" ||
    mission.rewardStatus.state === "READY" ||
    mission.rewardStatus.state === "QUEUED" ||
    mission.rewardStatus.state === "SENDING" ||
    mission.rewardStatus.state === "CONFIRMED" ||
    mission.rewardStatus.state === "REDEEMED"
  );
}

function missionCompletionRewardLabel(
  mission: GameMission | GameMissionHistoryItem,
) {
  if (mission.rewardStatus.rewardLabel) {
    return mission.rewardStatus.rewardLabel;
  }

  if (mission.rewardStatus.rewardAmount !== null) {
    return `${formatNumber(mission.rewardStatus.rewardAmount)} бонусов`;
  }

  if (mission.rewardLabel) {
    return mission.rewardLabel;
  }

  if (mission.xpReward > 0) {
    return `${formatNumber(mission.xpReward)} XP`;
  }

  return "Награда клуба";
}

function buildQuestGroups(quests: PlayerQuest[]) {
  return [
    {
      id: "done" as const,
      title: "Выполнены",
      ariaLabel: "Выполненные квесты",
      items: quests.filter((quest) => quest.status === "done"),
    },
    {
      id: "live" as const,
      title: "В процессе",
      ariaLabel: "Квесты в процессе",
      items: quests.filter((quest) => quest.status === "live"),
    },
    {
      id: "next" as const,
      title: "Не начаты",
      ariaLabel: "Не начатые квесты",
      items: quests.filter((quest) => quest.status === "next"),
    },
  ];
}

function playerQuestStatus(mission: GameMission): QuestStatus {
  const completedStates: Array<GameMission["rewardStatus"]["state"]> = [
    "COMPLETED",
    "WAITING_APPROVAL",
    "READY",
    "QUEUED",
    "SENDING",
    "CONFIRMED",
    "REDEEMED",
  ];

  if (
    mission.progressPercent >= 100 ||
    completedStates.includes(mission.rewardStatus.state)
  ) {
    return "done";
  }

  if (mission.progressCurrent > 0 || mission.progressPercent > 0) {
    return "live";
  }

  return "next";
}

function playerQuestStatusLabel(status: QuestStatus) {
  const labels = {
    done: "done",
    live: "live",
    next: "next",
  } satisfies Record<QuestStatus, string>;

  return labels[status];
}

function playerQuestProgress(
  mission: GameMission,
): PlayerQuest["progress"] {
  const lastStep = mission.questSteps[mission.questSteps.length - 1] ?? null;
  const total = Math.max(1, mission.progressTarget ?? lastStep?.target ?? 1);
  const current = Math.min(total, Math.max(0, mission.progressCurrent));
  const percent = clampPercent(mission.progressPercent);
  const hasProgress =
    mission.progressTarget !== null ||
    mission.questSteps.length > 0 ||
    current > 0 ||
    percent > 0;

  if (!hasProgress) {
    return undefined;
  }

  return {
    current,
    total,
    label: playerQuestProgressLabel(current, total, mission.progressUnit),
    percent,
  };
}

function playerQuestProgressLabel(
  current: number,
  total: number,
  unit: string | null,
) {
  const unitLabel = unit ? ` ${unit}` : "";

  return `${formatNumber(current)} / ${formatNumber(total)}${unitLabel}`;
}

function playerQuestReward(mission: GameMission): PlayerQuest["reward"] {
  const rewardLabel = mission.rewardLabel?.trim() ?? "";
  const rewardLabelLower = rewardLabel.toLocaleLowerCase("ru-RU");

  if (rewardLabelLower.includes("лутбокс")) {
    return { type: "lootbox", value: rewardLabel };
  }

  if (mission.xpReward > 0) {
    return { type: "xp", value: `${formatNumber(mission.xpReward)} XP` };
  }

  if (rewardLabel) {
    return { type: "promo", value: rewardLabel };
  }

  return undefined;
}

function playerQuestDescription(
  mission: GameMission,
  reward: PlayerQuest["reward"],
) {
  if (mission.rewardStatus.state !== "IN_PROGRESS") {
    return mission.rewardStatus.hint;
  }

  const parts = [missionConditionHint(mission)];

  if (mission.rewardLabel) {
    parts.push(`Награда: ${mission.rewardLabel}.`);
  } else if (reward) {
    parts.push(`Награда: ${reward.value}.`);
  }

  return parts.join(" ");
}

function missionConditionHint(mission: GameMission) {
  return `Условие: ${gameRuleConditionLabel(
    mission.triggerKind,
    mission.sessionType,
  )}.`;
}

function missionBattlePassDescription(mission: GameMission) {
  const activeStep =
    mission.questSteps.find((step) => step.current) ??
    mission.questSteps.find((step) => !step.completed) ??
    null;
  const progress = playerQuestProgress(mission);
  const parts = [
    missionConditionHint(mission),
    activeStep ? `Текущий шаг: ${activeStep.title}` : null,
    progress ? `Прогресс: ${progress.label}` : null,
    mission.rewardStatus.hint,
  ].filter(Boolean);

  return parts.join(". ");
}

function missionBattlePassReward(mission: GameMission) {
  if (mission.rewardStatus.rewardLabel) {
    return `Награда: ${mission.rewardStatus.rewardLabel}.`;
  }

  if (mission.rewardStatus.rewardAmount !== null) {
    return `Награда: ${formatNumber(mission.rewardStatus.rewardAmount)} бонусов.`;
  }

  if (mission.rewardLabel) {
    return `Награда: ${mission.rewardLabel}.`;
  }

  if (mission.xpReward > 0) {
    return `Награда: ${formatNumber(mission.xpReward)} XP.`;
  }

  return "Награда: прогресс сезона.";
}

function buildHomeBattleQuests(summary: GuestPortalGameSummary): HomeBattleQuest[] {
  const journeyQuests = summary.journey.steps
    .filter((step) => !isGuestInternalJourneyStep(step))
    .map((step) => ({
      id: step.id,
      sourceKind: "journey" as const,
      sourceId: step.id,
      title: step.label,
      description: guestJourneyHint(step),
      state: homeQuestState(step.status),
      label: homeQuestStateLabel(step.status),
      reward: "Награда: прогресс сезона и доступ к следующему этапу.",
    }));
  const missionQuests = summary.missions.featured
    .filter(isPlayerQuestMission)
    .map((mission) => {
      const progress = playerQuestProgress(mission);

      return {
        id: mission.id,
        sourceKind: "mission" as const,
        sourceId: mission.id,
        title: mission.name,
        description: missionBattlePassDescription(mission),
        state: mission.progressPercent >= 100 ? "complete" : "locked",
        label: mission.progressPercent >= 100 ? "готово" : "квест",
        reward: missionBattlePassReward(mission),
        progress,
        periodTo: mission.periodTo,
      };
    });
  const fallback = [
    {
      id: "promo",
      sourceKind: "fallback" as const,
      sourceId: "promo",
      title: "Промокод",
      description: "Активировать клубный код.",
      state: "locked" as const,
      label: "следующий",
      reward: "Награда: бонус бара или скидка на следующую сессию.",
    },
    {
      id: "season-final",
      sourceKind: "fallback" as const,
      sourceId: "season-final",
      title: "Финальный чек",
      description: "Забрать сезонный дроп.",
      state: "locked" as const,
      label: "главная награда",
      reward: "Награда: главный приз сезона.",
    },
  ];

  const quests = [...journeyQuests, ...missionQuests, ...fallback].slice(0, 6);
  const firstOpenIndex = quests.findIndex((quest) => quest.state !== "complete");
  const currentIndex = quests.findIndex((quest) => quest.state === "current");
  const resolvedCurrentIndex = currentIndex >= 0 ? currentIndex : Math.max(0, firstOpenIndex);

  return quests.map((quest, index) => {
    const state =
      index < resolvedCurrentIndex
        ? "complete"
        : index === resolvedCurrentIndex
          ? "current"
          : "locked";
    const coordinates = homeBattlePassCoordinates(index, quests.length);
    const status = homeBattlePassStatusLabel(state);
    const condition = quest.description.startsWith("Условие:")
      ? quest.description
      : `Условие: ${quest.description}`;
    const reward = quest.reward.startsWith("Награда:")
      ? quest.reward
      : `Награда: ${quest.reward}`;

    return {
      ...quest,
      state,
      label: state === "current" ? "текущая задача" : state === "complete" ? "готово" : quest.label,
      step: String(index + 1).padStart(2, "0"),
      status,
      condition,
      reward,
      preview: homeBattlePassPreview(condition),
      x: coordinates.x,
      y: coordinates.y,
    };
  });
}

function homeBattlePassCoordinates(index: number, total: number) {
  const preset = [
    { x: "11%", y: "72%" },
    { x: "28%", y: "38%" },
    { x: "45%", y: "58%" },
    { x: "63%", y: "70%" },
    { x: "78%", y: "38%" },
    { x: "86%", y: "54%" },
  ];

  if (index < preset.length) {
    return preset[index];
  }

  const safeTotal = Math.max(1, total - 1);
  const x = 9 + (index / safeTotal) * 82;
  const y = index % 2 === 0 ? 64 : 38;

  return { x: `${Math.round(x)}%`, y: `${y}%` };
}

function homeBattlePassStatusLabel(state: HomeBattleQuest["state"]) {
  if (state === "complete") {
    return "выполнено";
  }

  if (state === "current") {
    return "текущая задача";
  }

  return "следующий этап";
}

function homeBattlePassPreview(condition: string) {
  return condition.replace(/^Условие:\s*/i, "").replace(/\s+/g, " ").slice(0, 118);
}
function isGuestInternalJourneyStep(step: GameJourneyStep) {
  return step.id === "LANGAME" || step.id === "BONUS";
}

function guestJourneyHint(step: GameJourneyStep) {
  if (step.hint.toLocaleLowerCase("ru-RU").includes("langame")) {
    return "Мы сверяем профиль автоматически. Когда данные будут готовы, задание откроется.";
  }

  return step.hint;
}

function isGuestInternalNextAction(action: GameNextAction) {
  return action.kind === "MATCH_LANGAME";
}

function homeQuestState(
  status: GameJourneyStep["status"],
): HomeBattleQuest["state"] {
  if (status === "DONE") {
    return "complete";
  }

  return status === "CURRENT" || status === "ATTENTION" ? "current" : "locked";
}

function homeQuestStateLabel(status: GameJourneyStep["status"]) {
  if (status === "DONE") {
    return "готово";
  }

  if (status === "CURRENT") {
    return "сейчас";
  }

  return status === "ATTENTION" ? "проверить" : "locked";
}

function buildPlayerLevelProgress(profile: GuestPortalGameSummary["profile"]) {
  const level = Math.max(1, Math.trunc(profile.level || 1));
  const xp = Math.max(0, Math.trunc(profile.xp || 0));
  const currentLevelXp = Math.max(0, (level - 1) * LEVEL_XP_STEP);
  const nextLevelXp = Math.max(
    profile.nextLevelXp || level * LEVEL_XP_STEP,
    currentLevelXp + 1,
  );
  const required = Math.max(1, nextLevelXp - currentLevelXp);
  const current = Math.min(Math.max(0, xp - currentLevelXp), required);
  const remaining = Math.max(0, nextLevelXp - xp);

  return {
    current,
    required,
    remaining,
    percent: clampPercent((current / required) * 100),
  };
}

function formatPlayerPhoneMasked(value: string | null) {
  const digits = value?.replace(/\D/g, "") ?? "";

  if (!digits) {
    return null;
  }

  if (digits.length >= 6) {
    return `***${digits.slice(-6)}`;
  }

  return value?.trim() || null;
}

function BrandMark({
  logoUrl,
  title,
}: {
  logoUrl?: string | null;
  title: string;
}) {
  if (logoUrl) {
    return (
      <span className="lp-club-brand-mark is-custom-logo" title={title}>
        <img src={logoUrl} alt="" />
      </span>
    );
  }

  return <span className="lp-club-brand-mark" aria-hidden="true" />;
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
  );
}

function ClubIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <path d="M4 9h16" />
      <path d="M6 9v10h12V9" />
      <path d="M8 9V6a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <path d="M20 11a8 8 0 0 0-14.4-4.8L4 8" />
      <path d="M4 4v4h4" />
      <path d="M4 13a8 8 0 0 0 14.4 4.8L20 16" />
      <path d="M20 20v-4h-4" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <path d="M7 10V8a5 5 0 0 1 10 0v2" />
      <path d="M6 10h12v10H6z" />
      <path d="M12 14v2" />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <path d="M12 3 4.5 7.4v8.8L12 21l7.5-4.8V7.4L12 3Z" />
      <path d="M9 12.2 11.2 14 15.4 9.6" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

function QuestIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <path d="M4 7h16v10H4z" />
      <path d="M8 7v10" />
      <path d="M16 7v10" />
    </svg>
  );
}

function ExitIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <path d="M10 6H6v12h4" />
      <path d="M13 8l4 4-4 4" />
      <path d="M8 12h9" />
    </svg>
  );
}

function ReferralPanel({
  referral,
}: {
  referral: GuestPortalGameSummary["referral"];
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );
  const [shareState, setShareState] = useState<"idle" | "shared" | "failed">(
    "idle",
  );

  async function copyReferralLink() {
    try {
      await navigator.clipboard.writeText(referral.link);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  async function shareReferralInvite() {
    try {
      if (navigator.share) {
        await navigator.share({
          title: "LeetPlus Play",
          text: referral.shareText,
          url: referral.link,
        });
      } else {
        await navigator.clipboard.writeText(referral.shareText);
      }

      setShareState("shared");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      setShareState("failed");
    }
  }

  const telegramShareText = referral.shareText.replace(referral.link, "").trim();
  const telegramShareHref = `https://t.me/share/url?url=${encodeURIComponent(
    referral.link,
  )}&text=${encodeURIComponent(telegramShareText || referral.shareText)}`;
  const referralStats = [
    {
      label: "Регистраций",
      value: formatNumber(referral.stats.acceptedCount),
      hint: "по вашей ссылке",
    },
    {
      label: "К бонусу",
      value: formatNumber(referral.stats.eligibleCount),
      hint: "без саморефералок",
    },
    {
      label: "Последняя",
      value: referral.stats.latestAcceptedAt
        ? formatDate(referral.stats.latestAcceptedAt)
        : "пока нет",
      hint: "принятая регистрация",
    },
  ];

  return (
    <section
      id="referral"
      className="rounded-lg border border-cyan-300/25 bg-cyan-300/[0.08] p-5"
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_0.9fr] lg:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-cyan-200">
            Рефералка
          </p>
          <h2 className="mt-1 text-xl font-black">
            Пригласите друга в квесты клуба
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-300">
            {referral.channelHint}
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {referralStats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-lg border border-cyan-200/15 bg-zinc-950/35 px-3 py-2"
              >
                <p className="text-[11px] font-semibold uppercase tracking-wide text-cyan-100/70">
                  {stat.label}
                </p>
                <p className="mt-1 text-lg font-black text-white">
                  {stat.value}
                </p>
                <p className="text-xs text-zinc-400">{stat.hint}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-2">
          <div className="rounded-lg border border-white/10 bg-zinc-950/50 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              Код
            </p>
            <p className="mt-1 break-all font-mono text-sm font-bold text-cyan-100">
              {referral.code}
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={copyReferralLink}
              className="rounded-lg bg-cyan-200 px-4 py-3 text-sm font-black text-zinc-950 transition hover:bg-cyan-100"
            >
              {copyState === "copied"
                ? "Ссылка скопирована"
                : copyState === "failed"
                  ? "Не удалось скопировать"
                  : "Скопировать ссылку"}
            </button>
            <button
              type="button"
              onClick={shareReferralInvite}
              className="rounded-lg border border-cyan-200/35 px-4 py-3 text-sm font-black text-cyan-100 transition hover:border-cyan-100 hover:text-white"
            >
              {shareState === "shared"
                ? "Готово"
                : shareState === "failed"
                  ? "Не удалось"
                  : "Поделиться"}
            </button>
            <a
              href={telegramShareHref}
              rel="noreferrer"
              target="_blank"
              className="rounded-lg border border-cyan-200/35 px-4 py-3 text-center text-sm font-black text-cyan-100 transition hover:border-cyan-100 hover:text-white"
            >
              В Telegram
            </a>
            <a
              href={referral.link}
              className="rounded-lg border border-cyan-200/35 px-4 py-3 text-center text-sm font-black text-cyan-100 transition hover:border-cyan-100 hover:text-white"
            >
              Открыть ссылку
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function JourneyPanel({
  journey,
}: {
  journey: GuestPortalGameSummary["journey"];
}) {
  const nextStepLabel = journey.summary.nextStepLabel ?? "маршрут пройден";

  return (
    <section id="journey" className="rounded-lg border border-white/10 bg-white/[0.06] p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
            Путь к бонусу
          </p>
          <h2 className="mt-1 text-xl font-black">
            {journey.summary.completed}/{journey.summary.total} шагов готовы
          </h2>
        </div>
        <span className="w-fit rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-zinc-300">
          следующий: {nextStepLabel}
        </span>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-xs text-zinc-500">
          <span>готовность</span>
          <span>{journey.summary.readyPercent}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-emerald-300"
            style={{ width: `${clampPercent(journey.summary.readyPercent)}%` }}
          />
        </div>
      </div>

      <ol className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        {journey.steps.map((step, index) => (
          <li
            key={step.id}
            className="min-h-32 border-l border-white/10 pl-3"
          >
            <div className="flex items-center gap-2">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-zinc-950 text-xs font-black text-zinc-300">
                {index + 1}
              </span>
              <span className={journeyStatusClass(step.status)}>
                {journeyStatusLabel(step.status)}
              </span>
            </div>
            <h3 className="mt-3 text-sm font-black text-white">{step.label}</h3>
            <p className="mt-2 text-xs leading-5 text-zinc-400">{step.hint}</p>
            {step.status !== "DONE" ? (
              <Link
                href={journeyStepHref(step)}
                className="mt-3 inline-flex min-h-9 items-center rounded-lg border border-emerald-300/30 px-3 text-xs font-black text-emerald-100 transition hover:border-emerald-300 hover:bg-emerald-300/10"
              >
                Открыть
              </Link>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

function journeyStatusLabel(status: GameJourneyStep["status"]) {
  const labels = {
    DONE: "готово",
    CURRENT: "сейчас",
    WAITING: "ждет",
    ATTENTION: "проверить",
  } satisfies Record<GameJourneyStep["status"], string>;

  return labels[status];
}

function journeyStatusClass(status: GameJourneyStep["status"]) {
  const base = "rounded-full px-2 py-1 text-xs font-black";

  switch (status) {
    case "DONE":
      return `${base} bg-emerald-300 text-zinc-950`;
    case "CURRENT":
      return `${base} bg-sky-300 text-zinc-950`;
    case "WAITING":
      return `${base} bg-amber-300/20 text-amber-100`;
    default:
      return `${base} bg-rose-300/20 text-rose-100`;
  }
}

function journeyStepHref(step: GameJourneyStep) {
  if (step.anchor === "langame-match") {
    return "#next-actions";
  }

  return `#${step.anchor}`;
}

function ProgressPanel({
  progress,
}: {
  progress: GuestPortalGameSummary["progress"];
}) {
  const stats = progress.summary;

  return (
    <section
      id="progress"
      className="rounded-lg border border-white/10 bg-white/[0.06] p-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
            Мой прогресс
          </p>
          <h2 className="mt-1 text-xl font-black">Что уже засчитано</h2>
        </div>
        <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black text-zinc-200">
          уровень {formatNumber(stats.level)}
        </span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <ProgressMetric
          label="XP"
          value={formatNumber(stats.xp)}
          note={
            stats.xpToNextLevel > 0
              ? `до уровня ${formatNumber(stats.xpToNextLevel)} XP`
              : "следующий уровень рядом"
          }
        />
        <ProgressMetric
          label="Квесты"
          value={`${formatNumber(stats.missionsCompleted)}/${formatNumber(
            stats.missionsTotal,
          )}`}
          note={`${formatNumber(stats.missionsAlmostDone)} почти готовы`}
        />
        <ProgressMetric
          label="Награды"
          value={formatNumber(stats.rewardsReady)}
          note={`${formatNumber(stats.rewardsWaitingApproval)} ждут проверки`}
        />
        <ProgressMetric
          label="Бонусы Langame"
          value={formatSignedNumber(stats.confirmedBonusAmount)}
          note={`${formatSignedNumber(stats.pendingBonusAmount)} в очереди`}
        />
      </div>

      <div className="mt-5 space-y-2">
        {progress.timeline.length ? (
          progress.timeline.map((item) => (
            <ProgressTimelineRow key={item.id} item={item} />
          ))
        ) : (
          <p className="rounded-lg border border-white/10 bg-zinc-950/45 p-4 text-sm leading-6 text-zinc-300">
            Первые события появятся после чекина, квеста или начисления.
          </p>
        )}
      </div>
    </section>
  );
}

function ProgressMetric({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-zinc-950/45 p-3">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-xl font-black text-white">{value}</p>
      <p className="mt-1 text-xs text-zinc-400">{note}</p>
    </div>
  );
}

function ProgressTimelineRow({ item }: { item: GameProgressTimelineItem }) {
  const meta = [
    progressTimelineKindLabel(item.kind),
    item.storeName,
    item.xpDelta !== null ? `${formatSignedNumber(item.xpDelta)} XP` : null,
    item.amount !== null ? `${formatSignedNumber(item.amount)} бонусов` : null,
    formatDate(item.occurredAt),
  ].filter((value): value is string => Boolean(value));

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-white/10 bg-zinc-950/45 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={progressTimelineStatusClass(item.status)}>
            {progressTimelineStatusLabel(item.status)}
          </span>
          <p className="min-w-0 truncate text-sm font-black text-white">
            {item.title}
          </p>
        </div>
        {item.description ? (
          <p className="mt-1 text-xs leading-5 text-zinc-400">
            {item.description}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2 text-[11px] font-bold text-zinc-400 sm:max-w-xs sm:justify-end">
        {meta.map((value) => (
          <span
            key={value}
            className="rounded-full border border-white/10 px-2 py-1"
          >
            {value}
          </span>
        ))}
      </div>
    </div>
  );
}

function progressTimelineKindLabel(kind: GameProgressTimelineItem["kind"]) {
  const labels = {
    ACTIVITY: "событие",
    REWARD: "награда",
    BONUS_LEDGER: "Langame",
  } satisfies Record<GameProgressTimelineItem["kind"], string>;

  return labels[kind];
}

function progressTimelineStatusLabel(status: GameProgressTimelineItem["status"]) {
  const labels = {
    DONE: "засчитано",
    READY: "готово",
    WAITING: "ждет",
    ATTENTION: "проверка",
  } satisfies Record<GameProgressTimelineItem["status"], string>;

  return labels[status];
}

function progressTimelineStatusClass(status: GameProgressTimelineItem["status"]) {
  const base = "rounded-full px-2 py-1 text-xs font-black";

  switch (status) {
    case "DONE":
      return `${base} bg-emerald-300 text-zinc-950`;
    case "READY":
      return `${base} bg-sky-300 text-zinc-950`;
    case "WAITING":
      return `${base} bg-amber-300/20 text-amber-100`;
    default:
      return `${base} bg-rose-300/20 text-rose-100`;
  }
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
}: {
  actions: GuestPortalGameSummary["nextActions"];
}) {
  if (actions.length === 0) {
    return (
      <section id="next-actions" className="rounded-lg border border-white/10 bg-white/[0.06] p-5">
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
    <section id="next-actions" className="rounded-lg border border-white/10 bg-white/[0.06] p-5">
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
          const href = gameActionHref(action);

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

type RewardCollectionMark = {
  kind: "new" | "repeat";
  label: string;
};

type RewardCollectionItem = {
  key: string;
  title: string;
  value: string;
  source: RewardHistorySource;
  rarity: GuestPortalLootBoxRarity;
  count: number;
  latestAt: string;
};

function RewardJournalPanel({
  summary,
  standalone = false,
}: {
  summary: GuestPortalGameSummary;
  standalone?: boolean;
}) {
  const [activeClub, setActiveClub] = useState("all");
  const [activeSourceFilter, setActiveSourceFilter] =
    useState<RewardHistorySourceFilter>("all");
  const [activeRarityFilter, setActiveRarityFilter] =
    useState<RewardHistoryRarityFilter>("all");
  const [activeGroup, setActiveGroup] = useState<RewardHistoryGroup>("source");
  const [searchQuery, setSearchQuery] = useState("");
  const currentClubId = summary.store.id;
  const currentClubScope = summary.store.address
    ? `${summary.store.name} / ${summary.store.address}`
    : summary.store.name;
  const clubOptions = useMemo(
    () => [
      { id: "all", label: "Итого по всем клубам", scope: "Итого по всем клубам" },
      { id: currentClubId, label: summary.store.name, scope: currentClubScope },
    ],
    [currentClubId, currentClubScope, summary.store.name],
  );

  const scopedRewards = useMemo(
    () =>
      [...summary.rewards.recent].sort(
        (left, right) =>
          Date.parse(right.qualifiedAt) - Date.parse(left.qualifiedAt),
      ),
    [summary.rewards.recent],
  );
  const totals = useMemo(
    () => buildRewardHistoryTotals(scopedRewards),
    [scopedRewards],
  );
  const collection = useMemo(
    () => buildRewardCollection(scopedRewards),
    [scopedRewards],
  );
  const collectionIndex = useMemo(
    () => buildRewardCollectionIndex(scopedRewards),
    [scopedRewards],
  );
  const filteredRewards = useMemo(
    () =>
      filterRewardHistory(scopedRewards, {
        sourceFilter: activeSourceFilter,
        rarityFilter: activeRarityFilter,
        query: searchQuery,
        clubName: summary.store.name,
      }),
    [
      activeSourceFilter,
      activeRarityFilter,
      scopedRewards,
      searchQuery,
      summary.store.name,
    ],
  );
  const groupedRewards = useMemo(
    () => groupRewardHistory(filteredRewards, activeGroup),
    [activeGroup, filteredRewards],
  );
  const selectedClubScope =
    clubOptions.find((option) => option.id === activeClub)?.scope ??
    "Итого по всем клубам";
  const collectionTarget = Math.max(12, collection.length);
  const collectionPercent = clampPercent((collection.length / collectionTarget) * 100);
  const activeFilterLabel = rewardHistoryActiveFilterLabel({
    activeClub,
    clubName: summary.store.name,
    sourceFilter: activeSourceFilter,
    rarityFilter: activeRarityFilter,
  });
  const hasRewards = scopedRewards.length > 0;

  function toggleSourceFilter(source: RewardHistorySource) {
    setActiveSourceFilter((current) => (current === source ? "all" : source));
    setActiveRarityFilter("all");
    setActiveGroup("source");
  }

  function toggleRarityFilter(rarity: GuestPortalLootBoxRarity) {
    setActiveRarityFilter((current) => (current === rarity ? "all" : rarity));
    setActiveSourceFilter("all");
    setActiveGroup("rarity");
  }

  function resetRewardHistoryFilters() {
    setActiveSourceFilter("all");
    setActiveRarityFilter("all");
    setSearchQuery("");
  }

  return (
    <section
      id="rewards"
      className={[
        "lp-club-panel lp-reward-journal",
        standalone ? "is-standalone" : "",
      ].join(" ")}
      aria-label="Журнал полученных наград"
    >
      <header className="lp-reward-journal-head">
        <div>
          <div className="lp-club-label">История наград</div>
          <h2>Журнал полученных наград</h2>
          <p>
            Карточки достижений, редкость и коллекционный прогресс по наградам
            игрового модуля.
          </p>
        </div>
        <div className="lp-reward-journal-side">
          <span className="lp-reward-sync-pill">История синхронизирована</span>
          <Link
            href={standalone ? "/game" : "#profile"}
            className="lp-club-ghost-link"
          >
            Назад в модуль
          </Link>
        </div>
      </header>

      <div className="lp-reward-scope-row">
        <label className="lp-reward-scope-field">
          <span className="lp-club-small-label">Область истории</span>
          <select
            value={activeClub}
            onChange={(event) => setActiveClub(event.target.value)}
          >
            {clubOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.scope}
              </option>
            ))}
          </select>
        </label>
        <div className="lp-reward-total-card">
          <strong>{formatNumber(totals.total)}</strong>
          <span>{selectedClubScope}</span>
        </div>
      </div>

      <div className="lp-reward-counter-band" aria-label="Счетчики наград">
        <RewardHistoryCounterPanel
          title="По типам"
          hint="4 источника"
          counters={REWARD_HISTORY_SOURCE_ORDER.map((source) => ({
            key: source,
            label: REWARD_HISTORY_SOURCE_LABELS[source],
            value: totals.source[source],
            tone: REWARD_HISTORY_SOURCE_TONES[source],
            active: activeSourceFilter === source,
            onClick: () => toggleSourceFilter(source),
          }))}
          total={totals.total}
        />
        <RewardHistoryCounterPanel
          title="По редкости"
          hint="Баланс выпадений"
          counters={REWARD_HISTORY_RARITY_ORDER.map((rarity) => ({
            key: rarity,
            label: REWARD_HISTORY_RARITY_LABELS[rarity],
            value: totals.rarity[rarity],
            tone: rewardRarityTone(rarity),
            active: activeRarityFilter === rarity,
            rarity,
            onClick: () => toggleRarityFilter(rarity),
          }))}
          total={totals.total}
        />
      </div>

      <section className="lp-reward-collection" aria-label="Коллекция наград">
        <div className="lp-reward-collection-head">
          <div>
            <span className="lp-club-small-label">Коллекция наград</span>
            <h3>
              Собрано {formatNumber(collection.length)} /{" "}
              {formatNumber(collectionTarget)} наград сезона
            </h3>
          </div>
          <div className="lp-reward-collection-progress" aria-hidden="true">
            <span style={{ width: `${collectionPercent}%` }} />
          </div>
        </div>
        {collection.length ? (
          <div className="lp-reward-collection-grid">
            {collection.slice(0, 12).map((item) => (
              <RewardCollectionCard key={item.key} item={item} />
            ))}
          </div>
        ) : (
          <p className="lp-reward-empty-copy">
            Коллекция начнется после первой полученной награды.
          </p>
        )}
      </section>

      <div className="lp-reward-command" aria-label="Управление журналом наград">
        <div className="lp-reward-group-switch">
          {(["source", "rarity", "date"] as RewardHistoryGroup[]).map((group) => (
            <button
              key={group}
              type="button"
              className={activeGroup === group ? "is-active" : ""}
              onClick={() => setActiveGroup(group)}
            >
              {group === "source" ? "Блоки" : group === "rarity" ? "Редкость" : "Дата"}
            </button>
          ))}
        </div>
        <label className="lp-reward-search">
          <span className="sr-only">Поиск по наградам</span>
          <input
            type="search"
            value={searchQuery}
            placeholder="Найти достижение"
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="lp-reward-reset"
          onClick={resetRewardHistoryFilters}
        >
          Сброс
        </button>
        <span className="lp-reward-active-filter">{activeFilterLabel}</span>
      </div>

      <section className="lp-reward-list-panel" aria-label="Список наград">
        <div className="lp-reward-list-toolbar">
          <strong>{REWARD_HISTORY_GROUP_TITLES[activeGroup]}</strong>
          <span>{formatNumber(filteredRewards.length)} записей</span>
        </div>
        {filteredRewards.length ? (
          <div className="lp-reward-list">
            {groupedRewards.map((group) => (
              <section key={group.key} className="lp-reward-group">
                <header className="lp-reward-group-head">
                  <h3>{group.title}</h3>
                  <span>
                    {formatNumber(group.items.length)}{" "}
                    {pluralRewards(group.items.length)}
                  </span>
                </header>
                {group.items.map((item) => (
                  <RewardAchievementCard
                    key={item.id}
                    item={item}
                    clubName={summary.store.name}
                    collectionMark={collectionIndex.get(item.id) ?? null}
                  />
                ))}
              </section>
            ))}
          </div>
        ) : (
          <p className="lp-reward-empty-copy">
            {hasRewards
              ? "Наград по выбранным условиям пока нет."
              : "Полученные награды появятся здесь после лутбоксов, квестов, баттлпасса или промокодов."}
          </p>
        )}
      </section>

      <div className="lp-reward-ledger-row">
        <div className="lp-reward-balance-card">
          <span className="lp-club-small-label">Бонусный баланс</span>
          <strong>
            {summary.loyalty.bonusBalance !== null
              ? formatNumber(summary.loyalty.bonusBalance)
              : "Нет данных"}
          </strong>
          <p>
            {summary.loyalty.bonusBalanceSource ??
              "Ожидаем первый snapshot Langame"}
          </p>
        </div>
        {summary.rewards.bonusHistory.items.length ? (
          <BonusHistoryPanel history={summary.rewards.bonusHistory} />
        ) : null}
      </div>
    </section>
  );
}

function RewardHistoryCounterPanel({
  title,
  hint,
  counters,
  total,
}: {
  title: string;
  hint: string;
  counters: Array<{
    key: string;
    label: string;
    value: number;
    tone: string;
    active: boolean;
    rarity?: GuestPortalLootBoxRarity;
    onClick: () => void;
  }>;
  total: number;
}) {
  const totalBase = Math.max(total, 1);

  return (
    <div className="lp-reward-counter-panel">
      <div className="lp-reward-counter-title">
        <strong>{title}</strong>
        <span>{hint}</span>
      </div>
      <div className="lp-reward-counter-grid">
        {counters.map((counter) => {
          const share = Math.round((counter.value / totalBase) * 100);

          return (
            <button
              key={counter.key}
              type="button"
              aria-pressed={counter.active}
              className={[
                "lp-reward-counter-cell",
                counter.active ? "is-active" : "",
                counter.rarity ? `rarity-${counter.rarity}` : "",
              ].join(" ")}
              style={rewardCounterStyle(counter.tone, share)}
              onClick={counter.onClick}
            >
              <i className="lp-reward-counter-dot" aria-hidden="true" />
              <span>{counter.label}</span>
              <strong>{formatNumber(counter.value)}</strong>
              <em>{share}%</em>
              <b aria-hidden="true">
                <span />
              </b>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function RewardCollectionCard({ item }: { item: RewardCollectionItem }) {
  return (
    <article className={`lp-reward-collection-card rarity-${item.rarity}`}>
      <div className="lp-reward-collection-icon">
        <RewardSourceIcon source={item.source} />
      </div>
      <div>
        <small>
          {REWARD_HISTORY_SOURCE_LABELS[item.source]} /{" "}
          {REWARD_HISTORY_RARITY_LABELS[item.rarity]}
        </small>
        <strong>{item.title}</strong>
        <span>{item.value}</span>
      </div>
      <em>
        {item.count === 1
          ? "Новая"
          : `Повтор x${formatNumber(item.count - 1)}`}
      </em>
    </article>
  );
}

function RewardAchievementCard({
  item,
  clubName,
  collectionMark,
}: {
  item: GameRewardHistoryItem;
  clubName: string;
  collectionMark: RewardCollectionMark | null;
}) {
  const source = rewardHistorySource(item);
  const rarity = rewardHistoryRarity(item);

  return (
    <article className={`lp-reward-achievement-card rarity-${rarity}`}>
      <span className="lp-reward-achievement-icon" aria-hidden="true">
        <RewardSourceIcon source={source} />
      </span>
      <span className="lp-reward-achievement-main">
        <small>
          {clubName} / {item.sourceLabel ?? REWARD_HISTORY_SOURCE_LABELS[source]}
        </small>
        <strong>{item.rewardLabel}</strong>
        <span>
          {rewardHistoryDescription(item)} · {walletStateLabel(item.walletState)}
        </span>
      </span>
      <span className="lp-reward-achievement-meta">
        <span className="lp-reward-value">{rewardHistoryValue(item)}</span>
        <span className={`lp-reward-rarity-chip rarity-${rarity}`}>
          {REWARD_HISTORY_RARITY_LABELS[rarity]}
        </span>
        {collectionMark ? (
          <span className={`lp-reward-collection-mark ${collectionMark.kind}`}>
            {collectionMark.label}
          </span>
        ) : null}
        <span className="lp-reward-date">
          {formatRewardHistoryDay(item.qualifiedAt)}
          <br />
          {formatRewardHistoryTime(item.qualifiedAt)}
        </span>
      </span>
    </article>
  );
}

function RewardSourceIcon({ source }: { source: RewardHistorySource }) {
  if (source === "battlepass") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
        <path d="M6 5h12v14H6z" />
        <path d="M9 9h6" />
        <path d="M9 13h4" />
      </svg>
    );
  }

  if (source === "quest") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
        <path d="M5 5h14v14H5z" />
        <path d="m8 12 2.5 2.5L16 9" />
      </svg>
    );
  }

  if (source === "promo") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
        <path d="M4 8h16v8H4z" />
        <path d="M8 8v8" />
        <path d="M16 8v8" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <path d="M5 8h14v10H5z" />
      <path d="m7 6 10 0 2 2H5z" />
      <path d="M12 8v10" />
    </svg>
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
              {lootboxRewardRarityLabel(reward) ? (
                <p className="mt-2 text-xs font-black uppercase tracking-wide text-cyan-200">
                  Редкость: {lootboxRewardRarityLabel(reward)}
                </p>
              ) : null}
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
                  const rarityLabel = lootboxRewardRarityLabel(item);

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
                          {rarityLabel ? (
                            <p className="mt-1 text-[11px] font-black uppercase tracking-wide text-cyan-200">
                              {rarityLabel}
                            </p>
                          ) : null}
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
            Игровой журнал
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
            const latestRarityLabel = latestReward
              ? lootboxRewardRarityLabel(latestReward)
              : null;
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
                    {gameRuleBadgeLabel(lootBox.triggerKind, lootBox.sessionType)}
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
                    {latestRarityLabel ? (
                      <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-cyan-200">
                        {latestRarityLabel}
                      </p>
                    ) : null}
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
                    Лутбокс откроется{" "}
                    {gameRuleUnlockCondition(
                      lootBox.triggerKind,
                      lootBox.sessionType,
                    )}
                    .
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
                  <p className="mt-3 rounded-lg border border-cyan-300/20 bg-cyan-300/[0.06] px-3 py-2 text-xs font-semibold leading-5 text-cyan-100">
                    {missionConditionHint(mission)}
                  </p>
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

                  <MissionRewardStatusCard status={mission.rewardStatus} />

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

function MissionHistoryPanel({
  missions,
  total,
}: {
  missions: GameMissionHistoryItem[];
  total: number;
}) {
  return (
    <section
      id="mission-history"
      className="rounded-lg border border-white/10 bg-white/[0.06] p-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
            История квестов
          </p>
          <h2 className="mt-1 text-xl font-black">Активные и завершенные</h2>
        </div>
        <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black text-zinc-200">
          {formatNumber(missions.length)} из {formatNumber(total)}
        </span>
      </div>

      <div className="mt-5 space-y-2">
        {missions.length ? (
          missions.map((mission) => (
            <MissionHistoryRow key={mission.id} mission={mission} />
          ))
        ) : (
          <p className="rounded-lg border border-white/10 bg-zinc-950/45 p-4 text-sm leading-6 text-zinc-300">
            История появится после первого игрового события в клубе.
          </p>
        )}
      </div>
    </section>
  );
}

function MissionHistoryRow({
  mission,
}: {
  mission: GameMissionHistoryItem;
}) {
  const progressTarget = mission.progressTarget ?? 1;
  const progressUnit = mission.progressUnit ? ` ${mission.progressUnit}` : "";
  const rewardLabel =
    mission.rewardStatus.rewardLabel ??
    mission.rewardLabel ??
    `${formatNumber(mission.xpReward)} XP`;
  const meta = [
    `${Math.round(mission.progressPercent)}%`,
    `${formatNumber(mission.progressCurrent)}/${formatNumber(
      progressTarget,
    )}${progressUnit}`,
    rewardLabel,
    mission.periodTo ? `до ${formatDate(mission.periodTo)}` : null,
    mission.rewardStatus.occurredAt
      ? formatDate(mission.rewardStatus.occurredAt)
      : null,
  ].filter((value): value is string => Boolean(value));

  return (
    <div className="grid gap-3 rounded-lg border border-white/10 bg-zinc-950/45 px-3 py-3 lg:grid-cols-[1fr_auto] lg:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={missionHistoryBadgeClass(mission.rewardStatus.state)}>
            {mission.rewardStatus.label}
          </span>
          <p className="min-w-0 truncate text-sm font-black text-white">
            {mission.name}
          </p>
        </div>
        <p className="mt-1 text-xs leading-5 text-zinc-400">
          {mission.rewardStatus.hint}
        </p>
      </div>
      <div className="flex flex-wrap gap-2 text-[11px] font-bold text-zinc-400 lg:max-w-md lg:justify-end">
        {meta.map((value) => (
          <span
            key={value}
            className="rounded-full border border-white/10 px-2 py-1"
          >
            {value}
          </span>
        ))}
      </div>
    </div>
  );
}

function missionHistoryBadgeClass(
  state: GameMissionHistoryItem["rewardStatus"]["state"],
) {
  const base = "rounded-full px-2 py-1 text-xs font-black";

  switch (state) {
    case "CONFIRMED":
    case "READY":
    case "REDEEMED":
    case "COMPLETED":
      return `${base} bg-emerald-300 text-zinc-950`;
    case "QUEUED":
    case "SENDING":
    case "WAITING_APPROVAL":
      return `${base} bg-amber-300/20 text-amber-100`;
    case "FAILED":
    case "CANCELED":
    case "EXPIRED":
      return `${base} bg-rose-300/20 text-rose-100`;
    default:
      return `${base} bg-white/10 text-zinc-200`;
  }
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
      return mission.rewardStatus.state !== "IN_PROGRESS";
    case "ALL":
      return true;
    default:
      return false;
  }
}

function missionCardClass(mission: GameMission) {
  if (
    mission.rewardStatus.state === "FAILED" ||
    mission.rewardStatus.state === "CANCELED" ||
    mission.rewardStatus.state === "EXPIRED"
  ) {
    return "rounded-lg border border-rose-300/25 bg-rose-300/[0.06] p-4";
  }

  if (
    mission.rewardStatus.state === "QUEUED" ||
    mission.rewardStatus.state === "SENDING" ||
    mission.rewardStatus.state === "WAITING_APPROVAL"
  ) {
    return "rounded-lg border border-amber-300/25 bg-amber-300/[0.06] p-4";
  }

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
  if (
    mission.rewardStatus.state === "FAILED" ||
    mission.rewardStatus.state === "CANCELED" ||
    mission.rewardStatus.state === "EXPIRED"
  ) {
    return "mt-1 block rounded-full bg-rose-300/20 px-2 py-1 text-xs font-bold text-rose-100";
  }

  if (
    mission.rewardStatus.state === "QUEUED" ||
    mission.rewardStatus.state === "SENDING" ||
    mission.rewardStatus.state === "WAITING_APPROVAL"
  ) {
    return "mt-1 block rounded-full bg-amber-300/20 px-2 py-1 text-xs font-bold text-amber-100";
  }

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
  if (mission.rewardStatus.state !== "IN_PROGRESS") {
    return mission.rewardStatus.label.toLowerCase();
  }

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

function MissionRewardStatusCard({
  status,
}: {
  status: GameMission["rewardStatus"];
}) {
  const rewardLabel =
    status.rewardLabel ??
    (status.rewardAmount !== null
      ? `${formatSignedNumber(status.rewardAmount)} бонусов`
      : null);
  const meta = [
    status.rewardWalletState ? walletStateLabel(status.rewardWalletState) : null,
    status.occurredAt ? formatDate(status.occurredAt) : null,
    status.balanceAfter !== null
      ? `баланс ${formatNumber(status.balanceAfter)}`
      : null,
  ].filter((item): item is string => Boolean(item));

  return (
    <div className={missionRewardStatusPanelClass(status.state)}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className={missionRewardStatusTitleClass(status.state)}>
            {status.label}
          </p>
          <p className="mt-1 text-xs leading-5 text-zinc-300">{status.hint}</p>
        </div>
        {rewardLabel ? (
          <span className="shrink-0 rounded-full bg-white/10 px-2 py-1 text-xs font-black text-zinc-100">
            {rewardLabel}
          </span>
        ) : null}
      </div>
      {meta.length ? (
        <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-bold text-zinc-400">
          {meta.map((item) => (
            <span
              key={item}
              className="rounded-full border border-white/10 px-2 py-1"
            >
              {item}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function missionRewardStatusPanelClass(
  state: GameMission["rewardStatus"]["state"],
) {
  const base = "mt-4 rounded-lg border px-3 py-3";

  switch (state) {
    case "CONFIRMED":
    case "READY":
    case "REDEEMED":
    case "COMPLETED":
      return `${base} border-emerald-300/25 bg-emerald-300/[0.08]`;
    case "QUEUED":
    case "SENDING":
    case "WAITING_APPROVAL":
      return `${base} border-amber-300/25 bg-amber-300/[0.07]`;
    case "FAILED":
    case "CANCELED":
    case "EXPIRED":
      return `${base} border-rose-300/25 bg-rose-300/[0.07]`;
    default:
      return `${base} border-white/10 bg-zinc-950/35`;
  }
}

function missionRewardStatusTitleClass(
  state: GameMission["rewardStatus"]["state"],
) {
  switch (state) {
    case "CONFIRMED":
    case "READY":
    case "REDEEMED":
    case "COMPLETED":
      return "text-xs font-black uppercase tracking-wide text-emerald-200";
    case "QUEUED":
    case "SENDING":
    case "WAITING_APPROVAL":
      return "text-xs font-black uppercase tracking-wide text-amber-100";
    case "FAILED":
    case "CANCELED":
    case "EXPIRED":
      return "text-xs font-black uppercase tracking-wide text-rose-100";
    default:
      return "text-xs font-black uppercase tracking-wide text-zinc-300";
  }
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
              label="Шаг"
              value={formatNumber(battlePass.currentLevel)}
              note={
                battlePass.nextLevel
                  ? `следующий ${battlePass.nextLevel}`
                  : "максимум"
              }
            />
            <Metric
              label="До следующего шага"
              value={battlePass.nextLevel ? "1 шаг" : "готово"}
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
                  Шаги Battle Pass
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
                    level.title ??
                    `Шаг ${formatNumber(level.level)}`;

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
                            Шаг {formatNumber(level.level)}
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
                        <span>{level.condition ?? level.description ?? "Условие шага"}</span>
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

function rewardHistorySource(item: GameRewardHistoryItem): RewardHistorySource {
  if (item.sourceKind === "LOOT_BOX") {
    return "lootbox";
  }

  if (item.sourceKind === "BATTLE_PASS") {
    return "battlepass";
  }

  if (item.sourceKind === "MISSION") {
    return "quest";
  }

  return "promo";
}

function rewardHistoryRarity(
  item: Pick<GameRewardHistoryItem, "rewardRarity">,
): GuestPortalLootBoxRarity {
  return normalizeLootboxRarity(item.rewardRarity) ?? "common";
}

function rewardHistoryCollectionKey(item: GameRewardHistoryItem) {
  const rarity = rewardHistoryRarity(item);
  const source = rewardHistorySource(item);
  const sourceId =
    source === "lootbox"
      ? item.sourceId ?? item.sourceLabel ?? item.sourceKind
      : item.sourceId ?? item.sourceKind;

  return [item.rewardLabel, rarity, sourceId].join("::");
}

function rewardHistoryValue(item: GameRewardHistoryItem) {
  const amount = formatNumber(item.rewardAmount);
  const type = item.rewardType.toLocaleUpperCase("ru-RU");

  if (type.includes("XP")) {
    return `${amount} XP`;
  }

  if (type.includes("BONUS")) {
    return `${amount} бонусов`;
  }

  if (type.includes("HOUR")) {
    return `${amount} ч`;
  }

  if (item.rewardAmount > 0) {
    return `${amount} ${item.rewardType}`;
  }

  return item.rewardLabel;
}

function rewardHistoryDescription(item: GameRewardHistoryItem) {
  const source = rewardHistorySource(item);
  const label = item.sourceLabel ?? REWARD_HISTORY_SOURCE_LABELS[source];
  const chance = item.rewardDropChance;

  if (source === "lootbox" && chance !== null) {
    return `${label} · шанс ${formatRewardChance(chance)}`;
  }

  return label;
}

function buildRewardHistoryTotals(items: GameRewardHistoryItem[]) {
  const source = {
    lootbox: 0,
    battlepass: 0,
    quest: 0,
    promo: 0,
  } satisfies Record<RewardHistorySource, number>;
  const rarity = {
    common: 0,
    rare: 0,
    epic: 0,
    legendary: 0,
  } satisfies Record<GuestPortalLootBoxRarity, number>;

  for (const item of items) {
    source[rewardHistorySource(item)] += 1;
    rarity[rewardHistoryRarity(item)] += 1;
  }

  return {
    total: items.length,
    source,
    rarity,
  };
}

function buildRewardCollection(items: GameRewardHistoryItem[]): RewardCollectionItem[] {
  const collection = new Map<string, RewardCollectionItem>();

  for (const item of items) {
    const key = rewardHistoryCollectionKey(item);
    const current = collection.get(key);

    if (current) {
      current.count += 1;
      if (Date.parse(item.qualifiedAt) > Date.parse(current.latestAt)) {
        current.latestAt = item.qualifiedAt;
      }
      continue;
    }

    collection.set(key, {
      key,
      title: item.rewardLabel,
      value: rewardHistoryValue(item),
      source: rewardHistorySource(item),
      rarity: rewardHistoryRarity(item),
      count: 1,
      latestAt: item.qualifiedAt,
    });
  }

  return [...collection.values()].sort((left, right) => {
    const rarityDelta =
      rewardRarityWeight(right.rarity) - rewardRarityWeight(left.rarity);

    if (rarityDelta !== 0) {
      return rarityDelta;
    }

    return Date.parse(right.latestAt) - Date.parse(left.latestAt);
  });
}

function buildRewardCollectionIndex(items: GameRewardHistoryItem[]) {
  const firstByKey = new Map<string, string>();
  const seenByKey = new Map<string, number>();
  const sortedAsc = [...items].sort(
    (left, right) => Date.parse(left.qualifiedAt) - Date.parse(right.qualifiedAt),
  );

  for (const item of sortedAsc) {
    const key = rewardHistoryCollectionKey(item);
    const count = seenByKey.get(key) ?? 0;

    seenByKey.set(key, count + 1);
    if (!firstByKey.has(key)) {
      firstByKey.set(key, item.id);
    }
  }

  const marks = new Map<string, RewardCollectionMark>();
  for (const item of sortedAsc) {
    const key = rewardHistoryCollectionKey(item);
    const firstId = firstByKey.get(key);

    marks.set(
      item.id,
      firstId === item.id
        ? { kind: "new", label: "Новая в коллекции" }
        : { kind: "repeat", label: "Повтор" },
    );
  }

  return marks;
}

function filterRewardHistory(
  items: GameRewardHistoryItem[],
  filters: {
    sourceFilter: RewardHistorySourceFilter;
    rarityFilter: RewardHistoryRarityFilter;
    query: string;
    clubName: string;
  },
) {
  const query = filters.query.trim().toLocaleLowerCase("ru-RU");

  return items.filter((item) => {
    const source = rewardHistorySource(item);
    const rarity = rewardHistoryRarity(item);
    const sourceMatches =
      filters.sourceFilter === "all" || filters.sourceFilter === source;
    const rarityMatches =
      filters.rarityFilter === "all" || filters.rarityFilter === rarity;
    const queryMatches =
      !query ||
      [
        item.rewardLabel,
        item.sourceLabel,
        item.rewardType,
        REWARD_HISTORY_SOURCE_LABELS[source],
        REWARD_HISTORY_RARITY_LABELS[rarity],
        filters.clubName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("ru-RU")
        .includes(query);

    return sourceMatches && rarityMatches && queryMatches;
  });
}

function groupRewardHistory(
  items: GameRewardHistoryItem[],
  groupBy: RewardHistoryGroup,
) {
  if (groupBy === "source") {
    return REWARD_HISTORY_SOURCE_ORDER.map((source) => ({
      key: source,
      title: REWARD_HISTORY_SOURCE_LABELS[source],
      items: items.filter((item) => rewardHistorySource(item) === source),
    })).filter((group) => group.items.length);
  }

  if (groupBy === "rarity") {
    return [...REWARD_HISTORY_RARITY_ORDER]
      .reverse()
      .map((rarity) => ({
        key: rarity,
        title: REWARD_HISTORY_RARITY_LABELS[rarity],
        items: items.filter((item) => rewardHistoryRarity(item) === rarity),
      }))
      .filter((group) => group.items.length);
  }

  const groups = new Map<string, GameRewardHistoryItem[]>();
  for (const item of items) {
    const key = formatRewardHistoryDay(item.qualifiedAt);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  return [...groups.entries()]
    .map(([key, groupItems]) => ({
      key,
      title: key,
      items: groupItems,
    }))
    .sort(
      (left, right) =>
        Date.parse(right.items[0]?.qualifiedAt ?? "") -
        Date.parse(left.items[0]?.qualifiedAt ?? ""),
    );
}

function rewardHistoryActiveFilterLabel({
  activeClub,
  clubName,
  sourceFilter,
  rarityFilter,
}: {
  activeClub: string;
  clubName: string;
  sourceFilter: RewardHistorySourceFilter;
  rarityFilter: RewardHistoryRarityFilter;
}) {
  const parts = [activeClub === "all" ? "Все клубы" : clubName];

  if (sourceFilter !== "all") {
    parts.push(REWARD_HISTORY_SOURCE_LABELS[sourceFilter]);
  }

  if (rarityFilter !== "all") {
    parts.push(REWARD_HISTORY_RARITY_LABELS[rarityFilter]);
  }

  return parts.join(" / ");
}

function rewardCounterStyle(tone: string, share: number) {
  return {
    "--tone": tone,
    "--share": `${share}%`,
  } as CSSProperties & Record<"--tone" | "--share", string>;
}

function rewardRarityTone(rarity: GuestPortalLootBoxRarity) {
  const tones = {
    common: "158 181 183",
    rare: "131 228 236",
    epic: "175 164 255",
    legendary: "208 170 108",
  } satisfies Record<GuestPortalLootBoxRarity, string>;

  return tones[rarity];
}

function rewardRarityWeight(rarity: GuestPortalLootBoxRarity) {
  const weights = {
    common: 1,
    rare: 2,
    epic: 3,
    legendary: 4,
  } satisfies Record<GuestPortalLootBoxRarity, number>;

  return weights[rarity];
}

function pluralRewards(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return "награда";
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return "награды";
  }

  return "наград";
}

function formatRewardChance(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 2,
  }).format(value) + "%";
}

function formatRewardHistoryDay(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
  }).format(new Date(value));
}

function formatRewardHistoryTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
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
}: {
  summary: GuestPortalGameSummary;
}) {
  const communicationsHref = "#communications";
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

const clubHomeCss = `
.lp-club-home-page {
  min-height: 100vh;
  color: #edf7f8;
  background: #000;
  letter-spacing: 0;
  overflow-x: hidden;
}

.lp-club-home-page *,
.lp-club-home-page *::before,
.lp-club-home-page *::after {
  box-sizing: border-box;
}

.lp-club-home {
  --bg: #000;
  --panel: rgba(8, 14, 18, 0.9);
  --panel-strong: rgba(10, 18, 22, 0.96);
  --line: rgba(196, 224, 225, 0.18);
  --line-strong: rgba(140, 230, 237, 0.56);
  --text: #edf7f8;
  --muted: #a8b9ba;
  --quiet: #71878a;
  --cyan: #83e4ec;
  --teal: #54bfc6;
  --amber: #d0aa6c;
  --good: #94d6b8;
  --radius: 8px;
  --shadow: 0 30px 90px rgba(0, 0, 0, 0.48);
  position: relative;
  min-height: 100vh;
  isolation: isolate;
  background:
    radial-gradient(circle at 72% 8%, rgba(131, 228, 236, 0.08), transparent 28%),
    radial-gradient(circle at 18% 68%, rgba(208, 170, 108, 0.045), transparent 26%),
    #000;
}

.lp-club-home::before,
.lp-club-home-static::before {
  content: "";
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  opacity: 0.72;
  background-image:
    linear-gradient(rgba(160, 223, 225, 0.035) 1px, transparent 1px),
    linear-gradient(90deg, rgba(160, 223, 225, 0.028) 1px, transparent 1px);
  background-size: 96px 96px;
  mask-image: linear-gradient(180deg, transparent, #000 12%, #000 86%, transparent);
}

.lp-club-topbar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 18px;
  min-height: 78px;
  padding: 18px clamp(18px, 3.4vw, 46px);
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.96), rgba(0, 0, 0, 0.72), transparent);
  backdrop-filter: blur(14px);
}

.lp-club-menu-button,
.lp-club-icon-badge {
  appearance: none;
  display: inline-grid;
  place-items: center;
  width: 44px;
  height: 44px;
  flex: 0 0 auto;
  padding: 0;
  border: 1px solid rgba(196, 224, 225, 0.2);
  border-radius: 8px;
  color: #edf7f8;
  background: rgba(196, 224, 225, 0.035);
  transition:
    border-color 180ms ease,
    background 180ms ease,
    transform 180ms ease;
}

.lp-club-menu-button {
  cursor: pointer;
}

.lp-club-refresh-button {
  cursor: pointer;
}

.lp-club-refresh-button:disabled {
  cursor: progress;
  opacity: 0.58;
}

.lp-club-refresh-button:disabled:hover {
  border-color: rgba(196, 224, 225, 0.2);
  background: rgba(196, 224, 225, 0.035);
  transform: none;
}

.lp-club-refresh-button:disabled svg {
  animation: lp-refresh-spin 900ms linear infinite;
}

@keyframes lp-refresh-spin {
  to {
    transform: rotate(360deg);
  }
}

.lp-club-menu {
  position: relative;
}

.lp-club-menu-button:hover,
.lp-club-icon-badge:hover {
  border-color: rgba(131, 228, 236, 0.58);
  background: rgba(131, 228, 236, 0.08);
  transform: translateY(-1px);
}

.lp-club-menu-panel {
  position: absolute;
  top: calc(100% + 10px);
  left: 0;
  z-index: 30;
  display: grid;
  width: min(220px, calc(100vw - 36px));
  gap: 6px;
  padding: 8px;
  border: 1px solid rgba(196, 224, 225, 0.18);
  border-radius: 8px;
  background:
    linear-gradient(135deg, rgba(131, 228, 236, 0.08), transparent 42%),
    rgba(4, 10, 13, 0.96);
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.58);
}

.lp-club-menu-panel[hidden] {
  display: none;
}

.lp-club-menu-panel a,
.lp-club-menu-panel button {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  min-height: 40px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 7px;
  color: var(--text);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 780;
  text-align: left;
  text-decoration: none;
  background: transparent;
  transition:
    border-color 180ms ease,
    background 180ms ease,
    transform 180ms ease;
}

.lp-club-menu-panel a:hover,
.lp-club-menu-panel button:hover,
.lp-club-menu-panel a:focus-visible,
.lp-club-menu-panel button:focus-visible {
  border-color: rgba(131, 228, 236, 0.34);
  outline: none;
  background: rgba(131, 228, 236, 0.08);
  transform: translateY(-1px);
}

.lp-club-menu-panel svg {
  width: 18px;
  height: 18px;
  color: var(--cyan);
}

.lp-club-home svg,
.lp-club-home-static svg {
  width: 20px;
  height: 20px;
  stroke-width: 1.8;
}

.lp-club-network {
  display: flex;
  align-items: center;
  gap: clamp(18px, 4vw, 54px);
  min-width: 0;
}

.lp-club-brand,
.lp-club-switch {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  text-decoration: none;
  text-transform: uppercase;
}

.lp-club-brand {
  gap: 12px;
  color: var(--text);
  font-size: 12px;
  font-weight: 820;
  letter-spacing: 0.14em;
}

.lp-club-brand-mark {
  position: relative;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  border: 1px solid rgba(196, 224, 225, 0.36);
  border-radius: 50%;
}

.lp-club-brand-mark::before,
.lp-club-brand-mark::after {
  content: "";
  position: absolute;
  inset: 8px;
  border: 1px solid rgba(131, 228, 236, 0.38);
  transform: rotate(45deg);
}

.lp-club-brand-mark::after {
  inset: 14px;
  border-color: var(--amber);
}

.lp-club-brand-mark.is-custom-logo {
  overflow: visible;
  border: 0;
  border-radius: 0;
  background: transparent;
}

.lp-club-brand-mark.is-custom-logo::before,
.lp-club-brand-mark.is-custom-logo::after {
  display: none;
}

.lp-club-brand-mark img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: center;
}

.lp-club-switch {
  gap: 9px;
  color: var(--cyan);
  font-size: 12px;
  font-weight: 820;
  letter-spacing: 0.12em;
}

.lp-club-switch span,
.lp-club-brand span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lp-club-session-state {
  justify-self: end;
  display: inline-flex;
  align-items: center;
  gap: 9px;
  padding: 11px 13px;
  border: 1px solid rgba(196, 224, 225, 0.18);
  border-radius: 8px;
  background: rgba(7, 12, 16, 0.56);
  color: var(--muted);
  font-size: 10px;
  font-weight: 820;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.lp-club-session-state::before {
  content: "";
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--cyan);
  box-shadow: 0 0 16px rgba(131, 228, 236, 0.64);
}

.lp-club-shell {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: 20px;
  width: min(1480px, 100%);
  min-height: calc(100vh - 78px);
  margin: 0 auto;
  padding: 18px clamp(18px, 3.4vw, 46px) 32px;
}

.lp-club-main-flow {
  display: grid;
  grid-template-rows: minmax(250px, auto) auto minmax(220px, 1fr);
  gap: 20px;
  min-width: 0;
}

.lp-club-stage {
  display: block;
  min-width: 0;
}

.lp-club-card,
.lp-club-panel,
.lp-club-profile-panel,
.lp-club-static-card {
  position: relative;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.045), transparent 26%),
    var(--panel);
  box-shadow: var(--shadow);
}

.lp-club-card::before,
.lp-club-panel::before,
.lp-club-profile-panel::before,
.lp-club-static-card::before {
  content: "";
  position: absolute;
  top: -1px;
  left: -1px;
  width: 42px;
  height: 42px;
  border-top: 1px solid var(--cyan);
  border-left: 1px solid var(--cyan);
  border-top-left-radius: var(--radius);
  pointer-events: none;
}

.lp-club-card {
  min-height: 250px;
  overflow: hidden;
  padding: 24px;
}

.lp-club-card::after {
  content: "";
  position: absolute;
  inset: auto 0 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(131, 228, 236, 0.58), transparent);
}

.lp-club-label,
.lp-club-small-label {
  color: var(--muted);
  font-size: 10px;
  font-weight: 820;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.lp-club-label {
  display: inline-flex;
  align-items: center;
  gap: 9px;
}

.lp-club-label::before {
  content: "";
  width: 36px;
  height: 1px;
  background: linear-gradient(90deg, var(--cyan), transparent);
}

.lp-club-home h1,
.lp-club-home h2,
.lp-club-home h3,
.lp-club-home p,
.lp-club-home-static h1,
.lp-club-home-static p {
  margin: 0;
}

.lp-club-card h1 {
  max-width: 560px;
  margin-top: 34px;
  color: var(--text);
  font-size: 68px;
  line-height: 0.92;
  font-weight: 760;
}

.lp-club-card p {
  max-width: 560px;
  margin-top: 18px;
  color: #c2d0d1;
  font-size: 16px;
  line-height: 1.62;
}

.lp-club-quick-metrics {
  display: grid;
  grid-template-columns: repeat(3, auto);
  gap: 12px;
  margin-top: 28px;
}

.lp-club-metric {
  min-width: 92px;
  padding: 12px 13px;
  border: 1px solid rgba(196, 224, 225, 0.14);
  border-radius: 7px;
  background: rgba(2, 8, 11, 0.46);
}

.lp-club-metric strong {
  display: block;
  color: var(--cyan);
  font-size: 18px;
  line-height: 1;
}

.lp-club-metric span {
  display: block;
  margin-top: 7px;
  color: var(--quiet);
  font-size: 9px;
  font-weight: 820;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.lp-club-banner-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 18px;
  min-width: 0;
}

.lp-club-banner {
  position: relative;
  min-height: 360px;
  aspect-ratio: 9 / 16;
  overflow: hidden;
  border: 1px solid rgba(196, 224, 225, 0.18);
  border-radius: var(--radius);
  color: inherit;
  text-decoration: none;
  background:
    linear-gradient(180deg, rgba(131, 228, 236, 0.11), transparent 34%),
    rgba(5, 11, 14, 0.82);
  transition:
    border-color 180ms ease,
    transform 180ms ease,
    background 180ms ease;
}

.lp-club-banner:hover {
  border-color: rgba(131, 228, 236, 0.58);
  transform: translateY(-2px);
}

.lp-club-banner::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  opacity: 0.7;
  background:
    linear-gradient(135deg, transparent 0 34%, rgba(131, 228, 236, 0.12) 34% 35%, transparent 35% 100%),
    radial-gradient(circle at 72% 18%, rgba(131, 228, 236, 0.16), transparent 24%);
}

.lp-club-banner.is-featured {
  background:
    linear-gradient(180deg, rgba(208, 170, 108, 0.17), transparent 36%),
    rgba(7, 12, 16, 0.86);
}

.lp-club-banner.is-featured::before {
  background:
    radial-gradient(circle at 70% 18%, rgba(208, 170, 108, 0.2), transparent 24%),
    linear-gradient(135deg, transparent 0 38%, rgba(208, 170, 108, 0.15) 38% 39%, transparent 39% 100%);
}

.lp-club-banner.has-image {
  background:
    linear-gradient(180deg, rgba(3, 7, 9, 0.2), transparent 36%),
    rgba(5, 11, 14, 0.82);
}

.lp-club-banner.has-image::before {
  background:
    linear-gradient(180deg, rgba(3, 7, 9, 0.08), rgba(3, 7, 9, 0.66)),
    linear-gradient(135deg, transparent 0 34%, rgba(131, 228, 236, 0.12) 34% 35%, transparent 35% 100%);
}

.lp-club-banner-media {
  position: absolute;
  inset: 0;
  z-index: 0;
  display: grid;
  place-items: center;
  padding: 0;
  background: rgba(3, 7, 9, 0.34);
}

.lp-club-banner-media img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: center;
}

.lp-club-banner-content {
  position: relative;
  z-index: 2;
  display: flex;
  min-height: 100%;
  flex-direction: column;
  justify-content: space-between;
  padding: 18px;
}

.lp-club-banner-kicker,
.lp-club-banner-title,
.lp-club-banner-copy {
  display: block;
}

.lp-club-banner-kicker {
  color: var(--quiet);
  font-size: 9px;
  font-weight: 820;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.lp-club-banner-title {
  margin-top: 18px;
  color: var(--text);
  font-size: var(--banner-title-size, 24px);
  line-height: var(--banner-title-line-height, 1.05);
  font-weight: 780;
  overflow-wrap: anywhere;
}

.lp-club-banner-copy {
  margin-top: 10px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.45;
}

.lp-club-banner-tag {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid rgba(196, 224, 225, 0.14);
  border-radius: 7px;
  color: var(--cyan);
  font-size: 9px;
  font-weight: 860;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.lp-club-lootboxes,
.lp-club-battlepass,
.lp-club-profile-panel {
  padding: 18px;
}

.lp-club-section-head {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.lp-club-section-head h2,
.lp-club-detail-head h2 {
  color: var(--text);
  font-size: 24px;
  line-height: 1.08;
  font-weight: 740;
}

.lp-club-section-head p {
  margin-top: 7px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}

.lp-club-loot-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.lp-club-loot-empty {
  grid-column: 1 / -1;
  min-height: 132px;
  display: grid;
  place-items: center;
  margin: 0;
  border: 1px solid rgba(196, 224, 225, 0.12);
  border-radius: var(--radius);
  color: var(--muted);
  font-size: 13px;
  line-height: 1.45;
  text-align: center;
  background: rgba(196, 224, 225, 0.035);
}

.lootbox-entry {
  position: relative;
  display: grid;
  grid-template-rows: auto minmax(132px, 1fr) auto;
  min-height: 276px;
  overflow: hidden;
  padding: 17px;
  border: 1px solid rgba(131, 228, 236, 0.28);
  border-radius: var(--radius);
  color: inherit;
  text-align: left;
  background:
    radial-gradient(circle at 50% 46%, rgba(131, 228, 236, 0.18), transparent 34%),
    linear-gradient(135deg, rgba(131, 228, 236, 0.08), transparent 38%),
    rgba(4, 11, 14, 0.92);
  box-shadow:
    0 24px 70px rgba(0, 0, 0, 0.38),
    inset 0 0 0 1px rgba(131, 228, 236, 0.07);
  cursor: pointer;
  transition:
    border-color 180ms ease,
    box-shadow 180ms ease;
}

.lootbox-entry::before {
  content: "";
  position: absolute;
  inset: 12px;
  border: 1px solid rgba(196, 224, 225, 0.08);
  border-radius: 6px;
  pointer-events: none;
}

.lootbox-entry:hover,
.lootbox-entry:focus-visible,
.lootbox-entry.is-active {
  border-color: rgba(131, 228, 236, 0.7);
  box-shadow:
    0 30px 92px rgba(0, 0, 0, 0.48),
    0 0 32px rgba(131, 228, 236, 0.14);
  outline: none;
}

.lootbox-entry.is-disabled {
  border-color: rgba(196, 224, 225, 0.12);
  cursor: pointer;
  opacity: 0.62;
}

.lootbox-entry.is-disabled:hover,
.lootbox-entry.is-disabled:focus-visible {
  border-color: rgba(196, 224, 225, 0.18);
  box-shadow:
    0 24px 70px rgba(0, 0, 0, 0.38),
    inset 0 0 0 1px rgba(131, 228, 236, 0.07);
}

.lp-lootbox-entry-top,
.lp-lootbox-entry-bottom {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.lp-lootbox-entry-label,
.lp-lootbox-entry-state {
  color: var(--cyan);
  font-size: 9px;
  font-weight: 860;
  letter-spacing: 0;
  text-transform: uppercase;
}

.lp-lootbox-entry-top strong {
  display: block;
  margin-top: 7px;
  color: var(--text);
  font-size: 20px;
  line-height: 1.05;
  font-weight: 780;
}

.lp-lootbox-entry-state {
  flex: 0 0 auto;
  color: var(--amber);
}

.lp-lootbox-entry-state-wrap {
  position: relative;
  z-index: 3;
  display: inline-flex;
  flex: 0 0 auto;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  max-width: 48%;
}

.lp-lootbox-blocker-chip {
  position: relative;
  display: inline-flex;
  min-height: 22px;
  max-width: 100%;
  align-items: center;
  justify-content: center;
  padding: 5px 8px;
  border: 1px solid rgba(208, 170, 108, 0.54);
  border-radius: 999px;
  color: var(--amber);
  background: rgba(208, 170, 108, 0.12);
  font-size: 9px;
  font-weight: 860;
  letter-spacing: 0;
  line-height: 1;
  text-transform: uppercase;
  white-space: nowrap;
}

.lp-lootbox-entry-art {
  position: relative;
  z-index: 1;
  display: grid;
  min-height: 138px;
  place-items: center;
}

.lp-lootbox-entry-art::before {
  content: "";
  position: absolute;
  inset: 18px 11%;
  border-radius: 50%;
  background:
    radial-gradient(circle, rgba(131, 228, 236, 0.2), transparent 64%),
    radial-gradient(circle, rgba(0, 0, 0, 0.42), transparent 68%);
  filter:
    blur(10px)
    drop-shadow(0 0 26px rgba(131, 228, 236, 0.12));
}

.lp-lootbox-entry-art img {
  position: relative;
  z-index: 1;
  width: min(94%, 230px);
  height: 158px;
  object-fit: contain;
  filter:
    drop-shadow(0 24px 36px rgba(0, 0, 0, 0.52))
    drop-shadow(0 0 22px rgba(131, 228, 236, 0.2));
  transform: translateY(8px);
  transform-origin: 50% 70%;
  transition:
    filter 180ms ease,
    transform 180ms ease;
  user-select: none;
  will-change: transform;
}

.lootbox-entry:hover .lp-lootbox-entry-art img,
.lootbox-entry:focus-visible .lp-lootbox-entry-art img {
  animation: lootboxEntryCaseHover 820ms ease-in-out infinite;
  filter:
    drop-shadow(0 28px 42px rgba(0, 0, 0, 0.56))
    drop-shadow(0 0 30px rgba(131, 228, 236, 0.28));
}

@keyframes lootboxEntryCaseHover {
  0%,
  100% {
    transform: translate3d(0, 3px, 0) rotate(0deg);
  }

  18% {
    transform: translate3d(-3px, -3px, 0) rotate(-1.5deg);
  }

  38% {
    transform: translate3d(3px, -5px, 0) rotate(1.4deg);
  }

  58% {
    transform: translate3d(-2px, -4px, 0) rotate(-0.9deg);
  }

  78% {
    transform: translate3d(2px, -2px, 0) rotate(0.8deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .lootbox-entry:hover .lp-lootbox-entry-art img,
  .lootbox-entry:focus-visible .lp-lootbox-entry-art img {
    animation: none;
    transform: translateY(2px);
  }
}

.lp-lootbox-entry-bottom {
  min-height: 46px;
  padding-top: 13px;
  border-top: 1px solid rgba(196, 224, 225, 0.12);
  color: var(--muted);
  font-size: 12px;
  line-height: 1.35;
}

.lp-lootbox-mini-lock {
  display: inline-grid;
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
  place-items: center;
  border: 1px solid rgba(208, 170, 108, 0.62);
  border-radius: 50%;
  color: var(--amber);
  background: rgba(0, 0, 0, 0.38);
}

.lp-lootbox-mini-lock svg {
  width: 16px;
  height: 16px;
}

.lp-quest-complete-overlay {
  position: fixed;
  inset: 0;
  z-index: 85;
  display: grid;
  place-items: center;
  padding: 22px;
  background:
    radial-gradient(circle at 50% 40%, rgba(208, 170, 108, 0.18), transparent 34%),
    rgba(0, 0, 0, 0.72);
  backdrop-filter: blur(10px);
}

.lp-quest-complete-dialog {
  position: relative;
  width: min(430px, 100%);
  display: grid;
  gap: 14px;
  padding: 24px;
  border: 1px solid rgba(208, 170, 108, 0.4);
  border-radius: var(--radius);
  color: var(--text);
  background:
    linear-gradient(135deg, rgba(208, 170, 108, 0.12), transparent 42%),
    rgba(5, 12, 14, 0.98);
  box-shadow:
    0 34px 110px rgba(0, 0, 0, 0.62),
    inset 0 0 0 1px rgba(131, 228, 236, 0.06);
}

.lp-quest-complete-close {
  position: absolute;
  right: 12px;
  top: 12px;
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border: 1px solid rgba(196, 224, 225, 0.14);
  border-radius: 7px;
  color: var(--muted);
  background: rgba(196, 224, 225, 0.04);
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
}

.lp-quest-complete-close:hover,
.lp-quest-complete-close:focus-visible,
.lp-quest-complete-action:hover,
.lp-quest-complete-action:focus-visible {
  border-color: rgba(131, 228, 236, 0.52);
  color: var(--text);
  outline: none;
}

.lp-quest-complete-kicker {
  width: fit-content;
  border: 1px solid rgba(208, 170, 108, 0.36);
  border-radius: 999px;
  padding: 6px 9px;
  color: var(--amber);
  font-size: 10px;
  font-weight: 860;
  letter-spacing: 0;
  text-transform: uppercase;
  background: rgba(208, 170, 108, 0.08);
}

.lp-quest-complete-dialog h3 {
  max-width: calc(100% - 42px);
  color: var(--text);
  font-size: 28px;
  line-height: 1.08;
  font-weight: 780;
}

.lp-quest-complete-reward,
.lp-quest-complete-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
  border: 1px solid rgba(196, 224, 225, 0.1);
  border-radius: 8px;
  padding: 12px;
  background: rgba(196, 224, 225, 0.035);
}

.lp-quest-complete-reward span,
.lp-quest-complete-meta span {
  color: var(--muted);
  font-size: 10px;
  font-weight: 820;
  letter-spacing: 0;
  text-transform: uppercase;
}

.lp-quest-complete-reward strong {
  min-width: 0;
  color: var(--cyan);
  font-size: 15px;
  line-height: 1.2;
  text-align: right;
  overflow-wrap: anywhere;
}

.lp-checkin-complete-note {
  border: 1px solid rgba(208, 170, 108, 0.2);
  border-radius: 8px;
  padding: 11px 12px;
  color: var(--text);
  font-size: 13px;
  line-height: 1.45;
  background: rgba(208, 170, 108, 0.08);
}

.lp-quest-complete-dialog.is-error .lp-quest-complete-kicker {
  border-color: rgba(255, 122, 122, 0.28);
  color: #ffb4b4;
  background: rgba(255, 122, 122, 0.1);
}

.lp-quest-complete-dialog.is-error .lp-quest-complete-reward {
  border-color: rgba(255, 122, 122, 0.24);
  background: rgba(255, 122, 122, 0.08);
}

.lp-quest-complete-dialog.is-error .lp-quest-complete-reward strong {
  color: #ffd2d2;
}

.lp-quest-complete-action {
  min-height: 42px;
  border: 1px solid rgba(208, 170, 108, 0.48);
  border-radius: 7px;
  color: #061013;
  font-size: 12px;
  font-weight: 860;
  letter-spacing: 0;
  background: linear-gradient(135deg, var(--amber), #f4dba0);
  cursor: pointer;
}

.lp-lootbox-unavailable-dialog {
  width: min(500px, 100%);
  border-color: rgba(131, 228, 236, 0.34);
  background:
    linear-gradient(135deg, rgba(131, 228, 236, 0.1), transparent 44%),
    rgba(5, 12, 14, 0.98);
}

.lp-lootbox-unavailable-kicker {
  border-color: rgba(131, 228, 236, 0.36);
  color: var(--cyan);
  background: rgba(131, 228, 236, 0.08);
}

.lp-lootbox-unavailable-lead {
  margin-top: -4px;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.45;
}

.lp-lootbox-unavailable-block,
.lp-lootbox-unavailable-note {
  display: grid;
  gap: 9px;
  border: 1px solid rgba(196, 224, 225, 0.1);
  border-radius: 8px;
  padding: 13px;
  background: rgba(196, 224, 225, 0.035);
}

.lp-lootbox-unavailable-block > span,
.lp-lootbox-unavailable-note > span {
  color: var(--muted);
  font-size: 10px;
  font-weight: 820;
  letter-spacing: 0;
  text-transform: uppercase;
}

.lp-lootbox-unavailable-block ul {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.lp-lootbox-unavailable-block li {
  position: relative;
  min-height: 22px;
  padding-left: 20px;
  color: var(--text);
  font-size: 13px;
  line-height: 1.35;
}

.lp-lootbox-unavailable-block li::before {
  content: "";
  position: absolute;
  left: 2px;
  top: 0.58em;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--cyan);
  box-shadow: 0 0 14px rgba(131, 228, 236, 0.52);
}

.lp-lootbox-unavailable-note strong {
  color: var(--text);
  font-size: 12px;
  line-height: 1.45;
  font-weight: 620;
}

.lp-lootbox-unavailable-status {
  margin: 0;
  border: 1px solid rgba(208, 170, 108, 0.26);
  border-radius: 8px;
  padding: 11px 12px;
  color: var(--amber);
  background: rgba(208, 170, 108, 0.08);
  font-size: 12px;
  line-height: 1.4;
}

.lp-lootbox-unavailable-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.lp-lootbox-unavailable-primary,
.lp-lootbox-unavailable-secondary {
  min-height: 42px;
  border-radius: 7px;
  font-size: 12px;
  font-weight: 860;
  letter-spacing: 0;
  cursor: pointer;
}

.lp-lootbox-unavailable-primary {
  border: 1px solid rgba(131, 228, 236, 0.52);
  color: #061013;
  background: linear-gradient(135deg, var(--cyan), #9be7dd);
}

.lp-lootbox-unavailable-primary:disabled {
  cursor: progress;
  opacity: 0.58;
}

.lp-lootbox-unavailable-secondary {
  border: 1px solid rgba(196, 224, 225, 0.18);
  color: var(--text);
  background: rgba(196, 224, 225, 0.045);
}

.lp-lootbox-unavailable-primary:hover,
.lp-lootbox-unavailable-primary:focus-visible,
.lp-lootbox-unavailable-secondary:hover,
.lp-lootbox-unavailable-secondary:focus-visible {
  border-color: rgba(131, 228, 236, 0.64);
  outline: none;
}

.lp-battlepass-detail-dialog {
  width: min(560px, 100%);
  max-height: min(760px, calc(100vh - 44px));
  overflow-y: auto;
  gap: 12px;
  border-color: rgba(131, 228, 236, 0.34);
  background:
    linear-gradient(135deg, rgba(131, 228, 236, 0.1), transparent 44%),
    rgba(5, 12, 14, 0.98);
}

.lp-battlepass-detail-overlay {
  background:
    radial-gradient(circle at 50% 40%, rgba(131, 228, 236, 0.16), transparent 34%),
    rgba(0, 0, 0, 0.72);
}

.lp-battlepass-detail-dialog .lp-quest-complete-kicker {
  border-color: rgba(131, 228, 236, 0.34);
  color: var(--cyan);
  background: rgba(131, 228, 236, 0.08);
}

.lp-battlepass-detail-dialog .lp-quest-complete-close {
  border-color: rgba(131, 228, 236, 0.18);
  color: var(--cyan);
  background: rgba(131, 228, 236, 0.045);
}

.lp-battlepass-season-rewards-dialog {
  width: min(620px, 100%);
  gap: 15px;
}

.lp-battlepass-season-rewards-lead {
  max-width: 54ch;
  margin: -4px 0 2px;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.55;
}

.lp-battlepass-season-rewards-content,
.lp-battlepass-season-reward-group {
  display: grid;
  gap: 10px;
}

.lp-battlepass-season-rewards-content {
  gap: 18px;
  padding: 4px 0;
}

.lp-battlepass-season-reward-heading {
  color: var(--muted);
  font-size: 10px;
  font-weight: 840;
  letter-spacing: 0;
  text-transform: uppercase;
}

.lp-battlepass-season-range-list {
  display: grid;
  border-top: 1px solid rgba(196, 224, 225, 0.12);
}

.lp-battlepass-season-range-header,
.lp-battlepass-season-range-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(118px, auto) 24px minmax(118px, auto);
  align-items: center;
  gap: 8px;
}

.lp-battlepass-season-range-header {
  color: var(--muted);
  border-top: 1px solid rgba(196, 224, 225, 0.12);
  padding: 0 0 10px;
}

.lp-battlepass-season-range-header + .lp-battlepass-season-range-list {
  border-top: 0;
}

.lp-battlepass-season-range-header > span:not(:first-child) {
  font-size: 10px;
  font-weight: 840;
  letter-spacing: 0;
  line-height: 1;
  text-align: right;
  text-transform: uppercase;
}

.lp-battlepass-season-range-header > span:last-child {
  grid-column: 4;
}

.lp-battlepass-season-range-row {
  min-height: 56px;
  border-bottom: 1px solid rgba(196, 224, 225, 0.12);
}

.lp-battlepass-season-range-row > strong {
  color: var(--text);
  font-size: 14px;
  line-height: 1.3;
}

.lp-battlepass-season-range-row > b {
  color: var(--cyan);
  font-size: 16px;
  font-weight: 880;
  text-align: right;
  white-space: nowrap;
}

.lp-battlepass-season-range-row > b.is-empty {
  color: var(--muted);
}

.lp-battlepass-season-range-row i {
  color: var(--amber);
  font-size: 16px;
  font-style: normal;
  text-align: center;
}

.lp-battlepass-season-fixed-list,
.lp-battlepass-season-possible-list {
  display: grid;
  gap: 8px;
}

.lp-battlepass-season-fixed-row {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) auto;
  align-items: center;
  gap: 9px;
  min-height: 38px;
  color: var(--text);
}

.lp-battlepass-season-fixed-row > span {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border: 1px solid rgba(131, 228, 236, 0.3);
  border-radius: 50%;
  color: var(--cyan);
  background: rgba(131, 228, 236, 0.07);
  font-size: 11px;
}

.lp-battlepass-season-fixed-row strong,
.lp-battlepass-season-fixed-row b {
  font-size: 13px;
  line-height: 1.35;
}

.lp-battlepass-season-fixed-row b {
  color: var(--amber);
}

.lp-battlepass-season-possible-list > div {
  display: grid;
  grid-template-columns: minmax(120px, 0.45fr) minmax(0, 1fr);
  gap: 16px;
  border-bottom: 1px solid rgba(196, 224, 225, 0.1);
  padding: 10px 0;
}

.lp-battlepass-season-possible-list strong {
  color: var(--text);
  font-size: 13px;
}

.lp-battlepass-season-possible-list span {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.lp-battlepass-season-rewards-note,
.lp-battlepass-season-rewards-empty {
  margin: 0;
  border-left: 2px solid rgba(208, 170, 108, 0.62);
  padding: 9px 12px;
  color: var(--amber);
  background: rgba(208, 170, 108, 0.055);
  font-size: 11px;
  line-height: 1.5;
}

.lp-battlepass-level-complete-dialog {
  width: min(520px, 100%);
  justify-items: start;
  background:
    radial-gradient(circle at 50% 22%, rgba(131, 228, 236, 0.18), transparent 30%),
    linear-gradient(145deg, rgba(131, 228, 236, 0.08), transparent 48%),
    rgba(5, 12, 14, 0.99);
}

.lp-battlepass-level-complete-mark {
  display: grid;
  place-items: center;
  width: 66px;
  height: 66px;
  border: 1px solid rgba(131, 228, 236, 0.54);
  border-radius: 50%;
  color: var(--cyan);
  background: rgba(131, 228, 236, 0.08);
  box-shadow:
    0 0 0 7px rgba(131, 228, 236, 0.035),
    0 0 34px rgba(131, 228, 236, 0.18);
  font-size: 26px;
  font-weight: 900;
}

.lp-battlepass-level-complete-lead {
  max-width: 46ch;
  margin: -3px 0 2px;
  color: var(--text);
  font-size: 14px;
  line-height: 1.55;
}

.lp-battlepass-level-complete-dialog .lp-battlepass-detail-lines {
  width: 100%;
}

.lp-battlepass-level-complete-dialog .lp-quest-complete-action {
  width: 100%;
}

.lp-battlepass-detail-season {
  margin-top: -6px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.35;
}

.lp-battlepass-detail-progress {
  display: grid;
  gap: 10px;
  border: 1px solid rgba(131, 228, 236, 0.16);
  border-radius: 8px;
  padding: 12px;
  background: rgba(131, 228, 236, 0.055);
}

.lp-battlepass-detail-progress > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.lp-battlepass-detail-progress span,
.lp-battlepass-detail-block span,
.lp-battlepass-received-card > span {
  color: var(--muted);
  font-size: 10px;
  font-weight: 820;
  letter-spacing: 0;
  text-transform: uppercase;
}

.lp-battlepass-detail-progress strong {
  color: var(--cyan);
  font-size: 15px;
  font-weight: 860;
}

.lp-battlepass-detail-meter {
  position: relative;
  overflow: hidden;
  height: 8px;
  border-radius: 999px;
  background: rgba(196, 224, 225, 0.1);
}

.lp-battlepass-detail-meter i {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--cyan), var(--teal));
}

.lp-battlepass-detail-lines {
  display: grid;
  gap: 12px;
  padding: 2px 0;
}

.lp-battlepass-detail-line {
  display: grid;
  gap: 5px;
  border-top: 1px solid rgba(196, 224, 225, 0.11);
  padding-top: 12px;
}

.lp-battlepass-detail-line:first-child {
  border-top: 0;
  padding-top: 0;
}

.lp-battlepass-detail-line span {
  color: var(--muted);
  font-size: 10px;
  font-weight: 820;
  letter-spacing: 0;
  text-transform: uppercase;
}

.lp-battlepass-detail-line p {
  margin: 0;
  color: var(--text);
  font-size: 13px;
  line-height: 1.45;
}

.lp-battlepass-detail-line strong {
  color: var(--text);
  font-size: 14px;
  font-weight: 820;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.lp-battlepass-detail-line.is-current strong,
.lp-battlepass-detail-line.is-reward strong {
  color: var(--cyan);
}

.lp-battlepass-detail-block,
.lp-battlepass-received-card {
  display: grid;
  gap: 7px;
  border: 1px solid rgba(196, 224, 225, 0.1);
  border-radius: 8px;
  padding: 12px;
  background: rgba(196, 224, 225, 0.035);
}

.lp-battlepass-detail-block.is-current {
  border-color: rgba(131, 228, 236, 0.28);
  background: rgba(131, 228, 236, 0.07);
}

.lp-battlepass-detail-block strong,
.lp-battlepass-received-card strong {
  color: var(--text);
  font-size: 15px;
  line-height: 1.2;
  overflow-wrap: anywhere;
}

.lp-battlepass-detail-block p,
.lp-battlepass-received-card p {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.45;
}

.lp-battlepass-help-list {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.lp-battlepass-help-list li {
  position: relative;
  min-height: 22px;
  padding-left: 20px;
  color: var(--text);
  font-size: 12px;
  line-height: 1.42;
}

.lp-battlepass-help-list li::before {
  content: "";
  position: absolute;
  left: 2px;
  top: 0.58em;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--cyan);
  box-shadow: 0 0 14px rgba(131, 228, 236, 0.52);
}

.lp-battlepass-help-note {
  margin: 0;
  border: 1px solid rgba(208, 170, 108, 0.26);
  border-radius: 8px;
  padding: 11px 12px;
  color: var(--amber);
  background: rgba(208, 170, 108, 0.08);
  font-size: 12px;
  line-height: 1.4;
}

.lp-battlepass-planned-reward strong {
  color: var(--cyan);
}

.lp-battlepass-detail-dialog .lp-battlepass-planned-reward {
  border-color: rgba(131, 228, 236, 0.18);
  background: rgba(131, 228, 236, 0.045);
}

.lp-battlepass-detail-dialog .lp-quest-complete-action {
  border-color: rgba(131, 228, 236, 0.44);
  color: #001012;
  background: linear-gradient(135deg, var(--cyan), var(--teal));
  box-shadow: 0 12px 34px rgba(84, 191, 198, 0.16);
}

.lp-battlepass-detail-dialog .lp-quest-complete-action:hover,
.lp-battlepass-detail-dialog .lp-quest-complete-action:focus-visible {
  border-color: rgba(131, 228, 236, 0.76);
  color: #001012;
  transform: translateY(-1px);
}

.lp-battlepass-received-card {
  border-color: rgba(148, 214, 184, 0.26);
  background: rgba(148, 214, 184, 0.07);
}

.lp-battlepass-received-card small {
  color: var(--cyan);
  font-size: 11px;
  font-weight: 760;
  line-height: 1.35;
}

.lp-battlepass-received-card em {
  width: fit-content;
  border: 1px dashed rgba(131, 228, 236, 0.44);
  border-radius: 7px;
  padding: 7px 9px;
  color: var(--text);
  font-size: 12px;
  font-style: normal;
  font-weight: 860;
  overflow-wrap: anywhere;
}

.lp-lootbox-overlay {
  --rarity-accent: #83e4ec;
  --rarity-accent-rgb: 131 228 236;
  --rarity-warm: #d0aa6c;
  --rarity-warm-rgb: 208 170 108;
  --rarity-grid-opacity: 0.16;
  --rarity-field-opacity: 0.34;
  --rarity-field-scale: 0.98;
  --rarity-beam-width: min(220px, 48%);
  --rarity-beam-height: 330px;
  --rarity-beam-opacity: 0.46;
  --rarity-reward-lift: 0px;
  --rarity-glow: 0.16;
  --rarity-shock-scale: 2.6;
  --rarity-particle-opacity: 0.9;
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  padding: 24px;
  background:
    radial-gradient(circle at 50% 44%, rgb(var(--rarity-accent-rgb) / 0.12), transparent 34%),
    rgba(0, 0, 0, 0.82);
  backdrop-filter: blur(10px);
}

.lp-lootbox-overlay.rarity-common {
  --rarity-accent: #9eb5b7;
  --rarity-accent-rgb: 158 181 183;
  --rarity-warm: #b2a37f;
  --rarity-warm-rgb: 178 163 127;
  --rarity-grid-opacity: 0.1;
  --rarity-field-opacity: 0.22;
  --rarity-field-scale: 0.9;
  --rarity-beam-width: min(170px, 42%);
  --rarity-beam-height: 270px;
  --rarity-beam-opacity: 0.28;
  --rarity-reward-lift: -6px;
  --rarity-glow: 0.08;
  --rarity-shock-scale: 1.8;
  --rarity-particle-opacity: 0.58;
}

.lp-lootbox-overlay.rarity-epic {
  --rarity-accent: #afa4ff;
  --rarity-accent-rgb: 175 164 255;
  --rarity-warm: #83e4ec;
  --rarity-warm-rgb: 131 228 236;
  --rarity-grid-opacity: 0.2;
  --rarity-field-opacity: 0.44;
  --rarity-field-scale: 1.08;
  --rarity-beam-width: min(258px, 54%);
  --rarity-beam-height: 370px;
  --rarity-beam-opacity: 0.58;
  --rarity-reward-lift: 12px;
  --rarity-glow: 0.24;
  --rarity-shock-scale: 3.1;
  --rarity-particle-opacity: 1;
}

.lp-lootbox-overlay.rarity-legendary {
  --rarity-accent: #d0aa6c;
  --rarity-accent-rgb: 208 170 108;
  --rarity-warm: #d0fbff;
  --rarity-warm-rgb: 208 251 255;
  --rarity-grid-opacity: 0.24;
  --rarity-field-opacity: 0.54;
  --rarity-field-scale: 1.16;
  --rarity-beam-width: min(306px, 62%);
  --rarity-beam-height: 420px;
  --rarity-beam-opacity: 0.72;
  --rarity-reward-lift: 26px;
  --rarity-glow: 0.34;
  --rarity-shock-scale: 3.7;
  --rarity-particle-opacity: 1;
}

.lp-lootbox-overlay.rarity-hidden {
  --rarity-accent: #9eb5b7;
  --rarity-accent-rgb: 158 181 183;
  --rarity-warm: #b9c5c6;
  --rarity-warm-rgb: 185 197 198;
  --rarity-grid-opacity: 0.1;
  --rarity-field-opacity: 0.2;
  --rarity-field-scale: 0.9;
  --rarity-beam-width: min(178px, 42%);
  --rarity-beam-height: 278px;
  --rarity-beam-opacity: 0.24;
  --rarity-reward-lift: -12px;
  --rarity-glow: 0.07;
  --rarity-shock-scale: 1.9;
  --rarity-particle-opacity: 0.52;
}

.lp-lootbox-dialog {
  position: relative;
  width: min(900px, 100%);
  max-height: min(780px, calc(100dvh - 40px));
  overflow: visible;
  padding: clamp(20px, 3vw, 32px);
  border: 1px solid rgba(131, 228, 236, 0.3);
  border-radius: var(--radius);
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.055), transparent 34%),
    rgba(4, 10, 13, 0.97);
  box-shadow:
    0 44px 130px rgba(0, 0, 0, 0.72),
    inset 0 0 0 1px rgba(131, 228, 236, 0.06);
}

.lp-lootbox-dialog::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(90deg, transparent 0 49.8%, rgb(var(--rarity-accent-rgb) / var(--rarity-grid-opacity)) 49.8% 50%, transparent 50%),
    linear-gradient(rgba(196, 224, 225, 0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(196, 224, 225, 0.035) 1px, transparent 1px);
  background-size: auto, 76px 76px, 76px 76px;
  mask-image: radial-gradient(circle at 50% 54%, #000, transparent 82%);
}

.lp-lootbox-close {
  position: absolute;
  right: 18px;
  top: 18px;
  z-index: 2;
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  border: 1px solid rgba(196, 224, 225, 0.16);
  border-radius: 7px;
  color: var(--muted);
  background: rgba(196, 224, 225, 0.04);
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
}

.lp-lootbox-close:hover,
.lp-lootbox-close:focus-visible {
  border-color: rgba(131, 228, 236, 0.42);
  color: var(--text);
  outline: none;
}

.lp-lootbox-dialog-head {
  position: relative;
  z-index: 1;
  max-width: 540px;
  padding-right: 58px;
}

.lp-lootbox-kicker {
  color: var(--cyan);
  font-size: 10px;
  font-weight: 860;
  letter-spacing: 0;
  text-transform: uppercase;
}

.lp-lootbox-dialog-head h3 {
  margin-top: 10px;
  color: var(--text);
  font-size: clamp(32px, 5vw, 54px);
  line-height: 0.98;
  font-weight: 760;
}

.lp-lootbox-dialog-head p {
  margin-top: 10px;
  color: #c2d0d1;
  font-size: 14px;
  line-height: 1.55;
}

.lp-lootbox-open-error {
  position: relative;
  z-index: 2;
  display: grid;
  gap: 9px;
  width: min(540px, 100%);
  margin-top: 14px;
  padding: 12px;
  border: 1px solid rgba(208, 170, 108, 0.42);
  border-radius: 8px;
  color: var(--text);
  background:
    linear-gradient(135deg, rgba(208, 170, 108, 0.13), transparent 72%),
    rgba(4, 11, 14, 0.74);
  box-shadow: inset 0 0 0 1px rgba(208, 170, 108, 0.08);
}

.lp-lootbox-open-error span {
  color: var(--amber);
  font-size: 9px;
  font-weight: 860;
  letter-spacing: 0;
  text-transform: uppercase;
}

.lp-lootbox-open-error strong {
  color: var(--text);
  font-size: 12px;
  font-weight: 720;
  line-height: 1.45;
}

.lp-lootbox-open-error button {
  width: fit-content;
  min-height: 34px;
  padding: 0 13px;
  border: 1px solid rgba(131, 228, 236, 0.36);
  border-radius: 8px;
  color: var(--cyan);
  background: rgba(131, 228, 236, 0.08);
  font-size: 10px;
  font-weight: 860;
  letter-spacing: 0;
  text-transform: uppercase;
}

.lp-lootbox-open-error button:hover,
.lp-lootbox-open-error button:focus-visible {
  border-color: rgba(131, 228, 236, 0.72);
  color: var(--text);
}

.lp-lootbox-open-error button:disabled {
  cursor: wait;
  opacity: 0.62;
}

.lp-lootbox-roulette {
  position: relative;
  z-index: 2;
  width: min(760px, 100%);
  margin: 18px auto 8px;
  opacity: 0;
  pointer-events: none;
  transform: translateY(-12px) scale(0.98);
  transition:
    opacity 240ms ease,
    transform 300ms cubic-bezier(0.16, 0.86, 0.2, 1);
}

.lp-lootbox-roulette.is-visible,
.lp-lootbox-roulette.is-finished {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0) scale(1);
}

.lp-lootbox-roulette.is-finished {
  opacity: 0.96;
}

.lp-lootbox-roulette-window {
  position: relative;
  height: 154px;
  overflow: hidden;
  pointer-events: none;
  border: 1px solid rgba(196, 224, 225, 0.18);
  border-radius: 8px;
  background:
    linear-gradient(90deg, rgba(0, 0, 0, 0.78), transparent 16% 84%, rgba(0, 0, 0, 0.78)),
    radial-gradient(circle at 50% 0%, rgb(var(--rarity-accent-rgb) / 0.16), transparent 40%),
    rgba(2, 8, 11, 0.86);
  box-shadow:
    0 24px 70px rgba(0, 0, 0, 0.62),
    inset 0 0 0 1px rgb(var(--rarity-accent-rgb) / 0.06);
  backdrop-filter: blur(18px);
}

.lp-lootbox-roulette-window::before,
.lp-lootbox-roulette-window::after {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  z-index: 4;
  width: 18%;
  pointer-events: none;
}

.lp-lootbox-roulette-window::before {
  left: 0;
  background: linear-gradient(90deg, rgba(0, 0, 0, 0.92), transparent);
}

.lp-lootbox-roulette-window::after {
  right: 0;
  background: linear-gradient(270deg, rgba(0, 0, 0, 0.92), transparent);
}

.lp-lootbox-roulette-track {
  position: absolute;
  left: 50%;
  top: 11px;
  display: flex;
  gap: 10px;
  pointer-events: none;
  will-change: transform;
  transform: translate3d(96px, 0, 0);
}

.lp-lootbox-roulette-card {
  --card-rgb: 158 181 183;
  flex: 0 0 104px;
  display: grid;
  align-content: space-between;
  height: 132px;
  padding: 10px;
  border: 1px solid rgb(var(--card-rgb) / 0.32);
  border-radius: 7px;
  color: var(--text);
  text-align: left;
  background:
    radial-gradient(circle at 50% 12%, rgb(var(--card-rgb) / 0.2), transparent 42%),
    linear-gradient(160deg, rgb(var(--card-rgb) / 0.11), transparent 52%),
    rgba(5, 13, 16, 0.96);
  box-shadow:
    inset 0 0 0 1px rgb(var(--card-rgb) / 0.05),
    0 14px 30px rgba(0, 0, 0, 0.28);
  cursor: default;
  pointer-events: none;
  transform: translateY(0) scale(0.96);
  transition:
    border-color 180ms ease,
    box-shadow 180ms ease,
    transform 180ms ease;
}

.lp-lootbox-roulette-card[data-rarity="common"],
.lp-lootbox-roulette-card[data-rarity="hidden"] {
  --card-rgb: 158 181 183;
}

.lp-lootbox-roulette-card[data-rarity="rare"] {
  --card-rgb: 131 228 236;
}

.lp-lootbox-roulette-card[data-rarity="epic"] {
  --card-rgb: 175 164 255;
}

.lp-lootbox-roulette-card[data-rarity="legendary"] {
  --card-rgb: 208 170 108;
}

.lp-lootbox-roulette-card.is-winning {
  border-color: rgb(var(--card-rgb) / 0.86);
  box-shadow:
    0 0 34px rgb(var(--card-rgb) / 0.28),
    0 20px 44px rgba(0, 0, 0, 0.42),
    inset 0 0 0 1px rgb(var(--card-rgb) / 0.16);
  transform: translateY(-5px) scale(1.03);
}

.lp-lootbox-roulette.is-finished .lp-lootbox-roulette-window,
.lp-lootbox-roulette.is-finished .lp-lootbox-roulette-track {
  pointer-events: auto;
}

.lp-lootbox-roulette-card.can-collect {
  cursor: pointer;
  pointer-events: auto;
}

.lp-lootbox-roulette-card.can-collect:hover,
.lp-lootbox-roulette-card.can-collect:focus-visible {
  border-color: rgb(var(--card-rgb) / 0.98);
  outline: none;
  box-shadow:
    0 0 44px rgb(var(--card-rgb) / 0.34),
    0 22px 52px rgba(0, 0, 0, 0.48),
    inset 0 0 0 1px rgb(var(--card-rgb) / 0.22);
  transform: translateY(-7px) scale(1.045);
}

.lp-lootbox-roulette-card.is-collected {
  opacity: 0.82;
  filter: saturate(0.76);
}

.lp-lootbox-roulette-card:disabled {
  opacity: 1;
}

.lp-lootbox-roulette-card strong,
.lp-lootbox-roulette-card span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
}

.lp-lootbox-roulette-card strong {
  font-size: 14px;
  line-height: 1.1;
}

.lp-lootbox-roulette-card span {
  color: rgb(var(--card-rgb));
  font-size: 9px;
  font-weight: 860;
  letter-spacing: 0;
  text-transform: uppercase;
}

.lp-lootbox-roulette-card i {
  justify-self: center;
  width: 38px;
  height: 48px;
  border: 1px solid rgb(var(--card-rgb) / 0.5);
  border-radius: 7px;
  background:
    linear-gradient(180deg, rgb(var(--card-rgb) / 0.26), transparent),
    rgba(0, 0, 0, 0.26);
  box-shadow: 0 0 18px rgb(var(--card-rgb) / 0.15);
}

.lp-lootbox-roulette-marker {
  position: absolute;
  top: -12px;
  bottom: -12px;
  left: 50%;
  z-index: 6;
  width: 2px;
  pointer-events: none;
  background: linear-gradient(180deg, transparent, var(--amber) 18%, var(--cyan) 50%, var(--amber) 82%, transparent);
  box-shadow:
    0 0 16px rgb(var(--rarity-accent-rgb) / 0.86),
    0 0 36px rgb(var(--rarity-warm-rgb) / 0.36);
  transform: translateX(-50%);
}

.lp-lootbox-roulette-marker::before,
.lp-lootbox-roulette-marker::after {
  content: "";
  position: absolute;
  left: 50%;
  width: 22px;
  height: 18px;
  border: 1px solid rgb(var(--rarity-warm-rgb) / 0.72);
  background: rgba(0, 0, 0, 0.72);
  transform: translateX(-50%) rotate(45deg);
}

.lp-lootbox-roulette-marker::before {
  top: -5px;
}

.lp-lootbox-roulette-marker::after {
  bottom: -5px;
}

.lp-lootbox-roulette-caption {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  flex-wrap: wrap;
  gap: 12px;
  min-height: 32px;
  padding: 8px 10px 0;
  color: var(--muted);
  font-size: 9px;
  font-weight: 860;
  letter-spacing: 0;
  pointer-events: none;
  text-transform: uppercase;
}

.lp-lootbox-roulette-caption strong {
  margin-left: auto;
  max-width: min(280px, 42vw);
  overflow: hidden;
  color: var(--cyan);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lp-lootbox-roulette-skip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 30px;
  padding: 0 13px;
  border: 1px solid rgba(196, 224, 225, 0.18);
  border-radius: 7px;
  color: var(--text);
  background:
    linear-gradient(135deg, rgba(131, 228, 236, 0.12), transparent),
    rgba(196, 224, 225, 0.04);
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0;
  text-transform: uppercase;
  pointer-events: auto;
  cursor: pointer;
  box-shadow: inset 0 0 0 1px rgba(131, 228, 236, 0.05);
}

.lp-lootbox-roulette-skip:hover,
.lp-lootbox-roulette-skip:focus-visible {
  border-color: rgba(131, 228, 236, 0.58);
  color: var(--cyan);
  outline: none;
  background:
    linear-gradient(135deg, rgba(131, 228, 236, 0.22), transparent),
    rgba(131, 228, 236, 0.1);
}

.lp-lootbox-roulette-skip[hidden] {
  display: none;
}

.lp-lootbox-machine {
  position: relative;
  z-index: 1;
  height: clamp(300px, 44vh, 390px);
  margin: 18px 0 10px;
  isolation: isolate;
  perspective: 1200px;
  overflow: visible;
  animation: lootboxFloat 3.8s ease-in-out infinite;
}

.lp-lootbox-machine.is-ready {
  cursor: pointer;
}

.lp-lootbox-machine:focus-visible {
  outline: 1px solid rgba(131, 228, 236, 0.72);
  outline-offset: 6px;
}

.lp-lootbox-machine::after {
  content: "";
  position: absolute;
  left: 50%;
  bottom: 18px;
  z-index: 0;
  width: min(330px, 62%);
  height: 34px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.54);
  filter: blur(14px);
  transform: translateX(-50%);
}

.lp-lootbox-energy-field {
  position: absolute;
  left: 50%;
  top: 52%;
  z-index: 1;
  width: min(280px, 58%);
  aspect-ratio: 1;
  border-radius: 50%;
  background: radial-gradient(circle, rgb(var(--rarity-warm-rgb) / 0.72), rgb(var(--rarity-accent-rgb) / 0.28) 32%, transparent 68%);
  opacity: 0.22;
  filter: blur(12px);
  transform: translate(-50%, -50%) scale(0.88);
  transition:
    opacity 260ms ease,
    transform 500ms ease;
}

.lp-lootbox-shock-ring {
  position: absolute;
  left: 50%;
  bottom: 104px;
  z-index: 2;
  width: min(240px, 58%);
  aspect-ratio: 1;
  border: 1px solid rgb(var(--rarity-accent-rgb) / 0.48);
  border-radius: 50%;
  opacity: 0;
  transform: translateX(-50%) scale(0.72);
  pointer-events: none;
}

.lp-lootbox-energy-slit {
  position: absolute;
  left: 50%;
  bottom: 198px;
  z-index: 9;
  width: min(220px, 52%);
  height: 4px;
  border-radius: 999px;
  background: linear-gradient(90deg, transparent, rgb(var(--rarity-warm-rgb) / 0.88), rgb(var(--rarity-accent-rgb) / 0.84), transparent);
  box-shadow: 0 0 24px rgb(var(--rarity-accent-rgb) / 0.42);
  opacity: 0;
  transform: translateX(-50%) scaleX(0.16);
  pointer-events: none;
}

.lp-lootbox-beam {
  position: absolute;
  left: 50%;
  bottom: 166px;
  z-index: 1;
  width: var(--rarity-beam-width);
  height: var(--rarity-beam-height);
  opacity: 0;
  transform: translateX(-50%) scaleY(0.2);
  transform-origin: bottom;
  background:
    linear-gradient(180deg, rgb(var(--rarity-warm-rgb) / 0.54), rgb(var(--rarity-accent-rgb) / 0.14) 46%, transparent),
    linear-gradient(90deg, transparent, rgb(var(--rarity-warm-rgb) / 0.16), transparent);
  clip-path: polygon(44% 0, 56% 0, 100% 100%, 0 100%);
  filter: blur(3px);
}

.lp-lootbox-case-image {
  position: absolute;
  left: 50%;
  bottom: 34px;
  z-index: 4;
  width: min(500px, 88%);
  height: min(318px, 72%);
  object-fit: contain;
  pointer-events: none;
  user-select: none;
  filter:
    drop-shadow(0 32px 42px rgba(0, 0, 0, 0.58))
    drop-shadow(0 0 28px rgb(var(--rarity-accent-rgb) / 0.18));
  transform: translateX(-50%) translateY(0) scale(1);
  transform-origin: 50% 62%;
  transition:
    filter 420ms ease,
    opacity 320ms ease,
    transform 760ms cubic-bezier(0.2, 0.9, 0.2, 1);
}

.lp-lootbox-case,
.lp-lootbox-core,
.lp-lootbox-particle {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
}

.lp-lootbox-case {
  border: 1px solid rgba(196, 224, 225, 0.18);
  border-radius: 8px;
  box-shadow:
    inset 0 0 0 1px rgba(131, 228, 236, 0.08),
    0 24px 80px rgba(0, 0, 0, 0.46);
  transition: transform 760ms cubic-bezier(0.2, 0.9, 0.2, 1);
}

.lp-lootbox-case-base {
  bottom: 54px;
  z-index: 3;
  width: min(320px, 72%);
  height: 160px;
  background:
    linear-gradient(90deg, transparent 0 44%, rgba(131, 228, 236, 0.22) 44% 56%, transparent 56% 100%),
    linear-gradient(180deg, #101c20, #050a0d 62%, #10191c);
}

.lp-lootbox-case-lid {
  bottom: 208px;
  z-index: 5;
  width: min(350px, 78%);
  height: 62px;
  background:
    linear-gradient(90deg, transparent 0 45%, rgba(208, 170, 108, 0.24) 45% 55%, transparent 55% 100%),
    linear-gradient(180deg, #14272c, #071014);
  transform-origin: 50% 100%;
}

.lp-lootbox-case-left,
.lp-lootbox-case-right {
  bottom: 72px;
  z-index: 4;
  width: min(116px, 26%);
  height: 132px;
  background:
    linear-gradient(135deg, rgba(131, 228, 236, 0.16), transparent 45%),
    #081116;
}

.lp-lootbox-case-left {
  margin-left: -102px;
}

.lp-lootbox-case-right {
  margin-left: 102px;
}

.lp-lootbox-core {
  bottom: 125px;
  z-index: 6;
  display: grid;
  width: 74px;
  height: 74px;
  place-items: center;
  border: 1px solid rgba(208, 170, 108, 0.58);
  border-radius: 50%;
  background:
    radial-gradient(circle, rgba(208, 170, 108, 0.38), transparent 56%),
    rgba(0, 0, 0, 0.48);
  box-shadow: 0 0 28px rgba(208, 170, 108, 0.22);
}

.lp-lootbox-core::before {
  content: "";
  width: 28px;
  height: 28px;
  border: 1px solid rgba(131, 228, 236, 0.74);
  transform: rotate(45deg);
}

.lp-lootbox-lock-open {
  position: absolute;
  left: 50%;
  bottom: 94px;
  z-index: 8;
  display: grid;
  width: 76px;
  height: 76px;
  place-items: center;
  border: 1px solid rgba(208, 170, 108, 0.64);
  border-radius: 50%;
  color: var(--amber);
  background:
    radial-gradient(circle, rgba(208, 170, 108, 0.28), transparent 56%),
    rgba(0, 0, 0, 0.58);
  box-shadow:
    0 0 34px rgba(208, 170, 108, 0.18),
    inset 0 0 0 1px rgba(131, 228, 236, 0.1);
  transform: translateX(-50%);
  transition:
    border-color 180ms ease,
    color 180ms ease,
    opacity 220ms ease,
    transform 420ms cubic-bezier(0.2, 0.9, 0.2, 1);
}

.lp-lootbox-lock-open svg {
  width: 25px;
  height: 25px;
}

.lp-lootbox-machine.is-ready:hover .lp-lootbox-lock-open,
.lp-lootbox-machine.is-ready:focus-visible .lp-lootbox-lock-open {
  border-color: rgba(131, 228, 236, 0.88);
  color: var(--cyan);
  box-shadow:
    0 0 36px rgba(131, 228, 236, 0.28),
    0 0 80px rgba(208, 170, 108, 0.16);
}

.lp-lootbox-particle {
  bottom: 170px;
  z-index: 7;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--rarity-accent);
  opacity: 0;
  box-shadow: 0 0 18px rgb(var(--rarity-accent-rgb) / 0.75);
}

.lp-lootbox-machine.is-charging {
  animation: lootboxChargeKick 720ms cubic-bezier(0.2, 0.86, 0.2, 1) both;
}

.lp-lootbox-machine.is-charging .lp-lootbox-shock-ring {
  animation: lootboxShockWave 900ms cubic-bezier(0.16, 0.84, 0.2, 1) both;
}

.lp-lootbox-machine.is-charging .lp-lootbox-energy-slit {
  animation: lootboxSlitCharge 900ms cubic-bezier(0.16, 0.84, 0.2, 1) both;
}

.lp-lootbox-machine.is-opening {
  animation: lootboxKick 1320ms cubic-bezier(0.16, 0.9, 0.18, 1) both;
}

.lp-lootbox-machine.is-open,
.lp-lootbox-machine.is-collected {
  animation: none;
  transform: translateY(-7px) scale(1) rotateX(0deg);
}

.lp-lootbox-machine.is-opening .lp-lootbox-lock-open,
.lp-lootbox-machine.is-open .lp-lootbox-lock-open,
.lp-lootbox-machine.is-collected .lp-lootbox-lock-open {
  opacity: 0;
  pointer-events: none;
  transform: translateX(-50%) translateY(-30px) scale(0.72);
}

.lp-lootbox-machine.is-opening .lp-lootbox-case-image,
.lp-lootbox-machine.is-open .lp-lootbox-case-image {
  filter:
    drop-shadow(0 34px 46px rgba(0, 0, 0, 0.56))
    drop-shadow(0 0 42px rgb(var(--rarity-accent-rgb) / 0.32))
    brightness(1.08);
  transform: translateX(-50%) translateY(-18px) scale(1.035) rotateX(-4deg);
}

.lp-lootbox-machine.is-collected .lp-lootbox-case-image {
  opacity: 0.72;
  transform: translateX(-50%) translateY(-8px) scale(0.98);
}

.lp-lootbox-machine.is-opening .lp-lootbox-case-lid,
.lp-lootbox-machine.is-open .lp-lootbox-case-lid {
  transform: translateX(-50%) translateY(-122px) rotateX(-66deg) rotateZ(-1deg);
}

.lp-lootbox-machine.is-opening .lp-lootbox-case-left,
.lp-lootbox-machine.is-open .lp-lootbox-case-left {
  transform: translateX(-50%) translateX(-78px) rotateY(24deg);
}

.lp-lootbox-machine.is-opening .lp-lootbox-case-right,
.lp-lootbox-machine.is-open .lp-lootbox-case-right {
  transform: translateX(-50%) translateX(78px) rotateY(-24deg);
}

.lp-lootbox-machine.is-opening .lp-lootbox-energy-field,
.lp-lootbox-machine.is-open .lp-lootbox-energy-field,
.lp-lootbox-machine.is-collected .lp-lootbox-energy-field {
  opacity: var(--rarity-field-opacity);
  transform: translate(-50%, -50%) scale(var(--rarity-field-scale));
}

.lp-lootbox-machine.is-opening .lp-lootbox-beam,
.lp-lootbox-machine.is-open .lp-lootbox-beam {
  animation: lootboxBeamRise 1320ms cubic-bezier(0.16, 0.84, 0.2, 1) 220ms both;
}

.lp-lootbox-machine.is-opening .lp-lootbox-particle,
.lp-lootbox-machine.is-open .lp-lootbox-particle {
  animation: lootboxParticleBurst 1180ms cubic-bezier(0.18, 0.84, 0.18, 1) calc(260ms + var(--particle-index) * 46ms) both;
}

.lp-lootbox-dialog-actions {
  position: relative;
  z-index: 1;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  margin-top: 18px;
}

.lp-lootbox-dialog-actions .lp-club-primary-link,
.lp-lootbox-dialog-actions .lp-club-ghost-link {
  min-width: 180px;
  padding: 0 16px;
  cursor: pointer;
}

.lp-lootbox-dialog-actions .lp-club-primary-link:disabled {
  opacity: 0.48;
  cursor: not-allowed;
  transform: none;
}

@keyframes lootboxFloat {
  0%,
  100% {
    transform: translateY(0) rotateX(0deg);
  }

  50% {
    transform: translateY(-8px) rotateX(1.5deg);
  }
}

@keyframes lootboxKick {
  0% {
    transform: translateY(0) scale(1) rotateX(0deg);
  }

  24% {
    transform: translateY(6px) scale(0.988) rotateX(1deg);
  }

  52% {
    transform: translateY(-13px) scale(1.014) rotateX(-1.2deg);
  }

  74% {
    transform: translateY(-5px) scale(1.004) rotateX(0.4deg);
  }

  100% {
    transform: translateY(-7px) scale(1) rotateX(0deg);
  }
}

@keyframes lootboxChargeKick {
  0%,
  100% {
    transform: translateY(0) scale(1);
  }

  55% {
    transform: translateY(5px) scale(0.992);
  }
}

@keyframes lootboxShockWave {
  0% {
    opacity: 0;
    transform: translateX(-50%) scale(0.72);
  }

  22% {
    opacity: 0.9;
  }

  100% {
    opacity: 0;
    transform: translateX(-50%) scale(var(--rarity-shock-scale));
  }
}

@keyframes lootboxSlitCharge {
  0% {
    opacity: 0;
    transform: translateX(-50%) scaleX(0.16);
  }

  38% {
    opacity: 1;
  }

  100% {
    opacity: 0.72;
    transform: translateX(-50%) scaleX(0.88);
  }
}

@keyframes lootboxBeamRise {
  0% {
    opacity: 0;
    transform: translateX(-50%) scaleY(0.08);
  }

  30% {
    opacity: 0.92;
  }

  100% {
    opacity: var(--rarity-beam-opacity);
    transform: translateX(-50%) scaleY(1);
  }
}

@keyframes lootboxParticleBurst {
  0% {
    opacity: 0;
    transform: translate(-50%, 0) rotate(calc((var(--particle-index) - 4) * 28deg)) translateY(0) scale(0.28);
  }

  16% {
    opacity: var(--rarity-particle-opacity);
  }

  62% {
    opacity: var(--rarity-particle-opacity);
  }

  100% {
    opacity: 0;
    transform: translate(-50%, 0) rotate(calc((var(--particle-index) - 4) * 28deg)) translateY(-172px) scale(1.08);
  }
}

.lp-club-battlepass {
  --battlepass-card-width: 132px;
  --battlepass-card-gap: 18px;
  --battlepass-card-half: calc(var(--battlepass-card-width) / 2);
  position: relative;
  display: grid;
  gap: 24px;
  min-width: 0;
  overflow: hidden;
  padding: clamp(22px, 2.4vw, 34px);
  border-color: rgba(131, 228, 236, 0.2);
  border-radius: 18px;
  background:
    radial-gradient(circle at 42% 72%, rgba(131, 228, 236, 0.12), transparent 28%),
    radial-gradient(circle at 86% 18%, rgba(208, 170, 108, 0.11), transparent 28%),
    linear-gradient(135deg, rgba(255, 255, 255, 0.045), transparent 36%),
    rgba(3, 10, 12, 0.96);
  box-shadow:
    0 24px 90px rgba(0, 0, 0, 0.46),
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    inset 0 -1px 0 rgba(131, 228, 236, 0.04);
  isolation: isolate;
}

.lp-club-battlepass::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background:
    linear-gradient(90deg, transparent 0 49.85%, rgba(131, 228, 236, 0.07) 49.85% 50.15%, transparent 50.15%),
    linear-gradient(rgba(131, 228, 236, 0.03) 1px, transparent 1px);
  background-size: auto, 100% 72px;
  opacity: 0.7;
}

.lp-club-battlepass-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
}

.lp-club-battlepass-title {
  min-width: 0;
}

.lp-club-battlepass-title h2 {
  color: var(--text);
  font-size: clamp(30px, 3vw, 42px);
  line-height: 0.98;
  letter-spacing: 0;
}

.lp-club-battlepass-title p {
  max-width: 560px;
  margin-top: 10px;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.45;
}

.lp-club-battlepass-help {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  min-height: 40px;
  padding: 0 14px;
  border: 1px solid rgba(196, 224, 225, 0.14);
  border-radius: 8px;
  color: var(--muted);
  background: rgba(255, 255, 255, 0.035);
  cursor: pointer;
  font: inherit;
  font-size: 10px;
  font-weight: 860;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  white-space: nowrap;
  transition:
    border-color 180ms ease,
    background 180ms ease,
    color 180ms ease,
    transform 180ms ease;
}

.lp-club-battlepass-help span {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border: 1px solid rgba(196, 224, 225, 0.35);
  border-radius: 50%;
}

.lp-club-battlepass-help:hover,
.lp-club-battlepass-help:focus-visible {
  border-color: rgba(131, 228, 236, 0.52);
  color: var(--cyan);
  background: rgba(131, 228, 236, 0.08);
  outline: none;
  transform: translateY(-1px);
}

.lp-club-battlepass-top {
  display: grid;
  grid-template-columns: minmax(280px, 0.95fr) minmax(340px, 1.25fr);
  gap: 18px;
  min-width: 0;
}

.lp-club-battlepass-season,
.lp-club-battlepass-main-reward {
  position: relative;
  overflow: hidden;
  min-height: 186px;
  border: 1px solid rgba(196, 224, 225, 0.14);
  border-radius: 10px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.045), transparent 44%),
    rgba(2, 11, 14, 0.72);
}

.lp-club-battlepass-season {
  display: grid;
  grid-template-columns: minmax(108px, 0.72fr) minmax(0, 1fr);
  align-items: center;
  gap: 18px;
  padding: 22px;
}

.lp-club-battlepass-season-button {
  width: 100%;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    border-color 180ms ease,
    background 180ms ease,
    box-shadow 180ms ease,
    transform 180ms ease;
}

.lp-club-battlepass-season-button:hover,
.lp-club-battlepass-season-button:focus-visible {
  border-color: rgba(131, 228, 236, 0.5);
  background:
    linear-gradient(135deg, rgba(131, 228, 236, 0.09), transparent 48%),
    rgba(2, 11, 14, 0.82);
  box-shadow:
    0 18px 54px rgba(0, 0, 0, 0.28),
    inset 0 0 0 1px rgba(131, 228, 236, 0.06);
  outline: none;
  transform: translateY(-2px);
}

.lp-club-battlepass-season-button:hover .lp-club-battlepass-emblem,
.lp-club-battlepass-season-button:focus-visible .lp-club-battlepass-emblem {
  transform: scale(1.035);
}

.lp-club-battlepass-emblem {
  display: grid;
  place-items: center;
  min-height: 116px;
  transition: transform 180ms ease;
}

.lp-club-battlepass-emblem img {
  display: block;
  width: 104px;
  height: 104px;
  object-fit: contain;
  filter:
    drop-shadow(0 0 18px rgba(131, 228, 236, 0.44))
    drop-shadow(0 12px 18px rgba(0, 0, 0, 0.45));
}

.lp-club-battlepass-season-copy {
  display: grid;
  min-width: 0;
}

.lp-club-battlepass-season-copy small,
.lp-club-battlepass-main-copy small {
  color: var(--cyan);
  font-size: 10px;
  font-weight: 860;
  letter-spacing: 0.15em;
  text-transform: uppercase;
}

.lp-club-battlepass-season-copy strong {
  color: var(--text);
  font-size: clamp(23px, 2vw, 30px);
  line-height: 1;
}

.lp-club-battlepass-season-copy span {
  margin-top: 16px;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.35;
}

.lp-club-battlepass-season-copy b {
  color: var(--amber);
  font-size: 18px;
}

.lp-club-battlepass-season-copy > small {
  margin-top: 12px;
  color: var(--cyan);
  font-size: 9px;
  font-weight: 820;
  letter-spacing: 0;
  opacity: 0.78;
}

.lp-club-battlepass-main-reward {
  display: grid;
  grid-template-columns: minmax(190px, 0.9fr) minmax(210px, 1fr);
  align-items: center;
  gap: 12px;
  padding: 22px 24px;
  border-color: rgba(208, 170, 108, 0.46);
  background:
    radial-gradient(circle at 78% 50%, rgba(208, 170, 108, 0.2), transparent 34%),
    linear-gradient(90deg, rgba(208, 170, 108, 0.08), transparent 56%),
    rgba(10, 11, 8, 0.72);
}

.lp-club-battlepass-main-reward::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(90deg, transparent 0 64%, rgba(208, 170, 108, 0.1) 64% 65%, transparent 65%),
    linear-gradient(rgba(208, 170, 108, 0.08) 1px, transparent 1px);
  background-size: auto, 100% 54px;
  opacity: 0.65;
}

.lp-club-battlepass-main-copy,
.lp-club-battlepass-main-case {
  position: relative;
  z-index: 1;
}

.lp-club-battlepass-main-copy strong {
  display: block;
  margin-top: 14px;
  color: var(--text);
  font-size: clamp(25px, 2vw, 32px);
  line-height: 1.04;
}

.lp-club-battlepass-main-copy span {
  display: block;
  margin-top: 12px;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.4;
}

.lp-club-battlepass-main-copy em {
  display: block;
  margin-top: 18px;
  color: var(--amber);
  font-size: 11px;
  font-style: normal;
  font-weight: 860;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.lp-club-battlepass-main-case {
  display: grid;
  place-items: center;
  min-height: 144px;
}

.lp-club-battlepass-main-case::before {
  content: "";
  position: absolute;
  width: 220px;
  height: 112px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(208, 170, 108, 0.24), transparent 66%);
  filter: blur(8px);
  transform: translateY(42px);
}

.lp-club-battlepass-main-case img {
  position: relative;
  z-index: 1;
  width: min(230px, 95%);
  max-height: 150px;
  object-fit: contain;
  filter:
    drop-shadow(0 24px 34px rgba(0, 0, 0, 0.58))
    drop-shadow(0 0 24px rgba(208, 170, 108, 0.34));
  animation: battlePassCaseHover 4.6s ease-in-out infinite;
}

.lp-club-battlepass-track {
  min-width: 0;
  overflow: hidden;
}

.lp-club-battlepass-track-scroll {
  overflow-x: auto;
  overflow-y: hidden;
  padding: 12px 4px 4px;
  scroll-snap-type: x proximity;
  scrollbar-color: rgba(131, 228, 236, 0.62) rgba(196, 224, 225, 0.08);
  scrollbar-width: thin;
  -webkit-overflow-scrolling: touch;
}

.lp-club-battlepass-track-scroll::-webkit-scrollbar {
  height: 9px;
}

.lp-club-battlepass-track-scroll::-webkit-scrollbar-track {
  border-radius: 999px;
  background: rgba(196, 224, 225, 0.08);
}

.lp-club-battlepass-track-scroll::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: linear-gradient(90deg, var(--cyan), var(--amber));
}

.lp-club-battlepass-track-inner {
  width: max-content;
  min-width: 100%;
  padding: 4px 2px 0;
}

.lp-club-battlepass-level-rail,
.lp-club-battlepass-reward-grid {
  display: grid;
  gap: var(--battlepass-card-gap);
  width: 100%;
  min-width: max-content;
}

.lp-club-battlepass-level-rail {
  position: relative;
  margin-bottom: 34px;
  isolation: isolate;
}

.lp-club-battlepass-level-rail::before,
.lp-club-battlepass-level-rail::after {
  content: "";
  position: absolute;
  left: var(--battlepass-rail-edge, var(--battlepass-card-half));
  right: var(--battlepass-rail-edge, var(--battlepass-card-half));
  top: 28px;
  z-index: -1;
  height: 3px;
  border-radius: 999px;
  background: rgba(196, 224, 225, 0.18);
}

.lp-club-battlepass-level-rail::after {
  background: linear-gradient(90deg, var(--cyan), var(--teal), var(--amber));
  box-shadow: 0 0 24px rgba(131, 228, 236, 0.46);
  transform: scaleX(var(--battlepass-line-scale, 0));
  transform-origin: left center;
}

.lp-club-battlepass-level {
  position: relative;
  display: grid;
  place-items: center;
  justify-self: center;
  width: 56px;
  height: 56px;
  border: 1px solid rgba(196, 224, 225, 0.25);
  border-radius: 50%;
  color: var(--text);
  background:
    radial-gradient(circle, rgba(131, 228, 236, 0.12), transparent 68%),
    #03090b;
  box-shadow:
    0 0 0 5px rgba(0, 0, 0, 0.42),
    inset 0 0 0 4px rgba(196, 224, 225, 0.05);
  cursor: pointer;
  font: inherit;
  font-size: 21px;
  font-weight: 860;
  transition:
    border-color 180ms ease,
    color 180ms ease,
    box-shadow 180ms ease,
    transform 180ms ease;
}

.lp-club-battlepass-level:hover,
.lp-club-battlepass-level:focus-visible,
.lp-club-battlepass-level.is-active {
  border-color: rgba(131, 228, 236, 0.96);
  color: var(--cyan);
  background:
    radial-gradient(circle, rgba(131, 228, 236, 0.35), transparent 66%),
    #061113;
  box-shadow:
    0 0 0 5px rgba(131, 228, 236, 0.1),
    0 0 42px rgba(131, 228, 236, 0.46),
    inset 0 0 0 4px rgba(131, 228, 236, 0.08);
  outline: none;
  transform: translateY(-1px);
}

.lp-club-battlepass-level.is-done {
  border-color: rgba(148, 214, 184, 0.42);
  color: var(--good);
}

.lp-club-battlepass-level.is-active::after {
  content: "";
  position: absolute;
  left: 50%;
  top: calc(100% + 8px);
  width: 0;
  height: 0;
  border-left: 12px solid transparent;
  border-right: 12px solid transparent;
  border-top: 18px solid var(--cyan);
  filter: drop-shadow(0 0 14px rgba(131, 228, 236, 0.72));
  transform: translateX(-50%);
}

.lp-club-battlepass-reward {
  --rank: #b7c4c6;
  --rank-line: rgba(196, 224, 225, 0.2);
  --rank-glow: rgba(196, 224, 225, 0.08);
  position: relative;
  display: grid;
  grid-template-rows: minmax(82px, 1fr) auto;
  align-items: end;
  justify-self: center;
  width: 100%;
  max-width: 158px;
  min-width: var(--battlepass-card-width);
  min-height: 204px;
  padding: 18px 13px 15px;
  border: 1px solid var(--rank-line);
  border-radius: 10px;
  color: var(--text);
  text-align: center;
  background:
    radial-gradient(circle at 50% 39%, var(--rank-glow), transparent 62%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.035), transparent 58%),
    rgba(2, 8, 10, 0.83);
  cursor: pointer;
  scroll-snap-align: center;
  transition:
    border-color 210ms ease,
    box-shadow 210ms ease,
    opacity 210ms ease,
    transform 210ms ease;
}

.lp-club-battlepass-reward::before {
  content: attr(data-status);
  position: absolute;
  top: 9px;
  left: 9px;
  min-width: 48px;
  padding: 5px 8px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  color: var(--rank);
  background: rgba(0, 0, 0, 0.36);
  font-size: 9px;
  font-weight: 860;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.lp-club-battlepass-reward[data-rank="rare"] {
  --rank: var(--cyan);
  --rank-line: rgba(131, 228, 236, 0.42);
  --rank-glow: rgba(131, 228, 236, 0.18);
}

.lp-club-battlepass-reward[data-rank="epic"] {
  --rank: #9a80ff;
  --rank-line: rgba(154, 128, 255, 0.46);
  --rank-glow: rgba(154, 128, 255, 0.2);
}

.lp-club-battlepass-reward[data-rank="legendary"] {
  --rank: var(--amber);
  --rank-line: rgba(208, 170, 108, 0.52);
  --rank-glow: rgba(208, 170, 108, 0.22);
}

.lp-club-battlepass-reward:hover,
.lp-club-battlepass-reward:focus-visible,
.lp-club-battlepass-reward.is-active {
  border-color: var(--rank);
  box-shadow:
    0 20px 58px rgba(0, 0, 0, 0.36),
    0 0 34px var(--rank-glow),
    inset 0 0 0 1px rgba(255, 255, 255, 0.04);
  outline: none;
  transform: translateY(-6px);
}

.lp-club-battlepass-reward.is-active::after {
  content: "";
  position: absolute;
  inset: -1px;
  border: 1px solid var(--rank);
  border-radius: inherit;
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.08),
    0 0 32px var(--rank-glow);
  pointer-events: none;
  animation: battlePassActivePulse 2.2s ease-in-out infinite;
}

.lp-club-battlepass-reward.is-locked {
  opacity: 0.62;
}

.lp-club-battlepass-reward.is-ready::before {
  color: #031114;
  background: linear-gradient(90deg, var(--cyan), var(--teal));
}

.lp-club-battlepass-reward-media {
  align-self: center;
  justify-self: center;
  display: grid;
  place-items: center;
  width: 104px;
  height: 88px;
  margin-top: 22px;
  color: var(--rank);
  filter: drop-shadow(0 0 18px var(--rank-glow));
}

.lp-club-battlepass-reward-media img {
  width: 112px;
  height: 84px;
  object-fit: contain;
  filter:
    drop-shadow(0 16px 20px rgba(0, 0, 0, 0.54))
    drop-shadow(0 0 20px var(--rank-glow));
}

.lp-club-battlepass-reward.is-active .lp-club-battlepass-reward-media img {
  animation: battlePassCaseCardFloat 3.2s ease-in-out infinite;
}

.lp-club-battlepass-token {
  display: grid;
  place-items: center;
  width: 74px;
  height: 74px;
  overflow: hidden;
  padding: 8px;
  border: 1px solid var(--rank-line);
  border-radius: 50%;
  color: var(--rank);
  text-align: center;
  background:
    radial-gradient(circle, var(--rank-glow), transparent 68%),
    rgba(0, 0, 0, 0.28);
  font-size: 18px;
  font-weight: 900;
  line-height: 1;
}

.lp-club-battlepass-token > span {
  max-width: 100%;
  overflow-wrap: anywhere;
}

.lp-club-battlepass-token[data-density="long"] {
  padding: 10px;
  font-size: 7.5px;
  font-weight: 720;
  line-height: 1.06;
  letter-spacing: 0;
}

.lp-club-battlepass-token[data-density="medium"] {
  padding: 9px;
  font-size: 10.5px;
  font-weight: 820;
  line-height: 1.06;
  letter-spacing: 0;
}

.lp-club-battlepass-token[data-density="medium"] > span,
.lp-club-battlepass-token[data-density="long"] > span {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
}

.lp-club-battlepass-token[data-density="medium"] > span {
  -webkit-line-clamp: 4;
}

.lp-club-battlepass-token[data-density="long"] > span {
  -webkit-line-clamp: 5;
}

.lp-club-battlepass-token[data-type="discount"] {
  font-size: 15px;
}

.lp-club-battlepass-reward-copy {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.lp-club-battlepass-reward-copy strong {
  display: -webkit-box;
  overflow: hidden;
  color: var(--text);
  font-size: 9.5px;
  font-weight: 720;
  line-height: 1.12;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.lp-club-battlepass-reward-copy small {
  display: -webkit-box;
  overflow: hidden;
  color: var(--quiet);
  font-size: 7.5px;
  font-weight: 680;
  line-height: 1.22;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.lp-club-battlepass-progress {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) auto;
  align-items: center;
  gap: 18px;
  width: 100%;
  min-width: min(100%, 420px);
  margin-top: 22px;
}

.lp-club-battlepass-meter {
  position: relative;
  overflow: hidden;
  height: 11px;
  border: 1px solid rgba(196, 224, 225, 0.12);
  border-radius: 999px;
  background: rgba(196, 224, 225, 0.055);
}

.lp-club-battlepass-meter i {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--cyan), var(--teal), var(--amber));
  box-shadow: 0 0 22px rgba(131, 228, 236, 0.4);
}

.lp-club-battlepass-progress-copy {
  display: grid;
  justify-items: end;
  gap: 3px;
  min-width: 150px;
  max-width: min(360px, 42vw);
  color: var(--cyan);
  text-align: right;
}

.lp-club-battlepass-progress-copy strong {
  font-size: 14px;
  font-weight: 860;
  letter-spacing: 0.1em;
}

.lp-club-battlepass-progress-copy small {
  display: -webkit-box;
  overflow: hidden;
  color: var(--muted);
  font-size: 10px;
  font-weight: 760;
  line-height: 1.18;
  letter-spacing: 0;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

@keyframes battlePassCaseHover {
  0%,
  100% {
    transform: translateY(0) rotate(-1deg);
  }

  50% {
    transform: translateY(-7px) rotate(1deg);
  }
}

@keyframes battlePassCaseCardFloat {
  0%,
  100% {
    transform: translateY(0) scale(1);
  }

  50% {
    transform: translateY(-5px) scale(1.03);
  }
}

@keyframes battlePassActivePulse {
  0%,
  100% {
    opacity: 0.68;
  }

  50% {
    opacity: 1;
  }
}
.lp-club-profile-panel {
  align-self: start;
  min-height: 100%;
}

.lp-club-profile-logo {
  display: grid;
  min-height: 92px;
  grid-template-columns: 58px minmax(0, 1fr);
  align-items: center;
  gap: 13px;
  padding-bottom: 18px;
  border-bottom: 1px solid rgba(196, 224, 225, 0.12);
}

.lp-club-profile-copy {
  min-width: 0;
}

.lp-club-avatar {
  position: relative;
  display: grid;
  place-items: center;
  width: 58px;
  height: 58px;
  border: 1px solid rgba(131, 228, 236, 0.4);
  border-radius: 50%;
  color: var(--cyan);
  background: rgba(131, 228, 236, 0.06);
}

.lp-club-avatar.is-custom-logo {
  overflow: visible;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
}

.lp-club-avatar.is-custom-logo img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: center;
}

.lp-club-profile-logo strong {
  display: block;
  color: var(--text);
  font-size: 15px;
  line-height: 1.18;
}

.lp-club-nickname-button {
  display: block;
  width: 100%;
  min-width: 0;
  padding: 0;
  border: 0;
  color: inherit;
  text-align: left;
  background: transparent;
  cursor: pointer;
}

.lp-club-nickname-button:focus-visible {
  outline: 2px solid rgba(131, 228, 236, 0.8);
  outline-offset: 5px;
  border-radius: 6px;
}

.lp-club-profile-logo span span {
  display: block;
  margin-top: 7px;
  color: var(--quiet);
  font-size: 10px;
  font-weight: 820;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  overflow-wrap: anywhere;
}

.lp-club-profile-logo .lp-club-nickname-title {
  display: inline-flex;
  max-width: 100%;
  align-items: center;
  gap: 7px;
  vertical-align: top;
}

.lp-club-nickname-title span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lp-club-nickname-title svg {
  width: 13px;
  height: 13px;
  flex: 0 0 auto;
  color: var(--cyan);
  filter: drop-shadow(0 0 8px rgba(131, 228, 236, 0.34));
}

.lp-club-nickname-button .lp-club-profile-contact,
.lp-club-nickname-editor .lp-club-profile-contact {
  display: block;
  margin-top: 6px;
  color: rgba(168, 185, 186, 0.88);
  font-size: 11px;
  font-weight: 760;
  letter-spacing: 0.06em;
  text-transform: none;
}

.lp-club-nickname-editor {
  display: block;
  min-width: 0;
}

.lp-club-nickname-editor input {
  display: block;
  width: 100%;
  min-width: 0;
  margin-top: 7px;
  padding: 9px 10px;
  border: 1px solid rgba(131, 228, 236, 0.42);
  border-radius: 7px;
  color: var(--text);
  font-size: 13px;
  font-weight: 760;
  line-height: 1.2;
  background: rgba(0, 8, 12, 0.72);
  box-shadow: 0 0 0 3px rgba(131, 228, 236, 0.08);
}

.lp-club-nickname-editor input:focus {
  outline: none;
  border-color: rgba(131, 228, 236, 0.82);
}

.lp-club-nickname-editor input:disabled {
  opacity: 0.7;
}

.lp-club-profile-section {
  padding: 17px 0;
  border-bottom: 1px solid rgba(196, 224, 225, 0.12);
}

.lp-club-profile-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.lp-club-profile-row strong {
  color: var(--text);
  font-size: 20px;
  line-height: 1;
}

.lp-club-progress {
  height: 10px;
  overflow: hidden;
  border: 1px solid rgba(196, 224, 225, 0.16);
  border-radius: 999px;
  background: rgba(0, 6, 9, 0.72);
}

.lp-club-progress span {
  display: block;
  width: var(--value);
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--cyan), var(--teal));
  box-shadow: 0 0 20px rgba(131, 228, 236, 0.34);
}

.lp-club-level-meta {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 7px 12px;
  margin-top: 9px;
  color: var(--quiet);
  font-size: 9px;
  font-weight: 820;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.lp-club-checkin-card {
  display: grid;
  gap: 8px;
  padding: 16px 0 18px;
  border-bottom: 1px solid rgba(196, 224, 225, 0.12);
}

.lp-club-checkin-card strong {
  color: var(--text);
  font-size: 15px;
  line-height: 1.2;
}

.lp-club-checkin-card p {
  margin: 0;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.4;
}

.lp-club-checkin-card button {
  display: inline-flex;
  min-height: 38px;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(131, 228, 236, 0.4);
  border-radius: 7px;
  color: #001012;
  cursor: pointer;
  font-size: 11px;
  font-weight: 860;
  letter-spacing: 0.08em;
  text-align: center;
  text-transform: uppercase;
  background: linear-gradient(135deg, #83e4ec, #94d6b8);
  transition:
    opacity 180ms ease,
    transform 180ms ease;
}

.lp-club-checkin-card button:hover:not(:disabled) {
  transform: translateY(-1px);
}

.lp-club-checkin-card button:disabled {
  cursor: wait;
  opacity: 0.62;
}

.lp-club-promo {
  display: grid;
  gap: 10px;
  padding-top: 17px;
}

.lp-club-promo input {
  width: 100%;
  height: 46px;
  min-width: 0;
  padding: 0 12px;
  border: 1px solid rgba(196, 224, 225, 0.16);
  border-radius: 7px;
  outline: 0;
  color: var(--text);
  background: rgba(0, 6, 9, 0.68);
  font-size: 13px;
}

.lp-club-promo input:focus {
  border-color: rgba(131, 228, 236, 0.58);
  box-shadow: 0 0 0 3px rgba(131, 228, 236, 0.08);
}

.lp-club-promo button,
.lp-club-primary-link,
.lp-club-ghost-link {
  display: inline-flex;
  min-height: 42px;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  font-size: 12px;
  font-weight: 860;
  letter-spacing: 0.08em;
  text-align: center;
  text-decoration: none;
  text-transform: uppercase;
  transition:
    border-color 180ms ease,
    background 180ms ease,
    color 180ms ease,
    transform 180ms ease;
}

.lp-club-promo button,
.lp-club-primary-link {
  border: 1px solid rgba(131, 228, 236, 0.4);
  color: #001012;
  background: linear-gradient(135deg, #83e4ec, #94d6b8);
}

.lp-club-promo button:hover,
.lp-club-primary-link:hover {
  transform: translateY(-1px);
}

.lp-club-side-link,
.lp-club-ghost-link {
  color: var(--cyan);
  border: 1px solid rgba(131, 228, 236, 0.22);
  background: rgba(196, 224, 225, 0.035);
}

.lp-club-side-link {
  display: inline-flex;
  min-height: 38px;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  font-size: 12px;
  font-weight: 800;
  text-decoration: none;
}

.lp-club-quest-widget {
  margin-top: 18px;
  padding-top: 17px;
  border-top: 1px solid rgba(196, 224, 225, 0.12);
}

.lp-club-quest-widget-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.lp-club-quest-widget-head strong {
  display: block;
  margin-top: 6px;
  color: var(--text);
  font-size: 14px;
}

.lp-club-quest-count {
  border-radius: 999px;
  padding: 6px 8px;
  color: var(--cyan);
  background: rgba(131, 228, 236, 0.08);
  font-size: 10px;
  font-weight: 860;
}

.lp-club-side-quest-list {
  display: grid;
  gap: 10px;
  margin-top: 14px;
}

.lp-club-side-quest {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 58px;
  padding: 10px;
  border: 1px solid rgba(196, 224, 225, 0.14);
  border-radius: 7px;
  color: inherit;
  cursor: pointer;
  font: inherit;
  text-align: left;
  text-decoration: none;
  background: rgba(2, 8, 11, 0.48);
  transition:
    border-color 180ms ease,
    background 180ms ease,
    transform 180ms ease;
}

.lp-club-side-quest:hover,
.lp-club-side-quest.is-current,
.lp-club-side-quest.is-selected {
  border-color: rgba(131, 228, 236, 0.58);
  background:
    linear-gradient(90deg, rgba(131, 228, 236, 0.1), transparent),
    rgba(8, 18, 22, 0.82);
  transform: translateY(-1px);
}

.lp-club-side-quest.is-done {
  border-color: rgba(148, 214, 184, 0.42);
  background: rgba(23, 48, 40, 0.3);
}

.lp-club-side-quest-icon {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border: 1px solid rgba(131, 228, 236, 0.26);
  border-radius: 7px;
  color: var(--cyan);
  background: rgba(196, 224, 225, 0.045);
}

.lp-club-side-quest-copy {
  display: block;
  min-width: 0;
}

.lp-club-side-quest strong {
  display: block;
  overflow: hidden;
  color: var(--text);
  font-size: 13px;
  line-height: 1.15;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lp-club-side-quest-copy > span {
  display: block;
  margin-top: 5px;
  overflow: hidden;
  color: var(--muted);
  font-size: 10px;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lp-club-side-quest-progress {
  position: relative;
  height: 4px;
  border-radius: 999px;
  background: rgba(196, 224, 225, 0.08);
}

.lp-club-side-quest-progress i {
  display: block;
  width: var(--value);
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--cyan), var(--teal));
  box-shadow: 0 0 14px rgba(131, 228, 236, 0.4);
}

.lp-club-side-quest-state {
  color: var(--quiet);
  font-size: 9px;
  font-weight: 860;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.lp-club-side-quest.is-expanded {
  align-items: start;
}

.lp-club-side-quest-details {
  display: grid;
  grid-column: 2 / -1;
  gap: 8px;
  margin-top: 2px;
  padding-top: 10px;
  border-top: 1px solid rgba(196, 224, 225, 0.1);
  color: var(--muted);
  font-size: 11px;
  line-height: 1.4;
  white-space: normal;
}

.lp-club-side-quest-details > span {
  display: block;
  white-space: normal;
}

.lp-club-side-quest-detail-progress {
  display: grid;
  gap: 5px;
}

.lp-club-side-quest-detail-progress .lp-club-side-quest-progress {
  margin-top: 0;
}

.lp-club-side-quest.is-current .lp-club-side-quest-state,
.lp-club-side-quest.is-done .lp-club-side-quest-state {
  color: var(--cyan);
}

.lp-club-quest-widget-actions {
  display: grid;
  justify-items: end;
  gap: 8px;
}

.lp-club-quest-open-button,
.lp-club-quest-board-close {
  display: inline-flex;
  min-height: 34px;
  align-items: center;
  justify-content: center;
  padding: 0 10px;
  border: 1px solid rgba(196, 224, 225, 0.16);
  border-radius: 7px;
  color: var(--cyan);
  cursor: pointer;
  font-size: 9px;
  font-weight: 860;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  background: rgba(196, 224, 225, 0.04);
  transition:
    border-color 180ms ease,
    background 180ms ease,
    transform 180ms ease;
}

.lp-club-quest-open-button:hover,
.lp-club-quest-open-button:focus-visible,
.lp-club-quest-board-close:hover,
.lp-club-quest-board-close:focus-visible {
  border-color: rgba(131, 228, 236, 0.58);
  background: rgba(131, 228, 236, 0.08);
  outline: none;
  transform: translateY(-1px);
}

.lp-club-quest-empty,
.lp-club-quest-group-empty {
  margin: 0;
  padding: 12px;
  border: 1px dashed rgba(196, 224, 225, 0.14);
  border-radius: 7px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.45;
  background: rgba(2, 8, 11, 0.36);
}

.lp-club-quest-board {
  position: absolute;
  top: var(--quest-board-top, 298px);
  right: var(--quest-board-right, 300px);
  bottom: var(--quest-board-bottom, 32px);
  left: var(--quest-board-left, 18px);
  z-index: 8;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 18px;
  min-height: 0;
  padding: 20px;
  border: 1px solid rgba(131, 228, 236, 0.32);
  border-radius: var(--radius);
  opacity: 0;
  pointer-events: none;
  clip-path: inset(0 0 0 100% round 8px);
  transform-origin: right center;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.055), transparent 28%),
    rgba(5, 12, 15, 0.96);
  box-shadow:
    0 34px 110px rgba(0, 0, 0, 0.66),
    inset 0 0 0 1px rgba(131, 228, 236, 0.06);
  transition:
    opacity 260ms ease,
    clip-path 360ms cubic-bezier(0.2, 0.9, 0.2, 1);
}

.lp-club-quest-board::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(90deg, transparent 0 49.8%, rgba(131, 228, 236, 0.08) 49.8% 50%, transparent 50%),
    linear-gradient(rgba(196, 224, 225, 0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(196, 224, 225, 0.035) 1px, transparent 1px);
  background-size: auto, 82px 82px, 82px 82px;
  mask-image: radial-gradient(circle at 70% 48%, #000, transparent 82%);
}

.lp-club-quest-board.is-open {
  opacity: 1;
  pointer-events: auto;
  clip-path: inset(0 0 0 0 round 8px);
}

.lp-club-shell.is-quests-expanded .lp-club-lootboxes,
.lp-club-shell.is-quests-expanded .lp-club-battlepass {
  opacity: 0.18;
  filter: blur(1.5px);
  pointer-events: none;
}

.lp-club-quest-board-head {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 18px;
  padding-bottom: 14px;
  border-bottom: 1px solid rgba(196, 224, 225, 0.12);
}

.lp-club-quest-board-head h2 {
  margin-top: 7px;
  color: var(--text);
  font-size: clamp(28px, 3vw, 42px);
  line-height: 0.98;
  font-weight: 760;
}

.lp-club-quest-board-head p {
  max-width: 560px;
  margin-top: 9px;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.5;
}

.lp-club-quest-board-list {
  position: relative;
  z-index: 1;
  display: grid;
  align-content: start;
  gap: 16px;
  min-height: 0;
  overflow: auto;
  padding-right: 8px;
  scrollbar-color: rgba(131, 228, 236, 0.58) rgba(196, 224, 225, 0.08);
  scrollbar-gutter: stable;
  scrollbar-width: thin;
}

.lp-club-quest-board-list::-webkit-scrollbar {
  width: 10px;
}

.lp-club-quest-board-list::-webkit-scrollbar-track {
  border: 1px solid rgba(196, 224, 225, 0.08);
  border-radius: 999px;
  background: rgba(196, 224, 225, 0.055);
}

.lp-club-quest-board-list::-webkit-scrollbar-thumb {
  border: 2px solid rgba(5, 12, 15, 0.96);
  border-radius: 999px;
  background:
    linear-gradient(180deg, rgba(131, 228, 236, 0.98), rgba(84, 191, 198, 0.58));
  box-shadow: 0 0 18px rgba(131, 228, 236, 0.34);
}

.lp-club-quest-group {
  display: grid;
  gap: 8px;
}

.lp-club-quest-group-head {
  display: flex;
  min-height: 28px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.lp-club-quest-group-head strong {
  color: var(--text);
  font-size: 13px;
  font-weight: 820;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.lp-club-quest-group-head span {
  color: var(--quiet);
  font-size: 9px;
  font-weight: 860;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.lp-club-quest-full-card {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  min-height: 68px;
  padding: 10px 12px;
  border: 1px solid rgba(196, 224, 225, 0.14);
  border-radius: 7px;
  color: inherit;
  cursor: pointer;
  font: inherit;
  text-align: left;
  background: rgba(2, 8, 11, 0.58);
  transition:
    border-color 180ms ease,
    background 180ms ease,
    transform 180ms ease;
}

.lp-club-quest-full-card:hover,
.lp-club-quest-full-card.is-current,
.lp-club-quest-full-card.is-selected {
  border-color: rgba(131, 228, 236, 0.6);
  background:
    linear-gradient(90deg, rgba(131, 228, 236, 0.1), transparent),
    rgba(8, 18, 22, 0.86);
  transform: translateY(-1px);
}

.lp-club-quest-full-card.is-done {
  border-color: rgba(148, 214, 184, 0.46);
  background: rgba(23, 48, 40, 0.3);
}

.lp-club-quest-full-icon {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border: 1px solid rgba(131, 228, 236, 0.28);
  border-radius: 7px;
  color: var(--cyan);
  background: rgba(196, 224, 225, 0.045);
}

.lp-club-quest-full-main {
  min-width: 0;
}

.lp-club-quest-full-main strong {
  display: block;
  color: var(--text);
  font-size: 13px;
  line-height: 1.15;
}

.lp-club-quest-full-main > span {
  display: block;
  margin-top: 4px;
  color: var(--muted);
  font-size: 10px;
  line-height: 1.35;
}

.lp-club-quest-progress {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  margin-top: 7px;
}

.lp-club-quest-progress-bar {
  display: block;
  width: 100%;
  height: 6px;
  overflow: hidden;
  border: 1px solid rgba(196, 224, 225, 0.14);
  border-radius: 999px;
  background: rgba(0, 6, 9, 0.72);
}

.lp-club-quest-progress-bar i {
  display: block;
  width: var(--value);
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--cyan), var(--teal));
  box-shadow: 0 0 18px rgba(131, 228, 236, 0.38);
}

.lp-club-quest-progress > span:not(.lp-club-quest-progress-bar),
.lp-club-quest-full-state {
  color: var(--quiet);
  font-size: 9px;
  font-weight: 860;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  white-space: nowrap;
}

.lp-club-quest-full-state {
  color: var(--cyan);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.lp-reward-standalone-page {
  min-height: 100vh;
}

.lp-reward-standalone-shell {
  width: min(1480px, 100%);
  min-height: 100vh;
  margin: 0 auto;
  padding: clamp(18px, 3.4vw, 46px);
}

.lp-reward-journal {
  display: grid;
  gap: 16px;
  min-width: 0;
  padding: clamp(18px, 2.4vw, 28px);
  overflow: hidden;
  background:
    linear-gradient(135deg, rgba(131, 228, 236, 0.055), transparent 30%),
    linear-gradient(180deg, rgba(8, 14, 18, 0.96), rgba(2, 7, 9, 0.96));
}

.lp-reward-journal.is-standalone {
  min-height: calc(100vh - clamp(36px, 6.8vw, 92px));
}

.lp-reward-journal::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.58;
  background:
    linear-gradient(rgba(196, 224, 225, 0.024) 1px, transparent 1px),
    linear-gradient(90deg, rgba(196, 224, 225, 0.02) 1px, transparent 1px);
  background-size: 76px 76px;
  mask-image: radial-gradient(circle at 52% 48%, #000, transparent 84%);
}

.lp-reward-journal > * {
  position: relative;
  z-index: 1;
}

.lp-reward-journal-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 18px;
  align-items: start;
  padding-bottom: 14px;
  border-bottom: 1px solid rgba(196, 224, 225, 0.1);
}

.lp-reward-journal-head h2 {
  margin-top: 12px;
  color: var(--text);
  font-size: clamp(26px, 3.6vw, 52px);
  line-height: 0.98;
  font-weight: 780;
}

.lp-reward-journal-head p {
  max-width: 740px;
  margin-top: 12px;
  color: #c2d0d1;
  font-size: 14px;
  line-height: 1.55;
}

.lp-reward-journal-side {
  display: grid;
  gap: 10px;
  justify-items: end;
  min-width: 178px;
}

.lp-reward-sync-pill {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  min-height: 38px;
  padding: 0 13px;
  border: 1px solid rgba(196, 224, 225, 0.18);
  border-radius: 8px;
  background: rgba(7, 12, 16, 0.56);
  color: var(--muted);
  font-size: 10px;
  font-weight: 820;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.lp-reward-sync-pill::before {
  content: "";
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--cyan);
  box-shadow: 0 0 16px rgba(131, 228, 236, 0.64);
}

.lp-reward-scope-row {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) minmax(178px, auto);
  gap: 12px;
  align-items: stretch;
}

.lp-reward-scope-field,
.lp-reward-total-card,
.lp-reward-counter-panel,
.lp-reward-collection,
.lp-reward-command,
.lp-reward-list-panel,
.lp-reward-balance-card {
  border: 1px solid rgba(196, 224, 225, 0.1);
  border-radius: 8px;
  background:
    linear-gradient(135deg, rgba(131, 228, 236, 0.045), transparent 34%),
    rgba(2, 8, 11, 0.28);
}

.lp-reward-scope-field {
  display: grid;
  gap: 8px;
  padding: 12px;
}

.lp-reward-scope-field select,
.lp-reward-search input {
  width: 100%;
  min-height: 42px;
  border: 1px solid rgba(196, 224, 225, 0.14);
  border-radius: 7px;
  color: var(--text);
  background:
    linear-gradient(90deg, rgba(131, 228, 236, 0.08), transparent 64%),
    rgba(0, 0, 0, 0.24);
  outline: none;
}

.lp-reward-scope-field select {
  padding: 0 12px;
  font-size: 11px;
  font-weight: 820;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.lp-reward-scope-field option {
  color: var(--text);
  background: #071014;
}

.lp-reward-search input {
  padding: 0 12px;
}

.lp-reward-scope-field select:focus,
.lp-reward-search input:focus {
  border-color: rgba(131, 228, 236, 0.56);
  box-shadow: 0 0 0 3px rgba(131, 228, 236, 0.08);
}

.lp-reward-total-card {
  display: grid;
  align-content: center;
  gap: 8px;
  min-width: 190px;
  padding: 14px;
}

.lp-reward-total-card strong {
  color: var(--cyan);
  font-size: 30px;
  line-height: 1;
}

.lp-reward-total-card span {
  color: var(--quiet);
  font-size: 9px;
  font-weight: 820;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.lp-reward-counter-band {
  display: grid;
  grid-template-columns: minmax(260px, 0.9fr) minmax(280px, 1.1fr);
  gap: 14px;
}

.lp-reward-counter-panel {
  min-width: 0;
  overflow: hidden;
}

.lp-reward-counter-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 40px;
  padding: 0 14px;
}

.lp-reward-counter-title strong {
  color: var(--text);
  font-size: 12px;
  font-weight: 820;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.lp-reward-counter-title span {
  color: var(--quiet);
  font-size: 9px;
  font-weight: 820;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.lp-reward-counter-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  padding: 0 12px 12px;
}

.lp-reward-counter-cell {
  --tone: 131 228 236;
  --share: 0%;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  grid-template-areas:
    "dot label value"
    "percent meter meter";
  align-items: center;
  gap: 8px 9px;
  min-height: 72px;
  padding: 11px 12px 10px;
  border: 1px solid rgba(196, 224, 225, 0.08);
  border-radius: 8px;
  color: inherit;
  text-align: left;
  background:
    radial-gradient(circle at 14% 20%, rgb(var(--tone) / 0.12), transparent 42%),
    rgba(196, 224, 225, 0.025);
  cursor: pointer;
  transition:
    border-color 180ms ease,
    background 180ms ease,
    transform 180ms ease;
}

.lp-reward-counter-cell:hover,
.lp-reward-counter-cell:focus-visible,
.lp-reward-counter-cell.is-active {
  border-color: rgb(var(--tone) / 0.58);
  background:
    radial-gradient(circle at 14% 20%, rgb(var(--tone) / 0.18), transparent 44%),
    rgba(196, 224, 225, 0.045);
  outline: none;
  transform: translateY(-1px);
}

.lp-reward-counter-dot {
  grid-area: dot;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgb(var(--tone));
  box-shadow: 0 0 16px rgb(var(--tone) / 0.54);
}

.lp-reward-counter-cell span {
  grid-area: label;
  overflow: hidden;
  color: var(--muted);
  font-size: 11px;
  font-weight: 720;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lp-reward-counter-cell strong {
  grid-area: value;
  color: rgb(var(--tone));
  font-size: 21px;
  line-height: 1;
  text-align: right;
}

.lp-reward-counter-cell em {
  grid-area: percent;
  color: var(--quiet);
  font-size: 9px;
  font-style: normal;
  font-weight: 820;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.lp-reward-counter-cell b {
  grid-area: meter;
  display: block;
  height: 4px;
  border-radius: 999px;
  background: rgba(196, 224, 225, 0.08);
  overflow: hidden;
}

.lp-reward-counter-cell b span {
  display: block;
  width: var(--share);
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, rgb(var(--tone) / 0.92), rgb(var(--tone) / 0.28));
  box-shadow: 0 0 14px rgb(var(--tone) / 0.26);
}

.lp-reward-collection {
  display: grid;
  gap: 12px;
  padding: 14px;
}

.lp-reward-collection-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(150px, 240px);
  gap: 14px;
  align-items: end;
}

.lp-reward-collection-head h3 {
  margin-top: 4px;
  color: var(--text);
  font-size: 18px;
  line-height: 1.2;
}

.lp-reward-collection-progress {
  height: 8px;
  border-radius: 999px;
  background: rgba(196, 224, 225, 0.08);
  overflow: hidden;
}

.lp-reward-collection-progress span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--cyan), var(--amber));
  box-shadow: 0 0 18px rgba(131, 228, 236, 0.2);
}

.lp-reward-collection-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.lp-reward-collection-card,
.lp-reward-achievement-card {
  --rarity: var(--cyan);
  --rarity-soft: rgba(131, 228, 236, 0.1);
  border: 1px solid rgba(196, 224, 225, 0.1);
  border-radius: 8px;
  background:
    radial-gradient(circle at 8% 16%, var(--rarity-soft), transparent 42%),
    rgba(196, 224, 225, 0.026);
}

.lp-reward-collection-card.rarity-common,
.lp-reward-achievement-card.rarity-common {
  --rarity: #9eb5b7;
  --rarity-soft: rgba(158, 181, 183, 0.1);
}

.lp-reward-collection-card.rarity-rare,
.lp-reward-achievement-card.rarity-rare {
  --rarity: var(--cyan);
  --rarity-soft: rgba(131, 228, 236, 0.12);
}

.lp-reward-collection-card.rarity-epic,
.lp-reward-achievement-card.rarity-epic {
  --rarity: #afa4ff;
  --rarity-soft: rgba(175, 164, 255, 0.13);
}

.lp-reward-collection-card.rarity-legendary,
.lp-reward-achievement-card.rarity-legendary {
  --rarity: var(--amber);
  --rarity-soft: rgba(208, 170, 108, 0.14);
}

.lp-reward-collection-card {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  min-height: 86px;
  padding: 10px;
}

.lp-reward-collection-icon,
.lp-reward-achievement-icon {
  display: inline-grid;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--rarity) 46%, transparent);
  border-radius: 8px;
  color: var(--rarity);
  background: color-mix(in srgb, var(--rarity) 10%, transparent);
}

.lp-reward-collection-icon {
  width: 36px;
  height: 36px;
}

.lp-reward-collection-card small,
.lp-reward-achievement-main small {
  display: block;
  overflow: hidden;
  color: var(--quiet);
  font-size: 9px;
  font-weight: 820;
  letter-spacing: 0.1em;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}

.lp-reward-collection-card strong,
.lp-reward-achievement-main strong {
  display: block;
  overflow-wrap: anywhere;
  color: var(--text);
  line-height: 1.2;
}

.lp-reward-collection-card strong {
  margin-top: 4px;
  font-size: 13px;
}

.lp-reward-collection-card span,
.lp-reward-achievement-main span {
  display: block;
  margin-top: 4px;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.35;
}

.lp-reward-collection-card em {
  align-self: start;
  border-radius: 999px;
  padding: 5px 8px;
  color: var(--rarity);
  font-size: 9px;
  font-style: normal;
  font-weight: 860;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  background: color-mix(in srgb, var(--rarity) 12%, transparent);
}

.lp-reward-command {
  display: grid;
  grid-template-columns: auto minmax(180px, 1fr) auto auto;
  gap: 10px;
  align-items: center;
  padding: 10px 12px;
}

.lp-reward-group-switch {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 6px;
}

.lp-reward-group-switch button,
.lp-reward-reset {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid rgba(196, 224, 225, 0.12);
  border-radius: 7px;
  color: var(--muted);
  font-size: 10px;
  font-weight: 820;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  background: rgba(196, 224, 225, 0.025);
  cursor: pointer;
  transition:
    border-color 180ms ease,
    background 180ms ease,
    color 180ms ease;
}

.lp-reward-group-switch button:hover,
.lp-reward-group-switch button:focus-visible,
.lp-reward-group-switch button.is-active,
.lp-reward-reset:hover,
.lp-reward-reset:focus-visible {
  border-color: rgba(131, 228, 236, 0.5);
  color: var(--text);
  background: rgba(131, 228, 236, 0.07);
  outline: none;
}

.lp-reward-active-filter {
  justify-self: end;
  color: var(--cyan);
  font-size: 10px;
  font-weight: 820;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  white-space: nowrap;
}

.lp-reward-list-panel {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-height: 0;
  overflow: hidden;
}

.lp-reward-list-toolbar,
.lp-reward-group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.lp-reward-list-toolbar {
  min-height: 52px;
  padding: 0 14px;
  border-bottom: 1px solid rgba(196, 224, 225, 0.08);
}

.lp-reward-list-toolbar strong,
.lp-reward-group-head h3 {
  color: var(--text);
  font-size: 12px;
  font-weight: 820;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.lp-reward-list-toolbar span,
.lp-reward-group-head span {
  color: var(--cyan);
  font-size: 10px;
  font-weight: 820;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.lp-reward-list {
  display: grid;
  gap: 12px;
  max-height: min(680px, 68vh);
  padding: 14px;
  overflow: auto;
  scrollbar-color: rgba(131, 228, 236, 0.62) rgba(196, 224, 225, 0.08);
  scrollbar-gutter: stable;
  scrollbar-width: thin;
}

.lp-reward-list::-webkit-scrollbar {
  width: 10px;
}

.lp-reward-list::-webkit-scrollbar-track {
  background: rgba(196, 224, 225, 0.06);
}

.lp-reward-list::-webkit-scrollbar-thumb {
  border: 2px solid rgba(2, 8, 11, 0.96);
  border-radius: 999px;
  background: rgba(131, 228, 236, 0.62);
}

.lp-reward-group {
  display: grid;
  gap: 8px;
}

.lp-reward-achievement-card {
  display: grid;
  grid-template-columns: 46px minmax(0, 1fr) auto;
  gap: 13px;
  align-items: center;
  min-height: 104px;
  padding: 12px;
}

.lp-reward-achievement-icon {
  width: 46px;
  height: 46px;
}

.lp-reward-achievement-main strong {
  margin-top: 5px;
  font-size: 16px;
}

.lp-reward-achievement-meta {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 7px;
  max-width: 260px;
}

.lp-reward-value,
.lp-reward-rarity-chip,
.lp-reward-collection-mark,
.lp-reward-date {
  display: inline-flex;
  align-items: center;
  min-height: 26px;
  border-radius: 999px;
  padding: 0 9px;
  font-size: 10px;
  font-weight: 860;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.lp-reward-value {
  color: var(--text);
  background: rgba(255, 255, 255, 0.08);
}

.lp-reward-rarity-chip {
  color: var(--rarity);
  background: color-mix(in srgb, var(--rarity) 13%, transparent);
}

.lp-reward-collection-mark.new {
  color: #06100d;
  background: var(--good);
}

.lp-reward-collection-mark.repeat {
  color: var(--muted);
  background: rgba(255, 255, 255, 0.08);
}

.lp-reward-date {
  height: auto;
  min-height: 32px;
  color: var(--quiet);
  text-align: right;
  line-height: 1.2;
  background: rgba(255, 255, 255, 0.04);
}

.lp-reward-empty-copy {
  padding: 14px;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.5;
}

.lp-reward-ledger-row {
  display: grid;
  grid-template-columns: minmax(220px, 0.42fr) minmax(0, 1fr);
  gap: 14px;
  align-items: start;
}

.lp-reward-balance-card {
  display: grid;
  gap: 8px;
  min-height: 126px;
  padding: 14px;
}

.lp-reward-balance-card strong {
  color: var(--text);
  font-size: 30px;
  line-height: 1;
}

.lp-reward-balance-card p {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.45;
}

@media (max-width: 1180px) {
  .lp-reward-counter-band,
  .lp-reward-ledger-row {
    grid-template-columns: 1fr;
  }

  .lp-reward-command {
    grid-template-columns: 1fr;
  }

  .lp-reward-active-filter {
    justify-self: start;
  }
}

@media (max-width: 760px) {
  .lp-reward-journal-head,
  .lp-reward-scope-row,
  .lp-reward-collection-head {
    grid-template-columns: 1fr;
  }

  .lp-reward-journal-side {
    justify-items: start;
  }

  .lp-reward-counter-grid,
  .lp-reward-collection-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .lp-reward-achievement-card {
    grid-template-columns: 40px minmax(0, 1fr);
  }

  .lp-reward-achievement-meta {
    grid-column: 1 / -1;
    justify-content: flex-start;
    max-width: none;
  }
}

@media (max-width: 520px) {
  .lp-reward-counter-grid,
  .lp-reward-collection-grid {
    grid-template-columns: 1fr;
  }

  .lp-reward-journal {
    padding: 16px;
  }
}

.lp-club-detail-stack {
  display: grid;
  gap: 18px;
  width: min(1480px, 100%);
  margin: 0 auto;
  padding: 4px clamp(18px, 3.4vw, 46px) 48px;
}

.lp-club-detail-head {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 16px;
  padding-top: 10px;
}

.lp-club-toast {
  position: fixed;
  left: 16px;
  right: 16px;
  bottom: 18px;
  z-index: 20;
  max-width: 420px;
  margin: 0 auto;
  padding: 13px 14px;
  border: 1px solid rgba(131, 228, 236, 0.28);
  border-radius: 7px;
  background: rgba(7, 13, 16, 0.94);
  color: #d7e5e6;
  box-shadow: var(--shadow);
  font-size: 13px;
  line-height: 1.45;
  opacity: 0;
  transform: translateY(12px);
  pointer-events: none;
  transition:
    opacity 180ms ease,
    transform 180ms ease;
  backdrop-filter: blur(18px);
}

.lp-club-toast.is-visible {
  opacity: 1;
  transform: translateY(0);
}

.lp-club-home-static {
  --panel: rgba(8, 14, 18, 0.9);
  --line: rgba(196, 224, 225, 0.18);
  --cyan: #83e4ec;
  --text: #edf7f8;
  --muted: #a8b9ba;
  --radius: 8px;
  --shadow: 0 30px 90px rgba(0, 0, 0, 0.48);
  position: relative;
  display: grid;
  min-height: 100vh;
  place-items: center;
  padding: 24px;
  isolation: isolate;
  background:
    radial-gradient(circle at 72% 8%, rgba(131, 228, 236, 0.08), transparent 28%),
    #000;
}

.lp-club-static-card {
  width: min(560px, 100%);
  padding: 26px;
}

.lp-club-static-title {
  margin-top: 12px;
  color: var(--text);
  font-size: clamp(28px, 6vw, 44px);
  line-height: 1;
  font-weight: 780;
}

.lp-club-static-copy {
  margin-top: 14px;
  color: var(--muted);
  font-size: 15px;
  line-height: 1.65;
}

.lp-club-static-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 22px;
}

.lp-club-skeleton {
  height: 12px;
  border-radius: 999px;
  background: rgba(196, 224, 225, 0.12);
}

.lp-club-skeleton + .lp-club-skeleton {
  margin-top: 12px;
}

.lp-club-skeleton-short {
  width: 120px;
}

.lp-club-skeleton-title {
  width: 68%;
  height: 42px;
  margin-top: 18px;
}

.lp-club-skeleton-mid {
  width: 76%;
}

.lp-club-static-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-top: 24px;
}

.lp-club-static-grid .lp-club-skeleton {
  height: 64px;
  margin-top: 0;
  border-radius: 8px;
}

@media (max-width: 1320px) {
  .lp-club-shell {
    grid-template-columns: minmax(0, 1fr) 260px;
    gap: 16px;
    padding-right: clamp(16px, 2vw, 28px);
    padding-left: clamp(16px, 2vw, 28px);
  }

  .lp-club-stage {
    display: block;
  }

  .lp-club-card {
    min-height: 230px;
    padding: 20px;
  }

  .lp-club-card h1 {
    margin-top: 28px;
    font-size: 54px;
    line-height: 0.94;
  }

  .lp-club-card p {
    margin-top: 16px;
    font-size: 14px;
    line-height: 1.55;
  }

  .lp-club-quick-metrics {
    gap: 10px;
    margin-top: 22px;
  }

  .lp-club-metric {
    min-width: 76px;
    padding: 10px;
  }

  .lp-club-banner-grid {
    gap: 14px;
  }

  .lp-club-banner {
    min-height: 340px;
  }

  .lp-club-banner-content {
    padding: 16px;
  }

  .lp-club-banner-title {
    margin-top: 15px;
  }

  .lp-club-banner-copy {
    font-size: 11px;
  }

  .lp-club-lootboxes,
  .lp-club-battlepass,
  .lp-club-profile-panel {
    padding: 16px;
  }
}

@media (max-width: 1180px) {
  .lp-club-shell {
    grid-template-columns: 1fr;
  }

  .lp-club-profile-panel {
    min-height: 0;
    display: grid;
    grid-template-columns: 1.1fr 1fr 1fr;
    gap: 16px;
  }

  .lp-club-profile-logo,
  .lp-club-profile-section,
  .lp-club-checkin-card {
    padding: 0;
    border-bottom: 0;
  }

  .lp-club-promo {
    padding-top: 0;
  }

  .lp-club-quest-widget {
    grid-column: span 2;
    margin-top: 0;
    padding-top: 0;
    border-top: 0;
  }
}

@media (max-width: 1100px) {
  .lp-club-banner-title {
    font-size: var(--banner-title-compact-size, 20px);
    line-height: var(--banner-title-compact-line-height, 1.08);
  }
}

@media (max-width: 920px) {
  .lp-club-topbar {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .lp-club-session-state {
    display: none;
  }

  .lp-club-stage,
  .lp-club-banner-grid,
  .lp-club-loot-grid,
  .lp-club-profile-panel {
    grid-template-columns: 1fr;
  }

  .lp-club-banner-grid {
    display: flex;
    gap: 12px;
    overflow-x: auto;
    padding-bottom: 6px;
    scroll-snap-type: x mandatory;
  }

  .lp-club-card {
    min-height: 0;
  }

  .lp-club-quick-metrics {
    margin-top: 22px;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .lp-club-banner {
    flex: 0 0 min(78vw, 300px);
    min-height: 360px;
    scroll-snap-align: start;
  }

  .lp-club-battlepass-head {
    display: grid;
  }

  .lp-club-battlepass-help {
    justify-self: start;
  }

  .lp-club-battlepass-top {
    grid-template-columns: 1fr;
  }

  .lp-club-battlepass-season,
  .lp-club-battlepass-main-reward {
    min-height: 0;
  }

  .lp-club-battlepass-main-reward {
    grid-template-columns: minmax(0, 0.88fr) minmax(190px, 1fr);
  }

  .lp-club-battle-track {
    display: grid;
    grid-template-columns: minmax(680px, 1fr) minmax(210px, 260px);
    align-items: stretch;
    overflow-x: auto;
    overflow-y: visible;
    padding-bottom: 8px;
    scroll-snap-type: none;
  }

  .lp-club-pass-map {
    min-width: 680px;
    min-height: 286px;
  }

  .lp-club-season-drop {
    min-width: 210px;
  }
  .lp-club-quest-widget {
    grid-column: auto;
    margin-top: 18px;
    padding-top: 17px;
    border-top: 1px solid rgba(196, 224, 225, 0.12);
  }

  .lp-club-quest-board {
    position: fixed;
    inset: 84px 12px 12px;
    width: auto;
    height: auto;
    min-height: 0;
    max-height: none;
    overflow: hidden;
    background:
      linear-gradient(135deg, rgba(255, 255, 255, 0.055), transparent 28%),
      rgba(5, 12, 15, 0.985);
  }

  .lp-club-quest-full-card {
    grid-template-columns: 42px minmax(0, 1fr);
  }

  .lp-club-quest-full-state {
    grid-column: 2;
    justify-self: start;
  }

  .lp-club-detail-head {
    align-items: start;
    flex-direction: column;
  }
}

@media (max-width: 560px) {
  .lp-club-topbar {
    min-height: 70px;
    padding: 14px;
  }

  .lp-club-network {
    gap: 12px;
  }

  .lp-club-brand {
    gap: 9px;
    font-size: 10px;
    letter-spacing: 0.08em;
  }

  .lp-club-brand-mark {
    width: 30px;
    height: 30px;
  }

  .lp-club-switch {
    display: none;
  }

  .lp-club-shell {
    padding: 12px 12px 28px;
  }

  .lp-club-card h1 {
    font-size: 40px;
  }

  .lp-club-card,
  .lp-club-lootboxes,
  .lp-club-battlepass,
  .lp-club-profile-panel {
    padding: 16px;
  }

  .lp-club-banner {
    flex-basis: min(84vw, 280px);
    min-height: 336px;
  }

  .lp-club-battlepass {
    --battlepass-card-width: min(154px, calc(100vw - 76px));
    --battlepass-card-gap: 14px;
  }

  .lp-club-battlepass-season {
    grid-template-columns: minmax(84px, 0.42fr) minmax(0, 1fr);
    padding: 18px;
  }

  .lp-club-battlepass-emblem img {
    width: 82px;
    height: 82px;
  }

  .lp-club-battlepass-main-reward {
    grid-template-columns: minmax(0, 1fr);
    padding: 20px;
  }

  .lp-club-battlepass-main-case {
    min-height: 128px;
  }

  .lp-club-battlepass-main-case img {
    max-height: 132px;
  }

  .lp-club-battlepass-track-scroll {
    padding-right: 0;
    padding-left: 0;
    scrollbar-width: none;
  }

  .lp-club-battlepass-track-scroll::-webkit-scrollbar {
    display: none;
  }

  .lp-club-battlepass-reward {
    min-height: 222px;
  }

  .lp-club-battlepass-progress {
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .lp-club-quick-metrics,
  .lp-club-static-grid {
    grid-template-columns: 1fr;
  }

  .lp-club-section-head {
    align-items: start;
    flex-direction: column;
  }

  .lp-club-quest:not(:last-of-type)::after {
    right: -18px;
  }

  .lp-club-detail-stack {
    padding: 0 12px 36px;
  }

  .lp-club-static-actions {
    flex-direction: column;
  }

  .lp-lootbox-unavailable-actions {
    grid-template-columns: 1fr;
  }

  .lp-battlepass-season-range-header,
  .lp-battlepass-season-range-row,
  .lp-battlepass-season-possible-list > div {
    grid-template-columns: 1fr;
    gap: 7px;
    padding: 12px 0;
  }

  .lp-battlepass-season-range-header > span:last-child {
    grid-column: auto;
  }

  .lp-battlepass-season-range-header > span:not(:first-child),
  .lp-battlepass-season-range-row > b {
    text-align: left;
  }

  .lp-battlepass-season-range-row i {
    display: none;
  }
}
`;

function gameActionHref(action: GameNextAction) {
  if (action.kind === "MATCH_LANGAME") {
    return "#next-actions";
  }

  return `#${action.anchor}`;
}

function gameActionButtonLabel(action: GameNextAction) {
  const labels = {
    CLAIM_REWARD: "Забрать награду",
    OPEN_LOOT_BOX: "Открыть приз",
    FINISH_MISSION: "Открыть квест",
    BATTLE_PASS: "Открыть сезон",
    CHECK_IN: "Чекин в клубе",
    MATCH_LANGAME: "Связать Langame",
  } satisfies Record<GameNextAction["kind"], string>;

  return labels[action.kind];
}

function isCheckInAvailable(summary: GuestPortalGameSummary) {
  return (
    Boolean(summary.checkIn?.enabled) ||
    summary.nextActions.some((action) => action.kind === "CHECK_IN") ||
    summary.missions.featured.some(isCheckInMission)
  );
}

function isCheckInMission(mission: GameMission) {
  const progressUnit = mission.progressUnit?.trim().toLocaleLowerCase("ru-RU");
  const missionName = mission.name.toLocaleLowerCase("ru-RU");

  return (
    progressUnit === "check-in" ||
    progressUnit === "checkin" ||
    progressUnit === "чекин" ||
    progressUnit === "чек-ин" ||
    missionName.includes("чекин")
  );
}

function isPlayerQuestMission(mission: GameMission) {
  return !isCheckInMission(mission);
}

async function loadGameSummary() {
  const startedAt = Date.now();
  debugGuestGame("api-summary-start");
  const response = await fetch("/api/guest-portal/session/game-summary", {
    cache: "no-store",
  });
  debugGuestGame("api-summary-response", {
    status: response.status,
    ok: response.ok,
    durationMs: Date.now() - startedAt,
  });

  if (response.status === 401) {
    throw new EmptySessionError("Сначала подтвердите телефон и выберите клуб.");
  }

  if (!response.ok) {
    throw new Error(
      await readResponseMessage(response, "Не удалось обновить игровой экран."),
    );
  }

  const summary = (await response.json()) as GuestPortalGameSummary;
  debugGuestGame("api-summary-data", debugSummarySnapshot(summary));

  return summary;
}

async function recordGameAppOpen(surface: "WEB" | "TG_MINI_APP") {
  const response = await fetch("/api/guest-portal/session/app-open", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ surface }),
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

  return ((await response.json()) as { summary: GuestPortalGameSummary }).summary;
}

async function updateGameProfileNickname(displayName: string) {
  const response = await fetch("/api/guest-portal/session/profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ displayName }),
    cache: "no-store",
  });

  if (response.status === 401) {
    throw new EmptySessionError("Сначала подтвердите телефон и выберите клуб.");
  }

  if (!response.ok) {
    throw new Error(
      await readResponseMessage(response, "Не удалось сохранить никнейм."),
    );
  }

  return ((await response.json()) as GuestPortalProfileUpdateResponse).summary;
}

async function checkInGameSession(): Promise<GuestPortalCheckInResponse> {
  const response = await fetch("/api/guest-portal/session/check-in", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ note: "Чекин гостя из игрового модуля." }),
    cache: "no-store",
  });

  if (response.status === 401) {
    throw new EmptySessionError("Сначала подтвердите телефон и выберите клуб.");
  }

  if (!response.ok) {
    throw new Error(
      await readResponseMessage(response, "Не удалось сделать чекин."),
    );
  }

  return (await response.json()) as GuestPortalCheckInResponse;
}

async function openGameLootBox(
  lootBoxId: string,
): Promise<GuestPortalLootBoxOpenResponse> {
  const startedAt = Date.now();
  debugGuestGame("api-lootbox-open-start", { lootBoxId });
  const response = await fetch(
    `/api/guest-portal/session/loot-boxes/${encodeURIComponent(lootBoxId)}/open`,
    {
      method: "POST",
      cache: "no-store",
    },
  );
  debugGuestGame("api-lootbox-open-response", {
    lootBoxId,
    status: response.status,
    ok: response.ok,
    durationMs: Date.now() - startedAt,
  });

  if (response.status === 401) {
    throw new EmptySessionError("Сначала подтвердите телефон и выберите клуб.");
  }

  if (!response.ok) {
    throw new Error(
      await readResponseMessage(response, "Лутбокс сейчас недоступен."),
    );
  }

  const result = (await response.json()) as GuestPortalLootBoxOpenResponse;
  debugGuestGame("api-lootbox-open-data", {
    lootBoxId,
    idempotent: result.idempotent,
    createdRewards: result.createdRewards,
    queuedRewardAmount: result.queuedRewardAmount,
    rewards: result.rewards,
    summary: debugSummarySnapshot(result.summary),
  });

  return result;
}

async function logoutGameSession() {
  const response = await fetch("/api/guest-portal/session/logout", {
    method: "POST",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      await readResponseMessage(response, "Не удалось завершить сессию."),
    );
  }
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

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function emitLootboxEvent(name: string, detail: Record<string, unknown> = {}) {
  window.dispatchEvent(
    new CustomEvent(`leetplus:lootbox:${name}`, {
      detail,
    }),
  );
}

function normalizeLootboxRarity(
  value: string | null | undefined,
): GuestPortalLootBoxRarity | null {
  return value === "common" ||
    value === "rare" ||
    value === "epic" ||
    value === "legendary"
    ? value
    : null;
}

function lootboxRouletteMs(rarity: GuestPortalLootBoxRarity | null) {
  return rarity ? LOOTBOX_ROULETTE_MS[rarity] : LOOTBOX_ROULETTE_MS.common;
}

function buildLootboxRouletteState({
  currentCard,
  nextCard,
  previousSummary,
  result,
  runId,
}: {
  currentCard: HomeLootCard;
  nextCard: HomeLootCard;
  previousSummary: GuestPortalGameSummary;
  result: GuestPortalLootBoxOpenResponse;
  runId: number;
}): LootboxRouletteState {
  const openedReward = result.rewards[0] ?? null;
  const winningReward = lootboxRouletteRewardFromOpenReward(
    openedReward,
    nextCard,
    `winner-${runId}`,
  );
  const fallbackRewards = LOOTBOX_ROULETTE_FALLBACK_REWARDS.map((item, index) => ({
    ...item,
    id: `fallback-${index}`,
  }));
  const resultRewards = result.rewards.map((item, index) =>
    lootboxRouletteRewardFromOpenReward(item, nextCard, `result-${index}`),
  );
  const recentRewards = [
    ...result.summary.rewards.recent,
    ...previousSummary.rewards.recent,
  ]
    .filter((item) => item.sourceKind === "LOOT_BOX")
    .slice(0, 14)
    .map((item, index) => lootboxRouletteRewardFromHistory(item, `recent-${index}`));
  const lootBoxRewards = result.summary.lootBoxes.featured.map((item, index) =>
    lootboxRouletteRewardFromCard(
      {
        id: item.id,
        title: item.name,
        description:
          item.latestReward?.rewardLabel ??
          item.rewardLabel ??
          currentCard.description,
        triggerKind: item.triggerKind ?? currentCard.triggerKind,
        sessionType: item.sessionType ?? currentCard.sessionType,
        schedule: item.schedule ?? currentCard.schedule,
        status: "",
        active: false,
        openable: item.openable,
        openState: item.openState,
        openBlocker: item.openBlocker,
        rewardLabel: item.rewardLabel,
        caseRarity: normalizeLootboxRarity(item.caseRarity) ?? "common",
        caseRarityLabel:
          item.caseRarityLabel ?? LOOTBOX_CASE_RARITY_LABELS[item.caseRarity],
        rewardRarity: item.latestReward?.rewardRarity ?? null,
        rewardRarityLabel: item.latestReward?.rewardRarityLabel ?? null,
        rewardDropChance: item.latestReward?.rewardDropChance ?? null,
        weeklyOpenedCount: item.weeklyOpenedCount,
        weeklyLimit: item.weeklyLimit,
        dailyOpenedCount: item.dailyOpenedCount,
        dailyLimit: item.dailyLimit,
        periodicLimitPeriod: item.periodicLimitPeriod,
        periodicOpenedCount: item.periodicOpenedCount,
      },
      `lootbox-${index}`,
    ),
  );
  const candidates = dedupeLootboxRouletteRewards([
    ...resultRewards,
    ...recentRewards,
    ...lootBoxRewards,
    ...fallbackRewards,
  ]);
  const pool = candidates.filter(
    (item) => !sameLootboxRouletteReward(item, winningReward),
  );
  const fallbackPool = fallbackRewards.filter(
    (item) => !sameLootboxRouletteReward(item, winningReward),
  );
  const spinPool = pool.length ? pool : fallbackPool.length ? fallbackPool : fallbackRewards;
  const items: LootboxRouletteReward[] = [];
  const cycleCount = Math.max(7, Math.ceil(44 / Math.max(1, spinPool.length)));

  for (let cycle = 0; cycle < cycleCount; cycle += 1) {
    spinPool.forEach((_, itemIndex) => {
      const shiftedIndex = (itemIndex + cycle * 2) % spinPool.length;
      const reward = spinPool[shiftedIndex];

      items.push({
        ...reward,
        id: `${reward.id}-${cycle}-${itemIndex}`,
        isWinner: false,
      });
    });
  }

  const winningIndex = Math.min(items.length, Math.max(30, items.length - 12));

  items.splice(winningIndex, 0, {
    ...winningReward,
    isWinner: true,
  });
  items.push(
    ...spinPool.slice(0, 7).map((item, index) => ({
      ...item,
      id: `${item.id}-tail-${index}`,
      isWinner: false,
    })),
  );

  return {
    runId,
    lootBoxId: currentCard.id,
    items,
    winningIndex,
    durationMs: lootboxRouletteMs(winningReward.rarity),
    reward: winningReward.reward,
    caption: winningReward.caption,
    rarity: winningReward.rarity,
    rarityLabel: winningReward.rarityLabel,
    dropChance: winningReward.dropChance,
    message: result.message,
    skipped: false,
  };
}

function lootboxRouletteRewardFromOpenReward(
  reward: LootboxOpenReward | null,
  card: HomeLootCard,
  id: string,
): LootboxRouletteReward {
  const rarity =
    normalizeLootboxRarity(reward?.rewardRarity) ??
    normalizeLootboxRarity(card.rewardRarity);
  const rarityLabel =
    reward?.rewardRarityLabel ??
    card.rewardRarityLabel ??
    (rarity ? LOOTBOX_RARITY_LABELS[rarity] : null);
  const dropChance = reward?.rewardDropChance ?? card.rewardDropChance ?? null;
  const rewardLabel =
    reward?.rewardLabel ?? card.rewardLabel ?? card.description;

  return {
    id,
    reward: rewardLabel,
    caption: lootboxRouletteCaption(rarityLabel, dropChance, card.title),
    rarity,
    rarityLabel,
    dropChance,
  };
}

function lootboxRouletteRewardFromHistory(
  item: GameRewardHistoryItem,
  id: string,
): LootboxRouletteReward {
  const rarity = normalizeLootboxRarity(item.rewardRarity);
  const rarityLabel =
    item.rewardRarityLabel ?? (rarity ? LOOTBOX_RARITY_LABELS[rarity] : null);

  return {
    id,
    reward: item.rewardLabel,
    caption: lootboxRouletteCaption(
      rarityLabel,
      item.rewardDropChance,
      item.sourceLabel ?? "club reward",
    ),
    rarity,
    rarityLabel,
    dropChance: item.rewardDropChance,
  };
}

function lootboxRouletteRewardFromCard(
  card: HomeLootCard,
  id: string,
): LootboxRouletteReward {
  const rarity = normalizeLootboxRarity(card.rewardRarity);
  const rarityLabel =
    card.rewardRarityLabel ?? (rarity ? LOOTBOX_RARITY_LABELS[rarity] : null);

  return {
    id,
    reward: card.rewardLabel ?? card.description,
    caption: lootboxRouletteCaption(rarityLabel, card.rewardDropChance ?? null, card.title),
    rarity,
    rarityLabel,
    dropChance: card.rewardDropChance ?? null,
  };
}

function lootboxRouletteCaption(
  rarityLabel: string | null,
  dropChance: number | null,
  fallback: string,
) {
  const label = rarityLabel ?? fallback;

  if (typeof dropChance === "number" && Number.isFinite(dropChance)) {
    return `${label} / ${formatChancePercent(dropChance)}`;
  }

  return label;
}

function dedupeLootboxRouletteRewards(items: LootboxRouletteReward[]) {
  const seen = new Set<string>();

  return items.filter((item) => {
    const key = `${item.reward}::${item.rarity ?? "unknown"}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function sameLootboxRouletteReward(
  first: LootboxRouletteReward,
  second: LootboxRouletteReward,
) {
  return first.reward === second.reward && first.rarity === second.rarity;
}

function lootboxRouletteEventDetail(
  roulette: LootboxRouletteState,
  skipped: boolean,
) {
  return {
    lootBoxId: roulette.lootBoxId,
    rarity: roulette.rarity,
    reward: roulette.reward,
    caption: roulette.caption,
    rarityLabel: roulette.rarityLabel,
    chancePercent: roulette.dropChance,
    winningIndex: roulette.winningIndex,
    skipped,
  };
}

function lootboxRewardRarityLabel(value: {
  rewardRarity?: string | null;
  rewardRarityLabel?: string | null;
}) {
  const rarity = normalizeLootboxRarity(value.rewardRarity);

  return value.rewardRarityLabel ?? (rarity ? LOOTBOX_RARITY_LABELS[rarity] : null);
}

function revealLootboxRarity({
  lootBoxId,
  rewardLabel,
  rewardRarity,
  rewardRarityLabel,
  rewardDropChance,
  caption,
  winningIndex,
  skipped,
}: {
  lootBoxId: string;
  rewardLabel: string;
  rewardRarity: GuestPortalLootBoxRarity | null;
  rewardRarityLabel: string | null;
  rewardDropChance: number | null;
  caption?: string;
  winningIndex?: number;
  skipped?: boolean;
}) {
  emitLootboxEvent("rarity-reveal", {
    lootBoxId,
    reward: rewardLabel,
    rewardLabel,
    caption,
    rarity: rewardRarity,
    rarityLabel: rewardRarityLabel,
    chancePercent: rewardDropChance,
    winningIndex,
    skipped,
  });
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

function formatChancePercent(value: number) {
  return `${new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 2,
  }).format(value)}%`;
}

function formatSignedNumber(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 0,
    signDisplay: "always",
  }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

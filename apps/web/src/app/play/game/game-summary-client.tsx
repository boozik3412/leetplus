"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
} from "react";
import type {
  GuestPortalCheckInResponse,
  GuestPortalGameMissionPage,
  GuestPortalGameSummary,
  GuestPortalRewardWallet,
  GuestPortalRewardWalletItem,
} from "@/lib/guest-portal";
import {
  isHttpExternalActionUrl,
  isInternalHref,
  normalizeExternalActionUrl,
} from "@/lib/external-links";
import {
  GuestMissionPreview,
  type GuestMissionPreviewData,
} from "@/components/guest-mission-preview";
import { startNavigationFeedback } from "@/components/navigation-feedback";
import { GuestBugReportButton } from "@/components/guest-bug-report";
import { GuestSupportTickets } from "@/components/guest-support-tickets";
import { GameRatingTeaser } from "./game-rating-client";
import { clubHomeCss } from "./_game/club-home-css";
import {
  GameTutorial,
  TutorialMenuIcon,
  useGameTutorial,
} from "./_game/tutorial/game-tutorial";
import type {
  LoadState,
  HomeLootCard,
  LootboxOverlayPhase,
  LootboxRouletteState,
  UnavailableLootboxMessage,
  QuestBoardStyle,
  CompletionDialogQueueItem,
  PlayerQuest,
  QuestCompletionDialog,
  HomeBanner,
  CheckInCompletionDialog,
  GameMission,
  GameMissionHistoryItem,
  GameNextAction,
  BannerTitleStyle,
  QuestStatus,
} from "./_game/types";
import {
  recordGameAppOpen,
  EmptySessionError,
  loadGameSummary,
  openGameRewardWalletLootBox,
  claimGameRewardWalletItem,
  claimAllGameRewardWalletItems,
  logoutGameSession,
  acknowledgeGameCompletionNotification,
  loadGameMissionPage,
  checkInGameSession,
  openGameLootBox,
  updateGameProfileNickname,
} from "./_game/api";
import {
  getErrorMessage,
  wait,
  clampPercent,
  formatNumber,
  formatDate,
} from "./_game/format";
import {
  GUEST_GAME_AUTH_REQUIRED_MESSAGE,
  EMPTY_REWARD_WALLET,
  LOOTBOX_CHARGE_MIN_MS,
  LOOTBOX_CASE_OPEN_MS,
  QUEST_BOARD_PAGE_SIZE,
  REWARD_WALLET_PULSE_STORAGE_VERSION,
  LOOTBOX_CASE_RARITY_LABELS,
  LEVEL_XP_STEP,
} from "./_game/constants";
import {
  debugGuestGame,
  debugSummarySnapshot,
  debugHomeLootCard,
} from "./_game/debug";
import {
  rewardWalletLootboxCard,
  openedLootboxCard,
} from "./_game/lootbox/cards";
import {
  emitLootboxEvent,
  preloadLootboxPrizeImages,
  buildLootboxRouletteState,
  lootboxRouletteEventDetail,
} from "./_game/lootbox/roulette";
import {
  lootboxOpeningErrorMessage,
  lootboxCardBlockedTooltip,
} from "./_game/lootbox/hints";
import {
  revealLootboxRarity,
  normalizeLootboxRarity,
} from "./_game/lootbox/rarity";
import { LootboxOpeningOverlay } from "./_game/lootbox/opening-overlay";
import {
  MenuIcon,
  TrophyIcon,
  ExitIcon,
  BrandMark,
  WalletCaseIcon,
  ProfileIcon,
  PencilIcon,
} from "./_game/icons";
import { HomeLootBoxes } from "./_game/lootbox/home-loot-boxes";
import { LootboxUnavailableModal } from "./_game/lootbox/unavailable-modal";
import { RewardLootBoxPreview } from "./_game/lootbox/preview";
import {
  normalizeGameRuleTrigger,
  normalizeGameRuleSessionType,
  withHourlySessionExtensionNotice,
  gameProgressUnitLabel,
  guestActionRequirementLabel,
} from "./_game/game-rules";
import { buildHomeBattleQuests } from "./_game/battle-pass/track";
import { HomeBattlePass } from "./_game/battle-pass/home-battle-pass";
import { BattlePassLevelCompletionModal } from "./_game/battle-pass/modals";
import {
  playerQuestProgress,
  missionConditionHint,
} from "./_game/quest-progress";
import {
  battlePassLevelLootBoxPreview,
  findNewBattlePassLevelCompletions,
} from "./_game/battle-pass/rewards";
import {
  gameRewardWallet,
  isRewardWalletItemActionable,
  isClaimableRewardWalletItem,
  rewardWalletItemPendingActionLabel,
  orderedRewardWalletItems,
  rewardWalletItemPriority,
  rewardWalletItemStatusHint,
  rewardWalletItemActionLabel,
} from "./_game/rewards/wallet";
import { RewardWalletInboxPanel } from "./_game/rewards/wallet-inbox-panel";
import { RewardJournalPanel } from "./_game/rewards/journal-panel";

export function GameSummaryClient() {
  const [summary, setSummary] = useState<GuestPortalGameSummary | null>(null);
  const [completionBaseline, setCompletionBaseline] =
    useState<GuestPortalGameSummary | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [message, setMessage] = useState<string | null>(null);
  const summaryEpochRef = useRef(0);
  const applySummary = useCallback(
    (nextSummary: GuestPortalGameSummary | null) => {
      summaryEpochRef.current += 1;
      setSummary(nextSummary);
    },
    [],
  );

  useEffect(() => {
    let isActive = true;

    async function loadInitialSummary() {
      try {
        const appOpen = await recordGameAppOpen("WEB");

        if (!isActive) {
          return;
        }

        setCompletionBaseline(appOpen.previousSummary);
        applySummary(appOpen.summary);
        setLoadState("ready");
        setMessage(null);
      } catch (error) {
        if (!isActive) {
          return;
        }

        if (error instanceof EmptySessionError) {
          applySummary(null);
          setLoadState("empty");
          setMessage(error.message);
          return;
        }

        setLoadState("error");
        setMessage(
          getErrorMessage(error, "Не удалось загрузить игровой экран."),
        );
      }
    }

    void loadInitialSummary();

    return () => {
      isActive = false;
    };
  }, [applySummary]);

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
      const requestEpoch = summaryEpochRef.current;

      try {
        const nextSummary = await loadGameSummary();

        if (isActive && requestEpoch === summaryEpochRef.current) {
          applySummary(nextSummary);
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
      15_000,
    );

    window.addEventListener("focus", refreshVisibleSummary);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isActive = false;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshVisibleSummary);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [applySummary, loadState]);

  if (loadState === "loading") {
    return <GameShell body={<LoadingView />} />;
  }

  if (loadState === "error") {
    return (
      <GameShell
        body={
          <EmptySessionView
            kind="retry"
            title="Не удалось открыть игру"
            message={message ?? "Попробуйте обновить страницу чуть позже."}
          />
        }
      />
    );
  }

  if (loadState === "empty" || !summary) {
    return (
      <GameShell
        body={
          <EmptySessionView
            kind="auth-required"
            title="Нужно войти в игровой модуль"
            message={message ?? GUEST_GAME_AUTH_REQUIRED_MESSAGE}
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
          completionBaseline={completionBaseline}
          onSummaryChange={applySummary}
        />
      }
    />
  );
}

export function GameRewardsClient() {
  const [summary, setSummary] = useState<GuestPortalGameSummary | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [walletMessage, setWalletMessage] = useState<string | null>(null);
  const [switchToastMessage, setSwitchToastMessage] = useState<string | null>(
    null,
  );
  const [walletClaimingItemId, setWalletClaimingItemId] = useState<
    string | null
  >(null);
  const [walletClaimAllPending, setWalletClaimAllPending] = useState(false);
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
  const lootboxWalletItemRef = useRef<GuestPortalRewardWalletItem | null>(null);
  const walletActionPendingRef = useRef(false);
  const summaryEpochRef = useRef(0);
  const rewardWallet = summary
    ? gameRewardWallet(summary)
    : EMPTY_REWARD_WALLET;
  const applySummary = useCallback(
    (nextSummary: GuestPortalGameSummary | null) => {
      summaryEpochRef.current += 1;
      setSummary(nextSummary);
    },
    [],
  );

  useEffect(() => {
    let isActive = true;

    async function loadRewardsSummary() {
      try {
        const appOpen = await recordGameAppOpen("WEB");

        if (!isActive) {
          return;
        }

        applySummary(appOpen.summary);
        setLoadState("ready");
        setMessage(null);
      } catch (error) {
        if (!isActive) {
          return;
        }

        if (error instanceof EmptySessionError) {
          applySummary(null);
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
  }, [applySummary]);

  useEffect(() => {
    if (loadState !== "ready") {
      return;
    }

    let isActive = true;
    let refreshRunning = false;

    async function refreshVisibleRewards() {
      if (
        !isActive ||
        refreshRunning ||
        walletActionPendingRef.current ||
        document.visibilityState === "hidden"
      ) {
        return;
      }

      refreshRunning = true;
      const requestEpoch = summaryEpochRef.current;

      try {
        const nextSummary = await loadGameSummary();

        if (
          isActive &&
          !walletActionPendingRef.current &&
          requestEpoch === summaryEpochRef.current
        ) {
          applySummary(nextSummary);
        }
      } catch {
        // Keep the last usable reward journal.
      } finally {
        refreshRunning = false;
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void refreshVisibleRewards();
      }
    }

    const intervalId = window.setInterval(
      () => void refreshVisibleRewards(),
      15_000,
    );

    window.addEventListener("focus", refreshVisibleRewards);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isActive = false;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshVisibleRewards);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [applySummary, loadState]);

  useEffect(() => {
    if (!switchToastMessage) {
      return;
    }

    const timerId = window.setTimeout(() => setSwitchToastMessage(null), 2600);

    return () => window.clearTimeout(timerId);
  }, [switchToastMessage]);

  if (loadState === "loading") {
    return <GameShell body={<LoadingView />} />;
  }

  if (loadState === "error") {
    return (
      <GameShell
        body={
          <EmptySessionView
            kind="retry"
            title="Не удалось открыть журнал"
            message={message ?? "Попробуйте обновить страницу чуть позже."}
          />
        }
      />
    );
  }

  if (loadState === "empty" || !summary) {
    return (
      <GameShell
        body={
          <EmptySessionView
            kind="auth-required"
            title="Журнал наград пока недоступен"
            message={message ?? GUEST_GAME_AUTH_REQUIRED_MESSAGE}
          />
        }
      />
    );
  }

  async function beginRewardWalletLootboxOpening(
    item: GuestPortalRewardWalletItem,
  ): Promise<boolean> {
    const currentSummary = summary;

    if (
      !currentSummary ||
      item.action !== "OPEN_LOOT_BOX" ||
      !isRewardWalletItemActionable(item) ||
      walletActionPendingRef.current ||
      walletClaimingItemId ||
      walletClaimAllPending
    ) {
      return false;
    }

    const currentCard = rewardWalletLootboxCard(item, currentSummary);
    const runId = lootboxOpenRunRef.current + 1;

    lootboxOpenRunRef.current = runId;
    lootboxWalletItemRef.current = item;
    walletActionPendingRef.current = true;
    setWalletClaimingItemId(item.id);
    setWalletMessage(null);
    setLootboxOverlayCard(currentCard);
    setLootboxRoulette(null);
    setLootboxOverlayError(null);
    setLootboxOverlayPhase("charging");
    emitLootboxEvent("overlay-open", { lootBoxId: currentCard.id });
    emitLootboxEvent("charge-start", { lootBoxId: currentCard.id });
    const imageWarmup = preloadLootboxPrizeImages(currentCard.possibleRewards);

    try {
      const [result] = await Promise.all([
        openGameRewardWalletLootBox(item.id),
        wait(LOOTBOX_CHARGE_MIN_MS),
      ]);

      if (lootboxOpenRunRef.current !== runId) {
        return false;
      }

      const nextCard = openedLootboxCard(currentCard, result);
      const roulette = buildLootboxRouletteState({
        currentCard,
        nextCard,
        previousSummary: currentSummary,
        result,
        runId,
      });
      await Promise.all([
        imageWarmup,
        preloadLootboxPrizeImages(result.rewards),
      ]);

      if (lootboxOpenRunRef.current !== runId) {
        return false;
      }

      applySummary(result.summary);
      setLootboxOverlayCard(nextCard);
      setLootboxRoulette(roulette);
      setLootboxOverlayPhase("rolling");
      return true;
    } catch (error) {
      if (lootboxOpenRunRef.current !== runId) {
        return false;
      }

      setLootboxRoulette(null);
      setLootboxOverlayPhase("ready");
      setLootboxOverlayError(lootboxOpeningErrorMessage(error));
      return false;
    } finally {
      walletActionPendingRef.current = false;
      setWalletClaimingItemId(null);
    }
  }

  function retryRewardWalletLootboxOpening() {
    const item = lootboxWalletItemRef.current;

    if (item) {
      void beginRewardWalletLootboxOpening(item);
    }
  }

  function finishRewardWalletLootboxRoulette(skipped: boolean) {
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
    }, LOOTBOX_CASE_OPEN_MS);
  }

  function closeRewardWalletLootboxOverlay() {
    lootboxOpenRunRef.current += 1;
    lootboxWalletItemRef.current = null;
    setLootboxOverlayCard(null);
    setLootboxOverlayPhase("ready");
    setLootboxRoulette(null);
    setLootboxOverlayError(null);
    emitLootboxEvent("overlay-close");
  }

  function collectRewardWalletLootboxResult() {
    if (!lootboxOverlayCard || lootboxOverlayPhase !== "open") {
      return;
    }

    const roulette = lootboxRoulette;

    setLootboxOverlayPhase("collected");
    setWalletMessage(
      `Кейс открыт. Выпало: ${lootboxOverlayCard.description}. Награда сохранена в кошельке.`,
    );
    emitLootboxEvent(
      "reward-collected",
      roulette
        ? lootboxRouletteEventDetail(roulette, roulette.skipped)
        : {
            lootBoxId: lootboxOverlayCard.id,
            reward: lootboxOverlayCard.description,
          },
    );
  }

  async function handleRewardWalletItem(
    item: GuestPortalRewardWalletItem,
  ): Promise<boolean> {
    const currentSummary = summary;

    if (item.action === "OPEN_LOOT_BOX") {
      return beginRewardWalletLootboxOpening(item);
    }

    if (
      !currentSummary ||
      !isRewardWalletItemActionable(item) ||
      walletActionPendingRef.current ||
      walletClaimingItemId ||
      walletClaimAllPending
    ) {
      return false;
    }

    walletActionPendingRef.current = true;
    setWalletClaimingItemId(item.id);
    setWalletMessage(null);

    try {
      if (item.action !== "CLAIM_REWARD") {
        return false;
      }

      const nextSummary = await claimGameRewardWalletItem(item.id);
      applySummary(nextSummary);
      setWalletMessage(
        `Награда «${item.rewardLabel}» отправлена на начисление.`,
      );
      return true;
    } catch (error) {
      setWalletMessage(
        getErrorMessage(
          error,
          "Не удалось получить награду. Попробуйте ещё раз.",
        ),
      );
      return false;
    } finally {
      walletActionPendingRef.current = false;
      setWalletClaimingItemId(null);
    }
  }

  async function handleRewardWalletClaimAll(): Promise<boolean> {
    if (
      !rewardWallet.items.some(isClaimableRewardWalletItem) ||
      walletActionPendingRef.current ||
      walletClaimingItemId ||
      walletClaimAllPending
    ) {
      return false;
    }

    walletActionPendingRef.current = true;
    setWalletClaimAllPending(true);
    setWalletMessage(null);

    try {
      const nextSummary = await claimAllGameRewardWalletItems();
      const nextWallet = gameRewardWallet(nextSummary);

      applySummary(nextSummary);
      setWalletMessage(
        nextWallet.pendingCount > 0
          ? "Доступные награды отправлены. Остальные остаются в кошельке со своим статусом."
          : "Все доступные награды получены.",
      );
      return true;
    } catch (error) {
      setWalletMessage(
        getErrorMessage(
          error,
          "Не удалось получить награды. Попробуйте ещё раз.",
        ),
      );
      return false;
    } finally {
      walletActionPendingRef.current = false;
      setWalletClaimAllPending(false);
    }
  }

  return (
    <GameShell
      body={
        <div className="lp-club-home lp-reward-standalone-page">
          <GameModuleTopbar summary={summary} />
          <div className="lp-reward-standalone-shell">
            {walletMessage ? (
              <div
                className="lp-reward-wallet-message"
                role="status"
                aria-live="polite"
              >
                {walletMessage}
              </div>
            ) : null}
            <RewardWalletInboxPanel
              wallet={rewardWallet}
              claimingItemId={walletClaimingItemId}
              claimAllPending={walletClaimAllPending}
              onItemAction={handleRewardWalletItem}
              onClaimAll={handleRewardWalletClaimAll}
            />
            <RewardJournalPanel summary={summary} standalone />
            <div
              className={[
                "lp-club-toast",
                switchToastMessage ? "is-visible" : "",
              ].join(" ")}
              role="status"
              aria-live="polite"
            >
              {switchToastMessage}
            </div>
          </div>
          {lootboxOverlayCard ? (
            <LootboxOpeningOverlay
              card={lootboxOverlayCard}
              phase={lootboxOverlayPhase}
              roulette={lootboxRoulette}
              errorMessage={lootboxOverlayError}
              checkingConditions={walletClaimingItemId !== null}
              rewardRef={lootboxRewardRef}
              onOpen={retryRewardWalletLootboxOpening}
              onClose={closeRewardWalletLootboxOverlay}
              onCollect={collectRewardWalletLootboxResult}
              onRefreshConditions={retryRewardWalletLootboxOpening}
              onRouletteFinish={finishRewardWalletLootboxRoulette}
            />
          ) : null}
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
  kind,
  title,
  message,
}: {
  kind: "auth-required" | "retry";
  title: string;
  message: string;
}) {
  const authRequired = kind === "auth-required";

  return (
    <section className="lp-club-home-static">
      <div className="lp-club-static-card">
        <p className="lp-club-small-label">
          {authRequired ? "Игровой вход" : "Игровой модуль"}
        </p>
        <h1 className="lp-club-static-title">{title}</h1>
        <p className="lp-club-static-copy">{message}</p>
        <div className="lp-club-static-actions">
          {authRequired ? (
            <>
              <Link href="/game/auth" className="lp-club-primary-link">
                Перейти ко входу
              </Link>
              <Link href="/start" className="lp-club-ghost-link">
                К выбору раздела
              </Link>
            </>
          ) : (
            <>
              <button
                className="lp-club-primary-link"
                type="button"
                onClick={() => window.location.reload()}
              >
                Повторить
              </button>
              <Link href="/start" className="lp-club-ghost-link">
                К выбору раздела
              </Link>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function GameModuleTopbar({
  summary,
  onTutorialOpen,
}: {
  summary: GuestPortalGameSummary;
  onTutorialOpen?: () => void;
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const brandLogoUrl = summary.store.gameLogoUrl ?? summary.tenant.gameLogoUrl;

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

  async function handleLogout() {
    setMenuOpen(false);

    try {
      await logoutGameSession();
    } catch {
      // Even if the local session endpoint is unavailable, send the guest to auth.
    }

    startNavigationFeedback();
    router.push("/game/auth");
    router.refresh();
  }

  return (
    <header className="lp-club-topbar">
      <div className="lp-club-topbar-inner">
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
            className={["lp-club-menu-panel", menuOpen ? "is-open" : ""].join(
              " ",
            )}
            aria-label="Меню игрового модуля"
            hidden={!menuOpen}
          >
            <Link href="/game/rating" onClick={() => setMenuOpen(false)}>
              <TrophyIcon />
              <span>Рейтинг</span>
            </Link>
            {onTutorialOpen ? (
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onTutorialOpen();
                }}
              >
                <TutorialMenuIcon />
                <span>Как играть</span>
              </button>
            ) : null}
            <button type="button" onClick={handleLogout}>
              <ExitIcon />
              <span>Выйти</span>
            </button>
          </nav>
        </div>

        <div className="lp-club-network">
          <div className="lp-club-switch">
            <BrandMark logoUrl={brandLogoUrl} />
            <Link href="/game/clubs">{summary.store.name}</Link>
          </div>
        </div>

        <div className="lp-club-header-actions">
          {summary.support?.bugReporting?.enabled ? (
            <>
              <GuestSupportTickets />
              <GuestBugReportButton
                configuration={summary.support.bugReporting}
              />
            </>
          ) : null}
          <div
            className="lp-club-session-state"
            title="Телефон подтвержден, клуб выбран"
          >
            Профиль активен
          </div>
        </div>
      </div>
    </header>
  );
}

function ReadyGameView({
  summary,
  completionBaseline,
  onSummaryChange,
}: {
  summary: GuestPortalGameSummary;
  completionBaseline: GuestPortalGameSummary | null;
  onSummaryChange: (summary: GuestPortalGameSummary) => void;
}) {
  const router = useRouter();
  const primaryAction =
    summary.nextActions.find((action) => !isGuestInternalNextAction(action)) ??
    null;
  const primaryActionHref = primaryAction
    ? gameActionHref(primaryAction)
    : null;
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
  const lootboxOverlayWalletItemRef =
    useRef<GuestPortalRewardWalletItem | null>(null);
  const latestSummaryRef = useRef(completionBaseline ?? summary);
  const seenCompletionDialogKeysRef = useRef(new Set<string>());
  const shellRef = useRef<HTMLDivElement | null>(null);
  const lootBoxesRef = useRef<HTMLElement | null>(null);
  const battlePassRef = useRef<HTMLElement | null>(null);
  const [promoCode, setPromoCode] = useState("");
  const [checkInPending, setCheckInPending] = useState(false);
  const [summaryRefreshPending, setSummaryRefreshPending] = useState(false);
  const [unavailableLootboxCard, setUnavailableLootboxCard] =
    useState<HomeLootCard | null>(null);
  const [unavailableLootboxMessage, setUnavailableLootboxMessage] =
    useState<UnavailableLootboxMessage>(null);
  const [nicknamePending, setNicknamePending] = useState(false);
  const [questsExpanded, setQuestsExpanded] = useState(false);
  const [questBoardPage, setQuestBoardPage] =
    useState<GuestPortalGameMissionPage | null>(null);
  const [questBoardLoading, setQuestBoardLoading] = useState(false);
  const [questBoardError, setQuestBoardError] = useState<string | null>(null);
  const [questDetailsId, setQuestDetailsId] = useState<string | null>(null);
  const [questBoardStyle, setQuestBoardStyle] = useState<QuestBoardStyle>({});
  const questBoardRequestRef = useRef(0);
  const [completionDialogQueue, setCompletionDialogQueue] = useState<
    CompletionDialogQueueItem[]
  >([]);
  const [completionDialogAcknowledging, setCompletionDialogAcknowledging] =
    useState(false);
  const [completionDialogError, setCompletionDialogError] = useState<
    string | null
  >(null);
  const [walletClaimingItemId, setWalletClaimingItemId] = useState<
    string | null
  >(null);
  const walletActionPendingRef = useRef(false);
  const rewardWallet = gameRewardWallet(summary);
  const rewardWalletPulse = useRewardWalletPulse(
    rewardWallet,
    summary.profile.id,
  );
  const homeBanners = buildHomeBanners(
    summary,
    primaryAction,
    primaryActionHref,
  );
  const lootCards = buildHomeLootCards(summary, selectedLootId);
  const battleQuests = buildHomeBattleQuests(summary);
  const playerQuests = useMemo(() => buildPlayerQuests(summary), [summary]);
  const questBoardQuests = useMemo(
    () => buildPlayerQuests(summary, questBoardPage?.items),
    [questBoardPage?.items, summary],
  );
  const questDetails = questDetailsId
    ? (questBoardQuests.find((quest) => quest.id === questDetailsId) ??
      playerQuests.find((quest) => quest.id === questDetailsId) ??
      null)
    : null;
  const checkInAction =
    summary.nextActions.find((action) => action.kind === "CHECK_IN") ?? null;
  const checkInSummary = summary.checkIn ?? null;
  const checkInAvailable = isCheckInAvailable(summary);
  const completedQuestCount = Math.min(
    summary.progress.summary.missionsCompleted,
    summary.missions.total,
  );
  const questTotalCount = summary.missions.total;
  const battlePassProgress = clampPercent(
    summary.battlePass.active?.progressPercent ??
      summary.journey.summary.readyPercent,
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
    const right = shellRect.right - Math.max(lootRect.right, battleRect.right);
    const bottom = shellRect.bottom - battleRect.bottom;

    setQuestBoardStyle({
      "--quest-board-left": `${Math.max(0, Math.round(left))}px`,
      "--quest-board-top": `${Math.max(0, Math.round(top))}px`,
      "--quest-board-right": `${Math.max(0, Math.round(right))}px`,
      "--quest-board-bottom": `${Math.max(0, Math.round(bottom))}px`,
    });
  }, [setQuestBoardStyle]);

  useEffect(() => {
    if (!toastMessage) {
      return;
    }

    const timerId = window.setTimeout(() => setToastMessage(null), 2200);

    return () => window.clearTimeout(timerId);
  }, [toastMessage]);

  useEffect(() => {
    questBoardRequestRef.current += 1;

    const timerId = window.setTimeout(() => {
      setQuestBoardPage(null);
      setQuestBoardLoading(false);
      setQuestBoardError(null);
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [summary.generatedAt]);

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

  const enqueueCompletionDialogs = useCallback(
    (items: CompletionDialogQueueItem[]) => {
      const newItems: CompletionDialogQueueItem[] = [];

      items.forEach((item) => {
        if (seenCompletionDialogKeysRef.current.has(item.key)) {
          return;
        }

        seenCompletionDialogKeysRef.current.add(item.key);
        newItems.push(item);
      });

      if (newItems.length > 0) {
        setCompletionDialogQueue((currentQueue) => [
          ...currentQueue,
          ...newItems,
        ]);
      }
    },
    [setCompletionDialogQueue],
  );

  useEffect(() => {
    enqueueCompletionDialogs(
      completionDialogsFromPendingNotifications(summary),
    );
  }, [enqueueCompletionDialogs, summary]);

  useEffect(() => {
    const previousSummary = latestSummaryRef.current;

    if (previousSummary === summary) {
      return;
    }

    const completions = findNewCompletionDialogs(previousSummary, summary);

    latestSummaryRef.current = summary;
    enqueueCompletionDialogs(completions);
  }, [enqueueCompletionDialogs, summary]);

  function applySummaryWithCompletionDialogs(
    nextSummary: GuestPortalGameSummary,
    additionalCompletions: CompletionDialogQueueItem[] = [],
  ) {
    const previousSummary = latestSummaryRef.current;
    const completions = sortCompletionDialogs([
      ...completionDialogsFromPendingNotifications(nextSummary),
      ...additionalCompletions,
      ...findNewCompletionDialogs(previousSummary, nextSummary),
    ]);

    latestSummaryRef.current = nextSummary;
    onSummaryChange(nextSummary);

    enqueueCompletionDialogs(completions);
  }

  function closeActiveCompletionDialog() {
    setCompletionDialogQueue((currentQueue) => currentQueue.slice(1));
    setCompletionDialogError(null);
  }

  async function acknowledgeActiveCompletionDialog(openRewards: boolean) {
    if (!activeCompletionDialog || completionDialogAcknowledging) {
      return;
    }

    if (
      activeCompletionDialog.kind === "CHECK_IN" ||
      !activeCompletionDialog.notificationId
    ) {
      closeActiveCompletionDialog();

      if (openRewards) {
        startNavigationFeedback();
        router.push("/game/rewards");
      }
      return;
    }

    setCompletionDialogAcknowledging(true);
    setCompletionDialogError(null);

    try {
      await acknowledgeGameCompletionNotification(
        activeCompletionDialog.notificationId,
      );
      closeActiveCompletionDialog();

      if (openRewards) {
        startNavigationFeedback();
        router.push("/game/rewards");
        return;
      }

      try {
        const nextSummary = await loadGameSummary();

        applySummaryWithCompletionDialogs(nextSummary);
      } catch {
        showToast(
          "Уведомление закрыто. Статус награды обновится автоматически.",
        );
      }
    } catch (error) {
      setCompletionDialogError(
        getErrorMessage(
          error,
          "Не удалось закрыть уведомление. Попробуйте ещё раз.",
        ),
      );
    } finally {
      setCompletionDialogAcknowledging(false);
    }
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

  async function loadQuestBoardPage(offset: number, append: boolean) {
    if (questBoardLoading) {
      return;
    }

    const requestId = questBoardRequestRef.current + 1;
    questBoardRequestRef.current = requestId;
    setQuestBoardLoading(true);
    setQuestBoardError(null);

    try {
      const page = await loadGameMissionPage({
        offset,
        limit: QUEST_BOARD_PAGE_SIZE,
      });

      if (requestId !== questBoardRequestRef.current) {
        return;
      }

      setQuestBoardPage((currentPage) => {
        if (!append || !currentPage) {
          return page;
        }

        const knownMissionIds = new Set(
          currentPage.items.map((mission) => mission.id),
        );
        const addedItems = page.items.filter((mission) => {
          if (knownMissionIds.has(mission.id)) {
            return false;
          }

          knownMissionIds.add(mission.id);
          return true;
        });

        return {
          ...page,
          offset: 0,
          items: [...currentPage.items, ...addedItems],
        };
      });
    } catch (error) {
      if (requestId !== questBoardRequestRef.current) {
        return;
      }

      if (error instanceof EmptySessionError) {
        startNavigationFeedback();
        router.push("/game/auth");
        return;
      }

      setQuestBoardError(
        getErrorMessage(
          error,
          "Не удалось загрузить остальные задания. Попробуйте ещё раз.",
        ),
      );
    } finally {
      if (requestId === questBoardRequestRef.current) {
        setQuestBoardLoading(false);
      }
    }
  }

  async function toggleQuestsExpanded() {
    const nextExpanded = !questsExpanded;

    if (nextExpanded) {
      syncQuestBoardBounds();
      setQuestsExpanded(true);
      showToast("Открыт экран квестов.");

      if (
        !questBoardPage &&
        summary.missions.total > summary.missions.featured.length
      ) {
        await loadQuestBoardPage(0, false);
      }

      return;
    }

    setQuestsExpanded(false);
    showToast("Квесты свернуты.");
  }

  function closeQuestBoard() {
    setQuestsExpanded(false);
    showToast("Квесты свернуты.");
  }

  function handleQuestClick(quest: PlayerQuest) {
    setQuestDetailsId(quest.id);
  }

  function closeQuestDetails() {
    setQuestDetailsId(null);
  }

  async function handleQuestRewardClaim(quest: PlayerQuest) {
    if (!quest.walletItem) {
      closeQuestDetails();
      return;
    }

    const claimed = await handleRewardWalletItem(quest.walletItem);
    if (claimed) {
      closeQuestDetails();
    }
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
      const createdRewards =
        result.checkIn.processResult.summary.createdRewards;
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
          buildCheckInErrorDialog(
            message,
            latestSummaryRef.current.generatedAt,
          ),
        ]);
      }
    } finally {
      setCheckInPending(false);
    }
  }

  function showLootboxOverlay(card: HomeLootCard) {
    lootboxOpenRunRef.current += 1;
    lootboxOverlayWalletItemRef.current = null;
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

  async function beginRewardWalletLootboxOpening(
    item: GuestPortalRewardWalletItem,
  ): Promise<boolean> {
    if (
      item.action !== "OPEN_LOOT_BOX" ||
      !isRewardWalletItemActionable(item) ||
      walletActionPendingRef.current ||
      walletClaimingItemId
    ) {
      return false;
    }

    const currentSummary = latestSummaryRef.current;
    const currentCard = rewardWalletLootboxCard(item, currentSummary);
    const runId = lootboxOpenRunRef.current + 1;

    lootboxOpenRunRef.current = runId;
    lootboxOverlayWalletItemRef.current = item;
    walletActionPendingRef.current = true;
    setWalletClaimingItemId(item.id);
    setUnavailableLootboxCard(null);
    setUnavailableLootboxMessage(null);
    setLootboxOverlayCard(currentCard);
    setLootboxRoulette(null);
    setLootboxOverlayError(null);
    setLootboxOverlayPhase("charging");
    emitLootboxEvent("overlay-open", { lootBoxId: currentCard.id });
    emitLootboxEvent("charge-start", { lootBoxId: currentCard.id });
    showToast("Контейнер активируется.");
    const imageWarmup = preloadLootboxPrizeImages(currentCard.possibleRewards);

    try {
      const [result] = await Promise.all([
        openGameRewardWalletLootBox(item.id),
        wait(LOOTBOX_CHARGE_MIN_MS),
      ]);

      if (lootboxOpenRunRef.current !== runId) {
        return false;
      }

      const nextCard = openedLootboxCard(currentCard, result);
      const roulette = buildLootboxRouletteState({
        currentCard,
        nextCard,
        previousSummary: currentSummary,
        result,
        runId,
      });
      await Promise.all([
        imageWarmup,
        preloadLootboxPrizeImages(result.rewards),
      ]);

      if (lootboxOpenRunRef.current !== runId) {
        return false;
      }

      applySummaryWithCompletionDialogs(result.summary);
      setLootboxOverlayCard(nextCard);
      setLootboxRoulette(roulette);
      setLootboxOverlayPhase("rolling");
      showToast("Маячок выбирает награду.");
      return true;
    } catch (error) {
      if (lootboxOpenRunRef.current !== runId) {
        return false;
      }

      const message = lootboxOpeningErrorMessage(error);
      setLootboxRoulette(null);
      setLootboxOverlayPhase("ready");
      setLootboxOverlayError(message);
      showToast(message);
      return false;
    } finally {
      walletActionPendingRef.current = false;
      setWalletClaimingItemId(null);
    }
  }

  async function handleRewardWalletItem(
    item: GuestPortalRewardWalletItem,
  ): Promise<boolean> {
    if (!isRewardWalletItemActionable(item)) {
      return false;
    }

    if (item.action === "OPEN_LOOT_BOX") {
      return beginRewardWalletLootboxOpening(item);
    }

    if (
      item.action !== "CLAIM_REWARD" ||
      walletActionPendingRef.current ||
      walletClaimingItemId
    ) {
      return false;
    }

    walletActionPendingRef.current = true;
    setWalletClaimingItemId(item.id);

    try {
      const nextSummary = await claimGameRewardWalletItem(item.id);

      applySummaryWithCompletionDialogs(nextSummary);
      showToast(`Награда «${item.rewardLabel}» отправлена на начисление.`);
      return true;
    } catch (error) {
      showToast(
        getErrorMessage(
          error,
          "Не удалось получить награду. Попробуйте ещё раз.",
        ),
      );
      return false;
    } finally {
      walletActionPendingRef.current = false;
      setWalletClaimingItemId(null);
    }
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
        const message = "Лутбокс больше не найден в игровом модуле.";

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
      const imageWarmup = preloadLootboxPrizeImages(
        refreshedCard.possibleRewards,
      );

      const openRequest =
        refreshedCard.walletReady && refreshedCard.walletItemId
          ? openGameRewardWalletLootBox(refreshedCard.walletItemId)
          : openGameLootBox(refreshedCard.id);
      const [result] = await Promise.all([
        openRequest,
        wait(LOOTBOX_CHARGE_MIN_MS),
      ]);

      if (lootboxOpenRunRef.current !== runId) {
        return;
      }

      const nextCard = openedLootboxCard(currentCard, result);
      const roulette = buildLootboxRouletteState({
        currentCard,
        nextCard,
        previousSummary: summary,
        result,
        runId,
      });
      await Promise.all([
        imageWarmup,
        preloadLootboxPrizeImages(result.rewards),
      ]);

      if (lootboxOpenRunRef.current !== runId) {
        return;
      }

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

      const message = lootboxOpeningErrorMessage(error);
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

  function beginActiveLootboxOpening() {
    const walletItem = lootboxOverlayWalletItemRef.current;

    if (walletItem) {
      void beginRewardWalletLootboxOpening(walletItem);
      return;
    }

    void beginLootboxOpening();
  }

  function refreshActiveLootboxConditions() {
    const walletItem = lootboxOverlayWalletItemRef.current;

    if (walletItem) {
      void beginRewardWalletLootboxOpening(walletItem);
      return;
    }

    void refreshLootboxOverlayConditions();
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
    lootboxOverlayWalletItemRef.current = null;
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
        : {
            lootBoxId: lootboxOverlayCard.id,
            reward: lootboxOverlayCard.description,
          },
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

  const tutorial = useGameTutorial({
    seenVersion: summary.profile.tutorialSeenVersion,
    blocked: Boolean(
      lootboxOverlayCard ||
        unavailableLootboxCard ||
        questDetails ||
        activeCompletionDialog ||
        questsExpanded,
    ),
  });

  return (
    <div className="lp-club-home">
      <GameModuleTopbar summary={summary} onTutorialOpen={tutorial.start} />

      <div
        ref={shellRef}
        className={[
          "lp-club-shell",
          questsExpanded ? "is-quests-expanded" : "",
        ].join(" ")}
      >
        <div className="lp-club-main-flow">
          <section className="lp-club-stage" aria-label="Главный блок клуба">
            <HomeBannerGrid banners={homeBanners} onToast={showToast} />
          </section>

          <HomeLootBoxes
            sectionRef={lootBoxesRef}
            cards={lootCards}
            refreshPending={summaryRefreshPending}
            onRefresh={() => void refreshGameSummary()}
            onSelect={openLootboxOverlay}
          />

          {summary.battlePass.active?.levels.length ? (
            <HomeBattlePass
              sectionRef={battlePassRef}
              summary={summary}
              battlePass={summary.battlePass.active}
              quests={battleQuests}
              progress={battlePassProgress}
              rewardLabel={mainRewardLabel}
              seasonName={summary.battlePass.active.name}
            />
          ) : null}
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
          rewardWallet={rewardWallet}
          rewardWalletPulsing={rewardWalletPulse}
          questsExpanded={questsExpanded}
          promoCode={promoCode}
          nicknamePending={nicknamePending}
          onPromoCodeChange={setPromoCode}
          onPromoSubmit={handlePromoSubmit}
          onNicknameSubmit={handleNicknameSubmit}
          onCheckIn={handleCheckIn}
          onRewardWalletOpen={() => router.push("/game/rewards?view=pending")}
          onQuestClick={handleQuestClick}
          onQuestsToggle={toggleQuestsExpanded}
        />

        <QuestBoard
          quests={questBoardQuests}
          total={questBoardPage?.total ?? summary.missions.total}
          loading={questBoardLoading}
          error={questBoardError}
          nextOffset={questBoardPage?.nextOffset ?? null}
          expanded={questsExpanded}
          style={questBoardStyle}
          onClose={closeQuestBoard}
          onQuestClick={handleQuestClick}
          onLoadMore={() => {
            void loadQuestBoardPage(
              questBoardPage?.nextOffset ?? 0,
              Boolean(questBoardPage),
            );
          }}
        />
      </div>

      <div
        className={["lp-club-toast", toastMessage ? "is-visible" : ""].join(
          " ",
        )}
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
          checkingConditions={
            summaryRefreshPending || walletClaimingItemId !== null
          }
          rewardRef={lootboxRewardRef}
          onOpen={beginActiveLootboxOpening}
          onClose={closeLootboxOverlay}
          onCollect={collectLootboxReward}
          onRefreshConditions={refreshActiveLootboxConditions}
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

      {questDetails ? (
        <QuestDetailsModal
          quest={questDetails}
          claiming={walletClaimingItemId === questDetails.walletItem?.id}
          onClose={closeQuestDetails}
          onClaim={handleQuestRewardClaim}
        />
      ) : null}

      {activeCompletionDialog?.kind === "BATTLE_PASS" ? (
        <BattlePassLevelCompletionModal
          completion={activeCompletionDialog.completion}
          acknowledging={completionDialogAcknowledging}
          errorMessage={completionDialogError}
          onAcknowledge={acknowledgeActiveCompletionDialog}
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
          acknowledging={completionDialogAcknowledging}
          errorMessage={completionDialogError}
          onAcknowledge={acknowledgeActiveCompletionDialog}
        />
      ) : null}

      {tutorial.open ? (
        <GameTutorial clubName={summary.store.name} onClose={tutorial.close} />
      ) : null}
    </div>
  );
}

function QuestCompletionModal({
  completion,
  acknowledging,
  errorMessage,
  onAcknowledge,
}: {
  completion: QuestCompletionDialog;
  acknowledging: boolean;
  errorMessage: string | null;
  onAcknowledge: (openRewards: boolean) => void;
}) {
  return (
    <div
      className="lp-quest-complete-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="questCompleteTitle"
    >
      <div
        className={[
          "lp-quest-complete-dialog",
          completion.rewardLootBox ? "has-lootbox-preview" : "",
        ].join(" ")}
      >
        <span className="lp-quest-complete-kicker">Квест выполнен</span>
        <h3 id="questCompleteTitle">{completion.title}</h3>
        <div className="lp-quest-complete-reward">
          <span>Награда</span>
          <strong>{completion.rewardLabel}</strong>
        </div>
        {completion.rewardLootBox ? (
          <RewardLootBoxPreview lootBox={completion.rewardLootBox} />
        ) : null}
        <div className="lp-quest-complete-meta">
          <span>{completion.statusLabel}</span>
          <span>{formatDate(completion.receivedAt)}</span>
        </div>
        {errorMessage ? (
          <p className="lp-completion-ack-error" role="alert">
            {errorMessage}
          </p>
        ) : null}
        <div className="lp-completion-ack-actions">
          <button
            type="button"
            className="lp-completion-ack-secondary"
            onClick={() => onAcknowledge(true)}
            disabled={acknowledging}
          >
            Посмотреть награды
          </button>
          <button
            type="button"
            className="lp-quest-complete-action"
            onClick={() => onAcknowledge(false)}
            disabled={acknowledging}
          >
            {acknowledging ? "Закрываем..." : "Отлично"}
          </button>
        </div>
      </div>
    </div>
  );
}

function QuestDetailsModal({
  quest,
  claiming,
  onClose,
  onClaim,
}: {
  quest: PlayerQuest;
  claiming: boolean;
  onClose: () => void;
  onClaim: (quest: PlayerQuest) => Promise<void>;
}) {
  const preview = claiming
    ? {
        ...quest.preview,
        actionText: quest.walletItem
          ? rewardWalletItemPendingActionLabel(quest.walletItem)
          : "Закрываем…",
      }
    : quest.preview;
  const walletActionDisabled = Boolean(
    quest.walletItem && !isRewardWalletItemActionable(quest.walletItem),
  );

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="lp-quest-complete-overlay lp-lootbox-unavailable-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="questDetailsTitle"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) {
          onClose();
        }
      }}
    >
      <div
        className={[
          "lp-quest-complete-dialog lp-quest-details-dialog",
          quest.rewardLootBox ? "has-lootbox-preview" : "",
        ].join(" ")}
      >
        <h3 id="questDetailsTitle" className="sr-only">
          {quest.title}
        </h3>
        <fieldset
          className="m-0 min-w-0 border-0 p-0"
          disabled={claiming || walletActionDisabled}
          aria-busy={claiming}
        >
          <GuestMissionPreview
            data={preview}
            mode="full"
            showLabels={false}
            className="!p-0"
            onHeroIconAction={onClose}
            rewardDetails={
              quest.rewardLootBox ? (
                <RewardLootBoxPreview lootBox={quest.rewardLootBox} />
              ) : null
            }
            onAction={() => {
              if (claiming) {
                return;
              }

              if (quest.walletItem) {
                if (!isRewardWalletItemActionable(quest.walletItem)) {
                  return;
                }

                void onClaim(quest);
                return;
              }

              onClose();
            }}
          />
        </fieldset>
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
                <span className="lp-club-banner-copy">
                  {banner.description}
                </span>
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

function useRewardWalletPulse(
  wallet: GuestPortalRewardWallet,
  profileId: string | null,
) {
  const [pulsing, setPulsing] = useState(false);
  const itemIdSignature = wallet.items
    .map((item) => item.id)
    .sort()
    .join(",");

  useEffect(() => {
    const currentItemIds = itemIdSignature ? itemIdSignature.split(",") : [];
    const storageKey = `leetplus:reward-wallet-pulse:v${REWARD_WALLET_PULSE_STORAGE_VERSION}:${profileId ?? "anonymous"}`;
    let seen: ReturnType<typeof readRewardWalletPulseState> = null;

    try {
      seen = readRewardWalletPulseState(
        window.localStorage.getItem(storageKey),
      );
    } catch {
      // A disabled storage must not block the reward wallet.
    }

    const current = {
      version: REWARD_WALLET_PULSE_STORAGE_VERSION,
      count: wallet.pendingCount,
      itemIds: currentItemIds,
    };
    const hasNewReward =
      wallet.pendingCount > 0 &&
      (!seen ||
        wallet.pendingCount > seen.count ||
        currentItemIds.some((itemId) => !seen.itemIds.includes(itemId)));

    try {
      window.localStorage.setItem(storageKey, JSON.stringify(current));
    } catch {
      // The pulse still works for the current render without persistence.
    }

    if (
      !hasNewReward ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => setPulsing(true));
    const timerId = window.setTimeout(() => setPulsing(false), 1100);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(timerId);
      setPulsing(false);
    };
  }, [itemIdSignature, profileId, wallet.pendingCount]);

  return pulsing;
}

function readRewardWalletPulseState(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as {
      version?: unknown;
      count?: unknown;
      itemIds?: unknown;
    };

    if (
      parsed.version !== REWARD_WALLET_PULSE_STORAGE_VERSION ||
      typeof parsed.count !== "number" ||
      !Array.isArray(parsed.itemIds) ||
      !parsed.itemIds.every((itemId) => typeof itemId === "string")
    ) {
      return null;
    }

    return {
      count: parsed.count,
      itemIds: parsed.itemIds as string[],
    };
  } catch {
    return null;
  }
}

function rewardWalletItemCompactStatus(item: GuestPortalRewardWalletItem) {
  if (item.action === "CLAIM_REWARD") {
    return item.status === "FAILED" ? "Повторить" : "Забрать";
  }

  if (item.action === "OPEN_LOOT_BOX") {
    return item.status === "FAILED" ? "Повторить" : "Открыть";
  }

  return item.status === "OPENING" ? "Открываем…" : "Начисляем…";
}

function checkInRewardWalletLabel(item: GuestPortalRewardWalletItem) {
  const rewardLabel = item.rewardLabel.trim();
  const signedRewardLabel = /^[+\u2212-]/u.test(rewardLabel)
    ? rewardLabel
    : `+${rewardLabel}`;
  const statusLabel =
    item.status === "PENDING"
      ? "НЕ ПОЛУЧЕНО"
      : item.status === "FAILED"
        ? "НЕ ПОЛУЧЕНО · ПОВТОРИТЬ"
        : item.status === "PROCESSING"
          ? "НАЧИСЛЯЕТСЯ"
          : "ОТКРЫВАЕТСЯ";

  return `${signedRewardLabel} — ${statusLabel}`;
}

function selectPreferredRewardWalletItem(
  items: GuestPortalRewardWalletItem[],
  predicate: (item: GuestPortalRewardWalletItem) => boolean,
) {
  return orderedRewardWalletItems(items.filter(predicate))[0] ?? null;
}

function orderedPlayerQuests(quests: PlayerQuest[]) {
  return quests
    .map((quest, index) => ({ quest, index }))
    .sort((left, right) => {
      const leftPriority = left.quest.walletItem
        ? rewardWalletItemPriority(left.quest.walletItem)
        : 7;
      const rightPriority = right.quest.walletItem
        ? rewardWalletItemPriority(right.quest.walletItem)
        : 7;

      return leftPriority - rightPriority || left.index - right.index;
    })
    .map(({ quest }) => quest);
}

function RewardWalletCard({
  wallet,
  pulsing,
  onOpen,
}: {
  wallet: GuestPortalRewardWallet;
  pulsing: boolean;
  onOpen: () => void;
}) {
  return (
    <section
      className={["lp-club-reward-wallet", pulsing ? "is-pulsing" : ""].join(
        " ",
      )}
      aria-label={`${formatNumber(wallet.pendingCount)} наград ожидают получения`}
    >
      <div className="lp-club-reward-wallet-head">
        <span className="lp-club-reward-wallet-icon" aria-hidden="true">
          <WalletCaseIcon />
        </span>
        <strong>Награды ждут вас</strong>
        <span className="lp-club-reward-wallet-count">
          {formatNumber(wallet.pendingCount)}
        </span>
      </div>
      <p>У вас есть неполученные награды</p>
      <button
        type="button"
        className="lp-club-reward-wallet-primary"
        onClick={onOpen}
      >
        Забрать награды
      </button>
      <Link href="/game/rewards" className="lp-club-reward-wallet-history">
        История наград
      </Link>
      <small>
        Награды хранятся {formatNumber(wallet.retentionDays || 30)} дней
      </small>
    </section>
  );
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
  rewardWallet,
  rewardWalletPulsing,
  questsExpanded,
  promoCode,
  nicknamePending,
  onPromoCodeChange,
  onPromoSubmit,
  onNicknameSubmit,
  onCheckIn,
  onRewardWalletOpen,
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
  rewardWallet: GuestPortalRewardWallet;
  rewardWalletPulsing: boolean;
  questsExpanded: boolean;
  promoCode: string;
  nicknamePending: boolean;
  onPromoCodeChange: (value: string) => void;
  onPromoSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onNicknameSubmit: (displayName: string) => Promise<void>;
  onCheckIn: () => void;
  onRewardWalletOpen: () => void;
  onQuestClick: (quest: PlayerQuest) => void;
  onQuestsToggle: () => void;
}) {
  const compactQuests = orderedPlayerQuests(quests).slice(0, 5);
  const checkInDescription =
    checkInAction?.description ??
    checkInSummary?.description ??
    "Зафиксируйте присутствие в выбранном клубе.";
  const [nicknameEditing, setNicknameEditing] = useState(false);
  const [nicknameDraft, setNicknameDraft] = useState(
    summary.profile.displayName,
  );
  const nicknameInputRef = useRef<HTMLInputElement | null>(null);
  const levelProgress = buildPlayerLevelProgress(summary.profile);
  const phoneMasked = formatPlayerPhoneMasked(summary.profile.contactMasked);
  const pendingCheckInItem = selectPreferredRewardWalletItem(
    rewardWallet.items,
    (item) =>
      item.sourceKind === "CHECK_IN" && item.storeId === summary.store.id,
  );

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
    <aside
      id="profile"
      className="lp-club-profile-panel"
      aria-label="Профиль игрока"
    >
      <div className="lp-club-profile-logo">
        <div
          className={[
            "lp-club-avatar",
            profileLogoUrl ? "is-custom-logo" : "",
          ].join(" ")}
          title={profileLogoUrl ? profileLogoTitle : undefined}
          aria-hidden="true"
        >
          {profileLogoUrl ? (
            <img src={profileLogoUrl} alt="" />
          ) : (
            <ProfileIcon />
          )}
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
          <span>до следующего {formatNumber(levelProgress.remaining)} XP</span>
        </div>
        <GameRatingTeaser />
      </div>

      {rewardWallet.pendingCount > 0 ? (
        <RewardWalletCard
          wallet={rewardWallet}
          pulsing={rewardWalletPulsing}
          onOpen={onRewardWalletOpen}
        />
      ) : (
        <Link
          href="/game/rewards"
          className="lp-club-reward-wallet-history is-standalone"
        >
          История наград
        </Link>
      )}

      {checkInAvailable || pendingCheckInItem ? (
        <section className="lp-club-checkin-card" aria-label="Чекин в клубе">
          <span className="lp-club-small-label">Чекин</span>
          <strong>
            {checkInAction?.title ?? checkInSummary?.title ?? "Чекин в клубе"}
          </strong>
          <p>{checkInDescription}</p>
          {pendingCheckInItem ? (
            <span
              className="lp-club-checkin-pending"
              title={rewardWalletItemStatusHint(pendingCheckInItem)}
              role="status"
              aria-live="polite"
            >
              {checkInRewardWalletLabel(pendingCheckInItem)}
            </span>
          ) : null}
          {checkInAvailable ? (
            <button type="button" disabled={checkInPending} onClick={onCheckIn}>
              {checkInPending ? "Проверяем" : "Сделать чекин"}
            </button>
          ) : null}
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
              {formatNumber(completedQuestCount)} /{" "}
              {formatNumber(questTotalCount)}
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
            compactQuests.map((quest) => (
              <button
                key={quest.id}
                type="button"
                className={[
                  "lp-club-side-quest",
                  quest.status === "done" ? "is-done" : "",
                  quest.status === "live" ? "is-current" : "",
                  quest.walletItem ? "has-wallet-reward" : "",
                ].join(" ")}
                aria-haspopup="dialog"
                onClick={() => onQuestClick(quest)}
              >
                <GuestMissionPreview
                  data={quest.preview}
                  mode="compact"
                  showLabels={false}
                  className="!m-0 !w-full !max-w-full !p-0"
                />
                {quest.walletItem ? (
                  <span className="lp-club-side-quest-claim">
                    {rewardWalletItemCompactStatus(quest.walletItem)}
                  </span>
                ) : null}
              </button>
            ))
          ) : (
            <p className="lp-club-quest-empty">Пока нет доступных заданий.</p>
          )}
        </div>
      </section>
    </aside>
  );
}

function QuestBoard({
  quests,
  total,
  loading,
  error,
  nextOffset,
  expanded,
  style,
  onClose,
  onQuestClick,
  onLoadMore,
}: {
  quests: PlayerQuest[];
  total: number;
  loading: boolean;
  error: string | null;
  nextOffset: number | null;
  expanded: boolean;
  style: QuestBoardStyle;
  onClose: () => void;
  onQuestClick: (quest: PlayerQuest) => void;
  onLoadMore: () => void;
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
            Показано {formatNumber(quests.length)} из {formatNumber(total)}{" "}
            задач клуба, сгруппированных по состоянию.
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
                    quest.walletItem ? "has-wallet-reward" : "",
                  ].join(" ")}
                  disabled={!expanded}
                  aria-haspopup="dialog"
                  onClick={() => onQuestClick(quest)}
                >
                  <GuestMissionPreview
                    data={quest.preview}
                    mode="compact"
                    showLabels={false}
                    className="!m-0 !w-full !max-w-full !p-0"
                  />
                  {quest.walletItem ? (
                    <span className="lp-club-side-quest-claim">
                      {rewardWalletItemCompactStatus(quest.walletItem)}
                    </span>
                  ) : null}
                </button>
              ))
            ) : (
              <div className="lp-club-quest-group-empty">Пока пусто</div>
            )}
          </section>
        ))}

        <div className="lp-club-quest-board-pagination">
          {error ? <p role="alert">{error}</p> : null}
          {nextOffset !== null || error ? (
            <button
              type="button"
              className="lp-club-quest-board-load-more"
              disabled={!expanded || loading}
              onClick={onLoadMore}
            >
              {loading ? "Загружаем…" : error ? "Повторить" : "Показать ещё"}
            </button>
          ) : loading ? (
            <p role="status">Загружаем задания…</p>
          ) : null}
        </div>
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
  const featuredMissions = summary.missions.featured;
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
      tag: featuredMission
        ? `${formatNumber(featuredMission.xpReward)} XP`
        : "регистрация",
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
      title: summary.battlePass.active?.name ?? "Боевой пропуск",
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
  const walletLootBoxItems = new Map<string, GuestPortalRewardWalletItem>();

  for (const item of gameRewardWallet(summary).items) {
    if (item.kind !== "LOOT_BOX_ENTITLEMENT") {
      continue;
    }

    const lootBoxId =
      item.lootBoxId ?? (item.sourceKind === "LOOT_BOX" ? item.sourceId : null);

    if (!lootBoxId) {
      continue;
    }

    const currentItem = walletLootBoxItems.get(lootBoxId);
    if (
      !currentItem ||
      (!isRewardWalletItemActionable(currentItem) &&
        isRewardWalletItemActionable(item)) ||
      (currentItem.status === "FAILED" && item.status === "PENDING")
    ) {
      walletLootBoxItems.set(lootBoxId, item);
    }
  }

  const realCards = summary.lootBoxes.featured.slice(0, 3).map((lootBox) => {
    const walletItem = walletLootBoxItems.get(lootBox.id) ?? null;
    const walletReady = walletItem?.action === "OPEN_LOOT_BOX";
    const walletStatus = walletItem?.status ?? null;

    return {
      id: lootBox.id,
      title: lootBox.name,
      description:
        lootBox.latestReward?.rewardLabel ??
        lootBox.rewardLabel ??
        "Лутбокс с наградой за активность в клубе.",
      triggerKind: lootBox.triggerKind,
      sessionType: lootBox.sessionType,
      schedule: lootBox.schedule,
      status: lootboxCardStatus(lootBox, walletReady, walletStatus),
      active: false,
      openable: walletReady || lootBox.openable,
      openState: walletReady ? "OPENABLE" : lootBox.openState,
      openBlocker: walletReady ? null : lootBox.openBlocker,
      rewardLabel: lootBox.rewardLabel,
      possibleRewards: lootBox.possibleRewards,
      caseRarity: normalizeLootboxRarity(lootBox.caseRarity) ?? "common",
      caseRarityLabel:
        lootBox.caseRarityLabel ??
        LOOTBOX_CASE_RARITY_LABELS[lootBox.caseRarity],
      rewardRarity: lootBox.latestReward?.rewardRarity ?? null,
      rewardRarityLabel: lootBox.latestReward?.rewardRarityLabel ?? null,
      rewardDropChance: lootBox.latestReward?.rewardDropChance ?? null,
      weeklyOpenedCount: lootBox.weeklyOpenedCount,
      weeklyLimit: lootBox.weeklyLimit,
      dailyOpenedCount: lootBox.dailyOpenedCount,
      dailyLimit: lootBox.dailyLimit,
      periodicLimitPeriod: lootBox.periodicLimitPeriod,
      periodicOpenedCount: lootBox.periodicOpenedCount,
      walletItemId: walletItem?.id ?? null,
      walletReady,
      walletStatus,
    };
  });
  const activeId = selectedLootId ?? realCards[0]?.id ?? null;

  return realCards.map((card) => ({
    ...card,
    active: card.id === activeId,
  }));
}

function lootboxCardStatus(
  lootBox: GuestPortalGameSummary["lootBoxes"]["featured"][number],
  walletReady: boolean,
  walletStatus: GuestPortalRewardWalletItem["status"] | null,
) {
  if (walletStatus === "OPENING") {
    return "открываем";
  }

  if (walletStatus === "PROCESSING") {
    return "начисляем";
  }

  if (walletStatus === "FAILED") {
    return walletReady ? "повторить" : "ошибка открытия";
  }

  if (walletReady) {
    return "можно открыть";
  }

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

function lootBoxUnavailableCheckMessage(card: HomeLootCard) {
  if (
    normalizeGameRuleTrigger(card.triggerKind) === "SESSION_START" &&
    normalizeGameRuleSessionType(card.sessionType) === "packet_hours"
  ) {
    return "Пакет или абонемент пока не найден. Если вы только что купили пакет или абонемент, подождите несколько секунд и нажмите проверку еще раз.";
  }

  return "Условия пока не выполнены. Если вы уже сделали нужное действие, подождите несколько секунд и проверьте еще раз.";
}

function buildPlayerQuests(
  summary: GuestPortalGameSummary,
  missions: GameMission[] = summary.missions.featured,
): PlayerQuest[] {
  const walletItems = gameRewardWallet(summary).items;

  return missions.map((mission) => {
    const status = playerQuestStatus(mission);
    const progress = playerQuestProgress(mission);
    const reward = playerQuestReward(mission);
    const walletItem = selectPreferredRewardWalletItem(
      walletItems,
      (item) => item.sourceKind === "MISSION" && item.sourceId === mission.id,
    );
    const preview = gameMissionPreviewData(mission);

    return {
      id: mission.id,
      title: mission.name,
      description: playerQuestDescription(mission, reward),
      condition: playerQuestCondition(mission, progress),
      status,
      progress,
      reward,
      walletItem,
      rewardLootBox: mission.rewardLootBox,
      preview: walletItem
        ? {
            ...preview,
            actionText: rewardWalletItemActionLabel(walletItem),
          }
        : preview,
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
  const occurredAt = processResult.event.occurredAt || result.checkIn.checkedAt;

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
        uniqueRewardLabels.length > 0 ? uniqueRewardLabels.join(" + ") : null,
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

function completionDialogsFromPendingNotifications(
  summary: GuestPortalGameSummary,
): CompletionDialogQueueItem[] {
  return sortCompletionDialogs(
    (
      summary.completionNotifications?.pending ?? []
    ).flatMap<CompletionDialogQueueItem>((notification) => {
      if (notification.kind === "MISSION") {
        const mission = [
          ...summary.missions.featured,
          ...summary.missions.history,
        ].find((item) => item.id === notification.sourceId);
        return [
          {
            key: `quest:${notification.sourceId}:${notification.occurredAt}`,
            kind: "QUEST" as const,
            occurredAt: notification.occurredAt,
            notificationId: notification.id,
            completion: {
              id: notification.sourceId,
              title: notification.title,
              rewardLabel: notification.rewardLabel,
              statusLabel: notification.statusLabel,
              receivedAt: notification.occurredAt,
              rewardLootBox: mission?.rewardLootBox ?? null,
            },
          },
        ];
      }

      const completedLevel = notification.completedLevel ?? 1;
      const rewardLootBox = summary.battlePass.active?.levels.find(
        (level) => level.level === completedLevel,
      );

      return [
        {
          key: `battle-pass:${notification.sourceId}:${completedLevel}`,
          kind: "BATTLE_PASS" as const,
          occurredAt: notification.occurredAt,
          notificationId: notification.id,
          completion: {
            seasonId: notification.seasonId ?? notification.sourceId,
            seasonName: notification.seasonName ?? notification.title,
            completedLevel,
            completedTitle: notification.completedTitle ?? "",
            rewardLabel: notification.rewardLabel,
            nextLevel: notification.nextLevel,
            nextTitle: notification.nextTitle,
            nextCondition: notification.nextCondition,
            rewardLootBox: rewardLootBox
              ? battlePassLevelLootBoxPreview(
                  rewardLootBox,
                  notification.rewardLabel,
                )
              : null,
          },
        },
      ];
    }),
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

  return sortCompletionDialogs([...questCompletions, ...battlePassCompletions]);
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
    [
      ...previousSummary.missions.featured,
      ...previousSummary.missions.history,
    ].map((mission) => [mission.id, mission]),
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
      rewardLootBox: mission.rewardLootBox,
    });
  }

  return completions;
}

function isMissionCompletedForDialog(
  mission: GameMission | GameMissionHistoryItem,
) {
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

function playerQuestReward(mission: GameMission): PlayerQuest["reward"] {
  const rewardLabel = mission.rewardLabel?.trim() ?? "";
  const rewardLabelLower = rewardLabel.toLocaleLowerCase("ru-RU");

  if (
    mission.rewardLootBox ||
    /лутбокс|кейс|контейнер/.test(rewardLabelLower)
  ) {
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

function playerQuestCondition(
  mission: GameMission,
  progress: PlayerQuest["progress"],
) {
  const isHourlyPlayTime =
    normalizeGameRuleTrigger(mission.triggerKind) === "PLAY_HOUR" &&
    normalizeGameRuleSessionType(mission.sessionType) === "regular_session";
  if (mission.conditionLabel) {
    return withHourlySessionExtensionNotice(
      mission.conditionLabel,
      isHourlyPlayTime ? mission.sessionType : null,
    );
  }

  if (normalizeGameRuleTrigger(mission.triggerKind) === "PLAY_HOUR") {
    const minutes = progress?.total ?? mission.progressTarget ?? 0;
    const sessionRequirement = isHourlyPlayTime
      ? "в отдельно начатой почасовой сессии"
      : "в игровой сессии";

    if (minutes === 60) {
      return withHourlySessionExtensionNotice(
        `Сыграйте один час ${sessionRequirement}.`,
        isHourlyPlayTime ? mission.sessionType : null,
      );
    }

    if (minutes > 0) {
      return withHourlySessionExtensionNotice(
        `Сыграйте ${formatNumber(minutes)} минут ${sessionRequirement}.`,
        isHourlyPlayTime ? mission.sessionType : null,
      );
    }
  }

  return guestActionRequirementLabel(mission.triggerKind, mission.sessionType);
}

function isGuestInternalNextAction(action: GameNextAction) {
  return action.kind === "MATCH_LANGAME";
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

function gameMissionPreviewData(mission: GameMission): GuestMissionPreviewData {
  const progress = playerQuestProgress(mission);

  return {
    title: mission.name,
    description:
      mission.description ??
      "Выполните условие квеста и получите указанную награду.",
    condition: mission.conditionLabel || missionConditionHint(mission),
    reward:
      mission.rewardStatus.rewardLabel ??
      mission.rewardLabel ??
      (mission.xpReward > 0
        ? `${mission.xpReward} XP`
        : "Без основной награды"),
    xp: mission.xpReward,
    progressCurrent: progress?.current ?? 0,
    progressTarget: progress?.total ?? 1,
    progressUnit: gameProgressUnitLabel(mission.progressUnit) ?? "",
    actionText: mission.actionText ?? "Подробнее",
    icon: mission.icon,
    theme: mission.theme,
    coverUrl: mission.coverUrl,
    products: mission.productNames,
    productMode: mission.productMode ?? undefined,
    minimumAmount: mission.minimumAmount,
  };
}

function gameActionHref(action: GameNextAction) {
  if (action.kind === "MATCH_LANGAME") {
    return "#next-actions";
  }

  return `#${action.anchor}`;
}

function gameActionButtonLabel(action: GameNextAction) {
  const labels = {
    CLAIM_REWARD: "Забрать награду",
    AWAIT_REWARD_HANDOFF: "Мои награды",
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
    summary.nextActions.some((action) => action.kind === "CHECK_IN")
  );
}

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
  GuestPortalGameMissionPage,
  GuestPortalGameSummary,
  GuestPortalLootBoxRarity,
  GuestPortalRewardLootBoxPreview,
  GuestPortalRewardWallet,
  GuestPortalRewardWalletHistoryItem,
  GuestPortalRewardWalletItem,
} from "@/lib/guest-portal";
import {
  isHttpExternalActionUrl,
  isInternalHref,
  normalizeExternalActionUrl,
} from "@/lib/external-links";
import { lootboxSkinForRarity } from "@/lib/lootbox-assets";
import {
  GuestMissionPreview,
  type GuestMissionPreviewData,
} from "@/components/guest-mission-preview";
import { appendHourlySessionSourceNotice } from "@/components/hourly-session-source-note";
import {
  LootBoxPrizeVisual,
  lootBoxPrizeCardColorStyle,
} from "@/components/lootbox-prize-visual";
import { startNavigationFeedback } from "@/components/navigation-feedback";
import { GuestBugReportButton } from "@/components/guest-bug-report";
import { GuestSupportTickets } from "@/components/guest-support-tickets";
import { GameRatingTeaser } from "./game-rating-client";
import { clubHomeCss } from "./_game/club-home-css";
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
  HomeBattleQuest,
  BattlePassRewardCard,
  CheckInCompletionDialog,
  BattlePassLevelCompletionDialog,
  GameRewardHistoryItem,
  GameMission,
  GameMissionHistoryItem,
  BattlePassDetailProgress,
  HomeBattlePassLevel,
  HomeBattlePassSeason,
  BattlePassRewardStatus,
  BattlePassEventName,
  BattlePassRewardType,
  GameNextAction,
  BannerTitleStyle,
  GuestPortalLootBoxOpenResponse,
  QuestStatus,
  GameJourneyStep,
  RewardHistorySourceFilter,
  RewardHistoryRarityFilter,
  RewardHistorySource,
  GameRewardWalletState,
  GameBonusHistoryItem,
  LootboxRouletteReward,
  LootboxOpenReward,
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
  formatChancePercent,
  formatDate,
  joinRussianList,
} from "./_game/format";
import {
  GUEST_GAME_AUTH_REQUIRED_MESSAGE,
  EMPTY_REWARD_WALLET,
  LOOTBOX_CHARGE_MIN_MS,
  LOOTBOX_CASE_OPEN_MS,
  QUEST_BOARD_PAGE_SIZE,
  LOOTBOX_RARITY_LABELS,
  REWARD_WALLET_PULSE_STORAGE_VERSION,
  EMPTY_LOOTBOX_SCHEDULE,
  LOOTBOX_CASE_RARITY_LABELS,
  LEVEL_XP_STEP,
  REWARD_HISTORY_PAGE_SIZE,
  REWARD_HISTORY_SOURCE_ORDER,
  REWARD_HISTORY_SOURCE_LABELS,
  REWARD_HISTORY_RARITY_ORDER,
  REWARD_HISTORY_RARITY_LABELS,
  REWARD_HISTORY_SOURCE_ROW_LABELS,
  REWARD_HISTORY_SOURCE_TONES,
  REWARD_HISTORY_RARITY_ROW_LABELS,
  LOOTBOX_ROULETTE_MS,
  LOOTBOX_ROULETTE_FALLBACK_REWARDS,
} from "./_game/constants";
import {
  debugGuestGame,
  debugSummarySnapshot,
  debugHomeLootCard,
} from "./_game/debug";

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

function GameModuleTopbar({ summary }: { summary: GuestPortalGameSummary }) {
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

  return (
    <div className="lp-club-home">
      <GameModuleTopbar summary={summary} />

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

        <div className="lp-lootbox-unavailable-drops">
          <span>Что может выпасть</span>
          <LootBoxDropChanceList possibleRewards={card.possibleRewards} />
        </div>

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

function LootBoxDropChanceList({
  possibleRewards,
}: {
  possibleRewards: GuestPortalRewardLootBoxPreview["possibleRewards"];
}) {
  return (
    <ul className="lp-lootbox-drop-chance-list">
      {possibleRewards.map((reward) => (
        <li key={`${reward.rewardLabel}:${reward.chancePercent}`}>
          <span data-rarity={reward.rarity} aria-hidden="true" />
          <strong>{reward.rewardLabel}</strong>
          <em>{formatChancePercent(reward.chancePercent)}</em>
        </li>
      ))}
    </ul>
  );
}

function RewardLootBoxPreview({
  lootBox,
}: {
  lootBox: GuestPortalRewardLootBoxPreview;
}) {
  return (
    <div className="lp-reward-lootbox-preview">
      <div className="lp-reward-lootbox-media">
        <Image
          src={lootboxSkinForRarity(lootBox.caseRarity)}
          alt={`Кейс ${lootBox.name}`}
          width={1024}
          height={1024}
          sizes="(max-width: 520px) 148px, 180px"
          draggable={false}
        />
        <span>{lootBox.caseRarityLabel} кейс</span>
        <strong>{lootBox.name}</strong>
      </div>
      <div className="lp-lootbox-unavailable-drops lp-reward-lootbox-drops">
        <span>Что может выпасть</span>
        <LootBoxDropChanceList possibleRewards={lootBox.possibleRewards} />
      </div>
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
          aria-label={
            refreshPending ? "Обновляем лутбоксы" : "Обновить лутбоксы"
          }
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
                  card.walletStatus ? "has-wallet-reward" : "",
                ].join(" ")}
                aria-haspopup="dialog"
                aria-controls={
                  card.openable ? "lootboxOverlay" : "lootboxUnavailable"
                }
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
                    <span
                      className={[
                        "lp-lootbox-entry-state",
                        card.walletReady ? "is-wallet-ready" : "",
                      ].join(" ")}
                    >
                      {card.status}
                    </span>
                    {blockedReason ? (
                      <span className="lp-lootbox-blocker-chip">почему?</span>
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
                  {card.walletStatus ? (
                    <span className="lp-lootbox-wallet-ready">
                      <ClubIcon />
                      {lootboxWalletStatusLabel(
                        card.walletStatus,
                        card.walletReady,
                      )}
                    </span>
                  ) : (
                    <>
                      <span className="lp-lootbox-entry-hint">
                        {lootboxCardHint(card)}
                      </span>
                      <span className="lp-lootbox-mini-lock" aria-hidden="true">
                        <LockIcon />
                      </span>
                    </>
                  )}
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
    roulette?.rarityLabel ??
    card.rewardRarityLabel ??
    LOOTBOX_RARITY_LABELS[rewardRarity];
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
      const winningCard = rouletteTrack.querySelector<HTMLElement>(
        '[data-winning="true"]',
      );

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
                      style={lootBoxPrizeCardColorStyle(item)}
                      disabled={!canCollect}
                      tabIndex={canCollect ? 0 : -1}
                      aria-label={
                        canCollect
                          ? `Забрать награду ${item.reward}`
                          : undefined
                      }
                      onClick={(event) => {
                        event.stopPropagation();

                        if (canCollect) {
                          onCollect();
                        }
                      }}
                    >
                      <strong>{item.reward}</strong>
                      <LootBoxPrizeVisual
                        alt=""
                        className="lp-lootbox-roulette-visual"
                        imageUrl={item.imageUrl}
                        iconKey={item.iconKey}
                        rewardType={item.rewardType}
                      />
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
          <button
            type="button"
            className="lp-club-ghost-link"
            onClick={onClose}
          >
            Закрыть
          </button>
          <button
            type="button"
            className="lp-club-primary-link"
            disabled={
              isOpening || isCharging || isRolling || checkingConditions
            }
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
  const detailReward = detailRewardId
    ? (rewards.find((reward) => reward.id === detailRewardId) ?? null)
    : null;
  const totalLevels = Math.max(
    rewards.length,
    battlePass?.levels.length ?? 0,
    1,
  );
  const currentLevel = Math.min(
    totalLevels,
    Math.max(
      0,
      battlePass?.currentLevel ??
        currentReward?.level ??
        activeReward?.level ??
        0,
    ),
  );
  const levelLineScale =
    totalLevels > 1
      ? clampPercent(((currentLevel - 1) / (totalLevels - 1)) * 100) / 100
      : 1;
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
  } as CSSProperties &
    Record<"--battlepass-line-scale" | "--battlepass-rail-edge", string>;

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
    emitBattlePassEvent(
      "level_focus",
      battlePassRewardEventDetail(reward, battlePass),
    );
  };

  const clickReward = (reward: BattlePassRewardCard, element: HTMLElement) => {
    focusReward(reward);
    element.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
    emitBattlePassEvent(
      "reward_click",
      battlePassRewardEventDetail(reward, battlePass),
    );

    if (reward.status === "ready") {
      emitBattlePassEvent(
        "reward_claim",
        battlePassRewardEventDetail(reward, battlePass),
      );
    }

    setDetailRewardId(reward.id);
  };

  return (
    <section
      id="battlePass"
      ref={sectionRef}
      className="lp-club-panel lp-club-battlepass"
      aria-label="Боевой пропуск"
    >
      <div className="lp-club-battlepass-head">
        <span className="lp-club-battlepass-title">
          <h2>Боевой пропуск</h2>
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

      <div
        className="lp-club-battlepass-track"
        aria-label="Очередь наград боевого пропуска"
      >
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

            <div
              className="lp-club-battlepass-reward-grid"
              style={trackGridStyle}
            >
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
                    onClick={(event) =>
                      clickReward(reward, event.currentTarget)
                    }
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
                {progressQuestLabel ? (
                  <small>{progressQuestLabel}</small>
                ) : null}
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
  overview:
    | NonNullable<
        GuestPortalGameSummary["battlePass"]["active"]
      >["rewardOverview"]
    | null;
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
          Полный путь в сезоне {seasonName} открывает все награды ниже. Итог
          зависит от содержимого сезонных лутбоксов.
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
                      <span
                        className="lp-battlepass-season-guaranteed-mark"
                        aria-label={
                          reward.quantity > 1
                            ? `Гарантированная награда в количестве ${formatNumber(reward.quantity)}`
                            : "Гарантированная награда"
                        }
                      >
                        {reward.quantity > 1
                          ? `+ ×${formatNumber(reward.quantity)}`
                          : "+"}
                      </span>
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

function BattlePassLevelCompletionModal({
  completion,
  acknowledging,
  errorMessage,
  onAcknowledge,
}: {
  completion: BattlePassLevelCompletionDialog;
  acknowledging: boolean;
  errorMessage: string | null;
  onAcknowledge: (openRewards: boolean) => void;
}) {
  const hasNextLevel = completion.nextLevel !== null;

  return (
    <div
      className="lp-quest-complete-overlay lp-battlepass-detail-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="battlePassLevelCompleteTitle"
    >
      <div
        className={[
          "lp-quest-complete-dialog lp-battlepass-detail-dialog lp-battlepass-level-complete-dialog",
          completion.rewardLootBox ? "has-lootbox-preview" : "",
        ].join(" ")}
      >
        <span className="lp-quest-complete-kicker">Уровень пройден</span>
        <span className="lp-battlepass-level-complete-mark" aria-hidden="true">
          {formatNumber(completion.completedLevel)}
        </span>
        <h3 id="battlePassLevelCompleteTitle">Поздравляем!</h3>
        <p className="lp-battlepass-level-complete-lead">
          Вы прошли уровень {formatNumber(completion.completedLevel)} баттлпасса
          {completion.completedTitle ? ` — «${completion.completedTitle}»` : ""}
          .
        </p>

        <div className="lp-battlepass-detail-lines">
          <div className="lp-battlepass-detail-line is-reward">
            <span>Награда уровня</span>
            <strong>{completion.rewardLabel}</strong>
            {completion.rewardLootBox ? (
              <RewardLootBoxPreview lootBox={completion.rewardLootBox} />
            ) : null}
          </div>

          {hasNextLevel ? (
            <div className="lp-battlepass-detail-line is-current">
              <span>Следующий уровень</span>
              <strong>
                {formatNumber(completion.nextLevel ?? 0)}.{" "}
                {completion.nextTitle}
              </strong>
              <p>
                Для прохождения следующего уровня вам необходимо:{" "}
                {completion.nextCondition}
              </p>
            </div>
          ) : (
            <div className="lp-battlepass-detail-line is-current">
              <span>Сезон завершен</span>
              <strong>
                Вы прошли весь баттлпасс «{completion.seasonName}».
              </strong>
              <p>Все доступные уровни этого сезона выполнены.</p>
            </div>
          )}
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
            {acknowledging
              ? "Закрываем..."
              : hasNextLevel
                ? "К следующему уровню"
                : "Отлично"}
          </button>
        </div>
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
          aria-label="Закрыть пояснение боевого пропуска"
          onClick={onClose}
        >
          ×
        </button>
        <span className="lp-quest-complete-kicker">Как работает</span>
        <h3 id="battlePassHelpTitle">Боевой пропуск</h3>
        <p className="lp-battlepass-detail-season">
          {seasonName} · шаг {formatNumber(currentLevel)} из{" "}
          {formatNumber(totalLevels)}
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
            Боевой пропуск собирает цепочку клубных заданий и наград. Выполняйте
            текущую задачу, чтобы продвигаться по этапам сезона.
          </p>
        </div>

        <div className="lp-battlepass-detail-block">
          <span>Как проходить шаги</span>
          <ul className="lp-battlepass-help-list">
            <li>Смотрите карточку с пометкой “Сейчас”.</li>
            <li>Нажмите на этап, чтобы увидеть подробное условие и награду.</li>
            <li>
              Когда условие выполнено, прогресс сезона перейдет к следующему
              этапу.
            </li>
          </ul>
        </div>

        <div className="lp-battlepass-detail-block is-current">
          <span>Награды</span>
          <p>
            Следующая награда: {nextRewardLabel}. Главная награда сезона:{" "}
            {mainRewardLabel}, открывается на шаге{" "}
            {formatNumber(mainRewardLevel)}.
          </p>
        </div>

        {!battlePass ? (
          <p className="lp-battlepass-help-note">
            Сезон пока не запущен. Когда клуб опубликует боевой пропуск, здесь
            появятся этапы, условия и награды.
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
  const statusLabel =
    quest?.status ?? battlePassRewardStatusLabel(reward.status);
  const task = stripBattlePassDetailPrefix(
    quest?.condition ??
      reward.condition ??
      reward.description ??
      reward.subtitle,
    "Условие",
  );
  const executionCondition = stripBattlePassDetailPrefix(
    reward.executionCondition ??
      mission?.conditionLabel ??
      quest?.condition ??
      task,
    "Условие",
  );
  const plannedReward = stripBattlePassDetailPrefix(
    quest?.reward ?? reward.plannedReward ?? reward.title,
    "Награда",
  );
  const plannedRewardLootBox =
    reward.lootBoxPreview ?? mission?.rewardLootBox ?? null;
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
    task,
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
      <div
        className={[
          "lp-quest-complete-dialog lp-battlepass-detail-dialog",
          plannedRewardLootBox ? "has-lootbox-preview" : "",
        ].join(" ")}
      >
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
            <span>Описание</span>
            <p>{task}</p>
          </div>

          <div className="lp-battlepass-detail-line">
            <span>Условия выполнения</span>
            <p>{executionCondition}</p>
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
            {plannedRewardLootBox ? (
              <RewardLootBoxPreview lootBox={plannedRewardLootBox} />
            ) : null}
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
            <Link
              href="/game/rewards"
              className="lp-battlepass-reward-history-link"
            >
              Открыть историю наград
            </Link>
          </div>
        ) : reward.status === "claimed" ? (
          <div className="lp-battlepass-received-card">
            <span>Полученная награда</span>
            <p>
              Награда уже засчитана, но детальный результат не найден в текущем
              кошельке.
            </p>
            <Link
              href="/game/rewards"
              className="lp-battlepass-reward-history-link"
            >
              Открыть историю наград
            </Link>
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
  const claimCode = rewardHistoryClaimCode(reward);

  return (
    <div className="lp-battlepass-received-card">
      <span>{title}</span>
      <strong>{reward.rewardLabel}</strong>
      <p>
        {rewardHistoryValue(reward)} · {walletStateLabel(reward.walletState)}
      </p>
      {rarityLabel ? <small>{rarityLabel}</small> : null}
      {reward.rewardDropChance !== null ? (
        <small>
          Шанс выпадения: {formatRewardChance(reward.rewardDropChance)}
        </small>
      ) : null}
      {claimCode ? (
        <em>
          {claimCode.label}: {claimCode.value}
        </em>
      ) : null}
      <small>{walletStateHint(reward.walletState)}</small>
      <Link href="/game/rewards" className="lp-battlepass-reward-history-link">
        Открыть историю наград
      </Link>
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
    return findLatestRewardBySource(
      summary.rewards.recent,
      "BATTLE_PASS",
      reward.id,
    );
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
      .filter(
        (item) => item.sourceKind === sourceKind && item.sourceId === sourceId,
      )
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
  return [
    reward.type,
    reward.title,
    reward.rewardValue,
    reward.quest?.reward,
    actualReward?.rewardLabel,
  ]
    .filter(Boolean)
    .some((value) =>
      /lootbox|case|кейс|лутбокс|контейнер/i.test(String(value)),
    );
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

  const tokenLabel =
    reward.rewardValue ?? battlePassRewardTypeLabel(reward.type);
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
  const levelIndex = orderedLevels.findIndex(
    (item) => item.level === level.level,
  );
  const previousLevel = levelIndex > 0 ? orderedLevels[levelIndex - 1] : null;
  const rewardLabel =
    level.freeReward ??
    level.premiumReward ??
    level.title ??
    `Боевой пропуск, шаг ${formatNumber(level.level)}`;
  const title = level.title ?? rewardLabel;
  const rarity = inferBattlePassRewardRarity(rewardLabel);
  const type = inferBattlePassRewardType(rewardLabel);

  return {
    id: `${battlePass.id}:${level.level}`,
    level: level.level,
    title: battlePassRewardTitle(title, type),
    subtitle:
      level.condition ??
      level.description ??
      battlePassRewardSubtitle(level, type),
    condition: level.condition,
    executionCondition: level.executionCondition,
    description: level.description,
    plannedReward: rewardLabel,
    type,
    rarity,
    status: battlePassRewardStatus(level),
    image: type === "lootbox" ? lootboxSkinForRarity(rarity) : undefined,
    lootBoxPreview: battlePassLevelLootBoxPreview(level, rewardLabel),
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

function battlePassRewardStatus(
  level: HomeBattlePassLevel,
): BattlePassRewardStatus {
  if (level.reached) {
    return "claimed";
  }

  if (level.current) {
    return "current";
  }

  return "locked";
}

function battlePassLevelLootBoxPreview(
  level: HomeBattlePassLevel,
  rewardLabel?: string | null,
) {
  const normalizedRewardLabel = rewardLabel?.trim() ?? "";

  if (
    normalizedRewardLabel &&
    normalizedRewardLabel === level.premiumReward?.trim()
  ) {
    return level.premiumRewardLootBox;
  }

  if (
    normalizedRewardLabel &&
    normalizedRewardLabel === level.freeReward?.trim()
  ) {
    return level.freeRewardLootBox;
  }

  return level.freeRewardLootBox ?? level.premiumRewardLootBox ?? null;
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

function gameRewardWallet(
  summary: GuestPortalGameSummary,
): GuestPortalRewardWallet {
  const wallet = (
    summary as GuestPortalGameSummary & {
      rewardWallet?: GuestPortalRewardWallet;
    }
  ).rewardWallet;

  if (!wallet || !Array.isArray(wallet.items)) {
    return EMPTY_REWARD_WALLET;
  }

  return {
    pendingCount: Math.max(0, wallet.pendingCount),
    nextExpiresAt: wallet.nextExpiresAt,
    retentionDays: wallet.retentionDays || 30,
    items: wallet.items,
    history: Array.isArray(wallet.history) ? wallet.history : [],
  };
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

function rewardWalletSourceLabel(item: GuestPortalRewardWalletItem) {
  const labels = {
    CHECK_IN: "Ежедневный чекин",
    MISSION: "Задание",
    BATTLE_PASS: "Боевой пропуск",
    LOOT_BOX: "Лутбокс",
    MANUAL: "Награда клуба",
  } satisfies Record<GuestPortalRewardWalletItem["sourceKind"], string>;

  return labels[item.sourceKind];
}

function rewardWalletSourceCaption(item: GuestPortalRewardWalletItem) {
  const sourceLabel = rewardWalletSourceLabel(item);
  const storeName = item.storeName?.trim();

  return storeName ? `${sourceLabel} · ${storeName}` : sourceLabel;
}

function rewardWalletItemActionLabel(item: GuestPortalRewardWalletItem) {
  if (item.status === "FAILED" && item.action === "CLAIM_REWARD") {
    return "Повторить";
  }

  if (item.action === "OPEN_LOOT_BOX") {
    return item.status === "FAILED" ? "Повторить открытие" : "Открыть лутбокс";
  }

  if (item.action === "CLAIM_REWARD") {
    return "Забрать";
  }

  if (item.status === "PROCESSING") {
    return "Начисляем…";
  }

  if (item.status === "OPENING") {
    return "Открываем…";
  }

  return "Ожидает";
}

function rewardWalletItemPendingActionLabel(item: GuestPortalRewardWalletItem) {
  if (item.action === "OPEN_LOOT_BOX") {
    return "Открываем…";
  }

  if (item.status === "FAILED") {
    return "Повторяем…";
  }

  return "Получаем…";
}

function rewardWalletItemStatusLabel(item: GuestPortalRewardWalletItem) {
  if (item.status === "PROCESSING") {
    return "Начисляется";
  }

  if (item.status === "OPENING") {
    return "Открывается";
  }

  if (item.status === "FAILED") {
    return item.kind === "LOOT_BOX_ENTITLEMENT"
      ? "Не удалось открыть"
      : "Не удалось начислить";
  }

  return item.kind === "LOOT_BOX_ENTITLEMENT"
    ? "Готов к открытию"
    : "Ждёт получения";
}

function rewardWalletItemStatusHint(item: GuestPortalRewardWalletItem) {
  if (item.status === "FAILED") {
    return (
      item.errorHint?.trim() ||
      (item.kind === "LOOT_BOX_ENTITLEMENT"
        ? "Попробуйте открыть лутбокс ещё раз."
        : "Повторите получение награды.")
    );
  }

  if (item.status === "PROCESSING") {
    return "Проверяем начисление награды.";
  }

  if (item.status === "OPENING") {
    return "Лутбокс уже открывается. Результат скоро появится.";
  }

  return rewardWalletExpiryLabel(item);
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

function isRewardWalletItemActionable(item: GuestPortalRewardWalletItem) {
  return item.action === "CLAIM_REWARD" || item.action === "OPEN_LOOT_BOX";
}

function isClaimableRewardWalletItem(item: GuestPortalRewardWalletItem) {
  return (
    item.kind === "REWARD" &&
    (item.status === "PENDING" || item.status === "FAILED") &&
    item.action === "CLAIM_REWARD"
  );
}

function rewardWalletItemPriority(item: GuestPortalRewardWalletItem) {
  if (isClaimableRewardWalletItem(item)) {
    return item.status === "FAILED" ? 0 : 1;
  }

  if (
    item.action === "OPEN_LOOT_BOX" &&
    (item.status === "PENDING" || item.status === "FAILED")
  ) {
    return item.status === "FAILED" ? 2 : 3;
  }

  if (isRewardWalletItemActionable(item)) {
    return 4;
  }

  if (item.status === "FAILED") {
    return 5;
  }

  return 6;
}

function orderedRewardWalletItems(items: GuestPortalRewardWalletItem[]) {
  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const priorityDelta =
        rewardWalletItemPriority(left.item) -
        rewardWalletItemPriority(right.item);

      if (priorityDelta !== 0) {
        return priorityDelta;
      }

      const expiryDelta =
        Date.parse(left.item.expiresAt) - Date.parse(right.item.expiresAt);

      if (Number.isFinite(expiryDelta) && expiryDelta !== 0) {
        return expiryDelta;
      }

      return left.index - right.index;
    })
    .map(({ item }) => item);
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

function rewardWalletExpiryLabel(item: GuestPortalRewardWalletItem) {
  return `Доступно до ${formatDate(item.expiresAt)}`;
}

function WalletCaseIcon() {
  return (
    <Image
      src="/assets/gamification-lootbox.svg"
      alt=""
      width={24}
      height={24}
      aria-hidden="true"
    />
  );
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

function RewardWalletInboxPanel({
  wallet,
  claimingItemId,
  claimAllPending,
  onItemAction,
  onClaimAll,
}: {
  wallet: GuestPortalRewardWallet;
  claimingItemId: string | null;
  claimAllPending: boolean;
  onItemAction: (item: GuestPortalRewardWalletItem) => Promise<boolean>;
  onClaimAll: () => Promise<boolean>;
}) {
  if (wallet.pendingCount <= 0) {
    return null;
  }

  const hiddenItemCount = Math.max(
    0,
    wallet.pendingCount - wallet.items.length,
  );
  const hasClaimableItems = wallet.items.some(isClaimableRewardWalletItem);

  return (
    <section
      className="lp-club-panel lp-reward-wallet-inbox"
      aria-label="Награды, ожидающие получения"
    >
      <header className="lp-reward-wallet-inbox-head">
        <div>
          <span className="lp-club-small-label">Кошелёк наград</span>
          <h1>Награды ждут вас</h1>
          <p>
            Заберите начисления и откройте сохранённые лутбоксы. Срок хранения
            указан у каждой награды.
          </p>
        </div>
        <span className="lp-reward-wallet-inbox-count">
          {formatNumber(wallet.pendingCount)}
        </span>
      </header>

      <div className="lp-reward-wallet-inbox-list" aria-live="polite">
        {orderedRewardWalletItems(wallet.items).map((item) => (
          <article
            key={item.id}
            className={[
              "lp-reward-wallet-inbox-item",
              item.status === "FAILED" ? "is-failed" : "",
            ].join(" ")}
          >
            <span className="lp-reward-wallet-item-icon" aria-hidden="true">
              <WalletCaseIcon />
            </span>
            <div>
              <small>{rewardWalletSourceCaption(item)}</small>
              <strong>{item.title}</strong>
              <span>{item.rewardLabel}</span>
              <em className="lp-reward-wallet-item-status">
                {rewardWalletItemStatusLabel(item)}
              </em>
              <em
                className="lp-reward-wallet-item-hint"
                role={item.status === "FAILED" ? "alert" : undefined}
              >
                {rewardWalletItemStatusHint(item)}
              </em>
            </div>
            <button
              type="button"
              disabled={
                !isRewardWalletItemActionable(item) ||
                claimAllPending ||
                claimingItemId === item.id ||
                Boolean(claimingItemId)
              }
              onClick={() => void onItemAction(item).catch(() => undefined)}
            >
              {claimingItemId === item.id
                ? rewardWalletItemPendingActionLabel(item)
                : rewardWalletItemActionLabel(item)}
            </button>
          </article>
        ))}
      </div>

      {hiddenItemCount > 0 ? (
        <p className="lp-reward-wallet-inbox-more">
          Показаны первые {formatNumber(wallet.items.length)} из{" "}
          {formatNumber(wallet.pendingCount)} незавершённых наград.
        </p>
      ) : null}

      <div className="lp-reward-wallet-inbox-actions">
        {hasClaimableItems ? (
          <button
            type="button"
            disabled={claimAllPending || Boolean(claimingItemId)}
            onClick={() => void onClaimAll().catch(() => undefined)}
          >
            {claimAllPending ? "Отправляем…" : "Забрать все начисления"}
          </button>
        ) : null}
        <span>
          Лутбоксы открываются вручную, начисления могут занять некоторое время
        </span>
      </div>
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

function rewardWalletLootboxCard(
  item: GuestPortalRewardWalletItem,
  summary: GuestPortalGameSummary,
): HomeLootCard {
  const lootBoxId =
    item.lootBoxId ?? (item.sourceKind === "LOOT_BOX" ? item.sourceId : null);
  const lootBox = lootBoxId
    ? (summary.lootBoxes.featured.find(
        (candidate) => candidate.id === lootBoxId,
      ) ?? null)
    : null;
  const caseRarity =
    normalizeLootboxRarity(lootBox?.caseRarity) ??
    inferBattlePassRewardRarity(`${item.title} ${item.rewardLabel}`);

  return {
    id: lootBoxId ?? `wallet-${item.id}`,
    title: lootBox?.name ?? item.title,
    description:
      lootBox?.latestReward?.rewardLabel ??
      lootBox?.rewardLabel ??
      item.rewardLabel,
    triggerKind: lootBox?.triggerKind ?? item.sourceKind,
    sessionType: lootBox?.sessionType ?? null,
    schedule: lootBox?.schedule ?? EMPTY_LOOTBOX_SCHEDULE,
    status: "можно открыть",
    active: false,
    openable: true,
    openState: "OPENABLE",
    openBlocker: null,
    rewardLabel: lootBox?.rewardLabel ?? item.rewardLabel,
    possibleRewards: lootBox?.possibleRewards ?? [],
    caseRarity,
    caseRarityLabel:
      lootBox?.caseRarityLabel ?? LOOTBOX_CASE_RARITY_LABELS[caseRarity],
    rewardRarity: lootBox?.latestReward?.rewardRarity ?? null,
    rewardRarityLabel: lootBox?.latestReward?.rewardRarityLabel ?? null,
    rewardDropChance: lootBox?.latestReward?.rewardDropChance ?? null,
    weeklyOpenedCount: lootBox?.weeklyOpenedCount ?? 0,
    weeklyLimit: lootBox?.weeklyLimit ?? null,
    dailyOpenedCount: lootBox?.dailyOpenedCount ?? 0,
    dailyLimit: lootBox?.dailyLimit ?? null,
    periodicLimitPeriod: lootBox?.periodicLimitPeriod ?? null,
    periodicOpenedCount: lootBox?.periodicOpenedCount ?? 0,
    walletItemId: item.id,
    walletReady: true,
    walletStatus: item.status,
  };
}

function openedLootboxCard(
  currentCard: HomeLootCard,
  result: GuestPortalLootBoxOpenResponse,
): HomeLootCard {
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

  return {
    ...currentCard,
    description: rewardLabel,
    rewardLabel,
    rewardRarity,
    rewardRarityLabel,
    rewardDropChance,
    walletReady: false,
    walletStatus: "PROCESSING",
  };
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

function lootboxWalletStatusLabel(
  walletStatus: GuestPortalRewardWalletItem["status"],
  walletReady: boolean,
) {
  if (walletStatus === "OPENING") {
    return "Открываем…";
  }

  if (walletStatus === "PROCESSING") {
    return "Проверяем начисление";
  }

  if (walletStatus === "FAILED") {
    return walletReady ? "Повторить открытие" : "Не удалось открыть";
  }

  return walletReady ? "Открыть кейс" : "Проверяем доступность";
}

function lootboxOpeningErrorMessage(error: unknown) {
  const message = getErrorMessage(error, "Кейс сейчас недоступен.");
  const normalized = message.toLocaleLowerCase("ru-RU");

  if (
    normalized.includes("уже использовано") ||
    normalized.includes("уже погашено") ||
    normalized.includes("срок его хранения истёк") ||
    normalized.includes("больше недоступно")
  ) {
    return "Этот кейс уже открыт или больше недоступен. Обновите игровой модуль.";
  }

  if (
    normalized.includes("право на открытие") ||
    normalized.includes("по праву открытия") ||
    normalized.includes("право не погашено")
  ) {
    return "Кейс пока не открылся, но он остаётся у вас. Нажмите «Попробовать ещё раз».";
  }

  return message;
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
  return withHourlySessionExtensionNotice(
    `Откроется ${[
      gameRuleUnlockCondition(triggerKind, sessionType),
      lootBoxScheduleHint(schedule),
    ]
      .filter(Boolean)
      .join(" ")}.`,
    sessionType,
  );
}

function lootBoxGuestRequirementLines(card: HomeLootCard) {
  const lines = [
    guestActionRequirementLabel(card.triggerKind, card.sessionType),
  ];
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

function withHourlySessionExtensionNotice(
  label: string,
  sessionType: string | null,
) {
  return appendHourlySessionSourceNotice(
    label,
    normalizeGameRuleSessionType(sessionType) === "regular_session",
  );
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
      return withHourlySessionExtensionNotice(
        "Начните отдельную игровую сессию с почасовой оплатой.",
        sessionType,
      );
    }

    return "Начните игровую сессию в клубе.";
  }

  switch (normalized) {
    case "APP_OPEN":
      return "Откройте игровой модуль.";
    case "CHECK_IN": {
      const sessionRequirement = gameRuleSessionRequirement(sessionType);
      return withHourlySessionExtensionNotice(
        `Сделайте чекин в игровом модуле, находясь в клубе${
          sessionRequirement
            ? ` во время активной сессии ${sessionRequirement}`
            : ""
        }.`,
        sessionType,
      );
    }
    case "VISIT":
      return "Придите в клуб, чтобы система зафиксировала визит.";
    case "PLAY_HOUR":
      return normalizedSessionType === "regular_session"
        ? withHourlySessionExtensionNotice(
            "Поиграйте нужное время в отдельно начатой почасовой сессии.",
            sessionType,
          )
        : "Поиграйте нужное время в клубе.";
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
  const sessionRequirement = gameRuleSessionRequirement(sessionType);

  if (normalized === "SESSION_START") {
    return `при старте сессии${sessionRequirement ? ` ${sessionRequirement}` : ""}`;
  }

  if (normalized === "APP_OPEN") {
    return "при открытии игрового модуля";
  }

  if (normalized === "CHECK_IN") {
    return `после чекина в клубе${
      sessionRequirement
        ? ` во время активной сессии ${sessionRequirement}`
        : ""
    }`;
  }

  if (normalized === "PLAY_HOUR") {
    return `после игрового времени${
      sessionRequirement ? ` в сессии ${sessionRequirement}` : ""
    }`;
  }

  return `после события: ${gameRuleEventLabel(triggerKind)}`;
}

function gameRuleConditionLabel(
  triggerKind: string,
  sessionType: string | null,
) {
  const normalized = normalizeGameRuleTrigger(triggerKind);
  const sessionRequirement = gameRuleSessionRequirement(sessionType);

  if (normalized === "SESSION_START") {
    return withHourlySessionExtensionNotice(
      `старт сессии${sessionRequirement ? ` ${sessionRequirement}` : ""}`,
      sessionType,
    );
  }

  if (normalized === "CHECK_IN") {
    return withHourlySessionExtensionNotice(
      `чекин в клубе${
        sessionRequirement
          ? ` во время активной сессии ${sessionRequirement}`
          : ""
      }`,
      sessionType,
    );
  }

  if (normalized === "PLAY_HOUR") {
    return withHourlySessionExtensionNotice(
      `игровое время${
        sessionRequirement ? ` в сессии ${sessionRequirement}` : ""
      }`,
      sessionType,
    );
  }

  return gameRuleEventLabel(triggerKind);
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

function normalizeGameRuleTrigger(value: string) {
  return value.trim().toUpperCase();
}

function normalizeGameRuleSessionType(value: string | null) {
  const normalized = (value ?? "").trim().toLowerCase();

  if (
    [
      "packet_hours",
      "package_or_subscription",
      "package_or_subscription_session",
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
    [
      "hourly",
      "hourly_session",
      "regular_session",
      "regular",
      "common",
      "default",
    ].includes(normalized)
  ) {
    return "regular_session";
  }

  return normalized;
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
      rewardLootBox: battlePassLevelLootBoxPreview(
        completedLevel,
        completedLevel.freeReward?.trim() ||
          completedLevel.premiumReward?.trim() ||
          null,
      ),
    };
  });
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

function playerQuestProgress(mission: GameMission): PlayerQuest["progress"] {
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
  const formattedUnit = gameProgressUnitLabel(unit);
  const unitLabel = formattedUnit ? ` ${formattedUnit}` : "";

  return `${formatNumber(current)} / ${formatNumber(total)}${unitLabel}`;
}

function gameProgressUnitLabel(unit: string | null) {
  if (!unit) {
    return null;
  }

  const labels: Record<string, string> = {
    minute: "минут",
    minutes: "минут",
    min: "минут",
    hour: "часов",
    hours: "часов",
    day: "дней",
    days: "дней",
    purchase: "покупок",
    purchases: "покупок",
    "check-in": "чекинов",
    check_in: "чекинов",
    checkin: "чекинов",
    rub: "рублей",
    rouble: "рублей",
    ruble: "рублей",
  };
  const normalized = unit.trim().toLocaleLowerCase("ru-RU");

  return labels[normalized] ?? unit;
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

function missionConditionHint(mission: GameMission) {
  const condition = withHourlySessionExtensionNotice(
    mission.conditionLabel ||
      gameRuleConditionLabel(mission.triggerKind, mission.sessionType),
    mission.sessionType,
  );
  return `Условие: ${condition}${/[.!?]$/.test(condition.trim()) ? "" : "."}`;
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

function buildHomeBattleQuests(
  summary: GuestPortalGameSummary,
): HomeBattleQuest[] {
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
  const missionQuests = summary.missions.featured.map((mission) => {
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
  const firstOpenIndex = quests.findIndex(
    (quest) => quest.state !== "complete",
  );
  const currentIndex = quests.findIndex((quest) => quest.state === "current");
  const resolvedCurrentIndex =
    currentIndex >= 0 ? currentIndex : Math.max(0, firstOpenIndex);

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
      label:
        state === "current"
          ? "текущая задача"
          : state === "complete"
            ? "готово"
            : quest.label,
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
  return condition
    .replace(/^Условие:\s*/i, "")
    .replace(/\s+/g, " ")
    .slice(0, 118);
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

function BrandMark({ logoUrl }: { logoUrl?: string | null }) {
  if (logoUrl) {
    return (
      <span className="lp-club-brand-mark is-custom-logo" aria-hidden="true">
        <img src={logoUrl} alt="" />
      </span>
    );
  }

  return <span className="lp-club-brand-mark" aria-hidden="true" />;
}

function MenuIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
  );
}

function ClubIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path d="M4 9h16" />
      <path d="M6 9v10h12V9" />
      <path d="M8 9V6a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path d="M20 11a8 8 0 0 0-14.4-4.8L4 8" />
      <path d="M4 4v4h4" />
      <path d="M4 13a8 8 0 0 0 14.4 4.8L20 16" />
      <path d="M20 20v-4h-4" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path d="M7 10V8a5 5 0 0 1 10 0v2" />
      <path d="M6 10h12v10H6z" />
      <path d="M12 14v2" />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
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

function TrophyIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 21h8" />
      <path d="M12 17v4" />
      <path d="M7 4h10v5a5 5 0 0 1-10 0z" />
      <path d="M17 5h3v2a3 3 0 0 1-3 3" />
      <path d="M7 5H4v2a3 3 0 0 0 3 3" />
    </svg>
  );
}

function ExitIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path d="M10 6H6v12h4" />
      <path d="M13 8l4 4-4 4" />
      <path d="M8 12h9" />
    </svg>
  );
}

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
  const [searchQuery, setSearchQuery] = useState("");
  const [visibleRewardCount, setVisibleRewardCount] = useState(
    REWARD_HISTORY_PAGE_SIZE,
  );
  const rewardHistory = useMemo(
    () => buildCanonicalRewardHistory(summary),
    [summary],
  );
  const clubOptions = useMemo(
    () => buildRewardHistoryClubOptions(rewardHistory),
    [rewardHistory],
  );
  const effectiveActiveClub = clubOptions.some(
    (option) => option.id === activeClub,
  )
    ? activeClub
    : "all";

  const scopedRewards = useMemo(
    () =>
      effectiveActiveClub === "all"
        ? rewardHistory
        : rewardHistory.filter(
            (item) => rewardHistoryClubKey(item) === effectiveActiveClub,
          ),
    [effectiveActiveClub, rewardHistory],
  );
  const totals = useMemo(
    () => buildRewardHistoryTotals(scopedRewards),
    [scopedRewards],
  );
  const filteredRewards = useMemo(
    () =>
      filterRewardHistory(scopedRewards, {
        sourceFilter: activeSourceFilter,
        rarityFilter: activeRarityFilter,
        query: searchQuery,
      }),
    [activeSourceFilter, activeRarityFilter, scopedRewards, searchQuery],
  );
  const visibleRewards = useMemo(
    () => filteredRewards.slice(0, visibleRewardCount),
    [filteredRewards, visibleRewardCount],
  );
  const groupedRewards = useMemo(
    () => groupRewardHistory(visibleRewards),
    [visibleRewards],
  );
  const hasRewards = scopedRewards.length > 0;
  const hasMoreRewards = visibleRewards.length < filteredRewards.length;
  const hasActiveFilters =
    effectiveActiveClub !== "all" ||
    activeSourceFilter !== "all" ||
    activeRarityFilter !== "all" ||
    Boolean(searchQuery.trim());

  function toggleSourceFilter(source: RewardHistorySource) {
    setActiveSourceFilter((current) => (current === source ? "all" : source));
    setVisibleRewardCount(REWARD_HISTORY_PAGE_SIZE);
  }

  function resetRewardHistoryFilters() {
    setActiveClub("all");
    setActiveSourceFilter("all");
    setActiveRarityFilter("all");
    setSearchQuery("");
    setVisibleRewardCount(REWARD_HISTORY_PAGE_SIZE);
  }

  return (
    <section
      id="rewards"
      className={[
        "lp-club-panel lp-reward-journal",
        standalone ? "is-standalone" : "",
      ].join(" ")}
      aria-label="История наград"
    >
      <header className="lp-reward-journal-head">
        <div className="lp-reward-journal-title">
          <Link
            href={standalone ? "/game" : "#profile"}
            className="lp-reward-back-link"
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="m11.75 4.75-5.25 5.25 5.25 5.25" />
              <path d="M7 10h7" />
            </svg>
            <span>Назад в модуль</span>
          </Link>
          <h2>История наград</h2>
          <p>Все полученные награды — в одном месте.</p>
        </div>
        <span className="lp-reward-sync-pill">История обновлена</span>
      </header>

      <div
        className="lp-reward-filter-panel"
        aria-label="Фильтры истории наград"
      >
        <label className="lp-reward-scope-field">
          <span className="lp-club-small-label">Клуб</span>
          <select
            value={effectiveActiveClub}
            onChange={(event) => {
              setActiveClub(event.target.value);
              setVisibleRewardCount(REWARD_HISTORY_PAGE_SIZE);
            }}
          >
            {clubOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.scope}
              </option>
            ))}
          </select>
        </label>
        <label className="lp-reward-search">
          <span className="lp-club-small-label">Поиск</span>
          <input
            type="search"
            value={searchQuery}
            placeholder="Найти награду"
            onChange={(event) => {
              setSearchQuery(event.target.value);
              setVisibleRewardCount(REWARD_HISTORY_PAGE_SIZE);
            }}
          />
        </label>
        <div className="lp-reward-source-filter">
          <span className="lp-club-small-label">Источник</span>
          <div className="lp-reward-source-options">
            <button
              type="button"
              className={activeSourceFilter === "all" ? "is-active" : ""}
              aria-pressed={activeSourceFilter === "all"}
              onClick={() => {
                setActiveSourceFilter("all");
                setVisibleRewardCount(REWARD_HISTORY_PAGE_SIZE);
              }}
            >
              Все <span>{formatNumber(totals.total)}</span>
            </button>
            {REWARD_HISTORY_SOURCE_ORDER.filter(
              (source) => totals.source[source] > 0,
            ).map((source) => (
              <button
                key={source}
                type="button"
                className={activeSourceFilter === source ? "is-active" : ""}
                aria-pressed={activeSourceFilter === source}
                onClick={() => toggleSourceFilter(source)}
              >
                {REWARD_HISTORY_SOURCE_LABELS[source]}{" "}
                <span>{formatNumber(totals.source[source])}</span>
              </button>
            ))}
          </div>
        </div>
        <label className="lp-reward-rarity-field">
          <span className="lp-club-small-label">Редкость</span>
          <select
            value={activeRarityFilter}
            onChange={(event) => {
              setActiveRarityFilter(
                event.target.value as RewardHistoryRarityFilter,
              );
              setVisibleRewardCount(REWARD_HISTORY_PAGE_SIZE);
            }}
          >
            <option value="all">Любая</option>
            {REWARD_HISTORY_RARITY_ORDER.map((rarity) => (
              <option key={rarity} value={rarity}>
                {REWARD_HISTORY_RARITY_LABELS[rarity]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="lp-reward-reset"
          disabled={!hasActiveFilters}
          onClick={resetRewardHistoryFilters}
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M15.2 6.1A6 6 0 1 0 16 10" />
            <path d="M15.2 2.8v3.7h-3.7" />
          </svg>
          Сбросить
        </button>
      </div>

      <section className="lp-reward-list-panel" aria-label="Список наград">
        {filteredRewards.length ? (
          <div className="lp-reward-list">
            {groupedRewards.map((group) => (
              <section key={group.key} className="lp-reward-group">
                <header className="lp-reward-group-head">
                  <h3>{group.title}</h3>
                </header>
                <div className="lp-reward-group-entries">
                  {group.items.map((item) => (
                    <RewardAchievementCard key={item.id} item={item} />
                  ))}
                </div>
              </section>
            ))}
            {hasMoreRewards ? (
              <button
                type="button"
                className="lp-reward-load-more"
                onClick={() =>
                  setVisibleRewardCount(
                    (current) => current + REWARD_HISTORY_PAGE_SIZE,
                  )
                }
              >
                Показать ещё
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path d="m5.5 7.5 4.5 4.5 4.5-4.5" />
                </svg>
              </button>
            ) : null}
          </div>
        ) : (
          <p className="lp-reward-empty-copy">
            {hasRewards
              ? "Наград по выбранным условиям пока нет."
              : "Награды и начисления появятся здесь после лутбоксов, квестов, боевого пропуска или промокодов."}
          </p>
        )}
      </section>
    </section>
  );
}

function RewardAchievementCard({ item }: { item: GameRewardHistoryItem }) {
  const source = rewardHistorySource(item);
  const rarity = rewardHistoryRarity(item);
  const occurredAt = rewardHistoryOccurredAt(item);

  return (
    <article
      className={`lp-reward-achievement-card rarity-${rarity}`}
      title={`${item.sourceLabel ?? REWARD_HISTORY_SOURCE_ROW_LABELS[source]} · ${rewardHistoryClubLabel(item)} · ${walletStateLabel(item.walletState)}`}
      style={
        {
          "--source-tone": REWARD_HISTORY_SOURCE_TONES[source],
        } as CSSProperties
      }
    >
      <span className="lp-reward-timeline-dot" aria-hidden="true" />
      <time dateTime={occurredAt} className="lp-reward-achievement-time">
        {formatRewardHistoryTime(occurredAt)}
      </time>
      <span className="lp-reward-achievement-source">
        <span aria-hidden="true" />
        {REWARD_HISTORY_SOURCE_ROW_LABELS[source]}
      </span>
      <span className="lp-reward-achievement-main">
        <strong>{item.rewardLabel}</strong>
      </span>
      <span className="lp-reward-rarity-label">
        <span aria-hidden="true" />
        {REWARD_HISTORY_RARITY_ROW_LABELS[rarity]}
      </span>
      <span className="lp-reward-value">{rewardHistoryValue(item)}</span>
    </article>
  );
}

function rewardHistoryClaimCode(
  item: Pick<
    GameRewardHistoryItem,
    "walletState" | "rewardCode" | "claimPayload"
  >,
) {
  const value = (item.rewardCode ?? item.claimPayload)?.trim();

  if (!value) {
    return null;
  }

  const labels = {
    READY: "Код для получения",
    REDEEMED: "Код полученной награды",
  } satisfies Partial<Record<GameRewardWalletState, string>>;
  const label =
    item.walletState in labels
      ? labels[item.walletState as keyof typeof labels]
      : null;

  return label ? { label, value } : null;
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

function formatMissionStepProgress(step: GameMission["questSteps"][number]) {
  return `${formatNumber(step.progressCurrent)} / ${formatNumber(step.target)}`;
}

function rewardHistoryAmountFromLabel(label: string) {
  const match = label
    .replace(/\u00a0/gu, " ")
    .match(/[+-]?\d[\d\s]*(?:[.,]\d+)?/u)?.[0];

  if (!match) {
    return 0;
  }

  const amount = Number(match.replace(/\s/gu, "").replace(",", "."));
  return Number.isFinite(amount) ? amount : 0;
}

function rewardHistoryTypeFromLabel(label: string) {
  const normalized = label.toLocaleUpperCase("ru-RU");

  if (normalized.includes("XP")) {
    return "XP";
  }

  if (normalized.includes("БОНУС")) {
    return "BONUS";
  }

  if (normalized.includes("МИНУТ") || normalized.includes("ЧАС")) {
    return "PLAY_TIME";
  }

  return "REWARD";
}

function normalizeRecentRewardHistoryItem(
  item: GuestPortalGameSummary["rewards"]["recent"][number],
): GameRewardHistoryItem {
  return {
    ...item,
    sourceKind: item.sourceKind,
    storeId: item.storeId ?? null,
    storeName: item.storeName?.trim() || null,
    claimedAt: item.claimedAt ?? null,
  };
}

function normalizeWalletRewardHistoryItem(
  item: GuestPortalRewardWalletHistoryItem,
): GameRewardHistoryItem {
  return {
    id: item.id,
    status: item.status,
    walletState: walletHistoryWalletState(item.status),
    rewardType: rewardHistoryTypeFromLabel(item.rewardLabel),
    rewardAmount: rewardHistoryAmountFromLabel(item.rewardLabel),
    rewardLabel: item.rewardLabel,
    rewardRarity: null,
    rewardRarityLabel: null,
    rewardDropChance: null,
    sourceId: item.sourceId,
    sourceKind: item.sourceKind,
    sourceLabel: item.title,
    storeId: item.storeId,
    storeName: item.storeName?.trim() || null,
    rewardCode: null,
    claimPayload: null,
    qualifiedAt: item.availableAt,
    claimedAt: item.claimedAt ?? null,
    expiresAt: item.expiresAt,
  };
}

function walletHistoryWalletState(
  status: GuestPortalRewardWalletHistoryItem["status"],
): GameRewardWalletState {
  if (status === "CLAIMED") {
    return "REDEEMED";
  }

  if (status === "PENDING" || status === "FAILED") {
    return "WAITING_CLAIM";
  }

  if (status === "PROCESSING" || status === "OPENING") {
    return "DELIVERY_PROCESSING";
  }

  return "DELIVERY_PROCESSING";
}

function bonusHistoryWalletState(
  status: GameBonusHistoryItem["status"],
): GameRewardWalletState {
  if (status === "CONFIRMED") {
    return "REDEEMED";
  }

  if (status === "PENDING" || status === "PROCESSING" || status === "UNKNOWN") {
    return "DELIVERY_PROCESSING";
  }

  return "CANCELED";
}

function normalizeBonusRewardHistoryItem(
  item: GameBonusHistoryItem,
): GameRewardHistoryItem {
  return {
    // A payout shares the reward's id, so the history shows the reward once
    // (with its rarity) instead of a second "Обычное" row for the payout.
    id: item.rewardId ?? item.id,
    status: item.status,
    walletState: bonusHistoryWalletState(item.status),
    rewardType: "BONUS",
    rewardAmount: item.amount,
    rewardLabel: item.title,
    rewardRarity: null,
    rewardRarityLabel: null,
    rewardDropChance: null,
    sourceId: null,
    sourceKind: item.sourceKind,
    sourceLabel: item.sourceLabel,
    storeId: item.storeId ?? null,
    storeName: item.storeName?.trim() || null,
    rewardCode: null,
    claimPayload: null,
    qualifiedAt: item.occurredAt,
    claimedAt: item.confirmedAt,
    expiresAt: null,
  };
}

function mergeRewardHistoryItems(
  current: GameRewardHistoryItem,
  next: GameRewardHistoryItem,
) {
  const settledItem =
    next.walletState === "REDEEMED"
      ? next
      : current.walletState === "REDEEMED"
        ? current
        : null;

  return {
    ...current,
    ...next,
    status: settledItem?.status ?? next.status,
    walletState: settledItem?.walletState ?? next.walletState,
    rewardType:
      next.rewardType === "REWARD" ? current.rewardType : next.rewardType,
    rewardAmount:
      next.rewardAmount === 0 ? current.rewardAmount : next.rewardAmount,
    rewardRarity: next.rewardRarity ?? current.rewardRarity,
    rewardRarityLabel: next.rewardRarityLabel ?? current.rewardRarityLabel,
    rewardDropChance: next.rewardDropChance ?? current.rewardDropChance,
    sourceId: next.sourceId ?? current.sourceId,
    sourceLabel: next.sourceLabel ?? current.sourceLabel,
    storeId: next.storeId ?? current.storeId,
    storeName: next.storeName ?? current.storeName,
    rewardCode: next.rewardCode ?? current.rewardCode,
    claimPayload: next.claimPayload ?? current.claimPayload,
    claimedAt: settledItem?.claimedAt ?? next.claimedAt ?? current.claimedAt,
    expiresAt: next.expiresAt ?? current.expiresAt,
  } satisfies GameRewardHistoryItem;
}

function buildCanonicalRewardHistory(summary: GuestPortalGameSummary) {
  const byStableId = new Map<string, GameRewardHistoryItem>();

  function upsert(item: GameRewardHistoryItem) {
    const current = byStableId.get(item.id);
    byStableId.set(
      item.id,
      current ? mergeRewardHistoryItems(current, item) : item,
    );
  }

  for (const item of summary.rewards.bonusHistory.items) {
    upsert(normalizeBonusRewardHistoryItem(item));
  }

  for (const item of summary.rewards.recent) {
    upsert(normalizeRecentRewardHistoryItem(item));
  }

  for (const item of gameRewardWallet(summary).history ?? []) {
    upsert(normalizeWalletRewardHistoryItem(item));
  }

  return [...byStableId.values()].sort(
    (left, right) =>
      Date.parse(right.claimedAt ?? right.qualifiedAt) -
      Date.parse(left.claimedAt ?? left.qualifiedAt),
  );
}

function rewardHistoryClubKey(
  item: Pick<GameRewardHistoryItem, "storeId" | "storeName">,
) {
  if (item.storeId) {
    return `store:${item.storeId}`;
  }

  const storeName = item.storeName?.trim();
  if (storeName) {
    return `store-name:${storeName.toLocaleLowerCase("ru-RU")}`;
  }

  return "network";
}

function rewardHistoryClubLabel(
  item: Pick<GameRewardHistoryItem, "storeId" | "storeName">,
) {
  const storeName = item.storeName?.trim();

  if (storeName) {
    return storeName;
  }

  return item.storeId ? "Клуб без названия" : "Вся сеть";
}

function buildRewardHistoryClubOptions(items: GameRewardHistoryItem[]) {
  const byId = new Map<string, { id: string; label: string; scope: string }>();

  for (const item of items) {
    const id = rewardHistoryClubKey(item);
    const label = rewardHistoryClubLabel(item);

    if (!byId.has(id)) {
      byId.set(id, { id, label, scope: label });
    }
  }

  return [
    {
      id: "all",
      label: "Все клубы",
      scope: "Итого по всем клубам",
    },
    ...[...byId.values()].sort((left, right) =>
      left.label.localeCompare(right.label, "ru-RU"),
    ),
  ];
}

function rewardHistorySource(item: GameRewardHistoryItem): RewardHistorySource {
  if (item.sourceKind === "CHECK_IN") {
    return "checkin";
  }

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

function rewardHistoryOccurredAt(item: GameRewardHistoryItem) {
  return item.claimedAt ?? item.qualifiedAt;
}

function rewardHistoryValue(item: GameRewardHistoryItem) {
  if (item.rewardAmount <= 0) {
    return item.rewardLabel;
  }

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

function buildRewardHistoryTotals(items: GameRewardHistoryItem[]) {
  const source = {
    checkin: 0,
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

function filterRewardHistory(
  items: GameRewardHistoryItem[],
  filters: {
    sourceFilter: RewardHistorySourceFilter;
    rarityFilter: RewardHistoryRarityFilter;
    query: string;
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
        item.storeName,
        rewardHistoryClubLabel(item),
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("ru-RU")
        .includes(query);

    return sourceMatches && rarityMatches && queryMatches;
  });
}

function groupRewardHistory(items: GameRewardHistoryItem[]) {
  const groups = new Map<string, GameRewardHistoryItem[]>();
  for (const item of items) {
    const key = formatRewardHistoryDay(rewardHistoryOccurredAt(item));
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
        Date.parse(
          right.items[0] ? rewardHistoryOccurredAt(right.items[0]) : "",
        ) -
        Date.parse(left.items[0] ? rewardHistoryOccurredAt(left.items[0]) : ""),
    );
}

function formatRewardChance(value: number) {
  return (
    new Intl.NumberFormat("ru-RU", {
      maximumFractionDigits: 2,
    }).format(value) + "%"
  );
}

function formatRewardHistoryDay(value: string) {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date(today);

  yesterday.setDate(today.getDate() - 1);

  if (isSameLocalDate(date, today)) {
    return "Сегодня";
  }

  if (isSameLocalDate(date, yesterday)) {
    return "Вчера";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
  }).format(date);
}

function isSameLocalDate(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function formatRewardHistoryTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function walletStateLabel(state: GameRewardWalletState) {
  const labels = {
    WAITING_CLAIM: "Ждёт получения",
    DELIVERY_PROCESSING: "Начисляется",
    WAITING_APPROVAL: "Ждет проверки",
    READY: "Можно забрать",
    REDEEMED: "Выдано",
    CANCELED: "Отменено",
    EXPIRED: "Сгорело",
  } satisfies Record<GameRewardWalletState, string>;

  return labels[state];
}

function walletStateHint(state: GameRewardWalletState) {
  const hints = {
    WAITING_CLAIM:
      "Награда сохранена в кошельке. Нажмите «Забрать», чтобы начать начисление.",
    DELIVERY_PROCESSING:
      "Награда отправлена на начисление. LeetPlus проверяет результат.",
    WAITING_APPROVAL: "Сотрудник клуба проверит результат и подготовит выдачу.",
    READY: "Покажите код кассиру в клубе, чтобы получить награду.",
    REDEEMED: "Награда уже выдана и отмечена в LeetPlus.",
    CANCELED: "Награда отменена сотрудником клуба.",
    EXPIRED: "Срок действия награды закончился.",
  } satisfies Record<GameRewardWalletState, string>;

  return hints[state];
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

function preloadLootboxPrizeImages(
  rewards: Array<{ imageUrl?: string | null }>,
) {
  const urls = Array.from(
    new Set(
      rewards
        .map((reward) => reward.imageUrl)
        .filter((url): url is string => Boolean(url)),
    ),
  );

  if (!urls.length || typeof window === "undefined") {
    return Promise.resolve();
  }

  return Promise.all(
    urls.map(
      (url) =>
        new Promise<void>((resolve) => {
          const image = new window.Image();
          const timeout = window.setTimeout(resolve, 1200);
          const finish = () => {
            window.clearTimeout(timeout);
            resolve();
          };

          image.onload = finish;
          image.onerror = finish;
          image.src = url;

          if (image.complete) {
            finish();
          }
        }),
    ),
  ).then(() => undefined);
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
  const fallbackRewards = LOOTBOX_ROULETTE_FALLBACK_REWARDS.map(
    (item, index) => ({
      ...item,
      id: `fallback-${index}`,
    }),
  );
  const resultRewards = result.rewards.map((item, index) =>
    lootboxRouletteRewardFromOpenReward(item, nextCard, `result-${index}`),
  );
  const recentRewards = [
    ...result.summary.rewards.recent,
    ...previousSummary.rewards.recent,
  ]
    .filter((item) => item.sourceKind === "LOOT_BOX")
    .slice(0, 14)
    .map((item, index) =>
      lootboxRouletteRewardFromHistory(item, `recent-${index}`),
    );
  const configuredRewards = currentCard.possibleRewards.map(
    (item, index): LootboxRouletteReward => ({
      id: `configured-${index}`,
      reward: item.rewardLabel,
      caption: `${item.rarityLabel} / ${formatChancePercent(item.chancePercent)}`,
      rarity: item.rarity,
      rarityLabel: item.rarityLabel,
      dropChance: item.chancePercent,
      rewardType: item.rewardType,
      visualMode: item.visualMode,
      iconKey: item.iconKey,
      imageUrl: item.imageUrl,
      borderColor: item.borderColor,
      textColor: item.textColor,
      backgroundColor: item.backgroundColor,
    }),
  );
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
        possibleRewards: item.possibleRewards,
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
        walletItemId: null,
        walletReady: false,
        walletStatus: null,
      },
      `lootbox-${index}`,
    ),
  );
  const candidates = dedupeLootboxRouletteRewards([
    ...resultRewards,
    ...configuredRewards,
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
  const spinPool = pool.length
    ? pool
    : fallbackPool.length
      ? fallbackPool
      : fallbackRewards;
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
  const configuredVisual = lootboxConfiguredPrizeVisual(card, rewardLabel);

  return {
    id,
    reward: rewardLabel,
    caption: lootboxRouletteCaption(rarityLabel, dropChance, card.title),
    rarity,
    rarityLabel,
    dropChance,
    rewardType: reward?.rewardType ?? configuredVisual?.rewardType ?? null,
    visualMode: reward?.visualMode ?? configuredVisual?.visualMode ?? "AUTO",
    iconKey: reward?.iconKey ?? configuredVisual?.iconKey ?? "gift",
    imageUrl: reward?.imageUrl ?? configuredVisual?.imageUrl ?? null,
    borderColor: reward?.borderColor ?? configuredVisual?.borderColor ?? null,
    textColor: reward?.textColor ?? configuredVisual?.textColor ?? null,
    backgroundColor:
      reward?.backgroundColor ?? configuredVisual?.backgroundColor ?? null,
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
    rewardType: item.rewardType,
    visualMode: item.visualMode ?? "AUTO",
    iconKey: item.iconKey ?? "gift",
    imageUrl: item.imageUrl ?? null,
    borderColor: item.borderColor ?? null,
    textColor: item.textColor ?? null,
    backgroundColor: item.backgroundColor ?? null,
  };
}

function lootboxRouletteRewardFromCard(
  card: HomeLootCard,
  id: string,
): LootboxRouletteReward {
  const rarity = normalizeLootboxRarity(card.rewardRarity);
  const rarityLabel =
    card.rewardRarityLabel ?? (rarity ? LOOTBOX_RARITY_LABELS[rarity] : null);
  const configuredVisual = lootboxConfiguredPrizeVisual(
    card,
    card.rewardLabel ?? card.description,
  );

  return {
    id,
    reward: card.rewardLabel ?? card.description,
    caption: lootboxRouletteCaption(
      rarityLabel,
      card.rewardDropChance ?? null,
      card.title,
    ),
    rarity,
    rarityLabel,
    dropChance: card.rewardDropChance ?? null,
    rewardType: configuredVisual?.rewardType ?? null,
    visualMode: configuredVisual?.visualMode ?? "AUTO",
    iconKey: configuredVisual?.iconKey ?? "gift",
    imageUrl: configuredVisual?.imageUrl ?? null,
    borderColor: configuredVisual?.borderColor ?? null,
    textColor: configuredVisual?.textColor ?? null,
    backgroundColor: configuredVisual?.backgroundColor ?? null,
  };
}

function lootboxConfiguredPrizeVisual(card: HomeLootCard, rewardLabel: string) {
  return (
    card.possibleRewards.find((item) => item.rewardLabel === rewardLabel) ??
    card.possibleRewards[0] ??
    null
  );
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

  return (
    value.rewardRarityLabel ?? (rarity ? LOOTBOX_RARITY_LABELS[rarity] : null)
  );
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

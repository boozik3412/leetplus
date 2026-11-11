"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type {
  GuestPortalCheckInResponse,
  GuestPortalGameMissionPage,
  GuestPortalGameSummary,
  GuestPortalRewardWalletItem,
} from "@/lib/guest-portal";
import { startNavigationFeedback } from "@/components/navigation-feedback";
import { GuestBugReportButton } from "@/components/guest-bug-report";
import { GuestSupportTickets } from "@/components/guest-support-tickets";
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
  GameNextAction,
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
} from "./_game/format";
import {
  GUEST_GAME_AUTH_REQUIRED_MESSAGE,
  EMPTY_REWARD_WALLET,
  LOOTBOX_CHARGE_MIN_MS,
  LOOTBOX_CASE_OPEN_MS,
  QUEST_BOARD_PAGE_SIZE,
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
import { revealLootboxRarity } from "./_game/lootbox/rarity";
import { LootboxOpeningOverlay } from "./_game/lootbox/opening-overlay";
import {
  MenuIcon,
  TrophyIcon,
  ExitIcon,
  BrandMark,
  GamepadIcon,
} from "./_game/icons";
import { loadGameAccountsEnabled } from "@/lib/guest-game-accounts";
import { HomeLootBoxes } from "./_game/lootbox/home-loot-boxes";
import { LootboxUnavailableModal } from "./_game/lootbox/unavailable-modal";
import {
  normalizeGameRuleTrigger,
  normalizeGameRuleSessionType,
} from "./_game/game-rules";
import { buildHomeBattleQuests } from "./_game/battle-pass/track";
import { HomeBattlePass } from "./_game/battle-pass/home-battle-pass";
import { BattlePassLevelCompletionModal } from "./_game/battle-pass/modals";
import {
  gameRewardWallet,
  isRewardWalletItemActionable,
  isClaimableRewardWalletItem,
} from "./_game/rewards/wallet";
import { RewardWalletInboxPanel } from "./_game/rewards/wallet-inbox-panel";
import { RewardJournalPanel } from "./_game/rewards/journal-panel";
import { useRewardWalletPulse } from "./_game/rewards/wallet-card";
import { buildHomeBanners, HomeBannerGrid } from "./_game/home/banners";
import { buildHomeLootCards } from "./_game/lootbox/home-cards";
import { buildPlayerQuests } from "./_game/quests/player-quests";
import {
  completionDialogsFromPendingNotifications,
  findNewCompletionDialogs,
  sortCompletionDialogs,
} from "./_game/completion/dialogs";
import {
  normalizeNickname,
  PlayerProfilePanel,
} from "./_game/profile/player-profile-panel";
import { QuestBoard } from "./_game/quests/quest-board";
import {
  QuestDetailsModal,
  QuestCompletionModal,
} from "./_game/quests/quest-modals";
import {
  CheckInCompletionModal,
} from "./_game/completion/check-in-completion-modal";

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
  const [gameAccountsEnabled, setGameAccountsEnabled] = useState(false);
  const gameAccountsChecked = useRef(false);
  const brandLogoUrl = summary.store.gameLogoUrl ?? summary.tenant.gameLogoUrl;

  // «Игровые аккаунты» appears only where the network turned them on; the
  // check runs once, when the guest first opens the menu.
  useEffect(() => {
    if (!menuOpen || gameAccountsChecked.current) {
      return;
    }

    gameAccountsChecked.current = true;
    void loadGameAccountsEnabled().then((enabled) => {
      if (enabled) {
        setGameAccountsEnabled(true);
      }
    });
  }, [menuOpen]);

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
            {gameAccountsEnabled ? (
              <Link href="/game/accounts" onClick={() => setMenuOpen(false)}>
                <GamepadIcon />
                <span>Игровые аккаунты</span>
              </Link>
            ) : null}
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

function lootBoxUnavailableCheckMessage(card: HomeLootCard) {
  if (
    normalizeGameRuleTrigger(card.triggerKind) === "SESSION_START" &&
    normalizeGameRuleSessionType(card.sessionType) === "packet_hours"
  ) {
    return "Пакет или абонемент пока не найден. Если вы только что купили пакет или абонемент, подождите несколько секунд и нажмите проверку еще раз.";
  }

  return "Условия пока не выполнены. Если вы уже сделали нужное действие, подождите несколько секунд и проверьте еще раз.";
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

function isGuestInternalNextAction(action: GameNextAction) {
  return action.kind === "MATCH_LANGAME";
}

function gameActionHref(action: GameNextAction) {
  if (action.kind === "MATCH_LANGAME") {
    return "#next-actions";
  }

  return `#${action.anchor}`;
}

function isCheckInAvailable(summary: GuestPortalGameSummary) {
  return (
    Boolean(summary.checkIn?.enabled) ||
    summary.nextActions.some((action) => action.kind === "CHECK_IN")
  );
}

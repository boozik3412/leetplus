"use client";

import type {
  GuestPortalRewardWalletItem,
  GuestPortalGameSummary,
  GuestPortalRewardWallet,
} from "@/lib/guest-portal";
import type { PlayerQuest, GameNextAction } from "../types";
import {
  type FormEvent,
  useState,
  useRef,
  useEffect,
  type KeyboardEvent as ReactKeyboardEvent,
  type CSSProperties,
} from "react";
import { ProfileIcon, PencilIcon } from "../icons";
import { formatNumber, clampPercent } from "../format";
import { GameRatingTeaser } from "../../game-rating-client";
import Link from "next/link";
import { rewardWalletItemStatusHint } from "../rewards/wallet";
import { GuestMissionPreview } from "@/components/guest-mission-preview";
import { orderedPlayerQuests } from "../quests/player-quests";
import {
  selectPreferredRewardWalletItem,
  RewardWalletCard,
  rewardWalletItemCompactStatus,
} from "../rewards/wallet-card";
import { LEVEL_XP_STEP } from "../constants";

export function checkInRewardWalletLabel(item: GuestPortalRewardWalletItem) {
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

export function PlayerProfilePanel({
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

export function normalizeNickname(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function buildPlayerLevelProgress(profile: GuestPortalGameSummary["profile"]) {
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

export function formatPlayerPhoneMasked(value: string | null) {
  const digits = value?.replace(/\D/g, "") ?? "";

  if (!digits) {
    return null;
  }

  if (digits.length >= 6) {
    return `***${digits.slice(-6)}`;
  }

  return value?.trim() || null;
}

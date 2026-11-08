"use client";

import type { QuestCompletionDialog, PlayerQuest } from "../types";
import { RewardLootBoxPreview } from "../lootbox/preview";
import { formatDate } from "../format";
import {
  rewardWalletItemPendingActionLabel,
  isRewardWalletItemActionable,
} from "../rewards/wallet";
import { useEffect } from "react";
import { GuestMissionPreview } from "@/components/guest-mission-preview";

export function QuestCompletionModal({
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

export function QuestDetailsModal({
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

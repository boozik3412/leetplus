"use client";

import type {
  GuestPortalRewardWallet,
  GuestPortalRewardWalletItem,
} from "@/lib/guest-portal";
import { formatNumber } from "../format";
import { WalletCaseIcon } from "../icons";
import {
  isClaimableRewardWalletItem,
  orderedRewardWalletItems,
  rewardWalletSourceCaption,
  rewardWalletItemStatusLabel,
  rewardWalletItemStatusHint,
  isRewardWalletItemActionable,
  rewardWalletItemPendingActionLabel,
  rewardWalletItemActionLabel,
} from "./wallet";

export function RewardWalletInboxPanel({
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

"use client";

import type {
  GuestPortalRewardWallet,
  GuestPortalRewardWalletItem,
} from "@/lib/guest-portal";
import { useState, useEffect } from "react";
import { REWARD_WALLET_PULSE_STORAGE_VERSION } from "../constants";
import { orderedRewardWalletItems } from "./wallet";
import { formatNumber } from "../format";
import { WalletCaseIcon } from "../icons";
import Link from "next/link";

export function useRewardWalletPulse(
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

export function readRewardWalletPulseState(value: string | null) {
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

export function rewardWalletItemCompactStatus(item: GuestPortalRewardWalletItem) {
  if (item.action === "CLAIM_REWARD") {
    return item.status === "FAILED" ? "Повторить" : "Забрать";
  }

  if (item.action === "OPEN_LOOT_BOX") {
    return item.status === "FAILED" ? "Повторить" : "Открыть";
  }

  return item.status === "OPENING" ? "Открываем…" : "Начисляем…";
}

export function selectPreferredRewardWalletItem(
  items: GuestPortalRewardWalletItem[],
  predicate: (item: GuestPortalRewardWalletItem) => boolean,
) {
  return orderedRewardWalletItems(items.filter(predicate))[0] ?? null;
}

export function RewardWalletCard({
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

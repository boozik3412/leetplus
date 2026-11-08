import type {
  GuestPortalGameSummary,
  GuestPortalRewardWallet,
  GuestPortalRewardWalletItem,
} from "@/lib/guest-portal";
import { EMPTY_REWARD_WALLET } from "../constants";
import { formatDate } from "../format";

export function gameRewardWallet(
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

export function rewardWalletSourceLabel(item: GuestPortalRewardWalletItem) {
  const labels = {
    CHECK_IN: "Ежедневный чекин",
    MISSION: "Задание",
    BATTLE_PASS: "Боевой пропуск",
    LOOT_BOX: "Лутбокс",
    MANUAL: "Награда клуба",
  } satisfies Record<GuestPortalRewardWalletItem["sourceKind"], string>;

  return labels[item.sourceKind];
}

export function rewardWalletSourceCaption(item: GuestPortalRewardWalletItem) {
  const sourceLabel = rewardWalletSourceLabel(item);
  const storeName = item.storeName?.trim();

  return storeName ? `${sourceLabel} · ${storeName}` : sourceLabel;
}

export function rewardWalletItemActionLabel(item: GuestPortalRewardWalletItem) {
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

export function rewardWalletItemPendingActionLabel(item: GuestPortalRewardWalletItem) {
  if (item.action === "OPEN_LOOT_BOX") {
    return "Открываем…";
  }

  if (item.status === "FAILED") {
    return "Повторяем…";
  }

  return "Получаем…";
}

export function rewardWalletItemStatusLabel(item: GuestPortalRewardWalletItem) {
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

export function rewardWalletItemStatusHint(item: GuestPortalRewardWalletItem) {
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

export function isRewardWalletItemActionable(item: GuestPortalRewardWalletItem) {
  return item.action === "CLAIM_REWARD" || item.action === "OPEN_LOOT_BOX";
}

export function isClaimableRewardWalletItem(item: GuestPortalRewardWalletItem) {
  return (
    item.kind === "REWARD" &&
    (item.status === "PENDING" || item.status === "FAILED") &&
    item.action === "CLAIM_REWARD"
  );
}

export function rewardWalletItemPriority(item: GuestPortalRewardWalletItem) {
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

export function orderedRewardWalletItems(items: GuestPortalRewardWalletItem[]) {
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

export function rewardWalletExpiryLabel(item: GuestPortalRewardWalletItem) {
  return `Доступно до ${formatDate(item.expiresAt)}`;
}

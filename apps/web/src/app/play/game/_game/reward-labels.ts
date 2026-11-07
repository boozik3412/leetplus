import type { GameRewardHistoryItem, GameRewardWalletState } from "./types";
import { formatNumber } from "./format";

export function rewardHistoryClaimCode(
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

export function rewardHistoryValue(item: GameRewardHistoryItem) {
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

export function formatRewardChance(value: number) {
  return (
    new Intl.NumberFormat("ru-RU", {
      maximumFractionDigits: 2,
    }).format(value) + "%"
  );
}

export function walletStateLabel(state: GameRewardWalletState) {
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

export function walletStateHint(state: GameRewardWalletState) {
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

export type GuestRewardLabelInput = {
  status: "PENDING" | "APPROVED" | "PAID" | "CANCELED" | "EXPIRED";
  walletState:
    | "WAITING_APPROVAL"
    | "READY"
    | "DELIVERY_PROCESSING"
    | "REDEEMED"
    | "CANCELED"
    | "EXPIRED";
  rewardType: string;
  rewardAmount: number;
  claimRequired: boolean;
  deliveryRequestedAt: string | null;
  sourceEntitlementStatus: string | null;
};

const automaticLedgerRewardTypes = new Set([
  "BALANCE",
  "BONUS",
  "BONUS_BALANCE",
  "BONUS_POINTS",
  "CASH_BALANCE",
  "DEPOSIT",
  "LANGAME_BALANCE",
  "LOYALTY_BONUS",
  "MONEY_BALANCE",
  "WALLET_BALANCE",
]);

function normalizedRewardType(reward: Pick<GuestRewardLabelInput, "rewardType">) {
  return reward.rewardType.trim().toUpperCase();
}

function isLootBoxEntitlement(reward: GuestRewardLabelInput) {
  return normalizedRewardType(reward) === "LOOT_BOX_ENTITLEMENT";
}

function isBattlePassCompletionMarker(reward: GuestRewardLabelInput) {
  return (
    normalizedRewardType(reward) === "BATTLE_PASS_COMPLETION_MARKER" &&
    reward.rewardAmount === 0
  );
}

export function isAutomaticLedgerReward(reward: GuestRewardLabelInput) {
  return (
    reward.rewardAmount > 0 &&
    automaticLedgerRewardTypes.has(normalizedRewardType(reward))
  );
}

export function guestRewardStatusLabel(reward: GuestRewardLabelInput) {
  switch (reward.status) {
    case "PENDING":
      return "ожидает проверки";
    case "APPROVED":
      if (isBattlePassCompletionMarker(reward)) return "этап засчитан";
      if (isLootBoxEntitlement(reward) || isAutomaticLedgerReward(reward)) {
        return "право подтверждено";
      }
      return "выдача согласована";
    case "PAID":
      if (isAutomaticLedgerReward(reward)) return "бонус начислен";
      if (isLootBoxEntitlement(reward)) return "кейс выдан";
      return "награда выдана";
    case "CANCELED":
      return "награда отменена";
    case "EXPIRED":
      return "срок награды истёк";
  }
}

export function guestRewardFulfillmentLabel(reward: GuestRewardLabelInput) {
  if (isLootBoxEntitlement(reward)) {
    switch (reward.sourceEntitlementStatus) {
      case "AVAILABLE":
        return "кейс доступен";
      case "CONSUMED":
        return "кейс открыт";
      case "CANCELED":
        return "кейс отменён";
      case "EXPIRED":
        return "срок кейса истёк";
      default:
        return reward.walletState === "DELIVERY_PROCESSING"
          ? "кейс создаётся"
          : "статус кейса уточняется";
    }
  }

  if (isBattlePassCompletionMarker(reward)) {
    if (reward.status === "CANCELED") return "прогресс отменён";
    if (reward.status === "EXPIRED") return "этап завершён по сроку";
    if (reward.status === "PENDING") return "ожидает обработки";
    return "прогресс учтён";
  }

  if (isAutomaticLedgerReward(reward)) {
    if (reward.status === "PAID" || reward.walletState === "REDEEMED") {
      return "начислено в Langame";
    }
    if (reward.status === "CANCELED" || reward.walletState === "CANCELED") {
      return "начисление отменено";
    }
    if (reward.status === "EXPIRED" || reward.walletState === "EXPIRED") {
      return "срок получения истёк";
    }
    if (reward.status === "APPROVED") {
      if (reward.claimRequired && !reward.deliveryRequestedAt) {
        return "ждёт получения гостем";
      }
      if (reward.deliveryRequestedAt) return "в очереди Langame";
      return "готово к начислению";
    }
    return "начисление не начато";
  }

  if (reward.status === "CANCELED" || reward.walletState === "CANCELED") {
    return "выдача отменена";
  }
  if (reward.status === "EXPIRED" || reward.walletState === "EXPIRED") {
    return "срок получения истёк";
  }
  if (reward.status === "PAID" || reward.walletState === "REDEEMED") {
    if (normalizedRewardType(reward) === "PROMOCODE") return "код использован";
    return "выдача закрыта";
  }
  if (reward.walletState === "DELIVERY_PROCESSING") {
    return "выдача обрабатывается";
  }
  if (reward.status === "APPROVED") {
    return reward.claimRequired && !reward.deliveryRequestedAt
      ? "ждёт получения гостем"
      : "ожидает ручной выдачи";
  }
  return "требуется подтверждение";
}

export function guestRewardLifecycleDescription(reward: GuestRewardLabelInput) {
  if (isLootBoxEntitlement(reward)) {
    switch (reward.sourceEntitlementStatus) {
      case "AVAILABLE":
        return "Право подтверждено: кейс уже находится в игровом кошельке гостя и ещё не открыт.";
      case "CONSUMED":
        return "Кейс был начислен и уже открыт. Повторное открытие этого права заблокировано.";
      case "CANCELED":
        return "Право на кейс отменено; открыть его больше нельзя.";
      case "EXPIRED":
        return "Срок права на кейс истёк; открыть его больше нельзя.";
      default:
        return "Право подтверждено, создание кейса в игровом кошельке ещё обрабатывается.";
    }
  }

  if (isBattlePassCompletionMarker(reward)) {
    return "Условие этапа Battle Pass выполнено, прогресс учтён. Отдельная выдача гостю не требуется.";
  }

  if (isAutomaticLedgerReward(reward)) {
    if (reward.status === "PAID" || reward.walletState === "REDEEMED") {
      return "Бонус успешно записан на баланс гостя в Langame; повторное начисление заблокировано.";
    }
    if (reward.status === "APPROVED") {
      if (reward.claimRequired && !reward.deliveryRequestedAt) {
        return "Право на бонус подтверждено. Гостю нужно нажать «Забрать»; только после этого начнётся начисление в Langame.";
      }
      if (reward.deliveryRequestedAt) {
        return "Гость запросил награду, и бонус уже передан автономному worker в очередь начисления Langame.";
      }
      return "Право на бонус подтверждено; автономный worker подготовит начисление в Langame.";
    }
    if (reward.status === "PENDING") {
      return "Награда создана и ожидает проверки права гостя на бонус.";
    }
  }

  switch (reward.status) {
    case "PENDING":
      return "Награда создана и ожидает проверки сотрудником.";
    case "APPROVED":
      return reward.claimRequired && !reward.deliveryRequestedAt
        ? "Право на награду подтверждено. Гостю нужно нажать «Забрать», после чего её можно выдать."
        : "Выдача согласована и ожидает ручного завершения сотрудником.";
    case "PAID":
      return "Награда уже выдана гостю; повторная выдача заблокирована.";
    case "CANCELED":
      return "Награда отменена и больше не может быть выдана.";
    case "EXPIRED":
      return "Срок получения награды истёк.";
  }
}

export function guestRewardActionNotice(reward: GuestRewardLabelInput) {
  if (reward.status === "PENDING" && isAutomaticLedgerReward(reward)) {
    return "Нажмите «Согласовать и начислить»: право на бонус подтвердится, а дальнейший путь будет явно показан отдельным статусом.";
  }

  if (reward.status === "PENDING") {
    return "Сначала подтвердите право на награду. После этого интерфейс отдельно покажет ожидание гостя, ручной выдачи или начисления.";
  }

  return guestRewardLifecycleDescription(reward);
}

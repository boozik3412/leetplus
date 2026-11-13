import { guestRewardStatusLabel } from "./guest-reward-status-labels.ts";

/** «Подробнее» of the game module block on «Схема клуба». */
export type GameCompletion = {
  id: string;
  qualifiedAt: string;
  kind: "MISSION" | "CASE" | "SEASON" | "MANUAL" | "OTHER";
  triggerKind: string | null;
  title: string | null;
  description: string | null;
  reward: {
    label: string;
    type: string;
    amount: number;
    status: string;
    paidAt: string | null;
    expiresAt: string | null;
  };
  guest: { id: string | null; name: string; phone: string | null } | null;
};

export type GameCompletions = {
  storeId: string;
  storeName: string;
  timeZone: string | null;
  period: "SHIFT" | "TODAY";
  since: string;
  generatedAt: string;
  guestAccess: "AVAILABLE" | "NO_CAPABILITY";
  items: GameCompletion[];
  truncated: boolean;
};

const KIND_LABELS: Record<GameCompletion["kind"], string> = {
  MISSION: "Миссия",
  CASE: "Кейс",
  SEASON: "Сезон",
  MANUAL: "Ручная награда",
  OTHER: "Награда",
};

const TRIGGER_LABELS: Record<string, string> = {
  APP_OPEN: "открытие приложения",
  VISIT: "визит",
  REPEAT_VISIT: "повторный визит",
  CHECK_IN: "чекин в клубе",
  SESSION_START: "старт сессии",
  PLAY_HOUR: "игровое время",
  BAR_PURCHASE: "покупка в баре",
  PRODUCT_PURCHASE: "покупка товара",
  PRODUCT_EXPENSE: "покупка товара",
  BALANCE_TOPUP: "пополнение баланса",
  GUEST_LOG: "событие Langame",
  REFERRAL_ACCEPTED: "приведи друга",
  MISSION_COMPLETED: "за выполненную миссию",
  FACEIT_MATCH: "матч FACEIT",
};

/** «Миссия · чекин в клубе», «Кейс», «Ручная награда». */
export function gameCompletionTypeLabel(
  item: Pick<GameCompletion, "kind" | "triggerKind">,
) {
  const kind = KIND_LABELS[item.kind] ?? KIND_LABELS.OTHER;
  if (item.kind !== "MISSION" || !item.triggerKind) return kind;
  const trigger = TRIGGER_LABELS[item.triggerKind.trim().toUpperCase()];
  return trigger ? `${kind} · ${trigger}` : kind;
}

const STATUSES = new Set([
  "PENDING",
  "APPROVED",
  "PAID",
  "CANCELED",
  "EXPIRED",
]);

/** Same wording as the guest card: «ожидает проверки», «бонус начислен»… */
export function gameCompletionStatusLabel(reward: GameCompletion["reward"]) {
  if (!STATUSES.has(reward.status)) return reward.status.toLowerCase();
  return guestRewardStatusLabel({
    status: reward.status as "PENDING",
    walletState: "READY",
    rewardType: reward.type,
    rewardAmount: reward.amount,
    claimRequired: false,
    deliveryRequestedAt: null,
    sourceEntitlementStatus: null,
  });
}

/** Tone of the status chip: done, waiting for staff, or still open. */
export function gameCompletionStatusTone(status: string) {
  if (status === "PAID") return "done" as const;
  if (status === "PENDING") return "waiting" as const;
  return "open" as const;
}

/** Link from the scene to the list, for one club. */
export function gameCompletionsHref(storeId: string) {
  return `/visualization/game-activity?store=${encodeURIComponent(storeId)}`;
}

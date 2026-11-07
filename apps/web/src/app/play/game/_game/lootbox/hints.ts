import type { GuestPortalRewardWalletItem } from "@/lib/guest-portal";
import { getErrorMessage, formatNumber, joinRussianList } from "../format";
import type { HomeLootCard } from "../types";
import {
  normalizeGameRuleTrigger,
  normalizeGameRuleSessionType,
  withHourlySessionExtensionNotice,
  gameRuleUnlockCondition,
  guestActionRequirementLabel,
} from "../game-rules";

export function lootboxWalletStatusLabel(
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

export function lootboxOpeningErrorMessage(error: unknown) {
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

export function lootboxCardBlockedTooltip(card: HomeLootCard) {
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

export function lootboxCardHint(card: HomeLootCard) {
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

export function lootBoxUnlockHint(
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

export function lootBoxGuestRequirementLines(card: HomeLootCard) {
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

export function lootBoxScheduleHint(
  schedule?: HomeLootCard["schedule"] | null,
): string | null {
  if (!schedule) {
    return null;
  }

  const dayHint = lootBoxScheduleDayHint(schedule);
  const timeHint = lootBoxScheduleTimeHint(schedule);

  return [dayHint, timeHint].filter(Boolean).join(" ") || null;
}

export function lootBoxScheduleRequirement(
  schedule?: HomeLootCard["schedule"] | null,
): string | null {
  const hint = lootBoxScheduleHint(schedule);

  return hint ? `Открытие доступно только ${hint}.` : null;
}

export function lootBoxScheduleDayHint(
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

export function lootBoxScheduleTimeHint(
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

export function formatScheduleTimeWindow(value: string) {
  const [from, to] = value
    .split("-")
    .map((part) => part.trim())
    .filter(Boolean);

  if (from && to) {
    return `с ${from} до ${to}`;
  }

  return value.trim() || null;
}

export const SCHEDULE_WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export const SCHEDULE_WEEKDAY_DATIVE: Record<number, string> = {
  1: "понедельникам",
  2: "вторникам",
  3: "средам",
  4: "четвергам",
  5: "пятницам",
  6: "субботам",
  0: "воскресеньям",
};

export function normalizeScheduleWeekdays(value: number[]) {
  return SCHEDULE_WEEKDAY_ORDER.filter((weekday) => value.includes(weekday));
}

export function sameScheduleWeekdays(left: number[], right: number[]) {
  const rightNormalized = normalizeScheduleWeekdays(right);

  return (
    left.length === rightNormalized.length &&
    left.every((weekday, index) => weekday === rightNormalized[index])
  );
}

export function lootBoxPeriodicWaitRequirement(
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

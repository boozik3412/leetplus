import {
  appendHourlySessionSourceNotice,
} from "@/components/hourly-session-source-note";

export function withHourlySessionExtensionNotice(
  label: string,
  sessionType: string | null,
) {
  return appendHourlySessionSourceNotice(
    label,
    normalizeGameRuleSessionType(sessionType) === "regular_session",
  );
}

export function guestActionRequirementLabel(
  triggerKind: string,
  sessionType: string | null,
) {
  const normalized = normalizeGameRuleTrigger(triggerKind);
  const normalizedSessionType = normalizeGameRuleSessionType(sessionType);

  if (normalized === "SESSION_START") {
    if (normalizedSessionType === "packet_hours") {
      return "Начните игровую сессию с пакетом или абонементом.";
    }

    if (normalizedSessionType === "regular_session") {
      return withHourlySessionExtensionNotice(
        "Начните отдельную игровую сессию с почасовой оплатой.",
        sessionType,
      );
    }

    return "Начните игровую сессию в клубе.";
  }

  switch (normalized) {
    case "APP_OPEN":
      return "Откройте игровой модуль.";
    case "CHECK_IN": {
      const sessionRequirement = gameRuleSessionRequirement(sessionType);
      return withHourlySessionExtensionNotice(
        `Сделайте чекин в игровом модуле, находясь в клубе${
          sessionRequirement
            ? ` во время активной сессии ${sessionRequirement}`
            : ""
        }.`,
        sessionType,
      );
    }
    case "VISIT":
      return "Придите в клуб, чтобы система зафиксировала визит.";
    case "PLAY_HOUR":
      return normalizedSessionType === "regular_session"
        ? withHourlySessionExtensionNotice(
            "Поиграйте нужное время в отдельно начатой почасовой сессии.",
            sessionType,
          )
        : "Поиграйте нужное время в клубе.";
    case "BAR_PURCHASE":
      return "Сделайте покупку в баре клуба.";
    case "PRODUCT_PURCHASE":
      return "Сделайте покупку в клубе.";
    case "BALANCE_TOPUP":
      return "Пополните баланс в клубе.";
    case "GUEST_LOG":
      return "Выполните нужное действие в клубе.";
    case "REFERRAL_ACCEPTED":
      return "Пригласите друга, чтобы он стал гостем клуба.";
    case "REPEAT_VISIT":
      return "Вернитесь в клуб еще раз.";
    case "MISSION_COMPLETED":
      return "Выполните нужное задание.";
    default:
      return `Выполните условие: ${gameRuleEventLabel(triggerKind)}.`;
  }
}

export function gameRuleUnlockCondition(
  triggerKind: string,
  sessionType: string | null,
) {
  const normalized = normalizeGameRuleTrigger(triggerKind);
  const sessionRequirement = gameRuleSessionRequirement(sessionType);

  if (normalized === "SESSION_START") {
    return `при старте сессии${sessionRequirement ? ` ${sessionRequirement}` : ""}`;
  }

  if (normalized === "APP_OPEN") {
    return "при открытии игрового модуля";
  }

  if (normalized === "CHECK_IN") {
    return `после чекина в клубе${
      sessionRequirement
        ? ` во время активной сессии ${sessionRequirement}`
        : ""
    }`;
  }

  if (normalized === "PLAY_HOUR") {
    return `после игрового времени${
      sessionRequirement ? ` в сессии ${sessionRequirement}` : ""
    }`;
  }

  return `после события: ${gameRuleEventLabel(triggerKind)}`;
}

export function gameRuleEventLabel(triggerKind: string) {
  switch (normalizeGameRuleTrigger(triggerKind)) {
    case "APP_OPEN":
      return "открытие игрового модуля";
    case "SESSION_START":
      return "старт сессии";
    case "CHECK_IN":
      return "чекин в клубе";
    case "VISIT":
      return "визит в клуб";
    case "PLAY_HOUR":
      return "час игры";
    case "BAR_PURCHASE":
      return "покупка в баре";
    case "PRODUCT_PURCHASE":
      return "покупка товара";
    case "BALANCE_TOPUP":
      return "пополнение баланса";
    case "GUEST_LOG":
      return "событие Langame";
    case "REFERRAL_ACCEPTED":
      return "приглашенный друг";
    case "REPEAT_VISIT":
      return "повторный визит";
    case "MISSION_COMPLETED":
      return "выполненное задание";
    default:
      return triggerKind;
  }
}

export function gameRuleSessionRequirement(value: string | null) {
  const normalized = normalizeGameRuleSessionType(value);

  if (normalized === "packet_hours") {
    return "с пакетом или абонементом";
  }

  if (normalized === "regular_session") {
    return "с почасовым тарифом";
  }

  return null;
}

export function normalizeGameRuleTrigger(value: string) {
  return value.trim().toUpperCase();
}

export function normalizeGameRuleSessionType(value: string | null) {
  const normalized = (value ?? "").trim().toLowerCase();

  if (
    [
      "packet_hours",
      "package_or_subscription",
      "package_or_subscription_session",
      "packet",
      "package",
      "package_hours",
      "subscription",
      "membership",
      "abonement",
      "abonnement",
      "абонемент",
    ].includes(normalized)
  ) {
    return "packet_hours";
  }

  if (
    [
      "hourly",
      "hourly_session",
      "regular_session",
      "regular",
      "common",
      "default",
    ].includes(normalized)
  ) {
    return "regular_session";
  }

  return normalized;
}

export function gameProgressUnitLabel(unit: string | null) {
  if (!unit) {
    return null;
  }

  const labels: Record<string, string> = {
    minute: "минут",
    minutes: "минут",
    min: "минут",
    hour: "часов",
    hours: "часов",
    day: "дней",
    days: "дней",
    purchase: "покупок",
    purchases: "покупок",
    "check-in": "чекинов",
    check_in: "чекинов",
    checkin: "чекинов",
    rub: "рублей",
    rouble: "рублей",
    ruble: "рублей",
  };
  const normalized = unit.trim().toLocaleLowerCase("ru-RU");

  return labels[normalized] ?? unit;
}

import type {
  GuestChurnRiskLevel,
  GuestCommunicationConsentStatus,
  GuestCrmStatus,
  GuestGameEngagement,
  GuestListFilters,
  GuestListSort,
  GuestMetricComparison,
  GuestRecommendedActionKey,
  GuestRfmSegment,
  GuestSegment,
  GuestSignalListFilters,
  GuestSignalTone,
} from "./guests";

/**
 * Presentation helpers shared by the guest dashboard, the guest card and the
 * full report: Russian labels, badge tones, hrefs and number formatting.
 * Pure functions only, so they run in server components and in node tests.
 */

const numberFormat = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 0,
});

export function formatNumber(value: number, digits = 0) {
  if (digits === 0) {
    return numberFormat.format(value);
  }

  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatRubles(value: number | null | undefined) {
  return `${formatNumber(value ?? 0)} ₽`;
}

export function formatPercent(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined) {
    return "—";
  }

  return `${formatNumber(value, digits)} %`;
}

export function formatDate(value: string | null | undefined) {
  if (!value) {
    return "нет данных";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "нет данных";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function formatPeriodDate(value: string) {
  return formatDate(`${value}T00:00:00.000Z`);
}

export function pluralize(
  value: number,
  forms: [string, string, string],
) {
  const rule = new Intl.PluralRules("ru-RU").select(value);
  const index = rule === "one" ? 0 : rule === "few" ? 1 : 2;

  return `${formatNumber(value)} ${forms[index]}`;
}

export const guestsWord: [string, string, string] = [
  "гость",
  "гостя",
  "гостей",
];

// ---------------------------------------------------------------- labels

export const segmentLabels: Record<GuestSegment | "top", string> = {
  top: "Все гости",
  active: "Активные",
  new: "Новые",
  repeat: "Повторные",
  risk: "В риске",
  lost: "Потерянные",
  quiet: "Тихие",
};

export const rfmSegmentLabels: Record<GuestRfmSegment, string> = {
  CHAMPION: "Чемпион",
  LOYAL: "Лояльный",
  PROMISING: "Перспективный",
  NEED_ATTENTION: "Нужен контакт",
  AT_RISK: "Ценный в риске",
  LOST: "Потерянный",
};

export const churnRiskLabels: Record<GuestChurnRiskLevel, string> = {
  LOW: "Низкий",
  MEDIUM: "Наблюдать",
  HIGH: "Высокий",
  LOST: "Потерян",
};

export const crmStatusLabels: Record<GuestCrmStatus, string> = {
  NONE: "Без статуса",
  WATCH: "Наблюдать",
  CONTACT: "Связаться",
  INVITED: "Приглашен",
  LOYAL: "Лояльный",
  VIP: "VIP",
  PROBLEM: "Проблема",
  DO_NOT_CONTACT: "Не беспокоить",
};

export const consentLabels: Record<GuestCommunicationConsentStatus, string> = {
  UNKNOWN: "Согласие не определено",
  GRANTED: "Согласие есть",
  DENIED: "Отказ",
  UNSUBSCRIBED: "Отписался",
};

export const gameEngagementLabels: Record<GuestGameEngagement, string> = {
  ACTIVE: "Играет",
  IDLE: "Выпал из игры",
  NOT_ACTIVATED: "Не активировал",
  PROFILE_INACTIVE: "Профиль остановлен",
};

export const gameStatusFilterLabels: Record<
  NonNullable<GuestListFilters["gameStatus"]>,
  string
> = {
  any: "Игра: все",
  registered: "В игре",
  not_registered: "Не в игре",
  active: "Играют сейчас",
  idle: "Выпали из игры",
  pending_rewards: "Есть награды к получению",
};

export const sortLabels: Record<GuestListSort, string> = {
  revenue: "Деньги",
  sessions: "Сессии",
  lastActivity: "Активность",
  registered: "Регистрация",
  rfm: "RFM",
  churnRisk: "Риск оттока",
  ltv: "LTV",
  bonusLoad: "Бонусы",
  level: "Уровень в игре",
  pendingRewards: "Награды к получению",
  gameActivity: "Игровая активность",
};

export const recommendedActionLabels: Record<GuestRecommendedActionKey, string> =
  {
    MANUAL: "Задано вручную",
    WIN_BACK: "Вернуть",
    REACTIVATE: "Реактивировать",
    SECOND_VISIT: "Второй визит",
    CLAIM_REWARD: "Напомнить о награде",
    INVITE_TO_GAME: "Пригласить в игру",
    KEEP_WARM: "Удержать VIP",
    SOFT_TOUCH: "Мягкий контакт",
    OBSERVE: "Наблюдать",
  };

export const rewardStatusLabels: Record<string, string> = {
  PENDING: "ожидает подтверждения",
  APPROVED: "подтверждена",
  PAID: "выдана",
  CANCELED: "отменена",
  EXPIRED: "сгорела",
};

export const walletStatusLabels: Record<string, string> = {
  PENDING: "ждёт получения",
  PROCESSING: "выдаётся",
  FAILED: "ошибка выдачи, можно повторить",
  OPENING: "открывается",
  CLAIMED: "получена",
  EXPIRED: "сгорела",
};

export const ledgerStatusLabels: Record<string, string> = {
  PENDING: "в очереди",
  PROCESSING: "отправляется в Langame",
  CONFIRMED: "начислено",
  FAILED: "ошибка",
  CANCELED: "отменено",
  RECONCILIATION_REQUIRED: "нужна сверка",
};

export const rewardSourceKindLabels: Record<string, string> = {
  MISSION: "Задание",
  LOOT_BOX: "Кейс",
  BATTLE_PASS: "Battle Pass",
  MANUAL: "Вручную",
  CHECK_IN: "Чекин",
  SEASON: "Battle Pass",
  REWARD: "Награда",
  LOOT_BOX_ENTITLEMENT: "Право открыть кейс",
  DAILY: "Ежедневная",
};

export const gameEventTypeLabels: Record<string, string> = {
  APP_OPEN: "Открыл игру",
  CHECK_IN: "Чекин",
  VISIT: "Визит",
  SESSION_START: "Старт сессии",
  PLAY_HOUR: "Час игры",
  MISSION_COMPLETED: "Выполнил задание",
  MISSION_PROGRESS: "Прогресс задания",
  LOOT_BOX_OPENED: "Открыл кейс",
  REFERRAL_ACCEPTED: "Привёл друга",
  BATTLE_PASS_STEP: "Этап Battle Pass",
  BALANCE_TOPUP: "Пополнение",
  PRODUCT_EXPENSE: "Покупка",
  MANUAL_ADJUSTMENT: "Ручная корректировка",
};

export function gameEventTypeLabel(eventType: string) {
  return gameEventTypeLabels[eventType] ?? eventType;
}

export const weekdayLabels: Record<number, string> = {
  1: "Пн",
  2: "Вт",
  3: "Ср",
  4: "Чт",
  5: "Пт",
  6: "Сб",
  7: "Вс",
};

export const weekdayFullLabels: Record<number, string> = {
  1: "понедельник",
  2: "вторник",
  3: "среда",
  4: "четверг",
  5: "пятница",
  6: "суббота",
  7: "воскресенье",
};

export function hourRangeLabel(hour: number) {
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${pad(hour)}:00–${pad((hour + 1) % 24)}:00`;
}

// ---------------------------------------------------------------- tones

export type BadgeTone =
  | "neutral"
  | "good"
  | "info"
  | "warning"
  | "danger"
  | "accent";

const badgeToneClasses: Record<BadgeTone, string> = {
  neutral:
    "bg-zinc-100 text-zinc-700 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-800",
  good: "bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-200 dark:ring-emerald-500/20",
  info: "bg-sky-50 text-sky-700 ring-sky-100 dark:bg-sky-500/10 dark:text-sky-200 dark:ring-sky-500/20",
  warning:
    "bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-500/20",
  danger:
    "bg-rose-50 text-rose-700 ring-rose-100 dark:bg-rose-500/10 dark:text-rose-200 dark:ring-rose-500/20",
  accent:
    "bg-violet-50 text-violet-700 ring-violet-100 dark:bg-violet-500/10 dark:text-violet-200 dark:ring-violet-500/20",
};

export function badgeToneClass(tone: BadgeTone) {
  return badgeToneClasses[tone];
}

export function segmentTone(segment: GuestSegment): BadgeTone {
  if (segment === "repeat" || segment === "active" || segment === "new") {
    return "good";
  }

  if (segment === "risk") {
    return "warning";
  }

  if (segment === "lost") {
    return "danger";
  }

  return "neutral";
}

export function rfmTone(segment: GuestRfmSegment): BadgeTone {
  switch (segment) {
    case "CHAMPION":
      return "accent";
    case "LOYAL":
    case "PROMISING":
      return "good";
    case "NEED_ATTENTION":
      return "info";
    case "AT_RISK":
      return "warning";
    default:
      return "danger";
  }
}

export function churnTone(level: GuestChurnRiskLevel): BadgeTone {
  switch (level) {
    case "LOW":
      return "good";
    case "MEDIUM":
      return "warning";
    default:
      return "danger";
  }
}

export function crmStatusTone(status: GuestCrmStatus): BadgeTone {
  switch (status) {
    case "VIP":
      return "accent";
    case "LOYAL":
    case "INVITED":
      return "good";
    case "CONTACT":
    case "WATCH":
      return "info";
    case "PROBLEM":
      return "warning";
    case "DO_NOT_CONTACT":
      return "danger";
    default:
      return "neutral";
  }
}

export function consentTone(
  status: GuestCommunicationConsentStatus,
): BadgeTone {
  switch (status) {
    case "GRANTED":
      return "good";
    case "UNKNOWN":
      return "neutral";
    default:
      return "danger";
  }
}

export function gameEngagementTone(engagement: GuestGameEngagement): BadgeTone {
  switch (engagement) {
    case "ACTIVE":
      return "good";
    case "IDLE":
      return "warning";
    case "NOT_ACTIVATED":
      return "info";
    default:
      return "neutral";
  }
}

export function signalTone(tone: GuestSignalTone): BadgeTone {
  switch (tone) {
    case "CRITICAL":
      return "danger";
    case "WARNING":
      return "warning";
    case "OPPORTUNITY":
      return "good";
    default:
      return "info";
  }
}

export const signalToneLabels: Record<GuestSignalTone, string> = {
  CRITICAL: "Срочно",
  WARNING: "Внимание",
  OPPORTUNITY: "Возможность",
  INFO: "Справочно",
};

export function recommendedActionTone(
  key: GuestRecommendedActionKey,
): BadgeTone {
  switch (key) {
    case "WIN_BACK":
    case "REACTIVATE":
      return "danger";
    case "SECOND_VISIT":
    case "CLAIM_REWARD":
      return "warning";
    case "INVITE_TO_GAME":
    case "KEEP_WARM":
      return "good";
    case "MANUAL":
      return "accent";
    default:
      return "neutral";
  }
}

// ---------------------------------------------------------------- deltas

export function deltaLabel(comparison: GuestMetricComparison, digits = 0) {
  if (comparison.deltaPercent === null) {
    if (comparison.delta === 0) {
      return "без изменений";
    }

    return `${comparison.delta > 0 ? "+" : ""}${formatNumber(comparison.delta, digits)}`;
  }

  const sign = comparison.deltaPercent > 0 ? "+" : "";
  return `${sign}${formatNumber(comparison.deltaPercent, 1)} %`;
}

export function deltaTone(
  comparison: GuestMetricComparison,
  direction: "up-is-good" | "down-is-good" = "up-is-good",
): BadgeTone {
  if (comparison.delta === 0) {
    return "neutral";
  }

  const improved =
    direction === "up-is-good" ? comparison.delta > 0 : comparison.delta < 0;

  return improved ? "good" : "danger";
}

// ---------------------------------------------------------------- hrefs

const listFilterKeys: Array<keyof GuestListFilters> = [
  "dateFrom",
  "dateTo",
  "storeId",
  "guestGroupId",
  "segment",
  "crmStatus",
  "gameStatus",
  "churnRisk",
  "rfm",
  "consent",
  "signal",
  "search",
  "page",
  "pageSize",
  "sort",
  "direction",
];

export function guestsPathHref(pathname: string, filters: GuestListFilters) {
  const params = new URLSearchParams();

  for (const key of listFilterKeys) {
    const value = filters[key];

    if (value) {
      params.set(key, value);
    }
  }

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function guestsHref(filters: GuestListFilters) {
  return guestsPathHref("/guests", filters);
}

export function guestListAnchorHref(filters: GuestListFilters) {
  return `${guestsPathHref("/guests", filters)}#guest-list`;
}

export function guestsReportHref(filters: GuestListFilters) {
  return guestsPathHref("/guests/report", {
    ...filters,
    page: "1",
    pageSize: "200",
  });
}

export function guestsExportHref(filters: GuestListFilters) {
  const exportFilters = { ...filters };
  delete exportFilters.page;
  delete exportFilters.pageSize;

  return guestsPathHref("/api/guests/export", exportFilters);
}

/** Merges dashboard scope (period, club, group) with a signal's own filters. */
export function signalListFilters(
  scope: Pick<
    GuestListFilters,
    "dateFrom" | "dateTo" | "storeId" | "guestGroupId"
  >,
  filters: GuestSignalListFilters | null,
): GuestListFilters {
  return {
    dateFrom: scope.dateFrom,
    dateTo: scope.dateTo,
    storeId: scope.storeId,
    guestGroupId: scope.guestGroupId,
    ...(filters ?? {}),
    page: "1",
    pageSize: "50",
  };
}

export function activeFilterChips(filters: GuestListFilters) {
  const chips: Array<{ key: keyof GuestListFilters; label: string }> = [];

  if (filters.segment && filters.segment !== "top") {
    chips.push({ key: "segment", label: segmentLabels[filters.segment] });
  }
  if (filters.crmStatus) {
    chips.push({
      key: "crmStatus",
      label: `CRM: ${crmStatusLabels[filters.crmStatus]}`,
    });
  }
  if (filters.gameStatus && filters.gameStatus !== "any") {
    chips.push({
      key: "gameStatus",
      label: gameStatusFilterLabels[filters.gameStatus],
    });
  }
  if (filters.churnRisk) {
    chips.push({
      key: "churnRisk",
      label: `Риск: ${churnRiskLabels[filters.churnRisk]}`,
    });
  }
  if (filters.rfm) {
    chips.push({ key: "rfm", label: `RFM: ${rfmSegmentLabels[filters.rfm]}` });
  }
  if (filters.consent) {
    chips.push({ key: "consent", label: consentLabels[filters.consent] });
  }
  if (filters.signal) {
    chips.push({ key: "signal", label: `Сигнал: ${filters.signal}` });
  }
  if (filters.search) {
    chips.push({ key: "search", label: `Поиск: ${filters.search}` });
  }

  return chips;
}

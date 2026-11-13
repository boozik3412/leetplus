import type { GuestListFilters } from "./guests.ts";

/**
 * «Новая группа гостей»: the step-by-step way to save a guest group. A group
 * is still a snapshot of the guest list for a set of filters (the API does
 * the counting); this module only turns a few plain choices into those
 * filters and back into a sentence a manager can read.
 */

export type GuestGroupTemplateKey =
  | "lost"
  | "risk"
  | "one_visit"
  | "repeat"
  | "new"
  | "best"
  | "rewards"
  | "all";

export type GuestGroupTemplate = {
  key: GuestGroupTemplateKey;
  title: string;
  /** Who gets in, in one short line. */
  hint: string;
  /** What a campaign for them usually is. */
  idea: string;
  filters: Pick<GuestListFilters, "segment" | "signal" | "rfm">;
};

export const guestGroupTemplates: GuestGroupTemplate[] = [
  {
    key: "lost",
    title: "Давно не приходили",
    hint: "Не были в клубе 30 дней и больше.",
    idea: "Вернуть: подарок или скидка на следующий визит.",
    filters: { segment: "lost" },
  },
  {
    key: "risk",
    title: "Начали пропадать",
    hint: "Не были 14–29 дней. Ещё помнят клуб.",
    idea: "Напомнить о себе, пока гость не ушёл совсем.",
    filters: { segment: "risk" },
  },
  {
    key: "one_visit",
    title: "Пришли один раз",
    hint: "Новые гости, которые так и не пришли второй раз.",
    idea: "Позвать на второй визит, пока впечатление свежее.",
    filters: { signal: "NEW_WITHOUT_SECOND_VISIT" },
  },
  {
    key: "repeat",
    title: "Постоянные",
    hint: "Были в клубе два раза и больше за период.",
    idea: "Поблагодарить, предложить абонемент или турнир.",
    filters: { segment: "repeat" },
  },
  {
    key: "new",
    title: "Новые",
    hint: "Впервые пришли за выбранный период.",
    idea: "Рассказать о клубе, игре и бонусах.",
    filters: { segment: "new" },
  },
  {
    key: "best",
    title: "Самые ценные",
    hint: "Ходят часто, недавно и тратят больше всех.",
    idea: "Персональное предложение, VIP-статус, приоритетная бронь.",
    filters: { rfm: "CHAMPION" },
  },
  {
    key: "rewards",
    title: "Ждут награду",
    hint: "Выиграли награду в игре, но ещё не забрали её.",
    idea: "Напомнить, что награда ждёт в клубе.",
    filters: { signal: "REWARDS_WAITING_CLAIM" },
  },
  {
    key: "all",
    title: "Все гости",
    hint: "Все, кто был в клубе за период.",
    idea: "Общие новости и акции.",
    filters: {},
  },
];

/**
 * Guest analytics always looks at the last three months (the list, the
 * report and saved groups alike), so the builder does not offer a period.
 */
export const GUEST_GROUP_WINDOW_MONTHS = 3;

export type GuestGroupChoice = {
  template: GuestGroupTemplateKey;
  storeId: string;
  onlyConsented: boolean;
};

export const defaultGuestGroupChoice: GuestGroupChoice = {
  template: "lost",
  storeId: "",
  onlyConsented: false,
};

export function guestGroupTemplate(key: GuestGroupTemplateKey) {
  return (
    guestGroupTemplates.find((template) => template.key === key) ??
    guestGroupTemplates[0]
  );
}

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function utcDay(value: Date) {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

/** The guest-list filters a choice stands for: the last three months. */
export function guestGroupFilters(
  choice: GuestGroupChoice,
  today: Date = new Date(),
): Omit<GuestListFilters, "page"> {
  const to = utcDay(today);
  const from = new Date(to);
  from.setUTCMonth(from.getUTCMonth() - GUEST_GROUP_WINDOW_MONTHS);
  const filters: Omit<GuestListFilters, "page"> = {
    dateFrom: isoDate(from),
    dateTo: isoDate(to),
    ...guestGroupTemplate(choice.template).filters,
  };

  if (choice.storeId) {
    filters.storeId = choice.storeId;
  }
  if (choice.onlyConsented) {
    filters.consent = "GRANTED";
  }

  return filters;
}

function dayMonth(value: Date) {
  return `${String(value.getUTCDate()).padStart(2, "0")}.${String(
    value.getUTCMonth() + 1,
  ).padStart(2, "0")}`;
}

/**
 * «Давно не приходили · Пушкинская · 13.11», the default group name. The
 * date says when the list was taken: a group does not refresh by itself.
 */
export function guestGroupName(
  choice: GuestGroupChoice,
  storeName: string | null,
  today: Date = new Date(),
) {
  return [
    guestGroupTemplate(choice.template).title,
    storeName ?? "вся сеть",
    dayMonth(today),
  ].join(" · ");
}

/** The whole choice as one sentence for the last step. */
export function guestGroupSentence(
  choice: GuestGroupChoice,
  storeName: string | null,
) {
  const template = guestGroupTemplate(choice.template);
  const where = storeName ? `в клубе «${storeName}»` : "во всей сети";
  const consent = choice.onlyConsented
    ? " Только те, кто согласился получать сообщения."
    : "";

  return `${template.title} ${where}. ${template.hint}${consent}`;
}

const segmentWords: Record<string, string> = {
  top: "все гости",
  active: "активные",
  new: "новые",
  repeat: "постоянные",
  risk: "начали пропадать",
  lost: "давно не приходили",
  quiet: "тихие",
};

const signalWords: Record<string, string> = {
  NEW_WITHOUT_SECOND_VISIT: "пришли один раз",
  REWARDS_WAITING_CLAIM: "ждут награду",
  REWARDS_EXPIRING: "награда скоро сгорит",
  VIP_AT_RISK: "ценные в риске",
  PLAYERS_GONE_IDLE: "перестали играть",
  ACTIVE_NOT_REGISTERED: "не в игре",
};

function shortDate(value: string) {
  const [year, month, day] = value.split("-");
  return day && month && year ? `${day}.${month}.${year.slice(2)}` : value;
}

/** A saved group's filters in plain words, for its card. */
export function guestGroupFiltersSummary(
  filters: Omit<GuestListFilters, "page">,
  storeNames: Map<string, string> = new Map(),
) {
  const parts: string[] = [];

  if (filters.signal) {
    parts.push(signalWords[filters.signal] ?? "по сигналу");
  } else if (filters.rfm === "CHAMPION") {
    parts.push("самые ценные");
  } else if (filters.segment) {
    parts.push(segmentWords[filters.segment] ?? filters.segment);
  }
  if (filters.storeId) {
    parts.push(storeNames.get(filters.storeId) ?? "один клуб");
  }
  if (filters.dateFrom && filters.dateTo) {
    parts.push(`${shortDate(filters.dateFrom)}–${shortDate(filters.dateTo)}`);
  }
  if (filters.consent === "GRANTED") {
    parts.push("с согласием");
  }
  if (filters.search) {
    parts.push(`поиск «${filters.search}»`);
  }

  return parts.length > 0 ? parts.join(" · ") : "все гости";
}

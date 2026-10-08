/**
 * Guest leaderboard ("Рейтинг"): pure rules shared by the public guest portal
 * and the tenant administration. No Prisma, no Nest: everything here is a
 * function of rows the services already read.
 *
 * Owner decisions (07.10.2026): monthly reset on the 1st; two main boards
 * (points and hours) plus sessions, missions and opened cases; club and network
 * scope; a guest without a nickname is shown as «Игрок ••1234» (last four phone
 * digits); play before game activation does not count; prizes are configured
 * per board in the «Рейтинг» tab and are not shown when not configured.
 */

export const LEADERBOARD_BOARDS = [
  'points',
  'hours',
  'sessions',
  'quests',
  'cases',
] as const;
export type LeaderboardBoard = (typeof LEADERBOARD_BOARDS)[number];
export const LEADERBOARD_MAIN_BOARDS: readonly LeaderboardBoard[] = [
  'points',
  'hours',
];
export type LeaderboardScope = 'club' | 'network';

/** A session counts for the «Сессии» board from this many played minutes. */
export const LEADERBOARD_MIN_SESSION_MINUTES = 30;
export const LEADERBOARD_TOP_SIZE = 10;
export const LEADERBOARD_PRIZE_PLACES = 3;
export const LEADERBOARD_NETWORK_SCOPE_KEY = 'network';

export type LeaderboardFormula = {
  hourPoints: number;
  questPoints: number;
  casePoints: number;
  checkInPoints: number;
};

export type LeaderboardPrize =
  | { kind: 'BONUS'; amount: number }
  | { kind: 'LOOT_BOX'; lootBoxId: string }
  | { kind: 'CUSTOM'; label: string };

/** Prizes of one scope: per board, places 1..3 (null = no prize). */
export type LeaderboardPrizeSet = Partial<
  Record<LeaderboardBoard, Array<LeaderboardPrize | null>>
>;

export type GuestLeaderboardConfig = {
  version: 1;
  networkEnabled: boolean;
  /** Clubs whose own board is switched off; they still count for the network. */
  disabledStoreIds: string[];
  boards: Record<LeaderboardBoard, boolean>;
  formula: LeaderboardFormula;
  /** Keyed by `network` or a store id. */
  prizes: Record<string, LeaderboardPrizeSet>;
  /** Hidden from every board and never awarded (moderation). */
  excludedProfileIds: string[];
};

export const DEFAULT_LEADERBOARD_FORMULA: LeaderboardFormula = {
  hourPoints: 10,
  questPoints: 30,
  casePoints: 5,
  checkInPoints: 5,
};

export function defaultLeaderboardConfig(): GuestLeaderboardConfig {
  return {
    version: 1,
    networkEnabled: true,
    disabledStoreIds: [],
    boards: {
      points: true,
      hours: true,
      sessions: true,
      quests: true,
      cases: true,
    },
    formula: { ...DEFAULT_LEADERBOARD_FORMULA },
    prizes: {},
    excludedProfileIds: [],
  };
}

const FORMULA_MAX = 10_000;
const BONUS_PRIZE_MAX = 1_000_000;
const CUSTOM_PRIZE_MAX_LENGTH = 80;
const MAX_EXCLUDED_PROFILES = 5_000;

export class LeaderboardConfigError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function uniqueIds(value: unknown, limit: number, field: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new LeaderboardConfigError(`${field}: ожидается список.`);
  }
  const ids = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string' || !item.trim() || item.length > 64) {
      throw new LeaderboardConfigError(`${field}: неверный идентификатор.`);
    }
    ids.add(item.trim());
  }
  if (ids.size > limit) {
    throw new LeaderboardConfigError(`${field}: слишком много значений.`);
  }
  return [...ids];
}

function formulaValue(value: unknown, fallback: number, field: string) {
  if (value === undefined || value === null) return fallback;
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > FORMULA_MAX
  ) {
    throw new LeaderboardConfigError(
      `Формула: «${field}» — целое число от 0 до ${FORMULA_MAX}.`,
    );
  }
  return value;
}

function normalizePrize(value: unknown): LeaderboardPrize | null {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)) {
    throw new LeaderboardConfigError('Приз: неверный формат.');
  }
  if (value.kind === 'BONUS') {
    const amount = value.amount;
    if (
      typeof amount !== 'number' ||
      !Number.isInteger(amount) ||
      amount < 1 ||
      amount > BONUS_PRIZE_MAX
    ) {
      throw new LeaderboardConfigError(
        'Приз бонусами: целое число от 1 до 1 000 000.',
      );
    }
    return { kind: 'BONUS', amount };
  }
  if (value.kind === 'LOOT_BOX') {
    if (typeof value.lootBoxId !== 'string' || !value.lootBoxId.trim()) {
      throw new LeaderboardConfigError('Приз-кейс: не выбран кейс.');
    }
    return { kind: 'LOOT_BOX', lootBoxId: value.lootBoxId.trim() };
  }
  if (value.kind === 'CUSTOM') {
    const label = typeof value.label === 'string' ? value.label.trim() : '';
    if (!label || label.length > CUSTOM_PRIZE_MAX_LENGTH) {
      throw new LeaderboardConfigError(
        `Свой приз: текст от 1 до ${CUSTOM_PRIZE_MAX_LENGTH} символов.`,
      );
    }
    return { kind: 'CUSTOM', label };
  }
  throw new LeaderboardConfigError('Приз: неизвестный тип.');
}

function normalizePrizeSet(value: unknown): LeaderboardPrizeSet {
  if (value === undefined || value === null) return {};
  if (!isRecord(value)) {
    throw new LeaderboardConfigError('Призы: неверный формат.');
  }
  const result: LeaderboardPrizeSet = {};
  for (const [board, places] of Object.entries(value)) {
    if (!(LEADERBOARD_BOARDS as readonly string[]).includes(board)) {
      throw new LeaderboardConfigError(`Призы: неизвестная таблица ${board}.`);
    }
    if (!Array.isArray(places) || places.length > LEADERBOARD_PRIZE_PLACES) {
      throw new LeaderboardConfigError('Призы: не больше трёх мест.');
    }
    const normalized = Array.from(
      { length: LEADERBOARD_PRIZE_PLACES },
      (_, i) => normalizePrize(places[i]),
    );
    if (normalized.some(Boolean)) {
      result[board as LeaderboardBoard] = normalized;
    }
  }
  return result;
}

/**
 * Validates an owner-supplied (or stored) config. Unknown keys are dropped;
 * invalid values throw, so a bad save never reaches the guest portal.
 */
export function normalizeLeaderboardConfig(
  input: unknown,
  validScopeKeys?: ReadonlySet<string>,
): GuestLeaderboardConfig {
  const base = defaultLeaderboardConfig();
  if (input === undefined || input === null) return base;
  if (!isRecord(input)) {
    throw new LeaderboardConfigError('Настройки рейтинга: неверный формат.');
  }

  const boards = { ...base.boards };
  if (input.boards !== undefined) {
    if (!isRecord(input.boards)) {
      throw new LeaderboardConfigError('Таблицы: неверный формат.');
    }
    for (const board of LEADERBOARD_BOARDS) {
      const flag = input.boards[board];
      if (flag !== undefined) boards[board] = flag === true;
    }
  }

  const formulaInput = isRecord(input.formula) ? input.formula : {};
  const formula: LeaderboardFormula = {
    hourPoints: formulaValue(
      formulaInput.hourPoints,
      base.formula.hourPoints,
      '1 час игры',
    ),
    questPoints: formulaValue(
      formulaInput.questPoints,
      base.formula.questPoints,
      'задание',
    ),
    casePoints: formulaValue(
      formulaInput.casePoints,
      base.formula.casePoints,
      'кейс',
    ),
    checkInPoints: formulaValue(
      formulaInput.checkInPoints,
      base.formula.checkInPoints,
      'чекин',
    ),
  };

  const prizes: Record<string, LeaderboardPrizeSet> = {};
  if (input.prizes !== undefined && input.prizes !== null) {
    if (!isRecord(input.prizes)) {
      throw new LeaderboardConfigError('Призы: неверный формат.');
    }
    for (const [scopeKey, set] of Object.entries(input.prizes)) {
      if (validScopeKeys && !validScopeKeys.has(scopeKey)) {
        throw new LeaderboardConfigError('Призы: неизвестный клуб.');
      }
      const normalized = normalizePrizeSet(set);
      if (Object.keys(normalized).length > 0) prizes[scopeKey] = normalized;
    }
  }

  return {
    version: 1,
    networkEnabled:
      input.networkEnabled === undefined ? true : input.networkEnabled === true,
    disabledStoreIds: uniqueIds(input.disabledStoreIds, 500, 'Клубы'),
    boards,
    formula,
    prizes,
    excludedProfileIds: uniqueIds(
      input.excludedProfileIds,
      MAX_EXCLUDED_PROFILES,
      'Исключённые игроки',
    ),
  };
}

export function enabledLeaderboardBoards(config: GuestLeaderboardConfig) {
  return LEADERBOARD_BOARDS.filter((board) => config.boards[board]);
}

/* ---------------------------------------------------------------- periods */

const zoneFormatters = new Map<string, Intl.DateTimeFormat>();

function zoneParts(value: Date, timeZone: string) {
  let formatter = zoneFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    zoneFormatters.set(timeZone, formatter);
  }
  const parts = Object.fromEntries(
    formatter
      .formatToParts(value)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

function zoneOffsetMs(value: Date, timeZone: string) {
  const p = zoneParts(value, timeZone);
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return wall - Math.floor(value.getTime() / 1000) * 1000;
}

/** The instant of local midnight on `year-month-01` in `timeZone`. */
function localMonthStart(year: number, month: number, timeZone: string) {
  const guess = Date.UTC(year, month - 1, 1);
  let instant = guess - zoneOffsetMs(new Date(guess), timeZone);
  instant = guess - zoneOffsetMs(new Date(instant), timeZone);
  return new Date(instant);
}

export function safeTimeZone(value: string | null | undefined) {
  const zone = value?.trim();
  if (!zone) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return zone;
  } catch {
    return 'UTC';
  }
}

const MONTH_NOMINATIVE = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
];
const MONTH_GENITIVE = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

export type LeaderboardPeriod = {
  key: string;
  label: string;
  timeZone: string;
  from: Date;
  to: Date;
  /** «1 ноября»: the local date when the month is summed up. */
  resultsLabel: string;
  daysLeft: number;
  progress: number;
};

/** The calendar month of `now` in `timeZone`; `shift` -1 = previous month. */
export function leaderboardMonth(
  now: Date,
  timeZone: string,
  shift = 0,
): LeaderboardPeriod {
  const zone = safeTimeZone(timeZone);
  const local = zoneParts(now, zone);
  const index = local.year * 12 + (local.month - 1) + shift;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  const nextYear = Math.floor((index + 1) / 12);
  const nextMonth = ((index + 1) % 12) + 1;
  const from = localMonthStart(year, month, zone);
  const to = localMonthStart(nextYear, nextMonth, zone);
  const span = to.getTime() - from.getTime();
  const elapsed = Math.min(Math.max(now.getTime() - from.getTime(), 0), span);

  return {
    key: `${year}-${String(month).padStart(2, '0')}`,
    label: MONTH_NOMINATIVE[month - 1],
    timeZone: zone,
    from,
    to,
    resultsLabel: `1 ${MONTH_GENITIVE[nextMonth - 1]}`,
    daysLeft: Math.max(
      0,
      Math.ceil(
        (to.getTime() - Math.max(now.getTime(), from.getTime())) / 86_400_000,
      ),
    ),
    progress: span > 0 ? Math.round((elapsed / span) * 1000) / 1000 : 0,
  };
}

/** Zone of the network board: the most common zone of its active clubs. */
export function networkTimeZone(
  stores: ReadonlyArray<{ timeZone?: string | null; name?: string | null }>,
) {
  const counts = new Map<string, number>();
  [...stores]
    .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'ru'))
    .forEach((store) => {
      const zone = safeTimeZone(store.timeZone);
      counts.set(zone, (counts.get(zone) ?? 0) + 1);
    });
  let best = 'UTC';
  let bestCount = 0;
  counts.forEach((count, zone) => {
    if (count > bestCount) {
      best = zone;
      bestCount = count;
    }
  });
  return best;
}

/* ----------------------------------------------------------------- values */

/** Activity of one profile in one club (storeId null: club unknown). */
export type LeaderboardActivityRow = {
  profileId: string;
  storeId: string | null;
  playMinutes: number;
  sessions: number;
  quests: number;
  cases: number;
  checkIns: number;
};

export type LeaderboardTotals = Omit<LeaderboardActivityRow, 'storeId'>;

/** Sums rows per profile, optionally only those of one club. */
export function leaderboardTotals(
  rows: readonly LeaderboardActivityRow[],
  storeId: string | null,
): Map<string, LeaderboardTotals> {
  const totals = new Map<string, LeaderboardTotals>();
  for (const row of rows) {
    if (storeId !== null && row.storeId !== storeId) continue;
    const current = totals.get(row.profileId) ?? {
      profileId: row.profileId,
      playMinutes: 0,
      sessions: 0,
      quests: 0,
      cases: 0,
      checkIns: 0,
    };
    current.playMinutes += row.playMinutes;
    current.sessions += row.sessions;
    current.quests += row.quests;
    current.cases += row.cases;
    current.checkIns += row.checkIns;
    totals.set(row.profileId, current);
  }
  return totals;
}

export function leaderboardValue(
  board: LeaderboardBoard,
  totals: LeaderboardTotals,
  formula: LeaderboardFormula,
) {
  switch (board) {
    case 'points':
      return (
        Math.round((totals.playMinutes * formula.hourPoints) / 60) +
        totals.quests * formula.questPoints +
        totals.cases * formula.casePoints +
        totals.checkIns * formula.checkInPoints
      );
    case 'hours':
      return totals.playMinutes;
    case 'sessions':
      return totals.sessions;
    case 'quests':
      return totals.quests;
    case 'cases':
      return totals.cases;
  }
}

export type LeaderboardStanding = {
  profileId: string;
  value: number;
  /** Competition ranking: equal values share a place (1, 2, 2, 4). */
  rank: number;
};

/** Profiles with a positive value, best first; `excluded` never ranks. */
export function rankLeaderboard(
  totals: Map<string, LeaderboardTotals>,
  board: LeaderboardBoard,
  formula: LeaderboardFormula,
  excluded: ReadonlySet<string> = new Set(),
): LeaderboardStanding[] {
  const values = [...totals.values()]
    .filter((row) => !excluded.has(row.profileId))
    .map((row) => ({
      profileId: row.profileId,
      value: leaderboardValue(board, row, formula),
    }))
    .filter((row) => row.value > 0)
    .sort(
      (a, b) => b.value - a.value || a.profileId.localeCompare(b.profileId),
    );

  let rank = 0;
  let previous: number | null = null;
  return values.map((row, index) => {
    if (row.value !== previous) {
      rank = index + 1;
      previous = row.value;
    }
    return { ...row, rank };
  });
}

/** What the guest still needs to overtake the nearest better place. */
export function leaderboardTarget(
  standings: readonly LeaderboardStanding[],
  profileId: string,
) {
  const index = standings.findIndex((row) => row.profileId === profileId);
  if (index < 0) {
    const last = standings.at(-1);
    return last
      ? { rank: last.rank, gap: last.value + 1, profileId: last.profileId }
      : null;
  }
  const me = standings[index];
  for (let i = index - 1; i >= 0; i -= 1) {
    if (standings[i].value > me.value) {
      return {
        rank: standings[i].rank,
        gap: standings[i].value - me.value + 1,
        profileId: standings[i].profileId,
      };
    }
  }
  return null;
}

/**
 * Rows the guest sees: the top, then (when the guest is further down) the
 * guest with one neighbour on each side.
 */
export function leaderboardVisibleRows(
  standings: readonly LeaderboardStanding[],
  profileId: string,
  topSize = LEADERBOARD_TOP_SIZE,
) {
  const rows = standings.slice(0, topSize).map((row) => ({
    standing: row,
    gapBefore: false,
  }));
  const index = standings.findIndex((row) => row.profileId === profileId);
  if (index >= topSize) {
    const start = Math.max(topSize, index - 1);
    standings.slice(start, index + 2).forEach((row, offset) => {
      rows.push({ standing: row, gapBefore: offset === 0 && start > topSize });
    });
  }
  return rows;
}

/* ------------------------------------------------------------------ names */

const DEFAULT_PROFILE_NAMES = new Set(['гость клуба', 'гость', 'игрок']);
const INITIALS_PATTERN = /^(\p{Lu}\.\s?)+$/u;

/**
 * True when the guest chose the name. Imported defaults (masked Langame
 * initials, the Langame id, «Гость клуба») are not nicknames.
 */
export function isGuestNickname(
  displayName: string | null | undefined,
  importedNames: ReadonlyArray<string | null | undefined> = [],
) {
  const name = displayName?.trim();
  if (!name) return false;
  if (DEFAULT_PROFILE_NAMES.has(name.toLocaleLowerCase('ru'))) return false;
  if (INITIALS_PATTERN.test(name)) return false;
  if (/^\d+$/.test(name)) return false;
  return !importedNames.some((value) => value?.trim() && value.trim() === name);
}

export function leaderboardPlayerName(input: {
  displayName: string | null | undefined;
  contactMasked: string | null | undefined;
  importedNames?: ReadonlyArray<string | null | undefined>;
}) {
  if (isGuestNickname(input.displayName, input.importedNames)) {
    return { name: input.displayName!.trim(), hasNickname: true };
  }
  const digits = input.contactMasked?.match(/(\d{4})\D*$/u)?.[1];
  return {
    name: digits ? `Игрок ••${digits}` : 'Игрок',
    hasNickname: false,
  };
}

/* ----------------------------------------------------------------- prizes */

function pluralRu(value: number, forms: [string, string, string]) {
  const abs = Math.abs(value) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (last > 1 && last < 5) return forms[1];
  if (last === 1) return forms[0];
  return forms[2];
}

export function leaderboardPrizeLabel(
  prize: LeaderboardPrize,
  lootBoxNames: ReadonlyMap<string, string>,
) {
  switch (prize.kind) {
    case 'BONUS':
      return `${prize.amount.toLocaleString('ru-RU')} ${pluralRu(prize.amount, ['бонус', 'бонуса', 'бонусов'])}`;
    case 'LOOT_BOX': {
      const name = lootBoxNames.get(prize.lootBoxId);
      return name ? `Кейс «${name}»` : null;
    }
    case 'CUSTOM':
      return prize.label;
  }
}

/** Places 1..3 with a configured prize for one scope and board. */
export function leaderboardPrizes(
  config: GuestLeaderboardConfig,
  scopeKey: string,
  board: LeaderboardBoard,
  lootBoxNames: ReadonlyMap<string, string>,
) {
  const places = config.prizes[scopeKey]?.[board] ?? [];
  return places.flatMap((prize, index) => {
    if (!prize) return [];
    const label = leaderboardPrizeLabel(prize, lootBoxNames);
    return label ? [{ place: index + 1, label }] : [];
  });
}

export function leaderboardPrizeLootBoxIds(config: GuestLeaderboardConfig) {
  const ids = new Set<string>();
  Object.values(config.prizes).forEach((set) =>
    Object.values(set).forEach((places) =>
      places?.forEach((prize) => {
        if (prize?.kind === 'LOOT_BOX') ids.add(prize.lootBoxId);
      }),
    ),
  );
  return [...ids];
}

/**
 * Guest leaderboard («Рейтинг») of the public game: the API contract of
 * `GET /guest-portal/session/leaderboard` and the wording of values.
 */

export type GuestLeaderboardBoard =
  | "points"
  | "hours"
  | "sessions"
  | "quests"
  | "cases";
export type GuestLeaderboardScope = "club" | "network";

export type GuestLeaderboardEntry = {
  rank: number;
  name: string;
  value: number;
  isMe: boolean;
  movement: number | null;
  isNew: boolean;
  crown: boolean;
  gapBefore: boolean;
  storeName: string | null;
};

export type GuestLeaderboard = {
  enabled: boolean;
  generatedAt: string;
  scope: GuestLeaderboardScope;
  board: GuestLeaderboardBoard;
  scopes: Array<{ scope: GuestLeaderboardScope; label: string }>;
  boards: GuestLeaderboardBoard[];
  period: {
    key: string;
    label: string;
    resultsLabel: string;
    daysLeft: number;
    progress: number;
  } | null;
  formula: {
    hourPoints: number;
    questPoints: number;
    casePoints: number;
    checkInPoints: number;
  } | null;
  unit: "points" | "minutes" | "count";
  totalPlayers: number;
  entries: GuestLeaderboardEntry[];
  me: {
    name: string;
    hasNickname: boolean;
    rank: number | null;
    value: number;
    movement: number | null;
    excluded: boolean;
  } | null;
  target: { rank: number; gap: number; name: string } | null;
  prizes: Array<{ place: number; label: string }>;
};

export const LEADERBOARD_MAIN_BOARDS: readonly GuestLeaderboardBoard[] = [
  "points",
  "hours",
];

export const LEADERBOARD_BOARD_LABELS: Record<GuestLeaderboardBoard, string> = {
  points: "Общий зачёт",
  hours: "Часы",
  sessions: "Сессии",
  quests: "Задания",
  cases: "Кейсы",
};

export const LEADERBOARD_BOARD_HINTS: Record<GuestLeaderboardBoard, string> = {
  points: "очки за всё",
  hours: "время в игре",
  sessions: "от 30 минут",
  quests: "и шаги пропуска",
  cases: "открытые",
};

type Forms = readonly [string, string, string];

const FORMS: Record<Exclude<GuestLeaderboardBoard, "hours">, Forms> = {
  points: ["очко", "очка", "очков"],
  sessions: ["сессия", "сессии", "сессий"],
  quests: ["задание", "задания", "заданий"],
  cases: ["кейс", "кейса", "кейсов"],
};

export function pluralRu(value: number, forms: Forms) {
  const abs = Math.abs(value) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (last > 1 && last < 5) return forms[1];
  if (last === 1) return forms[0];
  return forms[2];
}

function formatInteger(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

export function formatPlayMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} мин`;
  return rest ? `${formatInteger(hours)} ч ${rest} мин` : `${formatInteger(hours)} ч`;
}

/** The bare value: «1 695», «18 ч 40 мин». */
export function formatLeaderboardNumber(
  board: GuestLeaderboardBoard,
  value: number,
) {
  return board === "hours" ? formatPlayMinutes(value) : formatInteger(value);
}

/** The unit word after a number: «очков», «сессии»; empty for hours. */
export function leaderboardUnitWord(
  board: GuestLeaderboardBoard,
  value: number,
) {
  return board === "hours" ? "" : pluralRu(value, FORMS[board]);
}

/** «1 695 очков», «18 ч 40 мин», «14 сессий». */
export function formatLeaderboardValue(
  board: GuestLeaderboardBoard,
  value: number,
) {
  if (board === "hours") return formatPlayMinutes(value);
  return `${formatInteger(value)} ${pluralRu(value, FORMS[board])}`;
}

/**
 * What the guest still needs for the next place. Points are also told in
 * missions, the clearest action that earns them.
 */
export function formatLeaderboardGap(
  board: GuestLeaderboardBoard,
  gap: number,
  formula: GuestLeaderboard["formula"],
) {
  if (board === "hours") return `${formatPlayMinutes(gap)} игры`;
  const base = formatLeaderboardValue(board, gap);
  if (board === "points" && formula && formula.questPoints > 0) {
    const quests = Math.ceil(gap / formula.questPoints);
    return `${base} ≈ ${quests} ${pluralRu(quests, FORMS.quests)}`;
  }
  return base;
}

export function formatDaysLeft(days: number) {
  if (days <= 0) return "итоги сегодня";
  return `до итогов ${days} ${pluralRu(days, ["день", "дня", "дней"])}`;
}

export function formatFormula(formula: NonNullable<GuestLeaderboard["formula"]>) {
  return [
    `1 час игры = ${formula.hourPoints}`,
    `задание = ${formula.questPoints}`,
    `кейс = ${formula.casePoints}`,
    `чекин = ${formula.checkInPoints}`,
  ].join(" · ");
}

/** «▲3», «▼2», «новый» or nothing (no comparison yet). */
export function formatMovement(entry: {
  movement: number | null;
  isNew?: boolean;
}): { text: string; tone: "up" | "down" | "same" | "new" } | null {
  if (entry.isNew) return { text: "новый", tone: "new" };
  if (entry.movement === null) return null;
  if (entry.movement > 0) return { text: `▲${entry.movement}`, tone: "up" };
  if (entry.movement < 0) {
    return { text: `▼${Math.abs(entry.movement)}`, tone: "down" };
  }
  return { text: "—", tone: "same" };
}

export function leaderboardInitial(name: string) {
  if (name.startsWith("Игрок")) return "#";
  return (name.trim().charAt(0) || "#").toLocaleUpperCase("ru");
}

export function leaderboardRequestPath(input: {
  scope?: GuestLeaderboardScope | null;
  board?: GuestLeaderboardBoard | null;
}) {
  const search = new URLSearchParams();
  if (input.scope) search.set("scope", input.scope);
  if (input.board) search.set("board", input.board);
  const query = search.toString();
  return `/api/guest-portal/session/leaderboard${query ? `?${query}` : ""}`;
}

export type LeaderboardSliceRow =
  | { kind: "entry"; rank: number; name: string; value: number; isMe: boolean }
  | { kind: "gap" }
  | { kind: "cutoff" }
  | { kind: "outside"; value: number };

/**
 * The scoreboard slice on the game home: the leader, then the guest with one
 * neighbour on each side. A guest outside the board sees the leader, the last
 * place, the board's cutoff line and themselves under it. `goal` is the one
 * line under the slice; `rows` is empty when nobody has scored yet.
 */
export function leaderboardSlice(data: GuestLeaderboard): {
  rows: LeaderboardSliceRow[];
  goal: string;
} {
  const me = data.me;
  const leader = data.entries[0];
  if (!me || !leader) {
    return { rows: [], goal: "Таблица пока пуста: первые очки сделают вас лидером" };
  }
  const entryRow = (entry: GuestLeaderboardEntry): LeaderboardSliceRow => ({
    kind: "entry",
    rank: entry.rank,
    name: entry.name,
    value: entry.value,
    isMe: entry.isMe,
  });
  const goal = data.target
    ? `До ${data.target.rank}-го места ${formatLeaderboardValue(data.board, data.target.gap)}`
    : "Вы ведёте гонку, удержите первое место";
  const mine = data.entries.findIndex((entry) => entry.isMe);

  if (me.rank && mine >= 0) {
    const around = data.entries.slice(Math.max(0, mine - 1), mine + 2);
    const rows: LeaderboardSliceRow[] = [];
    if (around[0] !== leader) {
      rows.push(entryRow(leader));
      if (around[0].rank > leader.rank + 1 || around[0].gapBefore) {
        rows.push({ kind: "gap" });
      }
    }
    rows.push(...around.map(entryRow));
    return { rows, goal };
  }

  const rows: LeaderboardSliceRow[] = [entryRow(leader)];
  const target = data.target;
  if (target && target.rank !== leader.rank) {
    const last = data.entries.find((entry) => entry.rank === target.rank);
    if (!last || last !== data.entries[1]) rows.push({ kind: "gap" });
    rows.push({
      kind: "entry",
      rank: target.rank,
      name: target.name,
      // Outside the board the API's gap is the last place's value plus one.
      value: last?.value ?? Math.max(0, target.gap - 1),
      isMe: false,
    });
  }
  rows.push({ kind: "cutoff" }, { kind: "outside", value: me.value });
  return { rows, goal };
}

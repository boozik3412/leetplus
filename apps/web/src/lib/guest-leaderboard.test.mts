import assert from "node:assert/strict";
import test from "node:test";
import {
  formatDaysLeft,
  formatFormula,
  formatLeaderboardGap,
  formatLeaderboardValue,
  formatMovement,
  formatPlayMinutes,
  leaderboardInitial,
  leaderboardRequestPath,
  leaderboardSlice,
  type GuestLeaderboard,
  type GuestLeaderboardEntry,
} from "./guest-leaderboard.ts";

const formula = { hourPoints: 10, questPoints: 30, casePoints: 5, checkInPoints: 5 };

test("formats board values in Russian", () => {
  assert.equal(formatLeaderboardValue("points", 1695), "1 695 очков");
  assert.equal(formatLeaderboardValue("points", 21), "21 очко");
  assert.equal(formatLeaderboardValue("sessions", 3), "3 сессии");
  assert.equal(formatLeaderboardValue("quests", 11), "11 заданий");
  assert.equal(formatLeaderboardValue("cases", 1), "1 кейс");
  assert.equal(formatLeaderboardValue("hours", 1120), "18 ч 40 мин");
  assert.equal(formatPlayMinutes(45), "45 мин");
  assert.equal(formatPlayMinutes(120), "2 ч");
});

test("tells the gap to the next place", () => {
  assert.equal(
    formatLeaderboardGap("points", 104, formula),
    "104 очка ≈ 4 задания",
  );
  assert.equal(formatLeaderboardGap("points", 104, null), "104 очка");
  assert.equal(formatLeaderboardGap("hours", 48, formula), "48 мин игры");
  assert.equal(formatLeaderboardGap("cases", 2, formula), "2 кейса");
});

test("formats period, formula and movement", () => {
  assert.equal(formatDaysLeft(24), "до итогов 24 дня");
  assert.equal(formatDaysLeft(21), "до итогов 21 день");
  assert.equal(formatDaysLeft(0), "итоги сегодня");
  assert.equal(
    formatFormula(formula),
    "1 час игры = 10 · задание = 30 · кейс = 5 · чекин = 5",
  );
  assert.deepEqual(formatMovement({ movement: 3 }), { text: "▲3", tone: "up" });
  assert.deepEqual(formatMovement({ movement: -2 }), { text: "▼2", tone: "down" });
  assert.deepEqual(formatMovement({ movement: 0 }), { text: "—", tone: "same" });
  assert.deepEqual(formatMovement({ movement: null, isNew: true }), {
    text: "новый",
    tone: "new",
  });
  assert.equal(formatMovement({ movement: null }), null);
});

test("builds avatars and the request path", () => {
  assert.equal(leaderboardInitial("Игрок ••4417"), "#");
  assert.equal(leaderboardInitial("ruslan"), "R");
  assert.equal(
    leaderboardRequestPath({ scope: "network", board: "hours" }),
    "/api/guest-portal/session/leaderboard?scope=network&board=hours",
  );
  assert.equal(
    leaderboardRequestPath({}),
    "/api/guest-portal/session/leaderboard",
  );
});

function board(overrides: Partial<GuestLeaderboard>): GuestLeaderboard {
  return {
    enabled: true,
    generatedAt: "2026-11-12T10:00:00Z",
    scope: "club",
    board: "points",
    scopes: [],
    boards: ["points"],
    period: { key: "2026-11", label: "Ноябрь", resultsLabel: "1 декабря", daysLeft: 19, progress: 0.4 },
    formula: null,
    unit: "points",
    totalPlayers: 50,
    entries: [],
    me: null,
    target: null,
    prizes: [],
    ...overrides,
  };
}

function entry(rank: number, value: number, extra: Partial<GuestLeaderboardEntry> = {}): GuestLeaderboardEntry {
  return {
    rank,
    name: `P${rank}`,
    value,
    isMe: false,
    movement: null,
    isNew: false,
    crown: false,
    gapBefore: false,
    storeName: null,
    ...extra,
  };
}

const me = (rank: number | null, value: number) => ({
  name: "Я",
  hasNickname: true,
  rank,
  value,
  movement: null,
  excluded: false,
});

const shape = (rows: ReturnType<typeof leaderboardSlice>["rows"]) =>
  rows.map((row) =>
    row.kind === "entry" ? `${row.isMe ? "*" : ""}${row.rank}:${row.value}` : row.kind,
  );

test("slice: ranked guest sees the leader, a gap and both neighbours", () => {
  const top = Array.from({ length: 10 }, (_, i) => entry(i + 1, 1000 - i * 50));
  const slice = leaderboardSlice(
    board({
      entries: [
        ...top,
        entry(22, 212, { gapBefore: true }),
        entry(23, 195, { isMe: true }),
        entry(24, 180),
      ],
      me: me(23, 195),
      target: { rank: 22, gap: 18, name: "P22" },
    }),
  );
  assert.deepEqual(shape(slice.rows), ["1:1000", "gap", "22:212", "*23:195", "24:180"]);
  assert.equal(slice.goal, "До 22-го места 18 очков");
});

test("slice: second place has no gap, the leader keeps the lead", () => {
  const entries = [entry(1, 900), entry(2, 800, { isMe: true }), entry(3, 700)];
  assert.deepEqual(
    shape(leaderboardSlice(board({ entries, me: me(2, 800), target: { rank: 1, gap: 101, name: "P1" } })).rows),
    ["1:900", "*2:800", "3:700"],
  );
  const leading = leaderboardSlice(
    board({
      entries: [entry(1, 900, { isMe: true }), entry(2, 800)],
      me: me(1, 900),
    }),
  );
  assert.deepEqual(shape(leading.rows), ["*1:900", "2:800"]);
  assert.equal(leading.goal, "Вы ведёте гонку, удержите первое место");
});

test("slice: a guest outside the board sits under the cutoff line", () => {
  const top = Array.from({ length: 10 }, (_, i) => entry(i + 1, 1000 - i * 50));
  const slice = leaderboardSlice(
    board({ entries: top, me: me(null, 0), target: { rank: 50, gap: 22, name: "kotik" } }),
  );
  assert.deepEqual(shape(slice.rows), ["1:1000", "gap", "50:21", "cutoff", "outside"]);
  assert.equal(slice.goal, "До 50-го места 22 очка");

  const small = leaderboardSlice(
    board({ entries: [entry(1, 40), entry(2, 9)], me: me(null, 0), target: { rank: 2, gap: 10, name: "P2" } }),
  );
  assert.deepEqual(shape(small.rows), ["1:40", "2:9", "cutoff", "outside"]);
});

test("slice: an empty board has no rows and invites the first points", () => {
  const slice = leaderboardSlice(board({ me: me(null, 0) }));
  assert.deepEqual(slice.rows, []);
  assert.equal(slice.goal, "Таблица пока пуста: первые очки сделают вас лидером");
});

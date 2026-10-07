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

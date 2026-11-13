import assert from "node:assert/strict";
import test from "node:test";
import {
  gameCompletionStatusLabel,
  gameCompletionStatusTone,
  gameCompletionTypeLabel,
  gameCompletionsHref,
} from "./game-completions.ts";

test("names the activity type with the mission trigger", () => {
  assert.equal(
    gameCompletionTypeLabel({ kind: "MISSION", triggerKind: "CHECK_IN" }),
    "Миссия · чекин в клубе",
  );
  assert.equal(
    gameCompletionTypeLabel({ kind: "MISSION", triggerKind: "SOMETHING" }),
    "Миссия",
  );
  assert.equal(
    gameCompletionTypeLabel({ kind: "CASE", triggerKind: "CHECK_IN" }),
    "Кейс",
  );
  assert.equal(
    gameCompletionTypeLabel({ kind: "MANUAL", triggerKind: null }),
    "Ручная награда",
  );
});

test("uses the guest card wording for the reward status", () => {
  const reward = {
    label: "500 бонусов",
    type: "BONUS_BALANCE",
    amount: 500,
    paidAt: null,
    expiresAt: null,
  };
  assert.equal(
    gameCompletionStatusLabel({ ...reward, status: "PAID" }),
    "бонус начислен",
  );
  assert.equal(
    gameCompletionStatusLabel({ ...reward, status: "PENDING" }),
    "ожидает проверки",
  );
  assert.equal(
    gameCompletionStatusLabel({ ...reward, type: "ITEM", status: "PAID" }),
    "награда выдана",
  );
  assert.equal(gameCompletionStatusTone("PAID"), "done");
  assert.equal(gameCompletionStatusTone("PENDING"), "waiting");
  assert.equal(gameCompletionStatusTone("APPROVED"), "open");
});

test("links the scene to the list of one club", () => {
  assert.equal(
    gameCompletionsHref("store 1"),
    "/visualization/game-activity?store=store%201",
  );
});

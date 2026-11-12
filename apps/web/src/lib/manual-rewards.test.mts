import assert from "node:assert/strict";
import test from "node:test";
import { buildRewardReasons } from "./manual-rewards.ts";

const mission = (
  id: string,
  name: string,
  status: "ACTIVE" | "ARCHIVED" | "PAUSED",
  updatedAt: string,
) => ({
  id,
  name,
  status,
  missionType: "CUSTOM" as const,
  updatedAt,
});

test("presets are offered when there are no missions", () => {
  const reasons = buildRewardReasons([]);

  assert.deepEqual(
    reasons.map((reason) => reason.label),
    ["Привёл друга", "Турнир", "День рождения", "Другое"],
  );
  assert.ok(reasons.every((reason) => reason.missionId === null));
});

test("existing missions come first, archived ones are hidden", () => {
  const reasons = buildRewardReasons([
    mission("a", "Финал турнира", "ACTIVE", "2026-11-01T00:00:00Z"),
    mission("b", "Старая акция", "ARCHIVED", "2026-11-02T00:00:00Z"),
  ]);

  assert.equal(reasons[0].missionId, "a");
  assert.equal(reasons[0].key, "mission:a");
  assert.ok(!reasons.some((reason) => reason.label === "Старая акция"));
});

test("a mission named like a preset replaces the preset; duplicates keep the newest", () => {
  const reasons = buildRewardReasons([
    mission("old", "Привёл друга", "PAUSED", "2026-10-01T00:00:00Z"),
    mission("new", " привёл друга ", "ACTIVE", "2026-11-05T00:00:00Z"),
  ]);
  const referral = reasons.filter(
    (reason) => reason.label.toLocaleLowerCase("ru-RU") === "привёл друга",
  );

  assert.equal(referral.length, 1);
  assert.equal(referral[0].missionId, "new");
  assert.equal(reasons.length, 4);
});

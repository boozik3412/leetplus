import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeSetupProgress,
  setupChecklistVisible,
  setupStepCopy,
  setupStepKeys,
} from "./setup-progress.ts";

const steps = (done: boolean[]) =>
  setupStepKeys.map((key, index) => ({ key, done: done[index] ?? false }));

test("keeps the five steps in order and recounts what is done", () => {
  const progress = normalizeSetupProgress({
    steps: [...steps([true, false, true, false, false])].reverse(),
    completed: 99,
    total: 99,
    hasData: false,
  });

  assert.deepEqual(
    progress?.steps.map((step) => step.key),
    ["langame", "clubs", "staff", "mission", "dailyReport"],
  );
  assert.equal(progress?.completed, 2);
  assert.equal(progress?.total, 5);
  assert.equal(setupChecklistVisible(progress), true);
});

test("hides the checklist after all five steps", () => {
  const progress = normalizeSetupProgress({
    steps: steps([true, true, true, true, true]),
    hasData: true,
  });

  assert.equal(progress?.completed, 5);
  assert.equal(setupChecklistVisible(progress), false);
});

test("drops a broken answer instead of guessing", () => {
  assert.equal(normalizeSetupProgress(null), null);
  assert.equal(normalizeSetupProgress({ steps: "x", hasData: false }), null);
  assert.equal(
    normalizeSetupProgress({ steps: [{ key: "langame" }], hasData: false }),
    null,
  );
  assert.equal(normalizeSetupProgress({ steps: [], hasData: false }), null);
  assert.equal(setupChecklistVisible(null), false);
});

test("ignores step keys a newer API may add", () => {
  const progress = normalizeSetupProgress({
    steps: [...steps([true, true, true, true, true]), { key: "x", done: false }],
    hasData: true,
  });

  assert.equal(progress?.total, 5);
  assert.equal(setupChecklistVisible(progress), false);
});

test("every step links to a cabinet page", () => {
  for (const key of setupStepKeys) {
    assert.match(setupStepCopy[key].href, /^\/[a-z]/);
  }
});

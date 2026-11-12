import assert from "node:assert/strict";
import test from "node:test";
import {
  buildChecklistToday,
  dayKey,
  shiftDayKey,
  type TodayRun,
  type TodayTask,
} from "./checklist-today.ts";

const anna = { id: "anna", fullName: "Анна", email: "a@example.test" };
const ivan = { id: "ivan", fullName: "Иван", email: "i@example.test" };
const center = { id: "c", name: "Центр", isActive: true };

function run(id: string, extra: Partial<TodayRun> = {}): TodayRun {
  return {
    id,
    title: `Чек-лист ${id}`,
    status: "IN_PROGRESS",
    activityDate: "2026-11-12T07:00:00.000Z",
    requiredItemsDone: 4,
    requiredItemsTotal: 8,
    evidenceDone: 0,
    evidenceTotal: 0,
    failedItems: 0,
    overdue: 0,
    store: center,
    assignedToUser: anna,
    ...extra,
  };
}

function task(id: string, extra: Partial<TodayTask> = {}): TodayTask {
  return {
    id,
    status: "OPEN",
    dueAt: "2026-11-12T15:00:00.000Z",
    assignedToUser: { id: "anna" },
    ...extra,
  };
}

test("the day is the viewer's own day, not UTC", () => {
  // 22:30 UTC on the 11th is already the 12th in Moscow.
  assert.equal(dayKey("2026-11-11T22:30:00.000Z", "UTC"), "2026-11-11");
  assert.equal(dayKey("2026-11-11T22:30:00.000Z", "Europe/Moscow"), "2026-11-12");
  assert.equal(shiftDayKey("2026-11-01", -1), "2026-10-31");
  assert.equal(shiftDayKey("2026-12-31", 1), "2027-01-01");
});

test("one card per person with today's runs, old overdue runs and tasks", () => {
  const today = buildChecklistToday(
    [
      run("open", { requiredItemsDone: 8, requiredItemsTotal: 12 }),
      run("yesterday", { activityDate: "2026-11-11T07:00:00.000Z" }),
      run("late", {
        activityDate: "2026-11-10T07:00:00.000Z",
        overdue: 1,
        requiredItemsDone: 0,
        requiredItemsTotal: 4,
      }),
      run("ivan", {
        assignedToUser: ivan,
        status: "ON_REVIEW",
        requiredItemsDone: 6,
        requiredItemsTotal: 6,
      }),
      run("canceled", { status: "CANCELED" }),
    ],
    [
      task("t1"),
      task("t2", { status: "DONE" }),
      task("t3", { dueAt: "2026-11-13T15:00:00.000Z" }),
      task("t4", { status: "CANCELED" }),
    ],
    { today: "2026-11-12", timeZone: "Europe/Moscow" },
  );

  assert.deepEqual(
    today.people.map((person) => [person.name, person.runs.map((r) => r.id)]),
    [
      ["Анна", ["late", "open"]],
      ["Иван", ["ivan"]],
    ],
  );
  const [anna] = today.people;
  assert.equal(anna.overdueRuns, 1);
  assert.equal(anna.tasksDone, 1);
  assert.equal(anna.tasksTotal, 2);
  assert.deepEqual(anna.stores, ["Центр"]);
  assert.equal(today.requiredDone, 8 + 0 + 6);
  assert.equal(today.requiredTotal, 12 + 4 + 6);
  assert.equal(today.percent, 64);
  assert.equal(today.onReviewRuns, 1);
});

test("unassigned runs go last and an empty day has no percent", () => {
  const today = buildChecklistToday(
    [run("free", { assignedToUser: null }), run("a")],
    [],
    { today: "2026-11-12", timeZone: "UTC" },
  );
  assert.deepEqual(
    today.people.map((person) => person.name),
    ["Анна", "Без ответственного"],
  );
  assert.equal(
    buildChecklistToday([], [], { today: "2026-11-12" }).percent,
    null,
  );
});

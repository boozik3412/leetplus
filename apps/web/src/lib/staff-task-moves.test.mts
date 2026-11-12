import assert from "node:assert/strict";
import test from "node:test";
import {
  allowedStaffTaskTargets,
  staffTaskCandidateUserIds,
  staffTaskMoveRefusal,
  staffTaskMoves,
  staffTaskStatusRequest,
  type StaffTaskActor,
  type StaffTaskMoveSubject,
} from "./staff-task-moves.ts";

const admin: StaffTaskActor = {
  id: "admin",
  role: "CLUB_ADMINISTRATOR",
  isPlatformAdmin: false,
};
const manager: StaffTaskActor = {
  id: "manager",
  role: "CLUB_MANAGER",
  isPlatformAdmin: false,
};
const stranger: StaffTaskActor = {
  id: "other",
  role: "TRAINEE",
  isPlatformAdmin: false,
};

function task(
  status: StaffTaskMoveSubject["status"],
  extra: Partial<StaffTaskMoveSubject> = {},
): StaffTaskMoveSubject {
  return { status, assignedToUserId: "admin", candidateUserIds: [], ...extra };
}

test("the assignee walks the task forward one step at a time", () => {
  assert.deepEqual(allowedStaffTaskTargets(task("OPEN"), admin), [
    "IN_PROGRESS",
    "CANCELED",
  ]);
  assert.deepEqual(allowedStaffTaskTargets(task("IN_PROGRESS"), admin), [
    "ON_REVIEW",
    "CANCELED",
  ]);
  assert.equal(
    staffTaskMoveRefusal(task("OPEN"), "ON_REVIEW", admin),
    "Задачи идут по порядку: Новые → В работе → На проверке → Готово.",
  );
});

test("only another reviewer accepts a task on review", () => {
  assert.deepEqual(
    staffTaskMoves(task("ON_REVIEW"), admin).map((move) => move.status),
    ["IN_PROGRESS"],
  );
  assert.deepEqual(
    staffTaskMoves(task("ON_REVIEW"), manager).map((move) => move.status),
    ["IN_PROGRESS", "DONE"],
  );
  assert.match(
    staffTaskMoveRefusal(
      task("ON_REVIEW", { assignedToUserId: "manager" }),
      "DONE",
      manager,
    ) ?? "",
    /Свою задачу принимает другой/,
  );
});

test("a shared task can be taken by any of its candidates", () => {
  const shared = task("OPEN", {
    assignedToUserId: null,
    candidateUserIds: ["other"],
  });
  assert.deepEqual(allowedStaffTaskTargets(shared, stranger), ["IN_PROGRESS"]);
  assert.match(
    staffTaskMoveRefusal(task("OPEN"), "IN_PROGRESS", stranger) ?? "",
    /ответственный или руководитель/,
  );
});

test("closed tasks do not move and cancelling uses PATCH", () => {
  assert.deepEqual(allowedStaffTaskTargets(task("DONE"), manager), []);
  assert.equal(
    staffTaskMoveRefusal(task("CANCELED"), "OPEN", manager),
    "Закрытую задачу уже не перенести.",
  );
  assert.deepEqual(staffTaskStatusRequest("a/b", "CANCELED"), {
    url: "/api/staff/tasks/a%2Fb",
    method: "PATCH",
  });
  assert.equal(staffTaskStatusRequest("a", "DONE").method, "POST");
});

test("reads candidate ids from task labels", () => {
  assert.deepEqual(
    staffTaskCandidateUserIds({ candidateUserIds: ["a", "", 3, "b"] }),
    ["a", "b"],
  );
  assert.deepEqual(staffTaskCandidateUserIds(null), []);
  assert.deepEqual(staffTaskCandidateUserIds(["a"]), []);
});

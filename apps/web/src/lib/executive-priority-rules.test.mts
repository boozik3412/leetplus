import assert from "node:assert/strict";
import test from "node:test";
import {
  hasConfirmedDecline,
  priorityCount,
} from "./executive-priority-rules.ts";
import {
  staffPriorityHref,
  staffPriorityTarget,
} from "./staff-priorities-types.ts";

test("decline needs two confirmed periods; known zero can decline and old API absence cannot", () => {
  const metric = {
    state: "AVAILABLE",
    value: 0,
    comparison: { previousValue: 100, absoluteDelta: -100 },
  };
  assert.equal(hasConfirmedDecline(metric as never), true);
  for (const state of ["PARTIAL", "MISSING", "STALE", "FAILED"])
    assert.equal(hasConfirmedDecline({ ...metric, state } as never), false);
  assert.equal(hasConfirmedDecline(undefined), false);
  assert.equal(
    hasConfirmedDecline({ ...metric, comparison: null } as never),
    false,
  );
  assert.equal(
    hasConfirmedDecline({
      ...metric,
      comparison: { previousValue: null, absoluteDelta: -1 },
    } as never),
    false,
  );
  assert.equal(
    hasConfirmedDecline({
      ...metric,
      comparison: { previousValue: 100, absoluteDelta: 0 },
    } as never),
    false,
  );
});
test("details retain all clubs and use exact existing task/run/user selectors", () => {
  const url = new URL(
    staffPriorityHref(["a", "b"], "TRAINING_INCOMPLETE"),
    "http://localhost",
  );
  assert.deepEqual(url.searchParams.getAll("storeIds"), ["a", "b"]);
  assert.equal(url.searchParams.has("dateFrom"), false);
  assert.equal(
    staffPriorityTarget({ target: { type: "TASK", id: "a&b" } } as never),
    "/staff/tasks?taskId=a%26b",
  );
  assert.equal(
    staffPriorityTarget({ target: { type: "CHECKLIST", id: "run" } } as never),
    "/staff/checklists?runId=run",
  );
  assert.equal(
    staffPriorityTarget({
      target: { type: "TRAINING_PROFILE", userId: "user" },
    } as never),
    "/staff/training-profiles?userId=user",
  );
  assert.equal(staffPriorityTarget({ target: null } as never), null);
});
test("counts are readable in Russian", () => {
  assert.equal(priorityCount(1, "TASKS"), "1 задача");
  assert.equal(priorityCount(2, "CHECKLISTS"), "2 чек-листа");
  assert.equal(priorityCount(5, "EMPLOYEES"), "5 сотрудников");
});

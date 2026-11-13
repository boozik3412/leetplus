import assert from "node:assert/strict";
import test from "node:test";
import { checklistTimingSummary } from "./checklist-timing-summary.ts";
import type {
  StaffChecklistAnswerTiming,
  StaffChecklistTimingStatus,
} from "./staff-checklists.ts";

function timing(
  status: StaffChecklistTimingStatus,
  affectsDiscipline = false,
): StaffChecklistAnswerTiming {
  return {
    status,
    plannedAt: "2026-11-11T07:00:00.000Z",
    windowStartAt: null,
    windowEndAt: null,
    deviationMinutes: null,
    toleranceMinutes: 10,
    affectsDiscipline,
  };
}

test("counts every timed item, not only the ones that affect discipline", () => {
  const statuses: StaffChecklistTimingStatus[] = [
    "ON_TIME",
    "EARLY",
    "LATE",
    "MISSED",
    "WAITING",
    "NO_ANCHOR",
  ];
  const summary = checklistTimingSummary({
    answers: [],
    itemTimings: statuses.map((status, index) => ({
      sectionId: "s",
      itemId: `i${index}`,
      timing: timing(status),
    })),
  });

  assert.deepEqual(summary, { total: 5, onTime: 2, late: 2 });
});

test("falls back to answer timings when the run has no item timings", () => {
  const summary = checklistTimingSummary({
    answers: [
      { timing: timing("ON_TIME", true) },
      { timing: null },
    ] as never,
  });

  assert.deepEqual(summary, { total: 1, onTime: 1, late: 0 });
});

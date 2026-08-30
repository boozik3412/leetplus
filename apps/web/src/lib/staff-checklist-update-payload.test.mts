import assert from "node:assert/strict";
import test from "node:test";

import { buildStaffChecklistUpdatePayload } from "./staff-checklist-update-payload.ts";

const answers = [
  {
    sectionId: "section-1",
    itemId: "item-1",
    value: null,
    status: "PASS" as const,
    note: null,
    evidenceUrl:
      "https://localhost:3000/api/staff/attachments/96735ada-456d-4001-bc16-e011ab48a790",
    evidenceAttachments: [],
    reviewThreads: [],
    completedAt: "2026-08-21T04:05:00.000Z",
    timing: null,
  },
];

test("review decisions do not resend immutable checklist answers", () => {
  for (const status of ["ACCEPTED", "RETURNED", "ESCALATED"] as const) {
    const payload = buildStaffChecklistUpdatePayload({
      status,
      answers,
      reviewComment: "Проверено",
    });

    assert.equal("answers" in payload, false);
    assert.deepEqual(payload, { status, reviewComment: "Проверено" });
  }
});

test("employee save and submit actions still persist answers", () => {
  for (const status of ["IN_PROGRESS", "ON_REVIEW"] as const) {
    const payload = buildStaffChecklistUpdatePayload({
      status,
      answers,
      reviewComment: "",
    });

    assert.strictEqual(payload.answers, answers);
  }
});

test("canceling a checklist is a status-only action", () => {
  const payload = buildStaffChecklistUpdatePayload({
    status: "CANCELED",
    answers,
    reviewComment: "",
  });

  assert.equal("answers" in payload, false);
});

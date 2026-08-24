import assert from "node:assert/strict";
import test from "node:test";
import {
  APPROVAL_PHRASES,
  checkStaffAttachmentReconciliation,
  createStaffAttachmentReconciliationApproval,
  createStaffAttachmentReconciliationPlanFromDatabase,
  executeStaffAttachmentReconciliation,
  parseStaffAttachmentReconciliationRuntime,
} from "./staff-attachment-reconciliation.mjs";

const CONFIRMATION =
  "RUN_STAFF_ATTACHMENT_RECONCILIATION_POSTGRES_E2E";

test("real PostgreSQL apply, lost-response replay, check and rollback are exact", async (t) => {
  if (
    process.env.STAFF_ATTACHMENT_RECONCILIATION_PG_E2E_CONFIRM !==
    CONFIRMATION
  ) {
    t.skip("explicit disposable PostgreSQL fixture confirmation is absent");
    return;
  }

  const databaseUrl =
    process.env.STAFF_ATTACHMENT_RECONCILIATION_PG_E2E_DATABASE_URL;
  const systemIdentifier =
    process.env.STAFF_ATTACHMENT_RECONCILIATION_PG_E2E_SYSTEM_IDENTIFIER;
  assert.match(databaseUrl ?? "", /^postgresql:\/\/[^@\s]+@?127\.0\.0\.1:\d+\/leetplus_attachment_e2e/u);
  assert.match(systemIdentifier ?? "", /^\d{10,30}$/u);

  const runtime = parseStaffAttachmentReconciliationRuntime({
    DATABASE_URL: databaseUrl,
    STAFF_ATTACHMENT_RECONCILIATION_EXPECTED_DATABASE_FINGERPRINT:
      process.env
        .STAFF_ATTACHMENT_RECONCILIATION_PG_E2E_DATABASE_FINGERPRINT,
    STAFF_ATTACHMENT_RECONCILIATION_EXPECTED_DATABASE_NAME:
      "leetplus_attachment_e2e",
    STAFF_ATTACHMENT_RECONCILIATION_EXPECTED_ROLE:
      "leetplus_attachment_writer",
    STAFF_ATTACHMENT_RECONCILIATION_EXPECTED_SYSTEM_IDENTIFIER:
      systemIdentifier,
    STAFF_ATTACHMENT_RECONCILIATION_RELEASE_SHA: "a".repeat(40),
    STAFF_ATTACHMENT_RECONCILIATION_TARGET: "development",
  });
  const plan = await createStaffAttachmentReconciliationPlanFromDatabase(
    runtime,
  );
  assert.equal(plan.summary.actionCount, 1);
  assert.equal(plan.summary.reviewAttachmentCount, 0);
  assert.equal(plan.summary.signalReviewCount, 0);

  const applyApproval = createStaffAttachmentReconciliationApproval({
    actionCount: 1,
    confirmationPhrase: APPROVAL_PHRASES.APPLY,
    confirmedPlanDigest: plan.planDigest,
    direction: "APPLY",
    plan,
    reviewAttachmentCount: 0,
  });
  const applied = await executeStaffAttachmentReconciliation({
    approval: applyApproval,
    config: runtime,
    direction: "APPLY",
    plan,
  });
  assert.equal(applied.disposition, "APPLIED");
  assert.equal(applied.zeroDiff, true);

  const replayed = await executeStaffAttachmentReconciliation({
    approval: applyApproval,
    config: runtime,
    direction: "APPLY",
    plan,
  });
  assert.equal(replayed.disposition, "RECONCILED");
  assert.equal(replayed.zeroDiff, true);

  const applyCheck = await checkStaffAttachmentReconciliation({
    config: runtime,
    direction: "APPLY",
    plan,
  });
  assert.equal(applyCheck.disposition, "CHECKED");

  const rollbackApproval = createStaffAttachmentReconciliationApproval({
    actionCount: 1,
    confirmationPhrase: APPROVAL_PHRASES.ROLLBACK,
    confirmedPlanDigest: plan.planDigest,
    direction: "ROLLBACK",
    plan,
    reviewAttachmentCount: 0,
  });
  const rolledBack = await executeStaffAttachmentReconciliation({
    approval: rollbackApproval,
    config: runtime,
    direction: "ROLLBACK",
    plan,
  });
  assert.equal(rolledBack.disposition, "APPLIED");
  assert.equal(rolledBack.zeroDiff, true);

  const rollbackReplay = await executeStaffAttachmentReconciliation({
    approval: rollbackApproval,
    config: runtime,
    direction: "ROLLBACK",
    plan,
  });
  assert.equal(rollbackReplay.disposition, "RECONCILED");
  assert.equal(rollbackReplay.zeroDiff, true);

  const rollbackCheck = await checkStaffAttachmentReconciliation({
    config: runtime,
    direction: "ROLLBACK",
    plan,
  });
  assert.equal(rollbackCheck.disposition, "CHECKED");
});

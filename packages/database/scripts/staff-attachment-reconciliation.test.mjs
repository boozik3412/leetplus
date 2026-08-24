import assert from "node:assert/strict";
import test from "node:test";
import { databaseTargetFingerprint } from "./staff-attachment-backfill-dry-run.mjs";
import { MAX_PROTECTED_JSON_FILE_BYTES } from "./current-network-access-scope-classification.mjs";
import {
  APPROVAL_PHRASES,
  EXPECTED_MIGRATION_COUNT,
  EXPECTED_MIGRATION_HEAD,
  PRODUCTION_ATTESTATION,
  RESIDUAL_APPROVAL_PHRASES,
  StaffAttachmentReconciliationError,
  buildStaffAttachmentResidualReconciliationPlan,
  buildStaffAttachmentReconciliationPlan,
  classifyStaffAttachmentResidualReconciliationState,
  classifyStaffAttachmentReconciliationState,
  createStaffAttachmentResidualReconciliationApproval,
  createStaffAttachmentReconciliationApproval,
  materializeStaffAttachmentResidualReconciliationState,
  materializeStaffAttachmentReconciliationState,
  parseStaffAttachmentReconciliationRuntime,
  validateStaffAttachmentReconciliationApproval,
  validateStaffAttachmentReconciliationPlan,
  validateStaffAttachmentResidualReconciliationApproval,
  validateStaffAttachmentResidualReconciliationPlan,
} from "./staff-attachment-reconciliation.mjs";
import { parseStaffAttachmentReconciliationCliArguments } from "./staff-attachment-reconciliation.cli.mjs";

const GENERATED_AT = "2026-08-24T00:00:00.000Z";
const APPLY_AT = "2026-08-24T01:00:00.000Z";
const ROLLBACK_AT = "2026-08-24T02:00:00.000Z";
const IDS = Object.freeze({
  clean: "123e4567-e89b-42d3-a456-426614174000",
  ambiguous: "123e4567-e89b-42d3-a456-426614174001",
  pending: "123e4567-e89b-42d3-a456-426614174002",
  orphan: "123e4567-e89b-42d3-a456-426614174003",
  existing: "123e4567-e89b-42d3-a456-426614174004",
  missing: "123e4567-e89b-42d3-a456-426614174005",
});

function attachment(id, overrides = {}) {
  return {
    id,
    pendingExpiresAt: null,
    state: "UNRESOLVED",
    stateChangedAt: GENERATED_AT,
    stateReasonCode: "LEGACY_UNCLASSIFIED",
    tenantId: "tenant-a",
    ...overrides,
  };
}

function occurrence(attachmentId, resourceKind, resourceId, overrides = {}) {
  const chat = resourceKind === "CHAT_MESSAGE";
  return {
    attachmentId,
    parentTenantId: "tenant-a",
    parentValid: true,
    referenceForm: chat ? "NORMALIZED_RELATION" : "RELATIVE",
    resourceId,
    resourceKind,
    resourceStoreId: "store-a",
    resourceStoreTenantId: "tenant-a",
    source: chat
      ? "NORMALIZED_CHAT_RELATION"
      : "TASK_COMMENT_EVIDENCE_URL",
    sourceRowId: `${chat ? "relation" : "comment"}-${resourceId}`,
    sourceTenantId: "tenant-a",
    ...overrides,
  };
}

function database() {
  return {
    allowedHttpsOrigins: [],
    databaseIdentityDigest: "a".repeat(64),
    databaseName: "leetplus_unit",
    databaseTargetFingerprint: "b".repeat(64),
    expectedMigrationCount: EXPECTED_MIGRATION_COUNT,
    expectedMigrationHead: EXPECTED_MIGRATION_HEAD,
    releaseSha: "c".repeat(40),
    roleName: "leetplus_attachment_writer",
    schemaContractDigest: "d".repeat(64),
    systemIdentifier: "1234567890123456789",
    target: "development",
  };
}

function snapshot() {
  return {
    attachments: [
      attachment(IDS.clean),
      attachment(IDS.ambiguous),
      attachment(IDS.pending, {
        pendingExpiresAt: "2026-08-25T00:00:00.000Z",
        state: "PENDING",
        stateReasonCode: null,
      }),
      attachment(IDS.orphan),
      attachment(IDS.existing),
    ],
    bindings: [
      {
        candidateAttachmentId: IDS.existing,
        id: "binding-existing",
        state: "UNRESOLVED",
      },
    ],
    database: database(),
    generatedAt: GENERATED_AT,
    occurrences: [
      occurrence(IDS.clean, "CHAT_MESSAGE", "message-clean"),
      occurrence(IDS.ambiguous, "STAFF_TASK", "task-a"),
      occurrence(IDS.ambiguous, "STAFF_TASK", "task-b"),
      occurrence(IDS.pending, "STAFF_TASK", "task-pending"),
      occurrence(IDS.existing, "STAFF_TASK", "task-existing"),
      occurrence(IDS.missing, "STAFF_TASK", "task-missing"),
    ],
    signals: [
      {
        reasonCode: "ABSOLUTE_REFERENCE_ORIGIN_NOT_ALLOWLISTED",
        resourceId: "task-url-review",
        sourceRowId: "comment-url-review",
        tenantId: "tenant-a",
      },
    ],
  };
}

function cleanPlan() {
  const source = snapshot();
  source.attachments = [source.attachments[0]];
  source.bindings = [];
  source.occurrences = [source.occurrences[0]];
  source.signals = [];
  return buildStaffAttachmentReconciliationPlan(source);
}

function residualSnapshot() {
  return {
    attachments: [
      attachment(IDS.clean, {
        pendingExpiresAt: "2026-08-25T00:00:00.000Z",
        state: "PENDING",
        stateReasonCode: null,
      }),
      attachment(IDS.ambiguous),
      attachment(IDS.pending, {
        pendingExpiresAt: "2026-08-23T00:00:00.000Z",
        state: "PENDING",
        stateReasonCode: null,
      }),
      attachment(IDS.orphan),
      attachment(IDS.existing),
    ],
    bindings: [],
    database: database(),
    generatedAt: GENERATED_AT,
    occurrences: [
      occurrence(IDS.ambiguous, "CHAT_MESSAGE", "message-a"),
      occurrence(IDS.ambiguous, "CHAT_MESSAGE", "message-b"),
      occurrence(IDS.existing, "CHAT_MESSAGE", "message-unique"),
    ],
    signals: [],
  };
}

function residualPlan() {
  return buildStaffAttachmentResidualReconciliationPlan(residualSnapshot());
}

function errorCode(reasonCode) {
  return (error) =>
    error instanceof StaffAttachmentReconciliationError &&
    error.reasonCode === reasonCode;
}

test("planner only auto-selects one valid unresolved parent", () => {
  const plan = buildStaffAttachmentReconciliationPlan(snapshot());
  assert.equal(plan.summary.actionCount, 1);
  assert.equal(plan.summary.reviewAttachmentCount, 4);
  assert.equal(plan.summary.signalReviewCount, 2);
  assert.equal(plan.actions[0].attachmentId, IDS.clean);
  assert.equal(plan.actions[0].binding.source, "CHAT_RELATION_BACKFILL");
  assert.equal(plan.actions[0].binding.resourceKind, "CHAT_MESSAGE");
  assert.equal(plan.actions[0].binding.state, "BOUND");
  assert.equal(plan.actions[0].binding.createdByUserId, null);
  assert.equal(plan.actions[0].binding.reasonCode, null);
  assert.match(plan.actions[0].binding.id, /^[0-9a-f-]{36}$/u);
  assert.match(plan.actions[0].binding.sourceKey, /^[0-9a-f]{64}$/u);

  const reviews = new Map(
    plan.reviews.map((review) => [review.attachmentId, review]),
  );
  assert.deepEqual(reviews.get(IDS.ambiguous).reasonCodes, [
    "MULTIPLE_PRIMARY_PARENTS",
  ]);
  assert.deepEqual(reviews.get(IDS.pending).reasonCodes, [
    "LIFECYCLE_REVIEW_REQUIRED",
  ]);
  assert.deepEqual(reviews.get(IDS.orphan).reasonCodes, ["NO_PRIMARY_PARENT"]);
  assert.deepEqual(reviews.get(IDS.existing).reasonCodes, [
    "EXISTING_BINDING_REVIEW_REQUIRED",
  ]);
  assert.deepEqual(
    plan.signalReviews.map((entry) => entry.reasonCode).sort(),
    [
      "ABSOLUTE_REFERENCE_ORIGIN_NOT_ALLOWLISTED",
      "ATTACHMENT_NOT_FOUND",
    ],
  );
  validateStaffAttachmentReconciliationPlan(plan);
});

test("plan and deterministic binding identity are stable", () => {
  const first = buildStaffAttachmentReconciliationPlan(snapshot());
  const second = buildStaffAttachmentReconciliationPlan(snapshot());
  assert.equal(first.planDigest, second.planDigest);
  assert.deepEqual(first.actions, second.actions);
  const tampered = structuredClone(first);
  tampered.actions[0].binding.resourceId = "message-other";
  assert.throws(
    () => validateStaffAttachmentReconciliationPlan(tampered),
    errorCode("ATTACHMENT_RECONCILIATION_PLAN_INVALID"),
  );
});

test("an exact-path URL review signal excludes the attachment from automatic binding", () => {
  const source = snapshot();
  source.attachments = [source.attachments[0]];
  source.bindings = [];
  source.occurrences = [source.occurrences[0]];
  source.signals = [
    {
      attachmentId: IDS.clean,
      reasonCode: "ABSOLUTE_REFERENCE_ORIGIN_NOT_ALLOWLISTED",
      resourceId: "task-url-review",
      sourceRowId: "comment-url-review",
      tenantId: "tenant-a",
    },
  ];
  const plan = buildStaffAttachmentReconciliationPlan(source);
  assert.equal(plan.summary.actionCount, 0);
  assert.deepEqual(plan.reviews[0].reasonCodes, [
    "PRIMARY_SIGNAL_REVIEW_REQUIRED",
  ]);
  assert.equal(plan.signalReviews[0].attachmentId, IDS.clean);
  validateStaffAttachmentReconciliationPlan(plan);
});

test("detached approval requires exact digest, direction and both counts", () => {
  const plan = buildStaffAttachmentReconciliationPlan(snapshot());
  const approval = createStaffAttachmentReconciliationApproval({
    actionCount: "1",
    confirmationPhrase: APPROVAL_PHRASES.APPLY,
    confirmedPlanDigest: plan.planDigest,
    direction: "APPLY",
    plan,
    reviewAttachmentCount: "4",
    now: new Date(GENERATED_AT),
  });
  validateStaffAttachmentReconciliationApproval(approval, plan, "APPLY");
  assert.throws(
    () =>
      createStaffAttachmentReconciliationApproval({
        actionCount: "1",
        confirmationPhrase: APPROVAL_PHRASES.APPLY,
        confirmedPlanDigest: plan.planDigest,
        direction: "APPLY",
        plan,
        reviewAttachmentCount: "3",
      }),
    errorCode("ATTACHMENT_RECONCILIATION_APPROVAL_CONFIRMATION_INVALID"),
  );
  assert.throws(
    () => validateStaffAttachmentReconciliationApproval(approval, plan, "ROLLBACK"),
    errorCode("ATTACHMENT_RECONCILIATION_APPROVAL_INVALID"),
  );
});

test("apply, zero-diff, rollback and rollback zero-diff state machine is fail-closed", () => {
  const plan = cleanPlan();
  const before = {
    attachments: plan.actions.map((action) => ({
      attachmentId: action.attachmentId,
      ...action.before,
      tenantId: action.tenantId,
    })),
    audits: [],
    bindings: [],
  };
  assert.equal(
    classifyStaffAttachmentReconciliationState({
      direction: "APPLY",
      plan,
      state: before,
    }).disposition,
    "MUTATE",
  );

  const applied = materializeStaffAttachmentReconciliationState({
    applyTransitionAt: APPLY_AT,
    direction: "APPLY",
    plan,
  });
  assert.equal(
    classifyStaffAttachmentReconciliationState({
      direction: "APPLY",
      plan,
      state: applied,
    }).disposition,
    "RECONCILED",
  );
  assert.equal(
    classifyStaffAttachmentReconciliationState({
      direction: "ROLLBACK",
      plan,
      state: applied,
    }).disposition,
    "MUTATE",
  );

  const rolledBack = materializeStaffAttachmentReconciliationState({
    applyTransitionAt: APPLY_AT,
    direction: "ROLLBACK",
    plan,
    rollbackTransitionAt: ROLLBACK_AT,
  });
  assert.equal(
    classifyStaffAttachmentReconciliationState({
      direction: "ROLLBACK",
      plan,
      state: rolledBack,
    }).disposition,
    "RECONCILED",
  );
  assert.throws(
    () =>
      classifyStaffAttachmentReconciliationState({
        direction: "APPLY",
        plan,
        state: rolledBack,
      }),
    errorCode("ATTACHMENT_RECONCILIATION_PLAN_ALREADY_ROLLED_BACK"),
  );
});

test("unexpected extra binding blocks apply reconciliation", () => {
  const plan = cleanPlan();
  const applied = structuredClone(
    materializeStaffAttachmentReconciliationState({
      applyTransitionAt: APPLY_AT,
      direction: "APPLY",
      plan,
    }),
  );
  applied.bindings.push({
    ...applied.bindings[0],
    id: "223e4567-e89b-42d3-a456-426614174099",
    sourceKey: "f".repeat(64),
  });
  assert.throws(
    () =>
      classifyStaffAttachmentReconciliationState({
        direction: "APPLY",
        plan,
        state: applied,
      }),
    errorCode("ATTACHMENT_RECONCILIATION_APPLIED_BINDING_DRIFT"),
  );
});

test("residual planner binds every normalized parent and quarantines only no-parent rows", () => {
  const plan = residualPlan();
  assert.equal(plan.summary.actionCount, 3);
  assert.equal(plan.summary.bindAttachmentCount, 1);
  assert.equal(plan.summary.bindingCount, 2);
  assert.equal(plan.summary.quarantineAttachmentCount, 2);
  assert.equal(plan.summary.reviewAttachmentCount, 2);

  const actions = new Map(
    plan.actions.map((action) => [action.attachmentId, action]),
  );
  assert.equal(
    actions.get(IDS.ambiguous).disposition,
    "BIND_ALL_PRIMARY_PARENTS",
  );
  assert.deepEqual(
    actions
      .get(IDS.ambiguous)
      .bindings.map((binding) => binding.resourceId),
    ["message-a", "message-b"],
  );
  assert.equal(
    actions.get(IDS.orphan).after.stateReasonCode,
    "LEGACY_NO_PRIMARY_PARENT",
  );
  assert.equal(
    actions.get(IDS.pending).after.stateReasonCode,
    "PENDING_EXPIRED",
  );

  const reviews = new Map(
    plan.reviews.map((review) => [review.attachmentId, review]),
  );
  assert.deepEqual(reviews.get(IDS.clean).reasonCodes, [
    "PENDING_NOT_EXPIRED",
  ]);
  assert.deepEqual(reviews.get(IDS.existing).reasonCodes, [
    "UNEXPECTED_UNIQUE_PRIMARY_PARENT",
  ]);
  validateStaffAttachmentResidualReconciliationPlan(plan);
});

test("residual plan and approval are digest-bound to all disposition counts", () => {
  const plan = residualPlan();
  const second = residualPlan();
  assert.equal(plan.planDigest, second.planDigest);
  assert.deepEqual(plan.actions, second.actions);

  const approval = createStaffAttachmentResidualReconciliationApproval({
    actionCount: "3",
    bindingCount: "2",
    confirmationPhrase: RESIDUAL_APPROVAL_PHRASES.APPLY,
    confirmedPlanDigest: plan.planDigest,
    direction: "APPLY",
    now: new Date(GENERATED_AT),
    plan,
    quarantineCount: "2",
    reviewAttachmentCount: "2",
  });
  validateStaffAttachmentResidualReconciliationApproval(
    approval,
    plan,
    "APPLY",
  );
  assert.throws(
    () =>
      createStaffAttachmentResidualReconciliationApproval({
        actionCount: "3",
        bindingCount: "1",
        confirmationPhrase: RESIDUAL_APPROVAL_PHRASES.APPLY,
        confirmedPlanDigest: plan.planDigest,
        direction: "APPLY",
        plan,
        quarantineCount: "2",
        reviewAttachmentCount: "2",
      }),
    errorCode(
      "ATTACHMENT_RESIDUAL_RECONCILIATION_APPROVAL_CONFIRMATION_INVALID",
    ),
  );

  const tampered = structuredClone(plan);
  tampered.actions[0].bindings[0].resourceId = "message-tampered";
  assert.throws(
    () => validateStaffAttachmentResidualReconciliationPlan(tampered),
    errorCode("ATTACHMENT_RESIDUAL_RECONCILIATION_PLAN_INVALID"),
  );
});

test("residual apply, replay, rollback and extra-binding checks are exact", () => {
  const plan = residualPlan();
  const before = {
    attachments: plan.actions.map((action) => ({
      attachmentId: action.attachmentId,
      ...action.before,
      tenantId: action.tenantId,
    })),
    audits: [],
    bindings: [],
  };
  assert.equal(
    classifyStaffAttachmentResidualReconciliationState({
      direction: "APPLY",
      plan,
      state: before,
    }).disposition,
    "MUTATE",
  );
  const applied = materializeStaffAttachmentResidualReconciliationState({
    applyTransitionAt: APPLY_AT,
    direction: "APPLY",
    plan,
  });
  assert.equal(applied.bindings.length, 2);
  assert.equal(
    classifyStaffAttachmentResidualReconciliationState({
      direction: "APPLY",
      plan,
      state: applied,
    }).disposition,
    "RECONCILED",
  );
  const drifted = structuredClone(applied);
  drifted.bindings.push({
    ...drifted.bindings[0],
    id: "223e4567-e89b-42d3-a456-426614174099",
    sourceKey: "f".repeat(64),
  });
  assert.throws(
    () =>
      classifyStaffAttachmentResidualReconciliationState({
        direction: "APPLY",
        plan,
        state: drifted,
      }),
    errorCode("ATTACHMENT_RESIDUAL_RECONCILIATION_APPLIED_BINDING_DRIFT"),
  );
  const rolledBack =
    materializeStaffAttachmentResidualReconciliationState({
      applyTransitionAt: APPLY_AT,
      direction: "ROLLBACK",
      plan,
      rollbackTransitionAt: ROLLBACK_AT,
    });
  assert.equal(
    classifyStaffAttachmentResidualReconciliationState({
      direction: "ROLLBACK",
      plan,
      state: rolledBack,
    }).disposition,
    "RECONCILED",
  );
});

test("runtime binds URL target, system identifier, role, SHA and production attestation", () => {
  const databaseUrl =
    "postgresql://writer:first-secret@db.example.test:5432/leetplus_unit?schema=public";
  const base = {
    DATABASE_URL: databaseUrl,
    STAFF_ATTACHMENT_RECONCILIATION_EXPECTED_DATABASE_FINGERPRINT:
      databaseTargetFingerprint(databaseUrl),
    STAFF_ATTACHMENT_RECONCILIATION_EXPECTED_DATABASE_NAME: "leetplus_unit",
    STAFF_ATTACHMENT_RECONCILIATION_EXPECTED_ROLE:
      "leetplus_attachment_writer",
    STAFF_ATTACHMENT_RECONCILIATION_EXPECTED_SYSTEM_IDENTIFIER:
      "1234567890123456789",
    STAFF_ATTACHMENT_RECONCILIATION_RELEASE_SHA: "a".repeat(40),
    STAFF_ATTACHMENT_RECONCILIATION_TARGET: "development",
  };
  const config = parseStaffAttachmentReconciliationRuntime(base);
  assert.equal(config.publicConfig.databaseName, "leetplus_unit");
  assert.equal(config.publicConfig.target, "development");
  assert.equal(
    config.publicConfig.databaseTargetFingerprint,
    databaseTargetFingerprint(
      databaseUrl.replace("first-secret", "second-secret"),
    ),
  );

  assert.throws(
    () =>
      parseStaffAttachmentReconciliationRuntime({
        ...base,
        STAFF_ATTACHMENT_RECONCILIATION_TARGET: "production",
      }),
    errorCode("ATTACHMENT_RECONCILIATION_PRODUCTION_ATTESTATION_REQUIRED"),
  );
  const production = parseStaffAttachmentReconciliationRuntime({
    ...base,
    STAFF_ATTACHMENT_RECONCILIATION_PRODUCTION_ATTESTATION:
      PRODUCTION_ATTESTATION,
    STAFF_ATTACHMENT_RECONCILIATION_TARGET: "production",
  });
  assert.equal(production.publicConfig.target, "production");
});

test("CLI grammar keeps approval and mutation inputs explicit", () => {
  assert.deepEqual(
    parseStaffAttachmentReconciliationCliArguments(["--self-test"]),
    { command: "self-test", options: {} },
  );
  const parsed = parseStaffAttachmentReconciliationCliArguments([
    "approve",
    "--plan",
    "C:\\evidence\\plan.json",
    "--direction",
    "APPLY",
    "--confirm-plan-digest",
    "a".repeat(64),
    "--confirm-action-count",
    "1",
    "--confirm-review-count",
    "4",
    "--confirm",
    APPROVAL_PHRASES.APPLY,
    "--output",
    "C:\\evidence\\approval.json",
  ]);
  assert.equal(parsed.command, "approve");
  assert.equal(parsed.options.direction, "APPLY");
  assert.throws(
    () =>
      parseStaffAttachmentReconciliationCliArguments([
        "apply",
        "--plan",
        "plan.json",
        "--output",
        "receipt.json",
      ]),
    errorCode("ATTACHMENT_RECONCILIATION_CLI_REQUIRED_OPTION_MISSING"),
  );
  const residual = parseStaffAttachmentReconciliationCliArguments([
    "residual-approve",
    "--plan",
    "C:\\evidence\\residual-plan.json",
    "--direction",
    "APPLY",
    "--confirm-plan-digest",
    "b".repeat(64),
    "--confirm-action-count",
    "3",
    "--confirm-binding-count",
    "2",
    "--confirm-quarantine-count",
    "2",
    "--confirm-review-count",
    "2",
    "--confirm",
    RESIDUAL_APPROVAL_PHRASES.APPLY,
    "--output",
    "C:\\evidence\\residual-approval.json",
  ]);
  assert.equal(residual.command, "residual-approve");
  assert.equal(residual.options["confirm-binding-count"], "2");
});

test("protected plan capacity covers the current production inventory envelope", () => {
  const attachmentCount = 5_446;
  const tenantId = "223e4567-e89b-42d3-a456-426614174000";
  const storeId = "323e4567-e89b-42d3-a456-426614174000";
  const uuid = (value) =>
    `123e4567-e89b-42d3-a456-${value.toString(16).padStart(12, "0")}`;
  const attachments = Array.from({ length: attachmentCount }, (_, index) =>
    attachment(uuid(index + 1), { tenantId }),
  );
  const occurrences = attachments.map((entry, index) =>
    occurrence(entry.id, "STAFF_TASK", uuid(index + 100_000), {
      parentTenantId: tenantId,
      resourceStoreId: storeId,
      resourceStoreTenantId: tenantId,
      sourceRowId: uuid(index + 200_000),
      sourceTenantId: tenantId,
    }),
  );
  const plan = buildStaffAttachmentReconciliationPlan({
    attachments,
    bindings: [],
    database: database(),
    generatedAt: GENERATED_AT,
    occurrences,
    signals: [],
  });
  const byteLength = Buffer.byteLength(`${JSON.stringify(plan)}\n`, "utf8");
  assert.equal(plan.summary.actionCount, attachmentCount);
  assert.ok(byteLength > 4 * 1024 * 1024);
  assert.ok(byteLength <= MAX_PROTECTED_JSON_FILE_BYTES);
});

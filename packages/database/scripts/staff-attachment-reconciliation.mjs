import { createHash, timingSafeEqual } from "node:crypto";
import pg from "pg";
import {
  databaseTargetFingerprint,
  parseAllowedOrigins,
  parseExactAttachmentReference,
  parsePostgresDatabaseUrl,
} from "./staff-attachment-backfill-dry-run.mjs";
import { canonicalJson } from "./current-network-access-scope-classification.mjs";

export const RECONCILIATION_CONTRACT =
  "STAFF_ATTACHMENT_RECONCILIATION_V1";
export const PLAN_CONTRACT = "STAFF_ATTACHMENT_RECONCILIATION_PLAN_V1";
export const APPROVAL_CONTRACT =
  "STAFF_ATTACHMENT_RECONCILIATION_DETACHED_APPROVAL_V1";
export const RECEIPT_CONTRACT =
  "STAFF_ATTACHMENT_RECONCILIATION_RECEIPT_V1";
export const RESIDUAL_RECONCILIATION_CONTRACT =
  "STAFF_ATTACHMENT_RESIDUAL_RECONCILIATION_V1";
export const RESIDUAL_PLAN_CONTRACT =
  "STAFF_ATTACHMENT_RESIDUAL_RECONCILIATION_PLAN_V1";
export const RESIDUAL_APPROVAL_CONTRACT =
  "STAFF_ATTACHMENT_RESIDUAL_RECONCILIATION_DETACHED_APPROVAL_V1";
export const RESIDUAL_RECEIPT_CONTRACT =
  "STAFF_ATTACHMENT_RESIDUAL_RECONCILIATION_RECEIPT_V1";
export const EXPECTED_MIGRATION_COUNT = 189;
export const EXPECTED_MIGRATION_HEAD =
  "20260831120000_guest_support_bug_report_input_repair";
export const PRODUCTION_ATTESTATION =
  "I_ATTEST_THIS_IS_THE_REVIEWED_STAFF_ATTACHMENT_RECONCILIATION_TARGET";
export const APPROVAL_PHRASES = Object.freeze({
  APPLY: "I_ACCEPT_EXACT_STAFF_ATTACHMENT_RECONCILIATION_APPLY",
  ROLLBACK: "I_ACCEPT_EXACT_STAFF_ATTACHMENT_RECONCILIATION_ROLLBACK",
});
export const RESIDUAL_APPROVAL_PHRASES = Object.freeze({
  APPLY: "I_ACCEPT_EXACT_STAFF_ATTACHMENT_RESIDUAL_RECONCILIATION_APPLY",
  ROLLBACK:
    "I_ACCEPT_EXACT_STAFF_ATTACHMENT_RESIDUAL_RECONCILIATION_ROLLBACK",
});

const TARGETS = new Set(["development", "staging", "production"]);
const SHA256 = /^[0-9a-f]{64}$/u;
const RELEASE_SHA = /^[0-9a-f]{40}$/u;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const OPAQUE_ID = /^[^\u0000-\u001f\u007f]{1,128}$/u;
const ROLE_NAME = /^[a-z_][a-z0-9_$-]{0,62}$/u;
const SYSTEM_IDENTIFIER = /^\d{10,30}$/u;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const BATCH_SIZE = 1_000;
const MAX_ROWS_PER_RELATION = 100_000;
const ADVISORY_LOCK_NAMESPACE = 1_911_005_401;
const ADVISORY_LOCK_RESOURCE = 20_260_824;
const APPLY_AUDIT_ACTION = "STAFF_ATTACHMENT_RECONCILIATION_APPLY_V1";
const ROLLBACK_AUDIT_ACTION = "STAFF_ATTACHMENT_RECONCILIATION_ROLLBACK_V1";
const TARGET_TYPE = "STAFF_ATTACHMENT_RECONCILIATION_PLAN";
const RESIDUAL_APPLY_AUDIT_ACTION =
  "STAFF_ATTACHMENT_RESIDUAL_RECONCILIATION_APPLY_V1";
const RESIDUAL_ROLLBACK_AUDIT_ACTION =
  "STAFF_ATTACHMENT_RESIDUAL_RECONCILIATION_ROLLBACK_V1";
const RESIDUAL_TARGET_TYPE =
  "STAFF_ATTACHMENT_RESIDUAL_RECONCILIATION_PLAN";
const RESIDUAL_POLICY =
  "BIND_ALL_NORMALIZED_PRIMARY_PARENTS_OR_QUARANTINE_NO_PARENT_V1";
const REQUIRED_ENUMS = Object.freeze({
  StaffAttachmentBindingSource: [
    "NATIVE",
    "CHAT_RELATION_BACKFILL",
    "LEGACY_REFERENCE_BACKFILL",
    "MANUAL_RECONCILIATION",
  ],
  StaffAttachmentBindingState: ["BOUND", "UNRESOLVED", "QUARANTINED"],
  StaffAttachmentResourceKind: [
    "CHAT_MESSAGE",
    "STAFF_TASK",
    "CHECKLIST_RUN",
    "KNOWLEDGE_ARTICLE",
    "SHIFT_REGULATION",
    "TRAINING_COURSE",
    "ONBOARDING_PLAN",
  ],
  StaffAttachmentState: ["PENDING", "BOUND", "UNRESOLVED", "QUARANTINED"],
});
const REQUIRED_COLUMNS = Object.freeze({
  StaffAttachment: [
    "id",
    "tenantId",
    "state",
    "pendingExpiresAt",
    "stateReasonCode",
    "stateChangedAt",
    "createdAt",
  ],
  StaffAttachmentBinding: [
    "id",
    "tenantId",
    "attachmentId",
    "candidateAttachmentId",
    "resourceKind",
    "resourceId",
    "resourceStoreId",
    "state",
    "source",
    "sourceKey",
    "createdByUserId",
    "reasonCode",
    "resolvedAt",
    "createdAt",
    "updatedAt",
  ],
  PlatformAdminAuditEvent: [
    "id",
    "tenantId",
    "requestId",
    "action",
    "targetType",
    "targetId",
    "reason",
    "before",
    "after",
    "metadata",
    "createdAt",
  ],
});
const REQUIRED_TRIGGERS = Object.freeze([
  "StaffAttachmentBinding_prepare",
  "StaffAttachment_bound_binding_check",
  "StaffAttachmentBinding_attachment_state_check",
  "StaffAttachmentBinding_lock_delete",
  "StaffAttachmentBinding_chat_message_parent_delete_check",
  "StaffAttachmentBinding_staff_task_parent_delete_check",
  "StaffAttachmentBinding_checklist_run_parent_delete_check",
  "StaffAttachmentBinding_knowledge_article_parent_delete_check",
  "StaffAttachmentBinding_shift_regulation_parent_delete_check",
  "StaffAttachmentBinding_training_course_parent_delete_check",
  "StaffAttachmentBinding_onboarding_plan_parent_delete_check",
]);

export class StaffAttachmentReconciliationError extends Error {
  constructor(reasonCode) {
    super(reasonCode);
    this.name = "StaffAttachmentReconciliationError";
    this.reasonCode = reasonCode;
    this.safeContractError = true;
  }
}

function fail(reasonCode) {
  throw new StaffAttachmentReconciliationError(reasonCode);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function digest(domain, value) {
  return sha256(
    `${RECONCILIATION_CONTRACT}\0${domain}\0${canonicalJson(value)}`,
  );
}

function equalDigest(left, right) {
  if (!SHA256.test(left ?? "") || !SHA256.test(right ?? "")) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

function exactIso(value, reasonCode) {
  if (
    typeof value !== "string" ||
    !ISO_TIMESTAMP.test(value) ||
    new Date(value).toISOString() !== value
  ) {
    fail(reasonCode);
  }
  return value;
}

function exactString(value, pattern, reasonCode) {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    !pattern.test(value)
  ) {
    fail(reasonCode);
  }
  return value;
}

function exactInteger(value, minimum, maximum, reasonCode) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    fail(reasonCode);
  }
  return value;
}

function iso(value, reasonCode = "ATTACHMENT_RECONCILIATION_TIMESTAMP_INVALID") {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.valueOf())) fail(reasonCode);
  return parsed.toISOString();
}

function nullableIso(value) {
  return value === null || value === undefined ? null : iso(value);
}

function nullableString(value, pattern, reasonCode) {
  return value === null ? null : exactString(value, pattern, reasonCode);
}

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

function mapBy(values, selector, reasonCode) {
  const result = new Map();
  for (const value of values) {
    const key = selector(value);
    if (result.has(key)) fail(reasonCode);
    result.set(key, value);
  }
  return result;
}

function bindingSourceForOccurrences(occurrences) {
  const sources = sortedUnique(occurrences.map((entry) => entry.source));
  if (sources.length !== 1) return null;
  if (sources[0] === "NORMALIZED_CHAT_RELATION") {
    return "CHAT_RELATION_BACKFILL";
  }
  if (sources[0] === "TASK_COMMENT_EVIDENCE_URL") {
    return "LEGACY_REFERENCE_BACKFILL";
  }
  return null;
}

function deterministicUuid(domain, ...parts) {
  const bytes = createHash("sha256")
    .update(`${RECONCILIATION_CONTRACT}\0${domain}`)
    .update(`\0${parts.join("\0")}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function sourceKeyFor({ attachmentId, resourceKind, resourceId, source, tenantId }) {
  return digest("binding-source-key", {
    attachmentId,
    resourceKind,
    resourceId,
    source,
    tenantId,
  });
}

function beforeImage(attachment) {
  return Object.freeze({
    pendingExpiresAt: nullableIso(attachment.pendingExpiresAt),
    state: String(attachment.state),
    stateChangedAt: iso(attachment.stateChangedAt),
    stateReasonCode:
      attachment.stateReasonCode === null
        ? null
        : String(attachment.stateReasonCode),
  });
}

function parentKey(occurrence) {
  return `${occurrence.resourceKind}\0${occurrence.resourceId}`;
}

function normalizedParent(occurrence) {
  return Object.freeze({
    resourceId: occurrence.resourceId,
    resourceKind: occurrence.resourceKind,
    resourceStoreId: occurrence.resourceStoreId ?? null,
  });
}

function sortParents(parents) {
  return [...parents].sort((left, right) =>
    `${left.resourceKind}\0${left.resourceId}`.localeCompare(
      `${right.resourceKind}\0${right.resourceId}`,
      "en",
    ),
  );
}

function normalizeSnapshot(snapshot) {
  if (snapshot === null || typeof snapshot !== "object") {
    fail("ATTACHMENT_RECONCILIATION_SNAPSHOT_INVALID");
  }
  const attachments = Array.isArray(snapshot.attachments)
    ? [...snapshot.attachments]
    : fail("ATTACHMENT_RECONCILIATION_ATTACHMENTS_INVALID");
  const occurrences = Array.isArray(snapshot.occurrences)
    ? [...snapshot.occurrences]
    : fail("ATTACHMENT_RECONCILIATION_OCCURRENCES_INVALID");
  const signals = Array.isArray(snapshot.signals)
    ? [...snapshot.signals]
    : fail("ATTACHMENT_RECONCILIATION_SIGNALS_INVALID");
  const bindings = Array.isArray(snapshot.bindings)
    ? [...snapshot.bindings]
    : fail("ATTACHMENT_RECONCILIATION_BINDINGS_INVALID");
  return { attachments, bindings, occurrences, signals };
}

export function buildStaffAttachmentReconciliationPlan(snapshot) {
  const { attachments, bindings, occurrences, signals } =
    normalizeSnapshot(snapshot);
  const attachmentsById = mapBy(
    attachments,
    (entry) => exactString(entry.id, UUID, "ATTACHMENT_RECONCILIATION_ATTACHMENT_ID_INVALID"),
    "ATTACHMENT_RECONCILIATION_ATTACHMENT_DUPLICATE",
  );
  const occurrencesByAttachment = new Map();
  for (const occurrence of occurrences) {
    exactString(
      occurrence.attachmentId,
      UUID,
      "ATTACHMENT_RECONCILIATION_OCCURRENCE_ATTACHMENT_ID_INVALID",
    );
    const list = occurrencesByAttachment.get(occurrence.attachmentId) ?? [];
    list.push(occurrence);
    occurrencesByAttachment.set(occurrence.attachmentId, list);
  }
  const bindingsByCandidate = new Map();
  for (const binding of bindings) {
    const candidateId = exactString(
      binding.candidateAttachmentId,
      OPAQUE_ID,
      "ATTACHMENT_RECONCILIATION_BINDING_CANDIDATE_INVALID",
    );
    const list = bindingsByCandidate.get(candidateId) ?? [];
    list.push(binding);
    bindingsByCandidate.set(candidateId, list);
  }
  const signalAttachmentIds = new Set(
    signals
      .map((signal) => signal.attachmentId)
      .filter((attachmentId) => attachmentId !== null && attachmentId !== undefined)
      .map((attachmentId) =>
        exactString(
          attachmentId,
          UUID,
          "ATTACHMENT_RECONCILIATION_SIGNAL_ATTACHMENT_INVALID",
        ),
      ),
  );

  const actions = [];
  const reviews = [];
  for (const attachment of [...attachments].sort((a, b) =>
    String(a.id).localeCompare(String(b.id), "en"),
  )) {
    const reasons = new Set();
    const candidateOccurrences = occurrencesByAttachment.get(attachment.id) ?? [];
    const validOccurrences = [];
    const parentsByKey = new Map();
    for (const occurrence of candidateOccurrences) {
      const shapeValid =
        occurrence.parentValid === true &&
        occurrence.sourceTenantId === attachment.tenantId &&
        occurrence.parentTenantId === attachment.tenantId &&
        (occurrence.resourceStoreId === null ||
          occurrence.resourceStoreTenantId === attachment.tenantId);
      if (!shapeValid) {
        reasons.add("INVALID_PRIMARY_OCCURRENCE");
        continue;
      }
      validOccurrences.push(occurrence);
      const key = parentKey(occurrence);
      const parent = normalizedParent(occurrence);
      const previous = parentsByKey.get(key);
      if (
        previous &&
        previous.resourceStoreId !== parent.resourceStoreId
      ) {
        reasons.add("PRIMARY_PARENT_STORE_CONFLICT");
      }
      parentsByKey.set(key, parent);
    }
    if (attachment.state !== "UNRESOLVED") {
      reasons.add("LIFECYCLE_REVIEW_REQUIRED");
    }
    if (
      attachment.state === "UNRESOLVED" &&
      (typeof attachment.stateReasonCode !== "string" ||
        attachment.stateReasonCode.trim().length === 0)
    ) {
      reasons.add("LIFECYCLE_REASON_REVIEW_REQUIRED");
    }
    if (signalAttachmentIds.has(attachment.id)) {
      reasons.add("PRIMARY_SIGNAL_REVIEW_REQUIRED");
    }
    if (parentsByKey.size === 0) reasons.add("NO_PRIMARY_PARENT");
    if (parentsByKey.size > 1) reasons.add("MULTIPLE_PRIMARY_PARENTS");
    if ((bindingsByCandidate.get(attachment.id) ?? []).length > 0) {
      reasons.add("EXISTING_BINDING_REVIEW_REQUIRED");
    }
    const source = bindingSourceForOccurrences(validOccurrences);
    if (parentsByKey.size === 1 && source === null) {
      reasons.add("MIXED_OR_UNSUPPORTED_PRIMARY_SOURCE");
    }

    if (reasons.size > 0) {
      reviews.push(
        Object.freeze({
          attachmentId: attachment.id,
          primaryParents: sortParents(parentsByKey.values()),
          reasonCodes: [...reasons].sort(),
          state: String(attachment.state),
          tenantId: exactString(
            attachment.tenantId,
            OPAQUE_ID,
            "ATTACHMENT_RECONCILIATION_TENANT_ID_INVALID",
          ),
        }),
      );
      continue;
    }

    const parent = [...parentsByKey.values()][0];
    const sourceKey = sourceKeyFor({
      attachmentId: attachment.id,
      resourceId: parent.resourceId,
      resourceKind: parent.resourceKind,
      source,
      tenantId: attachment.tenantId,
    });
    actions.push(
      Object.freeze({
        attachmentId: attachment.id,
        before: beforeImage(attachment),
        binding: Object.freeze({
          attachmentId: attachment.id,
          candidateAttachmentId: attachment.id,
          createdByUserId: null,
          id: deterministicUuid("binding-id", sourceKey),
          reasonCode: null,
          resourceId: parent.resourceId,
          resourceKind: parent.resourceKind,
          resourceStoreId: parent.resourceStoreId,
          source,
          sourceKey,
          state: "BOUND",
          tenantId: attachment.tenantId,
        }),
        tenantId: attachment.tenantId,
      }),
    );
  }

  const missingAttachmentSignals = occurrences
    .filter((occurrence) => !attachmentsById.has(occurrence.attachmentId))
    .map((occurrence) => ({
      reasonCode: "ATTACHMENT_NOT_FOUND",
      resourceId: occurrence.resourceId,
      resourceKind: occurrence.resourceKind,
      sourceRowId: occurrence.sourceRowId,
      tenantId: occurrence.sourceTenantId,
    }));
  const signalReviews = [...signals, ...missingAttachmentSignals]
    .map((signal) =>
      Object.freeze({
        attachmentId:
          signal.attachmentId === null || signal.attachmentId === undefined
            ? null
            : exactString(
                signal.attachmentId,
                UUID,
                "ATTACHMENT_RECONCILIATION_SIGNAL_ATTACHMENT_INVALID",
              ),
        reasonCode: exactString(
          signal.reasonCode,
          /^[A-Z][A-Z0-9_]{2,100}$/u,
          "ATTACHMENT_RECONCILIATION_SIGNAL_REASON_INVALID",
        ),
        resourceId: exactString(
          signal.resourceId,
          OPAQUE_ID,
          "ATTACHMENT_RECONCILIATION_SIGNAL_RESOURCE_INVALID",
        ),
        resourceKind: REQUIRED_ENUMS.StaffAttachmentResourceKind.includes(
          signal.resourceKind,
        )
          ? signal.resourceKind
          : "STAFF_TASK",
        sourceRowId: exactString(
          signal.sourceRowId,
          OPAQUE_ID,
          "ATTACHMENT_RECONCILIATION_SIGNAL_SOURCE_INVALID",
        ),
        tenantId: exactString(
          signal.tenantId,
          OPAQUE_ID,
          "ATTACHMENT_RECONCILIATION_SIGNAL_TENANT_INVALID",
        ),
      }),
    )
    .sort((a, b) =>
      `${a.tenantId}\0${a.sourceRowId}\0${a.reasonCode}`.localeCompare(
        `${b.tenantId}\0${b.sourceRowId}\0${b.reasonCode}`,
        "en",
      ),
    );
  const tenantActionCounts = Object.entries(
    actions.reduce((counts, action) => {
      counts[action.tenantId] = (counts[action.tenantId] ?? 0) + 1;
      return counts;
    }, {}),
  )
    .map(([tenantId, actionCount]) => ({ actionCount, tenantId }))
    .sort((a, b) => a.tenantId.localeCompare(b.tenantId, "en"));
  const sourceGraph = {
    occurrences: [...occurrences].sort((a, b) =>
      canonicalJson(a).localeCompare(canonicalJson(b), "en"),
    ),
    signals: signalReviews,
  };
  const inventoryCore = {
    attachments: [...attachments]
      .map((entry) => ({
        id: entry.id,
        tenantId: entry.tenantId,
        ...beforeImage(entry),
      }))
      .sort((a, b) => a.id.localeCompare(b.id, "en")),
    bindings: [...bindings].sort((a, b) =>
      canonicalJson(a).localeCompare(canonicalJson(b), "en"),
    ),
    sourceGraph,
  };
  const core = Object.freeze({
    actions,
    contractVersion: PLAN_CONTRACT,
    database: Object.freeze({ ...snapshot.database }),
    generatedAt: exactIso(
      snapshot.generatedAt,
      "ATTACHMENT_RECONCILIATION_GENERATED_AT_INVALID",
    ),
    inventoryDigest: digest("inventory", inventoryCore),
    reviews,
    safety: Object.freeze({
      autoQuarantineSupported: false,
      automaticDisposition: "UNIQUE_VALID_PRIMARY_PARENT_ONLY",
      databaseWrites: false,
      pendingLifecycleMutationSupported: false,
      planContainsProtectedRawIdentifiers: true,
      productionApplyRequiresDetachedApproval: true,
      rollbackSupported: true,
      urlReviewAutoBindingSupported: false,
    }),
    signalReviews,
    sourceGraphDigest: digest("source-graph", sourceGraph),
    summary: Object.freeze({
      actionCount: actions.length,
      attachmentCount: attachmentsById.size,
      bindingCountObserved: bindings.length,
      reviewAttachmentCount: reviews.length,
      signalReviewCount: signalReviews.length,
      tenantActionCounts,
    }),
  });
  return Object.freeze({ ...core, planDigest: digest("plan", core) });
}

function planCore(plan) {
  const { planDigest: _planDigest, ...core } = plan;
  return core;
}

export function validateStaffAttachmentReconciliationPlan(plan) {
  if (
    plan === null ||
    typeof plan !== "object" ||
    plan.contractVersion !== PLAN_CONTRACT ||
    !Array.isArray(plan.actions) ||
    !Array.isArray(plan.reviews) ||
    !Array.isArray(plan.signalReviews) ||
    !SHA256.test(plan.planDigest ?? "") ||
    !equalDigest(plan.planDigest, digest("plan", planCore(plan)))
  ) {
    fail("ATTACHMENT_RECONCILIATION_PLAN_INVALID");
  }
  exactIso(plan.generatedAt, "ATTACHMENT_RECONCILIATION_PLAN_TIMESTAMP_INVALID");
  if (
    !SHA256.test(plan.inventoryDigest ?? "") ||
    !SHA256.test(plan.sourceGraphDigest ?? "") ||
    plan.safety?.autoQuarantineSupported !== false ||
    plan.safety?.automaticDisposition !==
      "UNIQUE_VALID_PRIMARY_PARENT_ONLY" ||
    plan.safety?.databaseWrites !== false ||
    plan.safety?.pendingLifecycleMutationSupported !== false ||
    plan.safety?.planContainsProtectedRawIdentifiers !== true ||
    plan.safety?.productionApplyRequiresDetachedApproval !== true ||
    plan.safety?.rollbackSupported !== true ||
    plan.safety?.urlReviewAutoBindingSupported !== false
  ) {
    fail("ATTACHMENT_RECONCILIATION_PLAN_SAFETY_INVALID");
  }
  if (
    plan.database?.expectedMigrationCount !== EXPECTED_MIGRATION_COUNT ||
    plan.database?.expectedMigrationHead !== EXPECTED_MIGRATION_HEAD ||
    !TARGETS.has(plan.database?.target) ||
    !RELEASE_SHA.test(plan.database?.releaseSha ?? "") ||
    !SHA256.test(plan.database?.databaseTargetFingerprint ?? "") ||
    !SHA256.test(plan.database?.databaseIdentityDigest ?? "") ||
    !SHA256.test(plan.database?.schemaContractDigest ?? "") ||
    !SYSTEM_IDENTIFIER.test(plan.database?.systemIdentifier ?? "") ||
    !ROLE_NAME.test(plan.database?.roleName ?? "") ||
    typeof plan.database?.databaseName !== "string" ||
    !Array.isArray(plan.database?.allowedHttpsOrigins)
  ) {
    fail("ATTACHMENT_RECONCILIATION_PLAN_DATABASE_INVALID");
  }
  const normalizedOrigins = [...parseAllowedOrigins(
    plan.database.allowedHttpsOrigins.join(","),
  )].sort();
  if (
    canonicalJson(normalizedOrigins) !==
    canonicalJson(plan.database.allowedHttpsOrigins)
  ) {
    fail("ATTACHMENT_RECONCILIATION_PLAN_ORIGINS_INVALID");
  }
  exactInteger(
    plan.summary?.actionCount,
    0,
    MAX_ROWS_PER_RELATION,
    "ATTACHMENT_RECONCILIATION_PLAN_COUNT_INVALID",
  );
  if (
    plan.summary.actionCount !== plan.actions.length ||
    plan.summary.reviewAttachmentCount !== plan.reviews.length ||
    plan.summary.signalReviewCount !== plan.signalReviews.length ||
    plan.summary.attachmentCount !==
      plan.actions.length + plan.reviews.length ||
    !Number.isInteger(plan.summary.bindingCountObserved) ||
    plan.summary.bindingCountObserved < 0 ||
    plan.summary.bindingCountObserved > MAX_ROWS_PER_RELATION
  ) {
    fail("ATTACHMENT_RECONCILIATION_PLAN_SUMMARY_INVALID");
  }
  const actionIds = new Set();
  let previousId = "";
  for (const action of plan.actions) {
    exactString(action.attachmentId, UUID, "ATTACHMENT_RECONCILIATION_PLAN_ACTION_INVALID");
    if (actionIds.has(action.attachmentId) || action.attachmentId <= previousId) {
      fail("ATTACHMENT_RECONCILIATION_PLAN_ACTION_ORDER_INVALID");
    }
    actionIds.add(action.attachmentId);
    previousId = action.attachmentId;
    if (
      action.before?.state !== "UNRESOLVED" ||
      action.before.pendingExpiresAt !== null ||
      typeof action.before.stateReasonCode !== "string" ||
      action.before.stateReasonCode.trim().length === 0 ||
      action.binding?.attachmentId !== action.attachmentId ||
      action.binding?.candidateAttachmentId !== action.attachmentId ||
      action.binding?.tenantId !== action.tenantId ||
      action.binding?.state !== "BOUND" ||
      action.binding?.createdByUserId !== null ||
      action.binding?.reasonCode !== null ||
      !UUID.test(action.binding?.id ?? "") ||
      !SHA256.test(action.binding?.sourceKey ?? "") ||
      !OPAQUE_ID.test(action.tenantId ?? "") ||
      !OPAQUE_ID.test(action.binding?.resourceId ?? "") ||
      (action.binding?.resourceStoreId !== null &&
        !OPAQUE_ID.test(action.binding?.resourceStoreId ?? "")) ||
      !REQUIRED_ENUMS.StaffAttachmentResourceKind.includes(
        action.binding?.resourceKind,
      ) ||
      !["CHAT_RELATION_BACKFILL", "LEGACY_REFERENCE_BACKFILL"].includes(
        action.binding?.source,
      ) ||
      (action.binding?.source === "CHAT_RELATION_BACKFILL" &&
        action.binding?.resourceKind !== "CHAT_MESSAGE") ||
      (action.binding?.source === "LEGACY_REFERENCE_BACKFILL" &&
        action.binding?.resourceKind !== "STAFF_TASK")
    ) {
      fail("ATTACHMENT_RECONCILIATION_PLAN_ACTION_INVALID");
    }
    exactIso(
      action.before.stateChangedAt,
      "ATTACHMENT_RECONCILIATION_PLAN_ACTION_INVALID",
    );
    const expectedSourceKey = sourceKeyFor(action.binding);
    if (
      expectedSourceKey !== action.binding.sourceKey ||
      deterministicUuid("binding-id", expectedSourceKey) !== action.binding.id
    ) {
      fail("ATTACHMENT_RECONCILIATION_PLAN_ACTION_DERIVATION_INVALID");
    }
  }
  const reviewedIds = new Set();
  let previousReviewedId = "";
  for (const review of plan.reviews) {
    exactString(
      review.attachmentId,
      UUID,
      "ATTACHMENT_RECONCILIATION_PLAN_REVIEW_INVALID",
    );
    if (
      actionIds.has(review.attachmentId) ||
      reviewedIds.has(review.attachmentId) ||
      review.attachmentId <= previousReviewedId ||
      !OPAQUE_ID.test(review.tenantId ?? "") ||
      !REQUIRED_ENUMS.StaffAttachmentState.includes(review.state) ||
      !Array.isArray(review.primaryParents) ||
      !Array.isArray(review.reasonCodes) ||
      review.reasonCodes.length === 0 ||
      canonicalJson(review.reasonCodes) !==
        canonicalJson(sortedUnique(review.reasonCodes)) ||
      review.reasonCodes.some(
        (reasonCode) => !/^[A-Z][A-Z0-9_]{2,100}$/u.test(reasonCode),
      ) ||
      review.primaryParents.some(
        (parent) =>
          !REQUIRED_ENUMS.StaffAttachmentResourceKind.includes(
            parent?.resourceKind,
          ) ||
          !OPAQUE_ID.test(parent?.resourceId ?? "") ||
          (parent?.resourceStoreId !== null &&
            !OPAQUE_ID.test(parent?.resourceStoreId ?? "")),
      )
    ) {
      fail("ATTACHMENT_RECONCILIATION_PLAN_REVIEW_INVALID");
    }
    reviewedIds.add(review.attachmentId);
    previousReviewedId = review.attachmentId;
  }
  for (const signal of plan.signalReviews) {
    if (
      (signal.attachmentId !== null &&
        !UUID.test(signal.attachmentId ?? "")) ||
      (signal.attachmentId !== null && actionIds.has(signal.attachmentId)) ||
      !/^[A-Z][A-Z0-9_]{2,100}$/u.test(signal.reasonCode ?? "") ||
      !OPAQUE_ID.test(signal.resourceId ?? "") ||
      !REQUIRED_ENUMS.StaffAttachmentResourceKind.includes(
        signal.resourceKind,
      ) ||
      !OPAQUE_ID.test(signal.sourceRowId ?? "") ||
      !OPAQUE_ID.test(signal.tenantId ?? "")
    ) {
      fail("ATTACHMENT_RECONCILIATION_PLAN_SIGNAL_INVALID");
    }
  }
  const tenantActionCounts = plan.summary.tenantActionCounts;
  if (
    !Array.isArray(tenantActionCounts) ||
    tenantActionCounts.reduce((sum, row) => sum + row.actionCount, 0) !==
      plan.actions.length ||
    canonicalJson(tenantActionCounts) !==
      canonicalJson(
        Object.entries(
          plan.actions.reduce((counts, action) => {
            counts[action.tenantId] = (counts[action.tenantId] ?? 0) + 1;
            return counts;
          }, {}),
        )
          .map(([tenantId, actionCount]) => ({ actionCount, tenantId }))
          .sort((a, b) => a.tenantId.localeCompare(b.tenantId, "en")),
      )
  ) {
    fail("ATTACHMENT_RECONCILIATION_PLAN_TENANT_SUMMARY_INVALID");
  }
  return plan;
}

export function createStaffAttachmentReconciliationApproval({
  actionCount,
  confirmationPhrase,
  confirmedPlanDigest,
  direction,
  plan,
  reviewAttachmentCount,
  now = new Date(),
}) {
  validateStaffAttachmentReconciliationPlan(plan);
  if (plan.summary.actionCount === 0) {
    fail("ATTACHMENT_RECONCILIATION_PLAN_HAS_NO_ACTIONS");
  }
  if (
    !Object.hasOwn(APPROVAL_PHRASES, direction) ||
    confirmationPhrase !== APPROVAL_PHRASES[direction] ||
    !equalDigest(confirmedPlanDigest, plan.planDigest) ||
    Number(actionCount) !== plan.summary.actionCount ||
    Number(reviewAttachmentCount) !== plan.summary.reviewAttachmentCount
  ) {
    fail("ATTACHMENT_RECONCILIATION_APPROVAL_CONFIRMATION_INVALID");
  }
  const core = Object.freeze({
    actionCount: plan.summary.actionCount,
    approvedAt: iso(now),
    contractVersion: APPROVAL_CONTRACT,
    direction,
    planDigest: plan.planDigest,
    reviewAttachmentCount: plan.summary.reviewAttachmentCount,
  });
  return Object.freeze({ ...core, approvalDigest: digest("approval", core) });
}

export function validateStaffAttachmentReconciliationApproval(
  approval,
  plan,
  direction,
) {
  validateStaffAttachmentReconciliationPlan(plan);
  if (
    approval === null ||
    typeof approval !== "object" ||
    approval.contractVersion !== APPROVAL_CONTRACT ||
    approval.direction !== direction ||
    approval.planDigest !== plan.planDigest ||
    approval.actionCount !== plan.summary.actionCount ||
    approval.reviewAttachmentCount !== plan.summary.reviewAttachmentCount ||
    !SHA256.test(approval.approvalDigest ?? "")
  ) {
    fail("ATTACHMENT_RECONCILIATION_APPROVAL_INVALID");
  }
  const { approvalDigest, ...core } = approval;
  if (!equalDigest(approvalDigest, digest("approval", core))) {
    fail("ATTACHMENT_RECONCILIATION_APPROVAL_DIGEST_INVALID");
  }
  exactIso(approval.approvedAt, "ATTACHMENT_RECONCILIATION_APPROVAL_INVALID");
  return approval;
}

function parseRuntimeInteger(value, fallback, minimum, maximum, reasonCode) {
  if (value === undefined || value === null || value === "") return fallback;
  if (!/^\d+$/u.test(String(value))) fail(reasonCode);
  return exactInteger(Number(value), minimum, maximum, reasonCode);
}

export function parseStaffAttachmentReconciliationRuntime(environment) {
  const target = String(
    environment.STAFF_ATTACHMENT_RECONCILIATION_TARGET ?? "",
  )
    .trim()
    .toLowerCase();
  if (!TARGETS.has(target)) fail("ATTACHMENT_RECONCILIATION_TARGET_INVALID");
  const productionRequested =
    target === "production" ||
    String(environment.NODE_ENV ?? "").trim().toLowerCase() === "production";
  if (
    String(environment.NODE_ENV ?? "").trim().toLowerCase() === "production" &&
    target !== "production"
  ) {
    fail("ATTACHMENT_RECONCILIATION_PRODUCTION_TARGET_MISMATCH");
  }
  if (
    productionRequested &&
    environment.STAFF_ATTACHMENT_RECONCILIATION_PRODUCTION_ATTESTATION !==
      PRODUCTION_ATTESTATION
  ) {
    fail("ATTACHMENT_RECONCILIATION_PRODUCTION_ATTESTATION_REQUIRED");
  }
  const databaseUrl = environment.DATABASE_URL;
  const parsedUrl = parsePostgresDatabaseUrl(databaseUrl);
  const targetFingerprint = databaseTargetFingerprint(databaseUrl);
  const expectedFingerprint = exactString(
    String(
      environment.STAFF_ATTACHMENT_RECONCILIATION_EXPECTED_DATABASE_FINGERPRINT ??
        "",
    ),
    SHA256,
    "ATTACHMENT_RECONCILIATION_DATABASE_FINGERPRINT_REQUIRED",
  );
  if (!equalDigest(targetFingerprint, expectedFingerprint)) {
    fail("ATTACHMENT_RECONCILIATION_DATABASE_FINGERPRINT_MISMATCH");
  }
  const databaseName = decodeURIComponent(parsedUrl.pathname.slice(1));
  const expectedDatabaseName = exactString(
    String(
      environment.STAFF_ATTACHMENT_RECONCILIATION_EXPECTED_DATABASE_NAME ?? "",
    ),
    OPAQUE_ID,
    "ATTACHMENT_RECONCILIATION_DATABASE_NAME_REQUIRED",
  );
  if (databaseName !== expectedDatabaseName) {
    fail("ATTACHMENT_RECONCILIATION_DATABASE_NAME_MISMATCH");
  }
  const publicConfig = Object.freeze({
    allowedHttpsOrigins: [...parseAllowedOrigins(
      environment.STAFF_ATTACHMENT_ALLOWED_HTTPS_ORIGINS ?? "",
    )].sort(),
    databaseName,
    databaseTargetFingerprint: targetFingerprint,
    expectedRoleName: exactString(
      String(
        environment.STAFF_ATTACHMENT_RECONCILIATION_EXPECTED_ROLE ?? "",
      ),
      ROLE_NAME,
      "ATTACHMENT_RECONCILIATION_ROLE_REQUIRED",
    ),
    expectedSystemIdentifier: exactString(
      String(
        environment.STAFF_ATTACHMENT_RECONCILIATION_EXPECTED_SYSTEM_IDENTIFIER ??
          "",
      ),
      SYSTEM_IDENTIFIER,
      "ATTACHMENT_RECONCILIATION_SYSTEM_IDENTIFIER_REQUIRED",
    ),
    releaseSha: exactString(
      String(environment.STAFF_ATTACHMENT_RECONCILIATION_RELEASE_SHA ?? ""),
      RELEASE_SHA,
      "ATTACHMENT_RECONCILIATION_RELEASE_SHA_REQUIRED",
    ),
    target,
  });
  return Object.freeze({
    databaseUrl,
    lockTimeoutMs: parseRuntimeInteger(
      environment.STAFF_ATTACHMENT_RECONCILIATION_LOCK_TIMEOUT_MS,
      2_000,
      100,
      10_000,
      "ATTACHMENT_RECONCILIATION_LOCK_TIMEOUT_INVALID",
    ),
    publicConfig,
    statementTimeoutMs: parseRuntimeInteger(
      environment.STAFF_ATTACHMENT_RECONCILIATION_STATEMENT_TIMEOUT_MS,
      60_000,
      1_000,
      120_000,
      "ATTACHMENT_RECONCILIATION_STATEMENT_TIMEOUT_INVALID",
    ),
  });
}

function connectionString(config, readOnly) {
  const parsed = new URL(config.databaseUrl);
  const currentOptions = parsed.searchParams.get("options")?.trim();
  parsed.searchParams.set(
    "options",
    [
      currentOptions,
      "-c timezone=UTC",
      `-c statement_timeout=${config.statementTimeoutMs}`,
      `-c lock_timeout=${config.lockTimeoutMs}`,
      ...(readOnly ? ["-c default_transaction_read_only=on"] : []),
    ]
      .filter(Boolean)
      .join(" "),
  );
  parsed.searchParams.set(
    "application_name",
    readOnly
      ? "staff-attachment-reconciliation-plan"
      : "staff-attachment-reconciliation-write",
  );
  return parsed.toString();
}

async function schemaCatalog(client) {
  const [columnsResult, enumsResult, triggersResult, constraintsResult] =
    await Promise.all([
      client.query(`
        SELECT table_name AS "tableName", column_name AS "columnName",
               data_type AS "dataType", udt_name AS "udtName",
               is_nullable AS "isNullable", column_default AS "columnDefault"
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = ANY($1::text[])
        ORDER BY table_name COLLATE "C", ordinal_position
      `, [Object.keys(REQUIRED_COLUMNS)]),
      client.query(`
        SELECT type_row.typname AS "typeName", enum_row.enumlabel AS "label",
               enum_row.enumsortorder::text AS "sortOrder"
        FROM pg_catalog.pg_type AS type_row
        JOIN pg_catalog.pg_namespace AS namespace
          ON namespace.oid = type_row.typnamespace
        JOIN pg_catalog.pg_enum AS enum_row
          ON enum_row.enumtypid = type_row.oid
        WHERE namespace.nspname = 'public'
          AND type_row.typname = ANY($1::text[])
        ORDER BY type_row.typname COLLATE "C", enum_row.enumsortorder
      `, [Object.keys(REQUIRED_ENUMS)]),
      client.query(`
        SELECT trigger_row.tgname AS "triggerName",
               relation.relname AS "relationName",
               pg_catalog.pg_get_triggerdef(trigger_row.oid, true) AS "definition",
               trigger_row.tgenabled AS "enabled",
               trigger_row.tgdeferrable AS "deferrable",
               trigger_row.tginitdeferred AS "initiallyDeferred"
        FROM pg_catalog.pg_trigger AS trigger_row
        JOIN pg_catalog.pg_class AS relation ON relation.oid = trigger_row.tgrelid
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public'
          AND trigger_row.tgname = ANY($1::text[])
          AND NOT trigger_row.tgisinternal
        ORDER BY trigger_row.tgname COLLATE "C"
      `, [REQUIRED_TRIGGERS]),
      client.query(`
        SELECT relation.relname AS "relationName",
               constraint_row.conname AS "constraintName",
               constraint_row.contype AS "constraintType",
               pg_catalog.pg_get_constraintdef(constraint_row.oid, true) AS "definition",
               constraint_row.convalidated AS "validated"
        FROM pg_catalog.pg_constraint AS constraint_row
        JOIN pg_catalog.pg_class AS relation ON relation.oid = constraint_row.conrelid
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public'
          AND relation.relname = ANY($1::text[])
        ORDER BY relation.relname COLLATE "C", constraint_row.conname COLLATE "C"
      `, [["StaffAttachment", "StaffAttachmentBinding", "PlatformAdminAuditEvent"]]),
    ]);
  const catalog = Object.freeze({
    columns: columnsResult.rows,
    constraints: constraintsResult.rows,
    enums: enumsResult.rows,
    triggers: triggersResult.rows,
  });
  for (const [tableName, columnNames] of Object.entries(REQUIRED_COLUMNS)) {
    const actual = new Set(
      catalog.columns
        .filter((row) => row.tableName === tableName)
        .map((row) => row.columnName),
    );
    if (columnNames.some((name) => !actual.has(name))) {
      fail("ATTACHMENT_RECONCILIATION_SCHEMA_COLUMN_MISSING");
    }
  }
  for (const [typeName, expectedLabels] of Object.entries(REQUIRED_ENUMS)) {
    const actualLabels = catalog.enums
      .filter((row) => row.typeName === typeName)
      .map((row) => row.label);
    if (canonicalJson(actualLabels) !== canonicalJson(expectedLabels)) {
      fail("ATTACHMENT_RECONCILIATION_SCHEMA_ENUM_DRIFT");
    }
  }
  const actualTriggers = new Map(
    catalog.triggers.map((row) => [row.triggerName, row]),
  );
  for (const triggerName of REQUIRED_TRIGGERS) {
    const row = actualTriggers.get(triggerName);
    if (
      !row ||
      row.enabled !== "O" ||
      (triggerName.includes("parent_delete_check") &&
        (row.deferrable !== true || row.initiallyDeferred !== true))
    ) {
      fail("ATTACHMENT_RECONCILIATION_SCHEMA_TRIGGER_DRIFT");
    }
  }
  return catalog;
}

async function attestDatabase(client, config) {
  const [identityResult, migrationsResult, catalog] = await Promise.all([
    client.query(`
      SELECT current_database() AS "databaseName",
             current_user AS "roleName",
             current_setting('server_version_num')::integer AS "serverVersionNumber",
             (pg_catalog.pg_control_system()).system_identifier::text AS "systemIdentifier",
             role_row.rolsuper AS "superuser",
             role_row.rolinherit AS "inherits",
             role_row.rolcreaterole AS "createRole",
             role_row.rolcreatedb AS "createDatabase",
             role_row.rolreplication AS "replication",
             role_row.rolbypassrls AS "bypassRls"
      FROM pg_catalog.pg_roles AS role_row
      WHERE role_row.rolname = current_user
    `),
    client.query(`
      SELECT migration_name AS "migrationName", finished_at AS "finishedAt",
             rolled_back_at AS "rolledBackAt"
      FROM public._prisma_migrations
      ORDER BY started_at, migration_name COLLATE "C"
    `),
    schemaCatalog(client),
  ]);
  if (identityResult.rows.length !== 1) {
    fail("ATTACHMENT_RECONCILIATION_DATABASE_IDENTITY_INVALID");
  }
  const identity = identityResult.rows[0];
  if (
    identity.databaseName !== config.publicConfig.databaseName ||
    identity.roleName !== config.publicConfig.expectedRoleName ||
    identity.systemIdentifier !== config.publicConfig.expectedSystemIdentifier ||
    Number(identity.serverVersionNumber) < 150000 ||
    identity.superuser !== false ||
    identity.inherits !== false ||
    identity.createRole !== false ||
    identity.createDatabase !== false ||
    identity.replication !== false ||
    identity.bypassRls !== false
  ) {
    fail("ATTACHMENT_RECONCILIATION_DATABASE_IDENTITY_MISMATCH");
  }
  const completed = migrationsResult.rows.filter(
    (row) => row.finishedAt !== null && row.rolledBackAt === null,
  );
  const unfinished = migrationsResult.rows.filter(
    (row) => row.finishedAt === null && row.rolledBackAt === null,
  );
  if (
    completed.length !== EXPECTED_MIGRATION_COUNT ||
    completed.at(-1)?.migrationName !== EXPECTED_MIGRATION_HEAD ||
    unfinished.length !== 0
  ) {
    fail("ATTACHMENT_RECONCILIATION_MIGRATION_STATE_MISMATCH");
  }
  return Object.freeze({
    databaseIdentityDigest: digest("database-identity", identity),
    databaseName: identity.databaseName,
    databaseTargetFingerprint:
      config.publicConfig.databaseTargetFingerprint,
    expectedMigrationCount: EXPECTED_MIGRATION_COUNT,
    expectedMigrationHead: EXPECTED_MIGRATION_HEAD,
    releaseSha: config.publicConfig.releaseSha,
    roleName: identity.roleName,
    schemaContractDigest: digest("schema-catalog", catalog),
    systemIdentifier: identity.systemIdentifier,
    target: config.publicConfig.target,
    allowedHttpsOrigins: config.publicConfig.allowedHttpsOrigins,
  });
}

async function pagedQuery(client, text, values = []) {
  const rows = [];
  let cursor = null;
  for (;;) {
    const result = await client.query(text, [cursor, BATCH_SIZE, ...values]);
    if (result.rows.length === 0) break;
    rows.push(...result.rows);
    if (rows.length > MAX_ROWS_PER_RELATION) {
      fail("ATTACHMENT_RECONCILIATION_RELATION_ROW_CAP_EXCEEDED");
    }
    cursor = result.rows.at(-1).id;
  }
  return rows;
}

async function collectPrimarySnapshot(client, allowedOrigins) {
  const attachments = (
    await pagedQuery(client, `
      SELECT attachment."id", attachment."tenantId", attachment."state"::text AS "state",
             CASE WHEN attachment."pendingExpiresAt" IS NULL THEN NULL ELSE
               to_char(attachment."pendingExpiresAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
             END AS "pendingExpiresAt",
             attachment."stateReasonCode",
             to_char(attachment."stateChangedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "stateChangedAt",
             to_char(attachment."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"
      FROM public."StaffAttachment" AS attachment
      WHERE ($1::text IS NULL OR attachment."id" > $1)
      ORDER BY attachment."id" COLLATE "C"
      LIMIT $2
    `)
  ).map((row) => ({
    ...row,
    createdAt: iso(row.createdAt),
    pendingExpiresAt: nullableIso(row.pendingExpiresAt),
    stateChangedAt: iso(row.stateChangedAt),
  }));
  const chatRows = await pagedQuery(client, `
    SELECT relation."id", relation."tenantId" AS "sourceTenantId",
           relation."attachmentId", relation."messageId" AS "resourceId",
           message."tenantId" AS "parentTenantId",
           message."storeId" AS "resourceStoreId",
           store."tenantId" AS "resourceStoreTenantId",
           channel."tenantId" AS "channelTenantId",
           channel."scope" AS "channelScope",
           channel."storeId" AS "channelStoreId"
    FROM public."StaffChatMessageAttachment" AS relation
    JOIN public."StaffChatMessage" AS message ON message."id" = relation."messageId"
    JOIN public."StaffChatChannel" AS channel ON channel."id" = message."channelId"
    LEFT JOIN public."Store" AS store ON store."id" = message."storeId"
    WHERE ($1::text IS NULL OR relation."id" > $1)
    ORDER BY relation."id" COLLATE "C"
    LIMIT $2
  `);
  const taskRows = await pagedQuery(client, `
    SELECT comment."id", comment."tenantId" AS "sourceTenantId",
           comment."evidenceUrl", task."id" AS "resourceId",
           task."tenantId" AS "parentTenantId",
           task."storeId" AS "resourceStoreId",
           store."tenantId" AS "resourceStoreTenantId"
    FROM public."StaffTaskComment" AS comment
    JOIN public."StaffTask" AS task ON task."id" = comment."taskId"
    LEFT JOIN public."Store" AS store ON store."id" = task."storeId"
    WHERE comment."evidenceUrl" IS NOT NULL
      AND ($1::text IS NULL OR comment."id" > $1)
    ORDER BY comment."id" COLLATE "C"
    LIMIT $2
  `);
  const bindings = (
    await pagedQuery(client, `
      SELECT binding."id", binding."tenantId", binding."attachmentId",
             binding."candidateAttachmentId", binding."resourceKind"::text AS "resourceKind",
             binding."resourceId", binding."resourceStoreId",
             binding."state"::text AS "state", binding."source"::text AS "source",
             binding."sourceKey", binding."createdByUserId", binding."reasonCode"
      FROM public."StaffAttachmentBinding" AS binding
      WHERE ($1::text IS NULL OR binding."id" > $1)
      ORDER BY binding."id" COLLATE "C"
      LIMIT $2
    `)
  );
  const occurrences = chatRows.map((row) => {
    const storeConflict =
      row.channelScope === "STORE" &&
      (!row.resourceStoreId ||
        !row.channelStoreId ||
        row.resourceStoreId !== row.channelStoreId);
    return Object.freeze({
      attachmentId: String(row.attachmentId).toLowerCase(),
      parentTenantId: row.parentTenantId,
      parentValid:
        !storeConflict && row.channelTenantId === row.parentTenantId,
      referenceForm: "NORMALIZED_RELATION",
      resourceId: row.resourceId,
      resourceKind: "CHAT_MESSAGE",
      resourceStoreId: row.resourceStoreId,
      resourceStoreTenantId: row.resourceStoreTenantId,
      source: "NORMALIZED_CHAT_RELATION",
      sourceRowId: row.id,
      sourceTenantId: row.sourceTenantId,
    });
  });
  const signals = [];
  for (const row of taskRows) {
    const parsed = parseExactAttachmentReference(
      row.evidenceUrl,
      new Set(allowedOrigins),
    );
    if (!parsed.match) {
      if (parsed.reasonCode) {
        signals.push({
          attachmentId: parsed.reviewAttachmentId?.toLowerCase() ?? null,
          reasonCode: parsed.reasonCode,
          resourceId: row.resourceId,
          sourceRowId: row.id,
          tenantId: row.sourceTenantId,
        });
      }
      continue;
    }
    occurrences.push(
      Object.freeze({
        attachmentId: parsed.match.attachmentId.toLowerCase(),
        parentTenantId: row.parentTenantId,
        parentValid: true,
        referenceForm: parsed.match.referenceForm,
        resourceId: row.resourceId,
        resourceKind: "STAFF_TASK",
        resourceStoreId: row.resourceStoreId,
        resourceStoreTenantId: row.resourceStoreTenantId,
        source: "TASK_COMMENT_EVIDENCE_URL",
        sourceRowId: row.id,
        sourceTenantId: row.sourceTenantId,
      }),
    );
  }
  return { attachments, bindings, occurrences, signals };
}

export async function createStaffAttachmentReconciliationPlanFromDatabase(
  config,
) {
  const client = new pg.Client({ connectionString: connectionString(config, true) });
  await client.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const snapshotResult = await client.query(`
      SELECT transaction_timestamp() AS "snapshotAt",
             current_setting('transaction_read_only') AS "readOnly",
             current_setting('transaction_isolation') AS "isolation"
    `);
    if (
      snapshotResult.rows[0]?.readOnly !== "on" ||
      snapshotResult.rows[0]?.isolation !== "repeatable read"
    ) {
      fail("ATTACHMENT_RECONCILIATION_READ_ONLY_SNAPSHOT_INVALID");
    }
    const database = await attestDatabase(client, config);
    const snapshot = await collectPrimarySnapshot(
      client,
      config.publicConfig.allowedHttpsOrigins,
    );
    await client.query("COMMIT");
    const plan = buildStaffAttachmentReconciliationPlan({
      ...snapshot,
      database,
      generatedAt: iso(snapshotResult.rows[0].snapshotAt),
    });
    validateStaffAttachmentReconciliationPlan(plan);
    return plan;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

function actionAfterImage(action, transitionAt) {
  return {
    attachmentId: action.attachmentId,
    pendingExpiresAt: null,
    state: "BOUND",
    stateChangedAt: transitionAt,
    stateReasonCode: null,
    tenantId: action.tenantId,
  };
}

function bindingAfterImage(action, transitionAt) {
  return {
    ...action.binding,
    createdAt: transitionAt,
    resolvedAt: transitionAt,
    updatedAt: transitionAt,
  };
}

function auditEvents(plan, direction, transitionAt) {
  const action = direction === "APPLY" ? APPLY_AUDIT_ACTION : ROLLBACK_AUDIT_ACTION;
  return plan.summary.tenantActionCounts.map(({ actionCount, tenantId }) => {
    const beforeState = direction === "APPLY" ? "UNRESOLVED" : "BOUND";
    const afterState = direction === "APPLY" ? "BOUND" : "UNRESOLVED";
    return {
      action,
      after: { attachmentCount: actionCount, attachmentState: afterState },
      before: { attachmentCount: actionCount, attachmentState: beforeState },
      createdAt: transitionAt,
      id: deterministicUuid("audit-id", direction, plan.planDigest, tenantId),
      metadata: {
        actionCount,
        contractVersion: RECONCILIATION_CONTRACT,
        databaseTargetFingerprint: plan.database.databaseTargetFingerprint,
        direction,
        planDigest: plan.planDigest,
        releaseSha: plan.database.releaseSha,
        reviewAttachmentCount: plan.summary.reviewAttachmentCount,
        transitionAt,
      },
      reason:
        direction === "APPLY"
          ? "APPROVED_UNIQUE_PRIMARY_ATTACHMENT_BACKFILL"
          : "APPROVED_EXACT_ATTACHMENT_RECONCILIATION_ROLLBACK",
      requestId: plan.planDigest,
      targetId: plan.planDigest,
      targetType: TARGET_TYPE,
      tenantId,
    };
  });
}

export function materializeStaffAttachmentReconciliationState({
  applyTransitionAt,
  direction,
  plan,
  rollbackTransitionAt = null,
}) {
  validateStaffAttachmentReconciliationPlan(plan);
  exactIso(
    applyTransitionAt,
    "ATTACHMENT_RECONCILIATION_MATERIALIZED_TIMESTAMP_INVALID",
  );
  if (direction === "APPLY") {
    return Object.freeze({
      attachments: plan.actions.map((action) =>
        actionAfterImage(action, applyTransitionAt),
      ),
      audits: auditEvents(plan, "APPLY", applyTransitionAt),
      bindings: plan.actions.map((action) =>
        bindingAfterImage(action, applyTransitionAt),
      ),
    });
  }
  if (direction === "ROLLBACK") {
    exactIso(
      rollbackTransitionAt,
      "ATTACHMENT_RECONCILIATION_MATERIALIZED_TIMESTAMP_INVALID",
    );
    return Object.freeze({
      attachments: plan.actions.map((action) => ({
        attachmentId: action.attachmentId,
        ...action.before,
        tenantId: action.tenantId,
      })),
      audits: [
        ...auditEvents(plan, "APPLY", applyTransitionAt),
        ...auditEvents(plan, "ROLLBACK", rollbackTransitionAt),
      ],
      bindings: [],
    });
  }
  fail("ATTACHMENT_RECONCILIATION_DIRECTION_INVALID");
}

function normalizeCurrentState(state) {
  return {
    attachments: state.attachments.map((row) => ({
      attachmentId: row.id ?? row.attachmentId,
      pendingExpiresAt: nullableIso(row.pendingExpiresAt),
      state: row.state,
      stateChangedAt: iso(row.stateChangedAt),
      stateReasonCode: row.stateReasonCode,
      tenantId: row.tenantId,
    })),
    audits: state.audits.map((row) => ({
      ...row,
      createdAt: iso(row.createdAt),
    })),
    bindings: state.bindings.map((row) => ({
      ...row,
      createdAt: iso(row.createdAt),
      resolvedAt: nullableIso(row.resolvedAt),
      updatedAt: iso(row.updatedAt),
    })),
  };
}

function exactAuditSet(plan, direction, rows) {
  if (rows.length === 0) return { exists: false, transitionAt: null };
  const transitionValues = sortedUnique(
    rows.map((row) => row.metadata?.transitionAt),
  );
  if (transitionValues.length !== 1) {
    fail("ATTACHMENT_RECONCILIATION_AUDIT_DRIFT");
  }
  const transitionAt = exactIso(
    transitionValues[0],
    "ATTACHMENT_RECONCILIATION_AUDIT_DRIFT",
  );
  const expected = auditEvents(plan, direction, transitionAt);
  const actual = [...rows].sort((a, b) => a.tenantId.localeCompare(b.tenantId, "en"));
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    fail("ATTACHMENT_RECONCILIATION_AUDIT_DRIFT");
  }
  return { exists: true, transitionAt };
}

function compareStateRows(actual, expected, reasonCode) {
  const sortedActual = [...actual].sort((a, b) =>
    a.attachmentId.localeCompare(b.attachmentId, "en"),
  );
  const sortedExpected = [...expected].sort((a, b) =>
    a.attachmentId.localeCompare(b.attachmentId, "en"),
  );
  if (canonicalJson(sortedActual) !== canonicalJson(sortedExpected)) {
    fail(reasonCode);
  }
}

function compareBindingRows(actual, expected, reasonCode) {
  const sortedActual = [...actual].sort((a, b) => a.id.localeCompare(b.id, "en"));
  const sortedExpected = [...expected].sort((a, b) => a.id.localeCompare(b.id, "en"));
  if (canonicalJson(sortedActual) !== canonicalJson(sortedExpected)) {
    fail(reasonCode);
  }
}

export function classifyStaffAttachmentReconciliationState({
  direction,
  plan,
  state,
}) {
  validateStaffAttachmentReconciliationPlan(plan);
  if (!["APPLY", "ROLLBACK"].includes(direction)) {
    fail("ATTACHMENT_RECONCILIATION_DIRECTION_INVALID");
  }
  const normalized = normalizeCurrentState(state);
  const applyAudits = normalized.audits.filter(
    (row) => row.action === APPLY_AUDIT_ACTION,
  );
  const rollbackAudits = normalized.audits.filter(
    (row) => row.action === ROLLBACK_AUDIT_ACTION,
  );
  const applyAudit = exactAuditSet(plan, "APPLY", applyAudits);
  const rollbackAudit = exactAuditSet(plan, "ROLLBACK", rollbackAudits);
  const beforeRows = plan.actions.map((action) => ({
    attachmentId: action.attachmentId,
    ...action.before,
    tenantId: action.tenantId,
  }));
  const expectedBindings = applyAudit.exists
    ? plan.actions.map((action) =>
        bindingAfterImage(action, applyAudit.transitionAt),
      )
    : [];
  const afterRows = applyAudit.exists
    ? plan.actions.map((action) =>
        actionAfterImage(action, applyAudit.transitionAt),
      )
    : [];

  if (direction === "APPLY") {
    if (rollbackAudit.exists) {
      fail("ATTACHMENT_RECONCILIATION_PLAN_ALREADY_ROLLED_BACK");
    }
    if (applyAudit.exists) {
      compareStateRows(
        normalized.attachments,
        afterRows,
        "ATTACHMENT_RECONCILIATION_APPLIED_STATE_DRIFT",
      );
      compareBindingRows(
        normalized.bindings,
        expectedBindings,
        "ATTACHMENT_RECONCILIATION_APPLIED_BINDING_DRIFT",
      );
      return Object.freeze({ disposition: "RECONCILED", transitionAt: applyAudit.transitionAt });
    }
    compareStateRows(
      normalized.attachments,
      beforeRows,
      "ATTACHMENT_RECONCILIATION_BEFORE_STATE_DRIFT",
    );
    compareBindingRows(
      normalized.bindings,
      [],
      "ATTACHMENT_RECONCILIATION_PREEXISTING_BINDING_DRIFT",
    );
    return Object.freeze({ disposition: "MUTATE", transitionAt: null });
  }

  if (!applyAudit.exists) {
    fail("ATTACHMENT_RECONCILIATION_APPLY_AUDIT_REQUIRED");
  }
  if (rollbackAudit.exists) {
    compareStateRows(
      normalized.attachments,
      beforeRows,
      "ATTACHMENT_RECONCILIATION_ROLLBACK_STATE_DRIFT",
    );
    compareBindingRows(
      normalized.bindings,
      [],
      "ATTACHMENT_RECONCILIATION_ROLLBACK_BINDING_DRIFT",
    );
    return Object.freeze({ disposition: "RECONCILED", transitionAt: rollbackAudit.transitionAt });
  }
  compareStateRows(
    normalized.attachments,
    afterRows,
    "ATTACHMENT_RECONCILIATION_APPLIED_STATE_DRIFT",
  );
  compareBindingRows(
    normalized.bindings,
    expectedBindings,
    "ATTACHMENT_RECONCILIATION_APPLIED_BINDING_DRIFT",
  );
  return Object.freeze({ disposition: "MUTATE", transitionAt: null });
}

async function readCurrentState(client, plan, lockRows) {
  if (plan.actions.length === 0) {
    return { attachments: [], audits: [], bindings: [] };
  }
  const ids = plan.actions.map((action) => action.attachmentId);
  const attachmentResult = await client.query(
    `SELECT attachment."id", attachment."tenantId", attachment."state"::text AS "state",
            CASE WHEN attachment."pendingExpiresAt" IS NULL THEN NULL ELSE
              to_char(attachment."pendingExpiresAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
            END AS "pendingExpiresAt",
            attachment."stateReasonCode",
            to_char(attachment."stateChangedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "stateChangedAt"
     FROM public."StaffAttachment" AS attachment
     WHERE attachment."id" = ANY($1::text[])
     ORDER BY attachment."id" COLLATE "C"
     ${lockRows ? "FOR UPDATE" : ""}`,
    [ids],
  );
  const bindingResult = await client.query(
    `SELECT binding."id", binding."tenantId", binding."attachmentId",
            binding."candidateAttachmentId", binding."resourceKind"::text AS "resourceKind",
            binding."resourceId", binding."resourceStoreId",
            binding."state"::text AS "state", binding."source"::text AS "source",
            binding."sourceKey", binding."createdByUserId", binding."reasonCode",
            CASE WHEN binding."resolvedAt" IS NULL THEN NULL ELSE
              to_char(binding."resolvedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
            END AS "resolvedAt",
            to_char(binding."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
            to_char(binding."updatedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "updatedAt"
     FROM public."StaffAttachmentBinding" AS binding
     WHERE binding."attachmentId" = ANY($1::text[])
        OR binding."candidateAttachmentId" = ANY($1::text[])
     ORDER BY binding."id" COLLATE "C"`,
    [ids],
  );
  const auditResult = await client.query(
    `SELECT event."id", event."tenantId", event."requestId", event."action",
            event."targetType", event."targetId", event."reason",
            event."before", event."after", event."metadata",
            to_char(event."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"
     FROM public."PlatformAdminAuditEvent" AS event
     WHERE event."requestId" = $1
       AND event."action" = ANY($2::text[])
     ORDER BY event."tenantId" COLLATE "C", event."action" COLLATE "C"`,
    [plan.planDigest, [APPLY_AUDIT_ACTION, ROLLBACK_AUDIT_ACTION]],
  );
  return {
    attachments: attachmentResult.rows,
    audits: auditResult.rows,
    bindings: bindingResult.rows,
  };
}

async function validateCurrentParents(client, plan, allowedOrigins) {
  if (plan.actions.length === 0) return;
  const ids = plan.actions.map((action) => action.attachmentId);
  const expected = new Map(
    plan.actions.map((action) => [
      action.attachmentId,
      `${action.binding.resourceKind}\0${action.binding.resourceId}`,
    ]),
  );
  const actionById = new Map(
    plan.actions.map((action) => [action.attachmentId, action]),
  );
  const chatResult = await client.query(`
    SELECT relation."id", relation."tenantId" AS "sourceTenantId",
           relation."attachmentId", relation."messageId" AS "resourceId",
           message."tenantId" AS "parentTenantId", message."storeId" AS "resourceStoreId",
           store."tenantId" AS "resourceStoreTenantId",
           channel."tenantId" AS "channelTenantId", channel."scope" AS "channelScope",
           channel."storeId" AS "channelStoreId"
    FROM public."StaffChatMessageAttachment" AS relation
    JOIN public."StaffChatMessage" AS message ON message."id" = relation."messageId"
    JOIN public."StaffChatChannel" AS channel ON channel."id" = message."channelId"
    LEFT JOIN public."Store" AS store ON store."id" = message."storeId"
    WHERE relation."attachmentId" = ANY($1::text[])
    ORDER BY relation."attachmentId" COLLATE "C", relation."id" COLLATE "C"
  `, [ids]);
  const taskRows = await pagedQuery(client, `
    SELECT comment."id", comment."tenantId" AS "sourceTenantId",
           comment."evidenceUrl", task."id" AS "resourceId",
           task."tenantId" AS "parentTenantId", task."storeId" AS "resourceStoreId",
           store."tenantId" AS "resourceStoreTenantId"
    FROM public."StaffTaskComment" AS comment
    JOIN public."StaffTask" AS task ON task."id" = comment."taskId"
    LEFT JOIN public."Store" AS store ON store."id" = task."storeId"
    WHERE comment."evidenceUrl" IS NOT NULL
      AND ($1::text IS NULL OR comment."id" > $1)
    ORDER BY comment."id" COLLATE "C"
    LIMIT $2
  `);
  const observed = new Map(ids.map((id) => [id, new Set()]));
  for (const row of chatResult.rows) {
    const action = actionById.get(row.attachmentId);
    const storeConflict =
      row.channelScope === "STORE" &&
      (!row.resourceStoreId || !row.channelStoreId || row.resourceStoreId !== row.channelStoreId);
    if (
      !action ||
      storeConflict ||
      row.sourceTenantId !== action.tenantId ||
      row.parentTenantId !== action.tenantId ||
      row.channelTenantId !== action.tenantId ||
      (row.resourceStoreId !== null && row.resourceStoreTenantId !== action.tenantId)
    ) {
      fail("ATTACHMENT_RECONCILIATION_PRIMARY_GRAPH_DRIFT");
    }
    observed.get(row.attachmentId).add(`CHAT_MESSAGE\0${row.resourceId}`);
  }
  const allowed = new Set(allowedOrigins);
  for (const row of taskRows) {
    const parsed = parseExactAttachmentReference(row.evidenceUrl, allowed);
    if (!parsed.match) {
      if (
        parsed.reviewAttachmentId &&
        actionById.has(parsed.reviewAttachmentId.toLowerCase())
      ) {
        fail("ATTACHMENT_RECONCILIATION_PRIMARY_GRAPH_DRIFT");
      }
      continue;
    }
    const attachmentId = parsed.match.attachmentId.toLowerCase();
    if (!observed.has(attachmentId)) continue;
    const action = actionById.get(attachmentId);
    if (
      row.sourceTenantId !== action.tenantId ||
      row.parentTenantId !== action.tenantId ||
      (row.resourceStoreId !== null && row.resourceStoreTenantId !== action.tenantId)
    ) {
      fail("ATTACHMENT_RECONCILIATION_PRIMARY_GRAPH_DRIFT");
    }
    observed.get(attachmentId).add(`STAFF_TASK\0${row.resourceId}`);
  }
  for (const [attachmentId, parents] of observed) {
    if (parents.size !== 1 || !parents.has(expected.get(attachmentId))) {
      fail("ATTACHMENT_RECONCILIATION_PRIMARY_GRAPH_DRIFT");
    }
  }
  const scopeResult = await client.query(`
    SELECT desired."attachmentId", desired."resourceKind", desired."resourceId",
           scope."tenantId", scope."storeId"
    FROM jsonb_to_recordset($1::jsonb) AS desired(
      "attachmentId" text, "resourceKind" text, "resourceId" text
    )
    LEFT JOIN LATERAL public."resolve_staff_attachment_resource_scope"(
      desired."resourceKind"::public."StaffAttachmentResourceKind",
      desired."resourceId"
    ) AS scope ON true
    ORDER BY desired."attachmentId" COLLATE "C"
  `, [JSON.stringify(plan.actions.map((action) => ({
    attachmentId: action.attachmentId,
    resourceId: action.binding.resourceId,
    resourceKind: action.binding.resourceKind,
  })))]);
  if (scopeResult.rows.length !== plan.actions.length) {
    fail("ATTACHMENT_RECONCILIATION_PARENT_SCOPE_DRIFT");
  }
  for (const row of scopeResult.rows) {
    const action = actionById.get(row.attachmentId);
    if (
      !action ||
      row.tenantId !== action.tenantId ||
      (row.storeId ?? null) !== action.binding.resourceStoreId
    ) {
      fail("ATTACHMENT_RECONCILIATION_PARENT_SCOPE_DRIFT");
    }
  }
}

async function insertBindings(client, plan, transitionAt) {
  const rows = plan.actions.map((action) => bindingAfterImage(action, transitionAt));
  const result = await client.query(`
    INSERT INTO public."StaffAttachmentBinding" (
      "id", "tenantId", "attachmentId", "candidateAttachmentId",
      "resourceKind", "resourceId", "resourceStoreId", "state", "source",
      "sourceKey", "createdByUserId", "reasonCode", "resolvedAt", "createdAt", "updatedAt"
    )
    SELECT desired."id", desired."tenantId", desired."attachmentId",
           desired."candidateAttachmentId",
           desired."resourceKind"::public."StaffAttachmentResourceKind",
           desired."resourceId", desired."resourceStoreId",
           desired."state"::public."StaffAttachmentBindingState",
           desired."source"::public."StaffAttachmentBindingSource",
           desired."sourceKey", NULL, NULL,
           desired."resolvedAt"::timestamp(3), desired."createdAt"::timestamp(3),
           desired."updatedAt"::timestamp(3)
    FROM jsonb_to_recordset($1::jsonb) AS desired(
      "id" text, "tenantId" text, "attachmentId" text,
      "candidateAttachmentId" text, "resourceKind" text, "resourceId" text,
      "resourceStoreId" text, "state" text, "source" text, "sourceKey" text,
      "createdByUserId" text, "reasonCode" text, "resolvedAt" text,
      "createdAt" text, "updatedAt" text
    )
    ORDER BY desired."attachmentId" COLLATE "C"
  `, [JSON.stringify(rows)]);
  if (result.rowCount !== plan.actions.length) {
    fail("ATTACHMENT_RECONCILIATION_BINDING_INSERT_COUNT_MISMATCH");
  }
}

async function transitionAttachmentsToBound(client, plan, transitionAt) {
  const result = await client.query(`
    UPDATE public."StaffAttachment" AS attachment
    SET "state" = 'BOUND'::public."StaffAttachmentState",
        "pendingExpiresAt" = NULL,
        "stateReasonCode" = NULL,
        "stateChangedAt" = desired."transitionAt"::timestamp(3)
    FROM jsonb_to_recordset($1::jsonb) AS desired(
      "attachmentId" text, "tenantId" text, "stateChangedAt" text,
      "stateReasonCode" text, "transitionAt" text
    )
    WHERE attachment."id" = desired."attachmentId"
      AND attachment."tenantId" = desired."tenantId"
      AND attachment."state" = 'UNRESOLVED'::public."StaffAttachmentState"
      AND attachment."pendingExpiresAt" IS NULL
      AND attachment."stateChangedAt" = desired."stateChangedAt"::timestamp(3)
      AND attachment."stateReasonCode" IS NOT DISTINCT FROM desired."stateReasonCode"
  `, [JSON.stringify(plan.actions.map((action) => ({
    attachmentId: action.attachmentId,
    stateChangedAt: action.before.stateChangedAt,
    stateReasonCode: action.before.stateReasonCode,
    tenantId: action.tenantId,
    transitionAt,
  })))]);
  if (result.rowCount !== plan.actions.length) {
    fail("ATTACHMENT_RECONCILIATION_ATTACHMENT_UPDATE_COUNT_MISMATCH");
  }
}

async function insertAudits(client, events) {
  if (events.length === 0) return;
  const result = await client.query(`
    INSERT INTO public."PlatformAdminAuditEvent" (
      "id", "tenantId", "requestId", "action", "targetType", "targetId",
      "reason", "before", "after", "metadata", "createdAt"
    )
    SELECT event."id", event."tenantId", event."requestId", event."action",
           event."targetType", event."targetId", event."reason",
           event."before", event."after", event."metadata",
           event."createdAt"::timestamp(3)
    FROM jsonb_to_recordset($1::jsonb) AS event(
      "id" text, "tenantId" text, "requestId" text, "action" text,
      "targetType" text, "targetId" text, "reason" text,
      "before" jsonb, "after" jsonb, "metadata" jsonb, "createdAt" text
    )
    ORDER BY event."tenantId" COLLATE "C"
  `, [JSON.stringify(events)]);
  if (result.rowCount !== events.length) {
    fail("ATTACHMENT_RECONCILIATION_AUDIT_INSERT_COUNT_MISMATCH");
  }
}

async function rollbackBindings(client, plan) {
  const result = await client.query(`
    DELETE FROM public."StaffAttachmentBinding" AS binding
    USING jsonb_to_recordset($1::jsonb) AS desired(
      "id" text, "tenantId" text, "attachmentId" text, "sourceKey" text
    )
    WHERE binding."id" = desired."id"
      AND binding."tenantId" = desired."tenantId"
      AND binding."attachmentId" = desired."attachmentId"
      AND binding."sourceKey" = desired."sourceKey"
  `, [JSON.stringify(plan.actions.map((action) => action.binding))]);
  if (result.rowCount !== plan.actions.length) {
    fail("ATTACHMENT_RECONCILIATION_BINDING_DELETE_COUNT_MISMATCH");
  }
}

async function restoreAttachments(client, plan, applyTransitionAt) {
  const result = await client.query(`
    UPDATE public."StaffAttachment" AS attachment
    SET "state" = desired."state"::public."StaffAttachmentState",
        "pendingExpiresAt" = desired."pendingExpiresAt"::timestamp(3),
        "stateReasonCode" = desired."stateReasonCode",
        "stateChangedAt" = desired."stateChangedAt"::timestamp(3)
    FROM jsonb_to_recordset($1::jsonb) AS desired(
      "attachmentId" text, "tenantId" text, "state" text,
      "pendingExpiresAt" text, "stateReasonCode" text, "stateChangedAt" text
    )
    WHERE attachment."id" = desired."attachmentId"
      AND attachment."tenantId" = desired."tenantId"
      AND attachment."state" = 'BOUND'::public."StaffAttachmentState"
      AND attachment."pendingExpiresAt" IS NULL
      AND attachment."stateReasonCode" IS NULL
      AND attachment."stateChangedAt" = $2::timestamp(3)
  `, [JSON.stringify(plan.actions.map((action) => ({
    attachmentId: action.attachmentId,
    ...action.before,
    tenantId: action.tenantId,
  }))), applyTransitionAt]);
  if (result.rowCount !== plan.actions.length) {
    fail("ATTACHMENT_RECONCILIATION_ATTACHMENT_RESTORE_COUNT_MISMATCH");
  }
}

function validatePlanDatabaseBinding(plan, observed, config) {
  const expected = plan.database;
  if (
    canonicalJson(expected) !== canonicalJson(observed) ||
    expected.databaseTargetFingerprint !==
      config.publicConfig.databaseTargetFingerprint ||
    expected.releaseSha !== config.publicConfig.releaseSha ||
    canonicalJson(expected.allowedHttpsOrigins) !==
      canonicalJson(config.publicConfig.allowedHttpsOrigins)
  ) {
    fail("ATTACHMENT_RECONCILIATION_PLAN_DATABASE_BINDING_MISMATCH");
  }
}

export async function executeStaffAttachmentReconciliation({
  approval,
  config,
  direction,
  plan,
}) {
  validateStaffAttachmentReconciliationApproval(approval, plan, direction);
  const client = new pg.Client({ connectionString: connectionString(config, false) });
  await client.connect();
  try {
    const database = await attestDatabase(client, config);
    validatePlanDatabaseBinding(plan, database, config);
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    await client.query(`SET LOCAL lock_timeout = '${config.lockTimeoutMs}ms'`);
    await client.query(`SET LOCAL statement_timeout = '${config.statementTimeoutMs}ms'`);
    await client.query(`SET LOCAL idle_in_transaction_session_timeout = '120s'`);
    const lock = await client.query(
      "SELECT pg_catalog.pg_try_advisory_xact_lock($1::integer, $2::integer) AS acquired",
      [ADVISORY_LOCK_NAMESPACE, ADVISORY_LOCK_RESOURCE],
    );
    if (lock.rows[0]?.acquired !== true) {
      fail("ATTACHMENT_RECONCILIATION_ADVISORY_LOCK_BUSY");
    }
    validatePlanDatabaseBinding(plan, await attestDatabase(client, config), config);
    const initialState = await readCurrentState(client, plan, true);
    const classification = classifyStaffAttachmentReconciliationState({
      direction,
      plan,
      state: initialState,
    });
    if (classification.disposition === "RECONCILED") {
      await client.query("COMMIT");
      return Object.freeze({
        actionCount: plan.summary.actionCount,
        contractVersion: RECEIPT_CONTRACT,
        decision: "PASS",
        direction,
        disposition: "RECONCILED",
        planDigest: plan.planDigest,
        transitionAt: classification.transitionAt,
        zeroDiff: true,
      });
    }
    const transitionResult = await client.query(
      "SELECT transaction_timestamp() AS \"transitionAt\"",
    );
    const transitionAt = iso(transitionResult.rows[0].transitionAt);
    if (direction === "APPLY") {
      await validateCurrentParents(
        client,
        plan,
        config.publicConfig.allowedHttpsOrigins,
      );
      await insertBindings(client, plan, transitionAt);
      await transitionAttachmentsToBound(client, plan, transitionAt);
      await client.query("SET CONSTRAINTS ALL IMMEDIATE");
      await insertAudits(client, auditEvents(plan, direction, transitionAt));
    } else {
      const applyState = normalizeCurrentState(initialState);
      const applyAudit = exactAuditSet(
        plan,
        "APPLY",
        applyState.audits.filter((row) => row.action === APPLY_AUDIT_ACTION),
      );
      await rollbackBindings(client, plan);
      await restoreAttachments(client, plan, applyAudit.transitionAt);
      await client.query("SET CONSTRAINTS ALL IMMEDIATE");
      await insertAudits(client, auditEvents(plan, direction, transitionAt));
    }
    const finalState = await readCurrentState(client, plan, false);
    const finalClassification = classifyStaffAttachmentReconciliationState({
      direction,
      plan,
      state: finalState,
    });
    if (finalClassification.disposition !== "RECONCILED") {
      fail("ATTACHMENT_RECONCILIATION_POST_WRITE_ZERO_DIFF_FAILED");
    }
    await client.query("COMMIT");
    return Object.freeze({
      actionCount: plan.summary.actionCount,
      contractVersion: RECEIPT_CONTRACT,
      decision: "PASS",
      direction,
      disposition: "APPLIED",
      planDigest: plan.planDigest,
      transitionAt,
      zeroDiff: true,
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

export async function checkStaffAttachmentReconciliation({
  config,
  direction,
  plan,
}) {
  validateStaffAttachmentReconciliationPlan(plan);
  const client = new pg.Client({ connectionString: connectionString(config, true) });
  await client.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    validatePlanDatabaseBinding(plan, await attestDatabase(client, config), config);
    const state = await readCurrentState(client, plan, false);
    const classification = classifyStaffAttachmentReconciliationState({
      direction,
      plan,
      state,
    });
    if (classification.disposition !== "RECONCILED") {
      fail("ATTACHMENT_RECONCILIATION_CHECK_NOT_RECONCILED");
    }
    await client.query("COMMIT");
    return Object.freeze({
      actionCount: plan.summary.actionCount,
      contractVersion: RECEIPT_CONTRACT,
      decision: "PASS",
      direction,
      disposition: "CHECKED",
      planDigest: plan.planDigest,
      transitionAt: classification.transitionAt,
      zeroDiff: true,
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

function residualDigest(domain, value) {
  return sha256(
    `${RESIDUAL_RECONCILIATION_CONTRACT}\0${domain}\0${canonicalJson(value)}`,
  );
}

function residualPlanCore(plan) {
  const { planDigest: _planDigest, ...core } = plan;
  return core;
}

function residualReviewRecord(attachment, parents, reasons) {
  return Object.freeze({
    attachmentId: attachment.id,
    primaryParents: sortParents(parents),
    reasonCodes: [...reasons].sort(),
    state: String(attachment.state),
    tenantId: attachment.tenantId,
  });
}

function residualBindingRecord(attachment, parent) {
  const source = "CHAT_RELATION_BACKFILL";
  const sourceKey = sourceKeyFor({
    attachmentId: attachment.id,
    resourceId: parent.resourceId,
    resourceKind: parent.resourceKind,
    source,
    tenantId: attachment.tenantId,
  });
  return Object.freeze({
    attachmentId: attachment.id,
    candidateAttachmentId: attachment.id,
    createdByUserId: null,
    id: deterministicUuid("binding-id", sourceKey),
    reasonCode: null,
    resourceId: parent.resourceId,
    resourceKind: parent.resourceKind,
    resourceStoreId: parent.resourceStoreId,
    source,
    sourceKey,
    state: "BOUND",
    tenantId: attachment.tenantId,
  });
}

function residualTenantActionCounts(actions) {
  const byTenant = new Map();
  for (const action of actions) {
    const current = byTenant.get(action.tenantId) ?? {
      actionCount: 0,
      bindAttachmentCount: 0,
      bindingCount: 0,
      quarantineAttachmentCount: 0,
      tenantId: action.tenantId,
    };
    current.actionCount += 1;
    current.bindingCount += action.bindings.length;
    if (action.disposition === "BIND_ALL_PRIMARY_PARENTS") {
      current.bindAttachmentCount += 1;
    } else {
      current.quarantineAttachmentCount += 1;
    }
    byTenant.set(action.tenantId, current);
  }
  return [...byTenant.values()].sort((left, right) =>
    left.tenantId.localeCompare(right.tenantId, "en"),
  );
}

export function buildStaffAttachmentResidualReconciliationPlan(snapshot) {
  const normalized = normalizeSnapshot(snapshot);
  const generatedAt = exactIso(
    snapshot.generatedAt,
    "ATTACHMENT_RESIDUAL_RECONCILIATION_GENERATED_AT_INVALID",
  );
  const sourcePlan = buildStaffAttachmentReconciliationPlan(snapshot);
  const bindingsByCandidate = new Map();
  for (const binding of normalized.bindings) {
    const candidateId = exactString(
      binding.candidateAttachmentId,
      OPAQUE_ID,
      "ATTACHMENT_RESIDUAL_RECONCILIATION_BINDING_CANDIDATE_INVALID",
    );
    const entries = bindingsByCandidate.get(candidateId) ?? [];
    entries.push(binding);
    bindingsByCandidate.set(candidateId, entries);
  }
  const occurrencesByAttachment = new Map();
  for (const occurrence of normalized.occurrences) {
    const attachmentId = exactString(
      occurrence.attachmentId,
      UUID,
      "ATTACHMENT_RESIDUAL_RECONCILIATION_OCCURRENCE_ATTACHMENT_INVALID",
    );
    const entries = occurrencesByAttachment.get(attachmentId) ?? [];
    entries.push(occurrence);
    occurrencesByAttachment.set(attachmentId, entries);
  }
  const signaledAttachmentIds = new Set(
    sourcePlan.signalReviews
      .map((signal) => signal.attachmentId)
      .filter((attachmentId) => attachmentId !== null),
  );
  const actions = [];
  const reviews = [];
  let residualAttachmentCount = 0;
  let alreadyBoundAttachmentCount = 0;
  let ignoredLifecycleAttachmentCount = 0;

  for (const attachment of [...normalized.attachments].sort((left, right) =>
    String(left.id).localeCompare(String(right.id), "en"),
  )) {
    exactString(
      attachment.id,
      UUID,
      "ATTACHMENT_RESIDUAL_RECONCILIATION_ATTACHMENT_ID_INVALID",
    );
    exactString(
      attachment.tenantId,
      OPAQUE_ID,
      "ATTACHMENT_RESIDUAL_RECONCILIATION_TENANT_ID_INVALID",
    );
    if (attachment.state === "BOUND") {
      alreadyBoundAttachmentCount += 1;
      continue;
    }
    if (!["PENDING", "UNRESOLVED"].includes(attachment.state)) {
      ignoredLifecycleAttachmentCount += 1;
      continue;
    }
    residualAttachmentCount += 1;

    const reasons = new Set();
    const validOccurrences = [];
    const parentsByKey = new Map();
    for (const occurrence of occurrencesByAttachment.get(attachment.id) ?? []) {
      const shapeValid =
        occurrence.parentValid === true &&
        occurrence.sourceTenantId === attachment.tenantId &&
        occurrence.parentTenantId === attachment.tenantId &&
        (occurrence.resourceStoreId === null ||
          occurrence.resourceStoreTenantId === attachment.tenantId);
      if (!shapeValid) {
        reasons.add("INVALID_PRIMARY_OCCURRENCE");
        continue;
      }
      validOccurrences.push(occurrence);
      const key = parentKey(occurrence);
      const parent = normalizedParent(occurrence);
      const previous = parentsByKey.get(key);
      if (previous && previous.resourceStoreId !== parent.resourceStoreId) {
        reasons.add("PRIMARY_PARENT_STORE_CONFLICT");
      }
      parentsByKey.set(key, parent);
    }
    const parents = sortParents(parentsByKey.values());
    if ((bindingsByCandidate.get(attachment.id) ?? []).length > 0) {
      reasons.add("EXISTING_BINDING_REVIEW_REQUIRED");
    }
    if (signaledAttachmentIds.has(attachment.id)) {
      reasons.add("PRIMARY_SIGNAL_REVIEW_REQUIRED");
    }

    const before = beforeImage(attachment);
    if (attachment.state === "UNRESOLVED") {
      if (
        attachment.pendingExpiresAt !== null ||
        typeof attachment.stateReasonCode !== "string" ||
        attachment.stateReasonCode.trim().length === 0
      ) {
        reasons.add("LIFECYCLE_REASON_REVIEW_REQUIRED");
      }
    } else {
      if (
        attachment.pendingExpiresAt === null ||
        attachment.stateReasonCode !== null
      ) {
        reasons.add("PENDING_LIFECYCLE_SHAPE_REVIEW_REQUIRED");
      } else if (iso(attachment.pendingExpiresAt) > generatedAt) {
        reasons.add("PENDING_NOT_EXPIRED");
      }
      if (parents.length > 0) {
        reasons.add("PENDING_PRIMARY_PARENT_REVIEW_REQUIRED");
      }
    }

    if (parents.length === 1) {
      reasons.add("UNEXPECTED_UNIQUE_PRIMARY_PARENT");
    }
    if (parents.length > 1) {
      const normalizedChatOnly = validOccurrences.every(
        (occurrence) =>
          occurrence.resourceKind === "CHAT_MESSAGE" &&
          occurrence.source === "NORMALIZED_CHAT_RELATION",
      );
      if (!normalizedChatOnly) {
        reasons.add("MULTIPLE_PRIMARY_SOURCE_REVIEW_REQUIRED");
      }
      if (parents.length > 32) {
        reasons.add("PRIMARY_PARENT_COUNT_LIMIT_EXCEEDED");
      }
    }

    if (reasons.size > 0) {
      reviews.push(residualReviewRecord(attachment, parents, reasons));
      continue;
    }

    if (parents.length > 1) {
      const bindings = parents.map((parent) =>
        residualBindingRecord(attachment, parent),
      );
      actions.push(
        Object.freeze({
          after: Object.freeze({
            pendingExpiresAt: null,
            state: "BOUND",
            stateReasonCode: null,
          }),
          attachmentId: attachment.id,
          before,
          bindings,
          decisionReasonCode: "MULTIPLE_NORMALIZED_PRIMARY_PARENTS",
          disposition: "BIND_ALL_PRIMARY_PARENTS",
          tenantId: attachment.tenantId,
        }),
      );
      continue;
    }

    if (parents.length === 0) {
      const pending = attachment.state === "PENDING";
      actions.push(
        Object.freeze({
          after: Object.freeze({
            pendingExpiresAt: null,
            state: "QUARANTINED",
            stateReasonCode: pending
              ? "PENDING_EXPIRED"
              : "LEGACY_NO_PRIMARY_PARENT",
          }),
          attachmentId: attachment.id,
          before,
          bindings: Object.freeze([]),
          decisionReasonCode: pending
            ? "EXPIRED_PENDING_WITHOUT_PRIMARY_PARENT"
            : "LEGACY_ATTACHMENT_WITHOUT_PRIMARY_PARENT",
          disposition: "QUARANTINE_NO_PRIMARY_PARENT",
          tenantId: attachment.tenantId,
        }),
      );
    }
  }

  const bindingCount = actions.reduce(
    (count, action) => count + action.bindings.length,
    0,
  );
  const bindAttachmentCount = actions.filter(
    (action) => action.disposition === "BIND_ALL_PRIMARY_PARENTS",
  ).length;
  const quarantineAttachmentCount = actions.length - bindAttachmentCount;
  const tenantActionCounts = residualTenantActionCounts(actions);
  const core = Object.freeze({
    actions,
    contractVersion: RESIDUAL_PLAN_CONTRACT,
    database: Object.freeze({ ...snapshot.database }),
    generatedAt,
    inventoryDigest: sourcePlan.inventoryDigest,
    reviews,
    safety: Object.freeze({
      blobDeletionSupported: false,
      databaseWrites: false,
      detachedOwnerApprovalRequired: true,
      physicalDeletionPerformed: false,
      policy: RESIDUAL_POLICY,
      productionApplyRequiresDetachedApproval: true,
      rollbackSupported: true,
      sourceReferencesRetained: true,
    }),
    signalReviews: sourcePlan.signalReviews,
    sourceGraphDigest: sourcePlan.sourceGraphDigest,
    sourcePlanDigest: sourcePlan.planDigest,
    summary: Object.freeze({
      actionCount: actions.length,
      alreadyBoundAttachmentCount,
      attachmentCount: normalized.attachments.length,
      bindAttachmentCount,
      bindingCount,
      ignoredLifecycleAttachmentCount,
      quarantineAttachmentCount,
      residualAttachmentCount,
      reviewAttachmentCount: reviews.length,
      signalReviewCount: sourcePlan.signalReviews.length,
      tenantActionCounts,
    }),
  });
  return Object.freeze({
    ...core,
    planDigest: residualDigest("plan", core),
  });
}

function validateResidualDatabase(database) {
  if (
    database?.expectedMigrationCount !== EXPECTED_MIGRATION_COUNT ||
    database?.expectedMigrationHead !== EXPECTED_MIGRATION_HEAD ||
    !TARGETS.has(database?.target) ||
    !RELEASE_SHA.test(database?.releaseSha ?? "") ||
    !SHA256.test(database?.databaseTargetFingerprint ?? "") ||
    !SHA256.test(database?.databaseIdentityDigest ?? "") ||
    !SHA256.test(database?.schemaContractDigest ?? "") ||
    !SYSTEM_IDENTIFIER.test(database?.systemIdentifier ?? "") ||
    !ROLE_NAME.test(database?.roleName ?? "") ||
    typeof database?.databaseName !== "string" ||
    !Array.isArray(database?.allowedHttpsOrigins)
  ) {
    fail("ATTACHMENT_RESIDUAL_RECONCILIATION_DATABASE_INVALID");
  }
}

function validateResidualBinding(action, binding) {
  const expectedSourceKey = sourceKeyFor({
    attachmentId: action.attachmentId,
    resourceId: binding.resourceId,
    resourceKind: binding.resourceKind,
    source: binding.source,
    tenantId: action.tenantId,
  });
  if (
    binding.attachmentId !== action.attachmentId ||
    binding.candidateAttachmentId !== action.attachmentId ||
    binding.tenantId !== action.tenantId ||
    binding.resourceKind !== "CHAT_MESSAGE" ||
    binding.source !== "CHAT_RELATION_BACKFILL" ||
    binding.state !== "BOUND" ||
    binding.createdByUserId !== null ||
    binding.reasonCode !== null ||
    !UUID.test(binding.id ?? "") ||
    !OPAQUE_ID.test(binding.resourceId ?? "") ||
    (binding.resourceStoreId !== null &&
      !OPAQUE_ID.test(binding.resourceStoreId ?? "")) ||
    binding.sourceKey !== expectedSourceKey ||
    binding.id !== deterministicUuid("binding-id", expectedSourceKey)
  ) {
    fail("ATTACHMENT_RESIDUAL_RECONCILIATION_BINDING_INVALID");
  }
}

export function validateStaffAttachmentResidualReconciliationPlan(plan) {
  if (
    plan === null ||
    typeof plan !== "object" ||
    plan.contractVersion !== RESIDUAL_PLAN_CONTRACT ||
    !Array.isArray(plan.actions) ||
    !Array.isArray(plan.reviews) ||
    !Array.isArray(plan.signalReviews) ||
    !SHA256.test(plan.planDigest ?? "") ||
    !equalDigest(plan.planDigest, residualDigest("plan", residualPlanCore(plan)))
  ) {
    fail("ATTACHMENT_RESIDUAL_RECONCILIATION_PLAN_INVALID");
  }
  const generatedAt = exactIso(
    plan.generatedAt,
    "ATTACHMENT_RESIDUAL_RECONCILIATION_PLAN_TIMESTAMP_INVALID",
  );
  validateResidualDatabase(plan.database);
  if (
    !SHA256.test(plan.inventoryDigest ?? "") ||
    !SHA256.test(plan.sourceGraphDigest ?? "") ||
    !SHA256.test(plan.sourcePlanDigest ?? "") ||
    plan.safety?.blobDeletionSupported !== false ||
    plan.safety?.databaseWrites !== false ||
    plan.safety?.detachedOwnerApprovalRequired !== true ||
    plan.safety?.physicalDeletionPerformed !== false ||
    plan.safety?.policy !== RESIDUAL_POLICY ||
    plan.safety?.productionApplyRequiresDetachedApproval !== true ||
    plan.safety?.rollbackSupported !== true ||
    plan.safety?.sourceReferencesRetained !== true
  ) {
    fail("ATTACHMENT_RESIDUAL_RECONCILIATION_PLAN_SAFETY_INVALID");
  }

  let previousAttachmentId = "";
  const attachmentIds = new Set();
  const bindingIds = new Set();
  const sourceKeys = new Set();
  for (const action of plan.actions) {
    exactString(
      action.attachmentId,
      UUID,
      "ATTACHMENT_RESIDUAL_RECONCILIATION_ACTION_INVALID",
    );
    exactString(
      action.tenantId,
      OPAQUE_ID,
      "ATTACHMENT_RESIDUAL_RECONCILIATION_ACTION_INVALID",
    );
    if (
      action.attachmentId <= previousAttachmentId ||
      attachmentIds.has(action.attachmentId) ||
      !Array.isArray(action.bindings) ||
      action.before === null ||
      typeof action.before !== "object" ||
      action.after === null ||
      typeof action.after !== "object"
    ) {
      fail("ATTACHMENT_RESIDUAL_RECONCILIATION_ACTION_INVALID");
    }
    attachmentIds.add(action.attachmentId);
    previousAttachmentId = action.attachmentId;
    exactIso(
      action.before.stateChangedAt,
      "ATTACHMENT_RESIDUAL_RECONCILIATION_ACTION_INVALID",
    );
    if (action.before.pendingExpiresAt !== null) {
      exactIso(
        action.before.pendingExpiresAt,
        "ATTACHMENT_RESIDUAL_RECONCILIATION_ACTION_INVALID",
      );
    }
    let previousBindingKey = "";
    for (const binding of action.bindings) {
      validateResidualBinding(action, binding);
      const bindingKey = `${binding.resourceKind}\0${binding.resourceId}`;
      if (
        bindingKey <= previousBindingKey ||
        bindingIds.has(binding.id) ||
        sourceKeys.has(binding.sourceKey)
      ) {
        fail("ATTACHMENT_RESIDUAL_RECONCILIATION_BINDING_INVALID");
      }
      previousBindingKey = bindingKey;
      bindingIds.add(binding.id);
      sourceKeys.add(binding.sourceKey);
    }

    if (action.disposition === "BIND_ALL_PRIMARY_PARENTS") {
      if (
        action.before.state !== "UNRESOLVED" ||
        action.before.pendingExpiresAt !== null ||
        typeof action.before.stateReasonCode !== "string" ||
        action.before.stateReasonCode.trim().length === 0 ||
        action.after.state !== "BOUND" ||
        action.after.pendingExpiresAt !== null ||
        action.after.stateReasonCode !== null ||
        action.decisionReasonCode !== "MULTIPLE_NORMALIZED_PRIMARY_PARENTS" ||
        action.bindings.length < 2 ||
        action.bindings.length > 32
      ) {
        fail("ATTACHMENT_RESIDUAL_RECONCILIATION_ACTION_INVALID");
      }
    } else if (action.disposition === "QUARANTINE_NO_PRIMARY_PARENT") {
      const expiredPending = action.before.state === "PENDING";
      const expectedReason = expiredPending
        ? "PENDING_EXPIRED"
        : "LEGACY_NO_PRIMARY_PARENT";
      const expectedDecision = expiredPending
        ? "EXPIRED_PENDING_WITHOUT_PRIMARY_PARENT"
        : "LEGACY_ATTACHMENT_WITHOUT_PRIMARY_PARENT";
      if (
        !["PENDING", "UNRESOLVED"].includes(action.before.state) ||
        action.after.state !== "QUARANTINED" ||
        action.after.pendingExpiresAt !== null ||
        action.after.stateReasonCode !== expectedReason ||
        action.decisionReasonCode !== expectedDecision ||
        action.bindings.length !== 0 ||
        (expiredPending &&
          (action.before.pendingExpiresAt === null ||
            action.before.pendingExpiresAt > generatedAt ||
            action.before.stateReasonCode !== null)) ||
        (!expiredPending &&
          (action.before.pendingExpiresAt !== null ||
            typeof action.before.stateReasonCode !== "string" ||
            action.before.stateReasonCode.trim().length === 0))
      ) {
        fail("ATTACHMENT_RESIDUAL_RECONCILIATION_ACTION_INVALID");
      }
    } else {
      fail("ATTACHMENT_RESIDUAL_RECONCILIATION_ACTION_INVALID");
    }
  }

  let previousReviewId = "";
  for (const review of plan.reviews) {
    exactString(
      review.attachmentId,
      UUID,
      "ATTACHMENT_RESIDUAL_RECONCILIATION_REVIEW_INVALID",
    );
    if (
      review.attachmentId <= previousReviewId ||
      attachmentIds.has(review.attachmentId) ||
      !["PENDING", "UNRESOLVED"].includes(review.state) ||
      !Array.isArray(review.primaryParents) ||
      !Array.isArray(review.reasonCodes) ||
      review.reasonCodes.length === 0 ||
      canonicalJson(review.primaryParents) !==
        canonicalJson(sortParents(review.primaryParents)) ||
      canonicalJson(review.reasonCodes) !==
        canonicalJson(sortedUnique(review.reasonCodes)) ||
      review.reasonCodes.some(
        (reasonCode) => !/^[A-Z][A-Z0-9_]{2,100}$/u.test(reasonCode),
      )
    ) {
      fail("ATTACHMENT_RESIDUAL_RECONCILIATION_REVIEW_INVALID");
    }
    exactString(
      review.tenantId,
      OPAQUE_ID,
      "ATTACHMENT_RESIDUAL_RECONCILIATION_REVIEW_INVALID",
    );
    previousReviewId = review.attachmentId;
  }

  const bindAttachmentCount = plan.actions.filter(
    (action) => action.disposition === "BIND_ALL_PRIMARY_PARENTS",
  ).length;
  const bindingCount = plan.actions.reduce(
    (count, action) => count + action.bindings.length,
    0,
  );
  const expectedSummarySubset = {
    actionCount: plan.actions.length,
    bindAttachmentCount,
    bindingCount,
    quarantineAttachmentCount: plan.actions.length - bindAttachmentCount,
    reviewAttachmentCount: plan.reviews.length,
    signalReviewCount: plan.signalReviews.length,
    tenantActionCounts: residualTenantActionCounts(plan.actions),
  };
  for (const [key, value] of Object.entries(expectedSummarySubset)) {
    if (canonicalJson(plan.summary?.[key]) !== canonicalJson(value)) {
      fail("ATTACHMENT_RESIDUAL_RECONCILIATION_SUMMARY_INVALID");
    }
  }
  const summaryCounts = [
    plan.summary?.attachmentCount,
    plan.summary?.residualAttachmentCount,
    plan.summary?.alreadyBoundAttachmentCount,
    plan.summary?.ignoredLifecycleAttachmentCount,
  ];
  for (const count of summaryCounts) {
    exactInteger(
      count,
      0,
      MAX_ROWS_PER_RELATION,
      "ATTACHMENT_RESIDUAL_RECONCILIATION_SUMMARY_INVALID",
    );
  }
  if (
    plan.summary.residualAttachmentCount !==
      plan.actions.length + plan.reviews.length ||
    plan.summary.attachmentCount !==
      plan.summary.alreadyBoundAttachmentCount +
        plan.summary.residualAttachmentCount +
        plan.summary.ignoredLifecycleAttachmentCount
  ) {
    fail("ATTACHMENT_RESIDUAL_RECONCILIATION_SUMMARY_INVALID");
  }
  return plan;
}

export function createStaffAttachmentResidualReconciliationApproval({
  actionCount,
  bindingCount,
  confirmationPhrase,
  confirmedPlanDigest,
  direction,
  now = new Date(),
  plan,
  quarantineCount,
  reviewAttachmentCount,
}) {
  validateStaffAttachmentResidualReconciliationPlan(plan);
  if (
    !["APPLY", "ROLLBACK"].includes(direction) ||
    confirmationPhrase !== RESIDUAL_APPROVAL_PHRASES[direction] ||
    !equalDigest(confirmedPlanDigest, plan.planDigest) ||
    Number(actionCount) !== plan.summary.actionCount ||
    Number(bindingCount) !== plan.summary.bindingCount ||
    Number(quarantineCount) !== plan.summary.quarantineAttachmentCount ||
    Number(reviewAttachmentCount) !== plan.summary.reviewAttachmentCount
  ) {
    fail("ATTACHMENT_RESIDUAL_RECONCILIATION_APPROVAL_CONFIRMATION_INVALID");
  }
  const core = Object.freeze({
    actionCount: plan.summary.actionCount,
    approvedAt: iso(now),
    bindingCount: plan.summary.bindingCount,
    contractVersion: RESIDUAL_APPROVAL_CONTRACT,
    direction,
    planDigest: plan.planDigest,
    quarantineAttachmentCount: plan.summary.quarantineAttachmentCount,
    reviewAttachmentCount: plan.summary.reviewAttachmentCount,
  });
  return Object.freeze({
    ...core,
    approvalDigest: residualDigest("approval", core),
  });
}

export function validateStaffAttachmentResidualReconciliationApproval(
  approval,
  plan,
  direction,
) {
  validateStaffAttachmentResidualReconciliationPlan(plan);
  if (
    approval === null ||
    typeof approval !== "object" ||
    approval.contractVersion !== RESIDUAL_APPROVAL_CONTRACT ||
    approval.direction !== direction ||
    approval.planDigest !== plan.planDigest ||
    approval.actionCount !== plan.summary.actionCount ||
    approval.bindingCount !== plan.summary.bindingCount ||
    approval.quarantineAttachmentCount !==
      plan.summary.quarantineAttachmentCount ||
    approval.reviewAttachmentCount !== plan.summary.reviewAttachmentCount ||
    !SHA256.test(approval.approvalDigest ?? "")
  ) {
    fail("ATTACHMENT_RESIDUAL_RECONCILIATION_APPROVAL_INVALID");
  }
  exactIso(
    approval.approvedAt,
    "ATTACHMENT_RESIDUAL_RECONCILIATION_APPROVAL_INVALID",
  );
  const { approvalDigest, ...core } = approval;
  if (!equalDigest(approvalDigest, residualDigest("approval", core))) {
    fail("ATTACHMENT_RESIDUAL_RECONCILIATION_APPROVAL_INVALID");
  }
  return approval;
}

export async function createStaffAttachmentResidualReconciliationPlanFromDatabase(
  config,
) {
  const client = new pg.Client({
    connectionString: connectionString(config, true),
  });
  await client.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const snapshotResult = await client.query(`
      SELECT transaction_timestamp() AS "snapshotAt",
             current_setting('transaction_read_only') AS "readOnly",
             current_setting('transaction_isolation') AS "isolation"
    `);
    if (
      snapshotResult.rows[0]?.readOnly !== "on" ||
      snapshotResult.rows[0]?.isolation !== "repeatable read"
    ) {
      fail("ATTACHMENT_RESIDUAL_RECONCILIATION_READ_ONLY_SNAPSHOT_INVALID");
    }
    const database = await attestDatabase(client, config);
    const snapshot = await collectPrimarySnapshot(
      client,
      config.publicConfig.allowedHttpsOrigins,
    );
    await client.query("COMMIT");
    const plan = buildStaffAttachmentResidualReconciliationPlan({
      ...snapshot,
      database,
      generatedAt: iso(snapshotResult.rows[0].snapshotAt),
    });
    validateStaffAttachmentResidualReconciliationPlan(plan);
    return plan;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

function residualActionAfterImage(action, transitionAt) {
  return {
    attachmentId: action.attachmentId,
    ...action.after,
    stateChangedAt: transitionAt,
    tenantId: action.tenantId,
  };
}

function residualBindingAfterImage(binding, transitionAt) {
  return {
    ...binding,
    createdAt: transitionAt,
    resolvedAt: transitionAt,
    updatedAt: transitionAt,
  };
}

function residualBindings(plan, transitionAt) {
  return plan.actions.flatMap((action) =>
    action.bindings.map((binding) =>
      residualBindingAfterImage(binding, transitionAt),
    ),
  );
}

function residualStateCounts(actions, selector) {
  return Object.fromEntries(
    Object.entries(
      actions.reduce((counts, action) => {
        const state = selector(action);
        counts[state] = (counts[state] ?? 0) + 1;
        return counts;
      }, {}),
    ).sort(([left], [right]) => left.localeCompare(right, "en")),
  );
}

function residualAuditEvents(plan, direction, transitionAt) {
  const auditAction =
    direction === "APPLY"
      ? RESIDUAL_APPLY_AUDIT_ACTION
      : RESIDUAL_ROLLBACK_AUDIT_ACTION;
  return plan.summary.tenantActionCounts.map((tenantSummary) => {
    const tenantActions = plan.actions.filter(
      (action) => action.tenantId === tenantSummary.tenantId,
    );
    const beforeStateCounts = residualStateCounts(
      tenantActions,
      (action) => action.before.state,
    );
    const afterStateCounts = residualStateCounts(
      tenantActions,
      (action) => action.after.state,
    );
    return {
      action: auditAction,
      after:
        direction === "APPLY"
          ? {
              attachmentCount: tenantSummary.actionCount,
              attachmentStateCounts: afterStateCounts,
              bindingCount: tenantSummary.bindingCount,
            }
          : {
              attachmentCount: tenantSummary.actionCount,
              attachmentStateCounts: beforeStateCounts,
              bindingCount: 0,
            },
      before:
        direction === "APPLY"
          ? {
              attachmentCount: tenantSummary.actionCount,
              attachmentStateCounts: beforeStateCounts,
              bindingCount: 0,
            }
          : {
              attachmentCount: tenantSummary.actionCount,
              attachmentStateCounts: afterStateCounts,
              bindingCount: tenantSummary.bindingCount,
            },
      createdAt: transitionAt,
      id: deterministicUuid(
        "residual-audit-id",
        direction,
        plan.planDigest,
        tenantSummary.tenantId,
      ),
      metadata: {
        ...tenantSummary,
        contractVersion: RESIDUAL_RECONCILIATION_CONTRACT,
        databaseTargetFingerprint: plan.database.databaseTargetFingerprint,
        direction,
        planDigest: plan.planDigest,
        policy: RESIDUAL_POLICY,
        releaseSha: plan.database.releaseSha,
        reviewAttachmentCount: plan.summary.reviewAttachmentCount,
        transitionAt,
      },
      reason:
        direction === "APPLY"
          ? "APPROVED_RESIDUAL_ATTACHMENT_BIND_AND_QUARANTINE"
          : "APPROVED_EXACT_RESIDUAL_ATTACHMENT_ROLLBACK",
      requestId: plan.planDigest,
      targetId: plan.planDigest,
      targetType: RESIDUAL_TARGET_TYPE,
      tenantId: tenantSummary.tenantId,
    };
  });
}

export function materializeStaffAttachmentResidualReconciliationState({
  applyTransitionAt,
  direction,
  plan,
  rollbackTransitionAt = null,
}) {
  validateStaffAttachmentResidualReconciliationPlan(plan);
  exactIso(
    applyTransitionAt,
    "ATTACHMENT_RESIDUAL_RECONCILIATION_MATERIALIZED_TIMESTAMP_INVALID",
  );
  if (direction === "APPLY") {
    return Object.freeze({
      attachments: plan.actions.map((action) =>
        residualActionAfterImage(action, applyTransitionAt),
      ),
      audits: residualAuditEvents(plan, "APPLY", applyTransitionAt),
      bindings: residualBindings(plan, applyTransitionAt),
    });
  }
  if (direction === "ROLLBACK") {
    exactIso(
      rollbackTransitionAt,
      "ATTACHMENT_RESIDUAL_RECONCILIATION_MATERIALIZED_TIMESTAMP_INVALID",
    );
    return Object.freeze({
      attachments: plan.actions.map((action) => ({
        attachmentId: action.attachmentId,
        ...action.before,
        tenantId: action.tenantId,
      })),
      audits: [
        ...residualAuditEvents(plan, "APPLY", applyTransitionAt),
        ...residualAuditEvents(plan, "ROLLBACK", rollbackTransitionAt),
      ],
      bindings: [],
    });
  }
  fail("ATTACHMENT_RESIDUAL_RECONCILIATION_DIRECTION_INVALID");
}

function exactResidualAuditSet(plan, direction, rows) {
  if (rows.length === 0) return { exists: false, transitionAt: null };
  const transitionValues = sortedUnique(
    rows.map((row) => row.metadata?.transitionAt),
  );
  if (transitionValues.length !== 1) {
    fail("ATTACHMENT_RESIDUAL_RECONCILIATION_AUDIT_DRIFT");
  }
  const transitionAt = exactIso(
    transitionValues[0],
    "ATTACHMENT_RESIDUAL_RECONCILIATION_AUDIT_DRIFT",
  );
  const expected = residualAuditEvents(plan, direction, transitionAt);
  const actual = [...rows].sort((left, right) =>
    left.tenantId.localeCompare(right.tenantId, "en"),
  );
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    fail("ATTACHMENT_RESIDUAL_RECONCILIATION_AUDIT_DRIFT");
  }
  return { exists: true, transitionAt };
}

export function classifyStaffAttachmentResidualReconciliationState({
  direction,
  plan,
  state,
}) {
  validateStaffAttachmentResidualReconciliationPlan(plan);
  if (!["APPLY", "ROLLBACK"].includes(direction)) {
    fail("ATTACHMENT_RESIDUAL_RECONCILIATION_DIRECTION_INVALID");
  }
  const normalized = normalizeCurrentState(state);
  const applyAudit = exactResidualAuditSet(
    plan,
    "APPLY",
    normalized.audits.filter(
      (row) => row.action === RESIDUAL_APPLY_AUDIT_ACTION,
    ),
  );
  const rollbackAudit = exactResidualAuditSet(
    plan,
    "ROLLBACK",
    normalized.audits.filter(
      (row) => row.action === RESIDUAL_ROLLBACK_AUDIT_ACTION,
    ),
  );
  const beforeRows = plan.actions.map((action) => ({
    attachmentId: action.attachmentId,
    ...action.before,
    tenantId: action.tenantId,
  }));
  const afterRows = applyAudit.exists
    ? plan.actions.map((action) =>
        residualActionAfterImage(action, applyAudit.transitionAt),
      )
    : [];
  const expectedBindings = applyAudit.exists
    ? residualBindings(plan, applyAudit.transitionAt)
    : [];

  if (direction === "APPLY") {
    if (rollbackAudit.exists) {
      fail("ATTACHMENT_RESIDUAL_RECONCILIATION_PLAN_ALREADY_ROLLED_BACK");
    }
    if (applyAudit.exists) {
      compareStateRows(
        normalized.attachments,
        afterRows,
        "ATTACHMENT_RESIDUAL_RECONCILIATION_APPLIED_STATE_DRIFT",
      );
      compareBindingRows(
        normalized.bindings,
        expectedBindings,
        "ATTACHMENT_RESIDUAL_RECONCILIATION_APPLIED_BINDING_DRIFT",
      );
      return Object.freeze({
        disposition: "RECONCILED",
        transitionAt: applyAudit.transitionAt,
      });
    }
    compareStateRows(
      normalized.attachments,
      beforeRows,
      "ATTACHMENT_RESIDUAL_RECONCILIATION_BEFORE_STATE_DRIFT",
    );
    compareBindingRows(
      normalized.bindings,
      [],
      "ATTACHMENT_RESIDUAL_RECONCILIATION_PREEXISTING_BINDING_DRIFT",
    );
    return Object.freeze({ disposition: "MUTATE", transitionAt: null });
  }

  if (!applyAudit.exists) {
    fail("ATTACHMENT_RESIDUAL_RECONCILIATION_APPLY_AUDIT_REQUIRED");
  }
  if (rollbackAudit.exists) {
    compareStateRows(
      normalized.attachments,
      beforeRows,
      "ATTACHMENT_RESIDUAL_RECONCILIATION_ROLLBACK_STATE_DRIFT",
    );
    compareBindingRows(
      normalized.bindings,
      [],
      "ATTACHMENT_RESIDUAL_RECONCILIATION_ROLLBACK_BINDING_DRIFT",
    );
    return Object.freeze({
      disposition: "RECONCILED",
      transitionAt: rollbackAudit.transitionAt,
    });
  }
  compareStateRows(
    normalized.attachments,
    afterRows,
    "ATTACHMENT_RESIDUAL_RECONCILIATION_APPLIED_STATE_DRIFT",
  );
  compareBindingRows(
    normalized.bindings,
    expectedBindings,
    "ATTACHMENT_RESIDUAL_RECONCILIATION_APPLIED_BINDING_DRIFT",
  );
  return Object.freeze({ disposition: "MUTATE", transitionAt: null });
}

async function readResidualCurrentState(client, plan, lockRows) {
  if (plan.actions.length === 0) {
    return { attachments: [], audits: [], bindings: [] };
  }
  const ids = plan.actions.map((action) => action.attachmentId);
  const attachmentResult = await client.query(
    `SELECT attachment."id", attachment."tenantId", attachment."state"::text AS "state",
            CASE WHEN attachment."pendingExpiresAt" IS NULL THEN NULL ELSE
              to_char(attachment."pendingExpiresAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
            END AS "pendingExpiresAt",
            attachment."stateReasonCode",
            to_char(attachment."stateChangedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "stateChangedAt"
     FROM public."StaffAttachment" AS attachment
     WHERE attachment."id" = ANY($1::text[])
     ORDER BY attachment."id" COLLATE "C"
     ${lockRows ? "FOR UPDATE" : ""}`,
    [ids],
  );
  const bindingResult = await client.query(
    `SELECT binding."id", binding."tenantId", binding."attachmentId",
            binding."candidateAttachmentId", binding."resourceKind"::text AS "resourceKind",
            binding."resourceId", binding."resourceStoreId",
            binding."state"::text AS "state", binding."source"::text AS "source",
            binding."sourceKey", binding."createdByUserId", binding."reasonCode",
            CASE WHEN binding."resolvedAt" IS NULL THEN NULL ELSE
              to_char(binding."resolvedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
            END AS "resolvedAt",
            to_char(binding."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
            to_char(binding."updatedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "updatedAt"
     FROM public."StaffAttachmentBinding" AS binding
     WHERE binding."attachmentId" = ANY($1::text[])
        OR binding."candidateAttachmentId" = ANY($1::text[])
     ORDER BY binding."id" COLLATE "C"`,
    [ids],
  );
  const auditResult = await client.query(
    `SELECT event."id", event."tenantId", event."requestId", event."action",
            event."targetType", event."targetId", event."reason",
            event."before", event."after", event."metadata",
            to_char(event."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"
     FROM public."PlatformAdminAuditEvent" AS event
     WHERE event."requestId" = $1
       AND event."action" = ANY($2::text[])
     ORDER BY event."tenantId" COLLATE "C", event."action" COLLATE "C"`,
    [
      plan.planDigest,
      [RESIDUAL_APPLY_AUDIT_ACTION, RESIDUAL_ROLLBACK_AUDIT_ACTION],
    ],
  );
  return {
    attachments: attachmentResult.rows,
    audits: auditResult.rows,
    bindings: bindingResult.rows,
  };
}

async function validateCurrentResidualParents(client, plan, allowedOrigins) {
  if (plan.actions.length === 0) return;
  const ids = plan.actions.map((action) => action.attachmentId);
  const actionById = new Map(
    plan.actions.map((action) => [action.attachmentId, action]),
  );
  const expectedParents = new Map(
    plan.actions.map((action) => [
      action.attachmentId,
      new Set(
        action.bindings.map(
          (binding) => `${binding.resourceKind}\0${binding.resourceId}`,
        ),
      ),
    ]),
  );
  const observedParents = new Map(
    plan.actions.map((action) => [action.attachmentId, new Set()]),
  );
  const chatResult = await client.query(
    `SELECT relation."id", relation."tenantId" AS "sourceTenantId",
            relation."attachmentId", relation."messageId" AS "resourceId",
            message."tenantId" AS "parentTenantId", message."storeId" AS "resourceStoreId",
            store."tenantId" AS "resourceStoreTenantId",
            channel."tenantId" AS "channelTenantId", channel."scope" AS "channelScope",
            channel."storeId" AS "channelStoreId"
     FROM public."StaffChatMessageAttachment" AS relation
     JOIN public."StaffChatMessage" AS message ON message."id" = relation."messageId"
     JOIN public."StaffChatChannel" AS channel ON channel."id" = message."channelId"
     LEFT JOIN public."Store" AS store ON store."id" = message."storeId"
     WHERE relation."attachmentId" = ANY($1::text[])
     ORDER BY relation."attachmentId" COLLATE "C", relation."id" COLLATE "C"`,
    [ids],
  );
  for (const row of chatResult.rows) {
    const action = actionById.get(row.attachmentId);
    const storeConflict =
      row.channelScope === "STORE" &&
      (!row.resourceStoreId ||
        !row.channelStoreId ||
        row.resourceStoreId !== row.channelStoreId);
    if (
      !action ||
      storeConflict ||
      row.sourceTenantId !== action.tenantId ||
      row.parentTenantId !== action.tenantId ||
      row.channelTenantId !== action.tenantId ||
      (row.resourceStoreId !== null &&
        row.resourceStoreTenantId !== action.tenantId)
    ) {
      fail("ATTACHMENT_RESIDUAL_RECONCILIATION_PRIMARY_GRAPH_DRIFT");
    }
    observedParents
      .get(row.attachmentId)
      .add(`CHAT_MESSAGE\0${row.resourceId}`);
  }
  const taskRows = await pagedQuery(client, `
    SELECT comment."id", comment."tenantId" AS "sourceTenantId",
           comment."evidenceUrl", task."id" AS "resourceId",
           task."tenantId" AS "parentTenantId", task."storeId" AS "resourceStoreId",
           store."tenantId" AS "resourceStoreTenantId"
    FROM public."StaffTaskComment" AS comment
    JOIN public."StaffTask" AS task ON task."id" = comment."taskId"
    LEFT JOIN public."Store" AS store ON store."id" = task."storeId"
    WHERE comment."evidenceUrl" IS NOT NULL
      AND ($1::text IS NULL OR comment."id" > $1)
    ORDER BY comment."id" COLLATE "C"
    LIMIT $2
  `);
  const allowed = new Set(allowedOrigins);
  for (const row of taskRows) {
    const parsed = parseExactAttachmentReference(row.evidenceUrl, allowed);
    if (!parsed.match) {
      if (
        parsed.reviewAttachmentId &&
        actionById.has(parsed.reviewAttachmentId.toLowerCase())
      ) {
        fail("ATTACHMENT_RESIDUAL_RECONCILIATION_PRIMARY_GRAPH_DRIFT");
      }
      continue;
    }
    const attachmentId = parsed.match.attachmentId.toLowerCase();
    if (!actionById.has(attachmentId)) continue;
    const action = actionById.get(attachmentId);
    if (
      row.sourceTenantId !== action.tenantId ||
      row.parentTenantId !== action.tenantId ||
      (row.resourceStoreId !== null &&
        row.resourceStoreTenantId !== action.tenantId)
    ) {
      fail("ATTACHMENT_RESIDUAL_RECONCILIATION_PRIMARY_GRAPH_DRIFT");
    }
    observedParents.get(attachmentId).add(`STAFF_TASK\0${row.resourceId}`);
  }
  for (const action of plan.actions) {
    const expected = [...expectedParents.get(action.attachmentId)].sort();
    const observed = [...observedParents.get(action.attachmentId)].sort();
    if (canonicalJson(expected) !== canonicalJson(observed)) {
      fail("ATTACHMENT_RESIDUAL_RECONCILIATION_PRIMARY_GRAPH_DRIFT");
    }
  }

  const bindings = plan.actions.flatMap((action) => action.bindings);
  if (bindings.length === 0) return;
  const scopeResult = await client.query(
    `SELECT desired."attachmentId", desired."resourceKind", desired."resourceId",
            scope."tenantId", scope."storeId"
     FROM jsonb_to_recordset($1::jsonb) AS desired(
       "attachmentId" text, "resourceKind" text, "resourceId" text
     )
     LEFT JOIN LATERAL public."resolve_staff_attachment_resource_scope"(
       desired."resourceKind"::public."StaffAttachmentResourceKind",
       desired."resourceId"
     ) AS scope ON true
     ORDER BY desired."attachmentId" COLLATE "C",
              desired."resourceKind" COLLATE "C", desired."resourceId" COLLATE "C"`,
    [JSON.stringify(bindings)],
  );
  if (scopeResult.rows.length !== bindings.length) {
    fail("ATTACHMENT_RESIDUAL_RECONCILIATION_PARENT_SCOPE_DRIFT");
  }
  const bindingByKey = new Map(
    bindings.map((binding) => [
      `${binding.attachmentId}\0${binding.resourceKind}\0${binding.resourceId}`,
      binding,
    ]),
  );
  for (const row of scopeResult.rows) {
    const binding = bindingByKey.get(
      `${row.attachmentId}\0${row.resourceKind}\0${row.resourceId}`,
    );
    if (
      !binding ||
      row.tenantId !== binding.tenantId ||
      (row.storeId ?? null) !== binding.resourceStoreId
    ) {
      fail("ATTACHMENT_RESIDUAL_RECONCILIATION_PARENT_SCOPE_DRIFT");
    }
  }
}

async function insertResidualBindings(client, plan, transitionAt) {
  const rows = residualBindings(plan, transitionAt);
  if (rows.length === 0) return;
  const result = await client.query(
    `INSERT INTO public."StaffAttachmentBinding" (
       "id", "tenantId", "attachmentId", "candidateAttachmentId",
       "resourceKind", "resourceId", "resourceStoreId", "state", "source",
       "sourceKey", "createdByUserId", "reasonCode", "resolvedAt", "createdAt", "updatedAt"
     )
     SELECT desired."id", desired."tenantId", desired."attachmentId",
            desired."candidateAttachmentId",
            desired."resourceKind"::public."StaffAttachmentResourceKind",
            desired."resourceId", desired."resourceStoreId",
            desired."state"::public."StaffAttachmentBindingState",
            desired."source"::public."StaffAttachmentBindingSource",
            desired."sourceKey", NULL, NULL,
            desired."resolvedAt"::timestamp(3), desired."createdAt"::timestamp(3),
            desired."updatedAt"::timestamp(3)
     FROM jsonb_to_recordset($1::jsonb) AS desired(
       "id" text, "tenantId" text, "attachmentId" text,
       "candidateAttachmentId" text, "resourceKind" text, "resourceId" text,
       "resourceStoreId" text, "state" text, "source" text, "sourceKey" text,
       "createdByUserId" text, "reasonCode" text, "resolvedAt" text,
       "createdAt" text, "updatedAt" text
     )
     ORDER BY desired."attachmentId" COLLATE "C",
              desired."resourceKind" COLLATE "C", desired."resourceId" COLLATE "C"`,
    [JSON.stringify(rows)],
  );
  if (result.rowCount !== rows.length) {
    fail("ATTACHMENT_RESIDUAL_RECONCILIATION_BINDING_INSERT_COUNT_MISMATCH");
  }
}

async function transitionResidualAttachments(client, plan, transitionAt) {
  const desired = plan.actions.map((action) => ({
    afterState: action.after.state,
    afterStateReasonCode: action.after.stateReasonCode,
    attachmentId: action.attachmentId,
    beforePendingExpiresAt: action.before.pendingExpiresAt,
    beforeState: action.before.state,
    beforeStateChangedAt: action.before.stateChangedAt,
    beforeStateReasonCode: action.before.stateReasonCode,
    tenantId: action.tenantId,
    transitionAt,
  }));
  const result = await client.query(
    `UPDATE public."StaffAttachment" AS attachment
     SET "state" = desired."afterState"::public."StaffAttachmentState",
         "pendingExpiresAt" = NULL,
         "stateReasonCode" = desired."afterStateReasonCode",
         "stateChangedAt" = desired."transitionAt"::timestamp(3)
     FROM jsonb_to_recordset($1::jsonb) AS desired(
       "attachmentId" text, "tenantId" text, "beforeState" text,
       "beforePendingExpiresAt" text, "beforeStateReasonCode" text,
       "beforeStateChangedAt" text, "afterState" text,
       "afterStateReasonCode" text, "transitionAt" text
     )
     WHERE attachment."id" = desired."attachmentId"
       AND attachment."tenantId" = desired."tenantId"
       AND attachment."state" = desired."beforeState"::public."StaffAttachmentState"
       AND attachment."pendingExpiresAt" IS NOT DISTINCT FROM
           desired."beforePendingExpiresAt"::timestamp(3)
       AND attachment."stateReasonCode" IS NOT DISTINCT FROM
           desired."beforeStateReasonCode"
       AND attachment."stateChangedAt" =
           desired."beforeStateChangedAt"::timestamp(3)`,
    [JSON.stringify(desired)],
  );
  if (result.rowCount !== plan.actions.length) {
    fail("ATTACHMENT_RESIDUAL_RECONCILIATION_ATTACHMENT_UPDATE_COUNT_MISMATCH");
  }
}

async function deleteResidualBindings(client, plan) {
  const bindings = plan.actions.flatMap((action) => action.bindings);
  if (bindings.length === 0) return;
  const result = await client.query(
    `DELETE FROM public."StaffAttachmentBinding" AS binding
     USING jsonb_to_recordset($1::jsonb) AS desired(
       "id" text, "tenantId" text, "attachmentId" text, "sourceKey" text
     )
     WHERE binding."id" = desired."id"
       AND binding."tenantId" = desired."tenantId"
       AND binding."attachmentId" = desired."attachmentId"
       AND binding."sourceKey" = desired."sourceKey"`,
    [JSON.stringify(bindings)],
  );
  if (result.rowCount !== bindings.length) {
    fail("ATTACHMENT_RESIDUAL_RECONCILIATION_BINDING_DELETE_COUNT_MISMATCH");
  }
}

async function restoreResidualAttachments(client, plan, applyTransitionAt) {
  const desired = plan.actions.map((action) => ({
    afterState: action.after.state,
    afterStateReasonCode: action.after.stateReasonCode,
    attachmentId: action.attachmentId,
    beforePendingExpiresAt: action.before.pendingExpiresAt,
    beforeState: action.before.state,
    beforeStateChangedAt: action.before.stateChangedAt,
    beforeStateReasonCode: action.before.stateReasonCode,
    tenantId: action.tenantId,
  }));
  const result = await client.query(
    `UPDATE public."StaffAttachment" AS attachment
     SET "state" = desired."beforeState"::public."StaffAttachmentState",
         "pendingExpiresAt" = desired."beforePendingExpiresAt"::timestamp(3),
         "stateReasonCode" = desired."beforeStateReasonCode",
         "stateChangedAt" = desired."beforeStateChangedAt"::timestamp(3)
     FROM jsonb_to_recordset($1::jsonb) AS desired(
       "attachmentId" text, "tenantId" text, "beforeState" text,
       "beforePendingExpiresAt" text, "beforeStateReasonCode" text,
       "beforeStateChangedAt" text, "afterState" text,
       "afterStateReasonCode" text
     )
     WHERE attachment."id" = desired."attachmentId"
       AND attachment."tenantId" = desired."tenantId"
       AND attachment."state" = desired."afterState"::public."StaffAttachmentState"
       AND attachment."pendingExpiresAt" IS NULL
       AND attachment."stateReasonCode" IS NOT DISTINCT FROM
           desired."afterStateReasonCode"
       AND attachment."stateChangedAt" = $2::timestamp(3)`,
    [JSON.stringify(desired), applyTransitionAt],
  );
  if (result.rowCount !== plan.actions.length) {
    fail("ATTACHMENT_RESIDUAL_RECONCILIATION_ATTACHMENT_RESTORE_COUNT_MISMATCH");
  }
}

function validateResidualPlanDatabaseBinding(plan, observed, config) {
  if (
    canonicalJson(plan.database) !== canonicalJson(observed) ||
    plan.database.databaseTargetFingerprint !==
      config.publicConfig.databaseTargetFingerprint ||
    plan.database.releaseSha !== config.publicConfig.releaseSha ||
    canonicalJson(plan.database.allowedHttpsOrigins) !==
      canonicalJson(config.publicConfig.allowedHttpsOrigins)
  ) {
    fail("ATTACHMENT_RESIDUAL_RECONCILIATION_PLAN_DATABASE_BINDING_MISMATCH");
  }
}

export async function executeStaffAttachmentResidualReconciliation({
  approval,
  config,
  direction,
  plan,
}) {
  validateStaffAttachmentResidualReconciliationApproval(
    approval,
    plan,
    direction,
  );
  const client = new pg.Client({
    connectionString: connectionString(config, false),
  });
  await client.connect();
  try {
    const database = await attestDatabase(client, config);
    validateResidualPlanDatabaseBinding(plan, database, config);
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    await client.query(`SET LOCAL lock_timeout = '${config.lockTimeoutMs}ms'`);
    await client.query(
      `SET LOCAL statement_timeout = '${config.statementTimeoutMs}ms'`,
    );
    await client.query(
      "SET LOCAL idle_in_transaction_session_timeout = '120s'",
    );
    const lock = await client.query(
      "SELECT pg_catalog.pg_try_advisory_xact_lock($1::integer, $2::integer) AS acquired",
      [ADVISORY_LOCK_NAMESPACE, ADVISORY_LOCK_RESOURCE],
    );
    if (lock.rows[0]?.acquired !== true) {
      fail("ATTACHMENT_RESIDUAL_RECONCILIATION_ADVISORY_LOCK_BUSY");
    }
    validateResidualPlanDatabaseBinding(
      plan,
      await attestDatabase(client, config),
      config,
    );
    const initialState = await readResidualCurrentState(client, plan, true);
    const classification = classifyStaffAttachmentResidualReconciliationState({
      direction,
      plan,
      state: initialState,
    });
    if (classification.disposition === "RECONCILED") {
      await client.query("COMMIT");
      return Object.freeze({
        actionCount: plan.summary.actionCount,
        bindingCount: plan.summary.bindingCount,
        contractVersion: RESIDUAL_RECEIPT_CONTRACT,
        decision: "PASS",
        direction,
        disposition: "RECONCILED",
        planDigest: plan.planDigest,
        quarantineAttachmentCount: plan.summary.quarantineAttachmentCount,
        transitionAt: classification.transitionAt,
        zeroDiff: true,
      });
    }
    const transitionResult = await client.query(
      "SELECT transaction_timestamp() AS \"transitionAt\"",
    );
    const transitionAt = iso(transitionResult.rows[0].transitionAt);
    if (direction === "APPLY") {
      await validateCurrentResidualParents(
        client,
        plan,
        config.publicConfig.allowedHttpsOrigins,
      );
      await insertResidualBindings(client, plan, transitionAt);
      await transitionResidualAttachments(client, plan, transitionAt);
      await client.query("SET CONSTRAINTS ALL IMMEDIATE");
      await insertAudits(
        client,
        residualAuditEvents(plan, direction, transitionAt),
      );
    } else {
      const normalized = normalizeCurrentState(initialState);
      const applyAudit = exactResidualAuditSet(
        plan,
        "APPLY",
        normalized.audits.filter(
          (row) => row.action === RESIDUAL_APPLY_AUDIT_ACTION,
        ),
      );
      await deleteResidualBindings(client, plan);
      await restoreResidualAttachments(
        client,
        plan,
        applyAudit.transitionAt,
      );
      await client.query("SET CONSTRAINTS ALL IMMEDIATE");
      await insertAudits(
        client,
        residualAuditEvents(plan, direction, transitionAt),
      );
    }
    const finalState = await readResidualCurrentState(client, plan, false);
    const finalClassification =
      classifyStaffAttachmentResidualReconciliationState({
        direction,
        plan,
        state: finalState,
      });
    if (finalClassification.disposition !== "RECONCILED") {
      fail("ATTACHMENT_RESIDUAL_RECONCILIATION_POST_WRITE_ZERO_DIFF_FAILED");
    }
    await client.query("COMMIT");
    return Object.freeze({
      actionCount: plan.summary.actionCount,
      bindingCount: plan.summary.bindingCount,
      contractVersion: RESIDUAL_RECEIPT_CONTRACT,
      decision: "PASS",
      direction,
      disposition: "APPLIED",
      planDigest: plan.planDigest,
      quarantineAttachmentCount: plan.summary.quarantineAttachmentCount,
      transitionAt,
      zeroDiff: true,
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

export async function checkStaffAttachmentResidualReconciliation({
  config,
  direction,
  plan,
}) {
  validateStaffAttachmentResidualReconciliationPlan(plan);
  const client = new pg.Client({
    connectionString: connectionString(config, true),
  });
  await client.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    validateResidualPlanDatabaseBinding(
      plan,
      await attestDatabase(client, config),
      config,
    );
    const state = await readResidualCurrentState(client, plan, false);
    const classification = classifyStaffAttachmentResidualReconciliationState({
      direction,
      plan,
      state,
    });
    if (classification.disposition !== "RECONCILED") {
      fail("ATTACHMENT_RESIDUAL_RECONCILIATION_CHECK_NOT_RECONCILED");
    }
    await client.query("COMMIT");
    return Object.freeze({
      actionCount: plan.summary.actionCount,
      bindingCount: plan.summary.bindingCount,
      contractVersion: RESIDUAL_RECEIPT_CONTRACT,
      decision: "PASS",
      direction,
      disposition: "CHECKED",
      planDigest: plan.planDigest,
      quarantineAttachmentCount: plan.summary.quarantineAttachmentCount,
      transitionAt: classification.transitionAt,
      zeroDiff: true,
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

export function selfTestStaffAttachmentReconciliation() {
  const generatedAt = "2026-08-24T00:00:00.000Z";
  const snapshot = {
    attachments: [
      {
        id: "123e4567-e89b-42d3-a456-426614174000",
        tenantId: "tenant-a",
        state: "UNRESOLVED",
        pendingExpiresAt: null,
        stateReasonCode: "LEGACY_UNCLASSIFIED",
        stateChangedAt: generatedAt,
      },
      {
        id: "123e4567-e89b-42d3-a456-426614174001",
        tenantId: "tenant-a",
        state: "PENDING",
        pendingExpiresAt: "2026-08-25T00:00:00.000Z",
        stateReasonCode: null,
        stateChangedAt: generatedAt,
      },
    ],
    bindings: [],
    database: {
      allowedHttpsOrigins: [],
      databaseIdentityDigest: "a".repeat(64),
      databaseName: "leetplus_self_test",
      databaseTargetFingerprint: "b".repeat(64),
      expectedMigrationCount: EXPECTED_MIGRATION_COUNT,
      expectedMigrationHead: EXPECTED_MIGRATION_HEAD,
      releaseSha: "c".repeat(40),
      roleName: "self_test_role",
      schemaContractDigest: "d".repeat(64),
      systemIdentifier: "1234567890123456789",
      target: "development",
    },
    generatedAt,
    occurrences: [
      {
        attachmentId: "123e4567-e89b-42d3-a456-426614174000",
        parentTenantId: "tenant-a",
        parentValid: true,
        referenceForm: "NORMALIZED_RELATION",
        resourceId: "message-a",
        resourceKind: "CHAT_MESSAGE",
        resourceStoreId: "store-a",
        resourceStoreTenantId: "tenant-a",
        source: "NORMALIZED_CHAT_RELATION",
        sourceRowId: "relation-a",
        sourceTenantId: "tenant-a",
      },
    ],
    signals: [],
  };
  const plan = buildStaffAttachmentReconciliationPlan(snapshot);
  validateStaffAttachmentReconciliationPlan(plan);
  if (
    plan.summary.actionCount !== 1 ||
    plan.summary.reviewAttachmentCount !== 1 ||
    plan.reviews[0].reasonCodes.includes("LIFECYCLE_REVIEW_REQUIRED") !== true
  ) {
    fail("ATTACHMENT_RECONCILIATION_SELF_TEST_PLAN_FAILED");
  }
  const approval = createStaffAttachmentReconciliationApproval({
    actionCount: 1,
    confirmationPhrase: APPROVAL_PHRASES.APPLY,
    confirmedPlanDigest: plan.planDigest,
    direction: "APPLY",
    plan,
    reviewAttachmentCount: 1,
    now: new Date(generatedAt),
  });
  validateStaffAttachmentReconciliationApproval(approval, plan, "APPLY");
  const residualSnapshot = {
    attachments: [
      {
        id: "223e4567-e89b-42d3-a456-426614174000",
        tenantId: "tenant-a",
        state: "UNRESOLVED",
        pendingExpiresAt: null,
        stateReasonCode: "LEGACY_UNCLASSIFIED",
        stateChangedAt: generatedAt,
      },
      {
        id: "223e4567-e89b-42d3-a456-426614174001",
        tenantId: "tenant-a",
        state: "UNRESOLVED",
        pendingExpiresAt: null,
        stateReasonCode: "LEGACY_UNCLASSIFIED",
        stateChangedAt: generatedAt,
      },
      {
        id: "223e4567-e89b-42d3-a456-426614174002",
        tenantId: "tenant-a",
        state: "PENDING",
        pendingExpiresAt: "2026-08-23T00:00:00.000Z",
        stateReasonCode: null,
        stateChangedAt: generatedAt,
      },
    ],
    bindings: [],
    database: snapshot.database,
    generatedAt,
    occurrences: [
      {
        ...snapshot.occurrences[0],
        attachmentId: "223e4567-e89b-42d3-a456-426614174000",
        resourceId: "message-b",
        sourceRowId: "relation-b",
      },
      {
        ...snapshot.occurrences[0],
        attachmentId: "223e4567-e89b-42d3-a456-426614174000",
        resourceId: "message-c",
        sourceRowId: "relation-c",
      },
    ],
    signals: [],
  };
  const residualPlan = buildStaffAttachmentResidualReconciliationPlan(
    residualSnapshot,
  );
  validateStaffAttachmentResidualReconciliationPlan(residualPlan);
  if (
    residualPlan.summary.actionCount !== 3 ||
    residualPlan.summary.bindAttachmentCount !== 1 ||
    residualPlan.summary.bindingCount !== 2 ||
    residualPlan.summary.quarantineAttachmentCount !== 2 ||
    residualPlan.summary.reviewAttachmentCount !== 0
  ) {
    fail("ATTACHMENT_RESIDUAL_RECONCILIATION_SELF_TEST_PLAN_FAILED");
  }
  const residualApproval =
    createStaffAttachmentResidualReconciliationApproval({
      actionCount: 3,
      bindingCount: 2,
      confirmationPhrase: RESIDUAL_APPROVAL_PHRASES.APPLY,
      confirmedPlanDigest: residualPlan.planDigest,
      direction: "APPLY",
      plan: residualPlan,
      quarantineCount: 2,
      reviewAttachmentCount: 0,
      now: new Date(generatedAt),
    });
  validateStaffAttachmentResidualReconciliationApproval(
    residualApproval,
    residualPlan,
    "APPLY",
  );
  return Object.freeze({
    actionCount: plan.summary.actionCount,
    contractVersion: RECONCILIATION_CONTRACT,
    databaseWrites: false,
    decision: "PASS",
    mode: "SELF_TEST",
    residualActionCount: residualPlan.summary.actionCount,
    residualBindingCount: residualPlan.summary.bindingCount,
    residualQuarantineAttachmentCount:
      residualPlan.summary.quarantineAttachmentCount,
    reviewAttachmentCount: plan.summary.reviewAttachmentCount,
  });
}

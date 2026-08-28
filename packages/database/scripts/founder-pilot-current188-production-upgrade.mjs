import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
  timingSafeEqual,
  verify,
} from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { inspectFounderPilotImmutableFile } from "./founder-pilot-restored-copy-preflight.mjs";
import {
  FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS,
  materializeFounderPilotProductionHistoryLane,
} from "./founder-pilot-production-history-rehearsal.mjs";
import {
  FOUNDER_PILOT_PRODUCTION_HISTORY_PRODUCTION_CONFIRMATION,
  FOUNDER_PILOT_PRODUCTION_HISTORY_PRODUCTION_CONTRACT,
  createFounderPilotProductionHistoryProductionPgAdapter,
  founderPilotProductionHistoryProductionIdentityDigest,
  normalizeFounderPilotProductionHistoryProductionIdentity,
  normalizeFounderPilotProductionHistoryProductionManifest,
} from "./founder-pilot-production-history-production.mjs";

export const FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_CONTRACT =
  "FOUNDER_PILOT_PRODUCTION_HISTORY_187_TO_188_V1";
export const FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_CONFIRMATION =
  "I_ACCEPT_EXACT_PRODUCTION_HISTORY_187_TO_188_V1";
export const FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_INVENTORY_READY =
  "CURRENT188_UPGRADE_INVENTORY_READY_NOT_AUTHORIZATION";
export const FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_PLAN_READY =
  "CURRENT188_UPGRADE_PLAN_READY";
export const FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_APPLIED =
  "CURRENT188_UPGRADE_APPLIED";

const SOURCE_COUNT = 187;
const SOURCE_HEAD = "20260820010000_guest_portal_telegram_update_ledger";
const TARGET_COUNT = 188;
const TARGET_HEAD = "20260828190000_guest_support_bug_reports";
const TARGET_MIGRATION_SHA256 =
  "c40d5eeb84cc980053af48b56385bf48882ee355aec718a442dab855ea33eb9b";
const TARGET_WORKER_FUNCTION_SHA256 =
  "a9a4bf75b8d5a381ebfc5ed9a35c6b966cbaac9b631a321ee66c1a6c1cc113a5";
const TARGET_PRETERMINAL_MANIFEST_SHA256 =
  "094f3ad34ef8846f6088f51d5fb9491ff89af4509b60063453c22af07466d99b";
const SHA256 = /^[0-9a-f]{64}$/u;
const SHA40 = /^[0-9a-f]{40}$/u;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const BASE64URL_SIGNATURE = /^[A-Za-z0-9_-]{86}$/u;
const LEGACY_APPLIED_CHECKSUMS = new Map([
  [
    "20260518120000_guest_data_foundation",
    "98de87e5d79eb6611b0722e954fe0e7b2eb6480c7b485d9cf451ecff6dcf4341",
  ],
  [
    "20260519142000_guest_working_shifts",
    "226614a5e628a3d40a0fe584323d6ed2134f229092e35081ec9b05a24378eff5",
  ],
]);

const EXPECTED_TABLES = Object.freeze([
  "GuestSupportAttachment",
  "GuestSupportTicket",
  "GuestSupportTicketAuditEvent",
  "GuestSupportTicketComment",
]);
const EXPECTED_ENUMS = Object.freeze([
  Object.freeze({
    labels: Object.freeze(["PENDING", "AVAILABLE", "REJECTED"]),
    name: "GuestSupportAttachmentState",
  }),
  Object.freeze({
    labels: Object.freeze(["NEW", "IN_PROGRESS", "RESOLVED", "CLOSED"]),
    name: "GuestSupportTicketStatus",
  }),
]);
const EXPECTED_INDEXES = Object.freeze(
  [
    "GuestSupportAttachment_pkey",
    "GuestSupportTicketAuditEvent_pkey",
    "GuestSupportTicketComment_pkey",
    "GuestSupportTicket_pkey",
    "GuestSupportTicket_ticketNumber_key",
    "guest_support_attachment_sha_idx",
    "guest_support_attachment_state_idx",
    "guest_support_attachment_ticket_idx",
    "guest_support_audit_actor_idx",
    "guest_support_audit_ticket_idx",
    "guest_support_comment_author_idx",
    "guest_support_comment_ticket_idx",
    "guest_support_ticket_assignee_status_idx",
    "guest_support_ticket_guest_idx",
    "guest_support_ticket_profile_idempotency_uidx",
    "guest_support_ticket_status_activity_idx",
    "guest_support_ticket_store_created_idx",
    "guest_support_ticket_tenant_id_uidx",
    "guest_support_ticket_topic_created_idx",
  ].sort(),
);
const EXPECTED_CONSTRAINTS = Object.freeze(
  [
    "GuestSupportAttachment_pkey",
    "GuestSupportAttachment_tenantId_fkey",
    "GuestSupportAttachment_tenantId_ticketId_fkey",
    "GuestSupportTicketAuditEvent_actorUserId_fkey",
    "GuestSupportTicketAuditEvent_pkey",
    "GuestSupportTicketAuditEvent_tenantId_fkey",
    "GuestSupportTicketAuditEvent_tenantId_ticketId_fkey",
    "GuestSupportTicketComment_authorUserId_fkey",
    "GuestSupportTicketComment_pkey",
    "GuestSupportTicketComment_tenantId_fkey",
    "GuestSupportTicketComment_tenantId_ticketId_fkey",
    "GuestSupportTicket_assignedToUserId_fkey",
    "GuestSupportTicket_pkey",
    "GuestSupportTicket_tenantId_fkey",
    "GuestSupportTicket_tenantId_guestId_fkey",
    "GuestSupportTicket_tenantId_profileId_fkey",
    "GuestSupportTicket_tenantId_storeId_fkey",
    "guest_support_attachment_content_type_chk",
    "guest_support_attachment_sha_chk",
    "guest_support_attachment_size_chk",
    "guest_support_attachment_state_chk",
    "guest_support_comment_body_length_chk",
    "guest_support_ticket_description_length_chk",
    "guest_support_ticket_idempotency_format_chk",
    "guest_support_ticket_kind_chk",
    "guest_support_ticket_number_format_chk",
    "guest_support_ticket_terminal_timestamps_chk",
    "guest_support_ticket_topic_chk",
  ].sort(),
);

export class FounderPilotCurrent188ProductionUpgradeError extends Error {
  constructor(reasonCode) {
    super(reasonCode);
    this.name = "FounderPilotCurrent188ProductionUpgradeError";
    this.reasonCode = reasonCode;
    this.safeContractError = true;
  }
}

function fail(reasonCode) {
  throw new FounderPilotCurrent188ProductionUpgradeError(reasonCode);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
    .join(",")}}`;
}

function digest(domain, value) {
  return sha256(
    `${FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_CONTRACT}\0${domain}\0${stableJson(value)}`,
  );
}

function exactRecord(value, keys, reasonCode) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.keys(value).sort().join("\0") !== [...keys].sort().join("\0")
  ) {
    fail(reasonCode);
  }
  return value;
}

function safeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return (
    leftBytes.length === rightBytes.length &&
    timingSafeEqual(leftBytes, rightBytes)
  );
}

function currentDate(now) {
  const value = now();
  if (!(value instanceof Date) || !Number.isFinite(value.valueOf())) {
    fail("CURRENT188_UPGRADE_CLOCK_INVALID");
  }
  return value;
}

function toLegacyManifest(manifest) {
  return {
    ...manifest,
    contractVersion: FOUNDER_PILOT_PRODUCTION_HISTORY_PRODUCTION_CONTRACT,
    operation: {
      deployTimeoutSeconds: manifest.operation.deployTimeoutSeconds,
      expectedStaleRunSetDigest: "0".repeat(64),
    },
  };
}

export function normalizeFounderPilotCurrent188ProductionUpgradeManifest(
  value,
) {
  const manifest = exactRecord(
    value,
    [
      "approval",
      "contractVersion",
      "environment",
      "operation",
      "release",
      "target",
    ],
    "CURRENT188_UPGRADE_MANIFEST_INVALID",
  );
  if (
    manifest.contractVersion !==
    FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_CONTRACT
  ) {
    fail("CURRENT188_UPGRADE_CONTRACT_INVALID");
  }
  const operation = exactRecord(
    manifest.operation,
    ["deployTimeoutSeconds"],
    "CURRENT188_UPGRADE_OPERATION_INVALID",
  );
  const normalizedLegacy =
    normalizeFounderPilotProductionHistoryProductionManifest(
      toLegacyManifest(manifest),
    );
  return Object.freeze({
    ...normalizedLegacy,
    contractVersion: FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_CONTRACT,
    operation: Object.freeze({
      deployTimeoutSeconds: operation.deployTimeoutSeconds,
    }),
  });
}

export function founderPilotCurrent188ProductionUpgradeManifestDigest(value) {
  return digest(
    "production-manifest",
    normalizeFounderPilotCurrent188ProductionUpgradeManifest(value),
  );
}

function canonicalPublicKey(pem, expectedFingerprint) {
  let key;
  try {
    key = createPublicKey(pem);
  } catch {
    fail("CURRENT188_UPGRADE_APPROVAL_KEY_INVALID");
  }
  if (
    key.asymmetricKeyType !== "ed25519" ||
    sha256(key.export({ format: "der", type: "spki" })) !== expectedFingerprint
  ) {
    fail("CURRENT188_UPGRADE_APPROVAL_KEY_INVALID");
  }
  return key;
}

function migrationDigest(rows) {
  return sha256(
    rows
      .map(({ checksum, migrationName }) => `${migrationName}\0${checksum}`)
      .sort()
      .join("\n"),
  );
}

async function inspectMaterializedLane({ laneRoot, sourcePrismaRoot }) {
  const lane = await materializeFounderPilotProductionHistoryLane({
    laneRoot,
    sourcePrismaRoot,
    targetMigrationCount: TARGET_COUNT,
    targetMigrationHead: TARGET_HEAD,
  });
  normalizeSha256(
    lane.treeDigest,
    "CURRENT188_UPGRADE_MATERIALIZED_TREE_INVALID",
  );
  if (lane.migrationCount !== TARGET_COUNT) {
    fail("CURRENT188_UPGRADE_MATERIALIZED_TREE_INVALID");
  }
  const migrationsRoot = path.join(laneRoot, "migrations");
  const names = (await readdir(migrationsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  if (names.length !== TARGET_COUNT || names.at(-1) !== TARGET_HEAD) {
    fail("CURRENT188_UPGRADE_MATERIALIZED_TREE_INVALID");
  }
  const rows = await Promise.all(
    names.map(async (migrationName) => ({
      checksum:
        LEGACY_APPLIED_CHECKSUMS.get(migrationName) ??
        sha256(
          await readFile(
            path.join(migrationsRoot, migrationName, "migration.sql"),
          ),
        ),
      migrationName,
    })),
  );
  const target = rows.at(-1);
  if (
    target?.migrationName !== TARGET_HEAD ||
    target?.checksum !== TARGET_MIGRATION_SHA256
  ) {
    fail("CURRENT188_UPGRADE_TARGET_MIGRATION_DRIFT");
  }
  const sourceRows = rows.slice(0, -1);
  return Object.freeze({
    finalManifestDigest: migrationDigest(rows),
    sourceManifestDigest: migrationDigest(sourceRows),
    sourceRows: Object.freeze(sourceRows.map((row) => Object.freeze(row))),
    targetRows: Object.freeze(rows.map((row) => Object.freeze(row))),
    treeDigest: lane.treeDigest,
  });
}

function normalizeSha256(value, reasonCode) {
  if (typeof value !== "string" || !SHA256.test(value)) fail(reasonCode);
  return value;
}

function appliedRows(evidence) {
  return evidence.migrationRows
    .filter((row) => row.applied === true)
    .map((row) => ({
      checksum: row.checksum,
      migrationName: row.migrationName,
    }));
}

function rowsEqual(actual, expected) {
  if (actual.length !== expected.length) return false;
  return actual.every(
    (row, index) =>
      row.migrationName === expected[index].migrationName &&
      row.checksum === expected[index].checksum,
  );
}

function exactSourceState(evidence, lane) {
  return (
    evidence?.migrationCount === SOURCE_COUNT &&
    evidence?.migrationHead === SOURCE_HEAD &&
    evidence?.migrationManifestDigest === lane.sourceManifestDigest &&
    evidence?.rolledBackMigrationCount ===
      FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.sourceRolledBackMigrationCount &&
    evidence?.rolledBackMigrationManifestDigest ===
      FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.sourceRolledBackMigrationManifestDigest &&
    evidence?.unfinishedMigrationCount === 0 &&
    Array.isArray(evidence?.runningDigestRows) &&
    evidence.runningDigestRows.length === 0 &&
    rowsEqual(appliedRows(evidence), lane.sourceRows)
  );
}

function exactFinalState(evidence, lane) {
  return (
    evidence?.migrationCount === TARGET_COUNT &&
    evidence?.migrationHead === TARGET_HEAD &&
    evidence?.migrationManifestDigest === lane.finalManifestDigest &&
    evidence?.rolledBackMigrationCount ===
      FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.sourceRolledBackMigrationCount &&
    evidence?.rolledBackMigrationManifestDigest ===
      FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.sourceRolledBackMigrationManifestDigest &&
    evidence?.unfinishedMigrationCount === 0 &&
    Array.isArray(evidence?.runningDigestRows) &&
    evidence.runningDigestRows.length === 0 &&
    rowsEqual(appliedRows(evidence), lane.targetRows)
  );
}

function arraysEqual(actual, expected) {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  );
}

function supportContractExact(evidence) {
  return (
    evidence?.migrationChecksum === TARGET_MIGRATION_SHA256 &&
    arraysEqual(evidence.tableNames, EXPECTED_TABLES) &&
    arraysEqual(evidence.indexNames, EXPECTED_INDEXES) &&
    arraysEqual(evidence.constraintNames, EXPECTED_CONSTRAINTS) &&
    Array.isArray(evidence.enumTypes) &&
    stableJson(evidence.enumTypes) === stableJson(EXPECTED_ENUMS) &&
    evidence.publicTablePrivilegeCount === 0 &&
    evidence.publicWorkerExecuteCount === 0
  );
}

function planBase(plan) {
  const { planDigest: _ignored, ...base } = plan;
  return base;
}

function normalizePlan(value) {
  const plan = exactRecord(
    value,
    [
      "approvalKeyId",
      "approvalKeySpkiSha256",
      "artifactSha256",
      "contractVersion",
      "decision",
      "expiresAt",
      "materializedTreeDigest",
      "plannedAt",
      "planDigest",
      "productionManifestDigest",
      "releaseSha",
      "sourceMigrationCount",
      "sourceMigrationManifestDigest",
      "sourceRolledBackMigrationCount",
      "sourceRolledBackMigrationManifestDigest",
      "sourceSchemaHead",
      "targetIdentityDigest",
      "targetMigrationCount",
      "targetMigrationSha256",
      "targetSchemaHead",
    ],
    "CURRENT188_UPGRADE_PLAN_INVALID",
  );
  if (
    plan.contractVersion !==
      FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_CONTRACT ||
    plan.decision !== FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_PLAN_READY ||
    !SHA40.test(plan.releaseSha) ||
    !SHA256.test(plan.planDigest) ||
    ![
      plan.approvalKeySpkiSha256,
      plan.artifactSha256,
      plan.materializedTreeDigest,
      plan.productionManifestDigest,
      plan.sourceMigrationManifestDigest,
      plan.sourceRolledBackMigrationManifestDigest,
      plan.targetIdentityDigest,
      plan.targetMigrationSha256,
    ].every((candidate) => SHA256.test(candidate)) ||
    !ISO_TIMESTAMP.test(plan.plannedAt) ||
    !ISO_TIMESTAMP.test(plan.expiresAt) ||
    plan.sourceMigrationCount !== SOURCE_COUNT ||
    plan.sourceSchemaHead !== SOURCE_HEAD ||
    plan.targetMigrationCount !== TARGET_COUNT ||
    plan.targetSchemaHead !== TARGET_HEAD ||
    plan.targetMigrationSha256 !== TARGET_MIGRATION_SHA256 ||
    plan.sourceRolledBackMigrationCount !==
      FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.sourceRolledBackMigrationCount ||
    digest("production-plan", planBase(plan)) !== plan.planDigest
  ) {
    fail("CURRENT188_UPGRADE_PLAN_INVALID");
  }
  return Object.freeze({ ...plan });
}

function assertPlanWindow(plan, manifest, now) {
  const plannedAt = new Date(plan.plannedAt);
  const expiresAt = new Date(plan.expiresAt);
  if (
    !Number.isFinite(plannedAt.valueOf()) ||
    !Number.isFinite(expiresAt.valueOf()) ||
    expiresAt.valueOf() - plannedAt.valueOf() !==
      manifest.approval.maxPlanAgeSeconds * 1000 ||
    now < plannedAt ||
    now >= expiresAt
  ) {
    fail("CURRENT188_UPGRADE_PLAN_EXPIRED");
  }
}

async function inspectRelease({
  inspectArtifact,
  laneRoot,
  manifest,
  sourcePrismaRoot,
}) {
  const [artifact, lane] = await Promise.all([
    inspectArtifact({
      expectedSha256: manifest.release.artifactSha256,
      filePath: manifest.release.artifactPath,
    }),
    inspectMaterializedLane({ laneRoot, sourcePrismaRoot }),
  ]);
  if (lane.treeDigest !== manifest.release.materializedTreeDigest) {
    fail("CURRENT188_UPGRADE_MATERIALIZED_TREE_MISMATCH");
  }
  return Object.freeze({ artifact, lane });
}

export async function buildFounderPilotCurrent188ProductionUpgradePlan({
  adapter,
  inspectArtifact = inspectFounderPilotImmutableFile,
  laneRoot,
  manifest: rawManifest,
  now = () => new Date(),
  sourcePrismaRoot,
}) {
  const manifest =
    normalizeFounderPilotCurrent188ProductionUpgradeManifest(rawManifest);
  if (
    !adapter ||
    typeof adapter.inspectTarget !== "function" ||
    typeof inspectArtifact !== "function"
  ) {
    fail("CURRENT188_UPGRADE_ADAPTER_INVALID");
  }
  const plannedAt = currentDate(now);
  const [release, evidence] = await Promise.all([
    inspectRelease({ inspectArtifact, laneRoot, manifest, sourcePrismaRoot }),
    adapter.inspectTarget(),
  ]);
  const identity = normalizeFounderPilotProductionHistoryProductionIdentity(
    evidence.identity,
    manifest.target,
  );
  if (!exactSourceState(evidence, release.lane)) {
    fail("CURRENT188_UPGRADE_SOURCE_STATE_MISMATCH");
  }
  const base = {
    approvalKeyId: manifest.approval.keyId,
    approvalKeySpkiSha256: manifest.approval.publicKeySpkiSha256,
    artifactSha256: manifest.release.artifactSha256,
    contractVersion: FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_CONTRACT,
    decision: FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_PLAN_READY,
    expiresAt: new Date(
      plannedAt.valueOf() + manifest.approval.maxPlanAgeSeconds * 1000,
    ).toISOString(),
    materializedTreeDigest: release.lane.treeDigest,
    plannedAt: plannedAt.toISOString(),
    productionManifestDigest:
      founderPilotCurrent188ProductionUpgradeManifestDigest(manifest),
    releaseSha: manifest.release.releaseSha,
    sourceMigrationCount: SOURCE_COUNT,
    sourceMigrationManifestDigest: release.lane.sourceManifestDigest,
    sourceRolledBackMigrationCount: evidence.rolledBackMigrationCount,
    sourceRolledBackMigrationManifestDigest:
      evidence.rolledBackMigrationManifestDigest,
    sourceSchemaHead: SOURCE_HEAD,
    targetIdentityDigest:
      founderPilotProductionHistoryProductionIdentityDigest(identity),
    targetMigrationCount: TARGET_COUNT,
    targetMigrationSha256: TARGET_MIGRATION_SHA256,
    targetSchemaHead: TARGET_HEAD,
  };
  return Object.freeze({
    ...base,
    planDigest: digest("production-plan", base),
  });
}

export async function inspectFounderPilotCurrent188ProductionUpgradeInventory({
  adapter,
  laneRoot,
  manifest: rawManifest,
  now = () => new Date(),
  sourcePrismaRoot,
}) {
  const manifest =
    normalizeFounderPilotCurrent188ProductionUpgradeManifest(rawManifest);
  const observedAt = currentDate(now);
  const [release, evidence] = await Promise.all([
    inspectRelease({
      inspectArtifact: inspectFounderPilotImmutableFile,
      laneRoot,
      manifest,
      sourcePrismaRoot,
    }),
    adapter.inspectTarget(),
  ]);
  const identity = normalizeFounderPilotProductionHistoryProductionIdentity(
    evidence.identity,
    manifest.target,
  );
  if (!exactSourceState(evidence, release.lane)) {
    fail("CURRENT188_UPGRADE_SOURCE_STATE_MISMATCH");
  }
  return Object.freeze({
    contractVersion: FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_CONTRACT,
    decision: FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_INVENTORY_READY,
    observedAt: observedAt.toISOString(),
    reasonCode: null,
    sourceMigrationCount: SOURCE_COUNT,
    sourceMigrationManifestDigest: release.lane.sourceManifestDigest,
    sourceRolledBackMigrationCount: evidence.rolledBackMigrationCount,
    sourceRolledBackMigrationManifestDigest:
      evidence.rolledBackMigrationManifestDigest,
    sourceSchemaHead: SOURCE_HEAD,
    targetIdentityDigest:
      founderPilotProductionHistoryProductionIdentityDigest(identity),
    targetMigrationCount: TARGET_COUNT,
    targetMigrationSha256: TARGET_MIGRATION_SHA256,
    targetSchemaHead: TARGET_HEAD,
  });
}

function approvalPayload(plan) {
  return Buffer.from(
    `${FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_CONTRACT}\0approval\0${plan.planDigest}`,
  );
}

export function signFounderPilotCurrent188ProductionUpgradePlan({
  manifest: rawManifest,
  plan: rawPlan,
  privateKeyPem,
}) {
  const manifest =
    normalizeFounderPilotCurrent188ProductionUpgradeManifest(rawManifest);
  const plan = normalizePlan(rawPlan);
  let privateKey;
  try {
    privateKey = createPrivateKey(privateKeyPem);
  } catch {
    fail("CURRENT188_UPGRADE_PRIVATE_KEY_INVALID");
  }
  if (
    privateKey.asymmetricKeyType !== "ed25519" ||
    sha256(
      createPublicKey(privateKey).export({ format: "der", type: "spki" }),
    ) !== manifest.approval.publicKeySpkiSha256
  ) {
    fail("CURRENT188_UPGRADE_PRIVATE_KEY_INVALID");
  }
  return Object.freeze({
    algorithm: "Ed25519",
    contractVersion: FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_CONTRACT,
    keyId: manifest.approval.keyId,
    planDigest: plan.planDigest,
    signature: sign(null, approvalPayload(plan), privateKey).toString(
      "base64url",
    ),
  });
}

export function verifyFounderPilotCurrent188ProductionUpgradeApproval({
  approval,
  manifest: rawManifest,
  pinnedApprovalKeySpkiSha256,
  plan: rawPlan,
}) {
  const manifest =
    normalizeFounderPilotCurrent188ProductionUpgradeManifest(rawManifest);
  const plan = normalizePlan(rawPlan);
  const receipt = exactRecord(
    approval,
    ["algorithm", "contractVersion", "keyId", "planDigest", "signature"],
    "CURRENT188_UPGRADE_APPROVAL_INVALID",
  );
  if (
    receipt.algorithm !== "Ed25519" ||
    receipt.contractVersion !==
      FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_CONTRACT ||
    receipt.keyId !== manifest.approval.keyId ||
    receipt.planDigest !== plan.planDigest ||
    !BASE64URL_SIGNATURE.test(receipt.signature) ||
    pinnedApprovalKeySpkiSha256 !== manifest.approval.publicKeySpkiSha256
  ) {
    fail("CURRENT188_UPGRADE_APPROVAL_INVALID");
  }
  const key = canonicalPublicKey(
    manifest.approval.publicKeyPem,
    manifest.approval.publicKeySpkiSha256,
  );
  if (
    !verify(
      null,
      approvalPayload(plan),
      key,
      Buffer.from(receipt.signature, "base64url"),
    )
  ) {
    fail("CURRENT188_UPGRADE_APPROVAL_INVALID");
  }
  return Object.freeze({ approvalDigest: digest("approval", receipt) });
}

async function emitPhase(onPhase, plan, phase, extra = {}) {
  if (typeof onPhase !== "function") {
    fail("CURRENT188_UPGRADE_PHASE_JOURNAL_REQUIRED");
  }
  await onPhase(
    Object.freeze({
      contractVersion: FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_CONTRACT,
      phase,
      planDigest: plan.planDigest,
      ...extra,
    }),
  );
}

function boundedDeploymentEvidence(result) {
  const evidence = { status: result?.status ?? null };
  for (const key of [
    "exitCode",
    "signal",
    "stderrBytes",
    "stderrSha256",
    "stdoutBytes",
    "stdoutSha256",
  ]) {
    if (result?.[key] !== undefined) evidence[key] = result[key];
  }
  return Object.freeze(evidence);
}

async function verifyFinal({ adapter, lane, manifest }) {
  const [evidence, runtime, support] = await Promise.all([
    adapter.inspectTarget(),
    adapter.inspectFinal(),
    adapter.inspectCurrent188SupportContract(),
  ]);
  const identity = normalizeFounderPilotProductionHistoryProductionIdentity(
    evidence.identity,
    manifest.target,
  );
  if (
    !exactFinalState(evidence, lane) ||
    runtime?.preterminalManifestDigest !== TARGET_PRETERMINAL_MANIFEST_SHA256 ||
    runtime?.workerFunctionDigest !== TARGET_WORKER_FUNCTION_SHA256 ||
    !supportContractExact(support)
  ) {
    return null;
  }
  return Object.freeze({
    identityDigest:
      founderPilotProductionHistoryProductionIdentityDigest(identity),
    migrationCount: evidence.migrationCount,
    migrationHead: evidence.migrationHead,
    migrationManifestDigest: evidence.migrationManifestDigest,
    supportContractDigest: digest("support-contract", support),
    workerFunctionDigest: runtime.workerFunctionDigest,
  });
}

export async function verifyFounderPilotCurrent188ProductionUpgradeFinal({
  adapter,
  laneRoot,
  manifest: rawManifest,
  sourcePrismaRoot,
}) {
  const manifest =
    normalizeFounderPilotCurrent188ProductionUpgradeManifest(rawManifest);
  const release = await inspectRelease({
    inspectArtifact: inspectFounderPilotImmutableFile,
    laneRoot,
    manifest,
    sourcePrismaRoot,
  });
  const final = await verifyFinal({ adapter, lane: release.lane, manifest });
  if (final === null) fail("CURRENT188_UPGRADE_FINAL_STATE_NOT_REACHED");
  return final;
}

export async function applyFounderPilotCurrent188ProductionUpgradePlan({
  adapter,
  approval,
  confirmPlanDigest,
  deploy,
  inspectArtifact = inspectFounderPilotImmutableFile,
  laneRoot,
  manifest: rawManifest,
  now = () => new Date(),
  onPhase,
  pinnedApprovalKeySpkiSha256,
  plan: rawPlan,
  productionConfirmation,
  sourcePrismaRoot,
}) {
  if (
    productionConfirmation !==
    FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_CONFIRMATION
  ) {
    fail("CURRENT188_UPGRADE_PRODUCTION_CONFIRMATION_REQUIRED");
  }
  const manifest =
    normalizeFounderPilotCurrent188ProductionUpgradeManifest(rawManifest);
  const plan = normalizePlan(rawPlan);
  if (!safeEqual(confirmPlanDigest, plan.planDigest)) {
    fail("CURRENT188_UPGRADE_PLAN_CONFIRMATION_MISMATCH");
  }
  assertPlanWindow(plan, manifest, currentDate(now));
  const approvalReceipt = verifyFounderPilotCurrent188ProductionUpgradeApproval(
    {
      approval,
      manifest,
      pinnedApprovalKeySpkiSha256,
      plan,
    },
  );
  for (const method of [
    "acquireLock",
    "inspectCurrent188SupportContract",
    "inspectFinal",
    "inspectTarget",
    "releaseLock",
  ]) {
    if (typeof adapter?.[method] !== "function") {
      fail("CURRENT188_UPGRADE_ADAPTER_INVALID");
    }
  }
  if (typeof deploy !== "function") fail("CURRENT188_UPGRADE_DEPLOY_INVALID");
  await emitPhase(onPhase, plan, "APPROVAL_VERIFIED", {
    approvalDigest: approvalReceipt.approvalDigest,
  });
  let lockHeld = false;
  try {
    await adapter.acquireLock();
    lockHeld = true;
    await emitPhase(onPhase, plan, "CONTROLLER_LOCK_ACQUIRED");
    const release = await inspectRelease({
      inspectArtifact,
      laneRoot,
      manifest,
      sourcePrismaRoot,
    });
    const existingFinal = await verifyFinal({
      adapter,
      lane: release.lane,
      manifest,
    });
    if (existingFinal !== null) {
      if (existingFinal.identityDigest !== plan.targetIdentityDigest) {
        fail("CURRENT188_UPGRADE_RECOVERY_IDENTITY_MISMATCH");
      }
      await emitPhase(onPhase, plan, "FINAL_188_VERIFIED", {
        deploymentAttempt: 0,
        recoveredFromLostResponse: true,
      });
      return Object.freeze({
        ...existingFinal,
        contractVersion: FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_CONTRACT,
        decision: FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_APPLIED,
        deploymentAttempt: 0,
        planDigest: plan.planDigest,
        reasonCode: null,
        recoveredFromLostResponse: true,
      });
    }
    const freshPlan = await buildFounderPilotCurrent188ProductionUpgradePlan({
      adapter,
      inspectArtifact,
      laneRoot,
      manifest,
      now: () => new Date(plan.plannedAt),
      sourcePrismaRoot,
    });
    if (!safeEqual(freshPlan.planDigest, plan.planDigest)) {
      fail("CURRENT188_UPGRADE_FRESH_PLAN_MISMATCH");
    }
    let attempt = 1;
    let recoveredFromLostResponse = false;
    while (attempt <= 2) {
      await emitPhase(onPhase, plan, "PRISMA_DEPLOY_INTENT_DURABLE", {
        attempt,
        targetMigrationSha256: TARGET_MIGRATION_SHA256,
      });
      const result = await deploy({
        attempt,
        databaseUrlRedactionRequired: true,
        laneRoot,
        timeoutSeconds: manifest.operation.deployTimeoutSeconds,
      });
      await emitPhase(
        onPhase,
        plan,
        result?.status === "SUCCEEDED"
          ? "PRISMA_DEPLOY_RESPONSE_SUCCEEDED"
          : result?.status === "FAILED"
            ? "PRISMA_DEPLOY_RESPONSE_FAILED"
            : "PRISMA_DEPLOY_RESPONSE_AMBIGUOUS",
        { attempt, deployment: boundedDeploymentEvidence(result) },
      );
      if (result?.status === "FAILED") {
        fail("CURRENT188_UPGRADE_PRISMA_DEPLOY_FAILED");
      }
      if (!["AMBIGUOUS", "SUCCEEDED"].includes(result?.status)) {
        fail("CURRENT188_UPGRADE_PRISMA_DEPLOY_RESULT_INVALID");
      }
      const final = await verifyFinal({
        adapter,
        lane: release.lane,
        manifest,
      });
      if (final !== null) {
        recoveredFromLostResponse = result.status === "AMBIGUOUS";
        await emitPhase(onPhase, plan, "FINAL_188_VERIFIED", {
          deploymentAttempt: attempt,
          recoveredFromLostResponse,
        });
        return Object.freeze({
          ...final,
          contractVersion: FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_CONTRACT,
          decision: FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_APPLIED,
          deploymentAttempt: attempt,
          planDigest: plan.planDigest,
          reasonCode: null,
          recoveredFromLostResponse,
        });
      }
      if (result.status === "SUCCEEDED") {
        fail("CURRENT188_UPGRADE_FINAL_STATE_NOT_REACHED");
      }
      const state = await adapter.inspectTarget();
      if (attempt !== 1 || !exactSourceState(state, release.lane)) {
        fail("CURRENT188_UPGRADE_PRISMA_DEPLOY_AMBIGUOUS");
      }
      attempt += 1;
    }
    fail("CURRENT188_UPGRADE_FINAL_STATE_NOT_REACHED");
  } finally {
    if (lockHeld) await adapter.releaseLock();
  }
}

export async function createFounderPilotCurrent188ProductionUpgradePgAdapter(
  databaseUrl,
  rawManifest,
  { productionConfirmation } = {},
) {
  if (
    productionConfirmation !==
    FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_CONFIRMATION
  ) {
    fail("CURRENT188_UPGRADE_PRODUCTION_CONFIRMATION_REQUIRED");
  }
  const manifest =
    normalizeFounderPilotCurrent188ProductionUpgradeManifest(rawManifest);
  return createFounderPilotProductionHistoryProductionPgAdapter(
    databaseUrl,
    toLegacyManifest(manifest),
    {
      productionConfirmation:
        FOUNDER_PILOT_PRODUCTION_HISTORY_PRODUCTION_CONFIRMATION,
    },
  );
}

export const FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_CONSTANTS =
  Object.freeze({
    sourceMigrationCount: SOURCE_COUNT,
    sourceMigrationHead: SOURCE_HEAD,
    targetMigrationCount: TARGET_COUNT,
    targetMigrationHead: TARGET_HEAD,
    targetMigrationSha256: TARGET_MIGRATION_SHA256,
    targetPreterminalManifestSha256: TARGET_PRETERMINAL_MANIFEST_SHA256,
    targetWorkerFunctionSha256: TARGET_WORKER_FUNCTION_SHA256,
  });

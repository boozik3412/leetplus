import {
  createHash,
  createPrivateKey,
  createPublicKey,
  randomBytes,
  randomUUID,
  sign,
  timingSafeEqual,
  verify,
} from "node:crypto";
import { spawn } from "node:child_process";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  normalizeCurrentReleaseTarget,
  verifyCurrentReleaseArtifact,
} from "./current-release-restored-copy-runtime-acceptance.mjs";
import {
  createGuestSupportCurrent189ProductionBridgeRuntimeAdapter,
  guestSupportCurrent189BridgeAttestationDigest,
  guestSupportCurrent189BridgeAttestationInvariant,
  normalizeGuestSupportCurrent189BridgeAttestation,
} from "./founder-pilot-current188-production-upgrade.mjs";

export const GUEST_SUPPORT_CURRENT189_PRODUCTION_UPGRADE_CONTRACT =
  "GUEST_SUPPORT_PRODUCTION_188_TO_189_V1";
export const GUEST_SUPPORT_CURRENT189_PRODUCTION_UPGRADE_CONFIRMATION =
  "I_ACCEPT_EXACT_GUEST_SUPPORT_188_TO_189_V1";
export const GUEST_SUPPORT_CURRENT189_PRODUCTION_UPGRADE_PLAN_READY =
  "CURRENT189_UPGRADE_PLAN_READY";
export const GUEST_SUPPORT_CURRENT189_PRODUCTION_UPGRADE_APPLIED =
  "CURRENT189_UPGRADE_APPLIED";

const SOURCE_COUNT = 188;
const SOURCE_HEAD = "20260828190000_guest_support_bug_reports";
const TARGET_COUNT = 189;
const TARGET_HEAD = "20260831120000_guest_support_bug_report_input_repair";
const TARGET_MIGRATION_SHA256 =
  "5ef51551b6f2415584dd11202d88cb2d4102f622ca5d248b9393fcf372f8ec82";
const SOURCE_CONSTRAINT =
  "CHECK (length(description) >= 30 AND length(description) <= 2000)";
const TARGET_CONSTRAINT =
  "CHECK (length(description) >= 20 AND length(description) <= 2000)";
const SOURCE_WORKER_FUNCTION_SHA256 =
  "1e4f4c3c288fff2b75a9492f3155e0239bfbcdca644a56bee39dd0f0309508c0";
const TARGET_WORKER_FUNCTION_SHA256 =
  "65da5ae25f33b473d662ed7668b34e8ac100e258b1ba653b4f9414717a5e9a88";
const SOURCE_WORKER_COMMENT =
  "Fail-closed identity mail worker readiness receipt bound to exact CURRENT_188 while preserving the approved CURRENT_185 preterminal digest boundary.";
const TARGET_WORKER_COMMENT =
  "Fail-closed identity mail worker readiness receipt bound to exact CURRENT_189 while preserving the approved CURRENT_185 preterminal digest boundary.";
const SOURCE_PHASE = "SOURCE_188";
const TARGET_PHASE = "TARGET_189";
const TIMER_UNIT = "leetplus-bonus-ledger-worker.timer";
const WORKER_UNIT = "leetplus-bonus-ledger-worker.service";
const SHA256 = /^[0-9a-f]{64}$/u;
const SHA40 = /^[0-9a-f]{40}$/u;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const BASE64URL_SIGNATURE = /^[A-Za-z0-9_-]{86}$/u;

export class GuestSupportCurrent189ProductionUpgradeError extends Error {
  constructor(reasonCode) {
    super(reasonCode);
    this.name = "GuestSupportCurrent189ProductionUpgradeError";
    this.reasonCode = reasonCode;
    this.safeContractError = true;
  }
}

function fail(reasonCode) {
  throw new GuestSupportCurrent189ProductionUpgradeError(reasonCode);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(domain, value) {
  return sha256(
    `${GUEST_SUPPORT_CURRENT189_PRODUCTION_UPGRADE_CONTRACT}\0${domain}\0${stableJson(value)}`,
  );
}

function exactRecord(value, keys, reasonCode) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.keys(value).sort().join("\0") !== [...keys].sort().join("\0")
  ) {
    fail(reasonCode);
  }
  return value;
}

function exactString(value, pattern, reasonCode) {
  if (typeof value !== "string" || value.trim() !== value || !pattern.test(value)) {
    fail(reasonCode);
  }
  return value;
}

function exactInteger(value, minimum, maximum, reasonCode) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail(reasonCode);
  }
  return value;
}

function currentDate(now) {
  const value = now();
  if (!(value instanceof Date) || !Number.isFinite(value.valueOf())) {
    fail("CURRENT189_UPGRADE_CLOCK_INVALID");
  }
  return value;
}

function safeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function canonicalPublicKey(pem, expectedDigest) {
  let key;
  try {
    key = createPublicKey(pem);
  } catch {
    fail("CURRENT189_UPGRADE_APPROVAL_KEY_INVALID");
  }
  if (
    key.asymmetricKeyType !== "ed25519" ||
    sha256(key.export({ format: "der", type: "spki" })) !== expectedDigest
  ) {
    fail("CURRENT189_UPGRADE_APPROVAL_KEY_INVALID");
  }
  return key;
}

export function normalizeGuestSupportCurrent189ProductionUpgradeManifest(value) {
  const manifest = exactRecord(
    value,
    ["approval", "contractVersion", "operation", "release", "target"],
    "CURRENT189_UPGRADE_MANIFEST_INVALID",
  );
  if (manifest.contractVersion !== GUEST_SUPPORT_CURRENT189_PRODUCTION_UPGRADE_CONTRACT) {
    fail("CURRENT189_UPGRADE_CONTRACT_INVALID");
  }
  const approval = exactRecord(
    manifest.approval,
    ["keyId", "maxPlanAgeSeconds", "publicKeyPem", "publicKeySpkiSha256"],
    "CURRENT189_UPGRADE_APPROVAL_CONFIG_INVALID",
  );
  const release = exactRecord(
    manifest.release,
    ["artifactRoot", "releaseSha"],
    "CURRENT189_UPGRADE_RELEASE_INVALID",
  );
  const target = exactRecord(
    manifest.target,
    ["databaseName", "port", "socketDirectory", "systemIdentifier"],
    "CURRENT189_UPGRADE_TARGET_INVALID",
  );
  const operation = exactRecord(
    manifest.operation,
    ["timeoutSeconds"],
    "CURRENT189_UPGRADE_OPERATION_INVALID",
  );
  exactString(approval.keyId, /^[a-z0-9][a-z0-9._-]{2,63}$/u, "CURRENT189_UPGRADE_APPROVAL_CONFIG_INVALID");
  exactString(approval.publicKeySpkiSha256, SHA256, "CURRENT189_UPGRADE_APPROVAL_CONFIG_INVALID");
  canonicalPublicKey(approval.publicKeyPem, approval.publicKeySpkiSha256);
  exactInteger(approval.maxPlanAgeSeconds, 60, 1800, "CURRENT189_UPGRADE_APPROVAL_CONFIG_INVALID");
  exactString(release.releaseSha, SHA40, "CURRENT189_UPGRADE_RELEASE_INVALID");
  if (
    release.artifactRoot !== `/srv/leetplus/releases/${release.releaseSha}` ||
    !path.isAbsolute(release.artifactRoot)
  ) {
    fail("CURRENT189_UPGRADE_RELEASE_INVALID");
  }
  exactString(target.databaseName, /^[a-zA-Z_][a-zA-Z0-9_]{2,62}$/u, "CURRENT189_UPGRADE_TARGET_INVALID");
  exactString(target.systemIdentifier, /^[1-9][0-9]{8,24}$/u, "CURRENT189_UPGRADE_TARGET_INVALID");
  exactInteger(target.port, 1024, 65535, "CURRENT189_UPGRADE_TARGET_INVALID");
  if (
    !path.isAbsolute(target.socketDirectory) ||
    /[\u0000-\u0020\\]/u.test(target.socketDirectory)
  ) {
    fail("CURRENT189_UPGRADE_TARGET_INVALID");
  }
  exactInteger(operation.timeoutSeconds, 30, 300, "CURRENT189_UPGRADE_OPERATION_INVALID");
  return Object.freeze({
    approval: Object.freeze({ ...approval }),
    contractVersion: manifest.contractVersion,
    operation: Object.freeze({ ...operation }),
    release: Object.freeze({ ...release }),
    target: Object.freeze({ ...target }),
  });
}

function normalizeCriticalObject(value, reasonCode) {
  const object = exactRecord(
    value,
    ["acl", "oid", "owner"],
    reasonCode,
  );
  exactString(object.oid, /^[1-9][0-9]*$/u, reasonCode);
  exactString(object.owner, /^[a-zA-Z_][a-zA-Z0-9_-]{0,62}$/u, reasonCode);
  if (
    object.acl !== null &&
    (!Array.isArray(object.acl) ||
      object.acl.some((entry) => typeof entry !== "string") ||
      new Set(object.acl).size !== object.acl.length)
  ) {
    fail(reasonCode);
  }
  return Object.freeze({
    acl: object.acl === null ? null : Object.freeze([...object.acl].sort()),
    oid: object.oid,
    owner: object.owner,
  });
}

function summarizeRawInventory(raw) {
  const value = exactRecord(
    raw,
    [
      "appliedMigrations",
      "constraintDef",
      "constraintOid",
      "currentUser",
      "databaseName",
      "descriptionsBelow20",
      "historicalOwnership",
      "migrationCount",
      "migrationHead",
      "migrationTable",
      "roleMemberships",
      "rolledBackMigrations",
      "sessionUser",
      "systemIdentifier",
      "targetMigrationRows",
      "ticketTable",
      "unfinishedMigrationCount",
      "workerFunction",
      "workerFunctionComment",
      "workerFunctionSha256",
    ],
    "CURRENT189_UPGRADE_DATABASE_EVIDENCE_INVALID",
  );
  for (const key of [
    "appliedMigrations",
    "historicalOwnership",
    "roleMemberships",
    "rolledBackMigrations",
  ]) {
    if (!Array.isArray(value[key])) fail("CURRENT189_UPGRADE_DATABASE_EVIDENCE_INVALID");
  }
  const numeric = {};
  for (const key of [
    "descriptionsBelow20",
    "migrationCount",
    "targetMigrationRows",
    "unfinishedMigrationCount",
  ]) {
    numeric[key] = Number(value[key]);
    exactInteger(numeric[key], 0, 10_000_000, "CURRENT189_UPGRADE_DATABASE_EVIDENCE_INVALID");
  }
  const workerFunction = normalizeCriticalObject(
    value.workerFunction,
    "CURRENT189_UPGRADE_WORKER_FUNCTION_INVALID",
  );
  const ticketTable = normalizeCriticalObject(
    value.ticketTable,
    "CURRENT189_UPGRADE_TICKET_TABLE_INVALID",
  );
  const migrationTable = normalizeCriticalObject(
    value.migrationTable,
    "CURRENT189_UPGRADE_MIGRATION_TABLE_INVALID",
  );
  exactString(value.databaseName, /^[a-zA-Z_][a-zA-Z0-9_]{2,62}$/u, "CURRENT189_UPGRADE_DATABASE_EVIDENCE_INVALID");
  exactString(value.systemIdentifier, /^[1-9][0-9]{8,24}$/u, "CURRENT189_UPGRADE_DATABASE_EVIDENCE_INVALID");
  exactString(value.sessionUser, /^[a-zA-Z_][a-zA-Z0-9_-]{0,62}$/u, "CURRENT189_UPGRADE_DATABASE_EVIDENCE_INVALID");
  exactString(value.currentUser, /^[a-zA-Z_][a-zA-Z0-9_-]{0,62}$/u, "CURRENT189_UPGRADE_DATABASE_EVIDENCE_INVALID");
  exactString(value.constraintOid, /^[1-9][0-9]*$/u, "CURRENT189_UPGRADE_CONSTRAINT_INVALID");
  exactString(value.workerFunctionSha256, SHA256, "CURRENT189_UPGRADE_WORKER_FUNCTION_INVALID");
  if (
    typeof value.constraintDef !== "string" ||
    typeof value.workerFunctionComment !== "string" ||
    (value.migrationHead !== null && typeof value.migrationHead !== "string")
  ) {
    fail("CURRENT189_UPGRADE_DATABASE_EVIDENCE_INVALID");
  }
  const targetMigration = value.appliedMigrations.find(
    (row) => row?.name === TARGET_HEAD,
  );
  return Object.freeze({
    appliedMigrationManifestDigest: sha256(stableJson(value.appliedMigrations)),
    constraintDef: value.constraintDef,
    constraintOid: value.constraintOid,
    currentUser: value.currentUser,
    databaseName: value.databaseName,
    descriptionsBelow20: numeric.descriptionsBelow20,
    historicalOwnershipDigest: sha256(stableJson(value.historicalOwnership)),
    migrationCount: numeric.migrationCount,
    migrationHead: value.migrationHead,
    migrationTable,
    roleMembershipDigest: sha256(stableJson(value.roleMemberships)),
    rolledBackMigrationManifestDigest: sha256(
      stableJson(value.rolledBackMigrations),
    ),
    sessionUser: value.sessionUser,
    systemIdentifier: value.systemIdentifier,
    targetMigration:
      targetMigration && typeof targetMigration === "object"
        ? Object.freeze({
            appliedStepsCount: Number(targetMigration.appliedStepsCount),
            checksum: targetMigration.checksum,
            finished: targetMigration.finished === true,
            name: targetMigration.name,
            rolledBack: targetMigration.rolledBack === true,
          })
        : null,
    targetMigrationRows: numeric.targetMigrationRows,
    ticketTable,
    unfinishedMigrationCount: numeric.unfinishedMigrationCount,
    workerFunction,
    workerFunctionComment: value.workerFunctionComment,
    workerFunctionSha256: value.workerFunctionSha256,
  });
}

function exactTargetIdentity(evidence, manifest) {
  return (
    evidence.databaseName === manifest.target.databaseName &&
    evidence.systemIdentifier === manifest.target.systemIdentifier &&
    evidence.sessionUser === "postgres" &&
    evidence.currentUser === "postgres"
  );
}

function exactSourceState(evidence, manifest) {
  return (
    exactTargetIdentity(evidence, manifest) &&
    evidence.migrationCount === SOURCE_COUNT &&
    evidence.migrationHead === SOURCE_HEAD &&
    evidence.unfinishedMigrationCount === 0 &&
    evidence.targetMigrationRows === 0 &&
    evidence.targetMigration === null &&
    evidence.constraintDef === SOURCE_CONSTRAINT &&
    evidence.descriptionsBelow20 === 0 &&
    evidence.workerFunctionSha256 === SOURCE_WORKER_FUNCTION_SHA256 &&
    evidence.workerFunctionComment === SOURCE_WORKER_COMMENT
  );
}

function preservedDatabaseState(source, target) {
  return (
    target.ticketTable.oid === source.ticketTable.oid &&
    stableJson(target.ticketTable.acl) === stableJson(source.ticketTable.acl) &&
    target.ticketTable.owner === source.ticketTable.owner &&
    target.migrationTable.oid === source.migrationTable.oid &&
    stableJson(target.migrationTable.acl) === stableJson(source.migrationTable.acl) &&
    target.migrationTable.owner === source.migrationTable.owner &&
    target.workerFunction.oid === source.workerFunction.oid &&
    stableJson(target.workerFunction.acl) === stableJson(source.workerFunction.acl) &&
    target.workerFunction.owner === source.workerFunction.owner &&
    target.historicalOwnershipDigest === source.historicalOwnershipDigest &&
    target.roleMembershipDigest === source.roleMembershipDigest &&
    target.rolledBackMigrationManifestDigest ===
      source.rolledBackMigrationManifestDigest
  );
}

function exactFinalState(evidence, source, manifest) {
  return (
    exactTargetIdentity(evidence, manifest) &&
    evidence.migrationCount === TARGET_COUNT &&
    evidence.migrationHead === TARGET_HEAD &&
    evidence.unfinishedMigrationCount === 0 &&
    evidence.targetMigrationRows === 1 &&
    evidence.targetMigration?.name === TARGET_HEAD &&
    evidence.targetMigration?.checksum === TARGET_MIGRATION_SHA256 &&
    evidence.targetMigration?.finished === true &&
    evidence.targetMigration?.rolledBack === false &&
    evidence.targetMigration?.appliedStepsCount === 1 &&
    evidence.constraintDef === TARGET_CONSTRAINT &&
    evidence.descriptionsBelow20 === 0 &&
    evidence.workerFunctionSha256 === TARGET_WORKER_FUNCTION_SHA256 &&
    evidence.workerFunctionComment === TARGET_WORKER_COMMENT &&
    preservedDatabaseState(source, evidence)
  );
}

async function inspectArtifactAuthority(manifest, verifier = verifyCurrentReleaseArtifact) {
  const artifact = await verifier({
    artifactRoot: manifest.release.artifactRoot,
    expected: normalizeCurrentReleaseTarget({
      expectedMigrationCount: TARGET_COUNT,
      expectedMigrationHead: TARGET_HEAD,
      expectedSystemIdentifier: manifest.target.systemIdentifier,
      releaseSha: manifest.release.releaseSha,
      tenantSlug: "production-authority-only",
    }),
  });
  const migrationPath = path.join(
    manifest.release.artifactRoot,
    "packages/database/prisma/migrations",
    TARGET_HEAD,
    "migration.sql",
  );
  const [metadata, canonicalPath, migrationBytes] = await Promise.all([
    lstat(migrationPath, { bigint: true }).catch(() => null),
    realpath(migrationPath).catch(() => null),
    readFile(migrationPath).catch(() => null),
  ]);
  if (
    !metadata?.isFile() ||
    metadata.isSymbolicLink() ||
    metadata.uid !== 0n ||
    metadata.nlink !== 1n ||
    (metadata.mode & 0o022n) !== 0n ||
    canonicalPath !== migrationPath ||
    !Buffer.isBuffer(migrationBytes) ||
    sha256(migrationBytes) !== TARGET_MIGRATION_SHA256
  ) {
    fail("CURRENT189_UPGRADE_ARTIFACT_MIGRATION_MISMATCH");
  }
  return Object.freeze({
    buildId: artifact.buildId,
    hydratedManifestDigest: artifact.hydratedManifestDigest,
    hydrationReceiptDigest: artifact.hydrationReceiptDigest,
    manifestDigest: artifact.manifestDigest,
    provenanceDigest: artifact.provenanceDigest,
    symlinkTopologyDigest: artifact.symlinkTopologyDigest,
  });
}

function databaseEvidenceDigest(evidence) {
  return digest("database-evidence", evidence);
}

function artifactEvidenceDigest(evidence) {
  return digest("artifact-evidence", evidence);
}

function normalizePlan(value) {
  const plan = exactRecord(
    value,
    [
      "approvalKeyId",
      "approvalKeySpkiSha256",
      "artifactEvidence",
      "artifactEvidenceDigest",
      "bridgeAttestation",
      "bridgeAttestationDigest",
      "contractVersion",
      "decision",
      "expiresAt",
      "planDigest",
      "plannedAt",
      "productionManifestDigest",
      "releaseSha",
      "sourceDatabaseEvidence",
      "sourceDatabaseEvidenceDigest",
      "sourceMigrationCount",
      "sourceSchemaHead",
      "targetMigrationCount",
      "targetMigrationSha256",
      "targetSchemaHead",
    ],
    "CURRENT189_UPGRADE_PLAN_INVALID",
  );
  if (
    plan.contractVersion !== GUEST_SUPPORT_CURRENT189_PRODUCTION_UPGRADE_CONTRACT ||
    plan.decision !== GUEST_SUPPORT_CURRENT189_PRODUCTION_UPGRADE_PLAN_READY ||
    !SHA40.test(plan.releaseSha ?? "") ||
    ![
      plan.approvalKeySpkiSha256,
      plan.artifactEvidenceDigest,
      plan.bridgeAttestationDigest,
      plan.planDigest,
      plan.productionManifestDigest,
      plan.sourceDatabaseEvidenceDigest,
      plan.targetMigrationSha256,
    ].every((candidate) => SHA256.test(candidate ?? "")) ||
    !ISO_TIMESTAMP.test(plan.plannedAt ?? "") ||
    !ISO_TIMESTAMP.test(plan.expiresAt ?? "") ||
    plan.sourceMigrationCount !== SOURCE_COUNT ||
    plan.sourceSchemaHead !== SOURCE_HEAD ||
    plan.targetMigrationCount !== TARGET_COUNT ||
    plan.targetSchemaHead !== TARGET_HEAD ||
    plan.targetMigrationSha256 !== TARGET_MIGRATION_SHA256
  ) {
    fail("CURRENT189_UPGRADE_PLAN_INVALID");
  }
  const { planDigest, ...base } = plan;
  if (!safeEqual(planDigest, digest("production-plan", base))) {
    fail("CURRENT189_UPGRADE_PLAN_INVALID");
  }
  return Object.freeze({ ...plan });
}

export async function inspectGuestSupportCurrent189ProductionUpgradeInventory({
  adapter,
  artifactInspector = inspectArtifactAuthority,
  manifest: rawManifest,
  verifyArtifact = verifyCurrentReleaseArtifact,
}) {
  const manifest = normalizeGuestSupportCurrent189ProductionUpgradeManifest(rawManifest);
  if (
    typeof adapter?.inspect !== "function" ||
    typeof artifactInspector !== "function"
  ) {
    fail("CURRENT189_UPGRADE_ADAPTER_INVALID");
  }
  const [rawEvidence, artifactEvidence] = await Promise.all([
    adapter.inspect(),
    artifactInspector(manifest, verifyArtifact),
  ]);
  const evidence = summarizeRawInventory(rawEvidence);
  if (!exactSourceState(evidence, manifest)) {
    fail("CURRENT189_UPGRADE_SOURCE_STATE_MISMATCH");
  }
  return Object.freeze({
    artifactEvidenceDigest: artifactEvidenceDigest(artifactEvidence),
    contractVersion: GUEST_SUPPORT_CURRENT189_PRODUCTION_UPGRADE_CONTRACT,
    databaseEvidenceDigest: databaseEvidenceDigest(evidence),
    decision: "CURRENT189_UPGRADE_INVENTORY_READY_NOT_AUTHORIZATION",
    migrationCount: evidence.migrationCount,
    migrationHead: evidence.migrationHead,
    targetMigrationSha256: TARGET_MIGRATION_SHA256,
  });
}

export async function buildGuestSupportCurrent189ProductionUpgradePlan({
  adapter,
  artifactInspector = inspectArtifactAuthority,
  manifest: rawManifest,
  now = () => new Date(),
  runtimeAdapter,
  verifyArtifact = verifyCurrentReleaseArtifact,
}) {
  const manifest = normalizeGuestSupportCurrent189ProductionUpgradeManifest(rawManifest);
  if (
    typeof adapter?.inspect !== "function" ||
    typeof artifactInspector !== "function"
  ) {
    fail("CURRENT189_UPGRADE_ADAPTER_INVALID");
  }
  for (const method of ["acquireLock", "inspectSource", "releaseLock"]) {
    if (typeof runtimeAdapter?.[method] !== "function") {
      fail("CURRENT189_UPGRADE_RUNTIME_ADAPTER_INVALID");
    }
  }
  const plannedAt = currentDate(now);
  await runtimeAdapter.acquireLock();
  try {
    const [rawEvidence, artifactEvidence, rawBridgeAttestation] = await Promise.all([
      adapter.inspect(),
      artifactInspector(manifest, verifyArtifact),
      runtimeAdapter.inspectSource(),
    ]);
    const evidence = summarizeRawInventory(rawEvidence);
    if (!exactSourceState(evidence, manifest)) {
      fail("CURRENT189_UPGRADE_SOURCE_STATE_MISMATCH");
    }
    const bridgeAttestation = normalizeGuestSupportCurrent189BridgeAttestation(
      rawBridgeAttestation,
      { expectedPhase: SOURCE_PHASE, expectedReleaseSha: manifest.release.releaseSha },
    );
    const base = {
      approvalKeyId: manifest.approval.keyId,
      approvalKeySpkiSha256: manifest.approval.publicKeySpkiSha256,
      artifactEvidence,
      artifactEvidenceDigest: artifactEvidenceDigest(artifactEvidence),
      bridgeAttestation,
      bridgeAttestationDigest: guestSupportCurrent189BridgeAttestationDigest(
        bridgeAttestation,
        { expectedPhase: SOURCE_PHASE, expectedReleaseSha: manifest.release.releaseSha },
      ),
      contractVersion: GUEST_SUPPORT_CURRENT189_PRODUCTION_UPGRADE_CONTRACT,
      decision: GUEST_SUPPORT_CURRENT189_PRODUCTION_UPGRADE_PLAN_READY,
      expiresAt: new Date(
        plannedAt.valueOf() + manifest.approval.maxPlanAgeSeconds * 1000,
      ).toISOString(),
      plannedAt: plannedAt.toISOString(),
      productionManifestDigest: digest("production-manifest", manifest),
      releaseSha: manifest.release.releaseSha,
      sourceDatabaseEvidence: evidence,
      sourceDatabaseEvidenceDigest: databaseEvidenceDigest(evidence),
      sourceMigrationCount: SOURCE_COUNT,
      sourceSchemaHead: SOURCE_HEAD,
      targetMigrationCount: TARGET_COUNT,
      targetMigrationSha256: TARGET_MIGRATION_SHA256,
      targetSchemaHead: TARGET_HEAD,
    };
    return Object.freeze({ ...base, planDigest: digest("production-plan", base) });
  } finally {
    await runtimeAdapter.releaseLock();
  }
}

function approvalPayload(plan) {
  return Buffer.from(
    `${GUEST_SUPPORT_CURRENT189_PRODUCTION_UPGRADE_CONTRACT}\0approval\0${plan.planDigest}`,
  );
}

export function signGuestSupportCurrent189ProductionUpgradePlan({
  manifest: rawManifest,
  plan: rawPlan,
  privateKeyPem,
}) {
  const manifest = normalizeGuestSupportCurrent189ProductionUpgradeManifest(rawManifest);
  const plan = normalizePlan(rawPlan);
  let privateKey;
  try {
    privateKey = createPrivateKey(privateKeyPem);
  } catch {
    fail("CURRENT189_UPGRADE_PRIVATE_KEY_INVALID");
  }
  if (
    privateKey.asymmetricKeyType !== "ed25519" ||
    sha256(createPublicKey(privateKey).export({ format: "der", type: "spki" })) !==
      manifest.approval.publicKeySpkiSha256
  ) {
    fail("CURRENT189_UPGRADE_PRIVATE_KEY_INVALID");
  }
  return Object.freeze({
    algorithm: "Ed25519",
    contractVersion: GUEST_SUPPORT_CURRENT189_PRODUCTION_UPGRADE_CONTRACT,
    keyId: manifest.approval.keyId,
    planDigest: plan.planDigest,
    signature: sign(null, approvalPayload(plan), privateKey).toString("base64url"),
  });
}

function verifyApproval({ approval, manifest, pinnedApprovalKeySpkiSha256, plan }) {
  const receipt = exactRecord(
    approval,
    ["algorithm", "contractVersion", "keyId", "planDigest", "signature"],
    "CURRENT189_UPGRADE_APPROVAL_INVALID",
  );
  if (
    receipt.algorithm !== "Ed25519" ||
    receipt.contractVersion !== GUEST_SUPPORT_CURRENT189_PRODUCTION_UPGRADE_CONTRACT ||
    receipt.keyId !== manifest.approval.keyId ||
    receipt.planDigest !== plan.planDigest ||
    !BASE64URL_SIGNATURE.test(receipt.signature ?? "") ||
    pinnedApprovalKeySpkiSha256 !== manifest.approval.publicKeySpkiSha256 ||
    !verify(
      null,
      approvalPayload(plan),
      canonicalPublicKey(
        manifest.approval.publicKeyPem,
        manifest.approval.publicKeySpkiSha256,
      ),
      Buffer.from(receipt.signature, "base64url"),
    )
  ) {
    fail("CURRENT189_UPGRADE_APPROVAL_INVALID");
  }
  return digest("approval", receipt);
}

function assertPlanWindow(plan, manifest, now) {
  const plannedAt = new Date(plan.plannedAt);
  const expiresAt = new Date(plan.expiresAt);
  if (
    !Number.isFinite(plannedAt.valueOf()) ||
    !Number.isFinite(expiresAt.valueOf()) ||
    expiresAt.valueOf() - plannedAt.valueOf() !==
      manifest.approval.maxPlanAgeSeconds * 1000 ||
    now.valueOf() < plannedAt.valueOf() - 5_000 ||
    now.valueOf() > expiresAt.valueOf()
  ) {
    fail("CURRENT189_UPGRADE_PLAN_EXPIRED");
  }
}

async function emitPhase(onPhase, plan, phase, extra = {}) {
  if (typeof onPhase !== "function") fail("CURRENT189_UPGRADE_PHASE_JOURNAL_REQUIRED");
  await onPhase(
    Object.freeze({
      contractVersion: GUEST_SUPPORT_CURRENT189_PRODUCTION_UPGRADE_CONTRACT,
      phase,
      planDigest: plan.planDigest,
      ...extra,
    }),
  );
}

function bridgeInvariantExact(source, target) {
  return (
    stableJson(guestSupportCurrent189BridgeAttestationInvariant(source)) ===
    stableJson(guestSupportCurrent189BridgeAttestationInvariant(target))
  );
}

export async function applyGuestSupportCurrent189ProductionUpgradePlan({
  adapter,
  approval,
  artifactInspector = inspectArtifactAuthority,
  confirmPlanDigest,
  executor,
  manifest: rawManifest,
  now = () => new Date(),
  onPhase,
  pinnedApprovalKeySpkiSha256,
  plan: rawPlan,
  productionConfirmation,
  runtimeAdapter,
  verifyArtifact = verifyCurrentReleaseArtifact,
  workerSafetyAdapter,
}) {
  if (productionConfirmation !== GUEST_SUPPORT_CURRENT189_PRODUCTION_UPGRADE_CONFIRMATION) {
    fail("CURRENT189_UPGRADE_PRODUCTION_CONFIRMATION_REQUIRED");
  }
  const manifest = normalizeGuestSupportCurrent189ProductionUpgradeManifest(rawManifest);
  const plan = normalizePlan(rawPlan);
  if (!safeEqual(confirmPlanDigest, plan.planDigest)) {
    fail("CURRENT189_UPGRADE_PLAN_CONFIRMATION_MISMATCH");
  }
  assertPlanWindow(plan, manifest, currentDate(now));
  const approvalDigest = verifyApproval({
    approval,
    manifest,
    pinnedApprovalKeySpkiSha256,
    plan,
  });
  for (const method of ["inspect"]) {
    if (typeof adapter?.[method] !== "function") fail("CURRENT189_UPGRADE_ADAPTER_INVALID");
  }
  if (typeof artifactInspector !== "function") fail("CURRENT189_UPGRADE_ADAPTER_INVALID");
  for (const method of ["migrate"]) {
    if (typeof executor?.[method] !== "function") fail("CURRENT189_UPGRADE_EXECUTOR_INVALID");
  }
  for (const method of ["acquireLock", "inspectSource", "inspectTarget", "releaseLock"]) {
    if (typeof runtimeAdapter?.[method] !== "function") fail("CURRENT189_UPGRADE_RUNTIME_ADAPTER_INVALID");
  }
  for (const method of ["quiesce", "restore"]) {
    if (typeof workerSafetyAdapter?.[method] !== "function") {
      fail("CURRENT189_UPGRADE_WORKER_SAFETY_ADAPTER_INVALID");
    }
  }
  await emitPhase(onPhase, plan, "APPROVAL_VERIFIED", { approvalDigest });
  let runtimeLockHeld = false;
  let workerState = null;
  try {
    await runtimeAdapter.acquireLock();
    runtimeLockHeld = true;
    await emitPhase(onPhase, plan, "PRODUCTION_CONTROL_AND_CUTOVER_LOCKS_ACQUIRED");
    const [artifactEvidence, rawCurrent] = await Promise.all([
      artifactInspector(manifest, verifyArtifact),
      adapter.inspect(),
    ]);
    const current = summarizeRawInventory(rawCurrent);
    if (
      digest("production-manifest", manifest) !== plan.productionManifestDigest ||
      artifactEvidenceDigest(artifactEvidence) !== plan.artifactEvidenceDigest
    ) {
      fail("CURRENT189_UPGRADE_FRESH_PLAN_MISMATCH");
    }
    if (exactFinalState(current, plan.sourceDatabaseEvidence, manifest)) {
      const recoveredBridge = normalizeGuestSupportCurrent189BridgeAttestation(
        await runtimeAdapter.inspectTarget(),
        { expectedPhase: TARGET_PHASE, expectedReleaseSha: manifest.release.releaseSha },
      );
      const plannedBridge = normalizeGuestSupportCurrent189BridgeAttestation(
        plan.bridgeAttestation,
        { expectedPhase: SOURCE_PHASE, expectedReleaseSha: manifest.release.releaseSha },
      );
      if (!bridgeInvariantExact(plannedBridge, recoveredBridge)) {
        fail("CURRENT189_UPGRADE_BRIDGE_TARGET_STATE_MISMATCH");
      }
      const recoveredBridgeDigest =
        guestSupportCurrent189BridgeAttestationDigest(recoveredBridge, {
          expectedPhase: TARGET_PHASE,
          expectedReleaseSha: manifest.release.releaseSha,
        });
      await emitPhase(onPhase, plan, "FINAL_189_AND_DUAL_SLOT_RUNTIME_VERIFIED", {
        bridgeAttestationDigest: recoveredBridgeDigest,
        recoveredFromLostResponse: true,
      });
      return Object.freeze({
        bridgeAttestationDigest: recoveredBridgeDigest,
        contractVersion: GUEST_SUPPORT_CURRENT189_PRODUCTION_UPGRADE_CONTRACT,
        databaseEvidenceDigest: databaseEvidenceDigest(current),
        decision: GUEST_SUPPORT_CURRENT189_PRODUCTION_UPGRADE_APPLIED,
        migrationCount: TARGET_COUNT,
        migrationHead: TARGET_HEAD,
        planDigest: plan.planDigest,
        reasonCode: null,
        recoveredFromLostResponse: true,
        releaseSha: manifest.release.releaseSha,
      });
    }
    const source = current;
    const rawBridge = await runtimeAdapter.inspectSource();
    const bridge = normalizeGuestSupportCurrent189BridgeAttestation(rawBridge, {
      expectedPhase: SOURCE_PHASE,
      expectedReleaseSha: manifest.release.releaseSha,
    });
    if (
      databaseEvidenceDigest(source) !== plan.sourceDatabaseEvidenceDigest ||
      stableJson(source) !== stableJson(plan.sourceDatabaseEvidence) ||
      stableJson(bridge) !== stableJson(plan.bridgeAttestation) ||
      !exactSourceState(source, manifest)
    ) {
      fail("CURRENT189_UPGRADE_FRESH_PLAN_MISMATCH");
    }
    await emitPhase(onPhase, plan, "SOURCE_188_AND_DUAL_SLOT_BRIDGE_VERIFIED");
    workerState = await workerSafetyAdapter.quiesce();
    await emitPhase(onPhase, plan, "BONUS_LEDGER_WORKER_QUIESCED", {
      timerWasActive: workerState.timerWasActive === true,
    });
    await emitPhase(onPhase, plan, "PRIVILEGED_MIGRATION_INTENT_DURABLE", {
      targetMigrationSha256: TARGET_MIGRATION_SHA256,
    });
    const result = await executor.migrate({
      artifactRoot: manifest.release.artifactRoot,
      source,
      target: manifest.target,
      timeoutSeconds: manifest.operation.timeoutSeconds,
    });
    await emitPhase(onPhase, plan, "PRIVILEGED_MIGRATION_RESPONSE", {
      status: result?.status ?? null,
    });
    if (!["AMBIGUOUS", "SUCCEEDED"].includes(result?.status)) {
      fail("CURRENT189_UPGRADE_MIGRATION_FAILED");
    }
    const final = summarizeRawInventory(await adapter.inspect());
    if (!exactFinalState(final, source, manifest)) {
      fail("CURRENT189_UPGRADE_FINAL_DATABASE_STATE_NOT_REACHED");
    }
    const targetBridge = normalizeGuestSupportCurrent189BridgeAttestation(
      await runtimeAdapter.inspectTarget(),
      { expectedPhase: TARGET_PHASE, expectedReleaseSha: manifest.release.releaseSha },
    );
    if (!bridgeInvariantExact(bridge, targetBridge)) {
      fail("CURRENT189_UPGRADE_BRIDGE_TARGET_STATE_MISMATCH");
    }
    await emitPhase(onPhase, plan, "FINAL_189_AND_DUAL_SLOT_RUNTIME_VERIFIED", {
      bridgeAttestationDigest: guestSupportCurrent189BridgeAttestationDigest(
        targetBridge,
        { expectedPhase: TARGET_PHASE, expectedReleaseSha: manifest.release.releaseSha },
      ),
      recoveredFromLostResponse: result.status === "AMBIGUOUS",
    });
    return Object.freeze({
      bridgeAttestationDigest: guestSupportCurrent189BridgeAttestationDigest(
        targetBridge,
        { expectedPhase: TARGET_PHASE, expectedReleaseSha: manifest.release.releaseSha },
      ),
      contractVersion: GUEST_SUPPORT_CURRENT189_PRODUCTION_UPGRADE_CONTRACT,
      databaseEvidenceDigest: databaseEvidenceDigest(final),
      decision: GUEST_SUPPORT_CURRENT189_PRODUCTION_UPGRADE_APPLIED,
      migrationCount: TARGET_COUNT,
      migrationHead: TARGET_HEAD,
      planDigest: plan.planDigest,
      reasonCode: null,
      recoveredFromLostResponse: result.status === "AMBIGUOUS",
      releaseSha: manifest.release.releaseSha,
    });
  } finally {
    if (workerState !== null) {
      await workerSafetyAdapter.restore(workerState);
    }
    if (runtimeLockHeld) await runtimeAdapter.releaseLock();
  }
}

export async function verifyGuestSupportCurrent189ProductionUpgradeFinal({
  adapter,
  manifest: rawManifest,
  plan: rawPlan,
  runtimeAdapter,
}) {
  const manifest = normalizeGuestSupportCurrent189ProductionUpgradeManifest(rawManifest);
  const plan = normalizePlan(rawPlan);
  if (
    plan.releaseSha !== manifest.release.releaseSha ||
    plan.productionManifestDigest !== digest("production-manifest", manifest)
  ) {
    fail("CURRENT189_UPGRADE_PLAN_INVALID");
  }
  for (const method of ["acquireLock", "inspectTarget", "releaseLock"]) {
    if (typeof runtimeAdapter?.[method] !== "function") fail("CURRENT189_UPGRADE_RUNTIME_ADAPTER_INVALID");
  }
  await runtimeAdapter.acquireLock();
  try {
    const final = summarizeRawInventory(await adapter.inspect());
    if (!exactFinalState(final, plan.sourceDatabaseEvidence, manifest)) {
      fail("CURRENT189_UPGRADE_FINAL_DATABASE_STATE_NOT_REACHED");
    }
    const sourceBridge = normalizeGuestSupportCurrent189BridgeAttestation(
      plan.bridgeAttestation,
      { expectedPhase: SOURCE_PHASE, expectedReleaseSha: manifest.release.releaseSha },
    );
    const bridge = normalizeGuestSupportCurrent189BridgeAttestation(
      await runtimeAdapter.inspectTarget(),
      { expectedPhase: TARGET_PHASE, expectedReleaseSha: manifest.release.releaseSha },
    );
    if (!bridgeInvariantExact(sourceBridge, bridge)) {
      fail("CURRENT189_UPGRADE_BRIDGE_TARGET_STATE_MISMATCH");
    }
    return Object.freeze({
      bridgeAttestationDigest: guestSupportCurrent189BridgeAttestationDigest(
        bridge,
        { expectedPhase: TARGET_PHASE, expectedReleaseSha: manifest.release.releaseSha },
      ),
      databaseEvidenceDigest: databaseEvidenceDigest(final),
      migrationCount: final.migrationCount,
      migrationHead: final.migrationHead,
      planDigest: plan.planDigest,
    });
  } finally {
    await runtimeAdapter.releaseLock();
  }
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function inventorySql(target) {
  const targetName = sqlLiteral(TARGET_HEAD);
  return String.raw`
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '20s';
SET LOCAL idle_in_transaction_session_timeout = '25s';
DO $lock$ BEGIN PERFORM pg_catalog.pg_advisory_xact_lock(13577189, 188189); END $lock$;
WITH applied AS (
  SELECT migration_name AS name, checksum,
         finished_at IS NOT NULL AS finished,
         rolled_back_at IS NOT NULL AS "rolledBack",
         applied_steps_count AS "appliedStepsCount",
         started_at
  FROM public."_prisma_migrations"
  WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
), rolled_back AS (
  SELECT migration_name AS name, checksum,
         finished_at IS NOT NULL AS finished,
         rolled_back_at IS NOT NULL AS "rolledBack",
         applied_steps_count AS "appliedStepsCount",
         started_at
  FROM public."_prisma_migrations"
  WHERE rolled_back_at IS NOT NULL
), ticket AS (
  SELECT relation.oid, owner.rolname AS owner, relation.relacl
  FROM pg_catalog.pg_class relation
  JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
  JOIN pg_catalog.pg_roles owner ON owner.oid = relation.relowner
  WHERE namespace.nspname = 'public' AND relation.relname = 'GuestSupportTicket'
), migration_table AS (
  SELECT relation.oid, owner.rolname AS owner, relation.relacl
  FROM pg_catalog.pg_class relation
  JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
  JOIN pg_catalog.pg_roles owner ON owner.oid = relation.relowner
  WHERE namespace.nspname = 'public' AND relation.relname = '_prisma_migrations'
), worker AS (
  SELECT routine.oid, owner.rolname AS owner, routine.proacl,
         pg_catalog.pg_get_functiondef(routine.oid) AS definition,
         pg_catalog.obj_description(routine.oid, 'pg_proc') AS comment
  FROM pg_catalog.pg_proc routine
  JOIN pg_catalog.pg_roles owner ON owner.oid = routine.proowner
  WHERE routine.oid = 'public.identity_mail_delivery_worker_assert_v1(text)'::regprocedure
), target_constraint AS (
  SELECT constraint_row.oid,
         pg_catalog.pg_get_constraintdef(constraint_row.oid, true) AS definition
  FROM pg_catalog.pg_constraint constraint_row
  WHERE constraint_row.conname = 'guest_support_ticket_description_length_chk'
    AND constraint_row.conrelid = 'public."GuestSupportTicket"'::regclass
), historical_ownership AS (
  SELECT pg_catalog.jsonb_agg(row_value ORDER BY kind, identity) AS rows
  FROM (
    SELECT 'class' AS kind,
           relation.oid::text AS identity,
           pg_catalog.jsonb_build_object(
             'kind','class','identity',relation.oid::text,'name',relation.relname,
             'owner',owner.rolname,'acl',relation.relacl::text
           ) AS row_value
    FROM pg_catalog.pg_class relation
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid=relation.relnamespace
    JOIN pg_catalog.pg_roles owner ON owner.oid=relation.relowner
    WHERE namespace.nspname='public'
    UNION ALL
    SELECT 'function', routine.oid::text,
           pg_catalog.jsonb_build_object(
             'kind','function','identity',routine.oid::text,
             'name',routine.proname || '(' || pg_catalog.pg_get_function_identity_arguments(routine.oid) || ')',
             'owner',owner.rolname,'acl',routine.proacl::text
           )
    FROM pg_catalog.pg_proc routine
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid=routine.pronamespace
    JOIN pg_catalog.pg_roles owner ON owner.oid=routine.proowner
    WHERE namespace.nspname='public'
    UNION ALL
    SELECT 'type', type_row.oid::text,
           pg_catalog.jsonb_build_object(
             'kind','type','identity',type_row.oid::text,'name',type_row.typname,
             'owner',owner.rolname,'acl',type_row.typacl::text
           )
    FROM pg_catalog.pg_type type_row
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid=type_row.typnamespace
    JOIN pg_catalog.pg_roles owner ON owner.oid=type_row.typowner
    WHERE namespace.nspname='public'
  ) catalog
), memberships AS (
  SELECT pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'roleid',membership.roleid::text,'member',membership.member::text,
      'grantor',membership.grantor::text,'adminOption',membership.admin_option,
      'inheritOption',membership.inherit_option,'setOption',membership.set_option
    ) ORDER BY membership.roleid, membership.member, membership.grantor
  ) AS rows
  FROM pg_catalog.pg_auth_members membership
)
SELECT pg_catalog.jsonb_build_object(
  'appliedMigrations', COALESCE((
    SELECT pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'name',name,'checksum',checksum,'finished',finished,
        'rolledBack',"rolledBack",'appliedStepsCount',"appliedStepsCount"
      ) ORDER BY name COLLATE "C"
    ) FROM applied
  ), '[]'::jsonb),
  'constraintDef', target_constraint.definition,
  'constraintOid', target_constraint.oid::text,
  'currentUser', current_user,
  'databaseName', pg_catalog.current_database(),
  'descriptionsBelow20', (SELECT pg_catalog.count(*)::integer FROM public."GuestSupportTicket" WHERE pg_catalog.length(description) < 20),
  'historicalOwnership', COALESCE(historical_ownership.rows, '[]'::jsonb),
  'migrationCount', (SELECT pg_catalog.count(*)::integer FROM applied),
  'migrationHead', (SELECT name FROM applied ORDER BY started_at DESC, name DESC LIMIT 1),
  'migrationTable', pg_catalog.jsonb_build_object(
    'oid',migration_table.oid::text,'owner',migration_table.owner,
    'acl',CASE WHEN migration_table.relacl IS NULL THEN NULL ELSE pg_catalog.to_jsonb(migration_table.relacl::text[]) END
  ),
  'roleMemberships', COALESCE(memberships.rows, '[]'::jsonb),
  'rolledBackMigrations', COALESCE((
    SELECT pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'name',name,'checksum',checksum,'finished',finished,
        'rolledBack',"rolledBack",'appliedStepsCount',"appliedStepsCount"
      ) ORDER BY name COLLATE "C"
    ) FROM rolled_back
  ), '[]'::jsonb),
  'sessionUser', session_user,
  'systemIdentifier', (SELECT system_identifier::text FROM pg_catalog.pg_control_system()),
  'targetMigrationRows', (SELECT pg_catalog.count(*)::integer FROM public."_prisma_migrations" WHERE migration_name=${targetName}),
  'ticketTable', pg_catalog.jsonb_build_object(
    'oid',ticket.oid::text,'owner',ticket.owner,
    'acl',CASE WHEN ticket.relacl IS NULL THEN NULL ELSE pg_catalog.to_jsonb(ticket.relacl::text[]) END
  ),
  'unfinishedMigrationCount', (SELECT pg_catalog.count(*)::integer FROM public."_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL),
  'workerFunction', pg_catalog.jsonb_build_object(
    'oid',worker.oid::text,'owner',worker.owner,
    'acl',CASE WHEN worker.proacl IS NULL THEN NULL ELSE pg_catalog.to_jsonb(worker.proacl::text[]) END
  ),
  'workerFunctionComment', worker.comment,
  'workerFunctionSha256', pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(worker.definition,'UTF8')),'hex')
)
FROM ticket, migration_table, worker, target_constraint, historical_ownership, memberships;
COMMIT;
`;
}

async function trustedExecutable(filePath) {
  const [metadata, canonical] = await Promise.all([
    lstat(filePath, { bigint: true }).catch(() => null),
    realpath(filePath).catch(() => null),
  ]);
  if (
    !metadata?.isFile() ||
    metadata.isSymbolicLink() ||
    metadata.uid !== 0n ||
    metadata.nlink !== 1n ||
    (metadata.mode & 0o022n) !== 0n ||
    canonical !== filePath
  ) {
    fail("CURRENT189_UPGRADE_TRUSTED_EXECUTABLE_INVALID");
  }
  return canonical;
}

async function runPsql(target, sql, timeoutSeconds) {
  if (
    process.platform !== "linux" ||
    typeof process.geteuid !== "function" ||
    process.geteuid() !== 0
  ) {
    fail("CURRENT189_UPGRADE_PRIVILEGED_AUTHORITY_REQUIRED");
  }
  const [systemdRun, envPath, psql] = await Promise.all([
    trustedExecutable("/usr/bin/systemd-run"),
    trustedExecutable("/usr/bin/env"),
    trustedExecutable("/usr/lib/postgresql/16/bin/psql"),
  ]);
  const unit = `leetplus-current189-db-${randomBytes(8).toString("hex")}.service`;
  const args = [
    "--quiet",
    "--wait",
    "--collect",
    "--pipe",
    `--unit=${unit}`,
    "--service-type=exec",
    "--uid=postgres",
    "--gid=postgres",
    "--property=NoNewPrivileges=yes",
    "--property=PrivateTmp=yes",
    "--property=PrivateDevices=yes",
    "--property=ProtectSystem=strict",
    "--property=ProtectHome=yes",
    "--property=ProtectKernelTunables=yes",
    "--property=ProtectKernelModules=yes",
    "--property=ProtectKernelLogs=yes",
    "--property=ProtectControlGroups=yes",
    "--property=LockPersonality=yes",
    "--property=RestrictRealtime=yes",
    "--property=RestrictSUIDSGID=yes",
    "--property=RestrictAddressFamilies=AF_UNIX",
    "--property=CapabilityBoundingSet=",
    "--property=UMask=0077",
    `--property=RuntimeMaxSec=${timeoutSeconds}`,
    envPath,
    "-i",
    "PATH=/usr/sbin:/usr/bin:/sbin:/bin",
    "LANG=C.UTF-8",
    "LC_ALL=C.UTF-8",
    "TZ=UTC",
    psql,
    "--no-psqlrc",
    "--quiet",
    "--tuples-only",
    "--no-align",
    "--set=ON_ERROR_STOP=1",
    `--host=${target.socketDirectory}`,
    `--port=${target.port}`,
    "--username=postgres",
    `--dbname=${target.databaseName}`,
    "--file=-",
  ];
  const child = spawn(systemdRun, args, {
    env: {
      LANG: "C.UTF-8",
      LC_ALL: "C.UTF-8",
      PATH: "/usr/sbin:/usr/bin:/sbin:/bin",
      TZ: "UTC",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = Buffer.alloc(0);
  let stderr = Buffer.alloc(0);
  let outputLimitExceeded = false;
  const append = (current, chunk) => {
    const next = Buffer.concat([current, chunk]);
    if (next.length > 2 * 1024 * 1024) {
      outputLimitExceeded = true;
      child.kill("SIGKILL");
      return current;
    }
    return next;
  };
  child.stdout.on("data", (chunk) => {
    stdout = append(stdout, chunk);
  });
  child.stderr.on("data", (chunk) => {
    stderr = append(stderr, chunk);
  });
  child.stdin.end(sql);
  const result = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
  if (outputLimitExceeded) fail("CURRENT189_UPGRADE_PSQL_OUTPUT_LIMIT");
  return Object.freeze({
    exitCode: result.code,
    signal: result.signal,
    stderrBytes: stderr.length,
    stderrSha256: sha256(stderr),
    stdout,
    stdoutBytes: stdout.length,
    stdoutSha256: sha256(stdout),
    status: result.code === 0 && result.signal === null ? "SUCCEEDED" : "FAILED",
  });
}

export function createGuestSupportCurrent189ProductionPgAdapter(rawManifest) {
  const manifest = normalizeGuestSupportCurrent189ProductionUpgradeManifest(rawManifest);
  return Object.freeze({
    inspect: async () => {
      const result = await runPsql(
        manifest.target,
        inventorySql(manifest.target),
        manifest.operation.timeoutSeconds,
      );
      if (result.status !== "SUCCEEDED" || result.stderrBytes !== 0) {
        fail("CURRENT189_UPGRADE_DATABASE_INSPECTION_FAILED");
      }
      const rows = result.stdout
        .toString("utf8")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      if (rows.length !== 1) fail("CURRENT189_UPGRADE_DATABASE_INSPECTION_FAILED");
      try {
        return JSON.parse(rows[0]);
      } catch {
        fail("CURRENT189_UPGRADE_DATABASE_INSPECTION_FAILED");
      }
    },
  });
}

function migrationBody(rawMigration) {
  const lines = rawMigration.split("\n");
  const beginIndexes = lines
    .map((line, index) => (line.trim() === "BEGIN;" ? index : -1))
    .filter((index) => index >= 0);
  const commitIndexes = lines
    .map((line, index) => (line.trim() === "COMMIT;" ? index : -1))
    .filter((index) => index >= 0);
  if (
    beginIndexes.length !== 1 ||
    commitIndexes.length !== 1 ||
    beginIndexes[0] >= commitIndexes[0] ||
    lines.slice(commitIndexes[0] + 1).some((line) => line.trim() !== "")
  ) {
    fail("CURRENT189_UPGRADE_TARGET_MIGRATION_BOUNDARY_INVALID");
  }
  return lines.slice(beginIndexes[0] + 1, commitIndexes[0]).join("\n");
}

function clusterGuardSql(target, source) {
  return String.raw`
DO $guard$
DECLARE
  observed_count integer;
  observed_head text;
  observed_system_identifier text;
BEGIN
  SELECT system_identifier::text INTO observed_system_identifier FROM pg_catalog.pg_control_system();
  SELECT pg_catalog.count(*)::integer,
         (SELECT migration_name FROM public."_prisma_migrations"
          WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
          ORDER BY started_at DESC, migration_name DESC LIMIT 1)
    INTO observed_count, observed_head
  FROM public."_prisma_migrations"
  WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;
  IF pg_catalog.current_database() IS DISTINCT FROM ${sqlLiteral(target.databaseName)}
     OR observed_system_identifier IS DISTINCT FROM ${sqlLiteral(target.systemIdentifier)}
     OR session_user IS DISTINCT FROM 'postgres'
     OR current_user IS DISTINCT FROM 'postgres'
     OR observed_count IS DISTINCT FROM ${SOURCE_COUNT}
     OR observed_head IS DISTINCT FROM ${sqlLiteral(SOURCE_HEAD)}
     OR EXISTS (SELECT 1 FROM public."_prisma_migrations" WHERE migration_name=${sqlLiteral(TARGET_HEAD)})
     OR (SELECT oid::text FROM pg_catalog.pg_class WHERE oid='public."GuestSupportTicket"'::regclass) IS DISTINCT FROM ${sqlLiteral(source.ticketTable.oid)}
     OR (SELECT owner.rolname FROM pg_catalog.pg_class relation JOIN pg_catalog.pg_roles owner ON owner.oid=relation.relowner WHERE relation.oid='public."GuestSupportTicket"'::regclass) IS DISTINCT FROM ${sqlLiteral(source.ticketTable.owner)}
     OR (SELECT oid::text FROM pg_catalog.pg_proc WHERE oid='public.identity_mail_delivery_worker_assert_v1(text)'::regprocedure) IS DISTINCT FROM ${sqlLiteral(source.workerFunction.oid)}
     OR (SELECT pg_catalog.pg_get_constraintdef(oid,true) FROM pg_catalog.pg_constraint WHERE conname='guest_support_ticket_description_length_chk' AND conrelid='public."GuestSupportTicket"'::regclass) IS DISTINCT FROM ${sqlLiteral(SOURCE_CONSTRAINT)}
     OR (SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.pg_get_functiondef(oid),'UTF8')),'hex') FROM pg_catalog.pg_proc WHERE oid='public.identity_mail_delivery_worker_assert_v1(text)'::regprocedure) IS DISTINCT FROM ${sqlLiteral(SOURCE_WORKER_FUNCTION_SHA256)}
  THEN
    RAISE EXCEPTION 'CURRENT189_UPGRADE_CLUSTER_GUARD_FAILED';
  END IF;
END $guard$;
`;
}

export function createGuestSupportCurrent189ProductionLocalPostgresExecutor() {
  if (
    process.platform !== "linux" ||
    typeof process.geteuid !== "function" ||
    process.geteuid() !== 0
  ) {
    fail("CURRENT189_UPGRADE_PRIVILEGED_AUTHORITY_REQUIRED");
  }
  return Object.freeze({
    migrate: async ({ artifactRoot, source, target, timeoutSeconds }) => {
      const migrationPath = path.join(
        artifactRoot,
        "packages/database/prisma/migrations",
        TARGET_HEAD,
        "migration.sql",
      );
      const [metadata, canonicalPath, rawMigration] = await Promise.all([
        lstat(migrationPath, { bigint: true }).catch(() => null),
        realpath(migrationPath).catch(() => null),
        readFile(migrationPath).catch(() => null),
      ]);
      if (
        !metadata?.isFile() ||
        metadata.isSymbolicLink() ||
        metadata.uid !== 0n ||
        metadata.nlink !== 1n ||
        (metadata.mode & 0o022n) !== 0n ||
        canonicalPath !== migrationPath ||
        !Buffer.isBuffer(rawMigration) ||
        sha256(rawMigration) !== TARGET_MIGRATION_SHA256
      ) {
        fail("CURRENT189_UPGRADE_TARGET_MIGRATION_DRIFT");
      }
      const migrationId = randomUUID();
      const sql = [
        "BEGIN;",
        "SET LOCAL lock_timeout = '5s';",
        "SET LOCAL statement_timeout = '2min';",
        "SELECT pg_catalog.pg_advisory_xact_lock(13577189, 188189);",
        clusterGuardSql(target, source),
        `INSERT INTO public."_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) VALUES (${sqlLiteral(migrationId)}, ${sqlLiteral(TARGET_MIGRATION_SHA256)}, NULL, ${sqlLiteral(TARGET_HEAD)}, NULL, NULL, pg_catalog.clock_timestamp(), 0);`,
        migrationBody(rawMigration.toString("utf8")),
        `UPDATE public."_prisma_migrations" SET finished_at=pg_catalog.clock_timestamp(), applied_steps_count=1 WHERE id=${sqlLiteral(migrationId)} AND migration_name=${sqlLiteral(TARGET_HEAD)} AND checksum=${sqlLiteral(TARGET_MIGRATION_SHA256)} AND finished_at IS NULL AND rolled_back_at IS NULL;`,
        `DO $receipt$ BEGIN IF (SELECT pg_catalog.count(*) FROM public."_prisma_migrations" WHERE id=${sqlLiteral(migrationId)} AND migration_name=${sqlLiteral(TARGET_HEAD)} AND checksum=${sqlLiteral(TARGET_MIGRATION_SHA256)} AND finished_at IS NOT NULL AND rolled_back_at IS NULL AND applied_steps_count=1) <> 1 THEN RAISE EXCEPTION 'CURRENT189_UPGRADE_MIGRATION_RECEIPT_NOT_WRITTEN'; END IF; END $receipt$;`,
        "COMMIT;",
        "",
      ].join("\n");
      return runPsql(target, sql, timeoutSeconds);
    },
  });
}

async function systemctlState(systemctl, unit) {
  const child = spawn(systemctl, ["show", unit, "--no-pager", "--property=ActiveState", "--property=UnitFileState"], {
    env: { LANG: "C", LC_ALL: "C", PATH: "/usr/sbin:/usr/bin:/sbin:/bin", TZ: "UTC" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => (stdout += chunk.toString("utf8")));
  child.stderr.on("data", (chunk) => (stderr += chunk.toString("utf8")));
  const result = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
  if (result.code !== 0 || result.signal !== null || stderr !== "") {
    fail("CURRENT189_UPGRADE_WORKER_STATE_INVALID");
  }
  return Object.fromEntries(
    stdout.split("\n").filter((line) => line.includes("=")).map((line) => {
      const separator = line.indexOf("=");
      return [line.slice(0, separator), line.slice(separator + 1)];
    }),
  );
}

async function systemctlAction(systemctl, action, unit) {
  const child = spawn(systemctl, [action, unit], {
    env: { LANG: "C", LC_ALL: "C", PATH: "/usr/sbin:/usr/bin:/sbin:/bin", TZ: "UTC" },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => (stderr += chunk.toString("utf8")));
  const result = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
  if (result.code !== 0 || result.signal !== null || stderr !== "") {
    fail("CURRENT189_UPGRADE_WORKER_CONTROL_FAILED");
  }
}

export function createGuestSupportCurrent189WorkerSafetyAdapter() {
  if (
    process.platform !== "linux" ||
    typeof process.geteuid !== "function" ||
    process.geteuid() !== 0
  ) {
    fail("CURRENT189_UPGRADE_PRIVILEGED_AUTHORITY_REQUIRED");
  }
  let quiesced = false;
  return Object.freeze({
    quiesce: async () => {
      if (quiesced) fail("CURRENT189_UPGRADE_WORKER_STATE_INVALID");
      const systemctl = await trustedExecutable("/usr/bin/systemctl");
      const timer = await systemctlState(systemctl, TIMER_UNIT);
      const worker = await systemctlState(systemctl, WORKER_UNIT);
      await systemctlAction(systemctl, "stop", TIMER_UNIT);
      await systemctlAction(systemctl, "stop", WORKER_UNIT);
      const [stoppedTimer, stoppedWorker] = await Promise.all([
        systemctlState(systemctl, TIMER_UNIT),
        systemctlState(systemctl, WORKER_UNIT),
      ]);
      if (stoppedTimer.ActiveState !== "inactive" || stoppedWorker.ActiveState !== "inactive") {
        fail("CURRENT189_UPGRADE_WORKER_NOT_QUIESCED");
      }
      quiesced = true;
      return Object.freeze({
        timerWasActive: timer.ActiveState === "active",
        timerWasEnabled: timer.UnitFileState === "enabled",
        workerWasActive: worker.ActiveState === "active",
      });
    },
    restore: async (state) => {
      if (!quiesced) fail("CURRENT189_UPGRADE_WORKER_STATE_INVALID");
      const systemctl = await trustedExecutable("/usr/bin/systemctl");
      if (state.workerWasActive === true) {
        await systemctlAction(systemctl, "start", WORKER_UNIT);
      }
      if (state.timerWasActive === true) {
        await systemctlAction(systemctl, "start", TIMER_UNIT);
      }
      const timer = await systemctlState(systemctl, TIMER_UNIT);
      if (
        (state.timerWasActive === true && timer.ActiveState !== "active") ||
        (state.timerWasActive !== true && timer.ActiveState !== "inactive") ||
        (state.timerWasEnabled === true && timer.UnitFileState !== "enabled")
      ) {
        fail("CURRENT189_UPGRADE_WORKER_RESTORE_FAILED");
      }
      quiesced = false;
    },
  });
}

export function createGuestSupportCurrent189ProductionRuntimeAdapter(options) {
  return createGuestSupportCurrent189ProductionBridgeRuntimeAdapter(options);
}

export const GUEST_SUPPORT_CURRENT189_PRODUCTION_UPGRADE_CONSTANTS = Object.freeze({
  sourceConstraint: SOURCE_CONSTRAINT,
  sourceMigrationCount: SOURCE_COUNT,
  sourceMigrationHead: SOURCE_HEAD,
  sourceWorkerFunctionSha256: SOURCE_WORKER_FUNCTION_SHA256,
  targetConstraint: TARGET_CONSTRAINT,
  targetMigrationCount: TARGET_COUNT,
  targetMigrationHead: TARGET_HEAD,
  targetMigrationSha256: TARGET_MIGRATION_SHA256,
  targetWorkerFunctionSha256: TARGET_WORKER_FUNCTION_SHA256,
  timerUnit: TIMER_UNIT,
  workerUnit: WORKER_UNIT,
});

import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
  timingSafeEqual,
  verify,
} from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { inspectFounderPilotImmutableFile } from "./founder-pilot-restored-copy-preflight.mjs";
import {
  FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS,
  materializeFounderPilotProductionHistoryLane,
  normalizeFounderPilotProductionHistoryEvidence,
  inspectFounderPilotProductionHistorySourceTree,
  validateFounderPilotProductionHistorySourceEvidence,
  verifyFounderPilotProductionHistoryRehearsal,
} from "./founder-pilot-production-history-rehearsal.mjs";

export const FOUNDER_PILOT_PRODUCTION_HISTORY_PRODUCTION_CONTRACT =
  "FOUNDER_PILOT_PRODUCTION_HISTORY_PRODUCTION_V1";
export const FOUNDER_PILOT_PRODUCTION_HISTORY_PRODUCTION_CONFIRMATION =
  "I_ACCEPT_EXACT_PRODUCTION_HISTORY_153_TO_187_V1";
export const FOUNDER_PILOT_PRODUCTION_HISTORY_PLAN_READY =
  "PRODUCTION_HISTORY_PLAN_READY";
export const FOUNDER_PILOT_PRODUCTION_HISTORY_INVENTORY_READY =
  "PRODUCTION_HISTORY_INVENTORY_READY_NOT_AUTHORIZATION";
export const FOUNDER_PILOT_PRODUCTION_HISTORY_APPLIED =
  "PRODUCTION_HISTORY_187_VERIFIED";

const SIGNATURE_ALGORITHM = "Ed25519";
const PLAN_SIGNATURE_DOMAIN =
  "LEETPLUS_FOUNDER_PILOT_PRODUCTION_HISTORY_PLAN_APPROVAL_V1";
const CONTROLLER_LOCK_KEY = "-7114178685918421703";
const RECONCILIATION_MARKER = "FOUNDER_PRODUCTION_STALE_DIGEST_RECONCILED_V1";
const EXACT_STALE_RUN_COUNT = 4;
const MINIMUM_STALE_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_MANIFEST_BYTES = 128 * 1024;
const MAX_PLAN_BYTES = 64 * 1024;
const MAX_KEY_BYTES = 16 * 1024;
const SHA256 = /^[0-9a-f]{64}$/u;
const RELEASE_SHA = /^[0-9a-f]{40}$/u;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const SAFE_DATABASE = /^[a-z][a-z0-9_]{2,62}$/u;
const SAFE_ROLE = /^[a-z][a-z0-9_]{2,62}$/u;
const SAFE_KEY_ID = /^[a-z0-9][a-z0-9._-]{2,80}$/u;
const BASE64URL_SIGNATURE = /^[A-Za-z0-9_-]{86}$/u;

export class FounderPilotProductionHistoryProductionError extends Error {
  constructor(reasonCode) {
    super(reasonCode);
    this.name = "FounderPilotProductionHistoryProductionError";
    this.reasonCode = reasonCode;
    this.safeContractError = true;
  }
}

function fail(reasonCode) {
  throw new FounderPilotProductionHistoryProductionError(reasonCode);
}

function stableJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
    .join(",")}}`;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function digest(domain, value) {
  return sha256(
    `${FOUNDER_PILOT_PRODUCTION_HISTORY_PRODUCTION_CONTRACT}\0${domain}\0${stableJson(value)}`,
  );
}

function exactRecord(value, keys, reasonCode) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    fail(reasonCode);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    fail(reasonCode);
  }
  return value;
}

function exactString(value, pattern, reasonCode) {
  if (typeof value !== "string" || !pattern.test(value)) fail(reasonCode);
  return value;
}

function exactInteger(value, minimum, maximum, reasonCode) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail(reasonCode);
  }
  return value;
}

function absolutePath(value, reasonCode) {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length < 3 ||
    value.length > 4096 ||
    !path.isAbsolute(value)
  ) {
    fail(reasonCode);
  }
  return value;
}

function canonicalPublicKey(publicKeyPem, expectedFingerprint) {
  let publicKey;
  try {
    publicKey = createPublicKey(publicKeyPem);
  } catch {
    fail("FOUNDER_PRODUCTION_HISTORY_APPROVAL_PUBLIC_KEY_INVALID");
  }
  if (publicKey.asymmetricKeyType !== "ed25519") {
    fail("FOUNDER_PRODUCTION_HISTORY_APPROVAL_PUBLIC_KEY_INVALID");
  }
  const der = publicKey.export({ format: "der", type: "spki" });
  if (sha256(der) !== expectedFingerprint) {
    fail("FOUNDER_PRODUCTION_HISTORY_APPROVAL_KEY_FINGERPRINT_MISMATCH");
  }
  return publicKey;
}

function normalizeRuntimeRole(value) {
  const role = exactRecord(
    value,
    ["name", "oid"],
    "FOUNDER_PRODUCTION_HISTORY_RUNTIME_ROLE_INVALID",
  );
  exactString(
    role.name,
    SAFE_ROLE,
    "FOUNDER_PRODUCTION_HISTORY_RUNTIME_ROLE_INVALID",
  );
  exactInteger(
    role.oid,
    1,
    2_147_483_647,
    "FOUNDER_PRODUCTION_HISTORY_RUNTIME_ROLE_INVALID",
  );
  return Object.freeze({ name: role.name, oid: role.oid });
}

export function normalizeFounderPilotProductionHistoryProductionManifest(
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
    "FOUNDER_PRODUCTION_HISTORY_MANIFEST_INVALID",
  );
  if (
    manifest.contractVersion !==
    FOUNDER_PILOT_PRODUCTION_HISTORY_PRODUCTION_CONTRACT
  ) {
    fail("FOUNDER_PRODUCTION_HISTORY_CONTRACT_INVALID");
  }
  if (manifest.environment !== "PRODUCTION") {
    fail("FOUNDER_PRODUCTION_HISTORY_ENVIRONMENT_INVALID");
  }

  const release = exactRecord(
    manifest.release,
    ["artifactPath", "artifactSha256", "materializedTreeDigest", "releaseSha"],
    "FOUNDER_PRODUCTION_HISTORY_RELEASE_INVALID",
  );
  exactString(
    release.releaseSha,
    RELEASE_SHA,
    "FOUNDER_PRODUCTION_HISTORY_RELEASE_INVALID",
  );
  exactString(
    release.artifactSha256,
    SHA256,
    "FOUNDER_PRODUCTION_HISTORY_RELEASE_INVALID",
  );
  exactString(
    release.materializedTreeDigest,
    SHA256,
    "FOUNDER_PRODUCTION_HISTORY_RELEASE_INVALID",
  );
  absolutePath(
    release.artifactPath,
    "FOUNDER_PRODUCTION_HISTORY_RELEASE_INVALID",
  );

  const approval = exactRecord(
    manifest.approval,
    ["keyId", "maxPlanAgeSeconds", "publicKeyPem", "publicKeySpkiSha256"],
    "FOUNDER_PRODUCTION_HISTORY_APPROVAL_INVALID",
  );
  exactString(
    approval.keyId,
    SAFE_KEY_ID,
    "FOUNDER_PRODUCTION_HISTORY_APPROVAL_INVALID",
  );
  exactString(
    approval.publicKeySpkiSha256,
    SHA256,
    "FOUNDER_PRODUCTION_HISTORY_APPROVAL_INVALID",
  );
  exactInteger(
    approval.maxPlanAgeSeconds,
    60,
    3600,
    "FOUNDER_PRODUCTION_HISTORY_APPROVAL_INVALID",
  );
  if (
    typeof approval.publicKeyPem !== "string" ||
    approval.publicKeyPem.length < 80 ||
    approval.publicKeyPem.length > MAX_KEY_BYTES
  ) {
    fail("FOUNDER_PRODUCTION_HISTORY_APPROVAL_INVALID");
  }
  canonicalPublicKey(approval.publicKeyPem, approval.publicKeySpkiSha256);

  const operation = exactRecord(
    manifest.operation,
    ["deployTimeoutSeconds", "expectedStaleRunSetDigest"],
    "FOUNDER_PRODUCTION_HISTORY_OPERATION_INVALID",
  );
  exactInteger(
    operation.deployTimeoutSeconds,
    60,
    900,
    "FOUNDER_PRODUCTION_HISTORY_OPERATION_INVALID",
  );
  exactString(
    operation.expectedStaleRunSetDigest,
    SHA256,
    "FOUNDER_PRODUCTION_HISTORY_OPERATION_INVALID",
  );

  const target = exactRecord(
    manifest.target,
    [
      "applicationRuntimeRoles",
      "databaseName",
      "expectedServerMajor",
      "expectedSystemIdentifier",
      "host",
      "migrationRoleName",
      "migrationRoleOid",
      "objectOwnerRoleName",
      "objectOwnerRoleOid",
      "port",
    ],
    "FOUNDER_PRODUCTION_HISTORY_TARGET_INVALID",
  );
  if (target.host !== "127.0.0.1") {
    fail("FOUNDER_PRODUCTION_HISTORY_TARGET_NOT_LOOPBACK");
  }
  exactInteger(
    target.port,
    1024,
    65535,
    "FOUNDER_PRODUCTION_HISTORY_TARGET_INVALID",
  );
  exactString(
    target.databaseName,
    SAFE_DATABASE,
    "FOUNDER_PRODUCTION_HISTORY_TARGET_INVALID",
  );
  if (
    /^(?:postgres|template\d|leetplus_(?:restored|rehearsal)_)/u.test(
      target.databaseName,
    )
  ) {
    fail("FOUNDER_PRODUCTION_HISTORY_TARGET_DATABASE_FORBIDDEN");
  }
  exactString(
    target.migrationRoleName,
    SAFE_ROLE,
    "FOUNDER_PRODUCTION_HISTORY_TARGET_INVALID",
  );
  exactInteger(
    target.migrationRoleOid,
    1,
    2_147_483_647,
    "FOUNDER_PRODUCTION_HISTORY_TARGET_INVALID",
  );
  exactString(
    target.objectOwnerRoleName,
    SAFE_ROLE,
    "FOUNDER_PRODUCTION_HISTORY_TARGET_INVALID",
  );
  exactInteger(
    target.objectOwnerRoleOid,
    1,
    2_147_483_647,
    "FOUNDER_PRODUCTION_HISTORY_TARGET_INVALID",
  );
  exactInteger(
    target.expectedServerMajor,
    16,
    16,
    "FOUNDER_PRODUCTION_HISTORY_TARGET_INVALID",
  );
  if (!/^\d{10,24}$/u.test(target.expectedSystemIdentifier)) {
    fail("FOUNDER_PRODUCTION_HISTORY_TARGET_INVALID");
  }
  if (
    !Array.isArray(target.applicationRuntimeRoles) ||
    target.applicationRuntimeRoles.length < 1 ||
    target.applicationRuntimeRoles.length > 16
  ) {
    fail("FOUNDER_PRODUCTION_HISTORY_RUNTIME_ROLES_INVALID");
  }
  const applicationRuntimeRoles = target.applicationRuntimeRoles
    .map(normalizeRuntimeRole)
    .sort((left, right) => left.name.localeCompare(right.name));
  if (
    new Set(applicationRuntimeRoles.map((role) => role.name)).size !==
      applicationRuntimeRoles.length ||
    new Set(applicationRuntimeRoles.map((role) => role.oid)).size !==
      applicationRuntimeRoles.length ||
    applicationRuntimeRoles.some(
      (role) =>
        role.name === target.migrationRoleName ||
        role.oid === target.migrationRoleOid,
    ) ||
    !applicationRuntimeRoles.some(
      (role) =>
        role.name === target.objectOwnerRoleName &&
        role.oid === target.objectOwnerRoleOid,
    )
  ) {
    fail("FOUNDER_PRODUCTION_HISTORY_RUNTIME_ROLES_INVALID");
  }

  return Object.freeze({
    approval: Object.freeze({ ...approval }),
    contractVersion: manifest.contractVersion,
    environment: manifest.environment,
    operation: Object.freeze({ ...operation }),
    release: Object.freeze({ ...release }),
    target: Object.freeze({
      ...target,
      applicationRuntimeRoles: Object.freeze(applicationRuntimeRoles),
    }),
  });
}

export function founderPilotProductionHistoryProductionManifestDigest(value) {
  return digest(
    "production-manifest",
    normalizeFounderPilotProductionHistoryProductionManifest(value),
  );
}

export function assertFounderPilotProductionHistoryProductionDatabaseUrl(
  databaseUrl,
  target,
) {
  if (
    typeof databaseUrl !== "string" ||
    databaseUrl.length > 8192 ||
    /[\u0000-\u0020\u007f]/u.test(databaseUrl) ||
    databaseUrl.includes("#")
  ) {
    fail("FOUNDER_PRODUCTION_HISTORY_DATABASE_URL_INVALID");
  }
  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    fail("FOUNDER_PRODUCTION_HISTORY_DATABASE_URL_INVALID");
  }
  let databaseName;
  let username;
  let password;
  try {
    databaseName = decodeURIComponent(parsed.pathname.slice(1));
    username = decodeURIComponent(parsed.username);
    password = decodeURIComponent(parsed.password);
  } catch {
    fail("FOUNDER_PRODUCTION_HISTORY_DATABASE_URL_INVALID");
  }
  const canonicalRoleOptions = `?options=-c%20role%3D${encodeURIComponent(
    target.objectOwnerRoleName,
  )}`;
  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    parsed.hash !== "" ||
    parsed.search !== canonicalRoleOptions ||
    parsed.hostname !== target.host ||
    Number(parsed.port) !== target.port ||
    databaseName !== target.databaseName ||
    username !== target.migrationRoleName ||
    password.length < 16
  ) {
    fail("FOUNDER_PRODUCTION_HISTORY_DATABASE_URL_MISMATCH");
  }
  if (
    [...parsed.searchParams.entries()].length !== 1 ||
    parsed.searchParams.get("options") !==
      `-c role=${target.objectOwnerRoleName}`
  ) {
    fail("FOUNDER_PRODUCTION_HISTORY_DATABASE_URL_MISMATCH");
  }
  return Object.freeze({
    databaseName: target.databaseName,
    host: target.host,
    migrationRoleName: target.migrationRoleName,
    objectOwnerRoleName: target.objectOwnerRoleName,
    port: target.port,
  });
}

function normalizeIdentityEvidence(value, target) {
  const evidence = exactRecord(
    value,
    [
      "activeRuntimeRoleNames",
      "currentDatabase",
      "currentRoleDirectMembershipCount",
      "databaseOwnerRoleName",
      "databaseOwnerRoleOid",
      "currentRoleBypassRls",
      "currentRoleCanLogin",
      "currentRoleCreateDb",
      "currentRoleCreateRole",
      "currentRoleName",
      "currentRoleOid",
      "currentRoleReplication",
      "currentRoleSuperuser",
      "inRecovery",
      "publicClassOwnerMismatchCount",
      "publicProcOwnerMismatchCount",
      "publicTypeOwnerMismatchCount",
      "runtimeRoles",
      "sessionDirectMembershipCount",
      "sessionOwnerMembershipCount",
      "sessionOwnerMembershipAdminOption",
      "sessionOwnerMembershipInheritOption",
      "sessionOwnerMembershipSetOption",
      "sessionRoleBypassRls",
      "sessionRoleCanLogin",
      "sessionRoleCreateDb",
      "sessionRoleCreateRole",
      "sessionRoleInherit",
      "sessionRoleName",
      "sessionRoleOid",
      "sessionRoleReplication",
      "sessionRoleSuperuser",
      "serverAddress",
      "serverMajor",
      "serverPort",
      "systemIdentifier",
    ],
    "FOUNDER_PRODUCTION_HISTORY_IDENTITY_EVIDENCE_INVALID",
  );
  if (
    evidence.currentDatabase !== target.databaseName ||
    evidence.databaseOwnerRoleName !== target.objectOwnerRoleName ||
    evidence.databaseOwnerRoleOid !== target.objectOwnerRoleOid ||
    evidence.currentRoleDirectMembershipCount !== 0 ||
    evidence.sessionRoleName !== target.migrationRoleName ||
    evidence.sessionRoleOid !== target.migrationRoleOid ||
    evidence.sessionRoleCanLogin !== true ||
    evidence.sessionRoleCreateDb !== false ||
    evidence.sessionRoleCreateRole !== false ||
    evidence.sessionRoleInherit !== false ||
    evidence.sessionRoleReplication !== false ||
    evidence.sessionRoleSuperuser !== false ||
    evidence.sessionRoleBypassRls !== false ||
    evidence.sessionDirectMembershipCount !== 1 ||
    evidence.sessionOwnerMembershipCount !== 1 ||
    evidence.sessionOwnerMembershipAdminOption !== false ||
    evidence.sessionOwnerMembershipInheritOption !== false ||
    evidence.sessionOwnerMembershipSetOption !== true ||
    evidence.currentRoleName !== target.objectOwnerRoleName ||
    evidence.currentRoleOid !== target.objectOwnerRoleOid ||
    evidence.currentRoleCanLogin !== true ||
    evidence.currentRoleCreateDb !== false ||
    evidence.currentRoleCreateRole !== false ||
    evidence.currentRoleReplication !== false ||
    evidence.currentRoleSuperuser !== false ||
    evidence.currentRoleBypassRls !== false ||
    evidence.publicClassOwnerMismatchCount !== 0 ||
    evidence.publicProcOwnerMismatchCount !== 0 ||
    evidence.publicTypeOwnerMismatchCount !== 0 ||
    evidence.serverAddress !== target.host ||
    evidence.serverPort !== target.port ||
    evidence.systemIdentifier !== target.expectedSystemIdentifier ||
    evidence.serverMajor !== target.expectedServerMajor ||
    evidence.inRecovery !== false
  ) {
    fail("FOUNDER_PRODUCTION_HISTORY_LIVE_IDENTITY_MISMATCH");
  }
  if (
    !Array.isArray(evidence.activeRuntimeRoleNames) ||
    evidence.activeRuntimeRoleNames.length < 1 ||
    evidence.activeRuntimeRoleNames.length > 16 ||
    new Set(evidence.activeRuntimeRoleNames).size !==
      evidence.activeRuntimeRoleNames.length ||
    evidence.activeRuntimeRoleNames.some(
      (name) =>
        typeof name !== "string" ||
        !target.applicationRuntimeRoles.some((role) => role.name === name),
    )
  ) {
    fail("FOUNDER_PRODUCTION_HISTORY_ACTIVE_RUNTIME_ROLE_MISMATCH");
  }
  if (
    !Array.isArray(evidence.runtimeRoles) ||
    evidence.runtimeRoles.length !== target.applicationRuntimeRoles.length
  ) {
    fail("FOUNDER_PRODUCTION_HISTORY_RUNTIME_ROLE_STATE_MISMATCH");
  }
  const actual = evidence.runtimeRoles
    .map((role) =>
      exactRecord(
        role,
        [
          "bypassRls",
          "canLogin",
          "createDb",
          "createRole",
          "name",
          "oid",
          "replication",
          "superuser",
        ],
        "FOUNDER_PRODUCTION_HISTORY_RUNTIME_ROLE_STATE_MISMATCH",
      ),
    )
    .sort((left, right) => left.name.localeCompare(right.name));
  for (let index = 0; index < actual.length; index += 1) {
    const expected = target.applicationRuntimeRoles[index];
    const role = actual[index];
    if (
      role.name !== expected.name ||
      role.oid !== expected.oid ||
      role.canLogin !== true ||
      role.createDb !== false ||
      role.createRole !== false ||
      role.replication !== false ||
      role.superuser !== false ||
      role.bypassRls !== false
    ) {
      fail("FOUNDER_PRODUCTION_HISTORY_RUNTIME_ROLE_STATE_MISMATCH");
    }
  }
  return Object.freeze({
    activeRuntimeRoleNames: Object.freeze(
      [...evidence.activeRuntimeRoleNames].sort(),
    ),
    currentDatabase: evidence.currentDatabase,
    currentRoleDirectMembershipCount: evidence.currentRoleDirectMembershipCount,
    databaseOwnerRoleName: evidence.databaseOwnerRoleName,
    databaseOwnerRoleOid: evidence.databaseOwnerRoleOid,
    currentRoleBypassRls: evidence.currentRoleBypassRls,
    currentRoleCanLogin: evidence.currentRoleCanLogin,
    currentRoleName: evidence.currentRoleName,
    currentRoleOid: evidence.currentRoleOid,
    currentRoleCreateDb: evidence.currentRoleCreateDb,
    currentRoleCreateRole: evidence.currentRoleCreateRole,
    currentRoleReplication: evidence.currentRoleReplication,
    currentRoleSuperuser: evidence.currentRoleSuperuser,
    inRecovery: evidence.inRecovery,
    publicClassOwnerMismatchCount: evidence.publicClassOwnerMismatchCount,
    publicProcOwnerMismatchCount: evidence.publicProcOwnerMismatchCount,
    publicTypeOwnerMismatchCount: evidence.publicTypeOwnerMismatchCount,
    runtimeRoles: Object.freeze(
      actual.map((role) => Object.freeze({ ...role })),
    ),
    sessionDirectMembershipCount: evidence.sessionDirectMembershipCount,
    sessionOwnerMembershipCount: evidence.sessionOwnerMembershipCount,
    sessionOwnerMembershipAdminOption:
      evidence.sessionOwnerMembershipAdminOption,
    sessionOwnerMembershipInheritOption:
      evidence.sessionOwnerMembershipInheritOption,
    sessionOwnerMembershipSetOption: evidence.sessionOwnerMembershipSetOption,
    sessionRoleBypassRls: evidence.sessionRoleBypassRls,
    sessionRoleCanLogin: evidence.sessionRoleCanLogin,
    sessionRoleCreateDb: evidence.sessionRoleCreateDb,
    sessionRoleCreateRole: evidence.sessionRoleCreateRole,
    sessionRoleInherit: evidence.sessionRoleInherit,
    sessionRoleName: evidence.sessionRoleName,
    sessionRoleOid: evidence.sessionRoleOid,
    sessionRoleReplication: evidence.sessionRoleReplication,
    sessionRoleSuperuser: evidence.sessionRoleSuperuser,
    serverAddress: evidence.serverAddress,
    serverMajor: evidence.serverMajor,
    serverPort: evidence.serverPort,
    systemIdentifier: evidence.systemIdentifier,
  });
}

function productionStaleProjection(row) {
  return {
    completedAt: row.completedAt,
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt),
    errorMessage: row.errorMessage,
    executionRevision: row.executionRevision,
    id: row.id,
    scheduledForDate: row.scheduledForDate,
    sentCount: row.sentCount,
    startedAt:
      row.startedAt instanceof Date
        ? row.startedAt.toISOString()
        : String(row.startedAt),
    status: row.status,
    tenantId: row.tenantId,
    type: row.type,
    updatedAt:
      row.updatedAt instanceof Date
        ? row.updatedAt.toISOString()
        : String(row.updatedAt),
  };
}

function validateProductionStaleRunSet(rows, capturedAt, expectedDigest) {
  if (!Array.isArray(rows) || rows.length !== EXACT_STALE_RUN_COUNT) {
    fail("FOUNDER_PRODUCTION_HISTORY_EXACT_STALE_RUN_SET_REQUIRED");
  }
  const captured = new Date(capturedAt).valueOf();
  if (!Number.isFinite(captured)) {
    fail("FOUNDER_PRODUCTION_HISTORY_CLOCK_INVALID");
  }
  const projected = rows.map(productionStaleProjection);
  if (
    new Set(projected.map((row) => row.id)).size !== EXACT_STALE_RUN_COUNT ||
    new Set(
      projected.map(
        (row) => `${row.tenantId}\0${row.type}\0${row.scheduledForDate}`,
      ),
    ).size !== EXACT_STALE_RUN_COUNT
  ) {
    fail("FOUNDER_PRODUCTION_HISTORY_STALE_RUN_SET_DUPLICATE");
  }
  for (const row of projected) {
    const startedAt = new Date(row.startedAt).valueOf();
    const createdAt = new Date(row.createdAt).valueOf();
    const updatedAt = new Date(row.updatedAt).valueOf();
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
        row.id,
      ) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
        row.tenantId,
      ) ||
      !/^\d{4}-\d{2}-\d{2}$/u.test(row.scheduledForDate) ||
      row.status !== "RUNNING" ||
      row.type !== "WEEKLY" ||
      row.sentCount !== 0 ||
      row.completedAt !== null ||
      row.executionRevision !== null ||
      row.errorMessage !== null ||
      !Number.isFinite(startedAt) ||
      !Number.isFinite(createdAt) ||
      !Number.isFinite(updatedAt) ||
      startedAt > captured - MINIMUM_STALE_AGE_MS ||
      createdAt > startedAt ||
      updatedAt < startedAt ||
      updatedAt > captured
    ) {
      fail("FOUNDER_PRODUCTION_HISTORY_STALE_RUN_NOT_RECONCILABLE");
    }
  }
  projected.sort((left, right) => left.id.localeCompare(right.id));
  const staleRunSetDigest = digest("exact-production-stale-run-set", projected);
  if (expectedDigest !== null && staleRunSetDigest !== expectedDigest) {
    fail("FOUNDER_PRODUCTION_HISTORY_STALE_RUN_SET_MISMATCH");
  }
  return Object.freeze({
    rows: Object.freeze(projected.map((row) => Object.freeze({ ...row }))),
    staleRunSetDigest,
  });
}

export function founderPilotProductionHistoryProductionStaleRunSetDigest(
  rows,
  capturedAt,
) {
  return validateProductionStaleRunSet(rows, capturedAt, null)
    .staleRunSetDigest;
}

function planWithoutDigest(plan) {
  const { planDigest: _planDigest, ...unsigned } = plan;
  return unsigned;
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
      "planDigest",
      "plannedAt",
      "productionManifestDigest",
      "releaseSha",
      "sourceMigrationCount",
      "sourceMigrationManifestDigest",
      "sourceRolledBackMigrationCount",
      "sourceRolledBackMigrationManifestDigest",
      "sourceSchemaHead",
      "staleRunCount",
      "staleRunSetDigest",
      "targetIdentityDigest",
    ],
    "FOUNDER_PRODUCTION_HISTORY_PLAN_INVALID",
  );
  if (
    plan.contractVersion !==
      FOUNDER_PILOT_PRODUCTION_HISTORY_PRODUCTION_CONTRACT ||
    plan.decision !== FOUNDER_PILOT_PRODUCTION_HISTORY_PLAN_READY ||
    plan.sourceMigrationCount !==
      FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.sourceMigrationCount ||
    plan.sourceMigrationManifestDigest !==
      FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.sourceMigrationManifestDigest ||
    plan.sourceRolledBackMigrationCount !==
      FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.sourceRolledBackMigrationCount ||
    plan.sourceRolledBackMigrationManifestDigest !==
      FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.sourceRolledBackMigrationManifestDigest ||
    plan.sourceSchemaHead !==
      FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.sourceMigrationHead ||
    plan.staleRunCount !== EXACT_STALE_RUN_COUNT
  ) {
    fail("FOUNDER_PRODUCTION_HISTORY_PLAN_INVALID");
  }
  for (const valueToCheck of [
    plan.approvalKeySpkiSha256,
    plan.artifactSha256,
    plan.materializedTreeDigest,
    plan.planDigest,
    plan.productionManifestDigest,
    plan.sourceMigrationManifestDigest,
    plan.sourceRolledBackMigrationManifestDigest,
    plan.staleRunSetDigest,
    plan.targetIdentityDigest,
  ]) {
    exactString(
      valueToCheck,
      SHA256,
      "FOUNDER_PRODUCTION_HISTORY_PLAN_INVALID",
    );
  }
  exactString(
    plan.releaseSha,
    RELEASE_SHA,
    "FOUNDER_PRODUCTION_HISTORY_PLAN_INVALID",
  );
  exactString(
    plan.approvalKeyId,
    SAFE_KEY_ID,
    "FOUNDER_PRODUCTION_HISTORY_PLAN_INVALID",
  );
  exactString(
    plan.plannedAt,
    ISO_TIMESTAMP,
    "FOUNDER_PRODUCTION_HISTORY_PLAN_INVALID",
  );
  exactString(
    plan.expiresAt,
    ISO_TIMESTAMP,
    "FOUNDER_PRODUCTION_HISTORY_PLAN_INVALID",
  );
  if (digest("production-plan", planWithoutDigest(plan)) !== plan.planDigest) {
    fail("FOUNDER_PRODUCTION_HISTORY_PLAN_DIGEST_MISMATCH");
  }
  return Object.freeze({ ...plan });
}

function approvalPayload(value) {
  return Buffer.from(`${PLAN_SIGNATURE_DOMAIN}\n${stableJson(value)}`, "utf8");
}

function normalizeApproval(value) {
  const approval = exactRecord(
    value,
    [
      "contractVersion",
      "expiresAt",
      "keyId",
      "planDigest",
      "signatureAlgorithm",
      "signatureBase64url",
    ],
    "FOUNDER_PRODUCTION_HISTORY_APPROVAL_INVALID",
  );
  if (
    approval.contractVersion !==
      FOUNDER_PILOT_PRODUCTION_HISTORY_PRODUCTION_CONTRACT ||
    approval.signatureAlgorithm !== SIGNATURE_ALGORITHM
  ) {
    fail("FOUNDER_PRODUCTION_HISTORY_APPROVAL_INVALID");
  }
  exactString(
    approval.keyId,
    SAFE_KEY_ID,
    "FOUNDER_PRODUCTION_HISTORY_APPROVAL_INVALID",
  );
  exactString(
    approval.planDigest,
    SHA256,
    "FOUNDER_PRODUCTION_HISTORY_APPROVAL_INVALID",
  );
  exactString(
    approval.expiresAt,
    ISO_TIMESTAMP,
    "FOUNDER_PRODUCTION_HISTORY_APPROVAL_INVALID",
  );
  exactString(
    approval.signatureBase64url,
    BASE64URL_SIGNATURE,
    "FOUNDER_PRODUCTION_HISTORY_APPROVAL_INVALID",
  );
  return Object.freeze({ ...approval });
}

function unsignedApproval(plan) {
  return Object.freeze({
    contractVersion: FOUNDER_PILOT_PRODUCTION_HISTORY_PRODUCTION_CONTRACT,
    expiresAt: plan.expiresAt,
    keyId: plan.approvalKeyId,
    planDigest: plan.planDigest,
    signatureAlgorithm: SIGNATURE_ALGORITHM,
  });
}

function assertPlanManifestBinding(plan, manifest) {
  if (
    plan.productionManifestDigest !==
      founderPilotProductionHistoryProductionManifestDigest(manifest) ||
    plan.approvalKeyId !== manifest.approval.keyId ||
    plan.approvalKeySpkiSha256 !== manifest.approval.publicKeySpkiSha256 ||
    plan.releaseSha !== manifest.release.releaseSha ||
    plan.artifactSha256 !== manifest.release.artifactSha256 ||
    plan.materializedTreeDigest !== manifest.release.materializedTreeDigest ||
    plan.staleRunSetDigest !== manifest.operation.expectedStaleRunSetDigest
  ) {
    fail("FOUNDER_PRODUCTION_HISTORY_PLAN_MANIFEST_MISMATCH");
  }
}

export function signFounderPilotProductionHistoryProductionPlan({
  manifest: rawManifest,
  plan: rawPlan,
  privateKeyPem,
}) {
  const manifest =
    normalizeFounderPilotProductionHistoryProductionManifest(rawManifest);
  const plan = normalizePlan(rawPlan);
  assertPlanManifestBinding(plan, manifest);
  let privateKey;
  try {
    privateKey = createPrivateKey(privateKeyPem);
  } catch {
    fail("FOUNDER_PRODUCTION_HISTORY_APPROVAL_PRIVATE_KEY_INVALID");
  }
  if (
    privateKey.asymmetricKeyType !== "ed25519" ||
    sha256(
      createPublicKey(privateKey).export({ format: "der", type: "spki" }),
    ) !== manifest.approval.publicKeySpkiSha256
  ) {
    fail("FOUNDER_PRODUCTION_HISTORY_APPROVAL_PRIVATE_KEY_MISMATCH");
  }
  const unsigned = unsignedApproval(plan);
  return Object.freeze({
    ...unsigned,
    signatureBase64url: sign(
      null,
      approvalPayload(unsigned),
      privateKey,
    ).toString("base64url"),
  });
}

export function verifyFounderPilotProductionHistoryProductionApproval({
  approval: rawApproval,
  manifest: rawManifest,
  plan: rawPlan,
  pinnedApprovalKeySpkiSha256,
}) {
  const manifest =
    normalizeFounderPilotProductionHistoryProductionManifest(rawManifest);
  const plan = normalizePlan(rawPlan);
  const approval = normalizeApproval(rawApproval);
  assertPlanManifestBinding(plan, manifest);
  if (
    !SHA256.test(pinnedApprovalKeySpkiSha256 ?? "") ||
    pinnedApprovalKeySpkiSha256 !== manifest.approval.publicKeySpkiSha256
  ) {
    fail("FOUNDER_PRODUCTION_HISTORY_APPROVAL_KEY_PIN_MISMATCH");
  }
  const unsigned = unsignedApproval(plan);
  if (
    approval.contractVersion !== unsigned.contractVersion ||
    approval.expiresAt !== unsigned.expiresAt ||
    approval.keyId !== unsigned.keyId ||
    approval.planDigest !== unsigned.planDigest ||
    approval.signatureAlgorithm !== unsigned.signatureAlgorithm
  ) {
    fail("FOUNDER_PRODUCTION_HISTORY_APPROVAL_PLAN_MISMATCH");
  }
  const signature = Buffer.from(approval.signatureBase64url, "base64url");
  if (
    signature.length !== 64 ||
    !verify(
      null,
      approvalPayload(unsigned),
      canonicalPublicKey(
        manifest.approval.publicKeyPem,
        manifest.approval.publicKeySpkiSha256,
      ),
      signature,
    )
  ) {
    fail("FOUNDER_PRODUCTION_HISTORY_APPROVAL_SIGNATURE_INVALID");
  }
  return Object.freeze({
    approvalDigest: digest("accepted-approval", approval),
    keyId: approval.keyId,
    planDigest: approval.planDigest,
  });
}

function validNow(now) {
  const value = typeof now === "function" ? now() : now;
  if (!(value instanceof Date) || Number.isNaN(value.valueOf())) {
    fail("FOUNDER_PRODUCTION_HISTORY_CLOCK_INVALID");
  }
  return value;
}

function liveTargetIdentityDigest(identity) {
  return digest("live-target-identity", {
    ...identity,
    runtimeRoles: identity.runtimeRoles,
  });
}

async function inspectProductionReleaseIdentity({
  inspectArtifact,
  manifest,
  sourcePrismaRoot,
}) {
  const [tree, artifact] = await Promise.all([
    inspectFounderPilotProductionHistorySourceTree(sourcePrismaRoot),
    inspectArtifact({
      expectedSha256: manifest.release.artifactSha256,
      filePath: manifest.release.artifactPath,
      kind: "production-release-artifact",
    }),
  ]);
  if (
    tree.migrationCount !==
      FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.finalMigrationCount ||
    tree.treeDigest !== manifest.release.materializedTreeDigest ||
    artifact?.actualSha256 !== manifest.release.artifactSha256
  ) {
    fail("FOUNDER_PRODUCTION_HISTORY_RELEASE_IDENTITY_MISMATCH");
  }
  return tree;
}

function assertPlanWindow(plan, manifest, now) {
  const plannedAt = new Date(plan.plannedAt);
  const expiresAt = new Date(plan.expiresAt);
  if (
    Number.isNaN(plannedAt.valueOf()) ||
    Number.isNaN(expiresAt.valueOf()) ||
    expiresAt <= plannedAt ||
    expiresAt.valueOf() - plannedAt.valueOf() !==
      manifest.approval.maxPlanAgeSeconds * 1000 ||
    now < plannedAt ||
    now >= expiresAt
  ) {
    fail("FOUNDER_PRODUCTION_HISTORY_PLAN_EXPIRED");
  }
}

export async function buildFounderPilotProductionHistoryProductionPlan({
  adapter,
  inspectArtifact = inspectFounderPilotImmutableFile,
  manifest: rawManifest,
  now = () => new Date(),
  sourcePrismaRoot,
}) {
  const manifest =
    normalizeFounderPilotProductionHistoryProductionManifest(rawManifest);
  if (
    adapter === null ||
    typeof adapter !== "object" ||
    typeof adapter.inspectTarget !== "function" ||
    typeof inspectArtifact !== "function"
  ) {
    fail("FOUNDER_PRODUCTION_HISTORY_ADAPTER_INVALID");
  }
  const planned = validNow(now);
  const [tree, targetEvidence] = await Promise.all([
    inspectProductionReleaseIdentity({
      inspectArtifact,
      manifest,
      sourcePrismaRoot,
    }),
    adapter.inspectTarget(),
  ]);
  const identity = normalizeIdentityEvidence(
    targetEvidence.identity,
    manifest.target,
  );
  validateFounderPilotProductionHistorySourceEvidence({
    capturedAt: planned.toISOString(),
    evidence: targetEvidence,
    expectedStaleRunCount: EXACT_STALE_RUN_COUNT,
    expectedStaleRunSetDigest: null,
  });
  const productionStale = validateProductionStaleRunSet(
    targetEvidence.runningDigestRows,
    planned.toISOString(),
    manifest.operation.expectedStaleRunSetDigest,
  );
  const plan = {
    approvalKeyId: manifest.approval.keyId,
    approvalKeySpkiSha256: manifest.approval.publicKeySpkiSha256,
    artifactSha256: manifest.release.artifactSha256,
    contractVersion: FOUNDER_PILOT_PRODUCTION_HISTORY_PRODUCTION_CONTRACT,
    decision: FOUNDER_PILOT_PRODUCTION_HISTORY_PLAN_READY,
    expiresAt: new Date(
      planned.valueOf() + manifest.approval.maxPlanAgeSeconds * 1000,
    ).toISOString(),
    materializedTreeDigest: tree.treeDigest,
    plannedAt: planned.toISOString(),
    productionManifestDigest:
      founderPilotProductionHistoryProductionManifestDigest(manifest),
    releaseSha: manifest.release.releaseSha,
    sourceMigrationCount: targetEvidence.migrationCount,
    sourceMigrationManifestDigest: targetEvidence.migrationManifestDigest,
    sourceRolledBackMigrationCount: targetEvidence.rolledBackMigrationCount,
    sourceRolledBackMigrationManifestDigest:
      targetEvidence.rolledBackMigrationManifestDigest,
    sourceSchemaHead: targetEvidence.migrationHead,
    staleRunCount: productionStale.rows.length,
    staleRunSetDigest: productionStale.staleRunSetDigest,
    targetIdentityDigest: liveTargetIdentityDigest(identity),
  };
  return Object.freeze({
    ...plan,
    planDigest: digest("production-plan", plan),
  });
}

export async function inspectFounderPilotProductionHistoryProductionInventory({
  adapter,
  manifest: rawManifest,
  now = () => new Date(),
}) {
  const manifest =
    normalizeFounderPilotProductionHistoryProductionManifest(rawManifest);
  if (
    adapter === null ||
    typeof adapter !== "object" ||
    typeof adapter.inspectTarget !== "function"
  ) {
    fail("FOUNDER_PRODUCTION_HISTORY_ADAPTER_INVALID");
  }
  const observed = validNow(now);
  const targetEvidence = await adapter.inspectTarget();
  const identity = normalizeIdentityEvidence(
    targetEvidence.identity,
    manifest.target,
  );
  validateFounderPilotProductionHistorySourceEvidence({
    capturedAt: observed.toISOString(),
    evidence: targetEvidence,
    expectedStaleRunCount: EXACT_STALE_RUN_COUNT,
    expectedStaleRunSetDigest: null,
  });
  const stale = validateProductionStaleRunSet(
    targetEvidence.runningDigestRows,
    observed.toISOString(),
    null,
  );
  return Object.freeze({
    contractVersion: FOUNDER_PILOT_PRODUCTION_HISTORY_PRODUCTION_CONTRACT,
    decision: FOUNDER_PILOT_PRODUCTION_HISTORY_INVENTORY_READY,
    observedAt: observed.toISOString(),
    reasonCode: null,
    sourceMigrationCount: targetEvidence.migrationCount,
    sourceMigrationManifestDigest: targetEvidence.migrationManifestDigest,
    sourceRolledBackMigrationCount: targetEvidence.rolledBackMigrationCount,
    sourceRolledBackMigrationManifestDigest:
      targetEvidence.rolledBackMigrationManifestDigest,
    sourceSchemaHead: targetEvidence.migrationHead,
    staleRunCount: stale.rows.length,
    staleRunSetDigest: stale.staleRunSetDigest,
    targetIdentityDigest: liveTargetIdentityDigest(identity),
  });
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

function isAmbiguousError(error) {
  return (
    error?.ambiguous === true ||
    ["ECONNRESET", "EPIPE", "ETIMEDOUT", "57P01", "57P02", "57P03"].includes(
      error?.code,
    ) ||
    (typeof error?.code === "string" && error.code.startsWith("08"))
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

function isExactSourceMigrationState(evidence) {
  return (
    evidence.migrationCount ===
      FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.sourceMigrationCount &&
    evidence.migrationHead ===
      FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.sourceMigrationHead &&
    evidence.migrationManifestDigest ===
      FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.sourceMigrationManifestDigest &&
    evidence.rolledBackMigrationCount ===
      FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.sourceRolledBackMigrationCount &&
    evidence.rolledBackMigrationManifestDigest ===
      FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.sourceRolledBackMigrationManifestDigest &&
    evidence.unfinishedMigrationCount === 0
  );
}

function isPlausibleExactFinalMigrationState(evidence) {
  return (
    evidence.migrationCount ===
      FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.finalMigrationCount &&
    evidence.migrationHead ===
      FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.finalMigrationHead &&
    evidence.rolledBackMigrationCount ===
      FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.sourceRolledBackMigrationCount &&
    evidence.rolledBackMigrationManifestDigest ===
      FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.sourceRolledBackMigrationManifestDigest &&
    evidence.unfinishedMigrationCount === 0 &&
    evidence.runningDigestRows?.length === 0
  );
}

async function emitPhase(onPhase, phase, plan, extra = {}) {
  if (typeof onPhase !== "function") {
    fail("FOUNDER_PRODUCTION_HISTORY_PHASE_JOURNAL_REQUIRED");
  }
  await onPhase(
    Object.freeze({
      contractVersion: FOUNDER_PILOT_PRODUCTION_HISTORY_PRODUCTION_CONTRACT,
      phase,
      planDigest: plan.planDigest,
      ...extra,
    }),
  );
}

async function verifyFinal(adapter, laneRoot, target) {
  let targetEvidence = null;
  try {
    const result = await verifyFounderPilotProductionHistoryRehearsal({
      adapter: {
        inspectFinal: () => adapter.inspectFinal?.(),
        inspectTarget: async () => {
          targetEvidence = await adapter.inspectTarget();
          return targetEvidence;
        },
      },
      laneRoot,
    });
    normalizeIdentityEvidence(targetEvidence?.identity, target);
    return result;
  } catch (error) {
    if (error?.reasonCode === "FOUNDER_PILOT_HISTORY_FINAL_STATE_MISMATCH") {
      return null;
    }
    throw error;
  }
}

export async function verifyFounderPilotProductionHistoryProductionFinal({
  adapter,
  laneRoot,
  manifest: rawManifest,
}) {
  const manifest =
    normalizeFounderPilotProductionHistoryProductionManifest(rawManifest);
  const result = await verifyFinal(adapter, laneRoot, manifest.target);
  if (result === null) {
    fail("FOUNDER_PRODUCTION_HISTORY_FINAL_STATE_NOT_REACHED");
  }
  return result;
}

export async function applyFounderPilotProductionHistoryProductionPlan({
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
    FOUNDER_PILOT_PRODUCTION_HISTORY_PRODUCTION_CONFIRMATION
  ) {
    fail("FOUNDER_PRODUCTION_HISTORY_PRODUCTION_CONFIRMATION_REQUIRED");
  }
  const manifest =
    normalizeFounderPilotProductionHistoryProductionManifest(rawManifest);
  const plan = normalizePlan(rawPlan);
  if (!safeEqual(confirmPlanDigest, plan.planDigest)) {
    fail("FOUNDER_PRODUCTION_HISTORY_PLAN_CONFIRMATION_MISMATCH");
  }
  assertPlanWindow(plan, manifest, validNow(now));
  const approvalReceipt = verifyFounderPilotProductionHistoryProductionApproval(
    {
      approval,
      manifest,
      pinnedApprovalKeySpkiSha256,
      plan,
    },
  );
  if (
    adapter === null ||
    typeof adapter !== "object" ||
    typeof adapter.acquireLock !== "function" ||
    typeof adapter.releaseLock !== "function" ||
    typeof adapter.reconcile !== "function" ||
    typeof adapter.inspectReconciliation !== "function" ||
    typeof adapter.inspectTarget !== "function" ||
    typeof deploy !== "function"
  ) {
    fail("FOUNDER_PRODUCTION_HISTORY_ADAPTER_INVALID");
  }
  await emitPhase(onPhase, "APPROVAL_VERIFIED", plan, {
    approvalDigest: approvalReceipt.approvalDigest,
  });
  let lockHeld = false;
  try {
    await adapter.acquireLock();
    lockHeld = true;
    await emitPhase(onPhase, "CONTROLLER_LOCK_ACQUIRED", plan);
    let resumeAfterDurableReconciliation = false;
    try {
      const freshPlan = await buildFounderPilotProductionHistoryProductionPlan({
        adapter,
        inspectArtifact,
        manifest,
        now: () => new Date(plan.plannedAt),
        sourcePrismaRoot,
      });
      if (!safeEqual(freshPlan.planDigest, plan.planDigest)) {
        fail("FOUNDER_PRODUCTION_HISTORY_FRESH_PLAN_MISMATCH");
      }
    } catch (error) {
      if ((await adapter.inspectReconciliation(plan)) !== "APPLIED") {
        throw error;
      }
      const [tree, recoveredState] = await Promise.all([
        inspectProductionReleaseIdentity({
          inspectArtifact,
          manifest,
          sourcePrismaRoot,
        }),
        adapter.inspectTarget(),
      ]);
      const recoveredIdentity = normalizeIdentityEvidence(
        recoveredState.identity,
        manifest.target,
      );
      if (
        tree.treeDigest !== plan.materializedTreeDigest ||
        liveTargetIdentityDigest(recoveredIdentity) !==
          plan.targetIdentityDigest ||
        (!isExactSourceMigrationState(recoveredState) &&
          !isPlausibleExactFinalMigrationState(recoveredState))
      ) {
        fail("FOUNDER_PRODUCTION_HISTORY_RECOVERY_STATE_MISMATCH");
      }
      resumeAfterDurableReconciliation = true;
      await emitPhase(onPhase, "DURABLE_RECONCILIATION_RESUME_VERIFIED", plan);
    }
    const lane = await materializeFounderPilotProductionHistoryLane({
      laneRoot,
      sourcePrismaRoot,
    });
    if (lane.treeDigest !== plan.materializedTreeDigest) {
      fail("FOUNDER_PRODUCTION_HISTORY_MATERIALIZED_TREE_MISMATCH");
    }
    let reconciliationRecovered = false;
    if (!resumeAfterDurableReconciliation) {
      await emitPhase(onPhase, "RECONCILIATION_INTENT_DURABLE", plan, {
        materializedTreeDigest: lane.treeDigest,
      });
      try {
        const reconciled = await adapter.reconcile(plan, plan.plannedAt);
        if (reconciled !== EXACT_STALE_RUN_COUNT) {
          fail("FOUNDER_PRODUCTION_HISTORY_RECONCILIATION_COUNT_MISMATCH");
        }
      } catch (error) {
        if (
          !isAmbiguousError(error) ||
          typeof adapter.recoverLock !== "function"
        ) {
          throw error;
        }
        lockHeld = false;
        await adapter.recoverLock();
        lockHeld = true;
        if ((await adapter.inspectReconciliation(plan)) !== "APPLIED") {
          fail("FOUNDER_PRODUCTION_HISTORY_RECONCILIATION_AMBIGUOUS");
        }
        reconciliationRecovered = true;
      }
    }
    if ((await adapter.inspectReconciliation(plan)) !== "APPLIED") {
      fail("FOUNDER_PRODUCTION_HISTORY_RECONCILIATION_NOT_APPLIED");
    }
    await emitPhase(onPhase, "RECONCILIATION_VERIFIED", plan, {
      recoveredFromLostResponse: reconciliationRecovered,
    });

    const alreadyFinal = await verifyFinal(adapter, laneRoot, manifest.target);
    if (alreadyFinal !== null) {
      await emitPhase(onPhase, "FINAL_187_VERIFIED", plan, {
        deploymentAttempt: 0,
        recoveredFromLostResponse: true,
      });
      return Object.freeze({
        contractVersion: FOUNDER_PILOT_PRODUCTION_HISTORY_PRODUCTION_CONTRACT,
        decision: FOUNDER_PILOT_PRODUCTION_HISTORY_APPLIED,
        deploymentAttempt: 0,
        materializedTreeDigest: alreadyFinal.materializedTreeDigest,
        migrationCount: alreadyFinal.migrationCount,
        planDigest: plan.planDigest,
        reasonCode: null,
        reconciliationRecovered: true,
        rolledBackMigrationCount: alreadyFinal.rolledBackMigrationCount,
      });
    }

    let deploymentAttempt = 1;
    let deploymentRecovered = false;
    while (deploymentAttempt <= 2) {
      const freshLane = await materializeFounderPilotProductionHistoryLane({
        laneRoot,
        sourcePrismaRoot,
      });
      if (freshLane.treeDigest !== plan.materializedTreeDigest) {
        fail("FOUNDER_PRODUCTION_HISTORY_MATERIALIZED_TREE_MISMATCH");
      }
      await emitPhase(onPhase, "PRISMA_DEPLOY_INTENT_DURABLE", plan, {
        attempt: deploymentAttempt,
      });
      const result = await deploy({
        attempt: deploymentAttempt,
        databaseUrlRedactionRequired: true,
        laneRoot,
        timeoutSeconds: manifest.operation.deployTimeoutSeconds,
      });
      if (result?.status === "SUCCEEDED") {
        await emitPhase(onPhase, "PRISMA_DEPLOY_RESPONSE_SUCCEEDED", plan, {
          attempt: deploymentAttempt,
          deployment: boundedDeploymentEvidence(result),
        });
        break;
      }
      if (result?.status === "FAILED") {
        await emitPhase(onPhase, "PRISMA_DEPLOY_RESPONSE_FAILED", plan, {
          attempt: deploymentAttempt,
          deployment: boundedDeploymentEvidence(result),
        });
        fail("FOUNDER_PRODUCTION_HISTORY_PRISMA_DEPLOY_FAILED");
      }
      if (result?.status !== "AMBIGUOUS") {
        fail("FOUNDER_PRODUCTION_HISTORY_PRISMA_DEPLOY_RESULT_INVALID");
      }
      await emitPhase(onPhase, "PRISMA_DEPLOY_RESPONSE_AMBIGUOUS", plan, {
        attempt: deploymentAttempt,
        deployment: boundedDeploymentEvidence(result),
      });
      const final = await verifyFinal(adapter, laneRoot, manifest.target);
      if (final !== null) {
        deploymentRecovered = true;
        break;
      }
      const state = await adapter.inspectTarget();
      if (
        deploymentAttempt !== 1 ||
        !isExactSourceMigrationState(state) ||
        (await adapter.inspectReconciliation(plan)) !== "APPLIED"
      ) {
        fail("FOUNDER_PRODUCTION_HISTORY_PRISMA_DEPLOY_AMBIGUOUS");
      }
      deploymentAttempt += 1;
    }
    const final = await verifyFinal(adapter, laneRoot, manifest.target);
    if (final === null) {
      fail("FOUNDER_PRODUCTION_HISTORY_FINAL_STATE_NOT_REACHED");
    }
    await emitPhase(onPhase, "FINAL_187_VERIFIED", plan, {
      deploymentAttempt,
      recoveredFromLostResponse: deploymentRecovered,
    });
    return Object.freeze({
      contractVersion: FOUNDER_PILOT_PRODUCTION_HISTORY_PRODUCTION_CONTRACT,
      decision: FOUNDER_PILOT_PRODUCTION_HISTORY_APPLIED,
      deploymentAttempt,
      materializedTreeDigest: final.materializedTreeDigest,
      migrationCount: final.migrationCount,
      planDigest: plan.planDigest,
      reasonCode: null,
      reconciliationRecovered,
      rolledBackMigrationCount: final.rolledBackMigrationCount,
    });
  } finally {
    if (lockHeld) await adapter.releaseLock();
  }
}

function migrationSelectSql() {
  return `
    SELECT
      migration."migration_name" AS "migrationName",
      migration."checksum",
      migration."finished_at" IS NOT NULL
        AND migration."rolled_back_at" IS NULL AS "applied",
      migration."rolled_back_at" IS NOT NULL AS "rolledBack"
    FROM public."_prisma_migrations" AS migration
    ORDER BY migration."migration_name" COLLATE "C", migration."started_at"
  `;
}

function runningSelectSql() {
  return `
    SELECT
      run."id", run."tenantId", run."type", run."scheduledForDate",
      run."status", run."sentCount",
      run."startedAt" AT TIME ZONE 'UTC' AS "startedAt",
      run."completedAt" AT TIME ZONE 'UTC' AS "completedAt",
      (pg_catalog.to_jsonb(run)->>'executionRevision')::INTEGER
        AS "executionRevision",
      run."errorMessage",
      run."createdAt" AT TIME ZONE 'UTC' AS "createdAt",
      run."updatedAt" AT TIME ZONE 'UTC' AS "updatedAt"
    FROM public."ReportDigestScheduleRun" AS run
    WHERE run."status" = 'RUNNING'
    ORDER BY run."id" COLLATE "C"
  `;
}

function normalizeProductionEvidence(migrationRows, runningRows, identity) {
  return {
    ...normalizeFounderPilotProductionHistoryEvidence(
      migrationRows,
      runningRows,
    ),
    identity,
  };
}

function normalizePgIdentity(identityRow, runtimeRows, activeRuntimeRows) {
  return {
    activeRuntimeRoleNames: activeRuntimeRows.map((row) => row.name),
    currentDatabase: identityRow.currentDatabase,
    currentRoleDirectMembershipCount:
      identityRow.currentRoleDirectMembershipCount,
    databaseOwnerRoleName: identityRow.databaseOwnerRoleName,
    databaseOwnerRoleOid: identityRow.databaseOwnerRoleOid,
    currentRoleBypassRls: identityRow.currentRoleBypassRls,
    currentRoleCanLogin: identityRow.currentRoleCanLogin,
    currentRoleCreateDb: identityRow.currentRoleCreateDb,
    currentRoleCreateRole: identityRow.currentRoleCreateRole,
    currentRoleName: identityRow.currentRoleName,
    currentRoleOid: identityRow.currentRoleOid,
    currentRoleReplication: identityRow.currentRoleReplication,
    currentRoleSuperuser: identityRow.currentRoleSuperuser,
    inRecovery: identityRow.inRecovery,
    publicClassOwnerMismatchCount: identityRow.publicClassOwnerMismatchCount,
    publicProcOwnerMismatchCount: identityRow.publicProcOwnerMismatchCount,
    publicTypeOwnerMismatchCount: identityRow.publicTypeOwnerMismatchCount,
    runtimeRoles: runtimeRows.map((role) => ({
      bypassRls: role.bypassRls,
      canLogin: role.canLogin,
      createDb: role.createDb,
      createRole: role.createRole,
      name: role.name,
      oid: role.oid,
      replication: role.replication,
      superuser: role.superuser,
    })),
    sessionDirectMembershipCount: identityRow.sessionDirectMembershipCount,
    sessionOwnerMembershipCount: identityRow.sessionOwnerMembershipCount,
    sessionOwnerMembershipAdminOption:
      identityRow.sessionOwnerMembershipAdminOption,
    sessionOwnerMembershipInheritOption:
      identityRow.sessionOwnerMembershipInheritOption,
    sessionOwnerMembershipSetOption:
      identityRow.sessionOwnerMembershipSetOption,
    sessionRoleBypassRls: identityRow.sessionRoleBypassRls,
    sessionRoleCanLogin: identityRow.sessionRoleCanLogin,
    sessionRoleCreateDb: identityRow.sessionRoleCreateDb,
    sessionRoleCreateRole: identityRow.sessionRoleCreateRole,
    sessionRoleInherit: identityRow.sessionRoleInherit,
    sessionRoleName: identityRow.sessionRoleName,
    sessionRoleOid: identityRow.sessionRoleOid,
    sessionRoleReplication: identityRow.sessionRoleReplication,
    sessionRoleSuperuser: identityRow.sessionRoleSuperuser,
    serverAddress: identityRow.serverAddress,
    serverMajor: identityRow.serverMajor,
    serverPort: identityRow.serverPort,
    systemIdentifier: identityRow.systemIdentifier,
  };
}

export async function createFounderPilotProductionHistoryProductionPgAdapter(
  databaseUrl,
  rawManifest,
  { productionConfirmation } = {},
) {
  if (
    productionConfirmation !==
    FOUNDER_PILOT_PRODUCTION_HISTORY_PRODUCTION_CONFIRMATION
  ) {
    fail("FOUNDER_PRODUCTION_HISTORY_PRODUCTION_CONFIRMATION_REQUIRED");
  }
  const manifest =
    normalizeFounderPilotProductionHistoryProductionManifest(rawManifest);
  assertFounderPilotProductionHistoryProductionDatabaseUrl(
    databaseUrl,
    manifest.target,
  );
  let client = null;
  let lockedBackendPid = null;
  let closed = false;

  async function connect() {
    if (closed) fail("FOUNDER_PRODUCTION_HISTORY_ADAPTER_CLOSED");
    const next = new pg.Client({
      application_name: "founder_production_history_v1",
      connectionString: databaseUrl,
      connectionTimeoutMillis: 5000,
      query_timeout: 30_000,
    });
    await next.connect();
    client = next;
  }

  async function currentClient() {
    if (client === null) await connect();
    return client;
  }

  async function readTarget() {
    const active = await currentClient();
    await active.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    try {
      await active.query("SET LOCAL lock_timeout = '3s'");
      await active.query("SET LOCAL statement_timeout = '15s'");
      await active.query(
        "SET LOCAL idle_in_transaction_session_timeout = '20s'",
      );
      const identity = await active.query(`
        SELECT
          pg_catalog.current_database() AS "currentDatabase",
          database_owner.rolname AS "databaseOwnerRoleName",
          database_owner.oid::INTEGER AS "databaseOwnerRoleOid",
          session_role.rolname AS "sessionRoleName",
          session_role.oid::INTEGER AS "sessionRoleOid",
          session_role.rolcanlogin AS "sessionRoleCanLogin",
          session_role.rolcreatedb AS "sessionRoleCreateDb",
          session_role.rolcreaterole AS "sessionRoleCreateRole",
          session_role.rolinherit AS "sessionRoleInherit",
          session_role.rolreplication AS "sessionRoleReplication",
          session_role.rolsuper AS "sessionRoleSuperuser",
          session_role.rolbypassrls AS "sessionRoleBypassRls",
          effective_role.rolname AS "currentRoleName",
          effective_role.oid::INTEGER AS "currentRoleOid",
          effective_role.rolcanlogin AS "currentRoleCanLogin",
          effective_role.rolcreatedb AS "currentRoleCreateDb",
          effective_role.rolcreaterole AS "currentRoleCreateRole",
          effective_role.rolreplication AS "currentRoleReplication",
          effective_role.rolsuper AS "currentRoleSuperuser",
          effective_role.rolbypassrls AS "currentRoleBypassRls",
          membership_evidence."currentRoleDirectMembershipCount",
          membership_evidence."sessionDirectMembershipCount",
          membership_evidence."sessionOwnerMembershipCount",
          membership_evidence."sessionOwnerMembershipAdminOption",
          membership_evidence."sessionOwnerMembershipInheritOption",
          membership_evidence."sessionOwnerMembershipSetOption",
          ownership_evidence."publicClassOwnerMismatchCount",
          ownership_evidence."publicProcOwnerMismatchCount",
          ownership_evidence."publicTypeOwnerMismatchCount",
          pg_catalog.host(pg_catalog.inet_server_addr()) AS "serverAddress",
          pg_catalog.inet_server_port()::INTEGER AS "serverPort",
          (pg_catalog.pg_control_system()).system_identifier::TEXT
            AS "systemIdentifier",
          (pg_catalog.current_setting('server_version_num')::INTEGER / 10000)
            AS "serverMajor",
          pg_catalog.pg_is_in_recovery() AS "inRecovery"
        FROM pg_catalog.pg_roles AS session_role
        JOIN pg_catalog.pg_roles AS effective_role
          ON effective_role.rolname = CURRENT_USER
        JOIN pg_catalog.pg_database AS target_database
          ON target_database.datname = pg_catalog.current_database()
        JOIN pg_catalog.pg_roles AS database_owner
          ON database_owner.oid = target_database.datdba
        CROSS JOIN LATERAL (
          SELECT
            (
              pg_catalog.count(*) FILTER (
                WHERE membership.member = effective_role.oid
              )
            )::INTEGER AS "currentRoleDirectMembershipCount",
            (
              pg_catalog.count(*) FILTER (
                WHERE membership.member = session_role.oid
              )
            )::INTEGER AS "sessionDirectMembershipCount",
            (
              pg_catalog.count(*) FILTER (
                WHERE membership.member = session_role.oid
                  AND membership.roleid = effective_role.oid
              )
            )::INTEGER AS "sessionOwnerMembershipCount",
            COALESCE(
              pg_catalog.bool_or(membership.admin_option) FILTER (
                WHERE membership.member = session_role.oid
                  AND membership.roleid = effective_role.oid
              ),
              FALSE
            ) AS "sessionOwnerMembershipAdminOption",
            COALESCE(
              pg_catalog.bool_or(membership.inherit_option) FILTER (
                WHERE membership.member = session_role.oid
                  AND membership.roleid = effective_role.oid
              ),
              FALSE
            ) AS "sessionOwnerMembershipInheritOption",
            COALESCE(
              pg_catalog.bool_and(membership.set_option) FILTER (
                WHERE membership.member = session_role.oid
                  AND membership.roleid = effective_role.oid
              ),
              FALSE
            ) AS "sessionOwnerMembershipSetOption"
          FROM pg_catalog.pg_auth_members AS membership
          WHERE membership.member IN (session_role.oid, effective_role.oid)
        ) AS membership_evidence
        CROSS JOIN LATERAL (
          SELECT
            (
              SELECT pg_catalog.count(*)::INTEGER
              FROM pg_catalog.pg_class AS relation
              WHERE relation.relnamespace = pg_catalog.to_regnamespace('public')
                AND relation.relowner <> effective_role.oid
            ) AS "publicClassOwnerMismatchCount",
            (
              SELECT pg_catalog.count(*)::INTEGER
              FROM pg_catalog.pg_proc AS routine
              WHERE routine.pronamespace = pg_catalog.to_regnamespace('public')
                AND routine.proowner <> effective_role.oid
            ) AS "publicProcOwnerMismatchCount",
            (
              SELECT pg_catalog.count(*)::INTEGER
              FROM pg_catalog.pg_type AS data_type
              WHERE data_type.typnamespace = pg_catalog.to_regnamespace('public')
                AND data_type.typowner <> effective_role.oid
            ) AS "publicTypeOwnerMismatchCount"
        ) AS ownership_evidence
        WHERE session_role.rolname = SESSION_USER
      `);
      const roles = await active.query(
        `
          SELECT
            role.rolname AS "name",
            role.oid::INTEGER AS "oid",
            role.rolcanlogin AS "canLogin",
            role.rolcreatedb AS "createDb",
            role.rolcreaterole AS "createRole",
            role.rolreplication AS "replication",
            role.rolsuper AS "superuser",
            role.rolbypassrls AS "bypassRls"
          FROM pg_catalog.pg_roles AS role
          WHERE role.rolname = ANY($1::text[])
          ORDER BY role.rolname COLLATE "C"
        `,
        [manifest.target.applicationRuntimeRoles.map((role) => role.name)],
      );
      const activeRuntimeRoles = await active.query(`
        SELECT DISTINCT activity.usename COLLATE "C" AS "name"
        FROM pg_catalog.pg_stat_activity AS activity
        WHERE activity.datname = pg_catalog.current_database()
          AND activity.pid <> pg_catalog.pg_backend_pid()
          AND activity.backend_type = 'client backend'
        ORDER BY "name"
      `);
      const migrations = await active.query(migrationSelectSql());
      const runs = await active.query(runningSelectSql());
      await active.query("COMMIT");
      return normalizeProductionEvidence(
        migrations.rows,
        runs.rows,
        normalizePgIdentity(
          identity.rows[0],
          roles.rows,
          activeRuntimeRoles.rows,
        ),
      );
    } catch (error) {
      await active.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
  }

  async function acquireLock() {
    const active = await currentClient();
    const result = await active.query(
      `SELECT pg_catalog.pg_try_advisory_lock($1::bigint) AS "acquired",
              pg_catalog.pg_backend_pid()::INTEGER AS "backendPid"`,
      [CONTROLLER_LOCK_KEY],
    );
    if (result.rows[0]?.acquired !== true) {
      fail("FOUNDER_PRODUCTION_HISTORY_CONTROLLER_LOCK_BUSY");
    }
    lockedBackendPid = result.rows[0].backendPid;
  }

  async function assertLock() {
    const active = await currentClient();
    const result = await active.query(`
      SELECT
        pg_catalog.pg_backend_pid()::INTEGER AS "backendPid",
        pg_catalog.count(*)::INTEGER AS "lockCount"
      FROM pg_catalog.pg_locks AS lock
      WHERE lock.pid = pg_catalog.pg_backend_pid()
        AND lock.locktype = 'advisory'
        AND lock.granted
    `);
    if (
      lockedBackendPid === null ||
      result.rows[0]?.backendPid !== lockedBackendPid ||
      result.rows[0]?.lockCount !== 1
    ) {
      fail("FOUNDER_PRODUCTION_HISTORY_CONTROLLER_LOCK_LOST");
    }
  }

  async function releaseLock() {
    if (client === null || lockedBackendPid === null) return;
    const result = await client.query(
      `SELECT pg_catalog.pg_advisory_unlock($1::bigint) AS "released"`,
      [CONTROLLER_LOCK_KEY],
    );
    lockedBackendPid = null;
    if (result.rows[0]?.released !== true) {
      fail("FOUNDER_PRODUCTION_HISTORY_CONTROLLER_UNLOCK_FAILED");
    }
  }

  async function recoverLock() {
    await client?.end().catch(() => undefined);
    client = null;
    lockedBackendPid = null;
    await connect();
    await acquireLock();
  }

  async function reconcile(plan, capturedAt) {
    await assertLock();
    const active = await currentClient();
    await active.query("BEGIN ISOLATION LEVEL READ COMMITTED");
    try {
      await active.query("SET LOCAL lock_timeout = '3s'");
      await active.query("SET LOCAL statement_timeout = '20s'");
      await active.query(
        "SET LOCAL idle_in_transaction_session_timeout = '20s'",
      );
      await active.query(
        'LOCK TABLE public."_prisma_migrations" IN SHARE MODE',
      );
      await active.query(
        'LOCK TABLE public."ReportDigestScheduleRun" IN SHARE ROW EXCLUSIVE MODE',
      );
      const migrations = await active.query(migrationSelectSql());
      const runs = await active.query(runningSelectSql());
      const evidence = normalizeFounderPilotProductionHistoryEvidence(
        migrations.rows,
        runs.rows,
      );
      validateFounderPilotProductionHistorySourceEvidence({
        capturedAt,
        evidence,
        expectedStaleRunCount: EXACT_STALE_RUN_COUNT,
        expectedStaleRunSetDigest: null,
      });
      const productionStale = validateProductionStaleRunSet(
        runs.rows,
        capturedAt,
        plan.staleRunSetDigest,
      );
      const result = await active.query(
        `
          UPDATE public."ReportDigestScheduleRun" AS run
          SET
            "status" = 'FAILED',
            "completedAt" = ($2::timestamptz AT TIME ZONE 'UTC'),
            "errorMessage" = $3,
            "updatedAt" = ($2::timestamptz AT TIME ZONE 'UTC')
          WHERE run."id" = ANY($1::text[])
            AND run."status" = 'RUNNING'
            AND run."type" = 'WEEKLY'
            AND run."sentCount" = 0
            AND run."completedAt" IS NULL
            AND (pg_catalog.to_jsonb(run)->>'executionRevision') IS NULL
            AND run."errorMessage" IS NULL
        `,
        [
          productionStale.rows.map((row) => row.id),
          capturedAt,
          `${RECONCILIATION_MARKER}:${plan.staleRunSetDigest}`,
        ],
      );
      if (result.rowCount !== EXACT_STALE_RUN_COUNT) {
        fail("FOUNDER_PRODUCTION_HISTORY_RECONCILIATION_RACE");
      }
      await active.query("COMMIT");
      return result.rowCount;
    } catch (error) {
      await active.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
  }

  async function inspectReconciliation(plan) {
    const active = await currentClient();
    const result = await active.query(
      `
        SELECT pg_catalog.count(*)::INTEGER AS "count"
        FROM public."ReportDigestScheduleRun" AS run
        WHERE run."status" = 'FAILED'
          AND run."sentCount" = 0
          AND run."completedAt" IS NOT NULL
          AND (pg_catalog.to_jsonb(run)->>'executionRevision') IS NULL
          AND run."errorMessage" = $1
      `,
      [`${RECONCILIATION_MARKER}:${plan.staleRunSetDigest}`],
    );
    return result.rows[0]?.count === EXACT_STALE_RUN_COUNT
      ? "APPLIED"
      : "NOT_APPLIED";
  }

  async function inspectFinal() {
    const active = await currentClient();
    const result = await active.query(`
      SELECT
        pg_catalog.encode(
          pg_catalog.sha256(
            pg_catalog.convert_to(
              pg_catalog.string_agg(
                migration."migration_name" || ' ' || migration."checksum",
                E'\\n'
                ORDER BY migration."migration_name" COLLATE "C"
              ) FILTER (
                WHERE migration."migration_name" NOT IN (
                  '20260819010000_staff_attachment_parent_delete_guard',
                  '20260820010000_guest_portal_telegram_update_ledger'
                )
              ) || E'\\n',
              'UTF8'
            )
          ),
          'hex'
        ) AS "preterminalManifestDigest",
        (
          SELECT pg_catalog.encode(
            pg_catalog.sha256(pg_catalog.convert_to(routine.prosrc, 'UTF8')),
            'hex'
          )
          FROM pg_catalog.pg_proc AS routine
          WHERE routine.oid = pg_catalog.to_regprocedure(
            'public."identity_mail_delivery_worker_assert_v1"(text)'
          )
        ) AS "workerFunctionDigest"
      FROM public."_prisma_migrations" AS migration
      WHERE migration."finished_at" IS NOT NULL
        AND migration."rolled_back_at" IS NULL
    `);
    return result.rows[0];
  }

  await connect();
  return Object.freeze({
    acquireLock,
    assertLock,
    close: async () => {
      if (closed) return;
      closed = true;
      await client?.end().catch(() => undefined);
      client = null;
      lockedBackendPid = null;
    },
    inspectFinal,
    inspectReconciliation,
    inspectTarget: readTarget,
    reconcile,
    recoverLock,
    releaseLock,
  });
}

async function readBoundedRegularFile(filePath, maximumBytes, reasonCode) {
  absolutePath(filePath, reasonCode);
  const pathStat = await lstat(filePath, { bigint: true }).catch(() => null);
  if (pathStat === null || pathStat.isSymbolicLink() || !pathStat.isFile()) {
    fail(reasonCode);
  }
  const handle = await open(await realpath(filePath), fsConstants.O_RDONLY);
  try {
    const before = await handle.stat({ bigint: true });
    if (before.size <= 0n || before.size > BigInt(maximumBytes))
      fail(reasonCode);
    const bytes = Buffer.alloc(Number(before.size));
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    const after = await handle.stat({ bigint: true });
    if (
      bytesRead !== bytes.length ||
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs
    ) {
      fail(reasonCode);
    }
    return bytes;
  } finally {
    await handle.close();
  }
}

async function loadJson(filePath, maximumBytes, reasonCode) {
  const bytes = await readBoundedRegularFile(
    filePath,
    maximumBytes,
    reasonCode,
  );
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    fail(reasonCode);
  }
}

export async function loadFounderPilotProductionHistoryProductionManifest(
  filePath,
) {
  return normalizeFounderPilotProductionHistoryProductionManifest(
    await loadJson(
      filePath,
      MAX_MANIFEST_BYTES,
      "FOUNDER_PRODUCTION_HISTORY_MANIFEST_FILE_INVALID",
    ),
  );
}

export async function loadFounderPilotProductionHistoryProductionPlan(
  filePath,
) {
  return normalizePlan(
    await loadJson(
      filePath,
      MAX_PLAN_BYTES,
      "FOUNDER_PRODUCTION_HISTORY_PLAN_FILE_INVALID",
    ),
  );
}

export async function loadFounderPilotProductionHistoryProductionApproval(
  filePath,
) {
  return normalizeApproval(
    await loadJson(
      filePath,
      MAX_PLAN_BYTES,
      "FOUNDER_PRODUCTION_HISTORY_APPROVAL_FILE_INVALID",
    ),
  );
}

export async function loadFounderPilotProductionHistoryPrivateKey(filePath) {
  return (
    await readBoundedRegularFile(
      filePath,
      MAX_KEY_BYTES,
      "FOUNDER_PRODUCTION_HISTORY_PRIVATE_KEY_FILE_INVALID",
    )
  ).toString("utf8");
}

export const FOUNDER_PILOT_PRODUCTION_HISTORY_PRODUCTION_SQL = Object.freeze({
  advisoryLockKey: CONTROLLER_LOCK_KEY,
  reconciliationMarker: RECONCILIATION_MARKER,
});

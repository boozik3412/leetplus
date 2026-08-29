import { spawn } from "node:child_process";
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
import { constants as fsConstants } from "node:fs";
import {
  chmod,
  chown,
  lstat,
  open,
  readdir,
  readFile,
  realpath,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import pg from "pg";
import { inspectFounderPilotImmutableFile } from "./founder-pilot-restored-copy-preflight.mjs";
import {
  FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS,
  materializeFounderPilotProductionHistoryLane,
} from "./founder-pilot-production-history-rehearsal.mjs";
import {
  FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_CONSTANTS,
  createFounderPilotCurrent188ProductionBridgeRuntimeAdapter,
  founderPilotCurrent188BridgeAttestationInvariant,
  founderPilotCurrent188BridgeAttestationDigest,
  normalizeFounderPilotCurrent188BridgeAttestation,
} from "./founder-pilot-current188-production-upgrade.mjs";

export const FOUNDER_PILOT_CURRENT188_LEGACY_OWNERSHIP_CONTRACT =
  "FOUNDER_PILOT_CURRENT188_LEGACY_MIXED_OWNERSHIP_V2";
export const FOUNDER_PILOT_CURRENT188_LEGACY_OWNERSHIP_CONFIRMATION =
  "I_ACCEPT_CURRENT188_LEGACY_MIXED_OWNERSHIP_V2";
export const FOUNDER_PILOT_CURRENT188_LEGACY_OWNERSHIP_INVENTORY_READY =
  "CURRENT188_LEGACY_OWNERSHIP_INVENTORY_READY_NOT_AUTHORIZATION";
export const FOUNDER_PILOT_CURRENT188_LEGACY_OWNERSHIP_PLAN_READY =
  "CURRENT188_LEGACY_OWNERSHIP_PLAN_READY";
export const FOUNDER_PILOT_CURRENT188_LEGACY_OWNERSHIP_APPLIED =
  "CURRENT188_LEGACY_OWNERSHIP_APPLIED";

const SOURCE_COUNT = 187;
const SOURCE_HEAD = "20260820010000_guest_portal_telegram_update_ledger";
const TARGET_COUNT = 188;
const TARGET_HEAD = "20260828190000_guest_support_bug_reports";
const TARGET_MIGRATION_SHA256 =
  "c40d5eeb84cc980053af48b56385bf48882ee355aec718a442dab855ea33eb9b";
const SOURCE_WORKER_FUNCTION_SHA256 =
  "a7dd17037ceaccb294953dce145e0fcc589fb2646962db724d919c24ba87c53c";
const TARGET_WORKER_FUNCTION_SHA256 =
  "a9a4bf75b8d5a381ebfc5ed9a35c6b966cbaac9b631a321ee66c1a6c1cc113a5";
const SOURCE_WORKER_FUNCTION_COMMENT =
  "Fail-closed identity mail worker readiness receipt bound to exact CURRENT_187 while preserving the approved CURRENT_185 preterminal digest boundary.";
const TARGET_WORKER_FUNCTION_COMMENT =
  "Fail-closed identity mail worker readiness receipt bound to exact CURRENT_188 while preserving the approved CURRENT_185 preterminal digest boundary.";
const TARGET_PRETERMINAL_MANIFEST_SHA256 =
  "094f3ad34ef8846f6088f51d5fb9491ff89af4509b60063453c22af07466d99b";
const TARGET_SUPPORT_CATALOG_SHA256 =
  "3aeb4f73b99b849ff90dccb27600fb0b2d9ab17d75e7c33afd05d179ddf18d88";
const CONTROLLER_LOCK_KEY = "781920260828188";
const BRIDGE_SOURCE_PHASE = "SOURCE_187";
const BRIDGE_TARGET_PHASE = "TARGET_188";
const SHA40 = /^[0-9a-f]{40}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const SAFE_IDENTIFIER = /^[a-z][a-z0-9_]{0,62}$/u;
const SAFE_KEY_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/u;
const BASE64URL_SIGNATURE = /^[A-Za-z0-9_-]{86}$/u;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const SAFE_LANE_PARENT = "/var/lib/leetplus/current188-legacy-lanes";
const SAFE_POSTGRES_SOCKET_DIRECTORY = "/var/run/postgresql";
const SAFE_API_UNIT_TEMPLATE = "/etc/systemd/system/leetplus-api@.service";
const SAFE_CANARY_ENVIRONMENT = "/etc/leetplus/canary-safe.env";
const SAFE_LEGACY_DRAIN_RECEIPT =
  "/var/lib/leetplus/legacy-drain/activation.receipt";
const SAFE_LEGACY_DRAIN_VERIFIER =
  "/usr/local/libexec/leetplus/verify-legacy-runtime-drain.sh";
const MAX_CHILD_OUTPUT_BYTES = 128 * 1024;
const REQUIRED_DISABLED_WORKER_ENVIRONMENT = Object.freeze({
  GUEST_ACTIVITY_LEDGER_SCHEDULER_ENABLED: "false",
  GUEST_GAME_BONUS_LEDGER_SCHEDULER_ENABLED: "false",
  GUEST_GAME_BOT_CONSUMER_ENABLED: "false",
  GUEST_GAME_PIPELINE_SCHEDULER_ENABLED: "false",
  GUEST_GAME_RETENTION_SCHEDULER_ENABLED: "false",
  GUEST_GAME_REWARD_MATERIALIZER_ENABLED: "false",
  IDENTITY_MAIL_WORKER_ENABLED: "false",
  LANGAME_DAILY_SYNC_SCHEDULER_ENABLED: "false",
  REPORT_DIGEST_SCHEDULER_ENABLED: "false",
  STAFF_TASK_RULES_SCHEDULER_ENABLED: "false",
});
const FORBIDDEN_MANUAL_UNITS = Object.freeze([
  "leetplus-user-call-api.service",
  "leetplus-user-call-web.service",
]);
const DRAINED_BACKGROUND_UNITS = Object.freeze([
  "leetplus-api.service",
  "leetplus-deploy.service",
  "leetplus-deploy.timer",
  "leetplus-guest-game-bot-consumer.service",
  "leetplus-guest-game-bot-consumer.timer",
  "leetplus-web.service",
]);

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

const SUPPORT_TABLES = Object.freeze([
  "GuestSupportAttachment",
  "GuestSupportTicket",
  "GuestSupportTicketAuditEvent",
  "GuestSupportTicketComment",
]);
const SUPPORT_ENUMS = Object.freeze([
  Object.freeze({
    labels: Object.freeze(["PENDING", "AVAILABLE", "REJECTED"]),
    name: "GuestSupportAttachmentState",
  }),
  Object.freeze({
    labels: Object.freeze(["NEW", "IN_PROGRESS", "RESOLVED", "CLOSED"]),
    name: "GuestSupportTicketStatus",
  }),
]);
const SUPPORT_INDEXES = Object.freeze(
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
const SUPPORT_CONSTRAINTS = Object.freeze(
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
const SUPPORT_RELATIONS = Object.freeze(
  [...SUPPORT_TABLES, ...SUPPORT_INDEXES].sort(),
);
const SUPPORT_TYPES = Object.freeze(
  [
    ...SUPPORT_TABLES,
    ...SUPPORT_TABLES.map((name) => `_${name}`),
    ...SUPPORT_ENUMS.map(({ name }) => name),
    ...SUPPORT_ENUMS.map(({ name }) => `_${name}`),
  ].sort(),
);
const EXPECTED_RUNTIME_TABLE_PRIVILEGES = Object.freeze({
  GuestSupportAttachment: Object.freeze(["INSERT", "SELECT"]),
  GuestSupportTicket: Object.freeze(["INSERT", "SELECT", "UPDATE"]),
  GuestSupportTicketAuditEvent: Object.freeze(["INSERT", "SELECT"]),
  GuestSupportTicketComment: Object.freeze(["INSERT", "SELECT"]),
});

export class FounderPilotCurrent188LegacyOwnershipError extends Error {
  constructor(reasonCode) {
    super(reasonCode);
    this.name = "FounderPilotCurrent188LegacyOwnershipError";
    this.reasonCode = reasonCode;
  }
}

function fail(reasonCode) {
  throw new FounderPilotCurrent188LegacyOwnershipError(reasonCode);
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right, "en"))
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }
  return value;
}

function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function digest(domain, value) {
  return sha256(
    `${FOUNDER_PILOT_CURRENT188_LEGACY_OWNERSHIP_CONTRACT}\0${domain}\0${stableJson(value)}`,
  );
}

function safeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  return (
    leftBytes.length === rightBytes.length &&
    timingSafeEqual(leftBytes, rightBytes)
  );
}

function exactRecord(value, keys, reasonCode) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(reasonCode);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (stableJson(actual) !== stableJson(expected)) fail(reasonCode);
  return value;
}

function nonEmptyString(value, reasonCode, maximum = 256) {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > maximum ||
    value !== value.trim() ||
    value.includes("\0")
  ) {
    fail(reasonCode);
  }
  return value;
}

function identifier(value, reasonCode) {
  if (typeof value !== "string" || !SAFE_IDENTIFIER.test(value)) {
    fail(reasonCode);
  }
  return value;
}

function positiveInteger(value, reasonCode, maximum = 2_147_483_647) {
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    fail(reasonCode);
  }
  return value;
}

function sha256Value(value, reasonCode) {
  if (typeof value !== "string" || !SHA256.test(value)) fail(reasonCode);
  return value;
}

function currentDate(now) {
  const value = now();
  if (!(value instanceof Date) || !Number.isFinite(value.valueOf())) {
    fail("CURRENT188_LEGACY_CLOCK_INVALID");
  }
  return value;
}

function normalizeRole(value) {
  const role = exactRecord(
    value,
    [
      "bypassRls",
      "canLogin",
      "createDb",
      "createRole",
      "inherit",
      "name",
      "oid",
      "replication",
      "superuser",
    ],
    "CURRENT188_LEGACY_ROLE_INVALID",
  );
  for (const key of [
    "bypassRls",
    "canLogin",
    "createDb",
    "createRole",
    "inherit",
    "replication",
    "superuser",
  ]) {
    if (typeof role[key] !== "boolean") fail("CURRENT188_LEGACY_ROLE_INVALID");
  }
  return Object.freeze({
    bypassRls: role.bypassRls,
    canLogin: role.canLogin,
    createDb: role.createDb,
    createRole: role.createRole,
    inherit: role.inherit,
    name: identifier(role.name, "CURRENT188_LEGACY_ROLE_INVALID"),
    oid: positiveInteger(role.oid, "CURRENT188_LEGACY_ROLE_INVALID"),
    replication: role.replication,
    superuser: role.superuser,
  });
}

function roleReference(value, reasonCode) {
  const role = exactRecord(value, ["name", "oid"], reasonCode);
  return Object.freeze({
    name: identifier(role.name, reasonCode),
    oid: positiveInteger(role.oid, reasonCode),
  });
}

function roleEqual(left, right) {
  return left?.name === right.name && left?.oid === right.oid;
}

function normalizeTarget(value) {
  const target = exactRecord(
    value,
    [
      "activeRuntimeRoleNames",
      "applicationRuntimeRole",
      "databaseName",
      "databaseOwnerRole",
      "expectedHistoricalOwnershipDigest",
      "expectedRoleMembershipDigest",
      "expectedRoles",
      "expectedServerMajor",
      "expectedSupportCatalogDigest",
      "expectedSystemIdentifier",
      "host",
      "inspectionRole",
      "port",
      "privilegedExecutionRole",
      "socketDirectory",
      "workerFunctionOwnerRole",
    ],
    "CURRENT188_LEGACY_TARGET_INVALID",
  );
  const expectedRoles = target.expectedRoles
    .map(normalizeRole)
    .sort((left, right) => left.name.localeCompare(right.name, "en"));
  if (
    expectedRoles.length < 3 ||
    new Set(expectedRoles.map(({ name }) => name)).size !==
      expectedRoles.length ||
    new Set(expectedRoles.map(({ oid }) => oid)).size !== expectedRoles.length
  ) {
    fail("CURRENT188_LEGACY_TARGET_INVALID");
  }
  const result = {
    activeRuntimeRoleNames: target.activeRuntimeRoleNames.map((name) =>
      identifier(name, "CURRENT188_LEGACY_TARGET_INVALID"),
    ),
    applicationRuntimeRole: roleReference(
      target.applicationRuntimeRole,
      "CURRENT188_LEGACY_TARGET_INVALID",
    ),
    databaseName: identifier(
      target.databaseName,
      "CURRENT188_LEGACY_TARGET_INVALID",
    ),
    databaseOwnerRole: roleReference(
      target.databaseOwnerRole,
      "CURRENT188_LEGACY_TARGET_INVALID",
    ),
    expectedHistoricalOwnershipDigest: sha256Value(
      target.expectedHistoricalOwnershipDigest,
      "CURRENT188_LEGACY_TARGET_INVALID",
    ),
    expectedRoleMembershipDigest: sha256Value(
      target.expectedRoleMembershipDigest,
      "CURRENT188_LEGACY_TARGET_INVALID",
    ),
    expectedRoles: Object.freeze(expectedRoles),
    expectedServerMajor: positiveInteger(
      target.expectedServerMajor,
      "CURRENT188_LEGACY_TARGET_INVALID",
      99,
    ),
    expectedSupportCatalogDigest: sha256Value(
      target.expectedSupportCatalogDigest,
      "CURRENT188_LEGACY_TARGET_INVALID",
    ),
    expectedSystemIdentifier: nonEmptyString(
      target.expectedSystemIdentifier,
      "CURRENT188_LEGACY_TARGET_INVALID",
      32,
    ),
    host: nonEmptyString(target.host, "CURRENT188_LEGACY_TARGET_INVALID", 64),
    inspectionRole: roleReference(
      target.inspectionRole,
      "CURRENT188_LEGACY_TARGET_INVALID",
    ),
    port: positiveInteger(
      target.port,
      "CURRENT188_LEGACY_TARGET_INVALID",
      65535,
    ),
    privilegedExecutionRole: roleReference(
      target.privilegedExecutionRole,
      "CURRENT188_LEGACY_TARGET_INVALID",
    ),
    socketDirectory: nonEmptyString(
      target.socketDirectory,
      "CURRENT188_LEGACY_TARGET_INVALID",
      128,
    ),
    workerFunctionOwnerRole: roleReference(
      target.workerFunctionOwnerRole,
      "CURRENT188_LEGACY_TARGET_INVALID",
    ),
  };
  result.activeRuntimeRoleNames.sort();
  if (
    new Set(result.activeRuntimeRoleNames).size !==
      result.activeRuntimeRoleNames.length ||
    result.host !== "127.0.0.1" ||
    result.socketDirectory !== SAFE_POSTGRES_SOCKET_DIRECTORY ||
    result.expectedServerMajor !== 16 ||
    result.expectedSupportCatalogDigest !== TARGET_SUPPORT_CATALOG_SHA256 ||
    result.privilegedExecutionRole.name !== "postgres" ||
    !roleEqual(result.privilegedExecutionRole, result.workerFunctionOwnerRole)
  ) {
    fail("CURRENT188_LEGACY_TARGET_INVALID");
  }
  for (const reference of [
    result.applicationRuntimeRole,
    result.databaseOwnerRole,
    result.inspectionRole,
    result.privilegedExecutionRole,
    result.workerFunctionOwnerRole,
  ]) {
    if (!expectedRoles.some((role) => roleEqual(role, reference))) {
      fail("CURRENT188_LEGACY_TARGET_INVALID");
    }
  }
  const applicationRole = expectedRoles.find((role) =>
    roleEqual(role, result.applicationRuntimeRole),
  );
  const inspectionRole = expectedRoles.find((role) =>
    roleEqual(role, result.inspectionRole),
  );
  const privilegedRole = expectedRoles.find((role) =>
    roleEqual(role, result.privilegedExecutionRole),
  );
  if (
    !applicationRole.canLogin ||
    applicationRole.superuser ||
    applicationRole.createDb ||
    applicationRole.createRole ||
    applicationRole.replication ||
    applicationRole.bypassRls ||
    !inspectionRole.canLogin ||
    inspectionRole.superuser ||
    privilegedRole.name !== "postgres" ||
    !privilegedRole.superuser
  ) {
    fail("CURRENT188_LEGACY_TARGET_INVALID");
  }
  return Object.freeze({
    ...result,
    activeRuntimeRoleNames: Object.freeze(result.activeRuntimeRoleNames),
  });
}

export function normalizeFounderPilotCurrent188LegacyOwnershipManifest(value) {
  const manifest = exactRecord(
    value,
    [
      "approval",
      "contractVersion",
      "environment",
      "operation",
      "release",
      "runtimeSafety",
      "target",
    ],
    "CURRENT188_LEGACY_MANIFEST_INVALID",
  );
  if (
    manifest.contractVersion !==
      FOUNDER_PILOT_CURRENT188_LEGACY_OWNERSHIP_CONTRACT ||
    manifest.environment !== "PRODUCTION"
  ) {
    fail("CURRENT188_LEGACY_MANIFEST_INVALID");
  }
  const approval = exactRecord(
    manifest.approval,
    [
      "keyId",
      "maxPlanAgeSeconds",
      "maxRecoveryAgeSeconds",
      "publicKeyPem",
      "publicKeySpkiSha256",
    ],
    "CURRENT188_LEGACY_APPROVAL_CONFIG_INVALID",
  );
  const operation = exactRecord(
    manifest.operation,
    ["deployTimeoutSeconds"],
    "CURRENT188_LEGACY_OPERATION_INVALID",
  );
  const release = exactRecord(
    manifest.release,
    ["artifactPath", "artifactSha256", "materializedTreeDigest", "releaseSha"],
    "CURRENT188_LEGACY_RELEASE_INVALID",
  );
  const runtimeSafety = exactRecord(
    manifest.runtimeSafety,
    [
      "apiUnitTemplatePath",
      "apiUnitTemplateSha256",
      "canaryEnvironmentPath",
      "canaryEnvironmentSha256",
      "expectedSystemdUnitInventoryDigest",
      "legacyDrainReceiptPath",
      "legacyDrainReceiptSha256",
      "legacyDrainVerifierPath",
      "legacyDrainVerifierSha256",
    ],
    "CURRENT188_LEGACY_RUNTIME_SAFETY_INVALID",
  );
  if (
    typeof approval.keyId !== "string" ||
    !SAFE_KEY_ID.test(approval.keyId) ||
    !Number.isInteger(approval.maxPlanAgeSeconds) ||
    approval.maxPlanAgeSeconds < 60 ||
    approval.maxPlanAgeSeconds > 3600 ||
    !Number.isInteger(approval.maxRecoveryAgeSeconds) ||
    approval.maxRecoveryAgeSeconds < approval.maxPlanAgeSeconds ||
    approval.maxRecoveryAgeSeconds > 86400 ||
    !Number.isInteger(operation.deployTimeoutSeconds) ||
    operation.deployTimeoutSeconds < 30 ||
    operation.deployTimeoutSeconds > 900 ||
    typeof release.artifactPath !== "string" ||
    !path.isAbsolute(release.artifactPath) ||
    typeof release.releaseSha !== "string" ||
    !SHA40.test(release.releaseSha)
  ) {
    fail("CURRENT188_LEGACY_MANIFEST_INVALID");
  }
  if (
    runtimeSafety.apiUnitTemplatePath !== SAFE_API_UNIT_TEMPLATE ||
    runtimeSafety.canaryEnvironmentPath !== SAFE_CANARY_ENVIRONMENT ||
    runtimeSafety.legacyDrainReceiptPath !== SAFE_LEGACY_DRAIN_RECEIPT ||
    runtimeSafety.legacyDrainVerifierPath !== SAFE_LEGACY_DRAIN_VERIFIER
  ) {
    fail("CURRENT188_LEGACY_RUNTIME_SAFETY_INVALID");
  }
  const publicKeyPem = approval.publicKeyPem;
  if (
    typeof publicKeyPem !== "string" ||
    publicKeyPem.length < 64 ||
    publicKeyPem.length > 4096 ||
    publicKeyPem.includes("\0")
  ) {
    fail("CURRENT188_LEGACY_APPROVAL_CONFIG_INVALID");
  }
  let publicKey;
  try {
    publicKey = createPublicKey(publicKeyPem);
  } catch {
    fail("CURRENT188_LEGACY_APPROVAL_CONFIG_INVALID");
  }
  if (
    publicKey.asymmetricKeyType !== "ed25519" ||
    sha256(publicKey.export({ format: "der", type: "spki" })) !==
      approval.publicKeySpkiSha256
  ) {
    fail("CURRENT188_LEGACY_APPROVAL_CONFIG_INVALID");
  }
  return Object.freeze({
    approval: Object.freeze({
      keyId: approval.keyId,
      maxPlanAgeSeconds: approval.maxPlanAgeSeconds,
      maxRecoveryAgeSeconds: approval.maxRecoveryAgeSeconds,
      publicKeyPem,
      publicKeySpkiSha256: sha256Value(
        approval.publicKeySpkiSha256,
        "CURRENT188_LEGACY_APPROVAL_CONFIG_INVALID",
      ),
    }),
    contractVersion: FOUNDER_PILOT_CURRENT188_LEGACY_OWNERSHIP_CONTRACT,
    environment: "PRODUCTION",
    operation: Object.freeze({
      deployTimeoutSeconds: operation.deployTimeoutSeconds,
    }),
    release: Object.freeze({
      artifactPath: release.artifactPath,
      artifactSha256: sha256Value(
        release.artifactSha256,
        "CURRENT188_LEGACY_RELEASE_INVALID",
      ),
      materializedTreeDigest: sha256Value(
        release.materializedTreeDigest,
        "CURRENT188_LEGACY_RELEASE_INVALID",
      ),
      releaseSha: release.releaseSha,
    }),
    runtimeSafety: Object.freeze({
      apiUnitTemplatePath: runtimeSafety.apiUnitTemplatePath,
      apiUnitTemplateSha256: sha256Value(
        runtimeSafety.apiUnitTemplateSha256,
        "CURRENT188_LEGACY_RUNTIME_SAFETY_INVALID",
      ),
      canaryEnvironmentPath: runtimeSafety.canaryEnvironmentPath,
      canaryEnvironmentSha256: sha256Value(
        runtimeSafety.canaryEnvironmentSha256,
        "CURRENT188_LEGACY_RUNTIME_SAFETY_INVALID",
      ),
      expectedSystemdUnitInventoryDigest: sha256Value(
        runtimeSafety.expectedSystemdUnitInventoryDigest,
        "CURRENT188_LEGACY_RUNTIME_SAFETY_INVALID",
      ),
      legacyDrainReceiptPath: runtimeSafety.legacyDrainReceiptPath,
      legacyDrainReceiptSha256: sha256Value(
        runtimeSafety.legacyDrainReceiptSha256,
        "CURRENT188_LEGACY_RUNTIME_SAFETY_INVALID",
      ),
      legacyDrainVerifierPath: runtimeSafety.legacyDrainVerifierPath,
      legacyDrainVerifierSha256: sha256Value(
        runtimeSafety.legacyDrainVerifierSha256,
        "CURRENT188_LEGACY_RUNTIME_SAFETY_INVALID",
      ),
    }),
    target: normalizeTarget(manifest.target),
  });
}

export function founderPilotCurrent188LegacyOwnershipManifestDigest(value) {
  return digest(
    "production-manifest",
    normalizeFounderPilotCurrent188LegacyOwnershipManifest(value),
  );
}

function migrationDigest(rows) {
  return sha256(
    rows
      .map(({ checksum, migrationName }) => `${migrationName}\0${checksum}`)
      .sort()
      .join("\n"),
  );
}

function ownershipDigest(rows) {
  return sha256(
    rows
      .map((row) =>
        [
          row.aclIsNull,
          row.aclText,
          row.kind,
          row.objectOid,
          row.objectName,
          row.signature,
          row.ownerOid,
          row.ownerName,
        ].join("\0"),
      )
      .sort()
      .join("\n"),
  );
}

function membershipDigest(rows) {
  return sha256(
    rows
      .map((row) =>
        [
          row.roleName,
          row.roleOid,
          row.memberName,
          row.memberOid,
          row.adminOption,
          row.inheritOption,
          row.setOption,
        ].join("\0"),
      )
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
  if (lane.treeDigest.length !== 64) {
    fail("CURRENT188_LEGACY_MATERIALIZED_TREE_INVALID");
  }
  const migrationsRoot = path.join(laneRoot, "migrations");
  const names = (await readdir(migrationsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  if (names.length !== TARGET_COUNT || names.at(-1) !== TARGET_HEAD) {
    fail("CURRENT188_LEGACY_MATERIALIZED_TREE_INVALID");
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
  if (
    rows.at(-1)?.migrationName !== TARGET_HEAD ||
    rows.at(-1)?.checksum !== TARGET_MIGRATION_SHA256
  ) {
    fail("CURRENT188_LEGACY_TARGET_MIGRATION_DRIFT");
  }
  return Object.freeze({
    finalManifestDigest: migrationDigest(rows),
    sourceManifestDigest: migrationDigest(rows.slice(0, -1)),
    sourceRows: Object.freeze(rows.slice(0, -1).map(Object.freeze)),
    targetRows: Object.freeze(rows.map(Object.freeze)),
    treeDigest: lane.treeDigest,
  });
}

async function inspectRelease({
  inspectArtifact = inspectFounderPilotImmutableFile,
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
    fail("CURRENT188_LEGACY_MATERIALIZED_TREE_MISMATCH");
  }
  return Object.freeze({ artifact, lane });
}

function arraysEqual(left, right) {
  return (
    Array.isArray(left) &&
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function rolesEqual(actual, expected) {
  return stableJson(actual) === stableJson(expected);
}

function exactIdentity(evidence, target) {
  return (
    evidence?.currentDatabase === target.databaseName &&
    evidence?.databaseOwnerRoleName === target.databaseOwnerRole.name &&
    evidence?.databaseOwnerRoleOid === target.databaseOwnerRole.oid &&
    evidence?.sessionRoleName === target.inspectionRole.name &&
    evidence?.sessionRoleOid === target.inspectionRole.oid &&
    evidence?.serverAddress === target.host &&
    evidence?.serverPort === target.port &&
    evidence?.serverMajor === target.expectedServerMajor &&
    evidence?.systemIdentifier === target.expectedSystemIdentifier &&
    evidence?.inRecovery === false &&
    evidence?.historicalOwnershipDigest ===
      target.expectedHistoricalOwnershipDigest &&
    evidence?.roleMembershipDigest === target.expectedRoleMembershipDigest &&
    evidence?.applicationRuntimeSchemaUsage === true &&
    evidence?.applicationRuntimeSchemaCreate === false &&
    arraysEqual(
      evidence?.activeRuntimeRoleNames,
      target.activeRuntimeRoleNames,
    ) &&
    rolesEqual(evidence?.roles, target.expectedRoles) &&
    evidence?.workerFunctionOwnerRoleName ===
      target.workerFunctionOwnerRole.name &&
    evidence?.workerFunctionOwnerRoleOid === target.workerFunctionOwnerRole.oid
  );
}

function appliedRows(evidence) {
  return (evidence?.migrationRows ?? [])
    .filter((row) => row.applied === true)
    .map(({ checksum, migrationName }) => ({ checksum, migrationName }));
}

function rowsEqual(actual, expected) {
  return (
    actual.length === expected.length &&
    actual.every(
      (row, index) =>
        row.migrationName === expected[index].migrationName &&
        row.checksum === expected[index].checksum,
    )
  );
}

function exactLedger(evidence, lane, target) {
  const expectedRows = target ? lane.targetRows : lane.sourceRows;
  return (
    evidence?.migrationCount === (target ? TARGET_COUNT : SOURCE_COUNT) &&
    evidence?.migrationHead === (target ? TARGET_HEAD : SOURCE_HEAD) &&
    evidence?.migrationManifestDigest ===
      (target ? lane.finalManifestDigest : lane.sourceManifestDigest) &&
    evidence?.rolledBackMigrationCount ===
      FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.sourceRolledBackMigrationCount &&
    evidence?.rolledBackMigrationManifestDigest ===
      FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.sourceRolledBackMigrationManifestDigest &&
    evidence?.unfinishedMigrationCount === 0 &&
    rowsEqual(appliedRows(evidence), expectedRows)
  );
}

function supportStructureExact(support, runtimeRole, { aclMode }) {
  if (
    !arraysEqual(support?.tableNames, SUPPORT_TABLES) ||
    !arraysEqual(support?.indexNames, SUPPORT_INDEXES) ||
    !arraysEqual(support?.constraintNames, SUPPORT_CONSTRAINTS) ||
    stableJson(support?.enumTypes) !== stableJson(SUPPORT_ENUMS) ||
    support?.migrationChecksum !== TARGET_MIGRATION_SHA256 ||
    support?.publicWorkerExecuteCount !== 0 ||
    (support?.catalogDigest !== undefined &&
      support.catalogDigest !== null &&
      typeof support.catalogDigest !== "string") ||
    support?.workerFunctionOwnerRoleName !== "postgres"
  ) {
    return false;
  }
  if (
    support.tableAccess.length !== SUPPORT_TABLES.length ||
    support.typeAccess.length !== SUPPORT_ENUMS.length ||
    !support.tableAccess.every(
      (entry) =>
        SUPPORT_TABLES.includes(entry.name) && entry.ownerName === "postgres",
    ) ||
    !support.typeAccess.every(
      (entry) =>
        SUPPORT_ENUMS.some(({ name }) => name === entry.name) &&
        entry.ownerName === "postgres",
    )
  ) {
    return false;
  }
  if (aclMode === "PRE_GRANT") {
    return (
      support.publicTablePrivilegeCount === 0 &&
      support.publicTypePrivilegeCount === SUPPORT_ENUMS.length &&
      support.tableAccess.every(
        (entry) => stableJson(entry.nonOwnerPrivileges) === "[]",
      ) &&
      support.typeAccess.every(
        (entry) =>
          stableJson(entry.nonOwnerPrivileges) ===
          stableJson([
            { grantable: false, grantee: "PUBLIC", privilege: "USAGE" },
          ]),
      )
    );
  }
  if (aclMode !== "FINAL") return false;
  return (
    support.publicTablePrivilegeCount === 0 &&
    support.publicTypePrivilegeCount === 0 &&
    support.tableAccess.every(
      (entry) =>
        stableJson(entry.nonOwnerPrivileges) ===
        stableJson(
          EXPECTED_RUNTIME_TABLE_PRIVILEGES[entry.name].map((privilege) => ({
            grantable: false,
            grantee: runtimeRole,
            privilege,
          })),
        ),
    ) &&
    support.typeAccess.length === SUPPORT_ENUMS.length &&
    support.typeAccess.every(
      (entry) =>
        stableJson(entry.nonOwnerPrivileges) ===
        stableJson([
          { grantable: false, grantee: runtimeRole, privilege: "USAGE" },
        ]),
    )
  );
}

function exactSourceState(evidence, lane, manifest) {
  return (
    exactIdentity(evidence, manifest.target) &&
    exactLedger(evidence, lane, false) &&
    evidence.workerFunctionDigest === SOURCE_WORKER_FUNCTION_SHA256 &&
    evidence.workerFunctionComment === SOURCE_WORKER_FUNCTION_COMMENT &&
    evidence.support.tableNames.length === 0 &&
    evidence.support.enumTypes.length === 0
  );
}

function exactTargetBase(evidence, lane, manifest) {
  return (
    exactIdentity(evidence, manifest.target) &&
    exactLedger(evidence, lane, true) &&
    evidence.preterminalManifestDigest === TARGET_PRETERMINAL_MANIFEST_SHA256 &&
    evidence.workerFunctionDigest === TARGET_WORKER_FUNCTION_SHA256 &&
    evidence.workerFunctionComment === TARGET_WORKER_FUNCTION_COMMENT &&
    evidence.support.catalogDigest ===
      manifest.target.expectedSupportCatalogDigest &&
    evidence.workerFunctionSecurityDefiner === true &&
    evidence.workerFunctionLanguage === "plpgsql" &&
    evidence.workerFunctionReturnType === "jsonb" &&
    stableJson(evidence.workerFunctionConfig) ===
      stableJson(["search_path=pg_catalog"]) &&
    evidence.workerFunctionKind === "f" &&
    evidence.workerFunctionVolatility === "v" &&
    evidence.workerFunctionLeakproof === false &&
    evidence.workerFunctionStrict === false &&
    evidence.workerFunctionReturnsSet === false &&
    evidence.workerFunctionParallel === "u"
  );
}

function exactPreGrantState(evidence, lane, manifest) {
  return (
    exactTargetBase(evidence, lane, manifest) &&
    supportStructureExact(
      evidence.support,
      manifest.target.applicationRuntimeRole.name,
      {
        aclMode: "PRE_GRANT",
      },
    )
  );
}

function exactFinalState(evidence, lane, manifest) {
  return (
    exactTargetBase(evidence, lane, manifest) &&
    supportStructureExact(
      evidence.support,
      manifest.target.applicationRuntimeRole.name,
      {
        aclMode: "FINAL",
      },
    )
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
      "bridgeAttestation",
      "contractVersion",
      "decision",
      "expiresAt",
      "historicalOwnershipDigest",
      "materializedTreeDigest",
      "plannedAt",
      "planDigest",
      "productionManifestDigest",
      "recoveryExpiresAt",
      "releaseSha",
      "roleMembershipDigest",
      "runtimeSafetyDigest",
      "sourceMigrationCount",
      "sourceMigrationManifestDigest",
      "sourceSchemaHead",
      "targetMigrationCount",
      "targetMigrationSha256",
      "targetSchemaHead",
    ],
    "CURRENT188_LEGACY_PLAN_INVALID",
  );
  if (
    plan.contractVersion !==
      FOUNDER_PILOT_CURRENT188_LEGACY_OWNERSHIP_CONTRACT ||
    plan.decision !== FOUNDER_PILOT_CURRENT188_LEGACY_OWNERSHIP_PLAN_READY ||
    !ISO_TIMESTAMP.test(plan.plannedAt ?? "") ||
    !ISO_TIMESTAMP.test(plan.expiresAt ?? "") ||
    !ISO_TIMESTAMP.test(plan.recoveryExpiresAt ?? "") ||
    !SHA40.test(plan.releaseSha ?? "") ||
    plan.sourceMigrationCount !== SOURCE_COUNT ||
    plan.sourceSchemaHead !== SOURCE_HEAD ||
    plan.targetMigrationCount !== TARGET_COUNT ||
    plan.targetSchemaHead !== TARGET_HEAD ||
    plan.targetMigrationSha256 !== TARGET_MIGRATION_SHA256
  ) {
    fail("CURRENT188_LEGACY_PLAN_INVALID");
  }
  for (const key of [
    "approvalKeySpkiSha256",
    "artifactSha256",
    "historicalOwnershipDigest",
    "materializedTreeDigest",
    "planDigest",
    "productionManifestDigest",
    "roleMembershipDigest",
    "runtimeSafetyDigest",
    "sourceMigrationManifestDigest",
  ]) {
    sha256Value(plan[key], "CURRENT188_LEGACY_PLAN_INVALID");
  }
  const base = planBase(plan);
  if (!safeEqual(plan.planDigest, digest("production-plan", base))) {
    fail("CURRENT188_LEGACY_PLAN_INVALID");
  }
  return Object.freeze({
    ...base,
    bridgeAttestation: normalizeFounderPilotCurrent188BridgeAttestation(
      plan.bridgeAttestation,
      {
        expectedPhase: BRIDGE_SOURCE_PHASE,
        expectedReleaseSha: plan.releaseSha,
      },
    ),
    planDigest: plan.planDigest,
  });
}

function createPlan({
  bridgeAttestation,
  evidence,
  manifest,
  plannedAt,
  release,
  runtimeSafety,
}) {
  if (!exactSourceState(evidence, release.lane, manifest)) {
    fail("CURRENT188_LEGACY_SOURCE_STATE_MISMATCH");
  }
  const bridge = normalizeFounderPilotCurrent188BridgeAttestation(
    bridgeAttestation,
    {
      expectedPhase: BRIDGE_SOURCE_PHASE,
      expectedReleaseSha: manifest.release.releaseSha,
    },
  );
  const base = {
    approvalKeyId: manifest.approval.keyId,
    approvalKeySpkiSha256: manifest.approval.publicKeySpkiSha256,
    artifactSha256: manifest.release.artifactSha256,
    bridgeAttestation: bridge,
    contractVersion: FOUNDER_PILOT_CURRENT188_LEGACY_OWNERSHIP_CONTRACT,
    decision: FOUNDER_PILOT_CURRENT188_LEGACY_OWNERSHIP_PLAN_READY,
    expiresAt: new Date(
      plannedAt.valueOf() + manifest.approval.maxPlanAgeSeconds * 1000,
    ).toISOString(),
    historicalOwnershipDigest: evidence.historicalOwnershipDigest,
    materializedTreeDigest: release.lane.treeDigest,
    plannedAt: plannedAt.toISOString(),
    productionManifestDigest:
      founderPilotCurrent188LegacyOwnershipManifestDigest(manifest),
    recoveryExpiresAt: new Date(
      plannedAt.valueOf() + manifest.approval.maxRecoveryAgeSeconds * 1000,
    ).toISOString(),
    releaseSha: manifest.release.releaseSha,
    roleMembershipDigest: evidence.roleMembershipDigest,
    runtimeSafetyDigest: runtimeSafety.digest,
    sourceMigrationCount: SOURCE_COUNT,
    sourceMigrationManifestDigest: release.lane.sourceManifestDigest,
    sourceSchemaHead: SOURCE_HEAD,
    targetMigrationCount: TARGET_COUNT,
    targetMigrationSha256: TARGET_MIGRATION_SHA256,
    targetSchemaHead: TARGET_HEAD,
  };
  return Object.freeze({
    ...base,
    planDigest: digest("production-plan", base),
  });
}

function exactBridgeAdapter(value) {
  for (const method of [
    "acquireLock",
    "inspectSource",
    "inspectTarget",
    "releaseLock",
  ]) {
    if (typeof value?.[method] !== "function") {
      fail("CURRENT188_LEGACY_BRIDGE_ADAPTER_INVALID");
    }
  }
  return value;
}

function exactRuntimeSafetyAdapter(value) {
  if (typeof value?.inspect !== "function") {
    fail("CURRENT188_LEGACY_RUNTIME_SAFETY_ADAPTER_INVALID");
  }
  return value;
}

async function verifyRuntimeSafety({ adapter, manifest }) {
  const evidence = await adapter.inspect();
  if (
    evidence?.accepted !== true ||
    evidence?.apiUnitTemplateSha256 !==
      manifest.runtimeSafety.apiUnitTemplateSha256 ||
    evidence?.canaryEnvironmentSha256 !==
      manifest.runtimeSafety.canaryEnvironmentSha256 ||
    evidence?.legacyDrainReceiptSha256 !==
      manifest.runtimeSafety.legacyDrainReceiptSha256 ||
    evidence?.legacyDrainVerifierSha256 !==
      manifest.runtimeSafety.legacyDrainVerifierSha256 ||
    evidence?.systemdUnitInventoryDigest !==
      manifest.runtimeSafety.expectedSystemdUnitInventoryDigest ||
    !SHA256.test(evidence?.legacyDrainVerifierOutputSha256 ?? "")
  ) {
    fail("CURRENT188_LEGACY_RUNTIME_SAFETY_MISMATCH");
  }
  return Object.freeze({
    digest: digest("runtime-safety", evidence),
    evidence: Object.freeze({ ...evidence }),
  });
}

export async function buildFounderPilotCurrent188LegacyOwnershipPlan({
  adapter,
  inspectArtifact = inspectFounderPilotImmutableFile,
  laneRoot,
  manifest: rawManifest,
  now = () => new Date(),
  runtimeSafetyAdapter,
  runtimeAdapter,
  sourcePrismaRoot,
}) {
  const manifest =
    normalizeFounderPilotCurrent188LegacyOwnershipManifest(rawManifest);
  if (typeof adapter?.inspect !== "function") {
    fail("CURRENT188_LEGACY_ADAPTER_INVALID");
  }
  const bridge = exactBridgeAdapter(runtimeAdapter);
  const runtimeSafety = exactRuntimeSafetyAdapter(runtimeSafetyAdapter);
  let bridgeLockHeld = false;
  try {
    await bridge.acquireLock();
    bridgeLockHeld = true;
    const plannedAt = currentDate(now);
    const [release, evidence, bridgeAttestation, runtimeSafetyReceipt] =
      await Promise.all([
      inspectRelease({
        inspectArtifact,
        laneRoot,
        manifest,
        sourcePrismaRoot,
      }),
      adapter.inspect(),
      bridge.inspectSource(),
      verifyRuntimeSafety({ adapter: runtimeSafety, manifest }),
    ]);
    return createPlan({
      bridgeAttestation,
      evidence,
      manifest,
      plannedAt,
      release,
      runtimeSafety: runtimeSafetyReceipt,
    });
  } finally {
    if (bridgeLockHeld) await bridge.releaseLock();
  }
}

export async function inspectFounderPilotCurrent188LegacyOwnershipInventory({
  adapter,
  laneRoot,
  manifest: rawManifest,
  now = () => new Date(),
  runtimeSafetyAdapter,
  sourcePrismaRoot,
}) {
  const manifest =
    normalizeFounderPilotCurrent188LegacyOwnershipManifest(rawManifest);
  const safety = exactRuntimeSafetyAdapter(runtimeSafetyAdapter);
  const [release, evidence, runtimeSafety] = await Promise.all([
    inspectRelease({ laneRoot, manifest, sourcePrismaRoot }),
    adapter.inspect(),
    verifyRuntimeSafety({ adapter: safety, manifest }),
  ]);
  return Object.freeze({
    contractVersion: FOUNDER_PILOT_CURRENT188_LEGACY_OWNERSHIP_CONTRACT,
    decision: FOUNDER_PILOT_CURRENT188_LEGACY_OWNERSHIP_INVENTORY_READY,
    exactSourceState: exactSourceState(evidence, release.lane, manifest),
    observedTarget: Object.freeze({
      activeRuntimeRoleNames: evidence.activeRuntimeRoleNames,
      applicationRuntimeSchemaCreate: evidence.applicationRuntimeSchemaCreate,
      applicationRuntimeSchemaUsage: evidence.applicationRuntimeSchemaUsage,
      currentDatabase: evidence.currentDatabase,
      databaseOwnerRoleName: evidence.databaseOwnerRoleName,
      databaseOwnerRoleOid: evidence.databaseOwnerRoleOid,
      historicalOwnershipDigest: evidence.historicalOwnershipDigest,
      roleMembershipDigest: evidence.roleMembershipDigest,
      roles: evidence.roles,
      serverAddress: evidence.serverAddress,
      serverMajor: evidence.serverMajor,
      serverPort: evidence.serverPort,
      sessionRoleName: evidence.sessionRoleName,
      sessionRoleOid: evidence.sessionRoleOid,
      systemIdentifier: evidence.systemIdentifier,
      workerFunctionComment: evidence.workerFunctionComment,
      workerFunctionDigest: evidence.workerFunctionDigest,
      workerFunctionOwnerRoleName: evidence.workerFunctionOwnerRoleName,
      workerFunctionOwnerRoleOid: evidence.workerFunctionOwnerRoleOid,
    }),
    observedAt: currentDate(now).toISOString(),
    ownershipCounts: evidence.ownershipCounts,
    reasonCode: null,
    roleMembershipDigest: evidence.roleMembershipDigest,
    runtimeSafetyDigest: runtimeSafety.digest,
    target: manifest.target,
  });
}

function approvalPayload(plan) {
  return Buffer.from(
    `${FOUNDER_PILOT_CURRENT188_LEGACY_OWNERSHIP_CONTRACT}\0approval\0${plan.planDigest}`,
    "utf8",
  );
}

export function signFounderPilotCurrent188LegacyOwnershipPlan({
  manifest: rawManifest,
  plan: rawPlan,
  privateKeyPem,
}) {
  const manifest =
    normalizeFounderPilotCurrent188LegacyOwnershipManifest(rawManifest);
  const plan = normalizePlan(rawPlan);
  if (
    plan.productionManifestDigest !==
      founderPilotCurrent188LegacyOwnershipManifestDigest(manifest) ||
    plan.approvalKeyId !== manifest.approval.keyId ||
    plan.approvalKeySpkiSha256 !== manifest.approval.publicKeySpkiSha256
  ) {
    fail("CURRENT188_LEGACY_PLAN_INVALID");
  }
  let key;
  try {
    key = createPrivateKey(privateKeyPem);
  } catch {
    fail("CURRENT188_LEGACY_PRIVATE_KEY_INVALID");
  }
  if (
    key.asymmetricKeyType !== "ed25519" ||
    sha256(createPublicKey(key).export({ format: "der", type: "spki" })) !==
      manifest.approval.publicKeySpkiSha256
  ) {
    fail("CURRENT188_LEGACY_PRIVATE_KEY_INVALID");
  }
  return Object.freeze({
    contractVersion: FOUNDER_PILOT_CURRENT188_LEGACY_OWNERSHIP_CONTRACT,
    keyId: manifest.approval.keyId,
    planDigest: plan.planDigest,
    signature: sign(null, approvalPayload(plan), key).toString("base64url"),
  });
}

export function verifyFounderPilotCurrent188LegacyOwnershipApproval({
  approval,
  manifest: rawManifest,
  pinnedApprovalKeySpkiSha256,
  plan: rawPlan,
}) {
  const manifest =
    normalizeFounderPilotCurrent188LegacyOwnershipManifest(rawManifest);
  const plan = normalizePlan(rawPlan);
  const receipt = exactRecord(
    approval,
    ["contractVersion", "keyId", "planDigest", "signature"],
    "CURRENT188_LEGACY_APPROVAL_INVALID",
  );
  if (
    pinnedApprovalKeySpkiSha256 !== manifest.approval.publicKeySpkiSha256 ||
    receipt.contractVersion !==
      FOUNDER_PILOT_CURRENT188_LEGACY_OWNERSHIP_CONTRACT ||
    receipt.keyId !== manifest.approval.keyId ||
    !safeEqual(receipt.planDigest, plan.planDigest) ||
    typeof receipt.signature !== "string" ||
    !BASE64URL_SIGNATURE.test(receipt.signature)
  ) {
    fail("CURRENT188_LEGACY_APPROVAL_INVALID");
  }
  const key = createPublicKey(manifest.approval.publicKeyPem);
  if (
    !verify(
      null,
      approvalPayload(plan),
      key,
      Buffer.from(receipt.signature, "base64url"),
    )
  ) {
    fail("CURRENT188_LEGACY_APPROVAL_INVALID");
  }
  return Object.freeze({ approvalDigest: digest("approval", receipt) });
}

function assertPlanWindow(plan, manifest, now) {
  const plannedAt = new Date(plan.plannedAt);
  const expiresAt = new Date(plan.expiresAt);
  const recoveryExpiresAt = new Date(plan.recoveryExpiresAt);
  if (
    !Number.isFinite(plannedAt.valueOf()) ||
    !Number.isFinite(expiresAt.valueOf()) ||
    !Number.isFinite(recoveryExpiresAt.valueOf()) ||
    expiresAt.valueOf() - plannedAt.valueOf() !==
      manifest.approval.maxPlanAgeSeconds * 1000 ||
    recoveryExpiresAt.valueOf() - plannedAt.valueOf() !==
      manifest.approval.maxRecoveryAgeSeconds * 1000 ||
    now < plannedAt ||
    now >= recoveryExpiresAt
  ) {
    fail("CURRENT188_LEGACY_PLAN_EXPIRED");
  }
  return now < expiresAt ? "FRESH" : "RECOVERY_ONLY";
}

async function emitPhase(onPhase, plan, phase, extra = {}) {
  if (typeof onPhase !== "function") {
    fail("CURRENT188_LEGACY_PHASE_JOURNAL_REQUIRED");
  }
  await onPhase(
    Object.freeze({
      contractVersion: FOUNDER_PILOT_CURRENT188_LEGACY_OWNERSHIP_CONTRACT,
      phase,
      planDigest: plan.planDigest,
      ...extra,
    }),
  );
}

async function verifyBridgeTarget({ manifest, runtimeAdapter, source }) {
  const target = normalizeFounderPilotCurrent188BridgeAttestation(
    await runtimeAdapter.inspectTarget(),
    {
      expectedPhase: BRIDGE_TARGET_PHASE,
      expectedReleaseSha: manifest.release.releaseSha,
    },
  );
  if (
    source !== null &&
    stableJson(founderPilotCurrent188BridgeAttestationInvariant(source)) !==
      stableJson(founderPilotCurrent188BridgeAttestationInvariant(target))
  ) {
    fail("CURRENT188_LEGACY_BRIDGE_TARGET_STATE_MISMATCH");
  }
  return Object.freeze({
    bridgeAttestationDigest: founderPilotCurrent188BridgeAttestationDigest(
      target,
      {
        expectedPhase: BRIDGE_TARGET_PHASE,
        expectedReleaseSha: manifest.release.releaseSha,
      },
    ),
    bridgeCutoverGeneration: target.cutoverGeneration,
    bridgeSlot: target.active.slot,
  });
}

function finalReceipt(evidence, bridge, plan, extra = {}) {
  return Object.freeze({
    ...bridge,
    contractVersion: FOUNDER_PILOT_CURRENT188_LEGACY_OWNERSHIP_CONTRACT,
    decision: FOUNDER_PILOT_CURRENT188_LEGACY_OWNERSHIP_APPLIED,
    historicalOwnershipDigest: evidence.historicalOwnershipDigest,
    migrationCount: evidence.migrationCount,
    migrationHead: evidence.migrationHead,
    planDigest: plan.planDigest,
    reasonCode: null,
    roleMembershipDigest: evidence.roleMembershipDigest,
    runtimeSafetyDigest: plan.runtimeSafetyDigest ?? null,
    supportContractDigest: digest("support-contract", evidence.support),
    workerFunctionComment: evidence.workerFunctionComment,
    workerFunctionDigest: evidence.workerFunctionDigest,
    ...extra,
  });
}

export async function applyFounderPilotCurrent188LegacyOwnershipPlan({
  adapter,
  approval,
  confirmPlanDigest,
  executor,
  inspectArtifact = inspectFounderPilotImmutableFile,
  laneRoot,
  manifest: rawManifest,
  now = () => new Date(),
  onPhase,
  pinnedApprovalKeySpkiSha256,
  plan: rawPlan,
  productionConfirmation,
  runtimeSafetyAdapter,
  runtimeAdapter,
  sourcePrismaRoot,
}) {
  if (
    productionConfirmation !==
    FOUNDER_PILOT_CURRENT188_LEGACY_OWNERSHIP_CONFIRMATION
  ) {
    fail("CURRENT188_LEGACY_PRODUCTION_CONFIRMATION_REQUIRED");
  }
  const manifest =
    normalizeFounderPilotCurrent188LegacyOwnershipManifest(rawManifest);
  const plan = normalizePlan(rawPlan);
  if (!safeEqual(confirmPlanDigest, plan.planDigest)) {
    fail("CURRENT188_LEGACY_PLAN_CONFIRMATION_MISMATCH");
  }
  const planWindow = assertPlanWindow(plan, manifest, currentDate(now));
  const approvalReceipt = verifyFounderPilotCurrent188LegacyOwnershipApproval({
    approval,
    manifest,
    pinnedApprovalKeySpkiSha256,
    plan,
  });
  for (const method of ["acquireLock", "inspect", "releaseLock"]) {
    if (typeof adapter?.[method] !== "function") {
      fail("CURRENT188_LEGACY_ADAPTER_INVALID");
    }
  }
  for (const method of ["grantRuntimeAccess", "migrate"]) {
    if (typeof executor?.[method] !== "function") {
      fail("CURRENT188_LEGACY_EXECUTOR_INVALID");
    }
  }
  const bridge = exactBridgeAdapter(runtimeAdapter);
  const runtimeSafety = exactRuntimeSafetyAdapter(runtimeSafetyAdapter);
  await emitPhase(onPhase, plan, "APPROVAL_VERIFIED", {
    approvalDigest: approvalReceipt.approvalDigest,
  });
  let bridgeLockHeld = false;
  let databaseLockHeld = false;
  try {
    await bridge.acquireLock();
    bridgeLockHeld = true;
    await emitPhase(onPhase, plan, "PRODUCTION_CONTROL_INSTALL_LOCK_ACQUIRED");
    await emitPhase(onPhase, plan, "BRIDGE_CUTOVER_LOCK_ACQUIRED");
    await adapter.acquireLock();
    databaseLockHeld = true;
    await emitPhase(onPhase, plan, "CONTROLLER_LOCK_ACQUIRED");
    const [release, runtimeSafetyReceipt] = await Promise.all([
      inspectRelease({
        inspectArtifact,
        laneRoot,
        manifest,
        sourcePrismaRoot,
      }),
      verifyRuntimeSafety({ adapter: runtimeSafety, manifest }),
    ]);
    if (
      plan.productionManifestDigest !==
        founderPilotCurrent188LegacyOwnershipManifestDigest(manifest) ||
      plan.materializedTreeDigest !== release.lane.treeDigest ||
      plan.artifactSha256 !== manifest.release.artifactSha256 ||
      plan.runtimeSafetyDigest !== runtimeSafetyReceipt.digest
    ) {
      fail("CURRENT188_LEGACY_FRESH_PLAN_MISMATCH");
    }
    let evidence = await adapter.inspect();
    if (exactFinalState(evidence, release.lane, manifest)) {
      const bridgeReceipt = await verifyBridgeTarget({
        manifest,
        runtimeAdapter: bridge,
        source: plan.bridgeAttestation,
      });
      await emitPhase(onPhase, plan, "FINAL_188_VERIFIED", {
        recoveredFromLostResponse: true,
      });
      return finalReceipt(evidence, bridgeReceipt, plan, {
        deploymentAttempt: 0,
        grantAttempt: 0,
        recoveredFromLostResponse: true,
      });
    }

    let deploymentAttempt = 0;
    let grantAttempt = 0;
    let recoveredFromLostResponse = false;
    if (!exactPreGrantState(evidence, release.lane, manifest)) {
      if (!exactSourceState(evidence, release.lane, manifest)) {
        fail("CURRENT188_LEGACY_SOURCE_STATE_MISMATCH");
      }
      if (planWindow !== "FRESH") {
        fail("CURRENT188_LEGACY_RECOVERY_SOURCE_EFFECT_FORBIDDEN");
      }
      const sourceBridge = normalizeFounderPilotCurrent188BridgeAttestation(
        await bridge.inspectSource(),
        {
          expectedPhase: BRIDGE_SOURCE_PHASE,
          expectedReleaseSha: manifest.release.releaseSha,
        },
      );
      if (
        stableJson(sourceBridge) !== stableJson(plan.bridgeAttestation) ||
        evidence.historicalOwnershipDigest !== plan.historicalOwnershipDigest ||
        evidence.roleMembershipDigest !== plan.roleMembershipDigest
      ) {
        fail("CURRENT188_LEGACY_FRESH_PLAN_MISMATCH");
      }
      await emitPhase(onPhase, plan, "ACTIVE_BRIDGE_SOURCE_187_VERIFIED");
      for (
        deploymentAttempt = 1;
        deploymentAttempt <= 2;
        deploymentAttempt += 1
      ) {
        await emitPhase(onPhase, plan, "PRIVILEGED_MIGRATION_INTENT_DURABLE", {
          attempt: deploymentAttempt,
        });
        const result = await executor.migrate({
          attempt: deploymentAttempt,
          laneRoot,
          materializedTreeDigest: release.lane.treeDigest,
          target: manifest.target,
          timeoutSeconds: manifest.operation.deployTimeoutSeconds,
        });
        await emitPhase(onPhase, plan, "PRIVILEGED_MIGRATION_RESPONSE", {
          attempt: deploymentAttempt,
          status: result?.status ?? null,
        });
        evidence = await adapter.inspect();
        if (exactPreGrantState(evidence, release.lane, manifest)) {
          recoveredFromLostResponse = result?.status !== "SUCCEEDED";
          break;
        }
        if (
          result?.status === "FAILED" ||
          !exactSourceState(evidence, release.lane, manifest) ||
          deploymentAttempt === 2
        ) {
          fail("CURRENT188_LEGACY_MIGRATION_NOT_REACHED");
        }
      }
    } else {
      recoveredFromLostResponse = true;
      await emitPhase(onPhase, plan, "POST_MIGRATION_RECOVERY_VERIFIED");
    }

    for (grantAttempt = 1; grantAttempt <= 2; grantAttempt += 1) {
      await emitPhase(onPhase, plan, "RUNTIME_ACL_INTENT_DURABLE", {
        attempt: grantAttempt,
      });
      const result = await executor.grantRuntimeAccess({
        applicationRuntimeRole: manifest.target.applicationRuntimeRole.name,
        attempt: grantAttempt,
        target: manifest.target,
        timeoutSeconds: manifest.operation.deployTimeoutSeconds,
      });
      await emitPhase(onPhase, plan, "RUNTIME_ACL_RESPONSE", {
        attempt: grantAttempt,
        status: result?.status ?? null,
      });
      evidence = await adapter.inspect();
      if (exactFinalState(evidence, release.lane, manifest)) {
        if (result?.status !== "SUCCEEDED") recoveredFromLostResponse = true;
        break;
      }
      if (
        result?.status === "FAILED" ||
        !exactPreGrantState(evidence, release.lane, manifest) ||
        grantAttempt === 2
      ) {
        fail("CURRENT188_LEGACY_RUNTIME_ACL_NOT_REACHED");
      }
    }
    const finalRuntimeSafetyReceipt = await verifyRuntimeSafety({
      adapter: runtimeSafety,
      manifest,
    });
    if (finalRuntimeSafetyReceipt.digest !== plan.runtimeSafetyDigest) {
      fail("CURRENT188_LEGACY_RUNTIME_SAFETY_CHANGED_DURING_EFFECT");
    }
    const bridgeReceipt = await verifyBridgeTarget({
      manifest,
      runtimeAdapter: bridge,
      source: plan.bridgeAttestation,
    });
    await emitPhase(onPhase, plan, "FINAL_188_VERIFIED", {
      recoveredFromLostResponse,
    });
    return finalReceipt(evidence, bridgeReceipt, plan, {
      deploymentAttempt,
      grantAttempt,
      recoveredFromLostResponse,
    });
  } finally {
    if (databaseLockHeld) await adapter.releaseLock();
    if (bridgeLockHeld) await bridge.releaseLock();
  }
}

export async function verifyFounderPilotCurrent188LegacyOwnershipFinal({
  adapter,
  laneRoot,
  manifest: rawManifest,
  runtimeSafetyAdapter,
  runtimeAdapter,
  sourcePrismaRoot,
}) {
  const manifest =
    normalizeFounderPilotCurrent188LegacyOwnershipManifest(rawManifest);
  const bridge = exactBridgeAdapter(runtimeAdapter);
  const runtimeSafety = exactRuntimeSafetyAdapter(runtimeSafetyAdapter);
  let bridgeLockHeld = false;
  let databaseLockHeld = false;
  try {
    await bridge.acquireLock();
    bridgeLockHeld = true;
    await adapter.acquireLock();
    databaseLockHeld = true;
    const [release, evidence, runtimeSafetyReceipt] = await Promise.all([
      inspectRelease({ laneRoot, manifest, sourcePrismaRoot }),
      adapter.inspect(),
      verifyRuntimeSafety({ adapter: runtimeSafety, manifest }),
    ]);
    if (!exactFinalState(evidence, release.lane, manifest)) {
      fail("CURRENT188_LEGACY_FINAL_STATE_NOT_REACHED");
    }
    const bridgeReceipt = await verifyBridgeTarget({
      manifest,
      runtimeAdapter: bridge,
      source: null,
    });
    return finalReceipt(evidence, bridgeReceipt, {
      planDigest: "0".repeat(64),
      runtimeSafetyDigest: runtimeSafetyReceipt.digest,
    });
  } finally {
    if (databaseLockHeld) await adapter.releaseLock();
    if (bridgeLockHeld) await bridge.releaseLock();
  }
}

function assertDatabaseUrl(databaseUrl, target) {
  let value;
  try {
    value = new URL(databaseUrl);
  } catch {
    fail("CURRENT188_LEGACY_DATABASE_URL_INVALID");
  }
  const parameters = [...value.searchParams.keys()];
  if (
    !["postgres:", "postgresql:"].includes(value.protocol) ||
    value.hostname !== target.host ||
    Number(value.port || 5432) !== target.port ||
    decodeURIComponent(value.pathname.slice(1)) !== target.databaseName ||
    decodeURIComponent(value.username) !== target.inspectionRole.name ||
    value.password.length < 1 ||
    value.hash !== "" ||
    parameters.some((name) => name !== "application_name")
  ) {
    fail("CURRENT188_LEGACY_DATABASE_URL_INVALID");
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

function normalizeMigrationEvidence(rows) {
  const applied = rows.filter((row) => row.applied === true);
  const rolledBack = rows.filter(
    (row) => row.applied !== true && row.rolledBack === true,
  );
  const unfinished = rows.filter(
    (row) => row.applied !== true && row.rolledBack !== true,
  );
  return {
    migrationCount: applied.length,
    migrationHead: applied.at(-1)?.migrationName ?? null,
    migrationManifestDigest: migrationDigest(applied),
    migrationRows: rows,
    rolledBackMigrationCount: rolledBack.length,
    rolledBackMigrationManifestDigest: migrationDigest(rolledBack),
    unfinishedMigrationCount: unfinished.length,
  };
}

function normalizePrivileges(values) {
  return values
    .map((value) => ({
      grantable: value.grantable,
      grantee: value.grantee,
      privilege: value.privilege,
    }))
    .sort((left, right) =>
      `${left.grantee}\0${left.privilege}`.localeCompare(
        `${right.grantee}\0${right.privilege}`,
        "en",
      ),
    );
}

export async function createFounderPilotCurrent188LegacyOwnershipPgAdapter(
  databaseUrl,
  rawManifest,
  { productionConfirmation } = {},
) {
  if (
    productionConfirmation !==
    FOUNDER_PILOT_CURRENT188_LEGACY_OWNERSHIP_CONFIRMATION
  ) {
    fail("CURRENT188_LEGACY_PRODUCTION_CONFIRMATION_REQUIRED");
  }
  const manifest =
    normalizeFounderPilotCurrent188LegacyOwnershipManifest(rawManifest);
  assertDatabaseUrl(databaseUrl, manifest.target);
  let client = null;
  let lockedBackendPid = null;
  let closed = false;

  async function currentClient() {
    if (closed) fail("CURRENT188_LEGACY_ADAPTER_CLOSED");
    if (client === null) {
      client = new pg.Client({
        application_name: "current188_legacy_owner_controller",
        connectionString: databaseUrl,
        connectionTimeoutMillis: 5_000,
        query_timeout: 30_000,
      });
      await client.connect();
    }
    return client;
  }

  async function inspect() {
    const active = await currentClient();
    await active.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    try {
      await active.query("SET LOCAL lock_timeout = '3s'");
      await active.query("SET LOCAL statement_timeout = '20s'");
      await active.query(
        "SET LOCAL idle_in_transaction_session_timeout = '25s'",
      );
      const roleNames = manifest.target.expectedRoles.map(({ name }) => name);
      const [
        identity,
        roles,
        activeRoles,
        memberships,
        classes,
        routines,
        types,
        migrations,
        runtime,
        support,
      ] = await Promise.all([
        active.query(
          `
            SELECT
              pg_catalog.current_database() AS "currentDatabase",
              database_owner.rolname AS "databaseOwnerRoleName",
              database_owner.oid::INTEGER AS "databaseOwnerRoleOid",
              session_role.rolname AS "sessionRoleName",
              session_role.oid::INTEGER AS "sessionRoleOid",
              pg_catalog.host(pg_catalog.inet_server_addr()) AS "serverAddress",
              pg_catalog.inet_server_port()::INTEGER AS "serverPort",
              (pg_catalog.pg_control_system()).system_identifier::TEXT
                AS "systemIdentifier",
              (pg_catalog.current_setting('server_version_num')::INTEGER / 10000)
                AS "serverMajor",
              pg_catalog.pg_is_in_recovery() AS "inRecovery",
              pg_catalog.has_schema_privilege($1, 'public', 'USAGE')
                AS "applicationRuntimeSchemaUsage",
              pg_catalog.has_schema_privilege($1, 'public', 'CREATE')
                AS "applicationRuntimeSchemaCreate"
            FROM pg_catalog.pg_roles AS session_role
            JOIN pg_catalog.pg_database AS target_database
              ON target_database.datname = pg_catalog.current_database()
            JOIN pg_catalog.pg_roles AS database_owner
              ON database_owner.oid = target_database.datdba
            WHERE session_role.rolname = SESSION_USER
          `,
          [manifest.target.applicationRuntimeRole.name],
        ),
        active.query(
          `
            SELECT
              role.rolname AS "name",
              role.oid::INTEGER AS "oid",
              role.rolcanlogin AS "canLogin",
              role.rolcreatedb AS "createDb",
              role.rolcreaterole AS "createRole",
              role.rolinherit AS "inherit",
              role.rolreplication AS "replication",
              role.rolsuper AS "superuser",
              role.rolbypassrls AS "bypassRls"
            FROM pg_catalog.pg_roles AS role
            WHERE role.rolname = ANY($1::TEXT[])
            ORDER BY role.rolname COLLATE "C"
          `,
          [roleNames],
        ),
        active.query(`
            SELECT DISTINCT activity.usename COLLATE "C" AS "name"
            FROM pg_catalog.pg_stat_activity AS activity
            WHERE activity.datname = pg_catalog.current_database()
              AND activity.pid <> pg_catalog.pg_backend_pid()
              AND activity.backend_type = 'client backend'
              AND activity.usename <> 'postgres'
            ORDER BY "name"
          `),
        active.query(
          `
            SELECT
              granted.rolname AS "roleName",
              granted.oid::INTEGER AS "roleOid",
              member.rolname AS "memberName",
              member.oid::INTEGER AS "memberOid",
              membership.admin_option AS "adminOption",
              membership.inherit_option AS "inheritOption",
              membership.set_option AS "setOption"
            FROM pg_catalog.pg_auth_members AS membership
            JOIN pg_catalog.pg_roles AS granted ON granted.oid = membership.roleid
            JOIN pg_catalog.pg_roles AS member ON member.oid = membership.member
            WHERE granted.rolname = ANY($1::TEXT[])
               OR member.rolname = ANY($1::TEXT[])
            ORDER BY granted.rolname COLLATE "C", member.rolname COLLATE "C"
          `,
          [roleNames],
        ),
        active.query(
          `
            SELECT
              relation.relacl IS NULL AS "aclIsNull",
              COALESCE((
                SELECT pg_catalog.string_agg(
                  acl_entry.acl_item::TEXT,
                  E'\n'
                  ORDER BY acl_entry.acl_item::TEXT COLLATE "C"
                )
                FROM pg_catalog.unnest(relation.relacl)
                  AS acl_entry(acl_item)
              ), '') AS "aclText",
              'CLASS' AS "kind",
              relation.oid::TEXT AS "objectOid",
              relation.relname AS "objectName",
              relation.relkind::TEXT AS "signature",
              owner.oid::INTEGER AS "ownerOid",
              owner.rolname AS "ownerName"
            FROM pg_catalog.pg_class AS relation
            JOIN pg_catalog.pg_roles AS owner ON owner.oid = relation.relowner
            WHERE relation.relnamespace = pg_catalog.to_regnamespace('public')
              AND relation.relname <> ALL($1::TEXT[])
            ORDER BY relation.oid
          `,
          [SUPPORT_RELATIONS],
        ),
        active.query(`
            SELECT
              routine.proacl IS NULL AS "aclIsNull",
              COALESCE((
                SELECT pg_catalog.string_agg(
                  acl_entry.acl_item::TEXT,
                  E'\n'
                  ORDER BY acl_entry.acl_item::TEXT COLLATE "C"
                )
                FROM pg_catalog.unnest(routine.proacl)
                  AS acl_entry(acl_item)
              ), '') AS "aclText",
              'PROC' AS "kind",
              routine.oid::TEXT AS "objectOid",
              routine.proname AS "objectName",
              pg_catalog.pg_get_function_identity_arguments(routine.oid)
                AS "signature",
              owner.oid::INTEGER AS "ownerOid",
              owner.rolname AS "ownerName"
            FROM pg_catalog.pg_proc AS routine
            JOIN pg_catalog.pg_roles AS owner ON owner.oid = routine.proowner
            WHERE routine.pronamespace = pg_catalog.to_regnamespace('public')
            ORDER BY routine.oid
          `),
        active.query(
          `
            SELECT
              data_type.typacl IS NULL AS "aclIsNull",
              COALESCE((
                SELECT pg_catalog.string_agg(
                  acl_entry.acl_item::TEXT,
                  E'\n'
                  ORDER BY acl_entry.acl_item::TEXT COLLATE "C"
                )
                FROM pg_catalog.unnest(data_type.typacl)
                  AS acl_entry(acl_item)
              ), '') AS "aclText",
              'TYPE' AS "kind",
              data_type.oid::TEXT AS "objectOid",
              data_type.typname AS "objectName",
              data_type.typtype::TEXT AS "signature",
              owner.oid::INTEGER AS "ownerOid",
              owner.rolname AS "ownerName"
            FROM pg_catalog.pg_type AS data_type
            JOIN pg_catalog.pg_roles AS owner ON owner.oid = data_type.typowner
            WHERE data_type.typnamespace = pg_catalog.to_regnamespace('public')
              AND data_type.typname <> ALL($1::TEXT[])
            ORDER BY data_type.oid
          `,
          [SUPPORT_TYPES],
        ),
        active.query(migrationSelectSql()),
        active.query(`
            SELECT
              owner.rolname AS "workerFunctionOwnerRoleName",
              owner.oid::INTEGER AS "workerFunctionOwnerRoleOid",
              routine.prosrc AS "workerFunctionSource",
              routine.prosecdef AS "workerFunctionSecurityDefiner",
              language.lanname AS "workerFunctionLanguage",
              pg_catalog.format_type(routine.prorettype, NULL)
                AS "workerFunctionReturnType",
              COALESCE(pg_catalog.to_jsonb(routine.proconfig), '[]'::jsonb)
                AS "workerFunctionConfig",
              routine.prokind::TEXT AS "workerFunctionKind",
              routine.provolatile::TEXT AS "workerFunctionVolatility",
              routine.proleakproof AS "workerFunctionLeakproof",
              routine.proisstrict AS "workerFunctionStrict",
              routine.proretset AS "workerFunctionReturnsSet",
              routine.proparallel::TEXT AS "workerFunctionParallel",
              pg_catalog.obj_description(routine.oid, 'pg_proc')
                AS "workerFunctionComment",
              (
                SELECT pg_catalog.encode(
                  pg_catalog.sha256(
                    pg_catalog.convert_to(
                      pg_catalog.string_agg(
                        migration."migration_name" || ' ' || migration."checksum",
                        E'\\n'
                        ORDER BY migration."migration_name" COLLATE "C"
                      ) FILTER (
                        WHERE migration."migration_name" NOT IN (
                          '20260819010000_staff_attachment_parent_delete_guard',
                          '20260820010000_guest_portal_telegram_update_ledger',
                          '20260828190000_guest_support_bug_reports'
                        )
                      ) || E'\\n',
                      'UTF8'
                    )
                  ),
                  'hex'
                )
                FROM public."_prisma_migrations" AS migration
                WHERE migration."finished_at" IS NOT NULL
                  AND migration."rolled_back_at" IS NULL
              ) AS "preterminalManifestDigest"
            FROM pg_catalog.pg_proc AS routine
            JOIN pg_catalog.pg_roles AS owner ON owner.oid = routine.proowner
            JOIN pg_catalog.pg_language AS language ON language.oid = routine.prolang
            WHERE routine.oid = pg_catalog.to_regprocedure(
              'public."identity_mail_delivery_worker_assert_v1"(text)'
            )
          `),
        active.query(
          `
            SELECT
              COALESCE((
                SELECT pg_catalog.jsonb_agg(
                  pg_catalog.jsonb_build_object(
                    'tableName', table_relation.relname,
                    'ordinal', column_record.attnum,
                    'name', column_record.attname,
                    'type', pg_catalog.format_type(
                      column_record.atttypid,
                      column_record.atttypmod
                    ),
                    'notNull', column_record.attnotnull,
                    'default', pg_catalog.pg_get_expr(
                      default_record.adbin,
                      default_record.adrelid,
                      true
                    ),
                    'identity', column_record.attidentity::TEXT,
                    'generated', column_record.attgenerated::TEXT,
                    'collation', CASE
                      WHEN column_record.attcollation = 0 THEN NULL
                      ELSE collation_namespace.nspname || '.' || collation_record.collname
                    END
                  ) ORDER BY table_relation.relname COLLATE "C", column_record.attnum
                )
                FROM pg_catalog.pg_class AS table_relation
                JOIN pg_catalog.pg_attribute AS column_record
                  ON column_record.attrelid = table_relation.oid
                 AND column_record.attnum > 0
                 AND NOT column_record.attisdropped
                LEFT JOIN pg_catalog.pg_attrdef AS default_record
                  ON default_record.adrelid = table_relation.oid
                 AND default_record.adnum = column_record.attnum
                LEFT JOIN pg_catalog.pg_collation AS collation_record
                  ON collation_record.oid = column_record.attcollation
                LEFT JOIN pg_catalog.pg_namespace AS collation_namespace
                  ON collation_namespace.oid = collation_record.collnamespace
                WHERE table_relation.relnamespace = pg_catalog.to_regnamespace('public')
                  AND table_relation.relkind = 'r'
                  AND table_relation.relname = ANY($1::TEXT[])
              ), '[]'::jsonb) AS "columnDefinitions",
              COALESCE((
                SELECT pg_catalog.jsonb_agg(
                  pg_catalog.jsonb_build_object(
                    'name', index_relation.relname,
                    'tableName', table_relation.relname,
                    'definition', pg_catalog.pg_get_indexdef(
                      index_relation.oid,
                      0,
                      true
                    ),
                    'unique', index_record.indisunique,
                    'primary', index_record.indisprimary,
                    'valid', index_record.indisvalid,
                    'ready', index_record.indisready
                  ) ORDER BY index_relation.relname COLLATE "C"
                )
                FROM pg_catalog.pg_index AS index_record
                JOIN pg_catalog.pg_class AS index_relation
                  ON index_relation.oid = index_record.indexrelid
                JOIN pg_catalog.pg_class AS table_relation
                  ON table_relation.oid = index_record.indrelid
                WHERE table_relation.relnamespace = pg_catalog.to_regnamespace('public')
                  AND table_relation.relname = ANY($1::TEXT[])
              ), '[]'::jsonb) AS "indexDefinitions",
              COALESCE((
                SELECT pg_catalog.jsonb_agg(
                  pg_catalog.jsonb_build_object(
                    'name', constraint_record.conname,
                    'tableName', table_relation.relname,
                    'type', constraint_record.contype::TEXT,
                    'definition', pg_catalog.pg_get_constraintdef(
                      constraint_record.oid,
                      true
                    ),
                    'validated', constraint_record.convalidated,
                    'deferrable', constraint_record.condeferrable,
                    'deferred', constraint_record.condeferred
                  ) ORDER BY constraint_record.conname COLLATE "C"
                )
                FROM pg_catalog.pg_constraint AS constraint_record
                JOIN pg_catalog.pg_class AS table_relation
                  ON table_relation.oid = constraint_record.conrelid
                WHERE constraint_record.connamespace = pg_catalog.to_regnamespace('public')
                  AND table_relation.relname = ANY($1::TEXT[])
              ), '[]'::jsonb) AS "constraintDefinitions",
              COALESCE((
                SELECT pg_catalog.jsonb_agg(relation.relname ORDER BY relation.relname COLLATE "C")
                FROM pg_catalog.pg_class AS relation
                WHERE relation.relnamespace = pg_catalog.to_regnamespace('public')
                  AND relation.relkind = 'r'
                  AND relation.relname = ANY($1::TEXT[])
              ), '[]'::jsonb) AS "tableNames",
              COALESCE((
                SELECT pg_catalog.jsonb_agg(indexes.indexname ORDER BY indexes.indexname COLLATE "C")
                FROM pg_catalog.pg_indexes AS indexes
                WHERE indexes.schemaname = 'public'
                  AND indexes.tablename = ANY($1::TEXT[])
              ), '[]'::jsonb) AS "indexNames",
              COALESCE((
                SELECT pg_catalog.jsonb_agg(constraint_record.conname ORDER BY constraint_record.conname COLLATE "C")
                FROM pg_catalog.pg_constraint AS constraint_record
                WHERE constraint_record.connamespace = pg_catalog.to_regnamespace('public')
                  AND constraint_record.conrelid = ANY(ARRAY[
                    pg_catalog.to_regclass('public."GuestSupportAttachment"'),
                    pg_catalog.to_regclass('public."GuestSupportTicket"'),
                    pg_catalog.to_regclass('public."GuestSupportTicketAuditEvent"'),
                    pg_catalog.to_regclass('public."GuestSupportTicketComment"')
                  ]::OID[])
              ), '[]'::jsonb) AS "constraintNames",
              COALESCE((
                SELECT pg_catalog.jsonb_agg(
                  pg_catalog.jsonb_build_object(
                    'name', enum_type.typname,
                    'labels', enum_labels.labels
                  ) ORDER BY enum_type.typname COLLATE "C"
                )
                FROM pg_catalog.pg_type AS enum_type
                CROSS JOIN LATERAL (
                  SELECT pg_catalog.jsonb_agg(enum_value.enumlabel ORDER BY enum_value.enumsortorder) AS labels
                  FROM pg_catalog.pg_enum AS enum_value
                  WHERE enum_value.enumtypid = enum_type.oid
                ) AS enum_labels
                WHERE enum_type.typnamespace = pg_catalog.to_regnamespace('public')
                  AND enum_type.typname = ANY($2::TEXT[])
              ), '[]'::jsonb) AS "enumTypes",
              (
                SELECT pg_catalog.count(*)::INTEGER
                FROM pg_catalog.pg_class AS relation
                CROSS JOIN LATERAL pg_catalog.aclexplode(
                  COALESCE(relation.relacl, pg_catalog.acldefault('r', relation.relowner))
                ) AS privilege
                WHERE relation.relnamespace = pg_catalog.to_regnamespace('public')
                  AND relation.relkind = 'r'
                  AND relation.relname = ANY($1::TEXT[])
                  AND privilege.grantee = 0
              ) AS "publicTablePrivilegeCount",
              (
                SELECT pg_catalog.count(*)::INTEGER
                FROM pg_catalog.pg_type AS data_type
                CROSS JOIN LATERAL pg_catalog.aclexplode(
                  COALESCE(data_type.typacl, pg_catalog.acldefault('T', data_type.typowner))
                ) AS privilege
                WHERE data_type.typnamespace = pg_catalog.to_regnamespace('public')
                  AND data_type.typname = ANY($2::TEXT[])
                  AND privilege.grantee = 0
              ) AS "publicTypePrivilegeCount",
              (
                SELECT pg_catalog.count(*)::INTEGER
                FROM pg_catalog.pg_proc AS routine
                CROSS JOIN LATERAL pg_catalog.aclexplode(
                  COALESCE(routine.proacl, pg_catalog.acldefault('f', routine.proowner))
                ) AS privilege
                WHERE routine.oid = pg_catalog.to_regprocedure(
                  'public."identity_mail_delivery_worker_assert_v1"(text)'
                )
                  AND privilege.grantee = 0
                  AND privilege.privilege_type = 'EXECUTE'
              ) AS "publicWorkerExecuteCount",
              (
                SELECT migration.checksum
                FROM public."_prisma_migrations" AS migration
                WHERE migration.migration_name = $3
                  AND migration.finished_at IS NOT NULL
                  AND migration.rolled_back_at IS NULL
                ORDER BY migration.started_at DESC
                LIMIT 1
              ) AS "migrationChecksum",
              COALESCE((
                SELECT pg_catalog.jsonb_agg(
                  pg_catalog.jsonb_build_object(
                    'name', relation.relname,
                    'ownerName', owner.rolname,
                    'nonOwnerPrivileges', COALESCE(privileges.items, '[]'::jsonb)
                  ) ORDER BY relation.relname COLLATE "C"
                )
                FROM pg_catalog.pg_class AS relation
                JOIN pg_catalog.pg_roles AS owner ON owner.oid = relation.relowner
                CROSS JOIN LATERAL (
                  SELECT pg_catalog.jsonb_agg(
                    pg_catalog.jsonb_build_object(
                      'grantee', COALESCE(grantee.rolname, 'PUBLIC'),
                      'privilege', privilege.privilege_type,
                      'grantable', privilege.is_grantable
                    ) ORDER BY COALESCE(grantee.rolname, 'PUBLIC') COLLATE "C", privilege.privilege_type COLLATE "C"
                  ) FILTER (WHERE privilege.grantee <> relation.relowner) AS items
                  FROM pg_catalog.aclexplode(
                    COALESCE(relation.relacl, pg_catalog.acldefault('r', relation.relowner))
                  ) AS privilege
                  LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = privilege.grantee
                ) AS privileges
                WHERE relation.relnamespace = pg_catalog.to_regnamespace('public')
                  AND relation.relkind = 'r'
                  AND relation.relname = ANY($1::TEXT[])
              ), '[]'::jsonb) AS "tableAccess",
              COALESCE((
                SELECT pg_catalog.jsonb_agg(
                  pg_catalog.jsonb_build_object(
                    'name', data_type.typname,
                    'ownerName', owner.rolname,
                    'nonOwnerPrivileges', COALESCE(privileges.items, '[]'::jsonb)
                  ) ORDER BY data_type.typname COLLATE "C"
                )
                FROM pg_catalog.pg_type AS data_type
                JOIN pg_catalog.pg_roles AS owner ON owner.oid = data_type.typowner
                CROSS JOIN LATERAL (
                  SELECT pg_catalog.jsonb_agg(
                    pg_catalog.jsonb_build_object(
                      'grantee', COALESCE(grantee.rolname, 'PUBLIC'),
                      'privilege', privilege.privilege_type,
                      'grantable', privilege.is_grantable
                    ) ORDER BY COALESCE(grantee.rolname, 'PUBLIC') COLLATE "C", privilege.privilege_type COLLATE "C"
                  ) FILTER (WHERE privilege.grantee <> data_type.typowner) AS items
                  FROM pg_catalog.aclexplode(
                    COALESCE(data_type.typacl, pg_catalog.acldefault('T', data_type.typowner))
                  ) AS privilege
                  LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = privilege.grantee
                ) AS privileges
                WHERE data_type.typnamespace = pg_catalog.to_regnamespace('public')
                  AND data_type.typname = ANY($2::TEXT[])
              ), '[]'::jsonb) AS "typeAccess",
              (
                SELECT owner.rolname
                FROM pg_catalog.pg_proc AS routine
                JOIN pg_catalog.pg_roles AS owner ON owner.oid = routine.proowner
                WHERE routine.oid = pg_catalog.to_regprocedure(
                  'public."identity_mail_delivery_worker_assert_v1"(text)'
                )
              ) AS "workerFunctionOwnerRoleName"
          `,
          [SUPPORT_TABLES, SUPPORT_ENUMS.map(({ name }) => name), TARGET_HEAD],
        ),
      ]);
      await active.query("COMMIT");
      const ownershipRows = [...classes.rows, ...routines.rows, ...types.rows];
      const ownershipCounts = Object.fromEntries(
        [...new Set(ownershipRows.map(({ ownerName }) => ownerName))]
          .sort()
          .map((ownerName) => [
            ownerName,
            ownershipRows.filter((row) => row.ownerName === ownerName).length,
          ]),
      );
      const runtimeRow = runtime.rows[0] ?? {};
      const supportRow = support.rows[0] ?? {};
      const supportCatalog = {
        columnDefinitions: supportRow.columnDefinitions ?? [],
        constraintDefinitions: supportRow.constraintDefinitions ?? [],
        indexDefinitions: supportRow.indexDefinitions ?? [],
      };
      return Object.freeze({
        ...normalizeMigrationEvidence(migrations.rows),
        ...identity.rows[0],
        activeRuntimeRoleNames: activeRoles.rows.map(({ name }) => name),
        historicalOwnershipDigest: ownershipDigest(ownershipRows),
        ownershipCounts,
        preterminalManifestDigest: runtimeRow.preterminalManifestDigest ?? null,
        roleMembershipDigest: membershipDigest(memberships.rows),
        roles: roles.rows,
        support: {
          ...supportRow,
          catalogDigest: sha256(stableJson(supportCatalog)),
          tableAccess: (supportRow.tableAccess ?? []).map((entry) => ({
            ...entry,
            nonOwnerPrivileges: normalizePrivileges(
              entry.nonOwnerPrivileges ?? [],
            ),
          })),
          typeAccess: (supportRow.typeAccess ?? []).map((entry) => ({
            ...entry,
            nonOwnerPrivileges: normalizePrivileges(
              entry.nonOwnerPrivileges ?? [],
            ),
          })),
        },
        workerFunctionDigest:
          typeof runtimeRow.workerFunctionSource === "string"
            ? sha256(runtimeRow.workerFunctionSource)
            : null,
        workerFunctionComment: runtimeRow.workerFunctionComment ?? null,
        workerFunctionOwnerRoleName:
          runtimeRow.workerFunctionOwnerRoleName ?? null,
        workerFunctionOwnerRoleOid:
          runtimeRow.workerFunctionOwnerRoleOid ?? null,
        workerFunctionSecurityDefiner:
          runtimeRow.workerFunctionSecurityDefiner ?? null,
        workerFunctionLanguage: runtimeRow.workerFunctionLanguage ?? null,
        workerFunctionReturnType: runtimeRow.workerFunctionReturnType ?? null,
        workerFunctionConfig: runtimeRow.workerFunctionConfig ?? null,
        workerFunctionKind: runtimeRow.workerFunctionKind ?? null,
        workerFunctionVolatility: runtimeRow.workerFunctionVolatility ?? null,
        workerFunctionLeakproof: runtimeRow.workerFunctionLeakproof ?? null,
        workerFunctionStrict: runtimeRow.workerFunctionStrict ?? null,
        workerFunctionReturnsSet: runtimeRow.workerFunctionReturnsSet ?? null,
        workerFunctionParallel: runtimeRow.workerFunctionParallel ?? null,
      });
    } catch (error) {
      await active.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
  }

  async function acquireLock() {
    const active = await currentClient();
    const result = await active.query(
      `SELECT pg_catalog.pg_try_advisory_lock($1::BIGINT) AS "acquired",
              pg_catalog.pg_backend_pid()::INTEGER AS "backendPid"`,
      [CONTROLLER_LOCK_KEY],
    );
    if (result.rows[0]?.acquired !== true) {
      fail("CURRENT188_LEGACY_CONTROLLER_LOCK_BUSY");
    }
    lockedBackendPid = result.rows[0].backendPid;
  }

  async function releaseLock() {
    if (client === null || lockedBackendPid === null) return;
    const result = await client.query(
      `SELECT pg_catalog.pg_advisory_unlock($1::BIGINT) AS "released"`,
      [CONTROLLER_LOCK_KEY],
    );
    lockedBackendPid = null;
    if (result.rows[0]?.released !== true) {
      fail("CURRENT188_LEGACY_CONTROLLER_UNLOCK_FAILED");
    }
  }

  await currentClient();
  return Object.freeze({
    acquireLock,
    close: async () => {
      if (closed) return;
      closed = true;
      await client?.end().catch(() => undefined);
      client = null;
      lockedBackendPid = null;
    },
    inspect,
    releaseLock,
  });
}

function quoteIdentifier(value) {
  return `"${identifier(value, "CURRENT188_LEGACY_IDENTIFIER_INVALID")}"`;
}

async function trustedExecutable(filePath) {
  const pathStat = await lstat(filePath, { bigint: true }).catch(() => null);
  if (
    pathStat === null ||
    pathStat.uid !== 0n ||
    (Number(pathStat.mode) & 0o022) !== 0
  ) {
    fail("CURRENT188_LEGACY_PRIVILEGED_EXECUTABLE_INVALID");
  }
  const canonicalPath = await realpath(filePath);
  const canonicalStat = await lstat(canonicalPath, { bigint: true }).catch(
    () => null,
  );
  if (
    canonicalStat === null ||
    canonicalStat.isSymbolicLink() ||
    !canonicalStat.isFile() ||
    canonicalStat.uid !== 0n ||
    (Number(canonicalStat.mode) & 0o022) !== 0 ||
    (Number(canonicalStat.mode) & 0o111) === 0
  ) {
    fail("CURRENT188_LEGACY_PRIVILEGED_EXECUTABLE_INVALID");
  }
  return canonicalPath;
}

async function preparePostgresLane(laneRoot, expectedTreeDigest) {
  if (
    !path.isAbsolute(laneRoot) ||
    path.dirname(laneRoot) !== SAFE_LANE_PARENT ||
    !SHA256.test(expectedTreeDigest ?? "") ||
    path.basename(laneRoot) !==
      `leetplus-founder-production-history-current188-${expectedTreeDigest}`
  ) {
    fail("CURRENT188_LEGACY_PRIVILEGED_LANE_INVALID");
  }
  const parent = await lstat(SAFE_LANE_PARENT, { bigint: true }).catch(
    () => null,
  );
  const postgresHome = await lstat("/var/lib/postgresql", {
    bigint: true,
  }).catch(() => null);
  if (
    parent === null ||
    parent.isSymbolicLink() ||
    !parent.isDirectory() ||
    parent.uid !== 0n ||
    (Number(parent.mode) & 0o022) !== 0 ||
    (Number(parent.mode) & 0o005) !== 0o005 ||
    postgresHome === null ||
    postgresHome.isSymbolicLink() ||
    !postgresHome.isDirectory() ||
    postgresHome.uid === 0n
  ) {
    fail("CURRENT188_LEGACY_PRIVILEGED_LANE_INVALID");
  }
  const root = await realpath(laneRoot);
  if (path.dirname(root) !== SAFE_LANE_PARENT) {
    fail("CURRENT188_LEGACY_PRIVILEGED_LANE_INVALID");
  }
  const entries = [];
  async function visit(current) {
    const metadata = await lstat(current, { bigint: true });
    if (
      metadata.isSymbolicLink() ||
      metadata.uid !== 0n ||
      (Number(metadata.mode) & 0o022) !== 0
    ) {
      fail("CURRENT188_LEGACY_PRIVILEGED_LANE_INVALID");
    }
    if (metadata.isDirectory()) {
      for (const entry of await readdir(current, { withFileTypes: true })) {
        await visit(path.join(current, entry.name));
      }
      entries.push({ directory: true, filePath: current });
      return;
    }
    if (!metadata.isFile()) {
      fail("CURRENT188_LEGACY_PRIVILEGED_LANE_INVALID");
    }
    entries.push({ directory: false, filePath: current });
  }
  await visit(root);
  for (const entry of entries) {
    await chown(entry.filePath, 0, Number(postgresHome.gid));
    await chmod(entry.filePath, entry.directory ? 0o550 : 0o440);
  }
  return root;
}

function childEvidence(status, code, signal, stdout, stderr) {
  return Object.freeze({
    exitCode: code,
    signal,
    status,
    stderrBytes: Buffer.byteLength(stderr),
    stderrSha256: sha256(stderr),
    stderr,
    stdoutBytes: Buffer.byteLength(stdout),
    stdoutSha256: sha256(stdout),
    stdout,
  });
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function spawnUtility(executable, args, timeoutMilliseconds = 5_000) {
  return new Promise((resolve) => {
    const child = spawn(executable, args, {
      env: {
        LANG: "C.UTF-8",
        LC_ALL: "C.UTF-8",
        PATH: "/usr/sbin:/usr/bin:/sbin:/bin",
        TZ: "UTC",
      },
      stdio: ["ignore", "ignore", "ignore"],
    });
    let settled = false;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      settle(false);
    }, timeoutMilliseconds);
    child.once("error", () => settle(false));
    child.once("close", (code, signal) =>
      settle(code === 0 && signal === null),
    );
  });
}

async function systemdCgroupEmpty(unitName) {
  const cgroupProcesses = path.join(
    "/sys/fs/cgroup/system.slice",
    `${unitName}.service`,
    "cgroup.procs",
  );
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const value = await readFile(cgroupProcesses, "utf8").catch((error) => {
      if (error?.code === "ENOENT") return "";
      throw error;
    });
    if (value.trim() === "") return true;
    await delay(100);
  }
  return false;
}

async function stopSystemdExecution(systemctl, unitName) {
  const serviceName = `${unitName}.service`;
  await spawnUtility(systemctl, [
    "kill",
    "--kill-who=all",
    "--signal=SIGTERM",
    serviceName,
  ]);
  await delay(250);
  if (!(await systemdCgroupEmpty(unitName))) {
    await spawnUtility(systemctl, [
      "kill",
      "--kill-who=all",
      "--signal=SIGKILL",
      serviceName,
    ]);
  }
  await spawnUtility(systemctl, ["stop", serviceName]);
  return systemdCgroupEmpty(unitName);
}

async function spawnBoundedSystemd({
  addressFamilies = "AF_UNIX",
  denyIp = true,
  executable,
  executableArgs,
  group = "postgres",
  readOnlyPaths = [],
  stdin,
  timeoutSeconds,
  user = "postgres",
}) {
  const systemdRun = await trustedExecutable("/usr/bin/systemd-run");
  const systemctl = await trustedExecutable("/usr/bin/systemctl");
  const env = await trustedExecutable("/usr/bin/env");
  const unitName = `current188-upgrade-control-${process.pid}-${randomBytes(8).toString("hex")}`;
  const systemdArgs = [
    "--quiet",
    "--wait",
    "--collect",
    "--pipe",
    `--unit=${unitName}`,
    "--service-type=exec",
    `--property=User=${user}`,
    `--property=Group=${group}`,
    "--property=KillMode=control-group",
    "--property=TimeoutStopSec=5s",
    `--property=RuntimeMaxSec=${timeoutSeconds}s`,
    "--property=NoNewPrivileges=yes",
    "--property=PrivateTmp=yes",
    "--property=ProtectHome=yes",
    "--property=ProtectSystem=strict",
    "--property=ProtectControlGroups=yes",
    "--property=RestrictSUIDSGID=yes",
    "--property=LockPersonality=yes",
    `--property=RestrictAddressFamilies=${addressFamilies}`,
    "--property=UMask=0077",
  ];
  if (denyIp) systemdArgs.push("--property=IPAddressDeny=any");
  for (const readOnlyPath of readOnlyPaths) {
    systemdArgs.push(`--property=ReadOnlyPaths=${readOnlyPath}`);
  }
  systemdArgs.push(
    env,
    "-i",
    "HOME=/var/lib/postgresql",
    "LANG=C.UTF-8",
    "LC_ALL=C.UTF-8",
    "PATH=/usr/sbin:/usr/bin:/sbin:/bin",
    "TZ=UTC",
    executable,
    ...executableArgs,
  );
  return new Promise((resolve) => {
    const child = spawn(systemdRun, systemdArgs, {
      env: {
        LANG: "C.UTF-8",
        LC_ALL: "C.UTF-8",
        PATH: "/usr/sbin:/usr/bin:/sbin:/bin",
        TZ: "UTC",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let overflow = false;
    let timedOut = false;
    let settled = false;
    let cleanupPromise = null;
    let forceTimer = null;
    const cleanup = () => {
      if (cleanupPromise === null) {
        cleanupPromise = stopSystemdExecution(systemctl, unitName);
      }
      return cleanupPromise;
    };
    const settle = async (code, signal, spawnFailed = false) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (forceTimer !== null) clearTimeout(forceTimer);
      const cgroupEmpty = await cleanup().catch(() => false);
      if (!cgroupEmpty) {
        resolve(childEvidence("AMBIGUOUS", code, signal, stdout, stderr));
        return;
      }
      resolve(
        childEvidence(
          timedOut
            ? "AMBIGUOUS"
            : !spawnFailed && !overflow && code === 0 && signal === null
              ? "SUCCEEDED"
              : "FAILED",
          code,
          signal,
          stdout,
          stderr,
        ),
      );
    };
    const collect = (target, chunk) => {
      const next = target + chunk.toString("utf8");
      if (Buffer.byteLength(next) > MAX_CHILD_OUTPUT_BYTES) {
        overflow = true;
        void cleanup();
        return target;
      }
      return next;
    };
    child.stdout.on("data", (chunk) => {
      stdout = collect(stdout, chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr = collect(stderr, chunk);
    });
    const timer = setTimeout(() => {
      timedOut = true;
      void cleanup();
      forceTimer = setTimeout(() => child.kill("SIGKILL"), 7_000);
      forceTimer.unref();
    }, (timeoutSeconds + 5) * 1000);
    child.once("error", () => void settle(null, null, true));
    child.once("close", (code, signal) => void settle(code, signal));
    child.stdin.end(stdin);
  });
}

function sqlLiteral(value, reasonCode = "CURRENT188_LEGACY_SQL_VALUE_INVALID") {
  if (typeof value !== "string" || value.includes("\0")) fail(reasonCode);
  return `'${value.replaceAll("'", "''")}'`;
}

function exactClusterGuardSql(target) {
  return `
DO $current188_exact_cluster$
DECLARE
  observed_system_identifier TEXT;
BEGIN
  SELECT control.system_identifier::TEXT
  INTO observed_system_identifier
  FROM pg_catalog.pg_control_system() AS control;
  IF pg_catalog.current_database() IS DISTINCT FROM ${sqlLiteral(target.databaseName)}
     OR pg_catalog.current_setting('port')::INTEGER IS DISTINCT FROM ${target.port}
     OR observed_system_identifier IS DISTINCT FROM ${sqlLiteral(target.expectedSystemIdentifier)}
     OR pg_catalog.pg_is_in_recovery()
     OR SESSION_USER IS DISTINCT FROM ${sqlLiteral(target.privilegedExecutionRole.name)}
  THEN
    RAISE EXCEPTION 'CURRENT188_LEGACY_PRIVILEGED_CLUSTER_IDENTITY_MISMATCH';
  END IF;
END
$current188_exact_cluster$;
`;
}

function targetMigrationBody(rawSql) {
  const beginMarker = "\nBEGIN;\n";
  const commitMarker = "\nCOMMIT;\n";
  const begin = rawSql.indexOf(beginMarker);
  const commit = rawSql.lastIndexOf(commitMarker);
  if (
    begin < 0 ||
    commit < begin ||
    commit + commitMarker.length !== rawSql.length ||
    rawSql.indexOf(beginMarker, begin + beginMarker.length) !== -1
  ) {
    fail("CURRENT188_LEGACY_TARGET_MIGRATION_BOUNDARY_INVALID");
  }
  return rawSql.slice(begin + beginMarker.length, commit);
}

export function createFounderPilotCurrent188LegacyOwnershipLocalPostgresExecutor() {
  if (
    process.platform !== "linux" ||
    typeof process.geteuid !== "function" ||
    process.geteuid() !== 0
  ) {
    fail("CURRENT188_LEGACY_PRIVILEGED_AUTHORITY_REQUIRED");
  }
  async function command(target, sql, timeoutSeconds, readOnlyPath) {
    const psql = await trustedExecutable("/usr/lib/postgresql/16/bin/psql");
    return spawnBoundedSystemd({
      executable: psql,
      executableArgs: [
        "--no-psqlrc",
        "--set=ON_ERROR_STOP=1",
        `--host=${target.socketDirectory}`,
        `--port=${target.port}`,
        `--username=${target.privilegedExecutionRole.name}`,
        `--dbname=${target.databaseName}`,
        "--file=-",
      ],
      readOnlyPaths: readOnlyPath ? [readOnlyPath] : [],
      stdin: sql,
      timeoutSeconds,
    });
  }
  return Object.freeze({
    grantRuntimeAccess: async ({
      applicationRuntimeRole,
      target,
      timeoutSeconds,
    }) => {
      const role = quoteIdentifier(applicationRuntimeRole);
      const tables = SUPPORT_TABLES.map((name) => `public."${name}"`).join(
        ", ",
      );
      const ticketTable = 'public."GuestSupportTicket"';
      const appendOnlyTables = [
        'public."GuestSupportAttachment"',
        'public."GuestSupportTicketAuditEvent"',
        'public."GuestSupportTicketComment"',
      ].join(", ");
      const types = SUPPORT_ENUMS.map(({ name }) => `public."${name}"`).join(
        ", ",
      );
      const sql = [
        "BEGIN;",
        "SET LOCAL lock_timeout = '5s';",
        "SET LOCAL statement_timeout = '2min';",
        exactClusterGuardSql(target),
        `REVOKE ALL PRIVILEGES ON TABLE ${tables} FROM PUBLIC;`,
        `REVOKE ALL PRIVILEGES ON TYPE ${types} FROM PUBLIC;`,
        `REVOKE ALL PRIVILEGES ON TABLE ${tables} FROM ${role};`,
        `REVOKE ALL PRIVILEGES ON TYPE ${types} FROM ${role};`,
        `GRANT SELECT, INSERT, UPDATE ON TABLE ${ticketTable} TO ${role};`,
        `GRANT SELECT, INSERT ON TABLE ${appendOnlyTables} TO ${role};`,
        `GRANT USAGE ON TYPE ${types} TO ${role};`,
        "COMMIT;",
      ].join("\n");
      return command(target, sql, timeoutSeconds);
    },
    migrate: async ({
      laneRoot,
      materializedTreeDigest,
      target,
      timeoutSeconds,
    }) => {
      const canonicalLaneRoot = await preparePostgresLane(
        laneRoot,
        materializedTreeDigest,
      );
      const migrationPath = path.join(
        canonicalLaneRoot,
        "migrations",
        TARGET_HEAD,
        "migration.sql",
      );
      const rawMigration = await readFile(migrationPath, "utf8");
      if (sha256(rawMigration) !== TARGET_MIGRATION_SHA256) {
        fail("CURRENT188_LEGACY_TARGET_MIGRATION_DRIFT");
      }
      const migrationId = randomUUID();
      const migrationSql = [
        "BEGIN;",
        "SET LOCAL lock_timeout = '5s';",
        "SET LOCAL statement_timeout = '2min';",
        exactClusterGuardSql(target),
        `INSERT INTO public."_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count") VALUES (${sqlLiteral(migrationId)}, ${sqlLiteral(TARGET_MIGRATION_SHA256)}, NULL, ${sqlLiteral(TARGET_HEAD)}, NULL, NULL, pg_catalog.clock_timestamp(), 0);`,
        targetMigrationBody(rawMigration),
        `UPDATE public."_prisma_migrations" SET "finished_at" = pg_catalog.clock_timestamp(), "applied_steps_count" = 1 WHERE "id" = ${sqlLiteral(migrationId)} AND "migration_name" = ${sqlLiteral(TARGET_HEAD)} AND "checksum" = ${sqlLiteral(TARGET_MIGRATION_SHA256)} AND "finished_at" IS NULL AND "rolled_back_at" IS NULL;`,
        `DO $current188_migration_receipt$ BEGIN IF (SELECT pg_catalog.count(*) FROM public."_prisma_migrations" WHERE "id" = ${sqlLiteral(migrationId)} AND "migration_name" = ${sqlLiteral(TARGET_HEAD)} AND "checksum" = ${sqlLiteral(TARGET_MIGRATION_SHA256)} AND "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL AND "applied_steps_count" = 1) <> 1 THEN RAISE EXCEPTION 'CURRENT188_LEGACY_MIGRATION_RECEIPT_NOT_WRITTEN'; END IF; END $current188_migration_receipt$;`,
        "COMMIT;",
        "",
      ].join("\n");
      return command(
        target,
        migrationSql,
        timeoutSeconds,
        canonicalLaneRoot,
      );
    },
  });
}

async function inspectRootProtectedFile(filePath, expectedSha256) {
  const metadata = await lstat(filePath, { bigint: true }).catch(() => null);
  if (
    metadata === null ||
    metadata.isSymbolicLink() ||
    !metadata.isFile() ||
    metadata.uid !== 0n ||
    metadata.nlink !== 1n ||
    (Number(metadata.mode) & 0o022) !== 0
  ) {
    fail("CURRENT188_LEGACY_RUNTIME_SAFETY_FILE_INVALID");
  }
  return inspectFounderPilotImmutableFile({ expectedSha256, filePath });
}

function parseExactEnvironment(raw) {
  const values = new Map();
  for (const rawLine of raw.split("\n")) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) fail("CURRENT188_LEGACY_CANARY_ENVIRONMENT_INVALID");
    const key = line.slice(0, separator);
    const value = line.slice(separator + 1);
    if (!/^[A-Z][A-Z0-9_]*$/u.test(key) || values.has(key)) {
      fail("CURRENT188_LEGACY_CANARY_ENVIRONMENT_INVALID");
    }
    values.set(key, value);
  }
  for (const [key, expected] of Object.entries(
    REQUIRED_DISABLED_WORKER_ENVIRONMENT,
  )) {
    if (values.get(key) !== expected) {
      fail("CURRENT188_LEGACY_WORKER_ENVIRONMENT_NOT_DRAINED");
    }
  }
  return Object.fromEntries([...values.entries()].sort());
}

function normalizeSystemdInventory(stdout, kind) {
  const rows = stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("leetplus-"))
    .map((line) => line.split(/\s+/u));
  if (kind === "UNIT_FILES") {
    return rows.map(([name, state, preset]) => ({ name, preset, state }));
  }
  return rows.map(([name, load, active, sub]) => ({
    active,
    load,
    name,
    sub,
  }));
}

function parseSystemdShow(stdout) {
  const values = Object.fromEntries(
    stdout
      .split("\n")
      .filter((line) => line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
  return Object.freeze({
    activeState: values.ActiveState ?? null,
    loadState: values.LoadState ?? null,
    unitFileState: values.UnitFileState ?? null,
  });
}

export function createFounderPilotCurrent188LegacyOwnershipRuntimeSafetyAdapter(
  rawManifest,
) {
  if (
    process.platform !== "linux" ||
    typeof process.geteuid !== "function" ||
    process.geteuid() !== 0
  ) {
    fail("CURRENT188_LEGACY_PRIVILEGED_AUTHORITY_REQUIRED");
  }
  const manifest =
    normalizeFounderPilotCurrent188LegacyOwnershipManifest(rawManifest);
  const safety = manifest.runtimeSafety;
  async function run(executable, executableArgs, timeoutSeconds = 120) {
    const trusted = await trustedExecutable(executable);
    const result = await spawnBoundedSystemd({
      addressFamilies: "AF_UNIX AF_INET AF_INET6",
      denyIp: false,
      executable: trusted,
      executableArgs,
      group: "root",
      readOnlyPaths: [
        safety.apiUnitTemplatePath,
        safety.canaryEnvironmentPath,
        safety.legacyDrainReceiptPath,
        safety.legacyDrainVerifierPath,
      ],
      stdin: "",
      timeoutSeconds,
      user: "root",
    });
    if (result.status !== "SUCCEEDED") {
      fail("CURRENT188_LEGACY_RUNTIME_SAFETY_COMMAND_FAILED");
    }
    return result;
  }
  return Object.freeze({
    inspect: async () => {
      const [apiUnit, canaryEnvironment, drainReceipt, drainVerifier] =
        await Promise.all([
          inspectRootProtectedFile(
            safety.apiUnitTemplatePath,
            safety.apiUnitTemplateSha256,
          ),
          inspectRootProtectedFile(
            safety.canaryEnvironmentPath,
            safety.canaryEnvironmentSha256,
          ),
          inspectRootProtectedFile(
            safety.legacyDrainReceiptPath,
            safety.legacyDrainReceiptSha256,
          ),
          inspectRootProtectedFile(
            safety.legacyDrainVerifierPath,
            safety.legacyDrainVerifierSha256,
          ),
        ]);
      const [apiUnitSource, canarySource] = await Promise.all([
        readFile(safety.apiUnitTemplatePath, "utf8"),
        readFile(safety.canaryEnvironmentPath, "utf8"),
      ]);
      const slotEnvironment = apiUnitSource.indexOf(
        "EnvironmentFile=/etc/leetplus/slots/%i.env",
      );
      const canaryOverlay = apiUnitSource.indexOf(
        "EnvironmentFile=/etc/leetplus/canary-safe.env",
      );
      const userCallOverlay = apiUnitSource.indexOf(
        "EnvironmentFile=/etc/leetplus/guest-user-call-live.env",
      );
      if (
        slotEnvironment < 0 ||
        canaryOverlay <= slotEnvironment ||
        userCallOverlay <= canaryOverlay
      ) {
        fail("CURRENT188_LEGACY_API_UNIT_ENVIRONMENT_ORDER_INVALID");
      }
      const workerEnvironment = parseExactEnvironment(canarySource);
      const systemctl = await trustedExecutable("/usr/bin/systemctl");
      const [verifierResult, unitFilesResult, unitsResult] = await Promise.all([
        run("/usr/bin/bash", ["-p", safety.legacyDrainVerifierPath]),
        run(systemctl, [
          "list-unit-files",
          "--type=service",
          "--type=timer",
          "--no-legend",
          "--no-pager",
          "--plain",
        ]),
        run(systemctl, [
          "list-units",
          "--all",
          "--type=service",
          "--type=timer",
          "--no-legend",
          "--no-pager",
          "--plain",
        ]),
      ]);
      if (
        !verifierResult.stdout
          .split("\n")
          .includes("LEGACY_RUNTIME_DRAIN_ACCEPTED=true")
      ) {
        fail("CURRENT188_LEGACY_DRAIN_RECEIPT_NOT_LIVE");
      }
      const unitFiles = normalizeSystemdInventory(
        unitFilesResult.stdout,
        "UNIT_FILES",
      );
      const units = normalizeSystemdInventory(unitsResult.stdout, "UNITS");
      const states = {};
      for (const unit of [
        ...FORBIDDEN_MANUAL_UNITS,
        ...DRAINED_BACKGROUND_UNITS,
      ]) {
        const result = await run(systemctl, [
          "show",
          unit,
          "--property=LoadState",
          "--property=ActiveState",
          "--property=UnitFileState",
          "--no-pager",
        ]);
        states[unit] = parseSystemdShow(result.stdout);
      }
      for (const unit of FORBIDDEN_MANUAL_UNITS) {
        const state = states[unit];
        if (
          state.loadState !== "not-found" ||
          state.activeState !== "inactive" ||
          unitFiles.some(({ name }) => name === unit) ||
          units.some(({ name }) => name === unit)
        ) {
          fail("CURRENT188_LEGACY_MANUAL_USER_CALL_UNIT_PRESENT");
        }
      }
      for (const unit of DRAINED_BACKGROUND_UNITS) {
        const state = states[unit];
        if (
          !["loaded", "not-found"].includes(state.loadState) ||
          state.activeState === "active" ||
          (state.loadState === "loaded" &&
            !["disabled", "masked", "static"].includes(state.unitFileState))
        ) {
          fail("CURRENT188_LEGACY_BACKGROUND_UNIT_NOT_DRAINED");
        }
      }
      const systemdUnitInventoryDigest = sha256(
        stableJson({ states, unitFiles, units }),
      );
      return Object.freeze({
        accepted: true,
        apiUnitTemplateSha256: apiUnit.actualSha256,
        canaryEnvironmentSha256: canaryEnvironment.actualSha256,
        legacyDrainReceiptSha256: drainReceipt.actualSha256,
        legacyDrainVerifierOutputSha256: verifierResult.stdoutSha256,
        legacyDrainVerifierSha256: drainVerifier.actualSha256,
        systemdUnitInventoryDigest,
        workerEnvironmentDigest: sha256(stableJson(workerEnvironment)),
      });
    },
  });
}

export function createFounderPilotCurrent188LegacyOwnershipBridgeRuntimeAdapter(
  options,
) {
  return createFounderPilotCurrent188ProductionBridgeRuntimeAdapter(options);
}

export const FOUNDER_PILOT_CURRENT188_LEGACY_OWNERSHIP_CONSTANTS =
  Object.freeze({
    safeLaneParent: SAFE_LANE_PARENT,
    sourceMigrationCount: SOURCE_COUNT,
    sourceMigrationHead: SOURCE_HEAD,
    sourceWorkerFunctionComment: SOURCE_WORKER_FUNCTION_COMMENT,
    sourceWorkerFunctionSha256: SOURCE_WORKER_FUNCTION_SHA256,
    supportConstraints: SUPPORT_CONSTRAINTS,
    supportEnums: SUPPORT_ENUMS,
    supportIndexes: SUPPORT_INDEXES,
    supportTablePrivileges: EXPECTED_RUNTIME_TABLE_PRIVILEGES,
    supportTables: SUPPORT_TABLES,
    targetMigrationCount: TARGET_COUNT,
    targetMigrationHead: TARGET_HEAD,
    targetMigrationSha256: TARGET_MIGRATION_SHA256,
    targetPreterminalManifestSha256: TARGET_PRETERMINAL_MANIFEST_SHA256,
    targetSupportCatalogSha256: TARGET_SUPPORT_CATALOG_SHA256,
    targetWorkerFunctionComment: TARGET_WORKER_FUNCTION_COMMENT,
    targetWorkerFunctionSha256: TARGET_WORKER_FUNCTION_SHA256,
  });

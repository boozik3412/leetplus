import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const IDENTITY_MAIL_TENANT_ENROLLMENT_FOUNDATION_CONTRACT =
  "IDENTITY_MAIL_TENANT_ENROLLMENT_FOUNDATION_STATIC_V1";
export const IDENTITY_MAIL_TENANT_ENROLLMENT_FOUNDATION_SCHEMA_VERSION = 1;
export const IDENTITY_MAIL_TENANT_ENROLLMENT_FOUNDATION_BASE_COUNT = 179;
export const IDENTITY_MAIL_TENANT_ENROLLMENT_FOUNDATION_BASE_HEAD =
  "20260731120000_identity_mail_delivery_release_head";
export const IDENTITY_MAIL_TENANT_ENROLLMENT_FOUNDATION_CANDIDATE_ORDINAL = 180;
export const IDENTITY_MAIL_TENANT_ENROLLMENT_FOUNDATION_CANDIDATE =
  "20260801010000_identity_mail_tenant_enrollment_control_plane";

const EXPECTED_CANDIDATE_DIRECTORIES = Object.freeze([
  IDENTITY_MAIL_TENANT_ENROLLMENT_FOUNDATION_CANDIDATE,
  "20260801020000_identity_mail_tenant_lock_drain_worker_v2",
  "20260801030000_identity_mail_tenant_first_claim_protocol",
  "20260802010000_identity_mail_worker_v2_freshness_protocol",
]);

export const IDENTITY_MAIL_TENANT_ENROLLMENT_FOUNDATION_FINDINGS =
  Object.freeze({
    ACL_SURFACE_DRIFT: "ACL_SURFACE_DRIFT",
    ADDED_COLUMN_SURFACE_DRIFT: "ADDED_COLUMN_SURFACE_DRIFT",
    ALTERED_TABLE_SURFACE_DRIFT: "ALTERED_TABLE_SURFACE_DRIFT",
    ARTIFACT_INVALID: "ARTIFACT_INVALID",
    AUTHORIZATION_ENVELOPE_BINDING_MISSING:
      "AUTHORIZATION_ENVELOPE_BINDING_MISSING",
    CANONICAL_COUNT_MISMATCH: "CANONICAL_COUNT_MISMATCH",
    CANONICAL_DIRECTORY_DRIFT: "CANONICAL_DIRECTORY_DRIFT",
    CANONICAL_HEAD_MISMATCH: "CANONICAL_HEAD_MISMATCH",
    CANONICAL_MANIFEST_MISMATCH: "CANONICAL_MANIFEST_MISMATCH",
    CANDIDATE_DIGEST_MISMATCH: "CANDIDATE_DIGEST_MISMATCH",
    CANDIDATE_EXECUTION_FENCE_MISSING:
      "CANDIDATE_EXECUTION_FENCE_MISSING",
    CANDIDATE_HEAD_MISMATCH: "CANDIDATE_HEAD_MISMATCH",
    CANDIDATE_METADATA_MISMATCH: "CANDIDATE_METADATA_MISMATCH",
    CANDIDATE_ORDINAL_MISMATCH: "CANDIDATE_ORDINAL_MISMATCH",
    CANDIDATE_RECEIPT_FENCE_MISSING:
      "CANDIDATE_RECEIPT_FENCE_MISSING",
    COMMENT_SURFACE_DRIFT: "COMMENT_SURFACE_DRIFT",
    COMMAND_DRAIN_PROJECTION_MISSING: "COMMAND_DRAIN_PROJECTION_MISSING",
    CONSTRAINT_SURFACE_DRIFT: "CONSTRAINT_SURFACE_DRIFT",
    CREATED_COLUMN_SURFACE_DRIFT: "CREATED_COLUMN_SURFACE_DRIFT",
    CREATED_TABLE_SURFACE_DRIFT: "CREATED_TABLE_SURFACE_DRIFT",
    CURRENT_CONFIGURATION_DIGEST_MISSING:
      "CURRENT_CONFIGURATION_DIGEST_MISSING",
    DORMANT_GUARD_NOT_STATEMENT_LEVEL:
      "DORMANT_GUARD_NOT_STATEMENT_LEVEL",
    EMPTY_REGISTRY_PRECONDITION_MISSING:
      "EMPTY_REGISTRY_PRECONDITION_MISSING",
    ENROLLMENT_ACTIVE_COMMAND_DRAIN_FK_MISSING:
      "ENROLLMENT_ACTIVE_COMMAND_DRAIN_FK_MISSING",
    ENROLLMENT_LAST_EVENT_PROJECTION_FK_MISSING:
      "ENROLLMENT_LAST_EVENT_PROJECTION_FK_MISSING",
    EVENT_AUTHORITY_BINDING_MISSING: "EVENT_AUTHORITY_BINDING_MISSING",
    EVENT_CHAIN_GUARD_MISSING: "EVENT_CHAIN_GUARD_MISSING",
    EVENT_CONTINUITY_FK_MISSING: "EVENT_CONTINUITY_FK_MISSING",
    EVENT_TERMINAL_PROJECTION_MISSING:
      "EVENT_TERMINAL_PROJECTION_MISSING",
    FORBIDDEN_COORDINATOR_ROUTINE: "FORBIDDEN_COORDINATOR_ROUTINE",
    FORBIDDEN_DDL: "FORBIDDEN_DDL",
    FORBIDDEN_SENSITIVE_DML: "FORBIDDEN_SENSITIVE_DML",
    GRANT_PRESENT: "GRANT_PRESENT",
    GUARD_FUNCTION_SURFACE_DRIFT: "GUARD_FUNCTION_SURFACE_DRIFT",
    INDEX_SURFACE_DRIFT: "INDEX_SURFACE_DRIFT",
    LIVING_CONTRACT_AUTHORIZES: "LIVING_CONTRACT_AUTHORIZES",
    LIVING_CONTRACT_DRIFT: "LIVING_CONTRACT_DRIFT",
    LIVING_PREFLIGHT_AUTHORIZES: "LIVING_PREFLIGHT_AUTHORIZES",
    LIVING_PREFLIGHT_DRIFT: "LIVING_PREFLIGHT_DRIFT",
    PRECONDITION_ORDER_INVALID: "PRECONDITION_ORDER_INVALID",
    REHEARSAL_EXECUTION_FENCE_MISSING:
      "REHEARSAL_EXECUTION_FENCE_MISSING",
    TRANSACTION_ENVELOPE_INVALID: "TRANSACTION_ENVELOPE_INVALID",
    TRIGGER_SURFACE_DRIFT: "TRIGGER_SURFACE_DRIFT",
  });

const EXPECTED_BASE_MANIFEST_DIGEST =
  "3330185424ca669c18f39c2da5aa1e49f942500c0c85185c9125930e02df9431";
const EXPECTED_BASE_HEAD_CHECKSUM =
  "c394060fbf979c567403976c8e906dc67b3bd840aea9fa9550e1d939d04af519";
const EXPECTED_CANDIDATE_SHA256 =
  "e84ba3c4e9e61d1d759b82a33fc22c853471fb0ef908546e755699d0d264f683";
const EXPECTED_CONTRACT_SHA256 =
  "cd118382acd034b90ecf2e923ba72142883cf48e3b770829565fca1878ece109";
const EXPECTED_PREFLIGHT_SHA256 =
  "48f36f41a0e7d0291d88a18282f0849a41061f7ef6b206ddce768b4547d8e485";

const MIGRATION_NAME_PATTERN = /^[0-9]{14}_[a-z0-9_]+$/u;
const SHA_256_PATTERN = /^[0-9a-f]{64}$/u;
const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const DATABASE_DIRECTORY = dirname(SCRIPT_DIRECTORY);
const CANONICAL_MIGRATIONS_DIRECTORY = join(
  DATABASE_DIRECTORY,
  "prisma",
  "migrations",
);
const CANDIDATES_DIRECTORY = join(DATABASE_DIRECTORY, "migration-candidates");
const CANDIDATE_PATH = join(
  CANDIDATES_DIRECTORY,
  IDENTITY_MAIL_TENANT_ENROLLMENT_FOUNDATION_CANDIDATE,
  "migration.sql",
);
const CANDIDATE_METADATA_PATH = join(
  CANDIDATES_DIRECTORY,
  IDENTITY_MAIL_TENANT_ENROLLMENT_FOUNDATION_CANDIDATE,
  "candidate.json",
);
const CONTRACT_PATH = join(
  SCRIPT_DIRECTORY,
  "identity-mail-tenant-enrollment-contract.mjs",
);
const PREFLIGHT_PATH = join(
  SCRIPT_DIRECTORY,
  "identity-mail-tenant-enrollment-preflight.mjs",
);

const EXPECTED_CREATED_TABLES = Object.freeze([
  "IdentityMailDeliveryTenantEnrollmentCommand",
  "IdentityMailDeliveryTenantEnrollmentEvent",
]);

const EXPECTED_COMMAND_COLUMNS = Object.freeze([
  "id",
  "tenantId",
  "requestId",
  "action",
  "intent",
  "contractVersion",
  "signatureDomain",
  "rollbackOfCommandId",
  "proposalContentDigest",
  "proposalCanonicalJson",
  "authorizationEnvelopeDigest",
  "authorizationEnvelopeCanonicalJson",
  "expectedState",
  "targetState",
  "expectedPolicyRevision",
  "nextPolicyRevision",
  "stateRevisionBefore",
  "drainStateRevision",
  "finalStateRevision",
  "previousWorkerRoleName",
  "previousWorkerRoleOid",
  "previousProviderAuthorityDigest",
  "previousMaxAttempts",
  "previousLeaseSeconds",
  "previousAcknowledgeSeconds",
  "previousBaseRetrySeconds",
  "previousMaxRetrySeconds",
  "previousConfigurationDigest",
  "targetWorkerRoleName",
  "targetWorkerRoleOid",
  "targetProviderAuthorityDigest",
  "targetMaxAttempts",
  "targetLeaseSeconds",
  "targetAcknowledgeSeconds",
  "targetBaseRetrySeconds",
  "targetMaxRetrySeconds",
  "targetConfigurationDigest",
  "runtimeConfigDigest",
  "expectedDatabaseName",
  "expectedDatabaseOid",
  "databaseIdentityDigest",
  "deploymentMarkerId",
  "deploymentMarkerDigest",
  "actualContextDigest",
  "releaseSha",
  "actorDigest",
  "signatureAlgorithm",
  "signingKeyId",
  "publicKeyFingerprint",
  "signatureBase64url",
  "signatureVerifiedAt",
  "requestedAt",
  "expiresAt",
  "acceptedAt",
  "acceptedTransactionId",
  "receipt",
  "receiptDigest",
]);

const EXPECTED_EVENT_COLUMNS = Object.freeze([
  "id",
  "tenantId",
  "commandId",
  "eventSequence",
  "eventType",
  "fromState",
  "toState",
  "fromPolicyRevision",
  "toPolicyRevision",
  "fromStateRevision",
  "toStateRevision",
  "fromConfigurationDigest",
  "toConfigurationDigest",
  "commandContentDigest",
  "actorDigest",
  "eventAt",
  "createdTransactionId",
  "previousEventDigest",
  "eventDigest",
  "receipt",
  "receiptDigest",
]);

const EXPECTED_ADDED_COLUMNS = Object.freeze([
  "state",
  "stateRevision",
  "activeCommandId",
  "lastEventDigest",
  "currentConfigurationDigest",
  "stateChangedAt",
]);

const EXPECTED_ALTERED_TABLES = Object.freeze([
  "SharedBetaRuntimeReleaseMarker",
  "IdentityMailDeliveryTenantEnrollmentCommand",
  "IdentityMailDeliveryTenantEnrollmentCommand",
  "IdentityMailDeliveryTenantEnrollmentCommand",
  "IdentityMailDeliveryTenantEnrollmentEvent",
  "IdentityMailDeliveryTenantEnrollmentEvent",
  "IdentityMailDeliveryTenantEnrollmentEvent",
  "IdentityMailDeliveryTenantEnrollmentEvent",
  "IdentityMailDeliveryTenantEnrollment",
  "IdentityMailDeliveryTenantEnrollment",
  "IdentityMailDeliveryTenantEnrollment",
  "IdentityMailDeliveryTenantEnrollment",
  "IdentityMailDeliveryTenantEnrollment",
  "IdentityMailDeliveryTenantEnrollment",
]);

const EXPECTED_ADDED_CONSTRAINTS = Object.freeze([
  "shared_beta_runtime_marker_enrollment_binding_key",
  "IdentityMailDeliveryTenantEnrollmentCommand_pkey",
  "identity_mail_tenant_enrollment_command_tenant_id_key",
  "identity_mail_tenant_enrollment_command_request_uidx",
  "identity_mail_tenant_enrollment_command_digest_key",
  "identity_mail_tenant_enrollment_command_drain_projection_key",
  "identity_mail_tenant_enrollment_command_identifier_check",
  "identity_mail_tenant_enrollment_command_kind_check",
  "identity_mail_tenant_enrollment_command_digest_check",
  "identity_mail_tenant_enrollment_command_transition_check",
  "identity_mail_tenant_enrollment_command_revision_check",
  "identity_mail_tenant_enrollment_command_previous_check",
  "identity_mail_tenant_enrollment_command_target_check",
  "identity_mail_tenant_enrollment_command_mutation_check",
  "identity_mail_tenant_enrollment_command_binding_check",
  "identity_mail_tenant_enrollment_command_signature_check",
  "identity_mail_tenant_enrollment_command_timeline_check",
  "identity_mail_tenant_enrollment_command_payload_check",
  "identity_mail_tenant_enrollment_command_receipt_check",
  "IdentityMailDeliveryTenantEnrollmentEvent_pkey",
  "identity_mail_tenant_enrollment_event_tenant_digest_key",
  "identity_mail_tenant_enrollment_event_terminal_projection_key",
  "identity_mail_tenant_enrollment_event_command_sequence_uidx",
  "identity_mail_tenant_enrollment_event_state_revision_uidx",
  "identity_mail_tenant_enrollment_event_previous_uidx",
  "identity_mail_tenant_enrollment_event_identifier_check",
  "identity_mail_tenant_enrollment_event_transition_check",
  "identity_mail_tenant_enrollment_event_revision_check",
  "identity_mail_tenant_enrollment_event_digest_check",
  "identity_mail_tenant_enrollment_event_timeline_check",
  "identity_mail_tenant_enrollment_event_receipt_check",
  "IdentityMailDeliveryTenantEnrollmentCommand_tenantId_fkey",
  "IdentityMailDeliveryTenantEnrollmentCommand_marker_fkey",
  "IdentityMailDeliveryTenantEnrollmentCommand_rollback_fkey",
  "IdentityMailDeliveryTenantEnrollmentEvent_tenantId_fkey",
  "IdentityMailDeliveryTenantEnrollmentEvent_command_fkey",
  "IdentityMailDeliveryTenantEnrollmentEvent_previous_fkey",
  "IdentityMailDeliveryTenantEnrollmentEvent_continuity_fkey",
  "IdentityMailDeliveryTenantEnrollment_state_check",
  "IdentityMailDeliveryTenantEnrollment_ledger_check",
  "IdentityMailDeliveryTenantEnrollment_activeCommand_fkey",
  "IdentityMailDeliveryTenantEnrollment_lastEvent_fkey",
]);

const EXPECTED_DROPPED_CONSTRAINTS = Object.freeze([
  "IdentityMailDeliveryTenantEnrollment_state_check",
]);

const EXPECTED_INDEXES = Object.freeze([
  "identity_mail_tenant_enrollment_command_marker_idx",
  "identity_mail_tenant_enrollment_command_rollback_idx",
  "identity_mail_tenant_enrollment_command_accepted_idx",
  "identity_mail_tenant_enrollment_event_timeline_idx",
  "identity_mail_tenant_enrollment_worker_state_idx",
  "identity_mail_tenant_enrollment_active_command_idx",
]);

const EXPECTED_GUARD_FUNCTIONS = Object.freeze([
  "identity_mail_tenant_enrollment_command_guard_v1",
  "identity_mail_tenant_enrollment_event_guard_v1",
  "identity_mail_tenant_enrollment_registry_dormant_guard_v1",
]);

const EXPECTED_TRIGGERS = Object.freeze([
  "IdentityMailEnrollmentCommand_dml_guard_trigger",
  "IdentityMailEnrollmentCommand_truncate_guard_trigger",
  "IdentityMailEnrollmentEvent_dml_guard_trigger",
  "IdentityMailEnrollmentEvent_truncate_guard_trigger",
  "IdentityMailEnrollment_00_dormant_guard_trigger",
]);

const EXPECTED_REVOKES = Object.freeze([
  "TABLE:IdentityMailDeliveryTenantEnrollmentCommand",
  "TABLE:IdentityMailDeliveryTenantEnrollmentEvent",
  "FUNCTION:identity_mail_tenant_enrollment_command_guard_v1",
  "FUNCTION:identity_mail_tenant_enrollment_event_guard_v1",
  "FUNCTION:identity_mail_tenant_enrollment_registry_dormant_guard_v1",
]);

const EXPECTED_COMMENTS = Object.freeze([
  "TABLE:IdentityMailDeliveryTenantEnrollmentCommand:",
  "COLUMN:IdentityMailDeliveryTenantEnrollmentCommand:proposalCanonicalJson",
  "COLUMN:IdentityMailDeliveryTenantEnrollmentCommand:authorizationEnvelopeCanonicalJson",
  "TABLE:IdentityMailDeliveryTenantEnrollmentEvent:",
  "COLUMN:IdentityMailDeliveryTenantEnrollment:activeCommandId",
]);

const AUTHORIZATION_ENVELOPE_KEYS = Object.freeze([
  "schemaVersion",
  "authorityDomain",
  "authorization",
  "canMutate",
  "contract",
  "commandId",
  "tenantId",
  "requestId",
  "action",
  "intent",
  "rollbackOfCommandId",
  "proposalContentDigest",
  "expectedState",
  "targetState",
  "expectedPolicyRevision",
  "nextPolicyRevision",
  "stateRevisionBefore",
  "drainStateRevision",
  "finalStateRevision",
  "previousConfiguration",
  "targetConfiguration",
  "runtimeConfigDigest",
  "expectedDatabaseName",
  "expectedDatabaseOid",
  "databaseIdentityDigest",
  "deploymentMarkerId",
  "deploymentMarkerDigest",
  "actualContextDigest",
  "releaseSha",
  "actorDigest",
  "signatureAlgorithm",
  "signingKeyId",
  "publicKeyFingerprint",
  "requestedAt",
  "expiresAt",
]);

export class IdentityMailTenantEnrollmentFoundationError extends Error {
  constructor(report) {
    super("Identity mail tenant enrollment foundation is blocked.");
    this.name = "IdentityMailTenantEnrollmentFoundationError";
    this.code = "IDENTITY_MAIL_TENANT_ENROLLMENT_FOUNDATION_BLOCKED";
    this.exitCode = 3;
    this.report = report;
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeSql(value) {
  return String(value ?? "").replace(/\r\n/gu, "\n");
}

function compactSql(value) {
  return normalizeSql(value).replace(/\s+/gu, " ").trim();
}

function exactArray(actual, expected) {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  );
}

function collect(value, pattern, group = 1) {
  return [...String(value ?? "").matchAll(pattern)].map(
    (match) => match[group],
  );
}

function createdTableColumns(sql, tableName) {
  const escaped = tableName.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const block = new RegExp(
    `^CREATE\\s+TABLE\\s+public\\."${escaped}"\\s*\\(([\\s\\S]*?)^\\);`,
    "imu",
  ).exec(sql)?.[1];
  if (typeof block !== "string") {
    return [];
  }
  return collect(block, /^\s{2}"([^"]+)"\s+/gmu);
}

function canonicalManifestDigest(entries) {
  if (!Array.isArray(entries)) {
    return null;
  }
  const rows = [];
  for (const entry of entries) {
    if (
      typeof entry?.name !== "string" ||
      typeof entry?.sha256 !== "string"
    ) {
      return null;
    }
    rows.push(`${entry.name} ${entry.sha256}`);
  }
  return sha256(Buffer.from(`${rows.join("\n")}\n`, "utf8"));
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
  }
  return value;
}

function sourceAuthorizes(source) {
  const text = String(source ?? "");
  return (
    /\bauthorization\s*:\s*true\b/iu.test(text) ||
    /\bcanMutate\s*:\s*true\b/iu.test(text) ||
    !/\bauthorization\s*:\s*false\b/iu.test(text) ||
    !/\bcanMutate\s*:\s*false\b/iu.test(text)
  );
}

function triggerBlocks(sql) {
  return [...sql.matchAll(/^CREATE\s+TRIGGER\s+"([^"]+)"([\s\S]*?);/gimu)].map(
    (match) => ({ name: match[1], body: match[2] }),
  );
}

function safeArtifactShape(artifact) {
  return Boolean(
    artifact &&
      Array.isArray(artifact.canonical?.directoryNames) &&
      Array.isArray(artifact.canonical?.entries) &&
      Array.isArray(artifact.candidates?.directoryNames) &&
      typeof artifact.candidate?.name === "string" &&
      typeof artifact.candidate?.sql === "string" &&
      typeof artifact.candidate?.metadataText === "string" &&
      typeof artifact.livingSources?.contract === "string" &&
      typeof artifact.livingSources?.preflight === "string",
  );
}

export async function loadIdentityMailTenantEnrollmentFoundationArtifact() {
  const canonicalDirectoryEntries = await readdir(
    CANONICAL_MIGRATIONS_DIRECTORY,
    { withFileTypes: true },
  );
  const canonicalDirectoryNames = canonicalDirectoryEntries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const canonicalEntries = [];
  for (const name of canonicalDirectoryNames) {
    if (!MIGRATION_NAME_PATTERN.test(name)) {
      continue;
    }
    const bytes = await readFile(
      join(CANONICAL_MIGRATIONS_DIRECTORY, name, "migration.sql"),
    );
    canonicalEntries.push({
      name,
      sha256: sha256(Buffer.from(normalizeSql(bytes.toString("utf8")), "utf8")),
    });
  }

  const candidateDirectoryEntries = await readdir(CANDIDATES_DIRECTORY, {
    withFileTypes: true,
  });
  const candidateDirectoryNames = candidateDirectoryEntries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const [candidateBytes, candidateMetadataBytes, contractBytes, preflightBytes] =
    await Promise.all([
    readFile(CANDIDATE_PATH),
    readFile(CANDIDATE_METADATA_PATH),
    readFile(CONTRACT_PATH),
    readFile(PREFLIGHT_PATH),
    ]);

  return {
    canonical: {
      directoryNames: canonicalDirectoryNames,
      entries: canonicalEntries,
    },
    candidates: { directoryNames: candidateDirectoryNames },
    candidate: {
      name: IDENTITY_MAIL_TENANT_ENROLLMENT_FOUNDATION_CANDIDATE,
      sql: normalizeSql(candidateBytes.toString("utf8")),
      metadataText: candidateMetadataBytes.toString("utf8"),
    },
    livingSources: {
      contract: contractBytes.toString("utf8"),
      preflight: preflightBytes.toString("utf8"),
    },
  };
}

export function evaluateIdentityMailTenantEnrollmentFoundation(artifact) {
  const findingSet = new Set();
  const add = (condition, code) => {
    if (condition) {
      findingSet.add(code);
    }
  };
  const F = IDENTITY_MAIL_TENANT_ENROLLMENT_FOUNDATION_FINDINGS;

  if (!safeArtifactShape(artifact)) {
    findingSet.add(F.ARTIFACT_INVALID);
  }

  const canonicalDirectories = Array.isArray(
    artifact?.canonical?.directoryNames,
  )
    ? artifact.canonical.directoryNames
    : [];
  const canonicalEntries = Array.isArray(artifact?.canonical?.entries)
    ? artifact.canonical.entries
    : [];
  const canonicalNames = canonicalEntries.map((entry) => entry?.name);
  const candidateDirectories = Array.isArray(
    artifact?.candidates?.directoryNames,
  )
    ? artifact.candidates.directoryNames
    : [];
  const candidateName = String(artifact?.candidate?.name ?? "");
  const sql = normalizeSql(artifact?.candidate?.sql);
  const compact = compactSql(sql);
  const metadataText = String(artifact?.candidate?.metadataText ?? "");
  const contractSource = String(artifact?.livingSources?.contract ?? "");
  const preflightSource = String(artifact?.livingSources?.preflight ?? "");
  const baseManifestDigest = canonicalManifestDigest(canonicalEntries);
  const candidateDigest = sha256(Buffer.from(sql, "utf8"));
  const contractDigest = sha256(Buffer.from(contractSource, "utf8"));
  const preflightDigest = sha256(Buffer.from(preflightSource, "utf8"));

  add(
    canonicalDirectories.some((name) => !MIGRATION_NAME_PATTERN.test(name)) ||
      !exactArray(canonicalDirectories, canonicalNames),
    F.CANONICAL_DIRECTORY_DRIFT,
  );
  add(
    canonicalEntries.length !==
      IDENTITY_MAIL_TENANT_ENROLLMENT_FOUNDATION_BASE_COUNT,
    F.CANONICAL_COUNT_MISMATCH,
  );
  add(
    canonicalNames.at(-1) !==
      IDENTITY_MAIL_TENANT_ENROLLMENT_FOUNDATION_BASE_HEAD,
    F.CANONICAL_HEAD_MISMATCH,
  );
  add(
    canonicalEntries.some(
      (entry) =>
        !MIGRATION_NAME_PATTERN.test(String(entry?.name ?? "")) ||
        !SHA_256_PATTERN.test(String(entry?.sha256 ?? "")),
    ) || baseManifestDigest !== EXPECTED_BASE_MANIFEST_DIGEST,
    F.CANONICAL_MANIFEST_MISMATCH,
  );
  add(
    canonicalEntries.at(-1)?.sha256 !== EXPECTED_BASE_HEAD_CHECKSUM,
    F.CANONICAL_MANIFEST_MISMATCH,
  );
  add(
    !exactArray(candidateDirectories, EXPECTED_CANDIDATE_DIRECTORIES) ||
      candidateName !== IDENTITY_MAIL_TENANT_ENROLLMENT_FOUNDATION_CANDIDATE,
    F.CANDIDATE_HEAD_MISMATCH,
  );
  add(
    canonicalEntries.length + 1 !==
      IDENTITY_MAIL_TENANT_ENROLLMENT_FOUNDATION_CANDIDATE_ORDINAL,
    F.CANDIDATE_ORDINAL_MISMATCH,
  );
  let metadata = null;
  try {
    metadata = JSON.parse(metadataText);
  } catch {
    metadata = null;
  }
  const metadataKeys =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? Object.keys(metadata).sort()
      : [];
  const predecessorKeys =
    metadata?.predecessor &&
    typeof metadata.predecessor === "object" &&
    !Array.isArray(metadata.predecessor)
      ? Object.keys(metadata.predecessor).sort()
      : [];
  const expectedMetadataKeys = [
    "authorization",
    "canMutate",
    "candidate",
    "contract",
    "migrationSqlSha256",
    "ordinal",
    "predecessor",
    "schemaVersion",
    "status",
  ].sort();
  const expectedPredecessorKeys = [
    "count",
    "head",
    "headChecksum",
    "manifestDigest",
  ].sort();
  add(
    !exactArray(metadataKeys, expectedMetadataKeys) ||
      !exactArray(predecessorKeys, expectedPredecessorKeys) ||
      metadata?.schemaVersion !== 1 ||
      metadata?.contract !==
        "IDENTITY_MAIL_TENANT_ENROLLMENT_FOUNDATION_CANDIDATE_V1" ||
      metadata?.candidate !==
        IDENTITY_MAIL_TENANT_ENROLLMENT_FOUNDATION_CANDIDATE ||
      metadata?.ordinal !==
        IDENTITY_MAIL_TENANT_ENROLLMENT_FOUNDATION_CANDIDATE_ORDINAL ||
      metadata?.predecessor?.count !==
        IDENTITY_MAIL_TENANT_ENROLLMENT_FOUNDATION_BASE_COUNT ||
      metadata?.predecessor?.head !==
        IDENTITY_MAIL_TENANT_ENROLLMENT_FOUNDATION_BASE_HEAD ||
      metadata?.predecessor?.manifestDigest !==
        EXPECTED_BASE_MANIFEST_DIGEST ||
      metadata?.predecessor?.headChecksum !== EXPECTED_BASE_HEAD_CHECKSUM ||
      metadata?.migrationSqlSha256 !== EXPECTED_CANDIDATE_SHA256 ||
      metadata?.authorization !== false ||
      metadata?.canMutate !== false ||
      metadata?.status !== "DORMANT_SCHEMA_ONLY",
    F.CANDIDATE_METADATA_MISMATCH,
  );
  add(
    candidateDigest !== metadata?.migrationSqlSha256,
    F.CANDIDATE_DIGEST_MISMATCH,
  );

  add(contractDigest !== EXPECTED_CONTRACT_SHA256, F.LIVING_CONTRACT_DRIFT);
  add(sourceAuthorizes(contractSource), F.LIVING_CONTRACT_AUTHORIZES);
  add(preflightDigest !== EXPECTED_PREFLIGHT_SHA256, F.LIVING_PREFLIGHT_DRIFT);
  add(sourceAuthorizes(preflightSource), F.LIVING_PREFLIGHT_AUTHORIZES);

  const metadataFragments = [
    "completed_migration_count IS DISTINCT FROM 179",
    `'${IDENTITY_MAIL_TENANT_ENROLLMENT_FOUNDATION_BASE_HEAD}'`,
    `'${EXPECTED_BASE_MANIFEST_DIGEST}'`,
    `'${EXPECTED_BASE_HEAD_CHECKSUM}'`,
    `'${IDENTITY_MAIL_TENANT_ENROLLMENT_FOUNDATION_CANDIDATE}'`,
    "CURRENT_180 requires the exact completed CURRENT_179 migration set",
  ];
  add(
    metadataFragments.some((fragment) => !compact.includes(fragment)),
    F.CANDIDATE_METADATA_MISMATCH,
  );

  const prerequisiteStart = sql.indexOf("DO $prerequisite$");
  const prerequisiteEndMarker = "$prerequisite$;";
  const prerequisiteEnd = sql.indexOf(
    prerequisiteEndMarker,
    Math.max(0, prerequisiteStart + 1),
  );
  const firstDdl = /^(?:ALTER\s+TABLE|CREATE\s+TABLE|CREATE\s+(?:OR\s+REPLACE\s+)?(?:FUNCTION|PROCEDURE)|CREATE\s+(?:UNIQUE\s+)?INDEX|CREATE\s+TRIGGER|REVOKE|GRANT|COMMENT\s+ON)\b/imu.exec(
    sql,
  )?.index;
  add(
    prerequisiteStart < 0 ||
      prerequisiteEnd < prerequisiteStart ||
      typeof firstDdl !== "number" ||
      prerequisiteEnd + prerequisiteEndMarker.length > firstDdl ||
      collect(sql, /DO\s+\$prerequisite\$/giu, 0).length !== 1,
    F.PRECONDITION_ORDER_INVALID,
  );
  add(
    !/^\s*BEGIN;/iu.test(sql) || !/COMMIT;\s*$/iu.test(sql),
    F.TRANSACTION_ENVELOPE_INVALID,
  );

  const prerequisiteBlock =
    prerequisiteStart >= 0 && prerequisiteEnd > prerequisiteStart
      ? compactSql(
          sql.slice(
            prerequisiteStart,
            prerequisiteEnd + prerequisiteEndMarker.length,
          ),
        )
      : "";
  add(
    !/SELECT pg_catalog\.count\(\*\) INTO enrollment_count FROM public\."IdentityMailDeliveryTenantEnrollment";/iu.test(
      prerequisiteBlock,
    ) ||
      !/IF enrollment_count <> 0 OR claimed_outbox_count <> 0 THEN/iu.test(
        prerequisiteBlock,
      ) ||
      !prerequisiteBlock.includes(
        "CURRENT_180 requires an empty enrollment registry and zero CLAIMED mail outbox rows",
      ),
    F.EMPTY_REGISTRY_PRECONDITION_MISSING,
  );
  const rehearsalFenceFragments = [
    "'leetplus.identity_mail_tenant_enrollment_current180_confirmation'",
    "'leetplus.identity_mail_tenant_enrollment_current180_sha256'",
    "'^lp_imtec_[0-9a-f]{32}_ci$'",
    "'rehearse-dormant-identity-mail-tenant-enrollment-current180'",
    "candidate_receipt_count IS DISTINCT FROM 1",
    "candidate_receipt_checksum IS DISTINCT FROM rehearsal_candidate_sha256",
    "candidate_receipt_applied_steps IS DISTINCT FROM 0",
    "CURRENT_180 candidate is restricted to the confirmed disposable rehearsal boundary",
    "CURRENT_180 candidate requires one exact unfinished Prisma rehearsal receipt",
  ];
  add(
    rehearsalFenceFragments.some(
      (fragment) => !prerequisiteBlock.includes(fragment),
    ),
    F.REHEARSAL_EXECUTION_FENCE_MISSING,
  );
  const exactExecutionFence =
    "rehearsal_confirmation := pg_catalog.current_setting( " +
    "'leetplus.identity_mail_tenant_enrollment_current180_confirmation', " +
    "true ); rehearsal_candidate_sha256 := pg_catalog.current_setting( " +
    "'leetplus.identity_mail_tenant_enrollment_current180_sha256', true ); " +
    "IF pg_catalog.current_database() !~ '^lp_imtec_[0-9a-f]{32}_ci$' " +
    "OR rehearsal_confirmation IS DISTINCT FROM " +
    "'rehearse-dormant-identity-mail-tenant-enrollment-current180' " +
    "OR rehearsal_candidate_sha256 IS NULL OR " +
    "(rehearsal_candidate_sha256 COLLATE \"C\") !~ '^[0-9a-f]{64}$' " +
    "THEN RAISE EXCEPTION 'CURRENT_180 candidate is restricted to the " +
    "confirmed disposable rehearsal boundary' USING ERRCODE = '55000'; " +
    "END IF;";
  add(
    !prerequisiteBlock.includes(exactExecutionFence),
    F.CANDIDATE_EXECUTION_FENCE_MISSING,
  );
  const exactCandidateReceiptQuery =
    "SELECT pg_catalog.count(*)::INTEGER, " +
    "pg_catalog.min(migration.\"checksum\"), " +
    "pg_catalog.min(migration.\"applied_steps_count\") INTO " +
    "candidate_receipt_count, candidate_receipt_checksum, " +
    "candidate_receipt_applied_steps FROM public.\"_prisma_migrations\" " +
    "AS migration WHERE migration.\"migration_name\" = " +
    "'20260801010000_identity_mail_tenant_enrollment_control_plane' " +
    "AND migration.\"finished_at\" IS NULL AND " +
    "migration.\"rolled_back_at\" IS NULL;";
  const exactCandidateReceiptDecision =
    "IF candidate_receipt_count IS DISTINCT FROM 1 OR " +
    "candidate_receipt_checksum IS NULL OR " +
    "(candidate_receipt_checksum COLLATE \"C\") !~ '^[0-9a-f]{64}$' " +
    "OR candidate_receipt_checksum IS DISTINCT FROM " +
    "rehearsal_candidate_sha256 OR candidate_receipt_applied_steps IS " +
    "DISTINCT FROM 0 THEN RAISE EXCEPTION 'CURRENT_180 candidate requires " +
    "one exact unfinished Prisma rehearsal receipt' USING ERRCODE = " +
    "'55000'; END IF;";
  const exactOtherUnfinishedFence =
    "OR EXISTS ( SELECT 1 FROM public.\"_prisma_migrations\" AS migration " +
    "WHERE migration.\"finished_at\" IS NULL AND " +
    "migration.\"rolled_back_at\" IS NULL AND " +
    "migration.\"migration_name\" <> " +
    "'20260801010000_identity_mail_tenant_enrollment_control_plane' )";
  add(
    !prerequisiteBlock.includes(exactCandidateReceiptQuery) ||
      !prerequisiteBlock.includes(exactCandidateReceiptDecision) ||
      !prerequisiteBlock.includes(exactOtherUnfinishedFence),
    F.CANDIDATE_RECEIPT_FENCE_MISSING,
  );

  const createdTables = collect(
    sql,
    /^CREATE\s+TABLE\s+public\."([^"]+)"\s*\(/gimu,
  );
  add(!exactArray(createdTables, EXPECTED_CREATED_TABLES), F.CREATED_TABLE_SURFACE_DRIFT);
  add(
    !exactArray(
      createdTableColumns(
        sql,
        "IdentityMailDeliveryTenantEnrollmentCommand",
      ),
      EXPECTED_COMMAND_COLUMNS,
    ) ||
      !exactArray(
        createdTableColumns(
          sql,
          "IdentityMailDeliveryTenantEnrollmentEvent",
        ),
        EXPECTED_EVENT_COLUMNS,
      ),
    F.CREATED_COLUMN_SURFACE_DRIFT,
  );
  const addedColumns = collect(sql, /^\s*ADD\s+COLUMN\s+"([^"]+)"/gimu);
  add(!exactArray(addedColumns, EXPECTED_ADDED_COLUMNS), F.ADDED_COLUMN_SURFACE_DRIFT);
  const alteredTables = collect(
    sql,
    /^ALTER\s+TABLE\s+public\."([^"]+)"/gimu,
  );
  add(!exactArray(alteredTables, EXPECTED_ALTERED_TABLES), F.ALTERED_TABLE_SURFACE_DRIFT);
  const addedConstraints = collect(
    sql,
    /^\s*(?:ADD\s+)?CONSTRAINT\s+"([^"]+)"/gimu,
  );
  const droppedConstraints = collect(
    sql,
    /^\s*DROP\s+CONSTRAINT\s+"([^"]+)"/gimu,
  );
  add(
    !exactArray(addedConstraints, EXPECTED_ADDED_CONSTRAINTS) ||
      !exactArray(droppedConstraints, EXPECTED_DROPPED_CONSTRAINTS),
    F.CONSTRAINT_SURFACE_DRIFT,
  );
  const indexes = collect(
    sql,
    /^CREATE\s+(?:UNIQUE\s+)?INDEX\s+"([^"]+)"/gimu,
  );
  add(!exactArray(indexes, EXPECTED_INDEXES), F.INDEX_SURFACE_DRIFT);

  const functions = collect(
    sql,
    /\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\."([^"]+)"\s*\(/giu,
  );
  add(!exactArray(functions, EXPECTED_GUARD_FUNCTIONS), F.GUARD_FUNCTION_SURFACE_DRIFT);
  add(
    functions.some((name) => /(?:apply|resume|finalize|rollback)/iu.test(name)) ||
      /\bCREATE\s+(?:OR\s+REPLACE\s+)?PROCEDURE\b/iu.test(sql) ||
      /\bCALL\s+public\."[^"]*(?:apply|resume|finalize|rollback)[^"]*"/iu.test(
        sql,
      ),
    F.FORBIDDEN_COORDINATOR_ROUTINE,
  );

  const triggers = triggerBlocks(sql);
  add(
    !exactArray(
      triggers.map((trigger) => trigger.name),
      EXPECTED_TRIGGERS,
    ),
    F.TRIGGER_SURFACE_DRIFT,
  );
  add(
    triggers.length !== EXPECTED_TRIGGERS.length ||
      triggers.some(
        (trigger) =>
          !/FOR\s+EACH\s+STATEMENT/iu.test(trigger.body) ||
          /FOR\s+EACH\s+ROW/iu.test(trigger.body),
      ),
    F.DORMANT_GUARD_NOT_STATEMENT_LEVEL,
  );

  const normalizedRevokes = collect(
    compact,
    /REVOKE\s+ALL\s+PRIVILEGES\s+ON\s+(TABLE|FUNCTION)\s+public\."([^"]+)"\s*(?:\(\))?\s+FROM\s+PUBLIC;/giu,
    0,
  );
  const revokeTargets = [
    ...compact.matchAll(
      /REVOKE\s+ALL\s+PRIVILEGES\s+ON\s+(TABLE|FUNCTION)\s+public\."([^"]+)"\s*(?:\(\))?\s+FROM\s+PUBLIC;/giu,
    ),
  ].map((match) => `${match[1].toUpperCase()}:${match[2]}`);
  add(
    normalizedRevokes.length !== collect(compact, /\bREVOKE\b/giu, 0).length ||
      !exactArray(revokeTargets, EXPECTED_REVOKES) ||
      !compact.includes("unsafe_relation_acl_count <> 0") ||
      !compact.includes("unsafe_column_acl_count <> 0") ||
      !compact.includes("unsafe_function_acl_count <> 0") ||
      !compact.includes("pg_catalog.aclexplode"),
    F.ACL_SURFACE_DRIFT,
  );
  add(/\bGRANT\b/iu.test(sql), F.GRANT_PRESENT);

  const comments = [
    ...compact.matchAll(
      /COMMENT\s+ON\s+(TABLE|COLUMN)\s+public\."([^"]+)"(?:\."([^"]+)")?\s+IS\s+/giu,
    ),
  ].map(
    (match) =>
      `${match[1].toUpperCase()}:${match[2]}:${match[3] ?? ""}`,
  );
  add(!exactArray(comments, EXPECTED_COMMENTS), F.COMMENT_SURFACE_DRIFT);

  add(
    /\b(?:CREATE|ALTER|DROP)\s+(?:ROLE|SCHEMA|TYPE|EXTENSION|VIEW|MATERIALIZED\s+VIEW|SEQUENCE|POLICY)\b/iu.test(
      sql,
    ) ||
      /\bDROP\s+(?:TABLE|FUNCTION|PROCEDURE|INDEX|TRIGGER)\b/iu.test(sql) ||
      /\b(?:DROP|RENAME|ALTER)\s+COLUMN\b/iu.test(sql) ||
      /\bCREATE\s+OR\s+REPLACE\b/iu.test(sql),
    F.FORBIDDEN_DDL,
  );

  const sensitiveDmlRelations = [
    ...sql.matchAll(
      /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|MERGE\s+INTO|TRUNCATE(?:\s+TABLE)?)\s+(?:ONLY\s+)?public\."([^"]+)"/giu,
    ),
  ].map((match) => match[1]);
  add(
    sensitiveDmlRelations.some(
      (relation) =>
        relation === "Tenant" ||
        relation === "User" ||
        /(?:Invite|Outbox|SMTP)/iu.test(relation),
    ),
    F.FORBIDDEN_SENSITIVE_DML,
  );

  const payloadStart = compact.indexOf(
    'CONSTRAINT "identity_mail_tenant_enrollment_command_payload_check"',
  );
  const receiptStart = compact.indexOf(
    'CONSTRAINT "identity_mail_tenant_enrollment_command_receipt_check"',
  );
  const payloadBlock =
    payloadStart >= 0 && receiptStart > payloadStart
      ? compact.slice(payloadStart, receiptStart)
      : "";
  const authorizationEnvelopeStart = payloadBlock.indexOf(
    '"authorizationEnvelopeCanonicalJson"::JSONB',
  );
  const authorizationEnvelopeBlock =
    authorizationEnvelopeStart >= 0
      ? payloadBlock.slice(authorizationEnvelopeStart)
      : "";
  add(
    !authorizationEnvelopeBlock.includes(
      '"authorizationEnvelopeCanonicalJson"::JSONB = pg_catalog.jsonb_build_object(',
    ) ||
      !authorizationEnvelopeBlock.includes("'authorization', true") ||
      !authorizationEnvelopeBlock.includes("'canMutate', true") ||
      AUTHORIZATION_ENVELOPE_KEYS.some(
        (key) => !authorizationEnvelopeBlock.includes(`'${key}',`),
      ) ||
      !/"authorizationEnvelopeDigest"\s*=\s*pg_catalog\.encode\(\s*pg_catalog\.sha256\(\s*pg_catalog\.convert_to\(\s*"signatureDomain"::TEXT\s*\|\|\s*E'\\n'\s*\|\|\s*"authorizationEnvelopeCanonicalJson"\s*\|\|\s*E'\\n'/iu.test(
        authorizationEnvelopeBlock,
      ) ||
      !/UNIQUE\s*\(\s*"tenantId"\s*,\s*"id"\s*,\s*"authorizationEnvelopeDigest"\s*\)/iu.test(
        compact,
      ),
    F.AUTHORIZATION_ENVELOPE_BINDING_MISSING,
  );

  add(
    !/CONSTRAINT\s+"identity_mail_tenant_enrollment_event_previous_uidx"\s+UNIQUE\s+NULLS\s+NOT\s+DISTINCT\s*\(\s*"tenantId"\s*,\s*"previousEventDigest"\s*\)/iu.test(
      compact,
    ),
    F.EVENT_CHAIN_GUARD_MISSING,
  );
  add(
    !/FOREIGN\s+KEY\s*\(\s*"tenantId"\s*,\s*"commandId"\s*,\s*"commandContentDigest"\s*\)\s+REFERENCES\s+public\."IdentityMailDeliveryTenantEnrollmentCommand"\s*\(\s*"tenantId"\s*,\s*"id"\s*,\s*"authorizationEnvelopeDigest"\s*\)/iu.test(
      compact,
    ) ||
      /FOREIGN\s+KEY\s*\(\s*"tenantId"\s*,\s*"commandId"\s*,\s*"commandContentDigest"\s*\)[\s\S]*?"proposalContentDigest"/iu.test(
        compact,
      ),
    F.EVENT_AUTHORITY_BINDING_MISSING,
  );
  add(
    !/CONSTRAINT\s+"identity_mail_tenant_enrollment_command_drain_projection_key"\s+UNIQUE\s*\(\s*"tenantId"\s*,\s*"id"\s*,\s*"drainStateRevision"\s*\)/iu.test(
      compact,
    ),
    F.COMMAND_DRAIN_PROJECTION_MISSING,
  );
  add(
    !/CONSTRAINT\s+"identity_mail_tenant_enrollment_event_terminal_projection_key"\s+UNIQUE\s*\(\s*"tenantId"\s*,\s*"eventDigest"\s*,\s*"toState"\s*,\s*"toPolicyRevision"\s*,\s*"toStateRevision"\s*,\s*"toConfigurationDigest"\s*\)/iu.test(
      compact,
    ),
    F.EVENT_TERMINAL_PROJECTION_MISSING,
  );
  add(
    !/CONSTRAINT\s+"IdentityMailDeliveryTenantEnrollmentEvent_continuity_fkey"\s+FOREIGN\s+KEY\s*\(\s*"tenantId"\s*,\s*"previousEventDigest"\s*,\s*"fromState"\s*,\s*"fromPolicyRevision"\s*,\s*"fromStateRevision"\s*,\s*"fromConfigurationDigest"\s*\)\s+REFERENCES\s+public\."IdentityMailDeliveryTenantEnrollmentEvent"\s*\(\s*"tenantId"\s*,\s*"eventDigest"\s*,\s*"toState"\s*,\s*"toPolicyRevision"\s*,\s*"toStateRevision"\s*,\s*"toConfigurationDigest"\s*\)\s+ON\s+DELETE\s+RESTRICT\s+ON\s+UPDATE\s+RESTRICT\s+DEFERRABLE\s+INITIALLY\s+DEFERRED/iu.test(
      compact,
    ),
    F.EVENT_CONTINUITY_FK_MISSING,
  );
  add(
    !/CONSTRAINT\s+"IdentityMailDeliveryTenantEnrollment_activeCommand_fkey"\s+FOREIGN\s+KEY\s*\(\s*"tenantId"\s*,\s*"activeCommandId"\s*,\s*"stateRevision"\s*\)\s+REFERENCES\s+public\."IdentityMailDeliveryTenantEnrollmentCommand"\s*\(\s*"tenantId"\s*,\s*"id"\s*,\s*"drainStateRevision"\s*\)\s+ON\s+DELETE\s+RESTRICT\s+ON\s+UPDATE\s+RESTRICT\s+DEFERRABLE\s+INITIALLY\s+DEFERRED/iu.test(
      compact,
    ),
    F.ENROLLMENT_ACTIVE_COMMAND_DRAIN_FK_MISSING,
  );
  add(
    !/CONSTRAINT\s+"IdentityMailDeliveryTenantEnrollment_lastEvent_fkey"\s+FOREIGN\s+KEY\s*\(\s*"tenantId"\s*,\s*"lastEventDigest"\s*,\s*"state"\s*,\s*"policyRevision"\s*,\s*"stateRevision"\s*,\s*"currentConfigurationDigest"\s*\)\s+REFERENCES\s+public\."IdentityMailDeliveryTenantEnrollmentEvent"\s*\(\s*"tenantId"\s*,\s*"eventDigest"\s*,\s*"toState"\s*,\s*"toPolicyRevision"\s*,\s*"toStateRevision"\s*,\s*"toConfigurationDigest"\s*\)\s+ON\s+DELETE\s+RESTRICT\s+ON\s+UPDATE\s+RESTRICT\s+DEFERRABLE\s+INITIALLY\s+DEFERRED/iu.test(
      compact,
    ),
    F.ENROLLMENT_LAST_EVENT_PROJECTION_FK_MISSING,
  );
  add(
    !/ADD\s+COLUMN\s+"currentConfigurationDigest"\s+CHAR\(64\)\s+NOT\s+NULL/iu.test(
      compact,
    ) ||
      !compact.includes(
        '("currentConfigurationDigest" COLLATE "C") ~ \'^[0-9a-f]{64}$\'',
      ) ||
      !compact.includes(
        "'IdentityMailDeliveryTenantEnrollment', 'currentConfigurationDigest', 'character(64)', true",
      ),
    F.CURRENT_CONFIGURATION_DIGEST_MISSING,
  );

  const findings = [...findingSet].sort();
  return deepFreeze({
    schemaVersion:
      IDENTITY_MAIL_TENANT_ENROLLMENT_FOUNDATION_SCHEMA_VERSION,
    contract: IDENTITY_MAIL_TENANT_ENROLLMENT_FOUNDATION_CONTRACT,
    authorization: false,
    canMutate: false,
    decision: findings.length === 0 ? "COMPLIANT" : "BLOCKED",
    base: {
      count: canonicalEntries.length,
      head: canonicalNames.at(-1) ?? null,
      manifestDigest: baseManifestDigest,
    },
    candidate: {
      name: candidateName || null,
      ordinal: canonicalEntries.length + 1,
      sha256: candidateDigest,
    },
    livingSources: {
      contractSha256: contractDigest,
      preflightSha256: preflightDigest,
    },
    findings,
  });
}

export function assertIdentityMailTenantEnrollmentFoundation(artifact) {
  const report = evaluateIdentityMailTenantEnrollmentFoundation(artifact);
  if (report.decision !== "COMPLIANT") {
    throw new IdentityMailTenantEnrollmentFoundationError(report);
  }
  return report;
}

function cloneArtifact(artifact) {
  return structuredClone(artifact);
}

function expectProbe(artifact, mutate, expectedFinding) {
  const mutated = cloneArtifact(artifact);
  mutate(mutated);
  const report = evaluateIdentityMailTenantEnrollmentFoundation(mutated);
  if (
    report.decision !== "BLOCKED" ||
    !report.findings.includes(expectedFinding)
  ) {
    throw new Error(`Foundation self-test probe failed: ${expectedFinding}`);
  }
}

export function runIdentityMailTenantEnrollmentFoundationSelfTest(artifact) {
  const baseline = assertIdentityMailTenantEnrollmentFoundation(artifact);
  const F = IDENTITY_MAIL_TENANT_ENROLLMENT_FOUNDATION_FINDINGS;
  const probes = [
    [
      F.PRECONDITION_ORDER_INVALID,
      (value) => {
        value.candidate.sql = value.candidate.sql.replace(
          "DO $prerequisite$",
          'CREATE TABLE public."UnexpectedBeforePrecondition" ("id" TEXT);\nDO $prerequisite$',
        );
      },
    ],
    [
      F.EMPTY_REGISTRY_PRECONDITION_MISSING,
      (value) => {
        value.candidate.sql = value.candidate.sql.replace(
          "enrollment_count <> 0 OR claimed_outbox_count <> 0",
          "enrollment_count = -1 OR claimed_outbox_count <> 0",
        );
      },
    ],
    [
      F.REHEARSAL_EXECUTION_FENCE_MISSING,
      (value) => {
        value.candidate.sql = value.candidate.sql.replace(
          "rehearse-dormant-identity-mail-tenant-enrollment-current180",
          "rehearse-untrusted-current180",
        );
      },
    ],
    [
      F.CANDIDATE_EXECUTION_FENCE_MISSING,
      (value) => {
        value.candidate.sql = value.candidate.sql.replace(
          "^lp_imtec_[0-9a-f]{32}_ci$",
          "^lp_imtec_[0-9a-f]{31}_ci$",
        );
      },
    ],
    [
      F.CANDIDATE_RECEIPT_FENCE_MISSING,
      (value) => {
        value.candidate.sql = value.candidate.sql.replace(
          "candidate_receipt_count IS DISTINCT FROM 1",
          "candidate_receipt_count IS DISTINCT FROM 2",
        );
      },
    ],
    [
      F.COMMAND_DRAIN_PROJECTION_MISSING,
      (value) => {
        value.candidate.sql = value.candidate.sql.replace(
          'CONSTRAINT "identity_mail_tenant_enrollment_command_drain_projection_key"\n    UNIQUE ("tenantId", "id", "drainStateRevision")',
          'CONSTRAINT "identity_mail_tenant_enrollment_command_drain_projection_key"\n    UNIQUE ("tenantId", "id", "finalStateRevision")',
        );
      },
    ],
    [
      F.EVENT_TERMINAL_PROJECTION_MISSING,
      (value) => {
        value.candidate.sql = value.candidate.sql.replace(
          '      "toConfigurationDigest"\n    ),\n  CONSTRAINT "identity_mail_tenant_enrollment_event_command_sequence_uidx"',
          '      "commandContentDigest"\n    ),\n  CONSTRAINT "identity_mail_tenant_enrollment_event_command_sequence_uidx"',
        );
      },
    ],
    [
      F.EVENT_CONTINUITY_FK_MISSING,
      (value) => {
        value.candidate.sql = value.candidate.sql.replace(
          '    "fromConfigurationDigest"\n  )\n  REFERENCES public."IdentityMailDeliveryTenantEnrollmentEvent"',
          '    "toConfigurationDigest"\n  )\n  REFERENCES public."IdentityMailDeliveryTenantEnrollmentEvent"',
        );
      },
    ],
    [
      F.ENROLLMENT_ACTIVE_COMMAND_DRAIN_FK_MISSING,
      (value) => {
        value.candidate.sql = value.candidate.sql.replace(
          'FOREIGN KEY ("tenantId", "activeCommandId", "stateRevision")',
          'FOREIGN KEY ("tenantId", "activeCommandId", "policyRevision")',
        );
      },
    ],
    [
      F.ENROLLMENT_LAST_EVENT_PROJECTION_FK_MISSING,
      (value) => {
        value.candidate.sql = value.candidate.sql.replace(
          '    "currentConfigurationDigest"\n  )\n  REFERENCES public."IdentityMailDeliveryTenantEnrollmentEvent"',
          '    "lastEventDigest"\n  )\n  REFERENCES public."IdentityMailDeliveryTenantEnrollmentEvent"',
        );
      },
    ],
    [
      F.CURRENT_CONFIGURATION_DIGEST_MISSING,
      (value) => {
        value.candidate.sql = value.candidate.sql.replace(
          'ADD COLUMN "currentConfigurationDigest" CHAR(64) NOT NULL',
          'ADD COLUMN "currentConfigurationDigest" TEXT NOT NULL',
        );
      },
    ],
    [
      F.CREATED_TABLE_SURFACE_DRIFT,
      (value) => {
        value.candidate.sql = value.candidate.sql.replace(
          "COMMIT;",
          'CREATE TABLE public."UnexpectedFoundationTable" ("id" TEXT);\nCOMMIT;',
        );
      },
    ],
    [
      F.GRANT_PRESENT,
      (value) => {
        value.candidate.sql = value.candidate.sql.replace(
          "COMMIT;",
          'GRANT SELECT ON TABLE public."IdentityMailDeliveryTenantEnrollmentCommand" TO PUBLIC;\nCOMMIT;',
        );
      },
    ],
    [
      F.FORBIDDEN_COORDINATOR_ROUTINE,
      (value) => {
        value.candidate.sql = value.candidate.sql.replace(
          "COMMIT;",
          'CREATE FUNCTION public."identity_mail_tenant_enrollment_apply_v1"() RETURNS void LANGUAGE sql AS \'SELECT\';\nCOMMIT;',
        );
      },
    ],
    [
      F.FORBIDDEN_SENSITIVE_DML,
      (value) => {
        value.candidate.sql = value.candidate.sql.replace(
          "COMMIT;",
          'UPDATE public."Tenant" SET "id" = "id";\nCOMMIT;',
        );
      },
    ],
    [
      F.DORMANT_GUARD_NOT_STATEMENT_LEVEL,
      (value) => {
        value.candidate.sql = value.candidate.sql.replace(
          "FOR EACH STATEMENT",
          "FOR EACH ROW",
        );
      },
    ],
    [
      F.EVENT_CHAIN_GUARD_MISSING,
      (value) => {
        value.candidate.sql = value.candidate.sql.replace(
          "UNIQUE NULLS NOT DISTINCT",
          "UNIQUE",
        );
      },
    ],
    [
      F.AUTHORIZATION_ENVELOPE_BINDING_MISSING,
      (value) => {
        value.candidate.sql = value.candidate.sql.replace(
          "'actorDigest', \"actorDigest\"",
          "'actorDigestRemoved', \"actorDigest\"",
        );
      },
    ],
    [
      F.EVENT_AUTHORITY_BINDING_MISSING,
      (value) => {
        value.candidate.sql = value.candidate.sql.replace(
          '    "authorizationEnvelopeDigest"\n  )\n  ON DELETE RESTRICT',
          '    "proposalContentDigest"\n  )\n  ON DELETE RESTRICT',
        );
      },
    ],
    [
      F.LIVING_CONTRACT_DRIFT,
      (value) => {
        value.livingSources.contract += "\n";
      },
    ],
    [
      F.LIVING_PREFLIGHT_AUTHORIZES,
      (value) => {
        value.livingSources.preflight = value.livingSources.preflight.replace(
          "authorization: false",
          "authorization: true",
        );
      },
    ],
  ];

  for (const [finding, mutate] of probes) {
    expectProbe(artifact, mutate, finding);
  }
  return deepFreeze({
    schemaVersion:
      IDENTITY_MAIL_TENANT_ENROLLMENT_FOUNDATION_SCHEMA_VERSION,
    contract: IDENTITY_MAIL_TENANT_ENROLLMENT_FOUNDATION_CONTRACT,
    authorization: false,
    canMutate: false,
    decision: "SELF_TEST_PASSED",
    baselineSha256: baseline.candidate.sha256,
    probesPassed: probes.length,
  });
}

function helpText() {
  return `Identity mail tenant enrollment foundation static gate\n\nUsage:\n  node scripts/identity-mail-tenant-enrollment-foundation.mjs --check\n  node scripts/identity-mail-tenant-enrollment-foundation.mjs --self-test\n  node scripts/identity-mail-tenant-enrollment-foundation.mjs --help\n\nThe command is read-only, emits no authorization, and has no apply path.\n`;
}

async function main(argv) {
  if (argv.length === 1 && argv[0] === "--help") {
    process.stdout.write(helpText());
    return;
  }
  const mode = argv.length === 0 ? "--check" : argv[0];
  if (argv.length > 1 || !["--check", "--self-test"].includes(mode)) {
    process.stderr.write("Use --check, --self-test, or --help.\n");
    process.exitCode = 2;
    return;
  }

  try {
    const artifact =
      await loadIdentityMailTenantEnrollmentFoundationArtifact();
    const result =
      mode === "--self-test"
        ? runIdentityMailTenantEnrollmentFoundationSelfTest(artifact)
        : assertIdentityMailTenantEnrollmentFoundation(artifact);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    if (error instanceof IdentityMailTenantEnrollmentFoundationError) {
      process.stderr.write(`${JSON.stringify(error.report)}\n`);
      process.exitCode = error.exitCode;
      return;
    }
    process.stderr.write(
      '{"contract":"IDENTITY_MAIL_TENANT_ENROLLMENT_FOUNDATION_STATIC_V1","authorization":false,"canMutate":false,"decision":"BLOCKED","findings":["ARTIFACT_INVALID"]}\n',
    );
    process.exitCode = 1;
  }
}

const isMain =
  typeof process.argv[1] === "string" &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  await main(process.argv.slice(2));
}

import assert from "node:assert/strict";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PrismaClient } from "@prisma/client";

import {
  INVENTORY_SQL,
  parseBoundedInteger,
} from "./staff-task-integrity-inventory.mjs";
import {
  CATALOG_STATE_SQL,
  FINDING_MANIFEST,
  MIGRATION_STATE_SQL,
  SNAPSHOT_STATE_SQL,
  buildPlan,
  canonicalStringify,
  computeContentDigest as computePlannerContentDigest,
  computeDatabaseIdentityDigest,
  computeExecutionDigest as computePlannerExecutionDigest,
} from "./staff-task-integrity-reconciliation-plan.mjs";
import {
  APPLIED_MIGRATION_MANIFEST_SQL,
  EXPAND_STATE,
  PRIVILEGE_STATE_SQL,
  buildMigrationManifestState,
  exitCodeForAdmission,
  inspectDatabase as inspectAdmissionDatabase,
  loadExpectedMigrationManifest,
  parseRuntimeContract as parseAdmissionRuntimeContract,
  privilegeState,
} from "./staff-task-integrity-snapshot-admission.mjs";

export const SCRIPT_NAME =
  "staff-task-integrity-reconciliation-proposal-dry-run";
export const REPORT_SCHEMA_VERSION = 1;
export const RUN_CONFIRMATION =
  "run-staff-task-integrity-reconciliation-proposal-dry-run";
export const SYNTHETIC_PROVENANCE_PROFILE =
  "STAFF_TASK_INTEGRITY_DISPOSABLE_V1";
export const SYNTHETIC_PROVENANCE_MARKER_PREFIX =
  "LEETPLUS_SYNTHETIC_PROVENANCE_V1:";

const CLASSIFICATION = "SYNTHETIC";
const DEFAULT_STALE_STARTED_MINUTES = 60;
const DEFAULT_FAILED_WINDOW_DAYS = 14;
const DEFAULT_FAILED_THRESHOLD = 3;
const DEFAULT_MAX_CASES = 1_000;
const MAX_CASES = 10_000;
const MAX_HMAC_KEY_BYTES = 4_096;
export const MAX_RENDERED_REPORT_BYTES = 8 * 1024 * 1024;
const MAX_PROVENANCE_MANIFEST_BYTES = 8 * 1024;
const MAX_PROVENANCE_LIFETIME_MS = 2 * 60 * 60 * 1_000;
const MAX_PROVENANCE_CLOCK_SKEW_MS = 5 * 60 * 1_000;
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const HMAC_PATTERN = /^[0-9a-f]{64}$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/u;
const MUTATING_KEYWORD_PATTERN =
  /\b(?:INSERT|UPDATE|DELETE|MERGE|ALTER|CREATE|DROP|TRUNCATE|COPY|CALL|DO|GRANT|REVOKE|VACUUM|ANALYZE|REFRESH|REINDEX|CLUSTER|COMMENT|SECURITY\s+LABEL)\b/iu;
export const ADVISORY_LOCK_NAMESPACE = 1_911_005_401;
export const ADVISORY_LOCK_RESOURCE = 20_260_727;

export const PROPOSAL_ACTIONS = Object.freeze({
  TEMPLATE_CREATOR_CROSS_TENANT: Object.freeze({
    resourceType: "StaffTaskTemplate",
    targetColumn: "createdByUserId",
    operation: "REFERENCE_CLEAR_CANDIDATE",
  }),
  RULE_TEMPLATE_CROSS_TENANT: Object.freeze({
    resourceType: "StaffTaskRecurringRule",
    targetColumn: "templateId",
    operation: "REFERENCE_CLEAR_CANDIDATE",
  }),
  RULE_CREATOR_CROSS_TENANT: Object.freeze({
    resourceType: "StaffTaskRecurringRule",
    targetColumn: "createdByUserId",
    operation: "REFERENCE_CLEAR_CANDIDATE",
  }),
  RULE_LAST_TASK_CROSS_TENANT: Object.freeze({
    resourceType: "StaffTaskRecurringRule",
    targetColumn: "lastCreatedTaskId",
    operation: "REFERENCE_CLEAR_CANDIDATE",
  }),
  TASK_TEMPLATE_CROSS_TENANT: Object.freeze({
    resourceType: "StaffTask",
    targetColumn: "sourceTemplateId",
    operation: "REFERENCE_CLEAR_CANDIDATE",
  }),
  TASK_RULE_CROSS_TENANT: Object.freeze({
    resourceType: "StaffTask",
    targetColumn: "sourceRecurringRuleId",
    operation: "REFERENCE_CLEAR_CANDIDATE",
  }),
  TASK_CREATOR_CROSS_TENANT: Object.freeze({
    resourceType: "StaffTask",
    targetColumn: "createdByUserId",
    operation: "REFERENCE_CLEAR_CANDIDATE",
  }),
  RULE_LAST_TASK_SOURCE_MISMATCH: Object.freeze({
    resourceType: "StaffTaskRecurringRule",
    targetColumn: "lastCreatedTaskId",
    operation: "REFERENCE_CLEAR_CANDIDATE",
  }),
});

export const PROPOSAL_CODES = Object.freeze(
  Object.keys(PROPOSAL_ACTIONS).sort((left, right) =>
    left.localeCompare(right),
  ),
);

export const SYNTHETIC_FIXTURE_CONTRACT_DIGEST = createHash("sha256")
  .update(
    canonicalStringify({
      schemaVersion: 1,
      profile: SYNTHETIC_PROVENANCE_PROFILE,
      expectedState: EXPAND_STATE,
      proposalCodes: PROPOSAL_CODES,
    }),
    "utf8",
  )
  .digest("hex");

export const PROPOSAL_ROWS_SQL = `
WITH proposal_rows AS (
  SELECT
    'TEMPLATE_CREATOR_CROSS_TENANT'::text AS code,
    'StaffTaskTemplate'::text AS resource_type,
    template."id"::text AS resource_id,
    template."tenantId"::text AS tenant_id,
    'createdByUserId'::text AS target_column,
    template."createdByUserId"::text AS current_value,
    template."updatedAt" AS updated_at,
    creator."tenantId"::text AS related_tenant_id,
    NULL::text AS context_value
  FROM public."StaffTaskTemplate" AS template
  JOIN public."User" AS creator
    ON creator."id" = template."createdByUserId"
  WHERE creator."tenantId" <> template."tenantId"

  UNION ALL
  SELECT
    'RULE_TEMPLATE_CROSS_TENANT',
    'StaffTaskRecurringRule',
    rule."id"::text,
    rule."tenantId"::text,
    'templateId',
    rule."templateId"::text,
    rule."updatedAt",
    template."tenantId"::text,
    NULL::text
  FROM public."StaffTaskRecurringRule" AS rule
  JOIN public."StaffTaskTemplate" AS template
    ON template."id" = rule."templateId"
  WHERE template."tenantId" <> rule."tenantId"

  UNION ALL
  SELECT
    'RULE_CREATOR_CROSS_TENANT',
    'StaffTaskRecurringRule',
    rule."id"::text,
    rule."tenantId"::text,
    'createdByUserId',
    rule."createdByUserId"::text,
    rule."updatedAt",
    creator."tenantId"::text,
    NULL::text
  FROM public."StaffTaskRecurringRule" AS rule
  JOIN public."User" AS creator
    ON creator."id" = rule."createdByUserId"
  WHERE creator."tenantId" <> rule."tenantId"

  UNION ALL
  SELECT
    'RULE_LAST_TASK_CROSS_TENANT',
    'StaffTaskRecurringRule',
    rule."id"::text,
    rule."tenantId"::text,
    'lastCreatedTaskId',
    rule."lastCreatedTaskId"::text,
    rule."updatedAt",
    task."tenantId"::text,
    task."sourceRecurringRuleId"::text
  FROM public."StaffTaskRecurringRule" AS rule
  JOIN public."StaffTask" AS task
    ON task."id" = rule."lastCreatedTaskId"
  WHERE task."tenantId" <> rule."tenantId"

  UNION ALL
  SELECT
    'TASK_TEMPLATE_CROSS_TENANT',
    'StaffTask',
    task."id"::text,
    task."tenantId"::text,
    'sourceTemplateId',
    task."sourceTemplateId"::text,
    task."updatedAt",
    template."tenantId"::text,
    NULL::text
  FROM public."StaffTask" AS task
  JOIN public."StaffTaskTemplate" AS template
    ON template."id" = task."sourceTemplateId"
  WHERE template."tenantId" <> task."tenantId"

  UNION ALL
  SELECT
    'TASK_RULE_CROSS_TENANT',
    'StaffTask',
    task."id"::text,
    task."tenantId"::text,
    'sourceRecurringRuleId',
    task."sourceRecurringRuleId"::text,
    task."updatedAt",
    rule."tenantId"::text,
    NULL::text
  FROM public."StaffTask" AS task
  JOIN public."StaffTaskRecurringRule" AS rule
    ON rule."id" = task."sourceRecurringRuleId"
  WHERE rule."tenantId" <> task."tenantId"

  UNION ALL
  SELECT
    'TASK_CREATOR_CROSS_TENANT',
    'StaffTask',
    task."id"::text,
    task."tenantId"::text,
    'createdByUserId',
    task."createdByUserId"::text,
    task."updatedAt",
    creator."tenantId"::text,
    NULL::text
  FROM public."StaffTask" AS task
  JOIN public."User" AS creator
    ON creator."id" = task."createdByUserId"
  WHERE creator."tenantId" <> task."tenantId"

  UNION ALL
  SELECT
    'RULE_LAST_TASK_SOURCE_MISMATCH',
    'StaffTaskRecurringRule',
    rule."id"::text,
    rule."tenantId"::text,
    'lastCreatedTaskId',
    rule."lastCreatedTaskId"::text,
    rule."updatedAt",
    task."tenantId"::text,
    task."sourceRecurringRuleId"::text
  FROM public."StaffTaskRecurringRule" AS rule
  JOIN public."StaffTask" AS task
    ON task."id" = rule."lastCreatedTaskId"
  WHERE task."sourceRecurringRuleId" IS DISTINCT FROM rule."id"
)
SELECT
  code,
  resource_type,
  resource_id,
  tenant_id,
  target_column,
  current_value,
  updated_at,
  related_tenant_id,
  context_value
FROM proposal_rows
ORDER BY code, resource_type, resource_id, target_column
LIMIT $1::integer
`.trim();

export const RLS_STATE_SQL = `
WITH required_relation(name) AS (
  VALUES
    ('_prisma_migrations'::text),
    ('Tenant'::text),
    ('Store'::text),
    ('User'::text),
    ('UserStoreAccess'::text),
    ('StaffTaskTemplate'::text),
    ('StaffTaskRecurringRule'::text),
    ('StaffTaskRecurringRuleRun'::text),
    ('StaffTask'::text)
)
SELECT
  COUNT(*) FILTER (
    WHERE relation.oid IS NULL
  )::text AS missing_relation_count,
  COUNT(*) FILTER (
    WHERE relation.relrowsecurity OR relation.relforcerowsecurity
  )::text AS rls_enabled_relation_count
FROM required_relation
LEFT JOIN pg_catalog.pg_class AS relation
  ON relation.relnamespace = 'public'::regnamespace
 AND relation.relname = required_relation.name
 AND relation.relkind IN ('r', 'p')
`.trim();

export const SYNTHETIC_PROVENANCE_STATE_SQL = `
SELECT
  pg_catalog.shobj_description(
    database_row.oid,
    'pg_database'
  )::text AS database_comment,
  pg_catalog.clock_timestamp() AS verified_at
FROM pg_catalog.pg_database AS database_row
WHERE database_row.datname = pg_catalog.current_database()
`.trim();

export const RELATION_LOCK_ORDER = Object.freeze([
  "_prisma_migrations",
  "StaffTask",
  "StaffTaskRecurringRule",
  "StaffTaskRecurringRuleRun",
  "StaffTaskTemplate",
  "Store",
  "Tenant",
  "User",
  "UserStoreAccess",
]);

function qualifiedLockRelation(relation) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(relation)) {
    throw new Error("Unsafe frozen relation-lock identifier.");
  }
  return `public."${relation}"`;
}

const USER_LOCK_INDEX = RELATION_LOCK_ORDER.indexOf("User");

export const RELATION_LOCK_BEFORE_USER_SQL = `
LOCK TABLE
  ${RELATION_LOCK_ORDER.slice(0, USER_LOCK_INDEX)
    .map(qualifiedLockRelation)
    .join(",\n  ")}
IN ACCESS SHARE MODE
`.trim();

export const USER_RELATION_ACCESS_SHARE_SQL = `
SELECT "id"
FROM ONLY public."User"
WHERE false
`.trim();

export const RELATION_LOCK_AFTER_USER_SQL = `
LOCK TABLE ${RELATION_LOCK_ORDER.slice(USER_LOCK_INDEX + 1)
  .map(qualifiedLockRelation)
  .join(",\n  ")}
IN ACCESS SHARE MODE
`.trim();

export const HELP = `
${SCRIPT_NAME}

Synthetic-only, guarded row-level dry-run for the eight StaffTask integrity
proposal codes. The command first re-runs exact EXPAND_162 snapshot admission,
then reads one additional REPEATABLE READ snapshot and emits HMAC-pseudonymous
reference-clear suggestions. It never applies, authorizes, or exports raw
identifiers.

Usage:
  node scripts/${SCRIPT_NAME}.mjs [--pretty]
  node scripts/${SCRIPT_NAME}.mjs --self-test
  node scripts/${SCRIPT_NAME}.mjs --help

Required dry-run environment:
  STAFF_TASK_INTEGRITY_RECONCILIATION_DRY_RUN_CONFIRM
    ${RUN_CONFIRMATION}
  STAFF_TASK_INTEGRITY_RECONCILIATION_DRY_RUN_HMAC_KEY
    32..4096 UTF-8 bytes and different from the admission HMAC key.
  STAFF_TASK_INTEGRITY_RECONCILIATION_DRY_RUN_PROVENANCE_HMAC_KEY
    Harness-owned 32..4096 UTF-8 byte key, distinct from both report keys.
  STAFF_TASK_INTEGRITY_RECONCILIATION_DRY_RUN_PROVENANCE_MANIFEST
    Canonical base64url signed disposable-fixture manifest bound to this
    database identity, release SHA, creation nonce, fixture profile, and TTL.

Optional:
  STAFF_TASK_INTEGRITY_RECONCILIATION_DRY_RUN_MAX_CASES
    1..${MAX_CASES} (default ${DEFAULT_MAX_CASES})
  STAFF_TASK_INTEGRITY_STALE_STARTED_MINUTES
  STAFF_TASK_INTEGRITY_FAILED_WINDOW_DAYS
  STAFF_TASK_INTEGRITY_FAILED_THRESHOLD

The full snapshot admission environment is also required. It must declare:
  CLASSIFICATION=SYNTHETIC
  EXPECTED_STATE=EXPAND_162
  loopback PostgreSQL 16
  exact clean RELEASE_SHA
  exact least-privilege role with eight table grants and five User columns
  exact harness-created database comment carrying the signed creation nonce

Exit codes:
  0  Dry-run completed without blocking operator/proposal findings.
  1  CLI, runtime, query, evidence, or internal report-integrity failure.
  2  Blocking findings exist; pseudonymous proposals may be present.
  3  Admission, schema, privilege, identity, catalog, or case-cap gate rejected.

Safety:
  - PRODUCTION_LIKE, production process, and remote targets are prohibited.
  - Arbitrary standalone databases and caller-supplied URL options are rejected.
  - Unknown arguments, including --apply, are rejected.
  - Every suggestion is a review-required nullable-reference clear candidate.
  - 29 operator and 6 review codes never become row-level proposals.
  - Case tokens and precondition digests are evidence only, never CAS or apply
    authorization.
  - Raw database, tenant, store, user, template, rule, task, and run identities
    never appear in the report.
`.trim();

function contractError(code, message, exitCode = 1) {
  const error = new Error(message);
  error.code = code;
  error.exitCode = exitCode;
  error.safeContractError = true;
  throw error;
}

function safeHmacEqual(left, right) {
  if (!HMAC_PATTERN.test(String(left)) || !HMAC_PATTERN.test(String(right))) {
    return false;
  }
  return timingSafeEqual(
    Buffer.from(String(left), "hex"),
    Buffer.from(String(right), "hex"),
  );
}

function computeHmac(domain, value, hmacKey) {
  return createHmac("sha256", Buffer.from(hmacKey, "utf8"))
    .update(`${domain}\0`, "utf8")
    .update(canonicalStringify(value), "utf8")
    .digest("hex");
}

function normalizeHmacKey(value, code, label) {
  const key = String(value ?? "");
  const keyBytes = Buffer.byteLength(key, "utf8");
  if (keyBytes < 32 || keyBytes > MAX_HMAC_KEY_BYTES) {
    contractError(code, `${label} must satisfy the byte-length contract.`, 3);
  }
  return key;
}

function normalizeCanonicalTimestamp(value, code, label) {
  const raw = String(value ?? "");
  const parsed = new Date(raw);
  if (!raw || Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== raw) {
    contractError(code, `${label} must be a canonical ISO-8601 timestamp.`, 3);
  }
  return parsed;
}

function validateProvenanceTimeline(manifest, now) {
  const createdAt = normalizeCanonicalTimestamp(
    manifest.createdAt,
    "SYNTHETIC_PROVENANCE_CREATED_AT_INVALID",
    "Synthetic provenance creation time",
  );
  const expiresAt = normalizeCanonicalTimestamp(
    manifest.expiresAt,
    "SYNTHETIC_PROVENANCE_EXPIRES_AT_INVALID",
    "Synthetic provenance expiry",
  );
  const currentTime =
    now instanceof Date ? new Date(now.valueOf()) : new Date(String(now));
  if (Number.isNaN(currentTime.valueOf())) {
    contractError(
      "SYNTHETIC_PROVENANCE_CURRENT_TIME_INVALID",
      "Synthetic provenance verification time is invalid.",
      3,
    );
  }
  if (
    createdAt.valueOf() >
      currentTime.valueOf() + MAX_PROVENANCE_CLOCK_SKEW_MS ||
    expiresAt.valueOf() <= currentTime.valueOf() ||
    expiresAt.valueOf() <= createdAt.valueOf() ||
    expiresAt.valueOf() - createdAt.valueOf() > MAX_PROVENANCE_LIFETIME_MS
  ) {
    contractError(
      "SYNTHETIC_PROVENANCE_TIMELINE_INVALID",
      "Synthetic provenance is expired or exceeds its bounded lifetime.",
      3,
    );
  }
}

function stableSyntheticProvenanceManifest(manifest) {
  return {
    schemaVersion: manifest.schemaVersion,
    profile: manifest.profile,
    releaseSha: manifest.releaseSha,
    expectedState: manifest.expectedState,
    databaseIdentityDigest: manifest.databaseIdentityDigest,
    creationNonce: manifest.creationNonce,
    createdAt: manifest.createdAt,
    expiresAt: manifest.expiresAt,
    fixtureContractDigest: manifest.fixtureContractDigest,
  };
}

export function buildSyntheticProvenanceManifest(
  { releaseSha, databaseIdentityDigest, creationNonce, createdAt, expiresAt },
  hmacKey,
) {
  const normalizedKey = normalizeHmacKey(
    hmacKey,
    "SYNTHETIC_PROVENANCE_HMAC_KEY_INVALID",
    "Synthetic provenance HMAC key",
  );
  const stable = {
    schemaVersion: 1,
    profile: SYNTHETIC_PROVENANCE_PROFILE,
    releaseSha: String(releaseSha ?? ""),
    expectedState: EXPAND_STATE,
    databaseIdentityDigest: String(databaseIdentityDigest ?? ""),
    creationNonce: String(creationNonce ?? ""),
    createdAt: String(createdAt ?? ""),
    expiresAt: String(expiresAt ?? ""),
    fixtureContractDigest: SYNTHETIC_FIXTURE_CONTRACT_DIGEST,
  };
  if (
    !SHA_PATTERN.test(stable.releaseSha) ||
    !HMAC_PATTERN.test(stable.databaseIdentityDigest) ||
    !HMAC_PATTERN.test(stable.creationNonce)
  ) {
    contractError(
      "SYNTHETIC_PROVENANCE_BINDING_INVALID",
      "Synthetic provenance requires exact release, database, and nonce bindings.",
      3,
    );
  }
  validateProvenanceTimeline(stable, new Date(stable.createdAt));
  return {
    ...stable,
    signature: computeHmac(
      "staff-task-integrity-synthetic-provenance-v1",
      stable,
      normalizedKey,
    ),
  };
}

export function encodeSyntheticProvenanceManifest(manifest) {
  return Buffer.from(canonicalStringify(manifest), "utf8").toString(
    "base64url",
  );
}

export function syntheticProvenanceDatabaseMarker(creationNonce) {
  if (!HMAC_PATTERN.test(String(creationNonce ?? ""))) {
    contractError(
      "SYNTHETIC_PROVENANCE_NONCE_INVALID",
      "Synthetic provenance requires a 32-byte lowercase hexadecimal nonce.",
      3,
    );
  }
  return `${SYNTHETIC_PROVENANCE_MARKER_PREFIX}${creationNonce}`;
}

export function parseSyntheticProvenanceManifest(
  encodedManifest,
  hmacKey,
  { releaseSha, now = new Date() },
) {
  const normalizedKey = normalizeHmacKey(
    hmacKey,
    "SYNTHETIC_PROVENANCE_HMAC_KEY_INVALID",
    "Synthetic provenance HMAC key",
  );
  const encoded = String(encodedManifest ?? "");
  if (
    !encoded ||
    !/^[A-Za-z0-9_-]+$/u.test(encoded) ||
    encoded.length > Math.ceil((MAX_PROVENANCE_MANIFEST_BYTES * 4) / 3) + 4
  ) {
    contractError(
      "SYNTHETIC_PROVENANCE_MANIFEST_INVALID",
      "Synthetic provenance manifest encoding is invalid.",
      3,
    );
  }
  let decoded;
  let manifest;
  try {
    decoded = Buffer.from(encoded, "base64url");
    if (
      decoded.length > MAX_PROVENANCE_MANIFEST_BYTES ||
      decoded.toString("base64url") !== encoded
    ) {
      throw new Error("Non-canonical provenance encoding.");
    }
    manifest = JSON.parse(decoded.toString("utf8"));
  } catch {
    contractError(
      "SYNTHETIC_PROVENANCE_MANIFEST_INVALID",
      "Synthetic provenance manifest could not be decoded.",
      3,
    );
  }
  const expectedKeys = [
    "createdAt",
    "creationNonce",
    "databaseIdentityDigest",
    "expectedState",
    "expiresAt",
    "fixtureContractDigest",
    "profile",
    "releaseSha",
    "schemaVersion",
    "signature",
  ];
  if (
    !manifest ||
    Array.isArray(manifest) ||
    typeof manifest !== "object" ||
    Object.keys(manifest).length !== expectedKeys.length ||
    Object.keys(manifest)
      .sort((left, right) => left.localeCompare(right))
      .some((key, index) => key !== expectedKeys[index])
  ) {
    contractError(
      "SYNTHETIC_PROVENANCE_MANIFEST_INVALID",
      "Synthetic provenance manifest shape is invalid.",
      3,
    );
  }
  const stable = stableSyntheticProvenanceManifest(manifest);
  const expectedSignature = computeHmac(
    "staff-task-integrity-synthetic-provenance-v1",
    stable,
    normalizedKey,
  );
  if (
    manifest.schemaVersion !== 1 ||
    manifest.profile !== SYNTHETIC_PROVENANCE_PROFILE ||
    manifest.expectedState !== EXPAND_STATE ||
    manifest.releaseSha !== releaseSha ||
    manifest.fixtureContractDigest !== SYNTHETIC_FIXTURE_CONTRACT_DIGEST ||
    !HMAC_PATTERN.test(String(manifest.databaseIdentityDigest ?? "")) ||
    !HMAC_PATTERN.test(String(manifest.creationNonce ?? "")) ||
    !safeHmacEqual(expectedSignature, manifest.signature)
  ) {
    contractError(
      "SYNTHETIC_PROVENANCE_BINDING_INVALID",
      "Synthetic provenance manifest failed its signed binding contract.",
      3,
    );
  }
  validateProvenanceTimeline(manifest, now);
  return { ...stable, signature: manifest.signature };
}

export function verifySyntheticProvenanceSnapshot({
  provenance,
  provenanceHmacKey,
  snapshotRow,
  provenanceRow,
  now,
}) {
  const verifiedAt =
    now ??
    provenanceRow?.verified_at ??
    provenanceRow?.verifiedAt ??
    new Date();
  validateProvenanceTimeline(provenance, verifiedAt);
  const expectedDatabaseIdentityDigest = computeDatabaseIdentityDigest(
    snapshotRow,
    provenanceHmacKey,
  );
  const marker = String(
    provenanceRow?.database_comment ?? provenanceRow?.databaseComment ?? "",
  );
  if (
    !safeHmacEqual(
      expectedDatabaseIdentityDigest,
      provenance.databaseIdentityDigest,
    ) ||
    marker !== syntheticProvenanceDatabaseMarker(provenance.creationNonce)
  ) {
    contractError(
      "SYNTHETIC_PROVENANCE_DATABASE_REJECTED",
      "The database is not the signed disposable synthetic fixture.",
      3,
    );
  }
  return {
    ready: true,
    bindingDigest: computeHmac(
      "staff-task-integrity-synthetic-provenance-binding-v1",
      stableSyntheticProvenanceManifest(provenance),
      provenanceHmacKey,
    ),
  };
}

function normalizeTimestamp(value, code = "DATABASE_TIMESTAMP_INVALID") {
  const parsed = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(parsed.valueOf())) {
    contractError(code, "The database returned an invalid timestamp.");
  }
  return parsed.toISOString();
}

function normalizeOpaqueValue(value, label) {
  const normalized = String(value ?? "");
  const byteLength = Buffer.byteLength(normalized, "utf8");
  if (
    byteLength < 1 ||
    byteLength > 512 ||
    CONTROL_CHARACTER_PATTERN.test(normalized)
  ) {
    contractError(
      "DATABASE_PROPOSAL_ROW_INVALID",
      `The database returned an invalid ${label}.`,
    );
  }
  return normalized;
}

function normalizeGateCount(value, code) {
  const serialized = String(value ?? "");
  if (!/^\d+$/u.test(serialized)) {
    contractError(code, "The database returned an invalid gate count.", 3);
  }
  const parsed = Number.parseInt(serialized, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    contractError(code, "The database returned an invalid gate count.", 3);
  }
  return parsed;
}

function buildDryRunDatabaseUrl(rawDatabaseUrl, config) {
  const parsed = new URL(rawDatabaseUrl);
  parsed.searchParams.set("schema", "public");
  parsed.searchParams.set("connection_limit", "1");
  parsed.searchParams.set(
    "application_name",
    "leetplus_staff_task_reconciliation_proposal_dry_run",
  );
  parsed.searchParams.set(
    "options",
    [
      "-c default_transaction_read_only=on",
      `-c lock_timeout=${config.admission.lockTimeoutMs}`,
      `-c statement_timeout=${config.admission.statementTimeoutMs}`,
      `-c idle_in_transaction_session_timeout=${config.admission.transactionTimeoutMs}`,
    ]
      .filter(Boolean)
      .join(" "),
  );
  return parsed.toString();
}

function assertDryRunDatabaseUrlContract(rawDatabaseUrl) {
  let parsed;
  try {
    parsed = new URL(String(rawDatabaseUrl ?? ""));
  } catch {
    contractError(
      "DRY_RUN_DATABASE_URL_INVALID",
      "Proposal dry-run requires a valid PostgreSQL URL.",
      3,
    );
  }
  const parameters = [...parsed.searchParams.keys()];
  if (
    parameters.some((parameter) => parameter !== "schema") ||
    parsed.searchParams.getAll("schema").length > 1 ||
    (parsed.searchParams.has("schema") &&
      parsed.searchParams.get("schema") !== "public")
  ) {
    contractError(
      "DRY_RUN_DATABASE_URL_OPTIONS_PROHIBITED",
      "Proposal dry-run rejects caller-supplied connection options.",
      3,
    );
  }
}

export function parseArguments(argv) {
  let help = false;
  let selfTest = false;
  let pretty = false;
  const seen = new Set();
  for (const argument of argv) {
    if (seen.has(argument)) {
      contractError(
        "CLI_ARGUMENT_DUPLICATE",
        "A command-line argument was provided more than once.",
      );
    }
    seen.add(argument);
    if (argument === "--help") {
      help = true;
      continue;
    }
    if (argument === "--self-test") {
      selfTest = true;
      continue;
    }
    if (argument === "--pretty") {
      pretty = true;
      continue;
    }
    contractError(
      "CLI_ARGUMENT_UNSUPPORTED",
      "An unsupported command-line argument was provided.",
    );
  }
  if (help && argv.length !== 1) {
    contractError(
      "CLI_ARGUMENT_CONFLICT",
      "--help must be used without other command-line arguments.",
    );
  }
  return { help, selfTest, pretty };
}

export function parseRuntimeContract(environment, now = new Date()) {
  assertDryRunDatabaseUrlContract(environment.DATABASE_URL);
  const admission = parseAdmissionRuntimeContract(environment, now);
  if (
    admission.classification !== CLASSIFICATION ||
    admission.expectedState !== EXPAND_STATE
  ) {
    contractError(
      "SYNTHETIC_EXPAND_ADMISSION_REQUIRED",
      "Proposal dry-run requires SYNTHETIC EXPAND_162 admission.",
      3,
    );
  }
  if (
    environment.STAFF_TASK_INTEGRITY_RECONCILIATION_DRY_RUN_CONFIRM !==
    RUN_CONFIRMATION
  ) {
    contractError(
      "DRY_RUN_CONFIRMATION_REQUIRED",
      "The exact proposal dry-run confirmation is required.",
    );
  }

  const hmacKey = normalizeHmacKey(
    environment.STAFF_TASK_INTEGRITY_RECONCILIATION_DRY_RUN_HMAC_KEY,
    "DRY_RUN_HMAC_KEY_INVALID",
    "Proposal dry-run HMAC key",
  );
  if (hmacKey === admission.hmacKey) {
    contractError(
      "HMAC_KEY_SEPARATION_REQUIRED",
      "Admission and proposal dry-run HMAC keys must be different.",
    );
  }
  const provenanceHmacKey = normalizeHmacKey(
    environment.STAFF_TASK_INTEGRITY_RECONCILIATION_DRY_RUN_PROVENANCE_HMAC_KEY,
    "SYNTHETIC_PROVENANCE_HMAC_KEY_INVALID",
    "Synthetic provenance HMAC key",
  );
  if (
    provenanceHmacKey === admission.hmacKey ||
    provenanceHmacKey === hmacKey
  ) {
    contractError(
      "HMAC_KEY_SEPARATION_REQUIRED",
      "Admission, proposal, and provenance HMAC keys must be distinct.",
      3,
    );
  }
  const provenance = parseSyntheticProvenanceManifest(
    environment.STAFF_TASK_INTEGRITY_RECONCILIATION_DRY_RUN_PROVENANCE_MANIFEST,
    provenanceHmacKey,
    { releaseSha: admission.releaseSha, now },
  );

  const maxCases = parseBoundedInteger(
    environment.STAFF_TASK_INTEGRITY_RECONCILIATION_DRY_RUN_MAX_CASES,
    {
      code: "MAX_CASES_INVALID",
      label: "STAFF_TASK_INTEGRITY_RECONCILIATION_DRY_RUN_MAX_CASES",
      minimum: 1,
      maximum: MAX_CASES,
      fallback: DEFAULT_MAX_CASES,
    },
  );
  const staleStartedMinutes = parseBoundedInteger(
    environment.STAFF_TASK_INTEGRITY_STALE_STARTED_MINUTES,
    {
      code: "STALE_STARTED_MINUTES_INVALID",
      label: "STAFF_TASK_INTEGRITY_STALE_STARTED_MINUTES",
      minimum: 5,
      maximum: 10_080,
      fallback: DEFAULT_STALE_STARTED_MINUTES,
    },
  );
  const failedWindowDays = parseBoundedInteger(
    environment.STAFF_TASK_INTEGRITY_FAILED_WINDOW_DAYS,
    {
      code: "FAILED_WINDOW_DAYS_INVALID",
      label: "STAFF_TASK_INTEGRITY_FAILED_WINDOW_DAYS",
      minimum: 1,
      maximum: 365,
      fallback: DEFAULT_FAILED_WINDOW_DAYS,
    },
  );
  const failedThreshold = parseBoundedInteger(
    environment.STAFF_TASK_INTEGRITY_FAILED_THRESHOLD,
    {
      code: "FAILED_THRESHOLD_INVALID",
      label: "STAFF_TASK_INTEGRITY_FAILED_THRESHOLD",
      minimum: 2,
      maximum: 1_000,
      fallback: DEFAULT_FAILED_THRESHOLD,
    },
  );

  return {
    admission,
    hmacKey,
    provenanceHmacKey,
    provenance,
    maxCases,
    staleStartedMinutes,
    failedWindowDays,
    failedThreshold,
  };
}

function plannerConfig(config) {
  return {
    target: "development",
    productionAttested: false,
    releaseSha: config.admission.releaseSha,
    hmacKey: config.hmacKey,
    expectedDatabaseName: config.admission.expectedDatabaseName,
    staleStartedMinutes: config.staleStartedMinutes,
    failedWindowDays: config.failedWindowDays,
    failedThreshold: config.failedThreshold,
    lockTimeoutMs: config.admission.lockTimeoutMs,
    statementTimeoutMs: config.admission.statementTimeoutMs,
    transactionTimeoutMs: config.admission.transactionTimeoutMs,
    maxCandidates: config.maxCases,
  };
}

function proposalManifest() {
  return FINDING_MANIFEST.filter(
    (finding) => finding.classification === "proposal",
  )
    .map(({ code, severity, classification }) => ({
      code,
      severity,
      classification,
    }))
    .sort((left, right) => left.code.localeCompare(right.code));
}

function normalizeProposalRows(rows, plan) {
  if (!Array.isArray(rows)) {
    contractError(
      "DATABASE_PROPOSAL_ROWS_INVALID",
      "The database did not return proposal rows.",
    );
  }
  const counts = Object.fromEntries(PROPOSAL_CODES.map((code) => [code, 0]));
  const normalized = rows.map((row) => {
    const code = String(row?.code ?? "");
    const action = PROPOSAL_ACTIONS[code];
    if (!action) {
      contractError(
        "DATABASE_PROPOSAL_CODE_INVALID",
        "The database returned an unknown proposal code.",
      );
    }
    const resourceType = String(row?.resource_type ?? "");
    const targetColumn = String(row?.target_column ?? "");
    if (
      resourceType !== action.resourceType ||
      targetColumn !== action.targetColumn
    ) {
      contractError(
        "DATABASE_PROPOSAL_TARGET_INVALID",
        "The database returned an unexpected proposal target.",
      );
    }
    counts[code] += 1;
    return {
      code,
      resourceType,
      resourceId: normalizeOpaqueValue(row?.resource_id, "resource identity"),
      tenantId: normalizeOpaqueValue(row?.tenant_id, "tenant identity"),
      targetColumn,
      currentValue: normalizeOpaqueValue(
        row?.current_value,
        "current reference",
      ),
      updatedAt: normalizeTimestamp(row?.updated_at),
      relatedTenantId: normalizeOpaqueValue(
        row?.related_tenant_id,
        "related tenant identity",
      ),
      contextValue:
        row?.context_value === null || row?.context_value === undefined
          ? null
          : normalizeOpaqueValue(row.context_value, "proposal context"),
      operation: action.operation,
    };
  });

  const findingCounts = new Map(
    plan.findings
      .filter((finding) => finding.classification === "proposal")
      .map((finding) => [finding.code, finding.count]),
  );
  for (const code of PROPOSAL_CODES) {
    if (counts[code] !== findingCounts.get(code)) {
      contractError(
        "PROPOSAL_COUNT_MISMATCH",
        "Row-level proposal counts do not match aggregate inventory.",
        3,
      );
    }
  }
  return normalized;
}

export function buildProposalCases({
  rows,
  plan,
  config,
  databaseIdentityDigest,
  executionNonce = plan?.generatedAt,
}) {
  const normalizedExecutionNonce = normalizeTimestamp(
    executionNonce,
    "PROPOSAL_EXECUTION_NONCE_INVALID",
  );
  const normalizedRows = normalizeProposalRows(rows, plan);
  const groups = new Map();
  for (const row of normalizedRows) {
    const groupKey = canonicalStringify([
      row.resourceType,
      row.resourceId,
      row.targetColumn,
    ]);
    const existing = groups.get(groupKey);
    if (!existing) {
      groups.set(groupKey, {
        resourceType: row.resourceType,
        resourceId: row.resourceId,
        tenantId: row.tenantId,
        targetColumn: row.targetColumn,
        currentValue: row.currentValue,
        updatedAt: row.updatedAt,
        operation: row.operation,
        reasonCodes: new Set([row.code]),
        relatedTenantIds: new Set([row.relatedTenantId]),
        contextValues: new Set(
          row.contextValue === null ? [] : [row.contextValue],
        ),
      });
      continue;
    }
    if (
      existing.tenantId !== row.tenantId ||
      existing.currentValue !== row.currentValue ||
      existing.updatedAt !== row.updatedAt ||
      existing.operation !== row.operation
    ) {
      contractError(
        "PROPOSAL_DEDUPLICATION_CONFLICT",
        "Duplicate proposal rows disagree on their target precondition.",
        3,
      );
    }
    existing.reasonCodes.add(row.code);
    existing.relatedTenantIds.add(row.relatedTenantId);
    if (row.contextValue !== null) {
      existing.contextValues.add(row.contextValue);
    }
  }

  return [...groups.values()]
    .map((group) => {
      const reasonCodes = [...group.reasonCodes].sort((left, right) =>
        left.localeCompare(right),
      );
      const tokenInput = {
        releaseSha: config.admission.releaseSha,
        databaseIdentityDigest,
        executionNonce: normalizedExecutionNonce,
        resourceType: group.resourceType,
        resourceId: group.resourceId,
        targetColumn: group.targetColumn,
      };
      const preconditionInput = {
        ...tokenInput,
        tenantId: group.tenantId,
        currentValue: group.currentValue,
        updatedAt: group.updatedAt,
        operation: group.operation,
        reasonCodes,
        relatedTenantIds: [...group.relatedTenantIds].sort(),
        contextValues: [...group.contextValues].sort(),
      };
      return {
        caseToken: computeHmac(
          "staff-task-reconciliation-proposal-case-v1",
          tokenInput,
          config.hmacKey,
        ),
        preconditionDigest: computeHmac(
          "staff-task-reconciliation-proposal-precondition-v1",
          preconditionInput,
          config.hmacKey,
        ),
        target: {
          resourceType: group.resourceType,
          column: group.targetColumn,
        },
        suggestion: {
          kind: group.operation,
          reasonCodes,
          ownerApprovalRequired: true,
          fullInvariantRecheckRequired: true,
        },
      };
    })
    .sort((left, right) => left.caseToken.localeCompare(right.caseToken));
}

function validateAdmissionBinding(
  admissionReport,
  config,
  verificationTime = new Date(),
) {
  if (
    admissionReport?.summary?.decision !== "ADMITTED" ||
    admissionReport?.classification !== CLASSIFICATION ||
    admissionReport?.expectedState !== EXPAND_STATE ||
    admissionReport?.releaseSha !== config.admission.releaseSha ||
    !HMAC_PATTERN.test(String(admissionReport?.databaseIdentityDigest ?? "")) ||
    !HMAC_PATTERN.test(String(admissionReport?.contentDigest ?? "")) ||
    !HMAC_PATTERN.test(String(admissionReport?.executionDigest ?? "")) ||
    exitCodeForAdmission(
      admissionReport,
      config.admission.hmacKey,
      verificationTime,
    ) !== 0
  ) {
    contractError(
      "ADMISSION_BINDING_INVALID",
      "The prerequisite admission report failed its binding contract.",
      3,
    );
  }
}

function validatePlannerBinding(plan, config) {
  const { generatedAt, contentDigest, executionDigest, ...stablePlan } =
    plan ?? {};
  const expectedContentDigest = computePlannerContentDigest(
    stablePlan,
    config.hmacKey,
  );
  const expectedExecutionDigest = computePlannerExecutionDigest(
    { contentDigest: expectedContentDigest, generatedAt },
    config.hmacKey,
  );
  if (
    plan?.script !== "staff-task-integrity-reconciliation-plan" ||
    plan?.target !== "development" ||
    plan?.releaseSha !== config.admission.releaseSha ||
    plan?.schema?.ready !== true ||
    plan?.summary?.inventoryExecuted !== true ||
    plan?.safety?.databaseWrites !== false ||
    plan?.safety?.applySupported !== false ||
    plan?.safety?.aggregateOnly !== true ||
    !HMAC_PATTERN.test(String(plan?.databaseIdentityDigest ?? "")) ||
    !safeHmacEqual(expectedContentDigest, contentDigest) ||
    !safeHmacEqual(expectedExecutionDigest, executionDigest)
  ) {
    contractError(
      "PLANNER_BINDING_INVALID",
      "The aggregate planner failed its signed binding contract.",
      3,
    );
  }
}

function validatedPlanCounts(plan, config) {
  const proposalOccurrences = normalizeGateCount(
    plan?.summary?.classifications?.proposal?.candidateOccurrences,
    "PLANNER_SUMMARY_INVALID",
  );
  const operatorOccurrences = normalizeGateCount(
    plan?.summary?.classifications?.operator?.candidateOccurrences,
    "PLANNER_SUMMARY_INVALID",
  );
  const reviewOccurrences = normalizeGateCount(
    plan?.summary?.classifications?.review?.candidateOccurrences,
    "PLANNER_SUMMARY_INVALID",
  );
  const candidateOccurrences = normalizeGateCount(
    plan?.summary?.candidateOccurrences,
    "PLANNER_SUMMARY_INVALID",
  );
  const observedOccurrences = normalizeGateCount(
    plan?.summary?.observedOccurrences,
    "PLANNER_SUMMARY_INVALID",
  );
  const blockingTotal = normalizeGateCount(
    plan?.summary?.blockingTotal,
    "PLANNER_SUMMARY_INVALID",
  );
  const expectedCandidateOccurrences =
    proposalOccurrences + operatorOccurrences;
  const expectedObservedOccurrences =
    expectedCandidateOccurrences + reviewOccurrences;
  if (
    !Number.isSafeInteger(expectedObservedOccurrences) ||
    candidateOccurrences !== expectedCandidateOccurrences ||
    blockingTotal !== expectedCandidateOccurrences ||
    observedOccurrences !== expectedObservedOccurrences ||
    plan?.summary?.capExceeded !==
      expectedCandidateOccurrences > config.maxCases
  ) {
    contractError(
      "PLANNER_SUMMARY_INVALID",
      "The aggregate planner summary is internally inconsistent.",
      3,
    );
  }
  return {
    proposalOccurrences,
    operatorOccurrences,
    reviewOccurrences,
    blockingTotal,
    observedOccurrences,
  };
}

function stableReportFrom(report) {
  const {
    generatedAt: _generatedAt,
    admissionExecutionDigest: _admissionExecutionDigest,
    plannerExecutionDigest: _plannerExecutionDigest,
    contentDigest: _contentDigest,
    executionDigest: _executionDigest,
    ...stable
  } = report;
  return stable;
}

export function buildDryRunReport({
  config,
  admissionReport,
  plan,
  proposalRows,
  privilegeReady,
  releaseArtifactReady = true,
  rlsReady = true,
  advisoryLockAcquired = true,
  provenanceBinding,
  databaseIdentityDigest,
  verificationTime = new Date(),
}) {
  validateAdmissionBinding(admissionReport, config, verificationTime);
  validatePlannerBinding(plan, config);
  const planCounts = validatedPlanCounts(plan, config);
  if (
    privilegeReady !== true ||
    releaseArtifactReady !== true ||
    rlsReady !== true ||
    advisoryLockAcquired !== true ||
    provenanceBinding?.ready !== true ||
    !HMAC_PATTERN.test(String(provenanceBinding?.bindingDigest ?? "")) ||
    !safeHmacEqual(
      admissionReport.databaseIdentityDigest,
      databaseIdentityDigest,
    )
  ) {
    contractError(
      "DRY_RUN_GATE_REJECTED",
      "Schema, privilege, or database identity changed after admission.",
      3,
    );
  }

  const {
    proposalOccurrences,
    operatorOccurrences,
    reviewOccurrences,
    blockingTotal,
    observedOccurrences,
  } = planCounts;
  const capExceeded = plan.summary.capExceeded;
  const cases = capExceeded
    ? []
    : buildProposalCases({
        rows: proposalRows,
        plan,
        config,
        databaseIdentityDigest: plan.databaseIdentityDigest,
      });
  const decision = capExceeded
    ? "CAP_EXCEEDED"
    : operatorOccurrences > 0
      ? "OPERATOR_ACTION_REQUIRED"
      : proposalOccurrences > 0
        ? "PROPOSAL_REVIEW_REQUIRED"
        : reviewOccurrences > 0
          ? "REVIEW"
          : "PASS";

  const stableReport = {
    script: SCRIPT_NAME,
    reportSchemaVersion: REPORT_SCHEMA_VERSION,
    classification: CLASSIFICATION,
    releaseSha: config.admission.releaseSha,
    admissionBinding: {
      expectedState: EXPAND_STATE,
      contentDigest: admissionReport.contentDigest,
      databaseIdentityDigest: admissionReport.databaseIdentityDigest,
    },
    plannerBinding: {
      contentDigest: plan.contentDigest,
      databaseIdentityDigest: plan.databaseIdentityDigest,
    },
    provenanceBinding: {
      profile: SYNTHETIC_PROVENANCE_PROFILE,
      fixtureContractDigest: SYNTHETIC_FIXTURE_CONTRACT_DIGEST,
      bindingDigest: provenanceBinding.bindingDigest,
    },
    safety: {
      databaseWrites: false,
      applySupported: false,
      productionLikeSupported: false,
      remoteTargetSupported: false,
      admissionPrerequisiteValidated: true,
      databaseGatesRecheckedInRowSnapshot: true,
      releaseArtifactRecheckedInSnapshot: true,
      leastPrivilegeRoleRechecked: true,
      rlsRejected: true,
      cooperativeAdvisoryLockAcquired: true,
      transactionReadOnly: true,
      isolationLevel: "REPEATABLE READ",
      outputContainsRawIdentifiers: false,
      casesAreSyntheticOnly: true,
      caseTokensAuthorizeApply: false,
      caseTokensLinkableAcrossExecutions: false,
      preconditionDigestsAuthorizeApply: false,
      suggestionsAuthorizeApply: false,
      operatorCodesProposed: false,
      reviewCodesProposed: false,
      coLocatedFindingsRequireFullInvariantReview: true,
    },
    thresholds: {
      staleStartedMinutes: config.staleStartedMinutes,
      failedWindowDays: config.failedWindowDays,
      failedThreshold: config.failedThreshold,
    },
    limits: {
      maxCases: config.maxCases,
      lockTimeoutMs: config.admission.lockTimeoutMs,
      statementTimeoutMs: config.admission.statementTimeoutMs,
      transactionTimeoutMs: config.admission.transactionTimeoutMs,
    },
    schema: plan.schema,
    databaseIdentityDigest: plan.databaseIdentityDigest,
    summary: {
      decision,
      capExceeded,
      proposalOccurrences,
      uniqueProposalCases: cases.length,
      operatorOccurrences,
      reviewOccurrences,
      blockingTotal,
      observedOccurrences,
    },
    findings: plan.findings,
    cases,
  };
  const generatedAt = normalizeTimestamp(plan.generatedAt);
  const contentDigest = computeHmac(
    "staff-task-reconciliation-proposal-content-v1",
    stableReport,
    config.hmacKey,
  );
  return {
    ...stableReport,
    generatedAt,
    admissionExecutionDigest: admissionReport.executionDigest,
    plannerExecutionDigest: plan.executionDigest,
    contentDigest,
    executionDigest: computeHmac(
      "staff-task-reconciliation-proposal-execution-v1",
      {
        contentDigest,
        generatedAt,
        admissionExecutionDigest: admissionReport.executionDigest,
        plannerExecutionDigest: plan.executionDigest,
      },
      config.hmacKey,
    ),
  };
}

export function exitCodeForDryRun(report, hmacKey) {
  if (
    !report ||
    !HMAC_PATTERN.test(String(report.contentDigest ?? "")) ||
    !HMAC_PATTERN.test(String(report.executionDigest ?? "")) ||
    !HMAC_PATTERN.test(String(report.admissionExecutionDigest ?? "")) ||
    !HMAC_PATTERN.test(String(report.plannerExecutionDigest ?? ""))
  ) {
    return 1;
  }
  const expectedContentDigest = computeHmac(
    "staff-task-reconciliation-proposal-content-v1",
    stableReportFrom(report),
    hmacKey,
  );
  const expectedExecutionDigest = computeHmac(
    "staff-task-reconciliation-proposal-execution-v1",
    {
      contentDigest: report.contentDigest,
      generatedAt: report.generatedAt,
      admissionExecutionDigest: report.admissionExecutionDigest,
      plannerExecutionDigest: report.plannerExecutionDigest,
    },
    hmacKey,
  );
  if (
    !safeHmacEqual(expectedContentDigest, report.contentDigest) ||
    !safeHmacEqual(expectedExecutionDigest, report.executionDigest) ||
    report.safety?.databaseWrites !== false ||
    report.safety?.applySupported !== false ||
    report.safety?.productionLikeSupported !== false ||
    report.safety?.caseTokensAuthorizeApply !== false ||
    report.safety?.preconditionDigestsAuthorizeApply !== false ||
    report.safety?.suggestionsAuthorizeApply !== false ||
    report.schema?.ready !== true
  ) {
    return 1;
  }
  if (report.summary?.capExceeded === true) {
    return 3;
  }
  return Number(report.summary?.blockingTotal ?? 0) > 0 ? 2 : 0;
}

function selfTestAdmissionReport(config, databaseIdentityDigest) {
  const stable = {
    script: "staff-task-integrity-snapshot-admission",
    reportSchemaVersion: 2,
    classification: CLASSIFICATION,
    expectedState: EXPAND_STATE,
    releaseSha: config.admission.releaseSha,
    acquiredAt: config.admission.acquiredAt,
    restoredAt: config.admission.restoredAt,
    expiresAt: config.admission.expiresAt,
    snapshotArtifactDigest: config.admission.snapshotArtifactDigest,
    approvalReferenceDigest: "a".repeat(64),
    databaseIdentityDigest,
    safety: {
      databaseWrites: false,
      admissionOnly: true,
      applySupported: false,
      productionProcessAllowed: false,
      remoteTargetAllowed: false,
      connectionLimit: 1,
      transactionReadOnly: true,
      isolationLevel: "REPEATABLE READ",
      leastPrivilegeRoleRequired: true,
      exactSelectAllowlistRequired: true,
      releaseArtifactBound: true,
      independentProductionLikeAuthorityRequired: true,
      enforcementTriggersRequired: true,
      outputContainsDatabaseName: false,
      outputContainsRoleName: false,
      outputContainsRowIdentifiers: false,
      evidenceAuthorizesReconciliation: false,
    },
    limits: {
      lockTimeoutMs: config.admission.lockTimeoutMs,
      statementTimeoutMs: config.admission.statementTimeoutMs,
      transactionTimeoutMs: config.admission.transactionTimeoutMs,
    },
    database: {
      currentSchemaIsPublic: true,
      databaseNameMatched: true,
      snapshotNotExpiredAtGeneration: true,
      databaseIdentityDigestRequired: false,
      databaseIdentityDigestMatched: true,
      productionLikeAuthorityVerified: false,
      productionLikeAuthorityDatabaseMarkerMatched: false,
      postgresqlMajor: 16,
      postgresqlMajorSupported: true,
      migrations: {
        detectedState: EXPAND_STATE,
        migrationCount: 162,
        unfinishedMigrationCount: 0,
        latestMigrationMatchesExpectedState: true,
      },
      migrationManifest: {
        ready: true,
        expectedCount: 162,
        actualCount: 162,
        manifestDigest: "b".repeat(64),
      },
      catalog: {
        ready: true,
        expected: {
          foreignKeyMatchCount: 28,
          foreignKeyMismatchCount: 0,
          unexpectedProtectedForeignKeyCount: 0,
          protectedCompositePresentCount: 14,
          protectedParentIndexPresentCount: 5,
        },
        actual: {
          foreignKeyMatchCount: 28,
          foreignKeyMismatchCount: 0,
          unexpectedProtectedForeignKeyCount: 0,
          protectedCompositePresentCount: 14,
          protectedParentIndexPresentCount: 5,
        },
      },
      privileges: {
        ready: true,
        actual: {},
      },
    },
    summary: {
      decision: "ADMITTED",
      rejectionCodes: [],
      inventoryExecuted: false,
      plannerExecuted: false,
    },
  };
  const generatedAt = "2026-07-27T00:00:00.000Z";
  const contentDigest = computeHmac(
    "staff-task-snapshot-admission-content-v2",
    stable,
    config.admission.hmacKey,
  );
  return {
    ...stable,
    generatedAt,
    contentDigest,
    executionDigest: computeHmac(
      "staff-task-snapshot-admission-execution-v2",
      { contentDigest, generatedAt },
      config.admission.hmacKey,
    ),
  };
}

function selfTestConfig() {
  const now = new Date("2026-07-27T00:00:00.000Z");
  const releaseSha = "a".repeat(40);
  const provenanceHmacKey = "self-test-provenance-hmac-key-cccccccccccccc";
  const databaseIdentityDigest = computeDatabaseIdentityDigest(
    {
      current_database: "lp_snapshot_admission_ci_cccccccccccccccc",
      cluster_system_identifier: "1234567890123456789",
      database_oid: "16384",
    },
    provenanceHmacKey,
  );
  const provenanceManifest = buildSyntheticProvenanceManifest(
    {
      releaseSha,
      databaseIdentityDigest,
      creationNonce: "9".repeat(64),
      createdAt: now.toISOString(),
      expiresAt: new Date(now.valueOf() + 60 * 60 * 1_000).toISOString(),
    },
    provenanceHmacKey,
  );
  return parseRuntimeContract(
    {
      NODE_ENV: "test",
      DATABASE_URL:
        "postgresql://reader:secret@127.0.0.1:5432/lp_snapshot_admission_ci_cccccccccccccccc?schema=public",
      RELEASE_SHA: releaseSha,
      STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_CLASSIFICATION: CLASSIFICATION,
      STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_EXPECTED_STATE: EXPAND_STATE,
      STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_EXPECTED_DATABASE:
        "lp_snapshot_admission_ci_cccccccccccccccc",
      STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_CONFIRM:
        "run-staff-task-integrity-snapshot-admission",
      STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_ISOLATION_ATTESTATION:
        "I_ATTEST_THIS_IS_AN_ISOLATED_ENCRYPTED_NO_EGRESS_NON_PRODUCTION_SNAPSHOT",
      STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_HMAC_KEY:
        "self-test-admission-hmac-key-aaaaaaaaaaaaaaaa",
      STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_SNAPSHOT_DIGEST: "b".repeat(64),
      STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_APPROVAL_REFERENCE:
        "synthetic:dry-run-self-test",
      STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_ACQUIRED_AT:
        "2026-07-27T00:00:00.000Z",
      STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_RESTORED_AT:
        "2026-07-27T00:00:00.000Z",
      STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_EXPIRES_AT:
        "2026-07-27T01:00:00.000Z",
      STAFF_TASK_INTEGRITY_RECONCILIATION_DRY_RUN_CONFIRM: RUN_CONFIRMATION,
      STAFF_TASK_INTEGRITY_RECONCILIATION_DRY_RUN_HMAC_KEY:
        "self-test-proposal-hmac-key-bbbbbbbbbbbbbbbbb",
      STAFF_TASK_INTEGRITY_RECONCILIATION_DRY_RUN_PROVENANCE_HMAC_KEY:
        provenanceHmacKey,
      STAFF_TASK_INTEGRITY_RECONCILIATION_DRY_RUN_PROVENANCE_MANIFEST:
        encodeSyntheticProvenanceManifest(provenanceManifest),
    },
    now,
  );
}

function selfTestPlan(config, proposalCount = 0) {
  const manifest = proposalManifest();
  const findings = FINDING_MANIFEST.map((finding) => ({
    ...finding,
    count: finding.code === "TEMPLATE_CREATOR_CROSS_TENANT" ? proposalCount : 0,
  })).sort((left, right) => left.code.localeCompare(right.code));
  assert.equal(manifest.length, 8);
  const stablePlan = {
    script: "staff-task-integrity-reconciliation-plan",
    reportSchemaVersion: 1,
    target: "development",
    releaseSha: config.admission.releaseSha,
    databaseIdentityDigest: "c".repeat(64),
    safety: {
      databaseWrites: false,
      applySupported: false,
      proposalIsAuthorization: false,
      connectionLimit: 1,
      transactionReadOnly: true,
      isolationLevel: "REPEATABLE READ",
      aggregateOnly: true,
      outputContainsRowIdentifiers: false,
    },
    thresholds: {},
    limits: {},
    schema: { ready: true, expected: {}, actual: {} },
    summary: {
      decision: proposalCount > 0 ? "FINDINGS" : "PASS",
      inventoryExecuted: true,
      candidateOccurrences: proposalCount,
      observedOccurrences: proposalCount,
      capExceeded: false,
      blockingTotal: proposalCount,
      blockingCodes: proposalCount > 0 ? 1 : 0,
      reviewTotal: 0,
      reviewCodes: 0,
      classifications: {
        proposal: {
          catalogCodes: 8,
          positiveCodes: proposalCount > 0 ? 1 : 0,
          candidateOccurrences: proposalCount,
        },
        operator: {
          catalogCodes: 29,
          positiveCodes: 0,
          candidateOccurrences: 0,
        },
        review: {
          catalogCodes: 6,
          positiveCodes: 0,
          candidateOccurrences: 0,
        },
      },
    },
    findings,
  };
  const generatedAt = "2026-07-27T00:00:00.000Z";
  const contentDigest = computePlannerContentDigest(stablePlan, config.hmacKey);
  return {
    ...stablePlan,
    generatedAt,
    contentDigest,
    executionDigest: computePlannerExecutionDigest(
      { contentDigest, generatedAt },
      config.hmacKey,
    ),
  };
}

export function runSelfTest() {
  const manifest = proposalManifest();
  assert.equal(manifest.length, 8);
  assert.deepEqual(
    manifest.map(({ code }) => code),
    PROPOSAL_CODES,
  );
  assert.equal(
    Object.values(PROPOSAL_ACTIONS).every(
      ({ operation }) => operation === "REFERENCE_CLEAR_CANDIDATE",
    ),
    true,
  );
  assert.equal(MUTATING_KEYWORD_PATTERN.test(PROPOSAL_ROWS_SQL), false);
  assert.equal(
    MUTATING_KEYWORD_PATTERN.test(SYNTHETIC_PROVENANCE_STATE_SQL),
    false,
  );
  for (const sql of [
    RELATION_LOCK_BEFORE_USER_SQL,
    USER_RELATION_ACCESS_SHARE_SQL,
    RELATION_LOCK_AFTER_USER_SQL,
  ]) {
    assert.equal(MUTATING_KEYWORD_PATTERN.test(sql), false);
  }
  assert.match(RELATION_LOCK_BEFORE_USER_SQL, /IN ACCESS SHARE MODE$/u);
  assert.match(
    USER_RELATION_ACCESS_SHARE_SQL,
    /^SELECT "id"\s+FROM ONLY public\."User"\s+WHERE false$/u,
  );
  assert.match(RELATION_LOCK_AFTER_USER_SQL, /IN ACCESS SHARE MODE$/u);
  assert.doesNotMatch(PROPOSAL_ROWS_SQL, /SELECT\s+\*/iu);
  assert.throws(() => parseArguments(["--apply"]), {
    code: "CLI_ARGUMENT_UNSUPPORTED",
  });
  assert.throws(() => parseArguments(["--apply", "--help"]), {
    code: "CLI_ARGUMENT_UNSUPPORTED",
  });

  const config = selfTestConfig();
  const admissionReport = selfTestAdmissionReport(config, "d".repeat(64));
  const plan = selfTestPlan(config, 1);
  const resourceId = "synthetic-template-id";
  const tenantId = "synthetic-tenant-a";
  const currentValue = "synthetic-user-b";
  const cases = buildProposalCases({
    config,
    plan,
    databaseIdentityDigest: plan.databaseIdentityDigest,
    rows: [
      {
        code: "TEMPLATE_CREATOR_CROSS_TENANT",
        resource_type: "StaffTaskTemplate",
        resource_id: resourceId,
        tenant_id: tenantId,
        target_column: "createdByUserId",
        current_value: currentValue,
        updated_at: "2026-07-27T00:00:00.000Z",
        related_tenant_id: "synthetic-tenant-b",
        context_value: null,
      },
    ],
  });
  assert.equal(cases.length, 1);
  const report = buildDryRunReport({
    config,
    admissionReport,
    plan,
    proposalRows: [
      {
        code: "TEMPLATE_CREATOR_CROSS_TENANT",
        resource_type: "StaffTaskTemplate",
        resource_id: resourceId,
        tenant_id: tenantId,
        target_column: "createdByUserId",
        current_value: currentValue,
        updated_at: "2026-07-27T00:00:00.000Z",
        related_tenant_id: "synthetic-tenant-b",
        context_value: null,
      },
    ],
    privilegeReady: true,
    provenanceBinding: {
      ready: true,
      bindingDigest: "f".repeat(64),
    },
    databaseIdentityDigest: admissionReport.databaseIdentityDigest,
    verificationTime: new Date("2026-07-27T00:00:00.000Z"),
  });
  assert.equal(exitCodeForDryRun(report, config.hmacKey), 2);
  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes(resourceId), false);
  assert.equal(serialized.includes(tenantId), false);
  assert.equal(serialized.includes(currentValue), false);
  assert.equal(serialized.includes(config.hmacKey), false);

  return {
    script: SCRIPT_NAME,
    status: "PASS",
    checks: 20,
    proposalCodes: PROPOSAL_CODES.length,
    operatorCodesProposed: 0,
    reviewCodesProposed: 0,
    applySupported: false,
    syntheticOnly: true,
  };
}

export async function scanDatabase(
  environment,
  config,
  PrismaClientConstructor = PrismaClient,
) {
  const expectedMigrationManifest = await loadExpectedMigrationManifest(
    EXPAND_STATE,
    config.admission.releaseSha,
  );
  const admissionReport = await inspectAdmissionDatabase(
    environment,
    config.admission,
  );
  const admissionVerificationTime = new Date();
  validateAdmissionBinding(admissionReport, config, admissionVerificationTime);
  if (
    exitCodeForAdmission(
      admissionReport,
      config.admission.hmacKey,
      admissionVerificationTime,
    ) !== 0
  ) {
    contractError(
      "ADMISSION_BINDING_INVALID",
      "The prerequisite admission report was not admitted.",
      3,
    );
  }

  const datasourceUrl = buildDryRunDatabaseUrl(
    environment.DATABASE_URL,
    config,
  );
  const prisma = new PrismaClientConstructor({ datasourceUrl, log: [] });
  try {
    return await prisma.$transaction(
      async (transaction) => {
        await transaction.$executeRawUnsafe("SET TRANSACTION READ ONLY");
        await transaction.$executeRawUnsafe(
          `SET LOCAL lock_timeout = '${config.admission.lockTimeoutMs}ms'`,
        );
        await transaction.$executeRawUnsafe(
          `SET LOCAL statement_timeout = '${config.admission.statementTimeoutMs}ms'`,
        );
        await transaction.$executeRawUnsafe(
          `SET LOCAL idle_in_transaction_session_timeout = '${config.admission.transactionTimeoutMs}ms'`,
        );

        const transactionRows = await transaction.$queryRawUnsafe(
          `SELECT
             current_setting('transaction_read_only') AS read_only,
             current_setting('transaction_isolation') AS isolation`,
        );
        if (
          transactionRows[0]?.read_only !== "on" ||
          transactionRows[0]?.isolation !== "repeatable read"
        ) {
          contractError(
            "DATABASE_READ_ONLY_SNAPSHOT_REQUIRED",
            "The database did not establish the required read-only snapshot.",
          );
        }

        const advisoryRows = await transaction.$queryRawUnsafe(
          "SELECT pg_try_advisory_xact_lock($1::integer, $2::integer) AS acquired",
          ADVISORY_LOCK_NAMESPACE,
          ADVISORY_LOCK_RESOURCE,
        );
        const advisoryLockAcquired = advisoryRows[0]?.acquired === true;
        if (!advisoryLockAcquired) {
          contractError(
            "CONCURRENT_DRY_RUN_REJECTED",
            "Another cooperating proposal dry-run owns the database lock.",
            3,
          );
        }
        await transaction.$executeRawUnsafe(RELATION_LOCK_BEFORE_USER_SQL);
        await transaction.$queryRawUnsafe(USER_RELATION_ACCESS_SHARE_SQL);
        await transaction.$executeRawUnsafe(RELATION_LOCK_AFTER_USER_SQL);

        const snapshotRows =
          await transaction.$queryRawUnsafe(SNAPSHOT_STATE_SQL);
        const migrationRows =
          await transaction.$queryRawUnsafe(MIGRATION_STATE_SQL);
        const catalogRows =
          await transaction.$queryRawUnsafe(CATALOG_STATE_SQL);
        const privilegeRows =
          await transaction.$queryRawUnsafe(PRIVILEGE_STATE_SQL);
        const appliedMigrationRows = await transaction.$queryRawUnsafe(
          APPLIED_MIGRATION_MANIFEST_SQL,
        );
        const versionRows = await transaction.$queryRawUnsafe(
          "SELECT current_setting('server_version_num')::text AS server_version_num",
        );
        const rlsRows = await transaction.$queryRawUnsafe(RLS_STATE_SQL);
        const initialProvenanceRows = await transaction.$queryRawUnsafe(
          SYNTHETIC_PROVENANCE_STATE_SQL,
        );
        if (
          snapshotRows.length !== 1 ||
          migrationRows.length !== 1 ||
          catalogRows.length !== 1 ||
          privilegeRows.length !== 1 ||
          versionRows.length !== 1 ||
          rlsRows.length !== 1 ||
          initialProvenanceRows.length !== 1
        ) {
          contractError(
            "DATABASE_GATE_STATE_INVALID",
            "The database returned an invalid dry-run gate shape.",
            3,
          );
        }
        const migrationManifest = buildMigrationManifestState(
          expectedMigrationManifest,
          appliedMigrationRows,
        );
        const serverVersionNumber = String(
          versionRows[0]?.server_version_num ?? "",
        );
        const postgresqlMajor =
          /^\d+$/u.test(serverVersionNumber) &&
          Number.parseInt(serverVersionNumber, 10) >= 100_000
            ? Math.floor(Number.parseInt(serverVersionNumber, 10) / 10_000)
            : 0;
        const rlsReady =
          normalizeGateCount(
            rlsRows[0]?.missing_relation_count,
            "DATABASE_RLS_CATALOG_INVALID",
          ) === 0 &&
          normalizeGateCount(
            rlsRows[0]?.rls_enabled_relation_count,
            "DATABASE_RLS_CATALOG_INVALID",
          ) === 0;
        if (!migrationManifest.ready || postgresqlMajor !== 16 || !rlsReady) {
          contractError(
            "DRY_RUN_RELEASE_GATE_REJECTED",
            "Migration artifact, PostgreSQL major, or RLS gate was rejected.",
            3,
          );
        }
        const initialProvenanceBinding = verifySyntheticProvenanceSnapshot({
          provenance: config.provenance,
          provenanceHmacKey: config.provenanceHmacKey,
          snapshotRow: snapshotRows[0],
          provenanceRow: initialProvenanceRows[0],
        });

        const inventoryRows = await transaction.$queryRawUnsafe(
          INVENTORY_SQL,
          config.staleStartedMinutes,
          config.failedWindowDays,
          config.failedThreshold,
        );
        const plan = buildPlan({
          config: plannerConfig(config),
          rows: inventoryRows,
          snapshotRow: snapshotRows[0],
          migrationRow: migrationRows[0],
          catalogRow: catalogRows[0],
          inventoryExecuted: true,
        });
        const privileges = privilegeState(privilegeRows[0]);
        const databaseIdentityDigest = computeDatabaseIdentityDigest(
          snapshotRows[0],
          config.admission.hmacKey,
        );

        const proposalRows = plan.summary.capExceeded
          ? []
          : await transaction.$queryRawUnsafe(
              PROPOSAL_ROWS_SQL,
              config.maxCases + 1,
            );
        if (proposalRows.length > config.maxCases) {
          contractError(
            "DATABASE_PROPOSAL_ROW_CAP_EXCEEDED",
            "Row-level proposal evidence exceeded its predeclared cap.",
            3,
          );
        }
        const finalProvenanceRows = await transaction.$queryRawUnsafe(
          SYNTHETIC_PROVENANCE_STATE_SQL,
        );
        if (finalProvenanceRows.length !== 1) {
          contractError(
            "SYNTHETIC_PROVENANCE_STATE_INVALID",
            "The database did not return one synthetic provenance state.",
            3,
          );
        }
        const finalProvenanceBinding = verifySyntheticProvenanceSnapshot({
          provenance: config.provenance,
          provenanceHmacKey: config.provenanceHmacKey,
          snapshotRow: snapshotRows[0],
          provenanceRow: finalProvenanceRows[0],
        });
        if (
          !safeHmacEqual(
            initialProvenanceBinding.bindingDigest,
            finalProvenanceBinding.bindingDigest,
          ) ||
          new Date(config.admission.expiresAt).valueOf() <=
            new Date(finalProvenanceRows[0].verified_at).valueOf()
        ) {
          contractError(
            "DRY_RUN_EVIDENCE_EXPIRED",
            "Admission or synthetic provenance expired before report creation.",
            3,
          );
        }
        return buildDryRunReport({
          config,
          admissionReport,
          plan,
          proposalRows,
          privilegeReady: privileges.ready,
          releaseArtifactReady: migrationManifest.ready,
          rlsReady,
          advisoryLockAcquired,
          provenanceBinding: finalProvenanceBinding,
          databaseIdentityDigest,
          verificationTime: new Date(finalProvenanceRows[0].verified_at),
        });
      },
      {
        isolationLevel: "RepeatableRead",
        timeout: config.admission.transactionTimeoutMs,
        maxWait: Math.min(config.admission.transactionTimeoutMs, 10_000),
      },
    );
  } finally {
    await prisma.$disconnect();
  }
}

function renderJson(value, pretty) {
  return JSON.stringify(value, null, pretty ? 2 : 0);
}

export function renderBoundedReport(report, pretty) {
  const rendered = renderJson(report, pretty);
  if (Buffer.byteLength(rendered, "utf8") > MAX_RENDERED_REPORT_BYTES) {
    contractError(
      "REPORT_SIZE_LIMIT_EXCEEDED",
      "The proposal dry-run report exceeds its rendered byte limit.",
      3,
    );
  }
  return rendered;
}

export async function main(
  argv = process.argv.slice(2),
  environment = process.env,
) {
  let options;
  try {
    options = parseArguments(argv);
  } catch (error) {
    const code = error?.safeContractError
      ? String(error.code)
      : "CLI_CONTRACT_FAILED";
    process.stderr.write(
      `${renderJson({ script: SCRIPT_NAME, status: "ERROR", error: { code } }, false)}\n`,
    );
    return Number.isInteger(error?.exitCode) ? error.exitCode : 1;
  }

  if (options.help) {
    process.stdout.write(`${HELP}\n`);
    return 0;
  }
  if (options.selfTest) {
    try {
      process.stdout.write(`${renderJson(runSelfTest(), options.pretty)}\n`);
      return 0;
    } catch {
      process.stderr.write(
        `${renderJson(
          {
            script: SCRIPT_NAME,
            status: "ERROR",
            error: { code: "SELF_TEST_FAILED" },
          },
          false,
        )}\n`,
      );
      return 1;
    }
  }

  try {
    const config = parseRuntimeContract(environment);
    const report = await scanDatabase(environment, config);
    validateProvenanceTimeline(config.provenance, new Date());
    if (new Date(config.admission.expiresAt).valueOf() <= Date.now()) {
      contractError(
        "DRY_RUN_EVIDENCE_EXPIRED",
        "Admission expired before report serialization.",
        3,
      );
    }
    const exitCode = exitCodeForDryRun(report, config.hmacKey);
    if (exitCode === 1) {
      contractError(
        "DRY_RUN_REPORT_INTEGRITY_FAILED",
        "The dry-run report failed its internal integrity contract.",
      );
    }
    process.stdout.write(`${renderBoundedReport(report, options.pretty)}\n`);
    return exitCode;
  } catch (error) {
    const code = error?.safeContractError
      ? String(error.code)
      : "DATABASE_DRY_RUN_FAILED";
    process.stderr.write(
      `${renderJson({ script: SCRIPT_NAME, status: "ERROR", error: { code } }, false)}\n`,
    );
    return Number.isInteger(error?.exitCode) ? error.exitCode : 1;
  }
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  process.exitCode = await main();
}

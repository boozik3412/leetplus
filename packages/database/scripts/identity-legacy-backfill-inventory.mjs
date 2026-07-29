import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, createHmac } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Prisma, PrismaClient } from "@prisma/client";

import { canonicalStringify } from "./staff-task-integrity-canonical-json.mjs";
import {
  CURRENT_EXPECTED_LATEST_MIGRATION,
  CURRENT_EXPECTED_MIGRATION_COUNT,
  STAFF_TASK_CURRENT_RELEASE_STATE,
} from "./staff-task-integrity-migration-state.mjs";

export const SCRIPT_NAME = "identity-legacy-backfill-inventory";
export const REPORT_SCHEMA_VERSION = 1;
export const CONTRACT_NAME = "IDENTITY_LEGACY_RECONCILIATION_V1";
export const RUN_CONFIRMATION = "run-identity-legacy-inventory";
export const PRODUCTION_ATTESTATION =
  "I_ATTEST_THIS_IS_A_READ_ONLY_PRODUCTION_IDENTITY_LEGACY_INVENTORY";
export const HMAC_KEY_VERSION = "v1";
export const EXPECTED_PRISMA_CLIENT_VERSION = "6.19.3";

const TARGET_ENVIRONMENTS = new Set([
  "development",
  "staging",
  "production",
]);
const DATABASE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$/u;
const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const HMAC_PATTERN = /^[0-9a-f]{64}$/u;
const MIGRATION_NAME_PATTERN = /^\d{14}_[a-z0-9_]+$/u;
const DEFAULT_CONNECT_TIMEOUT_SECONDS = 10;
const DEFAULT_LOCK_TIMEOUT_MS = 500;
const DEFAULT_STATEMENT_TIMEOUT_MS = 30_000;
const DEFAULT_TRANSACTION_TIMEOUT_MS = 120_000;
const MAX_HMAC_KEY_BYTES = 4_096;

export const REQUIRED_COLUMN_SELECTS = Object.freeze({
  _prisma_migrations: Object.freeze([
    "migration_name",
    "finished_at",
    "rolled_back_at",
  ]),
  User: Object.freeze([
    "id",
    "tenantId",
    "email",
    "identityClaimRevision",
    "isPlatformAdmin",
    "emailVerifiedAt",
  ]),
  UserInvite: Object.freeze([
    "id",
    "tenantId",
    "email",
    "acceptedAt",
    "acceptedByUserId",
    "revokedAt",
    "expiresAt",
    "identityClaimRevision",
  ]),
  IdentityEmailClaim: Object.freeze([
    "emailCanonical",
    "claimType",
    "tenantId",
    "subjectId",
    "revision",
  ]),
});

export const FINDING_MANIFEST = Object.freeze({
  USER_EMAIL_UNSUPPORTED: "BLOCKING",
  USER_SUBJECT_ID_INVALID: "BLOCKING",
  LIVE_INVITE_EMAIL_MISSING_OR_UNSUPPORTED: "BLOCKING",
  LIVE_INVITE_SUBJECT_ID_INVALID: "BLOCKING",
  ACTIVE_IDENTITY_CANONICAL_COLLISION: "BLOCKING",
  INVITE_STATE_MISMATCH: "BLOCKING",
  ACCEPTED_INVITE_BINDING_MISMATCH: "BLOCKING",
  ACCEPTED_INVITE_CLAIM_LINEAGE_MISMATCH: "BLOCKING",
  BOUND_CLAIM_NULL_PROVENANCE: "BLOCKING",
  USER_CLAIM_OWNER_MISMATCH: "BLOCKING",
  LIVE_INVITE_CLAIM_OWNER_MISMATCH: "BLOCKING",
  USER_CLAIM_REVISION_MISMATCH: "BLOCKING",
  LIVE_INVITE_CLAIM_REVISION_MISMATCH: "BLOCKING",
  USER_REVISION_WITHOUT_EXACT_CLAIM: "BLOCKING",
  LIVE_INVITE_REVISION_WITHOUT_EXACT_CLAIM: "BLOCKING",
  ORPHAN_USER_CLAIM: "BLOCKING",
  ORPHAN_INVITE_CLAIM: "BLOCKING",
  EMAIL_CHANGE_CLAIM_PRESENT: "BLOCKING",
  CLAIM_CANONICAL_UNSUPPORTED: "BLOCKING",
  CLAIM_SUBJECT_ID_INVALID: "BLOCKING",
  SUBJECT_MULTIPLE_IDENTITY_CLAIMS: "BLOCKING",
  USER_CLAIM_CREATE_CANDIDATE: "PROPOSAL",
  LIVE_INVITE_CLAIM_CREATE_CANDIDATE: "PROPOSAL",
  USER_SENSITIVE_IDENTITY_REVIEW: "REVIEW",
  LIVE_INVITE_LEGACY_TOKEN_REVIEW: "REVIEW",
  ACCEPTED_INVITE_NULL_PROVENANCE_HISTORY: "REVIEW",
  REVOKED_INVITE_NULL_PROVENANCE_HISTORY: "REVIEW",
  EXPIRED_INVITE_NULL_PROVENANCE_HISTORY: "REVIEW",
  TERMINAL_INVITE_EMAIL_UNSUPPORTED: "REVIEW",
});

const EXPECTED_METRIC_CODES = Object.freeze([
  "USER_TOTAL",
  "LIVE_INVITE_TOTAL",
  "ACCEPTED_INVITE_TOTAL",
  "REVOKED_INVITE_TOTAL",
  "EXPIRED_INVITE_TOTAL",
  "INVALID_INVITE_STATE_TOTAL",
  "IDENTITY_CLAIM_TOTAL",
]);

const RELEASE_RUNTIME_ENTRYPOINT_SOURCE_PATH =
  "packages/database/scripts/identity-legacy-backfill-inventory.mjs";
const RELEASE_RUNTIME_SOURCE_PATHS = Object.freeze([
  RELEASE_RUNTIME_ENTRYPOINT_SOURCE_PATH,
  "packages/database/scripts/staff-task-integrity-canonical-json.mjs",
  "packages/database/scripts/staff-task-integrity-migration-state.mjs",
  "packages/database/package.json",
  "pnpm-lock.yaml",
]);

export const HELP = `
${SCRIPT_NAME}

Guarded, aggregate-only inventory for legacy User, UserInvite, and
IdentityEmailClaim provenance on exact ${STAFF_TASK_CURRENT_RELEASE_STATE}.
The command cannot propose row values, apply a backfill, or mutate data.

Usage:
  node scripts/identity-legacy-backfill-inventory.mjs [options]

Options:
  --help       Show this help without reading environment variables or the DB.
  --self-test  Run contract/source-safety checks without reading the DB.
  --verify-release-artifact
               Verify exact committed source/migration binding without a DB.
  --pretty     Pretty-print aggregate JSON output.

Required environment:
  DATABASE_URL
  NODE_ENV
  RELEASE_SHA
    Full lowercase 40-hex commit SHA for the running release artifact.
  IDENTITY_LEGACY_INVENTORY_TARGET
    One of: development, staging, production.
  IDENTITY_LEGACY_INVENTORY_CONFIRM
    Must equal: ${RUN_CONFIRMATION}
  IDENTITY_LEGACY_INVENTORY_EXPECTED_DATABASE
    Exact database name; never emitted in the report.
  IDENTITY_LEGACY_INVENTORY_HMAC_KEY
    Dedicated 32..4096 byte secret; never emitted in the report.
  IDENTITY_LEGACY_INVENTORY_HMAC_KEY_VERSION
    Must equal: ${HMAC_KEY_VERSION}

Production-only attestation:
  IDENTITY_LEGACY_INVENTORY_PRODUCTION_ATTESTATION
    Must equal:
    ${PRODUCTION_ATTESTATION}
  IDENTITY_LEGACY_INVENTORY_EXPECTED_DATABASE_IDENTITY_DIGEST
    Exact 64-hex HMAC identity digest from separately approved custody.
  DATABASE_URL TLS parameters
    Remote targets require exactly one sslmode=require and one
    sslaccept=strict. Plaintext is permitted only for loopback fixtures.

Optional bounded settings:
  IDENTITY_LEGACY_INVENTORY_CONNECT_TIMEOUT_SECONDS
    1..30 (default 10)
  IDENTITY_LEGACY_INVENTORY_LOCK_TIMEOUT_MS
    100..5000 (default 500)
  IDENTITY_LEGACY_INVENTORY_STATEMENT_TIMEOUT_MS
    1000..120000 (default 30000)
  IDENTITY_LEGACY_INVENTORY_TRANSACTION_TIMEOUT_MS
    5000..600000 (default 120000)

Safety:
  One PostgreSQL connection and one READ ONLY REPEATABLE READ transaction are
  used. Exact column-scoped SELECT admission is checked before identity rows.
  Output contains aggregate counts, stable codes, and domain-separated HMACs.
  It never contains database/role names, URLs, email addresses, UUIDs, names,
  password/token material, row values, proposal rows, or secrets.

Exit codes:
  0  PASS or READY_FOR_PROPOSAL; this never authorizes proposal/apply.
  1  CLI, runtime contract, release artifact, database, or report error.
  2  BLOCKED or REVIEW.
  3  SCHEMA_MISMATCH or ADMISSION_MISMATCH; inventory was not executed.
`.trim();

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlTextArray(values) {
  return `ARRAY[${values.map(sqlLiteral).join(", ")}]::text[]`;
}

function requiredColumnValues() {
  return Object.entries(REQUIRED_COLUMN_SELECTS)
    .flatMap(([relation, columns]) =>
      columns.map(
        (column) => `(${sqlLiteral(relation)}, ${sqlLiteral(column)})`,
      ),
    )
    .join(",\n    ");
}

function requiredRelationValues() {
  return Object.keys(REQUIRED_COLUMN_SELECTS)
    .map((relation) => `(${sqlLiteral(relation)})`)
    .join(",\n    ");
}

const EXPECTED_CATALOG_RELATIONS = Object.freeze([
  "_prisma_migrations",
  "Tenant",
  "User",
  "UserInvite",
  "IdentityEmailClaim",
]);

const EXPECTED_CATALOG_COLUMNS = Object.freeze([
  [
    "_prisma_migrations",
    "finished_at",
    3,
    "timestamp with time zone",
    false,
    "",
    "",
  ],
  [
    "_prisma_migrations",
    "migration_name",
    4,
    "character varying(255)",
    true,
    "",
    "pg_catalog.default",
  ],
  [
    "_prisma_migrations",
    "rolled_back_at",
    6,
    "timestamp with time zone",
    false,
    "",
    "",
  ],
  ["Tenant", "id", 1, "text", true, "", "pg_catalog.default"],
  ["User", "id", 1, "text", true, "", "pg_catalog.default"],
  ["User", "tenantId", 2, "text", true, "", "pg_catalog.default"],
  ["User", "email", 3, "text", true, "", "pg_catalog.default"],
  [
    "User",
    "updatedAt",
    8,
    "timestamp(3) without time zone",
    true,
    "",
    "",
  ],
  [
    "User",
    "emailVerifiedAt",
    9,
    "timestamp(3) without time zone",
    false,
    "",
    "",
  ],
  ["User", "isPlatformAdmin", 10, "boolean", true, "false", ""],
  ["User", "isActive", 11, "boolean", true, "true", ""],
  ["User", "identityClaimRevision", 14, "integer", false, "", ""],
  ["UserInvite", "id", 1, "text", true, "", "pg_catalog.default"],
  [
    "UserInvite",
    "tenantId",
    2,
    "text",
    true,
    "",
    "pg_catalog.default",
  ],
  ["UserInvite", "email", 3, "text", false, "", "pg_catalog.default"],
  [
    "UserInvite",
    "expiresAt",
    9,
    "timestamp(3) without time zone",
    true,
    "",
    "",
  ],
  [
    "UserInvite",
    "acceptedAt",
    10,
    "timestamp(3) without time zone",
    false,
    "",
    "",
  ],
  [
    "UserInvite",
    "acceptedByUserId",
    11,
    "text",
    false,
    "",
    "pg_catalog.default",
  ],
  [
    "UserInvite",
    "updatedAt",
    14,
    "timestamp(3) without time zone",
    true,
    "",
    "",
  ],
  ["UserInvite", "identityClaimRevision", 16, "integer", false, "", ""],
  [
    "UserInvite",
    "revokedAt",
    17,
    "timestamp(3) without time zone",
    false,
    "",
    "",
  ],
  [
    "UserInvite",
    "revokedByUserId",
    18,
    "text",
    false,
    "",
    "pg_catalog.default",
  ],
  [
    "IdentityEmailClaim",
    "emailCanonical",
    1,
    "character varying(320)",
    true,
    "",
    "pg_catalog.default",
  ],
  [
    "IdentityEmailClaim",
    "claimType",
    2,
    '"IdentityEmailClaimType"',
    true,
    "",
    "",
  ],
  [
    "IdentityEmailClaim",
    "tenantId",
    3,
    "text",
    true,
    "",
    "pg_catalog.default",
  ],
  [
    "IdentityEmailClaim",
    "subjectId",
    4,
    "text",
    true,
    "",
    "pg_catalog.default",
  ],
  ["IdentityEmailClaim", "revision", 5, "integer", true, "1", ""],
  [
    "IdentityEmailClaim",
    "createdAt",
    6,
    "timestamp(3) with time zone",
    true,
    "CURRENT_TIMESTAMP",
    "",
  ],
  [
    "IdentityEmailClaim",
    "updatedAt",
    7,
    "timestamp(3) with time zone",
    true,
    "CURRENT_TIMESTAMP",
    "",
  ],
]);

function expectedCatalogRelationValues() {
  return EXPECTED_CATALOG_RELATIONS.map(
    (relation) => `(${sqlLiteral(relation)})`,
  ).join(",\n    ");
}

function expectedCatalogColumnValues() {
  return EXPECTED_CATALOG_COLUMNS.map(
    ([
      relation,
      column,
      attnum,
      formattedType,
      required,
      defaultExpression,
      collation,
    ]) =>
      `(${[
        sqlLiteral(relation),
        sqlLiteral(column),
        attnum,
        sqlLiteral(formattedType),
        required ? "true" : "false",
        sqlLiteral(defaultExpression),
        sqlLiteral(collation),
      ].join(", ")})`,
  ).join(",\n    ");
}

const EXPECTED_CONSTRAINT_MANIFEST = Object.freeze([
  {
    name: "IdentityEmailClaim_email_canonical_check",
    relation: "IdentityEmailClaim",
    type: "c",
    definitionSha256:
      "4ec192429d64716e71f0b93a05da688e6398a281cbc1347b402fec74f886a7ad",
  },
  {
    name: "IdentityEmailClaim_pkey",
    relation: "IdentityEmailClaim",
    type: "p",
    definitionSha256:
      "c400cc9112859edd4590c2bc4842e74741f2bb278203421ff7efd093cddd7af7",
  },
  {
    name: "IdentityEmailClaim_revision_positive_check",
    relation: "IdentityEmailClaim",
    type: "c",
    definitionSha256:
      "4cf4a13f0fc7d141a050e21a7c3c95920b84dfcadd93c86a289b76746c17d9aa",
  },
  {
    name: "IdentityEmailClaim_subject_check",
    relation: "IdentityEmailClaim",
    type: "c",
    definitionSha256:
      "518d70febe8734ae03d750e213d962eba121dfe56e4ff1f4e85641af60ac5feb",
  },
  {
    name: "IdentityEmailClaim_tenantId_fkey",
    relation: "IdentityEmailClaim",
    type: "f",
    definitionSha256:
      "10c53f59767da1037868e70c34767641c6f2ea5cff4ad85c4249247201afdeba",
  },
  {
    name: "UserInvite_identity_claim_revision_positive_check",
    relation: "UserInvite",
    type: "c",
    definitionSha256:
      "bf585b411fd75eb8e01bbcf9b9235dddeb8535fac6f607dffefa412040914af8",
  },
  {
    name: "UserInvite_revokedByUserId_fkey",
    relation: "UserInvite",
    type: "f",
    definitionSha256:
      "cac4e5a4a95c65b5e245e5c24cac1de920bac356c986bcf362d9ff986e7e3acd",
  },
  {
    name: "UserInvite_revoked_actor_requires_timestamp_check",
    relation: "UserInvite",
    type: "c",
    definitionSha256:
      "48c1c84cc54278c402ff522365e5516d60c02fd53b27b04c74bfafd8ff3512f7",
  },
  {
    name: "UserInvite_revoked_unaccepted_check",
    relation: "UserInvite",
    type: "c",
    definitionSha256:
      "21b95e1b3299b4da070ae5f3425dcf6e11ffdf3b0b8c6ab47c8e3bd048493811",
  },
  {
    name: "User_identity_claim_revision_positive_check",
    relation: "User",
    type: "c",
    definitionSha256:
      "bf585b411fd75eb8e01bbcf9b9235dddeb8535fac6f607dffefa412040914af8",
  },
]);

const EXPECTED_INDEX_MANIFEST = Object.freeze([
  {
    name: "IdentityEmailClaim_pkey",
    relation: "IdentityEmailClaim",
    unique: true,
    primary: true,
    definitionSha256:
      "2026aac1de3ba521461084e10d3df6bc56c800febd8e6238b68396ef2b711a87",
  },
  {
    name: "UserInvite_revokedByUserId_idx",
    relation: "UserInvite",
    unique: false,
    primary: false,
    definitionSha256:
      "cb4348b3bca48d4bea3786e9899d620239bf56d6ed4852f5b66b66e6c67b222c",
  },
  {
    name: "identity_email_claim_email_change_subject_uidx",
    relation: "IdentityEmailClaim",
    unique: true,
    primary: false,
    definitionSha256:
      "56c50ff149b00e1e5491b8a2102e9de04417f274c5281e057c6e652c3816b0b0",
  },
  {
    name: "identity_email_claim_identity_subject_uidx",
    relation: "IdentityEmailClaim",
    unique: true,
    primary: false,
    definitionSha256:
      "8f05df9b20dc77d00be7074838cf3dd704adb9ec628f49d4ad44aa7f4cc7d0c1",
  },
  {
    name: "identity_email_claim_tenant_subject_idx",
    relation: "IdentityEmailClaim",
    unique: false,
    primary: false,
    definitionSha256:
      "a28ee7648f7cb56fe2ec878bd17cc1a3445bd3fc25140889e5e7274f62ed4203",
  },
  {
    name: "identity_email_claim_tenant_type_idx",
    relation: "IdentityEmailClaim",
    unique: false,
    primary: false,
    definitionSha256:
      "f0182db35a8410154693cdd1e15e4b7032da279060798dfc9f51fc1747c5f042",
  },
  {
    name: "user_identity_email_canonical_idx",
    relation: "User",
    unique: false,
    primary: false,
    definitionSha256:
      "5d4a146eee8150b9db4733d568b05b189d3d0d9180184db4f7ba7581fbfb1ac4",
  },
  {
    name: "user_invite_live_identity_email_canonical_idx",
    relation: "UserInvite",
    unique: false,
    primary: false,
    definitionSha256:
      "1a392dcffa38e24423101f309b3e5364b393ad8e259fa24ad1d924a61be03e6b",
  },
]);

const EXPECTED_FUNCTION_MANIFEST = Object.freeze([
  {
    name: "identity_email_claim_assert_invite_v1",
    identityArguments:
      "candidate_email text, expected_tenant_id text, expected_subject_id text, expected_revision integer",
    result: "jsonb",
    securityDefiner: true,
    definitionSha256:
      "960e4d44cde91a0729f8947e058b591320fcae1ce71cd36e861d0353ce21f447",
  },
  {
    name: "identity_email_claim_lock_v1",
    identityArguments: "candidate_email text",
    result: "text",
    securityDefiner: false,
    definitionSha256:
      "46207f959ee31fb4c8a14f2d07be89d4596d23416f2f4ece28c4657d56b6f884",
  },
  {
    name: "identity_email_claim_release_v1",
    identityArguments:
      "candidate_email text, expected_tenant_id text, expected_claim_type text, expected_subject_id text, expected_revision integer",
    result: "jsonb",
    securityDefiner: true,
    definitionSha256:
      "aa7c4bae396968aaf5437283099b9a834025fc1d09035b61988ee91e6a048380",
  },
  {
    name: "identity_email_claim_release_v2",
    identityArguments:
      "candidate_email text, expected_tenant_id text, expected_claim_type text, expected_subject_id text, expected_revision integer",
    result: "jsonb",
    securityDefiner: true,
    definitionSha256:
      "a96af60d375b544fded3369c154d6f230de1d4119e511806801675cdc9bd36cc",
  },
  {
    name: "identity_email_claim_reserve_invite_v1",
    identityArguments:
      "candidate_email text, requested_tenant_id text, requested_subject_id text",
    result: "jsonb",
    securityDefiner: true,
    definitionSha256:
      "dc9b37bd72906b32e04426e412568cb93d6a5038aaddc8a0ac690c3a2ac12d36",
  },
  {
    name: "identity_email_claim_reserve_invite_v2",
    identityArguments:
      "candidate_email text, requested_tenant_id text, requested_subject_id text",
    result: "jsonb",
    securityDefiner: true,
    definitionSha256:
      "7dda2617886062906bf3c0fc2c323b95728d86949a381e437d1c647f4675552a",
  },
  {
    name: "identity_email_claim_revision_guard_v1",
    identityArguments: "",
    result: "trigger",
    securityDefiner: false,
    definitionSha256:
      "f13eb0a1579dd42d9f3e3d7990dddbef1c51b205fed24a9240a7c9783373baab",
  },
  {
    name: "identity_email_claim_transition_v1",
    identityArguments:
      "candidate_email text, expected_tenant_id text, expected_claim_type text, expected_subject_id text, expected_revision integer, next_claim_type text, next_subject_id text",
    result: "jsonb",
    securityDefiner: true,
    definitionSha256:
      "00872f6f0648824f7fd1a7cf525a6b803adc5e552c0a6ac0d7d310ebf1db4cac",
  },
  {
    name: "identity_email_claim_transition_v2",
    identityArguments:
      "candidate_email text, expected_tenant_id text, expected_claim_type text, expected_subject_id text, expected_revision integer, next_claim_type text, next_subject_id text",
    result: "jsonb",
    securityDefiner: true,
    definitionSha256:
      "f2495241681f4dd8be6ca2b36dbd0d487e104e18a2712422f3da5f435f597f62",
  },
]);

const EXPECTED_TRIGGER_MANIFEST = Object.freeze([
  {
    name: "IdentityEmailClaim_revision_guard_trigger",
    relation: "IdentityEmailClaim",
    functionName: "identity_email_claim_revision_guard_v1",
    definitionSha256:
      "388dcc06ff27451656b844d302b4a536f7720062f470f0c2b8befd884be9c6a7",
  },
]);

const EXPECTED_RI_TRIGGER_MANIFEST = Object.freeze([
  {
    constraintName: "IdentityEmailClaim_tenantId_fkey",
    constraintRelation: "IdentityEmailClaim",
    triggerRelation: "IdentityEmailClaim",
    constraintPeerRelation: "Tenant",
    functionName: "RI_FKey_check_ins",
    triggerType: 5,
  },
  {
    constraintName: "IdentityEmailClaim_tenantId_fkey",
    constraintRelation: "IdentityEmailClaim",
    triggerRelation: "IdentityEmailClaim",
    constraintPeerRelation: "Tenant",
    functionName: "RI_FKey_check_upd",
    triggerType: 17,
  },
  {
    constraintName: "IdentityEmailClaim_tenantId_fkey",
    constraintRelation: "IdentityEmailClaim",
    triggerRelation: "Tenant",
    constraintPeerRelation: "IdentityEmailClaim",
    functionName: "RI_FKey_restrict_del",
    triggerType: 9,
  },
  {
    constraintName: "IdentityEmailClaim_tenantId_fkey",
    constraintRelation: "IdentityEmailClaim",
    triggerRelation: "Tenant",
    constraintPeerRelation: "IdentityEmailClaim",
    functionName: "RI_FKey_restrict_upd",
    triggerType: 17,
  },
  {
    constraintName: "UserInvite_revokedByUserId_fkey",
    constraintRelation: "UserInvite",
    triggerRelation: "User",
    constraintPeerRelation: "UserInvite",
    functionName: "RI_FKey_setnull_del",
    triggerType: 9,
  },
  {
    constraintName: "UserInvite_revokedByUserId_fkey",
    constraintRelation: "UserInvite",
    triggerRelation: "User",
    constraintPeerRelation: "UserInvite",
    functionName: "RI_FKey_cascade_upd",
    triggerType: 17,
  },
  {
    constraintName: "UserInvite_revokedByUserId_fkey",
    constraintRelation: "UserInvite",
    triggerRelation: "UserInvite",
    constraintPeerRelation: "User",
    functionName: "RI_FKey_check_ins",
    triggerType: 5,
  },
  {
    constraintName: "UserInvite_revokedByUserId_fkey",
    constraintRelation: "UserInvite",
    triggerRelation: "UserInvite",
    constraintPeerRelation: "User",
    functionName: "RI_FKey_check_upd",
    triggerType: 17,
  },
]);

function expectedConstraintValues() {
  return EXPECTED_CONSTRAINT_MANIFEST.map((entry) =>
    `(${[
      sqlLiteral(entry.name),
      sqlLiteral(entry.relation),
      sqlLiteral(entry.type),
      sqlLiteral(entry.definitionSha256),
    ].join(", ")})`,
  ).join(",\n    ");
}

function expectedIndexValues() {
  return EXPECTED_INDEX_MANIFEST.map((entry) =>
    `(${[
      sqlLiteral(entry.name),
      sqlLiteral(entry.relation),
      entry.unique ? "true" : "false",
      entry.primary ? "true" : "false",
      sqlLiteral(entry.definitionSha256),
    ].join(", ")})`,
  ).join(",\n    ");
}

function expectedFunctionValues() {
  return EXPECTED_FUNCTION_MANIFEST.map((entry) =>
    `(${[
      sqlLiteral(entry.name),
      sqlLiteral(entry.identityArguments),
      sqlLiteral(entry.result),
      entry.securityDefiner ? "true" : "false",
      sqlLiteral(entry.definitionSha256),
    ].join(", ")})`,
  ).join(",\n    ");
}

function expectedTriggerValues() {
  return EXPECTED_TRIGGER_MANIFEST.map((entry) =>
    `(${[
      sqlLiteral(entry.name),
      sqlLiteral(entry.relation),
      sqlLiteral(entry.functionName),
      sqlLiteral(entry.definitionSha256),
    ].join(", ")})`,
  ).join(",\n    ");
}

function expectedRiTriggerValues() {
  return EXPECTED_RI_TRIGGER_MANIFEST.map((entry) =>
    `(${[
      sqlLiteral(entry.constraintName),
      sqlLiteral(entry.constraintRelation),
      sqlLiteral(entry.triggerRelation),
      sqlLiteral(entry.constraintPeerRelation),
      sqlLiteral(entry.functionName),
      entry.triggerType,
    ].join(", ")})`,
  ).join(",\n    ");
}

export const SNAPSHOT_STATE_SQL = `
SELECT
  transaction_timestamp() AS generated_at,
  current_schema()::text AS current_schema,
  current_database()::text AS current_database,
  current_user::text AS current_role,
  session_user::text AS session_role,
  control.system_identifier::text AS cluster_system_identifier,
  database_row.oid::text AS database_oid,
  current_setting('server_version_num')::text AS server_version_num,
  COALESCE(transport_row.ssl, false) AS transport_encrypted
FROM pg_catalog.pg_control_system() AS control
JOIN pg_catalog.pg_database AS database_row
  ON database_row.datname = current_database()
LEFT JOIN pg_catalog.pg_stat_ssl AS transport_row
  ON transport_row.pid = pg_catalog.pg_backend_pid()
`.trim();

export const APPLIED_MIGRATION_STATE_SQL = `
SELECT
  "migration_name"::text AS migration_name,
  "finished_at" AS finished_at,
  "rolled_back_at" AS rolled_back_at
FROM public."_prisma_migrations"
ORDER BY "migration_name"
`.trim();

export const CATALOG_STATE_SQL = `
WITH
  expected_relation(relation_name) AS (
    VALUES
    ${expectedCatalogRelationValues()}
  ),
  expected_column(
    relation_name,
    column_name,
    attribute_number,
    formatted_type,
    required_not_null,
    default_expression,
    collation_name
  ) AS (
    VALUES
    ${expectedCatalogColumnValues()}
  ),
  expected_constraint(
    object_name,
    relation_name,
    constraint_type,
    definition_sha256
  ) AS (
    VALUES
    ${expectedConstraintValues()}
  ),
  expected_index(
    object_name,
    relation_name,
    required_unique,
    required_primary,
    definition_sha256
  ) AS (
    VALUES
    ${expectedIndexValues()}
  ),
  expected_function(
    object_name,
    identity_arguments,
    result_type,
    security_definer,
    definition_sha256
  ) AS (
    VALUES
    ${expectedFunctionValues()}
  ),
  expected_trigger(
    object_name,
    relation_name,
    function_name,
    definition_sha256
  ) AS (
    VALUES
    ${expectedTriggerValues()}
  ),
  expected_ri_trigger(
    constraint_name,
    constraint_relation_name,
    trigger_relation_name,
    constraint_peer_relation_name,
    function_name,
    trigger_type
  ) AS (
    VALUES
    ${expectedRiTriggerValues()}
  ),
  expected_enum(enum_label, sort_order) AS (
    VALUES
      ('INVITE', 1::real),
      ('USER', 2::real),
      ('EMAIL_CHANGE', 3::real)
  ),
  actual_column AS (
    SELECT
      relation_row.relname AS relation_name,
      attribute_row.attname AS column_name,
      attribute_row.attnum::integer AS attribute_number,
      pg_catalog.format_type(
        attribute_row.atttypid,
        attribute_row.atttypmod
      ) AS formatted_type,
      attribute_row.attnotnull AS is_not_null,
      COALESCE(
        pg_catalog.pg_get_expr(
          default_row.adbin,
          default_row.adrelid,
          true
        ),
        ''
      ) AS default_expression,
      CASE
        WHEN attribute_row.attcollation = 0 THEN ''
        ELSE collation_namespace.nspname || '.' || collation_row.collname
      END AS collation_name,
      attribute_row.attidentity::text AS identity_kind,
      attribute_row.attgenerated::text AS generated_kind,
      attribute_row.attislocal AS is_local,
      attribute_row.attinhcount::integer AS inherited_count
    FROM pg_catalog.pg_class AS relation_row
    JOIN pg_catalog.pg_namespace AS namespace_row
      ON namespace_row.oid = relation_row.relnamespace
    JOIN pg_catalog.pg_attribute AS attribute_row
      ON attribute_row.attrelid = relation_row.oid
     AND attribute_row.attnum > 0
     AND NOT attribute_row.attisdropped
    LEFT JOIN pg_catalog.pg_attrdef AS default_row
      ON default_row.adrelid = attribute_row.attrelid
     AND default_row.adnum = attribute_row.attnum
    LEFT JOIN pg_catalog.pg_collation AS collation_row
      ON collation_row.oid = attribute_row.attcollation
    LEFT JOIN pg_catalog.pg_namespace AS collation_namespace
      ON collation_namespace.oid = collation_row.collnamespace
    WHERE namespace_row.nspname = 'public'
      AND relation_row.relkind = 'r'
  )
SELECT
  (
    SELECT COUNT(*)::text
    FROM expected_relation
  ) AS expected_relation_count,
  (
    SELECT COUNT(*)::text
    FROM expected_relation AS expected
    JOIN pg_catalog.pg_class AS relation_row
      ON relation_row.relname = expected.relation_name
     AND relation_row.relnamespace = 'public'::regnamespace
     AND relation_row.relkind = 'r'
     AND relation_row.relpersistence = 'p'
     AND NOT relation_row.relispartition
     AND NOT relation_row.relrowsecurity
     AND NOT relation_row.relforcerowsecurity
     AND relation_row.relreplident = 'd'
    JOIN pg_catalog.pg_am AS access_method
      ON access_method.oid = relation_row.relam
     AND access_method.amname = 'heap'
  ) AS matched_relation_count,
  (
    SELECT COUNT(*)::text
    FROM expected_column
  ) AS expected_column_count,
  (
    SELECT COUNT(*)::text
    FROM expected_column AS expected
    JOIN actual_column AS actual
      ON actual.relation_name = expected.relation_name
     AND actual.column_name = expected.column_name
     AND actual.attribute_number = expected.attribute_number
     AND actual.formatted_type = expected.formatted_type
     AND actual.is_not_null = expected.required_not_null
     AND actual.default_expression = expected.default_expression
     AND actual.collation_name = expected.collation_name
     AND actual.identity_kind = ''
     AND actual.generated_kind = ''
     AND actual.is_local
     AND actual.inherited_count = 0
  ) AS matched_column_count,
  (
    SELECT COUNT(*)::text
    FROM expected_constraint AS expected
    JOIN pg_catalog.pg_constraint AS constraint_row
      ON constraint_row.conname = expected.object_name
     AND constraint_row.connamespace = 'public'::regnamespace
     AND constraint_row.contype::text = expected.constraint_type
     AND constraint_row.convalidated
     AND NOT constraint_row.condeferrable
     AND NOT constraint_row.condeferred
     AND constraint_row.connoinherit =
       (expected.constraint_type IN ('p', 'f'))
    JOIN pg_catalog.pg_class AS relation_row
      ON relation_row.oid = constraint_row.conrelid
     AND relation_row.relnamespace = 'public'::regnamespace
     AND relation_row.relname = expected.relation_name
    WHERE pg_catalog.encode(
      pg_catalog.sha256(
        pg_catalog.convert_to(
          pg_catalog.pg_get_constraintdef(constraint_row.oid, true),
          'UTF8'
        )
      ),
      'hex'
    ) = expected.definition_sha256
  ) AS matched_constraint_count,
  (
    SELECT COUNT(*)::text
    FROM pg_catalog.pg_constraint AS constraint_row
    WHERE constraint_row.connamespace = 'public'::regnamespace
      AND constraint_row.conname = ANY(
        ${sqlTextArray(EXPECTED_CONSTRAINT_MANIFEST.map((entry) => entry.name))}
      )
  ) AS actual_constraint_count,
  (
    SELECT COUNT(*)::text
    FROM expected_index AS expected
    JOIN pg_catalog.pg_class AS index_row
      ON index_row.relname = expected.object_name
     AND index_row.relnamespace = 'public'::regnamespace
     AND index_row.relkind = 'i'
    JOIN pg_catalog.pg_index AS index_state
      ON index_state.indexrelid = index_row.oid
     AND index_state.indisvalid
     AND index_state.indisready
     AND index_state.indislive
     AND index_state.indimmediate
     AND NOT index_state.indisexclusion
     AND index_state.indisunique = expected.required_unique
     AND index_state.indisprimary = expected.required_primary
    JOIN pg_catalog.pg_class AS relation_row
      ON relation_row.oid = index_state.indrelid
     AND relation_row.relnamespace = 'public'::regnamespace
     AND relation_row.relname = expected.relation_name
    WHERE pg_catalog.encode(
      pg_catalog.sha256(
        pg_catalog.convert_to(
          pg_catalog.pg_get_indexdef(index_row.oid),
          'UTF8'
        )
      ),
      'hex'
    ) = expected.definition_sha256
  ) AS matched_index_count,
  (
    SELECT COUNT(*)::text
    FROM pg_catalog.pg_class AS index_row
    WHERE index_row.relnamespace = 'public'::regnamespace
      AND index_row.relkind = 'i'
      AND index_row.relname = ANY(
        ${sqlTextArray(EXPECTED_INDEX_MANIFEST.map((entry) => entry.name))}
      )
  ) AS actual_index_count,
  (
    SELECT COUNT(*)::text
    FROM expected_function AS expected
    JOIN pg_catalog.pg_proc AS function_row
      ON function_row.proname = expected.object_name
     AND function_row.pronamespace = 'public'::regnamespace
     AND pg_catalog.pg_get_function_identity_arguments(function_row.oid) =
       expected.identity_arguments
     AND pg_catalog.pg_get_function_result(function_row.oid) =
       expected.result_type
     AND function_row.prokind = 'f'
     AND function_row.prosecdef = expected.security_definer
     AND function_row.provolatile = 'v'
     AND NOT function_row.proisstrict
     AND NOT function_row.proleakproof
     AND NOT function_row.proretset
     AND function_row.pronargdefaults = 0
     AND function_row.provariadic = 0
     AND function_row.proparallel = 'u'
     AND function_row.proconfig =
       ARRAY['search_path=pg_catalog']::text[]
     AND function_row.proowner = (
       SELECT database_row.datdba
       FROM pg_catalog.pg_database AS database_row
       WHERE database_row.datname = current_database()
     )
    JOIN pg_catalog.pg_language AS language_row
      ON language_row.oid = function_row.prolang
     AND language_row.lanname = 'plpgsql'
    WHERE pg_catalog.encode(
      pg_catalog.sha256(
        pg_catalog.convert_to(
          pg_catalog.pg_get_functiondef(function_row.oid),
          'UTF8'
        )
      ),
      'hex'
    ) = expected.definition_sha256
  ) AS matched_function_count,
  (
    SELECT COUNT(*)::text
    FROM pg_catalog.pg_proc AS function_row
    WHERE function_row.pronamespace = 'public'::regnamespace
      AND function_row.proname = ANY(
        ${sqlTextArray(EXPECTED_FUNCTION_MANIFEST.map((entry) => entry.name))}
      )
  ) AS actual_function_count,
  (
    SELECT COUNT(*)::text
    FROM expected_enum AS expected
    JOIN pg_catalog.pg_enum AS enum_row
      ON enum_row.enumlabel = expected.enum_label
     AND enum_row.enumsortorder = expected.sort_order
    JOIN pg_catalog.pg_type AS type_row
      ON type_row.oid = enum_row.enumtypid
    WHERE type_row.typnamespace = 'public'::regnamespace
      AND type_row.typname = 'IdentityEmailClaimType'
      AND type_row.typowner = (
        SELECT database_row.datdba
        FROM pg_catalog.pg_database AS database_row
        WHERE database_row.datname = current_database()
      )
  ) AS matched_enum_label_count,
  (
    SELECT COUNT(*)::text
    FROM pg_catalog.pg_enum AS enum_row
    JOIN pg_catalog.pg_type AS type_row
      ON type_row.oid = enum_row.enumtypid
    WHERE type_row.typnamespace = 'public'::regnamespace
      AND type_row.typname = 'IdentityEmailClaimType'
  ) AS total_enum_label_count,
  (
    SELECT COUNT(*)::text
    FROM expected_trigger AS expected
    JOIN pg_catalog.pg_trigger AS trigger_row
      ON trigger_row.tgname = expected.object_name
    JOIN pg_catalog.pg_class AS relation_row
      ON relation_row.oid = trigger_row.tgrelid
     AND relation_row.relnamespace = 'public'::regnamespace
     AND relation_row.relname = expected.relation_name
    JOIN pg_catalog.pg_proc AS function_row
      ON function_row.oid = trigger_row.tgfoid
     AND function_row.pronamespace = 'public'::regnamespace
     AND function_row.proname = expected.function_name
     AND pg_catalog.pg_get_function_identity_arguments(function_row.oid) = ''
    WHERE NOT trigger_row.tgisinternal
      AND trigger_row.tgenabled = 'O'
      AND trigger_row.tgtype = 23
      AND trigger_row.tgnargs = 0
      AND trigger_row.tgqual IS NULL
      AND trigger_row.tgconstraint = 0
      AND trigger_row.tgconstrrelid = 0
      AND pg_catalog.encode(
        pg_catalog.sha256(
          pg_catalog.convert_to(
            pg_catalog.pg_get_triggerdef(trigger_row.oid, true),
            'UTF8'
          )
        ),
        'hex'
      ) = expected.definition_sha256
  ) AS matched_trigger_count,
  (
    SELECT COUNT(*)::text
    FROM pg_catalog.pg_trigger AS trigger_row
    JOIN pg_catalog.pg_class AS relation_row
      ON relation_row.oid = trigger_row.tgrelid
    WHERE relation_row.relnamespace = 'public'::regnamespace
      AND relation_row.relname = 'IdentityEmailClaim'
      AND NOT trigger_row.tgisinternal
  ) AS actual_identity_claim_trigger_count,
  (
    SELECT COUNT(*)::text
    FROM expected_ri_trigger AS expected
    JOIN pg_catalog.pg_constraint AS constraint_row
      ON constraint_row.conname = expected.constraint_name
     AND constraint_row.connamespace = 'public'::regnamespace
     AND constraint_row.contype = 'f'
    JOIN pg_catalog.pg_class AS constraint_relation
      ON constraint_relation.oid = constraint_row.conrelid
     AND constraint_relation.relnamespace = 'public'::regnamespace
     AND constraint_relation.relname = expected.constraint_relation_name
    JOIN pg_catalog.pg_trigger AS trigger_row
      ON trigger_row.tgconstraint = constraint_row.oid
     AND trigger_row.tgisinternal
     AND trigger_row.tgenabled = 'O'
     AND trigger_row.tgtype = expected.trigger_type
     AND trigger_row.tgnargs = 0
     AND trigger_row.tgqual IS NULL
     AND trigger_row.tgconstrindid = constraint_row.conindid
     AND NOT trigger_row.tgdeferrable
     AND NOT trigger_row.tginitdeferred
    JOIN pg_catalog.pg_class AS trigger_relation
      ON trigger_relation.oid = trigger_row.tgrelid
     AND trigger_relation.relnamespace = 'public'::regnamespace
     AND trigger_relation.relname = expected.trigger_relation_name
    JOIN pg_catalog.pg_class AS constraint_peer_relation
      ON constraint_peer_relation.oid = trigger_row.tgconstrrelid
     AND constraint_peer_relation.relnamespace = 'public'::regnamespace
     AND constraint_peer_relation.relname =
       expected.constraint_peer_relation_name
    JOIN pg_catalog.pg_proc AS function_row
      ON function_row.oid = trigger_row.tgfoid
     AND function_row.pronamespace = 'pg_catalog'::regnamespace
     AND function_row.proname = expected.function_name
     AND pg_catalog.pg_get_function_identity_arguments(function_row.oid) = ''
  ) AS matched_ri_trigger_count,
  (
    SELECT COUNT(*)::text
    FROM pg_catalog.pg_constraint AS constraint_row
    JOIN pg_catalog.pg_class AS constraint_relation
      ON constraint_relation.oid = constraint_row.conrelid
     AND constraint_relation.relnamespace = 'public'::regnamespace
    JOIN pg_catalog.pg_trigger AS trigger_row
      ON trigger_row.tgconstraint = constraint_row.oid
     AND trigger_row.tgisinternal
    WHERE (constraint_row.conname, constraint_relation.relname) IN (
      SELECT DISTINCT
        expected.constraint_name,
        expected.constraint_relation_name
      FROM expected_ri_trigger AS expected
    )
  ) AS actual_ri_trigger_count
`.trim();

export const PRIVILEGE_STATE_SQL = `
WITH
  expected_relation(relation_name) AS (
    VALUES
    ${requiredRelationValues()}
  ),
  expected_column(relation_name, column_name) AS (
    VALUES
    ${requiredColumnValues()}
  ),
  current_role_row AS (
    SELECT role_row.*
    FROM pg_catalog.pg_roles AS role_row
    WHERE role_row.rolname = current_user
  ),
  public_schema_row AS (
    SELECT namespace_row.*
    FROM pg_catalog.pg_namespace AS namespace_row
    WHERE namespace_row.nspname = 'public'
  ),
  user_namespace AS (
    SELECT namespace_row.*
    FROM pg_catalog.pg_namespace AS namespace_row
    WHERE namespace_row.nspname NOT IN ('pg_catalog', 'information_schema')
      AND namespace_row.nspname !~ '^pg_(?:toast|temp)'
  ),
  system_namespace AS (
    SELECT namespace_row.*
    FROM pg_catalog.pg_namespace AS namespace_row
    WHERE namespace_row.nspname IN ('pg_catalog', 'information_schema')
       OR namespace_row.nspname ~ '^pg_(?:toast|temp)'
  ),
  user_relation AS (
    SELECT
      relation_row.oid,
      relation_row.relowner,
      relation_row.relacl,
      relation_row.relkind,
      namespace_row.nspname AS schema_name,
      relation_row.relname AS relation_name,
      relation_row.relrowsecurity,
      relation_row.relforcerowsecurity
    FROM pg_catalog.pg_class AS relation_row
    JOIN user_namespace AS namespace_row
      ON namespace_row.oid = relation_row.relnamespace
    WHERE relation_row.relkind IN ('r', 'p', 'v', 'm', 'f')
  ),
  required_relation_state AS (
    SELECT
      expected.relation_name,
      relation_row.oid,
      relation_row.relrowsecurity,
      relation_row.relforcerowsecurity
    FROM expected_relation AS expected
    LEFT JOIN user_relation AS relation_row
      ON relation_row.schema_name = 'public'
     AND relation_row.relation_name = expected.relation_name
  ),
  all_user_column AS (
    SELECT
      relation_row.oid AS relation_oid,
      relation_row.schema_name,
      relation_row.relation_name,
      attribute_row.attnum,
      attribute_row.attname AS column_name,
      attribute_row.attacl
    FROM user_relation AS relation_row
    JOIN pg_catalog.pg_attribute AS attribute_row
      ON attribute_row.attrelid = relation_row.oid
     AND attribute_row.attnum > 0
     AND NOT attribute_row.attisdropped
  ),
  required_column_state AS (
    SELECT
      expected.relation_name,
      expected.column_name,
      relation_row.oid AS relation_oid,
      column_row.attnum
    FROM expected_column AS expected
    LEFT JOIN user_relation AS relation_row
      ON relation_row.schema_name = 'public'
     AND relation_row.relation_name = expected.relation_name
    LEFT JOIN pg_catalog.pg_attribute AS column_row
      ON column_row.attrelid = relation_row.oid
     AND column_row.attname = expected.column_name
     AND column_row.attnum > 0
     AND NOT column_row.attisdropped
  ),
  user_sequence AS (
    SELECT relation_row.oid, relation_row.relowner
    FROM pg_catalog.pg_class AS relation_row
    JOIN user_namespace AS namespace_row
      ON namespace_row.oid = relation_row.relnamespace
    WHERE relation_row.relkind = 'S'
  ),
  user_function AS (
    SELECT function_row.oid, function_row.proowner
    FROM pg_catalog.pg_proc AS function_row
    JOIN user_namespace AS namespace_row
      ON namespace_row.oid = function_row.pronamespace
  ),
  user_type AS (
    SELECT type_row.oid, type_row.typowner
    FROM pg_catalog.pg_type AS type_row
    JOIN user_namespace AS namespace_row
      ON namespace_row.oid = type_row.typnamespace
    WHERE type_row.typisdefined
  )
SELECT
  (current_user = session_user) AS session_role_unchanged,
  (current_setting('transaction_read_only') = 'on') AS transaction_read_only,
  (
    current_setting('transaction_isolation') = 'repeatable read'
  ) AS repeatable_read,
  COALESCE((SELECT rolcanlogin FROM current_role_row), false)
    AS role_can_login,
  COALESCE((SELECT rolinherit FROM current_role_row), true)
    AS role_inherits,
  COALESCE((SELECT rolsuper FROM current_role_row), true)
    AS role_superuser,
  COALESCE((SELECT rolcreaterole FROM current_role_row), true)
    AS role_can_create_role,
  COALESCE((SELECT rolcreatedb FROM current_role_row), true)
    AS role_can_create_database,
  COALESCE((SELECT rolreplication FROM current_role_row), true)
    AS role_replication,
  COALESCE((SELECT rolbypassrls FROM current_role_row), true)
    AS role_bypass_rls,
  EXISTS (
    SELECT 1
    FROM pg_catalog.pg_database AS database_row
    WHERE database_row.datname = current_database()
      AND database_row.datdba = (SELECT oid FROM current_role_row)
  ) AS database_owner,
  EXISTS (
    SELECT 1
    FROM public_schema_row AS schema_row
    WHERE schema_row.nspowner = (SELECT oid FROM current_role_row)
  ) AS public_schema_owner,
  has_database_privilege(current_user, current_database(), 'CONNECT')
    AS current_database_connect_privilege,
  has_database_privilege(
    current_user,
    current_database(),
    'CONNECT WITH GRANT OPTION'
  ) AS current_database_connect_grant_option,
  has_database_privilege(current_user, current_database(), 'CREATE')
    AS database_create_privilege,
  has_database_privilege(current_user, current_database(), 'TEMP')
    AS database_temp_privilege,
  has_schema_privilege(current_user, 'public', 'USAGE')
    AS public_schema_usage_privilege,
  has_schema_privilege(
    current_user,
    'public',
    'USAGE WITH GRANT OPTION'
  ) AS public_schema_usage_grant_option,
  has_schema_privilege(current_user, 'public', 'CREATE')
    AS public_schema_create_privilege,
  (
    SELECT COUNT(*)::text
    FROM pg_catalog.pg_auth_members AS membership
    WHERE membership.member = (SELECT oid FROM current_role_row)
       OR membership.roleid = (SELECT oid FROM current_role_row)
  ) AS role_membership_count,
  (
    SELECT COUNT(*)::text
    FROM pg_catalog.pg_database AS database_row
    WHERE database_row.datdba = (SELECT oid FROM current_role_row)
  ) AS owned_database_count,
  (
    SELECT COUNT(*)::text
    FROM user_namespace AS namespace_row
    WHERE namespace_row.nspowner = (SELECT oid FROM current_role_row)
  ) AS owned_schema_count,
  (
    SELECT COUNT(*)::text
    FROM user_relation AS relation_row
    WHERE relation_row.relowner = (SELECT oid FROM current_role_row)
  ) AS owned_relation_count,
  (
    SELECT COUNT(*)::text
    FROM user_function AS function_row
    WHERE function_row.proowner = (SELECT oid FROM current_role_row)
  ) AS owned_function_count,
  (
    SELECT COUNT(*)::text
    FROM user_type AS type_row
    WHERE type_row.typowner = (SELECT oid FROM current_role_row)
  ) AS owned_type_count,
  (
    SELECT COUNT(*)::text
    FROM pg_catalog.pg_shdepend AS dependency_row
    WHERE dependency_row.refclassid = 'pg_catalog.pg_authid'::regclass
      AND dependency_row.refobjid = (SELECT oid FROM current_role_row)
      AND dependency_row.deptype = 'o'
      AND dependency_row.dbid IN (
        0,
        (
          SELECT database_row.oid
          FROM pg_catalog.pg_database AS database_row
          WHERE database_row.datname = current_database()
        )
      )
  ) AS ownership_dependency_count,
  (
    SELECT COUNT(*)::text
    FROM pg_catalog.pg_database AS database_row
    WHERE database_row.datname <> current_database()
      AND database_row.datallowconn
      AND has_database_privilege(
        current_user,
        database_row.oid,
        'CONNECT'
      )
  ) AS other_database_connect_count,
  (
    SELECT COUNT(*)::text
    FROM pg_catalog.pg_database AS database_row
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      database_row.datacl
    ) AS privilege_row
    WHERE database_row.datname <> current_database()
      AND privilege_row.grantee = (SELECT oid FROM current_role_row)
      AND privilege_row.privilege_type = 'CONNECT'
  ) AS explicit_other_database_connect_count,
  (
    SELECT COUNT(*)::text
    FROM user_namespace AS namespace_row
    WHERE namespace_row.nspname <> 'public'
      AND has_schema_privilege(current_user, namespace_row.oid, 'USAGE')
  ) AS non_public_schema_usage_count,
  (
    SELECT COUNT(*)::text
    FROM user_namespace AS namespace_row
    WHERE namespace_row.nspname <> 'public'
      AND has_schema_privilege(current_user, namespace_row.oid, 'CREATE')
  ) AS non_public_schema_create_count,
  (
    SELECT COUNT(*)::text
    FROM system_namespace AS namespace_row
    WHERE has_schema_privilege(current_user, namespace_row.oid, 'CREATE')
  ) AS system_schema_create_count,
  (
    SELECT COUNT(*)::text
    FROM system_namespace AS namespace_row
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      namespace_row.nspacl
    ) AS privilege_row
    WHERE privilege_row.grantee = (SELECT oid FROM current_role_row)
       OR (
         privilege_row.grantee = 0
         AND (
           (
             namespace_row.nspname = 'pg_catalog'
             AND NOT EXISTS (
               SELECT 1
               FROM pg_catalog.pg_init_privs AS initial_row
               CROSS JOIN LATERAL pg_catalog.aclexplode(
                 initial_row.initprivs
               ) AS initial_privilege
               WHERE initial_row.classoid =
                 'pg_catalog.pg_namespace'::regclass
                 AND initial_row.objoid = namespace_row.oid
                 AND initial_row.objsubid = 0
                 AND initial_privilege.grantee = privilege_row.grantee
                 AND initial_privilege.grantor = privilege_row.grantor
                 AND initial_privilege.privilege_type =
                   privilege_row.privilege_type
                 AND initial_privilege.is_grantable =
                   privilege_row.is_grantable
             )
           )
           OR (
             namespace_row.nspname = 'information_schema'
             AND (
               namespace_row.oid >= 16384
               OR privilege_row.privilege_type <> 'USAGE'
               OR privilege_row.is_grantable
             )
           )
           OR namespace_row.nspname NOT IN (
             'pg_catalog',
             'information_schema'
           )
         )
       )
  ) AS system_schema_privilege_count,
  (
    SELECT COUNT(*)::text
    FROM (
      SELECT privilege_row.privilege_type
      FROM pg_catalog.pg_class AS relation_row
      JOIN system_namespace AS namespace_row
        ON namespace_row.oid = relation_row.relnamespace
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        relation_row.relacl
      ) AS privilege_row
      WHERE privilege_row.grantee = (SELECT oid FROM current_role_row)
         OR (
           privilege_row.grantee = 0
           AND (
             (
               namespace_row.nspname = 'pg_catalog'
               AND NOT EXISTS (
                 SELECT 1
                 FROM pg_catalog.pg_init_privs AS initial_row
                 CROSS JOIN LATERAL pg_catalog.aclexplode(
                   initial_row.initprivs
                 ) AS initial_privilege
                 WHERE initial_row.classoid = 'pg_catalog.pg_class'::regclass
                   AND initial_row.objoid = relation_row.oid
                   AND initial_row.objsubid = 0
                   AND initial_privilege.grantee = privilege_row.grantee
                   AND initial_privilege.grantor = privilege_row.grantor
                   AND initial_privilege.privilege_type =
                     privilege_row.privilege_type
                   AND initial_privilege.is_grantable =
                     privilege_row.is_grantable
               )
             )
             OR (
               namespace_row.nspname = 'information_schema'
               AND (
                 relation_row.oid >= 16384
                 OR privilege_row.privilege_type <> 'SELECT'
                 OR privilege_row.is_grantable
               )
             )
             OR namespace_row.nspname NOT IN (
               'pg_catalog',
               'information_schema'
             )
           )
         )

      UNION ALL

      SELECT privilege_row.privilege_type
      FROM pg_catalog.pg_attribute AS attribute_row
      JOIN pg_catalog.pg_class AS relation_row
        ON relation_row.oid = attribute_row.attrelid
      JOIN system_namespace AS namespace_row
        ON namespace_row.oid = relation_row.relnamespace
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        attribute_row.attacl
      ) AS privilege_row
      WHERE attribute_row.attnum > 0
        AND NOT attribute_row.attisdropped
        AND (
          privilege_row.grantee = (SELECT oid FROM current_role_row)
          OR (
            privilege_row.grantee = 0
            AND (
              (
                namespace_row.nspname = 'pg_catalog'
                AND NOT EXISTS (
                  SELECT 1
                  FROM pg_catalog.pg_init_privs AS initial_row
                  CROSS JOIN LATERAL pg_catalog.aclexplode(
                    initial_row.initprivs
                  ) AS initial_privilege
                  WHERE initial_row.classoid = 'pg_catalog.pg_class'::regclass
                    AND initial_row.objoid = relation_row.oid
                    AND initial_row.objsubid = attribute_row.attnum
                    AND initial_privilege.grantee = privilege_row.grantee
                    AND initial_privilege.grantor = privilege_row.grantor
                    AND initial_privilege.privilege_type =
                      privilege_row.privilege_type
                    AND initial_privilege.is_grantable =
                      privilege_row.is_grantable
                )
              )
              OR (
                namespace_row.nspname = 'information_schema'
                AND (
                  relation_row.oid >= 16384
                  OR privilege_row.privilege_type <> 'SELECT'
                  OR privilege_row.is_grantable
                )
              )
              OR namespace_row.nspname NOT IN (
                'pg_catalog',
                'information_schema'
              )
            )
          )
        )

      UNION ALL

      SELECT privilege_row.privilege_type
      FROM pg_catalog.pg_proc AS function_row
      JOIN system_namespace AS namespace_row
        ON namespace_row.oid = function_row.pronamespace
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        function_row.proacl
      ) AS privilege_row
      WHERE privilege_row.grantee = (SELECT oid FROM current_role_row)
         OR (
           privilege_row.grantee = 0
           AND (
             (
               namespace_row.nspname = 'pg_catalog'
               AND NOT EXISTS (
                 SELECT 1
                 FROM pg_catalog.pg_init_privs AS initial_row
                 CROSS JOIN LATERAL pg_catalog.aclexplode(
                   initial_row.initprivs
                 ) AS initial_privilege
                 WHERE initial_row.classoid = 'pg_catalog.pg_proc'::regclass
                   AND initial_row.objoid = function_row.oid
                   AND initial_row.objsubid = 0
                   AND initial_privilege.grantee = privilege_row.grantee
                   AND initial_privilege.grantor = privilege_row.grantor
                   AND initial_privilege.privilege_type =
                     privilege_row.privilege_type
                   AND initial_privilege.is_grantable =
                     privilege_row.is_grantable
               )
             )
             OR namespace_row.nspname <> 'pg_catalog'
           )
         )
    ) AS disallowed_privilege
  ) AS system_object_privilege_count,
  (
    SELECT COUNT(*)::text
    FROM pg_catalog.pg_proc AS function_row
    JOIN system_namespace AS namespace_row
      ON namespace_row.oid = function_row.pronamespace
    WHERE function_row.prosecdef
      AND has_function_privilege(
        current_user,
        function_row.oid,
        'EXECUTE'
      )
  ) AS system_security_definer_function_count,
  (
    SELECT COUNT(*)::text
    FROM pg_catalog.pg_proc AS function_row
    JOIN system_namespace AS namespace_row
      ON namespace_row.oid = function_row.pronamespace
    WHERE function_row.oid >= 16384
      AND has_function_privilege(
        current_user,
        function_row.oid,
        'EXECUTE'
      )
  ) AS system_high_oid_executable_function_count,
  (
    SELECT COUNT(*)::text
    FROM user_relation AS relation_row
    WHERE has_table_privilege(current_user, relation_row.oid, 'INSERT')
       OR has_table_privilege(current_user, relation_row.oid, 'UPDATE')
       OR has_table_privilege(current_user, relation_row.oid, 'DELETE')
       OR has_table_privilege(current_user, relation_row.oid, 'TRUNCATE')
       OR has_table_privilege(current_user, relation_row.oid, 'REFERENCES')
       OR has_table_privilege(current_user, relation_row.oid, 'TRIGGER')
       OR has_any_column_privilege(
         current_user,
         relation_row.oid,
         'INSERT'
       )
       OR has_any_column_privilege(
         current_user,
         relation_row.oid,
         'UPDATE'
       )
       OR has_any_column_privilege(
         current_user,
         relation_row.oid,
         'REFERENCES'
       )
  ) AS writable_relation_count,
  (
    SELECT COUNT(*)::text
    FROM user_relation AS relation_row
    WHERE has_table_privilege(current_user, relation_row.oid, 'SELECT')
  ) AS table_select_relation_count,
  (
    SELECT COUNT(*)::text
    FROM all_user_column AS column_row
    WHERE has_column_privilege(
      current_user,
      column_row.relation_oid,
      column_row.attnum,
      'SELECT'
    )
      AND NOT EXISTS (
        SELECT 1
        FROM expected_column AS expected
        WHERE expected.relation_name = column_row.relation_name
          AND expected.column_name = column_row.column_name
          AND column_row.schema_name = 'public'
      )
  ) AS excess_select_column_count,
  (
    SELECT COUNT(*)::text
    FROM user_relation AS relation_row
    WHERE has_table_privilege(
      current_user,
      relation_row.oid,
      'SELECT WITH GRANT OPTION'
    )
  ) AS table_select_grant_option_count,
  (
    SELECT COUNT(*)::text
    FROM all_user_column AS column_row
    WHERE has_column_privilege(
      current_user,
      column_row.relation_oid,
      column_row.attnum,
      'SELECT WITH GRANT OPTION'
    )
  ) AS column_select_grant_option_count,
  (
    SELECT COUNT(*)::text
    FROM required_relation_state AS required
    WHERE required.oid IS NULL
  ) AS required_relation_missing_count,
  (
    SELECT COUNT(*)::text
    FROM required_column_state AS required
    WHERE required.attnum IS NULL
       OR NOT has_column_privilege(
         current_user,
         required.relation_oid,
         required.attnum,
         'SELECT'
       )
  ) AS required_select_missing_count,
  (
    SELECT COUNT(*)::text
    FROM required_relation_state AS required
    WHERE required.relrowsecurity OR required.relforcerowsecurity
  ) AS required_relation_rls_count,
  (
    SELECT COUNT(*)::text
    FROM user_relation AS relation_row
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      relation_row.relacl
    ) AS privilege_row
    WHERE privilege_row.grantee = 0
      AND privilege_row.privilege_type IN (
        'SELECT',
        'INSERT',
        'UPDATE',
        'DELETE',
        'TRUNCATE',
        'REFERENCES',
        'TRIGGER'
      )
  ) AS public_relation_privilege_count,
  (
    SELECT COUNT(*)::text
    FROM all_user_column AS column_row
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      column_row.attacl
    ) AS privilege_row
    WHERE privilege_row.grantee = 0
      AND privilege_row.privilege_type IN (
        'SELECT',
        'INSERT',
        'UPDATE',
        'REFERENCES'
      )
  ) AS public_column_privilege_count,
  (
    SELECT COUNT(*)::text
    FROM user_sequence AS sequence_row
    WHERE has_sequence_privilege(current_user, sequence_row.oid, 'USAGE')
       OR has_sequence_privilege(current_user, sequence_row.oid, 'SELECT')
       OR has_sequence_privilege(current_user, sequence_row.oid, 'UPDATE')
  ) AS sequence_privilege_count,
  (
    SELECT COUNT(*)::text
    FROM user_function AS function_row
    WHERE has_function_privilege(
      current_user,
      function_row.oid,
      'EXECUTE'
    )
  ) AS executable_user_function_count,
  (
    SELECT COUNT(*)::text
    FROM pg_catalog.pg_foreign_server AS server_row
    WHERE has_server_privilege(current_user, server_row.oid, 'USAGE')
  ) AS foreign_server_usage_count,
  (
    SELECT COUNT(*)::text
    FROM pg_catalog.pg_foreign_data_wrapper AS wrapper_row
    WHERE has_foreign_data_wrapper_privilege(
      current_user,
      wrapper_row.oid,
      'USAGE'
    )
  ) AS foreign_data_wrapper_usage_count,
  (
    SELECT COUNT(*)::text
    FROM pg_catalog.pg_parameter_acl AS parameter_row
    WHERE has_parameter_privilege(
      current_user,
      parameter_row.parname,
      'SET'
    )
       OR has_parameter_privilege(
         current_user,
         parameter_row.parname,
         'ALTER SYSTEM'
       )
  ) AS parameter_privilege_count,
  (
    SELECT COUNT(*)::text
    FROM pg_catalog.pg_largeobject_metadata AS object_row
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(
        object_row.lomacl,
        pg_catalog.acldefault('L'::"char", object_row.lomowner)
      )
    ) AS privilege_row
    WHERE privilege_row.grantee IN (
      0,
      (SELECT oid FROM current_role_row)
    )
      AND privilege_row.privilege_type IN ('SELECT', 'UPDATE')
  ) AS large_object_privilege_count
`.trim();

export const INVENTORY_SQL = `
WITH
  snapshot_clock AS (
    SELECT transaction_timestamp() AS as_of
  ),
  user_base AS (
    SELECT
      user_row."id",
      user_row."tenantId",
      user_row."email",
      user_row."identityClaimRevision",
      user_row."isPlatformAdmin",
      user_row."emailVerifiedAt",
      lower(btrim(user_row."email") COLLATE "C") AS email_canonical
    FROM public."User" AS user_row
  ),
  user_row AS (
    SELECT
      base.*,
      (
        char_length(base.email_canonical) BETWEEN 3 AND 320
        AND (base.email_canonical COLLATE "C") ~ '^[!-~]+$'
        AND (base.email_canonical COLLATE "C")
          ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      ) AS email_supported,
      (
        base."id" =
          lower(btrim(base."id") COLLATE "C")
        AND (base."id" COLLATE "C") ~
          '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      ) AS subject_valid
    FROM user_base AS base
  ),
  invite_base AS (
    SELECT
      invite_row."id",
      invite_row."tenantId",
      invite_row."email",
      invite_row."acceptedAt",
      invite_row."acceptedByUserId",
      invite_row."revokedAt",
      invite_row."expiresAt",
      invite_row."identityClaimRevision",
      CASE
        WHEN (
          invite_row."acceptedAt" IS NOT NULL
          AND invite_row."revokedAt" IS NOT NULL
        ) OR (
          invite_row."acceptedAt" IS NOT NULL
          AND invite_row."acceptedByUserId" IS NULL
        ) OR (
          invite_row."acceptedAt" IS NULL
          AND invite_row."acceptedByUserId" IS NOT NULL
        ) THEN 'INVALID'
        WHEN invite_row."acceptedAt" IS NOT NULL THEN 'ACCEPTED'
        WHEN invite_row."revokedAt" IS NOT NULL THEN 'REVOKED'
        WHEN invite_row."expiresAt" > snapshot_clock.as_of THEN 'LIVE'
        ELSE 'EXPIRED'
      END AS invite_state,
      CASE
        WHEN invite_row."email" IS NULL THEN NULL
        ELSE lower(btrim(invite_row."email") COLLATE "C")
      END AS email_canonical
    FROM public."UserInvite" AS invite_row
    CROSS JOIN snapshot_clock
  ),
  invite_row AS (
    SELECT
      base.*,
      (
        base.email_canonical IS NOT NULL
        AND char_length(base.email_canonical) BETWEEN 3 AND 320
        AND (base.email_canonical COLLATE "C") ~ '^[!-~]+$'
        AND (base.email_canonical COLLATE "C")
          ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      ) AS email_supported,
      (
        base."id" =
          lower(btrim(base."id") COLLATE "C")
        AND (base."id" COLLATE "C") ~
          '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      ) AS subject_valid
    FROM invite_base AS base
  ),
  claim_row AS (
    SELECT
      claim."emailCanonical",
      claim."claimType"::text AS claim_type,
      claim."tenantId",
      claim."subjectId",
      claim."revision",
      (
        char_length(claim."emailCanonical") BETWEEN 3 AND 320
        AND claim."emailCanonical" =
          lower(btrim(claim."emailCanonical") COLLATE "C")
        AND (claim."emailCanonical" COLLATE "C") ~ '^[!-~]+$'
        AND (claim."emailCanonical" COLLATE "C")
          ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      ) AS canonical_supported,
      (
        claim."subjectId" =
          lower(btrim(claim."subjectId") COLLATE "C")
        AND (claim."subjectId" COLLATE "C") ~
          '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      ) AS subject_valid
    FROM public."IdentityEmailClaim" AS claim
  ),
  active_subject AS (
    SELECT
      'USER'::text AS subject_type,
      user_row."id" AS subject_id,
      user_row.email_canonical
    FROM user_row
    WHERE user_row.email_supported
      AND user_row.subject_valid
    UNION ALL
    SELECT
      'INVITE'::text,
      invite_row."id",
      invite_row.email_canonical
    FROM invite_row
    WHERE invite_row.invite_state = 'LIVE'
      AND invite_row.email_supported
      AND invite_row.subject_valid
  ),
  collision AS (
    SELECT active_subject.email_canonical
    FROM active_subject
    GROUP BY active_subject.email_canonical
    HAVING COUNT(*) > 1
  ),
  user_candidate AS (
    SELECT user_row.*
    FROM user_row
    LEFT JOIN claim_row
      ON claim_row."emailCanonical" = user_row.email_canonical
    LEFT JOIN collision
      ON collision.email_canonical = user_row.email_canonical
    WHERE user_row.email_supported
      AND user_row.subject_valid
      AND user_row."identityClaimRevision" IS NULL
      AND claim_row."emailCanonical" IS NULL
      AND collision.email_canonical IS NULL
  ),
  live_invite_candidate AS (
    SELECT invite_row.*
    FROM invite_row
    LEFT JOIN claim_row
      ON claim_row."emailCanonical" = invite_row.email_canonical
    LEFT JOIN collision
      ON collision.email_canonical = invite_row.email_canonical
    WHERE invite_row.invite_state = 'LIVE'
      AND invite_row.email_supported
      AND invite_row.subject_valid
      AND invite_row."identityClaimRevision" IS NULL
      AND claim_row."emailCanonical" IS NULL
      AND collision.email_canonical IS NULL
  ),
  findings(code, severity, finding_count) AS (
    SELECT 'USER_EMAIL_UNSUPPORTED', 'BLOCKING', COUNT(*)::bigint
    FROM user_row
    WHERE NOT user_row.email_supported

    UNION ALL
    SELECT 'USER_SUBJECT_ID_INVALID', 'BLOCKING', COUNT(*)::bigint
    FROM user_row
    WHERE NOT user_row.subject_valid

    UNION ALL
    SELECT
      'LIVE_INVITE_EMAIL_MISSING_OR_UNSUPPORTED',
      'BLOCKING',
      COUNT(*)::bigint
    FROM invite_row
    WHERE invite_row.invite_state = 'LIVE'
      AND NOT invite_row.email_supported

    UNION ALL
    SELECT 'LIVE_INVITE_SUBJECT_ID_INVALID', 'BLOCKING', COUNT(*)::bigint
    FROM invite_row
    WHERE invite_row.invite_state = 'LIVE'
      AND NOT invite_row.subject_valid

    UNION ALL
    SELECT
      'ACTIVE_IDENTITY_CANONICAL_COLLISION',
      'BLOCKING',
      COUNT(*)::bigint
    FROM collision

    UNION ALL
    SELECT 'INVITE_STATE_MISMATCH', 'BLOCKING', COUNT(*)::bigint
    FROM invite_row
    WHERE invite_row.invite_state = 'INVALID'

    UNION ALL
    SELECT 'ACCEPTED_INVITE_BINDING_MISMATCH', 'BLOCKING', COUNT(*)::bigint
    FROM invite_row
    LEFT JOIN user_row AS accepted_user
      ON accepted_user."id" = invite_row."acceptedByUserId"
    WHERE invite_row."acceptedAt" IS NOT NULL
      AND (
        invite_row."acceptedByUserId" IS NULL
        OR accepted_user."id" IS NULL
        OR accepted_user."tenantId" IS DISTINCT FROM invite_row."tenantId"
        OR accepted_user.email_canonical
          IS DISTINCT FROM invite_row.email_canonical
      )

    UNION ALL
    SELECT
      'ACCEPTED_INVITE_CLAIM_LINEAGE_MISMATCH',
      'BLOCKING',
      COUNT(*)::bigint
    FROM invite_row
    LEFT JOIN user_row AS accepted_user
      ON accepted_user."id" = invite_row."acceptedByUserId"
    LEFT JOIN claim_row
      ON claim_row."emailCanonical" = invite_row.email_canonical
    WHERE invite_row.invite_state = 'ACCEPTED'
      AND invite_row."identityClaimRevision" IS NOT NULL
      AND (
        accepted_user."id" IS NULL
        OR claim_row."emailCanonical" IS NULL
        OR claim_row.claim_type IS DISTINCT FROM 'USER'
        OR claim_row."tenantId" IS DISTINCT FROM invite_row."tenantId"
        OR claim_row."subjectId" IS DISTINCT FROM accepted_user."id"
        OR accepted_user."identityClaimRevision"
          IS DISTINCT FROM claim_row."revision"
        OR claim_row."revision"
          IS DISTINCT FROM invite_row."identityClaimRevision" + 1
      )

    UNION ALL
    SELECT 'BOUND_CLAIM_NULL_PROVENANCE', 'BLOCKING', COUNT(*)::bigint
    FROM (
      SELECT user_row."id"
      FROM user_row
      JOIN claim_row
        ON claim_row."emailCanonical" = user_row.email_canonical
       AND claim_row.claim_type = 'USER'
       AND claim_row."tenantId" = user_row."tenantId"
       AND claim_row."subjectId" = user_row."id"
      WHERE user_row."identityClaimRevision" IS NULL
      UNION ALL
      SELECT invite_row."id"
      FROM invite_row
      JOIN claim_row
        ON claim_row."emailCanonical" = invite_row.email_canonical
       AND claim_row.claim_type = 'INVITE'
       AND claim_row."tenantId" = invite_row."tenantId"
       AND claim_row."subjectId" = invite_row."id"
      WHERE invite_row."identityClaimRevision" IS NULL
    ) AS bound_without_provenance

    UNION ALL
    SELECT 'USER_CLAIM_OWNER_MISMATCH', 'BLOCKING', COUNT(*)::bigint
    FROM user_row
    JOIN claim_row
      ON claim_row."emailCanonical" = user_row.email_canonical
    WHERE claim_row.claim_type IS DISTINCT FROM 'USER'
       OR claim_row."tenantId" IS DISTINCT FROM user_row."tenantId"
       OR claim_row."subjectId" IS DISTINCT FROM user_row."id"

    UNION ALL
    SELECT 'LIVE_INVITE_CLAIM_OWNER_MISMATCH', 'BLOCKING', COUNT(*)::bigint
    FROM invite_row
    JOIN claim_row
      ON claim_row."emailCanonical" = invite_row.email_canonical
    WHERE invite_row.invite_state = 'LIVE'
      AND (
        claim_row.claim_type IS DISTINCT FROM 'INVITE'
        OR claim_row."tenantId" IS DISTINCT FROM invite_row."tenantId"
        OR claim_row."subjectId" IS DISTINCT FROM invite_row."id"
      )

    UNION ALL
    SELECT 'USER_CLAIM_REVISION_MISMATCH', 'BLOCKING', COUNT(*)::bigint
    FROM user_row
    JOIN claim_row
      ON claim_row."emailCanonical" = user_row.email_canonical
     AND claim_row.claim_type = 'USER'
     AND claim_row."tenantId" = user_row."tenantId"
     AND claim_row."subjectId" = user_row."id"
    WHERE user_row."identityClaimRevision" IS NOT NULL
      AND user_row."identityClaimRevision" IS DISTINCT FROM claim_row."revision"

    UNION ALL
    SELECT
      'LIVE_INVITE_CLAIM_REVISION_MISMATCH',
      'BLOCKING',
      COUNT(*)::bigint
    FROM invite_row
    JOIN claim_row
      ON claim_row."emailCanonical" = invite_row.email_canonical
     AND claim_row.claim_type = 'INVITE'
     AND claim_row."tenantId" = invite_row."tenantId"
     AND claim_row."subjectId" = invite_row."id"
    WHERE invite_row.invite_state = 'LIVE'
      AND invite_row."identityClaimRevision" IS NOT NULL
      AND invite_row."identityClaimRevision"
        IS DISTINCT FROM claim_row."revision"

    UNION ALL
    SELECT
      'USER_REVISION_WITHOUT_EXACT_CLAIM',
      'BLOCKING',
      COUNT(*)::bigint
    FROM user_row
    LEFT JOIN claim_row
      ON claim_row."emailCanonical" = user_row.email_canonical
     AND claim_row.claim_type = 'USER'
     AND claim_row."tenantId" = user_row."tenantId"
     AND claim_row."subjectId" = user_row."id"
    WHERE user_row."identityClaimRevision" IS NOT NULL
      AND claim_row."emailCanonical" IS NULL

    UNION ALL
    SELECT
      'LIVE_INVITE_REVISION_WITHOUT_EXACT_CLAIM',
      'BLOCKING',
      COUNT(*)::bigint
    FROM invite_row
    LEFT JOIN claim_row
      ON claim_row."emailCanonical" = invite_row.email_canonical
     AND claim_row.claim_type = 'INVITE'
     AND claim_row."tenantId" = invite_row."tenantId"
     AND claim_row."subjectId" = invite_row."id"
    WHERE invite_row.invite_state = 'LIVE'
      AND invite_row."identityClaimRevision" IS NOT NULL
      AND claim_row."emailCanonical" IS NULL

    UNION ALL
    SELECT 'ORPHAN_USER_CLAIM', 'BLOCKING', COUNT(*)::bigint
    FROM claim_row
    LEFT JOIN user_row
      ON user_row."id" = claim_row."subjectId"
     AND user_row."tenantId" = claim_row."tenantId"
     AND user_row.email_canonical = claim_row."emailCanonical"
    WHERE claim_row.claim_type = 'USER'
      AND user_row."id" IS NULL

    UNION ALL
    SELECT 'ORPHAN_INVITE_CLAIM', 'BLOCKING', COUNT(*)::bigint
    FROM claim_row
    LEFT JOIN invite_row
      ON invite_row."id" = claim_row."subjectId"
     AND invite_row."tenantId" = claim_row."tenantId"
     AND invite_row.email_canonical = claim_row."emailCanonical"
     AND invite_row."acceptedAt" IS NULL
     AND invite_row."revokedAt" IS NULL
    WHERE claim_row.claim_type = 'INVITE'
      AND invite_row."id" IS NULL

    UNION ALL
    SELECT 'EMAIL_CHANGE_CLAIM_PRESENT', 'BLOCKING', COUNT(*)::bigint
    FROM claim_row
    WHERE claim_row.claim_type = 'EMAIL_CHANGE'

    UNION ALL
    SELECT 'CLAIM_CANONICAL_UNSUPPORTED', 'BLOCKING', COUNT(*)::bigint
    FROM claim_row
    WHERE NOT claim_row.canonical_supported

    UNION ALL
    SELECT 'CLAIM_SUBJECT_ID_INVALID', 'BLOCKING', COUNT(*)::bigint
    FROM claim_row
    WHERE NOT claim_row.subject_valid

    UNION ALL
    SELECT
      'SUBJECT_MULTIPLE_IDENTITY_CLAIMS',
      'BLOCKING',
      COUNT(*)::bigint
    FROM (
      SELECT
        claim_row."tenantId",
        claim_row."subjectId"
      FROM claim_row
      WHERE claim_row.claim_type IN ('USER', 'INVITE')
      GROUP BY
        claim_row."tenantId",
        claim_row."subjectId"
      HAVING COUNT(*) > 1
    ) AS duplicate_subject

    UNION ALL
    SELECT
      'USER_CLAIM_CREATE_CANDIDATE',
      'PROPOSAL',
      COUNT(*)::bigint
    FROM user_candidate

    UNION ALL
    SELECT
      'LIVE_INVITE_CLAIM_CREATE_CANDIDATE',
      'PROPOSAL',
      COUNT(*)::bigint
    FROM live_invite_candidate

    UNION ALL
    SELECT
      'USER_SENSITIVE_IDENTITY_REVIEW',
      'REVIEW',
      COUNT(*)::bigint
    FROM user_row
    WHERE user_row."isPlatformAdmin"
       OR user_row."emailVerifiedAt" IS NULL

    UNION ALL
    SELECT
      'LIVE_INVITE_LEGACY_TOKEN_REVIEW',
      'REVIEW',
      COUNT(*)::bigint
    FROM live_invite_candidate

    UNION ALL
    SELECT
      'ACCEPTED_INVITE_NULL_PROVENANCE_HISTORY',
      'REVIEW',
      COUNT(*)::bigint
    FROM invite_row
    WHERE invite_row.invite_state = 'ACCEPTED'
      AND invite_row."identityClaimRevision" IS NULL

    UNION ALL
    SELECT
      'REVOKED_INVITE_NULL_PROVENANCE_HISTORY',
      'REVIEW',
      COUNT(*)::bigint
    FROM invite_row
    WHERE invite_row.invite_state = 'REVOKED'
      AND invite_row."identityClaimRevision" IS NULL

    UNION ALL
    SELECT
      'EXPIRED_INVITE_NULL_PROVENANCE_HISTORY',
      'REVIEW',
      COUNT(*)::bigint
    FROM invite_row
    WHERE invite_row.invite_state = 'EXPIRED'
      AND invite_row."identityClaimRevision" IS NULL

    UNION ALL
    SELECT
      'TERMINAL_INVITE_EMAIL_UNSUPPORTED',
      'REVIEW',
      COUNT(*)::bigint
    FROM invite_row
    WHERE invite_row.invite_state IN ('ACCEPTED', 'REVOKED', 'EXPIRED')
      AND NOT invite_row.email_supported
  ),
  metrics(code, metric_count) AS (
    SELECT 'USER_TOTAL', COUNT(*)::bigint FROM user_row
    UNION ALL
    SELECT 'LIVE_INVITE_TOTAL', COUNT(*)::bigint
    FROM invite_row WHERE invite_state = 'LIVE'
    UNION ALL
    SELECT 'ACCEPTED_INVITE_TOTAL', COUNT(*)::bigint
    FROM invite_row WHERE invite_state = 'ACCEPTED'
    UNION ALL
    SELECT 'REVOKED_INVITE_TOTAL', COUNT(*)::bigint
    FROM invite_row WHERE invite_state = 'REVOKED'
    UNION ALL
    SELECT 'EXPIRED_INVITE_TOTAL', COUNT(*)::bigint
    FROM invite_row WHERE invite_state = 'EXPIRED'
    UNION ALL
    SELECT 'INVALID_INVITE_STATE_TOTAL', COUNT(*)::bigint
    FROM invite_row WHERE invite_state = 'INVALID'
    UNION ALL
    SELECT 'IDENTITY_CLAIM_TOTAL', COUNT(*)::bigint FROM claim_row
  )
SELECT
  'FINDING'::text AS row_type,
  findings.code,
  findings.severity,
  findings.finding_count::text AS count
FROM findings
UNION ALL
SELECT
  'METRIC'::text,
  metrics.code,
  NULL::text,
  metrics.metric_count::text
FROM metrics
ORDER BY row_type, severity, code
`.trim();

class IdentityInventoryContractError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "IdentityInventoryContractError";
    this.code = code;
    this.safeContractError = true;
  }
}

function contractError(code, message) {
  throw new IdentityInventoryContractError(code, message);
}

export function parseBoundedInteger(
  value,
  { code, label, minimum, maximum, fallback },
) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  if (!/^\d+$/u.test(String(value))) {
    contractError(code, `${label} must be an integer.`);
  }
  const parsed = Number.parseInt(String(value), 10);
  if (parsed < minimum || parsed > maximum) {
    contractError(code, `${label} is outside the permitted range.`);
  }
  return parsed;
}

export function parseArguments(argv) {
  let pretty = false;
  let selfTest = false;
  let verifyReleaseArtifact = false;
  for (const argument of argv) {
    if (argument === "--help") {
      return {
        help: true,
        selfTest: false,
        verifyReleaseArtifact: false,
        pretty: false,
      };
    }
    if (argument === "--self-test") {
      selfTest = true;
      continue;
    }
    if (argument === "--verify-release-artifact") {
      verifyReleaseArtifact = true;
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
  if (selfTest && verifyReleaseArtifact) {
    contractError(
      "CLI_MODE_CONFLICT",
      "Only one identity inventory verification mode is permitted.",
    );
  }
  return {
    help: false,
    selfTest,
    verifyReleaseArtifact,
    pretty,
  };
}

function normalizeDatabaseUrl(rawValue) {
  let parsed;
  try {
    parsed = new URL(String(rawValue ?? ""));
  } catch {
    contractError("DATABASE_URL_INVALID", "DATABASE_URL must be a valid URL.");
  }
  if (!["postgresql:", "postgres:"].includes(parsed.protocol)) {
    contractError(
      "DATABASE_URL_PROTOCOL_INVALID",
      "DATABASE_URL must use PostgreSQL.",
    );
  }
  for (const parameterName of new Set(parsed.searchParams.keys())) {
    if (parsed.searchParams.getAll(parameterName).length !== 1) {
      contractError(
        "DATABASE_URL_PARAMETER_DUPLICATE",
        "DATABASE_URL query parameters must be unique.",
      );
    }
  }
  if (parsed.searchParams.has("host")) {
    contractError(
      "DATABASE_URL_HOST_OVERRIDE_UNSUPPORTED",
      "DATABASE_URL host query overrides are not supported.",
    );
  }
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/u, ""));
  if (!DATABASE_NAME_PATTERN.test(databaseName)) {
    contractError(
      "DATABASE_NAME_INVALID",
      "DATABASE_URL must name one bounded PostgreSQL database.",
    );
  }
  if ((parsed.searchParams.get("schema") ?? "public") !== "public") {
    contractError(
      "DATABASE_SCHEMA_INVALID",
      "Identity inventory requires schema=public.",
    );
  }
  return {
    parsed,
    databaseName,
    hostname: parsed.hostname.toLowerCase().replace(/^\[|\]$/gu, ""),
    sslMode: String(parsed.searchParams.get("sslmode") ?? "")
      .trim()
      .toLowerCase(),
    sslAccept: String(parsed.searchParams.get("sslaccept") ?? "")
      .trim()
      .toLowerCase(),
  };
}

export function parseRuntimeContract(environment) {
  const target = String(
    environment.IDENTITY_LEGACY_INVENTORY_TARGET ?? "",
  )
    .trim()
    .toLowerCase();
  if (!TARGET_ENVIRONMENTS.has(target)) {
    contractError(
      "TARGET_ENVIRONMENT_REQUIRED",
      "The exact identity inventory target is required.",
    );
  }
  if (
    environment.IDENTITY_LEGACY_INVENTORY_CONFIRM !== RUN_CONFIRMATION
  ) {
    contractError(
      "RUN_CONFIRMATION_REQUIRED",
      "The exact identity inventory confirmation is required.",
    );
  }

  const nodeEnvironment = String(environment.NODE_ENV ?? "")
    .trim()
    .toLowerCase();
  if (!nodeEnvironment) {
    contractError("NODE_ENV_REQUIRED", "NODE_ENV is required.");
  }
  const productionRequested =
    target === "production" || nodeEnvironment === "production";
  if (
    (target === "production") !== (nodeEnvironment === "production")
  ) {
    contractError(
      "PRODUCTION_TARGET_MISMATCH",
      "NODE_ENV and inventory target disagree about production.",
    );
  }
  if (
    productionRequested &&
    environment.IDENTITY_LEGACY_INVENTORY_PRODUCTION_ATTESTATION !==
      PRODUCTION_ATTESTATION
  ) {
    contractError(
      "PRODUCTION_ATTESTATION_REQUIRED",
      "The exact production read-only inventory attestation is required.",
    );
  }

  const releaseSha = String(environment.RELEASE_SHA ?? "").trim();
  if (!SHA_PATTERN.test(releaseSha)) {
    contractError(
      "RELEASE_SHA_INVALID",
      "RELEASE_SHA must be a full lowercase commit SHA.",
    );
  }

  const expectedDatabaseName = String(
    environment.IDENTITY_LEGACY_INVENTORY_EXPECTED_DATABASE ?? "",
  ).trim();
  if (!DATABASE_NAME_PATTERN.test(expectedDatabaseName)) {
    contractError(
      "EXPECTED_DATABASE_INVALID",
      "The exact expected database name is required.",
    );
  }
  const {
    parsed,
    databaseName,
    hostname,
    sslMode,
    sslAccept,
  } = normalizeDatabaseUrl(environment.DATABASE_URL);
  if (databaseName !== expectedDatabaseName) {
    contractError(
      "EXPECTED_DATABASE_URL_MISMATCH",
      "The expected database marker does not match DATABASE_URL.",
    );
  }

  const hmacKey = String(
    environment.IDENTITY_LEGACY_INVENTORY_HMAC_KEY ?? "",
  );
  const hmacKeyBytes = Buffer.byteLength(hmacKey, "utf8");
  if (hmacKeyBytes < 32 || hmacKeyBytes > MAX_HMAC_KEY_BYTES) {
    contractError(
      "HMAC_KEY_INVALID",
      "The identity inventory HMAC key length is invalid.",
    );
  }
  if (
    environment.IDENTITY_LEGACY_INVENTORY_HMAC_KEY_VERSION !==
    HMAC_KEY_VERSION
  ) {
    contractError(
      "HMAC_KEY_VERSION_INVALID",
      "The exact identity inventory HMAC key version is required.",
    );
  }
  const expectedDatabaseIdentityDigest = String(
    environment.IDENTITY_LEGACY_INVENTORY_EXPECTED_DATABASE_IDENTITY_DIGEST ??
      "",
  ).trim();
  if (
    expectedDatabaseIdentityDigest &&
    !HMAC_PATTERN.test(expectedDatabaseIdentityDigest)
  ) {
    contractError(
      "EXPECTED_DATABASE_IDENTITY_DIGEST_INVALID",
      "The expected database identity digest must be exact 64-hex.",
    );
  }
  if (productionRequested && !expectedDatabaseIdentityDigest) {
    contractError(
      "EXPECTED_DATABASE_IDENTITY_DIGEST_REQUIRED",
      "Production inventory requires an approved database identity digest.",
    );
  }
  const databaseHostnameIsLoopback = new Set([
    "127.0.0.1",
    "localhost",
    "::1",
  ]).has(hostname);
  const transportEncryptionRequired =
    productionRequested || !databaseHostnameIsLoopback;
  if (
    transportEncryptionRequired &&
    (sslMode !== "require" || sslAccept !== "strict")
  ) {
    contractError(
      "STRICT_TLS_REQUIRED",
      "Remote identity inventory requires strict Prisma TLS.",
    );
  }
  if (transportEncryptionRequired) {
    parsed.searchParams.set("sslmode", "require");
    parsed.searchParams.set("sslaccept", "strict");
  }

  return {
    target,
    nodeEnvironment,
    productionAttested: productionRequested,
    releaseSha,
    expectedDatabaseName,
    expectedDatabaseIdentityDigest:
      expectedDatabaseIdentityDigest || null,
    transportEncryptionRequired,
    databaseUrl: parsed.toString(),
    hmacKey,
    hmacKeyVersion: HMAC_KEY_VERSION,
    connectTimeoutSeconds: parseBoundedInteger(
      environment.IDENTITY_LEGACY_INVENTORY_CONNECT_TIMEOUT_SECONDS,
      {
        code: "CONNECT_TIMEOUT_INVALID",
        label: "IDENTITY_LEGACY_INVENTORY_CONNECT_TIMEOUT_SECONDS",
        minimum: 1,
        maximum: 30,
        fallback: DEFAULT_CONNECT_TIMEOUT_SECONDS,
      },
    ),
    lockTimeoutMs: parseBoundedInteger(
      environment.IDENTITY_LEGACY_INVENTORY_LOCK_TIMEOUT_MS,
      {
        code: "LOCK_TIMEOUT_INVALID",
        label: "IDENTITY_LEGACY_INVENTORY_LOCK_TIMEOUT_MS",
        minimum: 100,
        maximum: 5_000,
        fallback: DEFAULT_LOCK_TIMEOUT_MS,
      },
    ),
    statementTimeoutMs: parseBoundedInteger(
      environment.IDENTITY_LEGACY_INVENTORY_STATEMENT_TIMEOUT_MS,
      {
        code: "STATEMENT_TIMEOUT_INVALID",
        label: "IDENTITY_LEGACY_INVENTORY_STATEMENT_TIMEOUT_MS",
        minimum: 1_000,
        maximum: 120_000,
        fallback: DEFAULT_STATEMENT_TIMEOUT_MS,
      },
    ),
    transactionTimeoutMs: parseBoundedInteger(
      environment.IDENTITY_LEGACY_INVENTORY_TRANSACTION_TIMEOUT_MS,
      {
        code: "TRANSACTION_TIMEOUT_INVALID",
        label: "IDENTITY_LEGACY_INVENTORY_TRANSACTION_TIMEOUT_MS",
        minimum: 5_000,
        maximum: 600_000,
        fallback: DEFAULT_TRANSACTION_TIMEOUT_MS,
      },
    ),
  };
}

export function buildReadOnlyDatabaseUrl(rawDatabaseUrl, config) {
  const parsed = new URL(rawDatabaseUrl);
  parsed.searchParams.set("schema", "public");
  parsed.searchParams.set("connection_limit", "1");
  parsed.searchParams.set(
    "connect_timeout",
    String(config.connectTimeoutSeconds),
  );
  parsed.searchParams.set(
    "application_name",
    "leetplus_identity_legacy_inventory",
  );
  const existingOptions = parsed.searchParams.get("options")?.trim();
  parsed.searchParams.set(
    "options",
    [
      existingOptions,
      "-c default_transaction_read_only=on",
      "-c timezone=UTC",
      `-c lock_timeout=${config.lockTimeoutMs}`,
      `-c statement_timeout=${config.statementTimeoutMs}`,
      `-c idle_in_transaction_session_timeout=${config.transactionTimeoutMs}`,
    ]
      .filter(Boolean)
      .join(" "),
  );
  return parsed.toString();
}

function runGit(args, { cwd, encoding = "utf8", input } = {}) {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding,
      input,
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
    });
  } catch {
    contractError(
      "RELEASE_ARTIFACT_UNAVAILABLE",
      "The exact committed release artifact could not be inspected.",
    );
  }
}

function parseGitBatchObjects(batchOutput, expectedPaths) {
  if (!Buffer.isBuffer(batchOutput)) {
    contractError(
      "RELEASE_ARTIFACT_INVALID",
      "The release artifact object stream is invalid.",
    );
  }
  const objects = [];
  let offset = 0;
  for (const expectedPath of expectedPaths) {
    const headerEnd = batchOutput.indexOf(0x0a, offset);
    if (headerEnd < 0) {
      contractError(
        "RELEASE_ARTIFACT_INVALID",
        "The release artifact object header is missing.",
      );
    }
    const header = batchOutput.toString("utf8", offset, headerEnd);
    const match = /^[0-9a-f]+ blob (\d+)$/u.exec(header);
    if (!match) {
      contractError(
        "RELEASE_ARTIFACT_INVALID",
        "The release artifact contains a missing or non-blob object.",
      );
    }
    const size = Number.parseInt(match[1], 10);
    const contentStart = headerEnd + 1;
    const contentEnd = contentStart + size;
    if (
      !Number.isSafeInteger(size) ||
      size < 0 ||
      contentEnd >= batchOutput.length ||
      batchOutput[contentEnd] !== 0x0a
    ) {
      contractError(
        "RELEASE_ARTIFACT_INVALID",
        "The release artifact object length is invalid.",
      );
    }
    objects.push({
      path: expectedPath,
      content: batchOutput.subarray(contentStart, contentEnd),
    });
    offset = contentEnd + 1;
  }
  if (offset !== batchOutput.length) {
    contractError(
      "RELEASE_ARTIFACT_INVALID",
      "The release artifact stream contains unexpected data.",
    );
  }
  return objects;
}

function normalizedSourceContent(content) {
  if (!Buffer.isBuffer(content)) {
    contractError(
      "RELEASE_SOURCE_MISMATCH",
      "The release source content is invalid.",
    );
  }
  const decoded = content.toString("utf8");
  if (!Buffer.from(decoded, "utf8").equals(content) || decoded.includes("\0")) {
    contractError(
      "RELEASE_SOURCE_MISMATCH",
      "The release source must be valid UTF-8 text.",
    );
  }
  return decoded.replace(/\r\n/gu, "\n");
}

export function releaseRuntimePathMatches(
  runtimePath,
  expectedRuntimePath,
  {
    platform = process.platform,
    canonicalize = realpathSync.native,
  } = {},
) {
  let canonicalRuntimePath;
  let canonicalExpectedPath;
  try {
    canonicalRuntimePath = path.resolve(
      String(canonicalize(runtimePath)),
    );
    canonicalExpectedPath = path.resolve(
      String(canonicalize(expectedRuntimePath)),
    );
  } catch {
    return false;
  }
  return platform === "win32"
    ? canonicalRuntimePath.toLowerCase() ===
        canonicalExpectedPath.toLowerCase()
    : canonicalRuntimePath === canonicalExpectedPath;
}

export function assertRuntimeDependencyVersions(
  prismaClientVersion = Prisma.prismaVersion.client,
) {
  if (prismaClientVersion !== EXPECTED_PRISMA_CLIENT_VERSION) {
    contractError(
      "PRISMA_CLIENT_VERSION_MISMATCH",
      "The identity inventory requires the exact reviewed Prisma Client.",
    );
  }
  return true;
}

export async function loadExpectedMigrationArtifact(releaseSha) {
  assertRuntimeDependencyVersions();
  if (!SHA_PATTERN.test(String(releaseSha ?? ""))) {
    contractError(
      "RELEASE_SHA_INVALID",
      "The release artifact requires a full lowercase commit SHA.",
    );
  }
  const runtimePath = path.resolve(fileURLToPath(import.meta.url));
  const repositoryRoot = String(
    runGit(["rev-parse", "--show-toplevel"], {
      cwd: path.dirname(runtimePath),
    }),
  ).trim();
  const expectedRuntimePath = path.resolve(
    repositoryRoot,
    RELEASE_RUNTIME_ENTRYPOINT_SOURCE_PATH,
  );
  if (
    !releaseRuntimePathMatches(runtimePath, expectedRuntimePath) ||
    String(runGit(["rev-parse", "HEAD"], { cwd: repositoryRoot })).trim() !==
      releaseSha
  ) {
    contractError(
      "RELEASE_SOURCE_MISMATCH",
      "The running source is not anchored to RELEASE_SHA.",
    );
  }

  const runtimeSpecs = RELEASE_RUNTIME_SOURCE_PATHS.map(
    (sourcePath) => `${releaseSha}:${sourcePath}`,
  ).join("\n");
  const runtimeObjects = parseGitBatchObjects(
    runGit(["cat-file", "--batch"], {
      cwd: repositoryRoot,
      encoding: null,
      input: `${runtimeSpecs}\n`,
    }),
    RELEASE_RUNTIME_SOURCE_PATHS,
  );
  for (const runtimeObject of runtimeObjects) {
    const worktreeContent = readFileSync(
      path.resolve(repositoryRoot, runtimeObject.path),
    );
    if (
      normalizedSourceContent(worktreeContent) !==
      normalizedSourceContent(runtimeObject.content)
    ) {
      contractError(
        "RELEASE_SOURCE_MISMATCH",
        "The running source differs from the exact release blob.",
      );
    }
  }

  const migrationPrefix = "packages/database/prisma/migrations";
  const sourceStatus = String(
    runGit(
      [
        "status",
        "--porcelain=v1",
        "--untracked-files=all",
        "--",
        ...RELEASE_RUNTIME_SOURCE_PATHS,
        migrationPrefix,
      ],
      { cwd: repositoryRoot },
    ),
  ).trim();
  if (sourceStatus) {
    contractError(
      "RELEASE_SOURCE_DIRTY",
      "Identity inventory source differs from the committed release.",
    );
  }

  const migrationPaths = String(
    runGit(
      ["ls-tree", "-r", "--name-only", releaseSha, "--", migrationPrefix],
      { cwd: repositoryRoot },
    ),
  )
    .split(/\r?\n/u)
    .map((entry) => entry.trim())
    .filter((entry) => entry.endsWith("/migration.sql"))
    .sort();
  const migrationNames = migrationPaths.map(
    (migrationPath) => migrationPath.split("/").at(-2) ?? "",
  );
  if (
    migrationNames.length !== CURRENT_EXPECTED_MIGRATION_COUNT ||
    migrationNames.at(-1) !== CURRENT_EXPECTED_LATEST_MIGRATION ||
    migrationNames.some((name) => !MIGRATION_NAME_PATTERN.test(name))
  ) {
    contractError(
      "SOURCE_MIGRATION_MANIFEST_INVALID",
      "The source migration manifest does not match exact CURRENT_169.",
    );
  }

  const objectSpecs = migrationPaths
    .map((migrationPath) => `${releaseSha}:${migrationPath}`)
    .join("\n");
  const migrationObjects = parseGitBatchObjects(
    runGit(["cat-file", "--batch"], {
      cwd: repositoryRoot,
      encoding: null,
      input: `${objectSpecs}\n`,
    }),
    migrationPaths,
  );
  const sourceManifestDigest = createHash("sha256")
    .update(
      migrationObjects
        .map(
          (object, index) =>
            `${migrationNames[index]}\0${createHash("sha256")
              .update(object.content)
              .digest("hex")}`,
        )
        .join("\n"),
    )
    .digest("hex");
  return {
    migrationNames,
    sourceManifestDigest,
  };
}

function safeCount(value, code = "DATABASE_COUNT_INVALID") {
  const textValue = String(value ?? "");
  if (!/^\d+$/u.test(textValue)) {
    contractError(code, "The database returned an invalid aggregate count.");
  }
  const count = Number.parseInt(textValue, 10);
  if (!Number.isSafeInteger(count) || count < 0) {
    contractError(code, "The database aggregate count is outside bounds.");
  }
  return count;
}

function safeBoolean(value, code = "DATABASE_BOOLEAN_INVALID") {
  if (value !== true && value !== false) {
    contractError(code, "The database returned an invalid boolean.");
  }
  return value;
}

function normalizeIsoTimestamp(value, code) {
  const parsed = value instanceof Date ? new Date(value.valueOf()) : new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    contractError(code, "The database returned an invalid timestamp.");
  }
  return parsed.toISOString();
}

function arraysEqual(left, right) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

export function buildMigrationState(expectedArtifact, rows) {
  if (
    !Array.isArray(expectedArtifact?.migrationNames) ||
    !HMAC_PATTERN.test(String(expectedArtifact?.sourceManifestDigest ?? ""))
  ) {
    contractError(
      "EXPECTED_MIGRATION_ARTIFACT_INVALID",
      "The exact source migration artifact is required.",
    );
  }
  const normalizedRows = Array.isArray(rows) ? rows : [];
  const appliedNames = normalizedRows
    .filter(
      (row) => row?.finished_at !== null && row?.rolled_back_at === null,
    )
    .map((row) => String(row?.migration_name ?? ""));
  const unfinishedCount = normalizedRows.filter(
    (row) => row?.finished_at === null && row?.rolled_back_at === null,
  ).length;
  const rolledBackCount = normalizedRows.filter(
    (row) => row?.rolled_back_at !== null,
  ).length;
  const invalidNameCount = normalizedRows.filter(
    (row) => !MIGRATION_NAME_PATTERN.test(String(row?.migration_name ?? "")),
  ).length;
  const duplicateNameCount =
    normalizedRows.length -
    new Set(
      normalizedRows.map((row) => String(row?.migration_name ?? "")),
    ).size;
  const orderedNamesMatched = arraysEqual(
    expectedArtifact.migrationNames,
    appliedNames,
  );
  return {
    checked: true,
    ready:
      orderedNamesMatched &&
      normalizedRows.length === expectedArtifact.migrationNames.length &&
      unfinishedCount === 0 &&
      rolledBackCount === 0 &&
      duplicateNameCount === 0 &&
      invalidNameCount === 0,
    expectedCount: expectedArtifact.migrationNames.length,
    recordedCount: normalizedRows.length,
    appliedCount: appliedNames.length,
    unfinishedCount,
    rolledBackCount,
    duplicateNameCount,
    invalidNameCount,
    latestMigration: appliedNames.at(-1) ?? "",
    orderedNamesMatched,
    sourceManifestDigest: expectedArtifact.sourceManifestDigest,
    databaseNameManifestDigest: createHash("sha256")
      .update(appliedNames.join("\n"))
      .digest("hex"),
  };
}

export function buildCatalogState(row) {
  const expectedRelationCount = safeCount(row?.expected_relation_count);
  const matchedRelationCount = safeCount(row?.matched_relation_count);
  const expectedColumnCount = safeCount(row?.expected_column_count);
  const matchedColumnCount = safeCount(row?.matched_column_count);
  const matchedConstraintCount = safeCount(row?.matched_constraint_count);
  const actualConstraintCount = safeCount(row?.actual_constraint_count);
  const matchedIndexCount = safeCount(row?.matched_index_count);
  const actualIndexCount = safeCount(row?.actual_index_count);
  const matchedFunctionCount = safeCount(row?.matched_function_count);
  const actualFunctionCount = safeCount(row?.actual_function_count);
  const matchedEnumLabelCount = safeCount(row?.matched_enum_label_count);
  const totalEnumLabelCount = safeCount(row?.total_enum_label_count);
  const matchedTriggerCount = safeCount(row?.matched_trigger_count);
  const actualIdentityClaimTriggerCount = safeCount(
    row?.actual_identity_claim_trigger_count,
  );
  const matchedRiTriggerCount = safeCount(row?.matched_ri_trigger_count);
  const actualRiTriggerCount = safeCount(row?.actual_ri_trigger_count);
  return {
    ready:
      expectedRelationCount === EXPECTED_CATALOG_RELATIONS.length &&
      matchedRelationCount === EXPECTED_CATALOG_RELATIONS.length &&
      expectedColumnCount === EXPECTED_CATALOG_COLUMNS.length &&
      matchedColumnCount === EXPECTED_CATALOG_COLUMNS.length &&
      matchedConstraintCount === EXPECTED_CONSTRAINT_MANIFEST.length &&
      actualConstraintCount === EXPECTED_CONSTRAINT_MANIFEST.length &&
      matchedIndexCount === EXPECTED_INDEX_MANIFEST.length &&
      actualIndexCount === EXPECTED_INDEX_MANIFEST.length &&
      matchedFunctionCount === EXPECTED_FUNCTION_MANIFEST.length &&
      actualFunctionCount === EXPECTED_FUNCTION_MANIFEST.length &&
      matchedEnumLabelCount === 3 &&
      totalEnumLabelCount === 3 &&
      matchedTriggerCount === EXPECTED_TRIGGER_MANIFEST.length &&
      actualIdentityClaimTriggerCount === EXPECTED_TRIGGER_MANIFEST.length &&
      matchedRiTriggerCount === EXPECTED_RI_TRIGGER_MANIFEST.length &&
      actualRiTriggerCount === EXPECTED_RI_TRIGGER_MANIFEST.length,
    expectedRelationCount,
    matchedRelationCount,
    expectedColumnCount,
    matchedColumnCount,
    expectedConstraintCount: EXPECTED_CONSTRAINT_MANIFEST.length,
    matchedConstraintCount,
    actualConstraintCount,
    expectedIndexCount: EXPECTED_INDEX_MANIFEST.length,
    matchedIndexCount,
    actualIndexCount,
    expectedFunctionCount: EXPECTED_FUNCTION_MANIFEST.length,
    matchedFunctionCount,
    actualFunctionCount,
    matchedEnumLabelCount,
    totalEnumLabelCount,
    expectedTriggerCount: EXPECTED_TRIGGER_MANIFEST.length,
    matchedTriggerCount,
    actualIdentityClaimTriggerCount,
    expectedRiTriggerCount: EXPECTED_RI_TRIGGER_MANIFEST.length,
    matchedRiTriggerCount,
    actualRiTriggerCount,
  };
}

const ZERO_PRIVILEGE_FIELDS = Object.freeze([
  "roleMembershipCount",
  "ownedDatabaseCount",
  "ownedSchemaCount",
  "ownedRelationCount",
  "ownedFunctionCount",
  "ownedTypeCount",
  "ownershipDependencyCount",
  "explicitOtherDatabaseConnectCount",
  "nonPublicSchemaUsageCount",
  "nonPublicSchemaCreateCount",
  "systemSchemaCreateCount",
  "systemSchemaPrivilegeCount",
  "systemObjectPrivilegeCount",
  "systemSecurityDefinerFunctionCount",
  "systemHighOidExecutableFunctionCount",
  "writableRelationCount",
  "tableSelectRelationCount",
  "excessSelectColumnCount",
  "tableSelectGrantOptionCount",
  "columnSelectGrantOptionCount",
  "requiredRelationMissingCount",
  "requiredSelectMissingCount",
  "requiredRelationRlsCount",
  "publicRelationPrivilegeCount",
  "publicColumnPrivilegeCount",
  "sequencePrivilegeCount",
  "executableUserFunctionCount",
  "foreignServerUsageCount",
  "foreignDataWrapperUsageCount",
  "parameterPrivilegeCount",
  "largeObjectPrivilegeCount",
]);

export function buildPrivilegeState(
  row,
  { allowSyntheticPublicConnect = false } = {},
) {
  const state = {
    sessionRoleUnchanged: safeBoolean(row?.session_role_unchanged),
    transactionReadOnly: safeBoolean(row?.transaction_read_only),
    repeatableRead: safeBoolean(row?.repeatable_read),
    roleCanLogin: safeBoolean(row?.role_can_login),
    roleInherits: safeBoolean(row?.role_inherits),
    roleSuperuser: safeBoolean(row?.role_superuser),
    roleCanCreateRole: safeBoolean(row?.role_can_create_role),
    roleCanCreateDatabase: safeBoolean(row?.role_can_create_database),
    roleReplication: safeBoolean(row?.role_replication),
    roleBypassRls: safeBoolean(row?.role_bypass_rls),
    databaseOwner: safeBoolean(row?.database_owner),
    publicSchemaOwner: safeBoolean(row?.public_schema_owner),
    currentDatabaseConnectPrivilege: safeBoolean(
      row?.current_database_connect_privilege,
    ),
    currentDatabaseConnectGrantOption: safeBoolean(
      row?.current_database_connect_grant_option,
    ),
    databaseCreatePrivilege: safeBoolean(row?.database_create_privilege),
    databaseTempPrivilege: safeBoolean(row?.database_temp_privilege),
    publicSchemaUsagePrivilege: safeBoolean(
      row?.public_schema_usage_privilege,
    ),
    publicSchemaUsageGrantOption: safeBoolean(
      row?.public_schema_usage_grant_option,
    ),
    publicSchemaCreatePrivilege: safeBoolean(
      row?.public_schema_create_privilege,
    ),
    roleMembershipCount: safeCount(row?.role_membership_count),
    ownedDatabaseCount: safeCount(row?.owned_database_count),
    ownedSchemaCount: safeCount(row?.owned_schema_count),
    ownedRelationCount: safeCount(row?.owned_relation_count),
    ownedFunctionCount: safeCount(row?.owned_function_count),
    ownedTypeCount: safeCount(row?.owned_type_count),
    ownershipDependencyCount: safeCount(row?.ownership_dependency_count),
    otherDatabaseConnectCount: safeCount(row?.other_database_connect_count),
    explicitOtherDatabaseConnectCount: safeCount(
      row?.explicit_other_database_connect_count,
    ),
    nonPublicSchemaUsageCount: safeCount(
      row?.non_public_schema_usage_count,
    ),
    nonPublicSchemaCreateCount: safeCount(
      row?.non_public_schema_create_count,
    ),
    systemSchemaCreateCount: safeCount(row?.system_schema_create_count),
    systemSchemaPrivilegeCount: safeCount(
      row?.system_schema_privilege_count,
    ),
    systemObjectPrivilegeCount: safeCount(
      row?.system_object_privilege_count,
    ),
    systemSecurityDefinerFunctionCount: safeCount(
      row?.system_security_definer_function_count,
    ),
    systemHighOidExecutableFunctionCount: safeCount(
      row?.system_high_oid_executable_function_count,
    ),
    writableRelationCount: safeCount(row?.writable_relation_count),
    tableSelectRelationCount: safeCount(
      row?.table_select_relation_count,
    ),
    excessSelectColumnCount: safeCount(row?.excess_select_column_count),
    tableSelectGrantOptionCount: safeCount(
      row?.table_select_grant_option_count,
    ),
    columnSelectGrantOptionCount: safeCount(
      row?.column_select_grant_option_count,
    ),
    requiredRelationMissingCount: safeCount(
      row?.required_relation_missing_count,
    ),
    requiredSelectMissingCount: safeCount(
      row?.required_select_missing_count,
    ),
    requiredRelationRlsCount: safeCount(
      row?.required_relation_rls_count,
    ),
    publicRelationPrivilegeCount: safeCount(
      row?.public_relation_privilege_count,
    ),
    publicColumnPrivilegeCount: safeCount(
      row?.public_column_privilege_count,
    ),
    sequencePrivilegeCount: safeCount(row?.sequence_privilege_count),
    executableUserFunctionCount: safeCount(
      row?.executable_user_function_count,
    ),
    foreignServerUsageCount: safeCount(row?.foreign_server_usage_count),
    foreignDataWrapperUsageCount: safeCount(
      row?.foreign_data_wrapper_usage_count,
    ),
    parameterPrivilegeCount: safeCount(
      row?.parameter_privilege_count,
    ),
    largeObjectPrivilegeCount: safeCount(
      row?.large_object_privilege_count,
    ),
  };
  state.syntheticPublicConnectException =
    allowSyntheticPublicConnect &&
    state.otherDatabaseConnectCount > 0 &&
    state.explicitOtherDatabaseConnectCount === 0;
  state.otherDatabaseConnectReady =
    state.otherDatabaseConnectCount === 0 ||
    state.syntheticPublicConnectException;
  state.ready =
    state.sessionRoleUnchanged &&
    state.transactionReadOnly &&
    state.repeatableRead &&
    state.roleCanLogin &&
    !state.roleInherits &&
    !state.roleSuperuser &&
    !state.roleCanCreateRole &&
    !state.roleCanCreateDatabase &&
    !state.roleReplication &&
    !state.roleBypassRls &&
    !state.databaseOwner &&
    !state.publicSchemaOwner &&
    state.currentDatabaseConnectPrivilege &&
    !state.currentDatabaseConnectGrantOption &&
    !state.databaseCreatePrivilege &&
    !state.databaseTempPrivilege &&
    state.publicSchemaUsagePrivilege &&
    !state.publicSchemaUsageGrantOption &&
    !state.publicSchemaCreatePrivilege &&
    state.otherDatabaseConnectReady &&
    ZERO_PRIVILEGE_FIELDS.every((field) => state[field] === 0);
  return state;
}

export function buildInventoryState(rows) {
  if (!Array.isArray(rows)) {
    contractError(
      "INVENTORY_ROWS_INVALID",
      "The database did not return inventory aggregates.",
    );
  }
  const findings = [];
  const metrics = {};
  const seenFindingCodes = new Set();
  const seenMetricCodes = new Set();
  for (const row of rows) {
    const rowType = String(row?.row_type ?? "");
    const code = String(row?.code ?? "");
    const count = safeCount(row?.count, "INVENTORY_COUNT_INVALID");
    if (rowType === "FINDING") {
      const severity = String(row?.severity ?? "");
      if (
        !Object.hasOwn(FINDING_MANIFEST, code) ||
        FINDING_MANIFEST[code] !== severity ||
        seenFindingCodes.has(code)
      ) {
        contractError(
          "INVENTORY_FINDING_MANIFEST_MISMATCH",
          "The database returned an unknown or duplicate finding.",
        );
      }
      seenFindingCodes.add(code);
      findings.push({ code, severity, count });
      continue;
    }
    if (
      rowType !== "METRIC" ||
      !EXPECTED_METRIC_CODES.includes(code) ||
      seenMetricCodes.has(code)
    ) {
      contractError(
        "INVENTORY_METRIC_MANIFEST_MISMATCH",
        "The database returned an unknown or duplicate metric.",
      );
    }
    seenMetricCodes.add(code);
    metrics[code] = count;
  }
  if (
    seenFindingCodes.size !== Object.keys(FINDING_MANIFEST).length ||
    seenMetricCodes.size !== EXPECTED_METRIC_CODES.length
  ) {
    contractError(
      "INVENTORY_AGGREGATE_INCOMPLETE",
      "The database inventory aggregate set is incomplete.",
    );
  }
  findings.sort(
    (left, right) =>
      left.severity.localeCompare(right.severity, "en") ||
      left.code.localeCompare(right.code, "en"),
  );
  const totals = { BLOCKING: 0, PROPOSAL: 0, REVIEW: 0 };
  for (const finding of findings) {
    totals[finding.severity] += finding.count;
  }
  const nonZeroCodes = (severity) =>
    findings
      .filter(
        (finding) => finding.severity === severity && finding.count > 0,
      )
      .map((finding) => finding.code);
  const decision =
    totals.BLOCKING > 0
      ? "BLOCKED"
      : totals.REVIEW > 0
        ? "REVIEW"
        : totals.PROPOSAL > 0
          ? "READY_FOR_PROPOSAL"
          : "PASS";
  return {
    findings,
    metrics: Object.fromEntries(
      EXPECTED_METRIC_CODES.map((code) => [code, metrics[code]]),
    ),
    summary: {
      decision,
      blockingTotal: totals.BLOCKING,
      proposalTotal: totals.PROPOSAL,
      reviewTotal: totals.REVIEW,
      blockingCodes: nonZeroCodes("BLOCKING"),
      proposalCodes: nonZeroCodes("PROPOSAL"),
      reviewCodes: nonZeroCodes("REVIEW"),
    },
  };
}

function computeHmac(domain, value, hmacKey) {
  return createHmac("sha256", hmacKey)
    .update(`${domain}\0${canonicalStringify(value)}`)
    .digest("hex");
}

function snapshotState(snapshotRow, config) {
  const asOf = normalizeIsoTimestamp(
    snapshotRow?.generated_at,
    "DATABASE_SNAPSHOT_TIMESTAMP_INVALID",
  );
  const currentSchemaIsPublic =
    String(snapshotRow?.current_schema ?? "") === "public";
  const databaseNameMatched =
    String(snapshotRow?.current_database ?? "") ===
    config.expectedDatabaseName;
  const sessionRoleUnchanged =
    String(snapshotRow?.current_role ?? "") ===
    String(snapshotRow?.session_role ?? "");
  const serverVersionNumber = safeCount(
    snapshotRow?.server_version_num,
    "DATABASE_SERVER_VERSION_INVALID",
  );
  const postgresqlMajor = Math.floor(serverVersionNumber / 10_000);
  const databaseIdentityDigest = computeHmac(
    "identity-legacy-inventory-database-v1",
    {
      clusterSystemIdentifier: String(
        snapshotRow?.cluster_system_identifier ?? "",
      ),
      databaseOid: String(snapshotRow?.database_oid ?? ""),
      databaseName: String(snapshotRow?.current_database ?? ""),
    },
    config.hmacKey,
  );
  const databaseIdentityDigestRequired =
    config.expectedDatabaseIdentityDigest !== null;
  const databaseIdentityDigestMatched =
    !databaseIdentityDigestRequired ||
    databaseIdentityDigest === config.expectedDatabaseIdentityDigest;
  const transportEncrypted = safeBoolean(
    snapshotRow?.transport_encrypted,
    "DATABASE_TRANSPORT_STATE_INVALID",
  );
  const transportEncryptionMatched =
    !config.transportEncryptionRequired || transportEncrypted;
  const roleIdentityDigest = computeHmac(
    "identity-legacy-inventory-role-v1",
    { role: String(snapshotRow?.current_role ?? "") },
    config.hmacKey,
  );
  return {
    asOf,
    currentSchemaIsPublic,
    databaseNameMatched,
    sessionRoleUnchanged,
    postgresqlMajor,
    postgresqlMajorSupported: postgresqlMajor === 16,
    databaseIdentityDigest,
    databaseIdentityDigestRequired,
    databaseIdentityDigestMatched,
    transportEncrypted,
    transportEncryptionRequired: config.transportEncryptionRequired,
    transportEncryptionMatched,
    roleIdentityDigest,
  };
}

export function buildReport({
  config,
  snapshotRow,
  migrationState,
  catalogState,
  privilegeState,
  inventoryState = null,
  releaseArtifactBound = true,
  generatedAt = new Date(),
}) {
  if (!releaseArtifactBound && config.productionAttested) {
    contractError(
      "SYNTHETIC_ARTIFACT_PRODUCTION_PROHIBITED",
      "An injected fixture artifact cannot be used for production evidence.",
    );
  }
  const snapshot = snapshotState(snapshotRow, config);
  const schemaRejectionCodes = [];
  if (!snapshot.currentSchemaIsPublic) {
    schemaRejectionCodes.push("PUBLIC_SCHEMA_REQUIRED");
  }
  if (!snapshot.databaseNameMatched) {
    schemaRejectionCodes.push("DATABASE_IDENTITY_MISMATCH");
  }
  if (!snapshot.databaseIdentityDigestMatched) {
    schemaRejectionCodes.push("DATABASE_IDENTITY_DIGEST_MISMATCH");
  }
  if (!snapshot.transportEncryptionMatched) {
    schemaRejectionCodes.push("ENCRYPTED_TRANSPORT_REQUIRED");
  }
  if (!snapshot.postgresqlMajorSupported) {
    schemaRejectionCodes.push("POSTGRESQL_16_REQUIRED");
  }
  if (migrationState?.checked !== false && !migrationState?.ready) {
    schemaRejectionCodes.push("MIGRATION_STATE_MISMATCH");
  }
  if (!catalogState?.ready) {
    schemaRejectionCodes.push("CATALOG_STATE_MISMATCH");
  }
  const admissionRejectionCodes = [];
  if (!snapshot.sessionRoleUnchanged || !privilegeState?.ready) {
    admissionRejectionCodes.push("LEAST_PRIVILEGE_ROLE_REQUIRED");
  }
  const admitted =
    schemaRejectionCodes.length === 0 &&
    admissionRejectionCodes.length === 0;
  if (admitted !== Boolean(inventoryState)) {
    contractError(
      "INVENTORY_EXECUTION_GATE_MISMATCH",
      "Inventory execution did not match admission state.",
    );
  }
  const decision =
    schemaRejectionCodes.length > 0
      ? "SCHEMA_MISMATCH"
      : admissionRejectionCodes.length > 0
        ? "ADMISSION_MISMATCH"
        : inventoryState.summary.decision;
  const stableReport = {
    script: SCRIPT_NAME,
    reportSchemaVersion: REPORT_SCHEMA_VERSION,
    contract: CONTRACT_NAME,
    expectedState: STAFF_TASK_CURRENT_RELEASE_STATE,
    releaseSha: config.releaseSha,
    keyVersion: config.hmacKeyVersion,
    targetDigest: computeHmac(
      "identity-legacy-inventory-target-v1",
      { target: config.target },
      config.hmacKey,
    ),
    asOf: snapshot.asOf,
    safety: {
      databaseWrites: false,
      inventoryOnly: true,
      proposalRowsSupported: false,
      applySupported: false,
      rollbackSupported: false,
      accountCreationSupported: false,
      inviteDeliverySupported: false,
      connectionLimit: 1,
      transactionReadOnly: true,
      isolationLevel: "REPEATABLE READ",
      leastPrivilegeRoleRequired: true,
      exactColumnSelectAllowlistRequired: true,
      releaseArtifactBound,
      outputContainsDatabaseName: false,
      outputContainsRoleName: false,
      outputContainsRowIdentifiers: false,
      outputContainsEmailAddresses: false,
      evidenceAuthorizesProposalOrApply: false,
    },
    limits: {
      connectTimeoutSeconds: config.connectTimeoutSeconds,
      lockTimeoutMs: config.lockTimeoutMs,
      statementTimeoutMs: config.statementTimeoutMs,
      transactionTimeoutMs: config.transactionTimeoutMs,
    },
    database: {
      currentSchemaIsPublic: snapshot.currentSchemaIsPublic,
      databaseNameMatched: snapshot.databaseNameMatched,
      postgresqlMajor: snapshot.postgresqlMajor,
      postgresqlMajorSupported: snapshot.postgresqlMajorSupported,
      databaseIdentityDigest: snapshot.databaseIdentityDigest,
      databaseIdentityDigestRequired:
        snapshot.databaseIdentityDigestRequired,
      databaseIdentityDigestMatched:
        snapshot.databaseIdentityDigestMatched,
      transportEncrypted: snapshot.transportEncrypted,
      transportEncryptionRequired:
        snapshot.transportEncryptionRequired,
      transportEncryptionMatched: snapshot.transportEncryptionMatched,
      roleIdentityDigest: snapshot.roleIdentityDigest,
      migrations: migrationState,
      catalog: catalogState,
      privileges: privilegeState,
    },
    findings: inventoryState?.findings ?? [],
    metrics: inventoryState?.metrics ?? {},
    summary: {
      decision,
      evidenceScope: releaseArtifactBound
        ? "RELEASE_BOUND"
        : "SYNTHETIC_FIXTURE",
      schemaRejectionCodes,
      admissionRejectionCodes,
      inventoryExecuted: admitted,
      blockingTotal: inventoryState?.summary.blockingTotal ?? 0,
      proposalTotal: inventoryState?.summary.proposalTotal ?? 0,
      reviewTotal: inventoryState?.summary.reviewTotal ?? 0,
      blockingCodes: inventoryState?.summary.blockingCodes ?? [],
      proposalCodes: inventoryState?.summary.proposalCodes ?? [],
      reviewCodes: inventoryState?.summary.reviewCodes ?? [],
    },
  };
  const normalizedGeneratedAt = normalizeIsoTimestamp(
    generatedAt,
    "REPORT_GENERATED_AT_INVALID",
  );
  const contentDigest = computeHmac(
    "identity-legacy-inventory-content-v1",
    stableReport,
    config.hmacKey,
  );
  return {
    ...stableReport,
    generatedAt: normalizedGeneratedAt,
    contentDigest,
    executionDigest: computeHmac(
      "identity-legacy-inventory-execution-v1",
      { contentDigest, generatedAt: normalizedGeneratedAt },
      config.hmacKey,
    ),
  };
}

export function exitCodeForReport(report, hmacKey) {
  const hmacKeyBytes = Buffer.byteLength(String(hmacKey ?? ""), "utf8");
  if (
    hmacKeyBytes < 32 ||
    hmacKeyBytes > MAX_HMAC_KEY_BYTES ||
    report?.script !== SCRIPT_NAME ||
    report?.reportSchemaVersion !== REPORT_SCHEMA_VERSION ||
    !HMAC_PATTERN.test(String(report?.contentDigest ?? "")) ||
    !HMAC_PATTERN.test(String(report?.executionDigest ?? ""))
  ) {
    return 1;
  }
  const { generatedAt, contentDigest, executionDigest, ...stableReport } =
    report;
  let normalizedGeneratedAt;
  try {
    normalizedGeneratedAt = normalizeIsoTimestamp(
      generatedAt,
      "REPORT_GENERATED_AT_INVALID",
    );
  } catch {
    return 1;
  }
  const expectedContentDigest = computeHmac(
    "identity-legacy-inventory-content-v1",
    stableReport,
    hmacKey,
  );
  const expectedExecutionDigest = computeHmac(
    "identity-legacy-inventory-execution-v1",
    { contentDigest: expectedContentDigest, generatedAt: normalizedGeneratedAt },
    hmacKey,
  );
  if (
    contentDigest !== expectedContentDigest ||
    executionDigest !== expectedExecutionDigest
  ) {
    return 1;
  }
  const decision = report?.summary?.decision;
  const inventoryExecuted = report?.summary?.inventoryExecuted;
  const releaseArtifactBound = report?.safety?.releaseArtifactBound;
  const evidenceScope = report?.summary?.evidenceScope;
  const findings = report?.findings;
  const metrics = report?.metrics;
  const schemaRejectionCodes = report?.summary?.schemaRejectionCodes;
  const admissionRejectionCodes = report?.summary?.admissionRejectionCodes;
  if (
    !Array.isArray(findings) ||
    !metrics ||
    typeof metrics !== "object" ||
    !Array.isArray(schemaRejectionCodes) ||
    !Array.isArray(admissionRejectionCodes)
  ) {
    return 1;
  }
  if (
    typeof releaseArtifactBound !== "boolean" ||
    evidenceScope !==
      (releaseArtifactBound ? "RELEASE_BOUND" : "SYNTHETIC_FIXTURE")
  ) {
    return 1;
  }
  if (inventoryExecuted === true) {
    if (
      findings.length !== Object.keys(FINDING_MANIFEST).length ||
      Object.keys(metrics).length !== EXPECTED_METRIC_CODES.length ||
      !EXPECTED_METRIC_CODES.every(
        (code) =>
          Object.hasOwn(metrics, code) &&
          Number.isSafeInteger(metrics[code]) &&
          metrics[code] >= 0,
      ) ||
      schemaRejectionCodes.length !== 0 ||
      admissionRejectionCodes.length !== 0
    ) {
      return 1;
    }
    const seen = new Set();
    const totals = { BLOCKING: 0, PROPOSAL: 0, REVIEW: 0 };
    const nonZeroCodes = { BLOCKING: [], PROPOSAL: [], REVIEW: [] };
    for (const finding of findings) {
      if (
        !Object.hasOwn(FINDING_MANIFEST, finding?.code) ||
        FINDING_MANIFEST[finding.code] !== finding?.severity ||
        seen.has(finding.code) ||
        !Number.isSafeInteger(finding?.count) ||
        finding.count < 0
      ) {
        return 1;
      }
      seen.add(finding.code);
      totals[finding.severity] += finding.count;
      if (finding.count > 0) {
        nonZeroCodes[finding.severity].push(finding.code);
      }
    }
    const expectedDecision =
      totals.BLOCKING > 0
        ? "BLOCKED"
        : totals.REVIEW > 0
          ? "REVIEW"
          : totals.PROPOSAL > 0
            ? "READY_FOR_PROPOSAL"
            : "PASS";
    if (
      decision !== expectedDecision ||
      report.summary.blockingTotal !== totals.BLOCKING ||
      report.summary.proposalTotal !== totals.PROPOSAL ||
      report.summary.reviewTotal !== totals.REVIEW ||
      !arraysEqual(
        report.summary.blockingCodes ?? [],
        nonZeroCodes.BLOCKING,
      ) ||
      !arraysEqual(
        report.summary.proposalCodes ?? [],
        nonZeroCodes.PROPOSAL,
      ) ||
      !arraysEqual(report.summary.reviewCodes ?? [], nonZeroCodes.REVIEW)
    ) {
      return 1;
    }
  } else if (
    findings.length !== 0 ||
    Object.keys(metrics).length !== 0 ||
    report?.summary?.blockingTotal !== 0 ||
    report?.summary?.proposalTotal !== 0 ||
    report?.summary?.reviewTotal !== 0
  ) {
    return 1;
  }
  if (decision === "PASS" || decision === "READY_FOR_PROPOSAL") {
    return inventoryExecuted === true ? 0 : 1;
  }
  if (decision === "BLOCKED" || decision === "REVIEW") {
    return inventoryExecuted === true ? 2 : 1;
  }
  if (
    decision === "SCHEMA_MISMATCH" ||
    decision === "ADMISSION_MISMATCH"
  ) {
    return inventoryExecuted === false ? 3 : 1;
  }
  return 1;
}

function stripSqlLiterals(query) {
  return query.replace(/'(?:''|[^'])*'/gu, "''");
}

function assertReadOnlySource() {
  const mutatingKeyword =
    /\b(?:INSERT|UPDATE|DELETE|MERGE|ALTER|CREATE|DROP|TRUNCATE|COPY|CALL|DO|GRANT|REVOKE)\b/iu;
  for (const query of [
    SNAPSHOT_STATE_SQL,
    APPLIED_MIGRATION_STATE_SQL,
    CATALOG_STATE_SQL,
    PRIVILEGE_STATE_SQL,
    INVENTORY_SQL,
  ]) {
    const stripped = stripSqlLiterals(query);
    assert.match(stripped.trim(), /^(?:SELECT|WITH)\b/iu);
    assert.doesNotMatch(stripped, mutatingKeyword);
    assert.doesNotMatch(stripped, /SELECT\s+\*/iu);
  }
  assert.doesNotMatch(
    INVENTORY_SQL,
    /passwordHash|tokenHash|fullName|createdByUserId|revokedByUserId/iu,
  );
  assert.match(
    INVENTORY_SQL,
    /lower\(btrim\([^)]*\)\s+COLLATE\s+"C"\)/iu,
  );
  assert.equal(
    Object.entries(FINDING_MANIFEST).filter(
      ([, severity]) => severity === "PROPOSAL",
    ).length,
    2,
  );
}

function selfTestEnvironment() {
  return {
    NODE_ENV: "test",
    DATABASE_URL:
      "postgresql://identity_reader:secret@127.0.0.1:5432/identity_inventory_ci?schema=public",
    RELEASE_SHA: "a".repeat(40),
    IDENTITY_LEGACY_INVENTORY_TARGET: "development",
    IDENTITY_LEGACY_INVENTORY_CONFIRM: RUN_CONFIRMATION,
    IDENTITY_LEGACY_INVENTORY_EXPECTED_DATABASE: "identity_inventory_ci",
    IDENTITY_LEGACY_INVENTORY_HMAC_KEY:
      "identity-inventory-self-test-key-aaaaaaaa",
    IDENTITY_LEGACY_INVENTORY_HMAC_KEY_VERSION: HMAC_KEY_VERSION,
  };
}

function selfTestCatalogRow() {
  return {
    expected_relation_count: String(EXPECTED_CATALOG_RELATIONS.length),
    matched_relation_count: String(EXPECTED_CATALOG_RELATIONS.length),
    expected_column_count: String(EXPECTED_CATALOG_COLUMNS.length),
    matched_column_count: String(EXPECTED_CATALOG_COLUMNS.length),
    matched_constraint_count: String(EXPECTED_CONSTRAINT_MANIFEST.length),
    actual_constraint_count: String(EXPECTED_CONSTRAINT_MANIFEST.length),
    matched_index_count: String(EXPECTED_INDEX_MANIFEST.length),
    actual_index_count: String(EXPECTED_INDEX_MANIFEST.length),
    matched_function_count: String(EXPECTED_FUNCTION_MANIFEST.length),
    actual_function_count: String(EXPECTED_FUNCTION_MANIFEST.length),
    matched_enum_label_count: "3",
    total_enum_label_count: "3",
    matched_trigger_count: String(EXPECTED_TRIGGER_MANIFEST.length),
    actual_identity_claim_trigger_count: String(
      EXPECTED_TRIGGER_MANIFEST.length,
    ),
    matched_ri_trigger_count: String(EXPECTED_RI_TRIGGER_MANIFEST.length),
    actual_ri_trigger_count: String(EXPECTED_RI_TRIGGER_MANIFEST.length),
  };
}

function selfTestPrivilegeRow() {
  return {
    session_role_unchanged: true,
    transaction_read_only: true,
    repeatable_read: true,
    role_can_login: true,
    role_inherits: false,
    role_superuser: false,
    role_can_create_role: false,
    role_can_create_database: false,
    role_replication: false,
    role_bypass_rls: false,
    database_owner: false,
    public_schema_owner: false,
    current_database_connect_privilege: true,
    current_database_connect_grant_option: false,
    database_create_privilege: false,
    database_temp_privilege: false,
    public_schema_usage_privilege: true,
    public_schema_usage_grant_option: false,
    public_schema_create_privilege: false,
    role_membership_count: "0",
    owned_database_count: "0",
    owned_schema_count: "0",
    owned_relation_count: "0",
    owned_function_count: "0",
    owned_type_count: "0",
    ownership_dependency_count: "0",
    other_database_connect_count: "0",
    explicit_other_database_connect_count: "0",
    non_public_schema_usage_count: "0",
    non_public_schema_create_count: "0",
    system_schema_create_count: "0",
    system_schema_privilege_count: "0",
    system_object_privilege_count: "0",
    system_security_definer_function_count: "0",
    system_high_oid_executable_function_count: "0",
    writable_relation_count: "0",
    table_select_relation_count: "0",
    excess_select_column_count: "0",
    table_select_grant_option_count: "0",
    column_select_grant_option_count: "0",
    required_relation_missing_count: "0",
    required_select_missing_count: "0",
    required_relation_rls_count: "0",
    public_relation_privilege_count: "0",
    public_column_privilege_count: "0",
    sequence_privilege_count: "0",
    executable_user_function_count: "0",
    foreign_server_usage_count: "0",
    foreign_data_wrapper_usage_count: "0",
    parameter_privilege_count: "0",
    large_object_privilege_count: "0",
  };
}

function selfTestInventoryRows(overrides = {}) {
  const counts = Object.fromEntries(
    Object.keys(FINDING_MANIFEST).map((code) => [code, 0]),
  );
  Object.assign(counts, overrides);
  return [
    ...Object.entries(FINDING_MANIFEST).map(([code, severity]) => ({
      row_type: "FINDING",
      code,
      severity,
      count: String(counts[code]),
    })),
    ...EXPECTED_METRIC_CODES.map((code) => ({
      row_type: "METRIC",
      code,
      severity: null,
      count: "0",
    })),
  ];
}

export function runSelfTest() {
  assert.deepEqual(parseArguments(["--pretty"]), {
    help: false,
    selfTest: false,
    verifyReleaseArtifact: false,
    pretty: true,
  });
  assert.throws(() => parseArguments(["--apply"]), {
    code: "CLI_ARGUMENT_UNSUPPORTED",
  });
  assert.throws(() => parseArguments(["--fix"]), {
    code: "CLI_ARGUMENT_UNSUPPORTED",
  });

  const config = parseRuntimeContract(selfTestEnvironment());
  assert.match(
    buildReadOnlyDatabaseUrl(config.databaseUrl, config),
    /connection_limit=1/u,
  );
  const migrationNames = Array.from(
    { length: CURRENT_EXPECTED_MIGRATION_COUNT },
    (_, index) =>
      index === CURRENT_EXPECTED_MIGRATION_COUNT - 1
        ? CURRENT_EXPECTED_LATEST_MIGRATION
        : `${String(index).padStart(14, "0")}_self_test`,
  );
  const migrationState = buildMigrationState(
    {
      migrationNames,
      sourceManifestDigest: "b".repeat(64),
    },
    migrationNames.map((migrationName) => ({
      migration_name: migrationName,
      finished_at: new Date("2026-07-29T00:00:00.000Z"),
      rolled_back_at: null,
    })),
  );
  const catalogState = buildCatalogState(selfTestCatalogRow());
  const privilegeState = buildPrivilegeState(selfTestPrivilegeRow());
  const snapshotRow = {
    generated_at: new Date("2026-07-29T12:00:00.000Z"),
    current_schema: "public",
    current_database: "identity_inventory_ci",
    current_role: "identity_reader",
    session_role: "identity_reader",
    cluster_system_identifier: "1234567890123456789",
    database_oid: "16384",
    server_version_num: "160009",
    transport_encrypted: false,
  };
  const passInventory = buildInventoryState(selfTestInventoryRows());
  const passReport = buildReport({
    config,
    snapshotRow,
    migrationState,
    catalogState,
    privilegeState,
    inventoryState: passInventory,
    generatedAt: new Date("2026-07-29T12:00:01.000Z"),
  });
  assert.equal(passReport.summary.decision, "PASS");
  assert.equal(exitCodeForReport(passReport, config.hmacKey), 0);

  const proposalInventory = buildInventoryState(
    selfTestInventoryRows({ USER_CLAIM_CREATE_CANDIDATE: 1 }),
  );
  const proposalReport = buildReport({
    config,
    snapshotRow,
    migrationState,
    catalogState,
    privilegeState,
    inventoryState: proposalInventory,
    generatedAt: new Date("2026-07-29T12:00:01.000Z"),
  });
  assert.equal(proposalReport.summary.decision, "READY_FOR_PROPOSAL");
  assert.equal(exitCodeForReport(proposalReport, config.hmacKey), 0);

  const reviewInventory = buildInventoryState(
    selfTestInventoryRows({
      LIVE_INVITE_CLAIM_CREATE_CANDIDATE: 1,
      LIVE_INVITE_LEGACY_TOKEN_REVIEW: 1,
    }),
  );
  const reviewReport = buildReport({
    config,
    snapshotRow,
    migrationState,
    catalogState,
    privilegeState,
    inventoryState: reviewInventory,
    generatedAt: new Date("2026-07-29T12:00:01.000Z"),
  });
  assert.equal(reviewReport.summary.decision, "REVIEW");
  assert.equal(exitCodeForReport(reviewReport, config.hmacKey), 2);

  const blockedInventory = buildInventoryState(
    selfTestInventoryRows({ ACTIVE_IDENTITY_CANONICAL_COLLISION: 1 }),
  );
  const blockedReport = buildReport({
    config,
    snapshotRow,
    migrationState,
    catalogState,
    privilegeState,
    inventoryState: blockedInventory,
    generatedAt: new Date("2026-07-29T12:00:01.000Z"),
  });
  assert.equal(blockedReport.summary.decision, "BLOCKED");
  assert.equal(exitCodeForReport(blockedReport, config.hmacKey), 2);

  const rejectedPrivilege = {
    ...privilegeState,
    ready: false,
    writableRelationCount: 1,
  };
  const rejectedReport = buildReport({
    config,
    snapshotRow,
    migrationState,
    catalogState,
    privilegeState: rejectedPrivilege,
    inventoryState: null,
    generatedAt: new Date("2026-07-29T12:00:01.000Z"),
  });
  assert.equal(rejectedReport.summary.decision, "ADMISSION_MISMATCH");
  assert.equal(rejectedReport.summary.inventoryExecuted, false);
  assert.equal(exitCodeForReport(rejectedReport, config.hmacKey), 3);

  const repeatedReport = buildReport({
    config,
    snapshotRow,
    migrationState,
    catalogState,
    privilegeState,
    inventoryState: passInventory,
    generatedAt: new Date("2026-07-29T12:00:01.000Z"),
  });
  assert.equal(passReport.contentDigest, repeatedReport.contentDigest);
  assert.equal(passReport.executionDigest, repeatedReport.executionDigest);

  const serialized = JSON.stringify(passReport);
  assert.doesNotMatch(serialized, /identity_inventory_ci/u);
  assert.doesNotMatch(serialized, /identity_reader|secret/u);
  assert.doesNotMatch(serialized, /1234567890123456789|16384/u);

  const tampered = structuredClone(passReport);
  tampered.summary.blockingTotal = 1;
  assert.equal(exitCodeForReport(tampered, config.hmacKey), 1);
  assertReadOnlySource();
  return {
    script: SCRIPT_NAME,
    status: "PASS",
    checks: 18,
  };
}

export async function inspectDatabase(
  environment,
  config,
  {
    expectedMigrationArtifact = null,
    prismaFactory = (datasourceUrl) =>
      new PrismaClient({ datasourceUrl, log: [] }),
  } = {},
) {
  assertRuntimeDependencyVersions();
  const releaseArtifactBound = expectedMigrationArtifact === null;
  if (!releaseArtifactBound && config.productionAttested) {
    contractError(
      "SYNTHETIC_ARTIFACT_PRODUCTION_PROHIBITED",
      "An injected fixture artifact cannot be used for production evidence.",
    );
  }
  const migrationArtifact =
    expectedMigrationArtifact ??
    (await loadExpectedMigrationArtifact(config.releaseSha));
  const datasourceUrl = buildReadOnlyDatabaseUrl(
    environment.DATABASE_URL,
    config,
  );
  const prisma = prismaFactory(datasourceUrl);
  try {
    return await prisma.$transaction(
      async (transaction) => {
        await transaction.$executeRawUnsafe("SET TRANSACTION READ ONLY");
        await transaction.$executeRawUnsafe("SET LOCAL TIME ZONE 'UTC'");
        await transaction.$executeRawUnsafe(
          "SET LOCAL search_path = public, pg_catalog",
        );
        await transaction.$executeRawUnsafe(
          `SET LOCAL lock_timeout = '${config.lockTimeoutMs}ms'`,
        );
        await transaction.$executeRawUnsafe(
          `SET LOCAL statement_timeout = '${config.statementTimeoutMs}ms'`,
        );
        await transaction.$executeRawUnsafe(
          `SET LOCAL idle_in_transaction_session_timeout = '${config.transactionTimeoutMs}ms'`,
        );

        const snapshotRows =
          await transaction.$queryRawUnsafe(SNAPSHOT_STATE_SQL);
        const catalogRows =
          await transaction.$queryRawUnsafe(CATALOG_STATE_SQL);
        const privilegeRows =
          await transaction.$queryRawUnsafe(PRIVILEGE_STATE_SQL);
        if (
          !snapshotRows[0] ||
          !catalogRows[0] ||
          !privilegeRows[0]
        ) {
          contractError(
            "DATABASE_ADMISSION_STATE_MISSING",
            "The database did not return complete admission state.",
          );
        }
        const catalogState = buildCatalogState(catalogRows[0]);
        const privilegeState = buildPrivilegeState(privilegeRows[0], {
          allowSyntheticPublicConnect: !releaseArtifactBound,
        });
        const snapshot = snapshotState(snapshotRows[0], config);
        const preMigrationGate =
          snapshot.currentSchemaIsPublic &&
          snapshot.databaseNameMatched &&
          snapshot.postgresqlMajorSupported &&
          snapshot.databaseIdentityDigestMatched &&
          snapshot.transportEncryptionMatched &&
          snapshot.sessionRoleUnchanged &&
          catalogState.ready &&
          privilegeState.ready;
        const migrationState = preMigrationGate
          ? buildMigrationState(
              migrationArtifact,
              await transaction.$queryRawUnsafe(
                APPLIED_MIGRATION_STATE_SQL,
              ),
            )
          : {
              ...buildMigrationState(migrationArtifact, []),
              checked: false,
            };
        const admitted =
          snapshot.currentSchemaIsPublic &&
          snapshot.databaseNameMatched &&
          snapshot.postgresqlMajorSupported &&
          snapshot.databaseIdentityDigestMatched &&
          snapshot.transportEncryptionMatched &&
          snapshot.sessionRoleUnchanged &&
          migrationState.ready &&
          catalogState.ready &&
          privilegeState.ready;
        if (!admitted) {
          return buildReport({
            config,
            snapshotRow: snapshotRows[0],
            migrationState,
            catalogState,
            privilegeState,
            inventoryState: null,
            releaseArtifactBound,
          });
        }
        const inventoryRows =
          await transaction.$queryRawUnsafe(INVENTORY_SQL);
        return buildReport({
          config,
          snapshotRow: snapshotRows[0],
          migrationState,
          catalogState,
          privilegeState,
          inventoryState: buildInventoryState(inventoryRows),
          releaseArtifactBound,
        });
      },
      {
        isolationLevel: "RepeatableRead",
        timeout: config.transactionTimeoutMs,
        maxWait: Math.min(config.transactionTimeoutMs, 10_000),
      },
    );
  } finally {
    await prisma.$disconnect();
  }
}

function renderJson(value, pretty) {
  return JSON.stringify(value, null, pretty ? 2 : 0);
}

export async function main(
  argv = process.argv.slice(2),
  environment = process.env,
  io = console,
) {
  let args;
  try {
    args = parseArguments(argv);
    if (args.help) {
      io.log(HELP);
      return 0;
    }
    if (args.selfTest) {
      io.log(renderJson(runSelfTest(), args.pretty));
      return 0;
    }
    if (args.verifyReleaseArtifact) {
      const releaseSha = String(environment.RELEASE_SHA ?? "").trim();
      const artifact = await loadExpectedMigrationArtifact(releaseSha);
      io.log(
        renderJson(
          {
            script: SCRIPT_NAME,
            status: "PASS",
            verification: "RELEASE_ARTIFACT",
            releaseSha,
            migrationCount: artifact.migrationNames.length,
            latestMigration: artifact.migrationNames.at(-1) ?? "",
            sourceManifestDigest: artifact.sourceManifestDigest,
          },
          args.pretty,
        ),
      );
      return 0;
    }
    const config = parseRuntimeContract(environment);
    const report = await inspectDatabase(environment, config);
    io.log(renderJson(report, args.pretty));
    return exitCodeForReport(report, config.hmacKey);
  } catch (error) {
    io.error(
      renderJson(
        {
          script: SCRIPT_NAME,
          status: "ERROR",
          error: {
            code:
              error?.safeContractError === true &&
              /^[A-Z0-9_]+$/u.test(String(error?.code ?? ""))
                ? error.code
                : "DATABASE_ERROR",
          },
        },
        Boolean(args?.pretty),
      ),
    );
    return 1;
  }
}

const invokedPath = process.argv[1]
  ? path.resolve(process.argv[1]).toLowerCase()
  : "";
if (invokedPath === path.resolve(fileURLToPath(import.meta.url)).toLowerCase()) {
  process.exitCode = await main();
}

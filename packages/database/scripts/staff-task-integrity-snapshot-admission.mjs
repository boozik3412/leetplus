import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PrismaClient } from "@prisma/client";

import { parseBoundedInteger } from "./staff-task-integrity-inventory.mjs";
import {
  CATALOG_STATE_SQL,
  COMPOSITE_CONSTRAINTS,
  EXPECTED_LATEST_MIGRATION,
  EXPECTED_MIGRATION_COUNT,
  MIGRATION_STATE_SQL,
  PARENT_INDEXES,
  SIMPLE_CONSTRAINTS,
  SNAPSHOT_STATE_SQL,
  canonicalStringify,
  computeDatabaseIdentityDigest,
} from "./staff-task-integrity-reconciliation-plan.mjs";
import {
  computeNonceBoundDatabaseIdentityDigest,
  matchesVerifiedProductionLikeAuthority,
  verifyPinnedProductionLikeAuthority,
} from "./staff-task-integrity-snapshot-authority.mjs";

export const SCRIPT_NAME = "staff-task-integrity-snapshot-admission";
export const REPORT_SCHEMA_VERSION = 2;
export const RUN_CONFIRMATION = "run-staff-task-integrity-snapshot-admission";
export const ISOLATION_ATTESTATION =
  "I_ATTEST_THIS_IS_AN_ISOLATED_ENCRYPTED_NO_EGRESS_NON_PRODUCTION_SNAPSHOT";
export const BASELINE_STATE = "BASELINE_156";
export const EXPAND_STATE = "EXPAND_162";
export const BASELINE_MIGRATION_COUNT = 156;
export const BASELINE_LATEST_MIGRATION =
  "20260727120000_staff_task_catalog_audit_expand";

const CLASSIFICATIONS = new Set(["SYNTHETIC", "PRODUCTION_LIKE"]);
const EXPECTED_STATES = new Set([BASELINE_STATE, EXPAND_STATE]);
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const SYNTHETIC_DATABASE_PATTERN = /^lp_snapshot_admission_ci_[0-9a-f]{16}$/u;
const PRODUCTION_LIKE_DATABASE_PATTERN =
  /(?:^|[_-])(?:snapshot|rehearsal|preprod|staging|stage|test)(?:$|[_-])/i;
const DATABASE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$/;
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const HMAC_PATTERN = /^[0-9a-f]{64}$/;
const APPROVAL_REFERENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{2,127}$/;
const MIGRATION_NAME_PATTERN = /^\d{14}_[a-z0-9_]+$/;
const DEFAULT_LOCK_TIMEOUT_MS = 500;
const DEFAULT_STATEMENT_TIMEOUT_MS = 30_000;
const DEFAULT_TRANSACTION_TIMEOUT_MS = 120_000;
const MAX_HMAC_KEY_BYTES = 4_096;
const MAX_SYNTHETIC_LIFETIME_MS = 7 * 24 * 60 * 60 * 1_000;
const MAX_PRODUCTION_LIKE_LIFETIME_MS = 72 * 60 * 60 * 1_000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1_000;
const RELEASE_RUNTIME_SOURCE_PATHS = Object.freeze([
  "packages/database/scripts/staff-task-integrity-snapshot-admission.mjs",
  "packages/database/scripts/staff-task-integrity-snapshot-admission-smoke.mjs",
  "packages/database/scripts/staff-task-integrity-snapshot-authority.mjs",
  "packages/database/scripts/staff-task-integrity-snapshot-authority-roots.mjs",
  "packages/database/scripts/staff-task-integrity-reconciliation-plan.mjs",
  "packages/database/scripts/staff-task-integrity-reconciliation-proposal-dry-run.mjs",
  "packages/database/scripts/staff-task-integrity-inventory.mjs",
]);
const RELEASE_SOURCE_PATHS = Object.freeze([
  ...RELEASE_RUNTIME_SOURCE_PATHS,
  "packages/database/prisma/migrations",
]);

const REQUIRED_SELECT_RELATIONS = Object.freeze([
  "_prisma_migrations",
  "Tenant",
  "Store",
  "User",
  "UserStoreAccess",
  "StaffTaskTemplate",
  "StaffTaskRecurringRule",
  "StaffTaskRecurringRuleRun",
  "StaffTask",
]);

export const REQUIRED_COLUMN_SELECTS = Object.freeze({
  User: Object.freeze([
    "id",
    "tenantId",
    "isPlatformAdmin",
    "isActive",
    "accessScope",
  ]),
});

const REQUIRED_TABLE_SELECT_RELATIONS = Object.freeze(
  REQUIRED_SELECT_RELATIONS.filter(
    (relation) => !Object.hasOwn(REQUIRED_COLUMN_SELECTS, relation),
  ),
);
const PRODUCTION_LIKE_REPORT_EVIDENCE = new WeakMap();

function baselineForeignKey(
  childTable,
  name,
  localColumn,
  parentTable,
  deleteAction,
) {
  return Object.freeze({
    childTable,
    name,
    localColumns: Object.freeze([localColumn]),
    parentTable,
    parentColumns: Object.freeze(["id"]),
    deleteAction,
    updateAction: "c",
  });
}

const BASELINE_SIMPLE_CONSTRAINTS = Object.freeze([
  baselineForeignKey(
    "StaffTaskTemplate",
    "StaffTaskTemplate_storeId_fkey",
    "storeId",
    "Store",
    "n",
  ),
  baselineForeignKey(
    "StaffTaskTemplate",
    "StaffTaskTemplate_createdByUserId_fkey",
    "createdByUserId",
    "User",
    "n",
  ),
  baselineForeignKey(
    "StaffTaskRecurringRule",
    "StaffTaskRecurringRule_storeId_fkey",
    "storeId",
    "Store",
    "n",
  ),
  baselineForeignKey(
    "StaffTaskRecurringRule",
    "StaffTaskRecurringRule_templateId_fkey",
    "templateId",
    "StaffTaskTemplate",
    "n",
  ),
  baselineForeignKey(
    "StaffTaskRecurringRule",
    "StaffTaskRecurringRule_createdByUserId_fkey",
    "createdByUserId",
    "User",
    "n",
  ),
  baselineForeignKey(
    "StaffTaskRecurringRule",
    "StaffTaskRecurringRule_assignedToUserId_fkey",
    "assignedToUserId",
    "User",
    "n",
  ),
  baselineForeignKey(
    "StaffTaskRecurringRule",
    "StaffTaskRecurringRule_lastCreatedTaskId_fkey",
    "lastCreatedTaskId",
    "StaffTask",
    "n",
  ),
  baselineForeignKey(
    "StaffTaskRecurringRuleRun",
    "StaffTaskRecurringRuleRun_ruleId_fkey",
    "ruleId",
    "StaffTaskRecurringRule",
    "c",
  ),
  baselineForeignKey(
    "StaffTaskRecurringRuleRun",
    "StaffTaskRecurringRuleRun_createdTaskId_fkey",
    "createdTaskId",
    "StaffTask",
    "n",
  ),
  baselineForeignKey(
    "StaffTask",
    "StaffTask_storeId_fkey",
    "storeId",
    "Store",
    "n",
  ),
  baselineForeignKey(
    "StaffTask",
    "StaffTask_sourceTemplateId_fkey",
    "sourceTemplateId",
    "StaffTaskTemplate",
    "n",
  ),
  baselineForeignKey(
    "StaffTask",
    "StaffTask_sourceRecurringRuleId_fkey",
    "sourceRecurringRuleId",
    "StaffTaskRecurringRule",
    "n",
  ),
  baselineForeignKey(
    "StaffTask",
    "StaffTask_createdByUserId_fkey",
    "createdByUserId",
    "User",
    "n",
  ),
  baselineForeignKey(
    "StaffTask",
    "StaffTask_assignedToUserId_fkey",
    "assignedToUserId",
    "User",
    "n",
  ),
]);

export const HELP = `
${SCRIPT_NAME}

Guarded read-only admission gate for an isolated StaffTask production-like
snapshot or a local/CI synthetic clone. The command validates PostgreSQL 16,
database identity, public schema, one of the two exact migration states, the
matching schema catalog, and a dedicated least-privilege SELECT-only role.

Usage:
  node scripts/${SCRIPT_NAME}.mjs [--pretty]
  node scripts/${SCRIPT_NAME}.mjs --self-test
  node scripts/${SCRIPT_NAME}.mjs --help

Required environment:
  DATABASE_URL
  RELEASE_SHA
  STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_CLASSIFICATION
    SYNTHETIC | PRODUCTION_LIKE
  STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_EXPECTED_STATE
    ${BASELINE_STATE} | ${EXPAND_STATE}
  STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_EXPECTED_DATABASE
  STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_CONFIRM
    ${RUN_CONFIRMATION}
  STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_ISOLATION_ATTESTATION
    ${ISOLATION_ATTESTATION}
  STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_HMAC_KEY
    At least 32 UTF-8 bytes. Used only to pseudonymize and integrity-bind the
    generated report; it never authorizes a production-like snapshot.
  STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_SNAPSHOT_DIGEST
    SHA-256 of the encrypted snapshot artifact (64 lowercase hex).
  STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_APPROVAL_REFERENCE
    Opaque 3..128 character approval or synthetic-provenance alias.
  STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_ACQUIRED_AT
    Canonical ISO-8601 timestamp of snapshot acquisition.
  STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_RESTORED_AT
    Canonical ISO-8601 timestamp of the isolated restore.
  STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_EXPIRES_AT
    Canonical ISO-8601 timestamp in the future, measured from RESTORED_AT.
    Maximum lifetime:
    SYNTHETIC=7 days; PRODUCTION_LIKE=72 hours.

Required only for PRODUCTION_LIKE:
  STAFF_TASK_INTEGRITY_SNAPSHOT_AUTHORITY_MANIFEST
    Canonical base64url Ed25519 envelope signed by a public root pinned in the
    exact release. This release intentionally has no enrolled production-like
    root, so every production-like admission currently fails closed.

Optional bounded timeouts:
  STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_LOCK_TIMEOUT_MS
  STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_STATEMENT_TIMEOUT_MS
  STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_TRANSACTION_TIMEOUT_MS

Exit codes:
  0  Snapshot admitted.
  1  CLI, runtime, connection, or evidence-contract error.
  3  Identity, PostgreSQL, migration, catalog, or privilege gate rejected.

Safety:
  - NODE_ENV=production is always rejected.
  - Only a loopback PostgreSQL target is supported; remote admission is NO-GO.
  - This command never migrates, mutates, restores, exports, or destroys data.
  - One connection and one READ ONLY REPEATABLE READ transaction are enforced.
  - Runtime source and migration checksums must come from the exact clean
    RELEASE_SHA Git checkout.
  - Raw database identity, role names, URLs, credentials, and row identifiers
    are never serialized.
  - Caller-supplied HMAC identity digests and public-key environment variables
    are never accepted as production-like authority.
  - Admission evidence is not row-level evidence, CAS, approval, or permission
    to reconcile, VALIDATE, deploy, or open external beta access.
`.trim();

class AdmissionContractError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "AdmissionContractError";
    this.code = code;
    this.safeContractError = true;
  }
}

function contractError(code, message) {
  throw new AdmissionContractError(code, message);
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlTextArray(values) {
  return `ARRAY[${values.map(sqlLiteral).join(", ")}]::text[]`;
}

function baselineCatalogValues() {
  return BASELINE_SIMPLE_CONSTRAINTS.map(
    (constraint) =>
      `(${[
        sqlLiteral(constraint.childTable),
        sqlLiteral(constraint.name),
        sqlTextArray(constraint.localColumns),
        sqlLiteral(constraint.parentTable),
        sqlTextArray(constraint.parentColumns),
        sqlLiteral(constraint.deleteAction),
        sqlLiteral(constraint.updateAction),
      ].join(", ")})`,
  ).join(",\n    ");
}

function protectedLocalColumnValues() {
  return SIMPLE_CONSTRAINTS.map(
    (constraint) =>
      `(${[
        sqlLiteral(constraint.childTable),
        sqlTextArray(constraint.localColumns),
      ].join(", ")})`,
  ).join(",\n    ");
}

function protectedConstraintNameValues() {
  return COMPOSITE_CONSTRAINTS.map(
    (constraint) => `(${sqlLiteral(constraint.name)})`,
  ).join(",\n    ");
}

function protectedIndexNameValues() {
  return PARENT_INDEXES.map((index) => `(${sqlLiteral(index.name)})`).join(
    ",\n    ",
  );
}

export const BASELINE_CATALOG_STATE_SQL = `
WITH
  expected_fk(
    child_table,
    constraint_name,
    local_columns,
    parent_table,
    parent_columns,
    delete_action,
    update_action
  ) AS (
    VALUES
    ${baselineCatalogValues()}
  ),
  protected_local(child_table, local_columns) AS (
    VALUES
    ${protectedLocalColumnValues()}
  ),
  protected_composite(constraint_name) AS (
    VALUES
    ${protectedConstraintNameValues()}
  ),
  protected_index(index_name) AS (
    VALUES
    ${protectedIndexNameValues()}
  ),
  actual_fk AS (
    SELECT
      constraint_row.oid AS constraint_oid,
      constraint_row.conname::text AS constraint_name,
      child_namespace.nspname::text AS child_schema,
      child_table.relname::text AS child_table,
      parent_namespace.nspname::text AS parent_schema,
      parent_table.relname::text AS parent_table,
      constraint_row.confdeltype::text AS delete_action,
      constraint_row.confupdtype::text AS update_action,
      constraint_row.confmatchtype::text AS match_type,
      constraint_row.convalidated AS validated,
      constraint_row.condeferrable AS deferrable,
      constraint_row.condeferred AS deferred,
      (
        SELECT COUNT(*)::integer
        FROM pg_trigger AS trigger_row
        WHERE trigger_row.tgconstraint = constraint_row.oid
      ) AS enforcement_trigger_count,
      COALESCE(
        (
          SELECT bool_and(trigger_row.tgenabled = 'O')
          FROM pg_trigger AS trigger_row
          WHERE trigger_row.tgconstraint = constraint_row.oid
        ),
        false
      ) AS enforcement_triggers_enabled,
      ARRAY(
        SELECT attribute.attname::text
        FROM unnest(constraint_row.conkey)
          WITH ORDINALITY AS key_column(attnum, ordinal)
        JOIN pg_attribute AS attribute
          ON attribute.attrelid = constraint_row.conrelid
         AND attribute.attnum = key_column.attnum
        ORDER BY key_column.ordinal
      ) AS local_columns,
      ARRAY(
        SELECT attribute.attname::text
        FROM unnest(constraint_row.confkey)
          WITH ORDINALITY AS key_column(attnum, ordinal)
        JOIN pg_attribute AS attribute
          ON attribute.attrelid = constraint_row.confrelid
         AND attribute.attnum = key_column.attnum
        ORDER BY key_column.ordinal
      ) AS parent_columns
    FROM pg_constraint AS constraint_row
    JOIN pg_class AS child_table
      ON child_table.oid = constraint_row.conrelid
    JOIN pg_namespace AS child_namespace
      ON child_namespace.oid = child_table.relnamespace
    JOIN pg_class AS parent_table
      ON parent_table.oid = constraint_row.confrelid
    JOIN pg_namespace AS parent_namespace
      ON parent_namespace.oid = parent_table.relnamespace
    WHERE constraint_row.contype = 'f'
      AND child_namespace.nspname = 'public'
      AND child_table.relname IN (
        SELECT DISTINCT expected.child_table
        FROM expected_fk AS expected
      )
  ),
  expected_evaluation AS (
    SELECT
      (
        actual.constraint_name IS NOT NULL
        AND actual.child_schema = 'public'
        AND actual.child_table = expected.child_table
        AND actual.parent_schema = 'public'
        AND actual.parent_table = expected.parent_table
        AND actual.local_columns = expected.local_columns
        AND actual.parent_columns = expected.parent_columns
        AND actual.delete_action = expected.delete_action
        AND actual.update_action = expected.update_action
        AND actual.match_type = 's'
        AND actual.validated
        AND NOT actual.deferrable
        AND NOT actual.deferred
        AND actual.enforcement_trigger_count = 4
        AND actual.enforcement_triggers_enabled
      ) AS exact
    FROM expected_fk AS expected
    LEFT JOIN actual_fk AS actual
      ON actual.child_schema = 'public'
     AND actual.child_table = expected.child_table
     AND actual.constraint_name = expected.constraint_name
  )
SELECT
  COUNT(*) FILTER (WHERE exact)::text AS baseline_fk_match_count,
  COUNT(*) FILTER (WHERE exact IS NOT TRUE)::text AS baseline_fk_mismatch_count,
  (
    SELECT COUNT(*)::text
    FROM actual_fk AS actual
    WHERE NOT EXISTS (
      SELECT 1
      FROM expected_fk AS expected
      WHERE expected.child_table = actual.child_table
        AND expected.constraint_name = actual.constraint_name
    )
      AND EXISTS (
        SELECT 1
        FROM protected_local AS protected
        WHERE protected.child_table = actual.child_table
          AND actual.local_columns @> protected.local_columns
      )
  ) AS unexpected_protected_fk_count,
  (
    SELECT COUNT(*)::text
    FROM pg_constraint AS constraint_row
    JOIN pg_namespace AS constraint_namespace
      ON constraint_namespace.oid = constraint_row.connamespace
    WHERE constraint_namespace.nspname = 'public'
      AND constraint_row.conname IN (
        SELECT protected.constraint_name
        FROM protected_composite AS protected
      )
  ) AS protected_composite_present_count,
  (
    SELECT COUNT(*)::text
    FROM pg_class AS index_relation
    JOIN pg_namespace AS index_namespace
      ON index_namespace.oid = index_relation.relnamespace
    WHERE index_namespace.nspname = 'public'
      AND index_relation.relkind = 'i'
      AND index_relation.relname IN (
        SELECT protected.index_name
        FROM protected_index AS protected
      )
  ) AS protected_parent_index_present_count
FROM expected_evaluation
`.trim();

function requiredSelectValues() {
  return REQUIRED_SELECT_RELATIONS.map(
    (relation) => `(${sqlLiteral(relation)})`,
  ).join(",\n    ");
}

function requiredTableSelectValues() {
  return REQUIRED_TABLE_SELECT_RELATIONS.map(
    (relation) => `(${sqlLiteral(relation)})`,
  ).join(",\n    ");
}

function requiredColumnSelectValues() {
  return Object.entries(REQUIRED_COLUMN_SELECTS)
    .flatMap(([relation, columns]) =>
      columns.map(
        (column) => `(${sqlLiteral(relation)}, ${sqlLiteral(column)})`,
      ),
    )
    .join(",\n    ");
}

export const PRIVILEGE_STATE_SQL = `
WITH
  current_role_row AS (
    SELECT role_row.*
    FROM pg_roles AS role_row
    WHERE role_row.rolname = current_user
  ),
  current_database_row AS (
    SELECT database_row.*
    FROM pg_database AS database_row
    WHERE database_row.datname = current_database()
  ),
  public_schema_row AS (
    SELECT namespace_row.*
    FROM pg_namespace AS namespace_row
    WHERE namespace_row.nspname = 'public'
  ),
  required_relation(relation_name) AS (
    VALUES
    ${requiredSelectValues()}
  ),
  required_table_select(relation_name) AS (
    VALUES
    ${requiredTableSelectValues()}
  ),
  required_column_select(relation_name, column_name) AS (
    VALUES
    ${requiredColumnSelectValues()}
  ),
  required_relation_state AS (
    SELECT
      required.relation_name,
      relation_row.oid AS relation_oid
    FROM required_relation AS required
    LEFT JOIN pg_class AS relation_row
      ON relation_row.relnamespace = (
        SELECT schema_row.oid FROM public_schema_row AS schema_row
      )
     AND relation_row.relname = required.relation_name
     AND relation_row.relkind IN ('r', 'p')
  ),
  required_column_state AS (
    SELECT
      required.relation_name,
      required.column_name,
      relation.relation_oid,
      attribute_row.attnum AS attribute_number
    FROM required_column_select AS required
    LEFT JOIN required_relation_state AS relation
      ON relation.relation_name = required.relation_name
    LEFT JOIN pg_attribute AS attribute_row
      ON attribute_row.attrelid = relation.relation_oid
     AND attribute_row.attname = required.column_name
     AND attribute_row.attnum > 0
     AND NOT attribute_row.attisdropped
  ),
  user_namespace AS (
    SELECT namespace_row.oid, namespace_row.nspname, namespace_row.nspowner
    FROM pg_namespace AS namespace_row
    WHERE namespace_row.nspname NOT IN ('pg_catalog', 'information_schema')
      AND namespace_row.nspname !~ '^pg_(?:toast|temp)'
  ),
  user_table_like AS (
    SELECT
      relation_row.oid,
      relation_row.relowner,
      relation_row.relacl,
      namespace_row.nspname AS schema_name,
      relation_row.relname AS relation_name
    FROM pg_class AS relation_row
    JOIN user_namespace AS namespace_row
      ON namespace_row.oid = relation_row.relnamespace
    WHERE relation_row.relkind IN ('r', 'p', 'v', 'm', 'f')
  ),
  user_sequence AS (
    SELECT
      relation_row.oid,
      relation_row.relowner,
      namespace_row.nspname AS schema_name,
      relation_row.relname AS relation_name
    FROM pg_class AS relation_row
    JOIN user_namespace AS namespace_row
      ON namespace_row.oid = relation_row.relnamespace
    WHERE relation_row.relkind = 'S'
  ),
  user_function AS (
    SELECT procedure_row.oid, procedure_row.proowner
    FROM pg_proc AS procedure_row
    JOIN user_namespace AS namespace_row
      ON namespace_row.oid = procedure_row.pronamespace
  )
SELECT
  current_user = session_user AS session_role_unchanged,
  current_setting('transaction_read_only') = 'on' AS transaction_read_only,
  current_setting('transaction_isolation') = 'repeatable read'
    AS repeatable_read,
  role_row.rolcanlogin AS role_can_login,
  role_row.rolinherit AS role_inherits,
  role_row.rolsuper AS role_superuser,
  role_row.rolcreaterole AS role_can_create_role,
  role_row.rolcreatedb AS role_can_create_database,
  role_row.rolreplication AS role_replication,
  role_row.rolbypassrls AS role_bypass_rls,
  database_row.datdba = role_row.oid AS database_owner,
  schema_row.nspowner = role_row.oid AS public_schema_owner,
  has_database_privilege(current_user, current_database(), 'CONNECT')
    AS current_database_connect_privilege,
  has_database_privilege(current_user, current_database(), 'CREATE')
    AS database_create_privilege,
  has_database_privilege(current_user, current_database(), 'TEMP')
    AS database_temp_privilege,
  has_schema_privilege(current_user, 'public', 'USAGE')
    AS public_schema_usage_privilege,
  has_schema_privilege(current_user, 'public', 'CREATE')
    AS public_schema_create_privilege,
  (
    SELECT COUNT(*)::text
    FROM pg_auth_members AS membership
    WHERE membership.member = role_row.oid
  ) AS role_membership_count,
  (
    SELECT COUNT(*)::text
    FROM pg_database AS owned_database
    WHERE owned_database.datdba = role_row.oid
  ) AS owned_database_count,
  (
    SELECT COUNT(*)::text
    FROM pg_namespace AS owned_schema
    WHERE owned_schema.nspowner = role_row.oid
      AND owned_schema.nspname NOT IN ('pg_catalog', 'information_schema')
      AND owned_schema.nspname !~ '^pg_(?:toast|temp)'
  ) AS owned_schema_count,
  (
    (
      SELECT COUNT(*)
      FROM user_table_like AS relation
      WHERE relation.relowner = role_row.oid
    ) + (
      SELECT COUNT(*)
      FROM user_sequence AS relation
      WHERE relation.relowner = role_row.oid
    )
  ) AS owned_relation_count,
  (
    SELECT COUNT(*)::text
    FROM user_function AS procedure_row
    WHERE procedure_row.proowner = role_row.oid
  ) AS owned_function_count,
  (
    SELECT COUNT(*)::text
    FROM pg_database AS other_database
    WHERE other_database.datname <> current_database()
      AND other_database.datallowconn
      AND has_database_privilege(
        current_user,
        other_database.oid,
        'CONNECT'
      )
  ) AS other_database_connect_count,
  (
    SELECT COUNT(*)::text
    FROM user_namespace AS namespace_row
    WHERE namespace_row.nspname <> 'public'
      AND has_schema_privilege(
        current_user,
        namespace_row.oid,
        'USAGE'
      )
  ) AS non_public_schema_usage_count,
  (
    SELECT COUNT(*)::text
    FROM user_table_like AS relation
    WHERE has_table_privilege(current_user, relation.oid, 'INSERT')
       OR has_table_privilege(current_user, relation.oid, 'UPDATE')
       OR has_table_privilege(current_user, relation.oid, 'DELETE')
       OR has_table_privilege(current_user, relation.oid, 'TRUNCATE')
       OR has_table_privilege(current_user, relation.oid, 'REFERENCES')
       OR has_table_privilege(current_user, relation.oid, 'TRIGGER')
       OR has_any_column_privilege(current_user, relation.oid, 'INSERT')
       OR has_any_column_privilege(current_user, relation.oid, 'UPDATE')
       OR has_any_column_privilege(current_user, relation.oid, 'REFERENCES')
  ) AS writable_relation_count,
  (
    SELECT COUNT(*)::text
    FROM user_table_like AS relation
    WHERE (
      has_table_privilege(current_user, relation.oid, 'SELECT')
      OR has_any_column_privilege(current_user, relation.oid, 'SELECT')
    )
      AND NOT (
        relation.schema_name = 'public'
        AND relation.relation_name IN (
          SELECT required.relation_name
          FROM required_relation AS required
        )
      )
  ) AS excess_select_relation_count,
  (
    SELECT COUNT(*)::text
    FROM user_table_like AS relation
    WHERE has_table_privilege(
      current_user,
      relation.oid,
      'SELECT WITH GRANT OPTION'
    )
  ) AS select_grant_option_relation_count,
  (
    SELECT COUNT(*)::text
    FROM user_table_like AS relation
    WHERE relation.schema_name = 'public'
      AND relation.relation_name IN (
        SELECT DISTINCT required.relation_name
        FROM required_column_select AS required
      )
      AND has_table_privilege(current_user, relation.oid, 'SELECT')
  ) AS column_scoped_table_select_count,
  (
    SELECT COUNT(*)::text
    FROM user_table_like AS relation
    JOIN pg_attribute AS attribute_row
      ON attribute_row.attrelid = relation.oid
     AND attribute_row.attnum > 0
     AND NOT attribute_row.attisdropped
    WHERE relation.schema_name = 'public'
      AND relation.relation_name IN (
        SELECT DISTINCT required.relation_name
        FROM required_column_select AS required
      )
      AND has_column_privilege(
        current_user,
        relation.oid,
        attribute_row.attname,
        'SELECT'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM required_column_select AS required
        WHERE required.relation_name = relation.relation_name
          AND required.column_name = attribute_row.attname
      )
  ) AS excess_select_column_count,
  (
    SELECT COUNT(*)::text
    FROM user_table_like AS relation
    JOIN pg_attribute AS attribute_row
      ON attribute_row.attrelid = relation.oid
     AND attribute_row.attnum > 0
     AND NOT attribute_row.attisdropped
    WHERE has_column_privilege(
      current_user,
      relation.oid,
      attribute_row.attname,
      'SELECT WITH GRANT OPTION'
    )
  ) AS select_grant_option_column_count,
  (
    SELECT COUNT(*)::text
    FROM user_table_like AS relation
    WHERE EXISTS (
      SELECT 1
      FROM aclexplode(relation.relacl) AS privilege
      WHERE privilege.grantee = 0
        AND privilege.privilege_type = 'SELECT'
    )
       OR EXISTS (
         SELECT 1
         FROM pg_attribute AS attribute_row
         CROSS JOIN LATERAL aclexplode(attribute_row.attacl) AS privilege
         WHERE attribute_row.attrelid = relation.oid
           AND attribute_row.attnum > 0
           AND NOT attribute_row.attisdropped
           AND privilege.grantee = 0
           AND privilege.privilege_type = 'SELECT'
       )
  ) AS public_select_relation_count,
  (
    SELECT COUNT(*)::text
    FROM user_sequence AS relation
    WHERE has_sequence_privilege(current_user, relation.oid, 'USAGE')
       OR has_sequence_privilege(current_user, relation.oid, 'UPDATE')
  ) AS writable_sequence_count,
  (
    SELECT COUNT(*)::text
    FROM user_sequence AS relation
    WHERE has_sequence_privilege(current_user, relation.oid, 'SELECT')
  ) AS selectable_sequence_count,
  (
    SELECT COUNT(*)::text
    FROM user_function AS procedure_row
    WHERE has_function_privilege(
      current_user,
      procedure_row.oid,
      'EXECUTE'
    )
  ) AS executable_user_function_count,
  (
    SELECT COUNT(*)::text
    FROM pg_foreign_server AS server_row
    WHERE has_server_privilege(current_user, server_row.oid, 'USAGE')
  ) AS foreign_server_usage_count,
  (
    SELECT COUNT(*)::text
    FROM pg_largeobject_metadata AS object_row
    WHERE object_row.lomowner = role_row.oid
       OR EXISTS (
         SELECT 1
         FROM aclexplode(
           COALESCE(
             object_row.lomacl,
             acldefault('L', object_row.lomowner)
           )
         ) AS privilege
         WHERE privilege.grantee IN (0, role_row.oid)
           AND privilege.privilege_type IN ('SELECT', 'UPDATE')
       )
  ) AS large_object_privilege_count,
  (
    (
      SELECT COUNT(*)
      FROM required_table_select AS required
      LEFT JOIN required_relation_state AS relation
        ON relation.relation_name = required.relation_name
      WHERE relation.relation_oid IS NULL
         OR NOT has_table_privilege(
           current_user,
           relation.relation_oid,
           'SELECT'
         )
    ) + (
      SELECT COUNT(*)
      FROM required_column_state AS required
      WHERE required.relation_oid IS NULL
         OR required.attribute_number IS NULL
         OR NOT COALESCE(
           has_column_privilege(
             current_user,
             required.relation_oid,
             required.attribute_number,
             'SELECT'
           ),
           false
         )
    )
  )::text AS required_select_missing_count
FROM current_role_row AS role_row
CROSS JOIN current_database_row AS database_row
CROSS JOIN public_schema_row AS schema_row
`.trim();

export const APPLIED_MIGRATION_MANIFEST_SQL = `
SELECT
  "migration_name"::text AS migration_name,
  "checksum"::text AS checksum
FROM public."_prisma_migrations"
WHERE "finished_at" IS NOT NULL
  AND "rolled_back_at" IS NULL
ORDER BY "migration_name"
`.trim();

export const DATABASE_AUTHORITY_MARKER_SQL = `
SELECT
  shobj_description(database_row.oid, 'pg_database')::text
    AS authority_marker
FROM pg_catalog.pg_database AS database_row
WHERE database_row.datname = pg_catalog.current_database()
`.trim();

export function parseArguments(argv) {
  let selfTest = false;
  let pretty = false;

  for (const argument of argv) {
    if (argument === "--help") {
      return { help: true, selfTest: false, pretty: false };
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

  return { help: false, selfTest, pretty };
}

function normalizeIsoTimestamp(value, code, label) {
  const raw = String(value ?? "").trim();
  const parsed = new Date(raw);
  if (!raw || Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== raw) {
    contractError(code, `${label} must be a canonical ISO-8601 timestamp.`);
  }
  return parsed;
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
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/u, ""));
  if (!DATABASE_NAME_PATTERN.test(databaseName)) {
    contractError(
      "DATABASE_NAME_INVALID",
      "DATABASE_URL must name one bounded PostgreSQL database.",
    );
  }
  const schema = parsed.searchParams.get("schema") ?? "public";
  if (schema !== "public") {
    contractError(
      "DATABASE_SCHEMA_INVALID",
      "Snapshot admission requires schema=public.",
    );
  }
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/gu, "");
  return { parsed, databaseName, hostname };
}

export function parseRuntimeContract(environment, now = new Date()) {
  if (
    String(environment.NODE_ENV ?? "")
      .trim()
      .toLowerCase() === "production"
  ) {
    contractError(
      "PRODUCTION_PROCESS_PROHIBITED",
      "Snapshot admission is prohibited in a production process.",
    );
  }

  const classification = String(
    environment.STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_CLASSIFICATION ?? "",
  )
    .trim()
    .toUpperCase();
  if (!CLASSIFICATIONS.has(classification)) {
    contractError(
      "CLASSIFICATION_REQUIRED",
      "The exact snapshot classification is required.",
    );
  }

  const expectedState = String(
    environment.STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_EXPECTED_STATE ?? "",
  )
    .trim()
    .toUpperCase();
  if (!EXPECTED_STATES.has(expectedState)) {
    contractError(
      "EXPECTED_STATE_REQUIRED",
      "The exact expected snapshot migration state is required.",
    );
  }

  if (
    environment.STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_CONFIRM !==
    RUN_CONFIRMATION
  ) {
    contractError(
      "RUN_CONFIRMATION_REQUIRED",
      "The exact snapshot admission confirmation is required.",
    );
  }
  if (
    environment.STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_ISOLATION_ATTESTATION !==
    ISOLATION_ATTESTATION
  ) {
    contractError(
      "ISOLATION_ATTESTATION_REQUIRED",
      "The exact isolated snapshot attestation is required.",
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
    environment.STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_EXPECTED_DATABASE ?? "",
  ).trim();
  if (!DATABASE_NAME_PATTERN.test(expectedDatabaseName)) {
    contractError(
      "EXPECTED_DATABASE_INVALID",
      "The exact expected database name is required.",
    );
  }

  const { parsed, databaseName, hostname } = normalizeDatabaseUrl(
    environment.DATABASE_URL,
  );
  if (databaseName !== expectedDatabaseName) {
    contractError(
      "EXPECTED_DATABASE_URL_MISMATCH",
      "The expected database marker does not match DATABASE_URL.",
    );
  }

  const localHost = LOCAL_HOSTS.has(hostname);
  if (!localHost) {
    contractError(
      "REMOTE_TARGET_PROHIBITED",
      "Snapshot admission currently supports loopback PostgreSQL targets only.",
    );
  }
  if (classification === "SYNTHETIC") {
    if (!SYNTHETIC_DATABASE_PATTERN.test(databaseName)) {
      contractError(
        "SYNTHETIC_TARGET_INVALID",
        "Synthetic admission requires an exact harness-generated disposable database name.",
      );
    }
  } else {
    if (!PRODUCTION_LIKE_DATABASE_PATTERN.test(databaseName)) {
      contractError(
        "PRODUCTION_LIKE_TARGET_INVALID",
        "Production-like admission requires a snapshot/rehearsal database marker.",
      );
    }
  }

  const hmacKey = String(
    environment.STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_HMAC_KEY ?? "",
  );
  const hmacKeyBytes = Buffer.byteLength(hmacKey, "utf8");
  if (hmacKeyBytes < 32 || hmacKeyBytes > MAX_HMAC_KEY_BYTES) {
    contractError(
      "HMAC_KEY_INVALID",
      "The snapshot admission HMAC key must satisfy the byte-length contract.",
    );
  }

  const snapshotArtifactDigest = String(
    environment.STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_SNAPSHOT_DIGEST ?? "",
  ).trim();
  if (!HMAC_PATTERN.test(snapshotArtifactDigest)) {
    contractError(
      "SNAPSHOT_DIGEST_INVALID",
      "The encrypted snapshot artifact SHA-256 digest is required.",
    );
  }
  const approvalReference = String(
    environment.STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_APPROVAL_REFERENCE ??
      "",
  ).trim();
  if (!APPROVAL_REFERENCE_PATTERN.test(approvalReference)) {
    contractError(
      "APPROVAL_REFERENCE_INVALID",
      "A bounded opaque approval or synthetic-provenance reference is required.",
    );
  }
  if (
    classification === "SYNTHETIC" &&
    !approvalReference.startsWith("synthetic:")
  ) {
    contractError(
      "SYNTHETIC_PROVENANCE_REFERENCE_REQUIRED",
      "Synthetic admission requires an explicit harness provenance reference.",
    );
  }
  const expectedIdentityDigest = String(
    environment.STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_EXPECTED_IDENTITY_DIGEST ??
      "",
  ).trim();
  if (classification === "PRODUCTION_LIKE" && expectedIdentityDigest) {
    contractError(
      "LEGACY_PRODUCTION_LIKE_AUTHORITY_PROHIBITED",
      "A caller-supplied HMAC identity digest cannot authorize a production-like snapshot.",
    );
  }
  if (
    classification === "SYNTHETIC" &&
    expectedIdentityDigest &&
    !HMAC_PATTERN.test(expectedIdentityDigest)
  ) {
    contractError(
      "EXPECTED_IDENTITY_DIGEST_INVALID",
      "The optional database identity digest is invalid.",
    );
  }

  const currentTime =
    now instanceof Date ? new Date(now.valueOf()) : new Date(String(now));
  if (Number.isNaN(currentTime.valueOf())) {
    contractError("CURRENT_TIME_INVALID", "The current time is invalid.");
  }
  const acquiredAt = normalizeIsoTimestamp(
    environment.STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_ACQUIRED_AT,
    "SNAPSHOT_ACQUISITION_INVALID",
    "Snapshot acquisition",
  );
  const restoredAt = normalizeIsoTimestamp(
    environment.STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_RESTORED_AT,
    "SNAPSHOT_RESTORE_INVALID",
    "Snapshot restore",
  );
  const expiresAt = normalizeIsoTimestamp(
    environment.STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_EXPIRES_AT,
    "SNAPSHOT_EXPIRY_INVALID",
    "Snapshot expiry",
  );
  if (
    acquiredAt.valueOf() > restoredAt.valueOf() ||
    acquiredAt.valueOf() > currentTime.valueOf() + MAX_CLOCK_SKEW_MS ||
    restoredAt.valueOf() > currentTime.valueOf() + MAX_CLOCK_SKEW_MS
  ) {
    contractError(
      "SNAPSHOT_TIMELINE_INVALID",
      "Snapshot acquisition and restore timestamps are inconsistent.",
    );
  }
  const remainingLifetime = expiresAt.valueOf() - currentTime.valueOf();
  const restoredLifetime = expiresAt.valueOf() - restoredAt.valueOf();
  const maximumLifetime =
    classification === "SYNTHETIC"
      ? MAX_SYNTHETIC_LIFETIME_MS
      : MAX_PRODUCTION_LIKE_LIFETIME_MS;
  if (
    remainingLifetime <= 0 ||
    restoredLifetime <= 0 ||
    restoredLifetime > maximumLifetime
  ) {
    contractError(
      "SNAPSHOT_EXPIRY_INVALID",
      "Snapshot expiry exceeds the classification-specific lifetime.",
    );
  }

  const authority =
    classification === "PRODUCTION_LIKE"
      ? verifyPinnedProductionLikeAuthority(
          environment.STAFF_TASK_INTEGRITY_SNAPSHOT_AUTHORITY_MANIFEST,
          {
            releaseSha,
            expectedState,
            snapshotArtifactDigest,
            approvalReference,
            acquiredAt: acquiredAt.toISOString(),
            restoredAt: restoredAt.toISOString(),
            expiresAt: expiresAt.toISOString(),
          },
          currentTime,
        )
      : null;

  const lockTimeoutMs = parseBoundedInteger(
    environment.STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_LOCK_TIMEOUT_MS,
    {
      code: "LOCK_TIMEOUT_INVALID",
      label: "STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_LOCK_TIMEOUT_MS",
      minimum: 100,
      maximum: 5_000,
      fallback: DEFAULT_LOCK_TIMEOUT_MS,
    },
  );
  const statementTimeoutMs = parseBoundedInteger(
    environment.STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_STATEMENT_TIMEOUT_MS,
    {
      code: "STATEMENT_TIMEOUT_INVALID",
      label: "STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_STATEMENT_TIMEOUT_MS",
      minimum: 1_000,
      maximum: 120_000,
      fallback: DEFAULT_STATEMENT_TIMEOUT_MS,
    },
  );
  const transactionTimeoutMs = parseBoundedInteger(
    environment.STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_TRANSACTION_TIMEOUT_MS,
    {
      code: "TRANSACTION_TIMEOUT_INVALID",
      label: "STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_TRANSACTION_TIMEOUT_MS",
      minimum: 5_000,
      maximum: 600_000,
      fallback: DEFAULT_TRANSACTION_TIMEOUT_MS,
    },
  );
  if (
    lockTimeoutMs > statementTimeoutMs ||
    statementTimeoutMs > transactionTimeoutMs
  ) {
    contractError(
      "TIMEOUT_ORDER_INVALID",
      "Timeouts must satisfy lock <= statement <= transaction.",
    );
  }

  return {
    classification,
    expectedState,
    expectedDatabaseName,
    releaseSha,
    hmacKey,
    snapshotArtifactDigest,
    approvalReference,
    expectedIdentityDigest: expectedIdentityDigest || null,
    authority,
    acquiredAt: acquiredAt.toISOString(),
    restoredAt: restoredAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    localHost,
    databaseUrl: parsed.toString(),
    lockTimeoutMs,
    statementTimeoutMs,
    transactionTimeoutMs,
  };
}

export function buildReadOnlyDatabaseUrl(rawDatabaseUrl, config) {
  const parsed = new URL(rawDatabaseUrl);
  parsed.searchParams.set("schema", "public");
  parsed.searchParams.set("connection_limit", "1");
  parsed.searchParams.set(
    "application_name",
    "leetplus_staff_task_snapshot_admission",
  );
  const existingOptions = parsed.searchParams.get("options")?.trim();
  parsed.searchParams.set(
    "options",
    [
      existingOptions,
      "-c default_transaction_read_only=on",
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
      "The release artifact object stream contains unexpected data.",
    );
  }
  return objects;
}

function normalizedReleaseSourceContent(content) {
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

export async function loadExpectedMigrationManifest(expectedState, releaseSha) {
  if (!EXPECTED_STATES.has(expectedState)) {
    contractError(
      "EXPECTED_STATE_REQUIRED",
      "The exact expected snapshot migration state is required.",
    );
  }
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
    RELEASE_SOURCE_PATHS[0],
  );
  if (
    runtimePath.toLowerCase() !== expectedRuntimePath.toLowerCase() ||
    String(runGit(["rev-parse", "HEAD"], { cwd: repositoryRoot })).trim() !==
      releaseSha
  ) {
    contractError(
      "RELEASE_SOURCE_MISMATCH",
      "The running source is not anchored to RELEASE_SHA.",
    );
  }
  const runtimeObjectSpecs = RELEASE_RUNTIME_SOURCE_PATHS.map(
    (sourcePath) => `${releaseSha}:${sourcePath}`,
  ).join("\n");
  const runtimeBatchOutput = runGit(["cat-file", "--batch"], {
    cwd: repositoryRoot,
    encoding: null,
    input: `${runtimeObjectSpecs}\n`,
  });
  const runtimeObjects = parseGitBatchObjects(
    runtimeBatchOutput,
    RELEASE_RUNTIME_SOURCE_PATHS,
  );
  for (const runtimeObject of runtimeObjects) {
    const worktreeContent = readFileSync(
      path.resolve(repositoryRoot, runtimeObject.path),
    );
    if (
      normalizedReleaseSourceContent(worktreeContent) !==
      normalizedReleaseSourceContent(runtimeObject.content)
    ) {
      contractError(
        "RELEASE_SOURCE_MISMATCH",
        "The running source content differs from the exact release blob.",
      );
    }
  }
  const sourceStatus = String(
    runGit(
      [
        "status",
        "--porcelain=v1",
        "--untracked-files=all",
        "--",
        ...RELEASE_SOURCE_PATHS,
      ],
      { cwd: repositoryRoot },
    ),
  ).trim();
  if (sourceStatus) {
    contractError(
      "RELEASE_SOURCE_DIRTY",
      "Admission authority source differs from the committed release artifact.",
    );
  }

  const migrationPrefix = "packages/database/prisma/migrations";
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
  const migrationDirectories = migrationPaths.map(
    (migrationPath) => migrationPath.split("/").at(-2) ?? "",
  );
  if (
    migrationDirectories.some(
      (migrationName) => !MIGRATION_NAME_PATTERN.test(migrationName),
    )
  ) {
    contractError(
      "SOURCE_MIGRATION_MANIFEST_INVALID",
      "The source migration directory contract is invalid.",
    );
  }
  const expectedCount =
    expectedState === BASELINE_STATE
      ? BASELINE_MIGRATION_COUNT
      : EXPECTED_MIGRATION_COUNT;
  const selected = migrationDirectories.slice(0, expectedCount);
  const expectedLatest =
    expectedState === BASELINE_STATE
      ? BASELINE_LATEST_MIGRATION
      : EXPECTED_LATEST_MIGRATION;
  if (
    selected.length !== expectedCount ||
    selected.at(-1) !== expectedLatest ||
    migrationDirectories.length !== EXPECTED_MIGRATION_COUNT
  ) {
    contractError(
      "SOURCE_MIGRATION_MANIFEST_INVALID",
      "The source migration manifest does not match the frozen admission state.",
    );
  }

  const selectedPaths = migrationPaths.slice(0, expectedCount);
  const objectSpecs = selectedPaths
    .map((migrationPath) => `${releaseSha}:${migrationPath}`)
    .join("\n");
  const batchOutput = runGit(["cat-file", "--batch"], {
    cwd: repositoryRoot,
    encoding: null,
    input: `${objectSpecs}\n`,
  });
  const objects = parseGitBatchObjects(batchOutput, selectedPaths);
  return objects.map((object, index) => ({
    migrationName: selected[index],
    checksum: createHash("sha256").update(object.content).digest("hex"),
  }));
}

export function buildMigrationManifestState(expectedRows, actualRows) {
  if (!Array.isArray(expectedRows) || !Array.isArray(actualRows)) {
    contractError(
      "DATABASE_MIGRATION_MANIFEST_INVALID",
      "The migration manifest rows are invalid.",
    );
  }
  const normalize = (rows) =>
    rows.map((row) => {
      const migrationName = String(
        row?.migrationName ?? row?.migration_name ?? "",
      );
      const checksum = String(row?.checksum ?? "");
      if (
        !MIGRATION_NAME_PATTERN.test(migrationName) ||
        !HMAC_PATTERN.test(checksum)
      ) {
        contractError(
          "DATABASE_MIGRATION_MANIFEST_INVALID",
          "The migration manifest contains an invalid name or checksum.",
        );
      }
      return { migrationName, checksum };
    });
  const expected = normalize(expectedRows);
  const actual = normalize(actualRows);
  const expectedCanonical = canonicalStringify(expected);
  const actualCanonical = canonicalStringify(actual);
  return {
    ready:
      expected.length === actual.length &&
      expectedCanonical === actualCanonical,
    expectedCount: expected.length,
    actualCount: actual.length,
    manifestDigest: createHash("sha256")
      .update(expectedCanonical, "utf8")
      .digest("hex"),
  };
}

function safeCount(value, code) {
  const serialized = String(value);
  if (!/^\d+$/u.test(serialized)) {
    contractError(code, "The database returned an invalid bounded count.");
  }
  const parsed = Number.parseInt(serialized, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    contractError(code, "The database returned an invalid bounded count.");
  }
  return parsed;
}

function safeBoolean(value, code) {
  if (value !== true && value !== false) {
    contractError(code, "The database returned an invalid boolean.");
  }
  return value;
}

function normalizeGeneratedAt(value) {
  const parsed = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(parsed.valueOf())) {
    contractError(
      "DATABASE_TIMESTAMP_INVALID",
      "The database returned an invalid snapshot timestamp.",
    );
  }
  return parsed.toISOString();
}

function migrationState(migrationRow) {
  const migrationCount = safeCount(
    migrationRow?.migration_count,
    "DATABASE_MIGRATION_COUNT_INVALID",
  );
  const unfinishedMigrationCount = safeCount(
    migrationRow?.unfinished_migration_count,
    "DATABASE_MIGRATION_COUNT_INVALID",
  );
  const latestMigration = String(migrationRow?.latest_migration ?? "");
  let detectedState = "UNSUPPORTED";
  if (
    migrationCount === BASELINE_MIGRATION_COUNT &&
    latestMigration === BASELINE_LATEST_MIGRATION &&
    unfinishedMigrationCount === 0
  ) {
    detectedState = BASELINE_STATE;
  } else if (
    migrationCount === EXPECTED_MIGRATION_COUNT &&
    latestMigration === EXPECTED_LATEST_MIGRATION &&
    unfinishedMigrationCount === 0
  ) {
    detectedState = EXPAND_STATE;
  }
  return {
    detectedState,
    migrationCount,
    unfinishedMigrationCount,
    latestMigrationMatchesExpectedState:
      detectedState === BASELINE_STATE || detectedState === EXPAND_STATE,
  };
}

function baselineCatalogState(row) {
  const actual = {
    foreignKeyMatchCount: safeCount(
      row?.baseline_fk_match_count,
      "DATABASE_BASELINE_CATALOG_COUNT_INVALID",
    ),
    foreignKeyMismatchCount: safeCount(
      row?.baseline_fk_mismatch_count,
      "DATABASE_BASELINE_CATALOG_COUNT_INVALID",
    ),
    unexpectedProtectedForeignKeyCount: safeCount(
      row?.unexpected_protected_fk_count,
      "DATABASE_BASELINE_CATALOG_COUNT_INVALID",
    ),
    protectedCompositePresentCount: safeCount(
      row?.protected_composite_present_count,
      "DATABASE_BASELINE_CATALOG_COUNT_INVALID",
    ),
    protectedParentIndexPresentCount: safeCount(
      row?.protected_parent_index_present_count,
      "DATABASE_BASELINE_CATALOG_COUNT_INVALID",
    ),
  };
  const expected = {
    foreignKeyMatchCount: BASELINE_SIMPLE_CONSTRAINTS.length,
    foreignKeyMismatchCount: 0,
    unexpectedProtectedForeignKeyCount: 0,
    protectedCompositePresentCount: 0,
    protectedParentIndexPresentCount: 0,
  };
  return {
    ready: Object.entries(expected).every(
      ([key, value]) => actual[key] === value,
    ),
    expected,
    actual,
  };
}

function expandCatalogState(row) {
  const actual = {
    compositeContractMatchCount: safeCount(
      row?.composite_contract_match_count,
      "DATABASE_EXPAND_CATALOG_COUNT_INVALID",
    ),
    simpleContractMatchCount: safeCount(
      row?.simple_contract_match_count,
      "DATABASE_EXPAND_CATALOG_COUNT_INVALID",
    ),
    foreignKeyContractMismatchCount: safeCount(
      row?.foreign_key_contract_mismatch_count,
      "DATABASE_EXPAND_CATALOG_COUNT_INVALID",
    ),
    unexpectedProtectedForeignKeyCount: safeCount(
      row?.unexpected_protected_foreign_key_count,
      "DATABASE_EXPAND_CATALOG_COUNT_INVALID",
    ),
    parentIndexContractMatchCount: safeCount(
      row?.parent_index_contract_match_count,
      "DATABASE_EXPAND_CATALOG_COUNT_INVALID",
    ),
    parentIndexContractMismatchCount: safeCount(
      row?.parent_index_contract_mismatch_count,
      "DATABASE_EXPAND_CATALOG_COUNT_INVALID",
    ),
  };
  const expected = {
    compositeContractMatchCount: COMPOSITE_CONSTRAINTS.length,
    simpleContractMatchCount: SIMPLE_CONSTRAINTS.length,
    foreignKeyContractMismatchCount: 0,
    unexpectedProtectedForeignKeyCount: 0,
    parentIndexContractMatchCount: PARENT_INDEXES.length,
    parentIndexContractMismatchCount: 0,
  };
  return {
    ready: Object.entries(expected).every(
      ([key, value]) => actual[key] === value,
    ),
    expected,
    actual,
  };
}

export function privilegeState(row) {
  const actual = {
    sessionRoleUnchanged: safeBoolean(
      row?.session_role_unchanged,
      "DATABASE_PRIVILEGE_BOOLEAN_INVALID",
    ),
    transactionReadOnly: safeBoolean(
      row?.transaction_read_only,
      "DATABASE_PRIVILEGE_BOOLEAN_INVALID",
    ),
    repeatableRead: safeBoolean(
      row?.repeatable_read,
      "DATABASE_PRIVILEGE_BOOLEAN_INVALID",
    ),
    roleCanLogin: safeBoolean(
      row?.role_can_login,
      "DATABASE_PRIVILEGE_BOOLEAN_INVALID",
    ),
    roleInherits: safeBoolean(
      row?.role_inherits,
      "DATABASE_PRIVILEGE_BOOLEAN_INVALID",
    ),
    roleSuperuser: safeBoolean(
      row?.role_superuser,
      "DATABASE_PRIVILEGE_BOOLEAN_INVALID",
    ),
    roleCanCreateRole: safeBoolean(
      row?.role_can_create_role,
      "DATABASE_PRIVILEGE_BOOLEAN_INVALID",
    ),
    roleCanCreateDatabase: safeBoolean(
      row?.role_can_create_database,
      "DATABASE_PRIVILEGE_BOOLEAN_INVALID",
    ),
    roleReplication: safeBoolean(
      row?.role_replication,
      "DATABASE_PRIVILEGE_BOOLEAN_INVALID",
    ),
    roleBypassRls: safeBoolean(
      row?.role_bypass_rls,
      "DATABASE_PRIVILEGE_BOOLEAN_INVALID",
    ),
    databaseOwner: safeBoolean(
      row?.database_owner,
      "DATABASE_PRIVILEGE_BOOLEAN_INVALID",
    ),
    publicSchemaOwner: safeBoolean(
      row?.public_schema_owner,
      "DATABASE_PRIVILEGE_BOOLEAN_INVALID",
    ),
    currentDatabaseConnectPrivilege: safeBoolean(
      row?.current_database_connect_privilege,
      "DATABASE_PRIVILEGE_BOOLEAN_INVALID",
    ),
    databaseCreatePrivilege: safeBoolean(
      row?.database_create_privilege,
      "DATABASE_PRIVILEGE_BOOLEAN_INVALID",
    ),
    databaseTempPrivilege: safeBoolean(
      row?.database_temp_privilege,
      "DATABASE_PRIVILEGE_BOOLEAN_INVALID",
    ),
    publicSchemaUsagePrivilege: safeBoolean(
      row?.public_schema_usage_privilege,
      "DATABASE_PRIVILEGE_BOOLEAN_INVALID",
    ),
    publicSchemaCreatePrivilege: safeBoolean(
      row?.public_schema_create_privilege,
      "DATABASE_PRIVILEGE_BOOLEAN_INVALID",
    ),
    roleMembershipCount: safeCount(
      row?.role_membership_count,
      "DATABASE_PRIVILEGE_COUNT_INVALID",
    ),
    ownedDatabaseCount: safeCount(
      row?.owned_database_count,
      "DATABASE_PRIVILEGE_COUNT_INVALID",
    ),
    ownedSchemaCount: safeCount(
      row?.owned_schema_count,
      "DATABASE_PRIVILEGE_COUNT_INVALID",
    ),
    ownedRelationCount: safeCount(
      row?.owned_relation_count,
      "DATABASE_PRIVILEGE_COUNT_INVALID",
    ),
    ownedFunctionCount: safeCount(
      row?.owned_function_count,
      "DATABASE_PRIVILEGE_COUNT_INVALID",
    ),
    otherDatabaseConnectCount: safeCount(
      row?.other_database_connect_count,
      "DATABASE_PRIVILEGE_COUNT_INVALID",
    ),
    nonPublicSchemaUsageCount: safeCount(
      row?.non_public_schema_usage_count,
      "DATABASE_PRIVILEGE_COUNT_INVALID",
    ),
    writableRelationCount: safeCount(
      row?.writable_relation_count,
      "DATABASE_PRIVILEGE_COUNT_INVALID",
    ),
    excessSelectRelationCount: safeCount(
      row?.excess_select_relation_count,
      "DATABASE_PRIVILEGE_COUNT_INVALID",
    ),
    selectGrantOptionRelationCount: safeCount(
      row?.select_grant_option_relation_count,
      "DATABASE_PRIVILEGE_COUNT_INVALID",
    ),
    columnScopedTableSelectCount: safeCount(
      row?.column_scoped_table_select_count,
      "DATABASE_PRIVILEGE_COUNT_INVALID",
    ),
    excessSelectColumnCount: safeCount(
      row?.excess_select_column_count,
      "DATABASE_PRIVILEGE_COUNT_INVALID",
    ),
    selectGrantOptionColumnCount: safeCount(
      row?.select_grant_option_column_count,
      "DATABASE_PRIVILEGE_COUNT_INVALID",
    ),
    publicSelectRelationCount: safeCount(
      row?.public_select_relation_count,
      "DATABASE_PRIVILEGE_COUNT_INVALID",
    ),
    writableSequenceCount: safeCount(
      row?.writable_sequence_count,
      "DATABASE_PRIVILEGE_COUNT_INVALID",
    ),
    selectableSequenceCount: safeCount(
      row?.selectable_sequence_count,
      "DATABASE_PRIVILEGE_COUNT_INVALID",
    ),
    executableUserFunctionCount: safeCount(
      row?.executable_user_function_count,
      "DATABASE_PRIVILEGE_COUNT_INVALID",
    ),
    foreignServerUsageCount: safeCount(
      row?.foreign_server_usage_count,
      "DATABASE_PRIVILEGE_COUNT_INVALID",
    ),
    largeObjectPrivilegeCount: safeCount(
      row?.large_object_privilege_count,
      "DATABASE_PRIVILEGE_COUNT_INVALID",
    ),
    requiredSelectMissingCount: safeCount(
      row?.required_select_missing_count,
      "DATABASE_PRIVILEGE_COUNT_INVALID",
    ),
  };
  const ready =
    actual.sessionRoleUnchanged &&
    actual.transactionReadOnly &&
    actual.repeatableRead &&
    actual.roleCanLogin &&
    !actual.roleInherits &&
    !actual.roleSuperuser &&
    !actual.roleCanCreateRole &&
    !actual.roleCanCreateDatabase &&
    !actual.roleReplication &&
    !actual.roleBypassRls &&
    !actual.databaseOwner &&
    !actual.publicSchemaOwner &&
    actual.currentDatabaseConnectPrivilege &&
    !actual.databaseCreatePrivilege &&
    !actual.databaseTempPrivilege &&
    actual.publicSchemaUsagePrivilege &&
    !actual.publicSchemaCreatePrivilege &&
    actual.roleMembershipCount === 0 &&
    actual.ownedDatabaseCount === 0 &&
    actual.ownedSchemaCount === 0 &&
    actual.ownedRelationCount === 0 &&
    actual.ownedFunctionCount === 0 &&
    actual.otherDatabaseConnectCount === 0 &&
    actual.nonPublicSchemaUsageCount === 0 &&
    actual.writableRelationCount === 0 &&
    actual.excessSelectRelationCount === 0 &&
    actual.selectGrantOptionRelationCount === 0 &&
    actual.columnScopedTableSelectCount === 0 &&
    actual.excessSelectColumnCount === 0 &&
    actual.selectGrantOptionColumnCount === 0 &&
    actual.publicSelectRelationCount === 0 &&
    actual.writableSequenceCount === 0 &&
    actual.selectableSequenceCount === 0 &&
    actual.executableUserFunctionCount === 0 &&
    actual.foreignServerUsageCount === 0 &&
    actual.largeObjectPrivilegeCount === 0 &&
    actual.requiredSelectMissingCount === 0;
  return { ready, actual };
}

function computeHmac(domain, value, hmacKey) {
  return createHmac("sha256", Buffer.from(hmacKey, "utf8"))
    .update(`${domain}\0`, "utf8")
    .update(canonicalStringify(value), "utf8")
    .digest("hex");
}

export function buildAdmissionReport({
  config,
  snapshotRow,
  migrationRow,
  migrationManifest,
  catalogRow,
  privilegeRow,
}) {
  const generatedAt = normalizeGeneratedAt(snapshotRow?.generated_at);
  const snapshotNotExpiredAtGeneration =
    Date.parse(generatedAt) < Date.parse(config.expiresAt);
  const currentSchemaIsPublic =
    String(snapshotRow?.current_schema ?? "") === "public";
  const databaseNameMatched =
    String(snapshotRow?.current_database ?? "") === config.expectedDatabaseName;
  const databaseIdentityDigest = computeDatabaseIdentityDigest(
    snapshotRow,
    config.hmacKey,
  );
  const databaseIdentityDigestRequired =
    config.classification === "PRODUCTION_LIKE";
  const productionLikeAuthorityVerified =
    databaseIdentityDigestRequired &&
    matchesVerifiedProductionLikeAuthority(config.authority, {
      releaseSha: config.releaseSha,
      expectedState: config.expectedState,
      snapshotArtifactDigest: config.snapshotArtifactDigest,
      approvalReference: config.approvalReference,
      acquiredAt: config.acquiredAt,
      restoredAt: config.restoredAt,
      expiresAt: config.expiresAt,
    });
  const productionLikeAuthorityDatabaseMarkerMatched =
    databaseIdentityDigestRequired &&
    productionLikeAuthorityVerified &&
    String(snapshotRow?.database_authority_marker ?? "") ===
      config.authority.databaseMarker;
  const databaseIdentityDigestMatched =
    !databaseIdentityDigestRequired ||
    (productionLikeAuthorityVerified &&
      computeNonceBoundDatabaseIdentityDigest(
        snapshotRow,
        config.authority.creationNonce,
      ) === config.authority.databaseIdentityDigest);
  const serverVersionNumber = safeCount(
    snapshotRow?.server_version_num,
    "DATABASE_SERVER_VERSION_INVALID",
  );
  const postgresqlMajor = Math.floor(serverVersionNumber / 10_000);
  const postgresqlMajorSupported = postgresqlMajor === 16;
  const migrations = migrationState(migrationRow);
  if (
    typeof migrationManifest?.ready !== "boolean" ||
    !HMAC_PATTERN.test(String(migrationManifest?.manifestDigest ?? ""))
  ) {
    contractError(
      "DATABASE_MIGRATION_MANIFEST_INVALID",
      "The exact migration manifest state is required.",
    );
  }
  const catalog =
    config.expectedState === BASELINE_STATE
      ? baselineCatalogState(catalogRow)
      : expandCatalogState(catalogRow);
  const privileges = privilegeState(privilegeRow);

  const rejectionCodes = [];
  if (!currentSchemaIsPublic) rejectionCodes.push("PUBLIC_SCHEMA_REQUIRED");
  if (!databaseNameMatched) rejectionCodes.push("DATABASE_IDENTITY_MISMATCH");
  if (!snapshotNotExpiredAtGeneration) {
    rejectionCodes.push("SNAPSHOT_EXPIRED_DURING_ADMISSION");
  }
  if (databaseIdentityDigestRequired && !productionLikeAuthorityVerified) {
    rejectionCodes.push("PRODUCTION_LIKE_AUTHORITY_REQUIRED");
  }
  if (
    databaseIdentityDigestRequired &&
    !productionLikeAuthorityDatabaseMarkerMatched
  ) {
    rejectionCodes.push("PRODUCTION_LIKE_AUTHORITY_MARKER_MISMATCH");
  }
  if (!databaseIdentityDigestMatched) {
    rejectionCodes.push("DATABASE_IDENTITY_DIGEST_MISMATCH");
  }
  if (!postgresqlMajorSupported) rejectionCodes.push("POSTGRESQL_16_REQUIRED");
  if (migrations.detectedState !== config.expectedState) {
    rejectionCodes.push("MIGRATION_STATE_MISMATCH");
  }
  if (!migrationManifest.ready) {
    rejectionCodes.push("MIGRATION_MANIFEST_MISMATCH");
  }
  if (!catalog.ready) rejectionCodes.push("CATALOG_STATE_MISMATCH");
  if (!privileges.ready) rejectionCodes.push("LEAST_PRIVILEGE_ROLE_REQUIRED");

  const stableReport = {
    script: SCRIPT_NAME,
    reportSchemaVersion: REPORT_SCHEMA_VERSION,
    classification: config.classification,
    expectedState: config.expectedState,
    releaseSha: config.releaseSha,
    acquiredAt: config.acquiredAt,
    restoredAt: config.restoredAt,
    expiresAt: config.expiresAt,
    snapshotArtifactDigest: config.snapshotArtifactDigest,
    approvalReferenceDigest: computeHmac(
      "staff-task-snapshot-admission-approval-reference-v1",
      { approvalReference: config.approvalReference },
      config.hmacKey,
    ),
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
      lockTimeoutMs: config.lockTimeoutMs,
      statementTimeoutMs: config.statementTimeoutMs,
      transactionTimeoutMs: config.transactionTimeoutMs,
    },
    database: {
      currentSchemaIsPublic,
      databaseNameMatched,
      snapshotNotExpiredAtGeneration,
      databaseIdentityDigestRequired,
      databaseIdentityDigestMatched,
      productionLikeAuthorityVerified,
      productionLikeAuthorityDatabaseMarkerMatched,
      postgresqlMajor,
      postgresqlMajorSupported,
      migrations,
      migrationManifest,
      catalog,
      privileges,
    },
    summary: {
      decision: rejectionCodes.length === 0 ? "ADMITTED" : "REJECTED",
      rejectionCodes,
      inventoryExecuted: false,
      plannerExecuted: false,
    },
  };
  const contentDigest = computeHmac(
    "staff-task-snapshot-admission-content-v2",
    stableReport,
    config.hmacKey,
  );
  const report = {
    ...stableReport,
    generatedAt,
    contentDigest,
    executionDigest: computeHmac(
      "staff-task-snapshot-admission-execution-v2",
      { contentDigest, generatedAt },
      config.hmacKey,
    ),
  };
  if (databaseIdentityDigestRequired && productionLikeAuthorityVerified) {
    PRODUCTION_LIKE_REPORT_EVIDENCE.set(report, contentDigest);
  }
  return report;
}

export function exitCodeForAdmission(
  report,
  hmacKey,
  currentTime = new Date(),
) {
  const hmacKeyBytes = Buffer.byteLength(String(hmacKey ?? ""), "utf8");
  const evaluatedAt =
    currentTime instanceof Date
      ? new Date(currentTime.valueOf())
      : new Date(String(currentTime));
  const reportExpiresAt = Date.parse(String(report?.expiresAt ?? ""));
  if (
    report?.script !== SCRIPT_NAME ||
    report?.reportSchemaVersion !== REPORT_SCHEMA_VERSION ||
    Number.isNaN(reportExpiresAt) ||
    new Date(reportExpiresAt).toISOString() !== report?.expiresAt ||
    hmacKeyBytes < 32 ||
    hmacKeyBytes > MAX_HMAC_KEY_BYTES ||
    !HMAC_PATTERN.test(String(report?.databaseIdentityDigest ?? "")) ||
    !HMAC_PATTERN.test(String(report?.contentDigest ?? "")) ||
    !HMAC_PATTERN.test(String(report?.executionDigest ?? "")) ||
    Number.isNaN(evaluatedAt.valueOf()) ||
    evaluatedAt.valueOf() >= reportExpiresAt ||
    report?.summary?.inventoryExecuted !== false ||
    report?.summary?.plannerExecuted !== false
  ) {
    return 1;
  }
  const { generatedAt, contentDigest, executionDigest, ...stableReport } =
    report;
  const expectedContentDigest = computeHmac(
    "staff-task-snapshot-admission-content-v2",
    stableReport,
    hmacKey,
  );
  const expectedExecutionDigest = computeHmac(
    "staff-task-snapshot-admission-execution-v2",
    { contentDigest: expectedContentDigest, generatedAt },
    hmacKey,
  );
  if (
    contentDigest !== expectedContentDigest ||
    executionDigest !== expectedExecutionDigest
  ) {
    return 1;
  }

  const rejectionCodes = report?.summary?.rejectionCodes;
  const productionLikeAuthorityGateReady =
    report.classification === "PRODUCTION_LIKE"
      ? report?.database?.databaseIdentityDigestRequired === true &&
        report?.database?.productionLikeAuthorityVerified === true &&
        report?.database?.productionLikeAuthorityDatabaseMarkerMatched ===
          true &&
        PRODUCTION_LIKE_REPORT_EVIDENCE.get(report) === report.contentDigest
      : report.classification === "SYNTHETIC" &&
        report?.database?.databaseIdentityDigestRequired === false &&
        report?.database?.productionLikeAuthorityVerified === false &&
        report?.database?.productionLikeAuthorityDatabaseMarkerMatched ===
          false;
  const gatesReady =
    report?.database?.currentSchemaIsPublic === true &&
    report?.database?.databaseNameMatched === true &&
    report?.database?.snapshotNotExpiredAtGeneration === true &&
    report?.database?.databaseIdentityDigestMatched === true &&
    productionLikeAuthorityGateReady &&
    report?.database?.postgresqlMajorSupported === true &&
    report?.database?.migrations?.detectedState === report.expectedState &&
    report?.database?.migrationManifest?.ready === true &&
    report?.database?.catalog?.ready === true &&
    report?.database?.privileges?.ready === true &&
    report?.safety?.databaseWrites === false &&
    report?.safety?.applySupported === false &&
    report?.safety?.remoteTargetAllowed === false &&
    report?.safety?.releaseArtifactBound === true &&
    report?.safety?.independentProductionLikeAuthorityRequired === true &&
    report?.safety?.exactSelectAllowlistRequired === true &&
    report?.safety?.enforcementTriggersRequired === true;
  if (
    !Array.isArray(rejectionCodes) ||
    !rejectionCodes.every(
      (code) => typeof code === "string" && /^[A-Z0-9_]+$/u.test(code),
    )
  ) {
    return 1;
  }
  if (report.summary.decision === "ADMITTED") {
    return gatesReady && rejectionCodes.length === 0 ? 0 : 1;
  }
  if (report.summary.decision === "REJECTED") {
    return !gatesReady && rejectionCodes.length > 0 ? 3 : 1;
  }
  return 1;
}

function stripSqlLiterals(query) {
  return query.replace(/'(?:''|[^'])*'/gu, "''");
}

function assertReadOnlySource() {
  const queries = [
    SNAPSHOT_STATE_SQL,
    MIGRATION_STATE_SQL,
    APPLIED_MIGRATION_MANIFEST_SQL,
    DATABASE_AUTHORITY_MARKER_SQL,
    CATALOG_STATE_SQL,
    BASELINE_CATALOG_STATE_SQL,
    PRIVILEGE_STATE_SQL,
  ];
  const mutatingKeyword =
    /\b(?:INSERT|UPDATE|DELETE|MERGE|ALTER|CREATE|DROP|TRUNCATE|COPY|CALL|DO|GRANT|REVOKE)\b/iu;
  for (const query of queries) {
    const stripped = stripSqlLiterals(query);
    assert.doesNotMatch(stripped, mutatingKeyword);
    assert.doesNotMatch(stripped, /SELECT\s+\*/iu);
    assert.match(stripped.trim(), /^(?:SELECT|WITH)\b/iu);
  }
}

function selfTestEnvironment() {
  return {
    NODE_ENV: "test",
    DATABASE_URL:
      "postgresql://reader:secret@127.0.0.1:5432/lp_snapshot_admission_ci_aaaaaaaaaaaaaaaa?schema=public",
    RELEASE_SHA: "a".repeat(40),
    STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_CLASSIFICATION: "SYNTHETIC",
    STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_EXPECTED_STATE: EXPAND_STATE,
    STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_EXPECTED_DATABASE:
      "lp_snapshot_admission_ci_aaaaaaaaaaaaaaaa",
    STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_CONFIRM: RUN_CONFIRMATION,
    STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_ISOLATION_ATTESTATION:
      ISOLATION_ATTESTATION,
    STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_HMAC_KEY:
      "snapshot-admission-self-test-hmac-key-aaaaaaaa",
    STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_SNAPSHOT_DIGEST: "b".repeat(64),
    STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_APPROVAL_REFERENCE:
      "synthetic:self-test",
    STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_ACQUIRED_AT:
      "2026-07-26T23:58:00.000Z",
    STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_RESTORED_AT:
      "2026-07-26T23:59:00.000Z",
    STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_EXPIRES_AT:
      "2026-07-28T00:00:00.000Z",
  };
}

function selfTestRows() {
  return {
    snapshotRow: {
      generated_at: new Date("2026-07-27T00:00:00.000Z"),
      current_schema: "public",
      current_database: "lp_snapshot_admission_ci_aaaaaaaaaaaaaaaa",
      cluster_system_identifier: "1234567890123456789",
      database_oid: "16384",
      server_version_num: "160009",
    },
    migrationRow: {
      migration_count: String(EXPECTED_MIGRATION_COUNT),
      latest_migration: EXPECTED_LATEST_MIGRATION,
      unfinished_migration_count: "0",
    },
    catalogRow: {
      composite_contract_match_count: String(COMPOSITE_CONSTRAINTS.length),
      simple_contract_match_count: String(SIMPLE_CONSTRAINTS.length),
      foreign_key_contract_mismatch_count: "0",
      unexpected_protected_foreign_key_count: "0",
      parent_index_contract_match_count: String(PARENT_INDEXES.length),
      parent_index_contract_mismatch_count: "0",
    },
    privilegeRow: {
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
      database_create_privilege: false,
      database_temp_privilege: false,
      public_schema_usage_privilege: true,
      public_schema_create_privilege: false,
      role_membership_count: "0",
      owned_database_count: "0",
      owned_schema_count: "0",
      owned_relation_count: "0",
      owned_function_count: "0",
      other_database_connect_count: "0",
      non_public_schema_usage_count: "0",
      writable_relation_count: "0",
      excess_select_relation_count: "0",
      select_grant_option_relation_count: "0",
      column_scoped_table_select_count: "0",
      excess_select_column_count: "0",
      select_grant_option_column_count: "0",
      public_select_relation_count: "0",
      writable_sequence_count: "0",
      selectable_sequence_count: "0",
      executable_user_function_count: "0",
      foreign_server_usage_count: "0",
      large_object_privilege_count: "0",
      required_select_missing_count: "0",
    },
    migrationManifest: {
      ready: true,
      expectedCount: EXPECTED_MIGRATION_COUNT,
      actualCount: EXPECTED_MIGRATION_COUNT,
      manifestDigest: "c".repeat(64),
    },
  };
}

export function runSelfTest() {
  assert.deepEqual(parseArguments(["--pretty"]), {
    help: false,
    selfTest: false,
    pretty: true,
  });
  assert.throws(() => parseArguments(["--apply"]), {
    code: "CLI_ARGUMENT_UNSUPPORTED",
  });

  const now = new Date("2026-07-27T00:00:00.000Z");
  const config = parseRuntimeContract(selfTestEnvironment(), now);
  assert.equal(config.classification, "SYNTHETIC");
  assert.match(
    buildReadOnlyDatabaseUrl(config.databaseUrl, config),
    /connection_limit=1/u,
  );

  const rows = selfTestRows();
  const admitted = buildAdmissionReport({ config, ...rows });
  assert.equal(admitted.summary.decision, "ADMITTED");
  assert.equal(exitCodeForAdmission(admitted, config.hmacKey, now), 0);
  assert.match(admitted.databaseIdentityDigest, HMAC_PATTERN);
  assert.match(admitted.contentDigest, HMAC_PATTERN);
  assert.match(admitted.executionDigest, HMAC_PATTERN);

  const repeated = buildAdmissionReport({ config, ...rows });
  assert.equal(admitted.contentDigest, repeated.contentDigest);
  assert.equal(admitted.executionDigest, repeated.executionDigest);

  const later = buildAdmissionReport({
    config,
    ...rows,
    snapshotRow: {
      ...rows.snapshotRow,
      generated_at: new Date("2026-07-27T00:00:01.000Z"),
    },
  });
  assert.equal(admitted.contentDigest, later.contentDigest);
  assert.notEqual(admitted.executionDigest, later.executionDigest);

  const unsafePrivilege = buildAdmissionReport({
    config,
    ...rows,
    privilegeRow: {
      ...rows.privilegeRow,
      writable_relation_count: "1",
    },
  });
  assert.equal(unsafePrivilege.summary.decision, "REJECTED");
  assert.equal(exitCodeForAdmission(unsafePrivilege, config.hmacKey, now), 3);

  const serialized = JSON.stringify(admitted);
  assert.doesNotMatch(serialized, /lp_snapshot_admission_ci_aaaaaaaaaaaaaaaa/u);
  assert.doesNotMatch(serialized, /1234567890123456789/u);
  assert.doesNotMatch(serialized, /reader|secret/u);

  assertReadOnlySource();
  return {
    script: SCRIPT_NAME,
    status: "PASS",
    checks: 12,
  };
}

export async function inspectDatabase(environment, config) {
  const expectedMigrationManifest = await loadExpectedMigrationManifest(
    config.expectedState,
    config.releaseSha,
  );
  const datasourceUrl = buildReadOnlyDatabaseUrl(
    environment.DATABASE_URL,
    config,
  );
  const prisma = new PrismaClient({ datasourceUrl, log: [] });

  try {
    return await prisma.$transaction(
      async (transaction) => {
        await transaction.$executeRawUnsafe("SET TRANSACTION READ ONLY");
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
        const snapshotRow = snapshotRows[0];
        const authorityMarkerRows = await transaction.$queryRawUnsafe(
          DATABASE_AUTHORITY_MARKER_SQL,
        );
        const versionRows = await transaction.$queryRawUnsafe(
          `SELECT current_setting('server_version_num')::text AS server_version_num`,
        );
        if (!snapshotRow || !versionRows[0] || !authorityMarkerRows[0]) {
          contractError(
            "DATABASE_SNAPSHOT_STATE_MISSING",
            "The database did not return snapshot identity state.",
          );
        }
        snapshotRow.server_version_num = versionRows[0].server_version_num;
        snapshotRow.database_authority_marker =
          authorityMarkerRows[0].authority_marker;

        const migrationRows =
          await transaction.$queryRawUnsafe(MIGRATION_STATE_SQL);
        const appliedMigrationRows = await transaction.$queryRawUnsafe(
          APPLIED_MIGRATION_MANIFEST_SQL,
        );
        const privilegeRows =
          await transaction.$queryRawUnsafe(PRIVILEGE_STATE_SQL);
        const catalogSql =
          config.expectedState === BASELINE_STATE
            ? BASELINE_CATALOG_STATE_SQL
            : CATALOG_STATE_SQL;
        const catalogRows = await transaction.$queryRawUnsafe(catalogSql);

        if (!migrationRows[0] || !privilegeRows[0] || !catalogRows[0]) {
          contractError(
            "DATABASE_ADMISSION_STATE_MISSING",
            "The database did not return complete admission state.",
          );
        }
        return buildAdmissionReport({
          config,
          snapshotRow,
          migrationRow: migrationRows[0],
          migrationManifest: buildMigrationManifestState(
            expectedMigrationManifest,
            appliedMigrationRows,
          ),
          catalogRow: catalogRows[0],
          privilegeRow: privilegeRows[0],
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
    return 1;
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

  let config;
  try {
    config = parseRuntimeContract(environment);
  } catch (error) {
    const code = error?.safeContractError
      ? String(error.code)
      : "RUNTIME_CONTRACT_FAILED";
    process.stderr.write(
      `${renderJson({ script: SCRIPT_NAME, status: "ERROR", error: { code } }, false)}\n`,
    );
    return 1;
  }

  try {
    const report = await inspectDatabase(environment, config);
    const exitCode = exitCodeForAdmission(report, config.hmacKey, new Date());
    if (exitCode === 1) {
      contractError(
        "ADMISSION_REPORT_INTEGRITY_FAILED",
        "The admission report failed its internal integrity contract.",
      );
    }
    process.stdout.write(`${renderJson(report, options.pretty)}\n`);
    return exitCode;
  } catch (error) {
    const code = error?.safeContractError
      ? String(error.code)
      : "DATABASE_ADMISSION_FAILED";
    process.stderr.write(
      `${renderJson({ script: SCRIPT_NAME, status: "ERROR", error: { code } }, false)}\n`,
    );
    return 1;
  }
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  process.exitCode = await main();
}

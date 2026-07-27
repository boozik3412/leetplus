import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PrismaClient } from "@prisma/client";

import {
  INVENTORY_SQL,
  buildReadOnlyDatabaseUrl,
  parseBoundedInteger,
} from "./staff-task-integrity-inventory.mjs";

export const SCRIPT_NAME = "staff-task-integrity-reconciliation-plan";
export const REPORT_SCHEMA_VERSION = 1;
export const RUN_CONFIRMATION = "run-staff-task-integrity-reconciliation-plan";
export const PRODUCTION_ATTESTATION =
  "I_ATTEST_THIS_IS_A_READ_ONLY_PRODUCTION_STAFF_TASK_RECONCILIATION_PLAN";
export const EXPECTED_MIGRATION_COUNT = 162;
export const EXPECTED_LATEST_MIGRATION =
  "20260727131000_staff_task_integrity_expand";

const TARGET_ENVIRONMENTS = new Set(["development", "staging", "production"]);
const DEVELOPMENT_DATABASE_PATTERN =
  /(?:^|[_-])(?:dev|development|test|testing|ci|local)(?:$|[_-])/i;
const STAGING_DATABASE_PATTERN =
  /(?:^|[_-])(?:stage|staging|preprod|test|testing|ci)(?:$|[_-])/i;
const NON_PRODUCTION_DATABASE_PATTERN =
  /(?:^|[_-])(?:dev|development|test|testing|ci|local|stage|staging|preprod)(?:$|[_-])/i;
const DEFAULT_STALE_STARTED_MINUTES = 60;
const DEFAULT_FAILED_WINDOW_DAYS = 14;
const DEFAULT_FAILED_THRESHOLD = 3;
const DEFAULT_LOCK_TIMEOUT_MS = 500;
const DEFAULT_STATEMENT_TIMEOUT_MS = 30_000;
const DEFAULT_TRANSACTION_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_CANDIDATES = 10_000;
const MAX_HMAC_KEY_BYTES = 4_096;

const BLOCKING = "BLOCKING";
const REVIEW = "REVIEW";
const PROPOSAL = "proposal";
const OPERATOR = "operator";
const REVIEW_CLASSIFICATION = "review";

export const FINDING_MANIFEST = Object.freeze([
  {
    code: "TEMPLATE_STORE_CROSS_TENANT",
    severity: BLOCKING,
    classification: OPERATOR,
  },
  {
    code: "TEMPLATE_CREATOR_CROSS_TENANT",
    severity: BLOCKING,
    classification: PROPOSAL,
  },
  {
    code: "RULE_TEMPLATE_CROSS_TENANT",
    severity: BLOCKING,
    classification: PROPOSAL,
  },
  {
    code: "RULE_STORE_CROSS_TENANT",
    severity: BLOCKING,
    classification: OPERATOR,
  },
  {
    code: "RULE_CREATOR_CROSS_TENANT",
    severity: BLOCKING,
    classification: PROPOSAL,
  },
  {
    code: "RULE_ASSIGNEE_CROSS_TENANT",
    severity: BLOCKING,
    classification: OPERATOR,
  },
  {
    code: "RULE_LAST_TASK_CROSS_TENANT",
    severity: BLOCKING,
    classification: PROPOSAL,
  },
  {
    code: "RUN_RULE_CROSS_TENANT",
    severity: BLOCKING,
    classification: OPERATOR,
  },
  {
    code: "RUN_TASK_CROSS_TENANT",
    severity: BLOCKING,
    classification: OPERATOR,
  },
  {
    code: "TASK_STORE_CROSS_TENANT",
    severity: BLOCKING,
    classification: OPERATOR,
  },
  {
    code: "TASK_TEMPLATE_CROSS_TENANT",
    severity: BLOCKING,
    classification: PROPOSAL,
  },
  {
    code: "TASK_RULE_CROSS_TENANT",
    severity: BLOCKING,
    classification: PROPOSAL,
  },
  {
    code: "TASK_CREATOR_CROSS_TENANT",
    severity: BLOCKING,
    classification: PROPOSAL,
  },
  {
    code: "TASK_ASSIGNEE_CROSS_TENANT",
    severity: BLOCKING,
    classification: OPERATOR,
  },
  {
    code: "RULE_TEMPLATE_STORE_MISMATCH",
    severity: BLOCKING,
    classification: OPERATOR,
  },
  {
    code: "TASK_TEMPLATE_STORE_MISMATCH",
    severity: REVIEW,
    classification: REVIEW_CLASSIFICATION,
  },
  {
    code: "TASK_RULE_STORE_MISMATCH",
    severity: REVIEW,
    classification: REVIEW_CLASSIFICATION,
  },
  {
    code: "RULE_LAST_TASK_SOURCE_MISMATCH",
    severity: BLOCKING,
    classification: PROPOSAL,
  },
  {
    code: "RUN_TASK_SOURCE_MISMATCH",
    severity: BLOCKING,
    classification: OPERATOR,
  },
  {
    code: "ACTIVE_RULE_NULL_STORE",
    severity: BLOCKING,
    classification: OPERATOR,
  },
  {
    code: "ACTIVE_RULE_NULL_NEXT_RUN_AT",
    severity: BLOCKING,
    classification: OPERATOR,
  },
  {
    code: "ACTIVE_RULE_STORE_TIMEZONE_MISSING",
    severity: BLOCKING,
    classification: OPERATOR,
  },
  {
    code: "ACTIVE_RULE_STORE_TIMEZONE_INVALID",
    severity: BLOCKING,
    classification: OPERATOR,
  },
  {
    code: "ACTIVE_RULE_INACTIVE_STORE",
    severity: BLOCKING,
    classification: OPERATOR,
  },
  {
    code: "ACTIVE_RULE_INACTIVE_TEMPLATE",
    severity: BLOCKING,
    classification: OPERATOR,
  },
  {
    code: "ACTIVE_TEMPLATE_INACTIVE_STORE",
    severity: BLOCKING,
    classification: OPERATOR,
  },
  {
    code: "ACTIVE_RULE_INACTIVE_TENANT",
    severity: BLOCKING,
    classification: OPERATOR,
  },
  {
    code: "RULE_ASSIGNEE_PLATFORM",
    severity: BLOCKING,
    classification: OPERATOR,
  },
  {
    code: "RULE_ASSIGNEE_INACTIVE",
    severity: BLOCKING,
    classification: OPERATOR,
  },
  {
    code: "RULE_ASSIGNEE_SCOPE_INVALID",
    severity: BLOCKING,
    classification: OPERATOR,
  },
  {
    code: "RULE_ASSIGNEE_OUT_OF_STORE",
    severity: BLOCKING,
    classification: OPERATOR,
  },
  {
    code: "RULE_ASSIGNEE_GLOBAL_SCOPE_INVALID",
    severity: BLOCKING,
    classification: OPERATOR,
  },
  {
    code: "TASK_ASSIGNEE_PLATFORM",
    severity: BLOCKING,
    classification: OPERATOR,
  },
  {
    code: "TASK_ASSIGNEE_INACTIVE",
    severity: BLOCKING,
    classification: OPERATOR,
  },
  {
    code: "TASK_ASSIGNEE_SCOPE_INVALID",
    severity: BLOCKING,
    classification: OPERATOR,
  },
  {
    code: "TASK_ASSIGNEE_OUT_OF_STORE",
    severity: BLOCKING,
    classification: OPERATOR,
  },
  {
    code: "TASK_ASSIGNEE_GLOBAL_SCOPE_INVALID",
    severity: BLOCKING,
    classification: OPERATOR,
  },
  {
    code: "STALE_STARTED_RUN",
    severity: BLOCKING,
    classification: OPERATOR,
  },
  {
    code: "REPEATED_FAILED_RUN",
    severity: BLOCKING,
    classification: OPERATOR,
  },
  {
    code: "ACTIVE_TEMPLATE_NULL_STORE",
    severity: REVIEW,
    classification: REVIEW_CLASSIFICATION,
  },
  {
    code: "TASK_STORE_SET_NULL_CANDIDATE",
    severity: REVIEW,
    classification: REVIEW_CLASSIFICATION,
  },
  {
    code: "TEMPLATE_STORE_SET_NULL_CANDIDATE",
    severity: REVIEW,
    classification: REVIEW_CLASSIFICATION,
  },
  {
    code: "RULE_STORE_SET_NULL_CANDIDATE",
    severity: REVIEW,
    classification: REVIEW_CLASSIFICATION,
  },
]);

function foreignKeyContract({
  kind,
  childTable,
  name,
  localColumns,
  parentTable,
  parentColumns,
  deleteAction,
  deleteSetColumns = null,
  parentIndex = null,
}) {
  return Object.freeze({
    kind,
    childTable,
    name,
    localColumns: Object.freeze([...localColumns]),
    parentTable,
    parentColumns: Object.freeze([...parentColumns]),
    deleteAction,
    updateAction: "r",
    matchType: "s",
    deleteSetColumns:
      deleteSetColumns === null ? null : Object.freeze([...deleteSetColumns]),
    parentIndex,
  });
}

const COMPOSITE = "composite";
const SIMPLE = "simple";

export const COMPOSITE_CONSTRAINTS = Object.freeze([
  foreignKeyContract({
    kind: COMPOSITE,
    childTable: "StaffTaskTemplate",
    name: "StaffTaskTemplate_tenantId_storeId_fkey",
    localColumns: ["tenantId", "storeId"],
    parentTable: "Store",
    parentColumns: ["tenantId", "id"],
    deleteAction: "r",
    parentIndex: "store_tenant_id_uidx",
  }),
  foreignKeyContract({
    kind: COMPOSITE,
    childTable: "StaffTaskTemplate",
    name: "StaffTaskTemplate_tenantId_createdByUserId_fkey",
    localColumns: ["tenantId", "createdByUserId"],
    parentTable: "User",
    parentColumns: ["tenantId", "id"],
    deleteAction: "n",
    deleteSetColumns: ["createdByUserId"],
    parentIndex: "user_tenant_id_uidx",
  }),
  foreignKeyContract({
    kind: COMPOSITE,
    childTable: "StaffTaskRecurringRule",
    name: "StaffTaskRecurringRule_tenantId_templateId_fkey",
    localColumns: ["tenantId", "templateId"],
    parentTable: "StaffTaskTemplate",
    parentColumns: ["tenantId", "id"],
    deleteAction: "n",
    deleteSetColumns: ["templateId"],
    parentIndex: "staff_task_template_tenant_id_uidx",
  }),
  foreignKeyContract({
    kind: COMPOSITE,
    childTable: "StaffTaskRecurringRule",
    name: "StaffTaskRecurringRule_tenantId_storeId_fkey",
    localColumns: ["tenantId", "storeId"],
    parentTable: "Store",
    parentColumns: ["tenantId", "id"],
    deleteAction: "r",
    parentIndex: "store_tenant_id_uidx",
  }),
  foreignKeyContract({
    kind: COMPOSITE,
    childTable: "StaffTaskRecurringRule",
    name: "StaffTaskRecurringRule_tenantId_createdByUserId_fkey",
    localColumns: ["tenantId", "createdByUserId"],
    parentTable: "User",
    parentColumns: ["tenantId", "id"],
    deleteAction: "n",
    deleteSetColumns: ["createdByUserId"],
    parentIndex: "user_tenant_id_uidx",
  }),
  foreignKeyContract({
    kind: COMPOSITE,
    childTable: "StaffTaskRecurringRule",
    name: "StaffTaskRecurringRule_tenantId_assignedToUserId_fkey",
    localColumns: ["tenantId", "assignedToUserId"],
    parentTable: "User",
    parentColumns: ["tenantId", "id"],
    deleteAction: "n",
    deleteSetColumns: ["assignedToUserId"],
    parentIndex: "user_tenant_id_uidx",
  }),
  foreignKeyContract({
    kind: COMPOSITE,
    childTable: "StaffTaskRecurringRule",
    name: "StaffTaskRecurringRule_tenantId_lastCreatedTaskId_fkey",
    localColumns: ["tenantId", "lastCreatedTaskId"],
    parentTable: "StaffTask",
    parentColumns: ["tenantId", "id"],
    deleteAction: "n",
    deleteSetColumns: ["lastCreatedTaskId"],
    parentIndex: "staff_task_tenant_id_uidx",
  }),
  foreignKeyContract({
    kind: COMPOSITE,
    childTable: "StaffTaskRecurringRuleRun",
    name: "StaffTaskRecurringRuleRun_tenantId_ruleId_fkey",
    localColumns: ["tenantId", "ruleId"],
    parentTable: "StaffTaskRecurringRule",
    parentColumns: ["tenantId", "id"],
    deleteAction: "c",
    parentIndex: "staff_task_rule_tenant_id_uidx",
  }),
  foreignKeyContract({
    kind: COMPOSITE,
    childTable: "StaffTaskRecurringRuleRun",
    name: "StaffTaskRecurringRuleRun_tenantId_createdTaskId_fkey",
    localColumns: ["tenantId", "createdTaskId"],
    parentTable: "StaffTask",
    parentColumns: ["tenantId", "id"],
    deleteAction: "n",
    deleteSetColumns: ["createdTaskId"],
    parentIndex: "staff_task_tenant_id_uidx",
  }),
  foreignKeyContract({
    kind: COMPOSITE,
    childTable: "StaffTask",
    name: "StaffTask_tenantId_storeId_fkey",
    localColumns: ["tenantId", "storeId"],
    parentTable: "Store",
    parentColumns: ["tenantId", "id"],
    deleteAction: "r",
    parentIndex: "store_tenant_id_uidx",
  }),
  foreignKeyContract({
    kind: COMPOSITE,
    childTable: "StaffTask",
    name: "StaffTask_tenantId_sourceTemplateId_fkey",
    localColumns: ["tenantId", "sourceTemplateId"],
    parentTable: "StaffTaskTemplate",
    parentColumns: ["tenantId", "id"],
    deleteAction: "n",
    deleteSetColumns: ["sourceTemplateId"],
    parentIndex: "staff_task_template_tenant_id_uidx",
  }),
  foreignKeyContract({
    kind: COMPOSITE,
    childTable: "StaffTask",
    name: "StaffTask_tenantId_sourceRecurringRuleId_fkey",
    localColumns: ["tenantId", "sourceRecurringRuleId"],
    parentTable: "StaffTaskRecurringRule",
    parentColumns: ["tenantId", "id"],
    deleteAction: "n",
    deleteSetColumns: ["sourceRecurringRuleId"],
    parentIndex: "staff_task_rule_tenant_id_uidx",
  }),
  foreignKeyContract({
    kind: COMPOSITE,
    childTable: "StaffTask",
    name: "StaffTask_tenantId_createdByUserId_fkey",
    localColumns: ["tenantId", "createdByUserId"],
    parentTable: "User",
    parentColumns: ["tenantId", "id"],
    deleteAction: "n",
    deleteSetColumns: ["createdByUserId"],
    parentIndex: "user_tenant_id_uidx",
  }),
  foreignKeyContract({
    kind: COMPOSITE,
    childTable: "StaffTask",
    name: "StaffTask_tenantId_assignedToUserId_fkey",
    localColumns: ["tenantId", "assignedToUserId"],
    parentTable: "User",
    parentColumns: ["tenantId", "id"],
    deleteAction: "n",
    deleteSetColumns: ["assignedToUserId"],
    parentIndex: "user_tenant_id_uidx",
  }),
]);

export const SIMPLE_CONSTRAINTS = Object.freeze([
  foreignKeyContract({
    kind: SIMPLE,
    childTable: "StaffTaskTemplate",
    name: "StaffTaskTemplate_storeId_fkey",
    localColumns: ["storeId"],
    parentTable: "Store",
    parentColumns: ["id"],
    deleteAction: "r",
  }),
  foreignKeyContract({
    kind: SIMPLE,
    childTable: "StaffTaskTemplate",
    name: "StaffTaskTemplate_createdByUserId_fkey",
    localColumns: ["createdByUserId"],
    parentTable: "User",
    parentColumns: ["id"],
    deleteAction: "n",
  }),
  foreignKeyContract({
    kind: SIMPLE,
    childTable: "StaffTaskRecurringRule",
    name: "StaffTaskRecurringRule_storeId_fkey",
    localColumns: ["storeId"],
    parentTable: "Store",
    parentColumns: ["id"],
    deleteAction: "r",
  }),
  foreignKeyContract({
    kind: SIMPLE,
    childTable: "StaffTaskRecurringRule",
    name: "StaffTaskRecurringRule_templateId_fkey",
    localColumns: ["templateId"],
    parentTable: "StaffTaskTemplate",
    parentColumns: ["id"],
    deleteAction: "n",
  }),
  foreignKeyContract({
    kind: SIMPLE,
    childTable: "StaffTaskRecurringRule",
    name: "StaffTaskRecurringRule_createdByUserId_fkey",
    localColumns: ["createdByUserId"],
    parentTable: "User",
    parentColumns: ["id"],
    deleteAction: "n",
  }),
  foreignKeyContract({
    kind: SIMPLE,
    childTable: "StaffTaskRecurringRule",
    name: "StaffTaskRecurringRule_assignedToUserId_fkey",
    localColumns: ["assignedToUserId"],
    parentTable: "User",
    parentColumns: ["id"],
    deleteAction: "n",
  }),
  foreignKeyContract({
    kind: SIMPLE,
    childTable: "StaffTaskRecurringRule",
    name: "StaffTaskRecurringRule_lastCreatedTaskId_fkey",
    localColumns: ["lastCreatedTaskId"],
    parentTable: "StaffTask",
    parentColumns: ["id"],
    deleteAction: "n",
  }),
  foreignKeyContract({
    kind: SIMPLE,
    childTable: "StaffTaskRecurringRuleRun",
    name: "StaffTaskRecurringRuleRun_ruleId_fkey",
    localColumns: ["ruleId"],
    parentTable: "StaffTaskRecurringRule",
    parentColumns: ["id"],
    deleteAction: "c",
  }),
  foreignKeyContract({
    kind: SIMPLE,
    childTable: "StaffTaskRecurringRuleRun",
    name: "StaffTaskRecurringRuleRun_createdTaskId_fkey",
    localColumns: ["createdTaskId"],
    parentTable: "StaffTask",
    parentColumns: ["id"],
    deleteAction: "n",
  }),
  foreignKeyContract({
    kind: SIMPLE,
    childTable: "StaffTask",
    name: "StaffTask_storeId_fkey",
    localColumns: ["storeId"],
    parentTable: "Store",
    parentColumns: ["id"],
    deleteAction: "r",
  }),
  foreignKeyContract({
    kind: SIMPLE,
    childTable: "StaffTask",
    name: "StaffTask_sourceTemplateId_fkey",
    localColumns: ["sourceTemplateId"],
    parentTable: "StaffTaskTemplate",
    parentColumns: ["id"],
    deleteAction: "n",
  }),
  foreignKeyContract({
    kind: SIMPLE,
    childTable: "StaffTask",
    name: "StaffTask_sourceRecurringRuleId_fkey",
    localColumns: ["sourceRecurringRuleId"],
    parentTable: "StaffTaskRecurringRule",
    parentColumns: ["id"],
    deleteAction: "n",
  }),
  foreignKeyContract({
    kind: SIMPLE,
    childTable: "StaffTask",
    name: "StaffTask_createdByUserId_fkey",
    localColumns: ["createdByUserId"],
    parentTable: "User",
    parentColumns: ["id"],
    deleteAction: "n",
  }),
  foreignKeyContract({
    kind: SIMPLE,
    childTable: "StaffTask",
    name: "StaffTask_assignedToUserId_fkey",
    localColumns: ["assignedToUserId"],
    parentTable: "User",
    parentColumns: ["id"],
    deleteAction: "n",
  }),
]);

export const PARENT_INDEXES = Object.freeze([
  Object.freeze({
    table: "Store",
    name: "store_tenant_id_uidx",
    columns: Object.freeze(["tenantId", "id"]),
  }),
  Object.freeze({
    table: "User",
    name: "user_tenant_id_uidx",
    columns: Object.freeze(["tenantId", "id"]),
  }),
  Object.freeze({
    table: "StaffTaskTemplate",
    name: "staff_task_template_tenant_id_uidx",
    columns: Object.freeze(["tenantId", "id"]),
  }),
  Object.freeze({
    table: "StaffTaskRecurringRule",
    name: "staff_task_rule_tenant_id_uidx",
    columns: Object.freeze(["tenantId", "id"]),
  }),
  Object.freeze({
    table: "StaffTask",
    name: "staff_task_tenant_id_uidx",
    columns: Object.freeze(["tenantId", "id"]),
  }),
]);

export const HELP = `
${SCRIPT_NAME}

Guarded aggregate-only reconciliation planner for the StaffTask integrity
EXPAND contract. This command never applies, repairs, or authorizes mutations.

Usage:
  node scripts/staff-task-integrity-reconciliation-plan.mjs [options]

Options:
  --help       Show this help without reading environment variables or the DB.
  --self-test  Run contract/source-safety checks without reading the DB.
  --pretty     Pretty-print aggregate JSON output.

Required environment:
  DATABASE_URL
  RELEASE_SHA
    Exact 40-character lowercase hexadecimal release commit.
  STAFF_TASK_INTEGRITY_RECONCILIATION_TARGET
    One of: development, staging, production.
  STAFF_TASK_INTEGRITY_RECONCILIATION_CONFIRM
    Must equal: ${RUN_CONFIRMATION}
  STAFF_TASK_INTEGRITY_RECONCILIATION_HMAC_KEY
    At least 32 UTF-8 bytes. It signs the stable aggregate content and the
    timestamp-bound execution envelope, and is never emitted.
  STAFF_TASK_INTEGRITY_RECONCILIATION_EXPECTED_DATABASE
    Exact database name. Development/staging names must carry an environment
    marker; production names must not carry a non-production marker. The name
    is compared inside the read-only snapshot and is never emitted.

Production-only attestation:
  STAFF_TASK_INTEGRITY_RECONCILIATION_PRODUCTION_ATTESTATION
    Must equal:
    ${PRODUCTION_ATTESTATION}

Optional bounded settings:
  STAFF_TASK_INTEGRITY_STALE_STARTED_MINUTES       5..10080 (default 60)
  STAFF_TASK_INTEGRITY_FAILED_WINDOW_DAYS          1..365 (default 14)
  STAFF_TASK_INTEGRITY_FAILED_THRESHOLD            2..1000 (default 3)
  STAFF_TASK_INTEGRITY_RECONCILIATION_LOCK_TIMEOUT_MS
                                                    100..5000 (default 500)
  STAFF_TASK_INTEGRITY_RECONCILIATION_STATEMENT_TIMEOUT_MS
                                                    1000..120000 (default 30000)
  STAFF_TASK_INTEGRITY_RECONCILIATION_TRANSACTION_TIMEOUT_MS
                                                    5000..600000 (default 120000)
  STAFF_TASK_INTEGRITY_RECONCILIATION_MAX_CANDIDATES
                                                    1..1000000 (default 10000)

Safety:
  One PostgreSQL connection and one READ ONLY REPEATABLE READ transaction are
  used. Output contains aggregate counts and stable codes only. A proposal is
  not authorization, and this command has no apply path. Raw database and
  cluster identity stay hidden behind a domain-separated HMAC fingerprint.

Exit codes:
  0  Schema is ready, cap is respected, and blocking findings are zero.
  1  CLI, environment, safety-contract, or database failure.
  2  Schema is ready and one or more blocking findings exist.
  3  Candidate cap exceeded or the exact EXPAND schema contract mismatched.
`.trim();

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlTextArray(values) {
  return `ARRAY[${values.map((value) => sqlLiteral(value)).join(", ")}]::text[]`;
}

function foreignKeyCatalogValues(entries) {
  return entries
    .map(
      (entry) =>
        `(${[
          sqlLiteral(entry.kind),
          sqlLiteral(entry.childTable),
          sqlLiteral(entry.name),
          sqlTextArray(entry.localColumns),
          sqlLiteral(entry.parentTable),
          sqlTextArray(entry.parentColumns),
          sqlLiteral(entry.deleteAction),
          sqlLiteral(entry.updateAction),
          sqlLiteral(entry.matchType),
          entry.deleteSetColumns === null
            ? "NULL::text[]"
            : sqlTextArray(entry.deleteSetColumns),
          entry.parentIndex === null
            ? "NULL::text"
            : sqlLiteral(entry.parentIndex),
        ].join(", ")})`,
    )
    .join(",\n    ");
}

function indexCatalogValues(entries) {
  return entries
    .map(
      (entry) =>
        `(${[
          sqlLiteral(entry.table),
          sqlLiteral(entry.name),
          sqlTextArray(entry.columns),
        ].join(", ")})`,
    )
    .join(",\n    ");
}

export const SNAPSHOT_STATE_SQL = `
SELECT
  CURRENT_TIMESTAMP AS generated_at,
  current_schema()::text AS current_schema,
  current_database()::text AS current_database,
  control.system_identifier::text AS cluster_system_identifier,
  database_row.oid::text AS database_oid
FROM pg_control_system() AS control
JOIN pg_database AS database_row
  ON database_row.datname = current_database()
`.trim();

export const MIGRATION_STATE_SQL = `
SELECT
  COUNT(*) FILTER (
    WHERE "finished_at" IS NOT NULL
      AND "rolled_back_at" IS NULL
  )::text AS migration_count,
  COALESCE(
    MAX("migration_name") FILTER (
      WHERE "finished_at" IS NOT NULL
        AND "rolled_back_at" IS NULL
    ),
    ''
  )::text AS latest_migration,
  COUNT(*) FILTER (
    WHERE "finished_at" IS NULL
      AND "rolled_back_at" IS NULL
  )::text AS unfinished_migration_count
FROM public."_prisma_migrations"
`.trim();

export const CATALOG_STATE_SQL = `
WITH
  expected_fk(
    kind,
    child_table,
    constraint_name,
    local_columns,
    parent_table,
    parent_columns,
    delete_action,
    update_action,
    match_type,
    delete_set_columns,
    referenced_index_name
  ) AS (
    VALUES
    ${foreignKeyCatalogValues([
      ...COMPOSITE_CONSTRAINTS,
      ...SIMPLE_CONSTRAINTS,
    ])}
  ),
  expected_index(parent_table, index_name, key_columns) AS (
    VALUES
    ${indexCatalogValues(PARENT_INDEXES)}
  ),
  actual_fk AS (
    SELECT
      constraint_row.conname::text AS constraint_name,
      constraint_namespace.nspname::text AS constraint_schema,
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
      referenced_index_namespace.nspname::text AS referenced_index_schema,
      referenced_index.relname::text AS referenced_index_name,
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
      ) AS parent_columns,
      CASE
        WHEN constraint_row.confdelsetcols IS NULL THEN NULL::text[]
        ELSE ARRAY(
          SELECT attribute.attname::text
          FROM unnest(constraint_row.confdelsetcols)
            WITH ORDINALITY AS key_column(attnum, ordinal)
          JOIN pg_attribute AS attribute
            ON attribute.attrelid = constraint_row.conrelid
           AND attribute.attnum = key_column.attnum
          ORDER BY key_column.ordinal
        )
      END AS delete_set_columns
    FROM pg_constraint AS constraint_row
    JOIN pg_namespace AS constraint_namespace
      ON constraint_namespace.oid = constraint_row.connamespace
    JOIN pg_class AS child_table
      ON child_table.oid = constraint_row.conrelid
    JOIN pg_namespace AS child_namespace
      ON child_namespace.oid = child_table.relnamespace
    JOIN pg_class AS parent_table
      ON parent_table.oid = constraint_row.confrelid
    JOIN pg_namespace AS parent_namespace
      ON parent_namespace.oid = parent_table.relnamespace
    LEFT JOIN pg_class AS referenced_index
      ON referenced_index.oid = constraint_row.conindid
    LEFT JOIN pg_namespace AS referenced_index_namespace
      ON referenced_index_namespace.oid = referenced_index.relnamespace
    WHERE constraint_row.contype = 'f'
      AND constraint_namespace.nspname = 'public'
      AND child_table.relname IN (
        SELECT DISTINCT expected.child_table
        FROM expected_fk AS expected
      )
  ),
  fk_evaluation AS (
    SELECT
      expected.kind,
      (
        actual.constraint_name IS NOT NULL
        AND actual.constraint_schema = 'public'
        AND actual.child_schema = 'public'
        AND actual.child_table = expected.child_table
        AND actual.parent_schema = 'public'
        AND actual.parent_table = expected.parent_table
        AND actual.local_columns = expected.local_columns
        AND actual.parent_columns = expected.parent_columns
        AND actual.delete_action = expected.delete_action
        AND actual.update_action = expected.update_action
        AND actual.match_type = expected.match_type
        AND actual.delete_set_columns
          IS NOT DISTINCT FROM expected.delete_set_columns
        AND actual.validated = false
        AND actual.deferrable = false
        AND actual.deferred = false
        AND actual.referenced_index_schema = 'public'
        AND (
          expected.referenced_index_name IS NULL
          OR actual.referenced_index_name = expected.referenced_index_name
        )
      ) AS exact
    FROM expected_fk AS expected
    LEFT JOIN actual_fk AS actual
      ON actual.child_schema = 'public'
     AND actual.child_table = expected.child_table
     AND actual.constraint_name = expected.constraint_name
  ),
  actual_index AS (
    SELECT
      parent_namespace.nspname::text AS parent_schema,
      parent_table.relname::text AS parent_table,
      index_namespace.nspname::text AS index_schema,
      index_relation.relname::text AS index_name,
      index_relation.relkind::text AS index_relation_kind,
      index_row.indisunique AS unique_index,
      index_row.indisvalid AS valid_index,
      index_row.indisready AS ready_index,
      index_row.indislive AS live_index,
      index_row.indimmediate AS immediate_index,
      index_row.indisexclusion AS exclusion_index,
      index_row.indpred IS NULL AS nonpartial,
      index_row.indexprs IS NULL AS no_expressions,
      index_row.indnkeyatts::integer AS key_count,
      index_row.indnatts::integer AS total_attribute_count,
      ARRAY(
        SELECT attribute.attname::text
        FROM unnest(index_row.indkey::smallint[])
          WITH ORDINALITY AS key_column(attnum, ordinal)
        JOIN pg_attribute AS attribute
          ON attribute.attrelid = index_row.indrelid
         AND attribute.attnum = key_column.attnum
        WHERE key_column.ordinal <= index_row.indnkeyatts
        ORDER BY key_column.ordinal
      ) AS key_columns
    FROM pg_index AS index_row
    JOIN pg_class AS index_relation
      ON index_relation.oid = index_row.indexrelid
    JOIN pg_namespace AS index_namespace
      ON index_namespace.oid = index_relation.relnamespace
    JOIN pg_class AS parent_table
      ON parent_table.oid = index_row.indrelid
    JOIN pg_namespace AS parent_namespace
      ON parent_namespace.oid = parent_table.relnamespace
    WHERE index_namespace.nspname = 'public'
      AND index_relation.relname IN (
        SELECT expected.index_name
        FROM expected_index AS expected
      )
  ),
  index_evaluation AS (
    SELECT
      (
        actual.index_name IS NOT NULL
        AND actual.parent_schema = 'public'
        AND actual.parent_table = expected.parent_table
        AND actual.index_schema = 'public'
        AND actual.index_relation_kind = 'i'
        AND actual.key_columns = expected.key_columns
        AND actual.key_count = cardinality(expected.key_columns)
        AND actual.total_attribute_count = cardinality(expected.key_columns)
        AND actual.unique_index
        AND actual.valid_index
        AND actual.ready_index
        AND actual.live_index
        AND actual.immediate_index
        AND NOT actual.exclusion_index
        AND actual.nonpartial
        AND actual.no_expressions
      ) AS exact
    FROM expected_index AS expected
    LEFT JOIN actual_index AS actual
      ON actual.index_schema = 'public'
     AND actual.index_name = expected.index_name
  ),
  fk_summary AS (
    SELECT
      COUNT(*) FILTER (
        WHERE kind = 'composite' AND exact
      )::text AS composite_contract_match_count,
      COUNT(*) FILTER (
        WHERE kind = 'simple' AND exact
      )::text AS simple_contract_match_count,
      COUNT(*) FILTER (
        WHERE exact IS NOT TRUE
      )::text AS foreign_key_contract_mismatch_count
    FROM fk_evaluation
  ),
  unexpected_fk_summary AS (
    SELECT
      COUNT(*)::text AS unexpected_protected_foreign_key_count
    FROM actual_fk AS actual
    WHERE NOT EXISTS (
      SELECT 1
      FROM expected_fk AS expected
      WHERE expected.child_table = actual.child_table
        AND expected.constraint_name = actual.constraint_name
    )
      AND EXISTS (
        SELECT 1
        FROM expected_fk AS protected
        WHERE protected.child_table = actual.child_table
          AND actual.local_columns @> protected.local_columns
      )
  ),
  index_summary AS (
    SELECT
      COUNT(*) FILTER (
        WHERE exact
      )::text AS parent_index_contract_match_count,
      COUNT(*) FILTER (
        WHERE exact IS NOT TRUE
      )::text AS parent_index_contract_mismatch_count
    FROM index_evaluation
  )
SELECT
  fk_summary.composite_contract_match_count,
  fk_summary.simple_contract_match_count,
  fk_summary.foreign_key_contract_mismatch_count,
  unexpected_fk_summary.unexpected_protected_foreign_key_count,
  index_summary.parent_index_contract_match_count,
  index_summary.parent_index_contract_mismatch_count
FROM fk_summary
CROSS JOIN unexpected_fk_summary
CROSS JOIN index_summary
`.trim();

export const READ_QUERY_TEXTS = Object.freeze([
  INVENTORY_SQL,
  SNAPSHOT_STATE_SQL,
  MIGRATION_STATE_SQL,
  CATALOG_STATE_SQL,
]);

function contractError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.safeContractError = true;
  throw error;
}

function assertExpectedDatabaseContract(target, expectedDatabaseName) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$/.test(expectedDatabaseName)) {
    contractError(
      "EXPECTED_DATABASE_INVALID",
      "The expected database name failed its bounded identifier contract.",
    );
  }
  const targetMatches =
    target === "development"
      ? DEVELOPMENT_DATABASE_PATTERN.test(expectedDatabaseName)
      : target === "staging"
        ? STAGING_DATABASE_PATTERN.test(expectedDatabaseName)
        : !NON_PRODUCTION_DATABASE_PATTERN.test(expectedDatabaseName);
  if (!targetMatches) {
    contractError(
      "EXPECTED_DATABASE_TARGET_MISMATCH",
      "The expected database name does not match the declared target.",
    );
  }
}

export function parseArguments(argv) {
  if (argv.includes("--help")) {
    return { help: true, selfTest: false, pretty: false };
  }

  let pretty = false;
  let selfTest = false;
  for (const argument of argv) {
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

export function parseRuntimeContract(environment) {
  const target = String(
    environment.STAFF_TASK_INTEGRITY_RECONCILIATION_TARGET ?? "",
  );
  if (!TARGET_ENVIRONMENTS.has(target)) {
    contractError(
      "TARGET_ENVIRONMENT_REQUIRED",
      "The exact reconciliation target environment is required.",
    );
  }
  if (
    environment.STAFF_TASK_INTEGRITY_RECONCILIATION_CONFIRM !== RUN_CONFIRMATION
  ) {
    contractError(
      "RUN_CONFIRMATION_REQUIRED",
      "The exact reconciliation planner confirmation is required.",
    );
  }

  const nodeEnvironment = String(environment.NODE_ENV ?? "")
    .trim()
    .toLowerCase();
  if (nodeEnvironment === "production" && target !== "production") {
    contractError(
      "PRODUCTION_TARGET_MISMATCH",
      "NODE_ENV=production requires target=production.",
    );
  }
  const productionRequested =
    target === "production" || nodeEnvironment === "production";
  if (
    productionRequested &&
    environment.STAFF_TASK_INTEGRITY_RECONCILIATION_PRODUCTION_ATTESTATION !==
      PRODUCTION_ATTESTATION
  ) {
    contractError(
      "PRODUCTION_ATTESTATION_REQUIRED",
      "The exact production read-only reconciliation attestation is required.",
    );
  }

  if (!String(environment.DATABASE_URL ?? "").trim()) {
    contractError("DATABASE_URL_REQUIRED", "DATABASE_URL is required.");
  }

  const releaseSha = String(environment.RELEASE_SHA ?? "");
  if (!/^[0-9a-f]{40}$/.test(releaseSha)) {
    contractError(
      "RELEASE_SHA_INVALID",
      "RELEASE_SHA must be exactly 40 lowercase hexadecimal characters.",
    );
  }

  const hmacKey = String(
    environment.STAFF_TASK_INTEGRITY_RECONCILIATION_HMAC_KEY ?? "",
  );
  const hmacKeyBytes = Buffer.byteLength(hmacKey, "utf8");
  if (hmacKeyBytes < 32 || hmacKeyBytes > MAX_HMAC_KEY_BYTES) {
    contractError(
      "HMAC_KEY_INVALID",
      "The reconciliation HMAC key must satisfy the byte-length contract.",
    );
  }
  const expectedDatabaseName = String(
    environment.STAFF_TASK_INTEGRITY_RECONCILIATION_EXPECTED_DATABASE ?? "",
  );
  assertExpectedDatabaseContract(target, expectedDatabaseName);

  const config = {
    target,
    productionAttested: productionRequested,
    releaseSha,
    hmacKey,
    expectedDatabaseName,
    staleStartedMinutes: parseBoundedInteger(
      environment.STAFF_TASK_INTEGRITY_STALE_STARTED_MINUTES,
      {
        code: "STALE_STARTED_MINUTES_INVALID",
        label: "STAFF_TASK_INTEGRITY_STALE_STARTED_MINUTES",
        minimum: 5,
        maximum: 10_080,
        fallback: DEFAULT_STALE_STARTED_MINUTES,
      },
    ),
    failedWindowDays: parseBoundedInteger(
      environment.STAFF_TASK_INTEGRITY_FAILED_WINDOW_DAYS,
      {
        code: "FAILED_WINDOW_DAYS_INVALID",
        label: "STAFF_TASK_INTEGRITY_FAILED_WINDOW_DAYS",
        minimum: 1,
        maximum: 365,
        fallback: DEFAULT_FAILED_WINDOW_DAYS,
      },
    ),
    failedThreshold: parseBoundedInteger(
      environment.STAFF_TASK_INTEGRITY_FAILED_THRESHOLD,
      {
        code: "FAILED_THRESHOLD_INVALID",
        label: "STAFF_TASK_INTEGRITY_FAILED_THRESHOLD",
        minimum: 2,
        maximum: 1_000,
        fallback: DEFAULT_FAILED_THRESHOLD,
      },
    ),
    lockTimeoutMs: parseBoundedInteger(
      environment.STAFF_TASK_INTEGRITY_RECONCILIATION_LOCK_TIMEOUT_MS,
      {
        code: "LOCK_TIMEOUT_INVALID",
        label: "STAFF_TASK_INTEGRITY_RECONCILIATION_LOCK_TIMEOUT_MS",
        minimum: 100,
        maximum: 5_000,
        fallback: DEFAULT_LOCK_TIMEOUT_MS,
      },
    ),
    statementTimeoutMs: parseBoundedInteger(
      environment.STAFF_TASK_INTEGRITY_RECONCILIATION_STATEMENT_TIMEOUT_MS,
      {
        code: "STATEMENT_TIMEOUT_INVALID",
        label: "STAFF_TASK_INTEGRITY_RECONCILIATION_STATEMENT_TIMEOUT_MS",
        minimum: 1_000,
        maximum: 120_000,
        fallback: DEFAULT_STATEMENT_TIMEOUT_MS,
      },
    ),
    transactionTimeoutMs: parseBoundedInteger(
      environment.STAFF_TASK_INTEGRITY_RECONCILIATION_TRANSACTION_TIMEOUT_MS,
      {
        code: "TRANSACTION_TIMEOUT_INVALID",
        label: "STAFF_TASK_INTEGRITY_RECONCILIATION_TRANSACTION_TIMEOUT_MS",
        minimum: 5_000,
        maximum: 600_000,
        fallback: DEFAULT_TRANSACTION_TIMEOUT_MS,
      },
    ),
    maxCandidates: parseBoundedInteger(
      environment.STAFF_TASK_INTEGRITY_RECONCILIATION_MAX_CANDIDATES,
      {
        code: "MAX_CANDIDATES_INVALID",
        label: "STAFF_TASK_INTEGRITY_RECONCILIATION_MAX_CANDIDATES",
        minimum: 1,
        maximum: 1_000_000,
        fallback: DEFAULT_MAX_CANDIDATES,
      },
    ),
  };

  if (
    config.lockTimeoutMs > config.statementTimeoutMs ||
    config.statementTimeoutMs > config.transactionTimeoutMs
  ) {
    contractError(
      "TIMEOUT_ORDER_INVALID",
      "Timeouts must satisfy lock <= statement <= transaction.",
    );
  }
  return config;
}

function safeCount(value, code = "DATABASE_COUNT_INVALID") {
  const serialized = String(value);
  if (!/^\d+$/.test(serialized)) {
    contractError(code, "The database returned an invalid aggregate count.");
  }
  const parsed = Number.parseInt(serialized, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    contractError(code, "The database returned an invalid aggregate count.");
  }
  return parsed;
}

function safeAdd(left, right) {
  const result = left + right;
  if (!Number.isSafeInteger(result)) {
    contractError(
      "DATABASE_COUNT_TOTAL_INVALID",
      "Aggregate finding totals exceed the safe integer contract.",
    );
  }
  return result;
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

function normalizeFindings(rows) {
  if (!Array.isArray(rows)) {
    contractError(
      "DATABASE_FINDINGS_INVALID",
      "The database did not return aggregate finding rows.",
    );
  }

  const manifestByCode = new Map(
    FINDING_MANIFEST.map((finding) => [finding.code, finding]),
  );
  const seen = new Set();
  const findings = rows.map((row) => {
    const code = String(row.code);
    const expected = manifestByCode.get(code);
    if (!expected || seen.has(code)) {
      contractError(
        "DATABASE_FINDING_CONTRACT_MISMATCH",
        "The database returned an unknown or duplicate finding code.",
      );
    }
    seen.add(code);
    if (String(row.severity) !== expected.severity) {
      contractError(
        "DATABASE_FINDING_CONTRACT_MISMATCH",
        "The database returned an unexpected finding severity.",
      );
    }
    return {
      code,
      severity: expected.severity,
      classification: expected.classification,
      count: safeCount(row.count),
    };
  });

  if (
    findings.length !== FINDING_MANIFEST.length ||
    seen.size !== FINDING_MANIFEST.length
  ) {
    contractError(
      "DATABASE_FINDING_CONTRACT_MISMATCH",
      "The database finding catalog is incomplete.",
    );
  }
  return findings.sort((left, right) => left.code.localeCompare(right.code));
}

function normalizeSchemaState({
  config,
  snapshotRow,
  migrationRow,
  catalogRow,
}) {
  const migrationCount = safeCount(
    migrationRow?.migration_count,
    "DATABASE_MIGRATION_COUNT_INVALID",
  );
  const unfinishedMigrationCount = safeCount(
    migrationRow?.unfinished_migration_count,
    "DATABASE_MIGRATION_COUNT_INVALID",
  );
  const compositeContractMatchCount = safeCount(
    catalogRow?.composite_contract_match_count,
    "DATABASE_CATALOG_COUNT_INVALID",
  );
  const simpleContractMatchCount = safeCount(
    catalogRow?.simple_contract_match_count,
    "DATABASE_CATALOG_COUNT_INVALID",
  );
  const foreignKeyContractMismatchCount = safeCount(
    catalogRow?.foreign_key_contract_mismatch_count,
    "DATABASE_CATALOG_COUNT_INVALID",
  );
  const unexpectedProtectedForeignKeyCount = safeCount(
    catalogRow?.unexpected_protected_foreign_key_count,
    "DATABASE_CATALOG_COUNT_INVALID",
  );
  const parentIndexContractMatchCount = safeCount(
    catalogRow?.parent_index_contract_match_count,
    "DATABASE_CATALOG_COUNT_INVALID",
  );
  const parentIndexContractMismatchCount = safeCount(
    catalogRow?.parent_index_contract_mismatch_count,
    "DATABASE_CATALOG_COUNT_INVALID",
  );
  const latestMigration = String(migrationRow?.latest_migration ?? "");
  const currentSchemaIsPublic =
    String(snapshotRow?.current_schema ?? "") === "public";
  const databaseIdentityMatched =
    String(snapshotRow?.current_database ?? "") === config.expectedDatabaseName;

  const actual = {
    currentSchemaIsPublic,
    databaseIdentityMatched,
    migrationCount,
    latestMigration,
    unfinishedMigrationCount,
    compositeContractMatchCount,
    simpleContractMatchCount,
    foreignKeyContractMismatchCount,
    unexpectedProtectedForeignKeyCount,
    parentIndexContractMatchCount,
    parentIndexContractMismatchCount,
  };
  const expected = {
    currentSchemaIsPublic: true,
    databaseIdentityMatched: true,
    migrationCount: EXPECTED_MIGRATION_COUNT,
    latestMigration: EXPECTED_LATEST_MIGRATION,
    unfinishedMigrationCount: 0,
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

function classificationSummary(findings, classification) {
  const selected = findings.filter(
    (finding) => finding.classification === classification,
  );
  return {
    catalogCodes: selected.length,
    positiveCodes: selected.filter((finding) => finding.count > 0).length,
    candidateOccurrences: selected.reduce(
      (total, finding) => safeAdd(total, finding.count),
      0,
    ),
  };
}

export function canonicalStringify(value) {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      contractError(
        "DIGEST_INPUT_INVALID",
        "Digest input contains a non-finite number.",
      );
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalStringify(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`);
    return `{${entries.join(",")}}`;
  }
  contractError(
    "DIGEST_INPUT_INVALID",
    "Digest input contains an unsupported value.",
  );
}

function computeHmac(domain, value, hmacKey) {
  return createHmac("sha256", Buffer.from(hmacKey, "utf8"))
    .update(`${domain}\0`, "utf8")
    .update(canonicalStringify(value), "utf8")
    .digest("hex");
}

export function computeContentDigest(stablePlan, hmacKey) {
  return computeHmac(
    "staff-task-reconciliation-content-v1",
    stablePlan,
    hmacKey,
  );
}

export function computeDatabaseIdentityDigest(snapshotRow, hmacKey) {
  const databaseName = String(snapshotRow?.current_database ?? "");
  const clusterSystemIdentifier = String(
    snapshotRow?.cluster_system_identifier ?? "",
  );
  const databaseOid = String(snapshotRow?.database_oid ?? "");
  if (
    !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$/.test(databaseName) ||
    !/^\d{1,20}$/.test(clusterSystemIdentifier) ||
    !/^[1-9]\d{0,9}$/.test(databaseOid)
  ) {
    contractError(
      "DATABASE_IDENTITY_INVALID",
      "The database returned an invalid identity contract.",
    );
  }
  return computeHmac(
    "staff-task-reconciliation-database-identity-v1",
    { databaseName, clusterSystemIdentifier, databaseOid },
    hmacKey,
  );
}

export function computeExecutionDigest(
  { contentDigest, generatedAt },
  hmacKey,
) {
  return computeHmac(
    "staff-task-reconciliation-execution-v1",
    { contentDigest, generatedAt },
    hmacKey,
  );
}

export function buildPlan({
  config,
  rows,
  snapshotRow,
  migrationRow,
  catalogRow,
  inventoryExecuted = true,
}) {
  const findings = normalizeFindings(rows);
  const schema = normalizeSchemaState({
    config,
    snapshotRow,
    migrationRow,
    catalogRow,
  });
  if (
    typeof inventoryExecuted !== "boolean" ||
    inventoryExecuted !== schema.ready
  ) {
    contractError(
      "INVENTORY_EXECUTION_STATE_INVALID",
      "Inventory execution state does not match schema readiness.",
    );
  }
  const databaseIdentityDigest = computeDatabaseIdentityDigest(
    snapshotRow,
    config.hmacKey,
  );
  const classificationTotals = {
    proposal: classificationSummary(findings, PROPOSAL),
    operator: classificationSummary(findings, OPERATOR),
    review: classificationSummary(findings, REVIEW_CLASSIFICATION),
  };
  const candidateOccurrences = inventoryExecuted
    ? safeAdd(
        classificationTotals.proposal.candidateOccurrences,
        classificationTotals.operator.candidateOccurrences,
      )
    : 0;
  const observedOccurrences = inventoryExecuted
    ? safeAdd(
        candidateOccurrences,
        classificationTotals.review.candidateOccurrences,
      )
    : 0;
  const blockingTotal = inventoryExecuted
    ? findings
        .filter((finding) => finding.severity === BLOCKING)
        .reduce((total, finding) => safeAdd(total, finding.count), 0)
    : null;
  const reviewTotal = inventoryExecuted
    ? findings
        .filter((finding) => finding.severity === REVIEW)
        .reduce((total, finding) => safeAdd(total, finding.count), 0)
    : null;
  const capExceeded = candidateOccurrences > config.maxCandidates;
  const decision = !schema.ready
    ? "SCHEMA_MISMATCH"
    : capExceeded
      ? "CAP_EXCEEDED"
      : blockingTotal !== null && blockingTotal > 0
        ? "FINDINGS"
        : reviewTotal !== null && reviewTotal > 0
          ? "REVIEW"
          : "PASS";

  const stablePlan = {
    script: SCRIPT_NAME,
    reportSchemaVersion: REPORT_SCHEMA_VERSION,
    target: config.target,
    releaseSha: config.releaseSha,
    databaseIdentityDigest,
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
    thresholds: {
      staleStartedMinutes: config.staleStartedMinutes,
      failedWindowDays: config.failedWindowDays,
      failedThreshold: config.failedThreshold,
    },
    limits: {
      lockTimeoutMs: config.lockTimeoutMs,
      statementTimeoutMs: config.statementTimeoutMs,
      transactionTimeoutMs: config.transactionTimeoutMs,
      maxCandidates: config.maxCandidates,
    },
    schema,
    summary: {
      decision,
      inventoryExecuted,
      candidateOccurrences,
      observedOccurrences,
      capExceeded,
      blockingTotal,
      blockingCodes: inventoryExecuted
        ? findings.filter(
            (finding) => finding.severity === BLOCKING && finding.count > 0,
          ).length
        : null,
      reviewTotal,
      reviewCodes: inventoryExecuted
        ? findings.filter(
            (finding) => finding.severity === REVIEW && finding.count > 0,
          ).length
        : null,
      classifications: classificationTotals,
    },
    findings: inventoryExecuted ? findings : [],
  };

  const generatedAt = normalizeGeneratedAt(snapshotRow?.generated_at);
  const contentDigest = computeContentDigest(stablePlan, config.hmacKey);
  return {
    ...stablePlan,
    generatedAt,
    contentDigest,
    executionDigest: computeExecutionDigest(
      { contentDigest, generatedAt },
      config.hmacKey,
    ),
  };
}

export function exitCodeForPlan(plan) {
  if (
    typeof plan?.schema?.ready !== "boolean" ||
    typeof plan?.summary?.inventoryExecuted !== "boolean" ||
    plan.summary.inventoryExecuted !== plan.schema.ready
  ) {
    return 1;
  }
  if (!plan.schema.ready || plan.summary.capExceeded) {
    return 3;
  }
  return plan.summary.blockingTotal !== null && plan.summary.blockingTotal > 0
    ? 2
    : 0;
}

function extractInventoryManifest() {
  return [
    ...INVENTORY_SQL.matchAll(
      /SELECT\s+'([A-Z0-9_]+)'(?:\s*::text\s+AS code)?\s*,\s*'(BLOCKING|REVIEW)'/g,
    ),
  ].map((match) => ({ code: match[1], severity: match[2] }));
}

function assertReadOnlySourceSafety() {
  const mutatingKeyword =
    /\b(?:INSERT|UPDATE|DELETE|MERGE|ALTER|CREATE|DROP|TRUNCATE|COPY|CALL|DO|GRANT|REVOKE)\b/i;
  for (const query of READ_QUERY_TEXTS) {
    assert.equal(
      mutatingKeyword.test(query),
      false,
      "planner query contains a mutating statement keyword",
    );
    assert.doesNotMatch(query, /SELECT\s+\*/i);
  }
}

function selfTestConfig(overrides = {}) {
  return {
    target: "staging",
    productionAttested: false,
    releaseSha: "a".repeat(40),
    hmacKey: "self-test-hmac-key-material-32-bytes-minimum",
    expectedDatabaseName: "leetplus_test",
    staleStartedMinutes: DEFAULT_STALE_STARTED_MINUTES,
    failedWindowDays: DEFAULT_FAILED_WINDOW_DAYS,
    failedThreshold: DEFAULT_FAILED_THRESHOLD,
    lockTimeoutMs: DEFAULT_LOCK_TIMEOUT_MS,
    statementTimeoutMs: DEFAULT_STATEMENT_TIMEOUT_MS,
    transactionTimeoutMs: DEFAULT_TRANSACTION_TIMEOUT_MS,
    maxCandidates: DEFAULT_MAX_CANDIDATES,
    ...overrides,
  };
}

function selfTestRows(overrides = {}) {
  return FINDING_MANIFEST.map((finding) => ({
    code: finding.code,
    severity: finding.severity,
    count: String(overrides[finding.code] ?? 0),
  }));
}

function selfTestState(overrides = {}) {
  return {
    config: selfTestConfig(overrides.config),
    rows: selfTestRows(overrides.findings),
    snapshotRow: {
      generated_at: overrides.generatedAt ?? "2026-07-27T00:00:00.000Z",
      current_schema: overrides.currentSchema ?? "public",
      current_database: overrides.currentDatabase ?? "leetplus_test",
      cluster_system_identifier:
        overrides.clusterSystemIdentifier ?? "7667202810308916656",
      database_oid: String(overrides.databaseOid ?? 16_384),
    },
    migrationRow: {
      migration_count: String(
        overrides.migrationCount ?? EXPECTED_MIGRATION_COUNT,
      ),
      latest_migration: overrides.latestMigration ?? EXPECTED_LATEST_MIGRATION,
      unfinished_migration_count: String(
        overrides.unfinishedMigrationCount ?? 0,
      ),
    },
    catalogRow: {
      composite_contract_match_count: String(
        overrides.compositeContractMatchCount ?? COMPOSITE_CONSTRAINTS.length,
      ),
      simple_contract_match_count: String(
        overrides.simpleContractMatchCount ?? SIMPLE_CONSTRAINTS.length,
      ),
      foreign_key_contract_mismatch_count: String(
        overrides.foreignKeyContractMismatchCount ?? 0,
      ),
      unexpected_protected_foreign_key_count: String(
        overrides.unexpectedProtectedForeignKeyCount ?? 0,
      ),
      parent_index_contract_match_count: String(
        overrides.parentIndexContractMatchCount ?? PARENT_INDEXES.length,
      ),
      parent_index_contract_mismatch_count: String(
        overrides.parentIndexContractMismatchCount ?? 0,
      ),
    },
    inventoryExecuted: overrides.inventoryExecuted ?? true,
  };
}

export function runSelfTest() {
  assertReadOnlySourceSafety();

  assert.deepEqual(parseArguments(["--pretty", "--self-test"]), {
    help: false,
    selfTest: true,
    pretty: true,
  });
  assert.deepEqual(parseArguments(["--apply", "--help"]), {
    help: true,
    selfTest: false,
    pretty: false,
  });
  assert.throws(() => parseArguments(["--apply"]), {
    code: "CLI_ARGUMENT_UNSUPPORTED",
  });

  const inventoryManifest = extractInventoryManifest();
  assert.equal(inventoryManifest.length, 43);
  assert.equal(new Set(inventoryManifest.map(({ code }) => code)).size, 43);
  assert.deepEqual(
    [...inventoryManifest].sort((left, right) =>
      left.code.localeCompare(right.code),
    ),
    FINDING_MANIFEST.map(({ code, severity }) => ({ code, severity })).sort(
      (left, right) => left.code.localeCompare(right.code),
    ),
  );
  assert.equal(
    FINDING_MANIFEST.find(
      ({ code }) => code === "TASK_ASSIGNEE_GLOBAL_SCOPE_INVALID",
    )?.severity,
    BLOCKING,
  );
  assert.deepEqual(
    [
      ...new Set(FINDING_MANIFEST.map(({ classification }) => classification)),
    ].sort(),
    [OPERATOR, PROPOSAL, REVIEW_CLASSIFICATION].sort(),
  );

  const stableA = buildPlan(selfTestState());
  const stableB = buildPlan(
    selfTestState({ generatedAt: "2027-01-01T12:34:56.000Z" }),
  );
  assert.equal(stableA.contentDigest, stableB.contentDigest);
  assert.notEqual(stableA.executionDigest, stableB.executionDigest);
  assert.notEqual(stableA.generatedAt, stableB.generatedAt);
  assert.equal(exitCodeForPlan(stableA), 0);

  const findingsPlan = buildPlan(
    selfTestState({
      findings: { TASK_ASSIGNEE_GLOBAL_SCOPE_INVALID: 1 },
    }),
  );
  assert.equal(findingsPlan.summary.decision, "FINDINGS");
  assert.equal(exitCodeForPlan(findingsPlan), 2);

  const capPlan = buildPlan(
    selfTestState({
      config: { maxCandidates: 1 },
      findings: { TASK_ASSIGNEE_GLOBAL_SCOPE_INVALID: 2 },
    }),
  );
  assert.equal(capPlan.summary.decision, "CAP_EXCEEDED");
  assert.equal(exitCodeForPlan(capPlan), 3);

  const schemaPlan = buildPlan(
    selfTestState({ migrationCount: 161, inventoryExecuted: false }),
  );
  assert.equal(schemaPlan.summary.decision, "SCHEMA_MISMATCH");
  assert.equal(exitCodeForPlan(schemaPlan), 3);

  const serialized = JSON.stringify(stableA);
  assert.doesNotMatch(serialized, /postgres(?:ql)?:\/\//i);
  assert.doesNotMatch(serialized, /self-test-hmac-key-material/);
  assert.doesNotMatch(
    serialized,
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
  );
  assert.equal(stableA.safety.databaseWrites, false);
  assert.equal(stableA.safety.applySupported, false);
  assert.equal(stableA.safety.proposalIsAuthorization, false);

  return {
    script: SCRIPT_NAME,
    status: "PASS",
    checks: 20,
    findingCodes: FINDING_MANIFEST.length,
    compositeConstraints: COMPOSITE_CONSTRAINTS.length,
    simpleConstraints: SIMPLE_CONSTRAINTS.length,
    parentIndexes: PARENT_INDEXES.length,
  };
}

export async function scanDatabase(
  environment,
  config,
  PrismaClientConstructor = PrismaClient,
) {
  const datasourceUrl = buildReadOnlyDatabaseUrl(
    environment.DATABASE_URL,
    config,
  );
  const prisma = new PrismaClientConstructor({
    datasourceUrl,
    log: [],
  });

  try {
    const snapshot = await prisma.$transaction(
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

        const transactionState = await transaction.$queryRawUnsafe(
          `SELECT
             current_setting('transaction_read_only') AS read_only,
             current_setting('transaction_isolation') AS isolation`,
        );
        const state = transactionState[0];
        if (
          state?.read_only !== "on" ||
          state?.isolation !== "repeatable read"
        ) {
          contractError(
            "DATABASE_READ_ONLY_SNAPSHOT_REQUIRED",
            "The database did not establish the required read-only snapshot.",
          );
        }

        const snapshotRows =
          await transaction.$queryRawUnsafe(SNAPSHOT_STATE_SQL);
        const migrationRows =
          await transaction.$queryRawUnsafe(MIGRATION_STATE_SQL);
        const catalogRows =
          await transaction.$queryRawUnsafe(CATALOG_STATE_SQL);

        if (
          snapshotRows.length !== 1 ||
          migrationRows.length !== 1 ||
          catalogRows.length !== 1
        ) {
          contractError(
            "DATABASE_AGGREGATE_CONTRACT_MISMATCH",
            "The database returned an invalid aggregate result shape.",
          );
        }
        const schema = normalizeSchemaState({
          config,
          snapshotRow: snapshotRows[0],
          migrationRow: migrationRows[0],
          catalogRow: catalogRows[0],
        });
        if (!schema.ready) {
          return {
            rows: FINDING_MANIFEST.map((finding) => ({
              code: finding.code,
              severity: finding.severity,
              count: "0",
            })),
            snapshotRow: snapshotRows[0],
            migrationRow: migrationRows[0],
            catalogRow: catalogRows[0],
            inventoryExecuted: false,
          };
        }
        const rows = await transaction.$queryRawUnsafe(
          INVENTORY_SQL,
          config.staleStartedMinutes,
          config.failedWindowDays,
          config.failedThreshold,
        );
        return {
          rows,
          snapshotRow: snapshotRows[0],
          migrationRow: migrationRows[0],
          catalogRow: catalogRows[0],
          inventoryExecuted: true,
        };
      },
      {
        isolationLevel: "RepeatableRead",
        timeout: config.transactionTimeoutMs,
        maxWait: Math.min(config.transactionTimeoutMs, 10_000),
      },
    );

    return buildPlan({ config, ...snapshot });
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
      `${renderJson(
        { script: SCRIPT_NAME, status: "ERROR", error: { code } },
        false,
      )}\n`,
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
    const plan = await scanDatabase(environment, config);
    process.stdout.write(`${renderJson(plan, options.pretty)}\n`);
    return exitCodeForPlan(plan);
  } catch (error) {
    const code = error?.safeContractError
      ? String(error.code)
      : "DATABASE_RECONCILIATION_PLAN_FAILED";
    process.stderr.write(
      `${renderJson(
        {
          script: SCRIPT_NAME,
          status: "ERROR",
          target: config?.target,
          error: { code },
        },
        false,
      )}\n`,
    );
    return 1;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (fileURLToPath(import.meta.url) === invokedPath) {
  process.exitCode = await main();
}

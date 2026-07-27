import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PrismaClient } from "@prisma/client";

export const SCRIPT_NAME = "staff-task-integrity-inventory";
export const REPORT_SCHEMA_VERSION = 1;
export const RUN_CONFIRMATION = "run-staff-task-integrity-inventory";
export const PRODUCTION_ATTESTATION =
  "I_ATTEST_THIS_IS_A_READ_ONLY_PRODUCTION_STAFF_TASK_INVENTORY";

const TARGET_ENVIRONMENTS = new Set(["development", "staging", "production"]);
const DEFAULT_STALE_STARTED_MINUTES = 60;
const DEFAULT_FAILED_WINDOW_DAYS = 14;
const DEFAULT_FAILED_THRESHOLD = 3;
const DEFAULT_LOCK_TIMEOUT_MS = 500;
const DEFAULT_STATEMENT_TIMEOUT_MS = 30_000;
const DEFAULT_TRANSACTION_TIMEOUT_MS = 120_000;

const BLOCKING = "BLOCKING";
const REVIEW = "REVIEW";

export const HELP = `
${SCRIPT_NAME}

Guarded read-only inventory for legacy StaffTask templates, recurring rules,
generated tasks, and scheduler runs. The command never repairs data.

Usage:
  node scripts/staff-task-integrity-inventory.mjs [options]

Options:
  --help       Show this help without reading environment variables or the DB.
  --self-test  Run contract/source-safety checks without reading the DB.
  --pretty     Pretty-print aggregate JSON output.

Required environment:
  DATABASE_URL
  STAFF_TASK_INTEGRITY_INVENTORY_TARGET
    One of: development, staging, production.
  STAFF_TASK_INTEGRITY_INVENTORY_CONFIRM
    Must equal: ${RUN_CONFIRMATION}

Production-only attestation:
  STAFF_TASK_INTEGRITY_INVENTORY_PRODUCTION_ATTESTATION
    Must equal:
    ${PRODUCTION_ATTESTATION}

Optional bounded settings:
  STAFF_TASK_INTEGRITY_STALE_STARTED_MINUTES  5..10080 (default 60)
  STAFF_TASK_INTEGRITY_FAILED_WINDOW_DAYS     1..365 (default 14)
  STAFF_TASK_INTEGRITY_FAILED_THRESHOLD       2..1000 (default 3)
  STAFF_TASK_INTEGRITY_LOCK_TIMEOUT_MS        100..5000 (default 500)
  STAFF_TASK_INTEGRITY_STATEMENT_TIMEOUT_MS   1000..120000 (default 30000)
  STAFF_TASK_INTEGRITY_TRANSACTION_TIMEOUT_MS 5000..600000 (default 120000)

Safety:
  The scanner uses one PostgreSQL connection and one read-only REPEATABLE READ
  transaction. Output contains aggregate counts and stable reason codes only.
  It never prints database URLs, UUIDs, names, email addresses, or row values.

Exit codes:
  0  Scan completed with no blocking findings (review findings may exist).
  1  CLI, environment, safety-contract, or database failure.
  2  Scan completed and one or more blocking findings were detected.
`.trim();

export const INVENTORY_SQL = `
WITH findings AS (
  SELECT
    'TEMPLATE_STORE_CROSS_TENANT'::text AS code,
    '${BLOCKING}'::text AS severity,
    (
      SELECT COUNT(*)
      FROM "StaffTaskTemplate" AS template
      JOIN "Store" AS store ON store."id" = template."storeId"
      WHERE store."tenantId" <> template."tenantId"
    )::bigint AS finding_count

  UNION ALL
  SELECT 'TEMPLATE_CREATOR_CROSS_TENANT', '${BLOCKING}', (
    SELECT COUNT(*)
    FROM "StaffTaskTemplate" AS template
    JOIN "User" AS creator ON creator."id" = template."createdByUserId"
    WHERE creator."tenantId" <> template."tenantId"
  )::bigint

  UNION ALL
  SELECT 'RULE_TEMPLATE_CROSS_TENANT', '${BLOCKING}', (
    SELECT COUNT(*)
    FROM "StaffTaskRecurringRule" AS rule
    JOIN "StaffTaskTemplate" AS template ON template."id" = rule."templateId"
    WHERE template."tenantId" <> rule."tenantId"
  )::bigint

  UNION ALL
  SELECT 'RULE_STORE_CROSS_TENANT', '${BLOCKING}', (
    SELECT COUNT(*)
    FROM "StaffTaskRecurringRule" AS rule
    JOIN "Store" AS store ON store."id" = rule."storeId"
    WHERE store."tenantId" <> rule."tenantId"
  )::bigint

  UNION ALL
  SELECT 'RULE_CREATOR_CROSS_TENANT', '${BLOCKING}', (
    SELECT COUNT(*)
    FROM "StaffTaskRecurringRule" AS rule
    JOIN "User" AS creator ON creator."id" = rule."createdByUserId"
    WHERE creator."tenantId" <> rule."tenantId"
  )::bigint

  UNION ALL
  SELECT 'RULE_ASSIGNEE_CROSS_TENANT', '${BLOCKING}', (
    SELECT COUNT(*)
    FROM "StaffTaskRecurringRule" AS rule
    JOIN "User" AS assignee ON assignee."id" = rule."assignedToUserId"
    WHERE assignee."tenantId" <> rule."tenantId"
  )::bigint

  UNION ALL
  SELECT 'RULE_LAST_TASK_CROSS_TENANT', '${BLOCKING}', (
    SELECT COUNT(*)
    FROM "StaffTaskRecurringRule" AS rule
    JOIN "StaffTask" AS task ON task."id" = rule."lastCreatedTaskId"
    WHERE task."tenantId" <> rule."tenantId"
  )::bigint

  UNION ALL
  SELECT 'RUN_RULE_CROSS_TENANT', '${BLOCKING}', (
    SELECT COUNT(*)
    FROM "StaffTaskRecurringRuleRun" AS run
    JOIN "StaffTaskRecurringRule" AS rule ON rule."id" = run."ruleId"
    WHERE rule."tenantId" <> run."tenantId"
  )::bigint

  UNION ALL
  SELECT 'RUN_TASK_CROSS_TENANT', '${BLOCKING}', (
    SELECT COUNT(*)
    FROM "StaffTaskRecurringRuleRun" AS run
    JOIN "StaffTask" AS task ON task."id" = run."createdTaskId"
    WHERE task."tenantId" <> run."tenantId"
  )::bigint

  UNION ALL
  SELECT 'TASK_STORE_CROSS_TENANT', '${BLOCKING}', (
    SELECT COUNT(*)
    FROM "StaffTask" AS task
    JOIN "Store" AS store ON store."id" = task."storeId"
    WHERE store."tenantId" <> task."tenantId"
  )::bigint

  UNION ALL
  SELECT 'TASK_TEMPLATE_CROSS_TENANT', '${BLOCKING}', (
    SELECT COUNT(*)
    FROM "StaffTask" AS task
    JOIN "StaffTaskTemplate" AS template
      ON template."id" = task."sourceTemplateId"
    WHERE template."tenantId" <> task."tenantId"
  )::bigint

  UNION ALL
  SELECT 'TASK_RULE_CROSS_TENANT', '${BLOCKING}', (
    SELECT COUNT(*)
    FROM "StaffTask" AS task
    JOIN "StaffTaskRecurringRule" AS rule
      ON rule."id" = task."sourceRecurringRuleId"
    WHERE rule."tenantId" <> task."tenantId"
  )::bigint

  UNION ALL
  SELECT 'TASK_CREATOR_CROSS_TENANT', '${BLOCKING}', (
    SELECT COUNT(*)
    FROM "StaffTask" AS task
    JOIN "User" AS creator ON creator."id" = task."createdByUserId"
    WHERE creator."tenantId" <> task."tenantId"
  )::bigint

  UNION ALL
  SELECT 'TASK_ASSIGNEE_CROSS_TENANT', '${BLOCKING}', (
    SELECT COUNT(*)
    FROM "StaffTask" AS task
    JOIN "User" AS assignee ON assignee."id" = task."assignedToUserId"
    WHERE assignee."tenantId" <> task."tenantId"
  )::bigint

  UNION ALL
  SELECT 'RULE_TEMPLATE_STORE_MISMATCH', '${BLOCKING}', (
    SELECT COUNT(*)
    FROM "StaffTaskRecurringRule" AS rule
    JOIN "StaffTaskTemplate" AS template ON template."id" = rule."templateId"
    WHERE template."storeId" IS NOT NULL
      AND rule."storeId" IS DISTINCT FROM template."storeId"
  )::bigint

  UNION ALL
  SELECT 'TASK_TEMPLATE_STORE_MISMATCH', '${REVIEW}', (
    SELECT COUNT(*)
    FROM "StaffTask" AS task
    JOIN "StaffTaskTemplate" AS template
      ON template."id" = task."sourceTemplateId"
    WHERE template."storeId" IS NOT NULL
      AND task."storeId" IS DISTINCT FROM template."storeId"
  )::bigint

  UNION ALL
  SELECT 'TASK_RULE_STORE_MISMATCH', '${REVIEW}', (
    SELECT COUNT(*)
    FROM "StaffTask" AS task
    JOIN "StaffTaskRecurringRule" AS rule
      ON rule."id" = task."sourceRecurringRuleId"
    WHERE task."storeId" IS DISTINCT FROM rule."storeId"
  )::bigint

  UNION ALL
  SELECT 'RULE_LAST_TASK_SOURCE_MISMATCH', '${BLOCKING}', (
    SELECT COUNT(*)
    FROM "StaffTaskRecurringRule" AS rule
    JOIN "StaffTask" AS task ON task."id" = rule."lastCreatedTaskId"
    WHERE task."sourceRecurringRuleId" IS DISTINCT FROM rule."id"
  )::bigint

  UNION ALL
  SELECT 'RUN_TASK_SOURCE_MISMATCH', '${BLOCKING}', (
    SELECT COUNT(*)
    FROM "StaffTaskRecurringRuleRun" AS run
    JOIN "StaffTask" AS task ON task."id" = run."createdTaskId"
    JOIN "StaffTaskRecurringRule" AS rule ON rule."id" = run."ruleId"
    WHERE task."sourceRecurringRuleId" IS DISTINCT FROM rule."id"
  )::bigint

  UNION ALL
  SELECT 'ACTIVE_RULE_NULL_STORE', '${BLOCKING}', (
    SELECT COUNT(*)
    FROM "StaffTaskRecurringRule"
    WHERE "status" = 'ACTIVE'
      AND "storeId" IS NULL
  )::bigint

  UNION ALL
  SELECT 'ACTIVE_RULE_NULL_NEXT_RUN_AT', '${BLOCKING}', (
    SELECT COUNT(*)
    FROM "StaffTaskRecurringRule"
    WHERE "status" = 'ACTIVE'
      AND "nextRunAt" IS NULL
  )::bigint

  UNION ALL
  SELECT 'ACTIVE_RULE_STORE_TIMEZONE_MISSING', '${BLOCKING}', (
    SELECT COUNT(*)
    FROM "StaffTaskRecurringRule" AS rule
    JOIN "Store" AS store ON store."id" = rule."storeId"
    WHERE rule."status" = 'ACTIVE'
      AND NULLIF(BTRIM(store."timeZone"), '') IS NULL
  )::bigint

  UNION ALL
  SELECT 'ACTIVE_RULE_STORE_TIMEZONE_INVALID', '${BLOCKING}', (
    SELECT COUNT(*)
    FROM "StaffTaskRecurringRule" AS rule
    JOIN "Store" AS store ON store."id" = rule."storeId"
    WHERE rule."status" = 'ACTIVE'
      AND NULLIF(BTRIM(store."timeZone"), '') IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM pg_timezone_names AS timezone
        WHERE timezone.name = store."timeZone"
      )
  )::bigint

  UNION ALL
  SELECT 'ACTIVE_RULE_INACTIVE_STORE', '${BLOCKING}', (
    SELECT COUNT(*)
    FROM "StaffTaskRecurringRule" AS rule
    JOIN "Store" AS store ON store."id" = rule."storeId"
    WHERE rule."status" = 'ACTIVE'
      AND store."isActive" = false
  )::bigint

  UNION ALL
  SELECT 'ACTIVE_RULE_INACTIVE_TEMPLATE', '${BLOCKING}', (
    SELECT COUNT(*)
    FROM "StaffTaskRecurringRule" AS rule
    JOIN "StaffTaskTemplate" AS template ON template."id" = rule."templateId"
    WHERE rule."status" = 'ACTIVE'
      AND template."status" <> 'ACTIVE'
  )::bigint

  UNION ALL
  SELECT 'ACTIVE_TEMPLATE_INACTIVE_STORE', '${BLOCKING}', (
    SELECT COUNT(*)
    FROM "StaffTaskTemplate" AS template
    JOIN "Store" AS store ON store."id" = template."storeId"
    WHERE template."status" = 'ACTIVE'
      AND store."isActive" = false
  )::bigint

  UNION ALL
  SELECT 'ACTIVE_RULE_INACTIVE_TENANT', '${BLOCKING}', (
    SELECT COUNT(*)
    FROM "StaffTaskRecurringRule" AS rule
    JOIN "Tenant" AS tenant ON tenant."id" = rule."tenantId"
    WHERE rule."status" = 'ACTIVE'
      AND tenant."status" <> 'ACTIVE'
  )::bigint

  UNION ALL
  SELECT 'RULE_ASSIGNEE_PLATFORM', '${BLOCKING}', (
    SELECT COUNT(*)
    FROM "StaffTaskRecurringRule" AS rule
    JOIN "User" AS assignee ON assignee."id" = rule."assignedToUserId"
    WHERE rule."status" = 'ACTIVE'
      AND assignee."isPlatformAdmin" = true
  )::bigint

  UNION ALL
  SELECT 'RULE_ASSIGNEE_INACTIVE', '${BLOCKING}', (
    SELECT COUNT(*)
    FROM "StaffTaskRecurringRule" AS rule
    JOIN "User" AS assignee ON assignee."id" = rule."assignedToUserId"
    WHERE rule."status" = 'ACTIVE'
      AND assignee."isActive" = false
  )::bigint

  UNION ALL
  SELECT 'RULE_ASSIGNEE_SCOPE_INVALID', '${BLOCKING}', (
    SELECT COUNT(*)
    FROM "StaffTaskRecurringRule" AS rule
    JOIN "User" AS assignee ON assignee."id" = rule."assignedToUserId"
    WHERE rule."status" = 'ACTIVE'
      AND assignee."accessScope" IS NULL
  )::bigint

  UNION ALL
  SELECT 'RULE_ASSIGNEE_OUT_OF_STORE', '${BLOCKING}', (
    SELECT COUNT(*)
    FROM "StaffTaskRecurringRule" AS rule
    JOIN "User" AS assignee ON assignee."id" = rule."assignedToUserId"
    WHERE rule."status" = 'ACTIVE'
      AND rule."storeId" IS NOT NULL
      AND assignee."accessScope" = 'STORES'
      AND NOT EXISTS (
        SELECT 1
        FROM "UserStoreAccess" AS access
        WHERE access."userId" = assignee."id"
          AND access."storeId" = rule."storeId"
      )
  )::bigint

  UNION ALL
  SELECT 'RULE_ASSIGNEE_GLOBAL_SCOPE_INVALID', '${BLOCKING}', (
    SELECT COUNT(*)
    FROM "StaffTaskRecurringRule" AS rule
    JOIN "User" AS assignee ON assignee."id" = rule."assignedToUserId"
    WHERE rule."status" = 'ACTIVE'
      AND rule."storeId" IS NULL
      AND assignee."accessScope" = 'STORES'
  )::bigint

  UNION ALL
  SELECT 'TASK_ASSIGNEE_PLATFORM', '${BLOCKING}', (
    SELECT COUNT(*)
    FROM "StaffTask" AS task
    JOIN "User" AS assignee ON assignee."id" = task."assignedToUserId"
    WHERE task."status" IN ('OPEN', 'IN_PROGRESS', 'ON_REVIEW')
      AND assignee."isPlatformAdmin" = true
  )::bigint

  UNION ALL
  SELECT 'TASK_ASSIGNEE_INACTIVE', '${BLOCKING}', (
    SELECT COUNT(*)
    FROM "StaffTask" AS task
    JOIN "User" AS assignee ON assignee."id" = task."assignedToUserId"
    WHERE task."status" IN ('OPEN', 'IN_PROGRESS', 'ON_REVIEW')
      AND assignee."isActive" = false
  )::bigint

  UNION ALL
  SELECT 'TASK_ASSIGNEE_SCOPE_INVALID', '${BLOCKING}', (
    SELECT COUNT(*)
    FROM "StaffTask" AS task
    JOIN "User" AS assignee ON assignee."id" = task."assignedToUserId"
    WHERE task."status" IN ('OPEN', 'IN_PROGRESS', 'ON_REVIEW')
      AND assignee."accessScope" IS NULL
  )::bigint

  UNION ALL
  SELECT 'TASK_ASSIGNEE_OUT_OF_STORE', '${BLOCKING}', (
    SELECT COUNT(*)
    FROM "StaffTask" AS task
    JOIN "User" AS assignee ON assignee."id" = task."assignedToUserId"
    WHERE task."status" IN ('OPEN', 'IN_PROGRESS', 'ON_REVIEW')
      AND task."storeId" IS NOT NULL
      AND assignee."accessScope" = 'STORES'
      AND NOT EXISTS (
        SELECT 1
        FROM "UserStoreAccess" AS access
        WHERE access."userId" = assignee."id"
          AND access."storeId" = task."storeId"
      )
  )::bigint

  UNION ALL
  SELECT 'TASK_ASSIGNEE_GLOBAL_SCOPE_INVALID', '${REVIEW}', (
    SELECT COUNT(*)
    FROM "StaffTask" AS task
    JOIN "User" AS assignee ON assignee."id" = task."assignedToUserId"
    WHERE task."status" IN ('OPEN', 'IN_PROGRESS', 'ON_REVIEW')
      AND task."storeId" IS NULL
      AND assignee."accessScope" = 'STORES'
  )::bigint

  UNION ALL
  SELECT 'STALE_STARTED_RUN', '${BLOCKING}', (
    SELECT COUNT(*)
    FROM "StaffTaskRecurringRuleRun"
    WHERE "status" = 'STARTED'
      AND "completedAt" IS NULL
      AND "startedAt" < CURRENT_TIMESTAMP - ($1::integer * INTERVAL '1 minute')
  )::bigint

  UNION ALL
  SELECT 'REPEATED_FAILED_RUN', '${BLOCKING}', (
    SELECT COUNT(*)
    FROM (
      SELECT run."tenantId", run."ruleId"
      FROM "StaffTaskRecurringRuleRun" AS run
      WHERE run."status" = 'FAILED'
        AND run."startedAt" >=
          CURRENT_TIMESTAMP - ($2::integer * INTERVAL '1 day')
      GROUP BY run."tenantId", run."ruleId"
      HAVING COUNT(*) >= $3::integer
    ) AS repeated_failure
  )::bigint

  UNION ALL
  SELECT 'ACTIVE_TEMPLATE_NULL_STORE', '${REVIEW}', (
    SELECT COUNT(*)
    FROM "StaffTaskTemplate"
    WHERE "status" = 'ACTIVE'
      AND "storeId" IS NULL
  )::bigint

  UNION ALL
  SELECT 'TASK_STORE_SET_NULL_CANDIDATE', '${REVIEW}', (
    SELECT COUNT(*)
    FROM "StaffTask"
    WHERE "storeId" IS NOT NULL
  )::bigint

  UNION ALL
  SELECT 'TEMPLATE_STORE_SET_NULL_CANDIDATE', '${REVIEW}', (
    SELECT COUNT(*)
    FROM "StaffTaskTemplate"
    WHERE "storeId" IS NOT NULL
  )::bigint

  UNION ALL
  SELECT 'RULE_STORE_SET_NULL_CANDIDATE', '${REVIEW}', (
    SELECT COUNT(*)
    FROM "StaffTaskRecurringRule"
    WHERE "storeId" IS NOT NULL
  )::bigint
)
SELECT code, severity, finding_count::text AS count
FROM findings
ORDER BY severity, code
`.trim();

function contractError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.safeContractError = true;
  throw error;
}

export function parseBoundedInteger(
  value,
  { code, label, minimum, maximum, fallback },
) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  if (!/^\d+$/.test(String(value))) {
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

export function parseRuntimeContract(environment) {
  const target = String(environment.STAFF_TASK_INTEGRITY_INVENTORY_TARGET ?? "")
    .trim()
    .toLowerCase();
  if (!TARGET_ENVIRONMENTS.has(target)) {
    contractError(
      "TARGET_ENVIRONMENT_REQUIRED",
      "STAFF_TASK_INTEGRITY_INVENTORY_TARGET must name an allowed environment.",
    );
  }

  if (environment.STAFF_TASK_INTEGRITY_INVENTORY_CONFIRM !== RUN_CONFIRMATION) {
    contractError(
      "RUN_CONFIRMATION_REQUIRED",
      "The exact staff task inventory confirmation is required.",
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
    environment.STAFF_TASK_INTEGRITY_INVENTORY_PRODUCTION_ATTESTATION !==
      PRODUCTION_ATTESTATION
  ) {
    contractError(
      "PRODUCTION_ATTESTATION_REQUIRED",
      "The exact production read-only inventory attestation is required.",
    );
  }

  if (!String(environment.DATABASE_URL ?? "").trim()) {
    contractError("DATABASE_URL_REQUIRED", "DATABASE_URL is required.");
  }

  return {
    target,
    productionAttested: productionRequested,
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
      environment.STAFF_TASK_INTEGRITY_LOCK_TIMEOUT_MS,
      {
        code: "LOCK_TIMEOUT_INVALID",
        label: "STAFF_TASK_INTEGRITY_LOCK_TIMEOUT_MS",
        minimum: 100,
        maximum: 5_000,
        fallback: DEFAULT_LOCK_TIMEOUT_MS,
      },
    ),
    statementTimeoutMs: parseBoundedInteger(
      environment.STAFF_TASK_INTEGRITY_STATEMENT_TIMEOUT_MS,
      {
        code: "STATEMENT_TIMEOUT_INVALID",
        label: "STAFF_TASK_INTEGRITY_STATEMENT_TIMEOUT_MS",
        minimum: 1_000,
        maximum: 120_000,
        fallback: DEFAULT_STATEMENT_TIMEOUT_MS,
      },
    ),
    transactionTimeoutMs: parseBoundedInteger(
      environment.STAFF_TASK_INTEGRITY_TRANSACTION_TIMEOUT_MS,
      {
        code: "TRANSACTION_TIMEOUT_INVALID",
        label: "STAFF_TASK_INTEGRITY_TRANSACTION_TIMEOUT_MS",
        minimum: 5_000,
        maximum: 600_000,
        fallback: DEFAULT_TRANSACTION_TIMEOUT_MS,
      },
    ),
  };
}

export function buildReadOnlyDatabaseUrl(rawDatabaseUrl, config) {
  let parsed;
  try {
    parsed = new URL(rawDatabaseUrl);
  } catch {
    contractError("DATABASE_URL_INVALID", "DATABASE_URL must be a valid URL.");
  }

  if (!["postgresql:", "postgres:"].includes(parsed.protocol)) {
    contractError(
      "DATABASE_URL_PROTOCOL_INVALID",
      "DATABASE_URL must use PostgreSQL.",
    );
  }

  parsed.searchParams.set("connection_limit", "1");
  const existingOptions = parsed.searchParams.get("options")?.trim();
  const enforcedOptions = [
    existingOptions,
    "-c default_transaction_read_only=on",
    `-c lock_timeout=${config.lockTimeoutMs}`,
    `-c statement_timeout=${config.statementTimeoutMs}`,
    `-c idle_in_transaction_session_timeout=${config.transactionTimeoutMs}`,
  ]
    .filter(Boolean)
    .join(" ");
  parsed.searchParams.set("options", enforcedOptions);
  return parsed.toString();
}

function safeCount(value) {
  const serialized = String(value);
  if (!/^\d+$/.test(serialized)) {
    contractError(
      "DATABASE_COUNT_INVALID",
      "The database returned an invalid aggregate count.",
    );
  }
  const parsed = Number.parseInt(serialized, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    contractError(
      "DATABASE_COUNT_INVALID",
      "The database returned an invalid aggregate count.",
    );
  }
  return parsed;
}

export function buildReport({ target, thresholds, rows, generatedAt }) {
  const findings = rows.map((row) => {
    const severity = String(row.severity);
    if (![BLOCKING, REVIEW].includes(severity)) {
      contractError(
        "DATABASE_SEVERITY_INVALID",
        "The database returned an invalid finding severity.",
      );
    }
    return {
      code: String(row.code),
      severity,
      count: safeCount(row.count),
    };
  });

  const blockingTotal = findings
    .filter((finding) => finding.severity === BLOCKING)
    .reduce((total, finding) => total + finding.count, 0);
  const reviewTotal = findings
    .filter((finding) => finding.severity === REVIEW)
    .reduce((total, finding) => total + finding.count, 0);
  const decision =
    blockingTotal > 0 ? "BLOCKED" : reviewTotal > 0 ? "REVIEW" : "PASS";

  return {
    script: SCRIPT_NAME,
    reportSchemaVersion: REPORT_SCHEMA_VERSION,
    generatedAt,
    target,
    safety: {
      databaseWrites: false,
      connectionLimit: 1,
      transactionReadOnly: true,
      isolationLevel: "REPEATABLE READ",
      outputContainsRowIdentifiers: false,
    },
    thresholds,
    summary: {
      decision,
      blockingTotal,
      blockingCodes: findings.filter(
        (finding) => finding.severity === BLOCKING && finding.count > 0,
      ).length,
      reviewTotal,
      reviewCodes: findings.filter(
        (finding) => finding.severity === REVIEW && finding.count > 0,
      ).length,
    },
    findings,
  };
}

function assertInventorySourceSafety() {
  const mutatingKeyword =
    /\b(?:INSERT|UPDATE|DELETE|MERGE|ALTER|CREATE|DROP|TRUNCATE|COPY|CALL|DO|GRANT|REVOKE)\b/i;
  assert.equal(
    mutatingKeyword.test(INVENTORY_SQL),
    false,
    "inventory SQL contains a mutating statement keyword",
  );
  assert.match(INVENTORY_SQL, /COUNT\(\*\)/);
  assert.doesNotMatch(INVENTORY_SQL, /SELECT\s+\*/i);
}

export function runSelfTest() {
  assert.deepEqual(parseArguments(["--pretty", "--self-test"]), {
    help: false,
    selfTest: true,
    pretty: true,
  });
  assert.deepEqual(parseArguments(["--help", "--pretty"]), {
    help: true,
    selfTest: false,
    pretty: false,
  });
  assert.throws(() => parseArguments(["--apply"]), {
    code: "CLI_ARGUMENT_UNSUPPORTED",
  });

  const testEnvironment = {
    DATABASE_URL: "postgresql://inventory:test@127.0.0.1:5432/example",
    STAFF_TASK_INTEGRITY_INVENTORY_TARGET: "staging",
    STAFF_TASK_INTEGRITY_INVENTORY_CONFIRM: RUN_CONFIRMATION,
  };
  const config = parseRuntimeContract(testEnvironment);
  assert.equal(config.target, "staging");
  assert.equal(config.staleStartedMinutes, DEFAULT_STALE_STARTED_MINUTES);
  assert.throws(
    () =>
      parseRuntimeContract({
        ...testEnvironment,
        STAFF_TASK_INTEGRITY_INVENTORY_TARGET: "production",
      }),
    { code: "PRODUCTION_ATTESTATION_REQUIRED" },
  );

  const readOnlyUrl = new URL(
    buildReadOnlyDatabaseUrl(testEnvironment.DATABASE_URL, config),
  );
  assert.equal(readOnlyUrl.searchParams.get("connection_limit"), "1");
  assert.match(
    readOnlyUrl.searchParams.get("options") ?? "",
    /default_transaction_read_only=on/,
  );

  const passReport = buildReport({
    target: "development",
    generatedAt: "2026-07-27T00:00:00.000Z",
    thresholds: {
      staleStartedMinutes: 60,
      failedWindowDays: 14,
      failedThreshold: 3,
    },
    rows: [
      { code: "A", severity: BLOCKING, count: "0" },
      { code: "B", severity: REVIEW, count: "0" },
    ],
  });
  assert.equal(passReport.summary.decision, "PASS");

  const reviewReport = buildReport({
    target: "development",
    generatedAt: "2026-07-27T00:00:00.000Z",
    thresholds: passReport.thresholds,
    rows: [
      { code: "A", severity: BLOCKING, count: "0" },
      { code: "B", severity: REVIEW, count: "2" },
    ],
  });
  assert.equal(reviewReport.summary.decision, "REVIEW");

  const blockedReport = buildReport({
    target: "development",
    generatedAt: "2026-07-27T00:00:00.000Z",
    thresholds: passReport.thresholds,
    rows: [
      { code: "A", severity: BLOCKING, count: "1" },
      { code: "B", severity: REVIEW, count: "0" },
    ],
  });
  assert.equal(blockedReport.summary.decision, "BLOCKED");
  assertInventorySourceSafety();
  return {
    script: SCRIPT_NAME,
    status: "PASS",
    checks: 12,
  };
}

async function scanDatabase(environment, config) {
  const datasourceUrl = buildReadOnlyDatabaseUrl(
    environment.DATABASE_URL,
    config,
  );
  const prisma = new PrismaClient({
    datasourceUrl,
    log: [],
  });

  try {
    const rows = await prisma.$transaction(
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

        return transaction.$queryRawUnsafe(
          INVENTORY_SQL,
          config.staleStartedMinutes,
          config.failedWindowDays,
          config.failedThreshold,
        );
      },
      {
        isolationLevel: "RepeatableRead",
        timeout: config.transactionTimeoutMs,
        maxWait: Math.min(config.transactionTimeoutMs, 10_000),
      },
    );

    return buildReport({
      target: config.target,
      generatedAt: new Date().toISOString(),
      thresholds: {
        staleStartedMinutes: config.staleStartedMinutes,
        failedWindowDays: config.failedWindowDays,
        failedThreshold: config.failedThreshold,
      },
      rows,
    });
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
    const report = await scanDatabase(environment, config);
    process.stdout.write(`${renderJson(report, options.pretty)}\n`);
    return report.summary.blockingTotal > 0 ? 2 : 0;
  } catch (error) {
    const code = error?.safeContractError
      ? String(error.code)
      : "DATABASE_INVENTORY_FAILED";
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

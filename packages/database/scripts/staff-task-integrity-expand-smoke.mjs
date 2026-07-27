import { Prisma, PrismaClient } from "@prisma/client";
import { spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import {
  cp,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const REQUIRED_CONFIRMATION = "run-staff-task-integrity-expand-fixtures";
const BASELINE_LAST_MIGRATION =
  "20260727120000_staff_task_catalog_audit_expand";
const EXPECTED_BASELINE_MIGRATION_COUNT = 156;
const EXPAND_MIGRATIONS = [
  "20260727130100_staff_task_store_tenant_key",
  "20260727130200_staff_task_user_tenant_key",
  "20260727130300_staff_task_template_tenant_key",
  "20260727130400_staff_task_recurring_rule_tenant_key",
  "20260727130500_staff_task_tenant_key",
  "20260727131000_staff_task_integrity_expand",
];
const FINAL_MIGRATION = EXPAND_MIGRATIONS.at(-1);
const SAFE_SCHEMA_PREFIX = "staff_task_test_integrity_expand_";
const SAFE_SCHEMA_PATTERN = /^staff_task_test_integrity_expand_[a-f0-9]{16}$/;
const MIGRATION_PATTERN = /^\d{14}_[a-z0-9_]+$/;
const MIGRATION_TIMEOUT_MS = 10 * 60 * 1000;
const TEMP_ROOT_PREFIX = "leetplus-staff-task-integrity-";

const CONSTRAINTS = [
  {
    table: "StaffTaskTemplate",
    name: "StaffTaskTemplate_tenantId_storeId_fkey",
    localColumns: ["tenantId", "storeId"],
    parentTable: "Store",
    parentColumns: ["tenantId", "id"],
    deleteAction: "r",
    deleteSetColumns: [],
  },
  {
    table: "StaffTaskTemplate",
    name: "StaffTaskTemplate_tenantId_createdByUserId_fkey",
    localColumns: ["tenantId", "createdByUserId"],
    parentTable: "User",
    parentColumns: ["tenantId", "id"],
    deleteAction: "n",
    deleteSetColumns: ["createdByUserId"],
  },
  {
    table: "StaffTaskRecurringRule",
    name: "StaffTaskRecurringRule_tenantId_templateId_fkey",
    localColumns: ["tenantId", "templateId"],
    parentTable: "StaffTaskTemplate",
    parentColumns: ["tenantId", "id"],
    deleteAction: "n",
    deleteSetColumns: ["templateId"],
  },
  {
    table: "StaffTaskRecurringRule",
    name: "StaffTaskRecurringRule_tenantId_storeId_fkey",
    localColumns: ["tenantId", "storeId"],
    parentTable: "Store",
    parentColumns: ["tenantId", "id"],
    deleteAction: "r",
    deleteSetColumns: [],
  },
  {
    table: "StaffTaskRecurringRule",
    name: "StaffTaskRecurringRule_tenantId_createdByUserId_fkey",
    localColumns: ["tenantId", "createdByUserId"],
    parentTable: "User",
    parentColumns: ["tenantId", "id"],
    deleteAction: "n",
    deleteSetColumns: ["createdByUserId"],
  },
  {
    table: "StaffTaskRecurringRule",
    name: "StaffTaskRecurringRule_tenantId_assignedToUserId_fkey",
    localColumns: ["tenantId", "assignedToUserId"],
    parentTable: "User",
    parentColumns: ["tenantId", "id"],
    deleteAction: "n",
    deleteSetColumns: ["assignedToUserId"],
  },
  {
    table: "StaffTaskRecurringRule",
    name: "StaffTaskRecurringRule_tenantId_lastCreatedTaskId_fkey",
    localColumns: ["tenantId", "lastCreatedTaskId"],
    parentTable: "StaffTask",
    parentColumns: ["tenantId", "id"],
    deleteAction: "n",
    deleteSetColumns: ["lastCreatedTaskId"],
  },
  {
    table: "StaffTaskRecurringRuleRun",
    name: "StaffTaskRecurringRuleRun_tenantId_ruleId_fkey",
    localColumns: ["tenantId", "ruleId"],
    parentTable: "StaffTaskRecurringRule",
    parentColumns: ["tenantId", "id"],
    deleteAction: "c",
    deleteSetColumns: [],
  },
  {
    table: "StaffTaskRecurringRuleRun",
    name: "StaffTaskRecurringRuleRun_tenantId_createdTaskId_fkey",
    localColumns: ["tenantId", "createdTaskId"],
    parentTable: "StaffTask",
    parentColumns: ["tenantId", "id"],
    deleteAction: "n",
    deleteSetColumns: ["createdTaskId"],
  },
  {
    table: "StaffTask",
    name: "StaffTask_tenantId_storeId_fkey",
    localColumns: ["tenantId", "storeId"],
    parentTable: "Store",
    parentColumns: ["tenantId", "id"],
    deleteAction: "r",
    deleteSetColumns: [],
  },
  {
    table: "StaffTask",
    name: "StaffTask_tenantId_sourceTemplateId_fkey",
    localColumns: ["tenantId", "sourceTemplateId"],
    parentTable: "StaffTaskTemplate",
    parentColumns: ["tenantId", "id"],
    deleteAction: "n",
    deleteSetColumns: ["sourceTemplateId"],
  },
  {
    table: "StaffTask",
    name: "StaffTask_tenantId_sourceRecurringRuleId_fkey",
    localColumns: ["tenantId", "sourceRecurringRuleId"],
    parentTable: "StaffTaskRecurringRule",
    parentColumns: ["tenantId", "id"],
    deleteAction: "n",
    deleteSetColumns: ["sourceRecurringRuleId"],
  },
  {
    table: "StaffTask",
    name: "StaffTask_tenantId_createdByUserId_fkey",
    localColumns: ["tenantId", "createdByUserId"],
    parentTable: "User",
    parentColumns: ["tenantId", "id"],
    deleteAction: "n",
    deleteSetColumns: ["createdByUserId"],
  },
  {
    table: "StaffTask",
    name: "StaffTask_tenantId_assignedToUserId_fkey",
    localColumns: ["tenantId", "assignedToUserId"],
    parentTable: "User",
    parentColumns: ["tenantId", "id"],
    deleteAction: "n",
    deleteSetColumns: ["assignedToUserId"],
  },
];

const PARENT_INDEXES = [
  {
    table: "Store",
    name: "store_tenant_id_uidx",
    columns: ["tenantId", "id"],
  },
  {
    table: "User",
    name: "user_tenant_id_uidx",
    columns: ["tenantId", "id"],
  },
  {
    table: "StaffTaskTemplate",
    name: "staff_task_template_tenant_id_uidx",
    columns: ["tenantId", "id"],
  },
  {
    table: "StaffTaskRecurringRule",
    name: "staff_task_rule_tenant_id_uidx",
    columns: ["tenantId", "id"],
  },
  {
    table: "StaffTask",
    name: "staff_task_tenant_id_uidx",
    columns: ["tenantId", "id"],
  },
];

const LEGACY_STORE_CONSTRAINTS = [
  {
    table: "StaffTaskTemplate",
    name: "StaffTaskTemplate_storeId_fkey",
  },
  {
    table: "StaffTaskRecurringRule",
    name: "StaffTaskRecurringRule_storeId_fkey",
  },
  {
    table: "StaffTask",
    name: "StaffTask_storeId_fkey",
  },
];

const LEGACY_COMPATIBILITY_CONSTRAINTS = [
  {
    table: "StaffTaskTemplate",
    name: "StaffTaskTemplate_createdByUserId_fkey",
    localColumn: "createdByUserId",
    parentTable: "User",
    deleteAction: "n",
  },
  {
    table: "StaffTaskRecurringRule",
    name: "StaffTaskRecurringRule_templateId_fkey",
    localColumn: "templateId",
    parentTable: "StaffTaskTemplate",
    deleteAction: "n",
  },
  {
    table: "StaffTaskRecurringRule",
    name: "StaffTaskRecurringRule_createdByUserId_fkey",
    localColumn: "createdByUserId",
    parentTable: "User",
    deleteAction: "n",
  },
  {
    table: "StaffTaskRecurringRule",
    name: "StaffTaskRecurringRule_assignedToUserId_fkey",
    localColumn: "assignedToUserId",
    parentTable: "User",
    deleteAction: "n",
  },
  {
    table: "StaffTaskRecurringRule",
    name: "StaffTaskRecurringRule_lastCreatedTaskId_fkey",
    localColumn: "lastCreatedTaskId",
    parentTable: "StaffTask",
    deleteAction: "n",
  },
  {
    table: "StaffTaskRecurringRuleRun",
    name: "StaffTaskRecurringRuleRun_ruleId_fkey",
    localColumn: "ruleId",
    parentTable: "StaffTaskRecurringRule",
    deleteAction: "c",
  },
  {
    table: "StaffTaskRecurringRuleRun",
    name: "StaffTaskRecurringRuleRun_createdTaskId_fkey",
    localColumn: "createdTaskId",
    parentTable: "StaffTask",
    deleteAction: "n",
  },
  {
    table: "StaffTask",
    name: "StaffTask_sourceTemplateId_fkey",
    localColumn: "sourceTemplateId",
    parentTable: "StaffTaskTemplate",
    deleteAction: "n",
  },
  {
    table: "StaffTask",
    name: "StaffTask_sourceRecurringRuleId_fkey",
    localColumn: "sourceRecurringRuleId",
    parentTable: "StaffTaskRecurringRule",
    deleteAction: "n",
  },
  {
    table: "StaffTask",
    name: "StaffTask_createdByUserId_fkey",
    localColumn: "createdByUserId",
    parentTable: "User",
    deleteAction: "n",
  },
  {
    table: "StaffTask",
    name: "StaffTask_assignedToUserId_fkey",
    localColumn: "assignedToUserId",
    parentTable: "User",
    deleteAction: "n",
  },
];

const DB_NATIVE_CONSTRAINT_NAMES = [
  ...CONSTRAINTS.map((constraint) => constraint.name),
  ...LEGACY_STORE_CONSTRAINTS.map((constraint) => constraint.name),
  ...LEGACY_COMPATIBILITY_CONSTRAINTS.map((constraint) => constraint.name),
];

const EXPECTED_PRISMA_DRIFT_DROPS = [
  ...CONSTRAINTS.filter((constraint) => constraint.parentTable !== "Store").map(
    (constraint) => constraint.name,
  ),
  ...LEGACY_STORE_CONSTRAINTS.map((constraint) => constraint.name),
].sort();

const DB_NATIVE_TABLE_NAMES = [
  ...new Set(
    CONSTRAINTS.flatMap((constraint) => [
      constraint.table,
      constraint.parentTable,
    ]),
  ),
].sort();

const DB_NATIVE_REQUIRED_COLUMNS = Object.freeze([
  { table: "Store", columns: ["id", "tenantId"] },
  { table: "User", columns: ["id", "tenantId"] },
  { table: "StaffTaskTemplate", columns: ["id", "tenantId"] },
  { table: "StaffTaskRecurringRule", columns: ["id", "tenantId"] },
  {
    table: "StaffTaskRecurringRuleRun",
    columns: ["id", "tenantId", "ruleId"],
  },
  { table: "StaffTask", columns: ["id", "tenantId"] },
]);

const EXPECTED_COMPATIBILITY_CONSTRAINT_NAMES = [
  ...LEGACY_STORE_CONSTRAINTS.map((constraint) => constraint.name),
  ...LEGACY_COMPATIBILITY_CONSTRAINTS.map((constraint) => constraint.name),
].sort();

class SmokeContractError extends Error {}

function assert(condition, message) {
  if (!condition) {
    throw new SmokeContractError(message);
  }
}

function assertEqualArray(actual, expected, message) {
  assert(
    Array.isArray(actual) &&
      actual.length === expected.length &&
      actual.every((value, index) => value === expected[index]),
    message,
  );
}

function constraintKey(table, name) {
  return `${table}.${name}`;
}

function quoteIdentifier(identifier) {
  assert(
    /^[A-Za-z][A-Za-z0-9_]*$/.test(identifier),
    "Unsafe SQL identifier in frozen smoke manifest.",
  );
  return `"${identifier}"`;
}

function assertSafeTempRoot(tempRoot) {
  const resolvedRoot = resolve(tempRoot);
  const rootName = basename(resolvedRoot);
  assert(
    dirname(resolvedRoot) === resolve(tmpdir()) &&
      rootName.startsWith(TEMP_ROOT_PREFIX) &&
      rootName.length > TEMP_ROOT_PREFIX.length,
    "Refusing to remove an unexpected temporary path.",
  );
}

function scopedDatabaseUrl(databaseUrl, schema) {
  const parsed = new URL(databaseUrl);
  parsed.searchParams.set("schema", schema);
  return parsed.toString();
}

function assertSafeTarget(databaseUrl) {
  const parsed = new URL(databaseUrl);
  assert(
    parsed.protocol === "postgresql:" || parsed.protocol === "postgres:",
    "Staff task integrity fixtures require a PostgreSQL URL.",
  );
  const databaseName = decodeURIComponent(
    parsed.pathname.replace(/^\/+/, ""),
  ).toLowerCase();
  const schemaName =
    parsed.searchParams.get("schema")?.toLowerCase() ?? "public";
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const isLocal = new Set(["127.0.0.1", "localhost", "::1"]).has(hostname);
  const isSafeDatabase = /(?:^|[_-])(ci|test)(?:$|[_-])/.test(databaseName);

  assert(
    isLocal && isSafeDatabase && schemaName === "public",
    "Refusing to run staff task integrity fixtures outside a local CI/test target.",
  );

  return { databaseName };
}

function prismaClient(databaseUrl) {
  return new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
    transactionOptions: {
      maxWait: 5_000,
      timeout: 30_000,
    },
  });
}

function runMigrateDeploy(schemaPath, databaseUrl) {
  const require = createRequire(import.meta.url);
  const prismaCliPath = require.resolve("prisma/build/index.js");
  const result = spawnSync(
    process.execPath,
    [prismaCliPath, "migrate", "deploy", "--schema", schemaPath],
    {
      cwd: dirname(schemaPath),
      encoding: "utf8",
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        PGOPTIONS: "-c lock_timeout=5000 -c statement_timeout=120000",
        NO_COLOR: "1",
        PRISMA_HIDE_UPDATE_MESSAGE: "true",
      },
      maxBuffer: 4 * 1024 * 1024,
      timeout: MIGRATION_TIMEOUT_MS,
      windowsHide: true,
    },
  );

  assert(
    !result.error && result.status === 0,
    "Prisma migration rehearsal failed.",
  );
}

function runPrismaDiff(schemaPath, databaseUrl) {
  const require = createRequire(import.meta.url);
  const prismaCliPath = require.resolve("prisma/build/index.js");
  const result = spawnSync(
    process.execPath,
    [
      prismaCliPath,
      "migrate",
      "diff",
      "--from-schema-datasource",
      schemaPath,
      "--to-schema-datamodel",
      schemaPath,
      "--script",
    ],
    {
      cwd: dirname(schemaPath),
      encoding: "utf8",
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        NO_COLOR: "1",
        PRISMA_HIDE_UPDATE_MESSAGE: "true",
      },
      maxBuffer: 4 * 1024 * 1024,
      timeout: MIGRATION_TIMEOUT_MS,
      windowsHide: true,
    },
  );

  assert(
    !result.error && result.status === 0,
    "Prisma drift rehearsal failed.",
  );
  return result.stdout;
}

function assertPrismaDriftContract(migrationSql) {
  const dropNames = [
    ...new Set(
      [
        ...migrationSql.matchAll(
          /DROP\s+CONSTRAINT(?:\s+IF\s+EXISTS)?\s+"([^"]+)"/giu,
        ),
      ].map((match) => match[1]),
    ),
  ].sort();
  const addNames = [
    ...migrationSql.matchAll(/ADD\s+CONSTRAINT\s+"([^"]+)"/giu),
  ].map((match) => match[1]);
  const dbNativeAdds = addNames.filter((name) =>
    DB_NATIVE_CONSTRAINT_NAMES.includes(name),
  );

  assertEqualArray(
    dropNames,
    EXPECTED_PRISMA_DRIFT_DROPS,
    `Prisma destructive FK drift changed unexpectedly: expected ${EXPECTED_PRISMA_DRIFT_DROPS.join(",")}; actual ${dropNames.join(",")}.`,
  );
  assert(
    dbNativeAdds.length === 0,
    `Prisma DB-native FK add drift changed unexpectedly: ${dbNativeAdds.join(",")}.`,
  );
}

function isKnownRequestError(error, code) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
  );
}

function expectedConstraintNames(constraintNameOrNames) {
  return Array.isArray(constraintNameOrNames)
    ? constraintNameOrNames
    : [constraintNameOrNames];
}

async function expectDmlConstraintFailure(
  label,
  constraintNameOrNames,
  operation,
) {
  let caught;

  try {
    await operation();
  } catch (error) {
    caught = error;
  }

  assert(caught, `${label}: PostgreSQL accepted an invalid operation.`);
  const expectedNames = expectedConstraintNames(constraintNameOrNames);
  assert(
    isKnownRequestError(caught, "P2003") &&
      typeof caught.meta?.constraint === "string" &&
      expectedNames.includes(caught.meta.constraint),
    `${label}: PostgreSQL rejected the operation with an unexpected constraint.`,
  );
}

async function expectValidationConstraintFailure(
  label,
  constraintName,
  operation,
) {
  let caught;

  try {
    await operation();
  } catch (error) {
    caught = error;
  }

  assert(caught, `${label}: PostgreSQL accepted invalid legacy rows.`);
  assert(
    isKnownRequestError(caught, "P2010") &&
      caught.meta?.code === "23503" &&
      typeof caught.meta?.message === "string" &&
      caught.meta.message.includes(
        `foreign key constraint "${constraintName}"`,
      ),
    `${label}: PostgreSQL rejected validation with an unexpected error.`,
  );
}

async function readMigrationPlan() {
  const sourcePrismaDir = fileURLToPath(new URL("../prisma/", import.meta.url));
  const migrationDirectories = (
    await readdir(join(sourcePrismaDir, "migrations"), {
      withFileTypes: true,
    })
  )
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const unexpectedDirectories = migrationDirectories.filter(
    (migrationName) => !MIGRATION_PATTERN.test(migrationName),
  );
  assert(
    unexpectedDirectories.length === 0,
    `Unexpected migration directory names: ${unexpectedDirectories.join(",")}.`,
  );
  const migrationEntries = migrationDirectories;

  const baselineIndex = migrationEntries.indexOf(BASELINE_LAST_MIGRATION);
  assert(
    baselineIndex >= 0,
    "The staged integrity baseline migration is missing.",
  );
  const baselineMigrations = migrationEntries.slice(0, baselineIndex + 1);
  assert(
    baselineMigrations.length === EXPECTED_BASELINE_MIGRATION_COUNT,
    `The fixture baseline must remain migration ${EXPECTED_BASELINE_MIGRATION_COUNT}.`,
  );

  const expandStartIndex = baselineIndex + 1;
  const expandMigrations = migrationEntries.slice(
    expandStartIndex,
    expandStartIndex + EXPAND_MIGRATIONS.length,
  );
  assertEqualArray(
    expandMigrations,
    EXPAND_MIGRATIONS,
    "The six staff task integrity EXPAND migrations must remain contiguous and ordered immediately after the frozen fixture baseline.",
  );
  const finalIndex = expandStartIndex + EXPAND_MIGRATIONS.length - 1;
  assert(
    migrationEntries[finalIndex] === FINAL_MIGRATION,
    "The staff task integrity FK migration must remain the final staged EXPAND migration.",
  );

  return {
    sourcePrismaDir,
    baselineMigrations,
    baselineCount: baselineMigrations.length,
    expandMigrations,
    expandCount: expandMigrations.length,
    stagedCount: finalIndex + 1,
    futureMigrations: migrationEntries.slice(finalIndex + 1),
  };
}

function assertNoNativeContractRemoval(migrationName, migrationSql) {
  for (const constraintName of DB_NATIVE_CONSTRAINT_NAMES) {
    const escapedName = constraintName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert(
      !new RegExp(
        `DROP\\s+CONSTRAINT(?:\\s+IF\\s+EXISTS)?\\s+"${escapedName}"`,
        "iu",
      ).test(migrationSql),
      `${migrationName}: refuses to drop DB-native constraint ${constraintName}.`,
    );
    assert(
      !new RegExp(`RENAME\\s+CONSTRAINT\\s+"${escapedName}"`, "iu").test(
        migrationSql,
      ),
      `${migrationName}: refuses to rename DB-native constraint ${constraintName}.`,
    );
    assert(
      !new RegExp(`ALTER\\s+CONSTRAINT\\s+"${escapedName}"`, "iu").test(
        migrationSql,
      ),
      `${migrationName}: refuses to alter DB-native constraint ${constraintName}.`,
    );
  }

  const statements = migrationSql.split(";");
  for (const tableName of DB_NATIVE_TABLE_NAMES) {
    const quotedTable = `"${tableName}"`;
    for (const statement of statements) {
      const referencesTable = statement.includes(quotedTable);
      assert(
        !(
          referencesTable &&
          (/\bDROP\s+TABLE\b/iu.test(statement) ||
            (/\bALTER\s+TABLE\b/iu.test(statement) &&
              (/\bDROP\s+COLUMN\b/iu.test(statement) ||
                /\bRENAME\s+TO\b/iu.test(statement))))
        ),
        `${migrationName}: refuses destructive DDL for DB-native table ${tableName}.`,
      );
      assert(
        !(referencesTable && /\bDISABLE\s+TRIGGER\b/iu.test(statement)),
        `${migrationName}: refuses trigger disabling for DB-native table ${tableName}.`,
      );
    }
  }

  for (const required of DB_NATIVE_REQUIRED_COLUMNS) {
    const quotedTable = `"${required.table}"`;
    for (const columnName of required.columns) {
      const escapedColumn = columnName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      for (const statement of statements) {
        assert(
          !(
            statement.includes(quotedTable) &&
            new RegExp(
              `ALTER\\s+(?:COLUMN\\s+)?"${escapedColumn}"\\s+DROP\\s+NOT\\s+NULL`,
              "iu",
            ).test(statement)
          ),
          `${migrationName}: refuses DROP NOT NULL for ${required.table}.${columnName}.`,
        );
      }
    }
  }

  for (const parentIndex of PARENT_INDEXES) {
    for (const statement of statements) {
      assert(
        !(
          statement.includes(`"${parentIndex.name}"`) &&
          (/\bDROP\s+INDEX\b/iu.test(statement) ||
            /\bALTER\s+INDEX\b/iu.test(statement))
        ),
        `${migrationName}: refuses destructive DDL for parent index ${parentIndex.name}.`,
      );
    }
  }

  assert(
    !/\bDROP\s+SCHEMA\b/iu.test(migrationSql),
    `${migrationName}: refuses DROP SCHEMA after the DB-native contract.`,
  );
  assert(
    !/\bsession_replication_role\b/iu.test(migrationSql),
    `${migrationName}: refuses session_replication_role changes after the DB-native contract.`,
  );
}

async function assertNativeConstraintMigrationGuard(migrationPlan) {
  for (const migrationName of migrationPlan.futureMigrations) {
    const migrationSql = await readFile(
      join(
        migrationPlan.sourcePrismaDir,
        "migrations",
        migrationName,
        "migration.sql",
      ),
      "utf8",
    );
    assertNoNativeContractRemoval(migrationName, migrationSql);
  }
}

function executableMigrationSql(migrationSql) {
  return migrationSql.replace(/--.*$/gmu, "").trim();
}

function executableStatements(migrationSql) {
  return executableMigrationSql(migrationSql)
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

function assertConcurrentParentIndexArtifact(
  migrationName,
  migrationSql,
  expectedIndex,
) {
  const statements = executableStatements(migrationSql);
  assert(
    statements.length === 1,
    `${migrationName}: concurrent parent-index migration must contain exactly one executable statement.`,
  );
  const escapedIndex = expectedIndex.name.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );
  const escapedTable = expectedIndex.table.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );
  assert(
    new RegExp(
      `^CREATE\\s+UNIQUE\\s+INDEX\\s+CONCURRENTLY\\s+"${escapedIndex}"\\s+ON\\s+"${escapedTable}"\\s*\\(\\s*"tenantId"\\s*,\\s*"id"\\s*\\)$`,
      "iu",
    ).test(statements[0]),
    `${migrationName}: parent index must retain exact UNIQUE CONCURRENTLY table/column contract.`,
  );
}

function assertFinalExpandArtifact(migrationName, migrationSql) {
  const executableSql = executableMigrationSql(migrationSql);
  const statements = executableStatements(migrationSql);
  assert(
    statements[0]?.toUpperCase() === "BEGIN" &&
      statements.at(-1)?.toUpperCase() === "COMMIT",
    `${migrationName}: final EXPAND must remain one explicit transaction.`,
  );
  assert(
    (executableSql.match(/\bBEGIN\b/giu) ?? []).length === 1 &&
      (executableSql.match(/\bCOMMIT\b/giu) ?? []).length === 1,
    `${migrationName}: final EXPAND transaction boundary changed.`,
  );
  assert(
    /\bSET\s+LOCAL\s+lock_timeout\s*=\s*'5s'/iu.test(executableSql) &&
      /\bSET\s+LOCAL\s+statement_timeout\s*=\s*'2min'/iu.test(executableSql),
    `${migrationName}: bounded lock/statement timeouts changed.`,
  );

  const normalizedSql = executableSql.replace(/\s+/gu, " ");
  assert(
    normalizedSql.includes(
      'LOCK TABLE "Store", "User", "StaffTaskTemplate", "StaffTaskRecurringRule", "StaffTaskRecurringRuleRun", "StaffTask" IN SHARE ROW EXCLUSIVE MODE',
    ),
    `${migrationName}: deterministic table lock order changed.`,
  );

  const addedConstraintNames = [
    ...executableSql.matchAll(/ADD\s+CONSTRAINT\s+"([^"]+)"/giu),
  ]
    .map((match) => match[1])
    .sort();
  const droppedConstraintNames = [
    ...executableSql.matchAll(/DROP\s+CONSTRAINT\s+"([^"]+)"/giu),
  ]
    .map((match) => match[1])
    .sort();
  assertEqualArray(
    addedConstraintNames,
    [...DB_NATIVE_CONSTRAINT_NAMES].sort(),
    `${migrationName}: exact 28-constraint ADD contract changed.`,
  );
  assertEqualArray(
    droppedConstraintNames,
    EXPECTED_COMPATIBILITY_CONSTRAINT_NAMES,
    `${migrationName}: exact 14-constraint compatibility swap changed.`,
  );
  assert(
    (executableSql.match(/\bNOT\s+VALID\b/giu) ?? []).length ===
      DB_NATIVE_CONSTRAINT_NAMES.length,
    `${migrationName}: every DB-native FK must remain NOT VALID in EXPAND.`,
  );
}

async function assertExpandMigrationArtifactContract(migrationPlan) {
  assert(
    PARENT_INDEXES.length === EXPAND_MIGRATIONS.length - 1,
    "Frozen parent-index migration manifest changed unexpectedly.",
  );
  for (const [
    index,
    migrationName,
  ] of migrationPlan.expandMigrations.entries()) {
    const migrationSql = await readFile(
      join(
        migrationPlan.sourcePrismaDir,
        "migrations",
        migrationName,
        "migration.sql",
      ),
      "utf8",
    );
    if (index < PARENT_INDEXES.length) {
      assertConcurrentParentIndexArtifact(
        migrationName,
        migrationSql,
        PARENT_INDEXES[index],
      );
    } else {
      assertFinalExpandArtifact(migrationName, migrationSql);
    }
  }
}

async function copyMigrationArtifact(tempRoot, migrationPlan, stage) {
  const targetPrismaDir = join(tempRoot, "prisma");
  const targetMigrationsDir = join(targetPrismaDir, "migrations");

  assert(
    stage === "baseline" || stage === "expand",
    "Unknown staged migration phase.",
  );
  const selectedMigrations =
    stage === "baseline"
      ? migrationPlan.baselineMigrations
      : migrationPlan.expandMigrations;

  await mkdir(targetMigrationsDir, { recursive: true });
  await copyFile(
    join(migrationPlan.sourcePrismaDir, "schema.prisma"),
    join(targetPrismaDir, "schema.prisma"),
  );
  await copyFile(
    join(migrationPlan.sourcePrismaDir, "migrations", "migration_lock.toml"),
    join(targetMigrationsDir, "migration_lock.toml"),
  );

  for (const migrationName of selectedMigrations) {
    const targetMigrationDir = join(targetMigrationsDir, migrationName);
    await cp(
      join(migrationPlan.sourcePrismaDir, "migrations", migrationName),
      targetMigrationDir,
      { recursive: true },
    );
  }

  return join(targetPrismaDir, "schema.prisma");
}

async function migrationCount(prisma) {
  const [summary] = await prisma.$queryRaw`
    SELECT
      COUNT(*) FILTER (
        WHERE finished_at IS NOT NULL
          AND rolled_back_at IS NULL
      )::int AS applied_count,
      COUNT(*) FILTER (
        WHERE finished_at IS NULL
          AND rolled_back_at IS NULL
      )::int AS failed_count
    FROM "_prisma_migrations"
  `;

  assert(summary, "Migration rehearsal did not return state.");
  assert(summary.failed_count === 0, "Migration rehearsal left a failed row.");
  return summary.applied_count;
}

async function assertScopedConnection(
  prisma,
  expectedDatabase,
  expectedSchema,
) {
  const [current] = await prisma.$queryRaw`
    SELECT
      current_database() AS database_name,
      current_schema() AS schema_name,
      current_user AS user_name
  `;

  assert(
    current?.database_name?.toLowerCase() === expectedDatabase &&
      current?.schema_name === expectedSchema,
    "PostgreSQL connection is not anchored to the expected database and schema.",
  );

  return current;
}

async function createTenant(prisma, fixtureId, suffix) {
  return prisma.tenant.create({
    data: {
      name: `Integrity smoke ${suffix} ${fixtureId}`,
      slug: `integrity-smoke-${suffix}-${fixtureId}`,
    },
  });
}

async function createStore(prisma, tenantId, fixtureId, suffix) {
  return prisma.store.create({
    data: {
      tenantId,
      name: `Integrity store ${suffix} ${fixtureId}`,
      isActive: true,
    },
  });
}

async function createUser(prisma, tenantId, fixtureId, suffix) {
  return prisma.user.create({
    data: {
      tenantId,
      email: `integrity-${suffix}-${fixtureId}@invalid.example`,
      passwordHash: "not-a-real-password-hash",
      accessScope: "NETWORK",
    },
  });
}

async function createTemplate(prisma, tenantId, fixtureId, suffix, data = {}) {
  return prisma.staffTaskTemplate.create({
    data: {
      tenantId,
      title: `Integrity template ${suffix} ${fixtureId}`,
      status: "DRAFT",
      ...data,
    },
  });
}

async function createRule(prisma, tenantId, fixtureId, suffix, data = {}) {
  return prisma.staffTaskRecurringRule.create({
    data: {
      tenantId,
      title: `Integrity rule ${suffix} ${fixtureId}`,
      status: "PAUSED",
      ...data,
    },
  });
}

async function createTask(prisma, tenantId, fixtureId, suffix, data = {}) {
  return prisma.staffTask.create({
    data: {
      tenantId,
      title: `Integrity task ${suffix} ${fixtureId}`,
      status: "OPEN",
      ...data,
    },
  });
}

async function createRun(
  prisma,
  tenantId,
  ruleId,
  fixtureId,
  suffix,
  scheduledFor,
  data = {},
) {
  return prisma.staffTaskRecurringRuleRun.create({
    data: {
      tenantId,
      ruleId,
      scheduledFor,
      status: "COMPLETED",
      message: `Integrity run ${suffix} ${fixtureId}`,
      ...data,
    },
  });
}

async function createLegacyFixtures(prisma, fixtureId) {
  const tenantA = await createTenant(prisma, fixtureId, "a");
  const tenantB = await createTenant(prisma, fixtureId, "b");
  const storeA = await createStore(prisma, tenantA.id, fixtureId, "core-a");
  const storeB = await createStore(prisma, tenantB.id, fixtureId, "core-b");
  const legacyTemplateStore = await createStore(
    prisma,
    tenantB.id,
    fixtureId,
    "legacy-template-target",
  );
  const legacyRuleStore = await createStore(
    prisma,
    tenantB.id,
    fixtureId,
    "legacy-rule-target",
  );
  const legacyTaskStore = await createStore(
    prisma,
    tenantB.id,
    fixtureId,
    "legacy-task-target",
  );
  const userA = await createUser(prisma, tenantA.id, fixtureId, "core-a");
  const userB = await createUser(prisma, tenantB.id, fixtureId, "core-b");

  const templateA = await createTemplate(
    prisma,
    tenantA.id,
    fixtureId,
    "core-a",
    { storeId: storeA.id, createdByUserId: userA.id },
  );
  const templateB = await createTemplate(
    prisma,
    tenantB.id,
    fixtureId,
    "core-b",
    { storeId: storeB.id, createdByUserId: userB.id },
  );
  const ruleA = await createRule(prisma, tenantA.id, fixtureId, "core-a", {
    templateId: templateA.id,
    storeId: storeA.id,
    createdByUserId: userA.id,
    assignedToUserId: userA.id,
  });
  const ruleB = await createRule(prisma, tenantB.id, fixtureId, "core-b", {
    templateId: templateB.id,
    storeId: storeB.id,
    createdByUserId: userB.id,
    assignedToUserId: userB.id,
  });
  const taskA = await createTask(prisma, tenantA.id, fixtureId, "core-a", {
    storeId: storeA.id,
    sourceTemplateId: templateA.id,
    sourceRecurringRuleId: ruleA.id,
    createdByUserId: userA.id,
    assignedToUserId: userA.id,
  });
  const taskB = await createTask(prisma, tenantB.id, fixtureId, "core-b", {
    storeId: storeB.id,
    sourceTemplateId: templateB.id,
    sourceRecurringRuleId: ruleB.id,
    createdByUserId: userB.id,
    assignedToUserId: userB.id,
  });
  await prisma.staffTaskRecurringRule.update({
    where: { id: ruleA.id },
    data: { lastCreatedTaskId: taskA.id },
  });
  await prisma.staffTaskRecurringRule.update({
    where: { id: ruleB.id },
    data: { lastCreatedTaskId: taskB.id },
  });
  const runA = await createRun(
    prisma,
    tenantA.id,
    ruleA.id,
    fixtureId,
    "core-a",
    new Date("2035-01-01T00:00:00.000Z"),
    { createdTaskId: taskA.id },
  );

  const legacyIds = {
    templates: [],
    rules: [],
    runs: [],
    tasks: [],
  };

  legacyIds.templates.push(
    (
      await createTemplate(
        prisma,
        tenantA.id,
        fixtureId,
        "legacy-template-store",
        { storeId: legacyTemplateStore.id, createdByUserId: userA.id },
      )
    ).id,
    (
      await createTemplate(
        prisma,
        tenantA.id,
        fixtureId,
        "legacy-template-creator",
        { storeId: storeA.id, createdByUserId: userB.id },
      )
    ).id,
  );

  legacyIds.rules.push(
    (
      await createRule(prisma, tenantA.id, fixtureId, "legacy-rule-template", {
        templateId: templateB.id,
      })
    ).id,
    (
      await createRule(prisma, tenantA.id, fixtureId, "legacy-rule-store", {
        storeId: legacyRuleStore.id,
      })
    ).id,
    (
      await createRule(prisma, tenantA.id, fixtureId, "legacy-rule-creator", {
        createdByUserId: userB.id,
      })
    ).id,
    (
      await createRule(prisma, tenantA.id, fixtureId, "legacy-rule-assignee", {
        assignedToUserId: userB.id,
      })
    ).id,
    (
      await createRule(prisma, tenantA.id, fixtureId, "legacy-rule-last-task", {
        lastCreatedTaskId: taskB.id,
      })
    ).id,
  );

  legacyIds.runs.push(
    (
      await createRun(
        prisma,
        tenantA.id,
        ruleB.id,
        fixtureId,
        "legacy-run-rule",
        new Date("2035-01-02T00:00:00.000Z"),
      )
    ).id,
    (
      await createRun(
        prisma,
        tenantA.id,
        ruleA.id,
        fixtureId,
        "legacy-run-task",
        new Date("2035-01-03T00:00:00.000Z"),
        { createdTaskId: taskB.id },
      )
    ).id,
  );

  legacyIds.tasks.push(
    (
      await createTask(prisma, tenantA.id, fixtureId, "legacy-task-store", {
        storeId: legacyTaskStore.id,
      })
    ).id,
    (
      await createTask(prisma, tenantA.id, fixtureId, "legacy-task-template", {
        sourceTemplateId: templateB.id,
      })
    ).id,
    (
      await createTask(prisma, tenantA.id, fixtureId, "legacy-task-rule", {
        sourceRecurringRuleId: ruleB.id,
      })
    ).id,
    (
      await createTask(prisma, tenantA.id, fixtureId, "legacy-task-creator", {
        createdByUserId: userB.id,
      })
    ).id,
    (
      await createTask(prisma, tenantA.id, fixtureId, "legacy-task-assignee", {
        assignedToUserId: userB.id,
      })
    ).id,
  );

  assert(
    Object.values(legacyIds).flat().length === CONSTRAINTS.length,
    "Legacy fixture cardinality does not match the frozen constraint manifest.",
  );

  return {
    tenantA,
    tenantB,
    storeA,
    storeB,
    legacyTemplateStore,
    legacyRuleStore,
    legacyTaskStore,
    userA,
    userB,
    templateA,
    templateB,
    ruleA,
    ruleB,
    taskA,
    taskB,
    runA,
    legacyIds,
  };
}

async function assertLegacyRowsRemain(prisma, legacyIds) {
  const updates = await Promise.all([
    prisma.staffTaskTemplate.updateMany({
      where: { id: { in: legacyIds.templates } },
      data: { description: "Legacy row remained mutable after EXPAND." },
    }),
    prisma.staffTaskRecurringRule.updateMany({
      where: { id: { in: legacyIds.rules } },
      data: { description: "Legacy row remained mutable after EXPAND." },
    }),
    prisma.staffTaskRecurringRuleRun.updateMany({
      where: { id: { in: legacyIds.runs } },
      data: { message: "Legacy row remained mutable after EXPAND." },
    }),
    prisma.staffTask.updateMany({
      where: { id: { in: legacyIds.tasks } },
      data: { description: "Legacy row remained mutable after EXPAND." },
    }),
  ]);
  assert(
    updates.reduce((total, update) => total + update.count, 0) ===
      CONSTRAINTS.length,
    "EXPAND blocked a benign non-key update to a legacy row.",
  );

  const [templates, rules, runs, tasks] = await Promise.all([
    prisma.staffTaskTemplate.count({
      where: { id: { in: legacyIds.templates } },
    }),
    prisma.staffTaskRecurringRule.count({
      where: { id: { in: legacyIds.rules } },
    }),
    prisma.staffTaskRecurringRuleRun.count({
      where: { id: { in: legacyIds.runs } },
    }),
    prisma.staffTask.count({
      where: { id: { in: legacyIds.tasks } },
    }),
  ]);

  assert(
    templates + rules + runs + tasks === CONSTRAINTS.length,
    "EXPAND migration changed legacy rows.",
  );
}

async function readForeignKeyContract(prisma) {
  return prisma.$queryRaw`
    SELECT
      constraint_row.conname AS name,
      child_table.relname AS child_table,
      child_namespace.nspname AS child_namespace,
      parent_table.relname AS parent_table,
      parent_namespace.nspname AS parent_namespace,
      referenced_index.relname AS referenced_index,
      referenced_index_namespace.nspname AS referenced_index_namespace,
      current_schema() AS current_namespace,
      constraint_row.convalidated,
      constraint_row.condeferrable,
      constraint_row.condeferred,
      constraint_row.confdeltype::text AS delete_action,
      constraint_row.confupdtype::text AS update_action,
      constraint_row.confmatchtype::text AS match_type,
      ARRAY(
        SELECT child_column.attname
        FROM unnest(constraint_row.conkey) WITH ORDINALITY AS key(attnum, ord)
        JOIN pg_attribute AS child_column
          ON child_column.attrelid = constraint_row.conrelid
         AND child_column.attnum = key.attnum
        ORDER BY key.ord
      ) AS local_columns,
      ARRAY(
        SELECT parent_column.attname
        FROM unnest(constraint_row.confkey) WITH ORDINALITY AS key(attnum, ord)
        JOIN pg_attribute AS parent_column
          ON parent_column.attrelid = constraint_row.confrelid
         AND parent_column.attnum = key.attnum
        ORDER BY key.ord
      ) AS parent_columns,
      ARRAY(
        SELECT delete_column.attname
        FROM unnest(
          COALESCE(
            constraint_row.confdelsetcols,
            ARRAY[]::smallint[]
          )
        ) WITH ORDINALITY AS key(attnum, ord)
        JOIN pg_attribute AS delete_column
          ON delete_column.attrelid = constraint_row.conrelid
         AND delete_column.attnum = key.attnum
        ORDER BY key.ord
      ) AS delete_set_columns
    FROM pg_constraint AS constraint_row
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
    WHERE constraint_row.connamespace = current_schema()::regnamespace
      AND constraint_row.contype = 'f'
  `;
}

async function assertConstraintContract(prisma) {
  const rows = await readForeignKeyContract(prisma);
  const byKey = new Map(
    rows.map((row) => [constraintKey(row.child_table, row.name), row]),
  );
  const parentIndexByTable = new Map(
    PARENT_INDEXES.map((index) => [index.table, index.name]),
  );

  for (const expected of CONSTRAINTS) {
    const actual = byKey.get(constraintKey(expected.table, expected.name));
    assert(actual, `Missing integrity constraint ${expected.name}.`);
    assert(
      actual.parent_table === expected.parentTable &&
        actual.child_namespace === actual.current_namespace &&
        actual.parent_namespace === actual.current_namespace,
      `${expected.name}: unexpected parent table or namespace.`,
    );
    assert(
      actual.convalidated === false,
      `${expected.name}: EXPAND constraint must remain NOT VALID.`,
    );
    assert(
      actual.delete_action === expected.deleteAction &&
        actual.update_action === "r" &&
        actual.match_type === "s" &&
        actual.condeferrable === false &&
        actual.condeferred === false &&
        typeof actual.referenced_index === "string",
      `${expected.name}: unexpected referential action.`,
    );
    assert(
      actual.referenced_index ===
        parentIndexByTable.get(expected.parentTable) &&
        actual.referenced_index_namespace === actual.current_namespace,
      `${expected.name}: unexpected referenced parent index.`,
    );
    assertEqualArray(
      actual.local_columns,
      expected.localColumns,
      `${expected.name}: unexpected local columns.`,
    );
    assertEqualArray(
      actual.parent_columns,
      expected.parentColumns,
      `${expected.name}: unexpected parent columns.`,
    );
    assertEqualArray(
      actual.delete_set_columns,
      expected.deleteSetColumns,
      `${expected.name}: unexpected SET NULL column list.`,
    );
  }

  for (const legacyConstraint of LEGACY_STORE_CONSTRAINTS) {
    const actual = byKey.get(
      constraintKey(legacyConstraint.table, legacyConstraint.name),
    );
    assert(
      actual &&
        actual.parent_table === "Store" &&
        actual.child_namespace === actual.current_namespace &&
        actual.parent_namespace === actual.current_namespace &&
        actual.referenced_index_namespace === actual.current_namespace &&
        actual.convalidated === false &&
        actual.delete_action === "r" &&
        actual.update_action === "r" &&
        actual.match_type === "s" &&
        actual.condeferrable === false &&
        actual.condeferred === false,
      `${legacyConstraint.name}: Store compatibility RESTRICT contract is missing.`,
    );
    assertEqualArray(
      actual.local_columns,
      ["storeId"],
      `${legacyConstraint.name}: unexpected compatibility local column.`,
    );
    assertEqualArray(
      actual.parent_columns,
      ["id"],
      `${legacyConstraint.name}: unexpected compatibility parent column.`,
    );
    assertEqualArray(
      actual.delete_set_columns,
      [],
      `${legacyConstraint.name}: compatibility FK must not SET NULL.`,
    );
  }

  for (const legacyConstraint of LEGACY_COMPATIBILITY_CONSTRAINTS) {
    const actual = byKey.get(
      constraintKey(legacyConstraint.table, legacyConstraint.name),
    );
    assert(
      actual &&
        actual.parent_table === legacyConstraint.parentTable &&
        actual.child_namespace === actual.current_namespace &&
        actual.parent_namespace === actual.current_namespace &&
        actual.referenced_index_namespace === actual.current_namespace &&
        actual.convalidated === false &&
        actual.delete_action === legacyConstraint.deleteAction &&
        actual.update_action === "r" &&
        actual.match_type === "s" &&
        actual.condeferrable === false &&
        actual.condeferred === false,
      `${legacyConstraint.name}: simple N-1 compatibility FK changed unexpectedly.`,
    );
    assertEqualArray(
      actual.local_columns,
      [legacyConstraint.localColumn],
      `${legacyConstraint.name}: unexpected legacy local column.`,
    );
    assertEqualArray(
      actual.parent_columns,
      ["id"],
      `${legacyConstraint.name}: unexpected legacy parent column.`,
    );
  }
}

async function readParentIndexRows(prisma) {
  return prisma.$queryRaw`
    SELECT
      index_table.relname AS name,
      parent_table.relname AS parent_table,
      index_row.indisunique,
      index_row.indisvalid,
      index_row.indisready,
      ARRAY(
        SELECT index_column.attname
        FROM unnest(index_row.indkey::smallint[])
          WITH ORDINALITY AS key(attnum, ord)
        JOIN pg_attribute AS index_column
          ON index_column.attrelid = index_row.indrelid
         AND index_column.attnum = key.attnum
        WHERE key.ord <= index_row.indnkeyatts
        ORDER BY key.ord
      ) AS columns
    FROM pg_index AS index_row
    JOIN pg_class AS index_table
      ON index_table.oid = index_row.indexrelid
    JOIN pg_class AS parent_table
      ON parent_table.oid = index_row.indrelid
    WHERE index_table.relnamespace = current_schema()::regnamespace
  `;
}

async function assertExpandPreconditions(prisma, legacyIds) {
  const parentRowCounts = await Promise.all([
    prisma.store.count(),
    prisma.user.count(),
    prisma.staffTaskTemplate.count(),
    prisma.staffTaskRecurringRule.count(),
    prisma.staffTask.count(),
  ]);
  assert(
    parentRowCounts.length === PARENT_INDEXES.length &&
      parentRowCounts.every((count) => count > 0),
    "Every concurrent parent index must be rehearsed against a populated legacy table.",
  );

  const legacyRowCount = Object.values(legacyIds).flat().length;
  assert(
    legacyRowCount === CONSTRAINTS.length,
    "Legacy rows must exist before the six EXPAND migrations are applied.",
  );

  const protectedIndexNames = new Set(
    PARENT_INDEXES.map((index) => index.name),
  );
  const existingProtectedIndexes = (await readParentIndexRows(prisma))
    .map((row) => row.name)
    .filter((name) => protectedIndexNames.has(name));
  assert(
    existingProtectedIndexes.length === 0,
    `Concurrent parent indexes already existed at the fixture baseline: ${existingProtectedIndexes.join(",")}.`,
  );

  return {
    populatedParentTables: parentRowCounts.length,
    legacyRows: legacyRowCount,
  };
}

async function assertParentIndexes(prisma) {
  const rows = await readParentIndexRows(prisma);
  const byName = new Map(rows.map((row) => [row.name, row]));

  for (const expected of PARENT_INDEXES) {
    const actual = byName.get(expected.name);
    assert(actual, `Missing parent index ${expected.name}.`);
    assert(
      actual.parent_table === expected.table &&
        actual.indisunique === true &&
        actual.indisvalid === true &&
        actual.indisready === true,
      `${expected.name}: parent index is not ready, valid, and unique.`,
    );
    assertEqualArray(
      actual.columns,
      expected.columns,
      `${expected.name}: unexpected index columns.`,
    );
  }
}

async function assertValidationBlocked(prisma) {
  for (const constraint of CONSTRAINTS) {
    const table = quoteIdentifier(constraint.table);
    const name = quoteIdentifier(constraint.name);
    await expectValidationConstraintFailure(
      `validate ${constraint.name}`,
      constraint.name,
      () =>
        prisma.$executeRawUnsafe(
          `ALTER TABLE ${table} VALIDATE CONSTRAINT ${name}`,
        ),
    );
  }

  const rows = await readForeignKeyContract(prisma);
  const byKey = new Map(
    rows.map((row) => [constraintKey(row.child_table, row.name), row]),
  );
  assert(
    CONSTRAINTS.every(
      (constraint) =>
        byKey.get(constraintKey(constraint.table, constraint.name))
          ?.convalidated === false,
    ),
    "A failed legacy validation changed constraint state.",
  );
}

async function assertFreshInvalidWritesRejected(prisma, fixtures) {
  const {
    storeB,
    userB,
    templateA,
    templateB,
    ruleA,
    ruleB,
    taskA,
    taskB,
    runA,
  } = fixtures;

  const checks = [
    [
      "template store",
      "StaffTaskTemplate_tenantId_storeId_fkey",
      () =>
        prisma.staffTaskTemplate.update({
          where: { id: templateA.id },
          data: { storeId: storeB.id },
        }),
    ],
    [
      "template creator",
      "StaffTaskTemplate_tenantId_createdByUserId_fkey",
      () =>
        prisma.staffTaskTemplate.update({
          where: { id: templateA.id },
          data: { createdByUserId: userB.id },
        }),
    ],
    [
      "rule template",
      "StaffTaskRecurringRule_tenantId_templateId_fkey",
      () =>
        prisma.staffTaskRecurringRule.update({
          where: { id: ruleA.id },
          data: { templateId: templateB.id },
        }),
    ],
    [
      "rule store",
      "StaffTaskRecurringRule_tenantId_storeId_fkey",
      () =>
        prisma.staffTaskRecurringRule.update({
          where: { id: ruleA.id },
          data: { storeId: storeB.id },
        }),
    ],
    [
      "rule creator",
      "StaffTaskRecurringRule_tenantId_createdByUserId_fkey",
      () =>
        prisma.staffTaskRecurringRule.update({
          where: { id: ruleA.id },
          data: { createdByUserId: userB.id },
        }),
    ],
    [
      "rule assignee",
      "StaffTaskRecurringRule_tenantId_assignedToUserId_fkey",
      () =>
        prisma.staffTaskRecurringRule.update({
          where: { id: ruleA.id },
          data: { assignedToUserId: userB.id },
        }),
    ],
    [
      "rule last task",
      "StaffTaskRecurringRule_tenantId_lastCreatedTaskId_fkey",
      () =>
        prisma.staffTaskRecurringRule.update({
          where: { id: ruleA.id },
          data: { lastCreatedTaskId: taskB.id },
        }),
    ],
    [
      "run rule",
      "StaffTaskRecurringRuleRun_tenantId_ruleId_fkey",
      () =>
        prisma.staffTaskRecurringRuleRun.update({
          where: { id: runA.id },
          data: { ruleId: ruleB.id },
        }),
    ],
    [
      "run task",
      "StaffTaskRecurringRuleRun_tenantId_createdTaskId_fkey",
      () =>
        prisma.staffTaskRecurringRuleRun.update({
          where: { id: runA.id },
          data: { createdTaskId: taskB.id },
        }),
    ],
    [
      "task store",
      "StaffTask_tenantId_storeId_fkey",
      () =>
        prisma.staffTask.update({
          where: { id: taskA.id },
          data: { storeId: storeB.id },
        }),
    ],
    [
      "task template",
      "StaffTask_tenantId_sourceTemplateId_fkey",
      () =>
        prisma.staffTask.update({
          where: { id: taskA.id },
          data: { sourceTemplateId: templateB.id },
        }),
    ],
    [
      "task rule",
      "StaffTask_tenantId_sourceRecurringRuleId_fkey",
      () =>
        prisma.staffTask.update({
          where: { id: taskA.id },
          data: { sourceRecurringRuleId: ruleB.id },
        }),
    ],
    [
      "task creator",
      "StaffTask_tenantId_createdByUserId_fkey",
      () =>
        prisma.staffTask.update({
          where: { id: taskA.id },
          data: { createdByUserId: userB.id },
        }),
    ],
    [
      "task assignee",
      "StaffTask_tenantId_assignedToUserId_fkey",
      () =>
        prisma.staffTask.update({
          where: { id: taskA.id },
          data: { assignedToUserId: userB.id },
        }),
    ],
  ];

  for (const [label, constraintName, operation] of checks) {
    await expectDmlConstraintFailure(label, constraintName, operation);
  }

  assert(
    checks.length === CONSTRAINTS.length,
    "Fresh-write coverage does not match the constraint manifest.",
  );
}

async function assertFreshValidGraph(prisma, fixtures, fixtureId) {
  const template = await createTemplate(
    prisma,
    fixtures.tenantA.id,
    fixtureId,
    "fresh-valid",
    {
      storeId: fixtures.storeA.id,
      createdByUserId: fixtures.userA.id,
    },
  );
  const rule = await createRule(
    prisma,
    fixtures.tenantA.id,
    fixtureId,
    "fresh-valid",
    {
      templateId: template.id,
      storeId: fixtures.storeA.id,
      createdByUserId: fixtures.userA.id,
      assignedToUserId: fixtures.userA.id,
    },
  );
  const task = await createTask(
    prisma,
    fixtures.tenantA.id,
    fixtureId,
    "fresh-valid",
    {
      storeId: fixtures.storeA.id,
      sourceTemplateId: template.id,
      sourceRecurringRuleId: rule.id,
      createdByUserId: fixtures.userA.id,
      assignedToUserId: fixtures.userA.id,
    },
  );
  await prisma.staffTaskRecurringRule.update({
    where: { id: rule.id },
    data: { lastCreatedTaskId: task.id },
  });
  const run = await createRun(
    prisma,
    fixtures.tenantA.id,
    rule.id,
    fixtureId,
    "fresh-valid",
    new Date("2035-02-01T00:00:00.000Z"),
    { createdTaskId: task.id },
  );

  assert(
    Boolean(template.id && rule.id && task.id && run.id),
    "Fresh same-tenant graph was not created.",
  );
}

async function assertStoreArchivePolicy(prisma, fixtures, fixtureId) {
  const taskStore = await createStore(
    prisma,
    fixtures.tenantA.id,
    fixtureId,
    "delete-task",
  );
  await createTask(prisma, fixtures.tenantA.id, fixtureId, "delete-task", {
    storeId: taskStore.id,
  });
  await expectDmlConstraintFailure(
    "task-bound Store delete",
    ["StaffTask_storeId_fkey", "StaffTask_tenantId_storeId_fkey"],
    () => prisma.store.delete({ where: { id: taskStore.id } }),
  );
  const archivedTaskStore = await prisma.store.update({
    where: { id: taskStore.id },
    data: { isActive: false },
  });

  const templateStore = await createStore(
    prisma,
    fixtures.tenantA.id,
    fixtureId,
    "delete-template",
  );
  await createTemplate(
    prisma,
    fixtures.tenantA.id,
    fixtureId,
    "delete-template",
    { storeId: templateStore.id },
  );
  await expectDmlConstraintFailure(
    "template-bound Store delete",
    [
      "StaffTaskTemplate_storeId_fkey",
      "StaffTaskTemplate_tenantId_storeId_fkey",
    ],
    () => prisma.store.delete({ where: { id: templateStore.id } }),
  );
  const archivedTemplateStore = await prisma.store.update({
    where: { id: templateStore.id },
    data: { isActive: false },
  });

  const ruleStore = await createStore(
    prisma,
    fixtures.tenantA.id,
    fixtureId,
    "delete-rule",
  );
  await createRule(prisma, fixtures.tenantA.id, fixtureId, "delete-rule", {
    storeId: ruleStore.id,
  });
  await expectDmlConstraintFailure(
    "rule-bound Store delete",
    [
      "StaffTaskRecurringRule_storeId_fkey",
      "StaffTaskRecurringRule_tenantId_storeId_fkey",
    ],
    () => prisma.store.delete({ where: { id: ruleStore.id } }),
  );
  const archivedRuleStore = await prisma.store.update({
    where: { id: ruleStore.id },
    data: { isActive: false },
  });

  assert(
    [archivedTaskStore, archivedTemplateStore, archivedRuleStore].every(
      (store) => store.isActive === false,
    ),
    "Store archive path did not remain available.",
  );
}

async function assertLegacyStoreDeleteProtection(prisma, fixtures) {
  const checks = [
    {
      label: "legacy template Store delete",
      constraint: "StaffTaskTemplate_storeId_fkey",
      store: fixtures.legacyTemplateStore,
    },
    {
      label: "legacy recurring-rule Store delete",
      constraint: "StaffTaskRecurringRule_storeId_fkey",
      store: fixtures.legacyRuleStore,
    },
    {
      label: "legacy task Store delete",
      constraint: "StaffTask_storeId_fkey",
      store: fixtures.legacyTaskStore,
    },
  ];

  for (const check of checks) {
    await expectDmlConstraintFailure(check.label, check.constraint, () =>
      prisma.store.delete({ where: { id: check.store.id } }),
    );
    const archived = await prisma.store.update({
      where: { id: check.store.id },
      data: { isActive: false },
    });
    assert(
      archived.isActive === false,
      `${check.label}: archive-first path failed.`,
    );
  }
}

async function assertParentIdentifierUpdatesRejected(
  prisma,
  fixtures,
  fixtureId,
) {
  const store = await createStore(
    prisma,
    fixtures.tenantA.id,
    fixtureId,
    "immutable-store",
  );
  await createTask(prisma, fixtures.tenantA.id, fixtureId, "immutable-store", {
    storeId: store.id,
  });

  const user = await createUser(
    prisma,
    fixtures.tenantA.id,
    fixtureId,
    "immutable-user",
  );
  await createTask(prisma, fixtures.tenantA.id, fixtureId, "immutable-user", {
    createdByUserId: user.id,
  });

  const template = await createTemplate(
    prisma,
    fixtures.tenantA.id,
    fixtureId,
    "immutable-template",
  );
  await createTask(
    prisma,
    fixtures.tenantA.id,
    fixtureId,
    "immutable-template",
    { sourceTemplateId: template.id },
  );

  const rule = await createRule(
    prisma,
    fixtures.tenantA.id,
    fixtureId,
    "immutable-rule",
  );
  await createTask(prisma, fixtures.tenantA.id, fixtureId, "immutable-rule", {
    sourceRecurringRuleId: rule.id,
  });

  const task = await createTask(
    prisma,
    fixtures.tenantA.id,
    fixtureId,
    "immutable-task",
  );
  await createRule(prisma, fixtures.tenantA.id, fixtureId, "immutable-task", {
    lastCreatedTaskId: task.id,
  });

  const identifierChecks = [
    {
      label: "Store identifier update",
      constraints: [
        "StaffTask_storeId_fkey",
        "StaffTask_tenantId_storeId_fkey",
      ],
      operation: () =>
        prisma.store.update({
          where: { id: store.id },
          data: { id: randomUUID() },
        }),
    },
    {
      label: "User identifier update",
      constraints: [
        "StaffTask_createdByUserId_fkey",
        "StaffTask_tenantId_createdByUserId_fkey",
      ],
      operation: () =>
        prisma.user.update({
          where: { id: user.id },
          data: { id: randomUUID() },
        }),
    },
    {
      label: "template identifier update",
      constraints: [
        "StaffTask_sourceTemplateId_fkey",
        "StaffTask_tenantId_sourceTemplateId_fkey",
      ],
      operation: () =>
        prisma.staffTaskTemplate.update({
          where: { id: template.id },
          data: { id: randomUUID() },
        }),
    },
    {
      label: "recurring-rule identifier update",
      constraints: [
        "StaffTask_sourceRecurringRuleId_fkey",
        "StaffTask_tenantId_sourceRecurringRuleId_fkey",
      ],
      operation: () =>
        prisma.staffTaskRecurringRule.update({
          where: { id: rule.id },
          data: { id: randomUUID() },
        }),
    },
    {
      label: "task identifier update",
      constraints: [
        "StaffTaskRecurringRule_lastCreatedTaskId_fkey",
        "StaffTaskRecurringRule_tenantId_lastCreatedTaskId_fkey",
      ],
      operation: () =>
        prisma.staffTask.update({
          where: { id: task.id },
          data: { id: randomUUID() },
        }),
    },
  ];

  for (const check of identifierChecks) {
    await expectDmlConstraintFailure(
      check.label,
      check.constraints,
      check.operation,
    );
  }

  const tenantChecks = [
    {
      label: "Store tenant update",
      constraint: "StaffTask_tenantId_storeId_fkey",
      operation: () =>
        prisma.store.update({
          where: { id: store.id },
          data: { tenantId: fixtures.tenantB.id },
        }),
    },
    {
      label: "User tenant update",
      constraint: "StaffTask_tenantId_createdByUserId_fkey",
      operation: () =>
        prisma.user.update({
          where: { id: user.id },
          data: { tenantId: fixtures.tenantB.id },
        }),
    },
    {
      label: "template tenant update",
      constraint: "StaffTask_tenantId_sourceTemplateId_fkey",
      operation: () =>
        prisma.staffTaskTemplate.update({
          where: { id: template.id },
          data: { tenantId: fixtures.tenantB.id },
        }),
    },
    {
      label: "recurring-rule tenant update",
      constraint: "StaffTask_tenantId_sourceRecurringRuleId_fkey",
      operation: () =>
        prisma.staffTaskRecurringRule.update({
          where: { id: rule.id },
          data: { tenantId: fixtures.tenantB.id },
        }),
    },
    {
      label: "task tenant update",
      constraint: "StaffTaskRecurringRule_tenantId_lastCreatedTaskId_fkey",
      operation: () =>
        prisma.staffTask.update({
          where: { id: task.id },
          data: { tenantId: fixtures.tenantB.id },
        }),
    },
  ];

  for (const check of tenantChecks) {
    await expectDmlConstraintFailure(
      check.label,
      check.constraint,
      check.operation,
    );
  }

  return {
    identifierUpdates: identifierChecks.length,
    tenantUpdates: tenantChecks.length,
  };
}

async function assertDeleteActions(prisma, fixtures, fixtureId) {
  const actor = await createUser(
    prisma,
    fixtures.tenantA.id,
    fixtureId,
    "delete-actor",
  );
  const actorTemplate = await createTemplate(
    prisma,
    fixtures.tenantA.id,
    fixtureId,
    "delete-actor",
    { createdByUserId: actor.id },
  );
  const actorRule = await createRule(
    prisma,
    fixtures.tenantA.id,
    fixtureId,
    "delete-actor",
    {
      createdByUserId: actor.id,
      assignedToUserId: actor.id,
    },
  );
  const actorTask = await createTask(
    prisma,
    fixtures.tenantA.id,
    fixtureId,
    "delete-actor",
    {
      createdByUserId: actor.id,
      assignedToUserId: actor.id,
    },
  );
  await prisma.user.delete({ where: { id: actor.id } });
  const [templateAfterActor, ruleAfterActor, taskAfterActor] =
    await Promise.all([
      prisma.staffTaskTemplate.findUnique({
        where: { id: actorTemplate.id },
      }),
      prisma.staffTaskRecurringRule.findUnique({
        where: { id: actorRule.id },
      }),
      prisma.staffTask.findUnique({ where: { id: actorTask.id } }),
    ]);
  assert(
    templateAfterActor?.tenantId === fixtures.tenantA.id &&
      templateAfterActor.createdByUserId === null &&
      ruleAfterActor?.tenantId === fixtures.tenantA.id &&
      ruleAfterActor.createdByUserId === null &&
      ruleAfterActor.assignedToUserId === null &&
      taskAfterActor?.tenantId === fixtures.tenantA.id &&
      taskAfterActor.createdByUserId === null &&
      taskAfterActor.assignedToUserId === null,
    "User SET NULL action changed tenant ownership or missed a reference.",
  );

  const deletedTemplate = await createTemplate(
    prisma,
    fixtures.tenantA.id,
    fixtureId,
    "delete-template-parent",
  );
  const templateRule = await createRule(
    prisma,
    fixtures.tenantA.id,
    fixtureId,
    "delete-template-parent",
    { templateId: deletedTemplate.id },
  );
  const templateTask = await createTask(
    prisma,
    fixtures.tenantA.id,
    fixtureId,
    "delete-template-parent",
    { sourceTemplateId: deletedTemplate.id },
  );
  await prisma.staffTaskTemplate.delete({
    where: { id: deletedTemplate.id },
  });
  const [ruleAfterTemplate, taskAfterTemplate] = await Promise.all([
    prisma.staffTaskRecurringRule.findUnique({
      where: { id: templateRule.id },
    }),
    prisma.staffTask.findUnique({ where: { id: templateTask.id } }),
  ]);
  assert(
    ruleAfterTemplate?.tenantId === fixtures.tenantA.id &&
      ruleAfterTemplate.templateId === null &&
      taskAfterTemplate?.tenantId === fixtures.tenantA.id &&
      taskAfterTemplate.sourceTemplateId === null,
    "Template SET NULL action changed tenant ownership.",
  );

  const deletedRule = await createRule(
    prisma,
    fixtures.tenantA.id,
    fixtureId,
    "delete-rule-parent",
  );
  const ruleTask = await createTask(
    prisma,
    fixtures.tenantA.id,
    fixtureId,
    "delete-rule-parent",
    { sourceRecurringRuleId: deletedRule.id },
  );
  const ruleRun = await createRun(
    prisma,
    fixtures.tenantA.id,
    deletedRule.id,
    fixtureId,
    "delete-rule-parent",
    new Date("2035-03-01T00:00:00.000Z"),
  );
  await prisma.staffTaskRecurringRule.delete({
    where: { id: deletedRule.id },
  });
  const [taskAfterRule, runAfterRule] = await Promise.all([
    prisma.staffTask.findUnique({ where: { id: ruleTask.id } }),
    prisma.staffTaskRecurringRuleRun.findUnique({
      where: { id: ruleRun.id },
    }),
  ]);
  assert(
    taskAfterRule?.tenantId === fixtures.tenantA.id &&
      taskAfterRule.sourceRecurringRuleId === null &&
      runAfterRule === null,
    "Rule SET NULL/CASCADE actions did not preserve the contract.",
  );

  const deletedTask = await createTask(
    prisma,
    fixtures.tenantA.id,
    fixtureId,
    "delete-task-parent",
  );
  const taskRule = await createRule(
    prisma,
    fixtures.tenantA.id,
    fixtureId,
    "delete-task-parent",
    { lastCreatedTaskId: deletedTask.id },
  );
  const taskRun = await createRun(
    prisma,
    fixtures.tenantA.id,
    fixtures.ruleA.id,
    fixtureId,
    "delete-task-parent",
    new Date("2035-03-02T00:00:00.000Z"),
    { createdTaskId: deletedTask.id },
  );
  await prisma.staffTask.delete({ where: { id: deletedTask.id } });
  const [ruleAfterTask, runAfterTask] = await Promise.all([
    prisma.staffTaskRecurringRule.findUnique({
      where: { id: taskRule.id },
    }),
    prisma.staffTaskRecurringRuleRun.findUnique({
      where: { id: taskRun.id },
    }),
  ]);
  assert(
    ruleAfterTask?.tenantId === fixtures.tenantA.id &&
      ruleAfterTask.lastCreatedTaskId === null &&
      runAfterTask?.tenantId === fixtures.tenantA.id &&
      runAfterTask.createdTaskId === null,
    "Task SET NULL action changed tenant ownership.",
  );
}

function errorSummary(error) {
  return error instanceof Error ? error.message : String(error);
}

function expectOfflineContractFailure(label, operation) {
  let caught;

  try {
    operation();
  } catch (error) {
    caught = error;
  }

  assert(
    caught instanceof SmokeContractError,
    `${label}: offline safety contract did not reject the operation.`,
  );
}

async function cleanupSmokeResources({
  fixtureClient,
  schemaCreated,
  schemaName,
  adminUrl,
  expectedDatabase,
  tempRoot,
}) {
  const cleanupErrors = [];

  if (fixtureClient) {
    try {
      await fixtureClient.$disconnect();
    } catch (error) {
      cleanupErrors.push(error);
    }
  }

  if (schemaCreated) {
    let cleanup;
    try {
      assert(
        SAFE_SCHEMA_PATTERN.test(schemaName),
        "Refusing to clean an unexpected schema.",
      );
      const safeTarget = assertSafeTarget(adminUrl);
      assert(
        safeTarget.databaseName === expectedDatabase,
        "Cleanup database differs from the fixture database.",
      );

      cleanup = prismaClient(adminUrl);
      const current = await assertScopedConnection(
        cleanup,
        expectedDatabase,
        "public",
      );
      const schemas = await cleanup.$queryRaw`
        SELECT
          namespace.nspname AS schema_name,
          owner_role.rolname AS owner_name
        FROM pg_namespace AS namespace
        JOIN pg_roles AS owner_role
          ON owner_role.oid = namespace.nspowner
        WHERE namespace.nspname = ${schemaName}
      `;
      assert(
        schemas.length === 1 &&
          schemas[0].schema_name === schemaName &&
          schemas[0].owner_name === current.user_name,
        "Cleanup schema is missing or not owned by the fixture user.",
      );
      await cleanup.$executeRawUnsafe(
        `DROP SCHEMA ${quoteIdentifier(schemaName)} CASCADE`,
      );
    } catch (error) {
      cleanupErrors.push(error);
    } finally {
      if (cleanup) {
        try {
          await cleanup.$disconnect();
        } catch (error) {
          cleanupErrors.push(error);
        }
      }
    }
  }

  try {
    assertSafeTempRoot(tempRoot);
    await rm(tempRoot, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  } catch (error) {
    cleanupErrors.push(error);
  }

  return cleanupErrors;
}

async function runOfflineSelfTest() {
  const safeTarget = assertSafeTarget(
    "postgresql://postgres:postgres@127.0.0.1:5432/leetplus_test?schema=public",
  );
  assert(
    safeTarget.databaseName === "leetplus_test",
    "Safe-target parser returned the wrong database.",
  );
  expectOfflineContractFailure("production database with test schema", () =>
    assertSafeTarget(
      "postgresql://postgres:postgres@127.0.0.1:5432/leetplus?schema=staff_task_test_integrity_expand_deadbeefdeadbeef",
    ),
  );
  expectOfflineContractFailure("test database with non-public schema", () =>
    assertSafeTarget(
      "postgresql://postgres:postgres@127.0.0.1:5432/leetplus_test?schema=staff_task_test_integrity_expand_deadbeefdeadbeef",
    ),
  );
  expectOfflineContractFailure("remote test database", () =>
    assertSafeTarget(
      "postgresql://postgres:postgres@database.invalid:5432/leetplus_test?schema=public",
    ),
  );
  expectOfflineContractFailure("non-PostgreSQL URL", () =>
    assertSafeTarget("mysql://localhost/leetplus_test?schema=public"),
  );
  assert(
    quoteIdentifier("Safe_identifier_01") === '"Safe_identifier_01"',
    "Identifier quoting changed unexpectedly.",
  );
  expectOfflineContractFailure("unsafe identifier", () =>
    quoteIdentifier('unsafe"; DROP SCHEMA public; --'),
  );
  assertSafeTempRoot(join(tmpdir(), `${TEMP_ROOT_PREFIX}deadbeef`));
  expectOfflineContractFailure("unsafe temporary root", () =>
    assertSafeTempRoot(tmpdir()),
  );
  expectOfflineContractFailure("DB-native DROP guard", () =>
    assertNoNativeContractRemoval(
      "future_migration",
      'ALTER TABLE "StaffTask" DROP CONSTRAINT "StaffTask_tenantId_createdByUserId_fkey";',
    ),
  );
  expectOfflineContractFailure("DB-native rename guard", () =>
    assertNoNativeContractRemoval(
      "future_migration",
      'ALTER TABLE "StaffTask" RENAME CONSTRAINT "StaffTask_tenantId_createdByUserId_fkey" TO "unsafe";',
    ),
  );
  expectOfflineContractFailure("DB-native ALTER CONSTRAINT guard", () =>
    assertNoNativeContractRemoval(
      "future_migration",
      'ALTER TABLE "StaffTask" ALTER CONSTRAINT "StaffTask_tenantId_createdByUserId_fkey" DEFERRABLE;',
    ),
  );
  expectOfflineContractFailure("DB-native DROP NOT NULL guard", () =>
    assertNoNativeContractRemoval(
      "future_migration",
      'ALTER TABLE "StaffTask" ALTER COLUMN "tenantId" DROP NOT NULL;',
    ),
  );
  expectOfflineContractFailure("DB-native trigger guard", () =>
    assertNoNativeContractRemoval(
      "future_migration",
      'ALTER TABLE "StaffTask" DISABLE TRIGGER ALL;',
    ),
  );
  expectOfflineContractFailure("DB-native replication-role guard", () =>
    assertNoNativeContractRemoval(
      "future_migration",
      "SET session_replication_role = replica;",
    ),
  );
  expectOfflineContractFailure("non-concurrent parent index artifact", () =>
    assertConcurrentParentIndexArtifact(
      EXPAND_MIGRATIONS[0],
      'CREATE UNIQUE INDEX "store_tenant_id_uidx" ON "Store"("tenantId", "id");',
      PARENT_INDEXES[0],
    ),
  );
  expectOfflineContractFailure("multi-statement parent index artifact", () =>
    assertConcurrentParentIndexArtifact(
      EXPAND_MIGRATIONS[0],
      'CREATE UNIQUE INDEX CONCURRENTLY "store_tenant_id_uidx" ON "Store"("tenantId", "id"); SELECT 1;',
      PARENT_INDEXES[0],
    ),
  );
  expectOfflineContractFailure("DB-native table guard", () =>
    assertNoNativeContractRemoval(
      "future_migration",
      'DROP TABLE "StaffTask" CASCADE;',
    ),
  );
  expectOfflineContractFailure("DB-native index guard", () =>
    assertNoNativeContractRemoval(
      "future_migration",
      'DROP INDEX CONCURRENTLY "staff_task_tenant_id_uidx";',
    ),
  );
  assert(
    EXPECTED_PRISMA_DRIFT_DROPS.length === 14,
    "Frozen Prisma destructive drift count changed unexpectedly.",
  );

  const migrationPlan = await readMigrationPlan();
  await assertNativeConstraintMigrationGuard(migrationPlan);
  await assertExpandMigrationArtifactContract(migrationPlan);
  assert(
    migrationPlan.baselineMigrations.at(-1) === BASELINE_LAST_MIGRATION,
    "Frozen baseline partition is incorrect.",
  );
  assertEqualArray(
    migrationPlan.expandMigrations,
    EXPAND_MIGRATIONS,
    "Frozen EXPAND partition is incorrect.",
  );
  assert(
    migrationPlan.expandCount === EXPAND_MIGRATIONS.length &&
      migrationPlan.stagedCount ===
        EXPECTED_BASELINE_MIGRATION_COUNT + EXPAND_MIGRATIONS.length,
    "Frozen staged migration counts are incorrect.",
  );

  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      baselineMigrations: migrationPlan.baselineCount,
      expandMigrations: migrationPlan.expandCount,
      expandMigrationNames: migrationPlan.expandMigrations,
      stagedMigrations: migrationPlan.stagedCount,
      finalMigration: FINAL_MIGRATION,
      futureMigrationsGuarded: migrationPlan.futureMigrations.length,
      nativeConstraintsGuarded: DB_NATIVE_CONSTRAINT_NAMES.length,
      expandMigrationArtifactsGuarded: migrationPlan.expandCount,
    })}\n`,
  );
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new SmokeContractError(
      "Staff task integrity fixtures are prohibited in production.",
    );
  }
  assert(
    process.env.STAFF_TASK_INTEGRITY_EXPAND_SMOKE_CONFIRM ===
      REQUIRED_CONFIRMATION,
    `Set STAFF_TASK_INTEGRITY_EXPAND_SMOKE_CONFIRM=${REQUIRED_CONFIRMATION} to run fixtures.`,
  );

  const databaseUrl = process.env.DATABASE_URL;
  assert(databaseUrl, "DATABASE_URL is required.");
  const { databaseName } = assertSafeTarget(databaseUrl);
  const migrationPlan = await readMigrationPlan();
  await assertNativeConstraintMigrationGuard(migrationPlan);
  await assertExpandMigrationArtifactContract(migrationPlan);

  const schemaName = `${SAFE_SCHEMA_PREFIX}${randomBytes(8).toString("hex")}`;
  assert(
    SAFE_SCHEMA_PATTERN.test(schemaName),
    "Generated test schema failed its safety contract.",
  );
  const fixtureId = randomUUID();
  const adminUrl = scopedDatabaseUrl(databaseUrl, "public");
  const scopedUrl = scopedDatabaseUrl(databaseUrl, schemaName);
  const tempRoot = await mkdtemp(join(tmpdir(), TEMP_ROOT_PREFIX));
  let schemaCreated = false;
  let fixtureClient;
  let result;
  let primaryError;

  try {
    const admin = prismaClient(adminUrl);
    try {
      await assertScopedConnection(admin, databaseName, "public");
      await admin.$executeRawUnsafe(
        `CREATE SCHEMA ${quoteIdentifier(schemaName)}`,
      );
      schemaCreated = true;
    } finally {
      await admin.$disconnect();
    }

    const schemaPath = await copyMigrationArtifact(
      tempRoot,
      migrationPlan,
      "baseline",
    );
    runMigrateDeploy(schemaPath, scopedUrl);

    fixtureClient = prismaClient(scopedUrl);
    await assertScopedConnection(fixtureClient, databaseName, schemaName);
    assert(
      (await migrationCount(fixtureClient)) === migrationPlan.baselineCount,
      "Baseline migration count is incorrect.",
    );
    const fixtures = await createLegacyFixtures(fixtureClient, fixtureId);
    const expandPreconditions = await assertExpandPreconditions(
      fixtureClient,
      fixtures.legacyIds,
    );
    await fixtureClient.$disconnect();
    fixtureClient = undefined;

    await copyMigrationArtifact(tempRoot, migrationPlan, "expand");
    runMigrateDeploy(schemaPath, scopedUrl);

    fixtureClient = prismaClient(scopedUrl);
    await assertScopedConnection(fixtureClient, databaseName, schemaName);
    assert(
      (await migrationCount(fixtureClient)) === migrationPlan.stagedCount,
      "Staged EXPAND migration count is incorrect.",
    );
    await assertLegacyRowsRemain(fixtureClient, fixtures.legacyIds);
    await assertConstraintContract(fixtureClient);
    await assertParentIndexes(fixtureClient);
    await assertValidationBlocked(fixtureClient);
    await assertFreshInvalidWritesRejected(fixtureClient, fixtures);
    await assertFreshValidGraph(fixtureClient, fixtures, fixtureId);
    await assertStoreArchivePolicy(fixtureClient, fixtures, fixtureId);
    await assertLegacyStoreDeleteProtection(fixtureClient, fixtures);
    const parentUpdateChecks = await assertParentIdentifierUpdatesRejected(
      fixtureClient,
      fixtures,
      fixtureId,
    );
    await assertDeleteActions(fixtureClient, fixtures, fixtureId);
    assertPrismaDriftContract(runPrismaDiff(schemaPath, scopedUrl));

    result = {
      ok: true,
      migrations: migrationPlan.stagedCount,
      fixtureBaselineMigrations: migrationPlan.baselineCount,
      expandMigrations: migrationPlan.expandCount,
      constraints: CONSTRAINTS.length,
      compatibilityConstraints:
        LEGACY_STORE_CONSTRAINTS.length +
        LEGACY_COMPATIBILITY_CONSTRAINTS.length,
      parentIndexes: PARENT_INDEXES.length,
      concurrentIndexesBuiltAfterLegacyFixtures: PARENT_INDEXES.length,
      populatedParentTablesBeforeExpand:
        expandPreconditions.populatedParentTables,
      legacyRows: CONSTRAINTS.length,
      legacyRowsBeforeExpand: expandPreconditions.legacyRows,
      invalidWritesRejected: CONSTRAINTS.length,
      storeDeletePolicies: 3,
      legacyStoreDeletePolicies: LEGACY_STORE_CONSTRAINTS.length,
      parentIdentifierUpdatesRejected: parentUpdateChecks.identifierUpdates,
      parentTenantUpdatesRejected: parentUpdateChecks.tenantUpdates,
      prismaDriftDrops: EXPECTED_PRISMA_DRIFT_DROPS.length,
      schemaPrefix: SAFE_SCHEMA_PREFIX,
    };
  } catch (error) {
    primaryError = error;
  }

  const cleanupErrors = await cleanupSmokeResources({
    fixtureClient,
    schemaCreated,
    schemaName,
    adminUrl,
    expectedDatabase: databaseName,
    tempRoot,
  });

  if (primaryError) {
    if (cleanupErrors.length > 0) {
      process.stderr.write(
        `Smoke cleanup also failed (${cleanupErrors
          .map(errorSummary)
          .join("; ")}).\n`,
      );
    }
    throw primaryError;
  }
  if (cleanupErrors.length > 0) {
    throw new SmokeContractError(
      `Staff task integrity smoke cleanup failed (${cleanupErrors
        .map(errorSummary)
        .join("; ")}).`,
    );
  }

  process.stdout.write(`${JSON.stringify(result)}\n`);
}

try {
  if (process.argv.includes("--self-test")) {
    await runOfflineSelfTest();
  } else {
    await main();
  }
} catch (error) {
  const message =
    error instanceof Error
      ? error.message
      : "Staff task integrity smoke failed unexpectedly.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

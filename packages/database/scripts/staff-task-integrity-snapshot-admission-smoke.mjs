import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path, { basename, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { PrismaClient } from "@prisma/client";

import {
  STAFF_TASK_ALLOWED_ADDITIVE_TAIL,
  STAFF_TASK_CURRENT_RELEASE_STATE,
  STAFF_TASK_FROZEN_PREFIX_COUNT,
  STAFF_TASK_FROZEN_PREFIX_LATEST,
} from "./staff-task-integrity-migration-state.mjs";

const SCRIPT_NAME = "staff-task-integrity-snapshot-admission-smoke";
const REQUIRED_CONFIRMATION =
  "run-staff-task-integrity-snapshot-admission-smoke";
const ADMISSION_ENV_PREFIX = "STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_";
const BASELINE_STATE = "BASELINE_156";
const EXPAND_STATE = "EXPAND_162";
const CURRENT_STATE = STAFF_TASK_CURRENT_RELEASE_STATE;
const BASELINE_MIGRATION_COUNT = 156;
const BASELINE_LAST_MIGRATION =
  "20260727120000_staff_task_catalog_audit_expand";
const EXPAND_MIGRATIONS = Object.freeze([
  "20260727130100_staff_task_store_tenant_key",
  "20260727130200_staff_task_user_tenant_key",
  "20260727130300_staff_task_template_tenant_key",
  "20260727130400_staff_task_recurring_rule_tenant_key",
  "20260727130500_staff_task_tenant_key",
  "20260727131000_staff_task_integrity_expand",
]);
const SNAPSHOT_CLASSIFICATION = "SYNTHETIC";
const CLONE_PREFIX = "lp_snapshot_admission_ci_";
const READER_PREFIX = "lp_snapshot_admission_reader_";
const TEMP_ROOT_PREFIX = "leetplus-staff-task-snapshot-admission-";
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const SAFE_SYSTEM_DATABASES = new Set(["postgres", "template1"]);
const SAFE_SOURCE_DATABASE_PATTERN = /(?:^|[_-])(?:ci|test|testing)(?:$|[_-])/i;
const SAFE_CLONE_PATTERN = /^lp_snapshot_admission_ci_[0-9a-f]{16}$/;
const SAFE_READER_PATTERN = /^lp_snapshot_admission_reader_[0-9a-f]{16}$/;
const MIGRATION_PATTERN = /^\d{14}_[a-z0-9_]+$/;
const RELEASE_SHA_PATTERN = /^[0-9a-f]{40}$/;
const POSTGRES_PERMISSION_DENIED = "42501";
const ADMISSION_TIMEOUT_MS = 120_000;
const MIGRATION_TIMEOUT_MS = 10 * 60 * 1000;
const ADVISORY_LOCK_CLASS = 1_279_349_841;
const ADVISORY_LOCK_OBJECT = 162;
const HMAC_KEY = "synthetic-snapshot-admission-smoke-hmac-key-aaaaaaaaaaaaaaaa";
const PROPOSAL_DRY_RUN_HMAC_KEY = randomBytes(48).toString("base64url");
const PROVENANCE_HMAC_KEY = randomBytes(48).toString("base64url");
const APPROVAL_REFERENCE = "synthetic:admission-smoke";
const ADMISSION_SCRIPT_PATH = fileURLToPath(
  new URL("./staff-task-integrity-snapshot-admission.mjs", import.meta.url),
);
const PLANNER_SCRIPT_PATH = fileURLToPath(
  new URL("./staff-task-integrity-reconciliation-plan.mjs", import.meta.url),
);
const PROPOSAL_DRY_RUN_SCRIPT_PATH = fileURLToPath(
  new URL(
    "./staff-task-integrity-reconciliation-proposal-dry-run.mjs",
    import.meta.url,
  ),
);

const READER_SELECT_RELATIONS = Object.freeze([
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
const READER_COLUMN_SELECTS = Object.freeze({
  User: Object.freeze([
    "id",
    "tenantId",
    "isPlatformAdmin",
    "isActive",
    "accessScope",
  ]),
});
const READER_FORBIDDEN_USER_COLUMNS = Object.freeze([
  "email",
  "passwordHash",
  "fullName",
  "role",
  "customRoleId",
  "emailVerifiedAt",
  "createdAt",
  "updatedAt",
]);
const READER_TABLE_SELECT_RELATIONS = Object.freeze(
  READER_SELECT_RELATIONS.filter(
    (relationName) => !Object.hasOwn(READER_COLUMN_SELECTS, relationName),
  ),
);
const SOURCE_FINGERPRINT_TABLES = READER_SELECT_RELATIONS;
const EXPECTED_PROPOSAL_COUNTS = Object.freeze({
  RULE_CREATOR_CROSS_TENANT: 1,
  RULE_LAST_TASK_CROSS_TENANT: 1,
  RULE_LAST_TASK_SOURCE_MISMATCH: 1,
  RULE_TEMPLATE_CROSS_TENANT: 1,
  TASK_CREATOR_CROSS_TENANT: 1,
  TASK_RULE_CROSS_TENANT: 1,
  TASK_TEMPLATE_CROSS_TENANT: 1,
  TEMPLATE_CREATOR_CROSS_TENANT: 1,
});
const EXPECTED_PROPOSAL_OCCURRENCES = Object.values(
  EXPECTED_PROPOSAL_COUNTS,
).reduce((total, count) => total + count, 0);
const EXPECTED_PROPOSAL_CASES = Object.freeze([
  Object.freeze({
    resourceType: "StaffTask",
    column: "createdByUserId",
    reasonCodes: Object.freeze(["TASK_CREATOR_CROSS_TENANT"]),
  }),
  Object.freeze({
    resourceType: "StaffTask",
    column: "sourceRecurringRuleId",
    reasonCodes: Object.freeze(["TASK_RULE_CROSS_TENANT"]),
  }),
  Object.freeze({
    resourceType: "StaffTask",
    column: "sourceTemplateId",
    reasonCodes: Object.freeze(["TASK_TEMPLATE_CROSS_TENANT"]),
  }),
  Object.freeze({
    resourceType: "StaffTaskRecurringRule",
    column: "createdByUserId",
    reasonCodes: Object.freeze(["RULE_CREATOR_CROSS_TENANT"]),
  }),
  Object.freeze({
    resourceType: "StaffTaskRecurringRule",
    column: "lastCreatedTaskId",
    reasonCodes: Object.freeze([
      "RULE_LAST_TASK_CROSS_TENANT",
      "RULE_LAST_TASK_SOURCE_MISMATCH",
    ]),
  }),
  Object.freeze({
    resourceType: "StaffTaskRecurringRule",
    column: "templateId",
    reasonCodes: Object.freeze(["RULE_TEMPLATE_CROSS_TENANT"]),
  }),
  Object.freeze({
    resourceType: "StaffTaskTemplate",
    column: "createdByUserId",
    reasonCodes: Object.freeze(["TEMPLATE_CREATOR_CROSS_TENANT"]),
  }),
]);
const EXPECTED_OPERATOR_OCCURRENCES = 2;
const EXPECTED_REVIEW_OCCURRENCES = 2;
const EXPECTED_POSITIVE_FINDING_COUNTS = Object.freeze({
  ...EXPECTED_PROPOSAL_COUNTS,
  TASK_STORE_CROSS_TENANT: EXPECTED_OPERATOR_OCCURRENCES,
  TASK_STORE_SET_NULL_CANDIDATE: EXPECTED_REVIEW_OCCURRENCES,
});

const HELP = `
${SCRIPT_NAME}

Local/CI-only PostgreSQL smoke for the guarded StaffTask snapshot admission
command. It creates a random disposable database from template0, deploys the
exact committed migration baseline through Prisma, admits BASELINE_156,
deploys exactly migrations 157..162, and admits EXPAND_162 through a dedicated
least-privilege login with eight table grants and five non-PII User columns.
It then injects synthetic cross-tenant legacy fixtures,
including a positive matrix for all eight proposal codes and the two-reason
last-task overlap, binds a signed short-lived provenance manifest to the
disposable database, and exercises the read-only row-level proposal dry-run.
Finally it applies the exact reviewed additive tail and admits CURRENT_185,
while preserving the independently verified EXPAND_162 evidence boundary.
The generated database and login are destroyed in a finally block.

Usage:
  node scripts/staff-task-integrity-snapshot-admission-smoke.mjs [options]

Options:
  --help       Show this help without reading environment variables or the DB.
  --self-test  Run source and safety-guard checks without reading the DB.

Required environment:
  DATABASE_URL
    PostgreSQL on localhost, public schema, and a database name carrying a
    ci/test/testing marker. The connected role must be a test superuser.
  RELEASE_SHA
    Exact 40-character lowercase hexadecimal release commit.
  STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_SMOKE_CONFIRM
    Must equal: ${REQUIRED_CONFIRMATION}

Safety:
  NODE_ENV=production, remote hosts, production-like source names, non-public
  schemas, fixed clone names, and caller-provided reader credentials are
  rejected. The source is read only for aggregate before/after fingerprints;
  it is never used as a template or migration target. All migrations, fixtures,
  and catalog tampering are restricted to a generated ${CLONE_PREFIX}<hex>
  database. While admission runs, PUBLIC CONNECT is temporarily revoked from
  the other connectable databases in this isolated local/CI cluster and the
  exact original effective grant list is restored in finally. Cleanup also
  force-drops the generated database, terminates generated reader sessions,
  drops the reader role, and removes the generated migration artifact. Run only
  on a disposable, single-purpose PostgreSQL cluster; forced process or host
  termination can prevent in-process ACL restoration. A cluster-wide advisory
  lock rejects overlapping runs of this smoke.
`.trim();

function contractError(code) {
  const error = new Error(code);
  error.code = code;
  error.safeContractError = true;
  throw error;
}

function parseArguments(argv) {
  if (argv.includes("--help")) {
    return { help: true, selfTest: false };
  }
  const supported = new Set(["--self-test"]);
  for (const argument of argv) {
    if (!supported.has(argument)) {
      contractError("CLI_ARGUMENT_UNSUPPORTED");
    }
  }
  return { help: false, selfTest: argv.includes("--self-test") };
}

function quoteIdentifier(value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(value)) {
    contractError("DATABASE_IDENTIFIER_INVALID");
  }
  return `"${value}"`;
}

function quoteCatalogDatabaseIdentifier(value) {
  const databaseName = String(value);
  assert(
    databaseName.length > 0 &&
      !databaseName.includes("\0") &&
      Buffer.byteLength(databaseName, "utf8") <= 63,
    "PostgreSQL returned an invalid database identifier.",
  );
  return `"${databaseName.replaceAll('"', '""')}"`;
}

function assertSafePublicConnectMutationTarget(databaseName) {
  if (
    !SAFE_SYSTEM_DATABASES.has(databaseName.toLowerCase()) &&
    !SAFE_SOURCE_DATABASE_PATTERN.test(databaseName)
  ) {
    contractError("ISOLATED_CI_CLUSTER_REQUIRED");
  }
}

function parseSourceDatabaseUrl(rawUrl) {
  let sourceUrl;
  try {
    sourceUrl = new URL(String(rawUrl ?? ""));
  } catch {
    contractError("DATABASE_URL_INVALID");
  }
  if (
    !["postgresql:", "postgres:"].includes(sourceUrl.protocol) ||
    !LOCAL_HOSTS.has(sourceUrl.hostname.toLowerCase())
  ) {
    contractError("LOCAL_POSTGRES_REQUIRED");
  }

  const databaseName = decodeURIComponent(sourceUrl.pathname.slice(1));
  if (
    !/^[A-Za-z0-9_]{1,40}$/.test(databaseName) ||
    !SAFE_SOURCE_DATABASE_PATTERN.test(databaseName) ||
    databaseName.toLowerCase() === "postgres"
  ) {
    contractError("SAFE_CI_TEST_SOURCE_DATABASE_REQUIRED");
  }
  const schema = sourceUrl.searchParams.get("schema");
  if (schema !== null && schema !== "public") {
    contractError("PUBLIC_SCHEMA_REQUIRED");
  }
  return { sourceUrl, databaseName };
}

function databaseUrlFor(sourceUrl, databaseName) {
  const target = new URL(sourceUrl);
  target.pathname = `/${databaseName}`;
  target.searchParams.set("schema", "public");
  target.searchParams.set("connection_limit", "1");
  target.searchParams.set("connect_timeout", "5");
  target.searchParams.set("pool_timeout", "5");
  target.searchParams.delete("options");
  return target;
}

function readerDatabaseUrl(sourceUrl, databaseName, roleName, password) {
  const target = databaseUrlFor(sourceUrl, databaseName);
  target.username = roleName;
  target.password = password;
  return target.toString();
}

function proposalDryRunDatabaseUrl(readerUrl) {
  const target = new URL(readerUrl);
  target.search = "";
  target.searchParams.set("schema", "public");
  return target.toString();
}

function generatedNames() {
  const suffix = randomBytes(8).toString("hex");
  const cloneDatabaseName = `${CLONE_PREFIX}${suffix}`;
  const readerRoleName = `${READER_PREFIX}${suffix}`;
  assert.match(cloneDatabaseName, SAFE_CLONE_PATTERN);
  assert.match(readerRoleName, SAFE_READER_PATTERN);
  return { cloneDatabaseName, readerRoleName };
}

function prismaClient(databaseUrl) {
  return new PrismaClient({ datasourceUrl: databaseUrl, log: [] });
}

function assertSafeTempRoot(tempRoot) {
  const resolvedRoot = path.resolve(tempRoot);
  const rootName = basename(resolvedRoot);
  assert.equal(
    dirname(resolvedRoot),
    path.resolve(tmpdir()),
    "Refusing to remove a migration artifact outside the OS temp directory.",
  );
  assert(
    rootName.startsWith(TEMP_ROOT_PREFIX) &&
      rootName.length > TEMP_ROOT_PREFIX.length,
    "Refusing to remove an unexpected migration artifact path.",
  );
}

async function readMigrationPlan() {
  const sourcePrismaDir = fileURLToPath(new URL("../prisma/", import.meta.url));
  const migrationNames = (
    await readdir(path.join(sourcePrismaDir, "migrations"), {
      withFileTypes: true,
    })
  )
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  assert(
    migrationNames.every((migrationName) =>
      MIGRATION_PATTERN.test(migrationName),
    ),
    "The committed migration directory contract is invalid.",
  );
  assert.equal(
    migrationNames.length,
    STAFF_TASK_FROZEN_PREFIX_COUNT + STAFF_TASK_ALLOWED_ADDITIVE_TAIL.length,
    "The snapshot admission smoke requires the frozen prefix and exact reviewed additive tail.",
  );
  assert.equal(
    migrationNames[BASELINE_MIGRATION_COUNT - 1],
    BASELINE_LAST_MIGRATION,
    "The frozen BASELINE_156 migration boundary changed.",
  );
  assert.deepEqual(
    migrationNames.slice(
      BASELINE_MIGRATION_COUNT,
      STAFF_TASK_FROZEN_PREFIX_COUNT,
    ),
    [...EXPAND_MIGRATIONS],
    "Migrations 157..162 must remain the exact contiguous EXPAND sequence.",
  );
  assert.equal(
    migrationNames[STAFF_TASK_FROZEN_PREFIX_COUNT - 1],
    STAFF_TASK_FROZEN_PREFIX_LATEST,
    "The reviewed StaffTask migration prefix changed.",
  );
  assert.deepEqual(
    migrationNames.slice(STAFF_TASK_FROZEN_PREFIX_COUNT),
    [...STAFF_TASK_ALLOWED_ADDITIVE_TAIL],
    "The post-162 migration tail must be explicitly reviewed and allowlisted.",
  );

  for (const migrationName of STAFF_TASK_ALLOWED_ADDITIVE_TAIL) {
    const sql = readFileSync(
      path.join(sourcePrismaDir, "migrations", migrationName, "migration.sql"),
      "utf8",
    );
    assert(
      !/"StaffTask[A-Za-z]*"/.test(sql),
      `Additive migration ${migrationName} touches a frozen StaffTask relation.`,
    );
  }

  return {
    sourcePrismaDir,
    baselineMigrations: migrationNames.slice(0, BASELINE_MIGRATION_COUNT),
    expandMigrations: migrationNames.slice(
      BASELINE_MIGRATION_COUNT,
      STAFF_TASK_FROZEN_PREFIX_COUNT,
    ),
    allMigrations: migrationNames.slice(0, STAFF_TASK_FROZEN_PREFIX_COUNT),
    currentMigrations: migrationNames,
    additiveTailMigrations: migrationNames.slice(
      STAFF_TASK_FROZEN_PREFIX_COUNT,
    ),
  };
}

function readReleaseBlob(repositoryRoot, releaseSha, releasePath) {
  assert.match(
    releaseSha,
    RELEASE_SHA_PATTERN,
    "The staged artifact requires an exact release SHA.",
  );
  assert.match(
    releasePath,
    /^[A-Za-z0-9_./-]+$/,
    "The staged artifact release path is invalid.",
  );
  const result = spawnSync("git", ["show", `${releaseSha}:${releasePath}`], {
    cwd: repositoryRoot,
    encoding: null,
    maxBuffer: 16 * 1024 * 1024,
    timeout: 30_000,
    windowsHide: true,
  });
  assert.equal(
    result.error,
    undefined,
    "Git failed to read the release artifact.",
  );
  assert.equal(
    result.signal,
    null,
    "Git release artifact lookup was terminated by a signal.",
  );
  assert.equal(
    result.status,
    0,
    "A required file is missing from the release artifact.",
  );
  assert(
    Buffer.isBuffer(result.stdout) && result.stdout.length > 0,
    "Git returned an empty release artifact.",
  );
  return result.stdout;
}

async function copyMigrationArtifact(
  tempRoot,
  migrationPlan,
  stage,
  releaseSha,
) {
  assert(
    stage === "baseline" || stage === "expand" || stage === "current",
    "Unknown staged migration phase.",
  );
  assertSafeTempRoot(tempRoot);
  const targetPrismaDir = path.join(tempRoot, "prisma");
  const targetMigrationsDir = path.join(targetPrismaDir, "migrations");
  const selectedMigrations =
    stage === "baseline"
      ? migrationPlan.baselineMigrations
      : stage === "expand"
        ? migrationPlan.expandMigrations
        : migrationPlan.additiveTailMigrations;
  const repositoryRoot = path.resolve(
    migrationPlan.sourcePrismaDir,
    "../../..",
  );
  const releasePrismaPath = "packages/database/prisma";

  await mkdir(targetMigrationsDir, { recursive: true });
  await writeFile(
    path.join(targetPrismaDir, "schema.prisma"),
    readReleaseBlob(
      repositoryRoot,
      releaseSha,
      `${releasePrismaPath}/schema.prisma`,
    ),
  );
  await writeFile(
    path.join(targetMigrationsDir, "migration_lock.toml"),
    readReleaseBlob(
      repositoryRoot,
      releaseSha,
      `${releasePrismaPath}/migrations/migration_lock.toml`,
    ),
  );
  for (const migrationName of selectedMigrations) {
    const targetMigrationDir = path.join(targetMigrationsDir, migrationName);
    await mkdir(targetMigrationDir, { recursive: true });
    await writeFile(
      path.join(targetMigrationDir, "migration.sql"),
      readReleaseBlob(
        repositoryRoot,
        releaseSha,
        `${releasePrismaPath}/migrations/${migrationName}/migration.sql`,
      ),
    );
  }
  return path.join(targetPrismaDir, "schema.prisma");
}

function runMigrateDeploy(schemaPath, databaseUrl, environment) {
  const require = createRequire(import.meta.url);
  const prismaCliPath = require.resolve("prisma/build/index.js");
  const result = spawnSync(
    process.execPath,
    [prismaCliPath, "migrate", "deploy", "--schema", schemaPath],
    {
      cwd: dirname(schemaPath),
      env: {
        ...withoutAdmissionVariables(environment),
        NODE_ENV: "test",
        DATABASE_URL: databaseUrl,
        PGOPTIONS: "-c lock_timeout=5000 -c statement_timeout=120000",
        NO_COLOR: "1",
        PRISMA_HIDE_UPDATE_MESSAGE: "true",
      },
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
      timeout: MIGRATION_TIMEOUT_MS,
      windowsHide: true,
    },
  );
  assert.equal(result.error, undefined, "Prisma migration process failed.");
  assert.equal(
    result.signal,
    null,
    "Prisma migration process was terminated by a signal.",
  );
  assert.equal(
    result.status,
    0,
    "Prisma failed the staged snapshot migration rehearsal.",
  );
}

async function assertAppliedMigrations(databaseUrl, expectedNames) {
  const prisma = prismaClient(databaseUrl);
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT "migration_name"::text AS migration_name
       FROM public."_prisma_migrations"
       WHERE "finished_at" IS NOT NULL
         AND "rolled_back_at" IS NULL
       ORDER BY "migration_name"`,
    );
    assert.deepEqual(
      rows.map((row) => String(row.migration_name)),
      expectedNames,
      "The disposable database does not match the exact staged migration set.",
    );
    const unfinished = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::text AS count
       FROM public."_prisma_migrations"
       WHERE "finished_at" IS NULL
         AND "rolled_back_at" IS NULL`,
    );
    assert.equal(unfinished.length, 1);
    assert.equal(unfinished[0].count, "0");
  } finally {
    await prisma.$disconnect();
  }
}

function canonicalJson(value) {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    typeof value === "number"
  ) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  const entries = Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`);
  return `{${entries.join(",")}}`;
}

async function aggregateFingerprint(databaseUrl) {
  const prisma = prismaClient(databaseUrl);
  try {
    const aggregates = [];
    for (const tableName of SOURCE_FINGERPRINT_TABLES) {
      const quotedTable = quoteIdentifier(tableName);
      const rows = await prisma.$queryRawUnsafe(
        `SELECT
           COUNT(*)::text AS row_count,
           md5(
             COALESCE(
               string_agg(
                 md5(to_jsonb(item)::text),
                 '' ORDER BY item."id"
               ),
               ''
             )
           )::text AS row_digest
         FROM public.${quotedTable} AS item`,
      );
      assert.equal(rows.length, 1);
      assert.match(String(rows[0]?.row_count ?? ""), /^\d+$/);
      assert.match(String(rows[0]?.row_digest ?? ""), /^[0-9a-f]{32}$/);
      aggregates.push({
        table: tableName,
        count: String(rows[0].row_count),
        digest: String(rows[0].row_digest),
      });
    }
    return createHash("sha256")
      .update(canonicalJson(aggregates), "utf8")
      .digest("hex");
  } finally {
    await prisma.$disconnect();
  }
}

async function assertTestSuperuser(admin) {
  const rows = await admin.$queryRawUnsafe(
    `SELECT role.rolsuper
     FROM pg_roles AS role
     WHERE role.rolname = current_user`,
  );
  assert.equal(
    rows.length,
    1,
    "The smoke requires one resolved PostgreSQL test role.",
  );
  assert.equal(
    rows[0].rolsuper,
    true,
    "Synthetic legacy fixtures require a local/CI test superuser.",
  );
}

async function acquireClusterSmokeLock(admin) {
  const rows = await admin.$queryRawUnsafe(
    `SELECT pg_try_advisory_lock(
       ${ADVISORY_LOCK_CLASS},
       ${ADVISORY_LOCK_OBJECT}
     ) AS acquired`,
  );
  assert.equal(rows.length, 1);
  assert.equal(
    rows[0].acquired,
    true,
    "Another snapshot admission smoke owns the local cluster lock.",
  );
}

async function releaseClusterSmokeLock(admin) {
  const rows = await admin.$queryRawUnsafe(
    `SELECT pg_advisory_unlock(
       ${ADVISORY_LOCK_CLASS},
       ${ADVISORY_LOCK_OBJECT}
     ) AS released`,
  );
  assert.equal(rows.length, 1);
  assert.equal(
    rows[0].released,
    true,
    "The snapshot admission smoke did not own its cluster lock.",
  );
}

async function publicConnectDatabases(admin, excludedDatabaseName) {
  const rows = await admin.$queryRawUnsafe(
    `SELECT database_row.datname::text AS database_name
     FROM pg_database AS database_row
     WHERE database_row.datallowconn
       AND database_row.datname <> $1
       AND EXISTS (
         SELECT 1
         FROM aclexplode(
           COALESCE(
             database_row.datacl,
             acldefault('d', database_row.datdba)
           )
         ) AS privilege
         WHERE privilege.grantee = 0
           AND privilege.privilege_type = 'CONNECT'
       )
     ORDER BY database_row.datname`,
    excludedDatabaseName,
  );
  const databaseNames = rows.map((row) => String(row.database_name));
  assert.equal(
    new Set(databaseNames).size,
    databaseNames.length,
    "PostgreSQL returned duplicate database ACL rows.",
  );
  for (const databaseName of databaseNames) {
    quoteCatalogDatabaseIdentifier(databaseName);
  }
  return databaseNames;
}

async function revokePublicConnectFromOtherDatabases(
  admin,
  cloneDatabaseName,
  revokedDatabaseNames,
) {
  const databaseNames = await publicConnectDatabases(admin, cloneDatabaseName);
  for (const databaseName of databaseNames) {
    assertSafePublicConnectMutationTarget(databaseName);
  }
  for (const databaseName of databaseNames) {
    await admin.$executeRawUnsafe(
      `REVOKE CONNECT ON DATABASE ${quoteCatalogDatabaseIdentifier(
        databaseName,
      )} FROM PUBLIC`,
    );
    revokedDatabaseNames.push(databaseName);
  }
  const remaining = await publicConnectDatabases(admin, cloneDatabaseName);
  assert.deepEqual(
    remaining,
    [],
    "PUBLIC retained CONNECT on another connectable database.",
  );
}

async function restorePublicDatabaseConnect(admin, revokedDatabaseNames) {
  const restorationErrors = [];
  for (const databaseName of revokedDatabaseNames) {
    try {
      await admin.$executeRawUnsafe(
        `GRANT CONNECT ON DATABASE ${quoteCatalogDatabaseIdentifier(
          databaseName,
        )} TO PUBLIC`,
      );
    } catch (error) {
      restorationErrors.push(error);
    }
  }
  try {
    const restored = await publicConnectDatabases(admin, "");
    for (const databaseName of revokedDatabaseNames) {
      assert(
        restored.includes(databaseName),
        `PUBLIC CONNECT was not restored for ${databaseName}.`,
      );
    }
  } catch (error) {
    restorationErrors.push(error);
  }
  if (restorationErrors.length > 0) {
    throw new AggregateError(
      restorationErrors,
      "Failed to restore the original PUBLIC database CONNECT grants.",
    );
  }
}

async function configureReaderRole(
  cloneDatabaseUrl,
  cloneDatabaseName,
  readerRoleName,
) {
  const cloneAdmin = prismaClient(cloneDatabaseUrl);
  const quotedRole = quoteIdentifier(readerRoleName);
  const quotedDatabase = quoteIdentifier(cloneDatabaseName);
  const exactTableSelectRelations = READER_TABLE_SELECT_RELATIONS.map(
    (relationName) => `public.${quoteIdentifier(relationName)}`,
  ).join(", ");
  const exactUserSelectColumns = READER_COLUMN_SELECTS.User.map((columnName) =>
    quoteIdentifier(columnName),
  ).join(", ");
  try {
    await cloneAdmin.$executeRawUnsafe(
      `REVOKE CREATE ON SCHEMA public FROM PUBLIC`,
    );
    await cloneAdmin.$executeRawUnsafe(
      `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC`,
    );
    await cloneAdmin.$executeRawUnsafe(
      `REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC`,
    );
    await cloneAdmin.$executeRawUnsafe(
      `REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC`,
    );
    await cloneAdmin.$executeRawUnsafe(
      `REVOKE ALL ON SCHEMA public FROM ${quotedRole}`,
    );
    await cloneAdmin.$executeRawUnsafe(
      `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${quotedRole}`,
    );
    await cloneAdmin.$executeRawUnsafe(
      `REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM ${quotedRole}`,
    );
    await cloneAdmin.$executeRawUnsafe(
      `REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM ${quotedRole}`,
    );
    await cloneAdmin.$executeRawUnsafe(
      `REVOKE ALL ON DATABASE ${quotedDatabase} FROM ${quotedRole}`,
    );
    await cloneAdmin.$executeRawUnsafe(
      `REVOKE ALL ON DATABASE ${quotedDatabase} FROM PUBLIC`,
    );
    await cloneAdmin.$executeRawUnsafe(
      `GRANT CONNECT ON DATABASE ${quotedDatabase} TO ${quotedRole}`,
    );
    await cloneAdmin.$executeRawUnsafe(
      `GRANT USAGE ON SCHEMA public TO ${quotedRole}`,
    );
    await cloneAdmin.$executeRawUnsafe(
      `GRANT SELECT ON TABLE ${exactTableSelectRelations} TO ${quotedRole}`,
    );
    await cloneAdmin.$executeRawUnsafe(
      `GRANT SELECT (${exactUserSelectColumns})
       ON TABLE public."User" TO ${quotedRole}`,
    );
    await cloneAdmin.$executeRawUnsafe(
      `GRANT EXECUTE ON FUNCTION pg_catalog.pg_control_system() TO ${quotedRole}`,
    );
  } finally {
    await cloneAdmin.$disconnect();
  }
}

async function withReaderPrivilegeMutation(
  { cloneDatabaseUrl, cloneDatabaseName, readerRoleName, privilegeStatement },
  operation,
) {
  const cloneAdmin = prismaClient(cloneDatabaseUrl);
  try {
    await cloneAdmin.$executeRawUnsafe(privilegeStatement);
  } finally {
    await cloneAdmin.$disconnect();
  }
  try {
    return await operation();
  } finally {
    await configureReaderRole(
      cloneDatabaseUrl,
      cloneDatabaseName,
      readerRoleName,
    );
  }
}

async function withReaderCatalogMutation(
  {
    cloneDatabaseUrl,
    cloneDatabaseName,
    readerRoleName,
    mutateStatement,
    restoreStatement,
  },
  operation,
) {
  const mutateAdmin = prismaClient(cloneDatabaseUrl);
  try {
    await mutateAdmin.$executeRawUnsafe(mutateStatement);
  } finally {
    await mutateAdmin.$disconnect();
  }
  try {
    return await operation();
  } finally {
    const restoreAdmin = prismaClient(cloneDatabaseUrl);
    try {
      await restoreAdmin.$executeRawUnsafe(restoreStatement);
    } finally {
      await restoreAdmin.$disconnect();
    }
    await configureReaderRole(
      cloneDatabaseUrl,
      cloneDatabaseName,
      readerRoleName,
    );
  }
}

async function assertExactReaderSelectScope(cloneDatabaseUrl, readerRoleName) {
  const cloneAdmin = prismaClient(cloneDatabaseUrl);
  try {
    const existing = await cloneAdmin.$queryRawUnsafe(
      `SELECT relation.relname::text AS relation_name
       FROM pg_class AS relation
       JOIN pg_namespace AS namespace
         ON namespace.oid = relation.relnamespace
       WHERE namespace.nspname = 'public'
         AND relation.relname = ANY($1::text[])
         AND relation.relkind IN ('r', 'p')
       ORDER BY relation.relname`,
      [...READER_SELECT_RELATIONS],
    );
    assert.deepEqual(
      existing.map((row) => String(row.relation_name)).sort(),
      [...READER_SELECT_RELATIONS].sort(),
      "One or more exact reader relations are missing.",
    );

    const selected = await cloneAdmin.$queryRawUnsafe(
      `SELECT relation.relname::text AS relation_name
       FROM pg_class AS relation
       JOIN pg_namespace AS namespace
         ON namespace.oid = relation.relnamespace
       WHERE namespace.nspname = 'public'
         AND relation.relkind IN ('r', 'p', 'v', 'm', 'f')
         AND has_table_privilege($1, relation.oid, 'SELECT')
       ORDER BY relation.relname`,
      readerRoleName,
    );
    assert.deepEqual(
      selected.map((row) => String(row.relation_name)).sort(),
      [...READER_TABLE_SELECT_RELATIONS].sort(),
      "The admission reader has missing or excessive table-level SELECT scope.",
    );

    const selectedUserColumns = await cloneAdmin.$queryRawUnsafe(
      `SELECT attribute_row.attname::text AS column_name
       FROM pg_class AS relation
       JOIN pg_namespace AS namespace
         ON namespace.oid = relation.relnamespace
       JOIN pg_attribute AS attribute_row
         ON attribute_row.attrelid = relation.oid
        AND attribute_row.attnum > 0
        AND NOT attribute_row.attisdropped
       WHERE namespace.nspname = 'public'
         AND relation.relname = 'User'
         AND has_column_privilege(
           $1,
           relation.oid,
           attribute_row.attname,
           'SELECT'
         )
       ORDER BY attribute_row.attname`,
      readerRoleName,
    );
    assert.deepEqual(
      selectedUserColumns.map((row) => String(row.column_name)).sort(),
      [...READER_COLUMN_SELECTS.User].sort(),
      "The admission reader has missing or excessive User column SELECT scope.",
    );

    const grantOptionRows = await cloneAdmin.$queryRawUnsafe(
      `SELECT
         (
           SELECT COUNT(*)
           FROM pg_class AS relation
           JOIN pg_namespace AS namespace
             ON namespace.oid = relation.relnamespace
           WHERE namespace.nspname = 'public'
             AND relation.relkind IN ('r', 'p', 'v', 'm', 'f')
             AND has_table_privilege(
               $1,
               relation.oid,
               'SELECT WITH GRANT OPTION'
             )
         )::text AS table_grant_option_count,
         (
           SELECT COUNT(*)
           FROM pg_class AS relation
           JOIN pg_namespace AS namespace
             ON namespace.oid = relation.relnamespace
           JOIN pg_attribute AS attribute_row
             ON attribute_row.attrelid = relation.oid
            AND attribute_row.attnum > 0
            AND NOT attribute_row.attisdropped
           WHERE namespace.nspname = 'public'
             AND has_column_privilege(
               $1,
               relation.oid,
               attribute_row.attname,
               'SELECT WITH GRANT OPTION'
             )
         )::text AS column_grant_option_count`,
      readerRoleName,
    );
    assert.equal(grantOptionRows.length, 1);
    assert.deepEqual(
      grantOptionRows[0],
      {
        table_grant_option_count: "0",
        column_grant_option_count: "0",
      },
      "The admission reader unexpectedly owns SELECT grant options.",
    );

    const forbidden = await cloneAdmin.$queryRawUnsafe(
      `SELECT relation.relname::text AS relation_name
       FROM pg_class AS relation
       JOIN pg_namespace AS namespace
         ON namespace.oid = relation.relnamespace
       WHERE namespace.nspname = 'public'
         AND relation.relkind IN ('r', 'p')
         AND relation.relname <> ALL($1::text[])
       ORDER BY relation.relname
       LIMIT 1`,
      [...READER_SELECT_RELATIONS],
    );
    assert.equal(
      forbidden.length,
      1,
      "The negative SELECT-scope check requires an ungranted public table.",
    );
    return String(forbidden[0].relation_name);
  } finally {
    await cloneAdmin.$disconnect();
  }
}

function postgresErrorCode(error) {
  const nested = error?.meta?.code;
  if (typeof nested === "string") {
    return nested;
  }
  return typeof error?.code === "string" ? error.code : "";
}

async function expectPermissionDenied(label, operation) {
  let caught;
  try {
    await operation();
  } catch (error) {
    caught = error;
  }
  assert(
    caught,
    `${label}: the least-privilege role was unexpectedly allowed.`,
  );
  assert.equal(
    postgresErrorCode(caught),
    POSTGRES_PERMISSION_DENIED,
    `${label}: rejection did not come from PostgreSQL privileges.`,
  );
}

async function assertReaderCannotWrite(readerUrl, forbiddenSelectRelation) {
  const reader = prismaClient(readerUrl);
  try {
    const state = await reader.$queryRawUnsafe(
      `SELECT
         current_setting('default_transaction_read_only') AS default_read_only,
         current_setting('transaction_read_only') AS transaction_read_only,
         has_table_privilege(
           current_user,
           'public."Tenant"',
           'SELECT'
         ) AS can_select,
         has_table_privilege(
           current_user,
           'public."Tenant"',
           'INSERT,UPDATE,DELETE,TRUNCATE'
         ) AS can_mutate,
         has_table_privilege(
           current_user,
           'public."User"',
           'SELECT'
         ) AS can_select_user_table,
         has_any_column_privilege(
           current_user,
           'public."User"',
           'SELECT'
         ) AS can_select_user_columns,
         has_column_privilege(
           current_user,
           'public."User"',
           'id',
           'SELECT'
         ) AS can_select_user_id,
         has_column_privilege(
           current_user,
           'public."User"',
           'email',
           'SELECT'
         ) AS can_select_user_email,
         has_column_privilege(
           current_user,
           'public."User"',
           'passwordHash',
           'SELECT'
         ) AS can_select_user_password_hash,
         has_database_privilege(
           current_user,
           current_database(),
           'CONNECT'
         ) AS can_connect,
         has_database_privilege(
           current_user,
           current_database(),
           'CREATE'
         ) AS can_create_database,
         has_database_privilege(
           current_user,
           current_database(),
           'TEMP'
         ) AS can_use_temporary,
         has_schema_privilege(
           current_user,
           'public',
           'USAGE'
         ) AS can_use_schema,
         has_schema_privilege(
           current_user,
           'public',
           'CREATE'
         ) AS can_create_schema_object`,
    );
    assert.equal(state.length, 1);
    assert.equal(state[0].default_read_only, "off");
    assert.equal(state[0].transaction_read_only, "off");
    assert.equal(state[0].can_select, true);
    assert.equal(state[0].can_mutate, false);
    assert.equal(state[0].can_select_user_table, false);
    assert.equal(state[0].can_select_user_columns, true);
    assert.equal(state[0].can_select_user_id, true);
    assert.equal(state[0].can_select_user_email, false);
    assert.equal(state[0].can_select_user_password_hash, false);
    assert.equal(state[0].can_connect, true);
    assert.equal(state[0].can_create_database, false);
    assert.equal(state[0].can_use_temporary, false);
    assert.equal(state[0].can_use_schema, true);
    assert.equal(state[0].can_create_schema_object, false);

    const allowedUserColumns = await reader.$queryRawUnsafe(
      `SELECT "id", "tenantId", "isPlatformAdmin", "isActive", "accessScope"
       FROM public."User"
       WHERE false`,
    );
    assert.deepEqual(allowedUserColumns, []);
    for (const forbiddenUserColumn of READER_FORBIDDEN_USER_COLUMNS) {
      await expectPermissionDenied(
        `User ${forbiddenUserColumn} SELECT privilege guard`,
        () =>
          reader.$queryRawUnsafe(
            `SELECT ${quoteIdentifier(
              forbiddenUserColumn,
            )} FROM public."User" WHERE false`,
          ),
      );
    }
    await expectPermissionDenied("User SELECT-star privilege guard", () =>
      reader.$queryRawUnsafe(`SELECT * FROM public."User" WHERE false`),
    );
    await expectPermissionDenied("excess SELECT privilege guard", () =>
      reader.$queryRawUnsafe(
        `SELECT 1 FROM public.${quoteIdentifier(
          forbiddenSelectRelation,
        )} LIMIT 1`,
      ),
    );
    await expectPermissionDenied("DML privilege guard", () =>
      reader.$executeRawUnsafe(
        `UPDATE public."Tenant" SET "name" = "name" WHERE false`,
      ),
    );
    await expectPermissionDenied("DDL privilege guard", () =>
      reader.$executeRawUnsafe(
        `CREATE TABLE public.lp_snapshot_admission_forbidden (id integer)`,
      ),
    );

    const triggerRows = await reader.$queryRawUnsafe(
      `SELECT trigger_row.tgname::text AS trigger_name,
              trigger_row.tgenabled::text AS trigger_enabled
       FROM pg_trigger AS trigger_row
       JOIN pg_constraint AS constraint_row
         ON constraint_row.oid = trigger_row.tgconstraint
       WHERE trigger_row.tgrelid = 'public."StaffTask"'::regclass
         AND trigger_row.tgisinternal
         AND constraint_row.contype = 'f'
       ORDER BY trigger_row.tgname
       LIMIT 1`,
    );
    assert.equal(
      triggerRows.length,
      1,
      "The internal FK-trigger guard requires one StaffTask FK trigger.",
    );
    const triggerName = String(triggerRows[0].trigger_name);
    assert.equal(triggerRows[0].trigger_enabled, "O");
    await expectPermissionDenied("internal FK trigger-disable guard", () =>
      reader.$executeRawUnsafe(
        `ALTER TABLE public."StaffTask" DISABLE TRIGGER ${quoteIdentifier(
          triggerName,
        )}`,
      ),
    );
    const triggerAfter = await reader.$queryRawUnsafe(
      `SELECT trigger_row.tgenabled::text AS trigger_enabled
       FROM pg_trigger AS trigger_row
       WHERE trigger_row.tgrelid = 'public."StaffTask"'::regclass
         AND trigger_row.tgname = $1`,
      triggerName,
    );
    assert.equal(triggerAfter.length, 1);
    assert.equal(
      triggerAfter[0].trigger_enabled,
      "O",
      "The rejected reader operation changed the internal FK trigger state.",
    );
  } finally {
    await reader.$disconnect();
  }
}

async function injectSyntheticLegacyFixtures(cloneDatabaseUrl) {
  const suffix = randomBytes(6).toString("hex");
  const canaries = {
    userEmail: `snapshot-admission-user-${suffix}@example.invalid`,
    passwordHash: `synthetic-not-a-credential-${suffix}`,
    tenantAName: `Synthetic admission tenant A ${suffix}`,
    tenantBName: `Synthetic admission tenant B ${suffix}`,
    storeBName: `Synthetic admission store B ${suffix}`,
    templateCreatorTitle: `Synthetic template creator proposal ${suffix}`,
    templateBTitle: `Synthetic tenant B template ${suffix}`,
    ruleTemplateTitle: `Synthetic rule template proposal ${suffix}`,
    ruleCreatorTitle: `Synthetic rule creator proposal ${suffix}`,
    ruleLastTaskTitle: `Synthetic rule last-task overlap proposal ${suffix}`,
    ruleBTitle: `Synthetic tenant B rule ${suffix}`,
  };
  const fixtureIds = {
    tenantA: randomUUID(),
    tenantB: randomUUID(),
    storeB: randomUUID(),
    userB: randomUUID(),
    templates: {
      creatorCrossTenant: randomUUID(),
      tenantB: randomUUID(),
    },
    rules: {
      templateCrossTenant: randomUUID(),
      creatorCrossTenant: randomUUID(),
      lastTaskOverlap: randomUUID(),
      tenantB: randomUUID(),
    },
    tasks: {
      storeCrossTenant: [randomUUID(), randomUUID()],
      templateCrossTenant: randomUUID(),
      ruleCrossTenant: randomUUID(),
      creatorCrossTenant: randomUUID(),
      lastTaskOverlap: randomUUID(),
    },
  };
  fixtureIds.protectedIds = Object.freeze([
    fixtureIds.tenantA,
    fixtureIds.tenantB,
    fixtureIds.storeB,
    fixtureIds.userB,
    ...Object.values(fixtureIds.templates),
    ...Object.values(fixtureIds.rules),
    ...fixtureIds.tasks.storeCrossTenant,
    fixtureIds.tasks.templateCrossTenant,
    fixtureIds.tasks.ruleCrossTenant,
    fixtureIds.tasks.creatorCrossTenant,
    fixtureIds.tasks.lastTaskOverlap,
  ]);
  fixtureIds.canaries = Object.freeze([
    ...Object.values(canaries),
    `snapshot-admission-a-${suffix}`,
    `snapshot-admission-b-${suffix}`,
    ...fixtureIds.tasks.storeCrossTenant.map(
      (_taskId, index) =>
        `Synthetic cross-tenant store task ${index + 1} ${suffix}`,
    ),
    `Synthetic task template proposal ${suffix}`,
    `Synthetic task rule proposal ${suffix}`,
    `Synthetic task creator proposal ${suffix}`,
    `Synthetic last-task overlap target ${suffix}`,
  ]);
  const now = new Date();
  const cloneAdmin = prismaClient(cloneDatabaseUrl);
  try {
    await cloneAdmin.$transaction(
      async (transaction) => {
        await transaction.$executeRawUnsafe(
          "SET LOCAL session_replication_role = replica",
        );
        await transaction.$executeRaw`
          INSERT INTO public."Tenant" (
            "id", "name", "slug", "status", "createdAt", "updatedAt"
          )
          VALUES (
            ${fixtureIds.tenantA},
            ${canaries.tenantAName},
            ${`snapshot-admission-a-${suffix}`},
            'ACTIVE',
            ${now},
            ${now}
          )
        `;
        await transaction.$executeRaw`
          INSERT INTO public."Tenant" (
            "id", "name", "slug", "status", "createdAt", "updatedAt"
          )
          VALUES (
            ${fixtureIds.tenantB},
            ${canaries.tenantBName},
            ${`snapshot-admission-b-${suffix}`},
            'ACTIVE',
            ${now},
            ${now}
          )
        `;
        await transaction.$executeRaw`
          INSERT INTO public."Store" (
            "id", "tenantId", "name", "timeZone", "isActive",
            "createdAt", "updatedAt"
          )
          VALUES (
            ${fixtureIds.storeB},
            ${fixtureIds.tenantB},
            ${canaries.storeBName},
            'UTC',
            true,
            ${now},
            ${now}
          )
        `;
        await transaction.$executeRaw`
          INSERT INTO public."User" (
            "id", "tenantId", "email", "passwordHash", "role",
            "accessScope", "isActive", "isPlatformAdmin",
            "createdAt", "updatedAt"
          )
          VALUES (
            ${fixtureIds.userB},
            ${fixtureIds.tenantB},
            ${canaries.userEmail},
            ${canaries.passwordHash},
            'OWNER',
            'NETWORK',
            true,
            false,
            ${now},
            ${now}
          )
        `;
        await transaction.$executeRaw`
          INSERT INTO public."StaffTaskTemplate" (
            "id", "tenantId", "createdByUserId", "title", "type",
            "priority", "status", "createdAt", "updatedAt"
          )
          VALUES (
            ${fixtureIds.templates.creatorCrossTenant},
            ${fixtureIds.tenantA},
            ${fixtureIds.userB},
            ${canaries.templateCreatorTitle},
            'SHIFT',
            'NORMAL',
            'DRAFT',
            ${now},
            ${now}
          )
        `;
        await transaction.$executeRaw`
          INSERT INTO public."StaffTaskTemplate" (
            "id", "tenantId", "title", "type", "priority", "status",
            "createdAt", "updatedAt"
          )
          VALUES (
            ${fixtureIds.templates.tenantB},
            ${fixtureIds.tenantB},
            ${canaries.templateBTitle},
            'SHIFT',
            'NORMAL',
            'DRAFT',
            ${now},
            ${now}
          )
        `;
        await transaction.$executeRaw`
          INSERT INTO public."StaffTaskRecurringRule" (
            "id", "tenantId", "templateId", "title", "cadence", "status",
            "taskType", "priority", "createdAt", "updatedAt"
          )
          VALUES (
            ${fixtureIds.rules.templateCrossTenant},
            ${fixtureIds.tenantA},
            ${fixtureIds.templates.tenantB},
            ${canaries.ruleTemplateTitle},
            'DAILY',
            'PAUSED',
            'RECURRING',
            'NORMAL',
            ${now},
            ${now}
          )
        `;
        await transaction.$executeRaw`
          INSERT INTO public."StaffTaskRecurringRule" (
            "id", "tenantId", "createdByUserId", "title", "cadence",
            "status", "taskType", "priority", "createdAt", "updatedAt"
          )
          VALUES (
            ${fixtureIds.rules.creatorCrossTenant},
            ${fixtureIds.tenantA},
            ${fixtureIds.userB},
            ${canaries.ruleCreatorTitle},
            'DAILY',
            'PAUSED',
            'RECURRING',
            'NORMAL',
            ${now},
            ${now}
          )
        `;
        await transaction.$executeRaw`
          INSERT INTO public."StaffTaskRecurringRule" (
            "id", "tenantId", "lastCreatedTaskId", "title", "cadence",
            "status", "taskType", "priority", "createdAt", "updatedAt"
          )
          VALUES (
            ${fixtureIds.rules.lastTaskOverlap},
            ${fixtureIds.tenantA},
            ${fixtureIds.tasks.lastTaskOverlap},
            ${canaries.ruleLastTaskTitle},
            'DAILY',
            'PAUSED',
            'RECURRING',
            'NORMAL',
            ${now},
            ${now}
          )
        `;
        await transaction.$executeRaw`
          INSERT INTO public."StaffTaskRecurringRule" (
            "id", "tenantId", "title", "cadence", "status", "taskType",
            "priority", "createdAt", "updatedAt"
          )
          VALUES (
            ${fixtureIds.rules.tenantB},
            ${fixtureIds.tenantB},
            ${canaries.ruleBTitle},
            'DAILY',
            'PAUSED',
            'RECURRING',
            'NORMAL',
            ${now},
            ${now}
          )
        `;
        for (
          let index = 0;
          index < fixtureIds.tasks.storeCrossTenant.length;
          index += 1
        ) {
          await transaction.$executeRaw`
            INSERT INTO public."StaffTask" (
              "id", "tenantId", "storeId", "title", "type", "status",
              "priority", "createdAt", "updatedAt"
            )
            VALUES (
              ${fixtureIds.tasks.storeCrossTenant[index]},
              ${fixtureIds.tenantA},
              ${fixtureIds.storeB},
              ${`Synthetic cross-tenant store task ${index + 1} ${suffix}`},
              'ONE_TIME',
              'OPEN',
              'NORMAL',
              ${now},
              ${now}
            )
          `;
        }
        await transaction.$executeRaw`
          INSERT INTO public."StaffTask" (
            "id", "tenantId", "sourceTemplateId", "title", "type", "status",
            "priority", "createdAt", "updatedAt"
          )
          VALUES (
            ${fixtureIds.tasks.templateCrossTenant},
            ${fixtureIds.tenantA},
            ${fixtureIds.templates.tenantB},
            ${`Synthetic task template proposal ${suffix}`},
            'ONE_TIME',
            'OPEN',
            'NORMAL',
            ${now},
            ${now}
          )
        `;
        await transaction.$executeRaw`
          INSERT INTO public."StaffTask" (
            "id", "tenantId", "sourceRecurringRuleId", "title", "type",
            "status", "priority", "createdAt", "updatedAt"
          )
          VALUES (
            ${fixtureIds.tasks.ruleCrossTenant},
            ${fixtureIds.tenantA},
            ${fixtureIds.rules.tenantB},
            ${`Synthetic task rule proposal ${suffix}`},
            'ONE_TIME',
            'OPEN',
            'NORMAL',
            ${now},
            ${now}
          )
        `;
        await transaction.$executeRaw`
          INSERT INTO public."StaffTask" (
            "id", "tenantId", "createdByUserId", "title", "type", "status",
            "priority", "createdAt", "updatedAt"
          )
          VALUES (
            ${fixtureIds.tasks.creatorCrossTenant},
            ${fixtureIds.tenantA},
            ${fixtureIds.userB},
            ${`Synthetic task creator proposal ${suffix}`},
            'ONE_TIME',
            'OPEN',
            'NORMAL',
            ${now},
            ${now}
          )
        `;
        await transaction.$executeRaw`
          INSERT INTO public."StaffTask" (
            "id", "tenantId", "title", "type", "status", "priority",
            "createdAt", "updatedAt"
          )
          VALUES (
            ${fixtureIds.tasks.lastTaskOverlap},
            ${fixtureIds.tenantB},
            ${`Synthetic last-task overlap target ${suffix}`},
            'ONE_TIME',
            'OPEN',
            'NORMAL',
            ${now},
            ${now}
          )
        `;
        await transaction.$executeRawUnsafe(
          "SET LOCAL session_replication_role = origin",
        );
      },
      { isolationLevel: "Serializable", timeout: 30_000, maxWait: 5_000 },
    );

    const rows = await cloneAdmin.$queryRawUnsafe(
      `SELECT COUNT(*)::text AS count
       FROM public."StaffTask" AS task
       JOIN public."Store" AS store ON store."id" = task."storeId"
       WHERE task."id" IN ($1, $2)
         AND task."tenantId" <> store."tenantId"`,
      fixtureIds.tasks.storeCrossTenant[0],
      fixtureIds.tasks.storeCrossTenant[1],
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].count, "2");
    return fixtureIds;
  } finally {
    await cloneAdmin.$disconnect();
  }
}

function withoutAdmissionVariables(environment) {
  return Object.fromEntries(
    Object.entries(environment).filter(
      ([key]) => !key.startsWith(ADMISSION_ENV_PREFIX),
    ),
  );
}

function admissionEnvironment({
  environment,
  readerUrl,
  cloneDatabaseName,
  runConfirmation,
  isolationAttestation,
  acquiredAt,
  restoredAt,
  expiresAt,
  snapshotDigest,
  expectedState,
  overrides = {},
}) {
  return {
    ...withoutAdmissionVariables(environment),
    NODE_ENV: "test",
    DATABASE_URL: readerUrl,
    RELEASE_SHA: environment.RELEASE_SHA,
    [`${ADMISSION_ENV_PREFIX}CONFIRM`]: runConfirmation,
    [`${ADMISSION_ENV_PREFIX}ISOLATION_ATTESTATION`]: isolationAttestation,
    [`${ADMISSION_ENV_PREFIX}CLASSIFICATION`]: SNAPSHOT_CLASSIFICATION,
    [`${ADMISSION_ENV_PREFIX}EXPECTED_STATE`]: expectedState,
    [`${ADMISSION_ENV_PREFIX}EXPECTED_DATABASE`]: cloneDatabaseName,
    [`${ADMISSION_ENV_PREFIX}HMAC_KEY`]: HMAC_KEY,
    [`${ADMISSION_ENV_PREFIX}SNAPSHOT_DIGEST`]: snapshotDigest,
    [`${ADMISSION_ENV_PREFIX}APPROVAL_REFERENCE`]: APPROVAL_REFERENCE,
    [`${ADMISSION_ENV_PREFIX}ACQUIRED_AT`]: acquiredAt,
    [`${ADMISSION_ENV_PREFIX}RESTORED_AT`]: restoredAt,
    [`${ADMISSION_ENV_PREFIX}EXPIRES_AT`]: expiresAt,
    ...overrides,
  };
}

function plannerEnvironment({
  environment,
  readerUrl,
  cloneDatabaseName,
  runConfirmation,
  maxCandidates,
}) {
  return {
    ...withoutAdmissionVariables(environment),
    NODE_ENV: "test",
    DATABASE_URL: readerUrl,
    RELEASE_SHA: environment.RELEASE_SHA,
    STAFF_TASK_INTEGRITY_RECONCILIATION_TARGET: "development",
    STAFF_TASK_INTEGRITY_RECONCILIATION_CONFIRM: runConfirmation,
    STAFF_TASK_INTEGRITY_RECONCILIATION_HMAC_KEY: HMAC_KEY,
    STAFF_TASK_INTEGRITY_RECONCILIATION_EXPECTED_DATABASE: cloneDatabaseName,
    STAFF_TASK_INTEGRITY_RECONCILIATION_MAX_CANDIDATES: String(maxCandidates),
  };
}

function proposalDryRunEnvironment({
  admission,
  readerUrl,
  runConfirmation,
  provenanceManifest,
  maxCases,
}) {
  return {
    ...admission,
    DATABASE_URL: proposalDryRunDatabaseUrl(readerUrl),
    STAFF_TASK_INTEGRITY_RECONCILIATION_DRY_RUN_CONFIRM: runConfirmation,
    STAFF_TASK_INTEGRITY_RECONCILIATION_DRY_RUN_HMAC_KEY:
      PROPOSAL_DRY_RUN_HMAC_KEY,
    STAFF_TASK_INTEGRITY_RECONCILIATION_DRY_RUN_PROVENANCE_HMAC_KEY:
      PROVENANCE_HMAC_KEY,
    STAFF_TASK_INTEGRITY_RECONCILIATION_DRY_RUN_PROVENANCE_MANIFEST:
      provenanceManifest,
    STAFF_TASK_INTEGRITY_RECONCILIATION_DRY_RUN_MAX_CASES: String(maxCases),
  };
}

function parseChildJson(result, label) {
  const stdout = String(result.stdout ?? "").trim();
  const stderr = String(result.stderr ?? "").trim();
  const candidate = stdout || stderr;
  assert(candidate, `${label} returned no JSON evidence.`);
  let report;
  try {
    report = JSON.parse(candidate);
  } catch {
    assert.fail(`${label} returned non-JSON output.`);
  }
  return { report, stdout, stderr, serialized: `${stdout}\n${stderr}` };
}

function findFirstField(value, fieldNames) {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  for (const fieldName of fieldNames) {
    if (Object.hasOwn(value, fieldName)) {
      return value[fieldName];
    }
  }
  for (const child of Object.values(value)) {
    const found = findFirstField(child, fieldNames);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

function reportedPlannerExitCode(report, processExitCode) {
  const explicit = findFirstField(report, [
    "plannerExitCode",
    "planner_exit_code",
    "reconciliationPlannerExitCode",
  ]);
  if (Number.isInteger(explicit)) {
    return explicit;
  }
  const decision = findFirstField(report, ["plannerDecision", "decision"]);
  if (decision === "FINDINGS") {
    return 2;
  }
  if (decision === "CAP_EXCEEDED" || decision === "SCHEMA_MISMATCH") {
    return 3;
  }
  if (decision === "PASS" || decision === "REVIEW") {
    return 0;
  }
  return processExitCode;
}

function evidenceDigest(report, name) {
  const value = findFirstField(report, [name]);
  assert.match(
    String(value ?? ""),
    /^[0-9a-f]{64}$/,
    `Admission report is missing ${name}.`,
  );
  return String(value);
}

function assertAdmissionShape(report, expectedState) {
  assert.equal(report?.reportSchemaVersion, 2);
  const classification = findFirstField(report, [
    "classification",
    "snapshotClassification",
  ]);
  assert.equal(String(classification).toUpperCase(), SNAPSHOT_CLASSIFICATION);
  assert.equal(
    findFirstField(report, ["expectedState", "expectedSnapshotState"]),
    expectedState,
  );
  assert.equal(report?.database?.databaseNameMatched, true);
  assert.equal(report?.database?.snapshotNotExpiredAtGeneration, true);
  assert.equal(report?.database?.databaseIdentityDigestMatched, true);
  assert.equal(report?.database?.productionLikeAuthorityVerified, false);
  assert.equal(
    report?.database?.productionLikeAuthorityDatabaseMarkerMatched,
    false,
  );
  assert.equal(
    report?.safety?.independentProductionLikeAuthorityRequired,
    true,
  );
}

function assertOutputSafe(
  serialized,
  {
    sourceDatabaseName,
    cloneDatabaseName,
    readerRoleName,
    readerPassword,
    fixtureIds = null,
    protectedValues = [],
  },
) {
  const forbiddenValues = [
    sourceDatabaseName,
    cloneDatabaseName,
    readerRoleName,
    readerPassword,
    ...protectedValues,
    ...(fixtureIds ? [...fixtureIds.protectedIds, ...fixtureIds.canaries] : []),
  ].filter((value) => typeof value === "string" && value.length > 0);
  for (const forbidden of forbiddenValues) {
    assert.equal(
      serialized.includes(forbidden),
      false,
      "Admission output serialized a protected identity or credential.",
    );
  }
  assert.doesNotMatch(serialized, /postgres(?:ql)?:\/\//i);
  assert.doesNotMatch(
    serialized,
    /"(?:databaseUrl|databaseName|roleName|password|credentials?)"\s*:/i,
  );
  assert.doesNotMatch(
    serialized,
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
  );
  assert.equal(serialized.includes(HMAC_KEY), false);
  assert.equal(serialized.includes(PROPOSAL_DRY_RUN_HMAC_KEY), false);
  assert.equal(serialized.includes(PROVENANCE_HMAC_KEY), false);
}

async function installSyntheticProvenance({
  cloneDatabaseUrl,
  cloneDatabaseName,
  releaseSha,
  dryRunModule,
  plannerModule,
}) {
  const cloneAdmin = prismaClient(cloneDatabaseUrl);
  try {
    const snapshotRows = await cloneAdmin.$queryRawUnsafe(
      plannerModule.SNAPSHOT_STATE_SQL,
    );
    assert.equal(
      snapshotRows.length,
      1,
      "Synthetic provenance requires one database identity row.",
    );
    const databaseIdentityDigest = plannerModule.computeDatabaseIdentityDigest(
      snapshotRows[0],
      PROVENANCE_HMAC_KEY,
    );
    const creationNonce = randomBytes(32).toString("hex");
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(
      Date.parse(createdAt) + 60 * 60 * 1000,
    ).toISOString();
    const manifest = dryRunModule.buildSyntheticProvenanceManifest(
      {
        releaseSha,
        databaseIdentityDigest,
        creationNonce,
        createdAt,
        expiresAt,
      },
      PROVENANCE_HMAC_KEY,
    );
    const encodedManifest =
      dryRunModule.encodeSyntheticProvenanceManifest(manifest);
    const databaseMarker =
      dryRunModule.syntheticProvenanceDatabaseMarker(creationNonce);
    assert.match(
      databaseMarker,
      /^LEETPLUS_SYNTHETIC_PROVENANCE_V1:[0-9a-f]{64}$/,
    );
    await cloneAdmin.$executeRawUnsafe(
      `COMMENT ON DATABASE ${quoteIdentifier(
        cloneDatabaseName,
      )} IS '${databaseMarker}'`,
    );
    const markerRows = await cloneAdmin.$queryRawUnsafe(
      `SELECT pg_catalog.shobj_description(
         database_row.oid,
         'pg_database'
       )::text AS database_comment
       FROM pg_catalog.pg_database AS database_row
       WHERE database_row.datname = pg_catalog.current_database()`,
    );
    assert.equal(markerRows.length, 1);
    assert.equal(
      markerRows[0].database_comment,
      databaseMarker,
      "The disposable database did not retain its synthetic marker.",
    );
    return {
      encodedManifest,
      creationNonce,
      databaseMarker,
      databaseIdentityDigest,
    };
  } finally {
    await cloneAdmin.$disconnect();
  }
}

function spawnAdmission(childEnvironment) {
  const result = spawnSync(process.execPath, [ADMISSION_SCRIPT_PATH], {
    cwd: dirname(ADMISSION_SCRIPT_PATH),
    env: childEnvironment,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
    timeout: ADMISSION_TIMEOUT_MS,
    windowsHide: true,
  });
  if (result.error) {
    throw result.error;
  }
  assert.equal(
    result.signal,
    null,
    "Admission CLI was terminated by a signal.",
  );
  const parsed = parseChildJson(result, "Admission CLI");
  return {
    ...parsed,
    exitCode: result.status,
  };
}

function spawnPlanner(childEnvironment) {
  const result = spawnSync(process.execPath, [PLANNER_SCRIPT_PATH], {
    cwd: dirname(PLANNER_SCRIPT_PATH),
    env: childEnvironment,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
    timeout: ADMISSION_TIMEOUT_MS,
    windowsHide: true,
  });
  if (result.error) {
    throw result.error;
  }
  assert.equal(result.signal, null, "Planner CLI was terminated by a signal.");
  const parsed = parseChildJson(result, "Planner CLI");
  return {
    ...parsed,
    exitCode: result.status,
    plannerExitCode: reportedPlannerExitCode(parsed.report, result.status),
  };
}

function spawnProposalDryRun(childEnvironment) {
  const result = spawnSync(process.execPath, [PROPOSAL_DRY_RUN_SCRIPT_PATH], {
    cwd: dirname(PROPOSAL_DRY_RUN_SCRIPT_PATH),
    env: childEnvironment,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    timeout: ADMISSION_TIMEOUT_MS,
    windowsHide: true,
  });
  if (result.error) {
    throw result.error;
  }
  assert.equal(
    result.signal,
    null,
    "Proposal dry-run CLI was terminated by a signal.",
  );
  const parsed = parseChildJson(result, "Proposal dry-run CLI");
  return {
    ...parsed,
    exitCode: result.status,
  };
}

function assertProposalDryRunFindings(report) {
  assert.equal(report?.summary?.capExceeded, false);
  assert.equal(
    report?.summary?.proposalOccurrences,
    EXPECTED_PROPOSAL_OCCURRENCES,
  );
  assert.equal(
    report?.summary?.uniqueProposalCases,
    EXPECTED_PROPOSAL_CASES.length,
  );
  assert.equal(
    report?.summary?.operatorOccurrences,
    EXPECTED_OPERATOR_OCCURRENCES,
  );
  assert.equal(report?.summary?.reviewOccurrences, EXPECTED_REVIEW_OCCURRENCES);
  assert.equal(
    report?.summary?.blockingTotal,
    EXPECTED_PROPOSAL_OCCURRENCES + EXPECTED_OPERATOR_OCCURRENCES,
  );
  assert.equal(
    report?.summary?.observedOccurrences,
    EXPECTED_PROPOSAL_OCCURRENCES +
      EXPECTED_OPERATOR_OCCURRENCES +
      EXPECTED_REVIEW_OCCURRENCES,
  );
  assert.equal(
    report?.provenanceBinding?.profile,
    "STAFF_TASK_INTEGRITY_DISPOSABLE_V1",
  );
  assert.match(
    String(report?.provenanceBinding?.fixtureContractDigest ?? ""),
    /^[0-9a-f]{64}$/,
  );
  assert.match(
    String(report?.provenanceBinding?.bindingDigest ?? ""),
    /^[0-9a-f]{64}$/,
  );
  assert.equal(report?.safety?.databaseWrites, false);
  assert.equal(report?.safety?.applySupported, false);
  assert.equal(report?.safety?.outputContainsRawIdentifiers, false);
  assert.equal(report?.safety?.suggestionsAuthorizeApply, false);
  assert.equal(report?.safety?.caseTokensLinkableAcrossExecutions, false);
  assert.equal(
    report?.safety?.coLocatedFindingsRequireFullInvariantReview,
    true,
  );
  assert.equal(report?.safety?.operatorCodesProposed, false);
  assert.equal(report?.safety?.reviewCodesProposed, false);
  assert.equal(Array.isArray(report?.cases), true);
  assert.equal(report.cases.length, EXPECTED_PROPOSAL_CASES.length);

  const positiveFindingCounts = Object.fromEntries(
    report.findings
      .filter((finding) => finding.count > 0)
      .map((finding) => [finding.code, finding.count])
      .sort(([left], [right]) => left.localeCompare(right)),
  );
  const expectedPositiveFindingCounts = Object.fromEntries(
    Object.entries(EXPECTED_POSITIVE_FINDING_COUNTS).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
  assert.deepEqual(
    positiveFindingCounts,
    expectedPositiveFindingCounts,
    "The real PostgreSQL aggregate fixture matrix changed.",
  );

  const caseDescriptors = report.cases
    .map((proposalCase) => {
      assert.deepEqual(Object.keys(proposalCase).sort(), [
        "caseToken",
        "preconditionDigest",
        "suggestion",
        "target",
      ]);
      assert.deepEqual(Object.keys(proposalCase.target).sort(), [
        "column",
        "resourceType",
      ]);
      assert.deepEqual(Object.keys(proposalCase.suggestion).sort(), [
        "fullInvariantRecheckRequired",
        "kind",
        "ownerApprovalRequired",
        "reasonCodes",
      ]);
      assert.match(String(proposalCase?.caseToken ?? ""), /^[0-9a-f]{64}$/);
      assert.match(
        String(proposalCase?.preconditionDigest ?? ""),
        /^[0-9a-f]{64}$/,
      );
      assert.deepEqual(
        {
          kind: proposalCase?.suggestion?.kind,
          ownerApprovalRequired:
            proposalCase?.suggestion?.ownerApprovalRequired,
          fullInvariantRecheckRequired:
            proposalCase?.suggestion?.fullInvariantRecheckRequired,
        },
        {
          kind: "REFERENCE_CLEAR_CANDIDATE",
          ownerApprovalRequired: true,
          fullInvariantRecheckRequired: true,
        },
      );
      return {
        resourceType: proposalCase?.target?.resourceType,
        column: proposalCase?.target?.column,
        reasonCodes: proposalCase?.suggestion?.reasonCodes,
      };
    })
    .sort((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right)),
    );
  const expectedCaseDescriptors = EXPECTED_PROPOSAL_CASES.map(
    ({ resourceType, column, reasonCodes }) => ({
      resourceType,
      column,
      reasonCodes: [...reasonCodes],
    }),
  ).sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right)),
  );
  assert.deepEqual(
    caseDescriptors,
    expectedCaseDescriptors,
    "The real PostgreSQL proposal cases or coalesced reason sets changed.",
  );

  const aggregateProposalOccurrences = Object.keys(
    EXPECTED_PROPOSAL_COUNTS,
  ).reduce((total, code) => total + positiveFindingCounts[code], 0);
  const rowReasonOccurrences = caseDescriptors.reduce(
    (total, descriptor) => total + descriptor.reasonCodes.length,
    0,
  );
  assert.equal(aggregateProposalOccurrences, EXPECTED_PROPOSAL_OCCURRENCES);
  assert.equal(
    rowReasonOccurrences,
    aggregateProposalOccurrences,
    "Coalesced row-level reason occurrences diverged from aggregate counts.",
  );
}

function proposalCasesByDescriptor(report) {
  const casesByDescriptor = new Map();
  for (const proposalCase of report.cases) {
    const descriptor = JSON.stringify({
      target: proposalCase.target,
      suggestion: proposalCase.suggestion,
    });
    assert.equal(
      casesByDescriptor.has(descriptor),
      false,
      "The dry-run emitted duplicate stable proposal descriptors.",
    );
    casesByDescriptor.set(descriptor, proposalCase);
  }
  return casesByDescriptor;
}

function assertProposalDryRunRejection(result, expectedCode) {
  assert.equal(result.exitCode, 3);
  assert.equal(
    findFirstField(result.report, ["code"]),
    expectedCode,
    `Proposal dry-run did not reject with ${expectedCode}.`,
  );
}

async function withTemplateRlsEnabled(cloneDatabaseUrl, operation) {
  const cloneAdmin = prismaClient(cloneDatabaseUrl);
  try {
    await cloneAdmin.$executeRawUnsafe(
      `ALTER TABLE public."StaffTaskTemplate" ENABLE ROW LEVEL SECURITY`,
    );
    return await operation();
  } finally {
    await cloneAdmin
      .$executeRawUnsafe(
        `ALTER TABLE public."StaffTaskTemplate" DISABLE ROW LEVEL SECURITY`,
      )
      .finally(() => cloneAdmin.$disconnect());
  }
}

async function holdProposalDryRunAdvisoryLock(
  cloneDatabaseUrl,
  namespace,
  resource,
) {
  assert(Number.isInteger(namespace));
  assert(Number.isInteger(resource));
  const blocker = prismaClient(cloneDatabaseUrl);
  try {
    const rows = await blocker.$queryRawUnsafe(
      `SELECT pg_try_advisory_lock($1::integer, $2::integer) AS acquired`,
      namespace,
      resource,
    );
    assert.equal(rows.length, 1);
    assert.equal(
      rows[0].acquired,
      true,
      "The smoke could not acquire the proposal dry-run blocker lock.",
    );
    return async () => {
      try {
        const released = await blocker.$queryRawUnsafe(
          `SELECT pg_advisory_unlock($1::integer, $2::integer) AS released`,
          namespace,
          resource,
        );
        assert.equal(released.length, 1);
        assert.equal(
          released[0].released,
          true,
          "The smoke lost the proposal dry-run blocker lock.",
        );
      } finally {
        await blocker.$disconnect();
      }
    };
  } catch (error) {
    await blocker.$disconnect();
    throw error;
  }
}

async function tamperLatestMigration(cloneDatabaseUrl) {
  const cloneAdmin = prismaClient(cloneDatabaseUrl);
  try {
    const changed = await cloneAdmin.$executeRawUnsafe(
      `UPDATE public."_prisma_migrations"
       SET "finished_at" = NULL
       WHERE "migration_name" = '20260727131000_staff_task_integrity_expand'
         AND "finished_at" IS NOT NULL
         AND "rolled_back_at" IS NULL`,
    );
    assert.equal(changed, 1, "The expected EXPAND migration was not tampered.");
  } finally {
    await cloneAdmin.$disconnect();
  }
}

function assertSourceGuards() {
  const source = readFileSync(fileURLToPath(import.meta.url), "utf8");
  assert.match(
    source,
    /DROP DATABASE IF EXISTS \$\{quotedClone\} WITH \(FORCE\)/,
  );
  assert.doesNotMatch(source, /DROP DATABASE IF EXISTS \$\{quotedSource\}/);
  assert.match(source, /SET LOCAL session_replication_role = replica/);
  assert.match(source, /SET LOCAL session_replication_role = origin/);
  assert.match(source, /CREATE DATABASE \$\{quotedClone\} TEMPLATE template0/);
  assert.doesNotMatch(source, /TEMPLATE \$\{quotedSource\}/);
  assert.equal(
    source.includes(["GRANT SELECT ON", "ALL TABLES"].join(" ")),
    false,
  );
  assert.match(
    source,
    /GRANT SELECT ON TABLE \$\{exactTableSelectRelations\} TO \$\{quotedRole\}/,
  );
  assert.match(
    source,
    /GRANT SELECT \(\$\{exactUserSelectColumns\}\)\s+ON TABLE public\."User" TO \$\{quotedRole\}/,
  );
  assert.equal(
    source.includes(
      ["REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public", "FROM PUBLIC"].join(
        " ",
      ),
    ),
    true,
  );
  assert.match(
    source,
    /REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM \$\{quotedRole\}/,
  );
  assert.match(
    source,
    /REVOKE CONNECT ON DATABASE \$\{quoteCatalogDatabaseIdentifier\(/,
  );
  assert.match(
    source,
    /GRANT CONNECT ON DATABASE \$\{quoteCatalogDatabaseIdentifier\(/,
  );
  assert.match(source, /\["show", `\$\{releaseSha\}:\$\{releasePath\}`\]/);
  assert.doesNotMatch(source, /await cp\(/);
  assert.match(source, /pg_try_advisory_lock/);
  assert.match(source, /pg_advisory_unlock/);
  assert.match(source, /DISABLE TRIGGER \$\{quoteIdentifier\(/);
  assert.equal(
    basename(ADMISSION_SCRIPT_PATH),
    "staff-task-integrity-snapshot-admission.mjs",
  );
  assert.equal(
    basename(PLANNER_SCRIPT_PATH),
    "staff-task-integrity-reconciliation-plan.mjs",
  );
  assert.equal(
    basename(PROPOSAL_DRY_RUN_SCRIPT_PATH),
    "staff-task-integrity-reconciliation-proposal-dry-run.mjs",
  );
}

export async function runSelfTest() {
  assert.deepEqual(parseArguments(["--apply", "--help"]), {
    help: true,
    selfTest: false,
  });
  assert.deepEqual(parseArguments(["--self-test"]), {
    help: false,
    selfTest: true,
  });
  assert.throws(() => parseArguments(["--apply"]), {
    code: "CLI_ARGUMENT_UNSUPPORTED",
  });
  assert.equal(
    parseSourceDatabaseUrl(
      "postgresql://postgres:test@127.0.0.1:5432/leetplus_ci?schema=public",
    ).databaseName,
    "leetplus_ci",
  );
  assert.throws(
    () =>
      parseSourceDatabaseUrl(
        "postgresql://postgres:test@database.example/leetplus_ci?schema=public",
      ),
    { code: "LOCAL_POSTGRES_REQUIRED" },
  );
  assert.throws(
    () =>
      parseSourceDatabaseUrl(
        "postgresql://postgres:test@127.0.0.1/leetplus?schema=public",
      ),
    { code: "SAFE_CI_TEST_SOURCE_DATABASE_REQUIRED" },
  );
  assert.throws(
    () =>
      parseSourceDatabaseUrl(
        "postgresql://postgres:test@127.0.0.1/leetplus_ci?schema=shadow",
      ),
    { code: "PUBLIC_SCHEMA_REQUIRED" },
  );
  assert.throws(() => quoteIdentifier('unsafe"name'), {
    code: "DATABASE_IDENTIFIER_INVALID",
  });
  assert.equal(
    quoteCatalogDatabaseIdentifier("safe-ci-database"),
    '"safe-ci-database"',
  );
  assert.equal(quoteCatalogDatabaseIdentifier('safe"quoted'), '"safe""quoted"');
  assert.throws(() => quoteCatalogDatabaseIdentifier("unsafe\0database"));
  assert.throws(() => quoteCatalogDatabaseIdentifier("x".repeat(64)));
  assert.doesNotThrow(() => assertSafePublicConnectMutationTarget("postgres"));
  assert.doesNotThrow(() =>
    assertSafePublicConnectMutationTarget("another-ci-database"),
  );
  assert.throws(
    () => assertSafePublicConnectMutationTarget("customer-production"),
    { code: "ISOLATED_CI_CLUSTER_REQUIRED" },
  );
  assert.throws(() =>
    readReleaseBlob(
      path.resolve("."),
      "not-a-release-sha",
      "packages/database/prisma/schema.prisma",
    ),
  );
  const first = generatedNames();
  const second = generatedNames();
  assert.match(first.cloneDatabaseName, SAFE_CLONE_PATTERN);
  assert.match(first.readerRoleName, SAFE_READER_PATTERN);
  assert.notEqual(first.cloneDatabaseName, second.cloneDatabaseName);
  assert.notEqual(first.readerRoleName, second.readerRoleName);
  const strictProposalUrl = new URL(
    proposalDryRunDatabaseUrl(
      "postgresql://reader:secret@127.0.0.1:5432/leetplus_ci?schema=public&connection_limit=1&options=unsafe",
    ),
  );
  assert.deepEqual([...strictProposalUrl.searchParams.keys()], ["schema"]);
  assert.equal(strictProposalUrl.searchParams.get("schema"), "public");
  assertSourceGuards();
  const migrationPlan = await readMigrationPlan();
  assert.equal(
    migrationPlan.baselineMigrations.length,
    BASELINE_MIGRATION_COUNT,
  );
  assert.deepEqual(migrationPlan.expandMigrations, [...EXPAND_MIGRATIONS]);
  assert.deepEqual(migrationPlan.additiveTailMigrations, [
    ...STAFF_TASK_ALLOWED_ADDITIVE_TAIL,
  ]);
  assert.equal(
    migrationPlan.currentMigrations.length,
    STAFF_TASK_FROZEN_PREFIX_COUNT + STAFF_TASK_ALLOWED_ADDITIVE_TAIL.length,
  );
  const dryRunModule =
    await import("./staff-task-integrity-reconciliation-proposal-dry-run.mjs");
  assert.deepEqual(Object.keys(EXPECTED_PROPOSAL_COUNTS).sort(), [
    ...dryRunModule.PROPOSAL_CODES,
  ]);
  assert.equal(EXPECTED_PROPOSAL_OCCURRENCES, 8);
  assert.equal(EXPECTED_PROPOSAL_CASES.length, 7);
  assert.deepEqual(
    EXPECTED_PROPOSAL_CASES.find(
      ({ resourceType, column }) =>
        resourceType === "StaffTaskRecurringRule" &&
        column === "lastCreatedTaskId",
    )?.reasonCodes,
    ["RULE_LAST_TASK_CROSS_TENANT", "RULE_LAST_TASK_SOURCE_MISMATCH"],
  );
  assert.equal(READER_TABLE_SELECT_RELATIONS.length, 8);
  assert.deepEqual(READER_COLUMN_SELECTS.User, [
    "id",
    "tenantId",
    "isPlatformAdmin",
    "isActive",
    "accessScope",
  ]);
  assert.equal(READER_FORBIDDEN_USER_COLUMNS.length, 8);

  return {
    script: SCRIPT_NAME,
    status: "PASS",
    checks: 48,
    localCiOnly: true,
    disposableDatabaseOnly: true,
    selectOnlyAdmissionRole: true,
    exactSelectRelations: READER_SELECT_RELATIONS.length,
    tableSelectRelations: READER_TABLE_SELECT_RELATIONS.length,
    userSelectColumns: READER_COLUMN_SELECTS.User.length,
    forbiddenUserColumns: READER_FORBIDDEN_USER_COLUMNS.length,
    committedReleaseArtifactOnly: true,
    baselineMigrations: migrationPlan.baselineMigrations.length,
    expandMigrations: migrationPlan.expandMigrations.length,
    additiveTailMigrations: migrationPlan.additiveTailMigrations.length,
    proposalCodes: Object.keys(EXPECTED_PROPOSAL_COUNTS).length,
    proposalCases: EXPECTED_PROPOSAL_CASES.length,
    lastTaskReasonCoalescingRequired: true,
    sourceDataWrites: false,
    clusterAclTemporarilyMutated: true,
  };
}

export async function runSmoke(environment = process.env) {
  if (environment.NODE_ENV === "production") {
    contractError("PRODUCTION_EXECUTION_PROHIBITED");
  }
  if (
    environment.STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_SMOKE_CONFIRM !==
    REQUIRED_CONFIRMATION
  ) {
    contractError("SMOKE_CONFIRMATION_REQUIRED");
  }
  if (!RELEASE_SHA_PATTERN.test(String(environment.RELEASE_SHA ?? ""))) {
    contractError("RELEASE_SHA_INVALID");
  }

  const { sourceUrl, databaseName: sourceDatabaseName } =
    parseSourceDatabaseUrl(environment.DATABASE_URL);
  const { cloneDatabaseName, readerRoleName } = generatedNames();
  const readerPassword = randomBytes(32).toString("hex");
  const cloneDatabaseUrl = databaseUrlFor(
    sourceUrl,
    cloneDatabaseName,
  ).toString();
  const adminDatabaseUrl = databaseUrlFor(sourceUrl, "postgres").toString();
  const sourceDatabaseUrl = databaseUrlFor(
    sourceUrl,
    sourceDatabaseName,
  ).toString();
  const readerUrl = readerDatabaseUrl(
    sourceUrl,
    cloneDatabaseName,
    readerRoleName,
    readerPassword,
  );
  const quotedClone = quoteIdentifier(cloneDatabaseName);
  const quotedReader = quoteIdentifier(readerRoleName);
  const admin = prismaClient(adminDatabaseUrl);
  let clusterLockHeld = false;
  let cloneCreated = false;
  let readerCreated = false;
  let tempRoot;
  let migrationSchemaPath;
  let sourceFingerprintBefore;
  let sourceFingerprintAfter;
  let primaryError;
  const cleanupErrors = [];
  const revokedPublicConnectDatabases = [];

  async function cleanup() {
    try {
      if (readerCreated) {
        await admin.$queryRawUnsafe(
          `SELECT pg_terminate_backend(pid)
           FROM pg_stat_activity
           WHERE usename = $1
             AND pid <> pg_backend_pid()`,
          readerRoleName,
        );
      }
    } catch (error) {
      cleanupErrors.push(error);
    }
    try {
      if (cloneCreated) {
        assert.match(cloneDatabaseName, SAFE_CLONE_PATTERN);
        await admin.$executeRawUnsafe(
          `DROP DATABASE IF EXISTS ${quotedClone} WITH (FORCE)`,
        );
        cloneCreated = false;
      }
    } catch (error) {
      cleanupErrors.push(error);
    }
    try {
      if (readerCreated) {
        assert.match(readerRoleName, SAFE_READER_PATTERN);
        await admin.$executeRawUnsafe(`DROP ROLE IF EXISTS ${quotedReader}`);
        readerCreated = false;
      }
    } catch (error) {
      cleanupErrors.push(error);
    }
    try {
      if (revokedPublicConnectDatabases.length > 0) {
        await restorePublicDatabaseConnect(
          admin,
          revokedPublicConnectDatabases,
        );
      }
    } catch (error) {
      cleanupErrors.push(error);
    }
    try {
      if (tempRoot) {
        assertSafeTempRoot(tempRoot);
        await rm(tempRoot, {
          recursive: true,
          force: true,
          maxRetries: 5,
          retryDelay: 100,
        });
        tempRoot = undefined;
      }
    } catch (error) {
      cleanupErrors.push(error);
    }
    try {
      if (clusterLockHeld) {
        await releaseClusterSmokeLock(admin);
        clusterLockHeld = false;
      }
    } catch (error) {
      cleanupErrors.push(error);
    }
  }

  try {
    await assertTestSuperuser(admin);
    await acquireClusterSmokeLock(admin);
    clusterLockHeld = true;
    const migrationPlan = await readMigrationPlan();
    sourceFingerprintBefore = await aggregateFingerprint(sourceDatabaseUrl);
    tempRoot = await mkdtemp(path.join(tmpdir(), TEMP_ROOT_PREFIX));
    assertSafeTempRoot(tempRoot);

    await admin.$executeRawUnsafe(
      `CREATE DATABASE ${quotedClone} TEMPLATE template0`,
    );
    cloneCreated = true;
    migrationSchemaPath = await copyMigrationArtifact(
      tempRoot,
      migrationPlan,
      "baseline",
      environment.RELEASE_SHA,
    );
    runMigrateDeploy(migrationSchemaPath, cloneDatabaseUrl, environment);
    await assertAppliedMigrations(
      cloneDatabaseUrl,
      migrationPlan.baselineMigrations,
    );
    await revokePublicConnectFromOtherDatabases(
      admin,
      cloneDatabaseName,
      revokedPublicConnectDatabases,
    );

    await admin.$executeRawUnsafe(
      `CREATE ROLE ${quotedReader}
       LOGIN
       PASSWORD '${readerPassword}'
       NOSUPERUSER
       NOCREATEDB
       NOCREATEROLE
       NOINHERIT
       NOREPLICATION
       NOBYPASSRLS`,
    );
    readerCreated = true;
    await configureReaderRole(
      cloneDatabaseUrl,
      cloneDatabaseName,
      readerRoleName,
    );
    const baselineForbiddenSelect = await assertExactReaderSelectScope(
      cloneDatabaseUrl,
      readerRoleName,
    );
    await assertReaderCannotWrite(readerUrl, baselineForbiddenSelect);

    const admissionModule =
      await import("./staff-task-integrity-snapshot-admission.mjs");
    const plannerModule =
      await import("./staff-task-integrity-reconciliation-plan.mjs");
    const dryRunModule =
      await import("./staff-task-integrity-reconciliation-proposal-dry-run.mjs");
    const runConfirmation = admissionModule.RUN_CONFIRMATION;
    const isolationAttestation = admissionModule.ISOLATION_ATTESTATION;
    const plannerRunConfirmation = plannerModule.RUN_CONFIRMATION;
    const proposalDryRunConfirmation = dryRunModule.RUN_CONFIRMATION;
    assert.equal(typeof runConfirmation, "string");
    assert(runConfirmation.length > 0);
    assert.equal(typeof isolationAttestation, "string");
    assert(isolationAttestation.length > 0);
    assert.equal(typeof plannerRunConfirmation, "string");
    assert(plannerRunConfirmation.length > 0);
    assert.equal(typeof proposalDryRunConfirmation, "string");
    assert(proposalDryRunConfirmation.length > 0);
    assert.equal(
      typeof dryRunModule.buildSyntheticProvenanceManifest,
      "function",
    );
    assert.equal(
      typeof dryRunModule.encodeSyntheticProvenanceManifest,
      "function",
    );
    assert.equal(
      typeof dryRunModule.syntheticProvenanceDatabaseMarker,
      "function",
    );
    assert(Number.isInteger(dryRunModule.ADVISORY_LOCK_NAMESPACE));
    assert(Number.isInteger(dryRunModule.ADVISORY_LOCK_RESOURCE));

    const restoredAt = new Date().toISOString();
    const acquiredAt = restoredAt;
    const expiresAt = new Date(
      Date.parse(restoredAt) + 60 * 60 * 1000,
    ).toISOString();
    const baseAdmissionEnvironment = {
      environment,
      readerUrl,
      cloneDatabaseName,
      runConfirmation,
      isolationAttestation,
      acquiredAt,
      restoredAt,
      expiresAt,
      snapshotDigest: sourceFingerprintBefore,
    };
    const privacyContext = {
      sourceDatabaseName,
      cloneDatabaseName,
      readerRoleName,
      readerPassword,
    };

    const baselineAdmission = spawnAdmission(
      admissionEnvironment({
        ...baseAdmissionEnvironment,
        expectedState: BASELINE_STATE,
      }),
    );
    assert.equal(
      baselineAdmission.exitCode,
      0,
      `BASELINE_156 admission failed: ${JSON.stringify(
        baselineAdmission.report,
      )}`,
    );
    assertAdmissionShape(baselineAdmission.report, BASELINE_STATE);
    assertOutputSafe(baselineAdmission.serialized, privacyContext);

    await copyMigrationArtifact(
      tempRoot,
      migrationPlan,
      "expand",
      environment.RELEASE_SHA,
    );
    runMigrateDeploy(migrationSchemaPath, cloneDatabaseUrl, environment);
    await assertAppliedMigrations(
      cloneDatabaseUrl,
      migrationPlan.allMigrations,
    );
    await configureReaderRole(
      cloneDatabaseUrl,
      cloneDatabaseName,
      readerRoleName,
    );
    const expandForbiddenSelect = await assertExactReaderSelectScope(
      cloneDatabaseUrl,
      readerRoleName,
    );
    await assertReaderCannotWrite(readerUrl, expandForbiddenSelect);

    const expandAdmission = spawnAdmission(
      admissionEnvironment({
        ...baseAdmissionEnvironment,
        expectedState: EXPAND_STATE,
      }),
    );
    assert.equal(
      expandAdmission.exitCode,
      0,
      `EXPAND_162 admission failed: ${JSON.stringify(expandAdmission.report)}`,
    );
    assertAdmissionShape(expandAdmission.report, EXPAND_STATE);
    assertOutputSafe(expandAdmission.serialized, privacyContext);

    const tableWideUserAdmission = await withReaderPrivilegeMutation(
      {
        cloneDatabaseUrl,
        cloneDatabaseName,
        readerRoleName,
        privilegeStatement: `GRANT SELECT ON TABLE public."User" TO ${quotedReader}`,
      },
      () =>
        spawnAdmission(
          admissionEnvironment({
            ...baseAdmissionEnvironment,
            expectedState: EXPAND_STATE,
          }),
        ),
    );
    assert.equal(tableWideUserAdmission.exitCode, 3);
    assert.equal(tableWideUserAdmission.report?.summary?.decision, "REJECTED");
    assert.equal(
      tableWideUserAdmission.report?.database?.privileges?.actual
        ?.columnScopedTableSelectCount,
      1,
    );
    assertOutputSafe(tableWideUserAdmission.serialized, privacyContext);

    const missingUserColumnAdmission = await withReaderPrivilegeMutation(
      {
        cloneDatabaseUrl,
        cloneDatabaseName,
        readerRoleName,
        privilegeStatement:
          `REVOKE SELECT ("accessScope") ON TABLE public."User" ` +
          `FROM ${quotedReader}`,
      },
      () =>
        spawnAdmission(
          admissionEnvironment({
            ...baseAdmissionEnvironment,
            expectedState: EXPAND_STATE,
          }),
        ),
    );
    assert.equal(missingUserColumnAdmission.exitCode, 3);
    assert.equal(
      missingUserColumnAdmission.report?.summary?.decision,
      "REJECTED",
    );
    assert.equal(
      missingUserColumnAdmission.report?.database?.privileges?.actual
        ?.requiredSelectMissingCount,
      1,
    );
    assertOutputSafe(missingUserColumnAdmission.serialized, privacyContext);

    const renamedUserColumnAdmission = await withReaderCatalogMutation(
      {
        cloneDatabaseUrl,
        cloneDatabaseName,
        readerRoleName,
        mutateStatement:
          `ALTER TABLE public."User" RENAME COLUMN "accessScope" ` +
          `TO "accessScope_admission_missing"`,
        restoreStatement:
          `ALTER TABLE public."User" RENAME COLUMN ` +
          `"accessScope_admission_missing" TO "accessScope"`,
      },
      () =>
        spawnAdmission(
          admissionEnvironment({
            ...baseAdmissionEnvironment,
            expectedState: EXPAND_STATE,
          }),
        ),
    );
    assert.equal(renamedUserColumnAdmission.exitCode, 3);
    assert.equal(
      renamedUserColumnAdmission.report?.summary?.decision,
      "REJECTED",
    );
    assert.equal(
      renamedUserColumnAdmission.report?.database?.privileges?.actual
        ?.requiredSelectMissingCount,
      1,
    );
    assertOutputSafe(renamedUserColumnAdmission.serialized, privacyContext);

    const extraUserColumnAdmission = await withReaderPrivilegeMutation(
      {
        cloneDatabaseUrl,
        cloneDatabaseName,
        readerRoleName,
        privilegeStatement:
          `GRANT SELECT ("email") ON TABLE public."User" ` +
          `TO ${quotedReader}`,
      },
      () =>
        spawnAdmission(
          admissionEnvironment({
            ...baseAdmissionEnvironment,
            expectedState: EXPAND_STATE,
          }),
        ),
    );
    assert.equal(extraUserColumnAdmission.exitCode, 3);
    assert.equal(
      extraUserColumnAdmission.report?.summary?.decision,
      "REJECTED",
    );
    assert.equal(
      extraUserColumnAdmission.report?.database?.privileges?.actual
        ?.excessSelectColumnCount,
      1,
    );
    assertOutputSafe(extraUserColumnAdmission.serialized, privacyContext);

    const userGrantOptionAdmission = await withReaderPrivilegeMutation(
      {
        cloneDatabaseUrl,
        cloneDatabaseName,
        readerRoleName,
        privilegeStatement:
          `GRANT SELECT ("id") ON TABLE public."User" ` +
          `TO ${quotedReader} WITH GRANT OPTION`,
      },
      () =>
        spawnAdmission(
          admissionEnvironment({
            ...baseAdmissionEnvironment,
            expectedState: EXPAND_STATE,
          }),
        ),
    );
    assert.equal(userGrantOptionAdmission.exitCode, 3);
    assert.equal(
      userGrantOptionAdmission.report?.summary?.decision,
      "REJECTED",
    );
    assert.equal(
      userGrantOptionAdmission.report?.database?.privileges?.actual
        ?.selectGrantOptionColumnCount,
      1,
    );
    assertOutputSafe(userGrantOptionAdmission.serialized, privacyContext);

    const publicTableSelectAdmission = await withReaderPrivilegeMutation(
      {
        cloneDatabaseUrl,
        cloneDatabaseName,
        readerRoleName,
        privilegeStatement: `GRANT SELECT ON TABLE public."Tenant" TO PUBLIC`,
      },
      () =>
        spawnAdmission(
          admissionEnvironment({
            ...baseAdmissionEnvironment,
            expectedState: EXPAND_STATE,
          }),
        ),
    );
    assert.equal(publicTableSelectAdmission.exitCode, 3);
    assert.equal(
      publicTableSelectAdmission.report?.database?.privileges?.actual
        ?.publicSelectRelationCount,
      1,
    );
    assertOutputSafe(publicTableSelectAdmission.serialized, privacyContext);

    const publicColumnSelectAdmission = await withReaderPrivilegeMutation(
      {
        cloneDatabaseUrl,
        cloneDatabaseName,
        readerRoleName,
        privilegeStatement:
          `GRANT SELECT ("id") ON TABLE public."User" ` + `TO PUBLIC`,
      },
      () =>
        spawnAdmission(
          admissionEnvironment({
            ...baseAdmissionEnvironment,
            expectedState: EXPAND_STATE,
          }),
        ),
    );
    assert.equal(publicColumnSelectAdmission.exitCode, 3);
    assert.equal(
      publicColumnSelectAdmission.report?.database?.privileges?.actual
        ?.publicSelectRelationCount,
      1,
    );
    assertOutputSafe(publicColumnSelectAdmission.serialized, privacyContext);

    const restoredForbiddenSelect = await assertExactReaderSelectScope(
      cloneDatabaseUrl,
      readerRoleName,
    );
    assert.equal(restoredForbiddenSelect, expandForbiddenSelect);
    await assertReaderCannotWrite(readerUrl, restoredForbiddenSelect);

    const fixtureIds = await injectSyntheticLegacyFixtures(cloneDatabaseUrl);
    const admissionFirst = spawnAdmission(
      admissionEnvironment({
        ...baseAdmissionEnvironment,
        expectedState: EXPAND_STATE,
      }),
    );
    assert.equal(admissionFirst.exitCode, 0);
    assertAdmissionShape(admissionFirst.report, EXPAND_STATE);
    assertOutputSafe(admissionFirst.serialized, {
      ...privacyContext,
      fixtureIds,
    });

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
    const admissionSecond = spawnAdmission(
      admissionEnvironment({
        ...baseAdmissionEnvironment,
        expectedState: EXPAND_STATE,
      }),
    );
    assert.equal(admissionSecond.exitCode, 0);
    assertAdmissionShape(admissionSecond.report, EXPAND_STATE);
    assertOutputSafe(admissionSecond.serialized, {
      ...privacyContext,
      fixtureIds,
    });
    assert.equal(
      evidenceDigest(admissionFirst.report, "contentDigest"),
      evidenceDigest(admissionSecond.report, "contentDigest"),
    );
    assert.notEqual(
      evidenceDigest(admissionFirst.report, "executionDigest"),
      evidenceDigest(admissionSecond.report, "executionDigest"),
    );

    const syntheticProvenance = await installSyntheticProvenance({
      cloneDatabaseUrl,
      cloneDatabaseName,
      releaseSha: environment.RELEASE_SHA,
      dryRunModule,
      plannerModule,
    });
    const dryRunProtectedValues = [
      syntheticProvenance.encodedManifest,
      syntheticProvenance.creationNonce,
      syntheticProvenance.databaseMarker,
      syntheticProvenance.databaseIdentityDigest,
    ];
    const dryRunEnvironmentFor = (maxCases) =>
      proposalDryRunEnvironment({
        admission: admissionEnvironment({
          ...baseAdmissionEnvironment,
          expectedState: EXPAND_STATE,
        }),
        readerUrl,
        runConfirmation: proposalDryRunConfirmation,
        provenanceManifest: syntheticProvenance.encodedManifest,
        maxCases,
      });

    const proposalFirst = spawnProposalDryRun(dryRunEnvironmentFor(10_000));
    assert.equal(proposalFirst.exitCode, 2);
    assertProposalDryRunFindings(proposalFirst.report);
    assertOutputSafe(proposalFirst.serialized, {
      ...privacyContext,
      fixtureIds,
      protectedValues: dryRunProtectedValues,
    });

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
    const proposalSecond = spawnProposalDryRun(dryRunEnvironmentFor(10_000));
    assert.equal(proposalSecond.exitCode, 2);
    assertProposalDryRunFindings(proposalSecond.report);
    assertOutputSafe(proposalSecond.serialized, {
      ...privacyContext,
      fixtureIds,
      protectedValues: dryRunProtectedValues,
    });
    const firstCasesByDescriptor = proposalCasesByDescriptor(
      proposalFirst.report,
    );
    const secondCasesByDescriptor = proposalCasesByDescriptor(
      proposalSecond.report,
    );
    assert.deepEqual(
      [...secondCasesByDescriptor.keys()].sort(),
      [...firstCasesByDescriptor.keys()].sort(),
    );
    for (const [descriptor, firstCase] of firstCasesByDescriptor) {
      const secondCase = secondCasesByDescriptor.get(descriptor);
      assert(secondCase);
      assert.notEqual(secondCase.caseToken, firstCase.caseToken);
      assert.notEqual(
        secondCase.preconditionDigest,
        firstCase.preconditionDigest,
      );
    }
    assert.notEqual(
      evidenceDigest(proposalFirst.report, "contentDigest"),
      evidenceDigest(proposalSecond.report, "contentDigest"),
    );
    assert.notEqual(
      evidenceDigest(proposalFirst.report, "executionDigest"),
      evidenceDigest(proposalSecond.report, "executionDigest"),
    );

    const proposalCap = spawnProposalDryRun(dryRunEnvironmentFor(2));
    assert.equal(proposalCap.exitCode, 3);
    assert.equal(proposalCap.report?.summary?.capExceeded, true);
    assert.equal(
      proposalCap.report?.summary?.blockingTotal,
      EXPECTED_PROPOSAL_OCCURRENCES + EXPECTED_OPERATOR_OCCURRENCES,
    );
    assert.equal(
      proposalCap.report?.summary?.proposalOccurrences,
      EXPECTED_PROPOSAL_OCCURRENCES,
    );
    assert.equal(
      proposalCap.report?.summary?.operatorOccurrences,
      EXPECTED_OPERATOR_OCCURRENCES,
    );
    assert.equal(
      proposalCap.report?.summary?.reviewOccurrences,
      EXPECTED_REVIEW_OCCURRENCES,
    );
    assert.equal(proposalCap.report?.summary?.uniqueProposalCases, 0);
    assert.deepEqual(proposalCap.report?.cases, []);
    assertOutputSafe(proposalCap.serialized, {
      ...privacyContext,
      fixtureIds,
      protectedValues: dryRunProtectedValues,
    });

    const proposalBlockingBoundaryCap = spawnProposalDryRun(
      dryRunEnvironmentFor(9),
    );
    assert.equal(proposalBlockingBoundaryCap.exitCode, 3);
    assert.equal(
      proposalBlockingBoundaryCap.report?.summary?.capExceeded,
      true,
    );
    assert.equal(
      proposalBlockingBoundaryCap.report?.summary?.blockingTotal,
      10,
    );
    assert.equal(
      proposalBlockingBoundaryCap.report?.summary?.uniqueProposalCases,
      0,
    );
    assert.deepEqual(proposalBlockingBoundaryCap.report?.cases, []);
    assertOutputSafe(proposalBlockingBoundaryCap.serialized, {
      ...privacyContext,
      fixtureIds,
      protectedValues: dryRunProtectedValues,
    });

    const proposalBlockingBoundaryAllowed = spawnProposalDryRun(
      dryRunEnvironmentFor(10),
    );
    assert.equal(proposalBlockingBoundaryAllowed.exitCode, 2);
    assertProposalDryRunFindings(proposalBlockingBoundaryAllowed.report);
    assertOutputSafe(proposalBlockingBoundaryAllowed.serialized, {
      ...privacyContext,
      fixtureIds,
      protectedValues: dryRunProtectedValues,
    });

    const proposalRlsRejected = await withTemplateRlsEnabled(
      cloneDatabaseUrl,
      () => spawnProposalDryRun(dryRunEnvironmentFor(10_000)),
    );
    assertProposalDryRunRejection(
      proposalRlsRejected,
      "DRY_RUN_RELEASE_GATE_REJECTED",
    );
    assertOutputSafe(proposalRlsRejected.serialized, {
      ...privacyContext,
      fixtureIds,
      protectedValues: dryRunProtectedValues,
    });

    const releaseProposalBlocker = await holdProposalDryRunAdvisoryLock(
      cloneDatabaseUrl,
      dryRunModule.ADVISORY_LOCK_NAMESPACE,
      dryRunModule.ADVISORY_LOCK_RESOURCE,
    );
    let proposalLockRejected;
    try {
      proposalLockRejected = spawnProposalDryRun(dryRunEnvironmentFor(10_000));
    } finally {
      await releaseProposalBlocker();
    }
    assertProposalDryRunRejection(
      proposalLockRejected,
      "CONCURRENT_DRY_RUN_REJECTED",
    );
    assertOutputSafe(proposalLockRejected.serialized, {
      ...privacyContext,
      fixtureIds,
      protectedValues: dryRunProtectedValues,
    });

    await copyMigrationArtifact(
      tempRoot,
      migrationPlan,
      "current",
      environment.RELEASE_SHA,
    );
    runMigrateDeploy(migrationSchemaPath, cloneDatabaseUrl, environment);
    await assertAppliedMigrations(
      cloneDatabaseUrl,
      migrationPlan.currentMigrations,
    );
    const currentForbiddenSelect = await assertExactReaderSelectScope(
      cloneDatabaseUrl,
      readerRoleName,
    );
    assert.equal(currentForbiddenSelect, expandForbiddenSelect);
    await assertReaderCannotWrite(readerUrl, currentForbiddenSelect);

    const currentAdmission = spawnAdmission(
      admissionEnvironment({
        ...baseAdmissionEnvironment,
        expectedState: CURRENT_STATE,
      }),
    );
    if (currentAdmission.exitCode !== 0) {
      contractError("CURRENT_ADMISSION_REJECTED");
    }
    assertAdmissionShape(currentAdmission.report, CURRENT_STATE);
    assertOutputSafe(currentAdmission.serialized, {
      ...privacyContext,
      fixtureIds,
    });

    const findings = spawnPlanner(
      plannerEnvironment({
        environment,
        readerUrl,
        cloneDatabaseName,
        runConfirmation: plannerRunConfirmation,
        maxCandidates: 10_000,
      }),
    );
    assert.equal(findings.exitCode, 2);
    assert.equal(findings.plannerExitCode, 2);
    assertOutputSafe(findings.serialized, {
      ...privacyContext,
      fixtureIds,
    });

    const lowCap = spawnPlanner(
      plannerEnvironment({
        environment,
        readerUrl,
        cloneDatabaseName,
        runConfirmation: plannerRunConfirmation,
        maxCandidates: 1,
      }),
    );
    assert.equal(lowCap.exitCode, 3);
    assert.equal(lowCap.plannerExitCode, 3);
    assertOutputSafe(lowCap.serialized, {
      ...privacyContext,
      fixtureIds,
    });

    const tamperedAdmission = spawnAdmission(
      admissionEnvironment({
        ...baseAdmissionEnvironment,
        expectedState: CURRENT_STATE,
        overrides: {
          [`${ADMISSION_ENV_PREFIX}ISOLATION_ATTESTATION`]: `${isolationAttestation}-tampered`,
        },
      }),
    );
    assert.notEqual(tamperedAdmission.exitCode, 0);
    assertOutputSafe(tamperedAdmission.serialized, {
      ...privacyContext,
      fixtureIds,
    });

    await tamperLatestMigration(cloneDatabaseUrl);
    const tamperedMigration = spawnAdmission(
      admissionEnvironment({
        ...baseAdmissionEnvironment,
        expectedState: CURRENT_STATE,
      }),
    );
    assert.equal(tamperedMigration.exitCode, 3);
    assert.equal(
      findFirstField(tamperedMigration.report, ["decision"]),
      "REJECTED",
    );
    assertOutputSafe(tamperedMigration.serialized, {
      ...privacyContext,
      fixtureIds,
    });
  } catch (error) {
    primaryError = error;
  }

  await cleanup();
  try {
    sourceFingerprintAfter = await aggregateFingerprint(sourceDatabaseUrl);
    assert.equal(
      sourceFingerprintAfter,
      sourceFingerprintBefore,
      "The source database aggregate fingerprint changed during the smoke.",
    );
  } catch (error) {
    cleanupErrors.push(error);
  }
  try {
    const leftovers = await admin.$queryRawUnsafe(
      `SELECT
         EXISTS(
           SELECT 1 FROM pg_database WHERE datname = $1
         ) AS database_exists,
         EXISTS(
           SELECT 1 FROM pg_roles WHERE rolname = $2
         ) AS role_exists`,
      cloneDatabaseName,
      readerRoleName,
    );
    assert.equal(leftovers.length, 1);
    assert.equal(leftovers[0].database_exists, false);
    assert.equal(leftovers[0].role_exists, false);
  } catch (error) {
    cleanupErrors.push(error);
  }
  await admin.$disconnect();

  if (primaryError && cleanupErrors.length > 0) {
    throw new AggregateError(
      [primaryError, ...cleanupErrors],
      "Smoke execution and cleanup both failed.",
    );
  }
  if (primaryError) {
    throw primaryError;
  }
  if (cleanupErrors.length > 0) {
    throw cleanupErrors[0];
  }

  return {
    script: SCRIPT_NAME,
    status: "PASS",
    scenarios: 24,
    classification: SNAPSHOT_CLASSIFICATION,
    admittedStates: [BASELINE_STATE, EXPAND_STATE, CURRENT_STATE],
    baselineMigrationsApplied: BASELINE_MIGRATION_COUNT,
    expandMigrationsApplied: EXPAND_MIGRATIONS.length,
    additiveTailMigrationsApplied: STAFF_TASK_ALLOWED_ADDITIVE_TAIL.length,
    committedReleaseArtifactOnly: true,
    exactSelectRelations: READER_SELECT_RELATIONS.length,
    tableSelectRelations: READER_TABLE_SELECT_RELATIONS.length,
    userSelectColumns: READER_COLUMN_SELECTS.User.length,
    userForbiddenColumnReadsDenied: READER_FORBIDDEN_USER_COLUMNS.length,
    userSelectStarDenied: true,
    userTableSelectAdmissionRejected: true,
    missingUserColumnAdmissionRejected: true,
    renamedUserColumnAdmissionRejected: true,
    excessUserColumnAdmissionRejected: true,
    userSelectGrantOptionAdmissionRejected: true,
    publicTableSelectAdmissionRejected: true,
    publicColumnSelectAdmissionRejected: true,
    otherDatabasePublicConnectRevoked: revokedPublicConnectDatabases.length,
    otherDatabasePublicConnectRestored: true,
    clusterAdvisoryLockVerified: true,
    selectOnlyRoleVerified: true,
    excessSelectDenied: true,
    dmlDeniedOutsideReadOnlyTransaction: true,
    ddlDeniedOutsideReadOnlyTransaction: true,
    internalFkTriggerDisableDenied: true,
    plannerFindingsExitVerified: 2,
    plannerCapExitVerified: 3,
    proposalDryRunFindingsExitVerified: 2,
    proposalDryRunCapExitVerified: 3,
    proposalDryRunRlsExitVerified: 3,
    proposalDryRunAdvisoryLockExitVerified: 3,
    proposalDryRunExecutionUnlinkabilityVerified: true,
    proposalDryRunPositiveCodesVerified: Object.keys(EXPECTED_PROPOSAL_COUNTS)
      .length,
    proposalDryRunOccurrencesVerified: EXPECTED_PROPOSAL_OCCURRENCES,
    proposalDryRunUniqueCasesVerified: EXPECTED_PROPOSAL_CASES.length,
    proposalDryRunLastTaskReasonCoalescingVerified: true,
    proposalDryRunAggregateRowParityVerified: true,
    signedSyntheticProvenanceVerified: true,
    stableContentDigestVerified: true,
    timestampBoundExecutionDigestVerified: true,
    tamperedAdmissionRejected: true,
    tamperedMigrationRejected: true,
    protectedOutputVerified: true,
    sourceAggregateFingerprintUnchanged: true,
    sourceDataWrites: false,
    clusterAclTemporarilyMutated: true,
    migrationArtifactRemoved: true,
    disposableDatabaseDropped: true,
    disposableRoleDropped: true,
  };
}

export async function main(
  argv = process.argv.slice(2),
  environment = process.env,
) {
  try {
    const options = parseArguments(argv);
    if (options.help) {
      process.stdout.write(`${HELP}\n`);
      return 0;
    }
    const result = options.selfTest
      ? await runSelfTest()
      : await runSmoke(environment);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return 0;
  } catch (error) {
    const code = error?.safeContractError
      ? String(error.code)
      : "SNAPSHOT_ADMISSION_SMOKE_FAILED";
    process.stderr.write(
      `${JSON.stringify({
        script: SCRIPT_NAME,
        status: "ERROR",
        error: { code },
      })}\n`,
    );
    return 1;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (fileURLToPath(import.meta.url) === invokedPath) {
  process.exitCode = await main();
}

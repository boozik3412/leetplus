import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import {
  cp,
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import {
  CURRENT_EXPECTED_LATEST_MIGRATION,
  CURRENT_EXPECTED_MIGRATION_COUNT,
  STAFF_TASK_ALLOWED_ADDITIVE_TAIL,
} from "./staff-task-integrity-migration-state.mjs";

const SCRIPT_NAME = "store-background-execution-fence-upgrade-smoke";
const REQUIRED_CONFIRMATION =
  "run-store-background-execution-fence-upgrade-smoke";
const PREFIX_MIGRATION = "20260728150000_tenant_execution_revision_fence";
const TARGET_MIGRATION = "20260729120000_store_background_execution_fence";
const MIGRATION_PATTERN = /^\d{14}_[a-z0-9_]+$/;
const SAFE_SOURCE_DATABASE_PATTERN = /(?:^|[_-])(?:ci|test|testing)(?:$|[_-])/i;
const SUCCESS_DATABASE_PREFIX = "lp_store_fence_upgrade_ci_";
const FAILURE_DATABASE_PREFIX = "lp_store_fence_failure_ci_";
const SUCCESS_DATABASE_PATTERN = /^lp_store_fence_upgrade_ci_[a-f0-9]{16}$/;
const FAILURE_DATABASE_PATTERN = /^lp_store_fence_failure_ci_[a-f0-9]{16}$/;
const TEMP_ROOT_PREFIX = "leetplus-store-fence-upgrade-";
const MIGRATION_TIMEOUT_MS = 10 * 60 * 1000;
const FAILURE_TIMEOUT_MS = 30_000;
const CLUSTER_LOCK_CLASS = 1_281_120_000;
const CLUSTER_LOCK_OBJECT = 165;

const HELP = `
${SCRIPT_NAME}

Local/CI-only PostgreSQL 16 rehearsal for migration 165. It creates two
random disposable databases from template0 and never migrates, templates, or
writes application data in the source database.

The success database is migrated through the exact 164-migration prefix,
populated with active and inactive Store rows, and upgraded through migration
165. The smoke verifies fail-closed defaults, trigger-owned revision
semantics, archive revocation, exhaustion handling, catalog constraints,
function privileges, deterministic concurrent policy serialization, and
idempotent migrate deploy.

The failure database first holds a competing Store lock and proves that the
five-second migration lock timeout leaves no partial DDL. It then receives a
conflicting trigger immediately before migration 165. The late-DDL failure
must roll back every preceding column, constraint, function, and privilege
change. Both failed attempts are explicitly resolved as rolled back before the
exact migration is retried successfully.

Usage:
  node scripts/store-background-execution-fence-upgrade-smoke.mjs
  node scripts/store-background-execution-fence-upgrade-smoke.mjs --self-test
  node scripts/store-background-execution-fence-upgrade-smoke.mjs --help

Required for the real PostgreSQL smoke:
  DATABASE_URL
    PostgreSQL 16 on localhost, public schema, and a database name containing
    a ci/test/testing marker. The connected role must be a test superuser.
  STORE_BACKGROUND_EXECUTION_FENCE_UPGRADE_SMOKE_CONFIRM
    Must equal: ${REQUIRED_CONFIRMATION}

Safety:
  - NODE_ENV=production is always rejected.
  - The source database is never migrated or used as a template.
  - Only generated ${SUCCESS_DATABASE_PREFIX}<hex> and
    ${FAILURE_DATABASE_PREFIX}<hex> databases may be created or dropped.
  - Migration artifacts exist only below a generated OS temp directory.
  - Cleanup force-drops both generated databases in a finally block.
`.trim();

function contractError(code, message = code) {
  const error = new Error(message);
  error.code = code;
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

function parseSafeSourceDatabaseUrl(rawDatabaseUrl) {
  if (typeof rawDatabaseUrl !== "string" || rawDatabaseUrl.length === 0) {
    contractError("DATABASE_URL_REQUIRED");
  }

  let sourceUrl;
  try {
    sourceUrl = new URL(rawDatabaseUrl);
  } catch {
    contractError("DATABASE_URL_INVALID");
  }

  if (
    sourceUrl.protocol !== "postgresql:" &&
    sourceUrl.protocol !== "postgres:"
  ) {
    contractError("POSTGRESQL_URL_REQUIRED");
  }

  const hostname = sourceUrl.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!new Set(["127.0.0.1", "localhost", "::1"]).has(hostname)) {
    contractError("LOOPBACK_POSTGRESQL_REQUIRED");
  }

  const databaseName = decodeURIComponent(
    sourceUrl.pathname.replace(/^\/+/, ""),
  );
  if (
    !databaseName ||
    !SAFE_SOURCE_DATABASE_PATTERN.test(databaseName) ||
    SUCCESS_DATABASE_PATTERN.test(databaseName) ||
    FAILURE_DATABASE_PATTERN.test(databaseName)
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
  return target.toString();
}

function generatedDatabaseNames() {
  const suffix = randomBytes(8).toString("hex");
  const successDatabaseName = `${SUCCESS_DATABASE_PREFIX}${suffix}`;
  const failureDatabaseName = `${FAILURE_DATABASE_PREFIX}${suffix}`;
  assert.match(successDatabaseName, SUCCESS_DATABASE_PATTERN);
  assert.match(failureDatabaseName, FAILURE_DATABASE_PATTERN);
  assert.notEqual(successDatabaseName, failureDatabaseName);
  return { successDatabaseName, failureDatabaseName };
}

function assertSafeGeneratedDatabaseName(databaseName) {
  if (
    !SUCCESS_DATABASE_PATTERN.test(databaseName) &&
    !FAILURE_DATABASE_PATTERN.test(databaseName)
  ) {
    contractError("GENERATED_DATABASE_NAME_INVALID");
  }
}

function assertSafeTempRoot(tempRoot) {
  const resolvedRoot = resolve(tempRoot);
  if (
    dirname(resolvedRoot) !== resolve(tmpdir()) ||
    !basename(resolvedRoot).startsWith(TEMP_ROOT_PREFIX)
  ) {
    contractError("TEMP_ROOT_INVALID");
  }
}

function prismaClient(databaseUrl) {
  return new PrismaClient({
    datasourceUrl: databaseUrl,
    log: [],
    transactionOptions: {
      maxWait: 5_000,
      timeout: 30_000,
    },
  });
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

  assert(
    migrationDirectories.every((migrationName) =>
      MIGRATION_PATTERN.test(migrationName),
    ),
    "Committed migration directory names must match the release contract.",
  );
  assert.equal(
    migrationDirectories.length,
    CURRENT_EXPECTED_MIGRATION_COUNT,
    "The smoke requires the exact current release migration manifest.",
  );
  assert.deepEqual(
    migrationDirectories.slice(-STAFF_TASK_ALLOWED_ADDITIVE_TAIL.length),
    [...STAFF_TASK_ALLOWED_ADDITIVE_TAIL],
    "The reviewed additive migration tail changed.",
  );
  assert.equal(
    migrationDirectories.at(-1),
    CURRENT_EXPECTED_LATEST_MIGRATION,
    "The current latest migration does not match the release contract.",
  );

  const targetMigrationIndex = migrationDirectories.indexOf(TARGET_MIGRATION);
  assert(
    targetMigrationIndex > 0,
    "Migration 165 must remain present in the reviewed additive tail.",
  );
  assert.equal(
    migrationDirectories[targetMigrationIndex - 1],
    PREFIX_MIGRATION,
    "Migration 164 must remain the exact prefix for the Store rehearsal.",
  );

  return {
    sourcePrismaDir,
    prefixMigrations: migrationDirectories.slice(0, targetMigrationIndex),
    targetMigration: TARGET_MIGRATION,
  };
}

async function assertTargetMigrationArtifact(migrationPlan) {
  const migrationSql = await readFile(
    join(
      migrationPlan.sourcePrismaDir,
      "migrations",
      migrationPlan.targetMigration,
      "migration.sql",
    ),
    "utf8",
  );

  assert.match(migrationSql, /^BEGIN;/mu);
  assert.match(migrationSql, /COMMIT;\s*$/u);
  assert.match(migrationSql, /SET LOCAL lock_timeout = '5s';/u);
  assert.match(migrationSql, /SET LOCAL statement_timeout = '120s';/u);
  assert.match(migrationSql, /LOCK TABLE "Store" IN ACCESS EXCLUSIVE MODE;/u);
  assert.match(
    migrationSql,
    /ADD COLUMN "backgroundExecutionEnabled" BOOLEAN NOT NULL DEFAULT false/u,
  );
  assert.match(
    migrationSql,
    /ADD COLUMN "executionRevision" INTEGER NOT NULL DEFAULT 0/u,
  );
  assert.match(
    migrationSql,
    /CONSTRAINT "Store_executionRevision_nonnegative_check"/u,
  );
  assert.match(
    migrationSql,
    /CONSTRAINT "Store_backgroundExecution_requires_active_check"/u,
  );
  assert.match(
    migrationSql,
    /CREATE OR REPLACE FUNCTION public\."store_execution_revision_fence"\(\)/u,
  );
  assert.match(migrationSql, /SET search_path = pg_catalog/u);
  assert.match(
    migrationSql,
    /REVOKE ALL ON FUNCTION public\."store_execution_revision_fence"\(\) FROM PUBLIC;/u,
  );
  assert.match(
    migrationSql,
    /CREATE TRIGGER "Store_execution_revision_fence_trigger"/u,
  );
  assert.match(
    migrationSql,
    /IF OLD\."executionRevision" >= 2147483647 THEN[\s\S]*ERRCODE = '22003'/u,
  );
  assert.match(
    migrationSql,
    /OLD\."executionRevision" = 2147483646[\s\S]*authority_reduced[\s\S]*one terminal revocation[\s\S]*NEW\."executionRevision" := 2147483647;/u,
  );
  assert.equal(
    migrationSql.match(
      /NEW\."executionRevision" := OLD\."executionRevision" \+ 1;/gu,
    )?.length,
    1,
    "The Store fence must have exactly one revision-advance assignment.",
  );

  const orderedBoundaries = [
    migrationSql.indexOf("BEGIN;"),
    migrationSql.indexOf("SET LOCAL lock_timeout = '5s';"),
    migrationSql.indexOf('LOCK TABLE "Store" IN ACCESS EXCLUSIVE MODE;'),
    migrationSql.indexOf('ALTER TABLE "Store"'),
    migrationSql.indexOf(
      'CREATE OR REPLACE FUNCTION public."store_execution_revision_fence"()',
    ),
    migrationSql.indexOf(
      'REVOKE ALL ON FUNCTION public."store_execution_revision_fence"() FROM PUBLIC;',
    ),
    migrationSql.indexOf(
      'CREATE TRIGGER "Store_execution_revision_fence_trigger"',
    ),
    migrationSql.lastIndexOf("COMMIT;"),
  ];
  assert(
    orderedBoundaries.every(
      (boundary, index) =>
        boundary >= 0 &&
        (index === 0 || boundary > orderedBoundaries[index - 1]),
    ),
    "Migration 165 must retain BEGIN -> timeout -> lock -> ALTER -> function -> revoke -> trigger -> COMMIT ordering.",
  );

  const lockSql = migrationSql.match(
    /LOCK TABLE "Store" IN ACCESS EXCLUSIVE MODE;/u,
  )?.[0];
  assert(lockSql, "Migration 165 must retain the exact Store lock statement.");
  const triggerSql = migrationSql.match(
    /CREATE TRIGGER "Store_execution_revision_fence_trigger"[\s\S]*?EXECUTE FUNCTION public\."store_execution_revision_fence"\(\);/u,
  )?.[0];
  assert(
    triggerSql,
    "Migration 165 must retain the exact schema-qualified trigger statement.",
  );
  return { lockSql, triggerSql };
}

async function createMigrationArtifact(tempRoot, migrationPlan) {
  assertSafeTempRoot(tempRoot);
  const targetPrismaDir = join(tempRoot, "prisma");
  const targetMigrationsDir = join(targetPrismaDir, "migrations");
  await mkdir(targetMigrationsDir, { recursive: true });
  await copyFile(
    join(migrationPlan.sourcePrismaDir, "schema.prisma"),
    join(targetPrismaDir, "schema.prisma"),
  );
  await copyFile(
    join(migrationPlan.sourcePrismaDir, "migrations", "migration_lock.toml"),
    join(targetMigrationsDir, "migration_lock.toml"),
  );

  for (const migrationName of migrationPlan.prefixMigrations) {
    await cp(
      join(migrationPlan.sourcePrismaDir, "migrations", migrationName),
      join(targetMigrationsDir, migrationName),
      { recursive: true },
    );
  }

  return {
    schemaPath: join(targetPrismaDir, "schema.prisma"),
    targetMigrationsDir,
  };
}

async function addTargetMigrationToArtifact(artifact, migrationPlan) {
  await cp(
    join(
      migrationPlan.sourcePrismaDir,
      "migrations",
      migrationPlan.targetMigration,
    ),
    join(artifact.targetMigrationsDir, migrationPlan.targetMigration),
    { recursive: true },
  );
}

function prismaCliPath() {
  const require = createRequire(import.meta.url);
  return require.resolve("prisma/build/index.js");
}

function migrationEnvironment(databaseUrl) {
  return {
    ...process.env,
    DATABASE_URL: databaseUrl,
    NODE_ENV: "test",
    PGOPTIONS: "-c lock_timeout=5000 -c statement_timeout=120000",
    NO_COLOR: "1",
    PRISMA_HIDE_UPDATE_MESSAGE: "true",
  };
}

function spawnMigrateDeploy(schemaPath, databaseUrl) {
  const startedAt = Date.now();
  const result = spawnSync(
    process.execPath,
    [prismaCliPath(), "migrate", "deploy", "--schema", schemaPath],
    {
      cwd: dirname(schemaPath),
      encoding: "utf8",
      env: migrationEnvironment(databaseUrl),
      maxBuffer: 4 * 1024 * 1024,
      timeout: MIGRATION_TIMEOUT_MS,
      windowsHide: true,
    },
  );
  return {
    result,
    elapsedMs: Date.now() - startedAt,
    output: `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
  };
}

function runMigrateDeploy(schemaPath, databaseUrl) {
  const attempt = spawnMigrateDeploy(schemaPath, databaseUrl);
  if (attempt.result.error || attempt.result.status !== 0) {
    const error = new Error("Prisma migrate deploy failed.");
    error.code = "MIGRATION_DEPLOY_FAILED";
    error.cause = attempt.result.error;
    error.output = attempt.output;
    throw error;
  }
}

function runMigrateResolveRolledBack(schemaPath, databaseUrl) {
  const result = spawnSync(
    process.execPath,
    [
      prismaCliPath(),
      "migrate",
      "resolve",
      "--rolled-back",
      TARGET_MIGRATION,
      "--schema",
      schemaPath,
    ],
    {
      cwd: dirname(schemaPath),
      encoding: "utf8",
      env: migrationEnvironment(databaseUrl),
      maxBuffer: 4 * 1024 * 1024,
      timeout: MIGRATION_TIMEOUT_MS,
      windowsHide: true,
    },
  );
  if (result.error || result.status !== 0) {
    contractError("MIGRATION_RESOLVE_ROLLED_BACK_FAILED");
  }
}

function assertLateDdlFailure(attempt) {
  assert.equal(
    attempt.result.error,
    undefined,
    "The migration process itself must not time out or fail to spawn.",
  );
  assert.notEqual(
    attempt.result.status,
    0,
    "Migration 165 unexpectedly ignored the conflicting trigger.",
  );
  assert(
    attempt.elapsedMs < FAILURE_TIMEOUT_MS,
    "The late-DDL conflict did not fail inside the bounded window.",
  );
  assert.match(
    attempt.output,
    /(?:P3018|failed to apply|20260729120000_store_background_execution_fence)/iu,
    "Prisma did not report the target-migration failure.",
  );
}

function assertLockTimeoutFailure(attempt) {
  assert.equal(
    attempt.result.error,
    undefined,
    "The migration process itself must not time out or fail to spawn.",
  );
  assert.notEqual(
    attempt.result.status,
    0,
    "Migration 165 unexpectedly acquired the blocked Store lock.",
  );
  assert(
    attempt.elapsedMs >= 4_000 && attempt.elapsedMs < FAILURE_TIMEOUT_MS,
    "Migration 165 did not fail inside its bounded lock-timeout window.",
  );
  assert.match(
    attempt.output,
    /(?:P3018|failed to apply|20260729120000_store_background_execution_fence)/iu,
    "Prisma did not report the lock-timeout target-migration failure.",
  );
}

async function assertTestSuperuser(admin, expectedDatabaseName) {
  const rows = await admin.$queryRawUnsafe(
    `SELECT
       current_database() AS database_name,
       current_setting('server_version_num')::int AS server_version_number,
       role.rolsuper AS is_superuser
     FROM pg_roles AS role
     WHERE role.rolname = current_user`,
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].database_name, expectedDatabaseName);
  assert.equal(
    Math.floor(rows[0].server_version_number / 10_000),
    16,
    "The Store fence smoke requires PostgreSQL 16.",
  );
  assert.equal(
    rows[0].is_superuser,
    true,
    "The Store fence smoke requires a disposable-cluster test superuser.",
  );
}

async function acquireClusterLock(admin) {
  const [row] = await admin.$queryRawUnsafe(
    `SELECT pg_try_advisory_lock($1::int, $2::int) AS acquired`,
    CLUSTER_LOCK_CLASS,
    CLUSTER_LOCK_OBJECT,
  );
  assert.equal(
    row?.acquired,
    true,
    "Another Store fence upgrade smoke is already running.",
  );
}

async function releaseClusterLock(admin) {
  const [row] = await admin.$queryRawUnsafe(
    `SELECT pg_advisory_unlock($1::int, $2::int) AS released`,
    CLUSTER_LOCK_CLASS,
    CLUSTER_LOCK_OBJECT,
  );
  assert.equal(row?.released, true);
}

async function createDisposableDatabase(admin, databaseName) {
  assertSafeGeneratedDatabaseName(databaseName);
  await admin.$executeRawUnsafe(
    `CREATE DATABASE ${quoteIdentifier(databaseName)} TEMPLATE template0`,
  );
}

async function dropDisposableDatabase(admin, databaseName) {
  assertSafeGeneratedDatabaseName(databaseName);
  await admin.$executeRawUnsafe(
    `DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)} WITH (FORCE)`,
  );
}

function normalizeRows(rows) {
  return JSON.parse(JSON.stringify(rows));
}

async function readSourceMigrationState(admin) {
  return normalizeRows(
    await admin.$queryRawUnsafe(
      `SELECT
         "migration_name", "checksum",
         ("finished_at" IS NOT NULL AND "rolled_back_at" IS NULL) AS applied,
         ("finished_at" IS NULL AND "rolled_back_at" IS NULL) AS unfinished
       FROM "_prisma_migrations"
       ORDER BY "started_at" ASC, "migration_name" ASC`,
    ),
  );
}

async function readMigrationSummary(databaseUrl) {
  const client = prismaClient(databaseUrl);
  try {
    return await client.$queryRawUnsafe(
      `SELECT
         "migration_name",
         ("finished_at" IS NOT NULL AND "rolled_back_at" IS NULL) AS applied,
         ("finished_at" IS NULL AND "rolled_back_at" IS NULL) AS unfinished,
         ("rolled_back_at" IS NOT NULL) AS rolled_back
       FROM "_prisma_migrations"
       ORDER BY "started_at" ASC, "migration_name" ASC`,
    );
  } finally {
    await client.$disconnect();
  }
}

async function assertExactAppliedMigrations(databaseUrl, expectedMigrations) {
  const summary = await readMigrationSummary(databaseUrl);
  const applied = summary
    .filter((row) => row.applied)
    .map((row) => row.migration_name);
  const unfinished = summary.filter((row) => row.unfinished);
  assert.deepEqual(applied, expectedMigrations);
  assert.equal(unfinished.length, 0);
}

async function readTargetAttemptCounts(client) {
  const [row] = await client.$queryRawUnsafe(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (
         WHERE "finished_at" IS NULL AND "rolled_back_at" IS NULL
       )::int AS unfinished,
       COUNT(*) FILTER (
         WHERE "rolled_back_at" IS NOT NULL
       )::int AS rolled_back,
       COUNT(*) FILTER (
         WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL
       )::int AS applied
     FROM "_prisma_migrations"
     WHERE "migration_name" = $1`,
    TARGET_MIGRATION,
  );
  return row;
}

async function createFixtures(client, fixtureKey) {
  const tenantId = randomUUID();
  const stores = {
    active: {
      id: randomUUID(),
      name: "Store fence active fixture",
      isActive: true,
      gamificationEnabled: true,
    },
    inactive: {
      id: randomUUID(),
      name: "Store fence inactive fixture",
      isActive: false,
      gamificationEnabled: false,
    },
  };

  await client.$transaction(async (transaction) => {
    await transaction.$executeRawUnsafe(
      `INSERT INTO "Tenant" ("id", "name", "slug", "updatedAt")
       VALUES ($1, 'Store fence tenant', $2, CURRENT_TIMESTAMP)`,
      tenantId,
      `store-fence-${fixtureKey}`,
    );
    for (const store of Object.values(stores)) {
      await transaction.$executeRawUnsafe(
        `INSERT INTO "Store" (
           "id", "tenantId", "name", "isActive",
           "gamificationEnabled", "updatedAt"
         )
         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
        store.id,
        tenantId,
        store.name,
        store.isActive,
        store.gamificationEnabled,
      );
    }
  });

  return { tenantId, stores };
}

async function readFixtureSnapshot(client, fixtures) {
  return normalizeRows(
    await client.$queryRawUnsafe(
      `SELECT
         "id", "tenantId", "name", "isActive", "gamificationEnabled",
         "integrationSourceId", "externalProvider", "externalDomain",
         "externalClubId"
       FROM "Store"
       WHERE "id" = ANY($1::text[])
       ORDER BY "id"`,
      Object.values(fixtures.stores).map((store) => store.id),
    ),
  );
}

async function readStoreFenceCatalog(client) {
  const columns = await client.$queryRawUnsafe(
    `SELECT column_name, data_type, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'Store'
       AND column_name IN (
         'backgroundExecutionEnabled',
         'executionRevision'
       )
     ORDER BY column_name`,
  );
  const constraints = await client.$queryRawUnsafe(
    `SELECT
       constraint_row.conname AS name,
       constraint_row.convalidated AS validated,
       pg_get_constraintdef(constraint_row.oid) AS definition
     FROM pg_constraint AS constraint_row
     WHERE constraint_row.conrelid = '"Store"'::regclass
       AND constraint_row.conname IN (
         'Store_executionRevision_nonnegative_check',
         'Store_backgroundExecution_requires_active_check'
       )
     ORDER BY constraint_row.conname`,
  );
  const triggers = await client.$queryRawUnsafe(
    `SELECT
       trigger_row.tgname AS name,
       trigger_row.tgenabled AS enabled,
       function_row.proname AS function_name,
       pg_get_triggerdef(trigger_row.oid) AS definition
     FROM pg_trigger AS trigger_row
     JOIN pg_proc AS function_row ON function_row.oid = trigger_row.tgfoid
     WHERE trigger_row.tgrelid = '"Store"'::regclass
       AND trigger_row.tgname = 'Store_execution_revision_fence_trigger'
       AND NOT trigger_row.tgisinternal`,
  );
  const functions = await client.$queryRawUnsafe(
    `SELECT
       function_row.proname AS name,
       function_row.prosecdef AS security_definer,
       function_row.proconfig AS configuration,
       pg_get_functiondef(function_row.oid) AS definition,
       EXISTS (
         SELECT 1
         FROM aclexplode(
           COALESCE(
             function_row.proacl,
             acldefault('f', function_row.proowner)
           )
         ) AS privilege
         WHERE privilege.grantee = 0
           AND privilege.privilege_type = 'EXECUTE'
       ) AS public_execute
     FROM pg_proc AS function_row
     WHERE function_row.oid =
       to_regprocedure('public.store_execution_revision_fence()')`,
  );

  return normalizeRows({ columns, constraints, triggers, functions });
}

function assertPre165Catalog(catalog) {
  assert.deepEqual(catalog.columns, []);
  assert.deepEqual(catalog.constraints, []);
  assert.deepEqual(catalog.triggers, []);
  assert.deepEqual(catalog.functions, []);
}

function assertPost165Catalog(catalog) {
  assert.deepEqual(catalog.columns, [
    {
      column_name: "backgroundExecutionEnabled",
      data_type: "boolean",
      is_nullable: "NO",
      column_default: "false",
    },
    {
      column_name: "executionRevision",
      data_type: "integer",
      is_nullable: "NO",
      column_default: "0",
    },
  ]);
  assert.deepEqual(
    catalog.constraints.map((constraint) => constraint.name),
    [
      "Store_backgroundExecution_requires_active_check",
      "Store_executionRevision_nonnegative_check",
    ],
  );
  assert(catalog.constraints.every((constraint) => constraint.validated));
  const activeConstraint = catalog.constraints.find(
    (constraint) =>
      constraint.name === "Store_backgroundExecution_requires_active_check",
  );
  const revisionConstraint = catalog.constraints.find(
    (constraint) =>
      constraint.name === "Store_executionRevision_nonnegative_check",
  );
  assert.match(
    activeConstraint?.definition ?? "",
    /NOT "backgroundExecutionEnabled".*"isActive"/u,
  );
  assert.match(
    revisionConstraint?.definition ?? "",
    /"executionRevision" >= 0/u,
  );
  assert.equal(catalog.triggers.length, 1);
  assert.equal(catalog.triggers[0].enabled, "O");
  assert.equal(
    catalog.triggers[0].function_name,
    "store_execution_revision_fence",
  );
  assert.match(catalog.triggers[0].definition, /BEFORE INSERT OR UPDATE OF/u);
  for (const column of [
    "isActive",
    "gamificationEnabled",
    "backgroundExecutionEnabled",
    "integrationSourceId",
    "externalProvider",
    "externalDomain",
    "externalClubId",
    "executionRevision",
  ]) {
    assert.match(
      catalog.triggers[0].definition,
      new RegExp(`"${column}"`, "u"),
    );
  }
  assert.equal(catalog.functions.length, 1);
  assert.equal(catalog.functions[0].name, "store_execution_revision_fence");
  assert.equal(catalog.functions[0].security_definer, false);
  assert.deepEqual(catalog.functions[0].configuration, [
    "search_path=pg_catalog",
  ]);
  assert.equal(catalog.functions[0].public_execute, false);
  assert.match(
    catalog.functions[0].definition,
    /Store execution revision is trigger-owned/u,
  );
}

async function expectSqlState(expectedState, operation) {
  let caught;
  try {
    await operation();
  } catch (error) {
    caught = error;
  }
  assert(caught, `PostgreSQL did not raise SQLSTATE ${expectedState}.`);
  const actualState =
    caught?.meta?.code ??
    caught?.cause?.code ??
    (typeof caught?.code === "string" && /^\d{5}$/.test(caught.code)
      ? caught.code
      : null);
  assert.equal(
    actualState,
    expectedState,
    "PostgreSQL rejected the operation with an unexpected SQLSTATE.",
  );
  return caught;
}

async function assertExistingRowsFailClosed(
  client,
  fixtures,
  baselineSnapshot,
) {
  assert.deepEqual(
    await readFixtureSnapshot(client, fixtures),
    baselineSnapshot,
    "Migration 165 changed pre-existing Store business data.",
  );
  const rows = await client.$queryRawUnsafe(
    `SELECT "id", "backgroundExecutionEnabled", "executionRevision"
     FROM "Store"
     WHERE "id" = ANY($1::text[])
     ORDER BY "id"`,
    Object.values(fixtures.stores).map((store) => store.id),
  );
  assert.equal(rows.length, 2);
  assert(
    rows.every(
      (row) =>
        row.backgroundExecutionEnabled === false && row.executionRevision === 0,
    ),
    "Existing Stores did not receive fail-closed false/0 defaults.",
  );
}

async function assertStoreFenceSemantics(client, fixtures, fixtureKey) {
  const newStoreId = randomUUID();
  await client.$executeRawUnsafe(
    `INSERT INTO "Store" ("id", "tenantId", "name", "updatedAt")
     VALUES ($1, $2, 'New fail-closed Store', CURRENT_TIMESTAMP)`,
    newStoreId,
    fixtures.tenantId,
  );
  const [newStore] = await client.$queryRawUnsafe(
    `SELECT
       "isActive", "gamificationEnabled",
       "backgroundExecutionEnabled", "executionRevision"
     FROM "Store"
     WHERE "id" = $1`,
    newStoreId,
  );
  assert.deepEqual(newStore, {
    isActive: true,
    gamificationEnabled: false,
    backgroundExecutionEnabled: false,
    executionRevision: 0,
  });

  const invalidAuthorityStoreId = randomUUID();
  await expectSqlState("23514", () =>
    client.$executeRawUnsafe(
      `INSERT INTO "Store" (
         "id", "tenantId", "name",
         "backgroundExecutionEnabled", "updatedAt"
       )
       VALUES (
         $1, $2, 'Invalid initially enabled Store', true, CURRENT_TIMESTAMP
       )`,
      invalidAuthorityStoreId,
      fixtures.tenantId,
    ),
  );
  const invalidRevisionStoreId = randomUUID();
  await expectSqlState("23514", () =>
    client.$executeRawUnsafe(
      `INSERT INTO "Store" (
         "id", "tenantId", "name", "executionRevision", "updatedAt"
       )
       VALUES (
         $1, $2, 'Invalid initial Store revision', 1, CURRENT_TIMESTAMP
       )`,
      invalidRevisionStoreId,
      fixtures.tenantId,
    ),
  );
  const [rejectedInsertCount] = await client.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS count
     FROM "Store"
     WHERE "id" = ANY($1::text[])`,
    [invalidAuthorityStoreId, invalidRevisionStoreId],
  );
  assert.equal(
    rejectedInsertCount.count,
    0,
    "Rejected Store inserts must not leave rows behind.",
  );

  const activeStoreId = fixtures.stores.active.id;
  await client.$executeRawUnsafe(
    `UPDATE "Store"
     SET
       "gamificationEnabled" = false,
       "backgroundExecutionEnabled" = true,
       "externalProvider" = 'LANGAME'::"IntegrationProvider",
       "externalDomain" = $2,
       "externalClubId" = $3
     WHERE "id" = $1`,
    activeStoreId,
    `store-fence-${fixtureKey}.invalid`,
    `club-${fixtureKey}`,
  );
  let [activeStore] = await client.$queryRawUnsafe(
    `SELECT
       "isActive", "gamificationEnabled", "backgroundExecutionEnabled",
       "externalProvider", "externalDomain", "externalClubId",
       "executionRevision"
     FROM "Store"
     WHERE "id" = $1`,
    activeStoreId,
  );
  assert.deepEqual(activeStore, {
    isActive: true,
    gamificationEnabled: false,
    backgroundExecutionEnabled: true,
    externalProvider: "LANGAME",
    externalDomain: `store-fence-${fixtureKey}.invalid`,
    externalClubId: `club-${fixtureKey}`,
    executionRevision: 1,
  });

  await client.$executeRawUnsafe(
    `UPDATE "Store"
     SET "name" = "name" || ' unrelated'
     WHERE "id" = $1`,
    activeStoreId,
  );
  [activeStore] = await client.$queryRawUnsafe(
    `SELECT "executionRevision"
     FROM "Store"
     WHERE "id" = $1`,
    activeStoreId,
  );
  assert.equal(activeStore.executionRevision, 1);

  await expectSqlState("23514", () =>
    client.$executeRawUnsafe(
      `UPDATE "Store"
       SET "executionRevision" = "executionRevision" + 1
       WHERE "id" = $1`,
      activeStoreId,
    ),
  );

  await expectSqlState("23514", () =>
    client.$executeRawUnsafe(
      `UPDATE "Store"
       SET "backgroundExecutionEnabled" = true
       WHERE "id" = $1`,
      fixtures.stores.inactive.id,
    ),
  );

  await client.$executeRawUnsafe(
    `UPDATE "Store"
     SET "isActive" = false
     WHERE "id" = $1`,
    activeStoreId,
  );
  [activeStore] = await client.$queryRawUnsafe(
    `SELECT
       "isActive", "backgroundExecutionEnabled", "executionRevision"
     FROM "Store"
     WHERE "id" = $1`,
    activeStoreId,
  );
  assert.deepEqual(activeStore, {
    isActive: false,
    backgroundExecutionEnabled: false,
    executionRevision: 2,
  });

  const exhaustionStoreId = newStoreId;
  let triggerDisabled = false;
  try {
    await client.$executeRawUnsafe(
      `ALTER TABLE "Store"
       DISABLE TRIGGER "Store_execution_revision_fence_trigger"`,
    );
    triggerDisabled = true;
    await client.$executeRawUnsafe(
      `UPDATE "Store"
       SET
         "backgroundExecutionEnabled" = true,
         "executionRevision" = 2147483646
       WHERE "id" = $1`,
      exhaustionStoreId,
    );
  } finally {
    if (triggerDisabled) {
      await client.$executeRawUnsafe(
        `ALTER TABLE "Store"
         ENABLE TRIGGER "Store_execution_revision_fence_trigger"`,
      );
    }
  }
  await expectSqlState("22003", () =>
    client.$executeRawUnsafe(
      `UPDATE "Store"
       SET "gamificationEnabled" = true
       WHERE "id" = $1`,
      exhaustionStoreId,
    ),
  );
  await client.$executeRawUnsafe(
    `UPDATE "Store"
     SET "backgroundExecutionEnabled" = false
     WHERE "id" = $1`,
    exhaustionStoreId,
  );
  await expectSqlState("22003", () =>
    client.$executeRawUnsafe(
      `UPDATE "Store"
       SET "gamificationEnabled" = true
       WHERE "id" = $1`,
      exhaustionStoreId,
    ),
  );
  const [exhaustionStore] = await client.$queryRawUnsafe(
    `SELECT
       "gamificationEnabled", "backgroundExecutionEnabled",
       "executionRevision"
     FROM "Store"
     WHERE "id" = $1`,
    exhaustionStoreId,
  );
  assert.deepEqual(exhaustionStore, {
    gamificationEnabled: false,
    backgroundExecutionEnabled: false,
    executionRevision: 2147483647,
  });
  const [triggerState] = await client.$queryRawUnsafe(
    `SELECT tgenabled AS enabled
     FROM pg_trigger
     WHERE tgrelid = '"Store"'::regclass
       AND tgname = 'Store_execution_revision_fence_trigger'`,
  );
  assert.equal(triggerState.enabled, "O");
}

async function waitForBackendRowLock(observerClient, backendPid) {
  for (let attempt = 0; attempt < 256; attempt += 1) {
    const [activity] = await observerClient.$queryRawUnsafe(
      `SELECT
         state,
         wait_event_type,
         wait_event,
         query
       FROM pg_stat_activity
       WHERE pid = $1`,
      backendPid,
    );
    if (activity?.state === "active" && activity?.wait_event_type === "Lock") {
      assert.match(
        activity.query ?? "",
        /UPDATE "Store"[\s\S]*SET "isActive" = false/u,
        "The observed lock waiter was not the concurrent Store archive.",
      );
      return {
        waitEventType: activity.wait_event_type,
        waitEvent: activity.wait_event,
      };
    }
  }

  assert.fail(
    "The concurrent Store archive did not reach a PostgreSQL row-lock wait.",
  );
}

async function assertConcurrentStoreFenceSemantics(
  observerClient,
  databaseUrl,
  fixtures,
) {
  const concurrentStoreId = randomUUID();
  await observerClient.$executeRawUnsafe(
    `INSERT INTO "Store" ("id", "tenantId", "name", "updatedAt")
     VALUES ($1, $2, 'Concurrent Store fence fixture', CURRENT_TIMESTAMP)`,
    concurrentStoreId,
    fixtures.tenantId,
  );
  await observerClient.$executeRawUnsafe(
    `UPDATE "Store"
     SET "backgroundExecutionEnabled" = true
     WHERE "id" = $1`,
    concurrentStoreId,
  );
  const [initialStore] = await observerClient.$queryRawUnsafe(
    `SELECT
       "isActive", "gamificationEnabled",
       "backgroundExecutionEnabled", "executionRevision"
     FROM "Store"
     WHERE "id" = $1`,
    concurrentStoreId,
  );
  assert.deepEqual(initialStore, {
    isActive: true,
    gamificationEnabled: false,
    backgroundExecutionEnabled: true,
    executionRevision: 1,
  });

  const firstClient = prismaClient(databaseUrl);
  const secondClient = prismaClient(databaseUrl);
  let signalFirstLock;
  let releaseFirstLock;
  let signalSecondBackend;
  const firstLockAcquired = new Promise((resolveLock) => {
    signalFirstLock = resolveLock;
  });
  const firstLockRelease = new Promise((resolveRelease) => {
    releaseFirstLock = resolveRelease;
  });
  const secondBackendReady = new Promise((resolveBackend) => {
    signalSecondBackend = resolveBackend;
  });

  let firstTransaction;
  let secondTransaction;
  let barrierReleased = false;
  let hasPrimaryError = false;
  let primaryError;
  let result;
  const releaseBarrier = () => {
    if (!barrierReleased) {
      barrierReleased = true;
      releaseFirstLock();
    }
  };

  try {
    firstTransaction = firstClient.$transaction(
      async (transaction) => {
        const [lockedStore] = await transaction.$queryRawUnsafe(
          `SELECT "executionRevision"
           FROM "Store"
           WHERE "id" = $1
           FOR UPDATE`,
          concurrentStoreId,
        );
        assert.equal(lockedStore.executionRevision, 1);
        signalFirstLock();
        await firstLockRelease;
        const [updatedStore] = await transaction.$queryRawUnsafe(
          `UPDATE "Store"
           SET "gamificationEnabled" = true
           WHERE "id" = $1
           RETURNING
             "isActive", "gamificationEnabled",
             "backgroundExecutionEnabled", "executionRevision"`,
          concurrentStoreId,
        );
        return updatedStore;
      },
      { maxWait: 5_000, timeout: 30_000 },
    );

    await Promise.race([
      firstLockAcquired,
      firstTransaction.then(
        () => contractError("FIRST_STORE_TRANSACTION_RELEASED_EARLY"),
        (error) => {
          throw error;
        },
      ),
    ]);

    secondTransaction = secondClient.$transaction(
      async (transaction) => {
        const [backend] = await transaction.$queryRawUnsafe(
          `SELECT pg_backend_pid() AS pid`,
        );
        signalSecondBackend(backend.pid);
        const [archivedStore] = await transaction.$queryRawUnsafe(
          `UPDATE "Store"
           SET "isActive" = false
           WHERE "id" = $1
           RETURNING
             "isActive", "gamificationEnabled",
             "backgroundExecutionEnabled", "executionRevision"`,
          concurrentStoreId,
        );
        return archivedStore;
      },
      { maxWait: 5_000, timeout: 30_000 },
    );

    const secondBackendPid = await Promise.race([
      secondBackendReady,
      secondTransaction.then(
        () => contractError("SECOND_STORE_TRANSACTION_DID_NOT_WAIT"),
        (error) => {
          throw error;
        },
      ),
    ]);
    const lockObservation = await waitForBackendRowLock(
      observerClient,
      secondBackendPid,
    );
    releaseBarrier();
    const [firstResult, secondResult] = await Promise.all([
      firstTransaction,
      secondTransaction,
    ]);
    assert.deepEqual(firstResult, {
      isActive: true,
      gamificationEnabled: true,
      backgroundExecutionEnabled: true,
      executionRevision: 2,
    });
    assert.deepEqual(secondResult, {
      isActive: false,
      gamificationEnabled: true,
      backgroundExecutionEnabled: false,
      executionRevision: 3,
    });
    assert.equal(lockObservation?.waitEventType, "Lock");

    const [finalStore] = await observerClient.$queryRawUnsafe(
      `SELECT
         "isActive", "gamificationEnabled",
         "backgroundExecutionEnabled", "executionRevision"
       FROM "Store"
       WHERE "id" = $1`,
      concurrentStoreId,
    );
    assert.deepEqual(finalStore, {
      isActive: false,
      gamificationEnabled: true,
      backgroundExecutionEnabled: false,
      executionRevision: 3,
    });
    result = {
      lockWaitObserved: true,
      serializedRevisions: [2, 3],
      noLostUpdate: true,
      finalArchiveFailClosed: true,
    };
  } catch (error) {
    hasPrimaryError = true;
    primaryError = error;
  } finally {
    releaseBarrier();
    const cleanupErrors = [];
    const transactionSettlements = await Promise.allSettled(
      [firstTransaction, secondTransaction].filter(
        (transaction) => transaction !== undefined,
      ),
    );
    for (const settlement of transactionSettlements) {
      if (
        settlement.status === "rejected" &&
        (!hasPrimaryError || settlement.reason !== primaryError)
      ) {
        cleanupErrors.push(settlement.reason);
      }
    }
    const disconnectSettlements = await Promise.allSettled([
      firstClient.$disconnect(),
      secondClient.$disconnect(),
    ]);
    for (const settlement of disconnectSettlements) {
      if (settlement.status === "rejected") {
        cleanupErrors.push(settlement.reason);
      }
    }

    if (hasPrimaryError && cleanupErrors.length > 0) {
      if (
        typeof primaryError === "object" &&
        primaryError !== null &&
        Object.isExtensible(primaryError)
      ) {
        primaryError.cleanupErrors = cleanupErrors;
      }
    } else if (!hasPrimaryError && cleanupErrors.length > 0) {
      hasPrimaryError = true;
      primaryError = new AggregateError(
        cleanupErrors,
        "Concurrent Store fence cleanup failed.",
      );
    }
  }

  if (hasPrimaryError) {
    throw primaryError;
  }
  return result;
}

async function createLateDdlConflict(client) {
  await client.$executeRawUnsafe(
    `CREATE FUNCTION public."store_execution_revision_fence"()
     RETURNS TRIGGER
     LANGUAGE plpgsql
     AS $$
     BEGIN
       RETURN NEW;
     END;
     $$`,
  );
  await client.$executeRawUnsafe(
    `CREATE TRIGGER "Store_execution_revision_fence_trigger"
     BEFORE INSERT ON "Store"
     FOR EACH ROW
     EXECUTE FUNCTION public."store_execution_revision_fence"()`,
  );
}

async function runLockTimeoutRollback(
  schemaPath,
  databaseUrl,
  fixtures,
  baselineSnapshot,
  migrationSqlContract,
) {
  const blockerClient = prismaClient(databaseUrl);
  const probeClient = prismaClient(databaseUrl);
  let signalLockAcquired;
  let releaseLock;
  const lockAcquired = new Promise((resolveLock) => {
    signalLockAcquired = resolveLock;
  });
  const lockRelease = new Promise((resolveRelease) => {
    releaseLock = resolveRelease;
  });
  const blockingTransaction = blockerClient.$transaction(
    async (transaction) => {
      await transaction.$executeRawUnsafe(
        `LOCK TABLE "Store" IN ACCESS SHARE MODE`,
      );
      signalLockAcquired();
      await lockRelease;
    },
    { maxWait: 5_000, timeout: 30_000 },
  );

  try {
    await Promise.race([
      lockAcquired,
      blockingTransaction.then(
        () => contractError("STORE_LOCK_RELEASED_BEFORE_REHEARSAL"),
        (error) => {
          throw error;
        },
      ),
    ]);
    await expectSqlState("55P03", () =>
      probeClient.$transaction(async (transaction) => {
        await transaction.$executeRawUnsafe(`SET LOCAL lock_timeout = '250ms'`);
        await transaction.$executeRawUnsafe(migrationSqlContract.lockSql);
      }),
    );
    const failedAttempt = spawnMigrateDeploy(schemaPath, databaseUrl);
    assertLockTimeoutFailure(failedAttempt);
  } finally {
    releaseLock();
    try {
      await blockingTransaction;
    } finally {
      await Promise.all([
        blockerClient.$disconnect(),
        probeClient.$disconnect(),
      ]);
    }
  }

  const rollbackClient = prismaClient(databaseUrl);
  try {
    assertPre165Catalog(await readStoreFenceCatalog(rollbackClient));
    assert.deepEqual(
      await readFixtureSnapshot(rollbackClient, fixtures),
      baselineSnapshot,
      "The lock-timeout migration attempt changed Store fixture data.",
    );
    assert.deepEqual(await readTargetAttemptCounts(rollbackClient), {
      total: 1,
      unfinished: 1,
      rolled_back: 0,
      applied: 0,
    });
  } finally {
    await rollbackClient.$disconnect();
  }

  runMigrateResolveRolledBack(schemaPath, databaseUrl);
}

async function removeLateDdlConflict(client) {
  await client.$executeRawUnsafe(
    `DROP TRIGGER "Store_execution_revision_fence_trigger" ON "Store"`,
  );
  await client.$executeRawUnsafe(
    `DROP FUNCTION public."store_execution_revision_fence"()`,
  );
}

function assertDummyConflictCatalog(catalog) {
  assert.deepEqual(catalog.columns, []);
  assert.deepEqual(catalog.constraints, []);
  assert.equal(catalog.triggers.length, 1);
  assert.equal(catalog.triggers[0].enabled, "O");
  assert.equal(
    catalog.triggers[0].function_name,
    "store_execution_revision_fence",
  );
  assert.match(catalog.triggers[0].definition, /BEFORE INSERT ON/u);
  assert.equal(catalog.functions.length, 1);
  assert.equal(catalog.functions[0].public_execute, true);
  assert.equal(catalog.functions[0].configuration, null);
  assert.match(catalog.functions[0].definition, /RETURN NEW;/u);
  assert.doesNotMatch(
    catalog.functions[0].definition,
    /Store execution revision is trigger-owned/u,
  );
}

async function runSuccessfulUpgrade(
  schemaPath,
  databaseUrl,
  migrationPlan,
  fixtures,
  baselineSnapshot,
  fixtureKey,
) {
  runMigrateDeploy(schemaPath, databaseUrl);
  runMigrateDeploy(schemaPath, databaseUrl);
  await assertExactAppliedMigrations(databaseUrl, [
    ...migrationPlan.prefixMigrations,
    migrationPlan.targetMigration,
  ]);

  const client = prismaClient(databaseUrl);
  try {
    assertPost165Catalog(await readStoreFenceCatalog(client));
    await assertExistingRowsFailClosed(client, fixtures, baselineSnapshot);
    await assertStoreFenceSemantics(client, fixtures, fixtureKey);
    await assertConcurrentStoreFenceSemantics(client, databaseUrl, fixtures);
    assert.deepEqual(await readTargetAttemptCounts(client), {
      total: 1,
      unfinished: 0,
      rolled_back: 0,
      applied: 1,
    });
  } finally {
    await client.$disconnect();
  }
}

async function runLateDdlRollbackAndRecovery(
  schemaPath,
  databaseUrl,
  migrationPlan,
  fixtures,
  baselineSnapshot,
  migrationSqlContract,
) {
  const setupClient = prismaClient(databaseUrl);
  try {
    assertPre165Catalog(await readStoreFenceCatalog(setupClient));
    await createLateDdlConflict(setupClient);
    assertDummyConflictCatalog(await readStoreFenceCatalog(setupClient));
    await expectSqlState("42710", () =>
      setupClient.$executeRawUnsafe(migrationSqlContract.triggerSql),
    );
  } finally {
    await setupClient.$disconnect();
  }

  const failedAttempt = spawnMigrateDeploy(schemaPath, databaseUrl);
  assertLateDdlFailure(failedAttempt);

  const rollbackClient = prismaClient(databaseUrl);
  try {
    assertDummyConflictCatalog(await readStoreFenceCatalog(rollbackClient));
    assert.deepEqual(
      await readFixtureSnapshot(rollbackClient, fixtures),
      baselineSnapshot,
      "The failed migration changed Store fixture data.",
    );
    assert.deepEqual(await readTargetAttemptCounts(rollbackClient), {
      total: 2,
      unfinished: 1,
      rolled_back: 1,
      applied: 0,
    });
    await removeLateDdlConflict(rollbackClient);
    assertPre165Catalog(await readStoreFenceCatalog(rollbackClient));
  } finally {
    await rollbackClient.$disconnect();
  }

  runMigrateResolveRolledBack(schemaPath, databaseUrl);
  runMigrateDeploy(schemaPath, databaseUrl);
  runMigrateDeploy(schemaPath, databaseUrl);
  await assertExactAppliedMigrations(databaseUrl, [
    ...migrationPlan.prefixMigrations,
    migrationPlan.targetMigration,
  ]);

  const recoveryClient = prismaClient(databaseUrl);
  try {
    assertPost165Catalog(await readStoreFenceCatalog(recoveryClient));
    await assertExistingRowsFailClosed(
      recoveryClient,
      fixtures,
      baselineSnapshot,
    );
    assert.deepEqual(await readTargetAttemptCounts(recoveryClient), {
      total: 3,
      unfinished: 0,
      rolled_back: 2,
      applied: 1,
    });
  } finally {
    await recoveryClient.$disconnect();
  }
}

function assertRealEnvironment(environment) {
  if (environment.NODE_ENV === "production") {
    contractError("PRODUCTION_ENVIRONMENT_REFUSED");
  }
  if (
    environment.STORE_BACKGROUND_EXECUTION_FENCE_UPGRADE_SMOKE_CONFIRM !==
    REQUIRED_CONFIRMATION
  ) {
    contractError("STORE_FENCE_UPGRADE_SMOKE_CONFIRMATION_REQUIRED");
  }
  return parseSafeSourceDatabaseUrl(environment.DATABASE_URL);
}

function expectOfflineFailure(operation) {
  let caught;
  try {
    operation();
  } catch (error) {
    caught = error;
  }
  assert(caught, "Unsafe offline example was unexpectedly accepted.");
}

async function runOfflineSelfTest() {
  const safe = parseSafeSourceDatabaseUrl(
    "postgresql://postgres:postgres@127.0.0.1:5432/leetplus_ci?schema=public",
  );
  assert.equal(safe.databaseName, "leetplus_ci");
  expectOfflineFailure(() =>
    parseSafeSourceDatabaseUrl(
      "postgresql://postgres:postgres@database.invalid:5432/leetplus_ci?schema=public",
    ),
  );
  expectOfflineFailure(() =>
    parseSafeSourceDatabaseUrl(
      "postgresql://postgres:postgres@127.0.0.1:5432/leetplus?schema=public",
    ),
  );
  expectOfflineFailure(() =>
    parseSafeSourceDatabaseUrl(
      "postgresql://postgres:postgres@127.0.0.1:5432/leetplus_test?schema=private",
    ),
  );
  expectOfflineFailure(() =>
    parseSafeSourceDatabaseUrl(
      "mysql://root:root@127.0.0.1:3306/leetplus_test",
    ),
  );
  assert.equal(
    databaseUrlFor(
      safe.sourceUrl,
      "lp_store_fence_upgrade_ci_deadbeefdeadbeef",
    ).includes("connection_limit=1"),
    true,
  );
  assertSafeGeneratedDatabaseName("lp_store_fence_upgrade_ci_deadbeefdeadbeef");
  assertSafeGeneratedDatabaseName("lp_store_fence_failure_ci_deadbeefdeadbeef");
  expectOfflineFailure(() => assertSafeGeneratedDatabaseName("leetplus_ci"));
  assertSafeTempRoot(join(tmpdir(), `${TEMP_ROOT_PREFIX}deadbeef`));
  expectOfflineFailure(() => assertSafeTempRoot(tmpdir()));
  assert.equal(
    quoteIdentifier("lp_store_fence_upgrade_ci_deadbeefdeadbeef"),
    '"lp_store_fence_upgrade_ci_deadbeefdeadbeef"',
  );
  expectOfflineFailure(() =>
    quoteIdentifier('unsafe"; DROP DATABASE leetplus_ci; --'),
  );
  expectOfflineFailure(() =>
    assertRealEnvironment({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5432/leetplus_ci",
      STORE_BACKGROUND_EXECUTION_FENCE_UPGRADE_SMOKE_CONFIRM:
        REQUIRED_CONFIRMATION,
    }),
  );
  expectOfflineFailure(() =>
    assertRealEnvironment({
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5432/leetplus_ci",
    }),
  );
  assertLateDdlFailure({
    result: { error: undefined, status: 1 },
    elapsedMs: 100,
    output:
      'P3018 database error 42710: trigger "Store_execution_revision_fence_trigger" already exists',
  });
  expectOfflineFailure(() =>
    assertLateDdlFailure({
      result: { error: undefined, status: 1 },
      elapsedMs: 100,
      output: "unrelated failure",
    }),
  );
  assertLockTimeoutFailure({
    result: { error: undefined, status: 1 },
    elapsedMs: 5_000,
    output:
      "P3018 migration failed: 55P03 canceling statement due to lock timeout",
  });
  expectOfflineFailure(() =>
    assertLockTimeoutFailure({
      result: { error: undefined, status: 1 },
      elapsedMs: 25,
      output: "P3018 migration failed",
    }),
  );

  const migrationPlan = await readMigrationPlan();
  await assertTargetMigrationArtifact(migrationPlan);
  assert.equal(migrationPlan.prefixMigrations.length, 164);
  assert.equal(migrationPlan.prefixMigrations.at(-1), PREFIX_MIGRATION);
  assert.equal(migrationPlan.targetMigration, TARGET_MIGRATION);

  process.stdout.write(
    `${JSON.stringify({
      script: SCRIPT_NAME,
      status: "PASS",
      mode: "SELF_TEST",
      prefixMigrationCount: migrationPlan.prefixMigrations.length,
      targetMigration: migrationPlan.targetMigration,
      successBehaviorScenarios: 13,
      concurrentSerializationScenarios: 1,
      lockTimeoutRollbackScenarios: 1,
      lateDdlRollbackScenarios: 1,
      retryRecoveryScenarios: 1,
      destructiveSourceDatabaseActions: 0,
    })}\n`,
  );
}

async function runRealSmoke(environment) {
  const { sourceUrl, databaseName: sourceDatabaseName } =
    assertRealEnvironment(environment);
  const migrationPlan = await readMigrationPlan();
  const migrationSqlContract =
    await assertTargetMigrationArtifact(migrationPlan);
  const { successDatabaseName, failureDatabaseName } = generatedDatabaseNames();
  const sourceDatabaseUrl = databaseUrlFor(sourceUrl, sourceDatabaseName);
  const successDatabaseUrl = databaseUrlFor(sourceUrl, successDatabaseName);
  const failureDatabaseUrl = databaseUrlFor(sourceUrl, failureDatabaseName);
  const admin = prismaClient(sourceDatabaseUrl);

  let tempRoot;
  let clusterLockHeld = false;
  let successDatabaseCreated = false;
  let failureDatabaseCreated = false;
  let primaryError;
  let successEvidence;
  const cleanupErrors = [];

  try {
    tempRoot = await mkdtemp(join(tmpdir(), TEMP_ROOT_PREFIX));
    assertSafeTempRoot(tempRoot);
    await assertTestSuperuser(admin, sourceDatabaseName);
    const sourceMigrationState = await readSourceMigrationState(admin);
    await acquireClusterLock(admin);
    clusterLockHeld = true;

    const artifact = await createMigrationArtifact(tempRoot, migrationPlan);
    await createDisposableDatabase(admin, successDatabaseName);
    successDatabaseCreated = true;
    await createDisposableDatabase(admin, failureDatabaseName);
    failureDatabaseCreated = true;

    runMigrateDeploy(artifact.schemaPath, successDatabaseUrl);
    runMigrateDeploy(artifact.schemaPath, failureDatabaseUrl);
    await assertExactAppliedMigrations(
      successDatabaseUrl,
      migrationPlan.prefixMigrations,
    );
    await assertExactAppliedMigrations(
      failureDatabaseUrl,
      migrationPlan.prefixMigrations,
    );

    const successFixtureKey = randomBytes(6).toString("hex");
    const successClient = prismaClient(successDatabaseUrl);
    let successFixtures;
    let successBaselineSnapshot;
    try {
      assertPre165Catalog(await readStoreFenceCatalog(successClient));
      successFixtures = await createFixtures(successClient, successFixtureKey);
      successBaselineSnapshot = await readFixtureSnapshot(
        successClient,
        successFixtures,
      );
    } finally {
      await successClient.$disconnect();
    }

    const failureFixtureKey = randomBytes(6).toString("hex");
    const failureClient = prismaClient(failureDatabaseUrl);
    let failureFixtures;
    let failureBaselineSnapshot;
    try {
      assertPre165Catalog(await readStoreFenceCatalog(failureClient));
      failureFixtures = await createFixtures(failureClient, failureFixtureKey);
      failureBaselineSnapshot = await readFixtureSnapshot(
        failureClient,
        failureFixtures,
      );
    } finally {
      await failureClient.$disconnect();
    }

    await addTargetMigrationToArtifact(artifact, migrationPlan);
    await runSuccessfulUpgrade(
      artifact.schemaPath,
      successDatabaseUrl,
      migrationPlan,
      successFixtures,
      successBaselineSnapshot,
      successFixtureKey,
    );
    await runLockTimeoutRollback(
      artifact.schemaPath,
      failureDatabaseUrl,
      failureFixtures,
      failureBaselineSnapshot,
      migrationSqlContract,
    );
    await runLateDdlRollbackAndRecovery(
      artifact.schemaPath,
      failureDatabaseUrl,
      migrationPlan,
      failureFixtures,
      failureBaselineSnapshot,
      migrationSqlContract,
    );

    assert.deepEqual(
      await readSourceMigrationState(admin),
      sourceMigrationState,
      "The smoke changed the source database migration state.",
    );

    successEvidence = {
      script: SCRIPT_NAME,
      status: "PASS",
      postgresMajor: 16,
      prefixMigrationCount: migrationPlan.prefixMigrations.length,
      targetMigration: migrationPlan.targetMigration,
      preservedStores: 4,
      successBehaviorScenarios: 13,
      concurrentSerializationScenarios: 1,
      existingStoreDefaultsVerified: {
        backgroundExecutionEnabled: false,
        executionRevision: 0,
      },
      revisionSemanticsVerified: {
        multiFieldSingleIncrement: true,
        unrelatedUpdateNoIncrement: true,
        directMutationRejected: true,
        invalidInitialAuthorityRejected: true,
        invalidInitialRevisionRejected: true,
        inactiveEnableRejected: true,
        archiveRevokesAndIncrementsOnce: true,
        exhaustionRejected: true,
      },
      concurrentSerializationVerified: {
        deterministicRowLockObserved: true,
        serializedRevisions: [2, 3],
        noLostUpdate: true,
        finalArchiveFailClosed: true,
      },
      functionPublicExecute: false,
      lockTimeoutSqlStateVerified: "55P03",
      lockTimeoutRollbackVerified: true,
      lateDdlSqlStateVerified: "42710",
      lateDdlRollbackVerified: true,
      rolledBackTargetAttemptsBeforeRecovery: 2,
      recoveryDeployVerified: true,
      idempotentDeployVerified: true,
      sourceDatabaseMigrationsApplied: 0,
    };
  } catch (error) {
    primaryError = error;
  } finally {
    if (successDatabaseCreated) {
      try {
        await dropDisposableDatabase(admin, successDatabaseName);
        successDatabaseCreated = false;
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (failureDatabaseCreated) {
      try {
        await dropDisposableDatabase(admin, failureDatabaseName);
        failureDatabaseCreated = false;
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (clusterLockHeld) {
      try {
        await releaseClusterLock(admin);
        clusterLockHeld = false;
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    try {
      await admin.$disconnect();
    } catch (error) {
      cleanupErrors.push(error);
    }
    if (tempRoot !== undefined) {
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
    }
  }

  if (primaryError && cleanupErrors.length > 0) {
    throw new AggregateError(
      [primaryError, ...cleanupErrors],
      "Store fence smoke and cleanup both failed.",
    );
  }
  if (primaryError) {
    throw primaryError;
  }
  if (cleanupErrors.length > 0) {
    throw new AggregateError(
      cleanupErrors,
      "Store fence smoke cleanup failed.",
    );
  }
  assert(successEvidence, "Successful smoke evidence was not produced.");
  process.stdout.write(`${JSON.stringify(successEvidence)}\n`);
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`${HELP}\n`);
    return;
  }
  if (args.selfTest) {
    await runOfflineSelfTest();
    return;
  }
  await runRealSmoke(process.env);
}

main().catch((error) => {
  process.stderr.write(
    `${JSON.stringify({
      script: SCRIPT_NAME,
      status: "ERROR",
      error: {
        code: error?.code ?? "STORE_FENCE_UPGRADE_SMOKE_FAILED",
        message:
          typeof error?.message === "string"
            ? error.message
            : "Store background execution fence upgrade smoke failed.",
      },
    })}\n`,
  );
  process.exitCode = 1;
});

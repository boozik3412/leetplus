import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
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

const SCRIPT_NAME = "tenant-execution-revision-fence-upgrade-smoke";
const REQUIRED_CONFIRMATION =
  "run-tenant-execution-revision-fence-upgrade-smoke";
const PREFIX_MIGRATION = "20260728120000_tenant_execution_control_plane_expand";
const TARGET_MIGRATION = "20260728150000_tenant_execution_revision_fence";
const MIGRATION_PATTERN = /^\d{14}_[a-z0-9_]+$/;
const SAFE_SOURCE_DATABASE_PATTERN = /(?:^|[_-])(?:ci|test|testing)(?:$|[_-])/i;
const SUCCESS_DATABASE_PREFIX = "lp_tenant_revision_upgrade_ci_";
const FAILURE_DATABASE_PREFIX = "lp_tenant_revision_failure_ci_";
const SUCCESS_DATABASE_PATTERN = /^lp_tenant_revision_upgrade_ci_[a-f0-9]{16}$/;
const FAILURE_DATABASE_PATTERN = /^lp_tenant_revision_failure_ci_[a-f0-9]{16}$/;
const TEMP_ROOT_PREFIX = "leetplus-tenant-revision-upgrade-";
const MIGRATION_TIMEOUT_MS = 10 * 60 * 1000;
const FAILURE_TIMEOUT_MS = 30_000;
const CLUSTER_LOCK_CLASS = 1_281_120_000;
const CLUSTER_LOCK_OBJECT = 164;
const FIXTURE_TIMESTAMP = "2026-07-28T08:00:00.000Z";
const FIXTURE_TRIAL_START = "2026-07-28T00:00:00.000Z";
const FIXTURE_TRIAL_END = "2026-08-28T00:00:00.000Z";
const TENANT_MODULES = [
  "GAMIFICATION",
  "ASSORTMENT",
  "STAFF",
  "COMMUNICATIONS",
  "USERS_ROLES",
  "INTEGRATIONS",
];

const HELP = `
${SCRIPT_NAME}

Local/CI-only PostgreSQL 16 rehearsal for the populated tenant execution
revision-fence migration. It creates two random disposable databases from
template0 and never migrates or templates the source database.

The success database is migrated through the exact 163-migration prefix,
populated with tenant, entitlement, terminal report-run, and bonus-ledger
rows, then upgraded through migration 164. The smoke verifies data
preservation, revision/generation defaults, constraints, trigger semantics,
claim-generation ABA fencing, and idempotent migrate deploy.

The failure database is also populated at migration 163. It proves that a
RUNNING report, a PROCESSING ledger row, and a DISPATCHING ledger row each
fail closed with SQLSTATE 55000 and no partial DDL. It then holds an ACCESS
SHARE lock on GuestBonusLedgerEntry; migration 164 must fail through its
five-second lock_timeout with no partial state. Every failed attempt is
explicitly resolved as rolled back before the next attempt. A conflicting
late index additionally forces failure after the migration has executed its
preceding transactional DDL, proving that those changes roll back atomically.

Usage:
  node scripts/tenant-execution-revision-fence-upgrade-smoke.mjs
  node scripts/tenant-execution-revision-fence-upgrade-smoke.mjs --self-test
  node scripts/tenant-execution-revision-fence-upgrade-smoke.mjs --help

Required for the real PostgreSQL smoke:
  DATABASE_URL
    PostgreSQL 16 on localhost, public schema, and a database name containing
    a ci/test/testing marker. The connected role must be a test superuser.
  TENANT_EXECUTION_REVISION_FENCE_UPGRADE_SMOKE_CONFIRM
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
  assert.equal(
    migrationDirectories.at(-2),
    PREFIX_MIGRATION,
    "Migration 163 must remain the exact prefix for the revision rehearsal.",
  );
  assert.equal(
    migrationDirectories.at(-1),
    TARGET_MIGRATION,
    "Migration 164 must remain the only rehearsal target.",
  );

  return {
    sourcePrismaDir,
    prefixMigrations: migrationDirectories.slice(0, -1),
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
  assert.match(
    migrationSql,
    /LOCK TABLE "Tenant", "ReportDigestScheduleRun", "GuestBonusLedgerEntry"\s+IN ACCESS EXCLUSIVE MODE;/u,
  );
  assert.match(
    migrationSql,
    /FROM "ReportDigestScheduleRun"\s+WHERE "status" = 'RUNNING'/u,
  );
  assert.match(
    migrationSql,
    /FROM "GuestBonusLedgerEntry"\s+WHERE "status" IN \('PROCESSING', 'DISPATCHING'\)/u,
  );
  assert.equal(
    migrationSql.match(/USING ERRCODE = '55000'/gu)?.length,
    2,
    "Both in-flight preconditions must retain SQLSTATE 55000.",
  );
  assert.match(
    migrationSql,
    /zero RUNNING report digest jobs'\s+USING ERRCODE = '55000';/u,
  );
  assert.match(
    migrationSql,
    /zero in-flight bonus ledger claims'\s+USING ERRCODE = '55000';/u,
  );
  assert.match(
    migrationSql,
    /ADD COLUMN "executionRevision" INTEGER NOT NULL DEFAULT 0;/u,
  );
  assert.match(
    migrationSql,
    /ADD COLUMN "claimGeneration" INTEGER NOT NULL DEFAULT 0/u,
  );
  assert.match(
    migrationSql,
    /CREATE TRIGGER "Tenant_execution_revision_fence_trigger"/u,
  );
  assert.match(
    migrationSql,
    /REVOKE ALL ON FUNCTION public\."tenant_execution_revision_fence"\(\) FROM PUBLIC;/u,
  );
  assert.match(
    migrationSql,
    /CREATE INDEX "report_digest_schedule_execution_revision_idx"/u,
  );
  assert.match(
    migrationSql,
    /CREATE INDEX "guest_bonus_ledger_execution_revision_idx"/u,
  );
  assert.equal(
    migrationSql.match(/\bDO \$\$/gu)?.length,
    1,
    "Migration 164 must retain exactly one in-flight preflight block.",
  );

  const preflightSql = migrationSql.match(
    /DO \$\$\s*BEGIN[\s\S]*?END;\s*\$\$;/u,
  )?.[0];
  assert(
    preflightSql,
    "Migration 164 must retain one executable in-flight preflight block.",
  );
  const lockSql = migrationSql.match(
    /LOCK TABLE "Tenant", "ReportDigestScheduleRun", "GuestBonusLedgerEntry"\s+IN ACCESS EXCLUSIVE MODE;/u,
  )?.[0];
  assert(lockSql, "Migration 164 must retain the exact table-lock statement.");
  const lateDdlSql = migrationSql.match(
    /CREATE INDEX "report_digest_schedule_execution_revision_idx"\s+ON "ReportDigestScheduleRun" \("tenantId", "executionRevision", "status"\);/u,
  )?.[0];
  assert(
    lateDdlSql,
    "Migration 164 must retain the exact late-DDL conflict statement.",
  );
  const orderedBoundaries = [
    migrationSql.indexOf("BEGIN;"),
    migrationSql.indexOf("SET LOCAL lock_timeout = '5s';"),
    migrationSql.indexOf("SET LOCAL statement_timeout = '120s';"),
    migrationSql.indexOf(
      'LOCK TABLE "Tenant", "ReportDigestScheduleRun", "GuestBonusLedgerEntry"',
    ),
    migrationSql.indexOf(preflightSql),
    migrationSql.indexOf(
      'ALTER TABLE "Tenant"\n  ADD COLUMN "executionRevision"',
    ),
    migrationSql.lastIndexOf("COMMIT;"),
  ];
  assert(
    orderedBoundaries.every(
      (boundary, index) =>
        boundary >= 0 &&
        (index === 0 || boundary > orderedBoundaries[index - 1]),
    ),
    "Migration 164 must retain BEGIN -> timeouts -> LOCK -> preflight -> first ALTER -> COMMIT ordering.",
  );
  return { preflightSql, lockSql, lateDdlSql };
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

function spawnMigrateDeploy(schemaPath, databaseUrl, timeout) {
  const startedAt = Date.now();
  const result = spawnSync(
    process.execPath,
    [prismaCliPath(), "migrate", "deploy", "--schema", schemaPath],
    {
      cwd: dirname(schemaPath),
      encoding: "utf8",
      env: migrationEnvironment(databaseUrl),
      maxBuffer: 4 * 1024 * 1024,
      timeout,
      windowsHide: true,
    },
  );
  return {
    result,
    elapsedMs: Date.now() - startedAt,
    output: `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
  };
}

function spawnMigrateDeployAsync(schemaPath, databaseUrl, timeout) {
  const startedAt = Date.now();

  return new Promise((resolveAttempt, rejectAttempt) => {
    const child = spawn(
      process.execPath,
      [prismaCliPath(), "migrate", "deploy", "--schema", schemaPath],
      {
        cwd: dirname(schemaPath),
        env: migrationEnvironment(databaseUrl),
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );
    const stdout = [];
    const stderr = [];
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        child.kill();
      }
    }, timeout);

    child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      rejectAttempt(error);
    });
    child.once("close", (status, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveAttempt({
        result: {
          error:
            signal !== null
              ? Object.assign(new Error("Migration process was terminated."), {
                  code: "MIGRATION_PROCESS_TERMINATED",
                })
              : undefined,
          status,
        },
        elapsedMs: Date.now() - startedAt,
        output: `${Buffer.concat(stdout).toString("utf8")}\n${Buffer.concat(
          stderr,
        ).toString("utf8")}`,
      });
    });
  });
}

function runMigrateDeploy(schemaPath, databaseUrl) {
  const attempt = spawnMigrateDeploy(
    schemaPath,
    databaseUrl,
    MIGRATION_TIMEOUT_MS,
  );
  if (attempt.result.error || attempt.result.status !== 0) {
    contractError("MIGRATION_DEPLOY_FAILED");
  }
}

function runMigrateResolveRolledBack(schemaPath, databaseUrl, migrationName) {
  const result = spawnSync(
    process.execPath,
    [
      prismaCliPath(),
      "migrate",
      "resolve",
      "--rolled-back",
      migrationName,
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

function assertPreconditionFailure(attempt) {
  assert.equal(
    attempt.result.error,
    undefined,
    "The migration process itself must not time out or fail to spawn.",
  );
  assert.notEqual(
    attempt.result.status,
    0,
    "Migration 164 unexpectedly crossed an in-flight effect.",
  );
  assert(
    attempt.elapsedMs < FAILURE_TIMEOUT_MS,
    "The in-flight precondition did not fail inside the bounded window.",
  );
  assert.match(
    attempt.output,
    /(?:P3018|failed to apply|20260728150000_tenant_execution_revision_fence)/iu,
    "Prisma did not report a target-migration failure.",
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
    "Migration 164 unexpectedly acquired the blocked ACCESS EXCLUSIVE lock.",
  );
  assert(
    attempt.elapsedMs >= 4_000 && attempt.elapsedMs < FAILURE_TIMEOUT_MS,
    "Migration 164 did not fail inside its bounded lock-timeout window.",
  );
  assert.match(
    attempt.output,
    /(?:P3018|failed to apply|20260728150000_tenant_execution_revision_fence)/iu,
    "Prisma did not report a target-migration failure.",
  );
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
    "Migration 164 unexpectedly ignored the conflicting late index.",
  );
  assert(
    attempt.elapsedMs < FAILURE_TIMEOUT_MS,
    "The late-DDL conflict did not fail inside the bounded window.",
  );
  assert.match(
    attempt.output,
    /(?:P3018|failed to apply|20260728150000_tenant_execution_revision_fence)/iu,
    "Prisma did not report a target-migration failure.",
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
    "The revision upgrade smoke requires PostgreSQL 16.",
  );
  assert.equal(
    rows[0].is_superuser,
    true,
    "The revision upgrade smoke requires a disposable-cluster test superuser.",
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
    "Another tenant revision upgrade smoke is already running.",
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
  const tenants = [
    {
      key: "active",
      id: randomUUID(),
      name: "Revision active tenant",
      slug: `tenant-revision-${fixtureKey}-active`,
      status: "ACTIVE",
      customerStage: "INTERNAL",
      onboardingStatus: "ACTIVE",
      cohortKey: `internal-${fixtureKey}`,
      trialStartsAt: null,
      trialEndsAt: null,
      entitlementProfileRevision: 3,
    },
    {
      key: "suspended",
      id: randomUUID(),
      name: "Revision suspended tenant",
      slug: `tenant-revision-${fixtureKey}-suspended`,
      status: "SUSPENDED",
      customerStage: "INTERNAL",
      onboardingStatus: "PROVISIONING",
      cohortKey: null,
      trialStartsAt: null,
      trialEndsAt: null,
      entitlementProfileRevision: 0,
    },
    {
      key: "beta",
      id: randomUUID(),
      name: "Revision beta tenant",
      slug: `tenant-revision-${fixtureKey}-beta`,
      status: "ACTIVE",
      customerStage: "BETA",
      onboardingStatus: "READY",
      cohortKey: `beta-${fixtureKey}`,
      trialStartsAt: FIXTURE_TRIAL_START,
      trialEndsAt: FIXTURE_TRIAL_END,
      entitlementProfileRevision: 2,
    },
  ];

  for (const tenant of tenants) {
    await client.$executeRawUnsafe(
      `INSERT INTO "Tenant" (
         "id", "name", "slug", "domain", "status",
         "customerStage", "onboardingStatus", "cohortKey",
         "trialStartsAt", "trialEndsAt", "entitlementProfileRevision",
         "statusChangedAt", "statusReason", "updatedAt"
       )
       VALUES (
         $1, $2, $3, $4, $5::"TenantLifecycleStatus",
         $6::"TenantCustomerStage", $7::"TenantOnboardingStatus", $8,
         $9::timestamptz, $10::timestamptz, $11,
         $12::timestamp, $13, $12::timestamp
       )`,
      tenant.id,
      tenant.name,
      tenant.slug,
      `${tenant.slug}.example.test`,
      tenant.status,
      tenant.customerStage,
      tenant.onboardingStatus,
      tenant.cohortKey,
      tenant.trialStartsAt,
      tenant.trialEndsAt,
      tenant.entitlementProfileRevision,
      FIXTURE_TIMESTAMP,
      `Preserve ${tenant.key}`,
    );

    if (tenant.entitlementProfileRevision > 0) {
      for (const module of TENANT_MODULES) {
        await client.$executeRawUnsafe(
          `INSERT INTO "TenantModuleEntitlement" (
             "id", "tenantId", "module",
             "readEnabled", "writeEnabled", "outboundEnabled",
             "validFrom", "validUntil", "profileRevision", "reason",
             "createdAt", "updatedAt"
           )
           VALUES (
             $1, $2, $3::"TenantModule",
             true, true, false,
             NULL, $4::timestamptz, $5, $6,
             $7::timestamp, $7::timestamp
           )`,
          randomUUID(),
          tenant.id,
          module,
          tenant.trialEndsAt,
          tenant.entitlementProfileRevision,
          `Preserve ${module}`,
          FIXTURE_TIMESTAMP,
        );
      }
    }
  }

  const reports = [
    {
      id: randomUUID(),
      tenantId: tenants[0].id,
      type: "DAILY",
      scheduledForDate: `2026-07-27-${fixtureKey}`,
      status: "SENT",
      sentCount: 2,
      errorMessage: null,
    },
    {
      id: randomUUID(),
      tenantId: tenants[1].id,
      type: "WEEKLY",
      scheduledForDate: `2026-W30-${fixtureKey}`,
      status: "SKIPPED",
      sentCount: 0,
      errorMessage: "ENTITLEMENT_OUTBOUND_DISABLED",
    },
    {
      id: randomUUID(),
      tenantId: tenants[2].id,
      type: "MONTHLY",
      scheduledForDate: `2026-06-${fixtureKey}`,
      status: "FAILED",
      sentCount: 0,
      errorMessage: "Synthetic failure",
    },
  ];

  for (const report of reports) {
    await client.$executeRawUnsafe(
      `INSERT INTO "ReportDigestScheduleRun" (
         "id", "tenantId", "type", "scheduledForDate", "status",
         "startedAt", "completedAt", "sentCount", "errorMessage",
         "createdAt", "updatedAt"
       )
       VALUES (
         $1, $2, $3, $4, $5,
         $6::timestamp, $6::timestamp, $7, $8,
         $6::timestamp, $6::timestamp
       )`,
      report.id,
      report.tenantId,
      report.type,
      report.scheduledForDate,
      report.status,
      FIXTURE_TIMESTAMP,
      report.sentCount,
      report.errorMessage,
    );
  }

  const ledgerStatuses = [
    "PENDING",
    "FAILED",
    "CONFIRMED",
    "CANCELED",
    "RECONCILIATION_REQUIRED",
  ];
  const ledgers = ledgerStatuses.map((status, index) => ({
    id: randomUUID(),
    tenantId: tenants[index % tenants.length].id,
    idempotencyKey: `revision-${fixtureKey}-${status.toLowerCase()}`,
    status,
    amount: `${(index + 1) * 12}.50`,
    attempts: index,
    errorCode: status === "FAILED" ? "SYNTHETIC_FAILURE" : null,
  }));

  for (const ledger of ledgers) {
    await client.$executeRawUnsafe(
      `INSERT INTO "GuestBonusLedgerEntry" (
         "id", "tenantId", "idempotencyKey", "entryType", "source",
         "status", "amount", "balanceBefore", "balanceAfter", "reason",
         "attempts", "nextAttemptAt", "lockedAt", "processedAt",
         "confirmedAt", "failedAt", "canceledAt",
         "errorCode", "errorMessage", "metadata", "createdAt", "updatedAt"
       )
       VALUES (
         $1, $2, $3, 'EARN', 'GAMIFICATION',
         $4, $5::numeric, 100.25, 112.75, $6,
         $7, NULL, NULL,
         CASE WHEN $4 IN ('CONFIRMED', 'CANCELED') THEN $8::timestamp ELSE NULL END,
         CASE WHEN $4 = 'CONFIRMED' THEN $8::timestamp ELSE NULL END,
         CASE WHEN $4 IN ('FAILED', 'RECONCILIATION_REQUIRED') THEN $8::timestamp ELSE NULL END,
         CASE WHEN $4 = 'CANCELED' THEN $8::timestamp ELSE NULL END,
         $9, NULL, $10::jsonb, $8::timestamp, $8::timestamp
       )`,
      ledger.id,
      ledger.tenantId,
      ledger.idempotencyKey,
      ledger.status,
      ledger.amount,
      `Preserve ${ledger.status}`,
      ledger.attempts,
      FIXTURE_TIMESTAMP,
      ledger.errorCode,
      JSON.stringify({ fixture: fixtureKey, status: ledger.status }),
    );
  }

  return { tenants, reports, ledgers };
}

async function readFixtureSnapshot(client, fixtureKey) {
  const tenantPattern = `tenant-revision-${fixtureKey}-%`;
  const tenants = await client.$queryRawUnsafe(
    `SELECT
       "id", "name", "slug", "domain", "status",
       "customerStage", "onboardingStatus", "cohortKey",
       "supportOwnerUserId", "trialStartsAt", "trialEndsAt",
       "entitlementProfileRevision", "statusChangedAt", "statusReason",
       "createdAt", "updatedAt"
     FROM "Tenant"
     WHERE "slug" LIKE $1
     ORDER BY "slug" ASC`,
    tenantPattern,
  );
  const entitlements = await client.$queryRawUnsafe(
    `SELECT
       entitlement."id", entitlement."tenantId", entitlement."module",
       entitlement."readEnabled", entitlement."writeEnabled",
       entitlement."outboundEnabled", entitlement."validFrom",
       entitlement."validUntil", entitlement."profileRevision",
       entitlement."reason", entitlement."createdAt", entitlement."updatedAt"
     FROM "TenantModuleEntitlement" AS entitlement
     JOIN "Tenant" AS tenant ON tenant."id" = entitlement."tenantId"
     WHERE tenant."slug" LIKE $1
     ORDER BY entitlement."tenantId", entitlement."module"`,
    tenantPattern,
  );
  const reports = await client.$queryRawUnsafe(
    `SELECT
       report."id", report."tenantId", report."type",
       report."scheduledForDate", report."status", report."startedAt",
       report."completedAt", report."sentCount", report."errorMessage",
       report."createdAt", report."updatedAt"
     FROM "ReportDigestScheduleRun" AS report
     JOIN "Tenant" AS tenant ON tenant."id" = report."tenantId"
     WHERE tenant."slug" LIKE $1
     ORDER BY report."id"`,
    tenantPattern,
  );
  const ledgers = await client.$queryRawUnsafe(
    `SELECT
       ledger."id", ledger."tenantId", ledger."guestId", ledger."profileId",
       ledger."rewardId", ledger."storeId", ledger."createdByUserId",
       ledger."processedByUserId", ledger."externalProvider",
       ledger."externalDomain", ledger."externalGuestId",
       ledger."idempotencyKey", ledger."entryType", ledger."source",
       ledger."status", ledger."amount", ledger."balanceBefore",
       ledger."balanceAfter", ledger."reason", ledger."langameRequest",
       ledger."langameResponse", ledger."attempts", ledger."nextAttemptAt",
       ledger."lockedAt", ledger."processedAt", ledger."confirmedAt",
       ledger."failedAt", ledger."canceledAt", ledger."errorCode",
       ledger."errorMessage", ledger."metadata", ledger."createdAt",
       ledger."updatedAt"
     FROM "GuestBonusLedgerEntry" AS ledger
     JOIN "Tenant" AS tenant ON tenant."id" = ledger."tenantId"
     WHERE tenant."slug" LIKE $1
     ORDER BY ledger."id"`,
    tenantPattern,
  );

  return normalizeRows({ tenants, entitlements, reports, ledgers });
}

async function readRevisionCatalog(client) {
  const columns = await client.$queryRawUnsafe(
    `SELECT
       table_name, column_name, data_type, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND (
         (table_name = 'Tenant' AND column_name = 'executionRevision')
         OR (
           table_name = 'ReportDigestScheduleRun'
           AND column_name = 'executionRevision'
         )
         OR (
           table_name = 'GuestBonusLedgerEntry'
           AND column_name IN ('executionRevision', 'claimGeneration')
         )
       )
     ORDER BY table_name, column_name`,
  );
  const constraints = await client.$queryRawUnsafe(
    `SELECT
       constraint_row.conname AS name,
       constraint_row.convalidated AS validated,
       pg_get_constraintdef(constraint_row.oid) AS definition
     FROM pg_constraint AS constraint_row
     WHERE (
       constraint_row.conname = 'Tenant_executionRevision_nonnegative_check'
       AND constraint_row.conrelid = '"Tenant"'::regclass
     )
     OR (
       constraint_row.conname =
         'ReportDigestScheduleRun_executionRevision_positive_check'
       AND constraint_row.conrelid = '"ReportDigestScheduleRun"'::regclass
     )
     OR (
       constraint_row.conname IN (
         'GuestBonusLedgerEntry_executionRevision_positive_check',
         'GuestBonusLedgerEntry_claimGeneration_nonnegative_check'
       )
       AND constraint_row.conrelid = '"GuestBonusLedgerEntry"'::regclass
     )
     ORDER BY constraint_row.conname`,
  );
  const indexes = await client.$queryRawUnsafe(
    `SELECT
       index_class.relname AS name,
       table_class.relname AS table_name,
       index_row.indisvalid AS valid,
       index_row.indisready AS ready,
       pg_get_indexdef(index_row.indexrelid) AS definition
     FROM pg_index AS index_row
     JOIN pg_class AS index_class ON index_class.oid = index_row.indexrelid
     JOIN pg_class AS table_class ON table_class.oid = index_row.indrelid
     JOIN pg_namespace AS namespace_row
       ON namespace_row.oid = index_class.relnamespace
     WHERE namespace_row.nspname = 'public'
       AND (
         (
           index_class.relname =
             'report_digest_schedule_execution_revision_idx'
           AND table_class.relname = 'ReportDigestScheduleRun'
         )
         OR (
           index_class.relname =
             'guest_bonus_ledger_execution_revision_idx'
           AND table_class.relname = 'GuestBonusLedgerEntry'
         )
     )
     ORDER BY index_class.relname`,
  );
  const triggers = await client.$queryRawUnsafe(
    `SELECT
       trigger_row.tgname AS name,
       trigger_row.tgenabled AS enabled,
       function_row.proname AS function_name
     FROM pg_trigger AS trigger_row
     JOIN pg_proc AS function_row ON function_row.oid = trigger_row.tgfoid
     WHERE trigger_row.tgrelid = '"Tenant"'::regclass
       AND trigger_row.tgname = 'Tenant_execution_revision_fence_trigger'
       AND NOT trigger_row.tgisinternal`,
  );
  const [functionRow] = await client.$queryRawUnsafe(
    `SELECT
       to_regprocedure(
         'public.tenant_execution_revision_fence()'
       )::text AS function_name,
       EXISTS (
         SELECT 1
         FROM pg_proc AS function_row
         CROSS JOIN LATERAL aclexplode(
           COALESCE(
             function_row.proacl,
             acldefault('f', function_row.proowner)
           )
         ) AS privilege
         WHERE function_row.oid = to_regprocedure(
           'public.tenant_execution_revision_fence()'
         )
           AND privilege.grantee = 0
           AND privilege.privilege_type = 'EXECUTE'
       ) AS public_execute`,
  );
  const [trialConstraint] = await client.$queryRawUnsafe(
    `SELECT pg_get_constraintdef(constraint_row.oid) AS definition
     FROM pg_constraint AS constraint_row
     WHERE constraint_row.conrelid = '"Tenant"'::regclass
       AND constraint_row.conname = 'Tenant_external_stage_trial_check'`,
  );

  return normalizeRows({
    columns,
    constraints,
    indexes,
    triggers,
    functionName: functionRow?.function_name ?? null,
    functionPublicExecute: functionRow?.public_execute ?? false,
    trialConstraintDefinition: trialConstraint?.definition ?? null,
  });
}

function assertPre164CoreCatalog(catalog) {
  assert.deepEqual(catalog.columns, []);
  assert.deepEqual(catalog.constraints, []);
  assert.deepEqual(catalog.triggers, []);
  assert.equal(catalog.functionName, null);
  assert.equal(catalog.functionPublicExecute, false);
  assert.match(catalog.trialConstraintDefinition ?? "", /PILOT/u);
  assert.doesNotMatch(catalog.trialConstraintDefinition ?? "", /PROVISIONING/u);
}

function assertPre164Catalog(catalog) {
  assertPre164CoreCatalog(catalog);
  assert.deepEqual(catalog.indexes, []);
}

function assertPost164Catalog(catalog) {
  assert.equal(catalog.columns.length, 4);
  const columns = new Map(
    catalog.columns.map((column) => [
      `${column.table_name}.${column.column_name}`,
      column,
    ]),
  );
  assert.deepEqual(columns.get("Tenant.executionRevision"), {
    table_name: "Tenant",
    column_name: "executionRevision",
    data_type: "integer",
    is_nullable: "NO",
    column_default: "0",
  });
  assert.deepEqual(columns.get("ReportDigestScheduleRun.executionRevision"), {
    table_name: "ReportDigestScheduleRun",
    column_name: "executionRevision",
    data_type: "integer",
    is_nullable: "YES",
    column_default: null,
  });
  assert.deepEqual(columns.get("GuestBonusLedgerEntry.executionRevision"), {
    table_name: "GuestBonusLedgerEntry",
    column_name: "executionRevision",
    data_type: "integer",
    is_nullable: "YES",
    column_default: null,
  });
  assert.deepEqual(columns.get("GuestBonusLedgerEntry.claimGeneration"), {
    table_name: "GuestBonusLedgerEntry",
    column_name: "claimGeneration",
    data_type: "integer",
    is_nullable: "NO",
    column_default: "0",
  });

  assert.deepEqual(
    catalog.constraints.map((constraint) => constraint.name),
    [
      "GuestBonusLedgerEntry_claimGeneration_nonnegative_check",
      "GuestBonusLedgerEntry_executionRevision_positive_check",
      "ReportDigestScheduleRun_executionRevision_positive_check",
      "Tenant_executionRevision_nonnegative_check",
    ],
  );
  assert(catalog.constraints.every((constraint) => constraint.validated));
  assert.deepEqual(
    catalog.indexes.map((index) => [index.name, index.table_name]),
    [
      ["guest_bonus_ledger_execution_revision_idx", "GuestBonusLedgerEntry"],
      [
        "report_digest_schedule_execution_revision_idx",
        "ReportDigestScheduleRun",
      ],
    ],
  );
  assert(catalog.indexes.every((index) => index.valid && index.ready));
  assert.match(
    catalog.indexes[0].definition,
    /\("tenantId", "executionRevision", status\)/u,
  );
  assert.match(
    catalog.indexes[1].definition,
    /\("tenantId", "executionRevision", status\)/u,
  );
  assert.deepEqual(catalog.triggers, [
    {
      name: "Tenant_execution_revision_fence_trigger",
      enabled: "O",
      function_name: "tenant_execution_revision_fence",
    },
  ]);
  assert.equal(catalog.functionName, "tenant_execution_revision_fence()");
  assert.equal(catalog.functionPublicExecute, false);
  assert.match(catalog.trialConstraintDefinition ?? "", /SUSPENDED/u);
  assert.match(catalog.trialConstraintDefinition ?? "", /PROVISIONING/u);
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

async function assertMigrationPreflightSqlState(
  databaseUrl,
  preflightSql,
  expectedMarker,
) {
  // With an explicit BEGIN/COMMIT in the migration, Prisma CLI can mask the
  // original SQLSTATE when it tries to persist migration logs from the
  // already-aborted transaction. Execute the exact committed DO block through
  // a dedicated connection, then verify migrate-deploy failure and rollback
  // state separately.
  const client = prismaClient(databaseUrl);
  try {
    const error = await expectSqlState("55000", () =>
      client.$executeRawUnsafe(preflightSql),
    );
    assert.match(
      `${error?.message ?? ""}\n${JSON.stringify(error?.meta ?? {})}`,
      expectedMarker,
      "The exact migration preflight raised SQLSTATE 55000 for an unexpected reason.",
    );
  } finally {
    await client.$disconnect();
  }
}

async function assertMigrationLockSqlState(databaseUrl, lockSql) {
  const client = prismaClient(databaseUrl);
  try {
    await expectSqlState("55P03", () =>
      client.$transaction(async (transaction) => {
        await transaction.$executeRawUnsafe(
          `SET LOCAL lock_timeout = '250ms'`,
        );
        await transaction.$executeRawUnsafe(lockSql);
      }),
    );
  } finally {
    await client.$disconnect();
  }
}

async function assertMigrationLateDdlSqlState(databaseUrl, lateDdlSql) {
  const client = prismaClient(databaseUrl);
  try {
    await expectSqlState("42P07", () =>
      client.$transaction(async (transaction) => {
        await transaction.$executeRawUnsafe(
          `ALTER TABLE "ReportDigestScheduleRun"
           ADD COLUMN "executionRevision" INTEGER NOT NULL DEFAULT 0`,
        );
        await transaction.$executeRawUnsafe(lateDdlSql);
      }),
    );
  } finally {
    await client.$disconnect();
  }
}

async function assertPreservedRevisionRows(client, fixtures) {
  const tenantRows = await client.$queryRawUnsafe(
    `SELECT "id", "executionRevision"
     FROM "Tenant"
     WHERE "id" = ANY($1::text[])
     ORDER BY "id"`,
    fixtures.tenants.map((tenant) => tenant.id),
  );
  assert.equal(tenantRows.length, fixtures.tenants.length);
  assert(tenantRows.every((row) => row.executionRevision === 1));

  const reportRows = await client.$queryRawUnsafe(
    `SELECT "id", "executionRevision"
     FROM "ReportDigestScheduleRun"
     WHERE "id" = ANY($1::text[])
     ORDER BY "id"`,
    fixtures.reports.map((report) => report.id),
  );
  assert.equal(reportRows.length, fixtures.reports.length);
  assert(reportRows.every((row) => row.executionRevision === null));

  const ledgerRows = await client.$queryRawUnsafe(
    `SELECT "id", "executionRevision", "claimGeneration"
     FROM "GuestBonusLedgerEntry"
     WHERE "id" = ANY($1::text[])
     ORDER BY "id"`,
    fixtures.ledgers.map((ledger) => ledger.id),
  );
  assert.equal(ledgerRows.length, fixtures.ledgers.length);
  assert(
    ledgerRows.every(
      (row) => row.executionRevision === null && row.claimGeneration === 0,
    ),
  );
}

async function assertRevisionSemantics(client, fixtures, fixtureKey) {
  const newShellId = randomUUID();
  await client.$executeRawUnsafe(
    `INSERT INTO "Tenant" ("id", "name", "slug", "updatedAt")
     VALUES ($1, 'New shell', $2, CURRENT_TIMESTAMP)`,
    newShellId,
    `tenant-revision-${fixtureKey}-new-shell`,
  );
  const [newShell] = await client.$queryRawUnsafe(
    `SELECT
       "status", "customerStage", "onboardingStatus",
       "entitlementProfileRevision", "executionRevision"
     FROM "Tenant"
     WHERE "id" = $1`,
    newShellId,
  );
  assert.deepEqual(newShell, {
    status: "SUSPENDED",
    customerStage: "INTERNAL",
    onboardingStatus: "PROVISIONING",
    entitlementProfileRevision: 0,
    executionRevision: 0,
  });

  const pilotShellId = randomUUID();
  await client.$executeRawUnsafe(
    `INSERT INTO "Tenant" (
       "id", "name", "slug", "status", "customerStage",
       "onboardingStatus", "trialStartsAt", "trialEndsAt", "updatedAt"
     )
     VALUES (
       $1, 'Pilot shell', $2, 'SUSPENDED'::"TenantLifecycleStatus",
       'PILOT'::"TenantCustomerStage",
       'PROVISIONING'::"TenantOnboardingStatus",
       NULL, NULL, CURRENT_TIMESTAMP
     )`,
    pilotShellId,
    `tenant-revision-${fixtureKey}-pilot-shell`,
  );
  const [pilotShell] = await client.$queryRawUnsafe(
    `SELECT "executionRevision", "trialStartsAt", "trialEndsAt"
     FROM "Tenant"
     WHERE "id" = $1`,
    pilotShellId,
  );
  assert.deepEqual(pilotShell, {
    executionRevision: 0,
    trialStartsAt: null,
    trialEndsAt: null,
  });

  await expectSqlState("23514", () =>
    client.$executeRawUnsafe(
      `INSERT INTO "Tenant" (
         "id", "name", "slug", "status", "customerStage",
         "onboardingStatus", "trialStartsAt", "trialEndsAt", "updatedAt"
       )
       VALUES (
         $1, 'Invalid pilot', $2, 'ACTIVE'::"TenantLifecycleStatus",
         'PILOT'::"TenantCustomerStage",
         'ACTIVE'::"TenantOnboardingStatus",
         NULL, NULL, CURRENT_TIMESTAMP
       )`,
      randomUUID(),
      `tenant-revision-${fixtureKey}-invalid-pilot`,
    ),
  );

  const activeTenant = fixtures.tenants.find(
    (tenant) => tenant.key === "active",
  );
  assert(activeTenant);
  await client.$executeRawUnsafe(
    `UPDATE "Tenant"
     SET "name" = "name" || ' preserved'
     WHERE "id" = $1`,
    activeTenant.id,
  );
  const [afterUnrelatedUpdate] = await client.$queryRawUnsafe(
    `SELECT "executionRevision"
     FROM "Tenant"
     WHERE "id" = $1`,
    activeTenant.id,
  );
  assert.equal(afterUnrelatedUpdate.executionRevision, 1);

  await client.$executeRawUnsafe(
    `UPDATE "Tenant"
     SET
       "status" = 'SUSPENDED'::"TenantLifecycleStatus",
       "onboardingStatus" = 'READY'::"TenantOnboardingStatus",
       "entitlementProfileRevision" = "entitlementProfileRevision" + 1
     WHERE "id" = $1`,
    activeTenant.id,
  );
  const [afterPolicyUpdate] = await client.$queryRawUnsafe(
    `SELECT "executionRevision"
     FROM "Tenant"
     WHERE "id" = $1`,
    activeTenant.id,
  );
  assert.equal(afterPolicyUpdate.executionRevision, 2);

  await expectSqlState("23514", () =>
    client.$executeRawUnsafe(
      `UPDATE "Tenant"
       SET "executionRevision" = "executionRevision" + 1
       WHERE "id" = $1`,
      activeTenant.id,
    ),
  );

  const reportId = fixtures.reports[0].id;
  await expectSqlState("23514", () =>
    client.$executeRawUnsafe(
      `UPDATE "ReportDigestScheduleRun"
       SET "executionRevision" = 0
       WHERE "id" = $1`,
      reportId,
    ),
  );
  await client.$executeRawUnsafe(
    `UPDATE "ReportDigestScheduleRun"
     SET "executionRevision" = 1
     WHERE "id" = $1`,
    reportId,
  );

  const pendingLedger = fixtures.ledgers.find(
    (ledger) => ledger.status === "PENDING",
  );
  assert(pendingLedger);
  await expectSqlState("23514", () =>
    client.$executeRawUnsafe(
      `UPDATE "GuestBonusLedgerEntry"
       SET "executionRevision" = 0
       WHERE "id" = $1`,
      pendingLedger.id,
    ),
  );
  await expectSqlState("23514", () =>
    client.$executeRawUnsafe(
      `UPDATE "GuestBonusLedgerEntry"
       SET "claimGeneration" = -1
       WHERE "id" = $1`,
      pendingLedger.id,
    ),
  );

  const [firstClaim] = await client.$queryRawUnsafe(
    `UPDATE "GuestBonusLedgerEntry"
     SET
       "status" = 'PROCESSING',
       "attempts" = "attempts" + 1,
       "claimGeneration" = "claimGeneration" + 1,
       "executionRevision" = 1,
       "lockedAt" = CURRENT_TIMESTAMP
     WHERE "id" = $1
       AND "status" = 'PENDING'
       AND "claimGeneration" = 0
     RETURNING "claimGeneration", "executionRevision"`,
    pendingLedger.id,
  );
  assert.deepEqual(firstClaim, {
    claimGeneration: 1,
    executionRevision: 1,
  });
  await client.$executeRawUnsafe(
    `UPDATE "GuestBonusLedgerEntry"
     SET
       "status" = 'PENDING',
       "attempts" = 0,
       "lockedAt" = NULL,
       "executionRevision" = NULL
     WHERE "id" = $1
       AND "claimGeneration" = 1`,
    pendingLedger.id,
  );
  const [secondClaim] = await client.$queryRawUnsafe(
    `UPDATE "GuestBonusLedgerEntry"
     SET
       "status" = 'PROCESSING',
       "attempts" = "attempts" + 1,
       "claimGeneration" = "claimGeneration" + 1,
       "executionRevision" = 1,
       "lockedAt" = CURRENT_TIMESTAMP
     WHERE "id" = $1
       AND "status" = 'PENDING'
       AND "claimGeneration" = 1
     RETURNING "claimGeneration", "executionRevision"`,
    pendingLedger.id,
  );
  assert.deepEqual(secondClaim, {
    claimGeneration: 2,
    executionRevision: 1,
  });
  const staleGenerationUpdate = await client.$executeRawUnsafe(
    `UPDATE "GuestBonusLedgerEntry"
     SET "status" = 'CONFIRMED'
     WHERE "id" = $1
       AND "status" = 'PROCESSING'
       AND "claimGeneration" = 1`,
    pendingLedger.id,
  );
  assert.equal(staleGenerationUpdate, 0);
}

async function assertSuccessfulUpgrade(
  databaseUrl,
  migrationPlan,
  fixtures,
  fixtureKey,
  baselineSnapshot,
  expectedTargetAttemptCounts,
) {
  await assertExactAppliedMigrations(databaseUrl, [
    ...migrationPlan.prefixMigrations,
    migrationPlan.targetMigration,
  ]);
  const client = prismaClient(databaseUrl);
  try {
    assert.deepEqual(
      await readTargetAttemptCounts(client),
      expectedTargetAttemptCounts,
    );
    assert.deepEqual(
      await readFixtureSnapshot(client, fixtureKey),
      baselineSnapshot,
      "Migration 164 changed pre-existing tenant/report/ledger fields.",
    );
    await assertPreservedRevisionRows(client, fixtures);
    assertPost164Catalog(await readRevisionCatalog(client));
    await assertRevisionSemantics(client, fixtures, fixtureKey);
  } finally {
    await client.$disconnect();
  }
}

async function assertFailedAttemptState(
  client,
  fixtureKey,
  baselineCatalog,
  baselineSnapshot,
  expectedCounts,
) {
  assert.deepEqual(
    await readRevisionCatalog(client),
    baselineCatalog,
    "Failed migration 164 attempt left partial revision-fence DDL.",
  );
  assertPre164Catalog(await readRevisionCatalog(client));
  assert.deepEqual(
    await readFixtureSnapshot(client, fixtureKey),
    baselineSnapshot,
    "Failed migration 164 attempt changed fixture rows.",
  );
  assert.deepEqual(await readTargetAttemptCounts(client), expectedCounts);
}

async function runPreconditionFailure(
  schemaPath,
  databaseUrl,
  client,
  fixtureKey,
  expectedCounts,
  expectedMarker,
  preflightSql,
) {
  const baselineCatalog = await readRevisionCatalog(client);
  const baselineSnapshot = await readFixtureSnapshot(client, fixtureKey);
  assertPre164Catalog(baselineCatalog);
  await assertMigrationPreflightSqlState(
    databaseUrl,
    preflightSql,
    expectedMarker,
  );
  const attempt = spawnMigrateDeploy(
    schemaPath,
    databaseUrl,
    FAILURE_TIMEOUT_MS,
  );
  assertPreconditionFailure(attempt);
  await assertFailedAttemptState(
    client,
    fixtureKey,
    baselineCatalog,
    baselineSnapshot,
    expectedCounts,
  );
  runMigrateResolveRolledBack(schemaPath, databaseUrl, TARGET_MIGRATION);
}

async function runFailureAndRecoveryScenario(
  schemaPath,
  databaseUrl,
  migrationPlan,
  fixtures,
  fixtureKey,
  migrationSqlContract,
) {
  const client = prismaClient(databaseUrl);
  try {
    await client.$executeRawUnsafe(
      `UPDATE "ReportDigestScheduleRun"
       SET "status" = 'RUNNING', "completedAt" = NULL, "updatedAt" = CURRENT_TIMESTAMP
       WHERE "id" = $1`,
      fixtures.reports[0].id,
    );
    await runPreconditionFailure(
      schemaPath,
      databaseUrl,
      client,
      fixtureKey,
      { total: 1, unfinished: 1, rolled_back: 0, applied: 0 },
      /zero RUNNING report digest jobs/u,
      migrationSqlContract.preflightSql,
    );
    assert.deepEqual(await readTargetAttemptCounts(client), {
      total: 1,
      unfinished: 0,
      rolled_back: 1,
      applied: 0,
    });

    await client.$executeRawUnsafe(
      `UPDATE "ReportDigestScheduleRun"
       SET
         "status" = 'SENT',
         "completedAt" = $2::timestamp,
         "updatedAt" = $2::timestamp
       WHERE "id" = $1`,
      fixtures.reports[0].id,
      FIXTURE_TIMESTAMP,
    );
    await client.$executeRawUnsafe(
      `UPDATE "GuestBonusLedgerEntry"
       SET
         "status" = 'PROCESSING',
         "lockedAt" = CURRENT_TIMESTAMP,
         "updatedAt" = CURRENT_TIMESTAMP
       WHERE "id" = $1`,
      fixtures.ledgers[0].id,
    );
    await runPreconditionFailure(
      schemaPath,
      databaseUrl,
      client,
      fixtureKey,
      { total: 2, unfinished: 1, rolled_back: 1, applied: 0 },
      /zero in-flight bonus ledger claims/u,
      migrationSqlContract.preflightSql,
    );
    assert.deepEqual(await readTargetAttemptCounts(client), {
      total: 2,
      unfinished: 0,
      rolled_back: 2,
      applied: 0,
    });

    await client.$executeRawUnsafe(
      `UPDATE "GuestBonusLedgerEntry"
       SET "status" = 'PENDING', "lockedAt" = NULL, "updatedAt" = $2::timestamp
       WHERE "id" = $1`,
      fixtures.ledgers[0].id,
      FIXTURE_TIMESTAMP,
    );
    await client.$executeRawUnsafe(
      `UPDATE "GuestBonusLedgerEntry"
       SET
         "status" = 'DISPATCHING',
         "lockedAt" = CURRENT_TIMESTAMP,
         "updatedAt" = CURRENT_TIMESTAMP
       WHERE "id" = $1`,
      fixtures.ledgers[1].id,
    );
    await runPreconditionFailure(
      schemaPath,
      databaseUrl,
      client,
      fixtureKey,
      { total: 3, unfinished: 1, rolled_back: 2, applied: 0 },
      /zero in-flight bonus ledger claims/u,
      migrationSqlContract.preflightSql,
    );
    assert.deepEqual(await readTargetAttemptCounts(client), {
      total: 3,
      unfinished: 0,
      rolled_back: 3,
      applied: 0,
    });

    await client.$executeRawUnsafe(
      `UPDATE "GuestBonusLedgerEntry"
       SET
         "status" = 'FAILED',
         "lockedAt" = NULL,
         "updatedAt" = $2::timestamp
       WHERE "id" = $1`,
      fixtures.ledgers[1].id,
      FIXTURE_TIMESTAMP,
    );
  } finally {
    await client.$disconnect();
  }

  const blocker = prismaClient(databaseUrl);
  const lockBaselineCatalog = await readRevisionCatalog(blocker);
  const lockBaselineSnapshot = await readFixtureSnapshot(blocker, fixtureKey);
  assertPre164Catalog(lockBaselineCatalog);
  try {
    await blocker.$transaction(
      async (transaction) => {
        await transaction.$executeRawUnsafe(
          `LOCK TABLE "GuestBonusLedgerEntry" IN ACCESS SHARE MODE`,
        );
        await assertMigrationLockSqlState(
          databaseUrl,
          migrationSqlContract.lockSql,
        );
        const attempt = await spawnMigrateDeployAsync(
          schemaPath,
          databaseUrl,
          FAILURE_TIMEOUT_MS,
        );
        assertLockTimeoutFailure(attempt);
      },
      { maxWait: 5_000, timeout: FAILURE_TIMEOUT_MS },
    );
    await assertFailedAttemptState(
      blocker,
      fixtureKey,
      lockBaselineCatalog,
      lockBaselineSnapshot,
      { total: 4, unfinished: 1, rolled_back: 3, applied: 0 },
    );
  } finally {
    await blocker.$disconnect();
  }

  runMigrateResolveRolledBack(schemaPath, databaseUrl, TARGET_MIGRATION);
  const lateDdlClient = prismaClient(databaseUrl);
  let recoverySnapshot;
  try {
    assert.deepEqual(await readTargetAttemptCounts(lateDdlClient), {
      total: 4,
      unfinished: 0,
      rolled_back: 4,
      applied: 0,
    });
    await lateDdlClient.$executeRawUnsafe(
      `CREATE INDEX "report_digest_schedule_execution_revision_idx"
       ON "ReportDigestScheduleRun" ("status")`,
    );
    const lateDdlBaselineCatalog = await readRevisionCatalog(lateDdlClient);
    assertPre164CoreCatalog(lateDdlBaselineCatalog);
    assert.deepEqual(
      lateDdlBaselineCatalog.indexes.map((index) => index.name),
      ["report_digest_schedule_execution_revision_idx"],
    );
    const lateDdlBaselineSnapshot = await readFixtureSnapshot(
      lateDdlClient,
      fixtureKey,
    );
    await assertMigrationLateDdlSqlState(
      databaseUrl,
      migrationSqlContract.lateDdlSql,
    );
    const lateDdlAttempt = spawnMigrateDeploy(
      schemaPath,
      databaseUrl,
      FAILURE_TIMEOUT_MS,
    );
    assertLateDdlFailure(lateDdlAttempt);
    assert.deepEqual(
      await readRevisionCatalog(lateDdlClient),
      lateDdlBaselineCatalog,
      "Late migration 164 failure did not roll back partial DDL.",
    );
    assert.deepEqual(
      await readFixtureSnapshot(lateDdlClient, fixtureKey),
      lateDdlBaselineSnapshot,
      "Late migration 164 failure changed fixture rows.",
    );
    assert.deepEqual(await readTargetAttemptCounts(lateDdlClient), {
      total: 5,
      unfinished: 1,
      rolled_back: 4,
      applied: 0,
    });
  } finally {
    await lateDdlClient.$disconnect();
  }

  runMigrateResolveRolledBack(schemaPath, databaseUrl, TARGET_MIGRATION);
  const recoveryClient = prismaClient(databaseUrl);
  try {
    assert.deepEqual(await readTargetAttemptCounts(recoveryClient), {
      total: 5,
      unfinished: 0,
      rolled_back: 5,
      applied: 0,
    });
    await recoveryClient.$executeRawUnsafe(
      `DROP INDEX "report_digest_schedule_execution_revision_idx"`,
    );
    assertPre164Catalog(await readRevisionCatalog(recoveryClient));
    recoverySnapshot = await readFixtureSnapshot(recoveryClient, fixtureKey);
  } finally {
    await recoveryClient.$disconnect();
  }

  runMigrateDeploy(schemaPath, databaseUrl);
  runMigrateDeploy(schemaPath, databaseUrl);
  await assertSuccessfulUpgrade(
    databaseUrl,
    migrationPlan,
    fixtures,
    fixtureKey,
    recoverySnapshot,
    { total: 6, unfinished: 0, rolled_back: 5, applied: 1 },
  );
}

function assertRealEnvironment(environment) {
  if (environment.NODE_ENV === "production") {
    contractError("PRODUCTION_ENVIRONMENT_REFUSED");
  }
  if (
    environment.TENANT_EXECUTION_REVISION_FENCE_UPGRADE_SMOKE_CONFIRM !==
    REQUIRED_CONFIRMATION
  ) {
    contractError("REVISION_UPGRADE_SMOKE_CONFIRMATION_REQUIRED");
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
      "lp_tenant_revision_upgrade_ci_deadbeefdeadbeef",
    ).includes("connection_limit=1"),
    true,
  );
  assertSafeGeneratedDatabaseName(
    "lp_tenant_revision_upgrade_ci_deadbeefdeadbeef",
  );
  assertSafeGeneratedDatabaseName(
    "lp_tenant_revision_failure_ci_deadbeefdeadbeef",
  );
  expectOfflineFailure(() => assertSafeGeneratedDatabaseName("leetplus_ci"));
  assertSafeTempRoot(join(tmpdir(), `${TEMP_ROOT_PREFIX}deadbeef`));
  expectOfflineFailure(() => assertSafeTempRoot(tmpdir()));
  assert.equal(
    quoteIdentifier("lp_tenant_revision_upgrade_ci_deadbeefdeadbeef"),
    '"lp_tenant_revision_upgrade_ci_deadbeefdeadbeef"',
  );
  expectOfflineFailure(() =>
    quoteIdentifier('unsafe"; DROP DATABASE leetplus_ci; --'),
  );
  expectOfflineFailure(() =>
    assertRealEnvironment({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5432/leetplus_ci",
      TENANT_EXECUTION_REVISION_FENCE_UPGRADE_SMOKE_CONFIRM:
        REQUIRED_CONFIRMATION,
    }),
  );
  expectOfflineFailure(() =>
    assertRealEnvironment({
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5432/leetplus_ci",
    }),
  );
  assertPreconditionFailure({
    result: { error: undefined, status: 1 },
    elapsedMs: 100,
    output:
      "P3018 database error 55000: Tenant execution revision migration requires zero RUNNING report digest jobs",
  });
  expectOfflineFailure(() =>
    assertPreconditionFailure({
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
      elapsedMs: 5_000,
      output: "unrelated failure",
    }),
  );
  expectOfflineFailure(() =>
    assertLockTimeoutFailure({
      result: { error: undefined, status: 1 },
      elapsedMs: 25,
      output: "P3018 migration failed",
    }),
  );
  assertLateDdlFailure({
    result: { error: undefined, status: 1 },
    elapsedMs: 100,
    output:
      'P3018 database error 42P07: relation "report_digest_schedule_execution_revision_idx" already exists',
  });
  expectOfflineFailure(() =>
    assertLateDdlFailure({
      result: { error: undefined, status: 1 },
      elapsedMs: 100,
      output: "unrelated failure",
    }),
  );

  const migrationPlan = await readMigrationPlan();
  await assertTargetMigrationArtifact(migrationPlan);
  assert.equal(migrationPlan.prefixMigrations.length, 163);
  assert.equal(migrationPlan.prefixMigrations.at(-1), PREFIX_MIGRATION);
  assert.equal(migrationPlan.targetMigration, TARGET_MIGRATION);

  process.stdout.write(
    `${JSON.stringify({
      script: SCRIPT_NAME,
      status: "PASS",
      mode: "SELF_TEST",
      prefixMigrationCount: migrationPlan.prefixMigrations.length,
      targetMigration: migrationPlan.targetMigration,
      drainRejectionScenarios: 3,
      lockTimeoutScenarios: 1,
      lateDdlRollbackScenarios: 1,
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
      successFixtures = await createFixtures(successClient, successFixtureKey);
      successBaselineSnapshot = await readFixtureSnapshot(
        successClient,
        successFixtureKey,
      );
      assertPre164Catalog(await readRevisionCatalog(successClient));
    } finally {
      await successClient.$disconnect();
    }

    const failureFixtureKey = randomBytes(6).toString("hex");
    const failureClient = prismaClient(failureDatabaseUrl);
    let failureFixtures;
    try {
      failureFixtures = await createFixtures(failureClient, failureFixtureKey);
      assertPre164Catalog(await readRevisionCatalog(failureClient));
    } finally {
      await failureClient.$disconnect();
    }

    await addTargetMigrationToArtifact(artifact, migrationPlan);
    runMigrateDeploy(artifact.schemaPath, successDatabaseUrl);
    runMigrateDeploy(artifact.schemaPath, successDatabaseUrl);
    await assertSuccessfulUpgrade(
      successDatabaseUrl,
      migrationPlan,
      successFixtures,
      successFixtureKey,
      successBaselineSnapshot,
      { total: 1, unfinished: 0, rolled_back: 0, applied: 1 },
    );

    await runFailureAndRecoveryScenario(
      artifact.schemaPath,
      failureDatabaseUrl,
      migrationPlan,
      failureFixtures,
      failureFixtureKey,
      migrationSqlContract,
    );

    assert.deepEqual(
      await readSourceMigrationState(admin),
      sourceMigrationState,
      "The smoke changed the source database migration state.",
    );

    process.stdout.write(
      `${JSON.stringify({
        script: SCRIPT_NAME,
        status: "PASS",
        postgresMajor: 16,
        prefixMigrationCount: migrationPlan.prefixMigrations.length,
        targetMigration: migrationPlan.targetMigration,
        preservedTenants:
          successFixtures.tenants.length + failureFixtures.tenants.length,
        preservedReportRuns:
          successFixtures.reports.length + failureFixtures.reports.length,
        preservedLedgerEntries:
          successFixtures.ledgers.length + failureFixtures.ledgers.length,
        drainRejections: {
          reportRunning: 1,
          ledgerProcessing: 1,
          ledgerDispatching: 1,
        },
        databasePreflightSqlStateVerified: "55000",
        databaseLockSqlStateVerified: "55P03",
        databaseLateDdlSqlStateVerified: "42P07",
        lockTimeoutRollbackVerified: true,
        lateDdlRollbackVerified: true,
        rolledBackTargetAttemptsBeforeRecovery: 5,
        recoveryDeployVerified: true,
        sourceDatabaseMigrationsApplied: 0,
      })}\n`,
    );
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
      "Revision upgrade smoke and cleanup both failed.",
    );
  }
  if (primaryError) {
    throw primaryError;
  }
  if (cleanupErrors.length > 0) {
    throw new AggregateError(
      cleanupErrors,
      "Revision upgrade smoke cleanup failed.",
    );
  }
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
        code: error?.code ?? "REVISION_UPGRADE_SMOKE_FAILED",
        message:
          typeof error?.message === "string"
            ? error.message
            : "Tenant execution revision upgrade smoke failed.",
      },
    })}\n`,
  );
  process.exitCode = 1;
});

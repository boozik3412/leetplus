import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { cp, copyFile, mkdir, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import {
  CURRENT_EXPECTED_LATEST_MIGRATION,
  CURRENT_EXPECTED_MIGRATION_COUNT,
  STAFF_TASK_ALLOWED_ADDITIVE_TAIL,
  STAFF_TASK_FROZEN_PREFIX_COUNT,
  STAFF_TASK_FROZEN_PREFIX_LATEST,
} from "./staff-task-integrity-migration-state.mjs";

const SCRIPT_NAME = "tenant-execution-control-plane-upgrade-smoke";
const REQUIRED_CONFIRMATION =
  "run-tenant-execution-control-plane-upgrade-smoke";
const TARGET_MIGRATION =
  "20260728120000_tenant_execution_control_plane_expand";
const MIGRATION_PATTERN = /^\d{14}_[a-z0-9_]+$/;
const SAFE_SOURCE_DATABASE_PATTERN =
  /(?:^|[_-])(?:ci|test|testing)(?:$|[_-])/i;
const UPGRADE_DATABASE_PREFIX = "lp_tenant_cp_upgrade_ci_";
const LOCK_DATABASE_PREFIX = "lp_tenant_cp_lock_ci_";
const UPGRADE_DATABASE_PATTERN =
  /^lp_tenant_cp_upgrade_ci_[a-f0-9]{16}$/;
const LOCK_DATABASE_PATTERN = /^lp_tenant_cp_lock_ci_[a-f0-9]{16}$/;
const TEMP_ROOT_PREFIX = "leetplus-tenant-cp-upgrade-";
const MIGRATION_TIMEOUT_MS = 10 * 60 * 1000;
const LOCK_FAILURE_TIMEOUT_MS = 30_000;
const CLUSTER_LOCK_CLASS = 1_281_120_000;
const CLUSTER_LOCK_OBJECT = 163;
const FIXTURE_TIMESTAMP = "2026-07-28T08:00:00.000Z";
const FIXTURE_INVITE_EXPIRY = "2026-08-28T08:00:00.000Z";

const HELP = `
${SCRIPT_NAME}

Local/CI-only PostgreSQL 16 smoke for the tenant execution control-plane
migration. It creates two random disposable databases from template0.

The first database is migrated through the frozen 162-migration prefix,
populated with ACTIVE/SUSPENDED/ARCHIVED tenants plus users, invites, and audit
events, and then upgraded through migration 163. The smoke verifies legacy row
preservation, lifecycle backfill, fail-closed Tenant defaults, removal of the
User.role default, request-id uniqueness, and revision compare-and-swap.

The second database is also migrated through prefix 162. A separate
transaction holds an ACCESS SHARE lock on "User" while migration 163 runs.
The migration must fail through its five-second lock_timeout and leave no
partial control-plane DDL or legacy-row changes.

Usage:
  node scripts/tenant-execution-control-plane-upgrade-smoke.mjs
  node scripts/tenant-execution-control-plane-upgrade-smoke.mjs --self-test
  node scripts/tenant-execution-control-plane-upgrade-smoke.mjs --help

Required for the real PostgreSQL smoke:
  DATABASE_URL
    PostgreSQL 16 on localhost, public schema, and a database name containing
    a ci/test/testing marker. The connected role must be a test superuser.
  TENANT_EXECUTION_CONTROL_PLANE_UPGRADE_SMOKE_CONFIRM
    Must equal: ${REQUIRED_CONFIRMATION}

Safety:
  - NODE_ENV=production is always rejected.
  - The source database is never migrated or used as a template.
  - Only generated ${UPGRADE_DATABASE_PREFIX}<hex> and
    ${LOCK_DATABASE_PREFIX}<hex> databases may be created or dropped.
  - Migration artifacts are copied only below a generated OS temp directory.
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
    UPGRADE_DATABASE_PATTERN.test(databaseName) ||
    LOCK_DATABASE_PATTERN.test(databaseName)
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
  const upgradeDatabaseName = `${UPGRADE_DATABASE_PREFIX}${suffix}`;
  const lockDatabaseName = `${LOCK_DATABASE_PREFIX}${suffix}`;
  assert.match(upgradeDatabaseName, UPGRADE_DATABASE_PATTERN);
  assert.match(lockDatabaseName, LOCK_DATABASE_PATTERN);
  assert.notEqual(upgradeDatabaseName, lockDatabaseName);
  return { upgradeDatabaseName, lockDatabaseName };
}

function assertSafeGeneratedDatabaseName(databaseName) {
  if (
    !UPGRADE_DATABASE_PATTERN.test(databaseName) &&
    !LOCK_DATABASE_PATTERN.test(databaseName)
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
  assert.equal(
    migrationDirectories[STAFF_TASK_FROZEN_PREFIX_COUNT - 1],
    STAFF_TASK_FROZEN_PREFIX_LATEST,
    "The frozen 162-migration prefix changed.",
  );
  assert.deepEqual(
    migrationDirectories.slice(STAFF_TASK_FROZEN_PREFIX_COUNT),
    [...STAFF_TASK_ALLOWED_ADDITIVE_TAIL],
    "The additive migration tail changed without updating its reviewed manifest.",
  );
  assert.equal(
    migrationDirectories.at(-1),
    CURRENT_EXPECTED_LATEST_MIGRATION,
    "The current latest migration does not match the release contract.",
  );
  assert.equal(
    STAFF_TASK_ALLOWED_ADDITIVE_TAIL[0],
    TARGET_MIGRATION,
    "Migration 163 must remain the first reviewed additive-tail migration.",
  );

  return {
    sourcePrismaDir,
    prefixMigrations: migrationDirectories.slice(
      0,
      STAFF_TASK_FROZEN_PREFIX_COUNT,
    ),
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
  const statements = migrationSql
    .replace(/--[^\r\n]*/g, "")
    .trim()
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);

  assert.equal(
    statements[0]?.toUpperCase(),
    "BEGIN",
    "Migration 163 must begin one explicit PostgreSQL transaction.",
  );
  assert.equal(
    statements.at(-1)?.toUpperCase(),
    "COMMIT",
    "Migration 163 must commit only after all control-plane DDL.",
  );
  assert.match(
    migrationSql,
    /SET\s+LOCAL\s+lock_timeout\s*=\s*'5s'/iu,
    "Migration 163 must retain the bounded lock timeout.",
  );
  const lockSql = migrationSql.match(
    /LOCK\s+TABLE\s+"Tenant"\s*,\s*"User"\s*,\s*"PlatformAdminAuditEvent"\s+IN\s+ACCESS\s+EXCLUSIVE\s+MODE;/iu,
  )?.[0];
  assert(
    lockSql,
    "Migration 163 must lock every table whose defaults or shape it changes.",
  );
  assert.match(
    migrationSql,
    /ALTER\s+COLUMN\s+"status"\s+SET\s+DEFAULT\s+'SUSPENDED'/iu,
    "Migration 163 must make raw Tenant creation fail closed.",
  );
  assert.match(
    migrationSql,
    /ALTER\s+COLUMN\s+"role"\s+DROP\s+DEFAULT/iu,
    "Migration 163 must remove the maximum-role User default.",
  );
  assert.match(
    migrationSql,
    /ADD\s+COLUMN\s+"requestId"\s+TEXT/iu,
    "Migration 163 must persist control-plane request ids.",
  );
  assert.match(
    migrationSql,
    /CREATE\s+UNIQUE\s+INDEX\s+"platform_admin_audit_tenant_action_request_uidx"/iu,
    "Migration 163 must enforce tenant-scoped request-id uniqueness.",
  );
  assert.match(
    migrationSql,
    /CREATE\s+UNIQUE\s+INDEX\s+"platform_admin_audit_global_action_request_uidx"\s+ON\s+"PlatformAdminAuditEvent"\s*\(\s*"action"\s*,\s*"requestId"\s*\)\s+WHERE\s+"tenantId"\s+IS\s+NULL\s+AND\s+"requestId"\s+IS\s+NOT\s+NULL/iu,
    "Migration 163 must enforce global request-id uniqueness for tenantId=NULL audit events.",
  );
  assert.match(
    migrationSql,
    /UPDATE\s+"Tenant"\s+SET\s+"onboardingStatus"\s*=\s*'ACTIVE'\s+WHERE\s+"status"\s*=\s*'ACTIVE'/iu,
    "Migration 163 must preserve existing ACTIVE tenant sessions.",
  );

  return { lockSql };
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
      join(
        migrationPlan.sourcePrismaDir,
        "migrations",
        migrationName,
      ),
      join(targetMigrationsDir, migrationName),
      { recursive: true },
    );
  }

  return {
    schemaPath: join(targetPrismaDir, "schema.prisma"),
    targetMigrationsDir,
  };
}

async function addTargetMigrationToArtifact(
  artifact,
  migrationPlan,
) {
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

function spawnMigrateDeploy(schemaPath, databaseUrl, timeout) {
  const require = createRequire(import.meta.url);
  const prismaCliPath = require.resolve("prisma/build/index.js");
  const startedAt = Date.now();
  const result = spawnSync(
    process.execPath,
    [prismaCliPath, "migrate", "deploy", "--schema", schemaPath],
    {
      cwd: dirname(schemaPath),
      encoding: "utf8",
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        NODE_ENV: "test",
        PGOPTIONS: "-c lock_timeout=5000 -c statement_timeout=120000",
        NO_COLOR: "1",
        PRISMA_HIDE_UPDATE_MESSAGE: "true",
      },
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
  const require = createRequire(import.meta.url);
  const prismaCliPath = require.resolve("prisma/build/index.js");
  const startedAt = Date.now();

  return new Promise((resolveAttempt, rejectAttempt) => {
    const child = spawn(
      process.execPath,
      [prismaCliPath, "migrate", "deploy", "--schema", schemaPath],
      {
        cwd: dirname(schemaPath),
        env: {
          ...process.env,
          DATABASE_URL: databaseUrl,
          NODE_ENV: "test",
          PGOPTIONS: "-c lock_timeout=5000 -c statement_timeout=120000",
          NO_COLOR: "1",
          PRISMA_HIDE_UPDATE_MESSAGE: "true",
        },
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

function runMigrateResolveRolledBack(
  schemaPath,
  databaseUrl,
  migrationName,
) {
  const require = createRequire(import.meta.url);
  const prismaCliPath = require.resolve("prisma/build/index.js");
  const result = spawnSync(
    process.execPath,
    [
      prismaCliPath,
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
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        NODE_ENV: "test",
        NO_COLOR: "1",
        PRISMA_HIDE_UPDATE_MESSAGE: "true",
      },
      maxBuffer: 4 * 1024 * 1024,
      timeout: MIGRATION_TIMEOUT_MS,
      windowsHide: true,
    },
  );
  if (result.error || result.status !== 0) {
    contractError("MIGRATION_RESOLVE_ROLLED_BACK_FAILED");
  }
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
    "Migration 163 unexpectedly acquired the blocked ACCESS EXCLUSIVE lock.",
  );
  assert(
    attempt.elapsedMs >= 4_000 && attempt.elapsedMs < LOCK_FAILURE_TIMEOUT_MS,
    "Migration 163 did not fail inside its bounded lock-timeout window.",
  );
  assert.match(
    attempt.output,
    /(?:P3018|failed to apply|20260728120000_tenant_execution_control_plane_expand)/iu,
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
    "The upgrade smoke requires PostgreSQL 16.",
  );
  assert.equal(
    rows[0].is_superuser,
    true,
    "The upgrade smoke requires a disposable-cluster test superuser.",
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
    "Another tenant control-plane upgrade smoke is already running.",
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

async function readMigrationSummary(databaseUrl) {
  const client = prismaClient(databaseUrl);
  try {
    const rows = await client.$queryRawUnsafe(
      `SELECT
         "migration_name",
         ("finished_at" IS NOT NULL AND "rolled_back_at" IS NULL) AS applied,
         ("finished_at" IS NULL AND "rolled_back_at" IS NULL) AS unfinished
       FROM "_prisma_migrations"
       ORDER BY "started_at" ASC, "migration_name" ASC`,
    );
    return rows;
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

function normalizeRows(rows) {
  return JSON.parse(JSON.stringify(rows));
}

async function createLegacyFixtures(client, fixtureKey) {
  const fixtures = [
    { key: "active", status: "ACTIVE", role: "OWNER" },
    { key: "suspended", status: "SUSPENDED", role: "ADMIN" },
    { key: "archived", status: "ARCHIVED", role: "MANAGER" },
  ].map((fixture) => ({
    ...fixture,
    tenantId: randomUUID(),
    userId: randomUUID(),
    inviteId: randomUUID(),
    auditId: randomUUID(),
    slug: `tenant-cp-${fixtureKey}-${fixture.key}`,
    email: `${fixture.key}-${fixtureKey}@example.test`,
  }));

  for (const fixture of fixtures) {
    await client.$executeRawUnsafe(
      `INSERT INTO "Tenant" (
         "id", "name", "slug", "domain", "status",
         "statusChangedAt", "statusReason", "updatedAt"
       )
       VALUES (
         $1, $2, $3, $4, $5::"TenantLifecycleStatus",
         $6::timestamp, $7, $6::timestamp
       )`,
      fixture.tenantId,
      `Control plane ${fixture.key}`,
      fixture.slug,
      `${fixture.slug}.example.test`,
      fixture.status,
      FIXTURE_TIMESTAMP,
      `Preserve ${fixture.status}`,
    );
    await client.$executeRawUnsafe(
      `INSERT INTO "User" (
         "id", "tenantId", "email", "passwordHash", "fullName",
         "role", "accessScope", "isActive", "isPlatformAdmin",
         "emailVerifiedAt", "updatedAt"
       )
       VALUES (
         $1, $2, $3, $4, $5,
         $6::"UserRole", 'NETWORK'::"UserAccessScope", true, false,
         $7::timestamp, $7::timestamp
       )`,
      fixture.userId,
      fixture.tenantId,
      fixture.email,
      `upgrade-smoke-hash-${fixtureKey}`,
      `Fixture ${fixture.key}`,
      fixture.role,
      FIXTURE_TIMESTAMP,
    );
    await client.$executeRawUnsafe(
      `INSERT INTO "UserInvite" (
         "id", "tenantId", "email", "fullName", "role", "accessScope",
         "storeIds", "tokenHash", "expiresAt", "createdByUserId", "updatedAt"
       )
       VALUES (
         $1, $2, $3, $4, $5::"UserRole", 'NETWORK'::"UserAccessScope",
         ARRAY[]::text[], $6, $7::timestamp, $8, $9::timestamp
       )`,
      fixture.inviteId,
      fixture.tenantId,
      `invite-${fixture.email}`,
      `Invite ${fixture.key}`,
      fixture.role,
      `upgrade-smoke-token-${fixtureKey}-${fixture.key}`,
      FIXTURE_INVITE_EXPIRY,
      fixture.userId,
      FIXTURE_TIMESTAMP,
    );
    await client.$executeRawUnsafe(
      `INSERT INTO "PlatformAdminAuditEvent" (
         "id", "tenantId", "actorUserId", "action", "targetType",
         "targetId", "reason", "before", "after", "metadata", "createdAt"
       )
       VALUES (
         $1, $2, $3, $4, 'TENANT', $2, $5,
         $6::jsonb, $7::jsonb, $8::jsonb, $9::timestamp
       )`,
      fixture.auditId,
      fixture.tenantId,
      fixture.userId,
      `LEGACY_UPGRADE_SMOKE_${fixture.status}`,
      `Preserve audit ${fixture.key}`,
      JSON.stringify({ status: fixture.status }),
      JSON.stringify({ status: fixture.status }),
      JSON.stringify({ fixture: fixture.key }),
      FIXTURE_TIMESTAMP,
    );
  }

  return fixtures;
}

async function readLegacySnapshot(client, fixtureKey) {
  const tenantRows = await client.$queryRawUnsafe(
    `SELECT
       "id", "name", "slug", "domain", "status",
       "statusChangedAt", "statusReason", "createdAt", "updatedAt"
     FROM "Tenant"
     WHERE "slug" LIKE $1
     ORDER BY "slug" ASC`,
    `tenant-cp-${fixtureKey}-%`,
  );
  const userRows = await client.$queryRawUnsafe(
    `SELECT
       subject."id", subject."tenantId", subject."email",
       subject."passwordHash", subject."fullName", subject."role",
       subject."accessScope", subject."isActive", subject."isPlatformAdmin",
       subject."emailVerifiedAt", subject."createdAt", subject."updatedAt"
     FROM "User" AS subject
     JOIN "Tenant" AS tenant ON tenant."id" = subject."tenantId"
     WHERE tenant."slug" LIKE $1
     ORDER BY subject."email" ASC`,
    `tenant-cp-${fixtureKey}-%`,
  );
  const inviteRows = await client.$queryRawUnsafe(
    `SELECT
       invite."id", invite."tenantId", invite."email", invite."fullName",
       invite."role", invite."accessScope", invite."customRoleId",
       invite."storeIds", invite."tokenHash", invite."expiresAt",
       invite."acceptedAt", invite."acceptedByUserId",
       invite."createdByUserId", invite."createdAt", invite."updatedAt"
     FROM "UserInvite" AS invite
     JOIN "Tenant" AS tenant ON tenant."id" = invite."tenantId"
     WHERE tenant."slug" LIKE $1
     ORDER BY invite."email" ASC`,
    `tenant-cp-${fixtureKey}-%`,
  );
  const auditRows = await client.$queryRawUnsafe(
    `SELECT
       audit."id", audit."tenantId", audit."actorUserId", audit."action",
       audit."targetType", audit."targetId", audit."reason",
       audit."before", audit."after", audit."metadata", audit."createdAt"
     FROM "PlatformAdminAuditEvent" AS audit
     JOIN "Tenant" AS tenant ON tenant."id" = audit."tenantId"
     WHERE tenant."slug" LIKE $1
     ORDER BY audit."action" ASC`,
    `tenant-cp-${fixtureKey}-%`,
  );

  return normalizeRows({
    tenants: tenantRows,
    users: userRows,
    invites: inviteRows,
    auditEvents: auditRows,
  });
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
}

async function assertMigrationLockSqlState(databaseUrl, lockSql) {
  // Prisma CLI can mask the original SQLSTATE after the explicit migration
  // transaction aborts. Prove the exact committed lock through a dedicated
  // connection, then verify migrate-deploy failure and rollback separately.
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

async function assertUpgradePostconditions(
  client,
  fixtures,
  fixtureKey,
  baselineSnapshot,
) {
  assert.deepEqual(
    await readLegacySnapshot(client, fixtureKey),
    baselineSnapshot,
    "Migration 163 changed legacy tenant/user/invite/audit fields.",
  );

  for (const fixture of fixtures) {
    const [tenant] = await client.$queryRawUnsafe(
      `SELECT
         "status", "customerStage", "onboardingStatus", "cohortKey",
         "supportOwnerUserId", "trialStartsAt", "trialEndsAt",
         "entitlementProfileRevision"
       FROM "Tenant"
       WHERE "id" = $1`,
      fixture.tenantId,
    );
    assert(tenant, "A legacy tenant disappeared during migration 163.");
    assert.equal(tenant.status, fixture.status);
    assert.equal(tenant.customerStage, "INTERNAL");
    assert.equal(
      tenant.onboardingStatus,
      fixture.status === "ACTIVE" ? "ACTIVE" : "PROVISIONING",
    );
    assert.equal(tenant.cohortKey, null);
    assert.equal(tenant.supportOwnerUserId, null);
    assert.equal(tenant.trialStartsAt, null);
    assert.equal(tenant.trialEndsAt, null);
    assert.equal(tenant.entitlementProfileRevision, 0);
  }

  const legacyAuditRows = await client.$queryRawUnsafe(
    `SELECT audit."requestId"
     FROM "PlatformAdminAuditEvent" AS audit
     JOIN "Tenant" AS tenant ON tenant."id" = audit."tenantId"
     WHERE tenant."slug" LIKE $1`,
    `tenant-cp-${fixtureKey}-%`,
  );
  assert.equal(legacyAuditRows.length, fixtures.length);
  assert(legacyAuditRows.every((row) => row.requestId === null));

  const defaultTenantId = randomUUID();
  const defaultTenantSlug = `tenant-cp-${fixtureKey}-default`;
  await client.$executeRawUnsafe(
    `INSERT INTO "Tenant" ("id", "name", "slug", "updatedAt")
     VALUES ($1, 'Default tenant', $2, CURRENT_TIMESTAMP)`,
    defaultTenantId,
    defaultTenantSlug,
  );
  const [defaultTenant] = await client.$queryRawUnsafe(
    `SELECT
       "status", "customerStage", "onboardingStatus",
       "entitlementProfileRevision"
     FROM "Tenant"
     WHERE "id" = $1`,
    defaultTenantId,
  );
  assert.deepEqual(defaultTenant, {
    status: "SUSPENDED",
    customerStage: "INTERNAL",
    onboardingStatus: "PROVISIONING",
    entitlementProfileRevision: 0,
  });

  const [userRoleColumn] = await client.$queryRawUnsafe(
    `SELECT column_default, is_nullable
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'User'
       AND column_name = 'role'`,
  );
  assert.deepEqual(userRoleColumn, {
    column_default: null,
    is_nullable: "NO",
  });
  await expectSqlState("23502", () =>
    client.$executeRawUnsafe(
      `INSERT INTO "User" (
         "id", "tenantId", "email", "passwordHash",
         "accessScope", "updatedAt"
       )
       VALUES (
         $1, $2, $3, 'missing-role-hash',
         'NETWORK'::"UserAccessScope", CURRENT_TIMESTAMP
       )`,
      randomUUID(),
      defaultTenantId,
      `missing-role-${fixtureKey}@example.test`,
    ),
  );

  const activeTenant = fixtures.find((fixture) => fixture.status === "ACTIVE");
  assert(activeTenant);
  const requestId = `tenant-cp-upgrade-${fixtureKey}`;
  const requestAction = "TENANT_ENTITLEMENT_PROFILE_CHANGED";
  await client.$executeRawUnsafe(
    `INSERT INTO "PlatformAdminAuditEvent" (
       "id", "tenantId", "actorUserId", "requestId",
       "action", "targetType", "targetId", "reason"
     )
     VALUES ($1, $2, $3, $4, $5, 'TENANT_ENTITLEMENT_PROFILE', $2, $6)`,
    randomUUID(),
    activeTenant.tenantId,
    activeTenant.userId,
    requestId,
    requestAction,
    "First CAS request",
  );
  await expectSqlState("23505", () =>
    client.$executeRawUnsafe(
      `INSERT INTO "PlatformAdminAuditEvent" (
         "id", "tenantId", "actorUserId", "requestId",
         "action", "targetType", "targetId", "reason"
       )
       VALUES ($1, $2, $3, $4, $5, 'TENANT_ENTITLEMENT_PROFILE', $2, $6)`,
      randomUUID(),
      activeTenant.tenantId,
      activeTenant.userId,
      requestId,
      requestAction,
      "Duplicate CAS request",
    ),
  );
  const [requestCount] = await client.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS count
     FROM "PlatformAdminAuditEvent"
     WHERE "tenantId" = $1
       AND "action" = $2
       AND "requestId" = $3`,
    activeTenant.tenantId,
    requestAction,
    requestId,
  );
  assert.equal(requestCount.count, 1);

  const globalRequestId = `tenant-cp-global-${fixtureKey}`;
  const globalRequestAction = "TENANT_CONTROL_PLANE_GLOBAL_OPERATION";
  await client.$executeRawUnsafe(
    `INSERT INTO "PlatformAdminAuditEvent" (
       "id", "tenantId", "actorUserId", "requestId",
       "action", "targetType", "targetId", "reason"
     )
     VALUES ($1, NULL, $2, $3, $4, 'PLATFORM', NULL, $5)`,
    randomUUID(),
    activeTenant.userId,
    globalRequestId,
    globalRequestAction,
    "First global control-plane request",
  );
  await expectSqlState("23505", () =>
    client.$executeRawUnsafe(
      `INSERT INTO "PlatformAdminAuditEvent" (
         "id", "tenantId", "actorUserId", "requestId",
         "action", "targetType", "targetId", "reason"
       )
       VALUES ($1, NULL, $2, $3, $4, 'PLATFORM', NULL, $5)`,
      randomUUID(),
      activeTenant.userId,
      globalRequestId,
      globalRequestAction,
      "Duplicate global control-plane request",
    ),
  );
  const [globalRequestCount] = await client.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS count
     FROM "PlatformAdminAuditEvent"
     WHERE "tenantId" IS NULL
       AND "action" = $1
       AND "requestId" = $2`,
    globalRequestAction,
    globalRequestId,
  );
  assert.equal(globalRequestCount.count, 1);

  const casWinner = await client.$executeRawUnsafe(
    `UPDATE "Tenant"
     SET "entitlementProfileRevision" = 1
     WHERE "id" = $1
       AND "entitlementProfileRevision" = 0`,
    activeTenant.tenantId,
  );
  const staleCas = await client.$executeRawUnsafe(
    `UPDATE "Tenant"
     SET "entitlementProfileRevision" = 2
     WHERE "id" = $1
       AND "entitlementProfileRevision" = 0`,
    activeTenant.tenantId,
  );
  assert.equal(casWinner, 1);
  assert.equal(staleCas, 0);

  const [revision] = await client.$queryRawUnsafe(
    `SELECT "entitlementProfileRevision" AS revision
     FROM "Tenant"
     WHERE "id" = $1`,
    activeTenant.tenantId,
  );
  assert.equal(revision.revision, 1);
}

async function readControlPlaneCatalog(client) {
  const [types] = await client.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS count
     FROM pg_type
     WHERE typname IN (
       'TenantCustomerStage',
       'TenantOnboardingStatus',
       'TenantModule'
     )`,
  );
  const [table] = await client.$queryRawUnsafe(
    `SELECT to_regclass('public."TenantModuleEntitlement"')::text AS table_name`,
  );
  const [tenantColumns] = await client.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS count
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'Tenant'
       AND column_name IN (
         'customerStage',
         'onboardingStatus',
         'cohortKey',
         'supportOwnerUserId',
         'trialStartsAt',
         'trialEndsAt',
         'entitlementProfileRevision'
       )`,
  );
  const [auditColumns] = await client.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS count
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'PlatformAdminAuditEvent'
       AND column_name = 'requestId'`,
  );
  const [defaults] = await client.$queryRawUnsafe(
    `SELECT
       (
         SELECT column_default
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'Tenant'
           AND column_name = 'status'
       ) AS tenant_status_default,
       (
         SELECT column_default
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'User'
           AND column_name = 'role'
       ) AS user_role_default`,
  );

  return {
    controlPlaneTypeCount: types.count,
    entitlementTable: table.table_name,
    tenantControlPlaneColumnCount: tenantColumns.count,
    auditRequestIdColumnCount: auditColumns.count,
    tenantStatusDefault: defaults.tenant_status_default,
    userRoleDefault: defaults.user_role_default,
  };
}

function assertBaselineControlPlaneAbsent(catalog) {
  assert.equal(catalog.controlPlaneTypeCount, 0);
  assert.equal(catalog.entitlementTable, null);
  assert.equal(catalog.tenantControlPlaneColumnCount, 0);
  assert.equal(catalog.auditRequestIdColumnCount, 0);
  assert.match(catalog.tenantStatusDefault ?? "", /ACTIVE/);
  assert.match(catalog.userRoleDefault ?? "", /OWNER/);
}

async function runLockTimeoutScenario(
  schemaPath,
  databaseUrl,
  migrationPlan,
  migrationSqlContract,
  fixtures,
  fixtureKey,
  baselineSnapshot,
) {
  const blocker = prismaClient(databaseUrl);
  try {
    const beforeCatalog = await readControlPlaneCatalog(blocker);
    assertBaselineControlPlaneAbsent(beforeCatalog);

    await blocker.$transaction(
      async (transaction) => {
        await transaction.$executeRawUnsafe(
          `LOCK TABLE "User" IN ACCESS SHARE MODE`,
        );
        await assertMigrationLockSqlState(
          databaseUrl,
          migrationSqlContract.lockSql,
        );
        const attempt = await spawnMigrateDeployAsync(
          schemaPath,
          databaseUrl,
          LOCK_FAILURE_TIMEOUT_MS,
        );
        assertLockTimeoutFailure(attempt);
      },
      { maxWait: 5_000, timeout: LOCK_FAILURE_TIMEOUT_MS },
    );

    const afterCatalog = await readControlPlaneCatalog(blocker);
    assert.deepEqual(
      afterCatalog,
      beforeCatalog,
      "Lock-timeout failure left partial migration 163 DDL.",
    );
    assertBaselineControlPlaneAbsent(afterCatalog);
    assert.deepEqual(
      await readLegacySnapshot(blocker, fixtureKey),
      baselineSnapshot,
      "Lock-timeout failure changed legacy fixture rows.",
    );

    const migrationRows = await blocker.$queryRawUnsafe(
      `SELECT
         "migration_name",
         ("finished_at" IS NOT NULL AND "rolled_back_at" IS NULL) AS applied,
         ("finished_at" IS NULL AND "rolled_back_at" IS NULL) AS unfinished
       FROM "_prisma_migrations"
       WHERE "migration_name" = $1`,
      migrationPlan.targetMigration,
    );
    assert.equal(migrationRows.length, 1);
    assert.equal(migrationRows[0].applied, false);
    assert.equal(migrationRows[0].unfinished, true);

    const [fixtureCounts] = await blocker.$queryRawUnsafe(
      `SELECT
         (
           SELECT COUNT(*)::int
           FROM "Tenant"
           WHERE "slug" LIKE $1
         ) AS tenants,
         (
           SELECT COUNT(*)::int
           FROM "User" AS subject
           JOIN "Tenant" AS tenant ON tenant."id" = subject."tenantId"
           WHERE tenant."slug" LIKE $1
         ) AS users,
         (
           SELECT COUNT(*)::int
           FROM "UserInvite" AS invite
           JOIN "Tenant" AS tenant ON tenant."id" = invite."tenantId"
           WHERE tenant."slug" LIKE $1
         ) AS invites,
         (
           SELECT COUNT(*)::int
           FROM "PlatformAdminAuditEvent" AS audit
           JOIN "Tenant" AS tenant ON tenant."id" = audit."tenantId"
           WHERE tenant."slug" LIKE $1
         ) AS audit_events`,
      `tenant-cp-${fixtureKey}-%`,
    );
    assert.deepEqual(fixtureCounts, {
      tenants: fixtures.length,
      users: fixtures.length,
      invites: fixtures.length,
      audit_events: fixtures.length,
    });
  } finally {
    await blocker.$disconnect();
  }

  runMigrateResolveRolledBack(
    schemaPath,
    databaseUrl,
    migrationPlan.targetMigration,
  );
  runMigrateDeploy(schemaPath, databaseUrl);
  runMigrateDeploy(schemaPath, databaseUrl);
  await assertExactAppliedMigrations(databaseUrl, [
    ...migrationPlan.prefixMigrations,
    migrationPlan.targetMigration,
  ]);
}

function assertRealEnvironment(environment) {
  if (environment.NODE_ENV === "production") {
    contractError("PRODUCTION_ENVIRONMENT_REFUSED");
  }
  if (
    environment.TENANT_EXECUTION_CONTROL_PLANE_UPGRADE_SMOKE_CONFIRM !==
    REQUIRED_CONFIRMATION
  ) {
    contractError("UPGRADE_SMOKE_CONFIRMATION_REQUIRED");
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
    databaseUrlFor(safe.sourceUrl, "lp_tenant_cp_upgrade_ci_deadbeefdeadbeef")
      .includes("connection_limit=1"),
    true,
  );
  assertSafeGeneratedDatabaseName(
    "lp_tenant_cp_upgrade_ci_deadbeefdeadbeef",
  );
  assertSafeGeneratedDatabaseName("lp_tenant_cp_lock_ci_deadbeefdeadbeef");
  expectOfflineFailure(() => assertSafeGeneratedDatabaseName("leetplus_ci"));
  assertSafeTempRoot(join(tmpdir(), `${TEMP_ROOT_PREFIX}deadbeef`));
  expectOfflineFailure(() => assertSafeTempRoot(tmpdir()));
  assert.equal(
    quoteIdentifier("lp_tenant_cp_upgrade_ci_deadbeefdeadbeef"),
    '"lp_tenant_cp_upgrade_ci_deadbeefdeadbeef"',
  );
  expectOfflineFailure(() =>
    quoteIdentifier('unsafe"; DROP DATABASE leetplus_ci; --'),
  );
  assertLockTimeoutFailure({
    result: {
      error: undefined,
      status: 1,
    },
    elapsedMs: 5_000,
    output:
      "P3018 migration failed: current transaction is aborted, commands ignored until end of transaction block",
  });
  expectOfflineFailure(() =>
    assertLockTimeoutFailure({
      result: { error: undefined, status: 1 },
      elapsedMs: 25,
      output: "unrelated failure",
    }),
  );
  expectOfflineFailure(() =>
    assertLockTimeoutFailure({
      result: { error: undefined, status: 1 },
      elapsedMs: 5_000,
      output: "unrelated migration failure",
    }),
  );

  const migrationPlan = await readMigrationPlan();
  const migrationSqlContract =
    await assertTargetMigrationArtifact(migrationPlan);
  assert.match(
    migrationSqlContract.lockSql,
    /^LOCK\s+TABLE\s+"Tenant"\s*,\s*"User"\s*,\s*"PlatformAdminAuditEvent"\s+IN\s+ACCESS\s+EXCLUSIVE\s+MODE;$/iu,
  );
  assert.equal(
    migrationPlan.prefixMigrations.length,
    STAFF_TASK_FROZEN_PREFIX_COUNT,
  );
  assert.equal(
    migrationPlan.prefixMigrations.at(-1),
    STAFF_TASK_FROZEN_PREFIX_LATEST,
  );

  process.stdout.write(
    `${JSON.stringify({
      script: SCRIPT_NAME,
      status: "PASS",
      mode: "SELF_TEST",
      prefixMigrationCount: migrationPlan.prefixMigrations.length,
      targetMigration: migrationPlan.targetMigration,
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
  const { upgradeDatabaseName, lockDatabaseName } = generatedDatabaseNames();
  const sourceDatabaseUrl = databaseUrlFor(sourceUrl, sourceDatabaseName);
  const upgradeDatabaseUrl = databaseUrlFor(
    sourceUrl,
    upgradeDatabaseName,
  );
  const lockDatabaseUrl = databaseUrlFor(sourceUrl, lockDatabaseName);
  const admin = prismaClient(sourceDatabaseUrl);
  const tempRoot = await mkdtemp(join(tmpdir(), TEMP_ROOT_PREFIX));
  assertSafeTempRoot(tempRoot);

  let clusterLockHeld = false;
  let upgradeDatabaseCreated = false;
  let lockDatabaseCreated = false;
  let primaryError;
  const cleanupErrors = [];

  try {
    await assertTestSuperuser(admin, sourceDatabaseName);
    await acquireClusterLock(admin);
    clusterLockHeld = true;

    const artifact = await createMigrationArtifact(tempRoot, migrationPlan);
    await createDisposableDatabase(admin, upgradeDatabaseName);
    upgradeDatabaseCreated = true;
    await createDisposableDatabase(admin, lockDatabaseName);
    lockDatabaseCreated = true;

    runMigrateDeploy(artifact.schemaPath, upgradeDatabaseUrl);
    runMigrateDeploy(artifact.schemaPath, lockDatabaseUrl);
    await assertExactAppliedMigrations(
      upgradeDatabaseUrl,
      migrationPlan.prefixMigrations,
    );
    await assertExactAppliedMigrations(
      lockDatabaseUrl,
      migrationPlan.prefixMigrations,
    );

    const upgradeFixtureKey = randomBytes(6).toString("hex");
    const upgradeClient = prismaClient(upgradeDatabaseUrl);
    let upgradeFixtures;
    let upgradeBaselineSnapshot;
    try {
      upgradeFixtures = await createLegacyFixtures(
        upgradeClient,
        upgradeFixtureKey,
      );
      upgradeBaselineSnapshot = await readLegacySnapshot(
        upgradeClient,
        upgradeFixtureKey,
      );
    } finally {
      await upgradeClient.$disconnect();
    }

    const lockFixtureKey = randomBytes(6).toString("hex");
    const lockClient = prismaClient(lockDatabaseUrl);
    let lockFixtures;
    let lockBaselineSnapshot;
    try {
      lockFixtures = await createLegacyFixtures(lockClient, lockFixtureKey);
      lockBaselineSnapshot = await readLegacySnapshot(
        lockClient,
        lockFixtureKey,
      );
    } finally {
      await lockClient.$disconnect();
    }

    await addTargetMigrationToArtifact(artifact, migrationPlan);
    runMigrateDeploy(artifact.schemaPath, upgradeDatabaseUrl);
    await assertExactAppliedMigrations(upgradeDatabaseUrl, [
      ...migrationPlan.prefixMigrations,
      migrationPlan.targetMigration,
    ]);

    const upgradedClient = prismaClient(upgradeDatabaseUrl);
    try {
      await assertUpgradePostconditions(
        upgradedClient,
        upgradeFixtures,
        upgradeFixtureKey,
        upgradeBaselineSnapshot,
      );
    } finally {
      await upgradedClient.$disconnect();
    }

    await runLockTimeoutScenario(
      artifact.schemaPath,
      lockDatabaseUrl,
      migrationPlan,
      migrationSqlContract,
      lockFixtures,
      lockFixtureKey,
      lockBaselineSnapshot,
    );

    process.stdout.write(
      `${JSON.stringify({
        script: SCRIPT_NAME,
        status: "PASS",
        postgresMajor: 16,
        prefixMigrationCount: migrationPlan.prefixMigrations.length,
        targetMigration: migrationPlan.targetMigration,
        preservedTenants: upgradeFixtures.length,
        preservedUsers: upgradeFixtures.length,
        preservedInvites: upgradeFixtures.length,
        preservedAuditEvents: upgradeFixtures.length,
        databaseLockSqlStateVerified: "55P03",
        lockTimeoutRollbackVerified: true,
        partialControlPlaneDdlAfterLockFailure: 0,
        sourceDatabaseMigrationsApplied: 0,
      })}\n`,
    );
  } catch (error) {
    primaryError = error;
  } finally {
    if (upgradeDatabaseCreated) {
      try {
        await dropDisposableDatabase(admin, upgradeDatabaseName);
        upgradeDatabaseCreated = false;
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (lockDatabaseCreated) {
      try {
        await dropDisposableDatabase(admin, lockDatabaseName);
        lockDatabaseCreated = false;
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

  if (primaryError && cleanupErrors.length > 0) {
    throw new AggregateError(
      [primaryError, ...cleanupErrors],
      "Upgrade smoke and cleanup both failed.",
    );
  }
  if (primaryError) {
    throw primaryError;
  }
  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, "Upgrade smoke cleanup failed.");
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
        code: error?.code ?? "UPGRADE_SMOKE_FAILED",
        message:
          typeof error?.message === "string"
            ? error.message
            : "Tenant control-plane upgrade smoke failed.",
      },
    })}\n`,
  );
  process.exitCode = 1;
});

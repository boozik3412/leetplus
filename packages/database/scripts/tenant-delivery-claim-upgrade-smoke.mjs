import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
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
  STAFF_TASK_CURRENT_RELEASE_STATE,
} from "./staff-task-integrity-migration-state.mjs";

const SCRIPT_NAME = "tenant-delivery-claim-upgrade-smoke";
const REQUIRED_CONFIRMATION = "run-tenant-delivery-claim-upgrade-smoke";
const PREFIX_MIGRATION = "20260729120000_store_background_execution_fence";
const TARGET_MIGRATION = "20260729160000_guest_game_delivery_claim_fence";
const IDENTITY_FOUNDATION_MIGRATION =
  "20260729190000_identity_email_claim_foundation";
const BASE_MANIFEST_FILE = "tenant-delivery-claim-base-165-manifest.json";
const MIGRATION_PATTERN = /^\d{14}_[a-z0-9_]+$/u;
const SAFE_SOURCE_DATABASE_PATTERN =
  /(?:^|[_-])(?:ci|test|testing)(?:$|[_-])/iu;
const SUCCESS_DATABASE_PREFIX = "lp_delivery_claim_upgrade_ci_";
const FAILURE_DATABASE_PREFIX = "lp_delivery_claim_failure_ci_";
const RUNTIME_ROLE_PREFIX = "lp_delivery_claim_runtime_";
const SUCCESS_DATABASE_PATTERN =
  /^lp_delivery_claim_upgrade_ci_[a-f0-9]{16}$/u;
const FAILURE_DATABASE_PATTERN =
  /^lp_delivery_claim_failure_ci_[a-f0-9]{16}$/u;
const RUNTIME_ROLE_PATTERN = /^lp_delivery_claim_runtime_[a-f0-9]{16}$/u;
const TEMP_ROOT_PREFIX = "leetplus-delivery-claim-upgrade-";
const MIGRATION_TIMEOUT_MS = 10 * 60 * 1000;
const FAILURE_TIMEOUT_MS = 30_000;
const CLUSTER_LOCK_CLASS = 1_281_120_000;
const CLUSTER_LOCK_OBJECT = 166;
const RESERVED_TYPED_EVENT_TYPES = Object.freeze([
  "DELIVERY_CLAIMED",
  "DELIVERY_PROVIDER_ATTEMPTED",
  "DELIVERY_FINALIZED",
  "DELIVERY_REAPED",
  "DELIVERY_RETRIED",
  "DELIVERY_CANCELED",
  "DELIVERY_RECONCILED",
  "DELIVERY_INTEGRITY_QUARANTINED",
]);

const DELIVERY_CHECKS = Object.freeze([
  "GuestGameDelivery_status_check",
  "GuestGameDelivery_channel_check",
  "GuestGameDelivery_integrity_state_check",
  "GuestGameDelivery_claim_job_kind_check",
  "GuestGameDelivery_attempt_budget_check",
  "GuestGameDelivery_claim_generation_check",
  "GuestGameDelivery_revision_check",
  "GuestGameDelivery_reason_code_check",
  "GuestGameDelivery_runtime_identity_check",
  "GuestGameDelivery_digest_format_check",
  "GuestGameDelivery_outcome_check",
  "GuestGameDelivery_claim_window_check",
  "GuestGameDelivery_attempt_window_check",
  "GuestGameDelivery_send_grant_check",
  "GuestGameDelivery_receipt_pair_check",
  "GuestGameDelivery_store_revision_scope_check",
  "GuestGameDelivery_quarantine_state_check",
  "GuestGameDelivery_provider_state_check",
  "GuestGameDelivery_non_provider_state_check",
]);
const ATTEMPT_CHECKS = Object.freeze([
  "GuestGameDeliveryAttempt_channel_check",
  "GuestGameDeliveryAttempt_job_kind_check",
  "GuestGameDeliveryAttempt_positive_revision_check",
  "GuestGameDeliveryAttempt_digest_format_check",
  "GuestGameDeliveryAttempt_provider_key_check",
  "GuestGameDeliveryAttempt_window_check",
]);
const EVENT_CHECKS = Object.freeze([
  "GuestGameDeliveryEvent_transition_key_check",
  "GuestGameDeliveryEvent_scope_value_check",
  "GuestGameDeliveryEvent_provider_key_check",
  "GuestGameDeliveryEvent_digest_format_check",
  "GuestGameDeliveryEvent_receipt_pair_check",
  "GuestGameDeliveryEvent_claim_window_check",
  "GuestGameDeliveryEvent_attempt_window_check",
  "GuestGameDeliveryEvent_send_grant_check",
  "GuestGameDeliveryEvent_durable_evidence_check",
]);
const REQUIRED_INDEXES = Object.freeze([
  "guest_tenant_id_uidx",
  "guest_game_profile_tenant_id_uidx",
  "guest_game_reward_tenant_id_uidx",
  "guest_game_delivery_tenant_id_uidx",
  "guest_game_delivery_attempt_tenant_id_uidx",
  "guest_game_delivery_attempt_generation_uidx",
  "guest_game_delivery_attempt_provider_key_uidx",
  "guest_game_delivery_event_transition_uidx",
  "guest_game_delivery_event_revision_uidx",
  "guest_game_delivery_current_attempt_uidx",
  "guest_game_delivery_ready_claim_idx",
  "guest_game_delivery_processing_reaper_idx",
  "guest_game_delivery_dispatching_ack_idx",
  "guest_game_delivery_reconciliation_idx",
  "guest_game_delivery_store_execution_idx",
]);
const REQUIRED_TRIGGERS = Object.freeze([
  "GuestGameDelivery_transition_guard",
  "GuestGameDelivery_binding_check",
  "GuestGameReward_delivery_binding_check",
  "GuestGameDelivery_transition_event_check",
  "GuestGameDeliveryAttempt_append_only",
  "GuestGameDeliveryEvent_append_only",
]);
const REQUIRED_FUNCTIONS = Object.freeze([
  "guest_game_delivery_transition_key_v1",
  "guest_game_delivery_transition_guard",
  "guest_game_reward_delivery_lock_v1",
  "guest_game_delivery_binding_check",
  "guest_game_reward_delivery_binding_check",
  "guest_game_delivery_transition_event_check",
  "guest_game_delivery_attempt_append_only",
  "guest_game_delivery_event_append_only",
  "guest_game_delivery_record_event_v1",
]);
const REQUIRED_RESTRICT_FOREIGN_KEYS = Object.freeze([
  "GuestGameDelivery_tenantId_rewardId_fkey",
  "GuestGameDelivery_tenantId_profileId_fkey",
  "GuestGameDelivery_tenantId_guestId_fkey",
  "GuestGameDelivery_storeId_fkey",
  "GuestGameDelivery_tenantId_storeId_fkey",
  "GuestGameDeliveryAttempt_tenantId_fkey",
  "GuestGameDeliveryAttempt_tenantId_deliveryId_fkey",
  "GuestGameDeliveryAttempt_tenantId_rewardId_fkey",
  "GuestGameDeliveryAttempt_tenantId_storeId_fkey",
  "GuestGameDeliveryEvent_tenantId_deliveryId_fkey",
  "GuestGameDeliveryEvent_tenantId_rewardId_fkey",
  "GuestGameDeliveryEvent_tenantId_storeId_fkey",
  "GuestGameDeliveryEvent_tenantId_attemptId_fkey",
]);

const HELP = `
${SCRIPT_NAME}

Local/CI-only PostgreSQL 16 populated rehearsal for migration 166. It creates
two random disposable databases from template0 and never migrates, templates,
or writes application data in the source database.

The success database is migrated through exact CURRENT_165, populated with
two tenants, three fail-closed Stores, provider/non-provider deliveries and
legacy events, then upgraded to CURRENT_166. The smoke verifies deterministic
Store backfill, legacy quarantine, evidence preservation, same-scope RESTRICT
foreign keys, CHECK/index/function/trigger catalogs, append-only evidence,
four revision-fenced READY/BLOCKED transitions under a restricted runtime
role through one private SECURITY DEFINER event boundary, direct Event INSERT
denial, stale/future/extra event replay rejection, final-row reason/integrity
evidence consistency, an exact two-session advisory/Reward/Delivery lock-order
regression, seven rejected legacy-quarantine mutations with zero state/evidence
drift, and idempotent deploy.

The failure database proves separate cross-tenant reward/event preflights, all
eight reserved typed-event collisions, a five-second migration lock timeout,
and a late trigger conflict. Every failed attempt must roll back all migration
166 data and DDL before an explicit Prisma rolled-back resolution and final
recovery deploy.

Usage:
  node scripts/tenant-delivery-claim-upgrade-smoke.mjs
  node scripts/tenant-delivery-claim-upgrade-smoke.mjs --self-test
  node scripts/tenant-delivery-claim-upgrade-smoke.mjs --help

Required for the real PostgreSQL smoke:
  DATABASE_URL
    PostgreSQL 16 on localhost, public schema, database name containing a
    ci/test/testing marker, connected as a disposable-cluster test superuser.
  TENANT_DELIVERY_CLAIM_UPGRADE_SMOKE_CONFIRM
    Must equal: ${REQUIRED_CONFIRMATION}

Safety:
  - NODE_ENV=production is always rejected.
  - The source database is not migrated and is never used as a template.
  - Only generated ${SUCCESS_DATABASE_PREFIX}<hex> and
    ${FAILURE_DATABASE_PREFIX}<hex> databases may be created or dropped.
  - Only a generated ${RUNTIME_ROLE_PREFIX}<hex> NOLOGIN role may be created
    for the least-privilege trigger/helper rehearsal, and it is dropped after
    both disposable databases.
  - Cleanup force-drops both generated databases and removes only a validated
    generated OS temp directory.
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
  for (const argument of argv) {
    if (argument !== "--self-test") {
      contractError("CLI_ARGUMENT_UNSUPPORTED");
    }
  }
  return { help: false, selfTest: argv.includes("--self-test") };
}

function quoteIdentifier(value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/u.test(value)) {
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
  const hostname = sourceUrl.hostname.toLowerCase().replace(/^\[|\]$/gu, "");
  if (!new Set(["127.0.0.1", "localhost", "::1"]).has(hostname)) {
    contractError("LOOPBACK_POSTGRESQL_REQUIRED");
  }
  const databaseName = decodeURIComponent(
    sourceUrl.pathname.replace(/^\/+/u, ""),
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
  return { successDatabaseName, failureDatabaseName };
}

function generatedRuntimeRoleName() {
  const roleName = `${RUNTIME_ROLE_PREFIX}${randomBytes(8).toString("hex")}`;
  assert.match(roleName, RUNTIME_ROLE_PATTERN);
  return roleName;
}

function assertSafeGeneratedDatabaseName(databaseName) {
  if (
    !SUCCESS_DATABASE_PATTERN.test(databaseName) &&
    !FAILURE_DATABASE_PATTERN.test(databaseName)
  ) {
    contractError("GENERATED_DATABASE_NAME_INVALID");
  }
}

function assertSafeGeneratedRuntimeRoleName(roleName) {
  if (!RUNTIME_ROLE_PATTERN.test(roleName)) {
    contractError("GENERATED_RUNTIME_ROLE_NAME_INVALID");
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
    transactionOptions: { maxWait: 5_000, timeout: 30_000 },
  });
}

function normalizedSha256(content) {
  return createHash("sha256")
    .update(content.replace(/\r\n?/gu, "\n"), "utf8")
    .digest("hex");
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
    migrationDirectories.every((name) => MIGRATION_PATTERN.test(name)),
    "Committed migration directory names changed.",
  );
  assert.equal(migrationDirectories.length, CURRENT_EXPECTED_MIGRATION_COUNT);
  assert.equal(
    migrationDirectories.at(-1),
    CURRENT_EXPECTED_LATEST_MIGRATION,
  );
  assert.equal(STAFF_TASK_CURRENT_RELEASE_STATE, "CURRENT_170");
  assert.deepEqual(STAFF_TASK_ALLOWED_ADDITIVE_TAIL.slice(-6, -4), [
    PREFIX_MIGRATION,
    TARGET_MIGRATION,
  ]);
  const targetIndex = migrationDirectories.indexOf(TARGET_MIGRATION);
  assert.equal(targetIndex, migrationDirectories.length - 5);
  assert.equal(migrationDirectories[targetIndex - 1], PREFIX_MIGRATION);
  assert.equal(
    migrationDirectories[targetIndex + 1],
    IDENTITY_FOUNDATION_MIGRATION,
  );
  assert.equal(
    migrationDirectories[targetIndex + 4],
    CURRENT_EXPECTED_LATEST_MIGRATION,
  );

  const manifest = JSON.parse(
    await readFile(
      new URL(`./${BASE_MANIFEST_FILE}`, import.meta.url),
      "utf8",
    ),
  );
  assert.deepEqual(
    {
      schemaVersion: manifest.schemaVersion,
      migrationCount: manifest.migrationCount,
      latestMigration: manifest.latestMigration,
      lineEnding: manifest.lineEnding,
    },
    {
      schemaVersion: 1,
      migrationCount: 165,
      latestMigration: PREFIX_MIGRATION,
      lineEnding: "LF",
    },
  );
  const prefixMigrations = migrationDirectories.slice(0, targetIndex);
  assert.deepEqual(
    manifest.migrations.map(({ migrationName }) => migrationName),
    prefixMigrations,
  );
  for (const entry of manifest.migrations) {
    const content = await readFile(
      join(
        sourcePrismaDir,
        "migrations",
        entry.migrationName,
        "migration.sql",
      ),
      "utf8",
    );
    assert.equal(normalizedSha256(content), entry.sha256);
  }
  const targetSql = await readFile(
    join(sourcePrismaDir, "migrations", TARGET_MIGRATION, "migration.sql"),
    "utf8",
  );
  assert.match(targetSql, /^BEGIN;/u);
  assert.match(targetSql, /COMMIT;\s*$/u);
  assert.match(
    targetSql,
    /CURRENT_165 Store background execution fence is not present/u,
  );
  assert.doesNotMatch(
    targetSql,
    /(?:ALTER TABLE|UPDATE|INSERT INTO|DELETE FROM)\s+"Store"/u,
  );
  return { sourcePrismaDir, prefixMigrations, targetMigration: TARGET_MIGRATION };
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
      maxBuffer: 8 * 1024 * 1024,
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
    error.output = attempt.output;
    error.cause = attempt.result.error;
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

function assertMigrationFailure(attempt, expectedPattern) {
  assert.equal(attempt.result.error, undefined);
  assert.notEqual(attempt.result.status, 0);
  assert(attempt.elapsedMs < FAILURE_TIMEOUT_MS);
  assert.match(attempt.output, new RegExp(TARGET_MIGRATION, "u"));
  assert.match(attempt.output, expectedPattern);
}

function assertLockTimeoutFailure(attempt) {
  assertMigrationFailure(
    attempt,
    /(?:55P03|lock timeout|current transaction is aborted)/iu,
  );
  assert(attempt.elapsedMs >= 4_000);
}

async function assertTestSuperuser(admin, expectedDatabaseName) {
  const [row] = await admin.$queryRawUnsafe(
    `SELECT
       current_database() AS database_name,
       current_setting('server_version_num')::int AS server_version_number,
       role.rolsuper AS is_superuser
     FROM pg_roles AS role
     WHERE role.rolname = current_user`,
  );
  assert.equal(row?.database_name, expectedDatabaseName);
  assert.equal(Math.floor(row.server_version_number / 10_000), 16);
  assert.equal(row.is_superuser, true);
}

async function acquireClusterLock(admin) {
  const [row] = await admin.$queryRawUnsafe(
    `SELECT pg_try_advisory_lock($1::int, $2::int) AS acquired`,
    CLUSTER_LOCK_CLASS,
    CLUSTER_LOCK_OBJECT,
  );
  assert.equal(row?.acquired, true);
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

async function createRestrictedRuntimeRole(admin, roleName) {
  assertSafeGeneratedRuntimeRoleName(roleName);
  await admin.$executeRawUnsafe(
    `CREATE ROLE ${quoteIdentifier(roleName)}
       NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT
       NOREPLICATION NOBYPASSRLS`,
  );
}

async function dropRestrictedRuntimeRole(admin, roleName) {
  assertSafeGeneratedRuntimeRoleName(roleName);
  await admin.$executeRawUnsafe(
    `DROP ROLE IF EXISTS ${quoteIdentifier(roleName)}`,
  );
}

function normalizeRows(rows) {
  return JSON.parse(JSON.stringify(rows));
}

async function readSourceMigrationState(admin) {
  return normalizeRows(
    await admin.$queryRawUnsafe(
      `SELECT "migration_name", "checksum", "finished_at", "rolled_back_at"
       FROM "_prisma_migrations"
       ORDER BY "started_at", "migration_name"`,
    ),
  );
}

async function readMigrationSummary(databaseUrl) {
  const client = prismaClient(databaseUrl);
  try {
    return client.$queryRawUnsafe(
      `SELECT
         "migration_name",
         ("finished_at" IS NOT NULL AND "rolled_back_at" IS NULL) AS applied,
         ("finished_at" IS NULL AND "rolled_back_at" IS NULL) AS unfinished,
         ("rolled_back_at" IS NOT NULL) AS rolled_back
       FROM "_prisma_migrations"
       ORDER BY "started_at", "migration_name"`,
    );
  } finally {
    await client.$disconnect();
  }
}

async function assertExactAppliedMigrations(databaseUrl, expected) {
  const summary = await readMigrationSummary(databaseUrl);
  assert.deepEqual(
    summary.filter((row) => row.applied).map((row) => row.migration_name),
    expected,
  );
  assert.equal(summary.filter((row) => row.unfinished).length, 0);
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

async function insertTenant(client, id, suffix, executionRevision = 7) {
  await client.$executeRawUnsafe(
    `INSERT INTO "Tenant" (
       "id", "name", "slug", "status", "customerStage",
       "onboardingStatus", "entitlementProfileRevision", "executionRevision",
       "createdAt", "updatedAt"
     ) VALUES (
       $1, $2, $3, 'ACTIVE', 'INTERNAL', 'ACTIVE', 1, $4,
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
     )`,
    id,
    `Tenant ${suffix}`,
    `delivery-${suffix}-${id.slice(0, 8)}`,
    executionRevision,
  );
}

async function insertStore(client, id, tenantId, suffix) {
  await client.$executeRawUnsafe(
    `INSERT INTO "Store" (
       "id", "tenantId", "name", "gamificationEnabled",
       "backgroundExecutionEnabled", "executionRevision", "isActive",
       "createdAt", "updatedAt"
     ) VALUES (
       $1, $2, $3, true, false, 0, true,
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
     )`,
    id,
    tenantId,
    `Store ${suffix}`,
  );
}

async function advanceStoreToDisabledRevisionTwo(client, storeId) {
  await client.$executeRawUnsafe(
    `UPDATE "Store"
     SET "backgroundExecutionEnabled" = true
     WHERE "id" = $1`,
    storeId,
  );
  await client.$executeRawUnsafe(
    `UPDATE "Store"
     SET "backgroundExecutionEnabled" = false
     WHERE "id" = $1`,
    storeId,
  );
}

async function insertGuest(client, id, tenantId, suffix) {
  await client.$executeRawUnsafe(
    `INSERT INTO "Guest" (
       "id", "tenantId", "externalGuestId", "createdAt", "updatedAt"
     ) VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    id,
    tenantId,
    `guest-${suffix}`,
  );
}

async function insertProfile(client, id, tenantId, guestId, suffix) {
  await client.$executeRawUnsafe(
    `INSERT INTO "GuestGameProfile" (
       "id", "tenantId", "guestId", "displayName", "createdAt", "updatedAt"
     ) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    id,
    tenantId,
    guestId,
    `Profile ${suffix}`,
  );
}

async function insertReward(
  client,
  { id, tenantId, profileId, guestId, storeId, suffix },
) {
  await client.$executeRawUnsafe(
    `INSERT INTO "GuestGameReward" (
       "id", "tenantId", "profileId", "guestId", "storeId",
       "status", "source", "rewardType", "rewardLabel",
       "qualifiedAt", "createdAt", "updatedAt"
     ) VALUES (
       $1, $2, $3, $4, $5, 'QUALIFIED', 'SYSTEM', 'BONUS', $6,
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
     )`,
    id,
    tenantId,
    profileId,
    guestId,
    storeId,
    `Reward ${suffix}`,
  );
}

async function insertDelivery(
  client,
  {
    id,
    tenantId,
    rewardId,
    profileId,
    guestId,
    storeId,
    channel,
    status,
    readinessStatus,
    suffix,
  },
) {
  const terminalAt = new Date("2026-07-28T12:00:00.000Z");
  await client.$executeRawUnsafe(
    `INSERT INTO "GuestGameDelivery" (
       "id", "tenantId", "rewardId", "profileId", "guestId", "storeId",
       "channel", "status", "readinessStatus", "messageTitle", "messageBody",
       "preparedAt", "sentAt", "failedAt", "canceledAt",
       "createdAt", "updatedAt"
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
       CURRENT_TIMESTAMP, $12, $13, $14,
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
     )`,
    id,
    tenantId,
    rewardId,
    profileId,
    guestId,
    storeId,
    channel,
    status,
    readinessStatus,
    `Title ${suffix}`,
    `Body ${suffix}`,
    status === "SENT" ? terminalAt : null,
    status === "FAILED" ? terminalAt : null,
    status === "CANCELED" ? terminalAt : null,
  );
}

async function insertLegacyEvent(
  client,
  { id, tenantId, deliveryId, rewardId, eventType },
) {
  await client.$executeRawUnsafe(
    `INSERT INTO "GuestGameDeliveryEvent" (
       "id", "tenantId", "deliveryId", "rewardId", "eventType",
       "fromStatus", "toStatus", "createdAt"
     ) VALUES ($1, $2, $3, $4, $5, 'READY', 'SENT', CURRENT_TIMESTAMP)`,
    id,
    tenantId,
    deliveryId,
    rewardId,
    eventType,
  );
}

async function createSuccessFixtures(client, fixtureKey) {
  const ids = {
    tenantA: randomUUID(),
    tenantB: randomUUID(),
    storeA1: randomUUID(),
    storeA2: randomUUID(),
    storeB1: randomUUID(),
    guestA1: randomUUID(),
    guestA2: randomUUID(),
    guestB1: randomUUID(),
    profileA1: randomUUID(),
    profileA2: randomUUID(),
    profileB1: randomUUID(),
    legacyEvent: randomUUID(),
    rewards: {},
    deliveries: {},
  };
  await insertTenant(client, ids.tenantA, `${fixtureKey}-a`);
  await insertTenant(client, ids.tenantB, `${fixtureKey}-b`);
  await insertStore(client, ids.storeA1, ids.tenantA, `${fixtureKey}-a1`);
  await insertStore(client, ids.storeA2, ids.tenantA, `${fixtureKey}-a2`);
  await insertStore(client, ids.storeB1, ids.tenantB, `${fixtureKey}-b1`);
  await advanceStoreToDisabledRevisionTwo(client, ids.storeA1);
  await advanceStoreToDisabledRevisionTwo(client, ids.storeA2);
  await insertGuest(client, ids.guestA1, ids.tenantA, `${fixtureKey}-a1`);
  await insertGuest(client, ids.guestA2, ids.tenantA, `${fixtureKey}-a2`);
  await insertGuest(client, ids.guestB1, ids.tenantB, `${fixtureKey}-b1`);
  await insertProfile(
    client,
    ids.profileA1,
    ids.tenantA,
    ids.guestA1,
    `${fixtureKey}-a1`,
  );
  await insertProfile(
    client,
    ids.profileA2,
    ids.tenantA,
    ids.guestA2,
    `${fixtureKey}-a2`,
  );
  await insertProfile(
    client,
    ids.profileB1,
    ids.tenantB,
    ids.guestB1,
    `${fixtureKey}-b1`,
  );

  const definitions = [
    ["backfill", ids.storeA1, ids.profileA1, ids.guestA1],
    ["match", ids.storeA1, ids.profileA1, ids.guestA1],
    ["mismatch", ids.storeA2, ids.profileA1, ids.guestA1],
    ["noStore", null, ids.profileA1, ids.guestA1],
    ["sent", ids.storeA1, ids.profileA1, ids.guestA1],
    ["failed", ids.storeA1, ids.profileA1, ids.guestA1],
    ["canceled", ids.storeA1, ids.profileA1, ids.guestA1],
    ["manual", null, ids.profileA1, ids.guestA1],
    ["recipient", ids.storeA1, ids.profileA1, ids.guestA1],
    ["blocked", ids.storeA1, ids.profileA1, ids.guestA1],
  ];
  for (const [name, storeId, profileId, guestId] of definitions) {
    ids.rewards[name] = randomUUID();
    await insertReward(client, {
      id: ids.rewards[name],
      tenantId: ids.tenantA,
      profileId,
      guestId,
      storeId,
      suffix: `${fixtureKey}-${name}`,
    });
  }

  const deliveries = [
    ["backfill", "TELEGRAM", "READY", "READY_FOR_BOT", null, ids.profileA1, ids.guestA1],
    ["match", "MAX", "READY", "READY_FOR_BOT", ids.storeA1, ids.profileA1, ids.guestA1],
    ["mismatch", "TELEGRAM", "READY", "READY_FOR_BOT", ids.storeA1, ids.profileA1, ids.guestA1],
    ["noStore", "MAX", "READY", "READY_FOR_BOT", null, ids.profileA1, ids.guestA1],
    ["sent", "TELEGRAM", "SENT", "READY_FOR_BOT", ids.storeA1, ids.profileA1, ids.guestA1],
    ["failed", "MAX", "FAILED", "READY_FOR_BOT", ids.storeA1, ids.profileA1, ids.guestA1],
    ["canceled", "TELEGRAM", "CANCELED", "READY_FOR_BOT", ids.storeA1, ids.profileA1, ids.guestA1],
    ["manual", "MANUAL", "READY", "READY_FOR_CASHIER", null, ids.profileA1, ids.guestA1],
    ["recipient", "TELEGRAM", "READY", "READY_FOR_BOT", ids.storeA1, ids.profileA2, ids.guestA2],
    ["blocked", "MAX", "BLOCKED", "NEEDS_CONSENT", ids.storeA1, ids.profileA1, ids.guestA1],
  ];
  for (const [
    name,
    channel,
    status,
    readinessStatus,
    storeId,
    profileId,
    guestId,
  ] of deliveries) {
    ids.deliveries[name] = randomUUID();
    await insertDelivery(client, {
      id: ids.deliveries[name],
      tenantId: ids.tenantA,
      rewardId: ids.rewards[name],
      profileId,
      guestId,
      storeId,
      channel,
      status,
      readinessStatus,
      suffix: `${fixtureKey}-${name}`,
    });
  }
  await insertLegacyEvent(client, {
    id: ids.legacyEvent,
    tenantId: ids.tenantA,
    deliveryId: ids.deliveries.sent,
    rewardId: ids.rewards.sent,
    eventType: "DELIVERY_SENT_BY_PROVIDER",
  });
  return ids;
}

async function createFailureFixtures(client, fixtureKey) {
  const ids = await createSuccessFixtures(client, fixtureKey);
  ids.failureRewardA = randomUUID();
  ids.failureRewardB = randomUUID();
  ids.failureDelivery = randomUUID();
  ids.failureEvent = randomUUID();
  await insertReward(client, {
    id: ids.failureRewardA,
    tenantId: ids.tenantA,
    profileId: ids.profileA1,
    guestId: ids.guestA1,
    storeId: null,
    suffix: `${fixtureKey}-failure-a`,
  });
  await insertReward(client, {
    id: ids.failureRewardB,
    tenantId: ids.tenantB,
    profileId: ids.profileB1,
    guestId: ids.guestB1,
    storeId: null,
    suffix: `${fixtureKey}-failure-b`,
  });
  await insertDelivery(client, {
    id: ids.failureDelivery,
    tenantId: ids.tenantA,
    rewardId: ids.failureRewardB,
    profileId: ids.profileA1,
    guestId: ids.guestA1,
    storeId: null,
    channel: "MANUAL",
    status: "READY",
    readinessStatus: "READY_FOR_CASHIER",
    suffix: `${fixtureKey}-failure`,
  });
  return ids;
}

async function readLegacySnapshot(client) {
  const stores = await client.$queryRawUnsafe(
    `SELECT "id", "tenantId", "isActive", "backgroundExecutionEnabled",
            "executionRevision"
     FROM "Store" ORDER BY "id"`,
  );
  const deliveries = await client.$queryRawUnsafe(
    `SELECT "id", "tenantId", "rewardId", "profileId", "guestId", "storeId",
            "channel", "status", "readinessStatus", "sentAt", "failedAt",
            "canceledAt"
     FROM "GuestGameDelivery" ORDER BY "id"`,
  );
  const events = await client.$queryRawUnsafe(
    `SELECT "id", "tenantId", "deliveryId", "rewardId", "eventType",
            "fromStatus", "toStatus", "createdAt"
     FROM "GuestGameDeliveryEvent" ORDER BY "id"`,
  );
  return normalizeRows({ stores, deliveries, events });
}

async function readPre166Catalog(client) {
  const [row] = await client.$queryRawUnsafe(
    `SELECT
       to_regclass('public."GuestGameDeliveryAttempt"') IS NOT NULL
         AS attempt_table_exists,
       EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'GuestGameDelivery'
           AND column_name = 'claimGeneration'
       ) AS claim_column_exists,
       to_regclass('public.guest_game_delivery_current_attempt_uidx') IS NOT NULL
         AS claim_index_exists`,
  );
  return row;
}

function assertPre166Catalog(catalog) {
  assert.deepEqual(catalog, {
    attempt_table_exists: false,
    claim_column_exists: false,
    claim_index_exists: false,
  });
}

async function readPost166Catalog(client) {
  const columns = await client.$queryRawUnsafe(
    `SELECT table_name, column_name, data_type, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name IN (
         'GuestGameDelivery',
         'GuestGameDeliveryEvent',
         'GuestGameDeliveryAttempt'
       )
     ORDER BY table_name, ordinal_position`,
  );
  const constraints = await client.$queryRawUnsafe(
    `SELECT
       constraint_row.conname AS name,
       constraint_row.contype AS type,
       constraint_row.convalidated AS validated,
       constraint_row.confdeltype AS delete_action,
       constraint_row.confupdtype AS update_action
     FROM pg_catalog.pg_constraint AS constraint_row
     WHERE constraint_row.conrelid IN (
       'public."GuestGameDelivery"'::regclass,
       'public."GuestGameDeliveryEvent"'::regclass,
       'public."GuestGameDeliveryAttempt"'::regclass
     )
     ORDER BY constraint_row.conname`,
  );
  const indexes = await client.$queryRawUnsafe(
    `SELECT
       index_class.relname AS name,
       index_row.indisunique AS is_unique,
       index_row.indisvalid AS is_valid,
       index_row.indisready AS is_ready,
       pg_catalog.pg_get_expr(
         index_row.indpred,
         index_row.indrelid
       ) AS predicate
     FROM pg_catalog.pg_index AS index_row
     JOIN pg_catalog.pg_class AS index_class
       ON index_class.oid = index_row.indexrelid
     WHERE index_class.relname = ANY($1::text[])
     ORDER BY index_class.relname`,
    [...REQUIRED_INDEXES],
  );
  const triggers = await client.$queryRawUnsafe(
    `SELECT
       trigger_row.tgname AS name,
       trigger_row.tgenabled AS enabled,
       trigger_row.tgdeferrable AS deferrable,
       trigger_row.tginitdeferred AS initially_deferred
     FROM pg_catalog.pg_trigger AS trigger_row
     WHERE trigger_row.tgname = ANY($1::text[])
       AND NOT trigger_row.tgisinternal
     ORDER BY trigger_row.tgname`,
    [...REQUIRED_TRIGGERS],
  );
  const functions = await client.$queryRawUnsafe(
    `SELECT
       procedure_row.proname AS name,
       pg_catalog.pg_get_function_identity_arguments(procedure_row.oid)
         AS identity_arguments,
       procedure_row.proconfig AS configuration,
       procedure_row.provolatile AS volatility,
       procedure_row.proparallel AS parallel_safety,
       procedure_row.prosecdef AS security_definer,
       procedure_row.proowner = (
         SELECT table_row.relowner
         FROM pg_catalog.pg_class AS table_row
         WHERE table_row.oid =
           'public."GuestGameDeliveryEvent"'::regclass
       ) AS owned_by_event_table_owner,
       EXISTS (
         SELECT 1
         FROM pg_catalog.aclexplode(
           COALESCE(
             procedure_row.proacl,
             pg_catalog.acldefault('f', procedure_row.proowner)
           )
         ) AS acl
         WHERE acl.grantee = 0
           AND acl.privilege_type = 'EXECUTE'
       ) AS public_execute
     FROM pg_catalog.pg_proc AS procedure_row
     JOIN pg_catalog.pg_namespace AS namespace_row
       ON namespace_row.oid = procedure_row.pronamespace
     WHERE namespace_row.nspname = 'public'
       AND procedure_row.proname = ANY($1::text[])
     ORDER BY procedure_row.proname`,
    [...REQUIRED_FUNCTIONS],
  );
  return { columns, constraints, indexes, triggers, functions };
}

function assertPost166Catalog(catalog) {
  const columnMap = new Map(
    catalog.columns.map((row) => [
      `${row.table_name}.${row.column_name}`,
      row,
    ]),
  );
  for (const [key, expected] of [
    [
      "GuestGameDelivery.claimGeneration",
      { data_type: "integer", is_nullable: "NO", column_default: "0" },
    ],
    [
      "GuestGameDelivery.transitionRevision",
      { data_type: "bigint", is_nullable: "NO", column_default: "0" },
    ],
    [
      "GuestGameDelivery.integrityState",
      {
        data_type: "text",
        is_nullable: "NO",
        column_default: "'VERIFIED'::text",
      },
    ],
    [
      "GuestGameDelivery.claimedAt",
      {
        data_type: "timestamp with time zone",
        is_nullable: "YES",
        column_default: null,
      },
    ],
    [
      "GuestGameDelivery.providerReceiptRefEncrypted",
      { data_type: "bytea", is_nullable: "YES", column_default: null },
    ],
    [
      "GuestGameDeliveryEvent.transitionKey",
      { data_type: "text", is_nullable: "YES", column_default: null },
    ],
    [
      "GuestGameDeliveryEvent.transitionRevision",
      { data_type: "bigint", is_nullable: "YES", column_default: null },
    ],
    [
      "GuestGameDeliveryEvent.integrityState",
      { data_type: "text", is_nullable: "YES", column_default: null },
    ],
    [
      "GuestGameDeliveryEvent.integrityReasonCode",
      { data_type: "text", is_nullable: "YES", column_default: null },
    ],
    [
      "GuestGameDeliveryAttempt.providerAttemptKey",
      { data_type: "text", is_nullable: "NO", column_default: null },
    ],
  ]) {
    const row = columnMap.get(key);
    assert(row, `${key} is missing.`);
    assert.deepEqual(
      {
        data_type: row.data_type,
        is_nullable: row.is_nullable,
        column_default: row.column_default,
      },
      expected,
    );
  }

  const constraintMap = new Map(
    catalog.constraints.map((row) => [row.name, row]),
  );
  for (const name of [
    ...DELIVERY_CHECKS,
    ...ATTEMPT_CHECKS,
    ...EVENT_CHECKS,
  ]) {
    const row = constraintMap.get(name);
    assert(row, `${name} is missing.`);
    assert.equal(row.type, "c");
    assert.equal(row.validated, true);
  }
  for (const name of REQUIRED_RESTRICT_FOREIGN_KEYS) {
    const row = constraintMap.get(name);
    assert(row, `${name} is missing.`);
    assert.equal(row.type, "f");
    assert.equal(row.validated, true);
    assert.equal(row.delete_action, "r");
    assert.equal(row.update_action, "r");
  }
  for (const legacyName of [
    "GuestGameDelivery_rewardId_fkey",
    "GuestGameDelivery_profileId_fkey",
    "GuestGameDelivery_guestId_fkey",
    "GuestGameDeliveryEvent_deliveryId_fkey",
    "GuestGameDeliveryEvent_rewardId_fkey",
  ]) {
    assert.equal(constraintMap.has(legacyName), false);
  }

  assert.equal(catalog.indexes.length, REQUIRED_INDEXES.length);
  for (const index of catalog.indexes) {
    assert.equal(index.is_valid, true);
    assert.equal(index.is_ready, true);
  }
  const indexMap = new Map(catalog.indexes.map((row) => [row.name, row]));
  assert.equal(
    indexMap.get("guest_game_delivery_current_attempt_uidx")?.is_unique,
    true,
  );
  const eventRevisionIndex = indexMap.get(
    "guest_game_delivery_event_revision_uidx",
  );
  assert.equal(eventRevisionIndex?.is_unique, true);
  for (const eventType of RESERVED_TYPED_EVENT_TYPES) {
    assert.match(
      eventRevisionIndex?.predicate ?? "",
      new RegExp(eventType, "u"),
    );
  }
  assert.match(
    indexMap.get("guest_game_delivery_ready_claim_idx")?.predicate ?? "",
    /status.*READY/iu,
  );
  assert.match(
    indexMap.get("guest_game_delivery_processing_reaper_idx")?.predicate ?? "",
    /PROCESSING[\s\S]*providerAttemptedAt.*IS NULL/iu,
  );

  assert.equal(catalog.triggers.length, REQUIRED_TRIGGERS.length);
  const triggerMap = new Map(catalog.triggers.map((row) => [row.name, row]));
  for (const name of REQUIRED_TRIGGERS) {
    assert.equal(triggerMap.get(name)?.enabled, "O");
  }
  for (const name of [
    "GuestGameDelivery_binding_check",
    "GuestGameReward_delivery_binding_check",
    "GuestGameDelivery_transition_event_check",
  ]) {
    assert.equal(triggerMap.get(name)?.deferrable, true);
    assert.equal(triggerMap.get(name)?.initially_deferred, true);
  }

  assert.equal(catalog.functions.length, REQUIRED_FUNCTIONS.length);
  const functionMap = new Map(catalog.functions.map((fn) => [fn.name, fn]));
  const transitionKeyHelper = functionMap.get(
    "guest_game_delivery_transition_key_v1",
  );
  assert(transitionKeyHelper);
  assert.equal(
    transitionKeyHelper.identity_arguments,
    "tenant_id text, delivery_id text, reward_id text, transition_revision bigint, claim_generation integer, event_type text, attempt_number integer, outcome_class text, outcome_code text, from_status text, to_status text",
  );
  assert.equal(transitionKeyHelper.public_execute, false);
  assert.deepEqual(transitionKeyHelper.configuration, [
    "search_path=pg_catalog",
  ]);
  assert.equal(transitionKeyHelper.volatility, "i");
  assert.equal(transitionKeyHelper.parallel_safety, "s");
  assert.equal(transitionKeyHelper.security_definer, false);

  const eventBoundary = functionMap.get(
    "guest_game_delivery_record_event_v1",
  );
  assert(eventBoundary);
  assert.equal(eventBoundary.identity_arguments, "event_payload json");
  assert.equal(eventBoundary.public_execute, false);
  assert.deepEqual(eventBoundary.configuration, [
    "search_path=pg_catalog",
  ]);
  assert.equal(eventBoundary.volatility, "v");
  assert.equal(eventBoundary.security_definer, true);
  assert.equal(eventBoundary.owned_by_event_table_owner, true);

  const rewardDeliveryLockBoundary = functionMap.get(
    "guest_game_reward_delivery_lock_v1",
  );
  assert(rewardDeliveryLockBoundary);
  assert.equal(
    rewardDeliveryLockBoundary.identity_arguments,
    "tenant_id text, reward_id text",
  );
  assert.equal(rewardDeliveryLockBoundary.public_execute, false);
  assert.deepEqual(rewardDeliveryLockBoundary.configuration, [
    "search_path=pg_catalog",
  ]);
  assert.equal(rewardDeliveryLockBoundary.volatility, "v");
  assert.equal(rewardDeliveryLockBoundary.security_definer, false);

  for (const name of REQUIRED_FUNCTIONS.filter(
    (candidate) =>
      candidate !== "guest_game_delivery_transition_key_v1" &&
      candidate !== "guest_game_delivery_record_event_v1" &&
      candidate !== "guest_game_reward_delivery_lock_v1",
  )) {
    const fn = functionMap.get(name);
    assert(fn, `${name} is missing.`);
    assert.equal(fn.public_execute, false);
    assert.deepEqual(fn.configuration, ["search_path=pg_catalog, public"]);
    assert.equal(fn.volatility, "v");
    assert.equal(fn.security_definer, false);
  }
}

async function assertSuccessfulBackfillAndQuarantine(client, fixtures) {
  const deliveryRows = await client.$queryRawUnsafe(
    `SELECT
       "id", "storeId", "status", "integrityState",
       "integrityReasonCode", "stateReasonCode",
       "attempts", "attemptBudget", "claimGeneration",
       "transitionRevision"::text AS "transitionRevision"
     FROM "GuestGameDelivery"
     WHERE "tenantId" = $1
     ORDER BY "id"`,
    fixtures.tenantA,
  );
  const byId = new Map(deliveryRows.map((row) => [row.id, row]));
  const backfill = byId.get(fixtures.deliveries.backfill);
  assert.deepEqual(
    {
      storeId: backfill.storeId,
      status: backfill.status,
      integrityState: backfill.integrityState,
      attempts: backfill.attempts,
      attemptBudget: backfill.attemptBudget,
      claimGeneration: backfill.claimGeneration,
      transitionRevision: backfill.transitionRevision,
    },
    {
      storeId: fixtures.storeA1,
      status: "READY",
      integrityState: "VERIFIED",
      attempts: 0,
      attemptBudget: 5,
      claimGeneration: 0,
      transitionRevision: "0",
    },
  );
  assert.equal(byId.get(fixtures.deliveries.match).integrityState, "VERIFIED");
  assert.equal(byId.get(fixtures.deliveries.manual).integrityState, "VERIFIED");
  assert.equal(byId.get(fixtures.deliveries.blocked).integrityState, "VERIFIED");
  assert.equal(byId.get(fixtures.deliveries.match).integrityReasonCode, null);
  assert.equal(byId.get(fixtures.deliveries.manual).integrityReasonCode, null);
  assert.equal(byId.get(fixtures.deliveries.blocked).integrityReasonCode, null);
  assert.equal(byId.get(fixtures.deliveries.match).transitionRevision, "0");
  assert.equal(byId.get(fixtures.deliveries.manual).transitionRevision, "0");
  assert.equal(byId.get(fixtures.deliveries.blocked).transitionRevision, "0");
  assert.equal(
    byId.get(fixtures.deliveries.blocked).stateReasonCode,
    "LEGACY_READINESS_BLOCKED",
  );

  const quarantineExpectations = [
    ["mismatch", "BLOCKED", "LEGACY_PROVIDER_STORE_MISMATCH"],
    ["noStore", "BLOCKED", "LEGACY_PROVIDER_STORE_MISMATCH"],
    ["sent", "SENT", "LEGACY_PRE_166_PROVIDER_TERMINAL"],
    ["failed", "FAILED", "LEGACY_PRE_166_PROVIDER_TERMINAL"],
    ["canceled", "CANCELED", "LEGACY_PRE_166_PROVIDER_TERMINAL"],
    ["recipient", "BLOCKED", "LEGACY_PROVIDER_PROFILE_MISMATCH"],
  ];
  for (const [name, status, reason] of quarantineExpectations) {
    const row = byId.get(fixtures.deliveries[name]);
    assert.equal(row.status, status);
    assert.equal(row.integrityState, "LEGACY_QUARANTINED");
    assert.equal(row.integrityReasonCode, reason);
    assert.equal(row.stateReasonCode, "INTEGRITY_QUARANTINED");
    assert.equal(row.transitionRevision, "0");
  }

  const evidenceRows = await client.$queryRawUnsafe(
    `SELECT
       "eventType",
       "transitionRevision"::text AS "transitionRevision",
       COUNT(*)::int AS count
     FROM "GuestGameDeliveryEvent"
     WHERE "eventType" IN (
       'DELIVERY_STORE_BACKFILLED',
       'DELIVERY_INTEGRITY_QUARANTINED'
     )
     GROUP BY "eventType", "transitionRevision"
     ORDER BY "eventType", "transitionRevision"`,
  );
  assert.deepEqual(evidenceRows, [
    {
      eventType: "DELIVERY_INTEGRITY_QUARANTINED",
      transitionRevision: "0",
      count: 6,
    },
    {
      eventType: "DELIVERY_STORE_BACKFILLED",
      transitionRevision: "0",
      count: 1,
    },
  ]);
  const [canonicalQuarantine] = await client.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS count
     FROM "GuestGameDeliveryEvent" AS event
     WHERE event."eventType" = 'DELIVERY_INTEGRITY_QUARANTINED'
       AND event."transitionKey" =
         public."guest_game_delivery_transition_key_v1"(
           event."tenantId",
           event."deliveryId",
           event."rewardId",
           event."transitionRevision",
           event."claimGeneration",
           event."eventType",
           event."attemptNumber",
           event."providerOutcomeClass",
           event."providerOutcomeCode",
           event."fromStatus",
           event."toStatus"
         )`,
  );
  assert.equal(canonicalQuarantine.count, 6);
  const [integritySnapshots] = await client.$queryRawUnsafe(
    `SELECT
       COUNT(*) FILTER (
         WHERE event."eventType" = 'DELIVERY_INTEGRITY_QUARANTINED'
           AND event."integrityState" = delivery."integrityState"
           AND event."integrityReasonCode" = delivery."integrityReasonCode"
       )::int AS quarantine_snapshot_count,
       COUNT(*) FILTER (
         WHERE event."eventType" = 'DELIVERY_STORE_BACKFILLED'
           AND event."integrityState" IS NULL
           AND event."integrityReasonCode" IS NULL
       )::int AS legacy_store_snapshot_count
     FROM "GuestGameDeliveryEvent" AS event
     JOIN "GuestGameDelivery" AS delivery
       ON delivery."tenantId" = event."tenantId"
      AND delivery."id" = event."deliveryId"
     WHERE event."eventType" IN (
       'DELIVERY_STORE_BACKFILLED',
       'DELIVERY_INTEGRITY_QUARANTINED'
     )`,
  );
  assert.deepEqual(integritySnapshots, {
    quarantine_snapshot_count: 6,
    legacy_store_snapshot_count: 1,
  });
  const [legacyEvent] = await client.$queryRawUnsafe(
    `SELECT
       "eventType", "transitionKey",
       "transitionRevision"::text AS "transitionRevision",
       "deliveryId", "rewardId", "integrityState", "integrityReasonCode"
     FROM "GuestGameDeliveryEvent"
     WHERE "id" = $1`,
    fixtures.legacyEvent,
  );
  assert.deepEqual(legacyEvent, {
    eventType: "DELIVERY_SENT_BY_PROVIDER",
    transitionKey: null,
    transitionRevision: null,
    deliveryId: fixtures.deliveries.sent,
    rewardId: fixtures.rewards.sent,
    integrityState: null,
    integrityReasonCode: null,
  });

  const stores = await client.$queryRawUnsafe(
    `SELECT "id", "backgroundExecutionEnabled", "executionRevision"
     FROM "Store" ORDER BY "id"`,
  );
  const storeMap = new Map(stores.map((row) => [row.id, row]));
  assert.deepEqual(
    {
      enabled: storeMap.get(fixtures.storeA1).backgroundExecutionEnabled,
      revision: storeMap.get(fixtures.storeA1).executionRevision,
    },
    { enabled: false, revision: 2 },
  );
  assert.deepEqual(
    {
      enabled: storeMap.get(fixtures.storeA2).backgroundExecutionEnabled,
      revision: storeMap.get(fixtures.storeA2).executionRevision,
    },
    { enabled: false, revision: 2 },
  );
  assert.deepEqual(
    {
      enabled: storeMap.get(fixtures.storeB1).backgroundExecutionEnabled,
      revision: storeMap.get(fixtures.storeB1).executionRevision,
    },
    { enabled: false, revision: 0 },
  );
}

function extractSqlStates(error) {
  const states = new Set();
  const visited = new Set();
  const pending = [error];

  while (pending.length > 0 && visited.size < 64) {
    const candidate = pending.shift();
    if (typeof candidate === "string") {
      for (const match of candidate.matchAll(/\b([0-9A-Z]{5})\b/gu)) {
        states.add(match[1]);
      }
      continue;
    }
    if (
      candidate === null ||
      (typeof candidate !== "object" && typeof candidate !== "function") ||
      visited.has(candidate)
    ) {
      continue;
    }
    visited.add(candidate);

    for (const property of Reflect.ownKeys(candidate)) {
      try {
        pending.push(candidate[property]);
      } catch {
        // Some driver error accessors may throw. Other enumerable/nested
        // fields still carry the PostgreSQL originalCode and message.
      }
    }
  }

  return states;
}

function extractErrorText(error) {
  const messages = new Set();
  const visited = new Set();
  const pending = [error];

  while (pending.length > 0 && visited.size < 64) {
    const candidate = pending.shift();
    if (typeof candidate === "string") {
      messages.add(candidate);
      continue;
    }
    if (
      candidate === null ||
      (typeof candidate !== "object" && typeof candidate !== "function") ||
      visited.has(candidate)
    ) {
      continue;
    }
    visited.add(candidate);

    for (const property of Reflect.ownKeys(candidate)) {
      try {
        pending.push(candidate[property]);
      } catch {
        // Continue collecting the remaining driver error fields.
      }
    }
  }

  return [...messages].join("\n");
}

function assertSqlStateOrPrismaSeverity(error, expected) {
  const states = extractSqlStates(error);
  if (states.has(expected)) {
    return;
  }

  // Prisma 6.19 query-engine errors may replace PostgreSQL originalCode with
  // the server severity string ERROR. Static migration tests pin every
  // ERRCODE; the populated smoke additionally requires the exact database
  // message and transactional rollback at each call site.
  assert(
    states.has("ERROR"),
    `Expected SQLSTATE ${expected}; observed ${JSON.stringify([...states])}.`,
  );
}

async function expectSqlState(expected, operation, expectedMessage) {
  let caught;
  try {
    await operation();
  } catch (error) {
    caught = error;
  }
  assert(caught, `Expected SQLSTATE ${expected}.`);
  assertSqlStateOrPrismaSeverity(caught, expected);
  assert(
    expectedMessage instanceof RegExp,
    `Expected a diagnostic pattern for SQLSTATE ${expected}.`,
  );
  assert.match(extractErrorText(caught), expectedMessage);
}

async function expectCheckConstraint(constraintName, operation) {
  let caught;
  try {
    await operation();
  } catch (error) {
    caught = error;
  }
  assert(caught, `Expected CHECK ${constraintName} to reject the fixture.`);
  assertSqlStateOrPrismaSeverity(caught, "23514");
  const details = [
    caught?.message,
    caught?.meta?.message,
    caught?.cause?.message,
  ]
    .filter((value) => typeof value === "string")
    .join("\n");
  assert.match(
    details || String(caught),
    new RegExp(constraintName, "u"),
  );
}

async function grantRestrictedRuntimeRole(client, roleName) {
  assertSafeGeneratedRuntimeRoleName(roleName);
  const quotedRole = quoteIdentifier(roleName);
  await client.$executeRawUnsafe(
    `GRANT USAGE ON SCHEMA public TO ${quotedRole}`,
  );
  await client.$executeRawUnsafe(
    `GRANT SELECT ON TABLE
       "Tenant",
       "Store",
       "Guest",
       "GuestGameProfile",
       "GuestGameReward",
       "GuestGameDelivery",
       "GuestGameDeliveryAttempt",
       "GuestGameDeliveryEvent"
     TO ${quotedRole}`,
  );
  await client.$executeRawUnsafe(
    `GRANT UPDATE (
       "status",
       "readinessStatus",
       "stateReasonCode",
       "transitionRevision"
     ) ON TABLE "GuestGameDelivery" TO ${quotedRole}`,
  );
  // PostgreSQL requires UPDATE privilege on at least one column of every
  // relation referenced by a row-locking clause. The deferred binding
  // triggers lock the canonical reward with FOR UPDATE, so give the
  // generated smoke-only role the least sensitive mutable column instead of
  // broad reward UPDATE.
  await client.$executeRawUnsafe(
    `GRANT UPDATE ("updatedAt")
     ON TABLE "GuestGameReward" TO ${quotedRole}`,
  );
  await client.$executeRawUnsafe(
    `GRANT EXECUTE
     ON FUNCTION public."guest_game_delivery_transition_key_v1"(
       TEXT,
       TEXT,
       TEXT,
       BIGINT,
       INTEGER,
       TEXT,
       INTEGER,
       TEXT,
       TEXT,
       TEXT,
       TEXT
     )
     TO ${quotedRole}`,
  );
  await client.$executeRawUnsafe(
    `GRANT EXECUTE
     ON FUNCTION public."guest_game_delivery_record_event_v1"(JSON)
     TO ${quotedRole}`,
  );
  await client.$executeRawUnsafe(
    `GRANT EXECUTE
     ON FUNCTION public."guest_game_reward_delivery_lock_v1"(TEXT, TEXT)
     TO ${quotedRole}`,
  );
}

async function assertRestrictedRuntimeRolePrivileges(client, roleName) {
  const [role] = await client.$queryRawUnsafe(
    `SELECT
       role.rolsuper AS superuser,
       role.rolinherit AS inherits,
       role.rolcreaterole AS creates_roles,
       role.rolcreatedb AS creates_databases,
       role.rolcanlogin AS can_login,
       role.rolreplication AS replication,
       role.rolbypassrls AS bypasses_rls,
       pg_catalog.has_schema_privilege($1, 'public', 'USAGE')
         AS schema_usage,
       pg_catalog.has_function_privilege(
         $1,
         'public."guest_game_delivery_transition_key_v1"(text,text,text,bigint,integer,text,integer,text,text,text,text)',
         'EXECUTE'
       ) AS helper_execute,
       pg_catalog.has_function_privilege(
         $1,
         'public."guest_game_delivery_record_event_v1"(json)',
         'EXECUTE'
       ) AS event_boundary_execute,
       pg_catalog.has_function_privilege(
         $1,
         'public."guest_game_reward_delivery_lock_v1"(text,text)',
         'EXECUTE'
       ) AS reward_delivery_lock_execute,
       pg_catalog.has_table_privilege(
         $1,
         'public."GuestGameDelivery"',
         'UPDATE'
       ) AS broad_delivery_update,
       pg_catalog.has_table_privilege(
         $1,
         'public."GuestGameReward"',
         'UPDATE'
       ) AS broad_reward_update,
       pg_catalog.has_column_privilege(
         $1,
         'public."GuestGameReward"',
         'updatedAt',
         'UPDATE'
       ) AS reward_lock_update,
       pg_catalog.has_column_privilege(
         $1,
         'public."GuestGameReward"',
         'storeId',
         'UPDATE'
       ) AS reward_store_update,
       pg_catalog.has_column_privilege(
         $1,
         'public."GuestGameReward"',
         'profileId',
         'UPDATE'
       ) AS reward_profile_update,
       pg_catalog.has_column_privilege(
         $1,
         'public."GuestGameReward"',
         'guestId',
         'UPDATE'
       ) AS reward_guest_update,
       pg_catalog.has_column_privilege(
         $1,
         'public."GuestGameReward"',
         'status',
         'UPDATE'
       ) AS reward_status_update,
       pg_catalog.has_column_privilege(
         $1,
         'public."GuestGameDelivery"',
         'status',
         'UPDATE'
       ) AS status_update,
       pg_catalog.has_column_privilege(
         $1,
         'public."GuestGameDelivery"',
         'readinessStatus',
         'UPDATE'
       ) AS readiness_status_update,
       pg_catalog.has_column_privilege(
         $1,
         'public."GuestGameDelivery"',
         'transitionRevision',
         'UPDATE'
       ) AS revision_update,
       pg_catalog.has_column_privilege(
         $1,
         'public."GuestGameDelivery"',
         'stateReasonCode',
         'UPDATE'
       ) AS state_reason_update,
       pg_catalog.has_column_privilege(
         $1,
         'public."GuestGameDelivery"',
         'integrityState',
         'UPDATE'
       ) AS integrity_state_update,
       pg_catalog.has_column_privilege(
         $1,
         'public."GuestGameDelivery"',
         'integrityReasonCode',
         'UPDATE'
       ) AS integrity_reason_update,
       pg_catalog.has_table_privilege(
         $1,
         'public."GuestGameDeliveryEvent"',
         'INSERT'
       ) AS broad_event_insert,
       pg_catalog.has_any_column_privilege(
         $1,
         'public."GuestGameDeliveryEvent"',
         'INSERT'
       ) AS any_event_insert,
       pg_catalog.has_column_privilege(
         $1,
         'public."GuestGameDeliveryEvent"',
         'transitionRevision',
         'INSERT'
       ) AS event_revision_insert,
       pg_catalog.has_column_privilege(
         $1,
         'public."GuestGameDeliveryEvent"',
         'integrityState',
         'INSERT'
       ) AS event_integrity_state_insert,
       pg_catalog.has_column_privilege(
         $1,
         'public."GuestGameDeliveryEvent"',
         'integrityReasonCode',
         'INSERT'
       ) AS event_integrity_reason_insert,
       pg_catalog.has_table_privilege(
         $1,
         'public."GuestGameDeliveryEvent"',
         'UPDATE'
       ) AS event_update,
       pg_catalog.has_table_privilege(
         $1,
         'public."GuestGameDeliveryEvent"',
         'DELETE'
       ) AS event_delete
     FROM pg_catalog.pg_roles AS role
     WHERE role.rolname = $1`,
    roleName,
  );
  assert.deepEqual(role, {
    superuser: false,
    inherits: false,
    creates_roles: false,
    creates_databases: false,
    can_login: false,
    replication: false,
    bypasses_rls: false,
    schema_usage: true,
    helper_execute: true,
    event_boundary_execute: true,
    reward_delivery_lock_execute: true,
    broad_delivery_update: false,
    broad_reward_update: false,
    reward_lock_update: true,
    reward_store_update: false,
    reward_profile_update: false,
    reward_guest_update: false,
    reward_status_update: false,
    status_update: true,
    readiness_status_update: true,
    revision_update: true,
    state_reason_update: true,
    integrity_state_update: false,
    integrity_reason_update: false,
    broad_event_insert: false,
    any_event_insert: false,
    event_revision_insert: false,
    event_integrity_state_insert: false,
    event_integrity_reason_insert: false,
    event_update: false,
    event_delete: false,
  });
}

function deferredSignal() {
  let resolveSignal;
  const promise = new Promise((resolvePromise) => {
    resolveSignal = resolvePromise;
  });
  return { promise, resolve: resolveSignal };
}

async function acquireRewardDeliveryBoundary(
  client,
  tenantId,
  rewardId,
) {
  const [row] = await client.$queryRawUnsafe(
    `SELECT public."guest_game_reward_delivery_lock_v1"(
       $1::TEXT,
       $2::TEXT
     ) AS "claimRequired"`,
    tenantId,
    rewardId,
  );
  assert.equal(typeof row?.claimRequired, "boolean");
  return row.claimRequired;
}

async function readRewardDeliveryBoundarySnapshot(
  client,
  tenantId,
  rewardId,
) {
  const [row] = await client.$queryRawUnsafe(
    `SELECT pg_catalog.jsonb_build_object(
       'reward',
       (
         SELECT pg_catalog.to_jsonb(reward)
         FROM public."GuestGameReward" AS reward
         WHERE reward."tenantId" = $1
           AND reward."id" = $2
       ),
       'deliveries',
       COALESCE(
         (
           SELECT pg_catalog.jsonb_agg(
             pg_catalog.to_jsonb(delivery)
             ORDER BY delivery."id"
           )
           FROM public."GuestGameDelivery" AS delivery
           WHERE delivery."tenantId" = $1
             AND delivery."rewardId" = $2
         ),
         '[]'::JSONB
       ),
       'attempts',
       COALESCE(
         (
           SELECT pg_catalog.jsonb_agg(
             pg_catalog.to_jsonb(attempt)
             ORDER BY attempt."id"
           )
           FROM public."GuestGameDeliveryAttempt" AS attempt
           WHERE attempt."tenantId" = $1
             AND attempt."rewardId" = $2
         ),
         '[]'::JSONB
       ),
       'events',
       COALESCE(
         (
           SELECT pg_catalog.jsonb_agg(
             pg_catalog.to_jsonb(event)
             ORDER BY event."id"
           )
           FROM public."GuestGameDeliveryEvent" AS event
           WHERE event."tenantId" = $1
             AND event."rewardId" = $2
         ),
         '[]'::JSONB
       )
     ) AS snapshot`,
    tenantId,
    rewardId,
  );
  assert(row?.snapshot?.reward);
  return row.snapshot;
}

async function waitForAdvisoryWait(observer, waiterPid, holderPid) {
  const deadline = Date.now() + 4_000;
  while (Date.now() < deadline) {
    const [row] = await observer.$queryRawUnsafe(
      `SELECT
         activity.wait_event_type,
         activity.wait_event,
         pg_catalog.pg_blocking_pids(activity.pid) AS blocking_pids,
         EXISTS (
           SELECT 1
           FROM pg_catalog.pg_locks AS waiting_lock
           WHERE waiting_lock.pid = activity.pid
             AND waiting_lock.locktype = 'advisory'
             AND NOT waiting_lock.granted
         ) AS waiting_on_advisory
       FROM pg_catalog.pg_stat_activity AS activity
       WHERE activity.pid = $1::INTEGER`,
      waiterPid,
    );
    if (
      row?.wait_event_type === "Lock" &&
      row?.wait_event === "advisory" &&
      row?.waiting_on_advisory === true &&
      row.blocking_pids.includes(holderPid)
    ) {
      return row;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
  }
  assert.fail(
    `Backend ${waiterPid} did not wait on holder ${holderPid}'s advisory lock.`,
  );
}

function assertNoRawLockOrderFailure(error) {
  const states = extractSqlStates(error);
  assert.equal(states.has("40P01"), false, "Unexpected raw deadlock SQLSTATE.");
  assert.equal(states.has("55P03"), false, "Unexpected raw lock-timeout SQLSTATE.");
  assert.doesNotMatch(
    extractErrorText(error),
    /(?:40P01|55P03|deadlock detected|lock timeout)/iu,
  );
}

async function assertRewardDeliveryLockBoundaryScope(
  client,
  fixtures,
  roleName,
) {
  const quotedRole = quoteIdentifier(roleName);
  for (const [tenantId, rewardId] of [
    [fixtures.tenantA, `missing-${randomUUID()}`],
    [fixtures.tenantB, fixtures.rewards.match],
  ]) {
    await expectSqlState(
      "23503",
      () =>
        client.$transaction(async (transaction) => {
          await transaction.$executeRawUnsafe(`SET LOCAL ROLE ${quotedRole}`);
          await acquireRewardDeliveryBoundary(
            transaction,
            tenantId,
            rewardId,
          );
        }),
      /(?:reward does not exist in requested tenant|Foreign key constraint (?:failed|violated))/iu,
    );
  }
}

async function assertRewardDeliveryLockBoundaryConcurrency(
  databaseUrl,
  fixtures,
) {
  const observer = prismaClient(databaseUrl);
  const holder = prismaClient(databaseUrl);
  const waiter = prismaClient(databaseUrl);
  const tenantId = fixtures.tenantA;
  const rewardId = fixtures.rewards.match;
  const deliveryId = fixtures.deliveries.match;
  const holderReady = deferredSignal();
  const releaseHolder = deferredSignal();
  const waiterPidReady = deferredSignal();
  let holderPid;
  let waiterPid;
  let waiterAcquired = false;
  let observationError;

  try {
    const before = await readRewardDeliveryBoundarySnapshot(
      observer,
      tenantId,
      rewardId,
    );

    const holderRun = holder.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe(`SET LOCAL lock_timeout = '5s'`);
      const [identity] = await transaction.$queryRawUnsafe(
        `SELECT pg_catalog.pg_backend_pid() AS pid`,
      );
      holderPid = identity.pid;
      const claimRequired = await acquireRewardDeliveryBoundary(
        transaction,
        tenantId,
        rewardId,
      );
      const updatedDeliveries = await transaction.$executeRawUnsafe(
        `UPDATE public."GuestGameDelivery"
         SET "status" = "status"
         WHERE "tenantId" = $1
           AND "rewardId" = $2
           AND "id" = $3`,
        tenantId,
        rewardId,
        deliveryId,
      );
      assert.equal(updatedDeliveries, 1);
      holderReady.resolve();
      await releaseHolder.promise;
      return { claimRequired, updatedDeliveries };
    });

    const holderSignal = await Promise.race([
      holderReady.promise.then(() => "LOCK_HELD"),
      holderRun.then(() => "TRANSACTION_COMPLETED"),
    ]);
    assert.equal(holderSignal, "LOCK_HELD");

    const waiterRun = waiter.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe(`SET LOCAL lock_timeout = '5s'`);
      const [identity] = await transaction.$queryRawUnsafe(
        `SELECT pg_catalog.pg_backend_pid() AS pid`,
      );
      waiterPid = identity.pid;
      waiterPidReady.resolve();
      const claimRequired = await acquireRewardDeliveryBoundary(
        transaction,
        tenantId,
        rewardId,
      );
      const updatedRewards = await transaction.$executeRawUnsafe(
        `UPDATE public."GuestGameReward"
         SET "storeId" = "storeId"
         WHERE "tenantId" = $1
           AND "id" = $2`,
        tenantId,
        rewardId,
      );
      assert.equal(updatedRewards, 1);
      waiterAcquired = true;
      return { claimRequired, updatedRewards };
    });

    const waiterSignal = await Promise.race([
      waiterPidReady.promise.then(() => "PID_READY"),
      waiterRun.then(() => "TRANSACTION_COMPLETED"),
    ]);
    assert.equal(waiterSignal, "PID_READY");

    try {
      await waitForAdvisoryWait(observer, waiterPid, holderPid);
      assert.equal(waiterAcquired, false);
    } catch (error) {
      observationError = error;
    } finally {
      releaseHolder.resolve();
    }

    const outcomes = await Promise.allSettled([holderRun, waiterRun]);
    for (const outcome of outcomes) {
      if (outcome.status === "rejected") {
        assertNoRawLockOrderFailure(outcome.reason);
        throw outcome.reason;
      }
      assert.equal(outcome.value.claimRequired, before.reward.claimRequired);
    }
    assert.equal(outcomes[0].value.updatedDeliveries, 1);
    assert.equal(outcomes[1].value.updatedRewards, 1);
    if (observationError) {
      throw observationError;
    }

    const after = await readRewardDeliveryBoundarySnapshot(
      observer,
      tenantId,
      rewardId,
    );
    assert.deepEqual(after, before);
  } finally {
    releaseHolder.resolve();
    await Promise.allSettled([
      observer.$disconnect(),
      holder.$disconnect(),
      waiter.$disconnect(),
    ]);
  }
}

async function canonicalTransitionKey(
  client,
  {
    tenantId,
    deliveryId,
    rewardId,
    transitionRevision,
    claimGeneration,
    eventType,
    attemptNumber,
    outcomeClass = null,
    outcomeCode = null,
    fromStatus,
    toStatus,
  },
) {
  const [row] = await client.$queryRawUnsafe(
    `SELECT public."guest_game_delivery_transition_key_v1"(
       $1::TEXT,
       $2::TEXT,
       $3::TEXT,
       $4::BIGINT,
       $5::INTEGER,
       $6::TEXT,
       $7::INTEGER,
       $8::TEXT,
       $9::TEXT,
       $10::TEXT,
       $11::TEXT
     ) AS key`,
    tenantId,
    deliveryId,
    rewardId,
    transitionRevision,
    claimGeneration,
    eventType,
    attemptNumber,
    outcomeClass,
    outcomeCode,
    fromStatus,
    toStatus,
  );
  assert.match(row?.key ?? "", /^v1:[0-9a-f]{64}$/u);
  return row.key;
}

async function recordDurableTransitionEvent(client, payload) {
  const encodedPayload =
    typeof payload === "string" ? payload : JSON.stringify(payload);
  const [row] = await client.$queryRawUnsafe(
    `SELECT public."guest_game_delivery_record_event_v1"(
       $1::JSON
     ) AS result`,
    encodedPayload,
  );
  return row?.result;
}

async function insertCanonicalTransitionEvent(
  client,
  {
    tenantId,
    deliveryId,
    rewardId,
    storeId,
    channel,
    transitionRevision,
    eventType,
    fromStatus,
    toStatus,
    integrityState,
    integrityReasonCode,
    stateReasonCode,
  },
) {
  const payload = {
    tenantId,
    deliveryId,
    rewardId,
    storeId,
    eventType,
    transitionRevision,
    fromStatus,
    toStatus,
    channel,
    claimGeneration: 0,
    attemptNumber: 0,
    integrityState,
    integrityReasonCode,
    stateReasonCode,
    provenanceDigest: "d".repeat(64),
    note: "Restricted runtime role revision-fence rehearsal.",
  };
  const result = await recordDurableTransitionEvent(client, payload);
  assert.match(result?.eventId ?? "", /^[0-9a-f-]{36}$/u);
  assert.match(result?.transitionKey ?? "", /^v1:[0-9a-f]{64}$/u);
  return {
    eventId: result.eventId,
    transitionKey: result.transitionKey,
  };
}

async function applyRevisionFencedTransition(
  client,
  {
    tenantId,
    deliveryId,
    rewardId,
    storeId,
    channel,
    oldRevision,
    transitionRevision,
    eventType,
    fromStatus,
    toStatus,
    deliveryReasonCode,
    eventReasonCode,
    deliveryReadinessStatus = null,
  },
) {
  const changed = await client.$executeRawUnsafe(
    `UPDATE "GuestGameDelivery"
     SET
       "status" = $1,
       "stateReasonCode" = $2,
       "readinessStatus" = COALESCE($3, "readinessStatus"),
       "transitionRevision" = $4::BIGINT
     WHERE "tenantId" = $5
       AND "id" = $6
       AND "status" = $7
       AND "transitionRevision" = $8::BIGINT`,
    toStatus,
    deliveryReasonCode,
    deliveryReadinessStatus,
    transitionRevision,
    tenantId,
    deliveryId,
    fromStatus,
    oldRevision,
  );
  assert.equal(changed, 1);
  return insertCanonicalTransitionEvent(client, {
    tenantId,
    deliveryId,
    rewardId,
    storeId,
    channel,
    transitionRevision,
    eventType,
    fromStatus,
    toStatus,
    integrityState: "VERIFIED",
    integrityReasonCode: null,
    stateReasonCode: eventReasonCode,
  });
}

async function readRevisionFenceState(client, deliveryId) {
  const [delivery] = await client.$queryRawUnsafe(
    `SELECT
       "status",
       "integrityState",
       "integrityReasonCode",
       "stateReasonCode",
       "transitionRevision"::text AS "transitionRevision"
     FROM "GuestGameDelivery"
     WHERE "id" = $1`,
    deliveryId,
  );
  const events = await client.$queryRawUnsafe(
    `SELECT
       "id",
       "eventType",
       "transitionKey",
       "transitionRevision"::text AS "transitionRevision",
       "fromStatus",
       "toStatus",
       "integrityState",
       "integrityReasonCode",
       "stateReasonCode"
     FROM "GuestGameDeliveryEvent"
     WHERE "deliveryId" = $1
       AND "eventType" IN ('DELIVERY_FINALIZED', 'DELIVERY_RETRIED')
     ORDER BY "transitionRevision", "id"`,
    deliveryId,
  );
  return { delivery, events };
}

async function assertRevisionFencedTransitions(client, fixtures, roleName) {
  await grantRestrictedRuntimeRole(client, roleName);
  await assertRestrictedRuntimeRolePrivileges(client, roleName);
  const quotedRole = quoteIdentifier(roleName);
  const delivery = {
    tenantId: fixtures.tenantA,
    deliveryId: fixtures.deliveries.match,
    rewardId: fixtures.rewards.match,
    storeId: fixtures.storeA1,
    channel: "MAX",
  };
  const committedEvidence = [];

  await expectSqlState(
    "42501",
    () =>
      client.$transaction(async (transaction) => {
        await transaction.$executeRawUnsafe(`SET LOCAL ROLE ${quotedRole}`);
        await transaction.$executeRawUnsafe(
          `INSERT INTO "GuestGameDeliveryEvent" (
             "id", "tenantId", "deliveryId", "rewardId", "eventType"
           ) VALUES (
             $1, $2, $3, $4, 'DELIVERY_FINALIZED'
           )`,
          randomUUID(),
          delivery.tenantId,
          delivery.deliveryId,
          delivery.rewardId,
        );
      }),
    /permission denied for table GuestGameDeliveryEvent/u,
  );

  await client.$transaction(async (transaction) => {
    await transaction.$executeRawUnsafe(`SET LOCAL ROLE ${quotedRole}`);
    const [identity] = await transaction.$queryRawUnsafe(
      `SELECT current_user AS current_user, session_user AS session_user`,
    );
    assert.equal(identity.current_user, roleName);
    assert.notEqual(identity.session_user, roleName);

    committedEvidence.push(
      await applyRevisionFencedTransition(transaction, {
        ...delivery,
        oldRevision: 0,
        transitionRevision: 1,
        eventType: "DELIVERY_FINALIZED",
        fromStatus: "READY",
        toStatus: "BLOCKED",
        deliveryReasonCode: "TEST_REVISION_BLOCKED_ONE",
        eventReasonCode: "TEST_REVISION_BLOCKED_ONE",
      }),
    );
    committedEvidence.push(
      await applyRevisionFencedTransition(transaction, {
        ...delivery,
        oldRevision: 1,
        transitionRevision: 2,
        eventType: "DELIVERY_RETRIED",
        fromStatus: "BLOCKED",
        toStatus: "READY",
        deliveryReasonCode: null,
        eventReasonCode: "TEST_REVISION_RETRY",
      }),
    );
    committedEvidence.push(
      await applyRevisionFencedTransition(transaction, {
        ...delivery,
        oldRevision: 2,
        transitionRevision: 3,
        eventType: "DELIVERY_FINALIZED",
        fromStatus: "READY",
        toStatus: "BLOCKED",
        deliveryReasonCode: "TEST_REVISION_BLOCKED_TWO",
        eventReasonCode: "TEST_REVISION_BLOCKED_TWO",
      }),
    );
  });

  const committedState = await readRevisionFenceState(
    client,
    delivery.deliveryId,
  );
  assert.deepEqual(committedState.delivery, {
    status: "BLOCKED",
    integrityState: "VERIFIED",
    integrityReasonCode: null,
    stateReasonCode: "TEST_REVISION_BLOCKED_TWO",
    transitionRevision: "3",
  });
  assert.deepEqual(
    committedState.events.map((event) => ({
      eventType: event.eventType,
      transitionKey: event.transitionKey,
      transitionRevision: event.transitionRevision,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      integrityState: event.integrityState,
      integrityReasonCode: event.integrityReasonCode,
      stateReasonCode: event.stateReasonCode,
    })),
    [
      {
        eventType: "DELIVERY_FINALIZED",
        transitionKey: committedEvidence[0].transitionKey,
        transitionRevision: "1",
        fromStatus: "READY",
        toStatus: "BLOCKED",
        integrityState: "VERIFIED",
        integrityReasonCode: null,
        stateReasonCode: "TEST_REVISION_BLOCKED_ONE",
      },
      {
        eventType: "DELIVERY_RETRIED",
        transitionKey: committedEvidence[1].transitionKey,
        transitionRevision: "2",
        fromStatus: "BLOCKED",
        toStatus: "READY",
        integrityState: "VERIFIED",
        integrityReasonCode: null,
        stateReasonCode: "TEST_REVISION_RETRY",
      },
      {
        eventType: "DELIVERY_FINALIZED",
        transitionKey: committedEvidence[2].transitionKey,
        transitionRevision: "3",
        fromStatus: "READY",
        toStatus: "BLOCKED",
        integrityState: "VERIFIED",
        integrityReasonCode: null,
        stateReasonCode: "TEST_REVISION_BLOCKED_TWO",
      },
    ],
  );
  assert.equal(
    new Set(committedEvidence.map(({ transitionKey }) => transitionKey)).size,
    3,
  );

  await expectSqlState(
    "23514",
    () =>
      client.$transaction(async (transaction) => {
        await transaction.$executeRawUnsafe(`SET LOCAL ROLE ${quotedRole}`);
        await insertCanonicalTransitionEvent(transaction, {
          ...delivery,
          channel: "TELEGRAM",
          transitionRevision: 3,
          eventType: "DELIVERY_FINALIZED",
          fromStatus: "READY",
          toStatus: "BLOCKED",
          integrityState: "VERIFIED",
          integrityReasonCode: null,
          stateReasonCode: "TEST_REVISION_BLOCKED_TWO",
        });
      }),
    /does not match the current delivery scope/u,
  );

  // A sequential replay is normally rejected by the SECURITY DEFINER
  // boundary. The partial unique index is the final invariant and may reject
  // first as well; Prisma 6 preserves SQLSTATE 23505 for that path but reduces
  // the database detail to the generic "Unique constraint failed" message.
  const currentRevisionDuplicateError =
    /(?:already exists for the current delivery revision|Unique constraint failed)/u;
  for (const eventType of ["DELIVERY_FINALIZED", "DELIVERY_CANCELED"]) {
    await expectSqlState(
      "23505",
      () =>
        client.$transaction(async (transaction) => {
          await transaction.$executeRawUnsafe(`SET LOCAL ROLE ${quotedRole}`);
          await insertCanonicalTransitionEvent(transaction, {
            ...delivery,
            transitionRevision: 3,
            eventType,
            fromStatus: "READY",
            toStatus: "BLOCKED",
            integrityState: "VERIFIED",
            integrityReasonCode: null,
            stateReasonCode: "TEST_REVISION_BLOCKED_TWO",
          });
        }),
      currentRevisionDuplicateError,
    );
  }

  await expectSqlState(
    "22023",
    () =>
      client.$transaction(async (transaction) => {
        await transaction.$executeRawUnsafe(`SET LOCAL ROLE ${quotedRole}`);
        await recordDurableTransitionEvent(transaction, {
          tenantId: delivery.tenantId,
          deliveryId: delivery.deliveryId,
          rewardId: delivery.rewardId,
          eventType: "DELIVERY_FINALIZED",
          transitionRevision: 3,
          unsupportedAuthority: "must-not-be-accepted",
        });
      }),
    /payload contains unsupported key: unsupportedAuthority/u,
  );
  await expectSqlState(
    "22023",
    () =>
      client.$transaction(async (transaction) => {
        await transaction.$executeRawUnsafe(`SET LOCAL ROLE ${quotedRole}`);
        await recordDurableTransitionEvent(transaction, {
          tenantId: delivery.tenantId,
          deliveryId: delivery.deliveryId,
          rewardId: delivery.rewardId,
          eventType: "DELIVERY_FINALIZED",
          transitionRevision: 3,
          actorUserId: randomUUID(),
        });
      }),
    /payload contains unsupported key: actorUserId/u,
  );
  await expectSqlState(
    "22023",
    () =>
      client.$transaction(async (transaction) => {
        await transaction.$executeRawUnsafe(`SET LOCAL ROLE ${quotedRole}`);
        await recordDurableTransitionEvent(
          transaction,
          `{"tenantId":"${delivery.tenantId}","tenantId":"${delivery.tenantId}"}`,
        );
      }),
    /payload contains duplicate keys/u,
  );
  await expectSqlState(
    "22023",
    () =>
      client.$transaction(async (transaction) => {
        await transaction.$executeRawUnsafe(`SET LOCAL ROLE ${quotedRole}`);
        await recordDurableTransitionEvent(transaction, {
          tenantId: delivery.tenantId,
          deliveryId: delivery.deliveryId,
          rewardId: delivery.rewardId,
          eventType: "DELIVERY_FINALIZED",
          transitionRevision: 3,
        });
      }),
    /provenance digest must be 64 lowercase hex characters/u,
  );

  const finalRetryDelivery = {
    tenantId: fixtures.tenantA,
    deliveryId: fixtures.deliveries.blocked,
    rewardId: fixtures.rewards.blocked,
    storeId: fixtures.storeA1,
    channel: "MAX",
  };
  let finalRetryEvidence;
  await client.$transaction(async (transaction) => {
    await transaction.$executeRawUnsafe(`SET LOCAL ROLE ${quotedRole}`);
    finalRetryEvidence = await applyRevisionFencedTransition(transaction, {
      ...finalRetryDelivery,
      oldRevision: 0,
      transitionRevision: 1,
      eventType: "DELIVERY_RETRIED",
      fromStatus: "BLOCKED",
      toStatus: "READY",
      deliveryReasonCode: null,
      eventReasonCode: "TEST_FINAL_RETRIED_REASON",
      deliveryReadinessStatus: "READY_FOR_BOT",
    });
  });
  const finalRetryState = await readRevisionFenceState(
    client,
    finalRetryDelivery.deliveryId,
  );
  assert.deepEqual(finalRetryState.delivery, {
    status: "READY",
    integrityState: "VERIFIED",
    integrityReasonCode: null,
    stateReasonCode: null,
    transitionRevision: "1",
  });
  assert.deepEqual(
    finalRetryState.events.map((event) => ({
      eventType: event.eventType,
      transitionKey: event.transitionKey,
      transitionRevision: event.transitionRevision,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      integrityState: event.integrityState,
      integrityReasonCode: event.integrityReasonCode,
      stateReasonCode: event.stateReasonCode,
    })),
    [
      {
        eventType: "DELIVERY_RETRIED",
        transitionKey: finalRetryEvidence.transitionKey,
        transitionRevision: "1",
        fromStatus: "BLOCKED",
        toStatus: "READY",
        integrityState: "VERIFIED",
        integrityReasonCode: null,
        stateReasonCode: "TEST_FINAL_RETRIED_REASON",
      },
    ],
  );
  assert.equal(
    new Set([
      ...committedEvidence.map(({ transitionKey }) => transitionKey),
      finalRetryEvidence.transitionKey,
    ]).size,
    4,
  );

  await expectSqlState(
    "23514",
    () =>
      client.$transaction(async (transaction) => {
        await transaction.$executeRawUnsafe(`SET LOCAL ROLE ${quotedRole}`);
        const changed = await transaction.$executeRawUnsafe(
          `UPDATE "GuestGameDelivery"
           SET
             "status" = 'READY',
             "stateReasonCode" = NULL,
             "transitionRevision" = 4
           WHERE "tenantId" = $1
             AND "id" = $2
             AND "status" = 'BLOCKED'
             AND "transitionRevision" = 3`,
          delivery.tenantId,
          delivery.deliveryId,
        );
        assert.equal(changed, 1);
        // The committed revision-2 BLOCKED -> READY event is intentionally
        // present, but cannot satisfy this revision-4 transition at commit.
      }),
    /Delivery transition requires exactly one typed durable event/u,
  );

  await expectSqlState(
    "23514",
    () =>
      client.$transaction(async (transaction) => {
        await transaction.$executeRawUnsafe(`SET LOCAL ROLE ${quotedRole}`);
        await insertCanonicalTransitionEvent(transaction, {
          ...delivery,
          transitionRevision: 4,
          eventType: "DELIVERY_RETRIED",
          fromStatus: "BLOCKED",
          toStatus: "READY",
          integrityState: "VERIFIED",
          integrityReasonCode: null,
          stateReasonCode: "TEST_FUTURE_REVISION_PREINSERT",
        });
      }),
    /Runtime durable event does not match the current delivery revision/u,
  );

  const reasonOnlyError =
    /Provider delivery reason can change only with an event-bearing state transition/u;
  await expectSqlState(
    "23514",
    () =>
      client.$transaction(async (transaction) => {
        await transaction.$executeRawUnsafe(`SET LOCAL ROLE ${quotedRole}`);
        await transaction.$executeRawUnsafe(
          `UPDATE "GuestGameDelivery"
           SET "stateReasonCode" = 'TEST_REASON_ONLY_DRIFT'
           WHERE "tenantId" = $1
             AND "id" = $2`,
          delivery.tenantId,
          delivery.deliveryId,
        );
      }),
    reasonOnlyError,
  );
  await expectSqlState(
    "23514",
    () =>
      client.$transaction(async (transaction) => {
        await transaction.$executeRawUnsafe(`SET LOCAL ROLE ${quotedRole}`);
        await transaction.$executeRawUnsafe(
          `UPDATE "GuestGameDelivery"
           SET
             "stateReasonCode" = 'TEST_REASON_REVISION_DRIFT',
             "transitionRevision" = "transitionRevision" + 1
           WHERE "tenantId" = $1
             AND "id" = $2`,
          delivery.tenantId,
          delivery.deliveryId,
        );
      }),
    reasonOnlyError,
  );
  await expectSqlState(
    "23514",
    () =>
      client.$executeRawUnsafe(
        `UPDATE "GuestGameDelivery"
         SET "integrityReasonCode" = 'TEST_INTEGRITY_REASON_DRIFT'
         WHERE "tenantId" = $1
           AND "id" = $2`,
        delivery.tenantId,
        delivery.deliveryId,
      ),
    reasonOnlyError,
  );
  await expectSqlState(
    "23514",
    () =>
      client.$transaction(async (transaction) => {
        await transaction.$executeRawUnsafe(`SET LOCAL ROLE ${quotedRole}`);
        await applyRevisionFencedTransition(transaction, {
          ...delivery,
          oldRevision: 3,
          transitionRevision: 4,
          eventType: "DELIVERY_RETRIED",
          fromStatus: "BLOCKED",
          toStatus: "READY",
          deliveryReasonCode: null,
          eventReasonCode: "TEST_MISMATCH_SETUP_RETRY",
        });
        await applyRevisionFencedTransition(transaction, {
          ...delivery,
          oldRevision: 4,
          transitionRevision: 5,
          eventType: "DELIVERY_FINALIZED",
          fromStatus: "READY",
          toStatus: "BLOCKED",
          deliveryReasonCode: "TEST_EXPECTED_FINAL_REASON",
          eventReasonCode: "TEST_WRONG_FINAL_REASON",
        });
      }),
    /Durable event final state does not match its current delivery/u,
  );
  await expectSqlState(
    "23514",
    () =>
      client.$transaction(async (transaction) => {
        await transaction.$executeRawUnsafe(`SET LOCAL ROLE ${quotedRole}`);
        const changed = await transaction.$executeRawUnsafe(
          `UPDATE "GuestGameDelivery"
           SET
             "status" = 'READY',
             "stateReasonCode" = NULL,
             "transitionRevision" = 4
           WHERE "tenantId" = $1
             AND "id" = $2
             AND "status" = 'BLOCKED'
             AND "transitionRevision" = 3`,
          delivery.tenantId,
          delivery.deliveryId,
        );
        assert.equal(changed, 1);
        await insertCanonicalTransitionEvent(transaction, {
          ...delivery,
          transitionRevision: 4,
          eventType: "DELIVERY_RETRIED",
          fromStatus: "BLOCKED",
          toStatus: "READY",
          integrityState: "LEGACY_QUARANTINED",
          integrityReasonCode: "TEST_EVENT_INTEGRITY_MISMATCH",
          stateReasonCode: "TEST_EVENT_INTEGRITY_MISMATCH",
        });
      }),
    /Durable event final state does not match its current delivery/u,
  );
  await expectSqlState(
    "23514",
    () =>
      client.$transaction(async (transaction) => {
        await transaction.$executeRawUnsafe(
          `ALTER TABLE "GuestGameDelivery"
           DISABLE TRIGGER "GuestGameDelivery_transition_guard"`,
        );
        await transaction.$executeRawUnsafe(
          `UPDATE "GuestGameDelivery"
           SET "stateReasonCode" = 'TEST_FINAL_ROW_REREAD_DRIFT'
           WHERE "tenantId" = $1
             AND "id" = $2`,
          delivery.tenantId,
          delivery.deliveryId,
        );
        await transaction.$executeRawUnsafe(
          `SET CONSTRAINTS "GuestGameDelivery_transition_event_check"
           IMMEDIATE`,
        );
      }),
    /Final delivery state requires exactly one matching immutable durable event/u,
  );

  assert.deepEqual(
    await readRevisionFenceState(client, delivery.deliveryId),
    committedState,
    "Rejected replay or reason/integrity drift changed durable state.",
  );

  const manualChanged = await client.$executeRawUnsafe(
    `UPDATE "GuestGameDelivery"
     SET "stateReasonCode" = 'TEST_MANUAL_REASON_ONLY_ALLOWED'
     WHERE "tenantId" = $1
       AND "id" = $2`,
    fixtures.tenantA,
    fixtures.deliveries.manual,
  );
  assert.equal(manualChanged, 1);
  const [manualState] = await client.$queryRawUnsafe(
    `SELECT
       "channel",
       "integrityState",
       "integrityReasonCode",
       "stateReasonCode",
       "transitionRevision"::TEXT AS "transitionRevision"
     FROM "GuestGameDelivery"
     WHERE "tenantId" = $1
       AND "id" = $2`,
    fixtures.tenantA,
    fixtures.deliveries.manual,
  );
  assert.deepEqual(manualState, {
    channel: "MANUAL",
    integrityState: "VERIFIED",
    integrityReasonCode: null,
    stateReasonCode: "TEST_MANUAL_REASON_ONLY_ALLOWED",
    transitionRevision: "0",
  });
}

async function assertNullClosedStateMatrices(client, fixtures) {
  const digest = "b".repeat(64);

  await expectCheckConstraint("GuestGameDelivery_outcome_check", () =>
    client.$executeRawUnsafe(
      `INSERT INTO "GuestGameDelivery" (
         "id", "tenantId", "rewardId", "profileId", "guestId", "storeId",
         "channel", "status", "readinessStatus", "messageTitle", "messageBody",
         "providerOutcomeCode", "providerObservedAt", "createdAt", "updatedAt"
       ) VALUES (
         $1, $2, $3, $4, $5, $6, 'MAX', 'READY', 'READY_FOR_BOT',
         'invalid outcome', 'invalid outcome', 'MALFORMED_OUTCOME',
         CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
       )`,
      randomUUID(),
      fixtures.tenantA,
      fixtures.rewards.backfill,
      fixtures.profileA1,
      fixtures.guestA1,
      fixtures.storeA1,
    ),
  );

  await expectCheckConstraint("GuestGameDelivery_provider_state_check", () =>
    client.$executeRawUnsafe(
      `UPDATE "GuestGameDelivery"
       SET
         "status" = 'PROCESSING',
         "attempts" = 1,
         "claimGeneration" = 1,
         "transitionRevision" = 1,
         "claimJobKind" = 'GUEST_GAME_DELIVERY_DISPATCH',
         "executionRevision" = NULL,
         "storeExecutionRevision" = NULL,
         "leaseOwner" = 'null-matrix-fixture',
         "claimKeyVersion" = 1,
         "claimOwnerDigest" = $2,
         "claimTokenDigest" = $2,
         "claimedAt" = CURRENT_TIMESTAMP,
         "leaseExpiresAt" = CURRENT_TIMESTAMP + INTERVAL '5 minutes',
         "acknowledgeUntil" = CURRENT_TIMESTAMP + INTERVAL '10 minutes',
         "effectInputDigest" = $2,
         "providerConfigDigest" = $2
       WHERE "id" = $1`,
      fixtures.deliveries.backfill,
      digest,
    ),
  );

  await expectCheckConstraint(
    "GuestGameDeliveryEvent_scope_value_check",
    () =>
      client.$executeRawUnsafe(
        `INSERT INTO "GuestGameDeliveryEvent" (
           "id", "tenantId", "deliveryId", "rewardId", "eventType",
           "providerOutcomeCode", "providerObservedAt", "note"
         ) VALUES (
           $1, $2, $3, $4, 'LEGACY_PARTIAL_OUTCOME_FIXTURE',
           'MALFORMED_OUTCOME', CURRENT_TIMESTAMP,
           'NULL must not satisfy the outcome matrix.'
         )`,
        randomUUID(),
        fixtures.tenantA,
        fixtures.deliveries.backfill,
        fixtures.rewards.backfill,
      ),
  );

  await expectCheckConstraint(
    "GuestGameDeliveryEvent_scope_value_check",
    () =>
      client.$executeRawUnsafe(
        `INSERT INTO "GuestGameDeliveryEvent" (
           "id", "tenantId", "deliveryId", "rewardId", "eventType",
           "integrityReasonCode", "note"
         ) VALUES (
           $1, $2, $3, $4, 'LEGACY_PARTIAL_INTEGRITY_FIXTURE',
           'TEST_REASON_WITHOUT_INTEGRITY_STATE',
           'NULL integrityState must not satisfy the integrity pair matrix.'
         )`,
        randomUUID(),
        fixtures.tenantA,
        fixtures.deliveries.backfill,
        fixtures.rewards.backfill,
      ),
  );

  const transitionRevision = 3;
  const transitionKey = await canonicalTransitionKey(client, {
    tenantId: fixtures.tenantA,
    deliveryId: fixtures.deliveries.match,
    rewardId: fixtures.rewards.match,
    transitionRevision,
    claimGeneration: 1,
    eventType: "DELIVERY_FINALIZED",
    attemptNumber: 1,
    fromStatus: "READY",
    toStatus: "BLOCKED",
  });
  await expectCheckConstraint(
    "GuestGameDeliveryEvent_durable_evidence_check",
    () =>
      client.$executeRawUnsafe(
        `INSERT INTO "GuestGameDeliveryEvent" (
           "id", "tenantId", "deliveryId", "rewardId", "storeId", "eventType",
           "transitionKey", "transitionRevision", "fromStatus", "toStatus",
           "channel", "claimGeneration", "attemptNumber", "claimJobKind",
           "executionRevision", "storeExecutionRevision", "claimKeyVersion",
           "claimOwnerDigest", "claimTokenDigest", "claimedAt",
           "leaseExpiresAt", "acknowledgeUntil", "effectInputDigest",
           "providerConfigDigest", "integrityState", "integrityReasonCode",
           "stateReasonCode", "note"
         ) VALUES (
           $1, $2, $3, $4, $5, 'DELIVERY_FINALIZED',
           $6, $7::BIGINT, 'READY', 'BLOCKED', 'MAX', 1, 1,
           'GUEST_GAME_DELIVERY_DISPATCH', NULL, NULL, 1,
           $8, $8, CURRENT_TIMESTAMP,
           CURRENT_TIMESTAMP + INTERVAL '5 minutes',
           CURRENT_TIMESTAMP + INTERVAL '10 minutes',
           $8, $8, 'VERIFIED', NULL, 'TEST_REVISION_BLOCKED_TWO',
           'NULL must not satisfy the durable evidence matrix.'
         )`,
        randomUUID(),
        fixtures.tenantA,
        fixtures.deliveries.match,
        fixtures.rewards.match,
        fixtures.storeA1,
        transitionKey,
        transitionRevision,
        digest,
      ),
  );
}

async function assertTriggerSemantics(client, fixtures) {
  const quarantinedDeliveryId = fixtures.deliveries.mismatch;
  const readQuarantineSnapshot = async () => {
    const [delivery] = await client.$queryRawUnsafe(
      `SELECT
         "status",
         "integrityState",
         "integrityReasonCode",
         "stateReasonCode",
         "transitionRevision"::TEXT AS "transitionRevision",
         "note",
         "updatedAt"::TEXT AS "updatedAt"
       FROM "GuestGameDelivery"
       WHERE "tenantId" = $1
         AND "id" = $2`,
      fixtures.tenantA,
      quarantinedDeliveryId,
    );
    const events = await client.$queryRawUnsafe(
      `SELECT
         "id",
         "eventType",
         "transitionKey",
         "transitionRevision"::TEXT AS "transitionRevision",
         "fromStatus",
         "toStatus",
         "integrityState",
         "integrityReasonCode",
         "stateReasonCode"
       FROM "GuestGameDeliveryEvent"
       WHERE "tenantId" = $1
         AND "deliveryId" = $2
       ORDER BY "id"`,
      fixtures.tenantA,
      quarantinedDeliveryId,
    );
    const [attempts] = await client.$queryRawUnsafe(
      `SELECT COUNT(*)::INTEGER AS count
       FROM "GuestGameDeliveryAttempt"
       WHERE "tenantId" = $1
         AND "deliveryId" = $2`,
      fixtures.tenantA,
      quarantinedDeliveryId,
    );
    return { delivery, events, attemptCount: attempts.count };
  };
  const quarantineBefore = await readQuarantineSnapshot();
  assert.equal(
    quarantineBefore.delivery.integrityState,
    "LEGACY_QUARANTINED",
  );
  assert.equal(quarantineBefore.events.length, 1);
  assert.equal(quarantineBefore.events[0].integrityState, "LEGACY_QUARANTINED");
  assert.equal(
    quarantineBefore.events[0].integrityReasonCode,
    quarantineBefore.delivery.integrityReasonCode,
  );

  const immutableQuarantineError =
    /Legacy quarantined delivery is immutable; dedicated reconciliation is not enabled/u;
  await expectSqlState(
    "55000",
    () =>
      client.$executeRawUnsafe(
        `UPDATE "GuestGameDelivery"
         SET
           "status" = 'CANCELED',
           "stateReasonCode" = 'TEST_QUARANTINE_CANCELED'
         WHERE "tenantId" = $1
           AND "id" = $2`,
        fixtures.tenantA,
        quarantinedDeliveryId,
      ),
    immutableQuarantineError,
  );
  await expectSqlState(
    "55000",
    () =>
      client.$executeRawUnsafe(
        `UPDATE "GuestGameDelivery"
         SET "stateReasonCode" = 'TEST_QUARANTINE_REASON_DRIFT'
         WHERE "tenantId" = $1
           AND "id" = $2`,
        fixtures.tenantA,
        quarantinedDeliveryId,
      ),
    immutableQuarantineError,
  );
  await expectSqlState(
    "55000",
    () =>
      client.$executeRawUnsafe(
        `UPDATE "GuestGameDelivery"
         SET "integrityReasonCode" = 'TEST_QUARANTINE_INTEGRITY_DRIFT'
         WHERE "tenantId" = $1
           AND "id" = $2`,
        fixtures.tenantA,
        quarantinedDeliveryId,
      ),
    immutableQuarantineError,
  );
  await expectSqlState(
    "55000",
    () =>
      client.$executeRawUnsafe(
        `UPDATE "GuestGameDelivery"
         SET
           "integrityState" = 'VERIFIED',
           "integrityReasonCode" = NULL,
           "transitionRevision" = "transitionRevision" + 1
         WHERE "tenantId" = $1
           AND "id" = $2`,
        fixtures.tenantA,
        quarantinedDeliveryId,
      ),
    immutableQuarantineError,
  );
  await expectSqlState(
    "55000",
    () =>
      client.$executeRawUnsafe(
        `UPDATE "GuestGameDelivery"
         SET
           "note" = 'TEST_QUARANTINE_METADATA_DRIFT',
           "updatedAt" = CURRENT_TIMESTAMP
         WHERE "tenantId" = $1
           AND "id" = $2`,
        fixtures.tenantA,
        quarantinedDeliveryId,
      ),
    immutableQuarantineError,
  );
  await expectSqlState(
    "55000",
    () =>
      client.$executeRawUnsafe(
        `DELETE FROM "GuestGameDelivery"
         WHERE "tenantId" = $1
           AND "id" = $2`,
        fixtures.tenantA,
        quarantinedDeliveryId,
      ),
    immutableQuarantineError,
  );
  await expectSqlState(
    "55000",
    () =>
      client.$executeRawUnsafe(
        `DELETE FROM "GuestGameDeliveryEvent"
         WHERE "tenantId" = $1
           AND "deliveryId" = $2`,
        fixtures.tenantA,
        quarantinedDeliveryId,
      ),
    /GuestGameDeliveryEvent evidence is append-only/u,
  );
  assert.deepEqual(
    await readQuarantineSnapshot(),
    quarantineBefore,
    "A rejected legacy-quarantine mutation changed durable state or evidence.",
  );

  const invalidRewardId = randomUUID();
  await insertReward(client, {
    id: invalidRewardId,
    tenantId: fixtures.tenantA,
    profileId: fixtures.profileA1,
    guestId: fixtures.guestA1,
    storeId: null,
    suffix: "fresh-quarantine-rejected",
  });
  await expectSqlState(
    "23514",
    () =>
      client.$executeRawUnsafe(
        `INSERT INTO "GuestGameDelivery" (
           "id", "tenantId", "rewardId", "profileId", "guestId",
           "channel", "status", "readinessStatus", "messageTitle", "messageBody",
           "integrityState", "createdAt", "updatedAt"
         ) VALUES (
           $1, $2, $3, $4, $5, 'MANUAL', 'BLOCKED', 'NEEDS_REVIEW',
           'invalid', 'invalid', 'LEGACY_QUARANTINED',
           CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
         )`,
        randomUUID(),
        fixtures.tenantA,
        invalidRewardId,
        fixtures.profileA1,
        fixtures.guestA1,
      ),
    /Fresh delivery cannot self-assign legacy quarantine/u,
  );

  await expectSqlState(
    "23514",
    () =>
      client.$transaction(async (transaction) => {
        await transaction.$executeRawUnsafe(
          `UPDATE "GuestGameDelivery"
           SET "status" = 'BLOCKED',
               "stateReasonCode" = 'TEST_TRANSITION_WITHOUT_EVENT',
               "transitionRevision" = "transitionRevision" + 1
           WHERE "id" = $1`,
          fixtures.deliveries.backfill,
        );
      }),
    /Delivery transition requires exactly one typed durable event/u,
  );
  await expectSqlState(
    "23514",
    () =>
      client.$transaction(async (transaction) => {
        await transaction.$executeRawUnsafe(
          `UPDATE "GuestGameReward"
           SET "storeId" = $1
           WHERE "id" = $2`,
          fixtures.storeA2,
          fixtures.rewards.backfill,
        );
      }),
    /Reward update breaks verified provider delivery binding/u,
  );
  await expectSqlState(
    "23514",
    () =>
      client.$transaction(async (transaction) => {
        await transaction.$executeRawUnsafe(
          `UPDATE "GuestGameDelivery"
           SET "storeId" = $1
           WHERE "id" = $2`,
          fixtures.storeA2,
          fixtures.deliveries.backfill,
        );
      }),
    /Verified provider delivery does not match canonical reward binding/u,
  );
  await expectSqlState(
    "55000",
    () =>
      client.$executeRawUnsafe(
        `UPDATE "GuestGameDeliveryEvent"
         SET "note" = 'tampered'
         WHERE "id" = $1`,
        fixtures.legacyEvent,
      ),
    /GuestGameDeliveryEvent evidence is append-only/u,
  );
  await expectSqlState(
    "55000",
    () =>
      client.$executeRawUnsafe(
        `DELETE FROM "GuestGameDeliveryEvent" WHERE "id" = $1`,
        fixtures.legacyEvent,
      ),
    /GuestGameDeliveryEvent evidence is append-only/u,
  );
  await expectSqlState(
    "23514",
    () =>
      client.$executeRawUnsafe(
        `INSERT INTO "GuestGameDeliveryAttempt" (
           "id", "tenantId", "deliveryId", "rewardId", "storeId", "channel",
           "claimGeneration", "attemptNumber", "claimJobKind",
           "executionRevision", "storeExecutionRevision", "claimKeyVersion",
           "claimOwnerDigest", "claimTokenDigest", "claimedAt",
           "leaseExpiresAt", "acknowledgeUntil", "effectInputDigest",
           "providerConfigDigest", "providerAuthorityRevision",
           "workloadIdentityDigest", "providerAttemptKey", "providerAttemptedAt",
           "sendGrantDigest", "sendGrantExpiresAt"
         ) VALUES (
           $1, $2, $3, $4, $5, 'TELEGRAM', 1, 1,
           'GUEST_GAME_DELIVERY_DISPATCH', 7, 2, 1,
           $6, $6, CURRENT_TIMESTAMP,
           CURRENT_TIMESTAMP + INTERVAL '10 minutes',
           CURRENT_TIMESTAMP + INTERVAL '20 minutes', $6, $6, 1, $6, $7,
           CURRENT_TIMESTAMP + INTERVAL '1 minute', $6,
           CURRENT_TIMESTAMP + INTERVAL '5 minutes'
         )`,
        randomUUID(),
        fixtures.tenantA,
        fixtures.deliveries.backfill,
        fixtures.rewards.backfill,
        fixtures.storeA1,
        "a".repeat(64),
        `attempt-${randomUUID()}`,
      ),
    /Attempt does not match the current delivery provider marker/u,
  );
  await expectSqlState(
    "23503",
    () =>
      client.$executeRawUnsafe(
        `DELETE FROM "Store" WHERE "id" = $1`,
        fixtures.storeA1,
      ),
    /(?:GuestGameReward|GuestGameDelivery|GuestGameDeliveryAttempt|GuestGameDeliveryEvent)_(?:tenantId_)?storeId_fkey/u,
  );
}

async function runSuccessfulUpgrade(
  schemaPath,
  databaseUrl,
  migrationPlan,
  fixtures,
  runtimeRoleName,
) {
  runMigrateDeploy(schemaPath, databaseUrl);
  runMigrateDeploy(schemaPath, databaseUrl);
  await assertExactAppliedMigrations(databaseUrl, [
    ...migrationPlan.prefixMigrations,
    migrationPlan.targetMigration,
  ]);
  const client = prismaClient(databaseUrl);
  try {
    assertPost166Catalog(await readPost166Catalog(client));
    await assertSuccessfulBackfillAndQuarantine(client, fixtures);
    await assertRevisionFencedTransitions(client, fixtures, runtimeRoleName);
    await assertRewardDeliveryLockBoundaryScope(
      client,
      fixtures,
      runtimeRoleName,
    );
    await assertRewardDeliveryLockBoundaryConcurrency(
      databaseUrl,
      fixtures,
    );
    await assertNullClosedStateMatrices(client, fixtures);
    await assertTriggerSemantics(client, fixtures);
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

async function assertFailedAttemptState(
  client,
  expectedCounts,
  baselineSnapshot,
) {
  assertPre166Catalog(await readPre166Catalog(client));
  assert.deepEqual(await readLegacySnapshot(client), baselineSnapshot);
  assert.deepEqual(await readTargetAttemptCounts(client), expectedCounts);
}

async function runPreflightFailures(
  schemaPath,
  databaseUrl,
  fixtures,
) {
  let client = prismaClient(databaseUrl);
  let baseline = await readLegacySnapshot(client);
  const [rewardScopeFixture] = await client.$queryRawUnsafe(
    `SELECT COUNT(*)::INTEGER AS count
     FROM "GuestGameDelivery" AS delivery
     JOIN "GuestGameReward" AS reward
       ON reward."id" = delivery."rewardId"
     WHERE reward."tenantId" <> delivery."tenantId"`,
  );
  assert.equal(rewardScopeFixture.count, 1);
  await client.$disconnect();

  let attempt = spawnMigrateDeploy(schemaPath, databaseUrl);
  assertMigrationFailure(
    attempt,
    /(?:55000|cross-tenant reward binding|current transaction is aborted)/iu,
  );
  client = prismaClient(databaseUrl);
  try {
    await assertFailedAttemptState(
      client,
      { total: 1, unfinished: 1, rolled_back: 0, applied: 0 },
      baseline,
    );
  } finally {
    await client.$disconnect();
  }
  runMigrateResolveRolledBack(schemaPath, databaseUrl);

  client = prismaClient(databaseUrl);
  try {
    await client.$executeRawUnsafe(
      `UPDATE "GuestGameDelivery"
       SET "rewardId" = $1
       WHERE "id" = $2`,
      fixtures.failureRewardA,
      fixtures.failureDelivery,
    );
    await insertLegacyEvent(client, {
      id: fixtures.failureEvent,
      tenantId: fixtures.tenantB,
      deliveryId: fixtures.failureDelivery,
      rewardId: fixtures.failureRewardA,
      eventType: "FAILURE_EVENT_SCOPE_FIXTURE",
    });
    const [eventScopeFixture] = await client.$queryRawUnsafe(
      `SELECT COUNT(*)::INTEGER AS count
       FROM "GuestGameDeliveryEvent" AS event
       JOIN "GuestGameDelivery" AS delivery
         ON delivery."id" = event."deliveryId"
       JOIN "GuestGameReward" AS reward
         ON reward."id" = event."rewardId"
       WHERE event."tenantId" <> delivery."tenantId"
          OR event."tenantId" <> reward."tenantId"
          OR event."rewardId" <> delivery."rewardId"`,
    );
    assert.equal(eventScopeFixture.count, 1);
    baseline = await readLegacySnapshot(client);
  } finally {
    await client.$disconnect();
  }

  attempt = spawnMigrateDeploy(schemaPath, databaseUrl);
  assertMigrationFailure(
    attempt,
    /(?:55000|cross-scope delivery or reward binding|current transaction is aborted)/iu,
  );
  client = prismaClient(databaseUrl);
  try {
    await assertFailedAttemptState(
      client,
      { total: 2, unfinished: 1, rolled_back: 1, applied: 0 },
      baseline,
    );
  } finally {
    await client.$disconnect();
  }
  runMigrateResolveRolledBack(schemaPath, databaseUrl);

  client = prismaClient(databaseUrl);
  try {
    await client.$executeRawUnsafe(
      `UPDATE "GuestGameDeliveryEvent"
       SET "tenantId" = $1
       WHERE "id" = $2`,
      fixtures.tenantA,
      fixtures.failureEvent,
    );
    baseline = await readLegacySnapshot(client);
  } finally {
    await client.$disconnect();
  }

  const reservedEventIds = [];
  client = prismaClient(databaseUrl);
  try {
    for (const eventType of RESERVED_TYPED_EVENT_TYPES) {
      const eventId = randomUUID();
      reservedEventIds.push(eventId);
      await insertLegacyEvent(client, {
        id: eventId,
        tenantId: fixtures.tenantA,
        deliveryId: fixtures.failureDelivery,
        rewardId: fixtures.failureRewardA,
        eventType,
      });
    }
    const reservedRows = await client.$queryRawUnsafe(
      `SELECT "eventType"
       FROM "GuestGameDeliveryEvent"
       WHERE "id" = ANY($1::TEXT[])
       ORDER BY "eventType"`,
      reservedEventIds,
    );
    assert.deepEqual(
      reservedRows.map(({ eventType }) => eventType),
      [...RESERVED_TYPED_EVENT_TYPES].sort(),
    );
    baseline = await readLegacySnapshot(client);
  } finally {
    await client.$disconnect();
  }

  attempt = spawnMigrateDeploy(schemaPath, databaseUrl);
  assertMigrationFailure(
    attempt,
    /(?:55000|pre-166 reserved typed event name|current transaction is aborted)/iu,
  );
  client = prismaClient(databaseUrl);
  try {
    await assertFailedAttemptState(
      client,
      { total: 3, unfinished: 1, rolled_back: 2, applied: 0 },
      baseline,
    );
  } finally {
    await client.$disconnect();
  }
  runMigrateResolveRolledBack(schemaPath, databaseUrl);

  client = prismaClient(databaseUrl);
  try {
    const removed = await client.$executeRawUnsafe(
      `DELETE FROM "GuestGameDeliveryEvent"
       WHERE "id" = ANY($1::TEXT[])`,
      reservedEventIds,
    );
    assert.equal(removed, RESERVED_TYPED_EVENT_TYPES.length);
    baseline = await readLegacySnapshot(client);
  } finally {
    await client.$disconnect();
  }
  return baseline;
}

async function runLockTimeoutFailure(
  schemaPath,
  databaseUrl,
  baselineSnapshot,
) {
  const blocker = prismaClient(databaseUrl);
  let signalLock;
  let releaseLock;
  const lockAcquired = new Promise((resolveLock) => {
    signalLock = resolveLock;
  });
  const lockRelease = new Promise((resolveRelease) => {
    releaseLock = resolveRelease;
  });
  const transaction = blocker.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`LOCK TABLE "Guest" IN ACCESS SHARE MODE`);
      signalLock();
      await lockRelease;
    },
    { maxWait: 5_000, timeout: 30_000 },
  );
  try {
    await Promise.race([
      lockAcquired,
      transaction.then(() => contractError("LOCK_RELEASED_TOO_EARLY")),
    ]);
    assertLockTimeoutFailure(spawnMigrateDeploy(schemaPath, databaseUrl));
  } finally {
    releaseLock();
    try {
      await transaction;
    } finally {
      await blocker.$disconnect();
    }
  }

  const client = prismaClient(databaseUrl);
  try {
    await assertFailedAttemptState(
      client,
      { total: 4, unfinished: 1, rolled_back: 3, applied: 0 },
      baselineSnapshot,
    );
  } finally {
    await client.$disconnect();
  }
  runMigrateResolveRolledBack(schemaPath, databaseUrl);
}

async function createLateTriggerConflict(client) {
  await client.$executeRawUnsafe(
    `CREATE FUNCTION public."guest_game_delivery_event_append_only"()
     RETURNS TRIGGER
     LANGUAGE plpgsql
     AS $$
     BEGIN
       RETURN NEW;
     END;
     $$`,
  );
  await client.$executeRawUnsafe(
    `CREATE TRIGGER "GuestGameDeliveryEvent_append_only"
     BEFORE INSERT ON "GuestGameDeliveryEvent"
     FOR EACH ROW
     EXECUTE FUNCTION public."guest_game_delivery_event_append_only"()`,
  );
}

async function removeLateTriggerConflict(client) {
  await client.$executeRawUnsafe(
    `DROP TRIGGER "GuestGameDeliveryEvent_append_only"
     ON "GuestGameDeliveryEvent"`,
  );
  await client.$executeRawUnsafe(
    `DROP FUNCTION public."guest_game_delivery_event_append_only"()`,
  );
}

async function runLateDdlFailureAndRecovery(
  schemaPath,
  databaseUrl,
  migrationPlan,
  baselineSnapshot,
) {
  let client = prismaClient(databaseUrl);
  try {
    await createLateTriggerConflict(client);
  } finally {
    await client.$disconnect();
  }
  const attempt = spawnMigrateDeploy(schemaPath, databaseUrl);
  assertMigrationFailure(
    attempt,
    /(?:42710|already exists|current transaction is aborted)/iu,
  );

  client = prismaClient(databaseUrl);
  try {
    await assertFailedAttemptState(
      client,
      { total: 5, unfinished: 1, rolled_back: 4, applied: 0 },
      baselineSnapshot,
    );
    const [dummy] = await client.$queryRawUnsafe(
      `SELECT pg_catalog.pg_get_triggerdef(trigger_row.oid) AS definition
       FROM pg_catalog.pg_trigger AS trigger_row
       WHERE trigger_row.tgname = 'GuestGameDeliveryEvent_append_only'
         AND NOT trigger_row.tgisinternal`,
    );
    assert.match(dummy?.definition ?? "", /BEFORE INSERT ON/u);
    await removeLateTriggerConflict(client);
  } finally {
    await client.$disconnect();
  }
  runMigrateResolveRolledBack(schemaPath, databaseUrl);
  runMigrateDeploy(schemaPath, databaseUrl);
  runMigrateDeploy(schemaPath, databaseUrl);
  await assertExactAppliedMigrations(databaseUrl, [
    ...migrationPlan.prefixMigrations,
    migrationPlan.targetMigration,
  ]);
  client = prismaClient(databaseUrl);
  try {
    assertPost166Catalog(await readPost166Catalog(client));
    assert.deepEqual(await readTargetAttemptCounts(client), {
      total: 6,
      unfinished: 0,
      rolled_back: 5,
      applied: 1,
    });
  } finally {
    await client.$disconnect();
  }
}

function assertRealEnvironment(environment) {
  if (environment.NODE_ENV === "production") {
    contractError("PRODUCTION_ENVIRONMENT_REFUSED");
  }
  if (
    environment.TENANT_DELIVERY_CLAIM_UPGRADE_SMOKE_CONFIRM !==
    REQUIRED_CONFIRMATION
  ) {
    contractError("DELIVERY_CLAIM_UPGRADE_SMOKE_CONFIRMATION_REQUIRED");
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
  assert(caught);
}

async function runOfflineSelfTest() {
  const safe = parseSafeSourceDatabaseUrl(
    "postgresql://postgres:postgres@127.0.0.1:5432/leetplus_ci?schema=public",
  );
  assert.equal(safe.databaseName, "leetplus_ci");
  expectOfflineFailure(() =>
    parseSafeSourceDatabaseUrl(
      "postgresql://postgres:postgres@database.invalid:5432/leetplus_ci",
    ),
  );
  expectOfflineFailure(() =>
    parseSafeSourceDatabaseUrl(
      "postgresql://postgres:postgres@127.0.0.1:5432/leetplus",
    ),
  );
  expectOfflineFailure(() =>
    parseSafeSourceDatabaseUrl(
      "postgresql://postgres:postgres@127.0.0.1:5432/leetplus_test?schema=private",
    ),
  );
  assertSafeGeneratedDatabaseName(
    "lp_delivery_claim_upgrade_ci_deadbeefdeadbeef",
  );
  assertSafeGeneratedDatabaseName(
    "lp_delivery_claim_failure_ci_deadbeefdeadbeef",
  );
  expectOfflineFailure(() => assertSafeGeneratedDatabaseName("leetplus_ci"));
  assertSafeGeneratedRuntimeRoleName(
    "lp_delivery_claim_runtime_deadbeefdeadbeef",
  );
  expectOfflineFailure(() =>
    assertSafeGeneratedRuntimeRoleName("leetplus_runtime"),
  );
  assertSafeTempRoot(join(tmpdir(), `${TEMP_ROOT_PREFIX}deadbeef`));
  expectOfflineFailure(() => assertSafeTempRoot(tmpdir()));
  expectOfflineFailure(() =>
    assertRealEnvironment({
      NODE_ENV: "production",
      DATABASE_URL:
        "postgresql://postgres:postgres@127.0.0.1:5432/leetplus_ci",
      TENANT_DELIVERY_CLAIM_UPGRADE_SMOKE_CONFIRM: REQUIRED_CONFIRMATION,
    }),
  );
  expectOfflineFailure(() =>
    assertRealEnvironment({
      NODE_ENV: "test",
      DATABASE_URL:
        "postgresql://postgres:postgres@127.0.0.1:5432/leetplus_ci",
    }),
  );
  assertMigrationFailure(
    {
      result: { error: undefined, status: 1 },
      elapsedMs: 100,
      output: `${TARGET_MIGRATION}: database error 55000`,
    },
    /55000/u,
  );
  assertLockTimeoutFailure({
    result: { error: undefined, status: 1 },
    elapsedMs: 5_000,
    output: `${TARGET_MIGRATION}: database error 55P03 lock timeout`,
  });
  assertLockTimeoutFailure({
    result: { error: undefined, status: 1 },
    elapsedMs: 5_000,
    output: `${TARGET_MIGRATION}: ERROR current transaction is aborted`,
  });
  assertMigrationFailure(
    {
      result: { error: undefined, status: 1 },
      elapsedMs: 100,
      output: `${TARGET_MIGRATION}: ERROR current transaction is aborted`,
    },
    /(?:42710|already exists|current transaction is aborted)/iu,
  );
  const wrappedDriverStates = extractSqlStates({
    code: "P2010",
    meta: {
      code: "ERROR",
      driverAdapterError: {
        cause: {
          originalCode: "23514",
          originalMessage:
            "Delivery transition requires exactly one typed durable event",
        },
      },
    },
  });
  assert(wrappedDriverStates.has("23514"));
  assert(wrappedDriverStates.has("P2010"));
  assert(wrappedDriverStates.has("ERROR"));
  const plan = await readMigrationPlan();
  assert.equal(plan.prefixMigrations.length, 165);
  assert.equal(plan.prefixMigrations.at(-1), PREFIX_MIGRATION);
  assert.equal(plan.targetMigration, TARGET_MIGRATION);
  process.stdout.write(
    `${JSON.stringify({
      script: SCRIPT_NAME,
      status: "PASS",
      mode: "SELF_TEST",
      prefixMigrationCount: plan.prefixMigrations.length,
      targetMigration: plan.targetMigration,
      populatedSuccessScenarios: 10,
      preflightRollbackScenarios: 3,
      reservedTypedEventCollisionFixtures: 8,
      nullClosedMatrixScenarios: 5,
      lockTimeoutRollbackScenarios: 1,
      lateDdlRollbackScenarios: 1,
      revisionFencedTransitions: 4,
      antiReplayScenarios: 4,
      runtimeEventBoundaryNegativeScenarios: 9,
      rewardDeliveryLockScopeScenarios: 2,
      rewardDeliveryLockConcurrencyScenarios: 1,
      legacyQuarantineFreezeScenarios: 7,
      reasonIntegrityConsistencyScenarios: 8,
      destructiveSourceDatabaseActions: 0,
    })}\n`,
  );
}

async function runRealSmoke(environment) {
  const { sourceUrl, databaseName: sourceDatabaseName } =
    assertRealEnvironment(environment);
  const migrationPlan = await readMigrationPlan();
  const { successDatabaseName, failureDatabaseName } = generatedDatabaseNames();
  const runtimeRoleName = generatedRuntimeRoleName();
  const sourceDatabaseUrl = databaseUrlFor(sourceUrl, sourceDatabaseName);
  const successDatabaseUrl = databaseUrlFor(sourceUrl, successDatabaseName);
  const failureDatabaseUrl = databaseUrlFor(sourceUrl, failureDatabaseName);
  const admin = prismaClient(sourceDatabaseUrl);
  let tempRoot;
  let clusterLockHeld = false;
  let successDatabaseCreated = false;
  let failureDatabaseCreated = false;
  let runtimeRoleCreated = false;
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

    const successClient = prismaClient(successDatabaseUrl);
    let successFixtures;
    try {
      assertPre166Catalog(await readPre166Catalog(successClient));
      successFixtures = await createSuccessFixtures(
        successClient,
        randomBytes(5).toString("hex"),
      );
    } finally {
      await successClient.$disconnect();
    }
    const failureClient = prismaClient(failureDatabaseUrl);
    let failureFixtures;
    try {
      assertPre166Catalog(await readPre166Catalog(failureClient));
      failureFixtures = await createFailureFixtures(
        failureClient,
        randomBytes(5).toString("hex"),
      );
    } finally {
      await failureClient.$disconnect();
    }

    await addTargetMigrationToArtifact(artifact, migrationPlan);
    await createRestrictedRuntimeRole(admin, runtimeRoleName);
    runtimeRoleCreated = true;
    await runSuccessfulUpgrade(
      artifact.schemaPath,
      successDatabaseUrl,
      migrationPlan,
      successFixtures,
      runtimeRoleName,
    );
    const repairedFailureBaseline = await runPreflightFailures(
      artifact.schemaPath,
      failureDatabaseUrl,
      failureFixtures,
    );
    await runLockTimeoutFailure(
      artifact.schemaPath,
      failureDatabaseUrl,
      repairedFailureBaseline,
    );
    await runLateDdlFailureAndRecovery(
      artifact.schemaPath,
      failureDatabaseUrl,
      migrationPlan,
      repairedFailureBaseline,
    );
    assert.deepEqual(
      await readSourceMigrationState(admin),
      sourceMigrationState,
      "The rehearsal changed the source database migration state.",
    );

    successEvidence = {
      script: SCRIPT_NAME,
      status: "PASS",
      postgresMajor: 16,
      prefixMigrationCount: migrationPlan.prefixMigrations.length,
      targetMigration: migrationPlan.targetMigration,
      populatedLegacyDeliveries: 10,
      canonicalStoreBackfills: 1,
      legacyQuarantines: 6,
      preservedFailClosedStores: 3,
      catalogChecks: {
        namedChecks:
          DELIVERY_CHECKS.length + ATTEMPT_CHECKS.length + EVENT_CHECKS.length,
        restrictForeignKeys: REQUIRED_RESTRICT_FOREIGN_KEYS.length,
        indexes: REQUIRED_INDEXES.length,
        triggers: REQUIRED_TRIGGERS.length,
        publicExecutableFunctions: 0,
        privateTriggerFunctions: REQUIRED_FUNCTIONS.length - 3,
        privateSecurityDefinerBoundaries: 1,
        privateSecurityInvokerLockBoundaries: 1,
      },
      transitionRevisionEvidence: {
        restrictedRuntimeRole: true,
        directEventInsertDenied: true,
        boundaryOnlyEventWrites: true,
        committedTransitions: 4,
        distinctCanonicalKeys: 4,
        finalRetriedStateVerified: true,
        staleEventReplayRejected: true,
        futureRevisionPreinsertRejected: true,
        currentRevisionReplayRejected: true,
        currentRevisionExtraEventRejected: true,
        mismatchedDeliveryScopeRejected: true,
        unknownPayloadKeyRejected: true,
        actorUserPayloadRejected: true,
        duplicatePayloadKeyRejected: true,
        missingProvenanceRejected: true,
      },
      rewardDeliveryLockOrderEvidence: {
        restrictedRuntimeScopeChecks: true,
        disposableOwnerDmlSessions: 2,
        missingRewardRejected: true,
        crossTenantRewardRejected: true,
        waiterObservedOnAdvisoryLock: true,
        deliveryDeferredTriggerCommitted: true,
        rewardDeferredTriggerCommitted: true,
        holderAndWaiterCommitted: true,
        rawDeadlockOrLockTimeoutErrors: 0,
        stateAndEvidenceUnchanged: true,
      },
      nullClosedMatrixEvidence: {
        deliveryOutcomeRejected: true,
        deliveryProviderStateRejected: true,
        eventOutcomeRejected: true,
        eventIntegrityPairRejected: true,
        durableEventRevisionRejected: true,
      },
      legacyQuarantineFreezeEvidence: {
        immutableMutationsRejected: 7,
        finalStateAndEvidenceUnchanged: true,
      },
      reasonIntegrityConsistencyEvidence: {
        migrationSnapshotsExact: true,
        providerReasonMutationsRejected: 3,
        mismatchedEventSnapshotRejected: true,
        mismatchedIntegritySnapshotRejected: true,
        deferredFinalRowRereadRejected: true,
        nonProviderCompatibilityPreserved: true,
      },
      rollbackEvidence: {
        crossTenantPreflights: 2,
        reservedTypedEventCollisionPreflight: true,
        reservedTypedEventCollisionFixtures: RESERVED_TYPED_EVENT_TYPES.length,
        lockTimeoutSqlState: "55P03",
        lateDdlSqlState: "42710",
        rolledBackTargetAttemptsBeforeRecovery: 5,
      },
      idempotentDeployVerified: true,
      sourceDatabaseMigrationsApplied: 0,
    };
  } catch (error) {
    primaryError = error;
  } finally {
    if (successDatabaseCreated) {
      try {
        await dropDisposableDatabase(admin, successDatabaseName);
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (failureDatabaseCreated) {
      try {
        await dropDisposableDatabase(admin, failureDatabaseName);
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (runtimeRoleCreated) {
      try {
        await dropRestrictedRuntimeRole(admin, runtimeRoleName);
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (clusterLockHeld) {
      try {
        await releaseClusterLock(admin);
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
      "Delivery claim rehearsal and cleanup both failed.",
    );
  }
  if (primaryError) {
    throw primaryError;
  }
  if (cleanupErrors.length > 0) {
    throw new AggregateError(
      cleanupErrors,
      "Delivery claim rehearsal cleanup failed.",
    );
  }
  assert(successEvidence);
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
        code: error?.code ?? "DELIVERY_CLAIM_UPGRADE_SMOKE_FAILED",
        message:
          typeof error?.message === "string"
            ? error.message
            : "Delivery claim upgrade smoke failed.",
      },
    })}\n`,
  );
  process.exitCode = 1;
});

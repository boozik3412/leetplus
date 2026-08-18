import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { cp, copyFile, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { APPLICATION_RUNTIME_FUNCTIONS } from "./runtime-function-enrollment.mjs";
import {
  CURRENT_EXPECTED_LATEST_MIGRATION,
  CURRENT_EXPECTED_MIGRATION_COUNT,
  STAFF_TASK_ALLOWED_ADDITIVE_TAIL,
  STAFF_TASK_CURRENT_RELEASE_STATE,
  STAFF_TASK_FROZEN_PREFIX_COUNT,
  STAFF_TASK_FROZEN_PREFIX_LATEST,
} from "./staff-task-integrity-migration-state.mjs";

const SCRIPT_NAME = "identity-activation-locator-upgrade-smoke";
const REQUIRED_CONFIRMATION = "run-identity-activation-locator-upgrade-smoke";
const TARGET_MIGRATION = "20260729233000_identity_activation_locator";
const PREVIOUS_MIGRATION = "20260729230000_identity_invite_writer_boundary";
const MIGRATION_PATTERN = /^\d{14}_[a-z0-9_]+$/u;
const SAFE_SOURCE_DATABASE_PATTERN =
  /(?:^|[_-])(?:ci|test|testing)(?:$|[_-])/iu;
const UPGRADE_DATABASE_PREFIX = "lp_identity_locator_upgrade_ci_";
const CLEAN_DATABASE_PREFIX = "lp_identity_locator_clean_ci_";
const RUNTIME_ROLE_PREFIX = "lp_identity_locator_runtime_";
const UPGRADE_DATABASE_PATTERN =
  /^lp_identity_locator_upgrade_ci_[a-f0-9]{16}$/u;
const CLEAN_DATABASE_PATTERN = /^lp_identity_locator_clean_ci_[a-f0-9]{16}$/u;
const RUNTIME_ROLE_PATTERN = /^lp_identity_locator_runtime_[a-f0-9]{16}$/u;
const TEMP_ROOT_PREFIX = "leetplus-identity-locator-upgrade-";
const MIGRATION_TIMEOUT_MS = 10 * 60 * 1000;
const CLUSTER_LOCK_CLASS = 1_281_120_000;
const CLUSTER_LOCK_OBJECT = 170;
const EXPECTED_SQL_STATES = Object.freeze({
  invalid: "22023",
  missing: "23503",
  mismatch: "23514",
  denied: "42501",
});
const HISTORICAL_CURRENT_170_RUNTIME_FUNCTIONS = Object.freeze(
  APPLICATION_RUNTIME_FUNCTIONS.filter(
    (entry) => entry.key !== "identityInitialOwnerInviteDeliveryAssertSent",
  ),
);

const HELP = `
${SCRIPT_NAME}

Local/CI-only PostgreSQL 16 smoke for migration 170. It creates two random
disposable databases from template0 and never migrates the source database.

The upgrade database is deployed through exact CURRENT_169, populated with
INVITE and USER identity claims, and then upgraded to CURRENT_170. The clean
database receives all 170 migrations. The smoke verifies:
  - exact and fail-closed locator assertions;
  - PII-free receipts and locator immutability;
  - discovery -> advisory email lock -> row recheck concurrency;
  - PUBLIC/runtime ACL before and after exact runtime enrollment;
  - exact clean and 169 -> 170 migration manifests.

Usage:
  node scripts/identity-activation-locator-upgrade-smoke.mjs
  node scripts/identity-activation-locator-upgrade-smoke.mjs --self-test
  node scripts/identity-activation-locator-upgrade-smoke.mjs --help

Required for the real smoke:
  DATABASE_URL
    PostgreSQL 16 on loopback, public schema, and a source database whose name
    contains ci/test/testing. The connected role must be a test superuser.
  IDENTITY_ACTIVATION_LOCATOR_UPGRADE_SMOKE_CONFIRM
    Must equal: ${REQUIRED_CONFIRMATION}

Safety:
  - NODE_ENV=production is rejected.
  - Only generated disposable database and role names are accepted.
  - The source database is neither migrated nor used as a template.
  - Temporary migration artifacts live under a generated OS temp directory.
  - Runtime sessions, databases, role, and temp files are cleaned in finally.
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
  return {
    help: false,
    selfTest: argv.includes("--self-test"),
  };
}

function quoteIdentifier(value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/u.test(value)) {
    contractError("DATABASE_IDENTIFIER_INVALID");
  }
  return `"${value}"`;
}

function buildHistoricalCurrent170RuntimeEnrollmentStatements(roleName) {
  assert.equal(
    HISTORICAL_CURRENT_170_RUNTIME_FUNCTIONS.length,
    7,
    "The historical CURRENT_170 runtime function manifest changed.",
  );
  const role = quoteIdentifier(roleName);
  return Object.freeze([
    `REVOKE ALL PRIVILEGES ON TABLE public."IdentityEmailClaim" FROM ${role}`,
    ...HISTORICAL_CURRENT_170_RUNTIME_FUNCTIONS.flatMap((entry) => [
      `GRANT EXECUTE ON FUNCTION ${entry.grantSignature} TO ${role}`,
      `REVOKE GRANT OPTION FOR EXECUTE ON FUNCTION ${entry.grantSignature} FROM ${role}`,
    ]),
  ]);
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
    UPGRADE_DATABASE_PATTERN.test(databaseName) ||
    CLEAN_DATABASE_PATTERN.test(databaseName)
  ) {
    contractError("SAFE_CI_TEST_SOURCE_DATABASE_REQUIRED");
  }
  const parameterNames = [...sourceUrl.searchParams.keys()];
  if (
    parameterNames.some((name) => name !== "schema") ||
    (sourceUrl.searchParams.has("schema") &&
      sourceUrl.searchParams.get("schema") !== "public")
  ) {
    contractError("ONLY_PUBLIC_SCHEMA_PARAMETER_ALLOWED");
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

function runtimeDatabaseUrl(sourceUrl, databaseName, roleName, password) {
  const target = new URL(databaseUrlFor(sourceUrl, databaseName));
  target.username = roleName;
  target.password = password;
  return target.toString();
}

function generatedNames() {
  const suffix = randomBytes(8).toString("hex");
  const upgradeDatabaseName = `${UPGRADE_DATABASE_PREFIX}${suffix}`;
  const cleanDatabaseName = `${CLEAN_DATABASE_PREFIX}${suffix}`;
  const runtimeRoleName = `${RUNTIME_ROLE_PREFIX}${suffix}`;
  assert.match(upgradeDatabaseName, UPGRADE_DATABASE_PATTERN);
  assert.match(cleanDatabaseName, CLEAN_DATABASE_PATTERN);
  assert.match(runtimeRoleName, RUNTIME_ROLE_PATTERN);
  assert.notEqual(upgradeDatabaseName, cleanDatabaseName);
  return {
    upgradeDatabaseName,
    cleanDatabaseName,
    runtimeRoleName,
  };
}

function assertSafeGeneratedDatabaseName(databaseName) {
  if (
    !UPGRADE_DATABASE_PATTERN.test(databaseName) &&
    !CLEAN_DATABASE_PATTERN.test(databaseName)
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
    migrationDirectories.every((name) => MIGRATION_PATTERN.test(name)),
    "Migration directory names must match the release contract.",
  );
  assert.equal(
    migrationDirectories.length,
    CURRENT_EXPECTED_MIGRATION_COUNT,
    "The smoke requires the exact current migration manifest.",
  );
  assert.equal(
    migrationDirectories[STAFF_TASK_FROZEN_PREFIX_COUNT - 1],
    STAFF_TASK_FROZEN_PREFIX_LATEST,
    "The frozen migration prefix changed.",
  );
  assert.deepEqual(
    migrationDirectories.slice(STAFF_TASK_FROZEN_PREFIX_COUNT),
    [...STAFF_TASK_ALLOWED_ADDITIVE_TAIL],
    "The reviewed additive migration tail changed.",
  );
  const targetIndex = migrationDirectories.indexOf(TARGET_MIGRATION);
  assert.equal(
    targetIndex,
    169,
    "The historical locator migration moved in the release manifest.",
  );
  assert.equal(migrationDirectories[targetIndex - 1], PREVIOUS_MIGRATION);
  assert.equal(
    CURRENT_EXPECTED_LATEST_MIGRATION,
    "20260818010000_founder_owner_invite_reissue_v1",
  );
  assert.equal(STAFF_TASK_CURRENT_RELEASE_STATE, "CURRENT_184");
  const historicalMigrations = migrationDirectories.slice(0, targetIndex + 1);
  return {
    sourcePrismaDir,
    prefixMigrations: historicalMigrations.slice(0, -1),
    allMigrations: historicalMigrations,
    targetMigration: TARGET_MIGRATION,
  };
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
        NODE_ENV: "test",
        PGOPTIONS: "-c lock_timeout=5000 -c statement_timeout=120000",
        NO_COLOR: "1",
        PRISMA_HIDE_UPDATE_MESSAGE: "true",
      },
      maxBuffer: 4 * 1024 * 1024,
      timeout: MIGRATION_TIMEOUT_MS,
      windowsHide: true,
      shell: false,
    },
  );
  if (result.error || result.status !== 0) {
    contractError(
      "MIGRATION_DEPLOY_FAILED",
      `Prisma migration deploy failed with status ${
        result.status ?? "unknown"
      }. Raw process output is suppressed because it may contain connection metadata.`,
    );
  }
}

async function assertTestSuperuser(admin, expectedDatabaseName) {
  const [row] = await admin.$queryRawUnsafe(
    `SELECT
       current_database() AS database_name,
       current_setting('server_version_num')::integer
         AS server_version_number,
       role.rolsuper AS is_superuser
     FROM pg_catalog.pg_roles AS role
     WHERE role.rolname = CURRENT_USER`,
  );
  assert.equal(row?.database_name, expectedDatabaseName);
  assert.equal(
    Math.floor(Number(row?.server_version_number) / 10_000),
    16,
    "The locator upgrade smoke requires PostgreSQL 16.",
  );
  assert.equal(
    row?.is_superuser,
    true,
    "The smoke requires a disposable-cluster test superuser.",
  );
}

async function acquireClusterLock(admin) {
  const [row] = await admin.$queryRawUnsafe(
    `SELECT pg_catalog.pg_try_advisory_lock(
       $1::integer,
       $2::integer
     ) AS acquired`,
    CLUSTER_LOCK_CLASS,
    CLUSTER_LOCK_OBJECT,
  );
  assert.equal(
    row?.acquired,
    true,
    "Another identity activation locator smoke is already running.",
  );
}

async function releaseClusterLock(admin) {
  const [row] = await admin.$queryRawUnsafe(
    `SELECT pg_catalog.pg_advisory_unlock(
       $1::integer,
       $2::integer
     ) AS released`,
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

async function createRuntimeRole(admin, roleName, password) {
  assertSafeGeneratedRuntimeRoleName(roleName);
  assert.match(password, /^[a-f0-9]{64}$/u);
  await admin.$executeRawUnsafe(
    `CREATE ROLE ${quoteIdentifier(roleName)}
       LOGIN PASSWORD '${password}'
       NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
       NOREPLICATION NOBYPASSRLS`,
  );
}

async function dropRuntimeRole(admin, roleName) {
  assertSafeGeneratedRuntimeRoleName(roleName);
  await admin.$executeRawUnsafe(
    `DROP ROLE IF EXISTS ${quoteIdentifier(roleName)}`,
  );
}

async function grantRuntimeConnection(admin, databaseName, roleName) {
  assertSafeGeneratedDatabaseName(databaseName);
  assertSafeGeneratedRuntimeRoleName(roleName);
  await admin.$executeRawUnsafe(
    `GRANT CONNECT ON DATABASE ${quoteIdentifier(
      databaseName,
    )} TO ${quoteIdentifier(roleName)}`,
  );
}

async function readMigrationNames(client) {
  const rows = await client.$queryRawUnsafe(
    `SELECT "migration_name"
     FROM "_prisma_migrations"
     WHERE "finished_at" IS NOT NULL
       AND "rolled_back_at" IS NULL
     ORDER BY "started_at" ASC, "migration_name" ASC`,
  );
  return rows.map((row) => row.migration_name);
}

async function assertExactAppliedMigrations(client, expected) {
  assert.deepEqual(await readMigrationNames(client), expected);
  const [state] = await client.$queryRawUnsafe(
    `SELECT
       pg_catalog.count(*) FILTER (
         WHERE "finished_at" IS NULL
           AND "rolled_back_at" IS NULL
       )::integer AS unfinished_count
     FROM "_prisma_migrations"`,
  );
  assert.equal(state?.unfinished_count, 0);
}

async function readSourceMigrationState(admin) {
  const relation = await admin.$queryRawUnsafe(
    `SELECT pg_catalog.to_regclass('public."_prisma_migrations"')::text
       AS relation_name`,
  );
  if (relation[0]?.relation_name === null) {
    return [];
  }
  return readMigrationNames(admin);
}

function fixtureSet(prefix) {
  return {
    tenantA: randomUUID(),
    tenantB: randomUUID(),
    exactReservation: randomUUID(),
    exactEmail: `${prefix}.exact@example.test`,
    typeReservation: randomUUID(),
    typeUser: randomUUID(),
    typeEmail: `${prefix}.type@example.test`,
    raceReservation: randomUUID(),
    raceInvite: randomUUID(),
    raceEmail: `${prefix}.race@example.test`,
    cleanReservation: randomUUID(),
    cleanEmail: `${prefix}.clean@example.test`,
    prefix,
  };
}

async function createTenants(client, fixtures) {
  const now = new Date("2026-07-30T12:00:00.000Z");
  for (const [id, suffix] of [
    [fixtures.tenantA, "a"],
    [fixtures.tenantB, "b"],
  ]) {
    await client.$executeRawUnsafe(
      `INSERT INTO public."Tenant" (
         "id",
         "name",
         "slug",
         "status",
         "customerStage",
         "onboardingStatus",
         "createdAt",
         "updatedAt"
       )
       VALUES (
         $1,
         $2,
         $3,
         'SUSPENDED'::public."TenantLifecycleStatus",
         'PILOT'::public."TenantCustomerStage",
         'PROVISIONING'::public."TenantOnboardingStatus",
         $4,
         $4
       )`,
      id,
      `Identity locator ${suffix}`,
      `identity-locator-${fixtures.prefix}-${suffix}`,
      now,
    );
  }
}

async function reserveInvite(client, email, tenantId, subjectId) {
  const rows = await client.$queryRawUnsafe(
    `SELECT public."identity_email_claim_reserve_invite_v2"(
       $1::text,
       $2::text,
       $3::text
     ) AS receipt`,
    email,
    tenantId,
    subjectId,
  );
  return rows[0]?.receipt;
}

async function assertByEmail(client, email, tenantId, subjectId, revision) {
  const rows = await client.$queryRawUnsafe(
    `SELECT public."identity_email_claim_assert_invite_v1"(
       $1::text,
       $2::text,
       $3::text,
       $4::integer
     ) AS receipt`,
    email,
    tenantId,
    subjectId,
    revision,
  );
  return rows[0]?.receipt;
}

async function assertByLocator(client, locator, tenantId, subjectId, revision) {
  const rows = await client.$queryRawUnsafe(
    `SELECT public."identity_email_claim_assert_invite_locator_v1"(
       $1::text,
       $2::text,
       $3::text,
       $4::integer
     ) AS receipt`,
    locator,
    tenantId,
    subjectId,
    revision,
  );
  return rows[0]?.receipt;
}

async function transitionInvite(
  client,
  email,
  tenantId,
  expectedSubjectId,
  expectedRevision,
  nextType,
  nextSubjectId,
) {
  const rows = await client.$queryRawUnsafe(
    `SELECT public."identity_email_claim_transition_v2"(
       $1::text,
       $2::text,
       'INVITE'::text,
       $3::text,
       $4::integer,
       $5::text,
       $6::text
     ) AS receipt`,
    email,
    tenantId,
    expectedSubjectId,
    expectedRevision,
    nextType,
    nextSubjectId,
  );
  return rows[0]?.receipt;
}

async function insertUser(client, { id, tenantId, email }) {
  await client.$executeRawUnsafe(
    `INSERT INTO public."User" (
       "id",
       "tenantId",
       "email",
       "passwordHash",
       "role",
       "isActive",
       "isPlatformAdmin",
       "identityClaimRevision",
       "createdAt",
       "updatedAt"
     )
     VALUES (
       $1,
       $2,
       $3,
       'locator-smoke-password-hash',
       'OWNER'::public."UserRole",
       TRUE,
       FALSE,
       NULL,
       $4,
       $4
     )`,
    id,
    tenantId,
    email,
    new Date("2026-07-30T12:00:00.000Z"),
  );
}

async function insertInvite(client, { id, tenantId, email, tokenHash }) {
  await client.$executeRawUnsafe(
    `INSERT INTO public."UserInvite" (
       "id",
       "tenantId",
       "email",
       "role",
       "tokenHash",
       "expiresAt",
       "identityClaimRevision",
       "createdAt",
       "updatedAt"
     )
     VALUES (
       $1,
       $2,
       $3,
       'OWNER'::public."UserRole",
       $4,
       '2099-01-01T00:00:00.000Z'::timestamptz,
       NULL,
       $5,
       $5
     )`,
    id,
    tenantId,
    email,
    tokenHash,
    new Date("2026-07-30T12:00:00.000Z"),
  );
}

async function createCurrent169Fixtures(client, fixtures) {
  await createTenants(client, fixtures);
  const exact = await reserveInvite(
    client,
    fixtures.exactEmail,
    fixtures.tenantA,
    fixtures.exactReservation,
  );
  assert.equal(exact?.decision, "CREATED");
  const type = await reserveInvite(
    client,
    fixtures.typeEmail,
    fixtures.tenantA,
    fixtures.typeReservation,
  );
  assert.equal(type?.decision, "CREATED");
  await insertUser(client, {
    id: fixtures.typeUser,
    tenantId: fixtures.tenantA,
    email: fixtures.typeEmail,
  });
  const transitioned = await transitionInvite(
    client,
    fixtures.typeEmail,
    fixtures.tenantA,
    fixtures.typeReservation,
    1,
    "USER",
    fixtures.typeUser,
  );
  assert.equal(transitioned?.decision, "TRANSITIONED");
  assert.equal(transitioned?.revision, 2);

  const race = await reserveInvite(
    client,
    fixtures.raceEmail,
    fixtures.tenantA,
    fixtures.raceReservation,
  );
  assert.equal(race?.decision, "CREATED");
  await insertInvite(client, {
    id: fixtures.raceInvite,
    tenantId: fixtures.tenantA,
    email: fixtures.raceEmail,
    tokenHash: `locator-race-${fixtures.prefix}`,
  });
}

async function readClaim(client, email) {
  const rows = await client.$queryRawUnsafe(
    `SELECT
       "emailCanonical",
       "claimType"::text AS claim_type,
       "tenantId",
       "subjectId",
       "workflowLocator",
       "revision"
     FROM public."IdentityEmailClaim"
     WHERE "emailCanonical" = $1`,
    email,
  );
  assert.equal(rows.length, 1);
  return rows[0];
}

async function assertPre170Catalog(client) {
  const [column] = await client.$queryRawUnsafe(
    `SELECT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_attribute
       WHERE attrelid = 'public."IdentityEmailClaim"'::regclass
         AND attname = 'workflowLocator'
         AND NOT attisdropped
     ) AS exists`,
  );
  assert.equal(column?.exists, false);
  const [fn] = await client.$queryRawUnsafe(
    `SELECT pg_catalog.to_regprocedure(
       'public."identity_email_claim_assert_invite_locator_v1"(text,text,text,integer)'
     ) IS NOT NULL AS exists`,
  );
  assert.equal(fn?.exists, false);
}

async function assertPost170Catalog(client) {
  const [column] = await client.$queryRawUnsafe(
    `SELECT
       attribute.atttypid = 'pg_catalog.text'::regtype AS text_type,
       attribute.attnotnull AS not_null
     FROM pg_catalog.pg_attribute AS attribute
     WHERE attribute.attrelid =
       'public."IdentityEmailClaim"'::regclass
       AND attribute.attname = 'workflowLocator'
       AND NOT attribute.attisdropped`,
  );
  assert.equal(column?.text_type, true);
  assert.equal(column?.not_null, true);

  const [catalog] = await client.$queryRawUnsafe(
    `SELECT
       index_object.indisunique AS is_unique,
       index_object.indisvalid AS is_valid,
       index_object.indisready AS is_ready,
       pg_catalog.pg_get_expr(
         index_object.indpred,
         index_object.indrelid
       ) AS predicate,
       function_object.prosecdef AS security_definer,
       function_object.provolatile::text AS volatility,
       function_object.proconfig =
         ARRAY['search_path=pg_catalog']::text[] AS search_path_exact,
       pg_catalog.has_function_privilege(
         'public',
         function_object.oid,
         'EXECUTE'
       ) AS public_execute,
       trigger_object.tgenabled::text AS trigger_enabled
     FROM pg_catalog.pg_index AS index_object
     JOIN pg_catalog.pg_class AS index_relation
       ON index_relation.oid = index_object.indexrelid
     CROSS JOIN pg_catalog.pg_proc AS function_object
     CROSS JOIN pg_catalog.pg_trigger AS trigger_object
     WHERE index_relation.relname =
       'identity_email_claim_workflow_locator_uidx'
       AND function_object.oid = pg_catalog.to_regprocedure(
         'public."identity_email_claim_assert_invite_locator_v1"(text,text,text,integer)'
       )
       AND trigger_object.tgrelid =
         'public."IdentityEmailClaim"'::regclass
       AND trigger_object.tgname =
         'IdentityEmailClaim_revision_guard_trigger'
       AND NOT trigger_object.tgisinternal`,
  );
  assert.equal(catalog?.is_unique, true);
  assert.equal(catalog?.is_valid, true);
  assert.equal(catalog?.is_ready, true);
  assert.match(catalog?.predicate ?? "", /INVITE/iu);
  assert.match(catalog?.predicate ?? "", /USER/iu);
  assert.equal(catalog?.security_definer, true);
  assert.equal(catalog?.volatility, "v");
  assert.equal(catalog?.search_path_exact, true);
  assert.equal(catalog?.public_execute, false);
  assert.equal(catalog?.trigger_enabled, "O");

  const [constraint] = await client.$queryRawUnsafe(
    `SELECT convalidated AS validated
     FROM pg_catalog.pg_constraint
     WHERE conrelid = 'public."IdentityEmailClaim"'::regclass
       AND conname = 'IdentityEmailClaim_workflow_locator_check'`,
  );
  assert.equal(constraint?.validated, true);
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
        // Another nested driver property can still carry the SQLSTATE.
      }
    }
  }
  return [...messages].join("\n");
}

function extractSqlStates(error) {
  return new Set(
    [...extractErrorText(error).matchAll(/\b([0-9A-Z]{5})\b/gu)].map(
      (match) => match[1],
    ),
  );
}

async function expectSqlState(label, expected, operation) {
  let caught = null;
  try {
    await operation();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, `${label}: PostgreSQL unexpectedly accepted the command.`);
  const states = extractSqlStates(caught);
  assert.ok(
    states.has(expected),
    `${label}: expected ${expected}; observed ${JSON.stringify([...states])}.`,
  );
  return { error: caught, states };
}

function assertExactLocatorReceipt(receipt, expected) {
  assert.deepEqual(Object.keys(receipt).sort(), [
    "claimType",
    "decision",
    "operation",
    "revision",
    "schemaVersion",
    "subjectId",
    "tenantId",
    "workflowLocator",
  ]);
  assert.deepEqual(receipt, {
    schemaVersion: 1,
    operation: "ASSERT_INVITE_LOCATOR",
    decision: "MATCHED",
    claimType: "INVITE",
    tenantId: expected.tenantId,
    subjectId: expected.subjectId,
    workflowLocator: expected.workflowLocator,
    revision: expected.revision,
  });
}

function assertPiiFreeReceipt(receipt, emails) {
  const serialized = JSON.stringify(receipt);
  for (const email of emails) {
    assert.doesNotMatch(
      serialized,
      new RegExp(email.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "iu"),
    );
  }
  assert.doesNotMatch(serialized, /email/iu);
}

async function assertUpgradeBehavior(client, fixtures) {
  await assertPost170Catalog(client);
  const exactClaim = await readClaim(client, fixtures.exactEmail);
  assert.equal(exactClaim.workflowLocator, fixtures.exactReservation);
  assert.equal(exactClaim.subjectId, fixtures.exactReservation);
  assert.equal(exactClaim.revision, 1);

  const receipt = await assertByLocator(
    client,
    exactClaim.workflowLocator,
    fixtures.tenantA,
    fixtures.exactReservation,
    1,
  );
  assertExactLocatorReceipt(receipt, {
    tenantId: fixtures.tenantA,
    subjectId: fixtures.exactReservation,
    workflowLocator: fixtures.exactReservation,
    revision: 1,
  });
  assertPiiFreeReceipt(receipt, [
    fixtures.exactEmail,
    fixtures.typeEmail,
    fixtures.raceEmail,
  ]);

  await expectSqlState("wrong tenant", EXPECTED_SQL_STATES.missing, () =>
    assertByLocator(
      client,
      fixtures.exactReservation,
      fixtures.tenantB,
      fixtures.exactReservation,
      1,
    ),
  );
  await expectSqlState("stale revision", EXPECTED_SQL_STATES.missing, () =>
    assertByLocator(
      client,
      fixtures.exactReservation,
      fixtures.tenantA,
      fixtures.exactReservation,
      2,
    ),
  );
  await expectSqlState("invalid locator", EXPECTED_SQL_STATES.invalid, () =>
    assertByLocator(
      client,
      "not-a-uuid",
      fixtures.tenantA,
      fixtures.exactReservation,
      1,
    ),
  );

  const typeClaim = await readClaim(client, fixtures.typeEmail);
  assert.equal(typeClaim.claim_type, "USER");
  assert.equal(typeClaim.subjectId, fixtures.typeUser);
  assert.equal(typeClaim.workflowLocator, fixtures.typeUser);
  assert.equal(typeClaim.revision, 2);
  await expectSqlState("wrong claim type", EXPECTED_SQL_STATES.missing, () =>
    assertByLocator(
      client,
      typeClaim.workflowLocator,
      fixtures.tenantA,
      fixtures.typeUser,
      2,
    ),
  );

  await expectSqlState(
    "direct locator mutation",
    EXPECTED_SQL_STATES.mismatch,
    () =>
      client.$executeRawUnsafe(
        `UPDATE public."IdentityEmailClaim"
         SET "workflowLocator" = $1
         WHERE "emailCanonical" = $2`,
        randomUUID(),
        fixtures.exactEmail,
      ),
  );
  const unchanged = await readClaim(client, fixtures.exactEmail);
  assert.equal(unchanged.workflowLocator, fixtures.exactReservation);
}

function deferred() {
  let resolvePromise;
  let rejectPromise;
  const promise = new Promise((resolveValue, rejectValue) => {
    resolvePromise = resolveValue;
    rejectPromise = rejectValue;
  });
  return {
    promise,
    resolve: resolvePromise,
    reject: rejectPromise,
  };
}

async function waitForAdvisoryWait(observer, backendPid) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const [row] = await observer.$queryRawUnsafe(
      `SELECT EXISTS (
         SELECT 1
         FROM pg_catalog.pg_locks
         WHERE pid = $1::integer
           AND locktype = 'advisory'
           AND NOT granted
       ) AS waiting`,
      backendPid,
    );
    if (row?.waiting === true) {
      return true;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 25));
  }
  return false;
}

async function runLockOrderRace(databaseUrl, fixtures) {
  const holder = prismaClient(databaseUrl);
  const waiter = prismaClient(databaseUrl);
  const observer = prismaClient(databaseUrl);
  const holderReady = deferred();
  const continueHolder = deferred();
  const waiterStarted = deferred();
  let holderPromise;
  let waiterPromise;
  try {
    holderPromise = holder.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = '10s'`);
        await tx.$queryRawUnsafe(
          `SELECT public."identity_email_claim_lock_v1"($1::text)`,
          fixtures.raceEmail,
        );
        holderReady.resolve();
        await continueHolder.promise;
        return transitionInvite(
          tx,
          fixtures.raceEmail,
          fixtures.tenantA,
          fixtures.raceReservation,
          1,
          "INVITE",
          fixtures.raceInvite,
        );
      },
      { maxWait: 5_000, timeout: 20_000 },
    );
    await holderReady.promise;

    waiterPromise = waiter.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = '10s'`);
        const [pid] = await tx.$queryRawUnsafe(
          `SELECT pg_catalog.pg_backend_pid() AS backend_pid`,
        );
        waiterStarted.resolve(pid.backend_pid);
        return assertByLocator(
          tx,
          fixtures.raceReservation,
          fixtures.tenantA,
          fixtures.raceReservation,
          1,
        );
      },
      { maxWait: 5_000, timeout: 20_000 },
    );

    const waiterBackendPid = await waiterStarted.promise;
    const observed = await waitForAdvisoryWait(observer, waiterBackendPid);
    assert.equal(
      observed,
      true,
      "Locator waiter was not observed on the canonical advisory lock.",
    );
    continueHolder.resolve();
    const transitionReceipt = await holderPromise;
    assert.equal(transitionReceipt?.decision, "TRANSITIONED");
    assert.equal(transitionReceipt?.revision, 2);
    const waiterFailure = await expectSqlState(
      "locator recheck after concurrent transition",
      EXPECTED_SQL_STATES.mismatch,
      () => waiterPromise,
    );
    assert.equal(waiterFailure.states.has("40P01"), false);
    assert.equal(waiterFailure.states.has("55P03"), false);

    const finalClaim = await readClaim(observer, fixtures.raceEmail);
    assert.equal(finalClaim.workflowLocator, fixtures.raceReservation);
    assert.equal(finalClaim.subjectId, fixtures.raceInvite);
    assert.equal(finalClaim.revision, 2);
    assert.equal(finalClaim.claim_type, "INVITE");
    return {
      waiterObservedOnAdvisoryLock: true,
      concurrentTransitionCommitted: true,
      staleLocatorRecheckSqlState: EXPECTED_SQL_STATES.mismatch,
      deadlockSqlStates: 0,
      locatorPreserved: true,
    };
  } finally {
    continueHolder.resolve();
    await Promise.allSettled([holderPromise, waiterPromise].filter(Boolean));
    await Promise.all([
      holder.$disconnect(),
      waiter.$disconnect(),
      observer.$disconnect(),
    ]);
  }
}

async function assertCleanBehavior(client, fixtures, runtimeContext) {
  await assertPost170Catalog(client);
  await createTenants(client, fixtures);
  const reserve = await reserveInvite(
    client,
    fixtures.cleanEmail,
    fixtures.tenantA,
    fixtures.cleanReservation,
  );
  assert.equal(reserve?.decision, "CREATED");
  const claim = await readClaim(client, fixtures.cleanEmail);
  assert.equal(claim.workflowLocator, fixtures.cleanReservation);
  assert.equal(claim.subjectId, fixtures.cleanReservation);

  const receipt = await assertByLocator(
    client,
    fixtures.cleanReservation,
    fixtures.tenantA,
    fixtures.cleanReservation,
    1,
  );
  assertExactLocatorReceipt(receipt, {
    tenantId: fixtures.tenantA,
    subjectId: fixtures.cleanReservation,
    workflowLocator: fixtures.cleanReservation,
    revision: 1,
  });
  assertPiiFreeReceipt(receipt, [fixtures.cleanEmail]);

  const role = quoteIdentifier(runtimeContext.roleName);
  await client.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO ${role}`);
  const runtime = prismaClient(runtimeContext.databaseUrl);
  runtimeContext.runtime = runtime;
  await expectSqlState(
    "pre-enrollment locator execute",
    EXPECTED_SQL_STATES.denied,
    () =>
      assertByLocator(
        runtime,
        fixtures.cleanReservation,
        fixtures.tenantA,
        fixtures.cleanReservation,
        1,
      ),
  );

  for (const statement of buildHistoricalCurrent170RuntimeEnrollmentStatements(
    runtimeContext.roleName,
  )) {
    await client.$executeRawUnsafe(statement);
  }
  const runtimeReceipt = await assertByLocator(
    runtime,
    fixtures.cleanReservation,
    fixtures.tenantA,
    fixtures.cleanReservation,
    1,
  );
  assertExactLocatorReceipt(runtimeReceipt, {
    tenantId: fixtures.tenantA,
    subjectId: fixtures.cleanReservation,
    workflowLocator: fixtures.cleanReservation,
    revision: 1,
  });
  assertPiiFreeReceipt(runtimeReceipt, [fixtures.cleanEmail]);
  await expectSqlState(
    "sealed claim table select",
    EXPECTED_SQL_STATES.denied,
    () =>
      runtime.$queryRawUnsafe(
        `SELECT "workflowLocator"
         FROM public."IdentityEmailClaim"`,
      ),
  );

  const [acl] = await client.$queryRawUnsafe(
    `SELECT
       pg_catalog.has_function_privilege(
         $1,
         function_object.oid,
         'EXECUTE'
       ) AS role_execute,
       pg_catalog.has_function_privilege(
         $1,
         function_object.oid,
         'EXECUTE WITH GRANT OPTION'
       ) AS role_grant_option,
       pg_catalog.has_function_privilege(
         'public',
         function_object.oid,
         'EXECUTE'
       ) AS public_execute,
       pg_catalog.has_table_privilege(
         $1,
         'public."IdentityEmailClaim"',
         'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
       ) AS any_table_privilege
     FROM pg_catalog.pg_proc AS function_object
     WHERE function_object.oid = pg_catalog.to_regprocedure(
       'public."identity_email_claim_assert_invite_locator_v1"(text,text,text,integer)'
     )`,
    runtimeContext.roleName,
  );
  assert.equal(acl?.role_execute, true);
  assert.equal(acl?.role_grant_option, false);
  assert.equal(acl?.public_execute, false);
  assert.equal(acl?.any_table_privilege, false);
  assert.equal(HISTORICAL_CURRENT_170_RUNTIME_FUNCTIONS.length, 7);
  return {
    preEnrollmentExecuteDenied: true,
    postEnrollmentExecuteAllowed: true,
    publicExecute: false,
    runtimeGrantOption: false,
    sealedTablePrivileges: 0,
    exactApplicationFunctionCount:
      HISTORICAL_CURRENT_170_RUNTIME_FUNCTIONS.length,
  };
}

function assertRealEnvironment(environment) {
  if (environment.NODE_ENV === "production") {
    contractError("PRODUCTION_ENVIRONMENT_REFUSED");
  }
  if (
    environment.IDENTITY_ACTIVATION_LOCATOR_UPGRADE_SMOKE_CONFIRM !==
    REQUIRED_CONFIRMATION
  ) {
    contractError("LOCATOR_UPGRADE_SMOKE_CONFIRMATION_REQUIRED");
  }
  return parseSafeSourceDatabaseUrl(environment.DATABASE_URL);
}

function expectOfflineFailure(operation) {
  let caught = null;
  try {
    operation();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught);
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
      "postgresql://postgres:postgres@127.0.0.1:5432/leetplus_ci?schema=private",
    ),
  );
  const names = generatedNames();
  assertSafeGeneratedDatabaseName(names.upgradeDatabaseName);
  assertSafeGeneratedDatabaseName(names.cleanDatabaseName);
  assertSafeGeneratedRuntimeRoleName(names.runtimeRoleName);
  expectOfflineFailure(() => assertSafeGeneratedDatabaseName("leetplus_ci"));
  expectOfflineFailure(() =>
    assertSafeGeneratedRuntimeRoleName("leetplus_runtime"),
  );
  assertSafeTempRoot(join(tmpdir(), `${TEMP_ROOT_PREFIX}deadbeef`));
  expectOfflineFailure(() => assertSafeTempRoot(tmpdir()));
  expectOfflineFailure(() =>
    assertRealEnvironment({
      NODE_ENV: "production",
      DATABASE_URL:
        "postgresql://postgres:postgres@127.0.0.1:5432/leetplus_ci?schema=public",
      IDENTITY_ACTIVATION_LOCATOR_UPGRADE_SMOKE_CONFIRM: REQUIRED_CONFIRMATION,
    }),
  );
  expectOfflineFailure(() =>
    assertRealEnvironment({
      NODE_ENV: "test",
      DATABASE_URL:
        "postgresql://postgres:postgres@127.0.0.1:5432/leetplus_ci?schema=public",
    }),
  );
  const plan = await readMigrationPlan();
  assert.equal(plan.prefixMigrations.length, 169);
  assert.equal(plan.prefixMigrations.at(-1), PREVIOUS_MIGRATION);
  assert.equal(plan.targetMigration, TARGET_MIGRATION);
  assert.equal(plan.allMigrations.length, 170);
  const historicalEnrollment =
    buildHistoricalCurrent170RuntimeEnrollmentStatements(names.runtimeRoleName);
  assert.equal(historicalEnrollment.length, 15);
  assert.equal(
    historicalEnrollment.some((statement) =>
      /IdentityOwnerInviteIssueCommand|IdentityMailOutbox|identity_owner_invite_issue_hold_v1/u.test(
        statement,
      ),
    ),
    false,
  );
  assert.equal(
    APPLICATION_RUNTIME_FUNCTIONS.some(
      (entry) =>
        entry.catalogSignature ===
        'public."identity_email_claim_assert_invite_locator_v1"(text,text,text,integer)',
    ),
    true,
  );
  process.stdout.write(
    `${JSON.stringify({
      script: SCRIPT_NAME,
      status: "PASS",
      mode: "SELF_TEST",
      prefixMigrationCount: plan.prefixMigrations.length,
      targetMigration: plan.targetMigration,
      cleanMigrationCount: plan.allMigrations.length,
      generatedDatabaseCount: 2,
      generatedRuntimeRoleCount: 1,
      destructiveSourceDatabaseActions: 0,
      locatorFunctionalScenarios: 7,
      deterministicConcurrencyScenarios: 1,
      aclPhases: 2,
    })}\n`,
  );
}

async function runRealSmoke(environment) {
  const { sourceUrl, databaseName: sourceDatabaseName } =
    assertRealEnvironment(environment);
  const migrationPlan = await readMigrationPlan();
  const { upgradeDatabaseName, cleanDatabaseName, runtimeRoleName } =
    generatedNames();
  const password = randomBytes(32).toString("hex");
  const sourceDatabaseUrl = databaseUrlFor(sourceUrl, sourceDatabaseName);
  const upgradeDatabaseUrl = databaseUrlFor(sourceUrl, upgradeDatabaseName);
  const cleanDatabaseUrl = databaseUrlFor(sourceUrl, cleanDatabaseName);
  const admin = prismaClient(sourceDatabaseUrl);
  let tempRoot;
  let clusterLockHeld = false;
  let upgradeDatabaseCreated = false;
  let cleanDatabaseCreated = false;
  let runtimeRoleCreated = false;
  let runtime = null;
  let primaryError;
  let evidence;
  const cleanupErrors = [];

  try {
    await assertTestSuperuser(admin, sourceDatabaseName);
    const sourceMigrationState = await readSourceMigrationState(admin);
    await acquireClusterLock(admin);
    clusterLockHeld = true;
    tempRoot = await mkdtemp(join(tmpdir(), TEMP_ROOT_PREFIX));
    assertSafeTempRoot(tempRoot);
    const artifact = await createMigrationArtifact(tempRoot, migrationPlan);

    await createDisposableDatabase(admin, upgradeDatabaseName);
    upgradeDatabaseCreated = true;
    await createDisposableDatabase(admin, cleanDatabaseName);
    cleanDatabaseCreated = true;
    runMigrateDeploy(artifact.schemaPath, upgradeDatabaseUrl);

    const fixtures = fixtureSet(randomBytes(5).toString("hex"));
    let upgrade = prismaClient(upgradeDatabaseUrl);
    try {
      await assertExactAppliedMigrations(
        upgrade,
        migrationPlan.prefixMigrations,
      );
      await assertPre170Catalog(upgrade);
      await createCurrent169Fixtures(upgrade, fixtures);
    } finally {
      await upgrade.$disconnect();
    }

    await addTargetMigrationToArtifact(artifact, migrationPlan);
    runMigrateDeploy(artifact.schemaPath, upgradeDatabaseUrl);
    runMigrateDeploy(artifact.schemaPath, cleanDatabaseUrl);

    upgrade = prismaClient(upgradeDatabaseUrl);
    try {
      await assertExactAppliedMigrations(upgrade, migrationPlan.allMigrations);
      await assertUpgradeBehavior(upgrade, fixtures);
    } finally {
      await upgrade.$disconnect();
    }
    const concurrencyEvidence = await runLockOrderRace(
      upgradeDatabaseUrl,
      fixtures,
    );

    await createRuntimeRole(admin, runtimeRoleName, password);
    runtimeRoleCreated = true;
    await grantRuntimeConnection(admin, cleanDatabaseName, runtimeRoleName);
    const clean = prismaClient(cleanDatabaseUrl);
    const cleanFixtures = fixtureSet(randomBytes(5).toString("hex"));
    const runtimeContext = {
      roleName: runtimeRoleName,
      databaseUrl: runtimeDatabaseUrl(
        sourceUrl,
        cleanDatabaseName,
        runtimeRoleName,
        password,
      ),
      runtime: null,
    };
    let aclEvidence;
    try {
      await assertExactAppliedMigrations(clean, migrationPlan.allMigrations);
      aclEvidence = await assertCleanBehavior(
        clean,
        cleanFixtures,
        runtimeContext,
      );
      runtime = runtimeContext.runtime;
    } finally {
      if (runtimeContext.runtime) {
        await runtimeContext.runtime.$disconnect();
        runtime = null;
      }
      await clean.$disconnect();
    }

    assert.deepEqual(
      await readSourceMigrationState(admin),
      sourceMigrationState,
      "The locator smoke changed the source database migration state.",
    );
    evidence = {
      script: SCRIPT_NAME,
      status: "PASS",
      postgresMajor: 16,
      upgrade: {
        fromMigration: PREVIOUS_MIGRATION,
        fromMigrationCount: 169,
        toMigration: TARGET_MIGRATION,
        toMigrationCount: 170,
        populatedClaims: 3,
        exactLocatorMatched: true,
        wrongTenantRejected: true,
        staleRevisionRejected: true,
        wrongTypeRejected: true,
        invalidLocatorRejected: true,
        directMutationRejected: true,
        receiptPiiFields: 0,
      },
      clean: {
        migrationCount: 170,
        reserveV2TriggerCompatibility: true,
        exactLocatorMatched: true,
        receiptPiiFields: 0,
      },
      concurrency: concurrencyEvidence,
      acl: aclEvidence,
      sourceDatabaseMigrationsApplied: 0,
    };
  } catch (error) {
    primaryError = error;
  } finally {
    if (runtime) {
      try {
        await runtime.$disconnect();
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (upgradeDatabaseCreated) {
      try {
        await dropDisposableDatabase(admin, upgradeDatabaseName);
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (cleanDatabaseCreated) {
      try {
        await dropDisposableDatabase(admin, cleanDatabaseName);
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (runtimeRoleCreated) {
      try {
        await dropRuntimeRole(admin, runtimeRoleName);
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
      "Locator smoke and cleanup both failed.",
    );
  }
  if (primaryError) {
    throw primaryError;
  }
  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, "Locator smoke cleanup failed.");
  }
  assert.ok(evidence);
  process.stdout.write(`${JSON.stringify(evidence)}\n`);
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
        code: error?.code ?? "IDENTITY_LOCATOR_UPGRADE_SMOKE_FAILED",
        message:
          typeof error?.message === "string"
            ? error.message
            : "Identity locator upgrade smoke failed.",
      },
    })}\n`,
  );
  process.exitCode = 1;
});

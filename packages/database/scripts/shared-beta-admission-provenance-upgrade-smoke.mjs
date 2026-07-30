import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import {
  cp,
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
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
  STAFF_TASK_FROZEN_PREFIX_COUNT,
  STAFF_TASK_FROZEN_PREFIX_LATEST,
} from "./staff-task-integrity-migration-state.mjs";

const SCRIPT_NAME =
  "shared-beta-admission-provenance-upgrade-smoke";
const REQUIRED_CONFIRMATION =
  "run-shared-beta-admission-provenance-upgrade-smoke";
const INNER_SMOKE_CONFIRMATION =
  "run-shared-beta-admission-provenance-smoke";
const TARGET_MIGRATION =
  "20260730020000_shared_beta_admission_provenance";
const PREVIOUS_MIGRATION =
  "20260730010000_identity_owner_invite_hold_outbox";
const MIGRATION_PATTERN = /^\d{14}_[a-z0-9_]+$/u;
const SAFE_SOURCE_DATABASE_PATTERN =
  /^[a-z0-9][a-z0-9_.-]{0,58}_ci$/iu;
const DATABASE_PREFIX = "lp_admission172_";
const UPGRADE_DATABASE_PATTERN =
  /^lp_admission172_upgrade_ci_[a-f0-9]{16}$/u;
const CLEAN_DATABASE_PATTERN =
  /^lp_admission172_clean_ci_[a-f0-9]{16}$/u;
const HOSTILE_DATABASE_PATTERN =
  /^lp_admission172_hostile_ci_[a-f0-9]{16}$/u;
const HOSTILE_ROLE_PATTERN =
  /^lp_admission172_hostile_acl_ci_[a-f0-9]{16}$/u;
const TEMP_ROOT_PREFIX =
  "leetplus-admission-provenance-upgrade-";
const COLUMN_ACL_INJECTOR_FUNCTION =
  "shared_beta_admission_column_acl_injector_ci_v1";
const COLUMN_ACL_INJECTOR_TRIGGER =
  "shared_beta_admission_column_acl_injector_ci_v1";
const MIGRATION_TIMEOUT_MS = 10 * 60 * 1_000;
const FUNCTIONAL_SMOKE_TIMEOUT_MS = 2 * 60 * 1_000;
const CLUSTER_LOCK_CLASS = 1_281_120_000;
const CLUSTER_LOCK_OBJECT = 172;
const SEALED_RELATIONS = Object.freeze([
  "ReleaseGateAttestation",
  "TenantAdmissionDecision",
  "TenantAdmissionDecisionGate",
]);
const SEALED_FUNCTIONS = Object.freeze([
  "shared_beta_release_gate_attestation_guard_v1",
  "shared_beta_tenant_admission_decision_guard_v1",
  "shared_beta_tenant_admission_gate_immutable_v1",
  "shared_beta_release_gate_attestation_persist_v1",
  "shared_beta_release_gate_attestation_revoke_v1",
  "shared_beta_tenant_profile_digest_v1",
  "shared_beta_tenant_admission_decision_create_v1",
  "shared_beta_tenant_admission_decision_assert_v1",
  "shared_beta_tenant_admission_decision_revoke_v1",
]);
const RELEASE_GATE_TYPE = "SharedBetaReleaseGateCode";

const HELP = `
${SCRIPT_NAME}

Local/CI-only PostgreSQL 16 rehearsal for CURRENT_171 -> CURRENT_172.
It creates three random databases from template0 and never migrates, templates,
or writes application rows in the source *_ci database.

The rehearsal proves:
  - an exact 172-migration clean deployment;
  - a populated exact CURRENT_171 -> CURRENT_172 upgrade;
  - signed gate/decision behavior through the dedicated functional smoke;
  - fail-closed rollback under hostile default TABLE/FUNCTION/TYPE ACLs;
  - fail-closed rollback under a hostile column ACL event injector;
  - safe retry after explicit rollback resolution;
  - owner-only enum/table/column/function ACLs and zero generated residue.

Usage:
  node scripts/${SCRIPT_NAME}.mjs
  node scripts/${SCRIPT_NAME}.mjs --self-test
  node scripts/${SCRIPT_NAME}.mjs --help

Required for the real smoke:
  DATABASE_URL
    PostgreSQL 16 on loopback, schema public, and a source database whose
    validated name ends in _ci. The connected role must be a test superuser.
  SHARED_BETA_ADMISSION_PROVENANCE_UPGRADE_SMOKE_CONFIRM
    Must equal: ${REQUIRED_CONFIRMATION}

Safety:
  - NODE_ENV=production is rejected.
  - The source database is never migrated or used as a template.
  - Only exact generated database/role names may be created or removed.
  - Generated databases are always force-dropped in finally.
  - The generated hostile role and validated temporary artifact are always
    removed in finally, including after an expected or unexpected failure.
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
  if (argv.some((argument) => !supported.has(argument))) {
    contractError("CLI_ARGUMENT_UNSUPPORTED");
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
  const hostname = sourceUrl.hostname
    .toLowerCase()
    .replace(/^\[|\]$/gu, "");
  if (!new Set(["127.0.0.1", "localhost", "::1"]).has(hostname)) {
    contractError("LOOPBACK_POSTGRESQL_REQUIRED");
  }
  const databaseName = decodeURIComponent(
    sourceUrl.pathname.replace(/^\/+/u, ""),
  );
  if (
    !SAFE_SOURCE_DATABASE_PATTERN.test(databaseName) ||
    UPGRADE_DATABASE_PATTERN.test(databaseName) ||
    CLEAN_DATABASE_PATTERN.test(databaseName) ||
    HOSTILE_DATABASE_PATTERN.test(databaseName)
  ) {
    contractError("DEDICATED_SOURCE_CI_DATABASE_REQUIRED");
  }
  if (
    [...sourceUrl.searchParams.keys()].some(
      (parameter) => parameter !== "schema",
    ) ||
    (sourceUrl.searchParams.has("schema") &&
      sourceUrl.searchParams.get("schema") !== "public")
  ) {
    contractError("ONLY_PUBLIC_SCHEMA_PARAMETER_ALLOWED");
  }
  return { databaseName, hostname, sourceUrl };
}

function databaseUrlFor(sourceUrl, databaseName) {
  const target = new URL(sourceUrl);
  target.pathname = `/${databaseName}`;
  target.searchParams.set("schema", "public");
  target.searchParams.set("connection_limit", "1");
  target.searchParams.set("connect_timeout", "5");
  target.searchParams.set("pool_timeout", "5");
  return target.toString();
}

function generatedNames() {
  const suffix = randomBytes(8).toString("hex");
  const names = {
    cleanDatabaseName:
      `${DATABASE_PREFIX}clean_ci_${suffix}`,
    hostileDatabaseName:
      `${DATABASE_PREFIX}hostile_ci_${suffix}`,
    hostileRoleName:
      `${DATABASE_PREFIX}hostile_acl_ci_${suffix}`,
    upgradeDatabaseName:
      `${DATABASE_PREFIX}upgrade_ci_${suffix}`,
  };
  assert.match(names.cleanDatabaseName, CLEAN_DATABASE_PATTERN);
  assert.match(names.hostileDatabaseName, HOSTILE_DATABASE_PATTERN);
  assert.match(names.hostileRoleName, HOSTILE_ROLE_PATTERN);
  assert.match(names.upgradeDatabaseName, UPGRADE_DATABASE_PATTERN);
  assert.equal(
    new Set([
      names.cleanDatabaseName,
      names.hostileDatabaseName,
      names.upgradeDatabaseName,
    ]).size,
    3,
  );
  return names;
}

function assertSafeGeneratedDatabaseName(databaseName) {
  if (
    !UPGRADE_DATABASE_PATTERN.test(databaseName) &&
    !CLEAN_DATABASE_PATTERN.test(databaseName) &&
    !HOSTILE_DATABASE_PATTERN.test(databaseName)
  ) {
    contractError("GENERATED_DATABASE_NAME_INVALID");
  }
}

function assertSafeGeneratedRoleName(roleName) {
  if (!HOSTILE_ROLE_PATTERN.test(roleName)) {
    contractError("GENERATED_ROLE_NAME_INVALID");
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
  const sourcePrismaDir = fileURLToPath(
    new URL("../prisma/", import.meta.url),
  );
  const migrationDirectories = (
    await readdir(join(sourcePrismaDir, "migrations"), {
      withFileTypes: true,
    })
  )
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert(
    migrationDirectories.every((name) =>
      MIGRATION_PATTERN.test(name),
    ),
    "Migration directory names must match the release contract.",
  );
  assert.equal(
    migrationDirectories.length,
    CURRENT_EXPECTED_MIGRATION_COUNT,
  );
  assert.equal(
    migrationDirectories[STAFF_TASK_FROZEN_PREFIX_COUNT - 1],
    STAFF_TASK_FROZEN_PREFIX_LATEST,
  );
  assert.deepEqual(
    migrationDirectories.slice(STAFF_TASK_FROZEN_PREFIX_COUNT),
    [...STAFF_TASK_ALLOWED_ADDITIVE_TAIL],
  );
  assert.equal(
    migrationDirectories.at(-1),
    CURRENT_EXPECTED_LATEST_MIGRATION,
  );
  assert.equal(CURRENT_EXPECTED_LATEST_MIGRATION, TARGET_MIGRATION);
  assert.equal(STAFF_TASK_CURRENT_RELEASE_STATE, "CURRENT_172");
  const targetIndex = migrationDirectories.indexOf(TARGET_MIGRATION);
  assert.equal(targetIndex, 171);
  assert.equal(
    migrationDirectories[targetIndex - 1],
    PREVIOUS_MIGRATION,
  );
  return {
    allMigrations: migrationDirectories,
    prefixMigrations: migrationDirectories.slice(0, targetIndex),
    sourcePrismaDir,
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
    join(
      migrationPlan.sourcePrismaDir,
      "migrations",
      "migration_lock.toml",
    ),
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

async function addTargetMigration(artifact, migrationPlan) {
  await cp(
    join(
      migrationPlan.sourcePrismaDir,
      "migrations",
      migrationPlan.targetMigration,
    ),
    join(
      artifact.targetMigrationsDir,
      migrationPlan.targetMigration,
    ),
    { recursive: true },
  );
}

function prismaCliInvocation(
  schemaPath,
  databaseUrl,
  cliArguments,
  timeout = MIGRATION_TIMEOUT_MS,
) {
  const require = createRequire(import.meta.url);
  const prismaCliPath = require.resolve("prisma/build/index.js");
  return spawnSync(
    process.execPath,
    [
      prismaCliPath,
      "migrate",
      ...cliArguments,
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
        PGOPTIONS:
          "-c lock_timeout=5000 -c statement_timeout=120000",
        PRISMA_HIDE_UPDATE_MESSAGE: "true",
      },
      maxBuffer: 8 * 1024 * 1_024,
      shell: false,
      timeout,
      windowsHide: true,
    },
  );
}

function runMigrateDeploy(schemaPath, databaseUrl) {
  const result = prismaCliInvocation(
    schemaPath,
    databaseUrl,
    ["deploy"],
  );
  if (result.error || result.status !== 0) {
    contractError(
      "MIGRATION_DEPLOY_FAILED",
      "Prisma migration deploy failed; raw output is suppressed.",
    );
  }
}

function expectMigrateDeployFailure(schemaPath, databaseUrl) {
  const result = prismaCliInvocation(
    schemaPath,
    databaseUrl,
    ["deploy"],
  );
  assert.equal(
    result.error,
    undefined,
    "Expected migration failure must not be a process failure.",
  );
  assert.notEqual(
    result.status,
    0,
    "Hostile ACL migration unexpectedly succeeded.",
  );
}

function runMigrateResolveRolledBack(
  schemaPath,
  databaseUrl,
  migrationName,
) {
  assert.equal(migrationName, TARGET_MIGRATION);
  const result = prismaCliInvocation(
    schemaPath,
    databaseUrl,
    ["resolve", "--rolled-back", migrationName],
  );
  if (result.error || result.status !== 0) {
    contractError(
      "MIGRATION_RESOLVE_FAILED",
      "Prisma rollback resolution failed; raw output is suppressed.",
    );
  }
}

function runFunctionalSmoke(databaseUrl, phase) {
  assert(new Set(["clean", "upgrade"]).has(phase));
  const functionalDatabaseUrl = new URL(databaseUrl);
  functionalDatabaseUrl.search = "";
  functionalDatabaseUrl.searchParams.set("schema", "public");
  const smokePath = fileURLToPath(
    new URL(
      "./shared-beta-admission-provenance-smoke.mjs",
      import.meta.url,
    ),
  );
  const result = spawnSync(process.execPath, [smokePath], {
    cwd: dirname(smokePath),
    encoding: "utf8",
    env: {
      ...process.env,
      DATABASE_URL: functionalDatabaseUrl.toString(),
      NODE_ENV: "test",
      SHARED_BETA_ADMISSION_PROVENANCE_SMOKE_CONFIRM:
        INNER_SMOKE_CONFIRMATION,
    },
    maxBuffer: 4 * 1024 * 1_024,
    shell: false,
    timeout: FUNCTIONAL_SMOKE_TIMEOUT_MS,
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    const sqlState =
      result.stderr.match(/Code: `([0-9A-Z]{5})`/u)?.[1] ??
      "unknown";
    const sourceLine =
      result.stderr.match(
        /shared-beta-admission-provenance-smoke\.mjs:(\d+):/u,
      )?.[1] ?? "unknown";
    contractError(
      "FUNCTIONAL_SMOKE_FAILED",
      `Admission ${phase} functional smoke failed at inner line ` +
        `${sourceLine} with SQLSTATE ${sqlState}; raw output is suppressed.`,
    );
  }
  const output = result.stdout.trim().split(/\r?\n/u).at(-1);
  let evidence;
  try {
    evidence = JSON.parse(output);
  } catch {
    contractError("FUNCTIONAL_SMOKE_OUTPUT_INVALID");
  }
  assert.equal(evidence.status, "PASS");
  assert.equal(evidence.migrationCount, 172);
  assert.equal(evidence.migrationHead, TARGET_MIGRATION);
  assert.equal(evidence.signedGates, 3);
  assert.equal(evidence.signedDecisions, 1);
  assert.equal(evidence.requestCollisionRejected, true);
  assert.equal(evidence.wrongGateBindingRejected, true);
  assert.equal(evidence.bindingDriftRejections, 16);
  assert.equal(evidence.profileBooleanDriftRejected, true);
  assert.equal(evidence.profileWindowDriftRejected, true);
  assert.equal(evidence.executionRevisionDriftRejected, true);
  assert.equal(evidence.preIssueReservationAsserted, true);
  assert.equal(evidence.issuedHoldAsserted, true);
  assert.equal(evidence.missingIssueAggregateRejected, true);
  assert.equal(evidence.tamperedIssueAggregateRejected, true);
  assert.equal(evidence.issueBeforeRecheckOrderingVerified, true);
  assert.equal(evidence.lateGateInsertRejected, true);
  assert.equal(evidence.createIssueRaceSerialized, true);
  assert.equal(evidence.approverDemotionRaceSerialized, true);
  assert.equal(evidence.decisionRevokeTimestampRebased, true);
  assert.equal(evidence.gateRevokeTimestampRebased, true);
  assert.equal(evidence.claimTransitionRaceSerialized, true);
  assert.equal(evidence.consumedDecisions, 0);
  assert.equal(evidence.nonHoldOutbox, 0);
  assert.equal(evidence.publicPrivileges, 0);
  return Object.freeze({
    bindingDriftRejections: evidence.bindingDriftRejections,
    consumedDecisions: evidence.consumedDecisions,
    decisionRevocationCAS: evidence.decisionRevocationCAS,
    exactAssertion: evidence.exactAssertion,
    executionRevisionDriftRejected:
      evidence.executionRevisionDriftRejected,
    gateRevocationCAS: evidence.gateRevocationCAS,
    idempotentReplay: evidence.idempotentReplay,
    preIssueReservationAsserted:
      evidence.preIssueReservationAsserted,
    issuedHoldAsserted: evidence.issuedHoldAsserted,
    missingIssueAggregateRejected:
      evidence.missingIssueAggregateRejected,
    tamperedIssueAggregateRejected:
      evidence.tamperedIssueAggregateRejected,
    issueBeforeRecheckOrderingVerified:
      evidence.issueBeforeRecheckOrderingVerified,
    lateGateInsertRejected:
      evidence.lateGateInsertRejected,
    createIssueRaceSerialized:
      evidence.createIssueRaceSerialized,
    approverDemotionRaceSerialized:
      evidence.approverDemotionRaceSerialized,
    decisionRevokeTimestampRebased:
      evidence.decisionRevokeTimestampRebased,
    gateRevokeTimestampRebased:
      evidence.gateRevokeTimestampRebased,
    claimTransitionRaceSerialized:
      evidence.claimTransitionRaceSerialized,
    nonHoldOutbox: evidence.nonHoldOutbox,
    profileBooleanDriftRejected:
      evidence.profileBooleanDriftRejected,
    profileWindowDriftRejected:
      evidence.profileWindowDriftRejected,
    requestCollisionRejected: evidence.requestCollisionRejected,
    signedDecisions: evidence.signedDecisions,
    signedGates: evidence.signedGates,
    wrongGateBindingRejected: evidence.wrongGateBindingRejected,
  });
}

async function assertTestSuperuser(admin, expectedDatabaseName) {
  const [row] = await admin.$queryRawUnsafe(
    `SELECT
       current_database() AS database_name,
       current_setting('server_version_num')::INTEGER
         AS server_version_number,
       role.rolsuper AS is_superuser
     FROM pg_catalog.pg_roles AS role
     WHERE role.rolname = CURRENT_USER`,
  );
  assert.equal(row?.database_name, expectedDatabaseName);
  assert.equal(
    Math.trunc(Number(row?.server_version_number) / 10_000),
    16,
    "The admission upgrade smoke requires PostgreSQL 16.",
  );
  assert.equal(
    row?.is_superuser,
    true,
    "The admission upgrade smoke requires a test superuser.",
  );
}

async function acquireClusterLock(admin) {
  const [row] = await admin.$queryRawUnsafe(
    `SELECT pg_catalog.pg_try_advisory_lock(
       $1::INTEGER,
       $2::INTEGER
     ) AS acquired`,
    CLUSTER_LOCK_CLASS,
    CLUSTER_LOCK_OBJECT,
  );
  assert.equal(
    row?.acquired,
    true,
    "Another admission provenance upgrade smoke is running.",
  );
}

async function releaseClusterLock(admin) {
  const [row] = await admin.$queryRawUnsafe(
    `SELECT pg_catalog.pg_advisory_unlock(
       $1::INTEGER,
       $2::INTEGER
     ) AS released`,
    CLUSTER_LOCK_CLASS,
    CLUSTER_LOCK_OBJECT,
  );
  assert.equal(row?.released, true);
}

async function createDatabase(admin, databaseName) {
  assertSafeGeneratedDatabaseName(databaseName);
  await admin.$executeRawUnsafe(
    `CREATE DATABASE ${quoteIdentifier(
      databaseName,
    )} TEMPLATE template0`,
  );
}

async function dropDatabase(admin, databaseName) {
  assertSafeGeneratedDatabaseName(databaseName);
  await admin.$executeRawUnsafe(
    `DROP DATABASE IF EXISTS ${quoteIdentifier(
      databaseName,
    )} WITH (FORCE)`,
  );
}

async function createHostileRole(admin, roleName) {
  assertSafeGeneratedRoleName(roleName);
  await admin.$executeRawUnsafe(
    `CREATE ROLE ${quoteIdentifier(roleName)}
       NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
       NOREPLICATION NOBYPASSRLS`,
  );
}

async function dropHostileRole(admin, roleName) {
  assertSafeGeneratedRoleName(roleName);
  await admin.$executeRawUnsafe(
    `DROP ROLE IF EXISTS ${quoteIdentifier(roleName)}`,
  );
}

async function readMigrationNames(client) {
  const relation = await client.$queryRawUnsafe(
    `SELECT pg_catalog.to_regclass(
       'public."_prisma_migrations"'
     )::TEXT AS relation_name`,
  );
  if (relation[0]?.relation_name === null) return [];
  const rows = await client.$queryRawUnsafe(
    `SELECT "migration_name"
     FROM public."_prisma_migrations"
     WHERE "finished_at" IS NOT NULL
       AND "rolled_back_at" IS NULL
     ORDER BY "migration_name"`,
  );
  return rows.map((row) => row.migration_name);
}

async function assertAppliedMigrations(client, expected) {
  assert.deepEqual(await readMigrationNames(client), expected);
  const [state] = await client.$queryRawUnsafe(
    `SELECT pg_catalog.count(*) FILTER (
       WHERE "finished_at" IS NULL
         AND "rolled_back_at" IS NULL
     )::INTEGER AS unfinished_count
     FROM public."_prisma_migrations"`,
  );
  assert.equal(state?.unfinished_count, 0);
}

async function assertPre172Catalog(client) {
  const [state] = await client.$queryRawUnsafe(
    `SELECT
       pg_catalog.count(*) FILTER (
         WHERE relation.relname = ANY($1::TEXT[])
       )::INTEGER AS relation_count,
       (
         SELECT pg_catalog.count(*)::INTEGER
         FROM pg_catalog.pg_proc AS procedure
         INNER JOIN pg_catalog.pg_namespace AS namespace
           ON namespace.oid = procedure.pronamespace
         WHERE namespace.nspname = 'public'
           AND procedure.proname = ANY($2::TEXT[])
       ) AS function_count,
       (
         SELECT pg_catalog.count(*)::INTEGER
         FROM pg_catalog.pg_type AS type
         INNER JOIN pg_catalog.pg_namespace AS namespace
           ON namespace.oid = type.typnamespace
         WHERE namespace.nspname = 'public'
           AND type.typname = $3
       ) AS type_count
     FROM pg_catalog.pg_class AS relation
     INNER JOIN pg_catalog.pg_namespace AS namespace
       ON namespace.oid = relation.relnamespace
     WHERE namespace.nspname = 'public'`,
    SEALED_RELATIONS,
    SEALED_FUNCTIONS,
    RELEASE_GATE_TYPE,
  );
  assert.deepEqual(state, {
    function_count: 0,
    relation_count: 0,
    type_count: 0,
  });
}

async function createCurrent171Fixture(client) {
  const fixture = {
    adminId: randomUUID(),
    claimSubjectId: randomUUID(),
    email: `admission-upgrade-${randomUUID()}@example.invalid`,
    tenantId: randomUUID(),
  };
  fixture.slug = `admission-upgrade-${fixture.tenantId}`;
  await client.$executeRawUnsafe(
    `INSERT INTO public."Tenant" (
       "id",
       "name",
       "slug",
       "status",
       "customerStage",
       "onboardingStatus",
       "entitlementProfileRevision",
       "executionRevision",
       "createdAt",
       "updatedAt"
     )
     VALUES (
       $1,
       'Admission CURRENT_171 fixture',
       $2,
       'SUSPENDED',
       'PILOT',
       'PROVISIONING',
       1,
       0,
       CURRENT_TIMESTAMP,
       CURRENT_TIMESTAMP
     )`,
    fixture.tenantId,
    fixture.slug,
  );
  await client.$executeRawUnsafe(
    `INSERT INTO public."User" (
       "id",
       "tenantId",
       "email",
       "passwordHash",
       "role",
       "accessScope",
       "isActive",
       "isPlatformAdmin",
       "createdAt",
       "updatedAt"
     )
     VALUES (
       $1,
       $2,
       $3,
       'synthetic-not-a-login',
       'OWNER',
       'NETWORK',
       true,
       true,
       CURRENT_TIMESTAMP,
       CURRENT_TIMESTAMP
     )`,
    fixture.adminId,
    fixture.tenantId,
    fixture.email,
  );
  await client.$executeRawUnsafe(
    `INSERT INTO public."IdentityEmailClaim" (
       "emailCanonical",
       "claimType",
       "tenantId",
       "subjectId",
       "workflowLocator",
       "revision",
       "createdAt",
       "updatedAt"
     )
     VALUES (
       $1,
       'INVITE',
       $2,
       $3,
       $3,
       1,
       CURRENT_TIMESTAMP,
       CURRENT_TIMESTAMP
     )`,
    fixture.email,
    fixture.tenantId,
    fixture.claimSubjectId,
  );
  await client.$executeRawUnsafe(
    `INSERT INTO public."TenantModuleEntitlement" (
       "id",
       "tenantId",
       "module",
       "readEnabled",
       "writeEnabled",
       "outboundEnabled",
       "validFrom",
       "validUntil",
       "profileRevision",
       "reason",
       "createdAt",
       "updatedAt"
     )
     SELECT
       pg_catalog.gen_random_uuid()::TEXT,
       $1,
       module,
       true,
       true,
       false,
       NULL,
       NULL,
       1,
       'CURRENT_171 upgrade fixture',
       CURRENT_TIMESTAMP,
       CURRENT_TIMESTAMP
     FROM pg_catalog.unnest(
       ARRAY[
         'GAMIFICATION',
         'ASSORTMENT',
         'STAFF',
         'COMMUNICATIONS',
         'USERS_ROLES',
         'INTEGRATIONS'
       ]::public."TenantModule"[]
     ) AS module`,
    fixture.tenantId,
  );
  return fixture;
}

async function assertCurrent171FixturePreserved(client, fixture) {
  const [state] = await client.$queryRawUnsafe(
    `SELECT
       (
         SELECT pg_catalog.count(*)::INTEGER
         FROM public."Tenant" AS tenant
         WHERE tenant."id" = $1
           AND tenant."slug" = $2
           AND tenant."status" = 'SUSPENDED'
           AND tenant."entitlementProfileRevision" = 1
           AND tenant."executionRevision" = 0
       ) AS tenant_count,
       (
         SELECT pg_catalog.count(*)::INTEGER
         FROM public."User" AS user_record
         WHERE user_record."id" = $3
           AND user_record."tenantId" = $1
           AND user_record."email" = $4
           AND user_record."isActive"
           AND user_record."isPlatformAdmin"
       ) AS admin_count,
       (
         SELECT pg_catalog.count(*)::INTEGER
         FROM public."IdentityEmailClaim" AS claim
         WHERE claim."emailCanonical" = $4
           AND claim."tenantId" = $1
           AND claim."subjectId" = $5
           AND claim."workflowLocator" = $5
           AND claim."claimType" = 'INVITE'
           AND claim."revision" = 1
       ) AS claim_count,
       (
         SELECT pg_catalog.count(*)::INTEGER
         FROM public."TenantModuleEntitlement" AS entitlement
         WHERE entitlement."tenantId" = $1
           AND entitlement."profileRevision" = 1
           AND entitlement."readEnabled"
           AND entitlement."writeEnabled"
           AND NOT entitlement."outboundEnabled"
       ) AS entitlement_count`,
    fixture.tenantId,
    fixture.slug,
    fixture.adminId,
    fixture.email,
    fixture.claimSubjectId,
  );
  assert.deepEqual(state, {
    admin_count: 1,
    claim_count: 1,
    entitlement_count: 6,
    tenant_count: 1,
  });
}

async function setUnsafeDefaultPrivileges(
  client,
  roleName,
  enabled,
) {
  assertSafeGeneratedRoleName(roleName);
  const role = quoteIdentifier(roleName);
  const action = enabled ? "GRANT" : "REVOKE";
  const direction = enabled ? "TO" : "FROM";
  await client.$executeRawUnsafe(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public
     ${action} SELECT ON TABLES ${direction} ${role}`,
  );
  await client.$executeRawUnsafe(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public
     ${action} EXECUTE ON FUNCTIONS ${direction} ${role}`,
  );
  await client.$executeRawUnsafe(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public
     ${action} USAGE ON TYPES ${direction} ${role}`,
  );
}

async function assertUnsafeDefaultPrivileges(
  client,
  roleName,
  expected,
) {
  assertSafeGeneratedRoleName(roleName);
  const rows = await client.$queryRawUnsafe(
    `SELECT
       defaults.defaclobjtype::TEXT AS object_type,
       privilege.privilege_type
     FROM pg_catalog.pg_default_acl AS defaults
     INNER JOIN pg_catalog.pg_namespace AS namespace
       ON namespace.oid = defaults.defaclnamespace
     CROSS JOIN LATERAL pg_catalog.aclexplode(
       defaults.defaclacl
     ) AS privilege
     INNER JOIN pg_catalog.pg_roles AS grantee
       ON grantee.oid = privilege.grantee
     WHERE namespace.nspname = 'public'
       AND defaults.defaclrole = (
         SELECT role.oid
         FROM pg_catalog.pg_roles AS role
         WHERE role.rolname = CURRENT_USER
       )
       AND grantee.rolname = $1
     ORDER BY defaults.defaclobjtype, privilege.privilege_type`,
    roleName,
  );
  assert.deepEqual(
    rows.map(
      (row) => `${row.object_type}:${row.privilege_type}`,
    ),
    expected ? ["T:USAGE", "f:EXECUTE", "r:SELECT"] : [],
  );
}

async function installUnsafeColumnAclInjector(client, roleName) {
  assertSafeGeneratedRoleName(roleName);
  const role = quoteIdentifier(roleName);
  await client.$executeRawUnsafe(
    `CREATE FUNCTION public.${quoteIdentifier(
      COLUMN_ACL_INJECTOR_FUNCTION,
    )}()
     RETURNS event_trigger
     LANGUAGE plpgsql
     SECURITY DEFINER
     SET search_path = pg_catalog
     AS $column_acl_injector$
     BEGIN
       IF EXISTS (
         SELECT 1
         FROM pg_catalog.pg_event_trigger_ddl_commands() AS command
         INNER JOIN pg_catalog.pg_class AS relation
           ON relation.oid = command.objid
         INNER JOIN pg_catalog.pg_namespace AS namespace
           ON namespace.oid = relation.relnamespace
         WHERE namespace.nspname = 'public'
           AND relation.relname = 'ReleaseGateAttestation'
           AND relation.relkind = 'r'
       ) THEN
         EXECUTE
           'GRANT SELECT ("payloadDigest") ON TABLE ' ||
           'public."ReleaseGateAttestation" TO ${role}';
       END IF;
     END;
     $column_acl_injector$`,
  );
  await client.$executeRawUnsafe(
    `CREATE EVENT TRIGGER ${quoteIdentifier(
      COLUMN_ACL_INJECTOR_TRIGGER,
    )}
     ON ddl_command_end
     WHEN TAG IN ('CREATE TABLE')
     EXECUTE FUNCTION public.${quoteIdentifier(
       COLUMN_ACL_INJECTOR_FUNCTION,
     )}()`,
  );
}

async function assertUnsafeColumnAclInjector(client, expected) {
  const [state] = await client.$queryRawUnsafe(
    `SELECT
       (
         SELECT pg_catalog.count(*)::INTEGER
         FROM pg_catalog.pg_event_trigger AS event
         WHERE event.evtname = $1
           AND event.evtenabled = 'O'
       ) AS trigger_count,
       (
         SELECT pg_catalog.count(*)::INTEGER
         FROM pg_catalog.pg_proc AS procedure
         INNER JOIN pg_catalog.pg_namespace AS namespace
           ON namespace.oid = procedure.pronamespace
         WHERE namespace.nspname = 'public'
           AND procedure.proname = $2
       ) AS function_count`,
    COLUMN_ACL_INJECTOR_TRIGGER,
    COLUMN_ACL_INJECTOR_FUNCTION,
  );
  assert.deepEqual(state, {
    function_count: expected ? 1 : 0,
    trigger_count: expected ? 1 : 0,
  });
}

async function dropUnsafeColumnAclInjector(client) {
  await client.$executeRawUnsafe(
    `DROP EVENT TRIGGER IF EXISTS ${quoteIdentifier(
      COLUMN_ACL_INJECTOR_TRIGGER,
    )}`,
  );
  await client.$executeRawUnsafe(
    `DROP FUNCTION IF EXISTS public.${quoteIdentifier(
      COLUMN_ACL_INJECTOR_FUNCTION,
    )}()`,
  );
}

async function assertTargetMigrationRolledBack(
  client,
  migrationPlan,
) {
  assert.deepEqual(
    await readMigrationNames(client),
    migrationPlan.prefixMigrations,
  );
  const [state] = await client.$queryRawUnsafe(
    `SELECT
       (
         SELECT pg_catalog.count(*)::INTEGER
         FROM public."_prisma_migrations"
         WHERE "migration_name" = $1
           AND "finished_at" IS NULL
           AND "rolled_back_at" IS NULL
       ) AS unresolved_failure_count,
       (
         SELECT pg_catalog.count(*)::INTEGER
         FROM pg_catalog.pg_class AS relation
         INNER JOIN pg_catalog.pg_namespace AS namespace
           ON namespace.oid = relation.relnamespace
         WHERE namespace.nspname = 'public'
           AND relation.relname = ANY($2::TEXT[])
       ) AS relation_count,
       (
         SELECT pg_catalog.count(*)::INTEGER
         FROM pg_catalog.pg_proc AS procedure
         INNER JOIN pg_catalog.pg_namespace AS namespace
           ON namespace.oid = procedure.pronamespace
         WHERE namespace.nspname = 'public'
           AND procedure.proname = ANY($3::TEXT[])
       ) AS function_count,
       (
         SELECT pg_catalog.count(*)::INTEGER
         FROM pg_catalog.pg_type AS type
         INNER JOIN pg_catalog.pg_namespace AS namespace
           ON namespace.oid = type.typnamespace
         WHERE namespace.nspname = 'public'
           AND type.typname = $4
       ) AS type_count`,
    TARGET_MIGRATION,
    SEALED_RELATIONS,
    SEALED_FUNCTIONS,
    RELEASE_GATE_TYPE,
  );
  assert.deepEqual(state, {
    function_count: 0,
    relation_count: 0,
    type_count: 0,
    unresolved_failure_count: 1,
  });
}

async function assertSealedCatalog(client) {
  const [inventory] = await client.$queryRawUnsafe(
    `WITH target_relation AS (
       SELECT relation.oid, relation.relname, relation.relowner
       FROM pg_catalog.pg_class AS relation
       INNER JOIN pg_catalog.pg_namespace AS namespace
         ON namespace.oid = relation.relnamespace
       WHERE namespace.nspname = 'public'
         AND relation.relkind = 'r'
         AND relation.relname = ANY($1::TEXT[])
     ),
     target_function AS (
       SELECT procedure.oid, procedure.proowner
       FROM pg_catalog.pg_proc AS procedure
       INNER JOIN pg_catalog.pg_namespace AS namespace
         ON namespace.oid = procedure.pronamespace
       WHERE namespace.nspname = 'public'
         AND procedure.proname = ANY($2::TEXT[])
     ),
     target_type AS (
       SELECT type.oid, type.typowner, type.typacl
       FROM pg_catalog.pg_type AS type
       INNER JOIN pg_catalog.pg_namespace AS namespace
         ON namespace.oid = type.typnamespace
       WHERE namespace.nspname = 'public'
         AND type.typname = $3
         AND type.typtype = 'e'
     ),
     database_owner AS (
       SELECT database.datdba AS owner_oid
       FROM pg_catalog.pg_database AS database
       WHERE database.datname = current_database()
     ),
     unsafe_acl AS (
       SELECT relation.oid
       FROM target_relation AS relation
       INNER JOIN pg_catalog.pg_class AS actual
         ON actual.oid = relation.oid
       CROSS JOIN LATERAL pg_catalog.aclexplode(
         COALESCE(
           actual.relacl,
           pg_catalog.acldefault('r', actual.relowner)
         )
       ) AS privilege
       WHERE privilege.grantee <> actual.relowner

       UNION ALL

       SELECT attribute.attrelid
       FROM pg_catalog.pg_attribute AS attribute
       INNER JOIN target_relation AS relation
         ON relation.oid = attribute.attrelid
       CROSS JOIN LATERAL pg_catalog.aclexplode(
         attribute.attacl
       ) AS privilege
       WHERE attribute.attnum > 0
         AND NOT attribute.attisdropped
         AND privilege.grantee <> relation.relowner

       UNION ALL

       SELECT procedure.oid
       FROM target_function AS procedure
       INNER JOIN pg_catalog.pg_proc AS actual
         ON actual.oid = procedure.oid
       CROSS JOIN LATERAL pg_catalog.aclexplode(
         COALESCE(
           actual.proacl,
           pg_catalog.acldefault('f', actual.proowner)
         )
       ) AS privilege
       WHERE privilege.grantee <> actual.proowner

       UNION ALL

       SELECT type.oid
       FROM target_type AS type
       CROSS JOIN LATERAL pg_catalog.aclexplode(
         COALESCE(
           type.typacl,
           pg_catalog.acldefault('T', type.typowner)
         )
       ) AS privilege
       WHERE privilege.grantee <> type.typowner
     )
     SELECT
       (SELECT pg_catalog.count(*)::INTEGER FROM target_relation)
         AS relation_count,
       (
         SELECT pg_catalog.count(*)::INTEGER
         FROM pg_catalog.pg_attribute AS attribute
         INNER JOIN target_relation AS relation
           ON relation.oid = attribute.attrelid
         WHERE attribute.attnum > 0
           AND NOT attribute.attisdropped
       ) AS column_count,
       (
         SELECT pg_catalog.count(*)::INTEGER
         FROM pg_catalog.pg_constraint AS constraint_record
         INNER JOIN target_relation AS relation
           ON relation.oid = constraint_record.conrelid
       ) AS constraint_count,
       (
         SELECT pg_catalog.count(*)::INTEGER
         FROM pg_catalog.pg_index AS index_record
         INNER JOIN target_relation AS relation
           ON relation.oid = index_record.indrelid
         WHERE NOT index_record.indisprimary
       ) AS index_count,
       (SELECT pg_catalog.count(*)::INTEGER FROM target_function)
         AS function_count,
       (SELECT pg_catalog.count(*)::INTEGER FROM target_type)
         AS type_count,
       (
         SELECT pg_catalog.count(*)::INTEGER
         FROM pg_catalog.pg_enum AS enum_record
         INNER JOIN target_type AS type
           ON type.oid = enum_record.enumtypid
       ) AS enum_label_count,
       (
         SELECT pg_catalog.count(*)::INTEGER
         FROM pg_catalog.pg_trigger AS trigger
         INNER JOIN target_relation AS relation
           ON relation.oid = trigger.tgrelid
         WHERE NOT trigger.tgisinternal
       ) AS trigger_count,
       (
         SELECT pg_catalog.count(*)::INTEGER
         FROM pg_catalog.pg_trigger AS trigger
         INNER JOIN pg_catalog.pg_constraint AS constraint_record
           ON constraint_record.oid = trigger.tgconstraint
         INNER JOIN target_relation AS relation
           ON relation.oid = constraint_record.conrelid
         WHERE trigger.tgisinternal
           AND constraint_record.contype = 'f'
       ) AS ri_trigger_count,
       (
         SELECT pg_catalog.count(*)::INTEGER
         FROM (
           SELECT relation.relowner AS owner_oid
           FROM target_relation AS relation
           UNION ALL
           SELECT procedure.proowner
           FROM target_function AS procedure
           UNION ALL
           SELECT type.typowner
           FROM target_type AS type
         ) AS object_owner
         WHERE object_owner.owner_oid <> (
           SELECT owner_oid FROM database_owner
         )
       ) AS owner_mismatch_count,
       (SELECT pg_catalog.count(*)::INTEGER FROM unsafe_acl)
         AS unsafe_acl_count`,
    SEALED_RELATIONS,
    SEALED_FUNCTIONS,
    RELEASE_GATE_TYPE,
  );
  assert.deepEqual(inventory, {
    column_count: 64,
    constraint_count: 28,
    enum_label_count: 3,
    function_count: 9,
    index_count: 11,
    owner_mismatch_count: 0,
    relation_count: 3,
    ri_trigger_count: 16,
    trigger_count: 3,
    type_count: 1,
    unsafe_acl_count: 0,
  });
  const enumRows = await client.$queryRawUnsafe(
    `SELECT
       enum_record.enumlabel,
       enum_record.enumsortorder::INTEGER AS sort_order
     FROM pg_catalog.pg_enum AS enum_record
     INNER JOIN pg_catalog.pg_type AS type
       ON type.oid = enum_record.enumtypid
     INNER JOIN pg_catalog.pg_namespace AS namespace
       ON namespace.oid = type.typnamespace
     WHERE namespace.nspname = 'public'
       AND type.typname = $1
     ORDER BY enum_record.enumsortorder`,
    RELEASE_GATE_TYPE,
  );
  assert.deepEqual(enumRows, [
    {
      enumlabel: "MODULE_POLICY_ENFORCED",
      sort_order: 1,
    },
    {
      enumlabel: "EMAIL_INVITE_WORKFLOW_VERIFIED",
      sort_order: 2,
    },
    {
      enumlabel: "POSTGRESQL_RELEASE_REHEARSAL_VERIFIED",
      sort_order: 3,
    },
  ]);
  const [sealedRows] = await client.$queryRawUnsafe(
    `SELECT
       (SELECT pg_catalog.count(*)::INTEGER
        FROM public."ReleaseGateAttestation") AS attestations,
       (SELECT pg_catalog.count(*)::INTEGER
        FROM public."TenantAdmissionDecision") AS decisions,
       (SELECT pg_catalog.count(*)::INTEGER
        FROM public."TenantAdmissionDecisionGate") AS links`,
  );
  return { inventory, sealedRows };
}

async function assertHostileRoleHasNoAuthority(client, roleName) {
  assertSafeGeneratedRoleName(roleName);
  const [state] = await client.$queryRawUnsafe(
    `SELECT
       pg_catalog.count(*) FILTER (
         WHERE pg_catalog.has_table_privilege(
           $1,
           pg_catalog.format(
             'public.%I',
             relation_name
           ),
           'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
         )
       )::INTEGER AS table_authority_count,
       pg_catalog.count(*) FILTER (
         WHERE pg_catalog.has_any_column_privilege(
           $1,
           pg_catalog.format('public.%I', relation_name),
           'SELECT,INSERT,UPDATE,REFERENCES'
         )
       )::INTEGER AS column_authority_count
     FROM pg_catalog.unnest($2::TEXT[]) AS relation_name`,
    roleName,
    SEALED_RELATIONS,
  );
  assert.deepEqual(state, {
    column_authority_count: 0,
    table_authority_count: 0,
  });
  const [typeState] = await client.$queryRawUnsafe(
    `SELECT pg_catalog.has_type_privilege(
       $1,
       'public."SharedBetaReleaseGateCode"',
       'USAGE'
     ) AS can_use_type`,
    roleName,
  );
  assert.equal(typeState?.can_use_type, false);
  let executableCount = 0;
  for (const functionName of SEALED_FUNCTIONS) {
    const [functionState] = await client.$queryRawUnsafe(
      `SELECT pg_catalog.bool_or(
         pg_catalog.has_function_privilege(
           $1,
           procedure.oid,
           'EXECUTE'
         )
       ) AS can_execute
       FROM pg_catalog.pg_proc AS procedure
       INNER JOIN pg_catalog.pg_namespace AS namespace
         ON namespace.oid = procedure.pronamespace
       WHERE namespace.nspname = 'public'
         AND procedure.proname = $2`,
      roleName,
      functionName,
    );
    if (functionState?.can_execute) executableCount += 1;
  }
  assert.equal(executableCount, 0);
  return {
    columnAuthority: 0,
    functionAuthority: executableCount,
    tableAuthority: 0,
    typeUsage: false,
  };
}

async function assertNoGeneratedResidue(admin, names) {
  const [state] = await admin.$queryRawUnsafe(
    `SELECT
       (
         SELECT pg_catalog.count(*)::INTEGER
         FROM pg_catalog.pg_database AS database
         WHERE database.datname = ANY($1::TEXT[])
       ) AS database_count,
       (
         SELECT pg_catalog.count(*)::INTEGER
         FROM pg_catalog.pg_roles AS role
         WHERE role.rolname = $2
       ) AS role_count`,
    [
      names.cleanDatabaseName,
      names.hostileDatabaseName,
      names.upgradeDatabaseName,
    ],
    names.hostileRoleName,
  );
  assert.deepEqual(state, {
    database_count: 0,
    role_count: 0,
  });
}

function assertRealEnvironment(environment) {
  if (environment.NODE_ENV === "production") {
    contractError("PRODUCTION_ENVIRONMENT_REFUSED");
  }
  if (
    environment
      .SHARED_BETA_ADMISSION_PROVENANCE_UPGRADE_SMOKE_CONFIRM !==
    REQUIRED_CONFIRMATION
  ) {
    contractError("UPGRADE_SMOKE_CONFIRMATION_REQUIRED");
  }
  return parseSafeSourceDatabaseUrl(environment.DATABASE_URL);
}

async function runOfflineSelfTest() {
  const parsed = parseSafeSourceDatabaseUrl(
    "postgresql://postgres:postgres@127.0.0.1:5432/leetplus_ci?schema=public",
  );
  assert.equal(parsed.databaseName, "leetplus_ci");
  assert.throws(() =>
    parseSafeSourceDatabaseUrl(
      "postgresql://postgres:postgres@127.0.0.1:5432/leetplus_test?schema=public",
    ),
  );
  assert.throws(() =>
    parseSafeSourceDatabaseUrl(
      "postgresql://postgres:postgres@database.invalid:5432/leetplus_ci?schema=public",
    ),
  );
  assert.throws(() =>
    assertRealEnvironment({
      DATABASE_URL:
        "postgresql://postgres:postgres@127.0.0.1:5432/leetplus_ci?schema=public",
      NODE_ENV: "production",
      SHARED_BETA_ADMISSION_PROVENANCE_UPGRADE_SMOKE_CONFIRM:
        REQUIRED_CONFIRMATION,
    }),
  );
  const names = generatedNames();
  for (const databaseName of [
    names.cleanDatabaseName,
    names.hostileDatabaseName,
    names.upgradeDatabaseName,
  ]) {
    assertSafeGeneratedDatabaseName(databaseName);
  }
  assertSafeGeneratedRoleName(names.hostileRoleName);
  assert.throws(() =>
    assertSafeGeneratedDatabaseName("leetplus_ci"),
  );
  assert.throws(() =>
    assertSafeGeneratedRoleName("postgres"),
  );
  assertSafeTempRoot(
    join(tmpdir(), `${TEMP_ROOT_PREFIX}0123456789abcdef`),
  );
  assert.throws(() => assertSafeTempRoot(tmpdir()));
  const migrationPlan = await readMigrationPlan();
  assert.equal(migrationPlan.prefixMigrations.length, 171);
  assert.equal(
    migrationPlan.prefixMigrations.at(-1),
    PREVIOUS_MIGRATION,
  );
  assert.equal(migrationPlan.allMigrations.length, 172);
  assert.equal(migrationPlan.targetMigration, TARGET_MIGRATION);
  process.stdout.write(
    `${JSON.stringify({
      script: SCRIPT_NAME,
      status: "PASS",
      mode: "SELF_TEST",
      prefixMigrationCount: 171,
      cleanMigrationCount: 172,
      targetMigration: TARGET_MIGRATION,
      generatedDatabaseCount: 3,
      generatedRoleCount: 1,
      hostileAclClasses: 4,
      destructiveSourceDatabaseActions: 0,
    })}\n`,
  );
}

async function runRealSmoke(environment) {
  const {
    databaseName: sourceDatabaseName,
    sourceUrl,
  } = assertRealEnvironment(environment);
  const migrationPlan = await readMigrationPlan();
  const names = generatedNames();
  const sourceDatabaseUrl = databaseUrlFor(
    sourceUrl,
    sourceDatabaseName,
  );
  const upgradeDatabaseUrl = databaseUrlFor(
    sourceUrl,
    names.upgradeDatabaseName,
  );
  const cleanDatabaseUrl = databaseUrlFor(
    sourceUrl,
    names.cleanDatabaseName,
  );
  const hostileDatabaseUrl = databaseUrlFor(
    sourceUrl,
    names.hostileDatabaseName,
  );
  const admin = prismaClient(sourceDatabaseUrl);
  const createdDatabases = [];
  let hostileRoleCreated = false;
  let clusterLockHeld = false;
  let tempRoot;
  let primaryError;
  let evidence;
  let cleanupVerified = false;
  const cleanupErrors = [];

  try {
    await assertTestSuperuser(admin, sourceDatabaseName);
    const sourceMigrationState = await readMigrationNames(admin);
    await acquireClusterLock(admin);
    clusterLockHeld = true;
    tempRoot = await mkdtemp(join(tmpdir(), TEMP_ROOT_PREFIX));
    assertSafeTempRoot(tempRoot);
    const artifact = await createMigrationArtifact(
      tempRoot,
      migrationPlan,
    );

    for (const databaseName of [
      names.upgradeDatabaseName,
      names.cleanDatabaseName,
      names.hostileDatabaseName,
    ]) {
      await createDatabase(admin, databaseName);
      createdDatabases.push(databaseName);
    }
    await createHostileRole(admin, names.hostileRoleName);
    hostileRoleCreated = true;

    runMigrateDeploy(artifact.schemaPath, upgradeDatabaseUrl);
    runMigrateDeploy(artifact.schemaPath, hostileDatabaseUrl);

    let upgrade = prismaClient(upgradeDatabaseUrl);
    let upgradeFixture;
    try {
      await assertAppliedMigrations(
        upgrade,
        migrationPlan.prefixMigrations,
      );
      await assertPre172Catalog(upgrade);
      upgradeFixture = await createCurrent171Fixture(upgrade);
    } finally {
      await upgrade.$disconnect();
    }

    await addTargetMigration(artifact, migrationPlan);
    runMigrateDeploy(artifact.schemaPath, cleanDatabaseUrl);
    runMigrateDeploy(artifact.schemaPath, upgradeDatabaseUrl);

    const clean = prismaClient(cleanDatabaseUrl);
    let cleanCatalog;
    try {
      await assertAppliedMigrations(clean, migrationPlan.allMigrations);
      cleanCatalog = await assertSealedCatalog(clean);
      assert.deepEqual(cleanCatalog.sealedRows, {
        attestations: 0,
        decisions: 0,
        links: 0,
      });
    } finally {
      await clean.$disconnect();
    }

    upgrade = prismaClient(upgradeDatabaseUrl);
    let upgradeCatalog;
    try {
      await assertAppliedMigrations(
        upgrade,
        migrationPlan.allMigrations,
      );
      await assertCurrent171FixturePreserved(
        upgrade,
        upgradeFixture,
      );
      upgradeCatalog = await assertSealedCatalog(upgrade);
      assert.deepEqual(upgradeCatalog.sealedRows, {
        attestations: 0,
        decisions: 0,
        links: 0,
      });
    } finally {
      await upgrade.$disconnect();
    }

    const upgradeFunctional = runFunctionalSmoke(
      upgradeDatabaseUrl,
      "upgrade",
    );
    const cleanFunctional = runFunctionalSmoke(
      cleanDatabaseUrl,
      "clean",
    );

    const hostileBefore = prismaClient(hostileDatabaseUrl);
    try {
      await assertAppliedMigrations(
        hostileBefore,
        migrationPlan.prefixMigrations,
      );
      await assertPre172Catalog(hostileBefore);
      await setUnsafeDefaultPrivileges(
        hostileBefore,
        names.hostileRoleName,
        true,
      );
      await assertUnsafeDefaultPrivileges(
        hostileBefore,
        names.hostileRoleName,
        true,
      );
    } finally {
      await hostileBefore.$disconnect();
    }

    expectMigrateDeployFailure(
      artifact.schemaPath,
      hostileDatabaseUrl,
    );

    const hostileAfterDefaultFailure = prismaClient(
      hostileDatabaseUrl,
    );
    try {
      await assertTargetMigrationRolledBack(
        hostileAfterDefaultFailure,
        migrationPlan,
      );
      await assertUnsafeDefaultPrivileges(
        hostileAfterDefaultFailure,
        names.hostileRoleName,
        true,
      );
      await setUnsafeDefaultPrivileges(
        hostileAfterDefaultFailure,
        names.hostileRoleName,
        false,
      );
      await assertUnsafeDefaultPrivileges(
        hostileAfterDefaultFailure,
        names.hostileRoleName,
        false,
      );
    } finally {
      await hostileAfterDefaultFailure.$disconnect();
    }
    runMigrateResolveRolledBack(
      artifact.schemaPath,
      hostileDatabaseUrl,
      TARGET_MIGRATION,
    );

    const hostileBeforeColumnFailure = prismaClient(
      hostileDatabaseUrl,
    );
    try {
      await assertAppliedMigrations(
        hostileBeforeColumnFailure,
        migrationPlan.prefixMigrations,
      );
      await installUnsafeColumnAclInjector(
        hostileBeforeColumnFailure,
        names.hostileRoleName,
      );
      await assertUnsafeColumnAclInjector(
        hostileBeforeColumnFailure,
        true,
      );
    } finally {
      await hostileBeforeColumnFailure.$disconnect();
    }

    expectMigrateDeployFailure(
      artifact.schemaPath,
      hostileDatabaseUrl,
    );

    const hostileAfterColumnFailure = prismaClient(
      hostileDatabaseUrl,
    );
    try {
      await assertTargetMigrationRolledBack(
        hostileAfterColumnFailure,
        migrationPlan,
      );
      await assertUnsafeColumnAclInjector(
        hostileAfterColumnFailure,
        true,
      );
      await dropUnsafeColumnAclInjector(
        hostileAfterColumnFailure,
      );
      await assertUnsafeColumnAclInjector(
        hostileAfterColumnFailure,
        false,
      );
    } finally {
      await hostileAfterColumnFailure.$disconnect();
    }
    runMigrateResolveRolledBack(
      artifact.schemaPath,
      hostileDatabaseUrl,
      TARGET_MIGRATION,
    );
    runMigrateDeploy(artifact.schemaPath, hostileDatabaseUrl);

    const hostileAfterRetry = prismaClient(hostileDatabaseUrl);
    let hostileCatalog;
    let hostileAuthority;
    try {
      await assertAppliedMigrations(
        hostileAfterRetry,
        migrationPlan.allMigrations,
      );
      hostileCatalog = await assertSealedCatalog(
        hostileAfterRetry,
      );
      hostileAuthority = await assertHostileRoleHasNoAuthority(
        hostileAfterRetry,
        names.hostileRoleName,
      );
    } finally {
      await hostileAfterRetry.$disconnect();
    }

    assert.deepEqual(
      await readMigrationNames(admin),
      sourceMigrationState,
      "The upgrade smoke changed source migration state.",
    );
    evidence = {
      script: SCRIPT_NAME,
      status: "PASS",
      postgresMajor: 16,
      upgrade: {
        fromMigration: PREVIOUS_MIGRATION,
        fromMigrationCount: 171,
        toMigration: TARGET_MIGRATION,
        toMigrationCount: 172,
        populatedTenantPreserved: true,
        populatedAdminPreserved: true,
        populatedIdentityClaimPreserved: true,
        populatedEntitlementsPreserved: 6,
        ...upgradeFunctional,
      },
      clean: {
        migrationCount: 172,
        migrationHead: TARGET_MIGRATION,
        relationCount: cleanCatalog.inventory.relation_count,
        columnCount: cleanCatalog.inventory.column_count,
        functionCount: cleanCatalog.inventory.function_count,
        enumLabelCount: cleanCatalog.inventory.enum_label_count,
        ...cleanFunctional,
      },
      hostileAcl: {
        defaultTableRollback: true,
        defaultFunctionRollback: true,
        defaultTypeRollback: true,
        columnInjectorRollback: true,
        failedMigrationRolledBack: true,
        normalRetrySucceeded: true,
        ownerOnlyAcl:
          hostileCatalog.inventory.unsafe_acl_count === 0,
        ...hostileAuthority,
      },
      sourceDatabaseMigrationsApplied: 0,
    };
  } catch (error) {
    primaryError = error;
  } finally {
    for (const databaseName of [...createdDatabases].reverse()) {
      try {
        await dropDatabase(admin, databaseName);
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (hostileRoleCreated) {
      try {
        await dropHostileRole(admin, names.hostileRoleName);
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    try {
      await assertNoGeneratedResidue(admin, names);
      cleanupVerified = true;
    } catch (error) {
      cleanupErrors.push(error);
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
          force: true,
          maxRetries: 5,
          recursive: true,
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
      "Admission upgrade smoke and cleanup both failed.",
    );
  }
  if (primaryError) throw primaryError;
  if (cleanupErrors.length > 0) {
    throw new AggregateError(
      cleanupErrors,
      "Admission upgrade smoke cleanup failed.",
    );
  }
  assert.ok(evidence);
  assert.equal(cleanupVerified, true);
  evidence.cleanup = {
    generatedDatabasesRemaining: 0,
    generatedRolesRemaining: 0,
    temporaryArtifactsRemaining: 0,
  };
  process.stdout.write(`${JSON.stringify(evidence)}\n`);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${HELP}\n`);
    return;
  }
  if (options.selfTest) {
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
        code:
          error?.code ??
          "SHARED_BETA_ADMISSION_UPGRADE_SMOKE_FAILED",
        message:
          typeof error?.message === "string"
            ? error.message
            : "Shared beta admission upgrade smoke failed.",
      },
    })}\n`,
  );
  process.exitCode = 1;
});

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { cp, copyFile, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
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

const SCRIPT_NAME = "identity-owner-invite-hold-outbox-upgrade-smoke";
const REQUIRED_CONFIRMATION =
  "run-identity-owner-invite-hold-outbox-upgrade-smoke";
const TARGET_MIGRATION = "20260730010000_identity_owner_invite_hold_outbox";
const PREVIOUS_MIGRATION = "20260729233000_identity_activation_locator";
const ISSUE_FUNCTION = "identity_owner_invite_issue_hold_v1";
const ISSUE_CATALOG_SIGNATURE =
  'public."identity_owner_invite_issue_hold_v1"(text,text,text,integer,text,text,text,text,text,text,text,text,bytea,timestamp with time zone)';
const ISSUE_GRANT_SIGNATURE =
  'public."identity_owner_invite_issue_hold_v1"(TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BYTEA, TIMESTAMP WITH TIME ZONE)';
const MIGRATION_PATTERN = /^\d{14}_[a-z0-9_]+$/u;
const SAFE_SOURCE_DATABASE_PATTERN =
  /(?:^|[_-])(?:ci|test|testing)(?:$|[_-])/iu;
const DATABASE_PREFIX = "lp_owner_hold_";
const UPGRADE_DATABASE_PATTERN = /^lp_owner_hold_upgrade_ci_[a-f0-9]{16}$/u;
const CLEAN_DATABASE_PATTERN = /^lp_owner_hold_clean_ci_[a-f0-9]{16}$/u;
const HOSTILE_ACL_DATABASE_PATTERN =
  /^lp_owner_hold_hostile_acl_ci_[a-f0-9]{16}$/u;
const ROLE_PATTERN = /^lp_owner_hold_(?:app|issuer|unsafe_acl)_[a-f0-9]{16}$/u;
const TEMP_ROOT_PREFIX = "leetplus-owner-hold-upgrade-";
const MIGRATION_TIMEOUT_MS = 10 * 60 * 1000;
const CLUSTER_LOCK_CLASS = 1_281_120_000;
const CLUSTER_LOCK_OBJECT = 171;
const CONCURRENCY_BARRIER_LOCK_CLASS = 1_281_120_001;
const SEALED_TABLES = Object.freeze([
  "IdentityEmailClaim",
  "IdentityOwnerInviteIssueCommand",
  "IdentityMailOutbox",
]);
const NEW_SEALED_COLUMN_MANIFEST = Object.freeze({
  IdentityOwnerInviteIssueCommand: Object.freeze([
    "id",
    "tenantId",
    "action",
    "requestId",
    "issueRequestDigest",
    "aadEnvironment",
    "workflowLocator",
    "reservationSubjectId",
    "reservationClaimRevision",
    "inviteId",
    "outboxId",
    "messageKey",
    "tokenHash",
    "tokenDigestVersion",
    "template",
    "envelopeVersion",
    "keyVersion",
    "expiresAt",
    "claimRevision",
    "createdAt",
  ]),
  IdentityMailOutbox: Object.freeze([
    "id",
    "tenantId",
    "issueCommandId",
    "inviteId",
    "workflowLocator",
    "aadEnvironment",
    "template",
    "status",
    "messageKey",
    "issueRequestDigest",
    "tokenHash",
    "tokenDigestVersion",
    "secretCiphertext",
    "envelopeVersion",
    "keyVersion",
    "expiresAt",
    "createdAt",
  ]),
});
const HISTORICAL_CURRENT_171_IDENTITY_CLAIM_COLUMNS = Object.freeze([
  "emailCanonical",
  "claimType",
  "tenantId",
  "subjectId",
  "revision",
  "createdAt",
  "updatedAt",
  "workflowLocator",
]);
const HISTORICAL_CURRENT_171_RUNTIME_FUNCTIONS = Object.freeze(
  APPLICATION_RUNTIME_FUNCTIONS.filter(
    (entry) => entry.key !== "identityInitialOwnerInviteDeliveryAssertSent",
  ),
);
const HISTORICAL_CURRENT_171_EXCLUDED_FUNCTIONS = Object.freeze([
  'public."guest_game_delivery_record_event_v1"(JSON)',
  'public."identity_email_claim_lock_v1"(TEXT)',
  'public."identity_email_claim_reserve_invite_v1"(TEXT, TEXT, TEXT)',
  'public."identity_email_claim_transition_v1"(TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT)',
  'public."identity_email_claim_release_v1"(TEXT, TEXT, TEXT, TEXT, INTEGER)',
  ISSUE_GRANT_SIGNATURE,
]);
const COLUMN_PRIVILEGES = Object.freeze([
  "SELECT",
  "INSERT",
  "UPDATE",
  "REFERENCES",
]);
const COLUMN_ACL_INJECTOR_FUNCTION =
  "identity_owner_hold_column_acl_injector_ci_v1";
const COLUMN_ACL_INJECTOR_TRIGGER =
  "identity_owner_hold_column_acl_injector_ci_v1";
const RECEIPT_KEYS = Object.freeze(
  [
    "accessScope",
    "claimRevision",
    "claimType",
    "commandId",
    "decision",
    "inviteId",
    "operation",
    "outboxId",
    "outboxStatus",
    "role",
    "schemaVersion",
    "tenantId",
  ].sort(),
);

const HELP = `
${SCRIPT_NAME}

Local/CI-only PostgreSQL 16 smoke for migration 171. It creates random
disposable upgrade, clean, and hostile-default-ACL databases from template0
and never migrates or templates from the source database.

The upgrade database is deployed through exact CURRENT_170, populated with
identity reservations, and upgraded to CURRENT_171. The clean database receives
all 171 migrations. The smoke verifies atomic dormant OWNER invite issuance,
idempotent replay and collision rejection, fail-closed malformed/authority
inputs, rollback after a late audit fault, concurrent same-command replay, and
the dedicated issuer/runtime/PUBLIC ACL boundary. The hostile database proves
that inherited non-owner default privileges abort and fully roll back migration
171 before a normal retry succeeds with those unsafe defaults removed.

Usage:
  node scripts/${SCRIPT_NAME}.mjs
  node scripts/${SCRIPT_NAME}.mjs --self-test
  node scripts/${SCRIPT_NAME}.mjs --help

Required for the real smoke:
  DATABASE_URL
    PostgreSQL 16 on loopback, public schema, and a source database whose name
    contains ci/test/testing. The connected role must be a test superuser.
  IDENTITY_OWNER_INVITE_HOLD_OUTBOX_UPGRADE_SMOKE_CONFIRM
    Must equal: ${REQUIRED_CONFIRMATION}

Safety:
  - NODE_ENV=production is rejected.
  - Only generated disposable database and role names are accepted.
  - The source database is neither migrated nor used as a template.
  - Temporary artifacts, roles, and databases are removed in finally.
  - Secrets, connection URLs, canonical email, token hashes, and ciphertext
    are never printed.
`.trim();

function contractError(code, message = code) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function parseArguments(argv) {
  if (argv.includes("--help")) return { help: true, selfTest: false };
  const supported = new Set(["--self-test"]);
  for (const argument of argv) {
    if (!supported.has(argument)) contractError("CLI_ARGUMENT_UNSUPPORTED");
  }
  return { help: false, selfTest: argv.includes("--self-test") };
}

function quoteIdentifier(value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/u.test(value)) {
    contractError("DATABASE_IDENTIFIER_INVALID");
  }
  return `"${value}"`;
}

function buildHistoricalCurrent171RuntimeEnrollmentStatements(roleName) {
  assert.equal(
    HISTORICAL_CURRENT_171_RUNTIME_FUNCTIONS.length,
    7,
    "The historical CURRENT_171 runtime function manifest changed.",
  );
  const role = quoteIdentifier(roleName);
  const sealedTables = [
    [
      'public."IdentityEmailClaim"',
      HISTORICAL_CURRENT_171_IDENTITY_CLAIM_COLUMNS,
    ],
    [
      'public."IdentityOwnerInviteIssueCommand"',
      NEW_SEALED_COLUMN_MANIFEST.IdentityOwnerInviteIssueCommand,
    ],
    [
      'public."IdentityMailOutbox"',
      NEW_SEALED_COLUMN_MANIFEST.IdentityMailOutbox,
    ],
  ];
  return Object.freeze([
    ...sealedTables.flatMap(([tableName, columns]) => {
      const columnList = columns
        .map((columnName) => quoteIdentifier(columnName))
        .join(", ");
      return [
        `REVOKE ALL PRIVILEGES ON TABLE ${tableName} FROM ${role}`,
        `REVOKE ALL PRIVILEGES ON TABLE ${tableName} FROM PUBLIC`,
        `REVOKE ALL PRIVILEGES (${columnList}) ON TABLE ${tableName} FROM ${role}`,
        `REVOKE ALL PRIVILEGES (${columnList}) ON TABLE ${tableName} FROM PUBLIC`,
      ];
    }),
    ...HISTORICAL_CURRENT_171_RUNTIME_FUNCTIONS.flatMap((entry) => [
      `GRANT EXECUTE ON FUNCTION ${entry.grantSignature} TO ${role}`,
      `REVOKE GRANT OPTION FOR EXECUTE ON FUNCTION ${entry.grantSignature} FROM ${role}`,
    ]),
    ...HISTORICAL_CURRENT_171_EXCLUDED_FUNCTIONS.map(
      (signature) => `REVOKE EXECUTE ON FUNCTION ${signature} FROM ${role}`,
    ),
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
    CLEAN_DATABASE_PATTERN.test(databaseName) ||
    HOSTILE_ACL_DATABASE_PATTERN.test(databaseName)
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

function databaseUrlFor(sourceUrl, databaseName, roleName, password) {
  const target = new URL(sourceUrl);
  target.pathname = `/${databaseName}`;
  target.searchParams.set("schema", "public");
  target.searchParams.set("connection_limit", "1");
  target.searchParams.set("connect_timeout", "5");
  target.searchParams.set("pool_timeout", "5");
  target.searchParams.delete("options");
  if (roleName !== undefined) {
    target.username = roleName;
    target.password = password;
  }
  return target.toString();
}

function generatedNames() {
  const suffix = randomBytes(8).toString("hex");
  return {
    upgradeDatabaseName: `${DATABASE_PREFIX}upgrade_ci_${suffix}`,
    cleanDatabaseName: `${DATABASE_PREFIX}clean_ci_${suffix}`,
    hostileAclDatabaseName: `${DATABASE_PREFIX}hostile_acl_ci_${suffix}`,
    appRoleName: `${DATABASE_PREFIX}app_${suffix}`,
    issuerRoleName: `${DATABASE_PREFIX}issuer_${suffix}`,
    unsafeAclRoleName: `${DATABASE_PREFIX}unsafe_acl_${suffix}`,
  };
}

function assertSafeDatabaseName(name) {
  assert(
    UPGRADE_DATABASE_PATTERN.test(name) ||
      CLEAN_DATABASE_PATTERN.test(name) ||
      HOSTILE_ACL_DATABASE_PATTERN.test(name),
    "Only generated owner-invite smoke databases are allowed.",
  );
}

function assertSafeRoleName(name) {
  assert(
    ROLE_PATTERN.test(name),
    "Only generated owner-invite smoke roles are allowed.",
  );
}

function assertSafeTempRoot(path) {
  const resolved = resolve(path);
  const expectedParent = resolve(tmpdir());
  assert.equal(dirname(resolved), expectedParent);
  assert.ok(
    resolved.startsWith(resolve(tmpdir(), TEMP_ROOT_PREFIX)),
    "Temporary root is outside the generated owner-invite smoke namespace.",
  );
}

function prismaClient(databaseUrl) {
  return new PrismaClient({
    datasources: { db: { url: databaseUrl } },
    log: [],
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
  assert.equal(migrationDirectories.length, CURRENT_EXPECTED_MIGRATION_COUNT);
  assert.equal(
    migrationDirectories[STAFF_TASK_FROZEN_PREFIX_COUNT - 1],
    STAFF_TASK_FROZEN_PREFIX_LATEST,
  );
  assert.deepEqual(migrationDirectories.slice(STAFF_TASK_FROZEN_PREFIX_COUNT), [
    ...STAFF_TASK_ALLOWED_ADDITIVE_TAIL,
  ]);
  assert.equal(
    CURRENT_EXPECTED_LATEST_MIGRATION,
    "20260817030000_founder_operator_beta_activation_runtime_v1",
  );
  assert.equal(STAFF_TASK_CURRENT_RELEASE_STATE, "CURRENT_183");
  const targetIndex = migrationDirectories.indexOf(TARGET_MIGRATION);
  assert.equal(
    targetIndex,
    170,
    "The historical OWNER HOLD migration moved in the release manifest.",
  );
  assert.equal(migrationDirectories[targetIndex - 1], PREVIOUS_MIGRATION);
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

async function addTargetMigration(artifact, migrationPlan) {
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
      }; raw output is suppressed.`,
    );
  }
}

function expectMigrateDeployFailure(schemaPath, databaseUrl) {
  assert.throws(
    () => runMigrateDeploy(schemaPath, databaseUrl),
    (error) => error?.code === "MIGRATION_DEPLOY_FAILED",
  );
}

function runMigrateResolveRolledBack(schemaPath, databaseUrl, migrationName) {
  assert.equal(migrationName, TARGET_MIGRATION);
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
      "MIGRATION_RESOLVE_FAILED",
      `Prisma migration resolve failed with status ${
        result.status ?? "unknown"
      }; raw output is suppressed.`,
    );
  }
}

async function assertTestSuperuser(admin, expectedDatabaseName) {
  const [row] = await admin.$queryRawUnsafe(
    `SELECT
       current_database() AS database_name,
       current_setting('server_version_num')::integer AS server_version_number,
       role.rolsuper AS is_superuser
     FROM pg_catalog.pg_roles AS role
     WHERE role.rolname = CURRENT_USER`,
  );
  assert.equal(row?.database_name, expectedDatabaseName);
  assert.equal(Math.floor(Number(row?.server_version_number) / 10_000), 16);
  assert.equal(row?.is_superuser, true);
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
  assert.equal(row?.acquired, true);
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

async function createDatabase(admin, databaseName) {
  assertSafeDatabaseName(databaseName);
  await admin.$executeRawUnsafe(
    `CREATE DATABASE ${quoteIdentifier(databaseName)} TEMPLATE template0`,
  );
}

async function dropDatabase(admin, databaseName) {
  assertSafeDatabaseName(databaseName);
  await admin.$executeRawUnsafe(
    `DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)} WITH (FORCE)`,
  );
}

async function createRole(admin, roleName, password) {
  assertSafeRoleName(roleName);
  assert.match(password, /^[a-f0-9]{64}$/u);
  await admin.$executeRawUnsafe(
    `CREATE ROLE ${quoteIdentifier(roleName)}
       LOGIN PASSWORD '${password}'
       NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
       NOREPLICATION NOBYPASSRLS`,
  );
}

async function dropRole(admin, roleName) {
  assertSafeRoleName(roleName);
  await admin.$executeRawUnsafe(
    `DROP ROLE IF EXISTS ${quoteIdentifier(roleName)}`,
  );
}

async function grantDatabaseConnection(admin, databaseName, roleName) {
  assertSafeDatabaseName(databaseName);
  assertSafeRoleName(roleName);
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

async function assertAppliedMigrations(client, expected) {
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

async function setUnsafeDefaultPrivileges(client, roleName, enabled) {
  assertSafeRoleName(roleName);
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
}

async function assertUnsafeDefaultPrivileges(client, roleName, expected) {
  assertSafeRoleName(roleName);
  const rows = await client.$queryRawUnsafe(
    `SELECT
       defaults.defaclobjtype::text AS object_type,
       acl.privilege_type
     FROM pg_catalog.pg_default_acl AS defaults
     INNER JOIN pg_catalog.pg_namespace AS namespace
       ON namespace.oid = defaults.defaclnamespace
     CROSS JOIN LATERAL pg_catalog.aclexplode(defaults.defaclacl) AS acl
     INNER JOIN pg_catalog.pg_roles AS grantee
       ON grantee.oid = acl.grantee
     WHERE namespace.nspname = 'public'
       AND defaults.defaclrole = (
         SELECT role.oid
         FROM pg_catalog.pg_roles AS role
         WHERE role.rolname = CURRENT_USER
       )
       AND grantee.rolname = $1
     ORDER BY defaults.defaclobjtype, acl.privilege_type`,
    roleName,
  );
  assert.deepEqual(
    rows,
    expected
      ? [
          { object_type: "f", privilege_type: "EXECUTE" },
          { object_type: "r", privilege_type: "SELECT" },
        ]
      : [],
  );
}

async function installUnsafeColumnAclInjector(client, roleName) {
  assertSafeRoleName(roleName);
  const role = quoteIdentifier(roleName);
  await client.$executeRawUnsafe(
    `CREATE FUNCTION public.${quoteIdentifier(COLUMN_ACL_INJECTOR_FUNCTION)}()
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
           AND relation.relname = 'IdentityOwnerInviteIssueCommand'
           AND relation.relkind = 'r'
       ) THEN
         EXECUTE
           'GRANT SELECT ("tokenHash") ON TABLE ' ||
           'public."IdentityOwnerInviteIssueCommand" TO ${role}';
       END IF;
     END;
     $column_acl_injector$`,
  );
  await client.$executeRawUnsafe(
    `CREATE EVENT TRIGGER ${quoteIdentifier(COLUMN_ACL_INJECTOR_TRIGGER)}
     ON ddl_command_end
     WHEN TAG IN ('CREATE TABLE')
     EXECUTE FUNCTION public.${quoteIdentifier(
       COLUMN_ACL_INJECTOR_FUNCTION,
     )}()`,
  );
}

async function assertUnsafeColumnAclInjector(client, expected) {
  const [row] = await client.$queryRawUnsafe(
    `SELECT
       pg_catalog.count(*) FILTER (
         WHERE event.evtname = $1
           AND event.evtenabled = 'O'
       )::integer AS trigger_count,
       pg_catalog.count(*) FILTER (
         WHERE procedure.proname = $2
       )::integer AS function_count
     FROM pg_catalog.pg_proc AS procedure
     INNER JOIN pg_catalog.pg_namespace AS namespace
       ON namespace.oid = procedure.pronamespace
     LEFT JOIN pg_catalog.pg_event_trigger AS event
       ON event.evtfoid = procedure.oid
     WHERE namespace.nspname = 'public'
       AND procedure.proname = $2`,
    COLUMN_ACL_INJECTOR_TRIGGER,
    COLUMN_ACL_INJECTOR_FUNCTION,
  );
  assert.deepEqual(row, {
    trigger_count: expected ? 1 : 0,
    function_count: expected ? 1 : 0,
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

async function assertTargetMigrationRolledBack(client, migrationPlan) {
  assert.deepEqual(
    await readMigrationNames(client),
    migrationPlan.prefixMigrations,
  );
  const [failed] = await client.$queryRawUnsafe(
    `SELECT
       pg_catalog.count(*)::integer AS failed_count
     FROM public."_prisma_migrations"
     WHERE "migration_name" = $1
       AND "finished_at" IS NULL
       AND "rolled_back_at" IS NULL`,
    TARGET_MIGRATION,
  );
  assert.equal(failed?.failed_count, 1);

  const [objects] = await client.$queryRawUnsafe(
    `SELECT
       pg_catalog.to_regclass(
         'public."IdentityOwnerInviteIssueCommand"'
       )::text AS command_table,
       pg_catalog.to_regclass(
         'public."IdentityMailOutbox"'
       )::text AS outbox_table,
       pg_catalog.to_regclass(
         'public."UserInvite_tenantId_id_key"'
       )::text AS invite_composite_index,
       pg_catalog.to_regprocedure(
         'public."identity_owner_invite_issue_command_immutable_v1"()'
       )::text AS command_guard,
       pg_catalog.to_regprocedure(
         'public."identity_mail_outbox_hold_immutable_v1"()'
       )::text AS outbox_guard,
       pg_catalog.to_regprocedure($1)::text AS issue_rpc,
       pg_catalog.to_regtype(
         'public."IdentityMailTemplate"'
       )::text AS mail_template_type,
       pg_catalog.to_regtype(
         'public."IdentityMailOutboxStatus"'
       )::text AS outbox_status_type`,
    ISSUE_CATALOG_SIGNATURE,
  );
  assert.deepEqual(objects, {
    command_table: null,
    outbox_table: null,
    invite_composite_index: null,
    command_guard: null,
    outbox_guard: null,
    issue_rpc: null,
    mail_template_type: null,
    outbox_status_type: null,
  });
}

async function readSourceMigrationState(admin) {
  const [relation] = await admin.$queryRawUnsafe(
    `SELECT pg_catalog.to_regclass('public."_prisma_migrations"')::text
       AS relation_name`,
  );
  return relation?.relation_name === null ? [] : readMigrationNames(admin);
}

function issueInput({ tenantId, reservationSubjectId, workflowLocator }) {
  const rawToken = randomBytes(32).toString("base64url");
  return {
    workflowLocator,
    tenantId,
    reservationSubjectId,
    expectedRevision: 1,
    requestId: randomUUID(),
    requestDigest: randomBytes(32).toString("hex"),
    aadEnvironment: "ci",
    commandId: randomUUID(),
    inviteId: randomUUID(),
    outboxId: randomUUID(),
    messageKey: randomUUID(),
    tokenHash: createHash("sha256").update(rawToken).digest("hex"),
    ciphertext: Buffer.concat([Buffer.from([1]), randomBytes(70)]),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    rawToken,
  };
}

async function createTenant(client, tenantId, suffix) {
  const now = new Date("2026-07-30T12:00:00.000Z");
  await client.$executeRawUnsafe(
    `INSERT INTO public."Tenant" (
       "id", "name", "slug", "status", "customerStage",
       "onboardingStatus", "createdAt", "updatedAt"
     )
     VALUES (
       $1, $2, $3,
       'SUSPENDED'::public."TenantLifecycleStatus",
       'PILOT'::public."TenantCustomerStage",
       'PROVISIONING'::public."TenantOnboardingStatus",
       $4, $4
     )`,
    tenantId,
    `Owner hold ${suffix}`,
    `owner-hold-${suffix}`,
    now,
  );
}

async function reserveIdentity(client, email, tenantId, subjectId) {
  const rows = await client.$queryRawUnsafe(
    `SELECT public."identity_email_claim_reserve_invite_v2"(
       CAST($1 AS TEXT),
       CAST($2 AS TEXT),
       CAST($3 AS TEXT)
     ) AS receipt`,
    email,
    tenantId,
    subjectId,
  );
  assert.equal(rows[0]?.receipt?.decision, "CREATED");
  return readClaimByLocator(client, subjectId);
}

async function readClaimByLocator(client, workflowLocator) {
  const rows = await client.$queryRawUnsafe(
    `SELECT
       "emailCanonical" AS email_canonical,
       "claimType"::text AS claim_type,
       "tenantId" AS tenant_id,
       "subjectId" AS subject_id,
       "workflowLocator" AS workflow_locator,
       "revision",
       "createdAt" AS created_at,
       "updatedAt" AS updated_at
     FROM public."IdentityEmailClaim"
     WHERE "workflowLocator" = $1`,
    workflowLocator,
  );
  assert.equal(rows.length, 1);
  return rows[0];
}

async function insertUserAndTransitionClaim(
  client,
  { email, tenantId, reservationSubjectId, userId },
) {
  const now = new Date("2026-07-30T12:00:00.000Z");
  await client.$executeRawUnsafe(
    `INSERT INTO public."User" (
       "id", "tenantId", "email", "passwordHash", "role", "isActive",
       "isPlatformAdmin", "identityClaimRevision", "createdAt", "updatedAt"
     )
     VALUES (
       $1, $2, $3, 'owner-hold-smoke-password-hash',
       'OWNER'::public."UserRole", TRUE, FALSE, NULL, $4, $4
     )`,
    userId,
    tenantId,
    email,
    now,
  );
  const rows = await client.$queryRawUnsafe(
    `SELECT public."identity_email_claim_transition_v2"(
       CAST($1 AS TEXT),
       CAST($2 AS TEXT),
       CAST('INVITE' AS TEXT),
       CAST($3 AS TEXT),
       CAST(1 AS INTEGER),
       CAST('USER' AS TEXT),
       CAST($4 AS TEXT)
     ) AS receipt`,
    email,
    tenantId,
    reservationSubjectId,
    userId,
  );
  assert.equal(rows[0]?.receipt?.revision, 2);
  await client.$executeRawUnsafe(
    `UPDATE public."User"
     SET "identityClaimRevision" = 2
     WHERE "id" = $1 AND "tenantId" = $2`,
    userId,
    tenantId,
  );
}

function issue(client, input) {
  return client
    .$queryRawUnsafe(
      `SELECT public."identity_owner_invite_issue_hold_v1"(
         CAST($1 AS TEXT),
         CAST($2 AS TEXT),
         CAST($3 AS TEXT),
         CAST($4 AS INTEGER),
         CAST($5 AS TEXT),
         CAST($6 AS TEXT),
         CAST($7 AS TEXT),
         CAST($8 AS TEXT),
         CAST($9 AS TEXT),
         CAST($10 AS TEXT),
         CAST($11 AS TEXT),
         CAST($12 AS TEXT),
         CAST($13 AS BYTEA),
         CAST($14 AS TIMESTAMPTZ)
       ) AS receipt`,
      input.workflowLocator,
      input.tenantId,
      input.reservationSubjectId,
      input.expectedRevision,
      input.requestId,
      input.requestDigest,
      input.aadEnvironment,
      input.commandId,
      input.inviteId,
      input.outboxId,
      input.messageKey,
      input.tokenHash,
      input.ciphertext,
      input.expiresAt,
    )
    .then((rows) => rows[0]?.receipt);
}

function cloneIssueInput(input, overrides = {}) {
  return {
    ...input,
    ciphertext: Buffer.from(input.ciphertext),
    ...overrides,
  };
}

function assertExactReceipt(receipt, input, decision) {
  assert.deepEqual(Object.keys(receipt).sort(), RECEIPT_KEYS);
  assert.deepEqual(receipt, {
    schemaVersion: 1,
    operation: "ISSUE_DORMANT_OWNER_INVITE",
    decision,
    tenantId: input.tenantId,
    commandId: input.commandId,
    inviteId: input.inviteId,
    outboxId: input.outboxId,
    outboxStatus: "HOLD",
    claimType: "INVITE",
    claimRevision: 2,
    role: "OWNER",
    accessScope: "NETWORK",
  });
}

function assertReceiptIsPiiFree(receipt, input, canonicalEmail) {
  const serialized = JSON.stringify(receipt);
  for (const forbidden of [
    canonicalEmail,
    input.rawToken,
    input.tokenHash,
    input.ciphertext.toString("hex"),
    input.requestDigest,
    input.messageKey,
  ]) {
    assert.equal(serialized.includes(forbidden), false);
  }
  assert.doesNotMatch(
    serialized,
    /email|token|cipher|secret|messageKey|requestDigest/iu,
  );
}

async function readAggregate(client, input) {
  const [invite] = await client.$queryRawUnsafe(
    `SELECT
       "id", "tenantId" AS tenant_id, "email", "role"::text AS role,
       "accessScope"::text AS access_scope, "customRoleId" AS custom_role_id,
       "storeIds" AS store_ids, "tokenHash" AS token_hash,
       "expiresAt" AS expires_at,
       "identityClaimRevision" AS identity_claim_revision,
       "createdAt" AS created_at, "updatedAt" AS updated_at
     FROM public."UserInvite"
     WHERE "id" = $1 AND "tenantId" = $2`,
    input.inviteId,
    input.tenantId,
  );
  const [command] = await client.$queryRawUnsafe(
    `SELECT *
     FROM public."IdentityOwnerInviteIssueCommand"
     WHERE "id" = $1 AND "tenantId" = $2`,
    input.commandId,
    input.tenantId,
  );
  const [outbox] = await client.$queryRawUnsafe(
    `SELECT *
     FROM public."IdentityMailOutbox"
     WHERE "id" = $1 AND "tenantId" = $2`,
    input.outboxId,
    input.tenantId,
  );
  const claim = await readClaimByLocator(client, input.workflowLocator);
  const audits = await client.$queryRawUnsafe(
    `SELECT *
     FROM public."PlatformAdminAuditEvent"
     WHERE "tenantId" = $1 AND "requestId" = $2
     ORDER BY "createdAt", "id"`,
    input.tenantId,
    input.requestId,
  );
  return { invite, command, outbox, claim, audits };
}

function stableAggregateProjection(aggregate) {
  return JSON.parse(
    JSON.stringify(aggregate, (_key, value) => {
      if (Buffer.isBuffer(value)) return value.toString("hex");
      if (value instanceof Date) return value.toISOString();
      return value;
    }),
  );
}

function assertAggregate(aggregate, input, canonicalEmail) {
  assert.ok(aggregate.invite);
  assert.equal(aggregate.invite.tenant_id, input.tenantId);
  assert.equal(aggregate.invite.email, canonicalEmail);
  assert.equal(aggregate.invite.role, "OWNER");
  assert.equal(aggregate.invite.access_scope, "NETWORK");
  assert.equal(aggregate.invite.custom_role_id, null);
  assert.deepEqual(aggregate.invite.store_ids, []);
  assert.equal(aggregate.invite.token_hash, input.tokenHash);
  assert.equal(aggregate.invite.identity_claim_revision, 2);

  assert.ok(aggregate.command);
  assert.equal(aggregate.command.tenantId, input.tenantId);
  assert.equal(aggregate.command.requestId, input.requestId);
  assert.equal(aggregate.command.issueRequestDigest, input.requestDigest);
  assert.equal(aggregate.command.aadEnvironment, input.aadEnvironment);
  assert.equal(aggregate.command.workflowLocator, input.workflowLocator);
  assert.equal(
    aggregate.command.reservationSubjectId,
    input.reservationSubjectId,
  );
  assert.equal(aggregate.command.reservationClaimRevision, 1);
  assert.equal(aggregate.command.inviteId, input.inviteId);
  assert.equal(aggregate.command.outboxId, input.outboxId);
  assert.equal(aggregate.command.claimRevision, 2);

  assert.ok(aggregate.outbox);
  assert.equal(aggregate.outbox.tenantId, input.tenantId);
  assert.equal(aggregate.outbox.issueCommandId, input.commandId);
  assert.equal(aggregate.outbox.inviteId, input.inviteId);
  assert.equal(aggregate.outbox.workflowLocator, input.workflowLocator);
  assert.equal(aggregate.outbox.status, "HOLD");
  assert.equal(aggregate.outbox.template, "INITIAL_OWNER_INVITE");
  assert.equal(aggregate.outbox.messageKey, input.messageKey);
  assert.equal(aggregate.outbox.secretCiphertext.length, 71);
  assert.deepEqual(
    Buffer.from(aggregate.outbox.secretCiphertext),
    input.ciphertext,
  );

  assert.equal(aggregate.claim.email_canonical, canonicalEmail);
  assert.equal(aggregate.claim.tenant_id, input.tenantId);
  assert.equal(aggregate.claim.claim_type, "INVITE");
  assert.equal(aggregate.claim.subject_id, input.inviteId);
  assert.equal(aggregate.claim.workflow_locator, input.workflowLocator);
  assert.equal(aggregate.claim.revision, 2);
  assert.equal(aggregate.audits.length, 1);

  const auditText = JSON.stringify(aggregate.audits[0]);
  for (const forbidden of [
    canonicalEmail,
    input.rawToken,
    input.tokenHash,
    input.ciphertext.toString("hex"),
  ]) {
    assert.equal(auditText.includes(forbidden), false);
  }
}

function extractSqlStates(error) {
  const states = new Set();
  const pending = [error];
  const visited = new Set();
  while (pending.length > 0 && visited.size < 64) {
    const candidate = pending.shift();
    if (
      candidate === null ||
      candidate === undefined ||
      visited.has(candidate)
    ) {
      continue;
    }
    if (typeof candidate === "object") visited.add(candidate);
    if (
      typeof candidate?.code === "string" &&
      /^[0-9A-Z]{5}$/u.test(candidate.code)
    ) {
      states.add(candidate.code);
    }
    if (typeof candidate?.message === "string") {
      for (const match of candidate.message.matchAll(/\b[0-9A-Z]{5}\b/gu)) {
        states.add(match[0]);
      }
    }
    if (typeof candidate === "object") {
      for (const key of [
        "cause",
        "meta",
        "originalError",
        "driverAdapterError",
      ]) {
        if (candidate[key] !== undefined) pending.push(candidate[key]);
      }
    }
  }
  return states;
}

async function expectDatabaseFailure(label, operation, allowedStates) {
  let caught;
  try {
    await operation();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, `${label} unexpectedly succeeded`);
  const states = extractSqlStates(caught);
  assert.equal(states.has("40P01"), false, `${label} deadlocked`);
  assert(
    [...states].some((state) => allowedStates.includes(state)),
    `${label} returned unexpected SQLSTATE`,
  );
  return caught;
}

async function assertNoAggregate(client, input) {
  const [counts] = await client.$queryRawUnsafe(
    `SELECT
       (SELECT pg_catalog.count(*)::integer
        FROM public."UserInvite"
        WHERE "id" = $1 OR "tokenHash" = $4) AS invite_count,
       (SELECT pg_catalog.count(*)::integer
        FROM public."IdentityOwnerInviteIssueCommand"
        WHERE "id" = $2 OR ("tenantId" = $5 AND "requestId" = $6))
          AS command_count,
       (SELECT pg_catalog.count(*)::integer
        FROM public."IdentityMailOutbox"
        WHERE "id" = $3) AS outbox_count,
       (SELECT pg_catalog.count(*)::integer
        FROM public."PlatformAdminAuditEvent"
        WHERE "tenantId" = $5 AND "requestId" = $6) AS audit_count`,
    input.inviteId,
    input.commandId,
    input.outboxId,
    input.tokenHash,
    input.tenantId,
    input.requestId,
  );
  assert.deepEqual(counts, {
    invite_count: 0,
    command_count: 0,
    outbox_count: 0,
    audit_count: 0,
  });
}

async function assertCatalog(client) {
  const [catalog] = await client.$queryRawUnsafe(
    `SELECT
       pg_catalog.to_regclass('public."IdentityOwnerInviteIssueCommand"')::text
         AS command_table,
       pg_catalog.to_regclass('public."IdentityMailOutbox"')::text
         AS outbox_table,
       proc.prosecdef AS security_definer,
       proc.provolatile::text AS volatility,
       proc.proconfig = ARRAY['search_path=pg_catalog']::text[]
         AS exact_search_path,
       owner.rolname = CURRENT_USER AS owned_by_migration_role,
       NOT EXISTS (
         SELECT 1
         FROM pg_catalog.aclexplode(
           COALESCE(
             proc.proacl,
             pg_catalog.acldefault('f', proc.proowner)
           )
         ) AS acl
         WHERE acl.grantee = 0
           AND acl.privilege_type = 'EXECUTE'
       ) AS public_execute_revoked
     FROM pg_catalog.pg_proc AS proc
     JOIN pg_catalog.pg_namespace AS namespace
       ON namespace.oid = proc.pronamespace
     JOIN pg_catalog.pg_roles AS owner
       ON owner.oid = proc.proowner
     WHERE namespace.nspname = 'public'
       AND proc.oid = $1::regprocedure`,
    ISSUE_CATALOG_SIGNATURE,
  );
  assert.equal(catalog?.command_table, '"IdentityOwnerInviteIssueCommand"');
  assert.equal(catalog?.outbox_table, '"IdentityMailOutbox"');
  assert.equal(catalog?.security_definer, true);
  assert.equal(catalog?.volatility, "v");
  assert.equal(catalog?.exact_search_path, true);
  assert.equal(catalog?.owned_by_migration_role, true);
  assert.equal(catalog?.public_execute_revoked, true);

  const [aclState] = await client.$queryRawUnsafe(
    `SELECT pg_catalog.count(*)::integer AS non_owner_acl_count
     FROM (
       SELECT relation.oid, acl.grantee
       FROM pg_catalog.pg_class AS relation
       INNER JOIN pg_catalog.pg_namespace AS namespace
         ON namespace.oid = relation.relnamespace
       CROSS JOIN LATERAL pg_catalog.aclexplode(
         COALESCE(
           relation.relacl,
           pg_catalog.acldefault('r', relation.relowner)
         )
       ) AS acl
       WHERE namespace.nspname = 'public'
         AND relation.relkind = 'r'
         AND relation.relname IN (
           'IdentityOwnerInviteIssueCommand',
           'IdentityMailOutbox'
         )
         AND acl.grantee <> relation.relowner
       UNION ALL
       SELECT attribute.attrelid, acl.grantee
       FROM pg_catalog.pg_attribute AS attribute
       INNER JOIN pg_catalog.pg_class AS relation
         ON relation.oid = attribute.attrelid
       INNER JOIN pg_catalog.pg_namespace AS namespace
         ON namespace.oid = relation.relnamespace
       CROSS JOIN LATERAL pg_catalog.aclexplode(
         attribute.attacl
       ) AS acl
       WHERE namespace.nspname = 'public'
         AND relation.relkind = 'r'
         AND relation.relname IN (
           'IdentityOwnerInviteIssueCommand',
           'IdentityMailOutbox'
         )
         AND attribute.attnum > 0
         AND NOT attribute.attisdropped
         AND acl.grantee <> relation.relowner
       UNION ALL
       SELECT procedure.oid, acl.grantee
       FROM pg_catalog.pg_proc AS procedure
       INNER JOIN pg_catalog.pg_namespace AS namespace
         ON namespace.oid = procedure.pronamespace
       CROSS JOIN LATERAL pg_catalog.aclexplode(
         COALESCE(
           procedure.proacl,
           pg_catalog.acldefault('f', procedure.proowner)
         )
       ) AS acl
       WHERE namespace.nspname = 'public'
         AND procedure.proname IN (
           'identity_owner_invite_issue_command_immutable_v1',
           'identity_mail_outbox_hold_immutable_v1',
           'identity_owner_invite_issue_hold_v1'
         )
         AND acl.grantee <> procedure.proowner
     ) AS unsafe_acl`,
  );
  assert.equal(aclState?.non_owner_acl_count, 0);

  const columnAclRows = await client.$queryRawUnsafe(
    `SELECT
       relation.relname AS table_name,
       attribute.attname AS column_name,
       (
         SELECT pg_catalog.count(*)::integer
         FROM pg_catalog.aclexplode(attribute.attacl) AS acl
         WHERE acl.grantee <> relation.relowner
       ) AS direct_non_owner_acl_count,
       (
         SELECT pg_catalog.count(*)::integer
         FROM pg_catalog.aclexplode(attribute.attacl) AS acl
         WHERE acl.grantee = 0
       ) AS direct_public_acl_count
     FROM pg_catalog.pg_attribute AS attribute
     INNER JOIN pg_catalog.pg_class AS relation
       ON relation.oid = attribute.attrelid
     INNER JOIN pg_catalog.pg_namespace AS namespace
       ON namespace.oid = relation.relnamespace
     WHERE namespace.nspname = 'public'
       AND relation.relkind = 'r'
       AND relation.relname IN (
         'IdentityOwnerInviteIssueCommand',
         'IdentityMailOutbox'
       )
       AND attribute.attnum > 0
       AND NOT attribute.attisdropped
     ORDER BY relation.relname, attribute.attname`,
  );
  const expectedColumnAclRows = Object.entries(NEW_SEALED_COLUMN_MANIFEST)
    .flatMap(([tableName, columns]) =>
      columns.map((columnName) => ({
        table_name: tableName,
        column_name: columnName,
        direct_non_owner_acl_count: 0,
        direct_public_acl_count: 0,
      })),
    )
    .sort(
      (left, right) =>
        left.table_name.localeCompare(right.table_name) ||
        left.column_name.localeCompare(right.column_name),
    );
  assert.equal(expectedColumnAclRows.length, 37);
  assert.deepEqual(columnAclRows, expectedColumnAclRows);

  const enumRows = await client.$queryRawUnsafe(
    `SELECT type.typname, enum.enumlabel
     FROM pg_catalog.pg_type AS type
     JOIN pg_catalog.pg_enum AS enum ON enum.enumtypid = type.oid
     WHERE type.typname IN ('IdentityMailTemplate', 'IdentityMailOutboxStatus')
     ORDER BY type.typname, enum.enumsortorder`,
  );
  assert.deepEqual(enumRows, [
    {
      typname: "IdentityMailOutboxStatus",
      enumlabel: "HOLD",
    },
    {
      typname: "IdentityMailTemplate",
      enumlabel: "INITIAL_OWNER_INVITE",
    },
  ]);
}

async function assertAuthorityFailures(client, fixtures) {
  const { mainInput, typeInput, otherTenantId } = fixtures;
  const failures = [
    [
      "wrong locator",
      cloneIssueInput(mainInput, { workflowLocator: randomUUID() }),
    ],
    ["wrong tenant", cloneIssueInput(mainInput, { tenantId: otherTenantId })],
    [
      "wrong subject",
      cloneIssueInput(mainInput, { reservationSubjectId: randomUUID() }),
    ],
    ["wrong revision", cloneIssueInput(mainInput, { expectedRevision: 2 })],
    ["wrong type", typeInput],
  ];
  for (const [label, input] of failures) {
    await expectDatabaseFailure(label, () => issue(client, input), [
      "22023",
      "23503",
      "23505",
      "23514",
    ]);
  }

  const malformed = [
    cloneIssueInput(mainInput, { workflowLocator: "not-a-uuid" }),
    cloneIssueInput(mainInput, { requestId: "not-a-uuid" }),
    cloneIssueInput(mainInput, { requestDigest: "A".repeat(64) }),
    cloneIssueInput(mainInput, { aadEnvironment: " CI " }),
    cloneIssueInput(mainInput, { commandId: "not-a-uuid" }),
    cloneIssueInput(mainInput, { messageKey: "not-a-uuid" }),
    cloneIssueInput(mainInput, { tokenHash: "bad" }),
    cloneIssueInput(mainInput, {
      ciphertext: Buffer.alloc(70, 1),
    }),
    cloneIssueInput(mainInput, {
      expiresAt: new Date("2020-01-01T00:00:00.000Z"),
    }),
  ];
  for (const [index, input] of malformed.entries()) {
    await expectDatabaseFailure(
      `malformed input ${index + 1}`,
      () => issue(client, input),
      ["22023", "23503", "23505", "23514"],
    );
  }
  await assertNoAggregate(client, mainInput);
  const claim = await readClaimByLocator(client, mainInput.workflowLocator);
  assert.equal(claim.subject_id, mainInput.reservationSubjectId);
  assert.equal(claim.revision, 1);
}

async function assertHappyReplayAndCollisions(client, input, canonicalEmail) {
  const created = await issue(client, input);
  assertExactReceipt(created, input, "CREATED");
  assertReceiptIsPiiFree(created, input, canonicalEmail);
  const beforeReplay = await readAggregate(client, input);
  assertAggregate(beforeReplay, input, canonicalEmail);
  const stableBefore = stableAggregateProjection(beforeReplay);

  const replayed = await issue(
    client,
    cloneIssueInput(input, {
      commandId: "ignored-on-replay",
      inviteId: "ignored-on-replay",
      outboxId: "ignored-on-replay",
      messageKey: "ignored-on-replay",
      tokenHash: "ignored-on-replay",
      ciphertext: Buffer.alloc(1),
      expiresAt: new Date("2020-01-01T00:00:00.000Z"),
    }),
  );
  assertExactReceipt(replayed, input, "REPLAYED");
  assertReceiptIsPiiFree(replayed, input, canonicalEmail);
  const afterReplay = await readAggregate(client, input);
  assert.deepEqual(stableAggregateProjection(afterReplay), stableBefore);

  await expectDatabaseFailure(
    "same request with different digest",
    () =>
      issue(
        client,
        cloneIssueInput(input, {
          requestDigest: randomBytes(32).toString("hex"),
          commandId: randomUUID(),
          inviteId: randomUUID(),
          outboxId: randomUUID(),
          messageKey: randomUUID(),
          tokenHash: randomBytes(32).toString("hex"),
          ciphertext: Buffer.concat([Buffer.from([1]), randomBytes(70)]),
        }),
      ),
    ["22023", "23505", "23514"],
  );
  await expectDatabaseFailure(
    "different request for the same locator",
    () =>
      issue(
        client,
        cloneIssueInput(input, {
          requestId: randomUUID(),
          commandId: randomUUID(),
          inviteId: randomUUID(),
          outboxId: randomUUID(),
          messageKey: randomUUID(),
          tokenHash: randomBytes(32).toString("hex"),
          ciphertext: Buffer.concat([Buffer.from([1]), randomBytes(70)]),
        }),
      ),
    ["22023", "23503", "23505", "23514"],
  );
  assert.deepEqual(
    stableAggregateProjection(await readAggregate(client, input)),
    stableBefore,
  );
}

async function assertLateFaultRollback(client, input) {
  await client.$executeRawUnsafe(
    `CREATE FUNCTION public."identity_owner_hold_smoke_fault_v1"()
     RETURNS trigger
     LANGUAGE plpgsql
     SET search_path = pg_catalog
     AS $$
     BEGIN
       RAISE EXCEPTION USING
         ERRCODE = 'P0001',
         MESSAGE = 'owner hold smoke injected audit fault';
     END;
     $$`,
  );
  await client.$executeRawUnsafe(
    `CREATE TRIGGER "identity_owner_hold_smoke_fault_trigger"
     BEFORE INSERT ON public."PlatformAdminAuditEvent"
     FOR EACH ROW
     EXECUTE FUNCTION public."identity_owner_hold_smoke_fault_v1"()`,
  );
  try {
    await expectDatabaseFailure(
      "late audit fault",
      () => issue(client, input),
      ["P0001"],
    );
  } finally {
    await client.$executeRawUnsafe(
      `DROP TRIGGER IF EXISTS "identity_owner_hold_smoke_fault_trigger"
       ON public."PlatformAdminAuditEvent"`,
    );
    await client.$executeRawUnsafe(
      `DROP FUNCTION IF EXISTS public."identity_owner_hold_smoke_fault_v1"()`,
    );
  }
  await assertNoAggregate(client, input);
  const claim = await readClaimByLocator(client, input.workflowLocator);
  assert.equal(claim.subject_id, input.reservationSubjectId);
  assert.equal(claim.revision, 1);
}

async function assertImmutableAndProgressedMismatch(
  client,
  input,
  canonicalEmail,
) {
  const created = await issue(client, input);
  assertExactReceipt(created, input, "CREATED");
  const before = await readAggregate(client, input);
  assertAggregate(before, input, canonicalEmail);

  for (const [label, operation] of [
    [
      "command update",
      () =>
        client.$executeRawUnsafe(
          `UPDATE public."IdentityOwnerInviteIssueCommand"
           SET "requestId" = "requestId"
           WHERE "id" = $1 AND "tenantId" = $2`,
          input.commandId,
          input.tenantId,
        ),
    ],
    [
      "command delete",
      () =>
        client.$executeRawUnsafe(
          `DELETE FROM public."IdentityOwnerInviteIssueCommand"
           WHERE "id" = $1 AND "tenantId" = $2`,
          input.commandId,
          input.tenantId,
        ),
    ],
    [
      "outbox update",
      () =>
        client.$executeRawUnsafe(
          `UPDATE public."IdentityMailOutbox"
           SET "status" = "status"
           WHERE "id" = $1 AND "tenantId" = $2`,
          input.outboxId,
          input.tenantId,
        ),
    ],
    [
      "outbox delete",
      () =>
        client.$executeRawUnsafe(
          `DELETE FROM public."IdentityMailOutbox"
           WHERE "id" = $1 AND "tenantId" = $2`,
          input.outboxId,
          input.tenantId,
        ),
    ],
  ]) {
    await expectDatabaseFailure(label, operation, ["55000"]);
  }
  assert.deepEqual(
    stableAggregateProjection(await readAggregate(client, input)),
    stableAggregateProjection(before),
  );

  await client.$executeRawUnsafe(
    `UPDATE public."UserInvite"
     SET "role" = 'MANAGER'::public."UserRole"
     WHERE "id" = $1 AND "tenantId" = $2`,
    input.inviteId,
    input.tenantId,
  );
  await expectDatabaseFailure(
    "progressed invite mismatch",
    () => issue(client, input),
    ["23514"],
  );
  const afterMismatch = await readAggregate(client, input);
  assert.equal(afterMismatch.invite.role, "MANAGER");
  assert.deepEqual(
    stableAggregateProjection({
      command: afterMismatch.command,
      outbox: afterMismatch.outbox,
      claim: afterMismatch.claim,
      audits: afterMismatch.audits,
    }),
    stableAggregateProjection({
      command: before.command,
      outbox: before.outbox,
      claim: before.claim,
      audits: before.audits,
    }),
  );
  assert.equal(afterMismatch.invite.token_hash, before.invite.token_hash);
  return {
    immutableCommandUpdateRejected: true,
    immutableCommandDeleteRejected: true,
    immutableOutboxUpdateRejected: true,
    immutableOutboxDeleteRejected: true,
    progressedStateMismatchRejected: true,
  };
}

async function assertConcurrentReplay(databaseUrl, input, canonicalEmail) {
  const clients = Array.from({ length: 16 }, () => prismaClient(databaseUrl));
  try {
    const contenders = 100;
    const receipts = await Promise.all(
      Array.from({ length: contenders }, (_unused, index) =>
        issue(clients[index % clients.length], input),
      ),
    );
    assert.equal(
      receipts.filter((receipt) => receipt.decision === "CREATED").length,
      1,
    );
    assert.equal(
      receipts.filter((receipt) => receipt.decision === "REPLAYED").length,
      contenders - 1,
    );
    for (const receipt of receipts) {
      assertExactReceipt(receipt, input, receipt.decision);
      assertReceiptIsPiiFree(receipt, input, canonicalEmail);
    }
  } finally {
    await Promise.allSettled(clients.map((client) => client.$disconnect()));
  }
  const verifier = prismaClient(databaseUrl);
  try {
    assertAggregate(
      await readAggregate(verifier, input),
      input,
      canonicalEmail,
    );
  } finally {
    await verifier.$disconnect();
  }
  return {
    contenders: 100,
    created: 1,
    replayed: 99,
    deadlocks: 0,
  };
}

function assertConflictIsGeneric(error, inputs, canonicalEmail) {
  const states = extractSqlStates(error);
  assert.equal(states.has("40P01"), false, "locator contenders deadlocked");
  assert(
    [...states].some((state) =>
      ["22023", "23503", "23505", "23514"].includes(state),
    ),
    "locator loser returned unexpected SQLSTATE",
  );
  const visibleError = [
    error?.name,
    error?.message,
    error?.stack,
    error?.cause?.message,
    error?.meta?.message,
    error?.meta?.database_error,
  ]
    .filter((value) => typeof value === "string")
    .join("\n");
  for (const forbidden of [
    canonicalEmail,
    ...inputs.flatMap((input) => [
      input.rawToken,
      input.tokenHash,
      input.ciphertext.toString("hex"),
    ]),
  ]) {
    assert.equal(
      visibleError.includes(forbidden),
      false,
      "locator conflict leaked identity or secret material",
    );
  }
}

async function waitForSharedBarrierWaiters(coordinator, barrierObject) {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const [row] = await coordinator.$queryRawUnsafe(
      `SELECT pg_catalog.count(*)::integer AS waiter_count
       FROM pg_catalog.pg_locks
       WHERE locktype = 'advisory'
         AND database = (
           SELECT database.oid
           FROM pg_catalog.pg_database AS database
           WHERE database.datname = CURRENT_DATABASE()
         )
         AND classid = $1::integer::oid
         AND objid = $2::integer::oid
         AND objsubid = 2
         AND NOT granted`,
      CONCURRENCY_BARRIER_LOCK_CLASS,
      barrierObject,
    );
    if (row?.waiter_count === 2) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
  }
  assert.fail("two locator contenders did not reach the shared barrier");
}

async function assertDifferentRequestSameLocatorConcurrency(
  databaseUrl,
  baseInput,
  canonicalEmail,
) {
  const coordinator = prismaClient(databaseUrl);
  const contenders = [prismaClient(databaseUrl), prismaClient(databaseUrl)];
  const barrierObject = randomBytes(4).readUInt32BE(0) % 2_147_483_647;
  const inputs = [
    cloneIssueInput(baseInput),
    cloneIssueInput(baseInput, {
      requestId: randomUUID(),
      requestDigest: randomBytes(32).toString("hex"),
      commandId: randomUUID(),
      inviteId: randomUUID(),
      outboxId: randomUUID(),
      messageKey: randomUUID(),
      tokenHash: randomBytes(32).toString("hex"),
      ciphertext: Buffer.concat([Buffer.from([1]), randomBytes(70)]),
    }),
  ];
  let barrierHeld = false;
  let settledPromises = [];
  let results;
  try {
    const [acquired] = await coordinator.$queryRawUnsafe(
      `SELECT pg_catalog.pg_try_advisory_lock(
         $1::integer,
         $2::integer
       ) AS acquired`,
      CONCURRENCY_BARRIER_LOCK_CLASS,
      barrierObject,
    );
    assert.equal(acquired?.acquired, true);
    barrierHeld = true;

    settledPromises = contenders.map((client, index) =>
      client
        .$transaction(
          async (transaction) => {
            const [barrier] = await transaction.$queryRawUnsafe(
              `WITH acquired AS MATERIALIZED (
                 SELECT pg_catalog.pg_advisory_xact_lock_shared(
                   $1::integer,
                   $2::integer
                 )
               )
               SELECT 1::integer AS ready
               FROM acquired`,
              CONCURRENCY_BARRIER_LOCK_CLASS,
              barrierObject,
            );
            assert.equal(barrier?.ready, 1);
            return issue(transaction, inputs[index]);
          },
          {
            isolationLevel: "ReadCommitted",
            maxWait: 5_000,
            timeout: 30_000,
          },
        )
        .then(
          (value) => ({ status: "fulfilled", value }),
          (reason) => ({ status: "rejected", reason }),
        ),
    );

    await waitForSharedBarrierWaiters(coordinator, barrierObject);
    const [released] = await coordinator.$queryRawUnsafe(
      `SELECT pg_catalog.pg_advisory_unlock(
         $1::integer,
         $2::integer
       ) AS released`,
      CONCURRENCY_BARRIER_LOCK_CLASS,
      barrierObject,
    );
    assert.equal(released?.released, true);
    barrierHeld = false;
    results = await Promise.all(settledPromises);
  } finally {
    if (barrierHeld) {
      await coordinator.$queryRawUnsafe(
        `SELECT pg_catalog.pg_advisory_unlock(
           $1::integer,
           $2::integer
         )`,
        CONCURRENCY_BARRIER_LOCK_CLASS,
        barrierObject,
      );
    }
    await Promise.allSettled(settledPromises);
    await Promise.allSettled([
      coordinator.$disconnect(),
      ...contenders.map((client) => client.$disconnect()),
    ]);
  }

  assert.ok(results);
  const fulfilled = results
    .map((result, index) => ({ ...result, index }))
    .filter((result) => result.status === "fulfilled");
  const rejected = results
    .map((result, index) => ({ ...result, index }))
    .filter((result) => result.status === "rejected");
  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);

  const winner = fulfilled[0];
  const loser = rejected[0];
  assertExactReceipt(winner.value, inputs[winner.index], "CREATED");
  assertReceiptIsPiiFree(winner.value, inputs[winner.index], canonicalEmail);
  assertConflictIsGeneric(loser.reason, inputs, canonicalEmail);

  const verifier = prismaClient(databaseUrl);
  try {
    assertAggregate(
      await readAggregate(verifier, inputs[winner.index]),
      inputs[winner.index],
      canonicalEmail,
    );
    await assertNoAggregate(verifier, inputs[loser.index]);
  } finally {
    await verifier.$disconnect();
  }
  return {
    contenders: 2,
    barrierWaiters: 2,
    created: 1,
    genericConflicts: 1,
    partialLoserAggregates: 0,
    deadlocks: 0,
  };
}

async function assertRoleHasNoTablePrivileges(admin, roleName) {
  for (const tableName of SEALED_TABLES) {
    const [row] = await admin.$queryRawUnsafe(
      `SELECT
         pg_catalog.has_table_privilege($1, $2, 'SELECT') AS can_select,
         pg_catalog.has_table_privilege($1, $2, 'INSERT') AS can_insert,
         pg_catalog.has_table_privilege($1, $2, 'UPDATE') AS can_update,
         pg_catalog.has_table_privilege($1, $2, 'DELETE') AS can_delete,
         pg_catalog.has_table_privilege($1, $2, 'TRUNCATE') AS can_truncate,
         pg_catalog.has_table_privilege($1, $2, 'REFERENCES') AS can_reference,
         pg_catalog.has_table_privilege($1, $2, 'TRIGGER') AS can_trigger`,
      roleName,
      `public."${tableName}"`,
    );
    assert.deepEqual(row, {
      can_select: false,
      can_insert: false,
      can_update: false,
      can_delete: false,
      can_truncate: false,
      can_reference: false,
      can_trigger: false,
    });
    const [columns] = await admin.$queryRawUnsafe(
      `SELECT pg_catalog.count(*)::integer AS privilege_count
       FROM information_schema.column_privileges
       WHERE grantee = $1 AND table_schema = 'public' AND table_name = $2`,
      roleName,
      tableName,
    );
    assert.equal(columns?.privilege_count, 0);
  }
}

async function assertRoleHasNoEffectiveNewColumnPrivileges(admin, roleName) {
  assertSafeRoleName(roleName);
  const rows = await admin.$queryRawUnsafe(
    `SELECT
       relation.relname AS table_name,
       attribute.attname AS column_name,
       pg_catalog.has_column_privilege(
         $1,
         relation.oid,
         attribute.attnum,
         'SELECT'
       ) AS can_select,
       pg_catalog.has_column_privilege(
         $1,
         relation.oid,
         attribute.attnum,
         'INSERT'
       ) AS can_insert,
       pg_catalog.has_column_privilege(
         $1,
         relation.oid,
         attribute.attnum,
         'UPDATE'
       ) AS can_update,
       pg_catalog.has_column_privilege(
         $1,
         relation.oid,
         attribute.attnum,
         'REFERENCES'
       ) AS can_reference
     FROM pg_catalog.pg_attribute AS attribute
     INNER JOIN pg_catalog.pg_class AS relation
       ON relation.oid = attribute.attrelid
     INNER JOIN pg_catalog.pg_namespace AS namespace
       ON namespace.oid = relation.relnamespace
     WHERE namespace.nspname = 'public'
       AND relation.relkind = 'r'
       AND relation.relname IN (
         'IdentityOwnerInviteIssueCommand',
         'IdentityMailOutbox'
       )
       AND attribute.attnum > 0
       AND NOT attribute.attisdropped
     ORDER BY relation.relname, attribute.attname`,
    roleName,
  );
  const expected = Object.entries(NEW_SEALED_COLUMN_MANIFEST)
    .flatMap(([tableName, columns]) =>
      columns.map((columnName) => ({
        table_name: tableName,
        column_name: columnName,
        can_select: false,
        can_insert: false,
        can_update: false,
        can_reference: false,
      })),
    )
    .sort(
      (left, right) =>
        left.table_name.localeCompare(right.table_name) ||
        left.column_name.localeCompare(right.column_name),
    );
  assert.deepEqual(rows, expected);
  return rows.length * COLUMN_PRIVILEGES.length;
}

async function expectPermissionDenied(operation) {
  await expectDatabaseFailure("permission boundary", operation, ["42501"]);
}

async function assertEnumUsageWithoutAuthority(
  admin,
  sourceUrl,
  databaseName,
  role,
) {
  const roleIdentifier = quoteIdentifier(role.roleName);
  await admin.$executeRawUnsafe(
    `GRANT USAGE ON SCHEMA public TO ${roleIdentifier}`,
  );
  await assertRoleHasNoTablePrivileges(admin, role.roleName);
  const effectiveColumnPrivilegeChecks =
    await assertRoleHasNoEffectiveNewColumnPrivileges(admin, role.roleName);

  const [privileges] = await admin.$queryRawUnsafe(
    `SELECT
       pg_catalog.has_type_privilege(
         $1,
         'public."IdentityMailTemplate"',
         'USAGE'
       ) AS template_usage,
       pg_catalog.has_type_privilege(
         $1,
         'public."IdentityMailOutboxStatus"',
         'USAGE'
       ) AS status_usage,
       pg_catalog.has_function_privilege(
         $1,
         $2,
         'EXECUTE'
       ) AS issue_execute`,
    role.roleName,
    ISSUE_CATALOG_SIGNATURE,
  );
  assert.deepEqual(privileges, {
    template_usage: true,
    status_usage: true,
    issue_execute: false,
  });

  const roleClient = prismaClient(
    databaseUrlFor(sourceUrl, databaseName, role.roleName, role.password),
  );
  const probeInput = issueInput({
    tenantId: randomUUID(),
    reservationSubjectId: randomUUID(),
    workflowLocator: randomUUID(),
  });
  try {
    const [enumValues] = await roleClient.$queryRawUnsafe(
      `SELECT
         'INITIAL_OWNER_INVITE'::public."IdentityMailTemplate"::text
           AS template,
         'HOLD'::public."IdentityMailOutboxStatus"::text AS status`,
    );
    assert.deepEqual(enumValues, {
      template: "INITIAL_OWNER_INVITE",
      status: "HOLD",
    });
    await expectPermissionDenied(() => issue(roleClient, probeInput));
    for (const tableName of SEALED_TABLES) {
      await expectPermissionDenied(() =>
        roleClient.$queryRawUnsafe(
          `SELECT * FROM public.${quoteIdentifier(tableName)} LIMIT 1`,
        ),
      );
    }
  } finally {
    await roleClient.$disconnect();
  }
  return {
    publicEnumUsage: true,
    issueExecute: false,
    sealedTablePrivileges: 0,
    effectiveColumnPrivilegeChecks,
  };
}

async function assertCleanAcl(
  admin,
  sourceUrl,
  cleanDatabaseName,
  roles,
  fixture,
) {
  const appRole = quoteIdentifier(roles.appRoleName);
  const issuerRole = quoteIdentifier(roles.issuerRoleName);
  await admin.$executeRawUnsafe(
    `GRANT USAGE ON SCHEMA public TO ${appRole}, ${issuerRole}`,
  );
  for (const statement of buildHistoricalCurrent171RuntimeEnrollmentStatements(
    roles.appRoleName,
  )) {
    await admin.$executeRawUnsafe(statement);
  }
  await admin.$executeRawUnsafe(
    `GRANT EXECUTE ON FUNCTION ${ISSUE_GRANT_SIGNATURE} TO ${issuerRole}`,
  );

  await assertRoleHasNoTablePrivileges(admin, roles.appRoleName);
  await assertRoleHasNoTablePrivileges(admin, roles.issuerRoleName);
  const applicationColumnPrivilegeChecks =
    await assertRoleHasNoEffectiveNewColumnPrivileges(admin, roles.appRoleName);
  const issuerColumnPrivilegeChecks =
    await assertRoleHasNoEffectiveNewColumnPrivileges(
      admin,
      roles.issuerRoleName,
    );

  const appClient = prismaClient(
    databaseUrlFor(
      sourceUrl,
      cleanDatabaseName,
      roles.appRoleName,
      roles.appPassword,
    ),
  );
  const issuerClient = prismaClient(
    databaseUrlFor(
      sourceUrl,
      cleanDatabaseName,
      roles.issuerRoleName,
      roles.issuerPassword,
    ),
  );
  try {
    await expectPermissionDenied(() => issue(appClient, fixture.input));
    for (const tableName of SEALED_TABLES) {
      await expectPermissionDenied(() =>
        appClient.$queryRawUnsafe(
          `SELECT * FROM public.${quoteIdentifier(tableName)} LIMIT 1`,
        ),
      );
      await expectPermissionDenied(() =>
        issuerClient.$queryRawUnsafe(
          `SELECT * FROM public.${quoteIdentifier(tableName)} LIMIT 1`,
        ),
      );
    }
    const receipt = await issue(issuerClient, fixture.input);
    assertExactReceipt(receipt, fixture.input, "CREATED");
    assertReceiptIsPiiFree(receipt, fixture.input, fixture.canonicalEmail);
  } finally {
    await appClient.$disconnect();
    await issuerClient.$disconnect();
  }

  const directGrants = await admin.$queryRawUnsafe(
    `SELECT routine_name
     FROM information_schema.routine_privileges
     WHERE grantee = $1
       AND routine_schema = 'public'
       AND privilege_type = 'EXECUTE'
     ORDER BY routine_name`,
    roles.issuerRoleName,
  );
  assert.deepEqual(directGrants, [{ routine_name: ISSUE_FUNCTION }]);

  let appExecuteCount = 0;
  for (const entry of HISTORICAL_CURRENT_171_RUNTIME_FUNCTIONS) {
    const [row] = await admin.$queryRawUnsafe(
      `SELECT pg_catalog.has_function_privilege(
         $1,
         $2,
         'EXECUTE'
       ) AS can_execute`,
      roles.appRoleName,
      entry.catalogSignature,
    );
    if (row?.can_execute) appExecuteCount += 1;
  }
  assert.equal(appExecuteCount, 7);
  const [pending] = await admin.$queryRawUnsafe(
    `SELECT pg_catalog.has_function_privilege(
       $1,
       $2,
       'EXECUTE'
     ) AS can_execute`,
    roles.appRoleName,
    ISSUE_CATALOG_SIGNATURE,
  );
  assert.equal(pending?.can_execute, false);
  return {
    publicIssueExecute: false,
    applicationIssueExecute: false,
    applicationFunctionGrants: appExecuteCount,
    issuerDirectFunctionGrants: directGrants.length,
    sealedTablePrivileges: 0,
    applicationColumnPrivilegeChecks,
    issuerColumnPrivilegeChecks,
  };
}

async function createCurrent170Fixtures(client, prefix) {
  const ids = {
    mainTenantId: randomUUID(),
    otherTenantId: randomUUID(),
    faultTenantId: randomUUID(),
    raceTenantId: randomUUID(),
    typeTenantId: randomUUID(),
    tamperTenantId: randomUUID(),
    mainReservationId: randomUUID(),
    faultReservationId: randomUUID(),
    raceReservationId: randomUUID(),
    typeReservationId: randomUUID(),
    tamperReservationId: randomUUID(),
    typeUserId: randomUUID(),
  };
  for (const [tenantId, suffix] of [
    [ids.mainTenantId, `${prefix}-main`],
    [ids.otherTenantId, `${prefix}-other`],
    [ids.faultTenantId, `${prefix}-fault`],
    [ids.raceTenantId, `${prefix}-race`],
    [ids.typeTenantId, `${prefix}-type`],
    [ids.tamperTenantId, `${prefix}-tamper`],
  ]) {
    await createTenant(client, tenantId, suffix);
  }
  const mainEmailInput = ` Owner.${prefix}.Main@Example.Test `;
  const faultEmailInput = `Owner.${prefix}.Fault@Example.Test`;
  const raceEmailInput = `Owner.${prefix}.Race@Example.Test`;
  const typeEmailInput = `Owner.${prefix}.Type@Example.Test`;
  const tamperEmailInput = `Owner.${prefix}.Tamper@Example.Test`;
  const mainClaim = await reserveIdentity(
    client,
    mainEmailInput,
    ids.mainTenantId,
    ids.mainReservationId,
  );
  const faultClaim = await reserveIdentity(
    client,
    faultEmailInput,
    ids.faultTenantId,
    ids.faultReservationId,
  );
  const raceClaim = await reserveIdentity(
    client,
    raceEmailInput,
    ids.raceTenantId,
    ids.raceReservationId,
  );
  const typeClaim = await reserveIdentity(
    client,
    typeEmailInput,
    ids.typeTenantId,
    ids.typeReservationId,
  );
  const tamperClaim = await reserveIdentity(
    client,
    tamperEmailInput,
    ids.tamperTenantId,
    ids.tamperReservationId,
  );
  await insertUserAndTransitionClaim(client, {
    email: typeClaim.email_canonical,
    tenantId: ids.typeTenantId,
    reservationSubjectId: ids.typeReservationId,
    userId: ids.typeUserId,
  });
  return {
    ...ids,
    mainCanonicalEmail: mainClaim.email_canonical,
    faultCanonicalEmail: faultClaim.email_canonical,
    raceCanonicalEmail: raceClaim.email_canonical,
    tamperCanonicalEmail: tamperClaim.email_canonical,
    mainInput: issueInput({
      tenantId: ids.mainTenantId,
      reservationSubjectId: ids.mainReservationId,
      workflowLocator: mainClaim.workflow_locator,
    }),
    faultInput: issueInput({
      tenantId: ids.faultTenantId,
      reservationSubjectId: ids.faultReservationId,
      workflowLocator: faultClaim.workflow_locator,
    }),
    raceInput: issueInput({
      tenantId: ids.raceTenantId,
      reservationSubjectId: ids.raceReservationId,
      workflowLocator: raceClaim.workflow_locator,
    }),
    tamperInput: issueInput({
      tenantId: ids.tamperTenantId,
      reservationSubjectId: ids.tamperReservationId,
      workflowLocator: tamperClaim.workflow_locator,
    }),
    typeInput: {
      ...issueInput({
        tenantId: ids.typeTenantId,
        reservationSubjectId: ids.typeUserId,
        workflowLocator: typeClaim.workflow_locator,
      }),
      expectedRevision: 2,
    },
  };
}

async function createCleanFixture(client, prefix) {
  const tenantId = randomUUID();
  const reservationSubjectId = randomUUID();
  await createTenant(client, tenantId, `${prefix}-clean`);
  const claim = await reserveIdentity(
    client,
    `Owner.${prefix}.Clean@Example.Test`,
    tenantId,
    reservationSubjectId,
  );
  return {
    canonicalEmail: claim.email_canonical,
    input: issueInput({
      tenantId,
      reservationSubjectId,
      workflowLocator: claim.workflow_locator,
    }),
  };
}

function assertRealEnvironment(environment) {
  if (environment.NODE_ENV === "production") {
    contractError("PRODUCTION_ENVIRONMENT_REFUSED");
  }
  if (
    environment.IDENTITY_OWNER_INVITE_HOLD_OUTBOX_UPGRADE_SMOKE_CONFIRM !==
    REQUIRED_CONFIRMATION
  ) {
    contractError("OWNER_HOLD_UPGRADE_SMOKE_CONFIRMATION_REQUIRED");
  }
  return parseSafeSourceDatabaseUrl(environment.DATABASE_URL);
}

function expectOfflineFailure(operation) {
  assert.throws(operation);
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
  const names = generatedNames();
  assertSafeDatabaseName(names.upgradeDatabaseName);
  assertSafeDatabaseName(names.cleanDatabaseName);
  assertSafeDatabaseName(names.hostileAclDatabaseName);
  assertSafeRoleName(names.appRoleName);
  assertSafeRoleName(names.issuerRoleName);
  assertSafeRoleName(names.unsafeAclRoleName);
  expectOfflineFailure(() => assertSafeDatabaseName("leetplus_ci"));
  expectOfflineFailure(() => assertSafeRoleName("leetplus_runtime"));
  assertSafeTempRoot(join(tmpdir(), `${TEMP_ROOT_PREFIX}deadbeef`));
  expectOfflineFailure(() => assertSafeTempRoot(tmpdir()));
  expectOfflineFailure(() =>
    assertRealEnvironment({
      NODE_ENV: "production",
      DATABASE_URL:
        "postgresql://postgres:postgres@127.0.0.1:5432/leetplus_ci?schema=public",
      IDENTITY_OWNER_INVITE_HOLD_OUTBOX_UPGRADE_SMOKE_CONFIRM:
        REQUIRED_CONFIRMATION,
    }),
  );
  const plan = await readMigrationPlan();
  assert.equal(plan.prefixMigrations.length, 170);
  assert.equal(plan.prefixMigrations.at(-1), PREVIOUS_MIGRATION);
  assert.equal(plan.targetMigration, TARGET_MIGRATION);
  assert.equal(plan.allMigrations.length, 171);
  assert.equal(HISTORICAL_CURRENT_171_RUNTIME_FUNCTIONS.length, 7);
  const historicalEnrollment =
    buildHistoricalCurrent171RuntimeEnrollmentStatements(
      "lp_owner_hold_app_0123456789abcdef",
    );
  assert.equal(historicalEnrollment.length, 32);
  assert.doesNotMatch(
    historicalEnrollment.join("\n"),
    /shared_beta_|SharedBetaReleaseGateCode/u,
  );
  process.stdout.write(
    `${JSON.stringify({
      script: SCRIPT_NAME,
      status: "PASS",
      mode: "SELF_TEST",
      prefixMigrationCount: plan.prefixMigrations.length,
      targetMigration: plan.targetMigration,
      cleanMigrationCount: plan.allMigrations.length,
      generatedDatabaseCount: 3,
      generatedRoleCount: 3,
      applicationRuntimeFunctionCount: 7,
      destructiveSourceDatabaseActions: 0,
    })}\n`,
  );
}

async function runRealSmoke(environment) {
  const { sourceUrl, databaseName: sourceDatabaseName } =
    assertRealEnvironment(environment);
  const migrationPlan = await readMigrationPlan();
  const names = generatedNames();
  const roles = {
    appRoleName: names.appRoleName,
    issuerRoleName: names.issuerRoleName,
    unsafeAclRoleName: names.unsafeAclRoleName,
    appPassword: randomBytes(32).toString("hex"),
    issuerPassword: randomBytes(32).toString("hex"),
    unsafeAclPassword: randomBytes(32).toString("hex"),
  };
  const sourceUrlValue = databaseUrlFor(sourceUrl, sourceDatabaseName);
  const upgradeUrl = databaseUrlFor(sourceUrl, names.upgradeDatabaseName);
  const cleanUrl = databaseUrlFor(sourceUrl, names.cleanDatabaseName);
  const hostileAclUrl = databaseUrlFor(sourceUrl, names.hostileAclDatabaseName);
  const admin = prismaClient(sourceUrlValue);
  let tempRoot;
  let lockHeld = false;
  const createdDatabases = [];
  const createdRoles = [];
  const cleanupErrors = [];
  let primaryError;
  let evidence;

  try {
    await assertTestSuperuser(admin, sourceDatabaseName);
    const sourceMigrationState = await readSourceMigrationState(admin);
    await acquireClusterLock(admin);
    lockHeld = true;
    tempRoot = await mkdtemp(join(tmpdir(), TEMP_ROOT_PREFIX));
    assertSafeTempRoot(tempRoot);
    const artifact = await createMigrationArtifact(tempRoot, migrationPlan);

    for (const databaseName of [
      names.upgradeDatabaseName,
      names.cleanDatabaseName,
      names.hostileAclDatabaseName,
    ]) {
      await createDatabase(admin, databaseName);
      createdDatabases.push(databaseName);
    }
    await createRole(admin, roles.unsafeAclRoleName, roles.unsafeAclPassword);
    createdRoles.push(roles.unsafeAclRoleName);
    await grantDatabaseConnection(
      admin,
      names.hostileAclDatabaseName,
      roles.unsafeAclRoleName,
    );

    runMigrateDeploy(artifact.schemaPath, upgradeUrl);
    runMigrateDeploy(artifact.schemaPath, hostileAclUrl);
    let upgrade = prismaClient(upgradeUrl);
    const prefix = randomBytes(5).toString("hex");
    let fixtures;
    let progressedState;
    try {
      await assertAppliedMigrations(upgrade, migrationPlan.prefixMigrations);
      fixtures = await createCurrent170Fixtures(upgrade, prefix);
    } finally {
      await upgrade.$disconnect();
    }

    await addTargetMigration(artifact, migrationPlan);

    const hostileBefore = prismaClient(hostileAclUrl);
    try {
      await assertAppliedMigrations(
        hostileBefore,
        migrationPlan.prefixMigrations,
      );
      await setUnsafeDefaultPrivileges(
        hostileBefore,
        roles.unsafeAclRoleName,
        true,
      );
      await assertUnsafeDefaultPrivileges(
        hostileBefore,
        roles.unsafeAclRoleName,
        true,
      );
    } finally {
      await hostileBefore.$disconnect();
    }

    expectMigrateDeployFailure(artifact.schemaPath, hostileAclUrl);

    const hostileAfterFailure = prismaClient(hostileAclUrl);
    try {
      await assertTargetMigrationRolledBack(hostileAfterFailure, migrationPlan);
      await assertUnsafeDefaultPrivileges(
        hostileAfterFailure,
        roles.unsafeAclRoleName,
        true,
      );
      await setUnsafeDefaultPrivileges(
        hostileAfterFailure,
        roles.unsafeAclRoleName,
        false,
      );
      await assertUnsafeDefaultPrivileges(
        hostileAfterFailure,
        roles.unsafeAclRoleName,
        false,
      );
    } finally {
      await hostileAfterFailure.$disconnect();
    }

    runMigrateResolveRolledBack(
      artifact.schemaPath,
      hostileAclUrl,
      TARGET_MIGRATION,
    );

    const hostileColumnBefore = prismaClient(hostileAclUrl);
    try {
      await assertAppliedMigrations(
        hostileColumnBefore,
        migrationPlan.prefixMigrations,
      );
      await assertUnsafeDefaultPrivileges(
        hostileColumnBefore,
        roles.unsafeAclRoleName,
        false,
      );
      await installUnsafeColumnAclInjector(
        hostileColumnBefore,
        roles.unsafeAclRoleName,
      );
      await assertUnsafeColumnAclInjector(hostileColumnBefore, true);
    } finally {
      await hostileColumnBefore.$disconnect();
    }

    expectMigrateDeployFailure(artifact.schemaPath, hostileAclUrl);

    const hostileColumnAfterFailure = prismaClient(hostileAclUrl);
    try {
      await assertTargetMigrationRolledBack(
        hostileColumnAfterFailure,
        migrationPlan,
      );
      await assertUnsafeDefaultPrivileges(
        hostileColumnAfterFailure,
        roles.unsafeAclRoleName,
        false,
      );
      await assertUnsafeColumnAclInjector(hostileColumnAfterFailure, true);
      await dropUnsafeColumnAclInjector(hostileColumnAfterFailure);
      await assertUnsafeColumnAclInjector(hostileColumnAfterFailure, false);
    } finally {
      await hostileColumnAfterFailure.$disconnect();
    }

    runMigrateResolveRolledBack(
      artifact.schemaPath,
      hostileAclUrl,
      TARGET_MIGRATION,
    );
    runMigrateDeploy(artifact.schemaPath, hostileAclUrl);

    const hostileAfterRetry = prismaClient(hostileAclUrl);
    let hostileAcl;
    try {
      await assertAppliedMigrations(
        hostileAfterRetry,
        migrationPlan.allMigrations,
      );
      await assertCatalog(hostileAfterRetry);
      hostileAcl = await assertEnumUsageWithoutAuthority(
        hostileAfterRetry,
        sourceUrl,
        names.hostileAclDatabaseName,
        {
          roleName: roles.unsafeAclRoleName,
          password: roles.unsafeAclPassword,
        },
      );
    } finally {
      await hostileAfterRetry.$disconnect();
    }

    runMigrateDeploy(artifact.schemaPath, upgradeUrl);
    runMigrateDeploy(artifact.schemaPath, cleanUrl);

    upgrade = prismaClient(upgradeUrl);
    try {
      await assertAppliedMigrations(upgrade, migrationPlan.allMigrations);
      await assertCatalog(upgrade);
      await assertAuthorityFailures(upgrade, fixtures);
      await assertHappyReplayAndCollisions(
        upgrade,
        fixtures.mainInput,
        fixtures.mainCanonicalEmail,
      );
      await assertLateFaultRollback(upgrade, fixtures.faultInput);
      progressedState = await assertImmutableAndProgressedMismatch(
        upgrade,
        fixtures.tamperInput,
        fixtures.tamperCanonicalEmail,
      );
    } finally {
      await upgrade.$disconnect();
    }
    const concurrency = await assertConcurrentReplay(
      upgradeUrl,
      fixtures.raceInput,
      fixtures.raceCanonicalEmail,
    );
    const locatorConcurrency =
      await assertDifferentRequestSameLocatorConcurrency(
        upgradeUrl,
        fixtures.faultInput,
        fixtures.faultCanonicalEmail,
      );

    for (const [roleName, password] of [
      [roles.appRoleName, roles.appPassword],
      [roles.issuerRoleName, roles.issuerPassword],
    ]) {
      await createRole(admin, roleName, password);
      createdRoles.push(roleName);
      await grantDatabaseConnection(admin, names.cleanDatabaseName, roleName);
    }

    const clean = prismaClient(cleanUrl);
    let acl;
    try {
      await assertAppliedMigrations(clean, migrationPlan.allMigrations);
      await assertCatalog(clean);
      const cleanFixture = await createCleanFixture(clean, prefix);
      acl = await assertCleanAcl(
        clean,
        sourceUrl,
        names.cleanDatabaseName,
        roles,
        cleanFixture,
      );
      assertAggregate(
        await readAggregate(clean, cleanFixture.input),
        cleanFixture.input,
        cleanFixture.canonicalEmail,
      );
    } finally {
      await clean.$disconnect();
    }

    assert.deepEqual(
      await readSourceMigrationState(admin),
      sourceMigrationState,
      "The owner-invite HOLD smoke changed the source migration state.",
    );
    evidence = {
      script: SCRIPT_NAME,
      status: "PASS",
      postgresMajor: 16,
      upgrade: {
        fromMigration: PREVIOUS_MIGRATION,
        fromMigrationCount: 170,
        toMigration: TARGET_MIGRATION,
        toMigrationCount: 171,
        atomicCreated: true,
        hardCodedOwnerNetwork: true,
        hashOnlyInvite: true,
        envelopeBytes: 71,
        claimRevision: 2,
        replayWithoutMutation: true,
        digestCollisionRejected: true,
        locatorCollisionRejected: true,
        invalidAuthorityScenarios: 5,
        malformedInputScenarios: 9,
        lateFaultRolledBack: true,
        ...progressedState,
        receiptPiiFields: 0,
      },
      clean: {
        migrationCount: 171,
        atomicCreatedByDedicatedIssuer: true,
      },
      concurrency,
      locatorConcurrency,
      acl,
      hostileDefaultAcl: {
        unsafeDefaultsRejected: true,
        failedMigrationRolledBack: true,
        targetObjectsAfterFailure: 0,
        unsafeDefaultsRemoved: true,
        normalRetrySucceeded: true,
        ...hostileAcl,
      },
      hostileColumnAcl: {
        columnOnlyGrantRejected: true,
        exactColumnInventoryCount: 37,
        failedMigrationRolledBack: true,
        targetObjectsAfterFailure: 0,
        injectorRemoved: true,
        normalRetrySucceeded: true,
      },
      sourceDatabaseMigrationsApplied: 0,
    };
  } catch (error) {
    primaryError = error;
  } finally {
    for (const databaseName of createdDatabases.reverse()) {
      try {
        await dropDatabase(admin, databaseName);
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    for (const roleName of createdRoles.reverse()) {
      try {
        await dropRole(admin, roleName);
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (lockHeld) {
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
      "Owner-invite HOLD smoke and cleanup both failed.",
    );
  }
  if (primaryError) throw primaryError;
  if (cleanupErrors.length > 0) {
    throw new AggregateError(
      cleanupErrors,
      "Owner-invite HOLD smoke cleanup failed.",
    );
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
  const code =
    typeof error?.code === "string" && !/^[0-9A-Z]{5}$/u.test(error.code)
      ? error.code
      : "IDENTITY_OWNER_INVITE_HOLD_OUTBOX_UPGRADE_SMOKE_FAILED";
  process.stderr.write(
    `${JSON.stringify({
      script: SCRIPT_NAME,
      status: "FAIL",
      code,
      message:
        "The isolated owner-invite HOLD PostgreSQL smoke failed; detailed database output is suppressed.",
    })}\n`,
  );
  process.exitCode = 1;
});

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  createHash,
  randomBytes,
} from "node:crypto";
import {
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import {
  basename,
  dirname,
  join,
  resolve,
} from "node:path";
import {
  fileURLToPath,
  pathToFileURL,
} from "node:url";

import { PrismaClient } from "@prisma/client";

import { canonicalStringify } from
  "./staff-task-integrity-canonical-json.mjs";
import {
  CURRENT_EXPECTED_LATEST_MIGRATION,
  CURRENT_EXPECTED_MIGRATION_COUNT,
  STAFF_TASK_CURRENT_RELEASE_STATE,
} from "./staff-task-integrity-migration-state.mjs";

export const SCRIPT_NAME =
  "shared-beta-admission-provenance-catalog-materialize";
export const REQUIRED_CONFIRMATION =
  "write-exact-shared-beta-admission-provenance-catalog";
export const TARGET_MIGRATION =
  "20260730020000_shared_beta_admission_provenance";

const MIGRATION_PATTERN = /^\d{14}_[a-z0-9_]+$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const SAFE_SOURCE_DATABASE_PATTERN =
  /^[a-z0-9][a-z0-9_.-]{0,58}_ci$/iu;
const GENERATED_DATABASE_PATTERN =
  /^lp_admission172_catalog_ci_[a-f0-9]{16}$/u;
const TEMP_ROOT_PREFIX =
  "leetplus-admission-provenance-catalog-";
const GENERATED_FILE_PREFIX =
  ".shared-beta-admission-provenance-catalog-";
const MIGRATION_TIMEOUT_MS = 10 * 60 * 1_000;
const CLUSTER_LOCK_CLASS = 1_281_120_000;
const CLUSTER_LOCK_OBJECT = 172;
const POSTGRESQL_MAJOR = 16;
const SNAPSHOT_SCHEMA_VERSION = 1;
const SNAPSHOT_DIGEST_ALGORITHM =
  "RFC8785_STYLE_CANONICAL_JSON_SHA256_V1";

const TARGET_RELATIONS = Object.freeze([
  "ReleaseGateAttestation",
  "TenantAdmissionDecision",
  "TenantAdmissionDecisionGate",
]);
const TARGET_GATE_CODES = Object.freeze([
  "MODULE_POLICY_ENFORCED",
  "EMAIL_INVITE_WORKFLOW_VERIFIED",
  "POSTGRESQL_RELEASE_REHEARSAL_VERIFIED",
]);
const TARGET_FUNCTIONS = Object.freeze([
  "shared_beta_release_gate_attestation_guard_v1",
  "shared_beta_release_gate_attestation_persist_v1",
  "shared_beta_release_gate_attestation_revoke_v1",
  "shared_beta_tenant_admission_decision_assert_v1",
  "shared_beta_tenant_admission_decision_create_v1",
  "shared_beta_tenant_admission_decision_guard_v1",
  "shared_beta_tenant_admission_decision_revoke_v1",
  "shared_beta_tenant_admission_gate_immutable_v1",
  "shared_beta_tenant_profile_digest_v1",
]);
const TARGET_TYPE = "SharedBetaReleaseGateCode";
const TARGET_TRIGGER_BINDINGS = Object.freeze([
  Object.freeze([
    "ReleaseGateAttestation",
    "ReleaseGateAttestation_guard_trigger",
    "shared_beta_release_gate_attestation_guard_v1",
  ]),
  Object.freeze([
    "TenantAdmissionDecision",
    "TenantAdmissionDecision_guard_trigger",
    "shared_beta_tenant_admission_decision_guard_v1",
  ]),
  Object.freeze([
    "TenantAdmissionDecisionGate",
    "TenantAdmissionDecisionGate_immutable_trigger",
    "shared_beta_tenant_admission_gate_immutable_v1",
  ]),
]);
const EXPECTED_CATALOG_COUNTS = Object.freeze({
  relationCount: 3,
  columnCount: 64,
  sealedColumnCount: 64,
  constraintCount: 28,
  indexCount: 14,
  functionCount: 9,
  typeCount: 1,
  enumLabelCount: 3,
  triggerCount: 3,
  referentialTriggerCount: 16,
});
const RI_FUNCTION_ORDER = new Map([
  ["RI_FKey_restrict_del", 1],
  ["RI_FKey_restrict_upd", 2],
  ["RI_FKey_check_ins", 3],
  ["RI_FKey_check_upd", 4],
]);

export const HELP = `
${SCRIPT_NAME}

Reproducibly re-materializes the sealed CURRENT_172 catalog from a clean
PostgreSQL 16 database created from template0. Catalog rows and definition
hashes are read from pg_catalog; no row is maintained by hand.

Usage:
  node scripts/${SCRIPT_NAME}.mjs --write
  node scripts/${SCRIPT_NAME}.mjs --verify
  node scripts/${SCRIPT_NAME}.mjs --self-test
  node scripts/${SCRIPT_NAME}.mjs --help

The --verify mode is read-only and requires no database or environment
variables. It binds the checked-in generated module to the actual migration
bytes and recomputes its canonical digest, metadata, and exact object shape.

Required for --write:
  DATABASE_URL
    PostgreSQL 16 on loopback, schema public, and an explicitly dedicated
    source database whose validated name ends in _ci. The role must be a
    test superuser. The source database is never migrated.
  SHARED_BETA_ADMISSION_CATALOG_MATERIALIZE_CONFIRM
    Must equal: ${REQUIRED_CONFIRMATION}
  SHARED_BETA_ADMISSION_CATALOG_EXPECTED_MIGRATION_SHA256
    Exact lowercase SHA-256 of the migration.sql that was independently
    reviewed and declared stable before this command starts.

Safety:
  - NODE_ENV=production is rejected.
  - A single random database is created from template0 and force-dropped.
  - The exact migration tree is copied to a validated temporary artifact.
  - The target migration hash is checked before deployment and again before
    writing the generated module.
  - Owner-only table, column, function, and enum ACLs are mandatory.
  - Generated database and temporary artifacts are verified absent before
    the repository file is replaced atomically.
`.trim();

function contractError(code, message = code) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function parseArguments(argv) {
  if (argv.includes("--help")) {
    return {
      help: true,
      selfTest: false,
      verify: false,
      write: false,
    };
  }
  const supported = new Set(["--self-test", "--verify", "--write"]);
  if (argv.some((argument) => !supported.has(argument))) {
    contractError("CLI_ARGUMENT_UNSUPPORTED");
  }
  const selfTest = argv.includes("--self-test");
  const verify = argv.includes("--verify");
  const write = argv.includes("--write");
  if ([selfTest, verify, write].filter(Boolean).length !== 1) {
    contractError("EXACTLY_ONE_MODE_REQUIRED");
  }
  return { help: false, selfTest, verify, write };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
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
    GENERATED_DATABASE_PATTERN.test(databaseName)
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
  return { databaseName, sourceUrl };
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

function generatedDatabaseName() {
  const databaseName =
    `lp_admission172_catalog_ci_${randomBytes(8).toString("hex")}`;
  assert.match(databaseName, GENERATED_DATABASE_PATTERN);
  return databaseName;
}

function assertSafeGeneratedDatabaseName(databaseName) {
  if (!GENERATED_DATABASE_PATTERN.test(databaseName)) {
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

function assertRealEnvironment(environment) {
  if (environment.NODE_ENV === "production") {
    contractError("PRODUCTION_ENVIRONMENT_REFUSED");
  }
  if (
    environment
      .SHARED_BETA_ADMISSION_CATALOG_MATERIALIZE_CONFIRM !==
    REQUIRED_CONFIRMATION
  ) {
    contractError("MATERIALIZE_CONFIRMATION_REQUIRED");
  }
  const expectedMigrationSha256 = String(
    environment
      .SHARED_BETA_ADMISSION_CATALOG_EXPECTED_MIGRATION_SHA256 ?? "",
  ).trim();
  if (!SHA256_PATTERN.test(expectedMigrationSha256)) {
    contractError("EXPECTED_MIGRATION_SHA256_REQUIRED");
  }
  return {
    ...parseSafeSourceDatabaseUrl(environment.DATABASE_URL),
    expectedMigrationSha256,
  };
}

async function readMigrationPlan(expectedMigrationSha256) {
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
  assert.equal(STAFF_TASK_CURRENT_RELEASE_STATE, "CURRENT_172");
  assert.equal(CURRENT_EXPECTED_LATEST_MIGRATION, TARGET_MIGRATION);
  assert.equal(
    migrationDirectories.length,
    CURRENT_EXPECTED_MIGRATION_COUNT,
  );
  assert.equal(CURRENT_EXPECTED_MIGRATION_COUNT, 172);
  assert(
    migrationDirectories.every((name) =>
      MIGRATION_PATTERN.test(name),
    ),
    "Migration directory names must match the release contract.",
  );
  assert.equal(migrationDirectories.at(-1), TARGET_MIGRATION);
  const targetMigrationPath = join(
    sourcePrismaDir,
    "migrations",
    TARGET_MIGRATION,
    "migration.sql",
  );
  const migrationSql = await readFile(targetMigrationPath);
  const migrationSqlSha256 = sha256(migrationSql);
  if (migrationSqlSha256 !== expectedMigrationSha256) {
    contractError("REVIEWED_MIGRATION_SHA256_MISMATCH");
  }
  return {
    migrationDirectories,
    migrationSqlSha256,
    sourcePrismaDir,
    targetMigrationPath,
  };
}

async function createMigrationArtifact(tempRoot, migrationPlan) {
  assertSafeTempRoot(tempRoot);
  const targetPrismaDir = join(tempRoot, "prisma");
  const targetMigrationsDir = join(targetPrismaDir, "migrations");
  await mkdir(targetPrismaDir, { recursive: true });
  await copyFile(
    join(migrationPlan.sourcePrismaDir, "schema.prisma"),
    join(targetPrismaDir, "schema.prisma"),
  );
  await cp(
    join(migrationPlan.sourcePrismaDir, "migrations"),
    targetMigrationsDir,
    { recursive: true },
  );
  const copiedMigrationPath = join(
    targetMigrationsDir,
    TARGET_MIGRATION,
    "migration.sql",
  );
  const copiedMigrationSqlSha256 = sha256(
    await readFile(copiedMigrationPath),
  );
  assert.equal(
    copiedMigrationSqlSha256,
    migrationPlan.migrationSqlSha256,
    "The isolated migration artifact changed during copy.",
  );
  return {
    copiedMigrationPath,
    schemaPath: join(targetPrismaDir, "schema.prisma"),
  };
}

function runMigrateDeploy(schemaPath, databaseUrl) {
  const require = createRequire(import.meta.url);
  const prismaCliPath = require.resolve("prisma/build/index.js");
  const result = spawnSync(
    process.execPath,
    [
      prismaCliPath,
      "migrate",
      "deploy",
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
      timeout: MIGRATION_TIMEOUT_MS,
      windowsHide: true,
    },
  );
  if (result.error || result.status !== 0) {
    contractError(
      "MIGRATION_DEPLOY_FAILED",
      "Prisma migration deploy failed; raw output is suppressed.",
    );
  }
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
    POSTGRESQL_MAJOR,
    "Catalog materialization requires PostgreSQL 16.",
  );
  assert.equal(
    row?.is_superuser,
    true,
    "Catalog materialization requires a test superuser.",
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
    "Another admission migration rehearsal is running.",
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

async function assertNoGeneratedDatabase(admin, databaseName) {
  assertSafeGeneratedDatabaseName(databaseName);
  const [row] = await admin.$queryRawUnsafe(
    `SELECT pg_catalog.count(*)::INTEGER AS count
     FROM pg_catalog.pg_database
     WHERE datname = $1`,
    databaseName,
  );
  assert.equal(row?.count, 0);
}

async function sourceMigrationFingerprint(client) {
  const [relation] = await client.$queryRawUnsafe(
    `SELECT pg_catalog.to_regclass(
       'public."_prisma_migrations"'
     )::TEXT AS relation_name`,
  );
  if (relation?.relation_name === null) {
    return sha256("NO_PRISMA_MIGRATIONS_RELATION");
  }
  const rows = await client.$queryRawUnsafe(
    `SELECT
       "id"::TEXT AS id,
       "checksum"::TEXT AS checksum,
       "migration_name"::TEXT AS migration_name,
       "started_at"::TEXT AS started_at,
       "finished_at"::TEXT AS finished_at,
       "rolled_back_at"::TEXT AS rolled_back_at,
       "applied_steps_count"::TEXT AS applied_steps_count
     FROM public."_prisma_migrations"
     ORDER BY "migration_name", "id"`,
  );
  return sha256(canonicalStringify(rows));
}

async function assertAppliedMigrations(
  client,
  migrationPlan,
) {
  const rows = await client.$queryRawUnsafe(
    `SELECT
       "migration_name"::TEXT AS migration_name,
       "checksum"::TEXT AS checksum,
       "finished_at" IS NOT NULL AS finished,
       "rolled_back_at" IS NULL AS not_rolled_back
     FROM public."_prisma_migrations"
     ORDER BY "migration_name"`,
  );
  assert.deepEqual(
    rows.map((row) => row.migration_name),
    migrationPlan.migrationDirectories,
  );
  assert.equal(
    rows.every(
      (row) => row.finished === true && row.not_rolled_back === true,
    ),
    true,
  );
  const target = rows.at(-1);
  assert.equal(target?.migration_name, TARGET_MIGRATION);
  assert.equal(target?.checksum, migrationPlan.migrationSqlSha256);
}

async function assertSealedAclAndOwnership(client) {
  const [state] = await client.$queryRawUnsafe(
    `WITH
       database_owner AS (
         SELECT datdba AS owner_oid
         FROM pg_catalog.pg_database
         WHERE datname = current_database()
       ),
       target_relation AS (
         SELECT relation.*
         FROM pg_catalog.pg_class AS relation
         WHERE relation.relnamespace = 'public'::regnamespace
           AND relation.relname = ANY($1::TEXT[])
           AND relation.relkind = 'r'
       ),
       target_function AS (
         SELECT procedure.*
         FROM pg_catalog.pg_proc AS procedure
         WHERE procedure.pronamespace = 'public'::regnamespace
           AND procedure.proname = ANY($2::TEXT[])
       ),
       target_type AS (
         SELECT type.*
         FROM pg_catalog.pg_type AS type
         WHERE type.typnamespace = 'public'::regnamespace
           AND type.typname = $3
           AND type.typtype = 'e'
       )
     SELECT
       (SELECT pg_catalog.count(*)::INTEGER FROM target_relation)
         AS relation_count,
       (SELECT pg_catalog.count(*)::INTEGER FROM target_function)
         AS function_count,
       (SELECT pg_catalog.count(*)::INTEGER FROM target_type)
         AS type_count,
       (
         SELECT pg_catalog.count(*)::INTEGER
         FROM (
           SELECT relowner AS owner_oid FROM target_relation
           UNION ALL
           SELECT proowner FROM target_function
           UNION ALL
           SELECT typowner FROM target_type
         ) AS object_owner
         WHERE object_owner.owner_oid <> (
           SELECT owner_oid FROM database_owner
         )
       ) AS owner_mismatch_count,
       (
         SELECT pg_catalog.count(*)::INTEGER
         FROM target_relation AS relation
         CROSS JOIN LATERAL pg_catalog.aclexplode(
           COALESCE(
             relation.relacl,
             pg_catalog.acldefault('r', relation.relowner)
           )
         ) AS privilege
         WHERE privilege.grantee <> relation.relowner
       ) AS relation_nonowner_acl_count,
       (
         SELECT pg_catalog.count(*)::INTEGER
         FROM target_relation AS relation
         JOIN pg_catalog.pg_attribute AS attribute
           ON attribute.attrelid = relation.oid
          AND attribute.attnum > 0
          AND NOT attribute.attisdropped
         CROSS JOIN LATERAL pg_catalog.aclexplode(
           attribute.attacl
         ) AS privilege
         WHERE privilege.grantee <> relation.relowner
       ) AS column_nonowner_acl_count,
       (
         SELECT pg_catalog.count(*)::INTEGER
         FROM target_function AS procedure
         CROSS JOIN LATERAL pg_catalog.aclexplode(
           COALESCE(
             procedure.proacl,
             pg_catalog.acldefault('f', procedure.proowner)
           )
         ) AS privilege
         WHERE privilege.grantee <> procedure.proowner
       ) AS function_nonowner_acl_count,
       (
         SELECT pg_catalog.count(*)::INTEGER
         FROM target_type AS type
         CROSS JOIN LATERAL pg_catalog.aclexplode(
           COALESCE(
             type.typacl,
             pg_catalog.acldefault('T', type.typowner)
           )
         ) AS privilege
         WHERE privilege.grantee <> type.typowner
       ) AS type_nonowner_acl_count`,
    TARGET_RELATIONS,
    TARGET_FUNCTIONS,
    TARGET_TYPE,
  );
  assert.deepEqual(state, {
    column_nonowner_acl_count: 0,
    function_count: TARGET_FUNCTIONS.length,
    function_nonowner_acl_count: 0,
    owner_mismatch_count: 0,
    relation_count: TARGET_RELATIONS.length,
    relation_nonowner_acl_count: 0,
    type_count: 1,
    type_nonowner_acl_count: 0,
  });
}

function definitionDigest(definition) {
  assert.equal(typeof definition, "string");
  return sha256(Buffer.from(definition, "utf8"));
}

function compareCodepoint(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

async function readCatalogSnapshot(
  client,
  migrationPlan,
  setPhase = () => {},
) {
  setPhase("PG_CATALOG_APPLIED_MIGRATIONS");
  await assertAppliedMigrations(client, migrationPlan);
  setPhase("PG_CATALOG_ACL");
  await assertSealedAclAndOwnership(client);

  setPhase("PG_CATALOG_RELATIONS");
  const relationRows = await client.$queryRawUnsafe(
    `SELECT relation.relname AS name
     FROM pg_catalog.pg_class AS relation
     WHERE relation.relnamespace = 'public'::regnamespace
       AND relation.relname = ANY($1::TEXT[])
       AND relation.relkind = 'r'
       AND relation.relpersistence = 'p'
       AND NOT relation.relispartition
       AND NOT relation.relrowsecurity
       AND NOT relation.relforcerowsecurity
       AND relation.relreplident = 'd'
     ORDER BY pg_catalog.array_position($1::TEXT[], relation.relname)`,
    TARGET_RELATIONS,
  );
  const relations = relationRows.map((row) => row.name);
  assert.deepEqual(relations, TARGET_RELATIONS);

  setPhase("PG_CATALOG_COLUMNS");
  const columnRows = await client.$queryRawUnsafe(
    `SELECT
       relation_row.relname AS relation_name,
       attribute_row.attname AS column_name,
       attribute_row.attnum::INTEGER AS attribute_number,
       pg_catalog.format_type(
         attribute_row.atttypid,
         attribute_row.atttypmod
       ) AS formatted_type,
       attribute_row.attnotnull AS required_not_null,
       COALESCE(
         pg_catalog.pg_get_expr(
           default_record.adbin,
           default_record.adrelid,
           true
         ),
         ''
       ) AS default_expression,
       CASE
         WHEN attribute_row.attcollation = 0 THEN ''
         ELSE collation_namespace.nspname || '.' ||
           collation_row.collname
       END AS collation_name,
       attribute_row.attidentity::TEXT AS identity_kind,
       attribute_row.attgenerated::TEXT AS generated_kind,
       attribute_row.attislocal AS is_local,
       attribute_row.attinhcount::INTEGER AS inherited_count
     FROM pg_catalog.pg_class AS relation_row
     JOIN pg_catalog.pg_attribute AS attribute_row
       ON attribute_row.attrelid = relation_row.oid
      AND attribute_row.attnum > 0
      AND NOT attribute_row.attisdropped
     LEFT JOIN pg_catalog.pg_attrdef AS default_record
       ON default_record.adrelid = attribute_row.attrelid
      AND default_record.adnum = attribute_row.attnum
     LEFT JOIN pg_catalog.pg_collation AS collation_row
       ON collation_row.oid = attribute_row.attcollation
     LEFT JOIN pg_catalog.pg_namespace AS collation_namespace
       ON collation_namespace.oid = collation_row.collnamespace
     WHERE relation_row.relnamespace = 'public'::regnamespace
       AND relation_row.relname = ANY($1::TEXT[])
       AND relation_row.relkind = 'r'
     ORDER BY
       pg_catalog.array_position($1::TEXT[], relation_row.relname),
       attribute_row.attnum`,
    TARGET_RELATIONS,
  );
  assert.equal(
    columnRows.every(
      (row) =>
        row.identity_kind === "" &&
        row.generated_kind === "" &&
        row.is_local === true &&
        row.inherited_count === 0,
    ),
    true,
  );
  const columns = columnRows.map((row) => [
    row.relation_name,
    row.column_name,
    row.attribute_number,
    row.formatted_type,
    row.required_not_null,
    row.default_expression,
    row.collation_name,
  ]);

  setPhase("PG_CATALOG_CONSTRAINTS");
  const constraintRows = await client.$queryRawUnsafe(
    `SELECT
       constraint_record.conname AS name,
       relation.relname AS relation_name,
       constraint_record.contype::TEXT AS type,
       constraint_record.convalidated AS validated,
       constraint_record.condeferrable AS deferrable,
       constraint_record.condeferred AS deferred,
       constraint_record.connoinherit AS no_inherit,
       pg_catalog.pg_get_constraintdef(
         constraint_record.oid,
         true
       ) AS definition
     FROM pg_catalog.pg_constraint AS constraint_record
     JOIN pg_catalog.pg_class AS relation
       ON relation.oid = constraint_record.conrelid
     WHERE constraint_record.connamespace = 'public'::regnamespace
       AND relation.relnamespace = 'public'::regnamespace
       AND relation.relname = ANY($1::TEXT[])
     ORDER BY
       pg_catalog.array_position($1::TEXT[], relation.relname),
       constraint_record.conname COLLATE "C"`,
    TARGET_RELATIONS,
  );
  assert.equal(
    constraintRows.every(
      (row) =>
        row.validated === true &&
        row.deferrable === false &&
        row.deferred === false &&
        row.no_inherit === new Set(["p", "f"]).has(row.type),
    ),
    true,
  );
  const constraints = constraintRows.map((row) => [
    row.name,
    row.relation_name,
    row.type,
    definitionDigest(row.definition),
  ]);

  setPhase("PG_CATALOG_INDEXES");
  const indexRows = await client.$queryRawUnsafe(
    `SELECT
       relation.relname AS relation_name,
       index_relation.relname AS name,
       index_state.indisunique AS is_unique,
       index_state.indisprimary AS is_primary,
       index_state.indisvalid AS valid,
       index_state.indisready AS ready,
       index_state.indislive AS live,
       index_state.indimmediate AS immediate,
       index_state.indisexclusion AS exclusion,
       pg_catalog.pg_get_indexdef(index_relation.oid) AS definition
     FROM pg_catalog.pg_index AS index_state
     JOIN pg_catalog.pg_class AS index_relation
       ON index_relation.oid = index_state.indexrelid
     JOIN pg_catalog.pg_class AS relation
       ON relation.oid = index_state.indrelid
     WHERE index_relation.relnamespace = 'public'::regnamespace
       AND relation.relnamespace = 'public'::regnamespace
       AND relation.relname = ANY($1::TEXT[])
       AND index_relation.relkind = 'i'
     ORDER BY
       pg_catalog.array_position($1::TEXT[], relation.relname),
       index_relation.relname COLLATE "C"`,
    TARGET_RELATIONS,
  );
  assert.equal(
    indexRows.every(
      (row) =>
        row.valid === true &&
        row.ready === true &&
        row.live === true &&
        row.immediate === true &&
        row.exclusion === false,
    ),
    true,
  );
  const indexes = indexRows.map((row) => [
    row.relation_name,
    row.name,
    row.is_unique,
    row.is_primary,
    definitionDigest(row.definition),
  ]);

  setPhase("PG_CATALOG_FUNCTIONS");
  const functionRows = await client.$queryRawUnsafe(
    `SELECT
       procedure.proname AS name,
       pg_catalog.pg_get_function_result(procedure.oid) AS result,
       language.lanname AS language,
       procedure.proconfig AS config,
       procedure.provolatile::TEXT AS volatility,
       pg_catalog.oidvectortypes(
         procedure.proargtypes
       ) AS argument_types,
       'public."' ||
         pg_catalog.replace(procedure.proname, '"', '""') ||
         '"(' ||
         pg_catalog.oidvectortypes(procedure.proargtypes) ||
         ')' AS catalog_signature,
       procedure.prosecdef AS security_definer,
       pg_catalog.pg_get_function_identity_arguments(
         procedure.oid
       ) AS identity_arguments,
       pg_catalog.pg_get_functiondef(procedure.oid) AS definition,
       procedure.prokind::TEXT AS kind,
       procedure.proisstrict AS strict,
       procedure.proleakproof AS leakproof,
       procedure.proretset AS returns_set,
       procedure.pronargdefaults::INTEGER AS default_count,
       procedure.provariadic::INTEGER AS variadic_type,
       procedure.proparallel::TEXT AS parallel
     FROM pg_catalog.pg_proc AS procedure
     JOIN pg_catalog.pg_language AS language
       ON language.oid = procedure.prolang
     WHERE procedure.pronamespace = 'public'::regnamespace
       AND procedure.proname = ANY($1::TEXT[])
     ORDER BY
       procedure.proname COLLATE "C",
       pg_catalog.pg_get_function_identity_arguments(procedure.oid)
         COLLATE "C"`,
    TARGET_FUNCTIONS,
  );
  assert.deepEqual(
    functionRows.map((row) => row.name),
    [...TARGET_FUNCTIONS].sort(),
  );
  assert.equal(
    functionRows.every(
      (row) =>
        row.kind === "f" &&
        row.strict === false &&
        row.leakproof === false &&
        row.returns_set === false &&
        row.default_count === 0 &&
        row.variadic_type === 0 &&
        row.parallel === "u" &&
        Array.isArray(row.config) &&
        row.config.length === 1 &&
        row.config[0] === "search_path=pg_catalog",
    ),
    true,
  );
  const functions = functionRows.map((row) => ({
    name: row.name,
    result: row.result,
    language: row.language,
    searchPath: ["pg_catalog"],
    volatility: row.volatility,
    argumentTypes: row.argument_types,
    grantSignature: row.catalog_signature,
    securityDefiner: row.security_definer,
    catalogSignature: row.catalog_signature,
    definitionDigest: definitionDigest(row.definition),
    identityArguments: row.identity_arguments,
  }));

  setPhase("PG_CATALOG_TYPES");
  const typeRows = await client.$queryRawUnsafe(
    `SELECT
       type.typname AS name,
       type.typtype::TEXT AS kind
     FROM pg_catalog.pg_type AS type
     WHERE type.typnamespace = 'public'::regnamespace
       AND type.typname = $1
       AND type.typisdefined`,
    TARGET_TYPE,
  );
  assert.deepEqual(typeRows, [{ kind: "e", name: TARGET_TYPE }]);
  const types = [{
    name: TARGET_TYPE,
    kind: "e",
    ownerPolicy: "DATABASE_OWNER",
    aclPolicy: "OWNER_USAGE_ONLY",
  }];

  setPhase("PG_CATALOG_ENUMS");
  const enumRows = await client.$queryRawUnsafe(
    `SELECT
       type.typname AS type_name,
       enum_record.enumlabel AS label,
       enum_record.enumsortorder::INTEGER AS sort_order
     FROM pg_catalog.pg_enum AS enum_record
     JOIN pg_catalog.pg_type AS type
       ON type.oid = enum_record.enumtypid
     WHERE type.typnamespace = 'public'::regnamespace
       AND type.typname = $1
     ORDER BY enum_record.enumsortorder`,
    TARGET_TYPE,
  );
  const enums = enumRows.map((row) => [
    row.type_name,
    row.label,
    row.sort_order,
  ]);
  const gateCodes = enumRows.map((row) => row.label);

  setPhase("PG_CATALOG_TRIGGERS");
  const triggerRows = await client.$queryRawUnsafe(
    `SELECT
       relation.relname AS relation_name,
       trigger_record.tgname AS name,
       procedure.proname AS function_name,
       trigger_record.tgtype::INTEGER AS trigger_type,
       trigger_record.tgenabled::TEXT AS enabled,
       trigger_record.tgnargs::INTEGER AS argument_count,
       trigger_record.tgqual IS NULL AS qualifier_absent,
       trigger_record.tgconstraint = 0 AS constraint_absent,
       trigger_record.tgconstrrelid = 0 AS peer_absent,
       pg_catalog.pg_get_triggerdef(
         trigger_record.oid,
         true
       ) AS definition
     FROM pg_catalog.pg_trigger AS trigger_record
     JOIN pg_catalog.pg_class AS relation
       ON relation.oid = trigger_record.tgrelid
     JOIN pg_catalog.pg_proc AS procedure
       ON procedure.oid = trigger_record.tgfoid
     WHERE relation.relnamespace = 'public'::regnamespace
       AND relation.relname = ANY($1::TEXT[])
       AND NOT trigger_record.tgisinternal
     ORDER BY
       pg_catalog.array_position($1::TEXT[], relation.relname),
       trigger_record.tgname COLLATE "C"`,
    TARGET_RELATIONS,
  );
  assert.equal(
    triggerRows.every(
      (row) =>
        row.enabled === "O" &&
        row.argument_count === 0 &&
        row.qualifier_absent === true &&
        row.constraint_absent === true &&
        row.peer_absent === true,
    ),
    true,
  );
  const triggers = triggerRows.map((row) => [
    row.relation_name,
    row.name,
    row.function_name,
    row.trigger_type,
    definitionDigest(row.definition),
  ]);

  setPhase("PG_CATALOG_RI_TRIGGERS");
  const riRows = await client.$queryRawUnsafe(
    `SELECT
       constraint_record.conname AS constraint_name,
       constraint_relation.relname AS constraint_relation_name,
       trigger_relation.relname AS trigger_relation_name,
       peer_relation.relname AS peer_relation_name,
       procedure.proname AS function_name,
       trigger_record.tgtype::INTEGER AS trigger_type,
       trigger_record.tgenabled::TEXT AS enabled,
       trigger_record.tgnargs::INTEGER AS argument_count,
       trigger_record.tgqual IS NULL AS qualifier_absent,
       trigger_record.tgconstrindid = constraint_record.conindid
         AS index_matched,
       NOT trigger_record.tgdeferrable AS not_deferrable,
       NOT trigger_record.tginitdeferred AS not_initially_deferred
     FROM pg_catalog.pg_constraint AS constraint_record
     JOIN pg_catalog.pg_class AS constraint_relation
       ON constraint_relation.oid = constraint_record.conrelid
     JOIN pg_catalog.pg_trigger AS trigger_record
       ON trigger_record.tgconstraint = constraint_record.oid
      AND trigger_record.tgisinternal
     JOIN pg_catalog.pg_class AS trigger_relation
       ON trigger_relation.oid = trigger_record.tgrelid
     JOIN pg_catalog.pg_class AS peer_relation
       ON peer_relation.oid = trigger_record.tgconstrrelid
     JOIN pg_catalog.pg_proc AS procedure
       ON procedure.oid = trigger_record.tgfoid
     WHERE constraint_record.connamespace = 'public'::regnamespace
       AND constraint_record.contype = 'f'
       AND constraint_relation.relnamespace =
         'public'::regnamespace
       AND constraint_relation.relname = ANY($1::TEXT[])`,
    TARGET_RELATIONS,
  );
  assert.equal(
    riRows.every(
      (row) =>
        row.enabled === "O" &&
        row.argument_count === 0 &&
        row.qualifier_absent === true &&
        row.index_matched === true &&
        row.not_deferrable === true &&
        row.not_initially_deferred === true &&
        RI_FUNCTION_ORDER.has(row.function_name),
    ),
    true,
  );
  riRows.sort((left, right) => {
    const constraintOrder =
      compareCodepoint(
        left.constraint_name,
        right.constraint_name,
      );
    if (constraintOrder !== 0) return constraintOrder;
    return (
      RI_FUNCTION_ORDER.get(left.function_name) -
      RI_FUNCTION_ORDER.get(right.function_name)
    );
  });
  const referentialConstraints = riRows.map((row) => [
    row.constraint_name,
    row.constraint_relation_name,
    row.trigger_relation_name,
    row.peer_relation_name,
    row.function_name,
    row.trigger_type,
  ]);

  assert.deepEqual(
    {
      columnCount: columns.length,
      constraintCount: constraints.length,
      enumLabelCount: enums.length,
      functionCount: functions.length,
      indexCount: indexes.length,
      referentialTriggerCount: referentialConstraints.length,
      relationCount: relations.length,
      triggerCount: triggers.length,
      typeCount: types.length,
    },
    {
      columnCount: 64,
      constraintCount: 28,
      enumLabelCount: 3,
      functionCount: 9,
      indexCount: 14,
      referentialTriggerCount: 16,
      relationCount: 3,
      triggerCount: 3,
      typeCount: 1,
    },
  );

  return Object.freeze({
    gateCodes,
    relations,
    columns,
    constraints,
    indexes,
    functions,
    types,
    enums,
    triggers,
    referentialConstraints,
  });
}

function catalogSnapshotDigest(snapshot, migrationSqlSha256) {
  return sha256(
    canonicalStringify({
      algorithm: SNAPSHOT_DIGEST_ALGORITHM,
      migration: TARGET_MIGRATION,
      migrationSqlSha256,
      postgresqlMajor: POSTGRESQL_MAJOR,
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      snapshot,
      source: "POSTGRESQL_16_PG_CATALOG",
    }),
  );
}

function renderJson(value) {
  return JSON.stringify(value, null, 2);
}

function renderCatalogModule(snapshot, migrationSqlSha256) {
  const snapshotDigest = catalogSnapshotDigest(
    snapshot,
    migrationSqlSha256,
  );
  return `// Generated from a clean PostgreSQL 16 CURRENT_172 catalog.
//
// Source migration:
//   ${TARGET_MIGRATION}
//   SHA-256 ${migrationSqlSha256}
//
// Snapshot digest:
//   ${SNAPSHOT_DIGEST_ALGORITHM}
//
// Do not edit catalog rows or definition hashes by hand. Re-materialize them
// from pg_catalog after applying the exact migration to template0 with:
//   node scripts/${SCRIPT_NAME}.mjs --write

function freezeTuples(values) {
  return Object.freeze(
    values.map((value) => Object.freeze([...value])),
  );
}

function freezeRecords(values) {
  return Object.freeze(
    values.map((value) =>
      Object.freeze({
        ...value,
        ...(Array.isArray(value.searchPath)
          ? { searchPath: Object.freeze([...value.searchPath]) }
          : {}),
      }),
    ),
  );
}

export const SHARED_BETA_ADMISSION_GATE_CODES = Object.freeze(
  ${renderJson(snapshot.gateCodes)},
);

export const SHARED_BETA_ADMISSION_RELATIONS = Object.freeze(
  ${renderJson(snapshot.relations)},
);

export const SHARED_BETA_ADMISSION_COLUMNS = freezeTuples(
  ${renderJson(snapshot.columns)},
);

export const SHARED_BETA_ADMISSION_CONSTRAINTS = freezeTuples(
  ${renderJson(snapshot.constraints)},
);

export const SHARED_BETA_ADMISSION_INDEXES = freezeTuples(
  ${renderJson(snapshot.indexes)},
);

export const SHARED_BETA_ADMISSION_FUNCTIONS = freezeRecords(
  ${renderJson(snapshot.functions)},
);

export const SHARED_BETA_ADMISSION_TYPES = freezeRecords(
  ${renderJson(snapshot.types)},
);

export const SHARED_BETA_ADMISSION_ENUMS = freezeTuples(
  ${renderJson(snapshot.enums)},
);

export const SHARED_BETA_ADMISSION_TRIGGERS = freezeTuples(
  ${renderJson(snapshot.triggers)},
);

export const SHARED_BETA_ADMISSION_REFERENTIAL_CONSTRAINTS =
  freezeTuples(
    ${renderJson(snapshot.referentialConstraints)},
  );

export const SHARED_BETA_ADMISSION_DORMANT_RELATIONS = Object.freeze(
  [...SHARED_BETA_ADMISSION_RELATIONS],
);

export const SHARED_BETA_ADMISSION_DORMANT_FUNCTIONS = Object.freeze(
  SHARED_BETA_ADMISSION_FUNCTIONS.map((entry) => entry.name),
);

export const SHARED_BETA_ADMISSION_DORMANT_TYPES = Object.freeze(
  SHARED_BETA_ADMISSION_TYPES.map((entry) => entry.name),
);

export const SHARED_BETA_ADMISSION_CATALOG = Object.freeze({
  schemaVersion: ${SNAPSHOT_SCHEMA_VERSION},
  migration: "${TARGET_MIGRATION}",
  migrationSqlSha256:
    "${migrationSqlSha256}",
  source: "POSTGRESQL_16_PG_CATALOG",
  catalogSnapshotDigestAlgorithm:
    "${SNAPSHOT_DIGEST_ALGORITHM}",
  catalogSnapshotDigestSha256:
    "${snapshotDigest}",
  postgresqlMajor: ${POSTGRESQL_MAJOR},
  relationCount: ${snapshot.relations.length},
  columnCount: ${snapshot.columns.length},
  sealedColumnCount: ${snapshot.columns.length},
  constraintCount: ${snapshot.constraints.length},
  indexCount: ${snapshot.indexes.length},
  functionCount: ${snapshot.functions.length},
  typeCount: ${snapshot.types.length},
  enumLabelCount: ${snapshot.enums.length},
  triggerCount: ${snapshot.triggers.length},
  referentialTriggerCount: ${snapshot.referentialConstraints.length},
});
`;
}

function catalogTargetPath() {
  return fileURLToPath(
    new URL(
      "./shared-beta-admission-provenance-catalog.mjs",
      import.meta.url,
    ),
  );
}

async function atomicWriteCatalog(source, migrationSqlSha256) {
  const targetPath = catalogTargetPath();
  const targetDirectory = dirname(targetPath);
  const temporaryPath = join(
    targetDirectory,
    `${GENERATED_FILE_PREFIX}${process.pid}-${randomBytes(8).toString("hex")}.mjs`,
  );
  assert.equal(dirname(resolve(temporaryPath)), resolve(targetDirectory));
  assert.equal(
    basename(temporaryPath).startsWith(GENERATED_FILE_PREFIX),
    true,
  );
  try {
    await writeFile(temporaryPath, source, {
      encoding: "utf8",
      flag: "wx",
    });
    const temporaryFileSha256 = sha256(
      await readFile(temporaryPath),
    );
    const preReplaceVerification = await verifyCatalogModule(
      temporaryPath,
      temporaryFileSha256,
      migrationSqlSha256,
    );
    await rename(temporaryPath, targetPath);
    const catalogFileSha256 = sha256(await readFile(targetPath));
    assert.equal(
      catalogFileSha256,
      temporaryFileSha256,
      "Atomic catalog replacement changed generated bytes.",
    );
    return {
      catalogFileSha256,
      preReplaceVerification,
      targetPath,
    };
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

function snapshotFromCatalogModule(generated) {
  return {
    gateCodes: generated.SHARED_BETA_ADMISSION_GATE_CODES,
    relations: generated.SHARED_BETA_ADMISSION_RELATIONS,
    columns: generated.SHARED_BETA_ADMISSION_COLUMNS,
    constraints: generated.SHARED_BETA_ADMISSION_CONSTRAINTS,
    indexes: generated.SHARED_BETA_ADMISSION_INDEXES,
    functions: generated.SHARED_BETA_ADMISSION_FUNCTIONS,
    types: generated.SHARED_BETA_ADMISSION_TYPES,
    enums: generated.SHARED_BETA_ADMISSION_ENUMS,
    triggers: generated.SHARED_BETA_ADMISSION_TRIGGERS,
    referentialConstraints:
      generated.SHARED_BETA_ADMISSION_REFERENTIAL_CONSTRAINTS,
  };
}

function assertSha256(value, label) {
  assert.match(String(value), SHA256_PATTERN, label);
}

function assertFrozenRows(rows, label) {
  assert.equal(Object.isFrozen(rows), true, `${label} must be frozen.`);
  assert.equal(
    rows.every((row) => Object.isFrozen(row)),
    true,
    `${label} rows must be frozen.`,
  );
}

function assertUniqueKeys(rows, keyFor, label) {
  const keys = rows.map(keyFor);
  assert.equal(
    new Set(keys).size,
    keys.length,
    `${label} keys must be unique.`,
  );
}

function assertSnapshotShape(snapshot, generated) {
  assert.deepEqual(snapshot.gateCodes, TARGET_GATE_CODES);
  assert.deepEqual(snapshot.relations, TARGET_RELATIONS);
  assertFrozenRows(snapshot.columns, "Catalog columns");
  assertFrozenRows(snapshot.constraints, "Catalog constraints");
  assertFrozenRows(snapshot.indexes, "Catalog indexes");
  assertFrozenRows(snapshot.enums, "Catalog enums");
  assertFrozenRows(snapshot.triggers, "Catalog triggers");
  assertFrozenRows(
    snapshot.referentialConstraints,
    "Catalog referential triggers",
  );
  assertFrozenRows(snapshot.functions, "Catalog functions");
  assertFrozenRows(snapshot.types, "Catalog types");
  assert.equal(Object.isFrozen(snapshot.gateCodes), true);
  assert.equal(Object.isFrozen(snapshot.relations), true);

  assert.deepEqual(
    {
      columnCount: snapshot.columns.length,
      constraintCount: snapshot.constraints.length,
      enumLabelCount: snapshot.enums.length,
      functionCount: snapshot.functions.length,
      indexCount: snapshot.indexes.length,
      referentialTriggerCount:
        snapshot.referentialConstraints.length,
      relationCount: snapshot.relations.length,
      sealedColumnCount: snapshot.columns.length,
      triggerCount: snapshot.triggers.length,
      typeCount: snapshot.types.length,
    },
    EXPECTED_CATALOG_COUNTS,
  );

  assert.equal(
    snapshot.columns.every(
      (row) =>
        Array.isArray(row) &&
        row.length === 7 &&
        TARGET_RELATIONS.includes(row[0]) &&
        typeof row[1] === "string" &&
        row[1].length > 0 &&
        Number.isSafeInteger(row[2]) &&
        row[2] > 0 &&
        typeof row[3] === "string" &&
        row[3].length > 0 &&
        typeof row[4] === "boolean" &&
        typeof row[5] === "string" &&
        typeof row[6] === "string",
    ),
    true,
    "Catalog column rows must match the exact tuple contract.",
  );
  assertUniqueKeys(
    snapshot.columns,
    (row) => `${row[0]}\u0000${row[1]}`,
    "Catalog columns",
  );
  assert.deepEqual(
    Object.fromEntries(
      TARGET_RELATIONS.map((relation) => [
        relation,
        snapshot.columns.filter((row) => row[0] === relation).length,
      ]),
    ),
    {
      ReleaseGateAttestation: 22,
      TenantAdmissionDecision: 36,
      TenantAdmissionDecisionGate: 6,
    },
  );

  assert.equal(
    snapshot.constraints.every(
      (row) =>
        Array.isArray(row) &&
        row.length === 4 &&
        typeof row[0] === "string" &&
        TARGET_RELATIONS.includes(row[1]) &&
        new Set(["c", "f", "p"]).has(row[2]) &&
        SHA256_PATTERN.test(row[3]),
    ),
    true,
    "Catalog constraint rows must match the exact tuple contract.",
  );
  assertUniqueKeys(
    snapshot.constraints,
    (row) => `${row[1]}\u0000${row[0]}`,
    "Catalog constraints",
  );

  assert.equal(
    snapshot.indexes.every(
      (row) =>
        Array.isArray(row) &&
        row.length === 5 &&
        TARGET_RELATIONS.includes(row[0]) &&
        typeof row[1] === "string" &&
        typeof row[2] === "boolean" &&
        typeof row[3] === "boolean" &&
        SHA256_PATTERN.test(row[4]),
    ),
    true,
    "Catalog index rows must match the exact tuple contract.",
  );
  assertUniqueKeys(
    snapshot.indexes,
    (row) => `${row[0]}\u0000${row[1]}`,
    "Catalog indexes",
  );

  assert.deepEqual(
    snapshot.functions.map((entry) => entry.name),
    TARGET_FUNCTIONS,
  );
  const triggerFunctionNames = new Set([
    "shared_beta_release_gate_attestation_guard_v1",
    "shared_beta_tenant_admission_decision_guard_v1",
    "shared_beta_tenant_admission_gate_immutable_v1",
  ]);
  assert.equal(
    snapshot.functions.every((entry) => {
      const expectedLanguage =
        entry.name === "shared_beta_tenant_profile_digest_v1"
          ? "sql"
          : "plpgsql";
      const expectedResult = triggerFunctionNames.has(entry.name)
        ? "trigger"
        : entry.name === "shared_beta_tenant_profile_digest_v1"
          ? "text"
          : "jsonb";
      const expectedVolatility =
        entry.name === "shared_beta_tenant_profile_digest_v1"
          ? "s"
          : "v";
      return (
        Object.keys(entry).sort().join(",") ===
          [
            "argumentTypes",
            "catalogSignature",
            "definitionDigest",
            "grantSignature",
            "identityArguments",
            "language",
            "name",
            "result",
            "searchPath",
            "securityDefiner",
            "volatility",
          ].sort().join(",") &&
        entry.language === expectedLanguage &&
        entry.result === expectedResult &&
        entry.volatility === expectedVolatility &&
        Array.isArray(entry.searchPath) &&
        Object.isFrozen(entry.searchPath) &&
        entry.searchPath.length === 1 &&
        entry.searchPath[0] === "pg_catalog" &&
        typeof entry.argumentTypes === "string" &&
        typeof entry.identityArguments === "string" &&
        entry.catalogSignature === entry.grantSignature &&
        entry.catalogSignature.startsWith(`public."${entry.name}"(`) &&
        typeof entry.securityDefiner === "boolean" &&
        entry.securityDefiner === !triggerFunctionNames.has(entry.name) &&
        SHA256_PATTERN.test(entry.definitionDigest)
      );
    }),
    true,
    "Catalog functions must match the sealed function contract.",
  );

  assert.deepEqual(snapshot.types, [
    {
      name: TARGET_TYPE,
      kind: "e",
      ownerPolicy: "DATABASE_OWNER",
      aclPolicy: "OWNER_USAGE_ONLY",
    },
  ]);
  assert.deepEqual(
    snapshot.enums,
    TARGET_GATE_CODES.map((code, index) => [
      TARGET_TYPE,
      code,
      index + 1,
    ]),
  );

  assert.equal(
    snapshot.triggers.every(
      (row) =>
        Array.isArray(row) &&
        row.length === 5 &&
        Number.isSafeInteger(row[3]) &&
        row[3] === 27 &&
        SHA256_PATTERN.test(row[4]),
    ),
    true,
    "Catalog trigger rows must match the exact tuple contract.",
  );
  assert.deepEqual(
    snapshot.triggers.map((row) => row.slice(0, 3)),
    TARGET_TRIGGER_BINDINGS,
  );

  assert.equal(
    snapshot.referentialConstraints.every(
      (row) =>
        Array.isArray(row) &&
        row.length === 6 &&
        typeof row[0] === "string" &&
        new Set([
          "TenantAdmissionDecision",
          "TenantAdmissionDecisionGate",
        ]).has(row[1]) &&
        typeof row[2] === "string" &&
        row[2].length > 0 &&
        typeof row[3] === "string" &&
        row[3].length > 0 &&
        RI_FUNCTION_ORDER.has(row[4]) &&
        Number.isSafeInteger(row[5]) &&
        new Set([5, 9, 17]).has(row[5]),
    ),
    true,
    "Catalog RI trigger rows must match the exact tuple contract.",
  );
  assertUniqueKeys(
    snapshot.referentialConstraints,
    (row) => `${row[0]}\u0000${row[2]}\u0000${row[4]}`,
    "Catalog RI triggers",
  );

  assert.deepEqual(
    generated.SHARED_BETA_ADMISSION_DORMANT_RELATIONS,
    TARGET_RELATIONS,
  );
  assert.deepEqual(
    generated.SHARED_BETA_ADMISSION_DORMANT_FUNCTIONS,
    TARGET_FUNCTIONS,
  );
  assert.deepEqual(
    generated.SHARED_BETA_ADMISSION_DORMANT_TYPES,
    [TARGET_TYPE],
  );
  assert.equal(
    Object.isFrozen(
      generated.SHARED_BETA_ADMISSION_DORMANT_RELATIONS,
    ),
    true,
  );
  assert.equal(
    Object.isFrozen(
      generated.SHARED_BETA_ADMISSION_DORMANT_FUNCTIONS,
    ),
    true,
  );
  assert.equal(
    Object.isFrozen(
      generated.SHARED_BETA_ADMISSION_DORMANT_TYPES,
    ),
    true,
  );
}

export function verifyCatalogExports(
  generated,
  migrationSqlSha256,
) {
  assertSha256(migrationSqlSha256, "Migration SHA-256 is invalid.");
  const snapshot = snapshotFromCatalogModule(generated);
  assertSnapshotShape(snapshot, generated);
  const catalog = generated.SHARED_BETA_ADMISSION_CATALOG;
  assert.equal(
    Object.isFrozen(catalog),
    true,
    "Catalog metadata must be frozen.",
  );
  assert.deepEqual(
    Object.keys(catalog).sort(),
    [
      "schemaVersion",
      "migration",
      "migrationSqlSha256",
      "source",
      "catalogSnapshotDigestAlgorithm",
      "catalogSnapshotDigestSha256",
      "postgresqlMajor",
      "relationCount",
      "columnCount",
      "sealedColumnCount",
      "constraintCount",
      "indexCount",
      "functionCount",
      "typeCount",
      "enumLabelCount",
      "triggerCount",
      "referentialTriggerCount",
    ].sort(),
  );
  const expectedDigest = catalogSnapshotDigest(
    snapshot,
    migrationSqlSha256,
  );
  assert.equal(catalog?.schemaVersion, SNAPSHOT_SCHEMA_VERSION);
  assert.equal(catalog?.migration, TARGET_MIGRATION);
  assert.equal(
    catalog?.migrationSqlSha256,
    migrationSqlSha256,
    "Catalog migrationSqlSha256 must match actual migration bytes.",
  );
  assert.equal(catalog?.source, "POSTGRESQL_16_PG_CATALOG");
  assert.equal(
    catalog?.catalogSnapshotDigestAlgorithm,
    SNAPSHOT_DIGEST_ALGORITHM,
  );
  assert.equal(
    catalog?.catalogSnapshotDigestSha256,
    expectedDigest,
    "Catalog catalogSnapshotDigestSha256 must match exported rows.",
  );
  assert.equal(catalog?.postgresqlMajor, POSTGRESQL_MAJOR);
  assertSha256(
    catalog?.catalogSnapshotDigestSha256,
    "Catalog snapshot digest is invalid.",
  );
  assert.deepEqual(
    {
      columnCount: catalog?.columnCount,
      constraintCount: catalog?.constraintCount,
      enumLabelCount: catalog?.enumLabelCount,
      functionCount: catalog?.functionCount,
      indexCount: catalog?.indexCount,
      referentialTriggerCount: catalog?.referentialTriggerCount,
      relationCount: catalog?.relationCount,
      sealedColumnCount: catalog?.sealedColumnCount,
      triggerCount: catalog?.triggerCount,
      typeCount: catalog?.typeCount,
    },
    EXPECTED_CATALOG_COUNTS,
    "Catalog count metadata must match exact exported row counts.",
  );
  return {
    catalogSnapshotDigestSha256: expectedDigest,
    countsVerified: true,
  };
}

async function importCatalogModule(
  targetPath,
  catalogFileSha256,
) {
  assertSha256(catalogFileSha256, "Catalog file SHA-256 is invalid.");
  const moduleUrl = pathToFileURL(targetPath);
  moduleUrl.searchParams.set("sha256", catalogFileSha256);
  return import(moduleUrl.href);
}

async function verifyCatalogModule(
  targetPath,
  catalogFileSha256,
  migrationSqlSha256,
) {
  return verifyCatalogExports(
    await importCatalogModule(targetPath, catalogFileSha256),
    migrationSqlSha256,
  );
}

export async function runCheckedInCatalogVerification() {
  const targetMigrationPath = fileURLToPath(
    new URL(
      `../prisma/migrations/${TARGET_MIGRATION}/migration.sql`,
      import.meta.url,
    ),
  );
  const migrationSqlSha256 = sha256(
    await readFile(targetMigrationPath),
  );
  assertSha256(
    migrationSqlSha256,
    "Actual migration SHA-256 is invalid.",
  );
  const migrationPlan = await readMigrationPlan(
    migrationSqlSha256,
  );
  assert.equal(
    migrationPlan.targetMigrationPath,
    targetMigrationPath,
  );
  const targetPath = catalogTargetPath();
  const catalogFileSha256 = sha256(await readFile(targetPath));
  const verification = await verifyCatalogModule(
    targetPath,
    catalogFileSha256,
    migrationSqlSha256,
  );
  return {
    script: SCRIPT_NAME,
    status: "PASS",
    mode: "VERIFY",
    migration: TARGET_MIGRATION,
    migrationSqlSha256,
    catalogFileSha256,
    catalogSnapshotDigestSha256:
      verification.catalogSnapshotDigestSha256,
    catalogCountsVerified: verification.countsVerified,
    databaseConnections: 0,
    filesWritten: 0,
  };
}

export async function runOfflineSelfTest() {
  assert.deepEqual(parseArguments(["--write"]), {
    help: false,
    selfTest: false,
    verify: false,
    write: true,
  });
  assert.deepEqual(parseArguments(["--self-test"]), {
    help: false,
    selfTest: true,
    verify: false,
    write: false,
  });
  assert.deepEqual(parseArguments(["--verify"]), {
    help: false,
    selfTest: false,
    verify: true,
    write: false,
  });
  assert.throws(() => parseArguments([]));
  assert.throws(() => parseArguments(["--verify", "--write"]));
  assert.throws(() =>
    parseSafeSourceDatabaseUrl(
      "postgresql://postgres:postgres@database.invalid:5432/leetplus_ci?schema=public",
    ),
  );
  assert.throws(() =>
    parseSafeSourceDatabaseUrl(
      "postgresql://postgres:postgres@127.0.0.1:5432/leetplus?schema=public",
    ),
  );
  assert.throws(() =>
    assertRealEnvironment({
      DATABASE_URL:
        "postgresql://postgres:postgres@127.0.0.1:5432/leetplus_ci?schema=public",
      NODE_ENV: "production",
      SHARED_BETA_ADMISSION_CATALOG_MATERIALIZE_CONFIRM:
        REQUIRED_CONFIRMATION,
      SHARED_BETA_ADMISSION_CATALOG_EXPECTED_MIGRATION_SHA256:
        "a".repeat(64),
    }),
  );
  const parsed = assertRealEnvironment({
    DATABASE_URL:
      "postgresql://postgres:postgres@127.0.0.1:5432/leetplus_ci?schema=public",
    NODE_ENV: "test",
    SHARED_BETA_ADMISSION_CATALOG_MATERIALIZE_CONFIRM:
      REQUIRED_CONFIRMATION,
    SHARED_BETA_ADMISSION_CATALOG_EXPECTED_MIGRATION_SHA256:
      "a".repeat(64),
  });
  assert.equal(parsed.databaseName, "leetplus_ci");
  assertSafeGeneratedDatabaseName(
    "lp_admission172_catalog_ci_0123456789abcdef",
  );
  assert.throws(() =>
    assertSafeGeneratedDatabaseName("leetplus_ci"),
  );
  assertSafeTempRoot(
    join(tmpdir(), `${TEMP_ROOT_PREFIX}0123456789abcdef`),
  );
  assert.throws(() => assertSafeTempRoot(tmpdir()));
  const checkedInVerification =
    await runCheckedInCatalogVerification();
  assert.equal(checkedInVerification.mode, "VERIFY");
  assert.equal(checkedInVerification.databaseConnections, 0);
  assert.equal(checkedInVerification.filesWritten, 0);
  const checkedInCatalogPath = catalogTargetPath();
  const checkedInCatalogFileSha256 = sha256(
    await readFile(checkedInCatalogPath),
  );
  const checkedInModule = await importCatalogModule(
    checkedInCatalogPath,
    checkedInCatalogFileSha256,
  );
  const fixture = snapshotFromCatalogModule(checkedInModule);
  const migrationSqlSha256 =
    checkedInVerification.migrationSqlSha256;
  assert.equal(
    catalogSnapshotDigest(fixture, migrationSqlSha256),
    catalogSnapshotDigest(
      structuredClone(fixture),
      migrationSqlSha256,
    ),
  );
  const rendered = renderCatalogModule(
    structuredClone(fixture),
    migrationSqlSha256,
  );
  assert.match(rendered, /Do not edit catalog rows/u);
  assert.match(
    rendered,
    new RegExp(
      `migrationSqlSha256:\\s*\\n\\s+"${migrationSqlSha256}"`,
      "u",
    ),
  );
  const verificationRoot = await mkdtemp(
    join(tmpdir(), TEMP_ROOT_PREFIX),
  );
  assertSafeTempRoot(verificationRoot);
  try {
    const verificationPath = join(
      verificationRoot,
      "generated-catalog-self-test.mjs",
    );
    await writeFile(verificationPath, rendered, "utf8");
    const verificationFileSha256 = sha256(
      await readFile(verificationPath),
    );
    assert.deepEqual(
      await verifyCatalogModule(
        verificationPath,
        verificationFileSha256,
        migrationSqlSha256,
      ),
      {
        catalogSnapshotDigestSha256:
          catalogSnapshotDigest(
            fixture,
            migrationSqlSha256,
          ),
        countsVerified: true,
      },
    );
  } finally {
    await rm(verificationRoot, {
      force: true,
      recursive: true,
    });
  }
  assert.throws(
    () =>
      verifyCatalogExports(
        checkedInModule,
        migrationSqlSha256 === "a".repeat(64)
          ? "b".repeat(64)
          : "a".repeat(64),
      ),
    /migrationSqlSha256/u,
  );
  const countTamperedModule = {
    ...checkedInModule,
    SHARED_BETA_ADMISSION_CATALOG: Object.freeze({
      ...checkedInModule.SHARED_BETA_ADMISSION_CATALOG,
      columnCount:
        checkedInModule.SHARED_BETA_ADMISSION_CATALOG.columnCount + 1,
    }),
  };
  assert.throws(
    () =>
      verifyCatalogExports(
        countTamperedModule,
        migrationSqlSha256,
      ),
    /count metadata/u,
  );
  const digestTamperedModule = {
    ...checkedInModule,
    SHARED_BETA_ADMISSION_CATALOG: Object.freeze({
      ...checkedInModule.SHARED_BETA_ADMISSION_CATALOG,
      catalogSnapshotDigestSha256:
        checkedInModule.SHARED_BETA_ADMISSION_CATALOG
          .catalogSnapshotDigestSha256 === "a".repeat(64)
          ? "b".repeat(64)
          : "a".repeat(64),
    }),
  };
  assert.throws(
    () =>
      verifyCatalogExports(
        digestTamperedModule,
        migrationSqlSha256,
      ),
    /catalogSnapshotDigestSha256/u,
  );
  return {
    script: SCRIPT_NAME,
    status: "PASS",
    mode: "SELF_TEST",
    checks: 29,
    generatedDatabaseCount: 1,
    sourceDatabaseMigrationsApplied: 0,
  };
}

async function runRealMaterialization(environment) {
  const {
    databaseName: sourceDatabaseName,
    expectedMigrationSha256,
    sourceUrl,
  } = assertRealEnvironment(environment);
  const migrationPlan = await readMigrationPlan(
    expectedMigrationSha256,
  );
  const databaseName = generatedDatabaseName();
  const sourceDatabaseUrl = databaseUrlFor(
    sourceUrl,
    sourceDatabaseName,
  );
  const generatedDatabaseUrl = databaseUrlFor(
    sourceUrl,
    databaseName,
  );
  const admin = prismaClient(sourceDatabaseUrl);
  let clusterLockHeld = false;
  let databaseCreated = false;
  let cleanupVerified = false;
  let tempRoot;
  let primaryError;
  let generatedSource;
  let sourceFingerprintBefore;
  let phase = "ENVIRONMENT_ADMISSION";
  const cleanupErrors = [];

  try {
    phase = "SOURCE_ADMIN_ADMISSION";
    await assertTestSuperuser(admin, sourceDatabaseName);
    phase = "SOURCE_FINGERPRINT_BEFORE";
    sourceFingerprintBefore =
      await sourceMigrationFingerprint(admin);
    phase = "CLUSTER_LOCK";
    await acquireClusterLock(admin);
    clusterLockHeld = true;
    phase = "MIGRATION_ARTIFACT";
    tempRoot = await mkdtemp(join(tmpdir(), TEMP_ROOT_PREFIX));
    assertSafeTempRoot(tempRoot);
    const artifact = await createMigrationArtifact(
      tempRoot,
      migrationPlan,
    );
    assert.equal(
      sha256(await readFile(artifact.copiedMigrationPath)),
      expectedMigrationSha256,
    );
    phase = "GENERATED_DATABASE_CREATE";
    await createDatabase(admin, databaseName);
    databaseCreated = true;
    phase = "MIGRATION_DEPLOY";
    runMigrateDeploy(artifact.schemaPath, generatedDatabaseUrl);

    const generated = prismaClient(generatedDatabaseUrl);
    try {
      phase = "PG_CATALOG_SNAPSHOT";
      const snapshot = await readCatalogSnapshot(
        generated,
        migrationPlan,
        (catalogPhase) => {
          phase = catalogPhase;
        },
      );
      generatedSource = renderCatalogModule(
        snapshot,
        migrationPlan.migrationSqlSha256,
      );
    } finally {
      await generated.$disconnect();
    }

    phase = "SOURCE_FINGERPRINT_AFTER";
    assert.equal(
      await sourceMigrationFingerprint(admin),
      sourceFingerprintBefore,
      "Catalog materialization changed source migration state.",
    );
  } catch (error) {
    if (
      error !== null &&
      typeof error === "object" &&
      typeof error.catalogMaterializationPhase !== "string"
    ) {
      error.catalogMaterializationPhase = phase;
    }
    primaryError = error;
  } finally {
    if (databaseCreated) {
      try {
        await dropDatabase(admin, databaseName);
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    try {
      await assertNoGeneratedDatabase(admin, databaseName);
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
      "Catalog materialization and cleanup both failed.",
    );
  }
  if (primaryError) throw primaryError;
  if (cleanupErrors.length > 0) {
    throw new AggregateError(
      cleanupErrors,
      "Catalog materialization cleanup failed.",
    );
  }
  assert.equal(cleanupVerified, true);
  assert.equal(typeof generatedSource, "string");
  assert.equal(
    sha256(await readFile(migrationPlan.targetMigrationPath)),
    expectedMigrationSha256,
    "Reviewed migration changed before catalog write.",
  );

  let writeEvidence;
  try {
    writeEvidence = await atomicWriteCatalog(
      generatedSource,
      expectedMigrationSha256,
    );
  } catch (error) {
    if (error !== null && typeof error === "object") {
      error.catalogMaterializationPhase = "CATALOG_REPLACE";
    }
    throw error;
  }
  assert.equal(
    writeEvidence.preReplaceVerification.countsVerified,
    true,
  );
  const verification = await verifyCatalogModule(
    writeEvidence.targetPath,
    writeEvidence.catalogFileSha256,
    expectedMigrationSha256,
  );
  return {
    script: SCRIPT_NAME,
    status: "PASS",
    mode: "WRITE",
    migration: TARGET_MIGRATION,
    migrationSqlSha256: expectedMigrationSha256,
    catalogSnapshotDigestSha256:
      verification.catalogSnapshotDigestSha256,
    catalogFileSha256: writeEvidence.catalogFileSha256,
    catalogCountsVerified: verification.countsVerified,
    postgresMajor: POSTGRESQL_MAJOR,
    relationCount: TARGET_RELATIONS.length,
    functionCount: TARGET_FUNCTIONS.length,
    sourceDatabaseMigrationsApplied: 0,
    cleanup: {
      generatedDatabasesRemaining: 0,
      temporaryArtifactsRemaining: 0,
    },
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${HELP}\n`);
    return;
  }
  if (options.selfTest) {
    process.stdout.write(
      `${JSON.stringify(await runOfflineSelfTest())}\n`,
    );
    return;
  }
  if (options.verify) {
    process.stdout.write(
      `${JSON.stringify(
        await runCheckedInCatalogVerification(),
      )}\n`,
    );
    return;
  }
  process.stdout.write(
    `${JSON.stringify(await runRealMaterialization(process.env))}\n`,
  );
}

const invokedPath = process.argv[1]
  ? resolve(process.argv[1]).toLowerCase()
  : "";
if (
  invokedPath ===
  resolve(fileURLToPath(import.meta.url)).toLowerCase()
) {
  main().catch((error) => {
    const primaryError =
      error instanceof AggregateError
        ? error.errors[0]
        : error;
    const phase = String(
      primaryError?.catalogMaterializationPhase ?? "",
    );
    const sqlState = String(
      primaryError?.meta?.code ?? "",
    );
    process.stderr.write(
      `${JSON.stringify({
        script: SCRIPT_NAME,
        status: "ERROR",
        error: {
          code:
            typeof primaryError?.code === "string"
              ? primaryError.code
              : "CATALOG_MATERIALIZATION_FAILED",
          ...((
            new Set([
            "SOURCE_ADMIN_ADMISSION",
            "SOURCE_FINGERPRINT_BEFORE",
            "CLUSTER_LOCK",
            "MIGRATION_ARTIFACT",
            "GENERATED_DATABASE_CREATE",
            "MIGRATION_DEPLOY",
            "PG_CATALOG_SNAPSHOT",
            "SOURCE_FINGERPRINT_AFTER",
            "CATALOG_REPLACE",
            ]).has(phase) ||
            /^PG_CATALOG_[A-Z_]+$/u.test(phase)
          )
            ? { phase }
            : {}),
          ...(/^[0-9A-Z]{5}$/u.test(sqlState)
            ? { sqlState }
            : {}),
        },
      })}\n`,
    );
    process.exitCode = 1;
  });
}

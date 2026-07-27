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

const SCRIPT_NAME = "staff-task-integrity-snapshot-admission-smoke";
const REQUIRED_CONFIRMATION =
  "run-staff-task-integrity-snapshot-admission-smoke";
const ADMISSION_ENV_PREFIX = "STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_";
const BASELINE_STATE = "BASELINE_156";
const EXPAND_STATE = "EXPAND_162";
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
const APPROVAL_REFERENCE = "synthetic-admission-smoke";
const ADMISSION_SCRIPT_PATH = fileURLToPath(
  new URL("./staff-task-integrity-snapshot-admission.mjs", import.meta.url),
);
const PLANNER_SCRIPT_PATH = fileURLToPath(
  new URL("./staff-task-integrity-reconciliation-plan.mjs", import.meta.url),
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
const SOURCE_FINGERPRINT_TABLES = READER_SELECT_RELATIONS;

const HELP = `
${SCRIPT_NAME}

Local/CI-only PostgreSQL smoke for the guarded StaffTask snapshot admission
command. It creates a random disposable database from template0, deploys the
exact committed migration baseline through Prisma, admits BASELINE_156,
deploys exactly migrations 157..162, and admits EXPAND_162 through a dedicated
least-privilege login. It then injects synthetic cross-tenant legacy fixtures
only into the disposable database and destroys the database and login in a
finally block.

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
    BASELINE_MIGRATION_COUNT + EXPAND_MIGRATIONS.length,
    "The snapshot admission smoke requires the frozen 162-migration manifest.",
  );
  assert.equal(
    migrationNames[BASELINE_MIGRATION_COUNT - 1],
    BASELINE_LAST_MIGRATION,
    "The frozen BASELINE_156 migration boundary changed.",
  );
  assert.deepEqual(
    migrationNames.slice(BASELINE_MIGRATION_COUNT),
    [...EXPAND_MIGRATIONS],
    "Migrations 157..162 must remain the exact contiguous EXPAND sequence.",
  );

  return {
    sourcePrismaDir,
    baselineMigrations: migrationNames.slice(0, BASELINE_MIGRATION_COUNT),
    expandMigrations: migrationNames.slice(BASELINE_MIGRATION_COUNT),
    allMigrations: migrationNames,
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
    stage === "baseline" || stage === "expand",
    "Unknown staged migration phase.",
  );
  assertSafeTempRoot(tempRoot);
  const targetPrismaDir = path.join(tempRoot, "prisma");
  const targetMigrationsDir = path.join(targetPrismaDir, "migrations");
  const selectedMigrations =
    stage === "baseline"
      ? migrationPlan.baselineMigrations
      : migrationPlan.expandMigrations;
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
  const exactSelectRelations = READER_SELECT_RELATIONS.map(
    (relationName) => `public.${quoteIdentifier(relationName)}`,
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
      `GRANT SELECT ON TABLE ${exactSelectRelations} TO ${quotedRole}`,
    );
    await cloneAdmin.$executeRawUnsafe(
      `GRANT EXECUTE ON FUNCTION pg_catalog.pg_control_system() TO ${quotedRole}`,
    );
  } finally {
    await cloneAdmin.$disconnect();
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
      [...READER_SELECT_RELATIONS].sort(),
      "The admission reader has missing or excessive public SELECT scope.",
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
    assert.equal(state[0].can_connect, true);
    assert.equal(state[0].can_create_database, false);
    assert.equal(state[0].can_use_temporary, false);
    assert.equal(state[0].can_use_schema, true);
    assert.equal(state[0].can_create_schema_object, false);

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
  const fixtureIds = {
    tenantA: randomUUID(),
    tenantB: randomUUID(),
    storeB: randomUUID(),
    tasks: [randomUUID(), randomUUID()],
  };
  const suffix = randomBytes(6).toString("hex");
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
            ${`Synthetic admission tenant A ${suffix}`},
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
            ${`Synthetic admission tenant B ${suffix}`},
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
            ${`Synthetic admission store B ${suffix}`},
            'UTC',
            true,
            ${now},
            ${now}
          )
        `;
        for (let index = 0; index < fixtureIds.tasks.length; index += 1) {
          await transaction.$executeRaw`
            INSERT INTO public."StaffTask" (
              "id", "tenantId", "storeId", "title", "type", "status",
              "priority", "createdAt", "updatedAt"
            )
            VALUES (
              ${fixtureIds.tasks[index]},
              ${fixtureIds.tenantA},
              ${fixtureIds.storeB},
              ${`Synthetic cross-tenant task ${index + 1} ${suffix}`},
              'ONE_TIME',
              'OPEN',
              'NORMAL',
              ${now},
              ${now}
            )
          `;
        }
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
      fixtureIds.tasks[0],
      fixtureIds.tasks[1],
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
  assert.equal(report?.database?.databaseIdentityDigestMatched, true);
}

function assertOutputSafe(
  serialized,
  {
    sourceDatabaseName,
    cloneDatabaseName,
    readerRoleName,
    readerPassword,
    fixtureIds = null,
  },
) {
  const forbiddenValues = [
    sourceDatabaseName,
    cloneDatabaseName,
    readerRoleName,
    readerPassword,
    ...(fixtureIds
      ? [
          fixtureIds.tenantA,
          fixtureIds.tenantB,
          fixtureIds.storeB,
          ...fixtureIds.tasks,
        ]
      : []),
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
    /GRANT SELECT ON TABLE \$\{exactSelectRelations\} TO \$\{quotedRole\}/,
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
  assertSourceGuards();
  const migrationPlan = await readMigrationPlan();
  assert.equal(
    migrationPlan.baselineMigrations.length,
    BASELINE_MIGRATION_COUNT,
  );
  assert.deepEqual(migrationPlan.expandMigrations, [...EXPAND_MIGRATIONS]);

  return {
    script: SCRIPT_NAME,
    status: "PASS",
    checks: 34,
    localCiOnly: true,
    disposableDatabaseOnly: true,
    selectOnlyAdmissionRole: true,
    exactSelectRelations: READER_SELECT_RELATIONS.length,
    committedReleaseArtifactOnly: true,
    baselineMigrations: migrationPlan.baselineMigrations.length,
    expandMigrations: migrationPlan.expandMigrations.length,
    sourceDatabaseWrites: false,
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
    const runConfirmation = admissionModule.RUN_CONFIRMATION;
    const isolationAttestation = admissionModule.ISOLATION_ATTESTATION;
    const plannerRunConfirmation = plannerModule.RUN_CONFIRMATION;
    assert.equal(typeof runConfirmation, "string");
    assert(runConfirmation.length > 0);
    assert.equal(typeof isolationAttestation, "string");
    assert(isolationAttestation.length > 0);
    assert.equal(typeof plannerRunConfirmation, "string");
    assert(plannerRunConfirmation.length > 0);

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
        expectedState: EXPAND_STATE,
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
        expectedState: EXPAND_STATE,
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

  if (primaryError) {
    throw primaryError;
  }
  if (cleanupErrors.length > 0) {
    throw cleanupErrors[0];
  }

  return {
    script: SCRIPT_NAME,
    status: "PASS",
    scenarios: 9,
    classification: SNAPSHOT_CLASSIFICATION,
    admittedStates: [BASELINE_STATE, EXPAND_STATE],
    baselineMigrationsApplied: BASELINE_MIGRATION_COUNT,
    expandMigrationsApplied: EXPAND_MIGRATIONS.length,
    committedReleaseArtifactOnly: true,
    exactSelectRelations: READER_SELECT_RELATIONS.length,
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
    stableContentDigestVerified: true,
    timestampBoundExecutionDigestVerified: true,
    tamperedAdmissionRejected: true,
    tamperedMigrationRejected: true,
    protectedOutputVerified: true,
    sourceAggregateFingerprintUnchanged: true,
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

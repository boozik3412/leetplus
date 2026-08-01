import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { PrismaClient } from "@prisma/client";

import {
  buildCurrent181SmokeSessionOptions,
  parseCurrent181SmokeSourceUrl,
  readCurrent181SmokeStackPlan,
  splitCurrent181SmokeSql,
} from "./identity-mail-tenant-lock-drain-current181-candidate-smoke.mjs";
import {
  readCurrent182FoundationInputs,
  validateCurrent182Foundation,
} from "./identity-mail-tenant-first-claim-current182-foundation.mjs";

export const CURRENT182_SMOKE_SCRIPT_NAME =
  "identity-mail-tenant-first-claim-current182-candidate-smoke";
export const CURRENT182_SMOKE_CONFIRMATION =
  "run-identity-mail-tenant-first-claim-current182-candidate-smoke";
export const CURRENT182_SMOKE_CONFIRMATION_ENVIRONMENT =
  "IDENTITY_MAIL_TENANT_FIRST_CLAIM_CURRENT182_CANDIDATE_SMOKE_CONFIRM";
export const CURRENT182_SMOKE_CLONE_PATTERN = /^lp_imtec_[0-9a-f]{32}_ci$/u;

const CANONICAL_COUNT = 179;
const CANONICAL_HEAD = "20260731120000_identity_mail_delivery_release_head";
const CURRENT181 = "20260801020000_identity_mail_tenant_lock_drain_worker_v2";
const CURRENT181_SHA256 =
  "b78b40ce37f48419c8d9e4f6ad8a90ddb9a242128a33d7dbfa76d8439ba0f455";
const CURRENT182 = "20260801030000_identity_mail_tenant_first_claim_protocol";
const CURRENT182_CONFIRMATION =
  "rehearse-noncanonical-identity-mail-tenant-first-claim-current182";
const CURRENT182_CONFIRMATION_GUC =
  "leetplus.identity_mail_tenant_first_claim_current182_confirmation";
const CURRENT182_SHA256_GUC =
  "leetplus.identity_mail_tenant_first_claim_current182_sha256";
const SAFE_SOURCE_DATABASE_PATTERN = /^[a-z][a-z0-9_]{0,54}_ci$/u;
const TEMP_PREFIX = "leetplus-imtec-current182-";
const CLUSTER_LOCK_CLASS = 1_817_190_182;
const CLUSTER_LOCK_OBJECT = 182;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const TEMP_SCHEMA = `datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
`;

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const DATABASE_PACKAGE_DIRECTORY = resolve(SCRIPT_DIRECTORY, "..");
const PRISMA_DIRECTORY = join(DATABASE_PACKAGE_DIRECTORY, "prisma");

const ROUTINES = Object.freeze([
  Object.freeze({
    name: "identity_mail_tenant_lock_v1",
    signature: 'public."identity_mail_tenant_lock_v1"(text)',
    result: "text",
    securityDefiner: false,
    prosrcSha256:
      "31c675561131be5f7b8b20b417567d084fda580da2f6d449eae9470b3808e817",
  }),
  Object.freeze({
    name: "identity_email_claim_reserve_invite_v2",
    signature:
      'public."identity_email_claim_reserve_invite_v2"(text,text,text)',
    result: "jsonb",
    securityDefiner: true,
    prosrcSha256:
      "d8e6dfb1634be66e6a4f3be87fc480f2e4a5aba417a97e26eff8ccdefbaed6b5",
  }),
  Object.freeze({
    name: "identity_email_claim_assert_invite_v1",
    signature:
      'public."identity_email_claim_assert_invite_v1"(text,text,text,integer)',
    result: "jsonb",
    securityDefiner: true,
    prosrcSha256:
      "148532adcee88fe3dd309912d0929e53cb8c3a71c4c838bfa50535df21046bed",
  }),
  Object.freeze({
    name: "identity_email_claim_assert_invite_locator_v1",
    signature:
      'public."identity_email_claim_assert_invite_locator_v1"(text,text,text,integer)',
    result: "jsonb",
    securityDefiner: true,
    prosrcSha256:
      "59d2de1db1405e4c9cf66b3ba25cfe341639f92b293173280f0e36e059a8050d",
  }),
  Object.freeze({
    name: "identity_email_claim_transition_v2",
    signature:
      'public."identity_email_claim_transition_v2"(text,text,text,text,integer,text,text)',
    result: "jsonb",
    securityDefiner: true,
    prosrcSha256:
      "e6b34e1044f9ffa7dffd95eb09ac7e4f08e640d7ef6146b99bf9c42ed3802775",
  }),
  Object.freeze({
    name: "identity_email_claim_release_v2",
    signature:
      'public."identity_email_claim_release_v2"(text,text,text,text,integer)',
    result: "jsonb",
    securityDefiner: true,
    prosrcSha256:
      "39e553ed4e89ff2054a8b462827175779cf6829fde36f02e28cafca64310ac12",
  }),
  Object.freeze({
    name: "identity_email_claim_reserve_invite_v1",
    signature:
      'public."identity_email_claim_reserve_invite_v1"(text,text,text)',
    result: "jsonb",
    securityDefiner: true,
    prosrcSha256:
      "cb85b2de740b9af3c79d2df5e470a506523db773164b78d5352f3d92443da2ef",
    legacyStub: true,
  }),
  Object.freeze({
    name: "identity_email_claim_transition_v1",
    signature:
      'public."identity_email_claim_transition_v1"(text,text,text,text,integer,text,text)',
    result: "jsonb",
    securityDefiner: true,
    prosrcSha256:
      "cb85b2de740b9af3c79d2df5e470a506523db773164b78d5352f3d92443da2ef",
    legacyStub: true,
  }),
  Object.freeze({
    name: "identity_email_claim_release_v1",
    signature:
      'public."identity_email_claim_release_v1"(text,text,text,text,integer)',
    result: "jsonb",
    securityDefiner: true,
    prosrcSha256:
      "cb85b2de740b9af3c79d2df5e470a506523db773164b78d5352f3d92443da2ef",
    legacyStub: true,
  }),
]);

export const CURRENT182_SMOKE_PROBE_QUERIES = Object.freeze({
  legacyReserve:
    'SELECT public."identity_email_claim_reserve_invite_v1"($1::TEXT,$2::TEXT,$3::TEXT)',
  legacyTransition:
    'SELECT public."identity_email_claim_transition_v1"($1::TEXT,$2::TEXT,$3::TEXT,$4::TEXT,$5::INTEGER,$6::TEXT,$7::TEXT)',
  legacyRelease:
    'SELECT public."identity_email_claim_release_v1"($1::TEXT,$2::TEXT,$3::TEXT,$4::TEXT,$5::INTEGER)',
  canonicalReserve:
    'SELECT public."identity_email_claim_reserve_invite_v2"($1::TEXT,$2::TEXT,$3::TEXT)',
  canonicalAssert:
    'SELECT public."identity_email_claim_assert_invite_v1"($1::TEXT,$2::TEXT,$3::TEXT,$4::INTEGER)',
  canonicalLocatorAssert:
    'SELECT public."identity_email_claim_assert_invite_locator_v1"($1::TEXT,$2::TEXT,$3::TEXT,$4::INTEGER)',
  canonicalTransition:
    'SELECT public."identity_email_claim_transition_v2"($1::TEXT,$2::TEXT,$3::TEXT,$4::TEXT,$5::INTEGER,$6::TEXT,$7::TEXT)',
  canonicalRelease:
    'SELECT public."identity_email_claim_release_v2"($1::TEXT,$2::TEXT,$3::TEXT,$4::TEXT,$5::INTEGER)',
});

const LEGACY_STUB_BODY =
  "BEGIN RAISE EXCEPTION 'LEGACY_IDENTITY_CLAIM_WRITER_RETIRED' USING ERRCODE = '55000'; END;";

const HELP = `
${CURRENT182_SMOKE_SCRIPT_NAME}

Rehearses the exact dormant CURRENT179 -> CURRENT180 -> CURRENT181 ->
CURRENT182 stack on PostgreSQL 16. The source stays read-only. All DDL,
catalog checks and the injected post-apply rollback run on random disposable
lp_imtec_<32hex>_ci clones that are dropped in finally.

Usage:
  node scripts/${CURRENT182_SMOKE_SCRIPT_NAME}.mjs
  node scripts/${CURRENT182_SMOKE_SCRIPT_NAME}.mjs --self-test
  node scripts/${CURRENT182_SMOKE_SCRIPT_NAME}.mjs --help

Required for the real rehearsal:
  NODE_ENV=test
  DATABASE_URL=<numeric-loopback PostgreSQL 16 superuser-owned *_ci CURRENT179>
  ${CURRENT182_SMOKE_CONFIRMATION_ENVIRONMENT}=${CURRENT182_SMOKE_CONFIRMATION}

This command never authorizes deployment or production mutation. CURRENT182
remains NOT_DEPLOYABLE.
`.trim();

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function assertCurrent182PredecessorManifestDigest(entries, expected) {
  assert.ok(Array.isArray(entries) && entries.length > 0);
  assert.match(expected, SHA256_PATTERN);
  for (const entry of entries) {
    assert.match(entry?.name, /^[0-9]{14}_[a-z0-9_]+$/u);
    assert.match(entry?.sha256, SHA256_PATTERN);
  }
  const actual = digest(
    Buffer.from(
      `${entries
        .map(({ name, sha256 }) => `${name} ${sha256}`)
        .join("\n")}\n`,
      "utf8",
    ),
  );
  assert.equal(
    actual,
    expected,
    "CURRENT182 metadata predecessor manifest must match the exact normalized CURRENT181 stack.",
  );
  return actual;
}

function compactSql(value) {
  return String(value ?? "")
    .replaceAll("\r\n", "\n")
    .replaceAll(/\s+/gu, " ")
    .trim();
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function valuesSql(values) {
  return values.map((value) => `(${sqlLiteral(value)})`).join(",\n");
}

function normalizeRows(rows) {
  return JSON.parse(JSON.stringify(rows));
}

export function sanitizeCurrent182SmokeError(error) {
  return String(error instanceof Error ? error.message : error)
    .replace(/postgres(?:ql)?:\/\/[^\s")]+/giu, "<redacted-postgresql-url>")
    .replace(/[A-Za-z0-9_-]{86,}/gu, "<redacted-secret>");
}

function formatFailure(error) {
  if (!(error instanceof AggregateError)) {
    return sanitizeCurrent182SmokeError(
      error instanceof Error && error.stack ? error.stack : error,
    );
  }
  return [
    sanitizeCurrent182SmokeError(error),
    ...error.errors.map(
      (cause, index) => `cause_${index + 1}: ${formatFailure(cause)}`,
    ),
  ].join("\n");
}

function extractSqlState(error) {
  if (
    error &&
    typeof error === "object" &&
    typeof error.meta?.code === "string"
  ) {
    return error.meta.code;
  }
  if (error && typeof error === "object" && typeof error.code === "string") {
    return error.code;
  }
  return null;
}

async function expectSqlState(expected, operation, messagePattern = null) {
  await assert.rejects(operation, (error) => {
    assert.equal(extractSqlState(error), expected, formatFailure(error));
    if (messagePattern) {
      assert.match(sanitizeCurrent182SmokeError(error), messagePattern);
    }
    return true;
  });
}

export function parseCurrent182SmokeArguments(argv) {
  if (!Array.isArray(argv)) throw new Error("CLI_ARGUMENTS_INVALID");
  if (argv.length === 0) return Object.freeze({ help: false, selfTest: false });
  if (argv.length === 1 && argv[0] === "--help") {
    return Object.freeze({ help: true, selfTest: false });
  }
  if (argv.length === 1 && argv[0] === "--self-test") {
    return Object.freeze({ help: false, selfTest: true });
  }
  throw new Error("Use --help, --self-test, or no arguments.");
}

export function generateCurrent182SmokeCloneName() {
  const name = `lp_imtec_${randomBytes(16).toString("hex")}_ci`;
  assert.match(name, CURRENT182_SMOKE_CLONE_PATTERN);
  return name;
}

function databaseUrl(source, databaseName) {
  assert.match(databaseName, /^[a-z][a-z0-9_]{0,62}$/u);
  const target = new URL(source);
  target.pathname = `/${databaseName}`;
  target.search = "?schema=public";
  target.searchParams.set("connection_limit", "1");
  target.hash = "";
  return target.toString();
}

function prismaClient(url) {
  return new PrismaClient({ datasourceUrl: url, log: [] });
}

function assertSafeTempRoot(path) {
  const resolvedPath = resolve(path);
  const resolvedTemp = resolve(tmpdir());
  assert.ok(resolvedPath.startsWith(`${resolvedTemp}${sep}`));
  assert.ok(basename(resolvedPath).startsWith(TEMP_PREFIX));
  return resolvedPath;
}

export function buildCurrent182SmokeSessionOptions(
  current182Sha256,
  { includeCurrent182 = true } = {},
) {
  assert.match(current182Sha256, SHA256_PATTERN);
  const options = [...buildCurrent181SmokeSessionOptions(CURRENT181_SHA256)];
  if (includeCurrent182) {
    options.push(
      `-c ${CURRENT182_CONFIRMATION_GUC}=${CURRENT182_CONFIRMATION}`,
      `-c ${CURRENT182_SHA256_GUC}=${current182Sha256}`,
    );
  }
  return Object.freeze(options);
}

async function readCurrent182SmokePlan() {
  const [predecessor, inputs] = await Promise.all([
    readCurrent181SmokeStackPlan(),
    readCurrent182FoundationInputs(),
  ]);
  assert.equal(predecessor.current181.sha256, CURRENT181_SHA256);
  const foundation = validateCurrent182Foundation(inputs);
  assert.equal(foundation.decision, "CURRENT182_FOUNDATION_COMPLIANT");
  assert.deepEqual(foundation.findings, []);
  const content = Buffer.from(
    inputs.candidateSql.replaceAll("\r\n", "\n"),
    "utf8",
  );
  const metadata = JSON.parse(inputs.candidateMetadataText);
  const predecessorManifestDigest =
    assertCurrent182PredecessorManifestDigest(
      predecessor.stack,
      metadata.predecessor.manifestDigest,
    );
  const current182 = Object.freeze({
    content,
    metadata,
    name: CURRENT182,
    sha256: digest(content),
    text: content.toString("utf8"),
  });
  assert.equal(metadata.migrationSqlSha256, current182.sha256);
  const statements = splitCurrent181SmokeSql(current182.text);
  assert.equal(statements[0], "BEGIN");
  assert.equal(statements.at(-1), "COMMIT");
  return Object.freeze({
    current182,
    predecessor,
    predecessorManifestDigest,
    stack: Object.freeze([...predecessor.stack, current182]),
  });
}

async function createTemporaryPrismaArtifact(entries) {
  const root = await mkdtemp(join(tmpdir(), TEMP_PREFIX));
  assertSafeTempRoot(root);
  const migrations = join(root, "migrations");
  await mkdir(migrations);
  await writeFile(join(root, "schema.prisma"), TEMP_SCHEMA, {
    encoding: "utf8",
    flag: "wx",
  });
  await copyFile(
    join(PRISMA_DIRECTORY, "migrations", "migration_lock.toml"),
    join(migrations, "migration_lock.toml"),
  );
  for (const entry of entries) {
    const target = join(migrations, entry.name);
    await mkdir(target);
    await writeFile(join(target, "migration.sql"), entry.content, {
      flag: "wx",
    });
  }
  return Object.freeze({ root, schemaPath: join(root, "schema.prisma") });
}

function fencedDatabaseUrl(targetDatabaseUrl, current182Sha256, options) {
  const target = new URL(targetDatabaseUrl);
  const databaseName = decodeURIComponent(
    target.pathname.replace(/^\/+|\/+$/gu, ""),
  );
  assert.match(databaseName, CURRENT182_SMOKE_CLONE_PATTERN);
  target.searchParams.set(
    "options",
    buildCurrent182SmokeSessionOptions(current182Sha256, options).join(" "),
  );
  return target.toString();
}

function runPrismaDeploy(
  schemaPath,
  targetDatabaseUrl,
  current182Sha256,
  stage,
  options = {},
) {
  assert.match(stage, /^[a-z0-9_-]{1,80}$/u);
  const require = createRequire(import.meta.url);
  const prismaCliPath = require.resolve("prisma/build/index.js");
  const sessionOptions = buildCurrent182SmokeSessionOptions(
    current182Sha256,
    options,
  );
  return spawnSync(
    process.execPath,
    [prismaCliPath, "migrate", "deploy", "--schema", schemaPath],
    {
      cwd: DATABASE_PACKAGE_DIRECTORY,
      encoding: "utf8",
      env: {
        ...process.env,
        DATABASE_URL: fencedDatabaseUrl(
          targetDatabaseUrl,
          current182Sha256,
          options,
        ),
        NODE_ENV: "test",
        NO_COLOR: "1",
        PGOPTIONS: sessionOptions.join(" "),
        PRISMA_HIDE_UPDATE_MESSAGE: "true",
      },
      maxBuffer: 8 * 1024 * 1024,
      timeout: 420_000,
    },
  );
}

function assertPrismaDeploySucceeded(result, stage) {
  assert.equal(
    result.error,
    undefined,
    `${stage}: ${sanitizeCurrent182SmokeError(result.error)}`,
  );
  assert.equal(
    result.status,
    0,
    `${stage}: ${sanitizeCurrent182SmokeError(result.stderr || result.stdout)}`,
  );
}

async function acquireClusterLock(maintenance) {
  const [row] = await maintenance.$queryRawUnsafe(
    "SELECT pg_catalog.pg_try_advisory_lock($1::INTEGER, $2::INTEGER) AS acquired",
    CLUSTER_LOCK_CLASS,
    CLUSTER_LOCK_OBJECT,
  );
  assert.equal(row?.acquired, true, "Another CURRENT182 smoke is running.");
}

async function releaseClusterLock(maintenance) {
  const [row] = await maintenance.$queryRawUnsafe(
    "SELECT pg_catalog.pg_advisory_unlock($1::INTEGER, $2::INTEGER) AS released",
    CLUSTER_LOCK_CLASS,
    CLUSTER_LOCK_OBJECT,
  );
  assert.equal(row?.released, true);
}

async function createClone(maintenance, sourceDatabaseName, cloneDatabaseName) {
  assert.match(sourceDatabaseName, SAFE_SOURCE_DATABASE_PATTERN);
  assert.match(cloneDatabaseName, CURRENT182_SMOKE_CLONE_PATTERN);
  await maintenance.$executeRawUnsafe(
    `CREATE DATABASE ${quoteIdentifier(cloneDatabaseName)} TEMPLATE ${quoteIdentifier(sourceDatabaseName)}`,
  );
}

async function dropExactClone(maintenance, cloneDatabaseName) {
  assert.match(cloneDatabaseName, CURRENT182_SMOKE_CLONE_PATTERN);
  const rows = await maintenance.$queryRawUnsafe(
    `SELECT
       database.datname AS database_name,
       database.datistemplate AS is_template,
       owner.oid = (
         SELECT usesysid FROM pg_catalog.pg_user WHERE usename = CURRENT_USER
       ) AS owned_by_session
     FROM pg_catalog.pg_database AS database
     INNER JOIN pg_catalog.pg_roles AS owner ON owner.oid = database.datdba
     WHERE database.datname = $1`,
    cloneDatabaseName,
  );
  assert.ok(rows.length === 0 || rows.length === 1);
  if (rows.length === 1) {
    assert.equal(rows[0].database_name, cloneDatabaseName);
    assert.equal(rows[0].is_template, false);
    assert.equal(rows[0].owned_by_session, true);
    await maintenance.$executeRawUnsafe(
      `DROP DATABASE ${quoteIdentifier(cloneDatabaseName)} WITH (FORCE)`,
    );
  }
  const [residue] = await maintenance.$queryRawUnsafe(
    `SELECT pg_catalog.count(*)::INTEGER AS count
     FROM pg_catalog.pg_database
     WHERE datname = $1`,
    cloneDatabaseName,
  );
  assert.equal(Number(residue?.count ?? -1), 0);
}

async function sourceFingerprint(client, expectedDatabaseName) {
  return client.$transaction(
    async (transaction) => {
      await transaction.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      const [server] = await transaction.$queryRawUnsafe(`
        SELECT
          pg_catalog.current_database()::TEXT AS database_name,
          pg_catalog.current_setting('server_version_num')::INTEGER AS server_version_number,
          pg_catalog.current_setting('transaction_read_only')::BOOLEAN AS transaction_read_only,
          database.datistemplate AS is_template,
          owner.rolname::TEXT AS owner_name,
          CURRENT_USER::TEXT AS current_user_name,
          role.rolsuper AS current_user_superuser
        FROM pg_catalog.pg_database AS database
        INNER JOIN pg_catalog.pg_roles AS owner ON owner.oid = database.datdba
        INNER JOIN pg_catalog.pg_roles AS role ON role.rolname = CURRENT_USER
        WHERE database.datname = pg_catalog.current_database()
      `);
      assert.equal(server.database_name, expectedDatabaseName);
      const migrations = await transaction.$queryRawUnsafe(`
        SELECT
          "migration_name" AS name,
          "checksum" AS checksum,
          "finished_at" IS NOT NULL AS finished,
          "rolled_back_at" IS NOT NULL AS rolled_back
        FROM public."_prisma_migrations"
        ORDER BY "migration_name" COLLATE "C", "started_at", "id"
      `);
      const [surface] = await transaction.$queryRawUnsafe(`
        SELECT
          (SELECT pg_catalog.count(*) FROM public."Tenant")::TEXT AS tenant_count,
          (SELECT pg_catalog.count(*) FROM public."User")::TEXT AS user_count,
          (SELECT pg_catalog.count(*) FROM public."IdentityEmailClaim")::TEXT AS claim_count,
          pg_catalog.to_regprocedure(
            'public."identity_mail_tenant_lock_v1"(text)'
          )::TEXT AS tenant_lock_routine,
          pg_catalog.to_regclass(
            'public."IdentityMailDeliveryTenantEnrollmentCommand"'
          )::TEXT AS enrollment_command_relation
      `);
      const projection = normalizeRows({ migrations, server, surface });
      return Object.freeze({
        digest: digest(Buffer.from(JSON.stringify(projection), "utf8")),
        projection,
      });
    },
    { isolationLevel: "RepeatableRead", maxWait: 5_000, timeout: 30_000 },
  );
}

function assertCanonicalSource(fingerprint) {
  const { migrations, server, surface } = fingerprint.projection;
  assert.ok(
    server.server_version_number >= 160_000 &&
      server.server_version_number < 170_000,
  );
  assert.equal(server.transaction_read_only, true);
  assert.equal(server.current_user_superuser, true);
  assert.equal(server.current_user_name, server.owner_name);
  assert.equal(server.is_template, false);
  const completed = migrations.filter(
    ({ finished, rolled_back: rolledBack }) => finished && !rolledBack,
  );
  const unfinished = migrations.filter(
    ({ finished, rolled_back: rolledBack }) => !finished && !rolledBack,
  );
  assert.equal(completed.length, CANONICAL_COUNT);
  assert.equal(completed.at(-1)?.name, CANONICAL_HEAD);
  assert.equal(unfinished.length, 0);
  assert.equal(surface.tenant_lock_routine, null);
  assert.equal(surface.enrollment_command_relation, null);
}

async function migrationState(client) {
  const rows = await client.$queryRawUnsafe(`
    SELECT
      "migration_name" AS name,
      "checksum" AS checksum,
      "finished_at" AS finished_at,
      "rolled_back_at" AS rolled_back_at,
      "applied_steps_count" AS applied_steps_count
    FROM public."_prisma_migrations"
    ORDER BY "started_at", "id"
  `);
  return normalizeRows(rows);
}

async function routineSnapshot(client) {
  const rows = await client.$queryRawUnsafe(`
    WITH expected("signature") AS (
      VALUES ${valuesSql(ROUTINES.map(({ signature }) => signature))}
    )
    SELECT
      expected."signature" AS signature,
      routine.proname AS routine_name,
      routine.proowner::TEXT AS owner_oid,
      routine.prosecdef AS security_definer,
      routine.provolatile::TEXT AS volatility,
      routine.proparallel::TEXT AS parallel_safety,
      language.lanname AS language,
      pg_catalog.format_type(routine.prorettype, NULL) AS result_type,
      routine.proconfig AS configuration,
      routine.prosrc AS prosrc,
      pg_catalog.obj_description(routine.oid, 'pg_proc') AS description,
      (
        SELECT pg_catalog.count(*)::INTEGER
        FROM pg_catalog.aclexplode(
          COALESCE(
            routine.proacl,
            pg_catalog.acldefault('f', routine.proowner)
          )
        ) AS privilege
        WHERE privilege.privilege_type = 'EXECUTE'
          AND privilege.grantee <> routine.proowner
      ) AS unsafe_acl_count,
      (
        SELECT pg_catalog.count(*)::INTEGER
        FROM pg_catalog.pg_proc AS overload
        WHERE overload.pronamespace = pg_catalog.to_regnamespace('public')
          AND overload.proname = routine.proname
      ) AS overload_count
    FROM expected
    LEFT JOIN pg_catalog.pg_proc AS routine
      ON routine.oid = pg_catalog.to_regprocedure(expected."signature")
    LEFT JOIN pg_catalog.pg_language AS language ON language.oid = routine.prolang
    ORDER BY expected."signature" COLLATE "C"
  `);
  return normalizeRows(
    rows.map((row) => ({
      ...row,
      prosrc_sha256:
        row.prosrc === null
          ? null
          : digest(Buffer.from(row.prosrc.replaceAll("\r\n", "\n"), "utf8")),
    })),
  );
}

async function current182SurfaceSnapshot(client) {
  return Object.freeze({
    migrations: await migrationState(client),
    routines: await routineSnapshot(client),
  });
}

async function assertSuccessCatalog(client, current182Sha256) {
  const state = await migrationState(client);
  const completed = state.filter(
    ({ finished_at: finishedAt, rolled_back_at: rolledBackAt }) =>
      finishedAt && !rolledBackAt,
  );
  const unfinished = state.filter(
    ({ finished_at: finishedAt, rolled_back_at: rolledBackAt }) =>
      !finishedAt && !rolledBackAt,
  );
  assert.equal(completed.length, 182);
  assert.equal(completed.at(-1)?.name, CURRENT182);
  assert.equal(completed.at(-1)?.checksum, current182Sha256);
  assert.equal(unfinished.length, 0);

  const rows = await routineSnapshot(client);
  assert.equal(rows.length, ROUTINES.length);
  for (const spec of ROUTINES) {
    const row = rows.find(({ signature }) => signature === spec.signature);
    assert.ok(row, spec.signature);
    assert.equal(row.routine_name, spec.name);
    assert.equal(row.security_definer, spec.securityDefiner);
    assert.equal(row.volatility, "v");
    assert.equal(row.parallel_safety, "u");
    assert.equal(row.language, "plpgsql");
    assert.equal(row.result_type, spec.result);
    assert.deepEqual(row.configuration, ["search_path=pg_catalog"]);
    assert.equal(row.unsafe_acl_count, 0);
    assert.equal(row.overload_count, 1);
    assert.equal(row.prosrc_sha256, spec.prosrcSha256);
    if (spec.name !== "identity_mail_tenant_lock_v1") {
      assert.match(row.description, /CURRENT_182/iu);
    }
    if (spec.legacyStub) assert.equal(compactSql(row.prosrc), LEGACY_STUB_BODY);
  }
  const ownerOids = new Set(rows.map(({ owner_oid: ownerOid }) => ownerOid));
  assert.equal(ownerOids.size, 1);
}

async function insertDiagnosticReceipt(transaction, current182Sha256) {
  await transaction.$executeRawUnsafe(
    `INSERT INTO public."_prisma_migrations" (
       "id", "checksum", "migration_name", "logs", "rolled_back_at",
       "finished_at", "started_at", "applied_steps_count"
     ) VALUES ($1, $2, $3, NULL, NULL, NULL, pg_catalog.clock_timestamp(), 0)`,
    randomUUID(),
    current182Sha256,
    CURRENT182,
  );
}

async function setCurrent182DiagnosticFences(transaction, current182Sha256) {
  const [row] = await transaction.$queryRawUnsafe(
    `SELECT
       pg_catalog.set_config($1, $2, true) AS confirmation,
       pg_catalog.set_config($3, $4, true) AS candidate_sha256`,
    CURRENT182_CONFIRMATION_GUC,
    CURRENT182_CONFIRMATION,
    CURRENT182_SHA256_GUC,
    current182Sha256,
  );
  assert.deepEqual(row, {
    candidate_sha256: current182Sha256,
    confirmation: CURRENT182_CONFIRMATION,
  });
}

async function assertInjectedPostApplyRollback(client, candidate) {
  const before = await current182SurfaceSnapshot(client);
  assert.equal(before.migrations.length, 181);
  assert.equal(before.migrations.at(-1)?.name, CURRENT181);
  const statements = splitCurrent181SmokeSql(candidate.text);
  const sentinel = new Error("CURRENT182_INJECTED_POST_APPLY_ROLLBACK");
  let reachedPostcondition = false;
  await assert.rejects(
    client.$transaction(
      async (transaction) => {
        await insertDiagnosticReceipt(transaction, candidate.sha256);
        await setCurrent182DiagnosticFences(transaction, candidate.sha256);
        for (const [index, statement] of statements.slice(1, -1).entries()) {
          try {
            await transaction.$executeRawUnsafe(statement);
          } catch (error) {
            throw new Error(
              `CURRENT182 statement ${index + 2}/${statements.length} failed: ${sanitizeCurrent182SmokeError(error)}`,
              { cause: error },
            );
          }
        }
        reachedPostcondition = true;
        throw sentinel;
      },
      { isolationLevel: "Serializable", maxWait: 5_000, timeout: 240_000 },
    ),
    (error) => error === sentinel,
  );
  assert.equal(reachedPostcondition, true);
  assert.deepEqual(await current182SurfaceSnapshot(client), before);
}

async function assertLegacyStubsReject(client) {
  await expectSqlState(
    "55000",
    () =>
      client.$queryRawUnsafe(
        CURRENT182_SMOKE_PROBE_QUERIES.legacyReserve,
        "tester@example.test",
        randomUUID(),
        randomUUID(),
      ),
    /LEGACY_IDENTITY_CLAIM_WRITER_RETIRED/iu,
  );
  await expectSqlState(
    "55000",
    () =>
      client.$queryRawUnsafe(
        CURRENT182_SMOKE_PROBE_QUERIES.legacyTransition,
        "tester@example.test",
        randomUUID(),
        "INVITE",
        randomUUID(),
        1,
        "USER",
        randomUUID(),
      ),
    /LEGACY_IDENTITY_CLAIM_WRITER_RETIRED/iu,
  );
  await expectSqlState(
    "55000",
    () =>
      client.$queryRawUnsafe(
        CURRENT182_SMOKE_PROBE_QUERIES.legacyRelease,
        "tester@example.test",
        randomUUID(),
        "INVITE",
        randomUUID(),
        1,
      ),
    /LEGACY_IDENTITY_CLAIM_WRITER_RETIRED/iu,
  );
}

async function assertCanonicalEntrypointsReachTenantFence(client) {
  const tenantId = randomUUID();
  const subjectId = randomUUID();
  const nextSubjectId = randomUUID();
  const locator = randomUUID();
  const email = "tenant-first@example.test";
  const calls = [
    [
      CURRENT182_SMOKE_PROBE_QUERIES.canonicalReserve,
      [email, tenantId, subjectId],
    ],
    [
      CURRENT182_SMOKE_PROBE_QUERIES.canonicalAssert,
      [email, tenantId, subjectId, 1],
    ],
    [
      CURRENT182_SMOKE_PROBE_QUERIES.canonicalLocatorAssert,
      [locator, tenantId, subjectId, 1],
    ],
    [
      CURRENT182_SMOKE_PROBE_QUERIES.canonicalTransition,
      [email, tenantId, "INVITE", subjectId, 1, "USER", nextSubjectId],
    ],
    [
      CURRENT182_SMOKE_PROBE_QUERIES.canonicalRelease,
      [email, tenantId, "INVITE", subjectId, 1],
    ],
  ];
  for (const [query, parameters] of calls) {
    await expectSqlState(
      "25001",
      () => client.$queryRawUnsafe(query, ...parameters),
      /requires read-write SERIALIZABLE/iu,
    );
  }
}

async function safeDisconnect(client, cleanupErrors) {
  if (!client) return;
  await client.$disconnect().catch((error) => cleanupErrors.push(error));
}

export async function runCurrent182Smoke() {
  assert.equal(process.env.NODE_ENV, "test", "NODE_ENV=test is required.");
  assert.equal(
    process.env[CURRENT182_SMOKE_CONFIRMATION_ENVIRONMENT],
    CURRENT182_SMOKE_CONFIRMATION,
    `${CURRENT182_SMOKE_CONFIRMATION_ENVIRONMENT} confirmation is required.`,
  );
  const { databaseName: sourceDatabaseName, parsed: sourceUrl } =
    parseCurrent181SmokeSourceUrl(process.env.DATABASE_URL);
  const maintenanceUrl = databaseUrl(sourceUrl, "postgres");
  const successCloneName = generateCurrent182SmokeCloneName();
  const rollbackCloneName = generateCurrent182SmokeCloneName();
  assert.notEqual(successCloneName, rollbackCloneName);
  const successUrl = databaseUrl(sourceUrl, successCloneName);
  const rollbackUrl = databaseUrl(sourceUrl, rollbackCloneName);
  const plan = await readCurrent182SmokePlan();

  let predecessorArtifact = null;
  let fullArtifact = null;
  let maintenance = null;
  let source = null;
  let success = null;
  let rollback = null;
  let successCreateAttempted = false;
  let rollbackCreateAttempted = false;
  let clusterLockAcquired = false;
  let sourceBefore = null;
  let primaryError = null;
  const cleanupErrors = [];

  try {
    [predecessorArtifact, fullArtifact] = await Promise.all([
      createTemporaryPrismaArtifact(plan.predecessor.stack),
      createTemporaryPrismaArtifact(plan.stack),
    ]);
    maintenance = prismaClient(maintenanceUrl);
    await maintenance.$connect();
    await acquireClusterLock(maintenance);
    clusterLockAcquired = true;

    source = prismaClient(process.env.DATABASE_URL);
    await source.$connect();
    sourceBefore = await sourceFingerprint(source, sourceDatabaseName);
    assertCanonicalSource(sourceBefore);
    await source.$disconnect();
    source = null;

    successCreateAttempted = true;
    await createClone(maintenance, sourceDatabaseName, successCloneName);
    rollbackCreateAttempted = true;
    await createClone(maintenance, sourceDatabaseName, rollbackCloneName);

    const predecessorDeploy = runPrismaDeploy(
      predecessorArtifact.schemaPath,
      rollbackUrl,
      plan.current182.sha256,
      "rollback-predecessor",
      { includeCurrent182: false },
    );
    assertPrismaDeploySucceeded(predecessorDeploy, "rollback-predecessor");
    rollback = prismaClient(rollbackUrl);
    await rollback.$connect();
    await assertInjectedPostApplyRollback(rollback, plan.current182);
    await rollback.$disconnect();
    rollback = null;

    const successfulDeploy = runPrismaDeploy(
      fullArtifact.schemaPath,
      successUrl,
      plan.current182.sha256,
      "success-stack",
    );
    assertPrismaDeploySucceeded(successfulDeploy, "success-stack");
    success = prismaClient(successUrl);
    await success.$connect();
    await assertSuccessCatalog(success, plan.current182.sha256);
    await assertLegacyStubsReject(success);
    await assertCanonicalEntrypointsReachTenantFence(success);
    await success.$disconnect();
    success = null;

    assert.equal(
      digest(
        await readFile(
          join(
            DATABASE_PACKAGE_DIRECTORY,
            "migration-candidates",
            CURRENT182,
            "migration.sql",
          ),
        ),
      ),
      plan.current182.sha256,
      "CURRENT182 migration.sql changed during rehearsal.",
    );
  } catch (error) {
    primaryError = error;
  } finally {
    await safeDisconnect(success, cleanupErrors);
    success = null;
    await safeDisconnect(rollback, cleanupErrors);
    rollback = null;
    await safeDisconnect(source, cleanupErrors);
    source = null;

    if (maintenance && rollbackCreateAttempted) {
      await dropExactClone(maintenance, rollbackCloneName).catch((error) =>
        cleanupErrors.push(error),
      );
    }
    if (maintenance && successCreateAttempted) {
      await dropExactClone(maintenance, successCloneName).catch((error) =>
        cleanupErrors.push(error),
      );
    }
    if (sourceBefore) {
      const verificationSource = prismaClient(process.env.DATABASE_URL);
      await verificationSource
        .$connect()
        .then(() => sourceFingerprint(verificationSource, sourceDatabaseName))
        .then((sourceAfter) => assert.deepEqual(sourceAfter, sourceBefore))
        .catch((error) => cleanupErrors.push(error));
      await safeDisconnect(verificationSource, cleanupErrors);
    }
    if (maintenance && clusterLockAcquired) {
      await releaseClusterLock(maintenance).catch((error) =>
        cleanupErrors.push(error),
      );
    }
    await safeDisconnect(maintenance, cleanupErrors);
    maintenance = null;
    for (const artifact of [predecessorArtifact, fullArtifact]) {
      if (artifact) {
        await rm(assertSafeTempRoot(artifact.root), {
          force: true,
          maxRetries: 10,
          recursive: true,
          retryDelay: 100,
        }).catch((error) => cleanupErrors.push(error));
      }
    }
  }

  if (primaryError && cleanupErrors.length > 0) {
    throw new AggregateError(
      [primaryError, ...cleanupErrors],
      "CURRENT182 smoke and cleanup both failed.",
    );
  }
  if (primaryError) throw primaryError;
  if (cleanupErrors.length > 0) throw cleanupErrors[0];

  const report = Object.freeze({
    authorization: false,
    canMutateProduction: false,
    candidateMigration: CURRENT182,
    candidateSha256: plan.current182.sha256,
    catalogAclAndBodyPinsPassed: true,
    decision: "CURRENT182_DISPOSABLE_REHEARSAL_PASSED",
    rollbackCloneCleaned: true,
    rollbackZeroResidue: true,
    sourceReadOnlyZeroDiff: true,
    successCloneCleaned: true,
    tenantFenceEntrypointsPassed: true,
  });
  process.stdout.write(`${JSON.stringify(report)}\n`);
  return report;
}

export async function runCurrent182SmokeSelfTest() {
  const ipv4 = parseCurrent181SmokeSourceUrl(
    "postgresql://postgres:test@127.0.0.1:5432/leetplus_ci?schema=public",
  );
  assert.equal(ipv4.databaseName, "leetplus_ci");
  const ipv6 = parseCurrent181SmokeSourceUrl(
    "postgresql://postgres:test@[::1]:5432/leetplus_ci?schema=public",
  );
  assert.equal(ipv6.databaseName, "leetplus_ci");
  const firstClone = generateCurrent182SmokeCloneName();
  const secondClone = generateCurrent182SmokeCloneName();
  assert.match(firstClone, CURRENT182_SMOKE_CLONE_PATTERN);
  assert.match(secondClone, CURRENT182_SMOKE_CLONE_PATTERN);
  assert.notEqual(firstClone, secondClone);
  const plan = await readCurrent182SmokePlan();
  const options = buildCurrent182SmokeSessionOptions(plan.current182.sha256);
  assert.equal(options.length, 8);
  assert.equal(
    options.at(-1),
    `-c ${CURRENT182_SHA256_GUC}=${plan.current182.sha256}`,
  );
  assert.equal(plan.predecessor.entries.length, CANONICAL_COUNT);
  assert.equal(plan.predecessor.entries.at(-1)?.name, CANONICAL_HEAD);
  assert.equal(plan.predecessor.current181.name, CURRENT181);
  assert.equal(plan.current182.name, CURRENT182);
  assert.equal(plan.stack.length, 182);
  const report = Object.freeze({
    authorization: false,
    candidateMigration: CURRENT182,
    candidateSha256: plan.current182.sha256,
    decision: "SELF_TEST_PASSED",
    predecessorManifestDigest: plan.predecessorManifestDigest,
    predecessorMigrationCount: 181,
    runtimeShaSource: "MIGRATION_SQL_BYTES",
  });
  process.stdout.write(`${JSON.stringify(report)}\n`);
  return report;
}

async function main(argv) {
  const arguments_ = parseCurrent182SmokeArguments(argv);
  if (arguments_.help) {
    process.stdout.write(`${HELP}\n`);
    return;
  }
  if (arguments_.selfTest) {
    await runCurrent182SmokeSelfTest();
    return;
  }
  await runCurrent182Smoke();
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
const isMain =
  invokedPath.length > 0 && pathToFileURL(invokedPath).href === import.meta.url;
if (isMain) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${formatFailure(error)}\n`);
    process.exitCode = 1;
  });
}

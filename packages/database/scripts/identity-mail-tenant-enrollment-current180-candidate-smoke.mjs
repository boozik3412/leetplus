import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { PrismaClient } from "@prisma/client";

import {
  checkIdentityMailTenantEnrollmentPreflight,
  parseIdentityMailTenantEnrollmentPreflightConfig,
} from "./identity-mail-tenant-enrollment-preflight-database.mjs";

const SCRIPT_NAME =
  "identity-mail-tenant-enrollment-current180-candidate-smoke";
const REQUIRED_CONFIRMATION =
  "run-identity-mail-tenant-enrollment-current180-candidate-smoke";
const CONFIRMATION_ENVIRONMENT =
  "IDENTITY_MAIL_TENANT_ENROLLMENT_CURRENT180_CANDIDATE_SMOKE_CONFIRM";

const CANONICAL_MIGRATION_COUNT = 179;
const CANONICAL_MIGRATION_HEAD =
  "20260731120000_identity_mail_delivery_release_head";
const CANONICAL_MANIFEST_DIGEST =
  "3330185424ca669c18f39c2da5aa1e49f942500c0c85185c9125930e02df9431";
const CANDIDATE_MIGRATION =
  "20260801010000_identity_mail_tenant_enrollment_control_plane";
const CANDIDATE_MIGRATION_COUNT = 180;
const CANDIDATE_MIGRATION_SHA256 =
  "e84ba3c4e9e61d1d759b82a33fc22c853471fb0ef908546e755699d0d264f683";
const CANDIDATE_REHEARSAL_CONFIRMATION =
  "rehearse-dormant-identity-mail-tenant-enrollment-current180";
const CANDIDATE_REHEARSAL_CONFIRMATION_GUC =
  "leetplus.identity_mail_tenant_enrollment_current180_confirmation";
const CANDIDATE_REHEARSAL_SHA256_GUC =
  "leetplus.identity_mail_tenant_enrollment_current180_sha256";
const CANDIDATE_SESSION_OPTIONS = Object.freeze([
  "-c lock_timeout=5000",
  "-c statement_timeout=120000",
  `-c ${CANDIDATE_REHEARSAL_CONFIRMATION_GUC}=${CANDIDATE_REHEARSAL_CONFIRMATION}`,
  `-c ${CANDIDATE_REHEARSAL_SHA256_GUC}=${CANDIDATE_MIGRATION_SHA256}`,
]);

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const DATABASE_PACKAGE_DIRECTORY = resolve(SCRIPT_DIRECTORY, "..");
const PRISMA_DIRECTORY = join(DATABASE_PACKAGE_DIRECTORY, "prisma");
const CANDIDATE_DIRECTORY = join(
  DATABASE_PACKAGE_DIRECTORY,
  "migration-candidates",
  CANDIDATE_MIGRATION,
);
const CANDIDATE_SQL_PATH = join(CANDIDATE_DIRECTORY, "migration.sql");
const CANDIDATE_MANIFEST_PATH = join(CANDIDATE_DIRECTORY, "candidate.json");

const MIGRATION_PATTERN = /^\d{14}_[a-z0-9_]+$/u;
const SAFE_SOURCE_DATABASE_PATTERN = /^[a-z][a-z0-9_]{0,54}_ci$/u;
const CLONE_PREFIX = "lp_imtec_";
const CLONE_PATTERN = /^lp_imtec_[0-9a-f]{32}_ci$/u;
const TEMP_PREFIX = "leetplus-imtec-current180-";
const TEMP_SCHEMA = `datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
`;
const CLUSTER_LOCK_CLASS = 1_817_190_180;
const CLUSTER_LOCK_OBJECT = 180;
const NONEXISTENT_WORKER_ROLE = "identity_mail_worker_candidate_v1";
const NONEXISTENT_WORKER_OID = 4_000_000_000;

const CANDIDATE_RELATIONS = Object.freeze([
  "IdentityMailDeliveryTenantEnrollmentCommand",
  "IdentityMailDeliveryTenantEnrollmentEvent",
]);
const CANDIDATE_GUARD_FUNCTIONS = Object.freeze([
  "identity_mail_tenant_enrollment_command_guard_v1",
  "identity_mail_tenant_enrollment_event_guard_v1",
  "identity_mail_tenant_enrollment_registry_dormant_guard_v1",
]);
const CANDIDATE_TRIGGERS = Object.freeze([
  Object.freeze({
    functionName: "identity_mail_tenant_enrollment_command_guard_v1",
    name: "IdentityMailEnrollmentCommand_dml_guard_trigger",
    relationName: "IdentityMailDeliveryTenantEnrollmentCommand",
    triggerType: 30,
  }),
  Object.freeze({
    functionName: "identity_mail_tenant_enrollment_command_guard_v1",
    name: "IdentityMailEnrollmentCommand_truncate_guard_trigger",
    relationName: "IdentityMailDeliveryTenantEnrollmentCommand",
    triggerType: 34,
  }),
  Object.freeze({
    functionName: "identity_mail_tenant_enrollment_event_guard_v1",
    name: "IdentityMailEnrollmentEvent_dml_guard_trigger",
    relationName: "IdentityMailDeliveryTenantEnrollmentEvent",
    triggerType: 30,
  }),
  Object.freeze({
    functionName: "identity_mail_tenant_enrollment_event_guard_v1",
    name: "IdentityMailEnrollmentEvent_truncate_guard_trigger",
    relationName: "IdentityMailDeliveryTenantEnrollmentEvent",
    triggerType: 34,
  }),
  Object.freeze({
    functionName: "identity_mail_tenant_enrollment_registry_dormant_guard_v1",
    name: "IdentityMailEnrollment_00_dormant_guard_trigger",
    relationName: "IdentityMailDeliveryTenantEnrollment",
    triggerType: 30,
  }),
]);
const CANDIDATE_INDEXES = Object.freeze([
  "identity_mail_tenant_enrollment_active_command_idx",
  "identity_mail_tenant_enrollment_command_accepted_idx",
  "identity_mail_tenant_enrollment_command_digest_key",
  "identity_mail_tenant_enrollment_command_drain_projection_key",
  "identity_mail_tenant_enrollment_command_marker_idx",
  "identity_mail_tenant_enrollment_command_request_uidx",
  "identity_mail_tenant_enrollment_command_rollback_idx",
  "identity_mail_tenant_enrollment_command_tenant_id_key",
  "identity_mail_tenant_enrollment_event_command_sequence_uidx",
  "identity_mail_tenant_enrollment_event_previous_uidx",
  "identity_mail_tenant_enrollment_event_state_revision_uidx",
  "identity_mail_tenant_enrollment_event_tenant_digest_key",
  "identity_mail_tenant_enrollment_event_terminal_projection_key",
  "identity_mail_tenant_enrollment_event_timeline_idx",
  "identity_mail_tenant_enrollment_worker_state_idx",
]);
const ENROLLMENT_COLUMNS = Object.freeze([
  Object.freeze({ name: "activeCommandId", type: "text", nullable: true }),
  Object.freeze({
    name: "currentConfigurationDigest",
    type: "character(64)",
    nullable: false,
  }),
  Object.freeze({ name: "lastEventDigest", type: "character(64)", nullable: false }),
  Object.freeze({ name: "state", type: "character varying(16)", nullable: false }),
  Object.freeze({ name: "stateChangedAt", type: "timestamp(3) with time zone", nullable: false }),
  Object.freeze({ name: "stateRevision", type: "bigint", nullable: false }),
]);

const HELP = `
${SCRIPT_NAME}

Rehearses the non-canonical CURRENT_180 identity-mail tenant-enrollment
candidate on PostgreSQL 16. The source database is only read in READ ONLY,
REPEATABLE READ transactions. All DDL runs on exact random disposable clones.

Usage:
  node scripts/${SCRIPT_NAME}.mjs
  node scripts/${SCRIPT_NAME}.mjs --self-test
  node scripts/${SCRIPT_NAME}.mjs --help

Required for the real smoke:
  NODE_ENV=test
  DATABASE_URL=<numeric-loopback PostgreSQL 16 dedicated *_ci CURRENT_179>
  ${CONFIRMATION_ENVIRONMENT}=${REQUIRED_CONFIRMATION}

The source connection must own the source database and be a test superuser.
The smoke creates two random *_ci clones and a temporary Prisma artifact:
  - a clean CURRENT_179 -> candidate CURRENT_180 acceptance clone;
  - a rejection clone with one legacy DISABLED enrollment.

The rejection path resolves the failed Prisma receipt as rolled back and proves
zero candidate DDL or business-state residue. No apply function, SMTP, invite,
production marker, user or external provider is created or called.
`.trim();

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function sanitize(error) {
  return String(error instanceof Error ? error.message : error)
    .replace(/postgres(?:ql)?:\/\/[^\s")]+/giu, "<redacted-postgresql-url>")
    .replace(/[A-Za-z0-9_-]{86,}/gu, "<redacted-secret>");
}

function formatFailure(error) {
  if (!(error instanceof AggregateError)) {
    return sanitize(error instanceof Error && error.stack ? error.stack : error);
  }
  return [
    sanitize(error),
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

async function expectSqlState(expected, operation, pattern = null) {
  await assert.rejects(operation, (error) => {
    assert.equal(extractSqlState(error), expected, sanitize(error));
    if (pattern) assert.match(sanitize(error), pattern);
    return true;
  });
}

function parseArguments(argv) {
  if (!Array.isArray(argv)) throw new Error("CLI_ARGUMENTS_INVALID");
  if (argv.length === 0) return { help: false, selfTest: false };
  if (argv.length === 1 && argv[0] === "--help") {
    return { help: true, selfTest: false };
  }
  if (argv.length === 1 && argv[0] === "--self-test") {
    return { help: false, selfTest: true };
  }
  throw new Error("Use --help, --self-test, or no arguments.");
}

function parseSafeSourceDatabaseUrl(raw) {
  assert.equal(typeof raw, "string", "DATABASE_URL is required.");
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    assert.fail("DATABASE_URL must be a valid URL.");
  }
  assert.ok(
    parsed.protocol === "postgresql:" || parsed.protocol === "postgres:",
    "Smoke requires PostgreSQL.",
  );
  assert.ok(
    parsed.hostname === "127.0.0.1" || parsed.hostname === "[::1]",
    "Smoke requires exact numeric-loopback PostgreSQL.",
  );
  assert.equal(parsed.hash, "", "DATABASE_URL fragments are forbidden.");

  const authorityStart = raw.indexOf("//") + 2;
  const authorityEnd = raw.indexOf("/", authorityStart);
  const rawAuthority = raw.slice(
    authorityStart,
    authorityEnd === -1 ? raw.length : authorityEnd,
  );
  const rawEndpoint = rawAuthority.slice(rawAuthority.lastIndexOf("@") + 1);
  const normalizedEndpoint = parsed.port
    ? `${parsed.hostname}:${parsed.port}`
    : parsed.hostname;
  assert.equal(
    rawEndpoint,
    normalizedEndpoint,
    "DATABASE_URL endpoint must be canonical.",
  );
  assert.deepEqual(
    [...parsed.searchParams.entries()],
    [["schema", "public"]],
    "DATABASE_URL must contain only schema=public.",
  );
  assert.ok(parsed.username, "DATABASE_URL username is required.");
  assert.doesNotMatch(
    decodeURIComponent(parsed.username),
    /[\u0000-\u001f\u007f]/u,
  );
  const databaseName = decodeURIComponent(
    parsed.pathname.replace(/^\/+|\/+$/gu, ""),
  );
  assert.match(
    databaseName,
    SAFE_SOURCE_DATABASE_PATTERN,
    "Smoke requires a dedicated *_ci source database.",
  );
  assert.ok(
    !["postgres", "template0", "template1"].includes(databaseName),
    "System databases are forbidden.",
  );
  return Object.freeze({ databaseName, parsed });
}

function databaseUrl(source, databaseName) {
  assert.match(databaseName, /^[a-z][a-z0-9_]{0,62}$/u);
  const target = new URL(source);
  target.pathname = `/${databaseName}`;
  target.search = "?schema=public";
  target.hash = "";
  return target.toString();
}

function prismaClient(url) {
  return new PrismaClient({ datasourceUrl: url, log: [] });
}

function generatedCloneName() {
  const name = `${CLONE_PREFIX}${randomBytes(16).toString("hex")}_ci`;
  assert.match(name, CLONE_PATTERN);
  return name;
}

function assertSafeTempRoot(path) {
  const resolvedPath = resolve(path);
  const resolvedTemp = resolve(tmpdir());
  assert.ok(
    resolvedPath.startsWith(`${resolvedTemp}${sep}`),
    "Temporary artifact escaped the OS temp directory.",
  );
  assert.ok(
    basename(resolvedPath).startsWith(TEMP_PREFIX),
    "Temporary artifact prefix is invalid.",
  );
  return resolvedPath;
}

function splitSqlStatements(sql) {
  assert.equal(typeof sql, "string");
  const statements = [];
  let start = 0;
  let index = 0;
  let state = "plain";
  let dollarTag = null;
  let blockCommentDepth = 0;

  while (index < sql.length) {
    const character = sql[index];
    const next = sql[index + 1];
    if (state === "line-comment") {
      if (character === "\n") state = "plain";
      index += 1;
      continue;
    }
    if (state === "block-comment") {
      if (character === "/" && next === "*") {
        blockCommentDepth += 1;
        index += 2;
      } else if (character === "*" && next === "/") {
        blockCommentDepth -= 1;
        index += 2;
        if (blockCommentDepth === 0) state = "plain";
      } else {
        index += 1;
      }
      continue;
    }
    if (state === "single-quote") {
      if (character === "'" && next === "'") {
        index += 2;
      } else {
        if (character === "'") state = "plain";
        index += 1;
      }
      continue;
    }
    if (state === "double-quote") {
      if (character === '"' && next === '"') {
        index += 2;
      } else {
        if (character === '"') state = "plain";
        index += 1;
      }
      continue;
    }
    if (state === "dollar-quote") {
      if (sql.startsWith(dollarTag, index)) {
        index += dollarTag.length;
        state = "plain";
        dollarTag = null;
      } else {
        index += 1;
      }
      continue;
    }

    if (character === "-" && next === "-") {
      state = "line-comment";
      index += 2;
    } else if (character === "/" && next === "*") {
      state = "block-comment";
      blockCommentDepth = 1;
      index += 2;
    } else if (character === "'") {
      state = "single-quote";
      index += 1;
    } else if (character === '"') {
      state = "double-quote";
      index += 1;
    } else if (character === "$") {
      const tag = sql.slice(index).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/u)?.[0];
      if (tag) {
        state = "dollar-quote";
        dollarTag = tag;
        index += tag.length;
      } else {
        index += 1;
      }
    } else if (character === ";") {
      const statement = sql.slice(start, index).trim();
      if (statement) statements.push(statement);
      start = index + 1;
      index += 1;
    } else {
      index += 1;
    }
  }
  assert.equal(state, "plain", `Candidate SQL ended inside ${state}.`);
  const tail = sql.slice(start).trim();
  if (tail) statements.push(tail);
  return statements;
}

async function readCanonicalAndCandidatePlan() {
  const migrationDirectory = join(PRISMA_DIRECTORY, "migrations");
  const names = (await readdir(migrationDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.equal(names.length, CANONICAL_MIGRATION_COUNT);
  assert.equal(names.at(-1), CANONICAL_MIGRATION_HEAD);
  assert.equal(names.includes(CANDIDATE_MIGRATION), false);
  assert.ok(names.every((name) => MIGRATION_PATTERN.test(name)));

  const entries = [];
  for (const name of names) {
    const path = join(migrationDirectory, name, "migration.sql");
    const raw = await readFile(path);
    const text = raw.toString("utf8").replace(/\r\n/gu, "\n");
    assert.doesNotMatch(text, /\r/u, `${name} has noncanonical line endings.`);
    const content = Buffer.from(text, "utf8");
    entries.push(Object.freeze({ content, name, sha256: digest(content) }));
  }
  const manifest = Buffer.from(
    `${entries.map(({ name, sha256 }) => `${name} ${sha256}`).join("\n")}\n`,
    "utf8",
  );
  assert.equal(digest(manifest), CANONICAL_MANIFEST_DIGEST);

  const candidateRaw = await readFile(CANDIDATE_SQL_PATH);
  const candidateText = candidateRaw.toString("utf8");
  const candidateSha256 = digest(candidateRaw);
  const candidateManifest = JSON.parse(
    await readFile(CANDIDATE_MANIFEST_PATH, "utf8"),
  );
  assert.deepEqual(candidateManifest, {
    schemaVersion: 1,
    contract: "IDENTITY_MAIL_TENANT_ENROLLMENT_FOUNDATION_CANDIDATE_V1",
    candidate: CANDIDATE_MIGRATION,
    ordinal: CANDIDATE_MIGRATION_COUNT,
    predecessor: {
      count: CANONICAL_MIGRATION_COUNT,
      head: CANONICAL_MIGRATION_HEAD,
      manifestDigest: CANONICAL_MANIFEST_DIGEST,
      headChecksum:
        "c394060fbf979c567403976c8e906dc67b3bd840aea9fa9550e1d939d04af519",
    },
    migrationSqlSha256: CANDIDATE_MIGRATION_SHA256,
    authorization: false,
    canMutate: false,
    status: "DORMANT_SCHEMA_ONLY",
  });
  assert.equal(candidateSha256, CANDIDATE_MIGRATION_SHA256);
  assert.equal(candidateManifest.migrationSqlSha256, candidateSha256);
  assert.equal(candidateRaw.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), false);
  assert.doesNotMatch(candidateText, /\u0000|\r/u);
  assert.match(candidateText, /^BEGIN;\n/u);
  assert.match(candidateText, /\nCOMMIT;\n?$/u);
  assert.match(
    candidateText,
    /completed_migration_count IS DISTINCT FROM 179/u,
  );
  assert.match(candidateText, new RegExp(CANONICAL_MIGRATION_HEAD, "u"));
  assert.match(candidateText, new RegExp(CANONICAL_MANIFEST_DIGEST, "u"));
  assert.match(
    candidateText,
    /CREATE TABLE public\."IdentityMailDeliveryTenantEnrollmentCommand"/u,
  );
  assert.match(
    candidateText,
    /CREATE TABLE public\."IdentityMailDeliveryTenantEnrollmentEvent"/u,
  );
  assert.match(
    candidateText,
    /leetplus\.identity_mail_tenant_enrollment_current180_confirmation/u,
  );
  assert.match(
    candidateText,
    /leetplus\.identity_mail_tenant_enrollment_current180_sha256/u,
  );
  assert.match(candidateText, /\^lp_imtec_\[0-9a-f\]\{32\}_ci\$/u);
  assert.match(candidateText, new RegExp(CANDIDATE_REHEARSAL_CONFIRMATION, "u"));
  assert.doesNotMatch(
    candidateText,
    /CREATE(?:\s+OR\s+REPLACE)?\s+FUNCTION[\s\S]{0,180}identity_mail_tenant_enrollment_(?:apply|accept|resume|finalize|rollback)/iu,
  );
  assert.doesNotMatch(candidateText, /\bGRANT\b/iu);

  return Object.freeze({
    candidate: Object.freeze({
      content: candidateRaw,
      name: CANDIDATE_MIGRATION,
      sha256: candidateSha256,
      text: candidateText,
    }),
    entries: Object.freeze(entries),
  });
}

async function createTemporaryPrismaArtifact(plan) {
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
  for (const entry of [...plan.entries, plan.candidate]) {
    const target = join(migrations, entry.name);
    await mkdir(target);
    await writeFile(join(target, "migration.sql"), entry.content, {
      flag: "wx",
    });
  }
  return Object.freeze({
    root,
    schemaPath: join(root, "schema.prisma"),
  });
}

function fencedCandidateDatabaseUrl(targetDatabaseUrl) {
  const target = new URL(targetDatabaseUrl);
  const databaseName = decodeURIComponent(
    target.pathname.replace(/^\/+|\/+$/gu, ""),
  );
  assert.match(databaseName, CLONE_PATTERN);
  target.searchParams.set(
    "options",
    CANDIDATE_SESSION_OPTIONS.join(" "),
  );
  return target.toString();
}

function runPrisma(schemaPath, targetDatabaseUrl, arguments_, stage) {
  assert.match(stage, /^[a-z0-9_-]{1,80}$/u);
  const require = createRequire(import.meta.url);
  const prismaCliPath = require.resolve("prisma/build/index.js");
  const fencedTargetUrl = fencedCandidateDatabaseUrl(targetDatabaseUrl);
  return spawnSync(
    process.execPath,
    [prismaCliPath, "migrate", ...arguments_, "--schema", schemaPath],
    {
      cwd: DATABASE_PACKAGE_DIRECTORY,
      encoding: "utf8",
      env: {
        ...process.env,
        DATABASE_URL: fencedTargetUrl,
        NODE_ENV: "test",
        NO_COLOR: "1",
        PGOPTIONS: CANDIDATE_SESSION_OPTIONS.join(" "),
        PRISMA_HIDE_UPDATE_MESSAGE: "true",
      },
      maxBuffer: 4 * 1024 * 1024,
      timeout: 180_000,
    },
  );
}

function assertPrismaSuccess(result, stage) {
  assert.equal(result.error, undefined, `${stage}: ${sanitize(result.error)}`);
  assert.equal(
    result.status,
    0,
    `${stage}: ${sanitize(result.stderr || result.stdout)}`,
  );
}

function assertPrismaFailure(result, stage) {
  assert.equal(result.error, undefined, `${stage}: ${sanitize(result.error)}`);
  assert.notEqual(result.status, 0, `${stage} unexpectedly succeeded.`);
  assert.match(
    `${result.stderr}\n${result.stdout}`,
    /requires an empty enrollment registry and zero CLAIMED mail outbox rows|current transaction is aborted/iu,
  );
}

async function acquireClusterLock(maintenance) {
  const [row] = await maintenance.$queryRawUnsafe(
    `SELECT pg_catalog.pg_try_advisory_lock($1::INTEGER, $2::INTEGER) AS acquired`,
    CLUSTER_LOCK_CLASS,
    CLUSTER_LOCK_OBJECT,
  );
  assert.equal(row?.acquired, true, "Another candidate smoke is running.");
}

async function releaseClusterLock(maintenance) {
  const [row] = await maintenance.$queryRawUnsafe(
    `SELECT pg_catalog.pg_advisory_unlock($1::INTEGER, $2::INTEGER) AS released`,
    CLUSTER_LOCK_CLASS,
    CLUSTER_LOCK_OBJECT,
  );
  assert.equal(row?.released, true);
}

async function createClone(maintenance, sourceDatabaseName, cloneDatabaseName) {
  assert.match(sourceDatabaseName, SAFE_SOURCE_DATABASE_PATTERN);
  assert.match(cloneDatabaseName, CLONE_PATTERN);
  await maintenance.$executeRawUnsafe(
    `CREATE DATABASE ${quoteIdentifier(cloneDatabaseName)} TEMPLATE ${quoteIdentifier(sourceDatabaseName)}`,
  );
}

async function dropExactClone(maintenance, cloneDatabaseName) {
  assert.match(cloneDatabaseName, CLONE_PATTERN);
  const rows = await maintenance.$queryRawUnsafe(
    `SELECT
       database.datname AS database_name,
       database.datistemplate AS is_template,
       owner.rolname AS owner_name,
       owner.oid = (SELECT usesysid FROM pg_catalog.pg_user WHERE usename = CURRENT_USER) AS owned_by_session
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

async function sourceFingerprint(prisma, expectedDatabaseName) {
  return prisma.$transaction(
    async (transaction) => {
      await transaction.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      const [server] = await transaction.$queryRawUnsafe(`
        SELECT
          pg_catalog.current_database()::TEXT AS database_name,
          CURRENT_USER::TEXT AS current_user_name,
          pg_catalog.current_setting('server_version_num')::INTEGER AS server_version_number,
          pg_catalog.current_setting('transaction_isolation')::TEXT AS transaction_isolation,
          pg_catalog.current_setting('transaction_read_only')::BOOLEAN AS transaction_read_only,
          database.oid::BIGINT AS database_oid,
          database.datistemplate AS is_template,
          owner.rolname::TEXT AS owner_name,
          role.rolsuper AS current_user_superuser
        FROM pg_catalog.pg_database AS database
        INNER JOIN pg_catalog.pg_roles AS owner ON owner.oid = database.datdba
        INNER JOIN pg_catalog.pg_roles AS role ON role.rolname = CURRENT_USER
        WHERE database.datname = pg_catalog.current_database()
      `);
      assert.ok(server);
      assert.equal(server.database_name, expectedDatabaseName);
      assert.equal(server.transaction_isolation, "repeatable read");
      assert.equal(server.transaction_read_only, true);

      const migrations = await transaction.$queryRawUnsafe(`
        SELECT
          "migration_name" AS name,
          "checksum" AS checksum,
          "finished_at" IS NOT NULL AS finished,
          "rolled_back_at" IS NOT NULL AS rolled_back
        FROM public."_prisma_migrations"
        ORDER BY "migration_name", "started_at", "id"
      `);
      const [business] = await transaction.$queryRawUnsafe(`
        SELECT
          (SELECT pg_catalog.count(*) FROM public."Tenant")::TEXT AS tenant_count,
          (SELECT pg_catalog.count(*) FROM public."IdentityMailDeliveryTenantEnrollment")::TEXT AS enrollment_count,
          (SELECT pg_catalog.count(*) FROM public."IdentityMailOutbox")::TEXT AS outbox_count,
          (
            SELECT pg_catalog.count(*)
            FROM public."IdentityMailOutbox" AS outbox
            WHERE outbox."status" = 'CLAIMED'::public."IdentityMailOutboxStatus"
          )::TEXT AS claimed_count,
          pg_catalog.to_regclass(
            'public."IdentityMailDeliveryTenantEnrollmentCommand"'
          )::TEXT AS command_relation,
          pg_catalog.to_regclass(
            'public."IdentityMailDeliveryTenantEnrollmentEvent"'
          )::TEXT AS event_relation
      `);
      const projection = {
        business,
        migrations: migrations.map((row) => ({
          checksum: row.checksum,
          finished: row.finished,
          name: row.name,
          rolledBack: row.rolled_back,
        })),
        server: {
          currentUserName: server.current_user_name,
          currentUserSuperuser: server.current_user_superuser,
          databaseName: server.database_name,
          databaseOid: String(server.database_oid),
          isTemplate: server.is_template,
          ownerName: server.owner_name,
          serverVersionNumber: server.server_version_number,
        },
      };
      return Object.freeze({
        digest: digest(Buffer.from(JSON.stringify(projection), "utf8")),
        projection,
      });
    },
    {
      isolationLevel: "RepeatableRead",
      maxWait: 5_000,
      timeout: 30_000,
    },
  );
}

function assertCanonicalSource(fingerprint) {
  const { business, migrations, server } = fingerprint.projection;
  assert.ok(
    server.serverVersionNumber >= 160_000 &&
      server.serverVersionNumber < 170_000,
    "Smoke requires PostgreSQL 16.",
  );
  assert.equal(server.currentUserSuperuser, true);
  assert.equal(server.currentUserName, server.ownerName);
  assert.equal(server.isTemplate, false);
  const completed = migrations.filter(
    ({ finished, rolledBack }) => finished && !rolledBack,
  );
  const unfinished = migrations.filter(
    ({ finished, rolledBack }) => !finished && !rolledBack,
  );
  assert.equal(completed.length, CANONICAL_MIGRATION_COUNT);
  assert.equal(completed.at(-1)?.name, CANONICAL_MIGRATION_HEAD);
  assert.equal(unfinished.length, 0);
  assert.equal(business.enrollment_count, "0");
  assert.equal(business.claimed_count, "0");
  assert.equal(business.command_relation, null);
  assert.equal(business.event_relation, null);
}

async function migrationState(prisma) {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT
      "id" AS id,
      "migration_name" AS name,
      "checksum" AS checksum,
      "finished_at" AS finished_at,
      "rolled_back_at" AS rolled_back_at,
      "logs" AS logs,
      "logs" IS NOT NULL AS has_logs,
      "applied_steps_count" AS applied_steps_count
    FROM public."_prisma_migrations"
    ORDER BY "started_at", "id"
  `);
  return rows.map((row) => ({
    appliedStepsCount: Number(row.applied_steps_count),
    checksum: row.checksum,
    finishedAt: row.finished_at,
    hasLogs: row.has_logs,
    id: row.id,
    logs: row.logs,
    name: row.name,
    rolledBackAt: row.rolled_back_at,
  }));
}

async function seedLegacyDisabledEnrollment(prisma) {
  const tenantId = randomUUID();
  const suffix = randomBytes(8).toString("hex");
  const createdAt = new Date();
  const disabledAt = new Date(createdAt.valueOf() + 1_000);
  await prisma.$transaction(async (transaction) => {
    await transaction.$executeRawUnsafe(
      `INSERT INTO public."Tenant" (
         "id", "name", "slug", "status", "customerStage",
         "onboardingStatus", "entitlementProfileRevision",
         "executionRevision", "createdAt", "updatedAt"
       ) VALUES (
         $1, $2, $3, 'SUSPENDED'::public."TenantLifecycleStatus",
         'BETA'::public."TenantCustomerStage",
         'PROVISIONING'::public."TenantOnboardingStatus",
         0, 0, $4, $4
       )`,
      tenantId,
      `candidate-reject-${suffix}`,
      `candidate-reject-${suffix}`,
      createdAt,
    );
    await transaction.$executeRawUnsafe(
      `INSERT INTO public."IdentityMailDeliveryTenantEnrollment" (
         "tenantId", "workerRoleName", "workerRoleOid", "policyRevision",
         "enabled", "maxAttempts", "leaseSeconds", "acknowledgeSeconds",
         "baseRetrySeconds", "maxRetrySeconds", "providerAuthorityDigest",
         "enabledAt", "disabledAt", "createdAt", "updatedAt"
       ) VALUES (
         $1, $2, $3, 1, false, 5, 300, 120, 30, 3600, $4, $5, $6, $5, $6
       )`,
      tenantId,
      NONEXISTENT_WORKER_ROLE,
      BigInt(NONEXISTENT_WORKER_OID),
      "b".repeat(64),
      createdAt,
      disabledAt,
    );
  });
  return Object.freeze({ tenantId });
}

async function legacyBusinessFingerprint(prisma, tenantId) {
  const tenantRows = await prisma.$queryRawUnsafe(
    `SELECT
       "id", "name", "slug", "status"::TEXT AS status,
       "customerStage"::TEXT AS customer_stage,
       "onboardingStatus"::TEXT AS onboarding_status,
       "entitlementProfileRevision" AS entitlement_revision,
       "executionRevision" AS execution_revision,
       "createdAt"::TEXT AS created_at,
       "updatedAt"::TEXT AS updated_at
     FROM public."Tenant"
     WHERE "id" = $1`,
    tenantId,
  );
  const enrollmentRows = await prisma.$queryRawUnsafe(
    `SELECT
       "tenantId" AS tenant_id,
       "workerRoleName"::TEXT AS worker_role_name,
       "workerRoleOid"::TEXT AS worker_role_oid,
       "policyRevision" AS policy_revision,
       "enabled", "maxAttempts" AS max_attempts,
       "leaseSeconds" AS lease_seconds,
       "acknowledgeSeconds" AS acknowledge_seconds,
       "baseRetrySeconds" AS base_retry_seconds,
       "maxRetrySeconds" AS max_retry_seconds,
       "providerAuthorityDigest" AS provider_authority_digest,
       "enabledAt"::TEXT AS enabled_at,
       "disabledAt"::TEXT AS disabled_at,
       "createdAt"::TEXT AS created_at,
       "updatedAt"::TEXT AS updated_at
     FROM public."IdentityMailDeliveryTenantEnrollment"
     WHERE "tenantId" = $1`,
    tenantId,
  );
  const [outbox] = await prisma.$queryRawUnsafe(
    `SELECT pg_catalog.count(*)::INTEGER AS count
     FROM public."IdentityMailOutbox"
     WHERE "tenantId" = $1`,
    tenantId,
  );
  const projection = {
    enrollmentRows,
    outboxCount: Number(outbox?.count ?? -1),
    tenantRows,
  };
  return Object.freeze({
    digest: digest(Buffer.from(JSON.stringify(projection), "utf8")),
    projection,
  });
}

async function candidateCatalogResidue(prisma) {
  const [row] = await prisma.$queryRawUnsafe(`
    SELECT
      pg_catalog.to_regclass(
        'public."IdentityMailDeliveryTenantEnrollmentCommand"'
      ) IS NOT NULL AS command_exists,
      pg_catalog.to_regclass(
        'public."IdentityMailDeliveryTenantEnrollmentEvent"'
      ) IS NOT NULL AS event_exists,
      pg_catalog.to_regprocedure(
        'public."identity_mail_tenant_enrollment_command_guard_v1"()'
      ) IS NOT NULL AS command_guard_exists,
      pg_catalog.to_regprocedure(
        'public."identity_mail_tenant_enrollment_event_guard_v1"()'
      ) IS NOT NULL AS event_guard_exists,
      pg_catalog.to_regprocedure(
        'public."identity_mail_tenant_enrollment_registry_dormant_guard_v1"()'
      ) IS NOT NULL AS registry_guard_exists,
      EXISTS (
        SELECT 1
        FROM pg_catalog.pg_attribute AS attribute
        WHERE attribute.attrelid = pg_catalog.to_regclass(
          'public."IdentityMailDeliveryTenantEnrollment"'
        )
          AND attribute.attname IN (
            'state', 'stateRevision', 'activeCommandId',
            'lastEventDigest', 'currentConfigurationDigest', 'stateChangedAt'
          )
          AND attribute.attnum > 0
          AND attribute.attisdropped = false
      ) AS enrollment_columns_exist,
      EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint AS target_constraint
        WHERE target_constraint.conname =
          'shared_beta_runtime_marker_enrollment_binding_key'
      ) AS marker_constraint_exists
  `);
  return row;
}

async function assertRejectedCandidateState(
  prisma,
  candidateSha256,
  fixture,
  beforeBusiness,
  { resolved },
) {
  const state = await migrationState(prisma);
  const candidateRows = state.filter(({ name }) => name === CANDIDATE_MIGRATION);
  assert.equal(candidateRows.length, 1);
  assert.equal(candidateRows[0].checksum, candidateSha256);
  assert.equal(candidateRows[0].finishedAt, null);
  assert.equal(candidateRows[0].appliedStepsCount, 0);
  // Prisma records the failed migration row, but the candidate's explicit
  // transaction makes PostgreSQL surface the trailing 25P02 and Prisma 6
  // leaves `logs` null. The exact prerequisite is therefore exercised as a
  // standalone statement immediately before this deploy.
  assert.equal(candidateRows[0].hasLogs, false);
  assert.equal(candidateRows[0].logs, null);
  if (resolved) {
    assert.ok(candidateRows[0].rolledBackAt instanceof Date);
  } else {
    assert.equal(candidateRows[0].rolledBackAt, null);
  }
  const completed = state.filter(
    ({ finishedAt, rolledBackAt }) => finishedAt && !rolledBackAt,
  );
  assert.equal(completed.length, CANONICAL_MIGRATION_COUNT);
  assert.equal(completed.at(-1)?.name, CANONICAL_MIGRATION_HEAD);
  assert.deepEqual(await candidateCatalogResidue(prisma), {
    command_exists: false,
    command_guard_exists: false,
    enrollment_columns_exist: false,
    event_exists: false,
    event_guard_exists: false,
    marker_constraint_exists: false,
    registry_guard_exists: false,
  });
  const afterBusiness = await legacyBusinessFingerprint(prisma, fixture.tenantId);
  assert.deepEqual(afterBusiness, beforeBusiness);
}

async function insertDiagnosticReceipt(
  transaction,
  {
    appliedStepsCount = 0,
    checksum = CANDIDATE_MIGRATION_SHA256,
  } = {},
) {
  await transaction.$executeRawUnsafe(
    `INSERT INTO public."_prisma_migrations" (
       "id", "checksum", "migration_name", "logs", "rolled_back_at",
       "finished_at", "started_at", "applied_steps_count"
     ) VALUES ($1, $2, $3, NULL, NULL, NULL, pg_catalog.clock_timestamp(), $4)`,
    randomUUID(),
    checksum,
    CANDIDATE_MIGRATION,
    appliedStepsCount,
  );
}

async function setDiagnosticFence(
  transaction,
  {
    candidateSha256 = CANDIDATE_MIGRATION_SHA256,
    confirmation = CANDIDATE_REHEARSAL_CONFIRMATION,
  } = {},
) {
  const [settings] = await transaction.$queryRawUnsafe(
    `SELECT
       pg_catalog.set_config($1, $2, true) AS confirmation,
       pg_catalog.set_config($3, $4, true) AS candidate_sha256`,
    CANDIDATE_REHEARSAL_CONFIRMATION_GUC,
    confirmation,
    CANDIDATE_REHEARSAL_SHA256_GUC,
    candidateSha256,
  );
  assert.deepEqual(settings, {
    candidate_sha256: candidateSha256,
    confirmation,
  });
}

async function seedDiagnosticReceiptAndFence(transaction, candidateSha256) {
  assert.equal(candidateSha256, CANDIDATE_MIGRATION_SHA256);
  await insertDiagnosticReceipt(transaction, { checksum: candidateSha256 });
  await setDiagnosticFence(transaction, { candidateSha256 });
}

async function expectPrerequisiteFailure(
  prisma,
  prerequisiteSql,
  setup,
  messagePattern,
) {
  await assert.rejects(
    prisma.$transaction(
      async (transaction) => {
        await setup(transaction);
        await transaction.$executeRawUnsafe(prerequisiteSql);
      },
      { isolationLevel: "Serializable", maxWait: 5_000, timeout: 30_000 },
    ),
    (error) => {
      assert.equal(extractSqlState(error), "55000", formatFailure(error));
      assert.match(sanitize(error), messagePattern);
      return true;
    },
  );
}

async function assertCandidateExecutionFence(
  prisma,
  candidateText,
  candidateSha256,
) {
  const prerequisite = candidateText.match(
    /DO \$prerequisite\$[\s\S]*?\$prerequisite\$;/u,
  );
  assert.ok(prerequisite, "Candidate prerequisite block is missing.");
  const boundaryPattern =
    /restricted to the confirmed disposable rehearsal boundary/iu;
  const receiptPattern = /requires one exact unfinished Prisma rehearsal receipt/iu;
  const cases = [
    {
      expected: boundaryPattern,
      setup: (transaction) =>
        insertDiagnosticReceipt(transaction, { checksum: candidateSha256 }),
    },
    {
      expected: boundaryPattern,
      setup: async (transaction) => {
        await insertDiagnosticReceipt(transaction, { checksum: candidateSha256 });
        await setDiagnosticFence(transaction, {
          candidateSha256,
          confirmation: "rehearse-untrusted-current180",
        });
      },
    },
    {
      expected: receiptPattern,
      setup: (transaction) =>
        setDiagnosticFence(transaction, { candidateSha256 }),
    },
    {
      expected: receiptPattern,
      setup: async (transaction) => {
        await insertDiagnosticReceipt(transaction, { checksum: "0".repeat(64) });
        await setDiagnosticFence(transaction, { candidateSha256 });
      },
    },
    {
      expected: receiptPattern,
      setup: async (transaction) => {
        await insertDiagnosticReceipt(transaction, { checksum: candidateSha256 });
        await setDiagnosticFence(transaction, {
          candidateSha256: "f".repeat(64),
        });
      },
    },
    {
      expected: receiptPattern,
      setup: async (transaction) => {
        await insertDiagnosticReceipt(transaction, {
          appliedStepsCount: 1,
          checksum: candidateSha256,
        });
        await setDiagnosticFence(transaction, { candidateSha256 });
      },
    },
  ];
  for (const testCase of cases) {
    await expectPrerequisiteFailure(
      prisma,
      prerequisite[0],
      testCase.setup,
      testCase.expected,
    );
  }
  assert.equal(
    (await migrationState(prisma)).filter(
      ({ name }) => name === CANDIDATE_MIGRATION,
    ).length,
    0,
  );
  assert.deepEqual(await candidateCatalogResidue(prisma), {
    command_exists: false,
    command_guard_exists: false,
    enrollment_columns_exist: false,
    event_exists: false,
    event_guard_exists: false,
    marker_constraint_exists: false,
    registry_guard_exists: false,
  });
}

async function assertLegacyFixtureHitsExactPrerequisite(
  prisma,
  candidateText,
  candidateSha256,
  fixture,
  beforeBusiness,
) {
  const prerequisite = candidateText.match(
    /DO \$prerequisite\$[\s\S]*?\$prerequisite\$;/u,
  );
  assert.ok(prerequisite, "Candidate prerequisite block is missing.");
  await expectPrerequisiteFailure(
    prisma,
    prerequisite[0],
    (transaction) =>
      seedDiagnosticReceiptAndFence(transaction, candidateSha256),
    /requires an empty enrollment registry and zero CLAIMED mail outbox rows/iu,
  );
  assert.deepEqual(
    await legacyBusinessFingerprint(prisma, fixture.tenantId),
    beforeBusiness,
  );
  assert.deepEqual(await candidateCatalogResidue(prisma), {
    command_exists: false,
    command_guard_exists: false,
    enrollment_columns_exist: false,
    event_exists: false,
    event_guard_exists: false,
    marker_constraint_exists: false,
    registry_guard_exists: false,
  });
}

async function diagnoseCandidateStatementsInRollback(
  prisma,
  candidateText,
  candidateSha256,
) {
  const statements = splitSqlStatements(candidateText);
  assert.equal(statements[0], "BEGIN");
  assert.equal(statements.at(-1), "COMMIT");
  const executable = statements.slice(1, -1);
  const rollbackProbe = new Error("CANDIDATE_DIAGNOSTIC_ROLLBACK");
  let completed = false;
  await assert.rejects(
    prisma.$transaction(
      async (transaction) => {
        await seedDiagnosticReceiptAndFence(transaction, candidateSha256);
        for (const [index, statement] of executable.entries()) {
          try {
            await transaction.$executeRawUnsafe(statement);
          } catch (error) {
            throw new Error(
              `Candidate statement ${index + 2}/${statements.length} failed: ${sanitize(error)}`,
              { cause: error },
            );
          }
        }
        completed = true;
        throw rollbackProbe;
      },
      { isolationLevel: "Serializable", maxWait: 5_000, timeout: 180_000 },
    ),
    (error) => error === rollbackProbe,
  );
  assert.equal(completed, true);
  assert.deepEqual(await candidateCatalogResidue(prisma), {
    command_exists: false,
    command_guard_exists: false,
    enrollment_columns_exist: false,
    event_exists: false,
    event_guard_exists: false,
    marker_constraint_exists: false,
    registry_guard_exists: false,
  });
}

async function assertMigrationAccepted(prisma, candidateSha256) {
  const state = await migrationState(prisma);
  const completed = state.filter(
    ({ finishedAt, rolledBackAt }) => finishedAt && !rolledBackAt,
  );
  const unfinished = state.filter(
    ({ finishedAt, rolledBackAt }) => !finishedAt && !rolledBackAt,
  );
  assert.equal(completed.length, CANDIDATE_MIGRATION_COUNT);
  assert.equal(completed.at(-1)?.name, CANDIDATE_MIGRATION);
  assert.equal(completed.at(-1)?.checksum, candidateSha256);
  assert.equal(unfinished.length, 0);
}

async function assertAcceptedOwnerAclAndCatalog(prisma) {
  const relations = await prisma.$queryRawUnsafe(`
    SELECT
      relation.relname AS relation_name,
      owner.rolname AS owner_name,
      relation.relkind::TEXT AS relation_kind
    FROM pg_catalog.pg_class AS relation
    INNER JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    INNER JOIN pg_catalog.pg_roles AS owner ON owner.oid = relation.relowner
    WHERE namespace.nspname = 'public'
      AND relation.relname IN (
        'IdentityMailDeliveryTenantEnrollmentCommand',
        'IdentityMailDeliveryTenantEnrollmentEvent'
      )
    ORDER BY relation.relname
  `);
  assert.deepEqual(
    relations.map(({ relation_name, relation_kind }) => ({
      relationName: relation_name,
      relationKind: relation_kind,
    })),
    CANDIDATE_RELATIONS.map((relationName) => ({
      relationKind: "r",
      relationName,
    })),
  );
  assert.equal(new Set(relations.map(({ owner_name }) => owner_name)).size, 1);

  const [unsafeAcl] = await prisma.$queryRawUnsafe(`
    WITH candidate_relations AS (
      SELECT relation.oid, relation.relowner, relation.relacl
      FROM pg_catalog.pg_class AS relation
      INNER JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relname IN (
          'IdentityMailDeliveryTenantEnrollmentCommand',
          'IdentityMailDeliveryTenantEnrollmentEvent'
        )
    ), relation_acl AS (
      SELECT acl.grantee, candidate.relowner
      FROM candidate_relations AS candidate
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        COALESCE(
          candidate.relacl,
          pg_catalog.acldefault('r', candidate.relowner)
        )
      ) AS acl
    ), column_acl AS (
      SELECT acl.grantee, relation.relowner
      FROM candidate_relations AS relation
      INNER JOIN pg_catalog.pg_attribute AS attribute
        ON attribute.attrelid = relation.oid
       AND attribute.attnum > 0
       AND attribute.attisdropped = false
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        attribute.attacl
      ) AS acl
    ), function_acl AS (
      SELECT acl.grantee, routine.proowner
      FROM pg_catalog.pg_proc AS routine
      INNER JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid = routine.pronamespace
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        COALESCE(routine.proacl, pg_catalog.acldefault('f', routine.proowner))
      ) AS acl
      WHERE namespace.nspname = 'public'
        AND routine.proname IN (
          'identity_mail_tenant_enrollment_command_guard_v1',
          'identity_mail_tenant_enrollment_event_guard_v1',
          'identity_mail_tenant_enrollment_registry_dormant_guard_v1'
        )
    )
    SELECT
      (SELECT pg_catalog.count(*) FROM relation_acl WHERE grantee <> relowner)::INTEGER AS relation_count,
      (SELECT pg_catalog.count(*) FROM column_acl WHERE grantee <> relowner)::INTEGER AS column_count,
      (SELECT pg_catalog.count(*) FROM function_acl WHERE grantee <> proowner)::INTEGER AS function_count
  `);
  assert.deepEqual(
    {
      columnCount: Number(unsafeAcl?.column_count ?? -1),
      functionCount: Number(unsafeAcl?.function_count ?? -1),
      relationCount: Number(unsafeAcl?.relation_count ?? -1),
    },
    { columnCount: 0, functionCount: 0, relationCount: 0 },
  );

  const columns = await prisma.$queryRawUnsafe(`
    SELECT
      attribute.attname AS name,
      pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) AS type,
      NOT attribute.attnotnull AS nullable
    FROM pg_catalog.pg_attribute AS attribute
    WHERE attribute.attrelid = pg_catalog.to_regclass(
      'public."IdentityMailDeliveryTenantEnrollment"'
    )
      AND attribute.attnum > 0
      AND attribute.attisdropped = false
      AND attribute.attname IN (
        'state', 'stateRevision', 'activeCommandId',
        'lastEventDigest', 'currentConfigurationDigest', 'stateChangedAt'
      )
    ORDER BY attribute.attname
  `);
  assert.deepEqual(
    columns.map((column) => ({
      name: column.name,
      nullable: column.nullable,
      type: column.type,
    })),
    [...ENROLLMENT_COLUMNS],
  );

  const functions = await prisma.$queryRawUnsafe(`
    SELECT
      routine.proname AS name,
      owner.rolname AS owner_name,
      routine.prosecdef AS security_definer,
      routine.provolatile::TEXT AS volatility,
      language.lanname AS language,
      routine.proconfig AS configuration,
      pg_catalog.has_function_privilege(
        'public', routine.oid, 'EXECUTE'
      ) AS public_execute
    FROM pg_catalog.pg_proc AS routine
    INNER JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = routine.pronamespace
    INNER JOIN pg_catalog.pg_roles AS owner ON owner.oid = routine.proowner
    INNER JOIN pg_catalog.pg_language AS language ON language.oid = routine.prolang
    WHERE namespace.nspname = 'public'
      AND routine.proname LIKE 'identity_mail_tenant_enrollment_%'
    ORDER BY routine.proname
  `);
  assert.deepEqual(
    functions.map(({ name }) => name),
    [...CANDIDATE_GUARD_FUNCTIONS],
  );
  for (const routine of functions) {
    assert.equal(routine.owner_name, relations[0].owner_name);
    assert.equal(routine.security_definer, false);
    assert.equal(routine.volatility, "v");
    assert.equal(routine.language, "plpgsql");
    assert.deepEqual(routine.configuration, ["search_path=pg_catalog"]);
    assert.equal(routine.public_execute, false);
  }

  const [applyFunctions] = await prisma.$queryRawUnsafe(`
    SELECT pg_catalog.count(*)::INTEGER AS count
    FROM pg_catalog.pg_proc AS routine
    INNER JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = routine.pronamespace
    WHERE namespace.nspname = 'public'
      AND routine.proname ~
        '^identity_mail_tenant_enrollment_(apply|accept|resume|finalize|rollback)'
  `);
  assert.equal(Number(applyFunctions?.count ?? -1), 0);

  const triggers = await prisma.$queryRawUnsafe(`
    SELECT
      trigger.tgname AS name,
      relation.relname AS relation_name,
      routine.proname AS function_name,
      trigger.tgenabled::TEXT AS enabled,
      trigger.tgisinternal AS internal,
      trigger.tgtype::INTEGER AS trigger_type,
      pg_catalog.pg_get_triggerdef(trigger.oid, true) AS definition
    FROM pg_catalog.pg_trigger AS trigger
    INNER JOIN pg_catalog.pg_class AS relation ON relation.oid = trigger.tgrelid
    INNER JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    INNER JOIN pg_catalog.pg_proc AS routine ON routine.oid = trigger.tgfoid
    WHERE namespace.nspname = 'public'
      AND (
        trigger.tgname LIKE 'IdentityMailEnrollment%guard_trigger'
        OR trigger.tgname = 'IdentityMailEnrollment_00_dormant_guard_trigger'
      )
    ORDER BY trigger.tgname
  `);
  assert.deepEqual(
    triggers.map((trigger) => ({
      functionName: trigger.function_name,
      name: trigger.name,
      relationName: trigger.relation_name,
      triggerType: Number(trigger.trigger_type),
    })),
    [...CANDIDATE_TRIGGERS],
  );
  for (const trigger of triggers) {
    assert.equal(trigger.enabled, "O");
    assert.equal(trigger.internal, false);
    assert.match(trigger.definition, /FOR EACH STATEMENT/iu);
    assert.match(
      trigger.definition,
      Number(trigger.trigger_type) === 34
        ? /BEFORE TRUNCATE/iu
        : /BEFORE INSERT OR DELETE OR UPDATE/iu,
    );
  }

  const indexes = await prisma.$queryRawUnsafe(`
    SELECT index_class.relname AS name
    FROM pg_catalog.pg_class AS index_class
    INNER JOIN pg_catalog.pg_index AS target_index
      ON target_index.indexrelid = index_class.oid
    INNER JOIN pg_catalog.pg_class AS relation
      ON relation.oid = target_index.indrelid
    INNER JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND index_class.relname LIKE 'identity_mail_tenant_enrollment_%'
    ORDER BY index_class.relname
  `);
  assert.deepEqual(indexes.map(({ name }) => name), [...CANDIDATE_INDEXES]);

  const [nonBranching] = await prisma.$queryRawUnsafe(`
    SELECT
      target_constraint.contype::TEXT AS constraint_type,
      target_index.indisunique AS unique_index,
      target_index.indnullsnotdistinct AS nulls_not_distinct,
      pg_catalog.pg_get_constraintdef(target_constraint.oid, true) AS definition
    FROM pg_catalog.pg_constraint AS target_constraint
    INNER JOIN pg_catalog.pg_index AS target_index
      ON target_index.indexrelid = target_constraint.conindid
    WHERE target_constraint.conrelid = pg_catalog.to_regclass(
      'public."IdentityMailDeliveryTenantEnrollmentEvent"'
    )
      AND target_constraint.conname =
        'identity_mail_tenant_enrollment_event_previous_uidx'
  `);
  assert.ok(nonBranching);
  assert.equal(nonBranching.constraint_type, "u");
  assert.equal(nonBranching.unique_index, true);
  assert.equal(nonBranching.nulls_not_distinct, true);
  assert.match(
    nonBranching.definition,
    /UNIQUE NULLS NOT DISTINCT \("tenantId", "previousEventDigest"\)/u,
  );

  const continuityConstraints = await prisma.$queryRawUnsafe(`
    SELECT
      target_constraint.conname AS name,
      target_constraint.contype::TEXT AS constraint_type,
      target_constraint.condeferrable AS deferrable,
      target_constraint.condeferred AS initially_deferred,
      ARRAY(
        SELECT attribute.attname
        FROM pg_catalog.unnest(target_constraint.conkey)
          WITH ORDINALITY AS key_column(attnum, ordinal)
        INNER JOIN pg_catalog.pg_attribute AS attribute
          ON attribute.attrelid = target_constraint.conrelid
         AND attribute.attnum = key_column.attnum
        ORDER BY key_column.ordinal
      )::TEXT[] AS key_columns,
      ARRAY(
        SELECT attribute.attname
        FROM pg_catalog.unnest(target_constraint.confkey)
          WITH ORDINALITY AS referenced_column(attnum, ordinal)
        INNER JOIN pg_catalog.pg_attribute AS attribute
          ON attribute.attrelid = target_constraint.confrelid
         AND attribute.attnum = referenced_column.attnum
        ORDER BY referenced_column.ordinal
      )::TEXT[] AS referenced_columns,
      pg_catalog.pg_get_constraintdef(target_constraint.oid, true) AS definition
    FROM pg_catalog.pg_constraint AS target_constraint
    WHERE target_constraint.conname IN (
      'identity_mail_tenant_enrollment_command_drain_projection_key',
      'identity_mail_tenant_enrollment_event_terminal_projection_key',
      'IdentityMailDeliveryTenantEnrollmentEvent_continuity_fkey',
      'IdentityMailDeliveryTenantEnrollment_activeCommand_fkey',
      'IdentityMailDeliveryTenantEnrollment_lastEvent_fkey'
    )
      AND target_constraint.connamespace = (
        SELECT namespace.oid
        FROM pg_catalog.pg_namespace AS namespace
        WHERE namespace.nspname = 'public'
      )
  `);
  assert.equal(continuityConstraints.length, 5);
  const continuityConstraint = (name) => {
    const target = continuityConstraints.find((constraint) => constraint.name === name);
    assert.ok(target, `${name} is missing.`);
    return {
      ...target,
      definition: target.definition.replaceAll(/\s+/gu, " "),
    };
  };
  for (const name of [
    "identity_mail_tenant_enrollment_command_drain_projection_key",
    "identity_mail_tenant_enrollment_event_terminal_projection_key",
  ]) {
    const target = continuityConstraint(name);
    assert.equal(target.constraint_type, "u");
    assert.equal(target.deferrable, false);
    assert.equal(target.initially_deferred, false);
  }
  for (const name of [
    "IdentityMailDeliveryTenantEnrollmentEvent_continuity_fkey",
    "IdentityMailDeliveryTenantEnrollment_activeCommand_fkey",
    "IdentityMailDeliveryTenantEnrollment_lastEvent_fkey",
  ]) {
    const target = continuityConstraint(name);
    assert.equal(target.constraint_type, "f");
    assert.equal(target.deferrable, true);
    assert.equal(target.initially_deferred, true);
  }
  assert.deepEqual(
    continuityConstraint(
      "identity_mail_tenant_enrollment_command_drain_projection_key",
    ).key_columns,
    ["tenantId", "id", "drainStateRevision"],
  );
  assert.deepEqual(
    continuityConstraint(
      "identity_mail_tenant_enrollment_event_terminal_projection_key",
    ).key_columns,
    [
      "tenantId",
      "eventDigest",
      "toState",
      "toPolicyRevision",
      "toStateRevision",
      "toConfigurationDigest",
    ],
  );
  assert.deepEqual(
    continuityConstraint(
      "IdentityMailDeliveryTenantEnrollmentEvent_continuity_fkey",
    ).key_columns,
    [
      "tenantId",
      "previousEventDigest",
      "fromState",
      "fromPolicyRevision",
      "fromStateRevision",
      "fromConfigurationDigest",
    ],
  );
  assert.deepEqual(
    continuityConstraint(
      "IdentityMailDeliveryTenantEnrollmentEvent_continuity_fkey",
    ).referenced_columns,
    [
      "tenantId",
      "eventDigest",
      "toState",
      "toPolicyRevision",
      "toStateRevision",
      "toConfigurationDigest",
    ],
  );
  assert.deepEqual(
    continuityConstraint(
      "IdentityMailDeliveryTenantEnrollment_activeCommand_fkey",
    ).key_columns,
    ["tenantId", "activeCommandId", "stateRevision"],
  );
  assert.deepEqual(
    continuityConstraint(
      "IdentityMailDeliveryTenantEnrollment_activeCommand_fkey",
    ).referenced_columns,
    ["tenantId", "id", "drainStateRevision"],
  );
  assert.deepEqual(
    continuityConstraint(
      "IdentityMailDeliveryTenantEnrollment_lastEvent_fkey",
    ).key_columns,
    [
      "tenantId",
      "lastEventDigest",
      "state",
      "policyRevision",
      "stateRevision",
      "currentConfigurationDigest",
    ],
  );
  assert.deepEqual(
    continuityConstraint(
      "IdentityMailDeliveryTenantEnrollment_lastEvent_fkey",
    ).referenced_columns,
    [
      "tenantId",
      "eventDigest",
      "toState",
      "toPolicyRevision",
      "toStateRevision",
      "toConfigurationDigest",
    ],
  );

  const [signatureBinding] = await prisma.$queryRawUnsafe(`
    SELECT
      pg_catalog.count(*) FILTER (
        WHERE attribute.attname = 'proposalContentDigest'
      )::INTEGER AS proposal_digest_columns,
      pg_catalog.count(*) FILTER (
        WHERE attribute.attname = 'authorizationEnvelopeCanonicalJson'
      )::INTEGER AS authorization_envelope_columns,
      pg_catalog.count(*) FILTER (
        WHERE attribute.attname = 'authorizationEnvelopeDigest'
      )::INTEGER AS authorization_digest_columns
    FROM pg_catalog.pg_attribute AS attribute
    WHERE attribute.attrelid = pg_catalog.to_regclass(
      'public."IdentityMailDeliveryTenantEnrollmentCommand"'
    )
      AND attribute.attnum > 0
      AND attribute.attisdropped = false
  `);
  assert.deepEqual(
    {
      authorizationDigestColumns: Number(
        signatureBinding?.authorization_digest_columns ?? -1,
      ),
      authorizationEnvelopeColumns: Number(
        signatureBinding?.authorization_envelope_columns ?? -1,
      ),
      proposalDigestColumns: Number(signatureBinding?.proposal_digest_columns ?? -1),
    },
    {
      authorizationDigestColumns: 1,
      authorizationEnvelopeColumns: 1,
      proposalDigestColumns: 1,
    },
  );
  const authorityConstraints = await prisma.$queryRawUnsafe(`
    SELECT
      target_constraint.conname AS name,
      pg_catalog.pg_get_constraintdef(target_constraint.oid, true) AS definition
    FROM pg_catalog.pg_constraint AS target_constraint
    WHERE target_constraint.conrelid = pg_catalog.to_regclass(
      'public."IdentityMailDeliveryTenantEnrollmentCommand"'
    )
      AND target_constraint.conname IN (
        'identity_mail_tenant_enrollment_command_digest_check',
        'identity_mail_tenant_enrollment_command_digest_key',
        'identity_mail_tenant_enrollment_command_payload_check',
        'identity_mail_tenant_enrollment_command_signature_check'
      )
    ORDER BY target_constraint.conname
  `);
  assert.deepEqual(
    authorityConstraints.map(({ name }) => name),
    [
      "identity_mail_tenant_enrollment_command_digest_check",
      "identity_mail_tenant_enrollment_command_digest_key",
      "identity_mail_tenant_enrollment_command_payload_check",
      "identity_mail_tenant_enrollment_command_signature_check",
    ],
  );
  const constraintDefinition = (name) => {
    const target = authorityConstraints.find((constraint) => constraint.name === name);
    assert.ok(target, `${name} is missing.`);
    return target.definition.replaceAll(/\s+/gu, " ");
  };
  assert.match(
    constraintDefinition("identity_mail_tenant_enrollment_command_digest_check"),
    /"authorizationEnvelopeDigest" <> "proposalContentDigest"/u,
  );
  assert.match(
    constraintDefinition("identity_mail_tenant_enrollment_command_digest_key"),
    /UNIQUE \("tenantId", "?id"?, "authorizationEnvelopeDigest"\)/u,
  );
  const payloadDefinition = constraintDefinition(
    "identity_mail_tenant_enrollment_command_payload_check",
  );
  assert.match(
    payloadDefinition,
    /"authorizationEnvelopeCanonicalJson".*"proposalContentDigest"/u,
  );
  assert.match(
    payloadDefinition,
    /"authorizationEnvelopeDigest".*sha256.*"signatureDomain".*"authorizationEnvelopeCanonicalJson"/u,
  );
  assert.match(
    constraintDefinition("identity_mail_tenant_enrollment_command_signature_check"),
    /"signatureAlgorithm"(?:::text)? = 'Ed25519'(?:::text)?/u,
  );

  const [eventCommandBinding] = await prisma.$queryRawUnsafe(`
    SELECT pg_catalog.pg_get_constraintdef(target_constraint.oid, true) AS definition
    FROM pg_catalog.pg_constraint AS target_constraint
    WHERE target_constraint.conrelid = pg_catalog.to_regclass(
      'public."IdentityMailDeliveryTenantEnrollmentEvent"'
    )
      AND target_constraint.conname =
        'IdentityMailDeliveryTenantEnrollmentEvent_command_fkey'
  `);
  assert.ok(eventCommandBinding);
  assert.match(
    eventCommandBinding.definition.replaceAll(/\s+/gu, " "),
    /FOREIGN KEY \("tenantId", "commandId", "commandContentDigest"\) REFERENCES "IdentityMailDeliveryTenantEnrollmentCommand"\("tenantId", "?id"?, "authorizationEnvelopeDigest"\)/u,
  );

  const [counts] = await prisma.$queryRawUnsafe(`
    SELECT
      (SELECT pg_catalog.count(*) FROM public."IdentityMailDeliveryTenantEnrollment")::INTEGER AS enrollment_count,
      (SELECT pg_catalog.count(*) FROM public."IdentityMailDeliveryTenantEnrollmentCommand")::INTEGER AS command_count,
      (SELECT pg_catalog.count(*) FROM public."IdentityMailDeliveryTenantEnrollmentEvent")::INTEGER AS event_count
  `);
  assert.deepEqual(
    {
      commandCount: Number(counts?.command_count ?? -1),
      enrollmentCount: Number(counts?.enrollment_count ?? -1),
      eventCount: Number(counts?.event_count ?? -1),
    },
    { commandCount: 0, enrollmentCount: 0, eventCount: 0 },
  );
}

async function assertEmptyStatementGuards(prisma) {
  const cases = [
    `INSERT INTO public."IdentityMailDeliveryTenantEnrollmentCommand" ("id") VALUES ('00000000-0000-4000-8000-000000000001')`,
    `UPDATE public."IdentityMailDeliveryTenantEnrollmentCommand" SET "id" = "id" WHERE false`,
    `DELETE FROM public."IdentityMailDeliveryTenantEnrollmentCommand" WHERE false`,
    `INSERT INTO public."IdentityMailDeliveryTenantEnrollmentEvent" ("id") VALUES ('00000000-0000-4000-8000-000000000002')`,
    `UPDATE public."IdentityMailDeliveryTenantEnrollmentEvent" SET "id" = "id" WHERE false`,
    `DELETE FROM public."IdentityMailDeliveryTenantEnrollmentEvent" WHERE false`,
    `INSERT INTO public."IdentityMailDeliveryTenantEnrollment" ("tenantId") VALUES ('00000000-0000-4000-8000-000000000003')`,
    `UPDATE public."IdentityMailDeliveryTenantEnrollment" SET "enabled" = "enabled" WHERE false`,
    `DELETE FROM public."IdentityMailDeliveryTenantEnrollment" WHERE false`,
    `TRUNCATE TABLE public."IdentityMailDeliveryTenantEnrollmentCommand", public."IdentityMailDeliveryTenantEnrollmentEvent", public."IdentityMailDeliveryTenantEnrollment"`,
  ];
  for (const sql of cases) {
    await expectSqlState("55000", () => prisma.$executeRawUnsafe(sql), /dormant/iu);
  }
  let enrollmentTruncateError = null;
  try {
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE public."IdentityMailDeliveryTenantEnrollment"`,
    );
  } catch (error) {
    enrollmentTruncateError = error;
  }
  assert.ok(
    enrollmentTruncateError,
    "ENROLLMENT_TRUNCATE_GUARD_MISSING: TRUNCATE succeeded without SQLSTATE.",
  );
  assert.equal(
    extractSqlState(enrollmentTruncateError),
    "55000",
    formatFailure(enrollmentTruncateError),
  );
  assert.match(
    sanitize(enrollmentTruncateError),
    /cannot be truncated|dormant/iu,
  );
}

async function assertOldWorkerAndPreflightFailClosed(
  prisma,
  cloneDatabaseUrl,
  cloneDatabaseName,
) {
  const tenantId = randomUUID();
  await expectSqlState(
    "42501",
    () =>
      prisma.$queryRawUnsafe(
        `SELECT public."identity_mail_delivery_worker_assert_v1"($1::TEXT)`,
        tenantId,
      ),
    /not enrolled for tenant/iu,
  );
  const [workerDefinition] = await prisma.$queryRawUnsafe(`
    SELECT pg_catalog.pg_get_functiondef(
      pg_catalog.to_regprocedure(
        'public."identity_mail_delivery_worker_assert_v1"(text)'
      )
    ) AS definition
  `);
  assert.match(workerDefinition.definition, /migration_count IS DISTINCT FROM 179/u);

  const [database] = await prisma.$queryRawUnsafe(`
    SELECT oid::BIGINT AS oid
    FROM pg_catalog.pg_database
    WHERE datname = pg_catalog.current_database()
  `);
  const now = new Date();
  const proposal = {
    action: "ENABLE",
    contract: "PROTECTED_MAIL_WORKER_TENANT_ENROLLMENT_V1",
    deploymentMarkerDigest: "d".repeat(64),
    expectedDatabaseName: cloneDatabaseName,
    expectedDatabaseOid: Number(database.oid),
    expectedRevision: 0,
    expectedState: "ABSENT",
    expiresAt: new Date(now.valueOf() + 10 * 60_000).toISOString(),
    nextRevision: 1,
    policy: {
      acknowledgeSeconds: 120,
      baseRetrySeconds: 30,
      leaseSeconds: 300,
      maxAttempts: 5,
      maxRetrySeconds: 3_600,
    },
    providerAuthorityDigest: "b".repeat(64),
    releaseSha: "a".repeat(40),
    requestId: randomUUID(),
    requestedAt: new Date(now.valueOf() - 60_000).toISOString(),
    runtimeConfigDigest: "c".repeat(64),
    tenantId,
    workerRoleName: NONEXISTENT_WORKER_ROLE,
    workerRoleOid: NONEXISTENT_WORKER_OID,
  };
  const config = parseIdentityMailTenantEnrollmentPreflightConfig({
    DATABASE_URL: cloneDatabaseUrl,
    IDENTITY_MAIL_TENANT_ENROLLMENT_POLICY_ACKNOWLEDGE_SECONDS: "120",
    IDENTITY_MAIL_TENANT_ENROLLMENT_POLICY_BASE_RETRY_SECONDS: "30",
    IDENTITY_MAIL_TENANT_ENROLLMENT_POLICY_LEASE_SECONDS: "300",
    IDENTITY_MAIL_TENANT_ENROLLMENT_POLICY_MAX_ATTEMPTS: "5",
    IDENTITY_MAIL_TENANT_ENROLLMENT_POLICY_MAX_RETRY_SECONDS: "3600",
    IDENTITY_MAIL_TENANT_ENROLLMENT_PROVIDER_AUTHORITY_DIGEST: "b".repeat(64),
  });
  const checked = await checkIdentityMailTenantEnrollmentPreflight(
    prisma,
    proposal,
    config,
    { now },
  );
  assert.equal(checked.result.inspectionDecision, "BLOCKED");
  assert.equal(checked.result.authorization, false);
  assert.equal(checked.result.canMutate, false);
  assert.ok(checked.result.findings.includes("MIGRATION_COUNT_MISMATCH"));
  assert.ok(checked.result.findings.includes("MIGRATION_HEAD_MISMATCH"));
}

async function safeDisconnect(client, cleanupErrors) {
  if (!client) return;
  await client.$disconnect().catch((error) => cleanupErrors.push(error));
}

async function runSmoke() {
  assert.equal(process.env.NODE_ENV, "test", "NODE_ENV=test is required.");
  assert.equal(
    process.env[CONFIRMATION_ENVIRONMENT],
    REQUIRED_CONFIRMATION,
    `${CONFIRMATION_ENVIRONMENT} confirmation is required.`,
  );
  const { databaseName: sourceDatabaseName, parsed: sourceUrl } =
    parseSafeSourceDatabaseUrl(process.env.DATABASE_URL);
  const maintenanceUrl = databaseUrl(sourceUrl, "postgres");
  const cleanCloneName = generatedCloneName();
  const rejectCloneName = generatedCloneName();
  assert.notEqual(cleanCloneName, rejectCloneName);
  const cleanUrl = databaseUrl(sourceUrl, cleanCloneName);
  const rejectUrl = databaseUrl(sourceUrl, rejectCloneName);

  const plan = await readCanonicalAndCandidatePlan();
  let artifact = null;
  let maintenance = null;
  let source = null;
  let clean = null;
  let reject = null;
  let cleanCreateAttempted = false;
  let rejectCreateAttempted = false;
  let clusterLockAcquired = false;
  let sourceBefore = null;
  let primaryError = null;
  const cleanupErrors = [];

  try {
    artifact = await createTemporaryPrismaArtifact(plan);
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

    cleanCreateAttempted = true;
    await createClone(maintenance, sourceDatabaseName, cleanCloneName);
    rejectCreateAttempted = true;
    await createClone(maintenance, sourceDatabaseName, rejectCloneName);

    reject = prismaClient(rejectUrl);
    await reject.$connect();
    const fixture = await seedLegacyDisabledEnrollment(reject);
    const rejectBusinessBefore = await legacyBusinessFingerprint(
      reject,
      fixture.tenantId,
    );
    await assertLegacyFixtureHitsExactPrerequisite(
      reject,
      plan.candidate.text,
      plan.candidate.sha256,
      fixture,
      rejectBusinessBefore,
    );
    await reject.$disconnect();
    reject = null;

    const rejectedDeploy = runPrisma(
      artifact.schemaPath,
      rejectUrl,
      ["deploy"],
      "reject-deploy",
    );
    assertPrismaFailure(rejectedDeploy, "reject-deploy");
    reject = prismaClient(rejectUrl);
    await reject.$connect();
    await assertRejectedCandidateState(
      reject,
      plan.candidate.sha256,
      fixture,
      rejectBusinessBefore,
      { resolved: false },
    );
    await reject.$disconnect();
    reject = null;

    const resolved = runPrisma(
      artifact.schemaPath,
      rejectUrl,
      ["resolve", "--rolled-back", CANDIDATE_MIGRATION],
      "reject-resolve",
    );
    assertPrismaSuccess(resolved, "reject-resolve");
    reject = prismaClient(rejectUrl);
    await reject.$connect();
    await assertRejectedCandidateState(
      reject,
      plan.candidate.sha256,
      fixture,
      rejectBusinessBefore,
      { resolved: true },
    );
    await reject.$disconnect();
    reject = null;

    clean = prismaClient(cleanUrl);
    await clean.$connect();
    await assertCandidateExecutionFence(
      clean,
      plan.candidate.text,
      plan.candidate.sha256,
    );
    await diagnoseCandidateStatementsInRollback(
      clean,
      plan.candidate.text,
      plan.candidate.sha256,
    );
    await clean.$disconnect();
    clean = null;

    const cleanDeploy = runPrisma(
      artifact.schemaPath,
      cleanUrl,
      ["deploy"],
      "clean-deploy",
    );
    assertPrismaSuccess(cleanDeploy, "clean-deploy");
    clean = prismaClient(cleanUrl);
    await clean.$connect();
    await assertMigrationAccepted(clean, plan.candidate.sha256);
    await assertAcceptedOwnerAclAndCatalog(clean);
    await assertEmptyStatementGuards(clean);
    await assertOldWorkerAndPreflightFailClosed(
      clean,
      cleanUrl,
      cleanCloneName,
    );
  } catch (error) {
    primaryError = error;
  } finally {
    await safeDisconnect(clean, cleanupErrors);
    clean = null;
    await safeDisconnect(reject, cleanupErrors);
    reject = null;
    await safeDisconnect(source, cleanupErrors);
    source = null;

    if (maintenance && rejectCreateAttempted) {
      await dropExactClone(maintenance, rejectCloneName).catch((error) =>
        cleanupErrors.push(error),
      );
    }
    if (maintenance && cleanCreateAttempted) {
      await dropExactClone(maintenance, cleanCloneName).catch((error) =>
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

    if (artifact) {
      await rm(assertSafeTempRoot(artifact.root), {
        force: true,
        maxRetries: 10,
        recursive: true,
        retryDelay: 100,
      }).catch((error) => cleanupErrors.push(error));
    }
  }

  if (primaryError && cleanupErrors.length > 0) {
    throw new AggregateError(
      [primaryError, ...cleanupErrors],
      "Candidate smoke and cleanup both failed.",
    );
  }
  if (primaryError) throw primaryError;
  if (cleanupErrors.length > 0) throw cleanupErrors[0];

  process.stdout.write(
    `${JSON.stringify({
      candidateMigration: CANDIDATE_MIGRATION,
      candidateMigrationCount: CANDIDATE_MIGRATION_COUNT,
      candidateSha256: plan.candidate.sha256,
      candidateExecutionFenceMatrixPassed: true,
      cleanUpgradeAccepted: true,
      decision: "CANDIDATE_SMOKE_PASSED",
      legacyEnrollmentRejected: true,
      oldPreflightBlocked: true,
      oldWorkerBlocked: true,
      prismaFailedReceiptResolvedRolledBack: true,
      sourceReadOnlyZeroDiff: true,
      statementRollbackDiagnosticPassed: true,
    })}\n`,
  );
}

async function runSelfTest() {
  const ipv4 = parseSafeSourceDatabaseUrl(
    "postgresql://postgres:test@127.0.0.1:5432/leetplus_ci?schema=public",
  );
  assert.equal(ipv4.databaseName, "leetplus_ci");
  const ipv6 = parseSafeSourceDatabaseUrl(
    "postgresql://postgres:test@[::1]:5432/leetplus_ci?schema=public",
  );
  assert.equal(ipv6.databaseName, "leetplus_ci");
  for (const invalid of [
    "postgresql://postgres:test@localhost:5432/leetplus_ci?schema=public",
    "postgresql://postgres:test@127.0.0.2:5432/leetplus_ci?schema=public",
    "postgresql://postgres:test@127.0.0.1:5432/leetplus?schema=public",
    "postgresql://postgres:test@127.0.0.1:5432/postgres?schema=public",
    "postgresql://postgres:test@127.0.0.1:5432/leetplus_ci?schema=public&sslmode=disable",
    "postgresql://postgres:test@127.0.0.1:5432/leetplus_ci?schema=public#fragment",
  ]) {
    assert.throws(() => parseSafeSourceDatabaseUrl(invalid));
  }
  const firstClone = generatedCloneName();
  const secondClone = generatedCloneName();
  assert.match(firstClone, CLONE_PATTERN);
  assert.match(secondClone, CLONE_PATTERN);
  assert.notEqual(firstClone, secondClone);
  const fencedUrl = fencedCandidateDatabaseUrl(
    `postgresql://fixture:fixture-secret@127.0.0.1:5432/${firstClone}?schema=public`,
  );
  const fenced = new URL(fencedUrl);
  assert.equal(fenced.searchParams.get("schema"), "public");
  assert.equal(
    fenced.searchParams.get("options"),
    CANDIDATE_SESSION_OPTIONS.join(" "),
  );
  assert.equal(CANDIDATE_SESSION_OPTIONS.length, 4);
  assert.equal(sanitize(new Error(fencedUrl)), "<redacted-postgresql-url>");
  const plan = await readCanonicalAndCandidatePlan();
  assert.equal(plan.entries.length, CANONICAL_MIGRATION_COUNT);
  assert.equal(plan.entries.at(-1)?.name, CANONICAL_MIGRATION_HEAD);
  assert.equal(plan.candidate.name, CANDIDATE_MIGRATION);
  assert.match(plan.candidate.sha256, /^[0-9a-f]{64}$/u);
  process.stdout.write(
    `${JSON.stringify({
      candidateMigration: CANDIDATE_MIGRATION,
      candidateSha256: plan.candidate.sha256,
      canonicalMigrationCount: CANONICAL_MIGRATION_COUNT,
      canonicalMigrationHead: CANONICAL_MIGRATION_HEAD,
      decision: "SELF_TEST_PASSED",
    })}\n`,
  );
}

const arguments_ = parseArguments(process.argv.slice(2));
if (arguments_.help) {
  process.stdout.write(`${HELP}\n`);
} else if (arguments_.selfTest) {
  runSelfTest().catch((error) => {
    process.stderr.write(`${formatFailure(error)}\n`);
    process.exitCode = 1;
  });
} else {
  runSmoke().catch((error) => {
    process.stderr.write(`${formatFailure(error)}\n`);
    process.exitCode = 1;
  });
}

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
import { fileURLToPath, pathToFileURL } from "node:url";

import { PrismaClient } from "@prisma/client";

export const CURRENT181_SMOKE_SCRIPT_NAME =
  "identity-mail-tenant-lock-drain-current181-candidate-smoke";
export const CURRENT181_SMOKE_CONFIRMATION =
  "run-identity-mail-tenant-lock-drain-current181-candidate-smoke";
export const CURRENT181_SMOKE_CONFIRMATION_ENVIRONMENT =
  "IDENTITY_MAIL_TENANT_LOCK_DRAIN_CURRENT181_CANDIDATE_SMOKE_CONFIRM";

const CANONICAL_COUNT = 179;
const CANONICAL_HEAD = "20260731120000_identity_mail_delivery_release_head";
const CANONICAL_HEAD_SHA256 =
  "c394060fbf979c567403976c8e906dc67b3bd840aea9fa9550e1d939d04af519";
const CANONICAL_MANIFEST_DIGEST =
  "3330185424ca669c18f39c2da5aa1e49f942500c0c85185c9125930e02df9431";
const CURRENT180 =
  "20260801010000_identity_mail_tenant_enrollment_control_plane";
const CURRENT180_SHA256 =
  "e84ba3c4e9e61d1d759b82a33fc22c853471fb0ef908546e755699d0d264f683";
const CURRENT180_MANIFEST_DIGEST =
  "c41f3854bff364deb4f169f56f31bb5bd7e46249a677c66bc879cb967b6fae58";
const CURRENT181 = "20260801020000_identity_mail_tenant_lock_drain_worker_v2";

const CURRENT180_CONFIRMATION =
  "rehearse-dormant-identity-mail-tenant-enrollment-current180";
const CURRENT180_CONFIRMATION_GUC =
  "leetplus.identity_mail_tenant_enrollment_current180_confirmation";
const CURRENT180_SHA256_GUC =
  "leetplus.identity_mail_tenant_enrollment_current180_sha256";
const CURRENT181_CONFIRMATION =
  "rehearse-noncanonical-identity-mail-tenant-lock-drain-current181";
const CURRENT181_CONFIRMATION_GUC =
  "leetplus.identity_mail_tenant_lock_drain_current181_confirmation";
const CURRENT181_SHA256_GUC =
  "leetplus.identity_mail_tenant_lock_drain_current181_sha256";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const DATABASE_PACKAGE_DIRECTORY = resolve(SCRIPT_DIRECTORY, "..");
const PRISMA_DIRECTORY = join(DATABASE_PACKAGE_DIRECTORY, "prisma");
const CANDIDATE_DIRECTORY = join(
  DATABASE_PACKAGE_DIRECTORY,
  "migration-candidates",
);
const CURRENT180_DIRECTORY = join(CANDIDATE_DIRECTORY, CURRENT180);
const CURRENT181_DIRECTORY = join(CANDIDATE_DIRECTORY, CURRENT181);
const MIGRATION_PATTERN = /^\d{14}_[a-z0-9_]+$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const SAFE_SOURCE_DATABASE_PATTERN = /^[a-z][a-z0-9_]{0,54}_ci$/u;
const CLONE_PREFIX = "lp_imtec_";
export const CURRENT181_SMOKE_CLONE_PATTERN =
  /^lp_imtec_[0-9a-f]{32}_ci$/u;
const TEMP_PREFIX = "leetplus-imtec-current181-";
const CLUSTER_LOCK_CLASS = 1_817_190_181;
const CLUSTER_LOCK_OBJECT = 181;
const TEMP_SCHEMA = `datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
`;

const CURRENT181_COLUMNS = Object.freeze([
  Object.freeze({ name: "claimEnrollmentStateRevision", table: "IdentityMailOutbox" }),
  Object.freeze({ name: "claimPolicyRevision", table: "IdentityMailOutbox" }),
  Object.freeze({ name: "claimProviderAuthorityDigest", table: "IdentityMailOutbox" }),
  Object.freeze({ name: "claimEnrollmentStateRevision", table: "IdentityMailDeliveryEvent" }),
  Object.freeze({ name: "claimPolicyRevision", table: "IdentityMailDeliveryEvent" }),
  Object.freeze({ name: "claimProviderAuthorityDigest", table: "IdentityMailDeliveryEvent" }),
]);
const CURRENT181_INDEXES = Object.freeze([
  "identity_mail_tenant_enrollment_command_rollback_once_uidx",
  "identity_mail_outbox_ready_tenant_v2_idx",
  "identity_mail_outbox_drain_barrier_v2_idx",
  "identity_mail_outbox_secret_barrier_v2_idx",
  "identity_mail_outbox_unmarked_tenant_v2_idx",
  "identity_mail_outbox_marked_tenant_v2_idx",
]);
const CURRENT181_NEW_FUNCTIONS = Object.freeze([
  "identity_mail_outbox_delivery_guard_v2",
  "identity_mail_delivery_event_append_v2",
  "identity_mail_tenant_lock_v1",
  "identity_mail_delivery_worker_assert_v2",
  "identity_initial_owner_mail_claim_v2",
  "identity_initial_owner_mail_provider_mark_v2",
  "identity_initial_owner_mail_complete_v2",
  "identity_initial_owner_mail_reap_v2",
  "identity_initial_owner_mail_reconcile_v2",
]);
const EXPECTED_FUNCTIONS = Object.freeze([
  Object.freeze({ signature: 'public."identity_mail_outbox_delivery_guard_v2"()', result: "trigger", securityDefiner: false }),
  Object.freeze({ signature: 'public."identity_mail_delivery_event_append_v2"()', result: "trigger", securityDefiner: false }),
  Object.freeze({ signature: 'public."identity_mail_tenant_lock_v1"(text)', result: "text", securityDefiner: false }),
  Object.freeze({ signature: 'public."identity_mail_delivery_worker_assert_v2"(text,text)', result: "jsonb", securityDefiner: true }),
  Object.freeze({ signature: 'public."identity_initial_owner_mail_claim_v2"(text,text,text,text)', result: "jsonb", securityDefiner: true }),
  Object.freeze({ signature: 'public."identity_initial_owner_mail_provider_mark_v2"(text,text,integer,text,text,text,text,text)', result: "jsonb", securityDefiner: true }),
  Object.freeze({ signature: 'public."identity_initial_owner_mail_complete_v2"(text,text,integer,text,text,text,text,text,text)', result: "jsonb", securityDefiner: true }),
  Object.freeze({ signature: 'public."identity_initial_owner_mail_reap_v2"(text,text,text,integer)', result: "jsonb", securityDefiner: true }),
  Object.freeze({ signature: 'public."identity_initial_owner_mail_reconcile_v2"(text,text,bigint,text,text,text)', result: "jsonb", securityDefiner: true }),
  Object.freeze({ signature: 'public."identity_owner_invite_issue_hold_v1"(text,text,text,integer,text,text,text,text,text,text,text,text,bytea,timestamp with time zone)', result: "jsonb", securityDefiner: true }),
  Object.freeze({ signature: 'public."shared_beta_tenant_activate_v1"(text,text,text,text,text,text,text,text,text,text,text,text,text,text,bytea,timestamp with time zone)', result: "jsonb", securityDefiner: true }),
]);
const V1_PROSRC_PINS = Object.freeze([
  Object.freeze({ signature: 'public."identity_mail_delivery_worker_assert_v1"(text)', sha256: "a8912b95b9dbd7197acd97981b88bae680bf80d3f820a13c569110c1efa49f37" }),
  Object.freeze({ signature: 'public."identity_initial_owner_mail_claim_v1"(text,text,text,text)', sha256: "f2d56144cba4cbc3ee4626f09e1b5c106347822e500c7cd2310f52553b40b57b" }),
  Object.freeze({ signature: 'public."identity_initial_owner_mail_provider_mark_v1"(text,integer,text,text,text,text,text)', sha256: "a4bf0b2da481d9b1aa463261f5d90314729bedd06c6764337e64f59cfde59742" }),
  Object.freeze({ signature: 'public."identity_initial_owner_mail_complete_v1"(text,integer,text,text,text,text,text)', sha256: "650839a7f45bd35a703a2e5e3ee479ef1ddee59f7d36b258836b5671d6f144dc" }),
  Object.freeze({ signature: 'public."identity_initial_owner_mail_reap_v1"(text,text,text,integer)', sha256: "a0f72c433ca283d179e75cb0443acdaedf5d405b05c4e8ad3b0a998034bf89e2" }),
  Object.freeze({ signature: 'public."identity_initial_owner_mail_reconcile_v1"(text,bigint,text,text,text)', sha256: "6ebfbc2d6dd435fe7b4abc474ebc8e43b7178de8bd9723e3eb420f4079ed7d8e" }),
]);
const LEGACY_STUBS = Object.freeze([
  EXPECTED_FUNCTIONS[9].signature,
  EXPECTED_FUNCTIONS[10].signature,
]);
const EXPECTED_STUB_BODY =
  "BEGIN RAISE EXCEPTION 'LEGACY_IDENTITY_MAIL_PRODUCER_RETIRED' USING ERRCODE = '55000'; END;";

export const CURRENT181_SMOKE_CATALOG_CONTRACT = Object.freeze({
  columnCount: CURRENT181_COLUMNS.length,
  functionCount: EXPECTED_FUNCTIONS.length,
  indexCount: CURRENT181_INDEXES.length,
  newFunctionCount: CURRENT181_NEW_FUNCTIONS.length,
  v1ProsrcPinCount: V1_PROSRC_PINS.length,
});

const HELP = `
${CURRENT181_SMOKE_SCRIPT_NAME}

Rehearses the exact dormant CURRENT179 -> CURRENT180 -> CURRENT181 stack on
PostgreSQL 16. The source is read only; all DDL and concurrency probes run on
random disposable lp_imtec_<32hex>_ci clones that are removed in finally.

Usage:
  node scripts/${CURRENT181_SMOKE_SCRIPT_NAME}.mjs
  node scripts/${CURRENT181_SMOKE_SCRIPT_NAME}.mjs --self-test
  node scripts/${CURRENT181_SMOKE_SCRIPT_NAME}.mjs --help

Required for the real rehearsal:
  NODE_ENV=test
  DATABASE_URL=<numeric-loopback PostgreSQL 16 superuser-owned *_ci CURRENT179>
  ${CURRENT181_SMOKE_CONFIRMATION_ENVIRONMENT}=${CURRENT181_SMOKE_CONFIRMATION}

The command never authorizes deployment, enrollment, email delivery, or an
ACTIVE/DRAINING tenant. CURRENT181 remains NOT_DEPLOYABLE.
`.trim();

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function sanitizeCurrent181SmokeError(error) {
  return String(error instanceof Error ? error.message : error)
    .replace(/postgres(?:ql)?:\/\/[^\s")]+/giu, "<redacted-postgresql-url>")
    .replace(/[A-Za-z0-9_-]{86,}/gu, "<redacted-secret>");
}

function formatFailure(error) {
  if (!(error instanceof AggregateError)) {
    return sanitizeCurrent181SmokeError(
      error instanceof Error && error.stack ? error.stack : error,
    );
  }
  return [
    sanitizeCurrent181SmokeError(error),
    ...error.errors.map(
      (cause, index) => `cause_${index + 1}: ${formatFailure(cause)}`,
    ),
  ].join("\n");
}

function extractSqlState(error) {
  if (error && typeof error === "object" && typeof error.meta?.code === "string") {
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
      assert.match(sanitizeCurrent181SmokeError(error), messagePattern);
    }
    return true;
  });
}

export function parseCurrent181SmokeArguments(argv) {
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

export function parseCurrent181SmokeSourceUrl(raw) {
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
  assert.equal(rawEndpoint, normalizedEndpoint, "DATABASE_URL endpoint must be canonical.");
  assert.deepEqual(
    [...parsed.searchParams.entries()],
    [["schema", "public"]],
    "DATABASE_URL must contain only schema=public.",
  );
  assert.ok(parsed.username, "DATABASE_URL username is required.");
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
  target.searchParams.set("connection_limit", "1");
  target.hash = "";
  return target.toString();
}

function prismaClient(url) {
  return new PrismaClient({ datasourceUrl: url, log: [] });
}

export function generateCurrent181SmokeCloneName() {
  const name = `${CLONE_PREFIX}${randomBytes(16).toString("hex")}_ci`;
  assert.match(name, CURRENT181_SMOKE_CLONE_PATTERN);
  return name;
}

function assertSafeTempRoot(path) {
  const resolvedPath = resolve(path);
  const resolvedTemp = resolve(tmpdir());
  assert.ok(resolvedPath.startsWith(`${resolvedTemp}${sep}`));
  assert.ok(basename(resolvedPath).startsWith(TEMP_PREFIX));
  return resolvedPath;
}

export function splitCurrent181SmokeSql(sql) {
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
      } else index += 1;
      continue;
    }
    if (state === "single-quote") {
      if (character === "'" && next === "'") index += 2;
      else {
        if (character === "'") state = "plain";
        index += 1;
      }
      continue;
    }
    if (state === "double-quote") {
      if (character === '"' && next === '"') index += 2;
      else {
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
      } else index += 1;
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
      } else index += 1;
    } else if (character === ";") {
      const statement = sql.slice(start, index).trim();
      if (statement) statements.push(statement);
      start = index + 1;
      index += 1;
    } else index += 1;
  }
  assert.equal(state, "plain", `SQL ended inside ${state}.`);
  const tail = sql.slice(start).trim();
  if (tail) statements.push(tail);
  return statements;
}

function canonicalManifestDigest(entries) {
  return digest(
    Buffer.from(
      `${entries.map(({ name, sha256 }) => `${name} ${sha256}`).join("\n")}\n`,
      "utf8",
    ),
  );
}

export function validateCurrent181SmokeCandidateContract(candidate) {
  assert.equal(candidate.name, CURRENT181);
  assert.match(candidate.sha256, SHA256_PATTERN);
  assert.equal(digest(candidate.content), candidate.sha256);
  assert.match(candidate.text, /^BEGIN;\n/u);
  assert.match(candidate.text, /\nCOMMIT;\n?$/u);
  assert.match(candidate.text, /completed_migration_count IS DISTINCT FROM 180/u);
  assert.match(candidate.text, new RegExp(CURRENT180, "u"));
  assert.match(candidate.text, new RegExp(CURRENT180_MANIFEST_DIGEST, "u"));
  assert.match(candidate.text, new RegExp(CURRENT180_SHA256, "u"));
  assert.match(candidate.text, new RegExp(CURRENT181_CONFIRMATION_GUC.replaceAll(".", "\\."), "u"));
  assert.match(candidate.text, new RegExp(CURRENT181_SHA256_GUC.replaceAll(".", "\\."), "u"));
  assert.match(candidate.text, /\^lp_imtec_\[0-9a-f\]\{32\}_ci\$/u);
  assert.match(candidate.text, new RegExp(CURRENT181_CONFIRMATION, "u"));
  assert.match(candidate.text, /CREATE FUNCTION public\."identity_mail_tenant_lock_v1"/u);
  assert.match(candidate.text, /LEGACY_IDENTITY_MAIL_PRODUCER_RETIRED/u);
  assert.match(candidate.text, /\$postcondition\$/u);
  assert.equal(candidate.metadata.schemaVersion, 1);
  assert.equal(candidate.metadata.contract, "IDENTITY_MAIL_TENANT_LOCK_DRAIN_WORKER_V2_CANDIDATE_V1");
  assert.equal(candidate.metadata.candidate, CURRENT181);
  assert.equal(candidate.metadata.ordinal, 181);
  assert.deepEqual(candidate.metadata.predecessor, {
    count: 180,
    head: CURRENT180,
    manifestDigest: CURRENT180_MANIFEST_DIGEST,
    headChecksum: CURRENT180_SHA256,
  });
  assert.equal(
    candidate.metadata.migrationSqlSha256,
    candidate.sha256,
    "CURRENT181 metadata SHA must equal the exact migration bytes.",
  );
  assert.equal(candidate.metadata.authorization, false);
  assert.equal(candidate.metadata.canMutate, false);
  assert.equal(candidate.metadata.status, "NOT_DEPLOYABLE");
  const statements = splitCurrent181SmokeSql(candidate.text);
  assert.equal(statements[0], "BEGIN");
  assert.equal(statements.at(-1), "COMMIT");
  return Object.freeze({ statementCount: statements.length });
}

export async function readCurrent181SmokeStackPlan() {
  const migrationsDirectory = join(PRISMA_DIRECTORY, "migrations");
  const names = (await readdir(migrationsDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.equal(names.length, CANONICAL_COUNT);
  assert.equal(names.at(-1), CANONICAL_HEAD);
  assert.ok(names.every((name) => MIGRATION_PATTERN.test(name)));
  const entries = [];
  for (const name of names) {
    const raw = await readFile(join(migrationsDirectory, name, "migration.sql"));
    const text = raw.toString("utf8").replaceAll("\r\n", "\n");
    assert.doesNotMatch(text, /\r/u, `${name} has noncanonical line endings.`);
    const content = Buffer.from(text, "utf8");
    entries.push(Object.freeze({ content, name, sha256: digest(content) }));
  }
  assert.equal(entries.at(-1)?.sha256, CANONICAL_HEAD_SHA256);
  assert.equal(canonicalManifestDigest(entries), CANONICAL_MANIFEST_DIGEST);

  const current180Content = await readFile(join(CURRENT180_DIRECTORY, "migration.sql"));
  const current180Metadata = JSON.parse(
    await readFile(join(CURRENT180_DIRECTORY, "candidate.json"), "utf8"),
  );
  assert.equal(digest(current180Content), CURRENT180_SHA256);
  assert.deepEqual(current180Metadata, {
    schemaVersion: 1,
    contract: "IDENTITY_MAIL_TENANT_ENROLLMENT_FOUNDATION_CANDIDATE_V1",
    candidate: CURRENT180,
    ordinal: 180,
    predecessor: {
      count: CANONICAL_COUNT,
      head: CANONICAL_HEAD,
      manifestDigest: CANONICAL_MANIFEST_DIGEST,
      headChecksum: CANONICAL_HEAD_SHA256,
    },
    migrationSqlSha256: CURRENT180_SHA256,
    authorization: false,
    canMutate: false,
    status: "DORMANT_SCHEMA_ONLY",
  });
  const predecessorEntries = [
    ...entries,
    Object.freeze({ content: current180Content, name: CURRENT180, sha256: CURRENT180_SHA256 }),
  ];
  assert.equal(canonicalManifestDigest(predecessorEntries), CURRENT180_MANIFEST_DIGEST);

  const current181Content = await readFile(join(CURRENT181_DIRECTORY, "migration.sql"));
  const current181 = Object.freeze({
    content: current181Content,
    metadata: JSON.parse(
      await readFile(join(CURRENT181_DIRECTORY, "candidate.json"), "utf8"),
    ),
    name: CURRENT181,
    sha256: digest(current181Content),
    text: current181Content.toString("utf8"),
  });
  validateCurrent181SmokeCandidateContract(current181);
  return Object.freeze({
    current180: predecessorEntries.at(-1),
    current181,
    entries: Object.freeze(entries),
    stack: Object.freeze([...predecessorEntries, current181]),
  });
}

export function buildCurrent181SmokeSessionOptions(
  current181Sha256,
  { current181Confirmation = CURRENT181_CONFIRMATION } = {},
) {
  assert.match(current181Sha256, SHA256_PATTERN);
  assert.match(current181Confirmation, /^[a-z0-9-]{1,100}$/u);
  return Object.freeze([
    "-c lock_timeout=5000",
    "-c statement_timeout=300000",
    `-c ${CURRENT180_CONFIRMATION_GUC}=${CURRENT180_CONFIRMATION}`,
    `-c ${CURRENT180_SHA256_GUC}=${CURRENT180_SHA256}`,
    `-c ${CURRENT181_CONFIRMATION_GUC}=${current181Confirmation}`,
    `-c ${CURRENT181_SHA256_GUC}=${current181Sha256}`,
  ]);
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
  for (const entry of plan.stack) {
    const target = join(migrations, entry.name);
    await mkdir(target);
    await writeFile(join(target, "migration.sql"), entry.content, {
      flag: "wx",
    });
  }
  return Object.freeze({ root, schemaPath: join(root, "schema.prisma") });
}

function fencedDatabaseUrl(targetDatabaseUrl, current181Sha256, options = {}) {
  const target = new URL(targetDatabaseUrl);
  const databaseName = decodeURIComponent(
    target.pathname.replace(/^\/+|\/+$/gu, ""),
  );
  assert.match(databaseName, CURRENT181_SMOKE_CLONE_PATTERN);
  target.searchParams.set(
    "options",
    buildCurrent181SmokeSessionOptions(current181Sha256, options).join(" "),
  );
  return target.toString();
}

function runPrismaDeploy(
  schemaPath,
  targetDatabaseUrl,
  current181Sha256,
  stage,
  options = {},
) {
  assert.match(stage, /^[a-z0-9_-]{1,80}$/u);
  const require = createRequire(import.meta.url);
  const prismaCliPath = require.resolve("prisma/build/index.js");
  const sessionOptions = buildCurrent181SmokeSessionOptions(
    current181Sha256,
    options,
  );
  const fencedUrl = fencedDatabaseUrl(
    targetDatabaseUrl,
    current181Sha256,
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
        DATABASE_URL: fencedUrl,
        NODE_ENV: "test",
        NO_COLOR: "1",
        PGOPTIONS: sessionOptions.join(" "),
        PRISMA_HIDE_UPDATE_MESSAGE: "true",
      },
      maxBuffer: 8 * 1024 * 1024,
      timeout: 360_000,
    },
  );
}

function assertPrismaDeploySucceeded(result, stage) {
  assert.equal(result.error, undefined, `${stage}: ${sanitizeCurrent181SmokeError(result.error)}`);
  assert.equal(
    result.status,
    0,
    `${stage}: ${sanitizeCurrent181SmokeError(result.stderr || result.stdout)}`,
  );
}

function assertPrismaDeployFailed(result, stage) {
  assert.equal(result.error, undefined, `${stage}: ${sanitizeCurrent181SmokeError(result.error)}`);
  assert.notEqual(result.status, 0, `${stage} unexpectedly succeeded.`);
  assert.match(`${result.stderr}\n${result.stdout}`, new RegExp(CURRENT181, "u"));
}

async function acquireClusterLock(maintenance) {
  const [row] = await maintenance.$queryRawUnsafe(
    `SELECT pg_catalog.pg_try_advisory_lock($1::INTEGER, $2::INTEGER) AS acquired`,
    CLUSTER_LOCK_CLASS,
    CLUSTER_LOCK_OBJECT,
  );
  assert.equal(row?.acquired, true, "Another CURRENT181 smoke is running.");
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
  assert.match(cloneDatabaseName, CURRENT181_SMOKE_CLONE_PATTERN);
  await maintenance.$executeRawUnsafe(
    `CREATE DATABASE ${quoteIdentifier(cloneDatabaseName)} TEMPLATE ${quoteIdentifier(sourceDatabaseName)}`,
  );
}

async function dropExactClone(maintenance, cloneDatabaseName) {
  assert.match(cloneDatabaseName, CURRENT181_SMOKE_CLONE_PATTERN);
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

function normalizeRows(rows) {
  return JSON.parse(JSON.stringify(rows));
}

function valuesSql(values) {
  return values.map((value) => `(${sqlLiteral(value)})`).join(",\n");
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

async function readV1Prosrc(client) {
  const rows = await client.$queryRawUnsafe(`
    WITH expected("signature") AS (
      VALUES ${valuesSql(V1_PROSRC_PINS.map(({ signature }) => signature))}
    )
    SELECT
      expected."signature" AS signature,
      routine.prosrc AS prosrc
    FROM expected
    LEFT JOIN pg_catalog.pg_proc AS routine
      ON routine.oid = pg_catalog.to_regprocedure(expected."signature")
    ORDER BY expected."signature" COLLATE "C"
  `);
  return rows.map((row) => ({
    sha256: row.prosrc === null ? null : digest(Buffer.from(row.prosrc, "utf8")),
    signature: row.signature,
  }));
}

async function sourceFingerprint(client, expectedDatabaseName) {
  return client.$transaction(
    async (transaction) => {
      await transaction.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      const [server] = await transaction.$queryRawUnsafe(`
        SELECT
          pg_catalog.current_database()::TEXT AS database_name,
          CURRENT_USER::TEXT AS current_user_name,
          pg_catalog.current_setting('server_version_num')::INTEGER AS server_version_number,
          pg_catalog.current_setting('server_version')::TEXT AS server_version,
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
          serverVersion: server.server_version,
          serverVersionNumber: server.server_version_number,
        },
        v1Prosrc: await readV1Prosrc(transaction),
      };
      return Object.freeze({
        digest: digest(Buffer.from(JSON.stringify(projection), "utf8")),
        projection,
      });
    },
    { isolationLevel: "RepeatableRead", maxWait: 5_000, timeout: 30_000 },
  );
}

function assertCanonicalSource(fingerprint) {
  const { business, migrations, server, v1Prosrc } = fingerprint.projection;
  assert.ok(server.serverVersionNumber >= 160_000 && server.serverVersionNumber < 170_000);
  assert.equal(server.currentUserSuperuser, true);
  assert.equal(server.currentUserName, server.ownerName);
  assert.equal(server.isTemplate, false);
  const completed = migrations.filter(({ finished, rolledBack }) => finished && !rolledBack);
  const unfinished = migrations.filter(({ finished, rolledBack }) => !finished && !rolledBack);
  assert.equal(completed.length, CANONICAL_COUNT);
  assert.equal(completed.at(-1)?.name, CANONICAL_HEAD);
  assert.equal(unfinished.length, 0);
  assert.equal(business.enrollment_count, "0");
  assert.equal(business.claimed_count, "0");
  assert.equal(business.command_relation, null);
  assert.equal(business.event_relation, null);
  assert.deepEqual(
    v1Prosrc,
    [...V1_PROSRC_PINS]
      .sort((left, right) => compareText(left.signature, right.signature))
      .map(({ sha256, signature }) => ({ sha256, signature })),
  );
}

async function migrationState(client) {
  const rows = await client.$queryRawUnsafe(`
    SELECT
      "migration_name" AS name,
      "checksum" AS checksum,
      "finished_at" AS finished_at,
      "rolled_back_at" AS rolled_back_at,
      "logs" AS logs,
      "applied_steps_count" AS applied_steps_count
    FROM public."_prisma_migrations"
    ORDER BY "started_at", "id"
  `);
  return rows.map((row) => ({
    appliedStepsCount: row.applied_steps_count,
    checksum: row.checksum,
    finishedAt: row.finished_at,
    logs: row.logs,
    name: row.name,
    rolledBackAt: row.rolled_back_at,
  }));
}

async function current181SurfaceSnapshot(client) {
  const columnPairs = CURRENT181_COLUMNS.map(
    ({ name, table }) => `(${sqlLiteral(table)}, ${sqlLiteral(name)})`,
  ).join(",\n");
  const columns = await client.$queryRawUnsafe(`
    WITH expected("table_name", "column_name") AS (VALUES ${columnPairs})
    SELECT
      expected."table_name" AS table_name,
      expected."column_name" AS column_name,
      pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) AS data_type,
      attribute.attnotnull AS not_null
    FROM expected
    LEFT JOIN pg_catalog.pg_class AS relation
      ON relation.relname = expected."table_name"
     AND relation.relnamespace = pg_catalog.to_regnamespace('public')
    LEFT JOIN pg_catalog.pg_attribute AS attribute
      ON attribute.attrelid = relation.oid
     AND attribute.attname = expected."column_name"
     AND attribute.attnum > 0
     AND NOT attribute.attisdropped
    WHERE attribute.attrelid IS NOT NULL
    ORDER BY expected."table_name", expected."column_name"
  `);
  const indexes = await client.$queryRawUnsafe(`
    WITH expected("index_name") AS (VALUES ${valuesSql(CURRENT181_INDEXES)})
    SELECT
      expected."index_name" AS index_name,
      target_index.indisready AS is_ready,
      target_index.indisunique AS is_unique,
      target_index.indisvalid AS is_valid,
      pg_catalog.pg_get_indexdef(target_index.indexrelid) AS definition
    FROM expected
    LEFT JOIN pg_catalog.pg_class AS index_relation
      ON index_relation.relname = expected."index_name"
     AND index_relation.relnamespace = pg_catalog.to_regnamespace('public')
    LEFT JOIN pg_catalog.pg_index AS target_index
      ON target_index.indexrelid = index_relation.oid
    WHERE target_index.indexrelid IS NOT NULL
    ORDER BY expected."index_name"
  `);
  const functions = await client.$queryRawUnsafe(`
    WITH expected("function_name") AS (VALUES ${valuesSql(CURRENT181_NEW_FUNCTIONS)})
    SELECT
      routine.proname AS function_name,
      pg_catalog.pg_get_function_identity_arguments(routine.oid) AS arguments,
      routine.prosecdef AS security_definer,
      routine.prosrc AS prosrc
    FROM expected
    INNER JOIN pg_catalog.pg_proc AS routine
      ON routine.proname = expected."function_name"
     AND routine.pronamespace = pg_catalog.to_regnamespace('public')
    ORDER BY routine.proname, arguments
  `);
  const constraints = await client.$queryRawUnsafe(`
    SELECT
      target_constraint.conname AS constraint_name,
      pg_catalog.pg_get_constraintdef(target_constraint.oid) AS definition
    FROM pg_catalog.pg_constraint AS target_constraint
    WHERE target_constraint.connamespace = pg_catalog.to_regnamespace('public')
      AND target_constraint.conname IN (
        'identity_mail_outbox_claim_enrollment_binding_check',
        'identity_mail_delivery_event_claim_enrollment_binding_check',
        'identity_mail_tenant_enrollment_command_mutation_check'
      )
    ORDER BY target_constraint.conname
  `);
  const triggers = await client.$queryRawUnsafe(`
    SELECT
      relation.relname AS relation_name,
      target_trigger.tgname AS trigger_name,
      routine.proname AS function_name,
      target_trigger.tgenabled::TEXT AS enabled,
      target_trigger.tgtype::INTEGER AS trigger_type
    FROM pg_catalog.pg_trigger AS target_trigger
    INNER JOIN pg_catalog.pg_class AS relation ON relation.oid = target_trigger.tgrelid
    INNER JOIN pg_catalog.pg_proc AS routine ON routine.oid = target_trigger.tgfoid
    WHERE relation.relnamespace = pg_catalog.to_regnamespace('public')
      AND target_trigger.tgname IN (
        'IdentityMailOutbox_delivery_guard_trigger',
        'IdentityMailOutbox_delivery_event_trigger',
        'IdentityMailEnrollment_00_dormant_guard_trigger'
      )
    ORDER BY relation.relname, target_trigger.tgname
  `);
  const legacy = await client.$queryRawUnsafe(`
    WITH expected("signature") AS (VALUES ${valuesSql(LEGACY_STUBS)})
    SELECT expected."signature" AS signature, routine.prosrc AS prosrc
    FROM expected
    LEFT JOIN pg_catalog.pg_proc AS routine
      ON routine.oid = pg_catalog.to_regprocedure(expected."signature")
    ORDER BY expected."signature" COLLATE "C"
  `);
  const [business] = await client.$queryRawUnsafe(`
    SELECT
      (SELECT pg_catalog.count(*) FROM public."IdentityMailDeliveryTenantEnrollment")::TEXT AS enrollment_count,
      (SELECT pg_catalog.count(*) FROM public."IdentityMailDeliveryTenantEnrollmentCommand")::TEXT AS command_count,
      (SELECT pg_catalog.count(*) FROM public."IdentityMailDeliveryTenantEnrollmentEvent")::TEXT AS event_count,
      (
        SELECT pg_catalog.count(*)
        FROM public."IdentityMailOutbox" AS outbox
        WHERE outbox."status" = 'CLAIMED'::public."IdentityMailOutboxStatus"
      )::TEXT AS claimed_count
  `);
  return normalizeRows({
    business,
    columns,
    constraints,
    functions: functions.map((row) => ({
      arguments: row.arguments,
      function_name: row.function_name,
      prosrc_sha256: digest(Buffer.from(row.prosrc, "utf8")),
      security_definer: row.security_definer,
    })),
    indexes,
    legacy: legacy.map((row) => ({
      prosrc_sha256: row.prosrc === null ? null : digest(Buffer.from(row.prosrc, "utf8")),
      signature: row.signature,
    })),
    migrations: await migrationState(client),
    triggers,
    v1Prosrc: await readV1Prosrc(client),
  });
}

function assertFailurePredecessorState(snapshot, current181Sha256) {
  assert.equal(snapshot.columns.length, 0);
  assert.equal(snapshot.indexes.length, 0);
  assert.equal(snapshot.functions.length, 0);
  assert.equal(
    snapshot.constraints.some(
      ({ constraint_name }) =>
        constraint_name === "identity_mail_outbox_claim_enrollment_binding_check" ||
        constraint_name === "identity_mail_delivery_event_claim_enrollment_binding_check",
    ),
    false,
  );
  const current180Rows = snapshot.migrations.filter(({ name }) => name === CURRENT180);
  const current181Rows = snapshot.migrations.filter(({ name }) => name === CURRENT181);
  assert.equal(current180Rows.length, 1);
  assert.equal(current180Rows[0].checksum, CURRENT180_SHA256);
  assert.ok(current180Rows[0].finishedAt);
  assert.equal(current180Rows[0].rolledBackAt, null);
  assert.equal(current181Rows.length, 1);
  assert.equal(current181Rows[0].checksum, current181Sha256);
  assert.equal(current181Rows[0].finishedAt, null);
  assert.equal(current181Rows[0].rolledBackAt, null);
  assert.equal(current181Rows[0].appliedStepsCount, 0);
  assert.equal(snapshot.business.enrollment_count, "0");
  assert.equal(snapshot.business.command_count, "0");
  assert.equal(snapshot.business.event_count, "0");
  assert.equal(snapshot.business.claimed_count, "0");
}

async function setDiagnosticFences(transaction, current181Sha256) {
  const [row] = await transaction.$queryRawUnsafe(
    `SELECT
       pg_catalog.set_config($1, $2, true) AS current180_confirmation,
       pg_catalog.set_config($3, $4, true) AS current180_sha256,
       pg_catalog.set_config($5, $6, true) AS current181_confirmation,
       pg_catalog.set_config($7, $8, true) AS current181_sha256`,
    CURRENT180_CONFIRMATION_GUC,
    CURRENT180_CONFIRMATION,
    CURRENT180_SHA256_GUC,
    CURRENT180_SHA256,
    CURRENT181_CONFIRMATION_GUC,
    CURRENT181_CONFIRMATION,
    CURRENT181_SHA256_GUC,
    current181Sha256,
  );
  assert.deepEqual(row, {
    current180_confirmation: CURRENT180_CONFIRMATION,
    current180_sha256: CURRENT180_SHA256,
    current181_confirmation: CURRENT181_CONFIRMATION,
    current181_sha256: current181Sha256,
  });
}

async function assertInjectedPostApplyRollback(
  client,
  current181Candidate,
  beforeSnapshot,
) {
  const statements = splitCurrent181SmokeSql(current181Candidate.text);
  assert.equal(statements[0], "BEGIN");
  assert.equal(statements.at(-1), "COMMIT");
  const sentinel = new Error("CURRENT181_INJECTED_POST_APPLY_ROLLBACK");
  let reachedPostcondition = false;
  await assert.rejects(
    client.$transaction(
      async (transaction) => {
        await setDiagnosticFences(transaction, current181Candidate.sha256);
        for (const [index, statement] of statements.slice(1, -1).entries()) {
          try {
            await transaction.$executeRawUnsafe(statement);
          } catch (error) {
            throw new Error(
              `CURRENT181 statement ${index + 2}/${statements.length} failed: ${sanitizeCurrent181SmokeError(error)}`,
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
  const afterSnapshot = await current181SurfaceSnapshot(client);
  assert.deepEqual(afterSnapshot, beforeSnapshot);
  assertFailurePredecessorState(afterSnapshot, current181Candidate.sha256);
}

async function assertSuccessfulMigrationState(client, current181Sha256) {
  const state = await migrationState(client);
  const completed = state.filter(({ finishedAt, rolledBackAt }) => finishedAt && !rolledBackAt);
  const unfinished = state.filter(({ finishedAt, rolledBackAt }) => !finishedAt && !rolledBackAt);
  assert.equal(completed.length, 181);
  assert.equal(completed.at(-1)?.name, CURRENT181);
  assert.equal(completed.at(-1)?.checksum, current181Sha256);
  assert.equal(unfinished.length, 0);
}

async function assertSuccessCatalogAndAcl(client) {
  const snapshot = await current181SurfaceSnapshot(client);
  assert.equal(snapshot.columns.length, CURRENT181_COLUMNS.length);
  for (const column of snapshot.columns) {
    assert.equal(column.not_null, false);
    const expectedType = column.column_name === "claimEnrollmentStateRevision"
      ? "bigint"
      : column.column_name === "claimPolicyRevision"
        ? "integer"
        : "character(64)";
    assert.equal(column.data_type, expectedType);
  }
  assert.equal(snapshot.indexes.length, CURRENT181_INDEXES.length);
  for (const index of snapshot.indexes) {
    assert.equal(index.is_ready, true);
    assert.equal(index.is_valid, true);
    assert.equal(
      index.is_unique,
      index.index_name ===
        "identity_mail_tenant_enrollment_command_rollback_once_uidx",
    );
    assert.match(index.definition, /WHERE/u);
  }
  assert.equal(snapshot.constraints.length, 3);
  const constraintByName = new Map(
    snapshot.constraints.map((constraint) => [
      constraint.constraint_name,
      constraint.definition,
    ]),
  );
  assert.match(
    constraintByName.get(
      "identity_mail_outbox_claim_enrollment_binding_check",
    ),
    /claimEnrollmentStateRevision[\s\S]*claimPolicyRevision[\s\S]*claimProviderAuthorityDigest/u,
  );
  assert.match(
    constraintByName.get(
      "identity_mail_delivery_event_claim_enrollment_binding_check",
    ),
    /claimEnrollmentStateRevision[\s\S]*claimPolicyRevision[\s\S]*claimProviderAuthorityDigest/u,
  );
  assert.match(
    constraintByName.get(
      "identity_mail_tenant_enrollment_command_mutation_check",
    ),
    /DISABLED/u,
  );
  assert.equal(snapshot.functions.length, CURRENT181_NEW_FUNCTIONS.length);
  assert.equal(snapshot.business.enrollment_count, "0");
  assert.equal(snapshot.business.command_count, "0");
  assert.equal(snapshot.business.event_count, "0");
  assert.equal(snapshot.business.claimed_count, "0");
  assert.deepEqual(
    snapshot.v1Prosrc,
    [...V1_PROSRC_PINS]
      .sort((left, right) => compareText(left.signature, right.signature))
      .map(({ sha256, signature }) => ({ sha256, signature })),
  );

  const expectedRows = EXPECTED_FUNCTIONS.map((entry) =>
    `(${sqlLiteral(entry.signature)}, ${entry.securityDefiner ? "true" : "false"}, ${sqlLiteral(entry.result)})`,
  ).join(",\n");
  const routines = await client.$queryRawUnsafe(`
    WITH expected("signature", "security_definer", "result_type") AS (
      VALUES ${expectedRows}
    )
    SELECT
      expected."signature" AS signature,
      routine.oid IS NOT NULL AS exists,
      routine.prosecdef AS security_definer,
      routine.provolatile::TEXT AS volatility,
      routine.proparallel::TEXT AS parallel_safety,
      routine.proconfig AS configuration,
      language.lanname AS language,
      owner.rolname AS owner_name,
      CURRENT_USER::TEXT AS current_user_name,
      pg_catalog.format_type(routine.prorettype, NULL) AS result_type
    FROM expected
    LEFT JOIN pg_catalog.pg_proc AS routine
      ON routine.oid = pg_catalog.to_regprocedure(expected."signature")
    LEFT JOIN pg_catalog.pg_language AS language ON language.oid = routine.prolang
    LEFT JOIN pg_catalog.pg_roles AS owner ON owner.oid = routine.proowner
    ORDER BY expected."signature" COLLATE "C"
  `);
  assert.equal(routines.length, EXPECTED_FUNCTIONS.length);
  for (const routine of routines) {
    const expected = EXPECTED_FUNCTIONS.find(({ signature }) => signature === routine.signature);
    assert.ok(expected);
    assert.equal(routine.exists, true);
    assert.equal(routine.security_definer, expected.securityDefiner);
    assert.equal(routine.volatility, "v");
    assert.equal(routine.parallel_safety, "u");
    assert.deepEqual(routine.configuration, ["search_path=pg_catalog"]);
    assert.equal(routine.language, "plpgsql");
    assert.equal(routine.owner_name, routine.current_user_name);
    assert.equal(routine.result_type, expected.result);
  }

  const allAclSignatures = [
    ...EXPECTED_FUNCTIONS.map(({ signature }) => signature),
    ...V1_PROSRC_PINS.map(({ signature }) => signature),
  ];
  const [functionAcl] = await client.$queryRawUnsafe(`
    WITH required("signature") AS (VALUES ${valuesSql(allAclSignatures)})
    SELECT pg_catalog.count(*)::INTEGER AS unsafe_count
    FROM required
    INNER JOIN pg_catalog.pg_proc AS routine
      ON routine.oid = pg_catalog.to_regprocedure(required."signature")
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(routine.proacl, pg_catalog.acldefault('f', routine.proowner))
    ) AS privilege
    WHERE privilege.privilege_type = 'EXECUTE'
      AND privilege.grantee <> routine.proowner
  `);
  assert.equal(functionAcl.unsafe_count, 0);
  const [relationAcl] = await client.$queryRawUnsafe(`
    WITH required("relation_name") AS (
      VALUES
        ('IdentityMailOutbox'),
        ('IdentityMailDeliveryEvent'),
        ('IdentityMailDeliveryTenantEnrollment'),
        ('IdentityMailDeliveryTenantEnrollmentCommand'),
        ('IdentityMailDeliveryTenantEnrollmentEvent')
    )
    SELECT
      (
        SELECT pg_catalog.count(*)
        FROM required
        INNER JOIN pg_catalog.pg_class AS relation
          ON relation.relname = required."relation_name"
         AND relation.relnamespace = pg_catalog.to_regnamespace('public')
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          COALESCE(relation.relacl, pg_catalog.acldefault('r', relation.relowner))
        ) AS privilege
        WHERE privilege.grantee <> relation.relowner
      )::INTEGER AS unsafe_relation_count,
      (
        SELECT pg_catalog.count(*)
        FROM required
        INNER JOIN pg_catalog.pg_class AS relation
          ON relation.relname = required."relation_name"
         AND relation.relnamespace = pg_catalog.to_regnamespace('public')
        INNER JOIN pg_catalog.pg_attribute AS attribute
          ON attribute.attrelid = relation.oid
         AND attribute.attnum > 0
         AND NOT attribute.attisdropped
        CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) AS privilege
        WHERE privilege.grantee <> relation.relowner
      )::INTEGER AS unsafe_column_count
  `);
  assert.deepEqual(relationAcl, { unsafe_column_count: 0, unsafe_relation_count: 0 });
  for (const legacy of snapshot.legacy) {
    const [row] = await client.$queryRawUnsafe(
      `SELECT pg_catalog.btrim(
         pg_catalog.regexp_replace(routine.prosrc, '[[:space:]]+', ' ', 'g')
       ) AS body
       FROM pg_catalog.pg_proc AS routine
       WHERE routine.oid = pg_catalog.to_regprocedure($1)`,
      legacy.signature,
    );
    assert.equal(row?.body, EXPECTED_STUB_BODY);
  }
  assert.equal(snapshot.triggers.length, 3);
  const triggerByName = new Map(
    snapshot.triggers.map(
      ({ enabled, function_name, trigger_name, trigger_type }) => [
        trigger_name,
        { enabled, functionName: function_name, triggerType: trigger_type },
      ],
    ),
  );
  assert.deepEqual(
    triggerByName.get("IdentityMailEnrollment_00_dormant_guard_trigger"),
    {
      enabled: "O",
      functionName: "identity_mail_tenant_enrollment_registry_dormant_guard_v1",
      triggerType: 30,
    },
  );
  assert.deepEqual(
    triggerByName.get("IdentityMailOutbox_delivery_event_trigger"),
    {
      enabled: "O",
      functionName: "identity_mail_delivery_event_append_v2",
      triggerType: 17,
    },
  );
  assert.deepEqual(
    triggerByName.get("IdentityMailOutbox_delivery_guard_trigger"),
    {
      enabled: "O",
      functionName: "identity_mail_outbox_delivery_guard_v2",
      triggerType: 31,
    },
  );
  return snapshot;
}

async function callTenantLock(transaction, tenantId) {
  const [row] = await transaction.$queryRawUnsafe(
    `SELECT
       public."identity_mail_tenant_lock_v1"($1::TEXT) AS tenant_id,
       pg_catalog.pg_backend_pid()::INTEGER AS pid`,
    tenantId,
  );
  assert.equal(row?.tenant_id, tenantId);
  assert.ok(Number.isInteger(row?.pid));
  return row;
}

async function helperTransaction(
  client,
  tenantId,
  {
    isolationLevel = "Serializable",
    statementTimeout = "30s",
    timeout = 20_000,
    work = null,
  } = {},
) {
  assert.match(statementTimeout, /^(?:[1-9][0-9]*(?:ms|s)|0)$/u);
  return client.$transaction(
    async (transaction) => {
      await transaction.$executeRawUnsafe(
        `SET LOCAL statement_timeout = '${statementTimeout}'`,
      );
      const identity = await callTenantLock(transaction, tenantId);
      if (work) return work(transaction, identity);
      return identity;
    },
    { isolationLevel, maxWait: 5_000, timeout },
  );
}

async function assertHelperCallerProtocol(client) {
  const tenantId = randomUUID();
  await expectSqlState(
    "25001",
    () => helperTransaction(client, tenantId, { isolationLevel: "ReadCommitted" }),
    /requires read-write SERIALIZABLE/iu,
  );
  await expectSqlState(
    "25001",
    () =>
      client.$transaction(
        async (transaction) => {
          await transaction.$executeRawUnsafe("SET TRANSACTION READ ONLY");
          await transaction.$executeRawUnsafe("SET LOCAL statement_timeout = '30s'");
          await callTenantLock(transaction, tenantId);
        },
        { isolationLevel: "Serializable", maxWait: 5_000, timeout: 20_000 },
      ),
    /requires read-write SERIALIZABLE/iu,
  );
  for (const statementTimeout of ["0", "31s"]) {
    await expectSqlState(
      "25001",
      () => helperTransaction(client, tenantId, { statementTimeout }),
      /pre-armed statement_timeout/iu,
    );
  }
  const result = await helperTransaction(client, tenantId, {
    statementTimeout: "30s",
    work: async (transaction, identity) => {
      const [settings] = await transaction.$queryRawUnsafe(`
        SELECT
          pg_catalog.current_setting('transaction_isolation') AS isolation,
          pg_catalog.current_setting('transaction_read_only') AS read_only,
          pg_catalog.current_setting('statement_timeout') AS statement_timeout,
          pg_catalog.current_setting('lock_timeout') AS lock_timeout
      `);
      return { identity, settings };
    },
  });
  assert.equal(result.identity.tenant_id, tenantId);
  assert.deepEqual(result.settings, {
    isolation: "serializable",
    lock_timeout: "5s",
    read_only: "off",
    statement_timeout: "30s",
  });
}

async function assertLegacyStubsReject(client) {
  await expectSqlState(
    "55000",
    () =>
      client.$queryRawUnsafe(`
        SELECT public."identity_owner_invite_issue_hold_v1"(
          NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::INTEGER,
          NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT,
          NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT,
          NULL::BYTEA, NULL::TIMESTAMPTZ
        )
      `),
    /LEGACY_IDENTITY_MAIL_PRODUCER_RETIRED/u,
  );
  await expectSqlState(
    "55000",
    () =>
      client.$queryRawUnsafe(`
        SELECT public."shared_beta_tenant_activate_v1"(
          NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT,
          NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT,
          NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT,
          NULL::TEXT, NULL::TEXT, NULL::BYTEA,
          NULL::TIMESTAMPTZ
        )
      `),
    /LEGACY_IDENTITY_MAIL_PRODUCER_RETIRED/u,
  );
}

function deferredSignal() {
  let resolvePromise;
  let rejectPromise;
  const promise = new Promise((resolve_, reject_) => {
    resolvePromise = resolve_;
    rejectPromise = reject_;
  });
  return Object.freeze({ promise, reject: rejectPromise, resolve: resolvePromise });
}

async function withDeadline(promise, milliseconds, label) {
  let timeoutId;
  const timeout = new Promise((resolve_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error(`${label}_TIMEOUT`)),
      milliseconds,
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timeoutId);
  }
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
  assert.fail(`Backend ${waiterPid} did not wait on holder ${holderPid}.`);
}

async function assertSameTenantSerialization(
  databaseUrl_,
  { rollbackHolder, proveDifferentTenant },
) {
  const observer = prismaClient(databaseUrl_);
  const holder = prismaClient(databaseUrl_);
  const waiter = prismaClient(databaseUrl_);
  const different = prismaClient(databaseUrl_);
  const tenantId = randomUUID();
  const differentTenantId = randomUUID();
  const holderReady = deferredSignal();
  const releaseHolder = deferredSignal();
  const waiterPidReady = deferredSignal();
  const rollbackSentinel = new Error("CURRENT181_HOLDER_ROLLBACK");
  let holderPid = null;
  let waiterPid = null;
  let waiterAcquired = false;
  let holderRun = null;
  let waiterRun = null;
  try {
    await Promise.all([
      observer.$connect(),
      holder.$connect(),
      waiter.$connect(),
      different.$connect(),
    ]);
    holderRun = helperTransaction(holder, tenantId, {
      timeout: 20_000,
      work: async (_transaction, identity) => {
        holderPid = identity.pid;
        holderReady.resolve();
        await releaseHolder.promise;
        if (rollbackHolder) throw rollbackSentinel;
        return identity;
      },
    });
    await withDeadline(holderReady.promise, 4_000, "HOLDER_READY");
    waiterRun = waiter.$transaction(
      async (transaction) => {
        await transaction.$executeRawUnsafe("SET LOCAL statement_timeout = '30s'");
        const [identity] = await transaction.$queryRawUnsafe(
          `SELECT pg_catalog.pg_backend_pid()::INTEGER AS pid`,
        );
        waiterPid = identity.pid;
        waiterPidReady.resolve();
        const acquired = await callTenantLock(transaction, tenantId);
        waiterAcquired = true;
        return acquired;
      },
      { isolationLevel: "Serializable", maxWait: 5_000, timeout: 20_000 },
    );
    await withDeadline(waiterPidReady.promise, 4_000, "WAITER_PID_READY");
    assert.notEqual(waiterPid, holderPid);
    await waitForAdvisoryWait(observer, waiterPid, holderPid);
    assert.equal(waiterAcquired, false);
    if (proveDifferentTenant) {
      const differentResult = await withDeadline(
        helperTransaction(different, differentTenantId),
        4_000,
        "DIFFERENT_TENANT_PROGRESS",
      );
      assert.equal(differentResult.tenant_id, differentTenantId);
      assert.notEqual(differentResult.pid, holderPid);
      assert.notEqual(differentResult.pid, waiterPid);
      assert.equal(waiterAcquired, false);
    }
    releaseHolder.resolve();
    if (rollbackHolder) {
      await assert.rejects(holderRun, (error) => error === rollbackSentinel);
    } else {
      const holderResult = await holderRun;
      assert.equal(holderResult.tenant_id, tenantId);
    }
    const waiterResult = await waiterRun;
    assert.equal(waiterResult.tenant_id, tenantId);
    assert.equal(waiterAcquired, true);
  } finally {
    releaseHolder.resolve();
    await Promise.allSettled(
      [holderRun, waiterRun].filter((operation) => operation !== null),
    );
    await Promise.allSettled([
      observer.$disconnect(),
      holder.$disconnect(),
      waiter.$disconnect(),
      different.$disconnect(),
    ]);
  }
}

async function assertTimeoutRollbackReleases(
  databaseUrl_,
  { expectedSqlState, statementTimeout },
) {
  const holder = prismaClient(databaseUrl_);
  const contender = prismaClient(databaseUrl_);
  const verifier = prismaClient(databaseUrl_);
  const tenantId = randomUUID();
  const holderReady = deferredSignal();
  const releaseHolder = deferredSignal();
  let holderRun = null;
  try {
    await Promise.all([holder.$connect(), contender.$connect(), verifier.$connect()]);
    holderRun = helperTransaction(holder, tenantId, {
      timeout: 20_000,
      work: async (_transaction, identity) => {
        holderReady.resolve();
        await releaseHolder.promise;
        return identity;
      },
    });
    await withDeadline(holderReady.promise, 4_000, "TIMEOUT_HOLDER_READY");
    await expectSqlState(
      expectedSqlState,
      () =>
        helperTransaction(contender, tenantId, {
          statementTimeout,
          timeout: 12_000,
        }),
    );
    releaseHolder.resolve();
    await holderRun;
    const acquired = await helperTransaction(verifier, tenantId);
    assert.equal(acquired.tenant_id, tenantId);
  } finally {
    releaseHolder.resolve();
    if (holderRun) await Promise.allSettled([holderRun]);
    await Promise.allSettled([
      holder.$disconnect(),
      contender.$disconnect(),
      verifier.$disconnect(),
    ]);
  }
}

async function assertConcurrencyContract(databaseUrl_) {
  await assertSameTenantSerialization(databaseUrl_, {
    proveDifferentTenant: true,
    rollbackHolder: false,
  });
  await assertSameTenantSerialization(databaseUrl_, {
    proveDifferentTenant: false,
    rollbackHolder: true,
  });
  await assertTimeoutRollbackReleases(databaseUrl_, {
    expectedSqlState: "57014",
    statementTimeout: "250ms",
  });
  await assertTimeoutRollbackReleases(databaseUrl_, {
    expectedSqlState: "55P03",
    statementTimeout: "30s",
  });
}

async function safeDisconnect(client, cleanupErrors) {
  if (!client) return;
  await client.$disconnect().catch((error) => cleanupErrors.push(error));
}

export async function runCurrent181Smoke() {
  assert.equal(process.env.NODE_ENV, "test", "NODE_ENV=test is required.");
  assert.equal(
    process.env[CURRENT181_SMOKE_CONFIRMATION_ENVIRONMENT],
    CURRENT181_SMOKE_CONFIRMATION,
    `${CURRENT181_SMOKE_CONFIRMATION_ENVIRONMENT} confirmation is required.`,
  );
  const { databaseName: sourceDatabaseName, parsed: sourceUrl } =
    parseCurrent181SmokeSourceUrl(process.env.DATABASE_URL);
  const maintenanceUrl = databaseUrl(sourceUrl, "postgres");
  const successCloneName = generateCurrent181SmokeCloneName();
  const failureCloneName = generateCurrent181SmokeCloneName();
  assert.notEqual(successCloneName, failureCloneName);
  const successUrl = databaseUrl(sourceUrl, successCloneName);
  const failureUrl = databaseUrl(sourceUrl, failureCloneName);
  const plan = await readCurrent181SmokeStackPlan();

  let artifact = null;
  let maintenance = null;
  let source = null;
  let success = null;
  let failure = null;
  let successCreateAttempted = false;
  let failureCreateAttempted = false;
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

    successCreateAttempted = true;
    await createClone(maintenance, sourceDatabaseName, successCloneName);
    failureCreateAttempted = true;
    await createClone(maintenance, sourceDatabaseName, failureCloneName);

    const wrongSha256 = plan.current181.sha256.startsWith("f")
      ? "e".repeat(64)
      : "f".repeat(64);
    const failedDeploy = runPrismaDeploy(
      artifact.schemaPath,
      failureUrl,
      wrongSha256,
      "wrong-current181-sha",
    );
    assertPrismaDeployFailed(failedDeploy, "wrong-current181-sha");
    failure = prismaClient(failureUrl);
    await failure.$connect();
    const failurePredecessor = await current181SurfaceSnapshot(failure);
    assertFailurePredecessorState(
      failurePredecessor,
      plan.current181.sha256,
    );
    await assertInjectedPostApplyRollback(
      failure,
      plan.current181,
      failurePredecessor,
    );
    await failure.$disconnect();
    failure = null;

    const successfulDeploy = runPrismaDeploy(
      artifact.schemaPath,
      successUrl,
      plan.current181.sha256,
      "success-stack",
    );
    assertPrismaDeploySucceeded(successfulDeploy, "success-stack");
    success = prismaClient(successUrl);
    await success.$connect();
    await assertSuccessfulMigrationState(success, plan.current181.sha256);
    await assertSuccessCatalogAndAcl(success);
    await assertLegacyStubsReject(success);
    await assertHelperCallerProtocol(success);
    await success.$disconnect();
    success = null;

    await assertConcurrencyContract(successUrl);
    const finalCandidateBytes = await readFile(
      join(CURRENT181_DIRECTORY, "migration.sql"),
    );
    assert.equal(
      digest(finalCandidateBytes),
      plan.current181.sha256,
      "CURRENT181 migration.sql changed during the rehearsal.",
    );
  } catch (error) {
    primaryError = error;
  } finally {
    await safeDisconnect(success, cleanupErrors);
    success = null;
    await safeDisconnect(failure, cleanupErrors);
    failure = null;
    await safeDisconnect(source, cleanupErrors);
    source = null;

    if (maintenance && failureCreateAttempted) {
      await dropExactClone(maintenance, failureCloneName).catch((error) =>
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
      "CURRENT181 smoke and cleanup both failed.",
    );
  }
  if (primaryError) throw primaryError;
  if (cleanupErrors.length > 0) throw cleanupErrors[0];

  const report = Object.freeze({
    activeDrainingFixture: "SKIPPED_DORMANT_GUARD_NO_COORDINATOR_RPC",
    authorization: false,
    canMutateProduction: false,
    candidateMigration: CURRENT181,
    candidateSha256: plan.current181.sha256,
    catalogAclAndV1PinsPassed: true,
    concurrencyContractPassed: true,
    decision: "CURRENT181_DISPOSABLE_REHEARSAL_PASSED",
    failureCloneCleaned: true,
    failureRollbackZeroResidue: true,
    sourceReadOnlyZeroDiff: true,
    successCloneCleaned: true,
  });
  process.stdout.write(`${JSON.stringify(report)}\n`);
  return report;
}

export async function runCurrent181SmokeSelfTest() {
  const ipv4 = parseCurrent181SmokeSourceUrl(
    "postgresql://postgres:test@127.0.0.1:5432/leetplus_ci?schema=public",
  );
  assert.equal(ipv4.databaseName, "leetplus_ci");
  const ipv6 = parseCurrent181SmokeSourceUrl(
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
    assert.throws(() => parseCurrent181SmokeSourceUrl(invalid));
  }
  const firstClone = generateCurrent181SmokeCloneName();
  const secondClone = generateCurrent181SmokeCloneName();
  assert.match(firstClone, CURRENT181_SMOKE_CLONE_PATTERN);
  assert.match(secondClone, CURRENT181_SMOKE_CLONE_PATTERN);
  assert.notEqual(firstClone, secondClone);
  const plan = await readCurrent181SmokeStackPlan();
  const options = buildCurrent181SmokeSessionOptions(plan.current181.sha256);
  assert.equal(options.length, 6);
  assert.equal(
    options.at(-1),
    `-c ${CURRENT181_SHA256_GUC}=${plan.current181.sha256}`,
  );
  assert.equal(plan.entries.length, CANONICAL_COUNT);
  assert.equal(plan.entries.at(-1)?.name, CANONICAL_HEAD);
  assert.equal(plan.current180.name, CURRENT180);
  assert.equal(plan.current181.name, CURRENT181);
  assert.equal(plan.stack.length, 181);
  const report = Object.freeze({
    authorization: false,
    candidateMigration: CURRENT181,
    candidateSha256: plan.current181.sha256,
    canonicalMigrationCount: CANONICAL_COUNT,
    canonicalMigrationHead: CANONICAL_HEAD,
    decision: "SELF_TEST_PASSED",
    runtimeShaSource: "MIGRATION_SQL_BYTES",
  });
  process.stdout.write(`${JSON.stringify(report)}\n`);
  return report;
}

async function main(argv) {
  const arguments_ = parseCurrent181SmokeArguments(argv);
  if (arguments_.help) {
    process.stdout.write(`${HELP}\n`);
    return;
  }
  if (arguments_.selfTest) {
    await runCurrent181SmokeSelfTest();
    return;
  }
  await runCurrent181Smoke();
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

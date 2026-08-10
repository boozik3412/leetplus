import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  copyFile,
  readFile,
  mkdir,
  mkdtemp,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const SCRIPT_NAME = "identity-mail-delivery-upgrade-smoke";
const REQUIRED_CONFIRMATION = "run-identity-mail-delivery-upgrade-smoke";
const CURRENT_174_COUNT = 174;
const CURRENT_175_COUNT = 175;
const CURRENT_176_COUNT = 176;
const CURRENT_177_COUNT = 177;
const CURRENT_178_COUNT = 178;
const CURRENT_179_COUNT = 179;
const CURRENT_180_COUNT = 180;
const CURRENT_174 = "20260730040000_shared_beta_runtime_release_activation";
const CURRENT_175 = "20260731010000_identity_mail_delivery_status_expand";
const CURRENT_176 = "20260731020000_initial_owner_mail_delivery_boundary";
const CURRENT_177 = "20260731090000_guest_game_case_reward_lifecycle";
const CURRENT_178 = "20260731110000_guest_game_case_reward_contract";
const CURRENT_179 = "20260731120000_identity_mail_delivery_release_head";
const CURRENT_180 = "20260804120000_guest_game_max_pending_rewards";
const MERGE_BASE_REF = "226667f07da6001757589c4777c8bd2aebb84c3d";
const ORIGIN_MAIN_REF = "c5d29360d2c46be2be27a905b460908d811f6855";
const IDENTITY_176_REF = "339be7fe7eaad3c9d28104803858baaa8da7bd2d";
const MERGE_BASE_MANIFEST_DIGEST =
  "3e165fbe37df20fa74837f8b63d4bbcb822d2a24b1f69edb98a906362f0143ad";
const ORIGIN_MAIN_MANIFEST_DIGEST =
  "848fc69b4e3d6175285eeed6e61ba376d3341534379fcee49ddf89a9d6fabcc1";
const IDENTITY_176_MANIFEST_DIGEST =
  "bdbe4e11070302bf2c6f381d8902301009df6ebf2cec9007083f238f5c98472b";
const PRETERMINAL_178_MANIFEST_DIGEST =
  "7f9867971a39e010b2dac03be18fc083dabe67b98d1d6ed15a0cc4540a8cfd14";
const GIT_MIGRATIONS_PATH = "packages/database/prisma/migrations";
const REPOSITORY_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const MIGRATION_PATTERN = /^\d{14}_[a-z0-9_]+$/u;
const SAFE_SOURCE_DATABASE_PATTERN =
  /(?:^|[_-])(?:ci|test|testing|004j)(?:$|[_-])/iu;
const DATABASE_PATTERN =
  /^lp_identity_mail_(?:upgrade|origin|clean|legacy_reject|claim_reject|acl_reject)_ci_[a-f0-9]{16}$/u;
const ROLE_PATTERN = /^lp_identity_mail_(?:worker|hostile|app)_[a-f0-9]{16}$/u;
const TEMP_ROOT_PREFIX = "leetplus-identity-mail-delivery-";
const MIGRATION_TIMEOUT_MS = 10 * 60 * 1000;
const CLUSTER_LOCK_CLASS = 1_281_176_000;
const CLUSTER_LOCK_OBJECT = 176;
const EXACT_STATUS_LABELS = Object.freeze([
  "HOLD",
  "PENDING",
  "CLAIMED",
  "RETRY",
  "SENT",
  "DEAD",
  "CANCELED",
  "RECONCILIATION_REQUIRED",
]);
const CONFIG_DIGEST = "c".repeat(64);
const CONFIG_B_DIGEST = "b".repeat(64);
const MAX_POLICY_CONFIG_DIGEST = "a".repeat(64);
const WRONG_CONFIG_DIGEST = "d".repeat(64);
const WORKER_ACTOR_DIGEST = "e".repeat(64);
const WORKER_ASSERT_SIGNATURE =
  'public."identity_mail_delivery_worker_assert_v1"(TEXT)';
const CLAIM_SIGNATURE =
  'public."identity_initial_owner_mail_claim_v1"(TEXT, TEXT, TEXT, TEXT)';
const PROVIDER_MARK_SIGNATURE =
  'public."identity_initial_owner_mail_provider_mark_v1"(TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT)';
const COMPLETE_SIGNATURE =
  'public."identity_initial_owner_mail_complete_v1"(TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT)';
const REAP_SIGNATURE =
  'public."identity_initial_owner_mail_reap_v1"(TEXT, TEXT, TEXT, INTEGER)';
const SENT_ASSERT_SIGNATURE =
  'public."identity_initial_owner_invite_delivery_assert_sent_v1"(TEXT, TEXT, TEXT)';
const RECONCILE_SIGNATURE =
  'public."identity_initial_owner_mail_reconcile_v1"(TEXT, BIGINT, TEXT, TEXT, TEXT)';
const WORKER_SIGNATURES = Object.freeze([
  WORKER_ASSERT_SIGNATURE,
  CLAIM_SIGNATURE,
  PROVIDER_MARK_SIGNATURE,
  COMPLETE_SIGNATURE,
  REAP_SIGNATURE,
]);
const SEALED_TABLES = Object.freeze([
  "IdentityMailOutbox",
  "IdentityMailDeliveryTenantEnrollment",
  "IdentityMailDeliveryEvent",
]);

const HELP = `
${SCRIPT_NAME}

Local/CI-only PostgreSQL 16 integration and three-history release rehearsal.
It pins the exact merge-base, origin/main, and 339be7f migration manifests,
then proves: (1) exact CURRENT_176 -> separate case expand -> synthetic
source-aware application wave/drain -> case contract -> terminal CURRENT_179;
(2) exact origin/main CURRENT_152, where case migrations already finished,
then 26 identity migrations with started_at head CURRENT_176 -> terminal
CURRENT_179; and (3) a clean historical CURRENT_179-prefix deploy extracted
from the exact canonical CURRENT_180 manifest. The origin/main path proves
the enrolled worker fails before and becomes READY after the terminal migration
without re-enrollment. Every generated database and role is removed in finally.

Usage:
  node scripts/${SCRIPT_NAME}.mjs
  node scripts/${SCRIPT_NAME}.mjs --self-test
  node scripts/${SCRIPT_NAME}.mjs --help

Required environment:
  NODE_ENV=test
  DATABASE_URL=<loopback PostgreSQL 16 test/ci database, schema=public>
  IDENTITY_MAIL_DELIVERY_UPGRADE_SMOKE_CONFIRM=${REQUIRED_CONFIRMATION}

Safety:
  - Production and non-loopback PostgreSQL are rejected.
  - The source database is inspected only; it is never migrated or templated.
  - Only generated lp_identity_mail_* databases and roles may be removed.
  - Provider/network calls are not made and secrets are not printed.
`.trim();

function contractError(code, message = code) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function quoteIdentifier(value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/u.test(value)) {
    contractError("IDENTIFIER_INVALID");
  }
  return `"${value}"`;
}

function assertSafeDatabaseName(value) {
  assert.match(value, DATABASE_PATTERN);
}

function assertSafeRoleName(value) {
  assert.match(value, ROLE_PATTERN);
}

function assertSafeTempRoot(value) {
  const normalized = String(value).replaceAll("\\", "/");
  assert.match(
    normalized,
    new RegExp(`/${TEMP_ROOT_PREFIX.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}`),
  );
}

function parseSafeSourceDatabaseUrl(rawValue) {
  if (typeof rawValue !== "string" || rawValue.length === 0) {
    contractError("DATABASE_URL_REQUIRED");
  }
  let parsed;
  try {
    parsed = new URL(rawValue);
  } catch {
    contractError("DATABASE_URL_INVALID");
  }
  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    contractError("POSTGRESQL_URL_REQUIRED");
  }
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/gu, "");
  if (!new Set(["127.0.0.1", "localhost", "::1"]).has(hostname)) {
    contractError("LOOPBACK_POSTGRESQL_REQUIRED");
  }
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/u, ""));
  if (
    databaseName === "postgres" ||
    !SAFE_SOURCE_DATABASE_PATTERN.test(databaseName)
  ) {
    contractError("TEST_SOURCE_DATABASE_REQUIRED");
  }
  if (
    parsed.hash !== "" ||
    parsed.searchParams.size !== 1 ||
    parsed.searchParams.get("schema") !== "public"
  ) {
    contractError("DATABASE_URL_OPTIONS_INVALID");
  }
  return { parsed, databaseName };
}

function databaseUrl(sourceUrl, databaseName, credentials = null) {
  assertSafeDatabaseName(databaseName);
  const target = new URL(sourceUrl);
  target.pathname = `/${databaseName}`;
  if (credentials) {
    target.username = credentials.roleName;
    target.password = credentials.password;
  }
  target.search = "?schema=public";
  return target.toString();
}

function prismaClient(url) {
  return new PrismaClient({
    datasources: { db: { url } },
    log: [],
  });
}

function sanitize(error) {
  return String(error instanceof Error ? error.message : error)
    .replace(/postgres(?:ql)?:\/\/[^\s")]+/giu, "<redacted-postgresql-url>")
    .replace(/[a-f0-9]{64}/gu, "<redacted-digest>");
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

async function wait(milliseconds) {
  await new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

const gitBlobCache = new Map();

function runGit(args, encoding = null) {
  const result = spawnSync("git", args, {
    cwd: REPOSITORY_ROOT,
    encoding,
    maxBuffer: 32 * 1024 * 1024,
    timeout: 60_000,
    windowsHide: true,
    shell: false,
  });
  if (result.error || result.status !== 0) {
    contractError(
      "GIT_HISTORY_UNAVAILABLE",
      `Exact migration history is unavailable for ${args.at(-1) ?? "ref"}.`,
    );
  }
  return result.stdout;
}

function readGitBlob(objectId) {
  const cached = gitBlobCache.get(objectId);
  if (cached) return cached;
  const content = runGit(["cat-file", "blob", objectId]);
  gitBlobCache.set(objectId, content);
  return content;
}

function readGitMigrationManifest(ref) {
  const tree = runGit(
    ["ls-tree", "-r", ref, "--", GIT_MIGRATIONS_PATH],
    "utf8",
  );
  const entries = tree
    .split(/\r?\n/u)
    .filter((line) => line.endsWith("/migration.sql"))
    .map((line) => {
      const match = /^\d{6} blob ([0-9a-f]{40})\t(.+)$/u.exec(line);
      assert.ok(match, `Unexpected git tree row for ${ref}.`);
      const [, objectId, path] = match;
      const segments = path.split("/");
      const name = segments.at(-2);
      assert.ok(name && MIGRATION_PATTERN.test(name));
      const content = readGitBlob(objectId);
      return Object.freeze({
        name,
        path,
        objectId,
        content,
        sha256: digest(content),
      });
    })
    .sort((left, right) => left.name.localeCompare(right.name));
  assert.equal(new Set(entries.map(({ name }) => name)).size, entries.length);
  const manifestBytes = Buffer.from(
    `${entries.map(({ name, sha256 }) => `${name} ${sha256}`).join("\n")}\n`,
    "utf8",
  );
  return Object.freeze({
    ref,
    count: entries.length,
    head: entries.at(-1)?.name ?? null,
    digest: digest(manifestBytes),
    entries: Object.freeze(entries),
  });
}

async function readWorkingMigrationManifest(sourcePrismaDir) {
  const migrationDirectories = (
    await readdir(join(sourcePrismaDir, "migrations"), {
      withFileTypes: true,
    })
  )
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const entries = [];
  for (const name of migrationDirectories) {
    assert.ok(MIGRATION_PATTERN.test(name));
    const path = join(sourcePrismaDir, "migrations", name, "migration.sql");
    const worktreeContent = await readFile(path);
    const worktreeText = worktreeContent.toString("utf8");
    const gitCleanText = worktreeText.replace(/\r\n/gu, "\n");
    assert.doesNotMatch(
      gitCleanText,
      /\r/u,
      `${name} contains a noncanonical carriage return.`,
    );
    const content = Buffer.from(gitCleanText, "utf8");
    entries.push(
      Object.freeze({ name, path, content, sha256: digest(content) }),
    );
  }
  const manifestBytes = Buffer.from(
    `${entries.map(({ name, sha256 }) => `${name} ${sha256}`).join("\n")}\n`,
    "utf8",
  );
  return Object.freeze({
    ref: "WORKTREE",
    count: entries.length,
    head: entries.at(-1)?.name ?? null,
    digest: digest(manifestBytes),
    entries: Object.freeze(entries),
  });
}

function assertPinnedManifest(manifest, count, digestValue) {
  assert.equal(
    manifest.count,
    count,
    `${manifest.ref} migration count drifted.`,
  );
  assert.equal(
    manifest.digest,
    digestValue,
    `${manifest.ref} migration manifest drifted.`,
  );
}

function entryByName(manifest, migrationName) {
  const entry = manifest.entries.find(({ name }) => name === migrationName);
  assert.ok(entry, `${migrationName} is absent from ${manifest.ref}.`);
  return entry;
}

async function readMigrationPlan() {
  const sourcePrismaDir = fileURLToPath(new URL("../prisma/", import.meta.url));
  const mergeBaseManifest = readGitMigrationManifest(MERGE_BASE_REF);
  const originMainManifest = readGitMigrationManifest(ORIGIN_MAIN_REF);
  const identity176Manifest = readGitMigrationManifest(IDENTITY_176_REF);
  const currentReleaseManifest =
    await readWorkingMigrationManifest(sourcePrismaDir);

  assertPinnedManifest(mergeBaseManifest, 150, MERGE_BASE_MANIFEST_DIGEST);
  assertPinnedManifest(originMainManifest, 152, ORIGIN_MAIN_MANIFEST_DIGEST);
  assertPinnedManifest(
    identity176Manifest,
    CURRENT_176_COUNT,
    IDENTITY_176_MANIFEST_DIGEST,
  );
  assert.equal(identity176Manifest.head, CURRENT_176);
  assert.equal(originMainManifest.head, CURRENT_178);
  assert.equal(currentReleaseManifest.count, CURRENT_180_COUNT);
  assert.equal(currentReleaseManifest.head, CURRENT_180);

  const historicalEntries = Object.freeze(
    currentReleaseManifest.entries.slice(0, CURRENT_179_COUNT),
  );
  const historicalManifestBytes = Buffer.from(
    `${historicalEntries
      .map(({ name, sha256 }) => `${name} ${sha256}`)
      .join("\n")}\n`,
    "utf8",
  );
  const workingManifest = Object.freeze({
    ref: "WORKTREE_CURRENT_179_PREFIX",
    count: historicalEntries.length,
    head: historicalEntries.at(-1)?.name ?? null,
    digest: digest(historicalManifestBytes),
    entries: historicalEntries,
  });
  assert.equal(workingManifest.count, CURRENT_179_COUNT);
  assert.equal(workingManifest.head, CURRENT_179);

  const workingNames = workingManifest.entries.map(({ name }) => name);
  assert.equal(workingNames[CURRENT_174_COUNT - 1], CURRENT_174);
  assert.equal(workingNames[CURRENT_175_COUNT - 1], CURRENT_175);
  assert.equal(workingNames[CURRENT_176_COUNT - 1], CURRENT_176);
  assert.equal(workingNames[CURRENT_177_COUNT - 1], CURRENT_177);
  assert.equal(workingNames[CURRENT_178_COUNT - 1], CURRENT_178);
  assert.equal(workingNames[CURRENT_179_COUNT - 1], CURRENT_179);

  for (const historicalEntry of identity176Manifest.entries) {
    assert.ok(
      entryByName(workingManifest, historicalEntry.name).content.equals(
        historicalEntry.content,
      ),
      `${historicalEntry.name} changed from exact 339be7f.`,
    );
  }
  for (const caseMigration of [CURRENT_177, CURRENT_178]) {
    assert.ok(
      entryByName(workingManifest, caseMigration).content.equals(
        entryByName(originMainManifest, caseMigration).content,
      ),
      `${caseMigration} changed from exact origin/main.`,
    );
  }

  const originNames = new Set(
    originMainManifest.entries.map(({ name }) => name),
  );
  const identityNames = new Set(
    identity176Manifest.entries.map(({ name }) => name),
  );
  const identityPendingOnOrigin = identity176Manifest.entries.filter(
    ({ name }) => !originNames.has(name),
  );
  const originOnly = originMainManifest.entries
    .filter(({ name }) => !identityNames.has(name))
    .map((entry) => entry);
  assert.equal(identityPendingOnOrigin.length, 26);
  assert.deepEqual(
    originOnly.map(({ name }) => name),
    [CURRENT_177, CURRENT_178],
  );
  const merged178Entries = Object.freeze(
    [...identity176Manifest.entries, ...originOnly].sort((left, right) =>
      left.name.localeCompare(right.name),
    ),
  );
  const merged178ManifestBytes = Buffer.from(
    `${merged178Entries
      .map(({ name, sha256 }) => `${name} ${sha256}`)
      .join("\n")}\n`,
    "utf8",
  );
  const merged178Manifest = Object.freeze({
    ref: "MERGED_CURRENT_178",
    count: merged178Entries.length,
    head: merged178Entries.at(-1)?.name ?? null,
    digest: digest(merged178ManifestBytes),
    entries: merged178Entries,
  });
  assert.equal(merged178Manifest.count, CURRENT_178_COUNT);
  assert.equal(merged178Manifest.head, CURRENT_178);
  assert.equal(merged178Manifest.digest, PRETERMINAL_178_MANIFEST_DIGEST);
  const expectedWorkingNames = new Set([
    ...identity176Manifest.entries.map(({ name }) => name),
    ...originMainManifest.entries.map(({ name }) => name),
    CURRENT_179,
  ]);
  assert.equal(expectedWorkingNames.size, CURRENT_179_COUNT);
  assert.deepEqual(
    [...new Set(workingNames)].sort(),
    [...expectedWorkingNames].sort(),
  );
  assert.deepEqual(
    workingNames.filter(
      (name) => !identityNames.has(name) && !originNames.has(name),
    ),
    [CURRENT_179],
  );
  assert.deepEqual(
    workingManifest.entries.slice(0, CURRENT_178_COUNT).map(({ name }) => name),
    merged178Manifest.entries.map(({ name }) => name),
  );
  assert.deepEqual(
    mergeBaseManifest.entries.map(({ name }) => name),
    identity176Manifest.entries.slice(0, 150).map(({ name }) => name),
  );

  return {
    sourcePrismaDir,
    mergeBaseManifest,
    originMainManifest,
    identity176Manifest,
    currentReleaseManifest,
    workingManifest,
    merged178Manifest,
    identityPendingOnOrigin,
  };
}

async function createMigrationArtifact(tempRoot, name, migrationPlan) {
  assertSafeTempRoot(tempRoot);
  assert.match(name, /^[a-z][a-z0-9-]{0,31}$/u);
  const targetPrismaDir = join(tempRoot, `prisma-${name}`);
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
  return {
    schemaPath: join(targetPrismaDir, "schema.prisma"),
    targetMigrationsDir,
  };
}

async function addManifestMigration(artifact, manifest, migrationName) {
  const entry = entryByName(manifest, migrationName);
  const targetDirectory = join(artifact.targetMigrationsDir, migrationName);
  await mkdir(targetDirectory);
  await writeFile(join(targetDirectory, "migration.sql"), entry.content, {
    flag: "wx",
  });
}

async function seedManifest(artifact, manifest, entries = manifest.entries) {
  for (const { name } of entries) {
    await addManifestMigration(artifact, manifest, name);
  }
}

function runMigrateDeploy(schemaPath, targetDatabaseUrl, stage) {
  assert.match(stage, /^[a-z0-9_-]{1,80}$/u);
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
        DATABASE_URL: targetDatabaseUrl,
        NODE_ENV: "test",
        PGOPTIONS: "-c lock_timeout=5000 -c statement_timeout=180000",
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
      `Migration deploy stage ${stage} failed with status ${result.status ?? "unknown"}; output suppressed.`,
    );
  }
}

function runSqlFileExpectFailure(
  schemaPath,
  sqlFilePath,
  targetDatabaseUrl,
  expectedPattern,
) {
  const require = createRequire(import.meta.url);
  const prismaCliPath = require.resolve("prisma/build/index.js");
  const result = spawnSync(
    process.execPath,
    [
      prismaCliPath,
      "db",
      "execute",
      "--schema",
      schemaPath,
      "--file",
      sqlFilePath,
    ],
    {
      cwd: dirname(schemaPath),
      encoding: "utf8",
      env: {
        ...process.env,
        DATABASE_URL: targetDatabaseUrl,
        NODE_ENV: "test",
        PGOPTIONS: "-c lock_timeout=5000 -c statement_timeout=180000",
        NO_COLOR: "1",
        PRISMA_HIDE_UPDATE_MESSAGE: "true",
      },
      maxBuffer: 4 * 1024 * 1024,
      timeout: MIGRATION_TIMEOUT_MS,
      windowsHide: true,
      shell: false,
    },
  );
  assert.equal(result.signal, null);
  assert.equal(result.error, undefined);
  assert.notEqual(result.status, 0, "Hostile migration unexpectedly passed.");
  const output = `${result.stdout}\n${result.stderr}`;
  assert.doesNotMatch(output, /postgres(?:ql)?:\/\//iu);
  assert.match(output, expectedPattern);
  return result.status;
}

async function assertTestSuperuser(admin, expectedDatabaseName) {
  const [row] = await admin.$queryRawUnsafe(
    `SELECT
       pg_catalog.current_database() AS database_name,
       pg_catalog.current_setting('server_version_num')::INTEGER
         AS server_version_number,
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
       $1::INTEGER,
       $2::INTEGER
     ) AS acquired`,
    CLUSTER_LOCK_CLASS,
    CLUSTER_LOCK_OBJECT,
  );
  assert.equal(row?.acquired, true, "Another identity-mail smoke is running.");
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

async function hardenDatabasePublicAuthority(admin, databaseName) {
  assertSafeDatabaseName(databaseName);
  await admin.$executeRawUnsafe(
    `REVOKE CREATE, TEMPORARY ON DATABASE ${quoteIdentifier(
      databaseName,
    )} FROM PUBLIC`,
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

async function roleOid(admin, roleName) {
  assertSafeRoleName(roleName);
  const [row] = await admin.$queryRawUnsafe(
    `SELECT oid::BIGINT AS oid
     FROM pg_catalog.pg_roles
     WHERE rolname = $1`,
    roleName,
  );
  assert.ok(row?.oid);
  return row.oid;
}

async function grantRoleConnection(admin, databaseName, roleName) {
  assertSafeDatabaseName(databaseName);
  assertSafeRoleName(roleName);
  await admin.$executeRawUnsafe(
    `GRANT CONNECT ON DATABASE ${quoteIdentifier(
      databaseName,
    )} TO ${quoteIdentifier(roleName)}`,
  );
}

async function readMigrationState(client) {
  const rows = await client.$queryRawUnsafe(
    `SELECT "migration_name"
     FROM "_prisma_migrations"
     WHERE "finished_at" IS NOT NULL
       AND "rolled_back_at" IS NULL
     ORDER BY "started_at", "migration_name"`,
  );
  const [unfinished] = await client.$queryRawUnsafe(
    `SELECT pg_catalog.count(*) FILTER (
       WHERE "finished_at" IS NULL
         AND "rolled_back_at" IS NULL
     )::INTEGER AS count
     FROM "_prisma_migrations"`,
  );
  return {
    count: rows.length,
    head: rows.at(-1)?.migration_name ?? null,
    unfinished: Number(unfinished?.count ?? -1),
  };
}

async function assertMigrationState(client, count, head) {
  assert.deepEqual(await readMigrationState(client), {
    count,
    head,
    unfinished: 0,
  });
}

async function readMigrationOrderEvidence(client) {
  const [row] = await client.$queryRawUnsafe(`
    SELECT
      pg_catalog.count(*) FILTER (
        WHERE "finished_at" IS NOT NULL
          AND "rolled_back_at" IS NULL
      )::INTEGER AS completed_count,
      (
        SELECT migration."migration_name"
        FROM public."_prisma_migrations" AS migration
        WHERE migration."finished_at" IS NOT NULL
          AND migration."rolled_back_at" IS NULL
        ORDER BY
          migration."started_at" DESC,
          migration."migration_name" DESC
        LIMIT 1
      ) AS started_at_head,
      pg_catalog.max("migration_name") FILTER (
        WHERE "finished_at" IS NOT NULL
          AND "rolled_back_at" IS NULL
      ) AS lexical_head,
      pg_catalog.count(*) FILTER (
        WHERE "finished_at" IS NULL
          AND "rolled_back_at" IS NULL
      )::INTEGER AS unfinished_count
    FROM public."_prisma_migrations"
  `);
  return {
    completedCount: Number(row?.completed_count ?? -1),
    startedAtHead: row?.started_at_head ?? null,
    lexicalHead: row?.lexical_head ?? null,
    unfinishedCount: Number(row?.unfinished_count ?? -1),
  };
}

async function assertDatabaseMigrationManifest(client, expectedManifest) {
  const [integrity] = await client.$queryRawUnsafe(`
    SELECT
      pg_catalog.count(*)::INTEGER AS total_count,
      pg_catalog.count(*) FILTER (
        WHERE "rolled_back_at" IS NOT NULL
      )::INTEGER AS rolled_back_count,
      pg_catalog.count(*) FILTER (
        WHERE "finished_at" IS NULL
          AND "rolled_back_at" IS NULL
      )::INTEGER AS unfinished_count,
      (
        SELECT pg_catalog.count(*)::INTEGER
        FROM (
          SELECT "migration_name"
          FROM public."_prisma_migrations"
          WHERE "finished_at" IS NOT NULL
            AND "rolled_back_at" IS NULL
          GROUP BY "migration_name"
          HAVING pg_catalog.count(*) <> 1
        ) AS duplicate_name
      ) AS duplicate_completed_name_count
    FROM public."_prisma_migrations"
  `);
  assert.deepEqual(
    {
      totalCount: Number(integrity?.total_count ?? -1),
      rolledBackCount: Number(integrity?.rolled_back_count ?? -1),
      unfinishedCount: Number(integrity?.unfinished_count ?? -1),
      duplicateCompletedNameCount: Number(
        integrity?.duplicate_completed_name_count ?? -1,
      ),
    },
    {
      totalCount: expectedManifest.count,
      rolledBackCount: 0,
      unfinishedCount: 0,
      duplicateCompletedNameCount: 0,
    },
  );
  const rows = await client.$queryRawUnsafe(`
    SELECT "migration_name", "checksum"
    FROM public."_prisma_migrations"
    WHERE "finished_at" IS NOT NULL
      AND "rolled_back_at" IS NULL
    ORDER BY "migration_name"
  `);
  const actualRows = rows.map((row) => ({
    name: row.migration_name,
    sha256: row.checksum,
  }));
  const expectedRows = expectedManifest.entries.map(({ name, sha256 }) => ({
    name,
    sha256,
  }));
  assert.deepEqual(actualRows, expectedRows);
  const manifestBytes = Buffer.from(
    `${actualRows.map(({ name, sha256 }) => `${name} ${sha256}`).join("\n")}\n`,
    "utf8",
  );
  const manifestDigest = digest(manifestBytes);
  assert.equal(manifestDigest, expectedManifest.digest);
  return {
    count: actualRows.length,
    head: actualRows.at(-1)?.name ?? null,
    digest: manifestDigest,
  };
}

async function readCurrent176RollbackFingerprint(client) {
  const [row] = await client.$queryRawUnsafe(`
    SELECT
      pg_catalog.md5(COALESCE((
        SELECT pg_catalog.string_agg(
          pg_catalog.concat_ws(
            '|',
            relation.relname,
            attribute.attnum::TEXT,
            attribute.attname,
            pg_catalog.format_type(
              attribute.atttypid,
              attribute.atttypmod
            ),
            attribute.attnotnull::TEXT,
            COALESCE(attribute.attacl::TEXT, '-')
          ),
          E'\n' ORDER BY relation.relname, attribute.attnum
        )
        FROM pg_catalog.pg_attribute AS attribute
        INNER JOIN pg_catalog.pg_class AS relation
          ON relation.oid = attribute.attrelid
        INNER JOIN pg_catalog.pg_namespace AS namespace
          ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public'
          AND attribute.attnum > 0
          AND attribute.attisdropped = false
      ), '')) AS column_digest,
      pg_catalog.md5(COALESCE((
        SELECT pg_catalog.string_agg(
          pg_catalog.concat_ws(
            '|',
            relation.relname,
            target_constraint.conname,
            target_constraint.convalidated::TEXT,
            pg_catalog.pg_get_constraintdef(target_constraint.oid)
          ),
          E'\n' ORDER BY relation.relname, target_constraint.conname
        )
        FROM pg_catalog.pg_constraint AS target_constraint
        INNER JOIN pg_catalog.pg_class AS relation
          ON relation.oid = target_constraint.conrelid
        INNER JOIN pg_catalog.pg_namespace AS namespace
          ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public'
      ), '')) AS constraint_digest,
      pg_catalog.md5(COALESCE((
        SELECT pg_catalog.string_agg(
          pg_catalog.concat_ws(
            '|',
            routine.proname,
            pg_catalog.pg_get_function_identity_arguments(routine.oid),
            routine.prosecdef::TEXT,
            routine.provolatile::TEXT,
            COALESCE(routine.proconfig::TEXT, '-'),
            COALESCE(routine.proacl::TEXT, '-'),
            pg_catalog.pg_get_functiondef(routine.oid)
          ),
          E'\n' ORDER BY
            routine.proname,
            pg_catalog.pg_get_function_identity_arguments(routine.oid)
        )
        FROM pg_catalog.pg_proc AS routine
        INNER JOIN pg_catalog.pg_namespace AS namespace
          ON namespace.oid = routine.pronamespace
        WHERE namespace.nspname = 'public'
      ), '')) AS function_digest,
      pg_catalog.md5(COALESCE((
        SELECT pg_catalog.string_agg(
          pg_catalog.concat_ws(
            '|',
            relation.relname,
            target_trigger.tgname,
            target_trigger.tgenabled::TEXT,
            pg_catalog.pg_get_triggerdef(target_trigger.oid)
          ),
          E'\n' ORDER BY relation.relname, target_trigger.tgname
        )
        FROM pg_catalog.pg_trigger AS target_trigger
        INNER JOIN pg_catalog.pg_class AS relation
          ON relation.oid = target_trigger.tgrelid
        INNER JOIN pg_catalog.pg_namespace AS namespace
          ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public'
          AND target_trigger.tgisinternal = false
      ), '')) AS trigger_digest,
      pg_catalog.md5(COALESCE((
        SELECT pg_catalog.string_agg(
          pg_catalog.row_to_json(identity_claim)::TEXT,
          E'\n' ORDER BY identity_claim."emailCanonical"
        )
        FROM public."IdentityEmailClaim" AS identity_claim
      ), '')) AS claim_data_digest,
      pg_catalog.md5(COALESCE((
        SELECT pg_catalog.string_agg(
          pg_catalog.row_to_json(target_outbox)::TEXT,
          E'\n' ORDER BY target_outbox."id"
        )
        FROM public."IdentityMailOutbox" AS target_outbox
      ), '')) AS outbox_data_digest,
      pg_catalog.md5(COALESCE((
        SELECT pg_catalog.string_agg(
          pg_catalog.row_to_json(target_invite)::TEXT,
          E'\n' ORDER BY target_invite."id"
        )
        FROM public."UserInvite" AS target_invite
      ), '')) AS invite_data_digest,
      (
        SELECT pg_catalog.count(*)::INTEGER
        FROM public."_prisma_migrations"
        WHERE "migration_name" =
          '20260731020000_initial_owner_mail_delivery_boundary'
      ) AS current_176_row_count
  `);
  return {
    ...row,
    migration: await readMigrationState(client),
  };
}

async function readStatusLabels(client) {
  const rows = await client.$queryRawUnsafe(
    `SELECT enum_value.enumlabel
     FROM pg_catalog.pg_enum AS enum_value
     INNER JOIN pg_catalog.pg_type AS enum_type
       ON enum_type.oid = enum_value.enumtypid
     INNER JOIN pg_catalog.pg_namespace AS namespace
       ON namespace.oid = enum_type.typnamespace
     WHERE namespace.nspname = 'public'
       AND enum_type.typname = 'IdentityMailOutboxStatus'
     ORDER BY enum_value.enumsortorder`,
  );
  return rows.map((row) => row.enumlabel);
}

async function relationExists(client, relationName) {
  const [row] = await client.$queryRawUnsafe(
    `SELECT pg_catalog.to_regclass($1)::TEXT AS relation_name`,
    `public."${relationName}"`,
  );
  return row?.relation_name !== null;
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function deliveryFixture(tenantId, suffix, status = "PENDING") {
  const now = Date.now();
  const createdAt = new Date(now - 120_000);
  const releasedAt = status === "PENDING" ? new Date(now - 60_000) : null;
  const rawToken = randomBytes(32).toString("base64url");
  const inviteId = randomUUID();
  const reservationSubjectId = randomUUID();
  return {
    tenantId,
    tenantName: `Identity mail ${suffix}`,
    tenantSlug: `identity-mail-${suffix}`,
    email: `${suffix}@identity-mail.example.test`,
    workflowLocator: reservationSubjectId,
    reservationSubjectId,
    inviteId,
    commandId: randomUUID(),
    outboxId: randomUUID(),
    requestId: randomUUID(),
    requestDigest: randomBytes(32).toString("hex"),
    messageKey: randomUUID(),
    tokenHash: digest(rawToken),
    ciphertext: Buffer.concat([Buffer.from([1]), randomBytes(70)]),
    createdAt,
    releasedAt,
    expiresAt: new Date(now + 60 * 60 * 1000),
    status,
  };
}

async function insertTenant(client, fixture) {
  await client.$executeRawUnsafe(
    `INSERT INTO public."Tenant" (
       "id", "name", "slug", "status", "customerStage",
       "onboardingStatus", "trialStartsAt", "trialEndsAt",
       "createdAt", "updatedAt"
     )
     VALUES (
       $1, $2, $3,
       'ACTIVE'::public."TenantLifecycleStatus",
       'PILOT'::public."TenantCustomerStage",
       'OWNER_INVITED'::public."TenantOnboardingStatus",
       $4, $5, $6, $6
     )`,
    fixture.tenantId,
    fixture.tenantName,
    fixture.tenantSlug,
    new Date(Date.now() - 60 * 60 * 1000),
    new Date(Date.now() + 60 * 60 * 1000),
    fixture.createdAt,
  );
}

async function assertPost176HoldWriterCompatibility(databaseAdmin, suffix) {
  const fixture = deliveryFixture(
    randomUUID(),
    `${suffix}-post176-hold-writer`,
    "HOLD",
  );
  await insertTenant(databaseAdmin, fixture);
  await databaseAdmin.$executeRawUnsafe(
    `INSERT INTO public."IdentityEmailClaim" (
       "emailCanonical", "claimType", "tenantId", "subjectId",
       "workflowLocator", "revision", "createdAt", "updatedAt"
     )
     VALUES (
       $1, 'INVITE'::public."IdentityEmailClaimType",
       $2, $3, $3, 1,
       pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp()
     )`,
    fixture.email,
    fixture.tenantId,
    fixture.reservationSubjectId,
  );
  const issue = () =>
    databaseAdmin
      .$queryRawUnsafe(
        `SELECT public."identity_owner_invite_issue_hold_v1"(
           CAST($1 AS TEXT), CAST($2 AS TEXT), CAST($3 AS TEXT),
           CAST($4 AS INTEGER), CAST($5 AS TEXT), CAST($6 AS TEXT),
           CAST($7 AS TEXT), CAST($8 AS TEXT), CAST($9 AS TEXT),
           CAST($10 AS TEXT), CAST($11 AS TEXT), CAST($12 AS TEXT),
           CAST($13 AS BYTEA), CAST($14 AS TIMESTAMPTZ)
         ) AS receipt`,
        fixture.workflowLocator,
        fixture.tenantId,
        fixture.reservationSubjectId,
        1,
        fixture.requestId,
        fixture.requestDigest,
        "ci",
        fixture.commandId,
        fixture.inviteId,
        fixture.outboxId,
        fixture.messageKey,
        fixture.tokenHash,
        fixture.ciphertext,
        fixture.expiresAt,
      )
      .then((rows) => rows[0]?.receipt);

  const created = await issue();
  assert.equal(created.decision, "CREATED");
  assert.equal(created.outboxStatus, "HOLD");
  assert.equal(created.outboxId, fixture.outboxId);
  const [state] = await databaseAdmin.$queryRawUnsafe(
    `SELECT
       "status"::TEXT AS status,
       "attempts" AS attempts,
       "transitionRevision" AS transition_revision,
       "releasedAt" AS released_at,
       "availableAt" AS available_at,
       "createdAt" = "updatedAt" AS timestamps_equal
     FROM public."IdentityMailOutbox"
     WHERE "id" = $1`,
    fixture.outboxId,
  );
  assert.deepEqual(state, {
    status: "HOLD",
    attempts: 0,
    transition_revision: 0n,
    released_at: null,
    available_at: null,
    timestamps_equal: true,
  });
  const replayed = await issue();
  assert.equal(replayed.decision, "REPLAYED");
  const [count] = await databaseAdmin.$queryRawUnsafe(
    `SELECT pg_catalog.count(*)::INTEGER AS count
     FROM public."IdentityMailOutbox"
     WHERE "id" = $1`,
    fixture.outboxId,
  );
  assert.equal(Number(count.count), 1);
  return {
    createdDecision: created.decision,
    replayDecision: replayed.decision,
    outboxStatus: state.status,
    timestampsEqual: state.timestamps_equal,
  };
}

async function insertDeliveryAggregate(
  client,
  fixture,
  { tenantExists = false, current176 = false } = {},
) {
  if (!tenantExists) await insertTenant(client, fixture);
  await client.$executeRawUnsafe(
    `INSERT INTO public."UserInvite" (
       "id", "tenantId", "email", "role", "accessScope",
       "customRoleId", "storeIds", "tokenHash", "expiresAt",
       "identityClaimRevision", "createdAt", "updatedAt"
     )
     VALUES (
       $1, $2, $3, 'OWNER'::public."UserRole",
       'NETWORK'::public."UserAccessScope", NULL, ARRAY[]::TEXT[],
       $4, $5, 2, $6, $6
     )`,
    fixture.inviteId,
    fixture.tenantId,
    fixture.email,
    fixture.tokenHash,
    fixture.expiresAt,
    fixture.createdAt,
  );
  await client.$executeRawUnsafe(
    `INSERT INTO public."IdentityEmailClaim" (
       "emailCanonical", "claimType", "tenantId", "subjectId",
       "workflowLocator", "revision", "createdAt", "updatedAt"
     )
     VALUES (
       $1, 'INVITE'::public."IdentityEmailClaimType",
       $2, $3, $4, 1, $5, $5
     )`,
    fixture.email,
    fixture.tenantId,
    fixture.reservationSubjectId,
    fixture.workflowLocator,
    fixture.createdAt,
  );
  await client.$executeRawUnsafe(
    `UPDATE public."IdentityEmailClaim"
     SET
       "subjectId" = $1,
       "revision" = 2
     WHERE "emailCanonical" = $2
       AND "tenantId" = $3
       AND "subjectId" = $4
       AND "revision" = 1`,
    fixture.inviteId,
    fixture.email,
    fixture.tenantId,
    fixture.reservationSubjectId,
  );
  await client.$executeRawUnsafe(
    `INSERT INTO public."IdentityOwnerInviteIssueCommand" (
       "id", "tenantId", "action", "requestId", "issueRequestDigest",
       "aadEnvironment", "workflowLocator", "reservationSubjectId",
       "reservationClaimRevision", "inviteId", "outboxId", "messageKey",
       "tokenHash", "tokenDigestVersion", "template", "envelopeVersion",
       "keyVersion", "expiresAt", "claimRevision", "createdAt"
     )
     VALUES (
       $1, $2, 'ISSUE_INITIAL_OWNER_INVITE', $3, $4,
       'ci', $5, $6, 1, $7, $8, $9, $10, 'sha256-v1',
       'INITIAL_OWNER_INVITE'::public."IdentityMailTemplate",
       1, 'v1', $11, 2, $12
     )`,
    fixture.commandId,
    fixture.tenantId,
    fixture.requestId,
    fixture.requestDigest,
    fixture.workflowLocator,
    fixture.reservationSubjectId,
    fixture.inviteId,
    fixture.outboxId,
    fixture.messageKey,
    fixture.tokenHash,
    fixture.expiresAt,
    fixture.createdAt,
  );
  if (current176) {
    assert.ok(
      fixture.status === "HOLD" || fixture.status === "PENDING",
      "CURRENT_176 synthetic fixture supports only HOLD/PENDING setup.",
    );
    await client.$executeRawUnsafe(
      `INSERT INTO public."IdentityMailOutbox" (
         "id", "tenantId", "issueCommandId", "inviteId",
         "workflowLocator", "aadEnvironment", "template", "status",
         "messageKey", "issueRequestDigest", "tokenHash",
         "tokenDigestVersion", "secretCiphertext", "envelopeVersion",
         "keyVersion", "expiresAt", "releasedAt", "transitionRevision",
         "availableAt", "createdAt", "updatedAt"
       )
         VALUES (
         $1, $2, $3, $4, $5, 'ci',
         'INITIAL_OWNER_INVITE'::public."IdentityMailTemplate",
         'HOLD'::public."IdentityMailOutboxStatus", $6, $7, $8,
         'sha256-v1', $9, 1, 'v1', $10, NULL, 0, NULL,
         $11, $11
       )`,
      fixture.outboxId,
      fixture.tenantId,
      fixture.commandId,
      fixture.inviteId,
      fixture.workflowLocator,
      fixture.messageKey,
      fixture.requestDigest,
      fixture.tokenHash,
      fixture.ciphertext,
      fixture.expiresAt,
      fixture.createdAt,
    );
    if (fixture.status === "PENDING") {
      await withOutboxDeliveryTriggersDisabled(client, () =>
        client.$executeRawUnsafe(
          `UPDATE public."IdentityMailOutbox"
           SET "status" = 'PENDING'::public."IdentityMailOutboxStatus",
               "releasedAt" = $2,
               "transitionRevision" = 1,
               "availableAt" = $2,
               "updatedAt" = $2
           WHERE "id" = $1`,
          fixture.outboxId,
          fixture.releasedAt,
        ),
      );
    }
  } else {
    await client.$executeRawUnsafe(
      `INSERT INTO public."IdentityMailOutbox" (
         "id", "tenantId", "issueCommandId", "inviteId",
         "workflowLocator", "aadEnvironment", "template", "status",
         "messageKey", "issueRequestDigest", "tokenHash",
         "tokenDigestVersion", "secretCiphertext", "envelopeVersion",
         "keyVersion", "expiresAt", "releasedAt", "createdAt"
       )
       VALUES (
         $1, $2, $3, $4, $5, 'ci',
         'INITIAL_OWNER_INVITE'::public."IdentityMailTemplate",
         $6::public."IdentityMailOutboxStatus", $7, $8, $9,
         'sha256-v1', $10, 1, 'v1', $11, $12, $13
       )`,
      fixture.outboxId,
      fixture.tenantId,
      fixture.commandId,
      fixture.inviteId,
      fixture.workflowLocator,
      fixture.status,
      fixture.messageKey,
      fixture.requestDigest,
      fixture.tokenHash,
      fixture.ciphertext,
      fixture.expiresAt,
      fixture.releasedAt,
      fixture.createdAt,
    );
  }
}

async function insertOrdinaryInvite(client, tenantId, suffix) {
  const inviteId = randomUUID();
  await client.$executeRawUnsafe(
    `INSERT INTO public."UserInvite" (
       "id", "tenantId", "email", "role", "accessScope", "storeIds",
       "tokenHash", "expiresAt", "createdAt", "updatedAt"
     )
     VALUES (
       $1, $2, $3, 'MANAGER'::public."UserRole",
       'NETWORK'::public."UserAccessScope", ARRAY[]::TEXT[],
       $4, $5, pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp()
     )`,
    inviteId,
    tenantId,
    `${suffix}@identity-mail.example.test`,
    digest(`${suffix}:${randomUUID()}`),
    new Date(Date.now() + 60 * 60 * 1000),
  );
  return inviteId;
}

async function insertBareInvite(
  client,
  { tenantId, suffix, role = "MANAGER", acceptedAt = null },
) {
  const inviteId = randomUUID();
  await client.$executeRawUnsafe(
    `INSERT INTO public."UserInvite" (
       "id", "tenantId", "email", "role", "accessScope",
       "customRoleId", "storeIds", "tokenHash", "expiresAt",
       "acceptedAt", "createdAt", "updatedAt"
     )
     VALUES (
       $1, $2, $3, $4::public."UserRole",
       'NETWORK'::public."UserAccessScope", NULL, ARRAY[]::TEXT[],
       $5, $6, $7, pg_catalog.clock_timestamp(),
       pg_catalog.clock_timestamp()
     )`,
    inviteId,
    tenantId,
    `${suffix}@identity-mail.example.test`,
    role,
    digest(`${suffix}:${randomUUID()}`),
    new Date(Date.now() + 60 * 60 * 1000),
    acceptedAt,
  );
  return inviteId;
}

function callClaim(
  client,
  tenantId,
  leaseOwnerDigest,
  leaseTokenDigest,
  providerAuthorityDigest,
) {
  return client
    .$queryRawUnsafe(
      `SELECT public."identity_initial_owner_mail_claim_v1"(
         CAST($1 AS TEXT),
         CAST($2 AS TEXT),
         CAST($3 AS TEXT),
         CAST($4 AS TEXT)
       ) AS receipt`,
      tenantId,
      leaseOwnerDigest,
      leaseTokenDigest,
      providerAuthorityDigest,
    )
    .then((rows) => rows[0]?.receipt);
}

function callWorkerAssert(client, tenantId) {
  return client
    .$queryRawUnsafe(
      `SELECT public."identity_mail_delivery_worker_assert_v1"(
         CAST($1 AS TEXT)
       ) AS receipt`,
      tenantId,
    )
    .then((rows) => rows[0]?.receipt);
}

function callProviderMark(
  client,
  {
    outboxId,
    leaseVersion,
    leaseOwnerDigest,
    leaseTokenDigest,
    providerAttemptKey,
    providerAuthorityDigest,
    messageIdDigest,
  },
) {
  return client
    .$queryRawUnsafe(
      `SELECT public."identity_initial_owner_mail_provider_mark_v1"(
         CAST($1 AS TEXT),
         CAST($2 AS INTEGER),
         CAST($3 AS TEXT),
         CAST($4 AS TEXT),
         CAST($5 AS TEXT),
         CAST($6 AS TEXT),
         CAST($7 AS TEXT)
       ) AS receipt`,
      outboxId,
      leaseVersion,
      leaseOwnerDigest,
      leaseTokenDigest,
      providerAttemptKey,
      providerAuthorityDigest,
      messageIdDigest,
    )
    .then((rows) => rows[0]?.receipt);
}

function callComplete(
  client,
  {
    outboxId,
    leaseVersion,
    leaseOwnerDigest,
    leaseTokenDigest,
    outcomeCode,
    providerReceiptDigest = null,
    terminalAckDigest = null,
  },
) {
  return client
    .$queryRawUnsafe(
      `SELECT public."identity_initial_owner_mail_complete_v1"(
         CAST($1 AS TEXT),
         CAST($2 AS INTEGER),
         CAST($3 AS TEXT),
         CAST($4 AS TEXT),
         CAST($5 AS TEXT),
         CAST($6 AS TEXT),
         CAST($7 AS TEXT)
       ) AS receipt`,
      outboxId,
      leaseVersion,
      leaseOwnerDigest,
      leaseTokenDigest,
      outcomeCode,
      providerReceiptDigest,
      terminalAckDigest,
    )
    .then((rows) => rows[0]?.receipt);
}

function callReap(
  client,
  tenantId,
  providerAuthorityDigest,
  workerActorDigest,
  batchLimit,
) {
  return client
    .$queryRawUnsafe(
      `SELECT public."identity_initial_owner_mail_reap_v1"(
         CAST($1 AS TEXT),
         CAST($2 AS TEXT),
         CAST($3 AS TEXT),
         CAST($4 AS INTEGER)
       ) AS receipt`,
      tenantId,
      providerAuthorityDigest,
      workerActorDigest,
      batchLimit,
    )
    .then((rows) => rows[0]?.receipt);
}

function callSentAssertion(client, fixture) {
  return client
    .$queryRawUnsafe(
      `SELECT public."identity_initial_owner_invite_delivery_assert_sent_v1"(
         CAST($1 AS TEXT),
         CAST($2 AS TEXT),
         CAST($3 AS TEXT)
       ) AS delivered`,
      fixture.tenantId,
      fixture.inviteId,
      fixture.tokenHash,
    )
    .then((rows) => rows[0]?.delivered);
}

function callReconcile(
  client,
  { outboxId, transitionRevision, resolution, actorDigest, evidenceDigest },
) {
  return client
    .$queryRawUnsafe(
      `SELECT public."identity_initial_owner_mail_reconcile_v1"(
         CAST($1 AS TEXT),
         CAST($2 AS BIGINT),
         CAST($3 AS TEXT),
         CAST($4 AS TEXT),
         CAST($5 AS TEXT)
       ) AS receipt`,
      outboxId,
      transitionRevision,
      resolution,
      evidenceDigest,
      actorDigest,
    )
    .then((rows) => rows[0]?.receipt);
}

async function readOutbox(client, outboxId) {
  const [row] = await client.$queryRawUnsafe(
    `SELECT
       "id",
       "tenantId" AS tenant_id,
       "status"::TEXT AS status,
       "attempts",
       "leaseVersion" AS lease_version,
       "transitionRevision" AS transition_revision,
       "availableAt" AS available_at,
       "leaseOwnerDigest" AS lease_owner_digest,
       "leaseTokenDigest" AS lease_token_digest,
       "providerAttemptKey" AS provider_attempt_key,
       "providerAcknowledgeUntil" AS provider_acknowledge_until,
       "providerOutcomeClass" AS provider_outcome_class,
       "secretCiphertext" AS secret_ciphertext,
       "ciphertextClearedAt" AS ciphertext_cleared_at,
       "sentAt" AS sent_at,
       "terminalAt" AS terminal_at,
       "stateReasonCode" AS state_reason_code,
       "updatedAt" AS updated_at
     FROM public."IdentityMailOutbox"
     WHERE "id" = $1`,
    outboxId,
  );
  assert.ok(row);
  return row;
}

async function readRetryDelaySeconds(client, outboxId) {
  const [row] = await client.$queryRawUnsafe(
    `SELECT EXTRACT(
       EPOCH FROM ("availableAt" - "updatedAt")
     )::INTEGER AS retry_seconds
     FROM public."IdentityMailOutbox"
     WHERE "id" = $1`,
    outboxId,
  );
  assert.ok(row);
  return Number(row.retry_seconds);
}

async function readEvents(client, outboxId) {
  return client.$queryRawUnsafe(
    `SELECT
       "eventType" AS event_type,
       "fromStatus"::TEXT AS from_status,
       "toStatus"::TEXT AS to_status,
       "transitionRevision" AS transition_revision,
       "actorDigest" AS actor_digest
     FROM public."IdentityMailDeliveryEvent"
     WHERE "outboxId" = $1
     ORDER BY "transitionRevision"`,
    outboxId,
  );
}

async function readTenantStateFingerprint(client, tenantId) {
  const [row] = await client.$queryRawUnsafe(
    `SELECT
       pg_catalog.md5(COALESCE((
         SELECT pg_catalog.string_agg(
           pg_catalog.row_to_json(target_outbox)::TEXT,
           '|' ORDER BY target_outbox."id"
         )
         FROM public."IdentityMailOutbox" AS target_outbox
         WHERE target_outbox."tenantId" = $1
       ), '')) AS outbox_digest,
       pg_catalog.md5(COALESCE((
         SELECT pg_catalog.string_agg(
           pg_catalog.row_to_json(target_event)::TEXT,
           '|' ORDER BY target_event."id"
         )
         FROM public."IdentityMailDeliveryEvent" AS target_event
         WHERE target_event."tenantId" = $1
       ), '')) AS event_digest,
       pg_catalog.md5(COALESCE((
         SELECT pg_catalog.string_agg(
           pg_catalog.row_to_json(target_invite)::TEXT,
           '|' ORDER BY target_invite."id"
         )
         FROM public."UserInvite" AS target_invite
         WHERE target_invite."tenantId" = $1
       ), '')) AS invite_digest,
       pg_catalog.md5(COALESCE((
         SELECT pg_catalog.string_agg(
           pg_catalog.row_to_json(target_claim)::TEXT,
           '|' ORDER BY target_claim."emailCanonical"
         )
         FROM public."IdentityEmailClaim" AS target_claim
         WHERE target_claim."tenantId" = $1
       ), '')) AS claim_digest,
       pg_catalog.md5(COALESCE((
         SELECT pg_catalog.string_agg(
           pg_catalog.row_to_json(target_enrollment)::TEXT,
           '|' ORDER BY target_enrollment."tenantId"
         )
         FROM public."IdentityMailDeliveryTenantEnrollment"
           AS target_enrollment
         WHERE target_enrollment."tenantId" = $1
       ), '')) AS enrollment_digest`,
    tenantId,
  );
  return row;
}

async function withOutboxDeliveryTriggersDisabled(databaseAdmin, operation) {
  await databaseAdmin.$executeRawUnsafe(
    `ALTER TABLE public."IdentityMailOutbox"
     DISABLE TRIGGER "IdentityMailOutbox_delivery_guard_trigger"`,
  );
  await databaseAdmin.$executeRawUnsafe(
    `ALTER TABLE public."IdentityMailOutbox"
     DISABLE TRIGGER "IdentityMailOutbox_delivery_event_trigger"`,
  );
  try {
    return await operation();
  } finally {
    await databaseAdmin.$executeRawUnsafe(
      `ALTER TABLE public."IdentityMailOutbox"
       ENABLE TRIGGER "IdentityMailOutbox_delivery_event_trigger"`,
    );
    await databaseAdmin.$executeRawUnsafe(
      `ALTER TABLE public."IdentityMailOutbox"
       ENABLE TRIGGER "IdentityMailOutbox_delivery_guard_trigger"`,
    );
  }
}

async function configureRoles(
  admin,
  databaseName,
  { workerRoleName, hostileRoleName, appRoleName },
) {
  for (const roleName of [workerRoleName, hostileRoleName, appRoleName]) {
    await grantRoleConnection(admin, databaseName, roleName);
  }
}

async function grantRuntimeBoundaries(
  databaseAdmin,
  { workerRoleName, hostileRoleName, appRoleName },
) {
  for (const roleName of [workerRoleName, hostileRoleName, appRoleName]) {
    await databaseAdmin.$executeRawUnsafe(
      `GRANT USAGE ON SCHEMA public TO ${quoteIdentifier(roleName)}`,
    );
  }
  for (const signature of WORKER_SIGNATURES) {
    await databaseAdmin.$executeRawUnsafe(
      `GRANT EXECUTE ON FUNCTION ${signature} TO ${quoteIdentifier(
        workerRoleName,
      )}`,
    );
  }
  await databaseAdmin.$executeRawUnsafe(
    `GRANT EXECUTE ON FUNCTION ${SENT_ASSERT_SIGNATURE}
     TO ${quoteIdentifier(appRoleName)}`,
  );
}

async function insertEnrollment(
  databaseAdmin,
  tenantId,
  workerRoleName,
  workerRoleOid,
  providerAuthorityDigest = CONFIG_DIGEST,
  {
    maxAttempts = 3,
    leaseSeconds = 10,
    acknowledgeSeconds = 10,
    baseRetrySeconds = 1,
    maxRetrySeconds = 2,
  } = {},
) {
  await databaseAdmin.$executeRawUnsafe(
    `INSERT INTO public."IdentityMailDeliveryTenantEnrollment" (
       "tenantId", "workerRoleName", "workerRoleOid", "policyRevision",
       "enabled", "maxAttempts", "leaseSeconds", "acknowledgeSeconds",
       "baseRetrySeconds", "maxRetrySeconds", "providerAuthorityDigest",
       "enabledAt", "createdAt", "updatedAt"
     )
     VALUES (
       $1, $2, $3, 1, TRUE, $5, $6, $7, $8, $9, $4,
       pg_catalog.clock_timestamp(),
       pg_catalog.clock_timestamp(),
       pg_catalog.clock_timestamp()
     )`,
    tenantId,
    workerRoleName,
    workerRoleOid,
    providerAuthorityDigest,
    maxAttempts,
    leaseSeconds,
    acknowledgeSeconds,
    baseRetrySeconds,
    maxRetrySeconds,
  );
}

async function assertNoDirectTableAccess(client) {
  for (const tableName of SEALED_TABLES) {
    await expectSqlState("42501", () =>
      client.$queryRawUnsafe(
        `SELECT pg_catalog.count(*) FROM public.${quoteIdentifier(tableName)}`,
      ),
    );
  }
}

async function readEffectiveRolePrivileges(databaseAdmin, roleName) {
  const [row] = await databaseAdmin.$queryRawUnsafe(
    `SELECT
       pg_catalog.has_database_privilege(
         $1,
         pg_catalog.current_database(),
         'CREATE'
       ) AS database_create,
       pg_catalog.has_database_privilege(
         $1,
         pg_catalog.current_database(),
         'TEMPORARY'
       ) AS database_temporary,
       (
         SELECT pg_catalog.count(*)::INTEGER
         FROM pg_catalog.pg_namespace AS namespace
         WHERE namespace.nspname !~ '^pg_'
           AND namespace.nspname <> 'information_schema'
           AND pg_catalog.has_schema_privilege(
             $1,
             namespace.oid,
             'USAGE'
           )
       ) AS schema_usage_count,
       (
         SELECT pg_catalog.count(*)::INTEGER
         FROM pg_catalog.pg_class AS relation
         INNER JOIN pg_catalog.pg_namespace AS namespace
           ON namespace.oid = relation.relnamespace
         WHERE relation.relkind IN ('r', 'p', 'v', 'm', 'f')
           AND namespace.nspname !~ '^pg_'
           AND namespace.nspname <> 'information_schema'
           AND pg_catalog.has_table_privilege(
             $1,
             relation.oid,
             'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
           )
       ) AS relation_count,
       (
         SELECT pg_catalog.count(*)::INTEGER
         FROM pg_catalog.pg_attribute AS attribute
         INNER JOIN pg_catalog.pg_class AS relation
           ON relation.oid = attribute.attrelid
         INNER JOIN pg_catalog.pg_namespace AS namespace
           ON namespace.oid = relation.relnamespace
         WHERE relation.relkind IN ('r', 'p', 'v', 'm', 'f')
           AND attribute.attnum > 0
           AND attribute.attisdropped = false
           AND namespace.nspname !~ '^pg_'
           AND namespace.nspname <> 'information_schema'
           AND pg_catalog.has_column_privilege(
             $1,
             relation.oid,
             attribute.attnum,
             'SELECT,INSERT,UPDATE,REFERENCES'
           )
       ) AS column_count,
       (
         SELECT pg_catalog.count(*)::INTEGER
         FROM pg_catalog.pg_class AS sequence
         INNER JOIN pg_catalog.pg_namespace AS namespace
           ON namespace.oid = sequence.relnamespace
         WHERE sequence.relkind = 'S'
           AND namespace.nspname !~ '^pg_'
           AND namespace.nspname <> 'information_schema'
           AND CASE
             WHEN sequence.relkind = 'S'
             THEN pg_catalog.has_sequence_privilege(
               $1,
               sequence.oid,
               'USAGE,SELECT,UPDATE'
             )
             ELSE false
           END
       ) AS sequence_count,
       (
         SELECT pg_catalog.count(*)::INTEGER
         FROM pg_catalog.pg_proc AS routine
         INNER JOIN pg_catalog.pg_namespace AS namespace
           ON namespace.oid = routine.pronamespace
         WHERE namespace.nspname !~ '^pg_'
           AND namespace.nspname <> 'information_schema'
           AND pg_catalog.has_function_privilege(
             $1,
             routine.oid,
             'EXECUTE'
           )
       ) AS function_count`,
    roleName,
  );
  return {
    databaseCreate: row?.database_create === true,
    databaseTemporary: row?.database_temporary === true,
    schemaUsage: Number(row?.schema_usage_count ?? -1),
    relations: Number(row?.relation_count ?? -1),
    columns: Number(row?.column_count ?? -1),
    sequences: Number(row?.sequence_count ?? -1),
    functions: Number(row?.function_count ?? -1),
  };
}

async function assertAclBoundary(
  databaseAdmin,
  worker,
  hostile,
  app,
  { workerRoleName, hostileRoleName, appRoleName, tenantId },
) {
  await assertNoDirectTableAccess(worker);
  await assertNoDirectTableAccess(hostile);
  await assertNoDirectTableAccess(app);

  await expectSqlState("42501", () =>
    worker.$executeRawUnsafe(
      `CREATE TEMP TABLE "identity_mail_delivery_temp_probe" (
           "id" INTEGER
         )`,
    ),
  );
  await expectSqlState("42501", () =>
    hostile.$queryRawUnsafe(
      `SELECT public."identity_initial_owner_mail_claim_v1"(
           $1::TEXT, $2::TEXT, $3::TEXT, $4::TEXT
         )`,
      tenantId,
      "1".repeat(64),
      "2".repeat(64),
      CONFIG_DIGEST,
    ),
  );
  await expectSqlState("42501", () =>
    app.$queryRawUnsafe(
      `SELECT public."identity_initial_owner_mail_claim_v1"(
           $1::TEXT, $2::TEXT, $3::TEXT, $4::TEXT
         )`,
      tenantId,
      "1".repeat(64),
      "2".repeat(64),
      CONFIG_DIGEST,
    ),
  );
  await expectSqlState("42501", () =>
    worker.$queryRawUnsafe(
      `SELECT public."identity_initial_owner_invite_delivery_assert_sent_v1"(
           $1::TEXT, $2::TEXT, $3::TEXT
         )`,
      tenantId,
      randomUUID(),
      "3".repeat(64),
    ),
  );

  for (const signature of [...WORKER_SIGNATURES, SENT_ASSERT_SIGNATURE]) {
    const [acl] = await databaseAdmin.$queryRawUnsafe(
      `SELECT
         pg_catalog.has_function_privilege(
           'public',
           pg_catalog.to_regprocedure($1),
           'EXECUTE'
         ) AS public_execute`,
      signature
        .toLowerCase()
        .replaceAll("text", "text")
        .replaceAll("integer", "integer"),
    );
    assert.equal(acl?.public_execute, false);
  }

  const roleRows = await databaseAdmin.$queryRawUnsafe(
    `SELECT
       role.rolname,
       role.rolcanlogin,
       role.rolinherit,
       role.rolsuper,
       role.rolcreaterole,
       role.rolcreatedb,
       role.rolreplication,
       role.rolbypassrls
     FROM pg_catalog.pg_roles AS role
     WHERE role.rolname = ANY($1::TEXT[])
     ORDER BY role.rolname`,
    [workerRoleName, hostileRoleName, appRoleName],
  );
  assert.equal(roleRows.length, 3);
  for (const role of roleRows) {
    assert.equal(role.rolcanlogin, true);
    assert.equal(role.rolinherit, false);
    assert.equal(role.rolsuper, false);
    assert.equal(role.rolcreaterole, false);
    assert.equal(role.rolcreatedb, false);
    assert.equal(role.rolreplication, false);
    assert.equal(role.rolbypassrls, false);
  }

  assert.deepEqual(
    await readEffectiveRolePrivileges(databaseAdmin, workerRoleName),
    {
      databaseCreate: false,
      databaseTemporary: false,
      schemaUsage: 1,
      relations: 0,
      columns: 0,
      sequences: 0,
      functions: WORKER_SIGNATURES.length,
    },
  );
  assert.deepEqual(
    await readEffectiveRolePrivileges(databaseAdmin, appRoleName),
    {
      databaseCreate: false,
      databaseTemporary: false,
      schemaUsage: 1,
      relations: 0,
      columns: 0,
      sequences: 0,
      functions: 1,
    },
  );
  assert.deepEqual(
    await readEffectiveRolePrivileges(databaseAdmin, hostileRoleName),
    {
      databaseCreate: false,
      databaseTemporary: false,
      schemaUsage: 1,
      relations: 0,
      columns: 0,
      sequences: 0,
      functions: 0,
    },
  );
}

async function assertClean176(client) {
  await assertMigrationState(client, CURRENT_176_COUNT, CURRENT_176);
  assert.deepEqual(await readStatusLabels(client), EXACT_STATUS_LABELS);
  const [counts] = await client.$queryRawUnsafe(
    `SELECT
       (SELECT pg_catalog.count(*)::INTEGER
        FROM public."IdentityMailOutbox") AS outbox_count,
       (SELECT pg_catalog.count(*)::INTEGER
        FROM public."IdentityMailDeliveryTenantEnrollment")
          AS enrollment_count,
       (SELECT pg_catalog.count(*)::INTEGER
        FROM public."IdentityMailDeliveryEvent") AS event_count`,
  );
  assert.deepEqual(
    {
      outbox: Number(counts?.outbox_count),
      enrollment: Number(counts?.enrollment_count),
      event: Number(counts?.event_count),
    },
    { outbox: 0, enrollment: 0, event: 0 },
  );
}

async function assertEnumIsolation(client, fixture) {
  await assertMigrationState(client, CURRENT_175_COUNT, CURRENT_175);
  assert.deepEqual(await readStatusLabels(client), EXACT_STATUS_LABELS);
  assert.equal(
    await relationExists(client, "IdentityMailDeliveryTenantEnrollment"),
    false,
  );
  assert.equal(
    await relationExists(client, "IdentityMailDeliveryEvent"),
    false,
  );
  const [state] = await client.$queryRawUnsafe(
    `SELECT
       (SELECT pg_catalog.count(*)::INTEGER
        FROM public."Tenant"
        WHERE "id" = $1) AS tenant_count,
       (SELECT pg_catalog.count(*)::INTEGER
        FROM public."IdentityMailOutbox") AS outbox_count,
       EXISTS (
         SELECT 1
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'IdentityMailOutbox'
           AND column_name = 'availableAt'
       ) AS delivery_columns_present
     `,
    fixture.tenantId,
  );
  assert.equal(Number(state?.tenant_count), 1);
  assert.equal(Number(state?.outbox_count), 0);
  assert.equal(state?.delivery_columns_present, false);
  const [routine] = await client.$queryRawUnsafe(
    `SELECT pg_catalog.to_regprocedure(
       'public."identity_initial_owner_mail_claim_v1"(text,text,text,text)'
     )::TEXT AS claim_rpc`,
  );
  assert.equal(routine?.claim_rpc, null);
}

async function assertPopulatedBusinessUpgrade(client, fixture) {
  await assertMigrationState(client, CURRENT_176_COUNT, CURRENT_176);
  assert.deepEqual(await readStatusLabels(client), EXACT_STATUS_LABELS);
  const [empty] = await client.$queryRawUnsafe(
    `SELECT
       (SELECT pg_catalog.count(*)::INTEGER
        FROM public."Tenant"
        WHERE "id" = $1) AS tenant_count,
       (SELECT pg_catalog.count(*)::INTEGER
        FROM public."IdentityMailOutbox") AS outbox_count,
       (SELECT pg_catalog.count(*)::INTEGER
        FROM public."IdentityMailDeliveryTenantEnrollment")
          AS enrollment_count,
       (SELECT pg_catalog.count(*)::INTEGER
        FROM public."IdentityMailDeliveryEvent") AS event_count`,
    fixture.tenantId,
  );
  assert.equal(Number(empty?.tenant_count), 1);
  assert.equal(Number(empty?.outbox_count), 0);
  assert.equal(Number(empty?.enrollment_count), 0);
  assert.equal(Number(empty?.event_count), 0);
}

async function insertMalformedLegacyClaim(client, fixture) {
  await insertTenant(client, fixture);
  await client.$executeRawUnsafe(
    `INSERT INTO public."IdentityEmailClaim" (
       "emailCanonical", "claimType", "tenantId", "subjectId",
       "workflowLocator", "revision", "createdAt", "updatedAt"
     )
     VALUES (
       $1, 'INVITE'::public."IdentityEmailClaimType",
       $2, $3, $3, 1, $4, $4
     )`,
    fixture.email,
    fixture.tenantId,
    fixture.reservationSubjectId,
    fixture.createdAt,
  );
}

async function identityClaimCount(client, tenantId) {
  const [row] = await client.$queryRawUnsafe(
    `SELECT pg_catalog.count(*)::INTEGER AS count
     FROM public."IdentityEmailClaim"
     WHERE "tenantId" = $1`,
    tenantId,
  );
  return Number(row?.count ?? -1);
}

async function callIdentityEmailLock(client, candidateEmail) {
  const [row] = await client.$queryRawUnsafe(
    `SELECT public."identity_email_claim_lock_v1"(
       CAST($1 AS TEXT)
     ) AS canonical_email`,
    candidateEmail,
  );
  return row?.canonical_email;
}

async function callIdentityEmailReserve(
  client,
  version,
  candidateEmail,
  tenantId,
  subjectId,
) {
  assert.ok(version === 1 || version === 2);
  const [row] = await client.$queryRawUnsafe(
    `SELECT public."identity_email_claim_reserve_invite_v${version}"(
       CAST($1 AS TEXT),
       CAST($2 AS TEXT),
       CAST($3 AS TEXT)
     ) AS receipt`,
    candidateEmail,
    tenantId,
    subjectId,
  );
  return row?.receipt;
}

async function assertCanonicalEmailParity(databaseAdmin, tenantId, suffix) {
  const [constraint] = await databaseAdmin.$queryRawUnsafe(
    `SELECT
       target_constraint.convalidated,
       pg_catalog.pg_get_constraintdef(target_constraint.oid)
         AS definition
     FROM pg_catalog.pg_constraint AS target_constraint
     INNER JOIN pg_catalog.pg_class AS relation
       ON relation.oid = target_constraint.conrelid
     INNER JOIN pg_catalog.pg_namespace AS namespace
       ON namespace.oid = relation.relnamespace
     WHERE namespace.nspname = 'public'
       AND relation.relname = 'IdentityEmailClaim'
       AND target_constraint.conname =
         'IdentityEmailClaim_email_canonical_check'`,
  );
  assert.equal(constraint?.convalidated, true);
  assert.match(constraint?.definition ?? "", /split_part/iu);
  assert.match(constraint?.definition ?? "", /\{0,61\}/u);

  const domain253 = [
    "a".repeat(63),
    "b".repeat(63),
    "c".repeat(63),
    "d".repeat(61),
  ].join(".");
  assert.equal(domain253.length, 253);
  const validVectors = [
    {
      input: " OWNER+PILOT@EXAMPLE.COM ",
      canonical: "owner+pilot@example.com",
    },
    {
      input: "first.last@sub-domain.example",
      canonical: "first.last@sub-domain.example",
    },
    {
      input: "owner@example.123",
      canonical: "owner@example.123",
    },
    {
      input: `${"l".repeat(64)}@example.test`,
      canonical: `${"l".repeat(64)}@example.test`,
    },
    {
      input: `owner@${"e".repeat(63)}.test`,
      canonical: `owner@${"e".repeat(63)}.test`,
    },
    {
      input: `owner@${domain253}`,
      canonical: `owner@${domain253}`,
    },
  ];
  for (const vector of validVectors) {
    assert.equal(
      await callIdentityEmailLock(databaseAdmin, vector.input),
      vector.canonical,
    );
  }

  const invalidVectors = [
    "a,b@example.com",
    "owner@example.com,evil",
    "Owner<owner@example.com>",
    "Owner <owner@example.com>",
    '"owner"@example.com',
    "owner\r\n@example.com",
    "owner\t@example.com",
    "\towner@example.com\t",
    `owner\u00a0@example.com`,
    "владелец@example.com",
    ".owner@example.com",
    "owner.@example.com",
    "owner..x@example.com",
    "owner@-example.com",
    "owner@example-.com",
    "owner@example..com",
    `${"l".repeat(65)}@example.test`,
    `owner@${"e".repeat(64)}.test`,
    `owner@${[
      "a".repeat(63),
      "b".repeat(63),
      "c".repeat(63),
      "d".repeat(62),
    ].join(".")}`,
    `${"l".repeat(64)}@${[
      "a".repeat(63),
      "b".repeat(63),
      "c".repeat(63),
      "d".repeat(64),
    ].join(".")}`,
  ];
  for (const [index, candidateEmail] of invalidVectors.entries()) {
    const before = await identityClaimCount(databaseAdmin, tenantId);
    await expectSqlState("22023", () =>
      callIdentityEmailLock(databaseAdmin, candidateEmail),
    );
    await expectSqlState("22023", () =>
      callIdentityEmailReserve(
        databaseAdmin,
        1,
        candidateEmail,
        tenantId,
        randomUUID(),
      ),
    );
    await expectSqlState("22023", () =>
      callIdentityEmailReserve(
        databaseAdmin,
        2,
        candidateEmail,
        tenantId,
        randomUUID(),
      ),
    );
    assert.equal(
      await identityClaimCount(databaseAdmin, tenantId),
      before,
      `Reject vector ${index} changed IdentityEmailClaim`,
    );
  }

  const directBefore = await identityClaimCount(databaseAdmin, tenantId);
  await expectSqlState("23514", () =>
    databaseAdmin.$executeRawUnsafe(
      `INSERT INTO public."IdentityEmailClaim" (
         "emailCanonical", "claimType", "tenantId", "subjectId",
         "workflowLocator", "revision", "createdAt", "updatedAt"
       )
       VALUES (
         $1, 'INVITE'::public."IdentityEmailClaimType",
         $2, $3, $3, 1,
         pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp()
       )`,
      `${suffix}.direct..poison@identity-mail.example.test`,
      tenantId,
      randomUUID(),
    ),
  );
  assert.equal(await identityClaimCount(databaseAdmin, tenantId), directBefore);

  const v1Receipt = await callIdentityEmailReserve(
    databaseAdmin,
    1,
    ` ${suffix}.V1@BOUNDARY.EXAMPLE `,
    tenantId,
    randomUUID(),
  );
  assert.equal(v1Receipt.decision, "CREATED");
  const v2Receipt = await callIdentityEmailReserve(
    databaseAdmin,
    2,
    `v2@${domain253}`,
    tenantId,
    randomUUID(),
  );
  assert.equal(v2Receipt.decision, "CREATED");
  return {
    validVectors: validVectors.length,
    invalidVectors: invalidVectors.length,
    reserveVersions: 2,
  };
}

async function exerciseMaximumRetryPolicy({
  databaseAdmin,
  worker,
  roles,
  suffix,
}) {
  const policy = {
    maxAttempts: 20,
    leaseSeconds: 10,
    acknowledgeSeconds: 10,
    baseRetrySeconds: 3_600,
    maxRetrySeconds: 86_400,
  };
  const completionFixture = deliveryFixture(
    randomUUID(),
    `${suffix}-max-policy-complete`,
  );
  completionFixture.expiresAt = new Date(Date.now() + 3 * 86_400_000);
  await insertDeliveryAggregate(databaseAdmin, completionFixture, {
    current176: true,
  });
  await databaseAdmin.$executeRawUnsafe(
    `UPDATE public."Tenant"
     SET "trialEndsAt" = $2, "updatedAt" = pg_catalog.clock_timestamp()
     WHERE "id" = $1`,
    completionFixture.tenantId,
    completionFixture.expiresAt,
  );
  await insertEnrollment(
    databaseAdmin,
    completionFixture.tenantId,
    roles.workerRoleName,
    roles.workerRoleOid,
    MAX_POLICY_CONFIG_DIGEST,
    policy,
  );
  await withOutboxDeliveryTriggersDisabled(databaseAdmin, () =>
    databaseAdmin.$executeRawUnsafe(
      `UPDATE public."IdentityMailOutbox"
       SET "status" = 'RETRY'::public."IdentityMailOutboxStatus",
           "attempts" = 18,
           "leaseVersion" = 18,
           "availableAt" = pg_catalog.clock_timestamp() -
             pg_catalog.make_interval(secs => 1),
           "stateReasonCode" = 'PRE_PROVIDER_TRANSIENT',
           "updatedAt" = pg_catalog.clock_timestamp()
       WHERE "id" = $1`,
      completionFixture.outboxId,
    ),
  );
  const completionOwner = "a".repeat(64);
  const completionToken = "1".repeat(64);
  const highAttemptClaim = await callClaim(
    worker,
    completionFixture.tenantId,
    completionOwner,
    completionToken,
    MAX_POLICY_CONFIG_DIGEST,
  );
  assert.equal(highAttemptClaim.decision, "CLAIMED");
  assert.equal(highAttemptClaim.attemptNumber, 19);
  const highAttemptCompletion = await callComplete(worker, {
    outboxId: completionFixture.outboxId,
    leaseVersion: 19,
    leaseOwnerDigest: completionOwner,
    leaseTokenDigest: completionToken,
    outcomeCode: "PRE_PROVIDER_RETRY",
  });
  assert.equal(highAttemptCompletion.decision, "RETRY");
  const completionState = await readOutbox(
    databaseAdmin,
    completionFixture.outboxId,
  );
  assert.equal(completionState.status, "RETRY");
  const completionRetrySeconds = await readRetryDelaySeconds(
    databaseAdmin,
    completionFixture.outboxId,
  );
  assert.equal(completionRetrySeconds, policy.maxRetrySeconds);

  const reaperFixture = deliveryFixture(
    randomUUID(),
    `${suffix}-max-policy-reaper`,
  );
  reaperFixture.expiresAt = new Date(Date.now() + 3 * 86_400_000);
  await insertDeliveryAggregate(databaseAdmin, reaperFixture, {
    current176: true,
  });
  await databaseAdmin.$executeRawUnsafe(
    `UPDATE public."Tenant"
     SET "trialEndsAt" = $2, "updatedAt" = pg_catalog.clock_timestamp()
     WHERE "id" = $1`,
    reaperFixture.tenantId,
    reaperFixture.expiresAt,
  );
  await insertEnrollment(
    databaseAdmin,
    reaperFixture.tenantId,
    roles.workerRoleName,
    roles.workerRoleOid,
    MAX_POLICY_CONFIG_DIGEST,
    policy,
  );
  await withOutboxDeliveryTriggersDisabled(databaseAdmin, () =>
    databaseAdmin.$executeRawUnsafe(
      `UPDATE public."IdentityMailOutbox"
       SET "status" = 'CLAIMED'::public."IdentityMailOutboxStatus",
           "attempts" = 20,
           "leaseVersion" = 20,
           "availableAt" = NULL,
           "leaseOwnerDigest" = $2,
           "leaseTokenDigest" = $3,
           "claimedAt" = pg_catalog.clock_timestamp() -
             pg_catalog.make_interval(secs => 120),
           "leaseExpiresAt" = pg_catalog.clock_timestamp() -
             pg_catalog.make_interval(secs => 60),
           "stateReasonCode" = NULL,
           "updatedAt" = pg_catalog.clock_timestamp()
       WHERE "id" = $1`,
      reaperFixture.outboxId,
      "2".repeat(64),
      "3".repeat(64),
    ),
  );
  const highAttemptReap = await callReap(
    worker,
    reaperFixture.tenantId,
    MAX_POLICY_CONFIG_DIGEST,
    WORKER_ACTOR_DIGEST,
    10,
  );
  assert.equal(highAttemptReap.decision, "COMPLETED");
  assert.equal(highAttemptReap.processed, 1);
  const reaperState = await readOutbox(databaseAdmin, reaperFixture.outboxId);
  assert.equal(reaperState.status, "RETRY");
  assert.equal(reaperState.attempts, 20);
  assert.equal(reaperState.state_reason_code, "LEASE_EXPIRED_BEFORE_PROVIDER");
  const reaperRetrySeconds = await readRetryDelaySeconds(
    databaseAdmin,
    reaperFixture.outboxId,
  );
  assert.equal(reaperRetrySeconds, policy.maxRetrySeconds);

  return {
    completionAttempt: highAttemptClaim.attemptNumber,
    completionRetrySeconds,
    reaperAttempt: reaperState.attempts,
    reaperRetrySeconds,
  };
}

async function runDeliveryMatrix({
  databaseAdmin,
  workerA,
  workerB,
  hostile,
  app,
  roles,
  primaryFixture,
  suffix,
}) {
  const tenantBFixture = deliveryFixture(randomUUID(), `${suffix}-tenant-b`);
  await insertDeliveryAggregate(databaseAdmin, tenantBFixture, {
    current176: true,
  });

  await insertEnrollment(
    databaseAdmin,
    primaryFixture.tenantId,
    roles.workerRoleName,
    roles.workerRoleOid,
  );
  await insertEnrollment(
    databaseAdmin,
    tenantBFixture.tenantId,
    roles.workerRoleName,
    roles.workerRoleOid,
    CONFIG_B_DIGEST,
  );

  assert.deepEqual(await callWorkerAssert(workerA, primaryFixture.tenantId), {
    schemaVersion: 1,
    operation: "ASSERT_IDENTITY_MAIL_DELIVERY_WORKER",
    decision: "READY",
    tenantId: primaryFixture.tenantId,
    migrationHead: CURRENT_179,
    migrationCount: CURRENT_179_COUNT,
    preterminalManifestDigest: PRETERMINAL_178_MANIFEST_DIGEST,
    policyRevision: 1,
    maxAttempts: 3,
    leaseSeconds: 10,
    acknowledgeSeconds: 10,
    baseRetrySeconds: 1,
    maxRetrySeconds: 2,
    providerAuthorityDigest: CONFIG_DIGEST,
  });
  assert.deepEqual(await callWorkerAssert(workerA, tenantBFixture.tenantId), {
    schemaVersion: 1,
    operation: "ASSERT_IDENTITY_MAIL_DELIVERY_WORKER",
    decision: "READY",
    tenantId: tenantBFixture.tenantId,
    migrationHead: CURRENT_179,
    migrationCount: CURRENT_179_COUNT,
    preterminalManifestDigest: PRETERMINAL_178_MANIFEST_DIGEST,
    policyRevision: 1,
    maxAttempts: 3,
    leaseSeconds: 10,
    acknowledgeSeconds: 10,
    baseRetrySeconds: 1,
    maxRetrySeconds: 2,
    providerAuthorityDigest: CONFIG_B_DIGEST,
  });

  await expectSqlState(
    "42501",
    () =>
      callClaim(
        workerA,
        primaryFixture.tenantId,
        "1".repeat(64),
        "2".repeat(64),
        WRONG_CONFIG_DIGEST,
      ),
    /configuration is not enrolled/iu,
  );
  await expectSqlState(
    "42501",
    () =>
      callClaim(
        workerA,
        tenantBFixture.tenantId,
        "1".repeat(64),
        "2".repeat(64),
        CONFIG_DIGEST,
      ),
    /configuration is not enrolled/iu,
  );
  const tenantBBeforeWrongReap = await readTenantStateFingerprint(
    databaseAdmin,
    tenantBFixture.tenantId,
  );
  await expectSqlState(
    "42501",
    () =>
      callReap(
        workerA,
        tenantBFixture.tenantId,
        CONFIG_DIGEST,
        WORKER_ACTOR_DIGEST,
        100,
      ),
    /configuration is not enrolled/iu,
  );
  assert.deepEqual(
    await readTenantStateFingerprint(databaseAdmin, tenantBFixture.tenantId),
    tenantBBeforeWrongReap,
  );

  const primaryBeforeTenantB = await readTenantStateFingerprint(
    databaseAdmin,
    primaryFixture.tenantId,
  );
  const tenantBOwner = "a".repeat(64);
  const tenantBToken = "9".repeat(64);
  const tenantBClaim = await callClaim(
    workerA,
    tenantBFixture.tenantId,
    tenantBOwner,
    tenantBToken,
    CONFIG_B_DIGEST,
  );
  assert.equal(tenantBClaim.decision, "CLAIMED");
  assert.equal(tenantBClaim.outboxId, tenantBFixture.outboxId);
  await databaseAdmin.$executeRawUnsafe(
    `UPDATE public."UserInvite"
     SET "revokedAt" = pg_catalog.clock_timestamp(),
         "updatedAt" = pg_catalog.clock_timestamp()
     WHERE "id" = $1`,
    tenantBFixture.inviteId,
  );
  const tenantBCancel = await callProviderMark(workerA, {
    outboxId: tenantBFixture.outboxId,
    leaseVersion: 1,
    leaseOwnerDigest: tenantBOwner,
    leaseTokenDigest: tenantBToken,
    providerAttemptKey: randomUUID(),
    providerAuthorityDigest: CONFIG_B_DIGEST,
    messageIdDigest: "5".repeat(64),
  });
  assert.deepEqual(tenantBCancel, {
    schemaVersion: 1,
    operation: "MARK_INITIAL_OWNER_MAIL_PROVIDER_ATTEMPT",
    decision: "CANCELED",
    reasonCode: "NOT_DELIVERABLE",
    outboxId: tenantBFixture.outboxId,
    tenantId: tenantBFixture.tenantId,
    inviteId: tenantBFixture.inviteId,
    leaseVersion: 1,
    transitionRevision: 3,
  });
  const tenantBState = await readOutbox(databaseAdmin, tenantBFixture.outboxId);
  assert.equal(tenantBState.status, "CANCELED");
  assert.equal(tenantBState.provider_attempt_key, null);
  assert.equal(tenantBState.secret_ciphertext, null);
  assert.equal(tenantBState.state_reason_code, "INVITE_NOT_DELIVERABLE");
  assert.deepEqual(
    await readTenantStateFingerprint(databaseAdmin, primaryFixture.tenantId),
    primaryBeforeTenantB,
  );

  await assertAclBoundary(databaseAdmin, workerA, hostile, app, {
    ...roles,
    tenantId: primaryFixture.tenantId,
  });

  const contenders = [
    {
      client: workerA,
      owner: "1".repeat(64),
      token: "2".repeat(64),
    },
    {
      client: workerB,
      owner: "3".repeat(64),
      token: "4".repeat(64),
    },
  ];
  const claimReceipts = await Promise.all(
    contenders.map((contender) =>
      callClaim(
        contender.client,
        primaryFixture.tenantId,
        contender.owner,
        contender.token,
        CONFIG_DIGEST,
      ),
    ),
  );
  assert.deepEqual(claimReceipts.map((receipt) => receipt.decision).sort(), [
    "CLAIMED",
    "EMPTY",
  ]);
  const winnerIndex = claimReceipts.findIndex(
    (receipt) => receipt.decision === "CLAIMED",
  );
  const winner = contenders[winnerIndex];
  assert.equal(claimReceipts[winnerIndex].outboxId, primaryFixture.outboxId);
  assert.equal(claimReceipts[winnerIndex].attemptNumber, 1);

  const beforeNullInputMatrix = await readTenantStateFingerprint(
    databaseAdmin,
    primaryFixture.tenantId,
  );
  await expectSqlState("22023", () =>
    callProviderMark(workerA, {
      outboxId: primaryFixture.outboxId,
      leaseVersion: null,
      leaseOwnerDigest: winner.owner,
      leaseTokenDigest: winner.token,
      providerAttemptKey: randomUUID(),
      providerAuthorityDigest: CONFIG_DIGEST,
      messageIdDigest: "5".repeat(64),
    }),
  );
  await expectSqlState("22023", () =>
    callComplete(workerA, {
      outboxId: primaryFixture.outboxId,
      leaseVersion: null,
      leaseOwnerDigest: winner.owner,
      leaseTokenDigest: winner.token,
      outcomeCode: "PRE_PROVIDER_RETRY",
    }),
  );
  await expectSqlState("22023", () =>
    callComplete(workerA, {
      outboxId: primaryFixture.outboxId,
      leaseVersion: 1,
      leaseOwnerDigest: winner.owner,
      leaseTokenDigest: winner.token,
      outcomeCode: null,
    }),
  );
  await expectSqlState("22023", () =>
    callReap(
      workerA,
      primaryFixture.tenantId,
      CONFIG_DIGEST,
      WORKER_ACTOR_DIGEST,
      null,
    ),
  );
  await expectSqlState("22023", () =>
    callReconcile(databaseAdmin, {
      outboxId: primaryFixture.outboxId,
      transitionRevision: null,
      resolution: "SENT",
      evidenceDigest: "6".repeat(64),
      actorDigest: "7".repeat(64),
    }),
  );
  await expectSqlState("22023", () =>
    callReconcile(databaseAdmin, {
      outboxId: primaryFixture.outboxId,
      transitionRevision: 2,
      resolution: null,
      evidenceDigest: "6".repeat(64),
      actorDigest: "7".repeat(64),
    }),
  );
  assert.deepEqual(
    await readTenantStateFingerprint(databaseAdmin, primaryFixture.tenantId),
    beforeNullInputMatrix,
  );

  await expectSqlState(
    "40001",
    () =>
      callProviderMark(workerA, {
        outboxId: primaryFixture.outboxId,
        leaseVersion: 2,
        leaseOwnerDigest: winner.owner,
        leaseTokenDigest: winner.token,
        providerAttemptKey: randomUUID(),
        providerAuthorityDigest: CONFIG_DIGEST,
        messageIdDigest: "5".repeat(64),
      }),
    /CAS is stale/iu,
  );

  const retryReceipt = await callComplete(workerA, {
    outboxId: primaryFixture.outboxId,
    leaseVersion: 1,
    leaseOwnerDigest: winner.owner,
    leaseTokenDigest: winner.token,
    outcomeCode: "PRE_PROVIDER_RETRY",
  });
  assert.equal(retryReceipt.decision, "RETRY");
  const retryState = await readOutbox(databaseAdmin, primaryFixture.outboxId);
  assert.equal(retryState.status, "RETRY");
  assert.equal(retryState.secret_ciphertext.length, 71);
  assert.equal(retryState.provider_attempt_key, null);
  assert.equal(retryState.state_reason_code, "PRE_PROVIDER_TRANSIENT");

  const retryDelay = Math.max(
    0,
    retryState.available_at.getTime() - Date.now() + 250,
  );
  await wait(retryDelay);
  const secondOwner = "6".repeat(64);
  const secondToken = "7".repeat(64);
  const secondClaim = await callClaim(
    workerA,
    primaryFixture.tenantId,
    secondOwner,
    secondToken,
    CONFIG_DIGEST,
  );
  assert.equal(secondClaim.decision, "CLAIMED");
  assert.equal(secondClaim.attemptNumber, 2);

  const providerAttemptKey = randomUUID();
  const markReceipt = await callProviderMark(workerA, {
    outboxId: primaryFixture.outboxId,
    leaseVersion: 2,
    leaseOwnerDigest: secondOwner,
    leaseTokenDigest: secondToken,
    providerAttemptKey,
    providerAuthorityDigest: CONFIG_DIGEST,
    messageIdDigest: "8".repeat(64),
  });
  assert.equal(markReceipt.decision, "MARKED");
  const markedState = await readOutbox(databaseAdmin, primaryFixture.outboxId);
  assert.equal(markedState.status, "CLAIMED");
  assert.equal(markedState.provider_attempt_key, providerAttemptKey);
  assert.equal(markedState.secret_ciphertext, null);
  assert.ok(markedState.ciphertext_cleared_at instanceof Date);

  assert.equal(await callSentAssertion(app, primaryFixture), false);
  await expectSqlState(
    "55000",
    () =>
      databaseAdmin.$executeRawUnsafe(
        `UPDATE public."UserInvite"
         SET "acceptedAt" = pg_catalog.clock_timestamp(),
             "updatedAt" = pg_catalog.clock_timestamp()
         WHERE "id" = $1`,
        primaryFixture.inviteId,
      ),
    /cannot be accepted before verified delivery/iu,
  );

  const missingOutboxOwnerId = await insertBareInvite(databaseAdmin, {
    tenantId: primaryFixture.tenantId,
    suffix: `${suffix}-missing-outbox-owner`,
    role: "OWNER",
  });
  await expectSqlState(
    "55000",
    () =>
      databaseAdmin.$executeRawUnsafe(
        `UPDATE public."UserInvite"
         SET "acceptedAt" = pg_catalog.clock_timestamp(),
             "updatedAt" = pg_catalog.clock_timestamp()
         WHERE "id" = $1`,
        missingOutboxOwnerId,
      ),
    /cannot be accepted before verified delivery/iu,
  );
  await expectSqlState(
    "55000",
    () =>
      insertBareInvite(databaseAdmin, {
        tenantId: primaryFixture.tenantId,
        suffix: `${suffix}-inserted-accepted-owner`,
        role: "OWNER",
        acceptedAt: new Date("2001-01-01T00:00:00.000Z"),
      }),
    /cannot be inserted as accepted/iu,
  );

  const simultaneousRoleInviteId = await insertBareInvite(databaseAdmin, {
    tenantId: primaryFixture.tenantId,
    suffix: `${suffix}-simultaneous-role`,
  });
  await expectSqlState(
    "55000",
    () =>
      databaseAdmin.$executeRawUnsafe(
        `UPDATE public."UserInvite"
         SET "role" = 'OWNER'::public."UserRole",
             "acceptedAt" = pg_catalog.clock_timestamp(),
             "updatedAt" = pg_catalog.clock_timestamp()
         WHERE "id" = $1`,
        simultaneousRoleInviteId,
      ),
    /identity cannot change during acceptance/iu,
  );

  const sourceTenantFixture = deliveryFixture(
    randomUUID(),
    `${suffix}-ordinary-source`,
  );
  await insertTenant(databaseAdmin, sourceTenantFixture);
  await databaseAdmin.$executeRawUnsafe(
    `UPDATE public."Tenant"
     SET "customerStage" = 'INTERNAL'::public."TenantCustomerStage",
         "onboardingStatus" =
           'READY'::public."TenantOnboardingStatus",
         "updatedAt" = pg_catalog.clock_timestamp()
     WHERE "id" = $1`,
    sourceTenantFixture.tenantId,
  );
  const crossTenantInviteId = await insertBareInvite(databaseAdmin, {
    tenantId: sourceTenantFixture.tenantId,
    suffix: `${suffix}-cross-tenant`,
  });
  await expectSqlState(
    "55000",
    () =>
      databaseAdmin.$executeRawUnsafe(
        `UPDATE public."UserInvite"
         SET "tenantId" = $2,
             "role" = 'OWNER'::public."UserRole",
             "acceptedAt" = pg_catalog.clock_timestamp(),
             "updatedAt" = pg_catalog.clock_timestamp()
         WHERE "id" = $1`,
        crossTenantInviteId,
        primaryFixture.tenantId,
      ),
    /identity cannot change during acceptance/iu,
  );

  const sentReceipt = await callComplete(workerA, {
    outboxId: primaryFixture.outboxId,
    leaseVersion: 2,
    leaseOwnerDigest: secondOwner,
    leaseTokenDigest: secondToken,
    outcomeCode: "PROVIDER_ACCEPTED",
    providerReceiptDigest: "9".repeat(64),
    terminalAckDigest: "a".repeat(64),
  });
  assert.equal(sentReceipt.decision, "SENT");
  assert.equal(await callSentAssertion(app, primaryFixture), true);

  await databaseAdmin.$executeRawUnsafe(
    `UPDATE public."UserInvite"
     SET "revokedAt" = pg_catalog.clock_timestamp(),
         "updatedAt" = pg_catalog.clock_timestamp()
     WHERE "id" = $1`,
    primaryFixture.inviteId,
  );
  assert.equal(await callSentAssertion(app, primaryFixture), false);
  await expectSqlState(
    "55000",
    () =>
      databaseAdmin.$executeRawUnsafe(
        `UPDATE public."UserInvite"
         SET "acceptedAt" = pg_catalog.clock_timestamp(),
             "updatedAt" = pg_catalog.clock_timestamp()
         WHERE "id" = $1`,
        primaryFixture.inviteId,
      ),
    /cannot be accepted before verified delivery/iu,
  );
  await databaseAdmin.$executeRawUnsafe(
    `UPDATE public."UserInvite"
     SET "revokedAt" = NULL,
         "updatedAt" = pg_catalog.clock_timestamp()
     WHERE "id" = $1`,
    primaryFixture.inviteId,
  );

  await databaseAdmin.$executeRawUnsafe(
    `UPDATE public."UserInvite"
     SET "expiresAt" = pg_catalog.clock_timestamp() -
           pg_catalog.make_interval(secs => 1),
         "updatedAt" = pg_catalog.clock_timestamp()
     WHERE "id" = $1`,
    primaryFixture.inviteId,
  );
  assert.equal(await callSentAssertion(app, primaryFixture), false);
  await expectSqlState(
    "55000",
    () =>
      databaseAdmin.$executeRawUnsafe(
        `UPDATE public."UserInvite"
         SET "acceptedAt" = pg_catalog.clock_timestamp(),
             "updatedAt" = pg_catalog.clock_timestamp()
         WHERE "id" = $1`,
        primaryFixture.inviteId,
      ),
    /cannot be accepted before verified delivery/iu,
  );
  await databaseAdmin.$executeRawUnsafe(
    `UPDATE public."UserInvite"
     SET "expiresAt" = $2,
         "updatedAt" = pg_catalog.clock_timestamp()
     WHERE "id" = $1`,
    primaryFixture.inviteId,
    primaryFixture.expiresAt,
  );

  await withOutboxDeliveryTriggersDisabled(databaseAdmin, () =>
    databaseAdmin.$executeRawUnsafe(
      `UPDATE public."IdentityMailOutbox"
       SET "expiresAt" = pg_catalog.clock_timestamp() -
             pg_catalog.make_interval(secs => 1),
           "updatedAt" = pg_catalog.clock_timestamp()
       WHERE "id" = $1`,
      primaryFixture.outboxId,
    ),
  );
  assert.equal(await callSentAssertion(app, primaryFixture), false);
  await expectSqlState(
    "55000",
    () =>
      databaseAdmin.$executeRawUnsafe(
        `UPDATE public."UserInvite"
         SET "acceptedAt" = pg_catalog.clock_timestamp(),
             "updatedAt" = pg_catalog.clock_timestamp()
         WHERE "id" = $1`,
        primaryFixture.inviteId,
      ),
    /cannot be accepted before verified delivery/iu,
  );
  await withOutboxDeliveryTriggersDisabled(databaseAdmin, () =>
    databaseAdmin.$executeRawUnsafe(
      `UPDATE public."IdentityMailOutbox"
       SET "expiresAt" = $2,
           "updatedAt" = pg_catalog.clock_timestamp()
       WHERE "id" = $1`,
      primaryFixture.outboxId,
      primaryFixture.expiresAt,
    ),
  );

  await databaseAdmin.$executeRawUnsafe(
    `UPDATE public."Tenant"
     SET "trialEndsAt" = pg_catalog.clock_timestamp() -
           pg_catalog.make_interval(secs => 1),
         "updatedAt" = pg_catalog.clock_timestamp()
     WHERE "id" = $1`,
    primaryFixture.tenantId,
  );
  assert.equal(await callSentAssertion(app, primaryFixture), false);
  await expectSqlState(
    "55000",
    () =>
      databaseAdmin.$executeRawUnsafe(
        `UPDATE public."UserInvite"
         SET "acceptedAt" = pg_catalog.clock_timestamp(),
             "updatedAt" = pg_catalog.clock_timestamp()
         WHERE "id" = $1`,
        primaryFixture.inviteId,
      ),
    /cannot be accepted before verified delivery/iu,
  );
  await databaseAdmin.$executeRawUnsafe(
    `UPDATE public."Tenant"
     SET "trialEndsAt" = pg_catalog.clock_timestamp() +
           pg_catalog.make_interval(secs => 3600),
         "updatedAt" = pg_catalog.clock_timestamp()
     WHERE "id" = $1`,
    primaryFixture.tenantId,
  );
  assert.equal(await callSentAssertion(app, primaryFixture), true);

  const [acceptanceClock] = await databaseAdmin.$queryRawUnsafe(
    `SELECT pg_catalog.clock_timestamp() AS db_now`,
  );
  const submittedAcceptedAt = new Date("2001-01-01T00:00:00.000Z");
  await databaseAdmin.$executeRawUnsafe(
    `UPDATE public."UserInvite"
     SET "acceptedAt" = $2,
         "updatedAt" = pg_catalog.clock_timestamp()
     WHERE "id" = $1`,
    primaryFixture.inviteId,
    submittedAcceptedAt,
  );
  const [accepted] = await databaseAdmin.$queryRawUnsafe(
    `SELECT "acceptedAt" AS accepted_at
     FROM public."UserInvite"
     WHERE "id" = $1`,
    primaryFixture.inviteId,
  );
  assert.ok(accepted?.accepted_at instanceof Date);
  assert.ok(accepted.accepted_at.getTime() >= acceptanceClock.db_now.getTime());
  assert.notEqual(
    accepted.accepted_at.getTime(),
    submittedAcceptedAt.getTime(),
  );

  const ordinaryInviteId = await insertOrdinaryInvite(
    databaseAdmin,
    primaryFixture.tenantId,
    `${suffix}-ordinary`,
  );
  await databaseAdmin.$executeRawUnsafe(
    `UPDATE public."UserInvite"
     SET "acceptedAt" = pg_catalog.clock_timestamp(),
         "updatedAt" = pg_catalog.clock_timestamp()
     WHERE "id" = $1`,
    ordinaryInviteId,
  );
  const [ordinary] = await databaseAdmin.$queryRawUnsafe(
    `SELECT "acceptedAt" AS accepted_at
     FROM public."UserInvite"
     WHERE "id" = $1`,
    ordinaryInviteId,
  );
  assert.ok(ordinary?.accepted_at instanceof Date);

  const ambiguousFixture = deliveryFixture(
    primaryFixture.tenantId,
    `${suffix}-ambiguous`,
  );
  await insertDeliveryAggregate(databaseAdmin, ambiguousFixture, {
    tenantExists: true,
    current176: true,
  });
  const ambiguousOwner = "b".repeat(64);
  const ambiguousToken = "f".repeat(64);
  const ambiguousClaim = await callClaim(
    workerA,
    primaryFixture.tenantId,
    ambiguousOwner,
    ambiguousToken,
    CONFIG_DIGEST,
  );
  assert.equal(ambiguousClaim.decision, "CLAIMED");
  await callProviderMark(workerA, {
    outboxId: ambiguousFixture.outboxId,
    leaseVersion: 1,
    leaseOwnerDigest: ambiguousOwner,
    leaseTokenDigest: ambiguousToken,
    providerAttemptKey: randomUUID(),
    providerAuthorityDigest: CONFIG_DIGEST,
    messageIdDigest: "0".repeat(64),
  });
  await databaseAdmin.$executeRawUnsafe(
    `UPDATE public."UserInvite"
     SET "email" = $2,
         "revokedAt" = pg_catalog.clock_timestamp(),
         "updatedAt" = pg_catalog.clock_timestamp()
     WHERE "id" = $1`,
    ambiguousFixture.inviteId,
    `${suffix}.marked..poison@identity-mail.example.test`,
  );
  await expectSqlState(
    "42501",
    () =>
      callReap(
        workerA,
        primaryFixture.tenantId,
        WRONG_CONFIG_DIGEST,
        WORKER_ACTOR_DIGEST,
        100,
      ),
    /configuration is not enrolled/iu,
  );
  const ambiguousMarked = await readOutbox(
    databaseAdmin,
    ambiguousFixture.outboxId,
  );
  assert.equal(ambiguousMarked.secret_ciphertext, null);
  const acknowledgeDelay = Math.max(
    0,
    ambiguousMarked.provider_acknowledge_until.getTime() - Date.now() + 250,
  );
  await wait(acknowledgeDelay);
  const reapReceipt = await callReap(
    workerA,
    primaryFixture.tenantId,
    CONFIG_DIGEST,
    WORKER_ACTOR_DIGEST,
    100,
  );
  assert.equal(reapReceipt.decision, "COMPLETED");
  assert.equal(reapReceipt.processed, 1);
  const quarantined = await readOutbox(
    databaseAdmin,
    ambiguousFixture.outboxId,
  );
  assert.equal(quarantined.status, "RECONCILIATION_REQUIRED");
  assert.equal(quarantined.provider_outcome_class, "AMBIGUOUS");
  assert.equal(quarantined.state_reason_code, "PROVIDER_ACK_TIMEOUT");
  assert.equal(quarantined.secret_ciphertext, null);
  const reconciledDeadReceipt = await callReconcile(databaseAdmin, {
    outboxId: ambiguousFixture.outboxId,
    transitionRevision: 4,
    resolution: "DEAD",
    evidenceDigest: "8".repeat(64),
    actorDigest: "9".repeat(64),
  });
  assert.deepEqual(reconciledDeadReceipt, {
    schemaVersion: 1,
    operation: "RECONCILE_INITIAL_OWNER_MAIL",
    decision: "DEAD",
    outboxId: ambiguousFixture.outboxId,
    transitionRevision: 5,
    actorDigest: "9".repeat(64),
  });
  const reconciledDeadState = await readOutbox(
    databaseAdmin,
    ambiguousFixture.outboxId,
  );
  assert.equal(reconciledDeadState.status, "DEAD");
  assert.equal(reconciledDeadState.provider_outcome_class, "RESOLVED_DEAD");
  assert.equal(reconciledDeadState.state_reason_code, "RECONCILED_NOT_SENT");

  const pendingPoisonFixture = deliveryFixture(
    primaryFixture.tenantId,
    `${suffix}-pending-poison`,
  );
  await insertDeliveryAggregate(databaseAdmin, pendingPoisonFixture, {
    tenantExists: true,
    current176: true,
  });
  await databaseAdmin.$executeRawUnsafe(
    `UPDATE public."UserInvite"
     SET "email" = $2,
         "updatedAt" = pg_catalog.clock_timestamp()
     WHERE "id" = $1`,
    pendingPoisonFixture.inviteId,
    `${suffix}.pending..poison@identity-mail.example.test`,
  );
  const pendingPoisonBeforeClaim = await readTenantStateFingerprint(
    databaseAdmin,
    primaryFixture.tenantId,
  );
  const pendingPoisonClaim = await callClaim(
    workerA,
    primaryFixture.tenantId,
    "1".repeat(64),
    "2".repeat(64),
    CONFIG_DIGEST,
  );
  assert.equal(pendingPoisonClaim.decision, "EMPTY");
  assert.deepEqual(
    await readTenantStateFingerprint(databaseAdmin, primaryFixture.tenantId),
    pendingPoisonBeforeClaim,
  );
  const pendingPoisonReap = await callReap(
    workerA,
    primaryFixture.tenantId,
    CONFIG_DIGEST,
    WORKER_ACTOR_DIGEST,
    100,
  );
  assert.equal(pendingPoisonReap.decision, "COMPLETED");
  assert.equal(pendingPoisonReap.processed, 1);
  const pendingPoisonState = await readOutbox(
    databaseAdmin,
    pendingPoisonFixture.outboxId,
  );
  assert.equal(pendingPoisonState.status, "CANCELED");
  assert.equal(pendingPoisonState.state_reason_code, "INVITE_NOT_DELIVERABLE");
  assert.equal(pendingPoisonState.secret_ciphertext, null);

  const claimedPoisonFixture = deliveryFixture(
    primaryFixture.tenantId,
    `${suffix}-claimed-poison`,
  );
  await insertDeliveryAggregate(databaseAdmin, claimedPoisonFixture, {
    tenantExists: true,
    current176: true,
  });
  const claimedPoisonOwner = "3".repeat(64);
  const claimedPoisonToken = "4".repeat(64);
  const claimedPoisonClaim = await callClaim(
    workerA,
    primaryFixture.tenantId,
    claimedPoisonOwner,
    claimedPoisonToken,
    CONFIG_DIGEST,
  );
  assert.equal(claimedPoisonClaim.decision, "CLAIMED");
  await databaseAdmin.$executeRawUnsafe(
    `UPDATE public."UserInvite"
     SET "email" = $2,
         "updatedAt" = pg_catalog.clock_timestamp()
     WHERE "id" = $1`,
    claimedPoisonFixture.inviteId,
    `${suffix}.claimed..poison@identity-mail.example.test`,
  );
  const claimedPoisonCancel = await callProviderMark(workerA, {
    outboxId: claimedPoisonFixture.outboxId,
    leaseVersion: 1,
    leaseOwnerDigest: claimedPoisonOwner,
    leaseTokenDigest: claimedPoisonToken,
    providerAttemptKey: randomUUID(),
    providerAuthorityDigest: CONFIG_DIGEST,
    messageIdDigest: "5".repeat(64),
  });
  assert.equal(claimedPoisonCancel.decision, "CANCELED");
  assert.equal(claimedPoisonCancel.reasonCode, "NOT_DELIVERABLE");
  const claimedPoisonState = await readOutbox(
    databaseAdmin,
    claimedPoisonFixture.outboxId,
  );
  assert.equal(claimedPoisonState.status, "CANCELED");
  assert.equal(claimedPoisonState.provider_attempt_key, null);
  assert.equal(claimedPoisonState.secret_ciphertext, null);

  const reconciledSentFixture = deliveryFixture(
    primaryFixture.tenantId,
    `${suffix}-reconciled-sent`,
  );
  await insertDeliveryAggregate(databaseAdmin, reconciledSentFixture, {
    tenantExists: true,
    current176: true,
  });
  const reconciledSentOwner = "6".repeat(64);
  const reconciledSentToken = "7".repeat(64);
  const reconciledSentClaim = await callClaim(
    workerA,
    primaryFixture.tenantId,
    reconciledSentOwner,
    reconciledSentToken,
    CONFIG_DIGEST,
  );
  assert.equal(reconciledSentClaim.decision, "CLAIMED");
  await callProviderMark(workerA, {
    outboxId: reconciledSentFixture.outboxId,
    leaseVersion: 1,
    leaseOwnerDigest: reconciledSentOwner,
    leaseTokenDigest: reconciledSentToken,
    providerAttemptKey: randomUUID(),
    providerAuthorityDigest: CONFIG_DIGEST,
    messageIdDigest: "a".repeat(64),
  });
  const ambiguousCompletion = await callComplete(workerA, {
    outboxId: reconciledSentFixture.outboxId,
    leaseVersion: 1,
    leaseOwnerDigest: reconciledSentOwner,
    leaseTokenDigest: reconciledSentToken,
    outcomeCode: "PROVIDER_AMBIGUOUS",
    terminalAckDigest: "b".repeat(64),
  });
  assert.equal(ambiguousCompletion.decision, "RECONCILIATION_REQUIRED");
  const reconciledSentReceipt = await callReconcile(databaseAdmin, {
    outboxId: reconciledSentFixture.outboxId,
    transitionRevision: 4,
    resolution: "SENT",
    evidenceDigest: "c".repeat(64),
    actorDigest: "d".repeat(64),
  });
  assert.deepEqual(reconciledSentReceipt, {
    schemaVersion: 1,
    operation: "RECONCILE_INITIAL_OWNER_MAIL",
    decision: "SENT",
    outboxId: reconciledSentFixture.outboxId,
    transitionRevision: 5,
    actorDigest: "d".repeat(64),
  });
  const reconciledSentState = await readOutbox(
    databaseAdmin,
    reconciledSentFixture.outboxId,
  );
  assert.equal(reconciledSentState.status, "SENT");
  assert.equal(reconciledSentState.provider_outcome_class, "RESOLVED_SENT");
  assert.equal(reconciledSentState.state_reason_code, null);

  const revokeRaceFixture = deliveryFixture(
    primaryFixture.tenantId,
    `${suffix}-revoke-race`,
  );
  await insertDeliveryAggregate(databaseAdmin, revokeRaceFixture, {
    tenantExists: true,
    current176: true,
  });
  const revokeRaceOwner = "1".repeat(64);
  const revokeRaceToken = "2".repeat(64);
  const revokeRaceClaim = await callClaim(
    workerA,
    primaryFixture.tenantId,
    revokeRaceOwner,
    revokeRaceToken,
    CONFIG_DIGEST,
  );
  assert.equal(revokeRaceClaim.decision, "CLAIMED");
  const revokeLocked = deferred();
  const releaseRevoke = deferred();
  const revokeTransaction = databaseAdmin.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(
        `UPDATE public."UserInvite"
         SET "revokedAt" = pg_catalog.clock_timestamp(),
             "updatedAt" = pg_catalog.clock_timestamp()
         WHERE "id" = $1`,
        revokeRaceFixture.inviteId,
      );
      revokeLocked.resolve();
      await releaseRevoke.promise;
    },
    { maxWait: 5_000, timeout: 20_000 },
  );
  await revokeLocked.promise;
  const revokeLosesMarker = callProviderMark(workerB, {
    outboxId: revokeRaceFixture.outboxId,
    leaseVersion: 1,
    leaseOwnerDigest: revokeRaceOwner,
    leaseTokenDigest: revokeRaceToken,
    providerAttemptKey: randomUUID(),
    providerAuthorityDigest: CONFIG_DIGEST,
    messageIdDigest: "3".repeat(64),
  });
  await wait(50);
  releaseRevoke.resolve();
  const [, revokeRaceReceipt] = await Promise.all([
    revokeTransaction,
    revokeLosesMarker,
  ]);
  assert.equal(revokeRaceReceipt.decision, "CANCELED");
  assert.equal(revokeRaceReceipt.reasonCode, "NOT_DELIVERABLE");
  const revokeRaceState = await readOutbox(
    databaseAdmin,
    revokeRaceFixture.outboxId,
  );
  assert.equal(revokeRaceState.status, "CANCELED");
  assert.equal(revokeRaceState.provider_attempt_key, null);
  assert.equal(revokeRaceState.secret_ciphertext, null);

  const markerRaceFixture = deliveryFixture(
    primaryFixture.tenantId,
    `${suffix}-marker-race`,
  );
  await insertDeliveryAggregate(databaseAdmin, markerRaceFixture, {
    tenantExists: true,
    current176: true,
  });
  const markerRaceOwner = "4".repeat(64);
  const markerRaceToken = "5".repeat(64);
  const markerRaceClaim = await callClaim(
    workerA,
    primaryFixture.tenantId,
    markerRaceOwner,
    markerRaceToken,
    CONFIG_DIGEST,
  );
  assert.equal(markerRaceClaim.decision, "CLAIMED");
  const markerApplied = deferred();
  const releaseMarker = deferred();
  const markerAttemptKey = randomUUID();
  const markerTransaction = workerA.$transaction(
    async (tx) => {
      const receipt = await callProviderMark(tx, {
        outboxId: markerRaceFixture.outboxId,
        leaseVersion: 1,
        leaseOwnerDigest: markerRaceOwner,
        leaseTokenDigest: markerRaceToken,
        providerAttemptKey: markerAttemptKey,
        providerAuthorityDigest: CONFIG_DIGEST,
        messageIdDigest: "6".repeat(64),
      });
      markerApplied.resolve();
      await releaseMarker.promise;
      return receipt;
    },
    { maxWait: 5_000, timeout: 20_000 },
  );
  await markerApplied.promise;
  const markerRaceRevoke = databaseAdmin.$executeRawUnsafe(
    `UPDATE public."UserInvite"
     SET "revokedAt" = pg_catalog.clock_timestamp(),
         "updatedAt" = pg_catalog.clock_timestamp()
     WHERE "id" = $1`,
    markerRaceFixture.inviteId,
  );
  await wait(50);
  releaseMarker.resolve();
  const [markerRaceReceipt] = await Promise.all([
    markerTransaction,
    markerRaceRevoke,
  ]);
  assert.equal(markerRaceReceipt.decision, "MARKED");
  const markerRaceMarked = await readOutbox(
    databaseAdmin,
    markerRaceFixture.outboxId,
  );
  assert.equal(markerRaceMarked.status, "CLAIMED");
  assert.equal(markerRaceMarked.provider_attempt_key, markerAttemptKey);
  assert.equal(markerRaceMarked.secret_ciphertext, null);
  const markerRaceAmbiguous = await callComplete(workerA, {
    outboxId: markerRaceFixture.outboxId,
    leaseVersion: 1,
    leaseOwnerDigest: markerRaceOwner,
    leaseTokenDigest: markerRaceToken,
    outcomeCode: "PROVIDER_AMBIGUOUS",
    terminalAckDigest: "7".repeat(64),
  });
  assert.equal(markerRaceAmbiguous.decision, "RECONCILIATION_REQUIRED");
  const markerRaceResolved = await callReconcile(databaseAdmin, {
    outboxId: markerRaceFixture.outboxId,
    transitionRevision: 4,
    resolution: "DEAD",
    evidenceDigest: "8".repeat(64),
    actorDigest: "9".repeat(64),
  });
  assert.equal(markerRaceResolved.decision, "DEAD");

  const expiredFixture = deliveryFixture(
    primaryFixture.tenantId,
    `${suffix}-expired`,
  );
  expiredFixture.expiresAt = new Date(Date.now() - 5_000);
  const budgetFixture = deliveryFixture(
    primaryFixture.tenantId,
    `${suffix}-attempt-budget`,
  );
  const retryWindowFixture = deliveryFixture(
    primaryFixture.tenantId,
    `${suffix}-retry-window`,
  );
  for (const lifecycleFixture of [
    expiredFixture,
    budgetFixture,
    retryWindowFixture,
  ]) {
    await insertDeliveryAggregate(databaseAdmin, lifecycleFixture, {
      tenantExists: true,
      current176: true,
    });
  }
  await withOutboxDeliveryTriggersDisabled(databaseAdmin, async () => {
    await databaseAdmin.$executeRawUnsafe(
      `UPDATE public."IdentityMailOutbox"
       SET "status" = 'RETRY'::public."IdentityMailOutboxStatus",
           "attempts" = 3,
           "leaseVersion" = 3,
           "transitionRevision" = 4,
           "availableAt" = pg_catalog.clock_timestamp() -
             pg_catalog.make_interval(secs => 1),
           "stateReasonCode" = 'PRE_PROVIDER_TRANSIENT',
           "updatedAt" = pg_catalog.clock_timestamp()
       WHERE "id" = $1`,
      budgetFixture.outboxId,
    );
    await databaseAdmin.$executeRawUnsafe(
      `UPDATE public."IdentityMailOutbox"
       SET "status" = 'RETRY'::public."IdentityMailOutboxStatus",
           "attempts" = 1,
           "leaseVersion" = 1,
           "transitionRevision" = 2,
           "availableAt" = "expiresAt",
           "stateReasonCode" = 'PRE_PROVIDER_TRANSIENT',
           "updatedAt" = pg_catalog.clock_timestamp()
       WHERE "id" = $1`,
      retryWindowFixture.outboxId,
    );
  });
  const lifecycleReap = await callReap(
    workerA,
    primaryFixture.tenantId,
    CONFIG_DIGEST,
    WORKER_ACTOR_DIGEST,
    100,
  );
  assert.equal(lifecycleReap.decision, "COMPLETED");
  assert.equal(lifecycleReap.processed, 3);
  const expiredState = await readOutbox(databaseAdmin, expiredFixture.outboxId);
  const budgetState = await readOutbox(databaseAdmin, budgetFixture.outboxId);
  const retryWindowState = await readOutbox(
    databaseAdmin,
    retryWindowFixture.outboxId,
  );
  assert.equal(expiredState.status, "CANCELED");
  assert.equal(expiredState.state_reason_code, "INVITE_NOT_DELIVERABLE");
  assert.equal(expiredState.secret_ciphertext, null);
  assert.equal(budgetState.status, "DEAD");
  assert.equal(budgetState.state_reason_code, "ATTEMPT_BUDGET_EXHAUSTED");
  assert.equal(budgetState.secret_ciphertext, null);
  assert.equal(retryWindowState.status, "CANCELED");
  assert.equal(retryWindowState.state_reason_code, "RETRY_WINDOW_EXHAUSTED");
  assert.equal(retryWindowState.secret_ciphertext, null);

  const primaryEvents = await readEvents(
    databaseAdmin,
    primaryFixture.outboxId,
  );
  assert.deepEqual(
    primaryEvents.map((event) => event.event_type),
    [
      "CLAIMED",
      "PRE_PROVIDER_RETRY",
      "CLAIMED",
      "PROVIDER_MARKED",
      "PROVIDER_ACCEPTED",
    ],
  );
  const ambiguousEvents = await readEvents(
    databaseAdmin,
    ambiguousFixture.outboxId,
  );
  assert.deepEqual(
    ambiguousEvents.map((event) => event.event_type),
    ["CLAIMED", "PROVIDER_MARKED", "REAP_AMBIGUOUS", "RECONCILED_DEAD"],
  );
  const pendingPoisonEvents = await readEvents(
    databaseAdmin,
    pendingPoisonFixture.outboxId,
  );
  assert.deepEqual(
    pendingPoisonEvents.map((event) => event.event_type),
    ["REAP_CANCELED"],
  );
  assert.deepEqual(
    pendingPoisonEvents.map((event) => event.actor_digest),
    [WORKER_ACTOR_DIGEST],
  );
  const claimedPoisonEvents = await readEvents(
    databaseAdmin,
    claimedPoisonFixture.outboxId,
  );
  assert.deepEqual(
    claimedPoisonEvents.map((event) => event.event_type),
    ["CLAIMED", "CANCELED"],
  );
  assert.deepEqual(
    claimedPoisonEvents.map((event) => event.actor_digest),
    [null, null],
  );
  assert.deepEqual(
    primaryEvents.map((event) => event.actor_digest),
    [null, null, null, null, null],
  );
  assert.deepEqual(
    ambiguousEvents.map((event) => event.actor_digest),
    [null, null, WORKER_ACTOR_DIGEST, "9".repeat(64)],
  );
  const reconciledSentEvents = await readEvents(
    databaseAdmin,
    reconciledSentFixture.outboxId,
  );
  assert.deepEqual(
    reconciledSentEvents.map((event) => event.event_type),
    ["CLAIMED", "PROVIDER_MARKED", "PROVIDER_AMBIGUOUS", "RECONCILED_SENT"],
  );
  assert.deepEqual(
    reconciledSentEvents.map((event) => event.actor_digest),
    [null, null, null, "d".repeat(64)],
  );
  const revokeRaceEvents = await readEvents(
    databaseAdmin,
    revokeRaceFixture.outboxId,
  );
  assert.deepEqual(
    revokeRaceEvents.map((event) => event.event_type),
    ["CLAIMED", "CANCELED"],
  );
  assert.deepEqual(
    revokeRaceEvents.map((event) => event.actor_digest),
    [null, null],
  );
  const markerRaceEvents = await readEvents(
    databaseAdmin,
    markerRaceFixture.outboxId,
  );
  assert.deepEqual(
    markerRaceEvents.map((event) => event.event_type),
    ["CLAIMED", "PROVIDER_MARKED", "PROVIDER_AMBIGUOUS", "RECONCILED_DEAD"],
  );
  assert.deepEqual(
    markerRaceEvents.map((event) => event.actor_digest),
    [null, null, null, "9".repeat(64)],
  );
  const expiredEvents = await readEvents(
    databaseAdmin,
    expiredFixture.outboxId,
  );
  const budgetEvents = await readEvents(databaseAdmin, budgetFixture.outboxId);
  const retryWindowEvents = await readEvents(
    databaseAdmin,
    retryWindowFixture.outboxId,
  );
  assert.deepEqual(
    expiredEvents.map((event) => [event.event_type, event.actor_digest]),
    [["REAP_CANCELED", WORKER_ACTOR_DIGEST]],
  );
  assert.deepEqual(
    budgetEvents.map((event) => [event.event_type, event.actor_digest]),
    [["REAP_DEAD", WORKER_ACTOR_DIGEST]],
  );
  assert.deepEqual(
    retryWindowEvents.map((event) => [event.event_type, event.actor_digest]),
    [["REAP_CANCELED", WORKER_ACTOR_DIGEST]],
  );
  assert.equal(
    new Set(
      [...primaryEvents, ...ambiguousEvents].map((event) =>
        String(event.transition_revision),
      ),
    ).size >= 5,
    true,
  );

  const maximumRetryPolicy = await exerciseMaximumRetryPolicy({
    databaseAdmin,
    worker: workerA,
    roles,
    suffix,
  });
  const [enrollmentCount] = await databaseAdmin.$queryRawUnsafe(
    `SELECT pg_catalog.count(*)::INTEGER AS count
     FROM public."IdentityMailDeliveryTenantEnrollment"`,
  );
  assert.equal(Number(enrollmentCount?.count), 4);
  const tenantBEvents = await readEvents(
    databaseAdmin,
    tenantBFixture.outboxId,
  );
  assert.deepEqual(
    tenantBEvents.map((event) => event.event_type),
    ["CLAIMED", "CANCELED"],
  );
  const workerPrivileges = await readEffectiveRolePrivileges(
    databaseAdmin,
    roles.workerRoleName,
  );
  const appPrivileges = await readEffectiveRolePrivileges(
    databaseAdmin,
    roles.appRoleName,
  );

  return {
    claimDecisions: claimReceipts.map((receipt) => receipt.decision).sort(),
    nullInputSqlStateCases: 6,
    acceptanceDeniedCases: 9,
    primaryFinalStatus: (
      await readOutbox(databaseAdmin, primaryFixture.outboxId)
    ).status,
    tenantBFinalStatus: tenantBState.status,
    retryDecision: retryReceipt.decision,
    providerMarkerDecision: markReceipt.decision,
    reconciledDeadDecision: reconciledDeadReceipt.decision,
    reconciledSentDecision: reconciledSentReceipt.decision,
    pendingPoisonStatus: pendingPoisonState.status,
    claimedPoisonStatus: claimedPoisonState.status,
    revokeRaceMarkerDecision: revokeRaceReceipt.decision,
    markerRaceMarkerDecision: markerRaceReceipt.decision,
    markerRaceResolution: markerRaceResolved.decision,
    lifecycleReapProcessed: lifecycleReap.processed,
    lifecycleTerminalReasons: [
      expiredState.state_reason_code,
      budgetState.state_reason_code,
      retryWindowState.state_reason_code,
    ],
    maximumRetryPolicy,
    acceptedAt: accepted.accepted_at.toISOString(),
    ordinaryAcceptedAt: ordinary.accepted_at.toISOString(),
    providerNetworkCalls: 0,
    primaryTransitionEvents: primaryEvents.length,
    quarantineTransitionEvents: ambiguousEvents.length,
    tenantBTransitionEvents: tenantBEvents.length,
    actorAttributedEvents: [
      ...ambiguousEvents,
      ...pendingPoisonEvents,
      ...reconciledSentEvents,
      ...markerRaceEvents,
      ...expiredEvents,
      ...budgetEvents,
      ...retryWindowEvents,
    ].filter((event) => event.actor_digest !== null).length,
    workerPrivileges,
    appPrivileges,
    tenantEnrollments: Number(enrollmentCount.count),
  };
}

async function assertCaseExpandApplicationWave(client, tenantId, suffix) {
  const [catalog] = await client.$queryRawUnsafe(`
    SELECT
      EXISTS (
        SELECT 1
        FROM pg_catalog.pg_attribute AS attribute
        WHERE attribute.attrelid =
          'public."GuestGameEntitlement"'::pg_catalog.regclass
          AND attribute.attname = 'sourceRewardId'
          AND attribute.attnum > 0
          AND NOT attribute.attisdropped
      ) AS source_column,
      EXISTS (
        SELECT 1
        FROM pg_catalog.pg_index AS index_row
        WHERE index_row.indexrelid = pg_catalog.to_regclass(
          'public.guest_game_entitlement_source_reward_uidx'
        )
          AND index_row.indisunique
          AND index_row.indisready
          AND index_row.indisvalid
          AND index_row.indislive
      ) AS source_index,
      EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint AS constraint_row
        WHERE constraint_row.conname =
          'GuestGameEntitlement_sourceRewardId_fkey'
          AND constraint_row.conrelid =
            'public."GuestGameEntitlement"'::pg_catalog.regclass
          AND constraint_row.confrelid =
            'public."GuestGameReward"'::pg_catalog.regclass
          AND constraint_row.contype = 'f'
          AND constraint_row.confdeltype = 'r'
          AND constraint_row.confupdtype = 'c'
          AND constraint_row.convalidated
      ) AS source_fk,
      NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint AS constraint_row
        WHERE constraint_row.conname =
          'GuestGameEntitlement_sourceOutcome_distinct_check'
          AND constraint_row.conrelid =
            'public."GuestGameEntitlement"'::pg_catalog.regclass
      ) AS contract_check_absent,
      (
        SELECT pg_catalog.count(*)::INTEGER
        FROM pg_catalog.pg_trigger AS trigger_row
        WHERE trigger_row.tgname IN (
          'GuestGameReward_guard_case_parent_claim',
          'GuestGameEntitlement_capture_legacy_source_reward'
        )
          AND trigger_row.tgenabled = 'O'
          AND NOT trigger_row.tgisinternal
      ) AS compatibility_trigger_count,
      (
        SELECT pg_catalog.count(*)::INTEGER
        FROM (
          VALUES
            ('public."guest_game_reward_guard_case_parent_claim"()'),
            ('public."guest_game_entitlement_capture_legacy_source_reward"()')
        ) AS required("signature")
        WHERE pg_catalog.to_regprocedure(required."signature") IS NOT NULL
      ) AS compatibility_function_count
  `);
  assert.deepEqual(
    {
      sourceColumn: catalog?.source_column,
      sourceIndex: catalog?.source_index,
      sourceFk: catalog?.source_fk,
      contractCheckAbsent: catalog?.contract_check_absent,
      compatibilityTriggerCount: Number(
        catalog?.compatibility_trigger_count ?? -1,
      ),
      compatibilityFunctionCount: Number(
        catalog?.compatibility_function_count ?? -1,
      ),
    },
    {
      sourceColumn: true,
      sourceIndex: true,
      sourceFk: true,
      contractCheckAbsent: true,
      compatibilityTriggerCount: 2,
      compatibilityFunctionCount: 2,
    },
  );

  const profileId = randomUUID();
  const missionId = randomUUID();
  const legacyParentRewardId = randomUUID();
  const sourceAwareParentRewardId = randomUUID();
  const legacyEntitlementId = randomUUID();
  const sourceAwareEntitlementId = randomUUID();

  await client.$executeRawUnsafe(
    `INSERT INTO public."GuestGameProfile" (
       "id", "tenantId", "displayName", "status", "gameActivatedAt",
       "createdAt", "updatedAt"
     ) VALUES ($1, $2, $3, 'ACTIVE', pg_catalog.clock_timestamp(),
       pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp())`,
    profileId,
    tenantId,
    `${suffix}-case-wave`,
  );
  await client.$executeRawUnsafe(
    `INSERT INTO public."GuestGameMission" (
       "id", "tenantId", "name", "status", "missionType",
       "triggerKind", "rewardType", "conditions", "createdAt", "updatedAt"
     ) VALUES (
       $1, $2, $3, 'ACTIVE', 'VISIT', 'MANUAL',
       'LOOT_BOX_ENTITLEMENT', '{}'::JSONB,
       pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp()
     )`,
    missionId,
    tenantId,
    `${suffix}-case-mission`,
  );
  for (const [rewardId, idempotencySuffix] of [
    [legacyParentRewardId, "legacy-parent"],
    [sourceAwareParentRewardId, "source-aware-parent"],
  ]) {
    await client.$executeRawUnsafe(
      `INSERT INTO public."GuestGameReward" (
         "id", "tenantId", "profileId", "missionId", "status", "source",
         "idempotencyKey", "rewardType", "rewardAmount", "rewardLabel",
         "claimRequired", "qualifiedAt", "evidence", "createdAt", "updatedAt"
       ) VALUES (
         $1, $2, $3, $4, 'APPROVED', 'MISSION', $5,
         'LOOT_BOX_ENTITLEMENT', 0, 'Case entitlement', TRUE,
         pg_catalog.clock_timestamp(),
         pg_catalog.jsonb_build_object('fixture', $5),
         pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp()
       )`,
      rewardId,
      tenantId,
      profileId,
      missionId,
      `${suffix}-${idempotencySuffix}`,
    );
  }

  await client.$executeRawUnsafe(
    `INSERT INTO public."GuestGameEntitlement" (
       "id", "tenantId", "profileId", "ruleType", "ruleId", "ruleName",
       "status", "idempotencyKey", "qualifiedAt", "rewardId", "evidence",
       "createdAt", "updatedAt"
     ) VALUES (
       $1, $2, $3, 'LOOT_BOX', $4, 'Legacy alias writer', 'AVAILABLE', $5,
       pg_catalog.clock_timestamp(), $6,
       pg_catalog.jsonb_build_object('writer', 'LEGACY_ALIAS'),
       pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp()
     )`,
    legacyEntitlementId,
    tenantId,
    profileId,
    missionId,
    `${suffix}-legacy-entitlement`,
    legacyParentRewardId,
  );
  await client.$executeRawUnsafe(
    `INSERT INTO public."GuestGameEntitlement" (
       "id", "tenantId", "profileId", "ruleType", "ruleId", "ruleName",
       "status", "idempotencyKey", "qualifiedAt", "sourceRewardId",
       "evidence", "createdAt", "updatedAt"
     ) VALUES (
       $1, $2, $3, 'LOOT_BOX', $4, 'Source-aware writer', 'AVAILABLE', $5,
       pg_catalog.clock_timestamp(), $6,
       pg_catalog.jsonb_build_object('writer', 'SOURCE_REWARD_ID_AWARE'),
       pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp()
     )`,
    sourceAwareEntitlementId,
    tenantId,
    profileId,
    missionId,
    `${suffix}-source-aware-entitlement`,
    sourceAwareParentRewardId,
  );

  const entitlementRows = await client.$queryRawUnsafe(
    `SELECT
       "id", "rewardId" AS reward_id, "sourceRewardId" AS source_reward_id
     FROM public."GuestGameEntitlement"
     WHERE "id" IN ($1, $2)
     ORDER BY "id"`,
    legacyEntitlementId,
    sourceAwareEntitlementId,
  );
  const legacyRow = entitlementRows.find(
    (row) => row.id === legacyEntitlementId,
  );
  const sourceAwareRow = entitlementRows.find(
    (row) => row.id === sourceAwareEntitlementId,
  );
  assert.equal(legacyRow?.reward_id, legacyParentRewardId);
  assert.equal(legacyRow?.source_reward_id, legacyParentRewardId);
  assert.equal(sourceAwareRow?.reward_id, null);
  assert.equal(sourceAwareRow?.source_reward_id, sourceAwareParentRewardId);

  const appWaveUpdated = await client.$executeRawUnsafe(
    `UPDATE public."GuestGameEntitlement"
     SET
       "evidence" = COALESCE("evidence", '{}'::JSONB) ||
         pg_catalog.jsonb_build_object(
           'applicationWave', 'SOURCE_REWARD_ID_AWARE',
           'fixtureWave', 'APPLICATION_WAVE_REHEARSED'
         ),
       "updatedAt" = pg_catalog.clock_timestamp()
     WHERE "id" IN ($1, $2)
       AND "sourceRewardId" IS NOT NULL`,
    legacyEntitlementId,
    sourceAwareEntitlementId,
  );
  assert.equal(appWaveUpdated, 2);

  const [drain] = await client.$queryRawUnsafe(
    `SELECT
       pg_catalog.count(*) FILTER (
         WHERE "sourceRewardId" IS NOT NULL
           AND "rewardId" = "sourceRewardId"
       )::INTEGER AS compatibility_alias_count,
       pg_catalog.count(*) FILTER (
         WHERE "sourceRewardId" IS NOT NULL
           AND "rewardId" = "sourceRewardId"
           AND ("status" = 'CONSUMED' OR "consumedAt" IS NOT NULL)
       )::INTEGER AS blocking_consumed_alias_count,
       pg_catalog.count(*) FILTER (
         WHERE "sourceRewardId" IS NULL
       )::INTEGER AS missing_source_count,
       pg_catalog.count(*) FILTER (
         WHERE "evidence" ->> 'fixtureWave' =
           'APPLICATION_WAVE_REHEARSED'
       )::INTEGER AS application_wave_marker_count
     FROM public."GuestGameEntitlement"
     WHERE "id" IN ($1, $2)`,
    legacyEntitlementId,
    sourceAwareEntitlementId,
  );
  assert.deepEqual(
    {
      compatibilityAliasCount: Number(drain?.compatibility_alias_count ?? -1),
      blockingConsumedAliasCount: Number(
        drain?.blocking_consumed_alias_count ?? -1,
      ),
      missingSourceCount: Number(drain?.missing_source_count ?? -1),
      applicationWaveMarkerCount: Number(
        drain?.application_wave_marker_count ?? -1,
      ),
    },
    {
      compatibilityAliasCount: 1,
      blockingConsumedAliasCount: 0,
      missingSourceCount: 0,
      applicationWaveMarkerCount: 2,
    },
  );

  return {
    profileId,
    missionId,
    legacyEntitlementId,
    sourceAwareEntitlementId,
    legacyParentRewardId,
    sourceAwareParentRewardId,
    evidence: {
      oldAliasWriteCaptured: true,
      sourceAwareWriteAccepted: true,
      compatibilityTriggerCount: 2,
      applicationWaveMarkers: 2,
      productionRestartDrainGate: "NOT_PROVEN_BY_SYNTHETIC_FIXTURE",
      drainBlockingConsumedAliases: 0,
    },
  };
}

async function assertCaseContractWave(client, fixture, tenantId, suffix) {
  const [catalog] = await client.$queryRawUnsafe(`
    SELECT
      (
        SELECT pg_catalog.count(*)::INTEGER
        FROM pg_catalog.pg_trigger AS trigger_row
        WHERE trigger_row.tgname IN (
          'GuestGameReward_guard_case_parent_claim',
          'GuestGameEntitlement_capture_legacy_source_reward'
        )
          AND NOT trigger_row.tgisinternal
      ) AS compatibility_trigger_count,
      (
        SELECT pg_catalog.count(*)::INTEGER
        FROM (
          VALUES
            ('public."guest_game_reward_guard_case_parent_claim"()'),
            ('public."guest_game_entitlement_capture_legacy_source_reward"()')
        ) AS required("signature")
        WHERE pg_catalog.to_regprocedure(required."signature") IS NOT NULL
      ) AS compatibility_function_count,
      EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint AS constraint_row
        WHERE constraint_row.conname =
          'GuestGameEntitlement_sourceOutcome_distinct_check'
          AND constraint_row.conrelid =
            'public."GuestGameEntitlement"'::pg_catalog.regclass
          AND constraint_row.contype = 'c'
          AND constraint_row.convalidated
      ) AS distinct_check_validated
  `);
  assert.deepEqual(
    {
      compatibilityTriggerCount: Number(
        catalog?.compatibility_trigger_count ?? -1,
      ),
      compatibilityFunctionCount: Number(
        catalog?.compatibility_function_count ?? -1,
      ),
      distinctCheckValidated: catalog?.distinct_check_validated,
    },
    {
      compatibilityTriggerCount: 0,
      compatibilityFunctionCount: 0,
      distinctCheckValidated: true,
    },
  );

  const rows = await client.$queryRawUnsafe(
    `SELECT
       "id", "rewardId" AS reward_id, "sourceRewardId" AS source_reward_id,
       "evidence" ->> 'fixtureWave' AS fixture_wave
     FROM public."GuestGameEntitlement"
     WHERE "id" IN ($1, $2)
     ORDER BY "id"`,
    fixture.legacyEntitlementId,
    fixture.sourceAwareEntitlementId,
  );
  assert.equal(rows.length, 2);
  for (const row of rows) {
    assert.equal(row.reward_id, null);
    assert.ok(
      new Set([
        fixture.legacyParentRewardId,
        fixture.sourceAwareParentRewardId,
      ]).has(row.source_reward_id),
    );
    assert.equal(row.fixture_wave, "APPLICATION_WAVE_REHEARSED");
  }

  const outcomeRewardId = randomUUID();
  await client.$executeRawUnsafe(
    `INSERT INTO public."GuestGameReward" (
       "id", "tenantId", "profileId", "status", "source",
       "idempotencyKey", "rewardType", "rewardAmount", "rewardLabel",
       "claimRequired", "qualifiedAt", "evidence", "createdAt", "updatedAt"
     ) VALUES (
       $1, $2, $3, 'APPROVED', 'LOOT_BOX', $4,
       'BONUS', 100, 'Case outcome', FALSE,
       pg_catalog.clock_timestamp(),
       pg_catalog.jsonb_build_object('fixture', 'CONSUMED_OUTCOME'),
       pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp()
     )`,
    outcomeRewardId,
    tenantId,
    fixture.profileId,
    `${suffix}-case-outcome`,
  );
  await client.$executeRawUnsafe(
    `UPDATE public."GuestGameEntitlement"
     SET
       "rewardId" = $2,
       "status" = 'CONSUMED',
       "consumedAt" = pg_catalog.clock_timestamp(),
       "updatedAt" = pg_catalog.clock_timestamp()
     WHERE "id" = $1`,
    fixture.sourceAwareEntitlementId,
    outcomeRewardId,
  );
  const [consumed] = await client.$queryRawUnsafe(
    `SELECT
       "rewardId" AS reward_id,
       "sourceRewardId" AS source_reward_id,
       "status",
       "consumedAt" IS NOT NULL AS consumed
     FROM public."GuestGameEntitlement"
     WHERE "id" = $1`,
    fixture.sourceAwareEntitlementId,
  );
  assert.equal(consumed?.reward_id, outcomeRewardId);
  assert.equal(consumed?.source_reward_id, fixture.sourceAwareParentRewardId);
  assert.notEqual(consumed?.reward_id, consumed?.source_reward_id);
  assert.equal(consumed?.status, "CONSUMED");
  assert.equal(consumed?.consumed, true);

  return {
    compatibilityTriggersRemoved: true,
    compatibilityFunctionsRemoved: true,
    distinctCheckValidated: true,
    normalizedAliasRows: 2,
    consumedOutcomeDistinctFromSource: true,
  };
}

async function assertFinalWorkerRoutineBoundary(
  databaseAdmin,
  workerRoleName,
  workerRoleOid,
) {
  const [row] = await databaseAdmin.$queryRawUnsafe(
    `WITH required("signature") AS (
       VALUES
         ('public."identity_mail_delivery_worker_assert_v1"(text)'),
         ('public."identity_initial_owner_mail_claim_v1"(text,text,text,text)'),
         ('public."identity_initial_owner_mail_provider_mark_v1"(text,integer,text,text,text,text,text)'),
         ('public."identity_initial_owner_mail_complete_v1"(text,integer,text,text,text,text,text)'),
         ('public."identity_initial_owner_mail_reap_v1"(text,text,text,integer)')
     ), routines AS (
       SELECT routine.*
       FROM required
       INNER JOIN pg_catalog.pg_proc AS routine
         ON routine.oid = pg_catalog.to_regprocedure(required."signature")
     ), migration_owner AS (
       SELECT relation.relowner AS owner_oid
       FROM pg_catalog.pg_class AS relation
       WHERE relation.oid = pg_catalog.to_regclass(
         'public."IdentityMailOutbox"'
       )
     ), acl AS (
       SELECT
         routine.oid,
         routine.proowner,
         privilege.grantee,
         privilege.privilege_type,
         privilege.is_grantable
       FROM routines AS routine
       CROSS JOIN LATERAL pg_catalog.aclexplode(
         COALESCE(
           routine.proacl,
           pg_catalog.acldefault('f', routine.proowner)
         )
       ) AS privilege
     )
     SELECT
       (SELECT pg_catalog.count(*)::INTEGER FROM routines)
         AS matched_function_count,
       (
         SELECT pg_catalog.count(*)::INTEGER
         FROM routines, migration_owner
         WHERE routines.proowner <> migration_owner.owner_oid
       ) AS owner_mismatch_count,
       (
         SELECT pg_catalog.count(*)::INTEGER
         FROM routines
         INNER JOIN pg_catalog.pg_language AS language
           ON language.oid = routines.prolang
         WHERE NOT routines.prosecdef
            OR routines.provolatile <> 'v'
            OR language.lanname <> 'plpgsql'
            OR routines.proconfig IS DISTINCT FROM
              ARRAY['search_path=pg_catalog']::TEXT[]
       ) AS metadata_mismatch_count,
       (
         SELECT pg_catalog.count(*)::INTEGER
         FROM acl
         WHERE acl.grantee = $2::OID
           AND acl.privilege_type = 'EXECUTE'
       ) AS worker_execute_count,
       (
         SELECT pg_catalog.count(*)::INTEGER
         FROM acl
         WHERE acl.grantee = $2::OID
           AND acl.is_grantable
       ) AS worker_grant_option_count,
       (
         SELECT pg_catalog.count(*)::INTEGER
         FROM acl
         WHERE acl.grantee = 0
       ) AS public_privilege_count,
       (
         SELECT pg_catalog.count(*)::INTEGER
         FROM acl
         WHERE acl.grantee NOT IN (acl.proowner, $2::OID)
            OR acl.privilege_type <> 'EXECUTE'
       ) AS unexpected_privilege_count,
       EXISTS (
         SELECT 1
         FROM pg_catalog.pg_roles AS role_row
         WHERE role_row.oid = $2::OID
           AND role_row.rolname = $1
           AND role_row.rolcanlogin
           AND NOT role_row.rolsuper
           AND NOT role_row.rolinherit
           AND NOT role_row.rolcreaterole
           AND NOT role_row.rolcreatedb
           AND NOT role_row.rolreplication
           AND NOT role_row.rolbypassrls
       ) AS worker_role_safe`,
    workerRoleName,
    workerRoleOid,
  );
  const evidence = {
    matchedFunctionCount: Number(row?.matched_function_count ?? -1),
    ownerMismatchCount: Number(row?.owner_mismatch_count ?? -1),
    metadataMismatchCount: Number(row?.metadata_mismatch_count ?? -1),
    workerExecuteCount: Number(row?.worker_execute_count ?? -1),
    workerGrantOptionCount: Number(row?.worker_grant_option_count ?? -1),
    publicPrivilegeCount: Number(row?.public_privilege_count ?? -1),
    unexpectedPrivilegeCount: Number(row?.unexpected_privilege_count ?? -1),
    workerRoleSafe: row?.worker_role_safe,
  };
  assert.deepEqual(evidence, {
    matchedFunctionCount: 5,
    ownerMismatchCount: 0,
    metadataMismatchCount: 0,
    workerExecuteCount: 5,
    workerGrantOptionCount: 0,
    publicPrivilegeCount: 0,
    unexpectedPrivilegeCount: 0,
    workerRoleSafe: true,
  });
  return evidence;
}

async function readWorkerRoutineDigests(databaseAdmin) {
  const rows = await databaseAdmin.$queryRawUnsafe(
    `WITH required("ordinal", "signature") AS (
       VALUES
         (1, 'public."identity_mail_delivery_worker_assert_v1"(text)'),
         (2, 'public."identity_initial_owner_mail_claim_v1"(text,text,text,text)'),
         (3, 'public."identity_initial_owner_mail_provider_mark_v1"(text,integer,text,text,text,text,text)'),
         (4, 'public."identity_initial_owner_mail_complete_v1"(text,integer,text,text,text,text,text)'),
         (5, 'public."identity_initial_owner_mail_reap_v1"(text,text,text,integer)')
     )
     SELECT
       required."signature" AS signature,
       pg_catalog.encode(
         pg_catalog.sha256(
           pg_catalog.convert_to(
             pg_catalog.pg_get_functiondef(routine.oid),
             'UTF8'
           )
         ),
         'hex'
       ) AS definition_sha256,
       pg_catalog.encode(
         pg_catalog.sha256(
           pg_catalog.convert_to(routine.prosrc, 'UTF8')
         ),
         'hex'
       ) AS prosrc_sha256
     FROM required
     INNER JOIN pg_catalog.pg_proc AS routine
       ON routine.oid = pg_catalog.to_regprocedure(required."signature")
     ORDER BY required."ordinal"`,
  );
  assert.equal(rows.length, 5);
  const evidence = Object.fromEntries(
    rows.map((row) => {
      assert.equal(typeof row?.signature, "string");
      assert.match(row?.definition_sha256, /^[a-f0-9]{64}$/u);
      assert.match(row?.prosrc_sha256, /^[a-f0-9]{64}$/u);
      return [
        row.signature,
        {
          definitionSha256: row.definition_sha256,
          prosrcSha256: row.prosrc_sha256,
        },
      ];
    }),
  );
  assert.equal(Object.keys(evidence).length, 5);
  return evidence;
}

async function runRealSmoke() {
  assert.equal(process.env.NODE_ENV, "test", "Smoke requires NODE_ENV=test.");
  assert.equal(
    process.env.IDENTITY_MAIL_DELIVERY_UPGRADE_SMOKE_CONFIRM,
    REQUIRED_CONFIRMATION,
    `Set IDENTITY_MAIL_DELIVERY_UPGRADE_SMOKE_CONFIRM=${REQUIRED_CONFIRMATION}.`,
  );
  const rawSourceUrl = process.env.DATABASE_URL;
  const { parsed: sourceUrl, databaseName: sourceDatabaseName } =
    parseSafeSourceDatabaseUrl(rawSourceUrl);
  const suffix = randomBytes(8).toString("hex");
  const upgradeDatabaseName = `lp_identity_mail_upgrade_ci_${suffix}`;
  const originDatabaseName = `lp_identity_mail_origin_ci_${suffix}`;
  const cleanDatabaseName = `lp_identity_mail_clean_ci_${suffix}`;
  const legacyRejectDatabaseName = `lp_identity_mail_legacy_reject_ci_${suffix}`;
  const claimRejectDatabaseName = `lp_identity_mail_claim_reject_ci_${suffix}`;
  const aclRejectDatabaseName = `lp_identity_mail_acl_reject_ci_${suffix}`;
  const roles = {
    workerRoleName: `lp_identity_mail_worker_${suffix}`,
    hostileRoleName: `lp_identity_mail_hostile_${suffix}`,
    appRoleName: `lp_identity_mail_app_${suffix}`,
  };
  const credentials = {
    [roles.workerRoleName]: randomBytes(32).toString("hex"),
    [roles.hostileRoleName]: randomBytes(32).toString("hex"),
    [roles.appRoleName]: randomBytes(32).toString("hex"),
  };
  const upgradeUrl = databaseUrl(sourceUrl, upgradeDatabaseName);
  const originUrl = databaseUrl(sourceUrl, originDatabaseName);
  const cleanUrl = databaseUrl(sourceUrl, cleanDatabaseName);
  const legacyRejectUrl = databaseUrl(sourceUrl, legacyRejectDatabaseName);
  const claimRejectUrl = databaseUrl(sourceUrl, claimRejectDatabaseName);
  const aclRejectUrl = databaseUrl(sourceUrl, aclRejectDatabaseName);
  const admin = new PrismaClient({ log: [] });
  let databaseAdmin = null;
  let originAdmin = null;
  let cleanAdmin = null;
  let legacyRejectAdmin = null;
  let claimRejectAdmin = null;
  let aclRejectAdmin = null;
  let workerA = null;
  let workerB = null;
  let originWorker = null;
  let hostile = null;
  let app = null;
  let tempRoot = null;
  let clusterLockAcquired = false;
  let upgradeDatabaseCreated = false;
  let originDatabaseCreated = false;
  let cleanDatabaseCreated = false;
  let legacyRejectDatabaseCreated = false;
  let claimRejectDatabaseCreated = false;
  let aclRejectDatabaseCreated = false;
  const createdRoles = [];

  try {
    await assertTestSuperuser(admin, sourceDatabaseName);
    await acquireClusterLock(admin);
    clusterLockAcquired = true;
    tempRoot = await mkdtemp(join(tmpdir(), TEMP_ROOT_PREFIX));
    const migrationPlan = await readMigrationPlan();
    const branchArtifact = await createMigrationArtifact(
      tempRoot,
      "branch",
      migrationPlan,
    );
    const originArtifact = await createMigrationArtifact(
      tempRoot,
      "origin",
      migrationPlan,
    );
    const cleanArtifact = await createMigrationArtifact(
      tempRoot,
      "clean",
      migrationPlan,
    );
    await seedManifest(
      branchArtifact,
      migrationPlan.identity176Manifest,
      migrationPlan.identity176Manifest.entries.slice(0, CURRENT_174_COUNT),
    );
    await seedManifest(originArtifact, migrationPlan.originMainManifest);
    await seedManifest(cleanArtifact, migrationPlan.workingManifest);

    await createDatabase(admin, upgradeDatabaseName);
    upgradeDatabaseCreated = true;
    await hardenDatabasePublicAuthority(admin, upgradeDatabaseName);
    await createDatabase(admin, originDatabaseName);
    originDatabaseCreated = true;
    await hardenDatabasePublicAuthority(admin, originDatabaseName);
    await createDatabase(admin, cleanDatabaseName);
    cleanDatabaseCreated = true;
    await hardenDatabasePublicAuthority(admin, cleanDatabaseName);
    await createDatabase(admin, legacyRejectDatabaseName);
    legacyRejectDatabaseCreated = true;
    await createDatabase(admin, claimRejectDatabaseName);
    claimRejectDatabaseCreated = true;
    await createDatabase(admin, aclRejectDatabaseName);
    aclRejectDatabaseCreated = true;
    for (const roleName of Object.values(roles)) {
      await createRole(admin, roleName, credentials[roleName]);
      createdRoles.push(roleName);
    }
    await configureRoles(admin, upgradeDatabaseName, roles);
    await configureRoles(admin, originDatabaseName, roles);

    runMigrateDeploy(branchArtifact.schemaPath, upgradeUrl, "branch-174");
    runMigrateDeploy(
      branchArtifact.schemaPath,
      legacyRejectUrl,
      "legacy-reject-174",
    );
    runMigrateDeploy(
      branchArtifact.schemaPath,
      claimRejectUrl,
      "claim-reject-174",
    );
    runMigrateDeploy(branchArtifact.schemaPath, aclRejectUrl, "acl-reject-174");
    runMigrateDeploy(originArtifact.schemaPath, originUrl, "origin-152");
    runMigrateDeploy(cleanArtifact.schemaPath, cleanUrl, "clean-179");
    databaseAdmin = prismaClient(upgradeUrl);
    originAdmin = prismaClient(originUrl);
    cleanAdmin = prismaClient(cleanUrl);
    legacyRejectAdmin = prismaClient(legacyRejectUrl);
    claimRejectAdmin = prismaClient(claimRejectUrl);
    aclRejectAdmin = prismaClient(aclRejectUrl);
    await assertMigrationState(databaseAdmin, CURRENT_174_COUNT, CURRENT_174);
    await assertMigrationState(
      legacyRejectAdmin,
      CURRENT_174_COUNT,
      CURRENT_174,
    );
    await assertMigrationState(
      claimRejectAdmin,
      CURRENT_174_COUNT,
      CURRENT_174,
    );
    await assertMigrationState(aclRejectAdmin, CURRENT_174_COUNT, CURRENT_174);
    await assertMigrationState(originAdmin, 152, CURRENT_178);
    const originInitialManifest = await assertDatabaseMigrationManifest(
      originAdmin,
      migrationPlan.originMainManifest,
    );
    await assertMigrationState(cleanAdmin, CURRENT_179_COUNT, CURRENT_179);
    const cleanFinalManifest = await assertDatabaseMigrationManifest(
      cleanAdmin,
      migrationPlan.workingManifest,
    );

    const primaryFixture = deliveryFixture(randomUUID(), `${suffix}-primary`);
    await insertTenant(databaseAdmin, primaryFixture);
    const legacyRejectFixture = deliveryFixture(
      randomUUID(),
      `${suffix}-legacy-aad`,
    );
    await insertDeliveryAggregate(legacyRejectAdmin, legacyRejectFixture);

    await addManifestMigration(
      branchArtifact,
      migrationPlan.identity176Manifest,
      CURRENT_175,
    );
    runMigrateDeploy(branchArtifact.schemaPath, upgradeUrl, "branch-175");
    runMigrateDeploy(
      branchArtifact.schemaPath,
      legacyRejectUrl,
      "legacy-reject-175",
    );
    runMigrateDeploy(
      branchArtifact.schemaPath,
      claimRejectUrl,
      "claim-reject-175",
    );
    runMigrateDeploy(branchArtifact.schemaPath, aclRejectUrl, "acl-reject-175");
    await assertEnumIsolation(databaseAdmin, primaryFixture);

    const malformedClaimFixture = deliveryFixture(
      randomUUID(),
      `${suffix}-malformed-claim`,
    );
    malformedClaimFixture.email = `${suffix}.legacy..owner@identity-mail.example.test`;
    await insertMalformedLegacyClaim(claimRejectAdmin, malformedClaimFixture);
    await aclRejectAdmin.$executeRawUnsafe(
      `GRANT SELECT ("id")
       ON TABLE public."IdentityMailOutbox"
       TO ${quoteIdentifier(roles.hostileRoleName)}`,
    );
    const legacyRollbackBefore =
      await readCurrent176RollbackFingerprint(legacyRejectAdmin);
    const claimRollbackBefore =
      await readCurrent176RollbackFingerprint(claimRejectAdmin);
    const aclRollbackBefore =
      await readCurrent176RollbackFingerprint(aclRejectAdmin);
    const current176SqlPath = join(
      migrationPlan.sourcePrismaDir,
      "migrations",
      CURRENT_176,
      "migration.sql",
    );
    const current176SqlDigest = digest(
      await readFile(current176SqlPath, "utf8"),
    );
    assert.equal(
      current176SqlDigest,
      "36e0c3b54a667ff613704e372daa6e2e7f4fd68df91cc15a7df5720740e929ce",
    );
    const legacyRejectStatus = runSqlFileExpectFailure(
      branchArtifact.schemaPath,
      current176SqlPath,
      legacyRejectUrl,
      /LEGACY_RECIPIENT_AAD_REISSUE_REQUIRED/u,
    );
    const claimRejectStatus = runSqlFileExpectFailure(
      branchArtifact.schemaPath,
      current176SqlPath,
      claimRejectUrl,
      /IdentityEmailClaim_email_canonical_check|violated by some row/iu,
    );
    const aclRejectStatus = runSqlFileExpectFailure(
      branchArtifact.schemaPath,
      current176SqlPath,
      aclRejectUrl,
      /inherited unsafe default privileges/iu,
    );
    assert.deepEqual(
      await readCurrent176RollbackFingerprint(legacyRejectAdmin),
      legacyRollbackBefore,
    );
    assert.deepEqual(
      await readCurrent176RollbackFingerprint(claimRejectAdmin),
      claimRollbackBefore,
    );
    assert.deepEqual(
      await readCurrent176RollbackFingerprint(aclRejectAdmin),
      aclRollbackBefore,
    );
    await assertMigrationState(
      legacyRejectAdmin,
      CURRENT_175_COUNT,
      CURRENT_175,
    );
    await assertMigrationState(
      claimRejectAdmin,
      CURRENT_175_COUNT,
      CURRENT_175,
    );
    await assertMigrationState(aclRejectAdmin, CURRENT_175_COUNT, CURRENT_175);

    await addManifestMigration(
      branchArtifact,
      migrationPlan.identity176Manifest,
      CURRENT_176,
    );
    runMigrateDeploy(branchArtifact.schemaPath, upgradeUrl, "branch-176");
    await assertMigrationState(databaseAdmin, CURRENT_176_COUNT, CURRENT_176);
    const branchCheckpointManifest = await assertDatabaseMigrationManifest(
      databaseAdmin,
      migrationPlan.identity176Manifest,
    );
    const branchCheckpointWorkerDigests =
      await readWorkerRoutineDigests(databaseAdmin);
    await assertPopulatedBusinessUpgrade(databaseAdmin, primaryFixture);
    const holdWriterCompatibility = await assertPost176HoldWriterCompatibility(
      databaseAdmin,
      suffix,
    );
    await insertDeliveryAggregate(databaseAdmin, primaryFixture, {
      tenantExists: true,
      current176: true,
    });
    const emailParity = await assertCanonicalEmailParity(
      databaseAdmin,
      primaryFixture.tenantId,
      suffix,
    );

    await addManifestMigration(
      branchArtifact,
      migrationPlan.originMainManifest,
      CURRENT_177,
    );
    runMigrateDeploy(branchArtifact.schemaPath, upgradeUrl, "branch-177");
    await assertMigrationState(databaseAdmin, CURRENT_177_COUNT, CURRENT_177);
    const branchExpandState = await readMigrationOrderEvidence(databaseAdmin);
    const caseWaveFixture = await assertCaseExpandApplicationWave(
      databaseAdmin,
      primaryFixture.tenantId,
      suffix,
    );

    await addManifestMigration(
      branchArtifact,
      migrationPlan.originMainManifest,
      CURRENT_178,
    );
    runMigrateDeploy(branchArtifact.schemaPath, upgradeUrl, "branch-178");
    await assertMigrationState(databaseAdmin, CURRENT_178_COUNT, CURRENT_178);
    const branchContractManifest = await assertDatabaseMigrationManifest(
      databaseAdmin,
      migrationPlan.merged178Manifest,
    );
    const caseContractEvidence = await assertCaseContractWave(
      databaseAdmin,
      caseWaveFixture,
      primaryFixture.tenantId,
      suffix,
    );

    await addManifestMigration(
      branchArtifact,
      migrationPlan.workingManifest,
      CURRENT_179,
    );
    runMigrateDeploy(branchArtifact.schemaPath, upgradeUrl, "branch-179");
    await assertMigrationState(databaseAdmin, CURRENT_179_COUNT, CURRENT_179);
    const branchFinalManifest = await assertDatabaseMigrationManifest(
      databaseAdmin,
      migrationPlan.workingManifest,
    );

    for (const pendingMigration of migrationPlan.identityPendingOnOrigin) {
      await addManifestMigration(
        originArtifact,
        migrationPlan.identity176Manifest,
        pendingMigration.name,
      );
    }
    runMigrateDeploy(
      originArtifact.schemaPath,
      originUrl,
      "origin-identity-tail-178",
    );
    const originPreTerminalOrder =
      await readMigrationOrderEvidence(originAdmin);
    assert.deepEqual(originPreTerminalOrder, {
      completedCount: CURRENT_178_COUNT,
      startedAtHead: CURRENT_176,
      lexicalHead: CURRENT_178,
      unfinishedCount: 0,
    });
    const originPreTerminalManifest = await assertDatabaseMigrationManifest(
      originAdmin,
      migrationPlan.merged178Manifest,
    );

    const current179SqlPath = join(
      migrationPlan.sourcePrismaDir,
      "migrations",
      CURRENT_179,
      "migration.sql",
    );
    const current179SqlDigest = digest(await readFile(current179SqlPath));
    const pre176ManifestEntry = migrationPlan.merged178Manifest.entries.find(
      ({ name }) => name < CURRENT_175,
    );
    assert.ok(pre176ManifestEntry);
    const preTerminalRoutineDigests =
      await readWorkerRoutineDigests(originAdmin);
    await originAdmin.$executeRawUnsafe(
      `UPDATE public."_prisma_migrations"
       SET "checksum" = $1
       WHERE "migration_name" = $2`,
      "9".repeat(64),
      pre176ManifestEntry.name,
    );
    const terminalPre176ManifestRejectStatus = runSqlFileExpectFailure(
      originArtifact.schemaPath,
      current179SqlPath,
      originUrl,
      /exact completed CURRENT_178 migration set/iu,
    );
    await originAdmin.$executeRawUnsafe(
      `UPDATE public."_prisma_migrations"
       SET "checksum" = $1
       WHERE "migration_name" = $2`,
      pre176ManifestEntry.sha256,
      pre176ManifestEntry.name,
    );
    assert.deepEqual(
      await readWorkerRoutineDigests(originAdmin),
      preTerminalRoutineDigests,
    );
    await assertDatabaseMigrationManifest(
      originAdmin,
      migrationPlan.merged178Manifest,
    );
    const exact176Checksum = entryByName(
      migrationPlan.identity176Manifest,
      CURRENT_176,
    ).sha256;
    await originAdmin.$executeRawUnsafe(
      `UPDATE public."_prisma_migrations"
       SET "checksum" = $1
       WHERE "migration_name" = $2`,
      "0".repeat(64),
      CURRENT_176,
    );
    const terminalChecksumRejectStatus = runSqlFileExpectFailure(
      originArtifact.schemaPath,
      current179SqlPath,
      originUrl,
      /exact completed CURRENT_178 migration set/iu,
    );
    await originAdmin.$executeRawUnsafe(
      `UPDATE public."_prisma_migrations"
       SET "checksum" = $1
       WHERE "migration_name" = $2`,
      exact176Checksum,
      CURRENT_176,
    );

    await originAdmin.$executeRawUnsafe(
      `GRANT EXECUTE ON FUNCTION ${WORKER_ASSERT_SIGNATURE}
       TO ${quoteIdentifier(roles.hostileRoleName)}`,
    );
    const terminalAclRejectStatus = runSqlFileExpectFailure(
      originArtifact.schemaPath,
      current179SqlPath,
      originUrl,
      /routine EXECUTE authority is unsafe/iu,
    );
    await originAdmin.$executeRawUnsafe(
      `REVOKE EXECUTE ON FUNCTION ${WORKER_ASSERT_SIGNATURE}
       FROM ${quoteIdentifier(roles.hostileRoleName)}`,
    );

    const [migrationOwner] = await originAdmin.$queryRawUnsafe(`
      SELECT pg_catalog.pg_get_userbyid(relation.relowner) AS owner_name
      FROM pg_catalog.pg_class AS relation
      WHERE relation.oid = pg_catalog.to_regclass(
        'public."IdentityMailOutbox"'
      )
    `);
    assert.equal(typeof migrationOwner?.owner_name, "string");
    const quotedMigrationOwner = quoteIdentifier(migrationOwner.owner_name);
    await originAdmin.$executeRawUnsafe(
      `ALTER FUNCTION ${WORKER_ASSERT_SIGNATURE}
       OWNER TO ${quoteIdentifier(roles.hostileRoleName)}`,
    );
    const terminalOwnerRejectStatus = runSqlFileExpectFailure(
      originArtifact.schemaPath,
      current179SqlPath,
      originUrl,
      /routine ownership is unsafe/iu,
    );
    await originAdmin.$executeRawUnsafe(
      `ALTER FUNCTION ${WORKER_ASSERT_SIGNATURE}
       OWNER TO ${quotedMigrationOwner}`,
    );

    const [exactClaimRoutine] = await originAdmin.$queryRawUnsafe(
      `SELECT
         pg_catalog.pg_get_functiondef(
           pg_catalog.to_regprocedure(
             'public."identity_initial_owner_mail_claim_v1"(text,text,text,text)'
           )
         ) AS definition,
         pg_catalog.encode(
           pg_catalog.sha256(
             pg_catalog.convert_to(routine.prosrc, 'UTF8')
           ),
           'hex'
         ) AS prosrc_sha256
       FROM pg_catalog.pg_proc AS routine
       WHERE routine.oid = pg_catalog.to_regprocedure(
         'public."identity_initial_owner_mail_claim_v1"(text,text,text,text)'
       )`,
    );
    assert.equal(typeof exactClaimRoutine?.definition, "string");
    assert.equal(
      exactClaimRoutine?.prosrc_sha256,
      "f2d56144cba4cbc3ee4626f09e1b5c106347822e500c7cd2310f52553b40b57b",
    );
    await originAdmin.$executeRawUnsafe(
      `CREATE OR REPLACE FUNCTION public."identity_initial_owner_mail_claim_v1"(
         p_tenant_id TEXT,
         p_lease_owner_digest TEXT,
         p_lease_token_digest TEXT,
         p_worker_config_digest TEXT
       )
       RETURNS JSONB
       LANGUAGE plpgsql
       SECURITY DEFINER
       SET search_path = pg_catalog
       AS $tampered_claim$
       BEGIN
         RETURN pg_catalog.jsonb_build_object(
           'decision', 'HOSTILE_BODY_SHOULD_NEVER_RUN'
         );
       END;
       $tampered_claim$`,
    );
    const terminalBodyRejectStatus = runSqlFileExpectFailure(
      originArtifact.schemaPath,
      current179SqlPath,
      originUrl,
      /routine definition or metadata is unsafe/iu,
    );
    await originAdmin.$executeRawUnsafe(exactClaimRoutine.definition);
    const [restoredClaimRoutine] = await originAdmin.$queryRawUnsafe(
      `SELECT pg_catalog.encode(
         pg_catalog.sha256(
           pg_catalog.convert_to(routine.prosrc, 'UTF8')
         ),
         'hex'
       ) AS prosrc_sha256
       FROM pg_catalog.pg_proc AS routine
       WHERE routine.oid = pg_catalog.to_regprocedure(
         'public."identity_initial_owner_mail_claim_v1"(text,text,text,text)'
       )`,
    );
    assert.equal(
      restoredClaimRoutine?.prosrc_sha256,
      exactClaimRoutine.prosrc_sha256,
    );

    roles.workerRoleOid = await roleOid(admin, roles.workerRoleName);
    const originFixture = deliveryFixture(
      randomUUID(),
      `${suffix}-origin-head`,
    );
    await insertTenant(originAdmin, originFixture);
    await insertEnrollment(
      originAdmin,
      originFixture.tenantId,
      roles.workerRoleName,
      roles.workerRoleOid,
    );
    await grantRuntimeBoundaries(originAdmin, roles);
    originWorker = prismaClient(
      databaseUrl(sourceUrl, originDatabaseName, {
        roleName: roles.workerRoleName,
        password: credentials[roles.workerRoleName],
      }),
    );
    const originBeforePreTerminalAssert = await readTenantStateFingerprint(
      originAdmin,
      originFixture.tenantId,
    );
    await expectSqlState(
      "55000",
      () => callWorkerAssert(originWorker, originFixture.tenantId),
      /not CURRENT_176/iu,
    );
    assert.deepEqual(
      await readTenantStateFingerprint(originAdmin, originFixture.tenantId),
      originBeforePreTerminalAssert,
    );

    await addManifestMigration(
      originArtifact,
      migrationPlan.workingManifest,
      CURRENT_179,
    );
    runMigrateDeploy(originArtifact.schemaPath, originUrl, "origin-179");
    await assertMigrationState(originAdmin, CURRENT_179_COUNT, CURRENT_179);
    const originFinalManifest = await assertDatabaseMigrationManifest(
      originAdmin,
      migrationPlan.workingManifest,
    );
    const originBeforePostTerminalManifestTamper =
      await readTenantStateFingerprint(originAdmin, originFixture.tenantId);
    await originAdmin.$executeRawUnsafe(
      `UPDATE public."_prisma_migrations"
       SET "checksum" = $1
       WHERE "migration_name" = $2`,
      "8".repeat(64),
      pre176ManifestEntry.name,
    );
    await expectSqlState(
      "55000",
      () => callWorkerAssert(originWorker, originFixture.tenantId),
      /not CURRENT_179/iu,
    );
    assert.deepEqual(
      await readTenantStateFingerprint(originAdmin, originFixture.tenantId),
      originBeforePostTerminalManifestTamper,
    );
    await originAdmin.$executeRawUnsafe(
      `UPDATE public."_prisma_migrations"
       SET "checksum" = $1
       WHERE "migration_name" = $2`,
      pre176ManifestEntry.sha256,
      pre176ManifestEntry.name,
    );
    await assertDatabaseMigrationManifest(
      originAdmin,
      migrationPlan.workingManifest,
    );
    const originReadyReceipt = await callWorkerAssert(
      originWorker,
      originFixture.tenantId,
    );
    assert.equal(originReadyReceipt?.decision, "READY");
    assert.equal(originReadyReceipt?.migrationHead, CURRENT_179);
    assert.equal(originReadyReceipt?.migrationCount, CURRENT_179_COUNT);
    assert.equal(
      originReadyReceipt?.preterminalManifestDigest,
      PRETERMINAL_178_MANIFEST_DIGEST,
    );
    assert.deepEqual(
      await readTenantStateFingerprint(originAdmin, originFixture.tenantId),
      originBeforePreTerminalAssert,
    );
    const originWorkerRoutineBoundary = await assertFinalWorkerRoutineBoundary(
      originAdmin,
      roles.workerRoleName,
      roles.workerRoleOid,
    );
    const terminalWorkerDigests = await readWorkerRoutineDigests(originAdmin);
    await assertNoDirectTableAccess(originWorker);

    await grantRuntimeBoundaries(databaseAdmin, roles);
    workerA = prismaClient(
      databaseUrl(sourceUrl, upgradeDatabaseName, {
        roleName: roles.workerRoleName,
        password: credentials[roles.workerRoleName],
      }),
    );
    workerB = prismaClient(
      databaseUrl(sourceUrl, upgradeDatabaseName, {
        roleName: roles.workerRoleName,
        password: credentials[roles.workerRoleName],
      }),
    );
    hostile = prismaClient(
      databaseUrl(sourceUrl, upgradeDatabaseName, {
        roleName: roles.hostileRoleName,
        password: credentials[roles.hostileRoleName],
      }),
    );
    app = prismaClient(
      databaseUrl(sourceUrl, upgradeDatabaseName, {
        roleName: roles.appRoleName,
        password: credentials[roles.appRoleName],
      }),
    );

    const evidence = await runDeliveryMatrix({
      databaseAdmin,
      workerA,
      workerB,
      hostile,
      app,
      roles,
      primaryFixture,
      suffix,
    });
    const branchWorkerRoutineBoundary = await assertFinalWorkerRoutineBoundary(
      databaseAdmin,
      roles.workerRoleName,
      roles.workerRoleOid,
    );
    assert.deepEqual(await readStatusLabels(cleanAdmin), EXACT_STATUS_LABELS);
    assert.deepEqual(
      await readStatusLabels(databaseAdmin),
      EXACT_STATUS_LABELS,
    );
    const cleanMigrationState = await readMigrationState(cleanAdmin);
    const upgradeMigrationState = await readMigrationState(databaseAdmin);
    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        decision: "SMOKE_PASSED",
        migrationHead: CURRENT_179,
        migrationCount: CURRENT_179_COUNT,
        identityCheckpointHead: CURRENT_176,
        identityCheckpointCount: CURRENT_176_COUNT,
        migrationArtifacts: {
          identity176Sha256: current176SqlDigest,
          terminal179Sha256: current179SqlDigest,
        },
        pinnedParentManifests: {
          mergeBase150: {
            ref: MERGE_BASE_REF,
            digest: migrationPlan.mergeBaseManifest.digest,
          },
          originMain152: {
            ref: ORIGIN_MAIN_REF,
            digest: migrationPlan.originMainManifest.digest,
          },
          identityBranch176: {
            ref: IDENTITY_176_REF,
            digest: migrationPlan.identity176Manifest.digest,
          },
        },
        histories: {
          identityBranch: {
            checkpointManifest: branchCheckpointManifest,
            checkpointWorkerDigests: branchCheckpointWorkerDigests,
            expandState: branchExpandState,
            applicationWave: caseWaveFixture.evidence,
            contractManifest: branchContractManifest,
            contractEvidence: caseContractEvidence,
            finalManifest: branchFinalManifest,
          },
          originMain: {
            initialManifest: originInitialManifest,
            pendingIdentityMigrations: 26,
            preTerminalOrder: originPreTerminalOrder,
            preTerminalManifest: originPreTerminalManifest,
            preTerminalWorkerAssertSqlState: "55000",
            preTerminalWorkerEffects: 0,
            terminalRejects: {
              wrongPre176Checksum: terminalPre176ManifestRejectStatus,
              wrong176Checksum: terminalChecksumRejectStatus,
              hostileExecuteGrant: terminalAclRejectStatus,
              hostileFunctionOwner: terminalOwnerRejectStatus,
              hostileFunctionBody: terminalBodyRejectStatus,
            },
            finalManifest: originFinalManifest,
            sameEnrollmentReadyAfterTerminal: true,
            postTerminalPre176ChecksumWorkerAssertSqlState: "55000",
            postTerminalPre176ChecksumWorkerEffects: 0,
            readyHead: originReadyReceipt.migrationHead,
            readyCount: originReadyReceipt.migrationCount,
            readyPreterminalManifestDigest:
              originReadyReceipt.preterminalManifestDigest,
            workerRoutineBoundary: originWorkerRoutineBoundary,
            terminalWorkerDigests,
          },
          clean: {
            finalManifest: cleanFinalManifest,
            migrationState: cleanMigrationState,
          },
        },
        cleanMigrationState,
        upgradeMigrationState,
        rejectedMigrationSqlDigest: current176SqlDigest,
        rejectedMigrationExitStatuses: {
          legacyRecipientAad: legacyRejectStatus,
          malformedClaim: claimRejectStatus,
          hostileColumnAcl: aclRejectStatus,
        },
        emailParity,
        holdWriterCompatibility,
        branchWorkerRoutineBoundary,
        ...evidence,
      })}\n`,
    );
  } finally {
    let cleanupError = null;
    for (const client of [
      workerA,
      workerB,
      originWorker,
      hostile,
      app,
      databaseAdmin,
      originAdmin,
      cleanAdmin,
      legacyRejectAdmin,
      claimRejectAdmin,
      aclRejectAdmin,
    ]) {
      if (client) {
        await client.$disconnect().catch((error) => {
          cleanupError ??= error;
        });
      }
    }
    if (upgradeDatabaseCreated) {
      await dropDatabase(admin, upgradeDatabaseName).catch((error) => {
        cleanupError ??= error;
      });
    }
    if (originDatabaseCreated) {
      await dropDatabase(admin, originDatabaseName).catch((error) => {
        cleanupError ??= error;
      });
    }
    if (cleanDatabaseCreated) {
      await dropDatabase(admin, cleanDatabaseName).catch((error) => {
        cleanupError ??= error;
      });
    }
    if (legacyRejectDatabaseCreated) {
      await dropDatabase(admin, legacyRejectDatabaseName).catch((error) => {
        cleanupError ??= error;
      });
    }
    if (claimRejectDatabaseCreated) {
      await dropDatabase(admin, claimRejectDatabaseName).catch((error) => {
        cleanupError ??= error;
      });
    }
    if (aclRejectDatabaseCreated) {
      await dropDatabase(admin, aclRejectDatabaseName).catch((error) => {
        cleanupError ??= error;
      });
    }
    for (const roleName of createdRoles.reverse()) {
      await dropRole(admin, roleName).catch((error) => {
        cleanupError ??= error;
      });
    }
    if (tempRoot) {
      assertSafeTempRoot(tempRoot);
      await rm(tempRoot, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 250,
      }).catch((error) => {
        cleanupError ??= error;
      });
    }
    if (clusterLockAcquired) {
      await releaseClusterLock(admin).catch((error) => {
        cleanupError ??= error;
      });
    }
    await admin.$disconnect().catch((error) => {
      cleanupError ??= error;
    });
    if (cleanupError) throw cleanupError;
  }
}

async function runSelfTest() {
  const { databaseName } = parseSafeSourceDatabaseUrl(
    "postgresql://postgres:test@127.0.0.1:5432/leetplus_004j?schema=public",
  );
  assert.equal(databaseName, "leetplus_004j");
  assert.throws(
    () =>
      parseSafeSourceDatabaseUrl(
        "postgresql://postgres:test@db.internal:5432/leetplus_004j?schema=public",
      ),
    (error) => error?.code === "LOOPBACK_POSTGRESQL_REQUIRED",
  );
  assert.throws(
    () =>
      parseSafeSourceDatabaseUrl(
        "postgresql://postgres:test@127.0.0.1:5432/leetplus?schema=public",
      ),
    (error) => error?.code === "TEST_SOURCE_DATABASE_REQUIRED",
  );
  assert.throws(() =>
    databaseUrl(
      new URL(
        "postgresql://postgres:test@127.0.0.1:5432/leetplus_004j?schema=public",
      ),
      "production",
    ),
  );
  const migrationPlan = await readMigrationPlan();
  assert.equal(migrationPlan.workingManifest.count, CURRENT_179_COUNT);
  assert.equal(migrationPlan.workingManifest.head, CURRENT_179);
  assert.equal(migrationPlan.identityPendingOnOrigin.length, 26);
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      decision: "SELF_TEST_PASSED",
      migrationHead: CURRENT_179,
      migrationCount: CURRENT_179_COUNT,
      parentManifests: {
        mergeBase150: migrationPlan.mergeBaseManifest.digest,
        originMain152: migrationPlan.originMainManifest.digest,
        identityBranch176: migrationPlan.identity176Manifest.digest,
      },
      originPendingIdentityMigrations: 26,
      destructiveSourceDatabaseActions: 0,
    })}\n`,
  );
}

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === "--help") {
  process.stdout.write(`${HELP}\n`);
} else if (args.length === 1 && args[0] === "--self-test") {
  runSelfTest().catch((error) => {
    process.stderr.write(`${sanitize(error)}\n`);
    process.exitCode = 1;
  });
} else if (args.length === 0) {
  runRealSmoke().catch((error) => {
    process.stderr.write(`${sanitize(error)}\n`);
    process.exitCode = 1;
  });
} else {
  process.stderr.write("Use --help, --self-test, or no arguments.\n");
  process.exitCode = 1;
}

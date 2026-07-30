import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  randomUUID,
  sign,
} from "node:crypto";
import {
  cp,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

import { canonicalStringify } from "./staff-task-integrity-canonical-json.mjs";
import {
  RELEASE_GATE_ATTESTATION_CONTRACT,
  RELEASE_GATE_ATTESTATION_KIND,
  SHARED_BETA_ADMISSION_PROFILE,
  SHARED_BETA_ADMISSION_PURPOSE,
  SHARED_BETA_GATE_SET_VERSION,
  SHARED_BETA_RELEASE_GATE_CODES,
  TENANT_ADMISSION_DECISION_CONTRACT,
  TENANT_ADMISSION_DECISION_KIND,
  decisionCreateArguments,
  gatePersistArguments,
  sharedBetaPayloadDigest,
  sharedBetaPublicKeyFingerprint,
  verifySyntheticReleaseGateAttestationEnvelope,
  verifySyntheticTenantAdmissionDecisionEnvelope,
} from "./shared-beta-admission-provenance.mjs";

const SCRIPT_NAME = "shared-beta-runtime-release-activation-upgrade-smoke";
const REQUIRED_CONFIRMATION =
  "run-shared-beta-runtime-release-activation-upgrade-smoke";
const CURRENT_172 = "20260730020000_shared_beta_admission_provenance";
const CURRENT_173 = "20260730030000_identity_mail_outbox_pending_enum_expand";
const CURRENT_174 = "20260730040000_shared_beta_runtime_release_activation";
const CURRENT_172_COUNT = 172;
const CURRENT_173_COUNT = 173;
const CURRENT_174_COUNT = 174;
const MIGRATION_PATTERN = /^\d{14}_[a-z0-9_]+$/u;
const SAFE_SOURCE_DATABASE_PATTERN = /^[a-z0-9][a-z0-9_.-]{0,58}_ci$/iu;
const DATABASE_PREFIX = "lp_activation174_";
const UPGRADE_DATABASE_PATTERN = /^lp_activation174_upgrade_ci_[a-f0-9]{16}$/u;
const HOSTILE_DATABASE_PATTERN = /^lp_activation174_hostile_ci_[a-f0-9]{16}$/u;
const HOSTILE_ROLE_PATTERN = /^lp_activation174_hostile_acl_ci_[a-f0-9]{16}$/u;
const TEMP_ROOT_PREFIX = "leetplus-runtime-activation-upgrade-";
const MIGRATION_TIMEOUT_MS = 10 * 60 * 1_000;
const CLUSTER_LOCK_CLASS = 1_281_120_000;
const CLUSTER_LOCK_OBJECT = 174;
const SHELL_PROFILE_VERSION = "SHARED_MULTI_TENANT_BETA_SHELL_V1";
const EXPECTED_CAPABILITY_DIGEST =
  "ebb460b8773b7fb5ee0cfbbc7cceab98113ac1c7296c679352fd72c71f6d3281";

const MODULES = Object.freeze([
  "GAMIFICATION",
  "ASSORTMENT",
  "STAFF",
  "COMMUNICATIONS",
  "USERS_ROLES",
  "INTEGRATIONS",
]);

const OWNER_CAPABILITIES = Object.freeze([
  "approve_guest_game_rewards",
  "edit_catalog",
  "edit_products",
  "edit_staff_knowledge",
  "edit_stores",
  "export_reports",
  "import_data",
  "import_guest_foundation",
  "manage_assortment_reports",
  "manage_communications",
  "manage_guest_game_rules",
  "manage_integrations",
  "manage_staff_control",
  "manage_staff_directory",
  "manage_staff_salary",
  "manage_staff_standards",
  "manage_staff_tasks",
  "manage_staff_training",
  "manage_users",
  "operate_guest_game_ledger",
  "publish_staff_knowledge",
  "review_staff_knowledge",
  "run_sync",
  "use_utilities",
  "view_assortment_catalog",
  "view_assortment_products",
  "view_assortment_reports",
  "view_assortment_stores",
  "view_communications",
  "view_dashboard",
  "view_guest_gamification",
  "view_reports",
  "view_staff",
  "view_staff_control",
  "view_staff_directory",
  "view_staff_knowledge",
  "view_staff_salary",
  "view_staff_shift_workspace",
  "view_staff_standards",
  "view_staff_tasks",
  "view_staff_training",
]);

const NEW_RUNTIME_TABLES = Object.freeze([
  "SharedBetaRuntimeInstanceAnchor",
  "SharedBetaBuildProvenance",
  "SharedBetaRuntimeReleaseChallenge",
  "SharedBetaRuntimeReleaseMarker",
  "SharedBetaRuntimeReleaseState",
  "SharedBetaTenantActivationCommand",
]);

const GUARDED_TABLES = Object.freeze([
  ...NEW_RUNTIME_TABLES,
  "IdentityMailOutbox",
  "TenantAdmissionDecision",
]);

const NEW_RUNTIME_FUNCTIONS = Object.freeze([
  "shared_beta_runtime_instance_anchor_guard_v1",
  "shared_beta_build_provenance_guard_v1",
  "shared_beta_runtime_activation_role_assert_v1",
  "shared_beta_runtime_release_challenge_create_v1",
  "shared_beta_runtime_actual_context_from_challenge_v1",
  "shared_beta_runtime_release_marker_persist_v1",
  "shared_beta_runtime_challenge_guard_v1",
  "shared_beta_runtime_marker_guard_v1",
  "shared_beta_runtime_state_guard_v1",
  "shared_beta_activation_command_immutable_v1",
  "shared_beta_runtime_canonical_json_v1",
  "shared_beta_runtime_digest_v1",
  "shared_beta_runtime_migration_state_v1",
  "shared_beta_runtime_database_identity_digest_v1",
  "shared_beta_build_provenance_persist_v1",
  "shared_beta_runtime_actual_context_assert_v1",
  "identity_mail_outbox_release_guard_v1",
  "shared_beta_tenant_activation_guard_v1",
  "shared_beta_activation_audit_guard_v1",
  "shared_beta_tenant_actual_shell_v1",
  "shared_beta_tenant_activate_v1",
]);

const GUARDED_FUNCTIONS = Object.freeze([
  "assert_staff_attachment_state",
  "check_staff_attachment_binding_state",
  "check_staff_attachment_row_state",
  "check_store_access_scope_invariants",
  "check_user_access_scope_invariants",
  "check_user_store_access_invariants",
  "ensure_guest_game_reward_claim_deadline",
  "guard_guest_bonus_ledger_reward_claim",
  "lock_staff_attachment_binding_delete",
  "prepare_staff_attachment_binding",
  "resolve_staff_attachment_resource_scope",
  "serialize_store_tenant_change",
  "serialize_user_access_scope_change",
  ...NEW_RUNTIME_FUNCTIONS.slice(0, 16),
  "shared_beta_tenant_admission_decision_guard_v1",
  ...NEW_RUNTIME_FUNCTIONS.slice(16),
]);

const HELP = `
${SCRIPT_NAME}

Local/CI-only PostgreSQL 16 populated upgrade rehearsal for the exact
CURRENT_172 -> CURRENT_173 -> CURRENT_174 path.

The rehearsal:
  - creates random databases from template0 and never migrates the source;
  - deploys an exact 172-migration artifact;
  - seeds one realistic dormant shared-beta tenant shell, OWNER invitation
    aggregate, three release gates and one AVAILABLE admission decision;
  - deploys 173 alone and proves exact head 173/173, HOLD/PENDING, no release
    column yet, and byte-for-byte populated JSON snapshot preservation;
  - then deploys 174 and re-proves the exact snapshot, releasedAt=NULL, and
    owner-only runtime relations/functions at exact migration head 174/174;
  - verifies SHA-256 equality of copied 173/174 migration bytes before deploy
    and proves the source release inputs remain unchanged;
  - proves hostile default TABLE/FUNCTION privileges roll migration 174 back,
    then proves an explicit resolve/revoke/retry succeeds;
  - force-drops every generated database and role and removes the temporary
    migration artifact in finally.

Usage:
  node scripts/${SCRIPT_NAME}.mjs
  node scripts/${SCRIPT_NAME}.mjs --self-test
  node scripts/${SCRIPT_NAME}.mjs --help

Required for the real smoke:
  DATABASE_URL
    PostgreSQL 16 on loopback, schema public, source database ending exactly
    in _ci, connected as a disposable test superuser.
  SHARED_BETA_RUNTIME_RELEASE_ACTIVATION_UPGRADE_SMOKE_CONFIRM
    ${REQUIRED_CONFIRMATION}

NODE_ENV=production, non-loopback hosts, non-_ci sources, extra URL
parameters, unsafe generated names and non-superuser connections fail closed.
`.trim();

function contractError(code, message = code) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function parseArguments(argv) {
  if (argv.includes("--help")) return { help: true, selfTest: false };
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
  const hostname = sourceUrl.hostname.toLowerCase().replace(/^\[|\]$/gu, "");
  if (!new Set(["127.0.0.1", "localhost", "::1"]).has(hostname)) {
    contractError("LOOPBACK_POSTGRESQL_REQUIRED");
  }
  const databaseName = decodeURIComponent(
    sourceUrl.pathname.replace(/^\/+/u, ""),
  );
  if (
    !SAFE_SOURCE_DATABASE_PATTERN.test(databaseName) ||
    UPGRADE_DATABASE_PATTERN.test(databaseName) ||
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
    hostileDatabaseName: `${DATABASE_PREFIX}hostile_ci_${suffix}`,
    hostileRoleName: `${DATABASE_PREFIX}hostile_acl_ci_${suffix}`,
    upgradeDatabaseName: `${DATABASE_PREFIX}upgrade_ci_${suffix}`,
  };
  assert.match(names.hostileDatabaseName, HOSTILE_DATABASE_PATTERN);
  assert.match(names.hostileRoleName, HOSTILE_ROLE_PATTERN);
  assert.match(names.upgradeDatabaseName, UPGRADE_DATABASE_PATTERN);
  assert.notEqual(names.hostileDatabaseName, names.upgradeDatabaseName);
  return names;
}

function assertSafeGeneratedDatabaseName(databaseName) {
  if (
    !UPGRADE_DATABASE_PATTERN.test(databaseName) &&
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

function assertRealEnvironment(environment) {
  if (environment.NODE_ENV === "production") {
    contractError("PRODUCTION_ENVIRONMENT_REFUSED");
  }
  if (
    environment.SHARED_BETA_RUNTIME_RELEASE_ACTIVATION_UPGRADE_SMOKE_CONFIRM !==
    REQUIRED_CONFIRMATION
  ) {
    contractError("UPGRADE_SMOKE_CONFIRMATION_REQUIRED");
  }
  return parseSafeSourceDatabaseUrl(environment.DATABASE_URL);
}

function prismaClient(databaseUrl) {
  return new PrismaClient({
    datasourceUrl: databaseUrl,
    log: [],
    transactionOptions: { maxWait: 5_000, timeout: 30_000 },
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
  const targetIndex = migrationDirectories.indexOf(CURRENT_174);
  assert.equal(targetIndex + 1, CURRENT_174_COUNT);
  assert.equal(migrationDirectories[CURRENT_172_COUNT - 1], CURRENT_172);
  assert.equal(migrationDirectories[CURRENT_173_COUNT - 1], CURRENT_173);
  assert.equal(migrationDirectories[CURRENT_174_COUNT - 1], CURRENT_174);
  return {
    allMigrations: migrationDirectories.slice(0, CURRENT_174_COUNT),
    pre174Migrations: migrationDirectories.slice(0, CURRENT_173_COUNT),
    prefixMigrations: migrationDirectories.slice(0, CURRENT_172_COUNT),
    sourcePrismaDir,
    targetMigrations: [CURRENT_173, CURRENT_174],
  };
}

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function sha256File(filePath) {
  return sha256Bytes(await readFile(filePath));
}

async function readSourceReleaseFingerprints(migrationPlan) {
  const migrationsRoot = join(migrationPlan.sourcePrismaDir, "migrations");
  return Object.freeze({
    migration173Sha256: await sha256File(
      join(migrationsRoot, CURRENT_173, "migration.sql"),
    ),
    migration174Sha256: await sha256File(
      join(migrationsRoot, CURRENT_174, "migration.sql"),
    ),
    migrationLockSha256: await sha256File(
      join(migrationsRoot, "migration_lock.toml"),
    ),
    schemaSha256: await sha256File(
      join(migrationPlan.sourcePrismaDir, "schema.prisma"),
    ),
  });
}

async function createMigrationArtifact(tempRoot, migrationPlan) {
  assertSafeTempRoot(tempRoot);
  const targetPrismaDir = join(tempRoot, "prisma");
  const targetMigrationsDir = join(targetPrismaDir, "migrations");
  const sourceSchemaPath = join(migrationPlan.sourcePrismaDir, "schema.prisma");
  const targetSchemaPath = join(targetPrismaDir, "schema.prisma");
  const sourceLockPath = join(
    migrationPlan.sourcePrismaDir,
    "migrations",
    "migration_lock.toml",
  );
  const targetLockPath = join(targetMigrationsDir, "migration_lock.toml");
  await mkdir(targetMigrationsDir, { recursive: true });
  await copyFile(sourceSchemaPath, targetSchemaPath);
  await copyFile(sourceLockPath, targetLockPath);
  const [sourceSchemaSha256, copiedSchemaSha256] = await Promise.all([
    sha256File(sourceSchemaPath),
    sha256File(targetSchemaPath),
  ]);
  assert.equal(copiedSchemaSha256, sourceSchemaSha256);
  const [sourceLockSha256, copiedLockSha256] = await Promise.all([
    sha256File(sourceLockPath),
    sha256File(targetLockPath),
  ]);
  assert.equal(copiedLockSha256, sourceLockSha256);
  for (const migrationName of migrationPlan.prefixMigrations) {
    await cp(
      join(migrationPlan.sourcePrismaDir, "migrations", migrationName),
      join(targetMigrationsDir, migrationName),
      { recursive: true },
    );
  }
  return {
    baseCopyIntegrity: Object.freeze({
      migrationLockSha256: copiedLockSha256,
      schemaSha256: copiedSchemaSha256,
    }),
    schemaPath: targetSchemaPath,
    targetMigrationsDir,
  };
}

async function addTargetMigration(artifact, migrationPlan, migrationName) {
  assert(migrationPlan.targetMigrations.includes(migrationName));
  const sourceMigrationDir = join(
    migrationPlan.sourcePrismaDir,
    "migrations",
    migrationName,
  );
  const copiedMigrationDir = join(artifact.targetMigrationsDir, migrationName);
  const sourceMigrationPath = join(sourceMigrationDir, "migration.sql");
  const copiedMigrationPath = join(copiedMigrationDir, "migration.sql");
  const sourceSha256BeforeCopy = await sha256File(sourceMigrationPath);
  await cp(sourceMigrationDir, copiedMigrationDir, { recursive: true });
  const [copiedSha256, sourceSha256AfterCopy] = await Promise.all([
    sha256File(copiedMigrationPath),
    sha256File(sourceMigrationPath),
  ]);
  assert.equal(copiedSha256, sourceSha256BeforeCopy);
  assert.equal(sourceSha256AfterCopy, sourceSha256BeforeCopy);
  return Object.freeze({
    copiedBytesVerified: true,
    migrationName,
    sha256: copiedSha256,
  });
}

async function assertCopiedTargetMigrationIntegrity(
  artifact,
  migrationPlan,
  copyEvidence,
) {
  assert(migrationPlan.targetMigrations.includes(copyEvidence.migrationName));
  const sourceMigrationPath = join(
    migrationPlan.sourcePrismaDir,
    "migrations",
    copyEvidence.migrationName,
    "migration.sql",
  );
  const copiedMigrationPath = join(
    artifact.targetMigrationsDir,
    copyEvidence.migrationName,
    "migration.sql",
  );
  const [sourceSha256, copiedSha256] = await Promise.all([
    sha256File(sourceMigrationPath),
    sha256File(copiedMigrationPath),
  ]);
  assert.equal(sourceSha256, copyEvidence.sha256);
  assert.equal(copiedSha256, copyEvidence.sha256);
}

function prismaCliInvocation(schemaPath, databaseUrl, cliArguments) {
  const require = createRequire(import.meta.url);
  const prismaCliPath = require.resolve("prisma/build/index.js");
  return spawnSync(
    process.execPath,
    [prismaCliPath, "migrate", ...cliArguments, "--schema", schemaPath],
    {
      cwd: dirname(schemaPath),
      encoding: "utf8",
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        NODE_ENV: "test",
        NO_COLOR: "1",
        PGOPTIONS: "-c lock_timeout=5000 -c statement_timeout=240000",
        PRISMA_HIDE_UPDATE_MESSAGE: "true",
      },
      maxBuffer: 8 * 1024 * 1_024,
      shell: false,
      timeout: MIGRATION_TIMEOUT_MS,
      windowsHide: true,
    },
  );
}

function runMigrateDeploy(schemaPath, databaseUrl) {
  const result = prismaCliInvocation(schemaPath, databaseUrl, ["deploy"]);
  if (result.error || result.status !== 0) {
    contractError(
      "MIGRATION_DEPLOY_FAILED",
      "Prisma migration deploy failed; raw output is suppressed.",
    );
  }
}

function expectMigrateDeployFailure(schemaPath, databaseUrl) {
  const result = prismaCliInvocation(schemaPath, databaseUrl, ["deploy"]);
  assert.equal(result.error, undefined);
  assert.notEqual(
    result.status,
    0,
    "Hostile ACL migration unexpectedly succeeded.",
  );
  return Object.freeze({ nonZeroExitObserved: true });
}

function runMigrateResolveRolledBack(schemaPath, databaseUrl) {
  const result = prismaCliInvocation(schemaPath, databaseUrl, [
    "resolve",
    "--rolled-back",
    CURRENT_174,
  ]);
  if (result.error || result.status !== 0) {
    contractError(
      "MIGRATION_RESOLVE_FAILED",
      "Prisma rollback resolution failed; raw output is suppressed.",
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
  assert.equal(Math.trunc(Number(row?.server_version_number) / 10_000), 16);
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
  assert.equal(
    row?.acquired,
    true,
    "Another runtime activation upgrade smoke is running.",
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
    `CREATE DATABASE ${quoteIdentifier(databaseName)} TEMPLATE template0`,
  );
}

async function dropDatabase(admin, databaseName) {
  assertSafeGeneratedDatabaseName(databaseName);
  await admin.$executeRawUnsafe(
    `DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)} WITH (FORCE)`,
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
  const [relation] = await client.$queryRawUnsafe(
    `SELECT pg_catalog.to_regclass(
       'public."_prisma_migrations"'
     )::TEXT AS relation_name`,
  );
  if (relation?.relation_name === null) return [];
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

function exactNow() {
  return new Date(Math.trunc(Date.now() / 1_000) * 1_000);
}

function signedEnvelope(payload, authority) {
  return {
    payload,
    payloadDigest: sharedBetaPayloadDigest(payload),
    publicKeyFingerprint: authority.publicKeyFingerprint,
    signature: sign(
      null,
      Buffer.from(canonicalStringify(payload), "utf8"),
      authority.privateKey,
    ).toString("base64url"),
    signatureAlgorithm: "Ed25519",
    signingKeyId: authority.keyId,
  };
}

function syntheticAuthority(now) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });
  const publicKeyFingerprint = sharedBetaPublicKeyFingerprint(publicKeyPem);
  const keyId = "activation-upgrade-loopback-ci-v1";
  return {
    keyId,
    privateKey,
    publicKeyFingerprint,
    roots: {
      [keyId]: {
        algorithm: "Ed25519",
        keyId,
        notAfter: new Date(now.valueOf() + 8 * 60 * 60 * 1_000).toISOString(),
        notBefore: new Date(now.valueOf() - 60 * 60 * 1_000).toISOString(),
        profile: SHARED_BETA_ADMISSION_PROFILE,
        publicKeyFingerprint,
        publicKeyPem,
        purpose: SHARED_BETA_ADMISSION_PURPOSE,
        status: "ACTIVE",
      },
    },
  };
}

async function persistGate(client, args) {
  const [row] = await client.$queryRawUnsafe(
    `SELECT public."shared_beta_release_gate_attestation_persist_v1"(
      $1,
      $2::public."SharedBetaReleaseGateCode",
      $3, $4, $5, $6, $7::INTEGER, $8, $9::JSONB, $10, $11, $12,
      $13,
      pg_catalog.decode(
        pg_catalog.rpad(pg_catalog.translate($14, '-_', '+/'), 88, '='),
        'base64'
      ),
      $15::TIMESTAMPTZ, $16::TIMESTAMPTZ
    ) AS receipt`,
    args.candidateAttestationId,
    args.candidateGateCode,
    args.candidateReleaseSha,
    args.candidateEnvironment,
    args.candidateArtifactDigest,
    args.candidateSchemaHead,
    args.candidateMigrationCount,
    args.candidatePolicyManifestDigest,
    JSON.stringify(args.candidatePayload),
    args.candidatePayloadDigest,
    args.candidateSigningKeyId,
    args.candidateProvenanceKeyVersion,
    args.candidatePublicKeyFingerprint,
    args.candidateSignatureBase64url,
    args.candidatePassedAt,
    args.candidateValidUntil,
  );
  return row.receipt;
}

async function gateSetDigestFromImports(client, imports) {
  const canonicalSet = imports
    .map((entry) => ({
      attestationId: entry.candidateAttestationId,
      gateCode: entry.candidateGateCode,
      payloadDigest: entry.candidatePayloadDigest,
    }))
    .sort((left, right) =>
      left.gateCode < right.gateCode
        ? -1
        : left.gateCode > right.gateCode
          ? 1
          : 0,
    );
  const [row] = await client.$queryRawUnsafe(
    `SELECT pg_catalog.encode(
       pg_catalog.sha256(
         pg_catalog.convert_to(
           'leetplus-shared-beta-gate-set-v1',
           'UTF8'
         )
         || '\\x00'::BYTEA
         || pg_catalog.convert_to($1::JSONB::TEXT, 'UTF8')
       ),
       'hex'
     ) AS digest`,
    JSON.stringify(canonicalSet),
  );
  return row.digest;
}

async function createDecision(client, verified, gateIds) {
  const args = decisionCreateArguments(verified, gateIds);
  const payload = verified.payload;
  const [row] = await client.$queryRawUnsafe(
    `SELECT public."shared_beta_tenant_admission_decision_create_v1"(
      $1, $2, $3, $4, $5, $6, $7::INTEGER, $8, $9, $10, $11, $12,
      $13::INTEGER, $14, $15, $16::INTEGER, $17::INTEGER, $18, $19,
      $20, $21, $22::JSONB, $23, $24, $25,
      pg_catalog.decode(
        pg_catalog.rpad(pg_catalog.translate($26, '-_', '+/'), 88, '='),
        'base64'
      ),
      $27::TIMESTAMPTZ, $28::TIMESTAMPTZ, $29, $30, $31
    ) AS receipt`,
    payload.decisionId,
    payload.tenantId,
    payload.requestId,
    payload.requestDigest,
    payload.workflowLocator,
    payload.reservationSubjectId,
    payload.expectedClaimRevision,
    payload.shellEvidenceDigest,
    payload.releaseSha,
    payload.environment,
    payload.artifactDigest,
    payload.schemaHead,
    payload.migrationCount,
    payload.policyManifestDigest,
    payload.databaseIdentityDigest,
    payload.expectedEntitlementProfileRevision,
    payload.expectedExecutionRevision,
    payload.profileDigest,
    payload.gateSetDigest,
    payload.approvedByUserId,
    payload.approvalReferenceDigest,
    JSON.stringify(args.candidatePayload),
    args.candidatePayloadDigest,
    payload.signingKeyId,
    payload.publicKeyFingerprint,
    args.candidateSignatureBase64url,
    new Date(payload.approvedAtEpochMs),
    new Date(payload.validUntilEpochMs),
    args.modulePolicyAttestationId,
    args.emailWorkflowAttestationId,
    args.postgresRehearsalAttestationId,
  );
  return row.receipt;
}

async function assertDecision(client, payload) {
  const [row] = await client.$queryRawUnsafe(
    `SELECT public."shared_beta_tenant_admission_decision_assert_v1"(
      $1, $2, $3, $4, $5::INTEGER, $6, $7, $8, $9, $10::INTEGER,
      $11, $12, $13::INTEGER, $14::INTEGER, $15, $16
    ) AS receipt`,
    payload.decisionId,
    payload.tenantId,
    payload.workflowLocator,
    payload.reservationSubjectId,
    payload.expectedClaimRevision,
    payload.releaseSha,
    payload.environment,
    payload.artifactDigest,
    payload.schemaHead,
    payload.migrationCount,
    payload.policyManifestDigest,
    payload.databaseIdentityDigest,
    payload.expectedEntitlementProfileRevision,
    payload.expectedExecutionRevision,
    payload.profileDigest,
    payload.gateSetDigest,
  );
  return row.receipt;
}

async function issueOwnerInviteHold(client, input) {
  const [row] = await client.$queryRawUnsafe(
    `SELECT public."identity_owner_invite_issue_hold_v1"(
      $1, $2, $3, $4::INTEGER, $5, $6, $7, $8, $9, $10, $11,
      $12, $13::BYTEA, $14::TIMESTAMPTZ
    ) AS receipt`,
    input.workflowLocator,
    input.tenantId,
    input.reservationSubjectId,
    input.expectedClaimRevision,
    input.requestId,
    input.requestDigest,
    input.aadEnvironment,
    input.commandId,
    input.inviteId,
    input.outboxId,
    input.messageKey,
    input.tokenHash,
    input.secretCiphertext,
    input.expiresAt,
  );
  return row.receipt;
}

async function createCurrent172Fixture(client, databaseName) {
  const now = exactNow();
  const authority = syntheticAuthority(now);
  const ids = {
    authorityTenant: randomUUID(),
    authorityUser: randomUUID(),
    decision: randomUUID(),
    decisionRequest: randomUUID(),
    invite: randomUUID(),
    issueCommand: randomUUID(),
    issueRequest: randomUUID(),
    outbox: randomUUID(),
    override: randomUUID(),
    provisioningAudit: randomUUID(),
    provisioningRequest: randomUUID(),
    reservation: randomUUID(),
    store: randomUUID(),
    tenant: randomUUID(),
  };
  ids.workflow = ids.reservation;
  const slug = `activation-upgrade-${ids.tenant}`;
  const tenantName = "Runtime activation upgrade tenant";
  const storeName = "Runtime Activation Upgrade Store";
  const cohortKey = "shared-beta-upgrade-ci";
  const email = `activation-upgrade-${ids.reservation}@example.invalid`;
  const release = {
    artifactDigest: "a".repeat(64),
    environment: "ci",
    migrationCount: CURRENT_172_COUNT,
    policyManifestDigest: "b".repeat(64),
    releaseSha: "c".repeat(40),
    schemaHead: CURRENT_172,
  };

  await client.$executeRawUnsafe(
    `INSERT INTO public."Tenant" (
       "id", "name", "slug", "status", "customerStage",
       "onboardingStatus", "entitlementProfileRevision",
       "executionRevision", "createdAt", "updatedAt"
     ) VALUES (
       $1, 'Runtime activation upgrade authority', $2,
       'ACTIVE', 'INTERNAL', 'ACTIVE', 0, 0, $3, $3
     )`,
    ids.authorityTenant,
    `activation-authority-${ids.authorityTenant}`,
    now,
  );
  await client.$executeRawUnsafe(
    `INSERT INTO public."User" (
       "id", "tenantId", "email", "passwordHash", "role",
       "accessScope", "isActive", "isPlatformAdmin", "createdAt", "updatedAt"
     ) VALUES (
       $1, $2, $3, 'not-a-login-upgrade-fixture', 'OWNER',
       'NETWORK', true, true, $4, $4
     )`,
    ids.authorityUser,
    ids.authorityTenant,
    `activation-authority-${ids.authorityUser}@example.invalid`,
    now,
  );
  await client.$executeRawUnsafe(
    `INSERT INTO public."Tenant" (
       "id", "name", "slug", "domain", "gameLogoUrl", "status",
       "customerStage", "onboardingStatus", "cohortKey",
       "supportOwnerUserId", "trialStartsAt", "trialEndsAt",
       "entitlementProfileRevision", "executionRevision",
       "statusChangedAt", "statusReason", "createdAt", "updatedAt"
     ) VALUES (
       $1, $2, $3, NULL, NULL, 'SUSPENDED', 'PILOT', 'PROVISIONING',
       $4, $5, NULL, NULL, 1, 0, $6,
       'Prepared for exact CURRENT_172 upgrade rehearsal', $6, $6
     )`,
    ids.tenant,
    tenantName,
    slug,
    cohortKey,
    ids.authorityUser,
    now,
  );
  await client.$executeRawUnsafe(
    `INSERT INTO public."Store" (
       "id", "tenantId", "name", "publicSlug", "timeZone", "isActive",
       "gamificationEnabled", "backgroundExecutionEnabled",
       "executionRevision", "externalProvider", "externalDomain",
       "externalClubId", "integrationSourceId", "computerCount",
       "computerCountSyncedAt", "createdAt", "updatedAt"
     ) VALUES (
       $1, $2, $3, $4, 'Asia/Yekaterinburg', false, false, false, 0,
       NULL, NULL, NULL, NULL, NULL, NULL, $5, $5
     )`,
    ids.store,
    ids.tenant,
    storeName,
    `${slug}-main`,
    now,
  );
  await client.$executeRawUnsafe(
    `INSERT INTO public."UserRoleOverride" (
       "id", "tenantId", "role", "permissions", "createdAt", "updatedAt"
     ) VALUES ($1, $2, 'OWNER', $3::TEXT[], $4, $4)`,
    ids.override,
    ids.tenant,
    OWNER_CAPABILITIES,
    now,
  );
  await client.$executeRawUnsafe(
    `INSERT INTO public."TenantModuleEntitlement" (
       "id", "tenantId", "module", "readEnabled", "writeEnabled",
       "outboundEnabled", "validFrom", "validUntil", "profileRevision",
       "reason", "createdAt", "updatedAt"
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
       'Exact shared beta upgrade fixture',
       $2,
       $2
     FROM pg_catalog.unnest($3::public."TenantModule"[]) AS module`,
    ids.tenant,
    now,
    MODULES,
  );
  const provisionReceipt = {
    profileVersion: SHELL_PROFILE_VERSION,
    tenant: {
      id: ids.tenant,
      slug,
      status: "SUSPENDED",
      customerStage: "PILOT",
      onboardingStatus: "PROVISIONING",
      profileRevision: 1,
      executionRevision: 0,
      trialStartsAt: null,
      trialEndsAt: null,
    },
    store: {
      id: ids.store,
      name: storeName,
      isActive: false,
      gamificationEnabled: false,
      backgroundExecutionEnabled: false,
    },
    ownerIdentity: {
      claimType: "INVITE",
      reservationId: ids.reservation,
      claimRevision: 1,
    },
    modules: MODULES.map((module) => ({
      module,
      readEnabled: true,
      writeEnabled: true,
      outboundEnabled: false,
      profileRevision: 1,
    })),
  };
  const provisionMetadata = {
    profileVersion: SHELL_PROFILE_VERSION,
    requestDigest: "1".repeat(64),
    supportTicket: null,
    supportOwnerUserId: ids.authorityUser,
    ownerEmailFingerprint: "2".repeat(64),
    ownerEmailFingerprintKeyVersion: "v1",
    initialOwnerRole: "OWNER",
    initialOwnerScopeAfterActivation: "NETWORK",
    ownerIdentityReservationId: ids.reservation,
    initialStoreCount: 1,
    moduleCount: 6,
    outboundDefault: "OFF",
    activationRequired: true,
    inviteCreated: false,
    trialStarted: false,
    confirmationRule: "PROVISION tenant_slug",
    executionRevision: 0,
  };
  await client.$executeRawUnsafe(
    `INSERT INTO public."PlatformAdminAuditEvent" (
       "id", "tenantId", "actorUserId", "requestId", "action",
       "targetType", "targetId", "reason", "before", "after", "metadata",
       "createdAt"
     ) VALUES (
       $1, $2, $3, $4, 'SHARED_BETA_TENANT_SHELL_PROVISIONED',
       'TENANT', $2, 'Exact CURRENT_172 populated upgrade rehearsal',
       'null'::JSONB, $5::JSONB, $6::JSONB, $7
     )`,
    ids.provisioningAudit,
    ids.tenant,
    ids.authorityUser,
    ids.provisioningRequest,
    JSON.stringify(provisionReceipt),
    JSON.stringify(provisionMetadata),
    now,
  );
  await client.$executeRawUnsafe(
    `INSERT INTO public."IdentityEmailClaim" (
       "emailCanonical", "claimType", "tenantId", "subjectId",
       "workflowLocator", "revision", "createdAt", "updatedAt"
     ) VALUES (
       $1, 'INVITE', $2, $3, $3, 1, $4, $4
     )`,
    email,
    ids.tenant,
    ids.reservation,
    now,
  );

  const [profile] = await client.$queryRawUnsafe(
    `SELECT public."shared_beta_tenant_profile_digest_v1"(
       $1, 1
     ) AS digest`,
    ids.tenant,
  );
  assert.match(profile.digest, /^[0-9a-f]{64}$/u);

  const context = {
    databaseName,
    explicitConfirmation: "allow-synthetic-shared-beta-admission-provenance",
    hostname: "127.0.0.1",
    nodeEnv: "test",
  };
  const gateIds = {};
  const gateImports = [];
  for (const gateCode of SHARED_BETA_RELEASE_GATE_CODES) {
    const payload = {
      artifactDigest: release.artifactDigest,
      contractVersion: RELEASE_GATE_ATTESTATION_CONTRACT,
      environment: release.environment,
      gateCode,
      kind: RELEASE_GATE_ATTESTATION_KIND,
      migrationCount: release.migrationCount,
      passedAtEpochMs: now.valueOf(),
      policyManifestDigest: release.policyManifestDigest,
      profile: SHARED_BETA_ADMISSION_PROFILE,
      provenanceKeyVersion: authority.keyId,
      publicKeyFingerprint: authority.publicKeyFingerprint,
      purpose: SHARED_BETA_ADMISSION_PURPOSE,
      releaseSha: release.releaseSha,
      schemaHead: release.schemaHead,
      schemaVersion: 1,
      signingKeyId: authority.keyId,
      validUntilEpochMs: now.valueOf() + 2 * 60 * 60 * 1_000,
    };
    const verified = verifySyntheticReleaseGateAttestationEnvelope(
      signedEnvelope(payload, authority),
      authority.roots,
      context,
      now,
    );
    const attestationId = randomUUID();
    gateIds[gateCode] = attestationId;
    const gateImport = gatePersistArguments(verified, attestationId);
    gateImports.push(gateImport);
    const receipt = await persistGate(client, gateImport);
    assert.equal(receipt.decision, "CREATED");
  }
  const gateSetDigest = await gateSetDigestFromImports(client, gateImports);
  const decisionPayload = {
    approvalReferenceDigest: "3".repeat(64),
    approvedAtEpochMs: now.valueOf() + 1_000,
    approvedByUserId: ids.authorityUser,
    artifactDigest: release.artifactDigest,
    contractVersion: TENANT_ADMISSION_DECISION_CONTRACT,
    databaseIdentityDigest: "4".repeat(64),
    decision: "GO",
    decisionId: ids.decision,
    environment: release.environment,
    expectedClaimRevision: 1,
    expectedEntitlementProfileRevision: 1,
    expectedExecutionRevision: 0,
    gateSetDigest,
    gateSetVersion: SHARED_BETA_GATE_SET_VERSION,
    kind: TENANT_ADMISSION_DECISION_KIND,
    migrationCount: release.migrationCount,
    policyManifestDigest: release.policyManifestDigest,
    profile: SHARED_BETA_ADMISSION_PROFILE,
    profileDigest: profile.digest,
    publicKeyFingerprint: authority.publicKeyFingerprint,
    purpose: SHARED_BETA_ADMISSION_PURPOSE,
    releaseSha: release.releaseSha,
    requestDigest: "5".repeat(64),
    requestId: ids.decisionRequest,
    reservationSubjectId: ids.reservation,
    schemaHead: release.schemaHead,
    schemaVersion: 1,
    shellEvidenceDigest: "6".repeat(64),
    signingKeyId: authority.keyId,
    tenantId: ids.tenant,
    validUntilEpochMs: now.valueOf() + 60 * 60 * 1_000,
    workflowLocator: ids.workflow,
  };
  const verifiedDecision = verifySyntheticTenantAdmissionDecisionEnvelope(
    signedEnvelope(decisionPayload, authority),
    authority.roots,
    context,
    now,
  );
  const decisionReceipt = await createDecision(
    client,
    verifiedDecision,
    gateIds,
  );
  assert.equal(decisionReceipt.decision, "CREATED");

  const issueReceipt = await issueOwnerInviteHold(client, {
    aadEnvironment: release.environment,
    commandId: ids.issueCommand,
    expectedClaimRevision: 1,
    expiresAt: new Date(now.valueOf() + 90 * 60 * 1_000),
    inviteId: ids.invite,
    messageKey: randomUUID(),
    outboxId: ids.outbox,
    requestDigest: "7".repeat(64),
    requestId: ids.issueRequest,
    reservationSubjectId: ids.reservation,
    secretCiphertext: Buffer.alloc(71, 0x5a),
    tenantId: ids.tenant,
    tokenHash: "8".repeat(64),
    workflowLocator: ids.workflow,
  });
  assert.equal(issueReceipt.decision, "CREATED");
  assert.equal(issueReceipt.outboxStatus, "HOLD");

  const asserted = await assertDecision(client, decisionPayload);
  assert.equal(asserted.decision, "ASSERTED");
  assert.equal(asserted.identityState, "ISSUED_HOLD");

  return {
    decisionPayload,
    email,
    gateIds,
    ids,
    profileDigest: profile.digest,
    release,
    slug,
  };
}

async function readFixtureSnapshot(client, fixture) {
  const [row] = await client.$queryRawUnsafe(
    `SELECT pg_catalog.jsonb_build_object(
       'tenant', (
         SELECT pg_catalog.to_jsonb(tenant)
         FROM public."Tenant" AS tenant
         WHERE tenant."id" = $1
       ),
       'store', (
         SELECT pg_catalog.to_jsonb(store)
         FROM public."Store" AS store
         WHERE store."tenantId" = $1
       ),
       'ownerOverride', (
         SELECT pg_catalog.to_jsonb(role_override)
         FROM public."UserRoleOverride" AS role_override
         WHERE role_override."tenantId" = $1
       ),
       'entitlements', (
         SELECT pg_catalog.jsonb_agg(
           pg_catalog.to_jsonb(entitlement)
           ORDER BY entitlement."module"::TEXT COLLATE "C"
         )
         FROM public."TenantModuleEntitlement" AS entitlement
         WHERE entitlement."tenantId" = $1
       ),
       'identityClaim', (
         SELECT pg_catalog.to_jsonb(claim)
         FROM public."IdentityEmailClaim" AS claim
         WHERE claim."workflowLocator" = $2
       ),
       'issueCommand', (
         SELECT pg_catalog.to_jsonb(command)
         FROM public."IdentityOwnerInviteIssueCommand" AS command
         WHERE command."id" = $3
       ),
       'invite', (
         SELECT pg_catalog.to_jsonb(invite)
         FROM public."UserInvite" AS invite
         WHERE invite."id" = $4
       ),
       'outbox', (
         SELECT pg_catalog.to_jsonb(outbox) - 'releasedAt'
         FROM public."IdentityMailOutbox" AS outbox
         WHERE outbox."id" = $5
       ),
       'audits', (
         SELECT pg_catalog.jsonb_agg(
           pg_catalog.to_jsonb(audit)
           ORDER BY audit."id" COLLATE "C"
         )
         FROM public."PlatformAdminAuditEvent" AS audit
         WHERE audit."tenantId" = $1
       ),
       'gates', (
         SELECT pg_catalog.jsonb_agg(
           pg_catalog.to_jsonb(gate)
           ORDER BY gate."gateCode"::TEXT COLLATE "C"
         )
         FROM public."ReleaseGateAttestation" AS gate
         WHERE gate."releaseSha" = $6
       ),
       'decision', (
         SELECT pg_catalog.to_jsonb(decision)
         FROM public."TenantAdmissionDecision" AS decision
         WHERE decision."id" = $7
       ),
       'decisionGates', (
         SELECT pg_catalog.jsonb_agg(
           pg_catalog.to_jsonb(binding)
           ORDER BY binding."gateCode"::TEXT COLLATE "C"
         )
         FROM public."TenantAdmissionDecisionGate" AS binding
         WHERE binding."decisionId" = $7
       )
     )::TEXT AS snapshot_text`,
    fixture.ids.tenant,
    fixture.ids.workflow,
    fixture.ids.issueCommand,
    fixture.ids.invite,
    fixture.ids.outbox,
    fixture.release.releaseSha,
    fixture.ids.decision,
  );
  assert.equal(typeof row?.snapshot_text, "string");
  return row.snapshot_text;
}

async function assertPopulatedFixture(client, fixture) {
  const [state] = await client.$queryRawUnsafe(
    `SELECT
       (
         SELECT pg_catalog.count(*)::INTEGER
         FROM public."Tenant" AS tenant
         WHERE tenant."id" = $1
           AND tenant."slug" = $2
           AND tenant."status" = 'SUSPENDED'
           AND tenant."customerStage" = 'PILOT'
           AND tenant."onboardingStatus" = 'PROVISIONING'
           AND tenant."entitlementProfileRevision" = 1
           AND tenant."executionRevision" = 0
       ) AS tenant_count,
       (
         SELECT pg_catalog.count(*)::INTEGER
         FROM public."Store" AS store
         WHERE store."tenantId" = $1
           AND NOT store."isActive"
           AND NOT store."gamificationEnabled"
           AND NOT store."backgroundExecutionEnabled"
       ) AS store_count,
       (
         SELECT pg_catalog.count(*)::INTEGER
         FROM public."UserRoleOverride" AS role_override
         WHERE role_override."tenantId" = $1
           AND role_override."role" = 'OWNER'
           AND pg_catalog.cardinality(role_override."permissions") = 41
       ) AS override_count,
       (
         SELECT pg_catalog.count(*)::INTEGER
         FROM public."TenantModuleEntitlement" AS entitlement
         WHERE entitlement."tenantId" = $1
           AND entitlement."profileRevision" = 1
           AND entitlement."readEnabled"
           AND entitlement."writeEnabled"
           AND NOT entitlement."outboundEnabled"
           AND entitlement."validFrom" IS NULL
           AND entitlement."validUntil" IS NULL
       ) AS entitlement_count,
       (
         SELECT pg_catalog.count(*)::INTEGER
         FROM public."IdentityEmailClaim" AS claim
         WHERE claim."workflowLocator" = $3
           AND claim."tenantId" = $1
           AND claim."subjectId" = $4
           AND claim."revision" = 2
       ) AS claim_count,
       (
         SELECT pg_catalog.count(*)::INTEGER
         FROM public."IdentityOwnerInviteIssueCommand" AS command
         WHERE command."id" = $5
           AND command."tenantId" = $1
           AND command."inviteId" = $4
           AND command."outboxId" = $6
       ) AS command_count,
       (
         SELECT pg_catalog.count(*)::INTEGER
         FROM public."UserInvite" AS invite
         WHERE invite."id" = $4
           AND invite."tenantId" = $1
           AND invite."role" = 'OWNER'
           AND invite."accessScope" = 'NETWORK'
           AND invite."acceptedAt" IS NULL
           AND invite."revokedAt" IS NULL
       ) AS invite_count,
       (
         SELECT pg_catalog.count(*)::INTEGER
         FROM public."IdentityMailOutbox" AS outbox
         WHERE outbox."id" = $6
           AND outbox."tenantId" = $1
           AND outbox."status" = 'HOLD'
       ) AS outbox_count,
       (
         SELECT pg_catalog.count(*)::INTEGER
         FROM public."ReleaseGateAttestation" AS gate
         WHERE gate."releaseSha" = $7
           AND gate."stateRevision" = 1
           AND gate."revokedAt" IS NULL
       ) AS gate_count,
       (
         SELECT pg_catalog.count(*)::INTEGER
         FROM public."TenantAdmissionDecision" AS decision
         WHERE decision."id" = $8
           AND decision."tenantId" = $1
           AND decision."stateRevision" = 1
           AND decision."revokedAt" IS NULL
           AND decision."consumedAt" IS NULL
       ) AS available_decision_count,
       (
         SELECT pg_catalog.count(*)::INTEGER
         FROM public."TenantAdmissionDecisionGate" AS binding
         WHERE binding."decisionId" = $8
       ) AS decision_gate_count`,
    fixture.ids.tenant,
    fixture.slug,
    fixture.ids.workflow,
    fixture.ids.invite,
    fixture.ids.issueCommand,
    fixture.ids.outbox,
    fixture.release.releaseSha,
    fixture.ids.decision,
  );
  assert.deepEqual(state, {
    available_decision_count: 1,
    claim_count: 1,
    command_count: 1,
    decision_gate_count: 3,
    entitlement_count: 6,
    gate_count: 3,
    invite_count: 1,
    outbox_count: 1,
    override_count: 1,
    store_count: 1,
    tenant_count: 1,
  });
}

async function assertIdentityMailOutboxLabels(client) {
  const labels = await client.$queryRawUnsafe(
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
  assert.deepEqual(
    labels.map((row) => row.enumlabel),
    ["HOLD", "PENDING"],
  );
  return labels.map((row) => row.enumlabel);
}

async function assertExactCurrent173(
  client,
  migrationPlan,
  fixture,
  current172Snapshot,
) {
  await assertAppliedMigrations(client, migrationPlan.pre174Migrations);
  await assertIdentityMailOutboxLabels(client);
  await assertPopulatedFixture(client, fixture);
  const current173Snapshot = await readFixtureSnapshot(client, fixture);
  assert.equal(
    current173Snapshot,
    current172Snapshot,
    "Populated CURRENT_172 data changed during the isolated 173 upgrade.",
  );
  const [state] = await client.$queryRawUnsafe(
    `SELECT
       (
         SELECT pg_catalog.count(*)::INTEGER
         FROM public."IdentityMailOutbox" AS outbox
         WHERE outbox."id" = $1
           AND outbox."status" = 'HOLD'
       ) AS dormant_outbox_count,
       (
         SELECT pg_catalog.count(*)::INTEGER
         FROM pg_catalog.pg_attribute AS attribute
         INNER JOIN pg_catalog.pg_class AS relation
           ON relation.oid = attribute.attrelid
         INNER JOIN pg_catalog.pg_namespace AS namespace
           ON namespace.oid = relation.relnamespace
         WHERE namespace.nspname = 'public'
           AND relation.relname = 'IdentityMailOutbox'
           AND attribute.attname = 'releasedAt'
           AND attribute.attnum > 0
           AND NOT attribute.attisdropped
       ) AS released_at_column_count,
       (
         SELECT pg_catalog.count(*)::INTEGER
         FROM pg_catalog.pg_class AS relation
         INNER JOIN pg_catalog.pg_namespace AS namespace
           ON namespace.oid = relation.relnamespace
         WHERE namespace.nspname = 'public'
           AND relation.relname = ANY($2::TEXT[])
       ) AS runtime_relation_count,
       (
         SELECT pg_catalog.count(*)::INTEGER
         FROM pg_catalog.pg_proc AS procedure
         INNER JOIN pg_catalog.pg_namespace AS namespace
           ON namespace.oid = procedure.pronamespace
         WHERE namespace.nspname = 'public'
           AND procedure.proname = ANY($3::TEXT[])
       ) AS runtime_function_count`,
    fixture.ids.outbox,
    NEW_RUNTIME_TABLES,
    NEW_RUNTIME_FUNCTIONS,
  );
  assert.deepEqual(state, {
    dormant_outbox_count: 1,
    released_at_column_count: 0,
    runtime_function_count: 0,
    runtime_relation_count: 0,
  });
  const decision = await assertDecision(client, fixture.decisionPayload);
  assert.equal(decision.decision, "ASSERTED");
  assert.equal(decision.identityState, "ISSUED_HOLD");
  return Object.freeze({
    dormantOutboxPreserved: true,
    enumLabels: ["HOLD", "PENDING"],
    exactSnapshotPreserved: true,
    migrationCount: CURRENT_173_COUNT,
    migrationHead: CURRENT_173,
    releasedAtColumnCount: 0,
  });
}

async function assertExactCurrent174(client, migrationPlan, fixture) {
  await assertAppliedMigrations(client, migrationPlan.allMigrations);
  await assertIdentityMailOutboxLabels(client);
  const [state] = await client.$queryRawUnsafe(
    `SELECT
       (
         SELECT pg_catalog.count(*)::INTEGER
         FROM pg_catalog.pg_attribute AS attribute
         INNER JOIN pg_catalog.pg_class AS relation
           ON relation.oid = attribute.attrelid
         INNER JOIN pg_catalog.pg_namespace AS namespace
           ON namespace.oid = relation.relnamespace
         WHERE namespace.nspname = 'public'
           AND relation.relname = 'IdentityMailOutbox'
           AND attribute.attname = 'releasedAt'
           AND attribute.attnum > 0
           AND NOT attribute.attisdropped
           AND pg_catalog.format_type(
             attribute.atttypid,
             attribute.atttypmod
           ) = 'timestamp(3) with time zone'
       ) AS released_at_column_count,
       (
         SELECT pg_catalog.count(*)::INTEGER
         FROM public."IdentityMailOutbox" AS outbox
         WHERE outbox."id" = $1
           AND outbox."status" = 'HOLD'
           AND outbox."releasedAt" IS NULL
       ) AS dormant_outbox_count`,
    fixture.ids.outbox,
  );
  assert.deepEqual(state, {
    dormant_outbox_count: 1,
    released_at_column_count: 1,
  });
  const [shell] = await client.$queryRawUnsafe(
    `SELECT public."shared_beta_tenant_actual_shell_v1"($1) AS receipt`,
    fixture.ids.tenant,
  );
  assert.equal(shell.receipt.operation, "READ_SHARED_BETA_TENANT_ACTUAL_SHELL");
  assert.match(shell.receipt.actualShellDigest, /^[0-9a-f]{64}$/u);
  assert.equal(shell.receipt.profileDigest, fixture.profileDigest);
  assert.equal(shell.receipt.workflowLocator, fixture.ids.workflow);
  const decision = await assertDecision(client, fixture.decisionPayload);
  assert.equal(decision.decision, "ASSERTED");
  assert.equal(decision.identityState, "ISSUED_HOLD");
  return shell.receipt;
}

async function assertOwnerOnlyRuntimeCatalog(client) {
  const [inventory] = await client.$queryRawUnsafe(
    `WITH database_owner AS (
       SELECT database.datdba AS owner_oid
       FROM pg_catalog.pg_database AS database
       WHERE database.datname = pg_catalog.current_database()
     ),
     guarded_relation AS (
       SELECT relation.oid, relation.relowner, relation.relname
       FROM pg_catalog.pg_class AS relation
       INNER JOIN pg_catalog.pg_namespace AS namespace
         ON namespace.oid = relation.relnamespace
       WHERE namespace.nspname = 'public'
         AND relation.relkind IN ('r', 'u')
         AND relation.relname = ANY($1::TEXT[])
     ),
     guarded_function AS (
       SELECT procedure.oid, procedure.proowner, procedure.proname
       FROM pg_catalog.pg_proc AS procedure
       INNER JOIN pg_catalog.pg_namespace AS namespace
         ON namespace.oid = procedure.pronamespace
       WHERE namespace.nspname = 'public'
         AND procedure.proname = ANY($2::TEXT[])
     ),
     unsafe_acl AS (
       SELECT relation.oid
       FROM guarded_relation AS relation
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
       INNER JOIN guarded_relation AS relation
         ON relation.oid = attribute.attrelid
       CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) AS privilege
       WHERE attribute.attnum > 0
         AND NOT attribute.attisdropped
         AND privilege.grantee <> relation.relowner

       UNION ALL

       SELECT procedure.oid
       FROM guarded_function AS procedure
       INNER JOIN pg_catalog.pg_proc AS actual
         ON actual.oid = procedure.oid
       CROSS JOIN LATERAL pg_catalog.aclexplode(
         COALESCE(
           actual.proacl,
           pg_catalog.acldefault('f', actual.proowner)
         )
       ) AS privilege
       WHERE privilege.grantee <> actual.proowner
     )
     SELECT
       (
         SELECT pg_catalog.count(*)::INTEGER
         FROM guarded_relation
         WHERE relname = ANY($3::TEXT[])
       ) AS new_table_count,
       (
         SELECT pg_catalog.count(*)::INTEGER
         FROM guarded_function
       ) AS guarded_function_count,
       (
         SELECT pg_catalog.count(*)::INTEGER
         FROM (
           SELECT relowner AS owner_oid FROM guarded_relation
           UNION ALL
           SELECT proowner AS owner_oid FROM guarded_function
         ) AS object_owner
         WHERE object_owner.owner_oid <> (
           SELECT owner_oid FROM database_owner
         )
       ) AS owner_mismatch_count,
       (
         SELECT pg_catalog.count(*)::INTEGER
         FROM unsafe_acl
       ) AS unsafe_acl_count`,
    GUARDED_TABLES,
    GUARDED_FUNCTIONS,
    NEW_RUNTIME_TABLES,
  );
  assert.deepEqual(inventory, {
    guarded_function_count: 35,
    new_table_count: 6,
    owner_mismatch_count: 0,
    unsafe_acl_count: 0,
  });
  return inventory;
}

async function setUnsafeDefaultPrivileges(client, roleName, enabled) {
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
}

async function assertUnsafeDefaultPrivileges(client, roleName, expected) {
  assertSafeGeneratedRoleName(roleName);
  const rows = await client.$queryRawUnsafe(
    `SELECT
       defaults.defaclobjtype::TEXT AS object_type,
       privilege.privilege_type,
       grantee.rolname AS grantee_name,
       privilege.grantor = defaults.defaclrole AS grantor_is_owner,
       privilege.is_grantable
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
    rows,
    expected
      ? [
          {
            grantee_name: roleName,
            grantor_is_owner: true,
            is_grantable: false,
            object_type: "f",
            privilege_type: "EXECUTE",
          },
          {
            grantee_name: roleName,
            grantor_is_owner: true,
            is_grantable: false,
            object_type: "r",
            privilege_type: "SELECT",
          },
        ]
      : [],
  );
  return Object.freeze({
    defaultFunctionExecute: expected,
    defaultTableSelect: expected,
    exactGrantee: expected,
  });
}

async function assertCurrent174RolledBack(client, migrationPlan) {
  assert.deepEqual(
    await readMigrationNames(client),
    migrationPlan.pre174Migrations,
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
       ) AS runtime_relation_count,
       (
         SELECT pg_catalog.count(*)::INTEGER
         FROM pg_catalog.pg_proc AS procedure
         INNER JOIN pg_catalog.pg_namespace AS namespace
           ON namespace.oid = procedure.pronamespace
         WHERE namespace.nspname = 'public'
           AND procedure.proname = ANY($3::TEXT[])
       ) AS runtime_function_count,
       (
         SELECT pg_catalog.count(*)::INTEGER
         FROM pg_catalog.pg_attribute AS attribute
         INNER JOIN pg_catalog.pg_class AS relation
           ON relation.oid = attribute.attrelid
         INNER JOIN pg_catalog.pg_namespace AS namespace
           ON namespace.oid = relation.relnamespace
         WHERE namespace.nspname = 'public'
           AND relation.relname = 'IdentityMailOutbox'
           AND attribute.attname = 'releasedAt'
           AND attribute.attnum > 0
           AND NOT attribute.attisdropped
       ) AS released_at_column_count`,
    CURRENT_174,
    NEW_RUNTIME_TABLES,
    NEW_RUNTIME_FUNCTIONS,
  );
  assert.deepEqual(state, {
    released_at_column_count: 0,
    runtime_function_count: 0,
    runtime_relation_count: 0,
    unresolved_failure_count: 1,
  });
  const labels = await client.$queryRawUnsafe(
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
  assert.deepEqual(
    labels.map((row) => row.enumlabel),
    ["HOLD", "PENDING"],
  );
  return Object.freeze({
    current173RemainedCommitted: true,
    current174UnfinishedRows: 1,
    releasedAtColumnCount: 0,
    runtimeFunctionCount: 0,
    runtimeRelationCount: 0,
  });
}

async function assertHostileRoleHasNoRuntimeAuthority(client, roleName) {
  assertSafeGeneratedRoleName(roleName);
  const [tableState] = await client.$queryRawUnsafe(
    `SELECT
       pg_catalog.count(*) FILTER (
         WHERE pg_catalog.has_table_privilege(
           $1,
           pg_catalog.format('public.%I', relation_name),
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
    GUARDED_TABLES,
  );
  assert.deepEqual(tableState, {
    column_authority_count: 0,
    table_authority_count: 0,
  });
  const [functionState] = await client.$queryRawUnsafe(
    `SELECT pg_catalog.count(*) FILTER (
       WHERE pg_catalog.has_function_privilege(
         $1,
         procedure.oid,
         'EXECUTE'
       )
     )::INTEGER AS function_authority_count
     FROM pg_catalog.pg_proc AS procedure
     INNER JOIN pg_catalog.pg_namespace AS namespace
       ON namespace.oid = procedure.pronamespace
     WHERE namespace.nspname = 'public'
       AND procedure.proname = ANY($2::TEXT[])`,
    roleName,
    GUARDED_FUNCTIONS,
  );
  assert.deepEqual(functionState, { function_authority_count: 0 });
  return {
    columnAuthority: 0,
    functionAuthority: 0,
    tableAuthority: 0,
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
    [names.upgradeDatabaseName, names.hostileDatabaseName],
    names.hostileRoleName,
  );
  assert.deepEqual(state, { database_count: 0, role_count: 0 });
}

async function assertTempRootRemoved(tempRoot) {
  await assert.rejects(stat(tempRoot), (error) => error?.code === "ENOENT");
}

async function runOfflineSelfTest() {
  const parsed = parseSafeSourceDatabaseUrl(
    "postgresql://postgres:postgres@127.0.0.1:5432/leetplus_ci?schema=public",
  );
  assert.equal(parsed.databaseName, "leetplus_ci");
  for (const unsafeUrl of [
    "postgresql://postgres@database.invalid/leetplus_ci?schema=public",
    "postgresql://postgres@127.0.0.1/leetplus_test?schema=public",
    "postgresql://postgres@127.0.0.1/leetplus_ci?schema=private",
    "postgresql://postgres@127.0.0.1/leetplus_ci?schema=public&sslmode=disable",
  ]) {
    assert.throws(() => parseSafeSourceDatabaseUrl(unsafeUrl));
  }
  assert.throws(() =>
    assertRealEnvironment({
      DATABASE_URL: "postgresql://postgres@127.0.0.1/leetplus_ci?schema=public",
      NODE_ENV: "production",
      SHARED_BETA_RUNTIME_RELEASE_ACTIVATION_UPGRADE_SMOKE_CONFIRM:
        REQUIRED_CONFIRMATION,
    }),
  );
  const names = generatedNames();
  assertSafeGeneratedDatabaseName(names.upgradeDatabaseName);
  assertSafeGeneratedDatabaseName(names.hostileDatabaseName);
  assertSafeGeneratedRoleName(names.hostileRoleName);
  assert.throws(() => assertSafeGeneratedDatabaseName("leetplus_ci"));
  assert.throws(() => assertSafeGeneratedRoleName("postgres"));
  assertSafeTempRoot(join(tmpdir(), `${TEMP_ROOT_PREFIX}0123456789abcdef`));
  assert.throws(() => assertSafeTempRoot(tmpdir()));
  assert.equal(MODULES.length, 6);
  assert.equal(OWNER_CAPABILITIES.length, 41);
  assert.equal(new Set(OWNER_CAPABILITIES).size, 41);
  assert.equal(EXPECTED_CAPABILITY_DIGEST.length, 64);
  assert.equal(NEW_RUNTIME_TABLES.length, 6);
  assert.equal(NEW_RUNTIME_FUNCTIONS.length, 21);
  assert.equal(GUARDED_FUNCTIONS.length, 35);
  assert.equal(
    sha256Bytes(Buffer.alloc(0)),
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  );

  const migrationPlan = await readMigrationPlan();
  assert.equal(migrationPlan.prefixMigrations.length, CURRENT_172_COUNT);
  assert.equal(migrationPlan.pre174Migrations.length, CURRENT_173_COUNT);
  assert.equal(migrationPlan.allMigrations.length, CURRENT_174_COUNT);
  const migration173 = await readFile(
    join(
      migrationPlan.sourcePrismaDir,
      "migrations",
      CURRENT_173,
      "migration.sql",
    ),
    "utf8",
  );
  const migration174 = await readFile(
    join(
      migrationPlan.sourcePrismaDir,
      "migrations",
      CURRENT_174,
      "migration.sql",
    ),
    "utf8",
  );
  assert.match(
    migration173,
    /ALTER TYPE public\."IdentityMailOutboxStatus"\s+ADD VALUE 'PENDING'/u,
  );
  assert.doesNotMatch(migration173, /UPDATE\s+public\."IdentityMailOutbox"/iu);
  for (const contractFragment of [
    'ADD COLUMN "releasedAt" TIMESTAMP(3) WITH TIME ZONE',
    'CREATE UNLOGGED TABLE public."SharedBetaRuntimeInstanceAnchor"',
    'CREATE TABLE public."SharedBetaTenantActivationCommand"',
    'CREATE FUNCTION public."shared_beta_tenant_actual_shell_v1"',
    'CREATE FUNCTION public."shared_beta_tenant_activate_v1"',
    "DO $owner_only_acl$",
  ]) {
    assert(
      migration174.includes(contractFragment),
      `CURRENT_174 contract fragment missing: ${contractFragment}`,
    );
  }
  process.stdout.write(
    `${JSON.stringify({
      script: SCRIPT_NAME,
      status: "PASS",
      mode: "SELF_TEST",
      fromMigration: CURRENT_172,
      fromMigrationCount: CURRENT_172_COUNT,
      intermediateMigration: CURRENT_173,
      toMigration: CURRENT_174,
      toMigrationCount: CURRENT_174_COUNT,
      populatedFixtureRelations: 12,
      modules: MODULES.length,
      ownerCapabilities: OWNER_CAPABILITIES.length,
      generatedDatabaseCount: 2,
      generatedRoleCount: 1,
      releaseInputFingerprints:
        await readSourceReleaseFingerprints(migrationPlan),
      destructiveSourceDatabaseActions: 0,
    })}\n`,
  );
}

async function runRealSmoke(environment) {
  const { databaseName: sourceDatabaseName, sourceUrl } =
    assertRealEnvironment(environment);
  const migrationPlan = await readMigrationPlan();
  const names = generatedNames();
  const sourceDatabaseUrl = databaseUrlFor(sourceUrl, sourceDatabaseName);
  const upgradeDatabaseUrl = databaseUrlFor(
    sourceUrl,
    names.upgradeDatabaseName,
  );
  const hostileDatabaseUrl = databaseUrlFor(
    sourceUrl,
    names.hostileDatabaseName,
  );
  const admin = prismaClient(sourceDatabaseUrl);
  const createdDatabases = [];
  const cleanupErrors = [];
  let clusterLockHeld = false;
  let hostileRoleCreated = false;
  let tempRoot;
  let primaryError;
  let evidence;
  let sourceMigrationState;
  let sourceReleaseFingerprints;

  try {
    await assertTestSuperuser(admin, sourceDatabaseName);
    sourceMigrationState = await readMigrationNames(admin);
    sourceReleaseFingerprints =
      await readSourceReleaseFingerprints(migrationPlan);
    await acquireClusterLock(admin);
    clusterLockHeld = true;
    tempRoot = await mkdtemp(join(tmpdir(), TEMP_ROOT_PREFIX));
    assertSafeTempRoot(tempRoot);
    const artifact = await createMigrationArtifact(tempRoot, migrationPlan);
    assert.deepEqual(artifact.baseCopyIntegrity, {
      migrationLockSha256: sourceReleaseFingerprints.migrationLockSha256,
      schemaSha256: sourceReleaseFingerprints.schemaSha256,
    });

    for (const databaseName of [
      names.upgradeDatabaseName,
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
    let fixture;
    let beforeSnapshot;
    try {
      await assertAppliedMigrations(upgrade, migrationPlan.prefixMigrations);
      fixture = await createCurrent172Fixture(
        upgrade,
        names.upgradeDatabaseName,
      );
      await assertPopulatedFixture(upgrade, fixture);
      beforeSnapshot = await readFixtureSnapshot(upgrade, fixture);
    } finally {
      await upgrade.$disconnect();
    }

    const hostileBefore = prismaClient(hostileDatabaseUrl);
    let hostileDefaultsBefore;
    try {
      await assertAppliedMigrations(
        hostileBefore,
        migrationPlan.prefixMigrations,
      );
      await setUnsafeDefaultPrivileges(
        hostileBefore,
        names.hostileRoleName,
        true,
      );
      hostileDefaultsBefore = await assertUnsafeDefaultPrivileges(
        hostileBefore,
        names.hostileRoleName,
        true,
      );
    } finally {
      await hostileBefore.$disconnect();
    }

    const migration173Copy = await addTargetMigration(
      artifact,
      migrationPlan,
      CURRENT_173,
    );
    await assertCopiedTargetMigrationIntegrity(
      artifact,
      migrationPlan,
      migration173Copy,
    );
    runMigrateDeploy(artifact.schemaPath, upgradeDatabaseUrl);

    upgrade = prismaClient(upgradeDatabaseUrl);
    let current173Evidence;
    try {
      current173Evidence = await assertExactCurrent173(
        upgrade,
        migrationPlan,
        fixture,
        beforeSnapshot,
      );
    } finally {
      await upgrade.$disconnect();
    }

    const migration174Copy = await addTargetMigration(
      artifact,
      migrationPlan,
      CURRENT_174,
    );
    await assertCopiedTargetMigrationIntegrity(
      artifact,
      migrationPlan,
      migration174Copy,
    );
    runMigrateDeploy(artifact.schemaPath, upgradeDatabaseUrl);

    upgrade = prismaClient(upgradeDatabaseUrl);
    let shellReceipt;
    let catalog;
    try {
      await assertPopulatedFixture(upgrade, fixture);
      const afterSnapshot = await readFixtureSnapshot(upgrade, fixture);
      assert.equal(
        afterSnapshot,
        beforeSnapshot,
        "Populated CURRENT_172 data changed during the 173/174 upgrade.",
      );
      shellReceipt = await assertExactCurrent174(
        upgrade,
        migrationPlan,
        fixture,
      );
      catalog = await assertOwnerOnlyRuntimeCatalog(upgrade);
    } finally {
      await upgrade.$disconnect();
    }

    await assertCopiedTargetMigrationIntegrity(
      artifact,
      migrationPlan,
      migration173Copy,
    );
    await assertCopiedTargetMigrationIntegrity(
      artifact,
      migrationPlan,
      migration174Copy,
    );
    const hostileFailure = expectMigrateDeployFailure(
      artifact.schemaPath,
      hostileDatabaseUrl,
    );
    const hostileFailed = prismaClient(hostileDatabaseUrl);
    let hostileRollbackEvidence;
    let hostileDefaultsAfterFailure;
    let hostileDefaultsAfterRevoke;
    try {
      hostileRollbackEvidence = await assertCurrent174RolledBack(
        hostileFailed,
        migrationPlan,
      );
      hostileDefaultsAfterFailure = await assertUnsafeDefaultPrivileges(
        hostileFailed,
        names.hostileRoleName,
        true,
      );
      await setUnsafeDefaultPrivileges(
        hostileFailed,
        names.hostileRoleName,
        false,
      );
      hostileDefaultsAfterRevoke = await assertUnsafeDefaultPrivileges(
        hostileFailed,
        names.hostileRoleName,
        false,
      );
    } finally {
      await hostileFailed.$disconnect();
    }
    runMigrateResolveRolledBack(artifact.schemaPath, hostileDatabaseUrl);
    await assertCopiedTargetMigrationIntegrity(
      artifact,
      migrationPlan,
      migration174Copy,
    );
    runMigrateDeploy(artifact.schemaPath, hostileDatabaseUrl);

    const hostileRetry = prismaClient(hostileDatabaseUrl);
    let hostileAuthority;
    try {
      await assertAppliedMigrations(hostileRetry, migrationPlan.allMigrations);
      await assertOwnerOnlyRuntimeCatalog(hostileRetry);
      hostileAuthority = await assertHostileRoleHasNoRuntimeAuthority(
        hostileRetry,
        names.hostileRoleName,
      );
    } finally {
      await hostileRetry.$disconnect();
    }

    assert.deepEqual(
      await readMigrationNames(admin),
      sourceMigrationState,
      "The source *_ci database migration state changed.",
    );
    assert.deepEqual(
      await readSourceReleaseFingerprints(migrationPlan),
      sourceReleaseFingerprints,
      "The source schema, migration lock, or target migration bytes changed.",
    );
    evidence = {
      script: SCRIPT_NAME,
      status: "PASS",
      postgresMajor: 16,
      upgrade: {
        fromMigration: CURRENT_172,
        fromMigrationCount: CURRENT_172_COUNT,
        intermediateMigration: CURRENT_173,
        current173: current173Evidence,
        toMigration: CURRENT_174,
        toMigrationCount: CURRENT_174_COUNT,
        tenantPreserved: true,
        storePreserved: true,
        ownerOverridePreserved: true,
        entitlementsPreserved: 6,
        identityClaimPreserved: true,
        ownerInviteCommandPreserved: true,
        ownerInvitePreserved: true,
        holdOutboxPreserved: true,
        releasedAt: null,
        signedGatesPreserved: 3,
        availableDecisionPreserved: true,
        decisionGateBindingsPreserved: 3,
        exactSnapshotPreserved: true,
        enumLabels: ["HOLD", "PENDING"],
        actualShellValidated: true,
        actualShellDigest: shellReceipt.actualShellDigest,
        profileDigest: shellReceipt.profileDigest,
      },
      releaseInputs: {
        copiedMigrationBytesVerified: true,
        migration173: migration173Copy,
        migration174: migration174Copy,
        sourceFingerprints: sourceReleaseFingerprints,
        sourceInputsUnchanged: true,
      },
      catalog: {
        newRuntimeTables: catalog.new_table_count,
        guardedFunctions: catalog.guarded_function_count,
        unsafeAclEntries: catalog.unsafe_acl_count,
        ownerMismatches: catalog.owner_mismatch_count,
      },
      hostileAcl: {
        defaultTableRollback: true,
        defaultFunctionRollback: true,
        exactDefaultsBeforeDeploy: hostileDefaultsBefore,
        exactDefaultsAfterFailure: hostileDefaultsAfterFailure,
        exactDefaultsAfterRevoke: hostileDefaultsAfterRevoke,
        current173RemainedCommitted: true,
        current174RolledBack: true,
        rollbackState: hostileRollbackEvidence,
        migrationDeployFailure: hostileFailure,
        rollbackResolved: true,
        normalRetrySucceeded: true,
        ownerOnlyAfterRetry: true,
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
        await assertTempRootRemoved(tempRoot);
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
  }

  if (primaryError && cleanupErrors.length > 0) {
    throw new AggregateError(
      [primaryError, ...cleanupErrors],
      "Runtime activation upgrade smoke and cleanup both failed.",
    );
  }
  if (primaryError) throw primaryError;
  if (cleanupErrors.length > 0) {
    throw new AggregateError(
      cleanupErrors,
      "Runtime activation upgrade smoke cleanup failed.",
    );
  }
  assert.ok(evidence);
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
          error?.code ?? "SHARED_BETA_RUNTIME_ACTIVATION_UPGRADE_SMOKE_FAILED",
        message:
          typeof error?.message === "string"
            ? error.message
            : "Shared beta runtime activation upgrade smoke failed.",
      },
    })}\n`,
  );
  process.exitCode = 1;
});

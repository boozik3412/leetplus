import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const DATABASE_DIRECTORY = dirname(SCRIPT_DIRECTORY);
const CANDIDATE_NAME =
  "20260805050000_identity_mail_ddl_fence_ledger_current187";
const CANDIDATE_DIRECTORY = join(
  DATABASE_DIRECTORY,
  "migration-candidates",
  CANDIDATE_NAME,
);
const SQL_PATH = join(CANDIDATE_DIRECTORY, "migration.sql");
const METADATA_PATH = join(CANDIDATE_DIRECTORY, "candidate.json");
const README_PATH = join(CANDIDATE_DIRECTORY, "README.md");
const MODULE_PATH = join(
  SCRIPT_DIRECTORY,
  "identity-mail-ddl-fence-ledger-current187.mjs",
);
const AUTHORITY_PATH = join(
  SCRIPT_DIRECTORY,
  "identity-mail-ddl-fence-attestation-current187-authority.mjs",
);
const INTEGRATION_PATH = join(
  SCRIPT_DIRECTORY,
  "identity-mail-ddl-fence-ledger-current187.pg.integration.test.mjs",
);
const DOCUMENT_PATH = join(
  dirname(DATABASE_DIRECTORY),
  "..",
  "docs",
  "open-beta",
  "identity-mail-current187-persisted-ddl-fence-ledger.md",
);

function normalized(value) {
  return value.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
}

function sha256(value) {
  return createHash("sha256").update(normalized(value), "utf8").digest("hex");
}

async function sources() {
  const [
    sql,
    metadataText,
    readme,
    moduleSource,
    authoritySource,
    integrationSource,
    document,
  ] = await Promise.all([
    readFile(SQL_PATH, "utf8"),
    readFile(METADATA_PATH, "utf8"),
    readFile(README_PATH, "utf8"),
    readFile(MODULE_PATH, "utf8"),
    readFile(AUTHORITY_PATH, "utf8"),
    readFile(INTEGRATION_PATH, "utf8"),
    readFile(DOCUMENT_PATH, "utf8"),
  ]);
  return {
    authoritySource,
    document,
    integrationSource,
    metadata: JSON.parse(metadataText),
    moduleSource,
    readme,
    sql: normalized(sql),
  };
}

test("CURRENT187-E candidate is hash-pinned, noncanonical, and deny-only", async () => {
  const { metadata, sql } = await sources();
  assert.equal(metadata.schemaVersion, 1);
  assert.equal(
    metadata.contract,
    "CURRENT187_DDL_FENCE_LEDGER_SYNTHETIC_CI_V1",
  );
  assert.equal(metadata.candidate, CANDIDATE_NAME);
  assert.deepEqual(metadata.predecessor, {
    requiredContract:
      "CURRENT187_INDEPENDENT_TECHNICAL_DDL_FENCE_ATTESTATION_V1",
    resolved: false,
  });
  assert.equal(metadata.migrationSqlSha256, sha256(sql));
  assert.equal(metadata.status, "NOT_DEPLOYABLE");
  for (const flag of [
    "authorization",
    "canMutateProduction",
    "canActivateApplicationRoute",
    "canConsumeProductionAttestation",
    "canRevokeProductionAttestation",
    "canSend",
    "testAccessAuthorized",
    "sharedBetaAccess",
    "productionRootEnrolled",
    "applicationRoleAllowlistBound",
    "productionApplyAuthorized",
  ]) {
    assert.equal(metadata[flag], false, flag);
  }
  assert.equal(metadata.productionRootsFrozenEmpty, true);

  const canonicalMigrations = await readdir(
    join(DATABASE_DIRECTORY, "prisma", "migrations"),
  );
  assert.equal(canonicalMigrations.includes(CANDIDATE_NAME), false);
  assert.doesNotMatch(
    CANDIDATE_DIRECTORY.replaceAll("\\", "/"),
    /prisma\/migrations/u,
  );
});

test("install is bounded to one confirmed disposable CI database and exact unprivileged roles", async () => {
  const { sql } = await sources();
  assert.match(sql, /\^lp_c187e_\[0-9a-f\]\{12\}_ci\$/u);
  assert.match(sql, /rehearse-current187e-ddl-fence-ledger-loopback-ci-only/u);
  for (const role of ["consumer", "revoker", "runtime"]) {
    assert.match(sql, new RegExp(`current187e_${role}_role_name`, "u"));
    assert.match(sql, new RegExp(`current187e_${role}_role_oid`, "u"));
  }
  assert.match(sql, /actor_oid IS DISTINCT FROM database_owner_oid/u);
  for (const attribute of [
    "rolsuper",
    "rolcreatedb",
    "rolcreaterole",
    "rolreplication",
    "rolbypassrls",
  ]) {
    assert.equal(
      (sql.match(new RegExp(`role_entry\\.${attribute} = false`, "gu")) ?? [])
        .length,
      3,
      attribute,
    );
  }
  assert.match(sql, /pg_catalog\.pg_auth_members/u);
  assert.doesNotMatch(sql, /CREATE DATABASE|CREATE ROLE|ALTER ROLE/u);
});

test("append-only schema pins exact identity uniqueness, forced RLS, and owner-only policies", async () => {
  const { sql } = await sources();
  assert.deepEqual(
    [...sql.matchAll(/CREATE TABLE public\."([^"]+)"/gu)].map(
      (match) => match[1],
    ),
    [
      "Current187DdlFenceLedgerPolicy",
      "Current187DdlFenceConsumptionLedger",
      "Current187DdlFenceRevocationLedger",
    ],
  );
  assert.match(sql, /"operationId" UUID PRIMARY KEY/u);
  assert.match(sql, /"nonce" CHAR\(64\).*NOT NULL UNIQUE/u);
  assert.match(sql, /"envelopeDigest" CHAR\(64\).*NOT NULL UNIQUE/u);
  assert.match(
    sql,
    /CONSTRAINT "Current187DdlFenceRevocationLedger_scope_unique"\s+UNIQUE \("scope", "scopeDigest"\)/u,
  );
  assert.equal((sql.match(/ENABLE ROW LEVEL SECURITY/gu) ?? []).length, 3);
  assert.equal((sql.match(/FORCE ROW LEVEL SECURITY/gu) ?? []).length, 3);
  assert.equal((sql.match(/_owner_only'/gu) ?? []).length, 3);
  const policyBlock = sql.slice(
    sql.indexOf("DO $current187_e_owner_policies$"),
    sql.indexOf("$current187_e_owner_policies$;"),
  );
  assert.match(policyBlock, /owner_name TEXT := current_user/u);
  assert.equal((policyBlock.match(/TO %I USING \(true\)/gu) ?? []).length, 3);
  assert.doesNotMatch(
    policyBlock,
    /\b(?:consumer_name|revoker_name|runtime_name)\b|FROM PUBLIC|TO PUBLIC/iu,
  );
  assert.equal((sql.match(/_no_update_delete"/gu) ?? []).length, 3);
  assert.equal((sql.match(/_no_truncate"/gu) ?? []).length, 3);
  assert.match(sql, /RAISE EXCEPTION 'CURRENT187-E ledger is append-only'/u);
});

test("consume/revoke share transaction locks before any existing-row lock", async () => {
  const { sql } = await sources();
  const consumeStart = sql.indexOf(
    "-- Shared transaction-lock order is root -> envelope -> attestation ->",
  );
  const consumeEnd = sql.indexOf(
    'CREATE OR REPLACE FUNCTION public."current187_ddl_fence_revoke_v1"',
  );
  const consume = sql.slice(consumeStart, consumeEnd);
  const order = [
    "current187e:root:",
    "current187e:envelope:",
    "current187e:attestation:",
    "current187e:operation:",
    "current187e:nonce:",
    "FOR UPDATE",
  ].map((needle) => consume.indexOf(needle));
  assert.ok(
    order.every((index) => index >= 0),
    JSON.stringify(order),
  );
  assert.deepEqual(
    [...order].sort((left, right) => left - right),
    order,
  );
  assert.equal(
    (consume.match(/pg_catalog\.pg_advisory_xact_lock\(/gu) ?? []).length,
    5,
  );
  const finalLockIndex = consume.indexOf("current187e:nonce:");
  const freshClockIndex = consume.indexOf(
    "v_now := pg_catalog.clock_timestamp();",
  );
  const expiryCheckIndex = consume.indexOf("IF v_valid_until <= v_now");
  const revocationReadIndex = consume.indexOf(
    'FROM public."Current187DdlFenceRevocationLedger"',
  );
  assert.ok(finalLockIndex < freshClockIndex, "clock must be read after locks");
  assert.ok(freshClockIndex < expiryCheckIndex, "fresh clock must gate expiry");
  assert.ok(
    expiryCheckIndex < revocationReadIndex,
    "fresh expiry must be checked before persisted authorization",
  );

  const revoke = sql.slice(consumeEnd);
  for (const namespace of [
    "current187e:root:",
    "current187e:envelope:",
    "current187e:attestation:",
  ]) {
    assert.match(revoke, new RegExp(namespace, "u"));
  }
  assert.ok(
    revoke.indexOf("pg_catalog.pg_advisory_xact_lock(") <
      revoke.indexOf("FOR UPDATE"),
  );
  assert.doesNotMatch(sql, /pg_advisory_lock\(/u);
});

test("ACL surface is execute-only for exact consumer/revoker and zero for PUBLIC/runtime", async () => {
  const { integrationSource, sql } = await sources();
  assert.equal((sql.match(/REVOKE ALL ON TABLE/gu) ?? []).length, 3);
  assert.equal((sql.match(/REVOKE ALL ON FUNCTION/gu) ?? []).length, 3);
  assert.equal((sql.match(/GRANT EXECUTE ON FUNCTION/gu) ?? []).length, 2);
  assert.equal((sql.match(/GRANT USAGE ON SCHEMA public/gu) ?? []).length, 2);
  const grantBlock = sql.slice(sql.indexOf("DO $current187_e_grants$"));
  assert.match(grantBlock, /current187_ddl_fence_consume_v1/u);
  assert.match(grantBlock, /current187_ddl_fence_revoke_v1/u);
  assert.doesNotMatch(grantBlock, /runtime_name|runtime_role/u);

  for (const marker of [
    "pg_catalog.aclexplode",
    "information_schema.role_table_grants",
    "information_schema.role_routine_grants",
    "SET ROLE",
    "SELECT * FROM",
    "INSERT INTO",
    "UPDATE public",
    "DELETE FROM",
    "TRUNCATE public",
    "rlsForced",
  ]) {
    assert.match(
      integrationSource,
      new RegExp(marker.replaceAll("*", "\\*"), "u"),
    );
  }
});

test("hostile fixture pins exact replay, conflicts, expiry, revoke-after-response, race, and zero residue", async () => {
  const { integrationSource } = await sources();
  for (const marker of [
    "Promise.all([",
    "assert.equal(replayReceipt, firstReceipt)",
    "conflictCases",
    "expiresWhileWaiting",
    "staleWaitResidue",
    '"23505"',
    '"55000"',
    "firstRevocationReceipt",
    "await expectSqlState(() => consume(consumerOne, firstBundle)",
    "Promise.allSettled([",
    "DROP DATABASE IF EXISTS",
    "DROP ROLE IF EXISTS",
    "assert.deepEqual(residue[0], { databases: 0, roles: 0 })",
  ]) {
    assert.ok(integrationSource.includes(marker), marker);
  }
  assert.match(
    integrationSource,
    /run-current187e-ddl-fence-ledger-postgres-e2e/u,
  );
  assert.match(integrationSource, /lp_c187e_\$\{suffix\}_ci/u);
});

test("receipts remain purpose-bound, secret-free, non-deployable, and production-root empty", async () => {
  const { authoritySource, document, moduleSource, readme, sql } =
    await sources();
  assert.match(authoritySource, /issuedAt: payload\.issuedAt/u);
  assert.match(authoritySource, /validUntil: payload\.validUntil/u);
  for (const value of [
    "CURRENT187_TECHNICAL_DDL_FENCE_ATTESTATION_V1",
    "LEETPLUS_CURRENT187_INDEPENDENT_DDL_FENCE_AUTHORITY_V1",
    "CURRENT187_TECHNICAL_DDL_FENCE_REVOCATION_V1",
    "LEETPLUS_CURRENT187_DDL_FENCE_REVOCATION_AUTHORITY_V1",
  ]) {
    assert.match(`${moduleSource}\n${sql}`, new RegExp(value, "u"));
  }
  assert.match(moduleSource, /productionRootsFrozenEmpty: true/u);
  assert.match(moduleSource, /status: "NONCANONICAL_DENY_ONLY_SYNTHETIC_CI"/u);
  assert.doesNotMatch(
    `${moduleSource}\n${sql}\n${readme}\n${document}`,
    /gr1mmphone1@gmail\.com|leetplus\.ru|api\.leetplus\.ru/u,
  );
  assert.match(readme, /NOT_DEPLOYABLE/u);
  assert.match(document, /внешний тестовый доступ остаётся `NO-GO`/u);
});

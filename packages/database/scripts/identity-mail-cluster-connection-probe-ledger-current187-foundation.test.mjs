import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const DATABASE_DIRECTORY = dirname(SCRIPT_DIRECTORY);
const CANDIDATE_NAME =
  "20260812170000_identity_mail_connection_probe_ledger_current187";
const CANDIDATE_DIRECTORY = join(
  DATABASE_DIRECTORY,
  "migration-candidates",
  CANDIDATE_NAME,
);
const SQL_PATH = join(CANDIDATE_DIRECTORY, "migration.sql");
const METADATA_PATH = join(CANDIDATE_DIRECTORY, "candidate.json");
const README_PATH = join(CANDIDATE_DIRECTORY, "README.md");
const PG_TEST_PATH = join(
  SCRIPT_DIRECTORY,
  "identity-mail-cluster-connection-probe-ledger-current187.pg.integration.test.mjs",
);

function normalized(value) {
  return value.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
}

function sha256(value) {
  return createHash("sha256").update(normalized(value), "utf8").digest("hex");
}

async function sources() {
  const [sql, metadataText, readme, pgTest] = await Promise.all([
    readFile(SQL_PATH, "utf8"),
    readFile(METADATA_PATH, "utf8"),
    readFile(README_PATH, "utf8"),
    readFile(PG_TEST_PATH, "utf8"),
  ]);
  return {
    metadata: JSON.parse(metadataText),
    pgTest: normalized(pgTest),
    readme,
    sql: normalized(sql),
  };
}

test("J5-R3 candidate is hash-pinned, noncanonical, and deny-only", async () => {
  const { metadata, sql } = await sources();
  assert.equal(metadata.schemaVersion, 1);
  assert.equal(
    metadata.contract,
    "CURRENT187_CONNECTION_PROBE_LEDGER_SYNTHETIC_CI_V1",
  );
  assert.equal(metadata.candidate, CANDIDATE_NAME);
  assert.equal(metadata.migrationSqlSha256, sha256(sql));
  assert.equal(metadata.status, "NOT_DEPLOYABLE");
  assert.deepEqual(metadata.predecessor, {
    requiredContract:
      "CURRENT187_J5_R3_PERSISTED_CONNECTION_PROBE_CONSUMPTION_REVOCATION_LEDGER",
    resolved: false,
  });
  for (const flag of [
    "authorization",
    "canMutateProduction",
    "canActivateApplicationRoute",
    "canConsumeProductionProbe",
    "canRevokeProductionProbe",
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

test("install is bounded to one confirmed disposable database and exact unprivileged roles", async () => {
  const { pgTest, sql } = await sources();
  assert.match(sql, /\^lp_c187j5l_\[0-9a-f\]\{12\}_ci\$/u);
  assert.match(
    pgTest,
    /!\["127\.0\.0\.1", "localhost", "::1"\]\.includes\(url\.hostname\)/u,
  );
  assert.doesNotMatch(sql, /inet_server_addr|inet_client_addr/u);
  assert.match(
    sql,
    /rehearse-current187j5l-connection-probe-ledger-loopback-ci-only/u,
  );
  for (const role of ["consumer", "revoker", "runtime"]) {
    assert.match(sql, new RegExp(`current187j5l_${role}_role_name`, "u"));
    assert.match(sql, new RegExp(`current187j5l_${role}_role_oid`, "u"));
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

test("append-only tables use forced RLS and owner-only policies", async () => {
  const { sql } = await sources();
  assert.deepEqual(
    [...sql.matchAll(/CREATE TABLE public\."([^"]+)"/gu)].map(
      (match) => match[1],
    ),
    [
      "Current187ConnectionProbeLedgerPolicy",
      "Current187ConnectionProbeConsumptionLedger",
      "Current187ConnectionProbeRevocationLedger",
    ],
  );
  assert.match(sql, /"operationId" UUID PRIMARY KEY/u);
  assert.match(sql, /"nonce" CHAR\(64\).*NOT NULL UNIQUE/u);
  assert.match(sql, /"envelopeDigest" CHAR\(64\).*NOT NULL UNIQUE/u);
  assert.match(
    sql,
    /CONSTRAINT "Current187ConnectionProbeRevocationLedger_scope_unique"\s+UNIQUE \("scope", "scopeDigest"\)/u,
  );
  assert.equal((sql.match(/ENABLE ROW LEVEL SECURITY/gu) ?? []).length, 3);
  assert.equal((sql.match(/FORCE ROW LEVEL SECURITY/gu) ?? []).length, 3);
  assert.equal((sql.match(/_owner_only'/gu) ?? []).length, 3);
  assert.equal((sql.match(/_no_update_delete"/gu) ?? []).length, 3);
  assert.equal((sql.match(/_no_truncate"/gu) ?? []).length, 3);
  assert.match(sql, /CURRENT187-J5-R3 ledger is append-only/u);
});

test("consume and revoke share one deadlock-free root-to-matrix lock order", async () => {
  const { sql } = await sources();
  const consumeStart = sql.indexOf(
    'CREATE OR REPLACE FUNCTION public."current187_connection_probe_consume_v1"',
  );
  const revokeStart = sql.indexOf(
    'CREATE OR REPLACE FUNCTION public."current187_connection_probe_revoke_v1"',
  );
  const consume = sql.slice(consumeStart, revokeStart);
  const revoke = sql.slice(revokeStart);
  const sharedOrder = [
    "current187j5l:root:",
    "current187j5l:envelope:",
    "current187j5l:matrix:",
  ];
  for (const body of [consume, revoke]) {
    const offsets = sharedOrder.map((needle) => body.indexOf(needle));
    assert.ok(offsets.every((offset) => offset >= 0));
    assert.deepEqual(
      [...offsets].sort((left, right) => left - right),
      offsets,
    );
    assert.ok(body.indexOf(sharedOrder.at(-1)) < body.indexOf("FOR UPDATE"));
  }
  assert.ok(
    consume.indexOf("current187j5l:matrix:") <
      consume.indexOf("current187j5l:operation:"),
  );
  assert.ok(
    consume.indexOf("current187j5l:operation:") <
      consume.indexOf("current187j5l:nonce:"),
  );
  assert.doesNotMatch(sql, /pg_advisory_lock\(/u);
});

test("fresh time and revocation checks occur after the complete lock wait", async () => {
  const { sql } = await sources();
  const consumeStart = sql.indexOf(
    'CREATE OR REPLACE FUNCTION public."current187_connection_probe_consume_v1"',
  );
  const revokeStart = sql.indexOf(
    'CREATE OR REPLACE FUNCTION public."current187_connection_probe_revoke_v1"',
  );
  const consume = sql.slice(consumeStart, revokeStart);
  const finalLock = consume.indexOf("current187j5l:nonce:");
  const exactReplay = consume.indexOf("FOR UPDATE", finalLock);
  const freshClock = consume.indexOf(
    "v_now := pg_catalog.clock_timestamp();",
    finalLock,
  );
  const expiry = consume.indexOf("IF v_issued_at", freshClock);
  const revocationRead = consume.indexOf(
    'FROM public."Current187ConnectionProbeRevocationLedger"',
    expiry,
  );
  assert.ok(finalLock < exactReplay);
  assert.ok(exactReplay < freshClock);
  assert.ok(freshClock < expiry);
  assert.ok(expiry < revocationRead);

  const revoke = sql.slice(revokeStart);
  const revokeFinalLock = revoke.indexOf("current187j5l:matrix:");
  const revokeExactReplay = revoke.indexOf("FOR UPDATE", revokeFinalLock);
  const revokeFreshClock = revoke.indexOf(
    "v_now := pg_catalog.clock_timestamp();",
    revokeFinalLock,
  );
  assert.ok(revokeFinalLock < revokeExactReplay);
  assert.ok(revokeExactReplay < revokeFreshClock);
});

test("RPCs pin exact command and receipt domains with bounded secret-free JSON", async () => {
  const { sql } = await sources();
  for (const domain of [
    "LEETPLUS_CURRENT187_CONNECTION_PROBE_CONSUMPTION_COMMAND_V1",
    "LEETPLUS_CURRENT187_CONNECTION_PROBE_REVOCATION_COMMAND_V1",
    "LEETPLUS_CURRENT187_CONNECTION_PROBE_CONSUMPTION_RECEIPT_V1",
    "LEETPLUS_CURRENT187_CONNECTION_PROBE_REVOCATION_RECEIPT_V1",
  ]) {
    assert.equal((sql.match(new RegExp(domain, "gu")) ?? []).length, 1, domain);
  }
  assert.equal(
    (sql.match(/octet_length\("commandCanonicalJson"\)/gu) ?? []).length,
    2,
  );
  assert.equal(
    (sql.match(/octet_length\("receiptCanonicalJson"\)/gu) ?? []).length,
    2,
  );
  assert.match(sql, /envelopeDigest.*connectionProbeMatrixDigest/su);
  assert.match(sql, /persistedConsumptionVerified\\?":true/u);
  assert.match(sql, /persistedRevocationVerified\\?":true/u);
  assert.equal(
    (
      sql.match(
        /p_command_canonical_json IS DISTINCT FROM\s+v_expected_command_canonical_json/gu,
      ) ?? []
    ).length,
    2,
  );
  assert.match(sql, /consumption command is not canonical/u);
  assert.match(sql, /revocation command is not canonical/u);
});

test("ACL is execute-only for consumer and revoker and grants nothing to runtime", async () => {
  const { readme, sql } = await sources();
  assert.equal((sql.match(/REVOKE ALL ON TABLE/gu) ?? []).length, 3);
  assert.equal((sql.match(/REVOKE ALL ON FUNCTION/gu) ?? []).length, 3);
  assert.equal((sql.match(/GRANT EXECUTE ON FUNCTION/gu) ?? []).length, 2);
  assert.equal((sql.match(/GRANT USAGE ON SCHEMA public/gu) ?? []).length, 2);
  const grantBlock = sql.slice(sql.indexOf("DO $current187_j5l_grants$"));
  assert.doesNotMatch(grantBlock, /runtime_name|runtime_role/u);
  assert.match(readme, /NONCANONICAL \/ DENY-ONLY \/ SYNTHETIC-CI/u);
  assert.match(readme, /does not enroll a production root/u);
});

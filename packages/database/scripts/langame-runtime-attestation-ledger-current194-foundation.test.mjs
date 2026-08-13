import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "successor-candidates",
  "20260813030000_langame_runtime_attestation_ledger_current194",
);
const sql = readFileSync(join(root, "migration.sql"), "utf8");
const candidate = JSON.parse(
  readFileSync(join(root, "candidate.json"), "utf8"),
);
const smoke = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    "langame-runtime-attestation-ledger-current194-smoke.sql",
  ),
  "utf8",
);
const sha256 = (value) =>
  createHash("sha256").update(value, "utf8").digest("hex");

function includesInOrder(source, fragments) {
  let cursor = -1;
  for (const fragment of fragments) {
    const next = source.indexOf(fragment, cursor + 1);
    assert.notEqual(next, -1, `missing fragment: ${fragment}`);
    assert.ok(next > cursor, `out-of-order fragment: ${fragment}`);
    cursor = next;
  }
}

test("CURRENT194 is checksum-bound and remains nonauthorizing", () => {
  assert.deepEqual(candidate, {
    contract: "LANGAME_RUNTIME_ATTESTATION_LEDGER_CURRENT194_V1",
    migrationName:
      "20260813030000_langame_runtime_attestation_ledger_current194",
    predecessor: "20260813020000_langame_initial_sync_execution_current192",
    predecessorSqlSha256:
      "cc40b3fadd5f0e8f3e131838a52d68d972f45c0ee4755784be3c86a3127361f3",
    requiredContracts: [
      "LANGAME_INITIAL_SYNC_RUNTIME_BOUNDARY_CURRENT193_V1",
      "LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_V1",
    ],
    migrationSqlSha256: sha256(sql),
    authorization: false,
    canMutateProduction: false,
    canActivateApplicationRoute: false,
    runtimeGrants: false,
    canonical: false,
  });
});

test("CURRENT194 persists exact one-time attestation state and append-only events", () => {
  includesInOrder(sql, [
    'CREATE TABLE public."LangameRuntimeAttestationV1"',
    '"payloadDigest" TEXT NOT NULL UNIQUE',
    '"registerRequestId" TEXT NOT NULL UNIQUE',
    '"consumeRequestId" TEXT UNIQUE',
    '"revokeRequestId" TEXT UNIQUE',
    "CHECK (\"status\" IN ('ACTIVE', 'CONSUMED', 'REVOKED', 'EXPIRED'))",
    'CREATE TABLE public."LangameRuntimeAttestationEventV1"',
    'UNIQUE ("attestationId", "eventType")',
    "CURRENT194 runtime attestation events are append-only",
  ]);
});

test("CURRENT194 registration preserves exact replay and re-attests new live state", () => {
  includesInOrder(sql, [
    "pg_catalog.pg_advisory_xact_lock",
    'FROM public."LangameRuntimeAttestationV1" AS candidate',
    'existing."registerRequestDigest" = register_request_digest',
    'RETURN QUERY SELECT existing."id"',
    "IF issued_at > server_now + INTERVAL '30 seconds'",
    "target_database_name <> pg_catalog.current_database()",
    "FROM pg_catalog.pg_auth_members",
    "FROM pg_catalog.pg_default_acl",
    "'TRUNCATE'",
    "'REFERENCES'",
    "'TRIGGER'",
    "CURRENT194 direct relation privilege widened",
    "executable_count <> 4",
    "routine.proconfig = ARRAY['search_path=pg_catalog, public']::TEXT[]",
  ]);
  assert.match(sql, /current192_migration_sha256 <>\s*'cc40b3fa/u);
});

test("CURRENT194 consume is exact-role, database-bound and lost-response safe", () => {
  includesInOrder(sql, [
    "CREATE FUNCTION public.langame_runtime_attestation_consume_current194_v1",
    "FOR UPDATE",
    'SESSION_USER <> attestation."executorRoleName"',
    'attestation."databaseName" <> pg_catalog.current_database()',
    'attestation."consumeRequestId" = consume_request_id',
    "CURRENT194 runtime attestation already consumed",
    "CURRENT194 runtime expiry replay mismatch",
    "server_now := pg_catalog.clock_timestamp()",
    "SET \"status\" = 'CONSUMED'",
    "'CONSUMED'",
  ]);
});

test("CURRENT194 disposable runtime consumes without TEMP and covers expiry replay", () => {
  const runtimeStart = smoke.indexOf(
    "SET SESSION AUTHORIZATION leetplus_langame_initial_sync_current192;",
  );
  const runtimeEnd = smoke.indexOf(
    "RESET SESSION AUTHORIZATION;",
    runtimeStart,
  );
  assert.ok(runtimeStart >= 0 && runtimeEnd > runtimeStart);
  const runtimeSection = smoke.slice(runtimeStart, runtimeEnd);
  assert.doesNotMatch(runtimeSection, /CREATE\s+TEMP/iu);
  assert.match(
    runtimeSection,
    /direct runtime table read unexpectedly passed/u,
  );
  assert.match(runtimeSection, /expiry\/replay assertion failed/u);
  assert.match(runtimeSection, /changed expiry replay unexpectedly passed/u);
  assert.match(smoke, /CURRENT194 disposable role residue remains/u);
});

test("CURRENT194 revoke is terminal with exact replay and fresh post-lock time", () => {
  includesInOrder(sql, [
    "CREATE FUNCTION public.langame_runtime_attestation_revoke_current194_v1",
    "FOR UPDATE",
    "server_now := pg_catalog.clock_timestamp()",
    'attestation."revokeRequestId" = revoke_request_id',
    "CURRENT194 runtime revocation replay mismatch",
    "SET \"status\" = 'REVOKED'",
    "'REVOKED'",
  ]);
});

test("CURRENT194 is owner-only and has no deployment or route authority", () => {
  assert.match(sql, /COALESCE\(writer, ''\) NOT IN \('consume', 'revoke'\)/u);
  assert.equal((sql.match(/REVOKE ALL ON FUNCTION/gu) ?? []).length, 5);
  assert.doesNotMatch(
    sql,
    /GRANT\s|CREATE ROLE|ALTER ROLE|CREATE DATABASE|DROP DATABASE|Product|InventorySnapshot|IntegrationSyncJob/iu,
  );
  assert.equal((sql.match(/\bCOMMIT;/gu) ?? []).length, 1);
});

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
  "20260813040000_langame_runtime_revoke_intent_current195",
);
const sql = readFileSync(join(root, "migration.sql"), "utf8");
const candidate = JSON.parse(
  readFileSync(join(root, "candidate.json"), "utf8"),
);
const smoke = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    "langame-runtime-revoke-intent-ledger-current195-smoke.sql",
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

test("CURRENT195 ledger is checksum-bound and nonauthorizing", () => {
  assert.deepEqual(candidate, {
    contract: "LANGAME_RUNTIME_REVOKE_INTENT_LEDGER_CURRENT195_V1",
    migrationName: "20260813040000_langame_runtime_revoke_intent_current195",
    predecessor: "20260813030000_langame_runtime_attestation_ledger_current194",
    predecessorSqlSha256:
      "67a031771d7af5e7f5ca02a62a18d0b26295bf7a3a8096f0c3b947c8ed1b9e87",
    requiredContracts: [
      "LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_V1",
      "LANGAME_RUNTIME_ATTESTATION_LEDGER_CURRENT194_V1",
    ],
    migrationSqlSha256: sha256(sql),
    authorization: false,
    canMutateProduction: false,
    canActivateApplicationRoute: false,
    runtimeGrants: false,
    canonical: false,
  });
});

test("CURRENT195 persists one exact signed intent with append-only audit", () => {
  includesInOrder(sql, [
    'CREATE TABLE public."LangameRuntimeRevokeIntentV1"',
    '"intentPayloadDigest" TEXT NOT NULL UNIQUE',
    '"attestationId" TEXT NOT NULL UNIQUE',
    '"revokeRequestId" TEXT NOT NULL UNIQUE',
    '"signature" TEXT NOT NULL',
    "CHECK (\"status\" IN ('PENDING', 'APPLIED', 'EXPIRED'))",
    'CREATE TABLE public."LangameRuntimeRevokeIntentEventV1"',
    'UNIQUE ("intentId", "eventType")',
    "CURRENT195 revoke intent events are append-only",
  ]);
});

test("CURRENT195 registration re-attests CURRENT194 and exact replay", () => {
  includesInOrder(sql, [
    "CREATE FUNCTION public.langame_runtime_revoke_intent_register_current195_v1",
    "pg_catalog.pg_advisory_xact_lock",
    'FROM public."LangameRuntimeRevokeIntentV1" AS candidate',
    "FOR UPDATE",
    'FROM public."LangameRuntimeAttestationV1" AS candidate',
    'existing."intentPayloadDigest" = intent_payload_digest',
    "attestation.\"status\" <> 'CONSUMED'",
    "server_now := pg_catalog.clock_timestamp()",
    "valid_until <= server_now",
    "'REGISTERED'",
  ]);
  assert.match(sql, /owner_role_name <> CURRENT_USER/u);
});

test("CURRENT195 apply is fresh, atomic and exact-response replayable", () => {
  includesInOrder(sql, [
    "CREATE FUNCTION public.langame_runtime_revoke_intent_apply_current195_v1",
    "pg_catalog.pg_advisory_xact_lock",
    'FROM public."LangameRuntimeRevokeIntentV1" AS candidate',
    "FOR UPDATE",
    "intent.\"status\" = 'APPLIED'",
    "intent.\"status\" = 'EXPIRED'",
    "server_now := pg_catalog.clock_timestamp()",
    'intent."validUntil" <= server_now',
    "'EXPIRED'",
    "public.langame_runtime_attestation_revoke_current194_v1",
    "'APPLIED'",
  ]);
  assert.match(sql, /SELECT \* INTO STRICT revoked/u);
});

test("CURRENT195 guards immutable provenance and terminal transitions", () => {
  assert.match(sql, /COALESCE\(writer, ''\) NOT IN \('apply', 'expire'\)/u);
  assert.match(sql, /CURRENT195 revoke intent binding is immutable/u);
  assert.match(sql, /Invalid CURRENT195 apply transition/u);
  assert.match(sql, /Invalid CURRENT195 expiry transition/u);
});

test("CURRENT195 remains owner-only and grants no new authority", () => {
  assert.equal((sql.match(/REVOKE ALL ON FUNCTION/gu) ?? []).length, 4);
  assert.doesNotMatch(
    sql,
    /\bGRANT\s|CREATE ROLE|ALTER ROLE|CREATE DATABASE|DROP DATABASE|Product|InventorySnapshot|IntegrationSyncJob/iu,
  );
  assert.equal((sql.match(/\bCOMMIT;/gu) ?? []).length, 1);
});

test("CURRENT195 PostgreSQL fixture covers replay, expiry and zero role residue", () => {
  assert.match(smoke, /changed register replay unexpectedly passed/u);
  assert.match(smoke, /direct intent mutation unexpectedly passed/u);
  assert.match(smoke, /changed apply replay unexpectedly passed/u);
  assert.match(smoke, /event deletion unexpectedly passed/u);
  assert.match(smoke, /"status" = 'REVOKED'/u);
  assert.match(smoke, /"status" = 'CONSUMED'/u);
  assert.match(smoke, /CURRENT195 disposable role residue remains/u);
  assert.equal((smoke.match(/\bROLLBACK;/gu) ?? []).length, 1);
});

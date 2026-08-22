import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const candidateRoot = new URL(
  "../successor-candidates/20260814010000_langame_runtime_trust_registration_current199/",
  import.meta.url,
);
const predecessorRoot = new URL(
  "../successor-candidates/20260813040000_langame_runtime_revoke_intent_current195/",
  import.meta.url,
);

async function load() {
  const [sql, candidateRaw, predecessorSql] = await Promise.all([
    readFile(new URL("migration.sql", candidateRoot), "utf8"),
    readFile(new URL("candidate.json", candidateRoot), "utf8"),
    readFile(new URL("migration.sql", predecessorRoot), "utf8"),
  ]);
  return { candidate: JSON.parse(candidateRaw), predecessorSql, sql };
}

const sha256 = (value) =>
  createHash("sha256").update(value, "utf8").digest("hex");

test("CURRENT199 ledger candidate is exact, noncanonical and nonauthorizing", async () => {
  const { candidate, predecessorSql, sql } = await load();
  assert.equal(
    candidate.contract,
    "LANGAME_RUNTIME_TRUST_REGISTRATION_LEDGER_CURRENT199_V1",
  );
  assert.equal(candidate.migrationSqlSha256, sha256(sql));
  assert.equal(candidate.predecessorSqlSha256, sha256(predecessorSql));
  assert.deepEqual(candidate.requiredContracts, [
    "LANGAME_RUNTIME_TRUST_REGISTRATION_CURRENT199_V1",
    "LANGAME_RUNTIME_TRUST_BOOTSTRAP_REGISTRY_CURRENT198_V1",
  ]);
  for (const key of [
    "authorization",
    "canMutateProduction",
    "canActivateApplicationRoute",
    "runtimeGrants",
    "canonical",
  ]) {
    assert.equal(candidate[key], false, key);
  }
  assert.equal(fileURLToPath(candidateRoot).includes("migrations"), false);
});

test("CURRENT199 ledger is owner-only, one-time and append-preserving", async () => {
  const { sql } = await load();
  assert.match(sql, /^BEGIN;[\s\S]*COMMIT;\s*$/u);
  assert.match(sql, /"registrationDigest" TEXT NOT NULL UNIQUE/u);
  assert.match(sql, /"enrollmentPayloadDigest" TEXT NOT NULL UNIQUE/u);
  assert.match(
    sql,
    /"protectedAcquisitionReceiptDigest" TEXT NOT NULL UNIQUE/u,
  );
  assert.match(sql, /UNIQUE \("databaseOid", "enrollmentGeneration"\)/u);
  assert.match(sql, /CHECK \("eventType" IN \('REGISTERED', 'EXPIRED'\)\)/u);
  assert.match(sql, /trust registrations are append-preserving/u);
  assert.match(
    sql,
    /BEFORE UPDATE OR DELETE ON public\."LangameRuntimeTrustRegistrationV1"/u,
  );
  assert.match(sql, /events are append-only/u);
  assert.match(sql, /pg_catalog\.pg_advisory_xact_lock/u);
  assert.match(sql, /trust registration replay mismatch/u);
  assert.match(sql, /synthetic_only IS DISTINCT FROM FALSE/u);
  assert.match(sql, /owner_role_name <> CURRENT_USER/u);
  assert.match(sql, /owner_role_name <> SESSION_USER/u);
  assert.match(sql, /target_database_oid <> live_database_oid/u);
  assert.match(sql, /live_database_owner_oid <> live_owner_oid/u);
  assert.match(sql, /runtime_role_oid <> live_runtime_oid/u);
  assert.match(sql, /live_runtime_can_login IS DISTINCT FROM TRUE/u);
  assert.match(sql, /live_runtime_inherit IS DISTINCT FROM FALSE/u);
  assert.match(sql, /live_runtime_create_role IS DISTINCT FROM FALSE/u);
  assert.match(sql, /live_runtime_membership_count <> 0/u);
  assert.match(
    sql,
    /target_database_oid::TEXT \|\| ':' \|\| enrollment_generation::TEXT/u,
  );
  assert.match(
    sql,
    /SECURITY DEFINER[\s\S]*SET search_path = pg_catalog, public/u,
  );
  assert.match(
    sql,
    /REVOKE ALL ON TABLE public\."LangameRuntimeTrustRegistrationV1" FROM PUBLIC/u,
  );
  assert.doesNotMatch(sql, /\bGRANT\b/u);
});

test("CURRENT199 ledger has registration and expiry but no enrollment effect", async () => {
  const { sql } = await load();
  assert.match(
    sql,
    /CREATE FUNCTION public\.langame_runtime_trust_registration_register_current199_v1/u,
  );
  assert.match(
    sql,
    /CREATE FUNCTION public\.langame_runtime_trust_registration_expire_current199_v1/u,
  );
  assert.match(sql, /valid_until <= server_now/u);
  assert.match(sql, /cannot expire early/u);
  assert.doesNotMatch(sql, /\b(?:APPLIED|ACTIVE|ROTATED|REVOKED)\b/u);
  assert.doesNotMatch(
    sql,
    /langame_runtime_attestation_(?:register|consume|revoke)_current194_v1/u,
  );
  assert.doesNotMatch(sql, /CREATE ROLE|ALTER ROLE|DROP ROLE/u);
});

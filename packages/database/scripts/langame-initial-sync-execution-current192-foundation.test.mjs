import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(
  here,
  "..",
  "successor-candidates",
  "20260813020000_langame_initial_sync_execution_current192",
);
const sql = readFileSync(join(root, "migration.sql"), "utf8");
const candidate = JSON.parse(
  readFileSync(join(root, "candidate.json"), "utf8"),
);
const current191Sql = readFileSync(
  join(
    here,
    "..",
    "successor-candidates",
    "20260813010000_langame_initial_sync_approval_current191",
    "migration.sql",
  ),
  "utf8",
);

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function includesAll(value, fragments) {
  for (const fragment of fragments) {
    assert.equal(value.includes(fragment), true, fragment);
  }
}

test("CURRENT192 is checksum-bound to CURRENT191 and remains nonauthorizing", () => {
  assert.deepEqual(candidate, {
    contract: "LANGAME_INITIAL_SYNC_EXECUTION_CURRENT192_V1",
    migrationName: "20260813020000_langame_initial_sync_execution_current192",
    predecessor: "20260813010000_langame_initial_sync_approval_current191",
    predecessorSqlSha256: sha256(current191Sql),
    requiredContracts: [
      "LANGAME_ONBOARDING_STAGED_RECEIPT_CURRENT188_V1",
      "LANGAME_INITIAL_SYNC_PLAN_CURRENT191_V1",
      "LANGAME_INITIAL_SYNC_APPROVAL_CURRENT191_V1",
    ],
    migrationSqlSha256: sha256(sql),
    authorization: false,
    canMutateProduction: false,
    canActivateApplicationRoute: false,
    canCallProvider: false,
    runtimeGrants: false,
    canonical: false,
  });
  assert.equal(sql.trimStart().startsWith("-- CURRENT192"), true);
});

test("CURRENT192 models one immutable claim and an atomic terminal receipt", () => {
  includesAll(sql, [
    'CREATE TABLE public."LangameInitialSyncExecutionV1"',
    'CREATE TABLE public."LangameInitialSyncExecutionEventV1"',
    "\"status\" VARCHAR(24) NOT NULL DEFAULT 'CLAIMED'",
    "\"status\" = 'COMPLETED'",
    "\"status\" = 'EXPIRED'",
    '"leaseExpiresAt" <= "claimedAt" + INTERVAL \'15 minutes\'',
    'CREATE UNIQUE INDEX "langame_initial_sync_execution_approval_uidx"',
    'CREATE UNIQUE INDEX "langame_initial_sync_execution_claim_request_uidx"',
    'CREATE UNIQUE INDEX "langame_initial_sync_execution_claim_token_uidx"',
    'CREATE UNIQUE INDEX "langame_initial_sync_execution_execute_request_uidx"',
    "CURRENT192 initial sync execution binding is immutable",
    "CURRENT192 initial sync execution events are append-only",
  ]);
});

test("CURRENT192 claim is tenant-first, fresh, one-time and token-bound", () => {
  includesAll(sql, [
    "langame_initial_sync_claim_current192_v1",
    'FROM public."Tenant" AS tenant',
    "FOR UPDATE;",
    'FROM public."TenantAdmissionDecision" AS decision',
    'decision."validUntil" > server_now',
    "actor.\"accessScope\"::TEXT = 'NETWORK'",
    'approval."validUntil" <= server_now',
    "candidate.\"status\" = 'CONFIRMED'",
    "CURRENT192 initial sync binding changed before claim",
    "pg_catalog.sha256(pg_catalog.convert_to(raw_claim_token, 'UTF8'))",
    "CURRENT192 initial sync claim replay mismatch",
    'INSERT INTO public."LangameInitialSyncExecutionV1"',
    "'CLAIMED', claim_request_digest",
  ]);
});

test("CURRENT192 independently validates canonical bytes and imports only selected-Store state", () => {
  includesAll(sql, [
    "langame_initial_sync_execute_current192_v1",
    "pg_catalog.octet_length(plan_canonical_json) > 16777216",
    "calculated_plan_digest := pg_catalog.encode",
    'execution."planDigest" <> calculated_plan_digest',
    "LANGAME_INITIAL_SYNC_PLAN_CURRENT191_V1",
    "plan_data->1 <> pg_catalog.jsonb_build_object",
    "plan_data->2 <> pg_catalog.jsonb_build_object",
    "Invalid CURRENT192 canonical product plan",
    "Invalid CURRENT192 canonical inventory plan",
    "CURRENT192 initial sync binding changed before import",
    "CURRENT192 initial sync article collision",
    "CURRENT192 initial sync inventory collision",
    'INSERT INTO public."Product"',
    '"name" = EXCLUDED."name"',
    '"isActive" = EXCLUDED."isActive"',
    '"externalMissingSince" = NULL',
    'INSERT INTO public."InventorySnapshot"',
    'preflight."storeId", resolved.product_id, snapshot_at',
    "SET \"status\" = 'COMPLETED'",
    "CURRENT192 initial sync atomic import count mismatch",
    "'COMPLETED', result_digest",
  ]);
  for (const preserved of [
    '"article" = EXCLUDED."article"',
    '"purchasePrice" = EXCLUDED."purchasePrice"',
    '"salePrice" = EXCLUDED."salePrice"',
    '"categoryId" =',
    '"supplierId" =',
    '"canonicalProductId" =',
    '"assortmentRole" = EXCLUDED."assortmentRole"',
    '"isMandatory" = EXCLUDED."isMandatory"',
  ]) {
    assert.equal(sql.includes(preserved), false, preserved);
  }
  assert.equal(sql.includes('externalProductId" = { notIn'), false);
  assert.equal(sql.includes('"isActive" = FALSE'), false);
});

test("CURRENT192 exact replay and reconciliation cannot invent partial writes", () => {
  includesAll(sql, [
    "IF execution.\"status\" = 'COMPLETED' THEN",
    "CURRENT192 initial sync execution replay mismatch",
    "langame_initial_sync_reconcile_current192_v1",
    "execution.\"status\" = 'CLAIMED'",
    'execution."leaseExpiresAt" <= server_now',
    "'leetplus.langame_initial_sync_current192_writer', 'reconcile'",
    'SET "status" = \'EXPIRED\', "expiredAt" = server_now',
    "(execution.\"status\" = 'COMPLETED')",
  ]);
  const productWrite = sql.indexOf('INSERT INTO public."Product"');
  const inventoryWrite = sql.indexOf('INSERT INTO public."InventorySnapshot"');
  const completion = sql.indexOf("SET \"status\" = 'COMPLETED'");
  assert.ok(
    productWrite > 0 &&
      inventoryWrite > productWrite &&
      completion > inventoryWrite,
  );
  assert.equal(sql.slice(productWrite, completion).includes("COMMIT;"), false);
});

test("CURRENT192 has owner-only ACL and no provider, route or scheduler authority", () => {
  includesAll(sql, [
    'REVOKE ALL ON TABLE public."LangameInitialSyncExecutionV1" FROM PUBLIC;',
    'REVOKE ALL ON TABLE public."LangameInitialSyncExecutionEventV1" FROM PUBLIC;',
    "CURRENT192 initial sync objects require owner-only ACL",
    "grantee <> CURRENT_USER",
  ]);
  assert.equal(/^\s*GRANT\b/imu.test(sql), false);
  for (const forbidden of [
    "fetch(",
    "http_",
    "providerAttempt",
    'INSERT INTO public."IntegrationSyncJob"',
    'UPDATE public."Store"',
    'UPDATE public."IntegrationSource"',
    'UPDATE public."IntegrationCredential"',
  ]) {
    assert.equal(sql.includes(forbidden), false, forbidden);
  }
});

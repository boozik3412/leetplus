import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const candidateName = "20260813010000_langame_initial_sync_approval_current191";
const candidateDirectory = join(root, "successor-candidates", candidateName);
const [sql, metadataText, canonicalSchema] = await Promise.all([
  readFile(join(candidateDirectory, "migration.sql"), "utf8"),
  readFile(join(candidateDirectory, "candidate.json"), "utf8"),
  readFile(join(root, "prisma", "schema.prisma"), "utf8"),
]);
const metadata = JSON.parse(metadataText);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function includesAll(value, fragments) {
  for (const fragment of fragments) {
    assert.ok(value.includes(fragment), `missing fragment: ${fragment}`);
  }
}

function section(from, to) {
  const start = sql.indexOf(from);
  const end = sql.indexOf(to, start + from.length);
  assert.notEqual(start, -1, `missing section start: ${from}`);
  assert.notEqual(end, -1, `missing section end: ${to}`);
  return sql.slice(start, end);
}

test("CURRENT191 remains checksum-bound, noncanonical, dormant, and effect-denied", () => {
  assert.deepEqual(metadata, {
    schemaVersion: 1,
    contract: "LANGAME_INITIAL_SYNC_APPROVAL_CURRENT191_V1",
    candidate: candidateName,
    ordinal: 191,
    predecessor: {
      requiredContract: "GUEST_PORTAL_SESSION_CURRENT190_V1",
      resolved: false,
    },
    dependencies: [
      "LANGAME_ONBOARDING_STAGED_RECEIPT_CURRENT188_V1",
      "LANGAME_INITIAL_SYNC_PREFLIGHT_CURRENT188_V1",
      "LANGAME_INITIAL_SYNC_PLAN_CURRENT191_V1",
    ],
    migrationSqlSha256: sha256(sql),
    authorization: false,
    canMutateProduction: false,
    canActivateApplicationRoute: false,
    canStartSync: false,
    canWriteBusinessTables: false,
    canWriteProvider: false,
    applicationRoleAllowlistBound: false,
    productionApplyAuthorized: false,
    status: "NOT_DEPLOYABLE",
  });
  assert.equal(sql.trimStart().startsWith("-- CURRENT191"), true);
  assert.equal(sql.trimEnd().endsWith("COMMIT;"), true);
  assert.equal(
    canonicalSchema.includes("LangameInitialSyncPreflightV1"),
    false,
  );
  assert.equal(canonicalSchema.includes("LangameInitialSyncApprovalV1"), false);
});

test("CURRENT191 creates only a PII-free preflight, approval, and audit ledger", () => {
  includesAll(sql, [
    'CREATE TABLE public."LangameInitialSyncPreflightV1"',
    'CREATE TABLE public."LangameInitialSyncApprovalV1"',
    'CREATE TABLE public."LangameInitialSyncAuditEventV1"',
    "\"status\" VARCHAR(24) NOT NULL DEFAULT 'PENDING_CONFIRMATION'",
    '"expiresAt" <= "createdAt" + INTERVAL \'15 minutes\'',
    'CREATE UNIQUE INDEX "langame_initial_sync_preflight_actor_request_uidx"',
    'CREATE UNIQUE INDEX "langame_initial_sync_approval_preflight_uidx"',
    'CREATE UNIQUE INDEX "langame_initial_sync_audit_event_uidx"',
    'FOREIGN KEY ("receiptId", "tenantId", "actorUserId")',
    'FOREIGN KEY ("tenantId", "storeId")',
  ]);
  for (const forbidden of [
    '"email"',
    '"apiKey"',
    '"providerPayload"',
    '"productName"',
    '"inventoryPayload"',
  ]) {
    assert.equal(sql.includes(forbidden), false, forbidden);
  }
});

test("CURRENT191 preflight is exact, idempotent, short-lived, and freshly authorized", () => {
  const record = section(
    "CREATE FUNCTION public.langame_initial_sync_record_preflight_current191_v1",
    "CREATE FUNCTION public.langame_initial_sync_confirm_current191_v1",
  );
  includesAll(record, [
    "target_preflight_id !~ '^[A-Za-z0-9_-]{16,128}$'",
    "tenant.\"onboardingStatus\"::TEXT IN ('ONBOARDING', 'READY', 'ACTIVE')",
    "decision.\"decision\" = 'GO'",
    'decision."consumedAt" IS NOT NULL',
    'decision."revokedAt" IS NULL',
    'decision."validUntil" > server_now',
    "FOR SHARE;",
    "actor.\"accessScope\"::TEXT = 'NETWORK'",
    "receipt.\"status\" = 'CONSUMED'",
    'claim."activatedAt" = receipt."consumedAt"',
    'audit."eventAt" = receipt."consumedAt"',
    'ON CONFLICT ("tenantId", "actorUserId", "syncRequestId") DO NOTHING',
    "CURRENT191 initial sync preflight replay mismatch",
    "server_now + INTERVAL '15 minutes'",
  ]);
});

test("CURRENT191 confirmation re-locks authority and binding before one-time approval", () => {
  const confirm = section(
    "CREATE FUNCTION public.langame_initial_sync_confirm_current191_v1",
    "CREATE FUNCTION public.langame_initial_sync_expire_current191_v1",
  );
  includesAll(confirm, [
    "tenant.\"onboardingStatus\"::TEXT IN ('ONBOARDING', 'READY', 'ACTIVE')",
    "decision.\"decision\" = 'GO'",
    'decision."revokedAt" IS NULL',
    'decision."validUntil" > server_now',
    "actor.\"accessScope\"::TEXT = 'NETWORK'",
    "preflight.\"status\" <> 'PENDING_CONFIRMATION'",
    'preflight."expiresAt" <= server_now',
    'receipt."claimId" = preflight."claimId"',
    'store."integrationSourceId" = preflight."sourceId"',
    'source."credentialId" = preflight."credentialId"',
    'credential."apiKeyEncrypted" IS NOT NULL',
    'credential."apiKeyEnvVar" IS NULL',
    'audit."eventAt" = receipt."consumedAt"',
    "CURRENT191 initial sync binding changed before confirmation",
    'INSERT INTO public."LangameInitialSyncApprovalV1"',
    "SET \"status\" = 'CONFIRMED'",
    "'REPLAYED'::TEXT",
  ]);
});

test("CURRENT191 permits only exact terminal transitions and bounded expiry", () => {
  const guard = section(
    "CREATE FUNCTION public.langame_initial_sync_preflight_guard_current191_v1",
    "CREATE FUNCTION public.langame_initial_sync_append_only_current191_v1",
  );
  includesAll(guard, [
    "OLD.\"status\" <> 'PENDING_CONFIRMATION'",
    "NEW.\"status\" <> 'CONFIRMED'",
    "Invalid CURRENT191 initial sync confirmation transition",
    "NEW.\"status\" <> 'EXPIRED'",
    "Invalid CURRENT191 initial sync expiry transition",
    "CURRENT191 initial sync preflight binding is immutable",
  ]);

  const expire = section(
    "CREATE FUNCTION public.langame_initial_sync_expire_current191_v1",
    "REVOKE ALL ON TABLE",
  );
  includesAll(expire, [
    "expire_limit > 1000",
    'candidate."tenantId" = target_tenant_id',
    "candidate.\"status\" = 'PENDING_CONFIRMATION'",
    'candidate."expiresAt" <= server_now',
    "FOR UPDATE SKIP LOCKED",
    "SET \"status\" = 'EXPIRED'",
    "'EXPIRED'",
  ]);
});

test("CURRENT191 grants no authority and performs no provider or business effect", () => {
  includesAll(sql, [
    'REVOKE ALL ON TABLE public."LangameInitialSyncPreflightV1" FROM PUBLIC;',
    'REVOKE ALL ON TABLE public."LangameInitialSyncApprovalV1" FROM PUBLIC;',
    'REVOKE ALL ON TABLE public."LangameInitialSyncAuditEventV1" FROM PUBLIC;',
    "CURRENT191 initial sync objects require owner-only ACL",
  ]);
  assert.equal(/^\s*GRANT\b/imu.test(sql), false);
  for (const forbidden of [
    'INSERT INTO public."Product"',
    'UPDATE public."Product"',
    'INSERT INTO public."InventorySnapshot"',
    'INSERT INTO public."IntegrationSyncJob"',
    "fetch(",
    "syncTenant",
    "providerWritesStarted",
  ]) {
    assert.equal(sql.includes(forbidden), false, forbidden);
  }
});

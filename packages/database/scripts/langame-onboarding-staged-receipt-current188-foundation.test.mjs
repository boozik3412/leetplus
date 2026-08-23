import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const candidateName =
  "20260805020000_langame_onboarding_staged_receipt_current188";
const candidateDirectory = join(
  root,
  "migration-candidates",
  candidateName,
);
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

test("CURRENT188 remains noncanonical, checksum-bound, and not deployable", () => {
  assert.equal(metadata.schemaVersion, 1);
  assert.equal(
    metadata.contract,
    "LANGAME_ONBOARDING_STAGED_RECEIPT_CURRENT188_V1",
  );
  assert.equal(metadata.candidate, candidateName);
  assert.equal(metadata.ordinal, 188);
  assert.equal(metadata.predecessor.resolved, false);
  assert.equal(metadata.authorization, false);
  assert.equal(metadata.canMutateProduction, false);
  assert.equal(metadata.canActivateApplicationRoute, false);
  assert.equal(metadata.canStartSync, false);
  assert.equal(metadata.canWriteProvider, false);
  assert.equal(metadata.applicationRoleAllowlistBound, false);
  assert.equal(metadata.productionApplyAuthorized, false);
  assert.equal(metadata.status, "NOT_DEPLOYABLE");
  assert.equal(metadata.migrationSqlSha256, sha256(sql));
  assert.equal(sql.trimStart().startsWith("-- CURRENT188"), true);
  assert.equal(sql.trimEnd().endsWith("COMMIT;"), true);
  assert.equal(canonicalSchema.includes("LangameOnboardingStagedReceiptV1"), false);
});

test("CURRENT188 creates only the exact receipt, claim, and PII-free audit surface", () => {
  includesAll(sql, [
    'CREATE TABLE public."LangameOnboardingStagedReceiptV1"',
    'CREATE TABLE public."LangameExternalClubClaimV1"',
    'CREATE TABLE public."LangameOnboardingAuditEventV1"',
    'CREATE UNIQUE INDEX "langame_external_club_claim_global_uidx"',
    '"provider", "externalDomain", "externalClubId"',
    'CREATE UNIQUE INDEX "langame_external_club_claim_store_uidx"',
    'CREATE INDEX "langame_onboarding_receipt_pending_expiry_idx"',
    'WHERE "status" = \'PENDING\'',
    'FOREIGN KEY ("tenantId", "actorUserId")',
    'FOREIGN KEY ("tenantId", "storeId")',
    "DEFERRABLE INITIALLY DEFERRED",
  ]);
  for (const forbidden of [
    '"email"',
    '"clubName"',
    '"clubAddress"',
    '"providerPayload"',
    '"apiKey" TEXT',
  ]) {
    assert.equal(sql.includes(forbidden), false, forbidden);
  }
});

test("CURRENT188 binds stage to GO, NETWORK actor, exact store/domain/club, and 15 minute expiry", () => {
  const stage = sql.slice(
    sql.indexOf("CREATE FUNCTION public.langame_onboarding_stage_receipt_current188_v1"),
    sql.indexOf("CREATE FUNCTION public.langame_onboarding_activate_current188_v1"),
  );
  includesAll(stage, [
    'tenant."status"::TEXT = \'ACTIVE\'',
    'tenant."customerStage"::TEXT IN (\'PILOT\', \'BETA\', \'LIVE\')',
    'decision."decision" = \'GO\'',
    'decision."consumedAt" IS NOT NULL',
    'decision."revokedAt" IS NULL',
    'actor."accessScope"::TEXT = \'NETWORK\'',
    'store."tenantId" = target_tenant_id',
    'receipt."externalDomain" <> target_external_domain',
    'receipt."externalClubId" <> target_external_club_id',
    'ON CONFLICT ("tenantId", "actorUserId", "requestId") DO NOTHING',
    "GET DIAGNOSTICS inserted_count = ROW_COUNT",
    "server_now + INTERVAL '15 minutes'",
    "Langame onboarding stage replay mismatch",
    "Langame external club is already claimed",
  ]);
});

test("CURRENT188 activation is short, exact, one-time, idempotent, and starts no sync", () => {
  const activate = sql.slice(
    sql.indexOf("CREATE FUNCTION public.langame_onboarding_activate_current188_v1"),
    sql.indexOf("CREATE FUNCTION public.langame_onboarding_expire_current188_v1"),
  );
  includesAll(activate, [
    "FOR UPDATE;",
    'receipt."configDigest" <> expected_config_digest',
    'receipt."bindingDigest" <> expected_binding_digest',
    'receipt."storeId" <> target_store_id',
    'receipt."externalDomain" <> target_external_domain',
    'receipt."externalClubId" <> target_external_club_id',
    'receipt."activationRequestId" <> activation_request_id',
    'receipt."activationRequestDigest" <> activation_request_digest',
    'receipt."expiresAt" <= server_now',
    'INSERT INTO public."IntegrationCredential"',
    'INSERT INTO public."IntegrationSource"',
    'INSERT INTO public."LangameExternalClubClaimV1"',
    'UPDATE public."Store"',
    '"stagedApiKeyEncrypted" = NULL',
    '"ciphertextClearedAt" = server_now',
    "'REPLAYED'::TEXT",
  ]);
  for (const forbidden of [
    '"IntegrationSyncJob"',
    "syncTenant",
    "backgroundExecutionEnabled\" = TRUE",
    "http://",
  ]) {
    assert.equal(activate.includes(forbidden), false, forbidden);
  }
});

test("CURRENT188 expiry is bounded, lock-safe, and irreversibly clears staged ciphertext", () => {
  const expire = sql.slice(
    sql.indexOf("CREATE FUNCTION public.langame_onboarding_expire_current188_v1"),
    sql.indexOf("REVOKE ALL ON TABLE"),
  );
  includesAll(expire, [
    'expire_limit > 1000',
    'candidate."tenantId" = target_tenant_id',
    'candidate."status" = \'PENDING\'',
    'candidate."expiresAt" <= server_now',
    "FOR UPDATE SKIP LOCKED",
    'SET "status" = \'EXPIRED\'',
    '"stagedApiKeyEncrypted" = NULL',
    '"ciphertextClearedAt" = server_now',
    "'EXPIRED'",
  ]);
  assert.equal(expire.includes('"IntegrationCredential"'), false);
  assert.equal(expire.includes('"IntegrationSource"'), false);
  assert.equal(expire.includes('UPDATE public."Store"'), false);
});

test("CURRENT188 exposes no candidate authority to PUBLIC or application roles", () => {
  includesAll(sql, [
    'REVOKE ALL ON TABLE public."LangameOnboardingStagedReceiptV1" FROM PUBLIC;',
    'REVOKE ALL ON TABLE public."LangameExternalClubClaimV1" FROM PUBLIC;',
    'REVOKE ALL ON TABLE public."LangameOnboardingAuditEventV1" FROM PUBLIC;',
    "langame_onboarding_stage_receipt_current188_v1(",
    "langame_onboarding_activate_current188_v1(",
    "langame_onboarding_expire_current188_v1(",
    "CURRENT188 Langame onboarding objects require owner-only ACL",
  ]);
  assert.equal(/^\s*GRANT\b/imu.test(sql), false);
});

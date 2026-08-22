import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const databaseRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(databaseRoot, "..", "..");
const candidateName = "20260805040000_guest_portal_session_current190";
const candidateDirectory = join(
  databaseRoot,
  "migration-candidates",
  candidateName,
);

const [
  sql,
  metadataText,
  canonicalSchema,
  smoke,
  moduleSource,
  controllerSource,
  mediaControllerSource,
  manifestSource,
  coordinatorSource,
] = await Promise.all([
  readFile(join(candidateDirectory, "migration.sql"), "utf8"),
  readFile(join(candidateDirectory, "candidate.json"), "utf8"),
  readFile(join(databaseRoot, "prisma", "schema.prisma"), "utf8"),
  readFile(
    join(databaseRoot, "scripts", "guest-portal-session-current190-smoke.sql"),
    "utf8",
  ),
  readFile(
    join(
      repositoryRoot,
      "apps",
      "api",
      "src",
      "guest-portal",
      "guest-portal.module.ts",
    ),
    "utf8",
  ),
  readFile(
    join(
      repositoryRoot,
      "apps",
      "api",
      "src",
      "guest-portal",
      "guest-portal.controller.ts",
    ),
    "utf8",
  ),
  readFile(
    join(
      repositoryRoot,
      "apps",
      "api",
      "src",
      "guest-gamification",
      "guest-game-media.controller.ts",
    ),
    "utf8",
  ),
  readFile(
    join(
      repositoryRoot,
      "apps",
      "api",
      "src",
      "tenancy",
      "pilot-http-surface-manifest.ts",
    ),
    "utf8",
  ),
  readFile(
    join(
      repositoryRoot,
      "apps",
      "api",
      "src",
      "guest-portal",
      "guest-portal-session-current190.coordinator.ts",
    ),
    "utf8",
  ),
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

function assertOrdered(value, fragments) {
  let previousIndex = -1;
  for (const fragment of fragments) {
    const index = value.indexOf(fragment);
    assert.ok(index >= 0, `missing ordered fragment: ${fragment}`);
    assert.ok(index > previousIndex, `out-of-order fragment: ${fragment}`);
    previousIndex = index;
  }
}

test("CURRENT190 remains checksum-bound, noncanonical, and not deployable", () => {
  assert.equal(metadata.schemaVersion, 1);
  assert.equal(metadata.contract, "GUEST_PORTAL_SESSION_CURRENT190_V1");
  assert.equal(metadata.candidate, candidateName);
  assert.equal(metadata.ordinal, 190);
  assert.equal(
    metadata.predecessor.requiredContract,
    "IDENTITY_EMPLOYEE_INVITE_CURRENT189_V1",
  );
  assert.equal(metadata.predecessor.resolved, false);
  for (const key of [
    "authorization",
    "canMutateProduction",
    "canActivateApplicationRoute",
    "canServePublicMedia",
    "canSendOtp",
    "canCallTelegram",
    "canCallMessenger",
    "canCallLangame",
    "canRunSchedulers",
    "applicationRoleAllowlistBound",
    "productionApplyAuthorized",
  ]) {
    assert.equal(metadata[key], false, key);
  }
  assert.equal(metadata.status, "NOT_DEPLOYABLE");
  assert.equal(metadata.migrationSqlSha256, sha256(sql));
  assert.equal(sql.trimStart().startsWith("-- CURRENT190"), true);
  assert.equal(sql.trimEnd().endsWith("COMMIT;"), true);
  assert.equal(canonicalSchema.includes("GuestPortalSessionV1"), false);
});

test("CURRENT190 persists only opaque session bindings, fences, receipts, and append-only audit", () => {
  includesAll(sql, [
    'CREATE TABLE public."GuestPortalSessionV1"',
    'CREATE TABLE public."GuestPortalSessionAuditV1"',
    'CREATE TABLE public."GuestPortalTenantSessionFenceV1"',
    'CREATE TABLE public."GuestPortalTenantSessionRevokeBatchV1"',
    '"tokenVersion" INTEGER NOT NULL',
    '"jtiDigest" CHAR(64) NOT NULL',
    '"phoneBindingDigest" CHAR(64) NOT NULL',
    '"bindingDigest" CHAR(64) NOT NULL',
    'CREATE UNIQUE INDEX "guest_portal_session_jti_digest_uidx"',
    'CONSTRAINT "GuestPortalSessionV1_tenant_id_key" UNIQUE ("tenantId", "id")',
    'FOREIGN KEY ("tenantId", "storeId")',
    'FOREIGN KEY ("tenantId", "profileId")',
    'FOREIGN KEY ("tenantId", "guestId")',
    'FOREIGN KEY ("tenantId", "sessionId")',
    'REFERENCES public."GuestPortalSessionV1"("tenantId", "id")',
    'FOREIGN KEY ("tenantId", "fenceRequestDigest")',
    'REFERENCES public."GuestPortalTenantSessionFenceV1"(',
    '"expiresAt" <= "issuedAt" + INTERVAL \'60 minutes\'',
    "Guest portal sessions are immutable outside sealed RPCs",
    "Guest portal session audit is append-only",
    "Guest portal tenant session fences cannot be deleted",
    "Guest portal tenant revoke batches are append-only",
  ]);
  for (const forbidden of [
    '"rawJti"',
    '"token" TEXT',
    '"phoneHash" TEXT',
    '"phone" TEXT',
    '"email"',
    '"telegramChatId"',
  ]) {
    assert.equal(sql.includes(forbidden), false, forbidden);
  }

  const auditDefinition = sql.slice(
    sql.indexOf('CREATE TABLE public."GuestPortalSessionAuditV1"'),
    sql.indexOf('CREATE UNIQUE INDEX "guest_portal_session_jti_digest_uidx"'),
  );
  for (const forbidden of ["phone", "email", "contact", "rawJti", '"token"']) {
    assert.equal(
      auditDefinition.toLowerCase().includes(forbidden.toLowerCase()),
      false,
      `audit:${forbidden}`,
    );
  }
});

test("CURRENT190 rechecks lifecycle, trial, complete profile, entitlement, Store, profile, guest, and phone", () => {
  const admission = sql.slice(
    sql.indexOf(
      "CREATE FUNCTION public.guest_portal_store_admit_current190_v1",
    ),
    sql.indexOf(
      "CREATE FUNCTION public.guest_portal_session_issue_current190_v1",
    ),
  );
  includesAll(admission, [
    "tenant_row.status <> 'ACTIVE'",
    "tenant_row.customer_stage NOT IN ('PILOT', 'BETA', 'LIVE')",
    "tenant_row.onboarding_status NOT IN ('ONBOARDING', 'READY', 'ACTIVE')",
    "tenant_row.customer_stage IN ('PILOT', 'BETA')",
    "entitlement_count <> 6",
    "entitlement_module_count <> 6",
    'ORDER BY entitlement."module"::TEXT, entitlement."id"',
    'FROM public."GuestPortalTenantSessionFenceV1" AS fence',
    "Guest portal tenant session fence is closed",
    "entitlement.\"module\"::TEXT = 'GAMIFICATION'",
    "requested_action = 'WRITE'",
    'store."tenantId" = target_tenant_id',
    'store."isActive" = TRUE',
    'store."gamificationEnabled" = TRUE',
    'profile."tenantId" = target_tenant_id',
    "profile_row.status <> 'ACTIVE'",
    "profile_row.phone_hash IS NULL",
    "pg_catalog.sha256(",
    "pg_catalog.convert_to(profile_row.phone_hash, 'UTF8')",
    "guest_portal_profile_phone_binding_current190_v1(",
    "profile_row.guest_id IS DISTINCT FROM target_guest_id",
    'guest."tenantId" = target_tenant_id',
    "require_active_identity AND guest_row.is_disabled",
    "FOR SHARE",
    "locator_match_count <> 1",
    "INTO STRICT target_tenant_id, target_store_id",
  ]);
  assert.equal(admission.includes("'OUTBOUND'"), false);
});

test("CURRENT190 takes fresh admission locks in one deterministic order before session access", () => {
  const storeAdmission = sql.slice(
    sql.indexOf(
      "CREATE FUNCTION public.guest_portal_store_admit_current190_v1",
    ),
    sql.indexOf(
      "CREATE FUNCTION public.guest_portal_profile_phone_binding_current190_v1",
    ),
  );
  const profileAdmission = sql.slice(
    sql.indexOf(
      "CREATE FUNCTION public.guest_portal_profile_phone_binding_current190_v1",
    ),
    sql.indexOf(
      "CREATE FUNCTION public.guest_portal_identity_admit_current190_v1",
    ),
  );
  const assertion = sql.slice(
    sql.indexOf(
      "CREATE FUNCTION public.guest_portal_session_assert_current190_v1",
    ),
    sql.indexOf(
      "CREATE FUNCTION public.guest_portal_session_rotate_current190_v1",
    ),
  );
  const rotation = sql.slice(
    sql.indexOf(
      "CREATE FUNCTION public.guest_portal_session_rotate_current190_v1",
    ),
    sql.indexOf(
      "CREATE FUNCTION public.guest_portal_session_revoke_current190_v1",
    ),
  );
  const revocation = sql.slice(
    sql.indexOf(
      "CREATE FUNCTION public.guest_portal_session_revoke_current190_v1",
    ),
    sql.indexOf(
      "CREATE FUNCTION public.guest_portal_media_assert_current190_v1",
    ),
  );
  const media = sql.slice(
    sql.indexOf(
      "CREATE FUNCTION public.guest_portal_media_assert_current190_v1",
    ),
    sql.indexOf("REVOKE ALL ON TABLE"),
  );
  const terminalIdentityLock = sql.slice(
    sql.indexOf(
      "CREATE FUNCTION public.guest_portal_identity_lock_current190_v1",
    ),
    sql.indexOf(
      "CREATE FUNCTION public.guest_portal_public_store_assert_current190_v1",
    ),
  );

  assert.match(
    storeAdmission,
    /FROM public\."Tenant" AS tenant[\s\S]*?FOR SHARE;[\s\S]*?FROM public\."GuestPortalTenantSessionFenceV1" AS fence[\s\S]*?FOR SHARE;[\s\S]*?ORDER BY entitlement\."module"::TEXT, entitlement\."id"\s+FOR SHARE;[\s\S]*?FROM public\."Store" AS store[\s\S]*?FOR SHARE;/u,
  );
  assert.match(
    storeAdmission,
    /FROM public\."Store" AS store[\s\S]*?FOR SHARE;\s+store_found := FOUND;[\s\S]*?admission_now := pg_catalog\.clock_timestamp\(\);/u,
  );
  assert.match(
    profileAdmission,
    /FROM public\."GuestGameProfile" AS profile[\s\S]*?FOR SHARE;[\s\S]*?FROM public\."Guest" AS guest[\s\S]*?FOR SHARE;/u,
  );
  assert.match(
    terminalIdentityLock,
    /FROM public\."Tenant" AS tenant[\s\S]*?FOR SHARE;[\s\S]*?FROM public\."GuestPortalTenantSessionFenceV1" AS fence[\s\S]*?FOR SHARE;[\s\S]*?ORDER BY entitlement\."module"::TEXT, entitlement\."id"\s+FOR SHARE;[\s\S]*?FROM public\."Store" AS store[\s\S]*?FOR SHARE;[\s\S]*?FROM public\."GuestGameProfile" AS profile[\s\S]*?FOR SHARE;[\s\S]*?FROM public\."Guest" AS guest[\s\S]*?FOR SHARE;/u,
  );
  assertOrdered(assertion, [
    "SELECT * INTO scope_row",
    "FROM public.guest_portal_identity_admit_current190_v1(",
    "SELECT * INTO session_row",
    'FROM public."GuestPortalSessionV1" AS session',
  ]);
  assert.match(
    assertion,
    /FROM public\."GuestPortalSessionV1" AS session[\s\S]*?FOR SHARE;\s+server_now := pg_catalog\.clock_timestamp\(\);/u,
  );
  assertOrdered(rotation, [
    "SELECT * INTO source_scope",
    "SELECT * INTO target_scope",
    "SELECT * INTO source_row",
    'FROM public."GuestPortalSessionV1" AS session',
    "Guest portal rotation identity continuity is not admitted",
    "IF source_row.\"status\" = 'ROTATED' THEN",
  ]);
  assert.match(
    rotation,
    /FROM public\."GuestPortalSessionV1" AS session[\s\S]*?FOR UPDATE;\s+server_now := pg_catalog\.clock_timestamp\(\);/u,
  );
  assertOrdered(revocation, [
    "guest_portal_session_binding_validate_current190_v1(",
    "guest_portal_identity_lock_current190_v1(",
    "SELECT * INTO session_row",
    'FROM public."GuestPortalSessionV1" AS session',
  ]);
  assert.match(
    revocation,
    /FROM public\."GuestPortalSessionV1" AS session[\s\S]*?FOR UPDATE;\s+server_now := pg_catalog\.clock_timestamp\(\);/u,
  );
  assertOrdered(media, [
    "guest_portal_session_binding_validate_current190_v1(",
    "FROM public.guest_portal_session_assert_current190_v1(",
    'FROM public."GuestGameMediaAsset" AS asset',
  ]);
});

test("CURRENT190 rejects nullable or malformed persisted binding inputs before admission", () => {
  const validator = sql.slice(
    sql.indexOf(
      "CREATE FUNCTION public.guest_portal_session_binding_validate_current190_v1",
    ),
    sql.indexOf(
      "CREATE FUNCTION public.guest_portal_store_admit_current190_v1",
    ),
  );
  includesAll(validator, [
    "target_session_id IS NULL",
    "expected_token_version IS NULL",
    "expected_token_version < 1",
    "expected_token_version > 2147483647",
    "expected_jti_digest IS NULL",
    "expected_jti_digest !~ '^[a-f0-9]{64}$'",
    "expected_binding_digest IS NULL",
    "expected_binding_digest !~ '^[a-f0-9]{64}$'",
    "Invalid guest portal persisted session binding input",
    "USING ERRCODE = '22023'",
  ]);
  assert.match(
    validator,
    /\^\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}-\[1-5\]\[0-9a-f\]\{3\}-\[89ab\]\[0-9a-f\]\{3\}-\[0-9a-f\]\{12\}\$/u,
  );

  for (const routineName of [
    "guest_portal_session_issue_current190_v1",
    "guest_portal_session_assert_current190_v1",
    "guest_portal_session_rotate_current190_v1",
    "guest_portal_session_revoke_current190_v1",
    "guest_portal_media_assert_current190_v1",
  ]) {
    const start = sql.indexOf(`CREATE FUNCTION public.${routineName}`);
    const end = sql.indexOf("CREATE FUNCTION public.", start + 1);
    const body = sql.slice(start, end < 0 ? sql.length : end);
    assert.ok(
      body.includes("guest_portal_session_binding_validate_current190_v1("),
      `${routineName} must call the central binding validator`,
    );
  }
});

test("CURRENT190 issue/assert/rotate/revoke are bounded, exact, and replay-safe", () => {
  includesAll(sql, [
    "guest_portal_session_issue_current190_v1(",
    "guest_portal_session_assert_current190_v1(",
    "guest_portal_session_rotate_current190_v1(",
    "guest_portal_session_revoke_current190_v1(",
    "ttl_seconds < 60 OR ttl_seconds > 3600",
    "Guest portal session issue replay mismatch",
    "requested_action NOT IN ('READ', 'WRITE')",
    "session_row.\"status\" <> 'ACTIVE'",
    'session_row."expiresAt" <= server_now',
    "LEAST(source_tenant_id, target_tenant_id)",
    "GREATEST(source_tenant_id, target_tenant_id)",
    "pg_catalog.pg_advisory_xact_lock",
    '"tokenVersion", "jtiDigest", "phoneBindingDigest", "bindingDigest"',
    "target_guest_id, next_version, target_jti_digest",
    "\"status\" = 'ROTATED'",
    '"rotatedToSessionId" = proposed_session_id',
    "Guest portal rotation identity continuity is not admitted",
    "Guest portal rotation replay mismatch",
    "Guest portal revocation replay mismatch",
  ]);
});

test("CURRENT190 tenant revoke-all is fenced, bounded, complete, and replay-safe", () => {
  const revokeAll = sql.slice(
    sql.indexOf(
      "CREATE FUNCTION public.guest_portal_sessions_revoke_tenant_current190_v1",
    ),
    sql.indexOf(
      "CREATE FUNCTION public.guest_portal_media_assert_current190_v1",
    ),
  );
  const batchGuard = sql.slice(
    sql.indexOf(
      "CREATE FUNCTION public.guest_portal_tenant_session_batch_guard_current190_v1",
    ),
    sql.indexOf('CREATE TRIGGER "guest_portal_session_row_guard_current190"'),
  );

  includesAll(sql, [
    'CONSTRAINT "GuestPortalTenantSessionFenceV1_tenant_request_key" UNIQUE',
    'CONSTRAINT "GuestPortalTenantSessionRevokeBatchV1_request_key" UNIQUE',
    'CONSTRAINT "GuestPortalTenantSessionRevokeBatchV1_sequence_key" UNIQUE',
    '"batchLimit" BETWEEN 1 AND 500',
    '"revokedCount" BETWEEN 0 AND "batchLimit"',
    'ALTER TABLE public."GuestPortalTenantSessionFenceV1"\n  FORCE ROW LEVEL SECURITY;',
    'ALTER TABLE public."GuestPortalTenantSessionRevokeBatchV1"\n  FORCE ROW LEVEL SECURITY;',
    'CREATE POLICY "guest_portal_tenant_session_fence_policy_current190"',
    'CREATE POLICY "guest_portal_tenant_session_batch_policy_current190"',
    'REVOKE ALL ON TABLE public."GuestPortalTenantSessionFenceV1" FROM PUBLIC;',
    'REVOKE ALL ON TABLE\npublic."GuestPortalTenantSessionRevokeBatchV1" FROM PUBLIC;',
  ]);
  includesAll(revokeAll, [
    "target_tenant_id IS NULL",
    "fence_request_digest !~ '^[a-f0-9]{64}$'",
    "batch_request_digest !~ '^[a-f0-9]{64}$'",
    "batch_limit < 1 OR batch_limit > 500",
    'FROM public."Tenant" AS tenant',
    "FOR UPDATE;",
    "'revoke_all'",
    'INSERT INTO public."GuestPortalTenantSessionFenceV1"',
    'ON CONFLICT ("tenantId") DO NOTHING',
    "Guest portal tenant revoke-all fence request mismatch",
    'FROM public."GuestPortalTenantSessionRevokeBatchV1" AS receipt',
    "Guest portal tenant revoke-all replay mismatch",
    "TRUE;",
    "Guest portal tenant revoke-all fence is already closed",
    "LIMIT batch_limit",
    "ORDER BY session.\"id\"",
    "terminal_now := pg_catalog.clock_timestamp();",
    "WITH updated_session AS (",
    "inserted_audit AS (",
    "revoked_count <> audit_count",
    '"status" = next_fence_status',
    'INSERT INTO public."GuestPortalTenantSessionRevokeBatchV1"',
    "FALSE;",
  ]);
  assertOrdered(revokeAll, [
    'FROM public."Tenant" AS tenant',
    "FOR UPDATE;",
    'INSERT INTO public."GuestPortalTenantSessionFenceV1"',
    'FROM public."GuestPortalTenantSessionFenceV1" AS fence',
    'FROM public."GuestPortalTenantSessionRevokeBatchV1" AS receipt',
    'FROM public."GuestPortalSessionV1" AS session',
    "LIMIT batch_limit\n    FOR UPDATE\n  ) AS locked_session",
    "terminal_now := pg_catalog.clock_timestamp();",
    "WITH updated_session AS (",
    'UPDATE public."GuestPortalTenantSessionFenceV1"',
    'INSERT INTO public."GuestPortalTenantSessionRevokeBatchV1"',
  ]);
  includesAll(batchGuard, [
    "previous_batch_count <> NEW.\"batchSequence\" - 1",
    "previous_total_revoked_count + NEW.\"revokedCount\" <>",
    "current_active_count <> NEW.\"remainingActiveCount\"",
    "complete_audit_count <> NEW.\"totalRevokedCount\"",
    "complete_session_count <> NEW.\"totalRevokedCount\"",
    "Guest portal tenant revoke batch is incomplete",
  ]);
});

test("CURRENT190 media authorization is session-first and tenant exact", () => {
  const media = sql.slice(
    sql.indexOf(
      "CREATE FUNCTION public.guest_portal_media_assert_current190_v1",
    ),
    sql.indexOf("REVOKE ALL ON TABLE"),
  );
  includesAll(media, [
    "guest_portal_session_assert_current190_v1(",
    "'READ'",
    'asset."id" = target_media_asset_id',
    'asset."tenantId" = expected_tenant_id',
    "Guest portal media asset is not admitted",
  ]);
});

test("CURRENT190 grants no table or RPC authority", () => {
  includesAll(sql, [
    'REVOKE ALL ON TABLE public."GuestPortalSessionV1" FROM PUBLIC;',
    'REVOKE ALL ON TABLE public."GuestPortalSessionAuditV1" FROM PUBLIC;',
    'REVOKE ALL ON TABLE public."GuestPortalTenantSessionFenceV1" FROM PUBLIC;',
    'REVOKE ALL ON TABLE\npublic."GuestPortalTenantSessionRevokeBatchV1" FROM PUBLIC;',
    "guest_portal_session_issue_current190_v1(",
    "guest_portal_session_assert_current190_v1(",
    "guest_portal_session_rotate_current190_v1(",
    "guest_portal_session_revoke_current190_v1(",
    "guest_portal_sessions_revoke_tenant_current190_v1(",
    "guest_portal_media_assert_current190_v1(",
    "guest_portal_session_binding_validate_current190_v1(",
    "guest_portal_identity_lock_current190_v1(",
    'ALTER TABLE public."GuestPortalSessionV1"\n  FORCE ROW LEVEL SECURITY;',
    'ALTER TABLE public."GuestPortalSessionAuditV1"\n  FORCE ROW LEVEL SECURITY;',
    'ALTER TABLE public."GuestPortalTenantSessionFenceV1"\n  FORCE ROW LEVEL SECURITY;',
    'ALTER TABLE public."GuestPortalTenantSessionRevokeBatchV1"\n  FORCE ROW LEVEL SECURITY;',
    'CREATE POLICY "guest_portal_session_tenant_policy_current190"',
    'CREATE POLICY "guest_portal_session_audit_tenant_policy_current190"',
    'CREATE POLICY "guest_portal_tenant_session_fence_policy_current190"',
    'CREATE POLICY "guest_portal_tenant_session_batch_policy_current190"',
    "pg_catalog.aclexplode(attribute.attacl)",
    "relation.relforcerowsecurity IS DISTINCT FROM TRUE",
    "GuestPortalSessionV1_tenant_id_key",
    "guest_portal_session_audit_session_fkey",
    "guest_portal_tenant_session_batch_fence_fkey",
    "constraint_entry.conkey = ARRAY[",
    "constraint_entry.confkey = ARRAY[",
    "CURRENT190 guest portal session objects require owner-only sealed ACL",
  ]);
  assert.equal(/^\s*GRANT\b/imu.test(sql), false);
});

test("CURRENT190 smoke covers bidirectional isolation, fresh state, replay, media, and zero residue", () => {
  includesAll(smoke, [
    "CURRENT190 A session accepted tenant B",
    "CURRENT190 B session accepted tenant A",
    "CURRENT190 A session accepted store B1",
    "CURRENT190 A session accepted profile B",
    "CURRENT190 A session accepted guest B",
    "CURRENT190 assert accepted changed live profile phone binding",
    "CURRENT190 media accepted changed live profile phone binding",
    "CURRENT190 rotate accepted changed live source phone binding",
    "CURRENT190 rotated phone1 source into phone2 target identity",
    "CURRENT190 rotate replay accepted changed live target phone binding",
    "CURRENT190 terminal revoke failed while identity was suspended",
    "CURRENT190 terminally revoked session revived after reactivation",
    "CURRENT190 binding validator accepted hostile case",
    "CURRENT190 issue RPC accepted invalid session binding",
    "CURRENT190 assert RPC accepted NULL token version",
    "CURRENT190 rotate RPC accepted NULL source jti digest",
    "CURRENT190 revoke RPC accepted NULL binding digest",
    "CURRENT190 media RPC accepted invalid session binding",
    "CURRENT190 audit FK accepted a cross-tenant session",
    "CURRENT190 exposed a stable/contact-derived audit correlator",
    "CURRENT190 ACL, FORCE RLS, or tenant-aware audit FK invariant failed",
    "CURRENT190 A session accepted media B",
    "CURRENT190 B session accepted media A",
    "CURRENT190 accepted disabled GAMIFICATION WRITE",
    "CURRENT190 accepted inactive Store",
    "CURRENT190 accepted expired trial",
    "CURRENT190 accepted suspended tenant",
    "CURRENT190 accepted inactive profile",
    "CURRENT190 trusted an ambiguous URL store locator",
    "CURRENT190 accepted changed rotation replay",
    "CURRENT190 old token survived rotation",
    "CURRENT190 direct session update unexpectedly passed",
    "CURRENT190 direct audit delete unexpectedly passed",
    "CURRENT190 revoke-all accepted NULL tenant",
    "CURRENT190 revoke-all accepted oversized batch limit",
    "CURRENT190 revoke-all admitted an absent tenant",
    "CURRENT190 first revoke-all batch/replay failed",
    "CURRENT190 accepted changed batch replay",
    "CURRENT190 accepted changed fence request",
    "CURRENT190 revoke-all fence, bounds, or audit completeness failed",
    "CURRENT190 accepted a new batch after CLOSED",
    "CURRENT190 issue survived a CLOSED tenant fence",
    "CURRENT190 rotation entered a CLOSED target tenant",
    "CURRENT190 cross-tenant batch collision was not atomic",
    "CURRENT190 accepted a cross-tenant direct batch",
    "CURRENT190 accepted a direct fence update",
    "CURRENT190 accepted a direct fence delete",
    "CURRENT190 accepted a direct batch delete",
    "ROLLBACK;",
    "CURRENT190 smoke left persisted fixture residue",
  ]);
});

test("CURRENT190 is not registered and all existing public game routes remain PUBLIC_GAP", () => {
  assert.equal(moduleSource.includes("GuestPortalSessionCurrent190"), false);
  assert.equal(
    controllerSource.includes("GuestPortalSessionCurrent190"),
    false,
  );
  assert.equal(
    mediaControllerSource.includes("GuestPortalSessionCurrent190"),
    false,
  );
  includesAll(manifestSource, [
    "prefix: '/public/guest-game/media'",
    "profile: 'PUBLIC_GAP'",
    "prefix: '/guest-portal'",
  ]);
  includesAll(coordinatorSource, [
    "status: 'DORMANT_FOUNDATION'",
    "canonical: false",
    "deployable: false",
    "routeActivationAllowed: false",
    "publicMediaAllowed: false",
    "outboundAllowed: false",
    "otpAllowed: false",
    "telegramAllowed: false",
    "messengerAllowed: false",
    "langameAllowed: false",
    "schedulersAllowed: false",
    "not production-authorized",
  ]);
  for (const forbidden of [
    "phoneHash",
    "phoneBindingDigest",
    "rawPhone",
    "email",
  ]) {
    assert.equal(coordinatorSource.includes(forbidden), false, forbidden);
  }
});

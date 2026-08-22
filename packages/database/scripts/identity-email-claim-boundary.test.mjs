import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../prisma/migrations/20260729210000_identity_email_claim_write_boundary/migration.sql",
  import.meta.url,
);

async function migrationSql() {
  return readFile(migrationUrl, "utf8");
}

function functionBody(sql, functionName, nextMarker) {
  const start = sql.indexOf(`CREATE FUNCTION public."${functionName}"`);
  assert.notEqual(start, -1, `${functionName} is missing`);
  const end = nextMarker ? sql.indexOf(nextMarker, start) : sql.length;
  assert.notEqual(end, -1, `${functionName} end marker is missing`);
  return sql.slice(start, end);
}

test("CURRENT_168 boundary migration is transactional and bounded", async () => {
  const sql = await migrationSql();

  assert.match(sql, /^BEGIN;/mu);
  assert.match(sql, /SET LOCAL lock_timeout = '5s';/u);
  assert.match(sql, /SET LOCAL statement_timeout = '120s';/u);
  assert.match(sql, /COMMIT;\s*$/u);
  assert.doesNotMatch(sql, /\bEXECUTE\s+(?:FORMAT|\()/iu);
  assert.doesNotMatch(sql, /\bGRANT\b/iu);
  assert.doesNotMatch(sql, /INSERT INTO public\."UserInvite"/iu);
  assert.doesNotMatch(sql, /INSERT INTO public\."User"/iu);
});

test("one subject has one identity claim plus one pending email change", async () => {
  const sql = await migrationSql();

  assert.match(
    sql,
    /CREATE UNIQUE INDEX "identity_email_claim_identity_subject_uidx"[\s\S]*\("tenantId", "subjectId"\)[\s\S]*WHERE "claimType" IN \([\s\S]*'INVITE'::public\."IdentityEmailClaimType"[\s\S]*'USER'::public\."IdentityEmailClaimType"[\s\S]*\)/u,
  );
  assert.match(
    sql,
    /CREATE UNIQUE INDEX "identity_email_claim_email_change_subject_uidx"[\s\S]*\("tenantId", "subjectId"\)[\s\S]*WHERE "claimType" = 'EMAIL_CHANGE'::public\."IdentityEmailClaimType"/u,
  );
});

test("reserve boundary locks before claim read and has a secret-free replay receipt", async () => {
  const sql = await migrationSql();
  const body = functionBody(
    sql,
    "identity_email_claim_reserve_invite_v1",
    "REVOKE ALL\nON FUNCTION public.\"identity_email_claim_reserve_invite_v1\"",
  );

  assert.match(body, /RETURNS JSONB[\s\S]*SECURITY DEFINER/u);
  assert.match(body, /SET search_path = pg_catalog/u);
  assert.ok(
    body.indexOf('identity_email_claim_lock_v1') <
      body.indexOf('FROM public."IdentityEmailClaim"'),
  );
  assert.match(body, /claim_record\."revision" = 1/u);
  assert.match(
    body,
    /'schemaVersion', 1[\s\S]*'operation', 'RESERVE_INVITE'[\s\S]*'decision', 'ALREADY_RESERVED'/u,
  );
  assert.match(body, /'decision', 'CREATED'/u);
  assert.match(body, /FROM public\."User"/u);
  assert.match(body, /FROM public\."UserInvite"/u);
  assert.ok(
    body.indexOf('FROM public."User"') <
      body.indexOf("'decision', 'ALREADY_RESERVED'"),
    "Legacy identity writers must be rechecked before reservation replay.",
  );
  assert.match(body, /ERRCODE = '23505'/u);
  assert.doesNotMatch(body, /'emailCanonical'/u);
  assert.doesNotMatch(body, /RAISE EXCEPTION[^;\n]*canonical_email/iu);
});

test("assert boundary is the lock-before-target-write entrypoint", async () => {
  const sql = await migrationSql();
  const body = functionBody(
    sql,
    "identity_email_claim_assert_invite_v1",
    "REVOKE ALL\nON FUNCTION public.\"identity_email_claim_assert_invite_v1\"",
  );

  assert.match(body, /RETURNS JSONB[\s\S]*SECURITY DEFINER/u);
  assert.match(body, /SET search_path = pg_catalog/u);
  assert.ok(
    body.indexOf('identity_email_claim_lock_v1') <
      body.indexOf('FROM public."IdentityEmailClaim"'),
  );
  assert.match(
    body,
    /"claimType" IS DISTINCT FROM[\s\S]*'INVITE'::public\."IdentityEmailClaimType"/u,
  );
  assert.match(
    body,
    /'schemaVersion', 1[\s\S]*'operation', 'ASSERT_INVITE'[\s\S]*'decision', 'MATCHED'/u,
  );
  assert.doesNotMatch(body, /'emailCanonical'/u);
});

test("transition boundary implements exact replay, CAS, and destination authority", async () => {
  const sql = await migrationSql();
  const body = functionBody(
    sql,
    "identity_email_claim_transition_v1",
    "REVOKE ALL\nON FUNCTION public.\"identity_email_claim_transition_v1\"",
  );

  assert.match(body, /RETURNS JSONB[\s\S]*SECURITY DEFINER/u);
  assert.match(body, /SET search_path = pg_catalog/u);
  assert.ok(
    body.indexOf('identity_email_claim_lock_v1') <
      body.indexOf('FROM public."IdentityEmailClaim"'),
  );
  assert.match(body, /expected_type IS DISTINCT FROM 'INVITE'/u);
  assert.match(body, /target_type IS NULL/u);
  assert.match(body, /target_type NOT IN \('INVITE', 'USER'\)/u);
  assert.match(body, /claim_record\."revision" = expected_revision \+ 1/u);
  assert.match(
    body,
    /'schemaVersion', 1[\s\S]*'operation', 'TRANSITION_INVITE'[\s\S]*'decision', 'ALREADY_TRANSITIONED'/u,
  );
  assert.match(body, /'decision', 'TRANSITIONED'/u);
  assert.ok(
    body.indexOf("'decision', 'ALREADY_TRANSITIONED'") <
      body.indexOf('FROM public."UserInvite" AS target_invite'),
    "Exact transition replay must not depend on mutable destination rows.",
  );
  assert.match(
    body,
    /"tenantId" = tenant_id[\s\S]*"claimType" = expected_type::public\."IdentityEmailClaimType"[\s\S]*"subjectId" = expected_subject[\s\S]*"revision" = expected_revision/u,
  );
  assert.match(
    body,
    /FROM public\."UserInvite"[\s\S]*"tenantId" = tenant_id[\s\S]*"acceptedAt" IS NULL/u,
  );
  assert.match(
    body,
    /FROM public\."User"[\s\S]*"tenantId" = tenant_id[\s\S]*"isActive"/u,
  );
  assert.doesNotMatch(body, /'emailCanonical'/u);
});

test("release boundary deletes only an exact unbound INVITE", async () => {
  const sql = await migrationSql();
  const body = functionBody(
    sql,
    "identity_email_claim_release_v1",
    "REVOKE ALL\nON FUNCTION public.\"identity_email_claim_release_v1\"",
  );

  assert.match(body, /expected_type IS DISTINCT FROM 'INVITE'/u);
  assert.ok(
    body.indexOf('identity_email_claim_lock_v1') <
      body.indexOf('FROM public."IdentityEmailClaim"'),
  );
  assert.match(body, /FROM public\."UserInvite" AS bound_invite/u);
  assert.match(body, /FROM public\."User" AS bound_user/u);
  assert.match(
    body,
    /DELETE FROM public\."IdentityEmailClaim"[\s\S]*"tenantId" = tenant_id[\s\S]*"claimType" = 'INVITE'[\s\S]*"subjectId" = subject_id[\s\S]*"revision" = expected_revision/u,
  );
  assert.match(
    body,
    /'schemaVersion', 1[\s\S]*'operation', 'RELEASE_INVITE'[\s\S]*'decision', 'RELEASED'/u,
  );
  assert.match(body, /'releasedRevision', expected_revision/u);
  assert.doesNotMatch(body, /'emailCanonical'/u);
});

test("all write boundaries and the table are private by default", async () => {
  const sql = await migrationSql();

  assert.match(
    sql,
    /REVOKE ALL[\s\S]*identity_email_claim_reserve_invite_v1[\s\S]*FROM PUBLIC;/u,
  );
  assert.match(
    sql,
    /REVOKE ALL[\s\S]*identity_email_claim_transition_v1[\s\S]*FROM PUBLIC;/u,
  );
  assert.match(
    sql,
    /REVOKE ALL[\s\S]*identity_email_claim_assert_invite_v1[\s\S]*FROM PUBLIC;/u,
  );
  assert.match(
    sql,
    /REVOKE ALL[\s\S]*identity_email_claim_release_v1[\s\S]*FROM PUBLIC;/u,
  );
  assert.match(
    sql,
    /REVOKE ALL ON TABLE public\."IdentityEmailClaim" FROM PUBLIC;/u,
  );
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("../prisma/migrations/20260729230000_identity_invite_writer_boundary/migration.sql", import.meta.url);

async function migrationSql() {
  return readFile(migrationUrl, "utf8");
}

function functionBody(sql, functionName, nextMarker) {
  const start = sql.indexOf(`CREATE FUNCTION public."${functionName}"`);
  assert.notEqual(start, -1, `${functionName} is missing`);
  const end = sql.indexOf(nextMarker, start);
  assert.notEqual(end, -1, `${functionName} end marker is missing`);
  return sql.slice(start, end);
}

test("CURRENT_169 writer boundary is additive, transactional, and bounded", async () => {
  const sql = await migrationSql();

  assert.match(sql, /^BEGIN;/mu);
  assert.match(sql, /SET LOCAL lock_timeout = '5s';/u);
  assert.match(sql, /SET LOCAL statement_timeout = '120s';/u);
  assert.match(sql, /COMMIT;\s*$/u);
  assert.doesNotMatch(sql, /\bEXECUTE\s+(?:FORMAT|\()/iu);
  assert.doesNotMatch(sql, /\bGRANT\b/iu);
  assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE)\s+(?:INTO\s+)?public\."User"/iu);
  assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE)\s+(?:INTO\s+)?public\."UserInvite"/iu);
  assert.doesNotMatch(sql, /\bDROP\s+(?:TABLE|COLUMN|FUNCTION)\b/iu);
});

test("persists nullable positive claim provenance and explicit revocation history", async () => {
  const sql = await migrationSql();

  assert.match(sql, /ALTER TABLE public\."UserInvite"[\s\S]*ADD COLUMN "identityClaimRevision" INTEGER[\s\S]*ADD COLUMN "revokedAt" TIMESTAMP\(3\)[\s\S]*ADD COLUMN "revokedByUserId" TEXT/u);
  assert.match(sql, /ALTER TABLE public\."User"[\s\S]*ADD COLUMN "identityClaimRevision" INTEGER/u);
  assert.match(sql, /"identityClaimRevision" IS NULL[\s\S]*"identityClaimRevision" >= 1/u);
  assert.match(sql, /"revokedAt" IS NULL[\s\S]*OR "acceptedAt" IS NULL/u);
  assert.match(sql, /"revokedByUserId" IS NULL[\s\S]*OR "revokedAt" IS NOT NULL/u);
  assert.match(sql, /"UserInvite_revokedByUserId_fkey"/u);
  assert.match(sql, /"UserInvite_revokedByUserId_idx"/u);
});

test("adds canonical lookup indexes without claiming legacy reconciliation", async () => {
  const sql = await migrationSql();

  assert.match(sql, /CREATE INDEX "user_identity_email_canonical_idx"[\s\S]*lower\(pg_catalog\.btrim\("email"\) COLLATE "C"\)/u);
  assert.match(
    sql,
    /CREATE INDEX "user_invite_live_identity_email_canonical_idx"[\s\S]*lower\(pg_catalog\.btrim\("email"\) COLLATE "C"\)[\s\S]*WHERE "email" IS NOT NULL[\s\S]*AND "acceptedAt" IS NULL[\s\S]*AND "revokedAt" IS NULL/u,
  );
  assert.doesNotMatch(sql, /\bUPDATE public\."(?:User|UserInvite)"/u);
});

test("reserve v2 ignores explicit revocation but keeps live invites blocking", async () => {
  const sql = await migrationSql();
  const body = functionBody(sql, "identity_email_claim_reserve_invite_v2", 'REVOKE ALL\nON FUNCTION public."identity_email_claim_reserve_invite_v2"');

  assert.match(body, /RETURNS JSONB[\s\S]*SECURITY DEFINER/u);
  assert.match(body, /SET search_path = pg_catalog/u);
  assert.ok(body.indexOf("identity_email_claim_lock_v1") < body.indexOf('FROM public."IdentityEmailClaim"'));
  assert.match(
    body,
    /FROM public\."UserInvite" AS existing_invite[\s\S]*existing_invite\."acceptedAt" IS NULL[\s\S]*existing_invite\."revokedAt" IS NULL[\s\S]*existing_invite\."expiresAt" > pg_catalog\.clock_timestamp\(\)/u,
  );
  assert.match(body, /'schemaVersion', 2[\s\S]*'operation', 'RESERVE_INVITE'/u);
  assert.doesNotMatch(body, /'emailCanonical'/u);
});

test("transition v2 validates destination before replay and retains inactive ownership", async () => {
  const sql = await migrationSql();
  const body = functionBody(sql, "identity_email_claim_transition_v2", 'REVOKE ALL\nON FUNCTION public."identity_email_claim_transition_v2"');

  assert.match(body, /RETURNS JSONB[\s\S]*SECURITY DEFINER/u);
  assert.match(body, /SET search_path = pg_catalog/u);
  assert.ok(body.indexOf("identity_email_claim_lock_v1") < body.indexOf('FROM public."IdentityEmailClaim"'));
  assert.ok(body.indexOf('FROM public."UserInvite" AS target_invite') < body.indexOf("'decision', 'ALREADY_TRANSITIONED'"), "Replay must revalidate the destination row.");
  assert.ok(body.indexOf('FROM public."User" AS target_user') < body.indexOf("'decision', 'ALREADY_TRANSITIONED'"), "USER replay must revalidate the destination row.");
  assert.doesNotMatch(body, /target_user\."isActive"/u);
  assert.match(body, /'schemaVersion', 2[\s\S]*'operation', 'TRANSITION_INVITE'/u);
  assert.doesNotMatch(body, /'emailCanonical'/u);
});

test("release v2 preserves history and releases only explicit unaccepted revocation", async () => {
  const sql = await migrationSql();
  const body = functionBody(sql, "identity_email_claim_release_v2", 'REVOKE ALL\nON FUNCTION public."identity_email_claim_release_v2"');

  assert.match(body, /RETURNS JSONB[\s\S]*SECURITY DEFINER/u);
  assert.match(body, /SET search_path = pg_catalog/u);
  assert.match(body, /FROM public\."User" AS bound_user/u);
  assert.match(body, /FROM public\."UserInvite" AS bound_invite/u);
  assert.match(body, /bound_invite\."acceptedAt" IS NOT NULL/u);
  assert.match(body, /bound_invite\."revokedAt" IS NULL/u);
  assert.match(body, /bound_invite\."identityClaimRevision" IS DISTINCT FROM[\s\S]*expected_revision/u);
  assert.doesNotMatch(body, /DELETE FROM public\."UserInvite"/u);
  assert.match(body, /DELETE FROM public\."IdentityEmailClaim"[\s\S]*"subjectId" = subject_id[\s\S]*"revision" = expected_revision/u);
  assert.match(body, /'schemaVersion', 2[\s\S]*'operation', 'RELEASE_INVITE'/u);
  assert.doesNotMatch(body, /'emailCanonical'/u);
});

test("v2 boundaries and claim table remain private by default", async () => {
  const sql = await migrationSql();

  assert.match(sql, /REVOKE ALL[\s\S]*identity_email_claim_reserve_invite_v2[\s\S]*FROM PUBLIC;/u);
  assert.match(sql, /REVOKE ALL[\s\S]*identity_email_claim_transition_v2[\s\S]*FROM PUBLIC;/u);
  assert.match(sql, /REVOKE ALL[\s\S]*identity_email_claim_release_v2[\s\S]*FROM PUBLIC;/u);
  assert.match(sql, /REVOKE ALL ON TABLE public\."IdentityEmailClaim" FROM PUBLIC;/u);
});

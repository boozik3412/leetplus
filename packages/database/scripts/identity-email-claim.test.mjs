import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../prisma/migrations/20260729190000_identity_email_claim_foundation/migration.sql",
  import.meta.url,
);
const schemaUrl = new URL("../prisma/schema.prisma", import.meta.url);

async function migrationSql() {
  return readFile(migrationUrl, "utf8");
}

async function prismaSchema() {
  return readFile(schemaUrl, "utf8");
}

test("identity email claim migration is additive, transactional, and bounded", async () => {
  const sql = await migrationSql();

  assert.match(sql, /^BEGIN;/m);
  assert.match(sql, /SET LOCAL lock_timeout = '5s';/);
  assert.match(sql, /SET LOCAL statement_timeout = '120s';/);
  assert.match(sql, /CREATE TYPE "IdentityEmailClaimType"/);
  assert.match(sql, /CREATE TABLE "IdentityEmailClaim"/);
  assert.match(sql, /COMMIT;\s*$/);
  assert.doesNotMatch(sql, /UPDATE\s+"(?:User|UserInvite)"/);
  assert.doesNotMatch(sql, /ALTER TABLE\s+"(?:User|UserInvite)"/);
});

test("one canonical address is globally reserved and tenant deletion is fail-closed", async () => {
  const sql = await migrationSql();

  assert.match(
    sql,
    /CONSTRAINT "IdentityEmailClaim_pkey" PRIMARY KEY \("emailCanonical"\)/,
  );
  assert.match(
    sql,
    /"emailCanonical" = lower\("emailCanonical" COLLATE "C"\)/,
  );
  assert.match(
    sql,
    /\("emailCanonical" COLLATE "C"\) ~ '\^\[!-\~\]\+\$'/,
  );
  assert.match(
    sql,
    /\("emailCanonical" COLLATE "C"\)[\s\S]*~ '\^\[\^\[:space:\]@\]\+@\[\^\[:space:\]@\]\+\\\.\[\^\[:space:\]@\]\+\$'/,
  );
  assert.match(
    sql,
    /CONSTRAINT "IdentityEmailClaim_tenantId_fkey"[\s\S]*ON DELETE RESTRICT[\s\S]*ON UPDATE RESTRICT/,
  );
  assert.match(sql, /"revision" >= 1/);
  assert.match(
    sql,
    /REVOKE ALL ON TABLE public\."IdentityEmailClaim" FROM PUBLIC;/,
  );
});

test("all identity commands share one private transaction-lock namespace", async () => {
  const sql = await migrationSql();

  assert.match(
    sql,
    /CREATE FUNCTION public\."identity_email_claim_lock_v1"\([\s\S]*candidate_email TEXT[\s\S]*RETURNS TEXT/,
  );
  assert.match(sql, /LANGUAGE plpgsql\s+SECURITY INVOKER/);
  assert.match(sql, /SET search_path = pg_catalog/);
  assert.match(
    sql,
    /hashtextextended\('identity-email:v1:' \|\| canonical_email, 167\)/,
  );
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\."identity_email_claim_lock_v1"\(TEXT\)\s+FROM PUBLIC;/,
  );
  assert.doesNotMatch(
    sql,
    /GRANT EXECUTE ON FUNCTION public\."identity_email_claim_lock_v1"/,
  );
  assert.doesNotMatch(sql, /SECURITY DEFINER/);
});

test("claim transitions preserve key and tenant while advancing revision once", async () => {
  const sql = await migrationSql();

  assert.match(sql, /Identity email claim key is immutable/);
  assert.match(sql, /Identity email claim tenant is immutable/);
  assert.match(sql, /Identity email claim creation timestamp is immutable/);
  assert.match(
    sql,
    /NEW\."revision" IS DISTINCT FROM OLD\."revision" \+ 1/,
  );
  assert.match(sql, /Identity email claim must start at revision one/);
  assert.match(sql, /Identity email claim transition is not allowed/);
  assert.match(
    sql,
    /Identity email claim transition requires a new subject/,
  );
  assert.match(
    sql,
    /CREATE TRIGGER "IdentityEmailClaim_revision_guard_trigger"[\s\S]*BEFORE INSERT OR UPDATE ON "IdentityEmailClaim"/,
  );
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\."identity_email_claim_revision_guard_v1"\(\)\s+FROM PUBLIC;/,
  );
});

test("Prisma schema retains the database defaults and RESTRICT relation contract", async () => {
  const schema = await prismaSchema();

  assert.match(
    schema,
    /enum IdentityEmailClaimType \{[\s\S]*INVITE[\s\S]*USER[\s\S]*EMAIL_CHANGE[\s\S]*\}/,
  );
  assert.match(
    schema,
    /model IdentityEmailClaim \{[\s\S]*emailCanonical\s+String\s+@id @db\.VarChar\(320\)/,
  );
  assert.match(
    schema,
    /model IdentityEmailClaim \{[\s\S]*workflowLocator\s+String/,
  );
  assert.match(
    schema,
    /updatedAt\s+DateTime\s+@default\(now\(\)\) @updatedAt @db\.Timestamptz\(3\)/,
  );
  assert.match(
    schema,
    /tenant Tenant @relation\(fields: \[tenantId\], references: \[id\], onDelete: Restrict, onUpdate: Restrict\)/,
  );
});

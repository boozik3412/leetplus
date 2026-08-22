import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../prisma/migrations/20260729233000_identity_activation_locator/migration.sql",
  import.meta.url,
);

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

test("CURRENT_170 activation locator migration is transactional and bounded", async () => {
  const sql = await migrationSql();

  assert.match(sql, /^BEGIN;/mu);
  assert.match(sql, /SET LOCAL lock_timeout = '5s';/u);
  assert.match(sql, /SET LOCAL statement_timeout = '120s';/u);
  assert.match(sql, /COMMIT;\s*$/u);
  assert.doesNotMatch(sql, /\bEXECUTE\s+(?:FORMAT|\()/iu);
  assert.doesNotMatch(sql, /^\s*GRANT\b/imu);
  assert.doesNotMatch(sql, /\bDROP\s+(?:TABLE|COLUMN|FUNCTION)\b/iu);
  assert.doesNotMatch(
    sql,
    /\b(?:INSERT|UPDATE|DELETE)\s+(?:INTO\s+)?public\."(?:User|UserInvite)"/iu,
  );
});

test("adds and backfills one immutable opaque workflow locator", async () => {
  const sql = await migrationSql();

  assert.match(
    sql,
    /claim\."subjectId" IS DISTINCT FROM pg_catalog\.lower\([\s\S]*pg_catalog\.btrim\(claim\."subjectId"\) COLLATE "C"[\s\S]*OR \(claim\."subjectId" COLLATE "C"\) !~/u,
  );
  assert.match(
    sql,
    /ALTER TABLE public\."IdentityEmailClaim"[\s\S]*ADD COLUMN "workflowLocator" TEXT;/u,
  );
  assert.match(
    sql,
    /UPDATE public\."IdentityEmailClaim"[\s\S]*SET "workflowLocator" = pg_catalog\.lower\([\s\S]*pg_catalog\.btrim\("subjectId"\) COLLATE "C"/u,
  );
  assert.match(
    sql,
    /ALTER COLUMN "workflowLocator" SET NOT NULL[\s\S]*ADD CONSTRAINT "IdentityEmailClaim_workflow_locator_check"/u,
  );
  assert.match(
    sql,
    /CREATE UNIQUE INDEX "identity_email_claim_workflow_locator_uidx"[\s\S]*\("workflowLocator"\)[\s\S]*WHERE "claimType" IN \([\s\S]*'INVITE'::public\."IdentityEmailClaimType"[\s\S]*'USER'::public\."IdentityEmailClaimType"/u,
  );
  assert.match(
    sql,
    /IF NEW\."workflowLocator" IS DISTINCT FROM OLD\."workflowLocator"[\s\S]*Identity workflow locator is immutable/u,
  );
  assert.ok(
    sql.indexOf(
      'DISABLE TRIGGER "IdentityEmailClaim_revision_guard_trigger"',
    ) <
      sql.indexOf('UPDATE public."IdentityEmailClaim"'),
  );
  assert.ok(
    sql.indexOf('UPDATE public."IdentityEmailClaim"') <
      sql.indexOf(
        'ENABLE TRIGGER "IdentityEmailClaim_revision_guard_trigger"',
      ),
  );
});

test("keeps reserve writers source-compatible through the revision guard", async () => {
  const sql = await migrationSql();
  const start = sql.indexOf(
    'CREATE OR REPLACE FUNCTION public."identity_email_claim_revision_guard_v1"',
  );
  const end = sql.indexOf(
    'REVOKE ALL\nON FUNCTION public."identity_email_claim_revision_guard_v1"',
    start,
  );
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const body = sql.slice(start, end);

  assert.match(body, /TG_OP = 'INSERT'/u);
  assert.match(
    body,
    /initial_locator := pg_catalog\.lower\([\s\S]*pg_catalog\.btrim\(NEW\."subjectId"\) COLLATE "C"/u,
  );
  assert.match(
    body,
    /NEW\."subjectId" IS DISTINCT FROM initial_locator[\s\S]*Identity workflow locator is invalid/u,
  );
  assert.match(body, /NEW\."workflowLocator" := initial_locator/u);
  assert.match(
    body,
    /NEW\."revision" IS DISTINCT FROM OLD\."revision" \+ 1/u,
  );
  assert.match(
    body,
    /Identity email claim transition requires a new subject[\s\S]*initial_locator := pg_catalog\.lower\([\s\S]*NEW\."subjectId" IS DISTINCT FROM initial_locator[\s\S]*Identity email claim transition subject is invalid/u,
  );
  assert.match(body, /SET search_path = pg_catalog/u);
});

test("locator discovers, locks, and rechecks the exact claim without returning PII", async () => {
  const sql = await migrationSql();
  const body = functionBody(
    sql,
    "identity_email_claim_assert_invite_locator_v1",
    'REVOKE ALL\nON FUNCTION public."identity_email_claim_assert_invite_locator_v1"',
  );

  assert.match(
    body,
    /requested_workflow_locator TEXT[\s\S]*expected_tenant_id TEXT[\s\S]*expected_subject_id TEXT[\s\S]*expected_revision INTEGER/u,
  );
  assert.match(body, /RETURNS JSONB[\s\S]*SECURITY DEFINER/u);
  assert.match(body, /SET search_path = pg_catalog/u);

  const discovery = body.indexOf('SELECT claim."emailCanonical"');
  const advisoryLock = body.indexOf("identity_email_claim_lock_v1");
  const rowLock = body.indexOf("FOR UPDATE");
  assert.ok(discovery >= 0 && discovery < advisoryLock);
  assert.ok(advisoryLock < rowLock);

  assert.match(
    body,
    /WHERE claim\."workflowLocator" = workflow_locator[\s\S]*AND claim\."tenantId" = tenant_id[\s\S]*AND claim\."claimType" =[\s\S]*'INVITE'::public\."IdentityEmailClaimType"[\s\S]*AND claim\."subjectId" = subject_id[\s\S]*AND claim\."revision" = expected_revision;/u,
  );
  assert.match(
    body,
    /WHERE claim\."emailCanonical" = locked_canonical_email[\s\S]*AND claim\."workflowLocator" = workflow_locator[\s\S]*FOR UPDATE/u,
  );
  assert.match(
    body,
    /claim_record\."tenantId" IS DISTINCT FROM tenant_id[\s\S]*claim_record\."claimType" IS DISTINCT FROM[\s\S]*'INVITE'::public\."IdentityEmailClaimType"[\s\S]*claim_record\."subjectId" IS DISTINCT FROM subject_id[\s\S]*claim_record\."revision" IS DISTINCT FROM expected_revision/u,
  );
  assert.match(
    body,
    /'schemaVersion', 1[\s\S]*'operation', 'ASSERT_INVITE_LOCATOR'[\s\S]*'decision', 'MATCHED'/u,
  );
  assert.doesNotMatch(body, /'emailCanonical'/u);
  assert.doesNotMatch(body, /'canonicalEmail'/u);
});

test("locator and sealed table remain private by default", async () => {
  const sql = await migrationSql();

  assert.match(
    sql,
    /REVOKE ALL[\s\S]*identity_email_claim_assert_invite_locator_v1[\s\S]*FROM PUBLIC;/u,
  );
  assert.match(
    sql,
    /REVOKE ALL ON TABLE public\."IdentityEmailClaim" FROM PUBLIC;/u,
  );
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL(
  '../prisma/migrations/20260728150000_tenant_execution_revision_fence/migration.sql',
  import.meta.url,
);

async function migrationSql() {
  return readFile(migrationUrl, 'utf8');
}

test('execution revision migration is transactional and bounded', async () => {
  const sql = await migrationSql();

  assert.match(sql, /^BEGIN;/m);
  assert.match(sql, /SET LOCAL lock_timeout = '5s';/);
  assert.match(sql, /SET LOCAL statement_timeout = '120s';/);
  assert.match(sql, /LOCK TABLE "Tenant", "ReportDigestScheduleRun", "GuestBonusLedgerEntry"/);
  assert.match(sql, /COMMIT;\s*$/);
});

test('existing tenants are backfilled while new shells start unadmitted', async () => {
  const sql = await migrationSql();

  assert.match(
    sql,
    /ADD COLUMN "executionRevision" INTEGER NOT NULL DEFAULT 0;/,
  );
  assert.match(
    sql,
    /UPDATE "Tenant"\s+SET "executionRevision" = 1;/,
  );
  assert.match(
    sql,
    /CHECK \("executionRevision" >= 0\)/,
  );
});

test('migration refuses to cross the schema boundary with in-flight effects', async () => {
  const sql = await migrationSql();

  assert.match(
    sql,
    /FROM "ReportDigestScheduleRun"\s+WHERE "status" = 'RUNNING'/,
  );
  assert.match(
    sql,
    /FROM "GuestBonusLedgerEntry"\s+WHERE "status" IN \('PROCESSING', 'DISPATCHING'\)/,
  );
  assert.match(sql, /USING ERRCODE = '55000'/);
});

test('the trigger owns and advances the execution revision exactly at policy mutations', async () => {
  const sql = await migrationSql();

  for (const column of [
    'status',
    'customerStage',
    'onboardingStatus',
    'trialStartsAt',
    'trialEndsAt',
    'entitlementProfileRevision',
  ]) {
    assert.match(
      sql,
      new RegExp(`OLD\\."${column}" IS DISTINCT FROM NEW\\."${column}"`),
    );
  }

  assert.match(
    sql,
    /NEW\."executionRevision" := OLD\."executionRevision" \+ 1;/,
  );
  assert.match(sql, /Tenant execution revision is trigger-owned/);
  assert.match(
    sql,
    /BEFORE UPDATE OF[\s\S]*"executionRevision"[\s\S]*ON "Tenant"/,
  );
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\."tenant_execution_revision_fence"\(\) FROM PUBLIC;/,
  );

  const functionIndex = sql.indexOf(
    'CREATE OR REPLACE FUNCTION "tenant_execution_revision_fence"()',
  );
  const revokeIndex = sql.indexOf(
    'REVOKE ALL ON FUNCTION public."tenant_execution_revision_fence"() FROM PUBLIC;',
  );
  const triggerIndex = sql.indexOf(
    'CREATE TRIGGER "Tenant_execution_revision_fence_trigger"',
  );
  assert(
    functionIndex >= 0 &&
      revokeIndex > functionIndex &&
      triggerIndex > revokeIndex,
    'The trigger function must be created, removed from PUBLIC, and only then attached.',
  );
});

test('only the exact suspended/provisioning shell may omit trial dates', async () => {
  const sql = await migrationSql();

  assert.match(
    sql,
    /DROP CONSTRAINT "Tenant_external_stage_trial_check"/,
  );
  assert.match(sql, /"customerStage" NOT IN \('PILOT', 'BETA'\)/);
  assert.match(sql, /"trialStartsAt" < "trialEndsAt"/);
  assert.match(sql, /"status" = 'SUSPENDED'/);
  assert.match(sql, /"onboardingStatus" = 'PROVISIONING'/);
  assert.match(sql, /"trialStartsAt" IS NULL/);
  assert.match(sql, /"trialEndsAt" IS NULL/);
});

test('durable outbound claims can carry the captured revision', async () => {
  const sql = await migrationSql();

  assert.match(
    sql,
    /ALTER TABLE "ReportDigestScheduleRun"\s+ADD COLUMN "executionRevision" INTEGER,/,
  );
  assert.match(
    sql,
    /ALTER TABLE "GuestBonusLedgerEntry"\s+ADD COLUMN "executionRevision" INTEGER,\s+ADD COLUMN "claimGeneration" INTEGER NOT NULL DEFAULT 0,/,
  );
  assert.match(
    sql,
    /ReportDigestScheduleRun_executionRevision_positive_check"[\s\S]*CHECK \("executionRevision" IS NULL OR "executionRevision" > 0\)/,
  );
  assert.match(
    sql,
    /GuestBonusLedgerEntry_executionRevision_positive_check"[\s\S]*CHECK \("executionRevision" IS NULL OR "executionRevision" > 0\)/,
  );
  assert.match(sql, /CHECK \("claimGeneration" >= 0\)/);
  assert.match(sql, /report_digest_schedule_execution_revision_idx/);
  assert.match(sql, /guest_bonus_ledger_execution_revision_idx/);
});

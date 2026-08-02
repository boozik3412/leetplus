import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../prisma/migrations/20260729120000_store_background_execution_fence/migration.sql",
  import.meta.url,
);

async function migrationSql() {
  return readFile(migrationUrl, "utf8");
}

test("Store fence migration is transactional, bounded, and takes one deterministic table lock", async () => {
  const sql = await migrationSql();

  assert.match(sql, /^BEGIN;/m);
  assert.match(sql, /SET LOCAL lock_timeout = '5s';/);
  assert.match(sql, /SET LOCAL statement_timeout = '120s';/);
  assert.match(sql, /LOCK TABLE "Store" IN ACCESS EXCLUSIVE MODE;/);
  assert.match(sql, /COMMIT;\s*$/);
});

test("existing and new stores remain fail-closed at the schema boundary", async () => {
  const sql = await migrationSql();

  assert.match(
    sql,
    /ADD COLUMN "backgroundExecutionEnabled" BOOLEAN NOT NULL DEFAULT false,/,
  );
  assert.match(
    sql,
    /ADD COLUMN "executionRevision" INTEGER NOT NULL DEFAULT 0,/,
  );
  assert.match(
    sql,
    /"Store_executionRevision_nonnegative_check"\s+CHECK \("executionRevision" >= 0\)/,
  );
  assert.match(
    sql,
    /"Store_backgroundExecution_requires_active_check"\s+CHECK \(NOT "backgroundExecutionEnabled" OR "isActive"\)/,
  );
  assert.doesNotMatch(
    sql,
    /UPDATE\s+"Store"[\s\S]*SET[\s\S]*"backgroundExecutionEnabled"\s*=\s*true/i,
  );

  const insertGuard = sql.slice(
    sql.indexOf("IF TG_OP = 'INSERT' THEN"),
    sql.indexOf("RETURN NEW;", sql.indexOf("IF TG_OP = 'INSERT' THEN")),
  );
  assert.match(
    insertGuard,
    /NEW\."backgroundExecutionEnabled" IS DISTINCT FROM false/,
  );
  assert.match(insertGuard, /NEW\."executionRevision" IS DISTINCT FROM 0/);
});

test("the trigger owns revision and observes every Store execution-policy field", async () => {
  const sql = await migrationSql();
  const policyColumns = [
    "isActive",
    "gamificationEnabled",
    "backgroundExecutionEnabled",
    "integrationSourceId",
    "externalProvider",
    "externalDomain",
    "externalClubId",
  ];

  assert.match(
    sql,
    /OLD\."executionRevision" IS DISTINCT FROM NEW\."executionRevision"[\s\S]*Store execution revision is trigger-owned/,
  );

  for (const column of policyColumns) {
    assert.match(
      sql,
      new RegExp(`OLD\\."${column}" IS DISTINCT FROM NEW\\."${column}"`),
    );
    assert.match(
      sql,
      new RegExp(
        `BEFORE INSERT OR UPDATE OF[\\s\\S]*"${column}"[\\s\\S]*ON "Store"`,
      ),
    );
  }

  const revisionAssignments =
    sql.match(/NEW\."executionRevision" := OLD\."executionRevision" \+ 1;/g) ??
    [];
  assert.equal(
    revisionAssignments.length,
    1,
    "A row update must have exactly one revision-advance assignment.",
  );
});

test("archive DML atomically revokes background execution before advancing once", async () => {
  const sql = await migrationSql();
  const archiveIndex = sql.indexOf("is_archiving :=");
  const revokeIndex = sql.indexOf(
    'NEW."backgroundExecutionEnabled" := false;',
    archiveIndex,
  );
  const policyIndex = sql.indexOf("policy_changed :=", archiveIndex);
  const advanceIndex = sql.indexOf(
    'NEW."executionRevision" := OLD."executionRevision" + 1;',
    policyIndex,
  );

  assert.match(sql, /OLD\."isActive" IS TRUE\s+AND NEW\."isActive" IS FALSE/);
  assert.match(
    sql,
    /ELSIF\s+NEW\."isActive" IS FALSE\s+AND NEW\."backgroundExecutionEnabled" IS TRUE[\s\S]*Inactive Store cannot enable background execution/,
  );
  assert(
    archiveIndex >= 0 &&
      revokeIndex > archiveIndex &&
      policyIndex > revokeIndex &&
      advanceIndex > policyIndex,
    "Archive revocation must happen before the single policy revision advance.",
  );
});

test("revision exhaustion is rejected and the trigger function is not executable by PUBLIC", async () => {
  const sql = await migrationSql();

  assert.match(
    sql,
    /OLD\."executionRevision" >= 2147483647[\s\S]*Store execution revision is exhausted[\s\S]*ERRCODE = '22003'/,
  );
  assert.match(
    sql,
    /OLD\."executionRevision" = 2147483646[\s\S]*authority_reduced[\s\S]*NEW\."backgroundExecutionEnabled" IS TRUE[\s\S]*one terminal revocation[\s\S]*NEW\."executionRevision" := 2147483647;/,
  );
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\."store_execution_revision_fence"\(\) FROM PUBLIC;/,
  );

  const functionIndex = sql.indexOf(
    'CREATE OR REPLACE FUNCTION public."store_execution_revision_fence"()',
  );
  const revokeIndex = sql.indexOf(
    'REVOKE ALL ON FUNCTION public."store_execution_revision_fence"() FROM PUBLIC;',
  );
  const triggerIndex = sql.indexOf(
    'CREATE TRIGGER "Store_execution_revision_fence_trigger"',
  );
  assert(
    functionIndex >= 0 &&
      revokeIndex > functionIndex &&
      triggerIndex > revokeIndex,
    "The function must be created, revoked from PUBLIC, and only then attached.",
  );
  assert.match(
    sql,
    /EXECUTE FUNCTION public\."store_execution_revision_fence"\(\);/,
  );
});

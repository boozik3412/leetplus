import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  IDENTITY_MAIL_WORKER_V2_FRESHNESS_CURRENT183_CANDIDATE,
  IDENTITY_MAIL_WORKER_V2_FRESHNESS_CURRENT183_CONTRACT,
  IDENTITY_MAIL_WORKER_V2_FRESHNESS_CURRENT183_FINDINGS as F,
  IdentityMailWorkerV2FreshnessCurrent183FoundationError,
  checkIdentityMailWorkerV2FreshnessCurrent183Foundation,
  inspectIdentityMailWorkerV2FreshnessCurrent183Foundation,
  runIdentityMailWorkerV2FreshnessCurrent183SelfTest,
} from "./identity-mail-worker-v2-freshness-current183-foundation.mjs";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const CANDIDATE_DIRECTORY = join(
  dirname(SCRIPT_DIRECTORY),
  "migration-candidates",
  IDENTITY_MAIL_WORKER_V2_FRESHNESS_CURRENT183_CANDIDATE,
);
const SQL_PATH = join(CANDIDATE_DIRECTORY, "migration.sql");
const METADATA_PATH = join(CANDIDATE_DIRECTORY, "candidate.json");

async function source() {
  return {
    metadataText: await readFile(METADATA_PATH, "utf8"),
    sql: await readFile(SQL_PATH, "utf8"),
  };
}

async function expectFinding(overrides, finding) {
  const report =
    await inspectIdentityMailWorkerV2FreshnessCurrent183Foundation(overrides);
  assert.equal(report.decision, "CURRENT183_FOUNDATION_BLOCKED");
  assert.ok(report.findings.includes(finding), JSON.stringify(report));
}

function repinMetadata(metadataText, sql) {
  const metadata = JSON.parse(metadataText);
  metadata.migrationSqlSha256 = createHash("sha256")
    .update(sql.replaceAll("\r\n", "\n").replaceAll("\r", "\n"))
    .digest("hex");
  return JSON.stringify(metadata);
}

test("accepts the exact CURRENT183 foundation", async () => {
  const report =
    await checkIdentityMailWorkerV2FreshnessCurrent183Foundation();
  assert.equal(report.contract, IDENTITY_MAIL_WORKER_V2_FRESHNESS_CURRENT183_CONTRACT);
  assert.equal(report.decision, "CURRENT183_FOUNDATION_COMPLIANT");
  assert.equal(report.authorization, false);
  assert.equal(report.canMutate, false);
  assert.equal(report.coordinator, "NOT_IMPLEMENTED_GUARDS_PRESERVED");
  assert.match(report.migrationSqlSha256, /^[0-9a-f]{64}$/u);
});

test("self-test exercises all fail-closed probes", async () => {
  const report = await runIdentityMailWorkerV2FreshnessCurrent183SelfTest();
  assert.equal(report.decision, "CURRENT183_FOUNDATION_SELF_TEST_PASSED");
  assert.equal(report.negativeProbes, 6);
});

test("rejects SERIALIZABLE in the shared lock", async () => {
  const { sql } = await source();
  await expectFinding(
    { sql: sql.replace("'read committed'", "'serializable'") },
    F.FRESHNESS_CONTRACT_DRIFT,
  );
});

test("rejects missing READ COMMITTED isolation inspection", async () => {
  const { sql } = await source();
  await expectFinding(
    { sql: sql.replace("transaction_isolation", "transaction_mode") },
    F.FRESHNESS_CONTRACT_DRIFT,
  );
});

test("rejects advisory lock domain drift", async () => {
  const { sql } = await source();
  await expectFinding(
    {
      sql: sql.replace(
        "leetplus:identity-mail-tenant:v1:",
        "leetplus:identity-mail-tenant:other:",
      ),
    },
    F.FRESHNESS_CONTRACT_DRIFT,
  );
});

test("rejects CURRENT183 count drift", async () => {
  const { sql } = await source();
  await expectFinding(
    {
      sql: sql.replace(
        "migration_count IS DISTINCT FROM 183",
        "migration_count IS DISTINCT FROM 182",
      ),
    },
    F.READINESS_PIN_DRIFT,
  );
});

test("rejects CURRENT183 head drift", async () => {
  const { sql } = await source();
  const assertMarker = "database receipt is not exact CURRENT_183";
  const assertStart = sql.indexOf(
    'CREATE OR REPLACE FUNCTION public."identity_mail_delivery_worker_assert_v2"',
  );
  const assertEnd = sql.indexOf("$$;", assertStart);
  const assertBlock = sql.slice(assertStart, assertEnd + 3);
  const mutatedBlock = assertBlock.replaceAll(
    "20260802010000_identity_mail_worker_v2_freshness_protocol",
    "20260801030000_identity_mail_tenant_first_claim_protocol",
  );
  assert.ok(assertBlock.includes(assertMarker));
  await expectFinding(
    { sql: `${sql.slice(0, assertStart)}${mutatedBlock}${sql.slice(assertEnd + 3)}` },
    F.READINESS_PIN_DRIFT,
  );
});

test("rejects readiness authorization drift", async () => {
  const { sql } = await source();
  await expectFinding(
    { sql: sql.replace("'canSend', false", "'canSend', true") },
    F.READINESS_PIN_DRIFT,
  );
});

test("rejects PUBLIC execute", async () => {
  const { sql } = await source();
  await expectFinding(
    {
      sql: sql.replace(
        'REVOKE ALL PRIVILEGES\nON FUNCTION public."identity_mail_tenant_lock_v1"(TEXT)\nFROM PUBLIC;',
        'GRANT EXECUTE ON FUNCTION public."identity_mail_tenant_lock_v1"(TEXT) TO PUBLIC;',
      ),
    },
    F.ACL_SURFACE_DRIFT,
  );
});

test("rejects extra routine surface", async () => {
  const { sql } = await source();
  await expectFinding(
    {
      sql: sql.replace(
        "COMMIT;\n",
        'CREATE OR REPLACE FUNCTION public."unexpected_v1"() RETURNS VOID LANGUAGE sql AS $$ SELECT $$;\nCOMMIT;\n',
      ),
    },
    F.ROUTINE_SURFACE_DRIFT,
  );
});

test("pins PostgreSQL prosrc hashes with both dollar-quote boundary linefeeds", async () => {
  const { sql } = await source();
  await expectFinding(
    {
      sql: sql.replace(
        "c53780aa0df846a4085b01b4c62cbb857f69e0f145a8c72a43ef1af35fafc790",
        "f443f99f51378b16b478238ead767d0beab66acba126444e71abbc6b22c6a702",
      ),
    },
    F.ROUTINE_SURFACE_DRIFT,
  );
});

test("rejects direct relation mutation", async () => {
  const { sql } = await source();
  await expectFinding(
    {
      sql: sql.replace(
        "COMMIT;\n",
        'UPDATE public."IdentityMailDeliveryTenantEnrollment" SET "enabled" = false;\nCOMMIT;\n',
      ),
    },
    F.FORBIDDEN_DDL_OR_DML,
  );
});

test("rejects ALTER FUNCTION after the postcondition", async () => {
  const { sql } = await source();
  await expectFinding(
    {
      sql: sql.replace(
        "COMMIT;\n",
        'ALTER FUNCTION public."identity_mail_delivery_worker_assert_v2"(TEXT, TEXT) SECURITY INVOKER;\nCOMMIT;\n',
      ),
    },
    F.FORBIDDEN_DDL_OR_DML,
  );
});

test("rejects every unexpected CREATE surface", async () => {
  const { sql } = await source();
  await expectFinding(
    {
      sql: sql.replace(
        "DO $postcondition$",
        'CREATE VIEW public."current183_unexpected" AS SELECT 1 AS "value";\n\nDO $postcondition$',
      ),
    },
    F.FORBIDDEN_DDL_OR_DML,
  );
});

test("rejects an unquoted extra function even when metadata is repinned", async () => {
  const { metadataText, sql } = await source();
  const mutatedSql = sql.replace(
    "DO $postcondition$",
    "CREATE OR REPLACE FUNCTION public.current183_unexpected() RETURNS INTEGER LANGUAGE SQL AS 'SELECT 1';\n\nDO $postcondition$",
  );
  await expectFinding(
    {
      sql: mutatedSql,
      metadataText: repinMetadata(metadataText, mutatedSql),
    },
    F.ROUTINE_SURFACE_DRIFT,
  );
});

test("rejects an extra DO block even when metadata is repinned", async () => {
  const { metadataText, sql } = await source();
  const mutatedSql = sql.replace(
    "DO $postcondition$",
    "DO $evil$ BEGIN EXECUTE 'CRE' || 'ATE VIEW public.current183_unexpected AS SELECT 1'; END; $evil$;\n\nDO $postcondition$",
  );
  await expectFinding(
    {
      sql: mutatedSql,
      metadataText: repinMetadata(metadataText, mutatedSql),
    },
    F.TRANSACTION_ENVELOPE_INVALID,
  );
});

test("rejects SELECT INTO schema drift even when metadata is repinned", async () => {
  const { metadataText, sql } = await source();
  const mutatedSql = sql.replace(
    "DO $postcondition$",
    'SELECT 1 AS "value" INTO public."current183_unexpected";\n\nDO $postcondition$',
  );
  await expectFinding(
    {
      sql: mutatedSql,
      metadataText: repinMetadata(metadataText, mutatedSql),
    },
    F.SQL_SHA_DRIFT,
  );
});

test("requires the postcondition to be the final statement before commit", async () => {
  const { sql } = await source();
  await expectFinding(
    {
      sql: sql.replace(
        "COMMIT;\n",
        "SELECT pg_catalog.now();\nCOMMIT;\n",
      ),
    },
    F.TRANSACTION_ENVELOPE_INVALID,
  );
});

test("rejects a guard bypass masquerading as a fixture coordinator", async () => {
  const { sql } = await source();
  await expectFinding(
    {
      sql: sql.replace(
        "COMMIT;\n",
        "SET LOCAL session_replication_role = 'replica';\nCOMMIT;\n",
      ),
    },
    F.COORDINATOR_BYPASS_ADDED,
  );
});

test("rejects predecessor manifest drift", async () => {
  const { metadataText } = await source();
  const metadata = JSON.parse(metadataText);
  metadata.predecessor.manifestDigest = "0".repeat(64);
  await expectFinding(
    { metadataText: JSON.stringify(metadata) },
    F.PREDECESSOR_DRIFT,
  );
});

test("rejects metadata authorization", async () => {
  const { metadataText } = await source();
  const metadata = JSON.parse(metadataText);
  metadata.authorization = true;
  await expectFinding({ metadataText: JSON.stringify(metadata) }, F.METADATA_DRIFT);
});

test("check throws a typed fail-closed error", async () => {
  const { sql } = await source();
  await assert.rejects(
    checkIdentityMailWorkerV2FreshnessCurrent183Foundation({
      sql: sql.replace("'read committed'", "'serializable'"),
    }),
    (error) => {
      assert.ok(
        error instanceof
          IdentityMailWorkerV2FreshnessCurrent183FoundationError,
      );
      assert.ok(error.findings.includes(F.FRESHNESS_CONTRACT_DRIFT));
      return true;
    },
  );
});

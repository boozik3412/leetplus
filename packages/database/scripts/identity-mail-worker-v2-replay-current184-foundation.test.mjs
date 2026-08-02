import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  IDENTITY_MAIL_WORKER_V2_REPLAY_CURRENT184_CANDIDATE,
  IDENTITY_MAIL_WORKER_V2_REPLAY_CURRENT184_CONTRACT,
  IDENTITY_MAIL_WORKER_V2_REPLAY_CURRENT184_FINDINGS as F,
  IdentityMailWorkerV2ReplayCurrent184FoundationError,
  checkIdentityMailWorkerV2ReplayCurrent184Foundation,
  inspectIdentityMailWorkerV2ReplayCurrent184Foundation,
  runIdentityMailWorkerV2ReplayCurrent184SelfTest,
} from "./identity-mail-worker-v2-replay-current184-foundation.mjs";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const CANDIDATE_DIRECTORY = join(
  dirname(SCRIPT_DIRECTORY),
  "migration-candidates",
  IDENTITY_MAIL_WORKER_V2_REPLAY_CURRENT184_CANDIDATE,
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
    await inspectIdentityMailWorkerV2ReplayCurrent184Foundation(overrides);
  assert.equal(report.decision, "CURRENT184_FOUNDATION_BLOCKED");
  assert.ok(report.findings.includes(finding), JSON.stringify(report));
}

function repinMetadata(metadataText, sql) {
  const metadata = JSON.parse(metadataText);
  metadata.migrationSqlSha256 = createHash("sha256")
    .update(sql.replaceAll("\r\n", "\n").replaceAll("\r", "\n"))
    .digest("hex");
  return JSON.stringify(metadata);
}

test("accepts only the exact dormant CURRENT184 replay foundation", async () => {
  const report = await checkIdentityMailWorkerV2ReplayCurrent184Foundation();
  assert.equal(report.contract, IDENTITY_MAIL_WORKER_V2_REPLAY_CURRENT184_CONTRACT);
  assert.equal(report.decision, "CURRENT184_FOUNDATION_COMPLIANT");
  assert.equal(report.authorization, false);
  assert.equal(report.canMutate, false);
  assert.equal(report.runtime, "NOT_WIRED_OWNER_ONLY");
  assert.match(report.migrationSqlSha256, /^[0-9a-f]{64}$/u);
  assert.deepEqual(report.findings, []);
});

test("self-test exercises every fail-closed probe", async () => {
  const report = await runIdentityMailWorkerV2ReplayCurrent184SelfTest();
  assert.equal(report.decision, "CURRENT184_FOUNDATION_SELF_TEST_PASSED");
  assert.equal(report.negativeProbes, 5);
});

test("rejects missing replay provenance columns", async () => {
  const { metadataText, sql } = await source();
  const mutatedSql = sql.replaceAll(
    '"transitionRequestDigest"',
    '"requestDigest"',
  );
  await expectFinding(
    {
      metadataText: repinMetadata(metadataText, mutatedSql),
      sql: mutatedSql,
    },
    F.COLUMN_SURFACE_DRIFT,
  );
  await expectFinding(
    {
      metadataText: repinMetadata(metadataText, mutatedSql),
      sql: mutatedSql,
    },
    F.REPLAY_CONTRACT_DRIFT,
  );
});

test("rejects a non-partial or non-tenant replay uniqueness index", async () => {
  const { metadataText, sql } = await source();
  const mutatedSql = sql.replace(
    '"tenantId",\n    "outboxId",\n    "transitionRequestDigest"',
    '"outboxId",\n    "transitionRequestDigest"',
  );
  await expectFinding(
    {
      metadataText: repinMetadata(metadataText, mutatedSql),
      sql: mutatedSql,
    },
    F.CONSTRAINT_SURFACE_DRIFT,
  );
});

test("rejects settlement-state pairing drift", async () => {
  const { metadataText, sql } = await source();
  const mutatedSql = sql.replace(
    '"settlementState" IS NOT NULL',
    '"settlementState" IS NULL',
  );
  await expectFinding(
    {
      metadataText: repinMetadata(metadataText, mutatedSql),
      sql: mutatedSql,
    },
    F.CONSTRAINT_SURFACE_DRIFT,
  );
});

test("rejects event-type binding drift", async () => {
  const { metadataText, sql } = await source();
  const alteredTableStart = sql.indexOf(
    'ALTER TABLE public."IdentityMailDeliveryEvent"',
  );
  const indexStart = sql.indexOf("CREATE UNIQUE INDEX", alteredTableStart);
  const block = sql.slice(alteredTableStart, indexStart);
  const mutatedBlock = block.replace('"eventType" IN (', '"eventKind" IN (');
  const mutatedSql =
    sql.slice(0, alteredTableStart) + mutatedBlock + sql.slice(indexStart);
  await expectFinding(
    {
      metadataText: repinMetadata(metadataText, mutatedSql),
      sql: mutatedSql,
    },
    F.CONSTRAINT_SURFACE_DRIFT,
  );
});

test("rejects ambiguous reuse of the V2 event-digest domain", async () => {
  const { metadataText, sql } = await source();
  const mutatedSql = sql.replace(
    "LEETPLUS_IDENTITY_MAIL_DELIVERY_EVENT_V3",
    "LEETPLUS_IDENTITY_MAIL_DELIVERY_EVENT_V2",
  );
  await expectFinding(
    {
      metadataText: repinMetadata(metadataText, mutatedSql),
      sql: mutatedSql,
    },
    F.EVENT_APPEND_DRIFT,
  );
});

test("rejects replay lookup removal from provider mark", async () => {
  const { metadataText, sql } = await source();
  const providerStart = sql.indexOf(
    'CREATE FUNCTION public."identity_initial_owner_mail_provider_mark_v2"',
  );
  const providerEnd = sql.indexOf("$$;", providerStart);
  assert.ok(providerStart >= 0 && providerEnd > providerStart);
  const block = sql.slice(providerStart, providerEnd + 3);
  const mutatedBlock = block.replaceAll(
    'public."IdentityMailDeliveryEvent"',
    'public."IdentityMailDeliveryEventMissing"',
  );
  const mutatedSql =
    sql.slice(0, providerStart) + mutatedBlock + sql.slice(providerEnd + 3);
  await expectFinding(
    {
      metadataText: repinMetadata(metadataText, mutatedSql),
      sql: mutatedSql,
    },
    F.REPLAY_CONTRACT_DRIFT,
  );
});

test("rejects replay lookup removal from complete", async () => {
  const { metadataText, sql } = await source();
  const completeStart = sql.indexOf(
    'CREATE FUNCTION public."identity_initial_owner_mail_complete_v2"',
  );
  const completeEnd = sql.indexOf("$$;", completeStart);
  assert.ok(completeStart >= 0 && completeEnd > completeStart);
  const block = sql.slice(completeStart, completeEnd + 3);
  const mutatedBlock = block.replaceAll(
    '"transitionRequestDigest"',
    '"requestDigest"',
  );
  const mutatedSql =
    sql.slice(0, completeStart) + mutatedBlock + sql.slice(completeEnd + 3);
  await expectFinding(
    {
      metadataText: repinMetadata(metadataText, mutatedSql),
      sql: mutatedSql,
    },
    F.REPLAY_CONTRACT_DRIFT,
  );
});

test("rejects weakened DRAINING authority in either replay wrapper", async () => {
  const { metadataText, sql } = await source();
  const mutations = [
    [
      `command_record."action" NOT IN ('ROTATE', 'DISABLE')`,
      `command_record."action" IN ('ROTATE', 'DISABLE')`,
    ],
    [
      `command_record."drainStateRevision" IS DISTINCT FROM`,
      `command_record."drainStateRevision" IS NOT DISTINCT FROM`,
    ],
    [
      `command_record."expectedPolicyRevision" IS DISTINCT FROM`,
      `command_record."expectedPolicyRevision" IS NOT DISTINCT FROM`,
    ],
    [
      `command_record."previousConfigurationDigest" IS DISTINCT FROM`,
      `command_record."previousConfigurationDigest" IS NOT DISTINCT FROM`,
    ],
  ];
  for (const [required, weakened] of mutations) {
    const occurrences = [];
    let cursor = 0;
    while (true) {
      const foundAt = sql.indexOf(required, cursor);
      if (foundAt < 0) break;
      occurrences.push(foundAt);
      cursor = foundAt + required.length;
    }
    assert.equal(occurrences.length, 2);
    for (const foundAt of occurrences) {
      const mutatedSql =
        sql.slice(0, foundAt) +
        weakened +
        sql.slice(foundAt + required.length);
      await expectFinding(
        {
          metadataText: repinMetadata(metadataText, mutatedSql),
          sql: mutatedSql,
        },
        F.REPLAY_CONTRACT_DRIFT,
      );
    }
  }
});

test("rejects CURRENT184 readiness count drift", async () => {
  const { metadataText, sql } = await source();
  const mutatedSql = sql.replace(
    "migration_count IS DISTINCT FROM 184",
    "migration_count IS DISTINCT FROM 183",
  );
  await expectFinding(
    {
      metadataText: repinMetadata(metadataText, mutatedSql),
      sql: mutatedSql,
    },
    F.READINESS_PIN_DRIFT,
  );
});

test("rejects CURRENT184 readiness authorization drift", async () => {
  const { metadataText, sql } = await source();
  const mutatedSql = sql.replace("'canSend', false", "'canSend', true");
  await expectFinding(
    {
      metadataText: repinMetadata(metadataText, mutatedSql),
      sql: mutatedSql,
    },
    F.READINESS_PIN_DRIFT,
  );
});

test("rejects any extra or missing routine", async () => {
  const { metadataText, sql } = await source();
  const mutatedSql = sql.replace(
    "DO $postcondition$",
    'CREATE OR REPLACE FUNCTION public."unexpected_v1"() RETURNS VOID LANGUAGE sql AS $$ SELECT $$;\n\nDO $postcondition$',
  );
  await expectFinding(
    {
      metadataText: repinMetadata(metadataText, mutatedSql),
      sql: mutatedSql,
    },
    F.ROUTINE_SURFACE_DRIFT,
  );
});

test("rejects PUBLIC execute even with a repinned artifact", async () => {
  const { metadataText, sql } = await source();
  const mutatedSql = sql.replace(
    'REVOKE ALL PRIVILEGES\nON FUNCTION public."identity_mail_delivery_event_append_v2"()\nFROM PUBLIC;',
    'GRANT EXECUTE ON FUNCTION public."identity_mail_delivery_event_append_v2"() TO PUBLIC;',
  );
  await expectFinding(
    {
      metadataText: repinMetadata(metadataText, mutatedSql),
      sql: mutatedSql,
    },
    F.ACL_SURFACE_DRIFT,
  );
  await expectFinding(
    {
      metadataText: repinMetadata(metadataText, mutatedSql),
      sql: mutatedSql,
    },
    F.FORBIDDEN_AUTHORITY_OR_DML,
  );
});

test("requires event append in the final owner-only ACL postcondition", async () => {
  const { metadataText, sql } = await source();
  const postconditionStart = sql.indexOf("DO $postcondition$");
  const postconditionEnd = sql.indexOf("$postcondition$;", postconditionStart);
  assert.ok(postconditionStart >= 0 && postconditionEnd > postconditionStart);
  const block = sql.slice(postconditionStart, postconditionEnd);
  const mutatedBlock = block.replace(
    `('public."identity_mail_delivery_event_append_v2"()'),`,
    `('public."identity_mail_delivery_event_append_v3"()'),`,
  );
  assert.notEqual(mutatedBlock, block);
  const mutatedSql =
    sql.slice(0, postconditionStart) +
    mutatedBlock +
    sql.slice(postconditionEnd);
  await expectFinding(
    {
      metadataText: repinMetadata(metadataText, mutatedSql),
      sql: mutatedSql,
    },
    F.ACL_SURFACE_DRIFT,
  );
});

test("rejects runtime role materialization", async () => {
  const { metadataText, sql } = await source();
  const mutatedSql = sql.replace(
    "DO $postcondition$",
    "CREATE ROLE identity_mail_worker_current184;\n\nDO $postcondition$",
  );
  await expectFinding(
    {
      metadataText: repinMetadata(metadataText, mutatedSql),
      sql: mutatedSql,
    },
    F.FORBIDDEN_AUTHORITY_OR_DML,
  );
});

test("rejects implementation helper exposure in API runtime source", async () => {
  await expectFinding(
    {
      runtimeSourceText:
        'SELECT public."identity_initial_owner_mail_provider_mark_current183"()',
    },
    F.HELPER_EXPOSURE_DRIFT,
  );
});

test("rejects direct data mutation", async () => {
  const { metadataText, sql } = await source();
  const mutatedSql = sql.replace(
    "DO $postcondition$",
    'UPDATE public."IdentityMailOutbox" SET "status" = "status";\n\nDO $postcondition$',
  );
  await expectFinding(
    {
      metadataText: repinMetadata(metadataText, mutatedSql),
      sql: mutatedSql,
    },
    F.FORBIDDEN_AUTHORITY_OR_DML,
  );
});

test("requires the postcondition to remain final", async () => {
  const { metadataText, sql } = await source();
  const mutatedSql = sql.replace(
    "COMMIT;\n",
    "SELECT pg_catalog.now();\nCOMMIT;\n",
  );
  await expectFinding(
    {
      metadataText: repinMetadata(metadataText, mutatedSql),
      sql: mutatedSql,
    },
    F.TRANSACTION_ENVELOPE_INVALID,
  );
});

test("rejects predecessor manifest drift", async () => {
  const { metadataText } = await source();
  const metadata = JSON.parse(metadataText);
  metadata.predecessor.manifestDigest = "0".repeat(64);
  await expectFinding({ metadataText: JSON.stringify(metadata) }, F.PREDECESSOR_DRIFT);
});

test("recalculates the frozen predecessor manifest from source bytes", async () => {
  await expectFinding(
    {
      predecessorEntries: [],
    },
    F.PREDECESSOR_DRIFT,
  );
});

test("rejects metadata authorization", async () => {
  const { metadataText } = await source();
  const metadata = JSON.parse(metadataText);
  metadata.authorization = true;
  await expectFinding({ metadataText: JSON.stringify(metadata) }, F.METADATA_DRIFT);
});

test("rejects incomplete candidate inventory", async () => {
  await expectFinding(
    {
      candidateDirectories: [
        "20260801010000_identity_mail_tenant_enrollment_control_plane",
        "20260801020000_identity_mail_tenant_lock_drain_worker_v2",
        "20260801030000_identity_mail_tenant_first_claim_protocol",
        "20260802010000_identity_mail_worker_v2_freshness_protocol",
      ],
    },
    F.CANDIDATE_CHAIN_DRIFT,
  );
});

test("check throws a typed fail-closed error", async () => {
  const { sql } = await source();
  await assert.rejects(
    checkIdentityMailWorkerV2ReplayCurrent184Foundation({
      sql: sql.replace("'canSend', false", "'canSend', true"),
    }),
    (error) => {
      assert.ok(error instanceof IdentityMailWorkerV2ReplayCurrent184FoundationError);
      assert.ok(error.findings.includes(F.READINESS_PIN_DRIFT));
      return true;
    },
  );
});

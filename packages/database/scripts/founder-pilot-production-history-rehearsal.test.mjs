import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS,
  applyFounderPilotProductionHistoryPlan,
  buildFounderPilotProductionHistoryPlan,
  materializeFounderPilotProductionHistoryLane,
  materializeFounderPilotProductionHistorySql,
} from "./founder-pilot-production-history-rehearsal.mjs";
import { FOUNDER_PILOT_RESTORED_COPY_PREFLIGHT_CONTRACT } from "./founder-pilot-restored-copy-preflight.mjs";

const SCRIPT_ROOT = path.dirname(fileURLToPath(import.meta.url));
const PRISMA_ROOT = path.resolve(SCRIPT_ROOT, "../prisma");
const CAPTURED_AT = "2026-08-18T09:28:19.706Z";
const SYSTEM_IDENTIFIER = "7675301746759083084";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function manifest(root) {
  return {
    backup: {
      backupPath: path.join(root, "production.dump"),
      backupSha256: "a".repeat(64),
      capturedAt: CAPTURED_AT,
    },
    contractVersion: FOUNDER_PILOT_RESTORED_COPY_PREFLIGHT_CONTRACT,
    isolation: {
      apiStarted: false,
      databaseOnly: true,
      langameEnabled: false,
      productionServiceTokensMounted: false,
      schedulersEnabled: false,
      smtpEnabled: false,
      telegramEnabled: false,
      workersStarted: false,
    },
    release: {
      artifactPath: path.join(root, "release.tar.gz"),
      artifactSha256: "b".repeat(64),
      releaseSha: "c".repeat(40),
    },
    retention: {
      deleteBy: "2026-08-23T09:28:19.706Z",
      rpoSeconds: 86400,
      rtoSeconds: 7200,
    },
    target: {
      databaseName: "leetplus_restored_founder_clean_a1",
      expectedSystemIdentifier: SYSTEM_IDENTIFIER,
      host: "127.0.0.1",
      ownerRoleName: "postgres",
      port: 55439,
      sourceMigrationCount:
        FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.sourceMigrationCount,
      sourceMigrationManifestDigest:
        FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.sourceMigrationManifestDigest,
      sourceRolledBackMigrationCount:
        FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.sourceRolledBackMigrationCount,
      sourceRolledBackMigrationManifestDigest:
        FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.sourceRolledBackMigrationManifestDigest,
      sourceSchemaHead:
        FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.sourceMigrationHead,
    },
  };
}

function staleRun(overrides = {}) {
  return {
    completedAt: null,
    errorMessage: null,
    executionRevision: null,
    id: "11111111-1111-4111-8111-111111111111",
    sentCount: 0,
    startedAt: new Date("2026-06-08T00:00:00.000Z"),
    status: "RUNNING",
    type: "WEEKLY",
    ...overrides,
  };
}

function sourceEvidence(overrides = {}) {
  return {
    migrationCount:
      FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.sourceMigrationCount,
    migrationHead:
      FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.sourceMigrationHead,
    migrationManifestDigest:
      FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.sourceMigrationManifestDigest,
    migrationRows: [],
    rolledBackMigrationCount:
      FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.sourceRolledBackMigrationCount,
    rolledBackMigrationManifestDigest:
      FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.sourceRolledBackMigrationManifestDigest,
    runningDigestRows: [staleRun()],
    unfinishedMigrationCount: 0,
    ...overrides,
  };
}

async function temporaryRoot(t) {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "lp-founder-history-test-"),
  );
  t.after(() => rm(root, { force: true, recursive: true }));
  return root;
}

test("materializes exact production-history CURRENT179 and CURRENT185 bytes", async () => {
  for (const [migrationName, expectedDigest] of [
    [
      "20260731120000_identity_mail_delivery_release_head",
      FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.materializedCurrent179Sha256,
    ],
    [
      "20260818020000_identity_mail_delivery_current_head_v1",
      FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.materializedCurrent185Sha256,
    ],
  ]) {
    const source = await readFile(
      path.join(PRISMA_ROOT, "migrations", migrationName, "migration.sql"),
    );
    assert.equal(
      sha256(
        materializeFounderPilotProductionHistorySql(migrationName, source),
      ),
      expectedDigest,
    );
  }
});

test("rejects a byte-drifted canonical migration before materialization", async () => {
  const migrationName = "20260731120000_identity_mail_delivery_release_head";
  const source = await readFile(
    path.join(PRISMA_ROOT, "migrations", migrationName, "migration.sql"),
  );
  assert.throws(
    () =>
      materializeFounderPilotProductionHistorySql(
        migrationName,
        Buffer.concat([source, Buffer.from("\n")]),
      ),
    { reasonCode: "FOUNDER_PILOT_HISTORY_CURRENT179_SOURCE_DRIFT" },
  );
});

test("creates a sealed 186-migration disposable Prisma lane", async (t) => {
  const root = await temporaryRoot(t);
  const laneRoot = path.join(
    root,
    "leetplus-founder-production-history-test-a1",
  );
  const receipt = await materializeFounderPilotProductionHistoryLane({
    laneRoot,
    sourcePrismaRoot: PRISMA_ROOT,
  });
  assert.equal(receipt.migrationCount, 186);
  assert.match(receipt.treeDigest, /^[0-9a-f]{64}$/u);
  assert.equal(
    sha256(
      await readFile(
        path.join(
          laneRoot,
          "migrations",
          "20260818020000_identity_mail_delivery_current_head_v1",
          "migration.sql",
        ),
      ),
    ),
    FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.materializedCurrent185Sha256,
  );
  assert.equal(
    sha256(
      await readFile(
        path.join(
          laneRoot,
          "migrations",
          "20260819010000_staff_attachment_parent_delete_guard",
          "migration.sql",
        ),
      ),
    ),
    "cc95b88495113ac789a52956b2bdc9ba86915c64846a46c146e96532b32d8db5",
  );
  const replay = await materializeFounderPilotProductionHistoryLane({
    laneRoot,
    sourcePrismaRoot: PRISMA_ROOT,
  });
  assert.equal(replay.treeDigest, receipt.treeDigest);
});

test("binds exact restored migration state and stale run set into a plan", async (t) => {
  const root = await temporaryRoot(t);
  const plan = await buildFounderPilotProductionHistoryPlan({
    inspectTarget: async () => sourceEvidence(),
    manifest: manifest(root),
    sourcePrismaRoot: PRISMA_ROOT,
  });
  assert.equal(plan.staleRunCount, 1);
  assert.match(plan.staleRunSetDigest, /^[0-9a-f]{64}$/u);
  assert.match(plan.materializedTreeDigest, /^[0-9a-f]{64}$/u);
  assert.match(plan.planDigest, /^[0-9a-f]{64}$/u);
  assert.doesNotMatch(JSON.stringify(plan), /11111111|production\.dump/u);
});

test("rejects a fresh or non-empty running digest job", async (t) => {
  const root = await temporaryRoot(t);
  await assert.rejects(
    () =>
      buildFounderPilotProductionHistoryPlan({
        inspectTarget: async () =>
          sourceEvidence({
            runningDigestRows: [
              staleRun({
                sentCount: 1,
                startedAt: new Date("2026-08-18T08:00:00.000Z"),
              }),
            ],
          }),
        manifest: manifest(root),
        sourcePrismaRoot: PRISMA_ROOT,
      }),
    { reasonCode: "FOUNDER_PILOT_HISTORY_STALE_RUN_NOT_RECONCILABLE" },
  );
});

test("requires the exact plan digest before any reconciliation", async (t) => {
  const root = await temporaryRoot(t);
  const plan = await buildFounderPilotProductionHistoryPlan({
    inspectTarget: async () => sourceEvidence(),
    manifest: manifest(root),
    sourcePrismaRoot: PRISMA_ROOT,
  });
  let reconciled = false;
  await assert.rejects(
    () =>
      applyFounderPilotProductionHistoryPlan({
        adapter: {
          reconcile: async () => {
            reconciled = true;
          },
        },
        confirmPlanDigest: "f".repeat(64),
        laneRoot: path.join(
          root,
          "leetplus-founder-production-history-apply-a1",
        ),
        manifest: manifest(root),
        plan,
        sourcePrismaRoot: PRISMA_ROOT,
      }),
    { reasonCode: "FOUNDER_PILOT_HISTORY_PLAN_CONFIRMATION_MISMATCH" },
  );
  assert.equal(reconciled, false);
});

test("materializes before applying the exact bound reconciliation", async (t) => {
  const root = await temporaryRoot(t);
  const plan = await buildFounderPilotProductionHistoryPlan({
    inspectTarget: async () => sourceEvidence(),
    manifest: manifest(root),
    sourcePrismaRoot: PRISMA_ROOT,
  });
  const calls = [];
  const result = await applyFounderPilotProductionHistoryPlan({
    adapter: {
      reconcile: async (receivedPlan, capturedAt) => {
        calls.push({ capturedAt, planDigest: receivedPlan.planDigest });
        return 1;
      },
    },
    confirmPlanDigest: plan.planDigest,
    laneRoot: path.join(root, "leetplus-founder-production-history-apply-a2"),
    manifest: manifest(root),
    plan,
    sourcePrismaRoot: PRISMA_ROOT,
  });
  assert.equal(result.decision, "READY_FOR_EXACT_PRISMA_DEPLOY");
  assert.equal(result.reconciledRunCount, 1);
  assert.deepEqual(calls, [
    { capturedAt: CAPTURED_AT, planDigest: plan.planDigest },
  ]);
});

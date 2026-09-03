#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  canonicalRecordSha256,
  COMPLETE_DECISION,
  CONTRACT_VERSION,
  main,
  PHASES,
} from "../../docs/deployment/production-artifact/resumable-release-orchestrator.mjs";

const RELEASE_SHA = "a".repeat(40);
const PREVIOUS_SHA = "b".repeat(40);
const CONTROL_SHA = "c".repeat(64);
const IMPACT_SHA = "d".repeat(64);
const MIGRATION = "20260831120000_guest_support_bug_report_input_repair";
const BASE_TIME = Date.parse("2026-09-03T00:00:00.000Z");
const V2_CONTRACT_VERSION = "LEETPLUS_RESUMABLE_RELEASE_ORCHESTRATOR_V2";

function iso(milliseconds) {
  return new Date(BASE_TIME + milliseconds).toISOString();
}

function canonical(value) {
  return JSON.stringify(value, null, 2) + "\n";
}

async function writeCanonical(filePath, value) {
  await writeFile(filePath, canonical(value), { mode: 0o600 });
}

function planFor(id, lane, legacy = false, v2 = false) {
  const value = {
    schemaVersion: 1,
    contractVersion: v2 ? V2_CONTRACT_VERSION : CONTRACT_VERSION,
    operationId: id,
    releaseSha: RELEASE_SHA,
    targetSlot: "blue",
    expectedMigration: MIGRATION,
    expectedMigrationCount: 189,
    previousReleaseSha: PREVIOUS_SHA,
    previousMigration: MIGRATION,
    previousMigrationCount: 189,
    previousWebBuildId: PREVIOUS_SHA,
    urls: {
      loopbackApi: "http://127.0.0.1:4100",
      loopbackWeb: "http://127.0.0.1:3100",
      publicApi: "https://api.leetplus.ru",
      publicWeb: "https://leetplus.ru",
    },
    watchdogSeconds: 30,
    baselineCutover: {
      generation: 20,
      receiptPath: "/var/lib/leetplus/deploy-receipts/g20.receipt",
      receiptSha256: "e".repeat(64),
    },
    controlAttestationSha256: CONTROL_SHA,
    preparedAt: iso(0),
    decision: "PREPARED_NOT_EFFECT_AUTHORIZATION",
  };
  if (!legacy) {
    value.effectiveLane = lane;
    value.impactReceiptSha256 = IMPACT_SHA;
  }
  return value;
}

function evidenceDetails(phase, v2 = false) {
  const common = {
    releaseSha: RELEASE_SHA,
    targetSlot: "blue",
  };
  if (phase === "HYDRATE") {
    return {
      ...common,
      commandOutputSha256: "1".repeat(64),
      hydrationReceiptPath: "/var/lib/leetplus/deploy-receipts/hydration.receipt",
      hydrationReceiptSha256: "2".repeat(64),
      releaseDirectory: "/srv/leetplus/releases/" + RELEASE_SHA,
    };
  }
  if (phase === "BIND") {
    const value = {
      ...common,
      commandOutputSha256: "1".repeat(64),
      quiesceIntentSha256: "2".repeat(64),
      slotLinkReceiptPath: "/var/lib/leetplus/deploy-receipts/blue.bind.receipt",
      slotLinkReceiptSha256: "5".repeat(64),
    };
    if (!v2) {
      Object.assign(value, {
        slotEnvironmentApiBindHostNormalization: "NONE",
        slotEnvironmentPath: "/etc/leetplus/slots/blue.env",
        slotEnvironmentPreviousPath: "/var/lib/leetplus/previous.env",
        slotEnvironmentPreviousSha256: "3".repeat(64),
        slotEnvironmentSha256: "4".repeat(64),
      });
    }
    return value;
  }
  if (phase === "SMOKE") {
    return {
      ...common,
      apiInvocationId: "a".repeat(32),
      authenticatedSmokeSha256: "1".repeat(64),
      commandOutputSha256: "2".repeat(64),
      readinessSha256: "3".repeat(64),
      unmaskIntentSha256: "4".repeat(64),
      webInvocationId: "b".repeat(32),
    };
  }
  if (phase === "CUTOVER") {
    return {
      ...common,
      commandOutputSha256: "1".repeat(64),
      cutoverReceiptPath: "/var/lib/leetplus/deploy-receipts/g21.receipt",
      cutoverReceiptSha256: "2".repeat(64),
      generation: 21,
    };
  }
  return {
    ...common,
    authenticatedSmokeSha256: "1".repeat(64),
    cutoverReceiptSha256: "2".repeat(64),
    generation: 21,
    readinessSha256: "3".repeat(64),
  };
}

async function writeCompletedOperation(
  root,
  id,
  lane,
  index,
  legacy = false,
  v2 = false,
) {
  const directory = path.join(
    root,
    "var/lib/leetplus/deploy-receipts/release-orchestrator",
    id,
  );
  await mkdir(directory, { recursive: true });
  const plan = planFor(id, lane, legacy, v2);
  await writeCanonical(path.join(directory, "plan.json"), plan);
  const planSha256 = canonicalRecordSha256(plan);
  const offset = index * 100000;
  const approval = {
    schemaVersion: 1,
    contractVersion: v2 ? V2_CONTRACT_VERSION : CONTRACT_VERSION,
    recordType: "APPLY_APPROVAL",
    operationId: id,
    planSha256,
    approvedAt: iso(offset),
    decision: "EXACT_PLAN_DIGEST_APPLY_AUTHORIZED",
  };
  await writeCanonical(path.join(directory, "approval.json"), approval);
  let previousPhaseReceiptSha256 = "";
  for (let phaseIndex = 0; phaseIndex < PHASES.length; phaseIndex += 1) {
    const phase = PHASES[phaseIndex];
    const createdAt = iso(offset + phaseIndex * 1000);
    const intent = {
      schemaVersion: 1,
      contractVersion: v2 ? V2_CONTRACT_VERSION : CONTRACT_VERSION,
      recordType: "PHASE_INTENT",
      operationId: id,
      planSha256,
      phaseIndex: phaseIndex + 1,
      phase,
      previousPhaseReceiptSha256,
      createdAt,
    };
    await writeCanonical(
      path.join(directory, String(phaseIndex + 1).padStart(2, "0") + "-" + phase.toLowerCase() + ".intent.json"),
      intent,
    );
    const evidence = {
      schemaVersion: 1,
      contractVersion: v2 ? V2_CONTRACT_VERSION : CONTRACT_VERSION,
      recordType: "PHASE_EVIDENCE",
      operationId: id,
      planSha256,
      phaseIndex: phaseIndex + 1,
      phase,
      controlAttestationSha256: CONTROL_SHA,
      observedAt: iso(offset + phaseIndex * 1000 + 5),
      details: evidenceDetails(phase, v2),
    };
    const evidenceSha256 = canonicalRecordSha256(evidence);
    await writeCanonical(
      path.join(directory, String(phaseIndex + 1).padStart(2, "0") + "-" + phase.toLowerCase() + ".evidence.json"),
      evidence,
    );
    const receipt = {
      schemaVersion: 1,
      contractVersion: v2 ? V2_CONTRACT_VERSION : CONTRACT_VERSION,
      recordType: "PHASE_RECEIPT",
      operationId: id,
      planSha256,
      phaseIndex: phaseIndex + 1,
      phase,
      previousPhaseReceiptSha256,
      createdAt,
      intentSha256: canonicalRecordSha256(intent),
      evidenceSha256,
      controlAttestationSha256: CONTROL_SHA,
      acceptedAt: iso(offset + phaseIndex * 1000 + (phaseIndex + 1) * 10),
      decision: "PHASE_ACCEPTED",
    };
    previousPhaseReceiptSha256 = canonicalRecordSha256(receipt);
    await writeCanonical(
      path.join(directory, String(phaseIndex + 1).padStart(2, "0") + "-" + phase.toLowerCase() + ".receipt.json"),
      receipt,
    );
  }
  await writeCanonical(path.join(directory, "final.json"), {
    schemaVersion: 1,
    contractVersion: v2 ? V2_CONTRACT_VERSION : CONTRACT_VERSION,
    recordType: "ROLLOUT_RECEIPT",
    operationId: id,
    planSha256,
    releaseSha: RELEASE_SHA,
    targetSlot: "blue",
    lastPhaseReceiptSha256: previousPhaseReceiptSha256,
    completedAt: iso(offset + (index + 10) * 1000),
    decision: COMPLETE_DECISION,
  });
}

async function writeUnresolvedOperation(root, id, lane) {
  const directory = path.join(
    root,
    "var/lib/leetplus/deploy-receipts/release-orchestrator",
    id,
  );
  await mkdir(directory, { recursive: true });
  await writeCanonical(path.join(directory, "plan.json"), planFor(id, lane));
}

async function captureMain(argv) {
  let stdout = "";
  let stderr = "";
  const originalWrite = process.stdout.write;
  const originalErrorWrite = process.stderr.write;
  process.stdout.write = (chunk) => {
    stdout += String(chunk);
    return true;
  };
  process.stderr.write = (chunk) => {
    stderr += String(chunk);
    return true;
  };
  try {
    const status = await main(argv);
    return { status, stderr, stdout };
  } finally {
    process.stdout.write = originalWrite;
    process.stderr.write = originalErrorWrite;
  }
}

test("metrics aggregates only trusted L1/L2 records and fails closed on malformed samples", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "leetplus-orchestrator-metrics-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(
    path.join(root, "var/lib/leetplus/deploy-receipts/release-orchestrator"),
    { recursive: true },
  );
  for (let index = 0; index < 20; index += 1) {
    const id = `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
    await writeCompletedOperation(root, id, "L1_RUNTIME", index);
  }
  await writeCompletedOperation(
    root,
    "20000000-0000-4000-8000-000000000001",
    "L2_SCHEMA_SECURITY",
    21,
  );
  await writeCompletedOperation(
    root,
    "30000000-0000-4000-8000-000000000001",
    "L1_RUNTIME",
    22,
    true,
  );
  await writeCompletedOperation(
    root,
    "35000000-0000-4000-8000-000000000001",
    "L1_RUNTIME",
    23,
    true,
    true,
  );
  await writeUnresolvedOperation(
    root,
    "40000000-0000-4000-8000-000000000001",
    "L2_SCHEMA_SECURITY",
  );
  const unresolvedId = "40000000-0000-4000-8000-000000000001";
  const unresolvedDirectory = path.join(
    root,
    "var/lib/leetplus/deploy-receipts/release-orchestrator",
    unresolvedId,
  );
  await writeCanonical(path.join(unresolvedDirectory, "approval.json"), {});
  const malformedUnresolved = await captureMain([
    "metrics",
    "--fixture-root",
    root,
    "--unprivileged-test-mode",
  ]);
  assert.equal(malformedUnresolved.status, 1);
  assert.match(
    malformedUnresolved.stderr,
    /ORCHESTRATOR_APPROVAL_INVALID/u,
  );
  const unresolvedPlan = planFor(unresolvedId, "L2_SCHEMA_SECURITY");
  await writeCanonical(path.join(unresolvedDirectory, "approval.json"), {
    schemaVersion: 1,
    contractVersion: CONTRACT_VERSION,
    recordType: "APPLY_APPROVAL",
    operationId: unresolvedId,
    planSha256: canonicalRecordSha256(unresolvedPlan),
    approvedAt: iso(0),
    decision: "EXACT_PLAN_DIGEST_APPLY_AUTHORIZED",
  });
  const metricsRoot = path.join(
    root,
    "var/lib/leetplus/deploy-receipts/release-orchestrator-metrics",
  );
  const receiptParent = path.dirname(metricsRoot);
  assert.equal((await readdir(receiptParent)).includes(path.basename(metricsRoot)), false);
  const emptyRead = await captureMain([
    "metrics",
    "--fixture-root",
    root,
    "--unprivileged-test-mode",
  ]);
  assert.equal(emptyRead.status, 0);
  assert.equal((await readdir(receiptParent)).includes(path.basename(metricsRoot)), false);
  await mkdir(metricsRoot, { recursive: true });
  await writeCanonical(
    path.join(metricsRoot, "50000000-0000-4000-8000-000000000001.json"),
    {
      schemaVersion: 1,
      contractVersion: CONTRACT_VERSION,
      recordType: "ROLLOUT_ATTEMPT_METRIC",
      attemptMode: "apply",
      attemptStartedAt: iso(0),
      attemptFinishedAt: iso(100),
      effectiveLane: "L1_RUNTIME",
      outcome: "BLOCKED",
      failurePhase: "HYDRATE",
      reasonClass: "CHILD_COMMAND",
    },
  );
  const metricPath = path.join(
    metricsRoot,
    "50000000-0000-4000-8000-000000000001.json",
  );
  const before = await readFile(metricPath, "utf8");
  const result = await captureMain([
    "metrics",
    "--fixture-root",
    root,
    "--unprivileged-test-mode",
  ]);
  assert.equal(result.status, 0);
  assert.equal(await readFile(metricPath, "utf8"), before);
  const report = JSON.parse(result.stdout);
  assert.equal(report.decision, "METRICS_READ_ONLY");
  assert.equal(report.lanes.L1_RUNTIME.completedOperationCount, 20);
  assert.equal(report.lanes.L1_RUNTIME.approvalToFinalMilliseconds.p50, 19000);
  assert.equal(report.lanes.L1_RUNTIME.approvalToFinalMilliseconds.p95, 28000);
  assert.equal(report.lanes.L1_RUNTIME.failurePhaseHistogram.HYDRATE, 1);
  assert.equal(report.lanes.L2_SCHEMA_SECURITY.completedOperationCount, 1);
  assert.equal(
    report.lanes.L2_SCHEMA_SECURITY.approvalToFinalMilliseconds.decision,
    "INSUFFICIENT_SAMPLE_SIZE",
  );
  assert.equal(report.lanes.L2_SCHEMA_SECURITY.approvalToFinalMilliseconds.p50, null);
  assert.equal(report.legacyUnclassified.completedOperationCount, 2);
  assert.equal(report.unresolved.byLane.L2_SCHEMA_SECURITY, 1);

  await writeFile(path.join(metricsRoot, "not-a-canonical-record.json"), "{}\n");
  const malformed = await captureMain([
    "metrics",
    "--fixture-root",
    root,
    "--unprivileged-test-mode",
  ]);
  assert.equal(malformed.status, 1);
  assert.match(malformed.stderr, /ORCHESTRATOR_METRIC_ATTEMPT_INVENTORY_INVALID/u);
});

#!/usr/bin/env node

import assert from "node:assert/strict";
import test from "node:test";

import { buildReport, CONTRACT, STAGES, validateRecord } from "./release-a-pilot-ledger.mjs";

const sha = (character, length) => character.repeat(length);
const stage = (at) => ({
  at,
  basis: "PRODUCER_TIMESTAMP",
  evidence: `evidence:${at}`,
  producerAt: at,
  publishedAt: "",
  detectedAt: "",
});
const emptyStage = () => ({
  at: "",
  basis: "",
  evidence: "",
  producerAt: "",
  publishedAt: "",
  detectedAt: "",
});

function record({ outcome = "VERIFIED", day = 1, lane = "L1_RUNTIME" } = {}) {
  const prefix = `2026-09-${String(day).padStart(2, "0")}`;
  const times = [
    `${prefix}T00:00:00Z`,
    `${prefix}T00:01:00Z`,
    `${prefix}T00:02:00Z`,
    `${prefix}T00:03:00Z`,
    `${prefix}T00:04:00Z`,
    `${prefix}T00:05:00Z`,
    `${prefix}T00:06:00Z`,
    `${prefix}T00:07:00Z`,
    `${prefix}T00:08:00Z`,
  ];
  return {
    contract: CONTRACT,
    candidate: {
      issue: `LP-${day}`,
      lane,
      exactMainSha: sha("a", 40),
      fastRunId: "35855405339",
      fullRunId: "35855405364",
      fullRunAttempt: 1,
      composeArtifactId: "10747739032",
      nativeOperationId: "63b58306-a711-4a0c-ba8c-07b3d9979e9c",
      nativePlanSha256: sha("b", 64),
      goApprovalSha256: sha("c", 64),
      nativeFinalReceiptSha256: sha("d", 64),
    },
    stages: Object.fromEntries(STAGES.map((name, index) => [name, stage(times[index])])),
    waits: [],
    outcome,
    independentAcceptanceEvidence: "receipt:independent-browser-api-worker-acceptance",
    replayedAcceptedEffects: 0,
    lateCriticalFailureClasses: [],
    workerContinuationEvidence: "receipt:worker-schedule-and-grants-restored",
    notes: "",
  };
}

test("valid VERIFIED record reports the required per-record durations", () => {
  const validated = validateRecord(record());
  const report = buildReport([validated]);
  assert.deepEqual(report.records[0].durationsMs, {
    mergedToVerified: 5 * 60_000,
    requestToVerified: 8 * 60_000,
    admittedToVerified: 4 * 60_000,
  });
  assert.equal(report.lanes.L1_RUNTIME.durationsMs.mergedToVerified.status, "INSUFFICIENT_SAMPLE_SIZE");
  assert.equal(report.lanes.L1_RUNTIME.durationsMs.mergedToVerified.p95, null);
});

test("incomplete record keeps unassessed counters null instead of treating them as zero", () => {
  const value = record({ outcome: "IN_PROGRESS" });
  for (const stageName of STAGES.slice(5)) value.stages[stageName] = emptyStage();
  value.candidate.nativeOperationId = "";
  value.candidate.nativePlanSha256 = "";
  value.candidate.goApprovalSha256 = "";
  value.candidate.nativeFinalReceiptSha256 = "";
  value.independentAcceptanceEvidence = "";
  value.replayedAcceptedEffects = null;
  value.lateCriticalFailureClasses = null;
  value.workerContinuationEvidence = "";
  const report = buildReport([validateRecord(value)]);
  assert.equal(report.records[0].completedStage, "admitted");
  assert.equal(report.records[0].durationsMs.mergedToVerified, null);
  assert.deepEqual(report.lanes.L1_RUNTIME.repeatedEffectCounter, {
    assessedRecords: 0,
    unassessedRecords: 1,
    total: null,
  });
});

test("invalid identifiers and non-monotonic stages fail closed", () => {
  const invalidIdentifier = record();
  invalidIdentifier.candidate.exactMainSha = "ABC";
  assert.throws(() => validateRecord(invalidIdentifier), /exactMainSha.*invalid exact identifier/u);

  const reversed = record();
  reversed.stages.admitted = stage("2026-09-01T00:02:30Z");
  assert.throws(() => validateRecord(reversed), /admitted\.at.*must not precede/u);

  const missingBasisTime = record();
  missingBasisTime.stages.prepared.producerAt = "";
  assert.throws(() => validateRecord(missingBasisTime), /prepared.*populated producerAt/u);
});

test("wait reasons carry bounded intervals without adding overlapping durations", () => {
  const value = record();
  value.waits = [
    { reason: "ADMISSION", startedAt: "2026-09-01T00:03:00Z", endedAt: "2026-09-01T00:04:00Z", evidence: "ci:full" },
    { reason: "REVIEWER_OR_USER_WINDOW", startedAt: "2026-09-01T00:03:30Z", endedAt: "2026-09-01T00:04:30Z", evidence: "journal:window" },
  ];
  const report = buildReport([validateRecord(value)]);
  assert.deepEqual(report.records[0].waits.map((wait) => wait.durationMs), [60_000, 60_000]);
  assert.equal(report.records[0].durationsMs.mergedToVerified, 5 * 60_000);
  const invalid = structuredClone(value);
  invalid.waits[0].reason = "MYSTERY";
  assert.throws(() => validateRecord(invalid), /pilot wait taxonomy/u);
});

test("APPLIED evidence cannot be relabelled VERIFIED without independent acceptance", () => {
  const falseVerified = record();
  falseVerified.independentAcceptanceEvidence = "";
  assert.throws(
    () => validateRecord(falseVerified),
    /independentAcceptanceEvidence.*non-empty/u,
  );
});

test("per-lane p50 and p95 appear only at ten VERIFIED records", () => {
  const nine = Array.from({ length: 9 }, (_, index) => validateRecord(record({ day: index + 1 })));
  assert.equal(buildReport(nine).lanes.L1_RUNTIME.durationsMs.requestToVerified.p50, null);
  const ten = [...nine, validateRecord(record({ day: 10 }))];
  const stats = buildReport(ten).lanes.L1_RUNTIME.durationsMs.requestToVerified;
  assert.equal(stats.status, "MEASURED");
  assert.equal(stats.n, 10);
  assert.equal(stats.p50, 8 * 60_000);
  assert.equal(stats.p95, 8 * 60_000);
});

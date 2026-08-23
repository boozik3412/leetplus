import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  GATE_1MT_OPERATIONAL_PREFLIGHT_BLOCKED,
  GATE_1MT_OPERATIONAL_PREFLIGHT_CONTRACT,
  GATE_1MT_READY_FOR_CONTROLLED_CANARY,
  GATE_1MT_READY_FOR_PRODUCTION_GO_REVIEW,
  loadGate1mtOperationalManifest,
  runGate1mtOperationalPreflight,
} from "./gate-1mt-operational-preflight.mjs";

const NOW = new Date("2026-08-23T10:00:00.000Z");
const CAPTURED_AT = "2026-08-23T09:55:00.000Z";
const RELEASE_SHA = "1".repeat(40);
const PREVIOUS_RELEASE_SHA = "2".repeat(40);
const DATABASE_FINGERPRINT = "3".repeat(64);
const TENANT_FINGERPRINT = "4".repeat(64);
const STORE_FINGERPRINT = "5".repeat(64);
const execFile = promisify(execFileCallback);
const CLI_PATH = fileURLToPath(
  new URL("./gate-1mt-operational-preflight.cli.mjs", import.meta.url),
);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function target() {
  return {
    storeFingerprint: STORE_FINGERPRINT,
    tenantFingerprint: TENANT_FINGERPRINT,
  };
}

function attachmentInventory() {
  return {
    attachmentInventory: {
      rowsScanned: 1,
      stateCounts: { AVAILABLE: 1 },
    },
    classificationReasonCounts: { PRIMARY_UNIQUE_PARENT_ATTACHMENT: 1 },
    durationMs: 1200,
    mode: "READ_ONLY_DRY_RUN",
    reasonCounts: {},
    safety: {
      allowedHttpsOriginCount: 1,
      batchSize: 250,
      databaseSessionReadOnly: true,
      databaseTargetFingerprint: DATABASE_FINGERPRINT,
      fileNamesEmitted: false,
      maximumNodesPerValue: 20000,
      maximumReferencesPerRow: 1000,
      productionAttested: true,
      rawIdentifiersEmitted: false,
      rawUrlsEmitted: false,
      releaseSha: RELEASE_SHA,
      singleConnection: true,
      snapshotConsistent: true,
      snapshotIsolation: "REPEATABLE READ",
      statementTimeoutMs: 30000,
      target: "production",
      transactionTimeoutMs: 600000,
    },
    schemaVersion: 1,
    script: "staff-attachment-backfill-dry-run",
    snapshotStartedAt: CAPTURED_AT,
    sources: {},
    status: "completed",
    totals: {
      exactReferenceOccurrences: 1,
      existingAttachmentsWithoutRecognizedReference: 0,
      primaryAutoBindCandidateOccurrences: 1,
      rowsWithReferenceSignals: 1,
      secondaryReviewOnlyOccurrences: 0,
      sourceRowsScanned: 1,
      uniqueExistingAttachmentCandidates: 1,
      uniqueMissingAttachmentCandidates: 0,
      uniqueRecognizedAttachmentCandidates: 1,
      validReferenceOccurrences: 1,
    },
  };
}

function browserEvidence() {
  return {
    capturedAt: CAPTURED_AT,
    consoleErrorCount: 0,
    contractVersion: "GATE_1MT_BROWSER_EVIDENCE_V1",
    flows: {
      archivedParentReturns404: "PASS",
      crossTenantReturns404: "PASS",
      deletedParentReturns404: "PASS",
      orphanedAttachmentReturns404: "PASS",
      uploadBindDownloadRemove: "PASS",
    },
    releaseSha: RELEASE_SHA,
    target: target(),
    unexpectedNetworkFailureCount: 0,
  };
}

function ciEvidence() {
  return {
    capturedAt: CAPTURED_AT,
    contractVersion: "GATE_1MT_CI_ADMISSION_EVIDENCE_V1",
    fastRun: {
      conclusion: "SUCCESS",
      releaseSha: RELEASE_SHA,
      runId: "32639407487",
    },
    releaseRun: {
      conclusion: "SUCCESS",
      releaseSha: RELEASE_SHA,
      runId: "32639407475",
    },
    releaseSha: RELEASE_SHA,
    repository: "boozik3412/leetplus",
  };
}

function observabilityEvidence() {
  return {
    alertsConfigured: true,
    apiErrorRatePermille: 1,
    apiP95Ms: 800,
    attachmentServerErrorCount: 0,
    capturedAt: CAPTURED_AT,
    contractVersion: "GATE_1MT_OBSERVABILITY_EVIDENCE_V1",
    queueLagSeconds: 2,
    releaseSha: RELEASE_SHA,
    rollbackAlertRouteTested: true,
    target: target(),
    windowSeconds: 900,
  };
}

function rollbackEvidence() {
  return {
    backupVerified: true,
    capturedAt: CAPTURED_AT,
    contractVersion: "GATE_1MT_ROLLBACK_EVIDENCE_V1",
    nMinusOneReady: true,
    observedRtoSeconds: 120,
    previousReleaseSha: PREVIOUS_RELEASE_SHA,
    releaseSha: RELEASE_SHA,
    rollbackCommandDryRunPassed: true,
    schedulerFree: true,
  };
}

function providerEvidence() {
  return {
    approvalFingerprint: "6".repeat(64),
    capturedAt: CAPTURED_AT,
    contractVersion: "GATE_1MT_PROVIDER_CANARY_EVIDENCE_V1",
    providers: ["LANGAME", "SMTP", "TELEGRAM"].map((provider) => ({
      attempted: 1,
      duplicateDeliveries: 0,
      failed: 0,
      provider,
      succeeded: 1,
    })),
    recipientFingerprint: "7".repeat(64),
    releaseSha: RELEASE_SHA,
    target: target(),
  };
}

async function fixture(t, phase = "CONTROLLED_CANARY") {
  const directory = await mkdtemp(path.join(os.tmpdir(), "lp-gate-1mt-"));
  t.after(() => rm(directory, { force: true, recursive: true }));
  const values = {
    attachmentInventory: attachmentInventory(),
    browser: browserEvidence(),
    ciAdmission: ciEvidence(),
    observability: observabilityEvidence(),
    rollback: rollbackEvidence(),
  };
  if (phase === "PRODUCTION_GO_REVIEW") {
    values.providerCanary = providerEvidence();
  }
  const references = {};
  for (const [name, value] of Object.entries(values)) {
    const filePath = path.join(directory, `${name}.json`);
    const bytes = Buffer.from(`${JSON.stringify(value)}\n`, "utf8");
    await writeFile(filePath, bytes, { flag: "wx" });
    references[name] = { path: filePath, sha256: sha256(bytes) };
  }
  references.providerCanary ??= null;

  const manifest = {
    contractVersion: GATE_1MT_OPERATIONAL_PREFLIGHT_CONTRACT,
    evidence: references,
    evidenceMaxAgeSeconds: 3600,
    phase,
    release: {
      releaseSha: RELEASE_SHA,
      repository: "boozik3412/leetplus",
    },
    requiredProviders:
      phase === "PRODUCTION_GO_REVIEW" ? ["LANGAME", "SMTP", "TELEGRAM"] : [],
    target: {
      databaseFingerprint: DATABASE_FINGERPRINT,
      storeFingerprint: STORE_FINGERPRINT,
      tenantFingerprint: TENANT_FINGERPRINT,
    },
    thresholds: {
      apiErrorRatePermilleMax: 5,
      apiP95MsMax: 1500,
      attachmentServerErrorCountMax: 0,
      queueLagSecondsMax: 30,
      rollbackRtoSecondsMax: 300,
    },
  };
  const manifestPath = path.join(directory, "manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`, {
    flag: "wx",
  });
  return { directory, manifest, manifestPath, values };
}

async function rewriteEvidence(fixtureValue, name) {
  const reference = fixtureValue.manifest.evidence[name];
  const bytes = Buffer.from(
    `${JSON.stringify(fixtureValue.values[name])}\n`,
    "utf8",
  );
  await writeFile(reference.path, bytes);
  reference.sha256 = sha256(bytes);
}

test("accepts fresh exact-SHA evidence while provider traffic remains forbidden", async (t) => {
  const value = await fixture(t);
  const result = await runGate1mtOperationalPreflight({
    expectedReleaseSha: RELEASE_SHA,
    manifest: value.manifest,
    now: () => NOW,
  });
  assert.equal(result.decision, GATE_1MT_READY_FOR_CONTROLLED_CANARY);
  assert.equal(result.reasonCode, null);
  assert.equal(result.releaseSha, RELEASE_SHA);
  assert.equal(result.evidence.providerCanarySha256, null);
  assert.match(result.evidenceDigest, /^[0-9a-f]{64}$/u);
  assert.match(result.manifestDigest, /^[0-9a-f]{64}$/u);
  assert.match(result.targetDigest, /^[0-9a-f]{64}$/u);
  assert.doesNotMatch(
    JSON.stringify(result),
    /ALIENWARE|recipient|tenantFingerprint/iu,
  );
  assert.ok(Object.isFrozen(result));
});

test("accepts GO review only after one successful approved canary per required provider", async (t) => {
  const value = await fixture(t, "PRODUCTION_GO_REVIEW");
  const result = await runGate1mtOperationalPreflight({
    expectedReleaseSha: RELEASE_SHA,
    manifest: value.manifest,
    now: () => NOW,
  });
  assert.equal(result.decision, GATE_1MT_READY_FOR_PRODUCTION_GO_REVIEW);
  assert.match(result.evidence.providerCanarySha256, /^[0-9a-f]{64}$/u);
});

test("fails closed on SHA drift, unresolved inventory, browser failure, stale evidence, metric breach, or rollback gap", async (t) => {
  const cases = [
    [
      "EXPECTED_SHA",
      () => {},
      "0".repeat(40),
      "GATE_1MT_EXPECTED_RELEASE_SHA_MISMATCH",
    ],
    [
      "MISSING_ATTACHMENT",
      (value) => {
        value.values.attachmentInventory.totals.uniqueMissingAttachmentCandidates = 1;
      },
      RELEASE_SHA,
      "GATE_1MT_ATTACHMENT_MISSING_CANDIDATE_PRESENT",
    ],
    [
      "BROWSER_ARCHIVE",
      (value) => {
        value.values.browser.flows.archivedParentReturns404 = "FAIL";
      },
      RELEASE_SHA,
      "GATE_1MT_BROWSER_FLOW_FAILED",
    ],
    [
      "STALE_METRICS",
      (value) => {
        value.values.observability.capturedAt = "2026-08-23T08:00:00.000Z";
      },
      RELEASE_SHA,
      "GATE_1MT_OBSERVABILITY_EVIDENCE_STALE",
    ],
    [
      "P95_BREACH",
      (value) => {
        value.values.observability.apiP95Ms = 1501;
      },
      RELEASE_SHA,
      "GATE_1MT_API_P95_EXCEEDED",
    ],
    [
      "ROLLBACK_NOT_READY",
      (value) => {
        value.values.rollback.nMinusOneReady = false;
      },
      RELEASE_SHA,
      "GATE_1MT_ROLLBACK_NOT_READY",
    ],
  ];

  for (const [name, mutate, expectedReleaseSha, reasonCode] of cases) {
    await t.test(name, async (subtest) => {
      const value = await fixture(subtest);
      mutate(value);
      for (const evidenceName of Object.keys(value.values)) {
        await rewriteEvidence(value, evidenceName);
      }
      const result = await runGate1mtOperationalPreflight({
        expectedReleaseSha,
        manifest: value.manifest,
        now: () => NOW,
      });
      assert.deepEqual(
        { decision: result.decision, reasonCode: result.reasonCode },
        { decision: GATE_1MT_OPERATIONAL_PREFLIGHT_BLOCKED, reasonCode },
      );
    });
  }
});

test("rejects a changed evidence file even when its JSON still looks valid", async (t) => {
  const value = await fixture(t);
  value.values.browser.consoleErrorCount = 1;
  await writeFile(
    value.manifest.evidence.browser.path,
    `${JSON.stringify(value.values.browser)}\n`,
  );
  const result = await runGate1mtOperationalPreflight({
    expectedReleaseSha: RELEASE_SHA,
    manifest: value.manifest,
    now: () => NOW,
  });
  assert.equal(result.decision, GATE_1MT_OPERATIONAL_PREFLIGHT_BLOCKED);
  assert.equal(result.reasonCode, "GATE_1MT_BROWSER_EVIDENCE_DIGEST_MISMATCH");
});

test("rejects missing, duplicate, failed, or unapproved provider canaries", async (t) => {
  const value = await fixture(t, "PRODUCTION_GO_REVIEW");
  value.values.providerCanary.providers[1].duplicateDeliveries = 1;
  await rewriteEvidence(value, "providerCanary");
  const result = await runGate1mtOperationalPreflight({
    expectedReleaseSha: RELEASE_SHA,
    manifest: value.manifest,
    now: () => NOW,
  });
  assert.equal(result.decision, GATE_1MT_OPERATIONAL_PREFLIGHT_BLOCKED);
  assert.equal(result.reasonCode, "GATE_1MT_PROVIDER_DUPLICATE_PRESENT");
});

test("does not let a manifest relax the compiled policy or freshness window", async (t) => {
  const relaxed = await fixture(t);
  relaxed.manifest.thresholds.apiP95MsMax = 10000;
  const relaxedResult = await runGate1mtOperationalPreflight({
    expectedReleaseSha: RELEASE_SHA,
    manifest: relaxed.manifest,
    now: () => NOW,
  });
  assert.equal(relaxedResult.decision, GATE_1MT_OPERATIONAL_PREFLIGHT_BLOCKED);
  assert.equal(relaxedResult.reasonCode, "GATE_1MT_THRESHOLDS_POLICY_MISMATCH");

  const staleWindow = await fixture(t);
  staleWindow.manifest.evidenceMaxAgeSeconds = 3601;
  const staleWindowResult = await runGate1mtOperationalPreflight({
    expectedReleaseSha: RELEASE_SHA,
    manifest: staleWindow.manifest,
    now: () => NOW,
  });
  assert.equal(
    staleWindowResult.reasonCode,
    "GATE_1MT_EVIDENCE_MAX_AGE_INVALID",
  );
});

test("loads only an absolute bounded data-only manifest", async (t) => {
  const value = await fixture(t);
  const manifestSha256 = sha256(
    Buffer.from(`${JSON.stringify(value.manifest)}\n`, "utf8"),
  );
  const loaded = await loadGate1mtOperationalManifest(
    value.manifestPath,
    manifestSha256,
  );
  assert.equal(loaded.release.releaseSha, RELEASE_SHA);
  assert.ok(Object.isFrozen(loaded));
  await assert.rejects(
    loadGate1mtOperationalManifest(value.manifestPath, "f".repeat(64)),
    { reasonCode: "GATE_1MT_MANIFEST_DIGEST_MISMATCH" },
  );
  await assert.rejects(loadGate1mtOperationalManifest("relative.json"), {
    reasonCode: "GATE_1MT_MANIFEST_PATH_INVALID",
  });
});

test("CLI binds raw manifest bytes and the exact requested release", async (t) => {
  const value = await fixture(t);
  const freshCapturedAt = new Date().toISOString();
  value.values.attachmentInventory.snapshotStartedAt = freshCapturedAt;
  value.values.browser.capturedAt = freshCapturedAt;
  value.values.ciAdmission.capturedAt = freshCapturedAt;
  value.values.observability.capturedAt = freshCapturedAt;
  value.values.rollback.capturedAt = freshCapturedAt;
  for (const evidenceName of Object.keys(value.values)) {
    await rewriteEvidence(value, evidenceName);
  }
  await writeFile(value.manifestPath, `${JSON.stringify(value.manifest)}\n`);
  const manifestSha256 = sha256(
    Buffer.from(`${JSON.stringify(value.manifest)}\n`, "utf8"),
  );
  const { stdout } = await execFile(process.execPath, [
    CLI_PATH,
    "--manifest",
    value.manifestPath,
    "--expected-manifest-sha256",
    manifestSha256,
    "--expected-release-sha",
    RELEASE_SHA,
  ]);
  assert.equal(
    JSON.parse(stdout).decision,
    GATE_1MT_READY_FOR_CONTROLLED_CANARY,
  );

  await assert.rejects(
    execFile(process.execPath, [
      CLI_PATH,
      "--manifest",
      value.manifestPath,
      "--expected-manifest-sha256",
      "f".repeat(64),
      "--expected-release-sha",
      RELEASE_SHA,
    ]),
    (error) => {
      assert.equal(error.code, 1);
      assert.equal(
        JSON.parse(error.stdout).reasonCode,
        "GATE_1MT_MANIFEST_DIGEST_MISMATCH",
      );
      return true;
    },
  );
});

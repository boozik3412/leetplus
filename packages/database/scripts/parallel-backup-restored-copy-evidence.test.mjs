import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  PARALLEL_BACKUP_RESTORED_COPY_BOUND,
  PARALLEL_BACKUP_RESTORED_COPY_EVIDENCE_CONTRACT,
  PARALLEL_BACKUP_RESTORED_COPY_LIVE_EVIDENCE_CONTRACT,
  PARALLEL_BACKUP_RESTORED_COPY_PREPARED,
  ParallelBackupRestoredCopyEvidenceError,
  bindParallelBackupRestoredCopyEvidence,
  canonicalReceiptSha256,
  prepareParallelBackupRestoredCopyEvidence,
  verifyParallelBackupRestoredCopyEffectBinding,
} from "./parallel-backup-restored-copy-evidence.mjs";
import { main as cliMain } from "./parallel-backup-restored-copy-evidence.cli.mjs";

const RELEASE_SHA = "a".repeat(40);
const RELEASE_TREE_SHA = "c".repeat(40);
const RUNTIME_ARCHIVE_SHA256 = "e".repeat(64);
const OPERATION_ID = "11111111-1111-4111-8111-111111111111";

function candidateReceipt(overrides = {}) {
  return {
    schemaVersion: 1,
    receiptType: "LEETPLUS_RELEASE_CANDIDATE_RECEIPT_V1",
    releaseSha: RELEASE_SHA,
    releaseTreeSha: RELEASE_TREE_SHA,
    impactReceiptSha256: "d".repeat(64),
    effectiveLane: "L2_SCHEMA_SECURITY",
    runtimeArtifactEligible: true,
    eventName: "push",
    ref: "refs/heads/main",
    eventBeforeSha: "b".repeat(40),
    repository: "boozik3412/leetplus",
    workflowRef: "boozik3412/leetplus/.github/workflows/ci.yml@refs/heads/main",
    workflowSha: RELEASE_SHA,
    deployableCandidate: true,
    decision: "EXACT_MAIN_PUSH_DEPLOYABLE_CANDIDATE",
    ...overrides,
  };
}

function manifest(overrides = {}) {
  const candidate = candidateReceipt();
  const value = {
    schemaVersion: 2,
    contractVersion: PARALLEL_BACKUP_RESTORED_COPY_EVIDENCE_CONTRACT,
    operationId: OPERATION_ID,
    candidateReceiptSha256: canonicalReceiptSha256(candidate),
    runtimeCandidate: { archiveSha256: RUNTIME_ARCHIVE_SHA256 },
    backup: {
      capturedAt: "2026-09-02T10:00:00.000Z",
      backupReceiptSha256: "7".repeat(64),
      dumpSha256: "f".repeat(64),
      dumpSizeBytes: "1807168387",
      globalsSha256: "1".repeat(64),
      globalsSizeBytes: "4096",
      offHostCopyReceiptSha256: "8".repeat(64),
      offHostDumpSha256: "f".repeat(64),
      offHostGlobalsSha256: "1".repeat(64),
      sourceDatabaseEvidenceDigest: "2".repeat(64),
    },
    restoredCopy: {
      backupDumpSha256: "f".repeat(64),
      completedAt: "2026-09-02T10:10:00.000Z",
      migrationRehearsalReceiptSha256: "3".repeat(64),
      result: "PASS",
      runtimeAcceptanceReceiptSha256: "4".repeat(64),
      runtimeArchiveSha256: RUNTIME_ARCHIVE_SHA256,
      sourceDatabaseEvidenceDigest: "2".repeat(64),
    },
    topology: {
      contractSha256: "5".repeat(64),
      evidenceReceiptSha256: "6".repeat(64),
    },
    policy: {
      bindingTtlSeconds: 300,
      maxBackupAgeSeconds: 7200,
      maxLiveEvidenceAgeSeconds: 60,
      maxPreparationAgeSeconds: 3600,
    },
  };
  return {
    ...value,
    ...overrides,
    backup: { ...value.backup, ...(overrides.backup ?? {}) },
    restoredCopy: { ...value.restoredCopy, ...(overrides.restoredCopy ?? {}) },
    runtimeCandidate: { ...value.runtimeCandidate, ...(overrides.runtimeCandidate ?? {}) },
    topology: { ...value.topology, ...(overrides.topology ?? {}) },
    policy: { ...value.policy, ...(overrides.policy ?? {}) },
  };
}

function prepare(options = {}) {
  return prepareParallelBackupRestoredCopyEvidence({
    candidateReceipt: options.candidateReceipt ?? candidateReceipt(),
    manifest: options.manifest ?? manifest(),
    now: () => new Date(options.now ?? "2026-09-02T10:15:00.000Z"),
  });
}

function admissionReceipt(overrides = {}) {
  return {
    schemaVersion: 2,
    admission: "PASS",
    releaseSha: RELEASE_SHA,
    impactReceiptSha256: "d".repeat(64),
    effectiveLane: "L2_SCHEMA_SECURITY",
    runId: "33563003804",
    runAttempt: "1",
    repository: "boozik3412/leetplus",
    repositoryId: "123456789",
    workflowRef: "boozik3412/leetplus/.github/workflows/ci.yml@refs/heads/main",
    workflowSha: RELEASE_SHA,
    runtimeArtifactName: `leetplus-release-${RELEASE_SHA}-handoff-payload-33563003804-1`,
    runtimeArchiveSha256: RUNTIME_ARCHIVE_SHA256,
    productionControlArtifactName:
      `leetplus-production-control-${RELEASE_SHA}-handoff-payload-33563003804-1`,
    productionControlArchiveSha256: "8".repeat(64),
    runtimeArtifactId: "1001",
    runtimeTransportDigest: "9".repeat(64),
    productionControlArtifactId: "1002",
    productionControlTransportDigest: "0".repeat(64),
    ...overrides,
  };
}

function liveEvidence(admission, overrides = {}) {
  const admissionDigest = canonicalReceiptSha256(admission);
  const value = {
    schemaVersion: 1,
    contractVersion: PARALLEL_BACKUP_RESTORED_COPY_LIVE_EVIDENCE_CONTRACT,
    operationId: OPERATION_ID,
    checkedAt: "2026-09-02T10:19:30.000Z",
    release: {
      releaseSha: RELEASE_SHA,
      releaseTreeSha: RELEASE_TREE_SHA,
      runtimeArchiveSha256: RUNTIME_ARCHIVE_SHA256,
    },
    sourceDatabaseEvidenceDigest: "2".repeat(64),
    backup: {
      backupReceiptSha256: "7".repeat(64),
      dumpSha256: "f".repeat(64),
      dumpSizeBytes: "1807168387",
      globalsSha256: "1".repeat(64),
      globalsSizeBytes: "4096",
      offHostCopyReceiptSha256: "8".repeat(64),
      offHostDumpSha256: "f".repeat(64),
      offHostGlobalsSha256: "1".repeat(64),
    },
    restoredCopy: {
      migrationRehearsalReceiptSha256: "3".repeat(64),
      runtimeAcceptanceReceiptSha256: "4".repeat(64),
    },
    topology: {
      contractSha256: "5".repeat(64),
      evidenceReceiptSha256: "6".repeat(64),
    },
    installedProductionControl: {
      admissionReceiptSha256: admissionDigest,
      generationReceiptSha256: "7".repeat(64),
      productionControlArchiveSha256: "8".repeat(64),
      releaseSha: RELEASE_SHA,
      verification: "PASS",
    },
    pendingIntents: { controller: 0, cutover: 0, databaseEffect: 0 },
  };
  return {
    ...value,
    ...overrides,
    release: { ...value.release, ...(overrides.release ?? {}) },
    backup: { ...value.backup, ...(overrides.backup ?? {}) },
    restoredCopy: { ...value.restoredCopy, ...(overrides.restoredCopy ?? {}) },
    topology: { ...value.topology, ...(overrides.topology ?? {}) },
    installedProductionControl: {
      ...value.installedProductionControl,
      ...(overrides.installedProductionControl ?? {}),
    },
    pendingIntents: { ...value.pendingIntents, ...(overrides.pendingIntents ?? {}) },
  };
}

function bind(options = {}) {
  const admission = options.admissionReceipt ?? admissionReceipt();
  return bindParallelBackupRestoredCopyEvidence({
    admissionReceipt: admission,
    admissionReceiptSha256:
      options.admissionReceiptSha256 ?? canonicalReceiptSha256(admission),
    liveEvidence: options.liveEvidence ?? liveEvidence(admission),
    now: () => new Date(options.now ?? "2026-09-02T10:20:00.000Z"),
    preparationReceipt: options.preparationReceipt ?? prepare(),
  });
}

function reason(error) {
  assert.ok(error instanceof ParallelBackupRestoredCopyEvidenceError);
  return error.reasonCode;
}

test("prepares exact L2 candidate, backup and restored-copy evidence without effect authority", () => {
  const receipt = prepare();
  assert.equal(receipt.decision, PARALLEL_BACKUP_RESTORED_COPY_PREPARED);
  assert.equal(receipt.schemaVersion, 2);
  assert.equal(receipt.candidate.effectiveLane, "L2_SCHEMA_SECURITY");
  assert.equal(receipt.candidate.impactReceiptSha256, "d".repeat(64));
  assert.equal(receipt.candidate.releaseSha, RELEASE_SHA);
  assert.equal(receipt.candidate.runtimeArchiveSha256, RUNTIME_ARCHIVE_SHA256);
  assert.equal(receipt.expiresAt, "2026-09-02T11:15:00.000Z");
  assert.match(receipt.preparationDigest, /^[0-9a-f]{64}$/u);
  assert.ok(Object.isFrozen(receipt));
});

test("rejects a runtime-only candidate and a mismatched candidate digest", () => {
  const runtimeOnly = candidateReceipt({ effectiveLane: "L1_RUNTIME" });
  assert.throws(
    () => prepare({ candidateReceipt: runtimeOnly }),
    (error) => reason(error) === "PARALLEL_PREPARATION_CANDIDATE_RECEIPT_INVALID",
  );
  assert.throws(
    () => prepare({ manifest: manifest({ candidateReceiptSha256: "0".repeat(64) }) }),
    (error) => reason(error) === "PARALLEL_PREPARATION_CANDIDATE_BINDING_MISMATCH",
  );
});

test("rejects backup, off-host and restored-copy digest disagreement", () => {
  assert.throws(
    () => prepare({ manifest: manifest({ backup: { offHostDumpSha256: "0".repeat(64) } }) }),
    (error) => reason(error) === "PARALLEL_PREPARATION_EVIDENCE_MISMATCH",
  );
  assert.throws(
    () =>
      prepare({
        manifest: manifest({ restoredCopy: { runtimeArchiveSha256: "0".repeat(64) } }),
      }),
    (error) => reason(error) === "PARALLEL_PREPARATION_EVIDENCE_MISMATCH",
  );
});

test("rejects preparation outside the backup freshness window", () => {
  assert.throws(
    () => prepare({ now: "2026-09-02T12:00:00.001Z" }),
    (error) => reason(error) === "PARALLEL_PREPARATION_EVIDENCE_WINDOW_INVALID",
  );
});

test("binds exact final admission, live topology and zero pending intents", () => {
  const binding = bind();
  assert.equal(binding.decision, PARALLEL_BACKUP_RESTORED_COPY_BOUND);
  assert.equal(binding.schemaVersion, 2);
  assert.equal(binding.effectiveLane, "L2_SCHEMA_SECURITY");
  assert.equal(binding.impactReceiptSha256, "d".repeat(64));
  assert.equal(binding.expiresAt, "2026-09-02T10:25:00.000Z");
  assert.match(binding.effectBindingDigest, /^[0-9a-f]{64}$/u);
  const admission = admissionReceipt();
  const verified = verifyParallelBackupRestoredCopyEffectBinding({
    admissionReceipt: admission,
    admissionReceiptSha256: canonicalReceiptSha256(admission),
    binding,
    liveEvidence: liveEvidence(admission),
    now: () => new Date("2026-09-02T10:22:00.000Z"),
    preparationReceipt: prepare(),
  });
  assert.equal(verified.effectBindingDigest, binding.effectBindingDigest);
});

test("requires final-admission schema 2, L2 and the exact candidate impact receipt", () => {
  for (const admission of [
    admissionReceipt({ schemaVersion: 1 }),
    admissionReceipt({ effectiveLane: "L1_RUNTIME" }),
    admissionReceipt({ impactReceiptSha256: undefined }),
  ]) {
    assert.throws(
      () => bind({ admissionReceipt: admission, liveEvidence: liveEvidence(admission) }),
      (error) => reason(error) === "PARALLEL_PREPARATION_ADMISSION_RECEIPT_INVALID",
    );
  }

  const driftedAdmission = admissionReceipt({ impactReceiptSha256: "a".repeat(64) });
  assert.throws(
    () =>
      bind({
        admissionReceipt: driftedAdmission,
        liveEvidence: liveEvidence(driftedAdmission),
      }),
    (error) => reason(error) === "PARALLEL_PREPARATION_PRE_EFFECT_DRIFT",
  );
});

test("rejects missing or non-L2 impact evidence before preparation", () => {
  for (const candidate of [
    candidateReceipt({ impactReceiptSha256: undefined }),
    candidateReceipt({ effectiveLane: "L1_RUNTIME" }),
  ]) {
    assert.throws(
      () => prepare({ candidateReceipt: candidate }),
      (error) => reason(error) === "PARALLEL_PREPARATION_CANDIDATE_RECEIPT_INVALID",
    );
  }
});

test("rejects final admission for different runtime bytes", () => {
  const admission = admissionReceipt({ runtimeArchiveSha256: "1".repeat(64) });
  assert.throws(
    () =>
      bind({
        admissionReceipt: admission,
        liveEvidence: liveEvidence(admission),
      }),
    (error) => reason(error) === "PARALLEL_PREPARATION_PRE_EFFECT_DRIFT",
  );
});

test("rejects independent admission digest mismatch", () => {
  assert.throws(
    () => bind({ admissionReceiptSha256: "1".repeat(64) }),
    (error) => reason(error) === "PARALLEL_PREPARATION_ADMISSION_DIGEST_MISMATCH",
  );
});

test("rejects live database, backup and topology drift", () => {
  const admission = admissionReceipt();
  for (const evidence of [
    liveEvidence(admission, { sourceDatabaseEvidenceDigest: "a".repeat(64) }),
    liveEvidence(admission, { backup: { backupReceiptSha256: "a".repeat(64) } }),
    liveEvidence(admission, { backup: { dumpSizeBytes: "1807168388" } }),
    liveEvidence(admission, {
      restoredCopy: { runtimeAcceptanceReceiptSha256: "a".repeat(64) },
    }),
    liveEvidence(admission, { topology: { evidenceReceiptSha256: "a".repeat(64) } }),
    liveEvidence(admission, {
      installedProductionControl: { productionControlArchiveSha256: "a".repeat(64) },
    }),
  ]) {
    assert.throws(
      () => bind({ admissionReceipt: admission, liveEvidence: evidence }),
      (error) => reason(error) === "PARALLEL_PREPARATION_PRE_EFFECT_DRIFT",
    );
  }
});

test("rejects any pending controller, cutover or database effect intent", () => {
  const admission = admissionReceipt();
  for (const key of ["controller", "cutover", "databaseEffect"]) {
    assert.throws(
      () =>
        bind({
          admissionReceipt: admission,
          liveEvidence: liveEvidence(admission, { pendingIntents: { [key]: 1 } }),
        }),
      (error) => reason(error) === "PARALLEL_PREPARATION_LIVE_EVIDENCE_INVALID",
    );
  }
});

test("rejects stale live evidence and an expired preparation", () => {
  const admission = admissionReceipt();
  assert.throws(
    () =>
      bind({
        admissionReceipt: admission,
        liveEvidence: liveEvidence(admission, { checkedAt: "2026-09-02T10:18:59.999Z" }),
      }),
    (error) => reason(error) === "PARALLEL_PREPARATION_PRE_EFFECT_WINDOW_INVALID",
  );
  assert.throws(
    () => bind({ now: "2026-09-02T11:15:00.000Z" }),
    (error) => reason(error) === "PARALLEL_PREPARATION_PRE_EFFECT_WINDOW_INVALID",
  );
});

test("detects tampered preparation and binding digests", () => {
  const preparation = structuredClone(prepare());
  preparation.backup.dumpSizeBytes = "1807168388";
  assert.throws(
    () => bind({ preparationReceipt: preparation }),
    (error) => reason(error) === "PARALLEL_PREPARATION_RECEIPT_DIGEST_MISMATCH",
  );
  const binding = structuredClone(bind());
  binding.expiresAt = "2026-09-02T10:25:01.000Z";
  const admission = admissionReceipt();
  assert.throws(
    () =>
      verifyParallelBackupRestoredCopyEffectBinding({
        admissionReceipt: admission,
        admissionReceiptSha256: canonicalReceiptSha256(admission),
        binding,
        liveEvidence: liveEvidence(admission),
        now: () => new Date("2026-09-02T10:22:00.000Z"),
        preparationReceipt: prepare(),
      }),
    (error) => reason(error) === "PARALLEL_PREPARATION_EFFECT_BINDING_DIGEST_MISMATCH",
  );
});

test("rejects a previously valid binding after its short TTL", () => {
  const binding = bind();
  const admission = admissionReceipt();
  assert.throws(
    () =>
      verifyParallelBackupRestoredCopyEffectBinding({
        admissionReceipt: admission,
        admissionReceiptSha256: canonicalReceiptSha256(admission),
        binding,
        liveEvidence: liveEvidence(admission),
        now: () => new Date(binding.expiresAt),
        preparationReceipt: prepare(),
      }),
    (error) => reason(error) === "PARALLEL_PREPARATION_EFFECT_BINDING_EXPIRED",
  );
});

test("CLI writes canonical prepare/bind receipts and verifies the same binding", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "leetplus-parallel-evidence-"));
  try {
    const now = new Date();
    const capturedAt = new Date(now.valueOf() - 120_000).toISOString();
    const completedAt = new Date(now.valueOf() - 60_000).toISOString();
    const checkedAt = new Date(now.valueOf() - 1_000).toISOString();
    const candidate = candidateReceipt();
    const preparationManifest = manifest({
      backup: { capturedAt },
      restoredCopy: { completedAt },
    });
    const admission = admissionReceipt();
    const live = liveEvidence(admission, { checkedAt });
    const paths = Object.fromEntries(
      ["candidate", "manifest", "preparation", "admission", "live", "binding"].map((name) => [
        name,
        path.join(directory, `${name}.json`),
      ]),
    );
    for (const [filePath, value] of [
      [paths.candidate, candidate],
      [paths.manifest, preparationManifest],
      [paths.admission, admission],
      [paths.live, live],
    ]) {
      await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
    }
    assert.equal(
      await cliMain([
        "--mode",
        "prepare",
        "--manifest",
        paths.manifest,
        "--candidate-receipt",
        paths.candidate,
        "--output",
        paths.preparation,
      ]),
      0,
    );
    assert.equal(
      await cliMain([
        "--mode",
        "bind",
        "--preparation",
        paths.preparation,
        "--admission-receipt",
        paths.admission,
        "--live-evidence",
        paths.live,
        "--output",
        paths.binding,
      ]),
      0,
    );
    assert.equal(
      await cliMain([
        "--mode",
        "verify",
        "--preparation",
        paths.preparation,
        "--admission-receipt",
        paths.admission,
        "--live-evidence",
        paths.live,
        "--binding",
        paths.binding,
      ]),
      0,
    );
    const preparation = JSON.parse(await readFile(paths.preparation, "utf8"));
    const binding = JSON.parse(await readFile(paths.binding, "utf8"));
    assert.equal(preparation.decision, PARALLEL_BACKUP_RESTORED_COPY_PREPARED);
    assert.equal(binding.decision, PARALLEL_BACKUP_RESTORED_COPY_BOUND);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

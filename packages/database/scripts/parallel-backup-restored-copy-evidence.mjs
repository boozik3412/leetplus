import { createHash, timingSafeEqual } from "node:crypto";

export const PARALLEL_BACKUP_RESTORED_COPY_EVIDENCE_CONTRACT =
  "LEETPLUS_PARALLEL_BACKUP_RESTORED_COPY_EVIDENCE_V1";
export const PARALLEL_BACKUP_RESTORED_COPY_LIVE_EVIDENCE_CONTRACT =
  "LEETPLUS_PARALLEL_BACKUP_RESTORED_COPY_LIVE_EVIDENCE_V1";
export const PARALLEL_BACKUP_RESTORED_COPY_PREPARED =
  "PREPARED_NOT_EFFECT_AUTHORIZATION";
export const PARALLEL_BACKUP_RESTORED_COPY_BOUND =
  "PRE_EFFECT_EVIDENCE_BOUND_NOT_AUTHORIZATION";

const RELEASE_CANDIDATE_CONTRACT = "LEETPLUS_RELEASE_CANDIDATE_RECEIPT_V1";
const EXPECTED_REPOSITORY = "boozik3412/leetplus";
const EXPECTED_WORKFLOW_REF =
  "boozik3412/leetplus/.github/workflows/ci.yml@refs/heads/main";
const SHA40 = /^[0-9a-f]{40}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const POSITIVE_INTEGER_STRING = /^[1-9][0-9]{0,19}$/u;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export class ParallelBackupRestoredCopyEvidenceError extends Error {
  constructor(reasonCode) {
    super(reasonCode);
    this.name = "ParallelBackupRestoredCopyEvidenceError";
    this.reasonCode = reasonCode;
    this.safeContractError = true;
  }
}

function fail(reasonCode) {
  throw new ParallelBackupRestoredCopyEvidenceError(reasonCode);
}

function exactRecord(value, keys, reasonCode) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.keys(value).sort().join("\0") !== [...keys].sort().join("\0")
  ) {
    fail(reasonCode);
  }
  return value;
}

function exactString(value, pattern, reasonCode) {
  if (typeof value !== "string" || value.trim() !== value || !pattern.test(value)) {
    fail(reasonCode);
  }
  return value;
}

function exactInteger(value, minimum, maximum, reasonCode) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail(reasonCode);
  }
  return value;
}

function parseTimestamp(value, reasonCode) {
  exactString(value, ISO_TIMESTAMP, reasonCode);
  const date = new Date(value);
  if (!Number.isFinite(date.valueOf()) || date.toISOString() !== value) fail(reasonCode);
  return date;
}

function currentDate(now) {
  const value = now();
  if (!(value instanceof Date) || !Number.isFinite(value.valueOf())) {
    fail("PARALLEL_PREPARATION_CLOCK_INVALID");
  }
  return value;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function digest(domain, value) {
  return sha256(
    `${PARALLEL_BACKUP_RESTORED_COPY_EVIDENCE_CONTRACT}\0${domain}\0${stableJson(value)}`,
  );
}

function safeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

export function canonicalReceiptSha256(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail("PARALLEL_PREPARATION_RECEIPT_INVALID");
  }
  return sha256(`${JSON.stringify(value, null, 2)}\n`);
}

function normalizeReleaseCandidateReceipt(value) {
  const receipt = exactRecord(
    value,
    [
      "schemaVersion",
      "receiptType",
      "releaseSha",
      "releaseTreeSha",
      "impactReceiptSha256",
      "effectiveLane",
      "runtimeArtifactEligible",
      "eventName",
      "ref",
      "eventBeforeSha",
      "repository",
      "workflowRef",
      "workflowSha",
      "deployableCandidate",
      "decision",
    ],
    "PARALLEL_PREPARATION_CANDIDATE_RECEIPT_INVALID",
  );
  if (
    receipt.schemaVersion !== 1 ||
    receipt.receiptType !== RELEASE_CANDIDATE_CONTRACT ||
    receipt.effectiveLane !== "L2_SCHEMA_SECURITY" ||
    receipt.runtimeArtifactEligible !== true ||
    receipt.eventName !== "push" ||
    receipt.ref !== "refs/heads/main" ||
    receipt.repository !== EXPECTED_REPOSITORY ||
    receipt.workflowRef !== EXPECTED_WORKFLOW_REF ||
    receipt.deployableCandidate !== true ||
    receipt.decision !== "EXACT_MAIN_PUSH_DEPLOYABLE_CANDIDATE" ||
    ![receipt.releaseSha, receipt.releaseTreeSha, receipt.eventBeforeSha].every((value) =>
      SHA40.test(value ?? ""),
    ) ||
    !SHA256.test(receipt.impactReceiptSha256 ?? "") ||
    receipt.workflowSha !== receipt.releaseSha
  ) {
    fail("PARALLEL_PREPARATION_CANDIDATE_RECEIPT_INVALID");
  }
  return freeze({ ...receipt });
}

function normalizeFinalAdmissionReceipt(value) {
  const receipt = exactRecord(
    value,
    [
      "schemaVersion",
      "admission",
      "releaseSha",
      "runId",
      "runAttempt",
      "repository",
      "repositoryId",
      "workflowRef",
      "workflowSha",
      "runtimeArtifactName",
      "runtimeArchiveSha256",
      "productionControlArtifactName",
      "productionControlArchiveSha256",
      "runtimeArtifactId",
      "runtimeTransportDigest",
      "productionControlArtifactId",
      "productionControlTransportDigest",
    ],
    "PARALLEL_PREPARATION_ADMISSION_RECEIPT_INVALID",
  );
  if (
    receipt.schemaVersion !== 1 ||
    receipt.admission !== "PASS" ||
    receipt.repository !== EXPECTED_REPOSITORY ||
    receipt.workflowRef !== EXPECTED_WORKFLOW_REF ||
    !SHA40.test(receipt.releaseSha ?? "") ||
    receipt.workflowSha !== receipt.releaseSha ||
    ![receipt.runId, receipt.runAttempt, receipt.repositoryId, receipt.runtimeArtifactId,
      receipt.productionControlArtifactId].every((value) => POSITIVE_INTEGER_STRING.test(value ?? "")) ||
    ![
      receipt.runtimeArchiveSha256,
      receipt.productionControlArchiveSha256,
      receipt.runtimeTransportDigest,
      receipt.productionControlTransportDigest,
    ].every((value) => SHA256.test(value ?? "")) ||
    receipt.runtimeArtifactName !==
      `leetplus-release-${receipt.releaseSha}-handoff-payload-${receipt.runId}-${receipt.runAttempt}` ||
    receipt.productionControlArtifactName !==
      `leetplus-production-control-${receipt.releaseSha}-handoff-payload-${receipt.runId}-${receipt.runAttempt}`
  ) {
    fail("PARALLEL_PREPARATION_ADMISSION_RECEIPT_INVALID");
  }
  return freeze({ ...receipt });
}

function normalizePreparationManifest(value) {
  const manifest = exactRecord(
    value,
    [
      "backup",
      "candidateReceiptSha256",
      "contractVersion",
      "operationId",
      "policy",
      "restoredCopy",
      "runtimeCandidate",
      "schemaVersion",
      "topology",
    ],
    "PARALLEL_PREPARATION_MANIFEST_INVALID",
  );
  if (
    manifest.schemaVersion !== 1 ||
    manifest.contractVersion !== PARALLEL_BACKUP_RESTORED_COPY_EVIDENCE_CONTRACT ||
    !UUID.test(manifest.operationId ?? "") ||
    !SHA256.test(manifest.candidateReceiptSha256 ?? "")
  ) {
    fail("PARALLEL_PREPARATION_MANIFEST_INVALID");
  }
  const runtimeCandidate = exactRecord(
    manifest.runtimeCandidate,
    ["archiveSha256"],
    "PARALLEL_PREPARATION_RUNTIME_CANDIDATE_INVALID",
  );
  const backup = exactRecord(
    manifest.backup,
    [
      "capturedAt",
      "backupReceiptSha256",
      "dumpSha256",
      "dumpSizeBytes",
      "globalsSha256",
      "globalsSizeBytes",
      "offHostCopyReceiptSha256",
      "offHostDumpSha256",
      "offHostGlobalsSha256",
      "sourceDatabaseEvidenceDigest",
    ],
    "PARALLEL_PREPARATION_BACKUP_INVALID",
  );
  const restoredCopy = exactRecord(
    manifest.restoredCopy,
    [
      "backupDumpSha256",
      "completedAt",
      "migrationRehearsalReceiptSha256",
      "result",
      "runtimeAcceptanceReceiptSha256",
      "runtimeArchiveSha256",
      "sourceDatabaseEvidenceDigest",
    ],
    "PARALLEL_PREPARATION_RESTORED_COPY_INVALID",
  );
  const topology = exactRecord(
    manifest.topology,
    ["contractSha256", "evidenceReceiptSha256"],
    "PARALLEL_PREPARATION_TOPOLOGY_INVALID",
  );
  const policy = exactRecord(
    manifest.policy,
    [
      "bindingTtlSeconds",
      "maxBackupAgeSeconds",
      "maxLiveEvidenceAgeSeconds",
      "maxPreparationAgeSeconds",
    ],
    "PARALLEL_PREPARATION_POLICY_INVALID",
  );
  if (
    !SHA256.test(runtimeCandidate.archiveSha256 ?? "") ||
    ![
      backup.dumpSha256,
      backup.backupReceiptSha256,
      backup.globalsSha256,
      backup.offHostCopyReceiptSha256,
      backup.offHostDumpSha256,
      backup.offHostGlobalsSha256,
      backup.sourceDatabaseEvidenceDigest,
      restoredCopy.backupDumpSha256,
      restoredCopy.migrationRehearsalReceiptSha256,
      restoredCopy.runtimeAcceptanceReceiptSha256,
      restoredCopy.runtimeArchiveSha256,
      restoredCopy.sourceDatabaseEvidenceDigest,
      topology.contractSha256,
      topology.evidenceReceiptSha256,
    ].every((value) => SHA256.test(value ?? "")) ||
    ![backup.dumpSizeBytes, backup.globalsSizeBytes].every((value) =>
      POSITIVE_INTEGER_STRING.test(value ?? ""),
    ) ||
    restoredCopy.result !== "PASS" ||
    backup.dumpSha256 !== backup.offHostDumpSha256 ||
    backup.globalsSha256 !== backup.offHostGlobalsSha256 ||
    backup.dumpSha256 !== restoredCopy.backupDumpSha256 ||
    backup.sourceDatabaseEvidenceDigest !== restoredCopy.sourceDatabaseEvidenceDigest ||
    runtimeCandidate.archiveSha256 !== restoredCopy.runtimeArchiveSha256
  ) {
    fail("PARALLEL_PREPARATION_EVIDENCE_MISMATCH");
  }
  parseTimestamp(backup.capturedAt, "PARALLEL_PREPARATION_BACKUP_TIME_INVALID");
  parseTimestamp(restoredCopy.completedAt, "PARALLEL_PREPARATION_RESTORED_COPY_TIME_INVALID");
  exactInteger(policy.maxBackupAgeSeconds, 300, 86_400, "PARALLEL_PREPARATION_POLICY_INVALID");
  exactInteger(
    policy.maxPreparationAgeSeconds,
    300,
    43_200,
    "PARALLEL_PREPARATION_POLICY_INVALID",
  );
  exactInteger(
    policy.maxLiveEvidenceAgeSeconds,
    5,
    300,
    "PARALLEL_PREPARATION_POLICY_INVALID",
  );
  exactInteger(policy.bindingTtlSeconds, 30, 600, "PARALLEL_PREPARATION_POLICY_INVALID");
  return freeze({
    backup: { ...backup },
    candidateReceiptSha256: manifest.candidateReceiptSha256,
    contractVersion: manifest.contractVersion,
    operationId: manifest.operationId,
    policy: { ...policy },
    restoredCopy: { ...restoredCopy },
    runtimeCandidate: { ...runtimeCandidate },
    schemaVersion: manifest.schemaVersion,
    topology: { ...topology },
  });
}

function normalizePreparationReceipt(value) {
  const receipt = exactRecord(
    value,
    [
      "backup",
      "candidate",
      "contractVersion",
      "decision",
      "expiresAt",
      "operationId",
      "policy",
      "preparationDigest",
      "preparedAt",
      "restoredCopy",
      "schemaVersion",
      "topology",
    ],
    "PARALLEL_PREPARATION_RECEIPT_INVALID",
  );
  const candidate = exactRecord(
    receipt.candidate,
    ["candidateReceiptSha256", "releaseSha", "releaseTreeSha", "runtimeArchiveSha256"],
    "PARALLEL_PREPARATION_RECEIPT_INVALID",
  );
  if (
    receipt.schemaVersion !== 1 ||
    receipt.contractVersion !== PARALLEL_BACKUP_RESTORED_COPY_EVIDENCE_CONTRACT ||
    receipt.decision !== PARALLEL_BACKUP_RESTORED_COPY_PREPARED ||
    !UUID.test(receipt.operationId ?? "") ||
    ![candidate.candidateReceiptSha256, candidate.runtimeArchiveSha256,
      receipt.preparationDigest].every((value) => SHA256.test(value ?? "")) ||
    ![candidate.releaseSha, candidate.releaseTreeSha].every((value) => SHA40.test(value ?? ""))
  ) {
    fail("PARALLEL_PREPARATION_RECEIPT_INVALID");
  }
  parseTimestamp(receipt.preparedAt, "PARALLEL_PREPARATION_RECEIPT_INVALID");
  parseTimestamp(receipt.expiresAt, "PARALLEL_PREPARATION_RECEIPT_INVALID");
  const manifest = normalizePreparationManifest({
    backup: receipt.backup,
    candidateReceiptSha256: candidate.candidateReceiptSha256,
    contractVersion: receipt.contractVersion,
    operationId: receipt.operationId,
    policy: receipt.policy,
    restoredCopy: receipt.restoredCopy,
    runtimeCandidate: { archiveSha256: candidate.runtimeArchiveSha256 },
    schemaVersion: receipt.schemaVersion,
    topology: receipt.topology,
  });
  const { preparationDigest, ...base } = receipt;
  if (!safeEqual(preparationDigest, digest("preparation", base))) {
    fail("PARALLEL_PREPARATION_RECEIPT_DIGEST_MISMATCH");
  }
  return freeze({
    ...receipt,
    backup: { ...manifest.backup },
    candidate: { ...candidate },
    policy: { ...manifest.policy },
    restoredCopy: { ...manifest.restoredCopy },
    topology: { ...manifest.topology },
  });
}

function normalizeLiveEvidence(value) {
  const evidence = exactRecord(
    value,
    [
      "backup",
      "checkedAt",
      "contractVersion",
      "installedProductionControl",
      "operationId",
      "pendingIntents",
      "release",
      "restoredCopy",
      "schemaVersion",
      "sourceDatabaseEvidenceDigest",
      "topology",
    ],
    "PARALLEL_PREPARATION_LIVE_EVIDENCE_INVALID",
  );
  const release = exactRecord(
    evidence.release,
    ["releaseSha", "releaseTreeSha", "runtimeArchiveSha256"],
    "PARALLEL_PREPARATION_LIVE_EVIDENCE_INVALID",
  );
  const backup = exactRecord(
    evidence.backup,
    [
      "backupReceiptSha256",
      "dumpSha256",
      "dumpSizeBytes",
      "globalsSha256",
      "globalsSizeBytes",
      "offHostCopyReceiptSha256",
      "offHostDumpSha256",
      "offHostGlobalsSha256",
    ],
    "PARALLEL_PREPARATION_LIVE_EVIDENCE_INVALID",
  );
  const restoredCopy = exactRecord(
    evidence.restoredCopy,
    ["migrationRehearsalReceiptSha256", "runtimeAcceptanceReceiptSha256"],
    "PARALLEL_PREPARATION_LIVE_EVIDENCE_INVALID",
  );
  const topology = exactRecord(
    evidence.topology,
    ["contractSha256", "evidenceReceiptSha256"],
    "PARALLEL_PREPARATION_LIVE_EVIDENCE_INVALID",
  );
  const installedProductionControl = exactRecord(
    evidence.installedProductionControl,
    [
      "admissionReceiptSha256",
      "generationReceiptSha256",
      "productionControlArchiveSha256",
      "releaseSha",
      "verification",
    ],
    "PARALLEL_PREPARATION_LIVE_EVIDENCE_INVALID",
  );
  const pendingIntents = exactRecord(
    evidence.pendingIntents,
    ["controller", "cutover", "databaseEffect"],
    "PARALLEL_PREPARATION_LIVE_EVIDENCE_INVALID",
  );
  if (
    evidence.schemaVersion !== 1 ||
    evidence.contractVersion !== PARALLEL_BACKUP_RESTORED_COPY_LIVE_EVIDENCE_CONTRACT ||
    !UUID.test(evidence.operationId ?? "") ||
    ![release.releaseSha, release.releaseTreeSha, installedProductionControl.releaseSha].every(
      (value) => SHA40.test(value ?? ""),
    ) ||
    ![
      release.runtimeArchiveSha256,
      backup.backupReceiptSha256,
      backup.dumpSha256,
      backup.globalsSha256,
      backup.offHostCopyReceiptSha256,
      backup.offHostDumpSha256,
      backup.offHostGlobalsSha256,
      evidence.sourceDatabaseEvidenceDigest,
      restoredCopy.migrationRehearsalReceiptSha256,
      restoredCopy.runtimeAcceptanceReceiptSha256,
      topology.contractSha256,
      topology.evidenceReceiptSha256,
      installedProductionControl.admissionReceiptSha256,
      installedProductionControl.generationReceiptSha256,
      installedProductionControl.productionControlArchiveSha256,
    ].every((value) => SHA256.test(value ?? "")) ||
    ![backup.dumpSizeBytes, backup.globalsSizeBytes].every((value) =>
      POSITIVE_INTEGER_STRING.test(value ?? ""),
    ) ||
    installedProductionControl.verification !== "PASS" ||
    ![pendingIntents.controller, pendingIntents.cutover, pendingIntents.databaseEffect].every(
      (value) => value === 0,
    )
  ) {
    fail("PARALLEL_PREPARATION_LIVE_EVIDENCE_INVALID");
  }
  parseTimestamp(evidence.checkedAt, "PARALLEL_PREPARATION_LIVE_EVIDENCE_INVALID");
  return freeze({
    ...evidence,
    backup: { ...backup },
    installedProductionControl: { ...installedProductionControl },
    pendingIntents: { ...pendingIntents },
    release: { ...release },
    restoredCopy: { ...restoredCopy },
    topology: { ...topology },
  });
}

export function prepareParallelBackupRestoredCopyEvidence({
  candidateReceipt: rawCandidateReceipt,
  manifest: rawManifest,
  now = () => new Date(),
}) {
  const preparedAt = currentDate(now);
  const candidateReceipt = normalizeReleaseCandidateReceipt(rawCandidateReceipt);
  const manifest = normalizePreparationManifest(rawManifest);
  if (
    !safeEqual(manifest.candidateReceiptSha256, canonicalReceiptSha256(candidateReceipt)) ||
    candidateReceipt.releaseSha === candidateReceipt.eventBeforeSha
  ) {
    fail("PARALLEL_PREPARATION_CANDIDATE_BINDING_MISMATCH");
  }
  const capturedAt = parseTimestamp(
    manifest.backup.capturedAt,
    "PARALLEL_PREPARATION_BACKUP_TIME_INVALID",
  );
  const completedAt = parseTimestamp(
    manifest.restoredCopy.completedAt,
    "PARALLEL_PREPARATION_RESTORED_COPY_TIME_INVALID",
  );
  if (
    capturedAt > completedAt ||
    completedAt > preparedAt ||
    preparedAt.valueOf() - capturedAt.valueOf() > manifest.policy.maxBackupAgeSeconds * 1000 ||
    preparedAt.valueOf() - completedAt.valueOf() >
      manifest.policy.maxPreparationAgeSeconds * 1000
  ) {
    fail("PARALLEL_PREPARATION_EVIDENCE_WINDOW_INVALID");
  }
  const expiresAt = new Date(
    Math.min(
      capturedAt.valueOf() + manifest.policy.maxBackupAgeSeconds * 1000,
      preparedAt.valueOf() + manifest.policy.maxPreparationAgeSeconds * 1000,
    ),
  );
  if (expiresAt <= preparedAt) fail("PARALLEL_PREPARATION_EVIDENCE_WINDOW_INVALID");
  const base = {
    backup: manifest.backup,
    candidate: {
      candidateReceiptSha256: manifest.candidateReceiptSha256,
      releaseSha: candidateReceipt.releaseSha,
      releaseTreeSha: candidateReceipt.releaseTreeSha,
      runtimeArchiveSha256: manifest.runtimeCandidate.archiveSha256,
    },
    contractVersion: PARALLEL_BACKUP_RESTORED_COPY_EVIDENCE_CONTRACT,
    decision: PARALLEL_BACKUP_RESTORED_COPY_PREPARED,
    expiresAt: expiresAt.toISOString(),
    operationId: manifest.operationId,
    policy: manifest.policy,
    preparedAt: preparedAt.toISOString(),
    restoredCopy: manifest.restoredCopy,
    schemaVersion: 1,
    topology: manifest.topology,
  };
  return normalizePreparationReceipt({
    ...base,
    preparationDigest: digest("preparation", base),
  });
}

function assertLiveBinding(preparation, admission, admissionReceiptSha256, live) {
  if (
    admission.releaseSha !== preparation.candidate.releaseSha ||
    admission.runtimeArchiveSha256 !== preparation.candidate.runtimeArchiveSha256 ||
    live.operationId !== preparation.operationId ||
    live.release.releaseSha !== preparation.candidate.releaseSha ||
    live.release.releaseTreeSha !== preparation.candidate.releaseTreeSha ||
    live.release.runtimeArchiveSha256 !== preparation.candidate.runtimeArchiveSha256 ||
    live.sourceDatabaseEvidenceDigest !== preparation.backup.sourceDatabaseEvidenceDigest ||
    live.backup.backupReceiptSha256 !== preparation.backup.backupReceiptSha256 ||
    live.backup.dumpSha256 !== preparation.backup.dumpSha256 ||
    live.backup.dumpSizeBytes !== preparation.backup.dumpSizeBytes ||
    live.backup.globalsSha256 !== preparation.backup.globalsSha256 ||
    live.backup.globalsSizeBytes !== preparation.backup.globalsSizeBytes ||
    live.backup.offHostCopyReceiptSha256 !== preparation.backup.offHostCopyReceiptSha256 ||
    live.backup.offHostDumpSha256 !== preparation.backup.offHostDumpSha256 ||
    live.backup.offHostGlobalsSha256 !== preparation.backup.offHostGlobalsSha256 ||
    live.restoredCopy.migrationRehearsalReceiptSha256 !==
      preparation.restoredCopy.migrationRehearsalReceiptSha256 ||
    live.restoredCopy.runtimeAcceptanceReceiptSha256 !==
      preparation.restoredCopy.runtimeAcceptanceReceiptSha256 ||
    live.topology.contractSha256 !== preparation.topology.contractSha256 ||
    live.topology.evidenceReceiptSha256 !== preparation.topology.evidenceReceiptSha256 ||
    live.installedProductionControl.releaseSha !== preparation.candidate.releaseSha ||
    live.installedProductionControl.admissionReceiptSha256 !== admissionReceiptSha256 ||
    live.installedProductionControl.productionControlArchiveSha256 !==
      admission.productionControlArchiveSha256
  ) {
    fail("PARALLEL_PREPARATION_PRE_EFFECT_DRIFT");
  }
}

export function bindParallelBackupRestoredCopyEvidence({
  admissionReceipt: rawAdmissionReceipt,
  admissionReceiptSha256,
  liveEvidence: rawLiveEvidence,
  now = () => new Date(),
  preparationReceipt: rawPreparationReceipt,
}) {
  const boundAt = currentDate(now);
  const preparation = normalizePreparationReceipt(rawPreparationReceipt);
  const admission = normalizeFinalAdmissionReceipt(rawAdmissionReceipt);
  const live = normalizeLiveEvidence(rawLiveEvidence);
  exactString(
    admissionReceiptSha256,
    SHA256,
    "PARALLEL_PREPARATION_ADMISSION_RECEIPT_INVALID",
  );
  if (!safeEqual(admissionReceiptSha256, canonicalReceiptSha256(admission))) {
    fail("PARALLEL_PREPARATION_ADMISSION_DIGEST_MISMATCH");
  }
  const preparedExpiry = parseTimestamp(
    preparation.expiresAt,
    "PARALLEL_PREPARATION_RECEIPT_INVALID",
  );
  const capturedAt = parseTimestamp(
    preparation.backup.capturedAt,
    "PARALLEL_PREPARATION_RECEIPT_INVALID",
  );
  const checkedAt = parseTimestamp(
    live.checkedAt,
    "PARALLEL_PREPARATION_LIVE_EVIDENCE_INVALID",
  );
  if (
    boundAt >= preparedExpiry ||
    checkedAt > boundAt ||
    boundAt.valueOf() - checkedAt.valueOf() >
      preparation.policy.maxLiveEvidenceAgeSeconds * 1000 ||
    boundAt.valueOf() - capturedAt.valueOf() >
      preparation.policy.maxBackupAgeSeconds * 1000
  ) {
    fail("PARALLEL_PREPARATION_PRE_EFFECT_WINDOW_INVALID");
  }
  assertLiveBinding(preparation, admission, admissionReceiptSha256, live);
  const expiresAt = new Date(
    Math.min(
      preparedExpiry.valueOf(),
      boundAt.valueOf() + preparation.policy.bindingTtlSeconds * 1000,
    ),
  );
  const base = {
    admissionReceiptSha256,
    boundAt: boundAt.toISOString(),
    contractVersion: PARALLEL_BACKUP_RESTORED_COPY_EVIDENCE_CONTRACT,
    decision: PARALLEL_BACKUP_RESTORED_COPY_BOUND,
    expiresAt: expiresAt.toISOString(),
    liveEvidenceDigest: digest("live-evidence", live),
    operationId: preparation.operationId,
    preparationDigest: preparation.preparationDigest,
    releaseSha: preparation.candidate.releaseSha,
    runtimeArchiveSha256: preparation.candidate.runtimeArchiveSha256,
    schemaVersion: 1,
  };
  return freeze({ ...base, effectBindingDigest: digest("effect-binding", base) });
}

function normalizeEffectBinding(value) {
  const binding = exactRecord(
    value,
    [
      "admissionReceiptSha256",
      "boundAt",
      "contractVersion",
      "decision",
      "effectBindingDigest",
      "expiresAt",
      "liveEvidenceDigest",
      "operationId",
      "preparationDigest",
      "releaseSha",
      "runtimeArchiveSha256",
      "schemaVersion",
    ],
    "PARALLEL_PREPARATION_EFFECT_BINDING_INVALID",
  );
  if (
    binding.schemaVersion !== 1 ||
    binding.contractVersion !== PARALLEL_BACKUP_RESTORED_COPY_EVIDENCE_CONTRACT ||
    binding.decision !== PARALLEL_BACKUP_RESTORED_COPY_BOUND ||
    !UUID.test(binding.operationId ?? "") ||
    !SHA40.test(binding.releaseSha ?? "") ||
    ![
      binding.admissionReceiptSha256,
      binding.effectBindingDigest,
      binding.liveEvidenceDigest,
      binding.preparationDigest,
      binding.runtimeArchiveSha256,
    ].every((value) => SHA256.test(value ?? ""))
  ) {
    fail("PARALLEL_PREPARATION_EFFECT_BINDING_INVALID");
  }
  parseTimestamp(binding.boundAt, "PARALLEL_PREPARATION_EFFECT_BINDING_INVALID");
  parseTimestamp(binding.expiresAt, "PARALLEL_PREPARATION_EFFECT_BINDING_INVALID");
  const { effectBindingDigest, ...base } = binding;
  if (!safeEqual(effectBindingDigest, digest("effect-binding", base))) {
    fail("PARALLEL_PREPARATION_EFFECT_BINDING_DIGEST_MISMATCH");
  }
  return freeze({ ...binding });
}

export function verifyParallelBackupRestoredCopyEffectBinding({
  admissionReceipt,
  admissionReceiptSha256,
  binding: rawBinding,
  liveEvidence,
  now = () => new Date(),
  preparationReceipt,
}) {
  const binding = normalizeEffectBinding(rawBinding);
  const expected = bindParallelBackupRestoredCopyEvidence({
    admissionReceipt,
    admissionReceiptSha256,
    liveEvidence,
    now: () => new Date(binding.boundAt),
    preparationReceipt,
  });
  if (!safeEqual(stableJson(binding), stableJson(expected))) {
    fail("PARALLEL_PREPARATION_EFFECT_BINDING_MISMATCH");
  }
  const checkedAt = currentDate(now);
  if (checkedAt >= parseTimestamp(binding.expiresAt, "PARALLEL_PREPARATION_EFFECT_BINDING_INVALID")) {
    fail("PARALLEL_PREPARATION_EFFECT_BINDING_EXPIRED");
  }
  return binding;
}

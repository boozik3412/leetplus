import { createHash } from "node:crypto";
import { lstat, open, realpath } from "node:fs/promises";
import path from "node:path";

export const GATE_1MT_OPERATIONAL_PREFLIGHT_CONTRACT =
  "GATE_1MT_OPERATIONAL_PREFLIGHT_V1";
export const GATE_1MT_READY_FOR_CONTROLLED_CANARY =
  "READY_FOR_CONTROLLED_CANARY";
export const GATE_1MT_READY_FOR_PRODUCTION_GO_REVIEW =
  "READY_FOR_PRODUCTION_GO_REVIEW";
export const GATE_1MT_OPERATIONAL_PREFLIGHT_BLOCKED = "BLOCKED_MANUAL";
export const GATE_1MT_OPERATIONAL_POLICY_V1 = Object.freeze({
  apiErrorRatePermilleMax: 5,
  apiP95MsMax: 1500,
  attachmentServerErrorCountMax: 0,
  queueLagSecondsMax: 30,
  rollbackRtoSecondsMax: 300,
});

const RELEASE_SHA = /^[0-9a-f]{40}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const REPOSITORY = /^[a-z0-9_.-]{1,100}\/[a-z0-9_.-]{1,100}$/u;
const RUN_ID = /^[1-9][0-9]{5,24}$/u;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const REASON_CODE = /^[A-Z][A-Z0-9_]{2,100}$/u;
const MAX_MANIFEST_BYTES = 256 * 1024;
const MAX_EVIDENCE_BYTES = 4 * 1024 * 1024;
const CLOCK_SKEW_MS = 5 * 60 * 1000;
const PROVIDERS = new Set(["LANGAME", "SMTP", "TELEGRAM"]);
const PHASES = new Set(["CONTROLLED_CANARY", "PRODUCTION_GO_REVIEW"]);

export class Gate1mtOperationalPreflightError extends Error {
  constructor(reasonCode) {
    super(reasonCode);
    this.name = "Gate1mtOperationalPreflightError";
    this.reasonCode = reasonCode;
    this.safeContractError = true;
  }
}

function fail(reasonCode) {
  throw new Gate1mtOperationalPreflightError(reasonCode);
}

function exactRecord(value, keys, reasonCode) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    fail(reasonCode);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    fail(reasonCode);
  }
  return value;
}

function exactString(value, pattern, reasonCode) {
  if (typeof value !== "string" || !pattern.test(value)) fail(reasonCode);
  return value;
}

function exactInteger(value, minimum, maximum, reasonCode) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail(reasonCode);
  }
  return value;
}

function exactBoolean(value, expected, reasonCode) {
  if (value !== expected) fail(reasonCode);
  return value;
}

function exactPass(value, reasonCode) {
  if (value !== "PASS") fail(reasonCode);
  return value;
}

function stableJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
    .join(",")}}`;
}

function digest(domain, value) {
  return createHash("sha256")
    .update(`${GATE_1MT_OPERATIONAL_PREFLIGHT_CONTRACT}\0${domain}\0`)
    .update(stableJson(value))
    .digest("hex");
}

function evidenceReference(value, reasonCode) {
  const reference = exactRecord(value, ["path", "sha256"], reasonCode);
  if (
    typeof reference.path !== "string" ||
    reference.path.length < 3 ||
    reference.path.length > 4096 ||
    reference.path.trim() !== reference.path ||
    !path.isAbsolute(reference.path)
  ) {
    fail(reasonCode);
  }
  exactString(reference.sha256, SHA256, reasonCode);
  return Object.freeze({ ...reference });
}

function normalizeProviders(value, phase) {
  if (!Array.isArray(value)) fail("GATE_1MT_REQUIRED_PROVIDERS_INVALID");
  const providers = value.map((provider) => {
    if (!PROVIDERS.has(provider)) fail("GATE_1MT_REQUIRED_PROVIDER_INVALID");
    return provider;
  });
  if (
    providers.some(
      (provider, index) => provider !== [...providers].sort()[index],
    ) ||
    new Set(providers).size !== providers.length
  ) {
    fail("GATE_1MT_REQUIRED_PROVIDERS_NOT_CANONICAL");
  }
  if (phase === "CONTROLLED_CANARY" && providers.length !== 0) {
    fail("GATE_1MT_CANARY_PROVIDER_SEND_FORBIDDEN");
  }
  if (phase === "PRODUCTION_GO_REVIEW" && providers.length === 0) {
    fail("GATE_1MT_GO_REVIEW_PROVIDER_REQUIRED");
  }
  return Object.freeze(providers);
}

function normalizeManifest(value) {
  const manifest = exactRecord(
    value,
    [
      "contractVersion",
      "evidence",
      "evidenceMaxAgeSeconds",
      "phase",
      "release",
      "requiredProviders",
      "target",
      "thresholds",
    ],
    "GATE_1MT_MANIFEST_INVALID",
  );
  if (manifest.contractVersion !== GATE_1MT_OPERATIONAL_PREFLIGHT_CONTRACT) {
    fail("GATE_1MT_CONTRACT_INVALID");
  }
  if (!PHASES.has(manifest.phase)) fail("GATE_1MT_PHASE_INVALID");

  const release = exactRecord(
    manifest.release,
    ["releaseSha", "repository"],
    "GATE_1MT_RELEASE_INVALID",
  );
  exactString(release.releaseSha, RELEASE_SHA, "GATE_1MT_RELEASE_SHA_INVALID");
  exactString(release.repository, REPOSITORY, "GATE_1MT_REPOSITORY_INVALID");

  const target = exactRecord(
    manifest.target,
    ["databaseFingerprint", "storeFingerprint", "tenantFingerprint"],
    "GATE_1MT_TARGET_INVALID",
  );
  for (const key of Object.keys(target)) {
    exactString(
      target[key],
      SHA256,
      `GATE_1MT_TARGET_${key.toUpperCase()}_INVALID`,
    );
  }

  const thresholds = exactRecord(
    manifest.thresholds,
    [
      "apiErrorRatePermilleMax",
      "apiP95MsMax",
      "attachmentServerErrorCountMax",
      "queueLagSecondsMax",
      "rollbackRtoSecondsMax",
    ],
    "GATE_1MT_THRESHOLDS_INVALID",
  );
  exactInteger(
    thresholds.apiErrorRatePermilleMax,
    0,
    1000,
    "GATE_1MT_API_ERROR_THRESHOLD_INVALID",
  );
  exactInteger(
    thresholds.apiP95MsMax,
    1,
    120000,
    "GATE_1MT_API_P95_THRESHOLD_INVALID",
  );
  exactInteger(
    thresholds.attachmentServerErrorCountMax,
    0,
    1000000,
    "GATE_1MT_ATTACHMENT_ERROR_THRESHOLD_INVALID",
  );
  exactInteger(
    thresholds.queueLagSecondsMax,
    0,
    86400,
    "GATE_1MT_QUEUE_LAG_THRESHOLD_INVALID",
  );
  exactInteger(
    thresholds.rollbackRtoSecondsMax,
    1,
    7 * 24 * 60 * 60,
    "GATE_1MT_ROLLBACK_RTO_THRESHOLD_INVALID",
  );
  if (
    Object.entries(GATE_1MT_OPERATIONAL_POLICY_V1).some(
      ([key, expected]) => thresholds[key] !== expected,
    )
  ) {
    fail("GATE_1MT_THRESHOLDS_POLICY_MISMATCH");
  }

  exactInteger(
    manifest.evidenceMaxAgeSeconds,
    300,
    3600,
    "GATE_1MT_EVIDENCE_MAX_AGE_INVALID",
  );
  const requiredProviders = normalizeProviders(
    manifest.requiredProviders,
    manifest.phase,
  );

  const evidence = exactRecord(
    manifest.evidence,
    [
      "attachmentInventory",
      "browser",
      "ciAdmission",
      "observability",
      "providerCanary",
      "rollback",
    ],
    "GATE_1MT_EVIDENCE_REFERENCES_INVALID",
  );
  const normalizedEvidence = {
    attachmentInventory: evidenceReference(
      evidence.attachmentInventory,
      "GATE_1MT_ATTACHMENT_REFERENCE_INVALID",
    ),
    browser: evidenceReference(
      evidence.browser,
      "GATE_1MT_BROWSER_REFERENCE_INVALID",
    ),
    ciAdmission: evidenceReference(
      evidence.ciAdmission,
      "GATE_1MT_CI_REFERENCE_INVALID",
    ),
    observability: evidenceReference(
      evidence.observability,
      "GATE_1MT_OBSERVABILITY_REFERENCE_INVALID",
    ),
    rollback: evidenceReference(
      evidence.rollback,
      "GATE_1MT_ROLLBACK_REFERENCE_INVALID",
    ),
    providerCanary:
      evidence.providerCanary === null
        ? null
        : evidenceReference(
            evidence.providerCanary,
            "GATE_1MT_PROVIDER_REFERENCE_INVALID",
          ),
  };
  if (
    manifest.phase === "CONTROLLED_CANARY" &&
    normalizedEvidence.providerCanary !== null
  ) {
    fail("GATE_1MT_CANARY_PROVIDER_EVIDENCE_FORBIDDEN");
  }
  if (
    manifest.phase === "PRODUCTION_GO_REVIEW" &&
    normalizedEvidence.providerCanary === null
  ) {
    fail("GATE_1MT_GO_REVIEW_PROVIDER_EVIDENCE_REQUIRED");
  }

  return Object.freeze({
    contractVersion: manifest.contractVersion,
    evidence: Object.freeze(normalizedEvidence),
    evidenceMaxAgeSeconds: manifest.evidenceMaxAgeSeconds,
    phase: manifest.phase,
    release: Object.freeze({ ...release }),
    requiredProviders,
    target: Object.freeze({ ...target }),
    thresholds: Object.freeze({ ...thresholds }),
  });
}

function statIdentity(stat) {
  return [stat.dev, stat.ino, stat.size, stat.mtimeNs]
    .map((value) => value.toString())
    .join(":");
}

async function loadImmutableJson(
  filePath,
  expectedSha256,
  maximumBytes,
  reasonPrefix,
) {
  if (
    typeof filePath !== "string" ||
    filePath.length < 3 ||
    filePath.length > 4096 ||
    !path.isAbsolute(filePath)
  ) {
    fail(`${reasonPrefix}_PATH_INVALID`);
  }
  const pathStat = await lstat(filePath, { bigint: true });
  if (pathStat.isSymbolicLink() || !pathStat.isFile()) {
    fail(`${reasonPrefix}_FILE_INVALID`);
  }
  const handle = await open(await realpath(filePath), "r");
  try {
    const before = await handle.stat({ bigint: true });
    if (
      !before.isFile() ||
      statIdentity(pathStat) !== statIdentity(before) ||
      before.size <= 0n ||
      before.size > BigInt(maximumBytes)
    ) {
      fail(`${reasonPrefix}_FILE_INVALID`);
    }
    const bytes = Buffer.alloc(Number(before.size));
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    const after = await handle.stat({ bigint: true });
    if (
      bytesRead !== bytes.length ||
      statIdentity(before) !== statIdentity(after)
    ) {
      fail(`${reasonPrefix}_FILE_TORN`);
    }
    const actualSha256 = createHash("sha256").update(bytes).digest("hex");
    if (expectedSha256 !== null && actualSha256 !== expectedSha256) {
      fail(`${reasonPrefix}_DIGEST_MISMATCH`);
    }
    let value;
    try {
      value = JSON.parse(bytes.toString("utf8"));
    } catch {
      fail(`${reasonPrefix}_JSON_INVALID`);
    }
    return Object.freeze({ actualSha256, value });
  } finally {
    await handle.close();
  }
}

export async function loadGate1mtOperationalManifest(
  manifestPath,
  expectedSha256 = null,
) {
  if (expectedSha256 !== null) {
    exactString(
      expectedSha256,
      SHA256,
      "GATE_1MT_MANIFEST_EXPECTED_DIGEST_INVALID",
    );
  }
  const loaded = await loadImmutableJson(
    manifestPath,
    expectedSha256,
    MAX_MANIFEST_BYTES,
    "GATE_1MT_MANIFEST",
  );
  return normalizeManifest(loaded.value);
}

function assertFresh(timestamp, manifest, now, reasonCode) {
  exactString(timestamp, ISO_TIMESTAMP, reasonCode);
  const capturedAt = Date.parse(timestamp);
  const nowMs = now.getTime();
  if (
    !Number.isFinite(capturedAt) ||
    capturedAt > nowMs + CLOCK_SKEW_MS ||
    capturedAt < nowMs - manifest.evidenceMaxAgeSeconds * 1000
  ) {
    fail(reasonCode);
  }
}

function integerCounterMap(value, reasonCode) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    fail(reasonCode);
  }
  for (const [key, count] of Object.entries(value)) {
    exactString(key, REASON_CODE, reasonCode);
    exactInteger(count, 1, Number.MAX_SAFE_INTEGER, reasonCode);
  }
  return value;
}

function validateAttachmentInventory(report, manifest, now) {
  const value = exactRecord(
    report,
    [
      "attachmentInventory",
      "classificationReasonCounts",
      "durationMs",
      "mode",
      "reasonCounts",
      "safety",
      "schemaVersion",
      "script",
      "snapshotStartedAt",
      "sources",
      "status",
      "totals",
    ],
    "GATE_1MT_ATTACHMENT_REPORT_INVALID",
  );
  if (
    value.schemaVersion !== 1 ||
    value.script !== "staff-attachment-backfill-dry-run" ||
    value.status !== "completed" ||
    value.mode !== "READ_ONLY_DRY_RUN"
  ) {
    fail("GATE_1MT_ATTACHMENT_REPORT_CONTRACT_INVALID");
  }
  assertFresh(
    value.snapshotStartedAt,
    manifest,
    now,
    "GATE_1MT_ATTACHMENT_REPORT_STALE",
  );
  exactInteger(
    value.durationMs,
    0,
    24 * 60 * 60 * 1000,
    "GATE_1MT_ATTACHMENT_DURATION_INVALID",
  );

  const safety = exactRecord(
    value.safety,
    [
      "allowedHttpsOriginCount",
      "batchSize",
      "databaseSessionReadOnly",
      "databaseTargetFingerprint",
      "fileNamesEmitted",
      "maximumNodesPerValue",
      "maximumReferencesPerRow",
      "productionAttested",
      "rawIdentifiersEmitted",
      "rawUrlsEmitted",
      "releaseSha",
      "singleConnection",
      "snapshotConsistent",
      "snapshotIsolation",
      "statementTimeoutMs",
      "target",
      "transactionTimeoutMs",
    ],
    "GATE_1MT_ATTACHMENT_SAFETY_INVALID",
  );
  if (
    safety.target !== "production" ||
    safety.releaseSha !== manifest.release.releaseSha ||
    safety.databaseTargetFingerprint !== manifest.target.databaseFingerprint ||
    safety.snapshotIsolation !== "REPEATABLE READ"
  ) {
    fail("GATE_1MT_ATTACHMENT_BINDING_MISMATCH");
  }
  for (const key of [
    "databaseSessionReadOnly",
    "productionAttested",
    "singleConnection",
    "snapshotConsistent",
  ]) {
    exactBoolean(safety[key], true, "GATE_1MT_ATTACHMENT_READ_ONLY_REQUIRED");
  }
  for (const key of [
    "fileNamesEmitted",
    "rawIdentifiersEmitted",
    "rawUrlsEmitted",
  ]) {
    exactBoolean(
      safety[key],
      false,
      "GATE_1MT_ATTACHMENT_PII_OUTPUT_FORBIDDEN",
    );
  }
  exactInteger(
    safety.allowedHttpsOriginCount,
    0,
    10000,
    "GATE_1MT_ATTACHMENT_SAFETY_COUNT_INVALID",
  );
  exactInteger(safety.batchSize, 1, 1000, "GATE_1MT_ATTACHMENT_BATCH_INVALID");
  exactInteger(
    safety.maximumNodesPerValue,
    1,
    1000000,
    "GATE_1MT_ATTACHMENT_NODE_LIMIT_INVALID",
  );
  exactInteger(
    safety.maximumReferencesPerRow,
    1,
    1000000,
    "GATE_1MT_ATTACHMENT_REFERENCE_LIMIT_INVALID",
  );
  exactInteger(
    safety.statementTimeoutMs,
    1000,
    120000,
    "GATE_1MT_ATTACHMENT_STATEMENT_TIMEOUT_INVALID",
  );
  exactInteger(
    safety.transactionTimeoutMs,
    30000,
    3600000,
    "GATE_1MT_ATTACHMENT_TRANSACTION_TIMEOUT_INVALID",
  );

  const inventory = exactRecord(
    value.attachmentInventory,
    ["rowsScanned", "stateCounts"],
    "GATE_1MT_ATTACHMENT_INVENTORY_INVALID",
  );
  exactInteger(
    inventory.rowsScanned,
    0,
    Number.MAX_SAFE_INTEGER,
    "GATE_1MT_ATTACHMENT_ROWS_INVALID",
  );
  const stateCounts = integerCounterMap(
    inventory.stateCounts,
    "GATE_1MT_ATTACHMENT_STATE_COUNTS_INVALID",
  );
  if (
    Object.values(stateCounts).reduce((sum, count) => sum + count, 0) !==
    inventory.rowsScanned
  ) {
    fail("GATE_1MT_ATTACHMENT_STATE_TOTAL_MISMATCH");
  }

  const reasonCounts = integerCounterMap(
    value.reasonCounts,
    "GATE_1MT_ATTACHMENT_REASON_COUNTS_INVALID",
  );
  if (Object.keys(reasonCounts).length !== 0) {
    fail("GATE_1MT_ATTACHMENT_REASON_REVIEW_REQUIRED");
  }
  const classifications = integerCounterMap(
    value.classificationReasonCounts,
    "GATE_1MT_ATTACHMENT_CLASSIFICATIONS_INVALID",
  );
  if (
    Object.keys(classifications).some(
      (reason) => reason !== "PRIMARY_UNIQUE_PARENT_ATTACHMENT",
    )
  ) {
    fail("GATE_1MT_ATTACHMENT_CLASSIFICATION_REVIEW_REQUIRED");
  }

  const totals = exactRecord(
    value.totals,
    [
      "exactReferenceOccurrences",
      "existingAttachmentsWithoutRecognizedReference",
      "primaryAutoBindCandidateOccurrences",
      "rowsWithReferenceSignals",
      "secondaryReviewOnlyOccurrences",
      "sourceRowsScanned",
      "uniqueExistingAttachmentCandidates",
      "uniqueMissingAttachmentCandidates",
      "uniqueRecognizedAttachmentCandidates",
      "validReferenceOccurrences",
    ],
    "GATE_1MT_ATTACHMENT_TOTALS_INVALID",
  );
  for (const count of Object.values(totals)) {
    exactInteger(
      count,
      0,
      Number.MAX_SAFE_INTEGER,
      "GATE_1MT_ATTACHMENT_TOTAL_INVALID",
    );
  }
  if (totals.uniqueMissingAttachmentCandidates !== 0) {
    fail("GATE_1MT_ATTACHMENT_MISSING_CANDIDATE_PRESENT");
  }
  if (totals.existingAttachmentsWithoutRecognizedReference !== 0) {
    fail("GATE_1MT_ATTACHMENT_ORPHAN_REVIEW_REQUIRED");
  }
  if (
    totals.uniqueRecognizedAttachmentCandidates !==
      totals.uniqueExistingAttachmentCandidates +
        totals.uniqueMissingAttachmentCandidates ||
    inventory.rowsScanned !==
      totals.uniqueExistingAttachmentCandidates +
        totals.existingAttachmentsWithoutRecognizedReference ||
    totals.validReferenceOccurrences > totals.exactReferenceOccurrences ||
    totals.validReferenceOccurrences !==
      totals.primaryAutoBindCandidateOccurrences +
        totals.secondaryReviewOnlyOccurrences ||
    totals.uniqueRecognizedAttachmentCandidates >
      totals.validReferenceOccurrences ||
    totals.rowsWithReferenceSignals > totals.sourceRowsScanned ||
    (classifications.PRIMARY_UNIQUE_PARENT_ATTACHMENT ?? 0) !==
      totals.uniqueRecognizedAttachmentCandidates
  ) {
    fail("GATE_1MT_ATTACHMENT_AGGREGATE_MISMATCH");
  }
}

function validateBoundTarget(value, manifest, reasonCode) {
  const target = exactRecord(
    value,
    ["storeFingerprint", "tenantFingerprint"],
    reasonCode,
  );
  if (
    target.storeFingerprint !== manifest.target.storeFingerprint ||
    target.tenantFingerprint !== manifest.target.tenantFingerprint
  ) {
    fail(reasonCode);
  }
}

function validateBrowserEvidence(value, manifest, now) {
  const evidence = exactRecord(
    value,
    [
      "capturedAt",
      "consoleErrorCount",
      "contractVersion",
      "flows",
      "releaseSha",
      "target",
      "unexpectedNetworkFailureCount",
    ],
    "GATE_1MT_BROWSER_EVIDENCE_INVALID",
  );
  if (
    evidence.contractVersion !== "GATE_1MT_BROWSER_EVIDENCE_V1" ||
    evidence.releaseSha !== manifest.release.releaseSha
  ) {
    fail("GATE_1MT_BROWSER_BINDING_MISMATCH");
  }
  assertFresh(
    evidence.capturedAt,
    manifest,
    now,
    "GATE_1MT_BROWSER_EVIDENCE_STALE",
  );
  validateBoundTarget(
    evidence.target,
    manifest,
    "GATE_1MT_BROWSER_TARGET_MISMATCH",
  );
  const flows = exactRecord(
    evidence.flows,
    [
      "archivedParentReturns404",
      "crossTenantReturns404",
      "deletedParentReturns404",
      "orphanedAttachmentReturns404",
      "uploadBindDownloadRemove",
    ],
    "GATE_1MT_BROWSER_FLOWS_INVALID",
  );
  for (const result of Object.values(flows)) {
    exactPass(result, "GATE_1MT_BROWSER_FLOW_FAILED");
  }
  exactInteger(
    evidence.consoleErrorCount,
    0,
    0,
    "GATE_1MT_BROWSER_CONSOLE_ERROR",
  );
  exactInteger(
    evidence.unexpectedNetworkFailureCount,
    0,
    0,
    "GATE_1MT_BROWSER_NETWORK_FAILURE",
  );
}

function validateCiAdmission(value, manifest, now) {
  const evidence = exactRecord(
    value,
    [
      "capturedAt",
      "contractVersion",
      "fastRun",
      "releaseRun",
      "releaseSha",
      "repository",
    ],
    "GATE_1MT_CI_EVIDENCE_INVALID",
  );
  if (
    evidence.contractVersion !== "GATE_1MT_CI_ADMISSION_EVIDENCE_V1" ||
    evidence.releaseSha !== manifest.release.releaseSha ||
    evidence.repository !== manifest.release.repository
  ) {
    fail("GATE_1MT_CI_BINDING_MISMATCH");
  }
  assertFresh(evidence.capturedAt, manifest, now, "GATE_1MT_CI_EVIDENCE_STALE");
  for (const run of [evidence.fastRun, evidence.releaseRun]) {
    const normalized = exactRecord(
      run,
      ["conclusion", "releaseSha", "runId"],
      "GATE_1MT_CI_RUN_INVALID",
    );
    if (
      normalized.conclusion !== "SUCCESS" ||
      normalized.releaseSha !== manifest.release.releaseSha
    ) {
      fail("GATE_1MT_CI_RUN_NOT_ACCEPTED");
    }
    exactString(normalized.runId, RUN_ID, "GATE_1MT_CI_RUN_ID_INVALID");
  }
  if (evidence.fastRun.runId === evidence.releaseRun.runId) {
    fail("GATE_1MT_CI_RUNS_NOT_INDEPENDENT");
  }
}

function validateObservability(value, manifest, now) {
  const evidence = exactRecord(
    value,
    [
      "alertsConfigured",
      "apiErrorRatePermille",
      "apiP95Ms",
      "attachmentServerErrorCount",
      "capturedAt",
      "contractVersion",
      "queueLagSeconds",
      "releaseSha",
      "rollbackAlertRouteTested",
      "target",
      "windowSeconds",
    ],
    "GATE_1MT_OBSERVABILITY_EVIDENCE_INVALID",
  );
  if (
    evidence.contractVersion !== "GATE_1MT_OBSERVABILITY_EVIDENCE_V1" ||
    evidence.releaseSha !== manifest.release.releaseSha
  ) {
    fail("GATE_1MT_OBSERVABILITY_BINDING_MISMATCH");
  }
  assertFresh(
    evidence.capturedAt,
    manifest,
    now,
    "GATE_1MT_OBSERVABILITY_EVIDENCE_STALE",
  );
  validateBoundTarget(
    evidence.target,
    manifest,
    "GATE_1MT_OBSERVABILITY_TARGET_MISMATCH",
  );
  exactBoolean(
    evidence.alertsConfigured,
    true,
    "GATE_1MT_ALERTS_NOT_CONFIGURED",
  );
  exactBoolean(
    evidence.rollbackAlertRouteTested,
    true,
    "GATE_1MT_ROLLBACK_ALERT_ROUTE_NOT_TESTED",
  );
  exactInteger(
    evidence.windowSeconds,
    300,
    86400,
    "GATE_1MT_METRICS_WINDOW_INVALID",
  );
  const comparisons = [
    [
      "apiErrorRatePermille",
      "apiErrorRatePermilleMax",
      "GATE_1MT_API_ERROR_RATE_EXCEEDED",
    ],
    ["apiP95Ms", "apiP95MsMax", "GATE_1MT_API_P95_EXCEEDED"],
    [
      "attachmentServerErrorCount",
      "attachmentServerErrorCountMax",
      "GATE_1MT_ATTACHMENT_SERVER_ERRORS_EXCEEDED",
    ],
    ["queueLagSeconds", "queueLagSecondsMax", "GATE_1MT_QUEUE_LAG_EXCEEDED"],
  ];
  for (const [observedKey, maximumKey, reasonCode] of comparisons) {
    exactInteger(evidence[observedKey], 0, Number.MAX_SAFE_INTEGER, reasonCode);
    if (evidence[observedKey] > manifest.thresholds[maximumKey])
      fail(reasonCode);
  }
}

function validateRollback(value, manifest, now) {
  const evidence = exactRecord(
    value,
    [
      "backupVerified",
      "capturedAt",
      "contractVersion",
      "nMinusOneReady",
      "observedRtoSeconds",
      "previousReleaseSha",
      "releaseSha",
      "rollbackCommandDryRunPassed",
      "schedulerFree",
    ],
    "GATE_1MT_ROLLBACK_EVIDENCE_INVALID",
  );
  if (
    evidence.contractVersion !== "GATE_1MT_ROLLBACK_EVIDENCE_V1" ||
    evidence.releaseSha !== manifest.release.releaseSha
  ) {
    fail("GATE_1MT_ROLLBACK_BINDING_MISMATCH");
  }
  exactString(
    evidence.previousReleaseSha,
    RELEASE_SHA,
    "GATE_1MT_PREVIOUS_RELEASE_SHA_INVALID",
  );
  if (evidence.previousReleaseSha === manifest.release.releaseSha) {
    fail("GATE_1MT_PREVIOUS_RELEASE_SHA_NOT_DISTINCT");
  }
  assertFresh(
    evidence.capturedAt,
    manifest,
    now,
    "GATE_1MT_ROLLBACK_EVIDENCE_STALE",
  );
  for (const key of [
    "backupVerified",
    "nMinusOneReady",
    "rollbackCommandDryRunPassed",
    "schedulerFree",
  ]) {
    exactBoolean(evidence[key], true, "GATE_1MT_ROLLBACK_NOT_READY");
  }
  exactInteger(
    evidence.observedRtoSeconds,
    0,
    Number.MAX_SAFE_INTEGER,
    "GATE_1MT_ROLLBACK_RTO_INVALID",
  );
  if (evidence.observedRtoSeconds > manifest.thresholds.rollbackRtoSecondsMax) {
    fail("GATE_1MT_ROLLBACK_RTO_EXCEEDED");
  }
}

function validateProviderCanary(value, manifest, now) {
  const evidence = exactRecord(
    value,
    [
      "approvalFingerprint",
      "capturedAt",
      "contractVersion",
      "providers",
      "recipientFingerprint",
      "releaseSha",
      "target",
    ],
    "GATE_1MT_PROVIDER_EVIDENCE_INVALID",
  );
  if (
    evidence.contractVersion !== "GATE_1MT_PROVIDER_CANARY_EVIDENCE_V1" ||
    evidence.releaseSha !== manifest.release.releaseSha
  ) {
    fail("GATE_1MT_PROVIDER_BINDING_MISMATCH");
  }
  assertFresh(
    evidence.capturedAt,
    manifest,
    now,
    "GATE_1MT_PROVIDER_EVIDENCE_STALE",
  );
  validateBoundTarget(
    evidence.target,
    manifest,
    "GATE_1MT_PROVIDER_TARGET_MISMATCH",
  );
  exactString(
    evidence.approvalFingerprint,
    SHA256,
    "GATE_1MT_PROVIDER_APPROVAL_INVALID",
  );
  exactString(
    evidence.recipientFingerprint,
    SHA256,
    "GATE_1MT_PROVIDER_RECIPIENT_INVALID",
  );
  if (!Array.isArray(evidence.providers))
    fail("GATE_1MT_PROVIDER_RESULTS_INVALID");
  const names = [];
  for (const result of evidence.providers) {
    const provider = exactRecord(
      result,
      ["attempted", "duplicateDeliveries", "failed", "provider", "succeeded"],
      "GATE_1MT_PROVIDER_RESULT_INVALID",
    );
    if (!PROVIDERS.has(provider.provider))
      fail("GATE_1MT_PROVIDER_RESULT_INVALID");
    names.push(provider.provider);
    exactInteger(
      provider.attempted,
      1,
      1,
      "GATE_1MT_PROVIDER_ATTEMPT_COUNT_INVALID",
    );
    exactInteger(
      provider.succeeded,
      1,
      1,
      "GATE_1MT_PROVIDER_SUCCESS_COUNT_INVALID",
    );
    exactInteger(provider.failed, 0, 0, "GATE_1MT_PROVIDER_FAILURE_PRESENT");
    exactInteger(
      provider.duplicateDeliveries,
      0,
      0,
      "GATE_1MT_PROVIDER_DUPLICATE_PRESENT",
    );
  }
  if (
    names.length !== manifest.requiredProviders.length ||
    names.some((name, index) => name !== manifest.requiredProviders[index])
  ) {
    fail("GATE_1MT_PROVIDER_SET_MISMATCH");
  }
}

async function loadEvidence(reference, reasonPrefix) {
  return loadImmutableJson(
    reference.path,
    reference.sha256,
    MAX_EVIDENCE_BYTES,
    reasonPrefix,
  );
}

export function gate1mtOperationalManifestDigest(value) {
  return digest("manifest", normalizeManifest(value));
}

export async function runGate1mtOperationalPreflight({
  expectedReleaseSha,
  manifest: manifestInput,
  now = () => new Date(),
}) {
  try {
    const manifest = normalizeManifest(manifestInput);
    if (
      typeof expectedReleaseSha !== "string" ||
      !RELEASE_SHA.test(expectedReleaseSha) ||
      expectedReleaseSha !== manifest.release.releaseSha
    ) {
      fail("GATE_1MT_EXPECTED_RELEASE_SHA_MISMATCH");
    }
    const observedNow = now();
    if (
      !(observedNow instanceof Date) ||
      !Number.isFinite(observedNow.getTime())
    ) {
      fail("GATE_1MT_CLOCK_INVALID");
    }

    const [
      attachment,
      browser,
      ciAdmission,
      observability,
      rollback,
      provider,
    ] = await Promise.all([
      loadEvidence(
        manifest.evidence.attachmentInventory,
        "GATE_1MT_ATTACHMENT_EVIDENCE",
      ),
      loadEvidence(manifest.evidence.browser, "GATE_1MT_BROWSER_EVIDENCE"),
      loadEvidence(manifest.evidence.ciAdmission, "GATE_1MT_CI_EVIDENCE"),
      loadEvidence(
        manifest.evidence.observability,
        "GATE_1MT_OBSERVABILITY_EVIDENCE",
      ),
      loadEvidence(manifest.evidence.rollback, "GATE_1MT_ROLLBACK_EVIDENCE"),
      manifest.evidence.providerCanary === null
        ? Promise.resolve(null)
        : loadEvidence(
            manifest.evidence.providerCanary,
            "GATE_1MT_PROVIDER_EVIDENCE",
          ),
    ]);

    validateAttachmentInventory(attachment.value, manifest, observedNow);
    validateBrowserEvidence(browser.value, manifest, observedNow);
    validateCiAdmission(ciAdmission.value, manifest, observedNow);
    validateObservability(observability.value, manifest, observedNow);
    validateRollback(rollback.value, manifest, observedNow);
    if (provider !== null)
      validateProviderCanary(provider.value, manifest, observedNow);

    const evidence = Object.freeze({
      attachmentInventorySha256: attachment.actualSha256,
      browserSha256: browser.actualSha256,
      ciAdmissionSha256: ciAdmission.actualSha256,
      observabilitySha256: observability.actualSha256,
      providerCanarySha256: provider?.actualSha256 ?? null,
      rollbackSha256: rollback.actualSha256,
    });
    const receipt = {
      contractVersion: GATE_1MT_OPERATIONAL_PREFLIGHT_CONTRACT,
      decision:
        manifest.phase === "CONTROLLED_CANARY"
          ? GATE_1MT_READY_FOR_CONTROLLED_CANARY
          : GATE_1MT_READY_FOR_PRODUCTION_GO_REVIEW,
      evidence,
      evidenceDigest: digest("accepted-evidence", evidence),
      manifestDigest: digest("manifest", manifest),
      phase: manifest.phase,
      reasonCode: null,
      releaseSha: manifest.release.releaseSha,
      repository: manifest.release.repository,
      targetDigest: digest("target", manifest.target),
    };
    return Object.freeze(receipt);
  } catch (error) {
    const reasonCode =
      error?.safeContractError === true && REASON_CODE.test(error.reasonCode)
        ? error.reasonCode
        : "GATE_1MT_OPERATIONAL_PREFLIGHT_UNEXPECTED_FAILURE";
    return Object.freeze({
      contractVersion: GATE_1MT_OPERATIONAL_PREFLIGHT_CONTRACT,
      decision: GATE_1MT_OPERATIONAL_PREFLIGHT_BLOCKED,
      reasonCode,
    });
  }
}

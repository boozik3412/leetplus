#!/usr/bin/env node

// Offline, read-only validation and reporting for Variant A application-pilot
// records. The CLI reads supplied JSON files and writes only its JSON report to
// stdout. It has no network or production-effect capability.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const CONTRACT = "LEETPLUS_RELEASE_A_APPLICATION_PILOT_RECORD_V1";
export const STAGES = Object.freeze([
  "request",
  "codeReady",
  "prReady",
  "merged",
  "admitted",
  "prepared",
  "go",
  "applied",
  "verified",
]);

const LANES = new Set(["L1_RUNTIME", "L2_SCHEMA_SECURITY"]);
const OUTCOMES = new Set(["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "FAILED", "ROLLED_BACK", "VERIFIED"]);
const BASES = Object.freeze({
  PRODUCER_TIMESTAMP: "producerAt",
  IMMUTABLE_RECEIPT_PUBLICATION: "publishedAt",
  OBSERVER_DETECTION: "detectedAt",
});
const WAIT_REASONS = new Set([
  "ADMISSION", "REVIEWER_OR_USER_WINDOW", "BACKUP_OR_OFFHOST", "RESTORE",
  "BROWSER_OR_API", "RESOURCE_OR_COOLDOWN", "BUSY_WORKER", "DIAGNOSIS_OR_REPAIR",
  "OTHER",
]);
const SHA = /^[0-9a-f]{40}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const POSITIVE_DECIMAL = /^[1-9][0-9]*$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const UTC = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?Z$/u;
const MAX_RECORD_BYTES = 1024 * 1024;

function fail(label, message) {
  throw new Error(`${label}: ${message}`);
}

function object(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(label, "must be an object");
  return value;
}

function exactKeys(value, expected, label) {
  object(value, label);
  const actual = Object.keys(value).toSorted();
  const wanted = [...expected].toSorted();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    fail(label, `keys must be exactly ${wanted.join(", ")}`);
  }
}

function optionalKeys(value, required, optional, label) {
  object(value, label);
  const actual = new Set(Object.keys(value));
  for (const key of required) if (!actual.has(key)) fail(label, `missing key ${key}`);
  for (const key of actual) if (!required.includes(key) && !optional.includes(key)) fail(label, `unexpected key ${key}`);
}

function string(value, label, { allowEmpty = false } = {}) {
  if (typeof value !== "string" || value.trim() !== value || (!allowEmpty && value.length === 0)) {
    fail(label, allowEmpty ? "must be a trimmed string" : "must be a non-empty trimmed string");
  }
  return value;
}

function utcMillis(value, label) {
  const match = typeof value === "string" ? value.match(UTC) : null;
  if (!match) fail(label, "must be an exact UTC timestamp ending in Z");
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const [year, month, day, hour, minute, second] = [
    yearText,
    monthText,
    dayText,
    hourText,
    minuteText,
    secondText,
  ].map(Number);
  const instant = new Date(0);
  instant.setUTCFullYear(year, month - 1, day);
  instant.setUTCHours(hour, minute, second, 0);
  if (
    instant.getUTCFullYear() !== year
    || instant.getUTCMonth() !== month - 1
    || instant.getUTCDate() !== day
    || instant.getUTCHours() !== hour
    || instant.getUTCMinutes() !== minute
    || instant.getUTCSeconds() !== second
  ) {
    fail(label, "contains an invalid calendar date or time");
  }
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) fail(label, "cannot be parsed as a UTC timestamp");
  return milliseconds;
}

function validateIdentifier(value, pattern, label, { required }) {
  if (value === "" || value === null) {
    if (required) fail(label, "is required at this stage");
    return;
  }
  if (typeof value !== "string" || !pattern.test(value)) fail(label, "has an invalid exact identifier");
}

function validateStage(stage, label) {
  optionalKeys(stage, ["at", "basis", "evidence"], ["producerAt", "publishedAt", "detectedAt"], label);
  const at = string(stage.at, `${label}.at`, { allowEmpty: true });
  const basis = string(stage.basis, `${label}.basis`, { allowEmpty: true });
  const evidence = string(stage.evidence, `${label}.evidence`, { allowEmpty: true });
  const selected = [at, basis, evidence].filter((value) => value !== "").length;
  if (selected !== 0 && selected !== 3) fail(label, "at, basis and evidence must be all empty or all populated");

  const optionalTimes = [];
  for (const key of ["producerAt", "publishedAt", "detectedAt"]) {
    if (!Object.hasOwn(stage, key)) continue;
    const value = string(stage[key], `${label}.${key}`, { allowEmpty: true });
    if (value !== "") optionalTimes.push([key, value, utcMillis(value, `${label}.${key}`)]);
  }
  for (let index = 1; index < optionalTimes.length; index += 1) {
    if (optionalTimes[index][2] < optionalTimes[index - 1][2]) {
      fail(label, "producer/publication/detection timestamps must be monotonic when supplied");
    }
  }

  if (selected === 0) {
    if (optionalTimes.length > 0) fail(label, "optional timing evidence requires a populated stage");
    return null;
  }
  const atMillis = utcMillis(at, `${label}.at`);
  if (!Object.hasOwn(BASES, basis)) fail(`${label}.basis`, `must be one of ${Object.keys(BASES).join(", ")}`);
  const basisField = BASES[basis];
  if (!Object.hasOwn(stage, basisField) || stage[basisField] !== at) {
    fail(label, `at must equal populated ${basisField} for basis ${basis}`);
  }
  return atMillis;
}

function validateCandidate(candidate, stageCount, label) {
  exactKeys(candidate, [
    "issue",
    "lane",
    "exactMainSha",
    "fastRunId",
    "fullRunId",
    "fullRunAttempt",
    "composeArtifactId",
    "nativeOperationId",
    "nativePlanSha256",
    "goApprovalSha256",
    "nativeFinalReceiptSha256",
  ], label);

  string(candidate.issue, `${label}.issue`, { allowEmpty: stageCount === 0 });
  if (stageCount > 0 && !LANES.has(candidate.lane)) fail(`${label}.lane`, "must be L1_RUNTIME or L2_SCHEMA_SECURITY");
  if (stageCount === 0 && candidate.lane !== "" && !LANES.has(candidate.lane)) fail(`${label}.lane`, "is invalid");

  validateIdentifier(candidate.exactMainSha, SHA, `${label}.exactMainSha`, { required: stageCount >= 4 });
  validateIdentifier(candidate.fastRunId, POSITIVE_DECIMAL, `${label}.fastRunId`, { required: stageCount >= 5 });
  validateIdentifier(candidate.fullRunId, POSITIVE_DECIMAL, `${label}.fullRunId`, { required: stageCount >= 5 });
  validateIdentifier(candidate.composeArtifactId, POSITIVE_DECIMAL, `${label}.composeArtifactId`, { required: stageCount >= 5 });
  if (candidate.fullRunAttempt === null) {
    if (stageCount >= 5) fail(`${label}.fullRunAttempt`, "is required after admission");
  } else if (!Number.isSafeInteger(candidate.fullRunAttempt) || candidate.fullRunAttempt < 1) {
    fail(`${label}.fullRunAttempt`, "must be a positive safe integer");
  }
  validateIdentifier(candidate.nativeOperationId, UUID, `${label}.nativeOperationId`, { required: stageCount >= 6 });
  validateIdentifier(candidate.nativePlanSha256, SHA256, `${label}.nativePlanSha256`, { required: stageCount >= 6 });
  validateIdentifier(candidate.goApprovalSha256, SHA256, `${label}.goApprovalSha256`, { required: stageCount >= 7 });
  validateIdentifier(candidate.nativeFinalReceiptSha256, SHA256, `${label}.nativeFinalReceiptSha256`, {
    required: stageCount >= 8,
  });
}

function validateWaits(waits, label) {
  if (!Array.isArray(waits)) fail(label, "must be an array");
  return waits.map((wait, index) => {
    const item = `${label}[${index}]`;
    exactKeys(wait, ["reason", "startedAt", "endedAt", "evidence"], item);
    if (!WAIT_REASONS.has(wait.reason)) fail(`${item}.reason`, "is not in the pilot wait taxonomy");
    string(wait.evidence, `${item}.evidence`);
    const startedAt = utcMillis(wait.startedAt, `${item}.startedAt`);
    const endedAt = utcMillis(wait.endedAt, `${item}.endedAt`);
    if (endedAt < startedAt) fail(item, "endedAt precedes startedAt");
    return { reason: wait.reason, startedAt: wait.startedAt, endedAt: wait.endedAt,
      durationMs: endedAt - startedAt, evidence: wait.evidence };
  });
}

function validateLateCritical(value, label, { required }) {
  if (value === null) {
    if (required) fail(label, "must be assessed for VERIFIED records");
    return null;
  }
  if (!Array.isArray(value)) fail(label, "must be null or an array");
  const normalized = value.map((entry, index) => string(entry, `${label}[${index}]`));
  if (new Set(normalized).size !== normalized.length) fail(label, "must not contain duplicates");
  return normalized;
}

export function validateRecord(value, label = "record") {
  exactKeys(value, [
    "contract",
    "candidate",
    "stages",
    "waits",
    "outcome",
    "independentAcceptanceEvidence",
    "replayedAcceptedEffects",
    "lateCriticalFailureClasses",
    "workerContinuationEvidence",
    "notes",
  ], label);
  if (value.contract !== CONTRACT) fail(`${label}.contract`, `must be ${CONTRACT}`);
  exactKeys(value.stages, STAGES, `${label}.stages`);

  const times = [];
  let missingObserved = false;
  for (const stageName of STAGES) {
    const time = validateStage(value.stages[stageName], `${label}.stages.${stageName}`);
    if (time === null) {
      missingObserved = true;
      continue;
    }
    if (missingObserved) fail(`${label}.stages.${stageName}`, "cannot be populated after a missing earlier stage");
    if (times.length > 0 && time < times.at(-1).time) fail(`${label}.stages.${stageName}.at`, "must not precede the prior stage");
    times.push({ stage: stageName, time });
  }
  const stageCount = times.length;
  validateCandidate(value.candidate, stageCount, `${label}.candidate`);
  const waits = validateWaits(value.waits, `${label}.waits`);
  if (!OUTCOMES.has(value.outcome)) fail(`${label}.outcome`, "is invalid");
  string(value.notes, `${label}.notes`, { allowEmpty: true });
  string(value.independentAcceptanceEvidence, `${label}.independentAcceptanceEvidence`, { allowEmpty: true });
  string(value.workerContinuationEvidence, `${label}.workerContinuationEvidence`, { allowEmpty: true });

  if (value.replayedAcceptedEffects !== null
      && (!Number.isSafeInteger(value.replayedAcceptedEffects) || value.replayedAcceptedEffects < 0)) {
    fail(`${label}.replayedAcceptedEffects`, "must be null or a non-negative safe integer");
  }
  const lateCritical = validateLateCritical(value.lateCriticalFailureClasses, `${label}.lateCriticalFailureClasses`, {
    required: value.outcome === "VERIFIED",
  });

  if (value.outcome === "NOT_STARTED" && stageCount !== 0) fail(`${label}.outcome`, "NOT_STARTED cannot have stage evidence");
  if (value.outcome === "IN_PROGRESS" && (stageCount === 0 || stageCount === STAGES.length)) {
    fail(`${label}.outcome`, "IN_PROGRESS requires a non-terminal stage prefix");
  }
  if (value.outcome === "VERIFIED") {
    if (stageCount !== STAGES.length) fail(`${label}.outcome`, "VERIFIED requires every stage through verified");
    string(value.independentAcceptanceEvidence, `${label}.independentAcceptanceEvidence`);
    string(value.stages.verified.evidence, `${label}.stages.verified.evidence`);
    string(value.workerContinuationEvidence, `${label}.workerContinuationEvidence`);
    if (value.replayedAcceptedEffects === null) fail(`${label}.replayedAcceptedEffects`, "must be assessed for VERIFIED records");
    if (lateCritical === null) fail(`${label}.lateCriticalFailureClasses`, "must be assessed for VERIFIED records");
  } else if (stageCount === STAGES.length) {
    fail(`${label}.outcome`, "a populated verified stage requires outcome VERIFIED");
  }

  const stageTimes = Object.fromEntries(times.map(({ stage, time }) => [stage, time]));
  return {
    record: value,
    stageCount,
    stageTimes,
    lane: value.candidate.lane || "UNASSIGNED",
    lateCritical,
    waits,
  };
}

function duration(stageTimes, start, end) {
  return Number.isFinite(stageTimes[start]) && Number.isFinite(stageTimes[end])
    ? stageTimes[end] - stageTimes[start]
    : null;
}

function nearestRank(sorted, percentile) {
  return sorted[Math.max(0, Math.ceil(percentile * sorted.length) - 1)];
}

function durationStats(values) {
  if (values.length < 10) {
    return {
      status: "INSUFFICIENT_SAMPLE_SIZE",
      n: values.length,
      min: values.length ? Math.min(...values) : null,
      max: values.length ? Math.max(...values) : null,
      p50: null,
      p95: null,
    };
  }
  const sorted = values.toSorted((left, right) => left - right);
  return {
    status: "MEASURED",
    n: sorted.length,
    min: sorted[0],
    max: sorted.at(-1),
    p50: nearestRank(sorted, 0.5),
    p95: nearestRank(sorted, 0.95),
  };
}

export function buildReport(validated) {
  const records = validated.map((entry, index) => {
    const durationsMs = {
      mergedToVerified: duration(entry.stageTimes, "merged", "verified"),
      requestToVerified: duration(entry.stageTimes, "request", "verified"),
      admittedToVerified: duration(entry.stageTimes, "admitted", "verified"),
    };
    return {
      index,
      issue: entry.record.candidate.issue,
      lane: entry.lane,
      exactMainSha: entry.record.candidate.exactMainSha || null,
      outcome: entry.record.outcome,
      completedStage: entry.stageCount ? STAGES[entry.stageCount - 1] : null,
      durationsMs,
      waits: entry.waits,
      replayedAcceptedEffects: entry.record.replayedAcceptedEffects,
      lateCriticalFailureCount: entry.lateCritical === null ? null : entry.lateCritical.length,
    };
  });

  const laneReports = {};
  for (const lane of [...new Set(records.map((record) => record.lane))].toSorted()) {
    const laneRecords = records.filter((record) => record.lane === lane);
    const verified = laneRecords.filter((record) => record.outcome === "VERIFIED");
    const assessedReplay = laneRecords.filter((record) => record.replayedAcceptedEffects !== null);
    const assessedLate = laneRecords.filter((record) => record.lateCriticalFailureCount !== null);
    laneReports[lane] = {
      records: laneRecords.length,
      verified: verified.length,
      incomplete: laneRecords.filter((record) => ["NOT_STARTED", "IN_PROGRESS", "BLOCKED"].includes(record.outcome)).length,
      failed: laneRecords.filter((record) => ["FAILED", "ROLLED_BACK"].includes(record.outcome)).length,
      durationsMs: {
        mergedToVerified: durationStats(verified.map((record) => record.durationsMs.mergedToVerified)),
        requestToVerified: durationStats(verified.map((record) => record.durationsMs.requestToVerified)),
        admittedToVerified: durationStats(verified.map((record) => record.durationsMs.admittedToVerified)),
      },
      repeatedEffectCounter: {
        assessedRecords: assessedReplay.length,
        unassessedRecords: laneRecords.length - assessedReplay.length,
        total: assessedReplay.length
          ? assessedReplay.reduce((sum, record) => sum + record.replayedAcceptedEffects, 0)
          : null,
      },
      lateCriticalCounter: {
        assessedRecords: assessedLate.length,
        unassessedRecords: laneRecords.length - assessedLate.length,
        total: assessedLate.length
          ? assessedLate.reduce((sum, record) => sum + record.lateCriticalFailureCount, 0)
          : null,
      },
    };
  }

  return {
    contract: "LEETPLUS_RELEASE_A_APPLICATION_PILOT_REPORT_V1",
    percentileMethod: "NEAREST_RANK",
    minimumPercentileSampleSize: 10,
    records,
    lanes: laneReports,
  };
}

function readRecord(filePath) {
  const resolved = path.resolve(filePath);
  const metadata = fs.lstatSync(resolved);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size === 0 || metadata.size > MAX_RECORD_BYTES) {
    fail(resolved, "must be a non-empty regular JSON file no larger than 1 MiB");
  }
  return JSON.parse(fs.readFileSync(resolved, "utf8"));
}

function main(argv) {
  if (argv.length === 0) fail("usage", "node scripts/ci/release-a-pilot-ledger.mjs <record.json> [record.json ...]");
  const validated = argv.map((filePath) => validateRecord(readRecord(filePath), path.resolve(filePath)));
  process.stdout.write(`${JSON.stringify(buildReport(validated), null, 2)}\n`);
}

const isEntrypoint = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isEntrypoint) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

import { createHash } from "node:crypto";

import { canonicalStringify } from "./staff-task-integrity-canonical-json.mjs";
import { STAFF_TASK_CURRENT_RELEASE_STATE } from "./staff-task-integrity-migration-state.mjs";

export const ACQUISITION_REQUEST_KIND =
  "LEETPLUS_STAFF_TASK_SNAPSHOT_ACQUISITION_EVIDENCE";
export const ACQUISITION_DATA_MINIMIZATION_PROFILE =
  "STAFF_TASK_NINE_RELATION_TOKENIZED_V1";
export const ACQUISITION_APPROVAL_REFERENCE_PREFIX = "acquisition-v1:";

const PURPOSE = "STAFF_TASK_INTEGRITY_RECONCILIATION";
const CLASSIFICATION = "PRODUCTION_LIKE";
const PROFILE = "STAFF_TASK_INTEGRITY_PRODUCTION_LIKE_V1";
const ISOLATION_PROFILE = "ISOLATED_ENCRYPTED_NO_EGRESS_V1";
const MAX_DOCUMENT_BYTES = 32 * 1024;
const MAX_LIFETIME_MS = 72 * 60 * 60 * 1_000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1_000;
const SHA_256_PATTERN = /^[0-9a-f]{64}$/u;
const RELEASE_SHA_PATTERN = /^[0-9a-f]{40}$/u;
const OPAQUE_REFERENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{2,127}$/u;
const DATABASE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{2,62}$/u;
const PRODUCTION_LIKE_DATABASE_MARKER_PATTERN =
  /(?:^|[_-])(?:snapshot|rehearsal|preprod|staging|stage|test)(?:$|[_-])/iu;
const EXPECTED_STATES = new Set([
  "BASELINE_156",
  "EXPAND_162",
  STAFF_TASK_CURRENT_RELEASE_STATE,
]);
const TOP_LEVEL_KEYS = Object.freeze(
  [
    "actors",
    "classification",
    "controls",
    "databaseIdentity",
    "expectedState",
    "isolationProfile",
    "kind",
    "profile",
    "purpose",
    "references",
    "releaseSha",
    "schemaVersion",
    "snapshotArtifactDigest",
    "timeline",
  ].sort((left, right) => left.localeCompare(right)),
);
const DATABASE_IDENTITY_KEYS = Object.freeze(
  ["clusterSystemIdentifier", "currentDatabase", "databaseOid"].sort(
    (left, right) => left.localeCompare(right),
  ),
);
const TIMELINE_KEYS = Object.freeze(
  ["acquiredAt", "expiresAt", "restoredAt"].sort((left, right) =>
    left.localeCompare(right),
  ),
);
const ACTOR_KEYS = Object.freeze(
  [
    "acquisitionOperatorReference",
    "destructionOwnerReference",
    "securityApproverReference",
    "sourceOwnerReference",
  ].sort((left, right) => left.localeCompare(right)),
);
const CONTROL_KEYS = Object.freeze(
  [
    "applicationWorkloadsDisabled",
    "dataMinimizationProfile",
    "destructionScheduled",
    "disposableDestination",
    "encryptedAtRest",
    "encryptedInTransit",
    "noEgress",
    "productionCredentialsRemoved",
  ].sort((left, right) => left.localeCompare(right)),
);
const REFERENCE_KEYS = Object.freeze(
  [
    "changeRecordReference",
    "destinationReference",
    "destructionProcedureReference",
    "incidentContactReference",
  ].sort((left, right) => left.localeCompare(right)),
);

function acquisitionError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.exitCode = 3;
  error.safeContractError = true;
  throw error;
}

function exactDataRecord(value, expectedKeys, label) {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    acquisitionError(
      "PRODUCTION_LIKE_ACQUISITION_REQUEST_INVALID",
      `${label} must be one exact data-only record.`,
    );
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors).sort((left, right) =>
    String(left).localeCompare(String(right)),
  );
  if (
    keys.length !== expectedKeys.length ||
    keys.some(
      (key, index) => typeof key !== "string" || key !== expectedKeys[index],
    ) ||
    keys.some((key) => !Object.hasOwn(descriptors[key], "value"))
  ) {
    acquisitionError(
      "PRODUCTION_LIKE_ACQUISITION_REQUEST_INVALID",
      `${label} must be one exact data-only record.`,
    );
  }
  return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
}

function canonicalTimestamp(value, label) {
  const raw = String(value ?? "");
  const parsed = new Date(raw);
  if (!raw || Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== raw) {
    acquisitionError(
      "PRODUCTION_LIKE_ACQUISITION_TIMELINE_INVALID",
      `${label} must be a canonical ISO-8601 timestamp.`,
    );
  }
  return parsed;
}

function normalizedNow(now) {
  const current = now instanceof Date ? new Date(now.valueOf()) : new Date(now);
  if (Number.isNaN(current.valueOf())) {
    acquisitionError(
      "PRODUCTION_LIKE_ACQUISITION_CURRENT_TIME_INVALID",
      "The acquisition verification time is invalid.",
    );
  }
  return current;
}

function exactOpaqueReferences(record, keys, label) {
  for (const key of keys) {
    const value = record[key];
    if (
      typeof value !== "string" ||
      !OPAQUE_REFERENCE_PATTERN.test(value) ||
      value.includes("://") ||
      value.includes("@")
    ) {
      acquisitionError(
        "PRODUCTION_LIKE_ACQUISITION_REFERENCE_INVALID",
        `${label} contains an invalid opaque reference.`,
      );
    }
  }
}

export function isProductionLikeSnapshotDatabaseName(value) {
  return (
    typeof value === "string" &&
    DATABASE_NAME_PATTERN.test(value) &&
    PRODUCTION_LIKE_DATABASE_MARKER_PATTERN.test(value)
  );
}

export function normalizeAcquisitionRequest(request, now = new Date()) {
  const normalized = exactDataRecord(
    request,
    TOP_LEVEL_KEYS,
    "The acquisition request",
  );
  normalized.databaseIdentity = exactDataRecord(
    normalized.databaseIdentity,
    DATABASE_IDENTITY_KEYS,
    "The acquisition database identity",
  );
  normalized.timeline = exactDataRecord(
    normalized.timeline,
    TIMELINE_KEYS,
    "The acquisition timeline",
  );
  normalized.actors = exactDataRecord(
    normalized.actors,
    ACTOR_KEYS,
    "The acquisition actor record",
  );
  normalized.controls = exactDataRecord(
    normalized.controls,
    CONTROL_KEYS,
    "The acquisition control record",
  );
  normalized.references = exactDataRecord(
    normalized.references,
    REFERENCE_KEYS,
    "The acquisition reference record",
  );
  if (
    normalized.schemaVersion !== 1 ||
    normalized.kind !== ACQUISITION_REQUEST_KIND ||
    normalized.purpose !== PURPOSE ||
    normalized.classification !== CLASSIFICATION ||
    normalized.profile !== PROFILE ||
    normalized.isolationProfile !== ISOLATION_PROFILE ||
    !RELEASE_SHA_PATTERN.test(String(normalized.releaseSha ?? "")) ||
    !EXPECTED_STATES.has(normalized.expectedState) ||
    !SHA_256_PATTERN.test(String(normalized.snapshotArtifactDigest ?? ""))
  ) {
    acquisitionError(
      "PRODUCTION_LIKE_ACQUISITION_REQUEST_INVALID",
      "The acquisition request failed its exact contract.",
    );
  }
  if (
    !isProductionLikeSnapshotDatabaseName(
      normalized.databaseIdentity.currentDatabase,
    ) ||
    typeof normalized.databaseIdentity.clusterSystemIdentifier !== "string" ||
    !/^\d+$/u.test(normalized.databaseIdentity.clusterSystemIdentifier) ||
    typeof normalized.databaseIdentity.databaseOid !== "string" ||
    !/^\d+$/u.test(normalized.databaseIdentity.databaseOid)
  ) {
    acquisitionError(
      "PRODUCTION_LIKE_ACQUISITION_DATABASE_IDENTITY_INVALID",
      "The acquisition database identity is invalid.",
    );
  }
  exactOpaqueReferences(normalized.actors, ACTOR_KEYS, "The actor record");
  exactOpaqueReferences(
    normalized.references,
    REFERENCE_KEYS,
    "The reference record",
  );
  if (
    new Set(ACTOR_KEYS.map((key) => normalized.actors[key])).size !==
    ACTOR_KEYS.length
  ) {
    acquisitionError(
      "PRODUCTION_LIKE_ACQUISITION_SEPARATION_INVALID",
      "Acquisition actors must be four distinct opaque authorities.",
    );
  }
  if (
    normalized.controls.dataMinimizationProfile !==
      ACQUISITION_DATA_MINIMIZATION_PROFILE ||
    CONTROL_KEYS.filter((key) => key !== "dataMinimizationProfile").some(
      (key) => normalized.controls[key] !== true,
    )
  ) {
    acquisitionError(
      "PRODUCTION_LIKE_ACQUISITION_CONTROLS_INVALID",
      "Every production-like acquisition control must be explicitly attested.",
    );
  }
  const current = normalizedNow(now);
  const acquiredAt = canonicalTimestamp(
    normalized.timeline.acquiredAt,
    "Snapshot acquisition time",
  );
  const restoredAt = canonicalTimestamp(
    normalized.timeline.restoredAt,
    "Snapshot restore time",
  );
  const expiresAt = canonicalTimestamp(
    normalized.timeline.expiresAt,
    "Snapshot destruction deadline",
  );
  if (
    acquiredAt.valueOf() > restoredAt.valueOf() ||
    restoredAt.valueOf() > current.valueOf() + MAX_CLOCK_SKEW_MS ||
    expiresAt.valueOf() <= current.valueOf() ||
    expiresAt.valueOf() <= restoredAt.valueOf() ||
    expiresAt.valueOf() - acquiredAt.valueOf() > MAX_LIFETIME_MS
  ) {
    acquisitionError(
      "PRODUCTION_LIKE_ACQUISITION_TIMELINE_INVALID",
      "The acquisition timeline is invalid or exceeds 72 hours.",
    );
  }
  return Object.freeze({
    ...normalized,
    databaseIdentity: Object.freeze(normalized.databaseIdentity),
    timeline: Object.freeze(normalized.timeline),
    actors: Object.freeze(normalized.actors),
    controls: Object.freeze(normalized.controls),
    references: Object.freeze(normalized.references),
  });
}

export function parseCanonicalAcquisitionRequest(
  encodedRequest,
  now = new Date(),
) {
  const bytes = Buffer.isBuffer(encodedRequest)
    ? Buffer.from(encodedRequest)
    : Buffer.from(String(encodedRequest ?? ""), "utf8");
  if (bytes.length === 0 || bytes.length > MAX_DOCUMENT_BYTES) {
    acquisitionError(
      "PRODUCTION_LIKE_ACQUISITION_REQUEST_INVALID",
      "The acquisition request size is invalid.",
    );
  }
  const text = bytes.toString("utf8");
  if (Buffer.from(text, "utf8").compare(bytes) !== 0) {
    acquisitionError(
      "PRODUCTION_LIKE_ACQUISITION_REQUEST_INVALID",
      "The acquisition request must be valid UTF-8.",
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    acquisitionError(
      "PRODUCTION_LIKE_ACQUISITION_REQUEST_INVALID",
      "The acquisition request is not valid JSON.",
    );
  }
  if (canonicalStringify(parsed) !== text) {
    acquisitionError(
      "PRODUCTION_LIKE_ACQUISITION_REQUEST_INVALID",
      "The acquisition request must be canonical JSON without duplicate or trailing fields.",
    );
  }
  return normalizeAcquisitionRequest(parsed, now);
}

export function computeAcquisitionRequestDigest(request, now = new Date()) {
  const normalized = normalizeAcquisitionRequest(request, now);
  return createHash("sha256")
    .update("staff-task-snapshot-acquisition-evidence-v1\0", "utf8")
    .update(canonicalStringify(normalized), "utf8")
    .digest("hex");
}

export function approvalReferenceForAcquisitionRequest(
  request,
  now = new Date(),
) {
  return `${ACQUISITION_APPROVAL_REFERENCE_PREFIX}${computeAcquisitionRequestDigest(
    request,
    now,
  )}`;
}

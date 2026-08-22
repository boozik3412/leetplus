import { createHash } from "node:crypto";

export const IDENTITY_MAIL_TENANT_ENROLLMENT_CONTRACT =
  "PROTECTED_MAIL_WORKER_TENANT_ENROLLMENT_V1";

export const IDENTITY_MAIL_TENANT_ENROLLMENT_ACTIONS = Object.freeze([
  "ENABLE",
  "ROTATE",
  "DISABLE",
]);

export const IDENTITY_MAIL_TENANT_ENROLLMENT_STATES = Object.freeze([
  "ABSENT",
  "ACTIVE",
  "DRAINING",
  "DISABLED",
]);

export const IDENTITY_MAIL_TENANT_ENROLLMENT_MAX_LIFETIME_MS = 15 * 60 * 1_000;
export const IDENTITY_MAIL_TENANT_ENROLLMENT_MAX_CLOCK_SKEW_MS = 5 * 60 * 1_000;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SAFE_DATABASE_NAME_PATTERN = /^[a-z][a-z0-9_]{0,62}$/u;
const SAFE_ROLE_NAME_PATTERN = /^[a-z_][a-z0-9_]{2,62}$/u;
const RELEASE_SHA_PATTERN = /^[0-9a-f]{40}$/u;
const SHA_256_PATTERN = /^[0-9a-f]{64}$/u;
const MAX_POSTGRES_OID = 4_294_967_295;
const SYSTEM_DATABASE_NAMES = new Set(["postgres", "template0", "template1"]);

const PROPOSAL_KEYS = Object.freeze(
  [
    "action",
    "contract",
    "deploymentMarkerDigest",
    "expectedDatabaseName",
    "expectedDatabaseOid",
    "expectedRevision",
    "expectedState",
    "expiresAt",
    "nextRevision",
    "policy",
    "providerAuthorityDigest",
    "releaseSha",
    "requestId",
    "requestedAt",
    "runtimeConfigDigest",
    "tenantId",
    "workerRoleName",
    "workerRoleOid",
  ].sort(),
);

const POLICY_KEYS = Object.freeze(
  [
    "acknowledgeSeconds",
    "baseRetrySeconds",
    "leaseSeconds",
    "maxAttempts",
    "maxRetrySeconds",
  ].sort(),
);

export class IdentityMailTenantEnrollmentContractError extends Error {
  constructor(reasonCode) {
    super(reasonCode);
    this.name = "IdentityMailTenantEnrollmentContractError";
    this.reasonCode = reasonCode;
    this.code = reasonCode;
    this.exitCode = 3;
  }
}

function fail(reasonCode) {
  throw new IdentityMailTenantEnrollmentContractError(reasonCode);
}

function exactDataRecord(value, keys, reasonCode) {
  if (
    !value ||
    Array.isArray(value) ||
    typeof value !== "object" ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  ) {
    fail(reasonCode);
  }

  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actualKeys = Reflect.ownKeys(descriptors);
  if (actualKeys.some((key) => typeof key !== "string")) {
    fail(reasonCode);
  }
  actualKeys.sort();
  if (
    actualKeys.length !== keys.length ||
    actualKeys.some((key, index) => key !== keys[index]) ||
    actualKeys.some((key) => !Object.hasOwn(descriptors[key], "value"))
  ) {
    fail(reasonCode);
  }

  const snapshot = Object.create(null);
  for (const key of keys) {
    snapshot[key] = descriptors[key].value;
  }
  return Object.freeze(snapshot);
}

function positiveBoundedInteger(value, minimum, maximum) {
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

function exactPattern(value, pattern) {
  return typeof value === "string" && pattern.test(value);
}

function canonicalIsoTimestamp(value) {
  if (typeof value !== "string") {
    return undefined;
  }
  const epochMs = Date.parse(value);
  if (!Number.isFinite(epochMs) || new Date(epochMs).toISOString() !== value) {
    return undefined;
  }
  return epochMs;
}

function currentEpochMs(options) {
  if (
    options === undefined ||
    (options &&
      !Array.isArray(options) &&
      typeof options === "object" &&
      Object.getPrototypeOf(options) === Object.prototype &&
      Reflect.ownKeys(options).length === 0)
  ) {
    return Date.now();
  }

  const optionRecord = exactDataRecord(
    options,
    ["now"],
    "IDENTITY_MAIL_TENANT_ENROLLMENT_OPTIONS_INVALID",
  );
  const now =
    optionRecord.now instanceof Date
      ? optionRecord.now.valueOf()
      : typeof optionRecord.now === "number"
        ? optionRecord.now
        : typeof optionRecord.now === "string"
          ? Date.parse(optionRecord.now)
          : Number.NaN;
  if (!Number.isSafeInteger(now) || new Date(now).valueOf() !== now) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_CURRENT_TIME_INVALID");
  }
  return now;
}

function validateTransition(action, expectedState, expectedRevision) {
  const valid =
    (action === "ENABLE" &&
      (expectedState === "ABSENT" || expectedState === "DISABLED")) ||
    ((action === "ROTATE" || action === "DISABLE") &&
      expectedState === "ACTIVE");
  if (!valid) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_TRANSITION_INVALID");
  }
  if (
    (expectedState === "ABSENT" && expectedRevision !== 0) ||
    (expectedState !== "ABSENT" && expectedRevision < 1)
  ) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_REVISION_INVALID");
  }
}

function normalizePolicy(value) {
  const policy = exactDataRecord(
    value,
    POLICY_KEYS,
    "IDENTITY_MAIL_TENANT_ENROLLMENT_POLICY_INVALID",
  );
  if (
    !positiveBoundedInteger(policy.maxAttempts, 1, 20) ||
    !positiveBoundedInteger(policy.leaseSeconds, 30, 900) ||
    !positiveBoundedInteger(policy.acknowledgeSeconds, 10, 900) ||
    !positiveBoundedInteger(policy.baseRetrySeconds, 1, 3_600) ||
    !positiveBoundedInteger(policy.maxRetrySeconds, 1, 86_400) ||
    policy.maxRetrySeconds < policy.baseRetrySeconds
  ) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_POLICY_INVALID");
  }
  return Object.freeze({
    acknowledgeSeconds: policy.acknowledgeSeconds,
    baseRetrySeconds: policy.baseRetrySeconds,
    leaseSeconds: policy.leaseSeconds,
    maxAttempts: policy.maxAttempts,
    maxRetrySeconds: policy.maxRetrySeconds,
  });
}

function contentDigest(value) {
  return createHash("sha256")
    .update(JSON.stringify(value), "utf8")
    .digest("hex");
}

/**
 * Parses one immutable, non-authorizing tenant enrollment proposal.
 *
 * This function performs no I/O. `now` is the only accepted option and is
 * used solely to reject future or expired proposal windows. State and revision
 * expectations are proposal content so a later apply ceremony can use them as
 * optimistic, independently rechecked inputs.
 */
export function parseIdentityMailTenantEnrollmentProposal(
  input,
  options = undefined,
) {
  const nowMs = currentEpochMs(options);
  const proposal = exactDataRecord(
    input,
    PROPOSAL_KEYS,
    "IDENTITY_MAIL_TENANT_ENROLLMENT_PROPOSAL_SHAPE_INVALID",
  );

  if (proposal.contract !== IDENTITY_MAIL_TENANT_ENROLLMENT_CONTRACT) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_CONTRACT_INVALID");
  }
  if (!IDENTITY_MAIL_TENANT_ENROLLMENT_ACTIONS.includes(proposal.action)) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_ACTION_INVALID");
  }
  if (
    !exactPattern(proposal.requestId, UUID_PATTERN) ||
    !exactPattern(proposal.tenantId, UUID_PATTERN)
  ) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_IDENTIFIER_INVALID");
  }
  if (
    !exactPattern(proposal.expectedDatabaseName, SAFE_DATABASE_NAME_PATTERN) ||
    SYSTEM_DATABASE_NAMES.has(proposal.expectedDatabaseName) ||
    !positiveBoundedInteger(proposal.expectedDatabaseOid, 1, MAX_POSTGRES_OID)
  ) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_DATABASE_BINDING_INVALID");
  }
  if (
    !exactPattern(proposal.workerRoleName, SAFE_ROLE_NAME_PATTERN) ||
    proposal.workerRoleName === "public" ||
    proposal.workerRoleName.startsWith("pg_") ||
    !positiveBoundedInteger(proposal.workerRoleOid, 1, MAX_POSTGRES_OID)
  ) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_ROLE_BINDING_INVALID");
  }
  if (
    !exactPattern(proposal.releaseSha, RELEASE_SHA_PATTERN) ||
    ![
      proposal.deploymentMarkerDigest,
      proposal.providerAuthorityDigest,
      proposal.runtimeConfigDigest,
    ].every((value) => exactPattern(value, SHA_256_PATTERN))
  ) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_RELEASE_BINDING_INVALID");
  }
  if (
    !IDENTITY_MAIL_TENANT_ENROLLMENT_STATES.includes(proposal.expectedState) ||
    !Number.isSafeInteger(proposal.expectedRevision) ||
    proposal.expectedRevision < 0 ||
    !Number.isSafeInteger(proposal.nextRevision) ||
    proposal.nextRevision !== proposal.expectedRevision + 1
  ) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_REVISION_INVALID");
  }
  validateTransition(
    proposal.action,
    proposal.expectedState,
    proposal.expectedRevision,
  );

  const policy = normalizePolicy(proposal.policy);
  const requestedAtMs = canonicalIsoTimestamp(proposal.requestedAt);
  const expiresAtMs = canonicalIsoTimestamp(proposal.expiresAt);
  if (
    requestedAtMs === undefined ||
    expiresAtMs === undefined ||
    expiresAtMs <= requestedAtMs ||
    expiresAtMs - requestedAtMs >
      IDENTITY_MAIL_TENANT_ENROLLMENT_MAX_LIFETIME_MS ||
    requestedAtMs > nowMs + IDENTITY_MAIL_TENANT_ENROLLMENT_MAX_CLOCK_SKEW_MS
  ) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_TIMELINE_INVALID");
  }
  if (expiresAtMs <= nowMs) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_PROPOSAL_STALE");
  }

  const normalized = Object.freeze({
    action: proposal.action,
    authorization: false,
    canMutate: false,
    contract: proposal.contract,
    deploymentMarkerDigest: proposal.deploymentMarkerDigest,
    expectedDatabaseName: proposal.expectedDatabaseName,
    expectedDatabaseOid: proposal.expectedDatabaseOid,
    expectedRevision: proposal.expectedRevision,
    expectedState: proposal.expectedState,
    expiresAt: proposal.expiresAt,
    nextRevision: proposal.nextRevision,
    policy,
    providerAuthorityDigest: proposal.providerAuthorityDigest,
    releaseSha: proposal.releaseSha,
    requestId: proposal.requestId,
    requestedAt: proposal.requestedAt,
    runtimeConfigDigest: proposal.runtimeConfigDigest,
    tenantId: proposal.tenantId,
    workerRoleName: proposal.workerRoleName,
    workerRoleOid: proposal.workerRoleOid,
  });

  return Object.freeze({
    ...normalized,
    contentDigest: contentDigest(normalized),
  });
}

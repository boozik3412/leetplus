import { createHash } from "node:crypto";

import { parseIdentityMailTenantEnrollmentProposal } from "./identity-mail-tenant-enrollment-contract.mjs";

export const IDENTITY_MAIL_TENANT_ENROLLMENT_PREFLIGHT_CONTRACT =
  "PROTECTED_MAIL_WORKER_TENANT_ENROLLMENT_PREFLIGHT_V1";
export const IDENTITY_MAIL_TENANT_ENROLLMENT_PREFLIGHT_SCHEMA_VERSION = 1;
export const IDENTITY_MAIL_TENANT_ENROLLMENT_PREFLIGHT_MIGRATION =
  "20260731120000_identity_mail_delivery_release_head";
export const IDENTITY_MAIL_TENANT_ENROLLMENT_PREFLIGHT_MIGRATION_COUNT = 179;
export const IDENTITY_MAIL_TENANT_ENROLLMENT_PREFLIGHT_WORKER_RPC_COUNT = 5;

export const IDENTITY_MAIL_TENANT_ENROLLMENT_PREFLIGHT_DEFERRED_CONTROLS =
  Object.freeze([
    "APPLY_ROLLBACK",
    "INDEPENDENT_SIGNATURE",
    "PERSISTED_REQUEST_REPLAY",
    "RUNTIME_CONFIG_DIGEST",
    "STATE_EVENT_MIGRATION",
  ]);

export const IDENTITY_MAIL_TENANT_ENROLLMENT_PREFLIGHT_FINDINGS = Object.freeze(
  {
    ACTUAL_CONTEXT_INVALID: "MARKER_ACTUAL_CONTEXT_INVALID",
    ACTIVATION_BINDING_PRESENT: "WORKER_ROLE_ACTIVATION_BINDING_PRESENT",
    BUILD_BINDING_INVALID: "MARKER_BUILD_BINDING_INVALID",
    CATALOG_INVALID: "WORKER_ROLE_CATALOG_INVALID",
    CHALLENGE_BINDING_INVALID: "MARKER_CHALLENGE_BINDING_INVALID",
    CLAIMED_WORK_PRESENT_FOR_ENABLE: "CLAIMED_WORK_PRESENT_FOR_ENABLE",
    COLUMN_PRIVILEGES_UNSAFE: "WORKER_ROLE_COLUMN_PRIVILEGES_UNSAFE",
    CURRENT_AUTHORITY_MISMATCH: "CURRENT_AUTHORITY_MISMATCH",
    CURRENT_MARKER_MISSING: "CURRENT_MARKER_MISSING",
    CURRENT_POLICY_MISMATCH: "CURRENT_POLICY_MISMATCH",
    CURRENT_ROLE_BINDING_MISMATCH: "CURRENT_ROLE_BINDING_MISMATCH",
    DATABASE_IDENTITY_INVALID: "MARKER_DATABASE_IDENTITY_INVALID",
    DATABASE_NAME_MISMATCH: "DATABASE_NAME_MISMATCH",
    DATABASE_OID_MISMATCH: "DATABASE_OID_MISMATCH",
    DATABASE_PRIVILEGES_UNSAFE: "WORKER_ROLE_DATABASE_PRIVILEGES_UNSAFE",
    DRAIN_COUNTS_INVALID: "DRAIN_COUNTS_INVALID",
    ENROLLMENT_REVISION_MISMATCH: "ENROLLMENT_REVISION_MISMATCH",
    ENROLLMENT_STATE_INVALID: "ENROLLMENT_STATE_INVALID",
    ENROLLMENT_STATE_MISMATCH: "ENROLLMENT_STATE_MISMATCH",
    ENROLLMENT_TENANT_MISMATCH: "ENROLLMENT_TENANT_MISMATCH",
    FUNCTION_PRIVILEGES_UNSAFE: "WORKER_ROLE_FUNCTION_PRIVILEGES_UNSAFE",
    LOGICAL_SNAPSHOT_INVALID: "LOGICAL_SNAPSHOT_INVALID",
    MARKER_DIGEST_MISMATCH: "MARKER_DIGEST_MISMATCH",
    MARKER_EXPIRED: "MARKER_EXPIRED",
    MARKER_MIGRATION_COUNT_MISMATCH: "MARKER_MIGRATION_COUNT_MISMATCH",
    MARKER_MIGRATION_HEAD_MISMATCH: "MARKER_MIGRATION_HEAD_MISMATCH",
    MARKER_NOT_CURRENT: "MARKER_NOT_CURRENT",
    MARKER_PAYLOAD_DIGEST_INVALID: "MARKER_PAYLOAD_DIGEST_INVALID",
    MARKER_RELEASE_SHA_MISMATCH: "MARKER_RELEASE_SHA_MISMATCH",
    MARKER_REVOKED: "MARKER_REVOKED",
    MARKER_STATE_REVISION_MISMATCH: "MARKER_STATE_REVISION_MISMATCH",
    MIGRATION_COUNT_MISMATCH: "MIGRATION_COUNT_MISMATCH",
    MIGRATION_HEAD_MISMATCH: "MIGRATION_HEAD_MISMATCH",
    POSTGRESQL_MAJOR_MISMATCH: "POSTGRESQL_MAJOR_MISMATCH",
    PROHIBITED_DATA_ACCESSOR: "PROHIBITED_DATA_ACCESSOR",
    PROHIBITED_DATA_BINARY: "PROHIBITED_DATA_BINARY",
    PROHIBITED_DATA_KEY: "PROHIBITED_DATA_KEY",
    PROHIBITED_DATA_STRUCTURE: "PROHIBITED_DATA_STRUCTURE",
    PROHIBITED_DATA_SYMBOL_KEY: "PROHIBITED_DATA_SYMBOL_KEY",
    PROHIBITED_DATA_VALUE: "PROHIBITED_DATA_VALUE",
    PROVIDER_AUTHORITY_DIGEST_MISMATCH: "PROVIDER_AUTHORITY_DIGEST_MISMATCH",
    RELATION_PRIVILEGES_UNSAFE: "WORKER_ROLE_RELATION_PRIVILEGES_UNSAFE",
    ROTATE_TARGET_UNCHANGED: "ROTATE_TARGET_UNCHANGED",
    SCHEMA_PRIVILEGES_UNSAFE: "WORKER_ROLE_SCHEMA_PRIVILEGES_UNSAFE",
    SEQUENCE_PRIVILEGES_UNSAFE: "WORKER_ROLE_SEQUENCE_PRIVILEGES_UNSAFE",
    TARGET_POLICY_MISMATCH: "TARGET_POLICY_MISMATCH",
    TENANT_ID_MISMATCH: "TENANT_ID_MISMATCH",
    TENANT_MISSING: "TENANT_MISSING",
    TRANSACTION_ISOLATION_MISMATCH: "TRANSACTION_ISOLATION_MISMATCH",
    TRANSACTION_NOT_READ_ONLY: "TRANSACTION_NOT_READ_ONLY",
    UNFINISHED_MIGRATION_PRESENT: "UNFINISHED_MIGRATION_PRESENT",
    WORKER_ROLE_ATTRIBUTES_UNSAFE: "WORKER_ROLE_ATTRIBUTES_UNSAFE",
    WORKER_ROLE_MISSING: "WORKER_ROLE_MISSING",
    WORKER_ROLE_NAME_MISMATCH: "WORKER_ROLE_NAME_MISMATCH",
    WORKER_ROLE_OID_MISMATCH: "WORKER_ROLE_OID_MISMATCH",
  },
);

const MAX_POSTGRES_OID = 4_294_967_295;
const SHA_256_PATTERN = /^[0-9a-f]{64}$/u;
const RELEASE_SHA_PATTERN = /^[0-9a-f]{40}$/u;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SAFE_DATABASE_NAME_PATTERN = /^[a-z][a-z0-9_]{0,62}$/u;
const SAFE_ROLE_NAME_PATTERN = /^[a-z_][a-z0-9_]{2,62}$/u;
const SAFE_MIGRATION_NAME_PATTERN = /^\d{14}_[a-z0-9_]+$/u;
const PROHIBITED_KEY_PATTERN =
  /(?:authorizationheader|ciphertext|connectionstring|cookie|databaseurl|email|inviteurl|mailbox|password|rawurl|recipient|registrationurl|secret|smtpusername|smtppassword|token)/iu;
const PROHIBITED_VALUE_PATTERNS = Object.freeze([
  /[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/iu,
  /(?:postgres(?:ql)?|smtp|https?):\/\/\S+/iu,
  /-----BEGIN [A-Z0-9 ]+-----/u,
  /\b(?:DATABASE_URL|PASSWORD|SMTP_PASSWORD|TOKEN|INVITE)=\S+/iu,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/u,
]);

const SNAPSHOT_KEYS = Object.freeze(
  [
    "database",
    "drain",
    "enrollment",
    "marker",
    "providerAuthorityDigest",
    "targetPolicy",
    "tenant",
    "transaction",
    "workerRole",
  ].sort(),
);
const TRANSACTION_KEYS = Object.freeze(["isolation", "readOnly"].sort());
const DATABASE_KEYS = Object.freeze(
  [
    "migrationCount",
    "migrationHead",
    "name",
    "oid",
    "postgresMajor",
    "unfinishedMigrationCount",
  ].sort(),
);
const MARKER_KEYS = Object.freeze(
  [
    "actualContextMatches",
    "buildBindingMatches",
    "challengeBindingMatches",
    "current",
    "databaseIdentityMatches",
    "migrationCount",
    "migrationHead",
    "payloadDigest",
    "payloadDigestMatches",
    "releaseSha",
    "revokedAt",
    "stateRevision",
    "validAtSnapshot",
    "validUntil",
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
const WORKER_ROLE_KEYS = Object.freeze(
  [
    "bypassesRls",
    "canLogin",
    "createsDatabase",
    "createsRole",
    "databaseConnect",
    "databaseCreate",
    "databaseTemporary",
    "deniedFunctionExecuteCount",
    "directColumnPrivilegeCount",
    "directFunctionExecuteCount",
    "directRelationPrivilegeCount",
    "directSchemaCreateCount",
    "directSequencePrivilegeCount",
    "effectiveColumnPrivilegeCount",
    "effectiveFunctionExecuteCount",
    "effectiveRelationPrivilegeCount",
    "effectiveSchemaUsageCount",
    "effectiveSequencePrivilegeCount",
    "functionCatalogViolationCount",
    "grantOptionFunctionCount",
    "hasRoleConfiguration",
    "inherits",
    "liveActivationBindingCount",
    "liveMarkerBindingCount",
    "membershipCount",
    "name",
    "oid",
    "ownedObjectCount",
    "publicExecuteFunctionCount",
    "publicSchemaCreate",
    "publicSchemaUsage",
    "replication",
    "roleSettingCount",
    "superuser",
  ].sort(),
);
const TENANT_KEYS = Object.freeze(["exists", "id"].sort());
const ENROLLMENT_KEYS = Object.freeze(
  [
    "acknowledgeSeconds",
    "baseRetrySeconds",
    "disabledAt",
    "enabled",
    "enabledAt",
    "leaseSeconds",
    "maxAttempts",
    "maxRetrySeconds",
    "policyRevision",
    "providerAuthorityDigest",
    "tenantId",
    "workerRoleName",
    "workerRoleOid",
  ].sort(),
);
const DRAIN_KEYS = Object.freeze(
  ["claimedCount", "markedClaimedCount", "unmarkedClaimedCount"].sort(),
);

export class IdentityMailTenantEnrollmentPreflightError extends Error {
  constructor(reasonCode) {
    super(reasonCode);
    this.name = "IdentityMailTenantEnrollmentPreflightError";
    this.reasonCode = reasonCode;
    this.code = reasonCode;
    this.exitCode = 3;
  }
}

function fail(reasonCode) {
  throw new IdentityMailTenantEnrollmentPreflightError(reasonCode);
}

function exactDataRecord(value, expectedKeys) {
  if (
    !value ||
    Array.isArray(value) ||
    typeof value !== "object" ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  ) {
    return undefined;
  }

  let descriptors;
  try {
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    return undefined;
  }
  const actualKeys = Reflect.ownKeys(descriptors);
  if (actualKeys.some((key) => typeof key !== "string")) {
    return undefined;
  }
  actualKeys.sort();
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index]) ||
    actualKeys.some((key) => !Object.hasOwn(descriptors[key], "value"))
  ) {
    return undefined;
  }

  const copy = Object.create(null);
  for (const key of expectedKeys) {
    copy[key] = descriptors[key].value;
  }
  return copy;
}

function isSafeIntegerBetween(value, minimum, maximum) {
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

function canonicalTimestamp(value) {
  if (typeof value !== "string") return undefined;
  const epochMs = Date.parse(value);
  if (!Number.isFinite(epochMs) || new Date(epochMs).toISOString() !== value) {
    return undefined;
  }
  return epochMs;
}

function parseNow(options) {
  const optionRecord = exactDataRecord(options, ["now"]);
  if (!optionRecord) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_PREFLIGHT_OPTIONS_INVALID");
  }
  const now =
    optionRecord.now instanceof Date
      ? optionRecord.now.valueOf()
      : typeof optionRecord.now === "number"
        ? optionRecord.now
        : typeof optionRecord.now === "string"
          ? Date.parse(optionRecord.now)
          : Number.NaN;
  if (!Number.isSafeInteger(now) || new Date(now).valueOf() !== now) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_PREFLIGHT_CURRENT_TIME_INVALID");
  }
  return now;
}

function normalizePolicy(value) {
  const policy = exactDataRecord(value, POLICY_KEYS);
  if (
    !policy ||
    !isSafeIntegerBetween(policy.maxAttempts, 1, 20) ||
    !isSafeIntegerBetween(policy.leaseSeconds, 30, 900) ||
    !isSafeIntegerBetween(policy.acknowledgeSeconds, 10, 900) ||
    !isSafeIntegerBetween(policy.baseRetrySeconds, 1, 3_600) ||
    !isSafeIntegerBetween(policy.maxRetrySeconds, 1, 86_400) ||
    policy.maxRetrySeconds < policy.baseRetrySeconds
  ) {
    return undefined;
  }
  return {
    acknowledgeSeconds: policy.acknowledgeSeconds,
    baseRetrySeconds: policy.baseRetrySeconds,
    leaseSeconds: policy.leaseSeconds,
    maxAttempts: policy.maxAttempts,
    maxRetrySeconds: policy.maxRetrySeconds,
  };
}

function policyFromEnrollment(enrollment) {
  return {
    acknowledgeSeconds: enrollment.acknowledgeSeconds,
    baseRetrySeconds: enrollment.baseRetrySeconds,
    leaseSeconds: enrollment.leaseSeconds,
    maxAttempts: enrollment.maxAttempts,
    maxRetrySeconds: enrollment.maxRetrySeconds,
  };
}

function policiesEqual(left, right) {
  return POLICY_KEYS.every((key) => left[key] === right[key]);
}

function normalizeLogicalSnapshot(value) {
  const snapshot = exactDataRecord(value, SNAPSHOT_KEYS);
  if (!snapshot || !SHA_256_PATTERN.test(snapshot.providerAuthorityDigest)) {
    return undefined;
  }

  const transaction = exactDataRecord(snapshot.transaction, TRANSACTION_KEYS);
  if (
    !transaction ||
    typeof transaction.isolation !== "string" ||
    typeof transaction.readOnly !== "boolean"
  ) {
    return undefined;
  }

  const database = exactDataRecord(snapshot.database, DATABASE_KEYS);
  if (
    !database ||
    !SAFE_DATABASE_NAME_PATTERN.test(database.name) ||
    !isSafeIntegerBetween(database.oid, 1, MAX_POSTGRES_OID) ||
    !isSafeIntegerBetween(database.postgresMajor, 1, 99) ||
    !SAFE_MIGRATION_NAME_PATTERN.test(database.migrationHead) ||
    !isSafeIntegerBetween(database.migrationCount, 0, 100_000) ||
    !isSafeIntegerBetween(database.unfinishedMigrationCount, 0, 100_000)
  ) {
    return undefined;
  }

  let marker = null;
  if (snapshot.marker !== null) {
    marker = exactDataRecord(snapshot.marker, MARKER_KEYS);
    if (
      !marker ||
      typeof marker.current !== "boolean" ||
      !SHA_256_PATTERN.test(marker.payloadDigest) ||
      !RELEASE_SHA_PATTERN.test(marker.releaseSha) ||
      !SAFE_MIGRATION_NAME_PATTERN.test(marker.migrationHead) ||
      !isSafeIntegerBetween(marker.migrationCount, 0, 100_000) ||
      !isSafeIntegerBetween(marker.stateRevision, 0, 100_000) ||
      (marker.revokedAt !== null &&
        canonicalTimestamp(marker.revokedAt) === undefined) ||
      canonicalTimestamp(marker.validUntil) === undefined ||
      [
        marker.payloadDigestMatches,
        marker.buildBindingMatches,
        marker.challengeBindingMatches,
        marker.databaseIdentityMatches,
        marker.actualContextMatches,
        marker.validAtSnapshot,
      ].some((entry) => typeof entry !== "boolean")
    ) {
      return undefined;
    }
    marker = {
      actualContextMatches: marker.actualContextMatches,
      buildBindingMatches: marker.buildBindingMatches,
      challengeBindingMatches: marker.challengeBindingMatches,
      current: marker.current,
      databaseIdentityMatches: marker.databaseIdentityMatches,
      migrationCount: marker.migrationCount,
      migrationHead: marker.migrationHead,
      payloadDigest: marker.payloadDigest,
      payloadDigestMatches: marker.payloadDigestMatches,
      releaseSha: marker.releaseSha,
      revokedAt: marker.revokedAt,
      stateRevision: marker.stateRevision,
      validAtSnapshot: marker.validAtSnapshot,
      validUntil: marker.validUntil,
    };
  }

  const targetPolicy = normalizePolicy(snapshot.targetPolicy);
  if (!targetPolicy) return undefined;

  let workerRole = null;
  if (snapshot.workerRole !== null) {
    workerRole = exactDataRecord(snapshot.workerRole, WORKER_ROLE_KEYS);
    const booleanKeys = [
      "bypassesRls",
      "canLogin",
      "createsDatabase",
      "createsRole",
      "databaseConnect",
      "databaseCreate",
      "databaseTemporary",
      "hasRoleConfiguration",
      "inherits",
      "publicSchemaCreate",
      "publicSchemaUsage",
      "replication",
      "superuser",
    ];
    const countKeys = WORKER_ROLE_KEYS.filter(
      (key) => key.endsWith("Count") && !["name", "oid"].includes(key),
    );
    if (
      !workerRole ||
      !SAFE_ROLE_NAME_PATTERN.test(workerRole.name) ||
      !isSafeIntegerBetween(workerRole.oid, 1, MAX_POSTGRES_OID) ||
      booleanKeys.some((key) => typeof workerRole[key] !== "boolean") ||
      countKeys.some(
        (key) => !isSafeIntegerBetween(workerRole[key], 0, 1_000_000),
      )
    ) {
      return undefined;
    }
    workerRole = Object.fromEntries(
      WORKER_ROLE_KEYS.map((key) => [key, workerRole[key]]),
    );
  }

  const tenant = exactDataRecord(snapshot.tenant, TENANT_KEYS);
  if (
    !tenant ||
    typeof tenant.exists !== "boolean" ||
    (tenant.id !== null && !UUID_PATTERN.test(tenant.id)) ||
    (tenant.exists && tenant.id === null) ||
    (!tenant.exists && tenant.id !== null)
  ) {
    return undefined;
  }

  let enrollment = null;
  if (snapshot.enrollment !== null) {
    enrollment = exactDataRecord(snapshot.enrollment, ENROLLMENT_KEYS);
    if (
      !enrollment ||
      !UUID_PATTERN.test(enrollment.tenantId) ||
      !SAFE_ROLE_NAME_PATTERN.test(enrollment.workerRoleName) ||
      !isSafeIntegerBetween(enrollment.workerRoleOid, 1, MAX_POSTGRES_OID) ||
      !isSafeIntegerBetween(enrollment.policyRevision, 1, 1_000_000_000) ||
      typeof enrollment.enabled !== "boolean" ||
      !isSafeIntegerBetween(enrollment.maxAttempts, 1, 20) ||
      !isSafeIntegerBetween(enrollment.leaseSeconds, 1, 900) ||
      !isSafeIntegerBetween(enrollment.acknowledgeSeconds, 1, 900) ||
      !isSafeIntegerBetween(enrollment.baseRetrySeconds, 1, 3_600) ||
      !isSafeIntegerBetween(enrollment.maxRetrySeconds, 1, 86_400) ||
      !SHA_256_PATTERN.test(enrollment.providerAuthorityDigest) ||
      ![null, "string"].includes(
        enrollment.enabledAt === null ? null : typeof enrollment.enabledAt,
      ) ||
      ![null, "string"].includes(
        enrollment.disabledAt === null ? null : typeof enrollment.disabledAt,
      )
    ) {
      return undefined;
    }
    enrollment = Object.fromEntries(
      ENROLLMENT_KEYS.map((key) => [key, enrollment[key]]),
    );
  }

  const drain = exactDataRecord(snapshot.drain, DRAIN_KEYS);
  if (
    !drain ||
    DRAIN_KEYS.some(
      (key) => !isSafeIntegerBetween(drain[key], 0, 1_000_000_000),
    )
  ) {
    return undefined;
  }

  return {
    database: {
      migrationCount: database.migrationCount,
      migrationHead: database.migrationHead,
      name: database.name,
      oid: database.oid,
      postgresMajor: database.postgresMajor,
      unfinishedMigrationCount: database.unfinishedMigrationCount,
    },
    drain: {
      claimedCount: drain.claimedCount,
      markedClaimedCount: drain.markedClaimedCount,
      unmarkedClaimedCount: drain.unmarkedClaimedCount,
    },
    enrollment,
    marker,
    providerAuthorityDigest: snapshot.providerAuthorityDigest,
    targetPolicy,
    tenant: { exists: tenant.exists, id: tenant.id },
    transaction: {
      isolation: transaction.isolation,
      readOnly: transaction.readOnly,
    },
    workerRole,
  };
}

function recursiveProhibitedDataFindings(value) {
  const findings = new Set();
  const seen = new WeakSet();

  function visit(candidate) {
    if (typeof candidate === "string") {
      if (
        PROHIBITED_VALUE_PATTERNS.some((pattern) => pattern.test(candidate))
      ) {
        findings.add(
          IDENTITY_MAIL_TENANT_ENROLLMENT_PREFLIGHT_FINDINGS.PROHIBITED_DATA_VALUE,
        );
      }
      return;
    }
    if (
      candidate === null ||
      ["boolean", "number"].includes(typeof candidate)
    ) {
      return;
    }
    if (
      ["bigint", "function", "symbol", "undefined"].includes(typeof candidate)
    ) {
      findings.add(
        IDENTITY_MAIL_TENANT_ENROLLMENT_PREFLIGHT_FINDINGS.PROHIBITED_DATA_STRUCTURE,
      );
      return;
    }
    if (typeof candidate !== "object") return;

    if (candidate instanceof ArrayBuffer || ArrayBuffer.isView(candidate)) {
      findings.add(
        IDENTITY_MAIL_TENANT_ENROLLMENT_PREFLIGHT_FINDINGS.PROHIBITED_DATA_BINARY,
      );
      return;
    }
    if (seen.has(candidate)) {
      findings.add(
        IDENTITY_MAIL_TENANT_ENROLLMENT_PREFLIGHT_FINDINGS.PROHIBITED_DATA_STRUCTURE,
      );
      return;
    }
    seen.add(candidate);

    let prototype;
    let descriptors;
    try {
      prototype = Object.getPrototypeOf(candidate);
      descriptors = Object.getOwnPropertyDescriptors(candidate);
    } catch {
      findings.add(
        IDENTITY_MAIL_TENANT_ENROLLMENT_PREFLIGHT_FINDINGS.PROHIBITED_DATA_STRUCTURE,
      );
      return;
    }
    if (
      !Array.isArray(candidate) &&
      ![Object.prototype, null].includes(prototype)
    ) {
      findings.add(
        IDENTITY_MAIL_TENANT_ENROLLMENT_PREFLIGHT_FINDINGS.PROHIBITED_DATA_STRUCTURE,
      );
      return;
    }

    for (const key of Reflect.ownKeys(descriptors)) {
      if (typeof key !== "string") {
        findings.add(
          IDENTITY_MAIL_TENANT_ENROLLMENT_PREFLIGHT_FINDINGS.PROHIBITED_DATA_SYMBOL_KEY,
        );
        continue;
      }
      if (PROHIBITED_KEY_PATTERN.test(key)) {
        findings.add(
          IDENTITY_MAIL_TENANT_ENROLLMENT_PREFLIGHT_FINDINGS.PROHIBITED_DATA_KEY,
        );
      }
      const descriptor = descriptors[key];
      if (!Object.hasOwn(descriptor, "value")) {
        findings.add(
          IDENTITY_MAIL_TENANT_ENROLLMENT_PREFLIGHT_FINDINGS.PROHIBITED_DATA_ACCESSOR,
        );
        continue;
      }
      visit(descriptor.value);
    }
  }

  try {
    visit(value);
  } catch {
    findings.add(
      IDENTITY_MAIL_TENANT_ENROLLMENT_PREFLIGHT_FINDINGS.PROHIBITED_DATA_STRUCTURE,
    );
  }
  return [...findings].sort();
}

export function identityMailTenantEnrollmentPreflightProhibitedDataFindings(
  value,
) {
  return Object.freeze(recursiveProhibitedDataFindings(value));
}

export function mapIdentityMailTenantEnrollmentLegacyState(enrollment) {
  if (enrollment === null) return "ABSENT";
  if (
    !enrollment ||
    Array.isArray(enrollment) ||
    typeof enrollment !== "object" ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(enrollment))
  ) {
    return "INVALID";
  }

  let descriptors;
  try {
    descriptors = Object.getOwnPropertyDescriptors(enrollment);
  } catch {
    return "INVALID";
  }
  for (const key of ["enabled", "enabledAt", "disabledAt"]) {
    if (
      !Object.hasOwn(descriptors, key) ||
      !Object.hasOwn(descriptors[key], "value")
    ) {
      return "INVALID";
    }
  }
  const enabled = descriptors.enabled.value;
  const enabledAt = descriptors.enabledAt.value;
  const disabledAt = descriptors.disabledAt.value;
  const enabledAtMs = canonicalTimestamp(enabledAt);
  const disabledAtMs = canonicalTimestamp(disabledAt);

  if (enabled === true && enabledAtMs !== undefined && disabledAt === null) {
    return "ACTIVE";
  }
  if (
    enabled === false &&
    ((enabledAt === null && disabledAt === null) ||
      (enabledAtMs !== undefined &&
        disabledAtMs !== undefined &&
        disabledAtMs >= enabledAtMs))
  ) {
    return "DISABLED";
  }
  return "INVALID";
}

function addWorkerRoleFindings(findings, proposal, workerRole) {
  const codes = IDENTITY_MAIL_TENANT_ENROLLMENT_PREFLIGHT_FINDINGS;
  if (workerRole === null) {
    findings.add(codes.WORKER_ROLE_MISSING);
    return;
  }
  if (workerRole.name !== proposal.workerRoleName) {
    findings.add(codes.WORKER_ROLE_NAME_MISMATCH);
  }
  if (workerRole.oid !== proposal.workerRoleOid) {
    findings.add(codes.WORKER_ROLE_OID_MISMATCH);
  }
  if (
    !workerRole.canLogin ||
    workerRole.inherits ||
    workerRole.superuser ||
    workerRole.createsDatabase ||
    workerRole.createsRole ||
    workerRole.replication ||
    workerRole.bypassesRls ||
    workerRole.hasRoleConfiguration ||
    workerRole.membershipCount !== 0 ||
    workerRole.roleSettingCount !== 0 ||
    workerRole.ownedObjectCount !== 0
  ) {
    findings.add(codes.WORKER_ROLE_ATTRIBUTES_UNSAFE);
  }
  if (
    !workerRole.databaseConnect ||
    workerRole.databaseCreate ||
    workerRole.databaseTemporary
  ) {
    findings.add(codes.DATABASE_PRIVILEGES_UNSAFE);
  }
  if (
    !workerRole.publicSchemaUsage ||
    workerRole.publicSchemaCreate ||
    workerRole.directSchemaCreateCount !== 0 ||
    workerRole.effectiveSchemaUsageCount !== 1
  ) {
    findings.add(codes.SCHEMA_PRIVILEGES_UNSAFE);
  }
  if (
    workerRole.directRelationPrivilegeCount !== 0 ||
    workerRole.effectiveRelationPrivilegeCount !== 0
  ) {
    findings.add(codes.RELATION_PRIVILEGES_UNSAFE);
  }
  if (
    workerRole.directColumnPrivilegeCount !== 0 ||
    workerRole.effectiveColumnPrivilegeCount !== 0
  ) {
    findings.add(codes.COLUMN_PRIVILEGES_UNSAFE);
  }
  if (
    workerRole.directSequencePrivilegeCount !== 0 ||
    workerRole.effectiveSequencePrivilegeCount !== 0
  ) {
    findings.add(codes.SEQUENCE_PRIVILEGES_UNSAFE);
  }
  if (
    workerRole.directFunctionExecuteCount !==
      IDENTITY_MAIL_TENANT_ENROLLMENT_PREFLIGHT_WORKER_RPC_COUNT ||
    workerRole.effectiveFunctionExecuteCount !==
      IDENTITY_MAIL_TENANT_ENROLLMENT_PREFLIGHT_WORKER_RPC_COUNT ||
    workerRole.deniedFunctionExecuteCount !== 0 ||
    workerRole.publicExecuteFunctionCount !== 0 ||
    workerRole.grantOptionFunctionCount !== 0
  ) {
    findings.add(codes.FUNCTION_PRIVILEGES_UNSAFE);
  }
  if (workerRole.functionCatalogViolationCount !== 0) {
    findings.add(codes.CATALOG_INVALID);
  }
  if (
    workerRole.liveActivationBindingCount !== 0 ||
    workerRole.liveMarkerBindingCount !== 0
  ) {
    findings.add(codes.ACTIVATION_BINDING_PRESENT);
  }
}

function snapshotFindings(proposal, snapshot) {
  const codes = IDENTITY_MAIL_TENANT_ENROLLMENT_PREFLIGHT_FINDINGS;
  const findings = new Set();

  if (!snapshot.transaction.readOnly) {
    findings.add(codes.TRANSACTION_NOT_READ_ONLY);
  }
  if (snapshot.transaction.isolation !== "REPEATABLE_READ") {
    findings.add(codes.TRANSACTION_ISOLATION_MISMATCH);
  }
  if (snapshot.database.name !== proposal.expectedDatabaseName) {
    findings.add(codes.DATABASE_NAME_MISMATCH);
  }
  if (snapshot.database.oid !== proposal.expectedDatabaseOid) {
    findings.add(codes.DATABASE_OID_MISMATCH);
  }
  if (snapshot.database.postgresMajor !== 16) {
    findings.add(codes.POSTGRESQL_MAJOR_MISMATCH);
  }
  if (
    snapshot.database.migrationHead !==
    IDENTITY_MAIL_TENANT_ENROLLMENT_PREFLIGHT_MIGRATION
  ) {
    findings.add(codes.MIGRATION_HEAD_MISMATCH);
  }
  if (
    snapshot.database.migrationCount !==
    IDENTITY_MAIL_TENANT_ENROLLMENT_PREFLIGHT_MIGRATION_COUNT
  ) {
    findings.add(codes.MIGRATION_COUNT_MISMATCH);
  }
  if (snapshot.database.unfinishedMigrationCount !== 0) {
    findings.add(codes.UNFINISHED_MIGRATION_PRESENT);
  }

  if (snapshot.marker === null) {
    findings.add(codes.CURRENT_MARKER_MISSING);
  } else {
    if (!snapshot.marker.current) findings.add(codes.MARKER_NOT_CURRENT);
    if (snapshot.marker.stateRevision !== 1) {
      findings.add(codes.MARKER_STATE_REVISION_MISMATCH);
    }
    if (snapshot.marker.revokedAt !== null) {
      findings.add(codes.MARKER_REVOKED);
    }
    if (!snapshot.marker.validAtSnapshot) {
      findings.add(codes.MARKER_EXPIRED);
    }
    if (snapshot.marker.payloadDigest !== proposal.deploymentMarkerDigest) {
      findings.add(codes.MARKER_DIGEST_MISMATCH);
    }
    if (snapshot.marker.releaseSha !== proposal.releaseSha) {
      findings.add(codes.MARKER_RELEASE_SHA_MISMATCH);
    }
    if (
      snapshot.marker.migrationHead !== snapshot.database.migrationHead ||
      snapshot.marker.migrationHead !==
        IDENTITY_MAIL_TENANT_ENROLLMENT_PREFLIGHT_MIGRATION
    ) {
      findings.add(codes.MARKER_MIGRATION_HEAD_MISMATCH);
    }
    if (
      snapshot.marker.migrationCount !== snapshot.database.migrationCount ||
      snapshot.marker.migrationCount !==
        IDENTITY_MAIL_TENANT_ENROLLMENT_PREFLIGHT_MIGRATION_COUNT
    ) {
      findings.add(codes.MARKER_MIGRATION_COUNT_MISMATCH);
    }
    if (!snapshot.marker.payloadDigestMatches) {
      findings.add(codes.MARKER_PAYLOAD_DIGEST_INVALID);
    }
    if (!snapshot.marker.buildBindingMatches) {
      findings.add(codes.BUILD_BINDING_INVALID);
    }
    if (!snapshot.marker.challengeBindingMatches) {
      findings.add(codes.CHALLENGE_BINDING_INVALID);
    }
    if (!snapshot.marker.databaseIdentityMatches) {
      findings.add(codes.DATABASE_IDENTITY_INVALID);
    }
    if (!snapshot.marker.actualContextMatches) {
      findings.add(codes.ACTUAL_CONTEXT_INVALID);
    }
  }

  if (snapshot.providerAuthorityDigest !== proposal.providerAuthorityDigest) {
    findings.add(codes.PROVIDER_AUTHORITY_DIGEST_MISMATCH);
  }
  if (!policiesEqual(snapshot.targetPolicy, proposal.policy)) {
    findings.add(codes.TARGET_POLICY_MISMATCH);
  }
  addWorkerRoleFindings(findings, proposal, snapshot.workerRole);

  if (!snapshot.tenant.exists) {
    findings.add(codes.TENANT_MISSING);
  } else if (snapshot.tenant.id !== proposal.tenantId) {
    findings.add(codes.TENANT_ID_MISMATCH);
  }

  const state = mapIdentityMailTenantEnrollmentLegacyState(snapshot.enrollment);
  const revision = snapshot.enrollment?.policyRevision ?? 0;
  if (state === "INVALID") {
    findings.add(codes.ENROLLMENT_STATE_INVALID);
  } else if (state !== proposal.expectedState) {
    findings.add(codes.ENROLLMENT_STATE_MISMATCH);
  }
  if (revision !== proposal.expectedRevision) {
    findings.add(codes.ENROLLMENT_REVISION_MISMATCH);
  }
  if (
    snapshot.enrollment !== null &&
    snapshot.enrollment.tenantId !== proposal.tenantId
  ) {
    findings.add(codes.ENROLLMENT_TENANT_MISMATCH);
  }

  if (proposal.action === "DISABLE" && snapshot.enrollment !== null) {
    if (
      snapshot.enrollment.workerRoleName !== proposal.workerRoleName ||
      snapshot.enrollment.workerRoleOid !== proposal.workerRoleOid
    ) {
      findings.add(codes.CURRENT_ROLE_BINDING_MISMATCH);
    }
    if (
      !policiesEqual(policyFromEnrollment(snapshot.enrollment), proposal.policy)
    ) {
      findings.add(codes.CURRENT_POLICY_MISMATCH);
    }
    if (
      snapshot.enrollment.providerAuthorityDigest !==
      proposal.providerAuthorityDigest
    ) {
      findings.add(codes.CURRENT_AUTHORITY_MISMATCH);
    }
  }

  if (
    proposal.action === "ROTATE" &&
    snapshot.enrollment !== null &&
    snapshot.enrollment.workerRoleName === proposal.workerRoleName &&
    snapshot.enrollment.workerRoleOid === proposal.workerRoleOid &&
    snapshot.enrollment.providerAuthorityDigest ===
      proposal.providerAuthorityDigest &&
    policiesEqual(policyFromEnrollment(snapshot.enrollment), proposal.policy)
  ) {
    findings.add(codes.ROTATE_TARGET_UNCHANGED);
  }

  if (
    snapshot.drain.claimedCount !==
    snapshot.drain.unmarkedClaimedCount + snapshot.drain.markedClaimedCount
  ) {
    findings.add(codes.DRAIN_COUNTS_INVALID);
  }
  if (proposal.action === "ENABLE" && snapshot.drain.claimedCount !== 0) {
    findings.add(codes.CLAIMED_WORK_PRESENT_FOR_ENABLE);
  }

  return {
    findings: [...findings].sort(),
    revision,
    state,
  };
}

function sha256(value) {
  return createHash("sha256")
    .update(JSON.stringify(value), "utf8")
    .digest("hex");
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function proposalReceipt(proposal) {
  return {
    action: proposal.action,
    contentDigest: proposal.contentDigest,
    deploymentMarkerDigest: proposal.deploymentMarkerDigest,
    expectedDatabaseName: proposal.expectedDatabaseName,
    expectedDatabaseOid: proposal.expectedDatabaseOid,
    expectedRevision: proposal.expectedRevision,
    expectedState: proposal.expectedState,
    nextRevision: proposal.nextRevision,
    policy: { ...proposal.policy },
    providerAuthorityDigest: proposal.providerAuthorityDigest,
    releaseSha: proposal.releaseSha,
    requestId: proposal.requestId,
    runtimeConfigDigest: proposal.runtimeConfigDigest,
    tenantId: proposal.tenantId,
    workerRoleName: proposal.workerRoleName,
    workerRoleOid: proposal.workerRoleOid,
  };
}

function observedReceipt(snapshot, state, revision) {
  if (!snapshot) return null;
  return {
    database: { ...snapshot.database },
    drain: { ...snapshot.drain },
    enrollment: {
      present: snapshot.enrollment !== null,
      revision,
      state,
    },
    marker:
      snapshot.marker === null
        ? null
        : {
            current: snapshot.marker.current,
            migrationCount: snapshot.marker.migrationCount,
            migrationHead: snapshot.marker.migrationHead,
            payloadDigest: snapshot.marker.payloadDigest,
            releaseSha: snapshot.marker.releaseSha,
            stateRevision: snapshot.marker.stateRevision,
          },
    providerAuthorityDigest: snapshot.providerAuthorityDigest,
    targetPolicy: { ...snapshot.targetPolicy },
    tenant: { ...snapshot.tenant },
    transaction: { ...snapshot.transaction },
    workerRole:
      snapshot.workerRole === null
        ? null
        : { name: snapshot.workerRole.name, oid: snapshot.workerRole.oid },
  };
}

function buildReport({ findings, nowMs, observed, proposal, snapshotDigest }) {
  const payload = {
    authorization: false,
    canMutate: false,
    contract: IDENTITY_MAIL_TENANT_ENROLLMENT_PREFLIGHT_CONTRACT,
    deferredControls: [
      ...IDENTITY_MAIL_TENANT_ENROLLMENT_PREFLIGHT_DEFERRED_CONTROLS,
    ],
    drainComplete:
      observed === null || proposal.action === "ENABLE"
        ? null
        : observed.drain.claimedCount === 0,
    drainRequired: proposal.action !== "ENABLE",
    findings: [...new Set(findings)].sort(),
    inspectionDecision: findings.length === 0 ? "MATCHED" : "BLOCKED",
    observed,
    observedAt: new Date(nowMs).toISOString(),
    proposal: proposalReceipt(proposal),
    runtimeConfigDigestEvaluation: "DEFERRED",
    schemaVersion: IDENTITY_MAIL_TENANT_ENROLLMENT_PREFLIGHT_SCHEMA_VERSION,
    snapshotDigest,
  };
  return deepFreeze({ ...payload, reportDigest: sha256(payload) });
}

/**
 * Pure, non-authorizing evaluation of one parsed proposal against a logical
 * snapshot collected elsewhere. This module performs no database, filesystem
 * or network I/O and deliberately has no mutation path.
 */
export function evaluateIdentityMailTenantEnrollmentPreflight(
  proposalInput,
  logicalSnapshot,
  options,
) {
  const nowMs = parseNow(options);
  const proposal = parseIdentityMailTenantEnrollmentProposal(proposalInput, {
    now: nowMs,
  });
  const prohibitedFindings =
    identityMailTenantEnrollmentPreflightProhibitedDataFindings(
      logicalSnapshot,
    );
  if (prohibitedFindings.length > 0) {
    return buildReport({
      findings: prohibitedFindings,
      nowMs,
      observed: null,
      proposal,
      snapshotDigest: null,
    });
  }

  const snapshot = normalizeLogicalSnapshot(logicalSnapshot);
  if (!snapshot) {
    return buildReport({
      findings: [
        IDENTITY_MAIL_TENANT_ENROLLMENT_PREFLIGHT_FINDINGS.LOGICAL_SNAPSHOT_INVALID,
      ],
      nowMs,
      observed: null,
      proposal,
      snapshotDigest: null,
    });
  }

  const evaluation = snapshotFindings(proposal, snapshot);
  return buildReport({
    findings: evaluation.findings,
    nowMs,
    observed: observedReceipt(snapshot, evaluation.state, evaluation.revision),
    proposal,
    snapshotDigest: sha256(snapshot),
  });
}

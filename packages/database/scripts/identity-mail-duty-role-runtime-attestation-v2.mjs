import {
  createHash,
  createPublicKey,
  verify as verifySignature,
} from "node:crypto";
import { types as utilTypes } from "node:util";

import { canonicalStringify } from "./staff-task-integrity-canonical-json.mjs";

export const IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_SIGNATURE_ALGORITHM =
  "Ed25519";
export const IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_TRUST_DOMAIN =
  "LEETPLUS_IDENTITY_MAIL_DUTY_ROLE_RUNTIME_AUTHORITY_V2";
export const IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_PURPOSE =
  "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION";
export const IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_PROFILE =
  "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_PROFILE_V2";
export const IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_KIND =
  "LEETPLUS_IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION";
export const IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_CONTRACT =
  "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2";
export const IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_CATALOG_CONTRACT =
  "IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_V1";
export const IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_CATALOG_PROFILE =
  "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_BOUNDARY_PG16_V1";
export const IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_GRANTS_PROFILE =
  "IDENTITY_MAIL_DUTY_GRANTS_PG16_V1";
export const IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_APPLICATION_CONTRACT =
  "IDENTITY_MAIL_TENANT_ENROLLMENT_MANIFEST_BOUND_V2";
export const IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_ACL_EPOCH_DIGEST_DOMAIN =
  "LEETPLUS_IDENTITY_MAIL_DUTY_ROLE_ACL_EPOCH_CURRENT186_V1";
export const IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_ACL_REASON_CODES =
  Object.freeze(["APPLY", "EMERGENCY_CONTAINMENT", "ROLLBACK", "ROTATE"]);
export const IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_ROLE_NAMES =
  Object.freeze({
    coordinator: "identity_mail_enrollment_coordinator",
    schemaOwner: "identity_mail_schema_owner",
    worker: "identity_mail_worker_v2",
  });
export const IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_SCHEMA_HEAD =
  "20260803010000_identity_mail_duty_role_runtime_boundary_v2";
export const IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_MIGRATION_COUNT = 186;

// These constants bind the accepted PostgreSQL 16 CURRENT179 -> CURRENT186
// fixture: normalized head SQL bytes plus its complete 186-row DB manifest.
export const IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_HEAD_MIGRATION_SHA256 =
  "7a1a0453b883d6bbf8640eff8c39b007376286b0f21d31f766771fead65a93dd";
export const IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_HEAD_MANIFEST_SHA256 =
  "3bbf04f88643d94076be96c3ae714c441454e6a7fcd6107af5bd194dca579ed6";
export const IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_DEFINITION_MANIFEST_SHA256 =
  "2ac0ff62303d899a70b7600749fcd895f184523ef9dc9fc74d9b60a44eca9109";
export const IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_SYSTEM_PUBLIC_ACL_BASELINE_SHA256 =
  "ad50619e4ea13c2923f089fa4e6ac003cb56da160a30e40d61359ac034097117";
export const IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_SCOPE =
  Object.freeze({
    applicationRoleAllowlistBound: false,
    authorityScope: "CURRENT_DATABASE_ONLY",
    crossDatabaseAuthorityControlled: false,
    futureCreatorDefaultPrivilegesControlled: false,
    productionApplyAuthorized: false,
  });

export const IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_MAX_LIFETIME_MS =
  5 * 60 * 1_000;
export const IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_MAX_CLOCK_SKEW_MS =
  30 * 1_000;
export const IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_SYNTHETIC_CONFIRMATION =
  "allow-synthetic-identity-mail-duty-role-runtime-attestation-v2-loopback-ci";

// Deliberately empty. Production trust requires an independently reviewed root
// enrollment ceremony. Callers and environment variables cannot extend it.
export const PINNED_IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_ROOTS =
  Object.freeze({});

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SHA_256_PATTERN = /^[0-9a-f]{64}$/u;
const RELEASE_SHA_PATTERN = /^[0-9a-f]{40}$/u;
const KEY_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{2,63}$/u;
const SAFE_POSTGRES_DATABASE_PATTERN = /^[a-z][a-z0-9_]{0,62}$/u;
const SAFE_POSTGRES_ROLE_PATTERN = /^[a-z_][a-z0-9_]{2,62}$/u;
const POSITIVE_BIGINT_PATTERN = /^[1-9][0-9]{0,18}$/u;
const CI_DATABASE_PATTERN = /(?:^|[_-])(?:ci|test|testing)(?:$|[_-])/u;
const PRODUCTION_DATABASE_PATTERN =
  /(?:^|[_-])(?:live|prod|production)(?:$|[_-])/u;
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const SYSTEM_DATABASES = new Set(["postgres", "template0", "template1"]);
const MAX_POSTGRES_OID = 4_294_967_295;
const MAX_POSTGRES_BIGINT = 9_223_372_036_854_775_807n;
const ZERO_SHA256 = "0".repeat(64);

const ENVELOPE_KEYS = Object.freeze(
  [
    "payload",
    "payloadDigest",
    "publicKeyFingerprint",
    "signature",
    "signatureAlgorithm",
    "signingKeyId",
  ].sort(),
);
const ROOT_KEYS = Object.freeze(
  [
    "algorithm",
    "keyId",
    "notAfter",
    "notBefore",
    "profile",
    "publicKeyFingerprint",
    "publicKeyPem",
    "purpose",
    "status",
    "trustDomain",
  ].sort(),
);
const ROLE_BINDING_KEYS = Object.freeze(["name", "oid"].sort());
const ROLES_KEYS = Object.freeze(
  ["coordinator", "schemaOwner", "worker"].sort(),
);
const STATE_DIGEST_KEYS = Object.freeze(
  [
    "aclEpoch",
    "aclEpochDigestDomain",
    "aclEpochPayloadDigest",
    "aclReasonCode",
    "applicationRoleAllowlistBound",
    "applyReceiptDigest",
    "authorityScope",
    "beforeCatalogDigest",
    "operationId",
    "catalogContract",
    "databaseIdentityDigest",
    "databaseName",
    "databaseOid",
    "catalogDigest",
    "catalogProfile",
    "crossDatabaseAuthorityControlled",
    "definitionManifestDigest",
    "deploymentRoleName",
    "deploymentRoleOid",
    "directDutyAclDigest",
    "evidenceDigest",
    "exactGrantsDigest",
    "exactGrantsProfile",
    "futureCreatorDefaultPrivilegesControlled",
    "ownerSurfaceDigest",
    "planDigest",
    "productionApplyAuthorized",
    "roles",
    "systemPublicAclBaselineDigest",
  ].sort(),
);
const BINDING_KEYS = Object.freeze(
  [
    "actualContextDigest",
    "aclEpoch",
    "aclEpochDigestDomain",
    "aclEpochPayloadDigest",
    "aclReasonCode",
    "applicationRoleAllowlistBound",
    "applyReceiptDigest",
    "operationId",
    "applicationContract",
    "authorityScope",
    "beforeCatalogDigest",
    "catalogContract",
    "databaseIdentityDigest",
    "databaseName",
    "databaseOid",
    "deploymentMarkerDigest",
    "deploymentMarkerId",
    "deploymentRoleName",
    "deploymentRoleOid",
    "definitionManifestDigest",
    "directDutyAclDigest",
    "evidenceDigest",
    "exactGrantsDigest",
    "exactGrantsProfile",
    "crossDatabaseAuthorityControlled",
    "futureCreatorDefaultPrivilegesControlled",
    "migrationManifestDigest",
    "migrationHeadChecksum",
    "catalogDigest",
    "catalogProfile",
    "migrationCount",
    "ownerSurfaceDigest",
    "planDigest",
    "productionApplyAuthorized",
    "applicationArtifactSha256",
    "applicationReleaseSha",
    "roles",
    "runtimeConfigDigest",
    "runtimeStateDigest",
    "schemaHead",
    "systemPublicAclBaselineDigest",
    "verificationChallengeDigest",
    "workerArtifactSha256",
    "workerExecutableSha256",
  ].sort(),
);
const PAYLOAD_KEYS = Object.freeze(
  [
    ...BINDING_KEYS,
    "attestationId",
    "contract",
    "issuedAt",
    "kind",
    "profile",
    "publicKeyFingerprint",
    "purpose",
    "schemaVersion",
    "signingKeyId",
    "trustDomain",
    "validUntil",
  ].sort(),
);
const SYNTHETIC_CONTEXT_KEYS = Object.freeze(
  [
    "databaseName",
    "environment",
    "explicitConfirmation",
    "hostname",
    "nodeEnv",
  ].sort(),
);

const VERIFIED_ATTESTATIONS = new WeakSet();

export class IdentityMailDutyRoleRuntimeAttestationV2Error extends Error {
  constructor(reasonCode, message) {
    super(message);
    this.name = "IdentityMailDutyRoleRuntimeAttestationV2Error";
    this.reasonCode = reasonCode;
    this.code = reasonCode;
    this.exitCode = 3;
    this.safeContractError = true;
  }
}

function fail(reasonCode, message) {
  throw new IdentityMailDutyRoleRuntimeAttestationV2Error(reasonCode, message);
}

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function exactDataRecord(value, expectedKeys, reasonCode, message) {
  if (
    !value ||
    Array.isArray(value) ||
    typeof value !== "object" ||
    utilTypes.isProxy(value)
  ) {
    fail(reasonCode, message);
  }

  let prototype;
  let descriptors;
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    fail(reasonCode, message);
  }
  if (prototype !== Object.prototype && prototype !== null) {
    fail(reasonCode, message);
  }

  const actualKeys = Reflect.ownKeys(descriptors);
  if (actualKeys.some((key) => typeof key !== "string")) {
    fail(reasonCode, message);
  }
  actualKeys.sort(compareStrings);
  const wantedKeys = [...expectedKeys].sort(compareStrings);
  if (
    actualKeys.length !== wantedKeys.length ||
    actualKeys.some((key, index) => key !== wantedKeys[index]) ||
    actualKeys.some((key) => {
      const descriptor = descriptors[key];
      return (
        !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true
      );
    })
  ) {
    fail(reasonCode, message);
  }

  const snapshot = Object.create(null);
  for (const key of wantedKeys) {
    snapshot[key] = descriptors[key].value;
  }
  return Object.freeze(snapshot);
}

function dataOnlyRegistryEntries(value) {
  if (
    !value ||
    Array.isArray(value) ||
    typeof value !== "object" ||
    utilTypes.isProxy(value)
  ) {
    fail(
      "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_ROOTS_INVALID",
      "The runtime-attestation authority registry is invalid.",
    );
  }

  let prototype;
  let descriptors;
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    fail(
      "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_ROOTS_INVALID",
      "The runtime-attestation authority registry is invalid.",
    );
  }
  if (prototype !== Object.prototype && prototype !== null) {
    fail(
      "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_ROOTS_INVALID",
      "The runtime-attestation authority registry is invalid.",
    );
  }

  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.some((key) => typeof key !== "string") ||
    keys.some((key) => {
      const descriptor = descriptors[key];
      return (
        !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true
      );
    })
  ) {
    fail(
      "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_ROOTS_INVALID",
      "The runtime-attestation authority registry is invalid.",
    );
  }
  return keys.sort(compareStrings).map((key) => [key, descriptors[key].value]);
}

function canonicalIsoEpoch(value, reasonCode, label) {
  if (typeof value !== "string") {
    fail(reasonCode, `${label} must be a canonical UTC timestamp.`);
  }
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch) || new Date(epoch).toISOString() !== value) {
    fail(reasonCode, `${label} must be a canonical UTC timestamp.`);
  }
  return epoch;
}

function validDigest(value) {
  return (
    typeof value === "string" &&
    SHA_256_PATTERN.test(value) &&
    value !== ZERO_SHA256
  );
}

function validOid(value) {
  return Number.isSafeInteger(value) && value >= 1 && value <= MAX_POSTGRES_OID;
}

function validRoleName(value) {
  return (
    typeof value === "string" &&
    SAFE_POSTGRES_ROLE_PATTERN.test(value) &&
    value !== "public" &&
    value !== "postgres" &&
    !value.startsWith("pg_")
  );
}

function validDeploymentRoleName(value) {
  return (
    typeof value === "string" &&
    SAFE_POSTGRES_ROLE_PATTERN.test(value) &&
    value !== "public" &&
    !value.startsWith("pg_")
  );
}

function validAclEpoch(value) {
  if (typeof value !== "string" || !POSITIVE_BIGINT_PATTERN.test(value)) {
    return false;
  }
  try {
    return BigInt(value) <= MAX_POSTGRES_BIGINT;
  } catch {
    return false;
  }
}

function normalizeRoleBinding(value, reasonCode, roleKey) {
  const role = exactDataRecord(
    value,
    ROLE_BINDING_KEYS,
    reasonCode,
    "Each duty-role binding must be one exact data-only record.",
  );
  if (
    !validRoleName(role.name) ||
    role.name !==
      IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_ROLE_NAMES[roleKey] ||
    !validOid(role.oid)
  ) {
    fail(reasonCode, "A duty-role name/OID binding is invalid.");
  }
  return Object.freeze({ ...role });
}

function normalizeRoles(value, reasonCode) {
  const roles = exactDataRecord(
    value,
    ROLES_KEYS,
    reasonCode,
    "Duty roles must be one exact data-only record.",
  );
  const normalized = Object.freeze({
    coordinator: normalizeRoleBinding(
      roles.coordinator,
      reasonCode,
      "coordinator",
    ),
    schemaOwner: normalizeRoleBinding(
      roles.schemaOwner,
      reasonCode,
      "schemaOwner",
    ),
    worker: normalizeRoleBinding(roles.worker, reasonCode, "worker"),
  });
  const names = Object.values(normalized).map((role) => role.name);
  const oids = Object.values(normalized).map((role) => role.oid);
  if (
    new Set(names).size !== names.length ||
    new Set(oids).size !== oids.length
  ) {
    fail(reasonCode, "Duty-role names and OIDs must be pairwise distinct.");
  }
  return normalized;
}

function validateDeploymentRole(value, roles, reasonCode) {
  if (
    !validDeploymentRoleName(value.deploymentRoleName) ||
    !validOid(value.deploymentRoleOid) ||
    Object.values(roles).some(
      (role) =>
        role.name === value.deploymentRoleName ||
        role.oid === value.deploymentRoleOid,
    )
  ) {
    fail(reasonCode, "The deployment-role name/OID binding is invalid.");
  }
}

function validateRuntimeEvidence(value, roles, reasonCode) {
  validateDeploymentRole(value, roles, reasonCode);
  if (
    value.applicationRoleAllowlistBound !==
      IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_SCOPE.applicationRoleAllowlistBound ||
    value.authorityScope !==
      IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_SCOPE.authorityScope ||
    value.crossDatabaseAuthorityControlled !==
      IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_SCOPE.crossDatabaseAuthorityControlled ||
    value.futureCreatorDefaultPrivilegesControlled !==
      IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_SCOPE.futureCreatorDefaultPrivilegesControlled ||
    value.productionApplyAuthorized !==
      IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_SCOPE.productionApplyAuthorized ||
    value.definitionManifestDigest !==
      IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_DEFINITION_MANIFEST_SHA256 ||
    value.systemPublicAclBaselineDigest !==
      IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_SYSTEM_PUBLIC_ACL_BASELINE_SHA256 ||
    ![
      value.applyReceiptDigest,
      value.beforeCatalogDigest,
      value.definitionManifestDigest,
      value.directDutyAclDigest,
      value.evidenceDigest,
      value.planDigest,
      value.systemPublicAclBaselineDigest,
    ].every(validDigest)
  ) {
    fail(reasonCode, "The CURRENT186 deployment evidence binding is invalid.");
  }
}

function validateDatabaseIdentity(value, reasonCode) {
  if (
    typeof value.databaseName !== "string" ||
    !SAFE_POSTGRES_DATABASE_PATTERN.test(value.databaseName) ||
    SYSTEM_DATABASES.has(value.databaseName) ||
    !validOid(value.databaseOid) ||
    !validDigest(value.databaseIdentityDigest)
  ) {
    fail(reasonCode, "The PostgreSQL database identity binding is invalid.");
  }
}

function normalizeRuntimeState(value, reasonCode) {
  const state = exactDataRecord(
    value,
    STATE_DIGEST_KEYS,
    reasonCode,
    "The runtime catalog state must be one exact data-only record.",
  );
  validateDatabaseIdentity(state, reasonCode);
  const roles = normalizeRoles(state.roles, reasonCode);
  validateRuntimeEvidence(state, roles, reasonCode);
  if (
    !validAclEpoch(state.aclEpoch) ||
    state.aclEpochDigestDomain !==
      IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_ACL_EPOCH_DIGEST_DOMAIN ||
    !validDigest(state.aclEpochPayloadDigest) ||
    !IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_ACL_REASON_CODES.includes(
      state.aclReasonCode,
    ) ||
    typeof state.operationId !== "string" ||
    !UUID_PATTERN.test(state.operationId) ||
    state.catalogContract !==
      IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_CATALOG_CONTRACT ||
    state.catalogProfile !==
      IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_CATALOG_PROFILE ||
    state.exactGrantsProfile !==
      IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_GRANTS_PROFILE ||
    ![
      state.catalogDigest,
      state.exactGrantsDigest,
      state.ownerSurfaceDigest,
    ].every(validDigest)
  ) {
    fail(reasonCode, "The runtime ACL/catalog state binding is invalid.");
  }
  return Object.freeze({ ...state, roles });
}

function runtimeStateFromBinding(binding) {
  return Object.freeze({
    aclEpoch: binding.aclEpoch,
    aclEpochDigestDomain: binding.aclEpochDigestDomain,
    aclEpochPayloadDigest: binding.aclEpochPayloadDigest,
    aclReasonCode: binding.aclReasonCode,
    applicationRoleAllowlistBound: binding.applicationRoleAllowlistBound,
    applyReceiptDigest: binding.applyReceiptDigest,
    authorityScope: binding.authorityScope,
    beforeCatalogDigest: binding.beforeCatalogDigest,
    operationId: binding.operationId,
    catalogContract: binding.catalogContract,
    databaseIdentityDigest: binding.databaseIdentityDigest,
    databaseName: binding.databaseName,
    databaseOid: binding.databaseOid,
    catalogDigest: binding.catalogDigest,
    catalogProfile: binding.catalogProfile,
    crossDatabaseAuthorityControlled: binding.crossDatabaseAuthorityControlled,
    definitionManifestDigest: binding.definitionManifestDigest,
    deploymentRoleName: binding.deploymentRoleName,
    deploymentRoleOid: binding.deploymentRoleOid,
    directDutyAclDigest: binding.directDutyAclDigest,
    evidenceDigest: binding.evidenceDigest,
    exactGrantsDigest: binding.exactGrantsDigest,
    exactGrantsProfile: binding.exactGrantsProfile,
    futureCreatorDefaultPrivilegesControlled:
      binding.futureCreatorDefaultPrivilegesControlled,
    ownerSurfaceDigest: binding.ownerSurfaceDigest,
    planDigest: binding.planDigest,
    productionApplyAuthorized: binding.productionApplyAuthorized,
    roles: binding.roles,
    systemPublicAclBaselineDigest: binding.systemPublicAclBaselineDigest,
  });
}

function runtimeStateDigest(state) {
  return createHash("sha256")
    .update(canonicalStringify(state), "utf8")
    .digest("hex");
}

export function identityMailDutyRoleRuntimeAttestationV2StateDigest(value) {
  if (arguments.length !== 1) {
    fail(
      "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_ARGUMENTS_INVALID",
      "Runtime-state digest construction accepts exactly one state record.",
    );
  }
  return runtimeStateDigest(
    normalizeRuntimeState(
      value,
      "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_STATE_INVALID",
    ),
  );
}

function validateBindingScalars(binding, reasonCode) {
  validateDatabaseIdentity(binding, reasonCode);
  if (
    binding.schemaHead !==
      IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_SCHEMA_HEAD ||
    binding.migrationCount !==
      IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_MIGRATION_COUNT ||
    binding.migrationHeadChecksum !==
      IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_HEAD_MIGRATION_SHA256 ||
    binding.migrationManifestDigest !==
      IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_HEAD_MANIFEST_SHA256 ||
    !validDigest(binding.migrationHeadChecksum) ||
    !validDigest(binding.migrationManifestDigest) ||
    typeof binding.deploymentMarkerId !== "string" ||
    !UUID_PATTERN.test(binding.deploymentMarkerId) ||
    !validAclEpoch(binding.aclEpoch) ||
    typeof binding.operationId !== "string" ||
    !UUID_PATTERN.test(binding.operationId) ||
    binding.applicationContract !==
      IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_APPLICATION_CONTRACT ||
    typeof binding.applicationReleaseSha !== "string" ||
    !RELEASE_SHA_PATTERN.test(binding.applicationReleaseSha) ||
    ![
      binding.actualContextDigest,
      binding.deploymentMarkerDigest,
      binding.exactGrantsDigest,
      binding.catalogDigest,
      binding.ownerSurfaceDigest,
      binding.applicationArtifactSha256,
      binding.runtimeConfigDigest,
      binding.runtimeStateDigest,
      binding.verificationChallengeDigest,
      binding.workerArtifactSha256,
      binding.workerExecutableSha256,
    ].every(validDigest)
  ) {
    fail(reasonCode, "The CURRENT186 runtime release binding is invalid.");
  }
}

function normalizeBindings(value, reasonCode, message) {
  const binding = exactDataRecord(value, BINDING_KEYS, reasonCode, message);
  const roles = normalizeRoles(binding.roles, reasonCode);
  const normalized = Object.freeze({ ...binding, roles });
  validateBindingScalars(normalized, reasonCode);
  const expectedStateDigest = runtimeStateDigest(
    normalizeRuntimeState(runtimeStateFromBinding(normalized), reasonCode),
  );
  if (normalized.runtimeStateDigest !== expectedStateDigest) {
    fail(reasonCode, "The ACL/catalog state is torn or not canonically bound.");
  }
  return normalized;
}

function normalizeExpectedBindings(value) {
  return normalizeBindings(
    value,
    "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_EXPECTED_BINDINGS_INVALID",
    "Expected runtime bindings must be one exact data-only record.",
  );
}

function normalizePayload(value) {
  const payload = exactDataRecord(
    value,
    PAYLOAD_KEYS,
    "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_PAYLOAD_INVALID",
    "The signed runtime-attestation payload shape is invalid.",
  );
  const bindings = Object.fromEntries(
    BINDING_KEYS.map((key) => [key, payload[key]]),
  );
  const normalizedBindings = normalizeBindings(
    bindings,
    "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_RELEASE_BINDING_INVALID",
    "The signed CURRENT186 runtime release binding is invalid.",
  );
  const normalized = Object.freeze({
    ...payload,
    roles: normalizedBindings.roles,
  });
  if (
    normalized.schemaVersion !== 2 ||
    normalized.kind !== IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_KIND ||
    normalized.contract !==
      IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_CONTRACT ||
    normalized.trustDomain !==
      IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_TRUST_DOMAIN ||
    normalized.purpose !==
      IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_PURPOSE ||
    normalized.profile !==
      IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_PROFILE ||
    typeof normalized.attestationId !== "string" ||
    !UUID_PATTERN.test(normalized.attestationId) ||
    typeof normalized.signingKeyId !== "string" ||
    !KEY_ID_PATTERN.test(normalized.signingKeyId) ||
    !validDigest(normalized.publicKeyFingerprint)
  ) {
    fail(
      "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_CONTRACT_INVALID",
      "The signed role-level runtime-attestation discriminator is invalid.",
    );
  }
  return normalized;
}

function bindingProjection(payload) {
  return Object.freeze(
    Object.fromEntries(BINDING_KEYS.map((key) => [key, payload[key]])),
  );
}

export function identityMailDutyRoleRuntimeAttestationV2PayloadDigest(payload) {
  if (arguments.length !== 1) {
    fail(
      "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_ARGUMENTS_INVALID",
      "Payload digest construction accepts exactly one payload.",
    );
  }
  return createHash("sha256")
    .update(canonicalStringify(payload), "utf8")
    .digest("hex");
}

export function identityMailDutyRoleRuntimeAttestationV2PublicKeyFingerprint(
  publicKeyPem,
) {
  if (arguments.length !== 1) {
    fail(
      "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_ARGUMENTS_INVALID",
      "Public-key fingerprint construction accepts exactly one public key.",
    );
  }
  try {
    const key = createPublicKey(publicKeyPem);
    if (key.asymmetricKeyType !== "ed25519") {
      fail(
        "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_ROOT_INVALID",
        "The runtime-attestation authority key must be Ed25519.",
      );
    }
    return createHash("sha256")
      .update(key.export({ type: "spki", format: "der" }))
      .digest("hex");
  } catch (error) {
    if (error instanceof IdentityMailDutyRoleRuntimeAttestationV2Error) {
      throw error;
    }
    fail(
      "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_ROOT_INVALID",
      "The runtime-attestation authority public key is invalid.",
    );
  }
}

function validateRootRegistry(roots) {
  const registry = Object.create(null);
  const seenFingerprints = new Set();
  for (const [registryKey, candidate] of dataOnlyRegistryEntries(roots)) {
    const root = exactDataRecord(
      candidate,
      ROOT_KEYS,
      "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_ROOT_INVALID",
      "A runtime-attestation authority root must be exact and data-only.",
    );
    if (typeof root.publicKeyPem !== "string") {
      fail(
        "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_ROOT_INVALID",
        "A runtime-attestation authority public key must be a string.",
      );
    }
    let key;
    let canonicalPem;
    try {
      key = createPublicKey(root.publicKeyPem);
      canonicalPem = key.export({ type: "spki", format: "pem" });
    } catch {
      fail(
        "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_ROOT_INVALID",
        "A runtime-attestation authority public key is invalid.",
      );
    }
    const fingerprint =
      identityMailDutyRoleRuntimeAttestationV2PublicKeyFingerprint(
        root.publicKeyPem,
      );
    const notBefore = canonicalIsoEpoch(
      root.notBefore,
      "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_ROOT_INVALID",
      "Authority validity start",
    );
    const notAfter = canonicalIsoEpoch(
      root.notAfter,
      "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_ROOT_INVALID",
      "Authority validity end",
    );
    if (
      !KEY_ID_PATTERN.test(registryKey) ||
      root.keyId !== registryKey ||
      root.algorithm !==
        IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_SIGNATURE_ALGORITHM ||
      root.trustDomain !==
        IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_TRUST_DOMAIN ||
      root.purpose !== IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_PURPOSE ||
      root.profile !== IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_PROFILE ||
      root.status !== "ACTIVE" ||
      !validDigest(root.publicKeyFingerprint) ||
      root.publicKeyFingerprint !== fingerprint ||
      key.asymmetricKeyType !== "ed25519" ||
      canonicalPem !== root.publicKeyPem ||
      notAfter <= notBefore ||
      seenFingerprints.has(fingerprint)
    ) {
      fail(
        "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_ROOT_INVALID",
        "A runtime-attestation authority root failed its exact contract.",
      );
    }
    seenFingerprints.add(fingerprint);
    registry[registryKey] = Object.freeze({ ...root });
  }
  return Object.freeze(registry);
}

function selectRoot(roots, signingKeyId, nowMs) {
  const registry = validateRootRegistry(roots);
  const root = Object.hasOwn(registry, signingKeyId)
    ? registry[signingKeyId]
    : undefined;
  if (!root) {
    fail(
      Object.keys(registry).length === 0
        ? "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_AUTHORITY_NOT_ENROLLED"
        : "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_AUTHORITY_KEY_NOT_TRUSTED",
      "No active pinned role-level runtime-attestation authority can verify the payload.",
    );
  }
  if (
    nowMs < Date.parse(root.notBefore) ||
    nowMs >= Date.parse(root.notAfter)
  ) {
    fail(
      "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_ROOT_INACTIVE",
      "The runtime-attestation authority is outside its validity window.",
    );
  }
  return root;
}

function decodeSignature(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/u.test(value)) {
    fail(
      "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_SIGNATURE_INVALID",
      "The Ed25519 signature encoding is invalid.",
    );
  }
  const signature = Buffer.from(value, "base64url");
  if (signature.length !== 64 || signature.toString("base64url") !== value) {
    fail(
      "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_SIGNATURE_INVALID",
      "The signature must be one canonical 64-byte Ed25519 base64url value.",
    );
  }
  return signature;
}

function normalizeNow(now) {
  return canonicalIsoEpoch(
    now,
    "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_CURRENT_TIME_INVALID",
    "The explicit verification time",
  );
}

function assertTimeline(payload, root, nowMs) {
  const issuedAt = canonicalIsoEpoch(
    payload.issuedAt,
    "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_TIMELINE_INVALID",
    "Attestation issue time",
  );
  const validUntil = canonicalIsoEpoch(
    payload.validUntil,
    "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_TIMELINE_INVALID",
    "Attestation validity end",
  );
  const rootNotBefore = Date.parse(root.notBefore);
  const rootNotAfter = Date.parse(root.notAfter);
  if (
    issuedAt >
      nowMs +
        IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_MAX_CLOCK_SKEW_MS ||
    issuedAt < rootNotBefore ||
    issuedAt >= rootNotAfter ||
    validUntil <= issuedAt ||
    validUntil <= nowMs ||
    validUntil > rootNotAfter ||
    validUntil - issuedAt >
      IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_MAX_LIFETIME_MS
  ) {
    fail(
      "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_TIMELINE_INVALID",
      "The role-level runtime attestation is stale or outside its bounded validity window.",
    );
  }
}

function verifyAgainstRoots(envelopeValue, expectedValue, roots, now) {
  const envelope = exactDataRecord(
    envelopeValue,
    ENVELOPE_KEYS,
    "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_ENVELOPE_INVALID",
    "The role-level runtime-attestation envelope shape is invalid.",
  );
  const payload = normalizePayload(envelope.payload);
  const expected = normalizeExpectedBindings(expectedValue);
  const nowMs = normalizeNow(now);
  if (
    envelope.signatureAlgorithm !==
      IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_SIGNATURE_ALGORITHM ||
    typeof envelope.signingKeyId !== "string" ||
    !KEY_ID_PATTERN.test(envelope.signingKeyId) ||
    !validDigest(envelope.publicKeyFingerprint) ||
    !validDigest(envelope.payloadDigest) ||
    envelope.signingKeyId !== payload.signingKeyId ||
    envelope.publicKeyFingerprint !== payload.publicKeyFingerprint ||
    identityMailDutyRoleRuntimeAttestationV2PayloadDigest(payload) !==
      envelope.payloadDigest
  ) {
    fail(
      "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_ENVELOPE_BINDING_INVALID",
      "The role-level runtime-attestation envelope binding is invalid.",
    );
  }

  const root = selectRoot(roots, envelope.signingKeyId, nowMs);
  if (root.publicKeyFingerprint !== envelope.publicKeyFingerprint) {
    fail(
      "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_AUTHORITY_KEY_NOT_TRUSTED",
      "The payload fingerprint does not match its purpose-bound authority root.",
    );
  }
  const signature = decodeSignature(envelope.signature);
  if (
    !verifySignature(
      null,
      Buffer.from(canonicalStringify(payload), "utf8"),
      createPublicKey(root.publicKeyPem),
      signature,
    )
  ) {
    fail(
      "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_SIGNATURE_INVALID",
      "The role-level runtime-attestation Ed25519 signature is invalid.",
    );
  }
  assertTimeline(payload, root, nowMs);
  if (
    canonicalStringify(bindingProjection(payload)) !==
    canonicalStringify(expected)
  ) {
    fail(
      "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_EXPECTED_BINDING_MISMATCH",
      "The signed attestation does not describe the observed role-level runtime.",
    );
  }

  const verifiedPayload = Object.freeze({
    ...payload,
    roles: Object.freeze({
      coordinator: Object.freeze({ ...payload.roles.coordinator }),
      schemaOwner: Object.freeze({ ...payload.roles.schemaOwner }),
      worker: Object.freeze({ ...payload.roles.worker }),
    }),
  });
  const verifiedEnvelope = Object.freeze({
    payload: verifiedPayload,
    payloadDigest: envelope.payloadDigest,
    publicKeyFingerprint: envelope.publicKeyFingerprint,
    signature: signature.toString("base64url"),
    signatureAlgorithm: envelope.signatureAlgorithm,
    signingKeyId: envelope.signingKeyId,
  });
  const verified = Object.freeze({
    authorization: false,
    canMutate: false,
    canSend: false,
    envelope: verifiedEnvelope,
    liveDatabaseAssertionRequired: true,
    tenantReadinessRequired: true,
    verifiedAt: new Date(nowMs).toISOString(),
  });
  VERIFIED_ATTESTATIONS.add(verified);
  return verified;
}

function assertSyntheticContext(contextValue, expected) {
  const context = exactDataRecord(
    contextValue,
    SYNTHETIC_CONTEXT_KEYS,
    "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_SYNTHETIC_CONTEXT_DENIED",
    "Synthetic verification requires an exact loopback-CI context.",
  );
  if (
    context.explicitConfirmation !==
      IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_SYNTHETIC_CONFIRMATION ||
    context.environment !== "ci" ||
    context.nodeEnv !== "test" ||
    typeof context.hostname !== "string" ||
    !LOOPBACK_HOSTS.has(context.hostname) ||
    String(process.env.NODE_ENV ?? "").toLowerCase() !== "test" ||
    context.databaseName !== expected.databaseName ||
    typeof context.databaseName !== "string" ||
    !SAFE_POSTGRES_DATABASE_PATTERN.test(context.databaseName) ||
    !CI_DATABASE_PATTERN.test(context.databaseName) ||
    PRODUCTION_DATABASE_PATTERN.test(context.databaseName) ||
    SYSTEM_DATABASES.has(context.databaseName)
  ) {
    fail(
      "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_SYNTHETIC_CONTEXT_DENIED",
      "Synthetic roots are restricted to an explicitly confirmed loopback CI database.",
    );
  }
  return Object.freeze({ ...context });
}

export function verifyPinnedIdentityMailDutyRoleRuntimeAttestationV2Envelope(
  envelope,
  expectedBindings,
) {
  if (arguments.length !== 2) {
    fail(
      "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_ARGUMENTS_INVALID",
      "Pinned verification accepts only envelope and expected bindings.",
    );
  }
  return verifyAgainstRoots(
    envelope,
    expectedBindings,
    PINNED_IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_ROOTS,
    new Date().toISOString(),
  );
}

export function verifySyntheticIdentityMailDutyRoleRuntimeAttestationV2Envelope(
  envelope,
  expectedBindings,
  roots,
  syntheticContext,
  now,
) {
  if (arguments.length !== 5) {
    fail(
      "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_ARGUMENTS_INVALID",
      "Synthetic verification requires roots, exact loopback-CI context, and explicit now.",
    );
  }
  const expected = normalizeExpectedBindings(expectedBindings);
  assertSyntheticContext(syntheticContext, expected);
  return verifyAgainstRoots(envelope, expected, roots, now);
}

export function isVerifiedIdentityMailDutyRoleRuntimeAttestationV2(value) {
  if (arguments.length !== 1) {
    return false;
  }
  return (
    !!value && typeof value === "object" && VERIFIED_ATTESTATIONS.has(value)
  );
}

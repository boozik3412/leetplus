import {
  createHash,
  createPublicKey,
  verify as verifySignature,
} from "node:crypto";
import { types as utilTypes } from "node:util";

import { canonicalStringify } from "./staff-task-integrity-canonical-json.mjs";

export const IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_DOMAIN =
  "IDENTITY_MAIL_TENANT_ENROLLMENT_COMMAND_V2";
export const IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_PURPOSE =
  "PROTECTED_MAIL_WORKER_TENANT_ENROLLMENT_V2";
export const IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_PROFILE =
  "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2";
export const IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_CONTRACT =
  "PROTECTED_MAIL_WORKER_TENANT_ENROLLMENT_V2";
export const IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_SIGNATURE_ALGORITHM =
  "Ed25519";
export const IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_SYNTHETIC_CONFIRMATION =
  "allow-synthetic-identity-mail-tenant-enrollment-authority-v2-loopback-ci";

export const IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_DUTY_MANIFEST_CONTRACT =
  "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2";
export const IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_DUTY_MANIFEST_PROFILE =
  "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_PROFILE_V2";
export const IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_DUTY_GRANTS_PROFILE =
  "IDENTITY_MAIL_DUTY_GRANTS_PG16_V1";
export const IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_APPLICATION_CONTRACT =
  "IDENTITY_MAIL_TENANT_ENROLLMENT_MANIFEST_BOUND_V2";
export const IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_PREDECESSOR_MANIFEST_DIGEST =
  "9da93df51df3945b3219409f06118134712edb2a96543d1eb183217da9767819";

// Empty by design. Production enrollment requires reviewed V2 root-history
// release data. Callers and environment variables cannot add pinned roots.
export const PINNED_IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_ROOTS =
  Object.freeze({});

const MAX_COMMAND_LIFETIME_MS = 15 * 60 * 1_000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1_000;
const MAX_POSTGRES_OID = 4_294_967_295;
const MAX_POSTGRES_INTEGER = 2_147_483_647;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SHA_256_PATTERN = /^[0-9a-f]{64}$/u;
const RELEASE_SHA_PATTERN = /^[0-9a-f]{40}$/u;
const KEY_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{2,63}$/u;
const DATABASE_NAME_PATTERN = /^[a-z][a-z0-9_]{0,62}$/u;
const ROLE_NAME_PATTERN = /^[a-z_][a-z0-9_]{2,62}$/u;
const BASE64URL_SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{86}$/u;
const SYSTEM_DATABASE_NAMES = new Set(["postgres", "template0", "template1"]);
const SYSTEM_ROLE_NAMES = new Set([
  "current_role",
  "current_user",
  "none",
  "postgres",
  "public",
  "session_user",
]);
const SYSTEM_ROLE_PREFIXES = Object.freeze([
  "azure_",
  "cloudsql",
  "pg_",
  "rds_",
]);
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const CI_DATABASE_PATTERN = /(?:^|[_-])(?:ci|test|testing)(?:$|[_-])/u;
const PRODUCTION_DATABASE_PATTERN =
  /(?:^|[_-])(?:live|prod|production)(?:$|[_-])/u;

const DOCUMENT_KEYS = Object.freeze(
  [
    "authorizationEnvelope",
    "authorizationEnvelopeDigest",
    "proposal",
    "proposalContentDigest",
    "signatureBase64url",
  ].sort(),
);
const ENVELOPE_KEYS = Object.freeze(
  [
    "action",
    "actorDigest",
    "actualContextDigest",
    "authorityDomain",
    "authorization",
    "canMutate",
    "commandId",
    "contract",
    "databaseIdentityDigest",
    "deploymentMarkerDigest",
    "deploymentMarkerId",
    "drainStateRevision",
    "dutyRoleBinding",
    "expectedDatabaseName",
    "expectedDatabaseOid",
    "expectedPolicyRevision",
    "expectedState",
    "expiresAt",
    "finalStateRevision",
    "intent",
    "nextPolicyRevision",
    "previousConfiguration",
    "proposalContentDigest",
    "publicKeyFingerprint",
    "releaseSha",
    "requestId",
    "requestedAt",
    "rollbackOfCommandId",
    "runtimeConfigDigest",
    "schemaVersion",
    "signatureAlgorithm",
    "signingKeyId",
    "stateRevisionBefore",
    "targetConfiguration",
    "targetState",
    "tenantId",
  ].sort(),
);
const PROPOSAL_KEYS = Object.freeze(
  [
    "action",
    "authorization",
    "canMutate",
    "contract",
    "deploymentMarkerDigest",
    "dutyRoleBinding",
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
const DUTY_ROLE_BINDING_KEYS = Object.freeze(
  [
    "applicationArtifactSha256",
    "applicationContract",
    "applicationReleaseSha",
    "coordinatorRoleName",
    "coordinatorRoleOid",
    "exactGrantsDigest",
    "exactGrantsProfile",
    "manifestContract",
    "manifestId",
    "manifestPayloadDigest",
    "manifestProfile",
    "manifestPublicKeyFingerprint",
    "manifestRevision",
    "manifestSigningKeyId",
    "predecessorManifestDigest",
    "workerRoleName",
    "workerRoleOid",
  ].sort(),
);
const CONFIGURATION_KEYS = Object.freeze(
  [
    "acknowledgeSeconds",
    "baseRetrySeconds",
    "configurationDigest",
    "leaseSeconds",
    "maxAttempts",
    "maxRetrySeconds",
    "providerAuthorityDigest",
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
const ROOT_KEYS = Object.freeze(
  [
    "algorithm",
    "authorityDomain",
    "keyId",
    "notAfter",
    "notBefore",
    "profile",
    "publicKeyFingerprint",
    "publicKeyPem",
    "purpose",
    "status",
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

const VERIFIED_PINNED_AUTHORITIES_V2 = new WeakSet();
const VERIFIED_SYNTHETIC_AUTHORITIES_V2 = new WeakSet();
const VERIFIED_PINNED_PAYLOADS_V2 = new WeakMap();
const VERIFIED_PINNED_DATABASE_ARGUMENTS_V2 = new WeakMap();
const VERIFIED_PINNED_EVIDENCE_V2 = new WeakMap();

export class IdentityMailTenantEnrollmentAuthorityV2Error extends Error {
  constructor(reasonCode) {
    super("The identity-mail tenant-enrollment V2 authority rejected the document.");
    this.name = "IdentityMailTenantEnrollmentAuthorityV2Error";
    this.code = reasonCode;
    this.reasonCode = reasonCode;
    this.exitCode = 3;
    this.safeContractError = true;
  }
}

function fail(reasonCode) {
  throw new IdentityMailTenantEnrollmentAuthorityV2Error(reasonCode);
}

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function exactDataRecord(value, expectedKeys, reasonCode) {
  let invalidShape;
  try {
    invalidShape =
      value === null ||
      typeof value !== "object" ||
      utilTypes.isProxy(value) ||
      Array.isArray(value);
  } catch {
    fail(reasonCode);
  }
  if (invalidShape) fail(reasonCode);
  let prototype;
  let descriptors;
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    fail(reasonCode);
  }
  if (prototype !== Object.prototype && prototype !== null) fail(reasonCode);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((key) => typeof key !== "string")) fail(reasonCode);
  keys.sort(compareStrings);
  if (
    keys.length !== expectedKeys.length ||
    keys.some((key, index) => key !== expectedKeys[index]) ||
    keys.some((key) => {
      const descriptor = descriptors[key];
      return !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true;
    })
  ) {
    fail(reasonCode);
  }
  const snapshot = Object.create(null);
  for (const key of expectedKeys) snapshot[key] = descriptors[key].value;
  return Object.freeze(snapshot);
}

function registryEntries(value) {
  let invalidShape;
  try {
    invalidShape =
      value === null ||
      typeof value !== "object" ||
      utilTypes.isProxy(value) ||
      Array.isArray(value);
  } catch {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_ROOTS_INVALID");
  }
  if (invalidShape) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_ROOTS_INVALID");
  }
  let prototype;
  let descriptors;
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_ROOTS_INVALID");
  }
  if (prototype !== Object.prototype && prototype !== null) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_ROOTS_INVALID");
  }
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.some((key) => typeof key !== "string") ||
    keys.some((key) => {
      const descriptor = descriptors[key];
      return !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true;
    })
  ) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_ROOTS_INVALID");
  }
  return keys.sort(compareStrings).map((key) => [key, descriptors[key].value]);
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function isUuid(value) {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isSha256(value) {
  return typeof value === "string" && SHA_256_PATTERN.test(value);
}

function boundedInteger(value, minimum, maximum) {
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

function validDatabaseName(value) {
  return (
    typeof value === "string" &&
    DATABASE_NAME_PATTERN.test(value) &&
    !SYSTEM_DATABASE_NAMES.has(value)
  );
}

function validRoleName(value) {
  return (
    typeof value === "string" &&
    ROLE_NAME_PATTERN.test(value) &&
    !SYSTEM_ROLE_NAMES.has(value) &&
    !SYSTEM_ROLE_PREFIXES.some((prefix) => value.startsWith(prefix))
  );
}

function canonicalTimestamp(value, reasonCode) {
  if (typeof value !== "string") fail(reasonCode);
  const epochMs = Date.parse(value);
  if (!Number.isSafeInteger(epochMs) || new Date(epochMs).toISOString() !== value) {
    fail(reasonCode);
  }
  return epochMs;
}

function normalizePolicy(value) {
  const policy = exactDataRecord(
    value,
    POLICY_KEYS,
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_POLICY_INVALID",
  );
  if (
    !boundedInteger(policy.maxAttempts, 1, 20) ||
    !boundedInteger(policy.leaseSeconds, 30, 900) ||
    !boundedInteger(policy.acknowledgeSeconds, 10, 900) ||
    !boundedInteger(policy.baseRetrySeconds, 1, 3_600) ||
    !boundedInteger(policy.maxRetrySeconds, 1, 86_400) ||
    policy.maxRetrySeconds < policy.baseRetrySeconds
  ) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_POLICY_INVALID");
  }
  return deepFreeze({ ...policy });
}

function normalizeConfiguration(value, nullable = false) {
  if (nullable && value === null) return null;
  const configuration = exactDataRecord(
    value,
    CONFIGURATION_KEYS,
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_CONFIGURATION_INVALID",
  );
  if (
    !validRoleName(configuration.workerRoleName) ||
    !boundedInteger(configuration.workerRoleOid, 1, MAX_POSTGRES_OID) ||
    !isSha256(configuration.providerAuthorityDigest) ||
    !isSha256(configuration.configurationDigest)
  ) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_CONFIGURATION_INVALID");
  }
  const policy = normalizePolicy({
    acknowledgeSeconds: configuration.acknowledgeSeconds,
    baseRetrySeconds: configuration.baseRetrySeconds,
    leaseSeconds: configuration.leaseSeconds,
    maxAttempts: configuration.maxAttempts,
    maxRetrySeconds: configuration.maxRetrySeconds,
  });
  return deepFreeze({
    acknowledgeSeconds: policy.acknowledgeSeconds,
    baseRetrySeconds: policy.baseRetrySeconds,
    configurationDigest: configuration.configurationDigest,
    leaseSeconds: policy.leaseSeconds,
    maxAttempts: policy.maxAttempts,
    maxRetrySeconds: policy.maxRetrySeconds,
    providerAuthorityDigest: configuration.providerAuthorityDigest,
    workerRoleName: configuration.workerRoleName,
    workerRoleOid: configuration.workerRoleOid,
  });
}

function samePolicy(configuration, policy) {
  return POLICY_KEYS.every((key) => configuration[key] === policy[key]);
}

function sameConfiguration(left, right) {
  return CONFIGURATION_KEYS.every((key) => left[key] === right[key]);
}

function sameOperationalConfiguration(left, right) {
  return CONFIGURATION_KEYS.filter((key) => key !== "configurationDigest").every(
    (key) => left[key] === right[key],
  );
}

function normalizeDutyRoleBinding(value) {
  const binding = exactDataRecord(
    value,
    DUTY_ROLE_BINDING_KEYS,
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_DUTY_ROLE_BINDING_INVALID",
  );
  if (
    binding.manifestContract !==
      IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_DUTY_MANIFEST_CONTRACT ||
    binding.manifestProfile !==
      IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_DUTY_MANIFEST_PROFILE ||
    !isUuid(binding.manifestId) ||
    !boundedInteger(binding.manifestRevision, 1, MAX_POSTGRES_INTEGER) ||
    !isSha256(binding.manifestPayloadDigest) ||
    typeof binding.manifestSigningKeyId !== "string" ||
    !KEY_ID_PATTERN.test(binding.manifestSigningKeyId) ||
    !isSha256(binding.manifestPublicKeyFingerprint) ||
    !validRoleName(binding.coordinatorRoleName) ||
    !boundedInteger(binding.coordinatorRoleOid, 1, MAX_POSTGRES_OID) ||
    !validRoleName(binding.workerRoleName) ||
    !boundedInteger(binding.workerRoleOid, 1, MAX_POSTGRES_OID) ||
    binding.coordinatorRoleName === binding.workerRoleName ||
    binding.coordinatorRoleOid === binding.workerRoleOid ||
    binding.exactGrantsProfile !==
      IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_DUTY_GRANTS_PROFILE ||
    !isSha256(binding.exactGrantsDigest) ||
    binding.predecessorManifestDigest !==
      IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_PREDECESSOR_MANIFEST_DIGEST ||
    binding.applicationContract !==
      IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_APPLICATION_CONTRACT ||
    typeof binding.applicationReleaseSha !== "string" ||
    !RELEASE_SHA_PATTERN.test(binding.applicationReleaseSha) ||
    !isSha256(binding.applicationArtifactSha256)
  ) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_DUTY_ROLE_BINDING_INVALID");
  }
  return deepFreeze({ ...binding });
}

function normalizeProposal(value) {
  const proposal = exactDataRecord(
    value,
    PROPOSAL_KEYS,
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_PROPOSAL_INVALID",
  );
  const policy = normalizePolicy(proposal.policy);
  const dutyRoleBinding = normalizeDutyRoleBinding(proposal.dutyRoleBinding);
  if (
    proposal.authorization !== false ||
    proposal.canMutate !== false ||
    proposal.contract !== IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_CONTRACT ||
    !["ENABLE", "ROTATE", "DISABLE"].includes(proposal.action) ||
    !isUuid(proposal.requestId) ||
    !isUuid(proposal.tenantId) ||
    !validDatabaseName(proposal.expectedDatabaseName) ||
    !boundedInteger(proposal.expectedDatabaseOid, 1, MAX_POSTGRES_OID) ||
    !validRoleName(proposal.workerRoleName) ||
    !boundedInteger(proposal.workerRoleOid, 1, MAX_POSTGRES_OID) ||
    proposal.workerRoleName !== dutyRoleBinding.workerRoleName ||
    proposal.workerRoleOid !== dutyRoleBinding.workerRoleOid ||
    !isSha256(proposal.deploymentMarkerDigest) ||
    !isSha256(proposal.providerAuthorityDigest) ||
    !isSha256(proposal.runtimeConfigDigest) ||
    typeof proposal.releaseSha !== "string" ||
    !RELEASE_SHA_PATTERN.test(proposal.releaseSha) ||
    proposal.releaseSha !== dutyRoleBinding.applicationReleaseSha ||
    !["ABSENT", "ACTIVE", "DISABLED"].includes(proposal.expectedState) ||
    !Number.isSafeInteger(proposal.expectedRevision) ||
    proposal.expectedRevision < 0 ||
    proposal.expectedRevision >= MAX_POSTGRES_INTEGER ||
    !Number.isSafeInteger(proposal.nextRevision) ||
    proposal.nextRevision > MAX_POSTGRES_INTEGER ||
    proposal.nextRevision !== proposal.expectedRevision + 1
  ) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_PROPOSAL_INVALID");
  }
  canonicalTimestamp(
    proposal.requestedAt,
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_TIMELINE_INVALID",
  );
  canonicalTimestamp(
    proposal.expiresAt,
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_TIMELINE_INVALID",
  );
  return deepFreeze({ ...proposal, dutyRoleBinding, policy });
}

function normalizeEnvelope(value) {
  const envelope = exactDataRecord(
    value,
    ENVELOPE_KEYS,
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_ENVELOPE_INVALID",
  );
  const previousConfiguration = normalizeConfiguration(
    envelope.previousConfiguration,
    true,
  );
  const targetConfiguration = normalizeConfiguration(envelope.targetConfiguration);
  const dutyRoleBinding = normalizeDutyRoleBinding(envelope.dutyRoleBinding);
  if (
    envelope.schemaVersion !== 2 ||
    envelope.authorityDomain !==
      IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_DOMAIN ||
    envelope.authorization !== true ||
    envelope.canMutate !== true ||
    envelope.contract !== IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_CONTRACT ||
    envelope.signatureAlgorithm !==
      IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_SIGNATURE_ALGORITHM ||
    typeof envelope.signingKeyId !== "string" ||
    !KEY_ID_PATTERN.test(envelope.signingKeyId) ||
    !isSha256(envelope.publicKeyFingerprint) ||
    !isUuid(envelope.commandId) ||
    !isUuid(envelope.tenantId) ||
    !isUuid(envelope.requestId) ||
    !["ENABLE", "ROTATE", "DISABLE"].includes(envelope.action) ||
    !["FORWARD", "ROLLBACK"].includes(envelope.intent) ||
    !isSha256(envelope.proposalContentDigest) ||
    !isSha256(envelope.runtimeConfigDigest) ||
    !validDatabaseName(envelope.expectedDatabaseName) ||
    !boundedInteger(envelope.expectedDatabaseOid, 1, MAX_POSTGRES_OID) ||
    !isSha256(envelope.databaseIdentityDigest) ||
    !isUuid(envelope.deploymentMarkerId) ||
    !isSha256(envelope.deploymentMarkerDigest) ||
    !isSha256(envelope.actualContextDigest) ||
    typeof envelope.releaseSha !== "string" ||
    !RELEASE_SHA_PATTERN.test(envelope.releaseSha) ||
    !isSha256(envelope.actorDigest) ||
    envelope.releaseSha !== dutyRoleBinding.applicationReleaseSha ||
    envelope.publicKeyFingerprint ===
      dutyRoleBinding.manifestPublicKeyFingerprint ||
    targetConfiguration.workerRoleName !== dutyRoleBinding.workerRoleName ||
    targetConfiguration.workerRoleOid !== dutyRoleBinding.workerRoleOid
  ) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_ENVELOPE_INVALID");
  }
  if (
    (envelope.intent === "FORWARD" && envelope.rollbackOfCommandId !== null) ||
    (envelope.intent === "ROLLBACK" &&
      (!isUuid(envelope.rollbackOfCommandId) ||
        envelope.rollbackOfCommandId === envelope.commandId))
  ) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_ROLLBACK_INVALID");
  }
  const expectedTransition =
    (envelope.action === "ENABLE" &&
      ["ABSENT", "DISABLED"].includes(envelope.expectedState) &&
      envelope.targetState === "ACTIVE") ||
    (envelope.action === "ROTATE" &&
      envelope.expectedState === "ACTIVE" &&
      envelope.targetState === "ACTIVE") ||
    (envelope.action === "DISABLE" &&
      envelope.expectedState === "ACTIVE" &&
      envelope.targetState === "DISABLED");
  if (!expectedTransition) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_TRANSITION_INVALID");
  }
  if (
    !Number.isSafeInteger(envelope.expectedPolicyRevision) ||
    !Number.isSafeInteger(envelope.nextPolicyRevision) ||
    !Number.isSafeInteger(envelope.stateRevisionBefore) ||
    !Number.isSafeInteger(envelope.finalStateRevision) ||
    (envelope.drainStateRevision !== null &&
      !Number.isSafeInteger(envelope.drainStateRevision)) ||
    envelope.expectedPolicyRevision < 0 ||
    envelope.expectedPolicyRevision >= MAX_POSTGRES_INTEGER ||
    envelope.nextPolicyRevision > MAX_POSTGRES_INTEGER ||
    envelope.stateRevisionBefore < 0 ||
    envelope.stateRevisionBefore >
      Number.MAX_SAFE_INTEGER - (envelope.action === "ENABLE" ? 1 : 2) ||
    envelope.nextPolicyRevision !== envelope.expectedPolicyRevision + 1 ||
    (envelope.expectedState === "ABSENT" &&
      (envelope.expectedPolicyRevision !== 0 ||
        envelope.stateRevisionBefore !== 0 ||
        previousConfiguration !== null)) ||
    (envelope.expectedState !== "ABSENT" &&
      (envelope.expectedPolicyRevision < 1 ||
        envelope.stateRevisionBefore < envelope.expectedPolicyRevision ||
        previousConfiguration === null)) ||
    (envelope.action === "ENABLE" &&
      (envelope.drainStateRevision !== null ||
        envelope.finalStateRevision !== envelope.stateRevisionBefore + 1)) ||
    (["ROTATE", "DISABLE"].includes(envelope.action) &&
      (envelope.drainStateRevision !== envelope.stateRevisionBefore + 1 ||
        envelope.finalStateRevision !== envelope.stateRevisionBefore + 2))
  ) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_REVISION_INVALID");
  }
  if (
    envelope.action === "ENABLE" &&
    envelope.expectedState === "DISABLED" &&
    !sameConfiguration(targetConfiguration, previousConfiguration)
  ) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_ENABLE_INVALID");
  }
  if (
    envelope.action === "ROTATE" &&
    (targetConfiguration.configurationDigest ===
      previousConfiguration.configurationDigest ||
      sameOperationalConfiguration(targetConfiguration, previousConfiguration))
  ) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_ROTATION_INVALID");
  }
  if (
    envelope.action === "DISABLE" &&
    !sameConfiguration(targetConfiguration, previousConfiguration)
  ) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_DISABLE_INVALID");
  }
  canonicalTimestamp(
    envelope.requestedAt,
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_TIMELINE_INVALID",
  );
  canonicalTimestamp(
    envelope.expiresAt,
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_TIMELINE_INVALID",
  );
  return deepFreeze({
    ...envelope,
    dutyRoleBinding,
    previousConfiguration,
    targetConfiguration,
  });
}

function validateProposalBinding(proposal, envelope, proposalDigest) {
  if (
    envelope.proposalContentDigest !== proposalDigest ||
    proposal.action !== envelope.action ||
    proposal.contract !== envelope.contract ||
    proposal.deploymentMarkerDigest !== envelope.deploymentMarkerDigest ||
    canonicalStringify(proposal.dutyRoleBinding) !==
      canonicalStringify(envelope.dutyRoleBinding) ||
    proposal.expectedDatabaseName !== envelope.expectedDatabaseName ||
    proposal.expectedDatabaseOid !== envelope.expectedDatabaseOid ||
    proposal.expectedRevision !== envelope.expectedPolicyRevision ||
    proposal.expectedState !== envelope.expectedState ||
    proposal.expiresAt !== envelope.expiresAt ||
    proposal.nextRevision !== envelope.nextPolicyRevision ||
    proposal.providerAuthorityDigest !==
      envelope.targetConfiguration.providerAuthorityDigest ||
    proposal.releaseSha !== envelope.releaseSha ||
    proposal.requestId !== envelope.requestId ||
    proposal.requestedAt !== envelope.requestedAt ||
    proposal.runtimeConfigDigest !== envelope.runtimeConfigDigest ||
    proposal.tenantId !== envelope.tenantId ||
    proposal.workerRoleName !== envelope.targetConfiguration.workerRoleName ||
    proposal.workerRoleOid !== envelope.targetConfiguration.workerRoleOid ||
    !samePolicy(envelope.targetConfiguration, proposal.policy)
  ) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_BINDING_INVALID");
  }
}

export function identityMailTenantEnrollmentAuthorityV2PublicKeyFingerprint(
  publicKey,
) {
  let key;
  try {
    key =
      publicKey?.type === "public" && publicKey?.asymmetricKeyType === "ed25519"
        ? publicKey
        : createPublicKey(publicKey);
  } catch {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_ROOT_INVALID");
  }
  if (key.asymmetricKeyType !== "ed25519") {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_ROOT_INVALID");
  }
  return sha256(key.export({ type: "spki", format: "der" }));
}

function validateRootRegistry(roots) {
  const registry = Object.create(null);
  const fingerprints = new Set();
  for (const [registryKey, candidate] of registryEntries(roots)) {
    const root = exactDataRecord(
      candidate,
      ROOT_KEYS,
      "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_ROOT_INVALID",
    );
    if (typeof root.publicKeyPem !== "string") {
      fail("IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_ROOT_INVALID");
    }
    let canonicalPem;
    try {
      canonicalPem = createPublicKey(root.publicKeyPem).export({
        type: "spki",
        format: "pem",
      });
    } catch {
      fail("IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_ROOT_INVALID");
    }
    const notBefore = canonicalTimestamp(
      root.notBefore,
      "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_ROOT_INVALID",
    );
    const notAfter = canonicalTimestamp(
      root.notAfter,
      "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_ROOT_INVALID",
    );
    const fingerprint =
      identityMailTenantEnrollmentAuthorityV2PublicKeyFingerprint(root.publicKeyPem);
    if (
      !KEY_ID_PATTERN.test(registryKey) ||
      root.keyId !== registryKey ||
      root.algorithm !==
        IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_SIGNATURE_ALGORITHM ||
      root.authorityDomain !== IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_DOMAIN ||
      root.purpose !== IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_PURPOSE ||
      root.profile !== IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_PROFILE ||
      root.status !== "ACTIVE" ||
      !isSha256(root.publicKeyFingerprint) ||
      root.publicKeyFingerprint !== fingerprint ||
      canonicalPem !== root.publicKeyPem ||
      notAfter <= notBefore ||
      fingerprints.has(fingerprint)
    ) {
      fail("IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_ROOT_INVALID");
    }
    fingerprints.add(fingerprint);
    registry[registryKey] = deepFreeze({ ...root });
  }
  return Object.freeze(registry);
}

function selectRoot(roots, envelope, nowMs) {
  const registry = validateRootRegistry(roots);
  const root = Object.hasOwn(registry, envelope.signingKeyId)
    ? registry[envelope.signingKeyId]
    : undefined;
  if (!root) {
    fail(
      Object.keys(registry).length === 0
        ? "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_NOT_ENROLLED"
        : "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_KEY_NOT_TRUSTED",
    );
  }
  if (
    root.publicKeyFingerprint !== envelope.publicKeyFingerprint ||
    nowMs < Date.parse(root.notBefore) ||
    nowMs >= Date.parse(root.notAfter)
  ) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_KEY_NOT_TRUSTED");
  }
  return root;
}

function decodeSignature(value) {
  if (typeof value !== "string" || !BASE64URL_SIGNATURE_PATTERN.test(value)) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_SIGNATURE_INVALID");
  }
  const signature = Buffer.from(value, "base64url");
  if (signature.length !== 64 || signature.toString("base64url") !== value) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_SIGNATURE_INVALID");
  }
  return signature;
}

function validateTimeline(envelope, root, nowMs) {
  const requestedAt = canonicalTimestamp(
    envelope.requestedAt,
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_TIMELINE_INVALID",
  );
  const expiresAt = canonicalTimestamp(
    envelope.expiresAt,
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_TIMELINE_INVALID",
  );
  const rootNotBefore = Date.parse(root.notBefore);
  const rootNotAfter = Date.parse(root.notAfter);
  if (
    expiresAt <= requestedAt ||
    expiresAt - requestedAt > MAX_COMMAND_LIFETIME_MS ||
    requestedAt > nowMs + MAX_CLOCK_SKEW_MS ||
    expiresAt <= nowMs ||
    requestedAt < rootNotBefore ||
    expiresAt > rootNotAfter
  ) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_TIMELINE_INVALID");
  }
}

function databaseArguments(
  envelope,
  proposalCanonicalJson,
  authorizationEnvelopeCanonicalJson,
  authorizationEnvelopeDigest,
  proposalContentDigest,
  signatureBase64url,
) {
  const previous = envelope.previousConfiguration;
  const target = envelope.targetConfiguration;
  const duty = envelope.dutyRoleBinding;
  return deepFreeze({
    id: envelope.commandId,
    tenantId: envelope.tenantId,
    requestId: envelope.requestId,
    action: envelope.action,
    intent: envelope.intent,
    contractVersion: envelope.contract,
    signatureDomain: envelope.authorityDomain,
    rollbackOfCommandId: envelope.rollbackOfCommandId,
    proposalContentDigest,
    proposalCanonicalJson,
    authorizationEnvelopeDigest,
    authorizationEnvelopeCanonicalJson,
    expectedState: envelope.expectedState,
    targetState: envelope.targetState,
    expectedPolicyRevision: envelope.expectedPolicyRevision,
    nextPolicyRevision: envelope.nextPolicyRevision,
    stateRevisionBefore: envelope.stateRevisionBefore,
    drainStateRevision: envelope.drainStateRevision,
    finalStateRevision: envelope.finalStateRevision,
    previousWorkerRoleName: previous?.workerRoleName ?? null,
    previousWorkerRoleOid: previous?.workerRoleOid ?? null,
    previousProviderAuthorityDigest: previous?.providerAuthorityDigest ?? null,
    previousMaxAttempts: previous?.maxAttempts ?? null,
    previousLeaseSeconds: previous?.leaseSeconds ?? null,
    previousAcknowledgeSeconds: previous?.acknowledgeSeconds ?? null,
    previousBaseRetrySeconds: previous?.baseRetrySeconds ?? null,
    previousMaxRetrySeconds: previous?.maxRetrySeconds ?? null,
    previousConfigurationDigest: previous?.configurationDigest ?? null,
    targetWorkerRoleName: target.workerRoleName,
    targetWorkerRoleOid: target.workerRoleOid,
    targetProviderAuthorityDigest: target.providerAuthorityDigest,
    targetMaxAttempts: target.maxAttempts,
    targetLeaseSeconds: target.leaseSeconds,
    targetAcknowledgeSeconds: target.acknowledgeSeconds,
    targetBaseRetrySeconds: target.baseRetrySeconds,
    targetMaxRetrySeconds: target.maxRetrySeconds,
    targetConfigurationDigest: target.configurationDigest,
    runtimeConfigDigest: envelope.runtimeConfigDigest,
    expectedDatabaseName: envelope.expectedDatabaseName,
    expectedDatabaseOid: envelope.expectedDatabaseOid,
    databaseIdentityDigest: envelope.databaseIdentityDigest,
    deploymentMarkerId: envelope.deploymentMarkerId,
    deploymentMarkerDigest: envelope.deploymentMarkerDigest,
    actualContextDigest: envelope.actualContextDigest,
    releaseSha: envelope.releaseSha,
    actorDigest: envelope.actorDigest,
    signatureAlgorithm: envelope.signatureAlgorithm,
    signingKeyId: envelope.signingKeyId,
    publicKeyFingerprint: envelope.publicKeyFingerprint,
    signatureBase64url,
    requestedAt: envelope.requestedAt,
    expiresAt: envelope.expiresAt,
    dutyManifestContract: duty.manifestContract,
    dutyManifestProfile: duty.manifestProfile,
    dutyManifestId: duty.manifestId,
    dutyManifestRevision: duty.manifestRevision,
    dutyManifestPayloadDigest: duty.manifestPayloadDigest,
    dutyManifestSigningKeyId: duty.manifestSigningKeyId,
    dutyManifestPublicKeyFingerprint: duty.manifestPublicKeyFingerprint,
    dutyCoordinatorRoleName: duty.coordinatorRoleName,
    dutyCoordinatorRoleOid: duty.coordinatorRoleOid,
    dutyWorkerRoleName: duty.workerRoleName,
    dutyWorkerRoleOid: duty.workerRoleOid,
    dutyExactGrantsProfile: duty.exactGrantsProfile,
    dutyExactGrantsDigest: duty.exactGrantsDigest,
    dutyPredecessorManifestDigest: duty.predecessorManifestDigest,
    dutyApplicationContract: duty.applicationContract,
    dutyApplicationReleaseSha: duty.applicationReleaseSha,
    dutyApplicationArtifactSha256: duty.applicationArtifactSha256,
  });
}

function verifyAgainstRoots(documentValue, roots, context, now, mode) {
  const document = exactDataRecord(
    documentValue,
    DOCUMENT_KEYS,
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_DOCUMENT_INVALID",
  );
  if (
    !isSha256(document.proposalContentDigest) ||
    !isSha256(document.authorizationEnvelopeDigest)
  ) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_DOCUMENT_INVALID");
  }
  const proposal = normalizeProposal(document.proposal);
  const envelope = normalizeEnvelope(document.authorizationEnvelope);
  const nowMs = canonicalTimestamp(
    now,
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_CURRENT_TIME_INVALID",
  );
  if (mode === "SYNTHETIC") {
    const synthetic = exactDataRecord(
      context,
      SYNTHETIC_CONTEXT_KEYS,
      "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_SYNTHETIC_CONTEXT_DENIED",
    );
    if (
      synthetic.explicitConfirmation !==
        IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_SYNTHETIC_CONFIRMATION ||
      synthetic.environment !== "ci" ||
      synthetic.nodeEnv !== "test" ||
      typeof synthetic.hostname !== "string" ||
      synthetic.hostname !== synthetic.hostname.toLowerCase() ||
      !LOOPBACK_HOSTS.has(synthetic.hostname) ||
      String(process.env.NODE_ENV ?? "").toLowerCase() !== "test" ||
      synthetic.databaseName !== envelope.expectedDatabaseName ||
      !CI_DATABASE_PATTERN.test(synthetic.databaseName) ||
      PRODUCTION_DATABASE_PATTERN.test(synthetic.databaseName)
    ) {
      fail("IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_SYNTHETIC_CONTEXT_DENIED");
    }
  }
  const proposalCanonicalJson = canonicalStringify(proposal);
  const proposalContentDigest = sha256(
    Buffer.from(proposalCanonicalJson, "utf8"),
  );
  if (proposalContentDigest !== document.proposalContentDigest) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_PROPOSAL_DIGEST_INVALID");
  }
  validateProposalBinding(proposal, envelope, proposalContentDigest);
  const authorizationEnvelopeCanonicalJson = canonicalStringify(envelope);
  const signedPayload = Buffer.from(
    `${IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_DOMAIN}\n${authorizationEnvelopeCanonicalJson}\n`,
    "utf8",
  );
  const authorizationEnvelopeDigest = sha256(signedPayload);
  if (authorizationEnvelopeDigest !== document.authorizationEnvelopeDigest) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_ENVELOPE_DIGEST_INVALID");
  }
  const root = selectRoot(roots, envelope, nowMs);
  validateTimeline(envelope, root, nowMs);
  const signature = decodeSignature(document.signatureBase64url);
  if (
    !verifySignature(
      null,
      signedPayload,
      createPublicKey(root.publicKeyPem),
      signature,
    )
  ) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_SIGNATURE_INVALID");
  }
  const verified = deepFreeze({
    schemaVersion: 2,
    verificationMode: mode,
    authorityDomain: envelope.authorityDomain,
    contract: envelope.contract,
    commandId: envelope.commandId,
    tenantId: envelope.tenantId,
    requestId: envelope.requestId,
    action: envelope.action,
    intent: envelope.intent,
    rollbackOfCommandId: envelope.rollbackOfCommandId,
    proposalContentDigest,
    authorizationEnvelopeDigest,
    databaseName: envelope.expectedDatabaseName,
    databaseOid: envelope.expectedDatabaseOid,
    databaseIdentityDigest: envelope.databaseIdentityDigest,
    deploymentMarkerId: envelope.deploymentMarkerId,
    deploymentMarkerDigest: envelope.deploymentMarkerDigest,
    actualContextDigest: envelope.actualContextDigest,
    releaseSha: envelope.releaseSha,
    dutyManifestContract: envelope.dutyRoleBinding.manifestContract,
    dutyManifestProfile: envelope.dutyRoleBinding.manifestProfile,
    dutyManifestId: envelope.dutyRoleBinding.manifestId,
    dutyManifestRevision: envelope.dutyRoleBinding.manifestRevision,
    dutyManifestPayloadDigest:
      envelope.dutyRoleBinding.manifestPayloadDigest,
    dutyManifestSigningKeyId:
      envelope.dutyRoleBinding.manifestSigningKeyId,
    dutyManifestPublicKeyFingerprint:
      envelope.dutyRoleBinding.manifestPublicKeyFingerprint,
    dutyExactGrantsProfile: envelope.dutyRoleBinding.exactGrantsProfile,
    dutyExactGrantsDigest: envelope.dutyRoleBinding.exactGrantsDigest,
    dutyPredecessorManifestDigest:
      envelope.dutyRoleBinding.predecessorManifestDigest,
    dutyApplicationContract: envelope.dutyRoleBinding.applicationContract,
    dutyApplicationReleaseSha:
      envelope.dutyRoleBinding.applicationReleaseSha,
    dutyApplicationArtifactSha256:
      envelope.dutyRoleBinding.applicationArtifactSha256,
    dutyCoordinatorRoleName: envelope.dutyRoleBinding.coordinatorRoleName,
    dutyCoordinatorRoleOid: envelope.dutyRoleBinding.coordinatorRoleOid,
    dutyWorkerRoleName: envelope.dutyRoleBinding.workerRoleName,
    dutyWorkerRoleOid: envelope.dutyRoleBinding.workerRoleOid,
    signatureAlgorithm: envelope.signatureAlgorithm,
    signingKeyId: envelope.signingKeyId,
    publicKeyFingerprint: envelope.publicKeyFingerprint,
    requestedAt: envelope.requestedAt,
    expiresAt: envelope.expiresAt,
    verifiedAt: new Date(nowMs).toISOString(),
    authorization: false,
    canMutate: false,
    canSend: false,
  });
  if (mode === "PINNED") {
    const normalizedPayload = deepFreeze({
      authorizationEnvelope: envelope,
      authorizationEnvelopeDigest,
      proposal,
      proposalContentDigest,
      signatureBase64url: signature.toString("base64url"),
    });
    const evidence = deepFreeze({
      schemaVersion: 2,
      authorityDomain: envelope.authorityDomain,
      contract: envelope.contract,
      proposalCanonicalJson,
      proposalContentDigest,
      authorizationEnvelopeCanonicalJson,
      authorizationEnvelopeDigest,
      signatureBase64url: signature.toString("base64url"),
      signatureAlgorithm: envelope.signatureAlgorithm,
      signingKeyId: envelope.signingKeyId,
      publicKeyFingerprint: envelope.publicKeyFingerprint,
      requestedAt: envelope.requestedAt,
      expiresAt: envelope.expiresAt,
    });
    VERIFIED_PINNED_AUTHORITIES_V2.add(verified);
    VERIFIED_PINNED_PAYLOADS_V2.set(verified, normalizedPayload);
    VERIFIED_PINNED_DATABASE_ARGUMENTS_V2.set(
      verified,
      databaseArguments(
        envelope,
        proposalCanonicalJson,
        authorizationEnvelopeCanonicalJson,
        authorizationEnvelopeDigest,
        proposalContentDigest,
        signature.toString("base64url"),
      ),
    );
    VERIFIED_PINNED_EVIDENCE_V2.set(verified, evidence);
  } else {
    VERIFIED_SYNTHETIC_AUTHORITIES_V2.add(verified);
  }
  return verified;
}

export function verifyPinnedIdentityMailTenantEnrollmentCommandAuthorityV2(
  document,
) {
  if (arguments.length !== 1) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_ARGUMENTS_INVALID");
  }
  return verifyAgainstRoots(
    document,
    PINNED_IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_ROOTS,
    undefined,
    new Date().toISOString(),
    "PINNED",
  );
}

export function verifySyntheticIdentityMailTenantEnrollmentCommandAuthorityV2(
  document,
  roots,
  syntheticContext,
  now,
) {
  if (arguments.length !== 4) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_ARGUMENTS_INVALID");
  }
  return verifyAgainstRoots(document, roots, syntheticContext, now, "SYNTHETIC");
}

export function isVerifiedIdentityMailTenantEnrollmentCommandAuthorityV2(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    VERIFIED_PINNED_AUTHORITIES_V2.has(value)
  );
}

export function isVerifiedSyntheticIdentityMailTenantEnrollmentCommandAuthorityV2(
  value,
) {
  return (
    value !== null &&
    typeof value === "object" &&
    VERIFIED_SYNTHETIC_AUTHORITIES_V2.has(value)
  );
}

function requirePinned(verified) {
  if (!isVerifiedIdentityMailTenantEnrollmentCommandAuthorityV2(verified)) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_NOT_VERIFIED");
  }
}

export function identityMailTenantEnrollmentAuthorityV2Payload(verified) {
  if (arguments.length !== 1) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_ARGUMENTS_INVALID");
  }
  requirePinned(verified);
  return VERIFIED_PINNED_PAYLOADS_V2.get(verified);
}

export function identityMailTenantEnrollmentCommandV2DatabaseArguments(verified) {
  if (arguments.length !== 1) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_ARGUMENTS_INVALID");
  }
  requirePinned(verified);
  return VERIFIED_PINNED_DATABASE_ARGUMENTS_V2.get(verified);
}

export function identityMailTenantEnrollmentAuthorityV2Evidence(verified) {
  if (arguments.length !== 1) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_ARGUMENTS_INVALID");
  }
  requirePinned(verified);
  return VERIFIED_PINNED_EVIDENCE_V2.get(verified);
}

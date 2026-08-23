import {
  createHash,
  createPublicKey,
  verify as verifySignature,
} from "node:crypto";

import { canonicalStringify } from "./staff-task-integrity-canonical-json.mjs";

export const IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_DOMAIN =
  "IDENTITY_MAIL_TENANT_ENROLLMENT_COMMAND_V1";
export const IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_PURPOSE =
  "PROTECTED_MAIL_WORKER_TENANT_ENROLLMENT";
export const IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_PROFILE =
  "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V1";
export const IDENTITY_MAIL_TENANT_ENROLLMENT_SIGNATURE_ALGORITHM =
  "Ed25519";
export const IDENTITY_MAIL_TENANT_ENROLLMENT_CONTRACT =
  "PROTECTED_MAIL_WORKER_TENANT_ENROLLMENT_V1";
export const IDENTITY_MAIL_TENANT_ENROLLMENT_SYNTHETIC_CONFIRMATION =
  "allow-synthetic-identity-mail-tenant-enrollment-authority";

// A production key can be introduced only as reviewed release data. Neither
// an environment variable nor a caller argument can populate this registry.
export const PINNED_IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_ROOTS =
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
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const CI_DATABASE_PATTERN = /(?:^|_)(?:ci|test|testing)(?:$|_)/u;
const PRODUCTION_DATABASE_PATTERN =
  /(?:^|_)(?:live|prod|production)(?:$|_)/u;

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
  ["databaseName", "explicitConfirmation", "hostname", "nodeEnv"].sort(),
);

const VERIFIED_PINNED_AUTHORITIES = new WeakSet();
const VERIFIED_SYNTHETIC_AUTHORITIES = new WeakSet();
const VERIFIED_DATABASE_ARGUMENTS = new WeakMap();

export class IdentityMailTenantEnrollmentAuthorityError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = "IdentityMailTenantEnrollmentAuthorityError";
    this.code = code;
    this.reasonCode = code;
    this.exitCode = 3;
  }
}

function fail(code, message = code) {
  throw new IdentityMailTenantEnrollmentAuthorityError(code, message);
}

function exactDataRecord(value, expectedKeys, code) {
  let prototype;
  let descriptors;
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    fail(code);
  }
  if (
    !value ||
    Array.isArray(value) ||
    typeof value !== "object" ||
    ![Object.prototype, null].includes(prototype)
  ) {
    fail(code);
  }
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((key) => typeof key !== "string")) {
    fail(code);
  }
  keys.sort();
  if (
    keys.length !== expectedKeys.length ||
    keys.some((key, index) => key !== expectedKeys[index]) ||
    keys.some(
      (key) =>
        !Object.hasOwn(descriptors[key], "value") ||
        descriptors[key].enumerable !== true,
    )
  ) {
    fail(code);
  }
  const snapshot = Object.create(null);
  for (const key of expectedKeys) {
    snapshot[key] = descriptors[key].value;
  }
  return Object.freeze(snapshot);
}

function canonicalTimestamp(value, code) {
  if (typeof value !== "string") {
    fail(code);
  }
  const epochMs = Date.parse(value);
  if (!Number.isSafeInteger(epochMs) || new Date(epochMs).toISOString() !== value) {
    fail(code);
  }
  return epochMs;
}

function normalizeNow(now) {
  const current = now instanceof Date ? new Date(now.valueOf()) : new Date(now);
  if (Number.isNaN(current.valueOf())) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_CURRENT_TIME_INVALID");
  }
  return current.valueOf();
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

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

function normalizePolicy(value) {
  const policy = exactDataRecord(
    value,
    POLICY_KEYS,
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_POLICY_INVALID",
  );
  if (
    !boundedInteger(policy.maxAttempts, 1, 20) ||
    !boundedInteger(policy.leaseSeconds, 30, 900) ||
    !boundedInteger(policy.acknowledgeSeconds, 10, 900) ||
    !boundedInteger(policy.baseRetrySeconds, 1, 3_600) ||
    !boundedInteger(policy.maxRetrySeconds, 1, 86_400) ||
    policy.maxRetrySeconds < policy.baseRetrySeconds
  ) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_POLICY_INVALID");
  }
  return deepFreeze({ ...policy });
}

function normalizeConfiguration(value, nullable = false) {
  if (nullable && value === null) {
    return null;
  }
  const configuration = exactDataRecord(
    value,
    CONFIGURATION_KEYS,
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_CONFIGURATION_INVALID",
  );
  if (
    typeof configuration.workerRoleName !== "string" ||
    !ROLE_NAME_PATTERN.test(configuration.workerRoleName) ||
    configuration.workerRoleName === "public" ||
    configuration.workerRoleName.startsWith("pg_") ||
    !boundedInteger(configuration.workerRoleOid, 1, MAX_POSTGRES_OID) ||
    !isSha256(configuration.providerAuthorityDigest) ||
    !isSha256(configuration.configurationDigest)
  ) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_CONFIGURATION_INVALID");
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

function normalizeProposal(value) {
  const proposal = exactDataRecord(
    value,
    PROPOSAL_KEYS,
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_PROPOSAL_INVALID",
  );
  const policy = normalizePolicy(proposal.policy);
  if (
    proposal.authorization !== false ||
    proposal.canMutate !== false ||
    proposal.contract !== IDENTITY_MAIL_TENANT_ENROLLMENT_CONTRACT ||
    !["ENABLE", "ROTATE", "DISABLE"].includes(proposal.action) ||
    !isUuid(proposal.requestId) ||
    !isUuid(proposal.tenantId) ||
    typeof proposal.expectedDatabaseName !== "string" ||
    !DATABASE_NAME_PATTERN.test(proposal.expectedDatabaseName) ||
    SYSTEM_DATABASE_NAMES.has(proposal.expectedDatabaseName) ||
    !boundedInteger(proposal.expectedDatabaseOid, 1, MAX_POSTGRES_OID) ||
    typeof proposal.workerRoleName !== "string" ||
    !ROLE_NAME_PATTERN.test(proposal.workerRoleName) ||
    proposal.workerRoleName === "public" ||
    proposal.workerRoleName.startsWith("pg_") ||
    !boundedInteger(proposal.workerRoleOid, 1, MAX_POSTGRES_OID) ||
    !isSha256(proposal.deploymentMarkerDigest) ||
    !isSha256(proposal.providerAuthorityDigest) ||
    !isSha256(proposal.runtimeConfigDigest) ||
    typeof proposal.releaseSha !== "string" ||
    !RELEASE_SHA_PATTERN.test(proposal.releaseSha) ||
    !["ABSENT", "ACTIVE", "DISABLED"].includes(proposal.expectedState) ||
    !Number.isSafeInteger(proposal.expectedRevision) ||
    proposal.expectedRevision < 0 ||
    proposal.expectedRevision >= MAX_POSTGRES_INTEGER ||
    !Number.isSafeInteger(proposal.nextRevision) ||
    proposal.nextRevision > MAX_POSTGRES_INTEGER ||
    proposal.nextRevision !== proposal.expectedRevision + 1
  ) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_PROPOSAL_INVALID");
  }
  canonicalTimestamp(
    proposal.requestedAt,
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_TIMELINE_INVALID",
  );
  canonicalTimestamp(
    proposal.expiresAt,
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_TIMELINE_INVALID",
  );
  return deepFreeze({ ...proposal, policy });
}

function normalizeEnvelope(value) {
  const envelope = exactDataRecord(
    value,
    ENVELOPE_KEYS,
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_ENVELOPE_INVALID",
  );
  const previousConfiguration = normalizeConfiguration(
    envelope.previousConfiguration,
    true,
  );
  const targetConfiguration = normalizeConfiguration(
    envelope.targetConfiguration,
  );
  if (
    envelope.schemaVersion !== 1 ||
    envelope.authorityDomain !==
      IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_DOMAIN ||
    envelope.authorization !== true ||
    envelope.canMutate !== true ||
    envelope.contract !== IDENTITY_MAIL_TENANT_ENROLLMENT_CONTRACT ||
    envelope.signatureAlgorithm !==
      IDENTITY_MAIL_TENANT_ENROLLMENT_SIGNATURE_ALGORITHM ||
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
    typeof envelope.expectedDatabaseName !== "string" ||
    !DATABASE_NAME_PATTERN.test(envelope.expectedDatabaseName) ||
    SYSTEM_DATABASE_NAMES.has(envelope.expectedDatabaseName) ||
    !boundedInteger(envelope.expectedDatabaseOid, 1, MAX_POSTGRES_OID) ||
    !isSha256(envelope.databaseIdentityDigest) ||
    !isUuid(envelope.deploymentMarkerId) ||
    !isSha256(envelope.deploymentMarkerDigest) ||
    !isSha256(envelope.actualContextDigest) ||
    typeof envelope.releaseSha !== "string" ||
    !RELEASE_SHA_PATTERN.test(envelope.releaseSha) ||
    !isSha256(envelope.actorDigest)
  ) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_ENVELOPE_INVALID");
  }
  // This pure boundary proves only signed rollback linkage shape. The future
  // database accept RPC must enforce terminal/current FORWARD provenance,
  // exact inverse configuration, and one accepted rollback per command while
  // holding the tenant lock.
  if (
    (envelope.intent === "FORWARD" && envelope.rollbackOfCommandId !== null) ||
    (envelope.intent === "ROLLBACK" &&
      (!isUuid(envelope.rollbackOfCommandId) ||
        envelope.rollbackOfCommandId === envelope.commandId))
  ) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_ROLLBACK_INVALID");
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
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_TRANSITION_INVALID");
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
      Number.MAX_SAFE_INTEGER -
        (envelope.action === "ENABLE" ? 1 : 2) ||
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
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_REVISION_INVALID");
  }
  if (
    envelope.action === "ENABLE" &&
    envelope.expectedState === "DISABLED" &&
    !sameConfiguration(targetConfiguration, previousConfiguration)
  ) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_ENABLE_INVALID");
  }
  if (
    envelope.action === "ROTATE" &&
    (targetConfiguration.configurationDigest ===
      previousConfiguration.configurationDigest ||
      sameOperationalConfiguration(targetConfiguration, previousConfiguration))
  ) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_ROTATION_INVALID");
  }
  if (
    envelope.action === "DISABLE" &&
    !sameConfiguration(targetConfiguration, previousConfiguration)
  ) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_DISABLE_INVALID");
  }
  canonicalTimestamp(
    envelope.requestedAt,
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_TIMELINE_INVALID",
  );
  canonicalTimestamp(
    envelope.expiresAt,
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_TIMELINE_INVALID",
  );
  return deepFreeze({
    ...envelope,
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
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_BINDING_INVALID");
  }
}

function validateTimeline(envelope, root, nowMs) {
  const requestedAt = canonicalTimestamp(
    envelope.requestedAt,
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_TIMELINE_INVALID",
  );
  const expiresAt = canonicalTimestamp(
    envelope.expiresAt,
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_TIMELINE_INVALID",
  );
  const rootNotBefore = canonicalTimestamp(
    root.notBefore,
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_ROOT_INVALID",
  );
  const rootNotAfter = canonicalTimestamp(
    root.notAfter,
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_ROOT_INVALID",
  );
  if (
    expiresAt <= requestedAt ||
    expiresAt - requestedAt > MAX_COMMAND_LIFETIME_MS ||
    requestedAt > nowMs + MAX_CLOCK_SKEW_MS ||
    expiresAt <= nowMs ||
    nowMs < rootNotBefore ||
    nowMs >= rootNotAfter ||
    requestedAt < rootNotBefore ||
    expiresAt > rootNotAfter
  ) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_TIMELINE_INVALID");
  }
}

export function identityMailTenantEnrollmentAuthorityPublicKeyFingerprint(
  publicKey,
) {
  let key;
  try {
    key =
      publicKey?.type === "public" &&
      publicKey?.asymmetricKeyType === "ed25519"
        ? publicKey
        : createPublicKey(publicKey);
  } catch {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_ROOT_INVALID");
  }
  if (key.asymmetricKeyType !== "ed25519") {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_ROOT_INVALID");
  }
  return sha256(key.export({ type: "spki", format: "der" }));
}

function validateRootRegistry(roots) {
  let prototype;
  let descriptors;
  try {
    prototype = Object.getPrototypeOf(roots);
    descriptors = Object.getOwnPropertyDescriptors(roots);
  } catch {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_ROOTS_INVALID");
  }
  if (
    !roots ||
    Array.isArray(roots) ||
    typeof roots !== "object" ||
    ![Object.prototype, null].includes(prototype)
  ) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_ROOTS_INVALID");
  }
  const registryKeys = Reflect.ownKeys(descriptors).sort((left, right) =>
    String(left).localeCompare(String(right)),
  );
  if (
    registryKeys.some(
      (key) =>
        typeof key !== "string" ||
        !KEY_ID_PATTERN.test(key) ||
        !Object.hasOwn(descriptors[key], "value") ||
        descriptors[key].enumerable !== true,
    )
  ) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_ROOTS_INVALID");
  }
  const registry = Object.create(null);
  const fingerprints = new Set();
  for (const keyId of registryKeys) {
    const root = exactDataRecord(
      descriptors[keyId].value,
      ROOT_KEYS,
      "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_ROOT_INVALID",
    );
    const notBefore = canonicalTimestamp(
      root.notBefore,
      "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_ROOT_INVALID",
    );
    const notAfter = canonicalTimestamp(
      root.notAfter,
      "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_ROOT_INVALID",
    );
    if (typeof root.publicKeyPem !== "string") {
      fail("IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_ROOT_INVALID");
    }
    let canonicalPem;
    try {
      canonicalPem = createPublicKey(root.publicKeyPem).export({
        type: "spki",
        format: "pem",
      });
    } catch {
      fail("IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_ROOT_INVALID");
    }
    if (
      root.keyId !== keyId ||
      root.algorithm !== IDENTITY_MAIL_TENANT_ENROLLMENT_SIGNATURE_ALGORITHM ||
      root.purpose !== IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_PURPOSE ||
      root.profile !== IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_PROFILE ||
      root.status !== "ACTIVE" ||
      !isSha256(root.publicKeyFingerprint) ||
      notAfter <= notBefore ||
      canonicalPem !== root.publicKeyPem ||
      identityMailTenantEnrollmentAuthorityPublicKeyFingerprint(
        root.publicKeyPem,
      ) !== root.publicKeyFingerprint ||
      fingerprints.has(root.publicKeyFingerprint)
    ) {
      fail("IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_ROOT_INVALID");
    }
    fingerprints.add(root.publicKeyFingerprint);
    registry[keyId] = deepFreeze({ ...root });
  }
  return Object.freeze(registry);
}

function selectRoot(roots, envelope) {
  const registry = validateRootRegistry(roots);
  const root = Object.hasOwn(registry, envelope.signingKeyId)
    ? registry[envelope.signingKeyId]
    : undefined;
  if (!root) {
    fail(
      Object.keys(registry).length === 0
        ? "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_NOT_ENROLLED"
        : "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_KEY_NOT_TRUSTED",
    );
  }
  if (root.publicKeyFingerprint !== envelope.publicKeyFingerprint) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_KEY_NOT_TRUSTED");
  }
  return root;
}

function decodeSignature(encodedSignature) {
  if (
    typeof encodedSignature !== "string" ||
    !BASE64URL_SIGNATURE_PATTERN.test(encodedSignature)
  ) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_SIGNATURE_INVALID");
  }
  let signature;
  try {
    signature = Buffer.from(encodedSignature, "base64url");
  } catch {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_SIGNATURE_INVALID");
  }
  if (
    signature.length !== 64 ||
    signature.toString("base64url") !== encodedSignature
  ) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_SIGNATURE_INVALID");
  }
  return signature;
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
    previousProviderAuthorityDigest:
      previous?.providerAuthorityDigest ?? null,
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
  });
}

function verifyAgainstRoots(
  documentInput,
  roots,
  now,
  verificationMode,
  syntheticDatabaseName = undefined,
) {
  const nowMs = normalizeNow(now);
  const document = exactDataRecord(
    documentInput,
    DOCUMENT_KEYS,
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_DOCUMENT_INVALID",
  );
  if (
    !isSha256(document.proposalContentDigest) ||
    !isSha256(document.authorizationEnvelopeDigest)
  ) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_DOCUMENT_INVALID");
  }
  const proposal = normalizeProposal(document.proposal);
  const envelope = normalizeEnvelope(document.authorizationEnvelope);
  if (
    verificationMode === "SYNTHETIC" &&
    envelope.expectedDatabaseName !== syntheticDatabaseName
  ) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_SYNTHETIC_CONTEXT_DENIED");
  }
  const proposalCanonicalJson = canonicalStringify(proposal);
  const proposalContentDigest = sha256(
    Buffer.from(proposalCanonicalJson, "utf8"),
  );
  if (proposalContentDigest !== document.proposalContentDigest) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_PROPOSAL_DIGEST_INVALID");
  }
  validateProposalBinding(proposal, envelope, proposalContentDigest);

  const authorizationEnvelopeCanonicalJson = canonicalStringify(envelope);
  const signedPayload = Buffer.from(
    `${IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_DOMAIN}\n${authorizationEnvelopeCanonicalJson}\n`,
    "utf8",
  );
  const authorizationEnvelopeDigest = sha256(signedPayload);
  if (authorizationEnvelopeDigest !== document.authorizationEnvelopeDigest) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_ENVELOPE_DIGEST_INVALID");
  }
  const root = selectRoot(roots, envelope);
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
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_SIGNATURE_INVALID");
  }

  const verified = deepFreeze({
    schemaVersion: 1,
    verificationMode,
    authorityDomain: envelope.authorityDomain,
    commandId: envelope.commandId,
    tenantId: envelope.tenantId,
    requestId: envelope.requestId,
    action: envelope.action,
    intent: envelope.intent,
    rollbackOfCommandId: envelope.rollbackOfCommandId,
    proposalContentDigest,
    authorizationEnvelopeDigest,
    signatureAlgorithm: envelope.signatureAlgorithm,
    signingKeyId: envelope.signingKeyId,
    publicKeyFingerprint: envelope.publicKeyFingerprint,
    requestedAt: envelope.requestedAt,
    expiresAt: envelope.expiresAt,
    verifiedAt: new Date(nowMs).toISOString(),
  });
  if (verificationMode === "PINNED") {
    VERIFIED_PINNED_AUTHORITIES.add(verified);
    VERIFIED_DATABASE_ARGUMENTS.set(
      verified,
      databaseArguments(
        envelope,
        proposalCanonicalJson,
        authorizationEnvelopeCanonicalJson,
        authorizationEnvelopeDigest,
        proposalContentDigest,
        document.signatureBase64url,
      ),
    );
  } else {
    VERIFIED_SYNTHETIC_AUTHORITIES.add(verified);
  }
  return verified;
}

function assertSyntheticContext(context) {
  const snapshot = exactDataRecord(
    context,
    SYNTHETIC_CONTEXT_KEYS,
    "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_SYNTHETIC_CONTEXT_DENIED",
  );
  const hostname = typeof snapshot.hostname === "string" ? snapshot.hostname : "";
  if (
    snapshot.explicitConfirmation !==
      IDENTITY_MAIL_TENANT_ENROLLMENT_SYNTHETIC_CONFIRMATION ||
    String(process.env.NODE_ENV ?? "").toLowerCase() !== "test" ||
    snapshot.nodeEnv !== "test" ||
    hostname !== hostname.toLowerCase() ||
    !LOOPBACK_HOSTS.has(hostname) ||
    typeof snapshot.databaseName !== "string" ||
    !DATABASE_NAME_PATTERN.test(snapshot.databaseName) ||
    !CI_DATABASE_PATTERN.test(snapshot.databaseName) ||
    PRODUCTION_DATABASE_PATTERN.test(snapshot.databaseName)
  ) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_SYNTHETIC_CONTEXT_DENIED");
  }
  return snapshot;
}

export function verifyPinnedIdentityMailTenantEnrollmentCommandAuthority(
  document,
) {
  if (arguments.length !== 1) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_ARGUMENTS_INVALID");
  }
  return verifyAgainstRoots(
    document,
    PINNED_IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_ROOTS,
    new Date(),
    "PINNED",
  );
}

export function verifySyntheticIdentityMailTenantEnrollmentCommandAuthority(
  document,
  roots,
  context,
  now = new Date(),
) {
  const syntheticContext = assertSyntheticContext(context);
  return verifyAgainstRoots(
    document,
    roots,
    now,
    "SYNTHETIC",
    syntheticContext.databaseName,
  );
}

export function isVerifiedIdentityMailTenantEnrollmentCommandAuthority(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    VERIFIED_PINNED_AUTHORITIES.has(value)
  );
}

export function isVerifiedSyntheticIdentityMailTenantEnrollmentCommandAuthority(
  value,
) {
  return (
    value !== null &&
    typeof value === "object" &&
    VERIFIED_SYNTHETIC_AUTHORITIES.has(value)
  );
}

export function identityMailTenantEnrollmentCommandDatabaseArguments(verified) {
  if (!isVerifiedIdentityMailTenantEnrollmentCommandAuthority(verified)) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_NOT_VERIFIED");
  }
  return VERIFIED_DATABASE_ARGUMENTS.get(verified);
}

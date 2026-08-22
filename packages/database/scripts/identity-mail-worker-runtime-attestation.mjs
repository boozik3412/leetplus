import {
  createHash,
  createPublicKey,
  verify as verifySignature,
} from "node:crypto";

import { canonicalStringify } from "./staff-task-integrity-canonical-json.mjs";

export const IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_SIGNATURE_ALGORITHM =
  "Ed25519";
export const IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_TRUST_DOMAIN =
  "LEETPLUS_IDENTITY_MAIL_WORKER_RUNTIME_AUTHORITY_V1";
export const IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_PURPOSE =
  "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION";
export const IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_PROFILE =
  "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_PROFILE_V1";
export const IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_KIND =
  "LEETPLUS_IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION";
export const IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_CONTRACT =
  "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_V1";
export const IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_SCHEMA_HEAD =
  "20260801010000_identity_mail_tenant_enrollment_control_plane";
export const IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_MIGRATION_COUNT = 180;
export const IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_MAX_TENANTS = 4;
export const IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_MAX_LIFETIME_MS =
  15 * 60 * 1_000;
export const IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_MAX_CLOCK_SKEW_MS =
  60 * 1_000;
export const IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_TENANT_ORDER =
  "STRICT_ASCENDING_TENANT_ID";
export const IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_SYNTHETIC_CONFIRMATION =
  "allow-synthetic-identity-mail-worker-runtime-attestation-loopback-ci";

// Deliberately empty. A production authority requires a separately reviewed
// root-enrollment ceremony. Neither callers nor environment variables can add
// roots to the production verification path.
export const PINNED_IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_ROOTS =
  Object.freeze({});

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SHA_256_PATTERN = /^[0-9a-f]{64}$/u;
const RELEASE_SHA_PATTERN = /^[0-9a-f]{40}$/u;
const KEY_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{2,63}$/u;
const SAFE_POSTGRES_DATABASE_PATTERN = /^[a-z][a-z0-9_]{0,62}$/u;
const SAFE_POSTGRES_ROLE_PATTERN = /^[a-z_][a-z0-9_]{2,62}$/u;
const CI_DATABASE_PATTERN = /(?:^|[_-])(?:ci|test|testing)(?:$|[_-])/u;
const PRODUCTION_DATABASE_PATTERN =
  /(?:^|[_-])(?:live|prod|production)(?:$|[_-])/u;
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const SYSTEM_DATABASES = new Set(["postgres", "template0", "template1"]);
const MAX_POSTGRES_OID = 4_294_967_295;
const MAX_REVISION = 2_147_483_647;

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
const PAYLOAD_KEYS = Object.freeze(
  [
    "actualContextDigest",
    "attestationId",
    "contract",
    "databaseIdentityDigest",
    "databaseName",
    "databaseOid",
    "deploymentMarkerDigest",
    "deploymentMarkerId",
    "issuedAt",
    "kind",
    "migrationCount",
    "profile",
    "publicKeyFingerprint",
    "purpose",
    "releaseSha",
    "runtimeConfigDigest",
    "schemaHead",
    "schemaVersion",
    "signingKeyId",
    "tenantBindings",
    "trustDomain",
    "validUntil",
    "workerArtifactDigest",
    "workerExecutableDigest",
  ].sort(),
);
const EXPECTED_BINDING_KEYS = Object.freeze(
  [
    "actualContextDigest",
    "databaseIdentityDigest",
    "databaseName",
    "databaseOid",
    "deploymentMarkerDigest",
    "deploymentMarkerId",
    "migrationCount",
    "releaseSha",
    "runtimeConfigDigest",
    "schemaHead",
    "tenantBindings",
    "workerArtifactDigest",
    "workerExecutableDigest",
  ].sort(),
);
const TENANT_BINDING_KEYS = Object.freeze(
  [
    "currentConfigurationDigest",
    "policyRevision",
    "providerAuthorityDigest",
    "stateRevision",
    "tenantId",
    "workerRoleName",
    "workerRoleOid",
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

const VERIFIED_RUNTIME_ATTESTATIONS = new WeakSet();

export class IdentityMailWorkerRuntimeAttestationError extends Error {
  constructor(reasonCode, message) {
    super(message);
    this.name = "IdentityMailWorkerRuntimeAttestationError";
    this.reasonCode = reasonCode;
    this.code = reasonCode;
    this.exitCode = 3;
    this.safeContractError = true;
  }
}

function fail(reasonCode, message) {
  throw new IdentityMailWorkerRuntimeAttestationError(reasonCode, message);
}

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function exactDataRecord(value, expectedKeys, reasonCode, message) {
  if (!value || Array.isArray(value) || typeof value !== "object") {
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
      return !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true;
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
  if (!value || Array.isArray(value) || typeof value !== "object") {
    fail(
      "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_ROOTS_INVALID",
      "The worker runtime-attestation authority registry is invalid.",
    );
  }

  let prototype;
  let descriptors;
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    fail(
      "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_ROOTS_INVALID",
      "The worker runtime-attestation authority registry is invalid.",
    );
  }
  if (prototype !== Object.prototype && prototype !== null) {
    fail(
      "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_ROOTS_INVALID",
      "The worker runtime-attestation authority registry is invalid.",
    );
  }

  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.some((key) => typeof key !== "string") ||
    keys.some((key) => {
      const descriptor = descriptors[key];
      return !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true;
    })
  ) {
    fail(
      "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_ROOTS_INVALID",
      "The worker runtime-attestation authority registry is invalid.",
    );
  }
  return keys.sort(compareStrings).map((key) => [key, descriptors[key].value]);
}

function exactDataArray(value, reasonCode, message) {
  if (!Array.isArray(value)) {
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
  if (prototype !== Array.prototype) {
    fail(reasonCode, message);
  }

  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((key) => typeof key !== "string")) {
    fail(reasonCode, message);
  }
  const lengthDescriptor = descriptors.length;
  if (
    !lengthDescriptor ||
    !Object.hasOwn(lengthDescriptor, "value") ||
    !Number.isSafeInteger(lengthDescriptor.value) ||
    lengthDescriptor.value < 0 ||
    lengthDescriptor.value >
      IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_MAX_TENANTS
  ) {
    fail(reasonCode, message);
  }
  const length = lengthDescriptor.value;
  const expectedKeys = [
    ...Array.from({ length }, (_, index) => String(index)),
    "length",
  ].sort(compareStrings);
  keys.sort(compareStrings);
  if (
    keys.length !== expectedKeys.length ||
    keys.some((key, index) => key !== expectedKeys[index]) ||
    expectedKeys.some((key) => {
      const descriptor = descriptors[key];
      if (!Object.hasOwn(descriptor, "value")) {
        return true;
      }
      return key === "length"
        ? descriptor.enumerable !== false
        : descriptor.enumerable !== true;
    })
  ) {
    fail(reasonCode, message);
  }

  return Object.freeze(
    Array.from({ length }, (_, index) => descriptors[index].value),
  );
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

function normalizeNow(now) {
  return canonicalIsoEpoch(
    now,
    "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_CURRENT_TIME_INVALID",
    "The explicit verification time",
  );
}

function validDigest(value) {
  return typeof value === "string" && SHA_256_PATTERN.test(value);
}

function validOid(value) {
  return (
    Number.isSafeInteger(value) && value >= 1 && value <= MAX_POSTGRES_OID
  );
}

function validRevision(value) {
  return Number.isSafeInteger(value) && value >= 1 && value <= MAX_REVISION;
}

function validRoleName(value) {
  return (
    typeof value === "string" &&
    SAFE_POSTGRES_ROLE_PATTERN.test(value) &&
    value !== "public" &&
    !value.startsWith("pg_")
  );
}

function validateTenantBindings(value, reasonCode) {
  const tenants = exactDataArray(
    value,
    reasonCode,
    "Tenant bindings must be one exact dense data-only array.",
  );
  if (
    tenants.length < 1 ||
    tenants.length > IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_MAX_TENANTS
  ) {
    fail(reasonCode, "A worker attestation must bind between one and four tenants.");
  }

  const normalized = tenants.map((candidate) => {
    const tenant = exactDataRecord(
      candidate,
      TENANT_BINDING_KEYS,
      reasonCode,
      "Each tenant binding must be an exact data-only record.",
    );
    if (
      typeof tenant.tenantId !== "string" ||
      !UUID_PATTERN.test(tenant.tenantId) ||
      !validRevision(tenant.policyRevision) ||
      !validRevision(tenant.stateRevision) ||
      tenant.stateRevision < tenant.policyRevision ||
      !validDigest(tenant.currentConfigurationDigest) ||
      !validDigest(tenant.providerAuthorityDigest) ||
      !validRoleName(tenant.workerRoleName) ||
      !validOid(tenant.workerRoleOid)
    ) {
      fail(reasonCode, "A tenant runtime binding failed its exact contract.");
    }
    return Object.freeze({ ...tenant });
  });

  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index - 1].tenantId >= normalized[index].tenantId) {
      fail(
        reasonCode,
        "Tenant bindings must be unique and strictly ordered by tenantId.",
      );
    }
    if (
      normalized[index - 1].workerRoleName !== normalized[index].workerRoleName ||
      normalized[index - 1].workerRoleOid !== normalized[index].workerRoleOid
    ) {
      fail(
        reasonCode,
        "Every tenant binding must identify the same worker database role.",
      );
    }
  }
  return Object.freeze(normalized);
}

function validateBindingScalars(binding, reasonCode) {
  if (
    typeof binding.releaseSha !== "string" ||
    !RELEASE_SHA_PATTERN.test(binding.releaseSha) ||
    binding.schemaHead !==
      IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_SCHEMA_HEAD ||
    binding.migrationCount !==
      IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_MIGRATION_COUNT ||
    typeof binding.deploymentMarkerId !== "string" ||
    !UUID_PATTERN.test(binding.deploymentMarkerId) ||
    ![
      binding.deploymentMarkerDigest,
      binding.databaseIdentityDigest,
      binding.actualContextDigest,
      binding.runtimeConfigDigest,
      binding.workerExecutableDigest,
      binding.workerArtifactDigest,
    ].every(validDigest) ||
    typeof binding.databaseName !== "string" ||
    !SAFE_POSTGRES_DATABASE_PATTERN.test(binding.databaseName) ||
    SYSTEM_DATABASES.has(binding.databaseName) ||
    !validOid(binding.databaseOid)
  ) {
    fail(reasonCode, "The worker runtime binding failed its exact contract.");
  }
}

function normalizeExpectedBindings(value) {
  const expected = exactDataRecord(
    value,
    EXPECTED_BINDING_KEYS,
    "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_EXPECTED_BINDINGS_INVALID",
    "Expected runtime bindings must be an exact data-only record.",
  );
  validateBindingScalars(
    expected,
    "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_EXPECTED_BINDINGS_INVALID",
  );
  const tenantBindings = validateTenantBindings(
    expected.tenantBindings,
    "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_EXPECTED_BINDINGS_INVALID",
  );
  return Object.freeze({ ...expected, tenantBindings });
}

function normalizePayload(value) {
  const payload = exactDataRecord(
    value,
    PAYLOAD_KEYS,
    "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_PAYLOAD_INVALID",
    "The signed worker runtime-attestation payload shape is invalid.",
  );
  const tenantBindings = validateTenantBindings(
    payload.tenantBindings,
    "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_TENANT_BINDINGS_INVALID",
  );
  const normalized = Object.freeze({ ...payload, tenantBindings });
  validateBindingScalars(
    normalized,
    "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_RELEASE_BINDING_INVALID",
  );
  if (
    normalized.schemaVersion !== 1 ||
    normalized.kind !== IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_KIND ||
    normalized.contract !== IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_CONTRACT ||
    normalized.trustDomain !==
      IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_TRUST_DOMAIN ||
    normalized.purpose !== IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_PURPOSE ||
    normalized.profile !== IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_PROFILE ||
    typeof normalized.attestationId !== "string" ||
    !UUID_PATTERN.test(normalized.attestationId) ||
    typeof normalized.signingKeyId !== "string" ||
    !KEY_ID_PATTERN.test(normalized.signingKeyId) ||
    !validDigest(normalized.publicKeyFingerprint)
  ) {
    fail(
      "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_CONTRACT_INVALID",
      "The signed worker runtime-attestation discriminator contract is invalid.",
    );
  }
  return normalized;
}

function bindingProjection(payload) {
  return Object.freeze({
    actualContextDigest: payload.actualContextDigest,
    databaseIdentityDigest: payload.databaseIdentityDigest,
    databaseName: payload.databaseName,
    databaseOid: payload.databaseOid,
    deploymentMarkerDigest: payload.deploymentMarkerDigest,
    deploymentMarkerId: payload.deploymentMarkerId,
    migrationCount: payload.migrationCount,
    releaseSha: payload.releaseSha,
    runtimeConfigDigest: payload.runtimeConfigDigest,
    schemaHead: payload.schemaHead,
    tenantBindings: payload.tenantBindings,
    workerArtifactDigest: payload.workerArtifactDigest,
    workerExecutableDigest: payload.workerExecutableDigest,
  });
}

export function identityMailWorkerRuntimeAttestationPayloadDigest(payload) {
  return createHash("sha256")
    .update(canonicalStringify(payload), "utf8")
    .digest("hex");
}

export function identityMailWorkerRuntimeAttestationPublicKeyFingerprint(
  publicKeyPem,
) {
  try {
    const key = createPublicKey(publicKeyPem);
    if (key.asymmetricKeyType !== "ed25519") {
      fail(
        "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_ROOT_INVALID",
        "The runtime-attestation authority key must be Ed25519.",
      );
    }
    return createHash("sha256")
      .update(key.export({ type: "spki", format: "der" }))
      .digest("hex");
  } catch (error) {
    if (error instanceof IdentityMailWorkerRuntimeAttestationError) {
      throw error;
    }
    fail(
      "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_ROOT_INVALID",
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
      "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_ROOT_INVALID",
      "A runtime-attestation authority root must be exact and data-only.",
    );
    if (typeof root.publicKeyPem !== "string") {
      fail(
        "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_ROOT_INVALID",
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
        "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_ROOT_INVALID",
        "A runtime-attestation authority public key is invalid.",
      );
    }
    const fingerprint = identityMailWorkerRuntimeAttestationPublicKeyFingerprint(
      root.publicKeyPem,
    );
    const notBefore = canonicalIsoEpoch(
      root.notBefore,
      "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_ROOT_INVALID",
      "Authority validity start",
    );
    const notAfter = canonicalIsoEpoch(
      root.notAfter,
      "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_ROOT_INVALID",
      "Authority validity end",
    );
    if (
      !KEY_ID_PATTERN.test(registryKey) ||
      root.keyId !== registryKey ||
      root.algorithm !==
        IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_SIGNATURE_ALGORITHM ||
      root.trustDomain !==
        IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_TRUST_DOMAIN ||
      root.purpose !== IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_PURPOSE ||
      root.profile !== IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_PROFILE ||
      root.status !== "ACTIVE" ||
      !validDigest(root.publicKeyFingerprint) ||
      root.publicKeyFingerprint !== fingerprint ||
      key.asymmetricKeyType !== "ed25519" ||
      canonicalPem !== root.publicKeyPem ||
      notAfter <= notBefore ||
      seenFingerprints.has(fingerprint)
    ) {
      fail(
        "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_ROOT_INVALID",
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
        ? "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_AUTHORITY_NOT_ENROLLED"
        : "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_AUTHORITY_KEY_NOT_TRUSTED",
      "No active pinned worker runtime-attestation authority can verify the payload.",
    );
  }
  if (nowMs < Date.parse(root.notBefore) || nowMs >= Date.parse(root.notAfter)) {
    fail(
      "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_ROOT_INACTIVE",
      "The worker runtime-attestation authority is outside its validity window.",
    );
  }
  return root;
}

function decodeSignature(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/u.test(value)) {
    fail(
      "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_SIGNATURE_INVALID",
      "The Ed25519 signature encoding is invalid.",
    );
  }
  const signature = Buffer.from(value, "base64url");
  if (signature.length !== 64 || signature.toString("base64url") !== value) {
    fail(
      "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_SIGNATURE_INVALID",
      "The signature must be one canonical 64-byte Ed25519 base64url value.",
    );
  }
  return signature;
}

function assertTimeline(payload, root, nowMs) {
  const issuedAt = canonicalIsoEpoch(
    payload.issuedAt,
    "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_TIMELINE_INVALID",
    "Attestation issue time",
  );
  const validUntil = canonicalIsoEpoch(
    payload.validUntil,
    "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_TIMELINE_INVALID",
    "Attestation validity end",
  );
  const rootNotBefore = Date.parse(root.notBefore);
  const rootNotAfter = Date.parse(root.notAfter);
  if (
    issuedAt > nowMs + IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_MAX_CLOCK_SKEW_MS ||
    issuedAt < rootNotBefore ||
    issuedAt >= rootNotAfter ||
    validUntil <= issuedAt ||
    validUntil <= nowMs ||
    validUntil > rootNotAfter ||
    validUntil - issuedAt >
      IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_MAX_LIFETIME_MS
  ) {
    fail(
      "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_TIMELINE_INVALID",
      "The worker runtime attestation is stale or outside its bounded validity window.",
    );
  }
}

function verifyAgainstRoots(envelopeValue, expectedValue, roots, now) {
  const envelope = exactDataRecord(
    envelopeValue,
    ENVELOPE_KEYS,
    "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_ENVELOPE_INVALID",
    "The worker runtime-attestation envelope shape is invalid.",
  );
  const payload = normalizePayload(envelope.payload);
  const expected = normalizeExpectedBindings(expectedValue);
  const nowMs = normalizeNow(now);
  if (
    envelope.signatureAlgorithm !==
      IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_SIGNATURE_ALGORITHM ||
    typeof envelope.signingKeyId !== "string" ||
    !KEY_ID_PATTERN.test(envelope.signingKeyId) ||
    !validDigest(envelope.publicKeyFingerprint) ||
    !validDigest(envelope.payloadDigest) ||
    envelope.signingKeyId !== payload.signingKeyId ||
    envelope.publicKeyFingerprint !== payload.publicKeyFingerprint ||
    identityMailWorkerRuntimeAttestationPayloadDigest(payload) !==
      envelope.payloadDigest
  ) {
    fail(
      "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_ENVELOPE_BINDING_INVALID",
      "The worker runtime-attestation envelope binding is invalid.",
    );
  }

  const root = selectRoot(roots, envelope.signingKeyId, nowMs);
  if (root.publicKeyFingerprint !== envelope.publicKeyFingerprint) {
    fail(
      "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_AUTHORITY_KEY_NOT_TRUSTED",
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
      "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_SIGNATURE_INVALID",
      "The worker runtime-attestation Ed25519 signature is invalid.",
    );
  }
  assertTimeline(payload, root, nowMs);
  if (
    canonicalStringify(bindingProjection(payload)) !==
    canonicalStringify(expected)
  ) {
    fail(
      "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_EXPECTED_BINDING_MISMATCH",
      "The signed attestation does not describe the observed worker runtime.",
    );
  }

  const verifiedPayload = Object.freeze({
    ...payload,
    tenantBindings: Object.freeze(
      payload.tenantBindings.map((tenant) => Object.freeze({ ...tenant })),
    ),
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
    databaseReadinessRequiredPerTenant: true,
    envelope: verifiedEnvelope,
    tenantIds: Object.freeze(
      verifiedPayload.tenantBindings.map((tenant) => tenant.tenantId),
    ),
    verifiedAt: new Date(nowMs).toISOString(),
  });
  VERIFIED_RUNTIME_ATTESTATIONS.add(verified);
  return verified;
}

function assertSyntheticContext(contextValue, expected) {
  const context = exactDataRecord(
    contextValue,
    SYNTHETIC_CONTEXT_KEYS,
    "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_SYNTHETIC_CONTEXT_DENIED",
    "Synthetic verification requires an exact loopback-CI context.",
  );
  if (
    context.explicitConfirmation !==
      IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_SYNTHETIC_CONFIRMATION ||
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
      "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_SYNTHETIC_CONTEXT_DENIED",
      "Synthetic roots are restricted to an explicitly confirmed loopback CI database.",
    );
  }
  return Object.freeze({ ...context });
}

export function verifyPinnedIdentityMailWorkerRuntimeAttestationEnvelope(
  envelope,
  expectedBindings,
) {
  if (arguments.length !== 2) {
    fail(
      "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_ARGUMENTS_INVALID",
      "Pinned verification accepts only envelope and expected bindings.",
    );
  }
  return verifyAgainstRoots(
    envelope,
    expectedBindings,
    PINNED_IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_ROOTS,
    new Date().toISOString(),
  );
}

export function verifySyntheticIdentityMailWorkerRuntimeAttestationEnvelope(
  envelope,
  expectedBindings,
  roots,
  syntheticContext,
  now,
) {
  if (arguments.length !== 5) {
    fail(
      "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_ARGUMENTS_INVALID",
      "Synthetic verification requires roots, exact loopback-CI context, and explicit now.",
    );
  }
  const expected = normalizeExpectedBindings(expectedBindings);
  assertSyntheticContext(syntheticContext, expected);
  return verifyAgainstRoots(envelope, expected, roots, now);
}

export function isVerifiedIdentityMailWorkerRuntimeAttestation(value) {
  return (
    !!value &&
    typeof value === "object" &&
    VERIFIED_RUNTIME_ATTESTATIONS.has(value)
  );
}

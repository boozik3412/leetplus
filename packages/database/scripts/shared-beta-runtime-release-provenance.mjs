import {
  createHash,
  createPublicKey,
  verify as verifySignature,
} from "node:crypto";

import { sharedBetaPublicKeyFingerprint } from "./shared-beta-admission-provenance.mjs";
import { canonicalStringify } from "./staff-task-integrity-canonical-json.mjs";

export const SHARED_BETA_RUNTIME_RELEASE_SIGNATURE_ALGORITHM = "Ed25519";
export const SHARED_BETA_RUNTIME_RELEASE_PROFILE =
  "SHARED_BETA_RUNTIME_RELEASE_PROVENANCE_V1";
export const SHARED_BETA_BUILD_PROVENANCE_PURPOSE =
  "SHARED_BETA_BUILD_PROVENANCE";
export const SHARED_BETA_DEPLOYMENT_PROVENANCE_PURPOSE =
  "SHARED_BETA_DEPLOYMENT_PROVENANCE";
export const SHARED_BETA_BUILD_PROVENANCE_KIND =
  "LEETPLUS_SHARED_BETA_BUILD_PROVENANCE";
export const SHARED_BETA_DEPLOYMENT_PROVENANCE_KIND =
  "LEETPLUS_SHARED_BETA_DEPLOYMENT_PROVENANCE";
export const SHARED_BETA_BUILD_PROVENANCE_CONTRACT =
  "SHARED_BETA_BUILD_PROVENANCE_V1";
export const SHARED_BETA_DEPLOYMENT_PROVENANCE_CONTRACT =
  "SHARED_BETA_DEPLOYMENT_PROVENANCE_V1";
export const SHARED_BETA_TRIAL_POLICY_VERSION = "SHARED_BETA_TRIAL_V1";
export const SHARED_BETA_TRIAL_DURATION_MIN_SECONDS = 60 * 60;
export const SHARED_BETA_TRIAL_DURATION_MAX_SECONDS = 90 * 24 * 60 * 60;
export const SHARED_BETA_RUNTIME_RELEASE_MINIMUM_SCHEMA_TIMESTAMP =
  "20260730040000";
export const SHARED_BETA_RUNTIME_RELEASE_MINIMUM_MIGRATION_COUNT = 174;
export const SHARED_BETA_SYNTHETIC_RUNTIME_RELEASE_CONFIRMATION =
  "allow-synthetic-shared-beta-runtime-release-provenance";

// Deliberately empty. Production roots require two independent, reviewed
// enrollment ceremonies. Callers and environment variables cannot add roots.
export const PINNED_SHARED_BETA_BUILD_PROVENANCE_ROOTS = Object.freeze({});
export const PINNED_SHARED_BETA_DEPLOYMENT_PROVENANCE_ROOTS = Object.freeze({});

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SHA_256_PATTERN = /^[0-9a-f]{64}$/u;
const RELEASE_SHA_PATTERN = /^[0-9a-f]{40}$/u;
const ENVIRONMENT_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/u;
const KEY_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{2,63}$/u;
const SCHEMA_HEAD_PATTERN = /^[0-9]{14}_[a-z0-9_]{1,100}$/u;
const SAFE_POSTGRES_IDENTIFIER_PATTERN = /^[a-z_][a-z0-9_]{0,62}$/u;
const CI_DATABASE_PATTERN = /(?:^|[_-])(?:ci|test|testing)(?:$|[_-])/u;
const PRODUCTION_DATABASE_PATTERN =
  /(?:^|[_-])(?:live|prod|production)(?:$|[_-])/u;
const SAFE_CI_DATABASE_PATTERN = /^[a-z][a-z0-9_-]{2,62}$/u;
const PRODUCTION_ENVIRONMENTS = new Set(["live", "prod", "production"]);
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const MAX_POSTGRES_OID = 4_294_967_295;
const MAX_BUILD_LIFETIME_MS = 7 * 24 * 60 * 60 * 1_000;
const MAX_DEPLOYMENT_LIFETIME_MS = 24 * 60 * 60 * 1_000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1_000;

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
  ].sort(),
);
const BUILD_PAYLOAD_KEYS = Object.freeze(
  [
    "artifactContentDigest",
    "buildReferenceDigest",
    "buildTime",
    "builtAtEpochMs",
    "contract",
    "kind",
    "migrationCount",
    "migrationManifestDigest",
    "policyManifestDigest",
    "profile",
    "publicKeyFingerprint",
    "purpose",
    "releaseManifestDigest",
    "releaseSha",
    "schemaHead",
    "schemaVersion",
    "signingKeyId",
    "trialDurationSeconds",
    "trialPolicyVersion",
    "validUntilEpochMs",
  ].sort(),
);
const DEPLOYMENT_PAYLOAD_KEYS = Object.freeze(
  [
    "activationDatabaseRole",
    "actualContextDigest",
    "buildPayloadDigest",
    "buildProvenanceId",
    "contract",
    "coordinatorRoleName",
    "coordinatorRoleOid",
    "databaseChallengeDigest",
    "databaseIdentityDigest",
    "deployedAtEpochMs",
    "deploymentInstanceDigest",
    "deploymentMarkerId",
    "environment",
    "generation",
    "kind",
    "predecessorMarkerDigest",
    "profile",
    "publicKeyFingerprint",
    "purpose",
    "schemaVersion",
    "signingKeyId",
    "validUntilEpochMs",
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

const VERIFIED_BUILD_PROVENANCE = new WeakSet();
const VERIFIED_DEPLOYMENT_PROVENANCE = new WeakSet();
const VERIFIED_RUNTIME_RELEASE_PAIRS = new WeakSet();
const VERIFIED_BUILD_SIGNATURES = new WeakMap();
const VERIFIED_DEPLOYMENT_SIGNATURES = new WeakMap();

function runtimeReleaseError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.exitCode = 3;
  error.safeContractError = true;
  throw error;
}

function compareKeys(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function exactDataRecord(value, keys, code, message) {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    runtimeReleaseError(code, message);
  }

  let prototype;
  let descriptors;
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    runtimeReleaseError(code, message);
  }
  if (prototype !== Object.prototype && prototype !== null) {
    runtimeReleaseError(code, message);
  }

  const expectedKeys = [...keys].sort(compareKeys);
  const actualKeys = Reflect.ownKeys(descriptors).sort((left, right) =>
    compareKeys(String(left), String(right)),
  );
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some(
      (key, index) => typeof key !== "string" || key !== expectedKeys[index],
    ) ||
    actualKeys.some(
      (key) =>
        !Object.hasOwn(descriptors[key], "value") ||
        descriptors[key].enumerable !== true,
    )
  ) {
    runtimeReleaseError(code, message);
  }

  const snapshot = Object.create(null);
  for (const key of expectedKeys) {
    snapshot[key] = descriptors[key].value;
  }
  return Object.freeze(snapshot);
}

function dataOnlyRegistryEntries(roots) {
  if (!roots || Array.isArray(roots) || typeof roots !== "object") {
    runtimeReleaseError(
      "SHARED_BETA_RUNTIME_RELEASE_ROOTS_INVALID",
      "The runtime-release authority registry is invalid.",
    );
  }

  let prototype;
  let descriptors;
  try {
    prototype = Object.getPrototypeOf(roots);
    descriptors = Object.getOwnPropertyDescriptors(roots);
  } catch {
    runtimeReleaseError(
      "SHARED_BETA_RUNTIME_RELEASE_ROOTS_INVALID",
      "The runtime-release authority registry is invalid.",
    );
  }
  if (prototype !== Object.prototype && prototype !== null) {
    runtimeReleaseError(
      "SHARED_BETA_RUNTIME_RELEASE_ROOTS_INVALID",
      "The runtime-release authority registry is invalid.",
    );
  }

  const keys = Reflect.ownKeys(descriptors).sort((left, right) =>
    compareKeys(String(left), String(right)),
  );
  if (
    keys.some((key) => typeof key !== "string") ||
    keys.some(
      (key) =>
        !Object.hasOwn(descriptors[key], "value") ||
        descriptors[key].enumerable !== true,
    )
  ) {
    runtimeReleaseError(
      "SHARED_BETA_RUNTIME_RELEASE_ROOTS_INVALID",
      "The runtime-release authority registry is invalid.",
    );
  }
  return keys.map((key) => [key, descriptors[key].value]);
}

function canonicalEpochMs(value, label) {
  if (
    !Number.isSafeInteger(value) ||
    value < Date.parse("2020-01-01T00:00:00.000Z") ||
    new Date(value).valueOf() !== value
  ) {
    runtimeReleaseError(
      "SHARED_BETA_RUNTIME_RELEASE_TIMELINE_INVALID",
      `${label} must be a safe millisecond epoch.`,
    );
  }
  return value;
}

function canonicalIsoEpoch(value, label) {
  if (typeof value !== "string") {
    runtimeReleaseError(
      "SHARED_BETA_RUNTIME_RELEASE_TIMELINE_INVALID",
      `${label} must be a canonical UTC timestamp.`,
    );
  }
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch) || new Date(epoch).toISOString() !== value) {
    runtimeReleaseError(
      "SHARED_BETA_RUNTIME_RELEASE_TIMELINE_INVALID",
      `${label} must be a canonical UTC timestamp.`,
    );
  }
  return epoch;
}

function normalizeNow(now) {
  const current = now instanceof Date ? new Date(now.valueOf()) : new Date(now);
  if (Number.isNaN(current.valueOf())) {
    runtimeReleaseError(
      "SHARED_BETA_RUNTIME_RELEASE_CURRENT_TIME_INVALID",
      "The runtime-release provenance verification time is invalid.",
    );
  }
  return current.valueOf();
}

function decodeSignature(encodedSignature) {
  if (
    typeof encodedSignature !== "string" ||
    !/^[A-Za-z0-9_-]+$/u.test(encodedSignature)
  ) {
    runtimeReleaseError(
      "SHARED_BETA_RUNTIME_RELEASE_SIGNATURE_INVALID",
      "The Ed25519 signature encoding is invalid.",
    );
  }
  const signature = Buffer.from(encodedSignature, "base64url");
  if (
    signature.length !== 64 ||
    signature.toString("base64url") !== encodedSignature
  ) {
    runtimeReleaseError(
      "SHARED_BETA_RUNTIME_RELEASE_SIGNATURE_INVALID",
      "The signature must be one canonical 64-byte Ed25519 value.",
    );
  }
  return signature;
}

export function sharedBetaRuntimeReleasePayloadDigest(payload) {
  return createHash("sha256")
    .update(canonicalStringify(payload), "utf8")
    .digest("hex");
}

function validateRootRegistry(roots, purpose) {
  const registry = Object.create(null);
  for (const [registryKey, candidateRoot] of dataOnlyRegistryEntries(roots)) {
    const root = exactDataRecord(
      candidateRoot,
      ROOT_KEYS,
      "SHARED_BETA_RUNTIME_RELEASE_ROOT_INVALID",
      "A runtime-release authority root must be an exact data-only record.",
    );
    if (
      !KEY_ID_PATTERN.test(registryKey) ||
      root.keyId !== registryKey ||
      root.algorithm !== SHARED_BETA_RUNTIME_RELEASE_SIGNATURE_ALGORITHM ||
      root.purpose !== purpose ||
      root.profile !== SHARED_BETA_RUNTIME_RELEASE_PROFILE ||
      root.status !== "ACTIVE" ||
      typeof root.publicKeyFingerprint !== "string" ||
      !SHA_256_PATTERN.test(root.publicKeyFingerprint) ||
      typeof root.publicKeyPem !== "string" ||
      sharedBetaPublicKeyFingerprint(root.publicKeyPem) !==
        root.publicKeyFingerprint
    ) {
      runtimeReleaseError(
        "SHARED_BETA_RUNTIME_RELEASE_ROOT_INVALID",
        "A runtime-release authority root failed its exact contract.",
      );
    }

    const canonicalPem = createPublicKey(root.publicKeyPem).export({
      type: "spki",
      format: "pem",
    });
    if (canonicalPem !== root.publicKeyPem) {
      runtimeReleaseError(
        "SHARED_BETA_RUNTIME_RELEASE_ROOT_INVALID",
        "The runtime-release authority public key is not canonical.",
      );
    }

    const notBefore = canonicalIsoEpoch(
      root.notBefore,
      "Authority validity start",
    );
    const notAfter = canonicalIsoEpoch(root.notAfter, "Authority validity end");
    if (notAfter <= notBefore) {
      runtimeReleaseError(
        "SHARED_BETA_RUNTIME_RELEASE_ROOT_INVALID",
        "The runtime-release authority root timeline is invalid.",
      );
    }
    registry[registryKey] = root;
  }
  return Object.freeze(registry);
}

function selectRoot(roots, purpose, signingKeyId, nowMs) {
  const registry = validateRootRegistry(roots, purpose);
  const root = Object.hasOwn(registry, signingKeyId)
    ? registry[signingKeyId]
    : undefined;
  if (!root) {
    runtimeReleaseError(
      Object.keys(registry).length === 0
        ? "SHARED_BETA_RUNTIME_RELEASE_AUTHORITY_NOT_ENROLLED"
        : "SHARED_BETA_RUNTIME_RELEASE_AUTHORITY_KEY_NOT_TRUSTED",
      "No active pinned runtime-release authority can verify the payload.",
    );
  }
  if (
    nowMs < Date.parse(root.notBefore) ||
    nowMs >= Date.parse(root.notAfter)
  ) {
    runtimeReleaseError(
      "SHARED_BETA_RUNTIME_RELEASE_ROOT_INACTIVE",
      "The runtime-release authority is outside its validity window.",
    );
  }
  return root;
}

function validateCommonEnvelope(envelope, payloadKeys, roots, purpose, now) {
  const envelopeSnapshot = exactDataRecord(
    envelope,
    ENVELOPE_KEYS,
    "SHARED_BETA_RUNTIME_RELEASE_ENVELOPE_INVALID",
    "The runtime-release provenance envelope shape is invalid.",
  );
  const payload = exactDataRecord(
    envelopeSnapshot.payload,
    payloadKeys,
    "SHARED_BETA_RUNTIME_RELEASE_PAYLOAD_INVALID",
    "The runtime-release signed payload shape is invalid.",
  );
  const nowMs = normalizeNow(now);
  if (
    envelopeSnapshot.signatureAlgorithm !==
      SHARED_BETA_RUNTIME_RELEASE_SIGNATURE_ALGORITHM ||
    typeof envelopeSnapshot.signingKeyId !== "string" ||
    !KEY_ID_PATTERN.test(envelopeSnapshot.signingKeyId) ||
    typeof envelopeSnapshot.publicKeyFingerprint !== "string" ||
    !SHA_256_PATTERN.test(envelopeSnapshot.publicKeyFingerprint) ||
    typeof envelopeSnapshot.payloadDigest !== "string" ||
    !SHA_256_PATTERN.test(envelopeSnapshot.payloadDigest) ||
    envelopeSnapshot.signingKeyId !== payload.signingKeyId ||
    envelopeSnapshot.publicKeyFingerprint !== payload.publicKeyFingerprint ||
    sharedBetaRuntimeReleasePayloadDigest(payload) !==
      envelopeSnapshot.payloadDigest
  ) {
    runtimeReleaseError(
      "SHARED_BETA_RUNTIME_RELEASE_BINDING_INVALID",
      "The runtime-release provenance envelope binding is invalid.",
    );
  }

  const root = selectRoot(roots, purpose, envelopeSnapshot.signingKeyId, nowMs);
  if (root.publicKeyFingerprint !== envelopeSnapshot.publicKeyFingerprint) {
    runtimeReleaseError(
      "SHARED_BETA_RUNTIME_RELEASE_AUTHORITY_KEY_NOT_TRUSTED",
      "The payload key fingerprint does not match its purpose root.",
    );
  }

  const signature = decodeSignature(envelopeSnapshot.signature);
  if (
    !verifySignature(
      null,
      Buffer.from(canonicalStringify(payload), "utf8"),
      createPublicKey(root.publicKeyPem),
      signature,
    )
  ) {
    runtimeReleaseError(
      "SHARED_BETA_RUNTIME_RELEASE_SIGNATURE_INVALID",
      "The runtime-release Ed25519 signature is invalid.",
    );
  }
  return {
    envelope: envelopeSnapshot,
    nowMs,
    payload,
    root,
    signature,
  };
}

function validDigest(value) {
  return typeof value === "string" && SHA_256_PATTERN.test(value);
}

function validateBuildPayload(payload, root, nowMs) {
  const builtAt = canonicalEpochMs(payload.builtAtEpochMs, "Build time");
  const validUntil = canonicalEpochMs(
    payload.validUntilEpochMs,
    "Build validity end",
  );
  const rootNotBefore = Date.parse(root.notBefore);
  const rootNotAfter = Date.parse(root.notAfter);
  if (
    payload.schemaVersion !== 1 ||
    payload.kind !== SHARED_BETA_BUILD_PROVENANCE_KIND ||
    payload.contract !== SHARED_BETA_BUILD_PROVENANCE_CONTRACT ||
    payload.profile !== SHARED_BETA_RUNTIME_RELEASE_PROFILE ||
    payload.purpose !== SHARED_BETA_BUILD_PROVENANCE_PURPOSE ||
    typeof payload.releaseSha !== "string" ||
    !RELEASE_SHA_PATTERN.test(payload.releaseSha) ||
    ![
      payload.artifactContentDigest,
      payload.buildReferenceDigest,
      payload.migrationManifestDigest,
      payload.policyManifestDigest,
      payload.releaseManifestDigest,
    ].every(validDigest) ||
    typeof payload.schemaHead !== "string" ||
    !SCHEMA_HEAD_PATTERN.test(payload.schemaHead) ||
    payload.schemaHead.slice(0, 14) <
      SHARED_BETA_RUNTIME_RELEASE_MINIMUM_SCHEMA_TIMESTAMP ||
    !Number.isSafeInteger(payload.migrationCount) ||
    payload.migrationCount <
      SHARED_BETA_RUNTIME_RELEASE_MINIMUM_MIGRATION_COUNT ||
    typeof payload.signingKeyId !== "string" ||
    !KEY_ID_PATTERN.test(payload.signingKeyId) ||
    !validDigest(payload.publicKeyFingerprint) ||
    payload.trialPolicyVersion !== SHARED_BETA_TRIAL_POLICY_VERSION ||
    !Number.isSafeInteger(payload.trialDurationSeconds) ||
    payload.trialDurationSeconds < SHARED_BETA_TRIAL_DURATION_MIN_SECONDS ||
    payload.trialDurationSeconds > SHARED_BETA_TRIAL_DURATION_MAX_SECONDS ||
    payload.buildTime !== new Date(builtAt).toISOString() ||
    builtAt > nowMs + MAX_CLOCK_SKEW_MS ||
    builtAt < rootNotBefore ||
    builtAt >= rootNotAfter ||
    validUntil <= nowMs ||
    validUntil <= builtAt ||
    validUntil > rootNotAfter ||
    validUntil - builtAt > MAX_BUILD_LIFETIME_MS
  ) {
    runtimeReleaseError(
      "SHARED_BETA_BUILD_PROVENANCE_INVALID",
      "The signed shared-beta build provenance contract is invalid.",
    );
  }
}

function validateDeploymentPayload(payload, root, nowMs) {
  const deployedAt = canonicalEpochMs(
    payload.deployedAtEpochMs,
    "Deployment time",
  );
  const validUntil = canonicalEpochMs(
    payload.validUntilEpochMs,
    "Deployment validity end",
  );
  const rootNotBefore = Date.parse(root.notBefore);
  const rootNotAfter = Date.parse(root.notAfter);
  if (
    payload.schemaVersion !== 1 ||
    payload.kind !== SHARED_BETA_DEPLOYMENT_PROVENANCE_KIND ||
    payload.contract !== SHARED_BETA_DEPLOYMENT_PROVENANCE_CONTRACT ||
    payload.profile !== SHARED_BETA_RUNTIME_RELEASE_PROFILE ||
    payload.purpose !== SHARED_BETA_DEPLOYMENT_PROVENANCE_PURPOSE ||
    typeof payload.deploymentMarkerId !== "string" ||
    !UUID_PATTERN.test(payload.deploymentMarkerId) ||
    typeof payload.buildProvenanceId !== "string" ||
    !UUID_PATTERN.test(payload.buildProvenanceId) ||
    ![
      payload.actualContextDigest,
      payload.buildPayloadDigest,
      payload.databaseChallengeDigest,
      payload.databaseIdentityDigest,
      payload.deploymentInstanceDigest,
      payload.predecessorMarkerDigest,
      payload.publicKeyFingerprint,
    ].every(validDigest) ||
    typeof payload.environment !== "string" ||
    !ENVIRONMENT_PATTERN.test(payload.environment) ||
    !Number.isSafeInteger(payload.generation) ||
    payload.generation < 1 ||
    typeof payload.activationDatabaseRole !== "string" ||
    !SAFE_POSTGRES_IDENTIFIER_PATTERN.test(payload.activationDatabaseRole) ||
    typeof payload.coordinatorRoleName !== "string" ||
    !SAFE_POSTGRES_IDENTIFIER_PATTERN.test(payload.coordinatorRoleName) ||
    payload.activationDatabaseRole !== payload.coordinatorRoleName ||
    !Number.isSafeInteger(payload.coordinatorRoleOid) ||
    payload.coordinatorRoleOid < 1 ||
    payload.coordinatorRoleOid > MAX_POSTGRES_OID ||
    typeof payload.signingKeyId !== "string" ||
    !KEY_ID_PATTERN.test(payload.signingKeyId) ||
    deployedAt > nowMs + MAX_CLOCK_SKEW_MS ||
    deployedAt < rootNotBefore ||
    deployedAt >= rootNotAfter ||
    validUntil <= nowMs ||
    validUntil <= deployedAt ||
    validUntil > rootNotAfter ||
    validUntil - deployedAt > MAX_DEPLOYMENT_LIFETIME_MS
  ) {
    runtimeReleaseError(
      "SHARED_BETA_DEPLOYMENT_PROVENANCE_INVALID",
      "The signed shared-beta deployment provenance contract is invalid.",
    );
  }
}

function verifiedEnvelope(snapshot, signature) {
  return Object.freeze({
    payload: Object.freeze({ ...snapshot.payload }),
    payloadDigest: snapshot.envelope.payloadDigest,
    publicKeyFingerprint: snapshot.envelope.publicKeyFingerprint,
    signature: signature.toString("base64url"),
    signatureAlgorithm: snapshot.envelope.signatureAlgorithm,
    signingKeyId: snapshot.envelope.signingKeyId,
  });
}

function verifyBuildProvenanceAgainstRoots(envelope, roots, now) {
  const snapshot = validateCommonEnvelope(
    envelope,
    BUILD_PAYLOAD_KEYS,
    roots,
    SHARED_BETA_BUILD_PROVENANCE_PURPOSE,
    now,
  );
  validateBuildPayload(snapshot.payload, snapshot.root, snapshot.nowMs);
  const verified = verifiedEnvelope(snapshot, snapshot.signature);
  VERIFIED_BUILD_PROVENANCE.add(verified);
  VERIFIED_BUILD_SIGNATURES.set(verified, verified.signature);
  return verified;
}

function verifyDeploymentProvenanceAgainstRoots(envelope, roots, now) {
  const snapshot = validateCommonEnvelope(
    envelope,
    DEPLOYMENT_PAYLOAD_KEYS,
    roots,
    SHARED_BETA_DEPLOYMENT_PROVENANCE_PURPOSE,
    now,
  );
  validateDeploymentPayload(snapshot.payload, snapshot.root, snapshot.nowMs);
  const verified = verifiedEnvelope(snapshot, snapshot.signature);
  VERIFIED_DEPLOYMENT_PROVENANCE.add(verified);
  VERIFIED_DEPLOYMENT_SIGNATURES.set(verified, verified.signature);
  return verified;
}

function bindVerifiedPair(build, deployment) {
  if (
    !VERIFIED_BUILD_PROVENANCE.has(build) ||
    !VERIFIED_DEPLOYMENT_PROVENANCE.has(deployment)
  ) {
    runtimeReleaseError(
      "SHARED_BETA_RUNTIME_RELEASE_PAIR_NOT_VERIFIED",
      "The runtime-release pair requires two independently verified values.",
    );
  }
  if (
    build.signingKeyId === deployment.signingKeyId ||
    build.publicKeyFingerprint === deployment.publicKeyFingerprint
  ) {
    runtimeReleaseError(
      "SHARED_BETA_RUNTIME_RELEASE_AUTHORITY_SEPARATION_INVALID",
      "Build and deployment provenance require different key ids and keys.",
    );
  }
  if (
    deployment.payload.buildPayloadDigest !== build.payloadDigest ||
    deployment.payload.deployedAtEpochMs < build.payload.builtAtEpochMs ||
    deployment.payload.deployedAtEpochMs >= build.payload.validUntilEpochMs ||
    deployment.payload.validUntilEpochMs > build.payload.validUntilEpochMs
  ) {
    runtimeReleaseError(
      "SHARED_BETA_RUNTIME_RELEASE_PAIR_BINDING_INVALID",
      "The deployment marker does not bind the exact valid build payload.",
    );
  }
  const pair = Object.freeze({ build, deployment });
  VERIFIED_RUNTIME_RELEASE_PAIRS.add(pair);
  return pair;
}

export function verifyPinnedSharedBetaBuildProvenanceEnvelope(
  envelope,
  now = new Date(),
) {
  return verifyBuildProvenanceAgainstRoots(
    envelope,
    PINNED_SHARED_BETA_BUILD_PROVENANCE_ROOTS,
    now,
  );
}

export function verifyPinnedSharedBetaDeploymentProvenanceEnvelope(
  envelope,
  now = new Date(),
) {
  return verifyDeploymentProvenanceAgainstRoots(
    envelope,
    PINNED_SHARED_BETA_DEPLOYMENT_PROVENANCE_ROOTS,
    now,
  );
}

export function assertSyntheticSharedBetaRuntimeReleaseContext(
  context,
  expectedEnvironment = undefined,
) {
  const snapshot = exactDataRecord(
    context,
    SYNTHETIC_CONTEXT_KEYS,
    "SHARED_BETA_RUNTIME_RELEASE_SYNTHETIC_CONTEXT_DENIED",
    "Synthetic runtime-release provenance requires exact CI context.",
  );
  if (
    snapshot.explicitConfirmation !==
      SHARED_BETA_SYNTHETIC_RUNTIME_RELEASE_CONFIRMATION ||
    String(process.env.NODE_ENV ?? "").toLowerCase() === "production" ||
    snapshot.nodeEnv !== "test" ||
    typeof snapshot.hostname !== "string" ||
    snapshot.hostname !== snapshot.hostname.toLowerCase() ||
    !LOOPBACK_HOSTS.has(snapshot.hostname) ||
    typeof snapshot.databaseName !== "string" ||
    !SAFE_CI_DATABASE_PATTERN.test(snapshot.databaseName) ||
    !CI_DATABASE_PATTERN.test(snapshot.databaseName) ||
    PRODUCTION_DATABASE_PATTERN.test(snapshot.databaseName) ||
    typeof snapshot.environment !== "string" ||
    !ENVIRONMENT_PATTERN.test(snapshot.environment) ||
    PRODUCTION_ENVIRONMENTS.has(snapshot.environment) ||
    (expectedEnvironment !== undefined &&
      snapshot.environment !== expectedEnvironment)
  ) {
    runtimeReleaseError(
      "SHARED_BETA_RUNTIME_RELEASE_SYNTHETIC_CONTEXT_DENIED",
      "Synthetic runtime-release provenance is loopback CI only.",
    );
  }
  return true;
}

export function verifySyntheticSharedBetaBuildProvenanceEnvelope(
  envelope,
  roots,
  context,
  now = new Date(),
) {
  assertSyntheticSharedBetaRuntimeReleaseContext(context);
  return verifyBuildProvenanceAgainstRoots(envelope, roots, now);
}

export function verifySyntheticSharedBetaDeploymentProvenanceEnvelope(
  envelope,
  roots,
  context,
  now = new Date(),
) {
  assertSyntheticSharedBetaRuntimeReleaseContext(context);
  const verified = verifyDeploymentProvenanceAgainstRoots(envelope, roots, now);
  assertSyntheticSharedBetaRuntimeReleaseContext(
    context,
    verified.payload.environment,
  );
  return verified;
}

export function verifyPinnedSharedBetaRuntimeReleaseProvenancePair(
  buildEnvelope,
  deploymentEnvelope,
  now = new Date(),
) {
  const build = verifyPinnedSharedBetaBuildProvenanceEnvelope(
    buildEnvelope,
    now,
  );
  const deployment = verifyPinnedSharedBetaDeploymentProvenanceEnvelope(
    deploymentEnvelope,
    now,
  );
  return bindVerifiedPair(build, deployment);
}

export function verifySyntheticSharedBetaRuntimeReleaseProvenancePair(
  buildEnvelope,
  deploymentEnvelope,
  buildRoots,
  deploymentRoots,
  context,
  now = new Date(),
) {
  assertSyntheticSharedBetaRuntimeReleaseContext(context);
  const build = verifyBuildProvenanceAgainstRoots(
    buildEnvelope,
    buildRoots,
    now,
  );
  const deployment = verifyDeploymentProvenanceAgainstRoots(
    deploymentEnvelope,
    deploymentRoots,
    now,
  );
  assertSyntheticSharedBetaRuntimeReleaseContext(
    context,
    deployment.payload.environment,
  );
  return bindVerifiedPair(build, deployment);
}

export function sharedBetaBuildProvenancePersistArguments(
  verified,
  buildProvenanceId,
) {
  const signature = VERIFIED_BUILD_SIGNATURES.get(verified);
  if (
    !VERIFIED_BUILD_PROVENANCE.has(verified) ||
    typeof signature !== "string"
  ) {
    runtimeReleaseError(
      "SHARED_BETA_BUILD_PROVENANCE_NOT_VERIFIED",
      "Only branded verified build provenance may be persisted.",
    );
  }
  if (!UUID_PATTERN.test(String(buildProvenanceId ?? ""))) {
    runtimeReleaseError(
      "SHARED_BETA_BUILD_PROVENANCE_PERSIST_ARGUMENTS_INVALID",
      "The build provenance identifier is invalid.",
    );
  }
  const payload = verified.payload;
  return Object.freeze({
    candidateArtifactContentDigest: payload.artifactContentDigest,
    candidateBuildProvenanceId: buildProvenanceId,
    candidateBuildReferenceDigest: payload.buildReferenceDigest,
    candidateBuildTime: payload.buildTime,
    candidateBuiltAt: new Date(payload.builtAtEpochMs),
    candidateMigrationCount: payload.migrationCount,
    candidateMigrationManifestDigest: payload.migrationManifestDigest,
    candidatePayload: payload,
    candidatePayloadDigest: verified.payloadDigest,
    candidatePolicyManifestDigest: payload.policyManifestDigest,
    candidatePublicKeyFingerprint: verified.publicKeyFingerprint,
    candidateReleaseManifestDigest: payload.releaseManifestDigest,
    candidateReleaseSha: payload.releaseSha,
    candidateSchemaHead: payload.schemaHead,
    candidateSignatureAlgorithm: verified.signatureAlgorithm,
    candidateSignatureBase64url: signature,
    candidateSigningKeyId: verified.signingKeyId,
    candidateTrialDurationSeconds: payload.trialDurationSeconds,
    candidateTrialPolicyVersion: payload.trialPolicyVersion,
    candidateValidUntil: new Date(payload.validUntilEpochMs),
  });
}

export function sharedBetaDeploymentProvenancePersistArguments(verifiedPair) {
  if (!VERIFIED_RUNTIME_RELEASE_PAIRS.has(verifiedPair)) {
    runtimeReleaseError(
      "SHARED_BETA_DEPLOYMENT_PROVENANCE_PAIR_NOT_VERIFIED",
      "Only a branded verified runtime-release pair may be persisted.",
    );
  }
  const { build, deployment } = verifiedPair;
  const signature = VERIFIED_DEPLOYMENT_SIGNATURES.get(deployment);
  if (
    !VERIFIED_BUILD_PROVENANCE.has(build) ||
    !VERIFIED_DEPLOYMENT_PROVENANCE.has(deployment) ||
    typeof signature !== "string" ||
    deployment.payload.buildPayloadDigest !== build.payloadDigest
  ) {
    runtimeReleaseError(
      "SHARED_BETA_DEPLOYMENT_PROVENANCE_PAIR_NOT_VERIFIED",
      "The branded runtime-release pair is invalid.",
    );
  }
  const payload = deployment.payload;
  return Object.freeze({
    candidateActivationDatabaseRole: payload.activationDatabaseRole,
    candidateActualContextDigest: payload.actualContextDigest,
    candidateBuildPayloadDigest: payload.buildPayloadDigest,
    candidateBuildProvenanceId: payload.buildProvenanceId,
    candidateCoordinatorRoleName: payload.coordinatorRoleName,
    candidateCoordinatorRoleOid: payload.coordinatorRoleOid,
    candidateDatabaseChallengeDigest: payload.databaseChallengeDigest,
    candidateDatabaseIdentityDigest: payload.databaseIdentityDigest,
    candidateDeployedAt: new Date(payload.deployedAtEpochMs),
    candidateDeploymentInstanceDigest: payload.deploymentInstanceDigest,
    candidateDeploymentMarkerId: payload.deploymentMarkerId,
    candidateEnvironment: payload.environment,
    candidateGeneration: payload.generation,
    candidatePayload: payload,
    candidatePayloadDigest: deployment.payloadDigest,
    candidatePredecessorMarkerDigest: payload.predecessorMarkerDigest,
    candidatePublicKeyFingerprint: deployment.publicKeyFingerprint,
    candidateSignatureAlgorithm: deployment.signatureAlgorithm,
    candidateSignatureBase64url: signature,
    candidateSigningKeyId: deployment.signingKeyId,
    candidateValidUntil: new Date(payload.validUntilEpochMs),
  });
}

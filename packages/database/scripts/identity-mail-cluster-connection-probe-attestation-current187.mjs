import {
  createHash,
  createPublicKey,
  verify as verifySignature,
} from "node:crypto";
import { types as utilTypes } from "node:util";

import {
  CURRENT187_ADMISSION_CONTRACT,
  CURRENT187_ADMISSION_SCHEMA_VERSION,
  Current187AdmissionContractError,
  current187AdmissionCanonicalJson,
  current187AdmissionDataOnlyEntries,
  current187AdmissionDeepFreeze,
  current187AdmissionExactDataRecord,
  current187AdmissionFail,
  current187AdmissionValidDigest,
  current187AdmissionValidKeyId,
} from "./identity-mail-cluster-application-admission-current187-contract.mjs";
import { CURRENT187_NETWORK_RUNTIME_SERVICE_PURPOSES } from "./identity-mail-cluster-network-runtime-attestation-current187.mjs";

export { Current187AdmissionContractError };

export const CURRENT187_CONNECTION_PROBE_SLICE =
  "CURRENT187_J5_SIGNED_CONNECTION_PROBE_MATRIX";
export const CURRENT187_CONNECTION_PROBE_PURPOSE =
  "CURRENT187_NETWORK_CONNECTION_PROBE_ATTESTATION_V1";
export const CURRENT187_CONNECTION_PROBE_PROFILE =
  "CURRENT187_INDEPENDENT_SIGNED_CONNECTION_PROBE_MATRIX_DENY_ONLY_V1";
export const CURRENT187_CONNECTION_PROBE_TRUST_DOMAIN =
  "LEETPLUS_CURRENT187_INDEPENDENT_CONNECTION_PROBE_AUTHORITY_V1";
export const CURRENT187_CONNECTION_PROBE_KIND =
  "CURRENT187_SIGNED_CONNECTION_PROBE_MATRIX";
export const CURRENT187_CONNECTION_PROBE_RECEIPT_KIND =
  "CURRENT187_SIGNED_CONNECTION_PROBE_MATRIX_VERIFICATION_RECEIPT";
export const CURRENT187_CONNECTION_PROBE_STATUS =
  "SIGNED_CONNECTION_PROBE_MATRIX_MATCHED_DENY_ONLY";
export const CURRENT187_CONNECTION_PROBE_SIGNATURE_ALGORITHM = "Ed25519";
export const CURRENT187_CONNECTION_PROBE_SYNTHETIC_CONFIRMATION =
  "verify-current187-connection-probe-matrix-loopback-ci-deny-only";
export const CURRENT187_CONNECTION_PROBE_MAX_LIFETIME_MS = 5 * 60 * 1_000;
export const CURRENT187_CONNECTION_PROBE_MAX_CLOCK_SKEW_MS = 30 * 1_000;

export const CURRENT187_CONNECTION_NEGATIVE_SCENARIOS = Object.freeze([
  "WRONG_ROLE",
  "WRONG_DATABASE",
  "PLAINTEXT_TRANSPORT",
  "WRONG_CA",
  "WRONG_HOSTNAME",
  "STALE_HBA_RELOAD",
  "WRONG_POOL_MODE",
  "POOLER_USER_COLLAPSE",
]);

export const CURRENT187_CONNECTION_NEGATIVE_OUTCOME_BY_SCENARIO =
  current187AdmissionDeepFreeze({
    PLAINTEXT_TRANSPORT: "TLS_REQUIRED_REJECTED",
    POOLER_USER_COLLAPSE: "SERVICE_IDENTITY_COLLAPSE_REJECTED",
    STALE_HBA_RELOAD: "STALE_CONTROL_PLANE_REJECTED",
    WRONG_CA: "CA_VERIFICATION_REJECTED",
    WRONG_DATABASE: "DATABASE_ACCESS_REJECTED",
    WRONG_HOSTNAME: "HOSTNAME_VERIFICATION_REJECTED",
    WRONG_POOL_MODE: "POOL_MODE_POLICY_REJECTED",
    WRONG_ROLE: "AUTHENTICATION_REJECTED",
  });

export const PINNED_CURRENT187_CONNECTION_PROBE_PRODUCTION_ROOTS =
  current187AdmissionDeepFreeze({});

const EXPECTED_ENDPOINT_CLASS_BY_PURPOSE = Object.freeze({
  APPLICATION: "POOLER",
  COORDINATOR: "DIRECT_DATABASE",
  MIGRATION: "DIRECT_DATABASE",
  WORKER: "DIRECT_DATABASE",
});
const EXPECTED_POOL_MODE_BY_PURPOSE = Object.freeze({
  APPLICATION: "TRANSACTION",
  COORDINATOR: "SESSION",
  MIGRATION: "SESSION",
  WORKER: "SESSION",
});
const SAFE_HBA_AUTH_METHODS = new Set(["cert", "scram-sha-256"]);
const RELEASE_SHA_PATTERN = /^[a-f0-9]{40}$/u;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const CI_DATABASE_PATTERN = /_(?:ci|test)$/u;
const SAFE_DATABASE_PATTERN = /^[a-z][a-z0-9_]{0,62}$/u;
const MAX_ROOTS = 8;

const PAYLOAD_KEYS = Object.freeze([
  "clusterIdentityDigest",
  "contract",
  "databaseUniverseDigest",
  "environment",
  "hbaControlReceiptDigest",
  "hostControlChallengeDigest",
  "issuedAt",
  "kind",
  "nonce",
  "operationId",
  "pgbouncerControlReceiptDigest",
  "probeRunnerArtifactDigest",
  "probeTranscriptDigest",
  "profile",
  "publicKeyFingerprint",
  "purpose",
  "releaseSha",
  "schemaVersion",
  "services",
  "signingKeyId",
  "slice",
  "trustDomain",
  "validUntil",
]);
const SERVICE_KEYS = Object.freeze([
  "allowedOperationsDigest",
  "applicationNameDigest",
  "backendIdentityDigest",
  "endpointClass",
  "endpointTlsPeerReceiptDigest",
  "hbaAuthMethod",
  "hbaRuleDigest",
  "negativeProbes",
  "poolerMappingDigest",
  "poolMode",
  "positiveOutcome",
  "positiveProbeDigest",
  "postgresSessionReceiptDigest",
  "purpose",
  "secretReferenceDigest",
  "tlsMode",
]);
const NEGATIVE_PROBE_KEYS = Object.freeze([
  "evidenceDigest",
  "observedOutcome",
  "scenario",
]);
const ROOT_KEYS = Object.freeze([
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
]);
const ENVELOPE_KEYS = Object.freeze([
  "payload",
  "payloadDigest",
  "publicKeyFingerprint",
  "signature",
  "signatureAlgorithm",
  "signingKeyId",
]);
const SYNTHETIC_CONTEXT_KEYS = Object.freeze([
  "databaseName",
  "endpointHost",
  "environment",
  "explicitConfirmation",
  "nodeEnv",
]);

const PAYLOAD_DIGEST_DOMAIN = "LEETPLUS_CURRENT187_CONNECTION_PROBE_PAYLOAD_V1";
const SERVICE_DIGEST_DOMAIN = "LEETPLUS_CURRENT187_CONNECTION_PROBE_SERVICE_V1";
const MATRIX_DIGEST_DOMAIN = "LEETPLUS_CURRENT187_CONNECTION_PROBE_MATRIX_V1";
const ENVELOPE_DIGEST_DOMAIN =
  "LEETPLUS_CURRENT187_CONNECTION_PROBE_ENVELOPE_V1";
const RECEIPT_DIGEST_DOMAIN = "LEETPLUS_CURRENT187_CONNECTION_PROBE_RECEIPT_V1";

const VERIFIED_CURRENT187_CONNECTION_PROBE_RECEIPTS = new WeakSet();

function fail(reasonCode, message) {
  current187AdmissionFail(reasonCode, message);
}

function digest(domain, value) {
  return createHash("sha256")
    .update(`${domain}\n`, "utf8")
    .update(current187AdmissionCanonicalJson(value), "utf8")
    .digest("hex");
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

function exactDenseArray(value, expectedLength, reasonCode, message) {
  if (!Array.isArray(value) || utilTypes.isProxy(value)) {
    fail(reasonCode, message);
  }
  let descriptors;
  try {
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    fail(reasonCode, message);
  }
  const wanted = [
    ...Array.from({ length: expectedLength }, (_, index) => String(index)),
    "length",
  ].sort();
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.some((key) => typeof key !== "string") ||
    keys.sort().some((key, index) => key !== wanted[index]) ||
    keys.length !== wanted.length ||
    descriptors.length?.value !== expectedLength ||
    Array.from(
      { length: expectedLength },
      (_, index) => descriptors[String(index)],
    ).some(
      (descriptor) =>
        !descriptor ||
        !Object.hasOwn(descriptor, "value") ||
        descriptor.enumerable !== true,
    )
  ) {
    fail(reasonCode, message);
  }
  return Object.freeze(
    Array.from(
      { length: expectedLength },
      (_, index) => descriptors[String(index)].value,
    ),
  );
}

function requireDigests(value, keys, reasonCode) {
  if (!keys.every((key) => current187AdmissionValidDigest(value[key]))) {
    fail(
      reasonCode,
      "Every connection-probe evidence binding must be a non-zero SHA-256 digest.",
    );
  }
}

function normalizeNegativeProbes(value) {
  return exactDenseArray(
    value,
    CURRENT187_CONNECTION_NEGATIVE_SCENARIOS.length,
    "CURRENT187_CONNECTION_PROBE_NEGATIVE_MATRIX_INVALID",
    "Every service requires the exact ordered negative-probe matrix.",
  ).map((candidate, index) => {
    const row = current187AdmissionExactDataRecord(
      candidate,
      NEGATIVE_PROBE_KEYS,
      "CURRENT187_CONNECTION_PROBE_NEGATIVE_MATRIX_INVALID",
      "A negative connection probe must be exact and data-only.",
    );
    const scenario = CURRENT187_CONNECTION_NEGATIVE_SCENARIOS[index];
    if (
      row.scenario !== scenario ||
      row.observedOutcome !==
        CURRENT187_CONNECTION_NEGATIVE_OUTCOME_BY_SCENARIO[scenario] ||
      !current187AdmissionValidDigest(row.evidenceDigest)
    ) {
      fail(
        "CURRENT187_CONNECTION_PROBE_NEGATIVE_MATRIX_INVALID",
        "A negative connection probe did not prove its exact denied outcome.",
      );
    }
    return Object.freeze({ ...row });
  });
}

function normalizeService(value, expectedPurpose) {
  const reasonCode = "CURRENT187_CONNECTION_PROBE_SERVICE_INVALID";
  const service = current187AdmissionExactDataRecord(
    value,
    SERVICE_KEYS,
    reasonCode,
    "A service connection probe must be exact and data-only.",
  );
  requireDigests(
    service,
    [
      "allowedOperationsDigest",
      "applicationNameDigest",
      "backendIdentityDigest",
      "endpointTlsPeerReceiptDigest",
      "hbaRuleDigest",
      "poolerMappingDigest",
      "positiveProbeDigest",
      "postgresSessionReceiptDigest",
      "secretReferenceDigest",
    ],
    reasonCode,
  );
  if (
    service.purpose !== expectedPurpose ||
    service.endpointClass !==
      EXPECTED_ENDPOINT_CLASS_BY_PURPOSE[expectedPurpose] ||
    service.poolMode !== EXPECTED_POOL_MODE_BY_PURPOSE[expectedPurpose] ||
    service.positiveOutcome !== "ALLOWED" ||
    service.tlsMode !== "VERIFY_FULL" ||
    !SAFE_HBA_AUTH_METHODS.has(service.hbaAuthMethod)
  ) {
    fail(
      reasonCode,
      "Service purpose, positive outcome, endpoint, TLS, HBA, or pool mode is unsafe.",
    );
  }
  return current187AdmissionDeepFreeze({
    ...service,
    negativeProbes: normalizeNegativeProbes(service.negativeProbes),
  });
}

function normalizePayload(value, expectedEnvironment) {
  const payload = current187AdmissionExactDataRecord(
    value,
    PAYLOAD_KEYS,
    "CURRENT187_CONNECTION_PROBE_PAYLOAD_INVALID",
    "The signed connection-probe payload must be exact and data-only.",
  );
  requireDigests(
    payload,
    [
      "clusterIdentityDigest",
      "databaseUniverseDigest",
      "hbaControlReceiptDigest",
      "hostControlChallengeDigest",
      "nonce",
      "pgbouncerControlReceiptDigest",
      "probeRunnerArtifactDigest",
      "probeTranscriptDigest",
      "publicKeyFingerprint",
    ],
    "CURRENT187_CONNECTION_PROBE_PAYLOAD_INVALID",
  );
  if (
    payload.contract !== CURRENT187_ADMISSION_CONTRACT ||
    payload.schemaVersion !== CURRENT187_ADMISSION_SCHEMA_VERSION ||
    payload.slice !== CURRENT187_CONNECTION_PROBE_SLICE ||
    payload.purpose !== CURRENT187_CONNECTION_PROBE_PURPOSE ||
    payload.profile !== CURRENT187_CONNECTION_PROBE_PROFILE ||
    payload.trustDomain !== CURRENT187_CONNECTION_PROBE_TRUST_DOMAIN ||
    payload.kind !== CURRENT187_CONNECTION_PROBE_KIND ||
    payload.environment !== expectedEnvironment ||
    typeof payload.releaseSha !== "string" ||
    !RELEASE_SHA_PATTERN.test(payload.releaseSha) ||
    typeof payload.operationId !== "string" ||
    !UUID_PATTERN.test(payload.operationId) ||
    !current187AdmissionValidKeyId(payload.signingKeyId)
  ) {
    fail(
      "CURRENT187_CONNECTION_PROBE_PAYLOAD_INVALID",
      "The connection-probe identity or release binding is invalid.",
    );
  }
  const services = exactDenseArray(
    payload.services,
    CURRENT187_NETWORK_RUNTIME_SERVICE_PURPOSES.length,
    "CURRENT187_CONNECTION_PROBE_SERVICES_INVALID",
    "The signed connection-probe payload requires four ordered service probes.",
  ).map((service, index) =>
    normalizeService(
      service,
      CURRENT187_NETWORK_RUNTIME_SERVICE_PURPOSES[index],
    ),
  );
  for (const key of [
    "applicationNameDigest",
    "backendIdentityDigest",
    "poolerMappingDigest",
    "positiveProbeDigest",
    "secretReferenceDigest",
  ]) {
    if (
      new Set(services.map((service) => service[key])).size !== services.length
    ) {
      fail(
        "CURRENT187_CONNECTION_PROBE_SERVICE_COLLAPSE",
        "Every service purpose must retain a distinct runtime identity mapping.",
      );
    }
  }
  const negativeEvidenceDigests = services.flatMap((service) =>
    service.negativeProbes.map((probe) => probe.evidenceDigest),
  );
  if (
    new Set(negativeEvidenceDigests).size !== negativeEvidenceDigests.length
  ) {
    fail(
      "CURRENT187_CONNECTION_PROBE_EVIDENCE_REUSE",
      "Every negative service-path probe must have distinct evidence.",
    );
  }
  return current187AdmissionDeepFreeze({ ...payload, services });
}

export function current187ConnectionProbePayloadDigest(payload) {
  if (arguments.length !== 1) {
    fail(
      "CURRENT187_CONNECTION_PROBE_ARGUMENTS_INVALID",
      "Connection-probe payload digest accepts exactly one payload.",
    );
  }
  const discriminator = Object.freeze(
    Object.fromEntries(
      current187AdmissionDataOnlyEntries(
        payload,
        "CURRENT187_CONNECTION_PROBE_PAYLOAD_INVALID",
        "The connection-probe payload must be data-only.",
      ),
    ),
  );
  const environment = discriminator.environment;
  if (environment !== "ci" && environment !== "production") {
    fail(
      "CURRENT187_CONNECTION_PROBE_PAYLOAD_INVALID",
      "The connection-probe environment is invalid.",
    );
  }
  return digest(PAYLOAD_DIGEST_DOMAIN, normalizePayload(payload, environment));
}

export function current187ConnectionProbeEnvelopeDigest(envelopeValue) {
  if (arguments.length !== 1) {
    fail(
      "CURRENT187_CONNECTION_PROBE_ARGUMENTS_INVALID",
      "Connection-probe envelope digest accepts exactly one envelope.",
    );
  }
  const envelope = current187AdmissionExactDataRecord(
    envelopeValue,
    ENVELOPE_KEYS,
    "CURRENT187_CONNECTION_PROBE_ENVELOPE_INVALID",
    "The connection-probe envelope must be exact and data-only.",
  );
  return digest(ENVELOPE_DIGEST_DOMAIN, {
    payloadDigest: envelope.payloadDigest,
    publicKeyFingerprint: envelope.publicKeyFingerprint,
    signature: envelope.signature,
    signatureAlgorithm: envelope.signatureAlgorithm,
    signingKeyId: envelope.signingKeyId,
  });
}

export function current187ConnectionProbePublicKeyFingerprint(publicKeyPem) {
  if (arguments.length !== 1 || typeof publicKeyPem !== "string") {
    fail(
      "CURRENT187_CONNECTION_PROBE_ROOT_INVALID",
      "A connection-probe authority public key is invalid.",
    );
  }
  try {
    const key = createPublicKey(publicKeyPem);
    if (key.asymmetricKeyType !== "ed25519") throw new Error("wrong key type");
    return createHash("sha256")
      .update(key.export({ type: "spki", format: "der" }))
      .digest("hex");
  } catch {
    fail(
      "CURRENT187_CONNECTION_PROBE_ROOT_INVALID",
      "A connection-probe authority public key must be canonical Ed25519.",
    );
  }
}

function validateRootRegistry(value, requireRoot) {
  const entries = current187AdmissionDataOnlyEntries(
    value,
    "CURRENT187_CONNECTION_PROBE_ROOT_REGISTRY_INVALID",
    "The connection-probe root registry must be data-only.",
  );
  if (entries.length > MAX_ROOTS) {
    fail(
      "CURRENT187_CONNECTION_PROBE_ROOT_REGISTRY_INVALID",
      "The connection-probe root registry is oversized.",
    );
  }
  const result = Object.create(null);
  const fingerprints = new Set();
  for (const [registryKey, candidate] of entries) {
    const root = current187AdmissionExactDataRecord(
      candidate,
      ROOT_KEYS,
      "CURRENT187_CONNECTION_PROBE_ROOT_INVALID",
      "A connection-probe root must be exact and data-only.",
    );
    let key;
    let canonicalPem;
    try {
      key = createPublicKey(root.publicKeyPem);
      canonicalPem = key.export({ type: "spki", format: "pem" });
    } catch {
      fail(
        "CURRENT187_CONNECTION_PROBE_ROOT_INVALID",
        "A connection-probe root contains an invalid public key.",
      );
    }
    const fingerprint = current187ConnectionProbePublicKeyFingerprint(
      root.publicKeyPem,
    );
    const notBefore = canonicalIsoEpoch(
      root.notBefore,
      "CURRENT187_CONNECTION_PROBE_ROOT_INVALID",
      "Root validity start",
    );
    const notAfter = canonicalIsoEpoch(
      root.notAfter,
      "CURRENT187_CONNECTION_PROBE_ROOT_INVALID",
      "Root validity end",
    );
    if (
      !current187AdmissionValidKeyId(registryKey) ||
      root.keyId !== registryKey ||
      root.algorithm !== CURRENT187_CONNECTION_PROBE_SIGNATURE_ALGORITHM ||
      root.purpose !== CURRENT187_CONNECTION_PROBE_PURPOSE ||
      root.profile !== CURRENT187_CONNECTION_PROBE_PROFILE ||
      root.trustDomain !== CURRENT187_CONNECTION_PROBE_TRUST_DOMAIN ||
      root.status !== "ACTIVE" ||
      root.publicKeyFingerprint !== fingerprint ||
      key.asymmetricKeyType !== "ed25519" ||
      canonicalPem !== root.publicKeyPem ||
      notAfter <= notBefore ||
      fingerprints.has(fingerprint)
    ) {
      fail(
        "CURRENT187_CONNECTION_PROBE_ROOT_INVALID",
        "A connection-probe root failed its independent purpose-bound contract.",
      );
    }
    fingerprints.add(fingerprint);
    result[registryKey] = current187AdmissionDeepFreeze({ ...root });
  }
  if (requireRoot && entries.length === 0) {
    fail(
      "CURRENT187_CONNECTION_PROBE_SYNTHETIC_ROOT_MISSING",
      "Synthetic connection-probe verification requires an explicit test-only root.",
    );
  }
  return current187AdmissionDeepFreeze(result);
}

function normalizeSyntheticContext(value) {
  const context = current187AdmissionExactDataRecord(
    value,
    SYNTHETIC_CONTEXT_KEYS,
    "CURRENT187_CONNECTION_PROBE_SYNTHETIC_CONTEXT_DENIED",
    "Synthetic connection-probe verification requires an exact CI context.",
  );
  if (
    context.explicitConfirmation !==
      CURRENT187_CONNECTION_PROBE_SYNTHETIC_CONFIRMATION ||
    context.environment !== "ci" ||
    context.nodeEnv !== "test" ||
    typeof context.endpointHost !== "string" ||
    !LOOPBACK_HOSTS.has(context.endpointHost) ||
    typeof context.databaseName !== "string" ||
    !SAFE_DATABASE_PATTERN.test(context.databaseName) ||
    !CI_DATABASE_PATTERN.test(context.databaseName)
  ) {
    fail(
      "CURRENT187_CONNECTION_PROBE_SYNTHETIC_CONTEXT_DENIED",
      "Synthetic connection-probe roots are restricted to confirmed loopback CI databases.",
    );
  }
  return Object.freeze({ ...context });
}

function decodeSignature(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/u.test(value)) {
    fail(
      "CURRENT187_CONNECTION_PROBE_SIGNATURE_INVALID",
      "The connection-probe signature encoding is invalid.",
    );
  }
  const signature = Buffer.from(value, "base64url");
  if (signature.length !== 64 || signature.toString("base64url") !== value) {
    fail(
      "CURRENT187_CONNECTION_PROBE_SIGNATURE_INVALID",
      "The connection-probe signature must be canonical Ed25519.",
    );
  }
  return signature;
}

function selectRoot(registry, signingKeyId, nowMs) {
  const root = Object.hasOwn(registry, signingKeyId)
    ? registry[signingKeyId]
    : undefined;
  if (!root) {
    fail(
      Object.keys(registry).length === 0
        ? "CURRENT187_CONNECTION_PROBE_AUTHORITY_NOT_ENROLLED"
        : "CURRENT187_CONNECTION_PROBE_AUTHORITY_KEY_NOT_TRUSTED",
      "No active independent connection-probe authority can verify the envelope.",
    );
  }
  if (
    nowMs < Date.parse(root.notBefore) ||
    nowMs >= Date.parse(root.notAfter)
  ) {
    fail(
      "CURRENT187_CONNECTION_PROBE_ROOT_INACTIVE",
      "The connection-probe root is outside its validity window.",
    );
  }
  return root;
}

function verifyInternal(envelopeValue, registriesValue, now, environment) {
  const nowMs = canonicalIsoEpoch(
    now,
    "CURRENT187_CONNECTION_PROBE_CURRENT_TIME_INVALID",
    "Explicit verification time",
  );
  const envelope = current187AdmissionExactDataRecord(
    envelopeValue,
    ENVELOPE_KEYS,
    "CURRENT187_CONNECTION_PROBE_ENVELOPE_INVALID",
    "The connection-probe envelope must be exact and data-only.",
  );
  const payload = normalizePayload(envelope.payload, environment);
  const registry = validateRootRegistry(registriesValue, environment === "ci");
  const root = selectRoot(registry, envelope.signingKeyId, nowMs);
  const issuedAt = canonicalIsoEpoch(
    payload.issuedAt,
    "CURRENT187_CONNECTION_PROBE_TIMELINE_INVALID",
    "Probe issue time",
  );
  const validUntil = canonicalIsoEpoch(
    payload.validUntil,
    "CURRENT187_CONNECTION_PROBE_TIMELINE_INVALID",
    "Probe validity end",
  );
  if (
    payload.signingKeyId !== envelope.signingKeyId ||
    payload.publicKeyFingerprint !== envelope.publicKeyFingerprint ||
    root.publicKeyFingerprint !== envelope.publicKeyFingerprint ||
    envelope.signatureAlgorithm !==
      CURRENT187_CONNECTION_PROBE_SIGNATURE_ALGORITHM ||
    issuedAt < Date.parse(root.notBefore) ||
    issuedAt >= Date.parse(root.notAfter) ||
    issuedAt > nowMs + CURRENT187_CONNECTION_PROBE_MAX_CLOCK_SKEW_MS ||
    validUntil <= issuedAt ||
    validUntil <= nowMs ||
    validUntil > Date.parse(root.notAfter) ||
    validUntil - issuedAt > CURRENT187_CONNECTION_PROBE_MAX_LIFETIME_MS
  ) {
    fail(
      "CURRENT187_CONNECTION_PROBE_BINDING_INVALID",
      "The connection-probe authority or freshness binding is invalid.",
    );
  }
  const payloadDigest = digest(PAYLOAD_DIGEST_DOMAIN, payload);
  if (envelope.payloadDigest !== payloadDigest) {
    fail(
      "CURRENT187_CONNECTION_PROBE_PAYLOAD_DIGEST_MISMATCH",
      "The connection-probe payload digest does not match.",
    );
  }
  const signature = decodeSignature(envelope.signature);
  let verified = false;
  try {
    verified = verifySignature(
      null,
      Buffer.from(current187AdmissionCanonicalJson(payload), "utf8"),
      createPublicKey(root.publicKeyPem),
      signature,
    );
  } catch {
    verified = false;
  }
  if (!verified) {
    fail(
      "CURRENT187_CONNECTION_PROBE_SIGNATURE_INVALID",
      "The independent connection-probe signature is invalid.",
    );
  }
  const serviceEvidence = payload.services.map((service) => ({
    evidenceDigest: digest(SERVICE_DIGEST_DOMAIN, service),
    purpose: service.purpose,
  }));
  const connectionProbeMatrixDigest = digest(MATRIX_DIGEST_DOMAIN, {
    hbaControlReceiptDigest: payload.hbaControlReceiptDigest,
    pgbouncerControlReceiptDigest: payload.pgbouncerControlReceiptDigest,
    probeTranscriptDigest: payload.probeTranscriptDigest,
    serviceEvidence,
  });
  const envelopeDigest = current187ConnectionProbeEnvelopeDigest(envelope);
  const publicReceipt = {
    authorization: false,
    canMutate: false,
    canSend: false,
    clusterIdentityDigest: payload.clusterIdentityDigest,
    connectionProbeMatrixDigest,
    contract: CURRENT187_ADMISSION_CONTRACT,
    databaseUniverseDigest: payload.databaseUniverseDigest,
    envelopeDigest,
    environment: payload.environment,
    kind: CURRENT187_CONNECTION_PROBE_RECEIPT_KIND,
    negativeProbeMatrixPassed: true,
    payloadDigest,
    productionRootEnrolled: environment === "production",
    productionRuntimeAttested: false,
    releaseSha: payload.releaseSha,
    schemaVersion: CURRENT187_ADMISSION_SCHEMA_VERSION,
    serviceEvidence,
    sharedBetaAccess: false,
    signatureVerified: true,
    slice: CURRENT187_CONNECTION_PROBE_SLICE,
    status: CURRENT187_CONNECTION_PROBE_STATUS,
    syntheticOnly: environment === "ci",
    testAccessAuthorized: false,
  };
  const receipt = current187AdmissionDeepFreeze({
    ...publicReceipt,
    verificationReceiptDigest: digest(RECEIPT_DIGEST_DOMAIN, publicReceipt),
  });
  VERIFIED_CURRENT187_CONNECTION_PROBE_RECEIPTS.add(receipt);
  return receipt;
}

export function verifyPinnedCurrent187ConnectionProbeEnvelope(envelope, now) {
  if (arguments.length !== 2) {
    fail(
      "CURRENT187_CONNECTION_PROBE_ARGUMENTS_INVALID",
      "Pinned connection-probe verification requires envelope and explicit time.",
    );
  }
  return verifyInternal(
    envelope,
    PINNED_CURRENT187_CONNECTION_PROBE_PRODUCTION_ROOTS,
    now,
    "production",
  );
}

export function verifySyntheticCurrent187ConnectionProbeEnvelope(
  envelope,
  roots,
  context,
  now,
) {
  if (arguments.length !== 4) {
    fail(
      "CURRENT187_CONNECTION_PROBE_ARGUMENTS_INVALID",
      "Synthetic verification requires envelope, roots, context, and explicit time.",
    );
  }
  normalizeSyntheticContext(context);
  return verifyInternal(envelope, roots, now, "ci");
}

export function isVerifiedCurrent187ConnectionProbeReceipt(value) {
  return (
    arguments.length === 1 &&
    !!value &&
    typeof value === "object" &&
    VERIFIED_CURRENT187_CONNECTION_PROBE_RECEIPTS.has(value)
  );
}

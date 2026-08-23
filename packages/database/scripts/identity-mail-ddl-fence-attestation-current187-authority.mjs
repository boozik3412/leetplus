import {
  createHash,
  createPublicKey,
  verify as verifySignature,
} from "node:crypto";

import {
  CURRENT187_DDL_FENCE_ATTESTATION_ENVELOPE_KEYS,
  CURRENT187_DDL_FENCE_ATTESTATION_MAX_CLOCK_SKEW_MS,
  CURRENT187_DDL_FENCE_ATTESTATION_MAX_LIFETIME_MS,
  CURRENT187_DDL_FENCE_ATTESTATION_PROFILE,
  CURRENT187_DDL_FENCE_ATTESTATION_PURPOSE,
  CURRENT187_DDL_FENCE_ATTESTATION_ROOT_KEYS,
  CURRENT187_DDL_FENCE_ATTESTATION_SIGNATURE_ALGORITHM,
  CURRENT187_DDL_FENCE_ATTESTATION_SYNTHETIC_CONFIRMATION,
  CURRENT187_DDL_FENCE_ATTESTATION_SYNTHETIC_CONTEXT_KEYS,
  CURRENT187_DDL_FENCE_ATTESTATION_TRUST_DOMAIN,
  PINNED_CURRENT187_DDL_FENCE_PRODUCTION_ROOTS,
  current187DdlFenceAttestationBindingProjection,
  current187DdlFenceAttestationCanonicalJson,
  current187DdlFenceInventoryBindingProjection,
  normalizeCurrent187DdlFenceAttestationBinding,
  normalizeCurrent187DdlFenceAttestationPayload,
} from "./identity-mail-ddl-fence-attestation-current187-contract.mjs";
import {
  Current187AdmissionContractError,
  current187AdmissionDataOnlyEntries,
  current187AdmissionDeepFreeze,
  current187AdmissionExactDataRecord,
  current187AdmissionFail,
  current187AdmissionValidDigest,
  current187AdmissionValidKeyId,
} from "./identity-mail-cluster-application-admission-current187-contract.mjs";

export { Current187AdmissionContractError };

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const SAFE_POSTGRES_DATABASE_PATTERN = /^[a-z][a-z0-9_]{0,62}$/u;
const CI_DATABASE_PATTERN = /_(?:ci|test)$/u;
const PRODUCTION_DATABASE_PATTERN = /(?:^|_)(?:live|prod|production)(?:_|$)/u;
const SYSTEM_DATABASES = new Set(["postgres", "template0", "template1"]);
const MAX_PROCESS_LOCAL_REPLAY_ENTRIES = 1_024;
const MAX_SYNTHETIC_ROOTS = 16;
const CURRENT187_DDL_FENCE_ENVELOPE_DIGEST_DOMAIN =
  "LEETPLUS_CURRENT187_DDL_FENCE_ENVELOPE_V1";
const CURRENT187_DDL_FENCE_RECEIPT_DIGEST_DOMAIN =
  "LEETPLUS_CURRENT187_DDL_FENCE_VERIFICATION_RECEIPT_V1";

const VERIFIED_CURRENT187_DDL_FENCE_ATTESTATION_RECEIPTS = new WeakSet();

function digestCurrent187DdlFenceValue(domain, value) {
  return createHash("sha256")
    .update(`${domain}\n`, "utf8")
    .update(current187DdlFenceAttestationCanonicalJson(value), "utf8")
    .digest("hex");
}

function canonicalIsoEpoch(value, reasonCode, label) {
  if (typeof value !== "string") {
    current187AdmissionFail(reasonCode, `${label} must be a UTC timestamp.`);
  }
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch) || new Date(epoch).toISOString() !== value) {
    current187AdmissionFail(reasonCode, `${label} must be a UTC timestamp.`);
  }
  return epoch;
}

export function current187DdlFenceAttestationPayloadDigest(payloadValue) {
  if (arguments.length !== 1) {
    current187AdmissionFail(
      "CURRENT187_DDL_FENCE_ATTESTATION_ARGUMENTS_INVALID",
      "DDL-fence payload digest construction accepts exactly one payload.",
    );
  }
  const payload = normalizeCurrent187DdlFenceAttestationPayload(payloadValue);
  return createHash("sha256")
    .update(current187DdlFenceAttestationCanonicalJson(payload), "utf8")
    .digest("hex");
}

export function current187DdlFenceAttestationPublicKeyFingerprint(
  publicKeyPem,
) {
  if (arguments.length !== 1) {
    current187AdmissionFail(
      "CURRENT187_DDL_FENCE_ATTESTATION_ARGUMENTS_INVALID",
      "DDL-fence public-key fingerprint construction accepts exactly one key.",
    );
  }
  try {
    const key = createPublicKey(publicKeyPem);
    if (key.asymmetricKeyType !== "ed25519") {
      current187AdmissionFail(
        "CURRENT187_DDL_FENCE_ATTESTATION_ROOT_INVALID",
        "A CURRENT187 DDL-fence authority key must be Ed25519.",
      );
    }
    return createHash("sha256")
      .update(key.export({ type: "spki", format: "der" }))
      .digest("hex");
  } catch (error) {
    if (error instanceof Current187AdmissionContractError) {
      throw error;
    }
    current187AdmissionFail(
      "CURRENT187_DDL_FENCE_ATTESTATION_ROOT_INVALID",
      "A CURRENT187 DDL-fence authority public key is invalid.",
    );
  }
}

function validateRootRegistry(registryValue, requireRoot) {
  const normalized = Object.create(null);
  const fingerprints = new Set();
  const entries = current187AdmissionDataOnlyEntries(
    registryValue,
    "CURRENT187_DDL_FENCE_ATTESTATION_ROOT_REGISTRY_INVALID",
    "The CURRENT187 DDL-fence root registry must be data-only.",
  );
  if (entries.length > MAX_SYNTHETIC_ROOTS) {
    current187AdmissionFail(
      "CURRENT187_DDL_FENCE_ATTESTATION_ROOT_REGISTRY_INVALID",
      "The bounded CURRENT187 DDL-fence root registry is oversized.",
    );
  }
  for (const [registryKey, candidate] of entries) {
    const root = current187AdmissionExactDataRecord(
      candidate,
      CURRENT187_DDL_FENCE_ATTESTATION_ROOT_KEYS,
      "CURRENT187_DDL_FENCE_ATTESTATION_ROOT_INVALID",
      "A CURRENT187 DDL-fence authority root must be exact and data-only.",
    );
    if (typeof root.publicKeyPem !== "string") {
      current187AdmissionFail(
        "CURRENT187_DDL_FENCE_ATTESTATION_ROOT_INVALID",
        "A CURRENT187 DDL-fence authority root has no canonical public key.",
      );
    }
    let key;
    let canonicalPem;
    try {
      key = createPublicKey(root.publicKeyPem);
      canonicalPem = key.export({ type: "spki", format: "pem" });
    } catch {
      current187AdmissionFail(
        "CURRENT187_DDL_FENCE_ATTESTATION_ROOT_INVALID",
        "A CURRENT187 DDL-fence authority root contains an invalid public key.",
      );
    }
    const fingerprint = current187DdlFenceAttestationPublicKeyFingerprint(
      root.publicKeyPem,
    );
    const notBefore = canonicalIsoEpoch(
      root.notBefore,
      "CURRENT187_DDL_FENCE_ATTESTATION_ROOT_INVALID",
      "DDL-fence root validity start",
    );
    const notAfter = canonicalIsoEpoch(
      root.notAfter,
      "CURRENT187_DDL_FENCE_ATTESTATION_ROOT_INVALID",
      "DDL-fence root validity end",
    );
    if (
      !current187AdmissionValidKeyId(registryKey) ||
      root.keyId !== registryKey ||
      root.algorithm !== CURRENT187_DDL_FENCE_ATTESTATION_SIGNATURE_ALGORITHM ||
      root.purpose !== CURRENT187_DDL_FENCE_ATTESTATION_PURPOSE ||
      root.profile !== CURRENT187_DDL_FENCE_ATTESTATION_PROFILE ||
      root.trustDomain !== CURRENT187_DDL_FENCE_ATTESTATION_TRUST_DOMAIN ||
      root.status !== "ACTIVE" ||
      root.publicKeyFingerprint !== fingerprint ||
      key.asymmetricKeyType !== "ed25519" ||
      canonicalPem !== root.publicKeyPem ||
      notAfter <= notBefore ||
      fingerprints.has(fingerprint)
    ) {
      current187AdmissionFail(
        "CURRENT187_DDL_FENCE_ATTESTATION_ROOT_INVALID",
        "A CURRENT187 DDL-fence authority root failed its independent purpose-bound contract.",
      );
    }
    fingerprints.add(fingerprint);
    normalized[registryKey] = current187AdmissionDeepFreeze({ ...root });
  }
  if (requireRoot && Object.keys(normalized).length === 0) {
    current187AdmissionFail(
      "CURRENT187_DDL_FENCE_ATTESTATION_SYNTHETIC_ROOT_MISSING",
      "Synthetic DDL-fence verification requires an explicit test-only root.",
    );
  }
  return current187AdmissionDeepFreeze(normalized);
}

function normalizeSyntheticContext(contextValue) {
  const context = current187AdmissionExactDataRecord(
    contextValue,
    CURRENT187_DDL_FENCE_ATTESTATION_SYNTHETIC_CONTEXT_KEYS,
    "CURRENT187_DDL_FENCE_ATTESTATION_SYNTHETIC_CONTEXT_DENIED",
    "Synthetic DDL-fence verification requires an exact loopback CI context.",
  );
  if (
    context.explicitConfirmation !==
      CURRENT187_DDL_FENCE_ATTESTATION_SYNTHETIC_CONFIRMATION ||
    context.environment !== "ci" ||
    context.nodeEnv !== "test" ||
    process.env.NODE_ENV !== "test" ||
    typeof context.endpointHost !== "string" ||
    !LOOPBACK_HOSTS.has(context.endpointHost) ||
    typeof context.databaseName !== "string" ||
    !SAFE_POSTGRES_DATABASE_PATTERN.test(context.databaseName) ||
    !CI_DATABASE_PATTERN.test(context.databaseName) ||
    PRODUCTION_DATABASE_PATTERN.test(context.databaseName) ||
    SYSTEM_DATABASES.has(context.databaseName) ||
    !current187AdmissionValidDigest(context.applicationAuthorityFingerprint) ||
    !current187AdmissionValidDigest(context.scannerRoleBindingDigest)
  ) {
    current187AdmissionFail(
      "CURRENT187_DDL_FENCE_ATTESTATION_SYNTHETIC_CONTEXT_DENIED",
      "Synthetic DDL-fence roots are restricted to explicitly confirmed loopback test/CI databases.",
    );
  }
  return Object.freeze({ ...context });
}

function selectRoot(registry, signingKeyId, nowMs) {
  const root = Object.hasOwn(registry, signingKeyId)
    ? registry[signingKeyId]
    : undefined;
  if (!root) {
    current187AdmissionFail(
      Object.keys(registry).length === 0
        ? "CURRENT187_DDL_FENCE_ATTESTATION_AUTHORITY_NOT_ENROLLED"
        : "CURRENT187_DDL_FENCE_ATTESTATION_AUTHORITY_KEY_NOT_TRUSTED",
      "No active independent CURRENT187 DDL-fence authority can verify the envelope.",
    );
  }
  if (
    nowMs < Date.parse(root.notBefore) ||
    nowMs >= Date.parse(root.notAfter)
  ) {
    current187AdmissionFail(
      "CURRENT187_DDL_FENCE_ATTESTATION_ROOT_INACTIVE",
      "The CURRENT187 DDL-fence root is outside its validity window.",
    );
  }
  return root;
}

function decodeSignature(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/u.test(value)) {
    current187AdmissionFail(
      "CURRENT187_DDL_FENCE_ATTESTATION_SIGNATURE_INVALID",
      "The CURRENT187 DDL-fence Ed25519 signature encoding is invalid.",
    );
  }
  const signature = Buffer.from(value, "base64url");
  if (signature.length !== 64 || signature.toString("base64url") !== value) {
    current187AdmissionFail(
      "CURRENT187_DDL_FENCE_ATTESTATION_SIGNATURE_INVALID",
      "The signature must be one canonical 64-byte Ed25519 base64url value.",
    );
  }
  return signature;
}

function assertTimeline(payload, root, nowMs) {
  const issuedAt = canonicalIsoEpoch(
    payload.issuedAt,
    "CURRENT187_DDL_FENCE_ATTESTATION_TIMELINE_INVALID",
    "DDL-fence attestation issue time",
  );
  const validUntil = canonicalIsoEpoch(
    payload.validUntil,
    "CURRENT187_DDL_FENCE_ATTESTATION_TIMELINE_INVALID",
    "DDL-fence attestation validity end",
  );
  if (
    issuedAt > nowMs + CURRENT187_DDL_FENCE_ATTESTATION_MAX_CLOCK_SKEW_MS ||
    issuedAt < Date.parse(root.notBefore) ||
    issuedAt >= Date.parse(root.notAfter) ||
    validUntil <= issuedAt ||
    validUntil <= nowMs ||
    validUntil > Date.parse(root.notAfter) ||
    validUntil - issuedAt > CURRENT187_DDL_FENCE_ATTESTATION_MAX_LIFETIME_MS
  ) {
    current187AdmissionFail(
      "CURRENT187_DDL_FENCE_ATTESTATION_TIMELINE_INVALID",
      "The CURRENT187 DDL-fence envelope is stale or outside its bounded validity window.",
    );
  }
}

function normalizeNow(now) {
  return canonicalIsoEpoch(
    now,
    "CURRENT187_DDL_FENCE_ATTESTATION_CURRENT_TIME_INVALID",
    "Explicit DDL-fence verification time",
  );
}

function verifyAgainstRoots(
  envelopeValue,
  expectedValue,
  registry,
  now,
  requiredEnvironment,
) {
  const expected = normalizeCurrent187DdlFenceAttestationBinding(expectedValue);
  if (expected.environment !== requiredEnvironment) {
    current187AdmissionFail(
      "CURRENT187_DDL_FENCE_ATTESTATION_ENVIRONMENT_DENIED",
      "The DDL-fence authority environment does not match its verifier.",
    );
  }
  const envelope = current187AdmissionExactDataRecord(
    envelopeValue,
    CURRENT187_DDL_FENCE_ATTESTATION_ENVELOPE_KEYS,
    "CURRENT187_DDL_FENCE_ATTESTATION_ENVELOPE_INVALID",
    "The CURRENT187 DDL-fence envelope must be exact and data-only.",
  );
  const payload = normalizeCurrent187DdlFenceAttestationPayload(
    envelope.payload,
  );
  const nowMs = normalizeNow(now);
  if (
    payload.environment !== requiredEnvironment ||
    envelope.signatureAlgorithm !==
      CURRENT187_DDL_FENCE_ATTESTATION_SIGNATURE_ALGORITHM ||
    !current187AdmissionValidKeyId(envelope.signingKeyId) ||
    !current187AdmissionValidDigest(envelope.publicKeyFingerprint) ||
    !current187AdmissionValidDigest(envelope.payloadDigest) ||
    envelope.signingKeyId !== payload.signingKeyId ||
    envelope.publicKeyFingerprint !== payload.publicKeyFingerprint ||
    current187DdlFenceAttestationPayloadDigest(payload) !==
      envelope.payloadDigest
  ) {
    current187AdmissionFail(
      "CURRENT187_DDL_FENCE_ATTESTATION_ENVELOPE_BINDING_INVALID",
      "The CURRENT187 DDL-fence envelope binding is invalid.",
    );
  }
  const root = selectRoot(registry, envelope.signingKeyId, nowMs);
  if (
    root.publicKeyFingerprint !== envelope.publicKeyFingerprint ||
    root.publicKeyFingerprint === expected.applicationAuthorityFingerprint ||
    root.publicKeyFingerprint === expected.scannerRoleBindingDigest
  ) {
    current187AdmissionFail(
      "CURRENT187_DDL_FENCE_ATTESTATION_AUTHORITY_NOT_INDEPENDENT",
      "The DDL-fence signer is untrusted or aliases an application/scanner identity.",
    );
  }
  const signature = decodeSignature(envelope.signature);
  if (
    !verifySignature(
      null,
      Buffer.from(current187DdlFenceAttestationCanonicalJson(payload), "utf8"),
      createPublicKey(root.publicKeyPem),
      signature,
    )
  ) {
    current187AdmissionFail(
      "CURRENT187_DDL_FENCE_ATTESTATION_SIGNATURE_INVALID",
      "The CURRENT187 DDL-fence Ed25519 signature is invalid.",
    );
  }
  assertTimeline(payload, root, nowMs);
  const binding = current187DdlFenceAttestationBindingProjection(payload);
  if (
    current187DdlFenceAttestationCanonicalJson(binding) !==
    current187DdlFenceAttestationCanonicalJson(expected)
  ) {
    current187AdmissionFail(
      "CURRENT187_DDL_FENCE_ATTESTATION_EXPECTED_BINDING_MISMATCH",
      "The signed DDL-fence envelope does not match the exact acquisition binding.",
    );
  }

  const envelopeDigest = digestCurrent187DdlFenceValue(
    CURRENT187_DDL_FENCE_ENVELOPE_DIGEST_DOMAIN,
    {
      payload,
      payloadDigest: envelope.payloadDigest,
      publicKeyFingerprint: envelope.publicKeyFingerprint,
      signature: signature.toString("base64url"),
      signatureAlgorithm: envelope.signatureAlgorithm,
      signingKeyId: envelope.signingKeyId,
    },
  );
  const verifiedAt = new Date(nowMs).toISOString();
  const attestationDigest = digestCurrent187DdlFenceValue(
    CURRENT187_DDL_FENCE_RECEIPT_DIGEST_DOMAIN,
    {
      binding,
      envelopeDigest,
      payloadDigest: envelope.payloadDigest,
      verifiedAt,
    },
  );
  const receipt = current187AdmissionDeepFreeze({
    attestationDigest,
    authorization: false,
    binding,
    canApply: false,
    canMutate: false,
    canSend: false,
    ddlFenceAttestationVerified: true,
    ddlIoPerformed: false,
    envelopeDigest,
    externalDdlFenceAttested: true,
    issuedAt: payload.issuedAt,
    networkIoPerformed: false,
    payloadDigest: envelope.payloadDigest,
    persistedConsumptionVerified: false,
    processLocalReplayProtected: true,
    productionRootEnrolled: false,
    publicKeyFingerprint: envelope.publicKeyFingerprint,
    sharedBetaAccess: false,
    signingKeyId: envelope.signingKeyId,
    sourceIoPerformed: false,
    syntheticVerification: requiredEnvironment === "ci",
    testAccessAuthorized: false,
    validUntil: payload.validUntil,
    verifiedAt,
  });
  VERIFIED_CURRENT187_DDL_FENCE_ATTESTATION_RECEIPTS.add(receipt);
  return receipt;
}

export function createSyntheticCurrent187DdlFenceAttestationVerifier(
  syntheticRootRegistry,
  syntheticContextValue,
) {
  if (arguments.length !== 2) {
    current187AdmissionFail(
      "CURRENT187_DDL_FENCE_ATTESTATION_ARGUMENTS_INVALID",
      "Synthetic DDL-fence verifier construction requires roots and exact loopback context.",
    );
  }
  const context = normalizeSyntheticContext(syntheticContextValue);
  const registry = validateRootRegistry(syntheticRootRegistry, true);
  for (const root of Object.values(registry)) {
    if (
      root.publicKeyFingerprint === context.applicationAuthorityFingerprint ||
      root.publicKeyFingerprint === context.scannerRoleBindingDigest
    ) {
      current187AdmissionFail(
        "CURRENT187_DDL_FENCE_ATTESTATION_AUTHORITY_NOT_INDEPENDENT",
        "The synthetic DDL-fence authority cannot alias application/scanner identity.",
      );
    }
  }
  const receiptsByEnvelope = new Map();
  const envelopeByOperation = new Map();
  const envelopeByNonce = new Map();

  function verify(envelope, expectedBinding, now) {
    if (arguments.length !== 3) {
      current187AdmissionFail(
        "CURRENT187_DDL_FENCE_ATTESTATION_ARGUMENTS_INVALID",
        "Synthetic DDL-fence verification requires envelope, exact binding, and explicit time.",
      );
    }
    normalizeSyntheticContext(context);
    const normalizedExpected =
      normalizeCurrent187DdlFenceAttestationBinding(expectedBinding);
    if (
      normalizedExpected.environment !== "ci" ||
      normalizedExpected.applicationAuthorityFingerprint !==
        context.applicationAuthorityFingerprint ||
      normalizedExpected.scannerRoleBindingDigest !==
        context.scannerRoleBindingDigest
    ) {
      current187AdmissionFail(
        "CURRENT187_DDL_FENCE_ATTESTATION_SYNTHETIC_CONTEXT_DENIED",
        "The signed DDL-fence binding is not pinned to the synthetic scanner/application context.",
      );
    }
    const candidate = verifyAgainstRoots(
      envelope,
      normalizedExpected,
      registry,
      now,
      "ci",
    );
    const priorEnvelopeForOperation = envelopeByOperation.get(
      candidate.binding.operationId,
    );
    const priorEnvelopeForNonce = envelopeByNonce.get(candidate.binding.nonce);
    if (
      (priorEnvelopeForOperation &&
        priorEnvelopeForOperation !== candidate.envelopeDigest) ||
      (priorEnvelopeForNonce &&
        priorEnvelopeForNonce !== candidate.envelopeDigest)
    ) {
      current187AdmissionFail(
        "CURRENT187_DDL_FENCE_ATTESTATION_REPLAY_CONFLICT",
        "A DDL-fence operation or nonce was reused with a different envelope.",
      );
    }
    const replay = receiptsByEnvelope.get(candidate.envelopeDigest);
    if (replay) {
      return replay;
    }
    if (receiptsByEnvelope.size >= MAX_PROCESS_LOCAL_REPLAY_ENTRIES) {
      current187AdmissionFail(
        "CURRENT187_DDL_FENCE_ATTESTATION_REPLAY_CAPACITY_EXCEEDED",
        "The bounded process-local DDL-fence replay window is full.",
      );
    }
    receiptsByEnvelope.set(candidate.envelopeDigest, candidate);
    envelopeByOperation.set(
      candidate.binding.operationId,
      candidate.envelopeDigest,
    );
    envelopeByNonce.set(candidate.binding.nonce, candidate.envelopeDigest);
    return candidate;
  }

  return Object.freeze({ verify });
}

export function verifyPinnedCurrent187DdlFenceAttestationEnvelope(
  envelope,
  expectedBinding,
) {
  if (arguments.length !== 2) {
    current187AdmissionFail(
      "CURRENT187_DDL_FENCE_ATTESTATION_ARGUMENTS_INVALID",
      "Pinned DDL-fence verification accepts only envelope and exact binding.",
    );
  }
  const registry = validateRootRegistry(
    PINNED_CURRENT187_DDL_FENCE_PRODUCTION_ROOTS,
    false,
  );
  return verifyAgainstRoots(
    envelope,
    expectedBinding,
    registry,
    new Date().toISOString(),
    "production",
  );
}

export function isVerifiedCurrent187DdlFenceAttestationReceipt(value) {
  return (
    arguments.length === 1 &&
    !!value &&
    typeof value === "object" &&
    VERIFIED_CURRENT187_DDL_FENCE_ATTESTATION_RECEIPTS.has(value)
  );
}

export function current187DdlFenceAttestationReceiptBinding(receipt) {
  if (
    arguments.length !== 1 ||
    !isVerifiedCurrent187DdlFenceAttestationReceipt(receipt)
  ) {
    current187AdmissionFail(
      "CURRENT187_DDL_FENCE_ATTESTATION_RECEIPT_UNVERIFIED",
      "Only a branded CURRENT187 DDL-fence receipt exposes a trusted binding.",
    );
  }
  return receipt.binding;
}

export function current187DdlFenceAttestationInventoryBinding(receipt) {
  if (
    arguments.length !== 1 ||
    !isVerifiedCurrent187DdlFenceAttestationReceipt(receipt)
  ) {
    current187AdmissionFail(
      "CURRENT187_DDL_FENCE_ATTESTATION_RECEIPT_UNVERIFIED",
      "Only a branded CURRENT187 DDL-fence receipt exposes an inventory binding.",
    );
  }
  return current187DdlFenceInventoryBindingProjection(receipt.binding);
}

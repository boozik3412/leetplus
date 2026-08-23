import {
  createHash,
  createPublicKey,
  verify as verifySignature,
} from "node:crypto";

import {
  CURRENT187_ADMISSION_BINDING_KEYS_BY_PURPOSE,
  CURRENT187_ADMISSION_ENVELOPE_KEYS,
  CURRENT187_ADMISSION_MAX_CLOCK_SKEW_MS,
  CURRENT187_ADMISSION_MAX_LIFETIME_MS,
  CURRENT187_ADMISSION_PURPOSES,
  CURRENT187_ADMISSION_PURPOSE_DEFINITIONS,
  CURRENT187_ADMISSION_ROOT_KEYS,
  CURRENT187_ADMISSION_SIGNATURE_ALGORITHM,
  CURRENT187_ADMISSION_SYNTHETIC_CONFIRMATION,
  CURRENT187_ADMISSION_SYNTHETIC_CONTEXT_KEYS,
  Current187AdmissionContractError,
  PINNED_CURRENT187_PRODUCTION_ROOTS_BY_PURPOSE,
  current187AdmissionBindingProjection,
  current187AdmissionCanonicalJson,
  current187AdmissionDataOnlyEntries,
  current187AdmissionDeepFreeze,
  current187AdmissionExactDataRecord,
  current187AdmissionFail,
  current187AdmissionPurposeDefinition,
  current187AdmissionValidDigest,
  current187AdmissionValidKeyId,
  normalizeCurrent187AdmissionBinding,
  normalizeCurrent187AdmissionPayload,
} from "./identity-mail-cluster-application-admission-current187-contract.mjs";

export { Current187AdmissionContractError };

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const SAFE_POSTGRES_DATABASE_PATTERN = /^[a-z][a-z0-9_]{0,62}$/u;
const CI_DATABASE_PATTERN = /_(?:ci|test)$/u;
const PRODUCTION_DATABASE_PATTERN = /(?:^|_)(?:live|prod|production)(?:_|$)/u;
const SYSTEM_DATABASES = new Set(["postgres", "template0", "template1"]);

export const CURRENT187_ADMISSION_VERIFICATION_MODE_PINNED_PRODUCTION =
  "PINNED_PRODUCTION";
export const CURRENT187_ADMISSION_VERIFICATION_MODE_SYNTHETIC_LOOPBACK_CI =
  "SYNTHETIC_LOOPBACK_CI";

const VERIFIED_CURRENT187_ADMISSION_RECEIPTS = new WeakSet();

function canonicalIsoEpoch(value, reasonCode, label) {
  if (typeof value !== "string") {
    current187AdmissionFail(
      reasonCode,
      `${label} must be a canonical UTC timestamp.`,
    );
  }
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch) || new Date(epoch).toISOString() !== value) {
    current187AdmissionFail(
      reasonCode,
      `${label} must be a canonical UTC timestamp.`,
    );
  }
  return epoch;
}

export function current187AdmissionPayloadDigest(payload) {
  if (arguments.length !== 1) {
    current187AdmissionFail(
      "CURRENT187_ADMISSION_ARGUMENTS_INVALID",
      "Payload digest construction accepts exactly one payload.",
    );
  }
  const normalized = normalizeCurrent187AdmissionPayload(payload);
  return createHash("sha256")
    .update(current187AdmissionCanonicalJson(normalized), "utf8")
    .digest("hex");
}

export function current187AdmissionPublicKeyFingerprint(publicKeyPem) {
  if (arguments.length !== 1) {
    current187AdmissionFail(
      "CURRENT187_ADMISSION_ARGUMENTS_INVALID",
      "Public-key fingerprint construction accepts exactly one key.",
    );
  }
  try {
    const key = createPublicKey(publicKeyPem);
    if (key.asymmetricKeyType !== "ed25519") {
      current187AdmissionFail(
        "CURRENT187_ADMISSION_ROOT_INVALID",
        "A CURRENT187 authority key must be Ed25519.",
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
      "CURRENT187_ADMISSION_ROOT_INVALID",
      "A CURRENT187 authority public key is invalid.",
    );
  }
}

function validateRootRegistry(registryValue, purpose, globalFingerprints) {
  const definition = current187AdmissionPurposeDefinition(purpose);
  const registry = Object.create(null);
  for (const [registryKey, candidate] of current187AdmissionDataOnlyEntries(
    registryValue,
    "CURRENT187_ADMISSION_ROOT_REGISTRY_INVALID",
    "Each CURRENT187 purpose registry must be data-only.",
  )) {
    const root = current187AdmissionExactDataRecord(
      candidate,
      CURRENT187_ADMISSION_ROOT_KEYS,
      "CURRENT187_ADMISSION_ROOT_INVALID",
      "A CURRENT187 authority root must be exact and data-only.",
    );
    if (typeof root.publicKeyPem !== "string") {
      current187AdmissionFail(
        "CURRENT187_ADMISSION_ROOT_INVALID",
        "A CURRENT187 public key must be a canonical PEM string.",
      );
    }
    let key;
    let canonicalPem;
    try {
      key = createPublicKey(root.publicKeyPem);
      canonicalPem = key.export({ type: "spki", format: "pem" });
    } catch {
      current187AdmissionFail(
        "CURRENT187_ADMISSION_ROOT_INVALID",
        "A CURRENT187 authority root contains an invalid public key.",
      );
    }
    const fingerprint = current187AdmissionPublicKeyFingerprint(
      root.publicKeyPem,
    );
    const notBefore = canonicalIsoEpoch(
      root.notBefore,
      "CURRENT187_ADMISSION_ROOT_INVALID",
      "Authority validity start",
    );
    const notAfter = canonicalIsoEpoch(
      root.notAfter,
      "CURRENT187_ADMISSION_ROOT_INVALID",
      "Authority validity end",
    );
    if (
      !current187AdmissionValidKeyId(registryKey) ||
      root.keyId !== registryKey ||
      root.algorithm !== CURRENT187_ADMISSION_SIGNATURE_ALGORITHM ||
      root.purpose !== purpose ||
      root.profile !== definition.profile ||
      root.trustDomain !== definition.trustDomain ||
      root.status !== "ACTIVE" ||
      root.publicKeyFingerprint !== fingerprint ||
      key.asymmetricKeyType !== "ed25519" ||
      canonicalPem !== root.publicKeyPem ||
      notAfter <= notBefore ||
      globalFingerprints.has(fingerprint)
    ) {
      current187AdmissionFail(
        "CURRENT187_ADMISSION_ROOT_INVALID",
        "A CURRENT187 authority root failed its purpose-bound contract.",
      );
    }
    globalFingerprints.add(fingerprint);
    registry[registryKey] = current187AdmissionDeepFreeze({ ...root });
  }
  return Object.freeze(registry);
}

function validateRootRegistries(registriesValue, requireEveryPurpose) {
  const registries = current187AdmissionExactDataRecord(
    registriesValue,
    CURRENT187_ADMISSION_PURPOSES,
    "CURRENT187_ADMISSION_ROOT_REGISTRIES_INVALID",
    "CURRENT187 root registries must contain exactly four purpose domains.",
  );
  const fingerprints = new Set();
  const normalized = Object.create(null);
  for (const purpose of CURRENT187_ADMISSION_PURPOSES) {
    normalized[purpose] = validateRootRegistry(
      registries[purpose],
      purpose,
      fingerprints,
    );
    if (
      requireEveryPurpose === true &&
      Object.keys(normalized[purpose]).length === 0
    ) {
      current187AdmissionFail(
        "CURRENT187_ADMISSION_SYNTHETIC_ROOTS_INCOMPLETE",
        "Synthetic rehearsal requires one independently keyed root in every purpose domain.",
      );
    }
  }
  return current187AdmissionDeepFreeze(normalized);
}

function selectRoot(registries, purpose, signingKeyId, nowMs) {
  const registry = registries[purpose];
  const root = Object.hasOwn(registry, signingKeyId)
    ? registry[signingKeyId]
    : undefined;
  if (!root) {
    current187AdmissionFail(
      Object.keys(registry).length === 0
        ? "CURRENT187_ADMISSION_AUTHORITY_NOT_ENROLLED"
        : "CURRENT187_ADMISSION_AUTHORITY_KEY_NOT_TRUSTED",
      "No active purpose-bound CURRENT187 authority can verify the envelope.",
    );
  }
  if (
    nowMs < Date.parse(root.notBefore) ||
    nowMs >= Date.parse(root.notAfter)
  ) {
    current187AdmissionFail(
      "CURRENT187_ADMISSION_ROOT_INACTIVE",
      "The CURRENT187 authority root is outside its validity window.",
    );
  }
  return root;
}

function decodeSignature(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/u.test(value)) {
    current187AdmissionFail(
      "CURRENT187_ADMISSION_SIGNATURE_INVALID",
      "The Ed25519 signature encoding is invalid.",
    );
  }
  const signature = Buffer.from(value, "base64url");
  if (signature.length !== 64 || signature.toString("base64url") !== value) {
    current187AdmissionFail(
      "CURRENT187_ADMISSION_SIGNATURE_INVALID",
      "The signature must be one canonical 64-byte Ed25519 base64url value.",
    );
  }
  return signature;
}

function assertTimeline(payload, root, nowMs) {
  const issuedAt = canonicalIsoEpoch(
    payload.issuedAt,
    "CURRENT187_ADMISSION_TIMELINE_INVALID",
    "Authority issue time",
  );
  const validUntil = canonicalIsoEpoch(
    payload.validUntil,
    "CURRENT187_ADMISSION_TIMELINE_INVALID",
    "Authority validity end",
  );
  const rootNotBefore = Date.parse(root.notBefore);
  const rootNotAfter = Date.parse(root.notAfter);
  if (
    issuedAt > nowMs + CURRENT187_ADMISSION_MAX_CLOCK_SKEW_MS ||
    issuedAt < rootNotBefore ||
    issuedAt >= rootNotAfter ||
    validUntil <= issuedAt ||
    validUntil <= nowMs ||
    validUntil > rootNotAfter ||
    validUntil - issuedAt > CURRENT187_ADMISSION_MAX_LIFETIME_MS
  ) {
    current187AdmissionFail(
      "CURRENT187_ADMISSION_TIMELINE_INVALID",
      "The CURRENT187 authority envelope is stale or outside its bounded window.",
    );
  }
}

function normalizeNow(now) {
  return canonicalIsoEpoch(
    now,
    "CURRENT187_ADMISSION_CURRENT_TIME_INVALID",
    "Explicit verification time",
  );
}

function assertSyntheticContext(contextValue) {
  const context = current187AdmissionExactDataRecord(
    contextValue,
    CURRENT187_ADMISSION_SYNTHETIC_CONTEXT_KEYS,
    "CURRENT187_ADMISSION_SYNTHETIC_CONTEXT_DENIED",
    "Synthetic verification requires an exact loopback test/CI context.",
  );
  if (
    context.explicitConfirmation !==
      CURRENT187_ADMISSION_SYNTHETIC_CONFIRMATION ||
    context.environment !== "ci" ||
    context.nodeEnv !== "test" ||
    process.env.NODE_ENV !== "test" ||
    typeof context.endpointHost !== "string" ||
    !LOOPBACK_HOSTS.has(context.endpointHost) ||
    typeof context.databaseName !== "string" ||
    !SAFE_POSTGRES_DATABASE_PATTERN.test(context.databaseName) ||
    !CI_DATABASE_PATTERN.test(context.databaseName) ||
    PRODUCTION_DATABASE_PATTERN.test(context.databaseName) ||
    SYSTEM_DATABASES.has(context.databaseName)
  ) {
    current187AdmissionFail(
      "CURRENT187_ADMISSION_SYNTHETIC_CONTEXT_DENIED",
      "Synthetic roots are restricted to explicitly confirmed loopback test/CI databases.",
    );
  }
  return Object.freeze({ ...context });
}

function verifyAgainstRoots(
  envelopeValue,
  purpose,
  expectedValue,
  registries,
  now,
  verificationMode,
) {
  const definition = current187AdmissionPurposeDefinition(purpose);
  void definition;
  const expected = normalizeCurrent187AdmissionBinding(
    purpose,
    expectedValue,
    "CURRENT187_ADMISSION_EXPECTED_BINDING_INVALID",
  );
  const envelope = current187AdmissionExactDataRecord(
    envelopeValue,
    CURRENT187_ADMISSION_ENVELOPE_KEYS,
    "CURRENT187_ADMISSION_ENVELOPE_INVALID",
    "The CURRENT187 authority envelope shape is invalid.",
  );
  const payload = normalizeCurrent187AdmissionPayload(envelope.payload);
  const nowMs = normalizeNow(now);
  if (
    payload.purpose !== purpose ||
    envelope.signatureAlgorithm !== CURRENT187_ADMISSION_SIGNATURE_ALGORITHM ||
    !current187AdmissionValidKeyId(envelope.signingKeyId) ||
    !current187AdmissionValidDigest(envelope.publicKeyFingerprint) ||
    !current187AdmissionValidDigest(envelope.payloadDigest) ||
    envelope.signingKeyId !== payload.signingKeyId ||
    envelope.publicKeyFingerprint !== payload.publicKeyFingerprint ||
    current187AdmissionPayloadDigest(payload) !== envelope.payloadDigest
  ) {
    current187AdmissionFail(
      "CURRENT187_ADMISSION_ENVELOPE_BINDING_INVALID",
      "The CURRENT187 authority envelope binding is invalid.",
    );
  }

  const root = selectRoot(registries, purpose, envelope.signingKeyId, nowMs);
  if (root.publicKeyFingerprint !== envelope.publicKeyFingerprint) {
    current187AdmissionFail(
      "CURRENT187_ADMISSION_AUTHORITY_KEY_NOT_TRUSTED",
      "The envelope fingerprint does not match its purpose-bound root.",
    );
  }
  const signature = decodeSignature(envelope.signature);
  if (
    !verifySignature(
      null,
      Buffer.from(current187AdmissionCanonicalJson(payload), "utf8"),
      createPublicKey(root.publicKeyPem),
      signature,
    )
  ) {
    current187AdmissionFail(
      "CURRENT187_ADMISSION_SIGNATURE_INVALID",
      "The CURRENT187 Ed25519 signature is invalid.",
    );
  }
  assertTimeline(payload, root, nowMs);
  if (
    current187AdmissionCanonicalJson(
      current187AdmissionBindingProjection(payload),
    ) !== current187AdmissionCanonicalJson(expected)
  ) {
    current187AdmissionFail(
      "CURRENT187_ADMISSION_EXPECTED_BINDING_MISMATCH",
      "The signed authority envelope does not match the expected exact binding.",
    );
  }

  const verifiedEnvelope = {
    payload: { ...payload },
    payloadDigest: envelope.payloadDigest,
    publicKeyFingerprint: envelope.publicKeyFingerprint,
    signature: signature.toString("base64url"),
    signatureAlgorithm: envelope.signatureAlgorithm,
    signingKeyId: envelope.signingKeyId,
  };
  const verified = current187AdmissionDeepFreeze({
    authorization: false,
    canMutate: false,
    canSend: false,
    envelope: verifiedEnvelope,
    persistedConsumptionVerified: false,
    productionRootEnrolled: false,
    sharedBetaAccess: false,
    testAccessAuthorized: false,
    verifiedAt: new Date(nowMs).toISOString(),
    verificationMode,
  });
  VERIFIED_CURRENT187_ADMISSION_RECEIPTS.add(verified);
  return verified;
}

export function verifyPinnedCurrent187AdmissionEnvelope(
  envelope,
  purpose,
  expectedBinding,
) {
  if (arguments.length !== 3) {
    current187AdmissionFail(
      "CURRENT187_ADMISSION_ARGUMENTS_INVALID",
      "Pinned verification accepts only envelope, purpose, and expected binding.",
    );
  }
  const registries = validateRootRegistries(
    PINNED_CURRENT187_PRODUCTION_ROOTS_BY_PURPOSE,
    false,
  );
  return verifyAgainstRoots(
    envelope,
    purpose,
    expectedBinding,
    registries,
    new Date().toISOString(),
    CURRENT187_ADMISSION_VERIFICATION_MODE_PINNED_PRODUCTION,
  );
}

export function verifySyntheticCurrent187AdmissionEnvelope(
  envelope,
  purpose,
  expectedBinding,
  syntheticRootRegistries,
  syntheticContext,
  now,
) {
  if (arguments.length !== 6) {
    current187AdmissionFail(
      "CURRENT187_ADMISSION_ARGUMENTS_INVALID",
      "Synthetic verification requires exact roots, loopback context, and explicit time.",
    );
  }
  assertSyntheticContext(syntheticContext);
  const registries = validateRootRegistries(syntheticRootRegistries, true);
  return verifyAgainstRoots(
    envelope,
    purpose,
    expectedBinding,
    registries,
    now,
    CURRENT187_ADMISSION_VERIFICATION_MODE_SYNTHETIC_LOOPBACK_CI,
  );
}

export function isVerifiedCurrent187AdmissionReceipt(value) {
  if (arguments.length !== 1) {
    return false;
  }
  return (
    !!value &&
    typeof value === "object" &&
    VERIFIED_CURRENT187_ADMISSION_RECEIPTS.has(value)
  );
}

export function current187AdmissionPurposeBindingKeys(purpose) {
  if (arguments.length !== 1) {
    current187AdmissionFail(
      "CURRENT187_ADMISSION_ARGUMENTS_INVALID",
      "Purpose binding lookup accepts exactly one purpose.",
    );
  }
  current187AdmissionPurposeDefinition(purpose);
  return CURRENT187_ADMISSION_BINDING_KEYS_BY_PURPOSE[purpose];
}

export function current187AdmissionPurposeDefinitionSnapshot(purpose) {
  if (arguments.length !== 1) {
    current187AdmissionFail(
      "CURRENT187_ADMISSION_ARGUMENTS_INVALID",
      "Purpose definition lookup accepts exactly one purpose.",
    );
  }
  const definition = current187AdmissionPurposeDefinition(purpose);
  return CURRENT187_ADMISSION_PURPOSE_DEFINITIONS[purpose] === definition
    ? definition
    : current187AdmissionFail(
        "CURRENT187_ADMISSION_PURPOSE_INVALID",
        "The purpose definition is not pinned.",
      );
}

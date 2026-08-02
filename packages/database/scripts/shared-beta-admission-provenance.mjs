import {
  createHash,
  createPublicKey,
  verify as verifySignature,
} from "node:crypto";

import { canonicalStringify } from "./staff-task-integrity-canonical-json.mjs";

export const SHARED_BETA_ADMISSION_PURPOSE =
  "SHARED_BETA_TENANT_ADMISSION";
export const SHARED_BETA_ADMISSION_PROFILE = "SHARED_BETA_ADMISSION_V1";
export const SHARED_BETA_SIGNATURE_ALGORITHM = "Ed25519";
export const RELEASE_GATE_ATTESTATION_KIND =
  "LEETPLUS_SHARED_BETA_RELEASE_GATE_ATTESTATION";
export const TENANT_ADMISSION_DECISION_KIND =
  "LEETPLUS_SHARED_BETA_TENANT_ADMISSION_DECISION";
export const RELEASE_GATE_ATTESTATION_CONTRACT =
  "RELEASE_GATE_ATTESTATION_V1";
export const TENANT_ADMISSION_DECISION_CONTRACT =
  "TENANT_ADMISSION_DECISION_V1";
export const SHARED_BETA_GATE_SET_VERSION = "SHARED_BETA_GATE_SET_V1";
export const SHARED_BETA_RELEASE_GATE_CODES = Object.freeze([
  "MODULE_POLICY_ENFORCED",
  "EMAIL_INVITE_WORKFLOW_VERIFIED",
  "POSTGRESQL_RELEASE_REHEARSAL_VERIFIED",
]);

// Deliberately empty. A production root must be enrolled by a separate,
// reviewed release; no environment variable or caller-supplied key can fill it.
export const PINNED_SHARED_BETA_ADMISSION_ROOTS = Object.freeze({});

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SHA_256_PATTERN = /^[0-9a-f]{64}$/u;
const RELEASE_SHA_PATTERN = /^[0-9a-f]{40}$/u;
const ENVIRONMENT_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/u;
const KEY_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{2,63}$/u;
const SCHEMA_HEAD_PATTERN = /^[0-9]{14}_[a-z0-9_]{1,100}$/u;
const CI_DATABASE_PATTERN = /(?:^|[_-])(?:ci|test|testing)(?:$|[_-])/iu;
const MAX_GATE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1_000;
const MAX_DECISION_LIFETIME_MS = 24 * 60 * 60 * 1_000;
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
const GATE_PAYLOAD_KEYS = Object.freeze(
  [
    "artifactDigest",
    "contractVersion",
    "environment",
    "gateCode",
    "kind",
    "migrationCount",
    "passedAtEpochMs",
    "policyManifestDigest",
    "profile",
    "provenanceKeyVersion",
    "publicKeyFingerprint",
    "purpose",
    "releaseSha",
    "schemaHead",
    "schemaVersion",
    "signingKeyId",
    "validUntilEpochMs",
  ].sort(),
);
const DECISION_PAYLOAD_KEYS = Object.freeze(
  [
    "approvalReferenceDigest",
    "approvedAtEpochMs",
    "approvedByUserId",
    "artifactDigest",
    "contractVersion",
    "databaseIdentityDigest",
    "decision",
    "decisionId",
    "environment",
    "expectedClaimRevision",
    "expectedEntitlementProfileRevision",
    "expectedExecutionRevision",
    "gateSetDigest",
    "gateSetVersion",
    "kind",
    "migrationCount",
    "policyManifestDigest",
    "profile",
    "profileDigest",
    "publicKeyFingerprint",
    "purpose",
    "releaseSha",
    "requestDigest",
    "requestId",
    "reservationSubjectId",
    "schemaHead",
    "schemaVersion",
    "shellEvidenceDigest",
    "signingKeyId",
    "tenantId",
    "validUntilEpochMs",
    "workflowLocator",
  ].sort(),
);
const VERIFIED_GATE_IMPORTS = new WeakSet();
const VERIFIED_DECISION_IMPORTS = new WeakSet();
const VERIFIED_GATE_SIGNATURES = new WeakMap();
const VERIFIED_DECISION_SIGNATURES = new WeakMap();

function provenanceError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.exitCode = 3;
  error.safeContractError = true;
  throw error;
}

function exactRecord(value, keys, code, message) {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    provenanceError(code, message);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actualKeys = Reflect.ownKeys(descriptors).sort((left, right) =>
    String(left).localeCompare(String(right)),
  );
  if (
    actualKeys.length !== keys.length ||
    actualKeys.some(
      (key, index) => typeof key !== "string" || key !== keys[index],
    ) ||
    actualKeys.some((key) => !Object.hasOwn(descriptors[key], "value"))
  ) {
    provenanceError(code, message);
  }
  const snapshot = Object.create(null);
  for (const key of keys) {
    snapshot[key] = descriptors[key].value;
  }
  return Object.freeze(snapshot);
}

function canonicalEpochMs(value, label) {
  if (
    !Number.isSafeInteger(value) ||
    value < Date.parse("2020-01-01T00:00:00.000Z") ||
    new Date(value).valueOf() !== value
  ) {
    provenanceError(
      "SHARED_BETA_PROVENANCE_TIMELINE_INVALID",
      `${label} must be a safe millisecond epoch.`,
    );
  }
  return value;
}

function normalizeNow(now) {
  const current = now instanceof Date ? new Date(now.valueOf()) : new Date(now);
  if (Number.isNaN(current.valueOf())) {
    provenanceError(
      "SHARED_BETA_PROVENANCE_CURRENT_TIME_INVALID",
      "The provenance verification time is invalid.",
    );
  }
  return current.valueOf();
}

function decodeSignature(encodedSignature) {
  const encoded = String(encodedSignature ?? "");
  if (!/^[A-Za-z0-9_-]+$/u.test(encoded)) {
    provenanceError(
      "SHARED_BETA_PROVENANCE_SIGNATURE_INVALID",
      "The Ed25519 signature encoding is invalid.",
    );
  }
  const signature = Buffer.from(encoded, "base64url");
  if (signature.length !== 64 || signature.toString("base64url") !== encoded) {
    provenanceError(
      "SHARED_BETA_PROVENANCE_SIGNATURE_INVALID",
      "The provenance signature must be one canonical 64-byte Ed25519 value.",
    );
  }
  return signature;
}

export function sharedBetaPublicKeyFingerprint(publicKey) {
  let normalized;
  try {
    normalized =
      publicKey?.type === "public" &&
      publicKey?.asymmetricKeyType === "ed25519"
        ? publicKey
        : createPublicKey(publicKey);
  } catch {
    provenanceError(
      "SHARED_BETA_AUTHORITY_ROOT_INVALID",
      "The shared-beta authority public key is invalid.",
    );
  }
  if (normalized.asymmetricKeyType !== "ed25519") {
    provenanceError(
      "SHARED_BETA_AUTHORITY_ROOT_INVALID",
      "The shared-beta authority key must be Ed25519.",
    );
  }
  return createHash("sha256")
    .update(normalized.export({ type: "spki", format: "der" }))
    .digest("hex");
}

export function sharedBetaPayloadDigest(payload) {
  return createHash("sha256")
    .update(canonicalStringify(payload), "utf8")
    .digest("hex");
}

function validateRootRegistry(roots) {
  if (!roots || Array.isArray(roots) || typeof roots !== "object") {
    provenanceError(
      "SHARED_BETA_AUTHORITY_ROOTS_INVALID",
      "The shared-beta authority root registry is invalid.",
    );
  }
  const descriptors = Object.getOwnPropertyDescriptors(roots);
  const registryKeys = Reflect.ownKeys(descriptors);
  if (
    registryKeys.some((key) => typeof key !== "string") ||
    registryKeys.some(
      (key) => !Object.hasOwn(descriptors[key], "value"),
    )
  ) {
    provenanceError(
      "SHARED_BETA_AUTHORITY_ROOTS_INVALID",
      "The shared-beta authority root registry is invalid.",
    );
  }
  const registry = Object.create(null);
  for (const registryKey of registryKeys.sort()) {
    const root = exactRecord(
      descriptors[registryKey].value,
      ROOT_KEYS,
      "SHARED_BETA_AUTHORITY_ROOT_INVALID",
      "A shared-beta authority root must be one exact data-only record.",
    );
    if (
      !KEY_ID_PATTERN.test(registryKey) ||
      root.keyId !== registryKey ||
      root.algorithm !== SHARED_BETA_SIGNATURE_ALGORITHM ||
      root.purpose !== SHARED_BETA_ADMISSION_PURPOSE ||
      root.profile !== SHARED_BETA_ADMISSION_PROFILE ||
      root.status !== "ACTIVE" ||
      !SHA_256_PATTERN.test(String(root.publicKeyFingerprint ?? "")) ||
      sharedBetaPublicKeyFingerprint(root.publicKeyPem) !==
        root.publicKeyFingerprint
    ) {
      provenanceError(
        "SHARED_BETA_AUTHORITY_ROOT_INVALID",
        "A shared-beta authority root failed its exact contract.",
      );
    }
    const canonicalPem = createPublicKey(root.publicKeyPem).export({
      type: "spki",
      format: "pem",
    });
    if (canonicalPem !== root.publicKeyPem) {
      provenanceError(
        "SHARED_BETA_AUTHORITY_ROOT_INVALID",
        "The shared-beta authority public key encoding is not canonical.",
      );
    }
    const notBefore = Date.parse(root.notBefore);
    const notAfter = Date.parse(root.notAfter);
    if (
      !Number.isFinite(notBefore) ||
      !Number.isFinite(notAfter) ||
      new Date(notBefore).toISOString() !== root.notBefore ||
      new Date(notAfter).toISOString() !== root.notAfter ||
      notAfter <= notBefore
    ) {
      provenanceError(
        "SHARED_BETA_AUTHORITY_ROOT_INVALID",
        "The shared-beta authority root timeline is invalid.",
      );
    }
    registry[registryKey] = root;
  }
  return Object.freeze(registry);
}

function selectRoot(roots, signingKeyId, nowMs) {
  const registry = validateRootRegistry(roots);
  const root = Object.hasOwn(registry, signingKeyId)
    ? registry[signingKeyId]
    : undefined;
  if (!root) {
    provenanceError(
      Object.keys(registry).length === 0
        ? "SHARED_BETA_AUTHORITY_NOT_ENROLLED"
        : "SHARED_BETA_AUTHORITY_KEY_NOT_TRUSTED",
      "No active pinned shared-beta authority root can verify this payload.",
    );
  }
  if (nowMs < Date.parse(root.notBefore) || nowMs >= Date.parse(root.notAfter)) {
    provenanceError(
      "SHARED_BETA_AUTHORITY_ROOT_INACTIVE",
      "The pinned shared-beta authority root is outside its validity window.",
    );
  }
  return root;
}

function validateCommonEnvelope(envelope, payloadKeys, roots, now) {
  const envelopeSnapshot = exactRecord(
    envelope,
    ENVELOPE_KEYS,
    "SHARED_BETA_PROVENANCE_ENVELOPE_INVALID",
    "The shared-beta provenance envelope shape is invalid.",
  );
  const payload = exactRecord(
    envelopeSnapshot.payload,
    payloadKeys,
    "SHARED_BETA_PROVENANCE_PAYLOAD_INVALID",
    "The shared-beta signed payload shape is invalid.",
  );
  const nowMs = normalizeNow(now);
  if (
    envelopeSnapshot.signatureAlgorithm !== SHARED_BETA_SIGNATURE_ALGORITHM ||
    !KEY_ID_PATTERN.test(String(envelopeSnapshot.signingKeyId ?? "")) ||
    !SHA_256_PATTERN.test(
      String(envelopeSnapshot.publicKeyFingerprint ?? ""),
    ) ||
    !SHA_256_PATTERN.test(String(envelopeSnapshot.payloadDigest ?? "")) ||
    envelopeSnapshot.signingKeyId !== payload.signingKeyId ||
    envelopeSnapshot.publicKeyFingerprint !== payload.publicKeyFingerprint ||
    sharedBetaPayloadDigest(payload) !== envelopeSnapshot.payloadDigest
  ) {
    provenanceError(
      "SHARED_BETA_PROVENANCE_BINDING_INVALID",
      "The shared-beta provenance envelope binding is invalid.",
    );
  }
  const root = selectRoot(roots, envelopeSnapshot.signingKeyId, nowMs);
  if (root.publicKeyFingerprint !== envelopeSnapshot.publicKeyFingerprint) {
    provenanceError(
      "SHARED_BETA_AUTHORITY_KEY_NOT_TRUSTED",
      "The signed payload key fingerprint does not match its pinned root.",
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
    provenanceError(
      "SHARED_BETA_PROVENANCE_SIGNATURE_INVALID",
      "The shared-beta Ed25519 signature is invalid.",
    );
  }
  return { envelope: envelopeSnapshot, payload, root, signature, nowMs };
}

function validateReleaseBinding(payload) {
  if (
    payload.schemaVersion !== 1 ||
    payload.purpose !== SHARED_BETA_ADMISSION_PURPOSE ||
    payload.profile !== SHARED_BETA_ADMISSION_PROFILE ||
    !RELEASE_SHA_PATTERN.test(String(payload.releaseSha ?? "")) ||
    !ENVIRONMENT_PATTERN.test(String(payload.environment ?? "")) ||
    !SHA_256_PATTERN.test(String(payload.artifactDigest ?? "")) ||
    !SCHEMA_HEAD_PATTERN.test(String(payload.schemaHead ?? "")) ||
    !Number.isSafeInteger(payload.migrationCount) ||
    payload.migrationCount < 172 ||
    !SHA_256_PATTERN.test(String(payload.policyManifestDigest ?? ""))
  ) {
    provenanceError(
      "SHARED_BETA_PROVENANCE_RELEASE_BINDING_INVALID",
      "The shared-beta release binding is invalid.",
    );
  }
}

function verifyReleaseGateAttestationAgainstRoots(
  envelope,
  roots,
  now = new Date(),
) {
  const {
    envelope: verifiedEnvelope,
    payload,
    root,
    signature,
    nowMs,
  } = validateCommonEnvelope(
    envelope,
    GATE_PAYLOAD_KEYS,
    roots,
    now,
  );
  validateReleaseBinding(payload);
  const passedAt = canonicalEpochMs(
    payload.passedAtEpochMs,
    "Gate pass time",
  );
  const validUntil = canonicalEpochMs(
    payload.validUntilEpochMs,
    "Gate validity end",
  );
  const rootNotBefore = Date.parse(root.notBefore);
  const rootNotAfter = Date.parse(root.notAfter);
  if (
    payload.kind !== RELEASE_GATE_ATTESTATION_KIND ||
    payload.contractVersion !== RELEASE_GATE_ATTESTATION_CONTRACT ||
    !SHARED_BETA_RELEASE_GATE_CODES.includes(payload.gateCode) ||
    !KEY_ID_PATTERN.test(String(payload.provenanceKeyVersion ?? "")) ||
    passedAt > nowMs + MAX_CLOCK_SKEW_MS ||
    passedAt < rootNotBefore ||
    passedAt >= rootNotAfter ||
    validUntil <= nowMs ||
    validUntil <= passedAt ||
    validUntil > rootNotAfter ||
    validUntil - passedAt > MAX_GATE_LIFETIME_MS
  ) {
    provenanceError(
      "SHARED_BETA_GATE_ATTESTATION_INVALID",
      "The signed release-gate attestation contract is invalid.",
    );
  }
  const signatureBase64url = signature.toString("base64url");
  const verified = Object.freeze({
    payload: Object.freeze({ ...payload }),
    payloadDigest: verifiedEnvelope.payloadDigest,
    signatureAlgorithm: verifiedEnvelope.signatureAlgorithm,
    signingKeyId: verifiedEnvelope.signingKeyId,
    publicKeyFingerprint: verifiedEnvelope.publicKeyFingerprint,
    signature: signatureBase64url,
  });
  VERIFIED_GATE_SIGNATURES.set(verified, signatureBase64url);
  VERIFIED_GATE_IMPORTS.add(verified);
  return verified;
}

function verifyTenantAdmissionDecisionAgainstRoots(
  envelope,
  roots,
  now = new Date(),
) {
  const {
    envelope: verifiedEnvelope,
    payload,
    root,
    signature,
    nowMs,
  } = validateCommonEnvelope(
    envelope,
    DECISION_PAYLOAD_KEYS,
    roots,
    now,
  );
  validateReleaseBinding(payload);
  const approvedAt = canonicalEpochMs(
    payload.approvedAtEpochMs,
    "Decision approval time",
  );
  const validUntil = canonicalEpochMs(
    payload.validUntilEpochMs,
    "Decision validity end",
  );
  const rootNotBefore = Date.parse(root.notBefore);
  const rootNotAfter = Date.parse(root.notAfter);
  if (
    payload.kind !== TENANT_ADMISSION_DECISION_KIND ||
    payload.contractVersion !== TENANT_ADMISSION_DECISION_CONTRACT ||
    payload.decision !== "GO" ||
    payload.gateSetVersion !== SHARED_BETA_GATE_SET_VERSION ||
    !UUID_PATTERN.test(String(payload.decisionId ?? "")) ||
    !UUID_PATTERN.test(String(payload.tenantId ?? "")) ||
    !UUID_PATTERN.test(String(payload.requestId ?? "")) ||
    !UUID_PATTERN.test(String(payload.workflowLocator ?? "")) ||
    !UUID_PATTERN.test(String(payload.reservationSubjectId ?? "")) ||
    !UUID_PATTERN.test(String(payload.approvedByUserId ?? "")) ||
    !Number.isSafeInteger(payload.expectedClaimRevision) ||
    payload.expectedClaimRevision < 1 ||
    !Number.isSafeInteger(payload.expectedEntitlementProfileRevision) ||
    payload.expectedEntitlementProfileRevision < 1 ||
    !Number.isSafeInteger(payload.expectedExecutionRevision) ||
    payload.expectedExecutionRevision < 0 ||
    ![
      payload.requestDigest,
      payload.shellEvidenceDigest,
      payload.databaseIdentityDigest,
      payload.profileDigest,
      payload.gateSetDigest,
      payload.approvalReferenceDigest,
    ].every((value) => SHA_256_PATTERN.test(String(value ?? ""))) ||
    approvedAt > nowMs + MAX_CLOCK_SKEW_MS ||
    approvedAt < rootNotBefore ||
    approvedAt >= rootNotAfter ||
    validUntil <= nowMs ||
    validUntil <= approvedAt ||
    validUntil > rootNotAfter ||
    validUntil - approvedAt > MAX_DECISION_LIFETIME_MS
  ) {
    provenanceError(
      "SHARED_BETA_ADMISSION_DECISION_INVALID",
      "The signed tenant admission decision contract is invalid.",
    );
  }
  const signatureBase64url = signature.toString("base64url");
  const verified = Object.freeze({
    payload: Object.freeze({ ...payload }),
    payloadDigest: verifiedEnvelope.payloadDigest,
    signatureAlgorithm: verifiedEnvelope.signatureAlgorithm,
    signingKeyId: verifiedEnvelope.signingKeyId,
    publicKeyFingerprint: verifiedEnvelope.publicKeyFingerprint,
    signature: signatureBase64url,
  });
  VERIFIED_DECISION_SIGNATURES.set(verified, signatureBase64url);
  VERIFIED_DECISION_IMPORTS.add(verified);
  return verified;
}

export function verifyPinnedReleaseGateAttestationEnvelope(
  envelope,
  now = new Date(),
) {
  return verifyReleaseGateAttestationAgainstRoots(
    envelope,
    PINNED_SHARED_BETA_ADMISSION_ROOTS,
    now,
  );
}

export function verifySyntheticReleaseGateAttestationEnvelope(
  envelope,
  roots,
  context,
  now = new Date(),
) {
  assertSyntheticLoopbackImportContext(context);
  return verifyReleaseGateAttestationAgainstRoots(envelope, roots, now);
}

export function verifyPinnedTenantAdmissionDecisionEnvelope(
  envelope,
  now = new Date(),
) {
  return verifyTenantAdmissionDecisionAgainstRoots(
    envelope,
    PINNED_SHARED_BETA_ADMISSION_ROOTS,
    now,
  );
}

export function verifySyntheticTenantAdmissionDecisionEnvelope(
  envelope,
  roots,
  context,
  now = new Date(),
) {
  assertSyntheticLoopbackImportContext(context);
  return verifyTenantAdmissionDecisionAgainstRoots(envelope, roots, now);
}

export function assertSyntheticLoopbackImportContext(context) {
  const hostname = String(context?.hostname ?? "").toLowerCase();
  const databaseName = String(context?.databaseName ?? "");
  if (
    context?.explicitConfirmation !==
      "allow-synthetic-shared-beta-admission-provenance" ||
    process.env.NODE_ENV === "production" ||
    context?.nodeEnv === "production" ||
    !new Set(["127.0.0.1", "localhost", "::1"]).has(hostname) ||
    !CI_DATABASE_PATTERN.test(databaseName)
  ) {
    provenanceError(
      "SHARED_BETA_SYNTHETIC_CONTEXT_DENIED",
      "Synthetic shared-beta provenance requires explicit loopback CI context.",
    );
  }
  return true;
}

export function gatePersistArguments(verified, attestationId) {
  const signatureBase64url = VERIFIED_GATE_SIGNATURES.get(verified);
  if (
    !VERIFIED_GATE_IMPORTS.has(verified) ||
    typeof signatureBase64url !== "string"
  ) {
    provenanceError(
      "SHARED_BETA_GATE_IMPORT_NOT_VERIFIED",
      "Only a branded shared-beta authority verified gate may be persisted.",
    );
  }
  if (!UUID_PATTERN.test(String(attestationId ?? ""))) {
    provenanceError(
      "SHARED_BETA_GATE_IMPORT_INVALID",
      "The gate attestation identifier is invalid.",
    );
  }
  const payload = verified.payload;
  return Object.freeze({
    candidateAttestationId: attestationId,
    candidateGateCode: payload.gateCode,
    candidateReleaseSha: payload.releaseSha,
    candidateEnvironment: payload.environment,
    candidateArtifactDigest: payload.artifactDigest,
    candidateSchemaHead: payload.schemaHead,
    candidateMigrationCount: payload.migrationCount,
    candidatePolicyManifestDigest: payload.policyManifestDigest,
    candidatePayload: payload,
    candidatePayloadDigest: verified.payloadDigest,
    candidateSigningKeyId: verified.signingKeyId,
    candidateProvenanceKeyVersion: payload.provenanceKeyVersion,
    candidatePublicKeyFingerprint: verified.publicKeyFingerprint,
    candidateSignatureBase64url: signatureBase64url,
    candidatePassedAt: new Date(payload.passedAtEpochMs),
    candidateValidUntil: new Date(payload.validUntilEpochMs),
  });
}

export function decisionCreateArguments(verified, gateIds) {
  const signatureBase64url = VERIFIED_DECISION_SIGNATURES.get(verified);
  if (
    !VERIFIED_DECISION_IMPORTS.has(verified) ||
    typeof signatureBase64url !== "string"
  ) {
    provenanceError(
      "SHARED_BETA_DECISION_IMPORT_NOT_VERIFIED",
      "Only a branded shared-beta authority verified decision may be persisted.",
    );
  }
  const normalizedGateIds = exactRecord(
    gateIds,
    [...SHARED_BETA_RELEASE_GATE_CODES].sort(),
    "SHARED_BETA_DECISION_GATE_IDS_INVALID",
    "The decision import requires exactly the three named gate identifiers.",
  );
  if (
    Object.values(normalizedGateIds).some(
      (value) => !UUID_PATTERN.test(String(value ?? "")),
    ) ||
    new Set(Object.values(normalizedGateIds)).size !== 3
  ) {
    provenanceError(
      "SHARED_BETA_DECISION_GATE_IDS_INVALID",
      "The decision import gate identifiers are invalid.",
    );
  }
  const payload = verified.payload;
  return Object.freeze({
    ...payload,
    candidatePayload: payload,
    candidatePayloadDigest: verified.payloadDigest,
    candidateSignatureAlgorithm: verified.signatureAlgorithm,
    candidateSignatureBase64url: signatureBase64url,
    modulePolicyAttestationId:
      normalizedGateIds.MODULE_POLICY_ENFORCED,
    emailWorkflowAttestationId:
      normalizedGateIds.EMAIL_INVITE_WORKFLOW_VERIFIED,
    postgresRehearsalAttestationId:
      normalizedGateIds.POSTGRESQL_RELEASE_REHEARSAL_VERIFIED,
  });
}

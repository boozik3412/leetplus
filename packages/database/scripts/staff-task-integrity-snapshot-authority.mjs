import { createHash, createPublicKey, verify } from "node:crypto";

import { canonicalStringify } from "./staff-task-integrity-reconciliation-plan.mjs";
import { PINNED_PRODUCTION_LIKE_AUTHORITY_ROOTS } from "./staff-task-integrity-snapshot-authority-roots.mjs";
import { STAFF_TASK_CURRENT_RELEASE_STATE } from "./staff-task-integrity-migration-state.mjs";

export const AUTHORITY_KIND = "LEETPLUS_STAFF_TASK_SNAPSHOT_AUTHORITY";
export const AUTHORITY_PURPOSE = "STAFF_TASK_INTEGRITY_RECONCILIATION";
export const AUTHORITY_CLASSIFICATION = "PRODUCTION_LIKE";
export const AUTHORITY_PROFILE = "STAFF_TASK_INTEGRITY_PRODUCTION_LIKE_V1";
export const AUTHORITY_SIGNATURE_ALGORITHM = "Ed25519";
export const AUTHORITY_ISOLATION_PROFILE = "ISOLATED_ENCRYPTED_NO_EGRESS_V1";
export const AUTHORITY_DATABASE_MARKER_PREFIX =
  "LEETPLUS_STAFF_TASK_SNAPSHOT_AUTHORITY_V2:";

const MAX_ENVELOPE_BYTES = 16 * 1024;
const MAX_LIFETIME_MS = 72 * 60 * 60 * 1_000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1_000;
const SHA_256_PATTERN = /^[0-9a-f]{64}$/u;
const RELEASE_SHA_PATTERN = /^[0-9a-f]{40}$/u;
const KEY_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{2,63}$/u;
const EXPECTED_STATES = new Set([
  "BASELINE_156",
  "EXPAND_162",
  STAFF_TASK_CURRENT_RELEASE_STATE,
]);
const ENVELOPE_KEYS = Object.freeze(
  [
    "acquiredAt",
    "approvalReferenceDigest",
    "classification",
    "creationNonce",
    "databaseIdentityDigest",
    "expectedState",
    "expiresAt",
    "isolationProfile",
    "issuedAt",
    "kind",
    "profile",
    "purpose",
    "releaseSha",
    "restoredAt",
    "schemaVersion",
    "signature",
    "signatureAlgorithm",
    "signingKeyId",
    "snapshotArtifactDigest",
  ].sort((left, right) => left.localeCompare(right)),
);
const EXPECTED_CONTRACT_KEYS = Object.freeze(
  [
    "acquiredAt",
    "approvalReference",
    "expectedState",
    "expiresAt",
    "releaseSha",
    "restoredAt",
    "snapshotArtifactDigest",
  ].sort((left, right) => left.localeCompare(right)),
);
const PINNED_VERIFIED_AUTHORITIES = new WeakMap();

function authorityError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.exitCode = 3;
  error.safeContractError = true;
  throw error;
}

function sha256(domain, value) {
  return createHash("sha256")
    .update(`${domain}\0`, "utf8")
    .update(
      typeof value === "string" ? value : canonicalStringify(value),
      "utf8",
    )
    .digest("hex");
}

function normalizeCanonicalTimestamp(value, code, label) {
  const raw = String(value ?? "");
  const parsed = new Date(raw);
  if (!raw || Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== raw) {
    authorityError(code, `${label} must be a canonical ISO-8601 timestamp.`);
  }
  return parsed;
}

function normalizeCurrentTime(now) {
  const currentTime =
    now instanceof Date ? new Date(now.valueOf()) : new Date(String(now));
  if (Number.isNaN(currentTime.valueOf())) {
    authorityError(
      "PRODUCTION_LIKE_AUTHORITY_CURRENT_TIME_INVALID",
      "The authority verification time is invalid.",
    );
  }
  return currentTime;
}

function strictEnvelopeShape(envelope) {
  if (
    !envelope ||
    Array.isArray(envelope) ||
    typeof envelope !== "object" ||
    Object.keys(envelope).length !== ENVELOPE_KEYS.length ||
    Object.keys(envelope)
      .sort((left, right) => left.localeCompare(right))
      .some((key, index) => key !== ENVELOPE_KEYS[index])
  ) {
    authorityError(
      "PRODUCTION_LIKE_AUTHORITY_MANIFEST_INVALID",
      "The authority manifest shape is invalid.",
    );
  }
}

function normalizedExpectedContract(expected) {
  if (!expected || typeof expected !== "object" || Array.isArray(expected)) {
    authorityError(
      "PRODUCTION_LIKE_AUTHORITY_BINDING_INVALID",
      "The expected authority contract is invalid.",
    );
  }
  const descriptors = Object.getOwnPropertyDescriptors(expected);
  const keys = Reflect.ownKeys(descriptors).sort((left, right) =>
    String(left).localeCompare(String(right)),
  );
  if (
    keys.length !== EXPECTED_CONTRACT_KEYS.length ||
    keys.some(
      (key, index) =>
        typeof key !== "string" || key !== EXPECTED_CONTRACT_KEYS[index],
    ) ||
    keys.some((key) => !Object.hasOwn(descriptors[key], "value"))
  ) {
    authorityError(
      "PRODUCTION_LIKE_AUTHORITY_BINDING_INVALID",
      "The expected authority contract must be one exact data-only record.",
    );
  }
  return Object.freeze(
    Object.fromEntries(keys.map((key) => [key, descriptors[key].value])),
  );
}

function strictSignature(encodedSignature) {
  const encoded = String(encodedSignature ?? "");
  if (!encoded || !/^[A-Za-z0-9_-]+$/u.test(encoded)) {
    authorityError(
      "PRODUCTION_LIKE_AUTHORITY_SIGNATURE_INVALID",
      "The authority signature encoding is invalid.",
    );
  }
  let signature;
  try {
    signature = Buffer.from(encoded, "base64url");
  } catch {
    authorityError(
      "PRODUCTION_LIKE_AUTHORITY_SIGNATURE_INVALID",
      "The authority signature could not be decoded.",
    );
  }
  if (signature.length !== 64 || signature.toString("base64url") !== encoded) {
    authorityError(
      "PRODUCTION_LIKE_AUTHORITY_SIGNATURE_INVALID",
      "The authority signature must be one canonical Ed25519 signature.",
    );
  }
  return signature;
}

function stableAuthorityEnvelope(envelope) {
  return {
    schemaVersion: envelope.schemaVersion,
    kind: envelope.kind,
    purpose: envelope.purpose,
    classification: envelope.classification,
    profile: envelope.profile,
    signatureAlgorithm: envelope.signatureAlgorithm,
    signingKeyId: envelope.signingKeyId,
    releaseSha: envelope.releaseSha,
    expectedState: envelope.expectedState,
    snapshotArtifactDigest: envelope.snapshotArtifactDigest,
    creationNonce: envelope.creationNonce,
    databaseIdentityDigest: envelope.databaseIdentityDigest,
    approvalReferenceDigest: envelope.approvalReferenceDigest,
    isolationProfile: envelope.isolationProfile,
    acquiredAt: envelope.acquiredAt,
    restoredAt: envelope.restoredAt,
    issuedAt: envelope.issuedAt,
    expiresAt: envelope.expiresAt,
  };
}

export function authoritySigningPayload(envelope) {
  strictEnvelopeShape(envelope);
  return Buffer.from(
    canonicalStringify(stableAuthorityEnvelope(envelope)),
    "utf8",
  );
}

export function encodeAuthorityEnvelope(envelope) {
  strictEnvelopeShape(envelope);
  return Buffer.from(canonicalStringify(envelope), "utf8").toString(
    "base64url",
  );
}

export function parseAuthorityEnvelope(encodedEnvelope) {
  const encoded = String(encodedEnvelope ?? "");
  if (
    !encoded ||
    !/^[A-Za-z0-9_-]+$/u.test(encoded) ||
    encoded.length > Math.ceil((MAX_ENVELOPE_BYTES * 4) / 3) + 4
  ) {
    authorityError(
      "PRODUCTION_LIKE_AUTHORITY_MANIFEST_INVALID",
      "The authority manifest encoding is invalid.",
    );
  }
  let decoded;
  let envelope;
  try {
    decoded = Buffer.from(encoded, "base64url");
    if (
      decoded.length > MAX_ENVELOPE_BYTES ||
      decoded.toString("base64url") !== encoded
    ) {
      throw new Error("Non-canonical authority encoding.");
    }
    envelope = JSON.parse(decoded.toString("utf8"));
  } catch {
    authorityError(
      "PRODUCTION_LIKE_AUTHORITY_MANIFEST_INVALID",
      "The authority manifest could not be decoded.",
    );
  }
  strictEnvelopeShape(envelope);
  if (canonicalStringify(envelope) !== decoded.toString("utf8")) {
    authorityError(
      "PRODUCTION_LIKE_AUTHORITY_MANIFEST_INVALID",
      "The authority manifest JSON is not canonical.",
    );
  }
  return envelope;
}

export function computePublicKeyFingerprint(publicKey) {
  let key;
  try {
    key = createPublicKey(publicKey);
  } catch {
    authorityError(
      "PRODUCTION_LIKE_AUTHORITY_ROOT_INVALID",
      "The pinned authority public key is invalid.",
    );
  }
  if (key.asymmetricKeyType !== "ed25519") {
    authorityError(
      "PRODUCTION_LIKE_AUTHORITY_ROOT_INVALID",
      "The pinned authority key must be Ed25519.",
    );
  }
  return createHash("sha256")
    .update(key.export({ type: "spki", format: "der" }))
    .digest("hex");
}

export function computeApprovalReferenceDigest(
  approvalReference,
  creationNonce,
) {
  const approval = String(approvalReference ?? "");
  const nonce = String(creationNonce ?? "");
  if (!approval || !SHA_256_PATTERN.test(nonce)) {
    authorityError(
      "PRODUCTION_LIKE_AUTHORITY_APPROVAL_BINDING_INVALID",
      "The authority approval binding is invalid.",
    );
  }
  return sha256("staff-task-snapshot-authority-approval-v1", {
    approvalReference: approval,
    creationNonce: nonce,
  });
}

export function computeNonceBoundDatabaseIdentityDigest(
  snapshotRow,
  creationNonce,
) {
  const currentDatabase = String(snapshotRow?.current_database ?? "");
  const systemIdentifier = String(snapshotRow?.cluster_system_identifier ?? "");
  const databaseOid = String(snapshotRow?.database_oid ?? "");
  const nonce = String(creationNonce ?? "");
  if (
    !currentDatabase ||
    !/^\d+$/u.test(systemIdentifier) ||
    !/^\d+$/u.test(databaseOid) ||
    !SHA_256_PATTERN.test(nonce)
  ) {
    authorityError(
      "PRODUCTION_LIKE_AUTHORITY_DATABASE_IDENTITY_INVALID",
      "The authority database identity binding is invalid.",
    );
  }
  return sha256("staff-task-snapshot-authority-database-v1", {
    currentDatabase,
    systemIdentifier,
    databaseOid,
    creationNonce: nonce,
  });
}

export function computeAuthorityEnvelopeDigest(envelope) {
  strictEnvelopeShape(envelope);
  return sha256(
    "staff-task-snapshot-authority-envelope-v2",
    canonicalStringify(envelope),
  );
}

export function authorityDatabaseMarker(envelopeDigest) {
  if (!SHA_256_PATTERN.test(String(envelopeDigest ?? ""))) {
    authorityError(
      "PRODUCTION_LIKE_AUTHORITY_ENVELOPE_DIGEST_INVALID",
      "The authority envelope digest is invalid.",
    );
  }
  return `${AUTHORITY_DATABASE_MARKER_PREFIX}${envelopeDigest}`;
}

function normalizeRoots(roots) {
  if (!roots || Array.isArray(roots) || typeof roots !== "object") {
    authorityError(
      "PRODUCTION_LIKE_AUTHORITY_ROOTS_INVALID",
      "The pinned authority root registry is invalid.",
    );
  }
  return roots;
}

function validateEnvelopeContract(envelope, expected) {
  const expectedApprovalDigest = computeApprovalReferenceDigest(
    expected.approvalReference,
    envelope.creationNonce,
  );
  if (
    envelope.schemaVersion !== 1 ||
    envelope.kind !== AUTHORITY_KIND ||
    envelope.purpose !== AUTHORITY_PURPOSE ||
    envelope.classification !== AUTHORITY_CLASSIFICATION ||
    envelope.profile !== AUTHORITY_PROFILE ||
    envelope.signatureAlgorithm !== AUTHORITY_SIGNATURE_ALGORITHM ||
    envelope.isolationProfile !== AUTHORITY_ISOLATION_PROFILE ||
    !KEY_ID_PATTERN.test(String(envelope.signingKeyId ?? "")) ||
    !RELEASE_SHA_PATTERN.test(String(envelope.releaseSha ?? "")) ||
    !EXPECTED_STATES.has(envelope.expectedState) ||
    !SHA_256_PATTERN.test(String(envelope.snapshotArtifactDigest ?? "")) ||
    !SHA_256_PATTERN.test(String(envelope.creationNonce ?? "")) ||
    !SHA_256_PATTERN.test(String(envelope.databaseIdentityDigest ?? "")) ||
    !SHA_256_PATTERN.test(String(envelope.approvalReferenceDigest ?? "")) ||
    envelope.releaseSha !== expected.releaseSha ||
    envelope.expectedState !== expected.expectedState ||
    envelope.snapshotArtifactDigest !== expected.snapshotArtifactDigest ||
    envelope.approvalReferenceDigest !== expectedApprovalDigest ||
    envelope.acquiredAt !== expected.acquiredAt ||
    envelope.restoredAt !== expected.restoredAt ||
    envelope.expiresAt !== expected.expiresAt
  ) {
    authorityError(
      "PRODUCTION_LIKE_AUTHORITY_BINDING_INVALID",
      "The authority manifest failed its exact binding contract.",
    );
  }
}

function validateTimeline(envelope, root, now) {
  const acquiredAt = normalizeCanonicalTimestamp(
    envelope.acquiredAt,
    "PRODUCTION_LIKE_AUTHORITY_TIMELINE_INVALID",
    "Authority acquisition time",
  );
  const restoredAt = normalizeCanonicalTimestamp(
    envelope.restoredAt,
    "PRODUCTION_LIKE_AUTHORITY_TIMELINE_INVALID",
    "Authority restore time",
  );
  const issuedAt = normalizeCanonicalTimestamp(
    envelope.issuedAt,
    "PRODUCTION_LIKE_AUTHORITY_TIMELINE_INVALID",
    "Authority issue time",
  );
  const expiresAt = normalizeCanonicalTimestamp(
    envelope.expiresAt,
    "PRODUCTION_LIKE_AUTHORITY_TIMELINE_INVALID",
    "Authority expiry",
  );
  const currentTime = normalizeCurrentTime(now);
  const rootNotBefore = normalizeCanonicalTimestamp(
    root.notBefore,
    "PRODUCTION_LIKE_AUTHORITY_ROOT_INVALID",
    "Authority root activation time",
  );
  const rootNotAfter = normalizeCanonicalTimestamp(
    root.notAfter,
    "PRODUCTION_LIKE_AUTHORITY_ROOT_INVALID",
    "Authority root retirement time",
  );
  if (
    acquiredAt.valueOf() > restoredAt.valueOf() ||
    restoredAt.valueOf() > issuedAt.valueOf() ||
    issuedAt.valueOf() > currentTime.valueOf() + MAX_CLOCK_SKEW_MS ||
    expiresAt.valueOf() <= currentTime.valueOf() ||
    expiresAt.valueOf() <= issuedAt.valueOf() ||
    expiresAt.valueOf() - issuedAt.valueOf() > MAX_LIFETIME_MS ||
    issuedAt.valueOf() < rootNotBefore.valueOf() ||
    expiresAt.valueOf() > rootNotAfter.valueOf()
  ) {
    authorityError(
      "PRODUCTION_LIKE_AUTHORITY_TIMELINE_INVALID",
      "The authority manifest timeline is invalid or outside root validity.",
    );
  }
}

export function verifyAuthorityEnvelopeAgainstRoots(
  envelope,
  expected,
  roots,
  now = new Date(),
) {
  strictEnvelopeShape(envelope);
  const normalizedExpected = normalizedExpectedContract(expected);
  const normalizedRoots = normalizeRoots(roots);
  const root = Object.hasOwn(normalizedRoots, envelope.signingKeyId)
    ? normalizedRoots[envelope.signingKeyId]
    : null;
  if (!root) {
    authorityError(
      "PRODUCTION_LIKE_AUTHORITY_KEY_NOT_TRUSTED",
      "The authority signing key is not pinned in this release.",
    );
  }
  if (
    root.keyId !== envelope.signingKeyId ||
    root.algorithm !== AUTHORITY_SIGNATURE_ALGORITHM ||
    root.classification !== AUTHORITY_CLASSIFICATION ||
    root.profile !== AUTHORITY_PROFILE ||
    root.purpose !== AUTHORITY_PURPOSE ||
    !SHA_256_PATTERN.test(String(root.publicKeyFingerprint ?? ""))
  ) {
    authorityError(
      "PRODUCTION_LIKE_AUTHORITY_ROOT_INVALID",
      "The pinned authority root contract is invalid.",
    );
  }
  const actualFingerprint = computePublicKeyFingerprint(root.publicKeyPem);
  if (actualFingerprint !== root.publicKeyFingerprint) {
    authorityError(
      "PRODUCTION_LIKE_AUTHORITY_ROOT_INVALID",
      "The pinned authority root fingerprint does not match its public key.",
    );
  }
  validateEnvelopeContract(envelope, normalizedExpected);
  validateTimeline(envelope, root, now);
  const signature = strictSignature(envelope.signature);
  let publicKey;
  try {
    publicKey = createPublicKey(root.publicKeyPem);
  } catch {
    authorityError(
      "PRODUCTION_LIKE_AUTHORITY_ROOT_INVALID",
      "The pinned authority public key is invalid.",
    );
  }
  if (!verify(null, authoritySigningPayload(envelope), publicKey, signature)) {
    authorityError(
      "PRODUCTION_LIKE_AUTHORITY_SIGNATURE_INVALID",
      "The authority manifest signature is invalid.",
    );
  }
  const envelopeDigest = computeAuthorityEnvelopeDigest(envelope);
  return Object.freeze({
    ...stableAuthorityEnvelope(envelope),
    signature: envelope.signature,
    publicKeyFingerprint: actualFingerprint,
    envelopeDigest,
    databaseMarker: authorityDatabaseMarker(envelopeDigest),
  });
}

export function isVerifiedProductionLikeAuthority(authority) {
  return (
    authority !== null &&
    typeof authority === "object" &&
    PINNED_VERIFIED_AUTHORITIES.has(authority)
  );
}

function expectedRuntimeContractDigest(authority, expected) {
  return sha256("staff-task-snapshot-authority-runtime-contract-v1", {
    releaseSha: expected.releaseSha,
    expectedState: expected.expectedState,
    snapshotArtifactDigest: expected.snapshotArtifactDigest,
    approvalReferenceDigest: computeApprovalReferenceDigest(
      expected.approvalReference,
      authority.creationNonce,
    ),
    acquiredAt: expected.acquiredAt,
    restoredAt: expected.restoredAt,
    expiresAt: expected.expiresAt,
  });
}

export function matchesVerifiedProductionLikeAuthority(authority, expected) {
  if (!isVerifiedProductionLikeAuthority(authority)) {
    return false;
  }
  try {
    return (
      PINNED_VERIFIED_AUTHORITIES.get(authority) ===
      expectedRuntimeContractDigest(authority, expected)
    );
  } catch {
    return false;
  }
}

export function verifyPinnedProductionLikeAuthority(
  encodedEnvelope,
  expected,
  now = new Date(),
) {
  if (Object.keys(PINNED_PRODUCTION_LIKE_AUTHORITY_ROOTS).length === 0) {
    authorityError(
      "PRODUCTION_LIKE_AUTHORITY_NOT_ENROLLED",
      "This release has no pinned production-like snapshot authority root.",
    );
  }
  const normalizedExpected = normalizedExpectedContract(expected);
  const envelope = parseAuthorityEnvelope(encodedEnvelope);
  const verifiedAuthority = verifyAuthorityEnvelopeAgainstRoots(
    envelope,
    normalizedExpected,
    PINNED_PRODUCTION_LIKE_AUTHORITY_ROOTS,
    now,
  );
  PINNED_VERIFIED_AUTHORITIES.set(
    verifiedAuthority,
    expectedRuntimeContractDigest(verifiedAuthority, normalizedExpected),
  );
  return verifiedAuthority;
}

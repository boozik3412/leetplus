import {
  createHash,
  createPublicKey,
  verify as verifySignature,
} from "node:crypto";
import { types as utilTypes } from "node:util";

import {
  LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_CONTRACT,
  LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_MIGRATION_SHA256,
  LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_PROFILE,
  assertLangameInitialSyncRuntimeReceiptCurrent193,
} from "./langame-initial-sync-runtime-boundary-current193.mjs";
import { canonicalStringify } from "./staff-task-integrity-canonical-json.mjs";

export const LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_CONTRACT =
  "LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_V1";
export const LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_TRUST_DOMAIN =
  "LEETPLUS_LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193";
export const LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_PURPOSE =
  "LANGAME_INITIAL_SYNC_EXECUTE_ONLY_RUNTIME_ATTESTATION";
export const LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_ALGORITHM =
  "Ed25519";
export const LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_MAX_LIFETIME_MS =
  5 * 60 * 1_000;
export const LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_MAX_SKEW_MS =
  30 * 1_000;
export const LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_SYNTHETIC_CONFIRMATION =
  "verify-langame-current193-runtime-attestation-on-loopback-ci";

// Production verification is impossible before a separately reviewed root
// enrollment and persisted consume/revoke ledger are accepted.
export const PINNED_LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_ROOTS =
  Object.freeze({});

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
const PAYLOAD_KEYS = Object.freeze(
  [
    "attestationId",
    "boundaryContract",
    "boundaryProfile",
    "catalogReceiptDigest",
    "contract",
    "current192MigrationSha256",
    "databaseName",
    "databaseOid",
    "executorRoleName",
    "executorRoleOid",
    "issuedAt",
    "planDigest",
    "publicKeyFingerprint",
    "purpose",
    "releaseSha",
    "schemaOwnerRoleName",
    "schemaOwnerRoleOid",
    "signingKeyId",
    "trustDomain",
    "validUntil",
  ].sort(),
);
const EXPECTED_KEYS = Object.freeze(
  [
    "boundaryContract",
    "boundaryProfile",
    "catalogReceiptDigest",
    "current192MigrationSha256",
    "databaseName",
    "databaseOid",
    "executorRoleName",
    "executorRoleOid",
    "planDigest",
    "releaseSha",
    "schemaOwnerRoleName",
    "schemaOwnerRoleOid",
  ].sort(),
);
const ROOT_KEYS = Object.freeze(
  [
    "algorithm",
    "keyId",
    "notAfter",
    "notBefore",
    "publicKeyFingerprint",
    "publicKeyPem",
    "purpose",
    "status",
    "trustDomain",
  ].sort(),
);
const CONTEXT_KEYS = Object.freeze(
  ["databaseName", "environment", "explicitConfirmation", "hostname"].sort(),
);
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const RELEASE_SHA_PATTERN = /^[a-f0-9]{40}$/u;
const ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/u;
const KEY_PATTERN = /^[a-z0-9][a-z0-9._-]{2,63}$/u;
const DATABASE_PATTERN = /^[a-z][a-z0-9_]{0,62}$/u;
const ROLE_PATTERN = /^[a-z_][a-z0-9_]{2,62}$/u;
const SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{86}$/u;
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const MAX_OID = 4_294_967_295;
const VERIFIED_ATTESTATIONS = new WeakSet();

export class LangameInitialSyncRuntimeAttestationCurrent193Error extends Error {
  constructor(code) {
    super("CURRENT193 Langame runtime attestation rejected the input.");
    this.name = "LangameInitialSyncRuntimeAttestationCurrent193Error";
    this.code = code;
    this.safeContractError = true;
  }
}

function fail(code) {
  throw new LangameInitialSyncRuntimeAttestationCurrent193Error(code);
}

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function exactRecord(value, expectedKeys, code) {
  let invalid;
  try {
    invalid =
      value === null ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      utilTypes.isProxy(value);
  } catch {
    fail(code);
  }
  if (invalid) fail(code);
  let prototype;
  let descriptors;
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    fail(code);
  }
  if (prototype !== Object.prototype && prototype !== null) fail(code);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((key) => typeof key !== "string")) fail(code);
  keys.sort(compareStrings);
  if (
    keys.length !== expectedKeys.length ||
    keys.some((key, index) => key !== expectedKeys[index]) ||
    keys.some((key) => {
      const descriptor = descriptors[key];
      return (
        !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true
      );
    })
  ) {
    fail(code);
  }
  const result = Object.create(null);
  for (const key of expectedKeys) result[key] = descriptors[key].value;
  return Object.freeze(result);
}

function validOid(value) {
  return Number.isInteger(value) && value >= 1 && value <= MAX_OID;
}

function iso(value, code) {
  if (typeof value !== "string") fail(code);
  let canonical;
  try {
    canonical = new Date(value).toISOString();
  } catch {
    fail(code);
  }
  if (canonical !== value) {
    fail(code);
  }
  return Date.parse(value);
}

function digest(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function langameInitialSyncRuntimeAttestationCurrent193PayloadDigest(
  payload,
) {
  return digest(canonicalStringify(payload));
}

export function langameInitialSyncRuntimeAttestationCurrent193PublicKeyFingerprint(
  publicKeyPem,
) {
  if (
    typeof publicKeyPem !== "string" ||
    publicKeyPem.length > 4_096 ||
    !publicKeyPem.startsWith("-----BEGIN PUBLIC KEY-----\n") ||
    !publicKeyPem.endsWith("-----END PUBLIC KEY-----\n")
  ) {
    fail("CURRENT193_ATTESTATION_PUBLIC_KEY_INVALID");
  }
  let key;
  try {
    key = createPublicKey(publicKeyPem);
  } catch {
    fail("CURRENT193_ATTESTATION_PUBLIC_KEY_INVALID");
  }
  if (key.asymmetricKeyType !== "ed25519") {
    fail("CURRENT193_ATTESTATION_PUBLIC_KEY_INVALID");
  }
  return createHash("sha256")
    .update(key.export({ format: "der", type: "spki" }))
    .digest("hex");
}

export function projectLangameInitialSyncRuntimeAttestationCurrent193(receipt) {
  const trusted = assertLangameInitialSyncRuntimeReceiptCurrent193(receipt);
  return Object.freeze({
    boundaryContract: LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_CONTRACT,
    boundaryProfile: LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_PROFILE,
    catalogReceiptDigest: trusted.receiptDigest,
    current192MigrationSha256:
      LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_MIGRATION_SHA256,
    databaseName: trusted.database.name,
    databaseOid: trusted.database.oid,
    executorRoleName: trusted.executorRole.name,
    executorRoleOid: trusted.executorRole.oid,
    planDigest: trusted.planDigest,
    releaseSha: trusted.releaseSha,
    schemaOwnerRoleName: trusted.schemaOwnerRole.name,
    schemaOwnerRoleOid: trusted.schemaOwnerRole.oid,
  });
}

function normalizeExpected(value) {
  const expected = exactRecord(
    value,
    EXPECTED_KEYS,
    "CURRENT193_ATTESTATION_EXPECTED_INVALID",
  );
  if (
    expected.boundaryContract !==
      LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_CONTRACT ||
    expected.boundaryProfile !==
      LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_PROFILE ||
    expected.current192MigrationSha256 !==
      LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_MIGRATION_SHA256 ||
    !SHA256_PATTERN.test(expected.catalogReceiptDigest) ||
    !SHA256_PATTERN.test(expected.planDigest) ||
    !RELEASE_SHA_PATTERN.test(expected.releaseSha) ||
    !DATABASE_PATTERN.test(expected.databaseName) ||
    !ROLE_PATTERN.test(expected.executorRoleName) ||
    !ROLE_PATTERN.test(expected.schemaOwnerRoleName) ||
    !validOid(expected.databaseOid) ||
    !validOid(expected.executorRoleOid) ||
    !validOid(expected.schemaOwnerRoleOid) ||
    expected.executorRoleOid === expected.schemaOwnerRoleOid
  ) {
    fail("CURRENT193_ATTESTATION_EXPECTED_INVALID");
  }
  return expected;
}

function normalizePayload(value) {
  const payload = exactRecord(
    value,
    PAYLOAD_KEYS,
    "CURRENT193_ATTESTATION_PAYLOAD_INVALID",
  );
  normalizeExpected(
    Object.fromEntries(EXPECTED_KEYS.map((key) => [key, payload[key]])),
  );
  if (
    !ID_PATTERN.test(payload.attestationId) ||
    payload.contract !==
      LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_CONTRACT ||
    payload.purpose !==
      LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_PURPOSE ||
    payload.trustDomain !==
      LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_TRUST_DOMAIN ||
    !KEY_PATTERN.test(payload.signingKeyId) ||
    !SHA256_PATTERN.test(payload.publicKeyFingerprint)
  ) {
    fail("CURRENT193_ATTESTATION_PAYLOAD_INVALID");
  }
  return payload;
}

function normalizeRoots(value) {
  let invalid;
  try {
    invalid =
      value === null ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      utilTypes.isProxy(value);
  } catch {
    fail("CURRENT193_ATTESTATION_ROOTS_INVALID");
  }
  if (invalid) fail("CURRENT193_ATTESTATION_ROOTS_INVALID");
  let prototype;
  let descriptors;
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    fail("CURRENT193_ATTESTATION_ROOTS_INVALID");
  }
  if (prototype !== Object.prototype && prototype !== null) {
    fail("CURRENT193_ATTESTATION_ROOTS_INVALID");
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
    fail("CURRENT193_ATTESTATION_ROOTS_INVALID");
  }
  keys.sort(compareStrings);
  const roots = Object.create(null);
  for (const key of keys) roots[key] = descriptors[key].value;
  return Object.freeze(roots);
}

function selectRoot(rootsValue, keyId, nowMs) {
  const roots = normalizeRoots(rootsValue);
  if (!Object.hasOwn(roots, keyId))
    fail("CURRENT193_ATTESTATION_ROOT_NOT_TRUSTED");
  const root = exactRecord(
    roots[keyId],
    ROOT_KEYS,
    "CURRENT193_ATTESTATION_ROOT_INVALID",
  );
  const notBefore = iso(root.notBefore, "CURRENT193_ATTESTATION_ROOT_INVALID");
  const notAfter = iso(root.notAfter, "CURRENT193_ATTESTATION_ROOT_INVALID");
  if (
    root.algorithm !==
      LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_ALGORITHM ||
    root.keyId !== keyId ||
    root.purpose !==
      LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_PURPOSE ||
    root.trustDomain !==
      LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_TRUST_DOMAIN ||
    root.status !== "ACTIVE" ||
    root.publicKeyFingerprint !==
      langameInitialSyncRuntimeAttestationCurrent193PublicKeyFingerprint(
        root.publicKeyPem,
      ) ||
    nowMs < notBefore ||
    nowMs >= notAfter
  ) {
    fail("CURRENT193_ATTESTATION_ROOT_NOT_TRUSTED");
  }
  return Object.freeze({
    ...root,
    notAfterMs: notAfter,
    notBeforeMs: notBefore,
  });
}

function verifyWithRoots(envelopeValue, expectedValue, roots, now) {
  const envelope = exactRecord(
    envelopeValue,
    ENVELOPE_KEYS,
    "CURRENT193_ATTESTATION_ENVELOPE_INVALID",
  );
  const expected = normalizeExpected(expectedValue);
  const payload = normalizePayload(envelope.payload);
  const nowMs = iso(now, "CURRENT193_ATTESTATION_NOW_INVALID");
  if (
    envelope.signatureAlgorithm !==
      LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_ALGORITHM ||
    envelope.signingKeyId !== payload.signingKeyId ||
    envelope.publicKeyFingerprint !== payload.publicKeyFingerprint ||
    !SHA256_PATTERN.test(envelope.payloadDigest) ||
    envelope.payloadDigest !==
      langameInitialSyncRuntimeAttestationCurrent193PayloadDigest(payload) ||
    canonicalStringify(
      Object.fromEntries(EXPECTED_KEYS.map((key) => [key, payload[key]])),
    ) !== canonicalStringify(expected)
  ) {
    fail("CURRENT193_ATTESTATION_BINDING_INVALID");
  }
  const root = selectRoot(roots, payload.signingKeyId, nowMs);
  if (root.publicKeyFingerprint !== payload.publicKeyFingerprint) {
    fail("CURRENT193_ATTESTATION_ROOT_NOT_TRUSTED");
  }
  const issuedAt = iso(
    payload.issuedAt,
    "CURRENT193_ATTESTATION_TIMELINE_INVALID",
  );
  const validUntil = iso(
    payload.validUntil,
    "CURRENT193_ATTESTATION_TIMELINE_INVALID",
  );
  if (
    issuedAt >
      nowMs + LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_MAX_SKEW_MS ||
    issuedAt < root.notBeforeMs ||
    issuedAt >= root.notAfterMs ||
    validUntil <= issuedAt ||
    validUntil <= nowMs ||
    validUntil > root.notAfterMs ||
    validUntil - issuedAt >
      LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_MAX_LIFETIME_MS
  ) {
    fail("CURRENT193_ATTESTATION_TIMELINE_INVALID");
  }
  let signature;
  if (
    typeof envelope.signature !== "string" ||
    !SIGNATURE_PATTERN.test(envelope.signature)
  ) {
    fail("CURRENT193_ATTESTATION_SIGNATURE_INVALID");
  }
  signature = Buffer.from(envelope.signature, "base64url");
  if (
    signature.length !== 64 ||
    !verifySignature(
      null,
      Buffer.from(canonicalStringify(payload), "utf8"),
      createPublicKey(root.publicKeyPem),
      signature,
    )
  ) {
    fail("CURRENT193_ATTESTATION_SIGNATURE_INVALID");
  }

  const verified = Object.freeze({
    contract: LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_CONTRACT,
    attestationId: payload.attestationId,
    catalogReceiptDigest: payload.catalogReceiptDigest,
    planDigest: payload.planDigest,
    releaseSha: payload.releaseSha,
    databaseName: payload.databaseName,
    databaseOid: payload.databaseOid,
    executorRoleName: payload.executorRoleName,
    executorRoleOid: payload.executorRoleOid,
    issuedAt: payload.issuedAt,
    validUntil: payload.validUntil,
    payloadDigest: envelope.payloadDigest,
    signingKeyId: payload.signingKeyId,
    authorization: false,
    productionExecutionAllowed: false,
  });
  VERIFIED_ATTESTATIONS.add(verified);
  return verified;
}

export function verifyPinnedLangameInitialSyncRuntimeAttestationCurrent193(
  envelope,
  expected,
) {
  if (arguments.length !== 2) fail("CURRENT193_ATTESTATION_ARGUMENTS_INVALID");
  return verifyWithRoots(
    envelope,
    expected,
    PINNED_LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_ROOTS,
    new Date().toISOString(),
  );
}

export function verifySyntheticLangameInitialSyncRuntimeAttestationCurrent193(
  envelope,
  expectedValue,
  roots,
  contextValue,
  now,
) {
  if (arguments.length !== 5) fail("CURRENT193_ATTESTATION_ARGUMENTS_INVALID");
  const expected = normalizeExpected(expectedValue);
  const context = exactRecord(
    contextValue,
    CONTEXT_KEYS,
    "CURRENT193_ATTESTATION_SYNTHETIC_DENIED",
  );
  if (
    context.environment !== "ci" ||
    context.explicitConfirmation !==
      LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_SYNTHETIC_CONFIRMATION ||
    !LOOPBACK_HOSTS.has(context.hostname) ||
    context.databaseName !== expected.databaseName ||
    !/_ci$/u.test(context.databaseName)
  ) {
    fail("CURRENT193_ATTESTATION_SYNTHETIC_DENIED");
  }
  return verifyWithRoots(envelope, expected, roots, now);
}

export function isVerifiedLangameInitialSyncRuntimeAttestationCurrent193(
  value,
) {
  return (
    value !== null &&
    typeof value === "object" &&
    VERIFIED_ATTESTATIONS.has(value)
  );
}

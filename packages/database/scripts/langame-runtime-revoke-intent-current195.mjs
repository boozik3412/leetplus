import {
  createHash,
  createPublicKey,
  verify as verifySignature,
} from "node:crypto";
import { types as utilTypes } from "node:util";

import { isVerifiedLangameInitialSyncRuntimeAttestationCurrent193 } from "./langame-initial-sync-runtime-attestation-current193.mjs";
import { canonicalStringify } from "./staff-task-integrity-canonical-json.mjs";

export const LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_CONTRACT =
  "LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_V1";
export const LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_CURRENT194_CONTRACT =
  "LANGAME_RUNTIME_ATTESTATION_LEDGER_CURRENT194_V1";
export const LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_TRUST_DOMAIN =
  "LEETPLUS_LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195";
export const LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_PURPOSE =
  "LANGAME_RUNTIME_OWNER_REVOKE_INTENT";
export const LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_ALGORITHM = "Ed25519";
export const LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_MAX_LIFETIME_MS =
  5 * 60 * 1_000;
export const LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_MAX_SKEW_MS = 30 * 1_000;
export const LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_SYNTHETIC_CONFIRMATION =
  "verify-langame-current195-revoke-intent-on-loopback-ci";

export const PINNED_LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_ROOTS =
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
    "attestationPublicKeyFingerprint",
    "attestationSigningKeyId",
    "contract",
    "current194Contract",
    "databaseName",
    "databaseOid",
    "expectedPayloadDigest",
    "intentId",
    "issuedAt",
    "ownerRoleName",
    "ownerRoleOid",
    "publicKeyFingerprint",
    "purpose",
    "releaseSha",
    "revocationReasonDigest",
    "revokeRequestDigest",
    "revokeRequestId",
    "signingKeyId",
    "trustDomain",
    "validUntil",
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
const MAX_ROOTS = 8;
const VERIFIED_INTENTS = new WeakSet();

export class LangameRuntimeRevokeIntentCurrent195Error extends Error {
  constructor(code) {
    super("CURRENT195 Langame runtime revoke intent rejected the input.");
    this.name = "LangameRuntimeRevokeIntentCurrent195Error";
    this.code = code;
    this.safeContractError = true;
  }
}

function fail(code) {
  throw new LangameRuntimeRevokeIntentCurrent195Error(code);
}

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function exactRecord(value, expectedKeys, code) {
  let invalid;
  let prototype;
  let descriptors;
  try {
    invalid =
      value === null ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      utilTypes.isProxy(value);
    prototype = invalid ? null : Object.getPrototypeOf(value);
    descriptors = invalid ? null : Object.getOwnPropertyDescriptors(value);
  } catch {
    fail(code);
  }
  if (invalid || (prototype !== Object.prototype && prototype !== null)) {
    fail(code);
  }
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

function canonicalEpoch(value, code) {
  if (typeof value !== "string") fail(code);
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch) || new Date(epoch).toISOString() !== value) {
    fail(code);
  }
  return epoch;
}

function validOid(value) {
  return Number.isInteger(value) && value >= 1 && value <= MAX_OID;
}

function normalizePayload(value) {
  const payload = exactRecord(
    value,
    PAYLOAD_KEYS,
    "CURRENT195_REVOKE_INTENT_PAYLOAD_INVALID",
  );
  const digests = [
    payload.attestationPublicKeyFingerprint,
    payload.expectedPayloadDigest,
    payload.publicKeyFingerprint,
    payload.revocationReasonDigest,
    payload.revokeRequestDigest,
  ];
  if (
    payload.contract !== LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_CONTRACT ||
    payload.current194Contract !==
      LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_CURRENT194_CONTRACT ||
    payload.purpose !== LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_PURPOSE ||
    payload.trustDomain !==
      LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_TRUST_DOMAIN ||
    !ID_PATTERN.test(payload.intentId) ||
    !ID_PATTERN.test(payload.attestationId) ||
    !ID_PATTERN.test(payload.revokeRequestId) ||
    payload.intentId === payload.attestationId ||
    payload.intentId === payload.revokeRequestId ||
    payload.attestationId === payload.revokeRequestId ||
    !DATABASE_PATTERN.test(payload.databaseName) ||
    !validOid(payload.databaseOid) ||
    !ROLE_PATTERN.test(payload.ownerRoleName) ||
    !validOid(payload.ownerRoleOid) ||
    !RELEASE_SHA_PATTERN.test(payload.releaseSha) ||
    !KEY_PATTERN.test(payload.attestationSigningKeyId) ||
    !KEY_PATTERN.test(payload.signingKeyId) ||
    payload.signingKeyId === payload.attestationSigningKeyId ||
    !digests.every((digest) => SHA256_PATTERN.test(digest)) ||
    payload.publicKeyFingerprint === payload.attestationPublicKeyFingerprint ||
    new Set(digests.slice(1)).size !== digests.slice(1).length
  ) {
    fail("CURRENT195_REVOKE_INTENT_PAYLOAD_INVALID");
  }
  return payload;
}

export function langameRuntimeRevokeIntentCurrent195PayloadDigest(payload) {
  return createHash("sha256")
    .update(
      `${LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_TRUST_DOMAIN}\n`,
      "utf8",
    )
    .update(canonicalStringify(payload), "utf8")
    .digest("hex");
}

export function langameRuntimeRevokeIntentCurrent195PublicKeyFingerprint(
  publicKeyPem,
) {
  if (
    typeof publicKeyPem !== "string" ||
    publicKeyPem.length > 4_096 ||
    !publicKeyPem.startsWith("-----BEGIN PUBLIC KEY-----\n") ||
    !publicKeyPem.endsWith("-----END PUBLIC KEY-----\n")
  ) {
    fail("CURRENT195_REVOKE_INTENT_PUBLIC_KEY_INVALID");
  }
  let key;
  try {
    key = createPublicKey(publicKeyPem);
  } catch {
    fail("CURRENT195_REVOKE_INTENT_PUBLIC_KEY_INVALID");
  }
  if (key.asymmetricKeyType !== "ed25519") {
    fail("CURRENT195_REVOKE_INTENT_PUBLIC_KEY_INVALID");
  }
  return createHash("sha256")
    .update(key.export({ format: "der", type: "spki" }))
    .digest("hex");
}

function selectRoot(rootsValue, keyId, nowMs) {
  let roots;
  let rootKeys;
  try {
    rootKeys = Reflect.ownKeys(rootsValue);
    if (
      rootKeys.length > MAX_ROOTS ||
      rootKeys.some(
        (rootKey) => typeof rootKey !== "string" || !KEY_PATTERN.test(rootKey),
      )
    ) {
      fail("CURRENT195_REVOKE_INTENT_ROOTS_INVALID");
    }
    rootKeys.sort(compareStrings);
    roots = exactRecord(
      rootsValue,
      rootKeys,
      "CURRENT195_REVOKE_INTENT_ROOTS_INVALID",
    );
  } catch {
    fail("CURRENT195_REVOKE_INTENT_ROOTS_INVALID");
  }
  if (!Object.hasOwn(roots, keyId)) {
    fail("CURRENT195_REVOKE_INTENT_ROOT_NOT_TRUSTED");
  }
  const root = exactRecord(
    roots[keyId],
    ROOT_KEYS,
    "CURRENT195_REVOKE_INTENT_ROOT_INVALID",
  );
  const notBefore = canonicalEpoch(
    root.notBefore,
    "CURRENT195_REVOKE_INTENT_ROOT_INVALID",
  );
  const notAfter = canonicalEpoch(
    root.notAfter,
    "CURRENT195_REVOKE_INTENT_ROOT_INVALID",
  );
  if (
    root.algorithm !== LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_ALGORITHM ||
    root.keyId !== keyId ||
    root.purpose !== LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_PURPOSE ||
    root.trustDomain !==
      LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_TRUST_DOMAIN ||
    root.status !== "ACTIVE" ||
    root.publicKeyFingerprint !==
      langameRuntimeRevokeIntentCurrent195PublicKeyFingerprint(
        root.publicKeyPem,
      ) ||
    nowMs < notBefore ||
    nowMs >= notAfter
  ) {
    fail("CURRENT195_REVOKE_INTENT_ROOT_NOT_TRUSTED");
  }
  return Object.freeze({
    ...root,
    notAfterMs: notAfter,
    notBeforeMs: notBefore,
  });
}

function assertAttestationBinding(payload, attestation) {
  if (
    !isVerifiedLangameInitialSyncRuntimeAttestationCurrent193(attestation) ||
    payload.attestationId !== attestation.attestationId ||
    payload.attestationPublicKeyFingerprint !==
      attestation.publicKeyFingerprint ||
    payload.attestationSigningKeyId !== attestation.signingKeyId ||
    payload.databaseName !== attestation.databaseName ||
    payload.databaseOid !== attestation.databaseOid ||
    payload.expectedPayloadDigest !== attestation.payloadDigest ||
    payload.ownerRoleName !== attestation.schemaOwnerRoleName ||
    payload.ownerRoleOid !== attestation.schemaOwnerRoleOid ||
    payload.releaseSha !== attestation.releaseSha
  ) {
    fail("CURRENT195_REVOKE_INTENT_ATTESTATION_BINDING_INVALID");
  }
}

function verifyWithRoots(
  envelopeValue,
  attestation,
  roots,
  now,
  verificationMode,
) {
  const envelope = exactRecord(
    envelopeValue,
    ENVELOPE_KEYS,
    "CURRENT195_REVOKE_INTENT_ENVELOPE_INVALID",
  );
  const payload = normalizePayload(envelope.payload);
  assertAttestationBinding(payload, attestation);
  const nowMs = canonicalEpoch(now, "CURRENT195_REVOKE_INTENT_NOW_INVALID");
  if (
    envelope.signatureAlgorithm !==
      LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_ALGORITHM ||
    envelope.signingKeyId !== payload.signingKeyId ||
    envelope.publicKeyFingerprint !== payload.publicKeyFingerprint ||
    !SHA256_PATTERN.test(envelope.payloadDigest) ||
    envelope.payloadDigest !==
      langameRuntimeRevokeIntentCurrent195PayloadDigest(payload)
  ) {
    fail("CURRENT195_REVOKE_INTENT_BINDING_INVALID");
  }
  const root = selectRoot(roots, payload.signingKeyId, nowMs);
  if (root.publicKeyFingerprint !== payload.publicKeyFingerprint) {
    fail("CURRENT195_REVOKE_INTENT_ROOT_NOT_TRUSTED");
  }
  const issuedAt = canonicalEpoch(
    payload.issuedAt,
    "CURRENT195_REVOKE_INTENT_TIMELINE_INVALID",
  );
  const validUntil = canonicalEpoch(
    payload.validUntil,
    "CURRENT195_REVOKE_INTENT_TIMELINE_INVALID",
  );
  if (
    issuedAt > nowMs + LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_MAX_SKEW_MS ||
    issuedAt < root.notBeforeMs ||
    issuedAt >= root.notAfterMs ||
    validUntil <= issuedAt ||
    validUntil <= nowMs ||
    validUntil > root.notAfterMs ||
    validUntil - issuedAt >
      LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_MAX_LIFETIME_MS
  ) {
    fail("CURRENT195_REVOKE_INTENT_TIMELINE_INVALID");
  }
  if (issuedAt < Date.parse(attestation.issuedAt)) {
    fail("CURRENT195_REVOKE_INTENT_TIMELINE_INVALID");
  }
  if (
    typeof envelope.signature !== "string" ||
    !SIGNATURE_PATTERN.test(envelope.signature)
  ) {
    fail("CURRENT195_REVOKE_INTENT_SIGNATURE_INVALID");
  }
  const signature = Buffer.from(envelope.signature, "base64url");
  if (
    signature.length !== 64 ||
    !verifySignature(
      null,
      Buffer.from(canonicalStringify(payload), "utf8"),
      createPublicKey(root.publicKeyPem),
      signature,
    )
  ) {
    fail("CURRENT195_REVOKE_INTENT_SIGNATURE_INVALID");
  }
  const verified = Object.freeze({
    attestationId: payload.attestationId,
    attestationPublicKeyFingerprint: payload.attestationPublicKeyFingerprint,
    attestationSigningKeyId: payload.attestationSigningKeyId,
    authorization: false,
    contract: LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_CONTRACT,
    databaseName: payload.databaseName,
    databaseOid: payload.databaseOid,
    expectedPayloadDigest: payload.expectedPayloadDigest,
    intentId: payload.intentId,
    intentPayloadDigest: envelope.payloadDigest,
    issuedAt: payload.issuedAt,
    ownerRoleName: payload.ownerRoleName,
    ownerRoleOid: payload.ownerRoleOid,
    productionExecutionAllowed: false,
    publicKeyFingerprint: payload.publicKeyFingerprint,
    releaseSha: payload.releaseSha,
    revocationReasonDigest: payload.revocationReasonDigest,
    revokeRequestDigest: payload.revokeRequestDigest,
    revokeRequestId: payload.revokeRequestId,
    signature: envelope.signature,
    signingKeyId: payload.signingKeyId,
    validUntil: payload.validUntil,
    verificationMode,
  });
  VERIFIED_INTENTS.add(verified);
  return verified;
}

export function verifyPinnedLangameRuntimeRevokeIntentCurrent195(
  envelope,
  attestation,
) {
  if (arguments.length !== 2) {
    fail("CURRENT195_REVOKE_INTENT_ARGUMENTS_INVALID");
  }
  return verifyWithRoots(
    envelope,
    attestation,
    PINNED_LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_ROOTS,
    new Date().toISOString(),
    "PINNED_PRODUCTION",
  );
}

export function verifySyntheticLangameRuntimeRevokeIntentCurrent195(
  envelope,
  attestation,
  roots,
  contextValue,
  now,
) {
  if (arguments.length !== 5) {
    fail("CURRENT195_REVOKE_INTENT_ARGUMENTS_INVALID");
  }
  if (!isVerifiedLangameInitialSyncRuntimeAttestationCurrent193(attestation)) {
    fail("CURRENT195_REVOKE_INTENT_ATTESTATION_BINDING_INVALID");
  }
  const context = exactRecord(
    contextValue,
    CONTEXT_KEYS,
    "CURRENT195_REVOKE_INTENT_SYNTHETIC_DENIED",
  );
  if (
    context.environment !== "ci" ||
    context.explicitConfirmation !==
      LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_SYNTHETIC_CONFIRMATION ||
    !LOOPBACK_HOSTS.has(context.hostname) ||
    context.databaseName !== attestation.databaseName ||
    !/_ci$/u.test(context.databaseName)
  ) {
    fail("CURRENT195_REVOKE_INTENT_SYNTHETIC_DENIED");
  }
  return verifyWithRoots(envelope, attestation, roots, now, "SYNTHETIC_CI");
}

export function isVerifiedLangameRuntimeRevokeIntentCurrent195(value) {
  return (
    arguments.length === 1 &&
    value !== null &&
    typeof value === "object" &&
    VERIFIED_INTENTS.has(value)
  );
}

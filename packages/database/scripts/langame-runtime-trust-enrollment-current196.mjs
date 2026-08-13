import {
  createHash,
  createPublicKey,
  verify as verifySignature,
} from "node:crypto";
import { types as utilTypes } from "node:util";

import {
  LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_ALGORITHM,
  LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_CONTRACT,
  LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_PURPOSE,
  LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_TRUST_DOMAIN,
} from "./langame-initial-sync-runtime-attestation-current193.mjs";
import { LANGAME_INITIAL_SYNC_RUNTIME_PROVIDER_CURRENT194_CONTRACT } from "./langame-initial-sync-runtime-provider-current194.mjs";
import {
  LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_ALGORITHM,
  LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_CONTRACT,
  LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_PURPOSE,
  LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_TRUST_DOMAIN,
} from "./langame-runtime-revoke-intent-current195.mjs";
import { PINNED_LANGAME_RUNTIME_TRUST_BOOTSTRAP_VERIFICATION_ROOTS_CURRENT198 } from "./langame-runtime-trust-bootstrap-registry-current198.mjs";
import { canonicalStringify } from "./staff-task-integrity-canonical-json.mjs";

export const LANGAME_RUNTIME_TRUST_ENROLLMENT_CURRENT196_CONTRACT =
  "LANGAME_RUNTIME_TRUST_ENROLLMENT_CURRENT196_V1";
export const LANGAME_RUNTIME_TRUST_ENROLLMENT_CURRENT196_TRUST_DOMAIN =
  "LEETPLUS_LANGAME_RUNTIME_TRUST_ENROLLMENT_CURRENT196";
export const LANGAME_RUNTIME_TRUST_ENROLLMENT_CURRENT196_PURPOSE =
  "LANGAME_RUNTIME_PRODUCTION_TRUST_ENROLLMENT_PROPOSAL";
export const LANGAME_RUNTIME_TRUST_ENROLLMENT_CURRENT196_ALGORITHM = "Ed25519";
export const LANGAME_RUNTIME_TRUST_ENROLLMENT_CURRENT196_MAX_LIFETIME_MS =
  5 * 60 * 1_000;
export const LANGAME_RUNTIME_TRUST_ENROLLMENT_CURRENT196_MAX_SKEW_MS =
  30 * 1_000;
export const LANGAME_RUNTIME_TRUST_ENROLLMENT_CURRENT196_MAX_ROOT_LIFETIME_MS =
  366 * 24 * 60 * 60 * 1_000;
export const LANGAME_RUNTIME_TRUST_ENROLLMENT_CURRENT196_CURRENT195_MIGRATION_SHA256 =
  "ecb9e9a8f8a2cefff482331ec7b122af081b6175a8cc931fe594339c549183ac";
export const LANGAME_RUNTIME_TRUST_ENROLLMENT_CURRENT196_SYNTHETIC_CONFIRMATION =
  "verify-langame-current196-trust-enrollment-proposal-on-loopback-ci";

export const PINNED_LANGAME_RUNTIME_TRUST_ENROLLMENT_CURRENT196_BOOTSTRAP_ROOTS =
  PINNED_LANGAME_RUNTIME_TRUST_BOOTSTRAP_VERIFICATION_ROOTS_CURRENT198;

const ENVELOPE_KEYS = Object.freeze(
  [
    "candidateBundle",
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
    "bootstrapPublicKeyFingerprint",
    "bootstrapSigningKeyId",
    "candidateBundleDigest",
    "ceremonyTranscriptDigest",
    "challengeDigest",
    "clusterIdentityDigest",
    "contract",
    "current193Contract",
    "current194Contract",
    "current195Contract",
    "current195MigrationSha256",
    "databaseName",
    "databaseOid",
    "enrollmentGeneration",
    "enrollmentId",
    "initialRevocationStateDigest",
    "issuedAt",
    "ownerRoleName",
    "ownerRoleOid",
    "primaryApprovalDigest",
    "priorEnrollmentDigest",
    "purpose",
    "releaseArtifactDigest",
    "releaseSha",
    "runtimeConfigDigest",
    "runtimeRoleName",
    "runtimeRoleOid",
    "secondaryApprovalDigest",
    "trustDomain",
    "validUntil",
    "verifierArtifactDigest",
  ].sort(),
);
const BUNDLE_KEYS = Object.freeze(
  ["runtimeAttestationRoot", "runtimeRevokeIntentRoot", "tlsPeerPinset"].sort(),
);
const CANDIDATE_ROOT_KEYS = Object.freeze(
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
const TLS_PINSET_KEYS = Object.freeze(
  [
    "caCertificateSha256",
    "endpointHost",
    "endpointPort",
    "expectedLeafCertificateSha256",
    "expectedLeafSpkiSha256",
    "leafNotAfter",
    "leafNotBefore",
    "minimumProtocol",
    "rejectUnauthorized",
    "serverName",
  ].sort(),
);
const BOOTSTRAP_ROOT_KEYS = Object.freeze(
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
const EXPECTED_KEYS = Object.freeze(
  [
    "candidateBundleDigest",
    "clusterIdentityDigest",
    "databaseName",
    "databaseOid",
    "ownerRoleName",
    "ownerRoleOid",
    "releaseArtifactDigest",
    "releaseSha",
    "runtimeConfigDigest",
    "runtimeRoleName",
    "runtimeRoleOid",
    "verifierArtifactDigest",
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
const DNS_PATTERN =
  /^(?=.{1,253}$)(?!-)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
const SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{86}$/u;
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const TLS_PROTOCOLS = new Set(["TLSv1.2", "TLSv1.3"]);
const MAX_OID = 4_294_967_295;
const MAX_ROOTS = 8;
const VERIFIED_PROPOSALS = new WeakSet();

export class LangameRuntimeTrustEnrollmentCurrent196Error extends Error {
  constructor(code) {
    super("CURRENT196 Langame runtime trust enrollment rejected the input.");
    this.name = "LangameRuntimeTrustEnrollmentCurrent196Error";
    this.code = code;
    this.safeContractError = true;
  }
}

function fail(code) {
  throw new LangameRuntimeTrustEnrollmentCurrent196Error(code);
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

export function langameRuntimeTrustEnrollmentCurrent196PublicKeyFingerprint(
  publicKeyPem,
) {
  if (
    typeof publicKeyPem !== "string" ||
    publicKeyPem.length > 4_096 ||
    !publicKeyPem.startsWith("-----BEGIN PUBLIC KEY-----\n") ||
    !publicKeyPem.endsWith("-----END PUBLIC KEY-----\n")
  ) {
    fail("CURRENT196_TRUST_ENROLLMENT_PUBLIC_KEY_INVALID");
  }
  let key;
  try {
    key = createPublicKey(publicKeyPem);
  } catch {
    fail("CURRENT196_TRUST_ENROLLMENT_PUBLIC_KEY_INVALID");
  }
  if (key.asymmetricKeyType !== "ed25519") {
    fail("CURRENT196_TRUST_ENROLLMENT_PUBLIC_KEY_INVALID");
  }
  return createHash("sha256")
    .update(key.export({ format: "der", type: "spki" }))
    .digest("hex");
}

function normalizeCandidateRoot(value, expected, code) {
  const root = exactRecord(value, CANDIDATE_ROOT_KEYS, code);
  const notBeforeMs = canonicalEpoch(root.notBefore, code);
  const notAfterMs = canonicalEpoch(root.notAfter, code);
  if (
    root.algorithm !== expected.algorithm ||
    !KEY_PATTERN.test(root.keyId) ||
    root.purpose !== expected.purpose ||
    root.trustDomain !== expected.trustDomain ||
    root.status !== "PENDING_ENROLLMENT" ||
    !SHA256_PATTERN.test(root.publicKeyFingerprint) ||
    root.publicKeyFingerprint !==
      langameRuntimeTrustEnrollmentCurrent196PublicKeyFingerprint(
        root.publicKeyPem,
      ) ||
    notAfterMs <= notBeforeMs ||
    notAfterMs - notBeforeMs >
      LANGAME_RUNTIME_TRUST_ENROLLMENT_CURRENT196_MAX_ROOT_LIFETIME_MS
  ) {
    fail(code);
  }
  return Object.freeze({ ...root, notAfterMs, notBeforeMs });
}

function normalizeTlsPinset(value) {
  const code = "CURRENT196_TRUST_ENROLLMENT_TLS_PINSET_INVALID";
  const pinset = exactRecord(value, TLS_PINSET_KEYS, code);
  const notBeforeMs = canonicalEpoch(pinset.leafNotBefore, code);
  const notAfterMs = canonicalEpoch(pinset.leafNotAfter, code);
  if (
    !SHA256_PATTERN.test(pinset.caCertificateSha256) ||
    !SHA256_PATTERN.test(pinset.expectedLeafCertificateSha256) ||
    !SHA256_PATTERN.test(pinset.expectedLeafSpkiSha256) ||
    new Set([
      pinset.caCertificateSha256,
      pinset.expectedLeafCertificateSha256,
      pinset.expectedLeafSpkiSha256,
    ]).size !== 3 ||
    typeof pinset.endpointHost !== "string" ||
    !DNS_PATTERN.test(pinset.endpointHost) ||
    typeof pinset.serverName !== "string" ||
    !DNS_PATTERN.test(pinset.serverName) ||
    pinset.endpointHost !== pinset.endpointHost.toLowerCase() ||
    pinset.serverName !== pinset.serverName.toLowerCase() ||
    !Number.isSafeInteger(pinset.endpointPort) ||
    pinset.endpointPort < 1 ||
    pinset.endpointPort > 65_535 ||
    !TLS_PROTOCOLS.has(pinset.minimumProtocol) ||
    pinset.rejectUnauthorized !== true ||
    notAfterMs <= notBeforeMs
  ) {
    fail(code);
  }
  return Object.freeze({ ...pinset, notAfterMs, notBeforeMs });
}

function normalizeCandidateBundle(value) {
  const code = "CURRENT196_TRUST_ENROLLMENT_CANDIDATE_BUNDLE_INVALID";
  const bundle = exactRecord(value, BUNDLE_KEYS, code);
  const runtimeAttestationRoot = normalizeCandidateRoot(
    bundle.runtimeAttestationRoot,
    {
      algorithm: LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_ALGORITHM,
      purpose: LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_PURPOSE,
      trustDomain:
        LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_TRUST_DOMAIN,
    },
    code,
  );
  const runtimeRevokeIntentRoot = normalizeCandidateRoot(
    bundle.runtimeRevokeIntentRoot,
    {
      algorithm: LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_ALGORITHM,
      purpose: LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_PURPOSE,
      trustDomain: LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_TRUST_DOMAIN,
    },
    code,
  );
  if (
    runtimeAttestationRoot.keyId === runtimeRevokeIntentRoot.keyId ||
    runtimeAttestationRoot.publicKeyFingerprint ===
      runtimeRevokeIntentRoot.publicKeyFingerprint
  ) {
    fail(code);
  }
  return Object.freeze({
    runtimeAttestationRoot,
    runtimeRevokeIntentRoot,
    tlsPeerPinset: normalizeTlsPinset(bundle.tlsPeerPinset),
  });
}

function serializableCandidateBundle(bundle) {
  const projectRoot = (root) => ({
    algorithm: root.algorithm,
    keyId: root.keyId,
    notAfter: root.notAfter,
    notBefore: root.notBefore,
    publicKeyFingerprint: root.publicKeyFingerprint,
    publicKeyPem: root.publicKeyPem,
    purpose: root.purpose,
    status: root.status,
    trustDomain: root.trustDomain,
  });
  const pinset = bundle.tlsPeerPinset;
  return {
    runtimeAttestationRoot: projectRoot(bundle.runtimeAttestationRoot),
    runtimeRevokeIntentRoot: projectRoot(bundle.runtimeRevokeIntentRoot),
    tlsPeerPinset: {
      caCertificateSha256: pinset.caCertificateSha256,
      endpointHost: pinset.endpointHost,
      endpointPort: pinset.endpointPort,
      expectedLeafCertificateSha256: pinset.expectedLeafCertificateSha256,
      expectedLeafSpkiSha256: pinset.expectedLeafSpkiSha256,
      leafNotAfter: pinset.leafNotAfter,
      leafNotBefore: pinset.leafNotBefore,
      minimumProtocol: pinset.minimumProtocol,
      rejectUnauthorized: pinset.rejectUnauthorized,
      serverName: pinset.serverName,
    },
  };
}

export function langameRuntimeTrustEnrollmentCurrent196CandidateBundleDigest(
  candidateBundle,
) {
  const bundle = normalizeCandidateBundle(candidateBundle);
  return createHash("sha256")
    .update(
      `${LANGAME_RUNTIME_TRUST_ENROLLMENT_CURRENT196_TRUST_DOMAIN}\nCANDIDATE_BUNDLE\n`,
      "utf8",
    )
    .update(canonicalStringify(serializableCandidateBundle(bundle)), "utf8")
    .digest("hex");
}

function normalizePayload(value) {
  const code = "CURRENT196_TRUST_ENROLLMENT_PAYLOAD_INVALID";
  const payload = exactRecord(value, PAYLOAD_KEYS, code);
  const digests = [
    payload.bootstrapPublicKeyFingerprint,
    payload.candidateBundleDigest,
    payload.ceremonyTranscriptDigest,
    payload.challengeDigest,
    payload.clusterIdentityDigest,
    payload.initialRevocationStateDigest,
    payload.primaryApprovalDigest,
    payload.releaseArtifactDigest,
    payload.runtimeConfigDigest,
    payload.secondaryApprovalDigest,
    payload.verifierArtifactDigest,
  ];
  if (
    payload.contract !== LANGAME_RUNTIME_TRUST_ENROLLMENT_CURRENT196_CONTRACT ||
    payload.purpose !== LANGAME_RUNTIME_TRUST_ENROLLMENT_CURRENT196_PURPOSE ||
    payload.trustDomain !==
      LANGAME_RUNTIME_TRUST_ENROLLMENT_CURRENT196_TRUST_DOMAIN ||
    payload.current193Contract !==
      LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_CONTRACT ||
    payload.current194Contract !==
      LANGAME_INITIAL_SYNC_RUNTIME_PROVIDER_CURRENT194_CONTRACT ||
    payload.current195Contract !==
      LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_CONTRACT ||
    payload.current195MigrationSha256 !==
      LANGAME_RUNTIME_TRUST_ENROLLMENT_CURRENT196_CURRENT195_MIGRATION_SHA256 ||
    !ID_PATTERN.test(payload.enrollmentId) ||
    !KEY_PATTERN.test(payload.bootstrapSigningKeyId) ||
    !DATABASE_PATTERN.test(payload.databaseName) ||
    !validOid(payload.databaseOid) ||
    !ROLE_PATTERN.test(payload.ownerRoleName) ||
    !validOid(payload.ownerRoleOid) ||
    !ROLE_PATTERN.test(payload.runtimeRoleName) ||
    !validOid(payload.runtimeRoleOid) ||
    payload.ownerRoleName === payload.runtimeRoleName ||
    payload.ownerRoleOid === payload.runtimeRoleOid ||
    !RELEASE_SHA_PATTERN.test(payload.releaseSha) ||
    payload.enrollmentGeneration !== 1 ||
    payload.priorEnrollmentDigest !== null ||
    !digests.every((digest) => SHA256_PATTERN.test(digest)) ||
    new Set(digests).size !== digests.length
  ) {
    fail(code);
  }
  return payload;
}

export function langameRuntimeTrustEnrollmentCurrent196PayloadDigest(payload) {
  return createHash("sha256")
    .update(
      `${LANGAME_RUNTIME_TRUST_ENROLLMENT_CURRENT196_TRUST_DOMAIN}\nPAYLOAD\n`,
      "utf8",
    )
    .update(canonicalStringify(payload), "utf8")
    .digest("hex");
}

function normalizeExpected(value) {
  const code = "CURRENT196_TRUST_ENROLLMENT_EXPECTED_INVALID";
  const expected = exactRecord(value, EXPECTED_KEYS, code);
  if (
    !SHA256_PATTERN.test(expected.candidateBundleDigest) ||
    !SHA256_PATTERN.test(expected.clusterIdentityDigest) ||
    !DATABASE_PATTERN.test(expected.databaseName) ||
    !validOid(expected.databaseOid) ||
    !ROLE_PATTERN.test(expected.ownerRoleName) ||
    !validOid(expected.ownerRoleOid) ||
    !ROLE_PATTERN.test(expected.runtimeRoleName) ||
    !validOid(expected.runtimeRoleOid) ||
    expected.ownerRoleName === expected.runtimeRoleName ||
    expected.ownerRoleOid === expected.runtimeRoleOid ||
    !RELEASE_SHA_PATTERN.test(expected.releaseSha) ||
    !SHA256_PATTERN.test(expected.releaseArtifactDigest) ||
    !SHA256_PATTERN.test(expected.runtimeConfigDigest) ||
    !SHA256_PATTERN.test(expected.verifierArtifactDigest)
  ) {
    fail(code);
  }
  return expected;
}

function assertExpectedBinding(payload, expected) {
  for (const key of EXPECTED_KEYS) {
    if (payload[key] !== expected[key]) {
      fail("CURRENT196_TRUST_ENROLLMENT_EXPECTED_BINDING_INVALID");
    }
  }
}

function selectBootstrapRoot(rootsValue, keyId, nowMs) {
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
      fail("CURRENT196_TRUST_ENROLLMENT_ROOTS_INVALID");
    }
    rootKeys.sort(compareStrings);
    roots = exactRecord(
      rootsValue,
      rootKeys,
      "CURRENT196_TRUST_ENROLLMENT_ROOTS_INVALID",
    );
  } catch {
    fail("CURRENT196_TRUST_ENROLLMENT_ROOTS_INVALID");
  }
  if (!Object.hasOwn(roots, keyId)) {
    fail("CURRENT196_TRUST_ENROLLMENT_BOOTSTRAP_ROOT_NOT_TRUSTED");
  }
  const root = exactRecord(
    roots[keyId],
    BOOTSTRAP_ROOT_KEYS,
    "CURRENT196_TRUST_ENROLLMENT_BOOTSTRAP_ROOT_INVALID",
  );
  const notBeforeMs = canonicalEpoch(
    root.notBefore,
    "CURRENT196_TRUST_ENROLLMENT_BOOTSTRAP_ROOT_INVALID",
  );
  const notAfterMs = canonicalEpoch(
    root.notAfter,
    "CURRENT196_TRUST_ENROLLMENT_BOOTSTRAP_ROOT_INVALID",
  );
  if (
    root.algorithm !== LANGAME_RUNTIME_TRUST_ENROLLMENT_CURRENT196_ALGORITHM ||
    root.keyId !== keyId ||
    root.purpose !== LANGAME_RUNTIME_TRUST_ENROLLMENT_CURRENT196_PURPOSE ||
    root.trustDomain !==
      LANGAME_RUNTIME_TRUST_ENROLLMENT_CURRENT196_TRUST_DOMAIN ||
    root.status !== "ACTIVE" ||
    root.publicKeyFingerprint !==
      langameRuntimeTrustEnrollmentCurrent196PublicKeyFingerprint(
        root.publicKeyPem,
      ) ||
    nowMs < notBeforeMs ||
    nowMs >= notAfterMs
  ) {
    fail("CURRENT196_TRUST_ENROLLMENT_BOOTSTRAP_ROOT_NOT_TRUSTED");
  }
  return Object.freeze({ ...root, notAfterMs, notBeforeMs });
}

function verifyWithRoots(envelopeValue, expectedValue, roots, now) {
  const envelope = exactRecord(
    envelopeValue,
    ENVELOPE_KEYS,
    "CURRENT196_TRUST_ENROLLMENT_ENVELOPE_INVALID",
  );
  const candidateBundle = normalizeCandidateBundle(envelope.candidateBundle);
  const payload = normalizePayload(envelope.payload);
  const expected = normalizeExpected(expectedValue);
  const bundleDigest =
    langameRuntimeTrustEnrollmentCurrent196CandidateBundleDigest(
      envelope.candidateBundle,
    );
  if (
    payload.candidateBundleDigest !== bundleDigest ||
    expected.candidateBundleDigest !== bundleDigest
  ) {
    fail("CURRENT196_TRUST_ENROLLMENT_CANDIDATE_BINDING_INVALID");
  }
  assertExpectedBinding(payload, expected);
  const nowMs = canonicalEpoch(now, "CURRENT196_TRUST_ENROLLMENT_NOW_INVALID");
  if (
    envelope.signatureAlgorithm !==
      LANGAME_RUNTIME_TRUST_ENROLLMENT_CURRENT196_ALGORITHM ||
    envelope.signingKeyId !== payload.bootstrapSigningKeyId ||
    envelope.publicKeyFingerprint !== payload.bootstrapPublicKeyFingerprint ||
    !SHA256_PATTERN.test(envelope.payloadDigest) ||
    envelope.payloadDigest !==
      langameRuntimeTrustEnrollmentCurrent196PayloadDigest(payload)
  ) {
    fail("CURRENT196_TRUST_ENROLLMENT_BINDING_INVALID");
  }
  const bootstrapRoot = selectBootstrapRoot(
    roots,
    payload.bootstrapSigningKeyId,
    nowMs,
  );
  if (
    bootstrapRoot.publicKeyFingerprint !== payload.bootstrapPublicKeyFingerprint
  ) {
    fail("CURRENT196_TRUST_ENROLLMENT_BOOTSTRAP_ROOT_NOT_TRUSTED");
  }
  const issuedAtMs = canonicalEpoch(
    payload.issuedAt,
    "CURRENT196_TRUST_ENROLLMENT_TIMELINE_INVALID",
  );
  const validUntilMs = canonicalEpoch(
    payload.validUntil,
    "CURRENT196_TRUST_ENROLLMENT_TIMELINE_INVALID",
  );
  if (
    issuedAtMs >
      nowMs + LANGAME_RUNTIME_TRUST_ENROLLMENT_CURRENT196_MAX_SKEW_MS ||
    issuedAtMs < bootstrapRoot.notBeforeMs ||
    issuedAtMs >= bootstrapRoot.notAfterMs ||
    validUntilMs <= issuedAtMs ||
    validUntilMs <= nowMs ||
    validUntilMs > bootstrapRoot.notAfterMs ||
    validUntilMs - issuedAtMs >
      LANGAME_RUNTIME_TRUST_ENROLLMENT_CURRENT196_MAX_LIFETIME_MS
  ) {
    fail("CURRENT196_TRUST_ENROLLMENT_TIMELINE_INVALID");
  }
  for (const candidateRoot of [
    candidateBundle.runtimeAttestationRoot,
    candidateBundle.runtimeRevokeIntentRoot,
  ]) {
    if (
      candidateRoot.notBeforeMs > issuedAtMs ||
      candidateRoot.notAfterMs <= validUntilMs ||
      candidateRoot.publicKeyFingerprint ===
        payload.bootstrapPublicKeyFingerprint ||
      candidateRoot.keyId === payload.bootstrapSigningKeyId
    ) {
      fail("CURRENT196_TRUST_ENROLLMENT_CANDIDATE_ROOT_TIMELINE_INVALID");
    }
  }
  if (
    candidateBundle.tlsPeerPinset.notBeforeMs > issuedAtMs ||
    candidateBundle.tlsPeerPinset.notAfterMs <= validUntilMs
  ) {
    fail("CURRENT196_TRUST_ENROLLMENT_TLS_PINSET_TIMELINE_INVALID");
  }
  if (
    typeof envelope.signature !== "string" ||
    !SIGNATURE_PATTERN.test(envelope.signature)
  ) {
    fail("CURRENT196_TRUST_ENROLLMENT_SIGNATURE_INVALID");
  }
  const signature = Buffer.from(envelope.signature, "base64url");
  if (
    signature.length !== 64 ||
    !verifySignature(
      null,
      Buffer.from(canonicalStringify(payload), "utf8"),
      createPublicKey(bootstrapRoot.publicKeyPem),
      signature,
    )
  ) {
    fail("CURRENT196_TRUST_ENROLLMENT_SIGNATURE_INVALID");
  }
  const verified = Object.freeze({
    authorization: false,
    bootstrapPublicKeyFingerprint: payload.bootstrapPublicKeyFingerprint,
    bootstrapSigningKeyId: payload.bootstrapSigningKeyId,
    canConnectNetwork: false,
    canEnrollProductionRoots: false,
    canMutate: false,
    candidateBundleDigest: bundleDigest,
    clusterIdentityDigest: payload.clusterIdentityDigest,
    contract: LANGAME_RUNTIME_TRUST_ENROLLMENT_CURRENT196_CONTRACT,
    databaseName: payload.databaseName,
    databaseOid: payload.databaseOid,
    enrollmentGeneration: payload.enrollmentGeneration,
    enrollmentId: payload.enrollmentId,
    issuedAt: payload.issuedAt,
    ownerRoleName: payload.ownerRoleName,
    ownerRoleOid: payload.ownerRoleOid,
    productionExecutionAllowed: false,
    enrollmentPayloadDigest: envelope.payloadDigest,
    releaseArtifactDigest: payload.releaseArtifactDigest,
    releaseSha: payload.releaseSha,
    runtimeAttestationKeyId: candidateBundle.runtimeAttestationRoot.keyId,
    runtimeAttestationPublicKeyFingerprint:
      candidateBundle.runtimeAttestationRoot.publicKeyFingerprint,
    runtimeConfigDigest: payload.runtimeConfigDigest,
    runtimeRevokeIntentKeyId: candidateBundle.runtimeRevokeIntentRoot.keyId,
    runtimeRevokeIntentPublicKeyFingerprint:
      candidateBundle.runtimeRevokeIntentRoot.publicKeyFingerprint,
    runtimeRoleName: payload.runtimeRoleName,
    runtimeRoleOid: payload.runtimeRoleOid,
    sharedBetaAccess: false,
    status: "VERIFIED_NONAUTHORIZING_PROPOSAL",
    testAccessAuthorized: false,
    tlsCaCertificateSha256: candidateBundle.tlsPeerPinset.caCertificateSha256,
    tlsEndpointHost: candidateBundle.tlsPeerPinset.endpointHost,
    tlsEndpointPort: candidateBundle.tlsPeerPinset.endpointPort,
    tlsLeafCertificateSha256:
      candidateBundle.tlsPeerPinset.expectedLeafCertificateSha256,
    tlsLeafSpkiSha256: candidateBundle.tlsPeerPinset.expectedLeafSpkiSha256,
    tlsLeafNotAfter: candidateBundle.tlsPeerPinset.leafNotAfter,
    tlsLeafNotBefore: candidateBundle.tlsPeerPinset.leafNotBefore,
    tlsMinimumProtocol: candidateBundle.tlsPeerPinset.minimumProtocol,
    tlsRejectUnauthorized: candidateBundle.tlsPeerPinset.rejectUnauthorized,
    tlsServerName: candidateBundle.tlsPeerPinset.serverName,
    validUntil: payload.validUntil,
    verificationMode: "SYNTHETIC_CI",
    verifierArtifactDigest: payload.verifierArtifactDigest,
  });
  VERIFIED_PROPOSALS.add(verified);
  return verified;
}

export function verifyPinnedLangameRuntimeTrustEnrollmentCurrent196() {
  if (arguments.length !== 1) {
    fail("CURRENT196_TRUST_ENROLLMENT_ARGUMENTS_INVALID");
  }
  // Deliberately no production context injection surface exists in CURRENT196.
  // A successor must bind a branded protected-acquisition receipt before a
  // reviewed immutable bootstrap root can ever be populated.
  fail("CURRENT196_TRUST_ENROLLMENT_PRODUCTION_ROOTS_EMPTY");
}

export function verifySyntheticLangameRuntimeTrustEnrollmentCurrent196(
  envelope,
  expected,
  roots,
  contextValue,
  now,
) {
  if (arguments.length !== 5) {
    fail("CURRENT196_TRUST_ENROLLMENT_ARGUMENTS_INVALID");
  }
  const normalizedExpected = normalizeExpected(expected);
  const context = exactRecord(
    contextValue,
    CONTEXT_KEYS,
    "CURRENT196_TRUST_ENROLLMENT_SYNTHETIC_DENIED",
  );
  if (
    context.environment !== "ci" ||
    context.explicitConfirmation !==
      LANGAME_RUNTIME_TRUST_ENROLLMENT_CURRENT196_SYNTHETIC_CONFIRMATION ||
    !LOOPBACK_HOSTS.has(context.hostname) ||
    context.databaseName !== normalizedExpected.databaseName ||
    !/_ci$/u.test(context.databaseName)
  ) {
    fail("CURRENT196_TRUST_ENROLLMENT_SYNTHETIC_DENIED");
  }
  return verifyWithRoots(envelope, normalizedExpected, roots, now);
}

export function isVerifiedLangameRuntimeTrustEnrollmentCurrent196(value) {
  return (
    arguments.length === 1 &&
    value !== null &&
    typeof value === "object" &&
    VERIFIED_PROPOSALS.has(value)
  );
}

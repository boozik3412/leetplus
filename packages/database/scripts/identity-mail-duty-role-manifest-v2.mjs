import {
  createHash,
  createPublicKey,
  verify as verifySignature,
} from "node:crypto";
import { types as utilTypes } from "node:util";

import { canonicalStringify } from "./staff-task-integrity-canonical-json.mjs";

export const IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_SIGNATURE_ALGORITHM =
  "Ed25519";
export const IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_KIND =
  "LEETPLUS_IDENTITY_MAIL_DUTY_ROLE_MANIFEST";
export const IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_CONTRACT =
  "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2";
export const IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_TRUST_DOMAIN =
  "LEETPLUS_IDENTITY_MAIL_DUTY_ROLE_AUTHORITY_V2";
export const IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_PURPOSE =
  "IDENTITY_MAIL_DUTY_ROLE_BINDING_V2";
export const IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_PROFILE =
  "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_PROFILE_V2";
export const IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_GRANTS_PROFILE =
  "IDENTITY_MAIL_DUTY_GRANTS_PG16_V1";
export const IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_APPLICATION_CONTRACT =
  "IDENTITY_MAIL_TENANT_ENROLLMENT_MANIFEST_BOUND_V2";
export const IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_APPLICATION_KIND =
  "APPLICATION_BOUNDARY";
export const IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_APPLICATION_ORDINAL = 185;
export const IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_MAX_LIFETIME_MS =
  15 * 60 * 1_000;
export const IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_MAX_CLOCK_SKEW_MS =
  60 * 1_000;
export const IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_SYNTHETIC_CONFIRMATION =
  "allow-synthetic-identity-mail-duty-role-manifest-v2-loopback-ci";

export const IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_PREDECESSOR = Object.freeze({
  count: 184,
  head: "20260802020000_identity_mail_worker_v2_lost_response_replay",
  headChecksum:
    "d889537c9c0e6c8d6862062fd5cd1a45f5f26409993cb3cbba64446dfe71c424",
  manifestDigest:
    "9da93df51df3945b3219409f06118134712edb2a96543d1eb183217da9767819",
});

// Empty by design. A production V2 authority requires a separately reviewed
// root-history ceremony; callers and environment variables cannot add roots.
export const PINNED_IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_ROOTS =
  Object.freeze({});

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SHA_256_PATTERN = /^[0-9a-f]{64}$/u;
const RELEASE_SHA_PATTERN = /^[0-9a-f]{40}$/u;
const KEY_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{2,63}$/u;
const DATABASE_NAME_PATTERN = /^[a-z][a-z0-9_]{0,62}$/u;
const ROLE_NAME_PATTERN = /^[a-z_][a-z0-9_]{2,62}$/u;
const SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{86}$/u;
const CI_DATABASE_PATTERN = /(?:^|[_-])(?:ci|test|testing)(?:$|[_-])/u;
const PRODUCTION_DATABASE_PATTERN =
  /(?:^|[_-])(?:live|prod|production)(?:$|[_-])/u;
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const SYSTEM_DATABASES = new Set(["postgres", "template0", "template1"]);
const SYSTEM_ROLES = new Set([
  "current_role",
  "current_user",
  "none",
  "postgres",
  "public",
  "session_user",
]);
const SYSTEM_ROLE_PREFIXES = Object.freeze([
  "azure_",
  "cloudsql",
  "pg_",
  "rds_",
]);
const MAX_POSTGRES_OID = 4_294_967_295;
const MAX_POSTGRES_INTEGER = 2_147_483_647;

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
    "actualContextDigest",
    "authorization",
    "canMutate",
    "canSend",
    "chain",
    "contract",
    "database",
    "deploymentMarkerDigest",
    "deploymentMarkerId",
    "exactGrants",
    "issuedAt",
    "kind",
    "manifestId",
    "manifestRevision",
    "profile",
    "publicKeyFingerprint",
    "purpose",
    "roles",
    "schemaVersion",
    "signingKeyId",
    "trustDomain",
    "validUntil",
  ].sort(),
);
const DATABASE_KEYS = Object.freeze(["identityDigest", "name", "oid"].sort());
const ROLES_KEYS = Object.freeze(["coordinator", "worker"].sort());
const ROLE_KEYS = Object.freeze(["name", "oid"].sort());
const EXACT_GRANTS_KEYS = Object.freeze(["digest", "profile"].sort());
const CHAIN_KEYS = Object.freeze(["head", "predecessor"].sort());
const PREDECESSOR_KEYS = Object.freeze(
  ["count", "head", "headChecksum", "manifestDigest"].sort(),
);
const HEAD_KEYS = Object.freeze(
  ["artifactSha256", "contract", "kind", "ordinal", "releaseSha"].sort(),
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
const SYNTHETIC_CONTEXT_KEYS = Object.freeze(
  [
    "databaseName",
    "environment",
    "explicitConfirmation",
    "hostname",
    "nodeEnv",
  ].sort(),
);

const VERIFIED_PINNED_MANIFESTS_V2 = new WeakSet();
const VERIFIED_SYNTHETIC_MANIFESTS_V2 = new WeakSet();
const VERIFIED_PINNED_PAYLOADS_V2 = new WeakMap();
const VERIFIED_PINNED_EVIDENCE_V2 = new WeakMap();

export class IdentityMailDutyRoleManifestV2Error extends Error {
  constructor(reasonCode) {
    super("The identity-mail duty-role Manifest V2 contract rejected the input.");
    this.name = "IdentityMailDutyRoleManifestV2Error";
    this.code = reasonCode;
    this.reasonCode = reasonCode;
    this.exitCode = 3;
    this.safeContractError = true;
  }
}

function fail(reasonCode) {
  throw new IdentityMailDutyRoleManifestV2Error(reasonCode);
}

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function exactDataRecord(value, expectedKeys, reasonCode) {
  let invalidShape;
  try {
    invalidShape =
      value === null ||
      typeof value !== "object" ||
      utilTypes.isProxy(value) ||
      Array.isArray(value);
  } catch {
    fail(reasonCode);
  }
  if (invalidShape) fail(reasonCode);
  let prototype;
  let descriptors;
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    fail(reasonCode);
  }
  if (prototype !== Object.prototype && prototype !== null) fail(reasonCode);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((key) => typeof key !== "string")) fail(reasonCode);
  keys.sort(compareStrings);
  if (
    keys.length !== expectedKeys.length ||
    keys.some((key, index) => key !== expectedKeys[index]) ||
    keys.some((key) => {
      const descriptor = descriptors[key];
      return !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true;
    })
  ) {
    fail(reasonCode);
  }
  const snapshot = Object.create(null);
  for (const key of expectedKeys) snapshot[key] = descriptors[key].value;
  return Object.freeze(snapshot);
}

function registryEntries(value) {
  let invalidShape;
  try {
    invalidShape =
      value === null ||
      typeof value !== "object" ||
      utilTypes.isProxy(value) ||
      Array.isArray(value);
  } catch {
    fail("IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_ROOTS_INVALID");
  }
  if (invalidShape) {
    fail("IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_ROOTS_INVALID");
  }
  let prototype;
  let descriptors;
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    fail("IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_ROOTS_INVALID");
  }
  if (prototype !== Object.prototype && prototype !== null) {
    fail("IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_ROOTS_INVALID");
  }
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.some((key) => typeof key !== "string") ||
    keys.some((key) => {
      const descriptor = descriptors[key];
      return !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true;
    })
  ) {
    fail("IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_ROOTS_INVALID");
  }
  return keys.sort(compareStrings).map((key) => [key, descriptors[key].value]);
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function isUuid(value) {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isDigest(value) {
  return typeof value === "string" && SHA_256_PATTERN.test(value);
}

function validOid(value) {
  return Number.isSafeInteger(value) && value >= 1 && value <= MAX_POSTGRES_OID;
}

function validDatabaseName(value) {
  return (
    typeof value === "string" &&
    DATABASE_NAME_PATTERN.test(value) &&
    !SYSTEM_DATABASES.has(value)
  );
}

function validRoleName(value) {
  return (
    typeof value === "string" &&
    ROLE_NAME_PATTERN.test(value) &&
    !SYSTEM_ROLES.has(value) &&
    !SYSTEM_ROLE_PREFIXES.some((prefix) => value.startsWith(prefix))
  );
}

function canonicalTimestamp(value, reasonCode) {
  if (typeof value !== "string") fail(reasonCode);
  const epoch = Date.parse(value);
  if (!Number.isSafeInteger(epoch) || new Date(epoch).toISOString() !== value) {
    fail(reasonCode);
  }
  return epoch;
}

function normalizeDatabase(value) {
  const database = exactDataRecord(
    value,
    DATABASE_KEYS,
    "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_DATABASE_INVALID",
  );
  if (
    !validDatabaseName(database.name) ||
    !validOid(database.oid) ||
    !isDigest(database.identityDigest)
  ) {
    fail("IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_DATABASE_INVALID");
  }
  return deepFreeze({ ...database });
}

function normalizeRole(value) {
  const role = exactDataRecord(
    value,
    ROLE_KEYS,
    "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_ROLES_INVALID",
  );
  if (!validRoleName(role.name) || !validOid(role.oid)) {
    fail("IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_ROLES_INVALID");
  }
  return deepFreeze({ ...role });
}

function normalizeRoles(value) {
  const roles = exactDataRecord(
    value,
    ROLES_KEYS,
    "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_ROLES_INVALID",
  );
  const coordinator = normalizeRole(roles.coordinator);
  const worker = normalizeRole(roles.worker);
  if (coordinator.name === worker.name || coordinator.oid === worker.oid) {
    fail("IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_ROLES_INVALID");
  }
  return deepFreeze({ coordinator, worker });
}

function normalizeExactGrants(value) {
  const grants = exactDataRecord(
    value,
    EXACT_GRANTS_KEYS,
    "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_GRANTS_INVALID",
  );
  if (
    grants.profile !== IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_GRANTS_PROFILE ||
    !isDigest(grants.digest)
  ) {
    fail("IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_GRANTS_INVALID");
  }
  return deepFreeze({ ...grants });
}

function normalizeChain(value) {
  const chain = exactDataRecord(
    value,
    CHAIN_KEYS,
    "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_CHAIN_INVALID",
  );
  const predecessor = exactDataRecord(
    chain.predecessor,
    PREDECESSOR_KEYS,
    "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_CHAIN_INVALID",
  );
  const head = exactDataRecord(
    chain.head,
    HEAD_KEYS,
    "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_CHAIN_INVALID",
  );
  if (
    canonicalStringify(predecessor) !==
      canonicalStringify(IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_PREDECESSOR) ||
    head.ordinal !== IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_APPLICATION_ORDINAL ||
    head.kind !== IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_APPLICATION_KIND ||
    head.contract !== IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_APPLICATION_CONTRACT ||
    typeof head.releaseSha !== "string" ||
    !RELEASE_SHA_PATTERN.test(head.releaseSha) ||
    !isDigest(head.artifactSha256)
  ) {
    fail("IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_CHAIN_INVALID");
  }
  return deepFreeze({ head: { ...head }, predecessor: { ...predecessor } });
}

function normalizePayload(value) {
  const payload = exactDataRecord(
    value,
    PAYLOAD_KEYS,
    "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_PAYLOAD_INVALID",
  );
  const database = normalizeDatabase(payload.database);
  const roles = normalizeRoles(payload.roles);
  const exactGrants = normalizeExactGrants(payload.exactGrants);
  const chain = normalizeChain(payload.chain);
  // Timestamps are rejected before payload digest/signature work.
  canonicalTimestamp(
    payload.issuedAt,
    "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_TIMELINE_INVALID",
  );
  canonicalTimestamp(
    payload.validUntil,
    "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_TIMELINE_INVALID",
  );
  if (
    !isDigest(payload.actualContextDigest) ||
    !isUuid(payload.deploymentMarkerId) ||
    !isDigest(payload.deploymentMarkerDigest)
  ) {
    fail("IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_DEPLOYMENT_BINDING_INVALID");
  }
  if (
    payload.schemaVersion !== 2 ||
    payload.kind !== IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_KIND ||
    payload.contract !== IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_CONTRACT ||
    payload.trustDomain !== IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_TRUST_DOMAIN ||
    payload.purpose !== IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_PURPOSE ||
    payload.profile !== IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_PROFILE ||
    !isUuid(payload.manifestId) ||
    !Number.isSafeInteger(payload.manifestRevision) ||
    payload.manifestRevision < 1 ||
    payload.manifestRevision > MAX_POSTGRES_INTEGER ||
    payload.authorization !== false ||
    payload.canMutate !== false ||
    payload.canSend !== false ||
    typeof payload.signingKeyId !== "string" ||
    !KEY_ID_PATTERN.test(payload.signingKeyId) ||
    !isDigest(payload.publicKeyFingerprint)
  ) {
    fail("IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_CONTRACT_INVALID");
  }
  return deepFreeze({ ...payload, chain, database, exactGrants, roles });
}

export function identityMailDutyRoleManifestV2PayloadDigest(payload) {
  return createHash("sha256")
    .update(canonicalStringify(payload), "utf8")
    .digest("hex");
}

export function identityMailDutyRoleManifestV2PublicKeyFingerprint(publicKey) {
  let key;
  try {
    key = createPublicKey(publicKey);
  } catch {
    fail("IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_ROOT_INVALID");
  }
  if (key.asymmetricKeyType !== "ed25519") {
    fail("IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_ROOT_INVALID");
  }
  return createHash("sha256")
    .update(key.export({ type: "spki", format: "der" }))
    .digest("hex");
}

function validateRootRegistry(roots) {
  const registry = Object.create(null);
  const fingerprints = new Set();
  for (const [registryKey, candidate] of registryEntries(roots)) {
    const root = exactDataRecord(
      candidate,
      ROOT_KEYS,
      "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_ROOT_INVALID",
    );
    if (typeof root.publicKeyPem !== "string") {
      fail("IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_ROOT_INVALID");
    }
    let canonicalPem;
    try {
      canonicalPem = createPublicKey(root.publicKeyPem).export({
        type: "spki",
        format: "pem",
      });
    } catch {
      fail("IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_ROOT_INVALID");
    }
    const fingerprint =
      identityMailDutyRoleManifestV2PublicKeyFingerprint(root.publicKeyPem);
    const notBefore = canonicalTimestamp(
      root.notBefore,
      "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_ROOT_INVALID",
    );
    const notAfter = canonicalTimestamp(
      root.notAfter,
      "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_ROOT_INVALID",
    );
    if (
      !KEY_ID_PATTERN.test(registryKey) ||
      root.keyId !== registryKey ||
      root.algorithm !== IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_SIGNATURE_ALGORITHM ||
      root.trustDomain !== IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_TRUST_DOMAIN ||
      root.purpose !== IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_PURPOSE ||
      root.profile !== IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_PROFILE ||
      root.status !== "ACTIVE" ||
      root.publicKeyFingerprint !== fingerprint ||
      canonicalPem !== root.publicKeyPem ||
      notAfter <= notBefore ||
      fingerprints.has(fingerprint)
    ) {
      fail("IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_ROOT_INVALID");
    }
    fingerprints.add(fingerprint);
    registry[registryKey] = deepFreeze({ ...root });
  }
  return Object.freeze(registry);
}

function selectRoot(roots, envelope, nowMs) {
  const registry = validateRootRegistry(roots);
  const root = Object.hasOwn(registry, envelope.signingKeyId)
    ? registry[envelope.signingKeyId]
    : undefined;
  if (!root) {
    fail(
      Object.keys(registry).length === 0
        ? "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_AUTHORITY_NOT_ENROLLED"
        : "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_AUTHORITY_KEY_NOT_TRUSTED",
    );
  }
  if (
    root.publicKeyFingerprint !== envelope.publicKeyFingerprint ||
    nowMs < Date.parse(root.notBefore) ||
    nowMs >= Date.parse(root.notAfter)
  ) {
    fail("IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_AUTHORITY_KEY_NOT_TRUSTED");
  }
  return root;
}

function decodeSignature(value) {
  if (typeof value !== "string" || !SIGNATURE_PATTERN.test(value)) {
    fail("IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_SIGNATURE_INVALID");
  }
  const signature = Buffer.from(value, "base64url");
  if (signature.length !== 64 || signature.toString("base64url") !== value) {
    fail("IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_SIGNATURE_INVALID");
  }
  return signature;
}

function validateTimeline(payload, root, nowMs) {
  const issuedAt = Date.parse(payload.issuedAt);
  const validUntil = Date.parse(payload.validUntil);
  const rootNotBefore = Date.parse(root.notBefore);
  const rootNotAfter = Date.parse(root.notAfter);
  if (
    issuedAt > nowMs + IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_MAX_CLOCK_SKEW_MS ||
    issuedAt < rootNotBefore ||
    issuedAt >= rootNotAfter ||
    validUntil <= issuedAt ||
    validUntil <= nowMs ||
    validUntil > rootNotAfter ||
    validUntil - issuedAt > IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_MAX_LIFETIME_MS
  ) {
    fail("IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_TIMELINE_INVALID");
  }
}

function verifyAgainstRoots(envelopeValue, roots, context, now, mode) {
  const envelope = exactDataRecord(
    envelopeValue,
    ENVELOPE_KEYS,
    "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_ENVELOPE_INVALID",
  );
  const payload = normalizePayload(envelope.payload);
  const nowMs = canonicalTimestamp(
    now,
    "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_CURRENT_TIME_INVALID",
  );
  if (mode === "SYNTHETIC") {
    const synthetic = exactDataRecord(
      context,
      SYNTHETIC_CONTEXT_KEYS,
      "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_SYNTHETIC_CONTEXT_DENIED",
    );
    if (
      synthetic.explicitConfirmation !==
        IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_SYNTHETIC_CONFIRMATION ||
      synthetic.environment !== "ci" ||
      synthetic.nodeEnv !== "test" ||
      typeof synthetic.hostname !== "string" ||
      synthetic.hostname !== synthetic.hostname.toLowerCase() ||
      !LOOPBACK_HOSTS.has(synthetic.hostname) ||
      String(process.env.NODE_ENV ?? "").toLowerCase() !== "test" ||
      synthetic.databaseName !== payload.database.name ||
      !CI_DATABASE_PATTERN.test(synthetic.databaseName) ||
      PRODUCTION_DATABASE_PATTERN.test(synthetic.databaseName)
    ) {
      fail("IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_SYNTHETIC_CONTEXT_DENIED");
    }
  }
  if (
    envelope.signatureAlgorithm !==
      IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_SIGNATURE_ALGORITHM ||
    typeof envelope.signingKeyId !== "string" ||
    !KEY_ID_PATTERN.test(envelope.signingKeyId) ||
    !isDigest(envelope.publicKeyFingerprint) ||
    !isDigest(envelope.payloadDigest) ||
    envelope.signingKeyId !== payload.signingKeyId ||
    envelope.publicKeyFingerprint !== payload.publicKeyFingerprint
  ) {
    fail("IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_ENVELOPE_BINDING_INVALID");
  }
  const payloadCanonicalJson = canonicalStringify(payload);
  if (
    createHash("sha256").update(payloadCanonicalJson, "utf8").digest("hex") !==
    envelope.payloadDigest
  ) {
    fail("IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_ENVELOPE_BINDING_INVALID");
  }
  const root = selectRoot(roots, envelope, nowMs);
  validateTimeline(payload, root, nowMs);
  const signature = decodeSignature(envelope.signature);
  if (
    !verifySignature(
      null,
      Buffer.from(payloadCanonicalJson, "utf8"),
      createPublicKey(root.publicKeyPem),
      signature,
    )
  ) {
    fail("IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_SIGNATURE_INVALID");
  }
  const verified = deepFreeze({
    schemaVersion: 2,
    verificationMode: mode,
    manifestId: payload.manifestId,
    manifestRevision: payload.manifestRevision,
    payloadDigest: envelope.payloadDigest,
    databaseName: payload.database.name,
    databaseOid: payload.database.oid,
    databaseIdentityDigest: payload.database.identityDigest,
    deploymentMarkerId: payload.deploymentMarkerId,
    deploymentMarkerDigest: payload.deploymentMarkerDigest,
    actualContextDigest: payload.actualContextDigest,
    coordinatorRoleName: payload.roles.coordinator.name,
    coordinatorRoleOid: payload.roles.coordinator.oid,
    workerRoleName: payload.roles.worker.name,
    workerRoleOid: payload.roles.worker.oid,
    exactGrantsProfile: payload.exactGrants.profile,
    exactGrantsDigest: payload.exactGrants.digest,
    applicationContract: payload.chain.head.contract,
    applicationReleaseSha: payload.chain.head.releaseSha,
    applicationArtifactSha256: payload.chain.head.artifactSha256,
    predecessorManifestDigest: payload.chain.predecessor.manifestDigest,
    signingKeyId: envelope.signingKeyId,
    publicKeyFingerprint: envelope.publicKeyFingerprint,
    issuedAt: payload.issuedAt,
    validUntil: payload.validUntil,
    verifiedAt: new Date(nowMs).toISOString(),
    authorization: false,
    canMutate: false,
    canSend: false,
  });
  if (mode === "PINNED") {
    const evidence = deepFreeze({
      schemaVersion: 2,
      contract: payload.contract,
      trustDomain: payload.trustDomain,
      purpose: payload.purpose,
      profile: payload.profile,
      payloadCanonicalJson,
      payloadDigest: envelope.payloadDigest,
      signatureBase64url: signature.toString("base64url"),
      signatureAlgorithm: envelope.signatureAlgorithm,
      signingKeyId: envelope.signingKeyId,
      publicKeyFingerprint: envelope.publicKeyFingerprint,
      issuedAt: payload.issuedAt,
      validUntil: payload.validUntil,
    });
    VERIFIED_PINNED_MANIFESTS_V2.add(verified);
    VERIFIED_PINNED_PAYLOADS_V2.set(verified, payload);
    VERIFIED_PINNED_EVIDENCE_V2.set(verified, evidence);
  } else {
    VERIFIED_SYNTHETIC_MANIFESTS_V2.add(verified);
  }
  return verified;
}

export function verifyPinnedIdentityMailDutyRoleManifestV2Envelope(envelope) {
  if (arguments.length !== 1) {
    fail("IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_ARGUMENTS_INVALID");
  }
  return verifyAgainstRoots(
    envelope,
    PINNED_IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_ROOTS,
    undefined,
    new Date().toISOString(),
    "PINNED",
  );
}

export function verifySyntheticIdentityMailDutyRoleManifestV2Envelope(
  envelope,
  roots,
  syntheticContext,
  now,
) {
  if (arguments.length !== 4) {
    fail("IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_ARGUMENTS_INVALID");
  }
  return verifyAgainstRoots(envelope, roots, syntheticContext, now, "SYNTHETIC");
}

export function isVerifiedIdentityMailDutyRoleManifestV2(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    VERIFIED_PINNED_MANIFESTS_V2.has(value)
  );
}

export function isVerifiedSyntheticIdentityMailDutyRoleManifestV2(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    VERIFIED_SYNTHETIC_MANIFESTS_V2.has(value)
  );
}

function requirePinned(verified) {
  if (!isVerifiedIdentityMailDutyRoleManifestV2(verified)) {
    fail("IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_NOT_VERIFIED");
  }
}

export function identityMailDutyRoleManifestV2Payload(verified) {
  if (arguments.length !== 1) {
    fail("IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_ARGUMENTS_INVALID");
  }
  requirePinned(verified);
  return VERIFIED_PINNED_PAYLOADS_V2.get(verified);
}

export function identityMailDutyRoleManifestV2Evidence(verified) {
  if (arguments.length !== 1) {
    fail("IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_ARGUMENTS_INVALID");
  }
  requirePinned(verified);
  return VERIFIED_PINNED_EVIDENCE_V2.get(verified);
}

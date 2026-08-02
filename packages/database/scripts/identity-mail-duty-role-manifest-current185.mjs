import {
  createHash,
  createPublicKey,
  verify as verifySignature,
} from "node:crypto";

import { canonicalStringify } from "./staff-task-integrity-canonical-json.mjs";

export const IDENTITY_MAIL_DUTY_ROLE_MANIFEST_SIGNATURE_ALGORITHM = "Ed25519";
export const IDENTITY_MAIL_DUTY_ROLE_MANIFEST_KIND =
  "LEETPLUS_IDENTITY_MAIL_DUTY_ROLE_MANIFEST";
export const IDENTITY_MAIL_DUTY_ROLE_MANIFEST_CONTRACT =
  "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V1";
export const IDENTITY_MAIL_DUTY_ROLE_MANIFEST_TRUST_DOMAIN =
  "LEETPLUS_IDENTITY_MAIL_DUTY_ROLE_AUTHORITY_V1";
export const IDENTITY_MAIL_DUTY_ROLE_MANIFEST_PURPOSE =
  "IDENTITY_MAIL_DUTY_ROLE_BINDING";
export const IDENTITY_MAIL_DUTY_ROLE_MANIFEST_PROFILE =
  "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_PROFILE_V1";
export const IDENTITY_MAIL_DUTY_ROLE_GRANTS_PROFILE =
  "IDENTITY_MAIL_DUTY_GRANTS_PG16_V1";
export const IDENTITY_MAIL_DUTY_ROLE_MANIFEST_MAX_LIFETIME_MS =
  15 * 60 * 1_000;
export const IDENTITY_MAIL_DUTY_ROLE_MANIFEST_MAX_CLOCK_SKEW_MS = 60 * 1_000;
export const IDENTITY_MAIL_DUTY_ROLE_MANIFEST_SYNTHETIC_CONFIRMATION =
  "allow-synthetic-identity-mail-duty-role-manifest-loopback-ci";

export const IDENTITY_MAIL_DUTY_ROLE_MANIFEST_PREDECESSOR = Object.freeze({
  count: 184,
  head: "20260802020000_identity_mail_worker_v2_lost_response_replay",
  headChecksum:
    "d889537c9c0e6c8d6862062fd5cd1a45f5f26409993cb3cbba64446dfe71c424",
  manifestDigest:
    "9da93df51df3945b3219409f06118134712edb2a96543d1eb183217da9767819",
});

// This is the accepted baseline application boundary whose exact coordinator
// artifact is being authorized. It is deliberately not the Git commit that
// later adds this dormant verifier.
export const IDENTITY_MAIL_DUTY_ROLE_MANIFEST_HEAD = Object.freeze({
  ordinal: 185,
  kind: "APPLICATION_BOUNDARY",
  contract: "IDENTITY_MAIL_TENANT_ENROLLMENT_COORDINATOR_CURRENT185_V1",
  releaseSha: "5ee3228931f92d282f82a3607117f3955b973962",
  artifactSha256:
    "4b8f6087c286bfd3c3a9073ba1fe446331a58d87583831ca9d93d6aaa38709d6",
});

// Deliberately empty. Production trust requires a separately reviewed root
// enrollment and history ceremony. Callers and environment variables cannot
// inject roots into the pinned verification path.
export const PINNED_IDENTITY_MAIL_DUTY_ROLE_MANIFEST_ROOTS =
  Object.freeze({});

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SHA_256_PATTERN = /^[0-9a-f]{64}$/u;
const KEY_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{2,63}$/u;
const SAFE_POSTGRES_DATABASE_PATTERN = /^[a-z][a-z0-9_]{0,62}$/u;
const SAFE_POSTGRES_ROLE_PATTERN = /^[a-z_][a-z0-9_]{2,62}$/u;
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
    "authorization",
    "actualContextDigest",
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

const VERIFIED_PINNED_MANIFESTS = new WeakSet();
const VERIFIED_SYNTHETIC_MANIFESTS = new WeakSet();
const VERIFIED_PINNED_PAYLOADS = new WeakMap();

export class IdentityMailDutyRoleManifestError extends Error {
  constructor(reasonCode, message) {
    super(message);
    this.name = "IdentityMailDutyRoleManifestError";
    this.reasonCode = reasonCode;
    this.code = reasonCode;
    this.exitCode = 3;
    this.safeContractError = true;
  }
}

function fail(reasonCode, message) {
  throw new IdentityMailDutyRoleManifestError(reasonCode, message);
}

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function exactDataRecord(value, expectedKeys, reasonCode, message) {
  let invalidShape;
  try {
    invalidShape = !value || typeof value !== "object" || Array.isArray(value);
  } catch {
    fail(reasonCode, message);
  }
  if (invalidShape) {
    fail(reasonCode, message);
  }
  let prototype;
  let descriptors;
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    fail(reasonCode, message);
  }
  if (prototype !== Object.prototype && prototype !== null) {
    fail(reasonCode, message);
  }
  const actualKeys = Reflect.ownKeys(descriptors);
  if (actualKeys.some((key) => typeof key !== "string")) {
    fail(reasonCode, message);
  }
  actualKeys.sort(compareStrings);
  const wantedKeys = [...expectedKeys].sort(compareStrings);
  if (
    actualKeys.length !== wantedKeys.length ||
    actualKeys.some((key, index) => key !== wantedKeys[index]) ||
    actualKeys.some((key) => {
      const descriptor = descriptors[key];
      return !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true;
    })
  ) {
    fail(reasonCode, message);
  }
  const snapshot = Object.create(null);
  for (const key of wantedKeys) {
    snapshot[key] = descriptors[key].value;
  }
  return Object.freeze(snapshot);
}

function registryEntries(value) {
  let invalidShape;
  try {
    invalidShape = !value || typeof value !== "object" || Array.isArray(value);
  } catch {
    fail(
      "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_ROOTS_INVALID",
      "The duty-role authority registry is invalid.",
    );
  }
  if (invalidShape) {
    fail(
      "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_ROOTS_INVALID",
      "The duty-role authority registry is invalid.",
    );
  }
  let prototype;
  let descriptors;
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    fail(
      "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_ROOTS_INVALID",
      "The duty-role authority registry is invalid.",
    );
  }
  if (prototype !== Object.prototype && prototype !== null) {
    fail(
      "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_ROOTS_INVALID",
      "The duty-role authority registry is invalid.",
    );
  }
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.some((key) => typeof key !== "string") ||
    keys.some((key) => {
      const descriptor = descriptors[key];
      return !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true;
    })
  ) {
    fail(
      "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_ROOTS_INVALID",
      "The duty-role authority registry is invalid.",
    );
  }
  return keys.sort(compareStrings).map((key) => [key, descriptors[key].value]);
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

function validDigest(value) {
  return typeof value === "string" && SHA_256_PATTERN.test(value);
}

function validOid(value) {
  return Number.isSafeInteger(value) && value >= 1 && value <= MAX_POSTGRES_OID;
}

function validDatabaseName(value) {
  return (
    typeof value === "string" &&
    SAFE_POSTGRES_DATABASE_PATTERN.test(value) &&
    !SYSTEM_DATABASES.has(value)
  );
}

function validRoleName(value) {
  return (
    typeof value === "string" &&
    SAFE_POSTGRES_ROLE_PATTERN.test(value) &&
    !SYSTEM_ROLES.has(value) &&
    !SYSTEM_ROLE_PREFIXES.some((prefix) => value.startsWith(prefix))
  );
}

function normalizeDatabase(value) {
  const database = exactDataRecord(
    value,
    DATABASE_KEYS,
    "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_DATABASE_INVALID",
    "The duty-role database binding must be exact and data-only.",
  );
  if (
    !validDatabaseName(database.name) ||
    !validOid(database.oid) ||
    !validDigest(database.identityDigest)
  ) {
    fail(
      "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_DATABASE_INVALID",
      "The duty-role database binding failed its exact contract.",
    );
  }
  return Object.freeze({ ...database });
}

function normalizeRole(value) {
  const role = exactDataRecord(
    value,
    ROLE_KEYS,
    "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_ROLES_INVALID",
    "Each duty role must be exact and data-only.",
  );
  if (!validRoleName(role.name) || !validOid(role.oid)) {
    fail(
      "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_ROLES_INVALID",
      "A duty role failed its exact non-system role contract.",
    );
  }
  return Object.freeze({ ...role });
}

function normalizeRoles(value) {
  const roles = exactDataRecord(
    value,
    ROLES_KEYS,
    "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_ROLES_INVALID",
    "The duty-role binding must be exact and data-only.",
  );
  const coordinator = normalizeRole(roles.coordinator);
  const worker = normalizeRole(roles.worker);
  if (coordinator.name === worker.name || coordinator.oid === worker.oid) {
    fail(
      "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_ROLES_INVALID",
      "Coordinator and worker must be distinct database roles.",
    );
  }
  return Object.freeze({ coordinator, worker });
}

function normalizeExactGrants(value) {
  const exactGrants = exactDataRecord(
    value,
    EXACT_GRANTS_KEYS,
    "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_GRANTS_INVALID",
    "The exact-grants binding must be exact and data-only.",
  );
  if (
    exactGrants.profile !== IDENTITY_MAIL_DUTY_ROLE_GRANTS_PROFILE ||
    !validDigest(exactGrants.digest)
  ) {
    fail(
      "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_GRANTS_INVALID",
      "The exact-grants binding failed its contract.",
    );
  }
  return Object.freeze({ ...exactGrants });
}

function sameRecord(value, expected) {
  return canonicalStringify(value) === canonicalStringify(expected);
}

function normalizeChain(value) {
  const chain = exactDataRecord(
    value,
    CHAIN_KEYS,
    "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_CHAIN_INVALID",
    "The release chain must be exact and data-only.",
  );
  const predecessor = exactDataRecord(
    chain.predecessor,
    PREDECESSOR_KEYS,
    "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_CHAIN_INVALID",
    "The predecessor chain binding is invalid.",
  );
  const head = exactDataRecord(
    chain.head,
    HEAD_KEYS,
    "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_CHAIN_INVALID",
    "The CURRENT185 chain head binding is invalid.",
  );
  if (
    !sameRecord(predecessor, IDENTITY_MAIL_DUTY_ROLE_MANIFEST_PREDECESSOR) ||
    !sameRecord(head, IDENTITY_MAIL_DUTY_ROLE_MANIFEST_HEAD)
  ) {
    fail(
      "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_CHAIN_INVALID",
      "The manifest is not bound to the exact CURRENT184/185 chain.",
    );
  }
  return Object.freeze({
    head: Object.freeze({ ...head }),
    predecessor: Object.freeze({ ...predecessor }),
  });
}

function normalizePayload(value) {
  const payload = exactDataRecord(
    value,
    PAYLOAD_KEYS,
    "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_PAYLOAD_INVALID",
    "The signed duty-role manifest payload shape is invalid.",
  );
  const database = normalizeDatabase(payload.database);
  const roles = normalizeRoles(payload.roles);
  const exactGrants = normalizeExactGrants(payload.exactGrants);
  const chain = normalizeChain(payload.chain);
  canonicalIsoEpoch(
    payload.issuedAt,
    "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_TIMELINE_INVALID",
    "Manifest issue time",
  );
  canonicalIsoEpoch(
    payload.validUntil,
    "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_TIMELINE_INVALID",
    "Manifest validity end",
  );
  if (
    !validDigest(payload.actualContextDigest) ||
    typeof payload.deploymentMarkerId !== "string" ||
    !UUID_PATTERN.test(payload.deploymentMarkerId) ||
    !validDigest(payload.deploymentMarkerDigest)
  ) {
    fail(
      "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_DEPLOYMENT_BINDING_INVALID",
      "The duty-role deployment and actual-context binding is invalid.",
    );
  }
  if (
    payload.schemaVersion !== 1 ||
    payload.kind !== IDENTITY_MAIL_DUTY_ROLE_MANIFEST_KIND ||
    payload.contract !== IDENTITY_MAIL_DUTY_ROLE_MANIFEST_CONTRACT ||
    payload.trustDomain !== IDENTITY_MAIL_DUTY_ROLE_MANIFEST_TRUST_DOMAIN ||
    payload.purpose !== IDENTITY_MAIL_DUTY_ROLE_MANIFEST_PURPOSE ||
    payload.profile !== IDENTITY_MAIL_DUTY_ROLE_MANIFEST_PROFILE ||
    typeof payload.manifestId !== "string" ||
    !UUID_PATTERN.test(payload.manifestId) ||
    !Number.isSafeInteger(payload.manifestRevision) ||
    payload.manifestRevision < 1 ||
    payload.manifestRevision > MAX_POSTGRES_INTEGER ||
    payload.authorization !== false ||
    payload.canMutate !== false ||
    payload.canSend !== false ||
    typeof payload.signingKeyId !== "string" ||
    !KEY_ID_PATTERN.test(payload.signingKeyId) ||
    !validDigest(payload.publicKeyFingerprint)
  ) {
    fail(
      "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_CONTRACT_INVALID",
      "The signed duty-role manifest discriminator contract is invalid.",
    );
  }
  return Object.freeze({ ...payload, chain, database, exactGrants, roles });
}

export function identityMailDutyRoleManifestPayloadDigest(payload) {
  return createHash("sha256")
    .update(canonicalStringify(payload), "utf8")
    .digest("hex");
}

export function identityMailDutyRoleManifestPublicKeyFingerprint(publicKeyPem) {
  try {
    const key = createPublicKey(publicKeyPem);
    if (key.asymmetricKeyType !== "ed25519") {
      fail(
        "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_ROOT_INVALID",
        "The duty-role authority key must be Ed25519.",
      );
    }
    return createHash("sha256")
      .update(key.export({ type: "spki", format: "der" }))
      .digest("hex");
  } catch (error) {
    if (error instanceof IdentityMailDutyRoleManifestError) {
      throw error;
    }
    fail(
      "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_ROOT_INVALID",
      "The duty-role authority public key is invalid.",
    );
  }
}

function validateRootRegistry(roots) {
  const registry = Object.create(null);
  const seenFingerprints = new Set();
  for (const [registryKey, candidate] of registryEntries(roots)) {
    const root = exactDataRecord(
      candidate,
      ROOT_KEYS,
      "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_ROOT_INVALID",
      "A duty-role authority root must be exact and data-only.",
    );
    if (typeof root.publicKeyPem !== "string") {
      fail(
        "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_ROOT_INVALID",
        "A duty-role authority public key must be a string.",
      );
    }
    let key;
    let canonicalPem;
    try {
      key = createPublicKey(root.publicKeyPem);
      canonicalPem = key.export({ type: "spki", format: "pem" });
    } catch {
      fail(
        "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_ROOT_INVALID",
        "A duty-role authority public key is invalid.",
      );
    }
    const fingerprint = identityMailDutyRoleManifestPublicKeyFingerprint(
      root.publicKeyPem,
    );
    const notBefore = canonicalIsoEpoch(
      root.notBefore,
      "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_ROOT_INVALID",
      "Authority validity start",
    );
    const notAfter = canonicalIsoEpoch(
      root.notAfter,
      "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_ROOT_INVALID",
      "Authority validity end",
    );
    if (
      !KEY_ID_PATTERN.test(registryKey) ||
      root.keyId !== registryKey ||
      root.algorithm !== IDENTITY_MAIL_DUTY_ROLE_MANIFEST_SIGNATURE_ALGORITHM ||
      root.trustDomain !== IDENTITY_MAIL_DUTY_ROLE_MANIFEST_TRUST_DOMAIN ||
      root.purpose !== IDENTITY_MAIL_DUTY_ROLE_MANIFEST_PURPOSE ||
      root.profile !== IDENTITY_MAIL_DUTY_ROLE_MANIFEST_PROFILE ||
      root.status !== "ACTIVE" ||
      !validDigest(root.publicKeyFingerprint) ||
      root.publicKeyFingerprint !== fingerprint ||
      key.asymmetricKeyType !== "ed25519" ||
      canonicalPem !== root.publicKeyPem ||
      notAfter <= notBefore ||
      seenFingerprints.has(fingerprint)
    ) {
      fail(
        "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_ROOT_INVALID",
        "A duty-role authority root failed its exact contract.",
      );
    }
    seenFingerprints.add(fingerprint);
    registry[registryKey] = Object.freeze({ ...root });
  }
  return Object.freeze(registry);
}

function selectRoot(roots, signingKeyId, nowMs) {
  const registry = validateRootRegistry(roots);
  const root = Object.hasOwn(registry, signingKeyId)
    ? registry[signingKeyId]
    : undefined;
  if (!root) {
    fail(
      Object.keys(registry).length === 0
        ? "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_AUTHORITY_NOT_ENROLLED"
        : "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_AUTHORITY_KEY_NOT_TRUSTED",
      "No active pinned duty-role authority can verify the manifest.",
    );
  }
  if (nowMs < Date.parse(root.notBefore) || nowMs >= Date.parse(root.notAfter)) {
    fail(
      "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_ROOT_INACTIVE",
      "The duty-role authority is outside its validity window.",
    );
  }
  return root;
}

function decodeSignature(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{86}$/u.test(value)) {
    fail(
      "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_SIGNATURE_INVALID",
      "The Ed25519 signature encoding is invalid.",
    );
  }
  const signature = Buffer.from(value, "base64url");
  if (signature.length !== 64 || signature.toString("base64url") !== value) {
    fail(
      "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_SIGNATURE_INVALID",
      "The signature must be one canonical 64-byte Ed25519 base64url value.",
    );
  }
  return signature;
}

function assertTimeline(payload, root, nowMs) {
  const issuedAt = canonicalIsoEpoch(
    payload.issuedAt,
    "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_TIMELINE_INVALID",
    "Manifest issue time",
  );
  const validUntil = canonicalIsoEpoch(
    payload.validUntil,
    "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_TIMELINE_INVALID",
    "Manifest validity end",
  );
  const rootNotBefore = Date.parse(root.notBefore);
  const rootNotAfter = Date.parse(root.notAfter);
  if (
    issuedAt > nowMs + IDENTITY_MAIL_DUTY_ROLE_MANIFEST_MAX_CLOCK_SKEW_MS ||
    issuedAt < rootNotBefore ||
    issuedAt >= rootNotAfter ||
    validUntil <= issuedAt ||
    validUntil <= nowMs ||
    validUntil > rootNotAfter ||
    validUntil - issuedAt > IDENTITY_MAIL_DUTY_ROLE_MANIFEST_MAX_LIFETIME_MS
  ) {
    fail(
      "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_TIMELINE_INVALID",
      "The duty-role manifest is stale or outside its bounded validity window.",
    );
  }
}

function verificationProjection(payload, envelope, verificationMode, nowMs) {
  return Object.freeze({
    authorization: false,
    canMutate: false,
    canSend: false,
    actualContextDigest: payload.actualContextDigest,
    applicationArtifactSha256: payload.chain.head.artifactSha256,
    applicationContract: payload.chain.head.contract,
    applicationReleaseSha: payload.chain.head.releaseSha,
    coordinatorRoleName: payload.roles.coordinator.name,
    coordinatorRoleOid: payload.roles.coordinator.oid,
    databaseIdentityDigest: payload.database.identityDigest,
    databaseName: payload.database.name,
    databaseOid: payload.database.oid,
    exactGrantsDigest: payload.exactGrants.digest,
    exactGrantsProfile: payload.exactGrants.profile,
    deploymentMarkerDigest: payload.deploymentMarkerDigest,
    deploymentMarkerId: payload.deploymentMarkerId,
    manifestId: payload.manifestId,
    manifestRevision: payload.manifestRevision,
    payloadDigest: envelope.payloadDigest,
    predecessorCount: payload.chain.predecessor.count,
    predecessorHead: payload.chain.predecessor.head,
    predecessorHeadChecksum: payload.chain.predecessor.headChecksum,
    predecessorManifestDigest: payload.chain.predecessor.manifestDigest,
    publicKeyFingerprint: envelope.publicKeyFingerprint,
    signingKeyId: envelope.signingKeyId,
    verificationMode,
    verifiedAt: new Date(nowMs).toISOString(),
    workerRoleName: payload.roles.worker.name,
    workerRoleOid: payload.roles.worker.oid,
  });
}

function verifyAgainstRoots(
  envelopeValue,
  roots,
  now,
  verificationMode,
  syntheticContext = undefined,
) {
  const envelope = exactDataRecord(
    envelopeValue,
    ENVELOPE_KEYS,
    "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_ENVELOPE_INVALID",
    "The duty-role manifest envelope shape is invalid.",
  );
  const payload = normalizePayload(envelope.payload);
  if (verificationMode === "SYNTHETIC") {
    assertSyntheticContext(syntheticContext, payload.database.name);
  }
  const nowMs = canonicalIsoEpoch(
    now,
    "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_CURRENT_TIME_INVALID",
    "The explicit verification time",
  );
  if (
    envelope.signatureAlgorithm !==
      IDENTITY_MAIL_DUTY_ROLE_MANIFEST_SIGNATURE_ALGORITHM ||
    typeof envelope.signingKeyId !== "string" ||
    !KEY_ID_PATTERN.test(envelope.signingKeyId) ||
    !validDigest(envelope.publicKeyFingerprint) ||
    !validDigest(envelope.payloadDigest) ||
    envelope.signingKeyId !== payload.signingKeyId ||
    envelope.publicKeyFingerprint !== payload.publicKeyFingerprint ||
    identityMailDutyRoleManifestPayloadDigest(payload) !== envelope.payloadDigest
  ) {
    fail(
      "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_ENVELOPE_BINDING_INVALID",
      "The duty-role manifest envelope binding is invalid.",
    );
  }
  const root = selectRoot(roots, envelope.signingKeyId, nowMs);
  if (root.publicKeyFingerprint !== envelope.publicKeyFingerprint) {
    fail(
      "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_AUTHORITY_KEY_NOT_TRUSTED",
      "The manifest fingerprint does not match its purpose-bound root.",
    );
  }
  const signature = decodeSignature(envelope.signature);
  if (
    !verifySignature(
      null,
      Buffer.from(canonicalStringify(payload), "utf8"),
      createPublicKey(root.publicKeyPem),
      signature,
    )
  ) {
    fail(
      "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_SIGNATURE_INVALID",
      "The duty-role manifest Ed25519 signature is invalid.",
    );
  }
  assertTimeline(payload, root, nowMs);
  const verified = verificationProjection(
    payload,
    envelope,
    verificationMode,
    nowMs,
  );
  if (verificationMode === "PINNED") {
    VERIFIED_PINNED_MANIFESTS.add(verified);
    VERIFIED_PINNED_PAYLOADS.set(verified, payload);
  } else {
    VERIFIED_SYNTHETIC_MANIFESTS.add(verified);
  }
  return verified;
}

function assertSyntheticContext(contextValue, payloadDatabaseName) {
  const context = exactDataRecord(
    contextValue,
    SYNTHETIC_CONTEXT_KEYS,
    "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_SYNTHETIC_CONTEXT_DENIED",
    "Synthetic verification requires an exact loopback-CI context.",
  );
  if (
    context.explicitConfirmation !==
      IDENTITY_MAIL_DUTY_ROLE_MANIFEST_SYNTHETIC_CONFIRMATION ||
    context.environment !== "ci" ||
    context.nodeEnv !== "test" ||
    typeof context.hostname !== "string" ||
    context.hostname !== context.hostname.toLowerCase() ||
    !LOOPBACK_HOSTS.has(context.hostname) ||
    String(process.env.NODE_ENV ?? "").toLowerCase() !== "test" ||
    context.databaseName !== payloadDatabaseName ||
    !validDatabaseName(context.databaseName) ||
    !CI_DATABASE_PATTERN.test(context.databaseName) ||
    PRODUCTION_DATABASE_PATTERN.test(context.databaseName)
  ) {
    fail(
      "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_SYNTHETIC_CONTEXT_DENIED",
      "Synthetic roots are restricted to an explicitly confirmed loopback CI database.",
    );
  }
}

export function verifyPinnedIdentityMailDutyRoleManifestEnvelope(envelope) {
  if (arguments.length !== 1) {
    fail(
      "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_ARGUMENTS_INVALID",
      "Pinned verification accepts only one duty-role manifest envelope.",
    );
  }
  return verifyAgainstRoots(
    envelope,
    PINNED_IDENTITY_MAIL_DUTY_ROLE_MANIFEST_ROOTS,
    new Date().toISOString(),
    "PINNED",
  );
}

export function verifySyntheticIdentityMailDutyRoleManifestEnvelope(
  envelope,
  roots,
  syntheticContext,
  now,
) {
  if (arguments.length !== 4) {
    fail(
      "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_ARGUMENTS_INVALID",
      "Synthetic verification requires roots, loopback-CI context, and explicit now.",
    );
  }
  return verifyAgainstRoots(
    envelope,
    roots,
    now,
    "SYNTHETIC",
    syntheticContext,
  );
}

export function isVerifiedIdentityMailDutyRoleManifest(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    VERIFIED_PINNED_MANIFESTS.has(value)
  );
}

export function isVerifiedSyntheticIdentityMailDutyRoleManifest(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    VERIFIED_SYNTHETIC_MANIFESTS.has(value)
  );
}

export function identityMailDutyRoleManifestPayload(verified) {
  if (!isVerifiedIdentityMailDutyRoleManifest(verified)) {
    fail(
      "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_NOT_VERIFIED",
      "Only a pinned verified manifest exposes a persistable payload.",
    );
  }
  return VERIFIED_PINNED_PAYLOADS.get(verified);
}

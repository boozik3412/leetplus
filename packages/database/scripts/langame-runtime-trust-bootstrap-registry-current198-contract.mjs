import { createHash, createPublicKey } from "node:crypto";
import { types as utilTypes } from "node:util";

import { canonicalStringify } from "./staff-task-integrity-canonical-json.mjs";

export const LANGAME_RUNTIME_TRUST_BOOTSTRAP_REGISTRY_CURRENT198_CONTRACT =
  "LANGAME_RUNTIME_TRUST_BOOTSTRAP_REGISTRY_CURRENT198_V1";
export const LANGAME_RUNTIME_TRUST_BOOTSTRAP_REGISTRY_CURRENT198_ALGORITHM =
  "Ed25519";
export const LANGAME_RUNTIME_TRUST_BOOTSTRAP_REGISTRY_CURRENT198_PURPOSE =
  "LANGAME_RUNTIME_PRODUCTION_TRUST_ENROLLMENT_PROPOSAL";
export const LANGAME_RUNTIME_TRUST_BOOTSTRAP_REGISTRY_CURRENT198_TRUST_DOMAIN =
  "LEETPLUS_LANGAME_RUNTIME_TRUST_ENROLLMENT_CURRENT196";
export const LANGAME_RUNTIME_TRUST_BOOTSTRAP_REGISTRY_CURRENT198_MAX_ROOTS = 8;
export const LANGAME_RUNTIME_TRUST_BOOTSTRAP_REGISTRY_CURRENT198_MAX_ROOT_LIFETIME_MS =
  366 * 24 * 60 * 60 * 1_000;

export const LANGAME_RUNTIME_TRUST_BOOTSTRAP_REGISTRY_CURRENT198_STATUS =
  Object.freeze({
    ACTIVE: "ACTIVE",
    RETIRED: "RETIRED",
    REVOKED: "REVOKED",
  });

const ROOT_KEYS = Object.freeze(
  [
    "algorithm",
    "keyId",
    "notAfter",
    "notBefore",
    "publicKeyFingerprint",
    "publicKeyPem",
    "purpose",
    "retiredAt",
    "revokedAt",
    "status",
    "supersedesKeyId",
    "trustDomain",
  ].sort(),
);
const IMMUTABLE_KEYS = Object.freeze(
  ROOT_KEYS.filter(
    (key) => !["retiredAt", "revokedAt", "status"].includes(key),
  ),
);
const KEY_PATTERN = /^[a-z0-9][a-z0-9._-]{2,63}$/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const MAX_CANONICAL_JSON_BYTES = 64 * 1024;

export class LangameRuntimeTrustBootstrapRegistryCurrent198Error extends Error {
  constructor(code) {
    super("CURRENT198 Langame bootstrap-root registry rejected the input.");
    this.name = "LangameRuntimeTrustBootstrapRegistryCurrent198Error";
    this.code = code;
    this.safeContractError = true;
  }
}

function fail(code) {
  throw new LangameRuntimeTrustBootstrapRegistryCurrent198Error(code);
}

function exactRecord(value, expectedKeys, code) {
  let descriptors;
  let prototype;
  try {
    if (
      value === null ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      utilTypes.isProxy(value)
    ) {
      fail(code);
    }
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch (error) {
    if (error?.safeContractError) throw error;
    fail(code);
  }
  if (prototype !== Object.prototype && prototype !== null) fail(code);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((key) => typeof key !== "string")) fail(code);
  keys.sort();
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
  return result;
}

function canonicalEpoch(value, code) {
  if (typeof value !== "string") fail(code);
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch) || new Date(epoch).toISOString() !== value) {
    fail(code);
  }
  return epoch;
}

function nullableEpoch(value, code) {
  return value === null ? null : canonicalEpoch(value, code);
}

function publicKeyFingerprint(publicKeyPem, code) {
  if (
    typeof publicKeyPem !== "string" ||
    publicKeyPem.length > 4_096 ||
    !publicKeyPem.startsWith("-----BEGIN PUBLIC KEY-----\n") ||
    !publicKeyPem.endsWith("-----END PUBLIC KEY-----\n")
  ) {
    fail(code);
  }
  let key;
  let canonical;
  try {
    key = createPublicKey(publicKeyPem);
    canonical = key.export({ format: "pem", type: "spki" });
  } catch {
    fail(code);
  }
  if (key.asymmetricKeyType !== "ed25519" || canonical !== publicKeyPem) {
    fail(code);
  }
  return createHash("sha256")
    .update(key.export({ format: "der", type: "spki" }))
    .digest("hex");
}

function normalizeRoot(value, registryKey) {
  const code = "CURRENT198_BOOTSTRAP_ROOT_INVALID";
  const root = exactRecord(value, ROOT_KEYS, code);
  const notBefore = canonicalEpoch(root.notBefore, code);
  const notAfter = canonicalEpoch(root.notAfter, code);
  const retiredAt = nullableEpoch(root.retiredAt, code);
  const revokedAt = nullableEpoch(root.revokedAt, code);
  if (
    !KEY_PATTERN.test(registryKey) ||
    root.keyId !== registryKey ||
    root.algorithm !==
      LANGAME_RUNTIME_TRUST_BOOTSTRAP_REGISTRY_CURRENT198_ALGORITHM ||
    root.purpose !==
      LANGAME_RUNTIME_TRUST_BOOTSTRAP_REGISTRY_CURRENT198_PURPOSE ||
    root.trustDomain !==
      LANGAME_RUNTIME_TRUST_BOOTSTRAP_REGISTRY_CURRENT198_TRUST_DOMAIN ||
    !SHA256_PATTERN.test(root.publicKeyFingerprint) ||
    root.publicKeyFingerprint !==
      publicKeyFingerprint(root.publicKeyPem, code) ||
    !Object.values(
      LANGAME_RUNTIME_TRUST_BOOTSTRAP_REGISTRY_CURRENT198_STATUS,
    ).includes(root.status) ||
    (root.supersedesKeyId !== null &&
      !KEY_PATTERN.test(root.supersedesKeyId)) ||
    root.supersedesKeyId === root.keyId ||
    notAfter <= notBefore ||
    notAfter - notBefore >
      LANGAME_RUNTIME_TRUST_BOOTSTRAP_REGISTRY_CURRENT198_MAX_ROOT_LIFETIME_MS ||
    (root.status === "ACTIVE" && (retiredAt !== null || revokedAt !== null)) ||
    (root.status === "RETIRED" && (retiredAt === null || revokedAt !== null)) ||
    (root.status === "REVOKED" && (revokedAt === null || retiredAt !== null)) ||
    (retiredAt !== null && (retiredAt <= notBefore || retiredAt > notAfter)) ||
    (revokedAt !== null && revokedAt <= notBefore)
  ) {
    fail(code);
  }
  return Object.freeze({ ...root });
}

function assertAcyclic(roots, keyId, visiting, visited) {
  if (visited.has(keyId)) return;
  if (visiting.has(keyId)) fail("CURRENT198_BOOTSTRAP_REGISTRY_CYCLE");
  visiting.add(keyId);
  const prior = roots[keyId].supersedesKeyId;
  if (prior !== null) {
    if (!Object.hasOwn(roots, prior)) {
      fail("CURRENT198_BOOTSTRAP_REGISTRY_SUPERSESSION_INVALID");
    }
    assertAcyclic(roots, prior, visiting, visited);
  }
  visiting.delete(keyId);
  visited.add(keyId);
}

export function validateLangameRuntimeTrustBootstrapRegistryCurrent198(value) {
  let descriptors;
  let prototype;
  try {
    if (
      value === null ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      utilTypes.isProxy(value)
    ) {
      fail("CURRENT198_BOOTSTRAP_REGISTRY_INVALID");
    }
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch (error) {
    if (error?.safeContractError) throw error;
    fail("CURRENT198_BOOTSTRAP_REGISTRY_INVALID");
  }
  if (prototype !== Object.prototype && prototype !== null) {
    fail("CURRENT198_BOOTSTRAP_REGISTRY_INVALID");
  }
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.length >
      LANGAME_RUNTIME_TRUST_BOOTSTRAP_REGISTRY_CURRENT198_MAX_ROOTS ||
    keys.some(
      (key) =>
        typeof key !== "string" ||
        !KEY_PATTERN.test(key) ||
        !Object.hasOwn(descriptors[key], "value") ||
        descriptors[key].enumerable !== true,
    )
  ) {
    fail("CURRENT198_BOOTSTRAP_REGISTRY_INVALID");
  }
  keys.sort();
  const roots = {};
  const fingerprints = new Set();
  let activeCount = 0;
  for (const key of keys) {
    const root = normalizeRoot(descriptors[key].value, key);
    if (fingerprints.has(root.publicKeyFingerprint)) {
      fail("CURRENT198_BOOTSTRAP_REGISTRY_FINGERPRINT_REUSED");
    }
    fingerprints.add(root.publicKeyFingerprint);
    if (root.status === "ACTIVE") activeCount += 1;
    roots[key] = root;
  }
  if (activeCount > 1) fail("CURRENT198_BOOTSTRAP_REGISTRY_MULTIPLE_ACTIVE");
  const visiting = new Set();
  const visited = new Set();
  for (const key of keys) assertAcyclic(roots, key, visiting, visited);
  if (keys.length > 0) {
    const genesis = keys.filter((key) => roots[key].supersedesKeyId === null);
    const successorCount = new Map();
    for (const key of keys) {
      const prior = roots[key].supersedesKeyId;
      if (prior === null) continue;
      successorCount.set(prior, (successorCount.get(prior) ?? 0) + 1);
    }
    if (
      genesis.length !== 1 ||
      [...successorCount.values()].some((count) => count !== 1)
    ) {
      fail("CURRENT198_BOOTSTRAP_REGISTRY_SUPERSESSION_INVALID");
    }
  }
  return Object.freeze(roots);
}

export function parsePinnedLangameRuntimeTrustBootstrapRegistryCurrent198(
  canonicalJson,
) {
  if (
    arguments.length !== 1 ||
    typeof canonicalJson !== "string" ||
    canonicalJson.includes("\0") ||
    Buffer.byteLength(canonicalJson, "utf8") > MAX_CANONICAL_JSON_BYTES
  ) {
    fail("CURRENT198_BOOTSTRAP_REGISTRY_SOURCE_INVALID");
  }
  let parsed;
  try {
    parsed = JSON.parse(canonicalJson);
  } catch {
    fail("CURRENT198_BOOTSTRAP_REGISTRY_SOURCE_INVALID");
  }
  if (canonicalStringify(parsed) !== canonicalJson) {
    fail("CURRENT198_BOOTSTRAP_REGISTRY_SOURCE_NOT_CANONICAL");
  }
  return validateLangameRuntimeTrustBootstrapRegistryCurrent198(parsed);
}

function rootsEqual(left, right) {
  return canonicalStringify(left) === canonicalStringify(right);
}

export function validateLangameRuntimeTrustBootstrapRegistryTransitionCurrent198(
  previousValue,
  nextValue,
) {
  if (arguments.length !== 2) {
    fail("CURRENT198_BOOTSTRAP_REGISTRY_TRANSITION_INVALID");
  }
  const previous =
    validateLangameRuntimeTrustBootstrapRegistryCurrent198(previousValue);
  const next =
    validateLangameRuntimeTrustBootstrapRegistryCurrent198(nextValue);
  if (rootsEqual(previous, next)) return next;
  const previousKeys = Object.keys(previous);
  const nextKeys = Object.keys(next);
  if (previousKeys.length === 0) {
    if (
      nextKeys.length !== 1 ||
      next[nextKeys[0]].status !== "ACTIVE" ||
      next[nextKeys[0]].supersedesKeyId !== null
    ) {
      fail("CURRENT198_BOOTSTRAP_REGISTRY_INITIAL_ENROLLMENT_INVALID");
    }
    return next;
  }
  if (previousKeys.some((key) => !Object.hasOwn(next, key))) {
    fail("CURRENT198_BOOTSTRAP_REGISTRY_HISTORY_REMOVED");
  }
  const previousActive = Object.values(previous).find(
    (root) => root.status === "ACTIVE",
  );
  const nextActive = Object.values(next).find(
    (root) => root.status === "ACTIVE",
  );
  const added = nextKeys.filter((key) => !Object.hasOwn(previous, key));
  for (const key of previousKeys) {
    const before = previous[key];
    const after = next[key];
    if (IMMUTABLE_KEYS.some((field) => before[field] !== after[field])) {
      fail("CURRENT198_BOOTSTRAP_REGISTRY_HISTORY_REWRITTEN");
    }
    if (previousActive?.keyId === key) {
      if (!new Set(["RETIRED", "REVOKED"]).has(after.status)) {
        fail("CURRENT198_BOOTSTRAP_REGISTRY_ACTIVE_NOT_CLOSED");
      }
    } else if (
      before.status !== after.status ||
      before.retiredAt !== after.retiredAt ||
      before.revokedAt !== after.revokedAt
    ) {
      fail("CURRENT198_BOOTSTRAP_REGISTRY_HISTORY_REWRITTEN");
    }
  }
  if (previousActive) {
    const stopped =
      added.length === 0 &&
      nextActive === undefined &&
      next[previousActive.keyId].status === "REVOKED";
    const rotated =
      added.length === 1 &&
      nextActive?.keyId === added[0] &&
      nextActive.supersedesKeyId === previousActive.keyId &&
      (next[previousActive.keyId].status === "RETIRED"
        ? next[previousActive.keyId].retiredAt
        : next[previousActive.keyId].revokedAt) === nextActive.notBefore;
    if (!stopped && !rotated) {
      fail("CURRENT198_BOOTSTRAP_REGISTRY_TRANSITION_INVALID");
    }
  } else {
    const resumed =
      added.length === 1 &&
      nextActive?.keyId === added[0] &&
      nextActive.supersedesKeyId !== null &&
      previous[nextActive.supersedesKeyId]?.status === "REVOKED" &&
      Date.parse(nextActive.notBefore) >=
        Date.parse(previous[nextActive.supersedesKeyId].revokedAt);
    if (!resumed) fail("CURRENT198_BOOTSTRAP_REGISTRY_TRANSITION_INVALID");
  }
  return next;
}

export function projectActiveLangameRuntimeTrustBootstrapRootsCurrent198(
  registryValue,
) {
  const registry =
    validateLangameRuntimeTrustBootstrapRegistryCurrent198(registryValue);
  const projected = {};
  for (const root of Object.values(registry)) {
    if (root.status !== "ACTIVE") continue;
    projected[root.keyId] = Object.freeze({
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
  }
  return Object.freeze(projected);
}

export function langameRuntimeTrustBootstrapRegistryDigestCurrent198(value) {
  const registry =
    validateLangameRuntimeTrustBootstrapRegistryCurrent198(value);
  return createHash("sha256")
    .update(
      `${LANGAME_RUNTIME_TRUST_BOOTSTRAP_REGISTRY_CURRENT198_CONTRACT}\nREGISTRY\n`,
      "utf8",
    )
    .update(canonicalStringify(registry), "utf8")
    .digest("hex");
}

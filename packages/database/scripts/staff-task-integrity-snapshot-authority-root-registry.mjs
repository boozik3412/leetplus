import { createHash, createPublicKey } from "node:crypto";

export const AUTHORITY_ROOT_STATUS = Object.freeze({
  ACTIVE: "ACTIVE",
  RETIRED: "RETIRED",
  REVOKED: "REVOKED",
});

const AUTHORITY_SIGNATURE_ALGORITHM = "Ed25519";
const AUTHORITY_CLASSIFICATION = "PRODUCTION_LIKE";
const AUTHORITY_PROFILE = "STAFF_TASK_INTEGRITY_PRODUCTION_LIKE_V1";
const AUTHORITY_PURPOSE = "STAFF_TASK_INTEGRITY_RECONCILIATION";
const KEY_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{2,63}$/u;
const SHA_256_PATTERN = /^[0-9a-f]{64}$/u;
const ROOT_KEYS = Object.freeze(
  [
    "algorithm",
    "classification",
    "keyId",
    "notAfter",
    "notBefore",
    "profile",
    "publicKeyFingerprint",
    "publicKeyPem",
    "purpose",
    "retiredAt",
    "revokedAt",
    "status",
    "supersedesKeyId",
  ].sort((left, right) => left.localeCompare(right)),
);
const IMMUTABLE_ROOT_KEYS = Object.freeze(
  ROOT_KEYS.filter(
    (key) => !["retiredAt", "revokedAt", "status"].includes(key),
  ),
);

function registryError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.exitCode = 3;
  error.safeContractError = true;
  throw error;
}

function canonicalTimestamp(value, label) {
  const raw = String(value ?? "");
  const parsed = new Date(raw);
  if (!raw || Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== raw) {
    registryError(
      "PRODUCTION_LIKE_AUTHORITY_ROOT_INVALID",
      `${label} must be a canonical ISO-8601 timestamp.`,
    );
  }
  return parsed;
}

function nullableTimestamp(value, label) {
  return value === null ? null : canonicalTimestamp(value, label);
}

function exactDataRecord(value, expectedKeys, code, message) {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    registryError(code, message);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors).sort((left, right) =>
    String(left).localeCompare(String(right)),
  );
  if (
    keys.length !== expectedKeys.length ||
    keys.some(
      (key, index) => typeof key !== "string" || key !== expectedKeys[index],
    ) ||
    keys.some((key) => !Object.hasOwn(descriptors[key], "value"))
  ) {
    registryError(code, message);
  }
  return value;
}

export function computeAuthorityPublicKeyFingerprint(publicKey) {
  let key;
  try {
    key =
      publicKey?.type === "public" && publicKey?.asymmetricKeyType === "ed25519"
        ? publicKey
        : createPublicKey(publicKey);
  } catch {
    registryError(
      "PRODUCTION_LIKE_AUTHORITY_ROOT_INVALID",
      "The pinned authority public key is invalid.",
    );
  }
  if (key.asymmetricKeyType !== "ed25519") {
    registryError(
      "PRODUCTION_LIKE_AUTHORITY_ROOT_INVALID",
      "The pinned authority key must be Ed25519.",
    );
  }
  return createHash("sha256")
    .update(key.export({ type: "spki", format: "der" }))
    .digest("hex");
}

function validateRoot(root, registryKey) {
  exactDataRecord(
    root,
    ROOT_KEYS,
    "PRODUCTION_LIKE_AUTHORITY_ROOT_INVALID",
    "A pinned authority root must be one exact data-only record.",
  );
  if (
    !KEY_ID_PATTERN.test(String(registryKey ?? "")) ||
    root.keyId !== registryKey ||
    root.algorithm !== AUTHORITY_SIGNATURE_ALGORITHM ||
    root.classification !== AUTHORITY_CLASSIFICATION ||
    root.profile !== AUTHORITY_PROFILE ||
    root.purpose !== AUTHORITY_PURPOSE ||
    !SHA_256_PATTERN.test(String(root.publicKeyFingerprint ?? "")) ||
    !Object.values(AUTHORITY_ROOT_STATUS).includes(root.status) ||
    (root.supersedesKeyId !== null &&
      !KEY_ID_PATTERN.test(String(root.supersedesKeyId ?? "")))
  ) {
    registryError(
      "PRODUCTION_LIKE_AUTHORITY_ROOT_INVALID",
      "A pinned authority root failed its exact contract.",
    );
  }
  const notBefore = canonicalTimestamp(
    root.notBefore,
    "Authority root activation time",
  );
  const notAfter = canonicalTimestamp(
    root.notAfter,
    "Authority root retirement time",
  );
  const retiredAt = nullableTimestamp(
    root.retiredAt,
    "Authority root retirement event time",
  );
  const revokedAt = nullableTimestamp(
    root.revokedAt,
    "Authority root revocation time",
  );
  if (
    notAfter.valueOf() <= notBefore.valueOf() ||
    root.supersedesKeyId === root.keyId ||
    (root.status === AUTHORITY_ROOT_STATUS.ACTIVE &&
      (retiredAt !== null || revokedAt !== null)) ||
    (root.status === AUTHORITY_ROOT_STATUS.RETIRED &&
      (retiredAt === null || revokedAt !== null)) ||
    (root.status === AUTHORITY_ROOT_STATUS.REVOKED && revokedAt === null) ||
    (retiredAt !== null && retiredAt.valueOf() <= notBefore.valueOf()) ||
    (revokedAt !== null && revokedAt.valueOf() <= notBefore.valueOf()) ||
    (retiredAt !== null &&
      revokedAt !== null &&
      revokedAt.valueOf() < retiredAt.valueOf())
  ) {
    registryError(
      "PRODUCTION_LIKE_AUTHORITY_ROOT_INVALID",
      "A pinned authority root lifecycle is invalid.",
    );
  }
  let canonicalPublicKey;
  try {
    canonicalPublicKey = createPublicKey(root.publicKeyPem).export({
      type: "spki",
      format: "pem",
    });
  } catch {
    registryError(
      "PRODUCTION_LIKE_AUTHORITY_ROOT_INVALID",
      "The pinned authority public key is invalid.",
    );
  }
  if (
    canonicalPublicKey !== root.publicKeyPem ||
    computeAuthorityPublicKeyFingerprint(root.publicKeyPem) !==
      root.publicKeyFingerprint
  ) {
    registryError(
      "PRODUCTION_LIKE_AUTHORITY_ROOT_INVALID",
      "The pinned authority root fingerprint or public-key encoding is invalid.",
    );
  }
  return root;
}

function assertAcyclicSupersession(roots, keyId, visiting, visited) {
  if (visited.has(keyId)) {
    return;
  }
  if (visiting.has(keyId)) {
    registryError(
      "PRODUCTION_LIKE_AUTHORITY_ROOTS_INVALID",
      "The authority root supersession graph contains a cycle.",
    );
  }
  visiting.add(keyId);
  const superseded = roots[keyId].supersedesKeyId;
  if (superseded !== null) {
    if (!Object.hasOwn(roots, superseded)) {
      registryError(
        "PRODUCTION_LIKE_AUTHORITY_ROOTS_INVALID",
        "An authority root references an unknown superseded key.",
      );
    }
    assertAcyclicSupersession(roots, superseded, visiting, visited);
  }
  visiting.delete(keyId);
  visited.add(keyId);
}

export function validateAuthorityRootRegistry(roots) {
  if (!roots || Array.isArray(roots) || typeof roots !== "object") {
    registryError(
      "PRODUCTION_LIKE_AUTHORITY_ROOTS_INVALID",
      "The pinned authority root registry is invalid.",
    );
  }
  const descriptors = Object.getOwnPropertyDescriptors(roots);
  const registryKeys = Reflect.ownKeys(descriptors);
  if (
    registryKeys.some(
      (key) =>
        typeof key !== "string" ||
        !Object.hasOwn(descriptors[key], "value") ||
        !KEY_ID_PATTERN.test(key),
    )
  ) {
    registryError(
      "PRODUCTION_LIKE_AUTHORITY_ROOTS_INVALID",
      "The pinned authority root registry is invalid.",
    );
  }
  const fingerprints = new Set();
  let activeCount = 0;
  for (const registryKey of registryKeys) {
    const root = validateRoot(descriptors[registryKey].value, registryKey);
    if (fingerprints.has(root.publicKeyFingerprint)) {
      registryError(
        "PRODUCTION_LIKE_AUTHORITY_ROOTS_INVALID",
        "Authority root fingerprints must be unique.",
      );
    }
    fingerprints.add(root.publicKeyFingerprint);
    if (root.status === AUTHORITY_ROOT_STATUS.ACTIVE) {
      activeCount += 1;
    }
  }
  if (activeCount > 1) {
    registryError(
      "PRODUCTION_LIKE_AUTHORITY_ROOTS_INVALID",
      "At most one production-like authority root may be active.",
    );
  }
  const visiting = new Set();
  const visited = new Set();
  for (const registryKey of registryKeys) {
    assertAcyclicSupersession(roots, registryKey, visiting, visited);
  }
  return roots;
}

export function selectActiveAuthorityRoot(roots, now = new Date()) {
  const normalizedRoots = validateAuthorityRootRegistry(roots);
  const activeRoot = Object.values(normalizedRoots).find(
    (root) => root.status === AUTHORITY_ROOT_STATUS.ACTIVE,
  );
  if (!activeRoot) {
    registryError(
      "PRODUCTION_LIKE_AUTHORITY_NOT_ENROLLED",
      "This release has no active production-like snapshot authority root.",
    );
  }
  const current =
    now instanceof Date ? new Date(now.valueOf()) : new Date(String(now));
  if (Number.isNaN(current.valueOf())) {
    registryError(
      "PRODUCTION_LIKE_AUTHORITY_CURRENT_TIME_INVALID",
      "The authority verification time is invalid.",
    );
  }
  const notBefore = canonicalTimestamp(
    activeRoot.notBefore,
    "Authority root activation time",
  );
  const notAfter = canonicalTimestamp(
    activeRoot.notAfter,
    "Authority root retirement time",
  );
  if (
    current.valueOf() < notBefore.valueOf() ||
    current.valueOf() >= notAfter.valueOf()
  ) {
    registryError(
      "PRODUCTION_LIKE_AUTHORITY_ROOT_INACTIVE",
      "The active authority root is outside its validity window.",
    );
  }
  return activeRoot;
}

export function validateAuthorityRootRegistryTransition(previous, next) {
  const previousRoots = validateAuthorityRootRegistry(previous);
  const nextRoots = validateAuthorityRootRegistry(next);
  const previousKeys = Object.keys(previousRoots);
  const nextKeys = Object.keys(nextRoots);
  const registriesMatch =
    previousKeys.length === nextKeys.length &&
    previousKeys.every(
      (key) =>
        Object.hasOwn(nextRoots, key) &&
        ROOT_KEYS.every(
          (rootKey) => previousRoots[key][rootKey] === nextRoots[key][rootKey],
        ),
    );
  if (registriesMatch) {
    return nextRoots;
  }
  if (previousKeys.length === 0) {
    const enrolled = selectActiveAuthorityRoot(
      nextRoots,
      new Date(nextRoots[nextKeys[0]]?.notBefore),
    );
    if (nextKeys.length !== 1 || enrolled.supersedesKeyId !== null) {
      registryError(
        "PRODUCTION_LIKE_AUTHORITY_ROOT_TRANSITION_INVALID",
        "Initial root enrollment must add exactly one independent active root.",
      );
    }
    return nextRoots;
  }
  if (previousKeys.some((key) => !Object.hasOwn(nextRoots, key))) {
    registryError(
      "PRODUCTION_LIKE_AUTHORITY_ROOT_TRANSITION_INVALID",
      "Historical authority roots cannot be removed.",
    );
  }
  const previousActive = Object.values(previousRoots).find(
    (root) => root.status === AUTHORITY_ROOT_STATUS.ACTIVE,
  );
  const nextActive = Object.values(nextRoots).find(
    (root) => root.status === AUTHORITY_ROOT_STATUS.ACTIVE,
  );
  const addedKeys = nextKeys.filter(
    (key) => !Object.hasOwn(previousRoots, key),
  );
  for (const key of previousKeys) {
    const before = previousRoots[key];
    const after = nextRoots[key];
    for (const immutableKey of IMMUTABLE_ROOT_KEYS) {
      if (before[immutableKey] !== after[immutableKey]) {
        registryError(
          "PRODUCTION_LIKE_AUTHORITY_ROOT_TRANSITION_INVALID",
          "Existing authority root material cannot be rewritten.",
        );
      }
    }
    if (previousActive && key === previousActive.keyId) {
      if (
        ![
          AUTHORITY_ROOT_STATUS.RETIRED,
          AUTHORITY_ROOT_STATUS.REVOKED,
        ].includes(after.status)
      ) {
        registryError(
          "PRODUCTION_LIKE_AUTHORITY_ROOT_TRANSITION_INVALID",
          "The previous active authority root must be retired or revoked.",
        );
      }
    } else if (
      before.status !== after.status ||
      before.retiredAt !== after.retiredAt ||
      before.revokedAt !== after.revokedAt
    ) {
      registryError(
        "PRODUCTION_LIKE_AUTHORITY_ROOT_TRANSITION_INVALID",
        "Historical authority root lifecycle records are immutable.",
      );
    }
  }
  if (previousActive) {
    const emergencyStop =
      nextActive === undefined &&
      addedKeys.length === 0 &&
      nextRoots[previousActive.keyId].status === AUTHORITY_ROOT_STATUS.REVOKED;
    const rotation =
      nextActive !== undefined &&
      addedKeys.length === 1 &&
      nextActive.keyId === addedKeys[0] &&
      nextActive.supersedesKeyId === previousActive.keyId;
    if (!emergencyStop && !rotation) {
      registryError(
        "PRODUCTION_LIKE_AUTHORITY_ROOT_TRANSITION_INVALID",
        "A root change must rotate the active key or revoke it fail-closed.",
      );
    }
  } else {
    const resumedAfterRevocation =
      nextActive !== undefined &&
      addedKeys.length === 1 &&
      nextActive.keyId === addedKeys[0] &&
      nextActive.supersedesKeyId !== null &&
      Object.hasOwn(previousRoots, nextActive.supersedesKeyId) &&
      previousRoots[nextActive.supersedesKeyId].status ===
        AUTHORITY_ROOT_STATUS.REVOKED;
    if (!resumedAfterRevocation) {
      registryError(
        "PRODUCTION_LIKE_AUTHORITY_ROOT_TRANSITION_INVALID",
        "A revoked registry can resume only with one new superseding active root.",
      );
    }
  }
  return nextRoots;
}

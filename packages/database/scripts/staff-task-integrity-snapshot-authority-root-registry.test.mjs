import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";

import {
  AUTHORITY_ROOT_STATUS,
  computeAuthorityPublicKeyFingerprint,
  selectActiveAuthorityRoot,
  validateAuthorityRootRegistry,
  validateAuthorityRootRegistryTransition,
} from "./staff-task-integrity-snapshot-authority-root-registry.mjs";

function root(
  keyId,
  {
    status = AUTHORITY_ROOT_STATUS.ACTIVE,
    supersedesKeyId = null,
    retiredAt = null,
    revokedAt = null,
    notBefore = "2026-07-29T00:00:00.000Z",
    notAfter = "2027-01-29T00:00:00.000Z",
  } = {},
) {
  const { publicKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });
  return Object.freeze({
    keyId,
    algorithm: "Ed25519",
    classification: "PRODUCTION_LIKE",
    profile: "STAFF_TASK_INTEGRITY_PRODUCTION_LIKE_V1",
    purpose: "STAFF_TASK_INTEGRITY_RECONCILIATION",
    publicKeyPem,
    publicKeyFingerprint: computeAuthorityPublicKeyFingerprint(publicKeyPem),
    notBefore,
    notAfter,
    status,
    supersedesKeyId,
    retiredAt,
    revokedAt,
  });
}

test("an empty registry is valid but fails closed for active authority", () => {
  assert.deepEqual(validateAuthorityRootRegistry(Object.freeze({})), {});
  assert.throws(() => selectActiveAuthorityRoot(Object.freeze({})), {
    code: "PRODUCTION_LIKE_AUTHORITY_NOT_ENROLLED",
  });
});

test("one exact active Ed25519 root is selected only in its validity window", () => {
  const active = root("staff-task-production-like-2026-01");
  const registry = Object.freeze({ [active.keyId]: active });
  assert.equal(
    selectActiveAuthorityRoot(registry, new Date("2026-07-29T00:00:00.000Z")),
    active,
  );
  assert.throws(
    () =>
      selectActiveAuthorityRoot(registry, new Date("2027-01-29T00:00:00.000Z")),
    { code: "PRODUCTION_LIKE_AUTHORITY_ROOT_INACTIVE" },
  );
});

test("multiple active roots, duplicate fingerprints, and lifecycle drift reject", () => {
  const first = root("staff-task-production-like-2026-01");
  const second = root("staff-task-production-like-2026-02");
  assert.throws(
    () =>
      validateAuthorityRootRegistry(
        Object.freeze({
          [first.keyId]: first,
          [second.keyId]: second,
        }),
      ),
    { code: "PRODUCTION_LIKE_AUTHORITY_ROOTS_INVALID" },
  );
  assert.throws(
    () =>
      validateAuthorityRootRegistry(
        Object.freeze({
          [first.keyId]: first,
          "staff-task-production-like-duplicate": Object.freeze({
            ...first,
            keyId: "staff-task-production-like-duplicate",
          }),
        }),
      ),
    { code: "PRODUCTION_LIKE_AUTHORITY_ROOTS_INVALID" },
  );
  assert.throws(
    () =>
      validateAuthorityRootRegistry(
        Object.freeze({
          [first.keyId]: Object.freeze({
            ...first,
            status: AUTHORITY_ROOT_STATUS.RETIRED,
          }),
        }),
      ),
    { code: "PRODUCTION_LIKE_AUTHORITY_ROOT_INVALID" },
  );
});

test("initial enrollment adds exactly one independent active root", () => {
  assert.deepEqual(
    validateAuthorityRootRegistryTransition(
      Object.freeze({}),
      Object.freeze({}),
    ),
    {},
  );
  const first = root("staff-task-production-like-2026-01");
  const next = Object.freeze({ [first.keyId]: first });
  assert.equal(
    validateAuthorityRootRegistryTransition(Object.freeze({}), next),
    next,
  );
  const invalid = root("staff-task-production-like-2026-02", {
    supersedesKeyId: first.keyId,
  });
  assert.throws(
    () =>
      validateAuthorityRootRegistryTransition(
        Object.freeze({}),
        Object.freeze({
          [first.keyId]: first,
          [invalid.keyId]: invalid,
        }),
      ),
    { code: "PRODUCTION_LIKE_AUTHORITY_ROOTS_INVALID" },
  );
});

test("rotation preserves history and explicitly retires the previous root", () => {
  const first = root("staff-task-production-like-2026-01");
  const previous = Object.freeze({ [first.keyId]: first });
  const retired = Object.freeze({
    ...first,
    status: AUTHORITY_ROOT_STATUS.RETIRED,
    retiredAt: "2026-08-01T00:00:00.000Z",
  });
  const second = root("staff-task-production-like-2026-02", {
    supersedesKeyId: first.keyId,
    notBefore: "2026-08-01T00:00:00.000Z",
    notAfter: "2027-02-01T00:00:00.000Z",
  });
  const next = Object.freeze({
    [first.keyId]: retired,
    [second.keyId]: second,
  });
  assert.equal(validateAuthorityRootRegistryTransition(previous, next), next);

  assert.throws(
    () =>
      validateAuthorityRootRegistryTransition(
        previous,
        Object.freeze({ [second.keyId]: second }),
      ),
    { code: "PRODUCTION_LIKE_AUTHORITY_ROOTS_INVALID" },
  );
  assert.throws(
    () =>
      validateAuthorityRootRegistryTransition(
        previous,
        Object.freeze({
          [first.keyId]: Object.freeze({
            ...retired,
            publicKeyFingerprint: "0".repeat(64),
          }),
          [second.keyId]: second,
        }),
      ),
    { code: "PRODUCTION_LIKE_AUTHORITY_ROOT_INVALID" },
  );
});

test("emergency rotation records revocation and rejects supersession cycles", () => {
  const first = root("staff-task-production-like-2026-01");
  const revoked = Object.freeze({
    ...first,
    status: AUTHORITY_ROOT_STATUS.REVOKED,
    revokedAt: "2026-08-01T00:00:00.000Z",
  });
  const second = root("staff-task-production-like-2026-02", {
    supersedesKeyId: first.keyId,
    notBefore: "2026-08-01T00:00:00.000Z",
    notAfter: "2027-02-01T00:00:00.000Z",
  });
  assert.equal(
    validateAuthorityRootRegistryTransition(
      Object.freeze({ [first.keyId]: first }),
      Object.freeze({
        [first.keyId]: revoked,
        [second.keyId]: second,
      }),
    )[second.keyId],
    second,
  );

  const cyclicFirst = Object.freeze({
    ...revoked,
    supersedesKeyId: second.keyId,
  });
  assert.throws(
    () =>
      validateAuthorityRootRegistry(
        Object.freeze({
          [first.keyId]: cyclicFirst,
          [second.keyId]: second,
        }),
      ),
    { code: "PRODUCTION_LIKE_AUTHORITY_ROOTS_INVALID" },
  );
});

test("emergency revoke-to-zero and guarded recovery preserve history", () => {
  const first = root("staff-task-production-like-2026-01");
  const previous = Object.freeze({ [first.keyId]: first });
  const revoked = Object.freeze({
    ...first,
    status: AUTHORITY_ROOT_STATUS.REVOKED,
    revokedAt: "2026-08-01T00:00:00.000Z",
  });
  const stopped = Object.freeze({ [first.keyId]: revoked });
  assert.equal(
    validateAuthorityRootRegistryTransition(previous, stopped),
    stopped,
  );

  const replacement = root("staff-task-production-like-2026-02", {
    supersedesKeyId: first.keyId,
    notBefore: "2026-08-01T00:00:00.000Z",
    notAfter: "2027-02-01T00:00:00.000Z",
  });
  const recovered = Object.freeze({
    [first.keyId]: revoked,
    [replacement.keyId]: replacement,
  });
  assert.equal(
    validateAuthorityRootRegistryTransition(stopped, recovered),
    recovered,
  );
  assert.throws(
    () =>
      validateAuthorityRootRegistryTransition(
        stopped,
        Object.freeze({
          [first.keyId]: revoked,
          [replacement.keyId]: Object.freeze({
            ...replacement,
            supersedesKeyId: null,
          }),
        }),
      ),
    { code: "PRODUCTION_LIKE_AUTHORITY_ROOT_TRANSITION_INVALID" },
  );
});

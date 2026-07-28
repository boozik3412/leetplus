import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";

import * as authorityModule from "./staff-task-integrity-snapshot-authority.mjs";
import {
  AUTHORITY_CLASSIFICATION,
  AUTHORITY_ISOLATION_PROFILE,
  AUTHORITY_KIND,
  AUTHORITY_PROFILE,
  AUTHORITY_PURPOSE,
  AUTHORITY_SIGNATURE_ALGORITHM,
  authorityDatabaseMarker,
  authoritySigningPayload,
  computeApprovalReferenceDigest,
  computeAuthorityEnvelopeDigest,
  computeNonceBoundDatabaseIdentityDigest,
  computePublicKeyFingerprint,
  encodeAuthorityEnvelope,
  isVerifiedProductionLikeAuthority,
  parseAuthorityEnvelope,
  verifyAuthorityEnvelopeAgainstRoots,
  verifyPinnedProductionLikeAuthority,
} from "./staff-task-integrity-snapshot-authority.mjs";

const NOW = new Date("2026-07-28T00:15:00.000Z");
const RELEASE_SHA = "a".repeat(40);
const SNAPSHOT_DIGEST = "b".repeat(64);
const CREATION_NONCE = "c".repeat(64);
const APPROVAL_REFERENCE = "security-approval:staff-task-001";
const KEY_ID = "staff-task-production-like-test-2026";
const SNAPSHOT_ROW = Object.freeze({
  current_database: "leetplus_snapshot_rehearsal",
  cluster_system_identifier: "7667202810308916656",
  database_oid: "16384",
});

function keyMaterial() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({
    type: "spki",
    format: "pem",
  });
  return {
    privateKey,
    root: Object.freeze({
      keyId: KEY_ID,
      algorithm: AUTHORITY_SIGNATURE_ALGORITHM,
      classification: AUTHORITY_CLASSIFICATION,
      profile: AUTHORITY_PROFILE,
      purpose: AUTHORITY_PURPOSE,
      publicKeyPem,
      publicKeyFingerprint: computePublicKeyFingerprint(publicKeyPem),
      notBefore: "2026-07-27T00:00:00.000Z",
      notAfter: "2026-08-01T00:00:00.000Z",
    }),
  };
}

function expectedContract(overrides = {}) {
  return {
    releaseSha: RELEASE_SHA,
    expectedState: "EXPAND_162",
    snapshotArtifactDigest: SNAPSHOT_DIGEST,
    approvalReference: APPROVAL_REFERENCE,
    acquiredAt: "2026-07-28T00:00:00.000Z",
    restoredAt: "2026-07-28T00:05:00.000Z",
    expiresAt: "2026-07-28T01:10:00.000Z",
    ...overrides,
  };
}

function signedFixture({ envelopeOverrides = {}, rootOverrides = {} } = {}) {
  const { privateKey, root } = keyMaterial();
  const envelope = {
    schemaVersion: 1,
    kind: AUTHORITY_KIND,
    purpose: AUTHORITY_PURPOSE,
    classification: AUTHORITY_CLASSIFICATION,
    profile: AUTHORITY_PROFILE,
    signatureAlgorithm: AUTHORITY_SIGNATURE_ALGORITHM,
    signingKeyId: KEY_ID,
    releaseSha: RELEASE_SHA,
    expectedState: "EXPAND_162",
    snapshotArtifactDigest: SNAPSHOT_DIGEST,
    creationNonce: CREATION_NONCE,
    databaseIdentityDigest: computeNonceBoundDatabaseIdentityDigest(
      SNAPSHOT_ROW,
      CREATION_NONCE,
    ),
    approvalReferenceDigest: computeApprovalReferenceDigest(
      APPROVAL_REFERENCE,
      CREATION_NONCE,
    ),
    isolationProfile: AUTHORITY_ISOLATION_PROFILE,
    acquiredAt: "2026-07-28T00:00:00.000Z",
    restoredAt: "2026-07-28T00:05:00.000Z",
    issuedAt: "2026-07-28T00:10:00.000Z",
    expiresAt: "2026-07-28T01:10:00.000Z",
    signature: Buffer.alloc(64).toString("base64url"),
    ...envelopeOverrides,
  };
  envelope.signature = sign(
    null,
    authoritySigningPayload(envelope),
    privateKey,
  ).toString("base64url");
  return {
    envelope,
    roots: Object.freeze({
      [KEY_ID]: Object.freeze({
        ...root,
        ...rootOverrides,
      }),
    }),
  };
}

test("a pinned Ed25519 root verifies one exact canonical authority envelope", () => {
  const { envelope, roots } = signedFixture();
  const encoded = encodeAuthorityEnvelope(envelope);
  const parsed = parseAuthorityEnvelope(encoded);
  assert.deepEqual(parsed, envelope);

  const verified = verifyAuthorityEnvelopeAgainstRoots(
    parsed,
    expectedContract(),
    roots,
    NOW,
  );
  assert.equal(verified.signingKeyId, KEY_ID);
  assert.equal(isVerifiedProductionLikeAuthority(verified), false);
  assert.equal(isVerifiedProductionLikeAuthority({ ...verified }), false);
  assert.equal(
    verified.databaseIdentityDigest,
    computeNonceBoundDatabaseIdentityDigest(SNAPSHOT_ROW, CREATION_NONCE),
  );
  assert.match(verified.publicKeyFingerprint, /^[0-9a-f]{64}$/u);
  assert.equal(
    verified.envelopeDigest,
    computeAuthorityEnvelopeDigest(envelope),
  );
  assert.equal(
    verified.databaseMarker,
    authorityDatabaseMarker(verified.envelopeDigest),
  );
});

test("the expected runtime contract must be one exact data-only snapshot", () => {
  const { envelope, roots } = signedFixture();
  const accessorContract = expectedContract();
  Object.defineProperty(accessorContract, "releaseSha", {
    enumerable: true,
    get: () => RELEASE_SHA,
  });
  assert.throws(
    () =>
      verifyAuthorityEnvelopeAgainstRoots(
        envelope,
        accessorContract,
        roots,
        NOW,
      ),
    { code: "PRODUCTION_LIKE_AUTHORITY_BINDING_INVALID" },
  );
  assert.throws(
    () =>
      verifyAuthorityEnvelopeAgainstRoots(
        envelope,
        { ...expectedContract(), unexpected: "caller-controlled" },
        roots,
        NOW,
      ),
    { code: "PRODUCTION_LIKE_AUTHORITY_BINDING_INVALID" },
  );
});

test("caller-controlled legacy fields and public-key environment are not authority inputs", () => {
  const exports = Object.keys(authorityModule);
  assert.equal(exports.includes("signAuthorityEnvelope"), false);
  assert.equal(exports.includes("buildSignedAuthorityEnvelope"), false);
  assert.equal(
    exports.some((name) => /privatekey/iu.test(name)),
    false,
  );

  assert.throws(
    () =>
      verifyPinnedProductionLikeAuthority(
        signedFixture().envelope,
        expectedContract(),
        NOW,
      ),
    { code: "PRODUCTION_LIKE_AUTHORITY_NOT_ENROLLED" },
  );
});

test("tampering a signed binding never verifies", () => {
  const { envelope, roots } = signedFixture();
  for (const [field, value, code] of [
    ["releaseSha", "d".repeat(40), "PRODUCTION_LIKE_AUTHORITY_BINDING_INVALID"],
    [
      "expectedState",
      "BASELINE_156",
      "PRODUCTION_LIKE_AUTHORITY_BINDING_INVALID",
    ],
    [
      "snapshotArtifactDigest",
      "e".repeat(64),
      "PRODUCTION_LIKE_AUTHORITY_BINDING_INVALID",
    ],
    ["purpose", "ANOTHER_PURPOSE", "PRODUCTION_LIKE_AUTHORITY_BINDING_INVALID"],
    [
      "databaseIdentityDigest",
      "f".repeat(64),
      "PRODUCTION_LIKE_AUTHORITY_SIGNATURE_INVALID",
    ],
  ]) {
    assert.throws(
      () =>
        verifyAuthorityEnvelopeAgainstRoots(
          { ...envelope, [field]: value },
          expectedContract(),
          roots,
          NOW,
        ),
      { code },
    );
  }
});

test("unknown, substituted, or malformed roots fail closed", () => {
  const { envelope, roots } = signedFixture();
  assert.throws(
    () =>
      verifyAuthorityEnvelopeAgainstRoots(
        { ...envelope, signingKeyId: "unknown-production-root" },
        expectedContract(),
        roots,
        NOW,
      ),
    { code: "PRODUCTION_LIKE_AUTHORITY_KEY_NOT_TRUSTED" },
  );
  assert.throws(
    () =>
      verifyAuthorityEnvelopeAgainstRoots(
        { ...envelope, signingKeyId: "constructor" },
        expectedContract(),
        roots,
        NOW,
      ),
    { code: "PRODUCTION_LIKE_AUTHORITY_KEY_NOT_TRUSTED" },
  );

  assert.throws(
    () =>
      verifyAuthorityEnvelopeAgainstRoots(
        envelope,
        expectedContract(),
        {
          [KEY_ID]: {
            ...roots[KEY_ID],
            algorithm: "RSA-PSS",
          },
        },
        NOW,
      ),
    { code: "PRODUCTION_LIKE_AUTHORITY_ROOT_INVALID" },
  );

  assert.throws(
    () =>
      verifyAuthorityEnvelopeAgainstRoots(
        envelope,
        expectedContract(),
        {
          [KEY_ID]: {
            ...roots[KEY_ID],
            publicKeyFingerprint: "0".repeat(64),
          },
        },
        NOW,
      ),
    { code: "PRODUCTION_LIKE_AUTHORITY_ROOT_INVALID" },
  );
});

test("algorithm and signature substitution are rejected", () => {
  const { envelope, roots } = signedFixture();
  assert.throws(
    () =>
      verifyAuthorityEnvelopeAgainstRoots(
        { ...envelope, signatureAlgorithm: "RS256" },
        expectedContract(),
        roots,
        NOW,
      ),
    { code: "PRODUCTION_LIKE_AUTHORITY_BINDING_INVALID" },
  );
  assert.throws(
    () =>
      verifyAuthorityEnvelopeAgainstRoots(
        { ...envelope, signature: Buffer.alloc(64, 1).toString("base64url") },
        expectedContract(),
        roots,
        NOW,
      ),
    { code: "PRODUCTION_LIKE_AUTHORITY_SIGNATURE_INVALID" },
  );
  assert.throws(
    () =>
      verifyAuthorityEnvelopeAgainstRoots(
        { ...envelope, signature: "not_canonical" },
        expectedContract(),
        roots,
        NOW,
      ),
    { code: "PRODUCTION_LIKE_AUTHORITY_SIGNATURE_INVALID" },
  );
});

test("noncanonical JSON and base64url encodings are rejected", () => {
  const { envelope } = signedFixture();
  const nonCanonicalJson = JSON.stringify(envelope, null, 2);
  const nonCanonicalEnvelope = Buffer.from(nonCanonicalJson, "utf8").toString(
    "base64url",
  );
  assert.throws(() => parseAuthorityEnvelope(nonCanonicalEnvelope), {
    code: "PRODUCTION_LIKE_AUTHORITY_MANIFEST_INVALID",
  });
  assert.throws(() => parseAuthorityEnvelope("not+base64url"), {
    code: "PRODUCTION_LIKE_AUTHORITY_MANIFEST_INVALID",
  });
  assert.throws(() => parseAuthorityEnvelope(""), {
    code: "PRODUCTION_LIKE_AUTHORITY_MANIFEST_INVALID",
  });
});

test("future-issued, expired, excessive, and root-outside timelines reject", () => {
  const scenarios = [
    {
      envelopeOverrides: {
        issuedAt: "2026-07-28T00:21:00.000Z",
        expiresAt: "2026-07-28T01:21:00.000Z",
      },
    },
    {
      envelopeOverrides: {
        issuedAt: "2026-07-27T22:00:00.000Z",
        expiresAt: "2026-07-28T00:14:00.000Z",
      },
    },
    {
      envelopeOverrides: {
        issuedAt: "2026-07-28T00:10:00.000Z",
        expiresAt: "2026-07-31T00:10:01.000Z",
      },
    },
    {
      rootOverrides: {
        notAfter: "2026-07-28T01:00:00.000Z",
      },
    },
  ];
  for (const options of scenarios) {
    const { envelope, roots } = signedFixture(options);
    assert.throws(
      () =>
        verifyAuthorityEnvelopeAgainstRoots(
          envelope,
          expectedContract({ expiresAt: envelope.expiresAt }),
          roots,
          NOW,
        ),
      { code: "PRODUCTION_LIKE_AUTHORITY_TIMELINE_INVALID" },
    );
  }
});

test("database and approval digests are nonce-bound and marker-bound", () => {
  const first = computeNonceBoundDatabaseIdentityDigest(
    SNAPSHOT_ROW,
    CREATION_NONCE,
  );
  const second = computeNonceBoundDatabaseIdentityDigest(
    SNAPSHOT_ROW,
    "d".repeat(64),
  );
  const otherDatabase = computeNonceBoundDatabaseIdentityDigest(
    { ...SNAPSHOT_ROW, database_oid: "16385" },
    CREATION_NONCE,
  );
  assert.notEqual(first, second);
  assert.notEqual(first, otherDatabase);
  assert.notEqual(
    computeApprovalReferenceDigest(APPROVAL_REFERENCE, CREATION_NONCE),
    computeApprovalReferenceDigest(APPROVAL_REFERENCE, "d".repeat(64)),
  );

  const { envelope } = signedFixture();
  const marker = authorityDatabaseMarker(
    computeAuthorityEnvelopeDigest(envelope),
  );
  assert.match(
    marker,
    /^LEETPLUS_STAFF_TASK_SNAPSHOT_AUTHORITY_V2:[0-9a-f]{64}$/u,
  );
});

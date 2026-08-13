import assert from "node:assert/strict";
import { generateKeyPairSync, sign as signPayload } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_ROLE,
  LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_ROUTINES,
  attestLangameInitialSyncRuntimeCurrent193,
  planLangameInitialSyncRuntimeCurrent193,
} from "./langame-initial-sync-runtime-boundary-current193.mjs";
import {
  LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_ALGORITHM,
  LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_CONTRACT,
  LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_PURPOSE,
  LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_SYNTHETIC_CONFIRMATION,
  LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_TRUST_DOMAIN,
  langameInitialSyncRuntimeAttestationCurrent193PayloadDigest,
  langameInitialSyncRuntimeAttestationCurrent193PublicKeyFingerprint,
  projectLangameInitialSyncRuntimeAttestationCurrent193,
  verifySyntheticLangameInitialSyncRuntimeAttestationCurrent193,
} from "./langame-initial-sync-runtime-attestation-current193.mjs";
import {
  LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_ALGORITHM,
  LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_CONTRACT,
  LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_CURRENT194_CONTRACT,
  LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_PURPOSE,
  LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_SYNTHETIC_CONFIRMATION,
  LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_TRUST_DOMAIN,
  PINNED_LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_ROOTS,
  isVerifiedLangameRuntimeRevokeIntentCurrent195,
  langameRuntimeRevokeIntentCurrent195PayloadDigest,
  langameRuntimeRevokeIntentCurrent195PublicKeyFingerprint,
  verifyPinnedLangameRuntimeRevokeIntentCurrent195,
  verifySyntheticLangameRuntimeRevokeIntentCurrent195,
} from "./langame-runtime-revoke-intent-current195.mjs";
import { canonicalStringify } from "./staff-task-integrity-canonical-json.mjs";

const NOW = "2026-08-13T09:30:00.000Z";
const DATABASE = "leetplus_ci";
const DATABASE_OID = 16_384;
const OWNER = "leetplus_migration_owner";
const OWNER_OID = 20_002;
const RUNTIME_OID = 20_001;
const RELEASE_SHA = "a".repeat(40);

function current193CatalogReceipt() {
  const plan = planLangameInitialSyncRuntimeCurrent193({
    databaseName: DATABASE,
    databaseOid: DATABASE_OID,
    environment: "ci",
    executorRoleName: LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_ROLE,
    executorRoleOid: RUNTIME_OID,
    releaseSha: RELEASE_SHA,
    schemaOwnerRoleName: OWNER,
    schemaOwnerRoleOid: OWNER_OID,
  });
  return attestLangameInitialSyncRuntimeCurrent193(plan, {
    databaseAcl: { connect: true, create: false, temporary: false },
    databaseName: DATABASE,
    databaseOid: DATABASE_OID,
    currentUser: LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_ROLE,
    defaultPrivilegeCount: 0,
    directSequencePrivilegeCount: 0,
    directTablePrivilegeCount: 0,
    executorRole: {
      bypassRls: false,
      canCreateDatabase: false,
      canCreateRole: false,
      canLogin: true,
      inherit: false,
      name: LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_ROLE,
      oid: RUNTIME_OID,
      replication: false,
      superuser: false,
    },
    functionOwnerRoleName: OWNER,
    functionOwnerRoleOid: OWNER_OID,
    membershipCount: 0,
    ownedObjectCount: 0,
    routines: LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_ROUTINES.map(
      (routine) => ({
        executorCanExecute: routine.callable,
        identity: routine.identity,
        ownerRoleName: OWNER,
        ownerRoleOid: OWNER_OID,
        publicCanExecute: false,
        searchPath: routine.searchPath,
        securityDefiner: routine.securityDefiner,
      }),
    ),
    schemaAcl: { create: false, usage: true },
    sessionUser: LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_ROLE,
    unexpectedExecutableRoutineCount: 0,
  });
}

function current193Attestation() {
  const keyId = "langame-current193-ci-1";
  const authority = generateKeyPairSync("ed25519");
  const publicKeyPem = authority.publicKey.export({
    format: "pem",
    type: "spki",
  });
  const publicKeyFingerprint =
    langameInitialSyncRuntimeAttestationCurrent193PublicKeyFingerprint(
      publicKeyPem,
    );
  const expected = projectLangameInitialSyncRuntimeAttestationCurrent193(
    current193CatalogReceipt(),
  );
  const payload = {
    attestationId: "attestation-current193-current195",
    ...expected,
    contract: LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_CONTRACT,
    issuedAt: "2026-08-13T09:29:00.000Z",
    publicKeyFingerprint,
    purpose: LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_PURPOSE,
    signingKeyId: keyId,
    trustDomain:
      LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_TRUST_DOMAIN,
    validUntil: "2026-08-13T09:34:00.000Z",
  };
  const envelope = {
    payload,
    payloadDigest:
      langameInitialSyncRuntimeAttestationCurrent193PayloadDigest(payload),
    publicKeyFingerprint,
    signature: signPayload(
      null,
      Buffer.from(canonicalStringify(payload), "utf8"),
      authority.privateKey,
    ).toString("base64url"),
    signatureAlgorithm:
      LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_ALGORITHM,
    signingKeyId: keyId,
  };
  return verifySyntheticLangameInitialSyncRuntimeAttestationCurrent193(
    envelope,
    expected,
    {
      [keyId]: {
        algorithm:
          LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_ALGORITHM,
        keyId,
        notAfter: "2026-08-14T00:00:00.000Z",
        notBefore: "2026-08-13T00:00:00.000Z",
        publicKeyFingerprint,
        publicKeyPem,
        purpose: LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_PURPOSE,
        status: "ACTIVE",
        trustDomain:
          LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_TRUST_DOMAIN,
      },
    },
    {
      databaseName: DATABASE,
      environment: "ci",
      explicitConfirmation:
        LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_SYNTHETIC_CONFIRMATION,
      hostname: "127.0.0.1",
    },
    NOW,
  );
}

function fixture(payloadOverrides = {}) {
  const attestation = current193Attestation();
  const keyId = "langame-current195-ci-1";
  const authority = generateKeyPairSync("ed25519");
  const publicKeyPem = authority.publicKey.export({
    format: "pem",
    type: "spki",
  });
  const publicKeyFingerprint =
    langameRuntimeRevokeIntentCurrent195PublicKeyFingerprint(publicKeyPem);
  const payload = {
    attestationId: attestation.attestationId,
    attestationPublicKeyFingerprint: attestation.publicKeyFingerprint,
    attestationSigningKeyId: attestation.signingKeyId,
    contract: LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_CONTRACT,
    current194Contract:
      LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_CURRENT194_CONTRACT,
    databaseName: attestation.databaseName,
    databaseOid: attestation.databaseOid,
    expectedPayloadDigest: attestation.payloadDigest,
    intentId: "revoke-intent-current195",
    issuedAt: "2026-08-13T09:29:30.000Z",
    ownerRoleName: attestation.schemaOwnerRoleName,
    ownerRoleOid: attestation.schemaOwnerRoleOid,
    publicKeyFingerprint,
    purpose: LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_PURPOSE,
    releaseSha: attestation.releaseSha,
    revocationReasonDigest: "8".repeat(64),
    revokeRequestDigest: "7".repeat(64),
    revokeRequestId: "revoke-request-current195",
    signingKeyId: keyId,
    trustDomain: LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_TRUST_DOMAIN,
    validUntil: "2026-08-13T09:34:30.000Z",
    ...payloadOverrides,
  };
  const envelope = {
    payload,
    payloadDigest: langameRuntimeRevokeIntentCurrent195PayloadDigest(payload),
    publicKeyFingerprint,
    signature: signPayload(
      null,
      Buffer.from(canonicalStringify(payload), "utf8"),
      authority.privateKey,
    ).toString("base64url"),
    signatureAlgorithm: LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_ALGORITHM,
    signingKeyId: keyId,
  };
  const roots = {
    [keyId]: {
      algorithm: LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_ALGORITHM,
      keyId,
      notAfter: "2026-08-14T00:00:00.000Z",
      notBefore: "2026-08-13T00:00:00.000Z",
      publicKeyFingerprint,
      publicKeyPem,
      purpose: LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_PURPOSE,
      status: "ACTIVE",
      trustDomain: LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_TRUST_DOMAIN,
    },
  };
  return { attestation, authority, envelope, roots };
}

const context = Object.freeze({
  databaseName: DATABASE,
  environment: "ci",
  explicitConfirmation:
    LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_SYNTHETIC_CONFIRMATION,
  hostname: "127.0.0.1",
});

function verify(value, overrides = {}) {
  return verifySyntheticLangameRuntimeRevokeIntentCurrent195(
    overrides.envelope ?? value.envelope,
    overrides.attestation ?? value.attestation,
    overrides.roots ?? value.roots,
    overrides.context ?? context,
    overrides.now ?? NOW,
  );
}

test("CURRENT195 verifies an exact signed owner revoke intent", () => {
  const value = fixture();
  const verified = verify(value);
  assert.equal(isVerifiedLangameRuntimeRevokeIntentCurrent195(verified), true);
  assert.equal(Object.isFrozen(verified), true);
  assert.equal(verified.authorization, false);
  assert.equal(verified.productionExecutionAllowed, false);
  assert.equal(verified.verificationMode, "SYNTHETIC_CI");
  assert.equal(verified.attestationId, value.attestation.attestationId);
  assert.equal(verified.expectedPayloadDigest, value.attestation.payloadDigest);
  assert.equal(verified.ownerRoleName, OWNER);
  assert.equal(verified.revokeRequestDigest, "7".repeat(64));
  assert.equal(verified.signature, value.envelope.signature);
});

test("CURRENT195 production verification remains fail-closed with empty roots", () => {
  const value = fixture();
  assert.deepEqual(PINNED_LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_ROOTS, {});
  assert.equal(
    Object.isFrozen(PINNED_LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_ROOTS),
    true,
  );
  assert.throws(() =>
    verifyPinnedLangameRuntimeRevokeIntentCurrent195(
      value.envelope,
      value.attestation,
    ),
  );
});

test("CURRENT195 rejects signature, digest and envelope binding drift", () => {
  const value = fixture();
  assert.throws(() =>
    verify(value, {
      envelope: { ...value.envelope, signature: "A".repeat(86) },
    }),
  );
  assert.throws(() =>
    verify(value, {
      envelope: { ...value.envelope, payloadDigest: "0".repeat(64) },
    }),
  );
  assert.throws(() =>
    verify(value, {
      envelope: { ...value.envelope, signingKeyId: "attacker-key" },
    }),
  );
});

test("CURRENT195 rejects attestation and revoke-request binding drift", () => {
  const value = fixture();
  const changedAttestation = fixture().attestation;
  assert.throws(() => verify(value, { attestation: changedAttestation }));
  for (const payloadOverrides of [
    { databaseOid: DATABASE_OID + 1 },
    { ownerRoleOid: OWNER_OID + 1 },
    { expectedPayloadDigest: "b".repeat(64) },
    { releaseSha: "b".repeat(40) },
    { revokeRequestDigest: "8".repeat(64) },
    { revokeRequestId: value.attestation.attestationId },
    { signingKeyId: value.attestation.signingKeyId },
    { publicKeyFingerprint: value.attestation.publicKeyFingerprint },
  ]) {
    assert.throws(() => verify(fixture(payloadOverrides)));
  }
});

test("CURRENT195 rejects expired, future and overlong intents", () => {
  assert.throws(() => verify(fixture(), { now: "2026-08-13T09:34:30.000Z" }));
  assert.throws(() =>
    verify(
      fixture({
        issuedAt: "2026-08-13T09:31:00.001Z",
        validUntil: "2026-08-13T09:34:30.000Z",
      }),
    ),
  );
  assert.throws(() =>
    verify(
      fixture({
        issuedAt: "2026-08-13T09:29:00.000Z",
        validUntil: "2026-08-13T09:34:00.001Z",
      }),
    ),
  );
});

test("CURRENT195 rejects attacker roots and synthetic context widening", () => {
  const value = fixture();
  assert.throws(() => verify(value, { roots: fixture().roots }));
  const tooManyRoots = Object.fromEntries(
    Array.from({ length: 9 }, (_, index) => [
      `langame-current195-extra-${index}`,
      Object.values(value.roots)[0],
    ]),
  );
  assert.throws(() => verify(value, { roots: tooManyRoots }));
  for (const badContext of [
    { ...context, environment: "production" },
    { ...context, hostname: "db.example.test" },
    { ...context, databaseName: "leetplus_prod" },
    { ...context, unexpected: true },
  ]) {
    assert.throws(() => verify(value, { context: badContext }));
  }
});

test("CURRENT195 rejects proxies, accessors, extras and forged receipts", () => {
  const value = fixture();
  assert.throws(() =>
    verify(value, {
      envelope: new Proxy(value.envelope, {
        get() {
          throw new Error("accessed");
        },
      }),
    }),
  );
  assert.throws(() =>
    verify(value, {
      envelope: { ...value.envelope, unexpected: true },
    }),
  );
  const accessor = { ...value.envelope };
  Object.defineProperty(accessor, "signature", {
    enumerable: true,
    get() {
      throw new Error("accessed");
    },
  });
  assert.throws(() => verify(value, { envelope: accessor }));
  const verified = verify(value);
  assert.equal(
    isVerifiedLangameRuntimeRevokeIntentCurrent195({ ...verified }),
    false,
  );
});

test("CURRENT195 verifier contains no signer, filesystem, DB or network authority", () => {
  const source = readFileSync(
    fileURLToPath(
      new URL(
        "./langame-runtime-revoke-intent-current195.mjs",
        import.meta.url,
      ),
    ),
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /createPrivateKey|generateKeyPair|sign as|signPayload|process\.env|node:fs|PrismaClient|\$queryRaw|fetch\s*\(|child_process/iu,
  );
  assert.match(
    source,
    /PINNED_LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_ROOTS =\s*\n?\s*Object\.freeze\(\{\}\)/u,
  );
});

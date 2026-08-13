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
  PINNED_LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_ROOTS,
  isVerifiedLangameInitialSyncRuntimeAttestationCurrent193,
  langameInitialSyncRuntimeAttestationCurrent193PayloadDigest,
  langameInitialSyncRuntimeAttestationCurrent193PublicKeyFingerprint,
  projectLangameInitialSyncRuntimeAttestationCurrent193,
  verifyPinnedLangameInitialSyncRuntimeAttestationCurrent193,
  verifySyntheticLangameInitialSyncRuntimeAttestationCurrent193,
} from "./langame-initial-sync-runtime-attestation-current193.mjs";
import { canonicalStringify } from "./staff-task-integrity-canonical-json.mjs";

const NOW = "2026-08-13T09:30:00.000Z";
const KEY_ID = "langame-current193-ci-1";

function catalogReceipt() {
  const plan = planLangameInitialSyncRuntimeCurrent193({
    databaseName: "leetplus_ci",
    databaseOid: 16_384,
    environment: "ci",
    executorRoleName: LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_ROLE,
    executorRoleOid: 20_001,
    releaseSha: "a".repeat(40),
    schemaOwnerRoleName: "leetplus_migration_owner",
    schemaOwnerRoleOid: 20_002,
  });
  return attestLangameInitialSyncRuntimeCurrent193(plan, {
    databaseAcl: { connect: true, create: false, temporary: false },
    databaseName: "leetplus_ci",
    databaseOid: 16_384,
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
      oid: 20_001,
      replication: false,
      superuser: false,
    },
    functionOwnerRoleName: "leetplus_migration_owner",
    functionOwnerRoleOid: 20_002,
    membershipCount: 0,
    ownedObjectCount: 0,
    routines: LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_ROUTINES.map(
      (routine) => ({
        executorCanExecute: routine.callable,
        identity: routine.identity,
        ownerRoleName: "leetplus_migration_owner",
        ownerRoleOid: 20_002,
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

function authority() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });
  const publicKeyFingerprint =
    langameInitialSyncRuntimeAttestationCurrent193PublicKeyFingerprint(
      publicKeyPem,
    );
  return {
    privateKey,
    publicKeyFingerprint,
    roots: {
      [KEY_ID]: {
        algorithm:
          LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_ALGORITHM,
        keyId: KEY_ID,
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
  };
}

function fixture(payloadOverrides = {}) {
  const expected =
    projectLangameInitialSyncRuntimeAttestationCurrent193(catalogReceipt());
  const signer = authority();
  const payload = {
    attestationId: "attestation-current193",
    ...expected,
    contract: LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_CONTRACT,
    issuedAt: "2026-08-13T09:29:00.000Z",
    publicKeyFingerprint: signer.publicKeyFingerprint,
    purpose: LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_PURPOSE,
    signingKeyId: KEY_ID,
    trustDomain:
      LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_TRUST_DOMAIN,
    validUntil: "2026-08-13T09:34:00.000Z",
    ...payloadOverrides,
  };
  const envelope = {
    payload,
    payloadDigest:
      langameInitialSyncRuntimeAttestationCurrent193PayloadDigest(payload),
    publicKeyFingerprint: signer.publicKeyFingerprint,
    signature: signPayload(
      null,
      Buffer.from(canonicalStringify(payload), "utf8"),
      signer.privateKey,
    ).toString("base64url"),
    signatureAlgorithm:
      LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_ALGORITHM,
    signingKeyId: KEY_ID,
  };
  return { envelope, expected, signer };
}

const context = Object.freeze({
  databaseName: "leetplus_ci",
  environment: "ci",
  explicitConfirmation:
    LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_SYNTHETIC_CONFIRMATION,
  hostname: "127.0.0.1",
});

function verify(value, overrides = {}) {
  return verifySyntheticLangameInitialSyncRuntimeAttestationCurrent193(
    overrides.envelope ?? value.envelope,
    overrides.expected ?? value.expected,
    overrides.roots ?? value.signer.roots,
    overrides.context ?? context,
    overrides.now ?? NOW,
  );
}

test("CURRENT193 verifies an exact short-lived synthetic CI attestation", () => {
  const verified = verify(fixture());
  assert.equal(
    isVerifiedLangameInitialSyncRuntimeAttestationCurrent193(verified),
    true,
  );
  assert.equal(verified.authorization, false);
  assert.equal(verified.productionExecutionAllowed, false);
  assert.equal(verified.databaseName, "leetplus_ci");
  assert.equal(Object.isFrozen(verified), true);
});

test("CURRENT193 pinned verification remains fail-closed with empty roots", () => {
  const value = fixture();
  assert.deepEqual(
    PINNED_LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_ROOTS,
    {},
  );
  assert.throws(() =>
    verifyPinnedLangameInitialSyncRuntimeAttestationCurrent193(
      value.envelope,
      value.expected,
    ),
  );
});

test("CURRENT193 rejects signature, digest and expected-binding drift", () => {
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
      expected: { ...value.expected, releaseSha: "b".repeat(40) },
    }),
  );
});

test("CURRENT193 rejects expired, overlong and future attestations", () => {
  for (const payload of [
    { validUntil: "2026-08-13T09:29:59.000Z" },
    {
      issuedAt: "2026-08-13T09:20:00.000Z",
      validUntil: "2026-08-13T09:30:01.000Z",
    },
    {
      issuedAt: "2026-08-13T09:31:00.000Z",
      validUntil: "2026-08-13T09:32:00.000Z",
    },
  ]) {
    assert.throws(() => verify(fixture(payload)));
  }
});

test("CURRENT193 rejects attacker-root substitution and root metadata drift", () => {
  const trusted = fixture();
  const attacker = fixture();
  assert.throws(() => verify(attacker, { roots: trusted.signer.roots }));
  assert.throws(() =>
    verify(trusted, {
      roots: {
        [KEY_ID]: {
          ...trusted.signer.roots[KEY_ID],
          purpose: "OTHER_PURPOSE",
        },
      },
    }),
  );
});

test("CURRENT193 synthetic verifier denies non-loopback or non-CI context", () => {
  const value = fixture();
  for (const badContext of [
    { ...context, hostname: "db.example.com" },
    { ...context, environment: "production" },
    { ...context, databaseName: "leetplus_prod" },
    { ...context, explicitConfirmation: "wrong" },
  ]) {
    assert.throws(() => verify(value, { context: badContext }));
  }
});

test("CURRENT193 verified provenance cannot be cloned or forged", () => {
  const verified = verify(fixture());
  assert.equal(
    isVerifiedLangameInitialSyncRuntimeAttestationCurrent193(
      structuredClone(verified),
    ),
    false,
  );
  assert.equal(
    isVerifiedLangameInitialSyncRuntimeAttestationCurrent193({ ...verified }),
    false,
  );
});

test("CURRENT193 attestation verifier has no signer, filesystem, DB or network capability", () => {
  const source = readFileSync(
    fileURLToPath(
      new URL(
        "./langame-initial-sync-runtime-attestation-current193.mjs",
        import.meta.url,
      ),
    ),
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /generateKeyPair|createPrivateKey|sign\s+as|child_process|execFile|spawn|process\.env|Prisma|fetch\s*\(|readFile|writeFile/iu,
  );
});

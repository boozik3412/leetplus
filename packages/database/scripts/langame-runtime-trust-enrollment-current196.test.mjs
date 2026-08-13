import assert from "node:assert/strict";
import { generateKeyPairSync, sign as signPayload } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

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
import {
  LANGAME_RUNTIME_TRUST_ENROLLMENT_CURRENT196_ALGORITHM,
  LANGAME_RUNTIME_TRUST_ENROLLMENT_CURRENT196_CONTRACT,
  LANGAME_RUNTIME_TRUST_ENROLLMENT_CURRENT196_CURRENT195_MIGRATION_SHA256,
  LANGAME_RUNTIME_TRUST_ENROLLMENT_CURRENT196_PURPOSE,
  LANGAME_RUNTIME_TRUST_ENROLLMENT_CURRENT196_SYNTHETIC_CONFIRMATION,
  LANGAME_RUNTIME_TRUST_ENROLLMENT_CURRENT196_TRUST_DOMAIN,
  PINNED_LANGAME_RUNTIME_TRUST_ENROLLMENT_CURRENT196_BOOTSTRAP_ROOTS,
  isVerifiedLangameRuntimeTrustEnrollmentCurrent196,
  langameRuntimeTrustEnrollmentCurrent196CandidateBundleDigest,
  langameRuntimeTrustEnrollmentCurrent196PayloadDigest,
  langameRuntimeTrustEnrollmentCurrent196PublicKeyFingerprint,
  verifyPinnedLangameRuntimeTrustEnrollmentCurrent196,
  verifySyntheticLangameRuntimeTrustEnrollmentCurrent196,
} from "./langame-runtime-trust-enrollment-current196.mjs";
import { canonicalStringify } from "./staff-task-integrity-canonical-json.mjs";

const NOW = "2026-08-13T10:00:00.000Z";
const DATABASE = "leetplus_ci";
const DATABASE_OID = 16_384;
const OWNER = "leetplus_migration_owner";
const OWNER_OID = 20_002;
const RUNTIME = "leetplus_langame_initial_sync_runtime";
const RUNTIME_OID = 20_001;
const RELEASE_SHA = "a".repeat(40);

function publicKey(authority) {
  return authority.publicKey.export({ format: "pem", type: "spki" });
}

function candidateRoot(authority, keyId, purpose, trustDomain, overrides = {}) {
  const publicKeyPem = publicKey(authority);
  return {
    algorithm: LANGAME_RUNTIME_TRUST_ENROLLMENT_CURRENT196_ALGORITHM,
    keyId,
    notAfter: "2027-08-13T00:00:00.000Z",
    notBefore: "2026-08-13T00:00:00.000Z",
    publicKeyFingerprint:
      langameRuntimeTrustEnrollmentCurrent196PublicKeyFingerprint(publicKeyPem),
    publicKeyPem,
    purpose,
    status: "PENDING_ENROLLMENT",
    trustDomain,
    ...overrides,
  };
}

function fixture(options = {}) {
  const bootstrapAuthority = generateKeyPairSync("ed25519");
  const attestationAuthority = generateKeyPairSync("ed25519");
  const revokeAuthority = generateKeyPairSync("ed25519");
  const bootstrapSigningKeyId = "langame-current196-bootstrap-ci-1";
  const bootstrapPublicKeyPem = publicKey(bootstrapAuthority);
  const bootstrapPublicKeyFingerprint =
    langameRuntimeTrustEnrollmentCurrent196PublicKeyFingerprint(
      bootstrapPublicKeyPem,
    );
  const baseBundle = {
    runtimeAttestationRoot: candidateRoot(
      attestationAuthority,
      "langame-current193-production-1",
      LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_PURPOSE,
      LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_TRUST_DOMAIN,
    ),
    runtimeRevokeIntentRoot: candidateRoot(
      revokeAuthority,
      "langame-current195-production-1",
      LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_PURPOSE,
      LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_TRUST_DOMAIN,
    ),
    tlsPeerPinset: {
      caCertificateSha256: "1".repeat(64),
      endpointHost: "api.langame.example",
      endpointPort: 443,
      expectedLeafCertificateSha256: "2".repeat(64),
      expectedLeafSpkiSha256: "3".repeat(64),
      leafNotAfter: "2026-11-13T00:00:00.000Z",
      leafNotBefore: "2026-08-12T00:00:00.000Z",
      minimumProtocol: "TLSv1.2",
      rejectUnauthorized: true,
      serverName: "api.langame.example",
    },
  };
  const candidateBundle = options.mutateBundle
    ? options.mutateBundle(structuredClone(baseBundle))
    : baseBundle;
  const candidateBundleDigest =
    langameRuntimeTrustEnrollmentCurrent196CandidateBundleDigest(
      candidateBundle,
    );
  const payload = {
    bootstrapPublicKeyFingerprint,
    bootstrapSigningKeyId,
    candidateBundleDigest,
    ceremonyTranscriptDigest: "4".repeat(64),
    challengeDigest: "5".repeat(64),
    clusterIdentityDigest: "6".repeat(64),
    contract: LANGAME_RUNTIME_TRUST_ENROLLMENT_CURRENT196_CONTRACT,
    current193Contract:
      LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_CONTRACT,
    current194Contract:
      LANGAME_INITIAL_SYNC_RUNTIME_PROVIDER_CURRENT194_CONTRACT,
    current195Contract: LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_CONTRACT,
    current195MigrationSha256:
      LANGAME_RUNTIME_TRUST_ENROLLMENT_CURRENT196_CURRENT195_MIGRATION_SHA256,
    databaseName: DATABASE,
    databaseOid: DATABASE_OID,
    enrollmentGeneration: 1,
    enrollmentId: "langame-trust-enrollment-current196",
    initialRevocationStateDigest: "7".repeat(64),
    issuedAt: "2026-08-13T09:59:00.000Z",
    ownerRoleName: OWNER,
    ownerRoleOid: OWNER_OID,
    primaryApprovalDigest: "8".repeat(64),
    priorEnrollmentDigest: null,
    purpose: LANGAME_RUNTIME_TRUST_ENROLLMENT_CURRENT196_PURPOSE,
    releaseArtifactDigest: "9".repeat(64),
    releaseSha: RELEASE_SHA,
    runtimeConfigDigest: "a".repeat(64),
    runtimeRoleName: RUNTIME,
    runtimeRoleOid: RUNTIME_OID,
    secondaryApprovalDigest: "b".repeat(64),
    trustDomain: LANGAME_RUNTIME_TRUST_ENROLLMENT_CURRENT196_TRUST_DOMAIN,
    validUntil: "2026-08-13T10:04:00.000Z",
    verifierArtifactDigest: "c".repeat(64),
    ...options.payloadOverrides,
  };
  const envelope = {
    candidateBundle,
    payload,
    payloadDigest:
      langameRuntimeTrustEnrollmentCurrent196PayloadDigest(payload),
    publicKeyFingerprint: bootstrapPublicKeyFingerprint,
    signature: signPayload(
      null,
      Buffer.from(canonicalStringify(payload), "utf8"),
      bootstrapAuthority.privateKey,
    ).toString("base64url"),
    signatureAlgorithm: LANGAME_RUNTIME_TRUST_ENROLLMENT_CURRENT196_ALGORITHM,
    signingKeyId: bootstrapSigningKeyId,
  };
  const expected = {
    candidateBundleDigest,
    clusterIdentityDigest: payload.clusterIdentityDigest,
    databaseName: payload.databaseName,
    databaseOid: payload.databaseOid,
    ownerRoleName: payload.ownerRoleName,
    ownerRoleOid: payload.ownerRoleOid,
    releaseArtifactDigest: payload.releaseArtifactDigest,
    releaseSha: payload.releaseSha,
    runtimeConfigDigest: payload.runtimeConfigDigest,
    runtimeRoleName: payload.runtimeRoleName,
    runtimeRoleOid: payload.runtimeRoleOid,
    verifierArtifactDigest: payload.verifierArtifactDigest,
    ...options.expectedOverrides,
  };
  const roots = {
    [bootstrapSigningKeyId]: {
      algorithm: LANGAME_RUNTIME_TRUST_ENROLLMENT_CURRENT196_ALGORITHM,
      keyId: bootstrapSigningKeyId,
      notAfter: "2026-08-14T00:00:00.000Z",
      notBefore: "2026-08-13T00:00:00.000Z",
      publicKeyFingerprint: bootstrapPublicKeyFingerprint,
      publicKeyPem: bootstrapPublicKeyPem,
      purpose: LANGAME_RUNTIME_TRUST_ENROLLMENT_CURRENT196_PURPOSE,
      status: "ACTIVE",
      trustDomain: LANGAME_RUNTIME_TRUST_ENROLLMENT_CURRENT196_TRUST_DOMAIN,
      ...options.bootstrapRootOverrides,
    },
  };
  return {
    authorities: {
      attestationAuthority,
      bootstrapAuthority,
      revokeAuthority,
    },
    envelope,
    expected,
    roots,
  };
}

const context = Object.freeze({
  databaseName: DATABASE,
  environment: "ci",
  explicitConfirmation:
    LANGAME_RUNTIME_TRUST_ENROLLMENT_CURRENT196_SYNTHETIC_CONFIRMATION,
  hostname: "127.0.0.1",
});

function verify(value, overrides = {}) {
  return verifySyntheticLangameRuntimeTrustEnrollmentCurrent196(
    value.envelope,
    overrides.expected ?? value.expected,
    overrides.roots ?? value.roots,
    overrides.context ?? context,
    overrides.now ?? NOW,
  );
}

function code(expectedCode) {
  return (error) => error?.code === expectedCode && error.safeContractError;
}

test("CURRENT196 verifies an exact nonauthorizing trust proposal", () => {
  const value = fixture();
  const receipt = verify(value);
  assert.equal(receipt.status, "VERIFIED_NONAUTHORIZING_PROPOSAL");
  assert.equal(receipt.authorization, false);
  assert.equal(receipt.canEnrollProductionRoots, false);
  assert.equal(receipt.canConnectNetwork, false);
  assert.equal(receipt.canMutate, false);
  assert.equal(receipt.productionExecutionAllowed, false);
  assert.equal(receipt.sharedBetaAccess, false);
  assert.equal(receipt.testAccessAuthorized, false);
  assert.equal(
    receipt.candidateBundleDigest,
    value.expected.candidateBundleDigest,
  );
  assert.equal(receipt.tlsServerName, "api.langame.example");
  assert.equal(receipt.tlsCaCertificateSha256, "1".repeat(64));
  assert.equal(receipt.tlsLeafCertificateSha256, "2".repeat(64));
  assert.equal(receipt.tlsLeafSpkiSha256, "3".repeat(64));
  assert.equal(receipt.tlsMinimumProtocol, "TLSv1.2");
  assert.equal(receipt.tlsRejectUnauthorized, true);
  assert.equal(Object.isFrozen(receipt), true);
  assert.equal(
    isVerifiedLangameRuntimeTrustEnrollmentCurrent196(receipt),
    true,
  );
  assert.equal(
    isVerifiedLangameRuntimeTrustEnrollmentCurrent196({ ...receipt }),
    false,
  );
  assert.equal("publicKeyPem" in receipt, false);
  assert.equal("candidateBundle" in receipt, false);
});

test("CURRENT196 production entry is frozen empty and has no root injection API", () => {
  const value = fixture();
  assert.deepEqual(
    PINNED_LANGAME_RUNTIME_TRUST_ENROLLMENT_CURRENT196_BOOTSTRAP_ROOTS,
    {},
  );
  assert.equal(
    Object.isFrozen(
      PINNED_LANGAME_RUNTIME_TRUST_ENROLLMENT_CURRENT196_BOOTSTRAP_ROOTS,
    ),
    true,
  );
  assert.throws(
    () => verifyPinnedLangameRuntimeTrustEnrollmentCurrent196(value.envelope),
    code("CURRENT196_TRUST_ENROLLMENT_PRODUCTION_ROOTS_EMPTY"),
  );
  assert.throws(
    () =>
      verifyPinnedLangameRuntimeTrustEnrollmentCurrent196(
        value.envelope,
        value.roots,
      ),
    code("CURRENT196_TRUST_ENROLLMENT_ARGUMENTS_INVALID"),
  );
});

test("CURRENT196 rejects non-loopback and non-CI synthetic contexts", () => {
  const value = fixture();
  for (const badContext of [
    { ...context, environment: "production" },
    { ...context, hostname: "ci.example.test" },
    { ...context, databaseName: "leetplus" },
    { ...context, explicitConfirmation: "yes" },
  ]) {
    assert.throws(
      () => verify(value, { context: badContext }),
      code("CURRENT196_TRUST_ENROLLMENT_SYNTHETIC_DENIED"),
    );
  }
});

test("CURRENT196 rejects untrusted, expired and wrong-purpose bootstrap roots", () => {
  const value = fixture();
  assert.throws(
    () => verify(value, { roots: {} }),
    code("CURRENT196_TRUST_ENROLLMENT_BOOTSTRAP_ROOT_NOT_TRUSTED"),
  );
  for (const bootstrapRootOverrides of [
    { status: "REVOKED" },
    { purpose: LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_PURPOSE },
    { trustDomain: LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_TRUST_DOMAIN },
    { notAfter: NOW },
  ]) {
    const changed = fixture({ bootstrapRootOverrides });
    assert.throws(
      () => verify(changed),
      code("CURRENT196_TRUST_ENROLLMENT_BOOTSTRAP_ROOT_NOT_TRUSTED"),
    );
  }
});

test("CURRENT196 rejects signature and signed-envelope drift", () => {
  const value = fixture();
  assert.throws(
    () =>
      verify({
        ...value,
        envelope: { ...value.envelope, signature: "A".repeat(86) },
      }),
    code("CURRENT196_TRUST_ENROLLMENT_SIGNATURE_INVALID"),
  );
  assert.throws(
    () =>
      verify({
        ...value,
        envelope: {
          ...value.envelope,
          payloadDigest: "f".repeat(64),
        },
      }),
    code("CURRENT196_TRUST_ENROLLMENT_BINDING_INVALID"),
  );
});

test("CURRENT196 binds exact release, cluster, role OIDs and candidate bundle", () => {
  const value = fixture();
  for (const expected of [
    { ...value.expected, releaseSha: "d".repeat(40) },
    { ...value.expected, databaseOid: DATABASE_OID + 1 },
    { ...value.expected, runtimeRoleOid: RUNTIME_OID + 2 },
    { ...value.expected, clusterIdentityDigest: "d".repeat(64) },
  ]) {
    assert.throws(
      () => verify(value, { expected }),
      (error) => {
        assert.equal(
          error?.code,
          "CURRENT196_TRUST_ENROLLMENT_EXPECTED_BINDING_INVALID",
          canonicalStringify(expected),
        );
        return error.safeContractError;
      },
    );
  }
  const changedBundle = structuredClone(value.envelope.candidateBundle);
  changedBundle.tlsPeerPinset.expectedLeafSpkiSha256 = "d".repeat(64);
  assert.throws(
    () =>
      verify({
        ...value,
        envelope: { ...value.envelope, candidateBundle: changedBundle },
      }),
    code("CURRENT196_TRUST_ENROLLMENT_CANDIDATE_BINDING_INVALID"),
  );
});

test("CURRENT196 requires independent approval evidence and initial generation", () => {
  for (const payloadOverrides of [
    { secondaryApprovalDigest: "8".repeat(64) },
    { enrollmentGeneration: 2 },
    { priorEnrollmentDigest: "d".repeat(64) },
    { current195MigrationSha256: "d".repeat(64) },
  ]) {
    const value = fixture({ payloadOverrides });
    assert.throws(
      () => verify(value),
      code("CURRENT196_TRUST_ENROLLMENT_PAYLOAD_INVALID"),
    );
  }
});

test("CURRENT196 enforces separate purpose-bound candidate authorities", () => {
  const value = fixture();
  for (const mutateBundle of [
    (bundle) => {
      bundle.runtimeAttestationRoot.status = "ACTIVE";
      return bundle;
    },
    (bundle) => {
      bundle.runtimeAttestationRoot.purpose =
        LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_PURPOSE;
      return bundle;
    },
    (bundle) => {
      bundle.runtimeRevokeIntentRoot.keyId =
        bundle.runtimeAttestationRoot.keyId;
      return bundle;
    },
  ]) {
    const changed = structuredClone(value.envelope.candidateBundle);
    assert.throws(
      () =>
        mutateBundle(changed) &&
        langameRuntimeTrustEnrollmentCurrent196CandidateBundleDigest(changed),
      code("CURRENT196_TRUST_ENROLLMENT_CANDIDATE_BUNDLE_INVALID"),
    );
  }
});

test("CURRENT196 rejects weak or ambiguous TLS peer pinsets", () => {
  const value = fixture();
  for (const mutateBundle of [
    (bundle) => {
      bundle.tlsPeerPinset.rejectUnauthorized = false;
      return bundle;
    },
    (bundle) => {
      bundle.tlsPeerPinset.endpointHost = "*.langame.example";
      return bundle;
    },
    (bundle) => {
      bundle.tlsPeerPinset.endpointPort = 0;
      return bundle;
    },
    (bundle) => {
      bundle.tlsPeerPinset.caCertificateSha256 =
        bundle.tlsPeerPinset.expectedLeafSpkiSha256;
      return bundle;
    },
  ]) {
    const changed = structuredClone(value.envelope.candidateBundle);
    assert.throws(
      () =>
        mutateBundle(changed) &&
        langameRuntimeTrustEnrollmentCurrent196CandidateBundleDigest(changed),
      code("CURRENT196_TRUST_ENROLLMENT_TLS_PINSET_INVALID"),
    );
  }
});

test("CURRENT196 rejects expired proposals, future proposals and expired leaf pins", () => {
  for (const payloadOverrides of [
    {
      issuedAt: "2026-08-13T10:01:00.000Z",
      validUntil: "2026-08-13T10:04:00.000Z",
    },
    { validUntil: NOW },
  ]) {
    const value = fixture({ payloadOverrides });
    assert.throws(
      () => verify(value),
      code("CURRENT196_TRUST_ENROLLMENT_TIMELINE_INVALID"),
    );
  }
  const value = fixture();
  const changed = structuredClone(value.envelope.candidateBundle);
  changed.tlsPeerPinset.leafNotAfter = "2026-08-13T10:02:00.000Z";
  const changedDigest =
    langameRuntimeTrustEnrollmentCurrent196CandidateBundleDigest(changed);
  const rebuilt = fixture({
    expectedOverrides: { candidateBundleDigest: changedDigest },
    mutateBundle: () => changed,
  });
  assert.throws(
    () => verify(rebuilt),
    code("CURRENT196_TRUST_ENROLLMENT_TLS_PINSET_TIMELINE_INVALID"),
  );
});

test("CURRENT196 rejects proxy/accessor inputs without invoking accessors", () => {
  const value = fixture();
  let accessorCalls = 0;
  const expected = { ...value.expected };
  Object.defineProperty(expected, "releaseSha", {
    enumerable: true,
    get() {
      accessorCalls += 1;
      return RELEASE_SHA;
    },
  });
  assert.throws(
    () => verify(value, { expected }),
    code("CURRENT196_TRUST_ENROLLMENT_EXPECTED_INVALID"),
  );
  assert.equal(accessorCalls, 0);
  assert.throws(
    () => verify({ ...value, envelope: new Proxy(value.envelope, {}) }),
    code("CURRENT196_TRUST_ENROLLMENT_ENVELOPE_INVALID"),
  );
});

test("CURRENT196 foundation exposes no filesystem, process, network or signer authority", () => {
  const source = readFileSync(
    fileURLToPath(
      new URL(
        "./langame-runtime-trust-enrollment-current196.mjs",
        import.meta.url,
      ),
    ),
    "utf8",
  );
  for (const forbidden of [
    'from "node:fs"',
    'from "node:net"',
    'from "node:tls"',
    "process.env",
    "privateKey",
    "fetch(",
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});

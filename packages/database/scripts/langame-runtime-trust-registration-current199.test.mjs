import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  LANGAME_RUNTIME_TRUST_REGISTRATION_CURRENT199_STATUS,
  LANGAME_RUNTIME_TRUST_REGISTRATION_CURRENT199_SYNTHETIC_CONFIRMATION,
  isPreparedLangameRuntimeTrustRegistrationCurrent199,
  isPreparedProductionLangameRuntimeTrustRegistrationCurrent199,
  prepareLangameRuntimeTrustRegistrationCurrent199,
  prepareSyntheticLangameRuntimeTrustRegistrationCurrent199ForTestOnly,
} from "./langame-runtime-trust-registration-current199.mjs";

const h = (value) =>
  Buffer.from(String(value), "utf8")
    .toString("hex")
    .padEnd(64, "0")
    .slice(0, 64);

function fixture() {
  const proposal = {
    authorization: false,
    bootstrapPublicKeyFingerprint: h("bootstrap"),
    bootstrapSigningKeyId: "langame-bootstrap-production-1",
    canConnectNetwork: false,
    canEnrollProductionRoots: false,
    canMutate: false,
    candidateBundleDigest: h("bundle"),
    clusterIdentityDigest: h("cluster"),
    contract: "LANGAME_RUNTIME_TRUST_ENROLLMENT_CURRENT196_V1",
    databaseName: "leetplus_ci",
    databaseOid: 16_384,
    enrollmentGeneration: 1,
    enrollmentId: "enrollment_current199_0001",
    enrollmentPayloadDigest: h("payload"),
    issuedAt: "2026-08-14T00:00:00.000Z",
    ownerRoleName: "leetplus_owner",
    ownerRoleOid: 16_385,
    productionExecutionAllowed: false,
    releaseArtifactDigest: h("artifact"),
    releaseSha: "a".repeat(40),
    runtimeAttestationKeyId: "runtime-attestation-1",
    runtimeAttestationPublicKeyFingerprint: h("attestation"),
    runtimeConfigDigest: h("config"),
    runtimeRevokeIntentKeyId: "runtime-revoke-1",
    runtimeRevokeIntentPublicKeyFingerprint: h("revoke"),
    runtimeRoleName: "leetplus_runtime",
    runtimeRoleOid: 16_386,
    sharedBetaAccess: false,
    status: "VERIFIED_NONAUTHORIZING_PROPOSAL",
    testAccessAuthorized: false,
    tlsCaCertificateSha256: h("ca"),
    tlsEndpointHost: "api.langame.ru",
    tlsEndpointPort: 443,
    tlsLeafCertificateSha256: h("leaf"),
    tlsLeafNotAfter: "2027-08-14T00:00:00.000Z",
    tlsLeafNotBefore: "2026-08-13T00:00:00.000Z",
    tlsLeafSpkiSha256: h("spki"),
    tlsMinimumProtocol: "TLSv1.3",
    tlsRejectUnauthorized: true,
    tlsServerName: "api.langame.ru",
    validUntil: "2026-08-14T00:05:00.000Z",
    verificationMode: "SYNTHETIC_CI",
    verifierArtifactDigest: h("verifier"),
  };
  const acquisitionReceipt = {
    authorization: false,
    canConnectNetwork: false,
    canEnrollProductionRoots: false,
    canMutate: false,
    candidateBundleDigest: proposal.candidateBundleDigest,
    collectedAt: "2026-08-14T00:01:00.000Z",
    contract: "LANGAME_RUNTIME_TRUST_ACQUISITION_CURRENT197_V1",
    databaseName: proposal.databaseName,
    databaseOid: proposal.databaseOid,
    enrollmentId: proposal.enrollmentId,
    enrollmentPayloadDigest: proposal.enrollmentPayloadDigest,
    productionExecutionAllowed: false,
    productionRootEnrolled: false,
    protectedSourceFilesVerified: true,
    receiptDigest: h("receipt"),
    releaseArtifactDigest: proposal.releaseArtifactDigest,
    releaseSha: proposal.releaseSha,
    resolvedAddressSetDigest: h("addresses"),
    runtimeAttestationKeyId: proposal.runtimeAttestationKeyId,
    runtimeAttestationPublicKeyBytesSha256: h("attestation-bytes"),
    runtimeAttestationPublicKeyFingerprint:
      proposal.runtimeAttestationPublicKeyFingerprint,
    runtimeConfigDigest: proposal.runtimeConfigDigest,
    runtimeRevokeIntentKeyId: proposal.runtimeRevokeIntentKeyId,
    runtimeRevokeIntentPublicKeyBytesSha256: h("revoke-bytes"),
    runtimeRevokeIntentPublicKeyFingerprint:
      proposal.runtimeRevokeIntentPublicKeyFingerprint,
    sharedBetaAccess: false,
    sourceNetworkIoPerformed: true,
    status: "PROTECTED_PUBLIC_ROOTS_AND_TLS_PEER_OBSERVED_DENY_ONLY",
    syntheticOnly: true,
    testAccessAuthorized: false,
    tlsCaCertificateSha256: proposal.tlsCaCertificateSha256,
    tlsEndpointHost: proposal.tlsEndpointHost,
    tlsEndpointPort: proposal.tlsEndpointPort,
    tlsHostnameVerified: true,
    tlsLeafCertificateSha256: proposal.tlsLeafCertificateSha256,
    tlsLeafSpkiSha256: proposal.tlsLeafSpkiSha256,
    tlsObservationDigest: h("observation"),
    tlsPeerObserved: true,
    tlsServerName: proposal.tlsServerName,
    verifierArtifactDigest: proposal.verifierArtifactDigest,
  };
  return { acquisitionReceipt, proposal };
}

const context = {
  databaseName: "leetplus_ci",
  environment: "ci",
  explicitConfirmation:
    LANGAME_RUNTIME_TRUST_REGISTRATION_CURRENT199_SYNTHETIC_CONFIRMATION,
  hostname: "127.0.0.1",
};
const now = "2026-08-14T00:02:00.000Z";
const code = (expected) => (error) =>
  error?.code === expected && error.safeContractError;

test("CURRENT199 prepares one exact deny-only initial registration", () => {
  const registration =
    prepareSyntheticLangameRuntimeTrustRegistrationCurrent199ForTestOnly(
      fixture(),
      context,
      now,
    );
  assert.equal(
    registration.status,
    LANGAME_RUNTIME_TRUST_REGISTRATION_CURRENT199_STATUS,
  );
  assert.equal(registration.operation, "INITIAL_ENROLLMENT");
  assert.equal(
    registration.eventType,
    "INITIAL_ENROLLMENT_REGISTRATION_PREPARED",
  );
  assert.equal(registration.priorEnrollmentDigest, null);
  assert.equal(registration.enrollmentPayloadDigest, h("payload"));
  assert.match(registration.registrationDigest, /^[a-f0-9]{64}$/u);
  for (const key of [
    "authorization",
    "canApply",
    "canMutate",
    "canPersist",
    "canRevoke",
    "canRotate",
    "productionExecutionAllowed",
    "sharedBetaAccess",
    "testAccessAuthorized",
  ]) {
    assert.equal(registration[key], false, key);
  }
  assert.equal(Object.isFrozen(registration), true);
  assert.equal(
    isPreparedLangameRuntimeTrustRegistrationCurrent199(registration),
    true,
  );
  assert.equal(
    isPreparedLangameRuntimeTrustRegistrationCurrent199({ ...registration }),
    false,
  );
  assert.equal(
    isPreparedProductionLangameRuntimeTrustRegistrationCurrent199(registration),
    false,
  );
});

test("CURRENT199 digest binds the complete proposal and acquisition receipt", () => {
  const first =
    prepareSyntheticLangameRuntimeTrustRegistrationCurrent199ForTestOnly(
      fixture(),
      context,
      now,
    );
  const changed = fixture();
  changed.proposal.enrollmentPayloadDigest = h("payload-2");
  changed.acquisitionReceipt.enrollmentPayloadDigest = h("payload-2");
  const second =
    prepareSyntheticLangameRuntimeTrustRegistrationCurrent199ForTestOnly(
      changed,
      context,
      now,
    );
  assert.notEqual(first.registrationDigest, second.registrationDigest);
  const changedReceipt = fixture();
  changedReceipt.acquisitionReceipt.receiptDigest = h("receipt-2");
  const third =
    prepareSyntheticLangameRuntimeTrustRegistrationCurrent199ForTestOnly(
      changedReceipt,
      context,
      now,
    );
  assert.notEqual(first.registrationDigest, third.registrationDigest);
});

test("CURRENT199 rejects every cross-receipt binding drift", () => {
  for (const key of [
    "candidateBundleDigest",
    "databaseOid",
    "enrollmentId",
    "enrollmentPayloadDigest",
    "releaseSha",
    "runtimeAttestationKeyId",
    "runtimeRevokeIntentPublicKeyFingerprint",
    "tlsLeafSpkiSha256",
    "verifierArtifactDigest",
  ]) {
    const value = fixture();
    value.acquisitionReceipt[key] =
      typeof value.acquisitionReceipt[key] === "number"
        ? value.acquisitionReceipt[key] + 1
        : key.endsWith("Digest") ||
            key.endsWith("Fingerprint") ||
            key.endsWith("Sha256")
          ? h(`${key}-drift`)
          : `${value.acquisitionReceipt[key]}-drift`;
    assert.throws(
      () =>
        prepareSyntheticLangameRuntimeTrustRegistrationCurrent199ForTestOnly(
          value,
          context,
          now,
        ),
      code("CURRENT199_TRUST_REGISTRATION_BINDING_INVALID"),
      key,
    );
  }
});

test("CURRENT199 rejects expired and reordered evidence", () => {
  for (const [value, at] of [
    [fixture(), "2026-08-14T00:05:00.000Z"],
    [
      (() => {
        const result = fixture();
        result.acquisitionReceipt.collectedAt = "2026-08-13T23:59:59.999Z";
        return result;
      })(),
      now,
    ],
  ]) {
    assert.throws(
      () =>
        prepareSyntheticLangameRuntimeTrustRegistrationCurrent199ForTestOnly(
          value,
          context,
          at,
        ),
      code("CURRENT199_TRUST_REGISTRATION_TIMELINE_INVALID"),
    );
  }
});

test("CURRENT199 production entry rejects unbranded evidence", () => {
  assert.throws(
    () => prepareLangameRuntimeTrustRegistrationCurrent199(fixture()),
    code("CURRENT199_TRUST_REGISTRATION_PROVENANCE_INVALID"),
  );
});

test("CURRENT199 rejects proxies and accessors without invoking accessors", () => {
  let calls = 0;
  const value = fixture();
  Object.defineProperty(value.acquisitionReceipt, "receiptDigest", {
    enumerable: true,
    get() {
      calls += 1;
      return h("receipt");
    },
  });
  assert.throws(
    () =>
      prepareSyntheticLangameRuntimeTrustRegistrationCurrent199ForTestOnly(
        value,
        context,
        now,
      ),
    code("CURRENT199_TRUST_REGISTRATION_ACQUISITION_INVALID"),
  );
  assert.equal(calls, 0);
  assert.throws(
    () =>
      prepareSyntheticLangameRuntimeTrustRegistrationCurrent199ForTestOnly(
        new Proxy(fixture(), {}),
        context,
        now,
      ),
    code("CURRENT199_TRUST_REGISTRATION_INPUT_INVALID"),
  );
});

test("CURRENT199 registration has no persistence, network or signer authority", async () => {
  const source = await readFile(
    fileURLToPath(
      new URL(
        "./langame-runtime-trust-registration-current199.mjs",
        import.meta.url,
      ),
    ),
    "utf8",
  );
  for (const forbidden of [
    /PrismaClient/u,
    /node:(?:child_process|fs|http|https|net|tls)/u,
    /process\.env/u,
    /createPrivateKey/u,
    /\bsign\s*\(/u,
  ]) {
    assert.doesNotMatch(source, forbidden);
  }
});

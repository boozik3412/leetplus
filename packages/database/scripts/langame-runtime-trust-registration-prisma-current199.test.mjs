import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  LANGAME_RUNTIME_TRUST_REGISTRATION_PRISMA_CURRENT199_TEST_CONFIRMATION,
  createLangameRuntimeTrustRegistrationPrismaCurrent199,
  createLangameRuntimeTrustRegistrationPrismaCurrent199ForTestOnly,
  isLangameRuntimeTrustRegistrationPrismaCurrent199,
} from "./langame-runtime-trust-registration-prisma-current199.mjs";
import {
  LANGAME_RUNTIME_TRUST_REGISTRATION_CURRENT199_SYNTHETIC_CONFIRMATION,
  prepareSyntheticLangameRuntimeTrustRegistrationCurrent199ForTestOnly,
} from "./langame-runtime-trust-registration-current199.mjs";

const h = (value) =>
  Buffer.from(String(value), "utf8")
    .toString("hex")
    .padEnd(64, "0")
    .slice(0, 64);
const DATABASE = "leetplus_ci";
const DATABASE_OID = 16_384;
const OWNER = "leetplus_owner";
const OWNER_OID = 16_385;
const RUNTIME = "leetplus_runtime";
const RUNTIME_OID = 16_386;
const VALID_UNTIL = "2026-08-14T00:05:00.000Z";
const config = Object.freeze({
  expectedDatabase: DATABASE,
  ownerRoleName: OWNER,
});

function registrationFixture() {
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
    databaseName: DATABASE,
    databaseOid: DATABASE_OID,
    enrollmentGeneration: 1,
    enrollmentId: "enrollment_current199_0001",
    enrollmentPayloadDigest: h("payload"),
    issuedAt: "2026-08-14T00:00:00.000Z",
    ownerRoleName: OWNER,
    ownerRoleOid: OWNER_OID,
    productionExecutionAllowed: false,
    releaseArtifactDigest: h("artifact"),
    releaseSha: "a".repeat(40),
    runtimeAttestationKeyId: "runtime-attestation-1",
    runtimeAttestationPublicKeyFingerprint: h("attestation"),
    runtimeConfigDigest: h("config"),
    runtimeRevokeIntentKeyId: "runtime-revoke-1",
    runtimeRevokeIntentPublicKeyFingerprint: h("revoke"),
    runtimeRoleName: RUNTIME,
    runtimeRoleOid: RUNTIME_OID,
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
    validUntil: VALID_UNTIL,
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
  return prepareSyntheticLangameRuntimeTrustRegistrationCurrent199ForTestOnly(
    { acquisitionReceipt, proposal },
    {
      databaseName: DATABASE,
      environment: "ci",
      explicitConfirmation:
        LANGAME_RUNTIME_TRUST_REGISTRATION_CURRENT199_SYNTHETIC_CONFIRMATION,
      hostname: "127.0.0.1",
    },
    "2026-08-14T00:02:00.000Z",
  );
}

function sqlText(query) {
  assert.equal(typeof query.sql, "string");
  assert.ok(Array.isArray(query.values));
  return query.sql;
}

function identityRow(overrides = {}) {
  return {
    currentUser: OWNER,
    databaseName: DATABASE,
    databaseOid: BigInt(DATABASE_OID),
    databaseOwnerRoleOid: BigInt(OWNER_OID),
    ownerRoleOid: BigInt(OWNER_OID),
    runtimeBypassRls: false,
    runtimeCanLogin: true,
    runtimeCreateDatabase: false,
    runtimeCreateRole: false,
    runtimeInherit: false,
    runtimeMembershipCount: 0n,
    runtimeReplication: false,
    runtimeRoleName: RUNTIME,
    runtimeRoleOid: BigInt(RUNTIME_OID),
    runtimeSuperuser: false,
    sessionUser: OWNER,
    ...overrides,
  };
}

function client(overrides = {}) {
  const observed = { disconnects: 0, queries: [] };
  const value = {
    async $disconnect() {
      observed.disconnects += 1;
    },
    async $queryRaw(query) {
      const text = sqlText(query);
      observed.queries.push({ text, values: [...query.values] });
      if (overrides.query) {
        const result = await overrides.query(query, observed);
        if (result !== undefined) return result;
      }
      if (text.includes("pg_catalog.current_database")) {
        return [identityRow()];
      }
      if (text.includes("registration_register_current199_v1")) {
        return [
          {
            registrationId: "enrollment_current199_0001",
            replayed: false,
            status: "PENDING",
            validUntil: new Date(VALID_UNTIL),
          },
        ];
      }
      if (text.includes("registration_expire_current199_v1")) {
        return [
          {
            expiredAt: new Date("2026-08-14T00:06:00.000Z"),
            registrationId: "enrollment_current199_0001",
            replayed: false,
            status: "EXPIRED",
          },
        ];
      }
      return [];
    },
  };
  return { observed, value };
}

function fixture(overrides) {
  const owner = client(overrides);
  const driver =
    createLangameRuntimeTrustRegistrationPrismaCurrent199ForTestOnly(
      config,
      owner.value,
      LANGAME_RUNTIME_TRUST_REGISTRATION_PRISMA_CURRENT199_TEST_CONFIRMATION,
    );
  return { driver, owner, registration: registrationFixture() };
}

const code = (expected) => (error) =>
  error?.code === expected && error.safeContractError;

test("CURRENT199 Prisma production entry and unconfirmed injection deny", () => {
  assert.throws(
    () => createLangameRuntimeTrustRegistrationPrismaCurrent199(),
    code("CURRENT199_PRISMA_PRODUCTION_DENIED"),
  );
  assert.throws(
    () =>
      createLangameRuntimeTrustRegistrationPrismaCurrent199ForTestOnly(
        config,
        client().value,
        "wrong",
      ),
    code("CURRENT199_PRISMA_TEST_INJECTION_DENIED"),
  );
  const { driver } = fixture();
  assert.equal(isLangameRuntimeTrustRegistrationPrismaCurrent199(driver), true);
  assert.equal(
    isLangameRuntimeTrustRegistrationPrismaCurrent199({ ...driver }),
    false,
  );
});

test("CURRENT199 Prisma maps one exact branded registration", async () => {
  const { driver, owner, registration } = fixture();
  const receipt = await driver.registerCurrent199(registration);
  assert.equal(receipt.registrationId, registration.enrollmentId);
  assert.equal(receipt.registrationDigest, registration.registrationDigest);
  assert.equal(receipt.persistedStatus, "PENDING");
  assert.equal(receipt.authorization, false);
  assert.equal(Object.isFrozen(receipt), true);
  const register = owner.observed.queries.find((entry) =>
    entry.text.includes("registration_register_current199_v1"),
  );
  assert.equal(register.values.length, 44);
  assert.equal(register.values[0], registration.enrollmentId);
  assert.equal(register.values[2], registration.registrationDigest);
  assert.equal(register.values.at(-1), true);
  await driver.close();
  await driver.close();
  assert.equal(owner.observed.disconnects, 1);
});

test("CURRENT199 Prisma bounds and reconciles a lost register response", async () => {
  let attempts = 0;
  const value = fixture({
    query(query) {
      const text = sqlText(query);
      if (!text.includes("registration_register_current199_v1")) return;
      attempts += 1;
      if (attempts === 1) throw new Error("lost register response");
      return [
        {
          registrationId: "enrollment_current199_0001",
          replayed: true,
          status: "PENDING",
          validUntil: new Date(VALID_UNTIL),
        },
      ];
    },
  });
  await assert.rejects(
    value.driver.registerCurrent199(value.registration),
    /lost register response/u,
  );
  const receipt = await value.driver.registerCurrent199(value.registration);
  assert.equal(receipt.replayed, true);
  assert.equal(attempts, 2);
  await assert.rejects(
    value.driver.registerCurrent199(value.registration),
    code("CURRENT199_PRISMA_REGISTER_STATE_INVALID"),
  );
});

test("CURRENT199 Prisma bounds and reconciles a lost expiry response", async () => {
  let attempts = 0;
  const value = fixture({
    query(query) {
      const text = sqlText(query);
      if (!text.includes("registration_expire_current199_v1")) return;
      attempts += 1;
      if (attempts === 1) throw new Error("lost expiry response");
      return [
        {
          expiredAt: new Date("2026-08-14T00:06:00.000Z"),
          registrationId: "enrollment_current199_0001",
          replayed: true,
          status: "EXPIRED",
        },
      ];
    },
  });
  const receipt = await value.driver.registerCurrent199(value.registration);
  await assert.rejects(
    value.driver.expireCurrent199(receipt),
    /lost expiry response/u,
  );
  const terminal = await value.driver.expireCurrent199(receipt);
  assert.equal(terminal.status, "EXPIRED");
  assert.equal(terminal.replayed, true);
  assert.equal(terminal.authorization, false);
  assert.equal(attempts, 2);
});

test("CURRENT199 Prisma fails closed after a second lost effect response", async () => {
  const registering = fixture({
    query(query) {
      if (sqlText(query).includes("registration_register_current199_v1")) {
        throw new Error("register response unavailable");
      }
    },
  });
  await assert.rejects(
    registering.driver.registerCurrent199(registering.registration),
    /register response unavailable/u,
  );
  await assert.rejects(
    registering.driver.registerCurrent199(registering.registration),
    code("CURRENT199_PRISMA_REGISTER_RESPONSE_AMBIGUOUS"),
  );

  const expiring = fixture({
    query(query) {
      if (sqlText(query).includes("registration_expire_current199_v1")) {
        throw new Error("expiry response unavailable");
      }
    },
  });
  const receipt = await expiring.driver.registerCurrent199(
    expiring.registration,
  );
  await assert.rejects(
    expiring.driver.expireCurrent199(receipt),
    /expiry response unavailable/u,
  );
  await assert.rejects(
    expiring.driver.expireCurrent199(receipt),
    code("CURRENT199_PRISMA_EXPIRE_RESPONSE_AMBIGUOUS"),
  );
});

test("CURRENT199 Prisma rejects clones, identity drift and forged receipts", async () => {
  const first = fixture();
  await assert.rejects(
    first.driver.registerCurrent199({ ...first.registration }),
    code("CURRENT199_PRISMA_REGISTRATION_INVALID"),
  );
  for (const identityDrift of [
    { runtimeCreateRole: true },
    { databaseOwnerRoleOid: BigInt(OWNER_OID + 1) },
    { runtimeMembershipCount: 1n },
  ]) {
    const drift = fixture({
      query(query) {
        if (!sqlText(query).includes("pg_catalog.current_database")) return;
        return [identityRow(identityDrift)];
      },
    });
    await assert.rejects(
      drift.driver.registerCurrent199(drift.registration),
      code("CURRENT199_PRISMA_SESSION_IDENTITY_INVALID"),
    );
  }
  const third = fixture();
  const receipt = await third.driver.registerCurrent199(third.registration);
  await assert.rejects(
    third.driver.expireCurrent199({ ...receipt }),
    code("CURRENT199_PRISMA_EXPIRE_RECEIPT_INVALID"),
  );
});

test("CURRENT199 Prisma rejects proxy and accessor clients without invocation", () => {
  let calls = 0;
  const accessor = {
    async $disconnect() {},
    get $queryRaw() {
      calls += 1;
      return async () => [];
    },
  };
  assert.throws(
    () =>
      createLangameRuntimeTrustRegistrationPrismaCurrent199ForTestOnly(
        config,
        accessor,
        LANGAME_RUNTIME_TRUST_REGISTRATION_PRISMA_CURRENT199_TEST_CONFIRMATION,
      ),
    code("CURRENT199_PRISMA_CLIENT_INVALID"),
  );
  assert.equal(calls, 0);
  assert.throws(
    () =>
      createLangameRuntimeTrustRegistrationPrismaCurrent199ForTestOnly(
        config,
        new Proxy(client().value, {}),
        LANGAME_RUNTIME_TRUST_REGISTRATION_PRISMA_CURRENT199_TEST_CONFIRMATION,
      ),
    code("CURRENT199_PRISMA_CLIENT_INVALID"),
  );
});

test("CURRENT199 Prisma adapter has no production connection authority", async () => {
  const source = await readFile(
    fileURLToPath(
      new URL(
        "./langame-runtime-trust-registration-prisma-current199.mjs",
        import.meta.url,
      ),
    ),
    "utf8",
  );
  assert.match(
    source,
    /createLangameRuntimeTrustRegistrationPrismaCurrent199\(\)\s*\{\s*fail\("CURRENT199_PRISMA_PRODUCTION_DENIED"\)/u,
  );
  for (const forbidden of [
    /PrismaClient/u,
    /process\.env/u,
    /node:(?:child_process|fs|http|https|net|tls)/u,
  ]) {
    assert.doesNotMatch(source, forbidden);
  }
});

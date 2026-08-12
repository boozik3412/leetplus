import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  CURRENT187_ENDPOINT_TLS_PEER_PRODUCTION_CONFIRMATION,
  CURRENT187_ENDPOINT_TLS_PEER_STATUS,
  CURRENT187_ENDPOINT_TLS_PEER_SYNTHETIC_CONFIRMATION,
  collectCurrent187EndpointTlsPeerEvidenceWithDependenciesForTestOnly,
  collectSyntheticCurrent187EndpointTlsPeerEvidenceWithDependenciesForTestOnly,
  isVerifiedCurrent187EndpointTlsPeerReceipt,
} from "./identity-mail-cluster-endpoint-tls-peer-collector-current187.mjs";

const NOW = "2026-08-12T00:00:00.000Z";
const RELEASE_SHA = "a".repeat(40);
const CA_PEM =
  "-----BEGIN CERTIFICATE-----\nVEVTVA==\n-----END CERTIFICATE-----\n";
const LEAF_CERTIFICATE_SHA256 = "b".repeat(64);
const LEAF_SPKI_SHA256 = "c".repeat(64);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function input(overrides = {}, production = false) {
  return {
    caCertificatePem: CA_PEM,
    caCertificateSha256: sha256(Buffer.from(CA_PEM, "utf8")),
    clusterIdentityDigest: "1".repeat(64),
    connectTimeoutMs: 5_000,
    databaseUniverseDigest: "2".repeat(64),
    endpointClass: "POOLER",
    endpointHost: production ? "db.example.com" : "localhost",
    endpointPort: production ? 6432 : 55432,
    environment: production ? "production" : "ci",
    expectedLeafCertificateSha256: LEAF_CERTIFICATE_SHA256,
    expectedLeafSpkiSha256: LEAF_SPKI_SHA256,
    expectedResolvedAddresses: [{ address: "127.0.0.1", family: 4 }],
    explicitConfirmation: production
      ? CURRENT187_ENDPOINT_TLS_PEER_PRODUCTION_CONFIRMATION
      : CURRENT187_ENDPOINT_TLS_PEER_SYNTHETIC_CONFIRMATION,
    handshakeTimeoutMs: 10_000,
    postgresSessionReceiptDigest: "3".repeat(64),
    purpose: "APPLICATION",
    releaseSha: RELEASE_SHA,
    secretReferenceDigest: "4".repeat(64),
    serverName: production ? "db.example.com" : "localhost",
    verificationChallengeDigest: "5".repeat(64),
    ...overrides,
  };
}

function observation(overrides = {}, production = false) {
  return {
    alpnProtocol: null,
    authorizationError: null,
    authorized: true,
    cipherName: "TLS_AES_256_GCM_SHA384",
    leafCertificateSha256: LEAF_CERTIFICATE_SHA256,
    leafSpkiSha256: LEAF_SPKI_SHA256,
    leafValidFrom: "2026-08-11T00:00:00.000Z",
    leafValidTo: "2026-08-14T00:00:00.000Z",
    localAddress: "127.0.0.1",
    localPort: 50123,
    protocol: "TLSv1.3",
    remoteAddress: "127.0.0.1",
    remotePort: production ? 6432 : 55432,
    serverName: production ? "db.example.com" : "localhost",
    ...overrides,
  };
}

function dependencies({
  connectError = null,
  now = NOW,
  observationValue = observation(),
  resolveError = null,
  resolvedAddresses = [{ address: "127.0.0.1", family: 4 }],
} = {}) {
  const calls = [];
  const dependency = {
    async connectEndpoint(value) {
      calls.push({ kind: "connectEndpoint", value });
      if (connectError) throw connectError;
      return observationValue;
    },
    now() {
      calls.push({ kind: "now" });
      return now;
    },
    async resolveEndpoint(hostname) {
      calls.push({ hostname, kind: "resolveEndpoint" });
      if (resolveError) throw resolveError;
      return resolvedAddresses;
    },
  };
  return { calls, dependency };
}

async function collectSynthetic(inputOverrides = {}, dependencyOptions = {}) {
  const fixture = dependencies(dependencyOptions);
  const receipt =
    await collectSyntheticCurrent187EndpointTlsPeerEvidenceWithDependenciesForTestOnly(
      input(inputOverrides),
      fixture.dependency,
    );
  return { ...fixture, receipt };
}

test("actual endpoint/TLS dependency path returns only a branded deny-only observation", async () => {
  const { calls, receipt } = await collectSynthetic();
  assert.equal(isVerifiedCurrent187EndpointTlsPeerReceipt(receipt), true);
  assert.equal(receipt.status, CURRENT187_ENDPOINT_TLS_PEER_STATUS);
  assert.equal(receipt.sourceNetworkIoPerformed, true);
  assert.equal(receipt.dnsResolutionMatched, true);
  assert.equal(receipt.selectedAddressMatched, true);
  assert.equal(receipt.postgresSslRequestAccepted, true);
  assert.equal(receipt.endpointIdentityObserved, true);
  assert.equal(receipt.tlsPeerIdentityObserved, true);
  assert.equal(receipt.tlsCaVerified, true);
  assert.equal(receipt.tlsHostnameVerified, true);
  assert.equal(receipt.syntheticOnly, true);
  for (const key of [
    "endpointIdentityAttested",
    "tlsPeerIdentityAttested",
    "hbaRuleMatched",
    "poolerIdentityObserved",
    "negativeProbePerformed",
    "productionRootEnrolled",
    "productionRuntimeAttested",
    "authorization",
    "canMutate",
    "canSend",
    "testAccessAuthorized",
    "sharedBetaAccess",
  ]) {
    assert.equal(receipt[key], false, `${key} must remain false`);
  }
  for (const key of [
    "endpointObservationDigest",
    "endpointTlsPeerReceiptDigest",
    "tlsPeerObservationDigest",
  ]) {
    assert.match(receipt[key], /^[a-f0-9]{64}$/u);
  }
  assert.deepEqual(
    calls.map((call) => call.kind),
    ["resolveEndpoint", "connectEndpoint", "now"],
  );
  assert.deepEqual(calls[1].value, {
    address: "127.0.0.1",
    caCertificatePem: CA_PEM,
    connectTimeoutMs: 5_000,
    endpointPort: 55432,
    family: 4,
    handshakeTimeoutMs: 10_000,
    serverName: "localhost",
  });
  const serialized = JSON.stringify(receipt);
  assert.doesNotMatch(serialized, /BEGIN CERTIFICATE/u);
  assert.doesNotMatch(serialized, /localhost/u);
  assert.equal(Object.isFrozen(receipt), true);
});

test("production mode requires DNS hostname, exact purpose endpoint class, and explicit confirmation", async () => {
  const fixture = dependencies({
    observationValue: observation({}, true),
  });
  const receipt =
    await collectCurrent187EndpointTlsPeerEvidenceWithDependenciesForTestOnly(
      input({}, true),
      fixture.dependency,
    );
  assert.equal(receipt.syntheticOnly, false);
  assert.equal(receipt.productionRuntimeAttested, false);

  for (const mutation of [
    { endpointHost: "127.0.0.1", serverName: "127.0.0.1" },
    { endpointHost: "LOCALHOST", serverName: "LOCALHOST" },
    {
      explicitConfirmation: CURRENT187_ENDPOINT_TLS_PEER_SYNTHETIC_CONFIRMATION,
    },
    { endpointClass: "DIRECT_DATABASE" },
    { serverName: "other.example.com" },
  ]) {
    await assert.rejects(
      collectCurrent187EndpointTlsPeerEvidenceWithDependenciesForTestOnly(
        input(mutation, true),
        fixture.dependency,
      ),
      /input binding|hostname is unsafe/u,
    );
  }
});

test("DNS resolution is canonical, exact, duplicate-free, and checked before connect", async () => {
  const twoAddressInput = {
    expectedResolvedAddresses: [
      { address: "127.0.0.1", family: 4 },
      { address: "::1", family: 6 },
    ],
  };
  const reversedActual = dependencies({
    resolvedAddresses: [
      { address: "::1", family: 6 },
      { address: "127.0.0.1", family: 4 },
    ],
  });
  const receipt =
    await collectSyntheticCurrent187EndpointTlsPeerEvidenceWithDependenciesForTestOnly(
      input(twoAddressInput),
      reversedActual.dependency,
    );
  assert.equal(receipt.dnsResolutionMatched, true);

  for (const resolvedAddresses of [
    [{ address: "127.0.0.2", family: 4 }],
    [
      { address: "127.0.0.1", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ],
    [{ address: "not-an-ip", family: 4 }],
  ]) {
    const fixture = dependencies({ resolvedAddresses });
    await assert.rejects(
      collectSyntheticCurrent187EndpointTlsPeerEvidenceWithDependenciesForTestOnly(
        input(),
        fixture.dependency,
      ),
      /collection failed closed/u,
    );
    assert.equal(
      fixture.calls.some((call) => call.kind === "connectEndpoint"),
      false,
    );
  }

  const nonCanonical = input({
    expectedResolvedAddresses: [
      { address: "::1", family: 6 },
      { address: "127.0.0.1", family: 4 },
    ],
  });
  await assert.rejects(
    collectSyntheticCurrent187EndpointTlsPeerEvidenceWithDependenciesForTestOnly(
      nonCanonical,
      reversedActual.dependency,
    ),
    /canonical order/u,
  );
});

test("TLS authorization, hostname, peer hashes, protocol, endpoint, and validity drift fail closed", async () => {
  const mutations = [
    { authorized: false },
    { authorizationError: "CERT_HAS_EXPIRED" },
    { alpnProtocol: "h2" },
    { serverName: "other.example.com" },
    { protocol: "TLSv1.1" },
    { cipherName: "" },
    { leafCertificateSha256: "d".repeat(64) },
    { leafSpkiSha256: "e".repeat(64) },
    { remoteAddress: "127.0.0.2" },
    { remotePort: 5432 },
    { localAddress: null },
    { localPort: 0 },
    { leafValidFrom: "2026-08-13T00:00:00.000Z" },
    { leafValidTo: NOW },
  ];
  for (const mutation of mutations) {
    const fixture = dependencies({
      observationValue: observation(mutation),
    });
    await assert.rejects(
      collectSyntheticCurrent187EndpointTlsPeerEvidenceWithDependenciesForTestOnly(
        input(),
        fixture.dependency,
      ),
      /collection failed closed/u,
    );
  }
});

test("CA bytes, certificate hashes, binding digests, ports, and timeouts fail before network I/O", async () => {
  for (const mutation of [
    { caCertificatePem: `${CA_PEM}x` },
    { caCertificateSha256: "0".repeat(64) },
    { expectedLeafCertificateSha256: "not-a-digest" },
    { postgresSessionReceiptDigest: "0".repeat(64) },
    { endpointPort: 0 },
    { connectTimeoutMs: 10_001 },
    { handshakeTimeoutMs: 15_001 },
  ]) {
    const fixture = dependencies();
    await assert.rejects(
      collectSyntheticCurrent187EndpointTlsPeerEvidenceWithDependenciesForTestOnly(
        input(mutation),
        fixture.dependency,
      ),
    );
    assert.equal(fixture.calls.length, 0);
  }
});

test("resolution and TLS failures are secret-free and never return partial evidence", async () => {
  const secret = "do-not-leak-endpoint-secret";
  for (const dependencyOptions of [
    { resolveError: new Error(secret) },
    { connectError: new Error(secret) },
  ]) {
    const fixture = dependencies(dependencyOptions);
    await assert.rejects(
      collectSyntheticCurrent187EndpointTlsPeerEvidenceWithDependenciesForTestOnly(
        input(),
        fixture.dependency,
      ),
      (error) => {
        assert.equal(
          error.code,
          "CURRENT187_ENDPOINT_TLS_PEER_COLLECTION_FAILED",
        );
        assert.doesNotMatch(error.message, new RegExp(secret, "u"));
        return true;
      },
    );
  }
});

test("input, dependencies, address rows, and observation reject proxy/accessor/extra shapes", async () => {
  const fixture = dependencies();
  await assert.rejects(
    collectSyntheticCurrent187EndpointTlsPeerEvidenceWithDependenciesForTestOnly(
      new Proxy(input(), {}),
      fixture.dependency,
    ),
    /exact data-only record/u,
  );
  await assert.rejects(
    collectSyntheticCurrent187EndpointTlsPeerEvidenceWithDependenciesForTestOnly(
      input(),
      new Proxy(fixture.dependency, {}),
    ),
    /exact data-only record/u,
  );

  let getterCalls = 0;
  const hostileObservation = observation();
  Object.defineProperty(hostileObservation, "authorized", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return true;
    },
  });
  const hostile = dependencies({ observationValue: hostileObservation });
  await assert.rejects(
    collectSyntheticCurrent187EndpointTlsPeerEvidenceWithDependenciesForTestOnly(
      input(),
      hostile.dependency,
    ),
    /collection failed closed/u,
  );
  assert.equal(getterCalls, 0);
});

test("purpose fixes endpoint class and keeps four service identities separate", async () => {
  const cases = [
    ["APPLICATION", "POOLER"],
    ["COORDINATOR", "DIRECT_DATABASE"],
    ["MIGRATION", "DIRECT_DATABASE"],
    ["WORKER", "DIRECT_DATABASE"],
  ];
  const receipts = [];
  for (const [purpose, endpointClass] of cases) {
    const fixture = dependencies();
    receipts.push(
      await collectSyntheticCurrent187EndpointTlsPeerEvidenceWithDependenciesForTestOnly(
        input({
          endpointClass,
          postgresSessionReceiptDigest: sha256(purpose),
          purpose,
          secretReferenceDigest: sha256(`${purpose}-secret`),
        }),
        fixture.dependency,
      ),
    );
  }
  assert.equal(new Set(receipts.map((entry) => entry.purpose)).size, 4);
  assert.equal(
    new Set(receipts.map((entry) => entry.endpointTlsPeerReceiptDigest)).size,
    4,
  );
});

test("receipt brand rejects clones and wrong arity", async () => {
  const { receipt } = await collectSynthetic();
  assert.equal(
    isVerifiedCurrent187EndpointTlsPeerReceipt({ ...receipt }),
    false,
  );
  assert.equal(
    isVerifiedCurrent187EndpointTlsPeerReceipt(receipt, true),
    false,
  );
  await assert.rejects(
    collectSyntheticCurrent187EndpointTlsPeerEvidenceWithDependenciesForTestOnly(
      input(),
    ),
    /accepts exact input and dependencies/u,
  );
});

test("source uses bounded DNS, TCP, PostgreSQL SSLRequest, and verify-full TLS without other capabilities", async () => {
  const source = await readFile(
    new URL(
      "./identity-mail-cluster-endpoint-tls-peer-collector-current187.mjs",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(source, /from "node:dns\/promises"/u);
  assert.match(source, /from "node:net"/u);
  assert.match(source, /from "node:tls"/u);
  assert.match(source, /SSL_REQUEST_CODE/u);
  assert.match(source, /rejectUnauthorized:\s*true/u);
  assert.match(source, /minVersion:\s*"TLSv1\.2"/u);
  assert.match(source, /checkServerIdentity/u);
  assert.match(source, /endpointIdentityAttested:\s*false/u);
  assert.match(source, /tlsPeerIdentityAttested:\s*false/u);
  assert.match(source, /hbaRuleMatched:\s*false/u);
  assert.match(source, /poolerIdentityObserved:\s*false/u);
  assert.match(source, /negativeProbePerformed:\s*false/u);
  assert.doesNotMatch(
    source,
    /node:fs|node:child_process|@prisma|process\.env|fetch\s*\(|nodemailer|smtp|providerPayload/u,
  );
});

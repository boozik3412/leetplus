import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  CURRENT187_NETWORK_RUNTIME_SERVICE_PURPOSES,
  CURRENT187_NETWORK_RUNTIME_STATUS,
  createSyntheticCurrent187HostControlReceiptForTestOnly,
  createSyntheticCurrent187NetworkProbeReceiptForTestOnly,
  evaluateCurrent187NetworkRuntimeAttestation,
  isVerifiedCurrent187NetworkRuntimeAttestationReceipt,
} from "./identity-mail-cluster-network-runtime-attestation-current187.mjs";

const RELEASE_SHA = "a".repeat(40);
const DIGEST = Object.freeze({
  challenge: "1".repeat(64),
  cluster: "2".repeat(64),
  universe: "3".repeat(64),
});
const PURPOSE_SEED = Object.freeze({
  APPLICATION: "4",
  COORDINATOR: "5",
  MIGRATION: "6",
  WORKER: "7",
});
const POOL_MODE = Object.freeze({
  APPLICATION: "TRANSACTION",
  COORDINATOR: "SESSION",
  MIGRATION: "SESSION",
  WORKER: "SESSION",
});

function digest(seed) {
  return seed.padStart(64, "0");
}

function service(purpose, overrides = {}) {
  const seed = PURPOSE_SEED[purpose];
  return {
    allowedOperationsDigest: digest(seed),
    applicationNameDigest: digest(String(Number(seed) + 1)),
    backendIdentityDigest: digest(String(Number(seed) + 2)),
    endpointClass: purpose === "APPLICATION" ? "POOLER" : "DIRECT_DATABASE",
    endpointDigest: digest(String(Number(seed) + 3)),
    hbaAuthMethod: "scram-sha-256",
    hbaRuleDigest: digest(String(Number(seed) + 4)),
    negativeProbeDigest: digest(String(Number(seed) + 5)),
    negativeProbePassed: true,
    poolerMappingDigest: digest(String(Number(seed) + 6)),
    poolMode: POOL_MODE[purpose],
    positiveProbeDigest: digest(String(Number(seed) + 7)),
    positiveProbePassed: true,
    purpose,
    secretReferenceDigest: digest(String(Number(seed) + 8)),
    tlsMode: "VERIFY_FULL",
    tlsPeerDigest: digest(String(Number(seed) + 9)),
    ...overrides,
  };
}

function networkInput(overrides = {}) {
  return {
    clusterIdentityDigest: DIGEST.cluster,
    databaseUniverseDigest: DIGEST.universe,
    environment: "ci",
    hostControlChallengeDigest: DIGEST.challenge,
    releaseSha: RELEASE_SHA,
    services: CURRENT187_NETWORK_RUNTIME_SERVICE_PURPOSES.map((purpose) =>
      service(purpose),
    ),
    ...overrides,
  };
}

function hostInput(networkProbeDigest, overrides = {}) {
  return {
    approvedNetworkProbeDigest: networkProbeDigest,
    clusterIdentityDigest: DIGEST.cluster,
    controlPlaneSourceDigest: "b".repeat(64),
    databaseUniverseDigest: DIGEST.universe,
    environment: "ci",
    externalAuditDigest: "c".repeat(64),
    hbaRulesDigest: "d".repeat(64),
    hostControlChallengeDigest: DIGEST.challenge,
    negativeProbeMatrixPassed: true,
    poolerConfigurationDigest: "e".repeat(64),
    poolerUserCollapseAbsent: true,
    releaseSha: RELEASE_SHA,
    reloadEpochDigest: "f".repeat(64),
    serviceAccountPolicyDigest: "a".repeat(64),
    serviceAccountsDistinct: true,
    tlsConfigurationDigest: "b".repeat(64),
    tlsRequired: true,
    trustAuthenticationAbsent: true,
    wildcardClientRulesAbsent: true,
    ...overrides,
  };
}

function fixture(networkOverrides = {}, hostOverrides = {}) {
  const network = createSyntheticCurrent187NetworkProbeReceiptForTestOnly(
    networkInput(networkOverrides),
  );
  const host = createSyntheticCurrent187HostControlReceiptForTestOnly(
    hostInput(network.networkProbeDigest, hostOverrides),
  );
  return { host, network };
}

test("four exact service paths produce five deployment digests but no authority", () => {
  const { host, network } = fixture();
  const receipt = evaluateCurrent187NetworkRuntimeAttestation(network, host);
  assert.equal(
    isVerifiedCurrent187NetworkRuntimeAttestationReceipt(receipt),
    true,
  );
  assert.equal(receipt.status, CURRENT187_NETWORK_RUNTIME_STATUS);
  for (const key of [
    "networkEndpointDigest",
    "tlsDigest",
    "hbaDigest",
    "poolerDigest",
    "serviceAccountMappingDigest",
    "networkRuntimeAttestationDigest",
  ]) {
    assert.match(receipt[key], /^[a-f0-9]{64}$/u);
  }
  assert.equal(receipt.hostControlEvidenceMatched, true);
  assert.equal(receipt.syntheticOnly, true);
  assert.equal(receipt.authorization, false);
  assert.equal(receipt.canMutate, false);
  assert.equal(receipt.canSend, false);
  assert.equal(receipt.productionRootEnrolled, false);
  assert.equal(receipt.productionRuntimeAttested, false);
  assert.equal(receipt.sharedBetaAccess, false);
  assert.equal(receipt.testAccessAuthorized, false);
  assert.equal(Object.isFrozen(receipt), true);
});

test("deployment digests are deterministic and scoped to their exact evidence", () => {
  const first = fixture();
  const second = fixture();
  const a = evaluateCurrent187NetworkRuntimeAttestation(
    first.network,
    first.host,
  );
  const b = evaluateCurrent187NetworkRuntimeAttestation(
    second.network,
    second.host,
  );
  assert.deepEqual(a, b);

  const changed = fixture(
    {
      services: CURRENT187_NETWORK_RUNTIME_SERVICE_PURPOSES.map((purpose) =>
        service(
          purpose,
          purpose === "APPLICATION" ? { endpointDigest: "c".repeat(64) } : {},
        ),
      ),
    },
    {},
  );
  const c = evaluateCurrent187NetworkRuntimeAttestation(
    changed.network,
    changed.host,
  );
  assert.notEqual(a.networkEndpointDigest, c.networkEndpointDigest);
  assert.notEqual(
    a.networkRuntimeAttestationDigest,
    c.networkRuntimeAttestationDigest,
  );
  assert.equal(a.tlsDigest, c.tlsDigest);
});

test("service purpose order, completeness, and density are exact", () => {
  const reversed = networkInput();
  reversed.services.reverse();
  assert.throws(
    () => createSyntheticCurrent187NetworkProbeReceiptForTestOnly(reversed),
    /Service purpose/u,
  );

  const missing = networkInput();
  missing.services.pop();
  assert.throws(
    () => createSyntheticCurrent187NetworkProbeReceiptForTestOnly(missing),
    /exact dense array/u,
  );

  const sparse = networkInput();
  delete sparse.services[2];
  assert.throws(
    () => createSyntheticCurrent187NetworkProbeReceiptForTestOnly(sparse),
    /exact dense array/u,
  );
});

test("service-account collapse fails closed across backend, pooler, secret, and application identity", () => {
  for (const key of [
    "applicationNameDigest",
    "backendIdentityDigest",
    "poolerMappingDigest",
    "secretReferenceDigest",
  ]) {
    const input = networkInput();
    input.services[1][key] = input.services[0][key];
    assert.throws(
      () => createSyntheticCurrent187NetworkProbeReceiptForTestOnly(input),
      /distinct service-account mapping/u,
    );
  }
});

test("unsafe TLS, HBA, pool mode, and incomplete probes fail closed", () => {
  for (const [purpose, mutation] of [
    ["APPLICATION", { tlsMode: "REQUIRE" }],
    ["APPLICATION", { hbaAuthMethod: "trust" }],
    ["COORDINATOR", { poolMode: "TRANSACTION" }],
    ["MIGRATION", { positiveProbePassed: false }],
    ["WORKER", { negativeProbePassed: false }],
  ]) {
    const input = networkInput();
    const index = CURRENT187_NETWORK_RUNTIME_SERVICE_PURPOSES.indexOf(purpose);
    input.services[index] = service(purpose, mutation);
    assert.throws(
      () => createSyntheticCurrent187NetworkProbeReceiptForTestOnly(input),
      /is unsafe/u,
    );
  }
});

test("host policy rejects trust, wildcard, TLS, pooler collapse, service collapse, and negative-probe gaps", () => {
  const network =
    createSyntheticCurrent187NetworkProbeReceiptForTestOnly(networkInput());
  for (const key of [
    "negativeProbeMatrixPassed",
    "poolerUserCollapseAbsent",
    "serviceAccountsDistinct",
    "tlsRequired",
    "trustAuthenticationAbsent",
    "wildcardClientRulesAbsent",
  ]) {
    assert.throws(
      () =>
        createSyntheticCurrent187HostControlReceiptForTestOnly(
          hostInput(network.networkProbeDigest, { [key]: false }),
        ),
      /does not prove/u,
    );
  }
});

test("cross-cluster, cross-release, cross-challenge, and unapproved probe combinations are rejected", () => {
  const { network } = fixture();
  for (const mutation of [
    { approvedNetworkProbeDigest: "9".repeat(64) },
    { clusterIdentityDigest: "8".repeat(64) },
    { databaseUniverseDigest: "7".repeat(64) },
    { hostControlChallengeDigest: "6".repeat(64) },
    { releaseSha: "5".repeat(40) },
  ]) {
    const host = createSyntheticCurrent187HostControlReceiptForTestOnly(
      hostInput(network.networkProbeDigest, mutation),
    );
    assert.throws(
      () => evaluateCurrent187NetworkRuntimeAttestation(network, host),
      /do not describe the same/u,
    );
  }
});

test("missing, extra, proxy, symbol, and accessor inputs are rejected without invoking accessors", () => {
  const missing = networkInput();
  delete missing.releaseSha;
  assert.throws(
    () => createSyntheticCurrent187NetworkProbeReceiptForTestOnly(missing),
    /exact data-only record/u,
  );

  assert.throws(
    () =>
      createSyntheticCurrent187NetworkProbeReceiptForTestOnly({
        ...networkInput(),
        password: "secret",
      }),
    /exact data-only record/u,
  );
  assert.throws(
    () =>
      createSyntheticCurrent187NetworkProbeReceiptForTestOnly(
        new Proxy(networkInput(), {}),
      ),
    /exact data-only record/u,
  );

  const symbol = networkInput();
  symbol[Symbol("extra")] = true;
  assert.throws(
    () => createSyntheticCurrent187NetworkProbeReceiptForTestOnly(symbol),
    /exact data-only record/u,
  );

  let getterCalls = 0;
  const accessor = networkInput();
  Object.defineProperty(accessor.services[0], "endpointDigest", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return "a".repeat(64);
    },
  });
  assert.throws(
    () => createSyntheticCurrent187NetworkProbeReceiptForTestOnly(accessor),
    /exact data-only record/u,
  );
  assert.equal(getterCalls, 0);
});

test("plain clones cannot cross either branded evidence boundary", () => {
  const { host, network } = fixture();
  assert.throws(
    () => evaluateCurrent187NetworkRuntimeAttestation({ ...network }, host),
    /exact branded probe/u,
  );
  assert.throws(
    () => evaluateCurrent187NetworkRuntimeAttestation(network, { ...host }),
    /exact branded host-control/u,
  );
  const receipt = evaluateCurrent187NetworkRuntimeAttestation(network, host);
  assert.equal(
    isVerifiedCurrent187NetworkRuntimeAttestationReceipt({ ...receipt }),
    false,
  );
  assert.equal(
    isVerifiedCurrent187NetworkRuntimeAttestationReceipt(receipt, true),
    false,
  );
});

test("foundation is secret-free, capability-free, synthetic-only, and visibly non-authorizing", async () => {
  const { host, network } = fixture();
  const receipt = evaluateCurrent187NetworkRuntimeAttestation(network, host);
  const serialized = JSON.stringify(receipt);
  assert.doesNotMatch(
    serialized,
    /password|postgresql:\/\/|BEGIN PRIVATE KEY|@/iu,
  );

  const source = await readFile(
    new URL(
      "./identity-mail-cluster-network-runtime-attestation-current187.mjs",
      import.meta.url,
    ),
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /(?:node:fs|node:net|node:tls|node:child_process|@prisma|DATABASE_URL|postgresql:\/\/|process\.env|fetch\s*\(|secretManager)/iu,
  );
  assert.match(source, /ForTestOnly/u);
  assert.match(source, /authorization:\s*false/u);
  assert.match(source, /productionRuntimeAttested:\s*false/u);
  assert.match(source, /testAccessAuthorized:\s*false/u);
});

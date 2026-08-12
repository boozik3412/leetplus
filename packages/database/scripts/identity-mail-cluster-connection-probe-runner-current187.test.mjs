import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  CURRENT187_CONNECTION_NEGATIVE_OUTCOME_BY_SCENARIO,
  CURRENT187_CONNECTION_NEGATIVE_SCENARIOS,
} from "./identity-mail-cluster-connection-probe-attestation-current187.mjs";
import {
  CURRENT187_CONNECTION_PROBE_RUNNER_KIND,
  CURRENT187_CONNECTION_PROBE_RUNNER_STATUS,
  CURRENT187_CONNECTION_PROBE_RUNNER_SYNTHETIC_CONFIRMATION,
  Current187AdmissionContractError,
  isVerifiedCurrent187ConnectionProbeRunnerReceipt,
  runCurrent187ConnectionProbeMatrix,
  runSyntheticCurrent187ConnectionProbeMatrixWithDependenciesForTestOnly,
} from "./identity-mail-cluster-connection-probe-runner-current187.mjs";
import { CURRENT187_ENDPOINT_TLS_PEER_RECEIPT_KIND } from "./identity-mail-cluster-endpoint-tls-peer-collector-current187.mjs";
import { CURRENT187_NETWORK_RUNTIME_SERVICE_PURPOSES } from "./identity-mail-cluster-network-runtime-attestation-current187.mjs";
import { CURRENT187_POSTGRES_SESSION_RECEIPT_KIND } from "./identity-mail-cluster-postgres-session-collector-current187.mjs";

const RELEASE_SHA = "a".repeat(40);
const CLUSTER_DIGEST = digest("cluster");
const UNIVERSE_DIGEST = digest("universe");

function digest(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function session(purpose, index, overrides = {}) {
  return {
    applicationNameDigest: digest(`${purpose}:application`),
    authorization: false,
    backendIdentityDigest: digest(`${purpose}:backend`),
    canMutate: false,
    canSend: false,
    clusterIdentityDigest: CLUSTER_DIGEST,
    databaseUniverseDigest: UNIVERSE_DIGEST,
    kind: CURRENT187_POSTGRES_SESSION_RECEIPT_KIND,
    positiveProbeDigest: digest(`${purpose}:positive`),
    postgresSessionReceiptDigest: digest(`${purpose}:session-receipt`),
    purpose,
    releaseSha: RELEASE_SHA,
    secretReferenceDigest: digest(`${purpose}:secret-ref`),
    sourceDatabaseIoPerformed: true,
    syntheticOnly: true,
    transportTlsObserved: true,
    ...overrides,
  };
}

function tls(purpose, sessionReceipt, overrides = {}) {
  return {
    authorization: false,
    canMutate: false,
    canSend: false,
    clusterIdentityDigest: CLUSTER_DIGEST,
    databaseUniverseDigest: UNIVERSE_DIGEST,
    endpointTlsPeerReceiptDigest: digest(`${purpose}:tls-receipt`),
    kind: CURRENT187_ENDPOINT_TLS_PEER_RECEIPT_KIND,
    postgresSessionReceiptDigest: sessionReceipt.postgresSessionReceiptDigest,
    purpose,
    releaseSha: RELEASE_SHA,
    syntheticOnly: true,
    tlsCaVerified: true,
    tlsHostnameVerified: true,
    sourceNetworkIoPerformed: true,
    ...overrides,
  };
}

function service(purpose, index, overrides = {}) {
  const sessionReceipt = session(purpose, index);
  return {
    allowedOperationsDigest: digest(`${purpose}:operations`),
    endpointClass: index === 0 ? "POOLER" : "DIRECT_DATABASE",
    endpointTlsPeerReceipt: tls(purpose, sessionReceipt),
    hbaAuthMethod: "scram-sha-256",
    hbaRuleDigest: digest(`${purpose}:hba-rule`),
    negativeConnections: CURRENT187_CONNECTION_NEGATIVE_SCENARIOS.slice(
      0,
      5,
    ).map((scenario) => ({
      caCertificatePem:
        scenario === "PLAINTEXT_TRANSPORT"
          ? null
          : scenario === "WRONG_CA"
            ? "-----BEGIN CERTIFICATE-----\nwrong-ca\n-----END CERTIFICATE-----\n"
            : "-----BEGIN CERTIFICATE-----\nexpected-ca\n-----END CERTIFICATE-----\n",
      challengeDigest: digest(`${purpose}:${scenario}:challenge`),
      clientCertificatePem: null,
      clientCertificateSha256: null,
      clientPrivateKeyPem: null,
      clientPrivateKeySha256: null,
      connectionString: `postgresql://${
        scenario === "WRONG_ROLE" ? `wrong-${index}` : `allowed-${index}`
      }:do-not-leak@localhost:5432/${
        scenario === "WRONG_DATABASE" ? `missing_${index}` : `db_${index}`
      }?sslmode=${
        scenario === "PLAINTEXT_TRANSPORT" ? "disable" : "verify-full"
      }`,
      scenario,
      serverName:
        scenario === "PLAINTEXT_TRANSPORT"
          ? null
          : scenario === "WRONG_HOSTNAME"
            ? "wrong.invalid"
            : "localhost",
    })),
    poolerMappingDigest: digest(`${purpose}:pooler-mapping`),
    poolMode: index === 0 ? "TRANSACTION" : "SESSION",
    postgresSessionReceipt: sessionReceipt,
    purpose,
    tlsMode: "VERIFY_FULL",
    ...overrides,
  };
}

function input(overrides = {}) {
  const hbaReloadReceipt = {
    authorization: false,
    canMutate: false,
    canSend: false,
    clusterIdentityDigest: CLUSTER_DIGEST,
    databaseUniverseDigest: UNIVERSE_DIGEST,
    hbaReloadReceiptDigest: digest("hba-receipt"),
    releaseSha: RELEASE_SHA,
    reloadEpochDigest: digest("hba-reload-epoch"),
    syntheticOnly: true,
  };
  return {
    clusterIdentityDigest: CLUSTER_DIGEST,
    connectTimeoutMs: 1_000,
    databaseUniverseDigest: UNIVERSE_DIGEST,
    environment: "ci",
    hbaReloadReceipt,
    hostControlChallengeDigest: digest("host-control"),
    nonce: digest("nonce"),
    operationId: "11111111-1111-4111-8111-111111111111",
    pgbouncerReceipt: {
      authorization: false,
      canMutate: false,
      canSend: false,
      clusterIdentityDigest: CLUSTER_DIGEST,
      databaseUniverseDigest: UNIVERSE_DIGEST,
      hbaReloadReceiptDigest: hbaReloadReceipt.hbaReloadReceiptDigest,
      pgbouncerReceiptDigest: digest("pgbouncer-receipt"),
      releaseSha: RELEASE_SHA,
      syntheticOnly: true,
      transactionPoolModeObserved: true,
      userCollapseAbsentObserved: true,
    },
    probeRunnerArtifactDigest: digest("runner-artifact"),
    releaseSha: RELEASE_SHA,
    services: CURRENT187_NETWORK_RUNTIME_SERVICE_PURPOSES.map(
      (purpose, index) => service(purpose, index),
    ),
    ...overrides,
  };
}

function context(overrides = {}) {
  return {
    environment: "ci",
    explicitConfirmation:
      CURRENT187_CONNECTION_PROBE_RUNNER_SYNTHETIC_CONFIRMATION,
    nodeEnv: "test",
    ...overrides,
  };
}

function dependencies(overrides = {}) {
  return {
    attemptRejectedConnection: async ({ scenario }) => ({
      connected: false,
      errorCode: `EXPECTED_${scenario}`,
      observedOutcome:
        CURRENT187_CONNECTION_NEGATIVE_OUTCOME_BY_SCENARIO[scenario],
    }),
    now: () => "2026-08-12T12:00:00.000Z",
    ...overrides,
  };
}

async function run(inputValue = input(), dependencyValue = dependencies()) {
  return runSyntheticCurrent187ConnectionProbeMatrixWithDependenciesForTestOnly(
    inputValue,
    dependencyValue,
    context(),
  );
}

async function expectCode(action, code) {
  await assert.rejects(
    action,
    (error) =>
      error instanceof Current187AdmissionContractError &&
      error.code === code &&
      error.reasonCode === code &&
      error.exitCode === 3 &&
      error.safeContractError === true,
  );
}

test("capability runner executes 4 positive bindings and 32 ordered deny probes", async () => {
  const calls = [];
  const receipt = await run(
    input(),
    dependencies({
      attemptRejectedConnection: async (attempt) => {
        calls.push(attempt);
        return {
          connected: false,
          errorCode: `EXPECTED_${attempt.scenario}`,
          observedOutcome:
            CURRENT187_CONNECTION_NEGATIVE_OUTCOME_BY_SCENARIO[
              attempt.scenario
            ],
        };
      },
    }),
  );
  assert.equal(calls.length, 20);
  assert.equal(
    calls.every(
      (call) =>
        call.clientCertificatePem === null && call.clientPrivateKeyPem === null,
    ),
    true,
  );
  assert.equal(receipt.kind, CURRENT187_CONNECTION_PROBE_RUNNER_KIND);
  assert.equal(receipt.status, CURRENT187_CONNECTION_PROBE_RUNNER_STATUS);
  assert.equal(receipt.positiveProbeCount, 4);
  assert.equal(receipt.actualPositiveProbeCount, 4);
  assert.equal(receipt.negativeProbeCount, 32);
  assert.equal(receipt.actualNetworkNegativeProbeCount, 20);
  assert.equal(receipt.controlPolicyNegativeProbeCount, 12);
  assert.equal(receipt.hostControlChallengeDigest, digest("host-control"));
  assert.equal(receipt.nonce, digest("nonce"));
  assert.equal(receipt.operationId, "11111111-1111-4111-8111-111111111111");
  assert.deepEqual(
    receipt.services.map((entry) => entry.purpose),
    CURRENT187_NETWORK_RUNTIME_SERVICE_PURPOSES,
  );
  for (const serviceEntry of receipt.services) {
    assert.deepEqual(
      serviceEntry.negativeProbes.map((entry) => entry.scenario),
      CURRENT187_CONNECTION_NEGATIVE_SCENARIOS,
    );
  }
  assert.equal(isVerifiedCurrent187ConnectionProbeRunnerReceipt(receipt), true);
  assert.equal(
    isVerifiedCurrent187ConnectionProbeRunnerReceipt({ ...receipt }),
    false,
  );
  assert.equal(receipt.authorization, false);
  assert.equal(receipt.canMutate, false);
  assert.equal(receipt.canSend, false);
  assert.equal(receipt.productionRootEnrolled, false);
  assert.equal(receipt.productionRuntimeAttested, false);
  assert.equal(receipt.sharedBetaAccess, false);
  assert.equal(receipt.testAccessAuthorized, false);
  assert.doesNotMatch(
    JSON.stringify(receipt),
    /do-not-leak|postgresql:\/\/|localhost|password|connectionString/iu,
  );
});

test("an allowed negative connection fails closed", async () => {
  await expectCode(
    () =>
      run(
        input(),
        dependencies({
          attemptRejectedConnection: async () => ({
            connected: true,
            errorCode: "NONE",
            observedOutcome: "ALLOWED",
          }),
        }),
      ),
    "CURRENT187_CONNECTION_PROBE_RUNNER_NEGATIVE_ALLOWED",
  );
});

test("unclassified or thrown network failures do not become deny evidence", async () => {
  await expectCode(
    () =>
      run(
        input(),
        dependencies({
          attemptRejectedConnection: async () => ({
            connected: false,
            errorCode: "UNCLASSIFIED",
            observedOutcome: "UNCLASSIFIED_REJECTION",
          }),
        }),
      ),
    "CURRENT187_CONNECTION_PROBE_RUNNER_REJECTION_UNCLASSIFIED",
  );
  await expectCode(
    () =>
      run(
        input(),
        dependencies({
          attemptRejectedConnection: async () => {
            throw new Error("secret-bearing driver error");
          },
        }),
      ),
    "CURRENT187_CONNECTION_PROBE_RUNNER_ATTEMPT_FAILED",
  );
});

test("negative specifications require exact order and transport mode", async () => {
  for (const mutate of [
    (candidate) => candidate.services[0].negativeConnections.reverse(),
    (candidate) => {
      candidate.services[0].negativeConnections[2].connectionString =
        "postgresql://wrong:secret@localhost/db?sslmode=verify-full";
    },
    (candidate) => candidate.services[0].negativeConnections.pop(),
  ]) {
    const candidate = structuredClone(input());
    mutate(candidate);
    await expectCode(
      () => run(candidate),
      mutate.toString().includes("pop")
        ? "CURRENT187_CONNECTION_PROBE_RUNNER_CONNECTIONS_INVALID"
        : "CURRENT187_CONNECTION_PROBE_RUNNER_CONNECTION_INVALID",
    );
  }
});

test("synthetic negative probes reject client credential material", async () => {
  const candidate = structuredClone(input());
  candidate.services[0].negativeConnections[0].clientCertificatePem =
    "-----BEGIN CERTIFICATE-----\nY2xpZW50\n-----END CERTIFICATE-----\n";
  candidate.services[0].negativeConnections[0].clientCertificateSha256 = digest(
    candidate.services[0].negativeConnections[0].clientCertificatePem,
  );
  candidate.services[0].negativeConnections[0].clientPrivateKeyPem =
    "-----BEGIN PRIVATE KEY-----\nUFJJVkFURQ==\n-----END PRIVATE KEY-----\n";
  candidate.services[0].negativeConnections[0].clientPrivateKeySha256 = digest(
    candidate.services[0].negativeConnections[0].clientPrivateKeyPem,
  );
  await expectCode(
    () => run(candidate),
    "CURRENT187_CONNECTION_PROBE_RUNNER_CONNECTION_INVALID",
  );
});

test("negative scenarios isolate endpoint, role, database, CA, and hostname dimensions", async () => {
  for (const mutate of [
    (candidate) => {
      candidate.services[0].negativeConnections[0].connectionString =
        candidate.services[0].negativeConnections[2].connectionString.replace(
          "sslmode=disable",
          "sslmode=verify-full",
        );
    },
    (candidate) => {
      candidate.services[0].negativeConnections[3].caCertificatePem =
        candidate.services[0].negativeConnections[0].caCertificatePem;
    },
    (candidate) => {
      candidate.services[0].negativeConnections[4].serverName =
        candidate.services[0].negativeConnections[0].serverName;
    },
    (candidate) => {
      candidate.services[0].negativeConnections[1].connectionString =
        candidate.services[0].negativeConnections[1].connectionString.replace(
          ":5432/",
          ":5433/",
        );
    },
  ]) {
    const candidate = structuredClone(input());
    mutate(candidate);
    await expectCode(
      () => run(candidate),
      "CURRENT187_CONNECTION_PROBE_RUNNER_SCENARIO_BINDING_INVALID",
    );
  }
});

test("positive receipt and service identity drift fail before network effects", async () => {
  for (const mutate of [
    (candidate) => {
      candidate.services[0].endpointTlsPeerReceipt.postgresSessionReceiptDigest =
        digest("wrong-session");
    },
    (candidate) => {
      candidate.services[1].postgresSessionReceipt.applicationNameDigest =
        candidate.services[0].postgresSessionReceipt.applicationNameDigest;
    },
    (candidate) => {
      candidate.pgbouncerReceipt.hbaReloadReceiptDigest = digest("wrong-hba");
    },
  ]) {
    let calls = 0;
    const candidate = structuredClone(input());
    mutate(candidate);
    await assert.rejects(() =>
      run(
        candidate,
        dependencies({
          attemptRejectedConnection: async () => {
            calls += 1;
            throw new Error("must not run");
          },
        }),
      ),
    );
    assert.equal(calls, 0);
  }
});

test("production entry rejects unbranded receipts before network effects", async () => {
  const candidate = input({ environment: "production" });
  await expectCode(
    () => runCurrent187ConnectionProbeMatrix(candidate),
    "CURRENT187_CONNECTION_PROBE_RUNNER_CONTROL_RECEIPT_INVALID",
  );
});

test("synthetic capability context is explicit and exact", async () => {
  await expectCode(
    () =>
      runSyntheticCurrent187ConnectionProbeMatrixWithDependenciesForTestOnly(
        input(),
        dependencies(),
        context({ nodeEnv: "production" }),
      ),
    "CURRENT187_CONNECTION_PROBE_RUNNER_SYNTHETIC_CONTEXT_DENIED",
  );
  await expectCode(
    () =>
      runSyntheticCurrent187ConnectionProbeMatrixWithDependenciesForTestOnly(
        input(),
        dependencies(),
        { ...context(), extra: true },
      ),
    "CURRENT187_CONNECTION_PROBE_RUNNER_SYNTHETIC_CONTEXT_DENIED",
  );
});

test("dependency accessors and proxy values are rejected", async () => {
  const accessor = {};
  Object.defineProperty(accessor, "attemptRejectedConnection", {
    enumerable: true,
    get() {
      throw new Error("accessor must not run");
    },
  });
  Object.defineProperty(accessor, "now", {
    enumerable: true,
    value: () => "2026-08-12T12:00:00.000Z",
  });
  await expectCode(
    () => run(input(), accessor),
    "CURRENT187_CONNECTION_PROBE_RUNNER_DEPENDENCIES_INVALID",
  );
  await expectCode(
    () => run(input(), new Proxy(dependencies(), {})),
    "CURRENT187_CONNECTION_PROBE_RUNNER_DEPENDENCIES_INVALID",
  );
});

test("production runner source has no signer, key, filesystem, process, Prisma, or env capability", async () => {
  const source = await readFile(
    new URL(
      "./identity-mail-cluster-connection-probe-runner-current187.mjs",
      import.meta.url,
    ),
    "utf8",
  );
  assert.doesNotMatch(source, /createPrivateKey|generateKeyPair|signPayload/iu);
  assert.doesNotMatch(source, /node:fs|node:child_process|PrismaClient/iu);
  assert.doesNotMatch(
    source,
    /process\.env|PRIVATE_KEY_PATH|SIGNING_KEY|readFile|readFileSync/iu,
  );
  assert.doesNotMatch(source, /statement_timeout/u);
  assert.match(source, /new pg\.Client/gu);
});
